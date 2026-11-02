import type { Locator, Page, TestInfo } from '@playwright/test';
import { scanA11y } from '../support/axe';
import { BO, CU, expect, test, type Locale, type PersonaId } from '../support/fixtures';
import { focusWalk, layoutProblems } from '../support/layout';
import { become, seedSociety, societyApi } from '../support/society';
import { VIEWPORTS } from '../support/viewports';

/**
 * Gate D.3 (community engagement) through both apps, with the Al-Noor storyline: Kamran (A-101, owner
 * and committee joint secretary), Sana (A-102, tenant), Rabia (A-201, committee secretary with an
 * office sign-in) and Junaid (A-202, tenant) use the community chat, polls, local services and
 * resources; Imran (building manager) moderates, runs polls and publishes. The rules are the
 * server's (community.api.test.ts and the vectors); these tests check that the screens show them
 * honestly, in both languages, on phones at 200 % text, and without the add-ons.
 */
const api = societyApi;
const PHONE = { width: 320, height: 700 };
const HEADER = '[data-testid="portal-header"]';
const BAR = '[data-testid="portal-bottom-nav"]';

async function office(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await page.goto(`${BO}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

async function resident(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'customer', persona);
  await page.goto(`${CU}${path}`);
  await expect(page.getByTestId(ready).first()).toBeVisible();
}

/** A field's text box, whether the test id sits on the box itself or on its wrapper. */
const box = (scope: Page | Locator, testId: string) => scope.locator(`:is(input, textarea)[data-testid="${testId}"], [data-testid="${testId}"] :is(input, textarea)`).first();

/** Choose an option of a select (React Aria) by its visible name. */
async function choose(page: Page, scope: Page | Locator, testId: string, name: RegExp | string) {
  await scope.getByTestId(testId).getByRole('button').first().click();
  await page.getByRole('option', { name }).first().click();
}

/** Confirm an alert dialog, typing a note first when it asks for one. */
async function confirm(page: Page, button: RegExp | string, note?: string) {
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  if (note) await dialog.locator('textarea').fill(note);
  await dialog.getByRole('button', { name: button }).click();
  await expect(dialog).toHaveCount(0);
}

const overflowOf = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function axe(page: Page, testInfo: TestInfo, label: string) {
  const { violations } = await scanA11y(page, testInfo, label);
  expect(violations, label).toEqual([]);
}

/** Entry animations finished (positions are measured, not mid-slide). */
async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
}

const message = (page: Page, text: string) => page.getByTestId('chat-message').filter({ hasText: text });

test.describe('D.3 reference 1: community chat and moderation', () => {
  test('Kamran writes in the whole community; Sana sees it unread and reports another message; Imran removes it; everyone sees the marker', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_manager' });

    // Community home: the chat card counts unread messages; the chat lists Kamran's groups (from where he lives).
    await resident(page, 'alnoor_resident_a101', '/customer/portal/community', 'community-home');
    await expect(page.getByTestId('community-chat-card')).toContainText(/unread/);
    await axe(page, testInfo, 'community-home-1440-en');
    await page.getByTestId('community-chat-card').click();
    await expect(page.getByTestId('chat-groups')).toBeVisible();
    const groups = page.getByTestId('chat-group');
    await expect(groups).toHaveCount(4);
    expect(await groups.evaluateAll((els) => els.map((e) => e.getAttribute('data-group')))).toEqual(['site', 'block:bld_anr_a', 'floor:bld_anr_a:1', 'committee']);
    await expect(page.getByTestId('chat-simulated')).toBeVisible();

    // The whole community: earlier messages from the day he joined, a "new messages" line, then his own.
    await page.getByTestId('chat-group').and(page.locator('[data-group="site"]')).click();
    const conversation = page.getByTestId('chat-conversation');
    await expect(conversation).toHaveAttribute('data-group', 'site');
    await expect(page.getByTestId('chat-new-line')).toBeVisible();
    await expect(page.getByTestId('chat-visible-from')).toContainText('2017');
    await axe(page, testInfo, 'chat-conversation-1440-en');
    await box(page, 'chat-input').fill('Is the gym open early on Sunday?');
    await page.getByTestId('chat-send').click();
    await expect(message(page, 'Is the gym open early on Sunday?')).toHaveAttribute('data-mine', 'true');
    await expect(message(page, 'Is the gym open early on Sunday?')).toContainText('Sent');

    // Sana (A-102): no committee group; Kamran's message is unread for her.
    await resident(page, 'alnoor_tenant_a102', '/customer/portal/chat', 'chat-groups');
    expect(await page.getByTestId('chat-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')))).not.toContain('committee');
    await expect(page.getByTestId('chat-group').and(page.locator('[data-group="site"]'))).not.toHaveAttribute('data-unread', '0');
    await page.getByTestId('chat-group').and(page.locator('[data-group="site"]')).click();
    await expect(message(page, 'Is the gym open early on Sunday?')).toHaveAttribute('data-mine', 'false');
    // She reports the generator complaint as off-topic, with a note.
    const target = message(page, 'The generator was very noisy');
    await target.getByTestId('chat-message-menu').click();
    await page.getByTestId('chat-report').click();
    const drawer = page.getByTestId('chat-report-drawer');
    await expect(drawer).toContainText('The generator was very noisy');
    await drawer.getByTestId('chat-report-reason-off_topic').click();
    await box(drawer, 'chat-report-note').fill('Belongs in the community issues, not the chat');
    await axe(page, testInfo, 'chat-report-drawer-1440-en');
    await drawer.getByTestId('chat-report-submit').click();
    await expect(drawer).toHaveCount(0);
    await expect(target).toContainText('You reported this message');

    // Imran: the reports queue shows only the reported messages; he removes it with a note.
    await office(page, 'alnoor_manager', '/backoffice/chat/settings?tab=reports', 'report-list');
    await expect(page.getByTestId('report-card')).toHaveCount(2);
    await axe(page, testInfo, 'chat-reports-1440-en');
    const card = page.getByTestId('report-card').filter({ hasText: 'The generator was very noisy' });
    await expect(card).toContainText('Belongs in the community issues');
    await expect(card).not.toContainText('Sana');
    await card.getByTestId('report-hide').click();
    await confirm(page, /Remove message/, 'Moved to the community issues by the office.');
    await expect(page.getByTestId('report-card')).toHaveCount(1);
    await page.getByTestId('reports-status').getByText('Decided').click();
    await expect(page.getByTestId('report-card').filter({ hasText: 'Moved to the community issues' })).toHaveAttribute('data-state', 'hidden');

    // Everyone sees a marker without the text; the office inbox too.
    await resident(page, 'alnoor_resident_a101', '/customer/portal/chat/site', 'chat-conversation');
    await expect(page.getByTestId('chat-tombstone').first()).toContainText('removed by a moderator');
    await expect(page.getByTestId('chat-log')).not.toContainText('The generator was very noisy');
    await office(page, 'alnoor_manager', '/backoffice/chat/site', 'chat-conversation');
    await expect(page.getByTestId('chat-tombstone').first()).toBeVisible();
    await box(page, 'chat-input').fill('The generator is fixed. Thank you for your patience.');
    await page.getByTestId('chat-send').click();
    await expect(message(page, 'The generator is fixed')).toContainText('Office');
    await axe(page, testInfo, 'chat-inbox-1440-en');
    expect(consoleErrors).toEqual([]);
  });

  test('other groups are not available to non-members; the office reads no block conversation; blocking hides a neighbour for you only', async ({ page, consoleErrors }) => {
    await seedSociety(page, { staff: 'alnoor_manager' });
    // Sana opens the committee and Block B by address: not available, nothing shown.
    await resident(page, 'alnoor_tenant_a102', '/customer/portal/chat/committee', 'chat-conversation-unavailable');
    await expect(page.getByTestId('chat-conversation-unavailable')).toContainText('not in this group');
    await page.goto(`${CU}/customer/portal/chat/block:bld_anr_b`);
    await expect(page.getByTestId('chat-conversation-unavailable')).toBeVisible();
    // Blocking Hamza: his messages become a marker for Sana only.
    await page.goto(`${CU}/customer/portal/chat/site`);
    const keys = message(page, 'Found a set of keys');
    await keys.getByTestId('chat-message-menu').click();
    await page.getByTestId('chat-block').click();
    await confirm(page, /^Block$/);
    await expect(page.getByTestId('chat-message').filter({ hasText: 'Hidden: you blocked this person' }).first()).toHaveAttribute('data-state', 'blocked');
    await resident(page, 'alnoor_resident_a101', '/customer/portal/chat/site', 'chat-conversation');
    await expect(message(page, 'Found a set of keys')).toHaveAttribute('data-state', 'visible');
    // The office: whole community and office team only.
    await office(page, 'alnoor_manager', '/backoffice/chat', 'chat-groups');
    expect(await page.getByTestId('chat-group').evaluateAll((els) => els.map((e) => e.getAttribute('data-group')))).toEqual(['site', 'staff']);
    await page.goto(`${BO}/backoffice/chat/block:bld_anr_a`);
    await expect(page.getByTestId('chat-conversation-unavailable')).toBeVisible();
    // The treasurer has no chat permission: the address shows the access outcome, not a chat.
    await become(page, 'backoffice', 'alnoor_treasurer');
    await page.goto(`${BO}/backoffice/chat`);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByTestId('chat')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('Junaid writes while offline; the office records his move-out; on reconnect the message is refused and his groups are gone', async ({ page, consoleErrors }) => {
    await seedSociety(page, { resident: 'alnoor_tenant_a202', staff: 'alnoor_manager' });
    await resident(page, 'alnoor_tenant_a202', '/customer/portal/chat/block:bld_anr_a', 'chat-conversation');
    await page.getByTestId('chat-go-offline').click();
    await expect(page.getByTestId('chat-offline-demo')).toHaveAttribute('data-offline', 'true');
    await expect(page.getByTestId('chat-offline-copy')).toBeVisible();
    await box(page, 'chat-input').fill('Written on the way home, sent later');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-queued')).toContainText('Written on the way home');

    // Meanwhile the office (another tab of this browser) records the move-out.
    const officeTab = await page.context().newPage();
    await become(officeTab, 'backoffice', 'alnoor_manager');
    await officeTab.goto(`${BO}/backoffice/home/role-aware-dashboard`);
    await expect(officeTab.locator('main')).toBeVisible();
    const moved = await api(officeTab, '/ops/moves', 'POST', { flatId: 'unt_anr_a202', partyId: 'pty_anr_0011', effectiveOn: '2026-10-26', reason: 'Tenancy ended' });
    expect(moved.ok).toBe(true);
    await officeTab.close();

    // Back online: refused (no longer a member), the group's copy leaves the device, no groups remain.
    await page.getByTestId('chat-go-online').click();
    await expect(page.getByTestId('chat-rejected')).toContainText('Written on the way home');
    await expect(page.getByTestId('chat-queued')).toHaveCount(0);
    await page.goto(`${CU}/customer/portal/chat`);
    await expect(page.getByTestId('chat-groups')).toContainText('No groups yet');
    const kamran = await (async () => {
      await become(page, 'customer', 'alnoor_resident_a101');
      await page.goto(`${CU}/customer/portal/chat/block:bld_anr_a`);
      await expect(page.getByTestId('chat-conversation')).toBeVisible();
      return page.getByTestId('chat-log').innerText();
    })();
    expect(kamran).not.toContain('Written on the way home');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('D.3 reference 2: groups, custom groups and the retention policy', () => {
  test('Imran sees who is in the committee and why, creates a group for Block A owners and checks the policy', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, 'alnoor_manager', '/backoffice/chat/settings', 'chat-smart-groups');
    await axe(page, testInfo, 'chat-groups-1440-en');
    await page.getByTestId('chat-rule').and(page.locator('[data-group="committee"]')).getByTestId('rule-preview').click();
    const preview = page.getByTestId('chat-preview-members');
    await expect(preview).toContainText('Kamran Siddiqui');
    await expect(preview).toContainText('Committee member since');
    // Rabia, a resident with an office sign-in, is one person in the list.
    await expect(preview.getByText('Rabia Hashmi', { exact: true })).toHaveCount(1);
    await expect(preview).not.toContainText('Sana Iqbal');
    await page.keyboard.press('Escape');

    await page.goto(`${BO}/backoffice/chat/settings?tab=custom`);
    await page.getByTestId('custom-new').click();
    const drawer = page.getByTestId('custom-drawer');
    await box(drawer, 'custom-name').fill('Block A owners');
    await drawer.getByTestId('custom-audience-scope').getByText('Chosen blocks').click();
    await drawer.getByTestId('custom-audience-block-A').click();
    await axe(page, testInfo, 'chat-custom-drawer-1440-en');
    await drawer.getByTestId('custom-create').click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByTestId('chat-rule').filter({ hasText: 'Block A owners' })).toBeVisible();

    await page.goto(`${BO}/backoffice/chat/settings?tab=policy`);
    await expect(page.getByTestId('policy-current')).toContainText('365 days');
    await expect(page.getByTestId('policy-dm')).toContainText('off');
    await expect(page.getByTestId('policy-versions')).toContainText('Rabia Hashmi');
    // Saving without confirming the society's own legal check is refused.
    await box(page, 'policy-days').fill('180');
    await page.getByTestId('policy-save').click();
    await expect(page.getByRole('alert')).toContainText('Confirm that the society checked');
    await page.getByTestId('policy-reviewed').click();
    await page.getByTestId('policy-save').click();
    await expect(page.getByTestId('policy-current')).toContainText('180 days');
    await axe(page, testInfo, 'chat-policy-1440-en');

    // Kamran (owner in Block A) is in the new group; Sana (tenant) is not.
    await resident(page, 'alnoor_resident_a101', '/customer/portal/chat', 'chat-groups');
    await expect(page.getByTestId('chat-group').filter({ hasText: 'Block A owners' })).toBeVisible();
    await resident(page, 'alnoor_tenant_a102', '/customer/portal/chat', 'chat-groups');
    await expect(page.getByTestId('chat-group').filter({ hasText: 'Block A owners' })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('D.3 reference 3: an informal poll', () => {
  test('Imran drafts and opens a poll; three households answer; turnout only while open; closed and published, residents see the results', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(150_000);
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, 'alnoor_manager', '/backoffice/community/polls', 'polls-office');
    await expect(page.getByTestId('polls-informal-office')).toContainText('not a formal vote');
    await page.getByTestId('poll-new').click();
    const editor = page.getByTestId('poll-editor');
    await box(editor, 'poll-title').fill('Car wash bay');
    await box(editor, 'poll-question').fill('Should the society add a car wash bay in the basement?');
    await box(editor, 'poll-option-0').fill('Yes');
    await box(editor, 'poll-option-1').fill('No');
    await editor.getByTestId('poll-closes').fill('2026-11-20');
    await axe(page, testInfo, 'poll-editor-1440-en');
    await editor.getByTestId('poll-save').click();
    const detail = page.getByTestId('poll-detail');
    await expect(detail).toHaveAttribute('data-state', 'draft');
    const pollUrl = page.url();
    await page.getByTestId('poll-open').click();
    await confirm(page, /Open the poll/);
    await expect(detail).toHaveAttribute('data-state', 'open');

    // Three households answer; Rabia (owner of A-201 and A-202) chooses which flat she answers for.
    for (const [persona, option, flat] of [['alnoor_tenant_a102', 'opt_1', null], ['alnoor_resident_a101', 'opt_1', null], ['alnoor_owner_a201', 'opt_2', 'unt_anr_a201']] as const) {
      await resident(page, persona, '/customer/portal/community?tab=polls', 'poll-list');
      const card = page.getByTestId('poll-card').filter({ hasText: 'Car wash bay' });
      await card.getByTestId('poll-answer').click();
      const drawer = page.getByTestId('poll-drawer');
      if (flat) await drawer.getByTestId(`poll-flat-${flat}`).click();
      await drawer.getByTestId(`poll-option-${option}`).click();
      await expect(drawer).toContainText('Anonymous');
      if (persona === 'alnoor_tenant_a102') await axe(page, testInfo, 'poll-drawer-1440-en');
      await drawer.getByTestId('poll-submit').click();
      await expect(drawer).toHaveCount(0);
      await expect(page.getByTestId('poll-card').filter({ hasText: 'Car wash bay' }).getByTestId('poll-answered')).toBeVisible();
    }

    // The office sees turnout, never how people answered while it is open.
    await become(page, 'backoffice', 'alnoor_manager');
    await page.goto(pollUrl);
    await expect(page.getByTestId('poll-turnout')).toContainText('3 of');
    await expect(page.getByTestId('poll-no-tally')).toBeVisible();
    await expect(page.getByTestId('poll-totals')).toHaveCount(0);
    await page.getByTestId('poll-close').click();
    await confirm(page, /Close now/);
    await expect(page.getByTestId('poll-totals')).toContainText('2 answers');
    await page.getByTestId('poll-publish').click();
    await confirm(page, /Publish results/);
    await expect(page.getByTestId('poll-published')).toHaveAttribute('data-shown', 'true');
    await axe(page, testInfo, 'poll-detail-1440-en');

    await resident(page, 'alnoor_tenant_a102', '/customer/portal/community?tab=polls', 'poll-list');
    const results = page.getByTestId('poll-card').filter({ hasText: 'Car wash bay' }).getByTestId('poll-results');
    await expect(results).toHaveAttribute('data-shown', 'true');
    await expect(results).toContainText('3 answers in total');
    // The published gym poll shows results; a below-threshold poll explains why it shows none.
    await expect(page.getByTestId('poll-card').filter({ hasText: 'Gym opening hours' }).getByTestId('poll-results')).toContainText('31 answers');
    await axe(page, testInfo, 'community-polls-1440-en');
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('D.3 local services and resources', () => {
  test('Imran adds a provider without its number; Rabia vets it; Sana finds, recommends and reports; a reported provider is suspended', async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(150_000);
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, 'alnoor_manager', '/backoffice/community/services', 'provider-list');
    await axe(page, testInfo, 'services-office-1440-en');
    await page.getByTestId('provider-add').click();
    const add = page.getByTestId('provider-add-drawer');
    await box(add, 'provider-name').fill('Fresh Paint Co (Demo)');
    await choose(page, add, 'provider-category', 'Other');
    await box(add, 'provider-description').fill('Interior painting for flats, weekends only.');
    await box(add, 'provider-serves').fill('Lahore');
    await choose(page, add, 'provider-consent-method', 'Verbal');
    await axe(page, testInfo, 'provider-add-1440-en');
    await add.getByTestId('provider-add-submit').click();
    await expect(add).toHaveCount(0);
    const drawer = page.getByTestId('provider-drawer');
    await expect(drawer).toContainText('Not kept (no consent to show it)');
    await expect(drawer.getByTestId('provider-vet-other')).toBeVisible();
    await expect(drawer.getByTestId('provider-vet')).toHaveCount(0);

    await office(page, 'alnoor_admin', '/backoffice/community/services?status=pending', 'provider-list');
    await page.getByTestId('provider-row').filter({ hasText: 'Fresh Paint Co' }).click();
    await page.getByTestId('provider-drawer').getByTestId('provider-vet').click();
    await confirm(page, /Vet and list/);
    await expect(page.getByTestId('provider-drawer').getByTestId('provider-status')).toHaveAttribute('data-status', 'listed');

    await resident(page, 'alnoor_tenant_a102', '/customer/portal/community?tab=services', 'services-list');
    await expect(page.getByTestId('services-disclaimer')).toContainText('does not guarantee');
    await box(page, 'services-search').fill('paint');
    const card = page.getByTestId('provider-card').filter({ hasText: 'Fresh Paint Co' });
    await expect(card).toBeVisible();
    await expect(page.getByTestId('provider-card')).toHaveCount(1);
    await expect(card.getByTestId('provider-no-phone')).toBeVisible();
    await card.getByTestId('provider-recommend').click();
    await expect(card.getByTestId('provider-recommendations')).toContainText('1 resident');
    await card.getByTestId('provider-report').click();
    const report = page.getByTestId('provider-report-drawer');
    await box(report, 'provider-report-reason').fill('Left paint stains on the stairs.');
    await report.getByTestId('provider-report-submit').click();
    await expect(report).toHaveCount(0);
    await expect(card).toContainText('You reported a problem');

    // The office acts on reports: suspending removes it from residents at once.
    await office(page, 'alnoor_manager', '/backoffice/community/services?status=reports', 'provider-list');
    await page.getByTestId('provider-row').filter({ hasText: 'Sparkle Home Cleaning' }).click();
    await page.getByTestId('provider-drawer').getByTestId('provider-suspend').click();
    await confirm(page, /^Suspend$/, 'Suspended while the office checks the complaint.');
    await resident(page, 'alnoor_tenant_a102', '/customer/portal/community?tab=services', 'services-list');
    await expect(page.getByTestId('provider-card').filter({ hasText: 'Sparkle Home Cleaning' })).toHaveCount(0);
    await expect(page.getByTestId('provider-card').filter({ hasText: 'QuickFix Pest Control' })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('Imran publishes a document to owners; a tenant never sees it; Kamran downloads it; it is withdrawn with a reason', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, 'alnoor_manager', '/backoffice/doc/document-center', 'resource-rows');
    await axe(page, testInfo, 'resources-office-1440-en');
    await page.getByTestId('resource-new').click();
    const drawer = page.getByTestId('resource-drawer');
    await box(drawer, 'resource-title').fill('Parking rules for owners');
    await choose(page, drawer, 'resource-category', 'Guide');
    await drawer.getByTestId('resource-sample').click();
    await drawer.getByTestId('resource-audience-role-occupant').click();
    await drawer.getByTestId('resource-audience-role-payer').click();
    await drawer.getByTestId('resource-publish').click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByTestId('resource-row').filter({ hasText: 'Parking rules for owners' })).toHaveAttribute('data-state', 'published');

    await resident(page, 'alnoor_tenant_a102', '/customer/portal/community?tab=resources', 'resources-list');
    await expect(page.getByTestId('resource-card').filter({ hasText: 'Parking rules for owners' })).toHaveCount(0);
    await resident(page, 'alnoor_resident_a101', '/customer/portal/community?tab=resources', 'resources-list');
    const card = page.getByTestId('resource-card').filter({ hasText: 'Parking rules for owners' });
    const download = page.waitForEvent('download');
    await card.getByTestId('resource-download').click();
    expect((await download).suggestedFilename()).toBe('demo-document-demo.txt');
    await axe(page, testInfo, 'community-resources-1440-en');

    await office(page, 'alnoor_manager', '/backoffice/doc/document-center', 'resource-rows');
    await page.getByTestId('resource-row').filter({ hasText: 'Parking rules for owners' }).getByTestId('resource-withdraw').click();
    await confirm(page, /^Withdraw$/, 'Replaced by the new rules.');
    await resident(page, 'alnoor_resident_a101', '/customer/portal/community?tab=resources', 'resources-list');
    await expect(page.getByTestId('resource-card').filter({ hasText: 'Parking rules for owners' })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('D.3 without the add-ons (both withdrawn for the site)', () => {
  test('official notices keep working; the Community home keeps only notices; chat and hub are refused in both apps', async ({ page, consoleErrors }) => {
    // Prototype seam: the demo withdraws both add-ons in this browser (it can never grant one).
    await page.addInitScript(() => sessionStorage.setItem('demo:withdrawn-modules', JSON.stringify(['community_chat', 'community_hub'])));
    await seedSociety(page, { staff: 'alnoor_manager' });
    await resident(page, 'alnoor_resident_a101', '/customer/portal/community', 'community-home');
    await expect(page.getByTestId('community-home')).toHaveAttribute('data-tabs', 'notices');
    await expect(page.getByTestId('community-chat-card')).toHaveCount(0);
    await expect(page.getByTestId('community-notice').first()).toBeVisible();
    await page.getByTestId('community-all-notices').click();
    await expect(page.getByTestId('notice-list')).toBeVisible();
    await page.getByTestId('notice-card').first().click();
    await expect(page.getByTestId('notice-detail')).toBeVisible();
    await page.goto(`${CU}/customer/portal/chat`);
    await expect(page.getByTestId('chat-unavailable')).toContainText('Not part of');
    for (const path of ['/portal/community/polls', '/portal/community/services', '/portal/community/resources']) expect((await api(page, path)).ok, path).toBe(false);

    await office(page, 'alnoor_manager', '/backoffice/res/community-announcements', 'notices-office');
    await expect(page.getByTestId('notices-chat-admin')).toHaveCount(0);
    for (const label of ['Community chat', 'Chat groups & reports', 'Local services', 'Polls', 'Documents for residents']) await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
    await page.goto(`${BO}/backoffice/community/polls`);
    await expect(page.getByTestId('polls-office')).toHaveCount(0);
    expect((await api(page, '/ops/chat/groups')).ok).toBe(false);
    expect(consoleErrors).toEqual([]);
  });
});

const OFFICE_SCREENS: Array<[string, string, string]> = [
  ['chat-inbox', '/backoffice/chat/site', 'chat-conversation'],
  ['chat-groups', '/backoffice/chat/settings', 'chat-smart-groups'],
  ['chat-custom', '/backoffice/chat/settings?tab=custom', 'chat-custom-groups'],
  ['chat-reports', '/backoffice/chat/settings?tab=reports', 'report-list'],
  ['chat-policy', '/backoffice/chat/settings?tab=policy', 'chat-policy'],
  ['services', '/backoffice/community/services', 'provider-list'],
  ['polls', '/backoffice/community/polls', 'poll-rows'],
  ['poll-detail', '/backoffice/community/polls/pol_anr_0002', 'poll-detail'],
  ['resources', '/backoffice/doc/document-center', 'resource-rows'],
];

const RESIDENT_SCREENS: Array<[string, string, string]> = [
  ['community', '/customer/portal/community', 'community-notices'],
  ['community-polls', '/customer/portal/community?tab=polls', 'poll-list'],
  ['community-services', '/customer/portal/community?tab=services', 'services-list'],
  ['community-resources', '/customer/portal/community?tab=resources', 'resources-list'],
  ['chat-list', '/customer/portal/chat', 'chat-groups'],
  ['chat-conversation', '/customer/portal/chat/site', 'chat-conversation'],
];

for (const locale of ['en-PK', 'ur-PK'] as const) {
  test.describe(`D.3 screens in ${locale}: axe at 1440, 768 and 390 px, no sideways scroll`, () => {
    test(`office screens (${locale})`, async ({ page, consoleErrors }, testInfo) => {
      test.setTimeout(240_000);
      await seedSociety(page, { staff: 'alnoor_manager', locale });
      await become(page, 'backoffice', 'alnoor_manager');
      for (const [name, path, ready] of OFFICE_SCREENS) {
        for (const [vp, size] of [['1440', VIEWPORTS.desktop], ['768', VIEWPORTS.tablet], ['390', VIEWPORTS.phone]] as const) {
          await page.setViewportSize(size);
          await page.goto(`${BO}${path}`);
          await expect(page.getByTestId(ready).first()).toBeVisible();
          await axe(page, testInfo, `${name}-${vp}-${locale}`);
          expect(await overflowOf(page), `${name} ${vp} ${locale}`).toBeLessThanOrEqual(0);
        }
      }
      expect(consoleErrors).toEqual([]);
    });

    test(`resident screens (${locale})`, async ({ page, consoleErrors }, testInfo) => {
      test.setTimeout(240_000);
      await seedSociety(page, { locale });
      await become(page, 'customer', 'alnoor_resident_a101');
      for (const [name, path, ready] of RESIDENT_SCREENS) {
        for (const [vp, size] of [['1440', VIEWPORTS.desktop], ['768', VIEWPORTS.tablet], ['390', VIEWPORTS.phone]] as const) {
          await page.setViewportSize(size);
          await page.goto(`${CU}${path}`);
          await expect(page.getByTestId(ready).first()).toBeVisible();
          await axe(page, testInfo, `portal-${name}-${vp}-${locale}`);
          expect(await overflowOf(page), `${name} ${vp} ${locale}`).toBeLessThanOrEqual(0);
        }
      }
      expect(consoleErrors).toEqual([]);
    });
  });
}

const lang = (locale: Locale) => (locale === 'ur-PK' ? 'ur' : 'en');

for (const locale of ['en-PK', 'ur-PK'] as const) {
  for (const scale of [1, 1.5, 2] as const) {
    test(`320 × 700, ${lang(locale)}, text ${scale * 100} %: Community home, chat and the poll drawer are not clipped, spilled or broken mid-word`, async ({ page, consoleErrors }) => {
      test.setTimeout(150_000);
      await page.setViewportSize(PHONE);
      await seedSociety(page, { locale, textScale: scale });
      for (const [name, path, ready] of RESIDENT_SCREENS) {
        await page.goto(`${CU}${path}`);
        await expect(page.getByTestId(ready).first()).toBeVisible();
        await settle(page);
        // The person's text size is applied as chosen (never reduced to make a layout fit).
        expect(await page.locator('main').evaluate((m) => parseFloat(getComputedStyle(m).fontSize))).toBe(16 * scale);
        expect(await layoutProblems(page), `${name} ${lang(locale)} ${scale * 100} %`).toEqual([]);
      }
      // The answer drawer of an open poll.
      await page.goto(`${CU}/customer/portal/community?tab=polls`);
      await page.getByTestId('poll-answer').first().click();
      await expect(page.getByTestId('poll-drawer')).toBeVisible();
      await settle(page);
      expect(await layoutProblems(page.getByTestId('poll-drawer')), `poll drawer ${lang(locale)} ${scale * 100} %`).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  }

  test(`320 × 700, ${lang(locale)}, 200 %: the keyboard reaches every control of the chat and the Community home without the header or bar covering it`, async ({ page, consoleErrors }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(PHONE);
    await seedSociety(page, { locale, textScale: 2 });
    for (const [name, path, ready] of [['community', '/customer/portal/community', 'community-notices'], ['chat', '/customer/portal/chat/site', 'chat-conversation']] as const) {
      await page.goto(`${CU}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      await settle(page);
      const stops = await focusWalk(page, { header: HEADER, bar: BAR, max: 60 });
      expect(stops.length, `${name}: controls reached`).toBeGreaterThan(2);
      expect(stops.filter((s) => s.issue), `${name} ${lang(locale)}`).toEqual([]);
      // Scrolled to the end, the page's last content sits above the bar.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const gap = await page.evaluate((bar) => {
        const content = document.querySelector('main')!.firstElementChild!.getBoundingClientRect();
        const nav = document.querySelector(bar)!;
        const top = Math.min(...[nav, ...nav.querySelectorAll('*')].map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0).map((r) => r.top));
        return top - content.bottom;
      }, BAR);
      expect(gap, `${name}: last content above the bar`).toBeGreaterThanOrEqual(0);
    }
    expect(consoleErrors).toEqual([]);
  });
}
