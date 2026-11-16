import { requireDraftRequestKey } from './request-key';
import { ApiError, type PaymentPlanTemplate, type PaymentPlanTemplateList, type PaymentPlanTemplateSummary, type PaymentPlanTemplateVersion } from '@repo/contracts';
import { invalid, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { projectVisible } from '../scope';
import { allocationsOf, InvalidPlanError } from './calculator';

/** Drafts are tenant-partitioned, creator-private, and have no approval/publishing path. */
const SECTION = 'developer.pricing.templates';
const NEED = { module: 'inventory', permission: 'pricing.manage' } as const;
interface BoundRequest {
  operation: 'create' | 'revise';
  principalId: string;
  target: string;
  fingerprint: string;
  response: PaymentPlanTemplate;
}
interface TemplateStore {
  version: 1;
  tenantId: string;
  nextSequence: number;
  templates: PaymentPlanTemplate[];
  requests: Record<string, BoundRequest>;
}
const empty = (tenantId: string): TemplateStore => ({ version: 1, tenantId, nextSequence: 1, templates: [], requests: {} });
const snapshot = (v: PaymentPlanTemplate): PaymentPlanTemplate => structuredClone(v);
const state = (ctx: HandlerContext): TemplateStore | undefined => {
  const stored = ctx.demo.peekSection<TemplateStore>(SECTION);
  return stored?.version === 1 && stored.tenantId === ctx.tenantId ? stored : undefined;
};
const principal = (ctx: HandlerContext): string => ctx.persona?.principalId ?? '';
const authProject = (ctx: HandlerContext, projectId: string): boolean =>
  !!ctx.access && ctx.access.tenant.type === 'developer' && projectVisible(ctx, projectId, NEED);
const readable = (ctx: HandlerContext, template: PaymentPlanTemplate) =>
  template.tenantId === ctx.tenantId && template.creatorPrincipalId === principal(ctx) && authProject(ctx, template.projectId);
const own = (ctx: HandlerContext, id: string | undefined): PaymentPlanTemplate => {
  const found = state(ctx)?.templates.find((x) => x.id === id);
  if (!found || !readable(ctx, found)) notFound(ctx);
  return found;
};
const body = (ctx: HandlerContext): Record<string, unknown> => {
  const raw = ctx.req.body;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid(ctx, 'template');
  return raw as Record<string, unknown>;
};
const text = (ctx: HandlerContext, raw: unknown): string => {
  if (typeof raw !== 'string') invalid(ctx, 'title');
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < 3 || value.length > 100) invalid(ctx, 'title');
  return value;
};
function parsed(ctx: HandlerContext, raw: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(raw).some((key) => !keys.includes(key))) invalid(ctx, 'template');
  const title = text(ctx, raw.title);
  let allocations: PaymentPlanTemplateVersion['allocations'];
  try { allocations = allocationsOf(raw.allocations); }
  catch (e) {
    if (e instanceof InvalidPlanError) invalid(ctx, 'allocations');
    throw e;
  }
  return { title, allocations };
}
const requestKey = (ctx: HandlerContext): string => requireDraftRequestKey(ctx);
function collision(ctx: HandlerContext): never {
  throw new ApiError({ status: 409, code: 'idempotency_key_reused', messageKey: 'pricing:templateConflict', correlationId: ctx.correlationId, changed: false });
}
function checkReplay(ctx: HandlerContext, key: string, operation: BoundRequest['operation'], target: string, fingerprint: string): PaymentPlanTemplate | undefined {
  const record = state(ctx)?.requests[key];
  if (!record) return undefined;
  if (record.operation !== operation || record.target !== target || record.principalId !== principal(ctx) || record.fingerprint !== fingerprint) collision(ctx);
  // Permission, project, tenant and current creator check always run BEFORE replay is returned.
  own(ctx, record.response.id);
  return snapshot(record.response);
}
const summary = (t: PaymentPlanTemplate): PaymentPlanTemplateSummary => ({
  id: t.id, projectId: t.projectId,
  title: t.versions[t.versions.length - 1]!.title,
  currentVersion: t.currentVersion, state: 'draft',
});

/**
 * Every draft mutation validates the whole request and effective project authority
 * before touching section data, incrementing IDs or persisting request-key metadata.
 * Revision history is append-only; no edited or deleted prior versions.
 */
export const PLAN_TEMPLATE_HANDLERS: readonly Handler[] = [
  {
    method: 'GET', pattern: /^\/pricing\/template-projects$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): { items: Array<{ id: string; name: string }>; total: number } => {
      const items = ctx.data.projects.filter((project) => authProject(ctx, project.id))
        .map((project) => ({ id: project.id, name: project.name }));
      return { items, total: items.length };
    },
  },
  {
    method: 'GET', pattern: /^\/pricing\/plan-templates$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): PaymentPlanTemplateList => {
      const list = (state(ctx)?.templates ?? []).filter((t) => readable(ctx, t));
      const project = ctx.req.query?.project;
      const q = String(ctx.req.query?.q ?? '').trim().toLocaleLowerCase().slice(0, 100);
      const filtered = list.filter((t) =>
        (project === undefined || t.projectId === String(project)) &&
        (!q || summary(t).title.toLocaleLowerCase().includes(q)));
      return { items: filtered.map(summary), total: filtered.length };
    },
  },
  {
    method: 'GET', pattern: /^\/pricing\/plan-templates\/(?<templateId>[\w-]+)$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): PaymentPlanTemplate => snapshot(own(ctx, ctx.params.templateId)),
  },
  {
    method: 'POST', pattern: /^\/pricing\/plan-templates$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): PaymentPlanTemplate => {
      const input = body(ctx);
      const projectId = input.projectId;
      if (typeof projectId !== 'string' || !authProject(ctx, projectId)) notFound(ctx);
      const key = requestKey(ctx);
      const validated = parsed(ctx, input, ['projectId', 'title', 'allocations', 'idempotencyKey']);
      const fingerprint = JSON.stringify([validated.title, validated.allocations]);
      const replay = checkReplay(ctx, key, 'create', projectId, fingerprint);
      if (replay) return replay;
      const s = ctx.demo.section<TemplateStore>(SECTION, () => empty(ctx.tenantId!));
      if (s.tenantId !== ctx.tenantId || s.version !== 1) collision(ctx);
      const template: PaymentPlanTemplate = {
        id: `pt_${s.nextSequence.toString().padStart(6, '0')}`,
        tenantId: ctx.tenantId!, projectId, creatorPrincipalId: principal(ctx),
        currentVersion: 1,
        versions: [{ version: 1, ...validated, createdAt: ctx.at, createdBy: principal(ctx), state: 'draft' }],
        state: 'draft', approvalAllowed: false, postingAllowed: false,
      };
      // These are the only writes; there is no approval, schedule, quote, invoice or settlement hook.
      s.nextSequence += 1;
      s.templates.push(template);
      s.requests[key] = { operation: 'create', principalId: principal(ctx), target: projectId, fingerprint, response: snapshot(template) };
      ctx.demo.save();
      return snapshot(template);
    },
  },
  {
    method: 'POST', pattern: /^\/pricing\/plan-templates\/(?<templateId>[\w-]+)\/versions$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): PaymentPlanTemplate => {
      const template = own(ctx, ctx.params.templateId);
      const input = body(ctx);
      const key = requestKey(ctx);
      const expected = input.expectedVersion;
      if (!Number.isSafeInteger(expected) || (expected as number) < 1) invalid(ctx, 'expectedVersion');
      const validated = parsed(ctx, input, ['expectedVersion', 'title', 'allocations', 'idempotencyKey']);
      const fingerprint = JSON.stringify([expected, validated.title, validated.allocations]);
      const replay = checkReplay(ctx, key, 'revise', template.id, fingerprint);
      if (replay) return replay;
      if (template.currentVersion !== expected) collision(ctx);
      const next: PaymentPlanTemplateVersion = {
        version: template.currentVersion + 1, ...validated, createdBy: principal(ctx),
        createdAt: ctx.at, state: 'draft',
      };
      // Mutate only after all permissions, schema, version and key checks pass.
      template.versions.push(next);
      template.currentVersion = next.version;
      state(ctx)!.requests[key] = { operation: 'revise', principalId: principal(ctx), target: template.id, fingerprint, response: snapshot(template) };
      ctx.demo.save();
      return snapshot(template);
    },
  },
];
