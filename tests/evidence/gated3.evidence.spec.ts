import { copyFileSync, mkdirSync } from 'node:fs';
import type { Browser, Locator, Page } from '@playwright/test';
import { BO, CU, test, type Locale, type PersonaId } from '../support/fixtures';
import { become, seedSociety, societyApi, type SocietySeed } from '../support/society';
import { VIEWPORTS, type ViewportName } from '../support/viewports';

/**
 * Gate D.3 evidence (community chat and moderation, the Community home with polls, local services and
 * resources, the office's groups, policy, directory, polls and published documents; phones in both
 * languages, 320 px with 200 % text; the add-ons withdrawn; a move-out while offline) →
 * docs/status/gate-d3/{screenshots,video}. Run on its own against production builds:
 * `E2E_PORT_OFFSET=300 npx playwright test --project=evidence tests/evidence/gated3.evidence.spec.ts --output=test-results-d3/evidence`.
 */
const DIR = 'docs/status/gate-d3/screenshots';
const VIDEO = 'docs/status/gate-d3/video';
const RAW = 'test-results-d3/gated3-video';
const lang = (l: Locale) => (l === 'ur-PK' ? 'ur' : 'en');

async function settle(page: Page, ms = 600) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(ms);
}

async function open(page: Page, origin: string, path: string, ready: string) {
  await page.goto(`${origin}${path}`);
  await page.getByTestId(ready).first().waitFor();
  await settle(page);
}

async function as(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'backoffice', persona);
  await open(page, BO, path, ready);
}

async function resident(page: Page, persona: PersonaId, path: string, ready: string) {
  await become(page, 'customer', persona);
  await open(page, CU, path, ready);
}

async function context(browser: Browser, viewport: { width: number; height: number }, society: SocietySeed, video = false) {
  const ctx = await browser.newContext({ viewport, ...(video ? { recordVideo: { dir: RAW, size: viewport } } : {}) });
  const page = await ctx.newPage();
  await seedSociety(page, society);
  return page;
}

const shot = (page: Page, name: string, full = true) => page.screenshot({ path: `${DIR}/${name}.png`, fullPage: full });
/** The fixed header and bottom bar would be drawn over a tall element's capture (as in D.2's evidence). */
const CHROME_HIDDEN = '[data-testid="portal-header"], [data-testid="portal-bottom-nav"] { visibility: hidden !important; }';
const shotOf = (locator: Locator, name: string) => locator.screenshot({ path: `${DIR}/${name}.png`, style: CHROME_HIDDEN });

async function keepVideo(page: Page, name: string) {
  const video = page.video();
  await page.context().close();
  if (!video) return;
  mkdirSync(VIDEO, { recursive: true });
  copyFileSync(await video.path(), `${VIDEO}/${name}.webm`);
}

const box = (scope: Page | Locator, testId: string) => scope.locator(`:is(input, textarea)[data-testid="${testId}"], [data-testid="${testId}"] :is(input, textarea)`).first();

test.describe.configure({ mode: 'parallel' });

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  const vp: ViewportName = locale === 'ur-PK' ? 'phone' : 'desktop';
  const w = VIEWPORTS[vp].width;
  const l = lang(locale);

  test(`resident: Community home, chat, polls, services, resources (${w}, ${l})`, async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await context(browser, VIEWPORTS[vp], { locale, staff: 'alnoor_manager' });
    await resident(page, 'alnoor_resident_a101', '/customer/portal/community', 'community-notices');
    await shot(page, `a01-community-home-${w}-${l}`);
    await open(page, CU, '/customer/portal/community?tab=polls', 'poll-list');
    await shot(page, `a02-community-polls-${w}-${l}`);
    await page.getByTestId('poll-answer').first().click();
    await page.getByTestId('poll-drawer').waitFor();
    await page.getByTestId('poll-option-opt_2').click();
    await settle(page, 400);
    await shot(page, `a03-poll-answer-drawer-${w}-${l}`, false);
    await page.keyboard.press('Escape');
    await open(page, CU, '/customer/portal/community?tab=services', 'services-list');
    await shot(page, `a04-community-services-${w}-${l}`);
    await page.getByTestId('provider-report').first().click();
    await page.getByTestId('provider-report-drawer').waitFor();
    await settle(page, 400);
    await shot(page, `a05-provider-report-drawer-${w}-${l}`, false);
    await page.keyboard.press('Escape');
    await open(page, CU, '/customer/portal/community?tab=resources', 'resources-list');
    await shot(page, `a06-community-resources-${w}-${l}`);
    await open(page, CU, '/customer/portal/chat', 'chat-groups');
    await shot(page, `a07-chat-groups-${w}-${l}`);
    await open(page, CU, '/customer/portal/chat/site', 'chat-conversation');
    await shot(page, `a08-chat-whole-community-${w}-${l}`);
    await page.getByTestId('chat-message').filter({ hasText: /Cheap phones/ }).getByTestId('chat-message-menu').click();
    await page.getByTestId('chat-report').click();
    await page.getByTestId('chat-report-reason-spam').click();
    await settle(page, 400);
    await shot(page, `a09-chat-report-drawer-${w}-${l}`, false);
    await page.keyboard.press('Escape');
    await page.getByTestId('chat-group-info').click();
    await page.getByTestId('chat-info-drawer').waitFor();
    await settle(page, 400);
    await shot(page, `a10-chat-about-group-${w}-${l}`, false);
    await page.context().close();
  });

  test(`office: chat inbox, groups, reports, policy, services, polls, documents (${w}, ${l})`, async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await context(browser, VIEWPORTS[vp], { locale, staff: 'alnoor_manager' });
    await as(page, 'alnoor_manager', '/backoffice/chat/site', 'chat-conversation');
    await shot(page, `b01-office-chat-inbox-${w}-${l}`);
    await open(page, BO, '/backoffice/chat/settings', 'chat-smart-groups');
    await shot(page, `b02-chat-smart-groups-${w}-${l}`);
    await page.getByTestId('chat-rule').and(page.locator('[data-group="committee"]')).getByTestId('rule-preview').click();
    await page.getByTestId('chat-preview-members').waitFor();
    await settle(page, 400);
    await shot(page, `b03-chat-who-is-in-committee-${w}-${l}`, false);
    await page.keyboard.press('Escape');
    await open(page, BO, '/backoffice/chat/settings?tab=custom', 'chat-custom-groups');
    await page.getByTestId('custom-new').click();
    await page.getByTestId('custom-drawer').waitFor();
    await box(page.getByTestId('custom-drawer'), 'custom-name').fill(locale === 'ur-PK' ? 'بلاک A کے مالکان' : 'Block A owners');
    await settle(page, 400);
    await shot(page, `b04-chat-new-custom-group-${w}-${l}`, false);
    await page.keyboard.press('Escape');
    await open(page, BO, '/backoffice/chat/settings?tab=reports', 'report-list');
    await shot(page, `b05-chat-reports-queue-${w}-${l}`);
    await open(page, BO, '/backoffice/chat/settings?tab=policy', 'chat-policy');
    await shot(page, `b06-chat-retention-policy-${w}-${l}`);
    await open(page, BO, '/backoffice/community/services', 'provider-list');
    await shot(page, `b07-local-services-${w}-${l}`);
    await open(page, BO, '/backoffice/community/services?status=reports', 'provider-list');
    await page.getByTestId('provider-row').first().click();
    await page.getByTestId('provider-drawer').waitFor();
    await settle(page, 400);
    await shot(page, `b08-provider-with-report-${w}-${l}`, false);
    await page.keyboard.press('Escape');
    await page.getByTestId('provider-add').click();
    await page.getByTestId('provider-add-drawer').waitFor();
    await settle(page, 400);
    await shot(page, `b09-provider-add-consent-${w}-${l}`, false);
    await page.keyboard.press('Escape');
    await open(page, BO, '/backoffice/community/polls', 'poll-rows');
    await shot(page, `b10-polls-open-${w}-${l}`);
    await open(page, BO, '/backoffice/community/polls/pol_anr_0001', 'poll-detail');
    await shot(page, `b11-poll-open-turnout-only-${w}-${l}`);
    await open(page, BO, '/backoffice/community/polls/pol_anr_0002', 'poll-detail');
    await shot(page, `b12-poll-published-results-${w}-${l}`);
    await open(page, BO, '/backoffice/community/polls/pol_anr_0003', 'poll-detail');
    await shot(page, `b17-poll-anonymous-withheld-${w}-${l}`);
    await open(page, BO, '/backoffice/community/polls/pol_anr_0004', 'poll-detail');
    await shot(page, `b13-poll-closed-named-${w}-${l}`);
    await open(page, BO, '/backoffice/community/polls', 'poll-rows');
    await page.getByTestId('poll-new').click();
    await page.getByTestId('poll-editor').waitFor();
    await settle(page, 400);
    await shot(page, `b14-poll-editor-${w}-${l}`, false);
    await page.keyboard.press('Escape');
    await open(page, BO, '/backoffice/doc/document-center', 'resource-rows');
    await shot(page, `b15-documents-for-residents-${w}-${l}`);
    await page.getByTestId('resource-new').click();
    await page.getByTestId('resource-drawer').waitFor();
    await settle(page, 400);
    await shot(page, `b16-publish-to-residents-${w}-${l}`, false);
    await page.context().close();
  });
}

test('320 × 700, Urdu, 200 % text: Community home, polls, chat (viewport captures, fixed bars in place)', async ({ browser }) => {
  test.setTimeout(150_000);
  const page = await context(browser, { width: 320, height: 700 }, { locale: 'ur-PK', textScale: 2 });
  for (const [name, path, ready, focus] of [
    ['c01-community-home', '/customer/portal/community', 'community-notices', null],
    ['c02-community-polls', '/customer/portal/community?tab=polls', 'poll-list', 'poll-list'],
    ['c03-community-services', '/customer/portal/community?tab=services', 'services-list', 'services-list'],
    ['c04-chat-groups', '/customer/portal/chat', 'chat-groups', 'chat-groups'],
    ['c05-chat-conversation', '/customer/portal/chat/site', 'chat-conversation', 'chat-conversation'],
  ] as const) {
    await open(page, CU, path, ready);
    // A viewport capture of what the shot is about, just under the sticky header.
    if (focus)
      await page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`)!;
        const header = document.querySelector('[data-testid="portal-header"]')?.getBoundingClientRect().bottom ?? 0;
        window.scrollBy(0, el.getBoundingClientRect().top - header - 8);
      }, focus);
    await settle(page, 300);
    await shot(page, `${name}-320x700-200pct-ur`, false);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await settle(page, 300);
  await shot(page, 'c06-chat-composer-above-bar-320x700-200pct-ur', false);
  await open(page, CU, '/customer/portal/community?tab=polls', 'poll-list');
  await page.getByTestId('poll-answer').first().click();
  await page.getByTestId('poll-drawer').waitFor();
  await settle(page, 400);
  await shot(page, 'c07-poll-drawer-320x700-200pct-ur', false);
  await page.keyboard.press('Escape');
  await open(page, CU, '/customer/portal/community?tab=polls', 'poll-list');
  await shotOf(page.getByTestId('poll-card').filter({ hasText: 'Gym' }), 'c08-poll-results-card-320x700-200pct-ur');
  await page.context().close();
});

for (const locale of ['en-PK', 'ur-PK'] as Locale[]) {
  test(`Issue #9: poll results at 320 × 700 with 200 % text, shown and withheld (${lang(locale)})`, async ({ browser }) => {
    const page = await context(browser, { width: 320, height: 700 }, { locale, textScale: 2 });
    await open(page, CU, '/customer/portal/community?tab=polls', 'poll-list');
    await shotOf(page.getByTestId('poll-card').filter({ hasText: 'Gym' }), `f01-poll-results-shown-320x700-200pct-${lang(locale)}`);
    await shotOf(page.getByTestId('poll-card').filter({ hasText: 'Evening security patrol' }), `f02-poll-results-withheld-320x700-200pct-${lang(locale)}`);
    await page.context().close();
  });
}

test('Issue #10: the 33-block counterexample, for the resident (390, en) and the office (1440, en): 31 block lines, X never on its own', async ({ browser }) => {
  const page = await context(browser, VIEWPORTS.phone, { staff: 'alnoor_manager' });
  await as(page, 'alnoor_manager', '/backoffice/community/polls', 'polls-office');
  // The published patrol poll given the counterexample's answers: 32 blocks at 3–3, X at 2–1, 20 households each.
  await societyApi(page, '/ops/chat/groups/site/read', 'POST');
  await page.evaluate(() => {
    const key = 'demo:shared:tnt_alnoor';
    type Poll = { title: string; tally: Record<string, Record<string, number>>; audienceAtClose?: { site: number; blocks: Record<string, number> } };
    const overlay = JSON.parse(localStorage.getItem(key)!) as { sections: Record<string, { polls: Poll[] }> };
    const poll = overlay.sections['community:site_alnoor']!.polls.find((p) => p.title.startsWith('Evening security patrol'))!;
    poll.tally = { X: { opt_1: 2, opt_2: 1 } };
    poll.audienceAtClose = { site: 660, blocks: { X: 20 } };
    for (let b = 1; b <= 32; b++) {
      poll.tally[`B${String(b).padStart(3, '0')}`] = { opt_1: 3, opt_2: 3 };
      poll.audienceAtClose.blocks[`B${String(b).padStart(3, '0')}`] = 20;
    }
    localStorage.setItem(key, JSON.stringify(overlay));
  });
  const list = await societyApi<{ items: Array<{ id: string; title: string }> }>(page, '/ops/community/polls', 'GET', {}, { status: 'closed' });
  const pollId = list.ok ? list.res.items.find((p) => p.title.startsWith('Evening security patrol'))!.id : '';
  await resident(page, 'alnoor_resident_a101', '/customer/portal/community?tab=polls', 'poll-list');
  const card = page.getByTestId('poll-card').filter({ hasText: 'Evening security patrol' });
  await card.locator('summary').click();
  await shotOf(card, 'f03-poll-results-33-blocks-390-en');
  await page.setViewportSize(VIEWPORTS.desktop);
  await as(page, 'alnoor_manager', `/backoffice/community/polls/${pollId}`, 'poll-detail');
  await shotOf(page.getByTestId('poll-detail'), 'f04-poll-33-blocks-office-1440-en');
  await page.context().close();
});

test('Issue #9: an expired reported message is evidence in the report queue only, and its text is gone once decided (1440, en)', async ({ browser }) => {
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_manager' });
  await as(page, 'alnoor_manager', '/backoffice/chat/settings?tab=reports', 'report-list');
  // A message older than the retention period, reported and still open (the seeds are all recent).
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
  await open(page, BO, '/backoffice/chat/settings?tab=reports', 'report-list');
  await shotOf(page.getByTestId('report-card').filter({ hasText: 'ANR-CR-0090' }), 'g01-report-evidence-hold-1440-en');
  await open(page, BO, '/backoffice/chat/settings?tab=policy', 'chat-policy');
  await shot(page, 'g02-policy-held-as-evidence-1440-en');
  await open(page, BO, '/backoffice/chat/settings?tab=reports', 'report-list');
  await page.getByTestId('report-card').filter({ hasText: 'ANR-CR-0090' }).getByTestId('report-dismiss').click();
  await page.getByRole('alertdialog').locator('textarea').fill('Checked; no action needed.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Dismiss' }).click();
  await page.getByRole('alertdialog').waitFor({ state: 'detached' });
  await open(page, BO, '/backoffice/chat/settings?tab=reports&status=closed', 'report-list');
  await shotOf(page.getByTestId('report-card').filter({ hasText: 'ANR-CR-0090' }), 'g03-report-decided-text-gone-1440-en');
  await page.context().close();
});

test('without the add-ons: official notices still work; the Community home keeps notices only (1440, en)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const page = await ctx.newPage();
  await page.addInitScript(() => sessionStorage.setItem('demo:withdrawn-modules', JSON.stringify(['community_chat', 'community_hub'])));
  await seedSociety(page, { staff: 'alnoor_manager' });
  await resident(page, 'alnoor_resident_a101', '/customer/portal/community', 'community-notices');
  await shot(page, 'd01-no-addons-community-home-notices-only-1440-en');
  await open(page, CU, '/customer/portal/chat', 'chat-unavailable');
  await shot(page, 'd02-no-addons-chat-not-in-plan-1440-en');
  await open(page, CU, '/customer/portal/community-notices', 'notice-list');
  await shot(page, 'd03-no-addons-notices-still-work-1440-en');
  await as(page, 'alnoor_manager', '/backoffice/res/community-announcements', 'notices-office');
  await shot(page, 'd04-no-addons-office-notices-no-chat-menu-1440-en');
  await ctx.close();
});

test('move-out while offline: the queued message is refused on reconnect and the groups are gone (390, en)', async ({ browser }) => {
  const page = await context(browser, VIEWPORTS.phone, { resident: 'alnoor_tenant_a202', staff: 'alnoor_manager' });
  await resident(page, 'alnoor_tenant_a202', '/customer/portal/chat/block:bld_anr_a', 'chat-conversation');
  await page.getByTestId('chat-go-offline').click();
  await box(page, 'chat-input').fill('Written on the way home, sent later');
  await page.getByTestId('chat-send').click();
  await page.getByTestId('chat-queued').waitFor();
  await settle(page, 300);
  await shot(page, 'e01-offline-message-waiting-390-en');
  const office = await page.context().newPage();
  await become(office, 'backoffice', 'alnoor_manager');
  await office.goto(`${BO}/backoffice/home/role-aware-dashboard`);
  await office.locator('main').waitFor();
  await societyApi(office, '/ops/moves', 'POST', { flatId: 'unt_anr_a202', partyId: 'pty_anr_0011', effectiveOn: '2026-10-26', reason: 'Tenancy ended' });
  await office.close();
  await page.getByTestId('chat-go-online').click();
  await page.getByTestId('chat-rejected').waitFor();
  await settle(page, 300);
  await shot(page, 'e02-reconnect-refused-copy-removed-390-en');
  await open(page, CU, '/customer/portal/chat', 'chat-groups');
  await shot(page, 'e03-after-move-out-no-groups-390-en');
  await page.context().close();
});

test('video: a reported message is removed by a moderator; everyone sees the marker (desktop, en)', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_manager' }, true);
  await resident(page, 'alnoor_tenant_a102', '/customer/portal/chat/site', 'chat-conversation');
  const target = page.getByTestId('chat-message').filter({ hasText: 'The generator was very noisy' });
  await target.getByTestId('chat-message-menu').click();
  await page.getByTestId('chat-report').click();
  await page.getByTestId('chat-report-reason-off_topic').click();
  await box(page.getByTestId('chat-report-drawer'), 'chat-report-note').fill('Belongs in the community issues');
  await settle(page, 500);
  await page.getByTestId('chat-report-submit').click();
  await settle(page, 1000);
  await as(page, 'alnoor_manager', '/backoffice/chat/settings?tab=reports', 'report-list');
  await page.getByTestId('report-card').filter({ hasText: 'The generator was very noisy' }).getByTestId('report-hide').click();
  await page.getByRole('alertdialog').locator('textarea').fill('Moved to the community issues by the office.');
  await settle(page, 500);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove message' }).click();
  await settle(page, 1000);
  await resident(page, 'alnoor_resident_a101', '/customer/portal/chat/site', 'chat-conversation');
  await settle(page, 1500);
  await keepVideo(page, 'chat-report-and-moderation-desktop-en');
});

test('video: an informal poll from draft to published results (desktop, en)', async ({ browser }) => {
  test.setTimeout(150_000);
  const page = await context(browser, VIEWPORTS.desktop, { staff: 'alnoor_manager' }, true);
  await as(page, 'alnoor_manager', '/backoffice/community/polls', 'polls-office');
  await page.getByTestId('poll-new').click();
  const editor = page.getByTestId('poll-editor');
  await box(editor, 'poll-title').fill('Car wash bay');
  await box(editor, 'poll-question').fill('Should the society add a car wash bay in the basement?');
  await box(editor, 'poll-option-0').fill('Yes');
  await box(editor, 'poll-option-1').fill('No');
  await editor.getByTestId('poll-closes').fill('2026-11-20');
  await settle(page, 500);
  await editor.getByTestId('poll-save').click();
  await page.getByTestId('poll-open').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Open the poll' }).click();
  await settle(page, 800);
  const url = page.url();
  for (const [persona, option, flat] of [['alnoor_tenant_a102', 'opt_1', null], ['alnoor_resident_a101', 'opt_1', null], ['alnoor_owner_a201', 'opt_2', 'unt_anr_a201']] as const) {
    await resident(page, persona, '/customer/portal/community?tab=polls', 'poll-list');
    await page.getByTestId('poll-card').filter({ hasText: 'Car wash bay' }).getByTestId('poll-answer').click();
    const drawer = page.getByTestId('poll-drawer');
    if (flat) await drawer.getByTestId(`poll-flat-${flat}`).click();
    await drawer.getByTestId(`poll-option-${option}`).click();
    await settle(page, 400);
    await drawer.getByTestId('poll-submit').click();
    await settle(page, 600);
  }
  await become(page, 'backoffice', 'alnoor_manager');
  await page.goto(url);
  await page.getByTestId('poll-detail').waitFor();
  await settle(page, 800);
  await page.getByTestId('poll-close').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Close now' }).click();
  await settle(page, 800);
  await page.getByTestId('poll-publish').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Publish results' }).click();
  await settle(page, 1000);
  await resident(page, 'alnoor_tenant_a102', '/customer/portal/community?tab=polls', 'poll-list');
  await settle(page, 1500);
  await keepVideo(page, 'informal-poll-to-results-desktop-en');
});
