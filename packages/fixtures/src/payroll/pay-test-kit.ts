import { ApiError, type EffectiveAccess, type ModuleKey, type Permission, type Persona } from '@repo/contracts';
import { DemoStore } from '../demo-store';
import { HR_SECTION, type HrState } from '../hr/state';
import { MockTransport } from '../mock-transport';
import { effectiveAccessFor } from '../tenant-directory';
import { PAY_SECTION, type PayrollState } from './state';

/**
 * Test helpers for the Gate S.2b payroll API tests: one demo session through the fail-closed mock
 * transport, as a chosen persona, with an optional access override (a withdrawn module, an extra or
 * missing permission, a narrower scope, a suspended organisation, a licence not yet in force).
 * Requests can carry an idempotency key or the training flag. Test code only.
 */
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

type AccessFor = (p: Persona) => EffectiveAccess | null;

/** Access as configured, changed for the named personas only. */
export const changed = (personaIds: readonly string[], change: (a: EffectiveAccess) => EffectiveAccess): AccessFor => (p) => {
  const a = effectiveAccessFor(p);
  return a && personaIds.includes(p.id) ? change(a) : a;
};
export const withoutModules = (...modules: ModuleKey[]): AccessFor => (p) => {
  const a = effectiveAccessFor(p);
  return a ? { ...a, grants: a.grants.filter((g) => !modules.includes(g.module)) } : null;
};
export const plus = (...permissions: Permission[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, permissions: [...a.permissions, ...permissions] });
export const sitesOnly = (...ids: string[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, scopes: [{ type: 'site', ids }] });

export function paySession(options: { accessFor?: AccessFor } = {}) {
  const demo = new DemoStore(memory());
  let personaId: string | null = 'alnoor_accounts';
  let app: 'backoffice' | 'customer' = 'backoffice';
  const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo, ...(options.accessFor ? { accessFor: options.accessFor } : {}) });
  const ready = new MockTransport({ getContext: () => ({ personaId: 'alnoor_manager', projectId: 'all' }), getMode: () => 'fast', demo }).request({ method: 'POST', path: '/society/demo', body: { mode: 'collecting' } });
  const api = {
    as(id: string | null) {
      personaId = id;
      app = 'backoffice';
      return api;
    },
    get: async <T>(path: string, query?: Record<string, string>) => (await ready, t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) })),
    post: async <T>(path: string, body: unknown = {}, opts: { key?: string; training?: boolean } = {}) => (await ready, t.request<T>({ method: 'POST', path, body, ...(opts.key ? { idempotencyKey: opts.key } : {}), ...(opts.training ? { training: true } : {}) })),
    /** Payroll's stored records in this session (to compare before and after a refusal). */
    pay: () => demo.partition('tnt_alnoor').section<PayrollState>(PAY_SECTION, () => {
      throw new Error('payroll state not created yet');
    }),
    hr: () => demo.partition('tnt_alnoor').section<HrState>(HR_SECTION, () => {
      throw new Error('HR state not created yet');
    }),
    /** Both stores as text: a refused request must leave them byte-identical. */
    snapshot: () => JSON.stringify({ pay: api.pay(), hr: api.hr() }),
    app: () => app,
  };
  return api;
}

export type PaySession = ReturnType<typeof paySession>;

export const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.problem.status, code: e.problem.code, messageKey: e.problem.messageKey, fields: Object.keys(e.problem.errors ?? {}), errors: e.problem.errors ?? {} };
    throw e;
  }
  throw new Error('expected a refusal');
};
