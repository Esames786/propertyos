import { ApiError, type EffectiveAccess, type ModuleGrant, type ModuleKey, type Permission, type Persona } from '@repo/contracts';
import { DemoStore } from '../demo-store';
import { MockTransport } from '../mock-transport';
import { ALL_PERSONAS } from '../people';
import { effectiveAccessFor } from '../tenant-directory';
import { RENT_SECTION, type RentalsState } from './state';

/**
 * Test helpers for the Gate S.3 rentals API tests: one demo session through the fail-closed mock
 * transport, as a chosen persona, with an optional access override (a withdrawn module or feature, a
 * missing permission, a narrower scope, a suspended organisation, a grant on fewer sites) and extra
 * personas. Requests can carry an idempotency key or the training flag. Test code only.
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
/** Access as configured, changed for everyone. */
export const everyone = (change: (a: EffectiveAccess) => EffectiveAccess): AccessFor => (p) => {
  const a = effectiveAccessFor(p);
  return a ? change(a) : a;
};
export const withoutModules = (...modules: ModuleKey[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, grants: a.grants.filter((g) => !modules.includes(g.module)) });
export const withoutFeatures = (...features: string[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, features: a.features.filter((f) => !features.includes(f)) });
export const plus = (...permissions: Permission[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, permissions: [...a.permissions, ...permissions] });
export const minus = (...permissions: Permission[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, permissions: a.permissions.filter((x) => !permissions.includes(x)) });
export const sitesOnly = (...ids: string[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, scopes: [{ type: 'site', ids }] });
export const suspended = (a: EffectiveAccess): EffectiveAccess => ({ ...a, tenant: { ...a.tenant, status: 'suspended' } });
/** The rentals grant narrowed (or moved) to these sites. */
export const rentalsOn = (...sites: string[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, grants: a.grants.map((g): ModuleGrant => (g.module === 'rentals' ? { ...g, sites } : g)) });

export function rentSession(options: { accessFor?: AccessFor; personas?: readonly Persona[] } = {}) {
  const demo = new DemoStore(memory());
  let personaId: string | null = 'rb_manager';
  const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo, ...(options.accessFor ? { accessFor: options.accessFor } : {}), ...(options.personas ? { personas: [...ALL_PERSONAS, ...options.personas] } : {}) });
  const api = {
    as(id: string | null) {
      personaId = id;
      return api;
    },
    get: <T>(path: string, query?: Record<string, string>) => t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) }),
    post: <T>(path: string, body: unknown = {}, opts: { key?: string; training?: boolean } = {}) => t.request<T>({ method: 'POST', path, body, ...(opts.key ? { idempotencyKey: opts.key } : {}), ...(opts.training ? { training: true } : {}) }),
    /** Riverbend's stored rentals records in this session (created by the first rentals request). */
    rent: () => demo.partition('tnt_riverbend').section<RentalsState>(RENT_SECTION, () => {
      throw new Error('rentals state not created yet');
    }),
    /** Riverbend's rentals records and the partitions in use, as text: a refused request leaves them byte-identical. */
    snapshot: () => JSON.stringify({ rb: api.rent(), partitions: demo.partitionKeys() }),
    /** Organisations whose demo partition holds anything (a refused request creates none). */
    partitions: () => demo.partitionKeys(),
  };
  return api;
}

export type RentSession = ReturnType<typeof rentSession>;

export const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.problem.status, code: e.problem.code, messageKey: e.problem.messageKey, fields: Object.keys(e.problem.errors ?? {}), errors: e.problem.errors ?? {} };
    throw e;
  }
  throw new Error('expected a refusal');
};
