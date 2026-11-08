import { mkdirSync } from 'node:fs';
import type { Browser, Page } from '@playwright/test';
import { BO, seed, test, type Locale, type PersonaId } from '../support/fixtures';

/**
 * Gate E.13 evidence (connected workspace and documents): universal search, recent records,
 * favourites, my tasks, the work queue, recent activity, the documents list, a document's preview,
 * versions and related records, the upload drawer, expiring documents and templates and policies;
 * who sees what (the Heights clerk vs the controller; a revoked scope); phones in both languages,
 * 320 px with 200 % text; dark mode → docs/status/gate-e13/screenshots. Business date: Monday
 * 26 October 2026. Run against production builds:
 * `E2E_PORT_OFFSET=2600 npx playwright test --project=evidence tests/evidence/gatee13.evidence.spec.ts`.
 */
const DIR = 'docs/status/gate-e13/screenshots';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');
const CONTROLLER = 'lsp_doc_controller' as PersonaId;
const CLERK = 'lsp_records_clerk' as PersonaId;
const PRINCIPALS = ['usr_lsp_0001', 'usr_lsp_0002', 'usr_lsp_d0001', 'usr_lsp_d0002'];

async function settle(page: Page, ms = 500) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function become(page: Page, persona: PersonaId) {
  await page.evaluate(
    ({ persona }) => {
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
      localStorage.setItem(`onboarding:v1:tnt_larkspur:${persona}:backoffice`, JSON.stringify({ profile: { tenantId: 'tnt_larkspur', personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} }));
    },
    { persona },
  );
}

async function as(page: Page, persona: PersonaId, path: string, ready: string) {
  if (!page.url().startsWith(BO)) await page.goto(`${BO}/backoffice/global/my-access`);
  await become(page, persona);
  await page.goto(`${BO}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page);
}

async function context(browser: Browser, viewport: { width: number; height: number }, locale: Locale = 'en-PK', scale?: number, persona: PersonaId = CONTROLLER) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await seed(page, { persona, locale });
  if (scale) for (const p of PRINCIPALS) await page.addInitScript(({ key, scale }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: scale, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: `pref:display:v1:backoffice:tnt_larkspur:${p}`, scale });
  return page;
}

const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage });

const SCREENS: Array<[string, string, string]> = [
  ['search', '/backoffice/global/unified-search-results?q=Larkspur', 'hub-search-results'],
  ['recent', '/backoffice/global/recent-records', 'recent-records'],
  ['favourites', '/backoffice/global/favorites', 'favourites'],
  ['tasks', '/backoffice/home/my-tasks', 'my-tasks'],
  ['queue', '/backoffice/home/work-queue', 'work-queue'],
  ['activity', '/backoffice/home/recent-activity?range=30d', 'recent-activity'],
  ['documents', '/backoffice/doc/document-preview', 'documents-finder'],
  ['document', '/backoffice/doc/document-preview?record=doc_lsp_0001', 'document-workspace'],
  ['document-related', '/backoffice/doc/document-preview?record=doc_lsp_0009&tab=related', 'related-records'],
  ['versions', '/backoffice/doc/document-versions?record=doc_lsp_0004', 'versions-workspace'],
  ['expiring', '/backoffice/doc/expiring-documents', 'expiring-documents'],
  ['templates', '/backoffice/doc/templates-and-policies', 'templates'],
  ['template', '/backoffice/doc/templates-and-policies?record=dtp_lsp_003', 'template-workspace'],
];

/** Some history for the lists: recent visits and two favourites, through the screens themselves. */
async function warm(page: Page) {
  for (const path of ['/backoffice/crm/lead-360-workspace?record=led_0004', '/backoffice/doc/document-preview?record=doc_lsp_0001', '/backoffice/doc/document-preview?record=doc_lsp_0004']) {
    await page.goto(`${BO}${path}`);
    await page.locator('main h1').first().waitFor();
    await settle(page, 300);
  }
  await page.goto(`${BO}/backoffice/doc/document-preview?record=doc_lsp_0001`);
  await page.getByTestId('document-favourite').click();
  await page.getByTestId('toast-success').last().waitFor();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => mkdirSync(DIR, { recursive: true }));

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`desktop 1440 (${lang(locale)}): every E.13 screen`, async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await context(browser, { width: 1440, height: 900 }, locale);
    await page.goto(`${BO}/backoffice/global/my-access`);
    await warm(page);
    for (const [name, path, ready] of SCREENS) {
      await as(page, CONTROLLER, path, ready);
      await shot(page, `e13-${name}-1440-${lang(locale)}`);
    }
    await as(page, CONTROLLER, '/backoffice/doc/document-preview?drawer=upload&for=led_0004', 'upload-drawer');
    await shot(page, `e13-upload-drawer-1440-${lang(locale)}`, false);
    await page.getByTestId('upload-submit').click();
    await settle(page, 300);
    await shot(page, `e13-upload-drawer-errors-1440-${lang(locale)}`, false);
    await page.context().close();
  });

  test(`phone 390 (${lang(locale)}): the workspace and documents on a phone`, async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await context(browser, { width: 390, height: 844 }, locale);
    await page.goto(`${BO}/backoffice/global/my-access`);
    await warm(page);
    for (const [name, path, ready] of SCREENS) {
      await as(page, CONTROLLER, path, ready);
      await shot(page, `e13-${name}-390-${lang(locale)}`);
    }
    await page.context().close();
  });

  test(`320 px at 200 % text (${lang(locale)})`, async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await context(browser, { width: 320, height: 700 }, locale, 2);
    await page.goto(`${BO}/backoffice/global/my-access`);
    await warm(page);
    for (const [name, path, ready] of SCREENS) {
      await as(page, CONTROLLER, path, ready);
      await shot(page, `e13-${name}-200pct-320-${lang(locale)}`);
    }
    await as(page, CONTROLLER, '/backoffice/doc/document-preview?drawer=upload', 'upload-drawer');
    await shot(page, `e13-upload-drawer-200pct-320-${lang(locale)}`, false);
    await page.context().close();
  });
}

test('who sees what: the Heights clerk vs the controller; a hidden document reads like an unknown one', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await context(browser, { width: 1440, height: 900 }, 'en-PK', undefined, CLERK);
  await as(page, CLERK, '/backoffice/doc/document-preview', 'documents-finder');
  await shot(page, 'e13-scope-clerk-documents-1440-en');
  await as(page, CLERK, '/backoffice/doc/document-preview?record=doc_lsp_0004', 'document-unavailable');
  await shot(page, 'e13-scope-clerk-hidden-document-1440-en', false);
  await as(page, CLERK, '/backoffice/doc/templates-and-policies', 'templates');
  await shot(page, 'e13-scope-clerk-templates-1440-en');
  await as(page, CONTROLLER, '/backoffice/doc/document-preview', 'documents-finder');
  await shot(page, 'e13-scope-controller-documents-1440-en');
  await as(page, 'manager', '/backoffice/doc/document-preview', 'access-outcome');
  await shot(page, 'e13-scope-manager-no-documents-1440-en', false);
  // Revocation: Tehmina's favourite on a Gardens document disappears once her scope is narrowed.
  await as(page, CONTROLLER, '/backoffice/doc/document-preview?record=doc_lsp_0004', 'document-workspace');
  await page.getByTestId('document-favourite').click();
  await page.getByTestId('toast-success').last().waitFor();
  await as(page, CONTROLLER, '/backoffice/global/favorites', 'favourites');
  await shot(page, 'e13-revoke-before-1440-en');
  await page.evaluate(() => sessionStorage.setItem('demo:site-scope', JSON.stringify({ lsp_doc_controller: ['site_lk_heights'] })));
  await as(page, CONTROLLER, '/backoffice/global/favorites', 'favourites');
  await shot(page, 'e13-revoke-after-1440-en');
  await page.context().close();
});

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test(`dark mode 390 (${lang(locale)})`, async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await context(browser, { width: 390, height: 844 }, locale);
    await as(page, CONTROLLER, '/backoffice/global/accessibility-preferences', 'hub-theme');
    await page.getByTestId('hub-theme-dark').click();
    await settle(page);
    for (const [name, path, ready] of [SCREENS[0]!, SCREENS[4]!, SCREENS[7]!, SCREENS[10]!, SCREENS[12]!]) {
      await as(page, CONTROLLER, path, ready);
      await shot(page, `e13-${name}-390-dark-${lang(locale)}`);
    }
    await page.context().close();
  });
}
