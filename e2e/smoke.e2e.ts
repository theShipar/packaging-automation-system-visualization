import { expect, test, type Page } from '@playwright/test';

const SIZES = [
  { width: 1600, height: 900 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
];

async function open(page: Page) {
  await page.goto('/production');
  await page.waitForSelector('svg.hl');
}

for (const size of SIZES) {
  test(`L01/L02 no page scroll at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page);
    const m = await page.evaluate(() => ({ sh: document.scrollingElement!.scrollHeight, sw: document.scrollingElement!.scrollWidth, h: innerHeight, w: innerWidth }));
    expect(m.sh, 'document height').toBeLessThanOrEqual(m.h + 1);
    expect(m.sw, 'document width').toBeLessThanOrEqual(m.w + 1);
  });

  test(`L09 essential controls visible at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page);
    for (const sel of ['[data-test="play"]', '[data-test="clock"]', '[data-test="speed"]', '[data-test="batch"]']) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box, sel).not.toBeNull();
      expect(box!.x + box!.width, sel).toBeLessThanOrEqual(size.width + 0.5);
      expect(box!.y + box!.height, sel).toBeLessThanOrEqual(size.height + 0.5);
    }
  });
}

test('P09 no uncaught errors while running, selecting and pausing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await open(page);
  await page.locator('[data-test="play"]').click();
  await page.waitForTimeout(1500);
  await page.locator('[data-station="robot"]').first().click({ force: true });
  await page.waitForTimeout(800);
  await page.locator('[data-test="play"]').click();
  expect(errors).toEqual([]);
});
