import type { HandlerContext } from '../../handler-types';
import { problem } from './scope';
import type { InventoryState } from './state';

/**
 * Gate E.2 module-local bound idempotency (plan §4.5, the Issue #16/#18/#21 pattern; provisional:
 * replace with E.0's `packages/fixtures/src/idempotency.ts` at Wave 1 integration).
 *
 * A key is bound to the operation, the principal, the target record and a fingerprint of the normalised
 * input, and records the result. The same key replays only that exact request, and only after the
 * handler has checked the caller's current authority over the target again (callers look the target up
 * through their scoped finder first). Any other reuse is refused with one non-disclosing
 * `409 idempotency_key_reused`, and nothing changes. Never a plain key → id map.
 */
export type InventoryOp = 'unit.hold' | 'unit.release' | 'storage.allocate' | 'storage.release' | 'project.create' | 'project.save' | 'project.submit' | 'project.activate' | 'project.return';

/** The body's `idempotencyKey` (the create contract) or else the request's own key. */
export function idemKey(ctx: HandlerContext): string | undefined {
  const fromBody = (ctx.req.body as { idempotencyKey?: unknown } | undefined)?.idempotencyKey;
  const key = (typeof fromBody === 'string' && fromBody.trim()) || ctx.req.idempotencyKey?.trim();
  return key ? key.slice(0, 120) : undefined;
}

/** FNV-1a over the canonical JSON of the input (keys sorted), so equal inputs print equally. */
export function fingerprint(input: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => k !== 'idempotencyKey').sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
  const text = JSON.stringify(canonical(input ?? null));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * The result an identical earlier request produced, or undefined (a new request). Any other use of the
 * key (another operation, person, target or input) is refused and changes nothing.
 */
export function replayOf<T>(ctx: HandlerContext, s: InventoryState, op: InventoryOp, target: string, input: unknown): T | undefined {
  const key = idemKey(ctx);
  if (!key) return undefined;
  const entry = s.idempotency[key];
  if (!entry) return undefined;
  if (entry.op !== op || entry.principal !== (ctx.persona?.principalId ?? '') || entry.target !== target || entry.fingerprint !== fingerprint(input)) {
    problem(ctx, 409, 'idempotency_key_reused', 'projects:problems.keyReused');
  }
  return entry.result as T;
}

export function remember(ctx: HandlerContext, s: InventoryState, op: InventoryOp, target: string, input: unknown, result: unknown): void {
  const key = idemKey(ctx);
  if (key) s.idempotency[key] = { op, principal: ctx.persona?.principalId ?? '', target, fingerprint: fingerprint(input), result };
}
