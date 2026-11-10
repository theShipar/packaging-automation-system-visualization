# U4 — Inspector dock and one selection model

## Files changed
- `src/workspace/InspectorDock.tsx`: left-edge resize separator (`role="separator"`, aria values).
  - Dragging is continuous between 320 and 440 px and snaps to the nearest preset (320 / 380 / 440) on release.
  - ArrowLeft widens and ArrowRight narrows by one preset; Home and End jump to the limits; double-click cycles through the presets.
  - Width changes go through the existing ResizeObserver, so the camera's safe rect follows.
- `src/workspace/workspaceStore.ts`: added `INSPECTOR_PRESETS` and `snapWidth`. `selectComponent` now also moves an open asset page to the selected part, so there is one selection everywhere.
- `src/features/Inspector.tsx`:
  - The header preview is clickable per part, and toggles the part selection.
  - Overview now scans in one pass:
    - fault cards and the blocked/starved banners;
    - the In-the-machine card with Follow;
    - one two-cell buffers line (input / output, tinted when full);
    - materials, only when low;
    - time in state.
  - Completed count, energy (labelled simulated), station-specific detail, other materials and recent incidents move into a collapsed **More detail** disclosure. The three headline metrics stay in the header.
  - Parts: each row is now a `div` holding one toggle button. The expanded detail, **Focus on line** and **Asset page →** sit outside the button, which fixes the anchor nested inside a button. Parts without drawing geometry render disabled ("not drawn"); none exist today, but the guard stays. The selected row scrolls into view.
  - Activity rows carry `data-station` / `data-t` hooks for tests.
- `src/vector/StationThumb.tsx`: optional `onPart` prop.
  - Adds invisible convex-hull hit paths per part, largest first so small parts stay on top.
  - Hovering a hit path highlights the part in the preview; each path has an accessible name and a tooltip.
- `src/workspace/links.tsx`: new `AssetLink`, which opens the asset page, selects the same station and part on the canvas, and focuses the camera on the part.
- `src/pages/Assets.tsx`: part rows use `AssetLink` and show the current selection. Station titles are `StationLink`s.
- `src/pages/Events.tsx`: the station cell is a `StationLink`. For fault events it also selects the named part, read from the component ID in the message.
- `src/styles.css`: styles for `.comp-list`, `.comp-main`, `.comp-more`, `.buf-line`, `details.more`, `.thumb-hit`, `.asset-row.on` and `.plain-link`.
- `e2e/inspector.e2e.ts`: new.

## Behaviour preserved
- Domain is untouched; the simulation clock and run ID are unaffected by any inspector interaction (L04 checks both).
- Four tabs, the fault footer, the Settings flow, the Esc ladder (popover/modal → part → machine → follow → drawer) and deep links are unchanged.
- Wheel zoom is bound to the scene element only, so the dock never zoomed. C15 now locks that in.

## Behaviour new
- Dock resize with presets and keyboard control. The camera keeps the selected machine or part inside the safe rect at every width.
- Click a part in the preview, the Parts list, the canvas, an Assets row or an Events row: the same `workspace` selection updates every view, and the camera reveals or focuses it.
- An Overview you can scan in one pass; the detail is still one click away.

## Tests
- `npx tsc --noEmit`: clean.
- `npx vitest run`: 49/49.
- `npx playwright test smoke camera scene inspector`: 26/26. New checks:
  - I01: clicking the robot gives the robot inspector, the scene focus and part hit areas.
  - I02: Parts → Gripper fills the gripper in the scene and in the preview. Clicking another part in the preview moves the selection, and the list follows. No anchor sits inside a button.
  - I03: Activity rows belong only to the robot, newest first, with valid virtual times no later than the clock.
  - L04: drag to 440, Home to 320, ArrowLeft to 380. Packaging stays inside the safe rect; the run ID is unchanged and time doesn't go backwards.
  - C07: the focused gripper stays inside the safe rect through End, Home, ArrowLeft and End.
  - C15: wheeling over the inspector scrolls its body; the camera is bit-identical.
  - I07: clicking an Assets part row gives station, part and asset item in the URL, with the part focused. A later scene part selection moves the asset page.
  - I09: closing and reopening keeps the selection and the last tab.

## Viewports
- `screenshots/v2/u4/` at 1600 / 1440 / 1280 / 1024 (fit, selected, component, inspector, faulted, zoomed).

## Known issues
- The robot preview frames the whole rail, so small parts (gripper) are small in the 320 × 190 preview; they are still hit-testable and highlighted.
- Events rows link the station cell rather than the whole row, so text selection and copying in the table keep working.
- I04–I06 and I08 (settings, faults, batch switching) are covered by existing domain tests; their UI checks come with U5's operation flows.

## Next phase
U5: Explore / Operate / Diagnose / Experiment as behaviour filters in the bottom-left slot. Layers: Flow, Capacity, Health, Quality, and Energy (simulated). Operate gets a +15 min step; Experiment gets a baseline compare via headless replay. Reset view, Restore scenario and Restart run become separate actions with confirmations.
