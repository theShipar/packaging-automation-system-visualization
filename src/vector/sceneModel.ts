import { STATION_IDS, type StationId } from '../domain/types';
import { EXIT_RUN, LANES } from '../transport/graph';
import { CAM, CONNECTORS, GLOBAL_VIEW, GP, GP0, PLACE, PORTS, VIEWS, toWorld } from '../transport/layout';
import { robotJoints } from '../transport/robotChoreography';
import { Builder, makeView, restPose, type FrontGroup, type MachinePose, type Shape, type View } from './builder';
import { CARTON, CASE, FIGURES, PALLET_SLOTS, drawCarton } from './figures';
import { hull, open, poly, ringAt, rings, rrect, run, seg, type Pt, type V3 } from './iso';

export interface StationDrawing {
  back: Shape[];
  fronts: FrontGroup[];
  pts: Pt[];
  compPts: Record<string, Pt[]>;
}

export function drawStation(id: StationId, pose: MachinePose, hiComp: string | null, view: View = VIEWS[id]): StationDrawing {
  const b = new Builder(view, hiComp);
  FIGURES[id].draw(b, pose);
  return { back: b.shapes, fronts: b.fronts, pts: b.pts, compPts: b.compPts };
}

/* ---------------------------------------------------------------- products */

const ORIGIN = makeView(CAM, GP0);
const shapesOf = (fn: (b: Builder) => void) => {
  const b = new Builder(ORIGIN, null);
  fn(b);
  return b.shapes;
};

export const KIT = { L: 16, W: 12, H: 9 };
export const KIT_SHAPES = shapesOf((b) => {
  b.box(-KIT.L / 2, -KIT.W / 2, KIT.L / 2, KIT.W / 2, 0, KIT.H, 2, 1);
  b.seg3([0, -KIT.W / 2, KIT.H], [0, KIT.W / 2, KIT.H]);
});
export const CARTON_SHAPES = shapesOf((b) => drawCarton(b, 0, 0, 0));

const hx = CASE.L / 2, hy = CASE.W / 2;
export const SEALED_CASE_SHAPES = shapesOf((b) => {
  b.box(-hx, -hy, hx, hy, 0, CASE.H, 1.6, 1);
  b.seg3([-hx, 0, CASE.H], [hx, 0, CASE.H]);
});

/** Open case in two parts so a carton can drop inside: full body behind, front walls (top left open) after. */
const openCache = new Map<number, { back: Shape[]; front: Shape[] }>();
export function openCaseShapes(fill: number) {
  const k = Math.round(fill * 12);
  let hit = openCache.get(k);
  if (!hit) {
    const { P, front } = ORIGIN;
    const [ring, inner] = rings(-hx, -hy, hx, hy, 1.6, 1);
    const body = hull(ringAt(P, ring, CASE.H).concat(ringAt(P, ring, 0)));
    const top = ringAt(P, inner, CASE.H);
    const level = 1 + ((CASE.H - 3) * k) / 12;
    const back = [
      { t: 'path', d: poly(body), cls: 'sil' } as Shape,
      { t: 'path', d: open(ringAt(P, run(inner, (q) => !front(q)), CASE.H)), cls: 'nf lo' } as Shape,
      { t: 'path', d: open(ringAt(P, run(rrect(-hx + 1.4, -hy + 1.4, hx - 1.4, hy - 1.4, 0.8, 3), (q) => !front(q)), level)), cls: 'nf lo' } as Shape,
    ];
    const frontPart = [{ t: 'path', d: poly(body) + poly(top), cls: 'sil eo' } as Shape];
    hit = { back, front: frontPart };
    openCache.set(k, hit);
  }
  return hit;
}

/** Screen translation for a world point (product shapes are built at the origin). */
export const screenAt = (p: V3): Pt => GP(p[0], p[1], p[2]);

/* ---------------------------------------------------------------- view bounds */

function poseSamples(id: StationId): MachinePose[] {
  const base = restPose();
  const ms = [0.1, 0.3, 0.45, 0.6, 0.75, 0.9];
  return [base, { ...base, hover: 1 }, ...ms.map((m) => ({ ...base, m, robot: id === 'robot' ? robotJoints(m) : null }))];
}

function productBox(p: V3, L: number, W: number, H: number): V3[] {
  const out: V3[] = [];
  for (const dx of [-L / 2, L / 2]) for (const dy of [-W / 2, W / 2]) for (const dz of [0, H]) out.push([p[0] + dx, p[1] + dy, p[2] + dz]);
  return out;
}

function drawnBounds() {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const add = (q: Pt) => {
    x0 = Math.min(x0, q[0]);
    x1 = Math.max(x1, q[0]);
    y0 = Math.min(y0, q[1]);
    y1 = Math.max(y1, q[1]);
  };
  for (const id of STATION_IDS) for (const pose of poseSamples(id)) drawStation(id, pose, null).pts.forEach(add);
  for (const lane of LANES) for (let d = 0; d <= lane.length; d += 6) productBox(lane.poseAt(d), CARTON.L, CARTON.W, CARTON.H).forEach((p) => add(GP(p[0], p[1], p[2])));
  for (const slot of PALLET_SLOTS) {
    const w = toWorld('dispatch', slot);
    productBox([w[0] + EXIT_RUN, w[1], w[2]], CASE.L, CASE.W, CASE.H).forEach((p) => add(GP(p[0], p[1], p[2])));
  }
  return { x0, x1, y0, y1 };
}

const PAD = { l: 34, r: 40, t: 40, b: 64 };
const B0 = drawnBounds();
CAM.ox = -B0.x0 + PAD.l;
CAM.oy = -B0.y0 + PAD.t;
export const VIEW_W = B0.x1 - B0.x0 + PAD.l + PAD.r;
export const VIEW_H = B0.y1 - B0.y0 + PAD.t + PAD.b;

/* ---------------------------------------------------------------- connectors (after the camera is fitted) */

const CONNECTOR_W = 12;

export const CONNECTOR_SHAPES: Shape[][] = CONNECTORS.map((c) => {
  const b = new Builder(GLOBAL_VIEW, null);
  const { P } = GLOBAL_VIEW;
  b.box(c.x0 - 2, -CONNECTOR_W, c.x1 + 2, CONNECTOR_W, 0, 12, 3, 1.2);
  for (let x = c.x1 - 7; x > c.x0 + 2; x -= 14) b.line(seg(P(x, -CONNECTOR_W + 3, 12), P(x, CONNECTOR_W - 3, 12)));
  return b.shapes;
});

/* ---------------------------------------------------------------- hit proxies and labels */

export interface StationGeometry {
  hull: Pt[];
  hullD: string;
  comps: Record<string, string>;
  label: Pt;
}

/** Rest-pose geometry per station: stable hit proxies (rule 01: hit areas do not move). */
export const GEOMETRY: Record<StationId, StationGeometry> = Object.fromEntries(
  STATION_IDS.map((id) => {
    const d = drawStation(id, restPose(), null);
    const h = hull(d.pts);
    const comps: Record<string, string> = {};
    for (const [c, pts] of Object.entries(d.compPts)) comps[c] = poly(hull(pts));
    const f = FIGURES[id];
    const anchor = GP(PLACE[id].dx + (f.xEntry + f.xExit) / 2, 44, 0);
    let maxY = -1e9;
    for (const p of h) maxY = Math.max(maxY, p[1]);
    return [id, { hull: h, hullD: poly(h), comps, label: [anchor[0], Math.min(anchor[1], maxY + 10)] as Pt }];
  }),
) as Record<StationId, StationGeometry>;

/** Entry and exit marks: where goods enter (intake tray) and leave (pallet exit). */
export const FLOW_MARKS = {
  entry: GP(PORTS.intake.in - 50, 0, 0),
  exit: GP(PLACE.dispatch.dx + FIGURES.dispatch.xExit + EXIT_RUN - 10, 0, 0),
};
