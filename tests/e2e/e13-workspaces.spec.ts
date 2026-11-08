import type { Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, expect, seed, test, type Locale, type PersonaId } from '../support/fixtures';
import { focusWalk, layoutProblems } from '../support/layout';
import { societyApi as api } from '../support/society';

/**
 * Gate E.13 connected workspace and documents through the office app, with Larkspur's fictional
 * people: Nadia Rahman (manager, all projects, no document permission), Bilal Ahmed (sales, Larkspur
 * Heights), Tehmina Durrani (document controller, all projects) and Haroon Qadri (records clerk, Larkspur
 * Heights only). The rules are the server's (workspace.api.test.ts, documents.api.test.ts); these
 * tests check that the screens carry them. Business date: Monday 26 October 2026.
 */
const CONTROLLER = 'lsp_doc_controller' as PersonaId;
const CLERK = 'lsp_records_clerk' as PersonaId;
const PRINCIPAL: Record<string, string> = { manager: 'usr_lsp_0001', sales: 'usr_lsp_0002', lsp_doc_controller: 'usr_lsp_d0001', lsp_records_clerk: 'usr_lsp_d0002' };
const OFFICE_DISPLAY = (principal: string) => `pref:display:v1:backoffice:tnt_larkspur:${principal}`;
const HEADER = '[data-testid="app-header"]';
const BAR = '[data-testid="bottom-nav"]';
const lang = (l: Locale) => (l === 'ur-PK' ? 'Urdu' : 'English');

async function start(page: Page, persona: PersonaId = 'manager', locale: Locale = 'en-PK') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await seed(page, { persona, locale });
}

/** Become another Larkspur person in this browser (the office app keeps one session). */
async function become(page: Page, persona: PersonaId) {
  await page.evaluate(
    ({ persona }) => {
      localStorage.setItem('demo:session:backoffice', JSON.stringify({ personaId: persona, projectId: 'all' }));
      localStorage.setItem(`onboarding:v1:tnt_larkspur:${persona}:backoffice`, JSON.stringify({ profile: { tenantId: 'tnt_larkspur', personaId: persona, app: 'backoffice', welcomeDecision: 'declined', autoOffer: false, seenModules: ['lab'], updatedAt: '2026-10-26T00:00:00Z' }, progress: {} }));
    },
    { persona },
  );
}

async function open(page: Page, path: string, ready: string) {
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
  // The screen's data has arrived (no loading placeholder left), so layout and focus checks see the real page.
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

/** Displayed references and file names keep a word joiner after each hyphen (so they never break). */
const wj = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/-/g, '-\u2060?'));
const textFile = (name: string, text: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') });

test.describe('E.13 positive journeys', () => {
  test('search → open → favourite → it is in favourites and recent records', async ({ page, consoleErrors }) => {
    await start(page);
    await open(page, '/backoffice/global/unified-search-results', 'unified-search');
    await page.getByTestId('hub-search-input').fill('Amna');
    const lead = page.locator('[data-testid="hub-hit"][data-record="led_0004"]');
    await expect(lead).toBeVisible();
    await expect(page).toHaveURL(/q=Amna/);
    await lead.getByTestId('favourite-toggle').click();
    await expect(page.getByTestId('toast-success').filter({ hasText: 'Amna Abbasi added to favourites' }).last()).toBeVisible();
    await expect(lead.getByTestId('favourite-toggle')).toHaveAttribute('data-on', 'true');
    await lead.getByTestId('hub-hit-link').click();
    await expect(page).toHaveURL(/lead-360-workspace\?record=led_0004/);
    await expect(page.locator('main h1')).toContainText('Amna Abbasi');
    await open(page, '/backoffice/global/recent-records', 'recent-records');
    await expect(page.locator('[data-testid="recent-row"][data-record="led_0004"]')).toBeVisible();
    await open(page, '/backoffice/global/favorites', 'favourites');
    await expect(page.locator('[data-testid="favourite-row"][data-record="led_0004"]')).toBeVisible();
    // Removing the star removes it from the list (a real server change, with feedback).
    await page.locator('[data-testid="favourite-row"][data-record="led_0004"]').getByTestId('favourite-toggle').click();
    await expect(page.getByTestId('toast-success').filter({ hasText: 'removed from favourites' }).last()).toBeVisible();
    await expect(page.locator('[data-testid="favourite-row"]')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('Ctrl+K “Search everywhere” opens the universal search with the query', async ({ page, consoleErrors }) => {
    await start(page);
    await open(page, '/backoffice/global/favorites', 'favourites');
    await page.keyboard.press('Control+k');
    await page.keyboard.type('LH-A-01');
    const action = page.getByRole('menuitem', { name: 'Search everywhere', exact: true });
    await expect(action).toBeVisible();
    await expect(action).toContainText('Every kind of record for “LH-A-01”');
    await action.click();
    await expect(page).toHaveURL(/unified-search-results\?q=LH-A-01/);
    await expect(page.getByTestId('hub-search-group').first()).toBeVisible();
    await expect(page.locator('[data-testid="hub-search-group"][data-type="unit"]')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('upload v1 → new version v2 → versions → preview of each version', async ({ page, consoleErrors }) => {
    await start(page, CONTROLLER);
    await open(page, '/backoffice/doc/upload-drawer?for=led_0004', 'upload-drawer');
    const drawer = page.getByTestId('upload-drawer');
    await expect(drawer.getByTestId('record-picker-input')).toHaveValue('Amna Abbasi');
    await drawer.getByTestId('upload-title').fill('Visit note — Amna Abbasi');
    await drawer.getByTestId('upload-kind').getByRole('button').click();
    await page.getByRole('option', { name: 'Correspondence' }).click();
    await drawer.locator('input[type="file"]').setInputFiles(textFile('visit-note-v1.txt', 'First visit note (demo)'));
    await expect(drawer.getByTestId('upload-file')).toContainText(wj('visit-note-v1.txt'));
    await drawer.getByTestId('upload-submit').click();
    await expect(page.getByTestId('toast-success').filter({ hasText: /Uploaded DOC-LSP-0015/ }).last()).toBeVisible();
    await expect(page.getByTestId('document-workspace')).toBeVisible();
    await expect(page.getByTestId('document-preview')).toContainText('First visit note (demo)');
    // v2
    await page.getByTestId('document-new-version').click();
    const v2 = page.getByTestId('upload-drawer');
    await v2.locator('input[type="file"]').setInputFiles(textFile('visit-note-v2.txt', 'Second visit note (demo)'));
    await v2.getByTestId('upload-note').fill('Added the second visit');
    await v2.getByTestId('upload-submit').click();
    await expect(page.getByTestId('toast-success').filter({ hasText: /Added version 2 to DOC-LSP-0015/ }).last()).toBeVisible();
    await expect(page.getByTestId('document-preview')).toContainText('Second visit note (demo)');
    await page.getByRole('tab', { name: /Versions \(2\)/ }).click();
    await expect(page.getByTestId('version-row')).toHaveCount(2);
    await page.locator('[data-testid="version-row"][data-n="1"]').getByTestId('version-preview').click();
    await expect(page.getByTestId('document-preview')).toHaveAttribute('data-version', '1');
    await expect(page.getByTestId('document-preview')).toContainText('First visit note (demo)');
    // DOC-004 compares the two versions.
    await page.getByTestId('document-versions-link').click();
    await expect(page.getByTestId('versions-workspace')).toBeVisible();
    await expect(page.locator('[data-testid="compare-row"][data-key="fileName"]')).toHaveAttribute('data-same', 'false');
    expect(consoleErrors).toEqual([]);
  });

  test('expiring documents → open the document → its linked record', async ({ page, consoleErrors }) => {
    await start(page, CONTROLLER);
    await open(page, '/backoffice/doc/expiring-documents', 'expiring-documents');
    await expect(page.getByTestId('expiring-row')).toHaveCount(3);
    await expect(page.getByTestId('expiring-row').first()).toHaveAttribute('data-doc', 'doc_lsp_0011');
    await page.getByTestId('expiring-window-expired').click();
    await expect(page.getByTestId('expiring-row')).toHaveCount(2);
    await page.locator('[data-testid="expiring-row"][data-doc="doc_lsp_0003"]').getByTestId('expiring-row-link').click();
    await expect(page.getByTestId('document-expiry-alert')).toContainText('This document has expired');
    await page.getByRole('tab', { name: 'Related' }).click();
    await page.getByTestId('document-linked-record').click();
    await expect(page).toHaveURL(/project-360-workspace\?record=prj_heights/);
    expect(consoleErrors).toEqual([]);
  });

  test('work queue: filter, then act where the work is done', async ({ page, consoleErrors }) => {
    await start(page);
    await open(page, '/backoffice/home/work-queue', 'work-queue');
    await page.getByTestId('queue-owner').getByRole('button').click();
    await page.getByRole('option', { name: 'Other people’s' }).click();
    await expect(page).toHaveURL(/owner=others/);
    const rows = page.getByTestId('task-row');
    await expect(rows.first()).toBeVisible();
    await expect(page.locator('[data-testid="task-row"][data-mine="true"]')).toHaveCount(0);
    await page.getByTestId('task-urgency-overdue').click();
    await expect(page.locator('[data-testid="task-row"]:not([data-urgency="overdue"])')).toHaveCount(0);
    const first = page.locator('[data-testid="task-row"][data-kind="follow_up"]').first();
    const record = await first.getAttribute('data-record');
    await first.getByTestId('task-action').click();
    await expect(page).toHaveURL(new RegExp(`lead-360-workspace\\?record=${record}&tab=activity`));
    expect(consoleErrors).toEqual([]);
  });

  test('my tasks are mine only (Bilal) and each count opens its items', async ({ page, consoleErrors }) => {
    await start(page, 'sales');
    await open(page, '/backoffice/home/my-tasks', 'my-tasks');
    await expect(page.getByTestId('task-row').first()).toBeVisible();
    await expect(page.locator('[data-testid="task-row"][data-mine="false"]')).toHaveCount(0);
    await page.getByTestId('task-urgency-today').click();
    await expect(page).toHaveURL(/urgency=today/);
    await expect(page.locator('[data-testid="task-row"]:not([data-urgency="today"])')).toHaveCount(0);
    await expect(page.locator('[data-testid="task-row"][data-urgency="today"]').first()).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('templates: the controller approves the clerk’s draft; never their own', async ({ page, consoleErrors }) => {
    await start(page, CONTROLLER);
    await open(page, '/backoffice/doc/templates-and-policies', 'templates');
    await expect(page.getByTestId('templates-awaiting')).toContainText('1 draft is waiting for your approval');
    await page.locator('[data-testid="template-row"][data-template="dtp_lsp_001"]').getByTestId('template-link').click();
    await expect(page.getByTestId('template-own-draft')).toBeVisible();
    await expect(page.getByTestId('template-approve')).toHaveCount(0);
    await open(page, '/backoffice/doc/templates-and-policies?record=dtp_lsp_003', 'template-workspace');
    await page.getByTestId('template-approve').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByTestId('toast-success').filter({ hasText: 'Version 2 of Site visit safety policy — Larkspur Heights approved' }).last()).toBeVisible();
    await expect(page.locator('[data-testid="template-version"][data-n="2"]')).toHaveAttribute('data-state', 'scheduled');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('E.13 access, scope and partitioning', () => {
  test('without document.view the document screens say it is not part of the role; search offers no documents', async ({ page, consoleErrors }) => {
    await start(page, 'manager');
    for (const path of ['/backoffice/doc/document-preview', '/backoffice/doc/expiring-documents', '/backoffice/doc/templates-and-policies', '/backoffice/doc/document-versions']) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId('access-outcome')).toHaveAttribute('data-reason', 'permission_missing');
    }
    await open(page, '/backoffice/global/unified-search-results?q=master', 'unified-search');
    await expect(page.getByTestId('hub-search-results').or(page.getByTestId('state-empty'))).toBeVisible();
    await expect(page.locator('[data-testid="hub-search-group"][data-type="document"]')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('the Heights clerk never sees a Gardens document, name, version or count; a hidden id reads like an unknown one', async ({ page, consoleErrors }) => {
    await start(page, CLERK);
    await open(page, '/backoffice/doc/document-preview', 'documents-finder');
    await expect(page.getByTestId('document-row')).toHaveCount(8);
    const text = (await page.locator('main').innerText()).replace(/\u2060/g, '');
    for (const hidden of ['Larkspur Gardens', 'master plan', 'Hina Chaudhry', 'Fatima Siddiqui', 'LG-P1-002']) expect(text).not.toContain(hidden);
    await open(page, '/backoffice/doc/document-preview?record=doc_lsp_0004', 'document-unavailable');
    const hidden = (await page.locator('main').innerText()).replace(/\u2060/g, '');
    await open(page, '/backoffice/doc/document-preview?record=doc_lsp_9999', 'document-unavailable');
    expect((await page.locator('main').innerText()).replace(/\u2060/g, '')).toBe(hidden);
    await open(page, '/backoffice/doc/templates-and-policies', 'templates');
    await expect(page.locator('[data-testid="template-row"][data-template="dtp_lsp_004"]')).toHaveCount(0);
    await open(page, '/backoffice/home/recent-activity?range=30d', 'recent-activity');
    expect((await page.locator('main').innerText()).replace(/\u2060/g, '')).not.toMatch(/Larkspur Gardens|Block C road|corner plot/);
    expect(consoleErrors).toEqual([]);
  });

  test('favourites and recent records belong to one person: Bilal never sees Nadia’s', async ({ page, consoleErrors }) => {
    await start(page, 'manager');
    await open(page, '/backoffice/crm/lead-360-workspace?record=led_0006', 'lead-add-note');
    await open(page, '/backoffice/global/unified-search-results?q=Hina', 'unified-search');
    await page.locator('[data-testid="hub-hit"][data-record="led_0006"]').getByTestId('favourite-toggle').click();
    await expect(page.getByTestId('toast-success').last()).toBeVisible();
    await become(page, 'sales');
    await open(page, '/backoffice/global/favorites', 'favourites');
    await expect(page.getByTestId('favourite-row')).toHaveCount(0);
    await open(page, '/backoffice/global/recent-records', 'recent-records');
    await expect(page.locator('[data-testid="recent-row"][data-record="led_0006"]')).toHaveCount(0);
    expect((await page.locator('main').innerText()).replace(/\u2060/g, '')).not.toContain('Hina Chaudhry');
    expect(consoleErrors).toEqual([]);
  });

  test('revoking access hides saved records immediately, with no count and no stale title', async ({ page, consoleErrors }) => {
    await start(page, CONTROLLER);
    await open(page, '/backoffice/doc/document-preview?record=doc_lsp_0004', 'document-workspace');
    await page.getByTestId('document-favourite').click();
    await expect(page.getByTestId('toast-success').filter({ hasText: 'added to favourites' }).last()).toBeVisible();
    await open(page, '/backoffice/global/favorites', 'favourites');
    await expect(page.locator('[data-testid="favourite-row"][data-record="doc_lsp_0004"]')).toBeVisible();
    await expect(page.locator('[data-testid="favourite-row"]')).toHaveCount(1);
    // The organisation narrows Tehmina to Larkspur Heights (prototype switch: the same access for screens and server).
    await page.evaluate(() => sessionStorage.setItem('demo:site-scope', JSON.stringify({ lsp_doc_controller: ['site_lk_heights'] })));
    await open(page, '/backoffice/global/favorites', 'favourites');
    await expect(page.getByTestId('favourite-row')).toHaveCount(0);
    await expect(page.getByTestId('state-empty')).toBeVisible();
    expect((await page.locator('main').innerText()).replace(/\u2060/g, '')).not.toMatch(/master plan|DOC-LSP-0004|1 favourite/i);
    await open(page, '/backoffice/global/recent-records', 'recent-records');
    await expect(page.locator('[data-testid="recent-row"][data-record="doc_lsp_0004"]')).toHaveCount(0);
    await open(page, '/backoffice/home/work-queue', 'work-queue');
    expect((await page.locator('main').innerText()).replace(/\u2060/g, '')).not.toMatch(/Larkspur Gardens/);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('E.13 input, duplicates and refusals', () => {
  test('the upload drawer validates inline before anything is sent', async ({ page, consoleErrors }) => {
    await start(page, CLERK);
    await open(page, '/backoffice/doc/document-preview?drawer=upload', 'upload-drawer');
    const drawer = page.getByTestId('upload-drawer');
    await drawer.getByTestId('upload-submit').click();
    await expect(drawer.getByTestId('record-picker-error')).toBeVisible();
    await expect(drawer.getByTestId('upload-file-error')).toBeVisible();
    await drawer.locator('input[type="file"]').setInputFiles({ name: 'archive.zip', mimeType: 'application/zip', buffer: Buffer.from('PK') });
    await expect(drawer.getByTestId('upload-file-error')).toContainText('not accepted');
    await drawer.getByTestId('upload-kind').getByRole('button').click();
    await page.getByRole('option', { name: 'Identity document' }).click();
    await drawer.getByTestId('upload-submit').click();
    await expect(drawer.getByTestId('upload-expiry-error')).toBeVisible();
    const before = await api<{ items: unknown[] }>(page, '/documents');
    expect(before.ok && before.res.items.length).toBe(8);
    expect(consoleErrors).toEqual([]);
  });

  test('pressing Upload twice creates one document (one key per form)', async ({ page, consoleErrors }) => {
    await start(page, CLERK);
    await open(page, '/backoffice/doc/upload-drawer?for=prj_heights', 'upload-drawer');
    const drawer = page.getByTestId('upload-drawer');
    await expect(drawer.getByTestId('record-picker-input')).toHaveValue('Larkspur Heights');
    await drawer.getByTestId('upload-title').fill('Lift inspection note');
    await drawer.getByTestId('upload-kind').getByRole('button').click();
    await page.getByRole('option', { name: 'Correspondence' }).click();
    await drawer.getByTestId('upload-sample').click();
    await drawer.getByTestId('upload-submit').dblclick();
    await expect(page.getByTestId('document-workspace')).toBeVisible();
    const after = await api<{ items: Array<{ title: string }> }>(page, '/documents');
    expect(after.ok && after.res.items.filter((d) => d.title === 'Lift inspection note')).toHaveLength(1);
    expect(consoleErrors).toEqual([]);
  });

  test('a refused upload (a record the clerk cannot see) saves nothing and names nothing', async ({ page, consoleErrors }) => {
    await start(page, CLERK);
    await open(page, '/backoffice/doc/document-preview', 'documents-finder');
    const refused = await api(page, '/documents', 'POST', { recordId: 'led_0006', title: 'Probe', kind: 'other', fileName: 'a.txt', mimeType: 'text/plain', sizeBytes: 1, content: 'data:text/plain;base64,YQ==' });
    const unknown = await api(page, '/documents', 'POST', { recordId: 'led_9999', title: 'Probe', kind: 'other', fileName: 'a.txt', mimeType: 'text/plain', sizeBytes: 1, content: 'data:text/plain;base64,YQ==' });
    expect(refused).toEqual(unknown);
    expect(refused).toMatchObject({ ok: false, status: 404 });
    const list = await api<{ items: unknown[] }>(page, '/documents');
    expect(list.ok && list.res.items.length).toBe(8);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('E.13 keyboard', () => {
  test('“/” focuses the search; the shortcuts can be switched off; the star is reachable by keyboard', async ({ page, consoleErrors }) => {
    await start(page);
    await open(page, '/backoffice/global/unified-search-results?q=LH-A-01', 'unified-search');
    await page.locator('main h1').click();
    await page.keyboard.press('/');
    await expect(page.getByTestId('hub-search-input')).toBeFocused();
    await page.getByTestId('shortcuts-help').locator('summary').click();
    await page.getByTestId('shortcuts-toggle').click();
    await page.locator('main h1').click();
    await page.keyboard.press('/');
    await expect(page.getByTestId('hub-search-input')).not.toBeFocused();
    const star = page.getByTestId('favourite-toggle').first();
    await star.focus();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('toast-success').filter({ hasText: 'added to favourites' }).last()).toBeVisible();
    await expect(star).toHaveAttribute('data-on', 'true');
    expect(consoleErrors).toEqual([]);
  });

  test('document page: U opens the new-version drawer, F toggles the favourite', async ({ page, consoleErrors }) => {
    await start(page, CONTROLLER);
    await open(page, '/backoffice/doc/document-preview?record=doc_lsp_0001', 'document-workspace');
    await page.locator('main h1').click();
    await page.keyboard.press('f');
    await expect(page.getByTestId('document-favourite')).toHaveAttribute('data-on', 'true');
    await page.keyboard.press('u');
    await expect(page.getByTestId('upload-drawer')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('upload-drawer')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

const SCREENS: Array<[string, PersonaId, string, string]> = [
  ['search', CONTROLLER, '/backoffice/global/unified-search-results?q=Larkspur', 'hub-search-results'],
  ['recent', CONTROLLER, '/backoffice/global/recent-records', 'recent-records'],
  ['favourites', CONTROLLER, '/backoffice/global/favorites', 'favourites'],
  ['tasks', CONTROLLER, '/backoffice/home/my-tasks', 'my-tasks'],
  ['queue', CONTROLLER, '/backoffice/home/work-queue', 'work-queue'],
  ['activity', CONTROLLER, '/backoffice/home/recent-activity', 'recent-activity'],
  ['documents', CONTROLLER, '/backoffice/doc/document-preview', 'documents-finder'],
  ['document', CONTROLLER, '/backoffice/doc/document-preview?record=doc_lsp_0001', 'document-workspace'],
  ['versions', CONTROLLER, '/backoffice/doc/document-versions?record=doc_lsp_0004', 'versions-workspace'],
  ['expiring', CONTROLLER, '/backoffice/doc/expiring-documents', 'expiring-documents'],
  ['templates', CONTROLLER, '/backoffice/doc/templates-and-policies', 'templates'],
  ['template', CONTROLLER, '/backoffice/doc/templates-and-policies?record=dtp_lsp_003', 'template-workspace'],
];

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test.describe(`E.13 accessibility (${lang(locale)})`, () => {
    test(`1440 px: every E.13 screen and the upload drawer pass axe, ${lang(locale)}`, async ({ page, consoleErrors }, testInfo) => {
      test.setTimeout(180_000);
      await start(page, CONTROLLER, locale);
      for (const [name, , path, ready] of SCREENS) {
        await open(page, path, ready);
        if (locale === 'ur-PK') await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await axe(page, testInfo, `${name}-1440-${locale}`);
      }
      await open(page, '/backoffice/doc/document-preview?drawer=upload', 'upload-drawer');
      await axe(page, testInfo, `upload-drawer-1440-${locale}`);
      expect(consoleErrors).toEqual([]);
    });

    test(`320 × 700 at 200 % text, ${lang(locale)}: nothing clipped, spilled or broken; the keyboard reaches every control`, async ({ page, consoleErrors }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: 320, height: 700 });
      await start(page, CONTROLLER, locale);
      await page.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })), { key: OFFICE_DISPLAY(PRINCIPAL[CONTROLLER]!) });
      for (const [name, , path, ready] of SCREENS) {
        await open(page, path, ready);
        expect.soft(await layoutProblems(page), `${name} ${lang(locale)} 200 %`).toEqual([]);
        expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${name} overflow`).toBeLessThanOrEqual(1);
      }
      await open(page, '/backoffice/doc/document-preview?drawer=upload', 'upload-drawer');
      expect.soft(await layoutProblems(page.getByTestId('upload-drawer')), `upload drawer ${lang(locale)}`).toEqual([]);
      for (const [name, , path, ready] of [SCREENS[2]!, SCREENS[4]!, SCREENS[7]!]) {
        await open(page, path, ready);
        const stops = await focusWalk(page, { header: HEADER, bar: BAR, max: 60 });
        expect(stops.length, `${name}: controls reached`).toBeGreaterThan(2);
        expect.soft(stops.filter((s) => s.issue), `${name} ${lang(locale)}`).toEqual([]);
      }
      expect(consoleErrors).toEqual([]);
    });

    test(`dark mode (${lang(locale)}, 390 px): the E.13 screens pass axe`, async ({ page, consoleErrors }, testInfo) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width: 390, height: 844 });
      await start(page, CONTROLLER, locale);
      await open(page, '/backoffice/global/accessibility-preferences', 'hub-theme');
      await page.getByTestId('hub-theme-dark').click();
      await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe('dark');
      for (const [name, , path, ready] of [SCREENS[0]!, SCREENS[3]!, SCREENS[7]!, SCREENS[9]!, SCREENS[11]!]) {
        await open(page, path, ready);
        await axe(page, testInfo, `${name}-390-dark-${locale}`);
      }
      expect(consoleErrors).toEqual([]);
    });
  });
}
