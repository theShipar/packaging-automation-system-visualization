import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function open(page: Page, url = '/production') {
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem('lf.tourPromptSeen', 'true'));
  await page.goto(url);
  await page.waitForSelector('svg.hl');
  await page.waitForFunction(() => Boolean((window as unknown as { lfCamera?: { safe: unknown } }).lfCamera?.safe));
}
const ws = (page: Page) => page.evaluate(() => (window as unknown as { lfWorkspace: { state(): { station: string | null; tool: string | null; inspectorOpen: boolean } } }).lfWorkspace.state());
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Sections' });
const dockTop = async (page: Page) => (await page.locator('.m-dock').boundingBox())!.y;
/** Sheets slide in; read their boxes once they rest. */
const settle = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
const noPageScroll = (page: Page) => page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight }));

async function drag(page: Page, sel: string, dy: number) {
  const b = (await page.locator(sel).boundingBox())!;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x, y + (dy * i) / 8);
  await page.mouse.up();
  await page.waitForTimeout(320);
}

test('M01 phone: a two-tier dock replaces the rail; essentials visible; no page scroll', async ({ page }) => {
  await open(page);
  await expect(page.locator('.rail')).toBeHidden();
  await expect(tabs(page)).toBeVisible();
  for (const name of ['Line', 'Machines', 'Events', 'Analytics', 'More']) await expect(tabs(page).getByRole('button', { name, exact: true })).toBeVisible();
  await expect(tabs(page).getByRole('button', { name: 'Line' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.sim-pill')).toBeVisible();
  await expect(page.locator('[data-test="play"]')).toContainText('Start');
  await expect(page.locator('.cam-tools')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeHidden();
  expect(await noPageScroll(page)).toEqual({ x: 0, y: 0 });
  const dock = (await page.locator('.m-dock').boundingBox())!;
  expect(dock.y + dock.height).toBeCloseTo(844, 0);
  const modes = page.locator('.m-dock').getByRole('radiogroup', { name: 'Mode' });
  for (const name of ['Explore', 'Operate', 'Diagnose', 'Experiment']) await expect(modes.getByRole('radio', { name })).toBeVisible();
  for (const b of await modes.getByRole('radio').all()) expect(await b.evaluate((e) => e.scrollWidth <= e.clientWidth), 'mode label fits').toBe(true);
  await expect(page.locator('.ob-left')).toBeHidden();
  const controls = (await page.locator('.ov-bottom').boundingBox())!;
  expect(controls.y + controls.height).toBeLessThanOrEqual(dock.y);
});

test('M02 Machines lists every station; a tap selects it and opens the inspector sheet', async ({ page }) => {
  await open(page);
  await tabs(page).getByRole('button', { name: 'Machines' }).click();
  const sheet = page.getByRole('dialog', { name: 'Machines' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.m-row')).toHaveCount(6);
  await sheet.getByRole('button', { name: /Quality Check/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator('.insp-dock')).toBeVisible();
  expect((await ws(page)).station).toBe('qa');
  await settle(page);
  const dock = (await page.locator('.insp-dock').boundingBox())!;
  await expect(page.locator('.m-modes'), 'mode tier folds away while a sheet is up').toHaveCount(0);
  expect(dock.y + dock.height).toBeLessThanOrEqual((await dockTop(page)) + 1);
  await page.waitForFunction(() => !(window as unknown as { lfCamera: { animating: boolean } }).lfCamera.animating);
  const m = (await page.locator('[data-station="qa"]').first().boundingBox())!;
  expect(m.y + m.height, 'selected machine stays above the sheet').toBeLessThanOrEqual(dock.y);
});

test('M03 sheets drag: up expands, down shrinks, down again closes; a tap toggles', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as unknown as { lfWorkspace: { openInspector(id: string): void } }).lfWorkspace.openInspector('robot'));
  const dock = page.locator('.insp-dock');
  await expect(dock).toHaveAttribute('data-sheet-size', 'half');
  await settle(page);
  const half = (await dock.boundingBox())!.height;
  await drag(page, '.insp-dock .sheet-grab', -220);
  await expect(dock).toHaveAttribute('data-sheet-size', 'full');
  expect((await dock.boundingBox())!.height).toBeGreaterThan(half + 100);
  await expect(page.locator('.cmdbar')).toBeInViewport();
  await drag(page, '.insp-dock .sheet-grab', 200);
  await expect(dock).toHaveAttribute('data-sheet-size', 'half');
  await page.locator('.insp-dock .sheet-grab').click();
  await expect(dock).toHaveAttribute('data-sheet-size', 'full');
  await page.locator('.insp-dock .sheet-grab').click();
  await expect(dock).toHaveAttribute('data-sheet-size', 'half');
  await drag(page, '.insp-dock .sheet-grab', 220);
  await expect(dock).toHaveCount(0);
  expect((await ws(page)).inspectorOpen).toBe(false);
});

test('M04 Events tab opens the log above the tab bar; fields are 16 px so iOS does not zoom', async ({ page }) => {
  await open(page);
  await tabs(page).getByRole('button', { name: 'Events' }).click();
  const drawer = page.locator('.tool-drawer');
  await expect(drawer).toBeVisible();
  await expect(tabs(page).getByRole('button', { name: 'Events' })).toHaveAttribute('aria-current', 'page');
  await settle(page);
  const d = (await drawer.boundingBox())!;
  expect(d.y + d.height).toBeLessThanOrEqual((await dockTop(page)) + 1);
  const sizes = await drawer.locator('input:not([type="checkbox"]), select').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
  await tabs(page).getByRole('button', { name: 'Line' }).click();
  await expect(drawer).toHaveCount(0);
});

test('M05 More holds the remaining tools and the guided demo', async ({ page }) => {
  await open(page);
  await tabs(page).getByRole('button', { name: 'More', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'More' });
  await expect(sheet).toBeVisible();
  for (const t of ['Batches', 'Scenario lab', 'Assets', 'Quality', 'Maintenance', 'Reports', 'Settings', 'Guided demo']) await expect(sheet.getByRole('button', { name: new RegExp(`^${t}`) })).toBeVisible();
  await sheet.getByRole('button', { name: /^Settings/ }).click();
  await expect(sheet).toBeHidden();
  expect((await ws(page)).tool).toBe('settings');
  await expect(tabs(page).getByRole('button', { name: 'More', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('M06 touch targets: tab bar, top bar and camera buttons are at least 44 / 40 px', async ({ page }) => {
  await open(page);
  for (const b of await tabs(page).getByRole('button').all()) {
    const r = (await b.boundingBox())!;
    expect(r.height).toBeGreaterThanOrEqual(44);
    expect(r.width).toBeGreaterThanOrEqual(60);
  }
  for (const sel of ['.cmdbar .icon-btn:visible', '.cam-tools .icon-btn:visible', '[data-test="play"]']) {
    for (const b of await page.locator(sel).all()) {
      const r = (await b.boundingBox())!;
      expect(r.height, sel).toBeGreaterThanOrEqual(40);
    }
  }
});

test('M07 Run menu drops desktop-only items on a phone and fits the screen', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Run menu' }).click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: /Restart run/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Keyboard shortcuts/ })).toBeHidden();
  await expect(menu.getByRole('menuitem', { name: /Presentation mode/ })).toBeHidden();
  const r = (await menu.boundingBox())!;
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(390);
});

test('M08 phone landscape keeps the top bar readable', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await open(page);
  expect(await noPageScroll(page)).toEqual({ x: 0, y: 0 });
  const boxes = await page.locator('.cmdbar').evaluate((bar) =>
    [...bar.querySelectorAll<HTMLElement>('.sim-pill, .state-pill, .clock, [data-test="play"], .icon-btn')]
      .filter((e) => e.offsetParent !== null)
      .map((e) => e.getBoundingClientRect())
      .map((r) => [r.left, r.right] as const),
  );
  const sorted = [...boxes].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < sorted.length; i++) expect(sorted[i][0], 'top bar items overlap').toBeGreaterThanOrEqual(sorted[i - 1][1] - 1);
});

test('M09 desktop keeps the rail and has no tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await expect(page.locator('.rail')).toBeVisible();
  await expect(tabs(page)).toBeHidden();
});

test('M10 dock mode tier switches modes, picks a layer and offers restore', async ({ page }) => {
  await open(page);
  const tier = page.locator('.m-modes');
  await tier.getByRole('radio', { name: 'Operate' }).click();
  await expect(tier.getByRole('radio', { name: 'Operate' })).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => (window as unknown as { lfWorkspace: { state(): { mode: string } } }).lfWorkspace.state().mode)).toBe('operate');
  await tier.getByRole('radio', { name: 'Explore' }).click();
  await tier.getByRole('button', { name: /Data layer/ }).click();
  const pop = page.getByRole('dialog', { name: 'Data layer' });
  await expect(pop).toBeVisible();
  const r = (await pop.boundingBox())!;
  expect(r.x).toBeGreaterThanOrEqual(0);
  expect(r.x + r.width).toBeLessThanOrEqual(390);
  expect(r.y + r.height).toBeLessThanOrEqual(await dockTop(page));
  await pop.getByRole('radio', { name: /^Capacity/ }).click();
  expect(await page.evaluate(() => (window as unknown as { lfWorkspace: { state(): { layer: string } } }).lfWorkspace.state().layer)).toBe('capacity');
  await tier.getByRole('button', { name: 'Restore scenario' }).click();
  await expect(page.getByRole('dialog', { name: /Restore/ })).toBeVisible();
});

test('M11 camera tools stack on the right; status sits right-aligned under them', async ({ page }) => {
  await open(page);
  const cam = (await page.locator('.cam-tools').boundingBox())!;
  expect(cam.height, 'vertical stack').toBeGreaterThan(cam.width * 2);
  expect(390 - (cam.x + cam.width)).toBeLessThanOrEqual(12);
  const rail = (await page.locator('.ov-bottom .sr-main').boundingBox())!;
  expect(Math.abs(rail.x + rail.width - (cam.x + cam.width))).toBeLessThanOrEqual(2);
  expect(cam.y + cam.height).toBeLessThanOrEqual(rail.y);
});

test('M12 creator mark top-right opens portfolio links; the run menu shows a gear', async ({ page }) => {
  await open(page);
  const btn = page.getByRole('button', { name: 'About the creator' });
  const b = (await btn.boundingBox())!;
  expect(390 - (b.x + b.width)).toBeLessThanOrEqual(14);
  expect(b.y).toBeLessThan(60);
  await btn.click();
  const card = page.getByRole('dialog', { name: 'About the creator' });
  await expect(card.getByRole('link', { name: /Visit portfolio/ })).toHaveAttribute('href', 'https://shipar.vercel.app/');
  await expect(card.getByRole('link', { name: /Other work/ })).toHaveAttribute('href', 'https://github.com/theShipar');
  const c = (await card.boundingBox())!;
  expect(c.x).toBeGreaterThanOrEqual(0);
  expect(c.x + c.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button', { name: 'Run menu' }).locator('.ico-phone svg')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run menu' }).locator('.ico-wide svg')).toBeHidden();
});

test('M13 inspector sheet steps machine to machine by arrow and swipe', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as unknown as { lfWorkspace: { openInspector(id: string): void } }).lfWorkspace.openInspector('robot'));
  const nav = page.getByRole('navigation', { name: 'Step through machines' });
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: /Next machine: Quality Check/ }).click();
  expect((await ws(page)).station).toBe('qa');
  await nav.getByRole('button', { name: /Previous machine: Robotic Process/ }).click();
  expect((await ws(page)).station).toBe('robot');
  const d = (await nav.locator('.insp-dots').boundingBox())!;
  await page.mouse.move(d.x + d.width / 2 + 60, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x + d.width / 2 - 60, d.y + d.height / 2, { steps: 6 });
  await page.mouse.up();
  expect((await ws(page)).station).toBe('qa');
  await page.evaluate(() => (window as unknown as { lfWorkspace: { openInspector(id: string): void } }).lfWorkspace.openInspector('intake'));
  await expect(nav.getByRole('button', { name: 'No previous machine' })).toBeDisabled();
});

test('M15 speeds 1/2/5/10 fit the top bar; labels hide and show from their own control', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-test="speed"] [role="radio"]:visible')).toHaveText(['1×', '2×', '5×', '10×']);
  await page.locator('[data-test="speed"]').getByRole('radio', { name: '5×' }).click();
  await expect(page.locator('[data-test="speed"]').getByRole('radio', { name: '5×' })).toHaveAttribute('aria-checked', 'true');
  await page.locator('.m-modes').getByRole('button', { name: /Data layer/ }).click();
  await page.getByRole('dialog', { name: 'Data layer' }).getByRole('radio', { name: /^Health/ }).click();
  await expect(page.locator('.layer-chip').first()).toBeVisible();
  const group = page.getByRole('toolbar', { name: 'Scene labels' });
  const g = (await group.boundingBox())!;
  const cam = (await page.getByRole('toolbar', { name: 'Camera' }).boundingBox())!;
  expect(g.y + g.height, 'its own card above the camera stack').toBeLessThan(cam.y);
  await group.getByRole('button', { name: 'Hide labels' }).click();
  await expect(page.locator('.layer-chip:visible, .q-badge:visible, .flow-mark:visible')).toHaveCount(0);
  await expect(page.locator('.st-label').first()).toBeVisible();
  await group.getByRole('button', { name: 'Show labels' }).click();
  await expect(page.locator('.layer-chip').first()).toBeVisible();
});

test('M14 tool sheets go back with a header chevron', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as unknown as { lfWorkspace: { openTool(t: string, i: string): void } }).lfWorkspace.openTool('batches', 'B-0842'));
  const back = page.locator('.tool-drawer').getByRole('button', { name: 'Back to all batches' });
  await expect(back).toBeVisible();
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  await back.click();
  expect(await page.evaluate(() => (window as unknown as { lfWorkspace: { state(): { item: string | null } } }).lfWorkspace.state().item)).toBeNull();
  await expect(back).toHaveCount(0);
});
