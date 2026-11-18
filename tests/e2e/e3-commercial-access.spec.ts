import { BO, expect, seed, test } from '../support/fixtures';

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`COM-004: ungranted sales person cannot open commercial fee/discount drafts or preview (${locale})`, async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'sales', locale });
    await page.goto(`${BO}/backoffice/com/fees-and-discounts?record=cdr_000001`);
    await expect(page.getByTestId('fees-discounts-page')).toHaveCount(0);
    if (locale === 'ur-PK') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const result = await page.evaluate(async () => {
      const calls = [
        { method: 'GET' as const, path: '/pricing/commercial-rules' },
        { method: 'GET' as const, path: '/pricing/commercial-rules/cdr_000001' },
        { method: 'POST' as const, path: '/pricing/commercial-rules', body: { projectId: 'prj_heights', title: 'Unauthorized schedule', fees: [], discounts: [] } },
        { method: 'POST' as const, path: '/pricing/commercial-preview', body: { draftId: 'cdr_000001', unitId: 'unt_hidden' } },
      ];
      const replies = [];
      for (const request of calls) {
        try {
          await window.__prototype!.transport.request(request);
          replies.push('EXPOSED');
        } catch (error) {
          const problem = (error as { problem?: { status: number; changed: boolean } }).problem;
          replies.push(`${problem?.status}:${problem?.changed}`);
        }
      }
      return replies;
    });
    expect(result).toEqual(['403:false', '403:false', '403:false', '403:false']);
    expect(consoleErrors).toEqual([]);
  });
}
