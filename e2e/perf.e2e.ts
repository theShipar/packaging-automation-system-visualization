/*
 * Interaction profiling. Run with PERF=1 (optionally PERF_OUT=notes/U6-perf.json):
 *   PERF=1 npx playwright test perf
 * Runs the line at 20× and records rAF frame intervals, long tasks and the scene's own render+commit
 * time (user-timing marks behind ?perf=1) during idle, pan, wheel zoom, focus, inspector open and a fault.
 */
import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const ON = !!process.env.PERF;
const SIZES = [
  { width: 1600, height: 900 },
  { width: 1280, height: 800 },
];
type W = Record<string, unknown> & { __f: number[]; __lt: number[]; __on: boolean; __po: PerformanceObserver };
type Sample = { frames: number[]; long: number[]; scene: number[]; cam: number[]; insp: number[] };

const q = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const r1 = (x: number) => Math.round(x * 10) / 10;

function stats(x: Sample) {
  const mean = x.frames.reduce((a, b) => a + b, 0) / Math.max(1, x.frames.length);
  return {
    frames: x.frames.length,
    fps: r1(1000 / mean),
    frameP50: r1(q(x.frames, 0.5)),
    frameP95: r1(q(x.frames, 0.95)),
    frameMax: r1(Math.max(0, ...x.frames)),
    over25ms: r1((100 * x.frames.filter((f) => f > 25).length) / Math.max(1, x.frames.length)),
    longTasks: x.long.length,
    longMax: r1(Math.max(0, ...x.long)),
    sceneP50: r1(q(x.scene, 0.5)),
    sceneP95: r1(q(x.scene, 0.95)),
    camMove: x.cam.length ? r1(x.cam[x.cam.length - 1]) : null,
    inspectorOpen: x.insp.length ? r1(x.insp[x.insp.length - 1]) : null,
  };
}

async function sample(page: Page, action: () => Promise<void>): Promise<Sample> {
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__f = [];
    w.__lt = [];
    w.__on = true;
    let last = performance.now();
    const loop = (t: number) => {
      w.__f.push(t - last);
      last = t;
      if (w.__on) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    w.__po = new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push(e.duration)));
    try {
      w.__po.observe({ type: 'longtask', buffered: false });
    } catch {
      /* long tasks unsupported */
    }
    performance.clearMeasures();
  });
  await action();
  return page.evaluate(() => {
    const w = window as unknown as W;
    w.__on = false;
    w.__po.disconnect();
    const d = (n: string) => performance.getEntriesByName(n).map((e) => e.duration);
    return { frames: w.__f.slice(2), long: w.__lt, scene: d('lf:scene'), cam: [...d('lf:cam:focus-station'), ...d('lf:cam:focus-component'), ...d('lf:cam:overview')], insp: d('lf:inspector-open') };
  });
}

test.describe('perf', () => {
  test.skip(!ON, 'set PERF=1 to profile');
  test.setTimeout(180_000);
  const out: Record<string, unknown> = {};

  for (const size of SIZES) {
    test(`interactions at ${size.width}x${size.height}, 20×`, async ({ page, browser }) => {
      await page.setViewportSize(size);
      await page.goto('/production?perf=1');
      await page.waitForSelector('svg.hl');
      await page.waitForFunction(() => Boolean((window as unknown as { lfCamera?: { safe: unknown } }).lfCamera?.safe));
      await page.evaluate(() => {
        const st = (window as unknown as { lfStore: { fastForward(n: number): void; command(c: object): void } }).lfStore;
        st.fastForward(600);
        st.command({ kind: 'SET_SPEED', speed: 20 });
        st.command({ kind: 'RESUME' });
      });
      await page.waitForTimeout(800);
      const c = (await page.locator('.ws-canvas').boundingBox())!;
      const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
      const res: Record<string, ReturnType<typeof stats>> = {};

      res.idle = stats(await sample(page, () => page.waitForTimeout(3000)));
      res.pan = stats(
        await sample(page, async () => {
          await page.mouse.move(cx, cy);
          await page.mouse.down();
          for (let i = 0; i < 120; i++) {
            await page.mouse.move(cx + Math.sin(i / 12) * 160, cy + Math.cos(i / 15) * 60);
            await page.waitForTimeout(16);
          }
          await page.mouse.up();
        }),
      );
      res.zoom = stats(
        await sample(page, async () => {
          await page.keyboard.press('f');
          await page.mouse.move(cx, cy);
          for (let i = 0; i < 12; i++) {
            await page.mouse.wheel(0, i < 6 ? -120 : 120);
            await page.waitForTimeout(80);
          }
        }),
      );
      res.focus = stats(
        await sample(page, async () => {
          await page.evaluate(() => (window as unknown as { lfWorkspace: { focus(s: string): void } }).lfWorkspace.focus('robot'));
          await page.waitForTimeout(80);
          await page.waitForFunction(() => !(window as unknown as { lfCamera: { animating: boolean } }).lfCamera.animating);
          await page.waitForTimeout(400);
        }),
      );
      res.inspector = stats(
        await sample(page, async () => {
          await page.evaluate(() => (window as unknown as { lfWorkspace: { openInspector(s: string): void } }).lfWorkspace.openInspector('packaging'));
          await expect(page.locator('.insp-dock')).toBeVisible();
          await page.waitForTimeout(1200);
        }),
      );
      let faultMs = 0;
      res.fault = stats(
        await sample(page, async () => {
          faultMs = await page.evaluate(
            () =>
              new Promise<number>((done) => {
                const t0 = performance.now();
                (window as unknown as { lfStore: { command(c: object): void } }).lfStore.command({ kind: 'INJECT_FAULT', code: 'PKG_JAM' });
                const check = () => (document.querySelector('.st-label.alert') ? done(performance.now() - t0) : requestAnimationFrame(check));
                check();
              }),
          );
          await page.waitForTimeout(1500);
        }),
      );
      await page.goto('/production?perf=1');
      await page.waitForSelector('svg.hl');
      await page.waitForFunction(() => Boolean((window as unknown as { lfCamera?: { safe: unknown } }).lfCamera?.safe));
      await page.evaluate(() => {
        const w = window as unknown as { lfStore: { fastForward(n: number): void; command(c: object): void }; lfWorkspace: { mode(m: string): void; layer(l: string): void } };
        w.lfStore.fastForward(90 * 60);
        w.lfWorkspace.mode('diagnose');
        w.lfWorkspace.layer('quality');
        w.lfStore.command({ kind: 'SET_SPEED', speed: 20 });
        w.lfStore.command({ kind: 'RESUME' });
      });
      await page.waitForTimeout(800);
      res.lateRunQuality = stats(await sample(page, () => page.waitForTimeout(3000)));
      out[`${size.width}x${size.height}`] = { ...res, faultToAlertMs: r1(faultMs) };
      out.env = {
        browser: `${browser.browserType().name()} ${browser.version()} (Playwright, headless, software raster)`,
        cpu: os.cpus()[0]?.model,
        cores: os.cpus().length,
        memGB: Math.round(os.totalmem() / 2 ** 30),
        os: `${os.type()} ${os.release()} ${os.arch()}`,
        date: new Date().toISOString(),
      };
      console.table(res);
      console.log('fault → alert tag', r1(faultMs), 'ms');
      if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, JSON.stringify(out, null, 2));
    });
  }
});
