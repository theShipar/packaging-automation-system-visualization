/*
 * App-owned port of the Hairline kernel geometry (lucasmarkes/hairline, MIT).
 * Same projection, rounded-solid grammar and spring/tween clocks, typed for React rendering.
 */

export type Pt = [number, number];
export type V3 = [number, number, number];
export interface Sample {
  u: number;
  v: number;
  nu: number;
  nv: number;
}
export interface Cam {
  az: number;
  k: number;
  S: number;
  ox: number;
  oy: number;
}
export type Proj = (x: number, y: number, z: number) => Pt;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rad = (d: number) => (d * Math.PI) / 180;
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const poly = (pts: Pt[]) => 'M' + pts.map((p) => r2(p[0]) + ' ' + r2(p[1])).join('L') + 'Z';
export const seg = (a: Pt, b: Pt) => `M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`;
export const open = (pts: Pt[]) => (pts.length < 2 ? '' : 'M' + pts.map((p) => r2(p[0]) + ' ' + r2(p[1])).join('L'));

export const cam = (azDeg: number, k: number, S: number): Cam => ({ az: rad(azDeg), k, S, ox: 0, oy: 0 });

export function proj(C: Cam): Proj {
  const c = Math.cos(C.az),
    s = Math.sin(C.az),
    zf = Math.sqrt(1 - C.k * C.k);
  return (x, y, z) => {
    const X = x * c - y * s,
      Y = x * s + y * c;
    return [C.ox + C.S * X, C.oy + C.S * (Y * C.k - z * zf)];
  };
}

export function unproj(C: Cam, sx: number, sy: number, z: number): Pt {
  const c = Math.cos(C.az),
    s = Math.sin(C.az),
    zf = Math.sqrt(1 - C.k * C.k);
  const X = (sx - C.ox) / C.S,
    Y = ((sy - C.oy) / C.S + z * zf) / C.k;
  return [X * c + Y * s, -X * s + Y * c];
}

export function bounds(C: Cam, pts: V3[]) {
  const P = proj({ ...C, ox: 0, oy: 0 });
  let a = 1e9,
    b = -1e9,
    c = 1e9,
    d = -1e9;
  for (const p of pts) {
    const q = P(p[0], p[1], p[2]);
    a = Math.min(a, q[0]);
    b = Math.max(b, q[0]);
    c = Math.min(c, q[1]);
    d = Math.max(d, q[1]);
  }
  return { x0: a, x1: b, y0: c, y1: d };
}

export function fit(C: Cam, pts: V3[], cx: number, cy: number) {
  const b = bounds(C, pts);
  C.ox = cx - (b.x0 + b.x1) / 2;
  C.oy = cy - (b.y0 + b.y1) / 2;
}

export function rrect(u0: number, v0: number, u1: number, v1: number, r: number, n = 4): Sample[] {
  r = Math.max(0, Math.min(r, (u1 - u0) / 2, (v1 - v0) / 2));
  const out: Sample[] = [];
  const corners: [number, number, number][] = [
    [u1 - r, v1 - r, 0],
    [u0 + r, v1 - r, 90],
    [u0 + r, v0 + r, 180],
    [u1 - r, v0 + r, 270],
  ];
  for (const [cu, cv, a0] of corners)
    for (let k = 0; k <= n; k++) {
      const a = rad(a0 + (90 * k) / n),
        ca = Math.cos(a),
        sa = Math.sin(a);
      out.push({ u: cu + r * ca, v: cv + r * sa, nu: ca, nv: sa });
    }
  return out;
}

export function circ(R: number, n = 48): Sample[] {
  const out: Sample[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2,
      ca = Math.cos(a),
      sa = Math.sin(a);
    out.push({ u: R * ca, v: R * sa, nu: ca, nv: sa });
  }
  return out;
}

export function hull(input: Pt[]): Pt[] {
  const pts = input.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const x = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [],
    up: Pt[] = [];
  for (const p of pts) {
    while (lo.length > 1 && x(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (up.length > 1 && x(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
    up.push(p);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}

export const ringAt = (P: Proj, ring: Sample[], z: number) => ring.map((q) => P(q.u, q.v, z));

export const facing = (C: Cam) => {
  const s = Math.sin(C.az),
    c = Math.cos(C.az);
  return (q: Sample) => q.nu * s + q.nv * c >= -1e-6;
};

export function run(ring: Sample[], keep: (q: Sample) => boolean): Sample[] {
  const n = ring.length;
  let s = -1;
  for (let i = 0; i < n; i++)
    if (keep(ring[i]) && !keep(ring[(i + n - 1) % n])) {
      s = i;
      break;
    }
  if (s < 0) return keep(ring[0]) ? ring.slice() : [];
  const out: Sample[] = [];
  for (let k = 0; k < n && keep(ring[(s + k) % n]); k++) out.push(ring[(s + k) % n]);
  return out;
}

export function prism(P: Proj, front: (q: Sample) => boolean, ring: Sample[], inner: Sample[] | null, z0: number, z1: number) {
  return {
    sil: poly(hull(ringAt(P, ring, z1).concat(ringAt(P, ring, z0)))),
    crease: inner ? open(ringAt(P, run(inner, front), z1)) : '',
  };
}

export const rings = (x0: number, y0: number, x1: number, y1: number, r: number, b: number): [Sample[], Sample[]] => [
  rrect(x0, y0, x1, y1, r),
  rrect(x0 + b, y0 + b, x1 - b, y1 - b, Math.max(0.3, r - b)),
];

export const shift = (ring: Sample[], dx: number, dy: number): Sample[] => ring.map((q) => ({ ...q, u: q.u + dx, v: q.v + dy }));

/* ---- motion: the continuous clock (springs) and the discrete clock (tweens) ---- */

let reduced = false;
export const setReducedMotion = (on: boolean) => {
  reduced = on;
};
export const reducedMotion = () => reduced;

export interface Spring {
  x: number;
  v: number;
  t: number;
  k: number;
  c: number;
  m: number;
  eps: number;
}
export const spring = (x: number, o: Partial<Spring> = {}): Spring => ({ x, v: 0, t: x, k: o.k ?? 100, c: o.c ?? 18, m: o.m ?? 1, eps: o.eps ?? 0.01 });

export function stepS(sp: Spring, dt: number): boolean {
  if (reduced) {
    sp.x = sp.t;
    sp.v = 0;
    return false;
  }
  const n = Math.max(1, Math.ceil(dt * 240)),
    h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = (-sp.k * (sp.x - sp.t) - sp.c * sp.v) / sp.m;
    sp.v += a * h;
    sp.x += sp.v * h;
  }
  if (Math.abs(sp.x - sp.t) < sp.eps && Math.abs(sp.v) < sp.eps * 10) {
    sp.x = sp.t;
    sp.v = 0;
    return false;
  }
  return true;
}

export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1,
    bx = 3 * (x2 - x1) - cx,
    ax = 1 - cx - bx;
  const cy = 3 * y1,
    by = 3 * (y2 - y1) - cy,
    ay = 1 - cy - by;
  const X = (u: number) => ((ax * u + bx) * u + cx) * u;
  const Y = (u: number) => ((ay * u + by) * u + cy) * u;
  const dX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const e = X(u) - t;
      if (Math.abs(e) < 1e-5) break;
      const d = dX(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    if (!(u >= 0 && u <= 1) || Math.abs(X(u) - t) > 1e-4) {
      let lo = 0,
        hi = 1;
      u = t;
      for (let i = 0; i < 24; i++) {
        if (X(u) < t) lo = u;
        else hi = u;
        u = (lo + hi) / 2;
      }
    }
    return Y(u);
  };
}

export const EASE_LIFT = bezier(0.32, 0.72, 0, 1);
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/** Maps progress p onto a sub-window [a,b] of a cycle, eased. */
export const phase = (p: number, a: number, b: number) => easeInOut(clamp((p - a) / (b - a), 0, 1));
