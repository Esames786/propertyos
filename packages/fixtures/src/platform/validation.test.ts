import { ApiError, type ContractApproval, type ContractDraft, type TenantDraft, type TenantListResponse } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { PRESETS } from './catalog';
import { defaultContract } from './contracts';
import { RATE_CARD } from './rate-card';
import { PlatformStore } from './store';
import { SEED_TENANTS } from './tenants';
import { PlatformMockTransport } from './transport';
import { contractProblems } from './validation';

/**
 * Owner review of checkpoint 1: critical draft and pricing rules are enforced by the mock server,
 * not only by the forms; maker-checker compares principals, not display names.
 */
function transportAs(personaId: string, store = new PlatformStore(false)) {
  return new PlatformMockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', store });
}

const QTY = { 'units.eligible': 80, 'sites.licensed': 1 };
const template = (start = '2026-11-01') => defaultContract('community', { start });
const preview = (t: PlatformMockTransport, contract: unknown, quantities: unknown = QTY) => t.request({ method: 'POST', path: '/platform/quotes/preview', body: { contract, quantities, edition: 'community' } });
const refusedWith = (field: string, code: string) => ({ problem: { status: 422, errors: expect.objectContaining({ [field]: [expect.objectContaining({ code: `platform:validation.${code}` })] }) } });

/** A complete, valid Al-Noor draft (not activated). */
async function readyDraft(t: PlatformMockTransport): Promise<TenantDraft> {
  const draft = await t.request<TenantDraft>({ method: 'POST', path: '/platform/tenant-drafts', body: { edition: 'community' } });
  return t.request<TenantDraft>({
    method: 'PATCH',
    path: `/platform/tenant-drafts/${draft.id}`,
    body: {
      organisation: { displayName: 'Rule Check Society (Demo)', legalName: 'Rule Check Owners Association (Demo)', city: 'Lahore', timezone: 'Asia/Karachi', currency: 'PKR', language: 'en-PK', contactName: 'Faisal Butt', contactEmail: 'faisal@example.com', contactPhone: '+923994100000' },
      sites: [{ id: 'site_rule', name: 'Rule Check', city: 'Lahore', kind: 'residential', buildings: 2, declaredUnits: 80 }],
      modules: PRESETS.find((p) => p.key === 'community')!.modules.map((module) => ({ module, sites: 'all' })),
      contract: template(),
    },
  });
}

describe('valid inputs pass the server rules', () => {
  it('every seeded contract is priceable (the golden vectors are checked in pricing.test.ts)', () => {
    for (const t of SEED_TENANTS) expect(contractProblems(t.contract, { commit: false, rateCard: RATE_CARD }), t.id).toEqual({});
  });

  it('every edition template can be saved as it is', () => {
    for (const edition of ['developer', 'community', 'portfolio'] as const) {
      expect(contractProblems(defaultContract(edition, { start: '2026-11-01' }), { commit: true, rateCard: RATE_CARD }), edition).toEqual({});
    }
  });
});

describe('invalid commercial inputs are refused by the server', () => {
  const t = transportAs('supreme_admin');
  const cases: Array<[string, (c: ContractDraft) => void, string, string]> = [
    ['negative price', (c) => (c.components[1]!.unitPrice = { amount: '-5.00', currency: 'PKR' }), 'components.1.unitPrice', 'componentPrice'],
    ['three decimals', (c) => (c.components[1]!.unitPrice = { amount: '40.005', currency: 'PKR' }), 'components.1.unitPrice', 'componentPrice'],
    ['unknown component type', (c) => ((c.components[0] as { type: string }).type = 'BARTER'), 'components.0.type', 'componentType'],
    ['end before start', (c) => (c.components[0]!.effectiveTo = '2026-10-01'), 'components.0.effectiveTo', 'componentDates'],
    ['impossible date', (c) => (c.terms.start = '2026-02-30'), 'terms.start', 'start'],
    ['term of 0 months', (c) => (c.terms.termMonths = 0), 'terms.termMonths', 'term'],
    ['minimum above the cap', (c) => Object.assign(c.terms, { minimumMonthly: { amount: '5000.00', currency: 'PKR' }, capMonthly: { amount: '3000.00', currency: 'PKR' } }), 'terms.capMonthly', 'minCap'],
    ['tax rate sent by the client', (c) => (c.terms.tax = { code: 'NONE', ratePct: '17' }), 'terms.tax', 'tax'],
    ['unknown tax code', (c) => (c.terms.tax = { code: 'GST-99', ratePct: '99' }), 'terms.tax', 'tax'],
    ['discount of 150 %', (c) => c.discounts.push({ id: 'd', target: 'recurring', kind: 'percent', value: '150', from: '2026-11-01', reason: 'x' }), 'discounts.0.value', 'discountPercent'],
    ['discount of 0 %', (c) => c.discounts.push({ id: 'd', target: 'recurring', kind: 'percent', value: '0', from: '2026-11-01', reason: 'x' }), 'discounts.0.value', 'discountPercent'],
    ['zero amount off', (c) => c.discounts.push({ id: 'd', target: 'recurring', kind: 'amount', value: '0.00', from: '2026-11-01', reason: 'x' }), 'discounts.0.value', 'discountAmount'],
    ['discount on a missing component', (c) => c.discounts.push({ id: 'd', target: 'cmp_ghost', kind: 'percent', value: '10', from: '2026-11-01', reason: 'x' }), 'discounts.0.target', 'discountTarget'],
    [
      'tiers out of order',
      (c) =>
        Object.assign(c.components[1]!, {
          type: 'TIERED',
          tierMethod: 'graduated',
          tiers: [
            { upTo: 50, unitPrice: { amount: '45.00', currency: 'PKR' } },
            { upTo: 20, unitPrice: { amount: '35.00', currency: 'PKR' } },
            { upTo: null, unitPrice: { amount: '30.00', currency: 'PKR' } },
          ],
        }),
      'components.1.tiers',
      'tiers',
    ],
  ];
  for (const [name, mutate, field, code] of cases) {
    it(`quote preview refuses: ${name}`, async () => {
      const c = template();
      mutate(c);
      await expect(preview(t, c)).rejects.toMatchObject(refusedWith(field, code));
    });
  }

  it('refuses fractional or negative counts and unknown dimensions', async () => {
    await expect(preview(t, template(), { 'units.eligible': 80.5, 'sites.licensed': 1 })).rejects.toMatchObject(refusedWith('quantities', 'quantities'));
    await expect(preview(t, template(), { 'units.eligible': -1 })).rejects.toMatchObject(refusedWith('quantities', 'quantities'));
    await expect(preview(t, template(), { 'flats.imaginary': 3 })).rejects.toMatchObject(refusedWith('quantities', 'quantities'));
  });

  it('the simulator refuses the same inputs and still never writes', async () => {
    const before = t.storeWrites();
    const c = template();
    c.components[1]!.unitPrice = { amount: 'abc', currency: 'PKR' };
    await expect(t.request({ method: 'POST', path: '/platform/simulations/price', body: { contract: c, quantities: QTY, edition: 'community' } })).rejects.toBeInstanceOf(ApiError);
    await expect(t.request({ method: 'POST', path: '/platform/simulations/price', body: { contract: template(), quantities: QTY, edition: 'mystery' } })).rejects.toMatchObject(refusedWith('edition', 'edition'));
    expect(t.storeWrites()).toBe(before);
  });
});

describe('drafts: the server checks what the forms check', () => {
  it('saving a discount without a reason is refused', async () => {
    const t = transportAs('supreme_admin');
    const draft = await readyDraft(t);
    const c = template();
    c.discounts.push({ id: 'd', target: 'recurring', kind: 'percent', value: '10', from: '2026-11-01' });
    await expect(t.request({ method: 'PATCH', path: `/platform/tenant-drafts/${draft.id}`, body: { contract: c } })).rejects.toMatchObject(refusedWith('discounts.0.reason', 'discountReason'));
  });

  it('a price below the rate card needs a reason before it can be saved', async () => {
    const t = transportAs('supreme_admin');
    const draft = await readyDraft(t);
    const c = template();
    c.components[1]!.unitPrice = { amount: '30.00', currency: 'PKR' };
    await expect(t.request({ method: 'PATCH', path: `/platform/tenant-drafts/${draft.id}`, body: { contract: c } })).rejects.toMatchObject(refusedWith('components.1.overrideReason', 'overrideReason'));
    c.components[1]!.overrideReason = 'Matched a competing offer';
    await expect(t.request({ method: 'PATCH', path: `/platform/tenant-drafts/${draft.id}`, body: { contract: c } })).resolves.toBeTruthy();
  });

  it('sites, modules and emails are checked; activation state cannot be written', async () => {
    const t = transportAs('supreme_admin');
    const draft = await readyDraft(t);
    const path = `/platform/tenant-drafts/${draft.id}`;
    await expect(t.request({ method: 'PATCH', path, body: { sites: [{ id: 's', name: 'X', city: 'Lahore', kind: 'residential', buildings: 1, declaredUnits: 0 }] } })).rejects.toMatchObject(refusedWith('sites.0', 'site'));
    await expect(t.request({ method: 'PATCH', path, body: { modules: [{ module: 'teleportation', sites: 'all' }] } })).rejects.toMatchObject(refusedWith('modules.0', 'module'));
    await expect(t.request({ method: 'PATCH', path, body: { modules: [{ module: 'maintenance', sites: ['site_elsewhere'] }] } })).rejects.toMatchObject(refusedWith('modules.0', 'moduleSites'));
    await expect(t.request({ method: 'PATCH', path, body: { organisation: { ...draft.organisation!, contactEmail: 'not-an-email' } } })).rejects.toMatchObject(refusedWith('organisation.contactEmail', 'email'));

    const saved = await t.request<TenantDraft & { activatedTenantId?: string }>({ method: 'PATCH', path, body: { activatedTenantId: 'tnt_larkspur', id: 'drf_other', step: 'review' } });
    expect(saved).toMatchObject({ id: draft.id, step: 'review' });
    expect(saved.activatedTenantId).toBeUndefined();
  });

  it('activation checks the saved draft again, even if it got past the forms', async () => {
    const store = new PlatformStore(false);
    const t = transportAs('supreme_admin', store);
    const draft = await readyDraft(t);
    // Simulate a draft that bypassed every form and PATCH check.
    const tampered = structuredClone(store.draft(draft.id)!);
    tampered.contract!.discounts.push({ id: 'd', target: 'recurring', kind: 'percent', value: '99', from: '2026-11-01' });
    store.saveDraft(tampered);
    const before = (await t.request<TenantListResponse>({ method: 'GET', path: '/platform/tenants' })).total;
    await expect(t.request({ method: 'POST', path: `/platform/tenant-drafts/${draft.id}/activate` })).rejects.toMatchObject(refusedWith('discounts.0.reason', 'discountReason'));
    expect((await t.request<TenantListResponse>({ method: 'GET', path: '/platform/tenants' })).total).toBe(before);
  });
});

describe('unauthorized approval attempts', () => {
  const seedApproval = (store: PlatformStore, patch: Partial<ContractApproval>) => {
    const base = store.approvals().find((a) => a.id === 'apr_kestrel_1')!;
    store.saveApproval({ ...base, ...patch });
  };
  const decide = (t: PlatformMockTransport, body: unknown, id = 'apr_kestrel_1') => t.request<ContractApproval>({ method: 'POST', path: `/platform/approvals/${id}/decide`, body });

  it('a role without the approve permission is refused before the handler runs', async () => {
    await expect(decide(transportAs('platform_support'), { decision: 'approve' })).rejects.toMatchObject({ problem: { status: 403, code: 'permission_missing' } });
  });

  it('the maker is refused even after a change of display name (compared by principal)', async () => {
    const store = new PlatformStore(false);
    seedApproval(store, { requestedBy: 'H. Qureshi (previous name)', requestedById: 'usr_hq_0001' });
    await expect(decide(transportAs('supreme_admin', store), { decision: 'approve' })).rejects.toMatchObject({ problem: { status: 403, code: 'maker_checker_required' } });
  });

  it('a different person who shares the maker’s display name may decide', async () => {
    const store = new PlatformStore(false);
    seedApproval(store, { requestedBy: 'Ayesha Siddiqui', requestedById: 'usr_hq_0099' });
    const decided = await decide(transportAs('commercial_approver', store), { decision: 'approve' });
    expect(decided).toMatchObject({ status: 'approved', decidedById: 'usr_hq_0002', requestedById: 'usr_hq_0099' });
  });

  it('a decided approval cannot be decided again; an unknown one is not found', async () => {
    const store = new PlatformStore(false);
    const approver = transportAs('commercial_approver', store);
    await decide(approver, { decision: 'approve' });
    await expect(decide(transportAs('supreme_admin', store), { decision: 'return', comment: 'Too late' })).rejects.toMatchObject({ problem: { status: 409, code: 'invalid_transition' } });
    await expect(decide(approver, { decision: 'approve' }, 'apr_missing')).rejects.toMatchObject({ problem: { status: 404 } });
  });

  it('malformed decisions are refused and change nothing', async () => {
    const store = new PlatformStore(false);
    const approver = transportAs('commercial_approver', store);
    await expect(decide(approver, { decision: 'maybe' })).rejects.toMatchObject(refusedWith('decision', 'decision'));
    await expect(decide(approver, { decision: 'return', comment: '   ' })).rejects.toMatchObject({ problem: { status: 422 } });
    await expect(decide(approver, { decision: 'return', comment: 'x'.repeat(1001) })).rejects.toMatchObject(refusedWith('comment', 'commentLength'));
    expect(store.approvals().find((a) => a.id === 'apr_kestrel_1')!.status).toBe('pending');
  });

  it('every decision is audited with the checker’s principal', async () => {
    const store = new PlatformStore(false);
    await decide(transportAs('commercial_approver', store), { decision: 'return', comment: 'Limit the offer to three months' });
    expect(store.audit()[0]).toMatchObject({ action: 'approvalReturned', actorId: 'usr_hq_0002', actorName: 'Ayesha Siddiqui' });
  });
});
