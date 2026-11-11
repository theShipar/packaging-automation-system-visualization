import { expect, test, type Page } from '@playwright/test';

type W = { station: string | null; comp: string | null; inspectorOpen: boolean; inspectorTab: string; mode: string };
type Snap = { runId: string; t: number; status: string; seed: number; follow: string | null; jam: string | null; done: Record<string, number> };

async function open(page: Page, url: string, width = 1600, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await page.waitForSelector('svg.hl');
  await page.waitForFunction(() => Boolean((window as unknown as { lfCamera?: { safe: unknown } }).lfCamera?.safe));
}
const ws = (page: Page) => page.evaluate(() => (window as unknown as { lfWorkspace: { state(): W } }).lfWorkspace.state());
const snap = (page: Page) =>
  page.evaluate(() => {
    const st = (window as unknown as { lfStore: { session: { runId: string; t: number; status: string; seed: number; faults: { code: string; status: string }[]; stations: Record<string, { completed: number }> }; follow: string | null } }).lfStore;
    const s = st.session;
    const jam = s.faults.find((f) => f.code === 'PKG_JAM');
    return { runId: s.runId, t: s.t, status: s.status, seed: s.seed, follow: st.follow, jam: jam?.status ?? null, done: Object.fromEntries(Object.entries(s.stations).map(([k, v]) => [k, v.completed])) } as Snap;
  });
const card = (page: Page) => page.locator('.tour-card');

test('G01 ?demo=1 runs the five-scene tour on a fixed seed with Start / Next / Back / Return', async ({ page }) => {
  await open(page, '/production?demo=1');
  await expect(card(page)).toBeVisible();
  await expect(card(page)).toContainText('5 scenes');
  await expect(page.locator('.sim-pill')).toBeVisible();
  await card(page).getByRole('button', { name: 'Start' }).click();

  // 1 overview: running, whole line framed
  await expect(card(page)).toContainText('Scene 1 of 5');
  let s = await snap(page);
  expect(s.seed).toBe(842);
  expect(s.runId).toBe('RUN-DEMO');
  expect(s.status).toBe('running');
  expect((await ws(page)).station).toBeNull();
  await expect.poll(() => page.evaluate(() => (window as unknown as { lfCamera: { cam: { mode?: string }; mode?: string } }).lfCamera.mode)).toBe('overview');
  // the camera frames below the card
  const sr = await page.evaluate(() => ({ ...(window as unknown as { lfCamera: { safe: { y: number } } }).lfCamera.safe }));
  const cb = (await card(page).boundingBox())!;
  const canvas = (await page.locator('.ws-canvas').boundingBox())!;
  expect(sr.y).toBeGreaterThanOrEqual(cb.y + cb.height - canvas.y);

  // 2 follow
  await card(page).getByRole('button', { name: 'Next' }).click();
  await expect(card(page)).toContainText('Follow a serialized kit');
  s = await snap(page);
  expect(s.follow).not.toBeNull();
  await expect(page.locator('.follow-card, [data-test="follow-card"]').first()).toBeVisible();
  await expect(card(page)).toContainText('SN-');

  // 3 inspect: robot, gripper, Parts tab
  await card(page).getByRole('button', { name: 'Next' }).click();
  await expect(card(page)).toContainText('Inspect a machine');
  let w = await ws(page);
  expect(w).toMatchObject({ station: 'robot', comp: 'ROB-GRIPPER-01', inspectorOpen: true, inspectorTab: 'parts' });
  expect((await snap(page)).follow).toBeNull();

  // 4 fault: baseline captured, jam open, packaging inspected in Experiment mode
  await card(page).getByRole('button', { name: 'Next' }).click();
  await expect(card(page)).toContainText('Introduce a fault');
  s = await snap(page);
  expect(s.jam).not.toBeNull();
  expect(['active', 'acknowledged']).toContain(s.jam);
  w = await ws(page);
  expect(w).toMatchObject({ station: 'packaging', inspectorOpen: true, mode: 'experiment' });
  await expect(page.locator('.mode-panel .mp-base')).toBeVisible();
  await expect(page.locator('.insp-dock')).toContainText('Carton jam');

  // 5 recover: resolved, comparison table, activity tab
  await card(page).getByRole('button', { name: 'Next' }).click();
  await expect(card(page)).toContainText('Recover and decide');
  s = await snap(page);
  expect(['resolved', 'recovered']).toContain(s.jam);
  await expect(page.locator('.mode-panel tr[data-metric]').first()).toBeVisible();
  expect((await ws(page)).inspectorTab).toBe('activity');

  // Back rebuilds scene 4 exactly: the jam is open again
  await card(page).getByRole('button', { name: 'Back' }).click();
  await expect(card(page)).toContainText('Introduce a fault');
  expect(['active', 'acknowledged']).toContain((await snap(page)).jam);
  await card(page).getByRole('button', { name: 'Next' }).click();
  await card(page).getByRole('button', { name: 'Return to overview' }).click();
  await expect(card(page)).toHaveCount(0);
  w = await ws(page);
  expect(w.station).toBeNull();
  expect(w.mode).toBe('explore');
});

test('G02 scene entry is deterministic', async ({ page }) => {
  await open(page, '/production');
  // read in the same task as the scripted entry, before any live frame advances the clock
  const enter = (i: number) =>
    page.evaluate((n) => {
      (window as unknown as { lfDemo: { go(i: number): void } }).lfDemo.go(n);
      const s = (window as unknown as { lfStore: { session: { t: number; units: { serial: string }[]; events: unknown[]; stations: Record<string, { completed: number; inQ: unknown[] }> } } }).lfStore.session;
      return JSON.stringify({ t: s.t, units: s.units.map((u) => u.serial), events: s.events.length, st: Object.values(s.stations).map((x) => [x.completed, x.inQ.length]) });
    }, i);
  for (const i of [0, 2, 3, 4]) expect(await enter(i), `scene ${i + 1}`).toBe(await enter(i));
});

test('G03 Skip keeps the line as it is; Exit returns to overview', async ({ page }) => {
  await open(page, '/production?demo=1');
  await card(page).getByRole('button', { name: 'Start' }).click();
  await card(page).getByRole('button', { name: 'Next' }).click();
  await card(page).getByRole('button', { name: 'Next' }).click();
  await card(page).getByRole('button', { name: 'Skip tour' }).click();
  await expect(card(page)).toHaveCount(0);
  expect((await ws(page)).station).toBe('robot');
  expect((await snap(page)).status).toBe('running');

  await page.evaluate(() => (window as unknown as { lfDemo: { go(i: number): void } }).lfDemo.go(2));
  await card(page).getByRole('button', { name: /Exit demo/ }).click();
  await expect(card(page)).toHaveCount(0);
  expect((await ws(page)).station).toBeNull();
});

test('G04 presentation mode hides secondary chrome; Simulation and core controls stay; Esc leaves', async ({ page }) => {
  await open(page, '/production');
  await expect(page.locator('.rail')).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.locator('.shell.presenting')).toHaveCount(1);
  for (const sel of ['.rail', '.cb-batch', '.cmdbar .seg', '.ob-left']) await expect(page.locator(sel).first()).toBeHidden();
  for (const sel of ['.sim-pill', '[data-test="play"]', '.cam-tools', '.status-rail', '.present-exit']) await expect(page.locator(sel).first()).toBeVisible();
  const w0 = (await page.locator('.ws-canvas').boundingBox())!.width;
  expect(w0).toBeGreaterThanOrEqual(1600 - 1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.shell.presenting')).toHaveCount(0);
  await expect(page.locator('.rail')).toBeVisible();

  await open(page, '/production?demo=1&present=1');
  await expect(page.locator('.shell.presenting')).toHaveCount(1);
  await expect(card(page).getByRole('checkbox', { name: 'Presentation' })).toBeChecked();
  await page.locator('.present-exit').click();
  await expect(page.locator('.shell.presenting')).toHaveCount(0);
});

test('G05 capture tour scenes and presentation (SHOTS only)', async ({ page }) => {
  const dir = process.env.SHOTS;
  test.skip(!dir, 'set SHOTS=<dir> to capture');
  for (const [w, h] of [[1600, 900], [1280, 800]] as const) {
    await open(page, '/production?demo=1', w, h);
    await page.screenshot({ path: `screenshots/v2/${dir}/${w}-demo-intro.png` });
    for (let i = 0; i < 5; i++) {
      await page.evaluate((n) => (window as unknown as { lfDemo: { go(i: number): void } }).lfDemo.go(n), i);
      await page.waitForTimeout(i === 1 ? 1500 : 700);
      await page.waitForFunction(() => !(window as unknown as { lfCamera: { animating: boolean } }).lfCamera.animating);
      await page.screenshot({ path: `screenshots/v2/${dir}/${w}-demo-scene${i + 1}.png` });
    }
    await page.evaluate(() => {
      const d = (window as unknown as { lfDemo: { go(i: number): void; skip(): void; setPresenting(b: boolean): void } }).lfDemo;
      d.go(2);
      d.skip();
      d.setPresenting(true);
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `screenshots/v2/${dir}/${w}-presentation.png` });
  }
});

test('G07 the guided demo offer appears after a delay, starts the tour, and is not repeated', async ({ page }) => {
  await open(page, '/production?tourprompt=400');
  const offer = page.getByRole('dialog', { name: 'Need a guided demo? Start here.' });
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: 'Start guided demo' }).click();
  await expect(offer).toBeHidden();
  await expect(card(page)).toContainText('Scene 1 of 5');
  expect(await page.evaluate(() => localStorage.getItem('lf.tourPromptSeen'))).toBe('true');

  await page.goto('/production');
  await page.waitForSelector('svg.hl');
  await page.waitForTimeout(600);
  await expect(page.locator('.tour-prompt')).toHaveCount(0);
});

test('G08 the guided demo offer can be dismissed with Not now', async ({ page }) => {
  await open(page, '/production?tourprompt=200');
  const offer = page.locator('.tour-prompt');
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: 'Not now' }).click();
  await expect(offer).toHaveCount(0);
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('lf.tourPromptSeen'))).toBe('true');
});

test('G09 creator avatar sits at the foot of the rail and links to the portfolio', async ({ page }) => {
  await open(page, '/production');
  const me = page.getByRole('link', { name: /Created by TheShipar/ });
  await expect(me).toHaveAttribute('href', 'https://shipar.vercel.app/');
  await expect(me).toHaveAttribute('target', '_blank');
  const img = me.locator('img');
  expect(await img.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('50%');
  expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const rail = (await page.locator('.rail').boundingBox())!;
  const box = (await me.boundingBox())!;
  expect(box.y + box.height).toBeGreaterThan(rail.y + rail.height - 60);
  await me.hover();
  await expect(me.locator('.tip')).toHaveCSS('opacity', '1');
  await expect(me.locator('.tip')).toContainText('Created by TheShipar');
});

test('G06 record the guided tour as video (VIDEO=<dir> only)', async ({ browser }) => {
  const dir = process.env.VIDEO;
  test.skip(!dir, 'set VIDEO=<dir> to record');
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: dir!, size: { width: 1600, height: 900 } } });
  const page = await ctx.newPage();
  await page.goto('/production?demo=1');
  await page.waitForSelector('.tour-card');
  await page.waitForTimeout(2500);
  await page.locator('.tour-card').getByRole('button', { name: 'Start' }).click();
  // dwell long enough on each scene to read it and watch the line move
  for (const dwell of [7000, 9000, 7000, 9000]) {
    await page.waitForTimeout(dwell);
    await page.locator('.tour-card').getByRole('button', { name: 'Next' }).click();
  }
  await page.waitForTimeout(8000);
  await page.locator('.tour-card').getByRole('button', { name: 'Return to overview' }).click();
  await page.waitForTimeout(3000);
  await ctx.close();
});
