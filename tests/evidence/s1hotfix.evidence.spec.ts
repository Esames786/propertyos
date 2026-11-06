import { mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { BO, expect, test, type Locale, type PersonaId } from '../support/fixtures';
import { become, seedSociety, societyApi, type SocietySeed } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * GitHub Issue #18 evidence (S.1/C.2 financial security hotfix) → docs/status/s1-hotfix/screenshots.
 * FIN-01: what Imran (building manager: cashbook, collections and deposits, no bank feed) sees on
 * BANK-002 and FIN-009 by deep link, the finance dashboard and the cashbook, in English and Urdu, on
 * a phone at 200 % text and in dark mode with high contrast; and what Ayesha (bank.view) keeps.
 * FIN-02: the second voucher and deposit of one visit, each with its own toast. The business date is
 * Monday 26 October 2026. Run against production builds:
 * `E2E_PORT_OFFSET=800 npx playwright test --project=evidence tests/evidence/s1hotfix.evidence.spec.ts`.
 */
const DIR = 'docs/status/s1-hotfix/screenshots';
const IMRAN: PersonaId = 'alnoor_manager';
const AYESHA: PersonaId = 'alnoor_treasurer';
const SABA: PersonaId = 'alnoor_accounts';
const DISPLAY_IMRAN = 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0001';
const LINES = '/backoffice/bank/bank-account-360-workspace?record=ben_anr_main&tab=lines';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');

async function settle(page: Page, ms = 500) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function as(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await page.goto(`${BO}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page);
}

async function context(browser: Browser, viewport: { width: number; height: number }, society: SocietySeed, scale?: number) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
  await seedSociety(page, society);
  if (scale) await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: DISPLAY_IMRAN, scale });
  return page;
}

const BAR_HIDDEN = '[data-testid="bottom-nav"] { visibility: hidden !important; }';
const shot = (page: Page, name: string, full = true) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full, ...(full ? { style: BAR_HIDDEN } : {}) });

/** Saba asks for an exception on B-405 with another payer's transfer; returns the B-405 and A-305 proofs. */
async function proofs(page: Page) {
  await as(page, SABA, '/backoffice/fin/unverified-transfers-queue', 'proof-inbox');
  const q = await societyApi<{ items: Array<{ id: string; flats: string[]; state: string }> }>(page, '/payment-submissions');
  const items = q.ok ? q.res.items : [];
  const b405 = items.find((r) => r.flats[0] === 'B-405' && r.state === 'submitted')!.id;
  const a305 = items.find((r) => r.flats[0] === 'A-305' && r.state === 'submitted')!.id;
  const d = await societyApi<{ candidates: Array<{ bankLine: { id: string; counterpartyName: string } }> }>(page, `/payment-submissions/${b405}`);
  const other = (d.ok ? d.res.candidates : []).find((c) => c.bankLine.counterpartyName === 'IMRAN HUSSAIN')!;
  await societyApi(page, `/payment-submissions/${b405}/exception`, 'POST', { bankLineId: other.bankLine.id, reason: 'Komal says her husband Imran sent it from his account; confirmed by phone.' });
  return { b405, a305 };
}

test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`FIN-01 ${lang(locale)} 1440: Imran's BANK-002 lines deep link, FIN-009 read-only and exception, dashboard, cashbook`, async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await context(browser, VIEWPORTS.desktop, { staff: IMRAN, locale });
    const { b405, a305 } = await proofs(page);
    await as(page, IMRAN, LINES, 'account-bank-restricted');
    await shot(page, `a01-bank002-imran-lines-deeplink-1440-${lang(locale)}`);
    await as(page, IMRAN, `/backoffice/fin/transfer-proof-review?record=${a305}`, 'review-bank-restricted');
    await shot(page, `a02-fin009-imran-read-only-1440-${lang(locale)}`);
    await as(page, IMRAN, `/backoffice/fin/transfer-proof-review?record=${b405}`, 'exception-card');
    await shot(page, `a03-fin009-imran-exception-1440-${lang(locale)}`);
    await as(page, IMRAN, '/backoffice/fin/finance-dashboard', 'fin-unreconciled-restricted');
    await shot(page, `a04-finance-dashboard-imran-1440-${lang(locale)}`);
    await as(page, IMRAN, '/backoffice/bank/cashbook', 'cashbook-bank-restricted');
    await shot(page, `a05-cashbook-imran-1440-${lang(locale)}`);
    await as(page, IMRAN, '/backoffice/bank/cashbook?drawer=close', 'close-drawer');
    await shot(page, `a06-close-checklist-imran-1440-${lang(locale)}`, false);
    await page.context().close();
  });

  test(`FIN-01 ${lang(locale)} phone 320 at 200 % and 390 dark with high contrast: BANK-002 and FIN-009 for Imran`, async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await context(browser, { width: 320, height: 700 }, { staff: IMRAN, locale }, 2);
    const { a305 } = await proofs(page);
    await as(page, IMRAN, LINES, 'account-bank-restricted');
    await shot(page, `b01-bank002-imran-320-200pct-${lang(locale)}`);
    await as(page, IMRAN, `/backoffice/fin/transfer-proof-review?record=${a305}`, 'review-bank-restricted');
    await shot(page, `b02-fin009-imran-320-200pct-${lang(locale)}`);
    await page.evaluate((key) => localStorage.removeItem(key), DISPLAY_IMRAN);
    await page.setViewportSize(VIEWPORTS.phone);
    await as(page, IMRAN, '/backoffice/global/accessibility-preferences', 'hub-theme');
    await page.getByTestId('hub-theme-dark').click();
    await page.getByTestId('hub-contrast-high').click();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-contrast'))).toBe('high');
    await as(page, IMRAN, LINES, 'account-bank-restricted');
    await shot(page, `b03-bank002-imran-dark-contrast-390-${lang(locale)}`);
    await as(page, IMRAN, `/backoffice/fin/transfer-proof-review?record=${a305}`, 'review-bank-restricted');
    await shot(page, `b04-fin009-imran-dark-contrast-390-${lang(locale)}`);
    await page.context().close();
  });
}

test('FIN-01 en 1440: Ayesha (bank.view) keeps the statement lines on BANK-002', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: AYESHA });
  await as(page, AYESHA, LINES, 'account-lines');
  await shot(page, 'c01-bank002-ayesha-lines-1440-en');
  await page.context().close();
});

test('FIN-02 en 1440: the second voucher and the second deposit of one visit, each with its own toast', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: SABA });
  await as(page, SABA, '/backoffice/bank/cashbook', 'cashbook-page');
  const box = (testId: string) => page.locator(`[data-testid="voucher-drawer"] :is(input, textarea)[data-testid="${testId}"], [data-testid="voucher-drawer"] [data-testid="${testId}"] :is(input, textarea)`).first();
  const choose = async (scope: string, testId: string, option: RegExp) => {
    await page.getByTestId(scope).getByTestId(testId).getByRole('button').click();
    await page.getByRole('option', { name: option }).first().click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
  };
  for (const [amount, purpose] of [['1200', 'Cleaning supplies for the lobby'], ['800', 'Light bulbs for the parking area']] as const) {
    await page.getByTestId('new-voucher').click();
    await page.getByTestId('voucher-drawer').waitFor();
    await choose('voucher-drawer', 'voucher-account', /Petty cash/);
    await choose('voucher-drawer', 'voucher-category', /Cleaning/);
    await box('voucher-amount').fill(amount);
    await box('voucher-counterparty').fill('Demo Hardware Store');
    await box('voucher-purpose').fill(purpose);
    await page.getByTestId('voucher-sample-evidence').click();
    await page.getByTestId('voucher-create-submit').click();
    await expect(page.getByTestId('voucher-drawer')).toBeHidden();
  }
  await expect(page.getByTestId('toast-success')).toHaveCount(2);
  await shot(page, 'd01-second-voucher-toast-1440-en', false);
  await as(page, IMRAN, '/backoffice/bank/transfers', 'transfers-page');
  const tbox = (testId: string) => page.locator(`[data-testid="new-transfer-drawer"] :is(input, textarea)[data-testid="${testId}"], [data-testid="new-transfer-drawer"] [data-testid="${testId}"] :is(input, textarea)`).first();
  for (const [amount, purpose] of [['2000', 'Bank the office cash of Monday'], ['1500', 'Bank the office cash of Tuesday']] as const) {
    await page.getByTestId('new-transfer').click();
    await page.getByTestId('new-transfer-drawer').waitFor();
    if (amount === '1500') await shot(page, 'd02-new-transfer-drawer-empty-again-1440-en', false);
    await choose('new-transfer-drawer', 'transfer-from', /Office cash box/);
    await choose('new-transfer-drawer', 'transfer-to', /Association account/);
    await tbox('transfer-amount').fill(amount);
    await tbox('transfer-purpose').fill(purpose);
    await page.getByTestId('transfer-submit').click();
    await page.getByTestId('transfer-drawer').getByTestId('transfer-state').waitFor();
    if (amount === '1500') await shot(page, 'd03-second-deposit-opened-1440-en', false);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('transfer-drawer')).toBeHidden();
  }
  // Closed: two instructions in the list, and the second create's own toast (held while its drawer was open).
  await expect(page.getByTestId('toast-success').filter({ hasText: 'ANR-TRF-2026-0002' })).toBeVisible();
  await shot(page, 'd04-second-deposit-toast-1440-en', false);
  await page.context().close();
});
