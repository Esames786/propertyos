import { BO, expect, seed, test, waitForApp } from '../support/fixtures';

test.describe('English ⇄ Urdu (blueprint J7)', () => {
  test('switches lang/dir in place, keeps typed values and the open tab, and persists', async ({ page, consoleErrors }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab/forms`);
    await page.getByRole('textbox', { name: 'Full name' }).fill('Ayesha Malik');
    await page.getByRole('textbox', { name: 'Mobile number' }).fill('0300 1234567');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await page.getByTestId('locale-toggle').first().click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ur-PK');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('main h1')).toHaveText('فارم');
    await expect(page.getByRole('textbox', { name: 'پورا نام' })).toHaveValue('Ayesha Malik');
    // Normalised to international format when focus left the field; the number itself is kept.
    await expect(page.getByRole('textbox', { name: 'موبائل نمبر' })).toHaveValue('+92 300 1234567');
    await expect(page.getByTestId('live-polite')).toContainText('زبان اردو میں تبدیل ہو گئی۔');

    await page.reload();
    await waitForApp(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(consoleErrors).toEqual([]);
  });

  test('a deep-linked tab stays selected across the switch', async ({ page }) => {
    await seed(page, { persona: 'sales' });
    await page.goto(`${BO}/backoffice/lab/workspace?tab=documents`);
    await expect(page.getByRole('tab', { name: 'Documents' })).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('locale-toggle').first().click();
    await expect(page.getByRole('tab', { name: 'دستاویزات' })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/tab=documents/);
  });

  test('Latin references stay left-to-right and isolated inside Urdu', async ({ page }) => {
    await seed(page, { locale: 'ur-PK' });
    await page.goto(`${BO}/backoffice/lab/components`);
    const iban = page.locator('bdi[dir="ltr"]', { hasText: 'PK52 DEMO' });
    await expect(iban).toHaveCSS('direction', 'ltr');
    await expect(iban).toHaveCSS('unicode-bidi', 'isolate');
    const money = page.locator('[data-amount="12500000.50"]');
    await expect(money).toHaveText(/Rs\s12,500,000\.50/);
    await expect(money).toHaveAttribute('dir', 'ltr');
  });

  test('amounts never change with language; only presentation does', async ({ page }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice/lab/components`);
    const en = await page.locator('[data-amount="12500000.50"]').innerText();
    await page.getByTestId('locale-toggle').first().click();
    const ur = await page.locator('[data-amount="12500000.50"]').innerText();
    const digits = (s: string) => s.replace(/[^\d.]/g, '');
    expect(digits(ur)).toBe(digits(en));
    expect(digits(en)).toBe('12500000.50');
  });

  test('no translation key is missing in either language on Stage 1 pages', async ({ page }) => {
    await seed(page);
    for (const locale of ['en-PK', 'ur-PK']) {
      for (const path of ['/backoffice/lab', '/backoffice/lab/components', '/backoffice/lab/forms', '/backoffice/lab/states', '/backoffice/help/tours', '/backoffice/global/profile--preferences']) {
        await page.goto(`${BO}${path}`);
        await waitForApp(page);
        if ((await page.locator('html').getAttribute('lang')) !== locale) await page.getByTestId('locale-toggle').first().click();
      }
    }
    const missing = await page.evaluate(() => window.__prototype!.missingKeys());
    expect(missing).toEqual([]);
  });
});
