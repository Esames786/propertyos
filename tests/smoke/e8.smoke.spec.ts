import type { Page } from '@playwright/test';
import { BO, expect, seed, test, waitForApp, type PersonaId } from '../support/fixtures';
import { layoutProblems } from '../support/layout';

/**
 * Gate E.8 cross-browser smoke (Firefox and WebKit projects): a submitted supplier bill approved by a
 * second person keeps "posting planned" and "not settled"; the budget holder sees his cost centre only;
 * a supplier reader without the bank permission sees no account; the bills list at 320 px with 200 %
 * text in Urdu. No searchable picker is typed into here (the known WebKit fill-then-click flake); the
 * full checks run in Chromium (tests/e2e/e8-payables.spec.ts). Business date: 26 October 2026.
 */
const LK = 'tnt_larkspur';
const onboarding = (persona: string) =>
  JSON.stringify({ profile: { tenantId: LK, personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

async function at(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
}

async function as(page: Page, persona: string, path: string, ready: string) {
  if (!page.url().startsWith(BO)) await page.goto(`${BO}/backoffice/global/my-access`);
  await page.evaluate(
    ({ persona, value, tenant }) => {
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
      localStorage.setItem(`onboarding:v1:${tenant}:${persona}:backoffice`, value);
    },
    { persona, value: onboarding(persona), tenant: LK },
  );
  await waitForApp(page);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

/** Firefox's own cancelled font request (NS_BINDING_ABORTED) is the browser, not the app. */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

test('a submitted bill is approved by someone else and stays "posting planned" and "not settled"', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await at(page);
  await seed(page, { persona: 'lsp_accounts' as PersonaId });
  await as(page, 'lsp_accounts', '/backoffice/sup/supplier-bill-workspace?record=sbl_lsp_0002', 'pay-bill-workspace');
  await expect(page.getByTestId('pay-bill-approve')).toHaveCount(0);
  await as(page, 'lsp_finance_controller', '/backoffice/sup/supplier-bill-workspace?record=sbl_lsp_0002', 'pay-bill-workspace');
  await page.getByTestId('pay-bill-approve').click();
  await expect(page.getByTestId('pay-bill-workspace')).toHaveAttribute('data-state', 'approved');
  await expect(page.getByTestId('bill-state')).toContainText('Approved obligation — not paid');
  await expect(page.getByTestId('posting-state').first()).toContainText('Posting planned');
  await expect(page.getByTestId('settlement-state').first()).toContainText('Not settled — no evidence');
  await expect(page.getByTestId('pay-bill-post')).toBeDisabled();
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('the Heights budget holder sees Heights expenses only; a reader without bank.view sees no account', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await at(page);
  await seed(page, { persona: 'lsp_budget_holder' as PersonaId });
  await as(page, 'lsp_budget_holder', '/backoffice/exp/expenses-list', 'pay-expense-list');
  const ccs = await page.getByTestId('pay-expense').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-cc')))]);
  expect(ccs).toEqual(['cc_heights']);
  await as(page, 'lsp_project_manager', '/backoffice/sup/supplier-360-workspace?record=sup_lsp_ravi', 'pay-supplier-360');
  await expect(page.getByTestId('bank-hidden')).toBeVisible();
  expect(await page.locator('main').innerText()).not.toMatch(/3307/);
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('Urdu, 320 px, text 200 %: the supplier bills and expenses lists are not clipped or spilled', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 700 });
  await at(page);
  await seed(page, { persona: 'lsp_accounts' as PersonaId, locale: 'ur-PK' });
  await page.addInitScript(() => localStorage.setItem('pref:display:v1:backoffice:tnt_larkspur:usr_lsp_0006', JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })));
  await as(page, 'lsp_accounts', '/backoffice/sup/supplier-bills-list', 'pay-bill-list');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(await layoutProblems(page)).toEqual([]);
  await page.goto(`${BO}/backoffice/exp/expenses-list`);
  await expect(page.getByTestId('pay-expense-list')).toBeVisible();
  expect(await layoutProblems(page)).toEqual([]);
  expect(appErrors(consoleErrors)).toEqual([]);
});
