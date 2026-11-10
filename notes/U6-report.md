# U6 — Performance, accessibility and responsive layouts

## Files changed
- `src/app/perf.ts` (new): `mark()` and `measure()` wrappers around `performance.mark/measure`. They do nothing unless the URL has `?perf`, so production pays nothing.
- **Instrumentation:**
  - `src/vector/Scene.tsx`: the `lf:scene` measure (render to layout effect) on every scene render.
  - `src/camera/controller.ts`: `lf:cam:<mode>` from animation start to settle.
  - `src/workspace/workspaceStore.ts` and `InspectorDock.tsx`: `lf:inspector-open` from the closed→open transition to the dock's layout effect.
- `src/camera/controller.ts`: under reduced motion the follow camera snaps instead of easing; animated moves were already instant there.
- `src/styles/tokens.css`: contrast fixes.
  - `ink-3` #5f6f83 → #56677b; `ink-4` #8a98aa → #5e6e82; `good` #21836d → #1b7562.
  - New `ink-dim` (#8a98aa) for **non-text only** (dots, severity bars, the search icon, the dashed secondary chart line).
  - `styles.css` moves those decorative uses to `ink-dim`; the rail "SIM" label grows from 9.5 to 10.5 px.
- `src/workspace/CanvasRegion.tsx`:
  - **Machine navigator:** a `nav "Machines"` with one button per station, showing name and live status or fault title. It stays visually hidden until it receives focus, then opens as a panel. ↑/↓/Home/End move between machines; Enter selects, focuses and opens the inspector. `aria-current` marks the selection.
  - **Safe rect:** now also accounts for floating panels. An overlay inspector narrows it from the right; a bottom sheet raises its floor. The canvas exposes `--ov-r` / `--ov-b` so the notice row, mode bar, status rail and camera tools step aside instead of sliding under the panel.
- `src/workspace/AppShell.tsx`: `[` and `]` cycle the previous/next machine (select + focus) from anywhere outside a text field.
- `src/workspace/InspectorDock.tsx`: **focus return.** When the dock closes while focus is inside it, or focus has been lost, focus goes back to the element that opened it.
- `src/workspace/ShortcutsDialog.tsx`: lists `[ ]` and the Machines list.
- `src/workspace/TopCommandBar.tsx`: a "Save snapshot" Run-menu item that only appears at phone width, where the toolbar drops the save icon.
- `src/styles.css`:
  - **40 px targets:** an invisible `::after` hit area on `.icon-btn` (34→40, small 28→40) and on the speed segments (26→40 tall). Under `pointer: coarse` the controls themselves grow to 40 px.
  - **≤1180 px:** the inspector floats over the canvas (absolute, shadow) instead of taking a column.
  - **≤820 px:**
    - The inspector and tool drawer become bottom sheets with a grab handle; the resize handles are hidden.
    - The top bar drops the crumb, title, batch label and clock caption.
  - **≤600 px (canvas container or viewport):**
    - The top bar wraps onto two rows. Speed keeps 1× / 10× / 20×, and Save moves to the Run menu.
    - The rail is 48 px wide.
    - The status rail takes its own row above the mode bar and camera tools.
    - The mode panel becomes a sheet above the controls.
    - While the inspector sheet is open, the status rail, start hint and mode panel step back so the scene keeps room.
- Tests:
  - `e2e/a11y.e2e.ts` (new): A01–A04.
  - `tests/contrast.test.ts` (new): 10 contrast checks.
  - `e2e/perf.e2e.ts` (new, runs only with `PERF=1`).

## Behaviour preserved
- Domain unchanged.
- Desktop at 1181 px and wider is pixel-identical apart from the darker grey text: the inspector is still a layout column there.
- Camera framing rules, Esc stack and URL deep links are unchanged.
- The Simulation pill stays visible at every width, including 390 px.

## Behaviour new
- Keyboard-only operation of the scene: Tab reaches the Machines list, and `[ ]` cycles machines.
- Reduced motion: every camera move, including follow, is immediate, and a released drag does not glide (A01).
- 1024×768: the inspector overlays and the selected machine is framed to its left; camera tools and the rail stay reachable.
- 768×1024 and 390×844: bottom sheets, no page scroll, and the selected machine stays above the sheet (A04).

## Measurements
- **Setup:**
  - `PERF=1 npx playwright test perf`.
  - Chromium 157.0.8103.50 under Playwright, headless with software raster.
  - Apple M4 Pro (14 cores, 24 GB), macOS (Darwin 27.2.0 arm64).
  - Run at 20× speed, 1600×900 and 1280×800.
  - Raw files: `notes/U6-perf-before.json` (before the U6 UI changes) and `notes/U6-perf.json` (after).
- **Caveat:** headless rAF timing measures main-thread work and compositing in software. It does **not** include GPU raster on a real display. These numbers show the app's own cost has ample headroom; they are **not** a claim of 60 FPS on any particular device.

| Scenario (after U6) | 1600×900 frame p95 | 1280×800 frame p95 | Frames > 25 ms | Long tasks | Scene render p50 / p95 |
|---|---|---|---|---|---|
| Idle | 16.8 ms | 16.7 ms | 0 | 0 | 1.3 / 1.7 ms |
| Pan (drag) | 16.7 ms | 16.8 ms | 0 at 1600; 0.4% at 1280 (one 33 ms frame) | 0 | 1.3 / 1.7 ms |
| Wheel zoom | 16.7 ms | 16.8 ms | 0 | 0 | 1.2–1.3 / 1.5–1.6 ms |
| Focus station | 16.7 ms | 16.7 ms | 0 | 0 | 1.3 / 1.6–1.7 ms |
| Open inspector | 16.7 ms | 16.8 ms | 0 | 0 | 1.9–2.0 / 2.8–2.9 ms |
| Fault injected | 16.8 ms | 16.7 ms | 0 | 0 | 1.8 / 2.7 ms |
| 90 min in, Diagnose + Quality layer | 16.8 ms | 16.8 ms | 0 | 0 | 1.6–1.7 / 1.9–2.1 ms |

- **Timings:**
  - Focus camera move: 527.7 ms at 1600 and 526.3 ms at 1280. This is the designed animation length, not render cost.
  - Inspector reframe: 228.5 ms and 229.4 ms.
  - Inspector open, from state change to dock layout: 11.9 ms and 11.6 ms.
  - Fault → alert tag on screen: 12.4 ms and 10.9 ms.
- **Before vs after:** within run-to-run noise. Scene p95 moved by 0.1–0.3 ms. The single 33 ms frame during the 1280 pan did not repeat in the 1600 run or in the baseline.
- **Render-cost work:** none needed. The scene re-renders on simulation ticks but costs about 1–3 ms. Tag projection is already outside React (portal + camera subscription), so a re-render of the whole factory each tick was not observed as a cost driver.

## Tests
- `npx tsc --noEmit`: clean.
- `npx vitest run`: 62 passed (52 + 10 contrast).
- `npx playwright test smoke camera scene inspector operation a11y closeup`: 41 passed.
  - A01: reduced motion.
  - A02: Machines navigator, `[ ]`, focus-visible, focus return.
  - A03: 40 px targets.
  - A04 ×3: 1024×768, 768×1024 and 390×844, with no page scroll, Simulation visible, controls visible, and the selected machine not under the inspector.
- `tests/contrast.test.ts`:
  - Every text ink (ink, ink-2/3/4, selected-strong, warning-ink, error-ink, good) reaches ≥ 4.5:1 on canvas, app background, surface, muted, hover and selected fill.
  - Each status ink reaches ≥ 4.5:1 on its soft tone.
  - White text reaches ≥ 4.5:1 on the filled buttons.

## Viewports
- `screenshots/v2/u6/`:
  - `{1600,1440,1280,1024}-{fit,selected,component,faulted,inspector,zoomed,diagnose,operate,experiment,layer-capacity,layer-energy}.png`
  - `{tablet-landscape,tablet-portrait,phone}-{fit,inspector}.png`

## Known issues
- When zoomed in close, station tags near the canvas edge clip at the edge (for example the Assembly tag in `1024-faulted.png`). They are positioned at their machine, not clamped.
- The 390 px phone view opens with the whole line at a small scale. It is navigable by pinch/zoom and the Machines list, but not readable at Fit; the spec accepts this below 768 px.
- At 390 px the 2× and 5× speeds are hidden from the toolbar (1×, 10× and 20× remain).
- No real-device GPU profile has been recorded; see the caveat above.

## Next phase
U7: `?demo=1` five-scene guided tour on a deterministic seed with a presentation toggle, the full A–G QA matrix in `notes/U7-qa-results.md`, after-screenshots and the completion report.
