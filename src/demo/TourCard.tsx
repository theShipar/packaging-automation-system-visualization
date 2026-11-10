import { useEffect, useRef } from "react";
import { useUi } from "../app/store";
import { useConfirmReplace } from "../workspace/RestartDialog";
import { DEMO_SEED, SCENES, demo, useDemo } from "./demo";

/** Floating guide at the top of the canvas; the camera frames the scene below it. */
export function TourCard() {
  const d = useDemo();
  useUi();
  const primary = useRef<HTMLButtonElement>(null);
  const replace = useConfirmReplace();
  useEffect(() => primary.current?.focus({ preventScroll: true }), [d.step]);
  if (d.step === null) return null;

  if (d.step === -1)
    return (
      <>
        <section className="tour-card" role="dialog" aria-label="Guided demo">
          <div className="tour-head">
            <span className="eyebrow">
              Guided demo · 5 scenes · about 2 minutes
            </span>
          </div>
          <p className="tour-body">
            A walk through one simulated batch: follow a kit, inspect a machine,
            cause a jam and recover from it. Runs on seed {DEMO_SEED}; nothing
            connects to real machines.
          </p>
          <div className="tour-foot">
            <PresentToggle on={d.presenting} />
            <span className="spacer" />
            <button className="btn sm ghost" onClick={() => demo.skip()}>
              Not now
            </button>
            <button
              ref={primary}
              className="btn sm blue"
              onClick={() =>
                replace.ask("Start the guided demo?", "Start demo", () =>
                  demo.go(0),
                )
              }
            >
              Start
            </button>
          </div>
        </section>
        {replace.dialog}
      </>
    );

  const scene = SCENES[d.step];
  const last = d.step === SCENES.length - 1;
  return (
    <section
      className="tour-card"
      role="dialog"
      aria-label={`Guided demo, scene ${d.step + 1} of ${SCENES.length}`}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLSelectElement) return;
        if (e.key === "ArrowRight" && !last) demo.next();
        if (e.key === "ArrowLeft" && d.step! > 0) demo.back();
      }}
    >
      <div className="tour-head">
        <span className="eyebrow num">
          Scene {d.step + 1} of {SCENES.length}
        </span>
        <h2 className="tour-title">{scene.title}</h2>
        <button
          className="icon-btn sm"
          onClick={() => demo.exit()}
          aria-label="Exit demo"
          title="Exit demo (back to the overview)"
        >
          ✕
        </button>
      </div>
      <p className="tour-body" aria-live="polite">
        {scene.body()}
      </p>
      <div className="tour-foot">
        <span className="tour-dots" aria-hidden>
          {SCENES.map((_, i) => (
            <i
              key={i}
              className={i === d.step ? "on" : i < d.step! ? "done" : ""}
            />
          ))}
        </span>
        <PresentToggle on={d.presenting} />
        <span className="spacer" />
        <button
          className="btn sm ghost"
          onClick={() => demo.skip()}
          title="Close the guide and keep the line as it is"
        >
          Skip tour
        </button>
        <button
          className="btn sm"
          disabled={d.step === 0}
          onClick={() => demo.back()}
        >
          Back
        </button>
        {last ? (
          <button
            ref={primary}
            className="btn sm blue"
            onClick={() => demo.exit()}
          >
            Return to overview
          </button>
        ) : (
          <button
            ref={primary}
            className="btn sm blue"
            onClick={() => demo.next()}
          >
            Next
          </button>
        )}
      </div>
    </section>
  );
}

function PresentToggle({ on }: { on: boolean }) {
  return (
    <label className="tour-present">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => demo.setPresenting(e.target.checked)}
      />
      Presentation
    </label>
  );
}
