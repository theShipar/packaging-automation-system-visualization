import { useEffect, useRef } from 'react';
import { trapTab } from '../ui/trapTab';

export const SHORTCUTS: [string, string][] = [
  ['Drag', 'Pan the canvas (5 px before a click becomes a drag)'],
  ['Space + drag', 'Pan, even starting on a machine'],
  ['Wheel  ·  pinch', 'Zoom at the pointer'],
  ['F  ·  ⌘ 0', 'Fit the whole line'],
  ['+  /  −', 'Zoom in / out around the centre'],
  ['Double-click', 'Focus a machine or part'],
  ['[  /  ]', 'Previous / next machine'],
  ['Tab  →  Machines', 'Keyboard list of machines; ↑ ↓ to move, Enter to inspect'],
  ['/', 'Find and follow a serial'],
  ['⌘ K  ·  Ctrl K', 'Find and follow a serial'],
  ['Esc', 'Step back: popover, part, machine, follow, drawer'],
  ['?', 'Show this list'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    addEventListener('keydown', esc, true);
    return () => {
      removeEventListener('keydown', esc, true);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-bg" role="dialog" aria-modal aria-labelledby="keys-h" onKeyDown={trapTab} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2 id="keys-h">Keyboard shortcuts</h2>
        <dl className="keys">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k + v}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button ref={close} className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
