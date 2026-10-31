import type { Permission } from '@repo/contracts';
import { decide } from '@repo/contracts';
import type { HandlerContext } from '../../handler-types';
import { actor, log, problem, save, stamp, type Society } from '../handlers';
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

/** A repeated request with the same key returns what the first one created (never a copy). */
export function replay(s: Society, key: string | undefined): string | undefined {
  return key ? s.state.finance.idempotency[key] : undefined;
}

export function remember(s: Society, key: string | undefined, id: string): void {
  if (key) s.state.finance.idempotency[key] = id;
}

/** Whether a module is licensed for the tenant on the demo date (e.g. `payables` disables expense vouchers). */
export const licensed = (ctx: HandlerContext, module: Parameters<typeof decide>[1]['module']) => !!ctx.access && decide(ctx.access, { module, at: ctx.at, suspension: 'history_read' }).allowed;

export const refuse = (ctx: HandlerContext, status: number, code: string, field?: string, params?: Record<string, string>): never =>
  problem(ctx, status, code, `finance:problems.${code}`, field ? { [field]: [{ code: `finance:problems.${code}`, ...(params ? { params } : {}) }] } : undefined);
