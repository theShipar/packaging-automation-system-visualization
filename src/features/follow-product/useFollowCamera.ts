import { useEffect, type MutableRefObject, type RefObject } from 'react';
import { store } from '../../app/store';
import type { StationId } from '../../domain/types';
import { describeUnit, frameUnits } from '../../transport/poses';

export interface Cam2D {
  k: number;
  x: number;
  y: number;
}

export function clampView(v: Cam2D, w: number, h: number): Cam2D {
  const minX = w - w * v.k, minY = h - h * v.k;
  return { k: v.k, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) };
}

/** Fraction of the view, around its centre, the followed unit may roam before the camera moves. */
const DEAD_ZONE = 0.45;

interface Opts {
  follow: string | null;
  view: MutableRefObject<Cam2D>;
  wrap: RefObject<HTMLDivElement>;
  aspect: RefObject<HTMLDivElement>;
  viewW: number;
  viewH: number;
  screenAt: (p: [number, number, number]) => [number, number];
  stationCenter: (id: StationId) => [number, number];
}

/**
 * Eases the scene camera so the followed unit stays inside the central 45% of the view.
 * Runs as a stepper on the store's single animation loop.
 */
export function useFollowCamera({ follow, view, wrap, aspect, viewW, viewH, screenAt, stationCenter }: Opts) {
  useEffect(() => {
    if (!follow) return;
    return store.addStepper((dt) => {
      const el = wrap.current, box = aspect.current;
      const ss = store.session;
      const u = store.follow ? ss.units.find((x) => x.id === store.follow) : null;
      if (!el || !box || !u) return false;
      const pose = frameUnits(ss).find((p) => p.id === u.id);
      const story = describeUnit(ss, u);
      const at = pose ? screenAt(pose.at) : story.station ? stationCenter(story.station) : null;
      if (!at) return false;
      const W = el.clientWidth, H = el.clientHeight;
      const px = box.offsetLeft + (at[0] / viewW) * box.offsetWidth;
      const py = box.offsetTop + (at[1] / viewH) * box.offsetHeight;
      const v = view.current;
      const k = Math.max(v.k, 1.8);
      // Where the unit would land on screen at the target zoom with the current pan.
      const sx = v.x * (k / v.k) + px * k, sy = v.y * (k / v.k) + py * k;
      const hx = (W * DEAD_ZONE) / 2, hy = (H * DEAD_ZONE) / 2;
      const dx = sx < W / 2 - hx ? W / 2 - hx - sx : sx > W / 2 + hx ? W / 2 + hx - sx : 0;
      const dy = sy < H / 2 - hy ? H / 2 - hy - sy : sy > H / 2 + hy ? H / 2 + hy - sy : 0;
      const target = clampView({ k, x: v.x * (k / v.k) + dx, y: v.y * (k / v.k) + dy }, W, H);
      const a = 1 - Math.exp(-dt * 4);
      const next = { k: v.k + (target.k - v.k) * a, x: v.x + (target.x - v.x) * a, y: v.y + (target.y - v.y) * a };
      const moving = Math.abs(next.x - v.x) + Math.abs(next.y - v.y) + Math.abs(next.k - v.k) * 100 > 0.05;
      view.current = next;
      return moving || ss.status === 'running';
    });
  }, [follow, view, wrap, aspect, viewW, viewH, screenAt, stationCenter]);
}
