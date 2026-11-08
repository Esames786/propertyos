import { mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { layoutProblems } from '../support/layout';
import { BO, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';

/**
 * Gate E.0 evidence → docs/status/gate-e0/screenshots. E.0 adds no screen; it changes one state of an
 * existing one (INV-002 unit quick view, Issue #23): a colleague's hold is shown with the lead and the
 * expiry, and no Release button. Captured in English and Urdu at 1440 px, at 320 px with 200 % text
 * (`…-200pct-320-xx`) and in dark mode; plus the accounts officer's new Accounting menu entry.
 * Run against production builds: `E2E_PORT_OFFSET=1800 npx playwright test --project=evidence tests/evidence/gatee0.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-e0/screenshots';
const UNIT = 'unt_lh_a_0102';
const DISPLAY_BILAL = 'pref:display:v1:backoffice:tnt_larkspur:usr_lsp_0002';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');

async function shot(page: Page, name: string) {
  mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Nadia holds a Heights flat for a lead, then Bilal (same browser session) opens that lead's unit quick view. */
async function colleagueHold(browser: Browser, viewport: { width: number; height: number }, locale: Locale, options: { textScale2?: boolean; dark?: boolean } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await seed(page, { persona: 'manager', locale });
  await page.goto(`${BO}/backoffice/crm/leads-list`);
  await page.locator('main h1').first().waitFor();
  const lead = await page.evaluate(async (unit) => {
    const t = window.__prototype!.transport;
    const res = (await t.request({ method: 'GET', path: '/leads', query: { project: 'prj_heights' } })) as { items: Array<{ id: string; ref: string }> };
    await t.request({ method: 'POST', path: `/units/${unit}/hold`, body: { leadId: res.items[0]!.id } });
    return res.items[0]!;
  }, UNIT);
  await page.goto(`${BO}/backoffice/more`);
  await page.getByTestId('more-sign-out').click();
  await page.getByTestId('sign-in-sales').click();
  await page.getByTestId('welcome-explore').click();
  if (options.textScale2) await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), DISPLAY_BILAL);
  if (options.dark) {
    await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
    await page.getByTestId('hub-theme-dark').click();
  }
  await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=${lead.id}&unit=${UNIT}`);
  const quick = page.getByTestId('unit-quick-view');
  await quick.waitFor();
  await expect(quick.getByTestId('unit-release')).toHaveCount(0);
  await expect(quick).toContainText(lead.ref);
  return { page, quick, close: () => ctx.close() };
}

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`colleague's hold in the unit quick view, 1440 px (${lang(locale)})`, async ({ browser }) => {
    const { page, close } = await colleagueHold(browser, { width: 1440, height: 900 }, locale);
    await shot(page, `e0-q01-colleague-hold-1440-${lang(locale)}`);
    await close();
  });

  test(`colleague's hold at 320 px with 200 % text (${lang(locale)}): nothing clipped`, async ({ browser }) => {
    const { page, quick, close } = await colleagueHold(browser, { width: 320, height: 700 }, locale, { textScale2: true });
    expect(await layoutProblems(quick)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await shot(page, `e0-q02-colleague-hold-200pct-320-${lang(locale)}`);
    await close();
  });
}

test('colleague’s hold in dark mode, 1440 px (en)', async ({ browser }) => {
  const { page, close } = await colleagueHold(browser, { width: 1440, height: 900 }, 'en-PK', { dark: true });
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark')).toBe(true);
  await shot(page, 'e0-q03-colleague-hold-dark-1440-en');
  await close();
});

test('the accounts officer’s menu offers Accounting (the planned page until E.7 lands), 1440 px (en)', async ({ page }) => {
  await seed(page, { persona: 'lsp_accounts' as PersonaId });
  await page.goto(`${BO}/backoffice`);
  await page.locator('[data-tour-id="nav-primary"]').getByRole('link', { name: 'Accounting', exact: true }).waitFor();
  await shot(page, 'e0-n01-accounts-officer-menu-1440-en');
});
