/*
 * Fixed-state screenshots for before/after review. Run with SHOTS=<folder name>, e.g.
 *   SHOTS=before npx playwright test capture
 * Every state starts from the same seeded run fast-forwarded 20 virtual minutes, then paused.
 */
import { test, type Page } from '@playwright/test';

const DIR = process.env.SHOTS;
const SIZES = [
  { width: 1600, height: 900 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
];

type Lf = { store: { fastForward(s: number): void; command(c: unknown): unknown; reset(o?: unknown): void; session: { seed: number } } };

async function seeded(page: Page, url = '/production') {
  await page.goto(url);
  await page.waitForSelector('svg.hl');
  await page.waitForFunction(() => (window as unknown as { lfStore?: unknown }).lfStore);
  await page.evaluate(() => {
    const st = (window as unknown as { lfStore: Lf['store'] }).lfStore;
    st.reset({ seed: 842 });
    st.fastForward(20 * 60);
  });
  await page.waitForTimeout(400);
}

async function v2(page: Page) {
  return page.evaluate(() => Boolean((window as unknown as { lfWorkspace?: unknown }).lfWorkspace));
}

async function ws(page: Page, fn: string, ...args: unknown[]) {
  await page.evaluate(([f, a]) => {
    const w = (window as unknown as { lfWorkspace: Record<string, (...x: unknown[]) => void> }).lfWorkspace;
    w[f as string](...(a as unknown[]));
  }, [fn, args] as const);
  await page.waitForTimeout(800);
}

test.describe('capture', () => {
  test.skip(!DIR, 'set SHOTS=<folder> to capture');
  for (const size of SIZES) {
    test(`states at ${size.width}x${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      const shot = (name: string) => page.screenshot({ path: `screenshots/v2/${DIR}/${size.width}-${name}.png` });
      await seeded(page);
      await shot('fit');
      const isV2 = await v2(page);

      if (isV2) await ws(page, 'select', 'robot');
      else await seeded(page, '/production?station=robot');
      await shot('selected');

      if (isV2) await ws(page, 'selectComponent', 'robot', 'ROB-GRIPPER-01');
      else {
        await seeded(page, '/production?station=robot&details=1');
        await page.getByRole('tab', { name: 'Components' }).click();
        await page.locator('.comp-row', { hasText: 'ROB-GRIPPER-01' }).click();
        await page.waitForTimeout(300);
      }
      await shot('component');

      if (isV2) await ws(page, 'openInspector', 'packaging');
      else await seeded(page, '/production?station=packaging&details=1');
      await shot('inspector');

      await page.evaluate(() => {
        const st = (window as unknown as { lfStore: Lf['store'] }).lfStore;
        st.command({ kind: 'INJECT_FAULT', code: 'PKG_JAM' });
        st.command({ kind: 'RESUME' });
      });
      await page.waitForTimeout(2500);
      await page.evaluate(() => (window as unknown as { lfStore: Lf['store'] }).lfStore.command({ kind: 'PAUSE' }));
      await page.waitForTimeout(300);
      await shot('faulted');

      if (isV2) await ws(page, 'focus', 'packaging');
      else {
        await seeded(page);
        for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom in' }).click();
        await page.waitForTimeout(400);
      }
      await shot('zoomed');
      if (!isV2) return;

      await ws(page, 'select', null);
      await ws(page, 'mode', 'diagnose');
      await page.keyboard.press('f');
      await page.waitForTimeout(600);
      await shot('diagnose');
      await ws(page, 'mode', 'operate');
      await shot('operate');
      await ws(page, 'mode', 'experiment');
      await page.locator('.mode-panel').getByRole('button', { name: /Capture baseline/ }).click();
      await page.evaluate(() => {
        const st = (window as unknown as { lfStore: Lf['store'] }).lfStore;
        st.command({ kind: 'INJECT_FAULT', code: 'ROB_VACUUM_LOSS' });
        st.fastForward(300);
      });
      await page.locator('.mode-panel').getByRole('button', { name: /Compare at/ }).click();
      await page.waitForTimeout(300);
      await shot('experiment');
      await ws(page, 'mode', 'explore');
      await ws(page, 'layer', 'capacity');
      await shot('layer-capacity');
      await ws(page, 'layer', 'energy');
      await shot('layer-energy');
    });
  }
});
