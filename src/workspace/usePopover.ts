import { useEffect, useRef, useState } from 'react';

/** Open/close state for a popover anchored in `ref`: closes on outside pointer-down and on Escape. */
export function usePopover<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    addEventListener('pointerdown', close);
    addEventListener('keydown', esc, true);
    return () => {
      removeEventListener('pointerdown', close);
      removeEventListener('keydown', esc, true);
    };
  }, [open]);
  return { open, setOpen, ref };
}
