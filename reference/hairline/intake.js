/**
 * Intake: a short conveyor fed from a tray of cartons, running under a scanner
 * arch whose head hangs over the belt. The pointer near the head lifts it on a
 * spring; the four guide rails along the belt lean away by their own distance
 * to the pointer, the nearest most. The read-out is the gap between the head
 * and the belt. The slider is the head's full lift, in world units.
 *
 * The pattern: a small field. Springs, a falloff by distance, a hit test on one
 * fixed plane, and a rest where the exit guides already stand a little open.
 */
const {
  Cam, facing, fit, hull, open, poly, prism, proj, rad, ringAt, rings, rrect, run, seg, unproj,
  spring, stepS, flatDot, mk, place, pointer, put, register, disposer, solid,
} = HL;

const BZ = 12, BX1 = 132, BY1 = 30;                                 // the belt bed
const AX0 = 56, AX1 = 66, PY0 = -7, PY1 = 37, AZ = 50, AT = 57;     // the arch
const HX0 = 52, HX1 = 70, HY0 = 6, HY1 = 24, HH = 10, REST = 26;    // the scanner head
const RH = 8, RT = 2, LEAN = 30, R = 58;
// the guide rails: x0, x1, side (-1 far, 1 near), rest lean in degrees
const RAILS = [[6, 50, -1, 4], [72, 128, -1, 9], [6, 50, 1, 6], [72, 128, 1, 13]];

/** The share of the full answer at u radii from the pointer: 1 → .31 at 42% → .09 at the edge and beyond. */
const falloff = (u) =>
  u <= 0 ? 1 : u <= 0.42 ? 1 - (u / 0.42) * 0.69 : u <= 1 ? 0.31 - ((u - 0.42) / 0.58) * 0.22 : 0.09;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let lift = value, over = null;

  // Fitted with the head at full lift and the guides leaning furthest, so no pose leaves the frame.
  const C = Cam(45, 0.5, 1.86);
  fit(C, [[-50, -4, 0], [-50, 34, 0], [BX1, BY1 + 6, 0], [BX1, PY0, 0], [61, PY0, AT], [61, PY1, AT]], 200, 172);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  const box = (x0, y0, x1, y1, z0, z1, r, b) => {
    const s = solid(g), [ring, inner] = rings(x0, y0, x1, y1, r, b);
    put(s, prism(P, front, ring, inner, z0, z1));
    return s;
  };
  const line = (d, cls) => mk("path", { d, class: cls }, g);

  // Back to front: the tray and its cartons, the far post, the bed, then what stands on the bed.
  box(-50, -4, -8, 34, 0, 5, 5, 1.8);
  for (const [x, y] of [[-46, 0], [-46, 16], [-30, 8]]) {
    box(x, y, x + 12, y + 12, 5, 15, 2, 1);
    line(seg(P(x + 6, y, 15), P(x + 6, y + 12, 15)), "nf lo");
  }
  box(AX0, PY0, AX1, PY0 + 4, 0, AZ, 2, 1);
  box(0, 0, BX1, BY1, 0, BZ, 4, 1.6);
  line([14, 44, 90, 116].map((x) => seg(P(x, 4, BZ), P(x, BY1 - 4, BZ))).join(""), "nf lo");

  const rails = RAILS.map(([x0, x1, side, rest]) => ({ x0, x1, side, sp: spring(rest, { eps: 0.05 }), rest, drawn: NaN, el: null }));
  const railEl = (i) => { rails[i].el = solid(g); };
  railEl(0); railEl(1);

  // the kit waiting at the ready position, with its lid seam
  box(20, 9, 38, 21, BZ, BZ + 10, 2, 1);
  line(seg(P(29, 9, BZ + 10), P(29, 21, BZ + 10)), "nf lo");

  const stem = line("", "nf"), head = solid(g), slit = line("", "nf");
  head.sil.classList.add("hi");
  railEl(2);
  // the photoeye at the entrance, a short post with its lens
  box(42, 34, 47, 39, 0, 19, 1.6, 0.6);
  const eye = flatDot(g, C, 0.9, "dot off");
  place(eye, P(44.5, 36.5, 19));
  box(AX0, PY1 - 4, AX1, PY1, 0, AZ, 2, 1);
  box(AX0 - 1, PY0, AX1 + 1, PY1, AZ, AT, 3, 1.2);
  railEl(3);

  const [hr, hn] = rings(HX0, HY0, HX1, HY1, 3, 1.2);
  const hsp = spring(REST, { eps: 0.03 });
  let hDrawn = NaN, shown = "";

  function drawHead(z) {
    if (z === hDrawn) return;
    hDrawn = z;
    put(head, prism(P, front, hr, hn, z, z + HH));
    slit.setAttribute("d", seg(P(HX1, HY0 + 4, z + 3.2), P(HX1, HY1 - 4, z + 3.2)));
    stem.setAttribute("d", seg(P(61, 15, z + HH), P(61, 15, AZ)));
  }

  /** A rail leaning `deg` outward from its foot on the bed's edge: a hull of its foot and its tilted top. */
  function drawRail(r) {
    const deg = r.sp.x;
    if (deg === r.drawn) return;
    r.drawn = deg;
    const y0 = r.side < 0 ? 0 : BY1 - RT, dy = r.side * RH * Math.sin(rad(deg)), zt = BZ + RH * Math.cos(rad(deg));
    const foot = rrect(r.x0, y0, r.x1, y0 + RT, 1, 3), top = rrect(r.x0, y0 + dy, r.x1, y0 + RT + dy, 1, 3);
    const inner = rrect(r.x0 + 0.6, y0 + dy + 0.6, r.x1 - 0.6, y0 + RT + dy - 0.6, 0.3, 3);
    put(r.el, { sil: poly(hull(ringAt(P, foot, BZ).concat(ringAt(P, top, zt)))), crease: open(ringAt(P, run(inner, front), zt)) });
  }

  function caption() {
    const t = over ? "gap " + Math.round(hsp.x - BZ) : "rest";
    if (t !== shown) { shown = t; read.textContent = t; }
  }

  const B = register(stage, (dt) => {
    let moving = stepS(hsp, dt);
    drawHead(hsp.x);
    for (const r of rails) { if (stepS(r.sp, dt)) moving = true; drawRail(r); }
    caption();
    return moving;
  });
  bag.add(B.unregister);

  // Each part is tested on the plane of its own rest pose: the head at its middle, the rails at theirs.
  function retarget() {
    if (!over) {
      hsp.t = REST;
      for (const r of rails) r.sp.t = r.rest;
    } else {
      const h = unproj(C, over[0], over[1], REST + HH), q = unproj(C, over[0], over[1], BZ + RH / 2);
      hsp.t = REST + lift * falloff(Math.hypot(h[0] - 61, h[1] - 15) / R);
      for (const r of rails) {
        const cy = r.side < 0 ? 1 : BY1 - 1, cx = Math.max(r.x0, Math.min(r.x1, q[0]));
        r.sp.t = r.rest + LEAN * falloff(Math.hypot(q[0] - cx, q[1] - cy) / R);
      }
    }
    B.wake();
  }

  bag.add(pointer(stage, {
    move: (p) => { over = p; retarget(); },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { lift = v; retarget(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "intake",
  means: "A barcode intake on a short belt: the scanner head lifts as the pointer nears it, and the guide rails lean away in turn.",
  rules: [1, 3, 5, 9],
  range: [6, 9, 13],
  tour: [[224, 137], [285, 215], [150, 185], null],
  mount,
});
