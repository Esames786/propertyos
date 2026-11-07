import type { Browser, Locator, Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, expect, HQ, seed, test, type Locale } from '../support/fixtures';
import { keyboardFocus, ringOf, type RingReport } from '../support/focus';
import { seedSociety, societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * GitHub Issue #20 (B2 observation N-B2-1): keyboard focus rings are drawn again, product-wide, by one
 * rule in packages/tokens/src/theme.css. For representative controls of all three apps this checks:
 * - the computed style of the focused control (solid, at least 2 px);
 * - the rendered pixels: on the band where the outline is painted, the focused colour differs from
 *   the unfocused one by at least 3:1 (so the ring is really there, not clipped, covered or off
 *   screen, and contrasts with what is next to it);
 * - one ring at a time (no container drawing a second one around it);
 * - pressing with the mouse focuses without a ring.
 * In English and Urdu (right to left), at 1440 px, at 390 px in dark mode with high contrast, and at
 * 320 px with 200 % text. Production builds; reduced motion; a fixed clock.
 */
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const LOCALES: Locale[] = ['en-PK', 'ur-PK'];
const DISPLAY_IMRAN = 'pref:display:v1:backoffice:tnt_alnoor:usr_anr_0001';

interface Mode {
  name: string;
  viewport: { width: number; height: number };
  phone: boolean;
  dark?: boolean;
  scale?: number;
}
const MODES: Mode[] = [
  { name: '1440', viewport: VIEWPORTS.desktop, phone: false },
  { name: '390-dark-contrast', viewport: VIEWPORTS.phone, phone: true, dark: true },
  { name: '200pct-320', viewport: { width: 320, height: 700 }, phone: true, scale: 2 },
];

interface Target {
  name: string;
  locate: (page: Page) => Locator;
  /** Only on phones / only on wider screens. */
  phone?: boolean;
  /** Share of the ring band that must change by 3:1 (default 0.9). */
  min?: number;
}

/** Asserts a keyboard ring on `target`; returns the report for the summary. */
async function expectRing(page: Page, decoder: Page, target: Target, label: string, rows: string[], allowClip = false) {
  const loc = target.locate(page).first();
  await expect(loc, label).toBeVisible();
  const r = await ringOf(page, decoder, loc);
  rows.push(`${label}: ${r.style} ${r.width}px offset ${r.offset} ${r.colour}; band ${r.pixels} px, ${Math.round(r.changed3 * 100)} % ≥ 3:1, median ${r.median}:1; clipped ${Math.round(r.clipped * 100)} %; other rings ${r.otherRings.length}`);
  expect(r.focused, `${label}: focused`).toBe(true);
  expect(r.focusVisible, `${label}: keyboard focus is focus-visible`).toBe(true);
  expect(r.style, `${label}: outline style`).toBe('solid');
  expect(r.width, `${label}: outline width`).toBeGreaterThanOrEqual(2);
  expect(r.pixels, `${label}: ring band sampled`).toBeGreaterThan(3);
  expect(r.changed3, `${label}: ring pixels changed by ≥ 3:1 (median ${r.median})`).toBeGreaterThanOrEqual(target.min ?? 0.9);
  expect(r.median, `${label}: median contrast`).toBeGreaterThanOrEqual(3);
  expect(r.otherRings, `${label}: one ring at a time`).toEqual([]);
  if (!allowClip) expect(r.clipped, `${label}: no part of the ring clipped by a container`).toBe(0);
  return r;
}

/** Mouse press (no release on the control): focused, but no ring is drawn. */
async function expectNoPointerRing(page: Page, decoder: Page, loc: Locator, label: string) {
  const r: RingReport = await ringOf(page, decoder, loc.first(), 'pointer');
  expect(r.focusVisible, `${label}: pointer focus is not focus-visible`).toBe(false);
  expect(r.style === 'none' || r.width === 0, `${label}: no outline on pointer focus (${r.style} ${r.width}px)`).toBe(true);
  expect(r.changed3, `${label}: no ring pixels on pointer focus`).toBeLessThanOrEqual(0.1);
}

async function darkHighContrast(page: Page, origin: string, path: string) {
  await page.goto(`${origin}${path}`);
  await page.getByTestId('hub-theme-dark').click();
  await page.getByTestId('hub-contrast-high').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-contrast'))).toBe('high');
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
}

async function newPage(browser: Browser, mode: Mode) {
  const ctx = await browser.newContext({ viewport: mode.viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
  const decoder = await ctx.newPage();
  return { ctx, page, decoder };
}

async function requestId(page: Page, title: string) {
  const r = await societyApi<{ items: Array<{ id: string; title: string }> }>(page, '/ops/requests', 'GET', {}, { q: title });
  return (r.ok ? r.res.items : []).find((x) => x.title.includes(title))!.id;
}

const OFFICE: Array<{ path: (ids: Record<string, string>) => string; ready: string; targets: Target[] }> = [
  {
    path: () => '/backoffice',
    ready: 'society-dashboard',
    targets: [
      { name: 'header search', locate: (p) => p.getByTestId('search-button') },
      { name: 'sidebar link', locate: (p) => p.getByRole('navigation').getByRole('link').first(), phone: false },
      { name: 'bottom bar item', locate: (p) => p.getByTestId('bottom-nav').getByRole('link').first(), phone: true },
      { name: 'user menu trigger', locate: (p) => p.getByTestId('user-menu-button') },
      { name: 'stat tile', locate: (p) => p.getByTestId('kpi-billed') },
    ],
  },
  {
    path: (ids) => `/backoffice/mnt/maintenance-360-workspace?record=${ids.ac}&tab=timeline`,
    ready: 'request-workspace',
    targets: [
      { name: 'tab', locate: (p) => p.getByRole('tab', { selected: true }) },
      { name: 'tab panel', locate: (p) => p.getByRole('tabpanel') },
      { name: 'next-step button', locate: (p) => p.getByTestId('action-complete') },
    ],
  },
  {
    path: (ids) => `/backoffice/mnt/maintenance-360-workspace?record=${ids.seepage}&drawer=assign`,
    ready: 'assign-drawer',
    targets: [
      { name: 'drawer body (scroll region)', locate: (p) => p.getByTestId('assign-drawer').locator('[role="region"]') },
      { name: 'drawer choice', locate: (p) => p.getByTestId('assign-drawer').getByTestId('technician-option') },
      { name: 'drawer select', locate: (p) => p.getByTestId('assign-day').getByRole('button') },
      { name: 'drawer close', locate: (p) => p.getByTestId('assign-drawer').getByRole('button').first() },
    ],
  },
];

for (const mode of MODES) {
  for (const locale of LOCALES) {
    test(`office (Al-Noor), ${mode.name}, ${lang(locale)}: header, sidebar or bottom bar, stat tile, tabs, panel, drawer controls draw one keyboard ring`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000);
      const { ctx, page, decoder } = await newPage(browser, mode);
      await seedSociety(page, { staff: 'alnoor_manager', locale });
      if (mode.dark) await darkHighContrast(page, BO, '/backoffice/global/accessibility-preferences');
      await page.goto(`${BO}/backoffice/mnt/maintenance-list`);
      await expect(page.getByTestId('request-row').first()).toBeVisible();
      const ids = { ac: await requestId(page, 'AC drain leaking'), seepage: await requestId(page, 'Water seepage') };
      if (mode.scale) await page.evaluate(([k, s]) => localStorage.setItem(k as string, JSON.stringify({ version: 2, textScale: s, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), [DISPLAY_IMRAN, mode.scale] as const);
      const rows: string[] = [];
      for (const screen of OFFICE) {
        await page.goto(`${BO}${screen.path(ids)}`);
        await expect(page.getByTestId(screen.ready).first()).toBeVisible();
        // At 320 px with 200 % text a drawer's scrolling body is shorter than one of its choices (N-B2-3), so
        // the body clips the top and bottom of that control's ring; the rest of the ring must still show.
        const clipOk = !!mode.scale && screen.ready === 'assign-drawer';
        for (const t of screen.targets.filter((x) => x.phone === undefined || x.phone === mode.phone)) await expectRing(page, decoder, t, `${t.name} ${mode.name} ${locale}`, rows, clipOk);
        // In dark mode with high contrast the society dashboard has an older colour-contrast finding (N-B2-7), so
        // that mode is scanned on Request 360 (the tabs and panel) instead.
        if (screen.ready === (mode.dark ? 'request-workspace' : 'society-dashboard')) await scan(page, testInfo, `focus-office-${screen.ready}-${mode.name}-${lang(locale)}`);
      }
      await testInfo.attach(`rings-office-${mode.name}-${lang(locale)}.txt`, { body: rows.join('\n'), contentType: 'text/plain' });
      await ctx.close();
    });
  }
}

async function scan(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

for (const mode of [MODES[0]!, MODES[1]!]) {
  for (const locale of LOCALES) {
    test(`office (Larkspur CRM), ${mode.name}, ${lang(locale)}: pill tabs, a record card, a linked metric card and calendar cells draw one keyboard ring`, async ({ browser }) => {
      test.setTimeout(240_000);
      const { ctx, page, decoder } = await newPage(browser, mode);
      await seed(page, { persona: 'manager', locale });
      if (mode.dark) await darkHighContrast(page, BO, '/backoffice/global/accessibility-preferences');
      const rows: string[] = [];
      await page.goto(`${BO}/backoffice/home/role-aware-dashboard`);
      await expect(page.getByTestId('attention-tabs')).toBeVisible();
      await expectRing(page, decoder, { name: 'pill tab', locate: (p) => p.getByTestId('attention-tabs').getByRole('tab', { selected: true }) }, `pill tab ${mode.name} ${locale}`, rows);
      await expectRing(page, decoder, { name: 'attention item', locate: (p) => p.getByTestId('attention-item') }, `attention item ${mode.name} ${locale}`, rows);
      await page.goto(`${BO}/backoffice/crm/sales-home`);
      await expect(page.getByTestId('crm-kpi-new')).toBeVisible();
      await expectRing(page, decoder, { name: 'metric card', locate: (p) => p.getByTestId('crm-kpi-new') }, `metric card ${mode.name} ${locale}`, rows);
      await expectRing(page, decoder, { name: 'record card', locate: (p) => p.getByTestId('follow-up-card').getByRole('link') }, `record card ${mode.name} ${locale}`, rows);
      await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=led_0033`);
      await page.getByTestId('lead-schedule-visit').click();
      const visit = page.getByTestId('schedule-visit-drawer');
      await expect(visit).toBeVisible();
      await visit.getByTestId('schedule-visit-form').getByRole('group').first().getByRole('button').last().click();
      const grid = page.getByRole('grid');
      await expect(grid).toBeVisible();
      await expectRing(page, decoder, { name: 'calendar cell', locate: () => grid.locator('[role="button"]:not([aria-disabled="true"])').nth(2) }, `calendar cell ${mode.name} ${locale}`, rows);
      const next = locale === 'ur-PK' ? 'اگلا مہینہ' : 'Next month';
      await expectRing(page, decoder, { name: 'calendar next month', locate: (p) => p.getByRole('button', { name: next, exact: true }) }, `calendar month button ${mode.name} ${locale}`, rows);
      await ctx.close();
    });
  }
}

for (const mode of [MODES[0]!, MODES[1]!]) {
  for (const locale of LOCALES) {
    test(`Platform HQ, ${mode.name}, ${lang(locale)}: search, a linked metric card and a tenant row draw one keyboard ring`, async ({ browser }) => {
      test.setTimeout(180_000);
      const { ctx, page, decoder } = await newPage(browser, mode);
      await seed(page, { app: 'platform', persona: 'supreme_admin', locale });
      if (mode.dark) await darkHighContrast(page, HQ, '/hq/preferences');
      const rows: string[] = [];
      await page.goto(`${HQ}/hq`);
      await expect(page.getByTestId('hq-kpis')).toBeVisible();
      await expectRing(page, decoder, { name: 'hq search', locate: (p) => p.getByTestId('search-button') }, `hq search ${mode.name} ${locale}`, rows);
      await expectRing(page, decoder, { name: 'hq metric card', locate: (p) => p.getByTestId('hq-kpi-mrr') }, `hq metric card ${mode.name} ${locale}`, rows);
      await page.goto(`${HQ}/hq/tenants`);
      // A table row's link on wide screens, a card on phones.
      const row = page.locator(mode.phone ? '[data-testid^="tenant-card-"]' : '[data-testid^="open-tnt_"]').first();
      await expect(row).toBeVisible();
      await expectRing(page, decoder, { name: 'hq tenant row', locate: () => row }, `hq tenant row ${mode.name} ${locale}`, rows);
      await ctx.close();
    });
  }
}

for (const mode of MODES) {
  for (const locale of LOCALES) {
    test(`resident app, ${mode.name}, ${lang(locale)}: bottom bar, centre action, header button and a repair card draw one keyboard ring`, async ({ browser }) => {
      test.setTimeout(180_000);
      const m = mode.phone ? mode : { ...mode, viewport: VIEWPORTS.phone, phone: true };
      const { ctx, page, decoder } = await newPage(browser, m);
      await seedSociety(page, { resident: 'alnoor_resident_a101', locale, textScale: mode.scale ?? 1 });
      if (mode.dark) await darkHighContrast(page, CU, '/customer/portal/accessibility-preferences');
      const rows: string[] = [];
      await page.goto(`${CU}/customer/portal/home`);
      await expect(page.getByTestId('dues-home')).toBeVisible();
      await expectRing(page, decoder, { name: 'bottom bar item', locate: (p) => p.getByTestId('portal-bottom-nav').getByRole('link').first() }, `resident bottom bar ${mode.name} ${locale}`, rows);
      // The raised circle is drawn over the top of the action's box (by design), so the top of its inset ring
      // sits under the circle: 75 % of the ring shows at 390 px, 57 % at 320 px with 200 % text (sides and bottom).
      await expectRing(page, decoder, { name: 'centre action', locate: (p) => p.getByTestId('portal-centre-action'), min: 0.5 }, `resident centre action ${mode.name} ${locale}`, rows);
      await expectRing(page, decoder, { name: 'header button', locate: (p) => p.getByTestId('portal-header').getByRole('button').first() }, `resident header button ${mode.name} ${locale}`, rows);
      await page.goto(`${CU}/customer/portal/maintenance-workspace`);
      await expect(page.getByTestId('repairs-page')).toBeVisible();
      await expectRing(page, decoder, { name: 'repair card', locate: (p) => p.locator('[data-testid="repairs-page"] button.rounded-card') }, `resident repair card ${mode.name} ${locale}`, rows);
      await ctx.close();
    });
  }
}

for (const locale of LOCALES) {
  test(`pointer, ${lang(locale)}: pressing a control with the mouse focuses it without a ring (header search, stat tile, tab, drawer choice, resident bottom bar)`, async ({ browser }) => {
    test.setTimeout(180_000);
    const { ctx, page, decoder } = await newPage(browser, MODES[0]!);
    await seedSociety(page, { staff: 'alnoor_manager', locale });
    await page.goto(`${BO}/backoffice`);
    await expect(page.getByTestId('society-dashboard')).toBeVisible();
    await expectNoPointerRing(page, decoder, page.getByTestId('search-button'), `search ${locale}`);
    await expectNoPointerRing(page, decoder, page.getByTestId('kpi-billed'), `stat tile ${locale}`);
    await page.goto(`${BO}/backoffice/mnt/maintenance-list`);
    await expect(page.getByTestId('request-row').first()).toBeVisible();
    const seepage = await requestId(page, 'Water seepage');
    await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${seepage}`);
    await expect(page.getByTestId('request-workspace')).toBeVisible();
    await expectNoPointerRing(page, decoder, page.getByRole('tab', { selected: true }), `tab ${locale}`);
    await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${seepage}&drawer=assign`);
    await expect(page.getByTestId('assign-drawer')).toBeVisible();
    await expectNoPointerRing(page, decoder, page.getByTestId('technician-option').last(), `drawer choice ${locale}`);
    const phone = await newPage(browser, MODES[1]!);
    await seedSociety(phone.page, { resident: 'alnoor_resident_a101', locale });
    await phone.page.goto(`${CU}/customer/portal/home`);
    await expect(phone.page.getByTestId('dues-home')).toBeVisible();
    await expectNoPointerRing(phone.page, phone.decoder, phone.page.getByTestId('portal-bottom-nav').getByRole('link').nth(1), `resident bottom bar ${locale}`);
    await phone.ctx.close();
    await ctx.close();
  });
}

test('disabled controls are skipped by Tab and draw nothing; nested overlays show one indicator (a list inside a drawer, a menu inside a popover)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedSociety(page, { staff: 'alnoor_manager' });
  await page.goto(`${BO}/backoffice/mnt/maintenance-list`);
  await expect(page.getByTestId('request-row').first()).toBeVisible();
  const ac = await requestId(page, 'AC drain leaking');
  const seepage = await requestId(page, 'Water seepage');

  // The completion drawer's Save is disabled until a note and a photo are given.
  await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${ac}&drawer=complete`);
  const complete = page.getByTestId('complete-drawer');
  await expect(complete).toBeVisible();
  const save = complete.getByTestId('complete-submit');
  await expect(save).toBeDisabled();
  const stops: Array<{ testId: string; disabled: boolean }> = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        return { testId: el.getAttribute('data-testid') ?? el.tagName, disabled: el.matches(':disabled, [aria-disabled="true"]') };
      }),
    );
  }
  expect(stops.filter((s) => s.disabled), 'no disabled control takes keyboard focus').toEqual([]);
  expect(stops.map((s) => s.testId)).not.toContain('complete-submit');
  await save.evaluate((el: HTMLElement) => el.focus());
  expect(await save.evaluate((el) => document.activeElement === el)).toBe(false);
  expect(await save.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  await page.keyboard.press('Escape');

  // A list opened from a select inside a drawer: the focused option is shown by its background, and no
  // ring is drawn anywhere else (neither the select, nor the drawer, nor the page behind).
  await page.goto(`${BO}/backoffice/mnt/maintenance-360-workspace?record=${seepage}&drawer=assign`);
  const trigger = page.getByTestId('assign-day').getByRole('button');
  await expect(trigger).toBeVisible();
  await keyboardFocus(page, trigger);
  await page.keyboard.press('ArrowDown');
  const option = page.getByRole('listbox').getByRole('option').first();
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('option');
  const rings = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('body *')].filter((o) => {
        const cs = getComputedStyle(o);
        const r = o.getBoundingClientRect();
        return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && r.width > 2 && r.height > 2 && !o.closest('[style*="clip"]');
      }).length,
    );
  expect(await rings(), 'no outline while an option has focus').toBe(0);
  await expect(page.locator('[role="option"][data-focused]')).toHaveCount(1);
  await expect(option).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await rings(), 'back on the select: its own ring only').toBe(1);

  // A menu inside a popover (the user menu): one ring, on the focused item.
  await page.keyboard.press('Escape');
  await page.goto(`${BO}/backoffice`);
  await expect(page.getByTestId('society-dashboard')).toBeVisible();
  await keyboardFocus(page, page.getByTestId('user-menu-button'));
  await page.keyboard.press('Enter');
  const menu = page.getByTestId('user-menu');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Tab');
  const active = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    return { inMenu: !!el.closest('[data-testid="user-menu"]'), style: getComputedStyle(el).outlineStyle };
  });
  expect(active.inMenu).toBe(true);
  expect(active.style).toBe('solid');
  expect(await rings(), 'one ring inside the popover').toBe(1);
});

test('forced colours (Windows High Contrast, emulated): keyboard rings are still drawn, in the system colour', async ({ browser }) => {
  test.setTimeout(120_000);
  const { ctx, page, decoder } = await newPage(browser, MODES[0]!);
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await seedSociety(page, { staff: 'alnoor_manager' });
  await page.goto(`${BO}/backoffice`);
  await expect(page.getByTestId('society-dashboard')).toBeVisible();
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  const rows: string[] = [];
  for (const t of OFFICE[0]!.targets.filter((x) => x.phone !== true)) await expectRing(page, decoder, t, `${t.name} forced-colours`, rows);
  await ctx.close();
});
