# U0 — Source code map (LineFlow, before the 2.0 update)

Stack: Vite 5, React 18.3, TypeScript strict, react-router 6, zod, vitest. Project root `lineflow/`. Git initialised in U0 (baseline commit `0fb192b`).

## Subsystem worksheet

| Subsystem | Files | Current behaviour | Regression risk | Test / owner |
|---|---|---|---|---|
| App shell | `src/App.tsx`, `src/app/TopBar.tsx`, `src/styles.css`, `src/styles/tokens.css`, `src/main.tsx` | Grid: 76px glass icon rail + `main` column. Sticky top bar (search, chips, clock, speed, play, +15 min, save, restart). Each rail item is a route (`/production`, `/production/batches`, `/simulation`, `/analytics`, `/assets`, `/events`, `/maintenance`, `/quality`, `/reports`, `/settings`). Body scrolls. | Layout regressions, lost routes | `e2e/smoke.e2e.ts` (L01/L02/L09), screenshots |
| Production page | `src/pages/Production.tsx` | Hero (64px "Packaging Line" title, batch chips, shipped/committed meter), critical strip, stage card with `Scene`, six `MachineCard` row (`.mstrip`), insights row (Throughput barcode, Quality ring, orange Line rhythm dot grid), `Inspector` drawer. Selection in URL params `station`, `details`. | Duplicate station UI, scroll | screenshots |
| SVG scene | `src/vector/Scene.tsx`, `src/vector/sceneModel.ts`, `src/vector/builder.ts`, `src/vector/figures.ts`, `src/vector/iso.ts`, `src/vector/ProductLayer.tsx` | One `<svg viewBox=VIEW_W×VIEW_H>` inside a fixed-aspect div. Layers: `layer-back` (station backs far→near + connectors), `layer-mid` (depth-sorted products + station front groups), `layer-over` (fault outline, `+N` badges, debug), `layer-hit` (hull hit paths, component hull hit paths, unit hit circles). HTML overlays: station number pills (`StationLabel`), `FocusCard`, flow marks, comp tooltip. Station drawings memoised by pose key. | Hit tests, remount, occlusion | `tests/geometry.test.ts`, `tests/transport.test.ts` |
| Station drawings | `src/vector/figures.ts` | Six Hairline figures, hand-ordered back layer for the az −45 camera; parts that products pass behind are `front()` groups with world depth keys. Every solid tags its component ID (`Shape.comp`). | Occlusion if orientation changes | GEO tests, visual review |
| World layout | `src/transport/layout.ts`, `src/transport/graph.ts` | One straight lane line on world y=0, stations chained along +x with 42-unit connector gaps. Ports, lanes and connectors derived from figure entry/exit. `GP` = global projection; `CAM.ox/oy` fitted in `sceneModel.ts`. | Two-row topology changes all world positions | GEO-001…008 |
| Camera | `src/vector/Scene.tsx` (`view` ref, `onWheel`, `zoomBy`, drag), `src/features/follow-product/useFollowCamera.ts` (`Cam2D`, `clampView`) | CSS `translate/scale` on `.scene-inner`. Zoom 1–3× only, wheel zoom needs Cmd/Ctrl, pan only when k>1, `clampView` keeps content filling the box, Fit = reset to k=1. Follow eases inside a 45% dead zone and forces k≥1.8. No safe rect, no panel awareness. | Clipping, drift | none (new `tests/camera.test.ts` in U2) |
| Selection | `Production.tsx` (URL params + local `comp` state), `Scene.tsx` (hover state), `Inspector.tsx` | Station via URL `?station=`, component in page state, hover in scene state, follow in `store.follow`. Assets/Events pages link by route, not shared state. | Contradictory selections | new selection tests U4 |
| Domain | `src/domain/engine.ts`, `types.ts`, `config.ts`, `core.ts`, `invariants.ts`, `rng.ts`, `scenarios.ts`, `history.ts` | Deterministic discrete-event engine, seed 842, batch B-0842, 2,400 planned / 2,300 committed. Commands: START, PAUSE, RESUME, SET_SPEED (1/2/5/10/20), INJECT_FAULT, ACK_FAULT, CREATE/START_WORK_ORDER, RESOLVE_FAULT, RECEIVE_MATERIAL, APPLY_SETTINGS, CLOSE_PARTIAL_CASE. `checkInvariants`, `sessionHash`. | Corrupt metrics | `tests/engine.test.ts`, `tests/baseline.test.ts` |
| Transport | `src/domain/conveyor.ts`, `src/domain/transfer.ts`, `src/transport/poses.ts`, `queueLayout.ts`, `robotChoreography.ts` | 1-D belt tracks per unit in the domain (LANE_SPEC, TRANSFER_LEN=24), reserve→start→complete transfers; view maps tracks onto world lanes; robot IK grip/release at ports. | Snapping, duplication | TRANS-001…010, GEO-004…008 |
| KPIs / selectors | `src/domain/kpis.ts` | `unitCounts`, `stationView`, `lineKpis` (shipped, remainingGood, rolling 15-min throughput, yield, OEE gated, energy, ETA with basis, bottleneck), `effectiveStatus`. | Fake numbers | engine KPI tests |
| Timing | `src/app/store.ts` | One RAF loop: `advance(s, t + dt·speed)` while running, plus registered steppers; frame listeners every frame, UI listeners ~8 Hz; autosave every 15 s. | Drift, CPU | determinism tests |
| Inspector | `src/features/Inspector.tsx` | Fixed overlay drawer 404px (not docked). Header with `StationThumb`, 3 tiles (throughput, avg cycle, utilisation). Tabs Overview / Components / Logs / Settings. Footer fault injection. Esc closes. | Stale info, covers scene | integration via e2e |
| Tools / pages | `src/pages/*.tsx` | Full-page routes replacing the canvas: Batches (+detail/reconciliation), Simulation (scenario list + run), Analytics, Assets (+detail), Events, Maintenance, Quality, Reports, Settings (role, data reset). | Dead links | e2e |
| Persistence | `src/app/persist.ts`, `store.hydrate/save` | IndexedDB `lineflow/sessions/current` with engine version gate; `pref()`/`setPref()` in localStorage (`lf.*`). Exports in `src/app/exports.ts`. | Erased history | reload check |
| UI kit | `src/ui/Kit.tsx`, `Charts.tsx`, `Status.tsx`, `Icons.tsx`, `MachineCard.tsx`, `Page.tsx` | Chips, glass cards, ring, barcode chart, dot grid, status pills, icon set (1.8 stroke). | Visual consistency | screenshots |
| Tests | `tests/*.test.ts` (vitest, node), `e2e/*.e2e.ts` (Playwright + system Chrome on port 5181) | 37 unit tests green at U0; e2e L01/L02 fail at baseline (expected). | — | — |

## Modules not found (not invented)
- No HTML prototype `reference/lineflow-2-spatial-workspace-prototype.html` and no `reference/*.png` from the 2.0 kit in the workspace. Work proceeds from the Markdown spec only.
- No separate scene renderer API (`SpatialFactoryScene`); scene is a React component. U2/U3 add `getBounds`/anchors as pure functions instead.
- No component-specific outline geometry beyond `Shape.comp` tags and convex hulls (`GEOMETRY.comps`).

## Files to edit (by phase) — preserve vs replace

- Preserve unchanged: everything in `src/domain/`, `src/transport/poses.ts`, `queueLayout.ts`, `robotChoreography.ts`, `src/domain/conveyor.ts`, `transfer.ts`.
- Adapt: `src/transport/layout.ts`, `graph.ts`, `src/vector/sceneModel.ts`, `builder.ts` (U3, mirrored views), `src/app/store.ts` (camera stepper only).
- Replace: `src/App.tsx` shell, `src/app/TopBar.tsx`, `src/pages/Production.tsx`, `src/vector/Scene.tsx` camera/overlays, `src/features/Inspector.tsx` container, `src/styles.css`, `src/styles/tokens.css`, `useFollowCamera.ts`.
- Re-host (body kept, container changed): `src/pages/*.tsx` as drawer panels.
- Remove: `src/ui/MachineCard.tsx` from the workspace, Hero/insights/rhythm, `FocusCard`, `StationLabel`, glass styling, `@fontsource/urbanist`.
