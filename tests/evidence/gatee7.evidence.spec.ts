import type { Browser, Page } from '@playwright/test';
import { BO, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate E.7 evidence (provisional, Wave 1): the developer ledger (chart, account workspace, journals and
 * the journal drawer, the journal form, reversal, trial balance, profit and loss, balance sheet,
 * periods, posting rules) and the bank import; the reference flow (maker → checker → post → reversal,
 * reports moving and coming back); the import flow (preview, duplicates, second-person approval);
 * who sees what (no bank permission, no ledger permission); phones in both languages, 320 px with
 * 200 % text; dark mode with high contrast → docs/status/gate-e7/screenshots.
 * Business date: Monday 26 October 2026. Run against production builds:
 * `E2E_PORT_OFFSET=2400 npx playwright test --project=evidence tests/evidence/gatee7.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-e7/screenshots';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const STAFF = ['usr_lsp_0011', 'usr_lsp_0012', 'usr_lsp_0013', 'usr_lsp_0001', 'usr_lsp_0003'];
const as_ = (id: string) => id as PersonaId;

const onboarding = (persona: string) =>
  JSON.stringify({ profile: { tenantId: 'tnt_larkspur', personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

async function settle(page: Page, ms = 500) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function become(page: Page, persona: string) {
  if (!page.url().startsWith(BO)) await page.goto(`${BO}/backoffice/global/my-access`);
  await page.evaluate(
    ({ persona, value }) => {
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
      localStorage.setItem(`onboarding:v1:tnt_larkspur:${persona}:backoffice`, value);
    },
    { persona, value: onboarding(persona) },
  );
}

async function as(page: Page, persona: string, path: string, ready: string) {
  await become(page, persona);
  await page.goto(`${BO}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page);
}

async function context(browser: Browser, viewport: { width: number; height: number }, locale: Locale = 'en-PK', scale?: number) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await seed(page, { persona: as_('lk_accounts'), locale });
  if (scale) {
    for (const p of STAFF) await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: `pref:display:v1:backoffice:tnt_larkspur:${p}`, scale });
  }
  return page;
}

const BAR_HIDDEN = '[data-testid="bottom-nav"] { visibility: hidden !important; }';
const shot = (page: Page, name: string, full = true) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full, ...(full ? { style: BAR_HIDDEN } : {}) });

async function api<T = { id: string }>(page: Page, path: string, body: unknown = {}) {
  const r = await societyApi<T>(page, path, 'POST', body);
  if (!r.ok) throw new Error(`POST ${path}: ${JSON.stringify(r)}`);
  return r.res;
}

const SCREENS: Array<[string, string, string, string]> = [
  ['a01-chart', 'lk_accounts', '/backoffice/acc/chart-of-accounts', 'chart-accounts'],
  ['a02-account-cash-bank-reader', 'lk_controller', '/backoffice/acc/account-workspace?record=gla_lke_c1000', 'account-workspace'],
  ['a03-account-accrued', 'lk_accounts', '/backoffice/acc/account-workspace?record=gla_lke_c2200', 'account-workspace'],
  ['a04-journals', 'lk_controller', '/backoffice/acc/journal-entries', 'journal-list'],
  ['a05-journal-awaiting-approval', 'lk_controller', '/backoffice/acc/journal-entries?record=jnl_lke_0007', 'journal-detail'],
  ['a06-journal-reversed', 'lk_accounts', '/backoffice/acc/journal-entries?record=jnl_lke_0004', 'journal-detail'],
  ['a07-create-journal', 'lk_accounts', '/backoffice/acc/create-journal', 'journal-form'],
  ['a08-reverse-journal', 'lk_accounts', '/backoffice/acc/reverse-journal?record=jnl_lke_0003', 'reverse-form'],
  ['a09-trial-balance', 'lk_accounts', '/backoffice/acc/trial-balance', 'ledger-tb'],
  ['a10-profit-and-loss', 'lk_accounts', '/backoffice/acc/profit-and-loss', 'ledger-pl'],
  ['a11-balance-sheet', 'lk_accounts', '/backoffice/acc/balance-sheet', 'ledger-bs'],
  ['a12-periods', 'lk_controller', '/backoffice/acc/accounting-periods', 'ledger-periods'],
  ['a13-posting-rules-proposed', 'lk_accounts', '/backoffice/acc/posting-rules', 'ledger-rules'],
  ['a14-bank-import', 'lk_treasury', '/backoffice/bank/bank-import?record=bim_lke_0001', 'bank-import-detail'],
];

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  for (const [w, size] of [['1440', VIEWPORTS.desktop], ['390', VIEWPORTS.phone]] as const) {
    test(`ledger and bank-import screens (${w}, ${lang(locale)})`, async ({ browser }) => {
      test.setTimeout(300_000);
      const page = await context(browser, size, locale);
      for (const [name, persona, path, ready] of SCREENS) {
        await as(page, persona, path, ready);
        await shot(page, `${name}-${w}-${lang(locale)}`);
      }
      await page.context().close();
    });
  }
}

test('reference flow: maker drafts → checker approves and posts → reports move → reversal approved and posted → reports return (1440, en)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await context(browser, VIEWPORTS.desktop);
  await as(page, 'lk_accounts', '/backoffice/acc/create-journal', 'journal-form');
  await page.getByTestId('journal-date').fill('2026-10-24');
  await page.getByTestId('journal-memo').fill('Demo accrual — security services, October (fictional)');
  for (const [i, code, side, amount] of [[0, '5200', 'debit', '125000'], [1, '2200', 'credit', '124999.99']] as const) {
    await page.getByTestId(`journal-line-${i}-account`).locator('button').first().click();
    await page.getByRole('option', { name: new RegExp(`^${code}`) }).click();
    await page.getByTestId(`journal-line-${i}-${side}`).fill(amount);
  }
  await settle(page);
  await shot(page, 'b01-form-out-of-balance-1440-en');
  await page.getByTestId('journal-line-1-credit').fill('125000');
  await settle(page);
  await shot(page, 'b02-form-balanced-1440-en');
  await page.getByTestId('journal-send').click();
  await page.getByTestId('journal-detail').waitFor();
  await settle(page);
  await shot(page, 'b03-submitted-maker-cannot-approve-1440-en', false);
  const id = new URL(page.url()).searchParams.get('record')!;
  await as(page, 'lk_controller', `/backoffice/acc/journal-entries?record=${id}`, 'journal-approve');
  await page.getByTestId('journal-approve').click();
  await page.getByTestId('journal-ack').click();
  await settle(page, 300);
  await shot(page, 'b04-approve-acknowledgement-1440-en', false);
  await page.getByTestId('journal-confirm').click();
  await page.locator('[data-testid="journal-detail"][data-state="approved"]').waitFor();
  await api(page, `/ledger/journals/${id}/post`);
  await as(page, 'lk_controller', `/backoffice/acc/journal-entries?record=${id}`, 'journal-detail');
  await shot(page, 'b05-posted-immutable-1440-en', false);
  await as(page, 'lk_controller', '/backoffice/acc/trial-balance', 'ledger-tb');
  await shot(page, 'b06-trial-balance-after-post-1440-en');
  await as(page, 'lk_controller', '/backoffice/acc/balance-sheet', 'ledger-bs');
  await shot(page, 'b07-balance-sheet-ties-after-post-1440-en');
  await as(page, 'lk_accounts', `/backoffice/acc/reverse-journal?record=${id}`, 'reverse-form');
  await page.getByTestId('reverse-date').fill('2026-10-25');
  await page.getByTestId('reverse-reason').fill('Entered in error (demo)');
  await shot(page, 'b08-reversal-form-1440-en');
  await page.getByTestId('reverse-submit').click();
  await page.getByTestId('journal-reversal-of').waitFor();
  const reversal = new URL(page.url()).searchParams.get('record')!;
  await as(page, 'lk_controller', `/backoffice/acc/journal-entries?record=${reversal}`, 'journal-detail');
  await api(page, `/ledger/journals/${reversal}/approve`);
  await api(page, `/ledger/journals/${reversal}/post`);
  await as(page, 'lk_controller', `/backoffice/acc/journal-entries?record=${id}`, 'journal-reversal');
  await shot(page, 'b09-original-reversed-both-links-1440-en', false);
  await as(page, 'lk_controller', '/backoffice/acc/profit-and-loss', 'ledger-pl');
  await shot(page, 'b10-profit-and-loss-restored-1440-en');
  await page.context().close();
});

test('bank import: preview with duplicates and an invalid row → own import cannot be approved → approved by the controller → unmatched lines (1440, en)', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await context(browser, VIEWPORTS.desktop);
  await as(page, 'lk_treasury', '/backoffice/bank/bank-import', 'bank-new');
  await page.getByTestId('bank-preview').click();
  await page.getByTestId('bank-import-detail').waitFor();
  await settle(page);
  await shot(page, 'c01-preview-duplicates-invalid-1440-en');
  await page.getByTestId('bank-import-submit').click();
  await page.locator('[data-testid="bank-import-detail"][data-state="awaiting_approval"]').waitFor();
  await settle(page);
  await shot(page, 'c02-awaiting-second-person-1440-en');
  const id = new URL(page.url()).searchParams.get('record')!;
  await as(page, 'lk_controller', `/backoffice/bank/bank-import?record=${id}`, 'bank-import-approve');
  await page.getByTestId('bank-import-approve').click();
  await settle(page, 300);
  await shot(page, 'c03-approve-effect-1440-en', false);
  await page.getByRole('alertdialog').getByRole('button', { name: /Approve the import/ }).click();
  await page.locator('[data-testid="bank-import-detail"][data-state="committed"]').waitFor();
  await settle(page);
  await shot(page, 'c04-committed-unmatched-lines-1440-en');
  await as(page, 'lk_treasury', '/backoffice/bank/bank-import', 'bank-new');
  await page.getByTestId('bank-account-select').locator('button').first().click();
  await page.getByRole('option', { name: /Escrow/ }).click();
  await page.getByTestId('bank-preview').click();
  await page.getByTestId('bank-new').getByRole('alert').waitFor();
  await settle(page);
  await shot(page, 'c05-unverified-account-refused-1440-en');
  await page.context().close();
});

test('who sees what: no bank permission, no ledger permission, maker blocked (1440, en)', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await context(browser, VIEWPORTS.desktop);
  await as(page, 'lk_accounts', '/backoffice/bank/bank-import', 'access-outcome');
  await shot(page, 'd01-accounts-officer-no-bank-import-1440-en');
  await as(page, 'lk_accounts', '/backoffice/acc/account-workspace?record=gla_lke_c1000', 'account-workspace');
  await shot(page, 'd02-cash-account-without-bank-details-1440-en');
  await as(page, 'manager', '/backoffice/acc/journal-entries', 'access-outcome');
  await shot(page, 'd03-manager-no-ledger-permission-1440-en');
  await as(page, 'finance', '/backoffice/bank/bank-import', 'bank-no-import');
  await shot(page, 'd04-finance-reads-imports-only-1440-en');
  await as(page, 'lk_accounts', '/backoffice/acc/journal-entries?record=jnl_lke_0007', 'journal-blocked');
  await shot(page, 'd05-maker-cannot-approve-own-1440-en', false);
  await page.context().close();
});

test('320 × 700, Urdu and English, 200 % text: journals, drawer, form, trial balance (as a list), balance sheet, bank import (viewport captures)', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const locale of ['ur-PK', 'en-PK'] as Locale[]) {
    const page = await context(browser, { width: 320, height: 700 }, locale, 2);
    for (const [name, persona, path, ready] of [
      ['e01-journals', 'lk_controller', '/backoffice/acc/journal-entries', 'journal-list'],
      ['e02-journal-drawer', 'lk_controller', '/backoffice/acc/journal-entries?record=jnl_lke_0007', 'journal-detail'],
      ['e03-create-journal', 'lk_accounts', '/backoffice/acc/create-journal', 'journal-form'],
      ['e04-trial-balance-list', 'lk_accounts', '/backoffice/acc/trial-balance', 'tb-list'],
      ['e05-balance-sheet', 'lk_accounts', '/backoffice/acc/balance-sheet', 'ledger-bs'],
      ['e06-bank-import', 'lk_treasury', '/backoffice/bank/bank-import?record=bim_lke_0001', 'bank-import-detail'],
    ] as Array<[string, string, string, string]>) {
      await as(page, persona, path, ready);
      await shot(page, `${name}-200pct-320-${lang(locale)}`, false);
    }
    await page.context().close();
  }
});

test('dark mode with high contrast (390, en and ur): journals and the trial balance', async ({ browser }) => {
  test.setTimeout(180_000);
  for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
    const page = await context(browser, VIEWPORTS.phone, locale);
    for (const persona of ['lk_accounts', 'lk_controller']) {
      await as(page, persona, '/backoffice/global/accessibility-preferences', 'hub-theme');
      await page.getByTestId('hub-theme-dark').click();
      await page.getByTestId('hub-contrast-high').click();
    }
    await as(page, 'lk_controller', '/backoffice/acc/journal-entries', 'journal-list');
    await shot(page, `f01-journals-dark-contrast-390-${lang(locale)}`);
    await as(page, 'lk_controller', '/backoffice/acc/trial-balance', 'ledger-tb');
    await shot(page, `f02-trial-balance-dark-contrast-390-${lang(locale)}`);
    await page.context().close();
  }
});
