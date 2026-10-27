import { ApiError, type ActivationResult, type ContractApproval, type ContractDraft, type HqOverview, type ModuleSelection, type TenantDetail, type TenantDraft, type TenantListResponse } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { MODULES, PRESETS } from './catalog';
import { applyFixes, checkDependencies } from './dependencies';
import { PlatformStore } from './store';
import { PlatformMockTransport } from './transport';

const sel = (module: ModuleSelection['module'], sites: ModuleSelection['sites'] = 'all'): ModuleSelection => ({ module, sites });

describe('module catalogue', () => {
  it('has the 27 approved modules with valid references', () => {
    expect(MODULES).toHaveLength(27);
    const keys = new Set(MODULES.map((m) => m.key));
    for (const m of MODULES) for (const r of [...m.requires, ...m.integrates]) expect(keys.has(r), `${m.key} → ${r}`).toBe(true);
  });

  it('every edition preset passes its own dependency check', () => {
    for (const p of PRESETS) expect(checkDependencies(p.modules.map((m) => sel(m))).ok, p.key).toBe(true);
  });

  it('the community preset has no developer sales modules', () => {
    const community = PRESETS.find((p) => p.key === 'community')!.modules;
    for (const m of ['crm', 'projects', 'inventory', 'sales', 'construction', 'handover'] as const) expect(community).not.toContain(m);
  });
});

describe('dependency check', () => {
  it('reports a missing hard requirement and how to fix it', () => {
    const r = checkDependencies([sel('online_payments', ['s1'])]);
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([{ module: 'online_payments', requires: 'receivables', kind: 'missing', sites: 'all' }]);
    expect(r.fixes).toEqual([{ module: 'receivables', sites: 'all' }]);
  });

  it('closes requirements transitively (Sales → Inventory → Projects)', () => {
    const r = checkDependencies([sel('sales')]);
    expect(r.fixes.map((f) => f.module).sort()).toEqual(['inventory', 'projects', 'receivables']);
    expect(checkDependencies(applyFixes([sel('sales')], r.fixes)).ok).toBe(true);
  });

  it('finds site gaps for site-scoped requirements', () => {
    const r = checkDependencies([sel('receivables'), sel('dues', ['s1', 's2']), sel('residents', ['s1'])]);
    expect(r.issues).toEqual([{ module: 'dues', requires: 'residents', kind: 'site_gap', sites: ['s2'] }]);
    expect(r.fixes).toEqual([{ module: 'residents', sites: ['s1', 's2'] }]);
  });

  it('lists soft integrations once', () => {
    const r = checkDependencies([sel('receivables'), sel('residents'), sel('dues')]);
    const pairs = r.integrations.map((i) => [i.module, i.with].sort().join('+'));
    expect(pairs).toContain('dues+residents');
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

function transportAs(personaId: string, store = new PlatformStore(false)) {
  return new PlatformMockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', store });
}

async function createAlNoor(t: PlatformMockTransport, contractPatch?: (c: ContractDraft) => void): Promise<{ draft: TenantDraft; result: ActivationResult }> {
  const draft = await t.request<TenantDraft>({ method: 'POST', path: '/platform/tenant-drafts', body: { edition: 'community' } });
  const contract = await t.request<ContractDraft>({ method: 'POST', path: '/platform/contract-templates', body: { edition: 'community', start: '2026-11-01' } });
  contractPatch?.(contract);
  await t.request({
    method: 'PATCH',
    path: `/platform/tenant-drafts/${draft.id}`,
    body: {
      organisation: { displayName: 'Al-Noor Residency (Demo)', legalName: 'Al-Noor Residency Owners Association (Demo)', city: 'Lahore', timezone: 'Asia/Karachi', currency: 'PKR', language: 'en-PK', contactName: 'Faisal Butt', contactEmail: 'faisal@example.com', contactPhone: '+923994100000' },
      sites: [{ id: 'site_alnoor', name: 'Al-Noor Residency', city: 'Lahore', kind: 'residential', buildings: 2, declaredUnits: 80 }],
      modules: PRESETS.find((p) => p.key === 'community')!.modules.map((m) => sel(m)),
      contract,
    },
  });
  const result = await t.request<ActivationResult>({ method: 'POST', path: `/platform/tenant-drafts/${draft.id}/activate` });
  return { draft, result };
}

describe('platform handlers', () => {
  it('creates and activates the Al-Noor tenant at PKR 18,700 / 3,700', async () => {
    const t = transportAs('supreme_admin');
    const { result } = await createAlNoor(t);
    expect(result).toMatchObject({ status: 'active', contractStatus: 'active' });
    const detail = await t.request<TenantDetail>({ method: 'GET', path: `/platform/tenants/${result.tenantId}` });
    expect(detail.quote?.firstPeriod.total.amount).toBe('18700.00');
    expect(detail.quote?.regularPeriod.total.amount).toBe('3700.00');
    expect(detail.mrr.amount).toBe('3700.00');
    expect(detail.modules).not.toContain('crm');
    expect(detail.audit.map((a) => a.action)).toEqual(expect.arrayContaining(['tenantCreated', 'contractActivated']));
  });

  it('activation is idempotent (a retry returns the same tenant)', async () => {
    const t = transportAs('supreme_admin');
    const { draft, result } = await createAlNoor(t);
    const again = await t.request<ActivationResult>({ method: 'POST', path: `/platform/tenant-drafts/${draft.id}/activate` });
    expect(again.tenantId).toBe(result.tenantId);
    const list = await t.request<TenantListResponse>({ method: 'GET', path: '/platform/tenants', query: { q: 'Al-Noor' } });
    expect(list.items).toHaveLength(1);
  });

  it('Reset demo data returns the platform to its seed', async () => {
    const t = transportAs('supreme_admin');
    const before = await t.request<TenantListResponse>({ method: 'GET', path: '/platform/tenants' });
    await createAlNoor(t);
    await t.request({ method: 'POST', path: '/demo/reset' });
    const after = await t.request<TenantListResponse>({ method: 'GET', path: '/platform/tenants' });
    expect(after.items.map((i) => i.id)).toEqual(before.items.map((i) => i.id));
  });

  it('a 20 % discount waits for a commercial approver who is not the requester', async () => {
    const store = new PlatformStore(false);
    const admin = transportAs('supreme_admin', store);
    const { result } = await createAlNoor(admin, (c) => c.discounts.push({ id: 'd20', target: 'recurring', kind: 'percent', value: '20', from: '2026-11-01' }));
    expect(result).toMatchObject({ status: 'draft', contractStatus: 'pending_approval' });
    expect(result.approvalId).toBeTruthy();

    // The requester cannot approve their own contract (I-22).
    await expect(admin.request({ method: 'POST', path: `/platform/approvals/${result.approvalId}/decide`, body: { decision: 'approve' } })).rejects.toMatchObject({ problem: { code: 'maker_checker_required' } });

    const approver = transportAs('commercial_approver', store);
    const decided = await approver.request<ContractApproval>({ method: 'POST', path: `/platform/approvals/${result.approvalId}/decide`, body: { decision: 'approve', comment: 'Introductory offer agreed' } });
    expect(decided).toMatchObject({ status: 'approved', decidedBy: 'Ayesha Siddiqui' });
    const detail = await approver.request<TenantDetail>({ method: 'GET', path: `/platform/tenants/${result.tenantId}` });
    expect(detail).toMatchObject({ status: 'active', contractStatus: 'active' });
  });

  it('returning a contract needs a comment and sends it back to draft', async () => {
    const store = new PlatformStore(false);
    const approver = transportAs('commercial_approver', store);
    await expect(approver.request({ method: 'POST', path: '/platform/approvals/apr_kestrel_1/decide', body: { decision: 'return' } })).rejects.toBeInstanceOf(ApiError);
    const decided = await approver.request<ContractApproval>({ method: 'POST', path: '/platform/approvals/apr_kestrel_1/decide', body: { decision: 'return', comment: 'Limit the offer to three months' } });
    expect(decided.status).toBe('returned');
    const detail = await approver.request<TenantDetail>({ method: 'GET', path: '/platform/tenants/tnt_kestrel' });
    expect(detail.contractStatus).toBe('draft');
  });

  it('activation refuses an incomplete draft with field errors', async () => {
    const t = transportAs('supreme_admin');
    const draft = await t.request<TenantDraft>({ method: 'POST', path: '/platform/tenant-drafts', body: { edition: 'community' } });
    await expect(t.request({ method: 'POST', path: `/platform/tenant-drafts/${draft.id}/activate` })).rejects.toMatchObject({
      problem: { status: 422, errors: expect.objectContaining({ displayName: expect.anything(), sites: expect.anything(), contract: expect.anything() }) },
    });
  });

  it('the simulator and quote preview never write to the store', async () => {
    const t = transportAs('supreme_admin');
    const contract = await t.request<ContractDraft>({ method: 'POST', path: '/platform/contract-templates', body: { edition: 'community', start: '2026-11-01' } });
    const before = t.storeWrites();
    const sim = await t.request<{ regularPeriod: { total: { amount: string } } }>({ method: 'POST', path: '/platform/simulations/price', body: { contract, quantities: { 'units.eligible': 76, 'sites.licensed': 1 }, edition: 'community' } });
    await t.request({ method: 'POST', path: '/platform/quotes/preview', body: { contract, quantities: { 'units.eligible': 80, 'sites.licensed': 1 }, edition: 'community' } });
    expect(sim.regularPeriod.total.amount).toBe('3540.00'); // 76 × 40 + 500
    expect(t.storeWrites()).toBe(before);
  });

  it('HQ cannot read tenant records without a support grant', async () => {
    for (const persona of ['supreme_admin', 'platform_support']) {
      await expect(transportAs(persona).request({ method: 'GET', path: '/platform/tenants/tnt_larkspur/records/parties' })).rejects.toMatchObject({ problem: { status: 403, code: 'support_grant_required' } });
    }
  });

  it('enforces platform permissions before handlers run', async () => {
    const support = transportAs('platform_support');
    await expect(support.request({ method: 'POST', path: '/platform/tenant-drafts', body: {} })).rejects.toMatchObject({ problem: { status: 403, code: 'permission_missing' } });
    await expect(support.request({ method: 'POST', path: '/platform/simulations/price', body: {} })).rejects.toMatchObject({ problem: { status: 403 } });
    const overview = await support.request<HqOverview>({ method: 'GET', path: '/platform/overview' });
    expect(overview.tenants.total).toBe(5);
  });

  it('the dashboard overview agrees with the seeded contracts', async () => {
    const overview = await transportAs('supreme_admin').request<HqOverview>({ method: 'GET', path: '/platform/overview' });
    expect(overview.subscriptions.mrr.amount).toBe('59780.00'); // Larkspur 47,500 + Riverbend 12,280
    expect(overview.subscriptions.trials).toBe(1);
    expect(overview.tenants.awaitingApproval).toBe(1);
    expect(overview.attention.map((a) => a.kind)).toEqual(expect.arrayContaining(['approval', 'trial_ending', 'grace', 'suspended', 'request']));
  });

  it('search finds tenants and requests, and never tenant people', async () => {
    const t = transportAs('supreme_admin');
    const res = await t.request<{ records: Array<{ type: string; title: string }> }>({ method: 'GET', path: '/search', query: { q: 'river' } });
    expect(res.records.map((r) => r.type)).toEqual(['tenant']);
    const people = await t.request<{ records: unknown[] }>({ method: 'GET', path: '/search', query: { q: 'Usman' } });
    expect(people.records).toEqual([]);
  });
});
