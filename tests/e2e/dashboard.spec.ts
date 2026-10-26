import type { Page } from '@playwright/test';
import { BO, expect, seed, test, waitForApp } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

/** HOME-001 management dashboard (Stage 1.5 reference screen 1). */

const DASH = `${BO}/backoffice/home/role-aware-dashboard`;

async function openDashboard(page: Page, url = DASH) {
  await page.goto(url);
  await waitForApp(page);
  await expect(page.getByTestId('management-dashboard')).toBeVisible();
}

const kpiIds = (page: Page) => page.getByTestId('kpi-row').locator('[data-testid^="kpi-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));

test.describe('Management dashboard (HOME-001)', () => {
  test('is the start page: /backoffice lands on it and Home is the current rail item', async ({ page, consoleErrors }) => {
    await seed(page);
    await page.goto(`${BO}/backoffice`);
    await expect(page).toHaveURL(/\/backoffice\/home\/role-aware-dashboard$/);
    await expect(page.locator('main h1')).toHaveText('Good afternoon, Nadia');
    await expect(page).toHaveTitle(/Dashboard · Backoffice/);
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(consoleErrors).toEqual([]);
  });

  test('composes itself by role', async ({ browser }) => {
    const expectations = {
      manager: { kpis: ['kpi-salesBooked', 'kpi-collected', 'kpi-available', 'kpi-conversion'], collections: 1, funnel: 1, inventory: 1, tabs: ['Proofs', 'Follow-ups', 'Holds', 'Overdue'] },
      sales: { kpis: ['kpi-salesBooked', 'kpi-conversion', 'kpi-pipeline', 'kpi-available'], collections: 0, funnel: 1, inventory: 1, tabs: ['Follow-ups', 'Holds'] },
      finance: { kpis: ['kpi-collected', 'kpi-receivables', 'kpi-verifications', 'kpi-salesBooked'], collections: 1, funnel: 0, inventory: 0, tabs: ['Proofs', 'Overdue'] },
    } as const;
    for (const [persona, want] of Object.entries(expectations)) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await seed(page, { persona: persona as keyof typeof expectations });
      await openDashboard(page);
      expect(await kpiIds(page), persona).toEqual(want.kpis);
      await expect(page.getByTestId('collections-chart'), persona).toHaveCount(want.collections);
      await expect(page.getByTestId('funnel-chart'), persona).toHaveCount(want.funnel);
      await expect(page.getByTestId('inventory-chart'), persona).toHaveCount(want.inventory);
      const tabs = page.getByTestId('attention-tabs').getByRole('tab');
      expect((await tabs.allInnerTexts()).map((t) => t.replace(/\s*\d+$/, '').trim()), persona).toEqual(want.tabs);
      await context.close();
    }
  });

  test('the reporting period scopes the figures, lives in the URL and survives reload', async ({ page }) => {
    await seed(page);
    await openDashboard(page);
    const range = page.getByRole('radiogroup', { name: 'Reporting period' });
    await expect(range.getByRole('radio', { name: '6 months' })).toBeChecked();
    await expect(page.getByTestId('collections-chart').getByTestId('chart-column')).toHaveCount(6);
    const before = await page.getByTestId('kpi-collected').getAttribute('aria-label');

    await range.getByText('12 months').click();
    await expect(page).toHaveURL(/range=12m/);
    await expect(page.getByTestId('collections-chart').getByTestId('chart-column')).toHaveCount(12);
    await expect(page.getByTestId('kpi-collected')).not.toHaveAttribute('aria-label', before!);
    await expect(page.getByText('Figures for the last 12 months, compared with the previous 12 months.')).toBeVisible();
    await expect(page.getByTestId('live-polite')).toContainText('Figures updated for the last 12 months');

    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/range=ytd/);
    await expect(page.getByTestId('collections-chart').getByTestId('chart-column')).toHaveCount(10);

    await page.reload();
    await waitForApp(page);
    await expect(page.getByRole('radiogroup', { name: 'Reporting period' }).getByRole('radio', { name: 'Year to date' })).toBeChecked();
  });

  test('the header project switcher scopes the whole dashboard', async ({ page }) => {
    await seed(page);
    await openDashboard(page);
    await page.locator('[data-tour-id="project-switcher"]').click();
    await page.getByRole('option', { name: 'Larkspur Gardens' }).click();
    await expect(page.getByTestId('showcase-title')).toHaveText('Larkspur Gardens');
    await expect(page.getByTestId('showcase-next')).toHaveCount(0);
    await expect(page.getByTestId('stack-row')).toHaveCount(2);
    await expect(page.getByTestId('inventory-chart')).toContainText('Phase 1');
  });

  test('collections chart: keyboard and hover reveal each period; the data table is the equivalent', async ({ page }) => {
    await seed(page);
    await openDashboard(page);
    const chart = page.getByTestId('collections-chart');
    const columns = chart.getByTestId('chart-column');
    await columns.last().focus();
    // Intl separates "Rs" from the figure with a no-break space, hence \s.
    await expect(columns.last()).toHaveAttribute('aria-label', /^October 2026, to date: Rs\s[\d.]+M collected of Rs\s[\d.]+M scheduled, \d+%$/);
    await page.keyboard.press('ArrowLeft');
    await expect(columns.nth(4)).toBeFocused();
    await expect(chart.getByText('September 2026')).toBeVisible();
    await page.keyboard.press('Home');
    await expect(columns.first()).toBeFocused();

    await columns.nth(2).hover();
    await expect(chart.getByText('July 2026')).toBeVisible();

    await chart.getByTestId('collections-chart-table-toggle').click();
    const table = chart.getByRole('table', { name: 'Collections and scheduled amounts by month' });
    await expect(table.getByRole('rowheader')).toHaveCount(6);
    await expect(table).toContainText(/Rs\s[\d,]+\.\d{2}/);
  });

  test('project showcase: arrows, dots and announcements; images are labelled illustrative', async ({ page }) => {
    await seed(page);
    await openDashboard(page);
    const showcase = page.getByTestId('project-showcase');
    await expect(page.getByTestId('showcase-title')).toHaveText('Larkspur Heights');
    await expect(showcase.getByText('Illustrative image')).toBeVisible();
    await page.getByTestId('showcase-next').click();
    await expect(page.getByTestId('showcase-title')).toHaveText('Larkspur Gardens');
    await expect(page.getByTestId('live-polite')).toContainText('2 of 2: Larkspur Gardens');
    await showcase.getByRole('button', { name: 'Show Larkspur Heights' }).click();
    await expect(page.getByTestId('showcase-title')).toHaveText('Larkspur Heights');
    await expect(showcase.getByRole('button', { name: 'Show Larkspur Heights' })).toHaveAttribute('aria-current', 'true');
    await expect(showcase.getByRole('list', { name: 'Construction milestones' }).getByRole('listitem')).toHaveCount(6);
  });

  test('action centre: tabs switch lists; rows open the record; proofs are never shown as paid', async ({ page }) => {
    await seed(page);
    await openDashboard(page);
    const centre = page.getByTestId('action-centre');
    await expect(centre.getByRole('list', { name: 'Payment proofs awaiting verification' })).toBeVisible();
    await expect(centre).toContainText('Awaiting verification');
    await expect(centre).not.toContainText(/\bPaid\b/);
    await centre.getByRole('tab', { name: /Follow-ups/ }).click();
    const list = centre.getByRole('list', { name: 'Follow-ups due' });
    await expect(list).toBeVisible();
    await list.getByTestId('attention-item').first().click();
    await expect(page).toHaveURL(/\/backoffice\/crm\/lead-360-workspace\?record=led_\d+/);
    await expect(page.getByTestId('planned-screen')).toHaveAttribute('data-screen-id', 'CRM-003');
  });

  test('KPI tiles and inventory rows are links to the screens behind the numbers', async ({ page }) => {
    await seed(page);
    await openDashboard(page);
    await expect(page.getByTestId('kpi-collected')).toHaveAttribute('aria-label', /^Collected, Rs\s[\d.]+B, (up|down) [\d.]+% on the previous 6 months$/);
    await page.getByTestId('stack-row').first().click();
    await expect(page).toHaveURL(/\/backoffice\/inv\/unit-matrix\?record=twr_lh_a/);
  });

  test('phone: bottom bar, residences rail and no horizontal page scroll', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seed(page);
    await openDashboard(page);
    const bottom = page.getByRole('navigation', { name: 'Quick navigation' });
    await expect(bottom).toBeVisible();
    await expect(bottom.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await bottom.getByRole('button', { name: 'More' }).click();
    await expect(page.getByTestId('mobile-nav')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('residence-card')).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await bottom.getByRole('link', { name: 'Sales' }).click();
    await expect(page).toHaveURL(/\/backoffice\/crm\/sales-home$/);
  });

  test('Urdu: right-to-left layout, mirrored time axis, Latin references isolated', async ({ page }) => {
    await seed(page, { locale: 'ur-PK' });
    await openDashboard(page);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('main h1')).toHaveText('سہ پہر بخیر، Nadia');
    const columns = page.getByTestId('collections-chart').getByTestId('chart-column');
    const first = await columns.first().boundingBox();
    const last = await columns.last().boundingBox();
    expect(first!.x).toBeGreaterThan(last!.x);
    await expect(page.getByTestId('kpi-collected').locator('bdi[dir="ltr"]').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test('reduced motion: figures render final immediately', async ({ page }) => {
    await seed(page, { a11y: { motion: 'reduce', contrast: 'standard', sound: false, textOnlyGuide: false } });
    await page.goto(DASH);
    await expect(page.getByTestId('kpi-available')).toBeVisible();
    // Read straight away, without waiting: under reduced motion the visible digits are already final.
    const label = await page.getByTestId('kpi-available').getAttribute('aria-label');
    const value = /Units available, (\d+)/.exec(label!)![1]!;
    expect(await page.getByTestId('kpi-available').locator('span[aria-hidden="true"]').last().textContent()).toBe(value);
  });

  test('guided tour runs on the dashboard at desktop and phone', async ({ browser }) => {
    for (const vp of ['desktop', 'phone'] as const) {
      const context = await browser.newContext({ viewport: VIEWPORTS[vp] });
      const page = await context.newPage();
      await seed(page, { persona: 'sales', onboarding: 'fresh' });
      await page.goto(`${BO}/backoffice`);
      await page.getByTestId('welcome-start').click();
      for (let i = 0; i < 6; i++) {
        await expect(page.getByTestId('tour-card')).toBeVisible();
        await page.getByTestId('tour-next').click();
      }
      await expect(page.getByTestId('tour-completion')).toBeVisible();
      await context.close();
    }
  });
});
