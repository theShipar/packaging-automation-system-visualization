# U7 — Guided demo, presentation mode and sign-off

## Files changed
- `src/demo/demo.ts` (new): the guided demo.
  - **Five scenes from spec 15:**
    - The whole line, running at 5×.
    - Follow a serialized kit at 2×.
    - Inspect a machine: robot, gripper and the Parts tab.
    - Introduce a fault: a quiet baseline capture, then `PKG_JAM`, Experiment mode and the packaging fault card.
    - Recover and decide: the fault card's own guarded steps, 2 more virtual minutes, then the baseline comparison and the Activity tab.
  - **Deterministic rebuilds:** each scene is rebuilt from **seed 842, run `RUN-DEMO`** by a fixed headless command script. Next, Back and a reload land on identical states (G02). Nothing is staged: every number is the engine's output.
  - **Controls:**
    - Start.
    - Next / Back (also ← → inside the card).
    - Skip tour: closes the guide and leaves the line as it is.
    - Exit (✕) or "Return to overview": closes the guide and fits the line; the run keeps its state.
  - **Presentation mode:** a store flag, toggled by `P`, the Run menu, the tour card and `?present=1`; Esc leaves.
- `src/demo/TourCard.tsx` (new): the floating guide. It shows the scene title, one or two sentences, progress dots and a Presentation toggle. The intro states the seed and that nothing connects to real machines.
- `src/workspace/CanvasRegion.tsx`: mounts the tour card. The camera's safe rect starts below the card, and the notice row, start hint and mode panel shift down by `--tour-h`.
- `src/workspace/AppShell.tsx`:
  - `?demo=1` opens the intro and `?present=1` turns on presentation.
  - `P` toggles presentation; Esc leaves it after the usual Esc stack.
  - DEV hook `lfDemo`.
- `src/workspace/TopCommandBar.tsx`:
  - Run menu items for Guided demo and Presentation mode.
  - An "Exit presentation" button while presenting.
- `src/styles.css`:
  - Tour card styles.
  - Presentation hides the rail, tool drawer, crumb, batch, progress, search, save, speed, mode bar, latest-event pill and Machines list. It keeps the Simulation pill, state, clock, play, alerts, Run menu, status rail, camera tools, the inspector and the mode panel.
- **QA fixes found while running the matrix:**
  - **V05 hover flicker** (`src/vector/Scene.tsx`): a kit's follow-hit circle passing under a still pointer dropped the machine hover for one frame each robot cycle. A kit under the pointer now keeps the machine hover; leaving the kit for empty canvas still clears it.
  - **I08 safe replace** (`src/workspace/RestartDialog.tsx`, `src/pages/Settings.tsx`, `src/pages/Simulation.tsx`, `src/demo/TourCard.tsx`): `useConfirmReplace()` asks before replacing a run that has moved, and offers "Download this run as JSON first". `ConfirmDialog` now portals to `document.body`, because the canvas is a CSS container that would otherwise trap a fixed overlay.
  - **A06 focus trap** (`src/ui/trapTab.ts`, new): Tab and Shift+Tab cycle inside the confirm and shortcut dialogs.
  - **C14 tooltip at the edge** (`src/vector/SceneOverlay.tsx`): the part tooltip is clamped to the camera's safe rect (never under the inspector or a mode panel) and flips below the part near the top.
  - **I12 empty filter** (`src/pages/Events.tsx`): "Clear filters" appears in the empty table.
  - `src/app/experiment.ts`: `capture(quiet)` so the tour doesn't stack toasts.
  - `tests/contrast.test.ts`: reads `tokens.css` without Node typings. The U6 version passed vitest but failed `tsc` (`node:fs` types); `tsc` is clean again.
- Tests:
  - `e2e/demo.e2e.ts` (new): G01–G04, plus gated G05 (screenshots) and G06 (video).
  - `e2e/qa.e2e.ts` (new): L03, L08, C08, C09, C10, C11, C13, C14, V05, A07, D15, I08, I11, I12, A02/A09, A06, P09, plus the gated P03 soak.

## Behaviour preserved
- Domain unchanged (`src/domain/*`). The demo only issues the same commands a user can.
- Esc stack, URL deep links, modes and layers behave as before. Presentation hides chrome; it never disables a feature (Esc or the Exit button brings it back).

## Behaviour new
- `/production?demo=1`: a five-scene guided story in about two minutes, resettable and skippable.
- Presentation mode for screenshots and talks.
- Confirmations before any run replacement, a focus trap in dialogs, and a stable hover over running machines.

## Tests
- `npx tsc --noEmit`: clean.
- `npx vitest run`: 62 passed.
- Playwright (`smoke camera scene inspector operation a11y closeup demo qa`): 62 passed, 4 gated runs skipped.
- Soak: 10.2 min passed (`notes/U7-soak.json`).
- Full matrix: `notes/U7-qa-results.md`. All P0 pass; P1 all pass except P05 (human screenshot approval, owner NerdLab).

## Viewports
- `screenshots/v2/after/`:
  - `{1600,1440,1280,1024}-{fit,selected,component,faulted,inspector,zoomed,diagnose,operate,experiment,layer-capacity,layer-energy}.png`
  - `{1600,1280}-demo-{intro,scene1…scene5}.png` and `{1600,1280}-presentation.png`
  - `video/guided-tour-1600x900.webm` (recorded clicks through the real tour)
- The `before` set (U0) is next to it for comparison.

## Known issues
- In scene 5 at 1280×800, the comparison table sits below the change list in the Experiment panel and needs a short scroll.
- Station tags clip at the canvas edge when zoomed in (unchanged from U6).
- Heap grows with the append-only event log, about 260 B per event (≈ 20 MB for a full batch). That is by design in the domain, but it's a watch item for much longer runs.
- The Fullscreen API is not used; presentation maximises within the browser window (the spec allows this).

## Next phase
None. U7 is the last phase; see `notes/COMPLETION-REPORT.md`.
