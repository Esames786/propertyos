import { ApiError, type ChatConversation, type ChatGroups, type ChatPolicy, type ChatReports, type ChatReportView, type ChatRulePreview, type ChatRules, type ChatRuleView, type ChatSendResult, type CommunityHome, type EffectiveAccess, type ModuleKey, type Persona, type PollOffice, type PollsOffice, type PollsResident, type ResidentNotices, type ResidentNotifications, type ResourceOffice, type ServiceDirectoryOffice, type ServiceDirectoryResident, type ServiceProviderOffice } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { DemoStore } from '../demo-store';
import { MockTransport } from '../mock-transport';
import { effectiveAccessFor } from '../tenant-directory';
import { COMMUNITY_SECTION, type CommunityState } from './state';

/**
 * Gate D.3 through the fail-closed mock API: the community chat (membership from facts, retention,
 * join-time history, move-out revocation, offline sends re-authorised, reports and moderation), the
 * Community home (notices without any add-on), local services (vetted only, consent, independent
 * vetting), polls (eligibility, one answer, no running tally, D-47 results) and resources.
 */
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

const without = (...modules: ModuleKey[]) => (p: Persona): EffectiveAccess | null => {
  const a = effectiveAccessFor(p);
  return a ? { ...a, grants: a.grants.filter((g) => !modules.includes(g.module)) } : null;
};

function session(options: { accessFor?: (p: Persona) => EffectiveAccess | null } = {}) {
  const demo = new DemoStore(memory());
  let personaId: string | null = 'alnoor_manager';
  const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo, ...(options.accessFor ? { accessFor: options.accessFor } : {}) });
  const ready = new MockTransport({ getContext: () => ({ personaId: 'alnoor_manager', projectId: 'all' }), getMode: () => 'fast', demo }).request({ method: 'POST', path: '/society/demo', body: { mode: 'collecting' } });
  const api = {
    demo,
    as(id: string | null) {
      personaId = id;
      return api;
    },
    get: async <T>(path: string, query?: Record<string, string>) => (await ready, t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) })),
    post: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'POST', path, body })),
    patch: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'PATCH', path, body })),
    /** The community state of Al-Noor's site in this demo session (to set up edge cases). */
    community: () => demo.partition('tnt_alnoor').section<CommunityState>(`${COMMUNITY_SECTION}:site_alnoor`, () => {
      throw new Error('community state not created yet');
    }),
  };
  return api;
}

const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.problem.status, code: e.problem.code, fields: Object.keys(e.problem.errors ?? {}) };
    throw e;
  }
  throw new Error('expected a refusal');
};

const ids = (g: ChatGroups) => g.groups.map((x) => x.id).sort();
const BLOCK_A = 'block:bld_anr_a';
const BLOCK_B = 'block:bld_anr_b';

describe('community chat: who is in which group (facts only)', () => {
  it('residents get the site, their block and floor; only committee members the committee group', async () => {
    const api = session();
    const kamran = await api.as('alnoor_resident_a101').get<ChatGroups>('/portal/chat/groups');
    expect(kamran.available).toBe(true);
    expect(kamran.directMessages).toBe(false);
    expect(ids(kamran)).toEqual(['block:bld_anr_a', 'committee', 'floor:bld_anr_a:1', 'site']);
    // A tenant-payer never sees the committee group (V3.2 PORTAL-031).
    expect(ids(await api.as('alnoor_tenant_a102').get<ChatGroups>('/portal/chat/groups'))).toEqual(['block:bld_anr_a', 'floor:bld_anr_a:1', 'site']);
    // Rabia lives in A-201 and owns A-202: occupancy decides, not ownership.
    expect(ids(await api.as('alnoor_owner_a201').get<ChatGroups>('/portal/chat/groups'))).toEqual(['block:bld_anr_a', 'committee', 'floor:bld_anr_a:2', 'site']);
    // Staff with chat.use: the site and the office team, never a block or floor.
    const office = await api.as('alnoor_manager').get<ChatGroups>('/ops/chat/groups');
    expect(ids(office)).toEqual(['site', 'staff']);
  });

  it('another block, floor or the committee is "not found" for a non-member (nothing revealed)', async () => {
    const api = session();
    api.as('alnoor_tenant_a102');
    for (const g of [BLOCK_B, 'floor:bld_anr_a:2', 'committee', 'staff', 'custom:nope']) expect((await refusal(api.get(`/portal/chat/groups/${g}/messages`))).status, g).toBe(404);
    expect((await refusal(api.post(`/portal/chat/groups/${BLOCK_B}/messages`, { text: 'hello' }))).status).toBe(404);
    // The office does not read block conversations either (moderation is through reports only).
    expect((await refusal(api.as('alnoor_manager').get(`/ops/chat/groups/${BLOCK_A}/messages`))).status).toBe(404);
  });
});

describe('community chat: rule R, licensing and roles (fail closed)', () => {
  it('needs resident_portal and community_chat for the same site', async () => {
    expect((await refusal(session({ accessFor: without('community_chat') }).as('alnoor_resident_a101').get('/portal/chat/groups'))).status).toBe(403);
    expect((await refusal(session({ accessFor: without('resident_portal') }).as('alnoor_resident_a101').get('/portal/chat/groups'))).status).toBe(403);
    expect((await refusal(session({ accessFor: without('community_chat') }).as('alnoor_manager').get('/ops/chat/groups'))).status).toBe(403);
  });

  it('signed out is 401; staff without chat permissions and the resident app on office routes are refused', async () => {
    const api = session();
    expect((await refusal(api.as(null).get('/portal/chat/groups'))).status).toBe(401);
    expect((await refusal(api.as(null).get('/ops/chat/rules'))).status).toBe(401);
    expect((await refusal(api.as('alnoor_treasurer').get('/ops/chat/groups'))).code).toBe('permission_missing');
    expect((await refusal(api.as('alnoor_guard').get('/ops/chat/reports'))).code).toBe('permission_missing');
    expect((await refusal(api.as('alnoor_resident_a101').get('/ops/chat/reports'))).status).toBe(403);
    // Another organisation's resident (Larkspur, a developer without the add-on or a society register).
    expect((await refusal(api.as('resident').get('/portal/chat/groups'))).status).toBeGreaterThanOrEqual(403);
    expect((await refusal(api.as('resident').get('/portal/community/home'))).status).toBeGreaterThanOrEqual(403);
  });
});

describe('community chat: reading, sending and read state', () => {
  it('unread counts, read marks, idempotent sends and posting rules', async () => {
    const api = session();
    const before = await api.as('alnoor_tenant_a102').get<ChatGroups>('/portal/chat/groups');
    const site = before.groups.find((g) => g.id === 'site')!;
    expect(site.unread).toBeGreaterThan(0);
    const conv = await api.get<ChatConversation>('/portal/chat/groups/site/messages');
    expect(conv.canPost).toBe(true);
    expect(conv.retentionDays).toBe(365);
    expect(conv.messages.every((m) => Date.parse(m.at) >= Date.parse(conv.visibleFrom))).toBe(true);
    // Names only: no flat, phone, email or anything about dues.
    expect(JSON.stringify(conv)).not.toMatch(/pty_anr|usr_anr|@example|A-1\d\d|balance/);
    await api.post('/portal/chat/groups/site/read');
    expect((await api.get<ChatGroups>('/portal/chat/groups')).groups.find((g) => g.id === 'site')!.unread).toBe(0);

    const sent = await api.post<ChatSendResult>('/portal/chat/groups/site/messages', { text: 'Is the gym open on Sunday?', clientKey: 'k_sunday_01' });
    expect(sent.duplicate).toBe(false);
    const again = await api.post<ChatSendResult>('/portal/chat/groups/site/messages', { text: 'Is the gym open on Sunday?', clientKey: 'k_sunday_01' });
    expect(again).toMatchObject({ duplicate: true, message: { id: sent.message.id } });
    // Kamran sees it as unread; Sana does not (her own).
    const k = await api.as('alnoor_resident_a101').get<ChatConversation>('/portal/chat/groups/site/messages');
    expect(k.messages.filter((m) => m.id === sent.message.id)).toHaveLength(1);
    expect(k.messages.find((m) => m.id === sent.message.id)!.sender).toMatchObject({ name: 'Sana Iqbal', kind: 'resident', isMe: false });
    expect((await api.as('alnoor_tenant_a102').get<ChatGroups>('/portal/chat/groups')).groups.find((g) => g.id === 'site')!.unread).toBe(0);

    expect((await refusal(api.post('/portal/chat/groups/site/messages', { text: '   ' }))).fields).toContain('text');
    expect((await refusal(api.post('/portal/chat/groups/site/messages', { text: 'x'.repeat(1001) }))).fields).toContain('text');
    expect((await refusal(api.post('/portal/chat/groups/site/messages', { text: 'hi', clientKey: 'bad key!' }))).fields).toContain('clientKey');

    // An office-only group: residents read, the office posts.
    await api.as('alnoor_manager').patch<ChatRuleView>('/ops/chat/rules/site', { postingPolicy: 'office_only' });
    const ro = await api.as('alnoor_tenant_a102').get<ChatConversation>('/portal/chat/groups/site/messages');
    expect(ro.canPost).toBe(false);
    expect((await refusal(api.post('/portal/chat/groups/site/messages', { text: 'Can I post?' }))).code).toBe('posting_restricted');
    const office = await api.as('alnoor_manager').post<ChatSendResult>('/ops/chat/groups/site/messages', { text: 'Water will be off on Saturday 9 to 1.' });
    expect(office.message.sender).toMatchObject({ kind: 'office', name: 'Imran Qureshi' });
  });

  it('mute, block a resident (their messages are hidden for me only) and unblock', async () => {
    const api = session();
    const conv = await api.as('alnoor_resident_a101').get<ChatConversation>('/portal/chat/groups/site/messages');
    const other = conv.messages.find((m) => m.sender.kind === 'resident' && !m.sender.isMe)!;
    await api.post('/portal/chat/blocks', { key: other.sender.key, blocked: true });
    const hidden = await api.get<ChatConversation>('/portal/chat/groups/site/messages');
    expect(hidden.messages.find((m) => m.id === other.id)).toMatchObject({ state: 'blocked' });
    expect(hidden.messages.find((m) => m.id === other.id)!.text).toBeUndefined();
    expect(hidden.blocked.map((b) => b.name)).toContain(other.sender.name);
    // Only for the person who blocked.
    expect((await api.as('alnoor_tenant_a102').get<ChatConversation>('/portal/chat/groups/site/messages')).messages.find((m) => m.id === other.id)!.state).toBe('visible');
    // The office cannot be blocked; an unknown key is not found.
    const officeKey = conv.messages.find((m) => m.sender.kind === 'office')!.sender.key;
    expect((await refusal(api.as('alnoor_resident_a101').post('/portal/chat/blocks', { key: officeKey, blocked: true }))).status).toBe(404);
    await api.post('/portal/chat/blocks', { key: other.sender.key, blocked: false });
    expect((await api.get<ChatConversation>('/portal/chat/groups/site/messages')).messages.find((m) => m.id === other.id)!.state).toBe('visible');
    await api.post('/portal/chat/groups/site/mute', { muted: true });
    expect((await api.get<ChatGroups>('/portal/chat/groups')).groups.find((g) => g.id === 'site')!.muted).toBe(true);
  });
});

describe('community chat: retention (D-25 (5)) and history from joining (D-25 (2))', () => {
  it('nothing can be read or posted until the society sets a retention period', async () => {
    const api = session();
    await api.as('alnoor_resident_a101').get('/portal/chat/groups');
    delete api.community().chat.retentionDays;
    const g = await api.get<ChatGroups>('/portal/chat/groups');
    expect(g).toMatchObject({ available: false, reason: 'retention_not_set', groups: [] });
    expect((await refusal(api.get('/portal/chat/groups/site/messages'))).code).toBe('chat_retention_not_set');
    expect((await refusal(api.post('/portal/chat/groups/site/messages', { text: 'hello' }))).code).toBe('chat_retention_not_set');
    // The office sets it, confirming its own legal review (no period is presumed).
    expect((await refusal(api.as('alnoor_manager').patch('/ops/chat/policy', { retentionDays: 90, etiquette: 'Be kind and stay on topic, please.' }))).fields).toContain('legalReviewConfirmed');
    expect((await refusal(api.patch('/ops/chat/policy', { retentionDays: 7, etiquette: 'Be kind and stay on topic, please.', legalReviewConfirmed: true }))).fields).toContain('retentionDays');
    const p = await api.patch<ChatPolicy>('/ops/chat/policy', { retentionDays: 90, etiquette: 'Be kind and stay on topic, please.', legalReviewConfirmed: true });
    expect(p.versions[0]).toMatchObject({ retentionDays: 90, changedByName: 'Imran Qureshi' });
    expect((await api.as('alnoor_resident_a101').get<ChatGroups>('/portal/chat/groups')).available).toBe(true);
  });

  it('messages older than the period disappear unless a report about them is open', async () => {
    const api = session();
    await api.as('alnoor_resident_a101').get('/portal/chat/groups');
    const s = api.community();
    s.chat.messages.push({ id: 'msg_old_1', groupId: 'site', senderKind: 'resident', senderName: 'Old', partyId: 'pty_anr_0004', text: 'An old message', at: '2026-08-01T10:00:00Z' }, { id: 'msg_old_2', groupId: 'site', senderKind: 'resident', senderName: 'Old', partyId: 'pty_anr_0004', text: 'Old and reported', at: '2026-08-02T10:00:00Z' });
    s.chat.reports.push({ id: 'crp_old', ref: 'ANR-CR-9999', messageId: 'msg_old_2', groupId: 'site', state: 'open', reports: [{ by: 'pty_anr_0005', reason: 'abusive', at: '2026-08-02T11:00:00Z' }], history: [] });
    s.chat.retentionDays = 30;
    const conv = await api.get<ChatConversation>('/portal/chat/groups/site/messages');
    expect(conv.messages.some((m) => m.id === 'msg_old_1')).toBe(false);
    expect(conv.messages.some((m) => m.id === 'msg_old_2')).toBe(true);
    const policy = await api.as('alnoor_manager').get<ChatPolicy>('/ops/chat/policy');
    expect(policy.held).toBeGreaterThanOrEqual(2);
  });

  it('leaving a custom group hides it; rejoining shows only what was written after rejoining', async () => {
    const api = session();
    const group = await api.as('alnoor_manager').post<ChatRuleView>('/ops/chat/custom', { name: 'Block A owners', audience: { scope: 'blocks', ids: ['bld_anr_a'], roles: ['owner'] }, postingPolicy: 'everyone' });
    expect(group.memberCount).toBeGreaterThan(5);
    expect((await refusal(api.post('/ops/chat/custom', { name: 'block a owners', audience: { scope: 'site', ids: [], roles: ['owner'] } }))).fields).toContain('name');
    expect((await refusal(api.post('/ops/chat/custom', { name: 'No roles', audience: { scope: 'site', ids: [], roles: [] } }))).fields).toContain('roles');
    const gid = group.id;
    // Sana is a tenant, not an owner: not in it.
    expect(ids(await api.as('alnoor_tenant_a102').get<ChatGroups>('/portal/chat/groups'))).not.toContain(gid);
    api.as('alnoor_resident_a101');
    expect(ids(await api.get<ChatGroups>('/portal/chat/groups'))).toContain(gid);
    expect((await refusal(api.post('/portal/chat/groups/site/leave'))).code).toBe('smart_group');
    await api.post(`/portal/chat/groups/${gid}/leave`);
    const after = await api.get<ChatGroups>('/portal/chat/groups');
    expect(ids(after)).not.toContain(gid);
    expect(after.left.map((l) => l.id)).toEqual([gid]);
    expect((await refusal(api.get(`/portal/chat/groups/${gid}/messages`))).status).toBe(404);
    const missed = await api.as('alnoor_owner_a201').post<ChatSendResult>(`/portal/chat/groups/${gid}/messages`, { text: 'Written while Kamran was away.' });
    await api.as('alnoor_resident_a101').post(`/portal/chat/groups/${gid}/rejoin`);
    const conv = await api.get<ChatConversation>(`/portal/chat/groups/${gid}/messages`);
    expect(conv.messages.some((m) => m.id === missed.message.id)).toBe(false);
  });
});

describe('community chat: move-out revokes at once, offline writes are re-checked', () => {
  it('after a move-out the groups, reads and a message written offline are all refused', async () => {
    const api = session();
    const conv = await api.as('alnoor_tenant_a202').get<ChatConversation>(`/portal/chat/groups/${BLOCK_A}/messages`);
    expect(conv.messages.length).toBeGreaterThan(0);
    const queuedAt = '2026-10-26T08:00:00+05:00';
    await api.as('alnoor_manager').post('/ops/moves', { flatId: 'unt_anr_a202', partyId: 'pty_anr_0011', effectiveOn: '2026-10-26', reason: 'Tenancy ended' });
    api.as('alnoor_tenant_a202');
    // Still liable for A-202's dues, so still a resident of the app; no longer in any group.
    expect((await api.get<ChatGroups>('/portal/chat/groups')).groups).toEqual([]);
    expect((await refusal(api.get(`/portal/chat/groups/${BLOCK_A}/messages`))).status).toBe(404);
    expect((await refusal(api.post(`/portal/chat/groups/${BLOCK_A}/messages`, { text: 'Written on the train, sent on reconnect', clientKey: 'offline_0001', queuedAt }))).status).toBe(404);
    expect((await refusal(api.post('/portal/chat/groups/site/read'))).status).toBe(404);
    // Nothing was delivered.
    const kamran = await api.as('alnoor_resident_a101').get<ChatConversation>(`/portal/chat/groups/${BLOCK_A}/messages`);
    expect(kamran.messages.some((m) => m.text?.startsWith('Written on the train'))).toBe(false);
  });

  it('a message written offline by a current member is delivered once on reconnect', async () => {
    const api = session();
    const a = await api.as('alnoor_tenant_a102').post<ChatSendResult>('/portal/chat/groups/site/messages', { text: 'Queued while offline', clientKey: 'offline_0002', queuedAt: '2026-10-26T07:00:00+05:00' });
    const b = await api.post<ChatSendResult>('/portal/chat/groups/site/messages', { text: 'Queued while offline', clientKey: 'offline_0002', queuedAt: '2026-10-26T07:00:00+05:00' });
    expect(b).toMatchObject({ duplicate: true, message: { id: a.message.id } });
  });
});

describe('community chat: reports and moderation (D-25 (4))', () => {
  it('residents report; moderators see only the reported message and decide; the author is told', async () => {
    const api = session();
    const conv = await api.as('alnoor_resident_a101').get<ChatConversation>('/portal/chat/groups/site/messages');
    const target = conv.messages.find((m) => m.sender.name === 'Ahmed Sheikh')!;
    expect((await refusal(api.post(`/portal/chat/messages/${target.id}/report`, { reason: 'nonsense' }))).fields).toContain('reason');
    expect((await refusal(api.post(`/portal/chat/messages/${target.id}/report`, { reason: 'other', note: 'x' }))).fields).toContain('note');
    const r = await api.post<{ id: string; state: string }>(`/portal/chat/messages/${target.id}/report`, { reason: 'off_topic', note: 'Not about the building' });
    // Reporting twice is one report.
    expect((await api.post<{ id: string }>(`/portal/chat/messages/${target.id}/report`, { reason: 'off_topic' })).id).toBe(r.id);
    const own = conv.messages.find((m) => m.sender.isMe)!;
    expect((await refusal(api.post(`/portal/chat/messages/${own.id}/report`, { reason: 'spam' }))).code).toBe('own_message');
    // Another block's message cannot be reported by someone outside it.
    const s = api.community();
    const blockB = s.chat.messages.find((m) => m.groupId === BLOCK_B);
    if (blockB) expect((await refusal(api.as('alnoor_tenant_a102').post(`/portal/chat/messages/${blockB.id}/report`, { reason: 'spam' }))).status).toBe(404);

    const queue = await api.as('alnoor_manager').get<ChatReports>('/ops/chat/reports');
    expect(queue.counts.open).toBe(2);
    const mine = queue.items.find((i) => i.id === r.id)!;
    // Only the reported message; reporters are counted, never named.
    expect(mine.message.text).toBe(target.text);
    expect(mine.reporters).toBe(1);
    expect(JSON.stringify(queue)).not.toMatch(/pty_anr|Kamran/);
    expect((await refusal(api.post(`/ops/chat/reports/${r.id}/hide`, { note: 'no' }))).fields).toContain('note');
    const hidden = await api.post<ChatReportView>(`/ops/chat/reports/${r.id}/hide`, { note: 'Off-topic advertising.' });
    expect(hidden).toMatchObject({ state: 'hidden', decision: { byName: 'Imran Qureshi' } });
    expect((await refusal(api.post(`/ops/chat/reports/${r.id}/dismiss`, { note: 'Changed my mind' }))).code).toBe('already_decided');
    // Everyone now sees a marker, without the text; the author is told in the app.
    const after = await api.as('alnoor_tenant_a102').get<ChatConversation>('/portal/chat/groups/site/messages');
    expect(after.messages.find((m) => m.id === target.id)).toMatchObject({ state: 'removed' });
    expect(after.messages.find((m) => m.id === target.id)!.text).toBeUndefined();
    // The seeded advert: dismiss with a note.
    const seeded = queue.items.find((i) => i.id !== r.id)!;
    expect(seeded.reporters).toBe(2);
    expect((await api.as('alnoor_admin').post<ChatReportView>(`/ops/chat/reports/${seeded.id}/warn`, { note: 'Adverts are not allowed; warned the author.' })).state).toBe('warned');
    const notes = await api.as('alnoor_resident_a101').get<ResidentNotifications>('/portal/notifications');
    expect(notes.items.some((n) => n.kind === 'chat')).toBe(false);
  });

  it('a moderator does not decide on their own message or a report they made', async () => {
    const api = session();
    const msg = await api.as('alnoor_manager').post<ChatSendResult>('/ops/chat/groups/site/messages', { text: 'Office message to be reported.' });
    await api.as('alnoor_resident_a101').post(`/portal/chat/messages/${msg.message.id}/report`, { reason: 'spam' });
    const q = await api.as('alnoor_manager').get<ChatReports>('/ops/chat/reports');
    const r = q.items.find((i) => i.message.id === msg.message.id)!;
    expect((await refusal(api.post(`/ops/chat/reports/${r.id}/dismiss`, { note: 'Looks fine to me.' }))).code).toBe('separation_of_duties');
    expect((await api.as('alnoor_admin').post<ChatReportView>(`/ops/chat/reports/${r.id}/dismiss`, { note: 'Office information, not spam.' })).state).toBe('dismissed');
  });

  it('groups and policy: preview who is in a group and why; switch a group off', async () => {
    const api = session();
    const rules = await api.as('alnoor_manager').get<ChatRules>('/ops/chat/rules');
    expect(rules.groups.map((g) => g.id)).toEqual(expect.arrayContaining(['site', BLOCK_A, BLOCK_B, 'committee', 'staff']));
    const preview = await api.get<ChatRulePreview>('/ops/chat/rules/committee/preview');
    expect(preview.members.map((m) => m.name)).toEqual(expect.arrayContaining(['Rabia Hashmi', 'Kamran Siddiqui']));
    expect(preview.members.every((m) => m.reasons.some((r) => r.reason === 'committee'))).toBe(true);
    const floor = await api.get<ChatRulePreview>('/ops/chat/rules/floor:bld_anr_a:1/preview');
    expect(floor.members.find((m) => m.name === 'Kamran Siddiqui')!.reasons[0]).toMatchObject({ reason: 'occupant', flat: 'A-101' });
    expect((await refusal(api.patch('/ops/chat/rules/staff', { enabled: false }))).code).toBe('staff_group');
    await api.patch('/ops/chat/rules/floor:bld_anr_a:1', { enabled: false });
    expect(ids(await api.as('alnoor_resident_a101').get<ChatGroups>('/portal/chat/groups'))).not.toContain('floor:bld_anr_a:1');
    // A moderator without group management reads the policy but cannot change it.
    expect((await refusal(api.as('alnoor_resident_a101').patch('/ops/chat/policy', {}))).status).toBe(403);
  });
});

describe('Community home (PORTAL-036): notices need no add-on', () => {
  it('with both add-ons: notices, chat, polls, services and resources', async () => {
    const api = session();
    const home = await api.as('alnoor_resident_a101').get<CommunityHome>('/portal/community/home');
    expect(home.tabs).toEqual(['notices', 'polls', 'services', 'resources']);
    expect(home.notices.latest.length).toBeGreaterThan(0);
    expect(home.chat).toMatchObject({ available: true });
    expect(home.chat!.unread).toBeGreaterThan(0);
    expect(home.polls!.open).toBeGreaterThan(0);
    expect(home.services!.listed).toBe(4);
  });

  it('without community_hub and community_chat the home keeps notices; notices themselves still work', async () => {
    const api = session({ accessFor: without('community_hub', 'community_chat') });
    const home = await api.as('alnoor_resident_a101').get<CommunityHome>('/portal/community/home');
    expect(home).toMatchObject({ tabs: ['notices'], chat: null, polls: null, services: null, resources: null });
    expect(home.notices.latest.length).toBeGreaterThan(0);
    const notices = await api.get<ResidentNotices>('/portal/notices');
    expect(notices.items.length).toBeGreaterThan(0);
    for (const path of ['/portal/community/polls', '/portal/community/services', '/portal/community/resources', '/portal/chat/groups']) expect((await refusal(api.get(path))).status, path).toBe(403);
    // Staff: the office side of both add-ons is refused too; official notices are not.
    expect((await refusal(api.as('alnoor_manager').get('/ops/community/polls'))).status).toBe(403);
    expect((await api.get<{ items: unknown[] }>('/notices')).items.length).toBeGreaterThan(0);
  });

  it('a feature not in the plan closes only its tab (the marketplace is never granted)', async () => {
    const api = session({
      accessFor: (p) => {
        const a = effectiveAccessFor(p);
        return a ? { ...a, features: a.features.filter((f) => f !== 'community_hub.polls') } : null;
      },
    });
    const home = await api.as('alnoor_resident_a101').get<CommunityHome>('/portal/community/home');
    expect(home.tabs).toEqual(['notices', 'services', 'resources']);
    expect((await refusal(api.get('/portal/community/polls'))).code).toBe('feature_not_licensed');
    expect((await refusal(api.as('alnoor_manager').get('/ops/community/polls'))).code).toBe('feature_not_licensed');
  });
});

describe('local services (CMTY-001): vetted only, consent, independent vetting', () => {
  it('residents see listed providers only, contact numbers only with consent; recommend and report', async () => {
    const api = session();
    const dir = await api.as('alnoor_tenant_a102').get<ServiceDirectoryResident>('/portal/community/services');
    expect(dir.items.map((p) => p.name)).not.toEqual(expect.arrayContaining(['CoolAir AC Service (Demo)']));
    expect(dir.items.some((p) => p.name.startsWith('QuickFix'))).toBe(false);
    expect(dir.items.find((p) => p.name === 'Demo Electrician Desk')!.phone).toBeNull();
    expect(dir.items.find((p) => p.name === 'Demo Plumbing Team')!.phone).toBe('+92 300 0000101');
    const filtered = await api.get<ServiceDirectoryResident>('/portal/community/services', { category: 'tutoring' });
    expect(filtered.items.map((p) => p.category)).toEqual(['tutoring']);
    expect((await api.get<ServiceDirectoryResident>('/portal/community/services', { q: 'geyser' })).items.map((p) => p.name)).toEqual(['Demo Plumbing Team']);
    expect((await refusal(api.get('/portal/community/services', { category: 'weapons' }))).fields).toContain('category');
    const tuition = dir.items.find((p) => p.category === 'tutoring')!;
    expect(await api.post(`/portal/community/services/${tuition.id}/recommend`, { on: true })).toMatchObject({ recommendations: 1, recommendedByMe: true });
    expect((await refusal(api.post(`/portal/community/services/${tuition.id}/report`, { reason: 'bad' }))).fields).toContain('reason');
    await api.post(`/portal/community/services/${tuition.id}/report`, { reason: 'Did not turn up for the agreed lesson.' });
    // A pending provider cannot be recommended (not found).
    const office = await api.as('alnoor_manager').get<ServiceDirectoryOffice>('/ops/community/services', { status: 'pending' });
    expect((await refusal(api.as('alnoor_tenant_a102').post(`/portal/community/services/${office.items[0]!.id}/recommend`, { on: true }))).status).toBe(404);
  });

  it('the office adds with a consent record; whoever added it cannot list it; suspend acts on reports', async () => {
    const api = session();
    api.as('alnoor_manager');
    expect((await refusal(api.post('/ops/community/services', { name: 'Ok', category: 'plumbing', description: 'short', serves: 'x' }))).fields).toContain('name');
    expect((await refusal(api.post('/ops/community/services', { name: 'Fresh Paint Co (Demo)', category: 'other', description: 'Interior painting for flats.', serves: 'Lahore', consent: { showContact: true, method: 'written' } }))).fields).toContain('phone');
    expect((await refusal(api.post('/ops/community/services', { name: 'Fresh Paint Co (Demo)', category: 'other', description: 'Interior painting for flats.', serves: 'Lahore', phone: '+92 300 0000199', consent: { showContact: true } }))).fields).toContain('consentMethod');
    const added = await api.post<ServiceProviderOffice>('/ops/community/services', { name: 'Fresh Paint Co (Demo)', category: 'other', description: 'Interior painting for flats.', serves: 'Lahore', phone: '+92 300 0000199', consent: { showContact: false, method: 'verbal' } });
    // Without consent to show it, the number is not kept.
    expect(added).toMatchObject({ status: 'pending', phone: null, actions: { vet: false } });
    expect((await refusal(api.post(`/ops/community/services/${added.id}/vet`, {}))).code).toBe('separation_of_duties');
    const listed = await api.as('alnoor_admin').post<ServiceProviderOffice>(`/ops/community/services/${added.id}/vet`, {});
    expect(listed).toMatchObject({ status: 'listed', vettedByName: 'Rabia Hashmi' });
    expect((await api.as('alnoor_tenant_a102').get<ServiceDirectoryResident>('/portal/community/services')).items.some((p) => p.id === added.id)).toBe(true);
    const reports = await api.as('alnoor_manager').get<ServiceDirectoryOffice>('/ops/community/services', { status: 'reports' });
    const reported = reports.items[0]!;
    expect((await refusal(api.post(`/ops/community/services/${reported.id}/suspend`, { note: 'short' }))).fields).toContain('note');
    const suspended = await api.post<ServiceProviderOffice>(`/ops/community/services/${reported.id}/suspend`, { note: 'Suspended while the office checks the complaint.' });
    expect(suspended.status).toBe('suspended');
    expect(suspended.reports.every((r) => r.state !== 'open')).toBe(true);
    expect((await api.as('alnoor_tenant_a102').get<ServiceDirectoryResident>('/portal/community/services')).items.some((p) => p.id === reported.id)).toBe(false);
    // Roles: the treasurer and the guard have no directory permission.
    expect((await refusal(api.as('alnoor_treasurer').get('/ops/community/services'))).code).toBe('permission_missing');
  });
});

describe('polls (CMTY-002, PORTAL-039): eligible, once, informal, no running tally', () => {
  const create = { title: 'Car wash bay', question: 'Should the society add a car wash bay in the basement?', options: ['Yes', 'No'], audience: { scope: 'site', ids: [], roles: ['owner', 'occupant'] }, unit: 'person', anonymous: true, closesOn: '2026-11-10' };

  it('the office drafts, opens, closes and publishes; staff never see how people answer while open', async () => {
    const api = session();
    api.as('alnoor_manager');
    expect((await refusal(api.post('/ops/community/polls', { ...create, options: ['Yes'] }))).fields).toContain('options');
    expect((await refusal(api.post('/ops/community/polls', { ...create, options: ['Yes', 'yes'] }))).fields).toContain('options');
    expect((await refusal(api.post('/ops/community/polls', { ...create, closesOn: '2026-10-01' }))).fields).toContain('closesOn');
    expect((await refusal(api.post('/ops/community/polls', { ...create, closesOn: '2027-06-01' }))).fields).toContain('closesOn');
    const draft = await api.post<PollOffice>('/ops/community/polls', create);
    expect(draft).toMatchObject({ state: 'draft', actions: { edit: true, open: true } });
    expect(draft.eligible).toBeGreaterThan(50);
    // Residents never see drafts.
    expect((await api.as('alnoor_tenant_a102').get<PollsResident>('/portal/community/polls')).items.some((p) => p.id === draft.id)).toBe(false);
    const open = await api.as('alnoor_manager').post<PollOffice>(`/ops/community/polls/${draft.id}/open`);
    expect(open.state).toBe('open');
    expect((await refusal(api.patch(`/ops/community/polls/${draft.id}`, create))).code).toBe('state_changed');

    const sana = await api.as('alnoor_tenant_a102').get<PollsResident>('/portal/community/polls');
    expect(sana.items.find((p) => p.id === draft.id)!.answerable).toHaveLength(1);
    expect((await refusal(api.post(`/portal/community/polls/${draft.id}/respond`, { optionId: 'opt_9' }))).fields).toContain('optionId');
    const answered = await api.post<{ answered: unknown[]; answerable: unknown[] }>(`/portal/community/polls/${draft.id}/respond`, { optionId: 'opt_1' });
    expect(answered).toMatchObject({ answered: [{ byMe: true }], answerable: [] });
    // Anonymous: even the resident's own choice is not stored with them.
    expect(JSON.stringify(answered)).not.toContain('opt_1"}');
    expect((await refusal(api.post(`/portal/community/polls/${draft.id}/respond`, { optionId: 'opt_2' }))).code).toBe('already_answered');
    await api.as('alnoor_resident_a101').post(`/portal/community/polls/${draft.id}/respond`, { optionId: 'opt_1' });
    await api.as('alnoor_owner_a201').post(`/portal/community/polls/${draft.id}/respond`, { optionId: 'opt_2' });

    const running = await api.as('alnoor_manager').get<PollOffice>(`/ops/community/polls/${draft.id}`);
    expect(running.responses).toBe(3);
    expect(running.totals).toBeUndefined();
    const closed = await api.post<PollOffice>(`/ops/community/polls/${draft.id}/close`);
    expect(closed.totals!.map((o) => o.count)).toEqual([2, 1]);
    expect(closed.respondents).toBeUndefined();
    expect((await refusal(api.as('alnoor_tenant_a102').post(`/portal/community/polls/${draft.id}/respond`, { optionId: 'opt_1' }))).code).toBe('poll_closed');
    const published = await api.as('alnoor_manager').post<PollOffice>(`/ops/community/polls/${draft.id}/publish`);
    // Three answers out of a large audience: total shown; neither block (2 and 1... in one block) is.
    expect(published.published).toMatchObject({ shown: true, total: 3, blocks: [] });
    const res = await api.as('alnoor_tenant_a102').get<PollsResident>('/portal/community/polls');
    expect(res.items.find((p) => p.id === draft.id)!.results).toMatchObject({ shown: true, total: 3 });
  });

  it('per-flat polls take one answer per household; an owner with two flats answers for each', async () => {
    const api = session();
    const sports = (await api.as('alnoor_owner_a201').get<PollsResident>('/portal/community/polls')).items.find((p) => p.title.startsWith('Children'))!;
    // Occupants only: Rabia lives in A-201 (A-202 is let to Junaid).
    expect(sports.answerable.map((a) => a.flatCode)).toEqual(['A-201']);
    await api.post(`/portal/community/polls/${sports.id}/respond`, { optionId: 'opt_2', flatId: 'unt_anr_a201' });
    const junaid = (await api.as('alnoor_tenant_a202').get<PollsResident>('/portal/community/polls')).items.find((p) => p.id === sports.id)!;
    expect(junaid.answerable.map((a) => a.flatCode)).toEqual(['A-202']);
    // Another flat (not one of yours) is refused.
    expect((await refusal(api.post(`/portal/community/polls/${sports.id}/respond`, { optionId: 'opt_1', flatId: 'unt_anr_a201' }))).code).toBe('already_answered');
  });

  it('named polls show staff who answered what, after closing; withdrawn polls say why', async () => {
    const api = session();
    const list = await api.as('alnoor_manager').get<PollsOffice>('/ops/community/polls', { status: 'closed' });
    const parking = list.items.find((p) => p.title.startsWith('Visitor parking'))!;
    expect(parking.respondents!.map((r) => r.flat)).toEqual(['B-102', 'B-202']);
    // Two answers: below the threshold, so residents will see "not enough responses".
    const published = await api.post<PollOffice>(`/ops/community/polls/${parking.id}/publish`);
    expect(published.published).toMatchObject({ shown: false, reason: 'below_threshold' });
    const draft = (await api.get<PollsOffice>('/ops/community/polls', { status: 'draft' })).items[0]!;
    expect((await refusal(api.post(`/ops/community/polls/${draft.id}/withdraw`, { reason: 'short' }))).fields).toContain('reason');
    expect((await api.post<PollOffice>(`/ops/community/polls/${draft.id}/withdraw`, { reason: 'The committee postponed the rooftop plan.' })).state).toBe('withdrawn');
    // Block B's poll is not shown to a Block A resident.
    expect((await api.as('alnoor_tenant_a102').get<PollsResident>('/portal/community/polls')).items.some((p) => p.id === parking.id)).toBe(false);
  });
});

describe('resources (DOC-001 published to residents)', () => {
  it('publish to an audience, residents outside it never see it, withdraw', async () => {
    const api = session();
    api.as('alnoor_manager');
    expect((await refusal(api.post('/ops/community/resources', { title: 'Rules', category: 'guides', file: { name: 'a.exe', type: 'application/x-msdownload', sizeBytes: 100 }, audience: { scope: 'site', ids: [], roles: ['owner'] } }))).fields).toContain('file');
    const r = await api.post<ResourceOffice>('/ops/community/resources', { title: 'Block B parking map', category: 'guides', description: 'Where visitors park.', file: { name: 'parking-b.pdf', type: 'application/pdf', sizeBytes: 120_000 }, audience: { scope: 'blocks', ids: ['bld_anr_b'], roles: ['owner', 'occupant'] } });
    expect(r.reach).toBeGreaterThan(10);
    expect((await api.as('alnoor_tenant_a102').get<{ items: Array<{ id: string; title: string }> }>('/portal/community/resources')).items.some((x) => x.id === r.id)).toBe(false);
    // Owners-only agenda: a tenant does not see it; an owner does.
    expect((await api.get<{ items: Array<{ title: string }> }>('/portal/community/resources')).items.some((x) => x.title.startsWith('Draft agenda'))).toBe(false);
    expect((await api.as('alnoor_resident_a101').get<{ items: Array<{ title: string }> }>('/portal/community/resources')).items.some((x) => x.title.startsWith('Draft agenda'))).toBe(true);
    const all = await api.as('alnoor_manager').get<{ items: ResourceOffice[] }>('/ops/community/resources');
    const bylaws = all.items.find((x) => x.category === 'bylaws')!;
    expect((await api.post<ResourceOffice>(`/ops/community/resources/${bylaws.id}/withdraw`, { reason: 'Replaced by the 2027 edition.' })).state).toBe('withdrawn');
    expect((await api.as('alnoor_resident_a101').get<{ items: Array<{ id: string }> }>('/portal/community/resources')).items.some((x) => x.id === bylaws.id)).toBe(false);
  });
});
