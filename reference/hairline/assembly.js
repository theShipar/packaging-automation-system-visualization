/**
 * Assembly: a kit sits in a clamping fixture on a belt, under a C-frame press.
 * Behind it two feeder towers send parts down their chutes, batteries on the
 * left and leaflets on the right. The pointer's height sets the press gap; the
 * chute nearest the pointer tips up toward level on its own spring, the other
 * less. The read-out is the press gap. The slider is the press's full travel.
 *
 * The pattern: scrub one value by the pointer's height, and let the parts that
 * feed it answer by their distance, so the press and its feeders move as one.
 */
const {
  Cam, facing, fit, hull, open, poly, prism, proj, rad, rings, rrect, run, seg, unproj,
  spring, stepS, mk, pointer, put, register, disposer, solid,
} = HL;

const BZ = 10, FZ = 16, KZ = 25, AZ = 66, AT = 74, HH = 10, GAP = 12;
const CH = [ // a chute: its centre x, its rest angle, the part it carries (v0, v1, thickness)
  { x: 41, a: 24, part: [30, 40, 4] },
  { x: 71, a: 21, part: [28, 41, 1.4] },
];
const HY = -46, HZ = 40, L = 54, TIP = 9, R = 52;

const falloff = (u) =>
  u <= 0 ? 1 : u <= 0.42 ? 1 - (u / 0.42) * 0.69 : u <= 1 ? 0.31 - ((u - 0.42) / 0.58) * 0.22 : 0.09;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let travel = value, over = null;

  // Fitted with the press at full travel, so the highest pose stays inside the frame.
  const C = Cam(45, 0.5, 2.0);
  fit(C, [[-16, 8, 0], [-16, 36, 0], [140, 36, 0], [140, 8, 0], [34, -64, 46], [78, -64, 46], [56, -31, AT], [56, 30, AT]], 200, 168);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  const box = (x0, y0, x1, y1, z0, z1, r, b) => {
    const s = solid(g), [ring, inner] = rings(x0, y0, x1, y1, r, b);
    put(s, prism(P, front, ring, inner, z0, z1));
    return s;
  };
  const line = (d, cls) => mk("path", { d, class: cls }, g);

  /** A rounded slab in a plane hinged at (·, HY, HZ) and tipped down by `a` toward +y: u is world x, v runs down the slope, h stands off it. */
  function tilted(a, u0, u1, v0, v1, h0, h1, r, b) {
    const ca = Math.cos(rad(a)), sa = Math.sin(rad(a));
    const W = (q, h) => P(q.u, HY + q.v * ca + h * sa, HZ - q.v * sa + h * ca);
    const ring = rrect(u0, v0, u1, v1, r, 3), inner = rrect(u0 + b, v0 + b, u1 - b, v1 - b, Math.max(0.3, r - b), 3);
    return {
      sil: poly(hull(ring.map((q) => W(q, h0)).concat(ring.map((q) => W(q, h1))))),
      crease: open(run(inner, front).map((q) => W(q, h1))),
    };
  }

  // Back to front: the two feeder towers, the left chute (behind the column), the column, the right
  // chute (in front of it), then the belt and what stands on it.
  box(34, -64, 48, HY, 0, 46, 3, 1.2);
  box(64, -64, 78, HY, 0, 46, 3, 1.2);
  const chute = (c) => ({ ...c, sp: spring(c.a, { eps: 0.03 }), drawn: NaN, bed: solid(g), load: solid(g) });
  const chutes = [chute(CH[0])];
  box(50, -31, 62, -20, 0, AZ, 3, 1.2);
  chutes.push(chute(CH[1]));

  box(-16, 8, 140, 36, 0, BZ, 4, 1.6);
  line([0, 22, 96, 124].map((x) => seg(P(x, 12, BZ), P(x, 32, BZ))).join(""), "nf lo");
  box(36, 10, 76, 34, BZ, FZ, 4, 1.4);
  box(46, 9, 66, 13, FZ, FZ + 8, 1.5, 0.6);
  box(48, 15, 64, 29, FZ, KZ, 2, 1);
  line(poly(rrect(51, 18, 61, 26, 1.5, 3).map((q) => P(q.u, q.v, KZ))), "nf lo");
  box(46, 31, 66, 35, FZ, FZ + 8, 1.5, 0.6);
  // the last kit, assembled and leaving on the outbound belt
  box(100, 15, 116, 29, BZ, BZ + 9, 2, 1);
  line(poly(rrect(103, 18, 113, 26, 1.5, 3).map((q) => P(q.u, q.v, BZ + 9))), "nf lo");

  const head = solid(g), ram = solid(g);
  head.sil.classList.add("hi");
  box(49, -31, 63, 30, AZ, AT, 3, 1.2);

  const [hr, hn] = rings(47, 13, 65, 31, 3, 1.2), [rr, rn] = rings(53, 19, 59, 25, 2, 0.7);
  const hsp = spring(KZ + GAP, { eps: 0.03 });
  let hDrawn = NaN, shown = "";

  function drawHead(z) {
    if (z === hDrawn) return;
    hDrawn = z;
    put(head, prism(P, front, hr, hn, z, z + HH));
    put(ram, prism(P, front, rr, rn, z + HH, AZ));
  }
  function drawChute(c) {
    const a = c.sp.x;
    if (a === c.drawn) return;
    c.drawn = a;
    put(c.bed, tilted(a, c.x - 5, c.x + 5, 0, L, 0, 2.5, 2, 0.8));
    const [v0, v1, t] = c.part;
    put(c.load, tilted(a, c.x - 3.6, c.x + 3.6, v0, v1, 2.5, 2.5 + t, 1.4, 0.6));
  }
  function caption() {
    const t = over ? "gap " + Math.round(hsp.x - KZ) : "rest";
    if (t !== shown) { shown = t; read.textContent = t; }
  }

  const B = register(stage, (dt) => {
    let moving = stepS(hsp, dt);
    drawHead(hsp.x);
    for (const c of chutes) { if (stepS(c.sp, dt)) moving = true; drawChute(c); }
    caption();
    return moving;
  });
  bag.add(B.unregister);

  // The gap reads the pointer's height on the stage; each chute reads its distance on the plane of its own middle.
  function retarget() {
    if (!over) {
      hsp.t = KZ + GAP;
      for (const c of chutes) c.sp.t = c.a;
    } else {
      const t = Math.min(1, Math.max(0, (250 - over[1]) / 170));
      hsp.t = KZ + GAP + (travel - GAP) * t;
      const q = unproj(C, over[0], over[1], HZ - 12);
      for (const c of chutes) c.sp.t = c.a - TIP * falloff(Math.hypot(q[0] - c.x, q[1] - (HY + 26)) / R);
    }
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
  name: "assembly",
  means: "A kit in a clamping fixture under a press: the pointer's height opens the press, and the nearest feeder chute tips toward level.",
  rules: [1, 3, 5, 9],
  range: [16, 22, 28],
  tour: [[170, 90], [250, 110], [200, 200], null],
  mount,
});
