/*
 * The six station figures, ported from the validated Hairline references in
 * reference/hairline/*.js and re-ordered for the az -45 camera (viewer upstream, near side +y).
 * Figures draw machinery only; products live in the ProductLayer. Parts that a product passes
 * behind (heads, near rails, hood posts, gripper, carton walls, gate posts) are front groups.
 */
import type { StationId } from '../domain/types';
import { Builder, turn, type FigureDef, type RobotJoints } from './builder';
import { circ, open, phase, poly, rad, ringAt, rings, rrect, run, seg, type Pt, type Sample, type V3 } from './iso';

/* ------------------------------------------------------------------ 01 intake */

const intake: FigureDef = {
  id: 'intake',
  lane: 15,
  xEntry: -50,
  xExit: 132,
  work: [61, 15, 12],
  ramps: [],
  extent: [
    [-50, -7, 0],
    [-50, 39, 0],
    [132, 39, 0],
    [132, -7, 0],
    [61, -7, 57],
    [61, 37, 57],
  ],
  draw(b, pose) {
    const BZ = 12, BY1 = 30, AX0 = 56, AX1 = 66, PY0 = -7, PY1 = 37, AZ = 50, AT = 57;
    const HX0 = 52, HX1 = 70, HY0 = 6, HY1 = 24, HH = 10, REST = 26, RH = 8, RT = 2;
    const { P, front } = b.v;
    const m = pose.m;
    const dip = m === null ? 0 : phase(m, 0.25, 0.38) - phase(m, 0.62, 0.75);
    const hz = REST + 9 * pose.hover - 5 * dip;
    const lean = (rest: number) => rest + 8 * pose.hover;
    const rail = (x0: number, x1: number, side: number, rest: number) => {
      const deg = lean(rest);
      const y0 = side < 0 ? 0 : BY1 - RT, dy = side * RH * Math.sin(rad(deg)), zt = BZ + RH * Math.cos(rad(deg));
      const foot = rrect(x0, y0, x1, y0 + RT, 1, 3), top = rrect(x0, y0 + dy, x1, y0 + RT + dy, 1, 3);
      const inner = rrect(x0 + 0.6, y0 + dy + 0.6, x1 - 0.6, y0 + RT + dy - 0.6, 0.3, 3);
      b.raw(ringAt(P, foot, BZ).concat(ringAt(P, top, zt)), ringAt(P, run(inner, front), zt), 'INT-GATE-01');
    };

    b.box(AX0, PY0, AX1, PY0 + 4, 0, AZ, 2, 1, 'INT-CONTROLLER-01');
    b.box(0, 0, 132, BY1, 0, BZ, 4, 1.6, 'INT-BELT-01');
    b.line([116, 90, 44, 14].map((x) => seg(P(x, 4, BZ), P(x, BY1 - 4, BZ))).join(''));
    rail(72, 128, -1, 9);
    rail(6, 50, -1, 4);
    b.box(-50, -4, -8, 34, 0, 5, 5, 1.8, 'INT-TRAY-01');
    const cartons: [number, number][] = [
      [-30, 8],
      [-46, 0],
      [-46, 16],
    ];
    cartons.slice(0, pose.supply).forEach(([x, y]) => {
      b.box(x, y, x + 12, y + 12, 5, 15, 2, 1, 'INT-TRAY-01');
      b.seg3([x + 6, y, 15], [x + 6, y + 12, 15]);
    });

    b.front('scanner', [61, 15, hz], () => {
      b.seg3([61, 15, hz + HH], [61, 15, AZ], 'nf');
      b.box(HX0, HY0, HX1, HY1, hz, hz + HH, 3, 1.2, 'INT-SCANNER-01', true);
      b.line(seg(P(HX0, HY0 + 4, hz + 3.2), P(HX0, HY1 - 4, hz + 3.2)), 'nf');
    });
    b.front('rail-far-end', [72, BY1, BZ], () => rail(72, 128, 1, 13));
    b.front('rail-near-end', [6, BY1, BZ], () => rail(6, 50, 1, 6));
    b.front('post', [61, 35, 0], () => b.box(AX0, PY1 - 4, AX1, PY1, 0, AZ, 2, 1, 'INT-CONTROLLER-01'));
    b.front('eye', [44.5, 36.5, 0], () => {
      b.box(42, 34, 47, 39, 0, 19, 1.6, 0.6, 'INT-PHOTOEYE-01');
      b.dot(44.5, 36.5, 19, 0.9, m !== null && m < 0.85 ? 'dot' : 'dot off');
    });
    b.front('beam', [61, 15, AZ], () => b.box(AX0 - 1, PY0, AX1 + 1, PY1, AZ, AT, 3, 1.2, 'INT-CONTROLLER-01'));
  },
};

/* ------------------------------------------------------------------ 02 assembly */

const assembly: FigureDef = {
  id: 'assembly',
  lane: 22,
  xEntry: -16,
  xExit: 140,
  work: [56, 22, 18],
  ramps: [[44, 68, 18]],
  extent: [
    [-16, 8, 0],
    [-16, 36, 0],
    [140, 36, 0],
    [140, 8, 0],
    [34, -64, 46],
    [78, -64, 46],
    [56, -31, 74],
    [56, 30, 74],
  ],
  draw(b, pose) {
    const BZ = 12, FZ = 18, KZ = 27, AZ = 66, AT = 74, HH = 10, GAP = 12, HY = -46, HZ = 40, L = 54;
    const { P, front } = b.v;
    const m = pose.m;
    const tilted = (a: number, u0: number, u1: number, v0: number, v1: number, h0: number, h1: number, r: number, bb: number, comp: string) => {
      const ca = Math.cos(rad(a)), sa = Math.sin(rad(a));
      const W = (q: Sample, h: number): Pt => P(q.u, HY + q.v * ca + h * sa, HZ - q.v * sa + h * ca);
      const ring = rrect(u0, v0, u1, v1, r, 3), inner = rrect(u0 + bb, v0 + bb, u1 - bb, v1 - bb, Math.max(0.3, r - bb), 3);
      b.raw(ring.map((q) => W(q, h0)).concat(ring.map((q) => W(q, h1))), run(inner, front).map((q) => W(q, h1)), comp);
    };
    const tipBat = m === null ? 0 : phase(m, 0.15, 0.24) - phase(m, 0.3, 0.38);
    const tipIns = m === null ? 0 : phase(m, 0.38, 0.47) - phase(m, 0.52, 0.6);
    const chute = (x: number, a: number, part: [number, number, number], tip: number, comp: string) => {
      const ang = a - 9 * tip - 4 * pose.hover;
      tilted(ang, x - 5, x + 5, 0, L, 0, 2.5, 2, 0.8, comp);
      const slide = 12 * tip;
      tilted(ang, x - 3.6, x + 3.6, part[0] + slide, part[1] + slide, 2.5, 2.5 + part[2], 1.4, 0.6, comp);
    };

    b.box(64, -64, 78, HY, 0, 46, 3, 1.2, 'ASM-INSERT-FEED-01');
    b.box(34, -64, 48, HY, 0, 46, 3, 1.2, 'ASM-BAT-FEED-01');
    chute(71, 21, [28, 41, 1.4], tipIns, 'ASM-INSERT-FEED-01');
    b.box(50, -31, 62, -20, 0, AZ, 3, 1.2, 'ASM-PRESS-01');
    chute(41, 24, [30, 40, 4], tipBat, 'ASM-BAT-FEED-01');

    b.box(-16, 8, 140, 36, 0, BZ, 4, 1.6, 'ASM-DRIVE-01');
    b.line([124, 96, 22, 0].map((x) => seg(P(x, 12, BZ), P(x, 32, BZ))).join(''));
    b.box(44, 10, 68, 34, BZ, FZ, 3, 1.2, 'ASM-FIXTURE-01');
    const clamp1 = m === null ? 0 : phase(m, 0, 0.12) - phase(m, 0.84, 0.96);
    const j = 1.6 * clamp1;
    b.box(46, 9 + j, 66, 13 + j, FZ, FZ + 8, 1.5, 0.6, 'ASM-ALIGN-01');

    const press = m === null ? 0 : phase(m, 0.6, 0.72) - phase(m, 0.76, 0.86);
    const hz = KZ + GAP + 10 * pose.hover - (GAP - 0.5) * press;
    const [hr, hn] = rings(47, 13, 65, 31, 3, 1.2), [rr, rn] = rings(53, 19, 59, 25, 2, 0.7);
    b.front('press', [56, 22, hz], () => {
      b.solidRings(hr, hn, hz, hz + HH, 'ASM-PRESS-01', true);
      b.solidRings(rr, rn, hz + HH, AZ, 'ASM-PRESS-01');
    });
    b.front('jaw', [56, 33, FZ], () => b.box(46, 31 - j, 66, 35 - j, FZ, FZ + 8, 1.5, 0.6, 'ASM-ALIGN-01'));
    b.front('beam', [56, 0, AZ], () => b.box(49, -31, 63, 30, AZ, AT, 3, 1.2, 'ASM-PRESS-01'));
  },
};

/* ------------------------------------------------------------------ 03 robot */

export const ROBOT = { SZ: 34, L1: 46, L2: 52, PICK: [-36, 67, 12] as V3, PLACE: [38, 67, 12] as V3 };
export const ROBOT_HOME: RobotJoints = { th: 0, a1: rad(59), a2: rad(17), e: 0.25 };

/** Wrist point for a joint set (local robot coordinates). */
export function robotWrist(j: RobotJoints): V3 {
  const d = [Math.sin(rad(j.th)), Math.cos(rad(j.th))];
  const r = ROBOT.L1 * Math.cos(j.a1) + ROBOT.L2 * Math.cos(j.a2);
  return [d[0] * r, d[1] * r, ROBOT.SZ + ROBOT.L1 * Math.sin(j.a1) - ROBOT.L2 * Math.sin(j.a2)];
}

const robot: FigureDef = {
  id: 'robot',
  lane: 67,
  xEntry: -86,
  xExit: 106,
  work: ROBOT.PICK,
  place: ROBOT.PLACE,
  ramps: [],
  extent: [
    [-34, -34, 0],
    [34, 46, 0],
    [-86, 78, 0],
    [106, 56, 0],
    [-86, 56, 0],
    [106, 78, 0],
    [0, 18, 80],
    [-20, 10, 80],
    [20, 10, 80],
  ],
  draw(b, pose) {
    const { SZ, L1, L2 } = ROBOT;
    const BY0 = 56, BY1 = 78, BZ = 12;
    const { P, vs, vc, vk } = b.v;
    const J = pose.robot ?? ROBOT_HOME;
    const th = J.th, e = J.e;
    const add = (a: V3, d: V3, t = 1): V3 => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
    const slab = (o: V3, U: V3, V: V3, N: V3, ring: Sample[], inner: Sample[], h0: number, h1: number, comp: string, restHi = false) => {
      const W = (q: Sample, h: number) => P(o[0] + q.u * U[0] + q.v * V[0] + h * N[0], o[1] + q.u * U[1] + q.v * V[1] + h * N[1], o[2] + q.u * U[2] + q.v * V[2] + h * N[2]);
      const keep = (q: Sample) => (q.nu * U[0] + q.nv * V[0]) * vs + (q.nu * U[1] + q.nv * V[1]) * vc + (q.nu * U[2] + q.nv * V[2]) * vk >= -1e-6;
      b.raw(ring.map((q) => W(q, h0)).concat(ring.map((q) => W(q, h1))), run(inner, keep).map((q) => W(q, h1)), comp, restHi);
    };

    const d: V3 = [Math.sin(rad(th)), Math.cos(rad(th)), 0], pp: V3 = [Math.cos(rad(th)), -Math.sin(rad(th)), 0], up: V3 = [0, 0, 1];
    const U1: V3 = [d[0] * Math.cos(J.a1), d[1] * Math.cos(J.a1), Math.sin(J.a1)], U2: V3 = [d[0] * Math.cos(J.a2), d[1] * Math.cos(J.a2), -Math.sin(J.a2)];
    const S: V3 = [0, 0, SZ], E = add(S, U1, L1), Wp = add(E, U2, L2);
    const nrm = (U: V3): V3 => [U[1] * pp[2] - U[2] * pp[1], U[2] * pp[0] - U[0] * pp[2], U[0] * pp[1] - U[1] * pp[0]];
    const hub = circ(7.5, 20), hubIn = circ(6.4, 20);
    const bar = (Lx: number, w: number) => [rrect(-3, -w / 2, Lx + 3, w / 2, w / 2, 4), rrect(-1.8, -w / 2 + 1.2, Lx + 1.8, w / 2 - 1.2, w / 2 - 1.2, 4)];
    const [ub, ui] = bar(L1, 11), [fbr, fbi] = bar(L2, 9);
    const [hr, hn] = rings(-10, -11, 10, 9, 5, 1.4);

    b.line(poly(rrect(-34, -34, 34, 46, 12, 5).map((q) => P(q.u, q.v, 0))), 'nf dash');
    b.box(-24, -24, 24, 24, 0, 10, 6, 1.6, 'ROB-BASE-01');
    b.solidRings(circ(15, 32), circ(13.6, 32), 10, 17, 'ROB-BASE-01');
    b.solidRings(turn(hr, th, 0, 0), turn(hn, th, 0, 0), 17, SZ - 4, 'ROB-ENCODER-01');
    slab(S, d, up, pp, hub, hubIn, -9, 9, 'ROB-SHOULDER-01');
    slab(S, U1, pp, nrm(U1), ub, ui, -3.5, 3.5, 'ROB-SHOULDER-01');
    for (const [x0, x1] of [
      [12, 106],
      [-86, -12],
    ]) {
      b.box(x0, BY0, x1, BY1, 0, BZ, 4, 1.4, 'ROB-GUARD-01');
      b.line([x1 - 10, x0 + 10].map((x) => seg(P(x, BY0 + 4, BZ), P(x, BY1 - 4, BZ))).join(''));
    }

    const side = pp[0] * vs + pp[1] * vc >= 0 ? 1 : -1;
    const off = (q: V3, t: number, z: number) => P(q[0] + pp[0] * t * side, q[1] + pp[1] * t * side, q[2] + z);
    b.front('elbow', [E[0], E[1], E[2] - 7], () => slab(E, d, up, pp, hub, hubIn, -7, 7, 'ROB-ELBOW-01'));
    b.front('forearm', [Wp[0], Wp[1], Wp[2]], () => {
      slab(E, U2, pp, nrm(U2), fbr, fbi, -3, 3, 'ROB-ELBOW-01');
      const hosePts = [off(S, 10, 3), off(add(S, U1, L1 * 0.5), 7, 3), off(E, 8.5, 4), off(add(E, U2, L2 * 0.5), 6, 2.5), off(Wp, 6, 0)];
      b.line(open(hosePts), 'nf');
      (b.compPts['ROB-VACUUM-01'] ??= []).push(...hosePts);
    });
    const gapw = 3.2 + 5 * e, [fr, fn] = rings(-1.3, -4.5, 1.3, 4.5, 1.2, 0.5);
    const fingerAt = (sgn: number) => [Wp[0] + pp[0] * gapw * sgn * side, Wp[1] + pp[1] * gapw * sgn * side] as const;
    const far = fingerAt(-1), near = fingerAt(1);
    const grip: V3 = [Wp[0], Wp[1], Wp[2] - 10];
    b.front('finger-far', grip, () => b.solidRings(turn(fr, th, far[0], far[1]), turn(fn, th, far[0], far[1]), Wp[2] - 24, Wp[2] - 9, 'ROB-GRIPPER-01', true), -0.01);
    const [wr, wn] = rings(-6, -6, 6, 6, 3, 1.2);
    b.front('wrist', grip, () => b.solidRings(turn(wr, th, Wp[0], Wp[1]), turn(wn, th, Wp[0], Wp[1]), Wp[2] - 10, Wp[2] + 2, 'ROB-WRIST-01'));
    b.front('finger-near', grip, () => b.solidRings(turn(fr, th, near[0], near[1]), turn(fn, th, near[0], near[1]), Wp[2] - 24, Wp[2] - 9, 'ROB-GRIPPER-01', true), 0.01);
  },
};

/* ------------------------------------------------------------------ 04 qa */

/** Reject route (local): scale → divert point → across the belt → down the chute into a tray slot. */
export const QA_REJECT = { push: [84, 14, 12] as V3, edge: [84, 30, 12] as V3, tray: [[85, 47, 1.5], [103, 47, 1.5]] as V3[] };

const qa: FigureDef = {
  id: 'qa',
  lane: 14,
  xEntry: -12,
  xExit: 150,
  work: [64, 14, 14],
  ramps: [[52, 76, 14]],
  extent: [
    [-12, 0, 0],
    [-12, 28, 0],
    [150, 28, 0],
    [150, -10, 0],
    [112, 56, 0],
    [76, 56, 0],
    [32, -12, 63],
    [64, 13, 94],
    [32, 35, 63],
  ],
  draw(b, pose) {
    const BZ = 12, RZ = 58, RT = 63, CH = 11, LENS = 5.5, CX = 64, CY = 14;
    const { P, front } = b.v;
    const m = pose.m;
    const qturn = (ring: Sample[], th: number, cx: number, cy: number): Sample[] => {
      const c = Math.cos(rad(th)), s = Math.sin(rad(th));
      return ring.map((q) => ({ u: cx + q.u * c - q.v * s, v: cy + q.u * s + q.v * c, nu: q.nu * c - q.nv * s, nv: q.nu * s + q.nv * c }));
    };
    const age = pose.rejectAge;
    const swing = age === null ? 0 : phase(age, 0.15, 0.3) - phase(age, 0.55, 0.85);

    b.box(106, -11, 114, -5, 0, 30, 2, 0.8, 'QA-BARCODE-01');
    b.box(40, -12, 96, -5, 0, RT, 3, 1.2, 'QA-CONTROLLER-01');
    b.box(-12, 0, 150, 28, 0, BZ, 4, 1.5);
    b.line([138, 116, 26, 4].map((x) => seg(P(x, 4, BZ), P(x, 24, BZ))).join(''));
    b.box(CX - 16, 3, CX + 16, 25, BZ, BZ + 2, 3, 1.2, 'QA-SCALE-01');
    const [dr, dn] = rings(-1.4, 0, 1.4, 20, 1.2, 0.5);
    b.solidRings(qturn(dr, 85 - 60 * swing, 92, -1), qturn(dn, 85 - 60 * swing, 92, -1), BZ, BZ + 9, 'QA-DIVERTER-01');
    b.box(103, -8, 117, 6, 26, 33, 2.5, 1, 'QA-BARCODE-01');
    b.line(seg(P(103, -4, 28.5), P(103, 3, 28.5)), 'nf');
    b.box(76, 38, 112, 56, 0, 6, 4, 2.2, 'QA-REJECT-TRAY-01');
    b.line(open(ringAt(P, run(rrect(78.2, 40.2, 109.8, 53.8, 1.8, 4), (q) => !front(q)), 1.5)));

    if (m !== null && !pose.done && m > 0.2 && m < 0.5) {
      const x = CX - 7 + 14 * phase(m, 0.2, 0.5);
      b.front('scanline', [CX, CY, BZ + 11], () => b.seg3([x, CY - 8, BZ + 11.5], [x, CY + 8, BZ + 11.5], 'nf dash'));
    }
    b.front('post-up', [99.5, 32.5, 0], () => b.box(97, 30, 102, 35, 0, RZ, 2, 0.8, 'QA-LIGHT-01'));
    b.front('post-down', [36.5, 32.5, 0], () => b.box(34, 30, 39, 35, 0, RZ, 2, 0.8, 'QA-LIGHT-01'));
    const at = (q: Sample) => ({ ...q, u: q.u + CX, v: q.v + CY });
    const focus = m !== null && !pose.done ? phase(m, 0.18, 0.26) - phase(m, 0.46, 0.54) : 0;
    const z = RT + 4 + 12 * pose.hover - 2 * focus;
    b.front('hood', [68, 11.5, RZ], () => {
      b.box(32, -12, 104, 35, RZ, RT, 4, 1.4, 'QA-LIGHT-01');
      b.solidRings(circ(9, 28).map(at), circ(7.6, 28).map(at), RT, RT + 2, 'QA-CAMERA-01');
      b.solidRings(circ(LENS, 24).map(at), circ(LENS - 1.1, 24).map(at), RT + 2, z, 'QA-LENS-01', true);
      const [br, bn] = rings(CX - 8, CY - 10, CX + 8, CY + 10, 3, 1.2);
      b.solidRings(br, bn, z, z + CH, 'QA-CAMERA-01');
      b.dot(CX - 4, CY - 6, z + CH, 0.9, focus > 0.5 ? 'dot' : 'dot m');
    });
  },
};

/* ------------------------------------------------------------------ 05 packaging */

/** The formed carton, shared by the forming station and the product layer so the morph is exact. */
export const CARTON = { L: 18, W: 14, H: 14 };

export function drawCarton(b: Builder, x: number, y: number, z: number, h = CARTON.H, label = true) {
  const { P } = b.v;
  const hx = CARTON.L / 2, hy = CARTON.W / 2;
  b.box(x - hx, y - hy, x + hx, y + hy, z, z + h, 1.6, 1);
  if (h >= CARTON.H - 1e-6) {
    b.seg3([x - hx, y, z + h], [x + hx, y, z + h]);
    if (label) b.line(poly(rrect(x - 5, y + 1, x + 5, y + 6, 1, 3).map((q) => P(q.u, y + hy, z + 3 + (q.v - y - 1)))));
  }
}

const packaging: FigureDef = {
  id: 'packaging',
  lane: 14,
  xEntry: -10,
  xExit: 150,
  work: [76, 14, 12],
  ramps: [],
  extent: [
    [-10, 0, 0],
    [-10, 28, 0],
    [150, 28, 0],
    [150, -14, 0],
    [-6, -40, 0],
    [20, -40, 0],
    [48, -15, 72],
    [102, 22, 72],
    [76, 34, 26],
  ],
  draw(b, pose) {
    const BZ = 12, CZ = BZ + CARTON.H, GAP = 14, HH = 8, BMZ = 66, BMT = 72, FX0 = 67, FX1 = 85, FL = 7;
    const { P, vs, vc, vk } = b.v;
    const m = pose.m;
    const flap = (side: number, th: number, y0: number) => {
      const s = Math.sin(rad(th)), c = Math.cos(rad(th));
      const U = [0, side * s, c], N = [0, side * c, -s];
      const ring = rrect(FX0, 0, FX1, FL, 1.4, 3), inner = rrect(FX0 + 0.7, 0.7, FX1 - 0.7, FL - 0.7, 0.7, 3);
      const W = (q: Sample, h: number) => P(q.u, y0 + q.v * U[1] + h * N[1], CZ + q.v * U[2] + h * N[2]);
      const keep = (q: Sample) => q.nu * vs + q.nv * (U[1] * vc + U[2] * vk) >= -1e-6;
      b.raw(ring.map((q) => W(q, 0)).concat(ring.map((q) => W(q, 1.2))), run(inner, keep).map((q) => W(q, 1.2)), 'PKG-FORMER-01');
    };

    b.box(-6, -40, 20, -12, 0, 16, 4, 1.4, 'PKG-CARTON-MAG-01');
    for (let k = 0; k < 4; k++) b.box(-3 + (k % 2), -37 + k * 0.6, 17 + (k % 2), -15 + k * 0.6, 16 + k * 1.6, 17.2 + k * 1.6, 2, 0.5, 'PKG-CARTON-MAG-01');
    b.box(112, -13, 120, -7, 0, 30, 2, 0.8, 'PKG-LABELER-01');
    b.box(50, -15, 100, -8, 0, BMZ, 3, 1.2, 'PKG-FORMER-01');
    b.box(-10, 0, 150, 28, 0, BZ, 4, 1.5, 'PKG-BELT-01');
    b.line([136, 110, 30, 4].map((x) => seg(P(x, 4, BZ), P(x, 24, BZ))).join(''));
    b.box(110, -10, 124, 3, 20, 28, 2.5, 1, 'PKG-LABELER-01');
    b.line(seg(P(110, -6, 22.5), P(110, 0, 22.5)), 'nf');
    b.box(132, 29, 146, 34, 1, 9, 2, 0.8, 'PKG-DRIVE-01');

    const forming = m !== null && !pose.done;
    if (forming) {
      const rise = phase(m!, 0.1, 0.3);
      const fold = phase(m!, 0.3, 0.5);
      b.front('carton', [76, 14, BZ], () => {
        const cy = 14;
        if (m! < 0.5) {
          if (rise > 0) {
            if (fold < 0.5 && rise >= 1) flap(-1, 44 + (-88 - 44) * fold, cy - CARTON.W / 2);
            drawCarton(b, 76, cy, BZ, CARTON.H * rise, false);
            if (rise >= 1) {
              if (fold >= 0.5) flap(-1, 44 + (-88 - 44) * fold, cy - CARTON.W / 2);
              flap(1, 94 + (-88 - 94) * fold, cy + CARTON.W / 2);
            }
          }
        } else drawCarton(b, 76, cy, BZ, CARTON.H, m! >= 0.8);
      }, 0.5);
    }
    const seal = forming ? phase(m!, 0.5, 0.6) - phase(m!, 0.64, 0.72) : 0;
    const hz = CZ + GAP + 12 * pose.hover - (GAP - 0.2) * seal;
    const [hr, hn] = rings(63, 4, 89, 24, 3, 1.2), [rr, rn] = rings(-2.2, -2.2, 2.2, 2.2, 1.6, 0.6);
    const rodRing = (x: number, ring: Sample[]) => ring.map((q) => ({ ...q, u: q.u + x, v: q.v + 14 }));
    b.front('sealer', [76, 14, hz], () => {
      for (const x of [84, 68]) b.solidRings(rodRing(x, rr), rodRing(x, rn), hz + HH, BMZ, 'PKG-HEATER-01');
      b.solidRings(hr, hn, hz, hz + HH, 'PKG-SEALER-01', true);
    });
    b.front('beam', [75, 3.5, BMZ], () => b.box(48, -15, 102, 22, BMZ, BMT, 4, 1.4, 'PKG-HEATER-01'));
    b.front('eye', [104, 33, 0], () => {
      b.box(102, 31, 106, 35, 0, 17, 1.5, 0.6, 'PKG-PHOTOEYE-01');
      b.dot(104, 33, 17, 0.9, pose.done || pose.status === 'faulted' ? 'dot' : 'dot off');
    });
  },
};

/* ------------------------------------------------------------------ 06 dispatch */

/** Case geometry and pallet slots (local), shared with the product layer. */
export const CASE = { L: 24, W: 18, H: 14, loader: [78, 13, 16] as V3 };
export const PALLET_SLOTS: V3[] = [
  [128, 7, 10],
  [156, 7, 10],
  [128, 25, 10],
  [156, 25, 10],
  [128, 7, 24],
  [156, 7, 24],
];

const dispatch: FigureDef = {
  id: 'dispatch',
  lane: 13,
  xEntry: -20,
  xExit: 172,
  work: [52, 13, 12],
  ramps: [],
  extent: [
    [-20, 2, 0],
    [-20, 24, 0],
    [172, 34, 0],
    [172, -6, 0],
    [105, -6, 44],
    [105, 32, 44],
    [128, -2, 47],
  ],
  draw(b, pose) {
    const BZ = 12, TZ = 16, PZ = 10;
    const { P } = b.v;
    const m = pose.m;
    b.box(112, -6, 172, 34, 0, PZ, 3, 1.2, 'DSP-PALLETIZER-01');
    b.line([160, 142, 124].map((x) => seg(P(x, -6, PZ * 0.45), P(x, 34, PZ * 0.45))).join(''));
    b.box(102, -7, 108, -2, 0, 38, 2, 0.8, 'DSP-GATE-01');
    b.box(60, -2, 98, 28, 0, TZ, 4, 1.5, 'DSP-CASE-LOADER-01');
    b.box(63, -2, 95, 0.5, TZ, TZ + 10, 1, 0.5, 'DSP-COUNTER-01');
    b.box(-20, 2, 62, 24, 0, BZ, 4, 1.4, 'DSP-INFEED-01');
    b.line([44, 18, -6].map((x) => seg(P(x, 6, BZ), P(x, 20, BZ))).join(''));
    b.front('gate', [105, 30.5, 0], () => b.box(102, 28, 108, 33, 0, 38, 2, 0.8, 'DSP-GATE-01'));
    b.front('scanner', [105, 13, 38], () => {
      b.box(101, -7, 109, 33, 38, 44, 2.5, 1, 'DSP-SCANNER-01');
      b.dot(105, 13, 38, 0.9, m !== null && !pose.done && m > 0.2 && m < 0.6 ? 'dot' : 'dot off');
    });
  },
};

export const FIGURES: Record<StationId, FigureDef> = { intake, assembly, robot, qa, packaging, dispatch };
