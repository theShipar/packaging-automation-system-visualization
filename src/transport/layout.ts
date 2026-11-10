/*
 * World layout: one camera, one lane line. Every station's product lane lands on world y = 0
 * at belt height 12, stations are chained along +x with straight connector belts, and
 * world +x renders lower-left (intake) to upper-right (dispatch).
 */
import { TRANSFER_LEN } from '../domain/conveyor';
import { STATION_IDS, type StationId } from '../domain/types';
import { BELT_Z, makeView, rampZ, type View } from '../vector/builder';
import { FIGURES } from '../vector/figures';
import { cam, proj, type V3 } from '../vector/iso';

export const CAM = cam(-45, 0.5, 1);
export const LANE_Y = 0;
/** Belt end to next belt start: the transfer lane plus one infeed slot, so connectors also accumulate. */
export const CONNECTOR_GAP = 42;
/** Out port sits half a product short of the belt end. */
export const OUT_INSET = 9;

export interface Placed {
  id: StationId;
  dx: number;
  dy: number;
}

export const PLACED: Placed[] = [];
{
  let dx = 0;
  STATION_IDS.forEach((id, i) => {
    const f = FIGURES[id];
    if (i > 0) {
      const prev = PLACED[i - 1];
      dx = prev.dx + FIGURES[prev.id].xExit + CONNECTOR_GAP - f.xEntry;
    }
    PLACED.push({ id, dx, dy: LANE_Y - f.lane });
  });
}
export const PLACE = Object.fromEntries(PLACED.map((p) => [p.id, p])) as Record<StationId, Placed>;

export const toWorld = (id: StationId, p: V3): V3 => [p[0] + PLACE[id].dx, p[1] + PLACE[id].dy, p[2]];

/** Typed world ports along the lane (x positions; y = LANE_Y). */
export interface Ports {
  /** Where an arriving unit enters the station's infeed region (transfer lane end, or the intake feeder). */
  in: number;
  /** Work point: fixture, scanner, scale or robot pickup. */
  work: V3;
  /** Where the outfeed region starts (work point, or the robot placement port). */
  exitFrom: number;
  /** Out port: where a departing unit starts its transfer lane. */
  out: number;
}

function buildPorts(): Record<StationId, Ports> {
  const out = {} as Record<StationId, Ports>;
  STATION_IDS.forEach((id, i) => {
    const f = FIGURES[id];
    const p = PLACE[id];
    const work = toWorld(id, f.work);
    const outX = p.dx + f.xExit - OUT_INSET;
    const inX = i === 0 ? p.dx : out[STATION_IDS[i - 1]].out + TRANSFER_LEN;
    const exitFrom = f.place ? toWorld(id, f.place)[0] : work[0];
    out[id] = { in: inX, work, exitFrom, out: outX };
  });
  return out;
}
export const PORTS = buildPorts();

/** Lane lengths derived from the drawn ports; tests assert they equal the domain's LANE_SPEC. */
export const DERIVED_LANES = Object.fromEntries(
  STATION_IDS.map((id) => [id, { inLen: PORTS[id].work[0] - PORTS[id].in, exitLen: id === 'dispatch' ? 0 : PORTS[id].out - PORTS[id].exitFrom }]),
) as Record<StationId, { inLen: number; exitLen: number }>;

export interface Connector {
  from: StationId;
  to: StationId;
  x0: number;
  x1: number;
}

export const CONNECTORS: Connector[] = STATION_IDS.slice(1).map((to, i) => {
  const from = STATION_IDS[i];
  return { from, to, x0: PLACE[from].dx + FIGURES[from].xExit, x1: PLACE[to].dx + FIGURES[to].xEntry };
});

/** Which station's ground the world x belongs to (for the lane height profile). */
function stationAtX(x: number): StationId | null {
  for (const p of PLACED) {
    const f = FIGURES[p.id];
    if (x >= p.dx + f.xEntry && x <= p.dx + f.xExit) return p.id;
  }
  return null;
}

/** Product base height along the lane: belt top, plus fixture ramps. */
export function laneZ(x: number): number {
  const id = stationAtX(x);
  return id ? rampZ(FIGURES[id].ramps, x - PLACE[id].dx) : BELT_Z;
}

export const lanePoint = (x: number): V3 => [x, LANE_Y, laneZ(x)];

/* ---------------------------------------------------------------- camera and views */

export const GP = proj(CAM);
/** Projection without the screen offset: used for translation-invariant product shapes. */
export const GP0 = proj({ ...CAM, ox: 0, oy: 0 });

export const GLOBAL_VIEW = makeView(CAM, GP);

export function stationView(id: StationId): View {
  const p = PLACE[id];
  const P = (x: number, y: number, z: number) => GP(x + p.dx, y + p.dy, z);
  return makeView(CAM, P, [p.dx, p.dy, 0]);
}

export const VIEWS = Object.fromEntries(STATION_IDS.map((id) => [id, stationView(id)])) as Record<StationId, View>;
