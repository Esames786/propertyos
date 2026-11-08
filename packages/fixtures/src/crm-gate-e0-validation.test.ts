import type { LeadDetail, Persona, Unit, UnitDetail } from '@repo/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_DURATION_MS } from './crm-holds';
import { datasetFor } from './datasets';
import { DEMO_STORE_KEY, DemoStore } from './demo-store';
import { MockTransport } from './mock-transport';
import { findPersona, PERSONAS } from './people';
import { tenantRole } from './role-templates';

/**
 * Gate E.0 validation of GPT's branch 23cc163 (Issues #22 and #23), run on the accepted integration
 * 373d0cf. Each block names the repair it proves; the tests marked "repair" fail on 23cc163 as merged
 * and pass on the repaired code (see docs/status/gate-e0/REPORT.md).
 *
 * Conventions:
 * - A refusal is compared as its whole serialized form (error name, message and problem) with only the
 *   random correlation id masked: byte-identical, not "similar".
 * - "State unchanged" compares the whole demo store (every partition, serialized as the browser keeps
 *   it), not one map.
 * - Time is a fake clock (vi.setSystemTime). No test waits on the wall clock.
 */

const L = datasetFor('tnt_larkspur')!;
const C = datasetFor('tnt_crescent')!;
const heightsLead = L.leads.find((l) => l.projectId === 'prj_heights')!;
const gardensLead = L.leads.find((l) => l.projectId === 'prj_gardens')!;
const heightsUnits = L.units.filter((u) => u.projectId === 'prj_heights' && u.status === 'available');
/** The first available Heights flat in data order (so it is the first match of a lead priced at it). */
const heightsUnit = heightsUnits[0]!;
const heightsUnit2 = heightsUnits[1]!;
const gardensUnit = L.units.find((u) => u.projectId === 'prj_gardens' && u.status === 'available')!;
const gardensVisit = L.visits.find((v) => v.projectId === 'prj_gardens')!;
const NEVER_LEAD = 'led_never_issued_e0';
const NEVER_UNIT = 'unt_never_issued_e0';
const NEVER_VISIT = 'vst_never_issued_e0';
const T0 = Date.parse('2026-11-08T10:00:00.000Z');

const bilal = findPersona('sales')!;
const nadia = findPersona('manager')!;

/**
 * Test-only principals (not demo identities, never offered on a sign-in page):
 * - a second Heights salesperson with Bilal's exact role and scope, a different principal;
 * - an inventory officer (Larkspur's starter "inventory" role: may view and hold units, may not read leads);
 * - a holder of `unit.hold` alone (no `unit.view`), to prove the unit permission is checked before the id.
 */
const peer = { ...bilal, id: 'res_e0_test_peer', principalId: 'usr_e0_test_peer', displayName: 'E0 Test Peer' } as unknown as Persona;
const inventoryOfficer = {
  ...bilal,
  id: 'res_e0_test_inventory',
  principalId: 'usr_e0_test_inventory',
  displayName: 'E0 Test Inventory',
  roleId: 'inventory',
  permissions: tenantRole('tnt_larkspur', 'inventory').permissions,
  projectScope: 'all',
} as unknown as Persona;
const holdOnly = { ...bilal, id: 'res_e0_test_holdonly', principalId: 'usr_e0_test_holdonly', displayName: 'E0 Test Hold Only', permissions: ['unit.hold'], projectScope: 'all' } as unknown as Persona;
const TEST_PERSONAS: readonly Persona[] = [...PERSONAS, peer, inventoryOfficer, holdOnly];

function world() {
  const mem = new Map<string, string>();
  const demo = new DemoStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
  const context = { personaId: 'manager', projectId: 'all' };
  const api = new MockTransport({ getContext: () => ({ ...context }), getMode: () => 'fast', demo, personas: TEST_PERSONAS });
  return {
    api,
    demo,
    /** Switches the calling identity (and header project) of the same browser session. */
    as(personaId: string, projectId = 'all') {
      context.personaId = personaId;
      context.projectId = projectId;
      return api;
    },
    /** The whole demo store as the browser keeps it. */
    snapshot(): string {
      demo.save();
      return mem.get(DEMO_STORE_KEY) ?? '';
    },
    holds: () => demo.partition('tnt_larkspur').holds(),
  };
}

/** The refusal, serialized whole, with only the random correlation id masked. */
async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { problem?: { correlationId?: string } };
    expect(err.problem?.correlationId, 'a refusal carries a correlation id').toMatch(/^demo-/);
    return JSON.stringify({ name: err.name, message: err.message, problem: { ...err.problem, correlationId: '<masked>' } });
  }
  throw new Error('expected a refusal');
}
const NOT_FOUND = JSON.stringify({ name: 'ApiError', message: 'not_found', problem: { status: 404, code: 'not_found', messageKey: 'errors:api.notFound', correlationId: '<masked>', changed: false } });

/**
 * Warms the identity's session: the D.1 identity gate records a browser session on the first request
 * of each identity (a legitimate write), so "state unchanged" is measured after it.
 */
async function signIn(w: ReturnType<typeof world>, personaId: string, projectId = 'all') {
  await w.as(personaId, projectId).request({ method: 'GET', path: '/notifications' });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe('Issue #22: lead ids out of scope answer exactly like ids never issued', () => {
  it('every lead route: Bilal (Heights only) cannot tell a Gardens lead from an invented id, and nothing changes', async () => {
    const w = world();
    await signIn(w, 'sales');
    const api = w.as('sales');
    await expect(api.request<LeadDetail>({ method: 'GET', path: `/leads/${heightsLead.id}` })).resolves.toMatchObject({ lead: { id: heightsLead.id } });
    const before = w.snapshot();
    const routes: Array<[string, (leadId: string) => Parameters<MockTransport['request']>[0]]> = [
      ['GET lead 360 (incl. matching)', (id) => ({ method: 'GET', path: `/leads/${id}` })],
      ['POST activity', (id) => ({ method: 'POST', path: `/leads/${id}/activity`, body: { kind: 'note', note: 'probe' } })],
      ['POST status', (id) => ({ method: 'POST', path: `/leads/${id}/status`, body: { status: 'contacted' } })],
      ['POST follow-up', (id) => ({ method: 'POST', path: `/leads/${id}/follow-up`, body: { done: true } })],
      ['POST visit', (id) => ({ method: 'POST', path: '/visits', body: { leadId: id, at: '2026-11-12T10:00:00+05:00' } })],
      ['POST hold', (id) => ({ method: 'POST', path: `/units/${heightsUnit.id}/hold`, body: { leadId: id } })],
    ];
    for (const [name, req] of routes) {
      const hidden = await refusal(api.request(req(gardensLead.id)));
      const invented = await refusal(api.request(req(NEVER_LEAD)));
      expect(hidden, name).toBe(invented);
      expect(hidden, name).toBe(NOT_FOUND);
    }
    expect(w.snapshot()).toBe(before);
  });

  it('a hidden visit and an invented visit id answer alike on the visit status route', async () => {
    const w = world();
    await signIn(w, 'sales');
    const before = w.snapshot();
    const hidden = await refusal(w.as('sales').request({ method: 'POST', path: `/visits/${gardensVisit.id}/status`, body: { status: 'confirmed' } }));
    const invented = await refusal(w.as('sales').request({ method: 'POST', path: `/visits/${NEVER_VISIT}/status`, body: { status: 'confirmed' } }));
    expect(hidden).toBe(invented);
    expect(hidden).toBe(NOT_FOUND);
    expect(w.snapshot()).toBe(before);
  });

  it('the header project narrows at once: Nadia filtered to Gardens gets the 404 of an invented id for a Heights lead, and sees it again when she widens', async () => {
    const w = world();
    await signIn(w, 'manager');
    const narrowed = await refusal(w.as('manager', 'prj_gardens').request({ method: 'GET', path: `/leads/${heightsLead.id}` }));
    expect(narrowed).toBe(await refusal(w.as('manager', 'prj_gardens').request({ method: 'GET', path: `/leads/${NEVER_LEAD}` })));
    await expect(w.as('manager', 'all').request<LeadDetail>({ method: 'GET', path: `/leads/${heightsLead.id}` })).resolves.toMatchObject({ lead: { id: heightsLead.id } });
  });

  it('matching never offers another project’s inventory to a site-limited salesperson', async () => {
    const w = world();
    const detail = await w.as('sales').request<LeadDetail>({ method: 'GET', path: `/leads/${heightsLead.id}` });
    expect(detail.matchedUnits.every((u) => u.projectId === 'prj_heights')).toBe(true);
  });

  it('repair: the lead permission is checked before the id, so someone who may hold units but not read leads cannot probe lead ids', async () => {
    const w = world();
    await signIn(w, 'res_e0_test_inventory');
    const before = w.snapshot();
    const hold = (leadId: string) => w.as('res_e0_test_inventory').request({ method: 'POST', path: `/units/${heightsUnit.id}/hold`, body: { leadId } });
    const known = await refusal(hold(heightsLead.id));
    const invented = await refusal(hold(NEVER_LEAD));
    expect(known).toBe(invented);
    expect(JSON.parse(known).problem).toMatchObject({ status: 403, code: 'forbidden' });
    expect(w.snapshot()).toBe(before);
  });

  it('a missing base permission stays 403 for every id (Farah holds no lead permission)', async () => {
    const w = world();
    const known = await refusal(w.as('finance').request({ method: 'GET', path: `/leads/${heightsLead.id}` }));
    expect(known).toBe(await refusal(w.as('finance').request({ method: 'GET', path: `/leads/${NEVER_LEAD}` })));
    expect(JSON.parse(known).problem).toMatchObject({ status: 403, code: 'permission_missing' });
  });
});

describe('Issue #22 on unit routes: a unit out of scope answers like a unit never issued', () => {
  it('repair: GET unit 360, POST hold and POST release give Bilal the same 404 for a Gardens unit as for an invented id; nothing changes', async () => {
    const w = world();
    await signIn(w, 'sales');
    const api = w.as('sales');
    const before = w.snapshot();
    const routes: Array<[string, (unitId: string) => Parameters<MockTransport['request']>[0]]> = [
      ['GET unit 360', (id) => ({ method: 'GET', path: `/units/${id}` })],
      ['POST hold', (id) => ({ method: 'POST', path: `/units/${id}/hold`, body: { leadId: heightsLead.id } })],
      ['POST release', (id) => ({ method: 'POST', path: `/units/${id}/release`, body: {} })],
    ];
    for (const [name, req] of routes) {
      const hidden = await refusal(api.request(req(gardensUnit.id)));
      expect(hidden, name).toBe(await refusal(api.request(req(NEVER_UNIT))));
      expect(hidden, name).toBe(NOT_FOUND);
    }
    expect(w.snapshot()).toBe(before);
  });

  it('repair: the unit permission is checked before the id (a holder of unit.hold without unit.view)', async () => {
    const w = world();
    await signIn(w, 'res_e0_test_holdonly');
    const before = w.snapshot();
    const known = await refusal(w.as('res_e0_test_holdonly').request({ method: 'POST', path: `/units/${heightsUnit.id}/release`, body: {} }));
    expect(known).toBe(await refusal(w.as('res_e0_test_holdonly').request({ method: 'POST', path: `/units/${NEVER_UNIT}/release`, body: {} })));
    expect(JSON.parse(known).problem).toMatchObject({ status: 403, code: 'permission_missing' });
    expect(w.snapshot()).toBe(before);
  });

  it('licensing outcomes of the organisation’s own sites are unchanged (CP2; owner decision E-28)', async () => {
    const t = new MockTransport({ getContext: () => ({ personaId: 'cb_manager', projectId: 'all' }), getMode: () => 'fast', demo: world().demo });
    const plaza = C.units.find((u) => u.projectId === 'prj_cb_plaza')!;
    expect(JSON.parse(await refusal(t.request({ method: 'GET', path: `/units/${plaza.id}` }))).problem).toMatchObject({ status: 403, code: 'site_not_licensed' });
  });
});

describe('Issue #23: hold expiry on one clock and one active-hold projection', () => {
  async function heldLead(w: ReturnType<typeof world>) {
    const created = await w.as('manager').request<{ id: string }>({ method: 'POST', path: '/leads', body: { fullName: 'E0 Clock Test', phone: '03001234567', projectId: 'prj_heights', unitId: heightsUnit.id, source: 'walk_in' } });
    const placed = await w.as('manager').request<{ ok: true; until: string }>({ method: 'POST', path: `/units/${heightsUnit.id}/hold`, body: { leadId: created.id } });
    return { leadId: created.id, until: placed.until };
  }
  const unitView = (w: ReturnType<typeof world>, who = 'manager') => w.as(who).request<UnitDetail>({ method: 'GET', path: `/units/${heightsUnit.id}` });
  const listed = async (w: ReturnType<typeof world>) => (await w.as('manager').request<Unit[]>({ method: 'GET', path: '/units', query: { q: heightsUnit.ref } })).find((u) => u.id === heightsUnit.id)!;

  it('the expiry is written from the same clock that later decides it: exactly 48 hours after the fake now', async () => {
    const w = world();
    const { until } = await heldLead(w);
    expect(until).toBe(new Date(T0 + HOLD_DURATION_MS).toISOString());
    expect(w.holds()[heightsUnit.id]).toEqual({ leadId: expect.any(String), leadRef: expect.any(String), until, principalId: nadia.principalId });
  });

  it('repair: one millisecond before expiry every read and write sees the hold; at expiry none does (unit 360, the unit list, lead matching, hold and release)', async () => {
    const w = world();
    const { leadId } = await heldLead(w);

    vi.setSystemTime(T0 + HOLD_DURATION_MS - 1);
    expect((await unitView(w)).status).toBe('held');
    expect((await listed(w)).status).toBe('held');
    const live = await w.as('manager').request<LeadDetail>({ method: 'GET', path: `/leads/${leadId}` });
    expect(live.interestUnit?.hold?.until).toBeDefined();
    expect(live.matchedUnits[0]).toMatchObject({ id: heightsUnit.id, status: 'held' });
    expect(JSON.parse(await refusal(w.as('sales').request({ method: 'POST', path: `/units/${heightsUnit.id}/hold`, body: { leadId: heightsLead.id } }))).problem).toMatchObject({ status: 422, code: 'validation_failed' });

    vi.setSystemTime(T0 + HOLD_DURATION_MS);
    const stored = w.snapshot();
    const view = await unitView(w);
    expect(view.status).toBe('available');
    expect(view.hold).toBeUndefined();
    expect((await listed(w)).status).toBe('available');
    const expired = await w.as('manager').request<LeadDetail>({ method: 'GET', path: `/leads/${leadId}` });
    expect(expired.interestUnit?.hold).toBeUndefined();
    expect(expired.matchedUnits[0]).toMatchObject({ id: heightsUnit.id, status: 'available' });
    expect(expired.matchedUnits[0]!.hold).toBeUndefined();
    // Reading never deletes the stored hold or rewrites history.
    expect(w.snapshot()).toBe(stored);
    expect(expired.activity.some((a) => a.messageKey === 'activity.unitHeld')).toBe(true);

    // The initiator cannot release what has expired: the answer of a unit never held, nothing changes.
    const late = await refusal(w.as('manager').request({ method: 'POST', path: `/units/${heightsUnit.id}/release`, body: {} }));
    expect(late).toBe(await refusal(w.as('manager').request({ method: 'POST', path: `/units/${heightsUnit2.id}/release`, body: {} })));
    expect(late).toBe(NOT_FOUND);
    expect(w.snapshot()).toBe(stored);

    // Someone else may hold it again; the new expiry runs from the new now.
    await signIn(w, 'sales');
    const again = await w.as('sales').request<{ until: string }>({ method: 'POST', path: `/units/${heightsUnit.id}/hold`, body: { leadId: heightsLead.id } });
    expect(again.until).toBe(new Date(T0 + 2 * HOLD_DURATION_MS).toISOString());
    expect(w.holds()[heightsUnit.id]).toMatchObject({ leadId: heightsLead.id, principalId: bilal.principalId });
  });
});

describe('Issue #23: only the initiating principal releases', () => {
  it('a peer with the same role and scope, an unknown hold and an expired hold get the same 404; the store is byte-identical; the initiator then releases', async () => {
    const w = world();
    for (const who of ['sales', 'res_e0_test_peer', 'manager']) await signIn(w, who);
    await w.as('sales').request({ method: 'POST', path: `/units/${heightsUnit.id}/hold`, body: { leadId: heightsLead.id } });
    const before = w.snapshot();
    const byPeer = await refusal(w.as('res_e0_test_peer').request({ method: 'POST', path: `/units/${heightsUnit.id}/release`, body: {} }));
    const byManager = await refusal(w.as('manager').request({ method: 'POST', path: `/units/${heightsUnit.id}/release`, body: {} }));
    const notHeld = await refusal(w.as('res_e0_test_peer').request({ method: 'POST', path: `/units/${heightsUnit2.id}/release`, body: {} }));
    const unknown = await refusal(w.as('res_e0_test_peer').request({ method: 'POST', path: `/units/${NEVER_UNIT}/release`, body: {} }));
    expect(byPeer).toBe(notHeld);
    expect(byManager).toBe(notHeld);
    expect(unknown).toBe(notHeld);
    expect(byPeer).toBe(NOT_FOUND);
    expect(w.snapshot()).toBe(before);
    await expect(w.as('sales').request({ method: 'POST', path: `/units/${heightsUnit.id}/release`, body: {} })).resolves.toEqual({ ok: true });
    expect(w.holds()[heightsUnit.id]).toBeUndefined();
  });

  it('repair: only the initiator is told the hold is releasable (the drawer offers Release to nobody else)', async () => {
    const w = world();
    await w.as('sales').request({ method: 'POST', path: `/units/${heightsUnit.id}/hold`, body: { leadId: heightsLead.id } });
    expect((await w.as('sales').request<UnitDetail>({ method: 'GET', path: `/units/${heightsUnit.id}` })).hold).toEqual({ leadRef: heightsLead.ref, until: expect.any(String), releasable: true });
    expect((await w.as('res_e0_test_peer').request<UnitDetail>({ method: 'GET', path: `/units/${heightsUnit.id}` })).hold).toEqual({ leadRef: heightsLead.ref, until: expect.any(String) });
    expect((await w.as('manager').request<UnitDetail>({ method: 'GET', path: `/units/${heightsUnit.id}` })).hold).toEqual({ leadRef: heightsLead.ref, until: expect.any(String) });
  });

  it('a legacy hold without a recorded initiator fails closed until it expires, and a demo reset clears it', async () => {
    const w = world();
    for (const who of ['manager', 'sales']) await signIn(w, who);
    w.demo.partition('tnt_larkspur').hold(heightsUnit.id, { leadId: heightsLead.id, leadRef: heightsLead.ref, until: new Date(T0 + 3_600_000).toISOString() });
    const before = w.snapshot();
    expect((await w.as('manager').request<UnitDetail>({ method: 'GET', path: `/units/${heightsUnit.id}` })).hold).toEqual({ leadRef: heightsLead.ref, until: expect.any(String) });
    for (const who of ['manager', 'sales']) {
      expect(await refusal(w.as(who).request({ method: 'POST', path: `/units/${heightsUnit.id}/release`, body: {} })), who).toBe(NOT_FOUND);
    }
    expect(w.snapshot()).toBe(before);
    vi.setSystemTime(T0 + 3_600_000);
    expect((await w.as('manager').request<UnitDetail>({ method: 'GET', path: `/units/${heightsUnit.id}` })).status).toBe('available');
    await w.api.request({ method: 'POST', path: '/demo/reset' });
    expect(w.holds()).toEqual({});
  });
});

describe('Issue #23 with #22: a hold never names a lead the reader cannot see', () => {
  it('repair: a hold is for a lead of the unit’s own project (Nadia cannot hold a Heights flat for a Gardens lead); nothing changes', async () => {
    const w = world();
    await signIn(w, 'manager');
    const before = w.snapshot();
    const cross = await refusal(w.as('manager').request({ method: 'POST', path: `/units/${heightsUnit.id}/hold`, body: { leadId: gardensLead.id } }));
    expect(JSON.parse(cross).problem).toMatchObject({ status: 422, code: 'validation_failed', errors: { unit: [{ code: 'forms:errors.unitUnavailable' }] } });
    expect(w.snapshot()).toBe(before);
  });

  it('repair: a reader without the lead permission sees that a unit is held and until when, never for which lead', async () => {
    const w = world();
    await w.as('sales').request({ method: 'POST', path: `/units/${heightsUnit.id}/hold`, body: { leadId: heightsLead.id } });
    const officer = await w.as('res_e0_test_inventory').request<UnitDetail>({ method: 'GET', path: `/units/${heightsUnit.id}` });
    expect(officer.status).toBe('held');
    expect(officer.hold).toEqual({ until: expect.any(String) });
    expect(JSON.stringify(officer)).not.toContain(heightsLead.ref);
    const listed = (await w.as('res_e0_test_inventory').request<Unit[]>({ method: 'GET', path: '/units', query: { q: heightsUnit.ref } })).find((u) => u.id === heightsUnit.id)!;
    expect(listed.status).toBe('held');
    expect(JSON.stringify(listed)).not.toContain(heightsLead.ref);
  });
});
