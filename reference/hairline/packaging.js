/**
 * Packaging: an open carton waits on a belt under a sealing head that hangs on
 * two rods from a cantilevered beam. Behind it stands a stack of flat carton
 * blanks; past it a label applicator reaches over the exit and a sealed pack
 * leaves. The pointer's height lifts the sealer on its spring; the carton's two
 * flaps follow the head, not the pointer, so they open after it, the near one
 * further. The read-out is the seal gap. The slider is the sealer's travel.
 *
 * The pattern: a chain of springs. The head chases the pointer, the flaps
 * chase the head, and the lag between them is the gesture.
 */
const {
  Cam, facing, fit, hull, open, poly, prism, proj, rad, ringAt, rings, rrect, run, seg,
  spring, stepS, flatDot, mk, place, pointer, put, register, disposer, solid,
} = HL;

const BZ = 12, CZ = 27, GAP = 14, HH = 8, BMZ = 66, BMT = 72;
// the flaps' rest lean and how far each opens: the near one rests nearly level so it never turns edge-on
const FX0 = 66, FX1 = 86, FL = 8, FAR = 18, FAR_OPEN = 26, NEAR = 74, NEAR_OPEN = 20;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let travel = value, over = null;

  // Fitted with the sealer at full travel and both flaps at their widest.
  const C = Cam(45, 0.5, 1.98);
  fit(C, [[-10, 0, 0], [-10, 28, 0], [150, 28, 0], [150, -14, 0], [-6, -40, 0], [20, -40, 0], [48, -15, BMT], [102, 22, BMT], [76, 31, CZ]], 200, 166);
  const P = proj(C), front = facing(C);
  const vs = Math.sin(C.az), vc = Math.cos(C.az), vk = C.k / Math.sqrt(1 - C.k * C.k);
  const g = mk("g", {}, svg);

  const box = (x0, y0, x1, y1, z0, z1, r, b) => {
    const s = solid(g), [ring, inner] = rings(x0, y0, x1, y1, r, b);
    put(s, prism(P, front, ring, inner, z0, z1));
    return s;
  };
  const line = (d, cls) => mk("path", { d, class: cls }, g);

  /** A flap hinged along x at (y0, CZ), leaning th degrees out from upright toward side (-1 far, 1 near). */
  function flap(side, th, y0) {
    const s = Math.sin(rad(th)), c = Math.cos(rad(th));
    const U = [0, side * s, c], N = [0, side * c, -s];
    const ring = rrect(FX0, 0, FX1, FL, 1.4, 3), inner = rrect(FX0 + 0.7, 0.7, FX1 - 0.7, FL - 0.7, 0.7, 3);
    const W = (q, h) => P(q.u, y0 + q.v * U[1] + h * N[1], CZ + q.v * U[2] + h * N[2]);
    const keep = (q) => q.nu * vs + q.nv * (U[1] * vc + U[2] * vk) >= -1e-6;
    return { sil: poly(hull(ring.map((q) => W(q, 0)).concat(ring.map((q) => W(q, 1.2))))), crease: open(run(inner, keep).map((q) => W(q, 1.2))) };
  }

  // Back to front: the blank magazine, the back plate and the labeller's post, the belt, the far flap,
  // the carton, the near flap, the sealer and its beam, the labeller's head, the leaving pack, the photoeye.
  box(-6, -40, 20, -12, 0, 16, 4, 1.4);
  for (let k = 0; k < 4; k++) box(-3 + (k % 2), -37 + k * 0.6, 17 + (k % 2), -15 + k * 0.6, 16 + k * 1.6, 17.2 + k * 1.6, 2, 0.5);
  box(50, -15, 100, -8, 0, BMZ, 3, 1.2);
  box(112, -13, 120, -7, 0, 30, 2, 0.8);
  box(-10, 0, 150, 28, 0, BZ, 4, 1.5);
  line([4, 30, 110, 136].map((x) => seg(P(x, 4, BZ), P(x, 24, BZ))).join(""), "nf lo");

  const farF = solid(g);
  box(64, 6, 88, 22, BZ, CZ, 1.6, 1);
  line(open(ringAt(P, run(rrect(65.8, 7.8, 86.2, 20.2, 0.8, 3), (q) => !front(q)), CZ - 8)), "nf lo");
  const nearF = solid(g);

  const rods = [solid(g), solid(g)], head = solid(g);
  head.sil.classList.add("hi");
  box(48, -15, 102, 22, BMZ, BMT, 4, 1.4);
  box(110, -10, 124, 3, 20, 28, 2.5, 1);
  line(seg(P(124, -6, 22.5), P(124, 0, 22.5)), "nf");
  box(128, 7, 144, 21, BZ, BZ + 12, 2, 1);
  line(seg(P(136, 7, BZ + 12), P(136, 21, BZ + 12)) + poly(rrect(131, 15, 141, 21, 1, 3).map((q) => P(q.u, 21, BZ + 3 + (q.v - 15)))), "nf lo");
  box(102, 31, 106, 35, 0, 17, 1.5, 0.6);
  const eye = flatDot(g, C, 0.9, "dot off");
  place(eye, P(104, 33, 17));

  const [hr, hn] = rings(63, 4, 89, 24, 3, 1.2), [rr, rn] = rings(-2.2, -2.2, 2.2, 2.2, 1.6, 0.6);
  const rodRing = (x, ring) => ring.map((q) => ({ ...q, u: q.u + x, v: q.v + 14 }));
  const hz = spring(CZ + GAP, { eps: 0.03 }), ff = spring(FAR, { eps: 0.05 }), nf = spring(NEAR, { eps: 0.05 });
  let drawn = "", shown = "";

  function draw() {
    const key = hz.x.toFixed(3) + ff.x.toFixed(3) + nf.x.toFixed(3);
    if (key === drawn) return;
    drawn = key;
    put(farF, flap(-1, ff.x, 6));
    put(nearF, flap(1, nf.x, 22));
    put(head, prism(P, front, hr, hn, hz.x, hz.x + HH));
    [68, 84].forEach((x, i) => put(rods[i], prism(P, front, rodRing(x, rr), rodRing(x, rn), hz.x + HH, BMZ)));
  }
  function caption() {
    const t = over ? "gap " + Math.round(hz.x - CZ) : "rest";
    if (t !== shown) { shown = t; read.textContent = t; }
  }

  const B = register(stage, (dt) => {
    let moving = stepS(hz, dt);
    // the flaps chase the head's position, not the pointer: the near one opens further
    const lift = (hz.x - CZ - GAP) / 16;
    ff.t = FAR + FAR_OPEN * lift;
    nf.t = NEAR + NEAR_OPEN * lift;
    if (stepS(ff, dt)) moving = true;
    if (stepS(nf, dt)) moving = true;
    draw();
    caption();
    return moving;
  });
  bag.add(B.unregister);

  // The pointer's height on the stage, a band that never moves, sets the sealer's lift.
  function retarget() {
    const t = over ? Math.min(1, Math.max(0, (250 - over[1]) / 170)) : 0;
    hz.t = CZ + GAP + travel * t;
    B.wake();
  }

  bag.add(pointer(stage, {
    move: (p) => { over = p; retarget(); },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { travel = v; retarget(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "packaging",
  means: "A carton under a sealing head: the pointer's height lifts the sealer, and the carton's two flaps spring open after it.",
  rules: [3, 5, 6, 8],
  range: [8, 12, 16],
  tour: [[200, 100], [200, 220], [200, 150], null],
  mount,
});
