import { BO, expect, seed, test } from '../support/fixtures';
import { scanA11y } from '../support/axe';

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`INV-007: accessible price draft drawer does not permit ungranted sales to edit (${locale})`, async ({ page, consoleErrors }, testInfo) => {
    await seed(page, { persona: 'sales', locale });
    await page.goto(`${BO}/backoffice/inv/edit-price-drawer`);
    await expect(page.getByTestId('edit-price-drawer-page')).toBeVisible();
    await expect(page.getByTestId('price-change-no-apply')).toBeVisible();
    const units = page.getByTestId('price-change-unit');
    await expect(units.first()).toBeVisible();
    await units.first().click();
    await expect(page).toHaveURL(/\/inv\/edit-price-drawer\?record=unt_/);
    await expect(page.getByTestId('edit-price-change-drawer')).toBeVisible();
    await expect(page.getByTestId('price-change-no-pricing-permission')).toBeVisible();
    await expect(page.getByTestId('price-change-save')).toHaveCount(0);
    const a11y = await scanA11y(page, testInfo, `e3-price-change-drawer-${locale}`);
    expect(a11y.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('edit-price-change-drawer')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
}
test('INV-007: a direct API request with no pricing.manage cannot create or enumerate private price change drafts', async ({ page, consoleErrors }) => {
  await seed(page, { persona: 'sales', locale: 'en-PK' });
  await page.goto(`${BO}/backoffice/inv/edit-price-drawer`);
  const result = await page.evaluate(async () => {
    const routes = [
      { method: 'GET' as const, path: '/units/unt_hidden/price-change-drafts' },
      { method: 'GET' as const, path: '/price-change-drafts/pcd_000001' },
      { method: 'POST' as const, path: '/units/unt_hidden/price-change-drafts',
        body: { proposedPrice: { amount: '1.00', currency: 'PKR' }, reason: 'Attempt unauthorized price change' } },
    ];
    const responses: string[] = [];
    for (const request of routes) {
      try { await window.__prototype!.transport.request(request); responses.push('EXPOSED'); }
      catch (e) {
        const p = (e as { problem?: { status: number; changed: boolean } }).problem;
        responses.push(`${p?.status}:${p?.changed}`);
      }
    }
    return responses;
  });
  expect(result).toEqual(['403:false', '403:false', '403:false']);
  expect(consoleErrors).toEqual([]);
});
