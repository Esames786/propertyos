import type { HandlerContext } from '../../handler-types';
import { fingerprint } from '../../society/import';
import type { PipelineState } from './state';

/**
 * Gate E.1: request-bound idempotency for conversions (plan §4.5; the accepted pattern of payroll
 * `replayOf`/`remember`, Issues #16, #18 and #21). A key is stored with the operation, the principal,
 * the target lead and a fingerprint of the normalised input, and records the opportunity it created.
 * The same key replays only that exact request by that person, and the caller re-reads the result
 * through its own scoped lookup (so a replay never outlives narrowed or revoked access). Any other
 * use of the key is refused with one non-disclosing `409 idempotency_key_reused`, and nothing changes.
 *
 * Module-local: replace with E.0's shared `packages/fixtures/src/idempotency.ts` at Wave 1 integration.
 */

/** The body's `idempotencyKey` (sent by `useKeyedCreate`), else the request's own key. */
export function keyOf(ctx: HandlerContext): string | undefined {
  const fromBody = (ctx.req.body as { idempotencyKey?: unknown } | undefined)?.idempotencyKey;
  const key = (typeof fromBody === 'string' && fromBody.trim()) || ctx.req.idempotencyKey || '';
  return key.trim().slice(0, 80) || undefined;
}

export const printOf = (input: unknown) => fingerprint(JSON.stringify(input) ?? '');

export type Bound = { replay?: string; remember: (recordId: string) => void } | { reused: true };

/** Call after the authority and id checks, before the record's state is checked. */
export function bound(ctx: HandlerContext, st: PipelineState, op: string, target: string, input: unknown): Bound {
  const key = keyOf(ctx);
  const principal = ctx.persona?.principalId ?? '';
  const fp = printOf(input);
  if (!key) return { remember: () => {} };
  const e = st.idempotency[key];
  if (e) {
    if (e.op === op && e.principal === principal && e.target === target && e.fp === fp) return { replay: e.id, remember: () => {} };
    return { reused: true };
  }
  return { remember: (recordId) => void (st.idempotency[key] = { op, principal, target, fp, id: recordId }) };
}
