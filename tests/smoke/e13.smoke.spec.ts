import type { Page } from '@playwright/test';
import { BO, expect, seed, test, type PersonaId } from '../support/fixtures';
import { layoutProblems } from '../support/layout';
import { societyApi } from '../support/society';

/**
 * Gate E.13 cross-browser smoke (Firefox and WebKit projects): search → favourite → favourites; a demo
 * upload with a new version and its preview; the Heights clerk never sees a Gardens document; the
 * favourites and document pages at 320 px with 200 % text in Urdu. The full checks run in Chromium
 * (tests/e2e/e13-workspaces.spec.ts). Business date: 26 October 2026.
 */
const CONTROLLER = 'lsp_doc_controller' as PersonaId;
const CLERK = 'lsp_records_clerk' as PersonaId;

async function start(page: Page, persona: PersonaId, locale: 'en-PK' | 'ur-PK' = 'en-PK') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T15:10:00+05:00'));
  await seed(page, { persona, locale });
}

/** Firefox's own cancelled font request (NS_BINDING_ABORTED) is the browser, not the app. */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

test('search → favourite → favourites and recent records', async ({ page, consoleErrors }) => {
  // Firefox and WebKit start slower on Windows (other smoke specs allow the same).
  test.setTimeout(150_000);
  await start(page, 'manager');
  await page.goto(`${BO}/backoffice/global/unified-search-results?q=Amna`);
  const hit = page.locator('[data-testid="hub-hit"][data-record="led_0004"]');
  await expect(hit).toBeVisible();
  await hit.getByTestId('favourite-toggle').click();
  await expect(page.getByTestId('toast-success').filter({ hasText: 'added to favourites' }).last()).toBeVisible();
  await hit.getByTestId('hub-hit-link').click();
  await expect(page).toHaveURL(/record=led_0004/);
  // Lead 360 has opened (the shell records the visit once the record check has answered).
  await expect(page.getByTestId('lead-add-note')).toBeVisible();
  await page.goto(`${BO}/backoffice/global/favorites`);
  await expect(page.locator('[data-testid="favourite-row"][data-record="led_0004"]')).toBeVisible();
  await page.goto(`${BO}/backoffice/global/recent-records`);
  await expect(page.locator('[data-testid="recent-row"][data-record="led_0004"]')).toBeVisible();
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('a demo upload, a second version and the preview of each', async ({ page, consoleErrors }) => {
  // Firefox and WebKit start slower on Windows (other smoke specs allow the same).
  test.setTimeout(150_000);
  await start(page, CONTROLLER);
  await page.goto(`${BO}/backoffice/doc/upload-drawer?for=led_0004`);
  const drawer = page.getByTestId('upload-drawer');
  await expect(drawer.getByTestId('record-picker-input')).toHaveValue('Amna Abbasi');
  await drawer.getByTestId('upload-title').fill('Smoke note');
  await drawer.getByTestId('upload-kind').getByRole('button').click();
  await page.getByRole('option', { name: 'Correspondence' }).click();
  await drawer.locator('input[type="file"]').setInputFiles({ name: 'smoke-v1.txt', mimeType: 'text/plain', buffer: Buffer.from('Smoke version one') });
  await drawer.getByTestId('upload-submit').click();
  await expect(page.getByTestId('document-preview')).toContainText('Smoke version one');
  await page.getByTestId('document-new-version').click();
  const v2 = page.getByTestId('upload-drawer');
  await v2.locator('input[type="file"]').setInputFiles({ name: 'smoke-v2.txt', mimeType: 'text/plain', buffer: Buffer.from('Smoke version two') });
  await v2.getByTestId('upload-note').fill('Second take');
  await v2.getByTestId('upload-submit').click();
  await expect(page.getByTestId('document-preview')).toContainText('Smoke version two');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('the Heights clerk never sees a Gardens document; a hidden one reads like an unknown one', async ({ page, consoleErrors }) => {
  // Firefox and WebKit start slower on Windows (other smoke specs allow the same).
  test.setTimeout(150_000);
  await start(page, CLERK);
  await page.goto(`${BO}/backoffice/doc/document-preview`);
  await expect(page.getByTestId('document-row')).toHaveCount(8);
  expect((await page.locator('main').innerText()).replace(/\u2060/g, '')).not.toContain('Larkspur Gardens');
  const hidden = await societyApi(page, '/documents/doc_lsp_0004');
  const unknown = await societyApi(page, '/documents/doc_lsp_9999');
  expect(hidden).toEqual(unknown);
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('320 px at 200 % text in Urdu: favourites, the documents list and a document', async ({ page, consoleErrors }) => {
  // Firefox and WebKit start slower on Windows (other smoke specs allow the same).
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 320, height: 700 });
  await start(page, CONTROLLER, 'ur-PK');
  await page.addInitScript(() => localStorage.setItem('pref:display:v1:backoffice:tnt_larkspur:usr_lsp_d0001', JSON.stringify({ version: 2, textScale: 2, chosenAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' })));
  for (const [path, ready] of [
    ['/backoffice/global/favorites', 'favourites'],
    ['/backoffice/doc/document-preview', 'documents-finder'],
    ['/backoffice/doc/document-preview?record=doc_lsp_0001', 'document-workspace'],
  ] as const) {
    await page.goto(`${BO}${path}`);
    await expect(page.getByTestId(ready)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(await layoutProblems(page), path).toEqual([]);
  }
  expect(appErrors(consoleErrors)).toEqual([]);
});
