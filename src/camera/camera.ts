/*
 * Pure camera math. World units are the SVG world coordinates produced by the scene model;
 * screen units are CSS pixels relative to the canvas. screen = s * world + t.
 */

export interface Cam {
  s: number;
  tx: number;
  ty: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface Limits {
  min: number;
  max: number;
}

/** Zoom range relative to the Fit scale of the current safe rect (100% = whole line fits). */
export const ZOOM_RANGE = { min: 0.25, max: 3.5 } as const;
export const FIT_PAD = 0.9;
export const FOCUS_FILL = 0.62;
export const FOCUS_MARGIN = 24;
export const CLICK_SLOP = 5;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clampScale = (s: number, lim: Limits) => clamp(s, lim.min, lim.max);

export const bw = (b: Bounds) => b.maxX - b.minX;
export const bh = (b: Bounds) => b.maxY - b.minY;
export const center = (b: Bounds): [number, number] => [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
export const rectCenter = (r: Rect): [number, number] => [r.x + r.w / 2, r.y + r.h / 2];

export function boundsOf(pts: readonly (readonly [number, number])[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function union(...bs: Bounds[]): Bounds {
  return { minX: Math.min(...bs.map((b) => b.minX)), minY: Math.min(...bs.map((b) => b.minY)), maxX: Math.max(...bs.map((b) => b.maxX)), maxY: Math.max(...bs.map((b) => b.maxY)) };
}

export function inflate(b: Bounds, f: number): Bounds {
  const dx = (bw(b) * f) / 2, dy = (bh(b) * f) / 2;
  return { minX: b.minX - dx, minY: b.minY - dy, maxX: b.maxX + dx, maxY: b.maxY + dy };
}

export const project = (c: Cam, x: number, y: number): [number, number] => [c.s * x + c.tx, c.s * y + c.ty];
export const unproject = (c: Cam, px: number, py: number): [number, number] => [(px - c.tx) / c.s, (py - c.ty) / c.s];

/** Cursor-anchored zoom: the world point under (px, py) stays under it. */
export function zoomAt(c: Cam, px: number, py: number, s2: number): Cam {
  const wx = (px - c.tx) / c.s;
  const wy = (py - c.ty) / c.s;
  return { s: s2, tx: px - wx * s2, ty: py - wy * s2 };
}

/** Wheel delta in pixels, whatever the device reports. */
export function wheelPixels(deltaY: number, deltaMode: number, pageH: number) {
  return deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * pageH : deltaY;
}

/** Exponential zoom step; pinch gestures (ctrlKey wheel) report small deltas so they get a larger gain. */
export function wheelScale(s: number, dy: number, pinch: boolean, lim: Limits) {
  const k = pinch ? 0.01 : 0.0016;
  return clampScale(s * Math.exp(-clamp(dy, -240, 240) * k), lim);
}

/** Camera that shows the world point (wx, wy) at the screen point (px, py) with scale s. */
export const placeAt = (s: number, wx: number, wy: number, px: number, py: number): Cam => ({ s, tx: px - wx * s, ty: py - wy * s });

export function fitScale(b: Bounds, r: Rect) {
  return Math.min(r.w / Math.max(1, bw(b)), r.h / Math.max(1, bh(b))) * FIT_PAD;
}

/** Whole content centred in the safe rect at 90% of the limiting dimension. */
export function fit(b: Bounds, r: Rect, lim?: Limits): Cam {
  const s = lim ? clampScale(fitScale(b, r), lim) : fitScale(b, r);
  const [wx, wy] = center(b);
  const [cx, cy] = rectCenter(r);
  return placeAt(s, wx, wy, cx, cy);
}

/** Zoom limits for a safe rect, derived from the Fit scale of the content. */
export function limitsFor(content: Bounds, r: Rect): Limits {
  const f = fitScale(content, r);
  return { min: f * ZOOM_RANGE.min, max: f * ZOOM_RANGE.max };
}

/**
 * Frame one object: its height fills ~62% of the safe height, and the whole box stays inside
 * the safe rect with a 24 px margin. Different machines get different scales.
 */
export function focus(b: Bounds, r: Rect, lim: Limits, fill = FOCUS_FILL, margin = FOCUS_MARGIN): Cam {
  const byFill = (r.h * fill) / Math.max(1, bh(b));
  const byW = (r.w - 2 * margin) / Math.max(1, bw(b));
  const byH = (r.h - 2 * margin) / Math.max(1, bh(b));
  const s = clampScale(Math.min(byFill, byW, byH), lim);
  const [wx, wy] = center(b);
  const [cx, cy] = rectCenter(r);
  return placeAt(s, wx, wy, cx, cy);
}

/** Panel resize: the world point at the centre of the old safe rect moves to the centre of the new one. */
export function reframe(c: Cam, oldR: Rect, newR: Rect): Cam {
  const [ox, oy] = rectCenter(oldR);
  const [wx, wy] = unproject(c, ox, oy);
  const [nx, ny] = rectCenter(newR);
  return placeAt(c.s, wx, wy, nx, ny);
}

/** Smallest pan (and, if it cannot fit, a zoom-out) that brings b fully inside r with a margin. */
export function ensureVisible(c: Cam, b: Bounds, r: Rect, lim: Limits, margin = FOCUS_MARGIN): Cam {
  const inner = { x: r.x + margin, y: r.y + margin, w: Math.max(1, r.w - 2 * margin), h: Math.max(1, r.h - 2 * margin) };
  let s = c.s;
  if (bw(b) * s > inner.w || bh(b) * s > inner.h) s = clampScale(Math.min(inner.w / bw(b), inner.h / bh(b)), lim);
  let cam = s === c.s ? c : zoomAt(c, ...rectCenter(r), s);
  const [x0, y0] = project(cam, b.minX, b.minY);
  const [x1, y1] = project(cam, b.maxX, b.maxY);
  const dx = x0 < inner.x ? inner.x - x0 : x1 > inner.x + inner.w ? inner.x + inner.w - x1 : 0;
  const dy = y0 < inner.y ? inner.y - y0 : y1 > inner.y + inner.h ? inner.y + inner.h - y1 : 0;
  if (dx || dy) cam = { s: cam.s, tx: cam.tx + dx, ty: cam.ty + dy };
  return cam;
}

/** Pan needed so the world point stays inside the central `zone` fraction of the safe rect. */
export function deadZonePan(c: Cam, wx: number, wy: number, r: Rect, zone = 0.5): [number, number] {
  const [px, py] = project(c, wx, wy);
  const hw = (r.w * zone) / 2, hh = (r.h * zone) / 2;
  const [cx, cy] = rectCenter(r);
  const dx = px < cx - hw ? cx - hw - px : px > cx + hw ? cx + hw - px : 0;
  const dy = py < cy - hh ? cy - hh - py : py > cy + hh ? cy + hh - py : 0;
  return [dx, dy];
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Interpolate between two cameras around the safe-rect centre: the viewed world centre moves
 * linearly and scale moves in log space, so zooming feels even and nothing swings sideways.
 */
export function interp(a: Cam, b: Cam, t: number, r: Rect): Cam {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const [cx, cy] = rectCenter(r);
  const [ax, ay] = unproject(a, cx, cy);
  const [bx, by] = unproject(b, cx, cy);
  const s = Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * t);
  return placeAt(s, ax + (bx - ax) * t, ay + (by - ay) * t, cx, cy);
}

export const camEq = (a: Cam, b: Cam, eps = 0.01) => Math.abs(a.s - b.s) < eps * 0.001 * Math.max(1, a.s) && Math.abs(a.tx - b.tx) < eps && Math.abs(a.ty - b.ty) < eps;

export const validRect = (r: Rect) => Number.isFinite(r.w) && Number.isFinite(r.h) && r.w > 40 && r.h > 40;
