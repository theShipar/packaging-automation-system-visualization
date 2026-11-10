/**
 * QA: an open-fronted inspection hood over a belt. A camera stands on the roof
 * and looks down through it at a scale plate where one kit is being weighed; a
 * barcode reader reaches over the exit, a diverter paddle stands by it, and a
 * reject bin waits at the side. The pointer's height raises the camera on its
 * spring, drawing its lens barrel up out of the roof's collar. The read-out is
 * the camera's height over the belt. The slider is the camera's full travel.
 *
 * The pattern: scrub one value by the pointer's height, on a part that stands
 * clear of everything else, so the answer is never hidden.
 */
const {
  Cam, circ, facing, fit, open, prism, proj, rad, ringAt, rings, rrect, run, seg,
  spring, stepS, flatDot, mk, place, pointer, put, register, disposer, solid,
} = HL;

const BZ = 12, RZ = 58, RT = 63, CAM = RT + 4, CH = 11, LENS = 5.5, CX = 64, CY = 13;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let travel = value, over = null;

  // Fitted to the roof's actuator and the reject bin, the highest and the nearest parts.
  const C = Cam(45, 0.5, 1.9);
  fit(C, [[-12, 0, 0], [-12, 28, 0], [150, 28, 0], [150, -10, 0], [146, 54, 0], [32, -12, RT], [CX, CY, CAM + 16 + CH], [32, 35, RT]], 200, 164);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  const box = (x0, y0, x1, y1, z0, z1, r, b) => {
    const s = solid(g), [ring, inner] = rings(x0, y0, x1, y1, r, b);
    put(s, prism(P, front, ring, inner, z0, z1));
    return s;
  };
  const line = (d, cls) => mk("path", { d, class: cls }, g);
  const turn = (ring, th, cx, cy) => {
    const c = Math.cos(rad(th)), s = Math.sin(rad(th));
    return ring.map((q) => ({ u: cx + q.u * c - q.v * s, v: cy + q.u * s + q.v * c, nu: q.nu * c - q.nv * s, nv: q.nu * s + q.nv * c }));
  };

  // Back to front: the hood's back wall and the reader's post, the belt and its load, the reader's head,
  // the diverter, the camera and the light bar, the near posts, the roof, and the reject bin.
  box(40, -12, 96, -5, 0, RT, 3, 1.2);
  box(106, -11, 114, -5, 0, 30, 2, 0.8);
  box(-12, 0, 150, 28, 0, BZ, 4, 1.5);
  line([4, 26, 116, 138].map((x) => seg(P(x, 4, BZ), P(x, 24, BZ))).join(""), "nf lo");
  box(6, 7, 22, 21, BZ, BZ + 9, 2, 1);
  line(seg(P(14, 7, BZ + 9), P(14, 21, BZ + 9)), "nf lo");
  box(CX - 16, 3, CX + 16, 25, BZ, BZ + 2, 3, 1.2);
  box(CX - 8, 6, CX + 8, 20, BZ + 2, BZ + 11, 2, 1);
  line(seg(P(CX, 6, BZ + 11), P(CX, 20, BZ + 11)), "nf lo");
  box(103, -8, 117, 6, 26, 33, 2.5, 1);
  line(seg(P(117, -4, 28.5), P(117, 3, 28.5)), "nf");
  // the diverter: a paddle hinged at the far edge, standing at neutral along the flow
  const [dr, dn] = rings(-1.4, 0, 1.4, 20, 1.2, 0.5);
  put(solid(g), prism(P, front, turn(dr, -18, 122, 2), turn(dn, -18, 122, 2), BZ, BZ + 9));

  box(34, 30, 39, 35, 0, RZ, 2, 0.8);
  box(97, 30, 102, 35, 0, RZ, 2, 0.8);
  box(32, -12, 104, 35, RZ, RT, 4, 1.4);
  // the camera's collar on the roof, the barrel drawn out of it, the body on the barrel
  const at = (q) => ({ ...q, u: q.u + CX, v: q.v + CY });
  put(solid(g), prism(P, front, circ(9, 28).map(at), circ(7.6, 28).map(at), RT, RT + 2));
  const lens = solid(g), body = solid(g);
  lens.sil.classList.add("hi");
  const eye = flatDot(g, C, 0.9, "dot m");
  // the reject bin at the side of the exit, a shallow tray: its rim, and the floor seam along its far walls
  box(116, 32, 144, 52, 0, 6, 4, 2.2);
  line(open(ringAt(P, run(rrect(118.2, 34.2, 141.8, 49.8, 1.8, 4), (q) => !front(q)), 1.5)), "nf lo");

  const lr = circ(LENS, 24).map(at), ln = circ(LENS - 1.1, 24).map(at);
  const [br, bn] = rings(CX - 8, CY - 10, CX + 8, CY + 10, 3, 1.2);
  const cam = spring(CAM, { eps: 0.03 });
  let drawn = NaN, shown = "";

  function draw() {
    const z = cam.x;
    if (z === drawn) return;
    drawn = z;
    put(lens, prism(P, front, lr, ln, RT + 2, z));
    put(body, prism(P, front, br, bn, z, z + CH));
    place(eye, P(CX + 4, CY - 6, z + CH));
  }
  function caption() {
    const t = over ? "height " + Math.round(cam.x - BZ) : "rest";
    if (t !== shown) { shown = t; read.textContent = t; }
  }

  const B = register(stage, (dt) => {
    const moving = stepS(cam, dt);
    draw();
    caption();
    return moving;
  });
  bag.add(B.unregister);

  // The pointer's height on the stage, a band that never moves, sets the camera's lift.
  function retarget() {
    const t = over ? Math.min(1, Math.max(0, (250 - over[1]) / 170)) : 0;
    cam.t = CAM + travel * t;
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
  name: "qa",
  means: "An inspection hood over a scale: the pointer's height lifts the roof camera, drawing its lens barrel out after it.",
  rules: [1, 3, 4, 6],
  range: [8, 12, 16],
  tour: [[200, 110], [200, 200], [150, 150], null],
  mount,
});
