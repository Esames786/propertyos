import type { Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, displayKey, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { focusWalk, layoutProblems } from '../support/layout';
import { societyApi as api } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate S.3 rentals through both apps, with Riverbend Estate Managers' fictional people: Sadia
 * (portfolio manager) drafts leases and prepares rent rolls; Usman (client-money accounts officer)
 * activates leases someone else drafted and issues statements; Naila (finance controller) approves
 * rolls and agreement versions; Faisal (director) drafts agreement versions. Tahira and Kashif are
 * landlords in the resident app; Adeel rents a flat. The rules are the server's
 * (rentals.api.test.ts, rentals.vectors.json); these tests check that the screens carry them. The
 * demo's business date is Monday 26 October 2026.
 */
const PHONE = { width: 320, height: 700 };
const OFFICE_HEADER = '[data-testid="app-header"]';
const OFFICE_BAR = '[data-testid="bottom-nav"]';
const OFFICE_DISPLAY = (principal: string) => `pref:display:v1:backoffice:tnt_riverbend:${principal}`;
const STAFF: Record<string, string> = { rb_director: 'usr_rb_0001', rb_manager: 'usr_rb_0002', rb_finance: 'usr_rb_0003', rb_accounts: 'usr_rb_0004' };

const onboarding = (persona: string, app: string) =>
  JSON.stringify({ profile: { tenantId: 'tnt_riverbend', personaId: persona, app, welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

/** Become another Riverbend person in an app (each app keeps its own session). */
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

async function office(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function portal(page: Page, persona: PersonaId, ready: string, path = '/customer/portal/rentals') {
  await become(page, 'customer', persona);
  await page.goto(`${CU}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function start(page: Page, persona: PersonaId = 'rb_manager', locale: Locale = 'en-PK', app: 'backoffice' | 'customer' = 'backoffice') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await seed(page, { persona, locale, app });
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** Text with references: the screens keep a word joiner after each hyphen (so a reference never breaks). */
const wj = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '-\u2060?'));
const lease = (page: Page, ref: string) => page.locator(`[data-testid="rent-lease"][data-ref="${ref}"]`);

async function confirm(page: Page, button: RegExp | string, note?: string) {
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  if (note) await dialog.locator('textarea').fill(note);
  await dialog.getByRole('button', { name: button }).click();
  await expect(dialog).toHaveCount(0);
}

/** Wording: nothing in rentals ever reads as paid, sent, received or collected money. */
async function neverPaid(page: Page) {
  const text = (await page.locator('main').innerText()).replace(/not money received or paid|not (sent|paid|invoiced|collected|settled)|nor (sent|paid)|never (sent|paid)|none is sent or paid|neither sent|no payment|sent or paid|invoiced, collected or paid|invoiced, collected or settled|paid out to the owner|paid to the owner|paid from/gi, '');
  expect(text).not.toMatch(/\b(paid|sent|received|collected)\b/i);
}

test.describe('S.3 reference flow: draft → second-person activation → rent roll → statement → landlord view', () => {
  test('Sadia drafts a lease, Usman activates it; Sadia previews November, Naila approves a demand that cannot be posted; Usman issues a statement Tahira opens; nothing is paid', async ({ page, consoleErrors }) => {
    test.setTimeout(240_000);
    await start(page);
    await office(page, 'rb_manager', '/backoffice/rentals', 'rent-lease-list');
    // RNT-001: contract and demand figures; the settled payable is 0.00.
    await expect(page.getByTestId('rent-boundary')).toContainText('never mix');
    await expect(page.getByTestId('rent-kpi-active')).toContainText('4');
    await expect(page.getByTestId('rent-kpi-due')).toContainText('approved demand — not invoiced, not collected');
    await expect(page.getByTestId('rent-kpi-payable')).toContainText('nothing is settled');
    await expect(page.getByTestId('rent-lease')).toHaveCount(6);
    await page.getByTestId('rent-filter').getByText('Ending in 60 days').click();
    await expect(page.getByTestId('rent-lease')).toHaveCount(1);
    await expect(lease(page, 'RB-LS-0002')).toBeVisible();
    await page.getByTestId('rent-filter').getByText('All').click();
    // Wait for the filter to apply before typing (each change replaces the address).
    await expect(page.getByTestId('rent-lease')).toHaveCount(6);
    await page.getByTestId('rent-search').fill('Mirza');
    await expect(page).toHaveURL(/q=Mirza/);
    await expect(page.getByTestId('rent-lease')).toHaveCount(1);
    await expect(lease(page, 'RB-LS-0003')).toBeVisible();
    await page.getByTestId('rent-search').fill('');
    // Each KPI opens its records.
    await page.getByTestId('rent-kpi-active').click();
    await expect(page).toHaveURL(/status=active/);
    await expect(page.getByTestId('rent-lease')).toHaveCount(4);

    // RNT-003: the wizard. Riverbend Villas is never offered; the issuing model comes from the agreement.
    await page.getByTestId('rent-new-lease').click();
    await expect(page.getByTestId('wizard-step-unit')).toBeVisible();
    await page.getByTestId('wizard-unit').locator('input').fill('C-12');
    await page.getByRole('option', { name: /C-12/ }).click();
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('wizard-model')).toHaveAttribute('data-model', 'principal');
    await expect(page.getByTestId('wizard-share-total')).toHaveAttribute('data-total', '10000');
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-tenant').locator('input').fill('Hamid');
    await page.getByRole('option', { name: /Hamid Raza/ }).click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-from').fill('2026-11-01');
    await page.getByTestId('wizard-to').fill('2027-10-31');
    await page.getByTestId('wizard-rent').fill('55000');
    await page.getByTestId('wizard-next').click();
    // Above the agreement's cap: the server's problem comes back on the deposit step.
    await page.getByTestId('wizard-deposit').fill('200000');
    await page.getByTestId('wizard-next').click();
    await expect(page.getByTestId('wizard-payer')).toContainText('Hamid Raza');
    await page.getByTestId('wizard-authority-reference').fill('MFP-AUTH-2026-10 (fictional)');
    await page.getByTestId('wizard-authority-date').fill('2026-10-25');
    await page.getByTestId('wizard-authority-confirm').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-submit').click();
    await expect(page.getByTestId('wizard-deposit')).toBeVisible();
    await expect(page.getByTestId('wizard-deposit')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('above the agreement’s cap of 2 months’ rent').first()).toBeVisible();
    await page.getByTestId('wizard-deposit').fill('110000');
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-submit').click();
    await expect(page.getByTestId('rent-lease-360')).toHaveAttribute('data-state', 'review');
    await expect(page.getByTestId('lease-own-draft')).toBeVisible();
    await expect(page.getByTestId('lease-activate')).toHaveCount(0);
    const ref = await page.getByTestId('rent-lease-360').getAttribute('data-ref');
    expect(ref).toBe('RB-LS-0007');
    const id = 'lse_rb_0007';

    // A second person activates it; it gets its own payer account (kind lease); nothing is invoiced.
    await office(page, 'rb_accounts', `/backoffice/rentals/leases/${id}`, 'rent-lease-360');
    await page.getByTestId('lease-activate').click();
    await confirm(page, 'Activate lease');
    await expect(page.getByTestId('rent-lease-360')).toHaveAttribute('data-state', 'active');
    await expect(page.getByTestId('lease-tab-terms')).toContainText(wj('RB-LA-0007 (kind lease)'));
    await page.getByRole('tab', { name: 'Rent schedule' }).click();
    await expect(page.locator('[data-testid="lease-schedule"] li').first()).toHaveAttribute('data-roll', 'not_prepared');
    await page.getByRole('tab', { name: 'Invoices and payments' }).click();
    await expect(page.getByTestId('lease-invoices-partial')).toContainText('posting is not connected');
    await page.getByRole('tab', { name: 'Issuing model' }).click();
    await expect(page.getByTestId('lease-issuing')).toContainText('Mirza Family Properties (Pvt) Ltd (Demo)');
    await expect(page.getByTestId('rent-d33')).toBeVisible();

    // RNT-004: Sadia previews November; she cannot approve; Naila approves a demand; no post control.
    await office(page, 'rb_manager', '/backoffice/rentals/rent-roll?period=2026-11', 'rent-roll');
    await expect(page.getByTestId('rent-roll')).toHaveAttribute('data-state', 'not_prepared');
    await page.getByTestId('roll-preview').click();
    await expect(page.getByTestId('rent-roll')).toHaveAttribute('data-state', 'draft');
    await expect(page.getByTestId('roll-line')).toHaveCount(5);
    await expect(page.getByTestId('roll-total')).toContainText('328,000.00');
    await expect(page.getByTestId('roll-approve')).toHaveCount(0);
    await office(page, 'rb_finance', '/backoffice/rentals/rent-roll?period=2026-11', 'rent-roll');
    await page.getByTestId('roll-approve').click();
    await expect(page.getByTestId('roll-approve-confirm')).toBeDisabled();
    await page.getByTestId('roll-approve-ack').click();
    await page.getByTestId('roll-approve-confirm').click();
    await expect(page.getByTestId('rent-roll')).toHaveAttribute('data-state', 'approved');
    await expect(page.getByTestId('roll-state').first()).toContainText('Approved demand — not invoiced');
    await expect(page.getByTestId('roll-posting-partial')).toContainText('cannot be posted as invoices');
    await expect(page.getByRole('button', { name: /post/i })).toHaveCount(0);
    expect((await api(page, '/rentals/rent-roll/2026-11/post', 'POST')).ok).toBe(false);
    await neverPaid(page);

    // RNT-005: Usman issues Tahira's October statement; the payable counts settled money only.
    await office(page, 'rb_accounts', '/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10', 'statement');
    await expect(page.getByTestId('statement-closing')).toHaveAttribute('data-amount', '0.00');
    await expect(page.getByTestId('statement-settled-none')).toBeVisible();
    await expect(page.locator('[data-testid="statement-line"][data-kind="deposit_held"]')).toHaveCount(2);
    await page.getByTestId('statement-issue').click();
    await confirm(page, 'Issue to the owner');
    await expect(page.getByTestId('statement')).toHaveAttribute('data-state', 'issued');
    await expect(page.getByTestId('statement-frozen')).toBeVisible();
    await neverPaid(page);

    // PORTAL-037: Tahira sees her two let flats and both issued statements.
    await portal(page, 'rb_landlord_tahira', 'landlord');
    await expect(page.getByTestId('landlord-property')).toHaveCount(2);
    await expect(page.getByTestId('landlord-statement')).toHaveCount(2);
    await page.getByTestId('landlord-statement').first().getByTestId('landlord-statement-open').click();
    await expect(page.getByTestId('landlord-statement-detail')).toBeVisible();
    await expect(page.getByTestId('landlord-statement-totals')).toContainText('0.00');
    await page.keyboard.press('Escape');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.3 agreements, renewal, termination, deposits and payouts', () => {
  test('a co-owner’s unsigned agreement blocks activation until Faisal records the signature and Naila approves it', async ({ page, consoleErrors }) => {
    test.setTimeout(180_000);
    await start(page, 'rb_accounts');
    await office(page, 'rb_accounts', '/backoffice/rentals/leases/lse_rb_0005', 'rent-lease-360');
    await expect(page.locator('[data-blocker="agreement_unsigned"]')).toBeVisible();
    await expect(page.getByTestId('lease-activate')).toHaveCount(0);
    await office(page, 'rb_director', '/backoffice/rentals/settings', 'rent-settings');
    const nida = page.locator('[data-testid="agreement"][data-ref="RB-MA-0004"]');
    await expect(nida.getByTestId('agreement-unsigned')).toBeVisible();
    await nida.getByTestId('agreement-draft-open').click();
    await page.getByTestId('agreement-reference').fill('RB-MA-2026-044 (fictional)');
    await page.getByTestId('agreement-signed-date').fill('2026-10-26');
    await page.getByTestId('agreement-draft-save').click();
    await expect(nida.getByTestId('agreement-unsigned')).toHaveCount(0);
    // The drafter cannot approve his own draft.
    await expect(nida.getByTestId('agreement-approve')).toHaveCount(0);
    await office(page, 'rb_finance', '/backoffice/rentals/settings', 'rent-settings');
    await nida.getByTestId('agreement-approve').click();
    await page.getByTestId('agreement-approve-ack').click();
    await page.getByTestId('agreement-approve-confirm').click();
    await expect(nida.locator('[data-version="1"]')).toHaveAttribute('data-state', 'scheduled');
    await office(page, 'rb_accounts', '/backoffice/rentals/leases/lse_rb_0005', 'rent-lease-360');
    await page.getByTestId('lease-activate').click();
    await confirm(page, 'Activate lease');
    await expect(page.getByTestId('rent-lease-360')).toHaveAttribute('data-state', 'active');
    await page.getByRole('tab', { name: 'Issuing model' }).click();
    await expect(page.getByTestId('lease-issuing')).toContainText(wj('OSL-0003, OSL-0004'));
    expect(consoleErrors).toEqual([]);
  });

  test('renewal (RNT-008) adds a version bound to the agreement then in force; an early end stops the schedule; the deposit refund (RNT-009) is not available', async ({ page, consoleErrors }) => {
    test.setTimeout(180_000);
    await start(page);
    await office(page, 'rb_manager', '/backoffice/rentals/leases/lse_rb_0002', 'rent-lease-360');
    await page.getByTestId('lease-renew-open').click();
    await page.getByTestId('lease-renew-to').fill('2027-12-15');
    await page.getByTestId('lease-renew-rent').fill('64000');
    await page.getByTestId('lease-renew-reason').fill('Too short');
    await page.getByTestId('lease-renew-save').click();
    await expect(page.getByTestId('lease-renew-reason')).toHaveAttribute('aria-invalid', 'true');
    await page.getByTestId('lease-renew-reason').fill('Tenant renews for a year at the agreed rent.');
    await page.getByTestId('lease-renew-save').click();
    await expect(page.getByTestId('lease-renew')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Renewal and termination' }).click();
    await expect(page.locator('[data-testid="lease-versions"] [data-version="2"]')).toContainText(wj('RB-MA-0001 version 2'));
    await expect(page.locator('[data-testid="lease-versions"] [data-version="1"]')).toContainText(wj('RB-MA-0001 version 1'));

    await page.goto(`${BO}/backoffice/rentals/leases/lse_rb_0001`);
    await page.getByTestId('lease-terminate-open').click();
    await page.getByTestId('lease-terminate-date').fill('2026-11-30');
    await page.getByTestId('lease-terminate-reason').fill('Tenant gave notice; the owner agreed to end early.');
    await page.getByTestId('lease-terminate-save').click();
    await expect(page.getByTestId('lease-terminating')).toBeVisible();
    await page.getByRole('tab', { name: 'Rent schedule' }).click();
    await expect(page.locator('[data-testid="lease-schedule"] li').last()).toHaveAttribute('data-period', '2026-11');

    await page.goto(`${BO}/backoffice/rentals/leases/lse_rb_0004?tab=deposit`);
    await expect(page.getByTestId('lease-deposit')).toHaveAttribute('data-state', 'awaiting_evidence');
    await page.getByTestId('lease-refund-open').click();
    await expect(page.getByTestId('lease-refund-partial')).toContainText('nothing can be refunded');
    await expect(page.getByTestId('lease-refund').getByTestId('rent-settlement')).toHaveAttribute('data-state', 'not_settled');
    expect(consoleErrors).toEqual([]);
  });

  test('payouts (RNT-006): nothing settled means nothing to instruct; no control sends, settles or pays', async ({ page, consoleErrors }) => {
    await start(page, 'rb_accounts');
    await office(page, 'rb_accounts', '/backoffice/rentals/payouts', 'rent-payouts');
    await expect(page.getByTestId('payouts-partial')).toContainText('Not settled — no evidence');
    await expect(page.getByTestId('payout-owner')).toHaveCount(3);
    await expect(page.locator('[data-testid="payout-owner"][data-owner="own_rb_tahira"] [data-hold="no_settled_money"]')).toBeVisible();
    await expect(page.locator('[data-testid="payout-owner"][data-owner="own_rb_mirza"] [data-hold="principal_model"]')).toBeVisible();
    await expect(page.getByTestId('payout-prepare-open')).toHaveCount(0);
    await expect(page.getByTestId('payout-available').first()).toHaveAttribute('data-amount', '0.00');
    await expect(page.getByTestId('payout-settlement-needs')).toContainText('statement imported for that account');
    await expect(page.getByRole('button', { name: /settle|mark (as )?paid|send/i })).toHaveCount(0);
    // The server refuses an instruction above what is left (0.00), and has no settlement route at all.
    const over = await api(page, '/rentals/payouts', 'POST', { ownerId: 'own_rb_tahira', amount: '1.00', note: 'Monthly payout' });
    expect(over).toMatchObject({ ok: false, code: 'exceeds_available' });
    expect(await api(page, '/rentals/payouts/opi_rb_0001/settle', 'POST')).toMatchObject({ ok: false, status: 404 });
    await neverPaid(page);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('S.3 scope, licensing and Rule R', () => {
  test('a manager limited to Riverbend Court sees Court leases only, is told so, and cannot prepare the rent roll', async ({ page, consoleErrors }) => {
    await start(page);
    await page.addInitScript(() => sessionStorage.setItem('demo:site-scope', JSON.stringify({ rb_manager: ['site_rb_court'] })));
    await office(page, 'rb_manager', '/backoffice/rentals', 'rent-lease-list');
    await expect(page.getByTestId('rent-scope-limited')).toBeVisible();
    await expect(page.getByTestId('rent-lease')).toHaveCount(2);
    await expect(page.locator('[data-testid="rent-lease"][data-site="site_rb_heights"]')).toHaveCount(0);
    await page.goto(`${BO}/backoffice/rentals/leases/lse_rb_0001`);
    await expect(page.getByTestId('state-error').or(page.getByTestId('state-not-found')).first()).toBeVisible();
    await page.goto(`${BO}/backoffice/rentals/rent-roll?period=2026-11`);
    await expect(page.getByTestId('roll-limited')).toBeVisible();
    await expect(page.getByTestId('roll-preview')).toHaveCount(0);
    await page.goto(`${BO}/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10`);
    await expect(page.getByTestId('statement-limited')).toBeVisible();
    await expect(page.getByTestId('statement-issue')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('without the rentals add-on the screens say "not in your plan"; other organisations never see rentals', async ({ page, consoleErrors }) => {
    await start(page);
    await page.addInitScript(() => sessionStorage.setItem('demo:withdrawn-modules', JSON.stringify(['rentals'])));
    await become(page, 'backoffice', 'rb_manager');
    for (const path of ['/backoffice/rentals', '/backoffice/rentals/rent-roll', '/backoffice/rentals/payouts']) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId('access-outcome'), path).toHaveAttribute('data-module', 'rentals');
    }
    await become(page, 'backoffice', 'alnoor_manager');
    await page.goto(`${BO}/backoffice/home/role-aware-dashboard`);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rentals & owners' })).toHaveCount(0);
    await page.goto(`${BO}/backoffice/rentals`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-module', 'rentals');
    expect(consoleErrors).toEqual([]);
  });

  test('Rule R in the resident app: Kashif sees his verified flat only; Adeel (a tenant) has no landlord view; another landlord’s statement stays closed; a withdrawn add-on closes the view', async ({ page, consoleErrors }) => {
    await start(page, 'rb_landlord_kashif', 'en-PK', 'customer');
    await portal(page, 'rb_landlord_kashif', 'landlord');
    await expect(page.getByTestId('landlord-property')).toHaveCount(1);
    await expect(page.locator('[data-testid="landlord-property"][data-unit="C-11"]')).toContainText('Rizwan Ali');
    await expect(page.getByTestId('landlord-no-statements')).toBeVisible();
    // Tahira's statement by its id: the same "not available" as an id never issued.
    await page.goto(`${CU}/customer/portal/rentals?statement=ost_rb_0001`);
    await expect(page.getByTestId('landlord-statement-detail')).toContainText('not available to you');
    await page.keyboard.press('Escape');
    await portal(page, 'rb_tenant_adeel', 'landlord-unavailable');
    await expect(page.getByTestId('landlord-unavailable')).toHaveAttribute('data-reason', 'no_landlord_link');
    // The buyer's pages lead a landlord-edition person to the landlord view.
    await page.goto(`${CU}/customer/portal/payments-dashboard`);
    await expect(page).toHaveURL(/\/customer\/portal\/rentals/);
    await page.evaluate(() => sessionStorage.setItem('demo:withdrawn-modules', JSON.stringify(['rentals'])));
    await portal(page, 'rb_landlord_tahira', 'landlord-unavailable');
    await expect(page.getByTestId('landlord-unavailable')).toHaveAttribute('data-reason', 'module_not_licensed');
    expect(consoleErrors.filter((e) => !/403|404|Failed to load resource/.test(e))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Both languages, every width, 320 px at 200 %, dark mode with high contrast, the keyboard
// ---------------------------------------------------------------------------------------------

const SCREENS: Array<[string, PersonaId, string, string]> = [
  ['leases', 'rb_manager', '/backoffice/rentals', 'rent-lease-list'],
  ['lease-360', 'rb_manager', '/backoffice/rentals/leases/lse_rb_0005', 'rent-lease-360'],
  ['lease-schedule', 'rb_manager', '/backoffice/rentals/leases/lse_rb_0006?tab=schedule', 'lease-schedule'],
  ['wizard', 'rb_manager', '/backoffice/rentals/leases/new?unit=unt_rb_c12', 'wizard-step-unit'],
  ['rent-roll', 'rb_finance', '/backoffice/rentals/rent-roll?period=2026-10', 'roll-lines'],
  ['statements', 'rb_accounts', '/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10', 'statement-memo-lines'],
  ['payouts', 'rb_finance', '/backoffice/rentals/payouts', 'payout-owners'],
  ['settings', 'rb_finance', '/backoffice/rentals/settings', 'agreement'],
];

const lang = (locale: Locale) => (locale === 'ur-PK' ? 'ur' : 'en');

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`S.3 screens in ${lang(locale)}: axe at 1440, 768 and 390 px, no sideways scroll`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(300_000);
    await start(page, 'rb_manager', locale);
    for (const [name, persona, path, ready] of SCREENS) {
      await become(page, 'backoffice', persona);
      for (const [vp, size] of [['1440', VIEWPORTS.desktop], ['768', VIEWPORTS.tablet], ['390', VIEWPORTS.phone]] as const) {
        await page.setViewportSize(size);
        await page.goto(`${BO}${path}`);
        await expect(page.getByTestId(ready).first()).toBeVisible();
        await axe(page, testInfo, `${name}-${vp}-${locale}`);
        expect(await overflowOf(page), `${name} ${vp} ${locale}`).toBeLessThanOrEqual(0);
      }
    }
    await become(page, 'customer', 'rb_landlord_tahira');
    for (const [vp, size] of [['1440', VIEWPORTS.desktop], ['390', VIEWPORTS.phone]] as const) {
      await page.setViewportSize(size);
      await page.goto(`${CU}/customer/portal/rentals`);
      await expect(page.getByTestId('landlord-properties')).toBeVisible();
      await axe(page, testInfo, `landlord-${vp}-${locale}`);
      expect(await overflowOf(page), `landlord ${vp} ${locale}`).toBeLessThanOrEqual(0);
    }
    expect(consoleErrors).toEqual([]);
  });

  test(`320 × 700, ${lang(locale)}, text 200 %: every rentals screen, drawer and the landlord view are not clipped, spilled or broken mid-word`, async ({ page, consoleErrors }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(PHONE);
    await start(page, 'rb_manager', locale);
    for (const principal of Object.values(STAFF)) await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: OFFICE_DISPLAY(principal) });
    for (const [name, persona, path, ready] of SCREENS) {
      await become(page, 'backoffice', persona);
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      expect(await layoutProblems(page), `${name} ${lang(locale)} 200 %`).toEqual([]);
    }
    await become(page, 'backoffice', 'rb_manager');
    await page.goto(`${BO}/backoffice/rentals/leases/lse_rb_0001`);
    for (const [open, drawer] of [['lease-renew-open', 'lease-renew'], ['lease-terminate-open', 'lease-terminate']] as const) {
      await page.getByTestId(open).click();
      await expect(page.getByTestId(drawer)).toBeVisible();
      expect(await layoutProblems(page.getByTestId(drawer)), `${drawer} ${lang(locale)}`).toEqual([]);
      await page.keyboard.press('Escape');
    }
    await page.goto(`${BO}/backoffice/rentals/leases/lse_rb_0004?tab=deposit&drawer=refund`);
    expect(await layoutProblems(page.getByTestId('lease-refund')), `refund ${lang(locale)}`).toEqual([]);
    await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 1, textScale: 2, chosenAt: '2026-10-26T00:00:00Z' })), { key: displayKey('rb_landlord_tahira') });
    await become(page, 'customer', 'rb_landlord_tahira');
    await page.evaluate(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 1, textScale: 2, chosenAt: '2026-10-26T00:00:00Z' })), { key: displayKey('rb_landlord_tahira') });
    await page.goto(`${CU}/customer/portal/rentals`);
    await expect(page.getByTestId('landlord-properties')).toBeVisible();
    expect(await layoutProblems(page), `landlord ${lang(locale)} 200 %`).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test(`dark mode with high contrast (${lang(locale)}, 390 px): the rentals screens pass axe with nothing clipped`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize(VIEWPORTS.phone);
    await start(page, 'rb_manager', locale);
    const html = (name: string) => page.evaluate((n) => document.documentElement.getAttribute(n), name);
    for (const persona of ['rb_manager', 'rb_finance', 'rb_accounts'] as const) {
      await office(page, persona, '/backoffice/global/accessibility-preferences', 'hub-theme');
      await page.getByTestId('hub-theme-dark').click();
      await page.getByTestId('hub-contrast-high').click();
      await expect.poll(() => html('data-contrast')).toBe('high');
      await expect.poll(() => html('data-theme')).toBe('dark');
    }
    for (const [name, persona, path, ready] of SCREENS) {
      await become(page, 'backoffice', persona);
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      await axe(page, testInfo, `${name}-390-dark-contrast-${locale}`);
      expect(await layoutProblems(page), `${name} dark ${lang(locale)}`).toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
  });

  test(`320 × 700, ${lang(locale)}, 200 %: the keyboard reaches every control of the leases, Lease 360 and the rent roll without the header or bar covering it`, async ({ page, consoleErrors }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(PHONE);
    await start(page, 'rb_manager', locale);
    for (const principal of Object.values(STAFF)) await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: OFFICE_DISPLAY(principal) });
    for (const [name, persona, path, ready] of [SCREENS[0]!, SCREENS[1]!, SCREENS[4]!]) {
      await become(page, 'backoffice', persona);
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      const stops = await focusWalk(page, { header: OFFICE_HEADER, bar: OFFICE_BAR, max: 60 });
      expect(stops.length, `${name}: controls reached`).toBeGreaterThan(2);
      expect(stops.filter((s) => s.issue), `${name} ${lang(locale)}`).toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
  });
}
