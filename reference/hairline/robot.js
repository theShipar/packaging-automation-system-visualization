/**
 * Robot: a three-link pick-and-place arm on a turntable, standing in a marked
 * cell behind two short belts, the pick belt upstream and the place belt down.
 * The pointer's x swings the arm on its spring between the two, within a
 * clamped arc; the elbow reaches and the forearm dips as it nears either end,
 * and the gripper opens. The read-out is the reach from pick (0%) to place
 * (100%). The slider is the arc, in degrees either side.
 *
 * The pattern: scrub one value along a chain. Links are rounded slabs in their
 * own planes, painted shoulder to gripper, which is also far to near.
 */
const {
  Cam, circ, fit, hull, open, poly, prism, proj, rad, rings, rrect, run, seg, facing,
  spring, stepS, mk, pointer, put, register, disposer, solid,
} = HL;

const SZ = 34, L1 = 46, L2 = 52, A1 = 60, A2 = 16, REST = -7;
const BY0 = 56, BY1 = 78, BZ = 12;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let arc = value, over = null;

  // Fitted with the arm swung to either end of the widest arc.
  const C = Cam(45, 0.5, 1.92);
  fit(C, [[-26, -26, 0], [26, 26, 0], [-86, BY1, 0], [86, BY0, 0], [-86, BY0, 0], [86, BY1, 0], [0, 18, 80], [-20, 10, 80], [20, 10, 80]], 200, 166);
  const P = proj(C), front = facing(C);
  const vs = Math.sin(C.az), vc = Math.cos(C.az), vk = C.k / Math.sqrt(1 - C.k * C.k);
  const g = mk("g", {}, svg);

  const box = (x0, y0, x1, y1, z0, z1, r, b) => {
    const s = solid(g), [ring, inner] = rings(x0, y0, x1, y1, r, b);
    put(s, prism(P, front, ring, inner, z0, z1));
    return s;
  };
  const line = (d, cls) => mk("path", { d, class: cls }, g);
  const add = (a, b, t = 1) => [a[0] + b[0] * t, a[1] + b[1] * t, a[2] + b[2] * t];

  /** A rounded slab whose ring lies in the plane of U and V through o, standing from h0 to h1 along N. */
  function slab(o, U, V, N, ring, inner, h0, h1) {
    const W = (q, h) => P(o[0] + q.u * U[0] + q.v * V[0] + h * N[0], o[1] + q.u * U[1] + q.v * V[1] + h * N[1], o[2] + q.u * U[2] + q.v * V[2] + h * N[2]);
    const keep = (q) => (q.nu * U[0] + q.nv * V[0]) * vs + (q.nu * U[1] + q.nv * V[1]) * vc + (q.nu * U[2] + q.nv * V[2]) * vk >= -1e-6;
    return { sil: poly(hull(ring.map((q) => W(q, h0)).concat(ring.map((q) => W(q, h1))))), crease: open(run(inner, keep).map((q) => W(q, h1))) };
  }
  /** A footprint turned to yaw th about (cx, cy): local u runs across the arm, v along it. */
  const turn = (ring, th, cx, cy) => {
    const c = Math.cos(rad(th)), s = Math.sin(rad(th));
    return ring.map((q) => ({ u: cx + q.u * c + q.v * s, v: cy - q.u * s + q.v * c, nu: q.nu * c + q.nv * s, nv: -q.nu * s + q.nv * c }));
  };

  // Back to front: the cell's floor mark, the plinth and turntable, the belts and their kits, then the arm.
  line(poly(rrect(-34, -34, 34, 46, 12, 5).map((q) => P(q.u, q.v, 0))), "nf dash");
  box(-24, -24, 24, 24, 0, 10, 6, 1.6);
  const tt = circ(15, 32), ti = circ(13.6, 32);
  put(solid(g), prism(P, front, tt, ti, 10, 17));
  for (const [x0, x1, kx] of [[-86, -12, -36], [12, 86, 38]]) {
    box(x0, BY0, x1, BY1, 0, BZ, 4, 1.4);
    line([x0 + 10, x1 - 10].map((x) => seg(P(x, BY0 + 4, BZ), P(x, BY1 - 4, BZ))).join(""), "nf lo");
    box(kx - 8, 60, kx + 8, 74, BZ, BZ + 9, 2, 1);
    line(seg(P(kx, 60, BZ + 9), P(kx, 74, BZ + 9)), "nf lo");
  }
  const parts = ["housing", "shoulder", "upper", "elbow", "fore"].map(() => solid(g));
  const hose = line("", "nf");
  const wrist = solid(g), fa = solid(g), fb = solid(g);
  fa.sil.classList.add("hi"); fb.sil.classList.add("hi");

  const yaw = spring(REST, { eps: 0.02 }), ext = spring(0.25, { eps: 0.004 });
  let drawn = "", shown = "";
  const hub = circ(7.5, 20), hubIn = circ(6.4, 20), knuckle = circ(5.6, 20), knIn = circ(4.6, 20);
  const bar = (L, w) => [rrect(-3, -w / 2, L + 3, w / 2, w / 2, 4), rrect(-1.8, -w / 2 + 1.2, L + 1.8, w / 2 - 1.2, w / 2 - 1.2, 4)];
  const [ub, ui] = bar(L1, 11), [fbr, fbi] = bar(L2, 9);

  function draw() {
    const th = yaw.x, e = ext.x, key = th.toFixed(3) + e.toFixed(4);
    if (key === drawn) return;
    drawn = key;
    const d = [Math.sin(rad(th)), Math.cos(rad(th)), 0], pp = [Math.cos(rad(th)), -Math.sin(rad(th)), 0], up = [0, 0, 1];
    const a1 = rad(A1 - 8 * e), a2 = rad(A2 + 14 * e);
    const U1 = [d[0] * Math.cos(a1), d[1] * Math.cos(a1), Math.sin(a1)], U2 = [d[0] * Math.cos(a2), d[1] * Math.cos(a2), -Math.sin(a2)];
    const S = [0, 0, SZ], E = add(S, U1, L1), Wp = add(E, U2, L2);
    const nrm = (U) => [U[1] * pp[2] - U[2] * pp[1], U[2] * pp[0] - U[0] * pp[2], U[0] * pp[1] - U[1] * pp[0]];
    const [hr, hn] = rings(-10, -11, 10, 9, 5, 1.4);
    put(parts[0], prism(P, front, turn(hr, th, 0, 0), turn(hn, th, 0, 0), 17, SZ - 4));
    put(parts[1], slab(S, d, up, pp, hub, hubIn, -9, 9));
    put(parts[2], slab(S, U1, pp, nrm(U1), ub, ui, -3.5, 3.5));
    put(parts[3], slab(E, d, up, pp, hub, hubIn, -7, 7));
    put(parts[4], slab(E, U2, pp, nrm(U2), fbr, fbi, -3, 3));
    // the vacuum line, on the side that faces the viewer
    const side = pp[0] * vs + pp[1] * vc >= 0 ? 1 : -1;
    const off = (p, t, z) => P(p[0] + pp[0] * t * side, p[1] + pp[1] * t * side, p[2] + z);
    hose.setAttribute("d", open([off(S, 10, 3), off(add(S, U1, L1 * 0.5), 7, 3), off(E, 8.5, 4), off(add(E, U2, L2 * 0.5), 6, 2.5), off(Wp, 6, 0)]));
    const [wr, wn] = rings(-6, -6, 6, 6, 3, 1.2);
    put(wrist, prism(P, front, turn(wr, th, Wp[0], Wp[1]), turn(wn, th, Wp[0], Wp[1]), Wp[2] - 10, Wp[2] + 2));
    const gapw = 3.2 + 5 * e, [fr, fn] = rings(-1.3, -4.5, 1.3, 4.5, 1.2, 0.5);
    const near = side > 0 ? 1 : -1;
    put(fa, prism(P, front, turn(fr, th, Wp[0] - pp[0] * gapw * near, Wp[1] - pp[1] * gapw * near), turn(fn, th, Wp[0] - pp[0] * gapw * near, Wp[1] - pp[1] * gapw * near), Wp[2] - 24, Wp[2] - 9));
    put(fb, prism(P, front, turn(fr, th, Wp[0] + pp[0] * gapw * near, Wp[1] + pp[1] * gapw * near), turn(fn, th, Wp[0] + pp[0] * gapw * near, Wp[1] + pp[1] * gapw * near), Wp[2] - 24, Wp[2] - 9));
  }
  function caption() {
    const t = over ? "reach " + Math.round(50 + (50 * yaw.x) / arc) + "%" : "rest";
    if (t !== shown) { shown = t; read.textContent = t; }
  }

  const B = register(stage, (dt) => {
    const a = stepS(yaw, dt), b = stepS(ext, dt);
    draw();
    caption();
    return a || b;
  });
  bag.add(B.unregister);

  // The pointer's x on the stage, a band that never moves, sets the yaw; the ends of the arc open the gripper.
  function retarget() {
    if (!over) { yaw.t = REST; ext.t = 0.25; }
    else {
      const t = Math.max(-1, Math.min(1, (over[0] - 200) / 130));
      yaw.t = t * arc;
      ext.t = Math.abs(t);
    }
    B.wake();
  }

  bag.add(pointer(stage, {
    move: (p) => { over = p; retarget(); },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { arc = v; retarget(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "robot",
  means: "A pick-and-place arm on a turntable: the pointer swings it from the pick belt to the place belt, and the gripper opens at either end.",
  rules: [1, 3, 5, 8],
  range: [14, 24, 34],
  tour: [[110, 150], [300, 150], [215, 120], null],
  mount,
});
