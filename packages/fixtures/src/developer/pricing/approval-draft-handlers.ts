import { requireDraftRequestKey } from './request-key';
import { rememberDraft, replayDraft, staleVersion } from './draft-replay';
import type { IdempotencyStore } from '../../idempotency';
import { type PricingApprovalDraft, type PricingApprovalDraftList, type PricingApprovalDraftVersion, type PricingApprovalRule, type PricingApprovalSubject } from '@repo/contracts';
import { invalid, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { projectVisible } from '../scope';
import { fromPaisa, toPaisa, InvalidCommercialRule } from './commercial-calculator';

const SECTION = 'developer.pricing.approval-rules';
const NEED = { module: 'inventory', permission: 'pricing.manage' } as const;
const SUBJECTS: readonly PricingApprovalSubject[] = ['unit_price_change', 'discount_exception', 'fee_exception', 'payment_plan_exception'];
type Op = 'create' | 'revise';
/** `idempotency`: E.0 bound entries (`replayOf` / `remember`); absent in a section written before Wave 2. */
interface Store { version: 1; tenantId: string; next: number; drafts: PricingApprovalDraft[]; idempotency?: IdempotencyStore }
const fresh = (tenantId: string): Store => ({ version: 1, tenantId, next: 1, drafts: [], idempotency: {} });
const clone = (d: PricingApprovalDraft) => structuredClone(d);
const principal = (ctx: HandlerContext) => ctx.persona?.principalId ?? '';
const permitted = (ctx: HandlerContext, projectId: string): boolean =>
  ctx.access?.tenant.type === 'developer' && projectVisible(ctx, projectId, NEED);
function stored(ctx: HandlerContext): Store | undefined {
  const record = ctx.demo.peekSection<Store>(SECTION);
  return record?.version === 1 && record.tenantId === ctx.tenantId ? record : undefined;
}
const visible = (ctx: HandlerContext, d: PricingApprovalDraft): boolean =>
  d.tenantId === ctx.tenantId && d.creatorPrincipalId === principal(ctx) && permitted(ctx, d.projectId);
function own(ctx: HandlerContext, id: string | undefined): PricingApprovalDraft {
  const record = stored(ctx)?.drafts.find((d) => d.id === id);
  if (!record || !visible(ctx, record)) notFound(ctx);
  return record;
}
function input(ctx: HandlerContext) {
  const v = ctx.req.body;
  if (!v || typeof v !== 'object' || Array.isArray(v)) invalid(ctx, 'rules');
  return v as Record<string, unknown>;
}
function normalize(ctx: HandlerContext, v: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(v).some((key) => !allowed.includes(key))) invalid(ctx, 'rules');
  if (typeof v.title !== 'string') invalid(ctx, 'title');
  const title = v.title.trim().replace(/\s+/g, ' ');
  if (title.length < 3 || title.length > 100) invalid(ctx, 'title');
  if (!Array.isArray(v.rules) || v.rules.length < 1 || v.rules.length > 4) invalid(ctx, 'rules');
  const seen = new Set<string>();
  const rules: PricingApprovalRule[] = [];
  for (const item of v.rules) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid(ctx, 'rules');
    const rule = item as Record<string, unknown>;
    if (Object.keys(rule).some((k) => !['subject', 'threshold', 'requiredReviewers', 'makerCheckerRequired', 'allowSelfApproval'].includes(k))) invalid(ctx, 'rules');
    if (typeof rule.subject !== 'string' || !SUBJECTS.includes(rule.subject as PricingApprovalSubject) || seen.has(rule.subject)) invalid(ctx, 'rules');
    if (rule.allowSelfApproval !== false || rule.makerCheckerRequired !== true) invalid(ctx, 'rules');
    if (![1, 2, 3].includes(rule.requiredReviewers as number)) invalid(ctx, 'rules');
    let threshold;
    try { threshold = fromPaisa(toPaisa(rule.threshold)); } catch (e) {
      if (e instanceof InvalidCommercialRule) invalid(ctx, 'rules');
      throw e;
    }
    seen.add(rule.subject);
    rules.push({
      subject: rule.subject as PricingApprovalSubject, threshold,
      requiredReviewers: rule.requiredReviewers as 1 | 2 | 3,
      makerCheckerRequired: true, allowSelfApproval: false,
    });
  }
  rules.sort((a, b) => a.subject.localeCompare(b.subject));
  return { title, rules };
}
const key = (ctx: HandlerContext, v: Record<string, unknown>): string => requireDraftRequestKey(ctx, v);
const stale = (ctx: HandlerContext): never => staleVersion(ctx, 'pricing:approvalConflict');
/** E.0's bound replay; the original is re-authorized, not just the current request. */
const replay = (ctx: HandlerContext, op: Op, target: string, input: unknown, stillAuthorized: () => boolean) =>
  replayDraft(ctx, stored(ctx)?.idempotency, { op: `pricing.approval.${op}`, target, input, stillAuthorized },
    (id) => stored(ctx)?.drafts.find((d) => d.id === id && visible(ctx, d)));
const short = (d: PricingApprovalDraft) => ({
  id: d.id, projectId: d.projectId, title: d.versions.at(-1)!.title,
  currentVersion: d.currentVersion, state: 'draft' as const,
});

export const APPROVAL_DRAFT_HANDLERS: readonly Handler[] = [
  {
    method: 'GET', pattern: /^\/pricing\/approval-rules$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): PricingApprovalDraftList => {
      const project = ctx.req.query?.project, q = String(ctx.req.query?.q ?? '').trim().toLowerCase().slice(0, 100);
      const items = (stored(ctx)?.drafts ?? []).filter((d) => visible(ctx, d))
        .filter((d) => (project === undefined || project === d.projectId) && (!q || short(d).title.toLowerCase().includes(q)))
        .map(short);
      return { items, total: items.length };
    },
  },
  {
    method: 'GET', pattern: /^\/pricing\/approval-rules\/(?<draftId>[\w-]+)$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): PricingApprovalDraft => clone(own(ctx, ctx.params.draftId)),
  },
  {
    method: 'POST', pattern: /^\/pricing\/approval-rules$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): PricingApprovalDraft => {
      const body = input(ctx);
      if (typeof body.projectId !== 'string' || !permitted(ctx, body.projectId)) notFound(ctx);
      const v = normalize(ctx, body, ['projectId', 'title', 'rules', 'idempotencyKey']);
      key(ctx, body);
      const projectId = body.projectId;
      const old = replay(ctx, 'create', projectId, v, () => permitted(ctx, projectId));
      if (old) return old;
      const existing = ctx.demo.peekSection<Store>(SECTION);
      if (existing && (existing.version !== 1 || existing.tenantId !== ctx.tenantId)) stale(ctx);
      const store = ctx.demo.section<Store>(SECTION, () => fresh(ctx.tenantId!));
      const draft: PricingApprovalDraft = {
        id: `pad_${String(store.next).padStart(6, '0')}`, tenantId: ctx.tenantId!, projectId: body.projectId,
        creatorPrincipalId: principal(ctx), currentVersion: 1,
        versions: [{ version: 1, ...v, createdAt: ctx.at, createdBy: principal(ctx), state: 'draft' }],
        state: 'draft', effective: false, activationAllowed: false, approvesTransactions: false,
      };
      store.next += 1;
      store.drafts.push(draft);
      rememberDraft(ctx, (store.idempotency ??= {}), { op: 'pricing.approval.create', target: draft.projectId, input: v }, draft);
      ctx.demo.save();
      return clone(draft);
    },
  },
  {
    method: 'POST', pattern: /^\/pricing\/approval-rules\/(?<draftId>[\w-]+)\/versions$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): PricingApprovalDraft => {
      const draft = own(ctx, ctx.params.draftId), body = input(ctx);
      if (!Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) invalid(ctx, 'expectedVersion');
      const v = normalize(ctx, body, ['title', 'rules', 'expectedVersion', 'idempotencyKey']);
      key(ctx, body);
      const bound = { expectedVersion: body.expectedVersion, ...v };
      const old = replay(ctx, 'revise', draft.id, bound, () => visible(ctx, draft));
      if (old) return old;
      if (draft.currentVersion !== body.expectedVersion) stale(ctx);
      const next: PricingApprovalDraftVersion = {
        version: draft.currentVersion + 1, ...v, createdAt: ctx.at, createdBy: principal(ctx), state: 'draft',
      };
      draft.versions.push(next); draft.currentVersion = next.version;
      const store = stored(ctx)!;
      rememberDraft(ctx, (store.idempotency ??= {}), { op: 'pricing.approval.revise', target: draft.id, input: bound }, draft);
      ctx.demo.save();
      return clone(draft);
    },
  },
];
