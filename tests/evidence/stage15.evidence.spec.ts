import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { BO, expect, seed, test, waitForApp, type Locale, type PersonaId } from '../support/fixtures';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * Stage 1.5 step 1 evidence → docs/status/ui-stage-1.5/{screenshots,video}.
 * Run on its own (`npx playwright test --project=evidence tests/evidence/stage15.evidence.spec.ts`)
 * so the Stage 1 screenshots stay untouched as the "before" set.
 */
const DIR = 'docs/status/ui-stage-1.5/screenshots';
const VIDEO = 'docs/status/ui-stage-1.5/video';
const DASH = '/backoffice/home/role-aware-dashboard';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage });

async function open(
  browser: Browser,
  vp: ViewportName,
  path: string,
  opts: { persona?: PersonaId; locale?: Locale; onboarding?: 'fresh' | 'done'; a11y?: Record<string, unknown>; context?: BrowserContextOptions } = {},
): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORTS[vp], ...opts.context });
  const page = await context.newPage();
  await seed(page, { persona: opts.persona ?? 'manager', locale: opts.locale ?? 'en-PK', onboarding: opts.onboarding ?? 'done', a11y: opts.a11y });
  await page.goto(`${BO}${path}`);
  await waitForApp(page);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1400); // let count-ups and draw-ins settle
  return page;
}

/** Scroll so an element sits under the sticky header, then capture the viewport. */
async function frame(page: Page, selector: string, name: string) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 84, behavior: 'instant' as ScrollBehavior });
  }, selector);
  await page.waitForTimeout(900);
  await shot(page, name);
}

test.describe.configure({ mode: 'parallel' });

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const l = lang(locale);

  test(`dashboard desktop and tablet (${l})`, async ({ browser }) => {
    let page = await open(browser, 'desktop', DASH, { locale });
    await shot(page, `dashboard-1440-${l}`);
    await shot(page, `dashboard-1440-${l}-full`, true);
    await page.context().close();
    page = await open(browser, 'tablet', DASH, { locale });
    await shot(page, `dashboard-768-${l}`);
    await page.context().close();
  });

  test(`dashboard phone frames (${l})`, async ({ browser }) => {
    const page = await open(browser, 'phone', DASH, { locale });
    await shot(page, `dashboard-390-${l}-1-hero`);
    await frame(page, '[data-testid="action-centre"]', `dashboard-390-${l}-2-actions`);
    await frame(page, '[data-testid="kpi-row"]', `dashboard-390-${l}-3-kpis`);
    await frame(page, '[data-testid="collections-chart"]', `dashboard-390-${l}-4-collections`);
    await frame(page, '[data-testid="funnel-chart"]', `dashboard-390-${l}-5-funnel`);
    await frame(page, '[data-testid="inventory-chart"]', `dashboard-390-${l}-6-inventory`);
    await frame(page, '[data-testid="construction-card"]', `dashboard-390-${l}-7-construction`);
    await frame(page, '[data-testid="residences"]', `dashboard-390-${l}-8-residences`);
    await page.locator('[data-tour-id="nav-menu-button"]').click();
    await page.waitForTimeout(500);
    await shot(page, `menu-sheet-390-${l}`);
    await page.context().close();
  });

  test(`roles (${l})`, async ({ browser }) => {
    for (const persona of ['sales', 'finance'] as const) {
      const page = await open(browser, 'desktop', DASH, { locale, persona });
      await shot(page, `dashboard-1440-${persona}-${l}-full`, true);
      await page.context().close();
    }
  });

  test(`interactions (${l})`, async ({ browser }) => {
    test.setTimeout(150_000);
    const page = await open(browser, 'desktop', DASH, { locale });
    const perf = page.locator('section', { has: page.getByTestId('range-control') });

    await page.getByTestId('range-control').locator('label').last().click();
    await page.waitForTimeout(1400);
    await perf.screenshot({ path: `${DIR}/range-12m-1440-${l}.png` });

    const columns = page.getByTestId('collections-chart').getByTestId('chart-column');
    await columns.nth(7).hover();
    await page.waitForTimeout(400);
    await page.getByTestId('collections-chart').screenshot({ path: `${DIR}/chart-tooltip-1440-${l}.png` });

    await page.mouse.move(0, 0);
    await columns.nth(9).focus();
    await page.keyboard.press(locale === 'ur-PK' ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForTimeout(300);
    await page.getByTestId('collections-chart').screenshot({ path: `${DIR}/chart-keyboard-focus-1440-${l}.png` });

    await page.getByTestId('collections-chart-table-toggle').click();
    await page.getByTestId('inventory-chart-table-toggle').click();
    await page.waitForTimeout(300);
    await page.getByTestId('collections-chart').screenshot({ path: `${DIR}/chart-data-table-1440-${l}.png` });
    await page.getByTestId('inventory-chart').screenshot({ path: `${DIR}/inventory-data-table-1440-${l}.png` });

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
    await page.getByTestId('showcase-next').click();
    await page.waitForTimeout(900);
    await page.getByTestId('attention-tabs').getByRole('tab').nth(1).click();
    await page.waitForTimeout(500);
    await shot(page, `showcase-gardens-followups-1440-${l}`);

    await page.context().close();

    const p2 = await open(browser, 'desktop', DASH, { locale });
    // Centre the card so the sticky header never sits over the hovered row.
    await p2.getByTestId('inventory-chart').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior }));
    await p2.waitForTimeout(300);
    await p2.getByTestId('stack-row').nth(1).hover({ timeout: 10_000 });
    await p2.waitForTimeout(400);
    await p2.getByTestId('inventory-chart').screenshot({ path: `${DIR}/inventory-tooltip-1440-${l}.png` });
    await p2.locator('[data-tour-id="project-switcher"]').click();
    await p2.getByRole('option', { name: 'Larkspur Gardens' }).click();
    await p2.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
    await p2.waitForTimeout(1400);
    await shot(p2, `project-filter-gardens-1440-${l}`);
    await p2.context().close();
  });

  test(`shell states (${l})`, async ({ browser }) => {
    let page = await open(browser, 'desktop', '/backoffice/lab', { locale });
    await shot(page, `lab-restyled-1440-${l}`);
    await page.getByRole('button', { name: locale === 'ur-PK' ? 'سائیڈ بار سمیٹیں' : 'Collapse sidebar' }).click();
    await page.goto(`${BO}${DASH}`);
    await waitForApp(page);
    await page.waitForTimeout(1400);
    await shot(page, `rail-collapsed-1440-${l}`);
    await page.context().close();

    page = await open(browser, 'desktop', DASH, { locale, persona: 'sales', onboarding: 'fresh' });
    await page.getByTestId('welcome-start').click();
    await page.getByTestId('tour-next').click();
    await page.waitForTimeout(600);
    await shot(page, `tour-rail-step-1440-${l}`);
    await page.context().close();

    page = await open(browser, 'phone', DASH, { locale, persona: 'sales', onboarding: 'fresh' });
    await page.getByTestId('welcome-start').click();
    await page.getByTestId('tour-next').click();
    await page.waitForTimeout(600);
    await shot(page, `tour-menu-step-390-${l}`);
    await page.context().close();
  });
}

test('accessibility preferences: high contrast + reduced motion, reflow, 200 % zoom', async ({ browser }) => {
  let page = await open(browser, 'desktop', DASH, { a11y: { motion: 'reduce', contrast: 'more', sound: false, textOnlyGuide: false } });
  await shot(page, 'dashboard-1440-en-high-contrast-reduced-motion');
  await page.context().close();
  for (const vp of ['reflow', 'zoom200'] as const) {
    page = await open(browser, vp, DASH);
    await shot(page, `dashboard-${vp}-en`);
    await page.context().close();
  }
  page = await open(browser, 'reflow', DASH, { locale: 'ur-PK' });
  await shot(page, 'dashboard-reflow-ur');
  await page.context().close();
});

test('interaction video (desktop, English → Urdu)', async ({ browser }) => {
  test.setTimeout(120_000);
  mkdirSync(VIDEO, { recursive: true });
  const page = await open(browser, 'desktop', DASH, { context: { recordVideo: { dir: 'test-results/video-desktop', size: { width: 1440, height: 900 } } } });
  const pause = (ms = 900) => page.waitForTimeout(ms);
  await pause(1200);
  await page.getByTestId('showcase-next').click();
  await pause(1400);
  await page.getByTestId('showcase-prev').click();
  await pause(1000);
  await page.getByTestId('attention-tabs').getByRole('tab').nth(1).click();
  await pause();
  await page.getByTestId('attention-tabs').getByRole('tab').nth(2).click();
  await pause();
  await page.getByTestId('kpi-row').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 520);
  await pause();
  const labels = page.getByTestId('range-control').locator('label');
  await labels.nth(0).click();
  await pause(1500);
  await labels.nth(3).click();
  await pause(1600);
  const columns = page.getByTestId('collections-chart').getByTestId('chart-column');
  for (const i of [2, 5, 8, 11]) {
    await columns.nth(i).hover();
    await pause(500);
  }
  await page.mouse.move(10, 10);
  await columns.nth(11).focus();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowLeft');
    await pause(450);
  }
  await page.getByTestId('collections-chart-table-toggle').click();
  await pause(1200);
  await page.getByTestId('collections-chart-table-toggle').click();
  await pause(600);
  await page.mouse.wheel(0, 700);
  await pause();
  for (const i of [0, 2, 4]) {
    await page.getByTestId('stack-row').nth(i).hover();
    await pause(600);
  }
  await page.mouse.wheel(0, 700);
  await pause();
  await page.getByRole('button', { name: 'Next residences' }).click();
  await pause();
  await page.getByRole('button', { name: 'Next residences' }).click();
  await pause();
  await page.getByTestId('residence-card').nth(3).hover();
  await pause();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await pause(1200);
  await page.locator('[data-tour-id="project-switcher"]').click();
  await pause(500);
  await page.getByRole('option', { name: 'Larkspur Gardens' }).click();
  await pause(1600);
  await page.getByTestId('locale-toggle').first().click();
  await pause(1800);
  await page.mouse.wheel(0, 1100);
  await pause(1500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await pause(1200);
  const video = page.video();
  await page.context().close();
  copyFileSync(await video!.path(), `${VIDEO}/dashboard-desktop.webm`);
});

test('interaction video (phone)', async ({ browser }) => {
  test.setTimeout(90_000);
  mkdirSync(VIDEO, { recursive: true });
  const page = await open(browser, 'phone', DASH, { context: { recordVideo: { dir: 'test-results/video-phone', size: { width: 390, height: 844 } }, hasTouch: true } });
  const pause = (ms = 900) => page.waitForTimeout(ms);
  await pause(1000);
  await page.getByTestId('showcase-next').tap();
  await pause(1300);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 420);
    await pause(700);
  }
  await page.getByTestId('collections-chart').scrollIntoViewIfNeeded();
  await page.getByTestId('collections-chart').getByTestId('chart-column').nth(3).tap();
  await pause(1000);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 480);
    await pause(650);
  }
  await page.getByRole('navigation', { name: 'Quick navigation' }).getByRole('button', { name: 'More' }).tap();
  await pause(1200);
  await page.keyboard.press('Escape');
  await pause(600);
  const video = page.video();
  await page.context().close();
  copyFileSync(await video!.path(), `${VIDEO}/dashboard-phone.webm`);
  expect(true).toBe(true);
});
