/*
 * One-dimensional conveyor model shared by the engine and the transport layer.
 * Positions are distances along a station region, advanced by virtual time only:
 *   infeed: distance to the work point (fixture or pickup port)
 *   outfeed: distance to the out port
 * The lengths must match the figure ports; tests/geometry.test.ts asserts it.
 */
import type { StationId, Track } from './types';

export type { Track };

export const BELT_SPEED = 80;
export const SLOT = 20;
/** Out port to the next station's infeed mouth; crossed in `transferSeconds`. */
export const TRANSFER_LEN = 24;

export interface LaneSpec {
  inLen: number;
  exitLen: number;
}

export const LANE_SPEC: Record<StationId, LaneSpec> = {
  intake: { inLen: 61, exitLen: 62 },
  assembly: { inLen: 99, exitLen: 75 },
  robot: { inLen: 77, exitLen: 59 },
  qa: { inLen: 103, exitLen: 77 },
  packaging: { inLen: 113, exitLen: 65 },
  dispatch: { inLen: 99, exitLen: 0 },
};

export function posAt(k: Track, t: number): number {
  const d = k.target - k.pos;
  const step = BELT_SPEED * Math.max(0, t - k.at);
  return Math.abs(d) <= step ? k.target : k.pos + Math.sign(d) * step;
}

export const arrivalAt = (k: Track) => k.at + Math.abs(k.target - k.pos) / BELT_SPEED;

/** Infeed slots in front of the work point; the oldest units are drawn, newer ones wait at the mouth. */
export const visibleIn = (id: StationId) => Math.max(1, Math.floor((LANE_SPEC[id].inLen - SLOT) / SLOT));

/** Outfeed slots behind the out port; the newest units are drawn, older ones are in the accumulation. */
export const visibleOut = (id: StationId) => Math.max(1, Math.floor((LANE_SPEC[id].exitLen - SLOT) / SLOT) + 1);

export const inTarget = (id: StationId, i: number) => (i < visibleIn(id) ? (i + 1) * SLOT : LANE_SPEC[id].inLen);

/**
 * Outfeed units held in the accumulation at the out port. While any are held, the port slot is
 * kept for them (they leave from there), so the drawn units sit one slot back.
 */
export const hiddenOut = (id: StationId, len: number) => (len > visibleOut(id) ? len - visibleOut(id) + 1 : 0);

export function outTarget(id: StationId, i: number, len: number): number {
  const hidden = hiddenOut(id, len);
  if (i < hidden) return 0;
  return (i - hidden + (hidden ? 1 : 0)) * SLOT;
}

/** Earliest instant ≥ now at which `ahead` is a full slot clear of the infeed mouth. */
export function mouthClearAt(id: StationId, ahead: Track | null, now: number): number {
  if (!ahead) return now;
  const edge = LANE_SPEC[id].inLen - SLOT;
  const from = Math.max(now, ahead.at);
  const p = posAt(ahead, from);
  if (p <= edge + 1e-9 || ahead.target > edge) return now;
  return from + (p - edge) / BELT_SPEED;
}

/**
 * Intake releases appear one slot behind their target, and at least one slot inside the feeder
 * mouth so a unit revealed from the mouth later still has a full slot of clearance.
 */
export function spawnPos(target: number) {
  const mouth = LANE_SPEC.intake.inLen;
  return target >= mouth ? mouth : Math.min(mouth - SLOT, target + SLOT);
}
