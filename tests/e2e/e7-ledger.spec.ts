import type { Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { keyboardFocus, ringOf } from '../support/focus';
import { focusWalk, layoutProblems } from '../support/layout';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate E.7 (provisional, Wave 1): the developer ledger and the bank import through the office app, with
 * Larkspur's new fictional people: Saad (accounts officer: prepares journals, no bank permission),
 * Mehreen (finance controller: approves and posts what someone else prepared, closes months, approves
 * statement imports) and Kashan (treasury officer: uploads statement imports). Nadia (manager) and
 * Farah (finance) read imports but hold no ledger permission; Bilal (sales) holds neither. The rules
 * are the server's (ledger.api.test.ts, ledger.vectors.json); these tests check the screens carry them.
 * The demo's business date is Monday 26 October 2026.
 */
const LK = 'tnt_larkspur';
const PHONE = { width: 320, height: 700 };
const OFFICE_HEADER = '[data-testid="app-header"]';
const OFFICE_BAR = '[data-testid="bottom-nav"]';
const STAFF: Record<string, string> = { lk_accounts: 'usr_lsp_0011', lk_controller: 'usr_lsp_0012', lk_treasury: 'usr_lsp_0013', manager: 'usr_lsp_0001', finance: 'usr_lsp_0003' };
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

async function start(page: Page, persona = 'lk_accounts', locale: Locale = 'en-PK') {
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

async function choose(page: Page, select: string, option: RegExp) {
  await page.getByTestId(select).locator('button').first().click();
  await page.getByRole('option', { name: option }).click();
}

/** Confirm a dialog that needs the "I checked" box. */
async function confirmChecked(page: Page) {
  await page.getByTestId('journal-ack').click();
  await page.getByTestId('journal-confirm').click();
}

const drawer = (page: Page) => page.getByTestId('journal-detail');

test.describe('Gate E.7 — journals: create, approve by someone else, post, reverse', () => {
  test('a balanced journal goes through maker → checker → post, the reports move, the reversal brings them back', async ({ page, consoleErrors }) => {
    test.setTimeout(180_000);
    await start(page);
    await page.goto(`${BO}/backoffice/acc/create-journal`);
    await expect(page.getByTestId('journal-form')).toBeVisible();
    await expect(page.getByTestId('ledger-provisional')).toBeVisible();
    await page.getByTestId('journal-date').fill('2026-10-24');
    await page.getByTestId('journal-memo').fill('Demo accrual — security services, October (fictional)');
    await choose(page, 'journal-line-0-account', /^5200/);
    await page.getByTestId('journal-line-0-debit').fill('125000');
    await choose(page, 'journal-line-1-account', /^2200/);
    await page.getByTestId('journal-line-1-credit').fill('124999.99');
    // Out of balance by one paisa: both actions are disabled, with the reason in words.
    await expect(page.getByTestId('journal-totals')).toHaveAttribute('data-balanced', 'false');
    await expect(page.getByTestId('journal-send')).toBeDisabled();
    await expect(page.getByTestId('journal-why')).toBeVisible();
    // Cash at bank is offered but locked (E-17).
    await page.getByTestId('journal-line-1-account').locator('button').first().click();
    await expect(page.getByRole('option', { name: /^1000/ })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await page.getByTestId('journal-line-1-credit').fill('125000');
    await expect(page.getByTestId('journal-totals')).toHaveAttribute('data-balanced', 'true');
    await page.getByTestId('journal-send').click();
    await expect(drawer(page)).toHaveAttribute('data-state', 'submitted');
    const id = recordOf(page);
    const ref = await drawer(page).getAttribute('data-ref');
    expect(ref).toBe('LKE-JV-2026-0009');
    // The maker cannot approve it.
    await expect(page.getByTestId('journal-approve')).toHaveCount(0);
    await expect(page.getByTestId('journal-blocked')).toBeVisible();

    await office(page, 'lk_controller', `/backoffice/acc/journal-entries?record=${id}`, 'journal-detail');
    await page.getByTestId('journal-approve').click();
    await confirmChecked(page);
    await expect(drawer(page)).toHaveAttribute('data-state', 'approved');
    await page.getByTestId('journal-post').click();
    await confirmChecked(page);
    await expect(drawer(page)).toHaveAttribute('data-state', 'posted');

    await page.goto(`${BO}/backoffice/acc/trial-balance`);
    await expect(page.getByTestId('ledger-tb')).toHaveAttribute('data-debit', '176775000.00');
    await expect(page.getByTestId('ledger-tb')).toHaveAttribute('data-credit', '176775000.00');
    await page.goto(`${BO}/backoffice/acc/profit-and-loss`);
    await expect(page.getByTestId('ledger-pl')).toHaveAttribute('data-result', '-1775000.00');
    await expect(page.getByTestId('profit-revenue-policy')).toBeVisible();
    await page.goto(`${BO}/backoffice/acc/balance-sheet`);
    await expect(page.getByTestId('ledger-bs')).toHaveAttribute('data-balances', 'true');
    await expect(page.getByTestId('bs-result')).toHaveAttribute('data-amount', '-1775000.00');
    for (const tie of ['tie-bs', 'tie-pl', 'tie-tb']) await expect(page.getByTestId(tie)).toHaveAttribute('data-ok', 'true');

    // The posted journal is corrected only by a reversal, requested by Saad, approved and posted by Mehreen.
    await office(page, 'lk_accounts', `/backoffice/acc/journal-entries?record=${id}`, 'journal-detail');
    await expect(page.getByTestId('journal-edit')).toHaveCount(0);
    await page.getByTestId('journal-reverse').click();
    await expect(page.getByTestId('reverse-form')).toBeVisible();
    await expect(page.getByTestId('reverse-preview-lines').getByTestId('journal-line').filter({ visible: true })).toHaveCount(2);
    await page.getByTestId('reverse-date').fill('2026-10-25');
    await page.getByTestId('reverse-reason').fill('Entered in error (demo)');
    await page.getByTestId('reverse-submit').click();
    await expect(drawer(page)).toHaveAttribute('data-state', 'submitted');
    await expect(page.getByTestId('journal-reversal-of')).toContainText('LKE-JV-2026-0009');
    const reversal = recordOf(page);

    await office(page, 'lk_controller', `/backoffice/acc/journal-entries?record=${reversal}`, 'journal-detail');
    await page.getByTestId('journal-approve').click();
    await confirmChecked(page);
    await expect(drawer(page)).toHaveAttribute('data-state', 'approved');
    await page.getByTestId('journal-post').click();
    await confirmChecked(page);
    await expect(drawer(page)).toHaveAttribute('data-state', 'posted');
    await page.goto(`${BO}/backoffice/acc/journal-entries?record=${id}`);
    await expect(drawer(page)).toHaveAttribute('data-reversed', 'true');
    await expect(page.getByTestId('journal-reversal')).toBeVisible();
    await page.goto(`${BO}/backoffice/acc/trial-balance`);
    await expect(page.getByTestId('ledger-tb')).toHaveAttribute('data-debit', '176650000.00');
    await page.goto(`${BO}/backoffice/acc/profit-and-loss`);
    await expect(page.getByTestId('ledger-pl')).toHaveAttribute('data-result', '-1650000.00');
    await page.goto(`${BO}/backoffice/acc/account-workspace?record=gla_lke_c5200`);
    await expect(page.getByTestId('account-balance')).toHaveAttribute('data-amount', '0.00');
    expect(consoleErrors).toEqual([]);
  });

  test('a closed month refuses the journal; posted journals offer no edit; posting rules stay proposed', async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    await start(page);
    await page.goto(`${BO}/backoffice/acc/create-journal`);
    await page.getByTestId('journal-date').fill('2026-09-15');
    await page.getByTestId('journal-memo').fill('Late accrual (demo)');
    await choose(page, 'journal-line-0-account', /^5200/);
    await page.getByTestId('journal-line-0-debit').fill('10');
    await choose(page, 'journal-line-1-account', /^2200/);
    await page.getByTestId('journal-line-1-credit').fill('10');
    await expect(page.getByTestId('journal-send')).toBeDisabled();
    await expect(page.getByTestId('journal-why')).toContainText(/open month/);
    // A posted demo journal: no edit; the edit address says why.
    await page.goto(`${BO}/backoffice/acc/create-journal?record=jnl_lke_0001`);
    await expect(page.getByTestId('journal-not-editable')).toBeVisible();
    await page.goto(`${BO}/backoffice/acc/posting-rules`);
    await expect(page.getByTestId('posting-rule')).toHaveCount(5);
    await expect(page.getByTestId('rule-apply').first()).toBeDisabled();
    await expect(page.getByTestId('rules-events')).toHaveAttribute('data-count', '0');
    const bills = page.locator('[data-testid="posting-rule"][data-ref="LKE-PR-003"]');
    await expect(bills.locator('[data-testid="rule-version"][data-today="true"]')).toHaveAttribute('data-n', '1');
    await bills.getByTestId('rule-preview-open').click();
    await page.getByTestId('rule-preview-run').click();
    await expect(page.getByTestId('rule-preview-result')).toContainText(/Preview only/);
    await page.keyboard.press('Escape');
    await page.goto(`${BO}/backoffice/acc/accounting-periods`);
    await expect(page.locator('[data-testid="period"][data-period="2026-09"]')).toHaveAttribute('data-state', 'closed');
    await expect(page.locator('[data-testid="period"][data-period="2026-10"] [data-check="period_ended"]')).toHaveAttribute('data-outcome', 'blocking');
    expect(consoleErrors).toEqual([]);
  });

  test('a chart change is a draft until someone else approves it', async ({ page, consoleErrors }) => {
    test.setTimeout(90_000);
    await start(page);
    await page.goto(`${BO}/backoffice/acc/chart-of-accounts`);
    await expect(page.getByTestId('ledger-chart')).toHaveAttribute('data-version', '2');
    await page.getByTestId('account-draft-open').click();
    await choose(page, 'account-type', /Expenses/);
    await page.getByTestId('account-code').fill('5600');
    await page.getByTestId('account-name').fill('Travel (demo)');
    await page.getByTestId('account-draft-save').click();
    const draft = page.locator('[data-testid="chart-account"][data-code="5600"]');
    await expect(draft).toHaveAttribute('data-state', 'draft');
    await expect(draft.getByTestId('account-approve')).toHaveCount(0);
    await office(page, 'lk_controller', '/backoffice/acc/chart-of-accounts', 'ledger-chart');
    await page.locator('[data-testid="chart-account"][data-code="5600"]').getByTestId('account-approve').click();
    await expect(page.locator('[data-testid="chart-account"][data-code="5600"]')).toHaveAttribute('data-state', 'active');
    await expect(page.getByTestId('ledger-chart')).toHaveAttribute('data-version', '3');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Gate E.7 — bank import (BANK-005)', () => {
  test('preview → validated rows → duplicates flagged → submitted → approved by someone else → unmatched lines only', async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    await start(page, 'lk_treasury');
    await page.goto(`${BO}/backoffice/bank/bank-import`);
    await expect(page.getByTestId('bank-import')).toBeVisible();
    await expect(page.getByTestId('bank-boundary')).toBeVisible();
    await page.getByTestId('bank-preview').click();
    const detail = page.getByTestId('bank-import-detail');
    await expect(detail).toHaveAttribute('data-state', 'preview');
    const counts = page.getByTestId('bank-import-counts');
    await expect(counts).toHaveAttribute('data-new', '3');
    await expect(counts).toHaveAttribute('data-dup-file', '1');
    await expect(counts).toHaveAttribute('data-dup-prior', '2');
    await expect(counts).toHaveAttribute('data-invalid', '1');
    await expect(page.locator('[data-testid="bank-import-line"][data-status="duplicate_prior"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="bank-import-line"][data-status="invalid"]')).toContainText(/Not a valid date/);
    await page.getByTestId('bank-import-submit').click();
    await expect(detail).toHaveAttribute('data-state', 'awaiting_approval');
    await expect(page.getByTestId('bank-import-approve')).toHaveCount(0);
    await expect(page.getByTestId('bank-import-blocked')).toBeVisible();
    const id = recordOf(page);
    await office(page, 'lk_controller', `/backoffice/bank/bank-import?record=${id}`, 'bank-import-detail');
    await page.getByTestId('bank-import-approve').click();
    await page.getByRole('alertdialog').getByRole('button', { name: /Approve the import/ }).click();
    await expect(page.getByTestId('bank-import-detail')).toHaveAttribute('data-state', 'committed');
    await expect(page.locator('[data-testid="bank-line"][data-txn="LKC-261012-0005"]')).toContainText(/Unmatched — not a receipt/);
    await expect(page.getByTestId('bank-line')).toHaveCount(7);
    // Nothing was posted or settled: the ledger did not move.
    await page.goto(`${BO}/backoffice/acc/trial-balance`);
    await expect(page.getByTestId('ledger-tb')).toHaveAttribute('data-debit', '176650000.00');
    expect(consoleErrors).toEqual([]);
  });

  test('an unverified account and a file of another account are refused, nothing imported', async ({ page, consoleErrors }) => {
    test.setTimeout(90_000);
    await start(page, 'lk_treasury');
    await page.goto(`${BO}/backoffice/bank/bank-import`);
    await choose(page, 'bank-account-select', /Escrow/);
    await page.getByTestId('bank-preview').click();
    await expect(page.getByTestId('bank-new').getByRole('alert')).toContainText(/verified bank accounts/);
    await choose(page, 'bank-file-select', /operating account/);
    await choose(page, 'bank-account-select', /Collections/);
    await page.getByTestId('bank-preview').click();
    await expect(page.getByTestId('bank-new').getByRole('alert')).toContainText(/names another account/);
    await expect(page.getByTestId('bank-import-row')).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Gate E.7 — access: the bank boundary and people without the ledger', () => {
  test('Saad (no bank permission) sees no bank line, account identifier, import or total anywhere', async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    await start(page);
    const secrets = [/Ayesha Karim/, /LKC-2610/, /•••• /, /Demo Bank/, /Collections \(DEMO\)/, /LKE-BIM/];
    for (const path of ['/backoffice/acc/chart-of-accounts', '/backoffice/acc/account-workspace?record=gla_lke_c1000', '/backoffice/acc/account-workspace?record=gla_lke_c1010', '/backoffice/acc/journal-entries', '/backoffice/acc/trial-balance', '/backoffice/acc/balance-sheet', '/backoffice/acc/accounting-periods', '/backoffice/acc/posting-rules']) {
      await page.goto(`${BO}${path}`);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.getByTestId('ledger-provisional')).toBeVisible();
      const text = await page.locator('main').innerText();
      for (const s of secrets) expect(text, `${path} ${s}`).not.toMatch(s);
      await expect(page.getByTestId('account-bank')).toHaveCount(0);
      await expect(page.getByTestId('ledger-nav-bank')).toHaveCount(0);
    }
    await page.goto(`${BO}/backoffice/bank/bank-import`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
    await expect(page.getByTestId('bank-import')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('Mehreen (bank permission) sees the linked bank account, masked, and its unmatched lines', async ({ page, consoleErrors }) => {
    await start(page, 'lk_controller');
    await page.goto(`${BO}/backoffice/acc/account-workspace?record=gla_lke_c1000`);
    await expect(page.getByTestId('account-bank')).toContainText(/•••• /);
    await expect(page.getByTestId('account-statement-lines')).toContainText(/4 unmatched statement lines/);
    await expect(page.getByTestId('account-balance')).toHaveAttribute('data-amount', '0.00');
    expect(consoleErrors).toEqual([]);
  });

  test('no existing role gained the ledger: Nadia and Farah read imports only, Bilal reaches neither', async ({ page, consoleErrors }) => {
    test.setTimeout(90_000);
    await start(page, 'manager');
    for (const persona of ['manager', 'finance', 'sales']) {
      await become(page, persona);
      await page.goto(`${BO}/backoffice/acc/journal-entries`);
      await expect(page.getByTestId('access-outcome'), persona).toHaveAttribute('data-reason', 'permission_missing');
      await page.goto(`${BO}/backoffice/bank/bank-import`);
      if (persona === 'sales') await expect(page.getByTestId('access-outcome')).toBeVisible();
      else {
        await expect(page.getByTestId('bank-import')).toBeVisible();
        await expect(page.getByTestId('bank-new')).toHaveCount(0);
        await expect(page.getByTestId('bank-no-import')).toBeVisible();
      }
    }
    expect(consoleErrors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Both languages, every width, 320 px at 200 %, dark mode with high contrast, the keyboard
// ---------------------------------------------------------------------------------------------

const SCREENS: Array<[string, string, string, string]> = [
  ['chart', 'lk_accounts', '/backoffice/acc/chart-of-accounts', 'chart-accounts'],
  ['account', 'lk_controller', '/backoffice/acc/account-workspace?record=gla_lke_c1000', 'account-workspace'],
  ['account-lines', 'lk_accounts', '/backoffice/acc/account-workspace?record=gla_lke_c2200', 'account-workspace'],
  ['journals', 'lk_controller', '/backoffice/acc/journal-entries', 'journal-list'],
  ['journal-drawer', 'lk_controller', '/backoffice/acc/journal-entries?record=jnl_lke_0007', 'journal-detail'],
  ['create', 'lk_accounts', '/backoffice/acc/create-journal', 'journal-form'],
  ['reverse', 'lk_accounts', '/backoffice/acc/reverse-journal?record=jnl_lke_0003', 'reverse-form'],
  ['trial-balance', 'lk_accounts', '/backoffice/acc/trial-balance', 'ledger-tb'],
  ['profit-and-loss', 'lk_accounts', '/backoffice/acc/profit-and-loss', 'ledger-pl'],
  ['balance-sheet', 'lk_accounts', '/backoffice/acc/balance-sheet', 'ledger-bs'],
  ['periods', 'lk_controller', '/backoffice/acc/accounting-periods', 'ledger-periods'],
  ['rules', 'lk_accounts', '/backoffice/acc/posting-rules', 'ledger-rules'],
  ['bank-import', 'lk_treasury', '/backoffice/bank/bank-import?record=bim_lke_0001', 'bank-import-detail'],
];

const lang = (locale: Locale) => (locale === 'ur-PK' ? 'ur' : 'en');

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`E.7 screens in ${lang(locale)}: axe at 1440, 768 and 390 px, no sideways scroll`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(420_000);
    await start(page, 'lk_accounts', locale);
    for (const [name, persona, path, ready] of SCREENS) {
      await become(page, persona);
      for (const [vp, size] of [['1440', VIEWPORTS.desktop], ['768', VIEWPORTS.tablet], ['390', VIEWPORTS.phone]] as const) {
        await page.setViewportSize(size);
        await page.goto(`${BO}${path}`);
        await expect(page.getByTestId(ready).first()).toBeVisible();
        await axe(page, testInfo, `e7-${name}-${vp}-${locale}`);
        expect(await overflowOf(page), `${name} ${vp} ${locale}`).toBeLessThanOrEqual(0);
      }
    }
    expect(consoleErrors).toEqual([]);
  });

  test(`320 × 700, ${lang(locale)}, text 200 %: every E.7 screen and drawer is not clipped, spilled or broken mid-word (statements become lists)`, async ({ page, consoleErrors }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(PHONE);
    await start(page, 'lk_accounts', locale);
    for (const principal of Object.values(STAFF)) await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: OFFICE_DISPLAY(principal) });
    for (const [name, persona, path, ready] of SCREENS) {
      await become(page, persona);
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      expect(await layoutProblems(page), `${name} ${lang(locale)} 200 %`).toEqual([]);
    }
    // Reports and journal lines are lists here, not tables.
    await become(page, 'lk_accounts');
    await page.goto(`${BO}/backoffice/acc/trial-balance`);
    await expect(page.getByTestId('tb-list')).toBeVisible();
    await expect(page.getByTestId('tb-table')).toBeHidden();
    await page.goto(`${BO}/backoffice/acc/chart-of-accounts`);
    await page.getByTestId('account-draft-open').click();
    await expect(page.getByTestId('account-draft')).toBeVisible();
    expect(await layoutProblems(page.getByTestId('account-draft')), `draft drawer ${lang(locale)}`).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test(`dark mode with high contrast (${lang(locale)}, 390 px): the E.7 screens pass axe with nothing clipped`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(300_000);
    await page.setViewportSize(VIEWPORTS.phone);
    await start(page, 'lk_accounts', locale);
    const html = (name: string) => page.evaluate((n) => document.documentElement.getAttribute(n), name);
    for (const persona of ['lk_accounts', 'lk_controller', 'lk_treasury']) {
      await office(page, persona, '/backoffice/global/accessibility-preferences', 'hub-theme');
      await page.getByTestId('hub-theme-dark').click();
      await page.getByTestId('hub-contrast-high').click();
      await expect.poll(() => html('data-contrast')).toBe('high');
      await expect.poll(() => html('data-theme')).toBe('dark');
    }
    for (const [name, persona, path, ready] of SCREENS) {
      await become(page, persona);
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      await axe(page, testInfo, `e7-${name}-390-dark-contrast-${locale}`);
      expect(await layoutProblems(page), `${name} dark ${lang(locale)}`).toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
  });

  test(`320 × 700, ${lang(locale)}, 200 %: the keyboard reaches every control of the journals, the form and the bank import without the header or bar covering it`, async ({ page, consoleErrors }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(PHONE);
    await start(page, 'lk_accounts', locale);
    for (const principal of Object.values(STAFF)) await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: OFFICE_DISPLAY(principal) });
    for (const [name, persona, path, ready] of [SCREENS[3]!, SCREENS[5]!, SCREENS[12]!]) {
      await become(page, persona);
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      const stops = await focusWalk(page, { header: OFFICE_HEADER, bar: OFFICE_BAR, max: 60 });
      expect(stops.length, `${name}: controls reached`).toBeGreaterThan(2);
      expect(stops.filter((s) => s.issue), `${name} ${lang(locale)}`).toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
  });
}

test('keyboard only: a journal opens from the list, and the ledger controls draw a visible focus ring (B2 rule)', async ({ page, context, consoleErrors }) => {
  test.setTimeout(120_000);
  await start(page, 'lk_controller');
  await page.goto(`${BO}/backoffice/acc/journal-entries`);
  const row = page.locator('[data-testid="journal-row"][data-ref="LKE-JV-2026-0007"] a');
  await keyboardFocus(page, row);
  await page.keyboard.press('Enter');
  await expect(drawer(page)).toHaveAttribute('data-ref', 'LKE-JV-2026-0007');
  await expect(page.getByTestId('journal-approve')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toHaveCount(0);
  const decoder = await context.newPage();
  for (const target of [page.getByTestId('ledger-nav-trialBalance'), page.locator('[data-testid="journal-row"] a').first(), page.getByTestId('journal-search')]) {
    const r = await ringOf(page, decoder, target);
    expect(r.focusVisible).toBe(true);
    expect(r.width).toBeGreaterThanOrEqual(2);
    expect(r.changed3).toBeGreaterThanOrEqual(0.9);
    expect(r.clipped).toBe(0);
  }
  await decoder.close();
  expect(consoleErrors).toEqual([]);
});
