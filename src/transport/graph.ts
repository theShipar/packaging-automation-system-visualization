/*
 * Lane graph. Main-line lanes are straight segments of the shared lane line, parameterised by
 * horizontal distance so they match the domain's 1-D conveyor positions exactly; side routes
 * (reject chute, case feed, pallet, exit) are arc-length polylines.
 */
import { STATION_IDS, type StationId } from '../domain/types';
import { RAMP } from '../vector/builder';
import { CASE, FIGURES, PALLET_SLOTS, QA_REJECT } from '../vector/figures';
import { clamp, lerp, type V3 } from '../vector/iso';
import { CONNECTORS, PORTS, lanePoint, toWorld } from './layout';

export interface LaneSegment {
  id: string;
  from: V3;
  to: V3;
  length: number;
  poseAt(d: number): V3;
}

export function straightLane(id: string, x0: number, x1: number): LaneSegment {
  const length = Math.abs(x1 - x0);
  const dir = Math.sign(x1 - x0) || 1;
  return { id, from: lanePoint(x0), to: lanePoint(x1), length, poseAt: (d) => lanePoint(x0 + dir * clamp(d, 0, length)) };
}

export function polyline(id: string, pts: V3[]): LaneSegment {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  const length = cum[cum.length - 1];
  return {
    id,
    from: pts[0],
    to: pts[pts.length - 1],
    length,
    poseAt(d) {
      const s = clamp(d, 0, length);
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const span = cum[i] - cum[i - 1];
      const t = span > 0 ? (s - cum[i - 1]) / span : 0;
      const a = pts[i - 1], b = pts[i];
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    },
  };
}

/* ---------------------------------------------------------------- the graph */

export const IN_LANE = Object.fromEntries(STATION_IDS.map((id) => [id, straightLane(`${id}:in`, PORTS[id].in, PORTS[id].work[0])])) as Record<StationId, LaneSegment>;

export const OUT_LANE = Object.fromEntries(
  STATION_IDS.filter((id) => id !== 'dispatch').map((id) => [id, straightLane(`${id}:out`, PORTS[id].exitFrom, PORTS[id].out)]),
) as Record<StationId, LaneSegment>;

export const TRANSFER_LANE = Object.fromEntries(CONNECTORS.map((c) => [c.from, straightLane(`${c.from}->${c.to}`, PORTS[c.from].out, PORTS[c.to].in)])) as Record<StationId, LaneSegment>;

const qaW = (p: V3) => toWorld('qa', p);
const qaWork = FIGURES.qa.work;
/** Ramp down off the scale, divert point, belt edge, chute into tray slot j. */
export const REJECT_LANES: LaneSegment[] = QA_REJECT.tray.map((slot, j) =>
  polyline(`qa:reject${j}`, [
    qaW(qaWork),
    qaW([FIGURES.qa.ramps[0][1], qaWork[1], qaWork[2]]),
    qaW([FIGURES.qa.ramps[0][1] + RAMP, qaWork[1], 12]),
    qaW(QA_REJECT.push),
    qaW(QA_REJECT.edge),
    qaW(slot),
  ]),
);

const dsW = (p: V3) => toWorld('dispatch', p);
const rim = CASE.loader[2] + CASE.H;
const CASE_FLOOR = CASE.loader[2] + 1;
/** Carton lift from the infeed end, over the rim, down into the open case. */
export const CASE_FEED = polyline('dispatch:feed', [
  dsW(FIGURES.dispatch.work),
  dsW([FIGURES.dispatch.work[0], 13, rim + 4]),
  dsW([CASE.loader[0], CASE.loader[1], rim + 4]),
  dsW([CASE.loader[0], CASE.loader[1], CASE_FLOOR]),
]);

/** Sealed case from the loader through the scanner gate to pallet slot k. */
export const PALLET_LANES: LaneSegment[] = PALLET_SLOTS.map((slot, k) =>
  polyline(`dispatch:pallet${k}`, [dsW(CASE.loader), dsW([CASE.loader[0], CASE.loader[1], 30]), dsW([slot[0], CASE.loader[1], 30]), dsW([slot[0], slot[1], 30]), dsW(slot)]),
);

/** Outbound: shipped cases leave the pallet along +x. */
export const EXIT_RUN = 70;

export const LANES: LaneSegment[] = [
  ...Object.values(IN_LANE),
  ...Object.values(OUT_LANE),
  ...Object.values(TRANSFER_LANE),
  ...REJECT_LANES,
  CASE_FEED,
  ...PALLET_LANES,
];

/** Route between two named ports, e.g. route('qa:out', 'packaging:in') → the transfer lane. */
export function route(from: string, to: string): LaneSegment | null {
  const [fs, fp] = from.split(':') as [StationId, string];
  const [ts, tp] = to.split(':') as [StationId, string];
  if (fp === 'in' && tp === 'work' && fs === ts) return IN_LANE[fs];
  if (fp === 'exit' && tp === 'out' && fs === ts) return OUT_LANE[fs] ?? null;
  if (fp === 'out' && tp === 'in') return TRANSFER_LANE[fs]?.to[0] === PORTS[ts].in ? TRANSFER_LANE[fs] : null;
  return null;
}
