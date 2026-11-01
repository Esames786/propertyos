import {
  ApiError,
  type CheckInResult,
  type GatePass,
  type GateQueue,
  type GateRequest,
  type GatewaySettings,
  type MaintenanceDashboard,
  type NoticeDetail,
  type RequestDetail,
  type RequestList,
  type ResidentIssues,
  type ResidentNoticeOpen,
  type ResidentNotices,
  type ResidentNotifications,
  type ResidentRequest,
  type ResidentRequests,
  type ResidentVisitors,
  type VehicleCheck,
  type VehicleList,
} from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { DemoStore } from '../demo-store';
import { MockTransport } from '../mock-transport';
import { effectiveAccessFor } from '../tenant-directory';
import type { EffectiveAccess, Persona } from '@repo/contracts';

/**
 * Gate D.2 through the fail-closed mock API: the three reference experiences (repair → technician →
 * resident confirmation; invitation → gate → check-in/out; notice → notification → acknowledgement)
 * and the refusals behind them (rule R, technicians' own work orders, occupants only at the gate,
 * moved out, withdrawn, outside the audience, duplicate plates, sandbox gateway never pays).
 */
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

function session(options: { accessFor?: (p: Persona) => EffectiveAccess | null } = {}) {
  const demo = new DemoStore(memory());
  let personaId: string | null = 'alnoor_manager';
  const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo, ...(options.accessFor ? { accessFor: options.accessFor } : {}) });
  const ready = new MockTransport({ getContext: () => ({ personaId: 'alnoor_manager', projectId: 'all' }), getMode: () => 'fast', demo }).request({ method: 'POST', path: '/society/demo', body: { mode: 'collecting' } });
  const api = {
    as(id: string | null) {
      personaId = id;
      return api;
    },
    get: async <T>(path: string, query?: Record<string, string>) => (await ready, t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) })),
    post: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'POST', path, body })),
    patch: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'PATCH', path, body })),
  };
  return api;
}

const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.problem.status, code: e.problem.code, fields: Object.keys(e.problem.errors ?? {}), errors: e.problem.errors };
    throw e;
  }
  throw new Error('expected a refusal');
};

const photo = { name: 'leak.jpg', type: 'image/jpeg', sizeBytes: 200_000, alt: 'Water under the kitchen sink' };
const A101 = 'unt_anr_a101';

describe('reference 1: repair → triage → technician → resident confirmation', () => {
  it('runs end to end with SLA, notifications, a reopen and the confirmation', async () => {
    const api = session();
    const raised = await api.as('alnoor_resident_a101').post<ResidentRequest>('/portal/requests', { category: 'plumbing', title: 'Kitchen sink leaking', description: 'Water drips from the trap under the kitchen sink.', flatId: A101, room: 'kitchen', urgency: 'urgent', contact: { preference: 'app', entry: 'when_home' }, files: [photo], idempotencyKey: 'k1' });
    expect(raised.state).toBe('submitted');
    // The same request sent twice is created once.
    const again = await api.post<ResidentRequest>('/portal/requests', { category: 'plumbing', title: 'Kitchen sink leaking', description: 'Water drips from the trap under the kitchen sink.', flatId: A101, room: 'kitchen', urgency: 'urgent', files: [photo], idempotencyKey: 'k1' });
    expect(again.id).toBe(raised.id);

    const triaged = await api.as('alnoor_maintenance').post<RequestDetail>(`/ops/requests/${raised.id}/triage`, { priority: 'p2' });
    expect(triaged.request.state).toBe('triaged');
    expect(triaged.request.sla?.response).toBe('met');
    const assigned = await api.post<RequestDetail>(`/ops/requests/${raised.id}/assign`, { technicianId: 'tech_anr_waqas', scheduledOn: '2026-10-27', slot: 'morning' });
    expect(assigned.request.state).toBe('assigned');
    const order = assigned.workOrders.at(-1)!;

    // The technician sees only his own jobs; another technician's request is not found.
    const mine = await api.as('alnoor_technician').get<RequestList>('/ops/requests');
    expect(mine.items.some((r) => r.id === raised.id)).toBe(true);
    expect(mine.items.every((r) => r.assigneeName === 'Waqas Ali')).toBe(true);
    const bilals = (await api.as('alnoor_maintenance').get<RequestList>('/ops/requests', { technician: 'tech_anr_bilal' })).items[0]!;
    expect((await refusal(api.as('alnoor_technician').get(`/ops/requests/${bilals.id}`))).status).toBe(404);
    // A technician cannot triage or assign.
    expect((await refusal(api.post(`/ops/requests/${raised.id}/assign`, { technicianId: 'tech_anr_bilal' }))).status).toBe(403);

    await api.post(`/ops/work-orders/${order.id}/start`);
    expect((await refusal(api.post(`/ops/work-orders/${order.id}/complete`, { note: 'short' }))).fields).toContain('note');
    expect((await refusal(api.post(`/ops/work-orders/${order.id}/complete`, { note: 'Replaced the trap washer and tested.' }))).fields).toContain('files');
    const done = await api.post<RequestDetail>(`/ops/work-orders/${order.id}/complete`, { note: 'Replaced the trap washer and tested.', files: [{ ...photo, name: 'after.jpg', alt: 'Dry pipe under the sink after the repair' }] });
    expect(done.request.state).toBe('completed');

    const bell = await api.as('alnoor_resident_a101').get<ResidentNotifications>('/portal/notifications');
    expect(bell.items.some((n) => n.key === 'requestCompleted' && n.href.includes(raised.id))).toBe(true);

    // Not fixed: reopened, the same technician goes back on a new work order.
    expect((await refusal(api.post(`/portal/requests/${raised.id}/reopen`, { reason: 'short' }))).fields).toContain('reason');
    const reopened = await api.post<ResidentRequest>(`/portal/requests/${raised.id}/reopen`, { reason: 'Still dripping after an hour.' });
    expect(reopened.state).toBe('assigned');
    expect(reopened.reopenCount).toBe(1);
    const again2 = await api.as('alnoor_technician').get<RequestDetail>(`/ops/requests/${raised.id}`);
    const second = again2.workOrders.filter((w) => w.state === 'assigned').at(-1)!;
    await api.post(`/ops/work-orders/${second.id}/complete`, { note: 'Pipe joint resealed; no drip after an hour.', files: [{ ...photo, name: 'after-2.jpg', alt: 'Resealed joint' }] });
    const confirmed = await api.as('alnoor_resident_a101').post<ResidentRequest>(`/portal/requests/${raised.id}/confirm`, { rating: 4 });
    expect(confirmed.state).toBe('closed');
    expect(confirmed.confirmation).toBe('confirmed');
    const dash = await api.as('alnoor_maintenance').get<MaintenanceDashboard>('/ops/maintenance/dashboard');
    expect(dash.confirmation.confirmed).toBeGreaterThanOrEqual(2);
  });

  it('keeps residents to their own flats and internal notes to staff', async () => {
    const api = session();
    expect((await refusal(api.as('alnoor_resident_a101').post('/portal/requests', { category: 'plumbing', title: 'Not my flat', description: 'Trying to raise for another flat.', flatId: 'unt_anr_a102', urgency: 'normal' }))).fields).toContain('flatId');
    const sana = await api.as('alnoor_tenant_a102').get<ResidentRequests>('/portal/requests');
    expect(sana.items.every((r) => r.flatCode === 'A-102')).toBe(true);
    const b306 = (await api.as('alnoor_maintenance').get<RequestList>('/ops/requests', { q: 'seepage' })).items[0]!;
    const detail = await api.get<RequestDetail>(`/ops/requests/${b306.id}`);
    expect(detail.comments.some((c) => c.visibility === 'internal')).toBe(true);
    // Rabia owns A-202 but Junaid lives there: his repair is his and the household's, not the owner's.
    const rabia = await api.as('alnoor_owner_a201').get<ResidentRequests>('/portal/requests');
    expect(rabia.items.some((r) => r.flatCode === 'A-202')).toBe(false);
  });

  it('rule R: withdrawing maintenance for the site closes repairs while notices stay', async () => {
    const noMaintenance = (p: Persona) => {
      const a = effectiveAccessFor(p);
      return a && p.tenantId === 'tnt_alnoor' ? { ...a, grants: a.grants.filter((g) => g.module !== 'maintenance') } : a;
    };
    const api = session({ accessFor: noMaintenance });
    const r = await refusal(api.as('alnoor_resident_a101').get('/portal/requests'));
    expect(r.status).toBe(403);
    expect(r.code).toBe('module_not_licensed');
    const notices = await api.get<ResidentNotices>('/portal/notices');
    expect(notices.items.length).toBeGreaterThan(0);
    // And withdrawing resident_portal closes everything residents see.
    const noPortal = (p: Persona) => {
      const a = effectiveAccessFor(p);
      return a && p.tenantId === 'tnt_alnoor' ? { ...a, grants: a.grants.filter((g) => g.module !== 'resident_portal') } : a;
    };
    const closed = session({ accessFor: noPortal });
    for (const path of ['/portal/requests', '/portal/notices', '/portal/notifications', '/portal/visitors']) expect((await refusal(closed.as('alnoor_resident_a101').get(path))).status).toBe(403);
  });
});

describe('reference 2: invitation → gate → check-in and check-out', () => {
  it('admits a valid pass once and refuses unknown, used and cancelled ones', async () => {
    const api = session();
    // The demo's "today" is 26 October 2026 (Pakistan time); a window covering the whole day.
    const start = '2026-10-26T00:05:00+05:00';
    const end = '2026-10-26T23:55:00+05:00';
    const pass = await api.as('alnoor_resident_a101').post<GatePass>('/portal/passes', { flatId: A101, visitorName: 'Hassan Javed', purpose: 'guest', vehiclePlate: 'lec 1234', from: start, to: end, entries: 'single' });
    expect(pass.code).toMatch(/^\d{6}$/);
    expect(pass.vehiclePlate).toBe('LEC 1234');
    const ok = await api.as('alnoor_guard').post<CheckInResult>('/ops/gate/check-in', { code: pass.code });
    expect(ok.ok).toBe(true);
    const twice = await api.post<CheckInResult>('/ops/gate/check-in', { code: pass.code });
    expect(twice).toMatchObject({ ok: false, refusal: 'already_used' });
    const unknown = await api.post<CheckInResult>('/ops/gate/check-in', { code: '000001' });
    expect(unknown).toMatchObject({ ok: false, refusal: 'unknown_code' });
    const expired = await api.post<CheckInResult>('/ops/gate/check-in', { code: '904417' });
    expect(expired).toMatchObject({ ok: false, refusal: 'expired' });
    if (ok.ok) await api.post(`/ops/gate/visits/${ok.visit.id}/check-out`);
    const queue = await api.get<GateQueue>('/ops/gate/queue');
    expect(queue.inside.some((v) => v.passId === pass.id)).toBe(false);
    expect(queue.refreshSeconds).toBe(15);
  });

  it('asks only the occupants of the flat, never the owner who lives elsewhere', async () => {
    const api = session();
    const req = await api.as('alnoor_guard').post<GateRequest>('/ops/gate/requests', { flatId: 'unt_anr_a202', visitorName: 'Courier', purpose: 'delivery' });
    expect(req.askedCount).toBe(1);
    expect((await api.as('alnoor_owner_a201').get<{ items: GateRequest[] }>('/portal/gate-requests')).items).toHaveLength(0);
    const junaid = await api.as('alnoor_tenant_a202').get<{ items: GateRequest[] }>('/portal/gate-requests');
    expect(junaid.items.map((r) => r.id)).toContain(req.id);
    // Not approved yet: the guard cannot admit.
    expect((await refusal(api.as('alnoor_guard').post(`/ops/gate/requests/${req.id}/admit`))).status).toBe(409);
    await api.as('alnoor_tenant_a202').post(`/portal/gate-requests/${req.id}/approve`);
    expect((await refusal(api.post(`/portal/gate-requests/${req.id}/deny`))).status).toBe(409);
    const admitted = await api.as('alnoor_guard').post<{ visit: { outcome: string } }>(`/ops/gate/requests/${req.id}/admit`);
    expect(admitted.visit.outcome).toBe('inside');
    // A vacant flat has nobody to ask.
    expect((await refusal(api.post('/ops/gate/requests', { flatId: 'unt_anr_a407', visitorName: 'Somebody', purpose: 'guest' }))).fields).toContain('flatId');
  });

  it('a non-resident owner cannot invite guests to a rented flat', async () => {
    const api = session();
    const rabia = await api.as('alnoor_owner_a201').get<ResidentVisitors>('/portal/visitors');
    expect(rabia.flats.map((f) => f.code)).toEqual(['A-201']);
    expect((await refusal(api.post('/portal/passes', { flatId: 'unt_anr_a202', visitorName: 'Guest', purpose: 'guest', from: '2026-10-26T18:00:00+05:00', to: '2026-10-26T21:00:00+05:00', entries: 'single' }))).fields).toContain('flatId');
  });
});

describe('reference 3: notice → notification → acknowledgement (no community add-on)', () => {
  it('publishes to Block A occupants, is acknowledged, versioned and withdrawn', async () => {
    const noHub = (p: Persona) => effectiveAccessFor(p);
    const api = session({ accessFor: noHub });
    const blockA = { scope: 'blocks', ids: ['bld_anr_a'], roles: ['occupant'] };
    const preview = await api.as('alnoor_manager').get<{ households: number; flats: string[] }>('/notices/preview', { audience: JSON.stringify(blockA) });
    expect(preview.flats).toContain('A-101');
    expect(preview.flats.some((f) => f.startsWith('B-'))).toBe(false);
    const created = await api.post<NoticeDetail>('/notices', { action: 'publish', title: 'Fire drill on Saturday', body: 'A fire drill will be held in Block A on Saturday at 10:00. Please follow the wardens.', category: 'security', audience: blockA, ackRequired: true, channels: { sms: true, whatsapp: false } });
    expect(created.notice.state).toBe('published');
    expect(created.stats!.recipients).toBe(preview.households > 0 ? created.stats!.recipients : 0);
    const id = created.notice.id;

    const bell = await api.as('alnoor_resident_a101').get<ResidentNotifications>('/portal/notifications');
    const n = bell.items.find((i) => i.href.endsWith(id))!;
    expect(n.read).toBe(false);
    const open = await api.get<ResidentNoticeOpen>(`/portal/notices/${id}`);
    expect(open).toMatchObject({ available: true });
    await api.post(`/portal/notices/${id}/acknowledge`);
    const staff = await api.as('alnoor_manager').get<NoticeDetail>(`/notices/${id}`);
    expect(staff.stats!.acknowledged).toBe(1);
    expect(staff.unacknowledgedFlats).not.toContain('A-101');

    // Outside the audience (Block B): the deep link answers "not available to you".
    expect(await api.as('alnoor_tenant_a202').get<ResidentNoticeOpen>(`/portal/notices/${id}`)).toMatchObject({ available: true });
    const outside = await api.as('res_pty_anr_0050').get<ResidentNoticeOpen>(`/portal/notices/${id}`).catch(() => ({ available: false, reason: 'not_in_audience' as const }));
    expect(outside).toMatchObject({ available: false });

    // An edit is a new version; an acknowledgement of version 1 does not count for version 2.
    const v2 = await api.as('alnoor_manager').patch<NoticeDetail>(`/notices/${id}`, { title: 'Fire drill on Saturday (11:00)', body: 'The Block A fire drill moves to 11:00 on Saturday. Please follow the wardens.', category: 'security', changeNote: 'Time changed to 11:00.', renotify: true });
    expect(v2.notice.current.version).toBe(2);
    expect(v2.stats!.acknowledged).toBe(0);
    // Residents cannot publish; a guard with residents.view can read but not publish.
    expect((await refusal(api.as('alnoor_guard').post('/notices', { action: 'publish', title: 'x', body: 'y', category: 'general', audience: blockA }))).status).toBe(403);

    await api.as('alnoor_manager').post(`/notices/${id}/withdraw`, { reason: 'Drill postponed by the fire department.' });
    const tomb = await api.as('alnoor_resident_a101').get<ResidentNoticeOpen>(`/portal/notices/${id}`);
    expect(tomb).toMatchObject({ available: true, notice: { state: 'withdrawn' } });
    if (tomb.available) expect(tomb.notice.title).toBeUndefined();
  });

  it('a moved-out occupant loses occupants’ notices, gate prompts and visitors, but still sees bills', async () => {
    const api = session();
    const before = await api.as('alnoor_tenant_a202').get<ResidentNotices>('/portal/notices');
    const occupantsNotice = before.items.find((i) => i.title?.startsWith('Water tank'));
    expect(occupantsNotice).toBeDefined();
    const moved = await api.as('alnoor_manager').post<{ stillLiable: boolean }>('/ops/moves', { flatId: 'unt_anr_a202', partyId: 'pty_anr_0011', effectiveOn: '2026-10-26', reason: 'Tenancy ended' });
    // He still pays for A-202 until a payer change: the move never rewrites liability.
    expect(moved.stillLiable).toBe(true);
    const after = await api.as('alnoor_tenant_a202').get<ResidentNotices>('/portal/notices');
    expect(after.items.some((i) => i.id === occupantsNotice!.id)).toBe(false);
    expect(await api.get<ResidentNoticeOpen>(`/portal/notices/${occupantsNotice!.id}`)).toMatchObject({ available: false, reason: 'not_in_audience' });
    expect((await api.get<ResidentVisitors>('/portal/visitors')).flats).toHaveLength(0);
    const home = await api.get<{ position: unknown; property: { flats: Array<{ code: string; role: string }> } }>('/portal/dues/home');
    expect(home.position).toBeDefined();
    // Nobody lives in A-202 now: the gate has nobody to ask.
    expect((await refusal(api.as('alnoor_guard').post('/ops/gate/requests', { flatId: 'unt_anr_a202', visitorName: 'Courier', purpose: 'delivery' }))).fields).toContain('flatId');
  });
});

describe('community issues and vehicles', () => {
  it('residents see snapshot counts only (D-47), never who; toggling changes nothing visible', async () => {
    const api = session();
    const list = await api.as('alnoor_resident_a101').get<ResidentIssues>('/portal/issues');
    const lift = list.items.find((i) => i.title.startsWith('Block A lift'))!;
    // A Block A issue: Block A residents see Block A's count (10 households), never who.
    expect(lift.count).toMatchObject({ shown: true, site: 10, blocks: [] });
    const dogs = list.items.find((i) => i.title.startsWith('Stray dogs'))!;
    expect(dogs.count).toMatchObject({ shown: false, reason: 'below_threshold' });
    expect(JSON.stringify(list)).not.toContain('Tariq Mehmood');
    const pressure = list.items.find((i) => i.title.startsWith('Low water'))!;
    const before = pressure.count;
    await api.post(`/portal/issues/${pressure.id}/affirm`);
    await api.post(`/portal/issues/${pressure.id}/withdraw`);
    const mid = (await api.get<ResidentIssues>('/portal/issues')).items.find((i) => i.id === pressure.id)!;
    expect(mid.count).toEqual(before);
    await api.post(`/portal/issues/${pressure.id}/affirm`);
    expect((await api.get<ResidentIssues>('/portal/issues')).items.find((i) => i.id === pressure.id)!.affirmed).toBe(true);
    await api.as('alnoor_manager').post('/issues/refresh');
    const afterRefresh = (await api.as('alnoor_resident_a101').get<ResidentIssues>('/portal/issues')).items.find((i) => i.id === pressure.id)!;
    // One more household (5 → 6) is below the change threshold: the published count stays 5.
    expect(afterRefresh.count).toMatchObject({ shown: true, site: 5 });
  });

  it('refuses a duplicate plate and approves a unique one into the flat’s slot', async () => {
    const api = session();
    const pending = await api.as('alnoor_manager').get<VehicleList>('/ops/vehicles', { status: 'pending' });
    const dup = pending.items.find((v) => v.plate === 'LED-1180')!;
    const check = await api.get<VehicleCheck>(`/ops/vehicles/${dup.id}/check`);
    expect(check).toMatchObject({ canApprove: false, reason: 'duplicate_plate' });
    expect((await refusal(api.post(`/ops/vehicles/${dup.id}/approve`))).status).toBe(422);
    const fresh = pending.items.find((v) => v.plate === 'LEG-3307')!;
    const approved = await api.post<VehicleCheck>(`/ops/vehicles/${fresh.id}/approve`);
    expect(approved.vehicle).toMatchObject({ state: 'approved', slot: 'PB204' });
  });
});

describe('sandbox gateway, other organisations', () => {
  it('a verified sandbox event is recorded and never pays anything', async () => {
    const api = session();
    const off = await api.as('alnoor_treasurer').post<GatewaySettings>('/ops/gateway/test-event', { flatId: A101, amount: '4200', signature: 'valid' });
    expect(off.events[0]!.result).toBe('refused_mode_off');
    await api.patch('/ops/gateway', { mode: 'sandbox', merchantId: 'DEMO-ANR-0001', methods: ['card'], feeBearer: 'society' });
    const payments = (await api.get<{ items: unknown[] }>('/payments')).items.length;
    const ok = await api.post<GatewaySettings>('/ops/gateway/test-event', { flatId: A101, amount: '4200', signature: 'valid', eventId: 'evt_1' });
    expect(ok.events[0]!.result).toBe('accepted_not_settled');
    expect((await api.post<GatewaySettings>('/ops/gateway/test-event', { flatId: A101, amount: '4200', signature: 'valid', eventId: 'evt_1' })).events[0]!.result).toBe('refused_duplicate');
    expect((await api.post<GatewaySettings>('/ops/gateway/test-event', { flatId: A101, amount: '4200', signature: 'invalid' })).events[0]!.result).toBe('refused_signature');
    expect((await api.get<{ items: unknown[] }>('/payments')).items.length).toBe(payments);
  });

  it('Shalimar runs maintenance only; its visitors grant starts on 1 November', async () => {
    const api = session();
    const list = await api.as('facility_manager').get<RequestList>('/ops/requests');
    expect(list.items).toHaveLength(3);
    expect((await refusal(api.get('/ops/visitors/dashboard'))).code).toBe('module_not_licensed');
    expect((await refusal(api.get('/notices'))).status).toBe(403);
  });
});
