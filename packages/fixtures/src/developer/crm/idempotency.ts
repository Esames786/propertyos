import type { HandlerContext } from '../../handler-types';
import { remember, replayOf } from '../../idempotency';
import type { PipelineState } from './state';

/**
 * Gate E.1 request-bound idempotency for conversions (plan §4.5), on E.0's shared helper since the Wave 1
 * integration (Issue #25): `packages/fixtures/src/idempotency.ts` `replayOf` / `remember`. The E.1 copy (its
 * own key reader, fingerprint and `key → entry` map) is gone; this adapter only keeps E.1's call shape.
 *
 * A key is bound to the operation, the organisation, the principal, the target lead and a fingerprint of the
 * normalised input, and records the opportunity it created. The same key replays only that exact request by
 * that person while they still have authority over the target (else 404, like an id never issued); any other
 * use of the key is the one non-disclosing `409 idempotency_key_reused` (thrown by `replayOf`), and nothing
 * changes. The caller re-reads a replayed result through its own scoped lookup.
 */
export interface Bound {
  replay?: string;
  remember: (recordId: string) => void;
}

/** Call after the authority and id checks, before the record's state is checked. */
export function bound(ctx: HandlerContext, st: PipelineState, op: string, target: string, input: unknown, stillAuthorized: () => boolean): Bound {
  const replay = replayOf(ctx, st.idempotency, { op, target, input, stillAuthorized });
  return { ...(replay ? { replay } : {}), remember: (recordId) => remember(ctx, st.idempotency, { op, target, input }, recordId) };
}
