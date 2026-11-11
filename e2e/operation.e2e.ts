import { expect, test, type Page } from '@playwright/test';

type Rect = { x: number; y: number; w: number; h: number };
type S = { runId: string; t: number; seq: number; scenarioId: string; status: string; faults: { code: string; status: string }[]; stations: Record<string, { completed: number; status: string; outQ: unknown[]; inQ: unknown[] }>; config: Record<string, { bufferOut: number; bufferIn: number }> };

async function open(page: Page, url = '/production') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await page.waitForSelector('svg.hl');
  await page.waitForFunction(() => Boolean((window as unknown as { lfCamera?: { safe: unknown } }).lfCamera?.safe));
}
const sess = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { lfStore: { session: S } }).lfStore.session;
    return JSON.parse(JSON.stringify({ runId: s.runId, t: s.t, seq: s.seq, scenarioId: s.scenarioId, status: s.status, faults: s.faults.map((f) => ({ code: f.code, status: f.status })), stations: s.stations, config: s.config })) as S;
  });
const ff = (page: Page, sec: number) => page.evaluate((n) => (window as unknown as { lfStore: { fastForward(n: number): void } }).lfStore.fastForward(n), sec);
const cmd = (page: Page, c: object) => page.evaluate((x) => (window as unknown as { lfStore: { command(c: object): unknown } }).lfStore.command(x), c);
const settled = async (page: Page) => {
  await page.waitForTimeout(60);
  await page.waitForFunction(() => !(window as unknown as { lfCamera: { animating: boolean } }).lfCamera.animating);
};
/** The segmented switch, or its compact menu when the canvas is narrow. */
async function mode(page: Page, name: string) {
  const seg = page.locator('.mode-seg').getByRole('radio', { name });
  if (await seg.isVisible()) return seg.click();
  await page.locator('.mode-menu > button').click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click();
}
const panel = (page: Page) => page.locator('.mode-panel');

async function insideSafe(page: Page, selector: string) {
  const c = (await page.locator('.ws-canvas').boundingBox())!;
  const b = (await page.locator(selector).first().boundingBox())!;
  const sr = await page.evaluate(() => ({ ...(window as unknown as { lfCamera: { safe: Rect } }).lfCamera.safe }));
  expect(b.x - c.x).toBeGreaterThanOrEqual(sr.x - 1);
  expect(b.x - c.x + b.width).toBeLessThanOrEqual(sr.x + sr.w + 1);
}

test('M01 switching modes keeps selection and run; the panel never covers the selected machine', async ({ page }) => {
  await open(page, '/production?station=robot');
  const before = await sess(page);
  for (const m of ['Operate', 'Diagnose', 'Experiment']) {
    await mode(page, m);
    await expect(panel(page)).toBeVisible();
    await settled(page);
    await expect(page).toHaveURL(/station=robot/);
    await insideSafe(page, 'path.hit[data-station="robot"]');
    const pb = (await panel(page).boundingBox())!;
    const rb = (await page.locator('path.hit[data-station="robot"]').boundingBox())!;
    expect(rb.x).toBeGreaterThanOrEqual(pb.x + pb.width);
  }
  await mode(page, 'Explore');
  await expect(panel(page)).toHaveCount(0);
  const after = await sess(page);
  expect(after.runId).toBe(before.runId);
  expect(after.seq).toBe(before.seq);
  expect(after.t).toBe(before.t);
});

test('O01 Operate: +15 min advances the same engine exactly 900 virtual seconds', async ({ page }) => {
  await open(page);
  await mode(page, 'Operate');
  await panel(page).getByRole('button', { name: '+15 min' }).click();
  await expect.poll(async () => (await sess(page)).t).toBe(900);
  expect((await sess(page)).status).toBe('paused');
  await panel(page).getByRole('button', { name: '+15 min' }).click();
  await expect.poll(async () => (await sess(page)).t).toBe(1800);
  await expect(panel(page).locator('.mp-insight')).toContainText(/Constraint/);
});

test('O02 Reset view fits the line and changes no run data', async ({ page }) => {
  await open(page);
  await ff(page, 60);
  const c = (await page.locator('.ws-canvas').boundingBox())!;
  await page.mouse.move(c.x + 400, c.y + 300);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120);
  await expect(page.locator('.zoom-pct')).not.toHaveText('100%');
  const before = await sess(page);
  await page.getByRole('button', { name: 'Run menu' }).click();
  await page.getByRole('menuitem', { name: /Reset view/ }).click();
  await settled(page);
  await expect(page.locator('.zoom-pct')).toHaveText('100%');
  const after = await sess(page);
  expect(after.seq).toBe(before.seq);
  expect(after.t).toBe(before.t);
});

test('O03 Restore scenario replays its script; Restart run keeps settings but not the script', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as unknown as { lfStore: { loadScenario(id: string): void } }).lfStore.loadScenario('packaging-jam'));
  await ff(page, 60);
  const r0 = (await sess(page)).runId;

  await page.getByRole('button', { name: 'Run menu' }).click();
  await page.getByRole('menuitem', { name: /Restart run/ }).click();
  const dlg = page.getByRole('dialog', { name: /Restart this run/ });
  await expect(dlg).toContainText('keeps the current station settings');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  expect((await sess(page)).runId).toBe(r0);

  await page.getByRole('button', { name: 'Run menu' }).click();
  await page.getByRole('menuitem', { name: /Restart run/ }).click();
  await dlg.getByLabel('Download this run as JSON first').uncheck();
  await dlg.getByRole('button', { name: 'Restart run' }).click();
  const r1 = await sess(page);
  expect(r1.runId).not.toBe(r0);
  expect(r1.t).toBe(0);
  await ff(page, 240);
  expect((await sess(page)).faults.some((f) => f.code === 'PKG_JAM')).toBe(false);

  await page.getByRole('button', { name: 'Run menu' }).click();
  await page.getByRole('menuitem', { name: /Restore scenario/ }).click();
  const d2 = page.getByRole('dialog', { name: /Restore/ });
  await d2.getByLabel('Download this run as JSON first').uncheck();
  await d2.getByRole('button', { name: 'Restore scenario' }).click();
  const r2 = await sess(page);
  expect(r2.scenarioId).toBe('packaging-jam');
  expect(r2.t).toBe(0);
  await ff(page, 240);
  expect((await sess(page)).faults.some((f) => f.code === 'PKG_JAM')).toBe(true);
});

test('D10/I05 a packaging jam derives machine, alerts, log, queues and ETA from one fault', async ({ page }) => {
  await open(page);
  await ff(page, 180);
  await mode(page, 'Diagnose');
  await expect(panel(page)).toContainText('All clear');
  await page.getByRole('button', { name: /^Resume$/ }).click();
  await cmd(page, { kind: 'INJECT_FAULT', code: 'PKG_JAM' });
  await expect(page.locator('.st-label.alert')).toHaveCount(1);
  await expect(page.locator('.icon-btn.alerts .count')).toHaveText('1');
  await expect(panel(page).locator('.fault-card')).toContainText('Carton jam at outfeed');
  await expect(page.locator('.notice.crit')).toContainText('PKG_JAM');
  await expect(page.locator('.sr-eta')).toContainText('Delayed');
  await page.getByRole('button', { name: /^Pause$/ }).click();

  const a = await sess(page);
  await ff(page, 300);
  const b = await sess(page);
  expect(b.stations.packaging.completed).toBe(a.stations.packaging.completed);
  expect(b.stations.packaging.status).toBe('faulted');
  expect(b.stations.qa.outQ.length + b.stations.packaging.inQ.length).toBeGreaterThan(a.stations.qa.outQ.length + a.stations.packaging.inQ.length);
  expect(['blocked', 'faulted']).toContain(b.stations.qa.status);
  await expect(page.locator('.layer-chip[data-station="packaging"]')).toHaveClass(/bad/);
  await page.locator('.layer-btn').click();
  await page.getByRole('radio', { name: /^Capacity/ }).click();
  await expect(page.locator('.layer-chip.warn[data-layer="capacity"]').first()).toBeVisible();
});

test('D11/I06 recovering the jam walks the guarded steps and the line drains at machine pace', async ({ page }) => {
  await open(page);
  await ff(page, 180);
  await cmd(page, { kind: 'INJECT_FAULT', code: 'PKG_JAM' });
  await ff(page, 240);
  await mode(page, 'Diagnose');
  const card = panel(page).locator('.fault-card');
  await card.getByRole('button', { name: 'Acknowledge' }).click();
  await card.getByRole('button', { name: 'Create work order' }).click();
  await card.getByRole('button', { name: /Start repair/ }).click();
  await card.getByRole('button', { name: /& verify/ }).click();
  await expect(panel(page).locator('.fault-card')).toHaveCount(0);
  await expect(panel(page)).toContainText('Recovered this run');
  await expect(page.locator('.icon-btn.alerts .count')).toHaveCount(0);
  const s0 = await sess(page);
  expect(['resolved', 'recovered']).toContain(s0.faults.find((f) => f.code === 'PKG_JAM')!.status);
  await ff(page, 60);
  const s1 = await sess(page);
  const made = s1.stations.packaging.completed - s0.stations.packaging.completed;
  expect(made).toBeGreaterThan(0);
  expect(made).toBeLessThanOrEqual(Math.ceil(60 / 4.5) + 1);
  expect(s1.stations.packaging.status).not.toBe('faulted');
});

test('E01 Experiment: baseline, change, compare at the same virtual time, restore', async ({ page }) => {
  await open(page);
  await ff(page, 120);
  await mode(page, 'Experiment');
  await panel(page).getByRole('button', { name: /Capture baseline/ }).click();
  await expect(panel(page)).toContainText('no changes yet');
  await panel(page).getByRole('combobox', { name: 'Fault to inject' }).click();
  await page.getByRole('listbox', { name: 'Fault to inject' }).getByRole('option', { name: /PKG_JAM/ }).click();
  await expect(panel(page).getByRole('combobox', { name: 'Fault to inject' })).toContainText('Packaging');
  await panel(page).getByRole('button', { name: 'Inject' }).click();
  await expect(panel(page)).toContainText('1 change since');
  await expect(panel(page).getByRole('button', { name: /Compare at/ })).toBeDisabled();
  await ff(page, 300);
  await panel(page).getByRole('button', { name: /Compare at/ }).click();
  const shipped = panel(page).locator('tr[data-metric="shipped"] td.delta');
  await expect(shipped).toHaveClass(/bad/);
  await expect(panel(page).locator('tr[data-metric="downtimeSec"] td.delta')).toHaveClass(/bad/);
  await panel(page).getByRole('button', { name: 'Restore baseline' }).click();
  const d = page.getByRole('dialog', { name: /Restore the baseline/ });
  await d.getByLabel('Download this run as JSON first').uncheck();
  await d.getByRole('button', { name: 'Restore baseline' }).click();
  const s = await sess(page);
  expect(s.t).toBe(120);
  expect(s.faults.length).toBe(0);
});

test('L01 layers: one at a time, each with its source; energy says simulated', async ({ page }) => {
  await open(page);
  await ff(page, 300);
  await expect(page.locator('.layer-chip')).toHaveCount(0);
  for (const [name, n] of [['Energy', 6], ['Quality', 1], ['Health', 6], ['Capacity', 6]] as const) {
    await page.locator('.layer-btn').click();
    const row = page.getByRole('radio', { name: new RegExp(`^${name}`) });
    await expect(row).toContainText(name === 'Energy' ? 'Not a meter' : /\w/);
    await row.click();
    await expect(page.locator('.layer-chip')).toHaveCount(n);
  }
  await expect(page.locator('.layer-btn')).toContainText('Capacity');
  await page.locator('.layer-btn').click();
  await page.getByRole('radio', { name: /^Flow/ }).click();
  await expect(page.locator('.layer-chip')).toHaveCount(0);
});

test('P06 every visible control works or says why it is disabled, in every mode', async ({ page }) => {
  await open(page, '/production?station=packaging');
  for (const m of ['Explore', 'Operate', 'Diagnose', 'Experiment']) {
    await mode(page, m);
    await page.waitForTimeout(100);
    const bad = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLButtonElement>('.cmdbar button, .ws-canvas button, .insp-dock button, .rail button')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden' || el.closest('[aria-hidden="true"]')) continue;
        const name = (el.getAttribute('aria-label') || el.textContent || el.title || '').trim();
        if (!name) out.push(`unnamed: ${el.outerHTML.slice(0, 80)}`);
        if (el.disabled && !el.title) out.push(`disabled without reason: ${name}`);
      }
      return out;
    });
    expect(bad, m).toEqual([]);
  }
});
