import { mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { BO, CU, expect, HQ, seed, test, type Locale, type PersonaId, type SeedOptions } from '../support/fixtures';
import { seedSociety, societyApi, type SocietySeed } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * UX batch B2 evidence → docs/status/ux-b2/screenshots, in English and Urdu.
 * SH-01 the phone palette's Cancel; OPS-01 refusals inside the Request 360 drawer and dialog;
 * SH-02 stat tiles at 320 px / 200 % (nothing cut off; the names are in the tests, not the pixels);
 * SH-04 the household Relationship error; SH-10 a keyboard-focused tab panel; SH-11 the calendar;
 * dark mode with high contrast. Every phone capture is the viewport (its width is the one in the name).
 * Run against production builds:
 * `E2E_PORT_OFFSET=1200 npx playwright test --project=evidence tests/evidence/uxb2.evidence.spec.ts`.
 */
const DIR = 'docs/status/ux-b2/screenshots';
const IMRAN: PersonaId = 'alnoor_manager';
const DISPLAY_IMRAN = 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0001';
const PHONE = { width: 320, height: 700 };
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const LOCALES: Locale[] = ['en-PK', 'ur-PK'];

async function settle(page: Page, ms = 500) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function society(browser: Browser, viewport: { width: number; height: number }, seedWith: SocietySeed, scale?: number) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
  await seedSociety(page, seedWith);
  if (scale) await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: DISPLAY_IMRAN, scale });
  return page;
}

async function plain(browser: Browser, viewport: { width: number; height: number }, seedWith: SeedOptions) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
  await seed(page, seedWith);
  return page;
}

/** The viewport as the person sees it (phones and modals), or the whole page. */
const shot = (page: Page, name: string, full = false) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full });

async function requestId(page: Page, title: string, kind?: 'community_issue') {
  await page.goto(`${BO}/backoffice/mnt/maintenance-list`);
  await page.getByTestId('request-row').first().waitFor();
  const r = await societyApi<{ items: Array<{ id: string; title: string }> }>(page, '/ops/requests', 'GET', {}, { q: title, ...(kind ? { kind } : {}) });
  return (r.ok ? r.res.items : []).find((x) => x.title.includes(title))!.id;
}

/** Triage of the geyser request, refused because it was cancelled "in another tab". */
async function triageRefused(page: Page) {
  const id = await requestId(page, 'Geyser not heating');
  await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${id}&drawer=triage`);
  const drawer = page.getByTestId('triage-drawer');
  await drawer.waitFor();
  await drawer.locator('textarea').fill('Check the pilot light first');
  await societyApi(page, `/ops/requests/${id}/cancel`, 'POST', { reason: 'The resident fixed it herself.' });
  await drawer.getByTestId('triage-submit').click();
  await expect(drawer.getByTestId('refusal-alert')).toBeFocused();
  await settle(page);
}

/** Closing the balcony repair with a reason that is too short: refused inside the dialog. */
async function closeRefused(page: Page) {
  const id = await requestId(page, 'Balcony door lock broken');
  await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${id}&drawer=close`);
  const dialog = page.getByRole('alertdialog');
  await dialog.waitFor();
  await dialog.getByRole('textbox').fill('No reply');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(dialog.getByTestId('refusal-alert')).toBeFocused();
  await settle(page);
}

test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

for (const locale of LOCALES) {
  test(`SH-01 ${lang(locale)}: the phone palette's Cancel at 390 px and at 320 px with 200 % text`, async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await society(browser, VIEWPORTS.phone, { staff: IMRAN, locale });
    await page.goto(`${BO}/backoffice`);
    await page.getByTestId('society-dashboard').waitFor();
    await page.getByTestId('search-button').click();
    await page.getByTestId('command-palette-cancel').waitFor();
    await settle(page);
    await shot(page, `s01-palette-cancel-390-${lang(locale)}`);
    await page.close();

    const big = await society(browser, PHONE, { staff: IMRAN, locale }, 2);
    await big.goto(`${BO}/backoffice`);
    await big.getByTestId('society-dashboard').waitFor();
    await big.getByTestId('search-button').click();
    await big.keyboard.type('A-1');
    await big.getByTestId('command-palette').getByRole('menuitem').first().waitFor();
    await settle(big);
    await shot(big, `s02-palette-cancel-200pct-320-${lang(locale)}`);
    await big.close();
  });

  test(`OPS-01 ${lang(locale)}: refusals inside the triage drawer and the close dialog, at 1440 and at 320 px with 200 % text`, async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await society(browser, VIEWPORTS.desktop, { staff: IMRAN, locale });
    await triageRefused(page);
    await shot(page, `o01-triage-refused-1440-${lang(locale)}`);
    await closeRefused(page);
    await shot(page, `o02-close-refused-1440-${lang(locale)}`);
    await page.close();

    const big = await society(browser, PHONE, { staff: IMRAN, locale }, 2);
    await triageRefused(big);
    await shot(big, `o03-triage-refused-200pct-320-${lang(locale)}`);
    await closeRefused(big);
    await shot(big, `o04-close-refused-200pct-320-${lang(locale)}`);
    await big.close();
  });

  test(`SH-02 ${lang(locale)}: stat tiles at 320 px with 200 % text (values wrap, nothing cut off)`, async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await society(browser, PHONE, { staff: IMRAN, locale }, 2);
    await page.goto(`${BO}/backoffice`);
    await page.getByTestId('kpi-billed').waitFor();
    await page.getByTestId('kpi-billed').scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -12));
    await settle(page, 900);
    await shot(page, `m01-society-stat-tiles-200pct-320-${lang(locale)}`);
    await page.goto(`${BO}/backoffice/fin/finance-dashboard`);
    await page.getByTestId('fin-net').waitFor();
    await page.getByTestId('fin-collected').scrollIntoViewIfNeeded();
    await settle(page, 900);
    await shot(page, `m02-finance-stat-tiles-200pct-320-${lang(locale)}`);
    await page.close();
  });

  test(`SH-02 ${lang(locale)}: the HQ figures (ARR card not a link) at 390 px`, async ({ browser }) => {
    const page = await plain(browser, VIEWPORTS.phone, { app: 'platform', persona: 'supreme_admin', locale });
    await page.goto(`${HQ}/hq`);
    await page.getByTestId('hq-kpi-arr').scrollIntoViewIfNeeded();
    await settle(page, 900);
    await shot(page, `m03-hq-arr-card-390-${lang(locale)}`);
    await page.close();
  });

  test(`SH-04 ${lang(locale)}: the household Relationship error at its field, 1440 and 320 px with 200 % text`, async ({ browser }) => {
    const page = await society(browser, VIEWPORTS.desktop, { resident: 'alnoor_resident_a101', locale });
    await page.goto(`${CU}/customer/portal/household`);
    await page.getByTestId('household-submit').click();
    await page.getByTestId('household-relationship').scrollIntoViewIfNeeded();
    await settle(page);
    await shot(page, `f01-household-select-error-1440-${lang(locale)}`);
    await page.close();
    const big = await society(browser, PHONE, { resident: 'alnoor_resident_a101', locale, textScale: 2 });
    await big.goto(`${CU}/customer/portal/household`);
    await big.getByTestId('household-submit').click();
    await big.getByTestId('household-relationship').scrollIntoViewIfNeeded();
    await settle(big);
    await shot(big, `f02-household-select-error-200pct-320-${lang(locale)}`);
    await big.close();
  });

  test(`SH-10 and SH-11 ${lang(locale)}: a keyboard-focused tab panel; the calendar's month buttons`, async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await society(browser, VIEWPORTS.desktop, { staff: IMRAN, locale });
    const id = await requestId(page, 'AC drain leaking');
    await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${id}&tab=timeline`);
    const panel = page.getByRole('tabpanel');
    await panel.waitFor();
    await page.getByRole('tab', { selected: true }).focus();
    await page.keyboard.press('Tab');
    await expect(panel).toBeFocused();
    await settle(page);
    await shot(page, `t01-tab-panel-keyboard-focus-1440-${lang(locale)}`);
    await page.close();

    const crm = await plain(browser, VIEWPORTS.desktop, { persona: 'manager', locale });
    await crm.goto(`${BO}/backoffice/crm/lead-360-workspace?record=led_0033`);
    await crm.getByTestId('lead-schedule-visit').click();
    const visit = crm.getByTestId('schedule-visit-drawer');
    await visit.waitFor();
    await visit.getByTestId('schedule-visit-form').getByRole('group').first().getByRole('button').last().click();
    const calendar = crm.getByRole('dialog').filter({ has: crm.getByRole('grid') });
    await calendar.getByRole('button', { name: locale === 'ur-PK' ? 'اگلا مہینہ' : 'Next month', exact: true }).focus();
    await settle(crm);
    await shot(crm, `c01-calendar-month-buttons-1440-${lang(locale)}`);
    await crm.close();
  });

  test(`dark mode with high contrast ${lang(locale)}: the palette Cancel and the triage refusal at 390 px`, async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await society(browser, VIEWPORTS.phone, { staff: IMRAN, locale });
    await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
    await page.getByTestId('hub-theme-dark').click();
    await page.getByTestId('hub-contrast-high').click();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-contrast'))).toBe('high');
    await page.goto(`${BO}/backoffice`);
    await page.getByTestId('society-dashboard').waitFor();
    await page.getByTestId('search-button').click();
    await page.getByTestId('command-palette-cancel').waitFor();
    await settle(page);
    await shot(page, `d01-palette-cancel-dark-contrast-390-${lang(locale)}`);
    await page.keyboard.press('Escape');
    await triageRefused(page);
    await shot(page, `d02-triage-refused-dark-contrast-390-${lang(locale)}`);
    await page.close();
  });
}
