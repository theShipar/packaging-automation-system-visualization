import { useEffect, useRef, type RefObject } from 'react';
import { CLICK_SLOP, wheelPixels, wheelScale } from './camera';
import { camera } from './controller';

const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);
/** Elements that keep their own pointer behaviour inside the canvas. */
const OWN_INPUT = '.follow-card, .ov-ui';
const PICKABLE = '.hit, .hit-comp, .hit-unit, .st-label, button, a';

type Gesture =
  | { kind: 'pending' | 'pan'; id: number; x0: number; y0: number; x: number; y: number }
  | { kind: 'pinch'; dist: number; mx: number; my: number };

/**
 * Pan (drag anywhere past 5 px, Space+drag, middle button), cursor-anchored wheel zoom and
 * two-finger pinch on the canvas element. A drag never ends in a selection click.
 */
export function useCameraInput(el: RefObject<HTMLElement>, onEmptyClick: () => void) {
  const empty = useRef(onEmptyClick);
  empty.current = onEmptyClick;

  useEffect(() => {
    const root = el.current;
    if (!root) return;
    const ptrs = new Map<number, [number, number]>();
    let g: Gesture | null = null;
    let space = false;
    let suppress = false;

    const local = (e: { clientX: number; clientY: number }): [number, number] => {
      const r = root.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const pinchOf = (): Gesture => {
      const [a, b] = [...ptrs.values()];
      return { kind: 'pinch', dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
    };
    const startPan = (id: number) => {
      try {
        root.setPointerCapture(id);
      } catch {
        /* pointer already released */
      }
      root.classList.add('panning');
    };

    const down = (e: PointerEvent) => {
      if ((e.button !== 0 && e.button !== 1) || (e.target as Element).closest(OWN_INPUT)) return;
      const p = local(e);
      ptrs.set(e.pointerId, p);
      if (ptrs.size === 2) {
        g = pinchOf();
        suppress = true;
        return;
      }
      if (ptrs.size > 2) return;
      const immediate = space || e.button === 1;
      g = { kind: immediate ? 'pan' : 'pending', id: e.pointerId, x0: p[0], y0: p[1], x: p[0], y: p[1] };
      if (immediate) {
        e.preventDefault();
        suppress = true;
        startPan(e.pointerId);
      }
    };

    const move = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId) || !g) return;
      const p = local(e);
      ptrs.set(e.pointerId, p);
      if (g.kind === 'pinch') {
        if (ptrs.size < 2) return;
        const n = pinchOf() as Extract<Gesture, { kind: 'pinch' }>;
        if (g.dist > 0) camera.zoomAtPoint(n.mx, n.my, camera.cam.s * (n.dist / g.dist));
        camera.panBy(n.mx - g.mx, n.my - g.my);
        g = n;
        return;
      }
      if (e.pointerId !== g.id) return;
      if (g.kind === 'pending') {
        if (Math.hypot(p[0] - g.x0, p[1] - g.y0) <= CLICK_SLOP) return;
        g.kind = 'pan';
        suppress = true;
        startPan(e.pointerId);
      }
      camera.panBy(p[0] - g.x, p[1] - g.y);
      g.x = p[0];
      g.y = p[1];
    };

    const end = (e: PointerEvent) => {
      if (!ptrs.delete(e.pointerId)) return;
      const was = g;
      if (was && was.kind === 'pinch') {
        const rest = [...ptrs.entries()][0];
        g = rest ? { kind: 'pan', id: rest[0], x0: rest[1][0], y0: rest[1][1], x: rest[1][0], y: rest[1][1] } : null;
      } else g = null;
      root.classList.remove('panning');
      if (e.type === 'pointerup' && was && was.kind === 'pending' && !(e.target as Element).closest(PICKABLE)) empty.current();
      if (suppress) setTimeout(() => (suppress = false), 0);
    };

    const click = (e: MouseEvent) => {
      if (!suppress) return;
      e.stopPropagation();
      e.preventDefault();
    };

    const wheel = (e: WheelEvent) => {
      if ((e.target as Element).closest(OWN_INPUT)) return;
      e.preventDefault();
      const [px, py] = local(e);
      const dy = wheelPixels(e.deltaY, e.deltaMode, root.clientHeight);
      const dx = wheelPixels(e.deltaX, e.deltaMode, root.clientWidth);
      if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy) * 1.5) return camera.panBy(-dx, 0);
      camera.zoomAtPoint(px, py, wheelScale(camera.cam.s, dy, e.ctrlKey, camera.lim));
    };

    const keydown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e.target)) return;
      const t = e.target as Element | null;
      if (t && t !== document.body && !root.contains(t)) return;
      e.preventDefault();
      if (!space) {
        space = true;
        root.classList.add('space-pan');
      }
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      space = false;
      root.classList.remove('space-pan');
    };
    const blur = () => {
      space = false;
      ptrs.clear();
      g = null;
      root.classList.remove('space-pan', 'panning');
    };

    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('click', click, true);
    root.addEventListener('dblclick', click, true);
    root.addEventListener('wheel', wheel, { passive: false });
    addEventListener('keydown', keydown);
    addEventListener('keyup', keyup);
    addEventListener('blur', blur);
    return () => {
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', end);
      root.removeEventListener('pointercancel', end);
      root.removeEventListener('click', click, true);
      root.removeEventListener('dblclick', click, true);
      root.removeEventListener('wheel', wheel);
      removeEventListener('keydown', keydown);
      removeEventListener('keyup', keyup);
      removeEventListener('blur', blur);
    };
  }, [el]);
}
