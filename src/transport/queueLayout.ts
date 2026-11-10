/*
 * Physical queue layout. Infeed draws its oldest units nearest the work point and the rest wait
 * at the infeed mouth; outfeed draws its newest units and the rest are in the accumulation at the
 * out port. Overflow is counted in one badge per connector, so a unit only appears or disappears
 * at a mouth, never at a fixture.
 */
import { hiddenOut as heldOut, posAt, visibleIn } from '../domain/conveyor';
import { unitOf } from '../domain/core';
import { portClearAt } from '../domain/transfer';
import type { Session, StationId } from '../domain/types';
import type { V3 } from '../vector/iso';
import { BRIDGE } from './graph';
import { CONNECTORS, PORTS, rowPoint } from './layout';

/** Infeed: one of the drawn slots, and not held at the mouth waiting for clearance. */
export function inVisible(s: Session, id: StationId, i: number): boolean {
  if (i >= visibleIn(id)) return false;
  const k = unitOf(s, s.stations[id].inQ[i]).track;
  return !k || k.at <= s.t + 1e-9;
}

/** Outfeed: moving, or resting in a drawn slot; the port slot shows only once the last departure is a slot away. */
export function outVisible(s: Session, id: StationId, i: number): boolean {
  const q = s.stations[id].outQ;
  const k = unitOf(s, q[i]).track;
  const pos = k ? posAt(k, s.t) : 0;
  if (pos > 1e-6) return true;
  if (i < heldOut(id, q.length)) return false;
  return portClearAt(s, id) <= s.t + 1e-9;
}

export interface Badge {
  key: string;
  at: V3;
  count: number;
  label: string;
}

export function queueBadges(s: Session): Badge[] {
  const out: Badge[] = [];
  const count = (id: StationId, q: string[], shown: (s: Session, id: StationId, i: number) => boolean) => q.reduce((n, _, i) => n + (shown(s, id, i) ? 0 : 1), 0);
  const hiddenIn = (id: StationId) => count(id, s.stations[id].inQ, inVisible);
  const hiddenOut = (id: StationId) => count(id, s.stations[id].outQ, outVisible);
  const feed = hiddenIn('intake');
  if (feed) out.push({ key: 'feed', at: rowPoint(0, PORTS.intake.in - 4), count: feed, label: `${feed} released, waiting at the feeder` });
  for (const c of CONNECTORS) {
    const n = hiddenOut(c.from) + hiddenIn(c.to);
    if (n) out.push({ key: `${c.from}->${c.to}`, at: rowPoint(c.row, (c.s0 + c.s1) / 2), count: n, label: `${n} queued between ${c.from} and ${c.to}` });
  }
  const turn = hiddenOut('robot') + hiddenIn('qa');
  if (turn) out.push({ key: 'robot->qa', at: BRIDGE.poseAt(BRIDGE.length / 2), count: turn, label: `${turn} queued on the bridge between robot and qa` });
  return out;
}
