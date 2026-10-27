import type { Page } from '@playwright/test';
import { expect, HQ, seed, test, type PersonaId } from '../support/fixtures';
import { scanA11y } from '../support/axe';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate B checkpoint 1 (A7 B.5, B.5a, B.5b): Platform HQ shell, dashboard, tenant creation with
 * modules, site entitlements, pricing, quote and activation; commercial approvals (maker ≠ checker);
 * the non-writing simulator; the platform plane never reading tenant records.
 */

async function seedHq(page: Page, persona: PersonaId = 'supreme_admin', locale: 'en-PK' | 'ur-PK' = 'en-PK') {
  await seed(page, { app: 'platform', persona, locale });
}

const input = (page: Page, testId: string) => page.getByTestId(testId).locator('input').first();

type AtStep = (step: string) => Promise<void>;
const noop: AtStep = async () => {};

/** Steps 1–4 for the owner's example society (Al-Noor, 80 flats, community edition). */
async function createUpToPricing(page: Page, name = 'Al-Noor Residency (Demo)', at: AtStep = noop) {
  await page.goto(`${HQ}/hq/tenants/new`);
  await page.getByTestId('edition-community').click();
  await at('type');
  await page.getByTestId('step-type-next').click();
  await expect(page.getByTestId('step-organisation')).toBeVisible();
  await input(page, 'org-display').fill(name);
  await input(page, 'org-legal').fill(`${name.replace(' (Demo)', '')} Owners Association (Demo)`);
  await input(page, 'org-contact').fill('Faisal Butt');
  await input(page, 'org-email').fill('faisal@example.com');
  await input(page, 'org-phone').fill('03994100000');
  await at('organisation');
  await page.getByTestId('step-organisation-next').click();
  await expect(page.getByTestId('step-sites')).toBeVisible();
  await input(page, 'site-units-0').fill('80');
  await input(page, 'site-buildings-0').fill('2');
  await input(page, 'site-buildings-0').press('Tab');
  await at('sites');
  await page.getByTestId('step-sites-next').click();
  await expect(page.getByTestId('dependencies-ok')).toBeVisible();
  await at('modules');
  await page.getByTestId('step-modules-next').click();
  await expect(page.getByTestId('pricing-builder')).toBeVisible();
  await at('pricing');
}

async function pricingToReview(page: Page, discount?: { percent: string; reason: string }, at: AtStep = noop) {
  await page.getByTestId('step-pricing-next').click();
  await expect(page.getByTestId('step-counts')).toBeVisible();
  await at('counts');
  await page.getByTestId('step-counts-next').click();
  await expect(page.getByTestId('step-terms')).toBeVisible();
  if (discount) {
    await page.getByTestId('add-discount').click();
    await input(page, 'discount-value-0').fill(discount.percent);
    await input(page, 'discount-reason-0').fill(discount.reason);
    await input(page, 'discount-reason-0').press('Tab');
  }
  await at('terms');
  await page.getByTestId('step-terms-next').click();
  await expect(page.getByTestId('quote-totals')).toBeVisible();
  await at('quote');
  await page.getByTestId('step-quote-next').click();
  await expect(page.getByTestId('step-review')).toBeVisible();
  await at('review');
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('Platform HQ (Gate B checkpoint 1)', () => {
  test('AB-1/AB-2: create Al-Noor Residency: PKR 18,700 first month, 3,700 after, activated', async ({ page, consoleErrors }) => {
    await seedHq(page);
    await createUpToPricing(page);
    // Live price beside the builder, priced by the server.
    await expect(page.getByTestId('aside-first').first()).toHaveText(/18,700\.00/);
    await expect(page.getByTestId('aside-regular').first()).toHaveText(/3,700\.00/);
    await page.getByTestId('step-pricing-next').click();
    await page.getByTestId('step-counts-next').click();
    await page.getByTestId('step-terms-next').click();
    await expect(page.getByTestId('quote-first')).toContainText('Rs 18,700.00');
    await expect(page.getByTestId('quote-regular')).toContainText('Rs 3,700.00');
    await expect(page.getByTestId('quote-year')).toContainText('Rs 59,400.00');
    await expect(page.getByTestId('approval-ok')).toBeVisible();
    await page.getByTestId('step-quote-next').click();
    await page.getByTestId('step-review-next').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Activate demo tenant' }).click();
    await expect(page.getByTestId('step-done')).toContainText('Al-Noor Residency (Demo) is set up');

    await page.getByTestId('done-open-tenant').click();
    const drawer = page.getByTestId('tenant-summary');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('summary-status')).toContainText('Active');
    await expect(drawer.getByTestId('quote-first')).toContainText('Rs 18,700.00');
    await expect(drawer.getByTestId('summary-modules')).not.toContainText('Sales CRM');
    await expect(drawer).toContainText('Al-Noor Residency (Demo) was created');

    // Simulate pricing starts the simulator from this tenant's contract.
    await drawer.getByTestId('summary-simulate').click();
    await expect(page).toHaveURL(/\/hq\/simulator\?tenant=/);
    await expect(page.getByTestId('sim-results').getByTestId('quote-regular')).toContainText('Rs 3,700.00');
    expect(consoleErrors).toEqual([]);
  });

  test('wizard entries survive Back and a refresh (draft saved on the server)', async ({ page }) => {
    await seedHq(page);
    await createUpToPricing(page, 'Draft Keeper Society (Demo)');
    await page.reload();
    await expect(page.getByTestId('step-pricing')).toBeVisible();
    await page.getByTestId('step-pricing-back').click();
    await page.getByTestId('step-modules-back').click();
    await page.getByTestId('step-sites-back').click();
    await expect(input(page, 'org-display')).toHaveValue('Draft Keeper Society (Demo)');
  });

  test('review → Edit a section → Continue returns to the review with the change', async ({ page }) => {
    await seedHq(page);
    await createUpToPricing(page, 'Edit Path Society (Demo)');
    await pricingToReview(page);
    await page.getByTestId('review-edit-organisation').click();
    await expect(page.getByTestId('step-organisation')).toBeVisible();
    await input(page, 'org-display').fill('Edit Path Gardens (Demo)');
    await page.getByTestId('step-organisation-next').click();
    await expect(page.getByTestId('step-review')).toBeVisible();
    await expect(page.getByTestId('review-organisation')).toContainText('Edit Path Gardens (Demo)');
  });

  test('AB-3: a missing hard requirement blocks Continue and one click adds it', async ({ page }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/tenants/new`);
    await page.getByTestId('edition-community').click();
    await page.getByTestId('step-type-next').click();
    await input(page, 'org-display').fill('Dependency Check (Demo)');
    await input(page, 'org-legal').fill('Dependency Check Association (Demo)');
    await input(page, 'org-contact').fill('Sana Raza');
    await input(page, 'org-email').fill('sana@example.com');
    await input(page, 'org-phone').fill('03994100001');
    await page.getByTestId('step-organisation-next').click();
    await input(page, 'site-units-0').fill('40');
    await page.getByTestId('step-sites-next').click();
    await expect(page.getByTestId('dependencies-ok')).toBeVisible();

    await page.getByTestId('toggle-receivables').click();
    const issues = page.getByTestId('dependency-issues');
    await expect(issues).toContainText('Community dues needs Receivables.');
    await expect(page.getByTestId('step-modules-next')).toBeDisabled();
    await expect(page.getByText('Resolve the module requirements first.')).toBeVisible();

    await page.getByTestId('apply-fixes').click();
    await expect(page.getByTestId('dependencies-ok')).toBeVisible();
    await expect(page.getByTestId('step-modules-next')).toBeEnabled();
  });

  test('AB-15: a 20 % discount waits for approval; the requester cannot approve; an approver can', async ({ page, consoleErrors }) => {
    await seedHq(page);
    await createUpToPricing(page, 'Kite Gardens Society (Demo)');
    await pricingToReview(page, { percent: '20', reason: 'Launch offer' });
    await expect(page.getByTestId('approval-reason-discount_above_limit')).toBeVisible();
    await page.getByTestId('step-review-next').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Submit for approval' }).click();
    await expect(page.getByTestId('step-done')).toContainText('waiting for approval');

    await page.getByTestId('done-open-tenant').click();
    await expect(page.getByTestId('summary-approval')).toBeVisible();
    await expect(page.getByTestId('approval-waiting')).toHaveText(/another approver must decide/i);
    await expect(page.getByTestId('approval-approve')).toHaveCount(0);

    // Switch the demo identity to the commercial approver (same browser tab, same demo data).
    await page.goto(`${HQ}/hq/more`);
    await page.getByTestId('more-role-commercial_approver').click();
    // A new identity's first sign-in offers the HQ tour; this test declines it.
    await page.getByTestId('welcome-explore').click();
    await page.goto(`${HQ}/hq/tenants?status=awaiting_approval`);
    await page.getByRole('button', { name: 'Kite Gardens Society (Demo)' }).first().click();
    await page.getByTestId('approval-approve').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByTestId('tenant-summary').getByTestId('summary-status')).toContainText('Active');
    await expect(page.getByTestId('tenant-summary')).toContainText('Contract approved for Kite Gardens Society (Demo)');
    expect(consoleErrors).toEqual([]);
  });

  test('AB-6: the simulator re-prices what-ifs and never writes', async ({ page }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/simulator`);
    const results = page.getByTestId('sim-results');
    await expect(results.getByTestId('quote-first')).toContainText('Rs 18,700.00');
    await expect(results.getByTestId('quote-regular')).toContainText('Rs 3,700.00');
    const before = await page.evaluate(() => window.__hq!.transport.storeWrites());

    await page.getByTestId('sim-basis').getByText('Occupied flats').click();
    await expect(results.getByTestId('quote-regular')).toContainText('Rs 3,540.00');
    await expect(page.getByTestId('sim-delta')).toBeVisible();
    await input(page, 'sim-units').fill('100');
    await input(page, 'sim-units').press('Tab');
    await expect(results.getByTestId('quote-regular')).toContainText('Rs 4,500.00');

    expect(await page.evaluate(() => window.__hq!.transport.storeWrites())).toBe(before);
    await expect(page.getByTestId('simulator-banner')).toBeVisible();
  });

  test('AB-9: platform support sees licences but cannot create tenants or read tenant records', async ({ page }) => {
    await seedHq(page, 'platform_support');
    await page.goto(`${HQ}/hq`);
    await expect(page.getByTestId('hq-dashboard')).toBeVisible();
    await expect(page.getByTestId('hq-create-header')).toHaveCount(0);
    await expect(page.getByTestId('hq-qa-create')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Pricing simulator' })).toHaveCount(0);
    const denied = await page.evaluate(async () => {
      try {
        await window.__hq!.transport.request({ method: 'GET', path: '/platform/tenants/tnt_larkspur/records/parties' });
        return 'allowed';
      } catch (e) {
        return (e as { problem?: { code: string } }).problem?.code ?? 'error';
      }
    });
    expect(denied).toBe('support_grant_required');
  });

  test('the dashboard shows the platform figures and opens what needs attention', async ({ page }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq`);
    await expect(page.getByTestId('hq-kpi-mrr')).toContainText('Rs 59,780.00');
    await expect(page.getByTestId('hq-kpi-approvals')).toContainText('1');
    await page.getByTestId('attention-approval').click();
    await expect(page).toHaveURL(/tenant=tnt_kestrel/);
    await expect(page.getByTestId('tenant-summary')).toContainText('A discount of 20 % is above the 15 % limit.');
    // Supreme Admin did not request this one, so may decide it.
    await expect(page.getByTestId('approval-approve')).toBeVisible();
  });

  test('tenant filters live in the URL and survive a reload', async ({ page }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/tenants`);
    await page.getByTestId('tenants-status-grace').click();
    await expect(page).toHaveURL(/status=grace/);
    await expect(page.getByTestId('tenants-table')).toContainText('Riverbend Estate Managers (Demo)');
    await expect(page.getByTestId('tenants-table')).not.toContainText('Larkspur Estates (Demo)');
    await page.reload();
    await expect(page.getByTestId('tenants-table')).toContainText('Riverbend Estate Managers (Demo)');
    await page.getByTestId('tenants-status-all').click();
    await page.getByRole('tab', { name: 'Workspace requests' }).click();
    await expect(page.getByTestId('requests-list')).toContainText('Sunfield Apartments Association (Demo)');
  });

  test('AB-12: switching to Urdu mid-wizard keeps the entries and mirrors the layout', async ({ page }) => {
    await seedHq(page);
    await page.goto(`${HQ}/hq/tenants/new`);
    await page.getByTestId('edition-portfolio').click();
    await page.getByTestId('step-type-next').click();
    await input(page, 'org-display').fill('Bilingual Estates (Demo)');
    await page.getByTestId('locale-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1, name: /تنظیم کی تفصیلات/ })).toBeVisible();
    await expect(input(page, 'org-display')).toHaveValue('Bilingual Estates (Demo)');
  });

  test('phone: bottom bar with a centre Create tenant, a short More page, no sideways scrolling', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seedHq(page);
    await page.goto(`${HQ}/hq`);
    await expect(page.getByTestId('bottom-nav')).toBeVisible();
    await expect(page.getByTestId('hq-create-fab')).toBeVisible();
    for (const path of ['/hq', '/hq/tenants', '/hq/simulator', '/hq/tenants/new', '/hq/more']) {
      await page.goto(`${HQ}${path}`);
      await page.locator('main h1').first().waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await page.getByTestId('bottom-nav-more').click();
    await expect(page.getByTestId('more-area-tenants')).toBeVisible();
  });

  test('phone: the live price stays in view while pricing, and the simulator jumps to its results', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seedHq(page);
    await createUpToPricing(page, 'Pocket Price Society (Demo)');
    const bar = page.getByTestId('price-bar');
    await expect(bar.getByTestId('price-bar-first')).toHaveText(/18,700\.00/);
    // Scrolled to the end of a long builder, the bar is still on screen under the header.
    await page.getByTestId('step-pricing-next').scrollIntoViewIfNeeded();
    await expect(bar).toBeInViewport();

    await page.goto(`${HQ}/hq/simulator`);
    await expect(page.getByTestId('sim-price-bar-regular')).toHaveText(/3,700\.00/);
    await page.getByTestId('sim-see-results').click();
    await expect(page.getByTestId('sim-results')).toBeFocused();
    await expect(page.getByTestId('sim-results').getByTestId('quote-first')).toBeInViewport();
  });

  for (const vp of [VIEWPORTS.reflow, VIEWPORTS.zoom200]) {
    test(`AB-12 reflow at ${vp.width} × ${vp.height}: every HQ screen, wizard step and the summary without sideways scrolling`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(vp);
      await seedHq(page);
      const check = async (label: string) => {
        await page.waitForTimeout(300);
        expect(await horizontalOverflow(page), label).toBeLessThanOrEqual(0);
      };
      for (const path of ['/hq', '/hq/tenants', '/hq/tenants?tab=requests', '/hq/simulator', '/hq/more', '/hq/help/tours']) {
        await page.goto(`${HQ}${path}`);
        await page.locator('main h1').first().waitFor();
        await check(path);
      }
      await page.goto(`${HQ}/hq/tenants?tenant=tnt_kestrel`);
      await expect(page.getByTestId('tenant-summary')).toBeVisible();
      await check('tenant summary');
      await createUpToPricing(page, `Reflow ${vp.width} Society (Demo)`, check);
      await pricingToReview(page, { percent: '20', reason: 'Launch offer' }, check);
      await page.getByTestId('step-review-next').click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Submit for approval' }).click();
      await expect(page.getByTestId('step-done')).toBeVisible();
      await check('done');
    });
  }

  for (const locale of ['en-PK', 'ur-PK'] as const) {
    for (const vp of ['desktop', 'phone'] as const) {
      test(`axe: every HQ screen and wizard step (${locale}, ${vp})`, async ({ page }, testInfo) => {
        test.setTimeout(180_000);
        await page.setViewportSize(VIEWPORTS[vp]);
        await seedHq(page, 'supreme_admin', locale);
        const failures: string[] = [];
        const scan = async (label: string) => {
          const { violations } = await scanA11y(page, testInfo, `${locale}-${vp}-${label}`);
          for (const v of violations) failures.push(`${label}: ${v.id} (${v.nodes}) ${v.targets.join(' | ')}`);
        };
        for (const [label, path, ready] of [
          ['dashboard', '/hq', 'hq-dashboard'],
          ['tenants', '/hq/tenants', 'tenants-status'],
          ['summary', '/hq/tenants?tenant=tnt_kestrel', 'summary-approval'],
          ['requests', '/hq/tenants?tab=requests', 'requests-list'],
          ['simulator', '/hq/simulator', 'sim-results'],
          ['more', '/hq/more', 'more-area-dashboard'],
          ['preferences', '/hq/preferences', null],
          ['planned', '/hq/catalogue', 'planned-screen'],
        ] as const) {
          await page.goto(`${HQ}${path}`);
          await page.locator('main h1').first().waitFor();
          if (ready) await page.getByTestId(ready).first().waitFor();
          await scan(label);
        }
        // Every wizard step, including the field errors of the organisation step.
        await page.goto(`${HQ}/hq/tenants/new`);
        await scan('wizard-type');
        await page.getByTestId('edition-community').click();
        await page.getByTestId('step-type-next').click();
        await page.getByTestId('step-organisation-next').click();
        await page.getByTestId('wizard-errors').waitFor();
        await scan('wizard-organisation-errors');
        await input(page, 'org-display').fill('Scan Society (Demo)');
        await input(page, 'org-legal').fill('Scan Society Association (Demo)');
        await input(page, 'org-contact').fill('Iqra Rana');
        await input(page, 'org-email').fill('iqra@example.com');
        await input(page, 'org-phone').fill('03994100002');
        await page.getByTestId('step-organisation-next').click();
        await input(page, 'site-units-0').fill('60');
        await scan('wizard-sites');
        await page.getByTestId('step-sites-next').click();
        await page.getByTestId('dependencies-ok').waitFor();
        await scan('wizard-modules');
        await page.getByTestId('toggle-receivables').click();
        await page.getByTestId('dependency-issues').waitFor();
        await scan('wizard-modules-dependency');
        await page.getByTestId('apply-fixes').click();
        await page.getByTestId('dependencies-ok').waitFor();
        await page.getByTestId('step-modules-next').click();
        await page.getByTestId('pricing-builder').waitFor();
        await scan('wizard-pricing');
        await page.getByTestId('step-pricing-next').click();
        await page.getByTestId('step-counts').waitFor();
        await scan('wizard-counts');
        await page.getByTestId('step-counts-next').click();
        await page.getByTestId('add-discount').click();
        await scan('wizard-terms');
        await input(page, 'discount-reason-0').fill('Scan');
        await input(page, 'discount-reason-0').press('Tab');
        await page.getByTestId('step-terms-next').click();
        await page.getByTestId('quote-totals').waitFor();
        await scan('wizard-quote');
        await page.getByTestId('step-quote-next').click();
        await page.getByTestId('step-review').waitFor();
        await scan('wizard-review');
        await page.getByTestId('step-review-next').click();
        await page.getByRole('alertdialog').waitFor();
        await scan('wizard-confirm');
        await page.getByRole('alertdialog').getByRole('button').last().click();
        await page.getByTestId('step-done').waitFor();
        await scan('wizard-done');
        expect(failures).toEqual([]);
      });
    }
  }

  for (const vp of ['desktop', 'phone', 'reflow'] as const) {
    test(`AB-13: HQ tour frames a real control at every step (${VIEWPORTS[vp].width} px)`, async ({ page }) => {
      await page.setViewportSize(VIEWPORTS[vp]);
      await seed(page, { app: 'platform', persona: 'supreme_admin', onboarding: 'fresh' });
      await page.goto(`${HQ}/hq`);
      await page.getByTestId('welcome-start').click();
      const card = page.getByTestId('tour-card');
      await expect(card).toHaveAttribute('data-step-id', 'welcome');
      const phone = vp !== 'desktop';
      const anchors = [
        ['attention', phone ? 'hq-attention-first' : 'hq-attention'],
        ['figures', phone ? 'hq-kpi-first' : 'hq-kpis'],
        ['create', phone ? 'hq-create-fab' : 'hq-create-tenant'],
        ['navigation', phone ? 'bottom-nav' : 'nav-primary'],
        ['search', 'command-search'],
        ['quickActions', 'hq-quick-actions'],
        ['help', 'global-help'],
      ] as const;
      for (const [id, anchor] of anchors) {
        await page.getByTestId('tour-next').click();
        await expect(card).toHaveAttribute('data-step-id', id);
        // The spotlight travels between anchors; wait until it covers this step's real control.
        const target = page.locator(`[data-tour-id="${anchor}"]:visible`).first();
        const spot = page.getByTestId('tour-spotlight');
        await expect(target, `step ${id}`).toBeVisible();
        await expect(spot, `step ${id}`).toBeVisible();
        await expect
          .poll(async () => {
            const t = await target.boundingBox();
            const s = await spot.boundingBox();
            return !!t && !!s && s.x <= t.x + 3 && s.y <= t.y + 3 && s.x + s.width >= t.x + t.width - 3 && s.y + s.height >= t.y + t.height - 3;
          }, { message: `step ${id} spotlight on ${anchor}` })
          .toBe(true);
      }
      await expect(page.getByTestId('tour-next')).toHaveText(/finish/i);
    });
  }
});
