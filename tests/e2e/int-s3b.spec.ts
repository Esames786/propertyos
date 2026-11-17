import { readFileSync } from 'node:fs';
import type { Browser, Locator, Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, displayKey, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { clearFocus, keyboardFocus, ringOf } from '../support/focus';
import { layoutProblems } from '../support/layout';
import { societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Integration of S.3 Rentals (ae3b3a1) with UX B1 + Issue #21 (15333a7) and UX B2 (7ac865f), plan §5.1
 * and §5.3, on the merged production builds:
 * - §5.1: every Rentals KPI tile (`rent-kpi-*`) is named by its label, then the amount once, the hint
 *   once (a count tile: its number once), in English and Urdu, at 1440 px and at 320 px with 200 % text,
 *   with axe. B2's StatTile reads a context that starts with the tile's amount from after that amount
 *   (path A); Rentals itself is unchanged.
 * - §5.3 / §10: B2's product-wide keyboard rings measured on Rentals controls B2 never measured: the
 *   lease tiles and list, the owner statement (its owner list, a source link, the issue button and its
 *   confirm dialog), a Lease 360 drawer and the landlord's statement list and drawer. Light and dark with
 *   high contrast, 320 px with 200 % text, English and Urdu, and the preset palettes in light and dark.
 * Riverbend Estate Managers (fictional); the demo's business date is Monday 26 October 2026.
 */
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const LOCALES: Locale[] = ['en-PK', 'ur-PK'];
const STAFF: Record<string, string> = { rb_director: 'usr_rb_0001', rb_manager: 'usr_rb_0002', rb_finance: 'usr_rb_0003', rb_accounts: 'usr_rb_0004' };
const OFFICE_DISPLAY = (principal: string) => `pref:display:v1:backoffice:tnt_riverbend:${principal}`;
const PHONE = { width: 320, height: 700 };
const KPIS = ['rent-kpi-active', 'rent-kpi-rent', 'rent-kpi-due', 'rent-kpi-payable', 'rent-kpi-pending'] as const;

const onboarding = (persona: string, app: string) =>
  JSON.stringify({ profile: { tenantId: 'tnt_riverbend', personaId: persona, app, welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

/** Become another Riverbend person in an app (each app keeps its own session), as the S.3 spec does. */
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

async function open(page: Page, persona: PersonaId, path: string, ready: string, app: 'backoffice' | 'customer' = 'backoffice') {
  await become(page, app, persona);
  await page.goto(`${app === 'backoffice' ? BO : CU}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

/** Text at 200 % for every Riverbend colleague and for Tahira (each person's own saved setting). */
async function textAt200(page: Page) {
  for (const principal of Object.values(STAFF)) await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: OFFICE_DISPLAY(principal) });
  await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 1, textScale: 2, chosenAt: '2026-10-26T00:00:00Z' })), { key: displayKey('rb_landlord_tahira') });
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const RENTALS_TEXT = (locale: Locale) => JSON.parse(readFileSync(`packages/i18n/locales/${locale}/rentals.json`, 'utf8')) as { leases: { kpi: { rentHint: string; dueHint: Record<string, string>; payableHint: string; pendingHint: string } } };
/** Digits only, Urdu and Arabic-Indic digits read as 0–9 ("Rs 3,30,000.00" → "33000000"). */
const digits = (s: string) => s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
/** A number as a whole token, not part of a longer figure such as "1,234" or "3.5" (a comma or point joins a figure only between digits). */
const tokenCount = (hay: string, n: string) => [...hay.matchAll(new RegExp(`(?<!\\d)(?<!\\d[.,])${n}(?!\\d)(?![.,]\\d)`, 'g'))].length;

interface Tile {
  id: string;
  name: string;
  label: string;
  context: string;
}

/** Each KPI tile's accessible name (aria-label, checked to be the computed name), visible label and visible context line. */
async function tiles(page: Page): Promise<Tile[]> {
  const out: Tile[] = [];
  for (const id of KPIS) {
    const tile = page.getByTestId(id);
    await expect(tile).toBeVisible();
    const name = (await tile.getAttribute('aria-label')) ?? '';
    // The computed accessible name is exactly that label: nothing else is folded in, and no description is attached.
    await expect(tile, id).toHaveAccessibleName(name);
    await expect(tile, id).not.toHaveAttribute('aria-describedby', /.+/);
    // B10 (Issue #24): the label element is marked `data-stat-label` (its `line-clamp-2` class, which cut it, is gone).
    const label = (await tile.locator('[data-stat-label]').first().innerText()).trim();
    const context = (await tile.locator('div.text-xs').first().count()) ? (await tile.locator('div.text-xs').first().innerText()).trim() : '';
    out.push({ id, name, label, context });
  }
  return out;
}

/** §5.1: label, then the amount once and the hint once (a count tile: its number once). */
async function expectTileNames(page: Page, locale: Locale, where: string, testInfo: TestInfo) {
  const kpis = (await societyApi<{ kpis: { active: number; pendingPayouts: number; rentUnderManagement: { amount: string }; dueThisMonth: { amount: string }; ownerPayableSettled: { amount: string }; rollState: string } }>(page, '/rentals/leases', 'GET'))!;
  if (!kpis.ok) throw new Error('leases not readable');
  const k = kpis.res.kpis;
  const text = RENTALS_TEXT(locale).leases.kpi;
  const all = await tiles(page);
  await testInfo.attach(`rent-kpi-names-${where}-${lang(locale)}.txt`, { body: all.map((t) => `${t.id}: ${t.name}`).join('\n'), contentType: 'text/plain' });
  const tile = (id: string) => all.find((t) => t.id === id)!;
  for (const t of all) expect(t.name.startsWith(`${t.label}, `), `${t.id} ${where}: starts with its label "${t.label}"`).toBe(true);

  // Count tiles.
  expect(tile('rent-kpi-active').name, `active ${where}`).toBe(`${tile('rent-kpi-active').label}, ${k.active}`);
  expect(tokenCount(tile('rent-kpi-active').name.slice(tile('rent-kpi-active').label.length), String(k.active)), `active count once ${where}`).toBe(1);
  expect(tile('rent-kpi-pending').name, `pending ${where}`).toBe(`${tile('rent-kpi-pending').label}, ${k.pendingPayouts}, ${text.pendingHint}`);
  expect(tokenCount(tile('rent-kpi-pending').name.slice(tile('rent-kpi-pending').label.length), String(k.pendingPayouts)), `pending count once ${where}`).toBe(1);
  expect(count(tile('rent-kpi-pending').name, text.pendingHint), `pending hint once ${where}`).toBe(1);

  // Amount tiles: the visible context is "amount · hint"; the name says that amount once and the hint once.
  const amountTiles: Array<[string, string, string, 'comma' | 'stop']> = [
    ['rent-kpi-rent', k.rentUnderManagement.amount, text.rentHint, 'comma'],
    ['rent-kpi-due', k.dueThisMonth.amount, text.dueHint[k.rollState]!, 'comma'],
    ['rent-kpi-payable', k.ownerPayableSettled.amount, text.payableHint, 'stop'],
  ];
  for (const [id, raw, hint, joint] of amountTiles) {
    const t = tile(id);
    const [amount, ...rest] = t.context.split(' · ');
    expect(rest.join(' · '), `${id} ${where}: visible context ends with its hint`).toBe(hint);
    expect(digits(amount!), `${id} ${where}: the visible amount is the server's ${raw}`).toBe(digits(raw));
    expect(count(t.name, amount!), `${id} ${where}: amount "${amount}" once in "${t.name}"`).toBe(1);
    expect(count(t.name, hint), `${id} ${where}: hint once in "${t.name}"`).toBe(1);
    expect(t.name, `${id} ${where}`).toBe(`${t.label}, ${amount}${joint === 'stop' ? '.' : ','} ${hint}`);
  }
}

for (const locale of LOCALES) {
  test(`§5.1 Rentals KPI names, ${lang(locale)}: label, amount once, hint once (count once) at 1440 px and at 320 px with 200 % text, with axe`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
    await seed(page, { persona: 'rb_manager', locale });
    await open(page, 'rb_manager', '/backoffice/rentals', 'rent-lease-list');
    await expectTileNames(page, locale, '1440', testInfo);
    await axe(page, testInfo, `int-rent-kpis-1440-${lang(locale)}`);
    expect(await overflowOf(page), `1440 ${locale}`).toBeLessThanOrEqual(0);

    // 320 px with text at 200 % (Sadia's own setting): the same names, nothing clipped, axe clean.
    await page.evaluate(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: OFFICE_DISPLAY(STAFF.rb_manager!) });
    await page.setViewportSize(PHONE);
    await page.goto(`${BO}/backoffice/rentals`);
    await expect(page.getByTestId('rent-lease-list')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-text-scale')), { message: 'text at 200 %' }).toBe('200');
    await expectTileNames(page, locale, '200pct-320', testInfo);
    expect(await layoutProblems(page.getByTestId('rent-kpi-active').locator('..')), `tiles ${lang(locale)} 200 %`).toEqual([]);
    await axe(page, testInfo, `int-rent-kpis-200pct-320-${lang(locale)}`);
    expect(consoleErrors).toEqual([]);
  });
}

// ---------------------------------------------------------------------------------------------
// Keyboard rings on Rentals controls (B2's helper tests/support/focus.ts; B2's thresholds)
// ---------------------------------------------------------------------------------------------

interface Mode {
  name: string;
  viewport: { width: number; height: number };
  dark?: boolean;
  scale?: number;
}
const MODES: Mode[] = [
  { name: '1440', viewport: VIEWPORTS.desktop },
  { name: '390-dark-contrast', viewport: VIEWPORTS.phone, dark: true },
  { name: '200pct-320', viewport: PHONE, scale: 2 },
];

/**
 * A link that wraps onto several lines (an inline source link at 320 px with 200 % text) gets one ring per
 * line box, while ringOf samples one rectangle around all of them. So for a wrapped control each line box
 * is measured on its own: the pixels on the left and right edges of its ring, focused against unfocused,
 * the strongest change at each point and its four neighbours (as ringOf does). Returns, per line box, the
 * share of those pixels changed by at least 3:1.
 */
async function lineBoxRings(page: Page, decoder: Page, loc: Locator) {
  await clearFocus(page);
  await loc.scrollIntoViewIfNeeded();
  await keyboardFocus(page, loc);
  const g = await loc.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { rects: [...el.getClientRects()].map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })), width: parseFloat(cs.outlineWidth) || 0, offset: parseFloat(cs.outlineOffset) || 0, radius: parseFloat(cs.borderTopLeftRadius) || 0, dpr: window.devicePixelRatio };
  });
  const after = (await page.screenshot({ animations: 'disabled', caret: 'hide' })).toString('base64');
  await clearFocus(page);
  const before = (await page.screenshot({ animations: 'disabled', caret: 'hide' })).toString('base64');
  return decoder.evaluate(
    async ({ before, after, g }) => {
      const load = async (b64: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, d: ctx.getImageData(0, 0, img.width, img.height).data };
      };
      const [a, b] = [await load(before), await load(after)];
      const lum = (img: typeof a, x: number, y: number) => {
        const i = (y * img.w + x) * 4;
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(img.d[i]!) + 0.7152 * f(img.d[i + 1]!) + 0.0722 * f(img.d[i + 2]!);
      };
      const mid = g.offset + g.width / 2;
      return g.rects.map((r) => {
        let n = 0;
        let changed = 0;
        for (const x0 of [r.l - mid, r.r + mid]) {
          for (let y0 = r.t + g.radius + 1; y0 <= r.b - g.radius - 1; y0++) {
            const [cx, cy] = [Math.floor(x0 * g.dpr), Math.floor(y0 * g.dpr)];
            if (cx < 0 || cy < 0 || cx >= a.w || cy >= a.h) continue;
            let best = 0;
            for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
              const [x, y] = [cx + dx, cy + dy];
              if (x < 0 || y < 0 || x >= a.w || y >= a.h) continue;
              const [l1, l2] = [lum(a, x, y), lum(b, x, y)];
              best = Math.max(best, (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
            }
            n++;
            if (best >= 3) changed++;
          }
        }
        return { pixels: n, changed3: n ? changed / n : 0 };
      });
    },
    { before, after, g },
  );
}

/** As B2's ux-b2-focus.spec.ts: solid, ≥ 2 px, ≥ 90 % of the ring band changed by ≥ 3:1 (median ≥ 3:1), one ring, not clipped. */
async function expectRing(page: Page, decoder: Page, loc: Locator, label: string, rows: string[], options: { allowClip?: boolean; min?: number } = {}) {
  await expect(loc, label).toBeVisible();
  const r = await ringOf(page, decoder, loc);
  rows.push(`${label}: ${r.style} ${r.width}px offset ${r.offset} ${r.colour}; band ${r.pixels} px, ${Math.round(r.changed3 * 100)} % ≥ 3:1, median ${r.median}:1; clipped ${Math.round(r.clipped * 100)} %; other rings ${r.otherRings.length}`);
  expect(r.focused, `${label}: focused`).toBe(true);
  expect(r.focusVisible, `${label}: keyboard focus is focus-visible`).toBe(true);
  expect(r.style, `${label}: outline style`).toBe('solid');
  expect(r.width, `${label}: outline width`).toBeGreaterThanOrEqual(2);
  expect(r.pixels, `${label}: ring band sampled`).toBeGreaterThan(3);
  const lineBoxes = await loc.evaluate((el) => el.getClientRects().length);
  if (lineBoxes > 1) {
    // Wrapped: each line box's own ring, measured on its own (the band around all of them is not where it is drawn).
    const boxes = await lineBoxRings(page, decoder, loc);
    rows.push(`${label}: wrapped onto ${lineBoxes} lines; per line box ${boxes.map((x) => `${x.pixels} px, ${Math.round(x.changed3 * 100)} % ≥ 3:1`).join(' | ')}`);
    for (const [i, x] of boxes.entries()) {
      expect(x.pixels, `${label}: line box ${i + 1} sampled`).toBeGreaterThan(3);
      expect(x.changed3, `${label}: line box ${i + 1} ring pixels changed by ≥ 3:1`).toBeGreaterThanOrEqual(options.min ?? 0.9);
    }
  } else expect(r.changed3, `${label}: ring pixels changed by ≥ 3:1 (median ${r.median})`).toBeGreaterThanOrEqual(options.min ?? 0.9);
  expect(r.median, `${label}: median contrast`).toBeGreaterThanOrEqual(3);
  expect(r.otherRings, `${label}: one ring at a time`).toEqual([]);
  if (!options.allowClip) expect(r.clipped, `${label}: no part of the ring clipped by a container`).toBe(0);
}

async function darkHighContrast(page: Page, origin: string, path: string) {
  await page.goto(`${origin}${path}`);
  await page.getByTestId('hub-theme-dark').click();
  await page.getByTestId('hub-contrast-high').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-contrast'))).toBe('high');
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
}

async function newPage(browser: Browser, mode: Mode, locale: Locale) {
  const ctx = await browser.newContext({ viewport: mode.viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await seed(page, { persona: 'rb_manager', locale });
  if (mode.scale) await textAt200(page);
  const decoder = await ctx.newPage();
  return { ctx, page, decoder };
}

for (const mode of MODES) {
  for (const locale of LOCALES) {
    test(`Rentals keyboard rings, ${mode.name}, ${lang(locale)}: lease tiles and list, owner statement and its confirm dialog, a Lease 360 drawer, the landlord's statements`, async ({ browser }, testInfo) => {
      test.setTimeout(300_000);
      const { ctx, page, decoder } = await newPage(browser, mode, locale);
      const rows: string[] = [];
      const at = (what: string) => `${what} ${mode.name} ${lang(locale)}`;
      if (mode.dark) {
        for (const persona of ['rb_manager', 'rb_accounts'] as const) {
          await become(page, 'backoffice', persona);
          await darkHighContrast(page, BO, '/backoffice/global/accessibility-preferences');
        }
        await become(page, 'customer', 'rb_landlord_tahira');
        await darkHighContrast(page, CU, '/customer/portal/accessibility-preferences');
      }

      // RNT-001 leases: two tiles (an amount tile and a count tile) and a lease link.
      await open(page, 'rb_manager', '/backoffice/rentals', 'rent-lease-list');
      for (const id of ['rent-kpi-rent', 'rent-kpi-pending']) await expectRing(page, decoder, page.getByTestId(id), at(id), rows);
      await expectRing(page, decoder, page.getByTestId('rent-lease-link').first(), at('lease link'), rows);
      if (mode.name === '1440') await axe(page, testInfo, `int-rent-focus-leases-${mode.name}-${lang(locale)}`);

      // Lease 360: the renewal drawer's save and close. At 320 px with 200 % text a drawer's scrolling body
      // clips the top and bottom of a control's ring (B2's N-B2-3); the rest of the ring must still show.
      await open(page, 'rb_manager', '/backoffice/rentals/leases/lse_rb_0002?drawer=renew', 'lease-renew');
      const drawer = page.getByTestId('lease-renew');
      await expectRing(page, decoder, drawer.getByTestId('lease-renew-save'), at('renew drawer save'), rows, { allowClip: !!mode.scale });
      await expectRing(page, decoder, drawer.getByRole('button').first(), at('renew drawer close'), rows, { allowClip: !!mode.scale });

      // RNT-005 owner statement (Usman may issue it): the owner list, a source link, the issue button, and its confirm dialog.
      await open(page, 'rb_accounts', '/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10', 'statement-memo-lines');
      await expectRing(page, decoder, page.getByTestId('statement-owner').getByRole('button').first(), at('statement owner list'), rows);
      await expectRing(page, decoder, page.getByTestId('statement-memo-lines').getByRole('link').first(), at('statement source link'), rows);
      await expectRing(page, decoder, page.getByTestId('statement-issue'), at('statement issue'), rows);
      await page.getByTestId('statement-issue').click();
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      if (mode.scale) expect(await layoutProblems(dialog), at('confirm dialog layout')).toEqual([]);
      // B10 (Issue #24, F-INT-3): the dialog's scrolling overlay no longer clips a button's ring at 320 px with
      // 200 % text (it cut 37 % of Cancel's), so no clipping is allowed here in any mode.
      for (const b of await dialog.getByRole('button').all()) await expectRing(page, decoder, b, at(`confirm dialog "${(await b.innerText()).trim() || (await b.getAttribute('aria-label')) || 'button'}"`), rows);
      await axe(page, testInfo, `int-rent-focus-confirm-${mode.name}-${lang(locale)}`);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);

      // PORTAL-037 the landlord's statements: the list's open button and the statement drawer's print button.
      await open(page, 'rb_landlord_tahira', '/customer/portal/rentals', 'landlord-statements', 'customer');
      await expectRing(page, decoder, page.getByTestId('landlord-statement-open').first(), at('landlord statement open'), rows);
      await page.getByTestId('landlord-statement-open').first().click();
      const detail = page.getByTestId('landlord-statement-detail');
      await expect(detail).toBeVisible();
      await expectRing(page, decoder, detail.getByTestId('landlord-statement-print'), at('landlord statement drawer print'), rows, { allowClip: !!mode.scale });
      await testInfo.attach(`rings-rentals-${mode.name}-${lang(locale)}.txt`, { body: rows.join('\n'), contentType: 'text/plain' });
      await ctx.close();
    });
  }
}

test('Rentals keyboard rings in the preset palettes (ocean, indigo, warm), light and dark, en: lease tiles, a lease link, the statement issue button', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const { ctx, page, decoder } = await newPage(browser, MODES[0]!, 'en-PK');
  const rows: string[] = [];
  for (const palette of ['ocean', 'indigo', 'warm'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      // Palette and theme are this app's own settings (not shared essentials), written as the hub would.
      await become(page, 'backoffice', 'rb_manager');
      await page.evaluate(
        ({ keys, value }) => keys.forEach((k) => localStorage.setItem(k, value)),
        { keys: [OFFICE_DISPLAY(STAFF.rb_manager!), OFFICE_DISPLAY(STAFF.rb_accounts!)], value: JSON.stringify({ version: 2, textScale: 1, theme, palette, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' }) },
      );
      await open(page, 'rb_manager', '/backoffice/rentals', 'rent-lease-list');
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-palette'))).toBe(palette);
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);
      const at = (what: string) => `${what} ${palette}-${theme}`;
      for (const id of ['rent-kpi-rent', 'rent-kpi-pending']) await expectRing(page, decoder, page.getByTestId(id), at(id), rows);
      await expectRing(page, decoder, page.getByTestId('rent-lease-link').first(), at('lease link'), rows);
      await open(page, 'rb_accounts', '/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10', 'statement-memo-lines');
      await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-palette'))).toBe(palette);
      await expectRing(page, decoder, page.getByTestId('statement-issue'), at('statement issue'), rows);
    }
  }
  await testInfo.attach('rings-rentals-palettes-en.txt', { body: rows.join('\n'), contentType: 'text/plain' });
  await ctx.close();
});
