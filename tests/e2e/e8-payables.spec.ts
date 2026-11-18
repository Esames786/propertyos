import type { Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { focusWalk, layoutProblems } from '../support/layout';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate E.8 (provisional, Wave 2): suppliers, payables and expenses in the office app, with Larkspur's
 * fictional people: Faiza Noor (accounts officer: the payables maker), Zubair Ansari (finance controller:
 * the checker), Rehan Saleem (the Larkspur Heights budget holder, cost-centre limited) and Mehwish Kazmi
 * (project manager: reads suppliers, no bank permission). Nadia (manager) already held supplier.view
 * from her starter set and reads suppliers only. The server's rules are tested in payables.api.test.ts;
 * these tests check the screens carry them. The demo's business date is Monday 26 October 2026.
 */
const LK = 'tnt_larkspur';
const PHONE = { width: 320, height: 700 };
const OFFICE_HEADER = '[data-testid="app-header"]';
const OFFICE_BAR = '[data-testid="bottom-nav"]';
const STAFF: Record<string, string> = { lsp_accounts: 'usr_lsp_0006', lsp_finance_controller: 'usr_lsp_0007', lsp_budget_holder: 'usr_lsp_0021', lsp_project_manager: 'usr_lsp_0005', manager: 'usr_lsp_0001' };
const OFFICE_DISPLAY = (principal: string) => `pref:display:v1:backoffice:${LK}:${principal}`;
const as = (id: string) => id as PersonaId;

const onboarding = (persona: string) =>
  JSON.stringify({ profile: { tenantId: LK, personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

/** Become another Larkspur person in the office app (the demo session in this tab is kept). */
async function become(page: Page, persona: string) {
  if (!page.url().startsWith(BO)) await page.goto(`${BO}/backoffice/global/my-access`);
  await page.evaluate(
    ({ persona, value, tenant }) => {
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
      localStorage.setItem(`onboarding:v1:${tenant}:${persona}:backoffice`, value);
    },
    { persona, value: onboarding(persona), tenant: LK },
  );
}

async function office(page: Page, persona: string, path: string, ready: string) {
  await become(page, persona);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function start(page: Page, persona = 'lsp_accounts', locale: Locale = 'en-PK') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await seed(page, { persona: as(persona), locale });
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const recordOf = (page: Page) => new URL(page.url()).searchParams.get('record')!;

/** A searchable picker: type part of the name, then choose the option. */
async function pick(page: Page, testId: string, text: string, option: RegExp) {
  const input = page.getByTestId(testId).locator('input');
  await input.click();
  await input.fill(text);
  await page.getByRole('option', { name: option }).first().click();
}

/** A plain select: open it, then choose the option. */
async function choose(page: Page, testId: string, option: RegExp) {
  await page.getByTestId(testId).locator('button').first().click();
  await page.getByRole('option', { name: option }).click();
}

test.describe('Gate E.8 — R3: supplier bill → approval by someone else → payment instruction, never settled', () => {
  test('Faiza records and submits a bill, Zubair approves it, Faiza instructs, Zubair approves, it is sent (simulated) and stays "Not settled — no evidence"', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(240_000);
    await start(page);
    await page.goto(`${BO}/backoffice/sup/new-supplier-bill`);
    await expect(page.getByTestId('pay-new-bill')).toBeVisible();
    await expect(page.getByTestId('pay-provisional')).toBeVisible();
    // Inline validation: nothing filled in, every problem shows at its field and nothing is created.
    await page.getByTestId('pay-bill-save').click();
    await expect(page.getByTestId('problem-fields')).toBeVisible();
    await expect(page.getByText('Choose a supplier from your list.').or(page.getByText('This field is required.')).first()).toBeVisible();
    await expect(page).toHaveURL(/new-supplier-bill/);

    await pick(page, 'pay-bill-supplier-select', 'Marg', /Margalla Steel Works/);
    await page.getByTestId('pay-bill-invoice-no').fill('MSW-2026-1101');
    await page.getByTestId('pay-bill-invoice-date').fill('2026-10-24');
    await page.getByTestId('pay-bill-due-date').fill('2026-11-23');
    await page.getByTestId('pay-line-0-description').fill('Binding wire and spacers — Tower B slab 6');
    await choose(page, 'pay-line-0-category', /^Materials$/);
    await pick(page, 'pay-line-0-cc', 'Heights', /Larkspur Heights/);
    await page.getByTestId('pay-line-0-amount').fill('245000');
    await expect(page.getByTestId('pay-bill-form-total')).toContainText('245,000');
    await page.getByTestId('pay-bill-form-evidence-sample').click();
    await expect(page.getByTestId('pay-bill-form-evidence-status')).toContainText('Demo invoice MSW-2026-1101');
    await axe(page, testInfo, 'e8-new-bill-filled');
    await page.getByTestId('pay-bill-save-submit').click();
    await expect(page.getByTestId('pay-bill-workspace')).toHaveAttribute('data-state', 'submitted');
    const billId = recordOf(page);
    // Approval, posting and settlement are three separate badges; the maker cannot approve.
    await expect(page.getByTestId('bill-state')).toHaveAttribute('data-state', 'submitted');
    await expect(page.getByTestId('posting-state').first()).toContainText('Posting planned');
    await expect(page.getByTestId('settlement-state').first()).toContainText('Not settled — no evidence');
    await expect(page.getByTestId('pay-bill-approve')).toHaveCount(0);
    await expect(page.getByTestId('pay-bill-post')).toBeDisabled();

    await office(page, 'lsp_finance_controller', `/backoffice/sup/supplier-bill-workspace?record=${billId}`, 'pay-bill-workspace');
    await page.getByTestId('pay-bill-approve').click();
    await expect(page.getByTestId('pay-bill-workspace')).toHaveAttribute('data-state', 'approved');
    await expect(page.getByTestId('bill-state')).toContainText('Approved obligation — not paid');
    await expect(page.getByTestId('pay-bill-obligation')).toBeVisible();
    await axe(page, testInfo, 'e8-bill-approved');

    await office(page, 'lsp_accounts', `/backoffice/sup/supplier-bill-workspace?record=${billId}`, 'pay-bill-workspace');
    await page.getByTestId('pay-bill-instruct').click();
    await expect(page.getByTestId('pay-new-payment')).toBeVisible();
    await expect(page.getByTestId('pay-new-payment-left')).toContainText('245,000');
    await page.getByTestId('pay-new-payment-amount').fill('245000');
    await page.getByTestId('pay-new-payment-save').click();
    await expect(page.getByTestId('pay-payment-view')).toHaveAttribute('data-state', 'prepared');
    await expect(page.getByTestId('pay-not-settled')).toBeVisible();
    await expect(page.getByTestId('pay-payment-approve')).toHaveCount(0);
    const paymentId = recordOf(page);
    await axe(page, testInfo, 'e8-payment-prepared');

    await office(page, 'lsp_finance_controller', `/backoffice/sup/supplier-payment-drawer?record=${paymentId}`, 'pay-payment-view');
    await page.getByTestId('pay-payment-approve').click();
    await expect(page.getByTestId('pay-payment-view')).toHaveAttribute('data-state', 'approved');
    await office(page, 'lsp_accounts', `/backoffice/sup/supplier-payment-drawer?record=${paymentId}`, 'pay-payment-view');
    await page.getByTestId('pay-payment-send').click();
    await expect(page.getByTestId('pay-payment-view')).toHaveAttribute('data-state', 'sent_simulated');
    await expect(page.getByTestId('pay-payment-view').getByTestId('payment-state')).toContainText('Sent (simulated) — not settled');
    await expect(page.getByTestId('pay-payment-view').getByTestId('settlement-state')).toContainText('Not settled — no evidence');

    // The ledger still owes the whole bill: an instruction is not a settlement.
    await page.goto(`${BO}/backoffice/sup/supplier-ledger?supplier=sup_lsp_margalla`);
    await expect(page.getByTestId('pay-ledger-balance')).toContainText('245,000');
    await expect(page.getByTestId('pay-ledger-instructions')).toContainText('Sent (simulated) — not settled');
    await expect(page.getByTestId('pay-ledger-posting')).toBeVisible();
    await axe(page, testInfo, 'e8-ledger');
    expect(consoleErrors).toEqual([]);
  });

  test('a double press of "Save as draft" makes one bill (one key per logical create)', async ({ page, consoleErrors }) => {
    await start(page);
    await page.goto(`${BO}/backoffice/sup/new-supplier-bill?supplier=sup_lsp_indus`);
    await page.getByTestId('pay-bill-invoice-no').fill('IEC-DOUBLE-1');
    await page.getByTestId('pay-bill-due-date').fill('2026-11-25');
    await page.getByTestId('pay-line-0-description').fill('Cable trays, Block C');
    await choose(page, 'pay-line-0-category', /^Contractors$/);
    await pick(page, 'pay-line-0-cc', 'Gardens', /Larkspur Gardens/);
    await page.getByTestId('pay-line-0-amount').fill('51000');
    await page.getByTestId('pay-bill-save').dblclick();
    await expect(page.getByTestId('pay-bill-workspace')).toHaveAttribute('data-state', 'draft');
    await page.goto(`${BO}/backoffice/sup/supplier-bills-list?q=IEC-DOUBLE-1`);
    await expect(page.getByTestId('pay-bill')).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Gate E.8 — maker ≠ checker, scope, the bank boundary and no oracle on screen', () => {
  test('the finance controller cannot decide his own claim; the reason is said in words', async ({ page, consoleErrors }) => {
    await start(page, 'lsp_finance_controller');
    await page.goto(`${BO}/backoffice/exp/expense-workspace?record=exp_lsp_0006`);
    await expect(page.getByTestId('pay-expense-workspace')).toBeVisible();
    await expect(page.getByTestId('pay-blocked')).toHaveAttribute('data-reason', 'own_claim');
    await expect(page.getByTestId('pay-expense-approve')).toHaveCount(0);
    await page.goto(`${BO}/backoffice/exp/expense-approvals`);
    await expect(page.getByTestId('pay-approvals-waiting').locator('[data-id="exp_lsp_0006"]')).toBeVisible();
    await expect(page.getByTestId('pay-approvals-decide').locator('[data-id="exp_lsp_0006"]')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('a supplier reader without the bank permission sees no account, bank name or digits', async ({ page, consoleErrors }) => {
    await start(page, 'lsp_project_manager');
    await page.goto(`${BO}/backoffice/sup/supplier-360-workspace?record=sup_lsp_ravi`);
    await expect(page.getByTestId('pay-supplier-360')).toBeVisible();
    await expect(page.getByTestId('bank-hidden')).toBeVisible();
    await expect(page.getByTestId('bank-line')).toHaveCount(0);
    expect(await page.locator('main').innerText()).not.toMatch(/3307|Demo Bank/);
    // Faiza (bank.view) sees the masked account.
    await office(page, 'lsp_accounts', '/backoffice/sup/supplier-360-workspace?record=sup_lsp_ravi', 'pay-supplier-360');
    await expect(page.getByTestId('bank-line')).toContainText('3307');
    expect(consoleErrors).toEqual([]);
  });

  test('the Heights budget holder sees Heights only; a hidden record and an invented one look the same', async ({ page, consoleErrors }) => {
    await start(page, 'lsp_budget_holder');
    await page.goto(`${BO}/backoffice/exp/expenses-list`);
    await expect(page.getByTestId('pay-expense-list')).toBeVisible();
    const ccs = await page.getByTestId('pay-expense').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-cc')))]);
    expect(ccs).toEqual(['cc_heights']);
    await expect(page.getByTestId('pay-scope-limited')).toBeVisible();
    await page.goto(`${BO}/backoffice/exp/expense-workspace?record=exp_lsp_0002`);
    await expect(page.getByTestId('state-not-found')).toBeVisible();
    const hidden = await page.locator('main').innerText();
    await page.goto(`${BO}/backoffice/exp/expense-workspace?record=exp_never_issued_e8`);
    await expect(page.getByTestId('state-not-found')).toBeVisible();
    expect(await page.locator('main').innerText()).toBe(hidden);
    // No supplier permission: the supplier screens are not his (the register's page answers).
    await page.goto(`${BO}/backoffice/sup/suppliers-list`);
    await expect(page.getByTestId('pay-suppliers')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('Nadia reads suppliers (her starter supplier.view) but records nothing and has no payables menu', async ({ page, consoleErrors }) => {
    await start(page, 'manager');
    await page.goto(`${BO}/backoffice/sup/suppliers-list`);
    await expect(page.getByTestId('pay-supplier-list')).toBeVisible();
    await expect(page.getByTestId('pay-new-supplier')).toHaveCount(0);
    await expect(page.locator('[data-tour-id="nav-primary"] a', { hasText: 'Suppliers and bills' })).toHaveCount(0);
    await page.goto(`${BO}/backoffice/sup/new-supplier-bill`);
    await expect(page.getByTestId('pay-new-bill-readonly')).toBeVisible();
    // No expense.view: the expense screens keep the register's page.
    await page.goto(`${BO}/backoffice/exp/expenses-list`);
    await expect(page.getByTestId('pay-expenses')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Gate E.8 — expenses, petty cash and budgets', () => {
  test('Rehan records a Heights petty-cash expense; Zubair approves it and witnesses the count; budget vs actual compares the approved version only', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(240_000);
    await start(page, 'lsp_budget_holder');
    await page.goto(`${BO}/backoffice/exp/new-expense`);
    await expect(page.getByTestId('pay-new-expense')).toBeVisible();
    await choose(page, 'pay-expense-category', /^Site running costs$/);
    await page.getByTestId('pay-expense-amount').fill('2750');
    await page.getByTestId('pay-expense-description').fill('Drinking water for site staff, week 43');
    await page.getByTestId('pay-expense-payee').fill('Aqua Supplies (Demo)');
    await page.getByTestId('pay-expense-paid-via').getByText(/^From a petty-\u2060?cash float$/).click();
    await pick(page, 'pay-expense-float', 'Heights', /Larkspur Heights site office float/);
    await page.getByTestId('pay-expense-form-evidence-sample').click();
    await page.getByTestId('pay-expense-save-submit').click();
    await expect(page.getByTestId('pay-expense-workspace')).toHaveAttribute('data-state', 'submitted');
    const expenseId = recordOf(page);
    await expect(page.getByTestId('pay-expense-approve')).toHaveCount(0);

    await office(page, 'lsp_finance_controller', '/backoffice/exp/expense-approvals', 'pay-approvals');
    await page.getByTestId('pay-approvals-decide').locator(`[data-id="${expenseId}"]`).getByTestId('pay-approval-approve').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByTestId('pay-approvals-recent').getByText('Approved obligation — not paid').first()).toBeVisible();

    await page.goto(`${BO}/backoffice/exp/petty-cash`);
    const heights = page.locator('[data-testid="pay-float"][data-id="pcf_lsp_heights"]');
    await expect(heights.getByTestId('pay-float-unknown')).toBeVisible();
    await heights.locator('[data-id="pcc_lsp_0001"]').getByTestId('pay-count-witness').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Witness the count' }).click();
    await expect(heights.getByTestId('pay-float-witnessed')).toContainText('31,250');
    await axe(page, testInfo, 'e8-petty-witnessed');

    // No approved budget yet: budget vs actual says so honestly; Zubair approves Rehan's version 1.
    await page.goto(`${BO}/backoffice/exp/budget-vs-actual`);
    await expect(page.getByTestId('state-empty')).toBeVisible();
    await page.goto(`${BO}/backoffice/exp/budget-workspace?record=bud_lsp_heights_fy27`);
    await page.getByTestId('pay-budget-approve').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Approve the version' }).click();
    await expect(page.getByTestId('pay-budget-version').first()).toHaveAttribute('data-state', 'approved');
    await page.goto(`${BO}/backoffice/exp/budget-vs-actual`);
    const row = page.getByTestId('pay-bva-budget').locator('[data-category="site_running"]');
    await expect(row).toContainText('1,200,000');
    await expect(row).toContainText('2,750');
    await expect(page.getByTestId('pay-bva-posting')).toBeVisible();
    await axe(page, testInfo, 'e8-bva');

    // Rehan cannot witness his own count or approve his own expense.
    await office(page, 'lsp_budget_holder', '/backoffice/exp/petty-cash', 'pay-petty');
    await page.getByTestId('pay-float-count').click();
    await page.getByTestId('pay-count-note-1000').fill('30');
    await page.getByTestId('pay-count-evidence-sample').click();
    await page.getByTestId('pay-count-save').click();
    const pending = page.locator('[data-testid="pay-count"][data-state="awaiting_witness"]');
    await expect(pending.getByTestId('pay-count-blocked')).toBeVisible();
    await expect(pending.getByTestId('pay-count-witness')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Both languages, every width, 320 px at 200 %, dark mode, the keyboard
// ---------------------------------------------------------------------------------------------

const SCREENS: Array<[string, string, string, string]> = [
  ['suppliers', 'lsp_accounts', '/backoffice/sup/suppliers-list', 'pay-supplier-list'],
  ['supplier-360', 'lsp_accounts', '/backoffice/sup/supplier-360-workspace?record=sup_lsp_ravi', 'pay-supplier-360'],
  ['bills', 'lsp_accounts', '/backoffice/sup/supplier-bills-list', 'pay-bill-list'],
  ['bill', 'lsp_finance_controller', '/backoffice/sup/supplier-bill-workspace?record=sbl_lsp_0004', 'pay-bill-workspace'],
  ['new-bill', 'lsp_accounts', '/backoffice/sup/new-supplier-bill', 'pay-new-bill'],
  ['payments', 'lsp_accounts', '/backoffice/sup/supplier-payment-drawer', 'pay-payments'],
  ['ledger', 'lsp_accounts', '/backoffice/sup/supplier-ledger?supplier=sup_lsp_ravi', 'pay-ledger-view'],
  ['utilities', 'lsp_accounts', '/backoffice/sup/utilities-bills-register', 'pay-utility-list'],
  ['expenses', 'lsp_accounts', '/backoffice/exp/expenses-list', 'pay-expense-list'],
  ['new-expense', 'lsp_accounts', '/backoffice/exp/new-expense', 'pay-new-expense'],
  ['expense', 'lsp_finance_controller', '/backoffice/exp/expense-workspace?record=exp_lsp_0004', 'pay-expense-workspace'],
  ['approvals', 'lsp_finance_controller', '/backoffice/exp/expense-approvals', 'pay-approvals'],
  ['petty-cash', 'lsp_finance_controller', '/backoffice/exp/petty-cash', 'pay-petty'],
  ['employee', 'lsp_accounts', '/backoffice/exp/employee-expenses', 'pay-employee-list'],
  ['budgets', 'lsp_accounts', '/backoffice/exp/budget-list', 'pay-budget-list'],
  ['budget', 'lsp_finance_controller', '/backoffice/exp/budget-workspace?record=bud_lsp_heights_fy27', 'pay-budget-workspace'],
  ['bva', 'lsp_budget_holder', '/backoffice/exp/budget-vs-actual', 'pay-bva'],
];

const lang = (locale: Locale) => (locale === 'ur-PK' ? 'ur' : 'en');

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`E.8 screens in ${lang(locale)}: axe at 1440 and 390 px, no sideways scroll`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(420_000);
    await start(page, 'lsp_accounts', locale);
    for (const [name, persona, path, ready] of SCREENS) {
      await become(page, persona);
      for (const [vp, size] of [['1440', VIEWPORTS.desktop], ['390', VIEWPORTS.phone]] as const) {
        await page.setViewportSize(size);
        await page.goto(`${BO}${path}`);
        await expect(page.getByTestId(ready).first()).toBeVisible();
        if (locale === 'ur-PK') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await axe(page, testInfo, `e8-${name}-${vp}-${locale}`);
        expect(await overflowOf(page), `${name} ${vp} ${locale}`).toBeLessThanOrEqual(0);
      }
    }
    expect(consoleErrors).toEqual([]);
  });

  test(`320 × 700, ${lang(locale)}, text 200 %: every E.8 screen is not clipped, spilled or broken mid-word`, async ({ page, consoleErrors }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(PHONE);
    await start(page, 'lsp_accounts', locale);
    for (const principal of Object.values(STAFF)) await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: OFFICE_DISPLAY(principal) });
    // Every screen is checked and every problem reported together (screen → problems, sideways scroll in px).
    const found: Record<string, unknown> = {};
    for (const [name, persona, path, ready] of SCREENS) {
      await become(page, persona);
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      const problems = await layoutProblems(page);
      const overflow = await overflowOf(page);
      if (problems.length || overflow > 0) found[name] = { problems, overflow };
    }
    expect(found, `${lang(locale)} 200 %`).toEqual({});
    // Drawers too.
    await become(page, 'lsp_accounts');
    await page.goto(`${BO}/backoffice/sup/supplier-payment-drawer`);
    await page.goto(`${BO}/backoffice/sup/suppliers-list`);
    await page.getByTestId('pay-new-supplier').click();
    await expect(page.getByTestId('pay-supplier-drawer')).toBeVisible();
    expect(await layoutProblems(page.getByTestId('pay-supplier-drawer')), `supplier drawer ${lang(locale)}`).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test(`dark mode (${lang(locale)}, 390 px): the E.8 screens pass axe with nothing clipped`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(300_000);
    await page.setViewportSize(VIEWPORTS.phone);
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
    await seed(page, { persona: as('lsp_accounts'), locale });
    for (const [name, persona, path, ready] of SCREENS.filter(([n]) => ['suppliers', 'bill', 'payments', 'expenses', 'petty-cash', 'bva'].includes(n))) {
      await become(page, persona);
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      await axe(page, testInfo, `e8-${name}-390-dark-${locale}`);
      expect(await layoutProblems(page), `${name} dark ${lang(locale)}`).toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
  });
}

test('320 × 700, 200 %: the keyboard reaches every control of the bill workspace and the new bill form without the header or bar covering it', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(PHONE);
  await start(page, 'lsp_finance_controller');
  for (const principal of Object.values(STAFF)) await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: OFFICE_DISPLAY(principal) });
  for (const [persona, path, ready] of [
    ['lsp_finance_controller', '/backoffice/sup/supplier-bill-workspace?record=sbl_lsp_0001', 'pay-bill-workspace'],
    ['lsp_accounts', '/backoffice/sup/new-supplier-bill', 'pay-new-bill'],
    ['lsp_finance_controller', '/backoffice/exp/petty-cash', 'pay-petty'],
  ] as const) {
    await become(page, persona);
    await page.goto(`${BO}${path}`);
    await expect(page.getByTestId(ready).first()).toBeVisible();
    const stops = await focusWalk(page, { header: OFFICE_HEADER, bar: OFFICE_BAR, max: 80 });
    expect(stops.length, `${path}: controls reached`).toBeGreaterThan(2);
    expect(stops.filter((s) => s.issue), path).toEqual([]);
  }
  expect(consoleErrors).toEqual([]);
});
