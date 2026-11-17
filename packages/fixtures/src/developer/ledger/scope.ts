import { ApiError, type Permission } from '@repo/contracts';
import type { HandlerContext } from '../../handler-types';
import { keyReused, remember, replayOf } from '../../idempotency';
import { entityWhole } from '../scope';
import type { LedgerState, StoredEntity } from './state';

/**
 * Gate E.7 helpers on E.0's canonical ones (Wave 1 integration, Issue #25):
 * - entity scope: `developer/scope.ts` `entityWhole` (the ledger is entity-wide; a reader whose scope does not
 *   cover the whole entity reaches none of its ledger, so no partial view can total another project's money);
 * - bound idempotency: `packages/fixtures/src/idempotency.ts` (§4.5);
 * - the bank boundary follows S.1's `seesBankFeed` (Issue #18), per legal entity, on `entityWhole` too.
 */

/**
 * The entities a reader may use for a permission: the record check of the access model (module grant,
 * permission, data scope "legal entity"). A person scoped to projects reaches no entity's ledger: the
 * ledger is entity-wide (plan §4.1), so a partial view could total another project's money.
 */
export function entitiesFor(ctx: HandlerContext, st: LedgerState, module: 'accounting' | 'banking', permission: Permission): StoredEntity[] {
  return st.entities.filter((e) => entityWhole(ctx, e.id, { module, permission }));
}

export const mayUse = (ctx: HandlerContext, module: 'accounting' | 'banking', entityId: string, permission: Permission) => entityWhole(ctx, entityId, { module, permission });

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
  entityWhole({ ...ctx, suspension: 'history_read' }, entityId, { module: 'banking', permission: 'bank.view' }) ||
  entityWhole({ ...ctx, suspension: 'history_read' }, entityId, { module: 'banking', permission: 'bank.reconcile' });

/** "•••• 7890": the last four characters only. */
export const maskIban = (iban: string) => `•••• ${iban.replace(/\s/g, '').slice(-4)}`;

// ---------------------------------------------------------------------------------------------
// Bound idempotency (§4.5): E.0's shared helper since the Wave 1 integration (Issue #25)
// ---------------------------------------------------------------------------------------------
// E.7's copy (key reader, fingerprint, `key → entry` map) is gone. A key is bound to the operation, the
// organisation, the principal, the target and the normalised input; any other reuse is the one non-disclosing
// 409 (`keyReused`); a replay re-reads the record through the caller's scoped lookup.

export { keyReused };

/**
 * The target was resolved through E.7's scoped finders before the key is read (`entityOf`, `journalOf`,
 * `importOf`, `periodOf`, `ruleOf`: a hidden target is already 404), so authority over it is current; E.0's
 * `replayOf` asks again and gets the same answer. (E.7's mutation run found "replay skips the scope re-check"
 * equivalent for this reason.)
 */
const RESOLVED_IN_SCOPE = () => true;

/** Call after the authority checks and before the state checks; `remember` only after the change succeeded. */
export function bound(ctx: HandlerContext, st: LedgerState, op: string, target: string, input: unknown): { replay?: string; remember: (id: string) => void } {
  const replay = replayOf(ctx, st.idempotency, { op, target, input, stillAuthorized: RESOLVED_IN_SCOPE });
  return { ...(replay ? { replay } : {}), remember: (id) => remember(ctx, st.idempotency, { op, target, input }, id) };
}
