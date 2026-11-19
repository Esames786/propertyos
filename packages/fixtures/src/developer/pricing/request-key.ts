import { invalid, type HandlerContext } from '../../handler-types';
import { MAX_IDEMPOTENCY_KEY } from '../../idempotency';

/**
 * E.3 draft mutations must not silently prefer a conflicting transport key.
 * Both copies, when supplied, must identify the SAME logical request.
 *
 * Wave 2 integration: at most E.0's MAX_IDEMPOTENCY_KEY (80) characters, because the shared helper keeps only
 * that many; a longer key would be cut and two different keys could become one.
 */
const KEY_FORMAT = new RegExp(`^[A-Za-z0-9._:-]{12,${MAX_IDEMPOTENCY_KEY}}$`);
export function parseDraftRequestKey(header: unknown, body: unknown): string | null {
  if (header !== undefined && body !== undefined && header !== body) return null;
  const value = header ?? body;
  if (typeof value !== 'string' || !KEY_FORMAT.test(value)) return null;
  return value;
}

export function requireDraftRequestKey(ctx: HandlerContext, data?: Record<string, unknown>): string {
  const body = data ?? (ctx.req.body && typeof ctx.req.body === 'object' && !Array.isArray(ctx.req.body)
    ? ctx.req.body as Record<string, unknown> : undefined);
  const key = parseDraftRequestKey(ctx.req.idempotencyKey, body?.idempotencyKey);
  if (key === null) invalid(ctx, 'idempotencyKey');
  return key;
}
