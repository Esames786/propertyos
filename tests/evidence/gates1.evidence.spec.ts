import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, Locator, Page } from '@playwright/test';
import { BO, CU, test, type Locale, type PersonaId } from '../support/fixtures';
import { become, seedSociety, societyApi, type SocietySeed } from '../support/society';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * Gate S.1 evidence (society finance, bulk office collection, committee approvals; the other S.1
 * screens; phones in both languages at 320/390 px and 200 % text; dark and high contrast)
 * → docs/status/gate-s1/{screenshots,video}. Run on its own against production builds, beside other
 * checkouts on isolated ports if needed:
 * `E2E_PORT_OFFSET=100 npx playwright test --project=evidence tests/evidence/gates1.evidence.spec.ts --output=test-results-s1`.
 */
const DIR = 'docs/status/gate-s1/screenshots';
const VIDEO = 'docs/status/gate-s1/video';
const RAW = 'test-results-s1/gates1-video';
const api = societyApi;
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const width = (vp: ViewportName) => VIEWPORTS[vp].width;
const PRINCIPAL: Partial<Record<PersonaId, string>> = {
  alnoor_manager: 'usr_anr_0001',
  alnoor_treasurer: 'usr_anr_0002',
  alnoor_admin: 'usr_anr_r0003',
  alnoor_accounts: 'usr_anr_0004',
};

async function settle(page: Page, ms = 700) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function open(page: Page, path: string, ready: string, ms = 700) {
  await page.goto(`${BO}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page, ms);
}

async function as(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await open(page, path, ready);
}

/** Office display preferences (D.1) for one colleague, written once before the first load. */
async function display(page: Page, persona: PersonaId, patch: Record<string, unknown>) {
  const key = `pref:display:v1:backoffice:tnt_alnoor:${PRINCIPAL[persona]}`;
  const value = JSON.stringify({ version: 2, textScale: 1, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z', ...patch });
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(`evidence:${key}`)) return;
      localStorage.setItem(`evidence:${key}`, '1');
      localStorage.setItem(key, value);
    },
    { key, value },
  );
}

async function context(browser: Browser, vp: ViewportName, society: SocietySeed, video = false) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], ...(video ? { recordVideo: { dir: RAW, size: VIEWPORTS[vp] } } : {}) });
  const page = await ctx.newPage();
  await seedSociety(page, society);
  return page;
}

const shot = (page: Page, name: string, full = true) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full });

async function keepVideo(page: Page, name: string) {
  const video = page.video();
  await page.context().close();
  if (!video) return;
  mkdirSync(VIDEO, { recursive: true });
  copyFileSync(await video.path(), `${VIDEO}/${name}.webm`);
}

const box = (scope: Page | Locator, testId: string) =>
  scope.locator(`:is(input, textarea)[data-testid="${testId}"], [data-testid="${testId}"] :is(input, textarea)`).first();

async function choose(scope: Page | Locator, page: Page, testId: string, option: RegExp | string) {
  await scope.getByTestId(testId).getByRole('button').click();
  await page.getByRole('option', { name: option }).first().click();
  // The list closes before the next click (a click during its exit is taken as 'dismiss').
  await page.waitForFunction(() => !document.querySelector('[role=listbox]'));
}

async function decide(page: Page, persona: PersonaId, approvalId: string, reason: string, name?: string) {
  await as(page, persona, `/backoffice/apr/approval-360-view?record=${approvalId}`, 'approval-workspace');
  await page.getByTestId('approval-decide').click();
  const drawer = page.getByTestId('decide-drawer');
  await box(drawer, 'decide-reason').fill(reason);
  await settle(page, 300);
  if (name) await shot(page, name, false);
  await drawer.getByTestId('decide-submit').click();
  await drawer.waitFor({ state: 'hidden' });
  await settle(page, 400);
}

const recordOf = (href: string | null) => new URL(href!, BO).searchParams.get('record')!;

test.describe.configure({ mode: 'parallel' });

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const vp: ViewportName = locale === 'ur-PK' ? 'phone' : 'desktop';
  const w = width(vp);
  const l = lang(locale);

  test(`Reference 1: society finance, dashboard to settled deposit (${l})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await context(browser, vp, { staff: 'alnoor_treasurer', locale }, locale === 'en-PK');
    await open(page, '/backoffice/fin/finance-dashboard', 'finance-dashboard');
    await shot(page, `f01-finance-dashboard-${w}-${l}`);
    await open(page, '/backoffice/bank/cashbook?period=2026-10', 'cashbook-page');
    await shot(page, `f02-cashbook-october-${w}-${l}`);
    await open(page, '/backoffice/bank/bank-accounts', 'bank-accounts-page');
    await shot(page, `f03-cash-and-bank-accounts-${w}-${l}`);
    await open(page, '/backoffice/bank/bank-account-360-workspace?record=cac_anr_office', 'account-workspace');
    await shot(page, `f04-office-cash-workspace-${w}-${l}`);
    await open(page, '/backoffice/bank/cashbook?drawer=close&period=2026-10', 'close-drawer');
    await shot(page, `f05-close-october-blocked-${w}-${l}`, false);

    // A cash deposit: instruction, approval, witnessed slip, matched statement line.
    await as(page, 'alnoor_manager', '/backoffice/bank/transfers', 'transfers-page');
    await page.getByTestId('new-transfer').click();
    const form = page.getByTestId('new-transfer-drawer');
    await choose(form, page, 'transfer-from', /Office cash box|دفتر/);
    await choose(form, page, 'transfer-to', /Association account|ایسوسی ایشن/);
    await box(form, 'transfer-amount').fill('10000');
    await box(form, 'transfer-purpose').fill(locale === 'ur-PK' ? 'ہفتے کی دفتری نقدی بینک میں جمع' : 'Bank the office cash of the week');
    await settle(page, 300);
    await shot(page, `f06-new-deposit-${w}-${l}`, false);
    await form.getByTestId('transfer-submit').click();
    const drawer = page.getByTestId('transfer-drawer');
    await drawer.getByTestId('approval-panel').waitFor();
    await settle(page);
    await shot(page, `f07-deposit-awaiting-approval-${w}-${l}`, false);
    const approvalId = recordOf(await drawer.getByTestId('open-approval').getAttribute('href'));
    const transferUrl = page.url().replace(BO, '');
    await decide(page, 'alnoor_treasurer', approvalId, 'Checked against the cash count sheet.');
    await as(page, 'alnoor_manager', transferUrl, 'transfer-drawer');
    await shot(page, `f08-approved-instruction-not-sent-${w}-${l}`, false);
    await box(page, 'leg-out-slip').fill('DS-0412');
    await page.getByTestId('leg-out-record-slip').click();
    await settle(page);
    await as(page, 'alnoor_treasurer', transferUrl, 'transfer-drawer');
    await page.getByTestId('leg-out-witness').click();
    await settle(page);
    await shot(page, `f09-in-transit-${w}-${l}`, false);
    await as(page, 'alnoor_accounts', '/backoffice/bank/transfers?drawer=statement', 'demo-statement-drawer');
    const demo = page.getByTestId('demo-statement-drawer');
    await demo.getByTestId('demo-generate').click();
    await demo.getByTestId('demo-file').waitFor();
    await settle(page, 300);
    await shot(page, `f10-demo-statement-${w}-${l}`, false);
    await demo.getByTestId('demo-import').click();
    await demo.waitFor({ state: 'hidden' });
    await open(page, transferUrl, 'transfer-drawer');
    await page.getByTestId('leg-in-candidates').locator('[data-strength="full"]').first().click();
    await settle(page, 300);
    await shot(page, `f11-match-statement-line-${w}-${l}`, false);
    await page.getByTestId('leg-in-match').click();
    await page.getByTestId('leg-in-settled').waitFor();
    await settle(page);
    await shot(page, `f12-deposit-settled-${w}-${l}`, false);
    await as(page, 'alnoor_treasurer', '/backoffice/bank/cashbook?period=2026-10', 'cashbook-page');
    await shot(page, `f13-cashbook-after-deposit-${w}-${l}`);
    if (locale === 'en-PK') await keepVideo(page, 'ref1-finance-deposit-desktop-en');
    else await page.context().close();
  });

  test(`Reference 2: bulk office collection, cash witnessed and a cheque pending (${l})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await context(browser, vp, { staff: 'alnoor_treasurer', locale }, locale === 'en-PK');
    await open(page, '/backoffice/fin/office-collections', 'office-collections-page');
    await api(page, '/sites/site_alnoor/payment-methods', 'PATCH', { method: 'office_cash', enabled: true });
    await api(page, '/sites/site_alnoor/cheque-rules', 'PATCH', { enabled: true, payableTo: 'Al-Noor Residency Owners’ Association (Demo)', depositAccountId: 'ben_anr_main', maxPostDatedDays: 0 });
    await api(page, '/sites/site_alnoor/payment-methods', 'PATCH', { method: 'cheque', enabled: true });
    await as(page, 'alnoor_accounts', '/backoffice/fin/office-collections', 'office-collections-page');
    await shot(page, `c01-office-collections-${w}-${l}`);
    await page.getByTestId('new-batch').click();
    const drawer = page.getByTestId('batch-drawer');
    const add = async (q: string, method: 'add-cash' | 'add-cheque') => {
      await box(drawer, 'batch-find').fill(q);
      await drawer.getByTestId('batch-candidate').filter({ hasText: q }).first().getByTestId(method).click();
    };
    await add('A-404', 'add-cash');
    await add('B-306', 'add-cash');
    await add('A-101', 'add-cheque');
    await box(drawer, 'batch-line-amount-0').fill('8400');
    await box(drawer, 'batch-line-amount-1').fill('12600');
    await box(drawer, 'batch-line-amount-2').fill('5200');
    await box(drawer, 'batch-line-bank-2').fill('Demo Bank');
    await box(drawer, 'batch-line-number-2').fill('004512');
    await drawer.getByTestId('batch-save').click();
    await settle(page);
    await shot(page, `c02-batch-draft-${w}-${l}`, false);
    await box(drawer, 'batch-declared').fill('21000');
    await drawer.getByTestId('batch-submit').click();
    await drawer.getByTestId('batch-not-yours').waitFor();
    await settle(page);
    await shot(page, `c03-batch-submitted-collector-cannot-confirm-${w}-${l}`, false);
    const batchUrl = page.url().replace(BO, '');
    await as(page, 'alnoor_treasurer', batchUrl, 'batch-drawer');
    await box(page, 'batch-counted').fill('21000');
    await settle(page, 300);
    await shot(page, `c04-batch-witness-count-${w}-${l}`, false);
    await page.getByTestId('batch-confirm').click();
    await page.getByTestId('batch-confirmed-cheques').waitFor();
    await settle(page);
    await shot(page, `c05-batch-confirmed-receipts-and-cheque-${w}-${l}`, false);
    await open(page, '/backoffice/fin/office-collections?tab=cheques', 'cheques-tab');
    await shot(page, `c06-cheques-pending-${w}-${l}`);
    await page.getByTestId('cheque-row').first().click();
    await page.getByTestId('cheque-drawer').waitFor();
    await settle(page);
    await shot(page, `c07-cheque-received-not-a-receipt-${w}-${l}`, false);
    if (locale === 'en-PK') await keepVideo(page, 'ref2-office-collection-desktop-en');
    else await page.context().close();
  });

  test(`Reference 3: committee approvals, two signatories and the audit (${l})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await context(browser, vp, { staff: 'alnoor_admin', locale }, locale === 'en-PK');
    await open(page, '/backoffice/committee', 'committee-page');
    await shot(page, `g01-committee-terms-${w}-${l}`);
    await open(page, '/backoffice/committee?tab=offices', 'committee-offices');
    await shot(page, `g02-committee-offices-and-authority-${w}-${l}`);
    await open(page, '/backoffice/apr/approval-settings', 'policies-page');
    await shot(page, `g03-approval-policy-v1-${w}-${l}`);
    await as(page, 'alnoor_accounts', '/backoffice/bank/cashbook?drawer=voucher', 'voucher-drawer');
    const v = page.getByTestId('voucher-drawer');
    await choose(v, page, 'voucher-account', /Office cash box|دفتر/);
    await choose(v, page, 'voucher-category', /Repairs|مرمت/);
    await box(v, 'voucher-amount').fill('12000');
    await box(v, 'voucher-counterparty').fill('Gulberg Electric Works (Demo)');
    await box(v, 'voucher-purpose').fill(locale === 'ur-PK' ? 'پانی کی موٹر کی وائنڈنگ' : 'Water pump motor rewinding');
    await v.getByTestId('voucher-sample-evidence').click();
    await settle(page, 300);
    await shot(page, `g04-cash-voucher-${w}-${l}`, false);
    await v.getByTestId('voucher-create-submit').click();
    await v.waitFor({ state: 'hidden' });
    const vouchers = await api<{ items: Array<{ approvalId?: string; amount: { amount: string } }> }>(page, '/finance/vouchers', 'GET', {}, { status: 'submitted' });
    const approvalId = (vouchers.ok ? vouchers.res.items : []).find((x) => x.amount.amount === '12000.00')!.approvalId!;
    await open(page, `/backoffice/apr/approval-360-view?record=${approvalId}`, 'approval-workspace');
    await shot(page, `g05-approval-preparer-cannot-decide-${w}-${l}`);
    await as(page, 'alnoor_treasurer', '/backoffice/apr/my-approvals', 'approvals-inbox');
    await shot(page, `g06-my-approvals-${w}-${l}`);
    await decide(page, 'alnoor_treasurer', approvalId, 'Quotation and bill checked.', `g07-decide-drawer-${w}-${l}`);
    await shot(page, `g08-approval-first-signatory-${w}-${l}`);
    await decide(page, 'alnoor_admin', approvalId, 'Second signatory: quotation checked.');
    await shot(page, `g09-approval-approved-with-audit-${w}-${l}`);
    await as(page, 'alnoor_treasurer', '/backoffice/apr/delegation', 'delegation-page');
    await shot(page, `g10-delegation-${w}-${l}`);
    if (locale === 'en-PK') await keepVideo(page, 'ref3-committee-approvals-desktop-en');
    else await page.context().close();
  });

  test(`Other S.1 screens: reminders, print pack, transfers and clearance, resident cheque (${l})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await context(browser, vp, { staff: 'alnoor_accounts', locale });
    await open(page, '/backoffice/col/reminders', 'reminders-page');
    await shot(page, `o01-reminders-${w}-${l}`);
    await page.getByTestId('reminders-send-open').click();
    await page.getByTestId('send-reminder-drawer').getByTestId('reminder-row').first().waitFor();
    await settle(page);
    await shot(page, `o02-reminder-preview-skips-${w}-${l}`, false);
    await as(page, 'alnoor_manager', '/backoffice/own/transfers-list', 'ownership-page');
    await shot(page, `o03-transfers-and-clearance-${w}-${l}`);
    const created = await api<{ transfer: { id: string } }>(page, '/ownership-transfers', 'POST', { flatId: 'unt_anr_b403', toName: 'Nadia Farooq', toPhone: '+92 399 555 0142', effectiveOn: '2026-12-01', reason: 'Sale deed registered on 20 October 2026' });
    if (created.ok) {
      await open(page, `/backoffice/own/transfer-review-approval?record=${created.res.transfer.id}`, 'ownership-workspace');
      await page.getByTestId('ownership-check').click();
      await page.getByTestId('ownership-outstanding').waitFor();
      await settle(page);
      await shot(page, `o04-transfer-dues-check-${w}-${l}`);
    }
    await as(page, 'alnoor_treasurer', '/backoffice/bank/cashbook?drawer=close&period=2026-09', 'close-drawer');
    await shot(page, `o05-september-closed-reopen-${w}-${l}`, false);
    await page.goto(`${CU}/customer/portal/payment-history`);
    await page.getByTestId('dues-history').first().waitFor();
    await settle(page);
    await shot(page, `o06-resident-payment-history-${w}-${l}`);
    await page.context().close();
  });
}

test('Phones: every S.1 screen at 390 px and at 320 px with 200 % text, English and Urdu', async ({ browser }) => {
  test.setTimeout(600_000);
  const screens: Array<[string, string, string, PersonaId]> = [
    ['m01-dashboard', '/backoffice/fin/finance-dashboard', 'finance-dashboard', 'alnoor_treasurer'],
    ['m02-cashbook', '/backoffice/bank/cashbook', 'cashbook-page', 'alnoor_treasurer'],
    ['m03-transfers', '/backoffice/bank/transfers', 'transfers-page', 'alnoor_manager'],
    ['m04-office-collections', '/backoffice/fin/office-collections', 'office-collections-page', 'alnoor_accounts'],
    ['m05-approvals', '/backoffice/apr/my-approvals', 'approvals-inbox', 'alnoor_treasurer'],
    ['m06-committee', '/backoffice/committee', 'committee-page', 'alnoor_admin'],
    ['m07-reminders', '/backoffice/col/reminders', 'reminders-page', 'alnoor_accounts'],
  ];
  for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
    for (const [name, path, ready, persona] of screens) {
      for (const [vp, scale] of [['phone', 1], ['reflow', 2]] as const) {
        const page = await context(browser, vp, { staff: persona, locale });
        if (scale !== 1) await display(page, persona, { textScale: scale });
        await open(page, path, ready);
        await shot(page, `${name}-${width(vp)}${scale === 2 ? '-200' : ''}-${lang(locale)}`);
        await page.context().close();
      }
    }
  }
});

test('Themes: dark and high contrast on the three reference experiences', async ({ browser }) => {
  test.setTimeout(300_000);
  const variants: Array<[string, ViewportName, Locale, PersonaId, string, string, Record<string, unknown>]> = [
    ['t01-dashboard-dark', 'desktop', 'en-PK', 'alnoor_treasurer', '/backoffice/fin/finance-dashboard', 'finance-dashboard', { theme: 'dark' }],
    ['t02-cashbook-high-contrast', 'desktop', 'en-PK', 'alnoor_treasurer', '/backoffice/bank/cashbook', 'cashbook-page', { contrast: 'high' }],
    ['t03-office-collections-dark', 'phone', 'ur-PK', 'alnoor_accounts', '/backoffice/fin/office-collections', 'office-collections-page', { theme: 'dark' }],
    ['t04-committee-high-contrast', 'phone', 'ur-PK', 'alnoor_admin', '/backoffice/committee', 'committee-page', { contrast: 'high' }],
    ['t05-approvals-dark-high-contrast', 'desktop', 'en-PK', 'alnoor_treasurer', '/backoffice/apr/my-approvals', 'approvals-inbox', { theme: 'dark', contrast: 'high' }],
  ];
  for (const [name, vp, locale, persona, path, ready, patch] of variants) {
    const page = await context(browser, vp, { staff: persona, locale });
    await display(page, persona, patch);
    await open(page, path, ready);
    await shot(page, `${name}-${width(vp)}-${lang(locale)}`);
    await page.context().close();
  }
});

test('video: phone in Urdu at 200 %: finance dashboard, a figure to its records, the cashbook', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await context(browser, 'phone', { staff: 'alnoor_treasurer', locale: 'ur-PK' }, true);
  await display(page, 'alnoor_treasurer', { textScale: 2 });
  await open(page, '/backoffice/fin/finance-dashboard', 'finance-dashboard', 1200);
  await page.mouse.wheel(0, 900);
  await settle(page, 1200);
  await page.getByTestId('fin-unreconciled').click();
  await settle(page, 1500);
  await open(page, '/backoffice/bank/cashbook', 'cashbook-page', 1200);
  await page.mouse.wheel(0, 1200);
  await settle(page, 1200);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await settle(page, 800);
  await keepVideo(page, 'phone-ur-200-finance');
});
