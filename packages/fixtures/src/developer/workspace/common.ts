import { ApiError } from '@repo/contracts';
import type { HandlerContext } from '../../handler-types';
import { notFound } from '../../handler-types';
import { fingerprint } from '../../society/import';

/**
 * Gate E.13 module-local helpers (provisional; replace with the E.0 shared helpers at integration:
 * `packages/fixtures/src/idempotency.ts`, `projection.ts`, `developer/scope.ts`). They follow the
 * accepted patterns: S.1/S.2b `replayOf`/`remember` (Issue #16 P0-2, #18, #21) and the uniform
 * "not found" of S.2a/S.2b (an unknown id and a hidden one answer the same).
 */

export const bodyOf = <T>(ctx: HandlerContext) => (ctx.req.body ?? {}) as Partial<T>;
export const queryOf = (ctx: HandlerContext) => (ctx.req.query ?? {}) as Record<string, string | number | boolean | undefined>;
export const str = (v: unknown, max = 500) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').trim().slice(0, max);

/** A refusal in the shared problem shape; nothing has changed when it is thrown. */
export function problem(ctx: HandlerContext, status: number, code: string, messageKey: string, errors?: Record<string, Array<{ code: string; params?: Record<string, string> }>>): never {
  throw new ApiError({ status, code, messageKey, ...(errors ? { errors } : {}), correlationId: ctx.correlationId, changed: false });
}

/** Field validation (422) naming only the caller's own input, never another record. */
export const invalidField = (ctx: HandlerContext, field: string, code: string, params?: Record<string, string>): never =>
  problem(ctx, 422, 'validation_failed', 'errors:validation.summary', { [field]: [{ code, ...(params ? { params } : {}) }] });

/** The workspace serves the office app only; any other caller is answered like an unknown address. */
export function officeOnly(ctx: HandlerContext): void {
  if (ctx.persona?.app !== 'backoffice' || (ctx.app !== undefined && ctx.app !== 'backoffice')) notFound(ctx);
}

/** Stamps and dates on the demo clock (the business date is fixed; times are the visitor's own). */
export const stampOf = (ctx: HandlerContext) => `${ctx.at}T${new Date().toISOString().slice(11, 19)}Z`;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (d: unknown): d is string => typeof d === 'string' && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);

/** Whether the reader's data scope is the whole organisation (needed to act on organisation-wide records). */
export const orgWide = (ctx: HandlerContext) => !!ctx.access && ctx.access.scopes.length > 0 && ctx.access.scopes.every((s) => s.type === 'all') && ctx.persona?.projectScope === 'all';

// ---------------------------------------------------------------------------------------------
// Bound idempotency (Issue #16 P0-2 / #18 / #21 pattern; module-local until E.0's helper lands)
// ---------------------------------------------------------------------------------------------
export interface BoundKey {
  op: string;
  principal: string;
  target: string;
  fingerprint: string;
  recordId: string;
}

export const idemKey = (ctx: HandlerContext): string | undefined => str(bodyOf<{ idempotencyKey: string }>(ctx).idempotencyKey, 80) || str(ctx.req.idempotencyKey, 80) || undefined;
const inputPrint = (input: unknown) => fingerprint(JSON.stringify(input) ?? '');

/**
 * The record an identical earlier request created, or undefined (a new create). The key replays only
 * the same operation, by the same person, on the same target, with the same input; any other reuse is
 * refused with one answer that says nothing about what the key was used for, and nothing changes.
 * Callers re-check their authority over the target before calling this, and look the recorded result
 * up again through their own scoped finder.
 */
export function replayOf(ctx: HandlerContext, store: Record<string, BoundKey>, op: string, target: string, input: unknown): string | undefined {
  const key = idemKey(ctx);
  if (!key) return undefined;
  const e = store[key];
  if (!e) return undefined;
  if (e.op !== op || e.principal !== ctx.persona?.principalId || e.target !== target || e.fingerprint !== inputPrint(input)) {
    problem(ctx, 409, 'idempotency_key_reused', 'documents:problems.idempotencyKeyReused');
  }
  return e.recordId;
}

export function remember(ctx: HandlerContext, store: Record<string, BoundKey>, op: string, target: string, input: unknown, recordId: string): void {
  const key = idemKey(ctx);
  if (key) store[key] = { op, principal: ctx.persona!.principalId, target, fingerprint: inputPrint(input), recordId };
}

export { fingerprint };
