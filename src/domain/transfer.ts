/*
 * Station-to-station handover: reserve → start → complete, one transfer id per hop.
 * A transfer starts only when the head unit has physically reached the out port and the
 * receiver has an input slot and is not under maintenance. Completion is idempotent.
 */
import { STATION_META } from './config';
import { LANE_SPEC, SLOT, TRANSFER_LEN, arrivalAt, inTarget, mouthClearAt, outTarget, posAt, visibleIn } from './conveyor';
import { emit, nextId, place, push, r6, unitOf } from './core';
import { STATION_IDS, type Session, type StationId, type Track, type Unit } from './types';

/** Rebase a unit's belt track at the current instant and give it a new target; a hold at the mouth is kept. */
export function setTrack(s: Session, u: Unit, target: number) {
  const pos = u.track ? posAt(u.track, s.t) : target;
  u.track = { pos, at: u.track && u.track.at > s.t ? u.track.at : s.t, target };
}

/** Track of the unit just ahead of infeed index i: the previous queued unit, or the one riding into the machine. */
function aheadOf(s: Session, id: StationId, i: number): Track | null {
  const st = s.stations[id];
  if (i > 0) return unitOf(s, st.inQ[i - 1]).track;
  return st.current ? unitOf(s, st.current.unitId).track : null;
}

/**
 * A unit entering the drawn infeed from the mouth waits there until the unit ahead is a slot
 * clear, and never sets off while an incoming transfer is in its last slot before the mouth.
 */
export function holdAtMouth(s: Session, id: StationId, i: number) {
  const u = unitOf(s, s.stations[id].inQ[i]);
  if (!u.track || i >= visibleIn(id) || posAt(u.track, s.t) < LANE_SPEC[id].inLen - 1e-9) return;
  let clear = mouthClearAt(id, aheadOf(s, id, i), s.t);
  for (let moved = true; moved; ) {
    moved = false;
    for (const tr of s.transfers) {
      if (tr.to !== id) continue;
      const near = tr.startAt + (1 - SLOT / TRANSFER_LEN) * (tr.finishAt - tr.startAt);
      if (clear > near - 1e-9 && clear < tr.finishAt - 1e-9) {
        clear = tr.finishAt;
        moved = true;
      }
    }
  }
  if (clear > u.track.at + 1e-9) u.track = { pos: LANE_SPEC[id].inLen, at: clear, target: u.track.target };
}

export function retargetIn(s: Session, id: StationId) {
  s.stations[id].inQ.forEach((uid, i) => {
    setTrack(s, unitOf(s, uid), inTarget(id, i));
    holdAtMouth(s, id, i);
  });
}

/** When the last unit to leave this out port will be a full slot down the connector. */
export function portClearAt(s: Session, id: StationId): number {
  let at = s.t;
  for (const tr of s.transfers) if (tr.from === id) at = Math.max(at, tr.startAt + (SLOT / TRANSFER_LEN) * (tr.finishAt - tr.startAt));
  return at;
}

export function retargetOut(s: Session, id: StationId) {
  const q = s.stations[id].outQ;
  q.forEach((uid, i) => setTrack(s, unitOf(s, uid), outTarget(id, i, q.length)));
}

export const receiverLocked = (s: Session, to: StationId) => s.faults.some((f) => f.station === to && f.status === 'repairInProgress');

/** One pending wake-up per station, at the instant its out-port head arrives. */
function wake(s: Session, id: StationId, at: number) {
  const st = s.stations[id];
  if (st.wakeAt !== null && st.wakeAt > s.t - 1e-9 && st.wakeAt <= at + 1e-9) return;
  st.wakeAt = Math.ceil(at * 1e6 - 1e-6) / 1e6;
  push(s, 'READY', st.wakeAt, { station: id });
}

export function tryTransfer(s: Session, i: number): boolean {
  const id = STATION_IDS[i];
  if (id === 'dispatch') return false;
  const st = s.stations[id];
  if (!st.outQ.length) return false;
  const to = STATION_IDS[i + 1];
  const nx = s.stations[to];
  if (nx.inQ.length + nx.incoming >= s.config[to].bufferIn) return false;
  if (receiverLocked(s, to)) return false;
  const u = unitOf(s, st.outQ[0]);
  if (u.track && posAt(u.track, s.t) > 1e-6) {
    wake(s, id, arrivalAt(u.track));
    return false;
  }
  let clear = portClearAt(s, id);
  for (let j = 1; j < st.outQ.length; j++) {
    const k = unitOf(s, st.outQ[j]).track;
    const p = k ? posAt(k, s.t) : 0;
    if (k && k.target === 0 && p > 1e-6 && p < SLOT) clear = Math.max(clear, arrivalAt(k));
  }
  if (clear > s.t + 1e-9) {
    wake(s, id, clear);
    return false;
  }
  st.outQ.shift();
  const slot = nx.inQ.length + nx.incoming;
  nx.incoming++;
  const transferId = nextId(s, 'TR', 6);
  const laneId = `${id}->${to}`;
  emit(s, 'TRANSFER_RESERVED', 'info', `${transferId}: ${STATION_META[to].short} input slot ${slot + 1} reserved for ${u.serial}`, {
    station: to,
    unit: u.id,
    payload: { transferId, from: id, to, slot },
  });
  place(u, id, 'transfer');
  u.track = null;
  const seconds = s.config[id].transferSeconds;
  const finishAt = r6(s.t + seconds);
  s.transfers.push({ transferId, unitId: u.id, from: id, to, startAt: s.t, finishAt, slot });
  push(s, 'TRANSFER_DONE', finishAt, { station: to, unitId: u.id, transferId });
  emit(s, 'TRANSFER_STARTED', 'info', `${transferId}: ${u.serial} ${STATION_META[id].short} → ${STATION_META[to].short}`, {
    station: id,
    unit: u.id,
    payload: { transferId, from: id, to, laneId, seconds },
  });
  retargetOut(s, id);
  nx.inQ.forEach((_, j) => holdAtMouth(s, to, j));
  return true;
}

/** Idempotent: a replayed or unknown transfer id changes nothing. */
export function completeTransfer(s: Session, transferId: string): boolean {
  const k = s.transfers.findIndex((x) => x.transferId === transferId);
  if (k < 0) return false;
  const tr = s.transfers[k];
  s.transfers.splice(k, 1);
  const nx = s.stations[tr.to];
  nx.incoming--;
  const idx = nx.inQ.length;
  nx.inQ.push(tr.unitId);
  const u = unitOf(s, tr.unitId);
  place(u, tr.to, 'in');
  u.track = { pos: LANE_SPEC[tr.to].inLen, at: s.t, target: inTarget(tr.to, idx) };
  holdAtMouth(s, tr.to, idx);
  if (tr.to === 'dispatch') s.lineWip--;
  emit(s, 'TRANSFER_COMPLETED', 'info', `${transferId}: ${u.serial} arrived at ${STATION_META[tr.to].short} input`, {
    station: tr.to,
    unit: u.id,
    payload: { transferId, from: tr.from, to: tr.to, slot: idx },
  });
  return true;
}
