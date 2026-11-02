import type { Locator, Page } from '@playwright/test';
import { BO, CU, expect, test, waitForApp, type PersonaId } from '../support/fixtures';
import { layoutProblems } from '../support/layout';
import { become, seedSociety } from '../support/society';

/**
 * Gate D.3 cross-browser smoke (Firefox and WebKit projects): a chat message written, reported and
 * removed by a moderator; a poll answered by a resident; the Community home without the add-ons
 * (official notices still work); and the chat at 320 px / 200 % in Urdu. The full checks run in
 * Chromium (tests/e2e/d3.spec.ts).
 */
async function go(page: Page, origin: string, path: string, ready: string) {
  await page.goto(`${origin}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function as(page: Page, app: 'backoffice' | 'customer', persona: PersonaId, path: string, ready: string) {
  await become(page, app, persona);
  await waitForApp(page);
  await go(page, app === 'backoffice' ? BO : CU, path, ready);
}

/** Firefox's own cancelled font request (NS_BINDING_ABORTED) is the browser, not the app. */
const appErrors = (errors: string[]) => errors.filter((e) => !(e.includes('downloadable font: download failed') && e.includes('status=2152398850')));

const box = (scope: Page | Locator, testId: string) => scope.locator(`:is(input, textarea)[data-testid="${testId}"], [data-testid="${testId}"] :is(input, textarea)`).first();

test('chat: a resident writes and reports; the moderator removes the message; the marker shows', async ({ page, consoleErrors }) => {
  test.setTimeout(180_000);
  await seedSociety(page, { staff: 'alnoor_manager' });
  await as(page, 'customer', 'alnoor_tenant_a102', '/customer/portal/chat/site', 'chat-conversation');
  await box(page, 'chat-input').fill('Smoke test message from Sana');
  await page.getByTestId('chat-send').click();
  await expect(page.getByTestId('chat-message').filter({ hasText: 'Smoke test message from Sana' })).toHaveAttribute('data-mine', 'true');
  const target = page.getByTestId('chat-message').filter({ hasText: 'The generator was very noisy' });
  await target.getByTestId('chat-message-menu').click();
  await page.getByTestId('chat-report').click();
  const drawer = page.getByTestId('chat-report-drawer');
  await drawer.getByTestId('chat-report-reason-off_topic').click();
  await drawer.getByTestId('chat-report-submit').click();
  await expect(drawer).toHaveCount(0);

  await as(page, 'backoffice', 'alnoor_manager', '/backoffice/chat/settings?tab=reports', 'report-list');
  await page.getByTestId('report-card').filter({ hasText: 'The generator was very noisy' }).getByTestId('report-hide').click();
  const dialog = page.getByRole('alertdialog');
  await dialog.locator('textarea').fill('Moved to the community issues.');
  await dialog.getByRole('button', { name: 'Remove message' }).click();
  await expect(dialog).toHaveCount(0);

  await as(page, 'customer', 'alnoor_resident_a101', '/customer/portal/chat/site', 'chat-conversation');
  await expect(page.getByTestId('chat-tombstone').first()).toBeVisible();
  await expect(page.getByTestId('chat-message').filter({ hasText: 'Smoke test message from Sana' })).toHaveAttribute('data-mine', 'false');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('polls: a resident answers an open poll once; published results are shown', async ({ page, consoleErrors }) => {
  await seedSociety(page, { staff: 'alnoor_manager' });
  await as(page, 'customer', 'alnoor_tenant_a102', '/customer/portal/community?tab=polls', 'poll-list');
  const card = page.getByTestId('poll-card').filter({ hasText: 'sports day' });
  await card.getByTestId('poll-answer').click();
  const drawer = page.getByTestId('poll-drawer');
  await drawer.getByTestId('poll-option-opt_1').click();
  await drawer.getByTestId('poll-submit').click();
  await expect(drawer).toHaveCount(0);
  await expect(card.getByTestId('poll-answered')).toBeVisible();
  await expect(card.getByTestId('poll-answer')).toHaveCount(0);
  await expect(page.getByTestId('poll-card').filter({ hasText: 'Gym opening hours' }).getByTestId('poll-results')).toHaveAttribute('data-shown', 'true');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('without the add-ons: the Community home keeps notices and notices open', async ({ page, consoleErrors }) => {
  await page.addInitScript(() => sessionStorage.setItem('demo:withdrawn-modules', JSON.stringify(['community_chat', 'community_hub'])));
  await seedSociety(page, { staff: 'alnoor_manager' });
  await as(page, 'customer', 'alnoor_resident_a101', '/customer/portal/community', 'community-home');
  await expect(page.getByTestId('community-home')).toHaveAttribute('data-tabs', 'notices');
  await page.getByTestId('community-all-notices').click();
  await expect(page.getByTestId('notice-list')).toBeVisible();
  await go(page, CU, '/customer/portal/chat', 'chat-unavailable');
  expect(appErrors(consoleErrors)).toEqual([]);
});

test('320 px, 200 %, Urdu: the Community home and a conversation are not clipped or broken', async ({ page, consoleErrors }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await seedSociety(page, { locale: 'ur-PK', textScale: 2 });
  await go(page, CU, '/customer/portal/community', 'community-notices');
  expect(await layoutProblems(page)).toEqual([]);
  await go(page, CU, '/customer/portal/chat/site', 'chat-conversation');
  expect(await layoutProblems(page)).toEqual([]);
  expect(appErrors(consoleErrors)).toEqual([]);
});
