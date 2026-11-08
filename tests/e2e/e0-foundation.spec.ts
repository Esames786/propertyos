import type { Page } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, seed, test, type PersonaId } from '../support/fixtures';

/**
 * Gate E.0 in the running backoffice (Issues #22/#23 and the foundation's shared registrations):
 * - a hold is released only by the person who placed it: a colleague sees who it is held for and until
 *   when, with no Release button, and the server refuses them like a unit never held;
 * - a unit outside a salesperson's project answers like an invented id;
 * - the four new fictional Larkspur people sign in and see the areas their new permissions open, while
 *   the existing people's menus are unchanged.
 */
const nav = (page: Page) => page.locator('[data-tour-id="nav-primary"]');
const UNIT = 'unt_lh_a_0102';
const GARDENS_UNIT = 'unt_lg_p1_001';
// The new people are not in the shared fixture's PersonaId list (tests/support is integration-owned).
const as = (id: string) => id as PersonaId;

async function api<T = unknown>(page: Page, path: string, method: 'GET' | 'POST' = 'GET', body: unknown = {}) {
  return page.evaluate(
    async ({ path, method, body }) => {
      try {
        return { ok: true as const, res: (await window.__prototype!.transport.request({ method, path, ...(method === 'POST' ? { body } : {}) })) as unknown };
      } catch (e) {
        return { ok: false as const, code: (e as { problem?: { code: string } }).problem?.code ?? 'error' };
      }
    },
    { path, method, body },
  ) as Promise<{ ok: true; res: T } | { ok: false; code: string }>;
}

test.describe('Gate E.0: unit holds belong to the person who placed them (Issue #23)', () => {
  test('Nadia holds a Heights flat; Bilal sees it held for the lead, cannot release it, and cannot tell a Gardens unit from an invented one', async ({ page, consoleErrors }, testInfo) => {
    await seed(page, { persona: 'manager' });
    await page.goto(`${BO}/backoffice/crm/leads-list`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const lead = await page.evaluate(async () => {
      const res = (await window.__prototype!.transport.request({ method: 'GET', path: '/leads', query: { project: 'prj_heights' } })) as { items: Array<{ id: string; ref: string }> };
      return res.items[0]!;
    });
    expect((await api(page, `/units/${UNIT}/hold`, 'POST', { leadId: lead.id })).ok).toBe(true);

    // The initiator is offered Release.
    await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=${lead.id}&unit=${UNIT}`);
    const quick = page.getByTestId('unit-quick-view');
    await expect(quick).toBeVisible();
    await expect(quick.getByTestId('unit-release')).toBeVisible();

    // Switch to Bilal in the same browser (the demo session keeps Nadia's hold).
    await page.goto(`${BO}/backoffice/more`);
    await page.getByTestId('more-sign-out').click();
    await page.getByTestId('sign-in-sales').click();
    await expect(page.getByRole('button', { name: /Account menu for Bilal Ahmed/ })).toBeVisible();
    await page.getByTestId('welcome-explore').click();

    await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=${lead.id}&unit=${UNIT}`);
    await expect(quick).toBeVisible();
    // The reference is kept whole and bidi-isolated with invisible joiners; compare the visible words.
    await expect.poll(async () => (await quick.getByTestId('unit-hold-badge').innerText()).replace(/[⁠⁨⁩]/g, '')).toContain(`Held for ${lead.ref} until`);
    await expect(quick.getByTestId('unit-release')).toHaveCount(0);
    await expect(quick.getByTestId('unit-hold')).toBeDisabled();
    const { violations } = await scanA11y(page, testInfo, 'e0-quick-view-colleague-hold');
    expect(violations).toEqual([]);

    // The server agrees: someone else's hold, no hold and an invented unit answer alike.
    expect(await api(page, `/units/${UNIT}/release`, 'POST')).toEqual({ ok: false, code: 'not_found' });
    expect(await api(page, '/units/unt_lh_never_issued/release', 'POST')).toEqual({ ok: false, code: 'not_found' });
    // Issue #22 on units: a Gardens unit is not found for Bilal, exactly like an invented one.
    expect(await api(page, `/units/${GARDENS_UNIT}`)).toEqual({ ok: false, code: 'not_found' });
    expect(await api(page, '/units/unt_lg_never_issued')).toEqual({ ok: false, code: 'not_found' });
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('Gate E.0: the new maker-checker people and the developer areas', () => {
  test('the sign-in page offers the four new fictional Larkspur people', async ({ page }) => {
    await seed(page, { persona: null });
    await page.goto(`${BO}/backoffice/sign-in`);
    for (const [id, name] of [['lsp_sales_manager', 'Hamza Rashid'], ['lsp_project_manager', 'Mehwish Kazmi'], ['lsp_accounts', 'Faiza Noor'], ['lsp_finance_controller', 'Zubair Ansari']]) {
      await expect(page.getByTestId(`sign-in-${id}`), id).toContainText(name!);
    }
  });

  test('the accounts officer gets Accounting (planned until E.7 lands) and no Projects; My access names her permissions', async ({ page, consoleErrors }) => {
    await seed(page, { persona: as('lsp_accounts') });
    await page.goto(`${BO}/backoffice`);
    await expect(nav(page).getByRole('link', { name: 'Accounting', exact: true })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Projects', exact: true })).toHaveCount(0);
    await nav(page).getByRole('link', { name: 'Accounting', exact: true }).click();
    await expect(page).toHaveURL(/\/backoffice\/acc\/chart-of-accounts$/);
    await expect(page.getByTestId('planned-screen')).toBeVisible();
    await page.goto(`${BO}/backoffice/global/my-access`);
    await expect(page.getByTestId('my-access-area-accounting')).toContainText('Prepare journals');
    await expect(page.getByTestId('my-access-area-banking')).toContainText('Import bank statements');
    expect(consoleErrors).toEqual([]);
  });

  test('the finance controller opens Projects and Accounting (the planned pages, not a refusal)', async ({ page }) => {
    await seed(page, { persona: as('lsp_finance_controller') });
    await page.goto(`${BO}/backoffice`);
    await expect(nav(page).getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Accounting', exact: true })).toBeVisible();
    await page.goto(`${BO}/backoffice/prj/projects-list`);
    await expect(page.getByTestId('planned-screen')).toBeVisible();
    await expect(page.getByTestId('access-outcome')).toHaveCount(0);
  });

  for (const persona of ['manager', 'sales', 'finance'] as const) {
    test(`existing menus are unchanged (${persona}): no Accounting; Projects exactly as before`, async ({ page }) => {
      await seed(page, { persona });
      await page.goto(`${BO}/backoffice`);
      await expect(nav(page).getByRole('link', { name: 'Home', exact: true })).toBeVisible();
      await expect(nav(page).getByRole('link', { name: 'Accounting', exact: true })).toHaveCount(0);
      await expect(nav(page).getByRole('link', { name: 'Projects', exact: true })).toHaveCount(persona === 'finance' ? 0 : 1);
    });
  }
});
