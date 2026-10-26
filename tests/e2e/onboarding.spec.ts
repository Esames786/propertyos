import type { Page } from '@playwright/test';
import { BO, expect, seed, test, tourRecord, waitForApp } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

/** Doc 09 §11 acceptance tests (numbers in test titles). */

const card = (page: Page) => page.getByTestId('tour-card');
const stepId = (page: Page) => card(page).getAttribute('data-step-id');

async function startWelcomeTour(page: Page) {
  await page.getByTestId('welcome-start').click();
  await expect(card(page)).toBeVisible();
}

async function next(page: Page) {
  await page.getByTestId('tour-next').click();
}

/**
 * The spotlight cut-out must surround the real, visible control. The ring is clamped 2 px inside
 * the viewport, so a target touching the edge (the sidebar at x = 0) is allowed 3 px of tolerance.
 */
async function expectSpotlightOn(page: Page, anchorId: string) {
  const tol = 3;
  const target = page.locator(`[data-tour-id="${anchorId}"]:visible`).first();
  await expect(target).toBeVisible();
  const spot = page.getByTestId('tour-spotlight');
  await expect(spot).toBeVisible();
  await expect
    .poll(async () => {
      const t = await target.boundingBox();
      const s = await spot.boundingBox();
      if (!t || !s) return false;
      return s.x <= t.x + tol && s.y <= t.y + tol && s.x + s.width >= t.x + t.width - tol && s.y + s.height >= t.y + t.height - tol;
    })
    .toBe(true);
}

async function expectCardInViewport(page: Page) {
  const box = await card(page).boundingBox();
  const vp = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
}

test.describe('Guided onboarding (doc 09 §11)', () => {
  test('1: a new Sales identity is offered the tour once and can skip without penalty', async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'sales', onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice`);
    const welcome = page.getByRole('dialog', { name: /welcome, bilal ahmed/i });
    await expect(welcome).toBeVisible();
    await expect(page.getByTestId('welcome-start')).toBeVisible();
    await page.getByTestId('welcome-explore').click();
    await expect(welcome).toBeHidden();
    await expect(card(page)).toHaveCount(0);

    await page.reload();
    await waitForApp(page);
    await page.waitForTimeout(800);
    await expect(page.getByRole('dialog', { name: /welcome/i })).toHaveCount(0);
    await page.getByRole('link', { name: 'Customers' }).click();
    await expect(page.getByTestId('planned-screen')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  for (const vp of ['desktop', 'phone', 'reflow'] as const) {
    test(`2 + 4: every step highlights the real control at ${VIEWPORTS[vp].width} px`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS[vp]);
      await seed(page, { persona: 'sales', onboarding: 'fresh' });
      await page.goto(`${BO}/backoffice/lab`);
      await startWelcomeTour(page);
      expect(await stepId(page)).toBe('welcome');
      await expectCardInViewport(page);

      const anchors = [
        ['sidebar', vp === 'desktop' ? 'nav-primary' : 'nav-menu-button'],
        ['project', 'project-switcher'],
        ['search', 'command-search'],
        ['quickCreate', 'quick-create'],
        ['help', 'global-help'],
      ] as const;
      for (const [id, anchor] of anchors) {
        await next(page);
        await expect(card(page)).toHaveAttribute('data-step-id', id);
        await expectSpotlightOn(page, anchor);
        await expectCardInViewport(page);
      }
    });
  }

  test('3: switching EN → اردو at step 3 keeps the step and mirrors the layout', async ({ page }) => {
    await seed(page, { persona: 'sales', onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice/lab`);
    await startWelcomeTour(page);
    await next(page);
    await next(page);
    await expect(card(page)).toHaveAttribute('data-step-id', 'project');

    // The language switch inside the card stays reachable while the page is inert.
    await card(page).getByTestId('locale-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ur-PK');
    await expect(card(page)).toHaveAttribute('data-step-id', 'project');
    await expect(card(page).getByRole('heading')).toHaveText('موجودہ پروجیکٹ');
    await expect(page.getByTestId('tour-progress')).toHaveText('مرحلہ 3 از 6');
    await expectSpotlightOn(page, 'project-switcher');
    await next(page);
    await expect(card(page)).toHaveAttribute('data-step-id', 'search');
  });

  test('5: Finance-only steps are removed for Sales and never shown', async ({ page }) => {
    await seed(page, { persona: 'sales' });
    await page.goto(`${BO}/backoffice/help/tours/LAB-TOUR-001/text`);
    const guide = page.getByTestId('text-guide');
    await expect(guide.getByRole('listitem')).toHaveCount(4);
    await expect(guide).not.toContainText('Transfer proof review');

    await page.goto(`${BO}/backoffice/help/tours`);
    await page.getByTestId('start-LAB-TOUR-001').click();
    await expect(page.getByTestId('tour-progress')).toHaveText('Step 1 of 4');
  });

  test('5b: the Manager sees the Finance step (5 steps)', async ({ page }) => {
    await seed(page, { persona: 'manager' });
    await page.goto(`${BO}/backoffice/help/tours/LAB-TOUR-001/text`);
    await expect(page.getByTestId('text-guide').getByRole('listitem')).toHaveCount(5);
  });

  test('6: after skipping, Help → Take a tour starts it again', async ({ page }) => {
    await seed(page, { persona: 'sales', onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice/lab`);
    await startWelcomeTour(page);
    await page.getByTestId('tour-skip').click();
    await expect(card(page)).toHaveCount(0);
    expect((await tourRecord(page, 'sales', 'GLOBAL-TOUR-001'))?.status).toBe('dismissed');

    await page.getByTestId('help-button').click();
    await page.getByTestId('help-take-tour').click();
    await expect(card(page)).toHaveAttribute('data-step-id', 'welcome');
  });

  test('7: finishing step 6 marks this exact tour version complete for persona, tenant and app', async ({ page }) => {
    await seed(page, { persona: 'sales', onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice/lab`);
    await startWelcomeTour(page);
    for (let i = 0; i < 5; i++) await next(page);
    await expect(page.getByTestId('tour-next')).toHaveText(/finish/i);
    await next(page);
    await expect(page.getByTestId('tour-completion')).toBeVisible();
    const record = await tourRecord(page, 'sales', 'GLOBAL-TOUR-001', 1);
    expect(record).toMatchObject({ tenantId: 'tnt_larkspur', personaId: 'sales', app: 'backoffice', tourId: 'GLOBAL-TOUR-001', tourVersion: 1, status: 'completed' });
    expect(record.completedAt).toBeTruthy();
    expect(await tourRecord(page, 'sales', 'GLOBAL-TOUR-001', 2)).toBeNull();

    await page.getByRole('button', { name: /go to start page/i }).click();
    await page.reload();
    await waitForApp(page);
    await page.waitForTimeout(600);
    await expect(page.getByRole('dialog', { name: /welcome/i })).toHaveCount(0);
  });

  test('8: an anchor that is not on screen falls back to a text explanation (no ghost highlight)', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seed(page, { persona: 'finance' });
    await page.goto(`${BO}/backoffice/help/tours`);
    const started = Date.now();
    await page.getByTestId('start-LAB-TOUR-001').click();
    await expect(card(page)).toHaveAttribute('data-step-id', 'intro');
    await next(page);
    // nav-finance lives in the closed phone menu: explained instead of highlighted.
    await expect(card(page)).toHaveAttribute('data-step-id', 'financeReview');
    await expect(card(page)).toContainText("isn't on your screen right now");
    await expect(page.getByTestId('tour-spotlight')).toHaveCount(0);
    expect(Date.now() - started).toBeLessThan(8000);
    await next(page);
    await expect(card(page)).toHaveAttribute('data-step-id', 'replay');
  });

  test('9: keyboard-only start, navigation, pause and focus restoration', async ({ page }) => {
    await seed(page, { persona: 'sales', onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice/lab`);
    await expect(page.getByTestId('welcome-start')).toBeVisible();
    for (let i = 0; i < 8 && !(await page.getByTestId('welcome-start').evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(page.getByTestId('welcome-start')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(card(page).getByRole('heading')).toBeFocused();

    for (let i = 0; i < 10 && !(await page.getByTestId('tour-next').evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await expect(page.getByTestId('tour-next')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(card(page)).toHaveAttribute('data-step-id', 'sidebar');
    await expect(card(page).getByRole('heading')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveCount(0);
    expect((await tourRecord(page, 'sales', 'GLOBAL-TOUR-001'))?.status).toBe('paused');
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');

    await page.goto(`${BO}/backoffice/help/tours`);
    await page.getByTestId('resume-GLOBAL-TOUR-001').click();
    await expect(card(page)).toHaveAttribute('data-step-id', 'sidebar');
  });

  test('10: steps expose name, step x of y, and the correct modal semantics', async ({ page }) => {
    await seed(page, { persona: 'sales', onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice/lab`);
    await startWelcomeTour(page);
    const dialog = page.getByRole('dialog', { name: 'Welcome to your workspace' });
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAccessibleDescription(/Step 1 of 6/);
    await expect(page.locator('#app-shell')).toHaveAttribute('inert', '');

    for (let i = 0; i < 3; i++) await next(page);
    const search = page.getByRole('dialog', { name: 'Search anything' });
    await expect(search).toHaveAttribute('aria-modal', 'false');
    await expect(page.locator('#app-shell')).not.toHaveAttribute('inert', '');
    // Non-modal guided action: the highlighted control is usable and advances the tour.
    await page.locator('[data-tour-id="command-search"]:visible').click();
    await expect(page.getByTestId('command-palette')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card(page)).toHaveAttribute('data-step-id', 'quickCreate');
  });

  test('11: reduced motion removes the pulse and spotlight travel but keeps the highlight', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seed(page, { persona: 'sales', onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice/lab`);
    await startWelcomeTour(page);
    await next(page);
    await expectSpotlightOn(page, 'nav-primary');
    await expect(page.getByTestId('tour-pulse')).toHaveCount(0);
    const duration = await page.getByTestId('tour-spotlight').evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration.split(',').every((d) => parseFloat(d) === 0)).toBe(true);
  });

  test('12: practice creates a training record only, with a visible DEMO banner and no live mutation', async ({ page }) => {
    await seed(page, { persona: 'sales' });
    await page.goto(`${BO}/backoffice/help/practice`);
    await page.getByTestId('start-practice-tour').click();
    await expect(page.getByTestId('practice-banner')).toContainText('TRAINING / DEMO');
    await next(page);
    await expect(card(page)).toHaveAttribute('data-step-id', 'openQuickCreate');

    await page.locator('[data-tour-id="quick-create"]:visible').click();
    await page.getByTestId('quick-create-practice-lead').click();
    const drawer = page.getByTestId('practice-lead-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('tour-card')).toHaveAttribute('data-step-id', 'fillForm');
    await expect(drawer).toContainText('TRAINING / DEMO');

    await drawer.getByRole('textbox', { name: /full name/i }).fill('Practice Customer');
    await drawer.getByRole('textbox', { name: /mobile number/i }).fill('0300 1234567');
    await drawer.getByTestId('unit-picker-project').getByRole('button').click();
    await page.getByRole('option', { name: /Larkspur Heights/ }).click();
    await drawer.getByTestId('unit-picker-tower').getByRole('button').click();
    await page.getByRole('option', { name: /Tower A/ }).click();
    await drawer.getByTestId('unit-picker-floor').getByRole('button').click();
    await page.getByRole('option', { name: 'Floor 1', exact: true }).click();
    await drawer.getByTestId('unit-picker-unit').getByRole('button').click();
    await page.locator('[role="option"]:not([aria-disabled="true"])').first().click();
    await page.getByTestId('practice-lead-submit').click();

    await expect(page.getByTestId('toast-success')).toContainText(/Practice lead PRACTICE-\d+ created/);
    await expect(card(page)).toHaveAttribute('data-step-id', 'replay');
    const live = await page.evaluate(() => window.__prototype!.transport.liveMutations().length);
    const training = await page.evaluate(() => window.__prototype!.transport.mutationLog.filter((m) => m.training).length);
    expect(live).toBe(0);
    expect(training).toBeGreaterThanOrEqual(1);

    await next(page);
    await expect(page.getByTestId('tour-completion')).toBeVisible();
    await expect(page.getByTestId('practice-banner')).toHaveCount(0);
  });

  test('13: no welcome opens over unsaved form entries', async ({ page }) => {
    await seed(page, { persona: 'manager' });
    await page.goto(`${BO}/backoffice/lab/forms`);
    await page.getByRole('textbox', { name: /full name/i }).fill('Unsaved entry');
    await page.getByTestId('user-menu-button').click();
    await page.getByTestId('reset-onboarding').click();
    await page.waitForTimeout(1200);
    await expect(page.getByRole('dialog', { name: /welcome/i })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: /full name/i })).toHaveValue('Unsaved entry');

    await page.getByRole('button', { name: 'Clear form' }).click();
    await expect(page.getByRole('dialog', { name: /welcome/i })).toBeVisible();
  });

  test('14: sound is off by default and a text-only guide is available', async ({ page }) => {
    await seed(page, { persona: 'manager' });
    await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
    await expect(page.getByTestId('sound-switch').getByRole('switch')).not.toBeChecked();

    await page.goto(`${BO}/backoffice/settings/onboarding`);
    await page.getByTestId('tour-text-only').getByRole('switch').check({ force: true });
    await page.getByTestId('help-button').click();
    await page.getByTestId('help-take-tour').click();
    await expect(page).toHaveURL(/\/help\/tours\/GLOBAL-TOUR-001\/text$/);
    await expect(card(page)).toHaveCount(0);
    const items = page.getByTestId('text-guide').getByRole('listitem');
    await expect(items).toHaveCount(6);
    await items.nth(4).getByRole('button', { name: 'Show me' }).click();
    await expect(page.locator('[data-tour-id="quick-create"]:visible')).toBeFocused();
  });

  test('no module offer straight after choosing "Explore on my own"', async ({ page }) => {
    await seed(page, { persona: 'manager', onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice/lab`);
    await page.getByTestId('welcome-explore').click();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('module-offer')).toHaveCount(0);
  });

  test('module first-use offer appears once and is non-blocking', async ({ page }) => {
    await seed(page, { persona: 'manager', onboarding: 'offers' });
    await page.goto(`${BO}/backoffice/lab`);
    const offer = page.getByTestId('module-offer');
    await expect(offer).toBeVisible();
    await expect(offer).toContainText('5-step tour of the design system lab');
    await offer.getByRole('button', { name: 'Not now' }).click();
    await expect(offer).toHaveCount(0);
    await page.reload();
    await waitForApp(page);
    await page.waitForTimeout(800);
    await expect(page.getByTestId('module-offer')).toHaveCount(0);
  });
});
