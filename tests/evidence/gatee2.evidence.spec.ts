import { mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { BO, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { societyApi } from '../support/society';

/**
 * Gate E.2 evidence (projects and inventory, provisional): the projects list, Project 360 with a live
 * and a planned tab, the unit matrix grid and its list, the quick view with a hold, live availability,
 * storage with an allocation, project setup by the maker and the checker's view; who sees what
 * (Bilal, Heights only); phones in both languages, 320 px with 200 % text; dark mode with high
 * contrast → docs/status/gate-e2/screenshots. Run against production builds:
 * `E2E_PORT_OFFSET=2200 npx playwright test --project=evidence tests/evidence/gatee2.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-e2/screenshots';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const PRINCIPAL: Record<string, string> = { manager: 'usr_lsp_0001', sales: 'usr_lsp_0002', lk_project_officer: 'usr_lsp_0004', lk_projects_director: 'usr_lsp_0005' };

async function settle(page: Page, ms = 600) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function shot(page: Page, name: string, full = true) {
  await settle(page);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full });
}

async function context(browser: Browser, viewport: { width: number; height: number }, persona: PersonaId, locale: Locale = 'en-PK', scale?: number) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-11-08T10:00:00+05:00'));
  await seed(page, { persona, locale });
  if (scale) for (const p of Object.values(PRINCIPAL)) await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: `pref:display:v1:backoffice:tnt_larkspur:${p}`, scale });
  return page;
}

async function become(page: Page, persona: PersonaId) {
  await page.evaluate((persona) => {
    localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
    localStorage.setItem(`onboarding:v1:tnt_larkspur:${persona}:backoffice`, JSON.stringify({ profile: { tenantId: 'tnt_larkspur', personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} }));
  }, persona);
}

async function go(page: Page, path: string, ready: string) {
  await page.goto(`${BO}${path}`);
  await page.getByTestId(ready).first().waitFor();
}

/** Fictional activity so the screens show a hold, an allocation and a submitted project. Returns the setup id and the held unit. */
async function stage(page: Page): Promise<{ setupId: string; unit: string }> {
  await go(page, '/backoffice/inv/unit-matrix?project=prj_heights', 'unit-matrix');
  await become(page, 'sales');
  await go(page, '/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c', 'unit-matrix');
  const m = await societyApi<{ groups: Array<{ floors: Array<{ cells: Array<{ id: string; match: boolean }> }> }> }>(page, '/inventory/matrix', 'GET', {}, { project: 'prj_heights', tower: 'twr_lh_c', bucket: 'available' });
  const unit = m.ok ? m.res.groups[0]!.floors.flatMap((f) => f.cells).find((c) => c.match)!.id : '';
  const leads = await societyApi<Array<{ id: string }>>(page, `/inventory/units/${unit}/hold-leads`);
  if (leads.ok && leads.res[0]) await societyApi(page, `/inventory/units/${unit}/hold`, 'POST', { leadId: leads.res[0].id });
  await become(page, 'lk_project_officer');
  await go(page, '/backoffice/inv/storage-inventory?project=prj_heights', 'storage-card');
  const targets = await societyApi<Array<{ unitId: string }>>(page, '/inventory/storage/stg_lh_a01/targets');
  if (targets.ok) await societyApi(page, '/inventory/storage/stg_lh_a01/allocate', 'POST', { unitId: targets.res[0]!.unitId, note: 'Requested at booking (demo)' });
  const draft = await societyApi<{ id: string }>(page, '/projects', 'POST', { basics: { name: 'Larkspur Courtyard (Demo)', code: 'LC', city: 'Lahore', kind: 'towers' } });
  if (draft.ok) {
    await societyApi(page, `/projects/${draft.res.id}/setup/site`, 'POST', { value: { siteId: 'site_lk_heights' } });
    await societyApi(page, `/projects/${draft.res.id}/setup/structure`, 'POST', { value: { towers: [{ name: 'A', floors: 12, unitsPerFloor: 6 }, { name: 'B', floors: 10, unitsPerFloor: 6 }] } });
    await societyApi(page, `/projects/${draft.res.id}/submit`, 'POST');
  }
  return { setupId: draft.ok ? draft.res.id : '', unit };
}

for (const locale of ['en-PK', 'ur-PK'] as const) {
  const l = lang(locale);
  test(`desktop 1440 (${l}): projects, Project 360, matrix, quick view, availability, storage, setup`, async ({ browser }) => {
    test.setTimeout(300_000);
    mkdirSync(DIR, { recursive: true });
    const page = await context(browser, { width: 1440, height: 900 }, 'manager', locale);
    const { setupId, unit } = await stage(page);
    await become(page, 'manager');
    await go(page, '/backoffice/prj/projects-list', 'project-card');
    await shot(page, `e2-01-projects-1440-${l}`);
    await go(page, '/backoffice/prj/project-360-workspace?record=prj_heights', 'p360-overview');
    await shot(page, `e2-02-project360-overview-1440-${l}`);
    await go(page, '/backoffice/prj/project-360-workspace?record=prj_heights&tab=bookings', 'p360-tab-outcome');
    await shot(page, `e2-03-project360-planned-tab-1440-${l}`, false);
    await go(page, '/backoffice/prj/project-360-workspace?record=prj_heights&tab=activity', 'p360-activity');
    await shot(page, `e2-04-project360-activity-1440-${l}`, false);
    await go(page, '/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c', 'matrix-grid');
    await shot(page, `e2-05-matrix-grid-1440-${l}`);
    await go(page, '/backoffice/inv/unit-matrix?project=prj_gardens&block=blk_lg_p1', 'matrix-grid');
    await shot(page, `e2-06-matrix-plots-1440-${l}`, false);
    await go(page, '/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c&view=list&bucket=held', 'matrix-list');
    await shot(page, `e2-07-matrix-list-held-1440-${l}`, false);
    await go(page, `/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c&unit=${unit}`, 'inv-unit');
    await shot(page, `e2-08-quick-view-held-1440-${l}`, false);
    await go(page, '/backoffice/inv/live-availability', 'availability-hold');
    await shot(page, `e2-09-availability-1440-${l}`);
    await go(page, '/backoffice/inv/storage-inventory?project=prj_heights', 'storage-allocation');
    await shot(page, `e2-10-storage-1440-${l}`);
    await become(page, 'lk_project_officer');
    await go(page, `/backoffice/prj/project-setup?record=${setupId}`, 'setup-review');
    await shot(page, `e2-11-setup-submitted-maker-1440-${l}`);
    await go(page, '/backoffice/prj/project-setup?new=1', 'setup-name');
    await shot(page, `e2-12-setup-new-1440-${l}`, false);
    await become(page, 'lk_projects_director');
    await go(page, `/backoffice/prj/project-setup?record=${setupId}`, 'setup-activate');
    await shot(page, `e2-13-setup-checker-1440-${l}`);
    await page.close();
  });

  test(`phone 390 and 320 px at 200 % (${l}): lists instead of grids`, async ({ browser }) => {
    test.setTimeout(300_000);
    mkdirSync(DIR, { recursive: true });
    const phone = await context(browser, { width: 390, height: 844 }, 'manager', locale);
    const { unit } = await stage(phone);
    await become(phone, 'manager');
    await go(phone, '/backoffice/prj/projects-list', 'project-card');
    await shot(phone, `e2-20-projects-390-${l}`);
    await go(phone, '/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c', 'matrix-row');
    await shot(phone, `e2-21-matrix-list-390-${l}`, false);
    await go(phone, `/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c&unit=${unit}`, 'inv-unit');
    await shot(phone, `e2-22-quick-view-390-${l}`, false);
    await phone.close();

    const small = await context(browser, { width: 320, height: 700 }, 'manager', locale, 2);
    const staged = await stage(small);
    await become(small, 'manager');
    for (const [name, path, ready] of [
      ['projects', '/backoffice/prj/projects-list', 'project-card'],
      ['project360', '/backoffice/prj/project-360-workspace?record=prj_heights', 'p360-overview'],
      ['matrix', '/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c', 'matrix-row'],
      ['availability', '/backoffice/inv/live-availability', 'availability-hold'],
      ['storage', '/backoffice/inv/storage-inventory?project=prj_heights', 'storage-card'],
    ] as const) {
      await go(small, path, ready);
      await shot(small, `e2-3x-${name}-200pct-320-${l}`, false);
    }
    await go(small, `/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c&unit=${staged.unit}`, 'inv-unit');
    await shot(small, `e2-36-quick-view-200pct-320-${l}`, false);
    await small.close();
  });
}

test('who sees what: Bilal (Heights only) sees no Gardens; a hidden project is "not found"', async ({ browser }) => {
  test.setTimeout(120_000);
  mkdirSync(DIR, { recursive: true });
  const page = await context(browser, { width: 1440, height: 900 }, 'sales');
  await go(page, '/backoffice/prj/projects-list', 'project-card');
  await shot(page, 'e2-40-projects-heights-only-1440-en');
  await page.goto(`${BO}/backoffice/prj/project-360-workspace?record=prj_gardens`);
  await page.getByTestId('access-outcome').waitFor();
  await shot(page, 'e2-41-gardens-not-found-heights-only-1440-en', false);
  await become(page, 'manager');
  await go(page, '/backoffice/prj/project-setup', 'setup-no-access');
  await shot(page, 'e2-42-setup-no-setup-role-1440-en', false);
  await page.close();
});

test('dark mode with high contrast (390 px, Urdu)', async ({ browser }) => {
  test.setTimeout(120_000);
  mkdirSync(DIR, { recursive: true });
  const page = await context(browser, { width: 390, height: 844 }, 'manager', 'ur-PK');
  await go(page, '/backoffice/global/accessibility-preferences', 'hub-theme');
  await page.getByTestId('hub-theme-dark').click();
  await page.getByTestId('hub-contrast-high').click();
  await go(page, '/backoffice/prj/projects-list', 'project-card');
  await shot(page, 'e2-50-projects-dark-contrast-390-ur', false);
  await go(page, '/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c', 'matrix-row');
  await shot(page, 'e2-51-matrix-dark-contrast-390-ur', false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await go(page, '/backoffice/inv/unit-matrix?project=prj_heights&tower=twr_lh_c', 'matrix-grid');
  await shot(page, 'e2-52-matrix-grid-dark-contrast-1440-ur', false);
  await page.close();
});
