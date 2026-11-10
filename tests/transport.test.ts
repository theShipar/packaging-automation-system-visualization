import { describe, expect, it } from 'vitest';
import { BELT_SPEED, SLOT } from '../src/domain/conveyor';
import { unitOf } from '../src/domain/core';
import { advance, createSession, dispatchCommand } from '../src/domain/engine';
import { checkInvariants, sessionHash } from '../src/domain/invariants';
import { unitCounts } from '../src/domain/kpis';
import { completeTransfer } from '../src/domain/transfer';
import { STATION_IDS, type Session, type StationId } from '../src/domain/types';
import { CASE_FEED, IN_LANE, REJECT_LANES, TRANSFER_LANE } from '../src/transport/graph';
import { PORTS, lanePoint } from '../src/transport/layout';
import { frameUnits, machinePose, mechanics, type UnitPose } from '../src/transport/poses';
import { queueBadges } from '../src/transport/queueLayout';
import { robotKit, robotPhase } from '../src/transport/robotChoreography';
import { KIT } from '../src/vector/sceneModel';
import { CASE } from '../src/vector/figures';
import type { V3 } from '../src/vector/iso';

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const FRAME = 1 / 30;
const EPS = 1e-6;
/** Steepest fixture ramp (8 across, 6 up) stretches belt travel by this factor in 3-D. */
const RAMP_STRETCH = 1.25;

const ARM_GAIN = (() => {
  let worst = 0;
  for (let k = 1; k <= 20000; k++) worst = Math.max(worst, dist(robotKit(k / 20000), robotKit((k - 1) / 20000)) * 20000);
  return worst;
})();

function start(seed: number, config?: NonNullable<Parameters<typeof createSession>[0]>['config']) {
  const s = createSession({ seed, config });
  dispatchCommand(s, { kind: 'START' });
  return s;
}

function stepTo(s: Session, t: number) {
  while (s.t < t - 1e-9 && s.status === 'running') advance(s, Math.min(t, s.t + FRAME));
}

function poses(s: Session) {
  return new Map(frameUnits(s).map((u) => [u.id, u]));
}

/** One frame of belt travel: a unit can hide or reveal part-way through a frame. */
const STEP = BELT_SPEED * RAMP_STRETCH * FRAME + EPS;

/** Mouths are the only places a unit may appear or disappear on the main line. */
function atMouth(at: V3) {
  for (const id of STATION_IDS) {
    if (dist(at, lanePoint(PORTS[id].in)) < STEP) return true;
    if (id !== 'dispatch' && dist(at, lanePoint(PORTS[id].out)) < STEP) return true;
  }
  return false;
}
const inFeeder = (at: V3) => Math.abs(at[1]) < EPS && at[0] >= PORTS.intake.in - EPS && at[0] <= PORTS.intake.in + SLOT + 1 + STEP;
/** Below the rim of the open case: the kit is inside it. */
const inCase = (at: V3) => Math.hypot(at[0] - CASE_FEED.to[0], at[1] - CASE_FEED.to[1]) < EPS && at[2] <= CASE_FEED.to[2] + CASE.H;
const inTray = (at: V3) => REJECT_LANES.some((l) => dist(at, l.to) < EPS);

interface SweepReport {
  frames: number;
  maxRatio: number;
  overlaps: string[];
  pops: string[];
  pausedMoves: number;
}

/**
 * Runs a session frame by frame and checks every visible unit:
 * displacement within belt / arm / feed speed, no overlap on the main lane, appear and
 * disappear only at mouths, nothing moves while paused.
 */
function sweep(s: Session, until: number, onFrame?: (s: Session, f: number) => void): SweepReport {
  const r: SweepReport = { frames: 0, maxRatio: 0, overlaps: [], pops: [], pausedMoves: 0 };
  let last = poses(s);
  let lastM = Object.fromEntries(STATION_IDS.map((id) => [id, mechanics(s, id)]));
  let lastT = s.t;
  for (let f = 0; s.t < until && f < 1e6; f++) {
    onFrame?.(s, f);
    const paused = s.status !== 'running';
    if (!paused) advance(s, Math.min(until, s.t + FRAME));
    else advance(s, s.t + FRAME);
    const now = poses(s);
    const m = Object.fromEntries(STATION_IDS.map((id) => [id, mechanics(s, id)]));
    const dt = s.t - lastT;
    for (const [id, p] of now) {
      const was = last.get(id);
      if (!was) {
        if (!atMouth(p.at) && !inFeeder(p.at)) r.pops.push(`appear ${id} t=${s.t.toFixed(3)} at ${p.at.map((v) => v.toFixed(2))}`);
        continue;
      }
      const d = dist(p.at, was.at);
      if (paused) {
        if (d > 0) r.pausedMoves++;
        continue;
      }
      const u = unitOf(s, id);
      let bound = BELT_SPEED * RAMP_STRETCH * dt;
      if (u.slot === 'machine' && u.station === 'robot') bound = Math.max(bound, ARM_GAIN * Math.abs((m.robot.m ?? 0) - (lastM.robot.m ?? 0)));
      if (u.slot === 'machine' && u.station === 'dispatch') bound = Math.max(bound, CASE_FEED.length * Math.abs((m.dispatch.m ?? 0) - (lastM.dispatch.m ?? 0)));
      const ratio = d / (bound + EPS);
      r.maxRatio = Math.max(r.maxRatio, ratio);
      if (d > bound + EPS) r.pops.push(`jump ${id} ${d.toFixed(3)} > ${bound.toFixed(3)} t=${s.t.toFixed(3)} slot=${u.slot}@${u.station}`);
    }
    for (const [id, p] of last) {
      if (now.has(id)) continue;
      if (!atMouth(p.at) && !inCase(p.at) && !inTray(p.at)) r.pops.push(`vanish ${id} t=${s.t.toFixed(3)} at ${p.at.map((v) => v.toFixed(2))}`);
    }
    r.overlaps.push(...mainLaneOverlaps([...now.values()], s));
    last = now;
    lastM = m;
    lastT = s.t;
    r.frames++;
  }
  return r;
}

function mainLaneOverlaps(units: UnitPose[], s: Session): string[] {
  const lane = units.filter((u) => Math.abs(u.at[1]) < 1e-6 && !(unitOf(s, u.id).slot === 'machine' && unitOf(s, u.id).station === 'robot')).sort((a, b) => a.at[0] - b.at[0]);
  const out: string[] = [];
  for (let i = 1; i < lane.length; i++) {
    const a = lane[i - 1], b = lane[i];
    if (b.at[0] - a.at[0] < KIT.L - 1e-6) out.push(`${a.id}/${b.id} gap ${(b.at[0] - a.at[0]).toFixed(3)} at x=${a.at[0].toFixed(1)} t=${s.t.toFixed(3)}`);
  }
  return out;
}

describe('transport continuity sweep', () => {
  it('no teleports, no lane overlaps, no pops, nothing moves while paused', () => {
    const s = start(42, { qa: { defectRate: 0.06 } });
    let jam: string | null = null;
    let pausedFrames = 0;
    const r = sweep(s, 1200, (ss) => {
      if (ss.t > 300 && !jam && ss.status === 'running') {
        expect(dispatchCommand(ss, { kind: 'INJECT_FAULT', code: 'PKG_JAM' }).ok).toBe(true);
        jam = ss.faults[ss.faults.length - 1].id;
      }
      const f = jam ? ss.faults.find((x) => x.id === jam)! : null;
      if (f && ss.t > 420 && f.status === 'active') {
        dispatchCommand(ss, { kind: 'ACK_FAULT', faultId: f.id });
        dispatchCommand(ss, { kind: 'CREATE_WORK_ORDER', faultId: f.id });
        dispatchCommand(ss, { kind: 'PAUSE' });
        dispatchCommand(ss, { kind: 'START_WORK_ORDER', workOrderId: f.workOrderId! });
      }
      if (f && f.status === 'repairInProgress' && ss.status === 'paused' && pausedFrames++ > 90) {
        dispatchCommand(ss, { kind: 'RESOLVE_FAULT', faultId: f.id });
        dispatchCommand(ss, { kind: 'RESUME' });
      }
    });
    expect(r.frames).toBeGreaterThan(30 * 1100);
    expect(r.pops.slice(0, 10)).toEqual([]);
    expect(r.overlaps.slice(0, 10)).toEqual([]);
    expect(r.pausedMoves).toBe(0);
    expect(checkInvariants(s)).toEqual([]);
    expect(s.rejectTray.length).toBeGreaterThan(3);
    expect(s.shipments.length).toBeGreaterThan(0);
  });

  it.each([1, 842, 2024])('holds for seed %i with a robot fault and recovery', (seed) => {
    const s = start(seed, { qa: { defectRate: 0.04 } });
    let fid: string | null = null;
    const r = sweep(s, 900, (ss) => {
      if (!fid && ss.t > 200 && ss.status === 'running') {
        dispatchCommand(ss, { kind: 'INJECT_FAULT', code: 'ROB_JOINT_TIMEOUT' });
        fid = ss.faults[ss.faults.length - 1].id;
      }
      const f = fid ? ss.faults.find((x) => x.id === fid)! : null;
      if (f && f.status === 'active' && ss.t > 260) {
        dispatchCommand(ss, { kind: 'ACK_FAULT', faultId: f.id });
        dispatchCommand(ss, { kind: 'CREATE_WORK_ORDER', faultId: f.id });
        dispatchCommand(ss, { kind: 'PAUSE' });
        dispatchCommand(ss, { kind: 'START_WORK_ORDER', workOrderId: f.workOrderId! });
        dispatchCommand(ss, { kind: 'RESOLVE_FAULT', faultId: f.id });
        dispatchCommand(ss, { kind: 'RESUME' });
      }
    });
    expect(r.pops.slice(0, 10)).toEqual([]);
    expect(r.overlaps.slice(0, 10)).toEqual([]);
    expect(checkInvariants(s)).toEqual([]);
    expect(s.faults.find((x) => x.id === fid)?.status).toBe('recovered');
  });
});

describe('transfer protocol', () => {
  it('TRANS-001 one owner per unit and reserve → start → complete per transfer', () => {
    const s = start(7);
    for (let t = 30; t <= 900; t += 30) {
      stepTo(s, t);
      expect(checkInvariants(s)).toEqual([]);
      const ids = frameUnits(s).map((u) => u.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const byId = new Map<string, string[]>();
    for (const e of s.events) {
      if (!e.type.startsWith('TRANSFER_')) continue;
      const id = (e.payload as { transferId: string }).transferId;
      byId.set(id, [...(byId.get(id) ?? []), e.type]);
    }
    expect(byId.size).toBeGreaterThan(100);
    for (const [id, seq] of byId) {
      const inFlight = s.transfers.some((x) => x.transferId === id);
      expect(seq, id).toEqual(inFlight ? ['TRANSFER_RESERVED', 'TRANSFER_STARTED'] : ['TRANSFER_RESERVED', 'TRANSFER_STARTED', 'TRANSFER_COMPLETED']);
    }
    expect(s.events.some((e) => e.type === 'TRANSFER_CANCELLED')).toBe(false);
    const u = s.units.find((x) => x.state === 'dispatched')!;
    const hops = s.events.filter((e) => e.type === 'TRANSFER_COMPLETED' && e.unitId === u.id).map((e) => (e.payload as { to: StationId }).to);
    expect(hops).toEqual(['assembly', 'robot', 'qa', 'packaging', 'dispatch']);
  });

  it('TRANS-002 completing a transfer twice changes nothing', () => {
    const s = start(3);
    stepTo(s, 40);
    while (!s.transfers.length) advance(s, s.t + 0.01);
    const tr = s.transfers[0];
    expect(completeTransfer(s, tr.transferId)).toBe(true);
    const h = sessionHash(s);
    const inQ = [...s.stations[tr.to].inQ];
    expect(completeTransfer(s, tr.transferId)).toBe(false);
    expect(completeTransfer(s, 'TR-999999')).toBe(false);
    expect(sessionHash(s)).toBe(h);
    expect(s.stations[tr.to].inQ).toEqual(inQ);
    stepTo(s, tr.finishAt + 1);
    expect(s.stations[tr.to].inQ.filter((x) => x === tr.unitId).length + (s.stations[tr.to].current?.unitId === tr.unitId ? 1 : 0)).toBeLessThanOrEqual(1);
    expect(s.events.filter((e) => e.type === 'TRANSFER_COMPLETED' && (e.payload as { transferId: string }).transferId === tr.transferId)).toHaveLength(1);
    expect(checkInvariants(s)).toEqual([]);
  });

  it('TRANS-003 buffers never exceed capacity, reserved slots included', () => {
    const s = start(842);
    stepTo(s, 200);
    dispatchCommand(s, { kind: 'INJECT_FAULT', code: 'PKG_JAM' });
    for (let f = 0; f < 30 * 400; f++) {
      advance(s, s.t + FRAME);
      for (const id of STATION_IDS) {
        const st = s.stations[id];
        expect(st.inQ.length + st.incoming, id).toBeLessThanOrEqual(s.config[id].bufferIn);
        expect(st.outQ.length, id).toBeLessThanOrEqual(s.config[id].bufferOut);
      }
    }
    expect(s.stations.qa.status).toBe('blocked');
  });

  it('TRANS-004 a fault mid-carry freezes the job, the arm and the kit', () => {
    const s = start(11);
    stepTo(s, 60);
    while (robotPhase(mechanics(s, 'robot').m) !== 'carry') advance(s, s.t + 0.005);
    expect(dispatchCommand(s, { kind: 'INJECT_FAULT', code: 'ROB_VACUUM_LOSS' }).ok).toBe(true);
    const job = s.stations.robot.current!;
    const remaining = job.remaining;
    const kit = frameUnits(s).find((u) => u.id === job.unitId)!.at;
    const arm = machinePose(s, 'robot', 0).robot;
    stepTo(s, s.t + 30);
    expect(s.stations.robot.current!.remaining).toBe(remaining);
    expect(frameUnits(s).find((u) => u.id === job.unitId)!.at).toEqual(kit);
    expect(machinePose(s, 'robot', 0).robot).toEqual(arm);
    const raised = s.events.find((e) => e.type === 'FAULT_RAISED')!;
    expect((raised.payload as { remainingCycleSec: number }).remainingCycleSec).toBeCloseTo(remaining, 6);
  });

  it('TRANS-005 pause at 43% along a transfer lane holds the exact pose', () => {
    const s = start(5);
    stepTo(s, 50);
    while (!s.transfers.length) advance(s, s.t + 0.001);
    const tr = s.transfers[0];
    const at43 = tr.startAt + 0.43 * (tr.finishAt - tr.startAt);
    advance(s, at43);
    dispatchCommand(s, { kind: 'PAUSE' });
    const expected = TRANSFER_LANE[tr.from].poseAt(0.43 * TRANSFER_LANE[tr.from].length);
    const held = frameUnits(s).find((u) => u.id === tr.unitId)!.at;
    expect(dist(held, expected)).toBeLessThan(1e-6);
    const before = JSON.stringify(frameUnits(s));
    advance(s, s.t + 60);
    expect(JSON.stringify(frameUnits(s))).toBe(before);
    dispatchCommand(s, { kind: 'RESUME' });
    advance(s, tr.finishAt);
    expect(dist(frameUnits(s).find((u) => u.id === tr.unitId)!.at, IN_LANE[tr.to].from)).toBeLessThan(1e-6);
  });

  it('TRANS-006 same seed gives the same poses frame by frame; reset starts clean', () => {
    const a = start(9), b = start(9);
    for (let t = 1; t <= 300; t += 1.5) {
      stepTo(a, t);
      stepTo(b, t);
      expect(JSON.stringify(frameUnits(a))).toBe(JSON.stringify(frameUnits(b)));
    }
    const fresh = createSession({ seed: 9 });
    expect(frameUnits(fresh)).toEqual([]);
    expect(fresh.transfers).toEqual([]);
  });

  it('TRANS-007 rejects only travel the reject chute and never reach packaging or dispatch', () => {
    const s = start(21, { qa: { defectRate: 0.1 } });
    const seen = new Set<string>();
    for (let f = 0; f < 30 * 600; f++) {
      advance(s, s.t + FRAME);
      for (const p of frameUnits(s)) {
        const u = unitOf(s, p.id);
        if (u.state !== 'rejected') continue;
        seen.add(u.id);
        expect(u.slot).toBe('tray');
        expect(p.kind).toBe('kit');
        const onChute = REJECT_LANES.some((l) => {
          for (let k = 0; k <= 400; k++) if (dist(l.poseAt((l.length * k) / 400), p.at) < l.length / 400 + 1e-6) return true;
          return false;
        });
        expect(onChute, `${u.id} t=${s.t}`).toBe(true);
      }
    }
    expect(seen.size).toBeGreaterThan(5);
    for (const u of s.units.filter((x) => x.state === 'rejected')) {
      expect(u.packaged).toBe(false);
      expect(u.caseId).toBeNull();
      expect(s.events.some((e) => e.unitId === u.id && e.type === 'TRANSFER_COMPLETED' && ['packaging', 'dispatch'].includes((e.payload as { to: string }).to))).toBe(false);
    }
  });

  it('TRANS-008 packaging consumes one carton per unit, once', () => {
    const s = start(4);
    for (let t = 20; t <= 900; t += 20) {
      stepTo(s, t);
      expect(s.materials.retailCarton.consumed).toBe(unitCounts(s).packaged);
      for (const p of frameUnits(s)) expect(p.kind === 'carton').toBe(unitOf(s, p.id).packaged);
    }
    const starts = s.events.filter((e) => e.type === 'STATION_CYCLE_STARTED' && e.stationId === 'packaging').map((e) => e.unitId);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('TRANS-009 every closed case holds 12 distinct packaged units', () => {
    const s = start(6);
    stepTo(s, 1500);
    const owner = new Map<string, string>();
    const closed = s.cases.filter((c) => c.status !== 'open');
    expect(closed.length).toBeGreaterThan(3);
    for (const c of closed) {
      expect(new Set(c.unitIds).size).toBe(12);
      for (const id of c.unitIds) {
        expect(owner.has(id)).toBe(false);
        owner.set(id, c.id);
        const u = unitOf(s, id);
        expect(u.caseId).toBe(c.id);
        expect(u.packaged && u.qaPassed).toBe(true);
      }
    }
  });

  it('TRANS-010 drawn units plus overflow badges account for every unit on the line', () => {
    const s = start(13);
    stepTo(s, 120);
    dispatchCommand(s, { kind: 'INJECT_FAULT', code: 'PKG_JAM' });
    for (let t = 125; t <= 600; t += 5) {
      stepTo(s, t);
      let onLine = s.transfers.length;
      for (const id of STATION_IDS) {
        const st = s.stations[id];
        onLine += st.inQ.length + st.outQ.length + (st.current ? 1 : 0);
      }
      const drawn = frameUnits(s).filter((p) => unitOf(s, p.id).slot !== 'tray').length;
      const badges = queueBadges(s).reduce((a, b) => a + b.count, 0);
      const dsp = s.stations.dispatch.current;
      const undrawnDone = dsp && dsp.done ? 1 : 0;
      expect(drawn + badges + undrawnDone, `t=${t}`).toBe(onLine);
      const c = unitCounts(s);
      expect(c.unreleased + c.wip + c.rejected + c.dispatched).toBe(2400);
    }
  });
});
