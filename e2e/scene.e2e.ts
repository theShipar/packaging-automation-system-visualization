import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/production');
  await page.waitForSelector('svg.hl');
  await page.waitForFunction(() => Boolean((window as unknown as { lfCamera?: { safe: unknown } }).lfCamera?.safe));
}

const hull = (page: Page, id: string) => page.locator(`path.hit[data-station="${id}"]`);
const centre = async (page: Page, id: string) => {
  const b = (await hull(page, id).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
};

test('S01 two rows: QA sits in front of the robot, row 2 runs back toward intake', async ({ page }) => {
  await open(page);
  const robot = await centre(page, 'robot'), qa = await centre(page, 'qa'), dispatch = await centre(page, 'dispatch'), intake = await centre(page, 'intake');
  expect(qa.y).toBeGreaterThan(robot.y);
  expect(dispatch.x).toBeLessThan(qa.x);
  expect(Math.abs(dispatch.x - intake.x)).toBeLessThan(qa.x - dispatch.x);
  for (const id of ['intake', 'assembly', 'robot', 'qa', 'packaging', 'dispatch']) expect((await centre(page, id)).w, id).toBeGreaterThan(90);
});

test('S02 clicking another machine moves the selection; an empty click clears it', async ({ page }) => {
  await open(page);
  const robot = await centre(page, 'robot');
  await page.mouse.click(robot.x, robot.y);
  await expect(page).toHaveURL(/station=robot/);
  const pk = await centre(page, 'packaging');
  await page.mouse.click(pk.x, pk.y);
  await expect(page).toHaveURL(/station=packaging/);
  const c = (await page.locator('.ws-canvas').boundingBox())!;
  await page.mouse.click(c.x + 40, c.y + 110);
  await expect(page).not.toHaveURL(/station=/);
});

test('S03 a selected part is drawn on its own geometry, not a hull outline', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as unknown as { lfWorkspace: { selectComponent(a: string, b: string): void } }).lfWorkspace.selectComponent('robot', 'ROB-GRIPPER-01'));
  const parts = page.locator('.station.part-sel path.part.sil');
  await expect(parts.first()).toHaveCSS('fill', 'rgb(201, 220, 243)');
  const stroke = await page.locator('path.hit-comp[data-comp="ROB-GRIPPER-01"]').evaluate((el) => getComputedStyle(el).stroke);
  expect(stroke === 'none' || stroke.includes('rgba(0, 0, 0, 0)') || stroke === 'transparent').toBe(true);
  const others = page.locator('.station.part-sel path.sil.mach:not(.part)');
  await expect(others.first()).toHaveCSS('fill', 'rgb(255, 255, 255)');
});
