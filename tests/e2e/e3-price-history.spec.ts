import { BO, expect, seed, test } from '../support/fixtures';
import { scanA11y } from '../support/axe';

const URL = `${BO}/backoffice/inv/unit-price-history`;

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`INV-006: accessible fictional unit price baseline, search and deep link (${locale})`, async ({ page, consoleErrors }, testInfo) => {
    await seed(page, { persona: 'sales', locale });
    await page.goto(URL);
    await expect(page.getByTestId('unit-price-history-page')).toBeVisible();
    await expect(page.getByTestId('pricing-demo-warning')).toBeVisible();
    const options = page.getByTestId('price-unit-option');
    await expect(options.first()).toBeVisible();
    await options.first().click();
    await expect(page).toHaveURL(/\/inv\/unit-price-history\?record=unt_/);
    await expect(page.getByTestId('price-baseline')).toBeVisible();
    await expect(page.getByTestId('price-baseline')).toContainText(locale === 'en-PK' ? 'Fictional seed baseline' : 'فرضی ابتدائی قیمت');
    await expect(page.getByTestId('unit-price-history-page')).toContainText(locale === 'en-PK' ? 'No approved price changes' : 'منظور شدہ تبدیلی');
    await page.reload();
    await expect(page.getByTestId('price-baseline')).toBeVisible();

    const { violations } = await scanA11y(page, testInfo, `e3-price-history-${locale}`);
    expect(violations).toEqual([]);

    await page.getByTestId('price-unit-search').fill('NOT-A-REAL-UNIT');
    await expect(page.getByTestId('price-unit-options')).toHaveCount(0);
    await expect(page.getByTestId('price-visible-count')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
}

test('INV-006: a project-limited sales reader cannot open Gardens price by direct URL or API', async ({ page, consoleErrors }) => {
  await seed(page, { persona: 'sales' });
  await page.goto(`${URL}?record=unt_lg_p1_001`);
  await expect(page.getByTestId('state-error')).toBeVisible();
  const results = await page.evaluate(async () => {
    const call = async (id: string) => {
      try {
        await window.__prototype!.transport.request({ method: 'GET', path: `/units/${id}/prices` });
        return 'exposed';
      } catch (error) {
        const e = error as { problem?: { code: string; status: number; changed: boolean; correlationId?: string } };
        const { correlationId: _ignored, ...rest } = e.problem ?? {};
        return JSON.stringify(rest);
      }
    };
    return [await call('unt_lg_p1_001'), await call('unt_does_not_exist_e3')];
  });
  expect(results[0]).toBe(results[1]);
  expect(results[0]).not.toBe('exposed');
  expect(consoleErrors).toEqual([]);
});
