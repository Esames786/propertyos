import { decideTarget, grantActive, type DashboardSummary, type DemoOverview, type SearchResponse, type WorkspacePlan } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { DemoStore } from './demo-store';
import { MockTransport, type MockContext } from './mock-transport';
import { findPersona } from './people';
import { SEED_TENANTS } from './platform/tenants';
import { ACCESS_TODAY, effectiveAccessFor, TENANT_DIRECTORY } from './tenant-directory';

/**
 * Gate B checkpoint 2: V3.1 effective access in the tenant plane. The maintenance-only client
 * (Shalimar Court) must never reach developer CRM, sales, booking or construction, even though its
 * facility manager's role carries lead and booking permissions on purpose.
 */
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};
const as = (personaId: string) => new MockTransport({ getContext: (): MockContext => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo: new DemoStore(memory()) });
const refusedWith = (status: number, code: string) => ({ problem: expect.objectContaining({ status, code }) });

describe('one tenant directory for HQ and the workspace', () => {
  it('HQ seeds and the workspace read the same modules, sites and status for every tenant', () => {
    for (const d of TENANT_DIRECTORY) {
      const seeded = SEED_TENANTS.find((t) => t.id === d.id)!;
      expect(seeded, d.id).toBeTruthy();
      expect(seeded.grants).toEqual(d.modules);
      expect(seeded.sites).toEqual(d.sites);
      expect(seeded.status).toBe(d.status);
      expect(seeded.displayName).toBe(d.name);
    }
  });

  it('the maintenance-only client licenses core and maintenance only (residents and visitors are scheduled)', () => {
    const access = effectiveAccessFor(findPersona('facility_manager')!)!;
    expect(access.grants.filter((g) => grantActive(g, ACCESS_TODAY)).map((g) => g.module).sort()).toEqual(['core', 'maintenance']);
    expect(access.grants.filter((g) => !grantActive(g, ACCESS_TODAY)).map((g) => [g.module, g.from])).toEqual([['residents', '2026-11-01'], ['visitors', '2026-11-01']]);
    expect(access.tenant).toMatchObject({ id: 'tnt_shalimar', status: 'active' });
  });
});

describe('the mock server refuses unlicensed modules before any data is read', () => {
  const fm = as('facility_manager');
  const cases: Array<[string, Parameters<MockTransport['request']>[0]]> = [
    ['CRM summary', { method: 'GET', path: '/crm/summary' }],
    ['lead list', { method: 'GET', path: '/leads' }],
    ['new lead', { method: 'POST', path: '/leads', body: { name: 'X' } }],
    ['a lead', { method: 'GET', path: '/leads/led_0001' }],
    ['site visits', { method: 'GET', path: '/visits' }],
    ['projects', { method: 'GET', path: '/projects' }],
    ['units', { method: 'GET', path: '/units' }],
    ['a unit', { method: 'GET', path: '/units/unt_0001' }],
    ['hold a unit (sales)', { method: 'POST', path: '/units/unt_0001/hold', body: {} }],
  ];
  for (const [name, request] of cases) {
    it(`${name}: 403 module_not_licensed, even with the permission in the role`, async () => {
      await expect(fm.request(request)).rejects.toMatchObject(refusedWith(403, 'module_not_licensed'));
    });
  }

  it('records the mutation attempt but changes nothing', async () => {
    const t = as('society_admin');
    await expect(t.request({ method: 'POST', path: '/leads', body: { name: 'X' } })).rejects.toBeTruthy();
    const larkspur = await as('manager').request<{ total: number }>({ method: 'GET', path: '/leads' });
    expect(larkspur.total).toBeGreaterThan(0);
  });
});

describe('core endpoints never hand Larkspur records to another organisation', () => {
  it('search, people, notifications and the dashboard come back empty', async () => {
    const t = as('society_admin');
    const search = await t.request<SearchResponse>({ method: 'GET', path: '/search', query: { q: 'Usman' } });
    expect(search.records).toEqual([]);
    const parties = await t.request<{ items: unknown[] }>({ method: 'GET', path: '/parties' });
    expect(parties.items).toEqual([]);
    expect(await t.request<unknown[]>({ method: 'GET', path: '/notifications' })).toEqual([]);
    const dashboard = await t.request<DashboardSummary>({ method: 'GET', path: '/dashboard/summary' });
    expect(dashboard.kpis).toEqual([]);
    expect(dashboard.collections).toBeNull();
    // The demo overview describes Shalimar's own (empty) records, never Larkspur's.
    const overview = await t.request<DemoOverview>({ method: 'GET', path: '/demo/overview' });
    expect(overview).toMatchObject({ tenantName: 'Shalimar Court Residents (Demo)', projects: [], counts: { projects: 0, units: null, leads: null, siteVisits: null } });
  });

  it('the same calls still serve Larkspur’s own people', async () => {
    const search = await as('manager').request<SearchResponse>({ method: 'GET', path: '/search', query: { q: 'Usman' } });
    expect(search.records.length).toBeGreaterThan(0);
  });
});

describe('ADM-023 your plan & modules', () => {
  it('the administrator sees what the plan includes and what it does not', async () => {
    const plan = await as('society_admin').request<WorkspacePlan>({ method: 'GET', path: '/workspace/plan' });
    expect(plan.tenant).toMatchObject({ id: 'tnt_shalimar', name: 'Shalimar Court Residents (Demo)' });
    expect(plan.modules.filter((m) => m.licensed).map((m) => m.key).sort()).toEqual(['core', 'maintenance']);
    expect(plan.modules.filter((m) => m.scheduledFrom).map((m) => [m.key, m.scheduledFrom])).toEqual([['residents', '2026-11-01'], ['visitors', '2026-11-01']]);
    expect(plan.modules).toHaveLength(27);
  });

  it('a role without administration may not open it', async () => {
    await expect(as('facility_manager').request({ method: 'GET', path: '/workspace/plan' })).rejects.toMatchObject(refusedWith(403, 'permission_missing'));
  });
});

describe('menu targets use the same layers as the server', () => {
  const access = effectiveAccessFor(findPersona('facility_manager')!)!;
  it('developer areas are refused as not in the plan, maintenance is allowed', () => {
    for (const permission of ['lead.view', 'booking.view', 'unit.view'] as const) {
      expect(decideTarget(access, { permission }, ACCESS_TODAY), permission).toEqual({ allowed: false, reason: 'module_not_licensed' });
    }
    expect(decideTarget(access, { module: 'construction' }, ACCESS_TODAY)).toEqual({ allowed: false, reason: 'module_not_licensed' });
    expect(decideTarget(access, { permission: 'operations.view' }, ACCESS_TODAY)).toEqual({ allowed: true });
  });

  it('a licensed module still needs the role’s permission', () => {
    expect(decideTarget(access, { permission: 'admin.view' }, ACCESS_TODAY)).toEqual({ allowed: false, reason: 'permission_missing' });
  });

  it('Larkspur’s manager keeps every developer area', () => {
    const manager = effectiveAccessFor(findPersona('manager')!)!;
    for (const permission of ['lead.view', 'booking.view', 'unit.view', 'invoice.view', 'operations.view'] as const) {
      expect(decideTarget(manager, { permission }, ACCESS_TODAY), permission).toEqual({ allowed: true });
    }
  });
});
