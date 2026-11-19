import { readFileSync } from 'node:fs';
import { expect, test } from '../support/fixtures';
import { seedPrincipal } from '../support/e3-pricing';
import { SCREENS } from '../support/e3-editors';

/**
 * Gate E.3 integration (Wave 2, Agent 2): in COM-004's preview a discount is unmistakably a deduction, in
 * English and Urdu: its line says "Deduction" in words (visible, so screen readers read it too) and its amount,
 * like the discount total, carries U+2212 MINUS SIGN inside the amount's LTR isolate (so in RTL the sign stays
 * on the amount: "−Rs …"). Fees and the listed price carry no sign.
 */
const MINUS = String.fromCharCode(0x2212);
const COM_004 = SCREENS.find((s) => s.id === 'COM-004')!;
const deductionWord = (locale: string) => (JSON.parse(readFileSync(`packages/i18n/locales/${locale}/pricing.json`, 'utf8')) as Record<string, string>).commercialDeduction!;

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`COM-004: discount lines and the discount total read as deductions; fees do not (${locale})`, async ({ page, consoleErrors }) => {
    await seedPrincipal(page, 'res_e3qa_pricing', { locale });
    await COM_004.prepare(page);
    const result = page.getByTestId('commercial-preview-result');
    const discount = result.locator('[data-testid="commercial-preview-line"][data-kind="discount"]');
    const fees = result.locator('[data-testid="commercial-preview-line"][data-kind="fee"]');
    await expect(discount).toHaveCount(1);
    await expect(fees).toHaveCount(2);
    await expect(discount).toContainText(deductionWord(locale));
    // The sign is the first character of the amount's own left-to-right isolate.
    const amount = discount.locator('bdi');
    await expect(amount).toHaveAttribute('dir', 'ltr');
    expect((await amount.innerText()).startsWith(MINUS)).toBe(true);
    for (const fee of await fees.all()) {
      await expect(fee).not.toContainText(deductionWord(locale));
      expect(await fee.locator('bdi').innerText()).not.toContain(MINUS);
    }
    const total = result.getByTestId('commercial-total-deduction').locator('bdi');
    await expect(total).toHaveAttribute('dir', 'ltr');
    expect((await total.innerText()).startsWith(MINUS)).toBe(true);
    // Only the discount line and the discount total carry a minus sign.
    expect(((await result.innerText()).match(new RegExp(MINUS, 'g')) ?? []).length).toBe(2);
    if (locale === 'ur-PK') {
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      // In RTL the sign is drawn at the amount's left edge (start of the LTR run), not across the line.
      const box = await amount.boundingBox();
      const signLeft = await amount.evaluate((el) => {
        const r = document.createRange();
        r.setStart(el.firstChild!, 0);
        r.setEnd(el.firstChild!, 1);
        return r.getBoundingClientRect().left;
      });
      expect(Math.abs(signLeft - box!.x)).toBeLessThan(2);
    }
    expect(consoleErrors).toEqual([]);
  });
}
