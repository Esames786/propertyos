import { readFileSync } from 'node:fs';
import type { Browser, Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { keyboardFocus, ringOf } from '../support/focus';
import { layoutProblems } from '../support/layout';
import { describeEdges, edgesOfFocused, focusedName, ringProblems, statTileLabels } from '../support/ring-edges';
import { seedSociety, societyApi } from '../support/society';

/**
 * UX B10 (GitHub Issue #24): the two P1 findings of the accepted integration `373d0cf`, on production builds.
 *
 * F-INT-1: a StatTile label is never cut. At 320 px with 200 % text the Rentals owner-payable tile showed
 * "Owner payable (settled mone…" (Urdu "مالکان کو واجب الادا (صرف طے…"): StatTile's `line-clamp-2`. Measured
 * on the label element itself: computed `-webkit-line-clamp` none, the label does not clip (overflow visible),
 * and every line of its text within the label's width, wholly inside its tile (which clips) and on the
 * screen; the visible text is the whole label the
 * tile's name starts with, and the amount is still read once. On every screen with StatTiles, in English and
 * Urdu, at 1440 px, at 1440 px with 200 % text and at 320 px with 200 % text. At 1440 px the change badge
 * stays beside its label (no layout change at ordinary sizes).
 *
 * F-INT-3: the keyboard ring of a control in a confirm dialog that scrolls (320 px, 200 % text) is never cut
 * by the dialog's scrolling overlay. Before: Tab from Close to Cancel scrolled only until Cancel's box touched
 * the overlay's bottom edge, and the overlay cut 37 % of Cancel's ring. Keyboard only, Tab and Shift+Tab
 * around the whole dialog, each stop measured where the keyboard left it, on every border of the ring
 * (tests/support/ring-edges.ts), plus B2's `ringOf` (tests/support/focus.ts, unchanged) without any
 * allowance for clipping. Rentals statement-issue dialog (Riverbend) and, as the second dialog, Request 360's
 * close dialog with a refused reason shown inside it (Al-Noor). Light, and dark with high contrast; English
 * and Urdu (right to left); and re-opened after a failed action.
 * Fictional organisations; the demo's business date is Monday 26 October 2026.
 */
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const LOCALES: Locale[] = ['en-PK', 'ur-PK'];
const PHONE = { width: 320, height: 700 };
const DESKTOP = { width: 1440, height: 900 };
const display = (tenant: string, principal: string) => `pref:display:v1:backoffice:${tenant}:${principal}`;
const RB_STAFF = ['usr_rb_0001', 'usr_rb_0002', 'usr_rb_0003', 'usr_rb_0004'];
const RENTALS_TEXT = (locale: Locale) => JSON.parse(readFileSync(`packages/i18n/locales/${locale}/rentals.json`, 'utf8')) as { leases: { kpi: { payable: string; payableHint: string } }; statements: { issue: string } };
const COMMON_TEXT = (locale: Locale) => JSON.parse(readFileSync(`packages/i18n/locales/${locale}/common.json`, 'utf8')) as { actions: { cancel: string; close: string } };
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

/** Each person's own saved office text size (the office keeps it per person, version 2). */
async function textSize(page: Page, keys: string[], scale: number) {
  for (const key of keys) await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key, scale });
}

async function context(browser: Browser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  return { ctx, page, decoder: await ctx.newPage() };
}

// ---------------------------------------------------------------------------------------------
// F-INT-1: StatTile labels
// ---------------------------------------------------------------------------------------------

type Label = Awaited<ReturnType<typeof statTileLabels>>[number];

/** Waits until two reads of the labels 300 ms apart agree (figures that count up on load have settled). */
async function settled(page: Page) {
  let last = '';
  for (let i = 0; i < 20; i++) {
    const now = JSON.stringify(await statTileLabels(page));
    if (now === last) return;
    last = now;
    await page.waitForTimeout(300);
  }
  throw new Error('the StatTile labels kept changing');
}

/** The label is drawn whole: no clamp, nothing overflowing its box, every line inside its tile and on screen; it is the start of the name. */
function labelProblems(l: Label): string[] {
  const out: string[] = [];
  if (l.lineClamp !== 'none') out.push(`line-clamp ${l.lineClamp}`);
  if (l.textOverflow === 'ellipsis') out.push('text-overflow ellipsis');
  // The label never clips: a clipping box cuts lines (as the clamp did), a word wider than the box, or the
  // ink of Urdu letters below the last line box (Firefox counts that ink in scrollHeight; Chromium does not).
  if (l.overflow !== 'visible visible') out.push(`the label clips (overflow ${l.overflow}; content ${l.scroll.sw}×${l.scroll.sh} in a ${l.scroll.cw}×${l.scroll.ch} box)`);
  if (!l.inLabel) out.push('text runs sideways out of the label');
  if (!l.inTile) out.push('text outside its tile (the tile clips)');
  if (!l.onScreen) out.push('text off screen');
  if (!l.name.startsWith(`${l.text}, `)) out.push(`visible "${l.text}" is not the start of the name "${l.name}"`);
  return out;
}

async function expectLabelsWhole(page: Page, where: string, rows: string[]) {
  const labels = await statTileLabels(page);
  expect(labels.length, `${where}: StatTiles found`).toBeGreaterThan(0);
  for (const l of labels) {
    rows.push(`${where} ${l.id}: "${l.text}" ${l.lines} line(s), clamp ${l.lineClamp}, overflow ${l.overflow}, ${l.scroll.cw}×${l.scroll.ch}${l.badgeBeside === null ? '' : `, badge ${l.badgeBeside ? 'beside' : 'below'}`}`);
    expect(labelProblems(l), `${where} ${l.id} "${l.text}"`).toEqual([]);
  }
  return labels;
}

for (const locale of LOCALES) {
  test(`F-INT-1 Rentals owner-payable tile at 320 px with 200 % text, ${lang(locale)}: the whole label is drawn, its name is unchanged and the amount is read once; axe`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const { ctx, page } = await context(browser, PHONE);
    await seed(page, { persona: 'rb_manager', locale });
    await textSize(page, RB_STAFF.map((p) => display('tnt_riverbend', p)), 2);
    await page.goto(`${BO}/backoffice/rentals`);
    await expect(page.getByTestId('rent-lease-list')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-text-scale')), { message: 'text at 200 %' }).toBe('200');
    const rows: string[] = [];
    const labels = await expectLabelsWhole(page, `rentals 200pct-320 ${lang(locale)}`, rows);
    const text = RENTALS_TEXT(locale).leases.kpi;
    const payable = labels.find((l) => l.id === 'rent-kpi-payable')!;
    // The very label F-INT-1 found cut, whole, and wrapping (more than the old two lines) rather than shrinking.
    expect(payable.text).toBe(text.payable);
    expect(payable.lines, 'the label takes the lines it needs').toBeGreaterThanOrEqual(3);
    // Its tile shows "amount · hint"; the name still says the amount once and the hint once (B2 / §5.1).
    const tile = page.getByTestId('rent-kpi-payable');
    const [amount] = (await tile.locator('div.text-xs').first().innerText()).trim().split(' · ');
    expect(payable.name).toBe(`${text.payable}, ${amount}. ${text.payableHint}`);
    expect(count(payable.name, amount!), 'amount once').toBe(1);
    expect(count(payable.name, text.payableHint), 'hint once').toBe(1);
    await expect(tile).toHaveAccessibleName(payable.name);
    expect(await layoutProblems(page.getByTestId('rent-kpi-active').locator('..')), 'tiles').toEqual([]);
    await axe(page, testInfo, `b10-rent-kpis-200pct-320-${lang(locale)}`);
    await testInfo.attach(`labels-rentals-${lang(locale)}.txt`, { body: rows.join('\n'), contentType: 'text/plain' });
    await ctx.close();
  });
}

/** Every screen that shows StatTiles, with the person who sees it. */
const TILE_SCREENS: Array<{ name: string; persona: PersonaId; tenant: string; principal: string; path: string }> = [
  { name: 'management home (KPI row with change badges)', persona: 'manager', tenant: 'tnt_larkspur', principal: 'usr_lsp_0001', path: '/backoffice' },
  { name: 'society home', persona: 'alnoor_manager', tenant: 'tnt_alnoor', principal: 'usr_anr_0001', path: '/backoffice' },
  { name: 'collections', persona: 'alnoor_accounts', tenant: 'tnt_alnoor', principal: 'usr_anr_0004', path: '/backoffice/col/collections-dashboard' },
  { name: 'finance dashboard', persona: 'alnoor_treasurer', tenant: 'tnt_alnoor', principal: 'usr_anr_0002', path: '/backoffice/fin/finance-dashboard' },
  { name: 'HR dashboard', persona: 'alnoor_manager', tenant: 'tnt_alnoor', principal: 'usr_anr_0001', path: '/backoffice/hr/hr-dashboard' },
  { name: 'payroll dashboard', persona: 'alnoor_accounts', tenant: 'tnt_alnoor', principal: 'usr_anr_0004', path: '/backoffice/pay/payroll-dashboard' },
  { name: 'Rentals leases', persona: 'rb_manager', tenant: 'tnt_riverbend', principal: 'usr_rb_0002', path: '/backoffice/rentals' },
];
const TILE_SIZES = [
  { name: '1440', viewport: DESKTOP, scale: 1 },
  { name: '1440-200pct', viewport: DESKTOP, scale: 2 },
  { name: '200pct-320', viewport: PHONE, scale: 2 },
];

for (const locale of LOCALES) {
  for (const screen of TILE_SCREENS) {
    test(`F-INT-1 every StatTile label whole, ${screen.name}, ${lang(locale)}: 1440 px, 1440 px with 200 % text, 320 px with 200 % text; at 1440 px the badge stays beside its label`, async ({ browser }, testInfo) => {
      test.setTimeout(120_000);
      const rows: string[] = [];
      for (const size of TILE_SIZES) {
        const { ctx, page } = await context(browser, size.viewport);
        await seed(page, { persona: screen.persona, locale });
        if (size.scale !== 1) await textSize(page, [display(screen.tenant, screen.principal)], size.scale);
        await page.goto(`${BO}${screen.path}`);
        await expect(page.locator('main [data-stat-label]').first()).toBeVisible({ timeout: 20_000 });
        await settled(page);
        if (size.scale !== 1) await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-text-scale'))).toBe('200');
        const labels = await expectLabelsWhole(page, `${size.name} ${lang(locale)}`, rows);
        // At an ordinary size nothing moves: a tile's change badge is on the label's row, as before B10.
        if (size.name === '1440') for (const l of labels) if (l.badgeBeside !== null) expect(l.badgeBeside, `${l.id} at 1440: the badge beside the label`).toBe(true);
        await ctx.close();
      }
      await testInfo.attach(`labels-${screen.path.replace(/\W+/g, '-')}-${lang(locale)}.txt`, { body: rows.join('\n'), contentType: 'text/plain' });
    });
  }
}

// ---------------------------------------------------------------------------------------------
// F-INT-3: keyboard rings inside a confirm dialog that scrolls
// ---------------------------------------------------------------------------------------------

interface Mode {
  name: string;
  dark: boolean;
}
const MODES: Mode[] = [
  { name: '200pct-320', dark: false },
  { name: '200pct-320-dark-contrast', dark: true },
];

/** Dark mode with high contrast, chosen in the person's accessibility hub (as B2 and the integration do). */
async function darkHighContrast(page: Page) {
  await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
  await page.getByTestId('hub-theme-dark').click();
  await page.getByTestId('hub-contrast-high').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-contrast'))).toBe('high');
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
}

/** Measures the ring where Tab (or Shift+Tab) left it and asserts that every border of it is visible. */
async function expectWholeRing(page: Page, decoder: Page, where: string, expected: string, rows: string[]) {
  await expect.poll(() => focusedName(page), { message: `${where}: focus on "${expected}"` }).toBe(expected);
  // Let a smooth scroll (none: reduced motion) and React Aria's focus-visible state settle.
  await page.waitForTimeout(150);
  const r = await edgesOfFocused(page, decoder);
  rows.push(describeEdges(where, r));
  expect(ringProblems(r), `${where} "${expected}": the whole ring is visible`).toEqual([]);
}

/** Tab once round the dialog and Shift+Tab once back, measuring every stop. */
async function aroundTheDialog(page: Page, decoder: Page, where: string, stops: string[], rows: string[]) {
  for (const [i, name] of [...stops, stops[0]!].entries()) {
    await page.keyboard.press('Tab');
    await expectWholeRing(page, decoder, `${where} Tab ${i + 1}`, name, rows);
  }
  // From the first stop again, Shift+Tab wraps to the last and walks back to the first.
  for (const [i, name] of [...stops].reverse().entries()) {
    await page.keyboard.press('Shift+Tab');
    await expectWholeRing(page, decoder, `${where} Shift+Tab ${i + 1}`, name, rows);
  }
}

/**
 * The next statement-issue request is lost on the way to the server (the network fails), as
 * cn-idempotency.spec.ts does for credit notes: the action fails and the server changes nothing. Installed
 * on this page's transport, so the page itself keeps working (the demo's "Server error" mode would fail its
 * reads too and replace the page with an error state).
 */
async function failNextIssue(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __b10: { failed: number } };
    w.__b10 = { failed: 0 };
    const transport = window.__prototype!.transport;
    const original = transport.request.bind(transport);
    let armed = true;
    transport.request = (async (req: Parameters<typeof original>[0]) => {
      if (armed && req.method === 'POST' && req.path === '/rentals/owner-statements/issue') {
        armed = false;
        w.__b10.failed += 1;
        throw new TypeError('Failed to fetch');
      }
      return original(req);
    }) as typeof transport.request;
  });
}

const STATEMENT = '/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10';

for (const mode of MODES) {
  for (const locale of LOCALES) {
    test(`F-INT-3 Rentals statement-issue dialog, ${mode.name}, ${lang(locale)}: keyboard only, Tab and Shift+Tab around it, every ring whole on every border; re-opened after a failed issue`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000);
      const { ctx, page, decoder } = await context(browser, PHONE);
      await seed(page, { persona: 'rb_accounts', locale });
      await textSize(page, RB_STAFF.map((p) => display('tnt_riverbend', p)), 2);
      if (mode.dark) {
        await page.goto(`${BO}/backoffice/global/my-access`);
        await darkHighContrast(page);
      }
      const rows: string[] = [];
      const at = (what: string) => `${what} ${mode.name} ${lang(locale)}`;
      const words = { ...COMMON_TEXT(locale).actions, issue: RENTALS_TEXT(locale).statements.issue };
      const stops = [words.close, words.cancel, words.issue];

      await page.goto(`${BO}${STATEMENT}`);
      const issue = page.getByTestId('statement-issue');
      await expect(issue).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-text-scale'))).toBe('200');

      // Keyboard only: focus the Issue button by keyboard, Enter opens the dialog.
      await keyboardFocus(page, issue);
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      // The dialog is taller than the screen at this size: it scrolls (the case F-INT-3 is about).
      expect(await dialog.evaluate((d) => d.getBoundingClientRect().height > window.innerHeight), at('dialog taller than the screen')).toBe(true);
      expect(await layoutProblems(dialog), at('dialog layout')).toEqual([]);
      await aroundTheDialog(page, decoder, at('statement dialog'), stops, rows);

      // B2's measure (tests/support/focus.ts, unchanged), now with no allowance for clipping: Cancel, the
      // control F-INT-3 found 37 % clipped, and the other two.
      for (const name of stops) {
        const r = await ringOf(page, decoder, dialog.getByRole('button', { name, exact: true }));
        rows.push(`${at(`ringOf "${name}"`)}: band ${r.pixels} px, ${Math.round(r.changed3 * 100)} % ≥ 3:1, median ${r.median}:1, clipped ${Math.round(r.clipped * 100)} %`);
        expect(r.style, at(`ringOf "${name}" style`)).toBe('solid');
        expect(r.clipped, at(`ringOf "${name}": nothing clipped`)).toBe(0);
        expect(r.changed3, at(`ringOf "${name}": ≥ 90 % changed by ≥ 3:1`)).toBeGreaterThanOrEqual(0.9);
        expect(r.median).toBeGreaterThanOrEqual(3);
        expect(r.otherRings, at(`ringOf "${name}": one ring`)).toEqual([]);
      }
      await axe(page, testInfo, `b10-rent-confirm-${mode.name}-${lang(locale)}`);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(issue).toBeFocused();

      // A failed action: the network loses Usman's issue request; the dialog closes with the error shown,
      // focus back on Issue; nothing was issued. Enter re-opens it, and its rings are whole again.
      await failNextIssue(page);
      await keyboardFocus(page, issue);
      await page.keyboard.press('Enter');
      await expect(dialog).toBeVisible();
      for (const name of stops) {
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
      await expectWholeRing(page, decoder, at('re-opened after the failure, Cancel'), words.cancel, rows);
      await page.keyboard.press('Tab');
      await expectWholeRing(page, decoder, at('re-opened after the failure, Issue'), words.issue, rows);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { __b10: { failed: number } }).__b10.failed), at('one issue request failed')).toBe(1);
      const s = await societyApi<{ state: string }>(page, '/rentals/owner-statements/statement', 'GET', {}, { owner: 'own_rb_tahira', period: '2026-10' });
      expect(s.ok, at('statement readable')).toBe(true);
      expect(s.ok && s.res.state, at('the failed issue changed nothing')).not.toBe('issued');
      await expect(issue).toBeVisible();
      await testInfo.attach(`rings-statement-dialog-${mode.name}-${lang(locale)}.txt`, { body: rows.join('\n'), contentType: 'text/plain' });
      await ctx.close();
    });
  }
}

// The second dialog: Request 360's close dialog (the same ConfirmDialog, with a reason box and a refusal
// shown inside it, OPS-01), Imran at Al-Noor.
const IMRAN: PersonaId = 'alnoor_manager';
const TOO_SHORT: Record<Locale, string> = { 'en-PK': 'Write at least 10 characters.', 'ur-PK': 'کم از کم 10 حروف لکھیں۔' };

async function requestWorkspace(page: Page, title: string) {
  await page.goto(`${BO}/backoffice/mnt/maintenance-list`);
  await expect(page.getByTestId('request-row').first()).toBeVisible();
  const r = await societyApi<{ items: Array<{ id: string; title: string }> }>(page, '/ops/requests', 'GET', {}, { q: title });
  const row = (r.ok ? r.res.items : []).find((x) => x.title.includes(title));
  if (!row) throw new Error(`no request "${title}"`);
  await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${row.id}`);
  await expect(page.getByTestId('request-workspace')).toBeVisible();
}

for (const mode of MODES) {
  for (const locale of LOCALES) {
    test(`F-INT-3 second dialog: Request 360 close dialog with a refused reason, ${mode.name}, ${lang(locale)}: keyboard only, every ring whole; re-opened after the refusal`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000);
      const { ctx, page, decoder } = await context(browser, PHONE);
      await seedSociety(page, { staff: IMRAN, locale });
      await textSize(page, [display('tnt_alnoor', 'usr_anr_0001')], 2);
      if (mode.dark) {
        await page.goto(`${BO}/backoffice/global/my-access`);
        await darkHighContrast(page);
      }
      const rows: string[] = [];
      const at = (what: string) => `${what} ${mode.name} ${lang(locale)}`;
      const words = COMMON_TEXT(locale).actions;
      await requestWorkspace(page, 'Balcony door lock broken');
      const action = page.getByTestId('action-close');
      await keyboardFocus(page, action);
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      const confirm = (await dialog.getByRole('button').last().innerText()).trim();
      const reason = dialog.getByRole('textbox');

      // Keyboard only: Tab to the reason, type a reason that is too short, Tab to the confirm button, Enter.
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect(reason).toBeFocused();
      await page.keyboard.type('No reply');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect.poll(() => focusedName(page)).toBe(confirm);
      await page.keyboard.press('Enter');
      // Refused: the reason is inside the dialog, focused; the dialog stays open with what was typed.
      await expect(dialog.getByRole('alert')).toContainText(TOO_SHORT[locale]);
      await expect(dialog.getByTestId('refusal-alert')).toBeFocused();
      await expect(reason).toHaveValue('No reply');
      expect(await dialog.evaluate((d) => d.getBoundingClientRect().height > window.innerHeight), at('dialog taller than the screen')).toBe(true);
      expect(await layoutProblems(dialog), at('dialog layout')).toEqual([]);

      // From the focused refusal: the reason box, Cancel, the confirm button, round to Close, and back.
      await page.keyboard.press('Tab');
      await expect(reason).toBeFocused();
      for (const [i, name] of [words.cancel, confirm, words.close].entries()) {
        await page.keyboard.press('Tab');
        await expectWholeRing(page, decoder, at(`close dialog Tab ${i + 2}`), name, rows);
      }
      await page.keyboard.press('Shift+Tab');
      await expectWholeRing(page, decoder, at('close dialog Shift+Tab 1'), confirm, rows);
      await page.keyboard.press('Shift+Tab');
      await expectWholeRing(page, decoder, at('close dialog Shift+Tab 2'), words.cancel, rows);
      await axe(page, testInfo, `b10-request-close-refused-${mode.name}-${lang(locale)}`);

      // Escape closes it; the request is still open. Enter on Close for resident opens it again, clean.
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId('request-workspace')).not.toHaveAttribute('data-state', 'closed');
      await keyboardFocus(page, action);
      await page.keyboard.press('Enter');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('alert')).toHaveCount(0);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await expect(reason).toBeFocused();
      await page.keyboard.press('Tab');
      await expectWholeRing(page, decoder, at('re-opened, Cancel'), words.cancel, rows);
      await page.keyboard.press('Tab');
      await expectWholeRing(page, decoder, at('re-opened, confirm'), confirm, rows);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await testInfo.attach(`rings-close-dialog-${mode.name}-${lang(locale)}.txt`, { body: rows.join('\n'), contentType: 'text/plain' });
      await ctx.close();
    });
  }
}
