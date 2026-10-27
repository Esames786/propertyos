import { ApiError, type ApiRequest, type EffectiveAccess, type ModuleKey, type Permission, type Persona, type SuspensionClass } from '@repo/contracts';
import type { DemoStore } from './demo-store';
import type { TrainingStore } from './training-store';

export interface HandlerContext {
  persona: Persona | undefined;
  /** The signed-in person's tenant and effective access (tenant plane only). */
  tenantId: string | undefined;
  access: EffectiveAccess | null;
  /** The seeded developer records (leads, units, invoices…) belong to Larkspur; nobody else may read them. */
  ownsSeedData: boolean;
  /** Persona scope AND the header project filter. */
  allowsProject: (projectId: string) => boolean;
  correlationId: string;
  req: ApiRequest;
  params: Record<string, string>;
  training: TrainingStore;
  /** Session overlay of the demo environment (writes made while exploring the demo). */
  demo: DemoStore;
}

export interface Handler {
  method: ApiRequest['method'];
  pattern: RegExp;
  /**
   * Module the endpoint belongs to: the transport refuses it (403 module_not_licensed, …) before the
   * handler runs when the tenant has not licensed it, exactly as the backend will (V3.1 access).
   */
  module?: ModuleKey;
  /** Suspension class (A1 §4): undeclared endpoints are operational and refused while suspended. */
  suspension?: SuspensionClass;
  handle: (ctx: HandlerContext) => unknown;
}

export function can(ctx: HandlerContext, permission: Permission): boolean {
  return ctx.persona?.permissions.includes(permission) ?? false;
}

export function forbid(ctx: HandlerContext): never {
  throw new ApiError({ status: 403, code: 'forbidden', messageKey: 'errors:api.forbidden', correlationId: ctx.correlationId, changed: false });
}

export function notFound(ctx: HandlerContext): never {
  throw new ApiError({ status: 404, code: 'not_found', messageKey: 'errors:api.notFound', correlationId: ctx.correlationId, changed: false });
}

export function invalid(ctx: HandlerContext, field: string, code = 'forms:errors.required'): never {
  throw new ApiError({
    status: 422,
    code: 'validation_failed',
    messageKey: 'errors:validation.summary',
    errors: { [field]: [{ code }] },
    correlationId: ctx.correlationId,
    changed: false,
  });
}

/** Project visible by persona scope, ignoring the header project filter (for pickers). */
export function isScopeOnly(ctx: HandlerContext, projectId: string): boolean {
  const scope = ctx.persona?.projectScope ?? [];
  return scope === 'all' || scope.includes(projectId);
}

const norm = (s: string) => s.toLocaleLowerCase('en').replace(/[\s\-+]/g, '');

export function matches(q: string, ...fields: Array<string | undefined>): boolean {
  const needle = norm(q);
  return fields.some((f) => f !== undefined && norm(f).includes(needle));
}
