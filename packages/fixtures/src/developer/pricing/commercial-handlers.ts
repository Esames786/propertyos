import { ownReplay, requireDraftRequestKey } from './request-key';
import { ApiError, type CommercialRulesDraft, type CommercialRulesDraftList, type CommercialRulesDraftVersion, type CommercialRulesPreview } from '@repo/contracts';
import { invalid, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { projectVisible } from '../scope';
import { inventoryVisible } from '../inventory/scope';
import { InvalidCommercialRule, previewCommercial, validateCommercialRules } from './commercial-calculator';

const SECTION = 'developer.pricing.commercial';
const NEED = { module: 'inventory', permission: 'pricing.manage' } as const;
type Operation = 'create' | 'revise';
interface Remembered {
  operation: Operation;
  actor: string;
  target: string;
  fingerprint: string;
  response: CommercialRulesDraft;
}
interface CommercialStore {
  version: 1;
  tenantId: string;
  next: number;
  drafts: CommercialRulesDraft[];
  idempotency: Record<string, Remembered>;
}
const make = (tenantId: string): CommercialStore => ({
  version: 1, tenantId, next: 1, drafts: [], idempotency: Object.create(null) as Record<string, Remembered>,
});
const clone = <T,>(value: T): T => structuredClone(value);
const actor = (ctx: HandlerContext) => ctx.persona?.principalId ?? '';
const inProject = (ctx: HandlerContext, projectId: string) =>
  ctx.access?.tenant.type === 'developer' && projectVisible(ctx, projectId, NEED);
const readStore = (ctx: HandlerContext): CommercialStore | undefined => {
  const s = ctx.demo.peekSection<CommercialStore>(SECTION);
  return s?.version === 1 && s.tenantId === ctx.tenantId ? s : undefined;
};
const canRead = (ctx: HandlerContext, draft: CommercialRulesDraft) =>
  draft.tenantId === ctx.tenantId && draft.creatorPrincipalId === actor(ctx) && inProject(ctx, draft.projectId);
const getDraft = (ctx: HandlerContext, id: string | undefined): CommercialRulesDraft => {
  const draft = readStore(ctx)?.drafts.find((d) => d.id === id);
  if (!draft || !canRead(ctx, draft)) notFound(ctx);
  return draft;
};
const payload = (ctx: HandlerContext): Record<string, unknown> => {
  const raw = ctx.req.body;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid(ctx, 'commercial');
  return raw as Record<string, unknown>;
};
const titleOf = (ctx: HandlerContext, raw: unknown) => {
  if (typeof raw !== 'string') invalid(ctx, 'title');
  const s = raw.trim().replace(/\s+/g, ' ');
  if (s.length < 3 || s.length > 100) invalid(ctx, 'title');
  return s;
};
function rulesOf(ctx: HandlerContext, raw: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(raw).some((key) => !allowed.includes(key))) invalid(ctx, 'commercial');
  const title = titleOf(ctx, raw.title);
  try { return { title, ...validateCommercialRules(raw.fees, raw.discounts) }; }
  catch (err) {
    if (err instanceof InvalidCommercialRule) invalid(ctx, 'rules');
    throw err;
  }
}
const keyOf = (ctx: HandlerContext, raw: Record<string, unknown>) => requireDraftRequestKey(ctx, raw);
function conflict(ctx: HandlerContext): never {
  throw new ApiError({ status: 409, code: 'idempotency_key_reused', messageKey: 'pricing:commercialConflict', correlationId: ctx.correlationId, changed: false });
}
function replay(ctx: HandlerContext, key: string, op: Operation, target: string, fingerprint: string) {
  const prior = ownReplay(readStore(ctx)?.idempotency, key);
  if (!prior) return undefined;
  if (prior.operation !== op || prior.actor !== actor(ctx) || prior.target !== target || prior.fingerprint !== fingerprint) conflict(ctx);
  getDraft(ctx, prior.response.id); // Authorization rechecked at time of retry.
  return clone(prior.response);
}
const summary = (d: CommercialRulesDraft) => ({
  id: d.id, projectId: d.projectId, title: d.versions.at(-1)!.title,
  currentVersion: d.currentVersion, state: 'draft' as const,
});

export const COMMERCIAL_HANDLERS: readonly Handler[] = [
  {
    method: 'GET', pattern: /^\/pricing\/commercial-rules$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): CommercialRulesDraftList => {
      const project = ctx.req.query?.project;
      const q = String(ctx.req.query?.q ?? '').trim().toLocaleLowerCase().slice(0, 100);
      const items = (readStore(ctx)?.drafts ?? []).filter((d) => canRead(ctx, d))
        .filter((d) => (project === undefined || d.projectId === project) && (!q || summary(d).title.toLocaleLowerCase().includes(q)))
        .map(summary);
      return { items, total: items.length };
    },
  },
  {
    method: 'GET', pattern: /^\/pricing\/commercial-rules\/(?<draftId>[\w-]+)$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): CommercialRulesDraft => clone(getDraft(ctx, ctx.params.draftId)),
  },
  {
    method: 'POST', pattern: /^\/pricing\/commercial-rules$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): CommercialRulesDraft => {
      const raw = payload(ctx);
      if (typeof raw.projectId !== 'string' || !inProject(ctx, raw.projectId)) notFound(ctx);
      const values = rulesOf(ctx, raw, ['projectId', 'title', 'fees', 'discounts', 'idempotencyKey']);
      const key = keyOf(ctx, raw);
      const fingerprint = JSON.stringify(values);
      const prior = replay(ctx, key, 'create', raw.projectId, fingerprint);
      if (prior) return prior;
      const previous = ctx.demo.peekSection<CommercialStore>(SECTION);
      if (previous && (previous.version !== 1 || previous.tenantId !== ctx.tenantId)) conflict(ctx);
      const store = ctx.demo.section<CommercialStore>(SECTION, () => make(ctx.tenantId!));
      const draft: CommercialRulesDraft = {
        id: `cdr_${String(store.next).padStart(6, '0')}`, tenantId: ctx.tenantId!,
        projectId: raw.projectId, creatorPrincipalId: actor(ctx),
        currentVersion: 1,
        versions: [{ version: 1, ...values, createdAt: ctx.at, createdBy: actor(ctx), state: 'draft' }],
        state: 'draft', effective: false, approvalAllowed: false,
      };
      store.next += 1;
      store.drafts.push(draft);
      store.idempotency[key] = { operation: 'create', actor: actor(ctx), target: raw.projectId, fingerprint, response: clone(draft) };
      ctx.demo.save();
      return clone(draft);
    },
  },
  {
    method: 'POST', pattern: /^\/pricing\/commercial-rules\/(?<draftId>[\w-]+)\/versions$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): CommercialRulesDraft => {
      const draft = getDraft(ctx, ctx.params.draftId);
      const raw = payload(ctx);
      if (!Number.isSafeInteger(raw.expectedVersion) || (raw.expectedVersion as number) < 1) invalid(ctx, 'expectedVersion');
      const values = rulesOf(ctx, raw, ['expectedVersion', 'title', 'fees', 'discounts', 'idempotencyKey']);
      const key = keyOf(ctx, raw);
      const fingerprint = JSON.stringify([raw.expectedVersion, values]);
      const prior = replay(ctx, key, 'revise', draft.id, fingerprint);
      if (prior) return prior;
      if (draft.currentVersion !== raw.expectedVersion) conflict(ctx);
      const next: CommercialRulesDraftVersion = {
        version: draft.currentVersion + 1, ...values, createdAt: ctx.at, createdBy: actor(ctx), state: 'draft',
      };
      draft.versions.push(next);
      draft.currentVersion = next.version;
      readStore(ctx)!.idempotency[key] = { operation: 'revise', actor: actor(ctx), target: draft.id, fingerprint, response: clone(draft) };
      ctx.demo.save();
      return clone(draft);
    },
  },
  {
    // PREVIEW IS NON-POSTING, NON-MUTATING. The named private draft and selected
    // unit are independently authorized; hidden/unknown unit IDs answer identically.
    method: 'POST', pattern: /^\/pricing\/commercial-preview$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): CommercialRulesPreview => {
      const raw = payload(ctx);
      if (Object.keys(raw).some((key) => !['draftId', 'unitId'].includes(key))) invalid(ctx, 'commercial');
      const draft = typeof raw.draftId === 'string' ? getDraft(ctx, raw.draftId) : notFound(ctx);
      const unit = typeof raw.unitId === 'string'
        ? ctx.data.units.find((u) => u.id === raw.unitId && u.projectId === draft.projectId &&
          inventoryVisible(ctx, u.projectId) &&
          inProject(ctx, u.projectId))
        : undefined;
      if (!unit) notFound(ctx);
      const current = draft.versions.at(-1)!;
      let result: ReturnType<typeof previewCommercial>;
      try { result = previewCommercial(unit.price, current.fees, current.discounts); }
      catch (e) {
        if (e instanceof InvalidCommercialRule) invalid(ctx, 'commercial');
        throw e;
      }
      const projectName = ctx.data.projects.find((p) => p.id === unit.projectId)?.name ?? '';
      return {
        unit: { id: unit.id, ref: unit.ref, projectId: unit.projectId, projectName, currentListedPrice: clone(unit.price) },
        listedPrice: clone(unit.price), ...result,
        previewOnly: true, policyStatus: 'not_approved', postingAllowed: false,
      };
    },
  },
];
