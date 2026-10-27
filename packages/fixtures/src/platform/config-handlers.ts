import {
  CONFIG_KINDS,
  EDITIONS,
  type ConfigKind,
  type ConfigOverview,
  type ConfigPayload,
  type ConfigVersion,
  type SignupPolicy,
  type TenantDraft,
  type WorkspaceRequest,
  type WorkspaceRequestDecision,
  type WorkspaceRequestDetail,
} from '@repo/contracts';
import { configProblems, payloadDiff, policyOf, signupOf, TODAY } from './config';
import { body, clone, DATE, fail, has, invalid, notFound, now, principalOf, refuse, type PlatformContext, type PlatformHandler } from './kit';

/**
 * Versioned commercial configuration and workspace requests (Gate B remaining scope).
 * Supreme Admin (platform.config.manage) drafts, edits, submits and withdraws versions; a version
 * takes effect only when someone holding an approver role of the policy in force, who is not its
 * author (principal ids compared), approves it. Approved versions apply from their effective date.
 * Every step is audited with what changed.
 */

const VIEW: Record<ConfigKind, PlatformHandler['permission']> = {
  rate_card: ['platform.pricing.view', 'platform.config.manage'],
  commercial_policy: ['platform.pricing.view', 'platform.contracts.approve', 'platform.config.manage'],
  catalogue: ['platform.catalog.view', 'platform.config.manage'],
  signup_policy: ['platform.requests.manage', 'platform.tenants.view', 'platform.config.manage'],
};

const kindOf = (ctx: PlatformContext): ConfigKind => {
  const kind = ctx.params.kind as ConfigKind;
  if (!CONFIG_KINDS.includes(kind)) notFound(ctx);
  return kind;
};

const viewAllowed = (ctx: PlatformContext, kind: ConfigKind) => {
  const need = VIEW[kind];
  const list = (Array.isArray(need) ? need : [need]) as readonly string[];
  if (!list.some((p) => ctx.persona?.permissions.includes(p as never))) fail(ctx, 403, 'permission_missing', 'errors:access.permission_missing');
};

/** Approver roles of the commercial policy in force today (the policy itself says who may approve). */
const approverRoles = (ctx: PlatformContext) => policyOf(ctx.store.configAt('commercial_policy', TODAY)).approverRoles;

const canApprove = (ctx: PlatformContext) => has(ctx, 'platform.contracts.approve') && approverRoles(ctx).includes(ctx.persona?.id ?? '');

/** Holds an approver role of the commercial policy in force (used by every approval). */
export const isApprover = canApprove;

const labelFor = (kind: ConfigKind, version: number, effectiveFrom: string) => {
  const prefix = { rate_card: 'rc', commercial_policy: 'cp', catalogue: 'cat', signup_policy: 'su' }[kind];
  return `${prefix}-${effectiveFrom.slice(0, 7).replace('-', '.')}-${version}`;
};

function overview(ctx: PlatformContext, kind: ConfigKind): ConfigOverview {
  return {
    kind,
    current: ctx.store.configAt(kind, TODAY),
    versions: ctx.store.configVersions(kind),
    canManage: has(ctx, 'platform.config.manage'),
    canApprove: canApprove(ctx),
  };
}

function version(ctx: PlatformContext): ConfigVersion {
  return ctx.store.configVersion(ctx.params.id!) ?? notFound(ctx);
}

function audit(ctx: PlatformContext, v: ConfigVersion, action: string, params: Record<string, string> = {}, withChanges = false) {
  ctx.store.addAudit({
    at: now(),
    actorName: ctx.persona!.displayName,
    actorId: principalOf(ctx),
    action,
    params: { kind: v.kind, label: v.label, ...params },
    ...(withChanges && v.changes.length ? { changes: v.changes } : {}),
  });
}

/** Payload fields a draft may carry, by kind (nothing else is written). */
function readPayload(ctx: PlatformContext, kind: ConfigKind, sent: unknown, base: ConfigPayload): ConfigPayload {
  if (sent === undefined) return base;
  if (typeof sent !== 'object' || sent === null || (sent as { kind?: unknown }).kind !== kind) invalid(ctx, { payload: 'platform:config.validation.kind' });
  const p = sent as ConfigPayload;
  refuse(ctx, configProblems(p, base));
  return clone(p);
}

function createDraft(ctx: PlatformContext): ConfigVersion {
  const kind = kindOf(ctx);
  const { payload, effectiveFrom, reason } = body<{ payload?: unknown; effectiveFrom?: unknown; reason?: unknown }>(ctx);
  const base = ctx.store.configAt(kind, TODAY);
  const next = readPayload(ctx, kind, payload, base.payload);
  const from = typeof effectiveFrom === 'string' ? effectiveFrom : TODAY;
  if (!DATE.test(from) || from < TODAY) invalid(ctx, { effectiveFrom: 'platform:config.validation.effectiveFrom' });
  const n = Math.max(...ctx.store.configVersions(kind).map((v) => v.version)) + 1;
  const draft: ConfigVersion = {
    id: ctx.store.nextId(`cfg_${kind}`),
    kind,
    version: n,
    label: labelFor(kind, n, from),
    state: 'draft',
    status: 'draft',
    effectiveFrom: from,
    payload: next,
    reason: typeof reason === 'string' ? reason.trim().slice(0, 500) : '',
    basedOn: base.id,
    changes: payloadDiff(base.payload, next),
    createdBy: ctx.persona!.displayName,
    createdById: principalOf(ctx),
    createdAt: now(),
  };
  ctx.store.saveConfigVersion(draft);
  audit(ctx, draft, 'configDrafted');
  return ctx.store.configVersion(draft.id)!;
}

function updateDraft(ctx: PlatformContext): ConfigVersion {
  const v = version(ctx);
  if (v.state !== 'draft' && v.state !== 'returned') fail(ctx, 409, 'invalid_transition', 'platform:config.errors.notEditable');
  const { payload, effectiveFrom, reason } = body<{ payload?: unknown; effectiveFrom?: unknown; reason?: unknown }>(ctx);
  const base = ctx.store.configVersion(v.basedOn ?? '') ?? ctx.store.configAt(v.kind, TODAY);
  const next = readPayload(ctx, v.kind, payload, v.payload);
  // Rate-card and catalogue drafts are compared with their base (lines and modules cannot disappear).
  refuse(ctx, configProblems(next, base.payload));
  const from = typeof effectiveFrom === 'string' ? effectiveFrom : v.effectiveFrom;
  if (!DATE.test(from) || from < TODAY) invalid(ctx, { effectiveFrom: 'platform:config.validation.effectiveFrom' });
  const updated: ConfigVersion = {
    ...v,
    state: 'draft',
    effectiveFrom: from,
    label: labelFor(v.kind, v.version, from),
    payload: next,
    reason: typeof reason === 'string' ? reason.trim().slice(0, 500) : v.reason,
    changes: payloadDiff(base.payload, next),
  };
  ctx.store.saveConfigVersion(updated);
  return ctx.store.configVersion(v.id)!;
}

function submit(ctx: PlatformContext): ConfigVersion {
  const v = version(ctx);
  if (v.state !== 'draft' && v.state !== 'returned') fail(ctx, 409, 'invalid_transition', 'platform:config.errors.notEditable');
  const base = ctx.store.configVersion(v.basedOn ?? '') ?? ctx.store.configAt(v.kind, TODAY);
  // Checked again in full before anyone is asked to approve it.
  refuse(ctx, {
    ...configProblems(v.payload, base.payload),
    ...(v.reason.trim() ? {} : { reason: { code: 'platform:config.validation.reasonRequired' } }),
    ...(v.changes.length ? {} : { payload: { code: 'platform:config.validation.noChanges' } }),
    ...(v.effectiveFrom >= TODAY ? {} : { effectiveFrom: { code: 'platform:config.validation.effectiveFrom' } }),
  });
  const submitted: ConfigVersion = { ...v, state: 'pending_approval', submittedAt: now() };
  ctx.store.saveConfigVersion(submitted);
  audit(ctx, submitted, 'configSubmitted', { date: v.effectiveFrom }, true);
  return ctx.store.configVersion(v.id)!;
}

function decide(ctx: PlatformContext): ConfigVersion {
  const v = version(ctx);
  const { decision, comment } = body<{ decision?: unknown; comment?: unknown }>(ctx);
  if (decision !== 'approve' && decision !== 'return') invalid(ctx, { decision: 'platform:validation.decision' });
  if (v.state !== 'pending_approval') fail(ctx, 409, 'invalid_transition', 'platform:errors.approvalDecided');
  if (!canApprove(ctx)) fail(ctx, 403, 'approver_role_required', 'platform:config.errors.approverRole');
  // Maker ≠ checker, by principal.
  if (principalOf(ctx) === v.createdById) fail(ctx, 403, 'maker_checker_required', 'platform:errors.makerChecker');
  const note = typeof comment === 'string' ? comment.trim() : '';
  if (decision === 'return' && !note) invalid(ctx, { comment: 'forms:errors.required' });
  if (note.length > 1000) invalid(ctx, { comment: 'platform:validation.commentLength' });
  const decided: ConfigVersion = {
    ...v,
    state: decision === 'approve' ? 'approved' : 'returned',
    decidedBy: ctx.persona!.displayName,
    decidedById: principalOf(ctx),
    decidedAt: now(),
    ...(note ? { comment: note } : {}),
  };
  ctx.store.saveConfigVersion(decided);
  audit(ctx, decided, decision === 'approve' ? 'configApproved' : 'configReturned', { date: v.effectiveFrom, ...(note ? { comment: note } : {}) }, decision === 'approve');
  return ctx.store.configVersion(v.id)!;
}

function withdraw(ctx: PlatformContext): ConfigVersion {
  const v = version(ctx);
  // A draft, a version awaiting approval, or an approved version that has not started yet.
  const scheduled = v.state === 'approved' && v.effectiveFrom > TODAY;
  if (!['draft', 'pending_approval', 'returned'].includes(v.state) && !scheduled) fail(ctx, 409, 'invalid_transition', 'platform:config.errors.notWithdrawable');
  const withdrawn: ConfigVersion = { ...v, state: 'withdrawn' };
  ctx.store.saveConfigVersion(withdrawn);
  audit(ctx, withdrawn, 'configWithdrawn', { date: v.effectiveFrom });
  return ctx.store.configVersion(v.id)!;
}

// ---------------------------------------------------------------- workspace requests

/** What the signup policy in force says should happen with a request like this one. */
export function policyOutcome(ctx: PlatformContext, r: WorkspaceRequest): SignupPolicy {
  const signup = signupOf(ctx.store.configAt('signup_policy', TODAY));
  const outcome = signup.byEdition[r.edition];
  return outcome === 'self_service_trial' && (r.expectedUnits ?? 0) > signup.maxSelfServiceUnits ? 'approval_required' : outcome;
}

const detailOf = (ctx: PlatformContext, r: WorkspaceRequest): WorkspaceRequest & WorkspaceRequestDetail => ({ ...r, ...ctx.store.requestState(r.id), policyOutcome: policyOutcome(ctx, r) });

const NEXT: Record<WorkspaceRequest['status'], ReadonlyArray<WorkspaceRequestDecision['decision']>> = {
  new: ['contacted', 'approved', 'declined'],
  contacted: ['approved', 'declined'],
  approved: ['converted'],
  declined: [],
  converted: [],
};

function decideRequest(ctx: PlatformContext) {
  const r = ctx.store.requests().find((x) => x.id === ctx.params.id) ?? notFound(ctx);
  const { decision, note } = body<{ decision?: unknown; note?: unknown }>(ctx);
  if (typeof decision !== 'string' || !NEXT[r.status].includes(decision as never)) fail(ctx, 409, 'invalid_transition', 'platform:requests.errors.transition');
  const text = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  if (decision === 'declined' && !text) invalid(ctx, { note: 'forms:errors.required' });
  const state = ctx.store.requestState(r.id);
  let draftId = state.draftId;
  if (decision === 'approved') {
    // Approving opens a tenant draft prefilled from the request; setup continues in the wizard.
    const draft: TenantDraft = {
      id: ctx.store.nextId('drf'),
      edition: EDITIONS.includes(r.edition) ? r.edition : null,
      organisation: {
        displayName: r.organisation,
        legalName: r.organisation,
        city: r.city,
        timezone: 'Asia/Karachi',
        currency: 'PKR',
        language: 'en-PK',
        contactName: r.contactName,
        contactEmail: `${r.contactName.split(' ')[0]!.toLowerCase()}@example.com`,
        contactPhone: '+923990000000',
      },
      sites: [{ id: `site_${r.id.slice(4)}`, name: r.organisation.replace(/\s*\(Demo\)$/, ''), city: r.city, kind: 'residential', buildings: 1, declaredUnits: r.expectedUnits ?? 1 }],
      modules: [],
      contract: null,
      quantities: {},
      step: 'organisation',
      updatedAt: now(),
    };
    ctx.store.saveDraft(draft);
    draftId = draft.id;
  }
  const status = decision as WorkspaceRequest['status'];
  ctx.store.saveRequest(r.id, status, {
    history: [...state.history, { at: now(), actorName: ctx.persona!.displayName, actorId: principalOf(ctx), status, ...(text ? { note: text } : {}) }],
    ...(draftId ? { draftId } : {}),
  });
  ctx.store.addAudit({ at: now(), actorName: ctx.persona!.displayName, actorId: principalOf(ctx), action: 'requestDecided', params: { organisation: r.organisation, decision: status, ...(text ? { comment: text } : {}) } });
  return detailOf(ctx, ctx.store.requests().find((x) => x.id === r.id)!);
}

export const CONFIG_HANDLERS: PlatformHandler[] = [
  {
    method: 'GET',
    pattern: /^\/platform\/config\/(?<kind>[a-z_]+)$/,
    handle: (ctx) => {
      const kind = kindOf(ctx);
      viewAllowed(ctx, kind);
      return overview(ctx, kind);
    },
  },
  { method: 'POST', pattern: /^\/platform\/config\/(?<kind>[a-z_]+)\/versions$/, permission: 'platform.config.manage', handle: createDraft },
  { method: 'PATCH', pattern: /^\/platform\/config\/versions\/(?<id>[\w-]+)$/, permission: 'platform.config.manage', handle: updateDraft },
  { method: 'POST', pattern: /^\/platform\/config\/versions\/(?<id>[\w-]+)\/submit$/, permission: 'platform.config.manage', handle: submit },
  { method: 'POST', pattern: /^\/platform\/config\/versions\/(?<id>[\w-]+)\/decide$/, permission: 'platform.contracts.approve', handle: decide },
  { method: 'POST', pattern: /^\/platform\/config\/versions\/(?<id>[\w-]+)\/withdraw$/, permission: 'platform.config.manage', handle: withdraw },
  {
    method: 'GET',
    pattern: /^\/platform\/requests$/,
    permission: ['platform.tenants.view', 'platform.requests.manage'],
    handle: (ctx) => ctx.store.requests().map((r) => detailOf(ctx, r)),
  },
  { method: 'POST', pattern: /^\/platform\/requests\/(?<id>[\w-]+)\/decision$/, permission: 'platform.requests.manage', handle: decideRequest },
];
