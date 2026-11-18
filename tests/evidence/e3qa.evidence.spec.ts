import { mkdirSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { BO, expect, test, type Locale } from '../support/fixtures';
import { keyboardFocus } from '../support/focus';
import { VIEWPORTS } from '../support/viewports';
import { seedPrincipal } from '../support/e3-pricing';
import { EDITORS, SCREENS } from '../support/e3-editors';

/**
 * Gate E.3 local validation evidence → docs/status/gate-e3-local-validation/screenshots.
 * The seven E.3 screens (INV-006, INV-007, COM-001 … COM-005), each in its authorized, populated state with
 * the test-only pricing principal (Playwright build only): English and Urdu at 1440 px, 390 px and 320 px
 * with 200 % text, and dark mode at 1440 px (English) and 390 px (Urdu); plus keyboard focus on the save
 * actions. Each name ends with the viewport width and the language. All records are fictional drafts.
 * Run against a Playwright build:
 * `E2E_PORT_OFFSET=3200 npx playwright test --project=evidence tests/evidence/e3qa.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-e3-local-validation/screenshots';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const SHOTS = [
  { mode: '1440', viewport: VIEWPORTS.desktop, textScale: 1, theme: 'light', locales: ['en-PK', 'ur-PK'] },
  { mode: '390', viewport: VIEWPORTS.phone, textScale: 1, theme: 'light', locales: ['en-PK', 'ur-PK'] },
  { mode: '200pct-320', viewport: VIEWPORTS.reflow, textScale: 2, theme: 'light', locales: ['en-PK', 'ur-PK'] },
  { mode: 'dark-1440', viewport: VIEWPORTS.desktop, textScale: 1, theme: 'dark', locales: ['en-PK'] },
  { mode: 'dark-390', viewport: VIEWPORTS.phone, textScale: 1, theme: 'dark', locales: ['ur-PK'] },
] as const;

async function shot(page: Page, name: string, fullPage: boolean) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage, animations: 'disabled', caret: 'hide' });
  const m = /-(\d+)-(?:en|ur)$/.exec(name);
  if (m) expect(Number(m[1]), name).toBe(page.viewportSize()!.width);
}

async function focusRing(page: Page, loc: Locator) {
  await loc.scrollIntoViewIfNeeded();
  await keyboardFocus(page, loc);
  await loc.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const ring = await loc.evaluate((el) => ({ focused: document.activeElement === el, style: getComputedStyle(el).outlineStyle, width: parseFloat(getComputedStyle(el).outlineWidth) }));
  expect(ring).toMatchObject({ focused: true, style: 'solid' });
  expect(ring.width).toBeGreaterThanOrEqual(2);
}

test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

for (const s of SHOTS) {
  for (const locale of s.locales) {
    test(`E.3 screens ${s.mode} ${lang(locale)}`, async ({ browser }) => {
      test.setTimeout(240_000);
      const ctx = await browser.newContext({ viewport: s.viewport, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await seedPrincipal(page, 'res_e3qa_pricing', { locale, textScale: s.textScale, theme: s.theme });
      for (const screen of SCREENS) {
        await screen.prepare(page);
        // From the top: a full-page picture of a scrolled page would draw the sticky header over the content.
        if (screen.id !== 'INV-007') await page.evaluate(() => window.scrollTo(0, 0));
        // The drawer is fixed over the page: its picture is the viewport; pages are captured whole.
        await shot(page, `${screen.slug}-${s.mode}-${lang(locale)}`, screen.id !== 'INV-007');
        if (screen.id === 'INV-007') await page.keyboard.press('Escape');
      }
      await ctx.close();
    });
  }
}

test('keyboard focus on the save actions (1440 English, 320 px 200 % Urdu)', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const [mode, viewport, textScale, locale] of [['1440', VIEWPORTS.desktop, 1, 'en-PK'], ['200pct-320', VIEWPORTS.reflow, 2, 'ur-PK']] as const) {
    const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await seedPrincipal(page, 'res_e3qa_pricing', { locale, textScale });
    const e = EDITORS[0]!;
    await page.goto(`${BO}${e.path}`);
    await expect(e.project(page).locator('option')).not.toHaveCount(1);
    await e.project(page).selectOption('prj_heights');
    await e.title(page).fill(locale === 'ur-PK' ? 'ہائٹس منصوبہ (مسودہ)' : 'Heights plan (draft)');
    await focusRing(page, page.getByTestId(e.save));
    await shot(page, `focus-com-001-save-${mode}-${lang(locale)}`, false);
    await SCREENS.find((x) => x.id === 'INV-007')!.prepare(page);
    await page.getByTestId('price-change-proposed').fill('33750000.00');
    await focusRing(page, page.getByTestId('price-change-save'));
    await shot(page, `focus-inv-007-save-${mode}-${lang(locale)}`, false);
    await ctx.close();
  }
});
