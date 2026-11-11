import { useRef, useState, type PointerEvent as RPE } from 'react';

export type SheetSize = 'half' | 'full';

/** Pull distance (px) that commits a size change or a close. */
const COMMIT = 56;

/**
 * Drag behaviour for a bottom sheet's grab handle (the handle only shows at sheet widths).
 * Drag up to expand, drag down to shrink, drag down from half to close; a tap toggles.
 */
export function useSheet(onClose: () => void, initial: SheetSize = 'half') {
  const [size, setSize] = useState<SheetSize>(initial);
  const drag = useRef<{ y: number; h: number; el: HTMLElement; moved: boolean } | null>(null);
  const dragged = useRef(false);

  const end = (e: RPE<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    dragged.current = true;
    d.el.style.transition = '';
    d.el.style.height = '';
    const dy = e.clientY - d.y;
    if (dy < -COMMIT) setSize('full');
    else if (dy > COMMIT) {
      if (size === 'full' && d.h - dy > window.innerHeight * 0.3) setSize('half');
      else onClose();
    }
  };

  const grab = {
    onPointerDown: (e: RPE<HTMLElement>) => {
      const el = e.currentTarget.closest<HTMLElement>('[data-sheet-size]');
      if (!el) return;
      dragged.current = false;
      drag.current = { y: e.clientY, h: el.offsetHeight, el, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: RPE<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dy) < 6) return;
      d.moved = true;
      d.el.style.transition = 'none';
      d.el.style.height = `${Math.max(64, d.h - dy)}px`;
    },
    onPointerUp: end,
    onPointerCancel: end,
    onClick: () => {
      if (dragged.current) {
        dragged.current = false;
        return;
      }
      setSize((s) => (s === 'half' ? 'full' : 'half'));
    },
    'aria-label': size === 'half' ? 'Expand panel' : 'Shrink panel',
    'aria-expanded': size === 'full',
  };
  return { size, grab };
}
