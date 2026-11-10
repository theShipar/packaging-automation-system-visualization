/**
 * Dispatch: packed units ride an infeed belt to a loader table where an open
 * shipping case is being filled, pass under a manifest scanner arch, and end
 * as sealed cases stacked on a low pallet, four below and two above. The case
 * the pointer is over lifts on the 700ms curve; the other exposed cases rise a
 * little after it, staggered by distance. The read-out names the case. The
 * slider is the lift.
 *
 * The pattern: one of many, in steps. Each case is tested on the plane of its
 * own resting top, so a raised case can't slide out from under the pointer.
 */
const {
  Cam, facing, fit, open, prism, proj, ringAt, rings, rrect, run, seg, unproj,
  tween, tset, tval, tdone, mk, pointer, put, register, disposer, solid,
} = HL;

const BZ = 11, TZ = 16, PZ = 10, CW = 24, CD = 16, CHT = 14, STEP = 45, SHARE = 0.3;
// the pallet's cases, in paint order: x0, y0, resting floor, whether its top is exposed, its number
const CASES = [
  [116, -2, PZ, false, 1], [116, -2, PZ + CHT, true, 5], [116, 16, PZ, true, 2],
  [144, -2, PZ, false, 3], [144, -2, PZ + CHT, true, 6], [144, 16, PZ, true, 4],
];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let lift = value;

  // Fitted with the top cases at full lift.
  const C = Cam(45, 0.5, 1.78);
  fit(C, [[-20, 2, 0], [-20, 24, 0], [172, 34, 0], [172, -6, 0], [105, -6, 44], [105, 32, 44], [128, -2, PZ + 2 * CHT + 9]], 200, 164);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  const box = (x0, y0, x1, y1, z0, z1, r, b) => {
    const s = solid(g), [ring, inner] = rings(x0, y0, x1, y1, r, b);
    put(s, prism(P, front, ring, inner, z0, z1));
    return s;
  };
  const line = (d, cls) => mk("path", { d, class: cls }, g);

  // Back to front: the far post of the arch, the infeed and its packs, the loader with its open case,
  // the crossbar and near post, the pallet, and its cases.
  box(102, -7, 108, -2, 0, 38, 2, 0.8);
  box(-20, 2, 62, 24, 0, BZ, 4, 1.4);
  line([-6, 18, 44].map((x) => seg(P(x, 6, BZ), P(x, 20, BZ))).join(""), "nf lo");
  for (const x of [-10, 14]) {
    box(x, 7, x + 12, 19, BZ, BZ + 8, 1.8, 0.8);
    line(seg(P(x + 6, 7, BZ + 8), P(x + 6, 19, BZ + 8)), "nf lo");
  }
  box(60, -2, 98, 28, 0, TZ, 4, 1.5);
  box(63, -2, 95, 0.5, TZ, TZ + 10, 1, 0.5);
  const loading = box(66, 3, 92, 24, TZ, TZ + 14, 1.6, 1);
  loading.sil.classList.add("hi");
  line(open(ringAt(P, run(rrect(67.8, 4.8, 90.2, 22.2, 0.8, 3), (q) => !front(q)), TZ + 5)), "nf lo");
  box(102, 28, 108, 33, 0, 38, 2, 0.8);
  box(101, -7, 109, 33, 38, 44, 2.5, 1);
  box(112, -6, 172, 34, 0, PZ, 3, 1.2);
  line([124, 142, 160].map((x) => seg(P(x, -6, PZ * 0.45), P(x, 34, PZ * 0.45))).join(""), "nf lo");

  const cases = CASES.map(([x0, y0, z0, exposed, n]) => {
    const el = solid(g), seam = line("", "nf lo");
    const [ring, inner] = rings(x0, y0, x0 + CW, y0 + CD, 1.6, 1);
    return { x0, y0, z0, exposed, n, el, seam, ring, inner, tw: tween(0), drawn: NaN };
  });
  const picks = cases.filter((c) => c.exposed);

  function drawCase(c, z) {
    if (z === c.drawn) return;
    c.drawn = z;
    put(c.el, prism(P, front, c.ring, c.inner, c.z0 + z, c.z0 + z + CHT));
    c.seam.setAttribute("d", seg(P(c.x0 + CW / 2, c.y0, c.z0 + z + CHT), P(c.x0 + CW / 2, c.y0 + CD, c.z0 + z + CHT)));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const c of cases) { drawCase(c, tval(c.tw, now)); if (!tdone(c.tw, now)) moving = true; }
    return moving;
  });
  bag.add(B.unregister);

  /** The exposed case whose resting top, unprojected onto its own height, holds the pointer nearest its middle. */
  function hit(p) {
    let best = null, bd = 1e9;
    for (const c of picks) {
      const [wx, wy] = unproj(C, p[0], p[1], c.z0 + CHT);
      const dx = wx - (c.x0 + CW / 2), dy = wy - (c.y0 + CD / 2);
      if (Math.abs(dx) > CW / 2 + 2 || Math.abs(dy) > CD / 2 + 2) continue;
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  let act = null;
  function setActive(c) {
    if (c === act) return;
    const now = performance.now(), from = c || act;
    act = c;
    if (!from) return;
    const order = picks.slice().sort((a, b) => Math.hypot(a.x0 - from.x0, a.y0 - from.y0, a.z0 - from.z0) - Math.hypot(b.x0 - from.x0, b.y0 - from.y0, b.z0 - from.z0));
    order.forEach((k, rank) => tset(k.tw, !c ? 0 : k === c ? lift : lift * SHARE, now, rank * STEP));
    for (const k of picks) k.el.sil.classList.toggle("hi", k === c);
    loading.sil.classList.toggle("hi", !c);
    read.textContent = c ? "case " + String(c.n).padStart(2, "0") : "rest";
    B.wake();
  }

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(null) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { lift = v; const a = act; act = undefined; setActive(a); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "dispatch",
  means: "Sealed cases on a pallet past the manifest arch: the case under the pointer lifts, and its neighbours rise after it.",
  rules: [1, 2, 4, 8],
  range: [4, 6, 9],
  tour: [[304, 148], [269, 130], [282, 181], null],
  mount,
});
