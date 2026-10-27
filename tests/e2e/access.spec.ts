import type { Page } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, seed, test, type Locale } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate B checkpoint 2, item 1: V3.1 effective access across the workspace. Shalimar Court Residents
 * (Demo) licenses only core and maintenance; its facility manager's role deliberately carries lead,
 * booking and unit permissions, so everything below is stopped by the licence, not the role.
 */
const nav = (page: Page) => page.locator('[data-tour-id="nav-primary"]');

async function apiCode(page: Page, path: string, method: 'GET' | 'POST' = 'GET') {
  return page.evaluate(
    async ({ path, method }) => {
      try {
        await window.__prototype!.transport.request({ method, path, ...(method === 'POST' ? { body: {} } : {}) });
        return 'allowed';
      } catch (e) {
        return (e as { problem?: { code: string } }).problem?.code ?? 'error';
      }
    },
    { path, method },
  );
}

test.describe('Effective access in the workspace (V3.1)', () => {
  test('a maintenance-only client sees and reaches only what its plan includes', async ({ page, consoleErrors }) => {
    await seed(page, { persona: 'facility_manager' });
    await page.goto(`${BO}/backoffice`);
    await expect(page.getByTestId('plan-home')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome back, Saima');

    // Menus: maintenance only (plus the prototype's help and lab).
    await expect(nav(page).getByRole('link', { name: 'Operations' })).toBeVisible();
    for (const name of ['Sales', 'Projects', 'Customers', 'Finance', 'Residents', 'Reports', 'Administration']) {
      await expect(nav(page).getByRole('link', { name, exact: true }), name).toHaveCount(0);
    }
    await expect(page.getByTestId('plan-home-modules')).toHaveText(/Core.*Maintenance/);
    await expect(page.getByTestId('plan-qa-new-request')).toBeVisible();
    await expect(page.getByTestId('plan-qa-plan')).toHaveCount(0);

    // Quick create offers the maintenance request only; no lead, visit, hold or payment.
    await page.locator('[data-tour-id="quick-create"]:visible').click();
    await expect(page.getByRole('menuitem', { name: /New maintenance request/ })).toBeVisible();
    for (const id of ['new-lead', 'schedule-visit', 'practice-lead']) await expect(page.getByTestId(`quick-create-${id}`)).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Search offers no developer screens and returns no Larkspur records.
    await page.keyboard.press('Control+k');
    const palette = page.getByTestId('command-palette');
    await expect(palette.getByRole('searchbox')).toBeFocused();
    await page.keyboard.type('Operations');
    await expect(palette.getByRole('menuitem', { name: 'Operations' })).toBeVisible();
    await palette.getByRole('searchbox').fill('Sales');
    await expect(palette.getByRole('menuitem', { name: 'Sales', exact: true })).toHaveCount(0);
    await palette.getByRole('searchbox').fill('Usman');
    await page.waitForTimeout(600);
    await expect(palette.locator('[data-testid^="palette-record-"]')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Deep links to developer modules answer "not part of this workspace's plan".
    for (const [path, module] of [
      ['/backoffice/crm/sales-home', 'crm'],
      ['/backoffice/crm/leads-list', 'crm'],
      ['/backoffice/crm/lead-360-workspace?record=led_0001', 'crm'],
      ['/backoffice/prj/projects-list', 'projects'],
      ['/backoffice/con/construction-update-list', 'construction'],
    ] as const) {
      await page.goto(`${BO}${path}`);
      const outcome = page.getByTestId('access-outcome');
      await expect(outcome, path).toHaveAttribute('data-reason', 'module_not_licensed');
      await expect(outcome).toHaveAttribute('data-module', module);
    }
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Not part of this workspace's plan");

    // The API refuses the same, whatever the role says (the mock server enforces it, not the menu).
    expect(await apiCode(page, '/leads')).toBe('module_not_licensed');
    expect(await apiCode(page, '/leads', 'POST')).toBe('module_not_licensed');
    expect(await apiCode(page, '/units')).toBe('module_not_licensed');
    expect(await apiCode(page, '/units/unt_0001/hold', 'POST')).toBe('module_not_licensed');

    // Maintenance addresses open (planned pages for now).
    await page.goto(`${BO}/backoffice/mnt/maintenance-list`);
    await expect(page.getByTestId('planned-screen')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('a role inside the plan still needs the permission: the plan page is for administrators', async ({ page }) => {
    await seed(page, { persona: 'facility_manager' });
    await page.goto(`${BO}/backoffice/adm/plan`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Your role doesn't include this");
  });

  test('the committee administrator reads the plan: what is included and what is not', async ({ page }) => {
    await seed(page, { persona: 'society_admin' });
    await page.goto(`${BO}/backoffice`);
    await expect(nav(page).getByRole('link', { name: 'Administration' })).toBeVisible();
    await page.getByTestId('plan-home-open-plan').click();
    await expect(page.getByTestId('plan-page')).toBeVisible();
    await expect(page.getByTestId('plan-included').getByRole('listitem')).toHaveCount(2);
    await expect(page.getByTestId('plan-module-maintenance')).toContainText('All sites');
    await expect(page.getByTestId('plan-not-included')).toContainText('Sales CRM');
    await expect(page.getByTestId('plan-not-included')).toContainText('Construction');
  });

  test('Larkspur keeps every developer area (no change for a full plan)', async ({ page }) => {
    await seed(page, { persona: 'manager' });
    await page.goto(`${BO}/backoffice`);
    await expect(page.getByTestId('management-dashboard')).toBeVisible();
    for (const name of ['Sales', 'Projects', 'Customers', 'Finance', 'Operations', 'Administration']) {
      await expect(nav(page).getByRole('link', { name, exact: true }), name).toBeVisible();
    }
    expect(await apiCode(page, '/leads')).toBe('allowed');
  });

  test('phone: the bottom bar and Create follow the plan', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seed(page, { persona: 'facility_manager' });
    await page.goto(`${BO}/backoffice`);
    const bar = page.getByTestId('bottom-nav');
    await expect(bar.getByRole('link', { name: 'Operations' })).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Sales' })).toHaveCount(0);
    await page.getByTestId('quick-create-fab').click();
    await expect(page.getByRole('menuitem', { name: /New maintenance request/ })).toBeVisible();
    await expect(page.getByTestId('quick-create-new-lead')).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the essentials tour adapts to the plan: no project, figures or developer steps', async ({ page }) => {
    await seed(page, { persona: 'facility_manager', onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice`);
    await page.getByTestId('welcome-start').click();
    const card = page.getByTestId('tour-card');
    await expect(card).toBeVisible();
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push((await card.getAttribute('data-step-id')) ?? '');
      const next = page.getByTestId('tour-next');
      if (/finish/i.test((await next.textContent()) ?? '')) break;
      await next.click();
      await expect(card).not.toHaveAttribute('data-step-id', seen.at(-1)!);
    }
    expect(seen).toEqual(['welcome', 'sidebar', 'quickActions', 'search', 'quickCreate', 'help']);
  });

  for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
    for (const vp of ['desktop', 'phone'] as const) {
      test(`axe: plan home, plan page and access outcomes (${locale}, ${vp})`, async ({ page }, testInfo) => {
        await page.setViewportSize(VIEWPORTS[vp]);
        await seed(page, { persona: 'society_admin', locale });
        const failures: string[] = [];
        for (const [label, path, ready] of [
          ['plan-home', '/backoffice', 'plan-home'],
          ['plan-page', '/backoffice/adm/plan', 'plan-included'],
          ['not-in-plan', '/backoffice/crm/sales-home', 'access-outcome'],
        ] as const) {
          await page.goto(`${BO}${path}`);
          await page.getByTestId(ready).waitFor();
          const { violations } = await scanA11y(page, testInfo, `${locale}-${vp}-${label}`);
          for (const v of violations) failures.push(`${label}: ${v.id} (${v.nodes}) ${v.targets.join(' | ')}`);
        }
        expect(failures).toEqual([]);
      });
    }
  }
});
