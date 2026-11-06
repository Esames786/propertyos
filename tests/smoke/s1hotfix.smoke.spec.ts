import type { Page } from '@playwright/test';
import { BO, expect, test, waitForApp, type PersonaId } from '../support/fixtures';
import { become, seedSociety, societyApi } from '../support/society';

/**
 * GitHub Issue #18 cross-browser smoke (Firefox and WebKit projects): Imran (no bank feed) opens
 * BANK-002 by its statement-lines deep link and FIN-009 read-only, in Urdu, and sees the reason, no
 * line; Saba starts two office collections in one visit and gets two. The full checks run in
 * Chromium (tests/e2e/s1-hotfix.spec.ts). Business date: 26 October 2026.
 */
const SECRET = /DEMO-TXN|bnl_anr_|PK36DEMO|PK70DEMO|IMRAN HUSSAIN/;

async function at(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-26T16:10:00+05:00'));
}

async function as(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await waitForApp(page);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

/** Firefox's own cancelled font request (NS_BINDING_ABORTED) is the browser, not the app. */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

test('Imran, in Urdu: BANK-002 lines deep link and FIN-009 read-only show the reason and no bank line', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await at(page);
  await seedSociety(page, { staff: 'alnoor_manager', locale: 'ur-PK' });
  await as(page, 'alnoor_manager', '/backoffice/bank/bank-account-360-workspace?record=ben_anr_main&tab=lines', 'account-bank-restricted');
  await expect(page.getByTestId('account-lines')).toHaveCount(0);
  expect(await page.locator('main').innerText()).not.toMatch(SECRET);
  const q = await societyApi<{ items: Array<{ id: string; flats: string[] }> }>(page, '/payment-submissions');
  const a305 = (q.ok ? q.res.items : []).find((r) => r.flats[0] === 'A-305')!.id;
  await as(page, 'alnoor_manager', `/backoffice/fin/transfer-proof-review?record=${a305}`, 'review-bank-restricted');
  await expect(page.getByTestId('match-candidate-read')).toHaveCount(0);
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('Saba starts two office collections in one visit: two collections, two references', async ({ page, consoleErrors }) => {
  test.setTimeout(120_000);
  await at(page);
  await seedSociety(page, { staff: 'alnoor_accounts' });
  await as(page, 'alnoor_accounts', '/backoffice/fin/office-collections', 'office-collections-page');
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('new-batch').click();
    await expect(page.getByTestId('batch-drawer')).toBeVisible();
    ids.push(new URL(page.url()).searchParams.get('batch')!);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('batch-drawer')).toBeHidden();
  }
  expect(ids[0]).toBeTruthy();
  expect(ids[1]).not.toBe(ids[0]);
  expect(appErrors(consoleErrors)).toEqual([]);
});
