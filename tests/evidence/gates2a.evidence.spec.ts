import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, Locator, Page } from '@playwright/test';
import { BO, CU, test, type Locale, type PersonaId } from '../support/fixtures';
import { become, seedSociety, societyApi, type SocietySeed } from '../support/society';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * Gate S.2a evidence (society staff: HR overview, employees, new employee, Employee 360, the duty
 * roster and On duty now, attendance, leave and corrections, documents, advances and settlement, and
 * the residents' "Staff on duty"; the three reference flows; phones in both languages, 320 px with
 * 200 % text; dark mode with high contrast) → docs/status/gate-s2a/{screenshots,video}. The business
 * date is Monday 26 October 2026; each capture fixes the time of day it shows. Run against production
 * builds: `E2E_PORT_OFFSET=400 npx playwright test --project=evidence tests/evidence/gates2a.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-s2a/screenshots';
const VIDEO = 'docs/status/gate-s2a/video';
const RAW = 'test-results-s2a/gates2a-video';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const OFFICE_DISPLAY = 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0001';

async function settle(page: Page, ms = 500) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function open(page: Page, origin: string, path: string, ready: string) {
  await page.goto(`${origin}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page);
}

async function as(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await open(page, BO, path, ready);
}

async function resident(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'customer', persona);
  await open(page, CU, path, ready);
}

async function context(browser: Browser, viewport: { width: number; height: number }, society: SocietySeed, time: string, video = false) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', ...(video ? { recordVideo: { dir: RAW, size: viewport } } : {}) });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(`2026-10-26T${time}:00+05:00`));
  await seedSociety(page, society);
  return page;
}

const at = (page: Page, time: string) => page.clock.setFixedTime(new Date(`2026-10-26T${time}:00+05:00`));
/** A full-page image would draw the phone's floating bottom bar over the middle of the page: hidden there. */
const BAR_HIDDEN = '[data-testid="bottom-nav"], [data-testid="portal-bottom-nav"] { visibility: hidden !important; }';
const shot = (page: Page, name: string, full = true) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full, ...(full ? { style: BAR_HIDDEN } : {}) });
/** The fixed header and bottom bar would be drawn over a tall element's capture. */
const CHROME_HIDDEN = '[data-testid="app-header"], [data-testid="bottom-nav"], [data-testid="portal-header"], [data-testid="portal-bottom-nav"] { visibility: hidden !important; }';
const shotOf = (locator: Locator, name: string) => locator.screenshot({ path: `${DIR}/${name}.png`, style: CHROME_HIDDEN });

/** Scrolls the content into view below the sticky header (the page's own scroll padding applies). */
async function toContent(page: Page, testId: string) {
  await page.getByTestId(testId).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await settle(page, 300);
}

async function keepVideo(page: Page, name: string) {
  const video = page.video();
  await page.context().close();
  if (!video) return;
  mkdirSync(VIDEO, { recursive: true });
  copyFileSync(await video.path(), `${VIDEO}/${name}.webm`);
}

async function choose(page: Page, scope: Page | Locator, testId: string, name: RegExp | string) {
  await scope.getByTestId(testId).getByRole('button').first().click();
  await page.getByRole('option', { name }).first().click();
}

async function pick(page: Page, scope: Page | Locator, testId: string, typed: string, option: RegExp | string) {
  await scope.getByTestId(testId).locator('input').fill(typed);
  await page.getByRole('option', { name: option }).first().click();
}

const cell = (page: Page, date: string, shift: string) => page.locator(`[data-testid="hr-roster-cell"][data-date="${date}"][data-shift="${shift}"][data-department="security"]`);
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fictional demo file') });

test.describe.configure({ mode: 'parallel' });

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const vp: ViewportName = locale === 'ur-PK' ? 'phone' : 'desktop';
  const w = VIEWPORTS[vp].width;
  const l = lang(locale);

  test(`office HR screens (${w}, ${l})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await context(browser, VIEWPORTS[vp], { locale, staff: 'alnoor_manager' }, '15:20');
    for (const [name, path, ready] of [
      ['a01-hr-overview', '/backoffice/hr/hr-dashboard', 'hr-dashboard'],
      ['a02-employees', '/backoffice/hr/employees-list', 'hr-employee-rows'],
      ['a03-new-employee', '/backoffice/hr/new-employee', 'hr-employee-form'],
      ['a04-employee-360-overview', '/backoffice/hr/employee-360-workspace/emp_anr_001', 'hr-360-today'],
      ['a05-employee-360-duty', '/backoffice/hr/employee-360-workspace/emp_anr_002?tab=duty', 'hr-360-upcoming'],
      ['a06-employee-360-documents', '/backoffice/hr/employee-360-workspace/emp_anr_004?tab=documents', 'hr-360-documents'],
      ['a07-roster-week', '/backoffice/hr/roster', 'hr-roster-week'],
      ['a08-on-duty-now', '/backoffice/hr/roster?tab=now', 'hr-board-current'],
      ['a09-shift-times', '/backoffice/hr/roster?tab=shifts', 'hr-shift-templates'],
      ['a10-attendance', '/backoffice/hr/attendance', 'hr-attendance-rows'],
      ['a11-leave', '/backoffice/hr/leave-attendance-adjustments', 'hr-leave-rows'],
      ['a12-corrections', '/backoffice/hr/leave-attendance-adjustments?tab=corrections', 'hr-correction-rows'],
      ['a13-documents', '/backoffice/hr/employee-documents', 'hr-document-rows'],
      ['a14-advances', '/backoffice/hr/employee-advances', 'hr-advance-rows'],
      ['a15-settlement', '/backoffice/hr/employee-advance-settlement', 'hr-settlement-list'],
    ] as const) {
      await as(page, 'alnoor_manager', path, ready);
      await shot(page, `${name}-${w}-${l}`);
    }
    await page.goto(`${BO}/backoffice/hr/roster`);
    await page.getByTestId('hr-roster-week').waitFor();
    // A phone shows one day at a time: choose Friday (the fifth day of the week) first.
    if (vp === 'phone') await page.getByTestId('hr-roster-day').locator('label').nth(4).click();
    await cell(page, '2026-10-30', 'night').locator('[data-testid="hr-roster-duty"][data-name="Karim Bakhsh"]').click();
    await page.getByTestId('hr-duty-drawer').waitFor();
    await settle(page, 300);
    await shot(page, `a16-duty-drawer-leave-warning-${w}-${l}`, false);
    await page.context().close();
  });

  test(`residents: staff on duty (${w}, ${l})`, async ({ browser }) => {
    const page = await context(browser, VIEWPORTS[vp], { locale }, '15:30');
    await resident(page, 'alnoor_resident_a101', '/customer/portal/community?tab=staff', 'community-staff');
    await shot(page, `f01-resident-staff-on-duty-${w}-${l}`);
    await page.context().close();
  });
}

test('reference flow 1: a new guard to active duty (1440, en)', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_manager' }, '21:30');
  await as(page, 'alnoor_manager', '/backoffice/hr/new-employee', 'hr-employee-form');
  await page.getByTestId('hr-employee-save').click();
  await settle(page, 300);
  await shot(page, 'b01-new-employee-validation-1440-en');
  await page.getByTestId('hr-field-name').fill('Hamza Raza');
  await page.getByTestId('hr-field-cnic').fill('35202-5521349-3');
  await page.getByTestId('hr-field-phone').fill('0300 0000299');
  await page.getByTestId('hr-field-address').fill('House 5, Street 9, Township, Lahore (Demo)');
  await pick(page, page, 'hr-field-role', 'guard', /^Security guard/);
  await choose(page, page, 'hr-field-type', 'Contract');
  await page.getByTestId('hr-employee-save').click();
  await page.getByTestId('hr-duplicate').waitFor();
  await settle(page, 300);
  await shot(page, 'b02-new-employee-duplicate-cnic-1440-en');
  await page.getByTestId('hr-field-cnic').fill('35202-1122334-5');
  await page.getByTestId('hr-employee-save').click();
  await page.getByTestId('hr-employee-360').waitFor();
  await settle(page);
  await shot(page, 'b03-employee-360-saved-1440-en');
  await page.getByTestId('hr-360-assign').click();
  const drawer = page.getByTestId('hr-assign-drawer');
  await choose(page, drawer, 'hr-assign-shift', /^Night/);
  await choose(page, drawer, 'hr-assign-post', 'Patrol');
  await settle(page, 300);
  await shot(page, 'b04-assign-night-shift-1440-en', false);
  await drawer.getByTestId('hr-assign-save').click();
  await drawer.waitFor({ state: 'detached' });
  await open(page, BO, '/backoffice/hr/roster', 'hr-roster-week');
  await shotOf(cell(page, '2026-10-26', 'night'), 'b05-roster-night-cell-1440-en');
  await at(page, '23:04');
  await as(page, 'alnoor_guard', '/backoffice/hr/roster?tab=now', 'hr-on-duty');
  await page.locator('[data-testid="hr-board-person"][data-name="Hamza Raza"]').getByTestId('hr-board-check-in').click();
  await page.locator('[data-testid="hr-board-person"][data-name="Hamza Raza"][data-state="present"]').waitFor();
  await settle(page, 300);
  await shot(page, 'b06-on-duty-checked-in-1440-en');
  await as(page, 'alnoor_manager', '/backoffice/hr/employees-list', 'hr-employee-rows');
  await page.getByTestId('hr-employee-row').filter({ hasText: 'Hamza Raza' }).click();
  await page.getByTestId('hr-360-today').waitFor();
  await settle(page);
  await shot(page, 'b07-employee-360-on-duty-1440-en');
  await page.context().close();
});

test('reference flow 2: the guards\' week and a replacement (1440, en)', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_manager' }, '15:20');
  await as(page, 'alnoor_manager', '/backoffice/hr/roster', 'hr-roster-week');
  await shotOf(page.getByTestId('hr-roster-warnings'), 'c01-roster-warnings-1440-en');
  await cell(page, '2026-10-31', 'morning').getByRole('button', { name: /Add someone/ }).click();
  const drawer = page.getByTestId('hr-assign-drawer');
  await pick(page, drawer, 'hr-assign-person', 'Karim', /Karim Bakhsh/);
  await drawer.getByTestId('hr-assign-save').click();
  await drawer.getByTestId('hr-assign-leave-warning').waitFor();
  await settle(page, 300);
  await shot(page, 'c02-pending-leave-asked-first-1440-en', false);
  await page.keyboard.press('Escape');
  await cell(page, '2026-10-27', 'morning').locator('[data-testid="hr-roster-duty"][data-name="Asif Mehmood"]').click();
  await choose(page, page.getByTestId('hr-duty-drawer'), 'hr-swap-with', /Nadeem Abbas · 27 Oct 2026 · Evening/);
  await settle(page, 300);
  await shot(page, 'c03-swap-duties-1440-en', false);
  await page.getByTestId('hr-swap-save').click();
  await page.getByTestId('hr-duty-drawer').waitFor({ state: 'detached' });
  await page.getByTestId('hr-roster-publish').click();
  await page.getByRole('alertdialog').waitFor();
  await settle(page, 300);
  await shot(page, 'c04-publish-changes-1440-en', false);
  await page.getByRole('alertdialog').getByRole('button', { name: /Publish changes/ }).click();
  await as(page, 'alnoor_guard', '/backoffice/hr/roster?tab=now', 'hr-on-duty');
  const evening = page.locator('[data-testid="hr-board-shift"][data-shift="evening"]');
  await evening.locator('[data-name="Nadeem Abbas"]').getByTestId('hr-board-check-in').click();
  await evening.locator('[data-name="Faisal Iqbal"]').getByTestId('hr-board-absent').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /Mark absent/ }).click();
  await page.getByTestId('hr-board-short').waitFor();
  await settle(page, 300);
  await shot(page, 'c05-on-duty-short-staffed-1440-en');
  await evening.locator('[data-name="Faisal Iqbal"]').getByTestId('hr-board-replace').click();
  const cover = page.getByTestId('hr-assign-drawer');
  await cover.getByText(/people and why/).click();
  await settle(page, 300);
  await shot(page, 'c06-replacement-candidates-1440-en', false);
  await pick(page, cover, 'hr-assign-person', 'Asif', /Asif Mehmood/);
  await cover.getByTestId('hr-assign-save').click();
  await cover.waitFor({ state: 'detached' });
  await settle(page, 300);
  await shot(page, 'c07-on-duty-covered-1440-en');
  await page.context().close();
});

test('reference flow 3: corrections and leave, decided by someone else (1440, en)', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_guard' }, '10:00');
  await as(page, 'alnoor_guard', '/backoffice/hr/attendance?date=2026-10-25', 'hr-attendance');
  await page.locator('[data-testid="hr-attendance-row"][data-name="Asif Mehmood"]').getByTestId('hr-correct').click();
  const drawer = page.getByTestId('hr-correction-drawer');
  await drawer.getByTestId('hr-correction-in').fill('07:25');
  await drawer.getByTestId('hr-correction-reason').fill('The gate log shows he arrived at 07:25, not on time.');
  await settle(page, 300);
  await shot(page, 'd01-correction-request-1440-en', false);
  await drawer.getByTestId('hr-correction-save').click();
  await drawer.waitFor({ state: 'detached' });
  await as(page, 'alnoor_manager', '/backoffice/hr/leave-attendance-adjustments?tab=corrections', 'hr-correction-rows');
  await shot(page, 'd02-corrections-own-record-blocked-1440-en');
  await open(page, BO, '/backoffice/hr/leave-attendance-adjustments', 'hr-leave-rows');
  await page.locator('[data-testid="hr-leave-row"][data-name="Karim Bakhsh"]').getByTestId('hr-leave-approve').click();
  await page.getByRole('alertdialog').waitFor();
  await settle(page, 300);
  await shot(page, 'd03-approve-leave-with-conflicts-1440-en', false);
  await page.getByRole('alertdialog').getByRole('button', { name: /^Approve$/ }).click();
  await open(page, BO, '/backoffice/hr/roster', 'hr-roster-week');
  await shotOf(page.getByTestId('hr-roster-warnings'), 'd04-approved-leave-gap-1440-en');
  await page.context().close();
});

test('documents and the money rule: an approval is not a payment (1440, en)', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_manager' }, '11:00');
  await as(page, 'alnoor_manager', '/backoffice/hr/employee-documents', 'hr-documents');
  await page.getByTestId('hr-document-add').click();
  const doc = page.getByTestId('hr-document-drawer');
  await pick(page, doc, 'hr-document-employee', 'Karim', /Karim Bakhsh/);
  await choose(page, doc, 'hr-document-kind', 'Police verification');
  await doc.getByTestId('hr-document-file').setInputFiles(pdf('karim-police.pdf'));
  await doc.getByTestId('hr-document-number').fill('PV-LHR-2026-20001');
  await doc.getByTestId('hr-document-issued').fill('2026-10-20');
  await doc.getByTestId('hr-document-expires').fill('2027-10-20');
  await settle(page, 300);
  await shot(page, 'e01-add-document-simulated-1440-en', false);
  await doc.getByTestId('hr-document-save').click();
  await doc.waitFor({ state: 'detached' });
  await as(page, 'alnoor_treasurer', '/backoffice/hr/employee-advances', 'hr-advances');
  await page.getByTestId('hr-advance-row').filter({ hasText: 'Asif Mehmood' }).click();
  await page.getByTestId('hr-advance-approve').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /Approve request/ }).click();
  await page.getByTestId('hr-advance-not-paid').waitFor();
  await settle(page, 300);
  await shot(page, 'e02-loan-approved-not-paid-1440-en', false);
  await page.keyboard.press('Escape');
  await as(page, 'alnoor_accounts', '/backoffice/hr/employee-advance-settlement', 'hr-settlement');
  await shot(page, 'e03-settlement-partial-no-voucher-1440-en');
  const created = await societyApi<{ voucher: { id: string; approvalId: string } }>(page, '/finance/vouchers', 'POST', { accountId: 'cac_anr_office', direction: 'payment', category: 'misc_expense', amount: '15000', onDate: '2026-10-26', purpose: 'Advance to Ghulam Rasool (HR request ANR-AD-0002)', counterparty: 'Ghulam Rasool (staff)', evidence: { name: 'advance-slip.pdf', kind: 'receipt', size: 1000 }, submit: true });
  const v = created.ok ? created.res.voucher : null;
  // 15,000 is over the society's 10,000 limit: the treasurer and the general secretary both sign (S.1).
  // The page's mock server acts for the persona it was opened as, so each signer opens a page first.
  for (const signer of ['alnoor_treasurer', 'alnoor_admin'] as const) {
    await as(page, signer, '/backoffice/hr/employee-advances', 'hr-advances');
    const decided = await societyApi(page, `/approvals/${v!.approvalId}/decide`, 'POST', { decision: 'approve', reason: 'Checked against the HR approval' });
    if (!decided.ok) throw new Error(`${signer}: ${JSON.stringify(decided)}`);
  }
  await as(page, 'alnoor_accounts', '/backoffice/hr/employee-advance-settlement', 'hr-settlement');
  const posted = await societyApi(page, `/finance/vouchers/${v!.id}/post`, 'POST');
  if (!posted.ok) throw new Error(`post: ${JSON.stringify(posted)}`);
  await open(page, BO, '/backoffice/hr/employee-advance-settlement?advance=adv_anr_0002', 'hr-settlement-vouchers');
  await shot(page, 'e04-settlement-posted-voucher-eligible-1440-en');
  await page.locator('[data-testid="hr-settlement-voucher"][data-eligible="true"]').first().getByTestId('hr-settlement-link').click();
  await page.getByTestId('hr-settlement-advance').filter({ hasText: 'Ghulam Rasool' }).locator('[data-state="disbursed"]').waitFor();
  await settle(page, 300);
  await shot(page, 'e05-settlement-paid-out-evidenced-1440-en');
  await page.context().close();
});

test('320 × 700, Urdu, 200 % text: roster, On duty now, Employee 360 and staff on duty (viewport captures)', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await context(browser, { width: 320, height: 700 }, { locale: 'ur-PK', staff: 'alnoor_manager', textScale: 2 }, '15:20');
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), OFFICE_DISPLAY);
  for (const [name, path, ready] of [
    ['g01-roster-day', '/backoffice/hr/roster', 'hr-roster-days'],
    ['g02-on-duty-now', '/backoffice/hr/roster?tab=now', 'hr-board-current'],
    ['g03-employee-360', '/backoffice/hr/employee-360-workspace/emp_anr_001', 'hr-360-today'],
    ['g04-leave', '/backoffice/hr/leave-attendance-adjustments', 'hr-leave-rows'],
  ] as const) {
    await as(page, 'alnoor_manager', path, ready);
    // The screen as the person sees it once scrolled to the content (header and bar still in place).
    await toContent(page, ready);
    await shot(page, `${name}-320x700-200pct-ur`, false);
  }
  await resident(page, 'alnoor_resident_a101', '/customer/portal/community?tab=staff', 'community-staff');
  await toContent(page, 'community-staff');
  await shot(page, 'g05-resident-staff-on-duty-320x700-200pct-ur', false);
  await page.context().close();
});

test('dark mode with high contrast: roster and On duty now (390, ur)', async ({ browser }) => {
  test.setTimeout(150_000);
  const page = await context(browser, VIEWPORTS.phone, { locale: 'ur-PK', staff: 'alnoor_manager' }, '15:20');
  await as(page, 'alnoor_manager', '/backoffice/global/accessibility-preferences', 'hub-theme');
  await page.getByTestId('hub-theme-dark').click();
  await page.getByTestId('hub-contrast-high').click();
  await as(page, 'alnoor_manager', '/backoffice/hr/roster', 'hr-roster-week');
  await shot(page, 'h01-roster-dark-contrast-390-ur');
  await open(page, BO, '/backoffice/hr/roster?tab=now', 'hr-board-current');
  await shot(page, 'h02-on-duty-dark-contrast-390-ur');
  await page.context().close();
});

test('who sees what: the supervisor\'s menu, and HR not in the plan (1440, en)', async ({ browser }) => {
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_guard' }, '15:20');
  await as(page, 'alnoor_guard', '/backoffice/hr/roster?tab=now', 'hr-on-duty');
  await shot(page, 'i01-supervisor-roster-only-1440-en', false);
  await open(page, BO, '/backoffice/hr/employees-list', 'access-outcome');
  await shot(page, 'i02-supervisor-no-staff-records-1440-en', false);
  await page.context().close();
  const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop, reducedMotion: 'reduce' });
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => sessionStorage.setItem('demo:withdrawn-modules', JSON.stringify(['hr'])));
  await seedSociety(p2, { staff: 'alnoor_manager' });
  await as(p2, 'alnoor_manager', '/backoffice/hr/hr-dashboard', 'access-outcome');
  await shot(p2, 'i03-hr-not-in-plan-1440-en', false);
  await ctx.close();
});

test('video: a new guard to active duty (desktop, en)', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_manager' }, '21:30', true);
  await as(page, 'alnoor_manager', '/backoffice/hr/employees-list', 'hr-employee-rows');
  await page.getByTestId('hr-new-employee').click();
  await page.getByTestId('hr-employee-form').waitFor();
  await page.getByTestId('hr-field-name').pressSequentially('Hamza Raza', { delay: 30 });
  await page.getByTestId('hr-field-cnic').fill('35202-1122334-5');
  await page.getByTestId('hr-field-phone').fill('0300 0000299');
  await page.getByTestId('hr-field-address').fill('House 5, Street 9, Township, Lahore (Demo)');
  await pick(page, page, 'hr-field-role', 'guard', /^Security guard/);
  await page.getByTestId('hr-employee-save').click();
  await page.getByTestId('hr-employee-360').waitFor();
  await settle(page, 800);
  await page.getByTestId('hr-360-assign').click();
  const drawer = page.getByTestId('hr-assign-drawer');
  await choose(page, drawer, 'hr-assign-shift', /^Night/);
  await choose(page, drawer, 'hr-assign-post', 'Patrol');
  await settle(page, 600);
  await drawer.getByTestId('hr-assign-save').click();
  await drawer.waitFor({ state: 'detached' });
  await settle(page, 800);
  await at(page, '23:04');
  await as(page, 'alnoor_guard', '/backoffice/hr/roster?tab=now', 'hr-on-duty');
  await page.locator('[data-testid="hr-board-person"][data-name="Hamza Raza"]').getByTestId('hr-board-check-in').click();
  await settle(page, 1200);
  await keepVideo(page, 'new-guard-to-active-duty-desktop-en');
});

test('video: an absent guard replaced from On duty now (desktop, en)', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_guard' }, '15:20', true);
  await as(page, 'alnoor_guard', '/backoffice/hr/roster?tab=now', 'hr-on-duty');
  const evening = page.locator('[data-testid="hr-board-shift"][data-shift="evening"]');
  await evening.locator('[data-name="Nadeem Abbas"]').getByTestId('hr-board-check-in').click();
  await settle(page, 600);
  await evening.locator('[data-name="Faisal Iqbal"]').getByTestId('hr-board-absent').click();
  await settle(page, 600);
  await page.getByRole('alertdialog').getByRole('button', { name: /Mark absent/ }).click();
  await settle(page, 800);
  await evening.locator('[data-name="Faisal Iqbal"]').getByTestId('hr-board-replace').click();
  const cover = page.getByTestId('hr-assign-drawer');
  await pick(page, cover, 'hr-assign-person', 'Asif', /Asif Mehmood/);
  await settle(page, 600);
  await cover.getByTestId('hr-assign-save').click();
  await cover.waitFor({ state: 'detached' });
  await settle(page, 1500);
  await keepVideo(page, 'absent-guard-replaced-desktop-en');
});
