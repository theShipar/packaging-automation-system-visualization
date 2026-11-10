import { expect, test, type Page } from '@playwright/test';

type Cam = { s: number; tx: number; ty: number };
type Rect = { x: number; y: number; w: number; h: number };
type W = Record<string, (...a: string[]) => unknown>;

async function open(page: Page, url = '/production') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await page.waitForSelector('svg.hl');
  await page.waitForFunction(() => Boolean((window as unknown as { lfCamera?: { safe: unknown } }).lfCamera?.safe));
}

const cam = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { lfCamera: { cam: Cam } }).lfCamera.cam }));
const safe = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { lfCamera: { safe: Rect } }).lfCamera.safe }));
const settled = async (page: Page) => {
  await page.waitForTimeout(60);
  await page.waitForFunction(() => !(window as unknown as { lfCamera: { animating: boolean } }).lfCamera.animating);
};
const ws = (page: Page, fn: string, ...args: string[]) => page.evaluate(([f, a]) => ((window as unknown as { lfWorkspace: W }).lfWorkspace[f as string] as (...x: string[]) => unknown)(...(a as string[])), [fn, args] as const);
const run = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { lfStore: { session: { runId: string; t: number } } }).lfStore.session;
  return { runId: s.runId, t: s.t };
});

/** Screen rect of a locator relative to the canvas, checked against the camera's safe rect. */
async function insideSafe(page: Page, selector: string) {
  const c = (await page.locator('.ws-canvas').boundingBox())!;
  const b = (await page.locator(selector).first().boundingBox())!;
  const r = { x: b.x - c.x, y: b.y - c.y, w: b.width, h: b.height };
  const sr = await safe(page);
  expect(r.x, `${selector} left`).toBeGreaterThanOrEqual(sr.x - 1);
  expect(r.x + r.w, `${selector} right`).toBeLessThanOrEqual(sr.x + sr.w + 1);
  expect(r.y, `${selector} top`).toBeGreaterThanOrEqual(sr.y - 1);
  expect(r.y + r.h, `${selector} bottom`).toBeLessThanOrEqual(sr.y + sr.h + 1);
}

const GRIP = 'ROB-GRIPPER-01';

test('I01 clicking the robot opens its inspector and selects its geometry', async ({ page }) => {
  await open(page);
  const b = (await page.locator('path.hit[data-station="robot"]').boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page).toHaveURL(/station=robot/);
  await page.locator('.st-label.sel').click();
  await expect(page.locator('.insp-name')).toContainText(/robot/i);
  await expect(page.locator('.station.is-focus').first()).toBeAttached();
  await expect(page.locator('path.hit-comp[data-comp^="ROB-"]').first()).toBeAttached();
});

test('I02 Parts → Gripper highlights the same part in the scene and in the preview', async ({ page }) => {
  await open(page);
  await ws(page, 'openInspector', 'robot');
  await page.getByRole('tab', { name: 'Parts' }).click();
  await expect(page.locator('.comp-row a .comp-main, .comp-main a')).toHaveCount(0);
  await page.locator('.comp-main', { hasText: GRIP }).click();
  await expect(page).toHaveURL(new RegExp(`comp=${GRIP}`));
  await expect(page.locator('.station.part-sel path.part.sil').first()).toHaveCSS('fill', 'rgb(201, 220, 243)');
  await expect(page.locator('.insp-thumb path.part.sil').first()).toHaveCSS('fill', 'rgb(201, 220, 243)');
  const other = page.locator('.insp-thumb path.thumb-hit:not([data-comp="' + GRIP + '"])').last();
  const id = await other.getAttribute('data-comp');
  await other.click({ force: true });
  await expect(page).toHaveURL(new RegExp(`comp=${id}`));
  await expect(page.locator('.comp-row.on')).toContainText(id!);
});

test('I03 Activity lists only this machine, newest first, on the virtual clock', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as unknown as { lfStore: { fastForward(n: number): void } }).lfStore.fastForward(300));
  await ws(page, 'openInspector', 'robot');
  await page.getByRole('tab', { name: 'Activity' }).click();
  await page.getByLabel('Show cycle and material events').check();
  const rows = page.locator('.log-row');
  await expect(rows.first()).toBeVisible();
  const data = await rows.evaluateAll((els) => els.map((e) => ({ st: e.getAttribute('data-station'), t: Number(e.getAttribute('data-t')), txt: e.querySelector('time')!.textContent! })));
  const { t } = await run(page);
  expect(data.length).toBeGreaterThan(3);
  for (let i = 0; i < data.length; i++) {
    expect(data[i].st).toBe('robot');
    expect(data[i].txt).toMatch(/^\d{1,2}:\d{2}(:\d{2})?$/);
    expect(data[i].t).toBeLessThanOrEqual(t);
    if (i) expect(data[i].t).toBeLessThanOrEqual(data[i - 1].t);
  }
});

test('L04 resizing the dock 320↔440 keeps the machine framed and the run untouched', async ({ page }) => {
  await open(page);
  await ws(page, 'openInspector', 'packaging');
  await expect(page.locator('.insp-dock')).toBeVisible();
  await page.evaluate(() => (window as unknown as { lfStore: { fastForward(n: number): void } }).lfStore.fastForward(60));
  const before = await run(page);
  const handle = page.getByRole('separator', { name: 'Resize inspector' });
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + 200);
  await page.mouse.down();
  await page.mouse.move(h.x - 70, h.y + 200, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.insp-dock')).toHaveCSS('width', '440px');
  await settled(page);
  await insideSafe(page, 'path.hit[data-station="packaging"]');
  await handle.focus();
  await page.keyboard.press('Home');
  await expect(page.locator('.insp-dock')).toHaveCSS('width', '320px');
  await settled(page);
  await insideSafe(page, 'path.hit[data-station="packaging"]');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.insp-dock')).toHaveCSS('width', '380px');
  const after = await run(page);
  expect(after.runId).toBe(before.runId);
  expect(after.t).toBeGreaterThanOrEqual(before.t);
});

test('C07 a focused gripper stays visible while the inspector resizes', async ({ page }) => {
  await open(page);
  await ws(page, 'selectComponent', 'robot', GRIP);
  await ws(page, 'openInspector', 'robot');
  await settled(page);
  const sel = `path.hit-comp[data-comp="${GRIP}"]`;
  await insideSafe(page, sel);
  const handle = page.getByRole('separator', { name: 'Resize inspector' });
  await handle.focus();
  for (const k of ['End', 'Home', 'ArrowLeft', 'End']) {
    await page.keyboard.press(k);
    await settled(page);
    await insideSafe(page, sel);
  }
});

test('C15 the wheel over the inspector scrolls the panel and leaves the camera alone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await open(page);
  await page.setViewportSize({ width: 1440, height: 700 });
  await ws(page, 'openInspector', 'robot');
  await page.locator('details.more summary').click();
  await settled(page);
  const a = await cam(page);
  const body = page.locator('.insp-body');
  const bb = (await body.boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 120);
  await page.waitForTimeout(120);
  expect(await body.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  const b = await cam(page);
  expect(b).toEqual(a);
});

test('I07 clicking a part in Assets selects it on the line and focuses the camera', async ({ page }) => {
  await open(page);
  await ws(page, 'openTool', 'assets');
  await page.locator('.asset-row', { hasText: GRIP }).click();
  await expect(page).toHaveURL(new RegExp(`station=robot.*comp=${GRIP}`));
  await expect(page).toHaveURL(new RegExp(`item=${GRIP}`));
  await settled(page);
  await insideSafe(page, `path.hit-comp[data-comp="${GRIP}"]`);
  await page.evaluate(() => (window as unknown as { lfWorkspace: W }).lfWorkspace.selectComponent('robot', 'ROB-VACUUM-01'));
  await expect(page).toHaveURL(/item=ROB-VACUUM-01/);
});

test('I09 reopening the inspector keeps the selection and the last tab', async ({ page }) => {
  await open(page);
  await ws(page, 'openInspector', 'qa');
  await page.getByRole('tab', { name: 'Activity' }).click();
  await page.locator('.insp-dock [aria-label^="Close"]').click();
  await expect(page.locator('.insp-dock')).toHaveCount(0);
  await expect(page).toHaveURL(/station=qa/);
  await page.locator('.st-label.sel').click();
  await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
});
