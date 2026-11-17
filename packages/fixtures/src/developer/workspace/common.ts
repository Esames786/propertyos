import { ApiError } from '@repo/contracts';
import type { HandlerContext } from '../../handler-types';
import { notFound } from '../../handler-types';
import { remember as rememberBound, replayOf as replayBound, requestKey, type IdempotencyStore } from '../../idempotency';
import { fingerprint } from '../../society/import';
import { organisationWhole } from '../scope';

/**
 * Gate E.13 shared bits of the workspace and documents handlers. Wave 1 integration (Issue #25): bound
 * idempotency is E.0's `idempotency.ts` and the whole-organisation rule E.0's `developer/scope.ts` (below);
 * the uniform "not found" of S.2a/S.2b (an unknown id and a hidden one answer the same) stays.
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

/** Whether the reader's data scope is the whole organisation: E.0's `organisationWhole` (Wave 1 integration). */
export const orgWide = organisationWhole;

// ---------------------------------------------------------------------------------------------
// Bound idempotency: E.0's shared helper (`idempotency.ts`) since the Wave 1 integration (Issue #25)
// ---------------------------------------------------------------------------------------------
// E.13's own copy (key reader, fingerprint, entries) is gone; these adapters keep E.13's call shape. A key is
// bound to the operation, organisation, principal, target and normalised input; any other reuse is the one
// non-disclosing 409; a replay by someone who has lost authority over the target is 404.

/** The request's key (E.0's `requestKey`: the transport's key, else the body's). */
export const idemKey = (ctx: HandlerContext): string | undefined => requestKey(ctx);

/** The record an identical earlier request created, or undefined (a new create). Callers re-read it through their scoped finder. */
export function replayOf(ctx: HandlerContext, store: IdempotencyStore, op: string, target: string, input: unknown, stillAuthorized: () => boolean): string | undefined {
  return replayBound(ctx, store, { op, target, input, stillAuthorized });
}

export function remember(ctx: HandlerContext, store: IdempotencyStore, op: string, target: string, input: unknown, recordId: string): void {
  rememberBound(ctx, store, { op, target, input }, recordId);
}

export { fingerprint };
