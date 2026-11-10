# U2 — Spatial camera

## Files changed
- New `src/camera/camera.ts`: pure camera math (screen = s·world + t). It covers cursor-anchored zoom, Fit, Focus, reframe, ensureVisible, the dead-zone used by Follow, log-space interpolation, and wheel/pinch scaling.
- New `src/camera/controller.ts`: the single camera, with modes overview, free, focus-station, focus-component and follow-unit.
  - It animates on the store's RAF loop through a *quiet* stepper, so camera motion never re-renders the factory or the UI.
  - A new command retargets the current animation from where it is.
- New `src/camera/commands.ts`: `focusStation`, `focusComponent` and `focusSelection`. A selection change reveals the selection (smallest pan that brings it into view).
- New `src/camera/useCameraInput.ts`: pointer, pinch, wheel and space input.
  - A press becomes a pan after 5 px and takes pointer capture.
  - Space or the middle button pans straight away.
  - The wheel listener is non-passive and zooms at the cursor; mostly horizontal deltas pan instead.
  - Clicks are suppressed after a drag.
- `src/vector/Scene.tsx`, rewritten:
  - A full-size SVG with one world `<g>` whose transform is written by ref.
  - Double-clicking a machine or part focuses it.
  - Follow drives the camera. The old `useFollowCamera`, scene zoom buttons, StationLabel and FocusCard are removed.
- `src/vector/SceneOverlay.tsx`: station tags, flow marks, queue badges and the part tip are HTML projected every camera frame at CSS-pixel size.
  - Level of detail (LOD) is based on zoom: far, mid, near.
  - Tags show full detail when selected, hovered, alerting or near. Collisions collapse into `+N`, and tags are clamped to the safe rect.
- `src/vector/sceneModel.ts`: exports `CONTENT_BOUNDS`, plus `bounds` and `compBounds` per station.
- `src/app/store.ts`: `addStepper(fn, { quiet })`.
- `src/workspace/CanvasRegion.tsx`:
  - A ResizeObserver sets the safe rect: 20 px side inset, 56 px top reserve, and a bottom reserve measured from the bottom chrome.
  - New `CameraControls`: zoom −, zoom % (click to Fit), zoom +, Fit, Focus selection (disabled with a reason), and a Follow toggle.
- `src/workspace/AppShell.tsx`: keys F, ⌘/Ctrl+0, + and −. `lfWorkspace.focus` now focuses for real, and DEV builds expose `lfCamera`.
- `src/workspace/links.tsx`, `TopCommandBar.tsx` (alerts) and `CanvasRegion.tsx` (critical notice): station and part links now also focus the camera.
- `src/workspace/ShortcutsDialog.tsx`: lists the camera shortcuts.
- `src/styles.css`:
  - Removed the aspect-box scene (`.scene-inner`, `.scene-aspect`, `.scene-tools`).
  - Added `.scene-ov`, projected tags, `.cam-tools`, and the flex bottom chrome.
  - Added panning cursors and container rules for the rail.
- Tests: new `tests/camera.test.ts` and `e2e/camera.e2e.ts`.

## Behaviour preserved
- Simulation, domain and transport are unchanged. BASE-002 confirms that reading every UI selector each frame doesn't change the run.
- Selection, the inspector, deep links, the Esc ladder and drawers all behave as in U1.
- Follow still starts from a serial, the inspector or a product click, and ends on manual pan with a toast.

## Behaviour new
- **Camera range:** Fit pads the content to 90% of the safe rect. Zoom runs from 25% to 350% *of Fit* (100% = the whole line fits).
- **Focus:** the box fills 62% of the safe height with a 24 px margin, so machines of different sizes get different scales.
- **Panel resize:** opening or resizing the dock or drawer reframes. The world point at the old safe centre moves to the new centre, scale is clamped to the new limits, then the selection is kept visible (240 ms).
- **Untouched Overview:** if you haven't moved the camera, the view re-fits on resize.
- **Cancelling:** wheel, drag or pinch cancels any camera animation immediately. Pan cancels Follow; zoom keeps it.
- **Reduced motion:** camera moves become instant.

## Tests
- `npx tsc --noEmit`: clean.
- `npx vitest run`: 44/44. The new camera tests are:
  - C01/C02: Fit containment at 90% across five canvas sizes.
  - C03: zoomAt drift ≤ 1 px at the centre and corners.
  - Zoom clamp at 25% and 350%.
  - C06: all six stations inside the safe rect with a 24 px margin, for docks of 0, 320, 380 and 440 px at three viewports.
  - C12: exact interpolation end states, log-space midpoint, continuous retarget.
  - Reframe keeps the centre anchor; ensureVisible.
- `npx playwright test smoke camera`: 15/15. New browser checks:
  - C03: wheel anchoring ≤ 1 px, with no page scroll.
  - C04/C05: a drag pans 120×30 px without selecting; a 3 px press still selects.
  - C07: F and Fit read 100%, and + reads 125%.
  - C06: focused stations sit inside the measured safe rect, and stay there when the inspector opens.
  - C08: Esc clears selection without resetting the camera.

## Viewports
- Captured at 1600×900, 1440×900, 1280×800 and 1024×768 in `screenshots/v2/u2/` (fit, selected, component, inspector, faulted, zoomed).
- At 1024 px with the inspector open, the rail drops WIP, Remaining and ETA so it sits beside the camera tools.

## Known issues
- Highlighting a part still tints the whole machine; the part-path highlight comes in U3. The scene is still a single row; the two-row layout comes in U3.
- When the canvas is narrow (inspector at 440 px on 1440), the 350% cap binds before the 62% fill, so all machines get the same focus scale. They still fit inside the safe rect.
- Smoothness has not been measured in frames per second yet; profiling is U6.

## Next phase
U3: two-row mirrored layout with the robot→QA bridge, generic lane segments, blue selection on real part geometry, and layout tests.
