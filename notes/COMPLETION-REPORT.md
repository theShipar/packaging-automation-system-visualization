# LineFlow 2.0 Update — Implementation Status

- **Commit / branch:** current branch. One commit per phase on top of the baseline `0fb192b`:

  | Phase | Commit |
  |---|---|
  | U0 | `916ee58` |
  | U1 | `cf5ae43` |
  | U2 | `f101436` |
  | U3 | `7e8323d` |
  | U4 | `e016fcd` |
  | U5 | `fc5e5f7` |
  | U6 | `6028dce` |
  | U7 | the commit that adds this file |

- **U0–U7 phase status:** all **pass**.
  - Per-phase reports: `notes/U0-report.md` … `notes/U7-report.md`.
  - Full matrix: `notes/U7-qa-results.md`. All P0 pass; P1 all pass except P05, which is the human screenshot approval (owner NerdLab).

## Product story
- **Problem:** complex industrial workflows are usually shown as unrelated tables, so finding a cause takes effort.
- **Approach:** LineFlow 2.0 shows one six-station packaging line as a spatial, white-canvas workspace. The machines are hand-built Hairline vector figures driven by a deterministic offline simulation.
- **How it works:** you pan and zoom around the line, select a machine or one of its parts, and the inspector docks beside it. Modes filter what matters (Explore / Operate / Diagnose / Experiment). A fault, its queue and its recovery all derive from the same engine events.
- **The guided demo** (`/production?demo=1`) tells the story in five scenes and about two minutes: overview, follow a kit, inspect the robot's gripper, cause a packaging jam, then recover and compare against a no-jam baseline.

## Feature inventory
- **Workspace shell:**
  - Full-viewport layout with no page scroll at any tested width.
  - Top command bar (Simulation pill, state, virtual clock, speed, play, Run menu) and a left tool rail.
  - Docked tool drawer and resizable inspector (320 / 380 / 440).
  - Bottom status rail, mode bar and camera tools.
- **Camera:**
  - Pure camera math with tests; wheel zoom anchored at the cursor, drag/space pan, two-finger pinch, and keys (F, ⌘0, + / −, [ ]).
  - Fit, focus on a station or part, and Follow a unit.
  - A measured safe rect that frames around every panel, sheet and the tour card.
- **Scene:**
  - Compact two-row cell with a robot → QA U-turn bridge.
  - Blue-grey selection on the real geometry, part highlighting in both the scene and the preview, level-of-detail cues, and station tags that avoid collisions.
- **Inspector:**
  - Overview (fault card with guarded recovery steps), Parts, Activity, Config.
  - One selection shared by the scene, Assets and Events.
- **Operations:**
  - The four modes, five data layers (Energy labelled simulated) and a +15 virtual-minute step.
  - Baseline experiments compared at the same virtual time.
  - Separate Reset view / Restore scenario / Restart run, plus confirmations before any run replacement.
- **Accessibility:**
  - WCAG AA text tokens (tested).
  - Keyboard Machines navigator, focus-visible, focus return and dialog focus trap.
  - 40 px pointer targets, reduced motion, touch pan/pinch/tap.
  - Responsive at 1024 (overlay dock) and 768 / 390 (bottom sheets).
- **Demo:** the five-scene guided tour on seed 842 and presentation mode (`P`, `?present=1`).

## Design system (tokens in `src/styles/tokens.css`)
- **Colour:**
  - White canvas, `#f7f8fa` app background, ink scale `#172337` / `#4e6074` / `#56677b` / `#5e6e82`. Non-text greys use `ink-dim`.
  - Selection is blue-grey (`#537faf`, strong `#3d6797`, fill `#e7f0fc`). Status tones are good / warning / error with soft fills.
  - Brand orange `#f1744d` is used only for the brand mark and alerts.
- **Type and shape:** system font stack, 17 px top-bar title, 11–13.5 px UI text; radii 9–16 px; three shadow levels.
- **Hairline:** the upstream MIT kernel and bench are untouched.

## Exact source files changed (since `0fb192b`)
- **New:**
  - `src/workspace/*`: AppShell, CanvasRegion, InspectorDock, ModeBar, RestartDialog, ShortcutsDialog, StatusRail, ToolDrawer, TopCommandBar, WorkspaceRail, alerts, drawerContext, links, usePopover, workspaceStore.
  - `src/camera/*`: camera, commands, controller, useCameraInput.
  - `src/vector/SceneOverlay.tsx`, `src/features/LiveInsights.tsx`.
  - `src/app/experiment.ts`, `src/app/perf.ts`.
  - `src/demo/demo.ts`, `src/demo/TourCard.tsx`, `src/ui/trapTab.ts`.
- **Modified:**
  - `src/App.tsx`, `src/main.tsx`, `src/app/store.ts`, `src/features/Inspector.tsx`.
  - `src/pages/{Analytics,Assets,Batches,Events,Maintenance,Reports,Settings,Simulation}.tsx`.
  - `src/styles.css`, `src/styles/tokens.css`.
  - `src/transport/{graph,layout,poses,queueLayout}.ts`.
  - `src/ui/{Icons,Page}.tsx`.
  - `src/vector/{ProductLayer,Scene,StationThumb}.tsx`, `src/vector/{builder,sceneModel}.ts`.
- **Removed:**
  - `src/app/TopBar.tsx`, `src/pages/Production.tsx`, `src/ui/MachineCard.tsx`: replaced by the workspace shell and the canvas.
  - `src/features/follow-product/useFollowCamera.ts`: replaced by the camera controller's follow mode.
- **Unchanged:** `src/domain/*` (no diff since the baseline).
- **Tests:**
  - `e2e/{smoke,camera,scene,inspector,operation,a11y,demo,qa,capture,closeup,perf}.e2e.ts`.
  - `tests/{baseline,camera,layout,experiment,contrast}.test.ts` (new); `tests/{geometry,transport}.test.ts` (updated).

## Existing features preserved
- Every legacy route opens its matching drawer item.
- **Simulation:** same seeded engine, golden 15-minute run (BASE-001); UI reads never change the run (BASE-002).
- **Products:** serial follow, fault catalogue and guarded recovery, settings via commands only.
- **Data and persistence:** scenario lab, exports (JSON/CSV), IndexedDB snapshots.
- **Roles:** role permissions.

## Features replaced or removed, with rationale
- The landing hero headline, machine cards below the scene and the scene-in-a-card are replaced by the full-viewport canvas plus the inspector. The spec removes duplicate station navigation (L08) and the giant headline (A01).
- Orange selection blobs become blue-grey selection on the real geometry; orange is kept for alerts and brand only (the user's choice, matching the 2.0 spec).
- The old follow hook became the camera controller's follow mode, which keeps one owner of the camera.

## Screenshot evidence at 1600×900 and 1280×800
- **States:** `screenshots/v2/after/{1600,1280}-{fit,selected,component,faulted,inspector,zoomed}.png`, plus diagnose, operate, experiment, layer-capacity and layer-energy.
- **Guided demo:** `screenshots/v2/after/{1600,1280}-demo-{intro,scene1…5}.png` and `-presentation.png`.
- **Video:** `screenshots/v2/after/video/guided-tour-1600x900.webm`.
- **Before set:** `screenshots/v2/before/`. Narrow widths: `screenshots/v2/u6/`.

## Domain tests
- `npx vitest run`: **62 passed** (8 files: engine, transport, geometry, layout, camera, baseline, experiment, contrast).
- Conservation, unique identity, capacities, zero-snap robot hand-off, reject routing, carton/case association, pause/speed determinism, golden baseline and experiment replay.

## Camera and selection tests
- `npx playwright test smoke camera scene inspector operation a11y closeup demo qa`: **62 passed** (4 gated capture and soak runs skipped and run separately).
- Covers C01–C15, I01–I12, L01–L10, D10/D11/D15, V05, A01–A09, P06/P09 and the demo (G01–G04).
- **Measurements:**
  - Perf (`notes/U6-perf.json`): about 60 fps headless, frame p95 ≤ 16.8 ms, scene render p95 ≤ 2.9 ms on an Apple M4 Pro. Headless, so no GPU raster; this is not a device claim.
  - Soak (`notes/U7-soak.json`): 10 min, listeners and DOM bounded, no event duplication.

## Known limitations and next actions
- **P05** (screenshot comparison approval) needs a human design review of `before` vs `after`. Owner: NerdLab.
- **Heap growth:** heap grows with the append-only event log (about 260 B per event, about 20 MB for a full batch). If much longer sessions matter, consider windowing the in-memory log; that is a domain change, out of scope here.
- **Edge tags:** station tags clip at the canvas edge when zoomed in close (they're anchored to their machine).
- **Phone (390 px):** opens at a small Fit; navigation is by pinch and the Machines list. 2× and 5× speeds are hidden from the phone toolbar.
- **No GPU profile:** no real-device GPU or 60 FPS profile has been recorded; only headless numbers.
- **Scene 5 layout:** at 1280×800 the comparison table needs a short scroll in the Experiment panel.
- **Fullscreen:** presentation mode does not use the Fullscreen API (optional per spec).
