### Phase U0 result
- Files changed: `.gitignore`, `package.json` (+`@playwright/test`), `playwright.config.ts`, `tests/baseline.test.ts` (+ snapshot), `e2e/smoke.e2e.ts`, `e2e/capture.e2e.ts`, `notes/*`. Test hooks only (no visual change): `data-test` on play / clock / speed / batch, `data-station` on station hit paths.
- Behavior preserved: everything; no visual or domain change. Baseline commit `0fb192b` is the revert point.
- Behavior newly implemented: golden baseline (BASE-001, six 15-minute samples of B-0842) and UI-read purity check (BASE-002); Playwright smoke checks using system Chrome on port 5181.
- Tests run + result: vitest 37/37 pass. Playwright: L09 ×3 pass, P09 pass, capture pass; L01/L02 ×3 FAIL at baseline as expected (document 1380px tall at 1600×900 / 1440×900, 1747px at 1280×800).
- Viewports visually checked: 1600×900, 1440×900, 1280×800, 1024×768 — six states each in `screenshots/v2/before/`.
- Known issues: the 2.0 kit's HTML prototype and reference PNGs are not available; work proceeds from the Markdown spec.
- Next phase: U1 fullscreen shell.
