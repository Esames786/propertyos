import { requireDraftRequestKey } from './request-key';
import { rememberDraft, replayDraft, staleVersion } from './draft-replay';
import type { IdempotencyStore } from '../../idempotency';
import { type PricingPolicyDraft, type PricingPolicyDraftList, type PricingPolicyDraftVersion, type PricingPolicyRule } from '@repo/contracts';
import { invalid, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { projectVisible } from '../scope';

const SECTION = 'developer.pricing.policies';
const NEED = { module: 'inventory', permission: 'pricing.manage' } as const;
type Op = 'create' | 'revise';
interface Store {
  version: 1;
  tenantId: string;
  next: number;
  policies: PricingPolicyDraft[];
  /** E.0 bound idempotency entries (`replayOf` / `remember`); absent in a section written before Wave 2. */
  idempotency?: IdempotencyStore;
}
const init = (tenantId: string): Store => ({ version: 1, tenantId, next: 1, policies: [], idempotency: {} });
const clone = (value: PricingPolicyDraft): PricingPolicyDraft => structuredClone(value);
const principal = (ctx: HandlerContext) => ctx.persona?.principalId ?? '';
const authProject = (ctx: HandlerContext, projectId: string): boolean =>
  ctx.access?.tenant.type === 'developer' && projectVisible(ctx, projectId, NEED);
const state = (ctx: HandlerContext): Store | undefined => {
  const found = ctx.demo.peekSection<Store>(SECTION);
  return found?.version === 1 && found.tenantId === ctx.tenantId ? found : undefined;
};
const readable = (ctx: HandlerContext, policy: PricingPolicyDraft): boolean =>
  policy.tenantId === ctx.tenantId && policy.creatorPrincipalId === principal(ctx) && authProject(ctx, policy.projectId);
const own = (ctx: HandlerContext, id: string | undefined): PricingPolicyDraft => {
  const policy = state(ctx)?.policies.find((p) => p.id === id);
  if (!policy || !readable(ctx, policy)) notFound(ctx);
  return policy;
};
function body(ctx: HandlerContext): Record<string, unknown> {
  const raw = ctx.req.body;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid(ctx, 'policy');
  return raw as Record<string, unknown>;
}
function titleOf(ctx: HandlerContext, raw: unknown): string {
  if (typeof raw !== 'string') invalid(ctx, 'title');
  const title = raw.trim().replace(/\s+/g, ' ');
  if (title.length < 3 || title.length > 100) invalid(ctx, 'title');
  return title;
}
const MAX_RATE = 10000000000000n; // Rs 100,000,000,000.00 illustrative data bound, not an approved rate.
function validate(ctx: HandlerContext, input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some((key) => !allowed.includes(key))) invalid(ctx, 'policy');
  const title = titleOf(ctx, input.title);
  if (!Array.isArray(input.rules) || input.rules.length < 1 || input.rules.length > 3) invalid(ctx, 'rules');
  const seen = new Set<string>();
  const rules: PricingPolicyRule[] = [];
  for (const raw of input.rules) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid(ctx, 'rules');
    const record = raw as Record<string, unknown>;
    if (Object.keys(record).some((key) => !['unitType', 'baseRate', 'floorRiseBps', 'cornerPremiumBps', 'parkFacingPremiumBps'].includes(key))) invalid(ctx, 'rules');
    if (!['residential', 'commercial', 'mixed'].includes(String(record.unitType)) || seen.has(String(record.unitType))) invalid(ctx, 'rules');
    seen.add(String(record.unitType));
    const base = record.baseRate;
    if (!base || typeof base !== 'object' || Array.isArray(base)) invalid(ctx, 'rules');
    const price = base as Record<string, unknown>;
    if (Object.keys(price).some((key) => !['amount', 'currency'].includes(key)) ||
      price.currency !== 'PKR' || typeof price.amount !== 'string' ||
      !/^(0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(price.amount)) invalid(ctx, 'rules');
    const [rupees, decimals = ''] = price.amount.split('.');
    const total = BigInt(rupees!) * 100n + BigInt(decimals.padEnd(2, '0') || '00');
    if (total > MAX_RATE) invalid(ctx, 'rules');
    const fields = ['floorRiseBps', 'cornerPremiumBps', 'parkFacingPremiumBps'] as const;
    if (fields.some((field) => !Number.isSafeInteger(record[field]) || (record[field] as number) < 0 || (record[field] as number) > 10000)) invalid(ctx, 'rules');
    rules.push({
      unitType: record.unitType as PricingPolicyRule['unitType'],
      baseRate: { currency: 'PKR', amount: `${total / 100n}.${String(total % 100n).padStart(2, '0')}` },
      floorRiseBps: record.floorRiseBps as number,
      cornerPremiumBps: record.cornerPremiumBps as number,
      parkFacingPremiumBps: record.parkFacingPremiumBps as number,
    });
  }
  // Sort by unit type so request order alone does not create an artificial new policy.
  rules.sort((a, b) => a.unitType.localeCompare(b.unitType));
  return { title, rules };
}
const keyOf = (ctx: HandlerContext, input: Record<string, unknown>): string => requireDraftRequestKey(ctx, input);
const stale = (ctx: HandlerContext): never => staleVersion(ctx, 'pricing:policyConflict');
/** E.0's bound replay; current permission, project and creator are rechecked *before* a replay. */
const replay = (ctx: HandlerContext, op: Op, target: string, input: unknown, stillAuthorized: () => boolean) =>
  replayDraft(ctx, state(ctx)?.idempotency, { op: `pricing.policy.${op}`, target, input, stillAuthorized },
    (id) => state(ctx)?.policies.find((p) => p.id === id && readable(ctx, p)));
const summary = (p: PricingPolicyDraft) => ({
  id: p.id, projectId: p.projectId, title: p.versions.at(-1)!.title,
  currentVersion: p.currentVersion, state: 'draft' as const,
});

export const PRICING_POLICY_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/pricing\/policies$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): PricingPolicyDraftList => {
      const project = ctx.req.query?.project;
      const q = String(ctx.req.query?.q ?? '').trim().toLocaleLowerCase().slice(0, 100);
      const items = (state(ctx)?.policies ?? []).filter((p) => readable(ctx, p))
        .filter((p) => (project === undefined || p.projectId === project) && (!q || summary(p).title.toLocaleLowerCase().includes(q)))
        .map(summary);
      return { items, total: items.length };
    },
  },
  {
    method: 'GET',
    pattern: /^\/pricing\/policies\/(?<policyId>[\w-]+)$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): PricingPolicyDraft => clone(own(ctx, ctx.params.policyId)),
  },
  {
    method: 'POST',
    pattern: /^\/pricing\/policies$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): PricingPolicyDraft => {
      const input = body(ctx);
      if (typeof input.projectId !== 'string' || !authProject(ctx, input.projectId)) notFound(ctx);
      const parsed = validate(ctx, input, ['projectId', 'title', 'rules', 'idempotencyKey']);
      keyOf(ctx, input);
      const projectId = input.projectId;
      const previous = replay(ctx, 'create', projectId, parsed, () => authProject(ctx, projectId));
      if (previous) return previous;
      const current = ctx.demo.peekSection<Store>(SECTION);
      if (current && (current.version !== 1 || current.tenantId !== ctx.tenantId)) stale(ctx);
      const store = ctx.demo.section<Store>(SECTION, () => init(ctx.tenantId!));
      const policy: PricingPolicyDraft = {
        id: `prp_${String(store.next).padStart(6, '0')}`,
        tenantId: ctx.tenantId!, projectId: input.projectId,
        creatorPrincipalId: principal(ctx), currentVersion: 1,
        versions: [{ version: 1, ...parsed, createdAt: ctx.at, createdBy: principal(ctx), state: 'draft' }],
        state: 'draft', effective: false, approvalAllowed: false,
      };
      store.next += 1;
      store.policies.push(policy);
      rememberDraft(ctx, (store.idempotency ??= {}), { op: 'pricing.policy.create', target: policy.projectId, input: parsed }, policy);
      ctx.demo.save();
      return clone(policy);
    },
  },
  {
    method: 'POST',
    pattern: /^\/pricing\/policies\/(?<policyId>[\w-]+)\/versions$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): PricingPolicyDraft => {
      const policy = own(ctx, ctx.params.policyId);
      const input = body(ctx);
      if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 1) invalid(ctx, 'expectedVersion');
      const parsed = validate(ctx, input, ['expectedVersion', 'title', 'rules', 'idempotencyKey']);
      keyOf(ctx, input);
      const bound = { expectedVersion: input.expectedVersion, ...parsed };
      const previous = replay(ctx, 'revise', policy.id, bound, () => readable(ctx, policy));
      if (previous) return previous;
      if (policy.currentVersion !== input.expectedVersion) stale(ctx);
      const next: PricingPolicyDraftVersion = {
        version: policy.currentVersion + 1, ...parsed, createdAt: ctx.at,
        createdBy: principal(ctx), state: 'draft',
      };
      policy.versions.push(next);
      policy.currentVersion = next.version;
      const store = state(ctx)!;
      rememberDraft(ctx, (store.idempotency ??= {}), { op: 'pricing.policy.revise', target: policy.id, input: bound }, policy);
      ctx.demo.save();
      return clone(policy);
    },
  },
];
