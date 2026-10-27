import type {
  AmendmentImpact,
  ConfigOverview,
  ConfigVersion,
  ContractDraft,
  ContractHistory,
  MeterEvidence,
  ModuleCatalog,
  QuotePreview,
  RateCard,
  TenantDetail,
  TenantUsage,
  WorkspaceRequest,
  WorkspaceRequestDetail,
} from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import type { AuditResponse } from './audit';
import { defaultContract } from './contracts';
import { PlatformStore } from './store';
import { PlatformMockTransport } from './transport';

/**
 * Gate B remaining scope: versioned commercial configuration with maker-checker, amendments with
 * impact preview and history, usage evidence and billing, requests, and the commercial audit trail.
 */
const session = () => {
  const store = new PlatformStore(false);
  let personaId = 'supreme_admin';
  const t = new PlatformMockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', store });
  return {
    store,
    as: (id: string) => {
      personaId = id;
      return t;
    },
  };
};
const problem = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { problem: { status: number; code: string; errors?: Record<string, Array<{ code: string }>> } }).problem;
  }
  throw new Error('expected a refusal');
};

describe('versioned commercial policy (maker-checker, effective dates)', () => {
  it('Supreme Admin drafts and submits; only another approver publishes; quotes follow the date', async () => {
    const { as } = session();
    const admin = as('supreme_admin');
    const before = await admin.request<ConfigOverview>({ method: 'GET', path: '/platform/config/commercial_policy' });
    expect(before.current.label).toBe('cp-2026.10-1');
    expect(before.canManage).toBe(true);

    const policy = before.current.payload.kind === 'commercial_policy' ? before.current.payload.policy : null;
    const draft = await admin.request<ConfigVersion>({
      method: 'POST',
      path: '/platform/config/commercial_policy/versions',
      body: { payload: { kind: 'commercial_policy', policy: { ...policy!, maxDiscountPct: 10 } }, effectiveFrom: '2026-12-01', reason: 'Tighter discounts from December' },
    });
    expect(draft.status).toBe('draft');
    expect(draft.changes).toEqual([{ path: 'maxDiscountPct', before: '15', after: '10' }]);

    const submitted = await admin.request<ConfigVersion>({ method: 'POST', path: `/platform/config/versions/${draft.id}/submit` });
    expect(submitted.status).toBe('pending_approval');
    // The maker cannot approve their own version, even though Supreme Admin is an approver role.
    expect(await problem(admin.request({ method: 'POST', path: `/platform/config/versions/${draft.id}/decide`, body: { decision: 'approve' } }))).toMatchObject({ status: 403, code: 'maker_checker_required' });
    // Support may read but never approve.
    expect(await problem(as('platform_support').request({ method: 'POST', path: `/platform/config/versions/${draft.id}/decide`, body: { decision: 'approve' } }))).toMatchObject({ status: 403 });
    const approved = await as('commercial_approver').request<ConfigVersion>({ method: 'POST', path: `/platform/config/versions/${draft.id}/decide`, body: { decision: 'approve' } });
    expect(approved.status).toBe('scheduled');

    // A 12 % discount needs approval for a December contract, not for a November one.
    const quote = async (start: string) => {
      const contract: ContractDraft = defaultContract('community', { start });
      contract.discounts.push({ id: 'd1', target: 'recurring', kind: 'percent', value: '12', from: start, reason: 'Launch offer' });
      return as('supreme_admin').request<QuotePreview>({ method: 'POST', path: '/platform/quotes/preview', body: { contract, quantities: { 'units.eligible': 80, 'sites.licensed': 1 }, edition: 'community' } });
    };
    expect((await quote('2026-11-01')).approval).toMatchObject({ required: false, policyVersion: 'cp-2026.10-1' });
    expect((await quote('2026-12-01')).approval).toMatchObject({ required: true, policyVersion: approved.label });
  });

  it('refuses invalid thresholds, approvers and unchanged versions on the server', async () => {
    const { as } = session();
    const admin = as('supreme_admin');
    const { current } = await admin.request<ConfigOverview>({ method: 'GET', path: '/platform/config/commercial_policy' });
    const policy = current.payload.kind === 'commercial_policy' ? current.payload.policy : null;
    const bad = await problem(admin.request({ method: 'POST', path: '/platform/config/commercial_policy/versions', body: { payload: { kind: 'commercial_policy', policy: { ...policy!, maxDiscountPct: 140, approverRoles: ['platform_support'] } } } }));
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.errors!).sort()).toEqual(['approverRoles', 'maxDiscountPct']);
    const same = await admin.request<ConfigVersion>({ method: 'POST', path: '/platform/config/commercial_policy/versions', body: { reason: 'No change' } });
    expect(await problem(admin.request({ method: 'POST', path: `/platform/config/versions/${same.id}/submit` }))).toMatchObject({ status: 422, errors: { payload: [{ code: 'platform:config.validation.noChanges' }] } });
    expect(await problem(as('commercial_approver').request({ method: 'POST', path: '/platform/config/commercial_policy/versions', body: {} }))).toMatchObject({ status: 403 });
  });

  it('an exception can relax a limit for one edition until a date', async () => {
    const { as } = session();
    const admin = as('supreme_admin');
    const { current } = await admin.request<ConfigOverview>({ method: 'GET', path: '/platform/config/commercial_policy' });
    const policy = current.payload.kind === 'commercial_policy' ? current.payload.policy : null;
    const v = await admin.request<ConfigVersion>({
      method: 'POST',
      path: '/platform/config/commercial_policy/versions',
      body: { payload: { kind: 'commercial_policy', policy: { ...policy!, exceptions: [{ id: 'exc_assoc', edition: 'community', rule: 'free_beyond_trial', limit: 60, until: '2027-06-30', reason: 'Association pilot' }] } }, effectiveFrom: '2026-10-26', reason: 'Associations may try for 60 days' },
    });
    await admin.request({ method: 'POST', path: `/platform/config/versions/${v.id}/submit` });
    await as('commercial_approver').request({ method: 'POST', path: `/platform/config/versions/${v.id}/decide`, body: { decision: 'approve' } });
    const trial = (edition: 'community' | 'developer') => {
      const c = defaultContract(edition, { start: '2026-11-01', trial: true });
      c.components = c.components.map((x) => (x.type === 'TRIAL' ? { ...x, trialDays: 45 } : x));
      return as('supreme_admin').request<QuotePreview>({ method: 'POST', path: '/platform/quotes/preview', body: { contract: c, quantities: { 'units.eligible': 40, 'sites.licensed': 1, 'seats.staff_active': 3 }, edition } });
    };
    expect((await trial('community')).approval.reasons.map((r) => r.rule)).not.toContain('free_beyond_trial');
    expect((await trial('developer')).approval.reasons.map((r) => r.rule)).toContain('free_beyond_trial');
  });
});

describe('rate cards, catalogue and signup policy versions', () => {
  it('a new rate card applies to contracts from its date; templates and floors follow it', async () => {
    const { as } = session();
    const admin = as('supreme_admin');
    const { current } = await admin.request<ConfigOverview>({ method: 'GET', path: '/platform/config/rate_card' });
    const card = current.payload.kind === 'rate_card' ? current.payload.rateCard : null;
    const lines = card!.lines.map((l) => (l.id === 'rc_unit_eligible' ? { ...l, unitPrice: { amount: '45.00', currency: 'PKR' as const } } : l));
    const v = await admin.request<ConfigVersion>({ method: 'POST', path: '/platform/config/rate_card/versions', body: { payload: { kind: 'rate_card', rateCard: { ...card!, lines } }, effectiveFrom: '2027-01-01', reason: 'Inflation adjustment' } });
    expect(v.changes).toEqual([{ path: 'rc_unit_eligible.unitPrice', before: 'Rs 40.00', after: 'Rs 45.00' }]);
    await admin.request({ method: 'POST', path: `/platform/config/versions/${v.id}/submit` });
    await as('commercial_approver').request({ method: 'POST', path: `/platform/config/versions/${v.id}/decide`, body: { decision: 'approve' } });
    const templateOn = async (start: string) => (await as('supreme_admin').request<ContractDraft>({ method: 'POST', path: '/platform/contract-templates', body: { edition: 'community', start } })).components.find((c) => c.rateCardLineId === 'rc_unit_eligible')!.unitPrice!.amount;
    expect(await templateOn('2026-12-01')).toBe('40.00');
    expect(await templateOn('2027-01-01')).toBe('45.00');
    const builder = await as('supreme_admin').request<{ rateCard: RateCard }>({ method: 'GET', path: '/platform/rate-card', query: { at: '2027-02-01' } });
    expect(builder.rateCard.lines.find((l) => l.id === 'rc_unit_eligible')!.unitPrice!.amount).toBe('45.00');
  });

  it('the catalogue refuses cycles and removals; dependency checks use the version in force', async () => {
    const { as } = session();
    const admin = as('supreme_admin');
    const { current } = await admin.request<ConfigOverview>({ method: 'GET', path: '/platform/config/catalogue' });
    const modules = current.payload.kind === 'catalogue' ? current.payload.modules : [];
    const cyclic = modules.map((m) => (m.key === 'projects' ? { ...m, requires: [...m.requires, 'sales' as const] } : m));
    const res = await problem(admin.request({ method: 'POST', path: '/platform/config/catalogue/versions', body: { payload: { kind: 'catalogue', modules: cyclic } } }));
    expect(res.status).toBe(422);
    expect(Object.keys(res.errors!)).toContain('modules.projects.requires');
    expect(await problem(admin.request({ method: 'POST', path: '/platform/config/catalogue/versions', body: { payload: { kind: 'catalogue', modules: modules.filter((m) => m.key !== 'parking') } } }))).toMatchObject({ status: 422 });
    // Parking now also requires residents, from today.
    const changed = modules.map((m) => (m.key === 'parking' ? { ...m, requires: [...m.requires, 'residents' as const] } : m));
    const v = await admin.request<ConfigVersion>({ method: 'POST', path: '/platform/config/catalogue/versions', body: { payload: { kind: 'catalogue', modules: changed }, effectiveFrom: '2026-10-26', reason: 'Parking bays belong to residents' } });
    await admin.request({ method: 'POST', path: `/platform/config/versions/${v.id}/submit` });
    await as('commercial_approver').request({ method: 'POST', path: `/platform/config/versions/${v.id}/decide`, body: { decision: 'approve' } });
    const check = await as('supreme_admin').request<{ ok: boolean; fixes: Array<{ module: string }> }>({ method: 'POST', path: '/platform/entitlements/check', body: { modules: [{ module: 'parking', sites: 'all' }] } });
    expect(check.ok).toBe(false);
    expect(check.fixes.map((f) => f.module)).toContain('residents');
    const catalog = await as('supreme_admin').request<ModuleCatalog>({ method: 'GET', path: '/platform/catalog' });
    expect(catalog.version).toBe(v.label);
  });

  it('requests follow the signup policy in force; approving opens a prefilled tenant draft', async () => {
    const { as } = session();
    const admin = as('supreme_admin');
    const list = await admin.request<Array<WorkspaceRequest & WorkspaceRequestDetail>>({ method: 'GET', path: '/platform/requests' });
    expect(list.find((r) => r.id === 'req_northgate')!.policyOutcome).toBe('sales_assisted');
    expect(await problem(admin.request({ method: 'POST', path: '/platform/requests/req_sunfield/decision', body: { decision: 'declined' } }))).toMatchObject({ status: 422 });
    const approved = await admin.request<WorkspaceRequestDetail>({ method: 'POST', path: '/platform/requests/req_sunfield/decision', body: { decision: 'approved', note: 'Verified the association' } });
    expect(approved.status).toBe('approved');
    expect(approved.draftId).toBeTruthy();
    const draft = await admin.request<{ organisation: { displayName: string }; sites: Array<{ declaredUnits: number }> }>({ method: 'GET', path: `/platform/tenant-drafts/${approved.draftId}` });
    expect(draft.organisation.displayName).toBe('Sunfield Apartments Association (Demo)');
    expect(draft.sites[0]!.declaredUnits).toBe(48);
    expect(await problem(admin.request({ method: 'POST', path: '/platform/requests/req_sunfield/decision', body: { decision: 'declined', note: 'x' } }))).toMatchObject({ status: 409 });
  });
});

describe('contract amendments with impact preview, approval and history', () => {
  it('Larkspur’s history shows version 1 replaced by version 2 with what changed', async () => {
    const { as } = session();
    const h = await as('platform_support').request<ContractHistory>({ method: 'GET', path: '/platform/tenants/tnt_larkspur/contracts' });
    expect(h.versions.map((v) => [v.contract.version, v.display])).toEqual([[2, 'in_force'], [1, 'superseded']]);
    expect(h.versions[0]!.changes.some((c) => c.path.startsWith('modules.online_payments'))).toBe(true);
    expect(h.versions[0]!.monthlyNet.amount).toBe('47500.00');
    expect(h.versions[1]!.monthlyNet.amount).toBe('46000.00');
    const shalimar = await as('platform_support').request<ContractHistory>({ method: 'GET', path: '/platform/tenants/tnt_shalimar/contracts' });
    expect(shalimar.versions[0]).toMatchObject({ display: 'scheduled', effectiveFrom: '2026-11-01' });
  });

  it('previews a grant change: dependencies, price delta and who gains or loses areas', async () => {
    const { as } = session();
    const admin = as('supreme_admin');
    const t = await admin.request<TenantDetail>({ method: 'GET', path: '/platform/tenants/tnt_cedar' });
    const contract = t.contract!;
    // Remove receivables from a co-operative: dues depends on it, the treasurer loses Finance.
    const modules = t.grants.filter((g) => g.module !== 'receivables');
    const impact = await admin.request<AmendmentImpact>({ method: 'POST', path: '/platform/tenants/tnt_larkspur/amendments/preview', body: { modules: (await admin.request<TenantDetail>({ method: 'GET', path: '/platform/tenants/tnt_larkspur' })).grants, contract: (await admin.request<TenantDetail>({ method: 'GET', path: '/platform/tenants/tnt_larkspur' })).contract, effectiveFrom: '2026-11-01' } });
    expect(impact.delta.amount).toBe('0.00');
    const cedar = await admin.request<AmendmentImpact>({ method: 'POST', path: '/platform/tenants/tnt_cedar/amendments/preview', body: { modules, contract, effectiveFrom: '2026-11-01' } });
    expect(cedar.dependencies.ok).toBe(false);
    expect(cedar.removed.map((m) => m.module)).toEqual(['receivables']);
    expect(cedar.retention).toEqual(['receivables']);
    expect(cedar.access.find((a) => a.roleId === 'treasurer')).toMatchObject({ holders: 1, lost: ['receivables'] });
  });

  it('an amendment that needs approval waits for a second person, then is scheduled and shown in history', async () => {
    const { as } = session();
    const admin = as('supreme_admin');
    const t = await admin.request<TenantDetail>({ method: 'GET', path: '/platform/tenants/tnt_larkspur' });
    const contract = structuredClone(t.contract!) as ContractDraft;
    contract.discounts.push({ id: 'dsc_loyalty', target: 'recurring', kind: 'percent', value: '20', from: '2026-12-01', reason: 'Second project commitment' });
    const modules = [...t.grants, { module: 'public_website' as const, sites: 'all' as const }];
    contract.components.push({ id: 'cmp_mod_public_website', type: 'PER_MODULE', rateCardLineId: 'rc_mod_public_website', module: 'public_website', unitPrice: { amount: '15000.00', currency: 'PKR' }, cadence: 'monthly', proration: 'actual_days', effectiveFrom: '2026-12-01' });
    const impact = await admin.request<AmendmentImpact>({ method: 'POST', path: '/platform/tenants/tnt_larkspur/amendments/preview', body: { modules, contract, effectiveFrom: '2026-12-01' } });
    expect(impact.added.map((m) => m.module)).toEqual(['public_website']);
    expect(impact.after.approval.required).toBe(true);
    expect(Number(impact.delta.amount)).not.toBe(0);

    expect(await problem(admin.request({ method: 'POST', path: '/platform/tenants/tnt_larkspur/amendments', body: { modules, contract, effectiveFrom: '2026-12-01' } }))).toMatchObject({ status: 422, errors: { reason: [{ code: 'platform:amend.validation.reason' }] } });
    const h1 = await admin.request<ContractHistory>({ method: 'POST', path: '/platform/tenants/tnt_larkspur/amendments', body: { modules, contract, effectiveFrom: '2026-12-01', reason: 'Website and loyalty discount' } });
    const v3 = h1.versions[0]!;
    expect(v3).toMatchObject({ display: 'pending_approval', effectiveFrom: '2026-12-01' });
    expect(v3.approval?.status).toBe('pending');
    // Another amendment cannot be opened while this one is pending.
    expect(await problem(admin.request({ method: 'POST', path: '/platform/tenants/tnt_larkspur/amendments', body: { modules, contract, effectiveFrom: '2026-12-01', reason: 'x' } }))).toMatchObject({ status: 409, code: 'amendment_open' });
    expect(await problem(admin.request({ method: 'POST', path: `/platform/approvals/${v3.approval!.id}/decide`, body: { decision: 'approve' } }))).toMatchObject({ code: 'maker_checker_required' });
    await as('commercial_approver').request({ method: 'POST', path: `/platform/approvals/${v3.approval!.id}/decide`, body: { decision: 'approve' } });
    const h2 = await as('platform_support').request<ContractHistory>({ method: 'GET', path: '/platform/tenants/tnt_larkspur/contracts' });
    expect(h2.versions.map((v) => [v.contract.version, v.display])).toEqual([[3, 'scheduled'], [2, 'in_force'], [1, 'superseded']]);
    // Until 1 December the tenant keeps its current grants.
    const after = await as('supreme_admin').request<TenantDetail>({ method: 'GET', path: '/platform/tenants/tnt_larkspur' });
    expect(after.modules).not.toContain('public_website');
  });

  it('an amendment effective today without approval applies at once; withdrawing a scheduled one is audited', async () => {
    const { as } = session();
    const admin = as('supreme_admin');
    const t = await admin.request<TenantDetail>({ method: 'GET', path: '/platform/tenants/tnt_riverbend' });
    const modules = [...t.grants, { module: 'parking' as const, sites: ['site_rb_court'] }];
    const h = await admin.request<ContractHistory>({ method: 'POST', path: '/platform/tenants/tnt_riverbend/amendments', body: { modules, contract: t.contract, effectiveFrom: '2026-10-26', reason: 'Parking at Riverbend Court' } });
    expect(h.versions[0]!.display).toBe('in_force');
    const updated = await admin.request<TenantDetail>({ method: 'GET', path: '/platform/tenants/tnt_riverbend' });
    expect(updated.modules).toContain('parking');
    const shalimar = await admin.request<ContractHistory>({ method: 'POST', path: '/platform/tenants/tnt_shalimar/amendments/ctr_shalimar_2/withdraw' });
    expect(shalimar.versions[0]!.display).toBe('withdrawn');
    const audit = await admin.request<AuditResponse>({ method: 'GET', path: '/platform/audit', query: { category: 'contracts' } });
    expect(audit.items.slice(0, 3).map((e) => e.action)).toEqual(expect.arrayContaining(['amendmentWithdrawn', 'amendmentInForce']));
    expect(audit.items.find((e) => e.action === 'amendmentScheduled' && e.tenantId === 'tnt_riverbend')?.changes?.some((c) => c.path.startsWith('modules.parking'))).toBe(true);
  });
});

describe('usage meters, evidence and billing', () => {
  it('snapshots carry their definition; a disputed count shows its correction', async () => {
    const { as } = session();
    const usage = await as('platform_support').request<TenantUsage>({ method: 'GET', path: '/platform/tenants/tnt_riverbend/usage' });
    const oct = usage.snapshots.find((s) => s.dimension === 'units.eligible' && s.period === '2026-10')!;
    expect(oct).toMatchObject({ value: 228, status: 'corrected', correction: { from: 232, to: 228 } });
    expect(usage.billing?.quantities.find((q) => q.dimension === 'units.eligible')).toMatchObject({ value: 228, declared: 232 });
  });

  it('evidence lists counted and excluded flat codes with reasons, never people', async () => {
    const { as } = session();
    const crescent = await as('platform_support').request<TenantUsage>({ method: 'GET', path: '/platform/tenants/tnt_crescent/usage' });
    const snap = crescent.snapshots.find((s) => s.dimension === 'units.registered')!;
    const ev = await as('platform_support').request<MeterEvidence>({ method: 'GET', path: `/platform/usage/snapshots/${snap.id}/evidence` });
    expect(ev.counted).toHaveLength(66);
    expect(ev.excluded).toEqual([{ code: 'CB-IMPORT-001', site: '—', reasonKey: 'platform:usage.excluded.noSite' }]);
    expect(JSON.stringify(ev)).not.toMatch(/displayName|phone|cnic|email/i);
    const shalimar = await as('platform_support').request<TenantUsage>({ method: 'GET', path: '/platform/tenants/tnt_shalimar/usage' });
    const s = shalimar.snapshots.find((x) => x.dimension === 'units.eligible')!;
    const sev = await as('platform_support').request<MeterEvidence>({ method: 'GET', path: `/platform/usage/snapshots/${s.id}/evidence` });
    expect(sev.counted).toHaveLength(64);
    expect(sev.excluded.map((e) => e.reasonKey).sort()).toEqual(['platform:usage.excluded.guardRoom', 'platform:usage.excluded.office']);
  });

  it('the billing calculation runs the quote engine on the counted quantities', async () => {
    const { as } = session();
    const usage = await as('platform_support').request<TenantUsage>({ method: 'GET', path: '/platform/tenants/tnt_larkspur/usage' });
    expect(usage.billing).toMatchObject({ period: { start: '2026-10-01', end: '2026-11-01' }, nonAuthoritative: true });
    expect(usage.billing!.net.amount).toBe('47500.00');
    expect(usage.billing!.evaluatedWith.contract).toBe('ctr_larkspur_2 v2');
    const cedar = await as('platform_support').request<TenantUsage>({ method: 'GET', path: '/platform/tenants/tnt_cedar/usage' });
    expect(cedar.billing).toBeNull();
  });
});

describe('the commercial audit trail', () => {
  it('records configuration steps with principals and what changed, filterable', async () => {
    const { as } = session();
    const admin = as('supreme_admin');
    const { current } = await admin.request<ConfigOverview>({ method: 'GET', path: '/platform/config/signup_policy' });
    const signup = current.payload.kind === 'signup_policy' ? current.payload.signup : null;
    const v = await admin.request<ConfigVersion>({ method: 'POST', path: '/platform/config/signup_policy/versions', body: { payload: { kind: 'signup_policy', signup: { ...signup!, byEdition: { ...signup!.byEdition, community: 'self_service_trial' } } }, reason: 'Open self-service trials for associations' } });
    await admin.request({ method: 'POST', path: `/platform/config/versions/${v.id}/submit` });
    await as('commercial_approver').request({ method: 'POST', path: `/platform/config/versions/${v.id}/decide`, body: { decision: 'return', comment: 'Add a unit limit first' } });
    const audit = await as('platform_support').request<AuditResponse>({ method: 'GET', path: '/platform/audit', query: { category: 'configuration' } });
    expect(audit.items.map((e) => [e.action, e.actorId])).toEqual([
      ['configReturned', 'usr_hq_0002'],
      ['configSubmitted', 'usr_hq_0001'],
      ['configDrafted', 'usr_hq_0001'],
    ]);
    expect(audit.items[1]!.changes).toEqual([{ path: 'byEdition.community', before: 'approval_required', after: 'self_service_trial' }]);
    // Nothing in the trail can be changed or removed: there is no endpoint to do it.
    for (const method of ['POST', 'PATCH', 'DELETE'] as const) expect(await problem(admin.request({ method, path: '/platform/audit' }))).toMatchObject({ status: 404 });
  });
});
