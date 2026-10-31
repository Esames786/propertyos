import type { Page } from '@playwright/test';
import { BO, expect, test } from '../support/fixtures';
import { become, seedSociety, societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * D.1 + S.1 integration cross-browser smoke (Firefox and WebKit projects): the cashbook's cards, which
 * depend on a container query measured in em (text size), and owner decision D-46, office cash counted
 * by a second person before its receipt. The full checks run in Chromium (tests/e2e/integration.spec).
 */
async function office(page: Page, path: string, ready: string) {
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

test('cashbook: cards at 320 px with 200 % Urdu text', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORTS.reflow);
  await seedSociety(page, { staff: 'alnoor_treasurer', locale: 'ur-PK' });
  await page.addInitScript(() => {
    const key = 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0002';
    if (localStorage.getItem(`smoke:${key}`)) return;
    localStorage.setItem(`smoke:${key}`, '1');
    localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' }));
  });
  await office(page, '/backoffice/bank/cashbook?period=2026-10', 'cashbook-cards');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', '200');
  await expect(page.getByTestId('cashbook-lines')).toBeHidden();
  await expect(page.getByTestId('cashbook-card')).toHaveCount(6);
  const outside = await page.getByTestId('cashbook-card').first().evaluate((card) => {
    const box = card.getBoundingClientRect();
    return [...card.querySelectorAll<HTMLElement>('*')].filter((d) => {
      const r = d.getBoundingClientRect();
      return r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1);
    }).length;
  });
  expect(outside).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(consoleErrors).toEqual([]);
});

test('cashbook: the table on the desktop at 100 % text', async ({ page, consoleErrors }) => {
  await seedSociety(page, { staff: 'alnoor_treasurer' });
  await office(page, '/backoffice/bank/cashbook?period=2026-10', 'cashbook-lines');
  await expect(page.getByTestId('cashbook-line')).toHaveCount(6);
  await expect(page.getByTestId('cashbook-cards')).toBeHidden();
  expect(consoleErrors).toEqual([]);
});

test('D-46: office cash waits for a second count; the treasurer confirms it and only then the receipt', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await seedSociety(page, { staff: 'alnoor_treasurer' });
  await office(page, '/backoffice/fin/finance-dashboard', 'finance-dashboard');
  await societyApi(page, '/sites/site_alnoor/payment-methods', 'PATCH', { method: 'office_cash', enabled: true });
  await become(page, 'backoffice', 'alnoor_accounts');
  await office(page, '/backoffice/fin/payment-list?drawer=office&account=ba_anr_a101', 'office-drawer');
  const drawer = page.getByTestId('office-drawer');
  await drawer.getByTestId('office-amount').fill('2000');
  await drawer.getByTestId('office-submit').click();
  await expect(drawer.getByTestId('office-done')).toHaveAttribute('data-status', 'awaiting_count');
  const href = (await drawer.getByTestId('office-open-collection').getAttribute('href'))!;

  await become(page, 'backoffice', 'alnoor_treasurer');
  await office(page, href, 'batch-drawer');
  await page.getByTestId('batch-counted').fill('2000');
  await page.getByTestId('batch-confirm').click();
  await expect(page.getByTestId('line-receipt').first()).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
