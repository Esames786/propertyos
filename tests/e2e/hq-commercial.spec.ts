import type { Page } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { expect, HQ, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate B remaining scope in Platform HQ: versioned commercial configuration with maker-checker,
 * rate cards, the module catalogue, signup policy and workspace requests, contract amendments with
 * impact preview and history, usage evidence and billing, preview on a later date, and the audit log.
 */
async function seedHq(page: Page, persona: PersonaId = 'supreme_admin', locale: Locale = 'en-PK') {
  await seed(page, { app: 'platform', persona, locale });
}

/** Switch the demo identity in the same tab (same session data), declining the first-login welcome. */
async function switchTo(page: Page, persona: PersonaId) {
  await page.goto(`${HQ}/hq/more`);
  await page.getByTestId(`more-role-${persona}`).click();
  await page.getByTestId('welcome-explore').click();
}

test.describe('Versioned commercial configuration (maker-checker)', () => {
  test('Supreme Admin drafts a stricter policy; only another approver puts it in force; the audit log shows each step', async ({ page, consoleErrors }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/policies`);
    await expect(page.getByTestId('config-in-force')).toContainText('cp-2026.10-1');
    await expect(page.getByTestId('policy-maxDiscountPct')).toHaveText('15%');

    await page.getByTestId('config-new').click();
    await expect(page.getByTestId('config-draft')).toBeVisible();
    const discount = page.getByTestId('policy-input-maxDiscountPct').getByRole('textbox');
    await discount.fill('10');
    await discount.press('Tab');
    // Submitting without a reason is refused by the server, field by field.
    await page.getByTestId('config-submit').click();
    await expect(page.getByTestId('config-problems')).toContainText('Give a reason');
    await page.getByTestId('config-reason').getByRole('textbox').fill('Tighter discounts after the Q3 review');
    await page.getByTestId('config-submit').click();
    await expect(page.getByTestId('config-draft')).toHaveCount(0);
    const v2 = page.getByTestId('config-version-2');
    await expect(v2).toHaveAttribute('data-status', 'pending_approval');
    await expect(v2).toContainText('Waiting for an approver');
    await v2.getByTestId('config-changes-2-toggle').click();
    await expect(v2).toContainText('maxDiscountPct');

    await switchTo(page, 'commercial_approver');
    await page.goto(`${HQ}/hq/policies`);
    await page.getByTestId('config-approve-2').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByTestId('config-version-2')).toHaveAttribute('data-status', 'in_force');
    await expect(page.getByTestId('policy-maxDiscountPct')).toHaveText('10%');

    await page.goto(`${HQ}/hq/audit?category=configuration`);
    const log = page.getByTestId('audit-log');
    await expect(log.locator('[data-action="configApproved"]')).toContainText('Ayesha Siddiqui approved');
    await expect(log.locator('[data-action="configSubmitted"]')).toContainText('usr_hq_0001');
    expect(consoleErrors).toEqual([]);
  });

  test('the approver reads rate cards but cannot change them; support reads the catalogue and its dependencies', async ({ page, browser }) => {
    await seedHq(page, 'commercial_approver');
    await page.goto(`${HQ}/hq/rate-cards`);
    await expect(page.getByTestId('rate-line-rc_unit_eligible')).toContainText('Rs 40.00');
    await expect(page.getByTestId('config-new')).toHaveCount(0);
    // Platform support (a separate browser session) has no pricing rights but reads the catalogue.
    const support = await browser.newPage();
    await seedHq(support, 'platform_support');
    await support.goto(`${HQ}/hq/catalogue?tab=dependencies`);
    await expect(support.getByTestId('dependency-sales')).toContainText('Sales inventory');
    await expect(support.getByTestId('dependency-sales')).toContainText('Receivables');
    await support.getByRole('tab', { name: 'Modules' }).click();
    await expect(support.getByTestId('catalogue-module-inventory')).toContainText('Per site');
    await support.close();
  });
});

test.describe('Signup policy and workspace requests', () => {
  test('a request shows what the policy says; approving opens a prefilled tenant draft', async ({ page, consoleErrors }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/requests`);
    const sunfield = page.getByTestId('request-req_sunfield');
    await expect(page.getByTestId('request-outcome-req_sunfield')).toContainText('Approval required');
    await page.getByTestId('request-approve-req_sunfield').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
    await expect(sunfield).toHaveAttribute('data-status', 'approved');
    await page.getByTestId('request-continue-req_sunfield').click();
    await expect(page).toHaveURL(/\/hq\/tenants\/new\?draft=/);
    await page.goto(`${HQ}/hq/requests?tab=signup`);
    await expect(page.getByTestId('signup-community')).toContainText('Approval required');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Contract amendments (HQ-011, HQ-008)', () => {
  test('history shows Larkspur version 1 replaced by version 2 with what changed', async ({ page }) => {
    await seedHq(page, 'platform_support');
    await page.goto(`${HQ}/hq/tenants/tnt_larkspur?tab=subscription`);
    await expect(page.getByTestId('contract-version-2')).toHaveAttribute('data-display', 'in_force');
    await expect(page.getByTestId('contract-version-1')).toHaveAttribute('data-display', 'superseded');
    await page.getByTestId('contract-changes-2-toggle').click();
    await expect(page.getByTestId('contract-version-2')).toContainText('online_payments');
    await expect(page.getByTestId('t360-amend')).toHaveCount(0);
  });

  test('adding a priced module previews the impact, waits for a second person, then is scheduled', async ({ page, consoleErrors }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/tenants/tnt_larkspur?tab=subscription`);
    await page.getByTestId('t360-amend').click();
    await expect(page.getByTestId('amend-page')).toBeVisible();
    await page.getByTestId('amend-modules').getByText('Public website', { exact: true }).click();
    const impact = page.getByTestId('amend-impact');
    await expect(page.getByTestId('amend-module-changes')).toContainText('Public website');
    await expect(page.getByTestId('amend-delta')).toContainText('+Rs 15,000.00');
    await expect(page.getByTestId('amend-access-sales')).toContainText('No change');
    await expect(impact).toContainText('Evaluated with rate card rc-2026.01-1');
    await page.getByTestId('amend-reason').getByRole('textbox').fill('Website for the Gardens launch');
    await page.getByTestId('amend-submit').click();
    await expect(page).toHaveURL(/tab=subscription/);
    await expect(page.getByTestId('contract-version-3')).toHaveAttribute('data-display', 'scheduled');
    await expect(page.getByTestId('contract-version-3')).toContainText('from 1 Nov 2026');
    await expect(page.getByTestId('t360-amend')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('a scheduled change can be withdrawn; Shalimar’s November modules show as scheduled', async ({ page }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/tenants/tnt_shalimar?tab=modules`);
    await expect(page.getByTestId('t360-grant-residents')).toContainText('Scheduled');
    await page.goto(`${HQ}/hq/tenants/tnt_shalimar?tab=subscription`);
    await expect(page.getByTestId('contract-version-2')).toHaveAttribute('data-display', 'scheduled');
    await page.getByTestId('contract-withdraw-2').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Withdraw this change' }).click();
    await expect(page.getByTestId('contract-version-2')).toHaveAttribute('data-display', 'withdrawn');
  });

  test('preview as client on the change date shows the scheduled areas and the society’s own words', async ({ page }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/tenants/tnt_shalimar/preview?role=administrator`);
    await expect(page.getByTestId('preview-area-residents')).toHaveAttribute('data-status', 'notInPlan');
    await expect(page.getByTestId('preview-nav')).toContainText('People & Contacts');
    await page.goto(`${HQ}/hq/tenants/tnt_shalimar/preview?role=administrator&at=2026-11-01`);
    await expect(page.getByTestId('preview-area-residents')).toHaveAttribute('data-status', 'available');
    await expect(page.getByTestId('preview-nav')).toContainText('Owners & Residents');
  });
});

test.describe('Usage meters, evidence and billing (HQ-014, HQ-015)', () => {
  test('a corrected count and its evidence; the month’s calculation from counted quantities', async ({ page, consoleErrors }) => {
    await seedHq(page, 'platform_support');
    await page.goto(`${HQ}/hq/tenants/tnt_riverbend?tab=usage`);
    const oct = page.getByTestId('snapshot-snp_riverbend_units_eligible_202610');
    await expect(oct).toContainText('228');
    await expect(oct).toContainText('Corrected');
    await page.getByTestId('snapshot-evidence-snp_riverbend_units_eligible_202610').click();
    const drawer = page.getByTestId('meter-evidence');
    await expect(drawer).toContainText('Corrected from 232 to 228');
    await expect(page.getByTestId('evidence-excluded')).toContainText('Merged into the neighbouring flat');
    await expect(drawer).not.toContainText(/@example\.com|\+92399/);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('t360-billing-quantities')).toContainText('declared 232');

    await page.goto(`${HQ}/hq/tenants/tnt_crescent?tab=usage&drawer=meter-evidence&snapshot=snp_crescent_units_registered_202610`);
    await expect(page.getByTestId('evidence-excluded')).toContainText('CB-IMPORT-001');
    await expect(page.getByTestId('evidence-excluded')).toContainText('No site');
    expect(consoleErrors).toEqual([]);
  });
});

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  for (const vp of ['desktop', 'phone'] as const) {
    test(`axe: commercial pages (${locale}, ${vp})`, async ({ page }, testInfo) => {
      // Many pages scanned in one test (usually 30–50 s); a budget like the other multi-screen axe tests.
      test.setTimeout(150_000);
      await page.setViewportSize(VIEWPORTS[vp]);
      await seedHq(page, 'supreme_admin', locale);
      const failures: string[] = [];
      for (const [label, path, ready] of [
        ['policies', '/hq/policies', 'policy-thresholds'],
        ['rate-cards', '/hq/rate-cards', 'rate-card-lines'],
        ['catalogue', '/hq/catalogue?tab=dependencies', 'catalogue-dependencies'],
        ['requests', '/hq/requests', 'requests-list'],
        ['audit', '/hq/audit', 'audit-log'],
        ['amend', '/hq/tenants/tnt_larkspur/contracts/new', 'amend-impact'],
        ['usage', '/hq/tenants/tnt_riverbend?tab=usage', 't360-billing'],
        ['history', '/hq/tenants/tnt_larkspur?tab=subscription', 't360-contract-history'],
      ] as const) {
        await page.goto(`${HQ}${path}`);
        await page.getByTestId(ready).waitFor();
        const { violations } = await scanA11y(page, testInfo, `${locale}-${vp}-${label}`);
        for (const v of violations) failures.push(`${label}: ${v.id} (${v.nodes}) ${v.targets.join(' | ')}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 0) failures.push(`${label}: horizontal overflow ${overflow}px`);
      }
      expect(failures).toEqual([]);
    });
  }
}
