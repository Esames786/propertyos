import type { Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, seed, test, type Locale } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

/**
 * Stage 1.5R entry flow: Get started → explore the demo (role → preparing → ready → tour or explore)
 * and the simulated developer-workspace setup wizard. Every visitor here is a first-time visitor.
 */

const PASSWORD = 'Larkspur#2026';

async function expectClean(page: Page, label: string, testInfo: TestInfo) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

async function fillAccount(page: Page) {
  await page.getByLabel('Full name').fill('Sana Iqbal');
  await page.getByLabel('Work email').fill('sana@example.com');
  await page.getByLabel('Mobile number').fill('0399 1234567');
  await page.getByTestId('setup-password').fill(PASSWORD);
  await page.getByTestId('setup-confirm').fill(PASSWORD);
}

async function choose(page: Page, field: RegExp, option: string) {
  await page.getByRole('button', { name: field }).click();
  await page.getByRole('option', { name: option }).click();
}

async function openWizard(page: Page) {
  await page.goto(`${BO}/backoffice/get-started`);
  await page.getByTestId('choice-setup').click();
  await expect(page.getByTestId('setup-step-account')).toBeVisible();
}

test.describe('Get started (Stage 1.5R entry)', () => {
  test('a first visit to /backoffice lands on Get started with two equal choices', async ({ page, consoleErrors }) => {
    await seed(page, { persona: null, onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice`);
    await expect(page).toHaveURL(/\/backoffice\/get-started/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('main#main-content')).toHaveCount(1);
    await expect(page.getByTestId('choice-demo')).toBeVisible();
    await expect(page.getByTestId('choice-setup')).toBeVisible();
    await expect(page.getByTestId('demo-notice')).toContainText('Demo environment · fictional records · no real transactions');
    await expect(page.getByText('Illustrative image')).toBeVisible();

    // Accessibility preferences open in a dialog without leaving the page.
    await page.getByTestId('entry-accessibility').click();
    await expect(page.getByRole('dialog', { name: 'Accessibility preferences' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // A deep link is carried to sign-in.
    await page.goto(`${BO}/backoffice/get-started?next=${encodeURIComponent('/backoffice/crm/leads-list')}`);
    await expect(page.getByTestId('get-started-sign-in')).toHaveAttribute('href', /next=%2Fbackoffice%2Fcrm%2Fleads-list/);
    expect(consoleErrors).toEqual([]);
  });

  test('explore demo: role → real preparation → ready → Start tour opens the tour on the dashboard', async ({ page, consoleErrors }) => {
    // Normal simulated latency, so the preparation checklist is visible while requests resolve.
    await seed(page, { persona: null, onboarding: 'fresh', mock: 'normal' });
    await page.goto(`${BO}/backoffice/get-started`);
    await page.getByTestId('choice-demo').click();
    await expect(page.getByTestId('demo-role-step')).toBeVisible();
    await expect(page.getByTestId('demo-role-manager')).toContainText('Nadia Rahman');
    await expect(page.getByTestId('demo-role-sales')).toContainText('Bilal Ahmed');
    await expect(page.getByTestId('demo-role-finance')).toContainText('Farah Javed');
    await page.getByTestId('demo-fresh').click();
    await page.getByTestId('demo-continue').click();

    await expect(page).toHaveURL(/step=preparing/);
    await expect(page.getByTestId('demo-checklist')).toBeVisible();
    await expect(page.getByTestId('demo-task-identity')).toHaveAttribute('data-state', 'done');
    await expect(page.getByTestId('demo-task-reset')).toBeVisible();
    await expect(page.getByTestId('demo-task-pipeline')).toBeVisible(); // the manager sees leads

    await expect(page.getByTestId('demo-ready-step')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/step=ready/);
    await expect(page.getByRole('heading', { level: 1, name: 'Your demo is ready' })).toBeFocused();
    await expect(page.getByTestId('demo-count-projects')).toContainText('2');
    await expect(page.getByTestId('demo-count-leads')).toContainText('120');

    await page.getByTestId('demo-start-tour').click();
    await expect(page).toHaveURL(/\/backoffice\/home\/role-aware-dashboard/);
    await expect(page.getByTestId('tour-card')).toBeVisible();
    await expect(page.getByRole('dialog', { name: /welcome,/i })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('explore on my own lands on the start page with no welcome dialog', async ({ page, consoleErrors }) => {
    await seed(page, { persona: null, onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice/get-started/demo`);
    await page.getByTestId('demo-role-finance').click();
    await page.getByTestId('demo-continue').click();
    await expect(page.getByTestId('demo-ready-step')).toBeVisible({ timeout: 15_000 });
    // Finance cannot see leads: those counts are not shown.
    await expect(page.getByTestId('demo-count-customers')).toBeVisible();
    await expect(page.getByTestId('demo-count-leads')).toHaveCount(0);
    await page.getByTestId('demo-explore').click();
    await expect(page).toHaveURL(/\/backoffice\/home\/role-aware-dashboard/);
    await expect(page.getByTestId('management-dashboard')).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByRole('dialog', { name: /welcome/i })).toHaveCount(0);
    await expect(page.getByTestId('tour-card')).toHaveCount(0);

    // The decision is remembered: a reload does not ask again.
    await page.reload();
    await expect(page.getByTestId('management-dashboard')).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByRole('dialog', { name: /welcome/i })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('a deep link survives the demo path, and "ready" without an identity returns to the role choice', async ({ page }) => {
    await seed(page, { persona: null, onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice/get-started/demo?step=ready`);
    await expect(page.getByTestId('demo-role-step')).toBeVisible();
    await expect(page).not.toHaveURL(/step=ready/);

    await page.goto(`${BO}/backoffice/crm/leads-list`);
    await expect(page).toHaveURL(/get-started\?next=%2Fbackoffice%2Fcrm%2Fleads-list/);
    await page.getByTestId('choice-demo').click();
    await page.getByTestId('demo-role-sales').click();
    await page.getByTestId('demo-continue').click();
    await page.getByTestId('demo-explore').click();
    await expect(page).toHaveURL(/\/backoffice\/crm\/leads-list/);
  });

  test('wizard: validation summary on an empty Next', async ({ page }) => {
    await seed(page, { persona: null, onboarding: 'fresh' });
    await openWizard(page);
    await expect(page.getByTestId('setup-simulation-note').first()).toBeVisible();
    await page.getByTestId('setup-account-next').click();
    const summary = page.getByTestId('validation-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toBeFocused();
    await expect(summary.getByRole('listitem')).toHaveCount(5);
    await expect(page.getByTestId('setup-step-account')).toBeVisible();
    // Weak password rules use the shared messages.
    await page.getByTestId('setup-password').fill('abcdefghijkl');
    await page.getByTestId('setup-confirm').fill('abcdefghijkx');
    await page.getByTestId('setup-account-next').click();
    await expect(page.getByText('Add a number or symbol to make the password stronger.').first()).toBeVisible();
  });

  test('wizard: Back keeps values and switching to Urdu mid-step keeps typed values', async ({ page, consoleErrors }) => {
    await seed(page, { persona: null, onboarding: 'fresh' });
    await openWizard(page);
    await fillAccount(page);

    // The draft is mirrored for reloads, but never with the password.
    const stored = await page.evaluate(() => sessionStorage.getItem('demo:setup-draft'));
    expect(stored).toContain('sana@example.com');
    expect(stored).not.toContain(PASSWORD);

    // Language switch in the middle of the step: nothing typed is lost, the layout turns RTL.
    await page.getByTestId('locale-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ur-PK');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByLabel('پورا نام')).toHaveValue('Sana Iqbal');
    await expect(page.getByLabel('دفتری ای میل')).toHaveValue('sana@example.com');
    await expect(page.getByTestId('setup-password')).toHaveValue(PASSWORD);
    await expect(page.getByTestId('setup-confirm')).toHaveValue(PASSWORD);

    await page.getByTestId('setup-account-next').click();
    await expect(page.getByTestId('setup-step-verify')).toBeVisible();
    await expect(page.getByTestId('setup-verify-email')).toHaveText('sana@example.com');

    // Back to the account step: every value is still there, including the in-memory password.
    await page.getByTestId('setup-verify-back').click();
    await expect(page.getByTestId('setup-step-account')).toBeVisible();
    await expect(page.getByLabel('پورا نام')).toHaveValue('Sana Iqbal');
    await expect(page.getByTestId('setup-password')).toHaveValue(PASSWORD);

    // Switch back to English: still kept.
    await page.getByTestId('locale-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-PK');
    await expect(page.getByLabel('Full name')).toHaveValue('Sana Iqbal');
    await expect(page.getByLabel('Work email')).toHaveValue('sana@example.com');
    expect(consoleErrors).toEqual([]);
  });

  test('wizard happy path: wrong code, 246810, skip project, skip team, review, done, open the demo workspace', async ({ page, consoleErrors }) => {
    await seed(page, { persona: null, onboarding: 'fresh' });
    await openWizard(page);
    await fillAccount(page);
    await page.getByTestId('setup-account-next').click();

    // Verify: the screen says plainly that nothing is sent and shows the prototype code.
    await expect(page.getByTestId('setup-step-verify')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expect(page.getByTestId('setup-verify-notice')).toContainText('No email or SMS is sent in this prototype');
    await expect(page.getByTestId('setup-verify-code')).toHaveText('246810');
    await page.getByTestId('setup-code').fill('123456');
    await page.getByTestId('setup-verify-next').click();
    await expect(page.getByTestId('setup-form-verify').getByText('That code doesn’t match. In this prototype the code is 246810.')).toBeVisible();
    await expect(page.getByTestId('setup-step-verify')).toBeVisible();
    await page.getByTestId('setup-code').fill('246810');
    await page.getByTestId('setup-verify-next').click();

    // Organisation.
    await expect(page.getByTestId('setup-step-organisation')).toBeVisible();
    await page.getByLabel('Company name').fill('Crescent Builders (Pvt) Ltd');
    await choose(page, /Organisation type/, 'Private limited company');
    await choose(page, /Head-office city/, 'Lahore');
    await expect(page.getByText('Pakistani rupee (PKR)')).toBeVisible();
    await page.getByTestId('setup-organisation-next').click();

    // First project and team are optional.
    await expect(page.getByTestId('setup-step-project')).toBeVisible();
    await page.getByTestId('setup-project-skip').click();
    await expect(page.getByTestId('setup-step-team')).toBeVisible();
    await page.getByTestId('setup-team-skip').click();

    // Review shows every section with an Edit link.
    await expect(page.getByTestId('setup-step-review')).toBeVisible();
    await expect(page.getByTestId('review-account')).toContainText('sana@example.com');
    await expect(page.getByTestId('review-organisation')).toContainText('Crescent Builders (Pvt) Ltd');
    await expect(page.getByTestId('review-project')).toContainText('skipped');
    await expect(page.getByTestId('review-team')).toContainText('skipped');
    await expect(page.getByRole('button', { name: 'Edit Organisation' })).toBeVisible();
    await page.getByTestId('setup-review-next').click();

    // Done: says it is a simulation, nothing provisioned; the draft is cleared.
    await expect(page.getByTestId('setup-done')).toBeVisible();
    await expect(page.getByTestId('setup-done-body')).toContainText('Nothing was provisioned');
    expect(await page.evaluate(() => sessionStorage.getItem('demo:setup-draft'))).toBeNull();

    await page.getByTestId('setup-open-demo').click();
    await expect(page).toHaveURL(/\/backoffice\/home\/role-aware-dashboard/);
    await expect(page.getByTestId('tour-card')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('wizard: Edit from review returns to review, and a team needs valid, distinct emails', async ({ page }) => {
    await seed(page, { persona: null, onboarding: 'fresh' });
    await openWizard(page);
    await fillAccount(page);
    await page.getByTestId('setup-account-next').click();
    await page.getByTestId('setup-code').fill('246810');
    await page.getByTestId('setup-verify-next').click();
    await page.getByLabel('Company name').fill('Crescent Builders (Pvt) Ltd');
    await choose(page, /Organisation type/, 'Partnership');
    await choose(page, /Head-office city/, 'Karachi');
    await page.getByTestId('setup-organisation-next').click();

    await page.getByLabel('Project name').fill('Crescent Residency');
    await page.getByText('Apartment towers').click();
    await page.getByLabel('Expected number of units').fill('240');
    await page.getByTestId('setup-project-next').click();

    await page.getByLabel('Email of person 1').fill('ali@example.com');
    await choose(page, /Role of person 1/, 'Sales: leads and units');
    await page.getByTestId('setup-team-add').click();
    await expect(page.getByLabel('Email of person 2')).toBeFocused();
    await page.getByLabel('Email of person 2').fill('ALI@example.com');
    await choose(page, /Role of person 2/, 'Finance: invoices and receipts');
    await page.getByTestId('setup-team-next').click();
    await expect(page.getByText('This email is already in the list.').first()).toBeVisible();
    await page.getByLabel('Email of person 2').fill('sara@example.com');
    await page.getByTestId('setup-team-next').click();

    await expect(page.getByTestId('review-project')).toContainText('Crescent Residency');
    await expect(page.getByTestId('review-team')).toContainText('sara@example.com');
    await page.getByTestId('review-organisation-edit').click();
    await expect(page.getByTestId('setup-step-organisation')).toBeVisible();
    await expect(page.getByLabel('Company name')).toHaveValue('Crescent Builders (Pvt) Ltd');
    await page.getByLabel('Company name').fill('Crescent Developers');
    await page.getByRole('button', { name: 'Save and return to review' }).click();
    await expect(page.getByTestId('setup-step-review')).toBeVisible();
    await expect(page.getByTestId('review-organisation')).toContainText('Crescent Developers');
  });

  for (const [locale, vp] of [
    ['en-PK', 'desktop'],
    ['ur-PK', 'phone'],
  ] as Array<[Locale, 'desktop' | 'phone']>) {
    test(`axe: entry screens are clean (${locale}, ${vp})`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize(VIEWPORTS[vp]);
      await seed(page, { persona: null, onboarding: 'fresh', locale });
      await page.goto(`${BO}/backoffice/get-started`);
      await expect(page.getByTestId('choice-demo')).toBeVisible();
      await expectClean(page, `${locale}-${vp}-get-started`, testInfo);

      await page.getByTestId('choice-demo').click();
      await expect(page.getByTestId('demo-role-step')).toBeVisible();
      await expectClean(page, `${locale}-${vp}-demo-role`, testInfo);
      await page.getByTestId('demo-continue').click();
      await expect(page.getByTestId('demo-overview')).toBeVisible({ timeout: 15_000 });
      await expectClean(page, `${locale}-${vp}-demo-ready`, testInfo);

      await page.goto(`${BO}/backoffice/get-started/setup`);
      await page.getByTestId('setup-account-next').click();
      await expect(page.getByTestId('validation-summary')).toBeVisible();
      await expectClean(page, `${locale}-${vp}-setup-account-errors`, testInfo);
    });
  }
});
