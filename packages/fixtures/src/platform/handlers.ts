import {
  ApiError,
  pkr,
  type ActivationResult,
  type ApiRequest,
  type AppNotification,
  type HqAttentionItem,
  type ContractApproval,
  type ContractDraft,
  type EditionKey,
  type HqOverview,
  type ModuleKey,
  type ModuleSelection,
  type Permission,
  type Persona,
  type SearchResponse,
  type TenantDetail,
  type TenantDraft,
  type TenantListResponse,
  type TenantStatus,
  type TenantSummary,
  type TenantType,
} from '@repo/contracts';
import { FIXTURE_NOW } from '../seed';
import { CATALOG, presetFor } from './catalog';
import { addDays, defaultContract, nextMonthStart } from './contracts';
import { checkDependencies } from './dependencies';
import { fromPaisa, priceContract, toPaisa, type Quantities } from './pricing';
import { COMMERCIAL_POLICY, RATE_CARD, TAX_CODES } from './rate-card';
import type { PlatformStore } from './store';
import { SEED_MRR_PREVIOUS, SEED_OUTSTANDING, SEED_REVENUE, SEED_USAGE } from './tenants';

export interface PlatformContext {
  persona: Persona | undefined;
  req: ApiRequest;
  params: Record<string, string>;
  store: PlatformStore;
  correlationId: string;
}

export interface PlatformHandler {
  method: ApiRequest['method'];
  pattern: RegExp;
  /** Any one of these is enough. */
  permission?: Permission | readonly Permission[];
  handle: (ctx: PlatformContext) => unknown;
}

const fail = (ctx: PlatformContext, status: number, code: string, messageKey: string): never => {
  throw new ApiError({ status, code, messageKey, correlationId: ctx.correlationId, changed: false });
};
const invalid = (ctx: PlatformContext, errors: Record<string, string>): never => {
  throw new ApiError({
    status: 422,
    code: 'validation_failed',
    messageKey: 'errors:validation.summary',
    errors: Object.fromEntries(Object.entries(errors).map(([field, code]) => [field, [{ code }]])),
    correlationId: ctx.correlationId,
    changed: false,
  });
};
const notFound = (ctx: PlatformContext) => fail(ctx, 404, 'not_found', 'errors:api.notFound');

const body = <T,>(ctx: PlatformContext) => (ctx.req.body ?? {}) as T;
const q = (ctx: PlatformContext, key: string) => {
  const v = ctx.req.query?.[key];
  return v === undefined || v === '' ? undefined : String(v);
};
const now = () => new Date().toISOString();
const today = FIXTURE_NOW.toISOString().slice(0, 10);
const clone = <T,>(v: T): T => structuredClone(v);
const norm = (s: string) => s.toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();

const summaryOf = ({ organisation: _o, sites: _s, grants: _g, contract: _c, quote: _q, approval: _a, audit: _au, ...summary }: TenantDetail): TenantSummary => summary;

/** Quantities for a draft: declared counts plus what the sites imply. */
export function draftQuantities(draft: Pick<TenantDraft, 'sites' | 'quantities'>): Quantities {
  const declared = draft.sites.reduce((s, x) => s + x.declaredUnits, 0);
  return {
    'units.registered': declared,
    'units.eligible': declared,
    'units.licensed_capacity': declared,
    'sites.licensed': draft.sites.length,
    'buildings.active': draft.sites.reduce((s, x) => s + x.buildings, 0),
    'seats.staff_active': 5,
    ...draft.quantities,
  };
}

const daysLeft = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

function attention(store: PlatformStore, persona: Persona | undefined): HqAttentionItem[] {
  const items: HqAttentionItem[] = [];
  for (const a of store.approvals().filter((x) => x.status === 'pending')) {
    const t = store.tenant(a.tenantId);
    if (!t) continue;
    items.push({ id: `att_apr_${a.id}`, kind: 'approval', tenantId: t.id, title: t.displayName, detailKey: 'approval', params: { count: String(a.reasons.length), by: a.requestedBy }, href: `/hq/tenants?tenant=${t.id}`, tone: 'warning' });
  }
  for (const t of store.tenants()) {
    if (t.status === 'trial' && t.trialEndsOn && daysLeft(t.trialEndsOn) <= 21) items.push({ id: `att_trial_${t.id}`, kind: 'trial_ending', tenantId: t.id, title: t.displayName, detailKey: 'trialEnding', params: { days: String(daysLeft(t.trialEndsOn)), date: t.trialEndsOn }, href: `/hq/tenants?tenant=${t.id}`, tone: 'info' });
    if (t.status === 'grace') items.push({ id: `att_grace_${t.id}`, kind: 'grace', tenantId: t.id, title: t.displayName, detailKey: 'grace', params: {}, href: `/hq/tenants?tenant=${t.id}`, tone: 'warning' });
    if (t.status === 'suspended') items.push({ id: `att_susp_${t.id}`, kind: 'suspended', tenantId: t.id, title: t.displayName, detailKey: 'suspended', params: {}, href: `/hq/tenants?tenant=${t.id}`, tone: 'danger' });
  }
  for (const r of store.requests().filter((x) => x.status === 'new')) {
    items.push({ id: `att_req_${r.id}`, kind: 'request', title: r.organisation, detailKey: `request_${r.kind}`, params: { units: String(r.expectedUnits ?? ''), city: r.city }, href: '/hq/tenants?tab=requests', tone: 'info' });
  }
  if (persona?.permissions.includes('platform.tenants.create')) {
    for (const d of store.drafts()) {
      items.push({ id: `att_draft_${d.id}`, kind: 'draft', title: d.organisation?.displayName ?? '', detailKey: 'draft', params: {}, href: `/hq/tenants/new?draft=${d.id}`, tone: 'info' });
    }
  }
  return items;
}

function notifications(store: PlatformStore, persona: Persona | undefined): AppNotification[] {
  const read = new Set(store.readNotifications());
  const list: AppNotification[] = [];
  for (const a of store.approvals().filter((x) => x.status === 'pending')) {
    const t = store.tenant(a.tenantId);
    list.push({ id: `ntf_apr_${a.id}`, titleKey: 'platform:notifications.approvalTitle', bodyKey: 'platform:notifications.approvalBody', params: { tenant: t?.displayName ?? '', by: a.requestedBy }, createdAt: a.requestedAt, read: false, href: `/hq/tenants?tenant=${a.tenantId}`, audience: 'platform.contracts.approve' });
  }
  for (const t of store.tenants()) {
    if (t.status === 'trial' && t.trialEndsOn) list.push({ id: `ntf_trial_${t.id}`, titleKey: 'platform:notifications.trialTitle', bodyKey: 'platform:notifications.trialBody', params: { tenant: t.displayName, days: String(daysLeft(t.trialEndsOn)) }, createdAt: '2026-10-26T06:00:00Z', read: false, href: `/hq/tenants?tenant=${t.id}`, audience: 'platform.tenants.view' });
    if (t.status === 'grace') list.push({ id: `ntf_grace_${t.id}`, titleKey: 'platform:notifications.graceTitle', bodyKey: 'platform:notifications.graceBody', params: { tenant: t.displayName }, createdAt: '2026-10-20T07:00:00Z', read: false, href: `/hq/tenants?tenant=${t.id}`, audience: 'platform.tenants.view' });
  }
  for (const r of store.requests().filter((x) => x.status === 'new')) {
    list.push({ id: `ntf_req_${r.id}`, titleKey: 'platform:notifications.requestTitle', bodyKey: 'platform:notifications.requestBody', params: { organisation: r.organisation, city: r.city }, createdAt: r.receivedAt, read: false, href: '/hq/tenants?tab=requests', audience: 'platform.tenants.view' });
  }
  return list
    .filter((n) => persona?.permissions.includes(n.audience as Permission))
    .map((n) => ({ ...n, read: read.has(n.id) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const STATUSES: TenantStatus[] = ['draft', 'trial', 'active', 'grace', 'suspended', 'cancelled', 'archived'];
const TYPES: TenantType[] = ['developer', 'association', 'portfolio_manager', 'custom'];

function overview(store: PlatformStore, persona: Persona | undefined): HqOverview {
  const tenants = store.tenants();
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, tenants.filter((t) => t.status === s).length])) as HqOverview['tenants']['byStatus'];
  const byType = Object.fromEntries(TYPES.map((s) => [s, tenants.filter((t) => t.type === s).length])) as HqOverview['tenants']['byType'];
  const paying = tenants.filter((t) => (t.status === 'active' || t.status === 'grace') && toPaisa(t.mrr) > 0);
  const mrr = paying.reduce((s, t) => s + toPaisa(t.mrr), 0);
  const moduleCounts = new Map<ModuleKey, number>();
  for (const t of tenants.filter((x) => x.status !== 'draft')) for (const m of t.modules) moduleCounts.set(m, (moduleCounts.get(m) ?? 0) + 1);
  const live = tenants.filter((t) => t.status !== 'draft' && t.status !== 'cancelled' && t.status !== 'archived');
  return {
    asOf: FIXTURE_NOW.toISOString(),
    tenants: { total: tenants.length, byStatus, byType, awaitingApproval: store.approvals().filter((a) => a.status === 'pending').length },
    subscriptions: {
      paying: paying.length,
      trials: byStatus.trial,
      free: tenants.filter((t) => t.status === 'active' && toPaisa(t.mrr) === 0).length,
      mrr: fromPaisa(mrr),
      arr: fromPaisa(mrr * 12),
      mrrPrevious: pkr(SEED_MRR_PREVIOUS),
    },
    revenue: { months: SEED_REVENUE.map((m) => ({ month: m.month, invoiced: pkr(m.invoiced), collected: pkr(m.collected) })), outstanding: pkr(SEED_OUTSTANDING) },
    trials: tenants.filter((t) => t.status === 'trial' && t.trialEndsOn).map((t) => ({ tenantId: t.id, name: t.displayName, endsOn: t.trialEndsOn!, daysLeft: daysLeft(t.trialEndsOn!) })),
    requests: store.requests(),
    modules: [...moduleCounts].map(([module, n]) => ({ module, tenants: n })).sort((a, b) => b.tenants - a.tenants || a.module.localeCompare(b.module)),
    usage: {
      sites: live.reduce((s, t) => s + t.siteCount, 0),
      declaredUnits: live.reduce((s, t) => s + t.units.declared, 0),
      eligibleUnits: live.reduce((s, t) => s + (t.units.eligible ?? 0), 0),
      staffSeats: live.reduce((s, t) => s + (t.quote?.quantities.find((x) => x.dimension === 'seats.staff_active')?.value ?? 0), 0),
      smsThisMonth: SEED_USAGE.smsThisMonth,
    },
    attention: attention(store, persona),
    activity: store.audit().slice(0, 8),
    signupPolicy: store.signupPolicy(),
  };
}

function validateDraft(ctx: PlatformContext, d: TenantDraft): asserts d is TenantDraft & { edition: EditionKey; organisation: NonNullable<TenantDraft['organisation']>; contract: ContractDraft } {
  const errors: Record<string, string> = {};
  if (!d.edition) errors.edition = 'forms:errors.required';
  if (!d.organisation?.displayName?.trim()) errors.displayName = 'forms:errors.required';
  if (!d.organisation?.legalName?.trim()) errors.legalName = 'forms:errors.required';
  if (d.sites.length === 0) errors.sites = 'platform:errors.atLeastOneSite';
  if (d.sites.some((s) => !s.name.trim() || s.declaredUnits <= 0)) errors.sites = 'platform:errors.siteIncomplete';
  if (!checkDependencies(d.modules).ok) errors.modules = 'platform:errors.dependencies';
  if (!d.contract || d.contract.components.length === 0) errors.contract = 'platform:errors.noComponents';
  if (Object.keys(errors).length) invalid(ctx, errors);
}

const slug = (s: string) => s.toLocaleLowerCase('en').replace(/\(demo\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 18) || 'tenant';

function activate(ctx: PlatformContext, draftId: string): ActivationResult {
  const { store, persona } = ctx;
  const draft = store.draft(draftId) ?? notFound(ctx);
  if (draft.activatedTenantId) {
    const t = store.tenant(draft.activatedTenantId)!;
    const approval = store.approvals().find((a) => a.tenantId === t.id && a.status === 'pending');
    return { tenantId: t.id, status: t.status, contractStatus: t.contractStatus === 'pending_approval' ? 'pending_approval' : 'active', ...(approval ? { approvalId: approval.id } : {}) };
  }
  validateDraft(ctx, draft);
  const quantities = draftQuantities(draft);
  const quote = priceContract({ contract: draft.contract, quantities, quantitySource: 'declared', edition: draft.edition });
  const needsApproval = quote.approval.required;
  const trial = draft.contract.components.find((c) => c.type === 'TRIAL');
  const status: TenantStatus = needsApproval ? 'draft' : trial ? 'trial' : 'active';
  const id = `tnt_${slug(draft.organisation.displayName)}_${store.nextId('t').slice(-3)}`;
  const at = now();
  const actor = persona?.displayName ?? 'Unknown';

  const tenant: TenantDetail = {
    id,
    displayName: draft.organisation.displayName,
    legalName: draft.organisation.legalName,
    type: presetFor(draft.edition).tenantType,
    edition: draft.edition,
    status,
    contractStatus: needsApproval ? 'pending_approval' : 'active',
    billingStatus: 'none',
    city: draft.organisation.city,
    siteCount: draft.sites.length,
    units: { declared: quantities['units.registered'] ?? 0, eligible: quantities['units.eligible'] ?? null },
    modules: draft.modules.map((m) => m.module),
    mrr: status === 'active' ? quote.regularPeriod.net : pkr('0.00'),
    createdAt: at,
    ...(trial && !needsApproval ? { trialEndsOn: addDays(draft.contract.terms.start, trial.trialDays ?? 30) } : {}),
    origin: 'hq',
    createdInSession: true,
    organisation: draft.organisation,
    sites: draft.sites,
    grants: draft.modules,
    contract: { ...draft.contract, id: `ctr_${id.slice(4)}_1`, tenantId: id, version: 1, status: needsApproval ? 'pending_approval' : 'active', createdBy: actor, createdAt: at, ...(needsApproval ? {} : { activatedAt: at }) },
    quote,
    approval: null,
    audit: [],
  };

  let approval: ContractApproval | undefined;
  if (needsApproval) {
    approval = { id: store.nextId('apr'), tenantId: id, contractId: tenant.contract!.id, contractVersion: 1, reasons: quote.approval.reasons, requestedBy: actor, requestedAt: at, status: 'pending' };
    tenant.approval = approval;
    store.saveApproval(approval);
  }
  store.saveTenant(tenant);
  store.saveDraft({ ...draft, activatedTenantId: id, updatedAt: at });
  store.addAudit({ at, actorName: actor, action: 'tenantCreated', tenantId: id, tenantName: tenant.displayName, params: { edition: draft.edition } });
  if (needsApproval) store.addAudit({ at, actorName: actor, action: 'approvalRequested', tenantId: id, tenantName: tenant.displayName, params: { reasons: String(quote.approval.reasons.length) } });
  else store.addAudit({ at, actorName: actor, action: trial ? 'trialStarted' : 'contractActivated', tenantId: id, tenantName: tenant.displayName, params: trial ? { days: String(trial.trialDays ?? 30) } : { version: '1' } });

  return { tenantId: id, status, contractStatus: needsApproval ? 'pending_approval' : 'active', ...(approval ? { approvalId: approval.id } : {}) };
}

function decideApproval(ctx: PlatformContext): ContractApproval {
  const { store, persona } = ctx;
  const approval = store.approvals().find((a) => a.id === ctx.params.id) ?? notFound(ctx);
  const { decision, comment } = body<{ decision: 'approve' | 'return'; comment?: string }>(ctx);
  if (approval.status !== 'pending') fail(ctx, 409, 'invalid_transition', 'platform:errors.approvalDecided');
  // Maker ≠ checker (I-22): the person who requested approval cannot decide it.
  if (persona?.displayName === approval.requestedBy) fail(ctx, 403, 'maker_checker_required', 'platform:errors.makerChecker');
  if (decision === 'return' && !comment?.trim()) invalid(ctx, { comment: 'forms:errors.required' });

  const at = now();
  const decided: ContractApproval = { ...approval, status: decision === 'approve' ? 'approved' : 'returned', decidedBy: persona!.displayName, decidedAt: at, ...(comment ? { comment } : {}) };
  store.saveApproval(decided);

  const tenant = clone(store.tenant(approval.tenantId) ?? notFound(ctx));
  const trial = tenant.contract?.components.find((c) => c.type === 'TRIAL');
  if (decision === 'approve') {
    tenant.status = trial ? 'trial' : 'active';
    tenant.contractStatus = 'active';
    if (tenant.contract) Object.assign(tenant.contract, { status: 'active', activatedAt: at });
    if (trial && tenant.contract) tenant.trialEndsOn = addDays(tenant.contract.terms.start, trial.trialDays ?? 30);
    if (tenant.status === 'active' && tenant.quote) tenant.mrr = tenant.quote.regularPeriod.net;
  } else {
    tenant.contractStatus = 'draft';
    if (tenant.contract) tenant.contract.status = 'draft';
  }
  tenant.approval = decided;
  store.saveTenant(tenant);
  store.addAudit({ at, actorName: persona!.displayName, action: decision === 'approve' ? 'approvalGranted' : 'approvalReturned', tenantId: tenant.id, tenantName: tenant.displayName, params: comment ? { comment } : {} });
  return decided;
}

const SORTS = {
  name: (a: TenantSummary, b: TenantSummary) => a.displayName.localeCompare(b.displayName),
  created: (a: TenantSummary, b: TenantSummary) => b.createdAt.localeCompare(a.createdAt),
  mrr: (a: TenantSummary, b: TenantSummary) => toPaisa(b.mrr) - toPaisa(a.mrr) || a.displayName.localeCompare(b.displayName),
} as const;

export const PLATFORM_HANDLERS: PlatformHandler[] = [
  { method: 'GET', pattern: /^\/platform\/overview$/, permission: 'platform.dashboard.view', handle: (ctx) => overview(ctx.store, ctx.persona) },
  { method: 'GET', pattern: /^\/platform\/catalog$/, permission: ['platform.catalog.view', 'platform.tenants.create'], handle: () => CATALOG },
  { method: 'GET', pattern: /^\/platform\/rate-card$/, permission: ['platform.pricing.view', 'platform.tenants.create'], handle: () => ({ rateCard: RATE_CARD, policy: COMMERCIAL_POLICY, taxCodes: TAX_CODES }) },
  { method: 'GET', pattern: /^\/platform\/requests$/, permission: 'platform.tenants.view', handle: (ctx) => ctx.store.requests() },

  {
    method: 'GET',
    pattern: /^\/platform\/tenants$/,
    permission: 'platform.tenants.view',
    handle: (ctx): TenantListResponse => {
      const all = ctx.store.tenants().map(summaryOf);
      const text = q(ctx, 'q');
      const status = q(ctx, 'status');
      const edition = q(ctx, 'edition');
      const counts = Object.fromEntries([...STATUSES, 'awaiting_approval'].map((s) => [s, s === 'awaiting_approval' ? all.filter((t) => t.contractStatus === 'pending_approval').length : all.filter((t) => t.status === s).length])) as TenantListResponse['counts'];
      let items = all;
      if (text) items = items.filter((t) => norm(`${t.displayName} ${t.legalName} ${t.city}`).includes(norm(text)));
      if (status === 'awaiting_approval') items = items.filter((t) => t.contractStatus === 'pending_approval');
      else if (status) items = items.filter((t) => t.status === status);
      if (edition) items = items.filter((t) => t.edition === edition);
      const sort = (q(ctx, 'sort') ?? 'created') as keyof typeof SORTS;
      items = [...items].sort(SORTS[sort] ?? SORTS.created);
      return { items, total: items.length, counts };
    },
  },
  {
    method: 'GET',
    pattern: /^\/platform\/tenants\/(?<id>[\w-]+)$/,
    permission: 'platform.tenants.view',
    handle: (ctx) => {
      const t = ctx.store.tenant(ctx.params.id!) ?? notFound(ctx);
      return { ...clone(t), audit: ctx.store.audit().filter((a) => a.tenantId === t.id) };
    },
  },
  // HQ never reads tenant records without an audited, consented support grant (A1 §4, AB-9).
  ...(['GET', 'POST', 'PATCH', 'DELETE'] as const).map(
    (method): PlatformHandler => ({ method, pattern: /^\/platform\/tenants\/[\w-]+\/records(\/.*)?$/, handle: (ctx) => fail(ctx, 403, 'support_grant_required', 'platform:errors.supportGrantRequired') }),
  ),

  {
    method: 'POST',
    pattern: /^\/platform\/entitlements\/check$/,
    permission: ['platform.tenants.create', 'platform.grants.manage'],
    handle: (ctx) => checkDependencies(body<{ modules: ModuleSelection[] }>(ctx).modules ?? []),
  },
  {
    method: 'POST',
    pattern: /^\/platform\/contract-templates$/,
    permission: ['platform.tenants.create', 'platform.pricing.simulate'],
    handle: (ctx) => {
      const { edition, start, trial } = body<{ edition: EditionKey; start?: string; trial?: boolean }>(ctx);
      return defaultContract(edition, { start: start ?? nextMonthStart(today), ...(trial ? { trial } : {}) });
    },
  },
  {
    method: 'POST',
    pattern: /^\/platform\/quotes\/preview$/,
    permission: ['platform.contracts.manage', 'platform.pricing.simulate'],
    handle: (ctx) => {
      const { contract, quantities, edition } = body<{ contract: ContractDraft; quantities: Quantities; edition: EditionKey }>(ctx);
      return priceContract({ contract, quantities, quantitySource: 'declared', edition });
    },
  },
  {
    // The simulator: same engine, nothing is stored (AB-6).
    method: 'POST',
    pattern: /^\/platform\/simulations\/price$/,
    permission: 'platform.pricing.simulate',
    handle: (ctx) => {
      const { contract, quantities, edition } = body<{ contract: ContractDraft; quantities: Quantities; edition: EditionKey }>(ctx);
      return priceContract({ contract, quantities, quantitySource: 'scenario', edition });
    },
  },

  {
    method: 'POST',
    pattern: /^\/platform\/tenant-drafts$/,
    permission: 'platform.tenants.create',
    handle: (ctx): TenantDraft => {
      const draft: TenantDraft = { id: ctx.store.nextId('drf'), edition: body<{ edition?: EditionKey }>(ctx).edition ?? null, organisation: null, sites: [], modules: [], contract: null, quantities: {}, step: 'type', updatedAt: now() };
      ctx.store.saveDraft(draft);
      return draft;
    },
  },
  { method: 'GET', pattern: /^\/platform\/tenant-drafts\/(?<id>[\w-]+)$/, permission: 'platform.tenants.create', handle: (ctx) => ctx.store.draft(ctx.params.id!) ?? notFound(ctx) },
  {
    method: 'PATCH',
    pattern: /^\/platform\/tenant-drafts\/(?<id>[\w-]+)$/,
    permission: 'platform.tenants.create',
    handle: (ctx) => {
      const draft = ctx.store.draft(ctx.params.id!) ?? notFound(ctx);
      if (draft.activatedTenantId) fail(ctx, 409, 'invalid_transition', 'platform:errors.draftActivated');
      const next = { ...draft, ...body<Partial<TenantDraft>>(ctx), id: draft.id, updatedAt: now() };
      ctx.store.saveDraft(next);
      return next;
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/platform\/tenant-drafts\/(?<id>[\w-]+)$/,
    permission: 'platform.tenants.create',
    handle: (ctx) => {
      ctx.store.removeDraft(ctx.params.id!);
      return { ok: true };
    },
  },
  { method: 'POST', pattern: /^\/platform\/tenant-drafts\/(?<id>[\w-]+)\/activate$/, permission: 'platform.tenants.create', handle: (ctx) => activate(ctx, ctx.params.id!) },
  { method: 'POST', pattern: /^\/platform\/approvals\/(?<id>[\w-]+)\/decide$/, permission: 'platform.contracts.approve', handle: (ctx) => decideApproval(ctx) },

  { method: 'GET', pattern: /^\/notifications$/, handle: (ctx) => notifications(ctx.store, ctx.persona) },
  {
    method: 'POST',
    pattern: /^\/notifications\/read-all$/,
    handle: (ctx) => {
      ctx.store.markRead(notifications(ctx.store, ctx.persona).map((n) => n.id));
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: /^\/notifications\/(?<id>[\w-]+)\/read$/,
    handle: (ctx) => {
      ctx.store.markRead([ctx.params.id!]);
      return { ok: true };
    },
  },
  {
    method: 'GET',
    pattern: /^\/search$/,
    permission: 'platform.tenants.view',
    handle: (ctx): SearchResponse => {
      const text = norm(q(ctx, 'q') ?? '');
      if (text.length < 2) return { query: text, records: [] };
      const tenants = ctx.store
        .tenants()
        .filter((t) => norm(`${t.displayName} ${t.legalName} ${t.city}`).includes(text))
        .slice(0, 6)
        .map((t) => ({ type: 'tenant' as const, id: t.id, ref: t.edition, title: t.displayName, subtitle: t.city, href: `/hq/tenants?tenant=${t.id}` }));
      const requests = ctx.store
        .requests()
        .filter((r) => norm(`${r.organisation} ${r.city}`).includes(text))
        .slice(0, 3)
        .map((r) => ({ type: 'request' as const, id: r.id, ref: r.kind, title: r.organisation, subtitle: r.city, href: '/hq/tenants?tab=requests' }));
      return { query: text, records: [...tenants, ...requests] };
    },
  },
  {
    method: 'POST',
    pattern: /^\/demo\/reset$/,
    handle: (ctx) => {
      ctx.store.reset();
      return { ok: true };
    },
  },
];
