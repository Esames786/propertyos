import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, Locator, Page } from '@playwright/test';
import { BO, CU, test, type Locale, type PersonaId } from '../support/fixtures';
import { become, seedSociety, type SocietySeed } from '../support/society';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * Gate D.2 evidence (repairs to resident confirmation, visitors at the gate, notices with
 * acknowledgement; vehicles, residents, Flat 360 services, the sandbox gateway and the resident's
 * service pages; phones in both languages, 320 px with 200 % text) → docs/status/gate-d2/{screenshots,video}.
 * Run on its own against production builds, on isolated ports if needed:
 * `E2E_PORT_OFFSET=200 npx playwright test --project=evidence tests/evidence/gated2.evidence.spec.ts --output=test-results-d2/evidence`.
 */
const DIR = 'docs/status/gate-d2/screenshots';
const VIDEO = 'docs/status/gate-d2/video';
const RAW = 'test-results-d2/gated2-video';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const width = (vp: ViewportName) => VIEWPORTS[vp].width;

async function settle(page: Page, ms = 700) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function open(page: Page, path: string, ready: string, ms = 700) {
  await page.goto(`${BO}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page, ms);
}

async function portal(page: Page, path: string, ready: string, ms = 700) {
  await page.goto(`${CU}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page, ms);
}

async function as(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await open(page, path, ready);
}

async function resident(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'customer', persona);
  await portal(page, path, ready);
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

async function pickFlat(page: Page, scope: Page | Locator, testId: string, code: string) {
  await scope.getByTestId(testId).locator('input').fill(code);
  await page.getByRole('option', { name: new RegExp(code) }).first().click();
  await page.waitForFunction(() => !document.querySelector('[role=listbox]'));
}

test.describe.configure({ mode: 'parallel' });

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const vp: ViewportName = locale === 'ur-PK' ? 'phone' : 'desktop';
  const w = width(vp);
  const l = lang(locale);
  const ur = locale === 'ur-PK';

  test(`Reference 1: repair to resident confirmation (${l})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await context(browser, vp, { staff: 'alnoor_maintenance', locale }, !ur);
    await resident(page, 'alnoor_resident_a101', '/customer/portal/maintenance-workspace', 'repairs-page');
    await shot(page, `r01-resident-repairs-${w}-${l}`);
    await page.getByTestId('repair-new').click();
    const sheet = page.getByTestId('repair-new-sheet');
    await box(sheet, 'repair-title').fill(ur ? 'باورچی خانے کا سنک ٹپک رہا ہے' : 'Kitchen sink leaking');
    await box(sheet, 'repair-description').fill(ur ? 'کل رات سے سنک کے نیچے سے پانی ٹپک رہا ہے۔' : 'Water drips from the trap under the kitchen sink since last night.');
    await sheet.getByTestId('repair-photos-sample').click();
    await box(sheet, 'repair-photos-alt-0').fill(ur ? 'سنک کے نیچے پانی' : 'Water under the kitchen sink');
    await settle(page, 300);
    await shot(page, `r02-report-a-repair-${w}-${l}`, false);
    await sheet.getByTestId('repair-submit').click();
    const detail = page.getByTestId('repair-detail');
    await detail.waitFor();
    await sheet.waitFor({ state: 'hidden' });
    await settle(page, 400);
    await shot(page, `r03-repair-sent-${w}-${l}`, false);
    const ref = (await detail.locator('.ltr-ref').first().innerText()).trim();

    await as(page, 'alnoor_maintenance', '/backoffice/mnt/maintenance-dashboard', 'maintenance-dashboard');
    await shot(page, `r04-maintenance-dashboard-${w}-${l}`);
    await open(page, `/backoffice/mnt/maintenance-list?q=${ref}`, 'request-row');
    await page.getByTestId('request-row').filter({ hasText: ref }).click();
    await page.getByTestId('request-workspace').waitFor();
    await settle(page);
    await shot(page, `r05-request-360-new-${w}-${l}`);
    await page.getByTestId('action-triage').click();
    await page.getByTestId('triage-drawer').waitFor();
    await settle(page, 300);
    await shot(page, `r06-triage-${w}-${l}`, false);
    await page.getByTestId('triage-submit').click();
    await page.getByTestId('triage-drawer').waitFor({ state: 'hidden' });
    await page.getByTestId('action-assign').click();
    const assign = page.getByTestId('assign-drawer');
    await assign.getByTestId('technician-option').filter({ hasText: 'Bilal' }).click();
    await settle(page, 300);
    await shot(page, `r07-assign-technician-${w}-${l}`, false);
    await assign.getByTestId('assign-submit').click();
    await assign.waitFor({ state: 'hidden' });
    await open(page, '/backoffice/mnt/technician-board', 'technician-board');
    await shot(page, `r08-technician-board-${w}-${l}`);
    await page.goto(`${BO}/backoffice/mnt/maintenance-list?q=${ref}`);
    await page.getByTestId('request-row').filter({ hasText: ref }).click();
    await page.getByTestId('action-start').click();
    await page.getByTestId('action-complete').click();
    const complete = page.getByTestId('complete-drawer');
    await box(complete, 'complete-note').fill(ur ? 'ٹریپ کا واشر بدل دیا؛ 30 منٹ بعد کوئی رساؤ نہیں۔' : 'Replaced the trap washer; no leak after 30 minutes.');
    await complete.getByTestId('complete-photos-sample').click();
    await box(complete, 'complete-photos-alt-0').fill(ur ? 'مرمت کے بعد خشک پائپ' : 'Dry pipe under the sink after the repair');
    await settle(page, 300);
    await shot(page, `r09-completion-evidence-${w}-${l}`, false);
    await complete.getByTestId('complete-submit').click();
    await complete.waitFor({ state: 'hidden' });
    await settle(page);
    await shot(page, `r10-request-360-awaiting-resident-${w}-${l}`);

    await resident(page, 'alnoor_resident_a101', '/customer/portal/home', 'dues-home');
    await page.getByTestId('home-attention').waitFor();
    await shot(page, `r11-resident-home-needs-attention-${w}-${l}`);
    await page.getByTestId('portal-bell').click();
    await page.getByTestId('notifications-panel').waitFor();
    await settle(page, 300);
    await shot(page, `r12-bell-${w}-${l}`, false);
    await page.getByTestId('notifications-panel').getByTestId('notification').filter({ hasText: ref }).first().click();
    await page.getByTestId('repair-confirm').waitFor();
    await settle(page);
    await shot(page, `r13-is-it-fixed-${w}-${l}`, false);
    await page.getByTestId('rating-5').click();
    await page.getByTestId('repair-confirm-yes').click();
    await page.locator('[data-testid="repair-detail"][data-state="closed"]').waitFor();
    await settle(page);
    await shot(page, `r14-closed-by-resident-${w}-${l}`, false);

    await as(page, 'alnoor_maintenance', '/backoffice/mnt/sla-dashboard', 'sla-dashboard');
    await shot(page, `r15-sla-dashboard-${w}-${l}`);
    await open(page, '/backoffice/mnt/resident-confirmation?tab=confirmed', 'confirmation-page');
    await shot(page, `r16-resident-confirmation-${w}-${l}`);
    await keepVideo(page, `ref1-repair-${ur ? 'phone-ur' : 'desktop-en'}`);
  });

  test(`Reference 2: visitors and the gate (${l})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await context(browser, vp, { staff: 'alnoor_guard', locale }, !ur);
    await resident(page, 'alnoor_resident_a101', '/customer/portal/services-home?tab=visitors', 'visitors-tab');
    await shot(page, `v01-resident-visitors-${w}-${l}`);
    await page.getByTestId('invite-guest').click();
    const invite = page.getByTestId('invite-sheet');
    await box(invite, 'invite-name').fill('Hina Rauf');
    await box(invite, 'invite-plate').fill('LEB 2231');
    await settle(page, 300);
    await shot(page, `v02-invite-a-guest-${w}-${l}`, false);
    await invite.getByTestId('invite-submit').click();
    await page.getByTestId('pass-code').waitFor();
    await settle(page);
    await shot(page, `v03-pass-with-code-${w}-${l}`, false);
    const code = (await page.getByTestId('pass-code').innerText()).replace(/\D/g, '');

    await as(page, 'alnoor_guard', '/backoffice/vis/visitor-dashboard', 'visitor-dashboard');
    await shot(page, `v04-visitor-dashboard-${w}-${l}`);
    await open(page, '/backoffice/vis/gate-check-in', 'gate-page');
    await box(page, 'gate-code').fill('000000');
    await page.getByTestId('gate-check').click();
    await page.getByTestId('check-result').waitFor();
    await settle(page, 300);
    await shot(page, `v05-wrong-code-refused-${w}-${l}`);
    await box(page, 'gate-code').fill(code);
    await page.getByTestId('gate-check').click();
    await page.locator('[data-testid="check-result"][data-ok="true"]').waitFor();
    await settle(page, 300);
    await shot(page, `v06-let-in-${w}-${l}`);

    const walkIn = page.getByTestId('walk-in');
    await pickFlat(page, walkIn, 'walk-in-flat', 'A-101');
    await box(walkIn, 'walk-in-name').fill(ur ? 'ٹی سی ایس کورئیر' : 'Courier from TCS');
    await settle(page, 300);
    await shot(page, `v07-walk-in-${w}-${l}`);
    await walkIn.getByTestId('walk-in-ask').click();
    await open(page, '/backoffice/vis/gate-check-in?tab=queue', 'live-queue');
    await page.getByTestId('queue-request').first().waitFor();
    await settle(page);
    await shot(page, `v08-live-queue-waiting-${w}-${l}`);

    await page.setViewportSize(VIEWPORTS.phone);
    await resident(page, 'alnoor_resident_a101', '/customer/portal/home', 'dues-home');
    await page.getByTestId('gate-prompt').waitFor();
    await settle(page);
    await shot(page, `v09-occupant-prompt-390-${l}`, false);
    await page.getByTestId('gate-approve').click();
    await page.getByTestId('gate-prompt').waitFor({ state: 'hidden' });

    await page.setViewportSize(VIEWPORTS[vp]);
    await as(page, 'alnoor_guard', '/backoffice/vis/gate-check-in?tab=queue', 'live-queue');
    await page.getByTestId('answered-row').first().waitFor();
    await shot(page, `v10-queue-approved-${w}-${l}`);
    await page.getByTestId('answered-row').first().getByTestId('queue-admit').click();
    await open(page, '/backoffice/vis/visitor-history', 'visit-history');
    await shot(page, `v11-visit-history-${w}-${l}`);
    await keepVideo(page, `ref2-gate-${ur ? 'phone-ur' : 'desktop-en'}`);
  });

  test(`Reference 3: a notice with acknowledgement (${l})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await context(browser, vp, { staff: 'alnoor_manager', locale }, !ur);
    const title = ur ? 'اتوار کو پانی کی ٹینکی کی صفائی' : 'Water tank cleaning on Sunday';
    await open(page, '/backoffice/res/community-announcements', 'notices-office');
    await shot(page, `n01-notices-office-${w}-${l}`);
    await page.getByTestId('notice-new').click();
    const compose = page.getByTestId('compose-drawer');
    await box(compose, 'compose-title').fill(title);
    await box(compose, 'compose-body').fill(ur ? 'دونوں بلاکس کی اوور ہیڈ ٹینکیاں اتوار صبح 8 سے 12 بجے تک صاف ہوں گی۔ براہِ کرم ہفتے کی رات پانی جمع کر لیں۔' : 'The overhead tanks of both blocks will be cleaned on Sunday from 08:00 to 12:00. Please store water on Saturday night.');
    await compose.getByTestId('compose-ack').click();
    await settle(page, 300);
    await shot(page, `n02-compose-with-audience-${w}-${l}`, false);
    await compose.getByTestId('compose-publish').click();
    await compose.waitFor({ state: 'hidden' });

    await resident(page, 'alnoor_resident_a101', '/customer/portal/home', 'dues-home');
    await page.getByTestId('portal-bell').click();
    await page.getByTestId('notifications-panel').getByTestId('notification').filter({ hasText: title }).first().click();
    await page.getByTestId('notice-detail').waitFor();
    await settle(page);
    await shot(page, `n03-resident-notice-${w}-${l}`);
    await page.getByTestId('notice-acknowledge').click();
    await page.getByTestId('notice-acked').waitFor();
    await settle(page, 400);
    await shot(page, `n04-acknowledged-${w}-${l}`);
    await portal(page, '/customer/portal/community-notices', 'notices-page');
    await shot(page, `n05-resident-notices-${w}-${l}`);

    await as(page, 'alnoor_manager', '/backoffice/res/community-announcements', 'notices-office');
    await page.getByTestId('notice-row').filter({ hasText: title }).click();
    await page.getByTestId('notice-stats').waitFor();
    await settle(page);
    await shot(page, `n06-delivery-and-acknowledgement-${w}-${l}`);
    await keepVideo(page, `ref3-notice-${ur ? 'phone-ur' : 'desktop-en'}`);
  });

  test(`Other D.2 screens (${l})`, async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await context(browser, vp, { staff: 'alnoor_manager', locale });
    const officeShots: Array<[string, PersonaId, string, string]> = [
      ['o01-requests-list', 'alnoor_maintenance', '/backoffice/mnt/maintenance-list', 'request-row'],
      ['o02-community-issues', 'alnoor_maintenance', '/backoffice/mnt/issues', 'issues-board'],
      ['o03-new-request', 'alnoor_maintenance', '/backoffice/mnt/new-request', 'new-request-page'],
      ['o04-passes', 'alnoor_guard', '/backoffice/vis/visitor-passes', 'passes-page'],
      ['o05-scan', 'alnoor_guard', '/backoffice/vis/scan-qr', 'scan-page'],
      ['o06-vehicles', 'alnoor_manager', '/backoffice/park/vehicle-registry', 'vehicles-page'],
      ['o07-residents-dashboard', 'alnoor_manager', '/backoffice/res/resident-dashboard', 'residents-dashboard'],
      ['o08-flat-360-services', 'alnoor_manager', '/backoffice/sites/site_alnoor/units/unt_anr_a101?tab=services', 'flat-services'],
      ['o09-send-message', 'alnoor_manager', '/backoffice/not/send-message', 'send-message'],
      ['o10-online-payments-sandbox', 'alnoor_admin', '/backoffice/sites/site_alnoor?tab=online-payments', 'gateway-tab'],
    ];
    for (const [name, persona, path, ready] of officeShots) {
      await as(page, persona, path, ready);
      await shot(page, `${name}-${w}-${l}`);
    }
    await as(page, 'alnoor_manager', '/backoffice/park/vehicle-registry?status=pending', 'vehicles-page');
    await page.getByTestId('vehicle-row').first().click();
    await page.getByTestId('vehicle-checks').waitFor();
    await settle(page);
    await shot(page, `o11-vehicle-approval-${w}-${l}`, false);

    const residentShots: Array<[string, string, string]> = [
      ['p01-services-hub', '/customer/portal/services-home', 'services-hub'],
      ['p02-community-issues', '/customer/portal/issues', 'issues-page'],
      ['p03-parking', '/customer/portal/parking', 'parking-page'],
      ['p04-vehicles', '/customer/portal/vehicles', 'vehicles-page'],
      ['p05-amenities', '/customer/portal/amenities', 'amenities-page'],
    ];
    await become(page, 'customer', 'alnoor_resident_a101');
    for (const [name, path, ready] of residentShots) {
      await portal(page, path, ready);
      await shot(page, `${name}-${w}-${l}`);
    }
    await page.context().close();
  });
}

test('Phones at 320 px with 200 % text (both languages)', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
    const page = await context(browser, 'reflow', { locale, textScale: 2 });
    await become(page, 'customer', 'alnoor_resident_a101');
    for (const [name, path, ready] of [
      ['z01-home', '/customer/portal/home', 'dues-home'],
      ['z02-repairs', '/customer/portal/maintenance-workspace', 'repairs-page'],
      ['z03-notices', '/customer/portal/community-notices', 'notices-page'],
      ['z04-visitors', '/customer/portal/services-home?tab=visitors', 'visitors-tab'],
    ] as const) {
      await portal(page, path, ready);
      await shot(page, `${name}-320-200pct-${lang(locale)}`);
    }
    await page.context().close();
  }
});

const OFFICE_PRINCIPAL: Partial<Record<PersonaId, string>> = { alnoor_manager: 'usr_anr_0001', alnoor_maintenance: 'usr_anr_0005' };

/** Office display preferences (D.1) for one colleague, written once before the first load. */
async function display(page: Page, persona: PersonaId, patch: Record<string, unknown>) {
  const key = `pref:display:v1:backoffice:tnt_alnoor:${OFFICE_PRINCIPAL[persona]}`;
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

test('Themes: dark and high contrast on D.2 office screens', async ({ browser }) => {
  test.setTimeout(300_000);
  const variants: Array<[string, ViewportName, Locale, PersonaId, string, string, Record<string, unknown>]> = [
    ['t01-maintenance-dashboard-dark', 'desktop', 'en-PK', 'alnoor_maintenance', '/backoffice/mnt/maintenance-dashboard', 'maintenance-dashboard', { theme: 'dark' }],
    ['t02-requests-high-contrast', 'desktop', 'en-PK', 'alnoor_maintenance', '/backoffice/mnt/maintenance-list', 'request-row', { contrast: 'high' }],
    ['t03-notices-dark', 'phone', 'ur-PK', 'alnoor_manager', '/backoffice/res/community-announcements', 'notices-office', { theme: 'dark' }],
    ['t04-vehicles-high-contrast', 'phone', 'ur-PK', 'alnoor_manager', '/backoffice/park/vehicle-registry', 'vehicles-page', { contrast: 'high' }],
    ['t05-residents-dark-high-contrast', 'desktop', 'en-PK', 'alnoor_manager', '/backoffice/res/resident-dashboard', 'residents-dashboard', { theme: 'dark', contrast: 'high' }],
  ];
  for (const [name, vp, locale, persona, path, ready, patch] of variants) {
    const page = await context(browser, vp, { staff: persona, locale });
    await display(page, persona, patch);
    await open(page, path, ready);
    await shot(page, `${name}-${width(vp)}-${lang(locale)}`);
    await page.context().close();
  }
});
