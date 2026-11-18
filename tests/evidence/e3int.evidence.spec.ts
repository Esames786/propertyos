import { mkdirSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { BO, expect, seed, test, type Locale } from '../support/fixtures';
import { keyboardFocus } from '../support/focus';
import { VIEWPORTS } from '../support/viewports';
import { becomePrincipal, call, seedPrincipal } from '../support/e3-pricing';
import { EDITORS, SCREENS } from '../support/e3-editors';

/**
 * Gate E.3 Wave 2 integration evidence → docs/status/integration-e3/screenshots: the states the integration
 * added. Permission-denied outcomes (COM screen and the INV-007 drawer), the one not-found of a private draft
 * opened by link, the discount rows read as deductions, and a select at 320 px with 200 % text (whole chosen text,
 * keyboard focus ring). English and Urdu. Every name ends with the viewport width and the language; all records
 * are fictional drafts of the test-only pricing principal (Playwright build only).
 */
const DIR = 'docs/status/integration-e3/screenshots';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');

async function shot(page: Page, name: string, fullPage = true) {
  if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage, animations: 'disabled', caret: 'hide' });
  const m = /-(\d+)-(?:en|ur)$/.exec(name);
  if (m) expect(Number(m[1]), name).toBe(page.viewportSize()!.width);
}

test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`denied outcomes, ${lang(locale)}: COM-001 and the INV-007 drawer for a role without pricing.manage`, async ({ browser }) => {
    test.setTimeout(120_000);
    for (const [mode, viewport] of [['1440', VIEWPORTS.desktop], ['390', VIEWPORTS.phone]] as const) {
      const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await seed(page, { persona: 'sales', locale });
      await page.goto(`${BO}/backoffice/com/payment-plan-templates`);
      await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
      await shot(page, `denied-com-001-${mode}-${lang(locale)}`);
      await page.goto(`${BO}/backoffice/inv/edit-price-drawer`);
      await page.getByTestId('price-change-unit').first().click();
      await expect(page.getByTestId('price-change-no-pricing-permission')).toBeVisible();
      await shot(page, `denied-inv-007-drawer-${mode}-${lang(locale)}`, false);
      await ctx.close();
    }
  });

  test(`deep links, ${lang(locale)}: a private draft opened by its creator, and the one not-found for anyone else`, async ({ browser }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await seedPrincipal(page, 'res_e3qa_pricing', { locale });
    const e = EDITORS[1]!;
    await page.goto(`${BO}${e.path}`);
    await expect(page.getByTestId(e.page)).toBeVisible();
    const body = { projectId: 'prj_heights', title: 'Heights rates', rules: [{ unitType: 'residential', baseRate: { amount: '18500.00', currency: 'PKR' }, floorRiseBps: 150, cornerPremiumBps: 500, parkFacingPremiumBps: 300 }] };
    const created = await call<{ id: string }>(page, { method: 'POST', path: e.api, idempotencyKey: 'qa-evidence-link-01', body: { ...body, idempotencyKey: 'qa-evidence-link-01' } });
    expect(created.ok).toBe(true);
    const id = created.ok ? created.body.id : '';
    await page.goto(`${BO}${e.path}?record=${id}`);
    await expect(e.title(page)).toHaveValue('Heights rates');
    await shot(page, `link-com-003-creator-1440-${lang(locale)}`);
    await becomePrincipal(page, 'res_e3qa_pricing_peer');
    await page.goto(`${BO}${e.path}?record=${id}`);
    await expect(page.getByTestId('state-not-found')).toBeVisible();
    await shot(page, `link-com-003-not-found-1440-${lang(locale)}`);
    await ctx.close();
  });

  test(`discount rows and selects, ${lang(locale)}: COM-004 preview at 390 px; COM-001 at 320 px with 200 % text`, async ({ browser }) => {
    test.setTimeout(180_000);
    let ctx = await browser.newContext({ viewport: VIEWPORTS.phone, reducedMotion: 'reduce' });
    let page = await ctx.newPage();
    await seedPrincipal(page, 'res_e3qa_pricing', { locale });
    await SCREENS.find((s) => s.id === 'COM-004')!.prepare(page);
    const result = page.getByTestId('commercial-preview-result');
    await result.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await result.screenshot({ path: `${DIR}/discount-com-004-preview-390-${lang(locale)}.png`, animations: 'disabled' });
    await ctx.close();
    ctx = await browser.newContext({ viewport: VIEWPORTS.reflow, reducedMotion: 'reduce' });
    page = await ctx.newPage();
    await seedPrincipal(page, 'res_e3qa_pricing', { locale, textScale: 2 });
    const e = EDITORS[0]!;
    await page.goto(`${BO}${e.path}`);
    await expect(e.project(page).locator('option')).not.toHaveCount(1);
    await e.project(page).selectOption('prj_heights');
    await keyboardFocus(page, e.project(page));
    const box = page.locator('[data-fit-select]').filter({ has: e.project(page) });
    await box.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(box.locator('[data-fit-select-text]')).toHaveText('Larkspur Heights');
    await shot(page, `select-com-001-project-focus-200pct-320-${lang(locale)}`, false);
    await ctx.close();
  });
}
