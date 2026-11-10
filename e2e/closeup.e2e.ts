/*
 * Close-up stills of every machine at high zoom, for reviewing line work and occlusion.
 *   CLOSEUP=<folder> npx playwright test closeup
 */
import { test } from '@playwright/test';

const DIR = process.env.CLOSEUP;
const IDS = ['intake', 'assembly', 'robot', 'qa', 'packaging', 'dispatch'];

test('machine close-ups', async ({ page }) => {
  test.skip(!DIR, 'set CLOSEUP=<folder>');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/production');
  await page.waitForSelector('svg.hl');
  await page.evaluate(() => {
    const st = (window as unknown as { lfStore: { reset(o: unknown): void; fastForward(s: number): void } }).lfStore;
    st.reset({ seed: 842 });
    st.fastForward(20 * 60);
  });
  for (const id of IDS) {
    await page.evaluate((s) => {
      const w = window as unknown as { lfWorkspace: { focus(x: string): void; select(x: null): void }; lfCamera: { zoomBy(f: number): void } };
      w.lfWorkspace.focus(s);
      w.lfWorkspace.select(null);
    }, id);
    await page.waitForTimeout(700);
    await page.evaluate(() => (window as unknown as { lfCamera: { zoomBy(f: number): void } }).lfCamera.zoomBy(1.5));
    await page.waitForTimeout(400);
    await page.locator('.ws-canvas').screenshot({ path: `screenshots/v2/${DIR}/closeup-${id}.png` });
  }
});
