import type { Page } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { layoutProblems } from '../support/layout';

/**
 * Wave 1 integration (Issue #25) in the running backoffice: the seams between E.0, E.1, E.2, E.7 and E.13.
 * - INV-002: one hold ledger for the CRM quick view and the inventory drawer; the CRM quick view at 320 px
 *   with 200 % text in Urdu has no sideways scroll and keeps the unit reference whole (E.0's finding);
 * - E.13's registry finds E.1, E.2 and E.7 records and opens their live screens; the new task kinds;
 * - PRJ-002's Documents tab is E.13's (per-record access);
 * - E.0's canonical Accounting menu for the ledger people; the bank boundary for Saad.
 */
const PHONE = { width: 320, height: 700 };
const office = (persona: string, locale: Locale = 'en-PK') => ({ persona: persona as PersonaId, locale });
const nav = (page: Page) => page.locator('[data-tour-id="nav-primary"]');

async function api<T = unknown>(page: Page, path: string, method: 'GET' | 'POST' = 'GET', body: unknown = {}, query?: Record<string, string>) {
  return page.evaluate(
    async ({ path, method, body, query }) => {
      try {
        return { ok: true as const, res: (await window.__prototype!.transport.request({ method, path, ...(query ? { query } : {}), ...(method === 'POST' ? { body } : {}) })) as unknown };
      } catch (e) {
        return { ok: false as const, code: (e as { problem?: { code: string } }).problem?.code ?? 'error' };
      }
    },
    { path, method, body, query },
  ) as Promise<{ ok: true; res: T } | { ok: false; code: string }>;
}

/** Become another Larkspur person in this browser (the demo session, and its holds, are kept). */
async function become(page: Page, persona: string) {
  await page.evaluate((p) => {
    localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: p, projectId: 'all' }));
    localStorage.setItem(`onboarding:v1:tnt_larkspur:${p}:backoffice`, JSON.stringify({ profile: { tenantId: 'tnt_larkspur', personaId: p, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} }));
  }, persona);
}

async function axe(page: Page, testInfo: Parameters<typeof scanA11y>[1], label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

async function firstHeightsLead(page: Page) {
  const r = await api<{ items: Array<{ id: string; ref: string }> }>(page, '/leads', 'GET', {}, { project: 'prj_heights' });
  if (!r.ok) throw new Error(r.code);
  return r.res.items[0]!;
}

test.describe('INV-002: one hold ledger for the CRM and the inventory screens', () => {
  test('a hold placed in the inventory drawer is the CRM quick view’s hold too: same expiry, Release only for its initiator', async ({ page, consoleErrors }, testInfo) => {
    await seed(page, office('sales'));
    await page.goto(`${BO}/backoffice/crm/leads-list`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const lead = await firstHeightsLead(page);
    const units = await api<Array<{ id: string; status: string }>>(page, '/units', 'GET', {}, { projectId: 'prj_heights' });
    const unit = (units.ok ? units.res : []).find((u) => u.status === 'available')!;
    // The inventory path places the hold (INV-002's endpoint).
    expect((await api(page, `/inventory/units/${unit.id}/hold`, 'POST', { leadId: lead.id })).ok).toBe(true);
    const inv = await api<{ hold: unknown }>(page, `/inventory/units/${unit.id}`);
    const crm = await api<{ hold: unknown }>(page, `/units/${unit.id}`);
    expect(inv.ok && crm.ok && JSON.stringify(inv.res.hold) === JSON.stringify(crm.res.hold)).toBe(true);
    // The CRM quick view on Lead 360 shows it as Bilal's own hold, with Release.
    await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=${lead.id}&unit=${unit.id}`);
    const quick = page.getByTestId('unit-quick-view');
    await expect(quick.getByTestId('unit-hold-badge')).toBeVisible();
    await expect(quick.getByTestId('unit-release')).toBeVisible();
    await axe(page, testInfo, 'int-ew1-quick-view-own-hold');
    // Nadia sees the same hold, without Release; the matrix drawer agrees (no Release there either).
    await become(page, 'manager');
    await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=${lead.id}&unit=${unit.id}`);
    await expect(quick.getByTestId('unit-hold-badge')).toBeVisible();
    await expect(quick.getByTestId('unit-release')).toHaveCount(0);
    expect(await api(page, `/inventory/units/${unit.id}/release`, 'POST')).toEqual({ ok: false, code: 'not_found' });
    // Bilal releases it from the CRM quick view: the inventory drawer shows the unit available at once.
    await become(page, 'sales');
    await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=${lead.id}&unit=${unit.id}`);
    await quick.getByTestId('unit-release').click();
    await expect(quick.getByTestId('unit-hold-badge')).toHaveCount(0);
    const after = await api<{ bucket: string; hold?: unknown }>(page, `/inventory/units/${unit.id}`);
    expect(after.ok && after.res.bucket).toBe('available');
    expect(consoleErrors).toEqual([]);
  });

  test('320 × 700, Urdu, text 200 %: the CRM quick view has no sideways scroll and keeps the unit reference whole', async ({ page, consoleErrors }, testInfo) => {
    await page.setViewportSize(PHONE);
    await seed(page, { ...office('manager', 'ur-PK'), textScale: 2 });
    await page.addInitScript(() => localStorage.setItem('pref:display:v1:backoffice:tnt_larkspur:usr_lsp_0001', JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })));
    await page.goto(`${BO}/backoffice/crm/leads-list`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const lead = await firstHeightsLead(page);
    await page.goto(`${BO}/backoffice/crm/lead-360-workspace?record=${lead.id}&unit=unt_lh_a_0102`);
    const quick = page.getByTestId('unit-quick-view');
    await expect(quick.getByTestId('unit-hold')).toBeVisible();
    // No sideways scroll anywhere in the drawer's scroll container or the page.
    const sideways = await page.evaluate(() => {
      const els = [document.documentElement, ...Array.from(document.querySelectorAll('[data-testid="unit-quick-view"] [role="region"]'))];
      return Math.max(...els.map((el) => el.scrollWidth - el.clientWidth));
    });
    expect(sideways).toBeLessThanOrEqual(0);
    expect(await layoutProblems(quick)).toEqual([]);
    // The reference sits on one line inside the title.
    const ref = quick.getByRole('heading').first().locator('bdi').first();
    await expect(ref).toHaveText('LH-A-0102');
    const box = await ref.boundingBox();
    const lineHeight = await ref.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || 0);
    expect(box!.height).toBeLessThanOrEqual(lineHeight * 1.5);
    await axe(page, testInfo, 'int-ew1-quick-view-200pct-320-ur');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('E.13 registry with E.1, E.2 and E.7: search, deep links and tasks', () => {
  test('the sales manager finds an opportunity in unified search and opens it in Opportunity 360', async ({ page, consoleErrors }, testInfo) => {
    await seed(page, office('lsp_sales_manager'));
    await page.goto(`${BO}/backoffice/global/unified-search-results?q=OP-&type=opportunity`);
    const hit = page.locator('[data-testid="hub-search-group"][data-type="opportunity"] a').first();
    await expect(hit).toBeVisible();
    await axe(page, testInfo, 'int-ew1-search-opportunities');
    await hit.click();
    await expect(page).toHaveURL(/\/backoffice\/crm\/opportunity-360-workspace\?record=opp_/);
    await expect(page.getByTestId('opportunity-360')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('the finance controller finds a journal and opens it; his work queue holds the journal waiting for approval', async ({ page, consoleErrors }, testInfo) => {
    await seed(page, office('lsp_finance_controller'));
    await page.goto(`${BO}/backoffice/global/unified-search-results?q=LSP-JV&type=journal`);
    const hit = page.locator('[data-testid="hub-search-group"][data-type="journal"] a').first();
    await expect(hit).toBeVisible();
    await hit.click();
    await expect(page).toHaveURL(/\/backoffice\/acc\/journal-entries\?record=jnl_lsp_/);
    await expect(page.getByTestId('journal-detail')).toBeVisible();
    await page.goto(`${BO}/backoffice/home/my-tasks`);
    const task = page.locator('[data-testid="task-row"][data-kind="journal_approval"]').first();
    await expect(task).toBeVisible();
    await expect(task).toHaveAttribute('data-mine', 'true');
    await axe(page, testInfo, 'int-ew1-tasks-journal-approval');
    await task.getByTestId('task-action').click();
    await expect(page).toHaveURL(/\/backoffice\/acc\/journal-entries\?record=jnl_lsp_/);
    expect(consoleErrors).toEqual([]);
  });

  test('a project-limited reader finds no journal (U14): the search offers no ledger kind', async ({ page }) => {
    await seed(page, office('sales'));
    await page.goto(`${BO}/backoffice/global/unified-search-results?q=LSP-JV`);
    await expect(page.getByTestId('unified-search')).toBeVisible();
    await expect(page.locator('[data-testid="hub-search-group"][data-type="journal"]')).toHaveCount(0);
    const r = await api(page, '/workspace/resolve', 'GET', {}, { id: 'jnl_lsp_0001' });
    expect(r).toEqual(await api(page, '/workspace/resolve', 'GET', {}, { id: 'jnl_never_issued' }));
  });
});

test.describe('PRJ-002 documents and the Accounting menu', () => {
  test('Project 360’s Documents tab lists the project’s documents for a document reader (E.13), and says why not to others', async ({ page, consoleErrors }, testInfo) => {
    await seed(page, office('lsp_project_manager'));
    await page.goto(`${BO}/backoffice/prj/project-360-workspace?record=prj_heights&tab=documents`);
    const docs = page.getByTestId('p360-documents');
    await expect(docs).toHaveAttribute('data-state', 'live');
    await expect(docs.getByTestId('related-records')).toBeVisible();
    await expect(docs).toContainText('Building plan approval');
    await axe(page, testInfo, 'int-ew1-p360-documents');
    await become(page, 'manager');
    await page.goto(`${BO}/backoffice/prj/project-360-workspace?record=prj_heights&tab=documents`);
    await expect(page.getByTestId('p360-tab-outcome')).toHaveAttribute('data-state', 'no_permission');
    expect(consoleErrors).toEqual([]);
  });

  test('Saad (no bank permission) gets the Accounting menu and the ledger, never the bank import', async ({ page, consoleErrors }) => {
    await seed(page, office('lsp_ledger_clerk'));
    await page.goto(`${BO}/backoffice`);
    await expect(nav(page).getByRole('link', { name: 'Accounting', exact: true })).toBeVisible();
    await nav(page).getByRole('link', { name: 'Accounting', exact: true }).click();
    await expect(page.getByTestId('ledger-chart')).toBeVisible();
    await page.goto(`${BO}/backoffice/bank/bank-import`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
    expect(await api(page, '/bank/imports')).toEqual({ ok: false, code: 'permission_missing' });
    expect(consoleErrors).toEqual([]);
  });
});
