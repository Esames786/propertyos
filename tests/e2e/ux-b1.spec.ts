import type { Locator, Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, expect, test, type Locale, type PersonaId } from '../support/fixtures';
import { focusWalk, layoutProblems } from '../support/layout';
import { become, seedSociety, societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * UX repair batch B1 "Money truth" (backlog `docs/ux-backlog@90c2b0a`) in both apps (production build),
 * with the people of the Al-Noor storyline. The shared scenario: office cash of Rs 6,000 on A-101
 * (Rs 5,200 owed, Rs 800 left as credit) is reversed after an approval; the receipt, Home, the bill,
 * My properties, the payments list, both dashboards, the statement and the credit-note drawer then all
 * say so, in English and Urdu (RES-01, N-1, COL-02, RES-02, COL-12, COL-01). Then: the credit-note cap
 * (COL-01), a voucher draft found again and Reverse keeping the address and the drawer on one record
 * (FIN-03), the policy draft's date and "Send for approval" (FIN-04), the credited bill and the pending
 * proof (RES-12, RES-03) and "Waiting for verification" (COL-04). Plus the changed screens at 320 px with
 * 200 % text, in dark mode with high contrast, and with the keyboard. The business date is Monday
 * 26 October 2026.
 */
const SABA: PersonaId = 'alnoor_accounts';
const AYESHA: PersonaId = 'alnoor_treasurer';
const RABIA: PersonaId = 'alnoor_admin';
const KAMRAN: PersonaId = 'alnoor_resident_a101';
const REASON = 'Recorded against the wrong flat by mistake';
const PHONE = { width: 320, height: 700 };
const DISPLAY_SABA = 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0004';
const OFFICE_HEADER = '[data-testid="app-header"]';
const OFFICE_BAR = '[data-testid="bottom-nav"]';
const PORTAL_HEADER = '[data-testid="portal-header"]';
const PORTAL_BAR = '[data-testid="portal-bottom-nav"]';
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

async function portal(page: Page, path: string, ready: string, persona: PersonaId = KAMRAN) {
  await become(page, 'customer', persona);
  await page.goto(`${CU}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

/**
 * Text drawn over other text (the layout check does not look for it): every pair of shown text runs in
 * the scope whose line boxes intersect by more than 2 px both ways. Hidden text (aria-hidden, sr-only,
 * hidden, invisible) is ignored.
 */
async function textOverlaps(scope: Page | Locator): Promise<string[]> {
  const root = 'goto' in scope ? scope.locator('main') : scope;
  return root.first().evaluate((rootEl: Element) => {
    const runs: Array<{ el: Element; text: string; rects: DOMRect[] }> = [];
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? '').trim();
      const el = n.parentElement;
      if (!text || !el || el.closest('[aria-hidden="true"], .sr-only, [hidden]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
      if (rects.length) runs.push({ el, text: text.slice(0, 40), rects });
    }
    const out: string[] = [];
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i]!;
        const b = runs[j]!;
        if (a.el === b.el) continue;
        const hit = a.rects.some((r) => b.rects.some((q) => Math.min(r.right, q.right) - Math.max(r.left, q.left) > 2 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 2));
        if (hit) out.push(`"${a.text}" over "${b.text}"`);
      }
    }
    return out;
  });
}

/** Money figures that spill out of the card or tile they sit in (neither check above sees this). */
async function amountsOutsideCards(page: Page): Promise<string[]> {
  return page.locator('main').first().evaluate((root) =>
    [...root.querySelectorAll('[data-amount]')].flatMap((el) => {
      const card = el.closest('[class*="rounded-card"], [class*="rounded-tile"]');
      const a = el.getBoundingClientRect();
      if (!card || a.width < 1) return [];
      const c = card.getBoundingClientRect();
      return a.left < c.left - 1 || a.right > c.right + 1 ? [`${(el as HTMLElement).innerText} (${Math.round(a.left)}–${Math.round(a.right)} in ${Math.round(c.left)}–${Math.round(c.right)})`] : [];
    }),
  );
}

const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const box = (scope: Page | Locator, testId: string) => scope.locator(`:is(input, textarea)[data-testid="${testId}"], [data-testid="${testId}"] :is(input, textarea)`).first();

async function choose(page: Page, scope: Locator, testId: string, option: RegExp | string) {
  await scope.getByTestId(testId).getByRole('button').click();
  await page.getByRole('option', { name: option }).first().click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

async function decide(page: Page, persona: PersonaId, approvalId: string) {
  await office(page, persona, `/backoffice/apr/approval-360-view?record=${approvalId}`, 'approval-workspace');
  await page.getByTestId('approval-decide').click();
  const drawer = page.getByTestId('decide-drawer');
  await box(drawer, 'decide-reason').fill('Checked against the cash book.');
  await drawer.getByTestId('decide-submit').click();
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('approval-status')).toHaveAttribute('data-state', 'approved');
}

async function ok<T>(p: Promise<{ ok: true; res: T } | { ok: false; code: string; status: number }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`API refused: ${r.status} ${r.code}`);
  return r.res;
}

/** Office cash on A-101: recorded by Saba, counted by Ayesha (D-46). Returns the payment and receipt. */
async function cashOnA101(page: Page, amount: string) {
  await office(page, AYESHA, '/backoffice/fin/payment-list', 'payments-page');
  await ok(api(page, '/sites/site_alnoor/payment-methods', 'PATCH', { method: 'office_cash', enabled: true }));
  await office(page, SABA, '/backoffice/fin/payment-list', 'payments-page');
  const flat = await ok(api<{ currentPayer: { partyId: string } }>(page, '/sites/site_alnoor/units/unt_anr_a101'));
  const recorded = await ok(api<{ batch: { id: string } }>(page, '/payments/office', 'POST', { accountId: 'ba_anr_a101', payerPartyId: flat.currentPayer.partyId, amount, idempotencyKey: `e2e-b1-${amount}` }));
  await office(page, AYESHA, '/backoffice/fin/payment-list', 'payments-page');
  const confirmed = await ok(api<{ batch: { lines: Array<{ outcome?: { kind: string; paymentId: string } }> } }>(page, `/office-collections/${recorded.batch.id}/confirm`, 'POST', { countedCash: amount }));
  const paymentId = confirmed.batch.lines[0]!.outcome!.paymentId;
  const detail = await ok(api<{ payment: { id: string; ref: string }; receipt: { id: string; ref: string } }>(page, `/payments/${paymentId}`));
  return { paymentId, paymentRef: detail.payment.ref, receiptId: detail.receipt.id, receiptRef: detail.receipt.ref };
}

/** Saba asks for the reversal; Ayesha approves it in the approval screen. */
async function reverseCash(page: Page, paymentId: string) {
  await office(page, SABA, '/backoffice/fin/payment-list', 'payments-page');
  const asked = await ok(api<{ approvalId: string }>(page, `/payments/${paymentId}/reversal-request`, 'POST', { reason: REASON }));
  await decide(page, AYESHA, asked.approvalId);
}

const novemberBill = async (page: Page) => {
  await portal(page, '/customer/portal/home', 'dues-bill');
  return (await ok(api<{ position: { current: { invoiceId: string } } }>(page, '/portal/dues/home'))).position.current.invoiceId;
};

// ---------------------------------------------------------------------------------------------
// The shared scenario, in English and Urdu
// ---------------------------------------------------------------------------------------------

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`B1 shared scenario (${lang(locale)}): reversed office cash on A-101 reads the same on the receipt, Home, the bill, My properties, the payments list, both dashboards, the statement and the credit-note drawer`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(480_000);
    await at(page);
    await seedSociety(page, { staff: SABA, locale });
    const invoiceId = await novemberBill(page);
    await office(page, SABA, '/backoffice/fin/payment-list', 'payments-page');
    const base = await ok(api<{ totals: { count: number; amount: { amount: string } } }>(page, '/payments'));
    const cash = await cashOnA101(page, '6000');

    // RES-02: in credit, the credit itself (never "In credit Rs 0.00").
    await portal(page, '/customer/portal/my-properties', 'my-properties');
    const card = page.locator('[data-testid="property-card"][data-flat="A-101"]');
    await expect(card.getByTestId('property-balance')).toHaveAttribute('data-state', 'credit');
    await expect(card.getByTestId('property-balance')).toContainText('800.00');
    await axe(page, testInfo, `b1-my-properties-credit-1440-${lang(locale)}`);

    await reverseCash(page, cash.paymentId);

    // RES-01 (1): the receipt is kept, says Reversed with the date and the reason; no "Paid", no success colour.
    await portal(page, `/customer/portal/receipt?record=${cash.receiptId}`, 'dues-receipt-page');
    const receipt = page.getByTestId('dues-receipt-page');
    await expect(receipt).toHaveAttribute('data-reversed', 'true');
    await expect(receipt.getByTestId('receipt-status')).toHaveAttribute('data-status', 'reversed');
    await expect(receipt.getByTestId('receipt-reversed')).toContainText(REASON);
    await expect(receipt.getByTestId('receipt-reversed')).toContainText(locale === 'en-PK' ? /Reversed on 26 \w+ 2026/ : /2026/);
    const article = await receipt.locator('article').innerText();
    expect(article).not.toMatch(locale === 'en-PK' ? /\bPaid\b|Amount received/ : /ادا شدہ|وصول شدہ رقم/);
    await expect(receipt.getByTestId('receipt-amount')).not.toHaveClass(/text-success/);
    await axe(page, testInfo, `b1-receipt-reversed-1440-${lang(locale)}`);

    // RES-01 (2, 4): Home flags the receipt; the total equals the office balance (no reversed credit).
    await portal(page, '/customer/portal/home', 'dues-bill');
    const homeReceipt = page.locator(`[data-testid="dues-receipt"][data-ref="${cash.receiptRef}"]`);
    await expect(homeReceipt).toHaveAttribute('data-reversed', 'true');
    await expect(homeReceipt.getByTestId('dues-receipt-reversed')).toBeVisible();
    await expect(page.getByTestId('dues-total')).toContainText('5,200.00');
    await expect(page.getByTestId('dues-credit')).toHaveCount(0);
    await axe(page, testInfo, `b1-home-reversed-1440-${lang(locale)}`);

    // RES-01 (3): the bill lists the payment as reversed; 4,200 is left on it.
    await portal(page, `/customer/portal/invoice-detail?record=${invoiceId}`, 'dues-bill-detail');
    await expect(page.locator('[data-testid="dues-bill-payment"][data-reversed="true"]')).toHaveCount(1);
    await expect(page.getByTestId('dues-bill-open')).toContainText('4,200.00');
    await expect(page.getByTestId('dues-bill-pay')).toContainText('5,200.00');
    await axe(page, testInfo, `b1-bill-reversed-1440-${lang(locale)}`);

    // History: a reversed receipt is not drawn as a success, and keeps no credit.
    await portal(page, '/customer/portal/payment-history', 'dues-history');
    const row = page.locator(`[data-testid="history-receipt"][data-ref="${cash.receiptRef}"]`);
    await expect(row).toHaveAttribute('data-reversed', 'true');
    await expect(row).not.toContainText('800.00');

    // RES-02: no credit is shown once that payment is reversed.
    await portal(page, '/customer/portal/my-properties', 'my-properties');
    await expect(card.getByTestId('property-balance')).toHaveAttribute('data-state', 'overdue');
    await expect(card.getByTestId('property-balance')).toContainText('5,200.00');

    // COL-02: the list keeps the row, badged, and counts live payments only.
    await office(page, SABA, '/backoffice/fin/payment-list', 'payments-page');
    const listed = page.locator(`[data-testid="payment-row"][data-ref="${cash.paymentRef}"]`);
    await expect(listed).toHaveAttribute('data-reversed', 'true');
    await expect(listed.getByTestId('payment-row-reversed')).toBeVisible();
    await expect(page.getByTestId('payments-count')).toHaveAttribute('data-count', String(base.totals.count));
    await expect(page.getByTestId('payments-count')).toHaveAttribute('data-reversed', '1');
    const list = await ok(api<{ totals: { count: number; amount: { amount: string } } }>(page, '/payments'));
    expect(list.totals).toMatchObject({ count: base.totals.count, amount: base.totals.amount });
    await axe(page, testInfo, `b1-payments-list-reversed-1440-${lang(locale)}`);

    // COL-02: COL-001 and HOME-001 badge it and count what the list counts.
    for (const [path, ready] of [['/backoffice/col/collections-dashboard', 'collections-panel'], ['/backoffice/home/role-aware-dashboard', 'collections-panel']] as const) {
      await office(page, AYESHA, path, ready);
      const recent = page.locator('[data-testid="recent-payment"][data-reversed="true"]');
      await expect(recent).toHaveCount(1);
      await expect(recent.getByTestId('recent-payment-reversed')).toBeVisible();
      const summary = await ok(api<{ collected: { payments: number } }>(page, '/collections/summary'));
      expect(summary.collected.payments, path).toBe(list.totals.count);
    }
    await axe(page, testInfo, `b1-dashboard-reversed-1440-${lang(locale)}`);

    // COL-12: the payment and its reversal are two rows; switching period never drops or doubles one.
    await office(page, AYESHA, '/backoffice/sites/site_alnoor/units/unt_anr_a101?tab=invoices', 'flat-workspace');
    const radios = page.getByTestId('statement-period').locator('label');
    const rows = page.locator('[data-testid="statement-entry"]');
    await radios.nth(0).click();
    await expect(page.locator('[data-testid="statement-entry"][data-kind="payment_reversal"]')).toHaveCount(1);
    const october = await rows.count();
    await radios.nth(1).click();
    await expect(page.locator('[data-testid="statement-entry"][data-kind="payment_reversal"]')).toHaveCount(0);
    const november = await rows.count();
    for (let i = 0; i < 2; i++) {
      await radios.nth(0).click();
      await expect(rows).toHaveCount(october);
      await expect(page.locator('[data-testid="statement-entry"][data-kind="payment"]')).toHaveCount(1);
      await radios.nth(1).click();
      await expect(rows).toHaveCount(november);
    }

    // COL-01 (5): after the reversal the credit-note drawer shows nothing paid and the line open again.
    await office(page, AYESHA, `/backoffice/fin/invoice-workspace?record=${invoiceId}&drawer=credit-note`, 'credit-note-drawer');
    const maintenance = page.getByTestId('credit-note-drawer').locator('[data-testid="credit-line"][data-category="maintenance"]');
    await expect(maintenance).toHaveAttribute('data-open', '3000.00');
    await expect(maintenance.getByTestId('credit-line-breakdown')).toContainText('0.00');
    expect(consoleErrors).toEqual([]);
  });
}

// ---------------------------------------------------------------------------------------------
// COL-01: the credit-note drawer never offers to credit money already paid
// ---------------------------------------------------------------------------------------------

test('COL-01: the drawer shows billed, paid, credited and open per line; an over-credit keeps the drawer open with the reason at the line; nothing is issued', async ({ page, consoleErrors }, testInfo) => {
  test.setTimeout(180_000);
  await at(page);
  await seedSociety(page, { staff: SABA });
  const invoiceId = await novemberBill(page);
  await cashOnA101(page, '3000'); // 1,000 of October, then 2,000 of November's maintenance
  await office(page, AYESHA, `/backoffice/fin/invoice-workspace?record=${invoiceId}&drawer=credit-note`, 'credit-note-drawer');
  const drawer = page.getByTestId('credit-note-drawer');
  const maintenance = drawer.locator('[data-testid="credit-line"][data-category="maintenance"]');
  await expect(maintenance).toHaveAttribute('data-open', '1000.00');
  await expect(maintenance.getByTestId('credit-line-breakdown')).toContainText('Billed Rs 3,000.00 · paid Rs 2,000.00 · credited Rs 0.00 · open Rs 1,000.00');
  await axe(page, testInfo, 'b1-credit-drawer-partly-paid-1440-en');
  await box(drawer, 'credit-amount-maintenance').fill('1500');
  await box(drawer, 'credit-reason').fill('Lift out of service for two weeks');
  await drawer.getByTestId('credit-note-save').click();
  // The summary below the form keeps the server's words (amounts as sent); the line itself says it in money.
  await expect(drawer.getByRole('alert')).toContainText('At most 1000.00 is still open on this line (A-101)');
  await expect(maintenance).toContainText('At most Rs 1,000.00 is still open on this line (A-101)');
  await expect(drawer).toBeVisible();
  const notes = await ok(api<{ creditNotes: unknown[] }>(page, `/billing/invoices/${invoiceId}`));
  expect(notes.creditNotes).toEqual([]);
  await axe(page, testInfo, 'b1-credit-drawer-over-credit-1440-en');
  // Equal to what is open: issued; the line then has nothing open and says why.
  await box(drawer, 'credit-amount-maintenance').fill('1000');
  await drawer.getByTestId('credit-note-save').click();
  await expect(drawer).toBeHidden();
  await office(page, AYESHA, `/backoffice/fin/invoice-workspace?record=${invoiceId}&drawer=credit-note`, 'credit-note-drawer');
  await expect(maintenance.getByTestId('credit-line-closed')).toBeVisible();
  await expect(maintenance.locator('input')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// FIN-03: a voucher draft is found again; Reverse keeps the address and the drawer on one record
// ---------------------------------------------------------------------------------------------

const voucherParam = (page: Page) => new URL(page.url()).searchParams.get('voucher');

test('FIN-03: Save as draft keeps the drawer on the draft (?voucher=<id>); reload reopens it; it is listed as a draft, edited and sent later; Reverse moves the address and the drawer together', async ({ page, consoleErrors }, testInfo) => {
  test.setTimeout(240_000);
  await at(page);
  await seedSociety(page, { staff: SABA });
  await office(page, SABA, '/backoffice/bank/cashbook', 'cashbook-page');
  const overview = JSON.stringify(await ok(api(page, '/finance/overview')));
  await page.getByTestId('new-voucher').click();
  const v = page.getByTestId('voucher-drawer');
  await choose(page, v, 'voucher-account', /Petty cash/);
  await choose(page, v, 'voucher-category', /Cleaning/);
  await box(v, 'voucher-amount').fill('450');
  await box(v, 'voucher-counterparty').fill('Demo Hardware Store');
  await box(v, 'voucher-purpose').fill('Mops and buckets for the lobby');
  await v.getByTestId('voucher-sample-evidence').click();
  await v.getByTestId('voucher-save-draft').click();
  // (1) The drawer shows the draft (ref, Edit, Send) and the address names it.
  const detail = v.getByTestId('voucher-detail');
  await expect(detail).toHaveAttribute('data-status', 'draft');
  const draftId = (await detail.getAttribute('data-voucher'))!;
  await expect.poll(() => voucherParam(page)).toBe(draftId);
  expect(new URL(page.url()).searchParams.get('drawer')).toBeNull();
  await expect(v.getByTestId('voucher-edit')).toBeVisible();
  await expect(v.getByTestId('voucher-submit')).toBeVisible();
  await expect(v.getByTestId('voucher-draft-note')).toBeVisible();
  await axe(page, testInfo, 'b1-voucher-draft-drawer-1440-en');
  // (2) Reload reopens it.
  await page.reload();
  await expect(page.getByTestId('voucher-detail')).toHaveAttribute('data-voucher', draftId);
  // (7) No money figure changes because of a draft.
  expect(JSON.stringify(await ok(api(page, '/finance/overview')))).toBe(overview);
  // (3) Listed in "Not settled yet" as a draft; it opens the draft.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('voucher-drawer')).toBeHidden();
  const item = page.locator('[data-testid="pending-item"][data-kind="voucher_draft"]');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Mops and buckets for the lobby');
  await axe(page, testInfo, 'b1-cashbook-pending-draft-1440-en');
  await item.click();
  await expect(page.getByTestId('voucher-detail')).toHaveAttribute('data-voucher', draftId);
  // Edit the draft, then (4) send it.
  await v.getByTestId('voucher-edit').click();
  await box(v, 'voucher-purpose').fill('Mops, buckets and gloves for the lobby');
  await v.getByTestId('voucher-edit-save').click();
  await expect(v.getByTestId('voucher-detail')).toContainText('Mops, buckets and gloves for the lobby');
  await v.getByTestId('voucher-submit').click();
  await expect(v.getByTestId('voucher-state')).toHaveAttribute('data-state', 'submitted');
  // (6) One Back press leaves the drawer.
  await page.goBack();
  await expect(page.getByTestId('voucher-drawer')).toHaveCount(0);

  // (5) Reverse a posted voucher: the address and the drawer show the same new record.
  await office(page, SABA, '/backoffice/bank/cashbook', 'cashbook-page');
  const posted = (await ok(api<{ items: Array<{ id: string; ref: string; reversedBy?: unknown; reversalOf?: unknown }> }>(page, '/finance/vouchers', 'GET', {}, { status: 'posted' }))).items.find((x) => !x.reversedBy && !x.reversalOf)!;
  await office(page, SABA, `/backoffice/bank/cashbook?voucher=${posted.id}`, 'voucher-detail');
  await v.getByTestId('voucher-reverse').click();
  const dialog = page.getByRole('alertdialog');
  await dialog.locator('textarea').fill('Entered twice by mistake');
  await dialog.getByRole('button', { name: 'Prepare the reversal' }).click();
  await expect.poll(() => voucherParam(page)).not.toBe(posted.id);
  const shown = page.getByTestId('voucher-detail');
  await expect(shown).toHaveAttribute('data-voucher', voucherParam(page)!);
  await expect(page.getByTestId('voucher-drawer')).toContainText(posted.ref);
  await page.reload();
  await expect(page.getByTestId('voucher-detail')).toHaveAttribute('data-voucher', voucherParam(page)!);

  // The transfer Reverse does the same (BANK-006).
  const settled = (await ok(api<{ items: Array<{ id: string; ref: string; reversedBy?: unknown; reversalOf?: unknown }> }>(page, '/finance/transfers', 'GET', {}, { status: 'settled' }))).items.find((x) => !x.reversedBy && !x.reversalOf);
  if (settled) {
    await office(page, SABA, `/backoffice/bank/transfers?record=${settled.id}`, 'transfer-drawer');
    await page.getByTestId('transfer-reverse').click();
    await expect.poll(() => new URL(page.url()).searchParams.get('record')).not.toBe(settled.id);
    const record = new URL(page.url()).searchParams.get('record')!;
    const fresh = await ok(api<{ transfer: { ref: string } }>(page, `/finance/transfers/${record}`));
    await expect(page.getByTestId('transfer-drawer')).toContainText(fresh.transfer.ref);
  }
  expect(consoleErrors).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// FIN-04: the policy draft keeps its date and is sent as it is on screen
// ---------------------------------------------------------------------------------------------

test('FIN-04: the draft shows its saved date (never a fixed one) and keeps it; "Send for approval" sends the rules on screen, unsaved edits included', async ({ page, consoleErrors }, testInfo) => {
  test.setTimeout(180_000);
  await at(page);
  await seedSociety(page, { staff: RABIA });
  await office(page, RABIA, '/backoffice/apr/approval-settings', 'policies-page');
  await page.getByTestId('policy-new-draft').click();
  await office(page, RABIA, '/backoffice/apr/approval-settings?tab=draft', 'policy-draft');
  // (1) The saved date (tomorrow, as the server drafted it), not 2026-11-01.
  await expect(box(page, 'draft-from')).toHaveValue('2026-10-27');
  await box(page, 'draft-from').fill('2026-12-01');
  await box(page, 'draft-note').fill('Two signatures on small vouchers (illustrative)');
  await expect(page.getByTestId('draft-unsaved')).toBeVisible();
  await page.getByTestId('draft-save').click();
  await expect(page.getByTestId('draft-unsaved')).toHaveCount(0);
  // (2) Reload keeps it.
  await page.reload();
  await expect(box(page, 'draft-from')).toHaveValue('2026-12-01');
  await expect(box(page, 'draft-note')).toHaveValue('Two signatures on small vouchers (illustrative)');
  // (3, 4) Edit a rule without saving, then send: what is on screen is what is sent.
  await choose(page, page.getByTestId('policy-draft'), 'draft-required-0', '2');
  await expect(page.getByTestId('policy-draft')).toHaveAttribute('data-dirty', 'true');
  await expect(page.getByTestId('draft-unsaved')).toBeVisible();
  await axe(page, testInfo, 'b1-policy-draft-unsaved-1440-en');
  await page.getByTestId('draft-submit').click();
  await expect(page.getByTestId('toast-success').first()).toBeVisible();
  const o = await ok(api<{ versions: Array<{ status: string; effectiveFrom: string; note: string; rules: Array<{ approvalsRequired: number }> }> }>(page, '/approval-policies'));
  const sent = o.versions.find((x) => x.status === 'pending')!;
  // (5) Approvers see the rules the author saw.
  expect(sent).toMatchObject({ effectiveFrom: '2026-12-01', note: 'Two signatures on small vouchers (illustrative)' });
  expect(sent.rules[0]!.approvalsRequired).toBe(2);
  expect(consoleErrors).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// RES-12, RES-03, COL-04
// ---------------------------------------------------------------------------------------------

test('RES-12 and RES-03: a credited bill says "Settled by credit note", never Paid; with a proof waiting for the bank, Home and the bill open it and never offer Pay', async ({ page, consoleErrors }, testInfo) => {
  test.setTimeout(180_000);
  await at(page);
  await seedSociety(page, { staff: SABA });
  const invoiceId = await novemberBill(page);
  // Ayesha credits the whole November bill (a waiver): nothing paid, nothing owed on it.
  await office(page, AYESHA, `/backoffice/fin/invoice-workspace?record=${invoiceId}`, 'invoice-workspace');
  const inv = await ok(api<{ invoice: { lines: Array<{ id: string; amount: { amount: string } }> } }>(page, `/billing/invoices/${invoiceId}`));
  await ok(api(page, `/billing/invoices/${invoiceId}/credit-notes`, 'POST', { reason: 'November waived by the committee', lines: inv.invoice.lines.map((l) => ({ lineId: l.id, amount: l.amount.amount })) }));
  await portal(page, '/customer/portal/payments-dashboard', 'dues-bills');
  const chip = page.locator(`[data-testid="dues-bill-row"][href*="${invoiceId}"]`).getByTestId('bill-status');
  await expect(chip).toHaveAttribute('data-status', 'credited');
  await expect(chip).toHaveText('Settled by credit note');
  await axe(page, testInfo, 'b1-bills-credited-1440-en');
  await portal(page, `/customer/portal/invoice-detail?record=${invoiceId}`, 'dues-bill-detail');
  await expect(page.getByTestId('dues-bill-detail').getByTestId('bill-status').first()).toHaveText('Settled by credit note');

  // RES-03: the October balance (1,000) sent as a proof, then put to wait for the bank line.
  await portal(page, '/customer/portal/home', 'dues-bill');
  const sent = await ok(api<{ submission: { id: string } }>(page, '/portal/dues/submissions', 'POST', { amount: '1000', transferDate: '2026-10-26', bankReference: 'A101 OCT', file: { name: 'kamran-oct.jpg', type: 'image/jpeg', size: 120_000 } }));
  await office(page, SABA, `/backoffice/fin/transfer-proof-review?record=${sent.submission.id}`, 'proof-review');
  await ok(api(page, `/payment-submissions/${sent.submission.id}/await-bank`, 'POST', { note: 'Not on the statements imported so far.' }));
  await portal(page, '/customer/portal/home', 'dues-bill');
  await expect(page.getByTestId('dues-home')).toHaveAttribute('data-status', 'pending_verification');
  await expect(page.getByTestId('dues-pay')).toHaveCount(0);
  await expect(page.getByTestId('dues-pending-open')).toHaveAttribute('href', new RegExp(sent.submission.id));
  await axe(page, testInfo, 'b1-home-awaiting-bank-1440-en');
  // RES-12: the bill page opens the proof too, not "Pay".
  const oct = (await ok(api<{ bills: Array<{ invoiceId: string; source: string }> }>(page, '/portal/dues/bills'))).bills.find((b) => b.source === 'opening_balance')!.invoiceId;
  await portal(page, `/customer/portal/invoice-detail?record=${oct}`, 'dues-bill-detail');
  await expect(page.getByTestId('dues-bill-pay')).toHaveCount(0);
  await page.getByTestId('dues-bill-pending-open').click();
  await expect(page.getByTestId('dues-submission')).toHaveAttribute('data-state', 'awaiting_bank_evidence');
  expect(consoleErrors).toEqual([]);
});

test('COL-04: a proof sent back to the resident is not "waiting for verification"; the tile opens a list whose count equals the tile', async ({ page, consoleErrors }, testInfo) => {
  test.setTimeout(150_000);
  await at(page);
  await seedSociety(page, { staff: SABA });
  await portal(page, '/customer/portal/home', 'dues-bill');
  const sent = await ok(api<{ submission: { id: string } }>(page, '/portal/dues/submissions', 'POST', { amount: '5200', transferDate: '2026-10-26', bankReference: 'A101 NOV', file: { name: 'kamran-nov.jpg', type: 'image/jpeg', size: 120_000 } }));
  await office(page, SABA, '/backoffice/fin/unverified-transfers-queue', 'proof-inbox');
  const before = await ok(api<{ pending: { submissions: number; amount: { amount: string } } }>(page, '/collections/summary'));
  await ok(api(page, `/payment-submissions/${sent.submission.id}/request-information`, 'POST', { message: 'Please send the full slip with the date.' }));
  await office(page, AYESHA, '/backoffice/col/collections-dashboard', 'collections-panel');
  const summary = await ok(api<{ pending: { submissions: number; amount: { amount: string } } }>(page, '/collections/summary'));
  expect(summary.pending.submissions).toBe(before.pending.submissions - 1);
  await page.getByTestId('kpi-pending').click();
  await expect(page).toHaveURL(/unverified-transfers-queue\?state=waiting/);
  await expect(page.getByTestId('proof-inbox')).toHaveAttribute('data-filter', 'waiting');
  await expect(page.getByTestId('inbox-list').locator(':scope > li')).toHaveCount(summary.pending.submissions);
  await axe(page, testInfo, 'b1-inbox-waiting-1440-en');
  expect(consoleErrors).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// The changed screens at 320 px with 200 % text, dark mode with high contrast, keyboard
// ---------------------------------------------------------------------------------------------

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`B1 changed screens (${lang(locale)}): 320 px at 200 % text not clipped; dark mode with high contrast at 390 px; the keyboard reaches every control`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(420_000);
    await at(page);
    await seedSociety(page, { staff: SABA, locale, textScale: 2 });
    const invoiceId = await novemberBill(page);
    const cash = await cashOnA101(page, '6000');
    await reverseCash(page, cash.paymentId);
    // A draft voucher and a policy draft, to show both drawers in their B1 states.
    await office(page, SABA, '/backoffice/bank/cashbook', 'cashbook-page');
    const draft = await ok(api<{ voucher: { id: string } }>(page, '/finance/vouchers', 'POST', { accountId: 'cac_anr_petty', direction: 'payment', category: 'cleaning', amount: '450', onDate: '2026-10-26', purpose: 'Mops and buckets for the lobby', counterparty: 'Demo Hardware Store', evidence: { name: 'hardware-bill-2210.jpg', kind: 'bill', size: 1000 }, submit: false, idempotencyKey: `e2e-b1-draft-${locale}` }));
    const residentScreens: Array<[string, string, string]> = [
      ['receipt', `/customer/portal/receipt?record=${cash.receiptId}`, 'dues-receipt-page'],
      ['home', '/customer/portal/home', 'dues-bill'],
      ['bill', `/customer/portal/invoice-detail?record=${invoiceId}`, 'dues-bill-detail'],
      ['history', '/customer/portal/payment-history', 'dues-history'],
      ['my-properties', '/customer/portal/my-properties', 'my-properties'],
      ['bills', '/customer/portal/payments-dashboard', 'dues-bills'],
    ];
    const officeScreens: Array<[string, PersonaId, string, string]> = [
      ['payments-list', SABA, '/backoffice/fin/payment-list', 'payments-list'],
      ['collections-dashboard', SABA, '/backoffice/col/collections-dashboard', 'recent-payment-reversed'],
      ['voucher-draft', SABA, `/backoffice/bank/cashbook?voucher=${draft.voucher.id}`, 'voucher-detail'],
      ['credit-drawer', AYESHA, `/backoffice/fin/invoice-workspace?record=${invoiceId}&drawer=credit-note`, 'credit-note-drawer'],
      ['inbox-waiting', SABA, '/backoffice/fin/unverified-transfers-queue?state=waiting', 'proof-inbox'],
    ];
    // Resident app at 320 px with text at 200 % (the person's own setting).
    await page.setViewportSize(PHONE);
    for (const [name, path, ready] of residentScreens) {
      await portal(page, path, ready);
      expect.soft(await layoutProblems(page), `${name} 320 200 % ${locale}`).toEqual([]);
      expect.soft(await textOverlaps(page), `${name} 320 200 %: text over text ${locale}`).toEqual([]);
      expect.soft(await amountsOutsideCards(page), `${name} 320 200 %: money outside its card ${locale}`).toEqual([]);
      expect.soft(await overflowOf(page), `${name} 320 200 % ${locale}`).toBeLessThanOrEqual(0);
    }
    // The layout check does not look for overlaps: on My properties the status badge must never cover the flat code.
    await portal(page, '/customer/portal/my-properties', 'my-properties');
    const covered = await page.getByTestId('property-card').evaluateAll((cards) =>
      cards.filter((card) => {
        const code = card.querySelector('bdi.ltr-ref')!.getBoundingClientRect();
        return [...card.querySelectorAll('[class*="rounded-pill"]')].some((b) => {
          const r = b.getBoundingClientRect();
          return r.left < code.right && code.left < r.right && r.top < code.bottom && code.top < r.bottom;
        });
      }).length,
    );
    expect.soft(covered, `my-properties badge over the flat code ${locale}`).toBe(0);
    for (const [name, path, ready] of [residentScreens[0]!, residentScreens[2]!]) {
      await portal(page, path, ready);
      const stops = await focusWalk(page, { header: PORTAL_HEADER, bar: PORTAL_BAR, max: 60 });
      expect(stops.length, `${name}: controls reached`).toBeGreaterThan(2);
      expect.soft(stops.filter((s) => s.issue), `${name} keyboard ${locale}`).toEqual([]);
    }
    // Office app at 320 px with text at 200 % (Saba's and Ayesha's own setting, kept by the office origin).
    await page.goto(`${BO}/backoffice/global/my-access`);
    await page.evaluate((keys) => keys.forEach((k) => localStorage.setItem(k, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' }))), [DISPLAY_SABA, 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0002']);
    /**
     * What is checked on each office screen at 320 px / 200 %: the parts B1 changed. These screens also
     * carry layout problems in shared components B1 does not change, reproduced here with no B1 state
     * (recorded for B10/B2): the page-header actions ("Record office payment", "Import bank statement")
     * run off screen and make FIN-005 and COL-001 scroll sideways; drawer footers push "Cancel" off
     * screen; COL-001's stat tiles, block cards, progress legend and payer names clip. There the sideways
     * scroll is not asserted.
     */
    const office320: Record<string, { scopes: () => Locator[]; overflow: boolean }> = {
      'payments-list': { scopes: () => [page.getByTestId('payments-list'), page.getByTestId('payments-count')], overflow: false },
      'collections-dashboard': { scopes: () => [page.getByTestId('recent-payment-reversed')], overflow: false },
      'voucher-draft': { scopes: () => [page.getByTestId('voucher-detail')], overflow: true },
      // The drawer's charge lines (each checked on its own below).
      'credit-drawer': { scopes: () => [], overflow: false },
      // B1 added the filter; the rows are unchanged (their shared duplicate badge breaks a proof reference at this size).
      'inbox-waiting': { scopes: () => [page.getByTestId('inbox-filter'), page.getByTestId('inbox-count')], overflow: true },
    };
    for (const [name, persona, path, ready] of officeScreens) {
      await office(page, persona, path, ready);
      const check = office320[name]!;
      const scopes = name === 'credit-drawer' ? await page.getByTestId('credit-line').all() : check.scopes();
      for (const scope of scopes) expect.soft(await layoutProblems(scope), `${name} 320 200 % ${locale}`).toEqual([]);
      for (const scope of scopes) expect.soft(await textOverlaps(scope), `${name} 320 200 %: text over text ${locale}`).toEqual([]);
      if (check.overflow) expect.soft(await overflowOf(page), `${name} 320 200 % ${locale}`).toBeLessThanOrEqual(0);
    }
    // The keyboard on the office screen whose header has no action (the inbox and its new filter).
    await office(page, SABA, '/backoffice/fin/unverified-transfers-queue?state=waiting', 'proof-inbox');
    const stops = await focusWalk(page, { header: OFFICE_HEADER, bar: OFFICE_BAR, max: 80 });
    expect(stops.length, 'inbox: controls reached').toBeGreaterThan(2);
    expect.soft(stops.filter((s) => s.issue), `inbox keyboard ${locale}`).toEqual([]);
    await page.evaluate((keys) => keys.forEach((k) => localStorage.removeItem(k)), [DISPLAY_SABA, 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0002']);

    // Dark mode with high contrast at 390 px, both apps.
    await page.setViewportSize(VIEWPORTS.phone);
    const html = (n: string) => page.evaluate((a) => document.documentElement.getAttribute(a), n);
    await portal(page, '/customer/portal/accessibility-preferences', 'hub-theme');
    await page.getByTestId('hub-theme-dark').click();
    await page.getByTestId('hub-contrast-high').click();
    await expect.poll(() => html('data-contrast')).toBe('high');
    for (const [name, path, ready] of residentScreens) {
      await portal(page, path, ready);
      await axe(page, testInfo, `b1-${name}-390-dark-contrast-${locale}`);
      expect.soft(await layoutProblems(page), `${name} dark ${locale}`).toEqual([]);
      expect.soft(await textOverlaps(page), `${name} dark: text over text ${locale}`).toEqual([]);
    }
    await office(page, SABA, '/backoffice/global/accessibility-preferences', 'hub-theme');
    await page.getByTestId('hub-theme-dark').click();
    await page.getByTestId('hub-contrast-high').click();
    await expect.poll(() => html('data-contrast')).toBe('high');
    for (const [name, persona, path, ready] of officeScreens) {
      await office(page, persona, path, ready);
      await axe(page, testInfo, `b1-${name}-390-dark-contrast-${locale}`);
      expect.soft(await overflowOf(page), `${name} dark ${locale}`).toBeLessThanOrEqual(0);
    }
    expect(consoleErrors).toEqual([]);
  });
}
