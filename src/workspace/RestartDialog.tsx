import { useEffect, useRef } from 'react';
import { store, useUi } from '../app/store';

/** Restart is destructive for the current run's history, so it always asks and states its scope. */
export function RestartDialog({ onClose }: { onClose: () => void }) {
  const s = useUi();
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    cancel.current?.focus();
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
    <div className="modal-bg" role="dialog" aria-modal aria-labelledby="restart-h">
      <div className="modal">
        <h2 id="restart-h">Restart this run?</h2>
        <p className="muted" style={{ margin: 0 }}>
          Restores batch {s.batch.id} to seed {s.seed} and its initial settings, and discards this run's {s.events.length.toLocaleString()} events. Camera and selection are not affected. Export from Reports first if you want to keep the history.
        </p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button ref={cancel} className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            onClick={() => {
              store.reset({ seed: s.seed });
              onClose();
            }}
          >
            Restart run
          </button>
        </div>
      </div>
    </div>
  );
}
