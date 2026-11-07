import { mkdirSync } from 'node:fs';
import type { Browser, Locator, Page } from '@playwright/test';
import { BO, CU, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { keyboardFocus } from '../support/focus';
import { become as becomeSociety, seedSociety, societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Integration S.3 + UX B1 + Issue #21 + UX B2 evidence → docs/status/integration-s3-b1-b2/screenshots.
 * The accepted folders of the four branches are not touched. Keyboard focus as B2 draws it, on the merged code:
 * - i01–i03: the Rentals KPI tiles with keyboard focus (English, Urdu right to left), in dark mode with high
 *   contrast, and at 320 px with 200 % text (Riverbend, fictional);
 * - i04: a Rentals confirm dialog (issuing an owner statement) at 320 px with 200 % text, the confirm button focused;
 * - i05: B1's reversed receipt (A-101's office cash of Rs 6,000, reversed after an approval) with the
 *   receipt's own button focused;
 * - i06: Issue #21's credit-note drawer on A-101's November bill with its save button focused.
 * English and Urdu; each name ends with the viewport width and the language. The business date is Monday
 * 26 October 2026. Run against production builds:
 * `E2E_PORT_OFFSET=1400 npx playwright test --project=evidence tests/evidence/ints3b.evidence.spec.ts`.
 */
const DIR = 'docs/status/integration-s3-b1-b2/screenshots';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const PHONE = { width: 320, height: 700 };
const RB_STAFF = ['usr_rb_0001', 'usr_rb_0002', 'usr_rb_0003', 'usr_rb_0004'];
const SABA: PersonaId = 'alnoor_accounts';
const AYESHA: PersonaId = 'alnoor_treasurer';
const KAMRAN: PersonaId = 'alnoor_resident_a101';
const REASON = 'Recorded against the wrong flat by mistake';

async function settle(page: Page, ms = 500) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function shot(page: Page, name: string) {
  const vw = page.viewportSize()!.width;
  await page.screenshot({ path: `${DIR}/${name}.png`, animations: 'disabled', caret: 'hide' });
  // The name says the viewport: the picture is exactly that wide.
  const m = /-(\d+)-(?:en|ur)$/.exec(name);
  if (m) expect(Number(m[1]), name).toBe(vw);
}

/** Keyboard focus on a control, in view, with its ring really drawn (solid, at least 2 px). */
async function focusRing(page: Page, loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  await keyboardFocus(page, loc);
  await loc.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const ring = await loc.evaluate((el) => ({ focused: document.activeElement === el, style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }));
  expect(ring.focused).toBe(true);
  expect(ring.style).toBe('solid');
  expect(ring.width).toBeGreaterThanOrEqual(2);
  await settle(page, 300);
}

// ---------------------------------------------------------------------------------------------
// Rentals (Riverbend)
// ---------------------------------------------------------------------------------------------

const onboarding = (persona: string, app: string) =>
  JSON.stringify({ profile: { tenantId: 'tnt_riverbend', personaId: persona, app, welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

async function becomeRb(page: Page, persona: PersonaId) {
  if (!page.url().startsWith(BO)) await page.goto(`${BO}/backoffice/global/my-access`);
  await page.evaluate(({ persona, value }) => {
    localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
    localStorage.setItem(`onboarding:v1:tnt_riverbend:${persona}:backoffice`, value);
  }, { persona, value: onboarding(persona, 'backoffice') });
}

async function rentals(browser: Browser, viewport: { width: number; height: number }, locale: Locale, scale?: number) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await seed(page, { persona: 'rb_manager', locale });
  if (scale) for (const p of RB_STAFF) await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: `pref:display:v1:backoffice:tnt_riverbend:${p}`, scale });
  return page;
}

async function leases(page: Page) {
  await becomeRb(page, 'rb_manager');
  await page.goto(`${BO}/backoffice/rentals`);
  await page.getByTestId('rent-lease-list').waitFor();
  await settle(page);
}

test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const l = lang(locale);
  test(`Rentals tiles with keyboard focus (${l}): 1440, dark with high contrast at 390, 320 px at 200 %; a Rentals confirm dialog at 320 px at 200 %`, async ({ browser }) => {
    test.setTimeout(240_000);
    let page = await rentals(browser, VIEWPORTS.desktop, locale);
    await leases(page);
    await focusRing(page, page.getByTestId('rent-kpi-rent'));
    await shot(page, `i01-rent-tiles-focus-1440-${l}`);
    await page.context().close();

    page = await rentals(browser, VIEWPORTS.phone, locale);
    await becomeRb(page, 'rb_manager');
    await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
    await page.getByTestId('hub-theme-dark').click();
    await page.getByTestId('hub-contrast-high').click();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-contrast'))).toBe('high');
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
    await leases(page);
    await focusRing(page, page.getByTestId('rent-kpi-payable'));
    await shot(page, `i02-rent-tiles-focus-dark-contrast-390-${l}`);
    await page.context().close();

    page = await rentals(browser, PHONE, locale, 2);
    await leases(page);
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-text-scale'))).toBe('200');
    await focusRing(page, page.getByTestId('rent-kpi-due'));
    await shot(page, `i03-rent-tiles-focus-200pct-320-${l}`);
    // RNT-005: Usman issues October's statement for Tahira; the confirm dialog with its confirm button focused.
    await becomeRb(page, 'rb_accounts');
    await page.goto(`${BO}/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10`);
    await page.getByTestId('statement-issue').waitFor();
    await settle(page);
    await page.getByTestId('statement-issue').click();
    const dialog = page.getByRole('alertdialog');
    await dialog.waitFor();
    await focusRing(page, dialog.getByRole('button').last());
    await shot(page, `i04-rent-confirm-dialog-focus-200pct-320-${l}`);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.context().close();
  });
}

// ---------------------------------------------------------------------------------------------
// Al-Noor: B1's reversed receipt and Issue #21's credit-note drawer, with B2's ring
// ---------------------------------------------------------------------------------------------

async function ok<T>(p: Promise<{ ok: true; res: T } | { ok: false; code: string; status: number }>): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(`API refused: ${r.status} ${r.code}`);
  return r.res;
}

async function office(page: Page, persona: PersonaId, path: string, ready: string) {
  await becomeSociety(page, 'backoffice', persona);
  await page.goto(`${BO}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page);
}

async function portal(page: Page, path: string, ready: string) {
  await becomeSociety(page, 'customer', KAMRAN);
  await page.goto(`${CU}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page);
}

async function society(browser: Browser, viewport: { width: number; height: number }, locale: Locale, staff: PersonaId = SABA) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
  await seedSociety(page, { staff, locale });
  return page;
}

/** B1's shared scenario (as tests/evidence/uxb1.evidence.spec.ts): Rs 6,000 office cash on A-101, then reversed after an approval. */
async function reversedCash(page: Page) {
  await office(page, AYESHA, '/backoffice/fin/payment-list', 'payments-page');
  await ok(societyApi(page, '/sites/site_alnoor/payment-methods', 'PATCH', { method: 'office_cash', enabled: true }));
  await office(page, SABA, '/backoffice/fin/payment-list', 'payments-page');
  const flat = await ok(societyApi<{ currentPayer: { partyId: string } }>(page, '/sites/site_alnoor/units/unt_anr_a101'));
  const recorded = await ok(societyApi<{ batch: { id: string } }>(page, '/payments/office', 'POST', { accountId: 'ba_anr_a101', payerPartyId: flat.currentPayer.partyId, amount: '6000', idempotencyKey: 'ev-int-6000' }));
  await office(page, AYESHA, '/backoffice/fin/payment-list', 'payments-page');
  const confirmed = await ok(societyApi<{ batch: { lines: Array<{ outcome?: { paymentId: string } }> } }>(page, `/office-collections/${recorded.batch.id}/confirm`, 'POST', { countedCash: '6000' }));
  const paymentId = confirmed.batch.lines[0]!.outcome!.paymentId;
  const d = await ok(societyApi<{ receipt: { id: string } }>(page, `/payments/${paymentId}`));
  await office(page, SABA, '/backoffice/fin/payment-list', 'payments-page');
  const asked = await ok(societyApi<{ approvalId: string }>(page, `/payments/${paymentId}/reversal-request`, 'POST', { reason: REASON }));
  await office(page, AYESHA, `/backoffice/apr/approval-360-view?record=${asked.approvalId}`, 'approval-workspace');
  await ok(societyApi(page, `/approvals/${asked.approvalId}/decide`, 'POST', { decision: 'approve', reason: 'Checked against the cash book.' }));
  return d.receipt.id;
}

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const l = lang(locale);
  test(`B1 reversed receipt and Issue #21 credit-note drawer with B2's keyboard ring (${l}): 390 and 1440`, async ({ browser }) => {
    test.setTimeout(240_000);
    let page = await society(browser, VIEWPORTS.desktop, locale);
    const receiptId = await reversedCash(page);
    await page.setViewportSize(VIEWPORTS.phone);
    await portal(page, `/customer/portal/receipt?record=${receiptId}`, 'receipt-reversed');
    await expect(page.getByTestId('receipt-status')).toHaveAttribute('data-status', 'reversed');
    await focusRing(page, page.getByTestId('dues-receipt-page').locator('footer').getByRole('button'));
    await shot(page, `i05-b1-reversed-receipt-focus-390-${l}`);
    await page.context().close();

    // Issue #21: Ayesha's credit-note drawer on A-101's November bill, the save button focused (nothing sent).
    page = await society(browser, VIEWPORTS.desktop, locale, AYESHA);
    await portal(page, '/customer/portal/home', 'dues-bill');
    const home = await ok(societyApi<{ position: { current: { invoiceId: string } } }>(page, '/portal/dues/home'));
    await office(page, AYESHA, `/backoffice/fin/invoice-workspace?record=${home.position.current.invoiceId}`, 'invoice-workspace');
    await page.getByTestId('invoice-credit-note').click();
    const drawer = page.getByTestId('credit-note-drawer');
    await drawer.waitFor();
    await drawer.locator('input[data-testid="credit-amount-maintenance"]').fill('600');
    await drawer.locator('textarea[data-testid="credit-reason"]').fill('Lift out of service for two weeks');
    await focusRing(page, page.getByTestId('credit-note-save'));
    await shot(page, `i06-cn-drawer-focus-1440-${l}`);
    await page.context().close();
  });
}
