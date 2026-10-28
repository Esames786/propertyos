import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { BO, CU, seed, test, type Locale } from '../support/fixtures';
import { become, seedSociety, societyApi, type SocietySeed } from '../support/society';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * Gate C.2 evidence (resident payment journey, finance verification and allocation, collections
 * dashboard, text size) → docs/status/gate-c2/{screenshots,video}. Run on its own against production
 * builds: `npx playwright test --project=evidence tests/evidence/gatec2.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-c2/screenshots';
const VIDEO = 'docs/status/gate-c2/video';
const RAW = 'test-results/gatec2-video';
const SITE = '/backoffice/sites/site_alnoor';
const HOME = '/customer/portal/home';
const PAY = '/customer/portal/upload-proof-mock';
const INBOX = '/backoffice/fin/unverified-transfers-queue';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const shot = (page: Page, name: string, fullPage = true) =>
  page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
const SLIP = (name: string, type = 'image/jpeg') => ({
  name,
  mimeType: type,
  buffer: Buffer.from(`fictional demo slip ${name}`),
});
const RECORD = (size: { width: number; height: number }) => ({ recordVideo: { dir: RAW, size } });

/**
 * The mock API answers inside the page, so "loaded, then a pause" is enough. (Not `networkidle`: the
 * resident app attaches the hidden demo-link frame after load, and that state then never settles.)
 */
async function settle(page: Page, ms = 700) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function start(
  browser: Browser,
  vp: ViewportName,
  seed: SocietySeed,
  context: BrowserContextOptions = {},
) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], ...context });
  const page = await ctx.newPage();
  await seedSociety(page, seed);
  return page;
}

async function office(page: Page, path: string, ready: string, ms = 700) {
  await page.goto(`${BO}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page, ms);
}

async function portal(page: Page, path: string, ready: string, ms = 700) {
  await page.goto(`${CU}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page, ms);
}

/** The resident's proof, sent through the customer app's own server. */
async function sendProof(page: Page, amount: string, reference: string, name: string) {
  if (!page.url().startsWith(CU)) await portal(page, HOME, 'dues-home', 100);
  const sent = await societyApi<{ submission: { id: string } }>(
    page,
    '/portal/dues/submissions',
    'POST',
    {
      amount,
      transferDate: '2026-10-26',
      bankReference: reference,
      file: { name, type: 'image/jpeg', size: 182_000 },
    },
  );
  if (!sent.ok) throw new Error(`proof: ${sent.code}`);
  return sent.res.submission.id;
}

/** The accounts officer verifies a proof against its best bank transfer (office app). */
async function verify(page: Page, submissionId: string, amount: string) {
  await office(page, '/backoffice', 'kpi-collected', 100);
  const detail = await societyApi<{
    candidates: Array<{ bankLine: { id: string }; reasons: string[] }>;
  }>(page, `/payment-submissions/${submissionId}`);
  const line = detail.ok
    ? detail.res.candidates.find((c) => c.reasons.includes('amount'))
    : undefined;
  const done = await societyApi(
    page,
    `/payment-submissions/${submissionId}/verify`,
    'POST',
    line
      ? { amount, bankLineId: line.bankLine.id }
      : { amount, manualReason: 'Seen on the bank portal; statement not imported yet.' },
  );
  if (!done.ok) throw new Error(`verify: ${done.code}`);
}

async function keepVideo(page: Page, name: string) {
  const video = page.video();
  await page.context().close();
  if (!video) return;
  mkdirSync(VIDEO, { recursive: true });
  copyFileSync(await video.path(), `${VIDEO}/${name}.webm`);
}

test.describe.configure({ mode: 'parallel' });

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const l = lang(locale);
  for (const vp of ['desktop', 'tablet', 'phone'] as ViewportName[]) {
    const w = VIEWPORTS[vp].width;

    test(`1. resident bill and payment journey ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const page = await start(browser, vp, { locale, textScale: 'first-run' });
      // First run: choose a comfortable text size (Large chosen here).
      await portal(page, HOME, 'text-size-welcome');
      await shot(page, `r01-first-run-text-size-${w}-${l}`);
      await page.getByTestId('text-size-125').click();
      await settle(page, 400);
      await shot(page, `r02-first-run-large-preview-${w}-${l}`);
      await page.getByTestId('text-size-continue').click();
      await page.getByTestId('dues-home').waitFor();
      await settle(page);
      await shot(page, `r03-home-a101-owes-5200-large-${w}-${l}`);
      // The rest at the default size, so screens compare with the other gates.
      await page.evaluate(() => {
        const key = Object.keys(localStorage).find((k) =>
          k.startsWith('pref:display:v1:customer:tnt_alnoor:'),
        );
        if (key)
          localStorage.setItem(
            key,
            JSON.stringify({ version: 1, textScale: 1, chosenAt: '2026-10-26T00:00:00Z' }),
          );
      });
      await portal(page, HOME, 'dues-home');
      await shot(page, `r04-home-a101-owes-5200-${w}-${l}`);
      await page.getByTestId('dues-see-bill').click();
      await page.getByTestId('dues-bill-detail').waitFor();
      await settle(page);
      await shot(page, `r05-bill-itemised-${w}-${l}`);
      await portal(page, '/customer/portal/payments-dashboard', 'dues-bills');
      await shot(page, `r06-bills-${w}-${l}`);
      await portal(page, PAY, 'proof-form');
      await shot(page, `r07-pay-verified-account-and-proof-${w}-${l}`);
      await page.getByTestId('proof-file').setInputFiles(SLIP('kamran-ibft-5200.jpg'));
      await settle(page, 300);
      await page.getByTestId('proof-form').scrollIntoViewIfNeeded();
      await shot(page, `r08-proof-filled-${w}-${l}`, false);
      // The visible option (its radio input is visually hidden).
      await page.getByTestId('pay-method').locator('label').nth(1).click();
      await settle(page, 300);
      await shot(page, `r09-pay-office-cash-not-taken-${w}-${l}`);
      await page.getByTestId('pay-method').locator('label').nth(2).click();
      await settle(page, 300);
      await shot(page, `r10-pay-online-later-${w}-${l}`);
      await portal(page, '/customer/portal/bank-transfer-details', 'payee-card');
      await shot(page, `r11-bank-transfer-details-qr-${w}-${l}`);
      // Send the proof: pending, never Paid.
      await portal(page, PAY, 'proof-form');
      await page.getByTestId('proof-file').setInputFiles(SLIP('kamran-ibft-5200.jpg'));
      await page.getByTestId('proof-send').click();
      await page.getByTestId('dues-submission').waitFor();
      await settle(page);
      await shot(page, `r12-proof-sent-pending-verification-${w}-${l}`);
      await portal(page, HOME, 'dues-home');
      await shot(page, `r13-home-pending-not-paid-${w}-${l}`);
      // The office verifies it; the receipt and statement come back.
      const pending = await societyApi<{ submissions: Array<{ id: string }> }>(
        page,
        '/portal/dues/home',
      );
      await verify(page, pending.ok ? pending.res.submissions[0]!.id : '', '5200');
      await portal(page, HOME, 'dues-home');
      await shot(page, `r14-home-paid-receipt-${w}-${l}`);
      await page.getByTestId('dues-receipt').first().click();
      await page.getByTestId('dues-receipt-page').waitFor();
      await settle(page);
      await shot(page, `r15-receipt-${w}-${l}`);
      await portal(page, '/customer/portal/statements', 'dues-statement');
      await shot(page, `r16-statement-zero-${w}-${l}`);
      await portal(page, '/customer/portal/payment-history', 'dues-history');
      await shot(page, `r17-payment-history-${w}-${l}`);
      await portal(
        page,
        '/customer/portal/accessibility-preferences#text-size',
        'text-size-settings',
      );
      await page.getByTestId('text-size-200').click();
      await settle(page, 500);
      await shot(page, `r18-settings-text-size-200-${w}-${l}`);
      await portal(page, HOME, 'dues-home');
      await shot(page, `r19-home-at-200-${w}-${l}`);
      await page.context().close();
    });

    test(`2. finance verification and allocation ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const page = await start(browser, vp, { locale });
      await office(page, '/backoffice', 'kpi-collected', 1200);
      await shot(page, `f01-accounts-officer-home-${w}-${l}`);
      await office(page, INBOX, 'proof-inbox');
      await shot(page, `f02-proof-inbox-6-to-review-${w}-${l}`);
      for (const [n, flat, name] of [
        ['f03', 'A-305', 'clean-match-arrears-and-november'],
        ['f04', 'A-204', 'resent-slip-transfer-already-matched'],
        ['f05', 'B-405', 'shared-reference-different-transfer'],
        ['f06', 'A-102', 'blurred-photo'],
        ['f07', 'B-207', 'paid-to-another-account'],
      ] as const) {
        await office(page, INBOX, 'proof-inbox', 200);
        await page.locator(`[data-testid="proof-row"][data-flat="${flat}"]`).click();
        await page.getByTestId('proof-review').waitFor();
        await settle(page, 900);
        await shot(page, `${n}-review-${flat.toLowerCase()}-${name}-${w}-${l}`);
      }
      // Verify A-305: the payer's own lines, oldest first; receipt issued.
      await office(page, INBOX, 'proof-inbox', 200);
      await page.locator('[data-testid="proof-row"][data-flat="A-305"]').click();
      await page.getByTestId('review-verify').click();
      await page.getByTestId('verified-banner').waitFor();
      await settle(page);
      await shot(page, `f08-verified-receipt-issued-${w}-${l}`);
      // Ask A-102 for information (dialog).
      await office(page, INBOX, 'proof-inbox', 200);
      await page.locator('[data-testid="proof-row"][data-flat="A-102"]').click();
      await page.getByTestId('review-request-info').click();
      await page.getByTestId('info-dialog').waitFor();
      await settle(page, 400);
      await shot(page, `f09-needs-information-dialog-${w}-${l}`, false);
      await page.keyboard.press('Escape');
      // Manual verification of 6,000 (no bank line yet): reason required, 800 credit.
      const id = await sendProof(page, '6000', 'A101 ALL DUES', 'kamran-6000.jpg');
      await office(page, `/backoffice/fin/transfer-proof-review?record=${id}`, 'match-choice');
      await page.getByTestId('match-manual').click();
      await page
        .getByTestId('manual-reason')
        .fill('Seen on the bank portal; today’s statement is not imported yet.');
      await settle(page, 900);
      await shot(page, `f10-manual-verification-6000-leaves-800-credit-${w}-${l}`);
      await page.getByTestId('review-verify').click();
      await page.getByTestId('verified-banner').waitFor();
      const paid = await societyApi<{ items: Array<{ id: string }> }>(
        page,
        '/payments',
        'GET',
        {},
        { account: 'ba_anr_a101' },
      );
      await office(
        page,
        `/backoffice/fin/payment-workspace?record=${paid.ok ? paid.res.items[0]!.id : ''}`,
        'payment-workspace',
      );
      await shot(page, `f11-payment-360-receipt-allocation-${w}-${l}`);
      for (const [n, name, path, ready] of [
        ['f12', 'payments', '/backoffice/fin/payment-list', 'payments-list'],
        [
          'f13',
          'credits-unapplied',
          '/backoffice/fin/customer-credit-overpayments',
          'credits-page',
        ],
        ['f14', 'aging-arrears', '/backoffice/col/aging-breakdown', 'aging-page'],
        [
          'f15',
          'account-statement-a101',
          '/backoffice/col/customer-statement?account=ba_anr_a101',
          'account-statement',
        ],
        ['f16', 'bank-feed', '/backoffice/bank/bank-transaction-feed', 'bank-feed'],
        ['f17', 'reconciliation', '/backoffice/bank/reconciliation-workspace', 'reconciliation'],
        [
          'f18',
          'office-cash-not-allowed',
          '/backoffice/fin/payment-list?drawer=office&account=ba_anr_a102',
          'office-drawer',
        ],
      ] as const) {
        await office(page, path, ready);
        await shot(page, `${n}-${name}-${w}-${l}`, ready !== 'office-drawer');
      }
      await page.context().close();
    });

    test(`3. collections dashboard and controls ${l} ${w}`, async ({ browser }) => {
      test.setTimeout(240_000);
      mkdirSync(DIR, { recursive: true });
      const page = await start(browser, vp, { locale, staff: 'alnoor_manager' });
      await office(page, '/backoffice', 'kpi-collected', 1200);
      await shot(page, `m01-manager-dashboard-collections-${w}-${l}`);
      await office(page, '/backoffice/col/collections-dashboard', 'collections-page', 1000);
      await shot(page, `m02-collections-dashboard-${w}-${l}`);
      await page.getByTestId('kpi-arrears').click();
      await page.getByTestId('accounts-list').waitFor();
      await settle(page);
      await shot(page, `m03-arrears-opens-filtered-accounts-${w}-${l}`);
      await office(page, '/backoffice/col/collections-dashboard', 'collections-page', 300);
      await page.locator('[data-testid="collections-building"]').first().click();
      await page.getByTestId('accounts-list').waitFor();
      await settle(page);
      await shot(page, `m04-building-opens-its-owing-accounts-${w}-${l}`);
      await office(
        page,
        '/backoffice/fin/transfer-proof-review?record=psb_anr_0004',
        'proof-review',
        900,
      );
      await shot(page, `m05-manager-reads-proof-cannot-decide-${w}-${l}`);
      // Collection account: proposed by the manager, approved by the treasurer, cooling-off.
      await office(page, `${SITE}?tab=collection-settings`, 'payee-card');
      await shot(page, `m06-collection-account-verified-${w}-${l}`);
      await page.getByTestId('propose-account').click();
      await page.getByTestId('propose-branch').fill('DHA Phase 5, Lahore');
      await page.getByTestId('propose-title').fill('Al-Noor Residency Owners’ Association (Demo)');
      await page.getByTestId('propose-iban').fill('PK90DEMO0000005550001111');
      await page
        .getByTestId('propose-reason')
        .fill('Moving to the branch next to the society office.');
      await page.getByTestId('propose-checked').click();
      await page.getByTestId('propose-submit').click();
      await page.getByTestId('beneficiary-change').waitFor();
      await settle(page);
      await shot(page, `m07-new-account-waiting-second-person-${w}-${l}`);
      await become(page, 'backoffice', 'alnoor_treasurer');
      await office(page, `${SITE}?tab=collection-settings`, 'beneficiary-approve');
      await page.getByTestId('beneficiary-approve').click();
      await page.locator('[data-testid="beneficiary-change"][data-state="cooling_off"]').waitFor();
      await settle(page);
      await shot(page, `m08-treasurer-approved-cooling-off-${w}-${l}`);
      await office(page, `${SITE}?tab=payment-methods`, 'payment-methods');
      await shot(page, `m09-payment-methods-${w}-${l}`);
      await office(page, `${SITE}?tab=billing-controls`, 'billing-controls');
      await shot(page, `m10-numbering-and-posting-policy-${w}-${l}`);
      await become(page, 'backoffice', 'alnoor_manager');
      await office(
        page,
        `${SITE}/units/unt_anr_b204?tab=payer&drawer=change-payer`,
        'change-payer-drawer',
      );
      await shot(page, `m11-payer-change-request-${w}-${l}`, false);
      await page.locator('[data-testid^="change-payer-party-"]').first().click();
      await page.getByTestId('change-payer-reason').fill('New tenancy agreement from 1 November.');
      await page.getByTestId('change-payer-save').click();
      await page.getByTestId('change-payer-drawer').waitFor({ state: 'hidden' });
      await office(page, '/backoffice/billing/payer-changes', 'payer-changes');
      await shot(page, `m12-payer-changes-waiting-approval-${w}-${l}`);
      await office(page, `${SITE}/units/unt_anr_b204?tab=payer`, 'liability-changes');
      await shot(page, `m13-flat-b204-liability-changes-${w}-${l}`);
      await page.context().close();
    });
  }

  test(`4. other organisations and empty states ${l}`, async ({ browser }) => {
    test.setTimeout(120_000);
    mkdirSync(DIR, { recursive: true });
    for (const vp of ['desktop', 'phone'] as ViewportName[]) {
      const w = VIEWPORTS[vp].width;
      const page = await (await browser.newContext({ viewport: VIEWPORTS[vp] })).newPage();
      await seed(page, { persona: 'society_admin', locale });
      await office(page, '/backoffice/sites', 'sites-empty');
      await shot(page, `o01-shalimar-no-sites-next-step-${w}-${l}`);
      await become(page, 'backoffice', 'alnoor_guard');
      await office(page, INBOX, 'access-outcome');
      await shot(page, `o02-guard-no-collections-${w}-${l}`);
      await page.context().close();
    }
  });
}

test('video: resident pays A-101 on a phone, office verifies, receipt comes back (phone, English)', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const page = await start(browser, 'phone', { textScale: 'first-run' }, RECORD(VIEWPORTS.phone));
  const pause = (ms = 1000) => page.waitForTimeout(ms);
  await portal(page, HOME, 'text-size-welcome', 1200);
  await page.getByTestId('text-size-125').click();
  await pause(1500);
  await page.getByTestId('text-size-continue').click();
  await page.getByTestId('dues-home').waitFor();
  await pause(2000);
  await page.getByTestId('dues-total').scrollIntoViewIfNeeded();
  await pause(1200);
  await page.getByTestId('dues-pay').click();
  await page.getByTestId('dues-pay-page').waitFor();
  await pause(1500);
  await page.getByTestId('payee-iban').scrollIntoViewIfNeeded();
  await pause(1500);
  await page.getByTestId('payee-qr').scrollIntoViewIfNeeded();
  await pause(1200);
  await page.getByTestId('proof-file').setInputFiles(SLIP('kamran-ibft-5200.jpg'));
  await page.getByTestId('proof-send').scrollIntoViewIfNeeded();
  await pause(1200);
  await page.getByTestId('proof-send').click();
  await page.getByTestId('dues-submission').waitFor();
  await pause(2500);
  await portal(page, HOME, 'dues-home', 1800);
  // The accounts officer verifies (shown in the next video); the receipt comes back.
  const home = await societyApi<{ submissions: Array<{ id: string }> }>(page, '/portal/dues/home');
  await verify(page, home.ok ? home.res.submissions[0]!.id : '', '5200');
  await portal(page, HOME, 'dues-home', 2000);
  await page.getByTestId('dues-receipt').first().click();
  await page.getByTestId('dues-receipt-page').waitFor();
  await pause(2000);
  await page
    .getByTestId('portal-bottom-nav')
    .locator('a[href="/customer/portal/statements"]')
    .click();
  await page.getByTestId('dues-statement').waitFor();
  await pause(2500);
  await keepVideo(page, 'resident-pay-journey-phone-en');
});

test('video: the accounts officer verifies, refuses a re-sent slip and asks for information (desktop, English)', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const page = await start(browser, 'desktop', {}, RECORD(VIEWPORTS.desktop));
  const pause = (ms = 1000) => page.waitForTimeout(ms);
  const id = await sendProof(page, '5200', 'ANR-A101-2026-11', 'kamran-ibft-5200.jpg');
  await office(page, '/backoffice', 'kpi-collected', 1800);
  await page.getByTestId('queue-start').click();
  await page.getByTestId('proof-review').waitFor();
  await pause(1500);
  await office(page, `/backoffice/fin/transfer-proof-review?record=${id}`, 'match-choice', 2200);
  await page.getByTestId('review-verify').click();
  await page.getByTestId('verified-banner').waitFor();
  await pause(2500);
  await office(page, INBOX, 'proof-inbox', 1200);
  await page.locator('[data-testid="proof-row"][data-flat="A-204"]').click();
  await page.getByTestId('match-choice').waitFor();
  await pause(2000);
  await page.locator('[data-testid="match-candidate"][data-txn="DEMO-TXN-26102207"]').click();
  await pause(800);
  await page.getByTestId('review-verify').click();
  await page.getByTestId('already-matched-help').waitFor();
  await pause(2200);
  await page.getByTestId('review-reject').click();
  await page
    .getByRole('alertdialog')
    .getByRole('textbox')
    .fill('This transfer was already verified on 24 October; its receipt was issued then.');
  await pause(1200);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reject proof' }).click();
  await page.getByTestId('proof-inbox').waitFor();
  await pause(1500);
  await page.locator('[data-testid="proof-row"][data-flat="B-405"]').click();
  await page.getByTestId('candidate-shared-ref').first().waitFor();
  await pause(2200);
  await page.getByTestId('review-verify').click();
  await page.getByTestId('verified-banner').waitFor();
  await pause(1800);
  await office(page, INBOX, 'proof-inbox', 800);
  await page.locator('[data-testid="proof-row"][data-flat="A-102"]').click();
  await page.getByTestId('review-request-info').click();
  await page.getByTestId('info-dialog').waitFor();
  await pause(1800);
  await page.getByTestId('info-dialog-confirm').click();
  await page.getByTestId('proof-inbox').waitFor();
  await pause(1200);
  await office(page, '/backoffice/bank/reconciliation-workspace', 'reconciliation', 2500);
  await keepVideo(page, 'officer-verification-desktop-en');
});

test('video: the building manager’s collections dashboard, every number opens its records (desktop, English)', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const page = await start(
    browser,
    'desktop',
    { staff: 'alnoor_manager' },
    RECORD(VIEWPORTS.desktop),
  );
  const pause = (ms = 1000) => page.waitForTimeout(ms);
  await office(page, '/backoffice', 'kpi-collected', 2500);
  for (const kpi of ['kpi-collected', 'kpi-pending', 'kpi-arrears']) {
    await office(page, '/backoffice', 'kpi-collected', 800);
    await page.getByTestId(kpi).click();
    await settle(page, 2000);
  }
  await office(page, '/backoffice/col/collections-dashboard', 'collections-page', 2000);
  await page.locator('[data-testid="aging-bucket"]').last().click();
  await page.getByTestId('aging-page').waitFor();
  await pause(2200);
  await office(page, '/backoffice/col/collections-dashboard', 'collections-page', 800);
  await page.locator('[data-testid="collections-building"]').first().click();
  await page.getByTestId('accounts-list').waitFor();
  await pause(2200);
  await keepVideo(page, 'manager-collections-dashboard-desktop-en');
});

test('video: text size, first run to 200 % and back, in Urdu on a phone', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await start(
    browser,
    'phone',
    { locale: 'ur-PK', textScale: 'first-run' },
    RECORD(VIEWPORTS.phone),
  );
  const pause = (ms = 1000) => page.waitForTimeout(ms);
  await portal(page, HOME, 'text-size-welcome', 1500);
  for (const p of [112, 125, 150]) {
    await page.getByTestId(`text-size-${p}`).click();
    await pause(1100);
  }
  await page.getByTestId('text-size-125').click();
  await pause(1000);
  await page.getByTestId('text-size-continue').click();
  await page.getByTestId('dues-home').waitFor();
  await pause(2000);
  await portal(
    page,
    '/customer/portal/accessibility-preferences#text-size',
    'text-size-settings',
    1200,
  );
  for (const p of [150, 175, 200]) {
    await page.getByTestId(`text-size-${p}`).click();
    await pause(1100);
  }
  await page.reload();
  await page.getByTestId('text-size-settings').waitFor();
  await pause(1500);
  await portal(page, HOME, 'dues-home', 1500);
  await page.evaluate(() =>
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }),
  );
  await pause(2000);
  await portal(page, PAY, 'proof-form', 1200);
  await page.getByTestId('proof-send').scrollIntoViewIfNeeded();
  await pause(2000);
  await portal(
    page,
    '/customer/portal/accessibility-preferences#text-size',
    'text-size-settings',
    1000,
  );
  await page.getByTestId('text-size-reset').click();
  await pause(2000);
  await keepVideo(page, 'text-size-onboarding-settings-phone-ur');
});
