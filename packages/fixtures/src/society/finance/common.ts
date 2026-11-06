import type { Permission } from '@repo/contracts';
import { decide } from '@repo/contracts';
import type { HandlerContext } from '../../handler-types';
import { actor, log, problem, save, stamp, type Society } from '../handlers';
import { fingerprint } from '../import';
import { isLocked } from './cashbook';
import { AMOUNT, periodOf } from './model';

/** Shared pieces of the S.1 endpoints: who acts, the period lock, idempotency and input checks. */

export const me = (ctx: HandlerContext) => {
  const { by, byName } = actor(ctx);
  return { principalId: by, name: byName, permissions: ctx.persona?.permissions ?? ([] as readonly Permission[]) };
};

export const body = <T>(ctx: HandlerContext) => (ctx.req.body ?? {}) as Partial<T>;
export const query = (ctx: HandlerContext) => (ctx.req.query ?? {}) as Record<string, string | undefined>;
export const text = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);

export function amountField(ctx: HandlerContext, field: string, raw: unknown): bigint {
  const v = String(raw ?? '').trim().replace(/,/g, '');
  if (!AMOUNT.test(v) || Number(v) <= 0) problem(ctx, 422, 'validation_failed', 'errors:validation.summary', { [field]: [{ code: 'finance:problems.amount' }] });
  const [whole, frac = ''] = v.split('.');
  return BigInt(whole!) * 100n + BigInt((frac + '00').slice(0, 2));
}

export function required(ctx: HandlerContext, field: string, value: string, min = 3): string {
  if (value.length < min) problem(ctx, 422, 'validation_failed', 'errors:validation.summary', { [field]: [{ code: 'finance:problems.required', params: { min: String(min) } }] });
  return value;
}

/**
 * I-27: a posting dated in a closed month is refused. The refusal itself is recorded on the period
 * (the audit shows who tried what), then the request fails without changing anything else.
 */
export function assertOpen(ctx: HandlerContext, s: Society, date: string, what: string): void {
  if (!isLocked(s.state, date)) return;
  const period = s.state.finance.periods.find((p) => p.period === periodOf(date))!;
  const who = me(ctx);
  period.history.push({ at: stamp(ctx), by: who.principalId, byName: who.name, action: 'posting_refused', note: `${what} · ${date}` });
  log(ctx, s, 'latePostingRefused', { kind: 'period', id: period.id, label: period.period }, { values: { what, date } });
  save(ctx);
  problem(ctx, 409, 'period_closed', 'finance:problems.periodClosed', { date: [{ code: 'finance:problems.periodClosed', params: { period: period.period } }] });
}

/**
 * GitHub Issue #18 (FIN-02): idempotency bound to the request, as payroll's (Issue #16).
 *
 * Every S.1 create shares one map of keys. A create remembers its key with the operation, the
 * principal, the target (legal entity and the account, flat or payer it creates on) and a
 * fingerprint of its normalised input. The same key then replays only the exact same request: the
 * same operation, by the same person, on the same target, with the same input. Anything else with
 * that key is refused with one answer that says nothing about what the key was used for, and
 * nothing changes. Callers check the target first (an account, flat or payer the caller cannot use
 * is refused like one never issued), and look the recorded result up again through their own
 * scoped finder, never trusting the stored id alone.
 *
 * The key is the body's `idempotencyKey` (the S.1 contract), else the request's own key.
 */
export type FinanceIdemOp = 'voucher.create' | 'transfer.create' | 'office_cash.record' | 'batch.create' | 'cheque.receive' | 'ownership.create';

export const idemKey = (ctx: HandlerContext): string | undefined => text(body<{ idempotencyKey: string }>(ctx).idempotencyKey, 80) || text(ctx.req.idempotencyKey, 80) || undefined;

const inputPrint = (input: unknown) => fingerprint(JSON.stringify(input, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)) ?? '');

/** The record an identical earlier request created, or nothing (a new create); any other reuse is refused. */
export function replayOf(ctx: HandlerContext, s: Society, op: FinanceIdemOp, target: string, input: unknown): string | undefined {
  const key = idemKey(ctx);
  if (!key) return undefined;
  const e = s.state.finance.idempotency[key];
  if (!e) return undefined;
  // A key stored before Issue #18 (an id alone) was never bound to a request: it replays nothing.
  if (typeof e !== 'object' || e.op !== op || e.principal !== me(ctx).principalId || e.target !== target || e.fingerprint !== inputPrint(input)) {
    problem(ctx, 409, 'idempotency_key_reused', 'finance:problems.idempotencyKeyReused');
  }
  return e.recordId;
}

export function remember(ctx: HandlerContext, s: Society, op: FinanceIdemOp, target: string, input: unknown, recordId: string): void {
  const key = idemKey(ctx);
  if (key) s.state.finance.idempotency[key] = { op, principal: me(ctx).principalId, target, fingerprint: inputPrint(input), recordId };
}

/** Whether a module is licensed for the tenant on the demo date (e.g. `payables` disables expense vouchers). */
export const licensed = (ctx: HandlerContext, module: Parameters<typeof decide>[1]['module']) => !!ctx.access && decide(ctx.access, { module, at: ctx.at, suspension: 'history_read' }).allowed;

export const refuse = (ctx: HandlerContext, status: number, code: string, field?: string, params?: Record<string, string>): never =>
  problem(ctx, status, code, `finance:problems.${code}`, field ? { [field]: [{ code: `finance:problems.${code}`, ...(params ? { params } : {}) }] } : undefined);
