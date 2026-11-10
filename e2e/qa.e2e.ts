import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/** Matrix rows not already owned by another spec. IDs follow the acceptance matrix (sections A–G). */
type Cam = { tx: number; ty: number; s: number };

async function open(page: Page, url = '/production', width = 1600, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(url);
  await page.waitForSelector('svg.hl');
  await page.waitForFunction(() => Boolean((window as unknown as { lfCamera?: { safe: unknown } }).lfCamera?.safe));
}
const settled = async (page: Page) => {
  await page.waitForTimeout(60);
  await page.waitForFunction(() => !(window as unknown as { lfCamera: { animating: boolean } }).lfCamera.animating);
};
const cam = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { lfCamera: { cam: Cam } }).lfCamera.cam }));
const sess = (page: Page) =>
  page.evaluate(() => {
    const st = (window as unknown as { lfStore: { session: { runId: string; t: number; status: string; units: { id: string }[] }; follow: string | null } }).lfStore;
    return { runId: st.session.runId, t: st.session.t, status: st.session.status, units: st.session.units.length, follow: st.follow };
  });
const ff = (page: Page, sec: number) => page.evaluate((n) => (window as unknown as { lfStore: { fastForward(n: number): void } }).lfStore.fastForward(n), sec);
const cmd = (page: Page, c: object) => page.evaluate((x) => (window as unknown as { lfStore: { command(c: object): { ok: boolean; reason?: string } } }).lfStore.command(x), c);
const inCanvas = async (page: Page, sel: string) => {
  const c = (await page.locator('.ws-canvas').boundingBox())!;
  const b = (await page.locator(sel).first().boundingBox())!;
  return b.x >= c.x - 1 && b.y >= c.y - 1 && b.x + b.width <= c.x + c.width + 1 && b.y + b.height <= c.y + c.height + 1;
};

test('L03 closing the inspector widens the canvas; a focused view keeps its zoom, virtual time unchanged', async ({ page }) => {
  await open(page);
  await ff(page, 60);
  await page.evaluate(() => {
    const w = (window as unknown as { lfWorkspace: { focus(id: string): void; openInspector(id: string): void } }).lfWorkspace;
    w.focus('robot');
    w.openInspector('robot');
  });
  await settled(page);
  const w0 = (await page.locator('.ws-canvas').boundingBox())!.width;
  const c0 = await cam(page);
  const t0 = (await sess(page)).t;
  await page.locator('.insp-dock').getByRole('button', { name: 'Close details' }).click();
  await settled(page);
  expect((await page.locator('.ws-canvas').boundingBox())!.width).toBeGreaterThan(w0 + 300);
  expect((await cam(page)).s).toBeCloseTo(c0.s, 6);
  expect((await sess(page)).t).toBe(t0);
  expect(await inCanvas(page, '[data-station="robot"]')).toBe(true);
});

test('L08 no duplicate station cards below the canvas', async ({ page }) => {
  await open(page);
  expect(await page.locator('[class*="station-card"], .station-strip, .footer-cards').count()).toBe(0);
  await expect(page.getByRole('navigation', { name: 'Machines' })).toHaveCount(1);
});

test('C10 a manual pan during Follow stops following and says so', async ({ page }) => {
  await open(page);
  await ff(page, 120);
  await page.evaluate(() => {
    const st = (window as unknown as { lfStore: { session: { stations: Record<string, { current?: { unitId: string } | null; inQ: string[] }> }; setFollow(id: string): void; command(c: object): unknown } }).lfStore;
    const a = st.session.stations.assembly;
    st.setFollow(a.current?.unitId ?? a.inQ[0]);
    st.command({ kind: 'RESUME' });
  });
  await page.waitForTimeout(400);
  expect((await sess(page)).follow).not.toBeNull();
  const box = (await page.locator('.ws-canvas').boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + box.height - 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 320, box.y + box.height - 140, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await sess(page)).follow).toBeNull();
  await expect(page.locator('.toast')).toContainText(/Stopped following/);
});

test('C11 pan far away and zoom, then Fit returns the whole line', async ({ page }) => {
  await open(page);
  const box = (await page.locator('.ws-canvas').boundingBox())!;
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 900, box.y + 700, { steps: 4 });
    await page.mouse.up();
  }
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.wheel(0, -600);
  await page.keyboard.press('f');
  await settled(page);
  for (const id of ['intake', 'assembly', 'robot', 'qa', 'packaging', 'dispatch']) expect(await inCanvas(page, `[data-station="${id}"]`), id).toBe(true);
});

test('C13 resizing the window while focused keeps the machine visible with a valid camera', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as unknown as { lfWorkspace: { focus(id: string): void } }).lfWorkspace.focus('packaging'));
  await settled(page);
  for (const [w, h] of [[1280, 800], [1024, 768], [1600, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await settled(page);
    const c = await cam(page);
    expect(Number.isFinite(c.tx) && Number.isFinite(c.ty) && c.s > 0).toBe(true);
    expect(await inCanvas(page, '[data-station="packaging"]'), `${w}`).toBe(true);
  }
});

test('C09 following a unit that QA rejects rides the reject route without a camera jump', async ({ page }) => {
  await open(page);
  // find the first reject of this seed, then replay the same seed to just before it
  const target = await page.evaluate(() => {
    const st = (window as unknown as { lfStore: { session: { seed: number; units: { id: string; rejectedAt?: number | null }[] }; fastForward(n: number): void; reset(o: object): void } }).lfStore;
    st.fastForward(1800);
    const r = st.session.units.filter((u) => u.rejectedAt != null).sort((a, b) => a.rejectedAt! - b.rejectedAt!)[0];
    const seed = st.session.seed;
    st.reset({ seed });
    st.fastForward(r.rejectedAt! - 6);
    return { id: r.id, at: r.rejectedAt! };
  });
  await page.evaluate((id) => {
    const st = (window as unknown as { lfStore: { setFollow(id: string): void; command(c: object): unknown } }).lfStore;
    st.setFollow(id);
    st.command({ kind: 'SET_SPEED', speed: 2 });
    st.command({ kind: 'RESUME' });
  }, target.id);
  // let the follow camera arrive first; then sample across the rejection itself
  await page.waitForTimeout(1500);
  const r = await page.evaluate(
    () =>
      new Promise<{ maxStep: number; followLost: boolean; state: string; t: number; t0: number }>((done) => {
        const w = window as unknown as { lfCamera: { cam: { tx: number; ty: number } }; lfStore: { follow: string | null; session: { t: number; units: { id: string; state: string }[] } } };
        const id = w.lfStore.follow;
        let last = { ...w.lfCamera.cam }, maxStep = 0, lost = false;
        const t0 = performance.now();
        const v0 = w.lfStore.session.t;
        const tick = () => {
          const c = w.lfCamera.cam;
          maxStep = Math.max(maxStep, Math.hypot(c.tx - last.tx, c.ty - last.ty));
          last = { ...c };
          if (w.lfStore.follow !== id) lost = true;
          if (performance.now() - t0 < 5000) requestAnimationFrame(tick);
          else done({ maxStep, followLost: lost, state: w.lfStore.session.units.find((u) => u.id === id)!.state, t: w.lfStore.session.t, t0: v0 });
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(r.t0, 'sampling starts before the rejection').toBeLessThan(target.at);
  expect(r.t).toBeGreaterThan(target.at);
  expect(r.state).toBe('rejected');
  expect(r.followLost).toBe(false);
  expect(r.maxStep, 'largest per-frame camera move (px)').toBeLessThan(24);
  await expect(page.locator('.follow-card')).toContainText(/[Rr]eject/);
});

test('C08 following a kit through the robot pick and release keeps the camera steady', async ({ page }) => {
  await open(page);
  await ff(page, 120);
  await page.evaluate(() => {
    const st = (window as unknown as { lfStore: { session: { stations: Record<string, { current?: { unitId: string } | null; inQ: string[] }> }; setFollow(id: string): void; command(c: object): unknown } }).lfStore;
    const r = st.session.stations.robot;
    st.setFollow(r.inQ[0] ?? r.current!.unitId);
    st.command({ kind: 'RESUME' });
  });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(
    () =>
      new Promise<{ maxStep: number; lost: boolean; stations: string[] }>((done) => {
        const w = window as unknown as { lfCamera: { cam: { tx: number; ty: number } }; lfStore: { follow: string | null; session: { units: { id: string; station: string | null; state: string }[] } } };
        const id = w.lfStore.follow;
        let last = { ...w.lfCamera.cam }, maxStep = 0, lost = false;
        const seen: string[] = [];
        const t0 = performance.now();
        const tick = () => {
          const c = w.lfCamera.cam;
          maxStep = Math.max(maxStep, Math.hypot(c.tx - last.tx, c.ty - last.ty));
          last = { ...c };
          if (w.lfStore.follow !== id) lost = true;
          const u = w.lfStore.session.units.find((x) => x.id === id)!;
          const k = `${u.station}:${u.state}`;
          if (seen[seen.length - 1] !== k) seen.push(k);
          if (performance.now() - t0 < 9000) requestAnimationFrame(tick);
          else done({ maxStep, lost, stations: seen });
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(r.stations.some((k) => k.startsWith('robot:')), r.stations.join(' > ')).toBe(true);
  expect(r.stations.some((k) => k.startsWith('qa:')), r.stations.join(' > ')).toBe(true);
  expect(r.lost).toBe(false);
  expect(r.maxStep, 'largest per-frame camera move (px)').toBeLessThan(24);
});

test('V05 hovering a running machine does not flicker, even as kits pass under the pointer', async ({ page }) => {
  await open(page);
  await ff(page, 90);
  await cmd(page, { kind: 'SET_SPEED', speed: 5 });
  await cmd(page, { kind: 'RESUME' });
  const b = (await page.locator('path.hit[data-station="robot"]').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator('.station.is-hover').first()).toBeAttached();
  const r = await page.evaluate(
    () =>
      new Promise<{ samples: number; on: number; toggles: number }>((done) => {
        let prev: boolean | null = null, toggles = 0, on = 0, n = 0;
        const t0 = performance.now();
        const tick = () => {
          const h = Boolean(document.querySelector('.station.is-hover'));
          if (prev !== null && h !== prev) toggles++;
          prev = h;
          on += h ? 1 : 0;
          n++;
          if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
          else done({ samples: n, on, toggles });
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(r.toggles, JSON.stringify(r)).toBe(0);
  expect(r.on).toBe(r.samples);
});

test.describe('A07 touch', () => {
  test.use({ hasTouch: true });
  test('one finger pans, two fingers pinch-zoom, a tap selects', async ({ page }) => {
    await open(page, '/production', 1024, 768);
    const cdp = await page.context().newCDPSession(page);
    const box = (await page.locator('.ws-canvas').boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const touch = (type: string, pts: [number, number][]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
    const c0 = await cam(page);
    await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - 30 - i * 15, cy], [cx + 30 + i * 15, cy]]);
    await touch('touchEnd', []);
    await settled(page);
    const c1 = await cam(page);
    expect(c1.s).toBeGreaterThan(c0.s * 1.3);
    await touch('touchStart', [[cx, cy + 120]]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx + i * 20, cy + 120]]);
    await touch('touchEnd', []);
    await settled(page);
    const c2 = await cam(page);
    expect(Math.abs(c2.tx - c1.tx)).toBeGreaterThan(60);
    expect((await page.evaluate(() => (window as unknown as { lfWorkspace: { state(): { station: string | null } } }).lfWorkspace.state())).station).toBeNull();
    await page.keyboard.press('f');
    await settled(page);
    const h = (await page.locator('path.hit[data-station="packaging"]').boundingBox())!;
    await page.touchscreen.tap(h.x + h.width / 2, h.y + h.height / 2);
    await expect.poll(async () => (await page.evaluate(() => (window as unknown as { lfWorkspace: { state(): { station: string | null } } }).lfWorkspace.state())).station).toBe('packaging');
  });
});

test('C14 a part tooltip near the canvas edge stays inside the canvas and off the inspector', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const w = (window as unknown as { lfWorkspace: { focus(id: string): void; openInspector(id: string): void } }).lfWorkspace;
    w.focus('robot');
    w.openInspector('robot');
  });
  await settled(page);
  const canvas = (await page.locator('.ws-canvas').boundingBox())!;
  const dock = (await page.locator('.insp-dock').boundingBox())!;
  const part = page.locator('path.hit-comp[data-comp="ROB-GRIPPER-01"]');
  for (const edge of ['left', 'right'] as const) {
    const g = (await part.boundingBox())!;
    const gx = g.x + g.width / 2, gy = g.y + g.height / 2;
    const targetX = edge === 'left' ? canvas.x + 14 : canvas.x + canvas.width - 14;
    // drag from empty floor so the gripper lands at the edge
    const sx = canvas.x + canvas.width / 2, sy = canvas.y + canvas.height - 140;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + (targetX - gx), sy, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    const g2 = (await part.boundingBox())!;
    await page.mouse.move(Math.min(Math.max(g2.x + g2.width / 2, canvas.x + 2), canvas.x + canvas.width - 2), g2.y + g2.height / 2);
    const tip = page.locator('.comp-tip');
    await expect(tip).toBeVisible();
    const t = (await tip.boundingBox())!;
    expect(t.x, edge).toBeGreaterThanOrEqual(canvas.x);
    expect(t.x + t.width, edge).toBeLessThanOrEqual(canvas.x + canvas.width);
    expect(t.x + t.width, `${edge}: off the inspector`).toBeLessThanOrEqual(dock.x);
    expect(t.y).toBeGreaterThanOrEqual(canvas.y);
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height - 100);
  }
});

test('D15 an invalid buffer setting is blocked with a reason and loses no units', async ({ page }) => {
  await open(page);
  await ff(page, 90);
  const before = await sess(page);
  const r = await cmd(page, { kind: 'APPLY_SETTINGS', stationId: 'assembly', values: { bufferOut: 9999 } });
  expect(r.ok).toBe(false);
  expect(r.reason).toMatch(/between/);
  const r2 = await cmd(page, { kind: 'APPLY_SETTINGS', stationId: 'assembly', values: { bufferOut: 2.5 } });
  expect(r2.ok).toBe(false);
  expect((await sess(page)).units).toBe(before.units);
});

test('I08 replacing a run that has moved asks first and offers a copy; Cancel keeps it', async ({ page }) => {
  await open(page);
  await ff(page, 60);
  const run0 = (await sess(page)).runId;
  await page.evaluate(() => (window as unknown as { lfWorkspace: { openTool(t: string): void } }).lfWorkspace.openTool('settings'));
  await page.getByRole('button', { name: 'New run with seed' }).click();
  const dlg = page.getByRole('dialog').filter({ hasText: 'Start a new run' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('checkbox', { name: /Download this run/ })).toBeVisible();
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  expect((await sess(page)).runId).toBe(run0);
  await page.getByRole('button', { name: 'New run with seed' }).click();
  await dlg.getByRole('checkbox', { name: /Download this run/ }).uncheck();
  await dlg.getByRole('button', { name: 'Start new run' }).click();
  expect((await sess(page)).runId).not.toBe(run0);

  // scenario lab load asks too once the run has moved
  await ff(page, 30);
  await page.evaluate(() => (window as unknown as { lfWorkspace: { openTool(t: string): void } }).lfWorkspace.openTool('scenarios'));
  await page.getByRole('button', { name: 'Load on line' }).first().click();
  await expect(page.getByRole('dialog').filter({ hasText: 'on the line?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog').filter({ hasText: 'on the line?' })).toHaveCount(0);
});

test('I11 searching a known serial follows it; an unknown serial says so', async ({ page }) => {
  await open(page);
  await ff(page, 120);
  const serial = await page.evaluate(() => {
    const s = (window as unknown as { lfStore: { session: { units: { id: string; serial: string }[]; stations: Record<string, { current?: { unitId: string } | null; inQ: string[] }> } } }).lfStore.session;
    const a = s.stations.assembly;
    const id = a.current?.unitId ?? a.inQ[0];
    return s.units.find((u) => u.id === id)!.serial;
  });
  await page.keyboard.press('/');
  const input = page.getByRole('search').locator('input');
  await input.fill(serial);
  await input.press('Enter');
  await expect.poll(async () => (await sess(page)).follow).not.toBeNull();
  await page.keyboard.press('Escape');
  await page.keyboard.press('/');
  await input.fill('SN-NOPE-9999');
  await input.press('Enter');
  await expect(page.locator('.toast.error')).toContainText('No unit matches');
});

test('I12 an empty event filter explains itself and offers Clear filters', async ({ page }) => {
  await open(page);
  await ff(page, 60);
  await page.evaluate(() => (window as unknown as { lfWorkspace: { openTool(t: string): void } }).lfWorkspace.openTool('events'));
  await page.getByRole('textbox', { name: 'Search events' }).fill('zzzz-nothing');
  await expect(page.getByText('No events match')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText('No events match')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Search events' })).toHaveValue('');
});

test('A02 status is carried by text, not colour alone; A09 simulation and virtual time are disclosed', async ({ page }) => {
  await open(page);
  await ff(page, 60);
  await cmd(page, { kind: 'INJECT_FAULT', code: 'PKG_JAM' });
  await page.waitForTimeout(200);
  await expect(page.locator('.st-label.alert').first()).toContainText('Carton jam');
  await page.evaluate(() => (window as unknown as { lfWorkspace: { select(id: string): void } }).lfWorkspace.select('robot'));
  await expect(page.locator('.st-label.sel').first()).toContainText(/Running|Paused|Idle|Blocked|Starved|Faulted/);
  await expect(page.locator('.state-pill')).toHaveText(/Paused|Faulted|Running/);
  await expect(page.locator('.sim-pill')).toHaveText('Simulation');
  await expect(page.locator('.rail-sim')).toBeVisible();
  await expect(page.locator('[data-test="clock"]')).toHaveAttribute('title', /Virtual simulation time/);
});

test('A06 dialogs take focus, keep Tab inside, and give focus back', async ({ page }) => {
  await open(page);
  const fit = page.getByRole('button', { name: 'Fit whole line' });
  await fit.focus();
  await page.keyboard.press('?');
  const dlg = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dlg).toBeVisible();
  expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(fit).toBeFocused();

  await ff(page, 30);
  const more = page.getByRole('button', { name: 'Run menu' });
  await more.click();
  await page.getByRole('menuitem', { name: /Restart run/ }).click();
  const confirm = page.getByRole('dialog').filter({ hasText: 'Restart' });
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
  // Tab and Shift+Tab never leave the dialog
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(i % 3 === 2 ? 'Shift+Tab' : 'Tab');
    expect(await confirm.evaluate((d) => d.contains(document.activeElement)), `tab ${i}`).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
});

test('P09 no uncaught errors across three journeys: run & select, fault & recover, guided demo', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  await open(page);
  // 1 run, select, follow, pause
  await page.locator('[data-test="play"]').click();
  await page.locator('[data-test="speed"]').getByRole('radio', { name: '20×' }).click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as unknown as { lfWorkspace: { openInspector(id: string): void } }).lfWorkspace.openInspector('qa'));
  await page.locator('.insp-dock').getByRole('tab', { name: 'Parts' }).click();
  await page.locator('.insp-dock').getByRole('tab', { name: 'Activity' }).click();
  await page.locator('[data-test="play"]').click();
  // 2 fault and recovery through the fault card
  await cmd(page, { kind: 'INJECT_FAULT', code: 'PKG_JAM' });
  await page.evaluate(() => (window as unknown as { lfWorkspace: { openInspector(id: string): void; mode(m: string): void } }).lfWorkspace.openInspector('packaging'));
  await page.locator('.insp-dock').getByRole('tab', { name: 'Overview' }).click();
  const card = page.locator('.insp-dock .fault-card').first();
  await card.getByRole('button', { name: 'Acknowledge' }).click();
  await card.getByRole('button', { name: 'Create work order' }).click();
  const pause = card.getByRole('button', { name: /Pause line/ });
  if (await pause.isVisible()) await pause.click();
  await card.getByRole('button', { name: /Start repair/ }).click();
  await card.getByRole('button', { name: /& verify/ }).click();
  await page.evaluate(() => (window as unknown as { lfWorkspace: { mode(m: string): void } }).lfWorkspace.mode('diagnose'));
  await page.waitForTimeout(300);
  // 3 guided demo end to end
  await page.evaluate(() => (window as unknown as { lfDemo: { go(i: number): void } }).lfDemo.go(0));
  for (let i = 0; i < 4; i++) {
    await page.locator('.tour-card').getByRole('button', { name: 'Next' }).click();
    await page.waitForTimeout(250);
  }
  await page.locator('.tour-card').getByRole('button', { name: 'Return to overview' }).click();
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('P03 soak: listeners, DOM and heap stay bounded; events never duplicate (SOAK=1)', async ({ page }) => {
  const minutes = Number(process.env.SOAK_MIN ?? 10);
  test.skip(!process.env.SOAK, 'set SOAK=1 (SOAK_MIN to shorten)');
  test.setTimeout((minutes + 3) * 60_000);
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics: m } = await cdp.send('Performance.getMetrics');
    const get = (n: string) => m.find((x) => x.name === n)?.value ?? 0;
    return { listeners: get('JSEventListeners'), nodes: get('Nodes'), heapMB: +(get('JSHeapUsedSize') / 1048576).toFixed(1), docs: get('Documents'), frames: get('Frames') };
  };
  await page.locator('[data-test="play"]').click();
  await page.locator('[data-test="speed"]').getByRole('radio', { name: '10×' }).click();
  await page.waitForTimeout(5000);
  const start = await metrics();
  const samples: (Awaited<ReturnType<typeof metrics>> & { wallMin: number; virtualMin: number })[] = [];
  const ids = ['intake', 'assembly', 'robot', 'qa', 'packaging', 'dispatch'];
  const t0 = Date.now();
  let i = 0;
  const box = (await page.locator('.ws-canvas').boundingBox())!;
  while (Date.now() - t0 < minutes * 60_000) {
    // a steady mix of the core interactions
    const id = ids[i % ids.length];
    await page.evaluate((x) => (window as unknown as { lfWorkspace: { openInspector(id: string): void } }).lfWorkspace.openInspector(x), id);
    await page.waitForTimeout(1500);
    await page.mouse.move(box.x + 400, box.y + 400);
    await page.mouse.down();
    await page.mouse.move(box.x + 460, box.y + 430, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.press('f');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    if (++i % 20 === 0) {
      const t = (await sess(page)).t;
      samples.push({ ...(await metrics()), wallMin: +((Date.now() - t0) / 60000).toFixed(1), virtualMin: +(t / 60).toFixed(1) });
    }
  }
  const end = await metrics();
  const ev = await page.evaluate(() => {
    const s = (window as unknown as { lfStore: { session: { events: { id: string | number }[]; t: number; status: string } } }).lfStore.session;
    const set = new Set(s.events.map((e) => e.id));
    return { events: s.events.length, unique: set.size, t: s.t, status: s.status };
  });
  const out = { minutes, speed: '10×', start, end, samples, events: ev };
  if (process.env.SOAK_OUT) writeFileSync(process.env.SOAK_OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  expect(ev.unique).toBe(ev.events);
  expect(end.listeners - start.listeners).toBeLessThanOrEqual(40);
  expect(end.nodes).toBeLessThan(start.nodes * 1.5 + 500);
  expect(end.docs).toBe(start.docs);
});
