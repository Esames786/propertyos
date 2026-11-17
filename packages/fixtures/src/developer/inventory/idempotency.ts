import type { HandlerContext } from '../../handler-types';
import { remember as rememberBound, replayOf as replayBound } from '../../idempotency';
import type { InventoryState } from './state';

/**
 * Gate E.2 bound idempotency (plan §4.5), on E.0's shared helper since the Wave 1 integration (Issue #25):
 * `packages/fixtures/src/idempotency.ts`. The E.2 copy (its own key reader, FNV fingerprint, stored result
 * objects) is gone; this adapter keeps E.2's operation names and call shape.
 *
 * A key is bound to the operation, the organisation, the principal, the target record and a fingerprint of
 * the normalised input, and records the id of what the request created or changed. The same key replays only
 * that exact request, and only while the caller still has authority over the target (else 404); any other
 * reuse is the one non-disclosing `409 idempotency_key_reused`, and nothing changes. Never a plain key → id map.
 */
export type InventoryOp = 'unit.hold' | 'unit.release' | 'storage.allocate' | 'storage.release' | 'project.create' | 'project.save' | 'project.submit' | 'project.activate' | 'project.return';

/** The record id an identical earlier request recorded, or undefined (a new request). */
export function replayOf(ctx: HandlerContext, s: InventoryState, op: InventoryOp, target: string, input: unknown, stillAuthorized: () => boolean): string | undefined {
  return replayBound(ctx, s.idempotency, { op, target, input, stillAuthorized });
}

export function remember(ctx: HandlerContext, s: InventoryState, op: InventoryOp, target: string, input: unknown, recordId: string): void {
  rememberBound(ctx, s.idempotency, { op, target, input }, recordId);
}
