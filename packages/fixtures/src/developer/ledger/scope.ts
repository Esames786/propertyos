import { ApiError, type Permission } from '@repo/contracts';
import { decideRecord, type HandlerContext } from '../../handler-types';
import { fingerprint } from '../../society/import';
import type { LedgerState, StoredEntity } from './state';

/**
 * Gate E.7 module-local helpers. **Replace with the E.0 helpers at integration**:
 * - entity scope → `developer/scope.ts` (`entityVisible` / `entityWhole`);
 * - bound idempotency → `packages/fixtures/src/idempotency.ts` (§4.5);
 * - the bank boundary follows S.1's `seesBankFeed` (Issue #18), per legal entity.
 */

/**
 * The entities a reader may use for a permission: the record check of the access model (module grant,
 * permission, data scope "legal entity"). A person scoped to projects reaches no entity's ledger: the
 * ledger is entity-wide (plan §4.1), so a partial view could total another project's money.
 */
export function entitiesFor(ctx: HandlerContext, st: LedgerState, module: 'accounting' | 'banking', permission: Permission): StoredEntity[] {
  return st.entities.filter((e) => decideRecord(ctx, module, { legalEntityId: e.id }, permission).allowed);
}

export const mayUse = (ctx: HandlerContext, module: 'accounting' | 'banking', entityId: string, permission: Permission) => decideRecord(ctx, module, { legalEntityId: entityId }, permission).allowed;

/** Not found, exactly as for an id never issued (no oracle). */
export function hidden(ctx: HandlerContext): never {
  throw new ApiError({ status: 404, code: 'not_found', messageKey: 'errors:api.notFound', correlationId: ctx.correlationId, changed: false });
}

/**
 * The entity a request is about: the one named (if the reader may use it) or the reader's first one.
 * An unknown entity and one outside the reader's scope answer alike; so does a reader with none.
 */
export function entityOf(ctx: HandlerContext, st: LedgerState, requested: unknown, module: 'accounting' | 'banking', permission: Permission): { entity: StoredEntity; entities: StoredEntity[] } {
  const entities = entitiesFor(ctx, st, module, permission);
  const id = typeof requested === 'string' && requested ? requested : undefined;
  const entity = id ? entities.find((e) => e.id === id) : entities[0];
  if (!entity) hidden(ctx);
  return { entity, entities };
}

/**
 * Issue #18 (FIN-01) for developers: statement lines, imports, bank account identifiers and anything
 * derived from them reach only holders of `bank.view` or `bank.reconcile`, for that entity.
 */
export const seesBank = (ctx: HandlerContext, entityId: string): boolean =>
  decideRecord({ ...ctx, suspension: 'history_read' }, 'banking', { legalEntityId: entityId }, 'bank.view').allowed ||
  decideRecord({ ...ctx, suspension: 'history_read' }, 'banking', { legalEntityId: entityId }, 'bank.reconcile').allowed;

/** "•••• 7890": the last four characters only. */
export const maskIban = (iban: string) => `•••• ${iban.replace(/\s/g, '').slice(-4)}`;

// ---------------------------------------------------------------------------------------------
// Bound idempotency (§4.5): operation, principal, target and the normalised input
// ---------------------------------------------------------------------------------------------

const body = (ctx: HandlerContext) => (ctx.req.body ?? {}) as Record<string, unknown>;

/** The request's key: the body's `idempotencyKey` (as useKeyedCreate sends it), else the request's own. */
export function idemKey(ctx: HandlerContext): string | undefined {
  const b = body(ctx).idempotencyKey;
  const k = (typeof b === 'string' && b.trim() ? b.trim() : ctx.req.idempotencyKey ?? '').slice(0, 80);
  return k || undefined;
}

const print = (input: unknown) => fingerprint(JSON.stringify(input, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)) ?? '');

export function keyReused(ctx: HandlerContext): never {
  throw new ApiError({ status: 409, code: 'idempotency_key_reused', messageKey: 'ledger:problems.keyReused', correlationId: ctx.correlationId, changed: false });
}

/**
 * Call after the authority checks and before the state checks. With a key already used, only the same
 * operation by the same person on the same target with the same normalised input replays (the caller
 * re-reads the record through its scoped lookup); anything else is a non-disclosing 409 and changes
 * nothing. `remember` is called only after the change succeeded (a refusal binds no key).
 */
export function bound(ctx: HandlerContext, st: LedgerState, op: string, target: string, input: unknown): { replay?: string; remember: (id: string) => void } {
  const key = idemKey(ctx);
  const fp = print(input);
  const principal = ctx.persona?.principalId ?? '';
  if (key) {
    const e = st.idempotency[key];
    if (e) {
      if (e.op === op && e.principal === principal && e.target === target && e.fp === fp) return { replay: e.id, remember: () => {} };
      keyReused(ctx);
    }
  }
  return { remember: (id) => void (key ? (st.idempotency[key] = { op, principal, target, fp, id }) : undefined) };
}
