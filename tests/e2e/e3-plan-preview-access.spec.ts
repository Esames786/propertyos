import { BO, expect, seed, test } from '../support/fixtures';

/**
 * No existing user receives the new pricing.manage permission automatically.
 * This smoke test proves a planned Gate E.3 route is not disclosed to the existing
 * sales persona while the prototype's request gate refuses a direct API request.
 * Authorized builder interaction needs a separately approved pricing role and
 * a full integrated browser run after owner decisions E-07/E-30.
 */
test('COM-002: cannot access payment builder or calculate a unit price without pricing.manage', async ({ page, consoleErrors }) => {
  await seed(page, { persona: 'sales' });
  await page.goto(`${BO}/backoffice/com/payment-plan-builder`);
  await expect(page.getByTestId('payment-plan-builder-page')).toHaveCount(0);
  const response = await page.evaluate(async () => {
    try {
      await window.__prototype!.transport.request({
        method: 'POST', path: '/pricing/plan-preview',
        body: { unitId: 'unt_lh_a_0102', allocations: [{ kind: 'down_payment', shareBps: 10000 }] },
      });
      return { allowed: true };
    } catch (error) {
      const problem = (error as { problem: { status: number; code: string; changed: boolean } }).problem;
      return { allowed: false, status: problem.status, code: problem.code, changed: problem.changed };
    }
  });
  expect(response).toMatchObject({ allowed: false, status: 403, changed: false });
  expect(consoleErrors).toEqual([]);
});
