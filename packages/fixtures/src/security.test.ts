import {
  MODULE_KEYS,
  PERMISSIONS,
  type DashboardSummary,
  type EffectiveAccess,
  type InvoiceHistoryResponse,
  type LeadDetail,
  type LeadListResponse,
  type MyAccess,
  type PartyLink,
  type PortalPayments,
  type RecordAccess,
  type SearchResponse,
  type Unit,
} from '@repo/contracts';
import { describe, expect, it, vi } from 'vitest';
import { datasetFor } from './datasets';
import { DemoStore } from './demo-store';
import { HANDLERS, type Handler } from './handlers';
import { invoiceRecord } from './handler-types';
import { MockTransport, type MockContext } from './mock-transport';
import { findPersona, PERSONAS } from './people';
import { effectiveAccessFor } from './tenant-directory';

/**
 * CP2 security corrections (owner review of Gate B checkpoint 2): fail-closed transport, site-level
 * entitlements, resident and billing-account authorisation, the suspended tenant and tenant
 * switching. Every refusal must happen before a handler reads or changes anything.
 */

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

interface Options {
  demo?: DemoStore;
  handlers?: readonly Handler[];
  accessFor?: ConstructorParameters<typeof MockTransport>[0]['accessFor'];
  personas?: ConstructorParameters<typeof MockTransport>[0]['personas'];
  projectId?: string;
}
const as = (personaId: string | null, o: Options = {}) =>
  new MockTransport({
    getContext: (): MockContext => ({ personaId, projectId: o.projectId ?? 'all' }),
    getMode: () => 'fast',
    demo: o.demo ?? new DemoStore(memory()),
    ...(o.handlers ? { handlers: o.handlers } : {}),
    ...(o.accessFor ? { accessFor: o.accessFor } : {}),
    ...(o.personas ? { personas: o.personas } : {}),
  });
const problem = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { problem: { status: number; code: string } }).problem;
  }
  throw new Error('expected a refusal');
};

/**
 * A concrete path for a handler's pattern: named groups become `x1`, except a group of literal
 * alternatives (an action such as `resend|revoke`), which takes its first word.
 */
const samplePath = (re: RegExp) =>
  re.source
    .replace(/^\^/, '')
    .replace(/\$$/, '')
    .replace(/\(\?<\w+>([^)]*)\)/g, (_m, body: string) => (/^[a-z-]+(\|[a-z-]+)+$/.test(body) ? body.split('|')[0]! : 'x1'))
    .replace(/\\\//g, '/');

/** The fixture handlers with spies instead of bodies: a refusal must leave every spy uncalled. */
function spied() {
  const spies = new Map<Handler, ReturnType<typeof vi.fn>>();
  const handlers = HANDLERS.map((h) => {
    const spy = vi.fn(() => ({ reached: true }));
    const copy = { ...h, handle: spy };
    spies.set(copy, spy);
    return copy;
  });
  return { handlers, called: () => [...spies.values()].some((s) => s.mock.calls.length > 0) };
}

const TENANT_HANDLERS = HANDLERS.filter((h) => h.access.kind === 'tenant');

// ------------------------------------------------------------------ 1. fail-closed transport

describe('1. every endpoint declares its access and the transport fails closed', () => {
  it('every handler declares module, permission and suspension class (or is an allow-listed visitor endpoint)', () => {
    const visitors = HANDLERS.filter((h) => h.access.kind === 'visitor').map((h) => `${h.method} ${samplePath(h.pattern)}`);
    expect(visitors.sort()).toEqual(['GET /workspace', 'POST /demo/reset', 'POST /workspace', 'POST /workspace/verify']);
    for (const h of HANDLERS) {
      const a = h.access;
      if (a.kind === 'visitor' || a.kind === 'public') {
        expect(a.why.length, samplePath(h.pattern)).toBeGreaterThan(20);
        continue;
      }
      expect(MODULE_KEYS, samplePath(h.pattern)).toContain(a.module);
      expect(['history_read', 'settlement', 'operational']).toContain(a.suspension);
      const permissions = a.permission === 'signed_in' ? [] : typeof a.permission === 'string' ? [a.permission] : a.permission;
      for (const p of permissions) expect(PERMISSIONS, samplePath(h.pattern)).toContain(p);
    }
    expect(TENANT_HANDLERS.length).toBeGreaterThan(35);
  });

  it('a request without an identity is refused with 401 before any tenant handler runs', async () => {
    const { handlers, called } = spied();
    const t = as(null, { handlers });
    for (const h of TENANT_HANDLERS) {
      const res = await problem(t.request({ method: h.method, path: samplePath(h.pattern), body: {} }));
      expect(res, `${h.method} ${samplePath(h.pattern)}`).toMatchObject({ status: 401, code: 'unauthenticated' });
    }
    expect(called()).toBe(false);
  });

  it('an identity without effective access (or with another organisation’s) is refused with 403', async () => {
    const { handlers, called } = spied();
    const none = as('manager', { handlers, accessFor: () => null });
    const foreign = as('manager', { handlers, accessFor: () => effectiveAccessFor(findPersona('cb_manager')!) });
    for (const h of TENANT_HANDLERS) {
      const path = samplePath(h.pattern);
      expect(await problem(none.request({ method: h.method, path, body: {} })), path).toMatchObject({ status: 403, code: 'no_effective_access' });
      expect(await problem(foreign.request({ method: h.method, path, body: {} })), path).toMatchObject({ status: 403, code: 'no_effective_access' });
    }
    expect(called()).toBe(false);
  });

  it('an unlicensed module is refused before the handler runs (reads and writes)', async () => {
    const { handlers, called } = spied();
    const fm = as('facility_manager', { handlers }); // Shalimar Court: core + maintenance only
    const unlicensed = TENANT_HANDLERS.filter((h) => h.access.kind === 'tenant' && !['core', 'maintenance'].includes(h.access.module));
    expect(unlicensed.some((h) => h.method === 'POST')).toBe(true);
    for (const h of unlicensed) {
      const res = await problem(fm.request({ method: h.method, path: samplePath(h.pattern), body: {} }));
      expect(res, `${h.method} ${samplePath(h.pattern)}`).toMatchObject({ status: 403, code: 'module_not_licensed' });
    }
    expect(called()).toBe(false);
  });

  it('a missing permission is refused before the handler runs', async () => {
    const { handlers, called } = spied();
    const sales = as('sales', { handlers });
    for (const path of ['/finance/invoices', '/workspace/plan', '/portal/payments']) {
      expect(await problem(sales.request({ method: 'GET', path })), path).toMatchObject({ status: 403, code: 'permission_missing' });
    }
    expect(called()).toBe(false);
  });

  it('a refused write changes nothing: no demo partition is even created', async () => {
    const demo = new DemoStore(memory());
    await problem(as('society_admin', { demo }).request({ method: 'POST', path: '/leads', body: { fullName: 'X', phone: '03001234567', projectId: 'prj_heights' } }));
    await problem(as(null, { demo }).request({ method: 'POST', path: '/units/unt_lh_a_0101/hold', body: {} }));
    await problem(as('cedar_treasurer', { demo }).request({ method: 'POST', path: '/notifications/read-all' }));
    expect(demo.partitionKeys()).toEqual([]);
  });
});

// ------------------------------------------------------------------ 2. site-level entitlements

const CB = datasetFor('tnt_crescent')!;
const towerUnit = CB.units.find((u) => u.projectId === 'prj_cb_towers' && u.status === 'available')!;
const plazaUnit = CB.units.find((u) => u.projectId === 'prj_cb_plaza')!;

describe('2. one tenant, two sites, different grants (Crescent Bay)', () => {
  const cb = () => as('cb_manager');

  it('reads: the unit list never contains Plaza shops or the unassigned import', async () => {
    const units = await cb().request<Unit[]>({ method: 'GET', path: '/units' });
    expect(units.length).toBeGreaterThan(0);
    expect(units.every((u) => u.projectId === 'prj_cb_towers')).toBe(true);
    expect(await problem(cb().request({ method: 'GET', path: '/units', query: { projectId: 'prj_cb_plaza' } }))).toMatchObject({ status: 403, code: 'site_not_licensed' });
  });

  it('reads by id: a Towers flat opens, a Plaza shop is refused for its site, an unassigned record for its missing site', async () => {
    await expect(cb().request({ method: 'GET', path: `/units/${towerUnit.id}` })).resolves.toMatchObject({ ref: towerUnit.ref });
    expect(await problem(cb().request({ method: 'GET', path: `/units/${plazaUnit.id}` }))).toMatchObject({ status: 403, code: 'site_not_licensed' });
    expect(await problem(cb().request({ method: 'GET', path: '/units/unt_cb_import_001' }))).toMatchObject({ status: 403, code: 'site_context_missing' });
  });

  it('writes: a Plaza shop cannot be held; a Towers flat can', async () => {
    const demo = new DemoStore(memory());
    const t = as('cb_manager', { demo });
    const lead = CB.leads.find((l) => l.projectId === 'prj_cb_towers')!;
    expect(await problem(t.request({ method: 'POST', path: `/units/${plazaUnit.id}/hold`, body: { leadId: lead.id } }))).toMatchObject({ status: 403, code: 'site_not_licensed' });
    expect(demo.partition('tnt_crescent').holds()).toEqual({});
    await t.request({ method: 'POST', path: `/units/${towerUnit.id}/hold`, body: { leadId: lead.id } });
    expect(Object.keys(demo.partition('tnt_crescent').holds())).toEqual([towerUnit.id]);
  });

  it('a Plaza lead is visible (CRM covers the company) but never matched to Plaza inventory', async () => {
    const plazaLead = CB.leads.find((l) => l.projectId === 'prj_cb_plaza')!;
    const detail = await cb().request<LeadDetail>({ method: 'GET', path: `/leads/${plazaLead.id}` });
    expect(detail.lead.id).toBe(plazaLead.id);
    expect(detail.matchedUnits).toEqual([]);
  });

  it('search: Towers flats are found, Plaza shops are not', async () => {
    const towers = await cb().request<SearchResponse>({ method: 'GET', path: '/search', query: { q: 'CB-A-01' } });
    expect(towers.records.some((r) => r.type === 'unit')).toBe(true);
    const plaza = await cb().request<SearchResponse>({ method: 'GET', path: '/search', query: { q: 'CB-P-01' } });
    expect(plaza.records.filter((r) => r.type === 'unit')).toEqual([]);
    const legacy = await cb().request<SearchResponse>({ method: 'GET', path: '/search', query: { q: 'CB-IMPORT' } });
    expect(legacy.records).toEqual([]);
  });

  it('direct addresses: the record check refuses Plaza inventory, unassigned records and other tenants’ ids', async () => {
    const check = (id: string) => cb().request<RecordAccess>({ method: 'GET', path: '/access/record', query: { id } });
    expect(await check(towerUnit.id)).toEqual({ record: true, module: 'inventory', decision: { allowed: true } });
    expect(await check(plazaUnit.id)).toEqual({ record: true, module: 'inventory', decision: { allowed: false, reason: 'site_not_licensed' } });
    expect(await check('twr_cb_p')).toEqual({ record: true, module: 'inventory', decision: { allowed: false, reason: 'site_not_licensed' } });
    expect(await check('unt_cb_import_001')).toEqual({ record: true, module: 'inventory', decision: { allowed: false, reason: 'site_context_missing' } });
    expect(await check('unt_lh_a_0101')).toMatchObject({ record: true, decision: { allowed: false, reason: 'out_of_scope' } });
    expect(await check('led_0001')).toMatchObject({ record: true, decision: { allowed: false, reason: 'out_of_scope' } });
    expect(await check('apartment_2bed')).toEqual({ record: false });
  });

  it('home: inventory figures and project cards cover the Towers only', async () => {
    const d = await cb().request<DashboardSummary>({ method: 'GET', path: '/dashboard/summary' });
    expect(d.inventory!.map((r) => r.id)).toEqual(['twr_cb_a', 'twr_cb_b']);
    expect(d.projects.map((p) => p.id)).toEqual(['prj_cb_towers']);
    expect(d.residences!.every((r) => r.projectId === 'prj_cb_towers')).toBe(true);
    expect(d.construction?.projectId).toBe('prj_cb_towers');
  });

  it('My access lists each area with the sites it covers, and nothing commercial', async () => {
    const mine = await cb().request<MyAccess>({ method: 'GET', path: '/workspace/my-access' });
    const inventory = mine.areas.find((a) => a.module === 'inventory')!;
    expect(inventory.sites).toEqual([{ id: 'site_cb_towers', name: 'Crescent Bay Towers' }]);
    expect(mine.areas.find((a) => a.module === 'crm')!.sites).toBe('all');
    expect(JSON.stringify(mine)).not.toMatch(/edition|price|mrr|contract|rate/i);
  });
});

// ------------------------------------------------------------------ 3. residents and billing accounts

const resident = findPersona('resident')!;
const residentAccess = (change: (links: PartyLink[]) => PartyLink[], tweak: (a: EffectiveAccess) => EffectiveAccess = (a) => a): EffectiveAccess => {
  const base = effectiveAccessFor(resident)!;
  const scope = base.scopes[0] as Extract<EffectiveAccess['scopes'][number], { type: 'party' }>;
  return tweak({ ...base, scopes: [{ ...scope, links: change([...scope.links]) }] });
};
const portal = (accessFor: () => EffectiveAccess | null, personas = PERSONAS) => as('resident', { accessFor, personas });

describe('3. residents reach only what a verified, in-force liability covers', () => {
  it('the demo resident’s access is his party links, not a project', () => {
    const access = effectiveAccessFor(resident)!;
    expect(access.scopes).toHaveLength(1);
    expect(access.scopes[0]).toMatchObject({ type: 'party', partyId: 'pty_0001' });
    const links = (access.scopes[0] as Extract<EffectiveAccess['scopes'][number], { type: 'party' }>).links;
    expect(links.map((l) => [l.verified, l.to ?? null])).toEqual([[true, null], [true, '2026-04-01'], [false, null]]);
  });

  it('his verified, current flat opens; changing any part of the relationship closes it', async () => {
    await expect(portal(() => effectiveAccessFor(resident)).request({ method: 'GET', path: '/portal/payments' })).resolves.toBeTruthy();
    const current = (l: PartyLink[]) => l.slice(0, 1);
    const cases: Array<[string, (l: PartyLink[]) => PartyLink[]]> = [
      ['unverified', (l) => current(l).map((x) => ({ ...x, verified: false }))],
      ['ended', (l) => current(l).map((x) => ({ ...x, to: '2026-10-01' }))],
      ['not started', (l) => current(l).map((x) => ({ ...x, from: '2026-11-01' }))],
      ['other billing account', (l) => current(l).map((x) => ({ ...x, billingAccountId: 'ba_lh_b_0101' }))],
      ['other site', (l) => current(l).map((x) => ({ ...x, siteId: 'site_lk_gardens' }))],
      ['other legal entity', (l) => current(l).map((x) => ({ ...x, legalEntityId: 'le_crescent' }))],
      ['other flat', (l) => current(l).map((x) => ({ ...x, unitId: 'unt_lh_b_0101' }))],
      ['only the ended and the unverified links', (l) => l.slice(1)],
    ];
    for (const [name, change] of cases) {
      const res = await problem(portal(() => residentAccess(change)).request({ method: 'GET', path: '/portal/payments' }));
      expect(res, name).toMatchObject({ status: 404 });
    }
  });

  it('liability is effective-dated: instalments before the liability began are not his', async () => {
    const full = await portal(() => effectiveAccessFor(resident)).request<PortalPayments>({ method: 'GET', path: '/portal/payments' });
    const later = await portal(() => residentAccess((l) => [{ ...l[0]!, from: '2026-01-01' }])).request<PortalPayments>({ method: 'GET', path: '/portal/payments' });
    expect(later.schedule.length).toBeLessThan(full.schedule.length);
    expect(later.schedule.every((i) => i.dueDate >= '2026-01-01')).toBe(true);
  });

  it('cross-tenant: the same party id in another organisation reaches nothing', async () => {
    const elsewhere = { ...resident, tenantId: 'tnt_crescent' };
    const personas = PERSONAS.map((p) => (p.id === 'resident' ? elsewhere : p));
    // Crescent Bay has not licensed the resident portal at all …
    const unlicensed = await problem(portal(() => effectiveAccessFor(elsewhere), personas).request({ method: 'GET', path: '/portal/home' }));
    expect(unlicensed).toMatchObject({ status: 403, code: 'module_not_licensed' });
    // … and even with the portal licensed, Larkspur's party id has no liability in Crescent Bay's records.
    const licensed = () => {
      const a = effectiveAccessFor(elsewhere)!;
      return { ...a, grants: [...a.grants, { module: 'resident_portal' as const, sites: 'all' as const, from: '2026-10-15', source: 'override' as const }] };
    };
    expect(await problem(portal(licensed, personas).request({ method: 'GET', path: '/portal/home' }))).toMatchObject({ status: 404 });
  });

  it('staff see a financial record only when its unit, billing account, project, site and entity agree', () => {
    const data = datasetFor('tnt_larkspur')!;
    const invoice = data.invoices[0]!;
    expect(invoiceRecord({ data }, invoice)).toMatchObject({ unitId: invoice.unitId, billingAccountId: invoice.billingAccountId, siteId: 'site_lk_heights', legalEntityId: 'le_larkspur' });
    const otherUnit = data.units.find((u) => u.projectId === invoice.projectId && u.id !== invoice.unitId)!;
    const gardensUnit = data.units.find((u) => u.projectId === 'prj_gardens')!;
    expect(invoiceRecord({ data }, { ...invoice, billingAccountId: `ba_${otherUnit.id.slice(4)}` })).toBeNull();
    expect(invoiceRecord({ data }, { ...invoice, unitId: gardensUnit.id, billingAccountId: `ba_${gardensUnit.id.slice(4)}` })).toBeNull();
    expect(invoiceRecord({ data }, { ...invoice, unitId: 'unt_cb_a_0101', billingAccountId: 'ba_cb_a_0101' })).toBeNull();
  });

  it('online payment (simulated) needs online payments licensed for the flat’s site', async () => {
    const t = portal(() => residentAccess((l) => l, (a) => ({ ...a, grants: a.grants.map((g) => (g.module === 'online_payments' ? { ...g, sites: ['site_lk_gardens'] } : g)) })));
    const { schedule } = await t.request<PortalPayments>({ method: 'GET', path: '/portal/payments' });
    const due = schedule.find((i) => i.status === 'due')!;
    expect(await problem(t.request({ method: 'POST', path: `/portal/instalments/${due.id}/simulate-online`, body: {} }))).toMatchObject({ status: 403, code: 'site_not_licensed' });
  });
});

// ------------------------------------------------------------------ 4. suspended tenant

describe('4. a suspended organisation keeps its financial history and nothing else', () => {
  const treasurer = () => as('cedar_treasurer');

  it('financial history stays readable', async () => {
    const history = await treasurer().request<InvoiceHistoryResponse>({ method: 'GET', path: '/finance/invoices' });
    expect(history.total).toBe(72);
    expect(history.items.every((i) => i.ref.startsWith('CH-DUES-'))).toBe(true);
    const search = await treasurer().request<SearchResponse>({ method: 'GET', path: '/search', query: { q: 'CH-DUES-202609' } });
    expect(search.records.length).toBeGreaterThan(0);
    expect(search.records.every((r) => r.type === 'invoice')).toBe(true);
    const record = await treasurer().request<RecordAccess>({ method: 'GET', path: '/access/record', query: { id: history.items[0]!.id } });
    expect(record).toEqual({ record: true, module: 'receivables', decision: { allowed: true } });
    await expect(treasurer().request({ method: 'GET', path: '/workspace/my-access' })).resolves.toBeTruthy();
  });

  it('operational reads and every operational change are refused as suspended', async () => {
    for (const [method, path] of [['GET', '/dashboard/summary'], ['GET', '/demo/overview'], ['POST', '/notifications/read-all'], ['GET', '/practice/records']] as const) {
      expect(await problem(treasurer().request({ method, path })), path).toMatchObject({ status: 403, code: 'tenant_suspended' });
    }
  });

  it('settlement of issued instalments follows the suspension policy (D-20); other resident work is paused', async () => {
    const suspended = (allowSettlement: boolean) => () => residentAccess((l) => l, (a) => ({ ...a, tenant: { ...a.tenant, status: 'suspended', suspensionPolicy: { allowSettlement } } }));
    const open = portal(suspended(true));
    const { schedule } = await open.request<PortalPayments>({ method: 'GET', path: '/portal/payments' });
    const due = schedule.find((i) => i.status === 'due')!;
    const proof = { method: 'bank_transfer', amount: due.amount.amount, paidOn: '2026-10-25', reference: 'FT12345678' };
    await expect(open.request({ method: 'POST', path: `/portal/instalments/${due.id}/proof`, body: proof })).resolves.toMatchObject({ status: 'awaiting_verification' });
    expect(await problem(portal(suspended(false)).request({ method: 'POST', path: `/portal/instalments/${due.id}/proof`, body: proof }))).toMatchObject({ status: 403, code: 'tenant_suspended' });
    expect(await problem(open.request({ method: 'POST', path: '/portal/service-requests', body: { category: 'plumbing', description: 'Tap drips' } }))).toMatchObject({ status: 403, code: 'tenant_suspended' });
    await expect(open.request({ method: 'GET', path: '/portal/home' })).resolves.toBeTruthy();
  });
});

// ------------------------------------------------------------------ 5. tenant switching

describe('5. switching identity or organisation never leaks data or permissions', () => {
  it('a lead created as Larkspur is invisible to Crescent Bay and back again on switching', async () => {
    const demo = new DemoStore(memory());
    let personaId = 'manager';
    const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo });
    const created = await t.request<{ id: string; ref: string }>({ method: 'POST', path: '/leads', body: { fullName: 'Switch Test', phone: '03001234567', projectId: 'prj_heights', source: 'walk_in' } });

    personaId = 'cb_manager';
    const list = await t.request<LeadListResponse>({ method: 'GET', path: '/leads', query: { q: 'Switch Test' } });
    expect(list.total).toBe(0);
    expect((await t.request<SearchResponse>({ method: 'GET', path: '/search', query: { q: 'Switch Test' } })).records).toEqual([]);
    expect(await problem(t.request({ method: 'GET', path: `/leads/${created.id}` }))).toMatchObject({ status: 404 });
    expect(await t.request<RecordAccess>({ method: 'GET', path: '/access/record', query: { id: created.id } })).toMatchObject({ decision: { allowed: false, reason: 'out_of_scope' } });
    // Crescent Bay's own session lead gets its own reference series and partition.
    const own = await t.request<{ ref: string }>({ method: 'POST', path: '/leads', body: { fullName: 'Crescent Visitor', phone: '03007654321', projectId: 'prj_cb_towers', source: 'walk_in' } });
    expect(own.ref).toMatch(/^CB-LD-/);

    personaId = 'manager';
    const back = await t.request<LeadListResponse>({ method: 'GET', path: '/leads', query: { q: 'Switch Test' } });
    expect(back.total).toBe(1);
    expect((await t.request<LeadListResponse>({ method: 'GET', path: '/leads', query: { q: 'Crescent Visitor' } })).total).toBe(0);
    expect(demo.partitionKeys().sort()).toEqual(['tnt_crescent', 'tnt_larkspur']);
  });

  it('practice records, holds and notifications stay with their organisation', async () => {
    const demo = new DemoStore(memory());
    let personaId = 'sales';
    const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo });
    await t.request({ method: 'POST', path: '/practice/leads', body: { name: 'Practice' }, training: true });
    expect((await t.request<{ count: number }>({ method: 'GET', path: '/practice/records' })).count).toBe(1);
    personaId = 'cb_manager';
    expect((await t.request<{ count: number }>({ method: 'GET', path: '/practice/records' })).count).toBe(0);
    const notifications = await t.request<Array<{ id: string }>>({ method: 'GET', path: '/notifications' });
    expect(notifications.every((n) => n.id.startsWith('ntf_cb_'))).toBe(true);
    personaId = 'facility_manager';
    expect(await t.request<unknown[]>({ method: 'GET', path: '/notifications' })).toEqual([]);
  });

  it('the same transport serves each organisation only its own records', async () => {
    let personaId = 'manager';
    const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo: new DemoStore(memory()) });
    const larkspur = await t.request<Unit[]>({ method: 'GET', path: '/units' });
    personaId = 'cb_manager';
    const crescent = await t.request<Unit[]>({ method: 'GET', path: '/units' });
    expect(larkspur.every((u) => u.id.startsWith('unt_lh_') || u.id.startsWith('unt_lg_'))).toBe(true);
    expect(crescent.every((u) => u.id.startsWith('unt_cb_'))).toBe(true);
  });
});
