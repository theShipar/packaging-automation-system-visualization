import { expect, test, type Page } from '@playwright/test';

type Cam = { s: number; tx: number; ty: number };
type Rect = { x: number; y: number; w: number; h: number };

async function open(page: Page, url = '/production') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await page.waitForSelector('svg.hl');
  await page.waitForFunction(() => Boolean((window as unknown as { lfCamera?: { safe: unknown } }).lfCamera?.safe));
}

const cam = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { lfCamera: { cam: Cam } }).lfCamera.cam }));
const safe = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { lfCamera: { safe: Rect } }).lfCamera.safe }));
const settled = (page: Page) => page.waitForFunction(() => !(window as unknown as { lfCamera: { animating: boolean } }).lfCamera.animating);
const canvasBox = async (page: Page) => (await page.locator('.ws-canvas').boundingBox())!;

/** Screen bounds of a station's silhouette, in canvas coordinates. */
async function stationRect(page: Page, id: string) {
  const c = await canvasBox(page);
  const b = (await page.locator(`path.hit[data-station="${id}"]`).first().boundingBox())!;
  return { x: b.x - c.x, y: b.y - c.y, w: b.width, h: b.height };
}

test('C03 wheel zoom keeps the point under the cursor (≤1px)', async ({ page }) => {
  await open(page);
  const c = await canvasBox(page);
  for (const [fx, fy] of [[0.5, 0.5], [0.9, 0.8], [0.12, 0.2]]) {
    const px = c.width * fx, py = c.height * fy;
    await page.keyboard.press('f');
    await settled(page);
    const a = await cam(page);
    const world = [(px - a.tx) / a.s, (py - a.ty) / a.s];
    await page.mouse.move(c.x + px, c.y + py);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -120);
    await page.waitForTimeout(50);
    const b = await cam(page);
    expect(b.s).toBeGreaterThan(a.s);
    const sx = world[0] * b.s + b.tx, sy = world[1] * b.s + b.ty;
    expect(Math.hypot(sx - px, sy - py)).toBeLessThanOrEqual(1);
  }
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
});

test('C04/C05 drag pans without selecting; a click under 5px still selects', async ({ page }) => {
  await open(page);
  const r = await stationRect(page, 'robot');
  const c = await canvasBox(page);
  const sx = c.x + r.x + r.w / 2, sy = c.y + r.y + r.h / 2;
  const before = await cam(page);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 40, sy + 10, { steps: 6 });
  await page.mouse.move(sx + 120, sy + 30, { steps: 6 });
  await page.mouse.up();
  const after = await cam(page);
  expect(after.tx - before.tx).toBeCloseTo(120, 0);
  expect(after.ty - before.ty).toBeCloseTo(30, 0);
  await expect(page).not.toHaveURL(/station=/);

  const r2 = await stationRect(page, 'robot');
  const x = c.x + r2.x + r2.w / 2, y = c.y + r2.y + r2.h / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 3, y + 2);
  await page.mouse.up();
  await expect(page).toHaveURL(/station=robot/);
});

test('C07 F and the Fit button frame the whole line; zoom % reads 100%', async ({ page }) => {
  await open(page);
  const c = await canvasBox(page);
  await page.mouse.move(c.x + 300, c.y + 300);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -120);
  await expect(page.locator('.zoom-pct')).not.toHaveText('100%');
  await page.keyboard.press('f');
  await settled(page);
  await expect(page.locator('.zoom-pct')).toHaveText('100%');
  await page.locator('[aria-label="Zoom in"]').click();
  await settled(page);
  await expect(page.locator('.zoom-pct')).toHaveText('125%');
  await page.locator('[aria-label="Fit whole line"]').click();
  await settled(page);
  await expect(page.locator('.zoom-pct')).toHaveText('100%');
});

test('C06 focus frames a machine inside the safe rect; opening the inspector keeps it there', async ({ page }) => {
  await open(page);
  for (const id of ['intake', 'robot', 'dispatch']) {
    await page.evaluate((s) => (window as unknown as { lfWorkspace: { focus: (x: string) => void } }).lfWorkspace.focus(s), id);
    await settled(page);
    const r = await stationRect(page, id);
    const sr = await safe(page);
    expect(r.x).toBeGreaterThanOrEqual(sr.x);
    expect(r.x + r.w).toBeLessThanOrEqual(sr.x + sr.w);
    expect(r.y).toBeGreaterThanOrEqual(sr.y);
    expect(r.y + r.h).toBeLessThanOrEqual(sr.y + sr.h);
  }
  await page.locator('.st-label.sel').click();
  await expect(page.locator('.insp-dock')).toBeVisible();
  await page.waitForTimeout(80);
  await settled(page);
  const r = await stationRect(page, 'dispatch');
  const sr = await safe(page);
  expect(r.x + r.w).toBeLessThanOrEqual(sr.x + sr.w + 1);
  expect(r.x).toBeGreaterThanOrEqual(sr.x - 1);
});

test('C08 Esc does not reset the camera; selection clears first', async ({ page }) => {
  await open(page, '/production?station=qa');
  await page.evaluate(() => (window as unknown as { lfWorkspace: { focus: (x: string) => void } }).lfWorkspace.focus('qa'));
  await settled(page);
  const a = await cam(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await settled(page);
  await expect(page).not.toHaveURL(/station=/);
  const b = await cam(page);
  expect(Math.abs(b.s - a.s) / a.s).toBeLessThan(0.02);
});
