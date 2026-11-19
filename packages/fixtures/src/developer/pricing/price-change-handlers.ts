import { requireDraftRequestKey } from './request-key';
import { rememberDraft, replayDraft, staleVersion } from './draft-replay';
import type { IdempotencyStore } from '../../idempotency';
import { type UnitPriceChangeDraft, type UnitPriceChangeDraftList, type UnitPriceChangeDraftVersion } from '@repo/contracts';
import { invalid, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { projectVisible } from '../scope';
import { inventoryVisible } from '../inventory/scope';
import { fromPaisa, toPaisa, InvalidCommercialRule } from './commercial-calculator';

const SECTION = 'developer.pricing.price-change-drafts';
const PRICE = { module: 'inventory', permission: 'pricing.manage' } as const;
type Op = 'create' | 'revise';
/** `idempotency`: E.0 bound entries (`replayOf` / `remember`); absent in a section written before Wave 2. */
interface Store { version: 1; tenantId: string; next: number; drafts: UnitPriceChangeDraft[]; idempotency?: IdempotencyStore }
const empty = (tenantId: string): Store => ({ version: 1, tenantId, next: 1, drafts: [], idempotency: {} });
const copy = <T,>(x: T): T => structuredClone(x);
const actor = (ctx: HandlerContext) => ctx.persona?.principalId ?? '';
// pricing.manage through E.0's projectVisible (header project applies), the unit through E.2's inventory scope.
const allowed = (ctx: HandlerContext, projectId: string) =>
  ctx.access?.tenant.type === 'developer' && projectVisible(ctx, projectId, PRICE) && inventoryVisible(ctx, projectId);
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
const key = (ctx: HandlerContext, body: Record<string, unknown>) => requireDraftRequestKey(ctx, body);
const stale = (ctx: HandlerContext): never => staleVersion(ctx, 'pricing:priceChangeConflict');
/** E.0's bound replay; the original draft, its unit and the current scope are revalidated before returning. */
const replay = (ctx: HandlerContext, op: Op, target: string, input: unknown, stillAuthorized: () => boolean) =>
  replayDraft(ctx, recordStore(ctx)?.idempotency, { op: `pricing.price_change.${op}`, target, input, stillAuthorized },
    (id) => recordStore(ctx)?.drafts.find((d) => d.id === id && canRead(ctx, d)));

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
      key(ctx, body);
      const old = replay(ctx, 'create', unit.id, fields, () => allowed(ctx, unit.projectId));
      if (old) return old;
      const previous = ctx.demo.peekSection<Store>(SECTION);
      if (previous && (previous.tenantId !== ctx.tenantId || previous.version !== 1)) stale(ctx);
      const state = ctx.demo.section<Store>(SECTION, () => empty(ctx.tenantId!));
      const draft: UnitPriceChangeDraft = {
        id: `pcd_${String(state.next).padStart(6, '0')}`, tenantId: ctx.tenantId!,
        projectId: unit.projectId, unitId: unit.id, creatorPrincipalId: actor(ctx),
        baselinePrice: copy(unit.price), currentVersion: 1,
        versions: [{ version: 1, ...fields, createdAt: ctx.at, createdBy: actor(ctx), state: 'draft' }],
        state: 'draft', effective: false, approvalAllowed: false, changesListedPrice: false,
      };
      state.next += 1; state.drafts.push(draft);
      rememberDraft(ctx, (state.idempotency ??= {}), { op: 'pricing.price_change.create', target: unit.id, input: fields }, draft);
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
      key(ctx, body);
      const bound = { expectedVersion: body.expectedVersion, ...fields };
      const old = replay(ctx, 'revise', draft.id, bound, () => canRead(ctx, draft));
      if (old) return old;
      if (draft.currentVersion !== body.expectedVersion) stale(ctx);
      const next: UnitPriceChangeDraftVersion = {
        version: draft.currentVersion + 1, ...fields, createdAt: ctx.at,
        createdBy: actor(ctx), state: 'draft',
      };
      draft.versions.push(next); draft.currentVersion = next.version;
      const state = recordStore(ctx)!;
      rememberDraft(ctx, (state.idempotency ??= {}), { op: 'pricing.price_change.revise', target: draft.id, input: bound }, draft);
      ctx.demo.save();
      return copy(draft);
    },
  },
];
