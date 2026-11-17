import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { BO, expect, seed, test, type Locale } from '../support/fixtures';
import { keyboardFocus } from '../support/focus';
import { describeEdges, edgesOfFocused, focusedName, ringProblems, statTileLabels } from '../support/ring-edges';

/**
 * UX B10 (GitHub Issue #24) cross-browser smoke (Firefox and WebKit projects), at 320 px with 200 % text:
 * the Rentals owner-payable tile's whole label (F-INT-1), and in the statement-issue confirm dialog the
 * keyboard ring of every control Tab reaches is whole on every border (F-INT-3: the dialog's overlay keeps a
 * focused control clear of its edge; this relies on each engine honouring scroll padding when focus scrolls).
 * The full checks run in Chromium (tests/e2e/ux-b10.spec.ts).
 */
const display = (principal: string) => `pref:display:v1:backoffice:tnt_riverbend:${principal}`;
const COMMON_TEXT = (locale: Locale) => JSON.parse(readFileSync(`packages/i18n/locales/${locale}/common.json`, 'utf8')) as { actions: { cancel: string; close: string } };
const RENTALS_TEXT = (locale: Locale) => JSON.parse(readFileSync(`packages/i18n/locales/${locale}/rentals.json`, 'utf8')) as { leases: { kpi: { payable: string } }; statements: { issue: string } };

async function setUp(page: Page, locale: Locale) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await page.setViewportSize({ width: 320, height: 700 });
  await seed(page, { persona: 'rb_accounts', locale });
  for (const p of ['usr_rb_0002', 'usr_rb_0004']) await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: display(p) });
}

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`B10 ${locale === 'ur-PK' ? 'ur' : 'en'}, 320 px at 200 % text: the owner-payable label is whole; in the statement-issue dialog every ring Tab reaches is whole`, async ({ page, browser }, testInfo) => {
    test.setTimeout(180_000);
    await setUp(page, locale);
    await page.goto(`${BO}/backoffice/rentals`);
    await expect(page.getByTestId('rent-kpi-payable')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-text-scale'))).toBe('200');
    const payable = (await statTileLabels(page)).find((l) => l.id === 'rent-kpi-payable')!;
    expect(payable.text).toBe(RENTALS_TEXT(locale).leases.kpi.payable);
    expect(payable.lineClamp === 'none' || payable.lineClamp === '', `line-clamp ${payable.lineClamp}`).toBe(true);
    // The label never clips (Firefox counts the ink of Urdu letters below the last line in scrollHeight, so the
    // box's overflow is what decides whether anything is cut).
    expect(payable.overflow, 'the label does not clip its text').toBe('visible visible');
    expect(payable.inTile && payable.inLabel && payable.onScreen, 'every line within the label\'s width, inside the tile and on the screen').toBe(true);

    const words = { ...COMMON_TEXT(locale).actions, issue: RENTALS_TEXT(locale).statements.issue };
    const decoding = await browser.newContext();
    const decoder = await decoding.newPage();
    await page.goto(`${BO}/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10`);
    const issue = page.getByTestId('statement-issue');
    await expect(issue).toBeVisible();
    await keyboardFocus(page, issue);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    const rows: string[] = [];
    for (const name of [words.close, words.cancel, words.issue, words.close]) {
      await page.keyboard.press('Tab');
      await expect.poll(() => focusedName(page)).toBe(name);
      await page.waitForTimeout(150);
      const r = await edgesOfFocused(page, decoder);
      rows.push(describeEdges(`Tab to "${name}"`, r));
      expect(ringProblems(r), `"${name}": the whole ring is visible`).toEqual([]);
    }
    await testInfo.attach('rings.txt', { body: rows.join('\n'), contentType: 'text/plain' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await decoding.close();
  });
}
