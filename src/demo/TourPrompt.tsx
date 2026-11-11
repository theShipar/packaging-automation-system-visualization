import { useEffect, useState } from 'react';
import { pref, setPref } from '../app/persist';
import { useConfirmReplace } from '../workspace/RestartDialog';
import { SCENES, demo, useDemo } from './demo';

const DELAY_MS = 10_000;
const SEEN = 'tourPromptSeen';

/** `?tourprompt=<ms>` forces the prompt with a custom delay, including under automation. */
function promptDelay(): number | null {
  const p = new URLSearchParams(location.search);
  const forced = p.get('tourprompt');
  if (forced !== null) return Math.max(0, Number(forced) || 0);
  if (navigator.webdriver || p.get('demo') === '1' || pref(SEEN, false)) return null;
  return DELAY_MS;
}

/** Offers the guided demo once, after the visitor has explored for a few seconds. */
export function TourPrompt() {
  const d = useDemo();
  const [open, setOpen] = useState(false);
  const replace = useConfirmReplace();

  useEffect(() => {
    const delay = promptDelay();
    if (delay === null) return;
    const id = window.setTimeout(() => {
      if (demo.get().step === null && !demo.get().presenting) setOpen(true);
    }, delay);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (open && d.step !== null) setOpen(false);
  }, [open, d.step]);

  const close = () => {
    setPref(SEEN, true);
    setOpen(false);
  };

  if (!open) return replace.dialog;
  return (
    <>
      <section
        className="tour-prompt"
        role="dialog"
        aria-labelledby="tour-prompt-h"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            close();
          }
        }}
      >
        <div className="tp-head">
          <span className="eyebrow">Guided demo · {SCENES.length} scenes · about 2 min</span>
          <button className="icon-btn sm" onClick={close} aria-label="Dismiss guided demo offer">
            ✕
          </button>
        </div>
        <h2 id="tour-prompt-h" className="tour-title">
          Need a guided demo? Start here.
        </h2>
        <p className="tour-body">Follow one kit down the line, look inside the robot, cause a packaging jam and recover from it.</p>
        <div className="tour-foot">
          <span className="spacer" />
          <button className="btn sm ghost" onClick={close}>
            Not now
          </button>
          <button
            className="btn sm blue"
            onClick={() =>
              replace.ask('Start the guided demo?', 'Start demo', () => {
                close();
                demo.go(0);
              })
            }
          >
            Start guided demo
          </button>
        </div>
      </section>
      {replace.dialog}
    </>
  );
}
