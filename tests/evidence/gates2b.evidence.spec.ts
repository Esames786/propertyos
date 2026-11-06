import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { BO, test, type Locale, type PersonaId } from '../support/fixtures';
import { addBlockCWorker, become, BLOCK_C_WORKER, seedSociety, societyApi, type SocietySeed } from '../support/society';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * Gate S.2b evidence (society payroll: overview, periods, run workspace, pay breakdown, finalisation,
 * disbursement and accounting; the reference flow from a held run to a "sent (simulated)" instruction
 * that is never paid; who sees pay; phones in both languages, 320 px with 200 % text; dark mode with
 * high contrast) → docs/status/gate-s2b/{screenshots,video}. The business date is Monday 26 October
 * 2026. Run against production builds:
 * `E2E_PORT_OFFSET=500 npx playwright test --project=evidence tests/evidence/gates2b.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-s2b/screenshots';
const VIDEO = 'docs/status/gate-s2b/video';
const RAW = 'test-results-s2b/gates2b-video';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const RUN = 'prn_anr_0001';
const E = { shahid: 'emp_anr_001', karim: 'emp_anr_004', nadeem: 'emp_anr_005', tariq: 'emp_anr_007', rukhsana: 'emp_anr_011', saba: 'emp_anr_014' };
const REASON = 'Paper attendance register for 1 to 18 October checked.';
const DISPLAY = ['pref:display:v1:backoffice:tnt_alnoor:usr_anr_0004', 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0002'];

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

async function context(browser: Browser, viewport: { width: number; height: number }, society: SocietySeed, video = false, scale?: number) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', ...(video ? { recordVideo: { dir: RAW, size: viewport } } : {}) });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
  await seedSociety(page, society);
  if (scale) for (const key of DISPLAY) await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key, scale });
  return page;
}

const BAR_HIDDEN = '[data-testid="bottom-nav"] { visibility: hidden !important; }';
const shot = (page: Page, name: string, full = true) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full, ...(full ? { style: BAR_HIDDEN } : {}) });

async function api(page: Page, path: string, method: 'GET' | 'POST' = 'POST', body: unknown = {}) {
  const r = await societyApi(page, path, method, body);
  if (!r.ok) throw new Error(`${method} ${path}: ${JSON.stringify(r)}`);
  return r.res as { id: string };
}

/** Through the mock server (setup only): days confirmed and the run submitted by Saba. */
async function submitted(page: Page) {
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
  await api(page, `/payroll/runs/${RUN}/lines/${E.tariq}/days`, 'POST', { days: 23, reason: REASON });
  await api(page, `/payroll/runs/${RUN}/lines/${E.rukhsana}/days`, 'POST', { days: 26, reason: REASON });
  await api(page, `/payroll/runs/${RUN}/lines/${E.shahid}/bonuses`, 'POST', { label: 'Night patrol cover', amount: '5000', reason: 'Covered the night patrol during the wedding week.' });
  await api(page, `/payroll/runs/${RUN}/submit`);
}

/** …approved by Ayesha, the instruction prepared by Saba, approved by Ayesha and marked sent (simulated). */
async function sent(page: Page) {
  await submitted(page);
  await as(page, 'alnoor_treasurer', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
  await api(page, `/payroll/runs/${RUN}/approve`, 'POST', { acknowledge: true, note: 'Checked against the attendance summary.' });
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
  const ins = await api(page, `/payroll/runs/${RUN}/instructions`);
  await as(page, 'alnoor_treasurer', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
  await api(page, `/payroll/instructions/${ins.id}/approve`);
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
  await api(page, `/payroll/instructions/${ins.id}/sent`);
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
  const vp: ViewportName = locale === 'ur-PK' ? 'phone' : 'desktop';
  const w = VIEWPORTS[vp].width;
  const l = lang(locale);

  test(`payroll before approval: held lines, inputs, own pay (${w}, ${l})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await context(browser, VIEWPORTS[vp], { locale, staff: 'alnoor_accounts' });
    for (const [name, path, ready] of [
      ['b01-dashboard', '/backoffice/pay/payroll-dashboard', 'pay-dashboard'],
      ['b02-periods', '/backoffice/pay/payroll-periods', 'pay-period-rows'],
      ['b03-run-workspace', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, 'pay-run-lines'],
      ['b04-run-held-lines', `/backoffice/pay/payroll-run-workspace?run=${RUN}&filter=blocked`, 'pay-run-lines'],
      ['b05-breakdown-daily-wage', `/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${E.tariq}`, 'pay-breakdown-days'],
      ['b06-breakdown-deductions', `/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${E.karim}&tab=deductions`, 'pay-deductions-statutory'],
      ['b07-breakdown-own-pay', `/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${E.saba}&tab=net`, 'pay-breakdown-own'],
      ['b08-disbursement-empty', '/backoffice/pay/payroll-disbursement-status', 'pay-disbursement-partial'],
      ['b09-accounting-empty', '/backoffice/pay/payroll-accounting', 'pay-accounting-partial'],
    ] as const) {
      await as(page, 'alnoor_accounts', path, ready);
      await shot(page, `${name}-${w}-${l}`);
    }
    await page.getByTestId('pay-nav-run').click();
    await page.getByTestId('pay-run-lines').waitFor();
    await page.goto(`${BO}/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${E.tariq}`);
    await page.getByTestId('pay-days-open').click();
    await page.getByTestId('pay-days-drawer').waitFor();
    await settle(page, 300);
    await shot(page, `b10-days-drawer-${w}-${l}`, false);
    await page.context().close();
  });

  test(`payroll after approval: obligation, instruction sent (simulated), never paid (${w}, ${l})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await context(browser, VIEWPORTS[vp], { locale, staff: 'alnoor_accounts' });
    await sent(page);
    for (const [name, path, ready] of [
      ['c01-dashboard-after', '/backoffice/pay/payroll-dashboard', 'pay-dashboard'],
      ['c02-run-approved-frozen', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, 'pay-run-approved'],
      ['c03-finalisation-audit', `/backoffice/pay/payroll-finalization?run=${RUN}`, 'pay-final-audit'],
      ['c04-disbursement-sent-not-settled', '/backoffice/pay/payroll-disbursement-status', 'pay-instruction'],
      ['c05-accounting-proposed-only', '/backoffice/pay/payroll-accounting', 'pay-accounting-runs'],
    ] as const) {
      await as(page, 'alnoor_accounts', path, ready);
      await shot(page, `${name}-${w}-${l}`);
    }
    await page.context().close();
  });
}

test('finalisation: the approver reads the warnings and acknowledges; refused without it (1440, en)', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_accounts' });
  await submitted(page);
  await as(page, 'alnoor_treasurer', `/backoffice/pay/payroll-finalization?run=${RUN}`, 'pay-final-acknowledge');
  await shot(page, 'd01-finalisation-awaiting-1440-en');
  await page.getByTestId('pay-final-approve').click();
  await page.getByText('Confirm that this approves what is owed, not a payment.').waitFor();
  await settle(page, 300);
  await shot(page, 'd02-finalisation-refused-without-acknowledgement-1440-en');
  // The preparer's view of the same run: no approval for whoever made it.
  await as(page, 'alnoor_accounts', `/backoffice/pay/payroll-finalization?run=${RUN}`, 'pay-final-detail');
  await shot(page, 'd03-finalisation-preparer-view-1440-en');
  await page.context().close();
});

test('periods: the next month in order, another open period refused (1440, en)', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_accounts' });
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-periods', 'pay-period-rows');
  await page.getByTestId('pay-period-new').click();
  const drawer = page.getByTestId('pay-period-drawer');
  await drawer.getByTestId('pay-period-month').fill('2027-01');
  await drawer.getByTestId('pay-period-save').click();
  await drawer.getByText('Periods are created in order: the next one is 2026-12.').first().waitFor();
  await settle(page, 300);
  await shot(page, 'd04-period-out-of-order-1440-en', false);
  await page.context().close();
});

test('a loan instalment held, not deducted; HR advances unchanged (1440, en)', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_manager' });
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
  await as(page, 'alnoor_manager', '/backoffice/hr/employee-advances', 'hr-advance-rows');
  const loan = await api(page, '/hr/advances', 'POST', { employeeId: E.nadeem, kind: 'loan', amount: '30000', instalments: 3, firstMonth: '2026-10', reason: 'Medical bills after his father’s operation.', evidence: [{ name: 'hospital-estimate.pdf', type: 'application/pdf', sizeBytes: 90000 }] });
  await as(page, 'alnoor_treasurer', '/backoffice/hr/employee-advances', 'hr-advance-rows');
  await api(page, `/hr/advances/${loan.id}/approve`);
  await as(page, 'alnoor_accounts', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, 'pay-run-blockers');
  await shot(page, 'd05-run-stale-after-hr-change-1440-en');
  await api(page, `/payroll/runs/${RUN}/recompute`);
  await as(page, 'alnoor_accounts', `/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${E.nadeem}&tab=deductions`, 'pay-deductions-held');
  await shot(page, 'd06-breakdown-loan-instalment-held-1440-en');
  await as(page, 'alnoor_treasurer', '/backoffice/hr/employee-advance-settlement', 'hr-settlement-list');
  await shot(page, 'd07-hr-settlement-still-unverified-1440-en');
  await page.context().close();
});

test('768 × 1024 (en): run workspace and disbursement', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await context(browser, VIEWPORTS.tablet, { staff: 'alnoor_accounts' });
  await as(page, 'alnoor_accounts', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, 'pay-run-lines');
  await shot(page, 'e01-run-workspace-768-en');
  await sent(page);
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-disbursement-status', 'pay-instruction');
  await shot(page, 'e02-disbursement-768-en');
  await page.context().close();
});

test('320 × 700, Urdu and English, 200 % text: run, breakdown and disbursement (viewport captures)', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const locale of ['ur-PK', 'en-PK'] as Locale[]) {
    const l = lang(locale);
    const page = await context(browser, { width: 320, height: 700 }, { locale, staff: 'alnoor_accounts' }, false, 2);
    await as(page, 'alnoor_accounts', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, 'pay-run-lines');
    await shot(page, `f01-run-200pct-320-${l}`, false);
    await as(page, 'alnoor_accounts', `/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${E.tariq}`, 'pay-breakdown');
    await shot(page, `f02-breakdown-200pct-320-${l}`, false);
    await sent(page);
    await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-disbursement-status', 'pay-instruction');
    await page.getByTestId('pay-instruction').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await settle(page, 300);
    await shot(page, `f03-disbursement-200pct-320-${l}`, false);
    await page.context().close();
  }
});

test('dark mode with high contrast: run and disbursement (390, ur)', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await context(browser, VIEWPORTS.phone, { locale: 'ur-PK', staff: 'alnoor_accounts' });
  await sent(page);
  await as(page, 'alnoor_accounts', '/backoffice/global/accessibility-preferences', 'hub-theme');
  await page.getByTestId('hub-theme-dark').click();
  await page.getByTestId('hub-contrast-high').click();
  await settle(page, 300);
  await as(page, 'alnoor_accounts', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, 'pay-run-lines');
  await shot(page, 'g01-run-dark-contrast-390-ur');
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-disbursement-status', 'pay-instruction');
  await shot(page, 'g02-disbursement-dark-contrast-390-ur');
  await page.context().close();
});

test('Issue #16: a main-site-only reader beside a reader with every site (1440, en)', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_accounts' });
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
  await addBlockCWorker(page);
  const w = BLOCK_C_WORKER;
  await as(page, 'alnoor_accounts', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, 'pay-run-lines');
  await api(page, `/payroll/runs/${RUN}/recompute`);
  await api(page, `/payroll/runs/${RUN}/lines/${w.id}/bonuses`, 'POST', { label: 'Block C night cover', amount: '3333.33', reason: 'Covered the Block C nights in October.' });
  await api(page, `/payroll/runs/${RUN}/lines/emp_anr_901/exclude`, 'POST', { reason: 'Pay terms still to be agreed by the committee.' });
  await api(page, `/payroll/runs/${RUN}/lines/${E.tariq}/days`, 'POST', { days: 23, reason: REASON });
  await api(page, `/payroll/runs/${RUN}/lines/${E.rukhsana}/days`, 'POST', { days: 26, reason: REASON });
  await api(page, `/payroll/runs/${RUN}/submit`);
  await as(page, 'alnoor_treasurer', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
  await api(page, `/payroll/runs/${RUN}/approve`, 'POST', { acknowledge: true, note: 'Approved; Omer Farooq’s cover checked.' });
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
  await api(page, `/payroll/runs/${RUN}/instructions`);
  // Ayesha with every site: the full audit.
  await as(page, 'alnoor_treasurer', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, 'pay-run-lines');
  await shot(page, 'i01-run-full-reader-1440-en');
  // Ayesha limited to the main site in this tab (the demo's narrow-only hook).
  await page.evaluate(() => sessionStorage.setItem('demo:site-scope', JSON.stringify({ alnoor_treasurer: ['site_alnoor'] })));
  await as(page, 'alnoor_treasurer', `/backoffice/pay/payroll-run-workspace?run=${RUN}`, 'pay-run-limited');
  await shot(page, 'i02-run-main-site-reader-1440-en');
  await as(page, 'alnoor_treasurer', '/backoffice/pay/payroll-disbursement-status', 'pay-instruction');
  await shot(page, 'i03-disbursement-main-site-reader-1440-en');
  await page.context().close();
});

test('who sees pay: HR is refused payroll; HR without payroll (1440, en)', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_manager' });
  await become(page, 'backoffice', 'alnoor_manager');
  await page.goto(`${BO}/backoffice/pay/payroll-run-workspace?run=${RUN}`);
  await page.getByTestId('access-outcome').waitFor();
  await settle(page);
  await shot(page, 'h01-hr-manager-refused-payroll-1440-en');
  await page.context().close();
  const p2 = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_accounts' });
  await p2.addInitScript(() => sessionStorage.setItem('demo:withdrawn-modules', JSON.stringify(['payroll'])));
  await become(p2, 'backoffice', 'alnoor_accounts');
  await p2.goto(`${BO}/backoffice/pay/payroll-dashboard`);
  await p2.getByTestId('access-outcome').waitFor();
  await settle(p2);
  await shot(p2, 'h02-payroll-not-in-plan-1440-en');
  await p2.context().close();
});

test('video: from a held run to a sent (simulated) instruction, never paid (desktop, en)', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_accounts' }, true);
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-dashboard', 'pay-dashboard');
  await page.getByTestId('pay-attention-item').filter({ hasText: 'held in the current run' }).click();
  await page.getByTestId('pay-run-lines').waitFor();
  await settle(page, 800);
  for (const [id, days] of [[E.tariq, '23'], [E.rukhsana, '26']] as const) {
    await page.goto(`${BO}/backoffice/pay/employee-pay-breakdown?run=${RUN}&employee=${id}`);
    await page.getByTestId('pay-days-open').click();
    const d = page.getByTestId('pay-days-drawer');
    await d.getByTestId('pay-days-input').pressSequentially(days, { delay: 60 });
    await d.getByTestId('pay-days-reason').fill(REASON);
    await settle(page, 400);
    await d.getByTestId('pay-days-save').click();
    await d.waitFor({ state: 'detached' });
    await settle(page, 600);
  }
  await page.goto(`${BO}/backoffice/pay/payroll-run-workspace?run=${RUN}`);
  await page.getByTestId('pay-run-submit').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Submit for approval' }).click();
  await settle(page, 800);
  await as(page, 'alnoor_treasurer', `/backoffice/pay/payroll-finalization?run=${RUN}`, 'pay-final-acknowledge');
  await page.getByTestId('pay-final-acknowledge').click();
  await settle(page, 400);
  await page.getByTestId('pay-final-approve').click();
  await settle(page, 1000);
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-disbursement-status', 'pay-disbursement');
  await page.getByTestId('pay-instruction-prepare').click();
  await page.getByTestId('pay-instruction').waitFor();
  await settle(page, 800);
  await as(page, 'alnoor_treasurer', '/backoffice/pay/payroll-disbursement-status', 'pay-instruction-approve');
  await page.getByTestId('pay-instruction-approve').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve instruction' }).click();
  await settle(page, 800);
  await as(page, 'alnoor_accounts', '/backoffice/pay/payroll-disbursement-status', 'pay-instruction-send');
  await page.getByTestId('pay-instruction-send').click();
  await page.getByRole('alertdialog').getByRole('button', { name: /Mark sent/ }).click();
  await settle(page, 1000);
  await page.getByTestId('pay-nav-accounting').click();
  await page.getByTestId('pay-accounting-runs').waitFor();
  await settle(page, 1500);
  await keepVideo(page, 'held-run-to-sent-instruction-never-paid-desktop-en');
});
