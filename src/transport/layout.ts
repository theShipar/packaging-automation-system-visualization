/*
 * World layout: a compact two-row cell.
 *   Row 1 (intake, assembly, robot) runs along +x on y = 0.
 *   Row 2 (QA, packaging, dispatch) runs back along −x on y = ROW_Y[1], with mirror-image
 *   (handed) machines, so every station still faces the same camera.
 *   A U-turn bridge at the right end carries robot output across to the QA infeed.
 * Every lane sits at belt height 12 on its row line. Positions along a row use the row
 * coordinate s, which grows in the direction of flow on both rows.
 */
import { LANE_SPEC, TRANSFER_LEN } from '../domain/conveyor';
import { STATION_IDS, type StationId } from '../domain/types';
import { BELT_Z, RAMP, makeView, rampZ, type View } from '../vector/builder';
import { FIGURES } from '../vector/figures';
import { cam, proj, type V3 } from '../vector/iso';

export const CAM = cam(-45, 0.5, 1);
export type Row = 0 | 1;
export const ROW_Y: readonly [number, number] = [0, 132];
export const ROW_OF: Record<StationId, Row> = { intake: 0, assembly: 0, robot: 0, qa: 1, packaging: 1, dispatch: 1 };
/** Belt end to next belt start: the transfer lane plus one infeed slot, so connectors also accumulate. */
export const CONNECTOR_GAP = 42;
/** Out port sits half a product short of the belt end. */
export const OUT_INSET = 9;
/** Belt half-width shared by connectors and the bridge. */
export const BELT_HALF = 12;
/** The bridge column runs this far beyond the row ends. */
export const BRIDGE_OUT = 26;
const CORNER = 12;

export interface Placed {
  id: StationId;
  row: Row;
  /** Row coordinate of the station's local x = 0. */
  s0: number;
  dx: number;
  dy: number;
  mirror: boolean;
}

export const PLACED: Placed[] = [];
let ROW2_X = 0;
{
  const chain = (ids: StationId[], row: Row) => {
    let s0 = 0;
    ids.forEach((id, i) => {
      const f = FIGURES[id];
      if (i > 0) {
        const prev = FIGURES[ids[i - 1]];
        s0 = s0 + prev.xExit + CONNECTOR_GAP - f.xEntry;
      }
      PLACED.push({ id, row, s0, dx: 0, dy: ROW_Y[row] - f.lane, mirror: row === 1 });
    });
  };
  chain(['intake', 'assembly', 'robot'], 0);
  chain(['qa', 'packaging', 'dispatch'], 1);
  const robot = PLACED.find((p) => p.id === 'robot')!;
  const rowEnd = robot.s0 + FIGURES.robot.xExit;
  /* row 2 starts (QA belt start) directly under the end of row 1 */
  ROW2_X = rowEnd + FIGURES.qa.xEntry;
  for (const p of PLACED) p.dx = p.row === 0 ? p.s0 : ROW2_X - p.s0;
}
export const PLACE = Object.fromEntries(PLACED.map((p) => [p.id, p])) as Record<StationId, Placed>;

export const rowX = (row: Row, s: number) => (row === 0 ? s : ROW2_X - s);
/** World x direction of flow on a row. */
export const ROW_DIR: readonly [number, number] = [1, -1];

export function toWorld(id: StationId, p: V3): V3 {
  const q = PLACE[id];
  return [q.mirror ? q.dx - p[0] : q.dx + p[0], p[1] + q.dy, p[2]];
}

/** Which station's ground the row coordinate belongs to (for the lane height profile). */
function stationAt(row: Row, s: number): Placed | null {
  for (const p of PLACED) {
    if (p.row !== row) continue;
    const f = FIGURES[p.id];
    if (s >= p.s0 + f.xEntry && s <= p.s0 + f.xExit) return p;
  }
  return null;
}

/** Product base height along a row: belt top, plus fixture ramps. */
export function laneZ(row: Row, s: number): number {
  const p = stationAt(row, s);
  return p ? rampZ(FIGURES[p.id].ramps, s - p.s0) : BELT_Z;
}

export const rowPoint = (row: Row, s: number): V3 => [rowX(row, s), ROW_Y[row], laneZ(row, s)];

/** Typed ports, in row coordinates. The robot out port and the QA in port lie on the bridge. */
export interface Ports {
  row: Row;
  /** Where an arriving unit enters the station's infeed region; NaN when it is on the bridge. */
  in: number;
  /** Work point (world): fixture, scanner, scale or robot pickup. */
  work: V3;
  workS: number;
  /** Where the outfeed region starts (work point, or the robot placement port). */
  exitFrom: number;
  /** Out port: where a departing unit starts its transfer lane; NaN when it is on the bridge. */
  out: number;
}

function buildPorts(): Record<StationId, Ports> {
  const out = {} as Record<StationId, Ports>;
  STATION_IDS.forEach((id, i) => {
    const f = FIGURES[id];
    const p = PLACE[id];
    const workS = p.s0 + f.work[0];
    const prev = i > 0 ? out[STATION_IDS[i - 1]] : null;
    const first = !prev || prev.row !== p.row;
    const inS = i === 0 ? p.s0 : first ? NaN : prev!.out + TRANSFER_LEN;
    const exitFrom = f.place ? p.s0 + f.place[0] : workS;
    const last = id === 'robot';
    out[id] = { row: p.row, in: inS, work: toWorld(id, f.work), workS, exitFrom, out: last ? NaN : p.s0 + f.xExit - OUT_INSET };
  });
  return out;
}
export const PORTS = buildPorts();

export interface Connector {
  from: StationId;
  to: StationId;
  row: Row;
  s0: number;
  s1: number;
}

/** Straight belts between neighbours on the same row. */
export const CONNECTORS: Connector[] = STATION_IDS.slice(1)
  .map((to, i) => ({ from: STATION_IDS[i], to }))
  .filter(({ from, to }) => PLACE[from].row === PLACE[to].row)
  .map(({ from, to }) => ({ from, to, row: PLACE[to].row, s0: PLACE[from].s0 + FIGURES[from].xExit, s1: PLACE[to].s0 + FIGURES[to].xEntry }));

/* ---------------------------------------------------------------- bridge */

const ROW1_END = rowX(0, PLACE.robot.s0 + FIGURES.robot.xExit);
export const BRIDGE_X = ROW1_END + BRIDGE_OUT;

function arc(cx: number, cy: number, a0: number, a1: number, z: number): V3[] {
  const out: V3[] = [];
  for (let i = 1; i < 6; i++) {
    const a = a0 + ((a1 - a0) * i) / 6;
    out.push([cx + CORNER * Math.cos(a), cy + CORNER * Math.sin(a), z]);
  }
  return out;
}

/**
 * Robot placement port → robot outfeed → bridge column → QA infeed → QA work point, with
 * rounded corners. The robot outfeed, the transfer and the QA infeed are all mapped onto this
 * one path, so units cross the turn at a single, steady speed.
 */
export const BRIDGE_PATH: V3[] = (() => {
  const y0 = ROW_Y[0], y1 = ROW_Y[1], z = BELT_Z;
  const qa = (lx: number): V3 => toWorld('qa', [lx, FIGURES.qa.lane, rampZ(FIGURES.qa.ramps, lx)]);
  const [r0, , rz] = FIGURES.qa.ramps[0];
  return [
    toWorld('robot', FIGURES.robot.place!),
    [BRIDGE_X - CORNER, y0, z],
    ...arc(BRIDGE_X - CORNER, y0 + CORNER, -Math.PI / 2, 0, z),
    [BRIDGE_X, y0 + CORNER, z],
    [BRIDGE_X, y1 - CORNER, z],
    ...arc(BRIDGE_X - CORNER, y1 - CORNER, 0, Math.PI / 2, z),
    [BRIDGE_X - CORNER, y1, z],
    qa(r0 - RAMP),
    qa(r0),
    [...qa(FIGURES.qa.work[0]).slice(0, 2), rz] as V3,
  ].filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1], p[2] - a[i - 1][2]) > 1e-9) as V3[];
})();

/** Domain distance the bridge path stands for: robot outfeed + transfer + QA infeed. */
export const BRIDGE_DOMAIN = LANE_SPEC.robot.exitLen + TRANSFER_LEN + LANE_SPEC.qa.inLen;

/* ---------------------------------------------------------------- camera and views */

export const GP = proj(CAM);
/** Projection without the screen offset: used for translation-invariant product shapes. */
export const GP0 = proj({ ...CAM, ox: 0, oy: 0 });

export const GLOBAL_VIEW = makeView(CAM, GP);

export function stationView(id: StationId): View {
  const P = (x: number, y: number, z: number) => {
    const w = toWorld(id, [x, y, z]);
    return GP(w[0], w[1], w[2]);
  };
  return makeView(CAM, P, (p) => toWorld(id, p), PLACE[id].mirror);
}

export const VIEWS = Object.fromEntries(STATION_IDS.map((id) => [id, stationView(id)])) as Record<StationId, View>;
