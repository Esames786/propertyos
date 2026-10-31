import type { Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, displayKey, expect, test, type Locale } from '../support/fixtures';
import { become, seedSociety, societyApi, textScaleOf } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate C.2 (A7 §C.2, owner review of C.1): the Al-Noor resident collection journey across both apps
 * of one browser. The resident's proof travels to the accounts officer through the labelled demo
 * link (the office app's storage); the receipt comes back the same way. Golden figures: A-101 owes
 * 4,200 (November) + 1,000 (October) = 5,200.
 */
const SITE = '/backoffice/sites/site_alnoor';
const HOME = '/customer/portal/home';
const PAY = '/customer/portal/upload-proof-mock';
const INBOX = '/backoffice/fin/unverified-transfers-queue';
const SLIP = (name: string, type = 'image/jpeg') => ({
  name,
  mimeType: type,
  buffer: Buffer.from(`fictional demo slip ${name}`),
});

const api = societyApi;

async function office(page: Page, path: string, ready: string) {
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready)).toBeVisible();
}

async function portal(page: Page, path: string, ready: string) {
  await page.goto(`${CU}${path}`);
  await expect(page.getByTestId(ready)).toBeVisible();
}

const textScale = textScaleOf;
const overflowOf = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Opens a resident's proof from the inbox (the list the accounts officer works through). */
async function reviewFlat(page: Page, flat: string) {
  await office(page, INBOX, 'proof-inbox');
  const row = page.locator(`[data-testid="proof-row"][data-flat="${flat}"]`);
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.getByTestId('proof-review')).toHaveAttribute('data-flat', flat);
}

/** The office-cash limit as stored for the site (what the counter enforces). */
async function cashLimit(page: Page) {
  const settings = await api<{ methods: Array<{ method: string; maxAmount?: { amount: string } }> }>(
    page,
    '/sites/site_alnoor/collection-settings',
  );
  return settings.ok
    ? settings.res.methods.find((m) => m.method === 'office_cash')?.maxAmount?.amount
    : undefined;
}

/** Opens a resident's proof from the inbox list of a given state. */
async function reviewFlatAs(page: Page, flat: string, state: string) {
  await office(page, `${INBOX}?state=${state}`, 'proof-inbox');
  const row = page.locator(`[data-testid="proof-row"][data-flat="${flat}"]`);
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.getByTestId('proof-review')).toHaveAttribute('data-flat', flat);
}

/** The resident sends a proof through the pay page. */
async function sendProof(
  page: Page,
  slip: ReturnType<typeof SLIP>,
  fields: { amount?: string; reference?: string } = {},
) {
  await portal(page, PAY, 'proof-form');
  if (fields.amount) await page.getByTestId('proof-amount').fill(fields.amount);
  if (fields.reference) await page.getByTestId('proof-reference').fill(fields.reference);
  await page.getByTestId('proof-file').setInputFiles(slip);
  await page.getByTestId('proof-send').click();
  await expect(page.getByTestId('dues-submission')).toBeVisible();
}

test.describe('Gate C.2: Al-Noor resident collections, proof to receipt', () => {
  // A7 AC-1: the storyline on desktop in English and on a phone in Urdu (keyboard only is below).
  for (const [vp, locale] of [
    ['desktop', 'en-PK'],
    ['phone', 'ur-PK'],
  ] as const) {
    test(`storyline (${vp}, ${locale}): A-101 chooses Large text, owes 5,200, sends proof (pending, never Paid); the accounts officer verifies it against the bank; receipt and statement at zero`, async ({
      page,
      consoleErrors,
    }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(VIEWPORTS[vp]);
      await seedSociety(page, { textScale: 'first-run', locale });

      // First run: one short step to choose a comfortable text size, previewed live.
      await page.goto(`${CU}${HOME}`);
      const welcome = page.getByTestId('text-size-welcome');
      await expect(welcome).toBeVisible();
      await welcome.getByTestId('text-size-125').click();
      expect(await textScale(page)).toBe('1.25');
      await page.getByTestId('text-size-continue').click();

      // The bill: identity, current, previous and the exact total.
      await expect(page.getByTestId('dues-home')).toBeVisible();
      expect(await textScale(page)).toBe('1.25');
      await expect(page.getByTestId('dues-identity')).toContainText('A-101');
      await expect(page.getByTestId('dues-current')).toContainText('4,200');
      await expect(page.getByTestId('dues-previous')).toContainText('1,000');
      await expect(page.getByTestId('dues-total')).toContainText('5,200');

      // How to pay: the association's verified account, the reference to quote, the labelled demo link.
      await page.getByTestId('dues-pay').click();
      await expect(page.getByTestId('dues-pay-page')).toBeVisible();
      await expect(page.getByTestId('pay-amount')).toContainText('5,200');
      await expect(page.getByTestId('payee-reference')).toContainText('ANR-A101-2026-11');
      await expect(page.getByTestId('payee-qr')).toBeVisible();
      await expect(page.getByTestId('demo-link')).toHaveAttribute('data-status', 'linked');
      await page.getByTestId('proof-file').setInputFiles(SLIP('kamran-ibft-5200.jpg'));
      await page.getByTestId('proof-send').click();
      await expect(page.getByTestId('dues-submission')).toBeVisible();
      await expect(page.getByTestId('proof-sent')).toBeVisible();
      await expect(page.getByTestId('proof-state').first()).toHaveAttribute(
        'data-state',
        'submitted',
      );

      // A proof alone never pays the bill.
      await portal(page, HOME, 'dues-home');
      await expect(page.getByTestId('dues-home')).not.toHaveAttribute('data-status', 'paid');
      await expect(page.getByTestId('dues-pending')).toBeVisible();
      await expect(page.getByTestId('dues-total')).toContainText('5,200');
      await expect(page.getByTestId('dues-receipt')).toHaveCount(0);

      // The accounts officer: the proof is in the inbox; the bank transfer is the suggested match.
      await reviewFlat(page, 'A-101');
      const match = page.locator('[data-testid="match-candidate"][data-txn="DEMO-TXN-26102604"]');
      await expect(match).toHaveAttribute('data-selected', 'true');
      await expect(page.getByTestId('received-amount')).toContainText('DEMO-TXN-26102604');
      // Line by line, oldest first: October's opening balance, then November's four charges.
      await expect(page.getByTestId('allocation-line')).toHaveCount(5);
      await expect(page.getByTestId('allocation-line').first()).toContainText('1,000');
      await page.getByTestId('review-verify').click();
      await expect(page.getByTestId('verified-banner')).toBeVisible();
      await expect(page.getByTestId('proof-review')).toHaveAttribute('data-state', 'verified');

      // Back to the resident: paid, with a receipt and a statement at zero; the text size stayed.
      await portal(page, HOME, 'dues-home');
      await expect(page.getByTestId('dues-home')).toHaveAttribute('data-status', 'paid');
      await expect(page.getByTestId('dues-total')).toContainText('0.00');
      await page.getByTestId('dues-receipt').first().click();
      await expect(page.getByTestId('dues-receipt-page')).toBeVisible();
      await expect(page.getByTestId('receipt-amount')).toContainText('5,200');
      await expect(page.getByTestId('receipt-settles')).toContainText('A-101');
      await portal(page, '/customer/portal/statements', 'dues-statement');
      await expect(page.getByTestId('statement-closing')).toContainText('0.00');
      expect(await textScale(page)).toBe('1.25');
      expect(await overflowOf(page)).toBeLessThanOrEqual(0);
      expect(consoleErrors).toEqual([]);
    });
  }

  test('proof decisions: a re-sent slip is refused against its matched transfer; a shared reference is accepted; needs information → resubmission → verified; a rejection reason reaches the resident', async ({
    page,
    consoleErrors,
  }) => {
    test.setTimeout(240_000);
    await seedSociety(page, { resident: 'alnoor_tenant_a102' });
    await page.goto(`${BO}/backoffice`);

    // A-204 sends again the transfer already verified on 24 October: the transfer is taken.
    await reviewFlat(page, 'A-204');
    await expect(page.getByTestId('duplicate-warning')).toBeVisible();
    const taken = page.locator('[data-testid="match-candidate"][data-txn="DEMO-TXN-26102207"]');
    await expect(taken).toHaveAttribute('data-taken', 'true');
    await expect(taken.getByTestId('candidate-taken')).toBeVisible();
    await taken.click();
    await page.getByTestId('review-verify').click();
    await expect(page.getByTestId('already-matched-help')).toBeVisible();
    await expect(page.getByTestId('verified-banner')).toHaveCount(0);
    await page.getByTestId('review-reject').click();
    const reject = page.getByRole('alertdialog');
    await reject
      .getByRole('textbox')
      .fill('This transfer was already verified on 24 October; its receipt was issued then.');
    await reject.getByRole('button', { name: 'Reject proof' }).click();
    await expect(page.getByTestId('proof-inbox')).toBeVisible();
    await expect(page.locator('[data-testid="proof-row"][data-flat="A-204"]')).toHaveCount(0);

    // B-405 quotes the same words as B-406's genuine transfer: a different transfer, accepted.
    await reviewFlat(page, 'B-405');
    const shared = page.locator('[data-testid="match-candidate"][data-txn="DEMO-TXN-26102411"]');
    await expect(shared).toHaveAttribute('data-selected', 'true');
    await expect(shared.getByTestId('candidate-shared-ref')).toBeVisible();
    await page.getByTestId('review-verify').click();
    await expect(page.getByTestId('verified-banner')).toBeVisible();

    // A-102's photo is blurred: ask for the bank's receipt.
    await reviewFlat(page, 'A-102');
    await page.getByTestId('review-request-info').click();
    await page
      .getByTestId('info-dialog-text')
      .fill('The photo is blurred. Please upload the bank’s PDF receipt.');
    await page.getByTestId('info-dialog-confirm').click();
    await expect(page.getByTestId('proof-inbox')).toBeVisible();

    // The tenant sees the request on the home page and sends the receipt again.
    await portal(page, HOME, 'dues-home');
    await page.getByTestId('dues-needs-info').click();
    await expect(page.getByTestId('proof-request')).toContainText('blurred');
    await page
      .getByTestId('resubmit-file')
      .setInputFiles(SLIP('sana-ibft-receipt.pdf', 'application/pdf'));
    await page.getByTestId('resubmit-send').click();
    await expect(page.getByTestId('proof-state').first()).toHaveAttribute(
      'data-state',
      'submitted',
    );

    // Second version verified against Sana's transfer.
    await reviewFlat(page, 'A-102');
    await expect(page.getByTestId('proof-versions')).toBeVisible();
    await expect(
      page.locator('[data-testid="match-candidate"][data-txn="DEMO-TXN-26102520"]'),
    ).toHaveAttribute('data-selected', 'true');
    await page.getByTestId('review-verify').click();
    await expect(page.getByTestId('verified-banner')).toBeVisible();
    await portal(page, HOME, 'dues-home');
    await expect(page.getByTestId('dues-home')).toHaveAttribute('data-status', 'paid');
    await expect(page.getByTestId('dues-receipt')).toHaveCount(1);

    // Sending the same slip again asks first; the office rejects it with a reason the tenant reads.
    await portal(page, PAY, 'proof-form');
    await page.getByTestId('proof-amount').fill('4200');
    await page
      .getByTestId('proof-file')
      .setInputFiles(SLIP('sana-ibft-receipt.pdf', 'application/pdf'));
    await page.getByTestId('proof-send').click();
    const again = page.getByRole('alertdialog');
    await expect(again).toBeVisible();
    await again.getByRole('button', { name: 'Send again' }).click();
    await expect(page.getByTestId('dues-submission')).toBeVisible();
    await reviewFlat(page, 'A-102');
    await page.getByTestId('review-reject').click();
    await page
      .getByRole('alertdialog')
      .getByRole('textbox')
      .fill('November is already paid (receipt issued); no second payment was received.');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reject proof' }).click();
    await expect(page.getByTestId('proof-inbox')).toBeVisible();
    await portal(page, '/customer/portal/payment-history', 'dues-history');
    await page.locator('[data-testid="history-proof"]').first().click();
    await expect(page.getByTestId('proof-rejected')).toContainText('November is already paid');
    expect(consoleErrors).toEqual([]);
  });

  test('office cash is refused until the treasurer allows it, within the limit the society sets; 3,000 at the counter waits for a second count (D-46), then leaves A-101 owing 2,200 with a receipt', async ({
    page,
    consoleErrors,
  }) => {
    test.setTimeout(150_000);
    await seedSociety(page);
    await office(
      page,
      '/backoffice/fin/payment-list?drawer=office&account=ba_anr_a101',
      'office-drawer',
    );
    const drawer = page.getByTestId('office-drawer');
    await expect(drawer.getByTestId('office-disabled')).toBeVisible();
    await drawer.getByTestId('office-amount').fill('3000');
    await drawer.getByTestId('office-submit').click();
    await expect(drawer.getByRole('alert')).toBeVisible();
    await expect(drawer.getByTestId('office-done')).toHaveCount(0);

    // The treasurer allows cash at the office (the accounts officer cannot change method rules).
    expect(
      await api(page, `${SITE.replace('/backoffice', '')}/payment-methods`, 'PATCH', {
        method: 'office_cash',
        enabled: true,
      }),
    ).toMatchObject({ ok: false, status: 403 });
    await become(page, 'backoffice', 'alnoor_treasurer');
    await office(page, `${SITE}?tab=payment-methods`, 'payment-methods');
    const toggle = page.getByTestId('method-toggle-office_cash');
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-selected', 'true');
    // The limit is the society's own rule (the demo starts at 50,000): lowered to 2,500 here.
    await page.getByTestId('cash-limit').fill('2500');
    await page.getByTestId('cash-rules-save').click();
    await expect.poll(() => cashLimit(page)).toBe('2500.00');

    await become(page, 'backoffice', 'alnoor_accounts');
    await office(
      page,
      '/backoffice/fin/payment-list?drawer=office&account=ba_anr_a101',
      'office-drawer',
    );
    await expect(drawer.getByTestId('office-disabled')).toHaveCount(0);
    await drawer.getByTestId('office-amount').fill('3000');
    await drawer.getByTestId('office-submit').click();
    await expect(drawer.getByRole('alert')).toBeVisible();
    await expect(drawer.getByTestId('office-done')).toHaveCount(0);
    // Raised to 5,000 by the treasurer: the same 3,000 is taken.
    await become(page, 'backoffice', 'alnoor_treasurer');
    await office(page, `${SITE}?tab=payment-methods`, 'payment-methods');
    await page.getByTestId('cash-limit').fill('5000');
    await page.getByTestId('cash-rules-save').click();
    await expect.poll(() => cashLimit(page)).toBe('5000.00');
    await become(page, 'backoffice', 'alnoor_accounts');
    await office(
      page,
      '/backoffice/fin/payment-list?drawer=office&account=ba_anr_a101',
      'office-drawer',
    );
    await drawer.getByTestId('office-amount').fill('3000');
    await expect(drawer.getByTestId('office-preview')).toBeVisible();
    await expect(drawer.getByTestId('office-count-rule')).toBeVisible();
    // Nothing on the form promises a receipt at the counter.
    await expect(drawer).not.toContainText(/receipt is issued straight away|issue receipt/i);
    await expect(drawer.getByTestId('office-submit')).toHaveText('Record cash for a second count');
    await drawer.getByTestId('office-submit').click();
    // Owner decision D-46 (D.1/S.1 integration): recorded, not paid. What it would settle is shown.
    const done = drawer.getByTestId('office-done');
    await expect(done).toHaveAttribute('data-status', 'awaiting_count');
    await expect(done.getByTestId('allocation-line')).toHaveCount(2);
    const collection = await done.getByTestId('office-open-collection').getAttribute('href');

    // The resident sees the cash handed in, and the bill not paid: no receipt yet.
    await portal(page, HOME, 'dues-home');
    await expect(page.getByTestId('dues-cash-awaiting')).toContainText('3,000');
    await expect(page.getByTestId('dues-total')).toContainText('5,200');
    await expect(page.getByTestId('dues-receipt')).toHaveCount(0);

    // A second person (the treasurer) finds it in their approvals, counts the cash and confirms.
    await become(page, 'backoffice', 'alnoor_treasurer');
    await office(page, '/backoffice/apr/my-approvals?tab=fixed', 'approvals-fixed');
    await expect(page.getByTestId('approval-fixed').filter({ hasText: 'Office cash to count' })).toHaveCount(1);
    await office(page, collection!, 'batch-drawer');
    await expect(page.getByTestId('batch-single-origin')).toBeVisible();
    await page.getByTestId('batch-counted').fill('3000');
    await page.getByTestId('batch-confirm').click();
    await expect(page.getByTestId('batch-state')).toHaveAttribute('data-state', 'confirmed');
    await expect(page.getByTestId('line-receipt')).toHaveCount(1);
    // Settled: no "more than owed" (what is owed now already includes this payment).
    await expect(page.getByTestId('line-warning')).toHaveCount(0);

    // Oldest first: October's 1,000, then 2,000 of November; 2,200 remains.
    await portal(page, HOME, 'dues-home');
    await expect(page.getByTestId('dues-home')).toHaveAttribute('data-status', 'partially_paid');
    await expect(page.getByTestId('dues-total')).toContainText('2,200');
    await expect(page.getByTestId('dues-receipt')).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });

  test('6,000 not yet on a statement waits for its bank line (nothing settled); the imported statement brings it; verified: 5,200 settled and 800 credit for the same payer', async ({
    page,
    consoleErrors,
  }) => {
    test.setTimeout(180_000);
    await seedSociety(page);
    await sendProof(page, SLIP('kamran-6000.jpg'), { amount: '6000', reference: 'A101 ALL DUES' });
    await reviewFlat(page, 'A-101');
    // No transfer of 6,000 is on any statement: nothing is proposed, and there is no way to settle it by hand.
    await expect(page.locator('[data-testid="match-candidate"][data-selected="true"]')).toHaveCount(
      0,
    );
    await expect(page.getByTestId('match-manual')).toHaveCount(0);
    await page.getByTestId('match-await').click();
    await expect(page.getByTestId('review-verify')).toHaveCount(0);
    await expect(page.getByTestId('review-await')).toBeDisabled();
    await page
      .getByTestId('await-note')
      .fill('Resident says it was sent today; not on the imported statements yet.');
    await page.getByTestId('review-await').click();
    await expect(page.getByTestId('proof-review')).toHaveAttribute(
      'data-state',
      'awaiting_bank_evidence',
    );
    await expect(page.getByTestId('awaiting-banner')).toBeVisible();

    // The resident still owes 5,200: pending, no receipt.
    await portal(page, HOME, 'dues-home');
    await expect(page.getByTestId('dues-home')).not.toHaveAttribute('data-status', 'paid');
    await expect(page.getByTestId('dues-total')).toContainText('5,200');
    await expect(page.getByTestId('dues-receipt')).toHaveCount(0);

    // The afternoon statement of the association's account brings the transfer.
    await office(page, '/backoffice/bank/bank-transaction-feed', 'bank-feed');
    await page.getByTestId('bank-import-open').click();
    const drawer = page.getByTestId('bank-import');
    await expect(drawer.getByTestId('bank-import-sample-3')).toBeDisabled();
    await drawer.getByTestId('bank-import-account').getByRole('button').click();
    await page.getByRole('option', { name: /3456 7890/ }).click();
    await drawer.getByTestId('bank-import-sample-3').click();
    await expect(drawer.getByTestId('bank-import-matchable')).toContainText('A-101');
    await drawer.getByTestId('bank-import-matchable').getByRole('link').first().click();
    await expect(page.getByTestId('proof-review')).toHaveAttribute('data-flat', 'A-101');
    await expect(
      page.locator('[data-testid="match-candidate"][data-txn="DEMO-TXN-26102615"]'),
    ).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('allocation-unapplied')).toContainText('800');
    await page.getByTestId('review-verify').click();
    await expect(page.getByTestId('verified-banner')).toContainText('800');

    await portal(page, HOME, 'dues-home');
    await expect(page.getByTestId('dues-home')).toHaveAttribute('data-status', 'paid');
    await expect(page.getByTestId('dues-total')).toContainText('0.00');
    await expect(page.getByTestId('dues-credit')).toContainText('800');
    // The officer sees the credit on the payer's list of credits.
    await office(page, '/backoffice/fin/customer-credit-overpayments', 'credits-page');
    await expect(page.locator('[data-testid="credit-row"]', { hasText: 'A-101' })).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });

  test('a partly matching transfer settles only through an exception a second person approves', async ({
    page,
    consoleErrors,
  }) => {
    test.setTimeout(150_000);
    await seedSociety(page);
    await reviewFlat(page, 'B-405');
    // Imran's transfer quotes the same words for B-405, but another payer: partial, never verified directly.
    const imran = page.locator('[data-testid="match-candidate"][data-txn="DEMO-TXN-26102518"]');
    await expect(imran).toHaveAttribute('data-strength', 'partial');
    await imran.click();
    await expect(imran.getByTestId('candidate-missing')).toBeVisible();
    await expect(page.getByTestId('exception-form')).toBeVisible();
    await expect(page.getByTestId('review-verify')).toHaveCount(0);
    await expect(page.getByTestId('review-exception')).toBeDisabled();
    await page
      .getByTestId('exception-reason')
      .fill('Komal says her husband Imran sent it from his account; confirmed by phone.');
    await page.getByTestId('review-exception').click();
    const card = page.getByTestId('exception-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('proof-review')).toHaveAttribute(
      'data-state',
      'exception_pending',
    );
    // The accounts officer who asked cannot approve.
    await expect(card.getByTestId('review-exception-approve')).toHaveCount(0);
    await expect(card.getByTestId('exception-waiting')).toBeVisible();

    // The treasurer approves: payment and receipt, marked as an approved exception.
    await become(page, 'backoffice', 'alnoor_treasurer');
    await office(page, '/backoffice', 'society-dashboard');
    await expect(
      page.locator('[data-testid="approval-item"][data-kind="payment_exception"]'),
    ).toBeVisible();
    await reviewFlatAs(page, 'B-405', 'exception_pending');
    await page.getByTestId('review-exception-approve').click();
    await expect(page.getByTestId('verified-banner')).toBeVisible();
    await page.getByTestId('open-payment').click();
    await expect(page.getByTestId('payment-workspace')).toBeVisible();
    await expect(page.getByTestId('payment-exception')).toContainText('Ayesha Malik');
    await expect(page.getByTestId('verification-badge')).toHaveAttribute(
      'data-verification',
      'exception_approved',
    );
    expect(consoleErrors).toEqual([]);
  });

  test('statements belong to the account the officer chooses; money on the retired account never settles a proof', async ({
    page,
    consoleErrors,
  }) => {
    test.setTimeout(150_000);
    await seedSociety(page);
    // Kamran pays the old committee account by mistake (20 October, after it was retired on the 12th).
    await portal(page, PAY, 'proof-form');
    await page.getByTestId('proof-date').fill('2026-10-20');
    await page.getByTestId('proof-file').setInputFiles(SLIP('kamran-old-account.jpg'));
    await page.getByTestId('proof-send').click();
    await expect(page.getByTestId('dues-submission')).toBeVisible();

    await office(page, '/backoffice/bank/bank-transaction-feed', 'bank-feed');
    await page.getByTestId('bank-import-open').click();
    const drawer = page.getByTestId('bank-import');
    // The committee account's statement is refused for the association's account...
    await drawer.getByTestId('bank-import-account').getByRole('button').click();
    await page.getByRole('option', { name: /3456 7890/ }).click();
    await drawer.getByTestId('bank-import-sample-4').click();
    await expect(drawer.getByRole('alert')).toBeVisible();
    await expect(drawer.getByTestId('bank-import-result')).toHaveCount(0);
    // ...and imported for its own account.
    await drawer.getByTestId('bank-import-account').getByRole('button').click();
    await page.getByRole('option', { name: /8765 4321/ }).click();
    await drawer.getByTestId('bank-import-sample-4').click();
    await expect(drawer.getByTestId('bank-import-result')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      page.locator('[data-testid="bank-statement-account"][data-account="ben_anr_committee"]'),
    ).toHaveCount(1);
    // The same bank id on two accounts: two lines, one per account.
    await expect(
      page.locator('[data-testid="bank-line"][data-txn="DEMO-TXN-26102201"]'),
    ).toHaveCount(2);

    // In the review, the line on the retired account is shown but cannot be chosen.
    await reviewFlat(page, 'A-101');
    const wrong = page.locator('[data-testid="match-candidate"][data-account="ben_anr_committee"]');
    await expect(wrong).toHaveAttribute('data-destination', 'wrong_account');
    await expect(wrong).toHaveAttribute('data-disabled', 'true');
    await expect(wrong.getByTestId('candidate-wrong-destination')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('a shared account: the A-202 tenant pays only A-202; the A-201 owner still owes 7,200 and cannot open the tenant’s bill', async ({
    page,
    consoleErrors,
  }) => {
    test.setTimeout(150_000);
    await seedSociety(page, { resident: 'alnoor_tenant_a202' });
    await portal(page, HOME, 'dues-home');
    await expect(page.getByTestId('dues-identity')).toContainText('A-202');
    await expect(page.getByTestId('dues-identity')).not.toContainText('A-201');
    await expect(page.getByTestId('dues-total')).toContainText('4,200');
    const home = await api<{ position: { current: { invoiceId: string } } }>(
      page,
      '/portal/dues/home',
    );
    const tenantBill = home.ok ? home.res.position.current.invoiceId : '';
    await sendProof(page, SLIP('junaid-a202.jpg'), { reference: 'A202 NOV' });

    await reviewFlat(page, 'A-202');
    await expect(
      page.locator('[data-testid="match-candidate"][data-txn="DEMO-TXN-26102522"]'),
    ).toHaveAttribute('data-selected', 'true');
    const lines = page.getByTestId('allocation-line');
    await expect(lines.first()).toContainText('A-202');
    await expect(lines.filter({ hasText: 'A-201' })).toHaveCount(0);
    await page.getByTestId('review-verify').click();
    await expect(page.getByTestId('verified-banner')).toBeVisible();

    await portal(page, HOME, 'dues-home');
    await expect(page.getByTestId('dues-home')).toHaveAttribute('data-status', 'paid');
    await become(page, 'customer', 'alnoor_owner_a201');
    await portal(page, HOME, 'dues-home');
    await expect(page.getByTestId('dues-identity')).toContainText('A-201');
    await expect(page.getByTestId('dues-total')).toContainText('7,200');
    expect(await api(page, `/portal/dues/bills/${tenantBill}`)).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(consoleErrors).toEqual([]);
  });

  test('a new collection account: the manager proposes, a second person approves, residents keep the verified account through cooling-off', async ({
    page,
    consoleErrors,
  }) => {
    test.setTimeout(150_000);
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, `${SITE}?tab=collection-settings`, 'payee-card');
    await page.getByTestId('propose-account').click();
    await page.getByTestId('propose-branch').fill('DHA Phase 5, Lahore');
    await page.getByTestId('propose-title').fill('Al-Noor Residency Owners’ Association (Demo)');
    await page.getByTestId('propose-iban').fill('PK90DEMO0000005550001111');
    await page
      .getByTestId('propose-reason')
      .fill('Moving to the branch next to the society office.');
    await page.getByTestId('propose-checked').click();
    await page.getByTestId('propose-submit').click();
    const change = page.getByTestId('beneficiary-change');
    await expect(change).toHaveAttribute('data-state', 'pending_approval');
    // The person who proposed it cannot approve it.
    await expect(page.getByTestId('beneficiary-approve')).toHaveCount(0);

    const residentIban = async () => {
      await portal(page, PAY, 'payee-card');
      return (await page.getByTestId('payee-iban').innerText()).replace(/\s+/g, '');
    };
    expect(await residentIban()).not.toContain('5550001111');

    await become(page, 'backoffice', 'alnoor_treasurer');
    await office(page, `${SITE}?tab=collection-settings`, 'beneficiary-change');
    await page.getByTestId('beneficiary-approve').click();
    await expect(page.getByTestId('beneficiary-change')).toHaveAttribute(
      'data-state',
      'cooling_off',
    );
    // Cooling-off: residents still see the account in force.
    expect(await residentIban()).not.toContain('5550001111');

    await office(page, `${SITE}?tab=collection-settings`, 'beneficiary-change');
    await page.getByTestId('beneficiary-end-cooling').click();
    await expect(page.getByTestId('beneficiary-change')).toHaveCount(0);
    expect(await residentIban()).toContain('5550001111');
    await expect(page.getByTestId('payee-changed')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('the building manager’s collections dashboard: every number opens its filtered records; reading is not deciding', async ({
    page,
    consoleErrors,
  }) => {
    test.setTimeout(150_000);
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, '/backoffice', 'society-dashboard');
    for (const [kpi, path, ready] of [
      ['kpi-billed', '/backoffice/fin/invoices-list', 'society-invoices'],
      ['kpi-collected', '/backoffice/fin/payment-list', 'payments-page'],
      ['kpi-pending', INBOX, 'proof-inbox'],
      ['kpi-arrears', '/backoffice/billing/accounts', 'accounts-list'],
    ] as const) {
      await office(page, '/backoffice', 'society-dashboard');
      await page.getByTestId(kpi).click();
      await expect(page.getByTestId(ready)).toBeVisible();
      expect(new URL(page.url()).pathname, kpi).toBe(path);
    }
    await office(page, '/backoffice', 'society-dashboard');
    await page.locator('[data-testid="aging-bucket"]').first().click();
    await expect(page.getByTestId('aging-page')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('bucket')).toBeTruthy();
    await office(page, '/backoffice', 'society-dashboard');
    await page.getByTestId('queue-review').click();
    await expect(page.getByTestId('proof-inbox')).toBeVisible();
    await expect(page.getByTestId('inbox-count')).toContainText('6');

    // The manager reads proofs but does not decide them, and never sees the bank feed.
    await page.locator('[data-testid="proof-row"]').first().click();
    await expect(page.getByTestId('review-read-only')).toBeVisible();
    await expect(page.getByTestId('review-verify')).toHaveCount(0);
    expect(await api(page, '/bank/feed')).toMatchObject({ ok: false, status: 403 });
    expect(consoleErrors).toEqual([]);
  });

  test('isolation: the guard reaches no collections; a resident reaches no staff endpoint; Larkspur’s buyer keeps the developer portal; Shalimar sees how to set up', async ({
    page,
    consoleErrors,
  }) => {
    test.setTimeout(150_000);
    await seedSociety(page, { staff: 'alnoor_guard' });
    await page.goto(`${BO}${INBOX}`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute(
      'data-reason',
      'permission_missing',
    );
    for (const path of [
      '/payment-submissions',
      '/payments',
      '/bank/feed',
      '/collections/summary',
      '/collections/aging',
      '/sites/site_alnoor/collection-settings',
    ]) {
      expect(await api(page, path), path).toMatchObject({ ok: false, status: 403 });
    }
    expect(
      await api(page, '/payments/office', 'POST', {
        accountId: 'ba_anr_a101',
        payerPartyId: 'pty_anr_0001',
        amount: '100',
      }),
    ).toMatchObject({ ok: false, status: 403 });

    // A resident: no staff endpoint, nobody else's receipt or bill.
    await portal(page, HOME, 'dues-home');
    for (const path of [
      '/payment-submissions',
      '/payments',
      '/bank/feed',
      '/collections/summary',
    ]) {
      expect((await api(page, path)).ok, path).toBe(false);
    }
    expect(await api(page, '/portal/dues/receipts/rct_anr_0001')).toMatchObject({
      ok: false,
      status: 404,
    });

    // Larkspur's buyer (another organisation) keeps the developer portal and has no dues.
    await page.evaluate(() =>
      localStorage.setItem(
        'demo:session:customer',
        JSON.stringify({ personaId: 'resident', projectId: 'all' }),
      ),
    );
    await page.evaluate(
      (key) =>
        localStorage.setItem(
          key,
          JSON.stringify({ version: 1, textScale: 1, chosenAt: '2026-10-26T00:00:00Z' }),
        ),
      displayKey('resident'),
    );
    await portal(page, HOME, 'portal-home');
    await expect(page.getByTestId('dues-home')).toHaveCount(0);
    expect((await api(page, '/portal/dues/home')).ok).toBe(false);

    // Shalimar's administrator: no sites yet, and the page says what to do next.
    await page.goto(`${BO}/backoffice`);
    await page.evaluate(() =>
      localStorage.setItem(
        'demo:session:backoffice',
        JSON.stringify({ personaId: 'society_admin', projectId: 'all' }),
      ),
    );
    await office(page, '/backoffice/sites', 'sites-page');
    await expect(page.getByTestId('sites-empty')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('keyboard only: through a proof review to verification', async ({ page, consoleErrors }) => {
    await seedSociety(page);
    await reviewFlat(page, 'B-102');
    const focused = (testId: string) =>
      page.getByTestId(testId).evaluate((el) => el.contains(document.activeElement));
    // Into the bank-transfer choice; arrows move between candidates and "verify by hand".
    for (
      let i = 0;
      i < 60 &&
      !(await page
        .getByTestId('match-choice')
        .evaluate((el) => el.contains(document.activeElement)));
      i++
    )
      await page.keyboard.press('Tab');
    expect(await focused('match-choice')).toBe(true);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    const chosen = page.locator('[data-testid="match-candidate"][data-selected="true"]');
    await expect(chosen).toHaveAttribute('data-txn', 'DEMO-TXN-26102409');
    const verify = page.getByTestId('review-verify');
    for (let i = 0; i < 40 && !(await verify.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('Tab');
    await expect(verify).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('verified-banner')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('the dues tour frames the real bill and completes its guided step when Pay is opened', async ({
    page,
    consoleErrors,
  }) => {
    await seedSociety(page, { residentOnboarding: 'fresh' });
    await page.goto(`${CU}${HOME}`);
    await page.getByTestId('welcome-start').click();
    const card = page.getByTestId('tour-card');
    await expect(card).toBeVisible();
    for (let i = 0; i < 8; i++) {
      const step = await card.getAttribute('data-step-id');
      if (step === 'pay') break;
      await page.getByTestId('tour-next').click();
      await expect(card).not.toHaveAttribute('data-step-id', step ?? '');
    }
    await expect(card).toHaveAttribute('data-step-id', 'pay');
    await page.locator('[data-tour-id="dues-pay"]').click();
    await expect(card).not.toHaveAttribute('data-step-id', 'pay');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Gate C.2: text size (first run and settings)', () => {
  for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
    test(`phone, ${locale}: first run Large applies everywhere; Settings to 200 % survives a refresh; nothing clips, overlaps or scrolls sideways; reset`, async ({
      page,
      consoleErrors,
    }) => {
      test.setTimeout(150_000);
      await page.setViewportSize(VIEWPORTS.phone);
      await seedSociety(page, { textScale: 'first-run', locale });
      await page.goto(`${CU}${HOME}`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const welcome = page.getByTestId('text-size-welcome');
      await expect(welcome).toBeVisible();
      for (const percent of [100, 112, 125, 150])
        await expect(welcome.getByTestId(`text-size-${percent}`)).toBeVisible();
      await welcome.getByTestId('text-size-125').click();
      await page.getByTestId('text-size-continue').click();
      await expect(page.getByTestId('dues-home')).toBeVisible();
      expect(await textScale(page)).toBe('1.25');

      // Settings: the full scale, previewed at once, kept for this person in this organisation.
      await portal(
        page,
        '/customer/portal/accessibility-preferences#text-size',
        'text-size-settings',
      );
      for (const percent of [100, 112, 125, 150, 175, 200])
        await expect(page.getByTestId(`text-size-${percent}`)).toBeVisible();
      await page.getByTestId('text-size-200').click();
      expect(await textScale(page)).toBe('2');
      // Numbers stay in Latin digits in Urdu too (the app's convention for money and references).
      await expect(page.getByTestId('text-size-current')).toContainText('200');
      await page.reload();
      await expect(page.getByTestId('text-size-settings')).toBeVisible();
      expect(await textScale(page)).toBe('2');
      expect(
        await page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? '{}').textScale,
          displayKey('alnoor_resident_a101'),
        ),
      ).toBe(2);

      // At 200 %: no sideways scroll; the bottom bar never covers content or actions; its labels are whole.
      const checkAt200 = async (path: string, ready: string) => {
        await portal(page, path, ready);
        expect(await overflowOf(page), `${path} overflow`).toBeLessThanOrEqual(0);
        const nav = page.getByTestId('portal-bottom-nav');
        await expect(nav).toBeVisible();
        const geometry = await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
          const nav = document.querySelector('[data-testid="portal-bottom-nav"]')!;
          const main = document.querySelector('main')!;
          const bottoms = Array.from(main.querySelectorAll('*'))
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0 && r.height > 0)
            .map((r) => r.bottom);
          // The links and their label spans (a label is cut inside its own span, with an ellipsis).
          const clipped = Array.from(nav.querySelectorAll('a, button, a span, button span')).filter(
            (el) => (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1,
          ).length;
          return {
            navTop: nav.getBoundingClientRect().top,
            contentBottom: Math.max(...bottoms),
            clipped,
          };
        });
        expect(
          geometry.contentBottom,
          `${path}: content ends above the bottom bar`,
        ).toBeLessThanOrEqual(geometry.navTop + 1);
        expect(geometry.clipped, `${path}: bottom bar labels`).toBe(0);
      };
      for (const [path, ready] of [
        [HOME, 'dues-home'],
        [PAY, 'proof-form'],
        ['/customer/portal/statements', 'dues-statement'],
        ['/customer/portal/payments-dashboard', 'dues-bills'],
      ] as const)
        await checkAt200(path, ready);
      // And once the month is paid: the receipt on the home page, the history, the receipt and the proof.
      const sent = await api<{ submission: { id: string } }>(
        page,
        '/portal/dues/submissions',
        'POST',
        {
          amount: '5200',
          transferDate: '2026-10-26',
          bankReference: 'ANR-A101-2026-11',
          file: { name: 'slip.jpg', type: 'image/jpeg', size: 120_000 },
        },
      );
      const submissionId = sent.ok ? sent.res.submission.id : '';
      await page.goto(`${BO}/backoffice`);
      const detail = await api<{ candidates: Array<{ bankLine: { id: string } }> }>(
        page,
        `/payment-submissions/${submissionId}`,
      );
      await api(page, `/payment-submissions/${submissionId}/verify`, 'POST', {
        amount: '5200',
        bankLineId: detail.ok ? detail.res.candidates[0]!.bankLine.id : '',
      });
      await portal(page, HOME, 'dues-receipt');
      const paid = await api<{ receipts: Array<{ id: string }> }>(page, '/portal/dues/home');
      for (const [path, ready] of [
        [HOME, 'dues-receipt'],
        ['/customer/portal/payment-history', 'dues-history'],
        [
          `/customer/portal/receipt?record=${paid.ok ? paid.res.receipts[0]!.id : ''}`,
          'dues-receipt-page',
        ],
        [`/customer/portal/submissions/${submissionId}`, 'dues-submission'],
        ['/customer/portal/statements', 'statement-entries'],
      ] as const)
        await checkAt200(path, ready);
      // The primary action can be pressed (not hidden under the bar).
      await portal(page, PAY, 'proof-form');
      await page.getByTestId('proof-send').scrollIntoViewIfNeeded();
      await page.getByTestId('proof-send').click({ trial: true });

      // Reset to the default.
      await portal(
        page,
        '/customer/portal/accessibility-preferences#text-size',
        'text-size-settings',
      );
      await page.getByTestId('text-size-reset').click();
      expect(await textScale(page)).toBe('1');
      expect(consoleErrors).toEqual([]);
    });
  }

  for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
    test(`phone, ${locale}, 150 % and 200 %: the header stays one line and never covers the page; keyboard focus never lands under the header or the bar; the bar steps aside while typing`, async ({
      page,
      consoleErrors,
    }) => {
      test.setTimeout(150_000);
      await page.setViewportSize(VIEWPORTS.phone);
      await seedSociety(page, { locale, textScale: 1.5 });
      for (const scale of ['150', '200'] as const) {
        if (scale === '200') {
          await portal(
            page,
            '/customer/portal/accessibility-preferences#text-size',
            'text-size-settings',
          );
          await page.getByTestId('text-size-200').click();
        }
        await portal(page, HOME, 'dues-home');
        const header = page.getByTestId('portal-header');
        await expect(header).toHaveAttribute('data-compact', 'true');
        // The organisation's name is still there for screen readers (and on the page itself).
        await expect(page.getByTestId('portal-header-name')).toHaveClass(/sr-only/);
        const geometry = await page.evaluate(() => {
          window.scrollTo(0, 0);
          const h = document
            .querySelector('[data-testid="portal-header"]')!
            .getBoundingClientRect();
          const h1 = document.querySelector('main h1')!.getBoundingClientRect();
          return { headerHeight: h.height, headerBottom: h.bottom, h1Top: h1.top };
        });
        expect(geometry.headerHeight, `${scale}: header height`).toBeLessThanOrEqual(80);
        expect(
          geometry.h1Top,
          `${scale}: the heading starts below the header`,
        ).toBeGreaterThanOrEqual(geometry.headerBottom);

        // Keyboard: every control reached with Tab is fully in view, clear of the header and the bar.
        const failures: string[] = [];
        for (let i = 0; i < 18; i++) {
          await page.keyboard.press('Tab');
          const where = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body || !document.querySelector('main')!.contains(el))
              return null;
            const r = el.getBoundingClientRect();
            const head = document
              .querySelector('[data-testid="portal-header"]')!
              .getBoundingClientRect();
            const nav = document
              .querySelector('[data-testid="portal-bottom-nav"]')!
              .getBoundingClientRect();
            return {
              id: el.getAttribute('data-testid') ?? el.tagName,
              top: r.top,
              bottom: r.bottom,
              headBottom: head.bottom,
              navTop: nav.top,
              h: window.innerHeight,
            };
          });
          if (!where) continue;
          if (
            where.top < where.headBottom - 1 ||
            where.bottom > Math.min(where.navTop, where.h) + 1
          )
            failures.push(
              `${scale} ${where.id}: ${Math.round(where.top)}–${Math.round(where.bottom)} (header ends ${Math.round(where.headBottom)}, bar starts ${Math.round(where.navTop)})`,
            );
        }
        expect(failures).toEqual([]);
      }

      // Typing with the keyboard open (a short viewport): the field stays in view and the bar steps aside.
      await page.setViewportSize({ width: 390, height: 420 });
      await portal(page, PAY, 'proof-form');
      const nav = page.getByTestId('portal-bottom-nav');
      const amount = page.getByTestId('proof-amount');
      await amount.focus();
      await expect(nav).toHaveAttribute('data-typing', 'true');
      await expect(nav).toHaveAttribute('inert', '');
      const box = await amount.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(420);
      await page.keyboard.type('5200');
      await page.getByTestId('proof-file-pick').focus();
      await expect(nav).not.toHaveAttribute('data-typing', 'true');
      expect(await overflowOf(page)).toBeLessThanOrEqual(0);
      expect(consoleErrors).toEqual([]);
    });
  }

  test('desktop: text size is kept per person; another resident of the same browser keeps their own', async ({
    page,
    consoleErrors,
  }) => {
    await seedSociety(page, { textScale: 1.5 });
    await portal(page, HOME, 'dues-home');
    expect(await textScale(page)).toBe('1.5');
    await become(page, 'customer', 'alnoor_tenant_a102');
    await portal(page, HOME, 'dues-home');
    expect(await textScale(page)).toBe('1');
    expect(await overflowOf(page)).toBeLessThanOrEqual(0);
    expect(consoleErrors).toEqual([]);
  });
});

/** The office screens of C.2 (accounts officer), with the element that says each is ready. */
const OFFICE_SCREENS: ReadonlyArray<readonly [string, string, string]> = [
  ['dashboard', '/backoffice', 'kpi-collected'],
  ['collections', '/backoffice/col/collections-dashboard', 'collections-page'],
  ['inbox', INBOX, 'proof-inbox'],
  ['review', '/backoffice/fin/transfer-proof-review?record=psb_anr_0004', 'match-choice'],
  ['payments', '/backoffice/fin/payment-list', 'payments-list'],
  ['credits', '/backoffice/fin/customer-credit-overpayments', 'credits-page'],
  ['aging', '/backoffice/col/aging-breakdown', 'aging-page'],
  ['statement', '/backoffice/col/customer-statement?account=ba_anr_a101', 'account-statement'],
  ['bank', '/backoffice/bank/bank-transaction-feed', 'bank-feed'],
  ['reconciliation', '/backoffice/bank/reconciliation-workspace', 'reconciliation'],
  ['payer-changes', '/backoffice/billing/payer-changes', 'payer-changes'],
  ['site-collection', `${SITE}?tab=collection-settings`, 'payee-card'],
  ['site-methods', `${SITE}?tab=payment-methods`, 'payment-methods'],
  ['site-controls', `${SITE}?tab=billing-controls`, 'billing-controls'],
  [
    'office-drawer',
    '/backoffice/fin/payment-list?drawer=office&account=ba_anr_a101',
    'office-drawer',
  ],
];

const RESIDENT_SCREENS: ReadonlyArray<readonly [string, string, string]> = [
  ['home', HOME, 'dues-home'],
  ['bills', '/customer/portal/payments-dashboard', 'dues-bills'],
  ['pay', PAY, 'proof-form'],
  ['payee', '/customer/portal/bank-transfer-details', 'payee-card'],
  ['history', '/customer/portal/payment-history', 'dues-history'],
  ['statement', '/customer/portal/statements', 'dues-statement'],
  ['settings', '/customer/portal/accessibility-preferences', 'text-size-settings'],
];

async function scanList(
  page: Page,
  testInfo: TestInfo,
  tag: string,
  base: string,
  list: ReadonlyArray<readonly [string, string, string]>,
  failures: string[],
) {
  for (const [label, path, ready] of list) {
    await page.goto(`${base}${path}`);
    await expect(page.getByTestId(ready)).toBeVisible();
    const { violations } = await scanA11y(page, testInfo, `${tag}-${label}`);
    for (const v of violations)
      failures.push(`${label}: ${v.id} (${v.nodes}) ${v.targets.join(' | ')}`);
    const overflow = await overflowOf(page);
    if (overflow > 0) failures.push(`${label}: horizontal overflow ${overflow}px`);
  }
}

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  for (const vp of ['desktop', 'phone'] as const) {
    test(`axe and reflow: every C.2 office screen and overlay (${locale}, ${vp})`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(240_000);
      await page.setViewportSize(VIEWPORTS[vp]);
      await seedSociety(page, { locale });
      const failures: string[] = [];
      await scanList(page, testInfo, `c2-${locale}-${vp}`, BO, OFFICE_SCREENS, failures);
      // A payment and its receipt; then the request-for-information and rejection dialogs.
      const list = await api<{ items: Array<{ id: string }> }>(page, '/payments');
      const paymentId = list.ok ? list.res.items[0]!.id : '';
      await scanList(
        page,
        testInfo,
        `c2-${locale}-${vp}`,
        BO,
        [['payment', `/backoffice/fin/payment-workspace?record=${paymentId}`, 'payment-workspace']],
        failures,
      );
      await page.goto(`${BO}/backoffice/fin/transfer-proof-review?record=psb_anr_0005`);
      await page.getByTestId('review-request-info').click();
      await expect(page.getByTestId('info-dialog')).toBeVisible();
      for (const v of (await scanA11y(page, testInfo, `c2-${locale}-${vp}-info-dialog`)).violations)
        failures.push(`info-dialog: ${v.id} ${v.targets.join(' | ')}`);
      await page.keyboard.press('Escape');
      await page.getByTestId('review-reject').click();
      await expect(page.getByRole('alertdialog')).toBeVisible();
      for (const v of (await scanA11y(page, testInfo, `c2-${locale}-${vp}-reject-dialog`))
        .violations)
        failures.push(`reject-dialog: ${v.id} ${v.targets.join(' | ')}`);
      // The closure's states: the statement import (account chosen), a proof waiting for its bank line,
      // and an exception waiting for a second person.
      await page.goto(`${BO}/backoffice/bank/bank-transaction-feed`);
      await page.getByTestId('bank-import-open').click();
      await expect(page.getByTestId('bank-import')).toBeVisible();
      for (const v of (await scanA11y(page, testInfo, `c2-${locale}-${vp}-bank-import`)).violations)
        failures.push(`bank-import: ${v.id} ${v.targets.join(' | ')}`);
      await page.goto(`${BO}/backoffice`);
      await api(page, '/payment-submissions/psb_anr_0004/await-bank', 'POST', {
        note: 'Not on the imported statements yet; checking the next one.',
      });
      const komal = await api<{
        candidates: Array<{ bankLine: { id: string; bankTxnId: string } }>;
      }>(page, '/payment-submissions/psb_anr_0007');
      const imran = komal.ok
        ? komal.res.candidates.find((c) => c.bankLine.bankTxnId === 'DEMO-TXN-26102518')
        : undefined;
      await api(page, '/payment-submissions/psb_anr_0007/exception', 'POST', {
        bankLineId: imran?.bankLine.id ?? '',
        reason: 'Komal says her husband Imran sent it from his account.',
      });
      await scanList(
        page,
        testInfo,
        `c2-${locale}-${vp}`,
        BO,
        [
          [
            'review-awaiting',
            '/backoffice/fin/transfer-proof-review?record=psb_anr_0004',
            'awaiting-banner',
          ],
          [
            'review-exception',
            '/backoffice/fin/transfer-proof-review?record=psb_anr_0007',
            'exception-card',
          ],
        ],
        failures,
      );
      expect(failures).toEqual([]);
    });

    test(`axe and reflow: every resident dues screen (${locale}, ${vp})`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(240_000);
      await page.setViewportSize(VIEWPORTS[vp]);
      await seedSociety(page, { locale });
      const failures: string[] = [];
      await scanList(page, testInfo, `c2-${locale}-${vp}`, CU, RESIDENT_SCREENS, failures);
      // The bill, a sent proof, and (after the office verifies it) the receipt.
      const home = await api<{ position: { current: { invoiceId: string } } }>(
        page,
        '/portal/dues/home',
      );
      const sent = await api<{ submission: { id: string } }>(
        page,
        '/portal/dues/submissions',
        'POST',
        {
          amount: '5200',
          transferDate: '2026-10-26',
          bankReference: 'ANR-A101-2026-11',
          file: { name: 'slip.jpg', type: 'image/jpeg', size: 120_000 },
        },
      );
      const submissionId = sent.ok ? sent.res.submission.id : '';
      await scanList(
        page,
        testInfo,
        `c2-${locale}-${vp}`,
        CU,
        [
          [
            'bill',
            `/customer/portal/invoice-detail?record=${home.ok ? home.res.position.current.invoiceId : ''}`,
            'dues-bill-detail',
          ],
          ['submission', `/customer/portal/submissions/${submissionId}`, 'dues-submission'],
        ],
        failures,
      );
      await page.goto(`${BO}/backoffice`);
      const detail = await api<{ candidates: Array<{ bankLine: { id: string } }> }>(
        page,
        `/payment-submissions/${submissionId}`,
      );
      await api(page, `/payment-submissions/${submissionId}/verify`, 'POST', {
        amount: '5200',
        bankLineId: detail.ok ? detail.res.candidates[0]!.bankLine.id : '',
      });
      await page.goto(`${CU}${HOME}`);
      const after = await api<{ receipts: Array<{ id: string }> }>(page, '/portal/dues/home');
      await scanList(
        page,
        testInfo,
        `c2-${locale}-${vp}`,
        CU,
        [
          [
            'receipt',
            `/customer/portal/receipt?record=${after.ok ? after.res.receipts[0]!.id : ''}`,
            'dues-receipt-page',
          ],
        ],
        failures,
      );
      expect(failures).toEqual([]);
    });
  }
}

test('axe: the first-run text-size step (en-PK and ur-PK, phone and desktop)', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const failures: string[] = [];
  for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
    for (const vp of ['desktop', 'phone'] as const) {
      const context = await browser.newContext({ viewport: VIEWPORTS[vp] });
      const page = await context.newPage();
      await seedSociety(page, { locale, textScale: 'first-run' });
      await page.goto(`${CU}${HOME}`);
      await expect(page.getByTestId('text-size-welcome')).toBeVisible();
      for (const v of (await scanA11y(page, testInfo, `c2-${locale}-${vp}-text-size-welcome`))
        .violations)
        failures.push(`${locale} ${vp}: ${v.id} ${v.targets.join(' | ')}`);
      await page.getByTestId('text-size-150').click();
      const overflow = await overflowOf(page);
      if (overflow > 0)
        failures.push(`${locale} ${vp}: horizontal overflow ${overflow}px at 150 %`);
      await context.close();
    }
  }
  expect(failures).toEqual([]);
});

test('320 px reflow and 200 % zoom: proof review, inbox, the resident bill and the pay page', async ({
  page,
  consoleErrors,
}) => {
  test.setTimeout(150_000);
  await seedSociety(page);
  for (const vp of ['reflow', 'zoom200'] as const) {
    await page.setViewportSize(VIEWPORTS[vp]);
    for (const [base, path, ready] of [
      [BO, '/backoffice/fin/transfer-proof-review?record=psb_anr_0005', 'match-choice'],
      [BO, INBOX, 'proof-inbox'],
      [BO, '/backoffice/col/collections-dashboard', 'collections-page'],
      [CU, HOME, 'dues-home'],
      [CU, PAY, 'proof-form'],
      [CU, '/customer/portal/statements', 'dues-statement'],
    ] as const) {
      await page.goto(`${base}${path}`);
      await expect(page.getByTestId(ready)).toBeVisible();
      expect(await overflowOf(page), `${vp} ${path}`).toBeLessThanOrEqual(0);
    }
  }
  expect(consoleErrors).toEqual([]);
});
