import { ApiError, type ApiRequest, type Permission, type Persona } from '@repo/contracts';
import type { PlatformStore } from './store';
import type { Problem, Problems } from './validation';

/** Shared plumbing of the platform-plane handlers (one module, so handler files never import each other). */
export interface PlatformContext {
  persona: Persona | undefined;
  req: ApiRequest;
  params: Record<string, string>;
  store: PlatformStore;
  correlationId: string;
}

export interface PlatformHandler {
  method: ApiRequest['method'];
  pattern: RegExp;
  /** Any one of these is enough. */
  permission?: Permission | readonly Permission[];
  handle: (ctx: PlatformContext) => unknown;
}

export const fail = (ctx: PlatformContext, status: number, code: string, messageKey: string): never => {
  throw new ApiError({ status, code, messageKey, correlationId: ctx.correlationId, changed: false });
};

export const invalid = (ctx: PlatformContext, errors: Record<string, string | Problem>): never => {
  throw new ApiError({
    status: 422,
    code: 'validation_failed',
    messageKey: 'errors:validation.summary',
    errors: Object.fromEntries(Object.entries(errors).map(([field, e]) => [field, [typeof e === 'string' ? { code: e } : e]])),
    correlationId: ctx.correlationId,
    changed: false,
  });
};

export const refuse = (ctx: PlatformContext, problems: Problems) => {
  if (Object.keys(problems).length) invalid(ctx, problems);
};

/** Principal of the signed-in identity: maker-checker and audit compare these, never display names. */
export const principalOf = (ctx: PlatformContext) => ctx.persona?.principalId ?? fail(ctx, 401, 'unauthenticated', 'errors:api.unauthenticated');
export const notFound = (ctx: PlatformContext) => fail(ctx, 404, 'not_found', 'errors:api.notFound');
export const body = <T,>(ctx: PlatformContext) => (ctx.req.body ?? {}) as T;
export const q = (ctx: PlatformContext, key: string) => {
  const v = ctx.req.query?.[key];
  return v === undefined || v === '' ? undefined : String(v);
};
export const now = () => new Date().toISOString();
export const clone = <T,>(v: T): T => structuredClone(v);
export const has = (ctx: PlatformContext, p: Permission) => ctx.persona?.permissions.includes(p) ?? false;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
