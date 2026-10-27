import type { Page } from '@playwright/test';
import { BO, expect, HQ, seed, test, type PersonaId } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate B checkpoint 2, items 2 and 3: HQ-004 Tenant 360 and HQ-009 Preview as client. The preview
 * must show a tenant's actual licensed navigation (the same model and rule the workspace uses)
 * without loading tenant records or signing in as anyone.
 */
async function seedHq(page: Page, persona: PersonaId = 'supreme_admin') {
  await seed(page, { app: 'platform', persona });
}

test.describe('Tenant 360 (HQ-004)', () => {
  test('opens from the summary; every tab is in the address and shows the tenant’s licence and contract', async ({ page, consoleErrors }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/tenants?tenant=tnt_shalimar`);
    await page.getByTestId('summary-360').click();
    const ws = page.getByTestId('tenant-360');
    await expect(ws).toHaveAttribute('data-tenant-id', 'tnt_shalimar');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shalimar Court Residents (Demo)');
    await expect(page.getByTestId('t360-modules-summary')).toHaveText(/Core.*Maintenance/);

    await page.getByRole('tab', { name: 'Subscription' }).click();
    await expect(page).toHaveURL(/tab=subscription/);
    // Owner decision: Rs 0 components stay visible in detailed quotes and contract breakdowns.
    await expect(page.getByTestId('t360-components')).toContainText('Base platform fee');
    await expect(page.getByTestId('t360-regular')).toContainText('Rs 0.00');
    await expect(page.getByTestId('t360-regular')).toContainText('Rs 3,060.00');

    await page.getByRole('tab', { name: 'Modules and sites' }).click();
    await expect(page.getByTestId('t360-grant-maintenance')).toContainText('All sites');
    // Two modules in force, two scheduled from 1 November (approved amendment).
    await expect(page.getByTestId('t360-grants').locator('tbody tr')).toHaveCount(4);
    await expect(page.getByTestId('t360-not-licensed')).toContainText('Sales CRM');
    await expect(page.getByTestId('t360-sites')).toContainText('64 flats');

    await page.getByRole('tab', { name: 'Audit' }).click();
    await expect(page.getByTestId('audit-trail')).toContainText('Contract version 1 activated for Shalimar Court Residents (Demo)');
    await page.reload();
    await expect(page.getByTestId('t360-tab-audit')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('commercial tab: the pending approval, its reasons and the discount with its reason', async ({ page }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/tenants/tnt_kestrel?tab=commercial`);
    await expect(page.getByTestId('t360-approval')).toContainText('Awaiting decision');
    await expect(page.getByTestId('t360-approval')).toContainText('Omar Sheikh');
    await expect(page.getByTestId('t360-discounts')).toContainText('Six-month introductory offer');
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.getByTestId('approval-approve')).toBeVisible();
  });

  test('platform support sees the record but not the preview; tenant records stay closed', async ({ page }) => {
    await seedHq(page, 'platform_support');
    await page.goto(`${HQ}/hq/tenants/tnt_larkspur`);
    await expect(page.getByTestId('tenant-360')).toBeVisible();
    await expect(page.getByTestId('t360-preview')).toHaveCount(0);
    await page.goto(`${HQ}/hq/tenants/tnt_larkspur/preview`);
    await expect(page.getByTestId('state-error').or(page.getByTestId('state-forbidden'))).toBeVisible();
  });

  test('an unknown tenant shows not found', async ({ page }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/tenants/tnt_missing`);
    await expect(page.getByTestId('state-not-found')).toBeVisible();
  });
});

test.describe('Preview as client (HQ-009)', () => {
  test('a maintenance-only client: developer areas are not in the plan; no tenant records', async ({ page, consoleErrors }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/tenants/tnt_shalimar`);
    await page.getByTestId('t360-preview').click();
    const preview = page.getByTestId('preview-page');
    // Shalimar's own roles (owner decision): the starter "Administrator" first, then its own "Facility manager".
    await expect(preview).toHaveAttribute('data-role', 'administrator');
    await expect(page.getByTestId('preview-no-records')).toBeVisible();

    await page.getByTestId('preview-role').getByText('Facility manager').click();
    await expect(preview).toHaveAttribute('data-role', 'facility_manager');
    await expect(page).toHaveURL(/role=facility_manager/);
    for (const area of ['sales', 'projects', 'finance']) await expect(page.getByTestId(`preview-area-${area}`), area).toHaveAttribute('data-status', 'notInPlan');
    await expect(page.getByTestId('preview-area-operations')).toHaveAttribute('data-status', 'available');
    await expect(page.getByTestId('preview-area-administration')).toHaveAttribute('data-status', 'role');
    await expect(page.getByTestId('preview-nav')).not.toContainText('Sales');
    await expect(page.getByTestId('preview-qc-new-lead')).toHaveAttribute('data-status', 'notInPlan');
    await expect(page.getByTestId('preview-qc-new-service-request')).toHaveAttribute('data-status', 'available');
    await expect(page.getByTestId('preview-address-result')).toHaveAttribute('data-status', 'notInPlan');
    expect(consoleErrors).toEqual([]);
  });

  test('the preview shows the client’s actual menu (same as the workspace shows that person)', async ({ page, browser }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/tenants/tnt_shalimar/preview?role=facility_manager`);
    await expect(page.getByTestId('preview-nav')).toBeVisible();
    const previewed = (await page.getByTestId('preview-nav').locator('li').allInnerTexts()).map((s) => s.trim());

    const client = await browser.newPage();
    await seed(client, { persona: 'facility_manager' });
    await client.goto(`${BO}/backoffice`);
    await expect(client.getByTestId('plan-home')).toBeVisible();
    const actual = (await client.locator('[data-tour-id="nav-primary"] a').allInnerTexts()).map((s) => s.trim()).filter((s) => s !== 'Design system lab');
    expect(previewed).toEqual(actual);
    await client.close();
  });

  test('what-if modules change the preview, are not saved and not audited; opening is audited', async ({ page }) => {
    await seedHq(page);
    // Shalimar's own facility manager role carries lead permissions; only the licence stops them.
    await page.goto(`${HQ}/hq/tenants/tnt_shalimar/preview?role=facility_manager`);
    await expect(page.getByTestId('preview-page')).toBeVisible();
    const writes = await page.evaluate(() => window.__hq!.transport.storeWrites());

    await page.getByTestId('preview-whatif-toggle').click();
    await page.getByTestId('preview-module-crm').click();
    await expect(page.getByTestId('preview-whatif-banner')).toBeVisible();
    await expect(page.getByTestId('preview-area-sales')).toHaveAttribute('data-status', 'available');
    await expect(page.getByTestId('preview-area-sales')).toContainText('Would gain');
    expect(await page.evaluate(() => window.__hq!.transport.storeWrites())).toBe(writes);

    // A module whose requirement is missing is flagged (Sales needs Inventory and Receivables).
    await page.getByTestId('preview-module-sales').click();
    await expect(page.getByTestId('preview-dependency-issues')).toContainText('Sales and bookings needs');

    // The tenant is unchanged, and the opening of the preview is on its audit trail.
    await page.goto(`${HQ}/hq/tenants/tnt_shalimar?tab=audit`);
    await expect(page.getByTestId('audit-trail')).toContainText('previewed Shalimar Court Residents (Demo) as a client role (no tenant records)');
    await page.getByRole('tab', { name: 'Modules and sites' }).click();
    // Two modules in force, two scheduled from 1 November (approved amendment).
    await expect(page.getByTestId('t360-grants').locator('tbody tr')).toHaveCount(4);
  });

  test('a developer tenant: the sales role has sales but not finance', async ({ page }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/tenants/tnt_larkspur/preview?role=sales`);
    await expect(page.getByTestId('preview-area-sales')).toHaveAttribute('data-status', 'available');
    await expect(page.getByTestId('preview-area-finance')).toHaveAttribute('data-status', 'role');
    await expect(page.getByTestId('preview-search-invoices')).toHaveAttribute('data-status', 'role');
  });

  test('phone: no sideways scrolling on Tenant 360 and the preview', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seedHq(page);
    for (const path of ['/hq/tenants/tnt_shalimar', '/hq/tenants/tnt_shalimar?tab=modules', '/hq/tenants/tnt_larkspur?tab=subscription', '/hq/tenants/tnt_shalimar/preview']) {
      await page.goto(`${HQ}${path}`);
      await page.locator('main h1').first().waitFor();
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
