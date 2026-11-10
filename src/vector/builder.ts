import type { StationId, StationStatus } from '../domain/types';
import { hull, open, poly, rad, ringAt, rings, run, seg, type Cam, type Proj, type Pt, type Sample, type V3 } from './iso';

export type Shape =
  | { t: 'path'; d: string; cls: string; comp?: string }
  | { t: 'dot'; cx: number; cy: number; rx: number; ry: number; cls: string };

export interface View {
  P: Proj;
  front: (q: Sample) => boolean;
  vs: number;
  vc: number;
  vk: number;
  S: number;
  k: number;
  /** Local figure point → world point (for depth keys). */
  toW: (p: V3) => V3;
  /** Figure drawn as its mirror image in local x (row 2, flowing −x). */
  mirror: boolean;
}

const same = (p: V3) => p;

export function makeView(C: Cam, P: Proj, toW: (p: V3) => V3 = same, mirror = false): View {
  const vs = Math.sin(C.az),
    vc = Math.cos(C.az);
  const m = mirror ? -1 : 1;
  return { P, front: (q) => m * q.nu * vs + q.nv * vc >= -1e-6, vs: m * vs, vc, vk: C.k / Math.sqrt(1 - C.k * C.k), S: C.S, k: C.k, toW, mirror };
}

/** Painter depth for the az -45 camera: nearer is larger (toward +y and -x), higher wins ties. */
export const depthKey = (x: number, y: number, z: number) => y - x + 0.02 * z;

export interface RobotJoints {
  th: number;
  a1: number;
  a2: number;
  e: number;
}

/** What a station figure needs to pose its own machinery. Products are not part of it. */
export interface MachinePose {
  /** Mechanics progress, 0..1, after the unit has arrived at the work point; null when empty. */
  m: number | null;
  done: boolean;
  status: StationStatus;
  hover: number;
  supply: number;
  /** Seconds since the latest QA rejection, while its divert is still visible. */
  rejectAge: number | null;
  robot: RobotJoints | null;
}

export const restPose = (): MachinePose => ({ m: null, done: false, status: 'idle', hover: 0, supply: 3, rejectAge: null, robot: null });

/** Machinery takes the focus colour; belts, trays and guards stay as line art. */
const CONVEYING = /BELT|DRIVE|TRAY|GUARD|INFEED/;
const machCls = (comp: string | undefined) => (comp && !CONVEYING.test(comp) ? ' mach' : '');

export interface FrontGroup {
  name: string;
  key: number;
  shapes: Shape[];
}

/** Collects one figure's paths: back layer in paint order, front groups with world depth keys. */
export class Builder {
  shapes: Shape[] = [];
  fronts: FrontGroup[] = [];
  pts: Pt[] = [];
  compPts: Record<string, Pt[]> = {};
  private sink: Shape[] = this.shapes;
  constructor(
    public v: View,
    public hiComp: string | null,
  ) {}

  private track(points: Pt[], comp?: string) {
    for (const p of points) this.pts.push(p);
    if (comp) (this.compPts[comp] ??= []).push(...points);
  }

  /** Parts that products pass behind; `at` is the part's local depth anchor. */
  front(name: string, at: V3, fn: () => void, bias = 0) {
    const w = this.v.toW(at);
    const g: FrontGroup = { name, key: depthKey(w[0], w[1], w[2]) + bias, shapes: [] };
    const prev = this.sink;
    this.sink = g.shapes;
    fn();
    this.sink = prev;
    if (g.shapes.length) this.fronts.push(g);
  }

  /** The highlighted part's own paths carry `part`, so the scene can accent the real geometry. */
  private partCls(comp: string | undefined) {
    return comp && this.hiComp && comp === this.hiComp ? ' part' : '';
  }

  cls(comp: string | undefined, restHi: boolean) {
    const hi = comp && this.hiComp ? comp === this.hiComp : restHi && !this.hiComp;
    return (hi ? 'sil hi' : 'sil') + machCls(comp) + this.partCls(comp);
  }

  solidRings(ring: Sample[], inner: Sample[] | null, z0: number, z1: number, comp?: string, restHi = false) {
    const { P, front } = this.v;
    const h = hull(ringAt(P, ring, z1).concat(ringAt(P, ring, z0)));
    this.track(h, comp);
    this.sink.push({ t: 'path', d: poly(h), cls: this.cls(comp, restHi), comp });
    if (inner) {
      const cr = open(ringAt(P, run(inner, front), z1));
      if (cr) this.sink.push({ t: 'path', d: cr, cls: 'nf lo' + machCls(comp) + this.partCls(comp) });
    }
  }

  box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, r: number, b: number, comp?: string, restHi = false) {
    const [ring, inner] = rings(x0, y0, x1, y1, r, b);
    this.solidRings(ring, inner, z0, z1, comp, restHi);
  }

  /** A pre-built silhouette + crease pair (tilted or oriented slabs). */
  raw(silPts: Pt[], creasePts: Pt[] | null, comp?: string, restHi = false) {
    const h = hull(silPts);
    this.track(h, comp);
    this.sink.push({ t: 'path', d: poly(h), cls: this.cls(comp, restHi), comp });
    if (creasePts && creasePts.length > 1) this.sink.push({ t: 'path', d: open(creasePts), cls: 'nf lo' + machCls(comp) + this.partCls(comp) });
  }

  line(d: string, cls = 'nf lo') {
    if (d) this.sink.push({ t: 'path', d, cls });
  }

  seg3(a: V3, b: V3, cls = 'nf lo') {
    const { P } = this.v;
    this.line(seg(P(a[0], a[1], a[2]), P(b[0], b[1], b[2])), cls);
  }

  dot(x: number, y: number, z: number, r: number, cls: string) {
    const [cx, cy] = this.v.P(x, y, z);
    this.sink.push({ t: 'dot', cx, cy, rx: r * this.v.S, ry: r * this.v.S * this.v.k, cls });
  }
}

/** A footprint turned to yaw th (degrees) about (cx, cy); u runs across, v along. */
export const turn = (ring: Sample[], th: number, cx: number, cy: number): Sample[] => {
  const c = Math.cos(rad(th)),
    s = Math.sin(rad(th));
  return ring.map((q) => ({ u: cx + q.u * c + q.v * s, v: cy - q.u * s + q.v * c, nu: q.nu * c + q.nv * s, nv: -q.nu * s + q.nv * c }));
};

/** A raised nest on the lane: units ride a short ramp up to `z` between x0 and x1. */
export type Ramp = [x0: number, x1: number, z: number];

export interface FigureDef {
  id: StationId;
  /** Local y of the product lane; every station's lane lands on world y = 0. */
  lane: number;
  xEntry: number;
  xExit: number;
  /** Work point: fixture, scanner, scale or pickup port (local). */
  work: V3;
  /** Robot only: placement port on the deposit belt. */
  place?: V3;
  ramps: Ramp[];
  extent: V3[];
  draw(b: Builder, pose: MachinePose): void;
}

export const BELT_Z = 12;
export const RAMP = 8;

export function rampZ(ramps: Ramp[], x: number): number {
  for (const [x0, x1, z] of ramps) {
    if (x >= x0 && x <= x1) return z;
    if (x > x0 - RAMP && x < x0) return BELT_Z + ((z - BELT_Z) * (x - (x0 - RAMP))) / RAMP;
    if (x > x1 && x < x1 + RAMP) return z + ((BELT_Z - z) * (x - x1)) / RAMP;
  }
  return BELT_Z;
}

export const falloff = (u: number) =>
  u <= 0 ? 1 : u <= 0.42 ? 1 - (u / 0.42) * 0.69 : u <= 1 ? 0.31 - ((u - 0.42) / 0.58) * 0.22 : 0.09;
