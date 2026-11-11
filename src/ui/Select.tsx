import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IcoChevronDown, IcoTick } from './Icons';

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Plain text for type-ahead when the label is not a string. */
  text?: string;
  hint?: ReactNode;
}

interface Props<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  'aria-label': string;
  className?: string;
  style?: CSSProperties;
}

const GAP = 6;
const MAX_H = 320;
const MIN_W = 200;
const optText = <T extends string>(o: SelectOption<T>) => (o.text ?? (typeof o.label === 'string' ? o.label : o.value)).toLowerCase();

/** Select-only combobox in the house style. Focus stays on the trigger; the list floats in a portal so scroll containers never clip it. */
export function Select<T extends string>({ value, options, onChange, 'aria-label': label, className, style }: Props<T>) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<CSSProperties>({});
  const typed = useRef({ s: '', t: 0 });
  const selIdx = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[selIdx];

  const place = () => {
    const b = btn.current?.getBoundingClientRect();
    if (!b) return;
    const width = Math.min(innerWidth - 16, Math.max(b.width, MIN_W));
    const left = Math.min(Math.max(8, b.left), innerWidth - width - 8);
    const below = innerHeight - b.bottom - GAP - 8;
    const above = b.top - GAP - 8;
    const up = below < Math.min(MAX_H, 180) && above > below;
    setPos(up ? { left, width, bottom: innerHeight - b.top + GAP, maxHeight: Math.min(MAX_H, above) } : { left, width, top: b.bottom + GAP, maxHeight: Math.min(MAX_H, below) });
  };

  const show = (at = selIdx) => {
    place();
    setActive(at);
    setOpen(true);
  };
  const pick = (i: number) => {
    const o = options[i];
    setOpen(false);
    btn.current?.focus({ preventScroll: true });
    if (o && o.value !== value) onChange(o.value);
  };

  useLayoutEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus({ preventScroll: true });
    };
    const reflow = (e: Event) => {
      if (list.current?.contains(e.target as Node)) return;
      place();
    };
    addEventListener('pointerdown', outside);
    addEventListener('keydown', esc, true);
    addEventListener('scroll', reflow, true);
    addEventListener('resize', reflow);
    return () => {
      removeEventListener('pointerdown', outside);
      removeEventListener('keydown', esc, true);
      removeEventListener('scroll', reflow, true);
      removeEventListener('resize', reflow);
    };
  }, [open]);

  const typeAhead = (ch: string) => {
    const now = performance.now();
    typed.current = { s: now - typed.current.t > 700 ? ch : typed.current.s + ch, t: now };
    const q = typed.current.s;
    const from = open ? active : selIdx;
    const order = [...options.keys()].map((k) => (from + 1 + k) % options.length);
    const hit = order.find((i) => optText(options[i]).startsWith(q)) ?? order.find((i) => optText(options[i]).includes(q));
    if (hit === undefined) return;
    if (open) setActive(hit);
    else if (options[hit].value !== value) onChange(options[hit].value);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    const step = (to: number) => (open ? setActive(Math.min(last, Math.max(0, to))) : show(Math.min(last, Math.max(0, to))));
    let handled = true;
    switch (e.key) {
      case 'ArrowDown':
        if (e.altKey && !open) show();
        else step(open ? active + 1 : selIdx);
        break;
      case 'ArrowUp':
        step(open ? active - 1 : selIdx);
        break;
      case 'Home':
        step(0);
        break;
      case 'End':
        step(last);
        break;
      case 'PageDown':
        step(active + 8);
        break;
      case 'PageUp':
        step(active - 8);
        break;
      case 'Enter':
      case ' ':
        if (open) pick(active);
        else show();
        break;
      case 'Tab':
        if (open) pick(active);
        handled = false;
        break;
      default:
        handled = false;
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          typeAhead(e.key.toLowerCase());
          handled = true;
        }
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className={`select${className ? ` ${className}` : ''}`} style={style}>
      <button
        ref={btn}
        type="button"
        role="combobox"
        className="select-btn"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
      >
        <span className="select-val">{current?.label}</span>
        <IcoChevronDown />
      </button>
      {open &&
        createPortal(
          <div ref={list} id={`${id}-list`} role="listbox" aria-label={label} className="select-list" style={pos} onMouseDown={(e) => e.preventDefault()}>
            {options.map((o, i) => (
              <div
                key={o.value}
                id={`${id}-${i}`}
                data-i={i}
                role="option"
                aria-selected={o.value === value}
                className={`select-opt${i === active ? ' active' : ''}`}
                onPointerMove={() => i !== active && setActive(i)}
                onClick={() => pick(i)}
              >
                <span className="select-opt-main">
                  {o.label}
                  {o.hint && <small>{o.hint}</small>}
                </span>
                <span className="select-check" aria-hidden>
                  <IcoTick />
                </span>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
