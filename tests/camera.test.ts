import { describe, expect, it } from 'vitest';
import {
  FIT_PAD,
  FOCUS_MARGIN,
  center,
  ensureVisible,
  fit,
  focus,
  inflate,
  interp,
  limitsFor,
  project,
  reframe,
  rectCenter,
  unproject,
  wheelScale,
  zoomAt,
  type Bounds,
  type Cam,
  type Rect,
} from '../src/camera/camera';
import { STATIONS } from '../src/domain/config';
import { CONTENT_BOUNDS, GEOMETRY } from '../src/vector/sceneModel';

/** Safe rect for a canvas, the same insets the canvas region uses. */
const safeFor = (W: number, H: number, bottom = 80): Rect => ({ x: 20, y: 56, w: W - 40, h: H - 56 - bottom });

function inside(c: Cam, b: Bounds, r: Rect, margin = 0, tol = 0.5) {
  const [x0, y0] = project(c, b.minX, b.minY);
  const [x1, y1] = project(c, b.maxX, b.maxY);
  return x0 >= r.x + margin - tol && y0 >= r.y + margin - tol && x1 <= r.x + r.w - margin + tol && y1 <= r.y + r.h - margin + tol;
}

describe('camera math', () => {
  it('C03 cursor-anchored zoom keeps the world point under the cursor (≤1px drift), even far from centre', () => {
    const r = safeFor(1384, 820);
    let c = fit(CONTENT_BOUNDS, r);
    const lim = limitsFor(CONTENT_BOUNDS, r);
    for (const [px, py] of [[700, 400], [1360, 790], [24, 60], [1100, 700]] as const) {
      const before = unproject(c, px, py);
      for (let i = 0; i < 20; i++) c = zoomAt(c, px, py, wheelScale(c.s, i % 3 === 0 ? 90 : -120, false, lim));
      const [sx, sy] = project(c, before[0], before[1]);
      expect(Math.hypot(sx - px, sy - py)).toBeLessThanOrEqual(1);
    }
  });

  it('C01/C02 Fit contains the whole line in the safe rect at 90% of the limiting side', () => {
    for (const [W, H] of [[1384, 820], [1064, 820], [1868, 1020], [968, 700], [710, 900]]) {
      const r = safeFor(W, H);
      const c = fit(CONTENT_BOUNDS, r);
      expect(inside(c, CONTENT_BOUNDS, r)).toBe(true);
      const used = Math.max(((CONTENT_BOUNDS.maxX - CONTENT_BOUNDS.minX) * c.s) / r.w, ((CONTENT_BOUNDS.maxY - CONTENT_BOUNDS.minY) * c.s) / r.h);
      expect(used).toBeCloseTo(FIT_PAD, 5);
      const [cx, cy] = project(c, ...center(CONTENT_BOUNDS));
      const [rx, ry] = rectCenter(r);
      expect(Math.abs(cx - rx)).toBeLessThan(0.5);
      expect(Math.abs(cy - ry)).toBeLessThan(0.5);
    }
  });

  it('wheel zoom is clamped to 25%–350% of Fit', () => {
    const r = safeFor(1384, 820);
    const lim = limitsFor(CONTENT_BOUNDS, r);
    const f = fit(CONTENT_BOUNDS, r).s;
    let s = f;
    for (let i = 0; i < 200; i++) s = wheelScale(s, -240, false, lim);
    expect(s / f).toBeCloseTo(3.5, 5);
    for (let i = 0; i < 200; i++) s = wheelScale(s, 240, true, lim);
    expect(s / f).toBeCloseTo(0.25, 5);
  });

  it('C06 focus keeps every station inside the safe rect with a 24px margin, with the inspector at 320 and 440', () => {
    for (const dock of [0, 320, 380, 440]) {
      for (const [vw, vh] of [[1440, 900], [1280, 800], [1920, 1080]]) {
        const W = vw - 56 - dock, H = vh - 56;
        const r = safeFor(W, H);
        const lim = limitsFor(CONTENT_BOUNDS, r);
        const scales = new Set<number>();
        for (const { id } of STATIONS) {
          const b = inflate(GEOMETRY[id].bounds, 0.18);
          const c = focus(b, r, lim);
          expect(inside(c, b, r, FOCUS_MARGIN), `${id} @ ${vw}x${vh} dock ${dock}`).toBe(true);
          expect(c.s).toBeLessThanOrEqual(lim.max + 1e-9);
          if (c.s < lim.max - 1e-9) scales.add(Math.round(c.s * 1000));
        }
        // below the 350% cap, focus scale follows each machine's size
        if (dock === 0) expect(scales.size, `${vw}x${vh}`).toBeGreaterThan(1);
      }
    }
  });

  it('C12 interpolation: exact end states, log-space scale, retargeting is continuous', () => {
    const r = safeFor(1384, 820);
    const lim = limitsFor(CONTENT_BOUNDS, r);
    const a = fit(CONTENT_BOUNDS, r);
    const b = focus(inflate(GEOMETRY.robot.bounds, 0.18), r, lim);
    expect(interp(a, b, 0, r)).toEqual(a);
    expect(interp(a, b, 1, r)).toEqual(b);
    const mid = interp(a, b, 0.5, r);
    expect(mid.s).toBeCloseTo(Math.sqrt(a.s * b.s), 8);
    // retarget mid-flight: the new animation starts exactly where the old one was
    const c = focus(inflate(GEOMETRY.dispatch.bounds, 0.18), r, lim);
    const again = interp(mid, c, 0, r);
    expect(again).toEqual(mid);
    const step = interp(mid, c, 0.01, r);
    expect(Math.abs(step.tx - mid.tx)).toBeLessThan(20);
    expect(Math.abs(step.s - mid.s) / mid.s).toBeLessThan(0.05);
  });

  it('reframe moves the old safe-rect centre to the new centre without changing scale', () => {
    const r1 = safeFor(1384, 820);
    const r2 = safeFor(1384 - 380, 820);
    const c = fit(CONTENT_BOUNDS, r1);
    const n = reframe(c, r1, r2);
    expect(n.s).toBe(c.s);
    const w1 = unproject(c, ...rectCenter(r1));
    const w2 = unproject(n, ...rectCenter(r2));
    expect(w2[0]).toBeCloseTo(w1[0], 6);
    expect(w2[1]).toBeCloseTo(w1[1], 6);
  });

  it('ensureVisible pans the selection back into view after a dock opens', () => {
    const r1 = safeFor(1384, 820);
    const lim = limitsFor(CONTENT_BOUNDS, r1);
    const b = GEOMETRY.dispatch.bounds;
    const c = focus(inflate(b, 0.18), r1, lim);
    const r2 = safeFor(1384 - 440, 820);
    const n = ensureVisible(reframe(c, r1, r2), b, r2, lim);
    expect(inside(n, b, r2, FOCUS_MARGIN)).toBe(true);
    const already = ensureVisible(n, b, r2, lim);
    expect(already).toEqual(n);
  });
});
