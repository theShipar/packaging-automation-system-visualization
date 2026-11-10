# LineFlow 2.0 — Acceptance matrix results (U7)

## Test method
- **Seed and runs:** seed 842 (batch B-0842, SEN-KIT-A). Browser runs use a fresh profile; guided-demo scenes use run `RUN-DEMO`. Each test states its virtual times in its source.
- **Browser:** Chrome channel via Playwright (Chromium 157.0.8103.50), headless, device scale 1.
- **Hardware:** Apple M4 Pro (14 cores, 24 GB), macOS (Darwin 27.2.0 arm64).
- **Viewports:** 1600×900, 1440×900, 1280×800, 1024×768, and 768×1024 / 390×844 for touch widths. Inspector presets are 320 / 380 / 440.
- **Commands:**
  - `npx tsc --noEmit`: clean.
  - `npx vitest run`: **62 passed** (8 files).
  - `npx playwright test smoke camera scene inspector operation a11y closeup demo qa`: **62 passed**, 4 gated runs skipped (captures, video, close-ups, soak).
  - Gated runs, executed separately:
    - `SHOTS=after … capture demo`: screenshots.
    - `VIDEO=… demo -g G06`: tour video.
    - `SOAK=1 SOAK_MIN=10 … qa -g P03`: soak.
    - `PERF=1 … perf`: U6 profile.
- **Kinds of evidence:**
  - **unit**: vitest domain or camera test.
  - **e2e**: Playwright against the real app.
  - **shot**: screenshot review in `screenshots/v2/after/`.
  - **perf**: `notes/U6-perf.json` or `notes/U7-soak.json`.

Results: **PASS**, or **OPEN** (needs a human decision; owner named).

## A. Fullscreen layout and workspace chrome

| ID | P | Result | Evidence |
|---|---|---|---|
| L01 | P0 | PASS | e2e `smoke` L01/L02 at 1600×900 (document never scrolls) |
| L02 | P0 | PASS | e2e `smoke` L01/L02 + L09 at 1280×800 |
| L03 | P0 | PASS | e2e `qa` L03: canvas widens > 300 px, focused zoom unchanged, virtual time unchanged |
| L04 | P0 | PASS | e2e `inspector` L04: 320↔440, machine stays framed, run untouched |
| L05 | P0 | PASS | e2e `smoke` L04/L05 (drawer docks, legacy routes open the item); selection and run kept |
| L06 | P1 | PASS | e2e `inspector` C15 (wheel scrolls the panel, camera unchanged) and `smoke` L04 |
| L07 | P1 | PASS | e2e `operation` M01 |
| L08 | P1 | PASS | e2e `qa` L08: no station cards below the canvas; one Machines navigator |
| L09 | P1 | PASS | e2e `smoke` L09 at 1280 |
| L10 | P2 | PASS | e2e `a11y` A04 at 1024×768, 768×1024 and 390×844 (no page scroll; bottom sheets) |

## B. Camera and spatial navigation

| ID | P | Result | Evidence |
|---|---|---|---|
| C01 | P0 | PASS | unit `camera` C01/C02, unit `layout` LAY-004; shot `*-fit.png` |
| C02 | P0 | PASS | unit `camera` C01/C02 (safe rect re-measured); shot `*-inspector.png` |
| C03 | P0 | PASS | unit `camera` C03 + e2e `camera` C03 (≤ 1 px drift) |
| C04 | P0 | PASS | e2e `camera` C04/C05 |
| C05 | P0 | PASS | e2e `camera` C04/C05 (5 px threshold) |
| C06 | P0 | PASS | unit `camera` C06 (all six, inspector 320 and 440) + e2e `camera` C06 |
| C07 | P0 | PASS | e2e `inspector` C07 |
| C08 | P0 | PASS | e2e `qa` C08: follow from robot input through pick and release into QA; largest per-frame camera move < 24 px; follow never drops |
| C09 | P0 | PASS | e2e `qa` C09: follow the seed's first rejected kit; the camera rides the reject route with steps < 24 px; the card ends on the reject state |
| C10 | P0 | PASS | e2e `qa` C10: a manual pan ends Follow and a toast says so (documented policy) |
| C11 | P1 | PASS | e2e `qa` C11 |
| C12 | P1 | PASS | unit `camera` C12 (exact end states, continuous retargeting) |
| C13 | P1 | PASS | e2e `qa` C13: 1600 → 1280 → 1024 → 1600 while focused |
| C14 | P1 | PASS | e2e `qa` C14: a hovered gripper dragged to the left and right canvas edges keeps its tooltip inside the canvas and left of the inspector. **Fixed in U7:** the tooltip was centred on the part and could sit outside the canvas (x = −33 vs canvas x = 60 before the fix); it is now clamped to the safe rect and flips below the part when there is no room above. |
| C15 | P1 | PASS | e2e `inspector` C15 |

## C. Hairline machinery and highlighting

| ID | P | Result | Evidence |
|---|---|---|---|
| V01 | P0 | PASS | shot `*-fit.png`; unit `geometry` GEO-001 (connected ports, one bridge route) |
| V02 | P0 | PASS | U3 hover uses the machine's hull and part geometry, not a bounding box; shot review in close-ups |
| V03 | P0 | PASS | e2e `scene` S03; shot `*-selected.png` (blue-grey fill on the real surfaces, no orange blob) |
| V04 | P0 | PASS | e2e `inspector` I02; shot `*-component.png` (gripper fingers only) |
| V05 | P0 | PASS | e2e `qa` V05: 3 s hover over the running robot at 5×, zero toggles. **Fixed in U7:** kits passing under the pointer used to drop the hover for one frame each robot cycle. |
| V06 | P1 | PASS | shot review at 100% and 350% (`*-fit`, `*-zoomed`): hairline strokes stay legible |
| V07 | P1 | PASS | unit `transport` TRANS-007 + engine "QA rejects never reach packaging or dispatch" |
| V08 | P1 | PASS | unit `transport` TRANS-008; close-ups from U3 |
| V09 | P1 | PASS | tag collision with layer rows (U5); queue overflow badges (`+8`, `20+`) aggregate; unit TRANS-010 |
| V10 | P1 | PASS | unit `transport` "nothing moves while paused", TRANS-005 |

## D. Domain transport and quantity truth

| ID | P | Result | Evidence |
|---|---|---|---|
| D01 | P0 | PASS | unit `engine` "holds at every step through a full batch" (partition invariant) |
| D02 | P0 | PASS | unit `transport` TRANS-001 |
| D03 | P0 | PASS | unit `transport` TRANS-003, unit `geometry` GEO-001 |
| D04 | P0 | PASS | unit `transport` TRANS-001 (reserve → start → complete) |
| D05 | P0 | PASS | unit `geometry` GEO-004/005/006 |
| D06 | P0 | PASS | unit `geometry` GEO-001; unit `transport` "no teleports" |
| D07 | P0 | PASS | unit `engine` QA rejects; unit `transport` TRANS-007 |
| D08 | P0 | PASS | unit `transport` TRANS-008 |
| D09 | P0 | PASS | unit `transport` TRANS-009; unit `engine` cases hold exactly 12 |
| D10 | P0 | PASS | e2e `operation` D10/I05; unit `engine` jam latches and back-pressures |
| D11 | P0 | PASS | e2e `operation` D11/I06 (drains at machine pace) |
| D12 | P0 | PASS | unit `engine` pause mid-cycle; unit `transport` TRANS-005 |
| D13 | P0 | PASS | unit `geometry` GEO-008; unit `engine` speed independence |
| D14 | P0 | PASS | unit `baseline` BASE-002 |
| D15 | P0 | PASS | e2e `qa` D15: out-of-range and fractional buffers are refused with a reason; unit count unchanged |
| D16 | P0 | PASS | e2e `operation` O01 (exactly 900 s); unit `baseline` BASE-001 |
| D17 | P1 | PASS | unit `engine` label stockout blocks packaging without losing units and recovers on receipt; intake shortage is covered by the scenario runs' invariants ("all scenarios run headless") |
| D18 | P1 | PASS | unit `engine` SIM-001; unit `experiment` EXP-001 |

## E. Inspector, navigation and operations

| ID | P | Result | Evidence |
|---|---|---|---|
| I01 | P0 | PASS | e2e `inspector` I01 |
| I02 | P0 | PASS | e2e `inspector` I02 |
| I03 | P0 | PASS | e2e `inspector` I03 |
| I04 | P0 | PASS | unit `engine` settings via command emit SETTINGS_APPLIED; recalibration affects later units only |
| I05 | P0 | PASS | e2e `operation` D10/I05 |
| I06 | P0 | PASS | e2e `operation` D11/I06 |
| I07 | P1 | PASS | e2e `inspector` I07 |
| I08 | P1 | PASS | e2e `qa` I08. **Fixed in U7:** Settings (new run / reset), Scenario lab (load) and Start in the guided demo now ask before replacing a run that has moved, offering a JSON copy first. |
| I09 | P1 | PASS | e2e `inspector` I09 |
| I10 | P1 | PASS | e2e `operation` O02/O03 |
| I11 | P1 | PASS | e2e `qa` I11: a known WIP serial is followed; an unknown serial gets an error toast |
| I12 | P1 | PASS | e2e `qa` I12. **Fixed in U7:** the empty Events table offers Clear filters. |

## F. Visual consistency and accessibility

| ID | P | Result | Evidence |
|---|---|---|---|
| A01 | P0 | PASS | shot `*-fit.png`: 17 px title, no hero headline, no unrelated chart |
| A02 | P0 | PASS | e2e `qa` A02: tags carry status text and fault titles; the state pill has words |
| A03 | P0 | PASS | e2e `a11y` A02: Machines navigator (↑/↓/Enter), `[ ]`; station hulls are focusable buttons |
| A04 | P0 | PASS | e2e `a11y` A02: focus-visible outline present |
| A05 | P1 | PASS | e2e `a11y` A01: focus and Fit are instant; a released drag does not glide |
| A06 | P1 | PASS | e2e `qa` A06: focus moves in, Tab and Shift+Tab stay inside, and focus returns on close. **Fixed in U7:** Tab trap added to the confirm and shortcut dialogs. |
| A07 | P1 | PASS | e2e `qa` A07 (touch emulation): one finger pans without selecting, two-finger pinch zooms (> 1.3×), a tap selects |
| A08 | P1 | PASS | unit `contrast` (10 checks, every text ink ≥ 4.5:1 on every surface) |
| A09 | P1 | PASS | e2e `qa` A09: Simulation pill, rail SIM label, clock tooltip "Virtual simulation time" |
| A10 | P1 | PASS | shot `*-inspector.png`, `*-component.png`: selection is obvious and the scene stays visible beside the dock |

## G. Performance and release

| ID | P | Result | Evidence |
|---|---|---|---|
| P01 | P0 | PASS | perf: pan while running at 20×, frame p95 16.7–16.8 ms, 0 long tasks, no body reflow (L01) |
| P02 | P0 | PASS | perf at 20× (all scenarios) + unit determinism tests (SIM-001, GEO-008, BASE-001) |
| P03 | P0 | PASS | soak `notes/U7-soak.json`: 10.2 min at 10× (≈ 101 virtual min) with an interaction every 3 s. Listeners 241 → 249, DOM nodes 727 → 772, documents 1 → 1; 44,208 events, all unique. Heap 9.6 → 21.2 MB grows linearly with the append-only event log (≈ 260 B per event): run data, not a handler leak. |
| P04 | P1 | PASS | perf (U6): about 60 fps measured headless on the declared hardware; caveat that headless excludes GPU raster |
| P05 | P1 | **OPEN** | Evidence captured: `screenshots/v2/before` vs `screenshots/v2/after`, all states at 1600/1440/1280/1024, plus demo scenes and a video. Approval is a human design review. **Owner: NerdLab.** Impact if skipped: none functional. |
| P06 | P0 | PASS | e2e `operation` P06 |
| P07 | P0 | PASS | Simulation pill visible at every width (A04, G04 in presentation mode); no device claims anywhere in the UI |
| P08 | P1 | PASS | e2e `demo` G01–G04; video `screenshots/v2/after/video/guided-tour-1600x900.webm` |
| P09 | P0 | PASS | e2e `qa` P09: run & select, fault & recovery through the fault card, full guided demo, with zero page errors or console errors; also e2e `smoke` P09 |

## Release decision
- **P0:** all pass.
- **P1:** all pass except **P05**, which is the human screenshot review (owner NerdLab, no functional risk).
- **Accessibility:** no rows waived.
