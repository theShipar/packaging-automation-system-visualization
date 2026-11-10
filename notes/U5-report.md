# U5 — Modes, layers, experiments and run controls

## Files changed
- `src/workspace/ModeBar.tsx` (new):
  - **Mode bar** in the bottom-left slot. Explore / Operate / Diagnose / Experiment is a segmented radiogroup (arrow keys move between modes); when the canvas is under 1000 px it becomes a compact menu.
  - **Layer picker**: Flow / Capacity / Health / Quality / Energy (simulated). Each layer states its source and update cadence.
  - **Mode panels:**
    - **Operate:** shipped rate with its window, ETA with its basis, the measured constraint (click to focus it), +15 min, the live batch, and Reset view / Restore scenario… / Restart run….
    - **Diagnose:** open faults through the same `FaultCard` recovery steps as the inspector, other alerts, and recent recoveries with their downtime.
    - **Experiment:** capture a baseline, a list of line-changing commands issued since, fault injection, compare, and Restore baseline / Keep as snapshot / Discard.
- `src/app/experiment.ts` (new):
  - The baseline is a `structuredClone` of the session.
  - `replayTo` advances a copy headless with no later commands.
  - `compareRuns` reads both runs through `summarize()` (the scenario-lab selectors) at the live virtual time.
  - Comparison is blocked, with a reason, after a restart or before time has moved on.
- `src/workspace/RestartDialog.tsx`: a shared `ConfirmDialog` that states the scope and offers "Download this run as JSON first".
  - `RestartDialog`: same seed, **current settings** kept, scenario script not replayed.
  - `RestoreScenarioDialog`: reloads the scenario from its start, with its settings and script.
- `src/workspace/TopCommandBar.tsx`: the Run menu now separates Reset view (camera only), Restore scenario… and Restart run….
- `src/workspace/CanvasRegion.tsx`: mounts the mode bar and panel. The camera's safe rect starts to the right of the panel, so a panel never covers the scene; a ResizeObserver tracks the panel.
- `src/vector/SceneOverlay.tsx`: one layer chip under each station tag, from `stationView`, `lineKpis` and `defectPareto`. Tag collision allows for the chip height while a layer is on.
- `src/features/Inspector.tsx`: `FaultCard` is exported; the body scroll resets on tab or machine change (I09).
- `src/workspace/AppShell.tsx`: DEV hooks `lfWorkspace.mode()` and `lfWorkspace.layer()` for capture.
- `src/styles.css`:
  - Styles for the mode bar, layer picker, mode panel, comparison table and layer chips.
  - The bottom chrome lets the status rail shed items by **its own width** (`container: rail`) instead of the canvas width, so it never overlaps the mode bar or camera tools.
- Tests: new `e2e/operation.e2e.ts` and `tests/experiment.test.ts`; `e2e/capture.e2e.ts` adds the diagnose, operate, experiment, layer-capacity and layer-energy states.

## Behaviour preserved
- Domain unchanged. Modes never change the route, batch, run or selection.
  - M01 checks run ID, sequence and virtual time are identical after cycling all four modes.
  - The camera moves only when the panel would cover the selection.
- Play/pause, speed and the virtual clock stay in the top bar in every mode.
- Fault recovery uses the existing `ACK_FAULT`, `CREATE_WORK_ORDER`, `START_WORK_ORDER` and `RESOLVE_FAULT` commands and their guards (pause before a stop-fault repair, role checks).

## Behaviour new
- **Modes as behaviour filters.** Entering Diagnose switches the layer from Flow to Health, and Operate switches it to Capacity, but only if the user hadn't chosen a layer. Closing a panel returns to Explore.
- **Layers.** One at a time, and products always keep moving:
  - Capacity: in/out fill with meters, amber when full.
  - Health: uptime this run and open faults.
  - Quality: QA yield, rejects and top defect, on QA only.
  - Energy: modelled kWh and share, labelled simulated, "Not a meter".
- **Experiment.** Capture a baseline, change something, run, then compare at the same virtual time. The table shows shipped, rejected, downtime, average WIP, energy and constraint, with deltas coloured by direction, and says plainly that the result is synthetic. Restore baseline asks first and keeps the baseline for another try.
- **Reset / restore / restart separation:**
  - Reset view only moves the camera.
  - Restore scenario replays the scenario script.
  - Restart run keeps settings but not the script.
  - Both destructive actions confirm and offer a JSON copy.

## Tests
- `npx vitest run`: 52/52. New:
  - EXP-001: a snapshot replay is hash-identical to running the same session on.
  - EXP-002: an unchanged run compares with zero deltas.
  - EXP-003: a packaging jam shows as lost output and more than 300 s of extra downtime.
- `npx playwright test smoke camera scene inspector operation`: 35/35. New:
  - M01: modes keep selection and run; the selected machine is right of the panel and inside the safe rect.
  - O01: +15 min is exactly 900 virtual seconds, then paused; the constraint insight appears.
  - O02: Reset view gives 100% and run data is unchanged.
  - O03: Restart keeps the run identity but not the script (no PKG_JAM by 240 s); Restore replays it (PKG_JAM by 240 s); Cancel changes nothing.
  - D10/I05: one injected jam gives one alert tag, alert count 1, the fault card, the critical notice, ETA "Delayed", and a red Health chip. After 300 s packaging has completed nothing more, QA output plus packaging input has grown, QA is blocked, and the Capacity chips go amber.
  - D11/I06: Acknowledge, Work order, Start repair, Resolve & verify. The fault leaves Diagnose and appears under "Recovered this run", and the alert count clears. Over the next 60 s packaging makes between 1 and ⌈60/4.5⌉+1 kits, so there is no instant backlog output.
  - E01: baseline, inject, Compare is disabled until time moves; after 300 s shipped and downtime deltas are "bad"; Restore baseline returns to t = 120 with no faults.
  - L01: chip counts per layer (Quality shows only QA); the Energy source text says "Not a meter".
  - P06: in all four modes, every visible button in the top bar, rail, canvas and inspector has an accessible name, and every disabled one has a reason.

## Viewports
- `screenshots/v2/u5/` at 1600 / 1440 / 1280 / 1024: the earlier states, plus diagnose, operate, experiment, layer-capacity and layer-energy.

## Known issues
- At 1024 with the inspector docked, the status rail shrinks to "252 / 2,300". U6 moves the inspector to an overlay at 1024.
- The Experiment comparison replays from the baseline snapshot on click, synchronously. It takes tens of milliseconds for runs of an hour or so; very long runs would need a worker.
- Restart run keeps the scenario label while dropping its script, by design. The dialog says so.

## Next phase
U6:
- Profile pan, focus, inspector open and fault with `performance.mark`, at 1600×900 and 1280×800 at 20×.
- Render-cost fixes; reduced motion.
- Keyboard: station navigator, focus-visible, 40 px targets.
- Responsive: 1024 overlay dock; 768 and 390 bottom sheets.
