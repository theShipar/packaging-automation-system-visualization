import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { exportJson } from '../app/exports';
import { store, useUi } from '../app/store';
import { formatClock } from '../domain/kpis';
import { trapTab } from '../ui/trapTab';
import { SCENARIOS } from '../domain/scenarios';

/** Destructive run actions always ask, state their scope, and offer to keep a copy first. */
export function ConfirmDialog({ title, children, confirm, onConfirm, onClose, offerCopy = false }: { title: string; children: ReactNode; confirm: string; onConfirm: () => void; onClose: () => void; offerCopy?: boolean }) {
  const s = useUi();
  const cancel = useRef<HTMLButtonElement>(null);
  const [copy, setCopy] = useState(offerCopy && s.events.length > 0);
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
  return createPortal(
    <div className="modal-bg" role="dialog" aria-modal aria-labelledby="confirm-h" onKeyDown={trapTab}>
      <div className="modal">
        <h2 id="confirm-h">{title}</h2>
        <div className="muted" style={{ margin: 0 }}>
          {children}
        </div>
        {offerCopy && (
          <label className="row" style={{ fontSize: 12.5 }}>
            <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> Download this run as JSON first
          </label>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button ref={cancel} className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (copy) exportJson(s);
              onConfirm();
              onClose();
            }}
          >
            {confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** New run on the same seed, keeping the current station settings; scenario script is not replayed. */
export function RestartDialog({ onClose }: { onClose: () => void }) {
  const s = useUi();
  return (
    <ConfirmDialog title="Restart this run?" confirm="Restart run" offerCopy onClose={onClose} onConfirm={() => store.reset({ seed: s.seed, scenarioId: s.scenarioId, config: s.config })}>
      Starts a fresh run of batch {s.batch.id} on seed {s.seed} and <b>keeps the current station settings</b>. This run's {s.events.length.toLocaleString()} events are discarded and scheduled scenario events are not replayed (use Restore scenario for that). Camera and selection are not affected.
    </ConfirmDialog>
  );
}

/** Reload the loaded scenario from its start: its seed, settings, materials and scripted events. */
export function RestoreScenarioDialog({ onClose }: { onClose: () => void }) {
  const s = useUi();
  const sc = SCENARIOS.find((x) => x.id === s.scenarioId) ?? SCENARIOS[0];
  return (
    <ConfirmDialog title={`Restore “${sc.title}”?`} confirm="Restore scenario" offerCopy onClose={onClose} onConfirm={() => store.loadScenario(sc.id)}>
      Reloads the scenario from its start: seed {sc.seed}, its settings and its scripted events. Settings you changed in this run are reset. This run's {s.events.length.toLocaleString()} events are discarded. Camera and selection are not affected.
    </ConfirmDialog>
  );
}

/** Ask before an action replaces a run that has already moved; a run still at 00:00:00 is replaced without asking. */
export function useConfirmReplace() {
  const [pending, setPending] = useState<{ title: string; confirm: string; run: () => void } | null>(null);
  const ask = (title: string, confirm: string, run: () => void) => (store.session.t > 0 ? setPending({ title, confirm, run }) : run());
  const dialog = pending && (
    <ConfirmDialog title={pending.title} confirm={pending.confirm} offerCopy onConfirm={pending.run} onClose={() => setPending(null)}>
      This replaces run {store.session.runId} at virtual {formatClock(store.session.t)}. Its events and counts are not kept unless you download them first.
    </ConfirmDialog>
  );
  return { ask, dialog };
}
