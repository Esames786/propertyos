import type { Browser, Page } from '@playwright/test';
import { BO, CU, expect, seed, test, waitForApp, type Locale, type PersonaId } from '../support/fixtures';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/** Stage 1 screenshot matrix (Stage 1 plan §7) → docs/status/ui-stage-1/screenshots. */
const DIR = 'docs/status/ui-stage-1/screenshots';
const shot = (page: Page, name: string) => page.screenshot({ path: `${DIR}/${name}.png`, animations: 'disabled' });
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');

async function open(browser: Browser, vp: ViewportName, path: string, opts: { persona?: PersonaId; locale?: Locale; onboarding?: 'fresh' | 'done'; app?: 'backoffice' | 'customer'; a11y?: Record<string, unknown> } = {}): Promise<Page> {
  // Fresh context per shot: demo state is seeded once per context.
  const context = await browser.newContext({ viewport: VIEWPORTS[vp] });
  const page = await context.newPage();
  await seed(page, { persona: opts.persona ?? 'manager', locale: opts.locale ?? 'en-PK', onboarding: opts.onboarding ?? 'done', app: opts.app ?? 'backoffice', a11y: opts.a11y });
  await page.goto(`${opts.app === 'customer' ? CU : BO}${path}`);
  await waitForApp(page);
  await page.waitForTimeout(400);
  return page;
}

test.describe.configure({ mode: 'parallel' });

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const l = lang(locale);

  test(`shell and labs (${l})`, async ({ browser }) => {
    let page: Page;
    for (const vp of ['desktop', 'phone'] as const) {
      page = await open(browser, vp, '/backoffice/lab', { locale });
      await shot(page, `shell-${VIEWPORTS[vp].width}-${l}`);
    }
    page = await open(browser, 'desktop', '/backoffice/lab/tokens', { locale });
    await shot(page, `tokens-1440-${l}`);
    page = await open(browser, 'desktop', '/backoffice/lab/components', { locale });
    await page.getByTestId('show-toast-success').click();
    await page.getByTestId('open-drawer').click();
    await page.waitForTimeout(400);
    await shot(page, `drawer-toast-1440-${l}`);
    page = await open(browser, 'desktop', '/backoffice/lab/workspace', { locale, persona: 'sales' });
    await shot(page, `workspace-1440-${l}`);
    page = await open(browser, 'phone', '/backoffice/lab/workspace', { locale, persona: 'sales' });
    await shot(page, `workspace-390-${l}`);
    page = await open(browser, 'desktop', '/backoffice/fin/invoice-workspace?record=inv_0002', { locale });
    await shot(page, `planned-screen-1440-${l}`);
  });

  test(`phone menu and forms (${l})`, async ({ browser }) => {
    let page: Page;
    page = await open(browser, 'phone', '/backoffice/lab', { locale });
    await page.getByRole('button', { name: locale === 'ur-PK' ? 'مینو کھولیں' : 'Open menu' }).click();
    await page.waitForTimeout(400);
    await shot(page, `mobile-menu-390-${l}`);

    for (const vp of ['desktop', 'phone'] as const) {
      page = await open(browser, vp, '/backoffice/lab/forms', { locale });
      await page.getByTestId('lab-form-submit').click();
      await expect(page.getByTestId('validation-summary')).toBeVisible();
      await page.waitForTimeout(300);
      await shot(page, `forms-errors-${VIEWPORTS[vp].width}-${l}`);
    }

    page = await open(browser, 'desktop', '/backoffice/lab/forms', { locale });
    const picker = page.getByTestId('unit-picker');
    await picker.scrollIntoViewIfNeeded();
    await picker.getByTestId('unit-picker-project').getByRole('button').click();
    await page.getByRole('option').first().click();
    await picker.getByTestId('unit-picker-tower').getByRole('button').click();
    await page.getByRole('option').first().click();
    await picker.getByTestId('unit-picker-floor').getByRole('button').click();
    await page.getByRole('option').nth(4).click();
    await picker.getByTestId('unit-picker-unit').getByRole('button').click();
    await page.waitForTimeout(300);
    await shot(page, `unit-picker-open-1440-${l}`);
  });

  test(`command palette (${l})`, async ({ browser }) => {
    let page: Page;
    for (const [persona, q] of [['sales', 'Ay'], ['finance', 'INV-2026']] as const) {
      page = await open(browser, 'desktop', '/backoffice/lab', { locale, persona });
      await page.keyboard.press('Control+k');
      await page.keyboard.type(q);
      await page.waitForTimeout(700);
      await shot(page, `palette-${persona}-1440-${l}`);
    }
    page = await open(browser, 'phone', '/backoffice/lab', { locale, persona: 'sales' });
    await page.getByTestId('search-button').click();
    await page.keyboard.type('LH-A-12');
    await page.waitForTimeout(700);
    await shot(page, `palette-390-${l}`);
  });

  test(`welcome and tour (${l})`, async ({ browser }) => {
    let page: Page;
    for (const vp of ['desktop', 'phone'] as const) {
      page = await open(browser, vp, '/backoffice/lab', { locale, persona: 'sales', onboarding: 'fresh' });
      await expect(page.getByTestId('welcome-start')).toBeVisible();
      await shot(page, `welcome-${VIEWPORTS[vp].width}-${l}`);
      await page.getByTestId('welcome-start').click();
      await page.getByTestId('tour-next').click();
      await page.waitForTimeout(500);
      await shot(page, `tour-step2-${VIEWPORTS[vp].width}-${l}`);
      await page.getByTestId('tour-next').click();
      await page.waitForTimeout(500);
      await shot(page, `tour-step3-${VIEWPORTS[vp].width}-${l}`);
      await page.getByTestId('tour-next').click();
      await page.waitForTimeout(500);
      await shot(page, `tour-step4-${VIEWPORTS[vp].width}-${l}`);
      for (let i = 0; i < 3; i++) await page.getByTestId('tour-next').click();
      await expect(page.getByTestId('tour-completion')).toBeVisible();
      await page.waitForTimeout(300);
      await shot(page, `tour-complete-${VIEWPORTS[vp].width}-${l}`);
    }
    page = await open(browser, 'desktop', '/backoffice/help/tours/GLOBAL-TOUR-001/text', { locale, persona: 'sales' });
    await shot(page, `text-guide-1440-${l}`);
  });

  test(`practice mode (${l})`, async ({ browser }) => {
    const page = await open(browser, 'desktop', '/backoffice/help/practice', { locale, persona: 'sales' });
    await page.getByTestId('start-practice-tour').click();
    await page.waitForTimeout(400);
    await shot(page, `practice-intro-1440-${l}`);
    await page.getByTestId('tour-next').click();
    await page.locator('[data-tour-id="quick-create"]:visible').click();
    await page.waitForTimeout(300);
    await shot(page, `practice-quick-create-1440-${l}`);
    await page.getByTestId('quick-create-practice-lead').click();
    await expect(page.getByTestId('practice-lead-drawer')).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, `practice-drawer-1440-${l}`);
  });

  test(`customer portal (${l})`, async ({ browser }) => {
    let page: Page;
    for (const vp of ['desktop', 'phone'] as const) {
      page = await open(browser, vp, '/customer/portal/lab', { locale, persona: 'resident', app: 'customer' });
      await shot(page, `customer-${VIEWPORTS[vp].width}-${l}`);
    }
  });
}

test('tablet, 320 px reflow and 200 % zoom', async ({ browser }) => {
    let page: Page;
  for (const vp of ['tablet', 'reflow', 'zoom200'] as const) {
    page = await open(browser, vp, '/backoffice/lab');
    await shot(page, `shell-${vp}-en`);
  }
  page = await open(browser, 'reflow', '/backoffice/lab', { locale: 'ur-PK' });
  await shot(page, 'shell-reflow-ur');
  page = await open(browser, 'reflow', '/backoffice/lab/forms');
  await shot(page, 'forms-reflow-en');
});

test('tour variants: high contrast and reduced motion', async ({ browser }) => {
  const page = await open(browser, 'desktop', '/backoffice/lab', { persona: 'sales', onboarding: 'fresh', a11y: { motion: 'reduce', contrast: 'more', sound: false, textOnlyGuide: false } });
  await page.getByTestId('welcome-start').click();
  await page.getByTestId('tour-next').click();
  await page.getByTestId('tour-next').click();
  await page.waitForTimeout(400);
  await shot(page, 'tour-step3-1440-en-high-contrast-reduced-motion');
});
