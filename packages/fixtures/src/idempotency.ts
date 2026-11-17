import { ApiError } from '@repo/contracts';
import { notFound, type HandlerContext } from './handler-types';
import { fingerprint } from './society/import';

/**
 * Gate E.0: the shared, request-bound idempotency helper (plan §4.5). It generalises the accepted pair
 * `replayOf` / `remember` of payroll (`payroll/handlers.ts`, Issue #16 P0-2) and S.1
 * (`society/finance/common.ts`, Issues #18 and #21) so Gate E never introduces a `key → id` map again.
 *
 * A create remembers its key with what the request was: the operation, the organisation, the
 * principal, the target record and a fingerprint of the normalised input, plus the id it created.
 * The same key then replays only the identical request (same operation, organisation, person, target
 * and input), and only while the caller still has authority over that target. Any other use of the
 * key gets one non-disclosing answer (409 `idempotency_key_reused`, nothing changes), whatever the key
 * was used for before. An entry that is not a bound entry (a legacy id alone) replays nothing.
 *
 * Usage, in the §4.2 order of checks (permission, authority over the target, state, ids, maker ≠
 * checker, validation, then the replay check just before mutating):
 *
 *   const again = replayOf(ctx, state.idempotency, { op: 'journal.create', target: entityId, input, stillAuthorized: () => entityVisible(ctx, entityId, NEED) });
 *   if (again) return view(findJournal(ctx, again));   // look the result up again through your scoped finder
 *   const id = create(...);
 *   remember(ctx, state.idempotency, { op: 'journal.create', target: entityId, input }, id);
 *
 * Not migrated here: S.1's own helper (owner decision E-29). It is already bound since Issue #18;
 * moving it onto this module needs the owner's approval.
 */

export interface BoundEntry {
  op: string;
  tenant: string;
  principal: string;
  target: string;
  fingerprint: string;
  recordId: string;
}

/** Where a module keeps its keys (inside its own demo-store section). Old unbound entries may remain. */
export type IdempotencyStore = Record<string, unknown>;

export interface BoundRequest {
  /** The operation, namespaced by module ("journal.create", "storage.allocate"). */
  op: string;
  /** The record the request acts on or creates under (an entity, project, lead, unit …). */
  target: string;
  /** The request's normalised input (validated values, not the raw body). */
  input: unknown;
}

/** Longest key kept (a longer one is cut, as S.1 does). */
export const MAX_IDEMPOTENCY_KEY = 80;

/** The request's key: the transport's idempotency key, else the body's `idempotencyKey` (the S.1 contract). */
export function requestKey(ctx: Pick<HandlerContext, 'req'>): string | undefined {
  const fromBody = (ctx.req.body as { idempotencyKey?: unknown } | null | undefined)?.idempotencyKey;
  const raw = typeof ctx.req.idempotencyKey === 'string' && ctx.req.idempotencyKey.trim() ? ctx.req.idempotencyKey : typeof fromBody === 'string' ? fromBody : '';
  const key = raw.trim().slice(0, MAX_IDEMPOTENCY_KEY);
  return key || undefined;
}

/** A stable text for any input: object keys sorted, bigint as text, undefined dropped. */
export function canonical(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (typeof v === 'bigint') return v.toString();
    if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : norm(x)));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(value)) ?? 'undefined';
}

/** The fingerprint of a normalised input (the society import's 64-bit FNV pair over `canonical`). */
export const inputFingerprint = (input: unknown): string => fingerprint(canonical(input));

const principalOf = (ctx: Pick<HandlerContext, 'persona'>) => ctx.persona?.principalId ?? '';

const isBound = (e: unknown): e is BoundEntry =>
  !!e && typeof e === 'object' && ['op', 'tenant', 'principal', 'target', 'fingerprint', 'recordId'].every((k) => typeof (e as Record<string, unknown>)[k] === 'string');

/** The one refusal for any reuse of a key: it names nothing about the earlier request. */
export function keyReused(ctx: Pick<HandlerContext, 'correlationId'>): never {
  throw new ApiError({ status: 409, code: 'idempotency_key_reused', messageKey: 'errors:api.idempotencyKeyReused', correlationId: ctx.correlationId, changed: false });
}

/**
 * The id an identical earlier request created, or undefined (a new create: no key, an unused key, or no
 * signed-in principal). Any other reuse of the key is refused (409). An identical request by someone
 * who has since lost authority over the target is answered like a target never issued (404).
 */
export function replayOf(ctx: HandlerContext, store: IdempotencyStore, req: BoundRequest & { stillAuthorized: () => boolean }): string | undefined {
  const key = requestKey(ctx);
  const principal = principalOf(ctx);
  if (!key || !principal) return undefined;
  const e = store[key];
  if (e === undefined) return undefined;
  if (!isBound(e) || e.op !== req.op || e.tenant !== (ctx.tenantId ?? '') || e.principal !== principal || e.target !== req.target || e.fingerprint !== inputFingerprint(req.input)) keyReused(ctx);
  if (!req.stillAuthorized()) notFound(ctx);
  return e.recordId;
}

/** Records a create's key, bound to the request (nothing without a key or a principal). Call after the create. */
export function remember(ctx: HandlerContext, store: IdempotencyStore, req: BoundRequest, recordId: string): void {
  const key = requestKey(ctx);
  const principal = principalOf(ctx);
  if (!key || !principal) return;
  store[key] = { op: req.op, tenant: ctx.tenantId ?? '', principal, target: req.target, fingerprint: inputFingerprint(req.input), recordId } satisfies BoundEntry;
}
