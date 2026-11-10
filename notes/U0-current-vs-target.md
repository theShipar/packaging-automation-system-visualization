# U0 — Current vs target

Evidence: `screenshots/v2/before/{1600,1440,1280,1024}-{fit,selected,component,inspector,faulted,zoomed}.png`, captured with `SHOTS=before npx playwright test capture` from seed 842 fast-forwarded 20 virtual minutes.

## Anti-patterns in the current UI (forbidden by spec 02/05/09/10)

1. 64px "Packaging Line" display title competing with controls (spec 10 forbidden list, A01).
2. Six `MachineCard` previews under the canvas (`.mstrip`) duplicating station navigation (L08, spec 02 "avoid").
3. Insights row below the canvas, including a large orange "Line rhythm" panel (spec 09: no permanent orange rhythm panel).
4. Selected machine painted solid orange (`.is-focus .mach`) hiding its shape (V03, spec 05 "never").
5. Floating `FocusCard` popover over the machine; it scales with zoom and can clip at canvas edges (spec 05/06).
6. Body scroll: document 1380px tall at 1600×900 and 1440×900, 1747px at 1280×800 (L01/L02 fail).
7. Camera: zoom clamped 1–3×, wheel zoom only with ⌘/Ctrl, no pan at 1×, Fit = reset, no awareness of panels (C01/C02/C06 not met).
8. Fixed-aspect scene box with a max height; the canvas is a card inside the page, not the workspace.
9. Inspector is a fixed overlay drawer covering the right part of the scene; camera does not reframe (L04, C07).
10. Long single diagonal line with a large empty upper-left/lower-right (spec 04).
11. Orange used for selection, active nav, focus rings, primary buttons and data bars (spec 05 colour language).
12. Glassmorphism on rail, chips, cards, drawer (spec 10 forbidden list).
13. Rail items navigate away from the canvas to full pages (spec 02: drawers in the workspace).

## Before → after

| Before | After | Validation |
|---|---|---|
| Page scroll to reach KPIs | 100dvh shell, compact status rail on the canvas | L01/L02 e2e at 1600/1440/1280 |
| One long diagonal | Two-row continuous cell with robot→QA bridge | Fit screenshot, layout tests |
| Six cards below scene | One scene + keyboard station navigator | L08 |
| Solid orange selection | Blue-grey plate tint + contour on real paths | V02/V03/V04 screenshots |
| Overlay drawer covering scene | Docked resizable inspector, camera safe-rect reframe | L04, C07 |
| Popover clipped by zoom | Projected overlay portal, clamped, ≤2 metrics | C14 |
| Route change per tool | In-workspace drawer, run continues | L05 |
| Cmd+wheel zoom 1–3× | Cursor-anchored wheel/pinch 0.25–3.5×, drag pan | C03/C04/C05 numeric tests |
