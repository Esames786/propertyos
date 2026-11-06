import type { Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, test, type Locale, type PersonaId } from '../support/fixtures';
import { focusWalk, layoutProblems } from '../support/layout';
import { become, seedSociety, societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * GitHub Issue #18 in the office app (production build), with the people of the Al-Noor storyline.
 * - FIN-01: Imran, the building manager (cashbook, collections and deposits; no bank feed), opens
 *   BANK-002 and FIN-009 by their deep links in both languages and sees no statement line, bank
 *   transaction, counterparty or full IBAN, with the reason in words; Ayesha (bank.view) keeps them.
 * - FIN-02: a second voucher, deposit or office collection in the same visit is a second record,
 *   announced by its own toast.
 * Plus the changed screens at every width, 320 px with 200 % text, dark mode with high contrast and
 * the keyboard. The business date is Monday 26 October 2026.
 */
const IMRAN: PersonaId = 'alnoor_manager';
const AYESHA: PersonaId = 'alnoor_treasurer';
const SABA: PersonaId = 'alnoor_accounts';
const PHONE = { width: 320, height: 700 };
const OFFICE_HEADER = '[data-testid="app-header"]';
const OFFICE_BAR = '[data-testid="bottom-nav"]';
const DISPLAY_IMRAN = 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0001';
const ACCOUNT_LINES = '/backoffice/bank/bank-account-360-workspace?record=ben_anr_main&tab=lines';
/** What only the bank feed shows: the bank's transaction ids, line ids, full IBANs and statement names. */
const SECRET = /DEMO-TXN|DEMO-S1-|bnl_anr_|bst_anr_|PK36DEMO|PK70DEMO|IMRAN HUSSAIN|KOMAL MIRZA|\*\*\*\*\d{4}/;
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const api = societyApi;

async function at(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
}

async function office(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const pageText = (page: Page) => page.locator('body').innerText();
/**
 * The page's text without the proof stand-in: the drawing of the resident's own transfer slip (the
 * resident's evidence, readable with proof access) shows the society's payee account as a real slip
 * would; everything else on FIN-009 must name no bank line, bank id or full IBAN.
 */
const reviewText = (page: Page) =>
  page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelectorAll('[data-testid="proof-preview"]').forEach((e) => e.remove());
    return body.textContent ?? '';
  });

async function choose(page: Page, scope: ReturnType<Page['getByTestId']>, testId: string, option: RegExp | string) {
  await scope.getByTestId(testId).getByRole('button').click();
  await page.getByRole('option', { name: option }).first().click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

const box = (scope: ReturnType<Page['getByTestId']>, testId: string) => scope.locator(`:is(input, textarea)[data-testid="${testId}"], [data-testid="${testId}"] :is(input, textarea)`).first();

/**
 * Saba asks for an exception on the B-405 proof with another payer's transfer (Imran Hussain's), so
 * the proof waits on a line that is not the resident's own. Returns the B-405 and A-305 proof ids.
 */
async function proofsWithException(page: Page) {
  await office(page, SABA, '/backoffice/fin/unverified-transfers-queue', 'proof-inbox');
  const q = await api<{ items: Array<{ id: string; flats: string[]; state: string }> }>(page, '/payment-submissions');
  const items = q.ok ? q.res.items : [];
  const b405 = items.find((r) => r.flats[0] === 'B-405' && r.state === 'submitted')!.id;
  const a305 = items.find((r) => r.flats[0] === 'A-305' && r.state === 'submitted')!.id;
  const d = await api<{ candidates: Array<{ bankLine: { id: string; counterpartyName: string } }> }>(page, `/payment-submissions/${b405}`);
  const other = (d.ok ? d.res.candidates : []).find((c) => c.bankLine.counterpartyName === 'IMRAN HUSSAIN')!;
  const asked = await api(page, `/payment-submissions/${b405}/exception`, 'POST', { bankLineId: other.bankLine.id, reason: 'Komal says her husband Imran sent it from his account; confirmed by phone.' });
  expect(asked.ok).toBe(true);
  return { b405, a305 };
}

// ---------------------------------------------------------------------------------------------
// FIN-01: Imran sees no bank feed, in both languages and by deep link
// ---------------------------------------------------------------------------------------------

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`FIN-01 ${lang(locale)}: Imran's BANK-002 deep links to the statement lines and reconciliation open the overview with the reason; no line, bank id or full IBAN anywhere`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(120_000);
    await at(page);
    await seedSociety(page, { staff: IMRAN, locale });
    for (const tab of ['lines', 'reconciliation']) {
      await office(page, IMRAN, `/backoffice/bank/bank-account-360-workspace?record=ben_anr_main&tab=${tab}`, 'account-workspace');
      await expect(page.getByTestId('account-bank-restricted')).toBeVisible();
      await expect(page.getByTestId('account-overview')).toBeVisible();
      await expect(page.getByRole('tab')).toHaveCount(3);
      await expect(page.getByTestId('account-lines')).toHaveCount(0);
      await expect(page.getByTestId('account-reconciliation')).toHaveCount(0);
      expect(await pageText(page), tab).not.toMatch(SECRET);
    }
    // The masked account number, and the reason in the page's language.
    await expect(page.getByTestId('account-overview')).toContainText('•••• 7890');
    await expect(page.getByTestId('account-bank-restricted')).toContainText(locale === 'ur-PK' ? 'بینک کی تفصیلات فنانس کے لیے ہیں' : 'Bank details are for finance');
    await axe(page, testInfo, `bank002-imran-${locale}`);
    // The cashbook tab: bank movements settled on "a statement line", never named.
    await page.getByRole('tab').nth(1).click();
    await expect(page.getByTestId('account-cashbook')).toBeVisible();
    await expect(page.getByTestId('account-cashbook').locator('li').first()).toBeVisible();
    expect(await pageText(page)).not.toMatch(SECRET);
    // The account list and the bank feed's own address.
    await office(page, IMRAN, '/backoffice/bank/bank-accounts', 'bank-accounts');
    expect(await pageText(page)).not.toMatch(SECRET);
    await page.goto(`${BO}/backoffice/bank/bank-transaction-feed`);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByTestId('bank-lines')).toHaveCount(0);
    expect(await pageText(page)).not.toMatch(SECRET);
    expect(consoleErrors.filter((e) => !e.includes('403'))).toEqual([]);
  });

  test(`FIN-01 ${lang(locale)}: Imran reads FIN-009 proofs (one waiting on another payer's transfer) without any candidate line, with the reason`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(120_000);
    await at(page);
    await seedSociety(page, { staff: IMRAN, locale });
    const { b405, a305 } = await proofsWithException(page);
    await office(page, IMRAN, `/backoffice/fin/transfer-proof-review?record=${a305}`, 'review-read-only');
    await expect(page.getByTestId('review-bank-restricted')).toBeVisible();
    await expect(page.getByTestId('match-candidate-read')).toHaveCount(0);
    expect(await reviewText(page)).not.toMatch(SECRET);
    await axe(page, testInfo, `fin009-imran-${locale}`);
    // The exception: who asked and what does not match, never the line or its counterparty.
    await office(page, IMRAN, `/backoffice/fin/transfer-proof-review?record=${b405}`, 'exception-card');
    await expect(page.getByTestId('exception-card')).toContainText('Saba Javed');
    await expect(page.getByTestId('match-candidate-read')).toHaveCount(0);
    expect(await reviewText(page)).not.toMatch(SECRET);
    await axe(page, testInfo, `fin009-exception-imran-${locale}`);
    // The inbox shows no bank-match signal for him.
    await office(page, IMRAN, '/backoffice/fin/unverified-transfers-queue', 'proof-inbox');
    await expect(page.locator('[data-testid="proof-row"]').first()).toBeVisible();
    await expect(page.getByTestId('match-badge')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
}

test('FIN-01: the finance dashboard, cashbook and close checklist give Imran no line count, amount or link to the bank feed', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await at(page);
  await seedSociety(page, { staff: IMRAN });
  await office(page, IMRAN, '/backoffice/fin/finance-dashboard', 'finance-dashboard');
  await expect(page.getByTestId('fin-unreconciled-restricted')).toBeVisible();
  await expect(page.getByTestId('fin-unreconciled')).toHaveCount(0);
  await expect(page.locator('main a[href*="bank-transaction-feed"]')).toHaveCount(0);
  await expect(page.getByTestId('ladder-bankSettled')).toHaveAttribute('href', /\/backoffice\/bank\/cashbook\?period=2026-10/);
  expect(await pageText(page)).not.toMatch(SECRET);
  await office(page, IMRAN, '/backoffice/bank/cashbook', 'cashbook-page');
  await expect(page.getByTestId('cashbook-bank-restricted')).toBeVisible();
  await expect(page.getByTestId('reconciliation-row')).toHaveCount(0);
  expect(await pageText(page)).not.toMatch(SECRET);
  await office(page, IMRAN, '/backoffice/bank/cashbook?drawer=close', 'close-drawer');
  await expect(page.locator('[data-testid="close-check"][data-key="unreconciled_lines"]')).toContainText('finance staff with bank access');
  await expect(page.getByTestId('close-drawer').locator('a[href*="bank-transaction-feed"]')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

test('FIN-01: Ayesha (bank.view) keeps BANK-002 statement lines and reconciliation, and Saba the proof candidates', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await at(page);
  await seedSociety(page, { staff: AYESHA });
  await office(page, AYESHA, ACCOUNT_LINES, 'account-lines');
  await expect(page.getByTestId('account-line').first()).toBeVisible();
  await expect(page.getByTestId('account-bank-restricted')).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveCount(5);
  await expect(page.getByTestId('account-lines')).toContainText('DEMO-TXN');
  await office(page, AYESHA, '/backoffice/fin/finance-dashboard', 'finance-dashboard');
  await expect(page.getByTestId('fin-unreconciled')).toBeVisible();
  const { a305 } = await proofsWithException(page);
  await office(page, SABA, `/backoffice/fin/transfer-proof-review?record=${a305}`, 'match-choice');
  await expect(page.locator('[data-testid="match-candidate"]').first()).toBeVisible();
  await expect(page.getByTestId('review-bank-restricted')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// FIN-02: a second create in the same visit is a second record, with its own toast
// ---------------------------------------------------------------------------------------------

/**
 * The record a create just made: the one item of `path` that was not there before (exactly one).
 * Its own reference must then be announced by a success toast (never an earlier record's).
 */
async function created(page: Page, path: string, before: ReadonlySet<string>) {
  let fresh: Array<{ id: string; ref: string }> = [];
  await expect
    .poll(async () => {
      const r = await api<{ items: Array<{ id: string; ref: string; batch?: { id: string; ref: string } }> }>(page, path);
      fresh = (r.ok ? r.res.items : []).map((x) => x.batch ?? x).filter((x) => !before.has(x.id));
      return fresh.length;
    })
    .toBe(1);
  await expect(page.getByTestId('toast-success').filter({ hasText: fresh[0]!.ref })).toBeVisible();
  return fresh[0]!;
}

async function ids(page: Page, path: string) {
  const r = await api<{ items: Array<{ id: string; batch?: { id: string } }> }>(page, path);
  return new Set((r.ok ? r.res.items : []).map((x) => x.batch?.id ?? x.id));
}

test('FIN-02: two vouchers in one cashbook visit are two vouchers; each toast names its own reference', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await at(page);
  await seedSociety(page, { staff: SABA });
  await office(page, SABA, '/backoffice/bank/cashbook', 'cashbook-page');
  const made: Array<{ id: string; ref: string }> = [];
  for (const [amount, purpose] of [['1200', 'Cleaning supplies for the lobby'], ['800', 'Light bulbs for the parking area']] as const) {
    const before = await ids(page, '/finance/vouchers');
    await page.getByTestId('new-voucher').click();
    const v = page.getByTestId('voucher-drawer');
    await expect(v).toBeVisible();
    // A new voucher starts from an empty form.
    await expect(box(v, 'voucher-amount')).toHaveValue('');
    await expect(box(v, 'voucher-purpose')).toHaveValue('');
    await choose(page, v, 'voucher-account', /Petty cash/);
    await choose(page, v, 'voucher-category', /Cleaning/);
    await box(v, 'voucher-amount').fill(amount);
    await box(v, 'voucher-counterparty').fill('Demo Hardware Store');
    await box(v, 'voucher-purpose').fill(purpose);
    await v.getByTestId('voucher-sample-evidence').click();
    await v.getByTestId('voucher-create-submit').click();
    await expect(v).toBeHidden();
    made.push(await created(page, '/finance/vouchers', before));
  }
  expect(made[0]!.ref).not.toBe(made[1]!.ref);
  const list = await api<{ items: Array<{ id: string; purpose: string; amount: { amount: string } }> }>(page, '/finance/vouchers');
  const mine = (list.ok ? list.res.items : []).filter((x) => made.some((m) => m.id === x.id));
  expect(mine.map((x) => [x.purpose, x.amount.amount]).sort()).toEqual([['Cleaning supplies for the lobby', '1200.00'], ['Light bulbs for the parking area', '800.00']]);
  await expect(page.getByTestId('toast-success').filter({ hasText: `${made[1]!.ref} sent for approval` })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('FIN-02: Imran’s second deposit in the same visit starts from an empty form and is a second instruction with its own toast', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await at(page);
  await seedSociety(page, { staff: IMRAN });
  await office(page, IMRAN, '/backoffice/bank/transfers', 'transfers-page');
  const made: Array<{ id: string; ref: string }> = [];
  for (const [amount, purpose] of [['2000', 'Bank the office cash of Monday'], ['1500', 'Bank the office cash of Tuesday']] as const) {
    const before = await ids(page, '/finance/transfers');
    await page.getByTestId('new-transfer').click();
    const form = page.getByTestId('new-transfer-drawer');
    await expect(form).toBeVisible();
    await expect(box(form, 'transfer-amount')).toHaveValue('');
    await expect(box(form, 'transfer-purpose')).toHaveValue('');
    await choose(page, form, 'transfer-from', /Office cash box/);
    await choose(page, form, 'transfer-to', /Association account/);
    await box(form, 'transfer-amount').fill(amount);
    await box(form, 'transfer-purpose').fill(purpose);
    await form.getByTestId('transfer-submit').click();
    // The new instruction opens; its toast waits until that drawer is closed (toasts never hide behind it).
    await expect(page.getByTestId('transfer-drawer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('transfer-drawer')).toBeHidden();
    made.push(await created(page, '/finance/transfers', before));
  }
  expect(made[0]!.ref).not.toBe(made[1]!.ref);
  const list = await api<{ items: Array<{ id: string; amount: { amount: string } }> }>(page, '/finance/transfers');
  expect((list.ok ? list.res.items : []).filter((x) => made.some((m) => m.id === x.id)).map((x) => x.amount.amount).sort()).toEqual(['1500.00', '2000.00']);
  expect(consoleErrors).toEqual([]);
});

test('FIN-02: "New collection" twice in one visit starts two collections, each announced by its own reference', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await at(page);
  await seedSociety(page, { staff: SABA });
  await office(page, SABA, '/backoffice/fin/office-collections', 'office-collections-page');
  const made: Array<{ id: string; ref: string }> = [];
  for (let i = 0; i < 2; i++) {
    const before = await ids(page, '/office-collections');
    await page.getByTestId('new-batch').click();
    // The new collection opens; its toast waits until that drawer is closed.
    await expect(page.getByTestId('batch-drawer')).toBeVisible();
    const opened = new URL(page.url()).searchParams.get('batch');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('batch-drawer')).toBeHidden();
    made.push(await created(page, '/office-collections', before));
    expect(opened).toBe(made[i]!.id);
  }
  expect(made[0]!.ref).not.toBe(made[1]!.ref);
  expect(consoleErrors).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// The changed screens: widths, 320 px with 200 % text, dark mode with high contrast, keyboard
// ---------------------------------------------------------------------------------------------

/**
 * Where layout is checked. FIN-001 and BANK-007 carry layout defects this fix did not cause: at
 * 320 px / 200 % stat tiles clip their context line and a voucher file name and a flat code break
 * mid-word (the treasurer's unchanged view shows the same), and in dark mode the intro sentence wraps
 * "Al-Noor" at its hyphen. There only the parts this fix changed are checked; every other screen is
 * checked whole.
 */
const changedParts = (page: Page, name: string) =>
  name === 'finance-dashboard' ? [page.getByTestId('finance-accounts'), page.getByTestId('fin-unreconciled-restricted')] : name === 'cashbook' ? [page.getByTestId('cashbook-reconciliation')] : [page];

const SCREENS: Array<[string, string, string]> = [
  ['bank002-lines', ACCOUNT_LINES, 'account-workspace'],
  ['finance-dashboard', '/backoffice/fin/finance-dashboard', 'finance-dashboard'],
  ['cashbook', '/backoffice/bank/cashbook', 'cashbook-page'],
  ['transfers', '/backoffice/bank/transfers', 'transfers-page'],
];

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`Imran's restricted screens, ${lang(locale)}: axe at 1440, 768 and 390 px; 320 px at 200 % text not clipped; dark mode with high contrast; the keyboard reaches every control`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(360_000);
    await at(page);
    await seedSociety(page, { staff: IMRAN, locale });
    const { b405, a305 } = await proofsWithException(page);
    const screens: Array<[string, string, string]> = [...SCREENS, ['fin009-read-only', `/backoffice/fin/transfer-proof-review?record=${a305}`, 'review-read-only'], ['fin009-exception', `/backoffice/fin/transfer-proof-review?record=${b405}`, 'exception-card']];
    await become(page, 'backoffice', IMRAN);
    for (const [name, path, ready] of screens) {
      for (const [vp, size] of [['1440', VIEWPORTS.desktop], ['768', VIEWPORTS.tablet], ['390', VIEWPORTS.phone]] as const) {
        await page.setViewportSize(size);
        await page.goto(`${BO}${path}`);
        await expect(page.getByTestId(ready).first()).toBeVisible();
        await axe(page, testInfo, `${name}-${vp}-${locale}`);
        expect(await overflowOf(page), `${name} ${vp} ${locale}`).toBeLessThanOrEqual(0);
      }
    }
    // 320 px, text at 200 %.
    await page.setViewportSize(PHONE);
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), DISPLAY_IMRAN);
    for (const [name, path, ready] of screens) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      // FIN-001 and BANK-007: only the parts this fix changed (see `changedParts`); no screen scrolls sideways.
      for (const scope of changedParts(page, name)) expect(await layoutProblems(scope), `${name} 320 200 % ${locale}`).toEqual([]);
      expect(await overflowOf(page), `${name} 320 200 % ${locale}`).toBeLessThanOrEqual(0);
    }
    // The keyboard at 320 px and 200 %: every control reached, none under the header or the bar.
    for (const [name, path, ready] of [screens[0]!, screens[4]!]) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      const stops = await focusWalk(page, { header: OFFICE_HEADER, bar: OFFICE_BAR, max: 60 });
      expect(stops.length, `${name}: controls reached`).toBeGreaterThan(2);
      expect(stops.filter((s) => s.issue), `${name} ${locale}`).toEqual([]);
    }
    // Dark mode with high contrast at 390 px.
    await page.evaluate((key) => localStorage.removeItem(key), DISPLAY_IMRAN);
    await page.setViewportSize(VIEWPORTS.phone);
    const html = (n: string) => page.evaluate((a) => document.documentElement.getAttribute(a), n);
    await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
    await page.getByTestId('hub-theme-dark').click();
    await page.getByTestId('hub-contrast-high').click();
    await expect.poll(() => html('data-contrast')).toBe('high');
    await expect.poll(() => html('data-theme')).toBe('dark');
    for (const [name, path, ready] of screens) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      await axe(page, testInfo, `${name}-390-dark-contrast-${locale}`);
      for (const scope of changedParts(page, name)) expect(await layoutProblems(scope), `${name} dark ${locale}`).toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
  });
}
