import type { Locator, Page } from '@playwright/test';
import { BO, CU, expect, test, waitForApp, type PersonaId } from '../support/fixtures';
import { layoutProblems } from '../support/layout';
import { become, seedSociety } from '../support/society';

/**
 * Gate D.2 cross-browser smoke (Firefox and WebKit projects, review Issue #8): the three resident
 * journeys through both apps (repair → resident confirmation, a visitor approved from the phone,
 * an official notice acknowledged) and the 320 px / 200 % Urdu notices and bill. The full checks run
 * in Chromium (tests/e2e/d2.spec.ts, d2-closure.spec.ts).
 */
async function go(page: Page, origin: string, path: string, ready: string) {
  await page.goto(`${origin}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function as(page: Page, app: 'backoffice' | 'customer', persona: PersonaId, path: string, ready: string) {
  await become(page, app, persona);
  // become() may open the other app's start page first: let it finish loading its screen before the
  // next navigation (Firefox otherwise reports the start page's cancelled route chunk as an error).
  await waitForApp(page);
  await go(page, app === 'backoffice' ? BO : CU, path, ready);
}

/**
 * Firefox logs a font request it cancelled itself when the test navigates on while a font is still
 * loading (status 2152398850 = NS_BINDING_ABORTED). That is the browser, not the app; every other
 * console error still fails the test.
 */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

const box = (scope: Page | Locator, testId: string) =>
  scope.locator(`:is(input, textarea)[data-testid="${testId}"], [data-testid="${testId}"] :is(input, textarea)`).first();

test('repair → triage → assign → fixed → the resident confirms', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await seedSociety(page, { staff: 'alnoor_maintenance' });
  await as(page, 'customer', 'alnoor_resident_a101', '/customer/portal/maintenance-workspace', 'repairs-page');
  await page.getByTestId('repair-new').click();
  const sheet = page.getByTestId('repair-new-sheet');
  await box(sheet, 'repair-title').fill('Bathroom tap dripping');
  await box(sheet, 'repair-description').fill('The cold tap in the bathroom drips all night.');
  await sheet.getByTestId('repair-submit').click();
  const detail = page.getByTestId('repair-detail');
  await expect(detail).toHaveAttribute('data-state', 'submitted');
  const ref = (await detail.locator('.ltr-ref').first().innerText()).trim();

  await as(page, 'backoffice', 'alnoor_maintenance', `/backoffice/mnt/maintenance-list?q=${ref}`, 'request-row');
  await page.getByTestId('request-row').filter({ hasText: ref }).click();
  const ws = page.getByTestId('request-workspace');
  await page.getByTestId('action-triage').click();
  await page.getByTestId('triage-submit').click();
  await expect(ws).toHaveAttribute('data-state', 'triaged');
  await page.getByTestId('action-assign').click();
  const assign = page.getByTestId('assign-drawer');
  await assign.getByTestId('technician-option').filter({ hasText: 'Bilal' }).click();
  await assign.getByTestId('assign-submit').click();
  await expect(ws).toHaveAttribute('data-state', 'assigned');
  await page.getByTestId('action-start').click();
  await expect(ws).toHaveAttribute('data-state', 'in_progress');
  await page.getByTestId('action-complete').click();
  const complete = page.getByTestId('complete-drawer');
  await box(complete, 'complete-note').fill('Replaced the washer; no drip after 30 minutes.');
  await complete.getByTestId('complete-photos-sample').click();
  await box(complete, 'complete-photos-alt-0').fill('Dry tap after the repair');
  await complete.getByTestId('complete-submit').click();
  await expect(ws).toHaveAttribute('data-state', 'completed');

  await as(page, 'customer', 'alnoor_resident_a101', '/customer/portal/home', 'dues-home');
  await expect(page.getByTestId('home-attention-repair').filter({ hasText: 'Bathroom tap dripping' })).toBeVisible();
  await page.getByTestId('home-attention-repair').filter({ hasText: 'Bathroom tap dripping' }).getByRole('link').click();
  await page.getByTestId('rating-5').click();
  await page.getByTestId('repair-confirm-yes').click();
  await expect(page.getByTestId('repair-detail')).toHaveAttribute('data-state', 'closed');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('a walk-in at the gate → the resident approves on the phone → the guard lets them in', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await seedSociety(page, { staff: 'alnoor_guard' });
  await go(page, BO, '/backoffice/vis/gate-check-in', 'walk-in');
  const walkIn = page.getByTestId('walk-in');
  await walkIn.getByTestId('walk-in-flat').locator('input').fill('A-101');
  await page.getByRole('option', { name: /A-101/ }).first().click();
  await box(walkIn, 'walk-in-name').fill('Courier from Leopards');
  await walkIn.getByTestId('walk-in-ask').click();
  await go(page, BO, '/backoffice/vis/gate-check-in?tab=queue', 'live-queue');
  await expect(page.getByTestId('queue-request').filter({ hasText: 'Courier from Leopards' })).toHaveAttribute('data-state', 'waiting');

  await page.setViewportSize({ width: 390, height: 844 });
  await as(page, 'customer', 'alnoor_resident_a101', '/customer/portal/home', 'dues-home');
  const prompt = page.getByRole('alertdialog');
  await expect(prompt).toContainText('Courier from Leopards');
  await prompt.getByTestId('gate-approve').click();
  await expect(prompt).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 900 });
  await as(page, 'backoffice', 'alnoor_guard', '/backoffice/vis/gate-check-in?tab=queue', 'live-queue');
  const answered = page.getByTestId('answered-row').filter({ hasText: 'Courier from Leopards' });
  await answered.getByTestId('queue-admit').click();
  await expect(answered.getByTestId('queue-admit')).toHaveCount(0);
  await go(page, BO, '/backoffice/vis/gate-check-in', 'inside-now');
  await expect(page.getByTestId('inside-now')).toContainText('Courier from Leopards');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('an official notice is published, acknowledged by the resident and counted by the office', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await seedSociety(page, { staff: 'alnoor_manager' });
  await go(page, BO, '/backoffice/res/community-announcements', 'notices-office');
  await page.getByTestId('notice-new').click();
  const compose = page.getByTestId('compose-drawer');
  await box(compose, 'compose-title').fill('Lift maintenance on Saturday 1 November');
  await box(compose, 'compose-body').fill('Both lifts of Block A stop from 10:00 to 13:00 for their yearly service.');
  await compose.getByTestId('compose-ack').click();
  await compose.getByTestId('compose-publish').click();
  await expect(compose).toBeHidden();

  await as(page, 'customer', 'alnoor_resident_a101', '/customer/portal/community-notices', 'notice-list');
  await page.getByTestId('notice-card').filter({ hasText: 'Lift maintenance' }).click();
  await expect(page.getByTestId('notice-detail')).toContainText('yearly service');
  await page.getByTestId('notice-acknowledge').click();
  await expect(page.getByTestId('notice-acked')).toBeVisible();

  await as(page, 'backoffice', 'alnoor_manager', '/backoffice/res/community-announcements', 'notices-office');
  await page.getByTestId('notice-row').filter({ hasText: 'Lift maintenance' }).click();
  await expect(page.getByTestId('notice-detail').getByTestId('notice-stats')).toBeVisible();
  await expect(page.getByTestId('notice-detail').getByTestId('unacknowledged')).not.toContainText('A-101');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('320 px, Urdu, 200 % text: notices and the bill card read whole', async ({ page, consoleErrors }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await seedSociety(page, { locale: 'ur-PK', textScale: 2 });
  await go(page, CU, '/customer/portal/community-notices', 'notice-list');
  expect(await layoutProblems(page)).toEqual([]);
  await go(page, CU, '/customer/portal/home', 'dues-bill');
  expect(await layoutProblems(page.getByTestId('dues-bill'))).toEqual([]);
  expect((await page.getByTestId('dues-total').innerText()).replace(/\s+/g, ' ').trim()).toBe('Rs 5,200.00');
  expect(appErrors(consoleErrors)).toEqual([]);
});
