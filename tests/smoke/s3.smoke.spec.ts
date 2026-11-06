import type { Page } from '@playwright/test';
import { BO, CU, displayKey, expect, seed, test, waitForApp, type PersonaId } from '../support/fixtures';
import { layoutProblems } from '../support/layout';
import { societyApi } from '../support/society';

/**
 * Gate S.3 cross-browser smoke (Firefox and WebKit projects): a lease activated by a second person,
 * the November rent roll previewed and approved as a demand that cannot be posted, the landlord's
 * view; the leases and the rent roll at 320 px with 200 % text in Urdu. The full checks run in
 * Chromium (tests/e2e/s3.spec.ts). Business date: 26 October 2026.
 */
const onboarding = (persona: string, app: string) =>
  JSON.stringify({ profile: { tenantId: 'tnt_riverbend', personaId: persona, app, welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

async function at(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
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

async function as(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await waitForApp(page);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

/** Firefox's own cancelled font request (NS_BINDING_ABORTED) is the browser, not the app. */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

async function confirm(page: Page, button: RegExp | string) {
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: button }).click();
  await expect(dialog).toHaveCount(0);
}

test('a lease activated by a second person; November previewed and approved as a demand that cannot be posted; the landlord view', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await at(page);
  await seed(page, { persona: 'rb_manager' });
  await as(page, 'rb_manager', '/backoffice/rentals', 'rent-lease-list');
  const draft = await societyApi(page, '/rentals/leases', 'POST', { unitId: 'unt_rb_c12', landlords: [{ ownerId: 'own_rb_mirza', share: '100.00' }], tenantPartyId: 'pty_rb_0016', model: 'principal', from: '2026-11-01', to: '2027-10-31', rent: '55000.00', dueDay: 1, deposit: '110000.00', authority: { reference: 'MFP-AUTH-2026-10 (fictional)', date: '2026-10-25', confirmed: true } });
  expect(draft.ok).toBe(true);
  expect((await societyApi(page, '/rentals/leases/lse_rb_0007/submit', 'POST')).ok).toBe(true);
  await as(page, 'rb_accounts', '/backoffice/rentals/leases/lse_rb_0007', 'lease-activate');
  await page.getByTestId('lease-activate').click();
  await confirm(page, 'Activate lease');
  await expect(page.getByTestId('rent-lease-360')).toHaveAttribute('data-state', 'active');
  await as(page, 'rb_manager', '/backoffice/rentals/rent-roll?period=2026-11', 'roll-preview');
  await page.getByTestId('roll-preview').click();
  await expect(page.getByTestId('rent-roll')).toHaveAttribute('data-state', 'draft');
  await as(page, 'rb_finance', '/backoffice/rentals/rent-roll?period=2026-11', 'roll-approve');
  await page.getByTestId('roll-approve').click();
  await page.getByTestId('roll-approve-ack').click();
  await page.getByTestId('roll-approve-confirm').click();
  await expect(page.getByTestId('rent-roll')).toHaveAttribute('data-state', 'approved');
  await expect(page.getByTestId('roll-posting-partial')).toBeVisible();
  for (const s of await page.getByTestId('rent-settlement').all()) await expect(s).toHaveAttribute('data-state', 'not_settled');
  await become(page, 'customer', 'rb_landlord_tahira');
  await page.goto(`${CU}/customer/portal/rentals`);
  await expect(page.getByTestId('landlord-property')).toHaveCount(2);
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('320 × 700, Urdu, 200 %: the leases and the rent roll are not clipped, spilled or broken mid-word', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await at(page);
  await page.setViewportSize({ width: 320, height: 700 });
  await seed(page, { persona: 'rb_manager', locale: 'ur-PK' });
  for (const p of ['usr_rb_0002', 'usr_rb_0003']) await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: `pref:display:v1:backoffice:tnt_riverbend:${p}` });
  await as(page, 'rb_manager', '/backoffice/rentals', 'rent-lease-list');
  expect(await layoutProblems(page), 'leases').toEqual([]);
  await as(page, 'rb_finance', '/backoffice/rentals/rent-roll?period=2026-10', 'roll-lines');
  expect(await layoutProblems(page), 'rent roll').toEqual([]);
  expect(appErrors(consoleErrors)).toEqual([]);
});
