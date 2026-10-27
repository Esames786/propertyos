import type { Page } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, seed, test, type Locale } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

/**
 * CP2 security corrections in the running workspace: one tenant with two differently licensed
 * sites (Crescent Bay), a suspended organisation (Cedar Hills) and switching identities without
 * leaking data. The API checks are made through the page's own mock server.
 */
const nav = (page: Page) => page.locator('[data-tour-id="nav-primary"]');
const TOWER_UNIT = 'unt_cb_a_0101';
const PLAZA_UNIT = 'unt_cb_p_0101';

async function api(page: Page, path: string, method: 'GET' | 'POST' = 'GET', body: unknown = {}) {
  return page.evaluate(
    async ({ path, method, body }) => {
      try {
        const res = await window.__prototype!.transport.request({ method, path, ...(method === 'POST' ? { body } : {}) });
        return { ok: true as const, res };
      } catch (e) {
        return { ok: false as const, code: (e as { problem?: { code: string } }).problem?.code ?? 'error' };
      }
    },
    { path, method, body },
  );
}

async function chooseProject(page: Page, name: string) {
  await page.locator('[data-tour-id="project-switcher"]:visible').click();
  await page.getByRole('option', { name }).click();
}

test.describe('Two sites, different grants (Crescent Bay Developers)', () => {
  test('inventory is reachable for the Towers and refused for the Plaza: reads, writes, search, menus and addresses', async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'cb_manager' });
    await page.goto(`${BO}/backoffice`);
    await expect(page.getByTestId('management-dashboard')).toBeVisible();
    // Home: project card and inventory figures for the Towers only.
    await expect(page.getByTestId('showcase-title')).toHaveText('Crescent Bay Towers');

    // Reads and writes through the API.
    expect(await api(page, `/units/${TOWER_UNIT}`)).toMatchObject({ ok: true });
    expect(await api(page, `/units/${PLAZA_UNIT}`)).toEqual({ ok: false, code: 'site_not_licensed' });
    expect(await api(page, `/units/${PLAZA_UNIT}/hold`, 'POST', { leadId: 'led_cb_0001' })).toEqual({ ok: false, code: 'site_not_licensed' });
    expect(await api(page, '/units/unt_cb_import_001')).toEqual({ ok: false, code: 'site_context_missing' });

    // Search finds Towers flats, never Plaza shops.
    await page.keyboard.press('Control+k');
    const palette = page.getByTestId('command-palette');
    await palette.getByRole('searchbox').fill('CB-A-01');
    await expect(palette.locator('[data-testid="palette-record-unit"]').first()).toBeVisible();
    await palette.getByRole('searchbox').fill('CB-P-01');
    await page.waitForTimeout(600);
    await expect(palette.locator('[data-testid="palette-record-unit"]')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Direct addresses naming a record are checked as records.
    await page.goto(`${BO}/backoffice/inv/unit-360-workspace?record=${TOWER_UNIT}`);
    await expect(page.getByTestId('planned-screen')).toBeVisible();
    await page.goto(`${BO}/backoffice/inv/unit-360-workspace?record=${PLAZA_UNIT}`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'site_not_licensed');
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-module', 'inventory');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not licensed for this site');
    await page.goto(`${BO}/backoffice/inv/unit-360-workspace?record=unt_cb_import_001`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'site_context_missing');
    // Another organisation's record is simply not found.
    await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=led_0001`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'out_of_scope');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("We couldn't find that record");

    // Navigation follows the header project's site.
    await page.goto(`${BO}/backoffice`);
    await expect(nav(page).getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
    await chooseProject(page, 'Crescent Bay Plaza');
    await expect(nav(page).getByRole('link', { name: 'Projects', exact: true })).toHaveCount(0);
    await page.goto(`${BO}/backoffice/inv/unit-matrix`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'site_not_licensed');
    await page.goto(`${BO}/backoffice/mnt/maintenance-list`);
    await expect(page.getByTestId('planned-screen')).toBeVisible();
    await chooseProject(page, 'Crescent Bay Towers');
    await page.goto(`${BO}/backoffice/inv/unit-matrix`);
    await expect(page.getByTestId('planned-screen')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('My access shows each area with the sites it covers and no commercial terms', async ({ page }) => {
    await seed(page, { persona: 'cb_manager' });
    await page.goto(`${BO}/backoffice/global/my-access`);
    await expect(page.getByTestId('my-access-area-inventory')).toContainText('Only at Crescent Bay Towers');
    await expect(page.getByTestId('my-access-area-crm')).toContainText('All sites');
    await expect(page.getByTestId('my-access-page')).not.toContainText(/\bRs\b|[Ee]dition|[Cc]ontract|[Pp]rice/);
  });
});

test.describe('A suspended organisation (Cedar Hills Co-operative)', () => {
  test('financial history stays readable; everything else is paused', async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'cedar_treasurer' });
    await page.goto(`${BO}/backoffice`);
    await expect(page.getByTestId('suspended-banner')).toBeVisible();
    await expect(page.getByTestId('plan-home')).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Finance', exact: true })).toBeVisible();
    for (const name of ['Sales', 'Projects', 'Operations', 'Residents', 'Reports']) {
      await expect(nav(page).getByRole('link', { name, exact: true }), name).toHaveCount(0);
    }

    await page.getByTestId('plan-qa-invoices').click();
    await expect(page.getByTestId('invoices-page')).toBeVisible();
    await expect(page.getByTestId('invoices-showing')).toContainText('of 72');
    await page.getByTestId('invoices-filter').getByText('Unpaid', { exact: true }).click();
    await expect(page.getByTestId('invoices-filter').getByRole('radio', { name: 'Unpaid' })).toBeChecked();
    await expect(page.getByTestId('invoice-row').first()).toContainText('Unpaid');

    // Operational areas answer "suspended", in the page and in the API.
    for (const path of ['/backoffice/res/resident-dashboard', '/backoffice/fin/create-invoice', '/backoffice/global/quick-create']) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId('access-outcome'), path).toHaveAttribute('data-reason', 'tenant_suspended');
    }
    expect(await api(page, '/dashboard/summary')).toEqual({ ok: false, code: 'tenant_suspended' });
    expect(await api(page, '/notifications/read-all', 'POST')).toEqual({ ok: false, code: 'tenant_suspended' });
    expect(await api(page, '/finance/invoices')).toMatchObject({ ok: true });
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Switching identity and organisation', () => {
  test('a lead created at Larkspur never appears at Crescent Bay, and is back on switching back', async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'manager' });
    await page.goto(`${BO}/backoffice/crm/leads-list`);
    const created = await api(page, '/leads', 'POST', { fullName: 'Switch Test Person', phone: '03001234567', projectId: 'prj_heights', source: 'walk_in' });
    expect(created.ok).toBe(true);
    const leadId = (created as { res: { id: string } }).res.id;
    await page.goto(`${BO}/backoffice/crm/leads-list?q=Switch%20Test`);
    await expect(page.getByText('Switch Test Person')).toBeVisible();

    // Switch identity in the app (no reload): sign out, then choose Crescent Bay's manager.
    await page.goto(`${BO}/backoffice/more`);
    await page.getByTestId('more-sign-out').click();
    await page.getByTestId('sign-in-cb_manager').click();
    await expect(page.getByRole('button', { name: /Account menu for Zain Abbasi/ })).toBeVisible();
    // First sign-in of this identity in the browser: the optional welcome is offered; decline it.
    await page.getByTestId('welcome-explore').click();

    await page.goto(`${BO}/backoffice/crm/leads-list?q=Switch%20Test`);
    await expect(page.getByText('Switch Test Person')).toHaveCount(0);
    await page.keyboard.press('Control+k');
    await page.getByTestId('command-palette').getByRole('searchbox').fill('Switch Test');
    await page.waitForTimeout(600);
    await expect(page.getByTestId('command-palette').locator('[data-testid^="palette-record-"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=${leadId}`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'out_of_scope');

    // And back: Larkspur's session lead is still there, Crescent Bay's world is gone.
    await page.goto(`${BO}/backoffice/more`);
    await page.getByTestId('more-sign-out').click();
    await page.getByTestId('sign-in-manager').click();
    await page.goto(`${BO}/backoffice/crm/leads-list?q=Switch%20Test`);
    await expect(page.getByText('Switch Test Person')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  for (const vp of ['desktop', 'phone'] as const) {
    test(`axe: invoices, my access, site outcome and suspended home (${locale}, ${vp})`, async ({ page }, testInfo) => {
      await page.setViewportSize(VIEWPORTS[vp]);
      const failures: string[] = [];
      await seed(page, { persona: 'cedar_treasurer', locale });
      for (const [label, path, ready] of [
        ['suspended-home', '/backoffice', 'plan-home'],
        ['invoices', '/backoffice/fin/invoices-list', 'invoices-list'],
        ['my-access', '/backoffice/global/my-access', 'my-access-areas'],
      ] as const) {
        await page.goto(`${BO}${path}`);
        await page.getByTestId(ready).waitFor();
        const { violations } = await scanA11y(page, testInfo, `${locale}-${vp}-${label}`);
        for (const v of violations) failures.push(`${label}: ${v.id} (${v.nodes}) ${v.targets.join(' | ')}`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(failures).toEqual([]);
    });
  }
}
