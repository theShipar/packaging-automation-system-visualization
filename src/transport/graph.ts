/*
 * Lane graph. Row lanes are straight segments of a row line, parameterised by the row coordinate
 * so they match the domain's 1-D conveyor positions exactly. The robot outfeed, the robot→QA
 * transfer and the QA infeed share the U-turn bridge path, mapped proportionally. Side routes
 * (reject chute, case feed, pallet, exit) are arc-length polylines.
 */
import { LANE_SPEC, TRANSFER_LEN } from '../domain/conveyor';
import { STATION_IDS, type StationId } from '../domain/types';
import { RAMP } from '../vector/builder';
import { CASE, FIGURES, PALLET_SLOTS, QA_REJECT } from '../vector/figures';
import { clamp, lerp, type V3 } from '../vector/iso';
import { BRIDGE_DOMAIN, BRIDGE_PATH, CONNECTORS, PORTS, ROW_DIR, rowPoint, toWorld, type Row } from './layout';

export interface LaneSegment {
  id: string;
  from: V3;
  to: V3;
  /** Domain length: poseAt takes a domain distance in [0, length]. */
  length: number;
  /** Drawn distance per domain distance (1 everywhere except the bridge). */
  scale: number;
  poseAt(d: number): V3;
}

export function rowLane(id: string, row: Row, s0: number, s1: number): LaneSegment {
  const length = Math.abs(s1 - s0);
  const dir = Math.sign(s1 - s0) || 1;
  return { id, from: rowPoint(row, s0), to: rowPoint(row, s1), length, scale: 1, poseAt: (d) => rowPoint(row, s0 + dir * clamp(d, 0, length)) };
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
    scale: 1,
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

/** The U-turn path, drawn length over the domain distance it stands for. */
export const BRIDGE = polyline('bridge', BRIDGE_PATH);
export const BRIDGE_SCALE = BRIDGE.length / BRIDGE_DOMAIN;

function onBridge(id: string, d0: number, length: number): LaneSegment {
  const at = (d: number) => BRIDGE.poseAt((d0 + clamp(d, 0, length)) * BRIDGE_SCALE);
  return { id, from: at(0), to: at(length), length, scale: BRIDGE_SCALE, poseAt: at };
}

const BRIDGE_OUT_LANE = onBridge('robot:out', 0, LANE_SPEC.robot.exitLen);
const BRIDGE_XFER = onBridge('robot->qa', LANE_SPEC.robot.exitLen, TRANSFER_LEN);
const BRIDGE_IN_LANE = onBridge('qa:in', LANE_SPEC.robot.exitLen + TRANSFER_LEN, LANE_SPEC.qa.inLen);

export const IN_LANE = Object.fromEntries(
  STATION_IDS.map((id) => [id, id === 'qa' ? BRIDGE_IN_LANE : rowLane(`${id}:in`, PORTS[id].row, PORTS[id].in, PORTS[id].workS)]),
) as Record<StationId, LaneSegment>;

export const OUT_LANE = Object.fromEntries(
  STATION_IDS.filter((id) => id !== 'dispatch').map((id) => [id, id === 'robot' ? BRIDGE_OUT_LANE : rowLane(`${id}:out`, PORTS[id].row, PORTS[id].exitFrom, PORTS[id].out)]),
) as Record<StationId, LaneSegment>;

export const TRANSFER_LANE = Object.fromEntries([
  ...CONNECTORS.map((c) => [c.from, rowLane(`${c.from}->${c.to}`, c.row, PORTS[c.from].out, PORTS[c.to].in)]),
  ['robot', BRIDGE_XFER],
]) as Record<StationId, LaneSegment>;

/** Lane lengths in domain units; tests assert they equal the domain's LANE_SPEC. */
export const DERIVED_LANES = Object.fromEntries(
  STATION_IDS.map((id) => [id, { inLen: IN_LANE[id].length, exitLen: id === 'dispatch' ? 0 : OUT_LANE[id].length }]),
) as Record<StationId, { inLen: number; exitLen: number }>;

/** World points where units may enter or leave view: infeed mouths and out ports. */
export const MOUTHS: V3[] = STATION_IDS.flatMap((id) => [IN_LANE[id].from, ...(id === 'dispatch' ? [] : [OUT_LANE[id].to])]);

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

/** Outbound: shipped cases leave the pallet along the row-2 flow direction. */
export const EXIT_RUN = 70;
export const EXIT_DIR = ROW_DIR[1];

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
  if (fp === 'out' && tp === 'in') {
    const tr = TRANSFER_LANE[fs];
    return tr && Math.hypot(tr.to[0] - IN_LANE[ts].from[0], tr.to[1] - IN_LANE[ts].from[1]) < 1e-9 ? tr : null;
  }
  return null;
}
