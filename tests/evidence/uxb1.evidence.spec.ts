import { mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { BO, CU, displayKey, expect, test, type Locale, type PersonaId } from '../support/fixtures';
import { become, seedSociety, societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * UX repair batch B1 "Money truth" evidence → docs/status/ux-b1/screenshots. The shared scenario (office
 * cash of Rs 6,000 on A-101 that left Rs 800 credit, then reversed after an approval) on the receipt,
 * Home, the bill, the history, My properties, the payments list, the dashboard and the statement; the
 * credit-note cap (COL-01); a voucher draft found again and a voucher reversal (FIN-03); the policy draft
 * (FIN-04); "Waiting for verification" (COL-04); the credited bill and the pending proof (RES-12,
 * RES-03). English and Urdu; desktop, phone, and 320 px at 200 % text (`…-200pct-320-xx`). The business
 * date is Monday 26 October 2026. Run against production builds:
 * `E2E_PORT_OFFSET=1000 npx playwright test --project=evidence tests/evidence/uxb1.evidence.spec.ts`.
 */
const DIR = 'docs/status/ux-b1/screenshots';
const SABA: PersonaId = 'alnoor_accounts';
const AYESHA: PersonaId = 'alnoor_treasurer';
const RABIA: PersonaId = 'alnoor_admin';
const KAMRAN: PersonaId = 'alnoor_resident_a101';
const REASON = 'Recorded against the wrong flat by mistake';
const OFFICE_DISPLAY = ['pref:display:v1:backoffice:tnt_alnoor:usr_anr_0004', 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0002'];
const PHONE = { width: 320, height: 700 };
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const api = societyApi;

async function settle(page: Page, ms = 500) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function ok<T>(p: Promise<{ ok: true; res: T } | { ok: false; code: string; status: number }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`API refused: ${r.status} ${r.code}`);
  return r.res;
}

async function office(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await page.goto(`${BO}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page);
}

async function portal(page: Page, path: string, ready: string, persona: PersonaId = KAMRAN) {
  await become(page, 'customer', persona);
  await page.goto(`${CU}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page);
}

async function context(browser: Browser, viewport: { width: number; height: number }, locale: Locale, staff: PersonaId = SABA) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
  await seedSociety(page, { staff, locale });
  return page;
}

/** Text at 200 % (each person's own saved setting) in both apps. Only ever raised within one browser context: the apps keep the larger size. */
async function textAt(page: Page, scale: 2) {
  const value = JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' });
  await page.goto(`${BO}/backoffice/global/my-access`);
  await page.evaluate(({ keys, value }) => keys.forEach((k) => localStorage.setItem(k, value)), { keys: OFFICE_DISPLAY, value });
  await page.goto(`${CU}/customer/portal/home`);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify({ ...JSON.parse(value), version: 1 })), { key: displayKey(KAMRAN), value });
}

const OFFICE_BAR_HIDDEN = '[data-testid="bottom-nav"], [data-testid="portal-bottom-nav"] { visibility: hidden !important; }';
async function shot(page: Page, name: string, full = true) {
  const vw = page.viewportSize()!.width;
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full, ...(full ? { style: OFFICE_BAR_HIDDEN } : {}) });
  // The name says the viewport: the picture is exactly that wide.
  const m = /-(\d+)-(?:en|ur)$/.exec(name);
  if (m) expect(Number(m[1]), name).toBe(vw);
}

async function cashOnA101(page: Page, amount: string) {
  await office(page, AYESHA, '/backoffice/fin/payment-list', 'payments-page');
  await ok(api(page, '/sites/site_alnoor/payment-methods', 'PATCH', { method: 'office_cash', enabled: true }));
  await office(page, SABA, '/backoffice/fin/payment-list', 'payments-page');
  const flat = await ok(api<{ currentPayer: { partyId: string } }>(page, '/sites/site_alnoor/units/unt_anr_a101'));
  const recorded = await ok(api<{ batch: { id: string } }>(page, '/payments/office', 'POST', { accountId: 'ba_anr_a101', payerPartyId: flat.currentPayer.partyId, amount, idempotencyKey: `ev-b1-${amount}` }));
  await office(page, AYESHA, '/backoffice/fin/payment-list', 'payments-page');
  const confirmed = await ok(api<{ batch: { lines: Array<{ outcome?: { paymentId: string } }> } }>(page, `/office-collections/${recorded.batch.id}/confirm`, 'POST', { countedCash: amount }));
  const paymentId = confirmed.batch.lines[0]!.outcome!.paymentId;
  const d = await ok(api<{ payment: { ref: string }; receipt: { id: string; ref: string } }>(page, `/payments/${paymentId}`));
  return { paymentId, paymentRef: d.payment.ref, receiptId: d.receipt.id, receiptRef: d.receipt.ref };
}

async function reverseCash(page: Page, paymentId: string) {
  await office(page, SABA, '/backoffice/fin/payment-list', 'payments-page');
  const asked = await ok(api<{ approvalId: string }>(page, `/payments/${paymentId}/reversal-request`, 'POST', { reason: REASON }));
  await office(page, AYESHA, `/backoffice/apr/approval-360-view?record=${asked.approvalId}`, 'approval-workspace');
  await ok(api(page, `/approvals/${asked.approvalId}/decide`, 'POST', { decision: 'approve', reason: 'Checked against the cash book.' }));
}

async function novemberBill(page: Page) {
  await portal(page, '/customer/portal/home', 'dues-bill');
  return (await ok(api<{ position: { current: { invoiceId: string } } }>(page, '/portal/dues/home'))).position.current.invoiceId;
}

test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`B1 shared scenario ${lang(locale)}: in credit, then reversed — resident and office surfaces at 1440, 390 and 320 px at 200 % text`, async ({ browser }) => {
    test.setTimeout(300_000);
    const l = lang(locale);
    const page = await context(browser, VIEWPORTS.desktop, locale);
    const invoiceId = await novemberBill(page);
    const cash = await cashOnA101(page, '6000');
    // RES-02: in credit, before the reversal.
    await page.setViewportSize(VIEWPORTS.phone);
    await portal(page, '/customer/portal/my-properties', 'my-properties');
    await shot(page, `r02-my-properties-in-credit-390-${l}`);
    await page.setViewportSize(VIEWPORTS.desktop);
    await reverseCash(page, cash.paymentId);

    // Resident at 1440 and 390.
    for (const [vp, size] of [['1440', VIEWPORTS.desktop], ['390', VIEWPORTS.phone]] as const) {
      await page.setViewportSize(size);
      await portal(page, `/customer/portal/receipt?record=${cash.receiptId}`, 'receipt-reversed');
      await shot(page, `r01-receipt-reversed-${vp}-${l}`);
      await portal(page, '/customer/portal/home', 'dues-receipt-reversed');
      await shot(page, `r01-home-reversed-${vp}-${l}`);
      await portal(page, `/customer/portal/invoice-detail?record=${invoiceId}`, 'dues-bill-detail');
      await shot(page, `r01-bill-reversed-${vp}-${l}`);
    }
    await portal(page, '/customer/portal/payment-history', 'dues-history');
    await shot(page, `r01-history-reversed-390-${l}`);
    await portal(page, '/customer/portal/my-properties', 'my-properties');
    await shot(page, `r02-my-properties-after-reversal-390-${l}`);

    // Office at 1440.
    await page.setViewportSize(VIEWPORTS.desktop);
    await office(page, SABA, '/backoffice/fin/payment-list', 'payment-row-reversed');
    await shot(page, `c02-payments-list-reversed-1440-${l}`);
    await office(page, AYESHA, '/backoffice/col/collections-dashboard', 'recent-payment-reversed');
    await page.getByTestId('collections-recent').scrollIntoViewIfNeeded();
    await shot(page, `c02-collections-dashboard-reversed-1440-${l}`);
    await office(page, AYESHA, '/backoffice/sites/site_alnoor/units/unt_anr_a101?tab=invoices', 'flat-workspace');
    await page.getByTestId('statement-period').locator('label').nth(0).click();
    await page.locator('[data-testid="statement-entry"][data-kind="payment_reversal"]').waitFor();
    await settle(page);
    await shot(page, `c12-flat360-statement-payment-and-reversal-1440-${l}`);

    // 320 px with text at 200 %.
    await textAt(page, 2);
    await page.setViewportSize(PHONE);
    await portal(page, `/customer/portal/receipt?record=${cash.receiptId}`, 'receipt-reversed');
    await shot(page, `r01-receipt-reversed-200pct-320-${l}`);
    await portal(page, '/customer/portal/home', 'dues-receipt-reversed');
    await shot(page, `r01-home-reversed-200pct-320-${l}`);
    await portal(page, `/customer/portal/invoice-detail?record=${invoiceId}`, 'dues-bill-detail');
    await shot(page, `r01-bill-reversed-200pct-320-${l}`);
    await portal(page, '/customer/portal/my-properties', 'my-properties');
    await shot(page, `r02-my-properties-200pct-320-${l}`);
    await office(page, SABA, '/backoffice/fin/payment-list', 'payment-row-reversed');
    await page.locator('[data-testid="payment-row"][data-reversed="true"]').scrollIntoViewIfNeeded();
    await settle(page);
    await shot(page, `c02-payments-list-reversed-row-200pct-320-${l}`, false);
    await office(page, AYESHA, '/backoffice/col/collections-dashboard', 'recent-payment-reversed');
    await page.locator('[data-testid="recent-payment"][data-reversed="true"]').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await settle(page);
    await shot(page, `c02-collections-recent-200pct-320-${l}`, false);
    await page.context().close();
  });

  test(`COL-01 and FIN-04 ${lang(locale)}: the credit-note drawer and the policy draft`, async ({ browser }) => {
    test.setTimeout(240_000);
    const l = lang(locale);
    const page = await context(browser, VIEWPORTS.desktop, locale, RABIA);
    const invoiceId = await novemberBill(page);
    await cashOnA101(page, '3000');
    await office(page, AYESHA, `/backoffice/fin/invoice-workspace?record=${invoiceId}&drawer=credit-note`, 'credit-note-drawer');
    const drawer = page.getByTestId('credit-note-drawer');
    await drawer.locator('[data-testid="credit-amount-maintenance"]').fill('1500');
    await drawer.getByTestId('credit-reason').fill('Lift out of service for two weeks');
    await drawer.getByTestId('credit-note-save').click();
    await drawer.getByRole('alert').waitFor();
    await settle(page);
    await shot(page, `c01-credit-drawer-over-credit-1440-${l}`, false);
    // FIN-04: the draft with its own date, edited and not saved.
    await office(page, RABIA, '/backoffice/apr/approval-settings', 'policies-page');
    await ok(api(page, '/approval-policies', 'POST', {}));
    await office(page, RABIA, '/backoffice/apr/approval-settings?tab=draft', 'policy-draft');
    await page.locator(':is(input, textarea)[data-testid="draft-note"], [data-testid="draft-note"] :is(input, textarea)').first().fill('Two signatures on small vouchers (illustrative)');
    await page.getByTestId('draft-unsaved').waitFor();
    await settle(page);
    await shot(page, `f04-policy-draft-saved-date-unsaved-edit-1440-${l}`);
    // Last, the credit-note drawer at 320 px with text at 200 % (partly paid lines: billed, paid, credited, open).
    await textAt(page, 2);
    await page.setViewportSize(PHONE);
    await office(page, AYESHA, `/backoffice/fin/invoice-workspace?record=${invoiceId}&drawer=credit-note`, 'credit-note-drawer');
    await page.locator('[data-testid="credit-line"][data-category="maintenance"]').scrollIntoViewIfNeeded();
    await settle(page);
    await shot(page, `c01-credit-drawer-lines-200pct-320-${l}`, false);
    await page.context().close();
  });

  test(`RES-02 ${lang(locale)}: a flat in credit at 320 px with text at 200 %`, async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await context(browser, VIEWPORTS.desktop, locale);
    await cashOnA101(page, '6000');
    await textAt(page, 2);
    await page.setViewportSize(PHONE);
    await portal(page, '/customer/portal/my-properties', 'my-properties');
    await shot(page, `r02-my-properties-in-credit-200pct-320-${lang(locale)}`);
    await page.context().close();
  });
}

test('FIN-03 and COL-04 en: the voucher draft found again, the reversal drawer, the waiting list', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await context(browser, VIEWPORTS.desktop, 'en-PK');
  await office(page, SABA, '/backoffice/bank/cashbook', 'cashbook-page');
  const draft = await ok(api<{ voucher: { id: string } }>(page, '/finance/vouchers', 'POST', { accountId: 'cac_anr_petty', direction: 'payment', category: 'cleaning', amount: '450', onDate: '2026-10-26', purpose: 'Mops and buckets for the lobby', counterparty: 'Demo Hardware Store', evidence: { name: 'hardware-bill-2210.jpg', kind: 'bill', size: 1000 }, submit: false, idempotencyKey: 'ev-b1-draft' }));
  await office(page, SABA, `/backoffice/bank/cashbook?voucher=${draft.voucher.id}`, 'voucher-draft-note');
  await shot(page, 'f03-voucher-draft-drawer-1440-en', false);
  await page.keyboard.press('Escape');
  await page.getByTestId('voucher-drawer').waitFor({ state: 'hidden' });
  await page.locator('[data-testid="pending-item"][data-kind="voucher_draft"]').scrollIntoViewIfNeeded();
  await settle(page);
  await shot(page, 'f03-cashbook-pending-draft-1440-en', false);
  const posted = (await ok(api<{ items: Array<{ id: string; reversedBy?: unknown; reversalOf?: unknown }> }>(page, '/finance/vouchers', 'GET', {}, { status: 'posted' }))).items.find((x) => !x.reversedBy && !x.reversalOf)!;
  await office(page, SABA, `/backoffice/bank/cashbook?voucher=${posted.id}`, 'voucher-detail');
  await page.getByTestId('voucher-reverse').click();
  const dialog = page.getByRole('alertdialog');
  await dialog.locator('textarea').fill('Entered twice by mistake');
  await dialog.getByRole('button', { name: 'Prepare the reversal' }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('voucher')).not.toBe(posted.id);
  await page.getByTestId('voucher-detail').waitFor();
  await settle(page);
  await shot(page, 'f03-voucher-reversal-same-record-1440-en', false);

  // COL-04: a proof sent back to the resident is not waiting; the tile's list is exactly what it counts.
  await portal(page, '/customer/portal/home', 'dues-bill');
  const back = await ok(api<{ submission: { id: string } }>(page, '/portal/dues/submissions', 'POST', { amount: '5200', transferDate: '2026-10-26', bankReference: 'A101 NOV', file: { name: 'kamran-nov.jpg', type: 'image/jpeg', size: 120_000 } }));
  await office(page, SABA, '/backoffice/fin/unverified-transfers-queue', 'proof-inbox');
  await ok(api(page, `/payment-submissions/${back.submission.id}/request-information`, 'POST', { message: 'Please send the full slip with the date.' }));
  await office(page, SABA, '/backoffice/fin/unverified-transfers-queue?state=waiting', 'proof-inbox');
  await shot(page, 'c04-inbox-waiting-1440-en');
  await office(page, AYESHA, '/backoffice/col/collections-dashboard', 'collections-progress');
  await shot(page, 'c04-collections-dashboard-waiting-1440-en', false);
  await page.context().close();
});

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`RES-12 and RES-03 ${lang(locale)}: a bill settled by a credit note; a proof waiting for the bank opens from Home and the bill`, async ({ browser }) => {
    test.setTimeout(180_000);
    const l = lang(locale);
    const page = await context(browser, VIEWPORTS.phone, locale);
    const invoiceId = await novemberBill(page);
    await office(page, AYESHA, `/backoffice/fin/invoice-workspace?record=${invoiceId}`, 'invoice-workspace');
    const inv = await ok(api<{ creditable: Array<{ lineId: string; open: { amount: string } }> }>(page, `/billing/invoices/${invoiceId}`));
    await ok(api(page, `/billing/invoices/${invoiceId}/credit-notes`, 'POST', { reason: 'November waived by the committee', lines: inv.creditable.map((c) => ({ lineId: c.lineId, amount: c.open.amount })) }));
    await portal(page, '/customer/portal/payments-dashboard', 'dues-bills');
    await shot(page, `r12-bills-settled-by-credit-note-390-${l}`);
    // The October balance sent as a proof, then put to wait for the bank line.
    await portal(page, '/customer/portal/home', 'dues-bill');
    const sent = await ok(api<{ submission: { id: string } }>(page, '/portal/dues/submissions', 'POST', { amount: '1000', transferDate: '2026-10-26', bankReference: 'A101 OCT', file: { name: 'kamran-oct.jpg', type: 'image/jpeg', size: 120_000 } }));
    await office(page, SABA, '/backoffice/fin/unverified-transfers-queue', 'proof-inbox');
    await ok(api(page, `/payment-submissions/${sent.submission.id}/await-bank`, 'POST', { note: 'Not on the statements imported so far.' }));
    await portal(page, '/customer/portal/home', 'dues-pending-open');
    await shot(page, `r03-home-awaiting-bank-390-${l}`);
    const oct = (await ok(api<{ bills: Array<{ invoiceId: string; source: string }> }>(page, '/portal/dues/bills'))).bills.find((b) => b.source === 'opening_balance')!.invoiceId;
    await portal(page, `/customer/portal/invoice-detail?record=${oct}`, 'dues-bill-pending-open');
    await shot(page, `r12-bill-proof-pending-no-pay-390-${l}`);
    await page.context().close();
  });
}
