import {
  ApiError,
  type AppSwitchRedeemed,
  type AppSwitchTicket,
  type ExportFile,
  type ExportRequest,
  type FlatHousehold,
  type HouseholdRequest,
  type InvitationAccepted,
  type InvitationView,
  type InviteResult,
  type MyProfile,
  type MySecurity,
  type OrgAppearanceSettings,
  type PortalAccessList,
  type PrivacyRequest,
  type SharedAccessibilityRecord,
  type SignInCodeSent,
  type StaffUserRow,
} from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { DemoStore } from '../demo-store';
import { MockTransport } from '../mock-transport';

/**
 * Gate D.1 through the fail-closed mock API: invitations bound to organisation, flat and verified
 * person; one-time codes; sign-in that never reveals an account; sessions that end everywhere; the
 * one-time app switch; exports that never go beyond the requester and need someone else's approval;
 * privacy requests; staff sessions within the organisation; households; the organisation's colours.
 */
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

type App = 'backoffice' | 'customer';

function session() {
  const demo = new DemoStore(memory());
  let ctx: { personaId: string | null; app: App; sessionId: string | null } = { personaId: 'alnoor_manager', app: 'backoffice', sessionId: null };
  const t = new MockTransport({ getContext: () => ({ personaId: ctx.personaId, projectId: 'all', app: ctx.app, sessionId: ctx.sessionId }), getMode: () => 'fast', demo });
  const ready = new MockTransport({ getContext: () => ({ personaId: 'alnoor_manager', projectId: 'all' }), getMode: () => 'fast', demo }).request({ method: 'POST', path: '/society/demo', body: { mode: 'collecting' } });
  return {
    as(personaId: string | null, app: App = 'backoffice', sessionId: string | null = null) {
      ctx = { personaId, app, sessionId };
      return this;
    },
    get: async <T>(path: string, query?: Record<string, string>) => (await ready, t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) })),
    post: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'POST', path, body })),
    patch: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'PATCH', path, body })),
  };
}

const problem = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e.problem;
    throw e;
  }
  throw new Error('expected a refusal');
};

const tokenOf = (link: string | undefined) => (link ?? '').split('/').pop()!;

/** Invite the first verified person who was never invited, on the printed-letter channel (no consent needed). */
async function inviteSomeone(s: ReturnType<typeof session>) {
  const list = await s.as('alnoor_manager').get<PortalAccessList>('/portal-access', { status: 'not_invited' });
  const person = list.rows.find((r) => r.verified)!;
  const r = await s.post<InviteResult>('/portal-invitations', { partyIds: [person.partyId], channel: 'printed_code' });
  expect(r.sent).toHaveLength(1);
  return { person, token: tokenOf(r.sent[0]!.invitation.demoLink), invitationId: r.sent[0]!.invitation.id };
}

describe('Gate D.1 invitations (RES-007, RES-009, AUTH-007)', () => {
  it('accepts an invitation with the one-time code, once, and binds the account to the person and flat', async () => {
    const s = session();
    const { person, token } = await inviteSomeone(s);
    const view = await s.as(null, 'customer').get<InvitationView>(`/invitations/${token}`);
    expect(view.state).toBe('sent');
    expect(view.flatCode).toBe(person.flats[0]!.flatCode);
    expect(view.firstName).toBe(person.name.split(/\s+/)[0]);
    // The view never carries the full name, phone number or e-mail.
    expect(JSON.stringify(view)).not.toContain(person.name);

    const code = await s.post<SignInCodeSent>(`/invitations/${token}/code`);
    const accepted = await s.post<InvitationAccepted>(`/invitations/${token}/accept`, { challengeId: code.challengeId, code: code.demoCode });
    expect(accepted.flatCode).toBe(person.flats[0]!.flatCode);
    expect(accepted.tenantId).toBe('tnt_alnoor');

    // Used: the link explains itself and cannot be accepted again.
    expect((await s.get<InvitationView>(`/invitations/${token}`)).state).toBe('accepted');
    expect((await problem(s.post(`/invitations/${token}/accept`, { challengeId: code.challengeId, code: code.demoCode }))).code).toBe('invitation_closed');

    // The new resident can use the app; the office sees them as active.
    const profile = await s.as(accepted.personaId, 'customer', 'ses_new').get<MyProfile>('/me/profile');
    expect(profile.flats).toContain(person.flats[0]!.flatCode);
    const after = await s.as('alnoor_manager').get<PortalAccessList>('/portal-access', { q: person.name });
    expect(after.rows.find((r) => r.partyId === person.partyId)?.status).toBe('active');
  });

  it('counts wrong codes down and then locks the code', async () => {
    const s = session();
    const { token } = await inviteSomeone(s);
    const code = await s.as(null, 'customer').post<SignInCodeSent>(`/invitations/${token}/code`);
    const wrong = await problem(s.post(`/invitations/${token}/accept`, { challengeId: code.challengeId, code: '000000' }));
    expect(wrong.code).toBe('code_wrong');
    expect(wrong.errors?.code?.[0]).toEqual({ code: 'identity:code.wrongField', params: { count: '2' } });
    await problem(s.post(`/invitations/${token}/accept`, { challengeId: code.challengeId, code: '000001' }));
    const third = await problem(s.post(`/invitations/${token}/accept`, { challengeId: code.challengeId, code: '000002' }));
    expect(third.code).toBe('code_locked');
    expect((await problem(s.post(`/invitations/${token}/accept`, { challengeId: code.challengeId, code: code.demoCode }))).code).toBe('code_locked');
  });

  it('refuses a cancelled invitation, an unknown token and a token of another organisation', async () => {
    const s = session();
    const { token, invitationId } = await inviteSomeone(s);
    await s.as('alnoor_manager').post(`/portal-invitations/${invitationId}/revoke`);
    expect((await s.as(null, 'customer').get<InvitationView>(`/invitations/${token}`)).state).toBe('revoked');
    expect((await problem(s.post(`/invitations/${token}/code`))).status).toBe(404);
    expect((await s.get<InvitationView>('/invitations/tnt_alnoor.inv_nothing')).state).toBe('not_found');
    expect((await s.get<InvitationView>(`/invitations/${token.replace('tnt_alnoor', 'tnt_larkspur')}`)).state).toBe('not_found');
  });

  it('never invites without a verified link, and only on channels the person agreed to', async () => {
    const s = session();
    const list = await s.as('alnoor_manager').get<PortalAccessList>('/portal-access', { status: 'unverified' });
    const unverified = list.rows[0]!;
    const r = await s.post<InviteResult>('/portal-invitations', { partyIds: [unverified.partyId], channel: 'printed_code' });
    expect(r.sent).toHaveLength(0);
    expect(r.skipped[0]?.reason).toBe('not_verified');
    const all = await s.get<PortalAccessList>('/portal-access', { status: 'not_invited' });
    const noWhatsApp = all.rows.find((x) => x.verified && !x.consents.some((c) => c.channel === 'whatsapp' && c.consented))!;
    const w = await s.post<InviteResult>('/portal-invitations', { partyIds: [noWhatsApp.partyId], channel: 'whatsapp' });
    expect(w.skipped[0]?.reason).toBe('no_consent');
  });

  it('only staff with portal_access.invite can invite; residents cannot see portal access at all', async () => {
    const s = session();
    const list = await s.as('alnoor_manager').get<PortalAccessList>('/portal-access', { status: 'not_invited' });
    const person = list.rows.find((r) => r.verified)!;
    expect((await problem(s.as('alnoor_treasurer').post('/portal-invitations', { partyIds: [person.partyId], channel: 'printed_code' }))).status).toBe(403);
    expect((await problem(s.as('alnoor_resident_a101', 'customer').get('/portal-access'))).status).toBe(403);
  });
});

describe('Gate D.1 sign-in, sessions and the session gate (AUTH-006, GLOBAL-016, PORTAL-041)', () => {
  it('answers the same for a number without an account, and signs in a resident with a code', async () => {
    const s = session();
    const none = await s.as(null, 'customer').post<{ challengeId: null; sentTo: string }>('/sign-in/code', { phone: '+92 399 0000001' });
    expect(none.challengeId).toBeNull();
    expect(none.sentTo).toContain('***');
    const code = await s.post<SignInCodeSent>('/sign-in/code', { phone: '+92 399 5100778' });
    expect(code.challengeId).toBeTruthy();
    expect((await s.post<{ personaId: string }>('/sign-in/verify', { challengeId: code.challengeId, code: code.demoCode })).personaId).toBe('alnoor_resident_a101');
  });

  it('ends another device’s session; that device is then signed out; the current one cannot be revoked from here', async () => {
    const s = session();
    await s.as('alnoor_resident_a101', 'customer', 'ses_phone').get<MySecurity>('/me/security');
    const mine = await s.as('alnoor_resident_a101', 'customer', 'ses_laptop').get<MySecurity>('/me/security');
    expect(mine.sessions.find((x) => x.id === 'ses_laptop')?.current).toBe(true);
    expect((await problem(s.post('/me/sessions/ses_laptop/revoke'))).errors?.session?.[0]?.code).toBe('identity:sessions.errors.current');
    await s.post('/me/sessions/ses_phone/revoke');
    expect((await problem(s.as('alnoor_resident_a101', 'customer', 'ses_phone').get('/me/profile'))).code).toBe('session_ended');
    // Another person's session does not exist for this caller.
    expect((await problem(s.as('alnoor_tenant_a102', 'customer', 'ses_sana').post('/me/sessions/ses_laptop/revoke'))).status).toBe(404);
  });

  it('closing resident access ends their sessions and refuses them everywhere', async () => {
    const s = session();
    await s.as('alnoor_tenant_a102', 'customer', 'ses_sana').get('/me/profile');
    await s.as('alnoor_manager').post('/portal-access/pty_anr_0003/revoke', { reason: 'Moved out in October.' });
    expect((await problem(s.as('alnoor_tenant_a102', 'customer', 'ses_sana').get('/me/profile'))).code).toBe('portal_access_revoked');
    const reason = await problem(s.as('alnoor_manager').post('/portal-access/pty_anr_0001/revoke', { reason: 'x' }));
    expect(reason.status).toBe(422);
  });
});

describe('Gate D.1 app switch (GLOBAL-015)', () => {
  it('issues a one-time ticket that only the other app can redeem, once', async () => {
    const s = session();
    const ticket = await s.as('alnoor_admin', 'backoffice', 'ses_office').post<AppSwitchTicket>('/me/app-switch');
    expect(ticket.app).toBe('customer');
    // The office app cannot redeem a ticket meant for the resident app.
    expect((await problem(s.as(null, 'backoffice').post(`/app-switch/${ticket.token}`))).status).toBe(404);
    const redeemed = await s.as(null, 'customer').post<AppSwitchRedeemed>(`/app-switch/${ticket.token}`);
    expect(redeemed).toEqual({ personaId: 'alnoor_owner_a201', app: 'customer', fromApp: 'backoffice' });
    expect((await problem(s.post(`/app-switch/${ticket.token}`))).status).toBe(404);
    // And back again, from the resident side.
    const back = await s.as('alnoor_owner_a201', 'customer', 'ses_res').post<AppSwitchTicket>('/me/app-switch');
    expect((await s.as(null, 'backoffice').post<AppSwitchRedeemed>(`/app-switch/${back.token}`)).personaId).toBe('alnoor_admin');
  });

  it('offers no switch to people with one role', async () => {
    const s = session();
    expect((await s.as('alnoor_manager').get<MyProfile>('/me/profile')).switchTo).toBeUndefined();
    expect((await problem(s.post('/me/app-switch'))).status).toBe(403);
    expect((await s.as('alnoor_resident_a101', 'customer').get<MyProfile>('/me/profile')).switchTo).toBeUndefined();
    expect((await s.as('alnoor_owner_a201', 'customer').get<MyProfile>('/me/profile')).switchTo?.app).toBe('backoffice');
    // One person, one set of contact details in both apps.
    const office = await s.as('alnoor_admin').get<MyProfile>('/me/profile');
    const home = await s.as('alnoor_owner_a201', 'customer').get<MyProfile>('/me/profile');
    expect(office.phone).toBeTruthy();
    expect(office.phone).toBe(home.phone);
  });
});

describe('Gate D.1 data exports and privacy (ADM-024, PORTAL-024)', () => {
  it('an approver who is not the requester can narrow but never widen; the file holds only what was approved', async () => {
    const s = session();
    const req = await s.as('alnoor_admin').post<ExportRequest>('/data-exports', { datasets: ['people', 'flats'], purpose: 'Committee meeting contact list.', format: 'csv' });
    expect(req.state).toBe('awaiting_approval');
    expect(req.canDecide).toBe(false);
    expect((await problem(s.post(`/data-exports/${req.id}/download`))).status).toBe(422);
    expect((await problem(s.post(`/data-exports/${req.id}/decide`, { decision: 'approve' }))).status).toBe(403);

    expect((await problem(s.as('alnoor_treasurer').post('/data-exports', { datasets: ['people'], purpose: 'I would like a copy too.', format: 'csv' }))).status).toBe(403);
    const widen = await problem(s.post(`/data-exports/${req.id}/decide`, { decision: 'approve', keep: ['people', 'invoices'] }));
    expect(widen.code).toBe('cannot_widen');
    const approved = await s.post<ExportRequest>(`/data-exports/${req.id}/decide`, { decision: 'approve', keep: ['people'] });
    expect(approved.state).toBe('ready');
    expect(approved.datasets.find((d) => d.dataset === 'flats')).toMatchObject({ included: false, reason: 'removed_by_approver' });
    // Only the requester downloads (the approver may not even ask for the file).
    expect((await problem(s.post(`/data-exports/${req.id}/download`))).status).toBe(403);
    const file = await s.as('alnoor_admin').post<ExportFile>(`/data-exports/${req.id}/download`);
    expect(file.content).toContain('# people');
    expect(file.content).not.toContain('# flats');
    expect(file.content).toContain('fictional');
  });

  it('declining needs a reason; nothing outside the requester’s own access can be exported', async () => {
    const s = session();
    const req = await s.as('alnoor_admin').post<ExportRequest>('/data-exports', { datasets: ['portal_access'], purpose: 'Adoption figures for the AGM.', format: 'json' });
    expect((await problem(s.as('alnoor_treasurer').post(`/data-exports/${req.id}/decide`, { decision: 'reject', note: 'no' }))).status).toBe(422);
    expect((await s.post<ExportRequest>(`/data-exports/${req.id}/decide`, { decision: 'reject', note: 'Use the dashboard figures instead.' })).state).toBe('rejected');
    // A developer's administrator has no society records: nothing is exportable.
    expect((await problem(s.as('manager').post('/data-exports', { datasets: ['people', 'invoices'], purpose: 'Testing the export.', format: 'csv' }))).code).toBe('nothing_to_export');
  });

  it('a completed deletion removes contacts and app access but keeps the bills', async () => {
    const s = session();
    const before = await s.as('alnoor_resident_a101', 'customer', 'ses_k').get<{ holds: Record<string, number> }>('/portal/my-data');
    expect(before.holds.bills).toBeGreaterThan(0);
    const mine = await s.as('alnoor_resident_a101', 'customer', 'ses_k').post<ExportFile>('/portal/my-data/export');
    expect(mine.content).toContain('Kamran Siddiqui');
    expect(mine.content).not.toContain('Sana Iqbal');
    const r = await s.post<PrivacyRequest>('/portal/my-data/requests', { kind: 'deletion', details: 'Please delete my account and details.' });
    expect((await problem(s.post('/portal/my-data/requests', { kind: 'deletion', details: 'Asking a second time.' }))).code).toBe('request_open');
    const done = await s.as('alnoor_admin').post<PrivacyRequest>(`/privacy-requests/${r.id}/decide`, { decision: 'complete', note: 'Removed as asked.' });
    expect(done.retentionOutcome).toBe('contacts_removed_financial_kept');
    expect((await problem(s.as('alnoor_resident_a101', 'customer', 'ses_k').get('/me/profile'))).code).toBe('portal_access_revoked');
    const flats = await s.as('alnoor_admin').get<PortalAccessList>('/portal-access', { q: 'Kamran' });
    expect(flats.rows[0]?.status).toBe('revoked');
    expect((await problem(s.as('alnoor_treasurer').get('/privacy-requests'))).status).toBe(403);
  });
});

describe('Gate D.1 staff sessions (ADM-003)', () => {
  it('lists only this organisation’s staff and ends their sessions with sessions.manage', async () => {
    const s = session();
    await s.as('alnoor_manager', 'backoffice', 'ses_imran').get('/me/profile');
    const users = await s.as('alnoor_admin', 'backoffice', 'ses_rabia').get<StaffUserRow[]>('/admin/users');
    expect(users.every((u) => u.principalId.startsWith('usr_anr_'))).toBe(true);
    expect(users.find((u) => u.principalId === 'usr_anr_r0003')?.alsoResident).toBe(true);
    expect((await problem(s.get('/admin/users/usr_lsp_0001'))).status).toBe(404);
    await s.post('/admin/users/usr_anr_0001/sessions/ses_imran/revoke');
    expect((await problem(s.as('alnoor_manager', 'backoffice', 'ses_imran').get('/me/profile'))).code).toBe('session_ended');
    expect((await problem(s.as('alnoor_treasurer').post('/admin/users/usr_anr_0001/sessions/revoke-all'))).status).toBe(403);
  });
});

describe('Gate D.1 households (PORTAL-025, RES-004)', () => {
  it('a resident asks, the office approves, and the person appears in the flat’s household', async () => {
    const s = session();
    const r = await s.as('alnoor_resident_a101', 'customer').post<HouseholdRequest>('/portal/household/requests', { flatId: 'unt_anr_a101', name: 'Ali Siddiqui', relationship: 'child' });
    expect(r.state).toBe('pending');
    // A flat that is not theirs is refused.
    expect((await problem(s.post('/portal/household/requests', { flatId: 'unt_anr_a102', name: 'Someone Else', relationship: 'other' }))).status).toBe(422);
    expect((await problem(s.as('alnoor_treasurer').post(`/household-requests/${r.id}/approve`))).status).toBe(403);
    await s.as('alnoor_manager').post(`/household-requests/${r.id}/approve`);
    const mine = await s.as('alnoor_resident_a101', 'customer').get<{ flats: FlatHousehold[] }>('/portal/household');
    expect(mine.flats[0]!.people.map((p) => p.name)).toContain('Ali Siddiqui');
    // Names and roles only: no contact details reach the resident.
    expect(JSON.stringify(mine)).not.toMatch(/\+92|@example\.com/);
  });
});

describe('Gate D.1 organisation colours (ADM-022)', () => {
  it('a preset is open to every organisation; a custom colour needs white label; only admin.branding changes it', async () => {
    const s = session();
    expect((await problem(s.as('alnoor_manager').patch('/org/appearance', { palette: 'ocean' }))).status).toBe(403);
    expect((await problem(s.as('alnoor_admin').patch('/org/appearance', { palette: 'brand', brandPrimary: '#1e4d42' }))).code).toBe('feature_not_licensed');
    await s.patch('/org/appearance', { palette: 'ocean' });
    expect((await s.as('alnoor_resident_a101', 'customer').get<OrgAppearanceSettings>('/org/appearance')).palette).toBe('ocean');
  });
});

describe('D.1 closure: shared accessibility essentials (/me/preferences)', () => {
  const rec = (patch: Partial<SharedAccessibilityRecord['essentials']>, changedAt: string, chosenAt?: string): SharedAccessibilityRecord => ({
    essentials: { textScale: 1, contrast: 'system', motion: 'system', reading: false, fontLatin: 'geist', fontUrdu: 'naskh', ...patch },
    changedAt,
    ...(chosenAt ? { chosenAt } : {}),
  });

  it('one record per person in the organisation: Rabia reads the same record in both apps; nobody else does', async () => {
    const s = session();
    expect((await s.as('alnoor_admin', 'backoffice').get<{ record: SharedAccessibilityRecord | null }>('/me/preferences')).record).toBeNull();
    await s.patch('/me/preferences', rec({ textScale: 1.5, contrast: 'high' }, '2026-10-26T10:00:00Z'));
    const resident = await s.as('alnoor_owner_a201', 'customer').get<{ record: SharedAccessibilityRecord | null }>('/me/preferences');
    expect(resident.record?.essentials).toMatchObject({ textScale: 1.5, contrast: 'high' });
    expect((await s.as('alnoor_resident_a101', 'customer').get<{ record: SharedAccessibilityRecord | null }>('/me/preferences')).record).toBeNull();
    expect((await s.as('alnoor_manager').get<{ record: SharedAccessibilityRecord | null }>('/me/preferences')).record).toBeNull();
  });

  it('the newer change wins; a text size chosen in either app stays chosen; nonsense is refused', async () => {
    const s = session().as('alnoor_owner_a201', 'customer');
    await s.patch('/me/preferences', rec({ textScale: 1.25 }, '2026-10-26T10:00:00Z', '2026-10-20T08:00:00Z'));
    const stale = await s.as('alnoor_admin', 'backoffice').patch<{ record: SharedAccessibilityRecord }>('/me/preferences', rec({ textScale: 2 }, '2026-10-25T10:00:00Z'));
    expect(stale.record.essentials.textScale).toBe(1.25);
    const newer = await s.patch<{ record: SharedAccessibilityRecord }>('/me/preferences', rec({ textScale: 1.75, locale: 'ur-PK' }, '2026-10-27T10:00:00Z'));
    expect(newer.record).toMatchObject({ essentials: { textScale: 1.75, locale: 'ur-PK' }, chosenAt: '2026-10-20T08:00:00Z' });
    expect((await problem(s.patch('/me/preferences', rec({ textScale: 3 }, '2026-10-28T10:00:00Z')))).status).toBe(422);
    expect((await problem(s.patch('/me/preferences', { essentials: { textScale: 1 }, changedAt: 'yesterday' }))).status).toBe(422);
    // The switch to the other app carries the shared language for its greeting.
    const ticket = await s.post<AppSwitchTicket>('/me/app-switch');
    expect((await s.as(null, 'customer').post<AppSwitchRedeemed>(`/app-switch/${ticket.token}`)).locale).toBe('ur-PK');
  });
});
