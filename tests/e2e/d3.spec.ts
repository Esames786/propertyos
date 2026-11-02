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

/**
 * Issue #9: a message older than the retention period with an open report about it, put into the
 * shared demo as the office app keeps it (the seeds are all recent). Call on an office page after the
 * community state exists.
 */
async function injectExpiredReport(page: Page) {
  // The community state is stored on its first change: mark the office's group read first.
  await societyApi(page, '/ops/chat/groups/site/read', 'POST');
  await page.evaluate(() => {
    const key = 'demo:shared:tnt_alnoor';
    const overlay = JSON.parse(localStorage.getItem(key)!) as { sections: Record<string, { chat: { messages: unknown[]; reports: unknown[] } }> };
    const s = overlay.sections['community:site_alnoor']!;
    s.chat.messages.push({ id: 'msg_expired', groupId: 'site', senderKind: 'resident', senderName: 'Hina Iqbal', partyId: 'pty_anr_0005', text: 'An old complaint kept as evidence', at: '2025-09-01T10:00:00Z' });
    s.chat.reports.push({ id: 'crp_expired', ref: 'ANR-CR-0090', messageId: 'msg_expired', groupId: 'site', state: 'open', reports: [{ by: 'pty_anr_0001', reason: 'abusive', note: 'Threatening', at: '2025-09-01T11:00:00Z' }], history: [] });
    localStorage.setItem(key, JSON.stringify(overlay));
  });
}

test.describe('D.3 Issue #9: retention ends visibility; an open report keeps evidence for moderators only', () => {
  test('an expired message under an open report is in no chat, is evidence in the report queue, and is not shown again once decided', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_manager' });
    await office(page, 'alnoor_manager', '/backoffice/chat/settings?tab=reports', 'report-list');
    await injectExpiredReport(page);
    await page.reload();
    const card = page.getByTestId('report-card').filter({ hasText: 'ANR-CR-0090' });
    await expect(card).toContainText('An old complaint kept as evidence');
    await expect(card.getByTestId('report-evidence-hold')).toBeVisible();
    await axe(page, testInfo, 'chat-report-evidence-hold-1440-en');
    // Not in the office's conversation, nor a resident's.
    await page.goto(`${BO}/backoffice/chat/site`);
    await expect(page.getByTestId('chat-log')).toBeVisible();
    await expect(page.getByTestId('chat-log')).not.toContainText('An old complaint');
    await resident(page, 'alnoor_resident_a101', '/customer/portal/chat/site', 'chat-conversation');
    await expect(page.getByTestId('chat-log')).not.toContainText('An old complaint');
    await expect(page.getByTestId('chat-groups')).not.toContainText('An old complaint');
    // The policy page counts it as held for the moderators only.
    await office(page, 'alnoor_manager', '/backoffice/chat/settings?tab=policy', 'chat-policy');
    await expect(page.getByTestId('chat-policy')).toContainText('1 reported message is past the period');
    // Decided: the text is not shown again; the decision stays.
    await page.goto(`${BO}/backoffice/chat/settings?tab=reports`);
    await page.getByTestId('report-card').filter({ hasText: 'ANR-CR-0090' }).getByTestId('report-dismiss').click();
    await confirm(page, /^Dismiss$/, 'Checked; no action needed.');
    await page.getByTestId('reports-status').getByText('Decided').click();
    const decided = page.getByTestId('report-card').filter({ hasText: 'ANR-CR-0090' });
    await expect(decided.getByTestId('report-text-gone')).toBeVisible();
    await expect(decided).not.toContainText('An old complaint');
    await expect(decided).toContainText('Checked; no action needed.');
    expect(consoleErrors).toEqual([]);
  });
});

/**
 * Issue #10: the published patrol poll with a large society's answers (the seed has two blocks): X at
 * 2–1 and `count` − 1 blocks at 3–3, 20 households each, put into the shared demo as the office app
 * keeps it. Call on an office page.
 */
async function injectManyBlocks(page: Page, count: number) {
  await societyApi(page, '/ops/chat/groups/site/read', 'POST');
  await page.evaluate((n) => {
    const key = 'demo:shared:tnt_alnoor';
    type Poll = { title: string; tally: Record<string, Record<string, number>>; audienceAtClose?: { site: number; blocks: Record<string, number> } };
    const overlay = JSON.parse(localStorage.getItem(key)!) as { sections: Record<string, { polls: Poll[] }> };
    const poll = overlay.sections['community:site_alnoor']!.polls.find((p) => p.title.startsWith('Evening security patrol'))!;
    poll.tally = { X: { opt_1: 2, opt_2: 1 } };
    poll.audienceAtClose = { site: 20 * n, blocks: { X: 20 } };
    for (let b = 1; b < n; b++) {
      const code = `B${String(b).padStart(3, '0')}`;
      poll.tally[code] = { opt_1: 3, opt_2: 3 };
      poll.audienceAtClose.blocks[code] = 20;
    }
    localStorage.setItem(key, JSON.stringify(overlay));
  }, count);
}

test.describe('D.3 Issue #10: block results for a large society', () => {
  test('128 blocks: the resident (320 px, 200 % text) and the office see 126 block lines, never X; the results stay quick', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_manager', resident: 'alnoor_resident_a101', textScale: 2 });
    await office(page, 'alnoor_manager', '/backoffice/community/polls', 'polls-office');
    await injectManyBlocks(page, 128);
    const list = await api<{ items: Array<{ id: string; title: string }> }>(page, '/ops/community/polls', 'GET', {}, { status: 'closed' });
    const pollId = list.ok ? list.res.items.find((p) => p.title.startsWith('Evening security patrol'))!.id : '';

    await page.setViewportSize(PHONE);
    await become(page, 'customer', 'alnoor_resident_a101');
    const started = Date.now();
    await page.goto(`${CU}/customer/portal/community?tab=polls`);
    const results = page.getByTestId('poll-card').filter({ hasText: 'Evening security patrol' }).getByTestId('poll-results');
    await expect(results).toHaveAttribute('data-shown', 'true');
    const residentMs = Date.now() - started;
    await expect(results).toContainText('765 answers');
    await results.locator('summary').click();
    const lines = results.locator('details li');
    await expect(lines).toHaveCount(126);
    const texts = await lines.allTextContents();
    // X (2–1) is never a line of its own; the one 3–3 block hidden with it is B001.
    expect(texts.filter((t) => /^Block (X|B001),/.test(t))).toEqual([]);
    expect(await overflowOf(page)).toBe(0);
    await axe(page, testInfo, 'poll-results-128-blocks-320x700-200pct-en');

    await page.setViewportSize(VIEWPORTS.desktop);
    await become(page, 'backoffice', 'alnoor_manager');
    await page.goto(`${BO}/backoffice/community/polls/${pollId}`);
    const published = page.getByTestId('poll-published');
    await expect(published).toHaveAttribute('data-shown', 'true');
    await expect(published).toContainText('765 answers');
    const codes = ((await published.locator('p').last().textContent()) ?? '').replace(/^.*?:\s*/, '').split(', ');
    expect(codes).toHaveLength(126);
    expect(codes).not.toContain('X');
    expect(codes).not.toContain('B001');
    // The office's totals for an anonymous poll are the residents' figures (127 × 3 + 2 and 127 × 3 + 1).
    await expect(page.getByTestId('poll-totals').locator('li')).toHaveText([/Yes\s*383 answers/, /No\s*382 answers/]);
    testInfo.annotations.push({ type: 'timing', description: `resident results for 128 blocks visible ${residentMs} ms after navigation` });
    expect(residentMs).toBeLessThan(15_000);
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
    // Anonymous and split 2–1: even the office sees no breakdown (Issue #9), only the turnout.
    await expect(page.getByTestId('poll-totals-withheld')).toContainText('3 answers');
    await expect(page.getByTestId('poll-totals')).toHaveCount(0);
    await page.getByTestId('poll-publish').click();
    await confirm(page, /Publish results/);
    await expect(page.getByTestId('poll-published')).toHaveAttribute('data-shown', 'withheld');
    await axe(page, testInfo, 'poll-detail-1440-en');

    await resident(page, 'alnoor_tenant_a102', '/customer/portal/community?tab=polls', 'poll-list');
    const results = page.getByTestId('poll-card').filter({ hasText: 'Car wash bay' }).getByTestId('poll-results');
    await expect(results).toHaveAttribute('data-shown', 'withheld');
    await expect(results).toContainText('3 answers in total');
    await expect(results.getByTestId('poll-withheld')).toContainText('withheld for privacy');
    // No option label with a count or a share, no bar: nothing to work the 1 out from.
    await expect(results).not.toContainText('%');
    await expect(results.locator('li')).toHaveCount(0);
    // The published gym poll (31 answers, safe) shows its breakdown; the 5–1 patrol poll its turnout only.
    await expect(page.getByTestId('poll-card').filter({ hasText: 'Gym opening hours' }).getByTestId('poll-results')).toHaveAttribute('data-shown', 'true');
    await expect(page.getByTestId('poll-card').filter({ hasText: 'Gym opening hours' }).getByTestId('poll-results')).toContainText('31 answers');
    await expect(page.getByTestId('poll-card').filter({ hasText: 'Evening security patrol' }).getByTestId('poll-results')).toHaveAttribute('data-shown', 'withheld');
    await axe(page, testInfo, 'community-polls-1440-en');
    expect(consoleErrors).toEqual([]);
  });

  test('a named poll says the office will see the name and answer, and is answered only after agreeing', async ({ page, consoleErrors }, testInfo) => {
    await seedSociety(page, { staff: 'alnoor_manager' });
    await become(page, 'backoffice', 'alnoor_manager');
    await page.goto(`${BO}/backoffice/community/polls`);
    await expect(page.getByTestId('polls-office')).toBeVisible();
    const draft = await api<{ id: string }>(page, '/ops/community/polls', 'POST', { title: 'Lobby repaint colour', question: 'Which colour should the Block A lobby be repainted?', options: ['Cream', 'Sage'], audience: { scope: 'blocks', ids: ['bld_anr_a'], roles: ['occupant'] }, unit: 'person', anonymous: false, closesOn: '2026-11-10' });
    expect(draft.ok).toBe(true);
    expect((await api(page, `/ops/community/polls/${draft.ok ? draft.res.id : ''}/open`, 'POST')).ok).toBe(true);
    await resident(page, 'alnoor_tenant_a102', '/customer/portal/community?tab=polls', 'poll-list');
    await page.getByTestId('poll-card').filter({ hasText: 'Lobby repaint colour' }).getByTestId('poll-answer').click();
    const drawer = page.getByTestId('poll-drawer');
    await drawer.getByTestId('poll-option-opt_2').click();
    await expect(drawer.getByTestId('poll-named-warning')).toContainText('will see your name');
    await expect(drawer.getByTestId('poll-submit')).toBeDisabled();
    await axe(page, testInfo, 'poll-named-drawer-1440-en');
    await drawer.getByTestId('poll-named-consent').click();
    await drawer.getByTestId('poll-submit').click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByTestId('poll-card').filter({ hasText: 'Lobby repaint colour' }).getByTestId('poll-answered')).toContainText('Sage');
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
  test(`dark mode, then high contrast (${lang(locale)}, 390 px): the D.3 screens pass axe with nothing clipped or spilled`, async ({ page, consoleErrors }, testInfo) => {
    test.setTimeout(240_000);
    await page.setViewportSize(VIEWPORTS.phone);
    await seedSociety(page, { locale, staff: 'alnoor_manager' });
    const html = (name: string) => page.evaluate((n) => document.documentElement.getAttribute(n), name);
    // Set through the person's own settings, as a resident would (the hub is shared by both apps).
    await resident(page, 'alnoor_resident_a101', '/customer/portal/accessibility-preferences', 'hub-theme');
    await page.getByTestId('hub-theme-dark').click();
    await expect.poll(() => html('data-theme')).toBe('dark');
    for (const mode of ['dark', 'dark-contrast'] as const) {
      if (mode === 'dark-contrast') {
        await page.goto(`${CU}/customer/portal/accessibility-preferences`);
        await page.getByTestId('hub-contrast-high').click();
        await expect.poll(() => html('data-contrast')).toBe('high');
      }
      for (const [name, path, ready] of [...RESIDENT_SCREENS, ['patrol-withheld', '/customer/portal/community?tab=polls', 'poll-list']] as const) {
        await page.goto(`${CU}${path}`);
        await expect(page.getByTestId(ready).first()).toBeVisible();
        await settle(page);
        await axe(page, testInfo, `portal-${name}-390-${mode}-${locale}`);
        expect(await layoutProblems(page), `${name} ${mode} ${lang(locale)}`).toEqual([]);
      }
    }
    // The office's reports queue and a poll in dark mode with high contrast.
    await become(page, 'backoffice', 'alnoor_manager');
    await page.goto(`${BO}/backoffice/global/accessibility-preferences`);
    await expect(page.getByTestId('hub-theme')).toBeVisible();
    await page.getByTestId('hub-theme-dark').click();
    await page.getByTestId('hub-contrast-high').click();
    await expect.poll(() => html('data-contrast')).toBe('high');
    for (const [name, path, ready] of OFFICE_SCREENS.filter(([n]) => ['chat-reports', 'poll-detail', 'chat-policy'].includes(n))) {
      await page.goto(`${BO}${path}`);
      await expect(page.getByTestId(ready).first()).toBeVisible();
      await axe(page, testInfo, `${name}-390-dark-contrast-${locale}`);
      expect(await overflowOf(page), `${name} ${lang(locale)}`).toBeLessThanOrEqual(0);
    }
    expect(consoleErrors).toEqual([]);
  });
}

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
