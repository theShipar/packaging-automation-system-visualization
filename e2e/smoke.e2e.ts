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

test('L04 tool drawer docks beside the canvas and scrolls internally', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  const before = (await page.locator('.ws-canvas').boundingBox())!;
  await page.getByRole('button', { name: 'Events' }).click();
  const drawer = page.locator('.tool-drawer');
  await expect(drawer).toBeVisible();
  const after = (await page.locator('.ws-canvas').boundingBox())!;
  expect(after.width).toBeLessThan(before.width - 300);
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= innerHeight + 1)).toBe(true);
  await expect(page).toHaveURL(/tool=events/);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
});

test('L05 legacy routes open the matching drawer item', async ({ page }) => {
  await page.goto('/assets/ROB-BASE-01');
  await expect(page).toHaveURL(/\/production\?.*tool=assets.*item=ROB-BASE-01/);
  await expect(page.locator('.tool-drawer')).toContainText('ROB-BASE-01');
  await page.goto('/production/batches/B-0842');
  await expect(page.locator('.tool-drawer')).toContainText('B-0842');
});

test('L06 selection deep link opens the inspector; Esc steps back', async ({ page }) => {
  await page.goto('/production?station=qa');
  await page.waitForSelector('svg.hl');
  await expect(page.locator('.insp-dock')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.insp-dock')).toHaveCount(0);
  await expect(page).not.toHaveURL(/station=/);
});
