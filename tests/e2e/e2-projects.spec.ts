import type { Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { focusWalk, layoutProblems } from '../support/layout';
import { societyApi as api } from '../support/society';

/**
 * Gate E.2 (projects and inventory, provisional) through the office app with Larkspur's fictional
 * people: Nadia Rahman (manager, all projects), Bilal Ahmed (sales, Larkspur Heights only), Farah
 * Javed (finance, no inventory), and the two provisional E.2 personas: Hina Baig (projects and
 * inventory officer: prepares projects, allocates storage) and Kashan Lodhi (projects director:
 * approves a project someone else prepared). Crescent Bay's manager shows the per-site licence. The
 * rules are the server's (inventory.api.test.ts, inventory.vectors.json); these tests check that the
 * screens carry them.
 */
const OFFICE_HEADER = '[data-testid="app-header"]';
const OFFICE_BAR = '[data-testid="bottom-nav"]';
const PRINCIPAL: Record<string, string> = { manager: 'usr_lsp_0001', sales: 'usr_lsp_0002', lk_project_officer: 'usr_lsp_0004', lk_projects_director: 'usr_lsp_0005' };
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');

async function start(page: Page, persona: PersonaId = 'manager', locale: Locale = 'en-PK', scale?: number) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, { persona, locale });
  if (scale) await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: `pref:display:v1:backoffice:tnt_larkspur:${PRINCIPAL[persona] ?? ''}`, scale });
}

/** Become another Larkspur person in this tab (the demo session of the office app). */
async function become(page: Page, persona: PersonaId) {
  await page.evaluate((persona) => {
    localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
    localStorage.setItem(
      `onboarding:v1:tnt_larkspur:${persona}:backoffice`,
      JSON.stringify({ profile: { tenantId: 'tnt_larkspur', personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} }),
    );
  }, persona);
}

async function open(page: Page, path: string, ready: string) {
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function pick(page: Page, testId: string, option: string | RegExp) {
  await page.getByTestId(testId).locator('button').first().click();
  await page.getByRole('option', { name: option }).first().click();
}

async function searchPick(page: Page, testId: string, text: string) {
  await page.getByTestId(testId).locator('input').fill(text);
  await page.getByRole('option').first().click();
}

test.describe('PRJ-001 / PRJ-002: projects and Project 360', () => {
  test('the manager filters, sorts and searches projects; KPIs open the units behind them; Project 360 tabs say what is live and what is planned', async ({ page, consoleErrors }) => {
    await start(page);
    await open(page, '/backoffice/prj/projects-list', 'project-card');
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    const heights = page.locator('[data-testid="project-card"][data-project="prj_heights"]');
    await expect(heights.getByTestId('project-buckets').locator('[data-bucket="available"]')).toHaveAttribute('data-count', '167');
    await expect(page.getByTestId('prj-kpi-units')).toContainText('496');
    await page.getByTestId('projects-filter-plots').click();
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await expect(page.getByTestId('project-card')).toHaveAttribute('data-project', 'prj_gardens');
    await page.getByTestId('projects-filter-all').click();
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    await page.getByTestId('projects-search').fill('Lahore');
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await page.getByTestId('projects-search').fill('');
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    await page.getByTestId('prj-kpi-available').click();
    await expect(page).toHaveURL(/\/backoffice\/inv\/unit-matrix\?bucket=available/);
    await expect(page.getByTestId('matrix-matched')).toHaveAttribute('data-matched', '167');

    await open(page, '/backoffice/prj/projects-list', 'project-card');
    await heights.getByTestId('project-open-360').click();
    await expect(page.getByTestId('project-360')).toHaveAttribute('data-project', 'prj_heights');
    await expect(page.getByTestId('p360-overview')).toBeVisible();
    await expect(page.getByTestId('p360-group')).toHaveCount(3);
    await expect(page.getByTestId('seed-note')).toContainText('demo seed');
    await page.getByRole('tab', { name: 'Bookings' }).click();
    await expect(page.getByTestId('p360-tab-outcome')).toHaveAttribute('data-state', 'planned');
    await expect(page.getByTestId('p360-tab-outcome')).toContainText('E.5');
    await page.getByRole('tab', { name: 'Leads' }).click();
    await expect(page.getByTestId('p360-lead').first()).toBeVisible();
    await page.goto(`${BO}/backoffice/prj/project-360-workspace?record=prj_heights&tab=documents`);
    await expect(page.getByTestId('p360-documents')).toContainText('E.13');
    await page.goto(`${BO}/backoffice/prj/project-360-workspace?record=prj_heights&tab=maintenance`);
    await expect(page.getByTestId('p360-tab-outcome')).toHaveAttribute('data-state', /planned|not_in_plan/);
    expect(consoleErrors).toEqual([]);
  });

  test('a Heights-only salesperson never sees Larkspur Gardens: list, totals, 360, matrix, storage', async ({ page, consoleErrors }) => {
    await start(page, 'sales');
    await open(page, '/backoffice/prj/projects-list', 'project-card');
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await expect(page.getByTestId('projects-list')).not.toContainText('Gardens');
    await expect(page.getByTestId('prj-kpi-units')).toContainText('336');
    await page.goto(`${BO}/backoffice/prj/project-360-workspace?record=prj_gardens`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'out_of_scope');
    await open(page, '/backoffice/inv/unit-matrix', 'matrix-grid');
    await expect(page.getByTestId('matrix-project')).toHaveCount(0);
    await expect(page.getByTestId('unit-matrix')).toHaveAttribute('data-project', 'prj_heights');
    await page.goto(`${BO}/backoffice/inv/unit-matrix?project=prj_gardens`);
    await expect(page.getByTestId('state-not-found')).toBeVisible();
    await open(page, '/backoffice/inv/storage-inventory', 'storage-card');
    await expect(page.getByTestId('storage-inventory')).not.toContainText('LG-ST');
    await open(page, '/backoffice/inv/live-availability', 'availability-project');
    await expect(page.getByTestId('availability-project')).toHaveCount(1);
    // The API answers a hidden unit exactly like an unknown one.
    const hidden = await api(page, '/inventory/units/unt_lg_p1_001');
    const unknown = await api(page, '/inventory/units/unt_nope');
    expect(hidden).toEqual(unknown);
    expect(hidden).toMatchObject({ ok: false, status: 404 });
    expect(consoleErrors).toEqual([]);
  });

  test('revoked access hides at once: narrowing the manager to Larkspur Heights removes Gardens from every list', async ({ page, consoleErrors }) => {
    await start(page);
    await open(page, '/backoffice/prj/projects-list', 'project-card');
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    await page.evaluate(() => sessionStorage.setItem('demo:site-scope', JSON.stringify({ manager: ['site_lk_heights'] })));
    await open(page, '/backoffice/prj/projects-list', 'project-card');
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    await expect(page.getByTestId('projects-list')).not.toContainText('Gardens');
    await open(page, '/backoffice/inv/storage-inventory', 'storage-card');
    await expect(page.getByTestId('storage-inventory')).not.toContainText('LG-ST');
    expect(await api(page, '/projects/prj_gardens')).toMatchObject({ ok: false, status: 404 });
    expect(consoleErrors).toEqual([]);
  });

  test('without the area permission the screens say so; finance never reaches inventory data', async ({ page, consoleErrors }) => {
    await start(page, 'finance');
    await page.goto(`${BO}/backoffice/prj/projects-list`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
    await page.goto(`${BO}/backoffice/inv/unit-matrix`);
    await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
    expect(await api(page, '/inventory/matrix')).toMatchObject({ ok: false, code: 'permission_missing' });
    expect(consoleErrors).toEqual([]);
  });

  test('Crescent Bay: Plaza figures are not in the plan (never zero); the matrix shows Towers only', async ({ page, consoleErrors }) => {
    await start(page, 'cb_manager');
    await open(page, '/backoffice/prj/projects-list', 'project-card');
    const plaza = page.locator('[data-testid="project-card"][data-project="prj_cb_plaza"]');
    await expect(plaza.getByTestId('project-units-withheld')).toHaveAttribute('data-reason', 'not_in_plan');
    await open(page, '/backoffice/inv/unit-matrix', 'matrix-grid');
    await expect(page.getByTestId('unit-matrix')).toHaveAttribute('data-project', 'prj_cb_towers');
    await expect(page.getByTestId('matrix-project')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('INV-001 / INV-002: unit matrix, keyboard grid, list alternative and quick view', () => {
  test('arrow keys move through the grid, Enter opens the quick view with three status dimensions; the list shows the same units', async ({ page, consoleErrors }) => {
    await start(page);
    await open(page, '/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_a', 'matrix-grid');
    await expect(page.getByTestId('matrix-group')).toHaveCount(1);
    const grid = page.getByTestId('matrix-grid');
    const first = grid.locator('[tabindex="0"]');
    await expect(first).toHaveCount(1);
    await first.focus();
    const startRef = await first.getAttribute('data-ref');
    await page.keyboard.press('ArrowRight');
    const next = await page.evaluate(() => document.activeElement?.getAttribute('data-ref'));
    expect(next).not.toBe(startRef);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    const end = await page.evaluate(() => document.activeElement?.getAttribute('data-pos'));
    expect(end).toMatch(/-7$/);
    await page.keyboard.press('Home');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-pos'))).toMatch(/-0$/);
    const ref = await page.evaluate(() => document.activeElement?.getAttribute('data-ref'));
    await page.keyboard.press('Enter');
    const drawer = page.getByTestId('inv-quick-view');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText(ref!);
    await expect(drawer.getByTestId('inv-dim-inventory')).toBeVisible();
    await expect(drawer.getByTestId('inv-dim-delivery')).toBeVisible();
    await expect(drawer.getByTestId('inv-dim-occupancy')).toBeVisible();
    await expect(page).toHaveURL(/unit=unt_lh_a_/);
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);

    // Filters live in the address; the list is the same units with the same drawer.
    await page.getByTestId('matrix-bucket-booked').click();
    await expect(page).toHaveURL(/bucket=booked/);
    const matched = Number(await page.getByTestId('matrix-matched').getAttribute('data-matched'));
    await page.getByTestId('matrix-view-list').click();
    await expect(page.getByTestId('matrix-row')).toHaveCount(Math.min(matched, 60));
    await page.getByTestId('matrix-row-open').first().click();
    await expect(page.getByTestId('inv-unit')).toHaveAttribute('data-bucket', 'booked');
    expect(consoleErrors).toEqual([]);
  });

  test('the dashboard tower row and the register address of the quick view open the right place', async ({ page, consoleErrors }) => {
    await start(page);
    await open(page, '/backoffice/inv/unit-matrix?record=twr_lh_b', 'matrix-grid');
    await expect(page.getByTestId('matrix-group')).toHaveCount(1);
    await expect(page.getByTestId('matrix-group')).toHaveAttribute('data-group', 'twr_lh_b');
    await page.goto(`${BO}/backoffice/inv/unit-quick-view?record=unt_lg_p2_010`);
    await expect(page.getByTestId('inv-quick-view')).toBeVisible();
    await expect(page.getByTestId('unit-matrix')).toHaveAttribute('data-project', 'prj_gardens');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('INV-008: holds, owner-only release and expiry against the demo clock', () => {
  test('Bilal holds a unit; it shows held everywhere at once; Nadia cannot release it; after 48 hours it is available again and the hold is history', async ({ page, consoleErrors }) => {
    const t0 = new Date('2026-11-08T10:00:00+05:00');
    await page.clock.setFixedTime(t0);
    await start(page, 'sales');
    await open(page, '/backoffice/inv/unit-matrix?project=prj_heights&bucket=available&view=list', 'matrix-row');
    const unitId = await page.getByTestId('matrix-row').first().getAttribute('data-unit');
    await page.getByTestId('matrix-row-open').first().click();
    const drawer = page.getByTestId('inv-quick-view');
    await expect(drawer.getByTestId('inv-hold-form')).toBeVisible();
    await searchPick(page, 'inv-hold-lead', 'LD');
    await drawer.getByTestId('inv-hold').click();
    await expect(page.getByTestId('toast-success')).toContainText('is held for');
    await expect(drawer.getByTestId('inv-hold')).toHaveCount(0);
    await expect(drawer.getByTestId('inv-unit')).toHaveAttribute('data-bucket', 'held');
    await expect(drawer.getByTestId('inv-release')).toBeVisible();
    await page.keyboard.press('Escape');

    await open(page, '/backoffice/inv/live-availability', 'availability-hold');
    await expect(page.locator(`[data-testid="availability-hold"][data-unit="${unitId}"]`)).toHaveAttribute('data-mine', 'true');
    await expect(page.getByTestId('availability-hold').first()).toContainText('47 h 59 min left');

    // Another person sees the hold but cannot release it (the server refuses the same way).
    await become(page, 'manager');
    await open(page, `/backoffice/inv/live-availability?unit=${unitId}`, 'inv-unit');
    await expect(page.getByTestId('inv-hold')).toBeVisible();
    await expect(page.getByTestId('inv-release')).toHaveCount(0);
    expect(await api(page, `/inventory/units/${unitId}/release`, 'POST')).toMatchObject({ ok: false, status: 404 });
    await page.keyboard.press('Escape');

    // 48 hours later: no longer held, available again, the hold kept as history.
    await page.clock.setFixedTime(new Date(t0.getTime() + 48 * 3_600_000 + 60_000));
    await page.getByTestId('availability-refresh').click();
    await expect(page.locator(`[data-testid="availability-hold"][data-unit="${unitId}"]`)).toHaveCount(0);
    await expect(page.getByTestId('availability-lapsed').locator(`[data-unit="${unitId}"]`)).toBeVisible();
    await open(page, `/backoffice/inv/unit-matrix?project=prj_heights&unit=${unitId}`, 'inv-unit');
    await expect(page.getByTestId('inv-unit')).toHaveAttribute('data-bucket', 'available');
    await expect(page.getByTestId('inv-unit-history')).toContainText('held');
    expect(consoleErrors).toEqual([]);
  });

  test('pressing Hold twice creates one hold (one key per logical create)', async ({ page, consoleErrors }) => {
    await start(page, 'sales');
    await open(page, '/backoffice/inv/unit-matrix?project=prj_heights&bucket=available&view=list', 'matrix-row');
    const unitId = await page.getByTestId('matrix-row').nth(2).getAttribute('data-unit');
    await page.getByTestId('matrix-row-open').nth(2).click();
    await searchPick(page, 'inv-hold-lead', 'LD');
    await page.getByTestId('inv-hold').dblclick();
    await expect(page.getByTestId('inv-release')).toBeVisible();
    const detail = await api<{ history: Array<{ kind: string }> }>(page, `/inventory/units/${unitId}`);
    expect(detail.ok && detail.res.history.filter((e) => e.kind === 'unit_held')).toHaveLength(1);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('INV-010: storage allocation and release', () => {
  test('Hina allocates a locker to a booked Heights unit and releases it with a reason; the history keeps both; nobody else gets the buttons', async ({ page, consoleErrors }) => {
    await start(page, 'lk_project_officer');
    await open(page, '/backoffice/inv/storage-inventory?project=prj_heights', 'storage-card');
    const card = page.locator('[data-testid="storage-card"][data-storage="stg_lh_a01"]');
    await card.getByTestId('storage-allocate').click();
    const drawer = page.getByTestId('storage-allocate-drawer');
    await expect(drawer).toBeVisible();
    await searchPick(page, 'storage-target', 'LH');
    await drawer.getByTestId('storage-note').fill('Requested at booking (demo)');
    await drawer.getByTestId('storage-allocate-confirm').click();
    await expect(page.getByTestId('toast-success')).toContainText('is allocated to');
    await expect(card).toHaveAttribute('data-state', 'allocated');
    await expect(card.getByTestId('storage-allocation')).toContainText('Hina Baig');
    // Not twice: the server refuses a second allocation of the same locker.
    expect(await api(page, '/inventory/storage/stg_lh_a01/allocate', 'POST', { unitId: 'unt_lh_a_0101' })).toMatchObject({ ok: false, code: 'storage_unavailable' });
    // Never to another project's unit.
    const gardensSold = await api<Array<{ unitId: string }>>(page, '/inventory/storage/stg_lg_p1_01/targets');
    expect(gardensSold.ok).toBe(true);
    if (gardensSold.ok) expect(await api(page, '/inventory/storage/stg_lh_a02/allocate', 'POST', { unitId: gardensSold.res[0]!.unitId })).toMatchObject({ ok: false, code: 'cross_project_forbidden' });

    await card.getByTestId('storage-release').click();
    const dialog = page.getByRole('alertdialog');
    await dialog.locator('textarea').fill('Buyer chose another locker (demo)');
    await dialog.getByRole('button', { name: 'Release' }).click();
    await expect(page.getByTestId('toast-success')).toContainText('was released');
    await expect(card).toHaveAttribute('data-state', 'available');
    await card.getByTestId('storage-history-toggle').click();
    await expect(card.getByTestId('storage-history').locator('li')).toHaveCount(2);

    await become(page, 'manager');
    await open(page, '/backoffice/inv/storage-inventory?project=prj_heights', 'storage-card');
    await expect(page.getByTestId('storage-allocate')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('PRJ-003: project setup with maker ≠ checker', () => {
  test('Hina prepares and submits; she cannot approve her own; Kashan activates; the project appears in the list; invalid input is refused first', async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    await start(page, 'lk_project_officer');
    await open(page, '/backoffice/prj/project-setup', 'project-setup');
    await page.getByTestId('setup-new').click();
    // Invalid input: the browser refuses before sending anything.
    await page.getByTestId('setup-name').fill('X');
    await page.getByTestId('setup-code').fill('TOOLONG');
    await page.getByTestId('setup-save').click();
    await expect(page.getByTestId('setup-name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('setup-code')).toHaveAttribute('aria-invalid', 'true');
    // A code already used by a project is refused by the server.
    await page.getByTestId('setup-name').fill('Larkspur Courtyard (Demo)');
    await page.getByTestId('setup-code').fill('LH');
    await page.getByTestId('setup-city').fill('Lahore');
    await page.getByTestId('setup-save').click();
    await expect(page.getByTestId('problem-fields')).toContainText('already used');
    expect(await api<{ items: unknown[] }>(page, '/projects/setup')).toMatchObject({ ok: true, res: { items: [] } });
    await page.getByTestId('setup-code').fill('LC');
    await page.getByTestId('setup-save').click();
    await expect(page.getByTestId('project-setup')).toHaveAttribute('data-step', 'site');
    await pick(page, 'setup-site', /Larkspur Heights/);
    await expect(page.getByTestId('setup-entity')).toContainText('Larkspur Estates');
    await page.getByTestId('setup-save').click();
    await expect(page.getByTestId('project-setup')).toHaveAttribute('data-step', 'structure');
    await page.getByTestId('setup-towers-0-floors').fill('12');
    await page.getByTestId('setup-towers-0-unitsPerFloor').fill('6');
    await page.getByTestId('setup-add-row').click();
    await page.getByTestId('setup-towers-1-floors').fill('10');
    await page.getByTestId('setup-towers-1-unitsPerFloor').fill('6');
    await expect(page.getByTestId('setup-planned-total')).toHaveAttribute('data-total', '132');
    await page.getByTestId('setup-save').click();
    await expect(page.getByTestId('project-setup')).toHaveAttribute('data-step', 'review');
    await page.getByTestId('setup-submit').click();
    await expect(page.getByTestId('project-setup')).toHaveAttribute('data-state', 'submitted');
    await expect(page.getByTestId('setup-activate')).toHaveCount(0);
    await expect(page.getByTestId('setup-waiting')).toBeVisible();
    const id = await page.getByTestId('project-setup').getAttribute('data-setup');

    await become(page, 'lk_projects_director');
    await open(page, '/backoffice/prj/project-setup', 'setup-row');
    await page.locator(`[data-testid="setup-row"][data-setup="${id}"]`).getByTestId('setup-open').click();
    await page.getByTestId('setup-activate').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Approve and activate' }).click();
    await expect(page.getByTestId('project-setup')).toHaveAttribute('data-state', 'active');
    await expect(page.getByTestId('setup-active')).toContainText('Kashan Lodhi');

    await become(page, 'manager');
    await open(page, '/backoffice/prj/projects-list', 'project-card');
    await expect(page.locator(`[data-testid="project-card"][data-project="${id}"]`)).toContainText('Larkspur Courtyard (Demo)');
    // The manager holds no setup permission: the setup page says so, and shows no draft.
    await open(page, '/backoffice/prj/project-setup', 'setup-no-access');
    expect(consoleErrors).toEqual([]);
  });
});

// Both languages, phones, 320 px at 200 % text (the matrix becomes a list), dark mode, the keyboard.
const SCREENS: Array<[string, string, string]> = [
  ['projects', '/backoffice/prj/projects-list', 'project-card'],
  ['project-360', '/backoffice/prj/project-360-workspace?record=prj_heights', 'p360-overview'],
  ['matrix', '/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c', 'unit-matrix'],
  ['availability', '/backoffice/inv/live-availability', 'availability-project'],
  ['storage', '/backoffice/inv/storage-inventory', 'storage-card'],
];

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`axe at 1440 and 390 (${lang(locale)}): every E.2 screen and the quick view, no violations, nothing clipped`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(180_000);
    await start(page, 'manager', locale);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      for (const [name, path, ready] of SCREENS) {
        await open(page, path, ready);
        await axe(page, testInfo, `${name}-${width}-${locale}`);
        expect(await layoutProblems(page), `${name} ${width} ${lang(locale)}`).toEqual([]);
        expect(await overflowOf(page), `${name} ${width}`).toBeLessThanOrEqual(1);
      }
      await open(page, '/backoffice/inv/unit-matrix?project=prj_heights&unit=unt_lh_a_0101', 'inv-unit');
      await axe(page, testInfo, `quick-view-${width}-${locale}`);
      expect(await layoutProblems(page.getByTestId('inv-quick-view')), `quick view ${width} ${lang(locale)}`).toEqual([]);
    }
    await become(page, 'lk_project_officer');
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, '/backoffice/prj/project-setup?new=1', 'setup-name');
    await axe(page, testInfo, `setup-1440-${locale}`);
    expect(consoleErrors).toEqual([]);
  });

  test(`320 px at 200 % text (${lang(locale)}): lists instead of grids and tables, no sideways scroll, nothing clipped`, async ({ page, consoleErrors }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 320, height: 700 });
    await start(page, 'manager', locale, 2);
    for (const [name, path, ready] of SCREENS) {
      await open(page, path, ready);
      if (name === 'matrix') {
        await expect(page.getByTestId('unit-matrix')).toHaveAttribute('data-view', 'list');
        await expect(page.getByTestId('matrix-grid')).toHaveCount(0);
        await expect(page.getByTestId('matrix-view')).toHaveCount(0);
      }
      expect(await overflowOf(page), `${name} 320 ${lang(locale)}`).toBeLessThanOrEqual(1);
      expect(await layoutProblems(page), `${name} 320 200 % ${lang(locale)}`).toEqual([]);
    }
    await open(page, '/backoffice/inv/unit-matrix?project=prj_heights&unit=unt_lh_a_0101', 'inv-unit');
    expect(await layoutProblems(page.getByTestId('inv-quick-view')), `quick view 320 ${lang(locale)}`).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
}

test('dark mode with high contrast (390 px, Urdu): the E.2 screens pass axe with nothing clipped', async ({ page, consoleErrors }, testInfo) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, 'manager', 'ur-PK');
  await open(page, '/backoffice/global/accessibility-preferences', 'hub-theme');
  await page.getByTestId('hub-theme-dark').click();
  await page.getByTestId('hub-contrast-high').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
  for (const [name, path, ready] of SCREENS) {
    await open(page, path, ready);
    await axe(page, testInfo, `${name}-390-dark-contrast-ur`);
    expect(await layoutProblems(page), `${name} dark`).toEqual([]);
  }
  expect(consoleErrors).toEqual([]);
});

test('keyboard on a phone: every control of the matrix and storage is reachable and never hidden under the header or the bottom bar', async ({ page, consoleErrors }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, 'lk_project_officer');
  for (const [path, ready] of [
    ['/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c', 'matrix-row'],
    ['/backoffice/inv/storage-inventory?project=prj_heights', 'storage-card'],
  ] as const) {
    await open(page, path, ready);
    const stops = await focusWalk(page, { header: OFFICE_HEADER, bar: OFFICE_BAR, max: 60 });
    expect(stops.length, path).toBeGreaterThan(5);
    expect(stops.filter((s) => s.issue), path).toEqual([]);
  }
  expect(consoleErrors).toEqual([]);
});
