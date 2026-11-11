import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem('lf.tourPromptSeen', 'true'));
  await page.goto(url);
  await page.waitForSelector('svg.hl');
}
const shown = async (page: Page) => Number((await page.locator('.filters .muted').textContent())!.split(' ')[0]);

test('S10 no native selects remain; every dropdown is the house combobox', async ({ page }) => {
  await open(page, '/production?tool=events');
  await expect(page.locator('select')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Severity' })).toHaveText('All severities');
});

test('S11 mouse: the list opens under the trigger, marks the value and picks an option', async ({ page }) => {
  await open(page, '/production?tool=batches');
  const all = await shown(page);
  const box = page.getByRole('combobox', { name: 'Filter by status' });
  await box.click();
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  const list = page.getByRole('listbox', { name: 'Filter by status' });
  await expect(list.getByRole('option', { name: 'All statuses' })).toHaveAttribute('aria-selected', 'true');
  const b = (await box.boundingBox())!;
  const l = (await list.boundingBox())!;
  expect(l.y).toBeGreaterThanOrEqual(b.y + b.height);
  await list.getByRole('option', { name: 'Completed' }).click();
  await expect(list).toHaveCount(0);
  await expect(box).toHaveText('Completed');
  await expect(box).toBeFocused();
  expect(await shown(page)).toBeLessThan(all);
  await expect(page.locator('.tbl tbody .tag').first()).toHaveText('Completed');
});

test('S12 keyboard: arrows, Enter, type-ahead; Esc closes only the list', async ({ page }) => {
  await open(page, '/production?tool=events');
  const sev = page.getByRole('combobox', { name: 'Severity' });
  await sev.focus();
  await page.keyboard.press('ArrowDown');
  const list = page.getByRole('listbox', { name: 'Severity' });
  await expect(list).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(sev).toHaveAttribute('aria-activedescendant', /.+/);
  await page.keyboard.press('Enter');
  await expect(sev).toHaveText('Warning');
  await page.keyboard.press('c');
  await expect(sev).toHaveText('Critical');
  await page.keyboard.press('Enter');
  await expect(list).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(page.locator('.tool-drawer'), 'Esc closed the list, not the drawer').toBeVisible();
  await expect(sev).toHaveText('Critical');
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('M16 tables keep rows on one line with a pinned first column; the list fits the screen', async ({ page }) => {
    await open(page, '/production?tool=batches');
    const row = page.locator('.tbl tbody tr').nth(1);
    expect((await row.boundingBox())!.height, 'compact rows: name and SKU, no wrapping').toBeLessThan(72);
    const first = page.locator('.tbl tbody tr').first().locator('td').first();
    expect(await first.evaluate((e) => getComputedStyle(e).position)).toBe('sticky');
    const card = page.locator('.card.flush').first();
    await card.evaluate((e) => (e.scrollLeft = 200));
    const x0 = (await first.boundingBox())!.x;
    expect(Math.abs(x0 - (await card.boundingBox())!.x)).toBeLessThanOrEqual(2);
    expect(await card.evaluate((e) => e.scrollHeight <= e.clientHeight + 1), 'no nested vertical scroll').toBe(true);
    await page.getByRole('combobox', { name: 'Filter by status' }).click();
    const l = (await page.getByRole('listbox', { name: 'Filter by status' }).boundingBox())!;
    expect(l.x).toBeGreaterThanOrEqual(0);
    expect(l.x + l.width).toBeLessThanOrEqual(390);
    expect(l.y + l.height).toBeLessThanOrEqual(844);
    for (const o of await page.getByRole('option').all()) expect((await o.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
