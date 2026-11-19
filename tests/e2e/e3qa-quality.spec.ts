import type { Locator } from '@playwright/test';
import { expect, test, type Locale } from '../support/fixtures';
import { scanA11y } from '../support/axe';
import { layoutProblems } from '../support/layout';
import { VIEWPORTS } from '../support/viewports';
import { seedPrincipal } from '../support/e3-pricing';
import { SCREENS } from '../support/e3-editors';

/**
 * Gate E.3 local validation (Issue #33): the seven E.3 screens in their authorized, populated state (the
 * test-only pricing principal; a draft with two versions selected; a preview computed), in English and Urdu
 * (right to left), at 1440 px, at 390 px, at 320 px with 200 % text, and in dark mode. On every screen: the
 * document direction, no sideways scroll, no clipped or off-screen text or control (layoutProblems), and
 * axe (WCAG 2.2 AA) with no violation. Keyboard journeys are in e3qa-keyboard.spec.ts.
 */

const MODES = [
  { name: '1440', viewport: VIEWPORTS.desktop, textScale: 1, theme: 'light' },
  { name: '390', viewport: VIEWPORTS.phone, textScale: 1, theme: 'light' },
  { name: '200pct-320', viewport: VIEWPORTS.reflow, textScale: 2, theme: 'light' },
  { name: 'dark-1440', viewport: VIEWPORTS.desktop, textScale: 1, theme: 'dark' },
  { name: 'dark-390', viewport: VIEWPORTS.phone, textScale: 1, theme: 'dark' },
] as const;
const LOCALES: readonly Locale[] = ['en-PK', 'ur-PK'];
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');

for (const mode of MODES) {
  for (const locale of LOCALES) {
    test(`E.3 screens, ${mode.name}, ${lang(locale)}: direction, reflow, layout and axe on all seven`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000);
      const ctx = await browser.newContext({ viewport: mode.viewport, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
      await seedPrincipal(page, 'res_e3qa_pricing', { locale, textScale: mode.textScale, theme: mode.theme });
      const rows: string[] = [];
      for (const screen of SCREENS) {
        await screen.prepare(page);
        const at = `${screen.id} ${mode.name} ${lang(locale)}`;
        await expect(page.locator('html'), at).toHaveAttribute('dir', locale === 'ur-PK' ? 'rtl' : 'ltr');
        if (mode.theme === 'dark') await expect(page.locator('html'), at).toHaveAttribute('data-theme', 'dark');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect.soft(overflow, `${at}: sideways scroll`).toBeLessThanOrEqual(0);
        const region: Locator = screen.region(page);
        const problems = await layoutProblems(screen.id === 'INV-007' ? region : page);
        expect.soft(problems, `${at}: layout`).toEqual([]);
        const { violations } = await scanA11y(page, testInfo, `e3qa-${screen.slug}-${mode.name}-${lang(locale)}`);
        expect.soft(violations, `${at}: axe`).toEqual([]);
        rows.push(`${at}: overflow ${overflow}, layout ${problems.length}, axe ${violations.length}`);
        if (screen.id === 'INV-007') await page.keyboard.press('Escape');
      }
      await testInfo.attach(`e3qa-quality-${mode.name}-${lang(locale)}.txt`, { body: rows.join('\n'), contentType: 'text/plain' });
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
}
