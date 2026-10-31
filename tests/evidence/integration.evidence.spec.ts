import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { BO, CU, test, type Locale, type PersonaId } from '../support/fixtures';
import { become, seedSociety, societyApi, type SocietySeed } from '../support/society';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * D.1 + S.1 integration evidence (Issue #6) → docs/status/integration-d1-s1/{screenshots,video}: the
 * cashbook as cards on phones and at 200 % text, the single office cash payment waiting for a second
 * count (D-46), timestamps around midnight in Asia/Karachi, and representative D.1 and S.1 screens on
 * the integrated code. Run on its own against production builds (isolated ports if needed):
 * `E2E_PORT_OFFSET=100 npx playwright test --project=evidence tests/evidence/integration.evidence.spec.ts`.
 */
const DIR = 'docs/status/integration-d1-s1/screenshots';
const VIDEO = 'docs/status/integration-d1-s1/video';
const RAW = 'test-results-int/integration-video';
const api = societyApi;
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const width = (vp: ViewportName) => VIEWPORTS[vp].width;
const PRINCIPAL: Partial<Record<PersonaId, string>> = { alnoor_manager: 'usr_anr_0001', alnoor_treasurer: 'usr_anr_0002', alnoor_admin: 'usr_anr_r0003', alnoor_accounts: 'usr_anr_0004' };

async function settle(page: Page, ms = 700) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function open(page: Page, url: string, ready: string, ms = 700) {
  await page.goto(url);
  await page.getByTestId(ready).first().waitFor();
  await settle(page, ms);
}

async function display(page: Page, persona: PersonaId, patch: Record<string, unknown>) {
  const key = `pref:display:v1:backoffice:tnt_alnoor:${PRINCIPAL[persona]}`;
  const value = JSON.stringify({ version: 2, textScale: 1, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z', ...patch });
  await page.addInitScript(({ key, value }) => {
    if (localStorage.getItem(`evidence:${key}`)) return;
    localStorage.setItem(`evidence:${key}`, '1');
    localStorage.setItem(key, value);
  }, { key, value });
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

test.describe.configure({ mode: 'parallel' });

test('Mobile cashbook: cards at 320 px with 200 % text and at 390 px, the desktop table, English and Urdu', async ({ browser }) => {
  test.setTimeout(300_000);
  const cases: Array<[string, ViewportName, Locale, number, Record<string, unknown>]> = [
    ['k01-cashbook-cards', 'reflow', 'ur-PK', 2, {}],
    ['k01-cashbook-cards', 'reflow', 'en-PK', 2, {}],
    ['k02-cashbook-cards', 'phone', 'ur-PK', 1, {}],
    ['k02-cashbook-cards', 'phone', 'en-PK', 1, {}],
    ['k03-cashbook-cards-dark', 'phone', 'ur-PK', 2, { theme: 'dark' }],
    ['k04-cashbook-table', 'desktop', 'en-PK', 1, {}],
    ['k04-cashbook-table', 'desktop', 'ur-PK', 1, {}],
  ];
  for (const [name, vp, locale, scale, patch] of cases) {
    const page = await context(browser, vp, { staff: 'alnoor_treasurer', locale });
    await display(page, 'alnoor_treasurer', { textScale: scale, ...patch });
    await open(page, `${BO}/backoffice/bank/cashbook?period=2026-10`, vp === 'desktop' ? 'cashbook-lines' : 'cashbook-cards');
    await shot(page, `${name}-${width(vp)}${scale === 2 ? '-200' : ''}-${lang(locale)}`);
    await page.context().close();
  }
});

test('Single office cash (D-46): recorded, waiting for a second count, confirmed, then receipted (desktop, English; resident on a phone in Urdu)', async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await context(browser, 'desktop', { staff: 'alnoor_treasurer' }, true);
  await open(page, `${BO}/backoffice/fin/finance-dashboard`, 'finance-dashboard');
  await api(page, '/sites/site_alnoor/payment-methods', 'PATCH', { method: 'office_cash', enabled: true });
  await become(page, 'backoffice', 'alnoor_accounts');
  await open(page, `${BO}/backoffice/fin/payment-list?drawer=office&account=ba_anr_a101`, 'office-drawer');
  const drawer = page.getByTestId('office-drawer');
  await drawer.getByTestId('office-amount').fill('3000');
  await page.getByTestId('office-preview').waitFor();
  await settle(page, 600);
  await shot(page, 'c01-office-cash-rule-1440-en', false);
  await drawer.getByTestId('office-submit').click();
  await drawer.getByTestId('office-awaiting-count').waitFor();
  await settle(page);
  await shot(page, 'c02-office-cash-awaiting-count-1440-en', false);
  const href = await drawer.getByTestId('office-open-collection').getAttribute('href');
  await open(page, `${BO}/backoffice/billing/accounts/ba_anr_a101`, 'account-cash-awaiting');
  await shot(page, 'c03-account-cash-awaiting-1440-en', false);
  await become(page, 'backoffice', 'alnoor_treasurer');
  await open(page, `${BO}/backoffice`, 'society-dashboard');
  await shot(page, 'c04-dashboard-count-office-cash-1440-en', false);
  await open(page, `${BO}/backoffice/apr/my-approvals?tab=fixed`, 'approvals-fixed');
  await shot(page, 'c05-approvals-office-cash-to-count-1440-en', false);
  await open(page, `${BO}${href!}`, 'batch-drawer');
  await page.getByTestId('batch-counted').fill('3000');
  await settle(page, 500);
  await shot(page, 'c06-second-count-1440-en', false);
  await page.getByTestId('batch-confirm').click();
  await page.getByTestId('line-receipt').waitFor();
  await settle(page);
  await shot(page, 'c07-confirmed-receipt-1440-en', false);
  await keepVideo(page, 'single-office-cash-second-count-desktop-en');

  // The resident's side on a phone, in Urdu: before the count (not paid), and after (receipt).
  const phone = await context(browser, 'phone', { staff: 'alnoor_treasurer', locale: 'ur-PK' });
  await open(phone, `${BO}/backoffice/fin/finance-dashboard`, 'finance-dashboard');
  await api(phone, '/sites/site_alnoor/payment-methods', 'PATCH', { method: 'office_cash', enabled: true });
  await become(phone, 'backoffice', 'alnoor_accounts');
  await open(phone, `${BO}/backoffice/fin/payment-list`, 'payments-page');
  const recorded = await api<{ batch: { id: string } }>(phone, '/payments/office', 'POST', { accountId: 'ba_anr_a101', payerPartyId: 'pty_anr_0001', amount: '3000' });
  await open(phone, `${CU}/customer/portal/home`, 'dues-cash-awaiting');
  await shot(phone, 'c08-resident-cash-awaiting-390-ur');
  await become(phone, 'backoffice', 'alnoor_treasurer');
  await open(phone, `${BO}/backoffice/fin/office-collections?batch=${recorded.ok ? recorded.res.batch.id : ''}`, 'batch-drawer');
  await shot(phone, 'c09-second-count-390-ur', false);
  await phone.context().close();
});

test('Timestamps in Asia/Karachi around midnight: an approval at 23:59 and a posting at 00:00 stay on 26 October', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await context(browser, 'desktop', { staff: 'alnoor_treasurer' });
  await page.clock.setFixedTime(new Date('2026-10-31T18:59:40Z')); // 23:59:40 in Karachi
  await open(page, `${BO}/backoffice/apr/approval-360-view?record=apr_anr_0004`, 'approval-workspace');
  await page.getByTestId('approval-decide').click();
  await page.getByTestId('decide-drawer').getByTestId('decide-reason').fill('Lift call-out checked against the bill.');
  await page.getByTestId('decide-drawer').getByTestId('decide-submit').click();
  await page.getByTestId('decide-drawer').waitFor({ state: 'hidden' });
  await settle(page);
  await shot(page, 't01-approval-at-2359-karachi-1440-en');
  await page.clock.setFixedTime(new Date('2026-10-31T19:00:15Z')); // 00:00:15 in Karachi
  await become(page, 'backoffice', 'alnoor_accounts');
  await open(page, `${BO}/backoffice/bank/cashbook`, 'cashbook-page');
  const list = await api<{ items: Array<{ id: string; amount: { amount: string } }> }>(page, '/finance/vouchers', 'GET', {}, { status: 'approved' });
  const lift = (list.ok ? list.res.items : []).find((v) => v.amount.amount === '7500.00')!;
  await api(page, `/finance/vouchers/${lift.id}/post`, 'POST');
  await open(page, `${BO}/backoffice/bank/cashbook?period=2026-10&voucher=${lift.id}`, 'voucher-drawer');
  await shot(page, 't02-voucher-posted-at-0000-karachi-1440-en', false);
  await page.context().close();
});

test('Representative D.1 and S.1 screens on the integrated code, desktop and phone, English and Urdu', async ({ browser }) => {
  test.setTimeout(420_000);
  const screens: Array<[string, string, string, PersonaId, 'office' | 'resident']> = [
    ['r01-finance-dashboard', '/backoffice/fin/finance-dashboard', 'finance-dashboard', 'alnoor_treasurer', 'office'],
    ['r02-office-collections', '/backoffice/fin/office-collections', 'office-collections-page', 'alnoor_accounts', 'office'],
    ['r03-committee', '/backoffice/committee', 'committee-page', 'alnoor_admin', 'office'],
    ['r04-approvals', '/backoffice/apr/my-approvals', 'approvals-inbox', 'alnoor_treasurer', 'office'],
    ['r05-personalization-hub', '/backoffice/global/accessibility-preferences', 'personalization-hub', 'alnoor_manager', 'office'],
    ['r06-resident-access', '/backoffice/residents/portal-access', 'portal-access', 'alnoor_manager', 'office'],
    ['r07-resident-home', '/customer/portal/home', 'dues-home', 'alnoor_treasurer', 'resident'],
  ];
  for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
    for (const vp of ['desktop', 'phone'] as ViewportName[]) {
      for (const [name, path, ready, persona, app] of screens) {
        const page = await context(browser, vp, { staff: persona, locale });
        await open(page, `${app === 'resident' ? CU : BO}${path}`, ready);
        await shot(page, `${name}-${width(vp)}-${lang(locale)}`);
        await page.context().close();
      }
    }
  }
});

test('video: the cashbook as cards on a phone in Urdu at 200 %: scroll, a card to its record, back', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await context(browser, 'phone', { staff: 'alnoor_treasurer', locale: 'ur-PK' }, true);
  await display(page, 'alnoor_treasurer', { textScale: 2 });
  await open(page, `${BO}/backoffice/bank/cashbook?period=2026-10`, 'cashbook-cards', 1200);
  await page.getByTestId('cashbook-cards').scrollIntoViewIfNeeded();
  await settle(page, 1200);
  await page.mouse.wheel(0, 1400);
  await settle(page, 1200);
  await page.getByTestId('cashbook-card-link').nth(1).focus();
  await settle(page, 800);
  await page.keyboard.press('Enter');
  await settle(page, 1500);
  await page.goBack();
  await settle(page, 1200);
  await keepVideo(page, 'phone-ur-200-cashbook-cards');
});
