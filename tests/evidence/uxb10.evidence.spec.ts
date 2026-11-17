import { mkdirSync, readFileSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { BO, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { keyboardFocus } from '../support/focus';
import { edgesOfFocused, focusedName, ringProblems } from '../support/ring-edges';
import { seedSociety, societyApi } from '../support/society';

/**
 * UX B10 (GitHub Issue #24) evidence → docs/status/ux-b10/screenshots. No accepted folder is written.
 * - t01: the Rentals owner-payable tile at 320 px with 200 % text, its whole label (F-INT-1);
 * - t02: the management home's KPI tiles at 320 px with 200 % text: "Collected" whole, its change badge on
 *   the next line (the same StatTile rule);
 * - t03: the HR dashboard's tiles at 1440 px with 200 % text, three-line labels whole;
 * - d01: the Rentals statement-issue dialog at 320 px with 200 % text after Tab from Close to Cancel, the path
 *   on which F-INT-3 found 37 % of Cancel's ring cut; the whole ring now shows (nothing scrolled by the test);
 * - d02: the same in dark mode with high contrast;
 * - d03: the dialog re-opened after a failed issue (the request lost on the way to the server), Cancel focused;
 * - d04: the second dialog, Request 360's close dialog with a refused reason inside it, Cancel focused.
 * English and Urdu; each name ends with the viewport width and the language. Business date Monday 26 October 2026.
 * Run against production builds: `E2E_PORT_OFFSET=2800 npx playwright test --project=evidence tests/evidence/uxb10.evidence.spec.ts`.
 */
const DIR = 'docs/status/ux-b10/screenshots';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const PHONE = { width: 320, height: 700 };
const display = (tenant: string, principal: string) => `pref:display:v1:backoffice:${tenant}:${principal}`;
const RB_STAFF = ['usr_rb_0001', 'usr_rb_0002', 'usr_rb_0003', 'usr_rb_0004'];
const COMMON_TEXT = (locale: Locale) => JSON.parse(readFileSync(`packages/i18n/locales/${locale}/common.json`, 'utf8')) as { actions: { cancel: string; close: string } };
const RENTALS_TEXT = (locale: Locale) => JSON.parse(readFileSync(`packages/i18n/locales/${locale}/rentals.json`, 'utf8')) as { statements: { issue: string } };

async function shot(page: Page, name: string) {
  const vw = page.viewportSize()!.width;
  await page.screenshot({ path: `${DIR}/${name}.png`, animations: 'disabled', caret: 'hide' });
  const m = /-(\d+)-(?:en|ur)$/.exec(name);
  if (m) expect(Number(m[1]), name).toBe(vw);
}

async function context(browser: Browser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  return { ctx, page, decoder: await ctx.newPage() };
}

async function textSize(page: Page, keys: string[], scale: number) {
  for (const key of keys) await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key, scale });
}

async function settle(page: Page, ms = 500) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

/** The focused control's ring is whole on every border (asserted before the picture is taken). */
async function whole(page: Page, decoder: Page, expected: string) {
  await expect.poll(() => focusedName(page)).toBe(expected);
  await page.waitForTimeout(200);
  expect(ringProblems(await edgesOfFocused(page, decoder)), expected).toEqual([]);
}

test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

const TILES: Array<{ shot: string; persona: PersonaId; tenant: string; principal: string; path: string; tile: string; viewport: { width: number; height: number } }> = [
  { shot: 't01-rent-payable-label-200pct-320', persona: 'rb_manager', tenant: 'tnt_riverbend', principal: 'usr_rb_0002', path: '/backoffice/rentals', tile: 'rent-kpi-payable', viewport: PHONE },
  { shot: 't02-mgmt-kpis-badge-200pct-320', persona: 'manager', tenant: 'tnt_larkspur', principal: 'usr_lsp_0001', path: '/backoffice', tile: 'kpi-collected', viewport: PHONE },
  { shot: 't03-hr-kpis-200pct-1440', persona: 'alnoor_manager', tenant: 'tnt_alnoor', principal: 'usr_anr_0001', path: '/backoffice/hr/hr-dashboard', tile: 'hr-kpi-shortShifts', viewport: { width: 1440, height: 900 } },
];

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const l = lang(locale);
  test(`F-INT-1 StatTile labels whole at 200 % text (${l}): Rentals owner payable, management KPIs, HR tiles`, async ({ browser }) => {
    test.setTimeout(180_000);
    for (const t of TILES) {
      const { ctx, page } = await context(browser, t.viewport);
      await seed(page, { persona: t.persona, locale });
      await textSize(page, [display(t.tenant, t.principal)], 2);
      await page.goto(`${BO}${t.path}`);
      const tile = page.getByTestId(t.tile);
      await expect(tile).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-text-scale'))).toBe('200');
      await settle(page, 800);
      await tile.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await settle(page, 300);
      await shot(page, `${t.shot}-${l}`);
      await ctx.close();
    }
  });

  test(`F-INT-3 confirm dialogs at 320 px with 200 % text, keyboard rings whole (${l}): Rentals light, dark with high contrast, re-opened after a failure; Request 360 close refused`, async ({ browser }) => {
    test.setTimeout(240_000);
    const words = { ...COMMON_TEXT(locale).actions, issue: RENTALS_TEXT(locale).statements.issue };
    for (const dark of [false, true]) {
      const { ctx, page, decoder } = await context(browser, PHONE);
      await seed(page, { persona: 'rb_accounts', locale });
      await textSize(page, RB_STAFF.map((p) => display('tnt_riverbend', p)), 2);
      if (dark) {
        await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
        await page.getByTestId('hub-theme-dark').click();
        await page.getByTestId('hub-contrast-high').click();
        await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-contrast'))).toBe('high');
      }
      await page.goto(`${BO}/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10`);
      const issue = page.getByTestId('statement-issue');
      await expect(issue).toBeVisible();
      await settle(page);
      await keyboardFocus(page, issue);
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await whole(page, decoder, words.cancel);
      await shot(page, `d0${dark ? 2 : 1}-rent-confirm-cancel-focus${dark ? '-dark-contrast' : ''}-200pct-320-${l}`);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);

      if (!dark) {
        // A failed issue (the request is lost on the way to the server, as in tests/e2e/ux-b10.spec.ts), then
        // the dialog re-opened by keyboard.
        await page.evaluate(() => {
          const transport = window.__prototype!.transport;
          const original = transport.request.bind(transport);
          let armed = true;
          transport.request = (async (req: Parameters<typeof original>[0]) => {
            if (armed && req.method === 'POST' && req.path === '/rentals/owner-statements/issue') {
              armed = false;
              throw new TypeError('Failed to fetch');
            }
            return original(req);
          }) as typeof transport.request;
        });
        await keyboardFocus(page, issue);
        await page.keyboard.press('Enter');
        await expect(dialog).toBeVisible();
        for (const name of [words.close, words.cancel, words.issue]) {
          await page.keyboard.press('Tab');
          await expect.poll(() => focusedName(page)).toBe(name);
        }
        await page.keyboard.press('Enter');
        await expect(dialog).toHaveCount(0);
        await expect(page.getByTestId('toast-error')).toBeVisible();
        await expect(issue).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await whole(page, decoder, words.cancel);
        await shot(page, `d03-rent-confirm-reopened-after-failure-200pct-320-${l}`);
        await page.keyboard.press('Escape');
      }
      await ctx.close();
    }

    // The second dialog: Request 360's close dialog, a too-short reason refused inside it, Cancel focused.
    const { ctx, page, decoder } = await context(browser, PHONE);
    await seedSociety(page, { staff: 'alnoor_manager', locale });
    await textSize(page, [display('tnt_alnoor', 'usr_anr_0001')], 2);
    await page.goto(`${BO}/backoffice/mnt/maintenance-list`);
    await expect(page.getByTestId('request-row').first()).toBeVisible();
    const r = await societyApi<{ items: Array<{ id: string; title: string }> }>(page, '/ops/requests', 'GET', {}, { q: 'Balcony door lock broken' });
    const row = (r.ok ? r.res.items : []).find((x) => x.title.includes('Balcony door lock broken'))!;
    await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${row.id}`);
    const action = page.getByTestId('action-close');
    await expect(action).toBeVisible();
    await settle(page);
    await keyboardFocus(page, action);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.type('No reply');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(dialog.getByTestId('refusal-alert')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await whole(page, decoder, words.cancel);
    await shot(page, `d04-request-close-refused-cancel-focus-200pct-320-${l}`);
    await ctx.close();
  });
}
