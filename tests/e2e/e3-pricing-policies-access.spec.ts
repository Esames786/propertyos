import { BO, expect, seed, test } from '../support/fixtures';

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`COM-003: ungranted pricing policy route cannot disclose rules (${locale})`, async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'sales', locale });
    await page.goto(`${BO}/backoffice/com/pricing-policies?record=prp_000001`);
    await expect(page.getByTestId('pricing-policies-page')).toHaveCount(0);
    if (locale === 'ur-PK') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const results = await page.evaluate(async () => {
      const requests = [
        { method: 'GET' as const, path: '/pricing/policies' },
        { method: 'GET' as const, path: '/pricing/policies/prp_000001' },
        {
          method: 'POST' as const, path: '/pricing/policies',
          body: { projectId: 'prj_heights', title: 'Unauthorized rate', rules: [{
            unitType: 'residential', baseRate: { amount: '100.00', currency: 'PKR' },
            floorRiseBps: 0, cornerPremiumBps: 0, parkFacingPremiumBps: 0,
          }] },
        },
      ];
      const results: Array<{ status: number; changed: boolean } | 'EXPOSED'> = [];
      for (const req of requests) {
        try {
          await window.__prototype!.transport.request(req);
          results.push('EXPOSED');
        } catch (error) {
          const p = (error as { problem: { status: number; changed: boolean } }).problem;
          results.push({ status: p.status, changed: p.changed });
        }
      }
      return results;
    });
    expect(results).toEqual([
      { status: 403, changed: false },
      { status: 403, changed: false },
      { status: 403, changed: false },
    ]);
    expect(consoleErrors).toEqual([]);
  });
}
