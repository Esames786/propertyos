import { BO, expect, seed, test } from '../support/fixtures';

test('COM-001: ungranted pricing templates remain inaccessible to existing developer sales staff', async ({ page, consoleErrors }) => {
  await seed(page, { persona: 'sales', locale: 'en-PK' });
  await page.goto(`${BO}/backoffice/com/payment-plan-templates`);
  await expect(page.getByTestId('payment-plan-templates-page')).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const paths = [
      { method: 'GET' as const, path: '/pricing/plan-templates' },
      { method: 'GET' as const, path: '/pricing/plan-templates/pt_000001' },
      { method: 'POST' as const, path: '/pricing/plan-templates', body: { projectId: 'prj_heights', title: 'Not authorized', allocations: [{ kind: 'down_payment', shareBps: 10000 }] } },
    ];
    const out = [];
    for (const request of paths) {
      try {
        await window.__prototype!.transport.request(request);
        out.push('EXPOSED');
      } catch (e) {
        const p = (e as { problem?: { status: number; changed: boolean } }).problem;
        out.push(`${p?.status}:${p?.changed}`);
      }
    }
    return out;
  });
  expect(result).toEqual(['403:false', '403:false', '403:false']);
  expect(consoleErrors).toEqual([]);
});

test('COM-001: Urdu RTL denied state does not expose a private pricing draft', async ({ page }) => {
  await seed(page, { persona: 'sales', locale: 'ur-PK' });
  await page.goto(`${BO}/backoffice/com/payment-plan-templates?record=pt_000001`);
  await expect(page.getByTestId('payment-plan-templates-page')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});
