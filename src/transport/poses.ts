/*
 * Pose evaluation: domain state + virtual time → world poses. Pure functions of the session;
 * nothing here advances time or keeps history, so pause, fault freeze and replay are exact.
 */
import { STATION_META } from '../domain/config';
import { BELT_SPEED, LANE_SPEC, TRANSFER_LEN, posAt, visibleIn } from '../domain/conveyor';
import { unitOf } from '../domain/core';
import { effectiveStatus } from '../domain/kpis';
import { STATION_IDS, type Session, type StationId, type Unit } from '../domain/types';
import { depthKey, restPose, type MachinePose } from '../vector/builder';
import { CASE } from '../vector/figures';
import { clamp, type V3 } from '../vector/iso';
import { CASE_FEED, EXIT_DIR, EXIT_RUN, IN_LANE, OUT_LANE, PALLET_LANES, REJECT_LANES, TRANSFER_LANE } from './graph';
import { toWorld } from './layout';
import { inVisible, outVisible } from './queueLayout';
import { robotJoints, robotKit, robotPhase } from './robotChoreography';

export type Presentation = 'kit' | 'carton';

export interface UnitPose {
  id: string;
  at: V3;
  kind: Presentation;
  key: number;
}

export interface CasePose {
  id: string;
  at: V3;
  open: boolean;
  fill: number;
}

export const CASE_SPEED = 60;
const CASE_DROP = 0.5;
const REJECT_SHOWN = 1.0;

/** Job progress → mechanics progress: the cycle's first part is the unit travelling to the work point. */
export function mechanics(s: Session, id: StationId): { m: number | null; done: boolean; p: number | null } {
  const j = s.stations[id].current;
  if (!j) return { m: null, done: false, p: null };
  const p = j.done ? 1 : j.finishAt !== null ? clamp((s.t - j.startAt) / j.duration, 0, 1) : clamp(1 - j.remaining / j.duration, 0, 1);
  const pa = clamp(j.travel / j.duration, 0, 0.6);
  return { m: clamp((p - pa) / (1 - pa), 0, 1), done: j.done, p };
}

export function machinePose(s: Session, id: StationId, hover: number): MachinePose {
  const { m, done } = mechanics(s, id);
  const pose: MachinePose = { ...restPose(), m, done, status: effectiveStatus(s, id), hover };
  if (id === 'intake') {
    const left = s.units.length - s.releaseCursor;
    pose.supply = left > 40 ? 3 : left > 10 ? 2 : left > 0 ? 1 : 0;
  } else if (id === 'qa') {
    const last = s.rejectTray[s.rejectTray.length - 1];
    const at = last ? unitOf(s, last).rejectedAt : null;
    pose.rejectAge = at !== null && s.t - at < REJECT_SHOWN ? s.t - at : null;
  } else if (id === 'robot') {
    pose.robot = robotJoints(m);
  }
  return pose;
}

const trackPos = (s: Session, u: Unit) => (u.track ? posAt(u.track, s.t) : 0);
const inPose = (s: Session, id: StationId, u: Unit) => IN_LANE[id].poseAt(LANE_SPEC[id].inLen - trackPos(s, u));
const outPose = (s: Session, id: StationId, u: Unit) => OUT_LANE[id].poseAt(LANE_SPEC[id].exitLen - trackPos(s, u));

function machineUnitAt(s: Session, id: StationId, u: Unit): V3 | null {
  if (trackPos(s, u) > 1e-6) return inPose(s, id, u);
  const { m, done } = mechanics(s, id);
  if (id === 'robot') return toWorld('robot', robotKit(m ?? 0));
  if (id === 'dispatch') return done ? null : CASE_FEED.poseAt((m ?? 0) * CASE_FEED.length);
  return IN_LANE[id].poseAt(LANE_SPEC[id].inLen);
}

function transferAt(s: Session, unitId: string): V3 | null {
  const tr = s.transfers.find((x) => x.unitId === unitId);
  if (!tr) return null;
  const k = clamp((s.t - tr.startAt) / Math.max(1e-6, tr.finishAt - tr.startAt), 0, 1);
  return TRANSFER_LANE[tr.from].poseAt(TRANSFER_LEN * k);
}

function trayAt(s: Session, u: Unit, idx: number): V3 {
  return REJECT_LANES[idx % REJECT_LANES.length].poseAt(BELT_SPEED * Math.max(0, s.t - (u.rejectedAt ?? s.t)));
}

const mk = (u: Unit, at: V3): UnitPose => ({ id: u.id, at, kind: u.packaged ? 'carton' : 'kit', key: depthKey(at[0], at[1], at[2]) });

/** Every unit that is physically visible this frame. */
export function frameUnits(s: Session): UnitPose[] {
  const out: UnitPose[] = [];
  for (const id of STATION_IDS) {
    const st = s.stations[id];
    st.inQ.forEach((uid, i) => {
      if (inVisible(s, id, i)) {
        const u = unitOf(s, uid);
        out.push(mk(u, inPose(s, id, u)));
      }
    });
    if (st.current) {
      const u = unitOf(s, st.current.unitId);
      const at = machineUnitAt(s, id, u);
      if (at) out.push(mk(u, at));
    }
    st.outQ.forEach((uid, i) => {
      if (outVisible(s, id, i)) {
        const u = unitOf(s, uid);
        out.push(mk(u, outPose(s, id, u)));
      }
    });
  }
  for (const tr of s.transfers) {
    const at = transferAt(s, tr.unitId);
    if (at) out.push(mk(unitOf(s, tr.unitId), at));
  }
  const n = s.rejectTray.length;
  for (let i = Math.max(0, n - REJECT_LANES.length); i < n; i++) {
    const u = unitOf(s, s.rejectTray[i]);
    out.push(mk(u, trayAt(s, u, i)));
  }
  return out;
}

/** World pose of one unit, or null when it is not drawn (unreleased, overflow, in a case, shipped). */
export function unitPose(s: Session, u: Unit): UnitPose | null {
  return frameUnits(s).find((p) => p.id === u.id) ?? null;
}

/* ---------------------------------------------------------------- cases */

const palletAt = (k: number, since: number): V3 => {
  const lane = PALLET_LANES[k % PALLET_LANES.length];
  return lane.poseAt(CASE_SPEED * Math.max(0, since));
};

export function casePoses(s: Session): CasePose[] {
  const out: CasePose[] = [];
  const open = s.cases.find((c) => c.id === s.openCaseId);
  if (open) {
    const d = clamp((s.t - open.openedAt) / CASE_DROP, 0, 1);
    const at = toWorld('dispatch', CASE.loader);
    out.push({ id: open.id, at: [at[0], at[1], at[2] + 18 * (1 - d) * (1 - d)], open: true, fill: open.unitIds.length / 12 });
  }
  let k = 0;
  for (const c of s.cases) {
    if (c.status !== 'sealed') continue;
    if (k < PALLET_LANES.length) out.push({ id: c.id, at: palletAt(k, s.t - (c.sealedAt ?? s.t)), open: false, fill: 1 });
    k++;
  }
  const exitSec = EXIT_RUN / CASE_SPEED;
  for (let i = s.shipments.length - 1; i >= 0 && s.t - s.shipments[i].at < exitSec; i--) {
    const sh = s.shipments[i];
    sh.caseIds.forEach((cid, j) => {
      const c = s.cases.find((x) => x.id === cid);
      if (!c || j >= PALLET_LANES.length) return;
      const start = palletAt(j, sh.at - (c.sealedAt ?? sh.at));
      out.push({ id: c.id, at: [start[0] + EXIT_DIR * CASE_SPEED * (s.t - sh.at), start[1], start[2]], open: false, fill: 1 });
    });
  }
  return out;
}

/* ---------------------------------------------------------------- follow product */

export interface UnitStory {
  stage: string;
  substep: string;
  station: StationId | null;
}

export function describeUnit(s: Session, u: Unit): UnitStory {
  const name = (id: StationId) => STATION_META[id].name;
  switch (u.slot) {
    case 'none':
      return { stage: 'Not released', substep: 'Waiting in the batch for intake release', station: null };
    case 'in': {
      const st = s.stations[u.station!];
      const i = st.inQ.indexOf(u.id);
      const where = inVisible(s, u.station!, i) ? `slot ${i + 1}` : `position ${i + 1}, waiting at the infeed (${visibleIn(u.station!)} shown)`;
      return { stage: name(u.station!), substep: `Input buffer, ${where}`, station: u.station };
    }
    case 'machine': {
      const id = u.station!;
      const { m, done } = mechanics(s, id);
      if (trackPos(s, u) > 1e-6) return { stage: name(id), substep: 'Moving onto the work point', station: id };
      if (done) return { stage: name(id), substep: 'Cycle done, waiting for output space', station: id };
      if (id === 'robot') return { stage: name(id), substep: `Robot ${robotPhase(m)}`, station: id };
      if (id === 'dispatch') return { stage: name(id), substep: 'Loading into the open case', station: id };
      return { stage: name(id), substep: `Processing, ${Math.round((m ?? 0) * 100)}%`, station: id };
    }
    case 'out': {
      const st = s.stations[u.station!];
      const i = st.outQ.indexOf(u.id);
      const moving = trackPos(s, u) > 1e-6;
      return { stage: name(u.station!), substep: moving ? 'Moving to the out port' : i === 0 ? 'At the out port, waiting for the next station' : `Output buffer, position ${i + 1}`, station: u.station };
    }
    case 'transfer': {
      const tr = s.transfers.find((x) => x.unitId === u.id);
      return { stage: 'Transfer', substep: tr ? `${tr.transferId} to ${name(tr.to)}` : 'In transfer', station: tr?.from ?? u.station };
    }
    case 'tray':
      return { stage: name('qa'), substep: 'Rejected, diverted to the reject tray', station: 'qa' };
    case 'staged':
      return { stage: name('dispatch'), substep: `Grouped in case ${u.caseId}`, station: 'dispatch' };
    case 'shipped':
      return { stage: 'Shipped', substep: `Left on ${u.shipmentId}`, station: null };
  }
}
