import {
  PERMISSION_MODULE,
  pkr,
  type AccessImpact,
  type AmendmentImpact,
  type AmendmentInput,
  type ContractApproval,
  type ContractDraft,
  type ContractHistory,
  type ContractVersionEntry,
  type ModuleKey,
  type ModuleSelection,
  type QuotePreview,
  type SubscriptionContract,
  type TenantDetail,
  type UsageDimension,
} from '@repo/contracts';
import { rolesOf } from '../role-templates';
import { catalogueModulesOf, contractDiff, policyOf, rateCardOf, TODAY } from './config';
import { addDays } from './contracts';
import { checkDependencies } from './dependencies';
import { body, clone, DATE, fail, invalid, notFound, now, principalOf, refuse, type PlatformContext, type PlatformHandler } from './kit';
import { fromPaisa, priceContract, toPaisa, type Quantities } from './pricing';
import type { PlatformStore } from './store';
import type { ContractRecord } from './tenants';
import { contractProblems, moduleProblems } from './validation';

/**
 * Contract amendments and scheduled changes (HQ-011) with module-grant changes (HQ-008). An
 * amendment is a new contract version: the grants and the pricing after the change, from a date.
 * Its impact (price, dependencies, who gains or loses which area, what is kept read-only) is
 * previewed with the same engine and configuration versions as every quote. If the commercial
 * policy in force flags it, a second person must approve it; once approved it is scheduled, and
 * from its date it replaces the version before (kept in the history with what changed).
 */

/** Configuration versions in force on a date (the same ones the builder, quote and simulator use). */
export function configOn(store: PlatformStore, at: string) {
  const rc = store.configAt('rate_card', at);
  const cp = store.configAt('commercial_policy', at);
  const cat = store.configAt('catalogue', at);
  return { rateCard: rateCardOf(rc), policy: policyOf(cp), modules: catalogueModulesOf(cat), labels: { rateCard: rc.label, policy: cp.label, catalogue: cat.label } };
}

/** Quantities a tenant is priced on (latest known counts; declared before go-live). */
export function tenantQuantities(t: TenantDetail): Quantities {
  const declared = t.sites.reduce((s, x) => s + x.declaredUnits, 0);
  const priced = Object.fromEntries((t.quote?.quantities ?? []).map((q) => [q.dimension, q.value])) as Partial<Record<UsageDimension, number>>;
  return {
    'units.registered': declared,
    'units.eligible': t.units.eligible ?? declared,
    'units.licensed_capacity': declared,
    'sites.licensed': t.sites.length,
    'buildings.active': t.sites.reduce((s, x) => s + x.buildings, 0),
    'seats.staff_active': 5,
    ...priced,
  };
}

/**
 * The contract as it bills from `date`: billing periods start that month, charges that already
 * happened (one-time fees, an expired trial) are left out. Only used to compare like with like.
 */
function billingFrom(contract: ContractDraft, date: string): ContractDraft {
  const start = `${date.slice(0, 7)}-01`;
  return {
    ...contract,
    terms: { ...contract.terms, start },
    components: contract.components
      .filter((c) => (c.type !== 'ONE_TIME' || c.effectiveFrom >= start) && (c.type !== 'TRIAL' || addDays(c.effectiveFrom, c.trialDays ?? 30) > start) && (!c.effectiveTo || c.effectiveTo > start))
      .map((c) => (c.effectiveFrom < start ? { ...c, effectiveFrom: start } : c)),
  };
}

function quoteOn(store: PlatformStore, t: TenantDetail, contract: ContractDraft, date: string): QuotePreview {
  const config = configOn(store, date);
  return priceContract({ contract: billingFrom(contract, date), quantities: tenantQuantities(t), quantitySource: 'snapshot', edition: t.edition, config: { policy: config.policy, rateCard: config.rateCard } });
}

/** The version in force today (or the latest one that has started). */
export function currentRecord(store: PlatformStore, tenantId: string): ContractRecord | undefined {
  const history = store.contractHistory(tenantId);
  return history.filter((r) => r.contract.status === 'active').at(-1) ?? history.filter((r) => ['active', 'superseded'].includes(r.contract.status)).at(-1);
}

const inForce = (modules: readonly ModuleSelection[], at: string) => modules.filter((m) => !m.from || m.from <= at);

/** Areas (modules) a role can use with a set of grants: licensed and at least one permission held. */
function usable(permissions: readonly string[], modules: readonly ModuleSelection[], at: string): Set<ModuleKey> {
  const licensed = new Set(inForce(modules, at).map((m) => m.module));
  licensed.add('core');
  const out = new Set<ModuleKey>();
  for (const p of permissions) {
    const m = PERMISSION_MODULE[p as keyof typeof PERMISSION_MODULE];
    if (m && licensed.has(m)) out.add(m);
  }
  return out;
}

function accessImpact(t: TenantDetail, before: readonly ModuleSelection[], after: readonly ModuleSelection[], at: string): AccessImpact[] {
  return rolesOf(t.id, t.type).map((role) => {
    const a = usable(role.permissions, before, at);
    const b = usable(role.permissions, after, at);
    return { roleId: role.id, roleLabelKey: role.labelKey, holders: role.holders.length, gained: [...b].filter((m) => !a.has(m)), lost: [...a].filter((m) => !b.has(m)) };
  });
}

const sitesKey = (s: ModuleSelection['sites']) => (s === 'all' ? 'all' : [...s].sort().join(','));

function readInput(ctx: PlatformContext, t: TenantDetail): AmendmentInput {
  const input = body<Partial<AmendmentInput>>(ctx);
  const effectiveFrom = typeof input.effectiveFrom === 'string' ? input.effectiveFrom : '';
  if (!DATE.test(effectiveFrom) || effectiveFrom < TODAY) invalid(ctx, { effectiveFrom: 'platform:amend.validation.effectiveFrom' });
  const config = configOn(ctx.store, effectiveFrom);
  refuse(ctx, {
    ...moduleProblems(input.modules, new Set(t.sites.map((s) => s.id))),
    ...contractProblems(input.contract, { commit: true, rateCard: config.rateCard }),
  });
  return { modules: clone(input.modules!), contract: clone(input.contract!), effectiveFrom, reason: typeof input.reason === 'string' ? input.reason.trim().slice(0, 500) : '' };
}

export function amendmentImpact(ctx: PlatformContext, t: TenantDetail, input: AmendmentInput): AmendmentImpact {
  const current = currentRecord(ctx.store, t.id) ?? notFound(ctx);
  const at = input.effectiveFrom;
  const config = configOn(ctx.store, at);
  const beforeModules = current.modules;
  const before = quoteOn(ctx.store, t, current.contract, at);
  const after = quoteOn(ctx.store, t, input.contract, at);
  const was = new Map(beforeModules.map((m) => [m.module, m]));
  const now = new Map(input.modules.map((m) => [m.module, m]));
  return {
    dependencies: checkDependencies(input.modules, config.modules),
    added: input.modules.filter((m) => !was.has(m.module)),
    removed: beforeModules.filter((m) => !now.has(m.module)),
    resited: input.modules.filter((m) => was.has(m.module) && sitesKey(was.get(m.module)!.sites) !== sitesKey(m.sites)).map((m) => ({ module: m.module, before: was.get(m.module)!.sites, after: m.sites })),
    before,
    after,
    delta: fromPaisa(toPaisa(after.regularPeriod.net) - toPaisa(before.regularPeriod.net)),
    access: accessImpact(t, beforeModules, input.modules.map(({ from: _f, ...m }) => m), at),
    retention: beforeModules.filter((m) => !now.has(m.module)).map((m) => m.module),
    evaluatedWith: config.labels,
  };
}

/** Grants after an amendment: modules it adds or widens start on its date. */
function datedGrants(before: readonly ModuleSelection[], after: readonly ModuleSelection[], from: string): ModuleSelection[] {
  const was = new Map(before.map((m) => [m.module, m]));
  return after.map(({ from: _ignored, ...m }) => {
    const old = was.get(m.module);
    if (old && sitesKey(old.sites) === sitesKey(m.sites)) return old.from ? { ...m, from: old.from } : m;
    return { ...m, from };
  });
}

/** Puts an approved amendment in force: the previous version is superseded, grants and price follow. */
export function applyAmendment(store: PlatformStore, tenantId: string, contractId: string, actor: { name: string; id: string }) {
  const record = store.contractHistory(tenantId).find((r) => r.contract.id === contractId);
  const tenant = clone(store.tenant(tenantId));
  if (!record || !tenant) return;
  const previous = currentRecord(store, tenantId);
  if (previous && previous.contract.id !== contractId) store.saveContractRecord(tenantId, { ...previous, contract: { ...previous.contract, status: 'superseded' } });
  const activated: SubscriptionContract = { ...record.contract, status: 'active', activatedAt: now() };
  store.saveContractRecord(tenantId, { ...record, contract: activated });
  tenant.contract = activated;
  tenant.contractStatus = 'active';
  tenant.grants = record.modules;
  tenant.modules = inForce(record.modules, TODAY).map((m) => m.module);
  const config = configOn(store, record.contract.effectiveFrom ?? TODAY);
  tenant.quote = priceContract({ contract: activated, quantities: tenantQuantities(tenant), quantitySource: 'snapshot', edition: tenant.edition, config: { policy: config.policy, rateCard: config.rateCard } });
  if (tenant.status === 'active' || tenant.status === 'grace') tenant.mrr = quoteOn(store, tenant, activated, record.contract.effectiveFrom ?? TODAY).regularPeriod.net;
  if (tenant.approval?.contractId === contractId) tenant.approval = null;
  store.saveTenant(tenant);
  store.addAudit({ at: now(), actorName: actor.name, actorId: actor.id, action: 'amendmentInForce', tenantId, tenantName: tenant.displayName, params: { version: String(record.contract.version) } });
}

/** Called when an approval of an amendment (contract version > 1) is decided. */
export function onAmendmentDecided(store: PlatformStore, approval: ContractApproval, decision: 'approve' | 'return', actor: { name: string; id: string }) {
  const record = store.contractHistory(approval.tenantId).find((r) => r.contract.id === approval.contractId);
  if (!record) return;
  const tenant = clone(store.tenant(approval.tenantId)!);
  if (decision === 'return') {
    store.saveContractRecord(approval.tenantId, { ...record, contract: { ...record.contract, status: 'returned' } });
    tenant.approval = null;
    tenant.contractStatus = 'active';
    store.saveTenant(tenant);
    return;
  }
  const from = record.contract.effectiveFrom ?? TODAY;
  if (from > TODAY) {
    store.saveContractRecord(approval.tenantId, { ...record, contract: { ...record.contract, status: 'scheduled' } });
    tenant.approval = null;
    tenant.contractStatus = 'active';
    store.saveTenant(tenant);
    store.addAudit({ at: now(), actorName: actor.name, actorId: actor.id, action: 'amendmentScheduled', tenantId: tenant.id, tenantName: tenant.displayName, params: { version: String(record.contract.version), date: from } });
  } else applyAmendment(store, approval.tenantId, approval.contractId, actor);
}

function createAmendment(ctx: PlatformContext) {
  const t = ctx.store.tenant(ctx.params.id!) ?? notFound(ctx);
  if (!['active', 'trial', 'grace'].includes(t.status)) fail(ctx, 409, 'invalid_transition', 'platform:amend.errors.status');
  const history = ctx.store.contractHistory(t.id);
  if (history.some((r) => ['pending_approval', 'scheduled'].includes(r.contract.status))) fail(ctx, 409, 'amendment_open', 'platform:amend.errors.open');
  const input = readInput(ctx, t);
  if (!input.reason) invalid(ctx, { reason: 'platform:amend.validation.reason' });
  const impact = amendmentImpact(ctx, t, input);
  if (!impact.dependencies.ok) invalid(ctx, { modules: 'platform:errors.dependencies' });
  const current = currentRecord(ctx.store, t.id)!;
  const grants = datedGrants(current.modules, input.modules, input.effectiveFrom);
  const changes = contractDiff(current, { contract: input.contract, modules: grants });
  if (!changes.length) invalid(ctx, { contract: 'platform:amend.validation.noChanges' });

  const version = Math.max(...history.map((r) => r.contract.version)) + 1;
  const actor = { name: ctx.persona!.displayName, id: principalOf(ctx) };
  const at = now();
  const needsApproval = impact.after.approval.required;
  const status: SubscriptionContract['status'] = needsApproval ? 'pending_approval' : input.effectiveFrom > TODAY ? 'scheduled' : 'active';
  const contract: SubscriptionContract = {
    ...input.contract,
    id: `ctr_${t.id.replace(/^tnt_/, '')}_${version}`,
    tenantId: t.id,
    version,
    status,
    createdBy: actor.name,
    createdById: actor.id,
    createdAt: at,
    supersedesId: current.contract.id,
    effectiveFrom: input.effectiveFrom,
  };
  ctx.store.saveContractRecord(t.id, { contract, modules: grants, reason: input.reason, changes });
  ctx.store.addAudit({ at, actorName: actor.name, actorId: actor.id, action: needsApproval ? 'amendmentRequested' : 'amendmentScheduled', tenantId: t.id, tenantName: t.displayName, params: { version: String(version), date: input.effectiveFrom, reason: input.reason }, changes });

  if (needsApproval) {
    const approval: ContractApproval = { id: ctx.store.nextId('apr'), tenantId: t.id, contractId: contract.id, contractVersion: version, reasons: impact.after.approval.reasons, requestedBy: actor.name, requestedById: actor.id, requestedAt: at, status: 'pending' };
    ctx.store.saveApproval(approval);
    const tenant = clone(t);
    tenant.approval = approval;
    tenant.contractStatus = 'pending_approval';
    ctx.store.saveTenant(tenant);
  } else if (status === 'active') applyAmendment(ctx.store, t.id, contract.id, actor);
  return history_(ctx, t.id);
}

function withdrawAmendment(ctx: PlatformContext) {
  const t = ctx.store.tenant(ctx.params.id!) ?? notFound(ctx);
  const record = ctx.store.contractHistory(t.id).find((r) => r.contract.id === ctx.params.contractId) ?? notFound(ctx);
  if (!['pending_approval', 'scheduled'].includes(record.contract.status)) fail(ctx, 409, 'invalid_transition', 'platform:amend.errors.notOpen');
  ctx.store.saveContractRecord(t.id, { ...record, contract: { ...record.contract, status: 'cancelled' } });
  const pending = ctx.store.approvals().find((a) => a.contractId === record.contract.id && a.status === 'pending');
  if (pending) ctx.store.saveApproval({ ...pending, status: 'returned', decidedBy: ctx.persona!.displayName, decidedById: principalOf(ctx), decidedAt: now(), comment: 'Withdrawn by its author' });
  const tenant = clone(t);
  if (tenant.approval?.contractId === record.contract.id) tenant.approval = null;
  tenant.contractStatus = 'active';
  ctx.store.saveTenant(tenant);
  ctx.store.addAudit({ at: now(), actorName: ctx.persona!.displayName, actorId: principalOf(ctx), action: 'amendmentWithdrawn', tenantId: t.id, tenantName: t.displayName, params: { version: String(record.contract.version) } });
  return history_(ctx, t.id);
}

const DISPLAY: Record<SubscriptionContract['status'], ContractVersionEntry['display']> = {
  active: 'in_force',
  scheduled: 'scheduled',
  superseded: 'superseded',
  pending_approval: 'pending_approval',
  returned: 'returned',
  cancelled: 'withdrawn',
  draft: 'pending_approval',
  ended: 'superseded',
};

function history_(ctx: PlatformContext, tenantId: string): ContractHistory {
  const t = ctx.store.tenant(tenantId) ?? notFound(ctx);
  const approvals = ctx.store.approvals();
  return {
    tenantId,
    versions: ctx.store
      .contractHistory(tenantId)
      .map((r): ContractVersionEntry => {
        const from = r.contract.effectiveFrom ?? r.contract.terms.start;
        const approval = approvals.find((a) => a.contractId === r.contract.id);
        return {
          contract: r.contract,
          modules: r.modules,
          effectiveFrom: from,
          display: DISPLAY[r.contract.status],
          ...(r.reason ? { reason: r.reason } : {}),
          changes: r.changes,
          ...(approval ? { approval } : {}),
          monthlyNet: t.status === 'draft' ? pkr('0.00') : quoteOn(ctx.store, t, r.contract, from < TODAY && r.contract.status === 'active' ? TODAY : from).regularPeriod.net,
        };
      })
      .reverse(),
  };
}

export const AMENDMENT_HANDLERS: PlatformHandler[] = [
  { method: 'GET', pattern: /^\/platform\/tenants\/(?<id>[\w-]+)\/contracts$/, permission: ['platform.tenants.view'], handle: (ctx) => history_(ctx, ctx.params.id!) },
  {
    method: 'POST',
    pattern: /^\/platform\/tenants\/(?<id>[\w-]+)\/amendments\/preview$/,
    permission: ['platform.contracts.manage', 'platform.grants.manage'],
    handle: (ctx): AmendmentImpact => {
      const t = ctx.store.tenant(ctx.params.id!) ?? notFound(ctx);
      return amendmentImpact(ctx, t, readInput(ctx, t));
    },
  },
  { method: 'POST', pattern: /^\/platform\/tenants\/(?<id>[\w-]+)\/amendments$/, permission: ['platform.contracts.manage', 'platform.grants.manage'], handle: createAmendment },
  { method: 'POST', pattern: /^\/platform\/tenants\/(?<id>[\w-]+)\/amendments\/(?<contractId>[\w-]+)\/withdraw$/, permission: ['platform.contracts.manage', 'platform.grants.manage'], handle: withdrawAmendment },
];
