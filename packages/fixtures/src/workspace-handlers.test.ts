import type { DemoOverview, WorkspaceProfile, WorkspaceSetup } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { DemoStore } from './demo-store';
import { MockTransport, type MockContext } from './index';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};
const make = (ctx: MockContext, demo = new DemoStore(memory())) => new MockTransport({ getContext: () => ctx, getMode: () => 'fast', demo });

const SETUP: WorkspaceSetup = {
  account: { fullName: 'Sana Iqbal', email: 'sana@example.com', phone: '+923991234567' },
  organisation: { name: 'Crescent Builders (Demo)', type: 'private_limited', city: 'Lahore', currency: 'PKR', language: 'ur-PK' },
  project: null,
  invites: [{ email: 'team@example.com', role: 'sales' }],
};

describe('GET /demo/overview', () => {
  it('counts the whole demo for the manager', async () => {
    const res = await make({ personaId: 'manager', projectId: 'all' }).request<DemoOverview>({ method: 'GET', path: '/demo/overview' });
    expect(res.tenantName).toBe('Larkspur Estates (Demo)');
    expect(res.counts).toMatchObject({ projects: 2, units: 496, leads: 120 });
    expect(res.counts.customers).toBeGreaterThan(0);
    expect(res.counts.siteVisits).toBeGreaterThan(0);
    expect(res.counts.openFollowUps).toBeGreaterThan(0);
    expect(res.counts.openFollowUps!).toBeLessThanOrEqual(res.counts.leads!);
  });

  it('follows the persona scope and hides kinds the role cannot see', async () => {
    const sales = await make({ personaId: 'sales', projectId: 'all' }).request<DemoOverview>({ method: 'GET', path: '/demo/overview' });
    expect(sales.projects.map((p) => p.id)).toEqual(['prj_heights']);
    expect(sales.counts.units).toBeLessThan(496);
    const finance = await make({ personaId: 'finance', projectId: 'all' }).request<DemoOverview>({ method: 'GET', path: '/demo/overview' });
    expect(finance.counts.leads).toBeNull();
    expect(finance.counts.units).toBeNull();
    expect(finance.counts.customers).toBeGreaterThan(0);
  });

  it('includes leads created in this demo session and needs a signed-in identity', async () => {
    const demo = new DemoStore(memory());
    const manager = make({ personaId: 'manager', projectId: 'all' }, demo);
    const before = await manager.request<DemoOverview>({ method: 'GET', path: '/demo/overview' });
    demo.addLead({ id: 'led_s1', ref: 'LD-DEMO-1', partyId: 'pty_0001', projectId: 'prj_heights', status: 'new', source: 'website', ownerPersonaId: 'manager', budget: { amount: '1000000.00', currency: 'PKR' }, createdAt: '2026-10-26T00:00:00Z', nextFollowUp: '2026-10-27T00:00:00Z' });
    const after = await manager.request<DemoOverview>({ method: 'GET', path: '/demo/overview' });
    expect(after.counts.leads).toBe(before.counts.leads! + 1);
    expect(after.counts.openFollowUps).toBe(before.counts.openFollowUps! + 1);
    await expect(make({ personaId: null, projectId: 'all' }).request({ method: 'GET', path: '/demo/overview' })).rejects.toMatchObject({ problem: { status: 403 } });
  });
});

describe('workspace setup simulation', () => {
  it('accepts only the prototype verification code', async () => {
    const anon = make({ personaId: null, projectId: 'all' });
    await expect(anon.request({ method: 'POST', path: '/workspace/verify', body: { code: '123456' } })).rejects.toMatchObject({
      problem: { status: 422, errors: { code: [{ code: 'forms:errors.codeInvalid' }] } },
    });
    await expect(anon.request({ method: 'POST', path: '/workspace/verify', body: { code: '246810' } })).resolves.toEqual({ ok: true });
  });

  it('records a simulated profile in the demo session and re-validates the payload', async () => {
    const demo = new DemoStore(memory());
    const anon = make({ personaId: null, projectId: 'all' }, demo);
    const profile = await anon.request<WorkspaceProfile>({ method: 'POST', path: '/workspace', body: SETUP });
    expect(profile.simulated).toBe(true);
    expect(demo.workspace?.organisation.name).toBe('Crescent Builders (Demo)');
    await expect(
      anon.request({ method: 'POST', path: '/workspace', body: { ...SETUP, invites: [{ email: 'not-an-email', role: 'sales' }] } }),
    ).rejects.toMatchObject({ problem: { status: 422 } });
  });
});
