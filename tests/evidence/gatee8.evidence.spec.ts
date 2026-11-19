import { mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { layoutProblems, brokenReferences } from '../support/layout';
import { BO, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';

/**
 * Gate E.8 evidence → docs/status/integration-e8/screenshots (Wave 2 integration onto the accepted Wave 1
 * base; the reviewed E.8 screenshots in docs/status/gate-e8 stay as they were): the seventeen payables and expenses screens in
 * English and Urdu at 1440 px, the busiest ones at 320 px with 200 % text (`…-200pct-320-xx`), dark
 * mode, and the boundaries (no bank details without bank.view; the Heights budget holder's own cost
 * centre only; a claimant who cannot decide his own claim). Approved states are produced in the session
 * by the checker through the mock API, never seeded.
 * Run against production builds: `E2E_PORT_OFFSET=3400 npx playwright test --project=evidence tests/evidence/gatee8.evidence.spec.ts`.
 */
const DIR = 'docs/status/integration-e8/screenshots';
const LK = 'tnt_larkspur';
const PRINCIPAL: Record<string, string> = { lsp_accounts: 'usr_lsp_0006', lsp_finance_controller: 'usr_lsp_0007', lsp_budget_holder: 'usr_lsp_0021', lsp_project_manager: 'usr_lsp_0005' };
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const onboarding = (persona: string) =>
  JSON.stringify({ profile: { tenantId: LK, personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: name.includes('-320-') });
}

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

/** A request through the app's own mock transport, as the person signed in on the current page. */
async function api(page: Page, persona: string, method: 'GET' | 'POST', path: string, body: Record<string, unknown> = {}) {
  await become(page, persona);
  await page.goto(`${BO}/backoffice/global/my-access`);
  await page.locator('main h1').first().waitFor();
  return page.evaluate(async ({ method, path, body }) => window.__prototype!.transport.request({ method, path, ...(method === 'POST' ? { body } : {}) }), { method, path, body });
}

/** The approved states the screens show, made in this session by a second person (never seeded). */
async function decide(page: Page) {
  await api(page, 'lsp_finance_controller', 'POST', '/supplier-bills/sbl_lsp_0002/approve');
  await api(page, 'lsp_finance_controller', 'POST', '/supplier-bills/sbl_lsp_0001/approve');
  await api(page, 'lsp_finance_controller', 'POST', '/expenses/exp_lsp_0001/approve');
  await api(page, 'lsp_finance_controller', 'POST', '/budgets/bud_lsp_heights_fy27/versions/1/approve');
  await api(page, 'lsp_finance_controller', 'POST', '/petty-cash/pcf_lsp_heights/counts/pcc_lsp_0001/witness', { decision: 'confirm' });
  await api(page, 'lsp_accounts', 'POST', '/supplier-bills/sbl_lsp_0002/payments', { amount: '1000000', note: 'First instalment of the steel bill' });
}

async function session(browser: Browser, opts: { locale: Locale; width: number; height?: number; textScale2?: boolean; dark?: boolean; decided?: boolean }) {
  const ctx = await browser.newContext({ viewport: { width: opts.width, height: opts.height ?? (opts.width === 320 ? 700 : 900) }, reducedMotion: 'reduce', colorScheme: opts.dark ? 'dark' : 'light' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await seed(page, { persona: 'lsp_accounts' as PersonaId, locale: opts.locale });
  if (opts.textScale2) for (const p of Object.values(PRINCIPAL)) await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), `pref:display:v1:backoffice:${LK}:${p}`);
  if (opts.decided) await decide(page);
  return { page, close: () => ctx.close() };
}

async function open(page: Page, persona: string, path: string, ready: string) {
  await become(page, persona);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

const SCREENS: Array<[string, string, string, string]> = [
  ['01-suppliers', 'lsp_accounts', '/backoffice/sup/suppliers-list', 'pay-supplier-list'],
  ['02-supplier-360', 'lsp_accounts', '/backoffice/sup/supplier-360-workspace?record=sup_lsp_margalla', 'pay-supplier-360'],
  ['03-bills', 'lsp_accounts', '/backoffice/sup/supplier-bills-list', 'pay-bill-list'],
  ['04-bill-approved', 'lsp_accounts', '/backoffice/sup/supplier-bill-workspace?record=sbl_lsp_0002', 'pay-bill-workspace'],
  ['05-new-bill', 'lsp_accounts', '/backoffice/sup/new-supplier-bill', 'pay-new-bill'],
  ['06-payments', 'lsp_finance_controller', '/backoffice/sup/supplier-payment-drawer', 'pay-payment-list'],
  ['07-ledger', 'lsp_accounts', '/backoffice/sup/supplier-ledger?supplier=sup_lsp_margalla', 'pay-ledger-view'],
  ['08-utilities', 'lsp_accounts', '/backoffice/sup/utilities-bills-register', 'pay-utility-list'],
  ['09-expenses', 'lsp_accounts', '/backoffice/exp/expenses-list', 'pay-expense-list'],
  ['10-new-expense', 'lsp_budget_holder', '/backoffice/exp/new-expense', 'pay-new-expense'],
  ['11-expense', 'lsp_finance_controller', '/backoffice/exp/expense-workspace?record=exp_lsp_0004', 'pay-expense-workspace'],
  ['12-approvals', 'lsp_finance_controller', '/backoffice/exp/expense-approvals', 'pay-approvals'],
  ['13-petty-cash', 'lsp_finance_controller', '/backoffice/exp/petty-cash', 'pay-petty'],
  ['14-employee', 'lsp_accounts', '/backoffice/exp/employee-expenses', 'pay-employee-list'],
  ['15-budgets', 'lsp_accounts', '/backoffice/exp/budget-list', 'pay-budget-list'],
  ['16-budget', 'lsp_finance_controller', '/backoffice/exp/budget-workspace?record=bud_lsp_heights_fy27', 'pay-budget-workspace'],
  ['17-bva', 'lsp_finance_controller', '/backoffice/exp/budget-vs-actual', 'pay-bva-budget'],
];

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`the seventeen E.8 screens at 1440 px (${lang(locale)})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, close } = await session(browser, { locale, width: 1440, decided: true });
    for (const [name, persona, path, ready] of SCREENS) {
      await open(page, persona, path, ready);
      await shot(page, `e8-${name}-1440-${lang(locale)}`);
    }
    // The payment instruction drawer (prepared by Faiza; Zubair may approve it).
    const list = (await api(page, 'lsp_finance_controller', 'GET', '/supplier-payments')) as { items: Array<{ id: string }> };
    await open(page, 'lsp_finance_controller', `/backoffice/sup/supplier-payment-drawer?record=${list.items[0]!.id}`, 'pay-payment-view');
    await shot(page, `e8-06b-payment-drawer-1440-${lang(locale)}`);
    await close();
  });

  test(`320 px with 200 % text (${lang(locale)}): lists, workspaces and forms reflow without clipping`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { page, close } = await session(browser, { locale, width: 320, textScale2: true, decided: true });
    for (const [name, persona, path, ready] of SCREENS.filter(([n]) => ['01-suppliers', '02-supplier-360', '04-bill-approved', '05-new-bill', '07-ledger', '09-expenses', '12-approvals', '13-petty-cash', '17-bva'].includes(n))) {
      await open(page, persona, path, ready);
      expect(await layoutProblems(page), `${name} ${lang(locale)}`).toEqual([]);
      await shot(page, `e8-${name}-200pct-320-${lang(locale)}`);
    }
    await close();
  });
}

test('dark mode, 1440 px (en): bill workspace, petty cash and budget vs actual', async ({ browser }) => {
  test.setTimeout(180_000);
  const { page, close } = await session(browser, { locale: 'en-PK', width: 1440, dark: true, decided: true });
  for (const [name, persona, path, ready] of SCREENS.filter(([n]) => ['04-bill-approved', '13-petty-cash', '17-bva'].includes(n))) {
    await open(page, persona, path, ready);
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark')).toBe(true);
    await shot(page, `e8-${name}-dark-1440-en`);
  }
  await close();
});

test('the boundaries, 1440 px (en): no bank details without bank.view; the budget holder’s own cost centre; an own claim', async ({ browser }) => {
  test.setTimeout(180_000);
  const { page, close } = await session(browser, { locale: 'en-PK', width: 1440 });
  await open(page, 'lsp_project_manager', '/backoffice/sup/supplier-360-workspace?record=sup_lsp_ravi', 'pay-supplier-360');
  await expect(page.getByTestId('bank-hidden')).toBeVisible();
  await shot(page, 'e8-40-bank-hidden-1440-en');
  await open(page, 'lsp_budget_holder', '/backoffice/exp/expenses-list', 'pay-expense-list');
  await expect(page.getByTestId('pay-scope-limited')).toBeVisible();
  await shot(page, 'e8-41-heights-only-1440-en');
  await open(page, 'lsp_finance_controller', '/backoffice/exp/expense-workspace?record=exp_lsp_0006', 'pay-expense-workspace');
  await expect(page.getByTestId('pay-blocked')).toHaveAttribute('data-reason', 'own_claim');
  await shot(page, 'e8-42-own-claim-1440-en');
  await open(page, 'lsp_budget_holder', '/backoffice/exp/budget-vs-actual', 'pay-bva');
  await shot(page, 'e8-43-bva-no-approved-1440-en');
  await close();
});

/**
 * Wave 2 combination (W2-D2): the open payment drawer at 320 px with 200 % text, as the viewport shows it: first its
 * header, then scrolled to the balance, and the balance's end too when it is taller than the visible drawer. An element
 * screenshot of the balance box was taller than the drawer's visible area and pulled in the drawer header and the page
 * behind it, cut at the column edges.
 */
async function drawerShots(page: Page, l: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/e8-60-drawer-200pct-320-${l}.png` });
  const box = page.getByTestId('pay-balance').first();
  await box.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/e8-60-drawer-balance-200pct-320-${l}.png` });
  if (await box.evaluate((el) => el.getBoundingClientRect().height > window.innerHeight * 0.8)) {
    await box.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/e8-60-drawer-balance-end-200pct-320-${l}.png` });
  }
}

/** Wave 2 integration: one element of a page (a panel or the drawer's balance). */
async function part(page: Page, testId: string, name: string) {
  mkdirSync(DIR, { recursive: true });
  const el = page.getByTestId(testId).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await el.screenshot({ path: `${DIR}/${name}.png` });
}

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`Wave 2 integration (${lang(locale)}): E.13 connections, "In progress", the drawer's actual balance and simulation`, async ({ browser }) => {
    test.setTimeout(300_000);
    const l = lang(locale);
    const { page, close } = await session(browser, { locale, width: 1440, decided: true });
    await open(page, 'lsp_finance_controller', '/backoffice/home/my-tasks', 'my-tasks');
    await shot(page, `e8-50-tasks-1440-${l}`);
    await open(page, 'lsp_finance_controller', '/backoffice/global/unified-search-results?q=Ravi', 'unified-search');
    await shot(page, `e8-51-search-1440-${l}`);
    await open(page, 'lsp_finance_controller', '/backoffice/home/recent-activity?group=payables&range=30d', 'recent-activity');
    await shot(page, `e8-52-activity-1440-${l}`);
    await open(page, 'lsp_accounts', '/backoffice/sup/supplier-360-workspace?record=sup_lsp_margalla', 'pay-supplier-360');
    await part(page, 'pay-related', `e8-53-supplier-related-1440-${l}`);
    await open(page, 'lsp_accounts', '/backoffice/sup/supplier-bills-list?supplier=sup_lsp_ravi&state=in_progress', 'pay-bill-list');
    await shot(page, `e8-54-in-progress-1440-${l}`);
    await open(page, 'lsp_accounts', '/backoffice/sup/supplier-bill-workspace?record=sbl_lsp_0002', 'pay-bill-workspace');
    await part(page, 'pay-money-states', `e8-55-bill-money-states-1440-${l}`);
    await open(page, 'lsp_budget_holder', '/backoffice/exp/expense-workspace?record=exp_lsp_0001', 'pay-expense-workspace');
    await part(page, 'pay-expense-facts', `e8-56-expense-to-budget-1440-${l}`);
    const list = (await api(page, 'lsp_finance_controller', 'GET', '/supplier-payments')) as { items: Array<{ id: string }> };
    await open(page, 'lsp_accounts', `/backoffice/sup/supplier-payment-drawer?record=${list.items[0]!.id}`, 'pay-payment-view');
    await part(page, 'pay-balance', `e8-57-drawer-balance-1440-${l}`);
    await close();
  });

  test(`Wave 2 integration at 320 px with 200 % text (${lang(locale)}): the drawer's balance, Supplier 360 and the tasks reflow`, async ({ browser }) => {
    test.setTimeout(300_000);
    const l = lang(locale);
    const { page, close } = await session(browser, { locale, width: 320, textScale2: true, decided: true });
    const list = (await api(page, 'lsp_finance_controller', 'GET', '/supplier-payments')) as { items: Array<{ id: string }> };
    for (const [name, persona, path, ready] of [
      ['60-drawer', 'lsp_accounts', `/backoffice/sup/supplier-payment-drawer?record=${list.items[0]!.id}`, 'pay-payment-view'],
      ['61-supplier-360', 'lsp_accounts', '/backoffice/sup/supplier-360-workspace?record=sup_lsp_margalla', 'pay-supplier-360'],
      ['62-tasks', 'lsp_finance_controller', '/backoffice/home/my-tasks', 'my-tasks'],
      ['63-expense', 'lsp_budget_holder', '/backoffice/exp/expense-workspace?record=exp_lsp_0001', 'pay-expense-workspace'],
    ] as const) {
      await open(page, persona, path, ready);
      expect(await layoutProblems(page), `${name} ${l}`).toEqual([]);
      // Wave 2 combination (W2-D1): no reference breaks inside a segment, the drawer's header included.
      expect(await brokenReferences(page), `${name} ${l}`).toEqual([]);
      if (name === '60-drawer') await drawerShots(page, l);
      else await shot(page, `e8-${name}-200pct-320-${l}`);
    }
    await close();
  });
}

test('Wave 2 integration, dark mode (en): the drawer’s balance and simulation', async ({ browser }) => {
  test.setTimeout(180_000);
  const { page, close } = await session(browser, { locale: 'en-PK', width: 1440, dark: true, decided: true });
  const list = (await api(page, 'lsp_finance_controller', 'GET', '/supplier-payments')) as { items: Array<{ id: string }> };
  await open(page, 'lsp_accounts', `/backoffice/sup/supplier-payment-drawer?record=${list.items[0]!.id}`, 'pay-payment-view');
  await part(page, 'pay-balance', 'e8-58-drawer-balance-dark-1440-en');
  await close();
});
