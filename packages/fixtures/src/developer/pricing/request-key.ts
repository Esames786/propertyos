import { invalid, type HandlerContext } from '../../handler-types';

/**
 * E.3 draft mutations must not silently prefer a conflicting transport key.
 * Both copies, when supplied, must identify the SAME logical request.
 */
export function parseDraftRequestKey(header: unknown, body: unknown): string | null {
  if (header !== undefined && body !== undefined && header !== body) return null;
  const value = header ?? body;
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{12,100}$/.test(value)) return null;
  return value;
}

export function requireDraftRequestKey(ctx: HandlerContext, data?: Record<string, unknown>): string {
  const body = data ?? (ctx.req.body && typeof ctx.req.body === 'object' && !Array.isArray(ctx.req.body)
    ? ctx.req.body as Record<string, unknown> : undefined);
  const key = parseDraftRequestKey(ctx.req.idempotencyKey, body?.idempotencyKey);
  if (key === null) invalid(ctx, 'idempotencyKey');
  return key;
}
