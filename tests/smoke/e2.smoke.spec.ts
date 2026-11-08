import type { Page } from '@playwright/test';
import { BO, expect, seed, test, type PersonaId } from '../support/fixtures';
import { layoutProblems } from '../support/layout';
import { societyApi } from '../support/society';

/**
 * Gate E.2 cross-browser smoke (Firefox and WebKit projects): the projects list and Project 360, the
 * unit matrix grid with the quick view and a hold placed and then released by its holder, live
 * availability, storage allocated and released, a project prepared by one person and activated by
 * another; the matrix at 320 px with 200 % text in Urdu (a list). The full checks run in Chromium
 * (tests/e2e/e2-projects.spec.ts).
 */
const onboarding = (persona: string) =>
  JSON.stringify({ profile: { tenantId: 'tnt_larkspur', personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} });

async function become(page: Page, persona: PersonaId) {
  await page.evaluate(
    ({ persona, value }) => {
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
      localStorage.setItem(`onboarding:v1:tnt_larkspur:${persona}:backoffice`, value);
    },
    { persona, value: onboarding(persona) },
  );
}

async function open(page: Page, path: string, ready: string) {
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

/** Firefox's own cancelled font request (NS_BINDING_ABORTED) is the browser, not the app. */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

test('projects and Project 360; the matrix grid and quick view; a hold placed and released by its holder; availability; storage', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, { persona: 'sales' });
  await open(page, '/backoffice/prj/projects-list', 'project-card');
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await page.getByTestId('project-open-360').click();
  await expect(page.getByTestId('p360-overview')).toBeVisible();
  await open(page, '/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c&bucket=available', 'matrix-grid');
  const cell = page.locator('[data-testid="matrix-cell"][data-match="true"]').first();
  const unitId = await cell.getAttribute('data-unit');
  await cell.click();
  const drawer = page.getByTestId('inv-quick-view');
  await expect(drawer.getByTestId('inv-hold-form')).toBeVisible();
  await page.getByTestId('inv-hold-lead').locator('input').fill('LD');
  await page.getByRole('option').first().click();
  await drawer.getByTestId('inv-hold').click();
  await expect(drawer.getByTestId('inv-unit')).toHaveAttribute('data-bucket', 'held');
  await drawer.getByTestId('inv-release').click();
  await expect(drawer.getByTestId('inv-unit')).toHaveAttribute('data-bucket', 'available');
  await page.keyboard.press('Escape');
  await open(page, `/backoffice/inv/live-availability`, 'availability-project');
  await expect(page.locator(`[data-testid="availability-hold"][data-unit="${unitId}"]`)).toHaveCount(0);

  await become(page, 'lk_project_officer');
  await open(page, '/backoffice/inv/storage-inventory?project=prj_heights', 'storage-card');
  const card = page.locator('[data-testid="storage-card"][data-storage="stg_lh_c01"]');
  await card.getByTestId('storage-allocate').click();
  await page.getByTestId('storage-target').locator('input').fill('LH');
  await page.getByRole('option').first().click();
  await page.getByTestId('storage-allocate-confirm').click();
  await expect(card).toHaveAttribute('data-state', 'allocated');
  await card.getByTestId('storage-release').click();
  const dialog = page.getByRole('alertdialog');
  await dialog.locator('textarea').fill('Smoke test release (demo)');
  await dialog.getByRole('button', { name: 'Release' }).click();
  await expect(card).toHaveAttribute('data-state', 'available');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('a project prepared by one person is activated by another; nobody approves their own', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, { persona: 'lk_project_officer' });
  await open(page, '/backoffice/prj/project-setup', 'project-setup');
  const created = await societyApi<{ id: string }>(page, '/projects', 'POST', { basics: { name: 'Larkspur Meadows (Demo)', code: 'LM', city: 'Islamabad', kind: 'plots' } });
  expect(created.ok).toBe(true);
  const id = created.ok ? created.res.id : '';
  expect((await societyApi(page, `/projects/${id}/setup/site`, 'POST', { value: { siteId: 'site_lk_gardens' } })).ok).toBe(true);
  expect((await societyApi(page, `/projects/${id}/setup/structure`, 'POST', { value: { phases: [{ label: 'Phase 1', plots: 40 }] } })).ok).toBe(true);
  await open(page, `/backoffice/prj/project-setup?record=${id}`, 'setup-submit');
  await page.getByTestId('setup-submit').click();
  await expect(page.getByTestId('project-setup')).toHaveAttribute('data-state', 'submitted');
  await expect(page.getByTestId('setup-activate')).toHaveCount(0);
  await become(page, 'lk_projects_director');
  await open(page, `/backoffice/prj/project-setup?record=${id}`, 'setup-activate');
  await page.getByTestId('setup-activate').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Approve and activate' }).click();
  await expect(page.getByTestId('project-setup')).toHaveAttribute('data-state', 'active');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('320 px with 200 % text in Urdu: the matrix is a list and nothing is clipped', async ({ page, consoleErrors }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, { persona: 'manager', locale: 'ur-PK' });
  await page.addInitScript(() => localStorage.setItem('pref:display:v1:backoffice:tnt_larkspur:usr_lsp_0001', JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })));
  await open(page, '/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c', 'matrix-row');
  await expect(page.getByTestId('unit-matrix')).toHaveAttribute('data-view', 'list');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  expect(await layoutProblems(page)).toEqual([]);
  expect(appErrors(consoleErrors)).toEqual([]);
});
