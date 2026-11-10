import { expect, test, type Page } from '@playwright/test';

type Cam = { x: number; y: number; s: number };
const SHOTS = process.env.SHOTS;

async function open(page: Page, width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto('/production');
  await page.waitForSelector('svg.hl');
  await page.waitForFunction(() => Boolean((window as unknown as { lfCamera?: { safe: unknown } }).lfCamera?.safe));
}
const cam = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { lfCamera: { cam: Cam } }).lfCamera.cam }));
const ws = (page: Page) => page.evaluate(() => (window as unknown as { lfWorkspace: { state(): { station: string | null; inspectorOpen: boolean } } }).lfWorkspace.state());
const noPageScroll = (page: Page) =>
  page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight }));

test('A01 reduced motion: focus and fit jump immediately, no inertia', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const before = await cam(page);
  const r = await page.evaluate(() => {
    const w = window as unknown as { lfWorkspace: { focus(id: string): void }; lfCamera: { animating: boolean; cam: Cam } };
    w.lfWorkspace.focus('robot');
    return { animating: w.lfCamera.animating, cam: { ...w.lfCamera.cam } };
  });
  expect(r.animating).toBe(false);
  expect(r.cam.s).toBeGreaterThan(before.s * 1.2);
  const fit = await page.evaluate(() => {
    const w = window as unknown as { lfCamera: { fit(): void; animating: boolean } };
    w.lfCamera.fit();
    return w.lfCamera.animating;
  });
  expect(fit).toBe(false);
  // a fast drag released mid-motion must not glide afterwards
  const box = (await page.locator('.ws-canvas').boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + 300 + i * 40, box.y + 300, { steps: 1 });
  await page.mouse.up();
  const atRelease = await cam(page);
  await page.waitForTimeout(250);
  expect(await cam(page)).toEqual(atRelease);
});

test('A02 keyboard: machine navigator, [ ] cycling, inspector focus return', async ({ page }) => {
  await open(page);
  const nav = page.getByRole('navigation', { name: 'Machines' });
  await expect(nav.getByRole('button')).toHaveCount(6);
  // hidden until focused, then a real panel
  expect((await nav.boundingBox())!.width).toBeLessThanOrEqual(1);
  await nav.getByRole('button').first().focus();
  await expect(nav.getByRole('button').first()).toBeFocused();
  expect((await nav.boundingBox())!.width).toBeGreaterThan(200);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const robot = nav.getByRole('button', { name: /Robot/ });
  await expect(robot).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await ws(page)).station).toBe('robot');
  expect((await ws(page)).inspectorOpen).toBe(true);
  await expect(robot).toHaveAttribute('aria-current', 'true');
  // focus-visible ring on keyboard focus
  const outline = await robot.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
  // closing the inspector with its close button returns focus to the opener
  await page.locator('.insp-dock').getByRole('button', { name: /close/i }).first().click();
  await expect(page.locator('.insp-dock')).toHaveCount(0);
  await expect(robot).toBeFocused();

  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press(']');
  await expect.poll(async () => (await ws(page)).station).toBe('qa');
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await expect.poll(async () => (await ws(page)).station).toBe('assembly');
});

test('A03 pointer targets: camera, rail and speed controls are at least 40 px to the pointer', async ({ page }) => {
  await open(page);
  const hit = async (sel: string) =>
    page.locator(sel).first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      const a = getComputedStyle(el, '::after');
      const slop = a.content !== 'none' && a.position === 'absolute' ? -parseFloat(a.top || '0') : 0;
      return { w: r.width + (a.content !== 'none' ? Math.max(0, -parseFloat(a.left || '0')) * 2 : 0), h: r.height + slop * 2 };
    });
  for (const sel of ['.cam-tools .icon-btn', '.rail-btn', '.cmdbar .icon-btn']) {
    const r = await hit(sel);
    expect(r.w, sel).toBeGreaterThanOrEqual(40);
    expect(r.h, sel).toBeGreaterThanOrEqual(40);
  }
  const seg = await hit('.cmdbar .seg button');
  expect(seg.h).toBeGreaterThanOrEqual(40);
});

for (const [w, h, name] of [
  [1024, 768, 'tablet-landscape'],
  [768, 1024, 'tablet-portrait'],
  [390, 844, 'phone'],
] as const) {
  test(`A04 responsive ${w}×${h}: no page scroll, Simulation visible, inspector never hides the selection`, async ({ page }) => {
    await open(page, w, h);
    expect(await noPageScroll(page)).toEqual({ x: 0, y: 0 });
    await expect(page.locator('.sim-pill')).toBeVisible();
    await expect(page.locator('[data-test="play"]')).toBeVisible();
    await expect(page.locator('.cam-tools')).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `screenshots/v2/${SHOTS}/${name}-fit.png` });

    await page.evaluate(() => (window as unknown as { lfWorkspace: { openInspector(id: string): void } }).lfWorkspace.openInspector('qa'));
    await page.waitForSelector('.insp-dock');
    await page.waitForTimeout(80);
    await page.waitForFunction(() => !(window as unknown as { lfCamera: { animating: boolean } }).lfCamera.animating);
    expect(await noPageScroll(page)).toEqual({ x: 0, y: 0 });
    const dock = (await page.locator('.insp-dock').boundingBox())!;
    const machine = (await page.locator('[data-station="qa"]').first().boundingBox())!;
    const overlap = !(machine.x + machine.width <= dock.x || machine.x >= dock.x + dock.width || machine.y + machine.height <= dock.y || machine.y >= dock.y + dock.height);
    expect(overlap, 'selected machine hidden under the inspector').toBe(false);
    await expect(page.locator('.insp-dock').getByRole('tab').first()).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `screenshots/v2/${SHOTS}/${name}-inspector.png` });
  });
}
