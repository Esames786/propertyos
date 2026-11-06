import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { BO, CU, displayKey, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate S.3 evidence (rentals: leases, Lease 360 with its drawers, the new-lease wizard, the rent roll,
 * owner statements, owner payouts, settings and the landlord view; the reference flow from a draft
 * lease to an approved demand that cannot be posted and a statement the landlord opens; who sees what;
 * phones in both languages, 320 px with 200 % text; dark mode with high contrast)
 * → docs/status/gate-s3/{screenshots,video}. Business date: Monday 26 October 2026. Run against
 * production builds: `E2E_PORT_OFFSET=600 npx playwright test --project=evidence tests/evidence/gates3.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-s3/screenshots';
const VIDEO = 'docs/status/gate-s3/video';
const RAW = 'test-results-s3/gates3-video';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const STAFF = ['usr_rb_0001', 'usr_rb_0002', 'usr_rb_0003', 'usr_rb_0004'];

const onboarding = (persona: string, app: string) =>
  JSON.stringify({ profile: { tenantId: 'tnt_riverbend', personaId: persona, app, welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

async function settle(page: Page, ms = 500) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function become(page: Page, app: 'backoffice' | 'customer', persona: PersonaId) {
  const origin = app === 'backoffice' ? BO : CU;
  if (!page.url().startsWith(origin)) await page.goto(`${origin}${app === 'backoffice' ? '/backoffice/global/my-access' : '/customer/portal/rentals'}`);
  await page.evaluate(
    ({ app, persona, value, display }) => {
      localStorage.setItem(`demo:session:${app}`, JSON.stringify({ personaId: persona, projectId: 'all' }));
      localStorage.setItem(`onboarding:v1:tnt_riverbend:${persona}:${app}`, value);
      if (display && !localStorage.getItem(display)) localStorage.setItem(display, JSON.stringify({ version: 1, textScale: 1, chosenAt: '2026-10-26T00:00:00Z' }));
    },
    { app, persona, value: onboarding(persona, app), display: app === 'customer' ? displayKey(persona) : null },
  );
}

async function as(page: Page, persona: PersonaId, path: string, ready: string, app: 'backoffice' | 'customer' = 'backoffice') {
  await become(page, app, persona);
  await page.goto(`${app === 'backoffice' ? BO : CU}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page);
}

async function context(browser: Browser, viewport: { width: number; height: number }, locale: Locale = 'en-PK', video = false, scale?: number) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', ...(video ? { recordVideo: { dir: RAW, size: viewport } } : {}) });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await seed(page, { persona: 'rb_manager', locale });
  if (scale) {
    for (const p of STAFF) await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: `pref:display:v1:backoffice:tnt_riverbend:${p}`, scale });
    await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 1, textScale: scale, chosenAt: '2026-10-26T00:00:00Z' })), { key: displayKey('rb_landlord_tahira'), scale });
  }
  return page;
}

const BAR_HIDDEN = '[data-testid="bottom-nav"], [data-testid="portal-bottom-nav"] { visibility: hidden !important; }';
const shot = (page: Page, name: string, full = true) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full, ...(full ? { style: BAR_HIDDEN } : {}) });

async function api(page: Page, path: string, body: unknown = {}) {
  const r = await societyApi(page, path, 'POST', body);
  if (!r.ok) throw new Error(`POST ${path}: ${JSON.stringify(r)}`);
  return r.res;
}

async function saveVideo(page: Page, name: string) {
  const video = page.video();
  await page.context().close();
  if (!video) return;
  mkdirSync(VIDEO, { recursive: true });
  copyFileSync(await video.path(), `${VIDEO}/${name}.webm`);
}

const SCREENS: Array<[string, PersonaId, string, string]> = [
  ['a01-leases', 'rb_manager', '/backoffice/rentals', 'rent-lease-list'],
  ['a02-lease-360-blocked', 'rb_accounts', '/backoffice/rentals/leases/lse_rb_0005', 'rent-lease-360'],
  ['a03-lease-schedule-versions', 'rb_manager', '/backoffice/rentals/leases/lse_rb_0006?tab=schedule', 'lease-schedule'],
  ['a04-lease-deposit-liability', 'rb_manager', '/backoffice/rentals/leases/lse_rb_0001?tab=deposit', 'lease-deposit'],
  ['a05-new-lease-wizard', 'rb_manager', '/backoffice/rentals/leases/new?unit=unt_rb_c12', 'wizard-step-unit'],
  ['a06-rent-roll-approved-not-posted', 'rb_finance', '/backoffice/rentals/rent-roll?period=2026-10', 'roll-lines'],
  ['a07-owner-statement-settled-basis', 'rb_accounts', '/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10', 'statement-memo-lines'],
  ['a08-payouts-nothing-to-instruct', 'rb_finance', '/backoffice/rentals/payouts', 'payout-owners'],
  ['a09-settings-agreements', 'rb_finance', '/backoffice/rentals/settings', 'agreement'],
];

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  for (const [w, size] of [['1440', VIEWPORTS.desktop], ['390', VIEWPORTS.phone]] as const) {
    test(`rentals screens and the landlord view (${w}, ${lang(locale)})`, async ({ browser }) => {
      test.setTimeout(240_000);
      const page = await context(browser, size, locale);
      for (const [name, persona, path, ready] of SCREENS) {
        await as(page, persona, path, ready);
        await shot(page, `${name}-${w}-${lang(locale)}`);
      }
      await as(page, 'rb_landlord_tahira', '/customer/portal/rentals', 'landlord-properties', 'customer');
      await shot(page, `a10-landlord-view-${w}-${lang(locale)}`);
      await page.context().close();
    });
  }
}

test('Lease 360 drawers: renewal, early end, owner authority and the deposit refund that is not available (1440, en)', async ({ browser }) => {
  const page = await context(browser, VIEWPORTS.desktop);
  await as(page, 'rb_manager', '/backoffice/rentals/leases/lse_rb_0002?drawer=renew', 'lease-renew');
  await shot(page, 'b01-renew-drawer-1440-en', false);
  await as(page, 'rb_manager', '/backoffice/rentals/leases/lse_rb_0001?drawer=terminate', 'lease-terminate');
  await shot(page, 'b02-terminate-drawer-1440-en', false);
  await as(page, 'rb_manager', '/backoffice/rentals/leases/lse_rb_0004?tab=deposit&drawer=refund', 'lease-refund');
  await shot(page, 'b03-deposit-refund-not-available-1440-en', false);
  await as(page, 'rb_manager', '/backoffice/rentals/leases/lse_rb_0001?tab=ledger', 'lease-ledger');
  await shot(page, 'b04-owner-subledger-empty-1440-en');
  await as(page, 'rb_manager', '/backoffice/rentals/leases/lse_rb_0003?tab=issuing', 'lease-issuing');
  await shot(page, 'b05-principal-model-issuing-1440-en');
  await page.context().close();
});

test('the reference flow: draft → activation by a second person → rent roll approved, not posted → statement issued → landlord opens it (1440, en)', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await context(browser, VIEWPORTS.desktop);
  await as(page, 'rb_manager', '/backoffice/rentals', 'rent-lease-list');
  await api(page, '/rentals/leases', { unitId: 'unt_rb_c12', landlords: [{ ownerId: 'own_rb_mirza', share: '100.00' }], tenantPartyId: 'pty_rb_0016', model: 'principal', from: '2026-11-01', to: '2027-10-31', rent: '55000.00', dueDay: 1, deposit: '110000.00', authority: { reference: 'MFP-AUTH-2026-10 (fictional)', date: '2026-10-25', confirmed: true } });
  await api(page, '/rentals/leases/lse_rb_0007/submit');
  await as(page, 'rb_manager', '/backoffice/rentals/leases/lse_rb_0007', 'rent-lease-360');
  await shot(page, 'c01-own-draft-awaiting-second-person-1440-en');
  await as(page, 'rb_accounts', '/backoffice/rentals/leases/lse_rb_0007', 'rent-lease-360');
  await api(page, '/rentals/leases/lse_rb_0007/activate');
  await as(page, 'rb_accounts', '/backoffice/rentals/leases/lse_rb_0007', 'rent-lease-360');
  await shot(page, 'c02-activated-own-payer-account-1440-en');
  await as(page, 'rb_manager', '/backoffice/rentals/rent-roll?period=2026-11', 'rent-roll');
  await api(page, '/rentals/rent-roll/2026-11/preview');
  await as(page, 'rb_finance', '/backoffice/rentals/rent-roll?period=2026-11', 'roll-approve');
  await page.getByTestId('roll-approve').click();
  await page.getByTestId('roll-approve-ack').click();
  await shot(page, 'c03-roll-approval-acknowledgement-1440-en', false);
  await page.getByTestId('roll-approve-confirm').click();
  await page.getByTestId('rent-roll').and(page.locator('[data-state="approved"]')).waitFor();
  await settle(page);
  await shot(page, 'c04-roll-approved-demand-not-posted-1440-en');
  await as(page, 'rb_accounts', '/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10', 'statement');
  await api(page, '/rentals/owner-statements/issue', { ownerId: 'own_rb_tahira', period: '2026-10' });
  await as(page, 'rb_accounts', '/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10', 'statement-frozen');
  await shot(page, 'c05-statement-issued-frozen-1440-en');
  await as(page, 'rb_landlord_tahira', '/customer/portal/rentals?statement=ost_rb_0002', 'landlord-statement-totals', 'customer');
  await shot(page, 'c06-landlord-opens-issued-statement-1440-en', false);
  await page.context().close();
});

test('who sees what: a Court-only manager, rentals withdrawn, a tenant with no landlord view, an unsigned agreement (1440, en)', async ({ browser }) => {
  const page = await context(browser, VIEWPORTS.desktop);
  await page.addInitScript(() => sessionStorage.setItem('demo:site-scope', JSON.stringify({ rb_manager: ['site_rb_court'] })));
  await as(page, 'rb_manager', '/backoffice/rentals', 'rent-scope-limited');
  await shot(page, 'd01-court-only-manager-leases-1440-en');
  await as(page, 'rb_manager', '/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10', 'statement-limited');
  await shot(page, 'd02-court-only-statement-limited-1440-en');
  await as(page, 'rb_director', '/backoffice/rentals/settings', 'agreement-unsigned');
  await shot(page, 'd03-agreement-unsigned-draft-1440-en');
  await as(page, 'rb_tenant_adeel', '/customer/portal/rentals', 'landlord-unavailable', 'customer');
  await shot(page, 'd04-tenant-has-no-landlord-view-1440-en');
  await page.evaluate(() => sessionStorage.setItem('demo:withdrawn-modules', JSON.stringify(['rentals'])));
  await as(page, 'rb_landlord_tahira', '/customer/portal/rentals', 'landlord-unavailable', 'customer');
  await shot(page, 'd05-landlord-rentals-withdrawn-1440-en');
  // The withdrawal is per app (each app keeps its own tab storage): the office app too.
  await become(page, 'backoffice', 'rb_manager');
  await page.evaluate(() => sessionStorage.setItem('demo:withdrawn-modules', JSON.stringify(['rentals'])));
  await as(page, 'rb_manager', '/backoffice/rentals', 'access-outcome');
  await shot(page, 'd06-rentals-not-in-plan-1440-en');
  await page.context().close();
});

test('768 × 1024 (en): leases and Lease 360', async ({ browser }) => {
  const page = await context(browser, VIEWPORTS.tablet);
  await as(page, 'rb_manager', '/backoffice/rentals', 'rent-lease-list');
  await shot(page, 'e01-leases-768-en');
  await as(page, 'rb_manager', '/backoffice/rentals/leases/lse_rb_0002', 'rent-lease-360');
  await shot(page, 'e02-lease-360-768-en');
  await page.context().close();
});

test('320 × 700, Urdu and English, 200 % text: leases, Lease 360, rent roll, statement and the landlord view (viewport captures)', async ({ browser }) => {
  test.setTimeout(180_000);
  for (const locale of ['ur-PK', 'en-PK'] as Locale[]) {
    const page = await context(browser, { width: 320, height: 700 }, locale, false, 2);
    for (const [name, persona, path, ready] of [
      ['f01-leases', 'rb_manager', '/backoffice/rentals', 'rent-lease-list'],
      ['f02-lease-360', 'rb_manager', '/backoffice/rentals/leases/lse_rb_0005', 'rent-lease-360'],
      ['f03-rent-roll', 'rb_finance', '/backoffice/rentals/rent-roll?period=2026-10', 'roll-lines'],
      ['f04-statement', 'rb_accounts', '/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10', 'statement'],
    ] as Array<[string, PersonaId, string, string]>) {
      await as(page, persona, path, ready);
      await shot(page, `${name}-200pct-320-${lang(locale)}`, false);
    }
    await as(page, 'rb_landlord_tahira', '/customer/portal/rentals', 'landlord-properties', 'customer');
    await shot(page, `f05-landlord-200pct-320-${lang(locale)}`, false);
    await page.context().close();
  }
});

test('dark mode with high contrast: leases and the rent roll (390, ur)', async ({ browser }) => {
  const page = await context(browser, VIEWPORTS.phone, 'ur-PK');
  for (const persona of ['rb_manager', 'rb_finance'] as PersonaId[]) {
    await as(page, persona, '/backoffice/global/accessibility-preferences', 'hub-theme');
    await page.getByTestId('hub-theme-dark').click();
    await page.getByTestId('hub-contrast-high').click();
  }
  await as(page, 'rb_manager', '/backoffice/rentals', 'rent-lease-list');
  await shot(page, 'g01-leases-dark-contrast-390-ur');
  await as(page, 'rb_finance', '/backoffice/rentals/rent-roll?period=2026-10', 'roll-lines');
  await shot(page, 'g02-rent-roll-dark-contrast-390-ur');
  await page.context().close();
});

/**
 * Issue #17 closure: a reader who may not issue the statement sees why (R4, `owner_statement.issue`);
 * a landlord who may see only Riverbend Heights gets a labelled partial statement and nothing of
 * Court (P0; the demo's narrow-only site scope stands in for her ended Court link).
 */
test('Issue #17 closure: the read-only statement and the partial landlord view (1440, 390 and 320 px at 200 %, both languages)', async ({ browser }) => {
  test.setTimeout(240_000);
  const PARTIAL = () => sessionStorage.setItem('demo:site-scope', JSON.stringify({ rb_landlord_tahira: ['site_rb_heights'] }));
  const STATEMENT = '/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10';
  for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
    for (const [w, size] of [['1440', VIEWPORTS.desktop], ['390', VIEWPORTS.phone]] as const) {
      const page = await context(browser, size, locale);
      await page.addInitScript(PARTIAL);
      await as(page, 'rb_manager', STATEMENT, 'statement-issue-blocked');
      await shot(page, `h01-statement-read-only-reason-${w}-${lang(locale)}`);
      await as(page, 'rb_landlord_tahira', '/customer/portal/rentals', 'landlord-statement-partial', 'customer');
      await shot(page, `h02-landlord-partial-${w}-${lang(locale)}`);
      await as(page, 'rb_landlord_tahira', '/customer/portal/rentals?statement=ost_rb_0001', 'landlord-statement-limited', 'customer');
      await shot(page, `h03-landlord-partial-statement-${w}-${lang(locale)}`, false);
      await page.context().close();
    }
    const page = await context(browser, { width: 320, height: 700 }, locale, false, 2);
    await page.addInitScript(PARTIAL);
    await as(page, 'rb_manager', STATEMENT, 'statement-issue-blocked');
    await page.getByTestId('statement-issue-blocked').scrollIntoViewIfNeeded();
    await settle(page, 300);
    await shot(page, `h04-statement-read-only-reason-200pct-320-${lang(locale)}`, false);
    await as(page, 'rb_landlord_tahira', '/customer/portal/rentals', 'landlord-statement-partial', 'customer');
    await page.getByTestId('landlord-statement-partial').scrollIntoViewIfNeeded();
    await settle(page, 300);
    await shot(page, `h05-landlord-partial-200pct-320-${lang(locale)}`, false);
    await as(page, 'rb_landlord_tahira', '/customer/portal/rentals?statement=ost_rb_0001', 'landlord-statement-limited', 'customer');
    // The notice is taller than the drawer's visible part at 200 %: show its end (payout lines are left out).
    await page.getByTestId('landlord-statement-limited').evaluate((e) => e.scrollIntoView({ block: 'end' }));
    await settle(page, 300);
    await shot(page, `h06-landlord-partial-statement-200pct-320-${lang(locale)}`, false);
    await page.context().close();
  }
});

test('video: from a draft lease to an approved demand that cannot be posted, and a statement the landlord opens (desktop, en)', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await context(browser, VIEWPORTS.desktop, 'en-PK', true);
  await as(page, 'rb_manager', '/backoffice/rentals', 'rent-lease-list');
  await page.getByTestId('rent-new-lease').click();
  await page.getByTestId('wizard-unit').locator('input').fill('C-12');
  await page.getByRole('option', { name: /C-12/ }).click();
  await page.getByTestId('wizard-next').click();
  await page.waitForTimeout(600);
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-tenant').locator('input').fill('Hamid');
  await page.getByRole('option', { name: /Hamid Raza/ }).click();
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-from').fill('2026-11-01');
  await page.getByTestId('wizard-to').fill('2027-10-31');
  await page.getByTestId('wizard-rent').fill('55000');
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-deposit').fill('110000');
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-authority-reference').fill('MFP-AUTH-2026-10 (fictional)');
  await page.getByTestId('wizard-authority-date').fill('2026-10-25');
  await page.getByTestId('wizard-authority-confirm').click();
  await page.waitForTimeout(600);
  await page.getByTestId('wizard-next').click();
  await page.waitForTimeout(800);
  await page.getByTestId('wizard-submit').click();
  await page.getByTestId('lease-own-draft').waitFor();
  await page.waitForTimeout(1200);
  await as(page, 'rb_accounts', '/backoffice/rentals/leases/lse_rb_0007', 'lease-activate');
  await page.getByTestId('lease-activate').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Activate lease' }).click();
  await page.locator('[data-testid="rent-lease-360"][data-state="active"]').waitFor();
  await page.waitForTimeout(1200);
  await as(page, 'rb_manager', '/backoffice/rentals/rent-roll?period=2026-11', 'roll-preview');
  await page.getByTestId('roll-preview').click();
  await page.locator('[data-testid="rent-roll"][data-state="draft"]').waitFor();
  await page.waitForTimeout(1200);
  await as(page, 'rb_finance', '/backoffice/rentals/rent-roll?period=2026-11', 'roll-approve');
  await page.getByTestId('roll-approve').click();
  await page.getByTestId('roll-approve-ack').click();
  await page.waitForTimeout(600);
  await page.getByTestId('roll-approve-confirm').click();
  await page.locator('[data-testid="rent-roll"][data-state="approved"]').waitFor();
  await page.getByTestId('roll-posting-partial').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await as(page, 'rb_accounts', '/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10', 'statement-issue');
  await page.getByTestId('statement-issue').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Issue to the owner' }).click();
  await page.getByTestId('statement-frozen').waitFor();
  await page.waitForTimeout(1200);
  await as(page, 'rb_finance', '/backoffice/rentals/payouts', 'payouts-partial');
  await page.waitForTimeout(1500);
  await as(page, 'rb_landlord_tahira', '/customer/portal/rentals', 'landlord-properties', 'customer');
  await page.getByTestId('landlord-statement-open').first().click();
  await page.getByTestId('landlord-statement-totals').waitFor();
  await page.waitForTimeout(1500);
  await saveVideo(page, 's3-draft-lease-to-approved-demand-and-issued-statement-desktop-en');
});
