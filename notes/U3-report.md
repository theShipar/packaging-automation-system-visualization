# U3 — Two-row factory and real-geometry highlight

## Files changed
- `src/transport/layout.ts`, rewritten as a two-row cell:
  - Row 1 (intake → assembly → robot) runs along +x on y = 0. Row 2 (QA → packaging → dispatch) runs back along −x on y = 132.
  - Positions use a row coordinate `s` that grows with flow on both rows.
  - Row 2 machines are drawn as **mirror images in local x** (handed machines). Seen from the fixed −45° camera, that shows their upstream side, so the camera stays consistent and the existing paint order still holds.
  - New exports: `rowPoint`, `rowX`, `ROW_Y`, `ROW_OF`, `BRIDGE_PATH`, `BRIDGE_X`, `BRIDGE_DOMAIN`.
- `src/transport/graph.ts`:
  - Main lanes are generic row segments (`rowLane`).
  - The robot outfeed, robot→QA transfer and QA infeed are three sections of one U-turn path, each mapped by the same factor `BRIDGE_SCALE`.
  - Lanes now carry `scale`. New exports: `DERIVED_LANES`, `MOUTHS`, `EXIT_DIR`.
- `src/transport/poses.ts` and `queueLayout.ts`: cases leave along row 2's direction. The bridge has its own overflow badge.
- `src/vector/builder.ts`:
  - A view can map local → world (`toW`) and be mirrored; the front-face test follows the mirror.
  - The highlighted part's own paths get a `part` class.
- `src/vector/sceneModel.ts`:
  - Belt pieces per row plus the three bridge pieces: outfeed stub, cross column, infeed stub.
  - Label anchors and flow marks are placed through `toWorld` / `rowPoint`; added `STATION_DEPTH`.
  - Content bounds include the bridge and the exit.
- `src/vector/Scene.tsx`:
  - Paints by row: row 1 bodies and belts, then row 1 products and front parts, then the same for row 2. Row 2 is nearer, so it correctly covers row 1.
  - Part hit areas cover the selected machine, and any hovered machine once zoomed in.
  - Fixed a latent U1 bug: clicking a second machine snapped back to the first, and an empty click didn't clear the selection.
- `src/vector/ProductLayer.tsx`: depth items carry their row.
- `src/vector/SceneOverlay.tsx`: queue badges under 3 are hidden at overview, and counts are capped at "20+" until zoomed in.
- `src/vector/StationThumb.tsx`: the inspector preview shows the same handedness as the line.
- `src/workspace/CanvasRegion.tsx`: part selection passes the station explicitly.
- `src/styles.css`, `src/styles/tokens.css`:
  - Part highlight: `--lf-selected-part` fill and a strong blue contour on the real paths, with the rest of the machine quietened.
  - A faulted part is red, separate from selection.
  - The hull outline on part hover is gone; hulls are invisible hit areas only.
- Tests: new `tests/layout.test.ts` and `e2e/scene.e2e.ts`; updated `tests/geometry.test.ts` and `tests/transport.test.ts`. New tool `e2e/closeup.e2e.ts` for close-up stills.

## Behaviour preserved
- **Domain unchanged:** `src/domain/*` and the conveyor model are untouched. The U0 baseline (`BASE-001/002`) is identical.
- **Transport invariants hold:** every unit still appears and disappears only at mouths, nothing moves while paused, no lane overlaps, rejects stay on the chute. The TRANS-001…010 sweeps pass across four seeds, with a packaging jam and a robot fault plus recovery.
- **Interaction unchanged:** selection, deep links, Esc, Follow, focus and the camera behave as in U2.

## Behaviour new
- **Fit:** shows one compact factory, a 563 × ~330 world-unit cell instead of a 960-wide diagonal line. Every machine is over 90 px wide at 1440 × 900 (S01).
- **Bridge:** units cross a visible right-angle bridge (outfeed stub, cross belt, infeed stub, rounded corners) at **1.71× belt speed**. Robot outfeed slots and the QA infeed queue sit on the bridge too, so nothing teleports and the domain timings are untouched.
- **Part selection:** selecting a part (for example the gripper) highlights exactly that part's geometry, in the scene and in the inspector preview.
- **Zoomed in:** parts of the hovered machine answer the pointer (name tip), and a click selects machine and part together.

## Tests
- `npx vitest run`: 49/49.
  - Updated GEO-001: the connector list per row, the bridge from placement port to QA work point, one steady scale between 1 and 2, and continuity sampled at 400 steps per bridge section.
  - New LAY-001…005: row directions and order, end-to-end continuity including the U-turn, no shared floor space with an aisle between rows, Fit bounds containing all machines, lanes, the bridge and both flow marks, and a compact landscape cell.
  - The transport sweeps allow `BRIDGE_SCALE` only for units on the bridge, and check overlaps per row and along the bridge column.
- `npx playwright test smoke camera scene`: 18/18. New checks:
  - S01: the rows read correctly on screen.
  - S02: clicking moves the selection, and an empty click clears it.
  - S03: a selected part is filled on its own paths while the rest of the machine is white, and the hit hull stays invisible.

## Viewports
- `screenshots/v2/u3/` at 1600 / 1440 / 1280 / 1024 (fit, selected, component, inspector, faulted, zoomed).
- Close-ups of all six machines are in `screenshots/v2/u3/closeup-*.png`. I checked the mirrored QA, packaging and dispatch for paint-order errors at 260–330% and found none.

## Known issues
- Row 2 machines are mirror images rather than 180° turns. A true 180° turn would need back views redrawn for three figures, and the spec allows any compact, continuous, non-teleporting arrangement.
- The bridge runs 1.71× faster than the belts; this is noticeable if you follow a unit across the turn.
- At Fit, row 2's tall parts (packaging body) slightly cover row 1's near belt edge. That is correct occlusion, not an error.

## Next phase
U4: resizable inspector dock (320/380/440, drag and keys), a clickable preview, fixing the anchor nested inside a button in Parts, and one selection model shared by the scene, Assets and Events. Wheel over the inspector will scroll instead of zoom.
