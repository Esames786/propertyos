import type { Page } from '@playwright/test';
import { BO, CU, expect, test, waitForApp, type PersonaId } from '../support/fixtures';
import { become, seedSociety, societyApi } from '../support/society';

/**
 * UX B1 "Money truth" cross-browser smoke (Firefox and WebKit projects), on the screens where the batch
 * changed inputs: the credit-note drawer refuses a credit above what is open and keeps the drawer open;
 * a voucher saved as a draft stays open on its own address; the resident's reversed receipt says
 * "Reversed" in Urdu, never "Paid". The full checks run in Chromium (tests/e2e/ux-b1.spec.ts).
 * Business date: 26 October 2026.
 */
async function at(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
}

async function as(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await waitForApp(page);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function ok<T>(p: Promise<{ ok: true; res: T } | { ok: false; code: string; status: number }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`API refused: ${r.status} ${r.code}`);
  return r.res;
}

/** Firefox's own cancelled font request (NS_BINDING_ABORTED) is the browser, not the app. */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

/** Office cash on A-101 (Saba records, Ayesha counts); returns the payment and its receipt. */
async function cash(page: Page, amount: string) {
  await as(page, 'alnoor_treasurer', '/backoffice/fin/payment-list', 'payments-page');
  await ok(societyApi(page, '/sites/site_alnoor/payment-methods', 'PATCH', { method: 'office_cash', enabled: true }));
  await as(page, 'alnoor_accounts', '/backoffice/fin/payment-list', 'payments-page');
  const flat = await ok(societyApi<{ currentPayer: { partyId: string } }>(page, '/sites/site_alnoor/units/unt_anr_a101'));
  const recorded = await ok(societyApi<{ batch: { id: string } }>(page, '/payments/office', 'POST', { accountId: 'ba_anr_a101', payerPartyId: flat.currentPayer.partyId, amount, idempotencyKey: `smoke-b1-${amount}` }));
  await as(page, 'alnoor_treasurer', '/backoffice/fin/payment-list', 'payments-page');
  const confirmed = await ok(societyApi<{ batch: { lines: Array<{ outcome?: { paymentId: string } }> } }>(page, `/office-collections/${recorded.batch.id}/confirm`, 'POST', { countedCash: amount }));
  const paymentId = confirmed.batch.lines[0]!.outcome!.paymentId;
  const d = await ok(societyApi<{ receipt: { id: string } }>(page, `/payments/${paymentId}`));
  return { paymentId, receiptId: d.receipt.id };
}

test('the credit-note drawer refuses a credit above billed − paid − credited and stays open with the reason', async ({ page, consoleErrors }) => {
  test.setTimeout(150_000);
  await at(page);
  await seedSociety(page, { staff: 'alnoor_treasurer' });
  await page.goto(`${CU}/customer/portal/home`);
  const invoiceId = (await ok(societyApi<{ position: { current: { invoiceId: string } } }>(page, '/portal/dues/home'))).position.current.invoiceId;
  await cash(page, '3000');
  await as(page, 'alnoor_treasurer', `/backoffice/fin/invoice-workspace?record=${invoiceId}&drawer=credit-note`, 'credit-note-drawer');
  const drawer = page.getByTestId('credit-note-drawer');
  const maintenance = drawer.locator('[data-testid="credit-line"][data-category="maintenance"]');
  await expect(maintenance).toHaveAttribute('data-open', '1000.00');
  await drawer.locator('input[data-testid="credit-amount-maintenance"]').fill('1500');
  await drawer.getByTestId('credit-reason').fill('Lift out of service for two weeks');
  await drawer.getByTestId('credit-note-save').click();
  await expect(maintenance).toContainText('(A-101)');
  await expect(drawer).toBeVisible();
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('a voucher saved as a draft stays open on its own address', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await at(page);
  await seedSociety(page, { staff: 'alnoor_accounts' });
  await as(page, 'alnoor_accounts', '/backoffice/bank/cashbook', 'cashbook-page');
  const draft = await ok(societyApi<{ voucher: { id: string } }>(page, '/finance/vouchers', 'POST', { accountId: 'cac_anr_petty', direction: 'payment', category: 'cleaning', amount: '450', onDate: '2026-10-26', purpose: 'Mops and buckets for the lobby', counterparty: 'Demo Hardware Store', evidence: { name: 'hardware-bill.jpg', kind: 'bill', size: 1000 }, submit: false, idempotencyKey: 'smoke-b1-draft' }));
  await as(page, 'alnoor_accounts', '/backoffice/bank/cashbook', 'cashbook-page');
  await page.locator('[data-testid="pending-item"][data-kind="voucher_draft"]').click();
  await expect(page.getByTestId('voucher-detail')).toHaveAttribute('data-voucher', draft.voucher.id);
  await expect.poll(() => new URL(page.url()).searchParams.get('voucher')).toBe(draft.voucher.id);
  await page.getByTestId('voucher-edit').click();
  await page.locator('[data-testid="voucher-purpose"] textarea, textarea[data-testid="voucher-purpose"]').first().fill('Mops, buckets and gloves');
  await page.getByTestId('voucher-edit-save').click();
  await expect(page.getByTestId('voucher-detail')).toContainText('Mops, buckets and gloves');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('in Urdu, a reversed receipt says واپس شدہ, never ادا شدہ', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await at(page);
  await seedSociety(page, { staff: 'alnoor_accounts', locale: 'ur-PK' });
  const c = await cash(page, '6000');
  await as(page, 'alnoor_accounts', '/backoffice/fin/payment-list', 'payments-page');
  const asked = await ok(societyApi<{ approvalId: string }>(page, `/payments/${c.paymentId}/reversal-request`, 'POST', { reason: 'Recorded against the wrong flat by mistake' }));
  await as(page, 'alnoor_treasurer', `/backoffice/apr/approval-360-view?record=${asked.approvalId}`, 'approval-workspace');
  await ok(societyApi(page, `/approvals/${asked.approvalId}/decide`, 'POST', { decision: 'approve', reason: 'Checked against the cash book.' }));
  await become(page, 'customer', 'alnoor_resident_a101');
  await page.goto(`${CU}/customer/portal/receipt?record=${c.receiptId}`);
  await expect(page.getByTestId('receipt-status')).toHaveAttribute('data-status', 'reversed');
  await expect(page.getByTestId('receipt-status')).toHaveText('واپس شدہ');
  expect(await page.getByTestId('dues-receipt-page').locator('article').innerText()).not.toContain('ادا شدہ');
  expect(appErrors(consoleErrors)).toEqual([]);
});
