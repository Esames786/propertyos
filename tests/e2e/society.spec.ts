import type { Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate C.1 (A7 §C.3 storyline 1–7, acceptance AC-1…AC-8, AC-15, AC-17, AC-18): Al-Noor Residency
 * (Demo) from Get started to 79 posted invoices, through the running app. The mock server is
 * reached through the page's own transport for setup and for the checks the UI cannot show.
 */
const SITE = '/backoffice/sites/site_alnoor';
const nav = (page: Page) => page.locator('[data-tour-id="nav-primary"]');

async function api<T = unknown>(page: Page, path: string, method: 'GET' | 'POST' | 'PATCH' = 'GET', body: unknown = {}, query?: Record<string, string>) {
  return page.evaluate(
    async ({ path, method, body, query }) => {
      try {
        const res = await window.__prototype!.transport.request({ method, path, ...(method !== 'GET' ? { body } : {}), ...(query ? { query } : {}) });
        return { ok: true as const, res: res as T };
      } catch (e) {
        return { ok: false as const, code: (e as { problem?: { code: string } }).problem?.code ?? 'error', status: (e as { problem?: { status: number } }).problem?.status ?? 0 };
      }
    },
    { path, method, body, query },
  );
}

/** Become another Al-Noor colleague in the same tab (the demo session keeps the society's state). */
async function as(page: Page, persona: PersonaId) {
  await page.evaluate((persona) => {
    localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
    localStorage.setItem(
      `onboarding:v1:tnt_alnoor:${persona}:backoffice`,
      JSON.stringify({ profile: { tenantId: 'tnt_alnoor', personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} }),
    );
  }, persona);
}

/**
 * C.1 starts from the society set up and ready to bill November (C.2 made "collecting", with
 * November posted and payments arriving, the default demo; the owner kept "ready" and "fresh").
 */
async function seedReady(page: Page, options: Parameters<typeof seed>[1]) {
  await seed(page, options);
  await page.goto(`${BO}/backoffice/global/my-access`);
  expect(await api(page, '/society/demo', 'POST', { mode: 'ready' })).toMatchObject({ ok: true });
}

async function open(page: Page, path: string, ready: string) {
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready)).toBeVisible();
}

/** November run through the API: created and previewed by the manager, then (optionally) further. */
async function novemberRun(page: Page, until: 'previewed' | 'submitted' | 'posted') {
  const created = await api<{ run: { id: string } }>(page, '/billing-runs', 'POST', { period: '2026-11' });
  if (!created.ok) throw new Error(`run: ${created.code}`);
  const id = created.res.run.id;
  await api(page, `/billing-runs/${id}/preview`, 'POST');
  if (until === 'previewed') return id;
  await api(page, `/billing-runs/${id}/submit`, 'POST');
  if (until === 'submitted') return id;
  await as(page, 'alnoor_treasurer');
  await page.reload();
  await api(page, `/billing-runs/${id}/approve`, 'POST');
  await api(page, `/billing-runs/${id}/post`, 'POST');
  await as(page, 'alnoor_manager');
  await page.reload();
  return id;
}

test.describe('Gate C.1: Al-Noor Residency, setup to monthly billing', () => {
  test('AC-1 storyline (desktop, English): Get started → 80 flats → balances → charges → November run → 79 posted invoices → credit note', async ({ page, consoleErrors }) => {
    test.setTimeout(300_000);
    await seed(page, { persona: null });

    // 1. Get started → society demo → building manager, starting before setup.
    await page.goto(`${BO}/backoffice/get-started`);
    await page.getByTestId('choice-society').click();
    await expect(page.getByTestId('demo-role-step')).toHaveAttribute('data-demo', 'society');
    await page.getByTestId('demo-role-alnoor_manager').click();
    await page.getByTestId('demo-fresh').click();
    await page.getByTestId('demo-continue').click();
    await expect(page.getByTestId('demo-ready-step')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('demo-society-overview')).toHaveAttribute('data-flats', '0');
    await page.getByTestId('demo-explore').click();
    await expect(page.getByTestId('society-dashboard')).toHaveAttribute('data-mode', 'fresh');
    await expect(nav(page).getByRole('link', { name: 'Sites & flats' })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Billing' })).toBeVisible();

    // 2. Import the flat register: 3 errors and 2 duplicates reported, fixed, all-or-nothing, re-run creates nothing.
    await page.locator('[data-task="import_flats"]').click();
    await page.getByTestId('import-sample').click();
    await expect(page.getByTestId('count-errors')).toContainText('3');
    await expect(page.getByTestId('count-duplicates')).toContainText('2');
    await expect(page.getByTestId('import-error-row')).toHaveCount(3);
    await expect(page.getByTestId('import-commit')).toBeDisabled();
    const a305 = page.locator('[data-testid="import-error-row"][data-flat="A-305"]');
    await a305.getByTestId('import-fix-type').fill('Standard');
    await a305.getByTestId('import-fix-save').click();
    await expect(page.getByTestId('import-error-row')).toHaveCount(2);
    await page.getByTestId('import-apply-all').click();
    await expect(page.getByTestId('import-error-row')).toHaveCount(0);
    await expect(page.getByTestId('import-commit')).toBeDisabled();
    await page.getByTestId('import-ack').click();
    await page.getByTestId('import-commit').click();
    await expect(page.getByTestId('import-done')).toHaveAttribute('data-created', '80');
    await open(page, `${SITE}/import`, 'import-page');
    await page.getByTestId('import-sample').click();
    await expect(page.getByTestId('import-already')).toBeVisible();
    await expect(page.getByTestId('import-commit')).toBeDisabled();
    expect(((await api<{ flats: number }[]>(page, '/sites')).res as { flats: number }[])[0]!.flats).toBe(80);

    // 3. People and payers: A-102's owner, occupant and payer are three separate facts.
    await open(page, `${SITE}/units/unt_anr_a102`, 'flat-workspace');
    await expect(page.getByTestId('fact-owner')).toContainText('Tariq Mehmood');
    await expect(page.getByTestId('fact-occupant')).toContainText('Sana Iqbal');
    await expect(page.getByTestId('fact-payer')).toContainText('Sana Iqbal');

    // 4. Opening balances: imported by the manager, approved by the treasurer.
    await open(page, `${SITE}/opening-balances`, 'opening-page');
    await page.getByTestId('opening-sample').click();
    await expect(page.getByTestId('opening-preview')).toContainText('49,100.00');
    await page.getByTestId('opening-submit').click();
    await expect(page.getByTestId('opening-waiting')).toBeVisible();
    await expect(page.getByTestId('opening-approve')).toHaveCount(0);
    await as(page, 'alnoor_treasurer');
    await open(page, `${SITE}/opening-balances`, 'opening-page');
    await page.getByTestId('opening-approve').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByTestId('opening-batch')).toHaveAttribute('data-state', 'approved');

    // 5. Charges: site defaults → penthouse override → A-108 exemption approved by the treasurer.
    await as(page, 'alnoor_manager');
    await open(page, '/backoffice/billing/rules', 'rules-page');
    await page.getByTestId('rules-defaults-save').click();
    await expect(page.getByTestId('rule-row')).toHaveCount(4);
    await page.getByTestId('rules-add').click();
    const drawer = page.getByTestId('rule-drawer');
    await drawer.getByTestId('rule-target-utp_anr_penthouse').click();
    await drawer.getByTestId('rule-amount').fill('4500');
    await drawer.getByTestId('rule-save').click();
    await expect(page.getByTestId('rule-row')).toHaveCount(5);
    const which = page.getByTestId('which-rule-wins');
    await expect(which).toHaveAttribute('data-flat', 'A-501');
    await expect(which.locator('[data-category="maintenance"]')).toContainText('Set by Penthouse');
    await expect(which.locator('[data-category="maintenance"] [data-testid="charge-overridden"]')).toContainText('Al-Noor Residency');

    await open(page, '/backoffice/billing/exemptions', 'exemptions-page');
    await page.getByTestId('exemption-new').click();
    const ex = page.getByTestId('exemption-drawer');
    await ex.getByRole('combobox').fill('A-108');
    await page.getByRole('option', { name: /^A-108/ }).click();
    await ex.getByTestId('exemption-reason').fill('Association office (committee resolution)');
    await ex.getByTestId('exemption-save').click();
    await expect(page.getByTestId('exemption-card')).toHaveAttribute('data-state', 'pending_approval');
    await as(page, 'alnoor_treasurer');
    await open(page, '/backoffice/billing/exemptions', 'exemptions-page');
    await page.getByTestId('exemption-approve').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByTestId('exemption-card')).toHaveAttribute('data-state', 'approved');

    // 6. November run: create → preview (79 invoiced, A-108 exempt) → submit; the manager can't approve.
    await as(page, 'alnoor_manager');
    await open(page, '/backoffice/billing/runs/new', 'new-run-page');
    await page.getByTestId('new-run-create').click();
    await expect(page.getByTestId('run-workspace')).toHaveAttribute('data-state', 'DRAFT');
    await page.getByTestId('run-preview').click();
    await expect(page.getByTestId('run-workspace')).toHaveAttribute('data-state', 'PREVIEWED');
    await expect(page.getByTestId('run-totals')).toContainText('355,800.00');
    await expect(page.getByTestId('run-kpi-invoices')).toContainText('79');
    await expect(page.getByTestId('run-kpi-exempt')).toContainText('1');
    await page.getByTestId('run-submit').click();
    await expect(page.getByTestId('run-workspace')).toHaveAttribute('data-state', 'APPROVAL_PENDING');
    await expect(page.getByTestId('run-approve')).toBeDisabled();
    await expect(page.getByText('You prepared this run, so someone else must approve it.')).toBeVisible();
    const runId = page.url().split('/runs/')[1]!.split('?')[0]!;
    expect(await api(page, `/billing-runs/${runId}/approve`, 'POST')).toMatchObject({ ok: false, status: 403 });
    expect(await api(page, '/billing-runs', 'POST', { period: '2026-11' })).toMatchObject({ ok: false, code: 'duplicate_period' });

    // The treasurer approves → posts (a repeated post creates nothing) → notifies (simulated).
    await as(page, 'alnoor_treasurer');
    await open(page, `/backoffice/billing/runs/${runId}`, 'run-workspace');
    await page.getByTestId('run-approve').click();
    await expect(page.getByTestId('run-workspace')).toHaveAttribute('data-state', 'APPROVED');
    await page.getByTestId('run-post').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Post 79 invoices' }).click();
    await expect(page.getByTestId('run-workspace')).toHaveAttribute('data-state', 'POSTED');
    expect(await api(page, `/billing-runs/${runId}/post`, 'POST')).toMatchObject({ ok: true, res: { replayed: true } });
    const list = await api<{ total: number; totals: { billed: { amount: string } } }>(page, '/billing/invoices', 'GET', {}, { period: '2026-11', source: 'billing_run' });
    expect(list).toMatchObject({ ok: true, res: { total: 79, totals: { billed: { amount: '355800.00' } } } });
    await page.getByTestId('run-notify').click();
    await expect(page.getByTestId('run-workspace')).toHaveAttribute('data-state', 'NOTIFIED');
    await expect(page.getByTestId('run-read-only')).toBeVisible();
    await expect(page.getByTestId('run-preview')).toHaveCount(0);

    // AC-8: A-101's statement: previous balance 1,000 + November 4,200 = 5,200; the invoice is 4,200.
    await open(page, `${SITE}/units/unt_anr_a101?tab=invoices`, 'flat-workspace');
    await expect(page.getByTestId('statement-previous')).toContainText('1,000.00');
    await expect(page.getByTestId('statement-charges')).toContainText('4,200.00');
    await expect(page.getByTestId('statement-closing')).toContainText('5,200.00');

    // 7. A posted invoice has no edit action; a credit note corrects it and the statement shows both.
    await open(page, '/backoffice/fin/invoices-list?q=A-101&source=billing_run', 'society-invoices-page');
    await page.getByTestId('society-invoice-row').first().click();
    await expect(page.getByTestId('invoice-workspace')).toBeVisible();
    await expect(page.getByTestId('invoice-no-edit')).toBeVisible();
    await page.getByTestId('invoice-credit-note').click();
    const cn = page.getByTestId('credit-note-drawer');
    await cn.getByTestId('credit-amount-water').fill('400');
    await cn.getByTestId('credit-reason').fill('Water tank closed for repairs in November');
    await cn.getByTestId('credit-note-save').click();
    await expect(page.getByTestId('invoice-credit-notes')).toContainText('ANR-CN-0001');
    await expect(page.getByTestId('invoice-workspace')).toHaveAttribute('data-settlement', 'unpaid');
    await open(page, `${SITE}/units/unt_anr_a101?tab=invoices`, 'flat-workspace');
    await expect(page.locator('[data-testid="statement-entry"][data-kind="credit_note"]')).toHaveCount(1);
    await expect(page.getByTestId('statement-closing')).toContainText('4,800.00');
    expect(consoleErrors).toEqual([]);
  });

  test('AC-3: a payer change from next month, requested with a reason and approved by the treasurer, leaves the October balance with the old payer', async ({ page, consoleErrors }) => {
    await seedReady(page, { persona: 'alnoor_manager' });
    await open(page, `${SITE}/units/unt_anr_b204?tab=payer`, 'flat-workspace');
    await page.getByTestId('flat-change-payer').click();
    const drawer = page.getByTestId('change-payer-drawer');
    await drawer.locator('[data-testid^="change-payer-party-"]', { hasText: 'Hina Rana' }).click();
    await expect(drawer.getByTestId('change-payer-save')).toBeDisabled();
    await drawer.getByTestId('change-payer-reason').fill('New tenancy agreement from 1 November.');
    await drawer.getByTestId('change-payer-save').click();
    await expect(drawer).toBeHidden();
    // Requested, not yet in force: the requester cannot approve it.
    const change = page.locator('[data-testid="liability-change"]', { hasText: 'Hina Rana' });
    await expect(change).toHaveAttribute('data-state', 'pending_approval');
    await expect(change.getByTestId('liability-approve')).toHaveCount(0);
    await as(page, 'alnoor_treasurer');
    await open(page, `${SITE}/units/unt_anr_b204?tab=payer`, 'liability-changes');
    await change.getByTestId('liability-approve').click();
    await expect(change).toHaveAttribute('data-state', 'approved');
    await as(page, 'alnoor_manager');
    await open(page, `${SITE}/units/unt_anr_b204?tab=payer`, 'liability-changes');
    await expect(page.getByTestId('fact-payer')).toContainText('Faisal Chaudhry');
    const history = page.getByTestId('liability-history');
    await expect(history).toContainText('Hina Rana');
    await expect(history).toContainText('Faisal Chaudhry');
    await page.getByRole('tab', { name: 'Invoices and statement' }).click();
    await expect(page.getByTestId('flat-invoice').first()).toContainText('Billed to Faisal Chaudhry');
    // November assesses the tenant.
    const runId = await novemberRun(page, 'previewed');
    const detail = await api<{ items: Array<{ unitCode: string; payerName: string }> }>(page, `/billing-runs/${runId}`);
    expect(detail.ok && detail.res.items.find((i) => i.unitCode === 'B-204')?.payerName).toBe('Hina Rana');
    expect(consoleErrors).toEqual([]);
  });

  test('phone, Urdu: the building manager prepares and sends November for approval', async ({ page, consoleErrors }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await seedReady(page, { persona: 'alnoor_manager', locale: 'ur-PK' });
    await page.goto(`${BO}/backoffice`);
    await expect(page.getByTestId('society-dashboard')).toBeVisible();
    await expect(page.getByTestId('bottom-nav').getByRole('link', { name: 'بلنگ' })).toBeVisible();
    await expect(page.getByTestId('site-chip')).toBeVisible();
    await page.getByTestId('dashboard-primary-action').click();
    await expect(page.getByTestId('new-run-page')).toBeVisible();
    await page.getByTestId('new-run-create').click();
    await page.getByTestId('run-preview').click();
    await expect(page.getByTestId('run-workspace')).toHaveAttribute('data-state', 'PREVIEWED');
    await page.getByRole('tab', { name: 'فلیٹس' }).click();
    await expect(page.getByTestId('run-item-card')).toHaveCount(20);
    await page.getByTestId('run-items-next').click();
    await expect(page.getByTestId('run-item-card').first()).toHaveAttribute('data-flat', 'A-305');
    await page.getByTestId('run-submit').click();
    await expect(page.getByTestId('run-workspace')).toHaveAttribute('data-state', 'APPROVAL_PENDING');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(consoleErrors).toEqual([]);
  });

  test('keyboard only: find a flat from the dashboard, then create and preview the run', async ({ page, consoleErrors }) => {
    await seedReady(page, { persona: 'alnoor_manager' });
    await page.goto(`${BO}/backoffice`);
    await expect(page.getByTestId('society-dashboard')).toBeVisible();
    const jump = page.getByTestId('flat-jump').getByRole('combobox');
    // The menu grows with what the persona may open (Gate S.1 added its society finance and governance areas).
    for (let i = 0; i < 40 && !(await jump.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(jump).toBeFocused();
    await page.keyboard.type('a102');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('flat-workspace')).toHaveAttribute('data-flat', 'A-102');

    await page.goto(`${BO}/backoffice/billing/runs/new`);
    const create = page.getByTestId('new-run-create');
    for (let i = 0; i < 40 && !(await create.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(create).toBeFocused();
    await page.keyboard.press('Enter');
    const preview = page.getByTestId('run-preview');
    await expect(preview).toBeVisible();
    for (let i = 0; i < 40 && !(await preview.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(preview).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('run-workspace')).toHaveAttribute('data-state', 'PREVIEWED');
    expect(consoleErrors).toEqual([]);
  });

  test('search (Ctrl+K) finds flats, people and the billing screens, and opens them', async ({ page, consoleErrors }) => {
    await seedReady(page, { persona: 'alnoor_manager' });
    await page.goto(`${BO}/backoffice`);
    await expect(page.getByTestId('society-dashboard')).toBeVisible();
    await page.keyboard.press('Control+k');
    const palette = page.getByTestId('command-palette');
    await palette.getByRole('searchbox').fill('A-102');
    await expect(palette.locator('[data-testid="palette-record-unit"]').first()).toContainText('A-102');
    await palette.getByRole('searchbox').fill('Sana Iqbal');
    await expect(palette.locator('[data-testid="palette-record-party"]').first()).toContainText('Sana Iqbal');
    await palette.getByRole('searchbox').fill('which rule');
    await palette.getByRole('menuitem', { name: /Charge rules/ }).click();
    await expect(page.getByTestId('rules-page')).toBeVisible();
    // A developer's palette offers none of them.
    await page.evaluate(() => {
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: 'manager', projectId: 'all' }));
      localStorage.setItem('onboarding:v1:tnt_larkspur:manager:backoffice', JSON.stringify({ profile: { tenantId: 'tnt_larkspur', personaId: 'manager', app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab', 'crm'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} }));
    });
    await page.goto(`${BO}/backoffice/crm/sales-home`);
    // The shortcut is registered once the shell has rendered.
    await expect(page.locator('main h1').first()).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(page.getByTestId('command-palette')).toBeVisible();
    await page.getByTestId('command-palette').getByRole('searchbox').fill('which rule');
    await page.waitForTimeout(600);
    await expect(page.getByTestId('command-palette').getByRole('menuitem', { name: /Charge rules/ })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('AC-15: the security guard reaches no billing, payers or statements; other organisations never see Al-Noor', async ({ page, consoleErrors }) => {
    await seedReady(page, { persona: 'alnoor_guard' });
    await page.goto(`${BO}/backoffice`);
    await expect(page.getByTestId('plan-home')).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Billing' })).toHaveCount(0);
    await expect(nav(page).getByRole('link', { name: 'Sites & flats' })).toHaveCount(0);
    await page.goto(`${BO}/backoffice/billing/runs`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
    await page.goto(`${BO}/backoffice/sites/site_alnoor/units/unt_anr_a101`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
    // The units-and-payers address is a planned screen for this role: no payer is shown.
    await page.goto(`${BO}/backoffice/res/occupancy-list`);
    await expect(page.getByTestId('planned-screen')).toBeVisible();
    for (const path of ['/billing-runs', '/billing/invoices', '/statements/ba_anr_a101', '/people', '/sites/site_alnoor/roster', '/society/dashboard']) {
      expect(await api(page, path), path).toMatchObject({ ok: false, status: 403 });
    }

    // A developer's administration role has no society permissions; the maintenance-only client has no Al-Noor.
    await page.evaluate(() => localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: 'manager', projectId: 'all' })));
    await page.goto(`${BO}/backoffice/sites`);
    await expect(page.getByTestId('access-outcome')).toBeVisible();
    await page.evaluate(() => localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: 'society_admin', projectId: 'all' })));
    await page.goto(`${BO}/backoffice/sites`);
    await expect(page.getByTestId('sites-page')).toBeVisible();
    await expect(page.getByTestId('site-card')).toHaveCount(0);
    expect(await api(page, '/sites/site_alnoor/units/unt_anr_a101')).toMatchObject({ ok: false, status: 404 });
    expect(consoleErrors).toEqual([]);
  });

  test('AC-17: switching to Urdu in the middle of an import keeps the work', async ({ page, consoleErrors }) => {
    await seedReady(page, { persona: 'alnoor_manager' });
    await page.goto(`${BO}/backoffice`);
    await api(page, '/society/demo', 'POST', { mode: 'fresh' });
    await open(page, `${SITE}/import`, 'import-page');
    await page.getByTestId('import-sample').click();
    await expect(page.getByTestId('import-error-row')).toHaveCount(3);
    const url = page.url();
    await page.getByTestId('locale-toggle').first().click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ur-PK');
    expect(page.url()).toBe(url);
    await expect(page.getByTestId('import-error-row')).toHaveCount(3);
    await page.getByTestId('import-apply-all').click();
    await expect(page.getByTestId('import-error-row')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('count-errors')).toContainText('0');
    expect(consoleErrors).toEqual([]);
  });

  test('AC-17: 320 px reflow and 200 % zoom on the run workspace, its flats and the statement', async ({ page, consoleErrors }) => {
    await seedReady(page, { persona: 'alnoor_manager' });
    await page.goto(`${BO}/backoffice`);
    const runId = await novemberRun(page, 'posted');
    for (const vp of ['reflow', 'zoom200'] as const) {
      await page.setViewportSize(VIEWPORTS[vp]);
      for (const [path, ready] of [
        [`/backoffice/billing/runs/${runId}`, 'run-workspace'],
        [`/backoffice/billing/runs/${runId}?tab=items`, 'run-items-cards'],
        [`${SITE}/units/unt_anr_a101?tab=invoices`, 'statement'],
        ['/backoffice', 'society-dashboard'],
      ] as const) {
        await open(page, path, ready);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${vp} ${path}`).toBeLessThanOrEqual(0);
      }
    }
    expect(consoleErrors).toEqual([]);
  });

  test('AC-18: the building manager tour frames real controls and its guided step completes when the preview is generated', async ({ page, consoleErrors }) => {
    await seedReady(page, { persona: 'alnoor_manager', onboarding: 'fresh' });
    await page.goto(`${BO}/backoffice`);
    await page.getByTestId('welcome-start').click();
    const card = page.getByTestId('tour-card');
    await expect(card).toHaveAttribute('data-step-id', 'welcome');
    for (let i = 0; i < 12; i++) {
      const step = await card.getAttribute('data-step-id');
      if (step === 'newRun') break;
      await page.getByTestId('tour-next').click();
      await expect(card).not.toHaveAttribute('data-step-id', step ?? '');
    }
    await expect(card).toHaveAttribute('data-step-id', 'newRun');
    await page.locator('[data-tour-id="new-run-create"]').click();
    await expect(card).toHaveAttribute('data-step-id', 'preview');
    await page.locator('[data-tour-id="run-preview"]').click();
    await expect(page.getByTestId('run-workspace')).toHaveAttribute('data-state', 'PREVIEWED');
    await expect(card).toHaveAttribute('data-step-id', 'help');
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour-completion')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});

/** Every new screen and overlay, in both languages, on desktop and phone (AC-1: axe 0 violations). */
const SCREENS: ReadonlyArray<readonly [string, string, string]> = [
  ['dashboard', '/backoffice', 'society-dashboard'],
  ['sites', '/backoffice/sites', 'sites-page'],
  ['site', SITE, 'site-workspace'],
  ['site-collection', `${SITE}?tab=collection-settings`, 'payee-card'],
  ['site-methods', `${SITE}?tab=payment-methods`, 'payment-methods'],
  ['structure', `${SITE}/structure`, 'structure-tree'],
  ['structure-list', `${SITE}/structure?view=list`, 'structure-list'],
  ['unit-types', `${SITE}/unit-types`, 'unit-types-page'],
  ['opening', `${SITE}/opening-balances`, 'opening-batch'],
  ['flat', `${SITE}/units/unt_anr_a102`, 'flat-chain'],
  ['flat-people', `${SITE}/units/unt_anr_a102?tab=people`, 'ownership-history'],
  ['flat-charges', `${SITE}/units/unt_anr_a501?tab=charges`, 'charges-table'],
  ['flat-statement', `${SITE}/units/unt_anr_a101?tab=invoices`, 'statement'],
  ['people', '/backoffice/cus/customers-list', 'people-list'],
  ['person', '/backoffice/cus/customer-360-workspace?record=pty_anr_0003&tab=accounts', 'person-workspace'],
  ['roster', '/backoffice/res/occupancy-list', 'roster-page'],
  ['accounts', '/backoffice/billing/accounts', 'accounts-list'],
  ['account', '/backoffice/billing/accounts/ba_anr_a201?tab=statement', 'statement'],
  ['charges', '/backoffice/billing/charges', 'charges-page'],
  ['rules', '/backoffice/billing/rules', 'which-rule-wins'],
  ['exemptions', '/backoffice/billing/exemptions', 'exemptions-list'],
  ['runs', '/backoffice/billing/runs', 'billing-calendar'],
  ['new-run', '/backoffice/billing/runs/new', 'new-run-checks'],
  ['invoices', '/backoffice/fin/invoices-list', 'society-invoices'],
  ['invoice', '/backoffice/fin/invoice-workspace?record=cin_ob_0001', 'invoice-lines'],
];

async function scanAll(page: Page, testInfo: TestInfo, tag: string, list: ReadonlyArray<readonly [string, string, string]>, failures: string[]) {
  for (const [label, path, ready] of list) {
    await open(page, path, ready);
    const { violations } = await scanA11y(page, testInfo, `${tag}-${label}`);
    for (const v of violations) failures.push(`${label}: ${v.id} (${v.nodes}) ${v.targets.join(' | ')}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) failures.push(`${label}: horizontal overflow ${overflow}px`);
  }
}

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  for (const vp of ['desktop', 'phone'] as const) {
    test(`axe and reflow: every C.1 screen (${locale}, ${vp})`, async ({ page }, testInfo) => {
      test.setTimeout(240_000);
      await page.setViewportSize(VIEWPORTS[vp]);
      await seedReady(page, { persona: 'alnoor_manager', locale });
      const failures: string[] = [];
      await scanAll(page, testInfo, `${locale}-${vp}`, SCREENS, failures);
      expect(failures).toEqual([]);
    });

    test(`axe: run workspace, overlays and the import review (${locale}, ${vp})`, async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      await page.setViewportSize(VIEWPORTS[vp]);
      await seedReady(page, { persona: 'alnoor_manager', locale });
      await page.goto(`${BO}/backoffice`);
      const failures: string[] = [];
      const runId = await novemberRun(page, 'submitted');
      await scanAll(page, testInfo, `${locale}-${vp}`, [
        ['run', `/backoffice/billing/runs/${runId}`, 'run-checks'],
        ['run-items', `/backoffice/billing/runs/${runId}?tab=items`, vp === 'phone' ? 'run-items-cards' : 'run-items-table'],
        ['run-exceptions', `/backoffice/billing/runs/${runId}?tab=exceptions`, 'exceptions-shared'],
        ['run-approval', `/backoffice/billing/runs/${runId}?tab=approval`, 'approval-history'],
      ], failures);
      // Overlays: the per-flat "why" drawer, the payer drawer, the rule drawer and the credit note.
      await open(page, `/backoffice/billing/runs/${runId}?tab=items`, vp === 'phone' ? 'run-items-cards' : 'run-items-table');
      await page.locator(vp === 'phone' ? '[data-testid="run-item-card"] button' : '[data-testid="run-item-why"]').first().click();
      await expect(page.getByTestId('run-item-drawer')).toBeVisible();
      for (const v of (await scanA11y(page, testInfo, `${locale}-${vp}-item-drawer`)).violations) failures.push(`item-drawer: ${v.id} ${v.targets.join(' | ')}`);
      await open(page, `${SITE}/units/unt_anr_b204?drawer=change-payer`, 'change-payer-drawer');
      for (const v of (await scanA11y(page, testInfo, `${locale}-${vp}-payer-drawer`)).violations) failures.push(`payer-drawer: ${v.id} ${v.targets.join(' | ')}`);
      await open(page, '/backoffice/billing/rules', 'rules-page');
      await page.getByTestId('rules-add').click();
      await expect(page.getByTestId('rule-drawer')).toBeVisible();
      for (const v of (await scanA11y(page, testInfo, `${locale}-${vp}-rule-drawer`)).violations) failures.push(`rule-drawer: ${v.id} ${v.targets.join(' | ')}`);
      await as(page, 'alnoor_treasurer');
      await open(page, '/backoffice/billing/invoices/cin_ob_0001?drawer=credit-note', 'credit-note-drawer');
      for (const v of (await scanA11y(page, testInfo, `${locale}-${vp}-credit-drawer`)).violations) failures.push(`credit-drawer: ${v.id} ${v.targets.join(' | ')}`);
      await as(page, 'alnoor_manager');
      await page.goto(`${BO}/backoffice`);
      await api(page, '/society/demo', 'POST', { mode: 'fresh' });
      await open(page, `${SITE}/import`, 'import-page');
      await page.getByTestId('import-sample').click();
      await expect(page.getByTestId('import-review')).toBeVisible();
      for (const v of (await scanA11y(page, testInfo, `${locale}-${vp}-import-review`)).violations) failures.push(`import-review: ${v.id} ${v.targets.join(' | ')}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 0) failures.push(`import-review: horizontal overflow ${overflow}px`);
      expect(failures).toEqual([]);
    });
  }
}
