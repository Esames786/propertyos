import { BO, expect, seed, test } from '../support/fixtures';

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`COM-005: unauthorized sales users cannot access private approval draft or fake activate (${locale})`, async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'sales', locale });
    await page.goto(`${BO}/backoffice/com/approval-rules?record=pad_000001`);
    await expect(page.getByTestId('pricing-approval-rules-page')).toHaveCount(0);
    if (locale === 'ur-PK') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const result = await page.evaluate(async () => {
      const calls = [
        { method: 'GET' as const, path: '/pricing/approval-rules' },
        { method: 'GET' as const, path: '/pricing/approval-rules/pad_000001' },
        { method: 'POST' as const, path: '/pricing/approval-rules', body: {
          projectId: 'prj_heights', title: 'Unauthorized approval draft',
          rules: [{ subject: 'unit_price_change', threshold: { amount: '0.00', currency: 'PKR' },
            requiredReviewers: 1, makerCheckerRequired: true, allowSelfApproval: false }],
        } },
      ];
      const answers: string[] = [];
      for (const req of calls) {
        try {
          await window.__prototype!.transport.request(req);
          answers.push('EXPOSED');
        } catch (err) {
          const issue = (err as { problem?: { status: number; changed: boolean } }).problem;
          answers.push(`${issue?.status}:${issue?.changed}`);
        }
      }
      return answers;
    });
    expect(result).toEqual(['403:false', '403:false', '403:false']);
    expect(consoleErrors).toEqual([]);
  });
}
