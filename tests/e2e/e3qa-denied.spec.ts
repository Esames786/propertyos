import { readFileSync } from 'node:fs';
import { BO, expect, seed, test } from '../support/fixtures';
import { installFaults, pricingSection, sentRequests } from '../support/e3-pricing';
import { HEIGHTS_UNIT } from '../support/e3-editors';

/**
 * Gate E.3 integration (Wave 2, Agent 2): every E.3 screen and the INV-007 drawer answer a refused person
 * with the access outcome, the way E.2, E.7 and E.13 do (DevScreen `refusal="outcome"`): the reason in
 * words, the module, no data, never the register's planned page, a blank page or a generic error.
 * Ordinary roles: `sales` (developer, unit.view, no pricing.manage) and `finance` (developer, no unit.view).
 */

const COM = [
  ['COM-001', '/backoffice/com/payment-plan-templates', 'payment-plan-templates-page', 'pt_000001'],
  ['COM-002', '/backoffice/com/payment-plan-builder', 'payment-plan-builder-page', null],
  ['COM-003', '/backoffice/com/pricing-policies', 'pricing-policies-page', 'prp_000001'],
  ['COM-004', '/backoffice/com/fees-and-discounts', 'fees-discounts-page', 'cdr_000001'],
  ['COM-005', '/backoffice/com/approval-rules', 'pricing-approval-rules-page', 'pad_000001'],
] as const;
const INV = [
  ['INV-006', '/backoffice/inv/unit-price-history', 'unit-price-history-page'],
  ['INV-007', '/backoffice/inv/edit-price-drawer', 'edit-price-drawer-page'],
] as const;
type Access = { access: { role: { title: string }; permission_missing: string } };
const ACCESS = (locale: string) => (JSON.parse(readFileSync(`packages/i18n/locales/${locale}/errors.json`, 'utf8')) as Access).access;

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`COM-001…005 without pricing.manage: the access outcome (role), with or without a record in the address (${locale})`, async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'sales', locale });
    for (const [id, path, testId, record] of COM) {
      await page.goto(`${BO}${path}`);
      const outcome = page.getByTestId('access-outcome');
      await expect(outcome, id).toHaveAttribute('data-reason', 'permission_missing');
      await expect(outcome, id).toHaveAttribute('data-module', 'inventory');
      await expect(page.getByRole('heading', { level: 1 }), id).toHaveText(ACCESS(locale).role.title);
      await expect(page.getByTestId('planned-screen'), id).toHaveCount(0);
      await expect(page.getByTestId(testId), id).toHaveCount(0);
      await expect(page.getByTestId('state-error'), id).toHaveCount(0);
      if (locale === 'ur-PK') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      const screen = await page.getByRole('main').innerText();
      if (record) {
        // A draft named in the address changes nothing: no existence signal, the same words.
        await page.goto(`${BO}${path}?record=${record}`);
        await expect(outcome, `${id} ?record`).toHaveAttribute('data-reason', 'permission_missing');
        expect(await page.getByRole('main').innerText(), `${id} ?record`).toBe(screen);
      }
    }
    expect(consoleErrors).toEqual([]);
  });

  test(`INV-006 and INV-007 without unit.view: the access outcome (role), even for a named unit (${locale})`, async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'finance', locale });
    for (const [id, path, testId] of INV) {
      for (const address of [path, `${path}?record=${HEIGHTS_UNIT}`]) {
        await page.goto(`${BO}${address}`);
        const outcome = page.getByTestId('access-outcome');
        await expect(outcome, address).toHaveAttribute('data-reason', /permission_missing|out_of_scope/);
        await expect(page.getByTestId('planned-screen'), id).toHaveCount(0);
        await expect(page.getByTestId(testId), id).toHaveCount(0);
        await expect(page.getByTestId('state-error'), id).toHaveCount(0);
      }
    }
    expect(consoleErrors).toEqual([]);
  });

  test(`INV-007 drawer without pricing.manage: the reason in the access outcome's words, no drafts asked for, no save (${locale})`, async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'sales', locale });
    await page.goto(`${BO}/backoffice/inv/edit-price-drawer`);
    await expect(page.getByTestId('edit-price-drawer-page')).toBeVisible();
    await installFaults(page);
    await page.getByTestId('price-change-unit').first().click();
    const drawer = page.getByTestId('edit-price-change-drawer');
    await expect(drawer).toBeVisible();
    const refused = page.getByTestId('price-change-no-pricing-permission');
    await expect(refused).toHaveAttribute('data-reason', 'permission_missing');
    await expect(refused).toContainText(ACCESS(locale).permission_missing);
    // The listed price stays readable (unit.view); proposing is not offered and no draft list is requested.
    await expect(drawer.getByTestId('state-error')).toHaveCount(0);
    await expect(page.getByTestId('price-change-save')).toHaveCount(0);
    await expect(page.getByTestId('price-change-proposed')).toHaveCount(0);
    expect((await sentRequests(page)).filter((r) => /price-change-drafts/.test(r.path))).toEqual([]);
    // Nothing of pricing is written (opening the unit itself is a recent record of E.13, as on every unit address).
    expect(await pricingSection(page, 'developer.pricing.price-change-drafts')).toBeNull();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
}
