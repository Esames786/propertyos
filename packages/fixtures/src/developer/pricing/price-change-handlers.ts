import { ApiError, type UnitPriceChangeDraft, type UnitPriceChangeDraftList, type UnitPriceChangeDraftVersion, type Money } from '@repo/contracts';
import { invalid, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { projectVisible } from '../scope';
import { fromPaisa, toPaisa, InvalidCommercialRule } from './commercial-calculator';

const SECTION = 'developer.pricing.price-change-drafts';
const PRICE = { module: 'inventory', permission: 'pricing.manage' } as const;
const VIEW = { module: 'inventory', permission: 'unit.view' } as const;
type Op = 'create' | 'revise';
interface Bound { op: Op; actor: string; target: string; fingerprint: string; result: UnitPriceChangeDraft }
interface Store { version: 1; tenantId: string; next: number; drafts: UnitPriceChangeDraft[]; keys: Record<string, Bound> }
const empty = (tenantId: string): Store => ({ version: 1, tenantId, next: 1, drafts: [], keys: Object.create(null) as Record<string, Bound> });
const copy = <T,>(x: T): T => structuredClone(x);
const actor = (ctx: HandlerContext) => ctx.persona?.principalId ?? '';
const allowed = (ctx: HandlerContext, projectId: string) =>
  ctx.access?.tenant.type === 'developer' && projectVisible(ctx, projectId, PRICE) && projectVisible(ctx, projectId, VIEW);
function recordStore(ctx: HandlerContext): Store | undefined {
  const value = ctx.demo.peekSection<Store>(SECTION);
  return value?.version === 1 && value.tenantId === ctx.tenantId ? value : undefined;
}
function unitFor(ctx: HandlerContext, unitId: string | undefined) {
  const unit = ctx.data.units.find((u) => u.id === unitId && allowed(ctx, u.projectId));
  if (!unit) notFound(ctx);
  return unit;
}
const canRead = (ctx: HandlerContext, record: UnitPriceChangeDraft) =>
  record.tenantId === ctx.tenantId && record.creatorPrincipalId === actor(ctx) &&
  allowed(ctx, record.projectId) &&
  ctx.data.units.some((unit) => unit.id === record.unitId && unit.projectId === record.projectId);
function own(ctx: HandlerContext, id: string | undefined): UnitPriceChangeDraft {
  const item = recordStore(ctx)?.drafts.find((row) => row.id === id);
  if (!item || !canRead(ctx, item)) notFound(ctx);
  return item;
}
function requestBody(ctx: HandlerContext): Record<string, unknown> {
  const r = ctx.req.body;
  if (!r || typeof r !== 'object' || Array.isArray(r)) invalid(ctx, 'priceChange');
  return r as Record<string, unknown>;
}
function proposed(ctx: HandlerContext, body: Record<string, unknown>, allowedKeys: string[]) {
  if (Object.keys(body).some((key) => !allowedKeys.includes(key))) invalid(ctx, 'priceChange');
  let cents: bigint;
  try { cents = toPaisa(body.proposedPrice); }
  catch (err) {
    if (err instanceof InvalidCommercialRule) invalid(ctx, 'proposedPrice');
    throw err;
  }
  if (typeof body.reason !== 'string') invalid(ctx, 'reason');
  const reason = body.reason.trim().replace(/\s+/g, ' ');
  if (reason.length < 10 || reason.length > 500) invalid(ctx, 'reason');
  return { proposedPrice: fromPaisa(cents), reason };
}
function key(ctx: HandlerContext, body: Record<string, unknown>) {
  const id = ctx.req.idempotencyKey ?? body.idempotencyKey;
  if (typeof id !== 'string' || !/^[A-Za-z0-9._:-]{12,100}$/.test(id)) invalid(ctx, 'idempotencyKey');
  return id;
}
function conflict(ctx: HandlerContext): never {
  throw new ApiError({ status: 409, code: 'idempotency_key_reused',
    messageKey: 'pricing:priceChangeConflict', correlationId: ctx.correlationId, changed: false });
}
function replay(ctx: HandlerContext, id: string, op: Op, target: string, fingerprint: string) {
  const old = recordStore(ctx)?.keys[id];
  if (!old) return undefined;
  if (old.op !== op || old.actor !== actor(ctx) || old.target !== target || old.fingerprint !== fingerprint) conflict(ctx);
  own(ctx, old.result.id); // Revalidate original draft/unit and current scope before returning.
  return copy(old.result);
}

export const UNIT_PRICE_CHANGE_HANDLERS: readonly Handler[] = [
  {
    method: 'GET', pattern: /^\/units\/(?<unitId>[\w-]+)\/price-change-drafts$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): UnitPriceChangeDraftList => {
      const unit = unitFor(ctx, ctx.params.unitId);
      const rows = (recordStore(ctx)?.drafts ?? [])
        .filter((d) => d.unitId === unit.id && canRead(ctx, d));
      return {
        items: rows.map((d) => ({
          id: d.id, unitId: d.unitId, currentVersion: d.currentVersion,
          proposedPrice: copy(d.versions.at(-1)!.proposedPrice), state: 'draft',
        })), total: rows.length,
      };
    },
  },
  {
    method: 'GET', pattern: /^\/price-change-drafts\/(?<draftId>[\w-]+)$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): UnitPriceChangeDraft => copy(own(ctx, ctx.params.draftId)),
  },
  {
    method: 'POST', pattern: /^\/units\/(?<unitId>[\w-]+)\/price-change-drafts$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): UnitPriceChangeDraft => {
      const unit = unitFor(ctx, ctx.params.unitId);
      const body = requestBody(ctx);
      const fields = proposed(ctx, body, ['proposedPrice', 'reason', 'idempotencyKey']);
      if (toPaisa(fields.proposedPrice) === toPaisa(unit.price)) invalid(ctx, 'proposedPrice');
      const reqKey = key(ctx, body), fingerprint = JSON.stringify(fields);
      const old = replay(ctx, reqKey, 'create', unit.id, fingerprint);
      if (old) return old;
      const previous = ctx.demo.peekSection<Store>(SECTION);
      if (previous && (previous.tenantId !== ctx.tenantId || previous.version !== 1)) conflict(ctx);
      const state = ctx.demo.section<Store>(SECTION, () => empty(ctx.tenantId!));
      const draft: UnitPriceChangeDraft = {
        id: `pcd_${String(state.next).padStart(6, '0')}`, tenantId: ctx.tenantId!,
        projectId: unit.projectId, unitId: unit.id, creatorPrincipalId: actor(ctx),
        baselinePrice: copy(unit.price), currentVersion: 1,
        versions: [{ version: 1, ...fields, createdAt: ctx.at, createdBy: actor(ctx), state: 'draft' }],
        state: 'draft', effective: false, approvalAllowed: false, changesListedPrice: false,
      };
      state.next += 1; state.drafts.push(draft);
      state.keys[reqKey] = { op: 'create', actor: actor(ctx), target: unit.id, fingerprint, result: copy(draft) };
      ctx.demo.save();
      return copy(draft);
    },
  },
  {
    method: 'POST', pattern: /^\/price-change-drafts\/(?<draftId>[\w-]+)\/versions$/,
    access: requires('inventory', 'pricing.manage', 'operational'),
    handle: (ctx): UnitPriceChangeDraft => {
      const draft = own(ctx, ctx.params.draftId);
      const body = requestBody(ctx);
      if (!Number.isSafeInteger(body.expectedVersion) || (body.expectedVersion as number) < 1) invalid(ctx, 'expectedVersion');
      const fields = proposed(ctx, body, ['expectedVersion', 'proposedPrice', 'reason', 'idempotencyKey']);
      if (toPaisa(fields.proposedPrice) === toPaisa(draft.baselinePrice)) invalid(ctx, 'proposedPrice');
      const reqKey = key(ctx, body);
      const fingerprint = JSON.stringify([body.expectedVersion, fields]);
      const old = replay(ctx, reqKey, 'revise', draft.id, fingerprint);
      if (old) return old;
      if (draft.currentVersion !== body.expectedVersion) conflict(ctx);
      const next: UnitPriceChangeDraftVersion = {
        version: draft.currentVersion + 1, ...fields, createdAt: ctx.at,
        createdBy: actor(ctx), state: 'draft',
      };
      draft.versions.push(next); draft.currentVersion = next.version;
      recordStore(ctx)!.keys[reqKey] = { op: 'revise', actor: actor(ctx), target: draft.id, fingerprint, result: copy(draft) };
      ctx.demo.save();
      return copy(draft);
    },
  },
];
