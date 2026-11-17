import { ApiError, type EffectiveAccess, type Permission, type Persona } from '@repo/contracts';
import { DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';
import { ALL_PERSONAS } from '../../people';
import { effectiveAccessFor } from '../../tenant-directory';
import { INVENTORY_SECTION, type InventoryState } from './state';

/**
 * Test helpers for the Gate E.2 API tests (test code only): one demo session through the fail-closed
 * mock transport, as a chosen persona and header project, with an optional access override (revoked
 * permissions, narrower scope, a withdrawn module) that can change between two requests of the same
 * session, and extra test principals.
 */
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

export type AccessChange = (a: EffectiveAccess) => EffectiveAccess;
export const minus = (...permissions: Permission[]): AccessChange => (a) => ({ ...a, permissions: a.permissions.filter((x) => !permissions.includes(x)) });
export const plus = (...permissions: Permission[]): AccessChange => (a) => ({ ...a, permissions: [...a.permissions, ...permissions] });
export const projectsOnly = (...ids: string[]): AccessChange => (a) => ({ ...a, scopes: [{ type: 'project', ids }] });

/** A test-only principal (never a demo identity): a Heights-only storage allocator, for cross-project checks. */
export const HEIGHTS_STORAGE_CLERK: Persona = {
  id: 'test_e2_clerk' as Persona['id'],
  tenantId: 'tnt_larkspur',
  principalId: 'usr_test_e2_clerk',
  app: 'backoffice',
  displayName: 'Test Clerk (E.2 test principal)',
  roleKey: 'projects:roles.projectOfficer',
  email: 'clerk@example.com',
  permissions: ['project.context.use', 'unit.view', 'storage.manage', 'unit.hold', 'lead.view'],
  projectScope: ['prj_heights'],
};

/** A test-only second preparer (organisation-wide, project.manage): someone else's draft is not theirs to change. */
export const SECOND_OFFICER: Persona = {
  id: 'test_e2_officer2' as Persona['id'],
  tenantId: 'tnt_larkspur',
  principalId: 'usr_test_e2_officer2',
  app: 'backoffice',
  displayName: 'Test Officer (E.2 test principal)',
  roleKey: 'projects:roles.projectOfficer',
  email: 'officer2@example.com',
  permissions: ['project.context.use', 'unit.view', 'project.view', 'project.manage'],
  projectScope: 'all',
};

export function invSession(options: { personas?: readonly Persona[] } = {}) {
  const store = memory();
  const demo = new DemoStore(store);
  let personaId: string | null = 'manager';
  let headerProject = 'all';
  /** Per-persona access changes; replaceable between requests (revocation mid-session). */
  const changes = new Map<string, AccessChange>();
  const personas = options.personas ? [...options.personas.map((p) => ({ ...p })), ...ALL_PERSONAS] : ALL_PERSONAS;
  const t = new MockTransport({
    getContext: () => ({ personaId, projectId: headerProject }),
    getMode: () => 'fast',
    demo,
    personas,
    accessFor: (p) => {
      const a = effectiveAccessFor(p);
      const change = changes.get(p.principalId) ?? changes.get(p.id);
      return a && change ? change(a) : a;
    },
  });
  const api = {
    as(id: string | null) {
      personaId = id;
      return api;
    },
    header(projectId: string) {
      headerProject = projectId;
      return api;
    },
    change(who: string, change: AccessChange | null) {
      if (change) changes.set(who, change);
      else changes.delete(who);
      return api;
    },
    get: <T>(path: string, query?: Record<string, string>) => t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) }),
    post: <T>(path: string, body: Record<string, unknown> = {}, opts: { key?: string } = {}) => t.request<T>({ method: 'POST', path, body: opts.key ? { ...body, idempotencyKey: opts.key } : body, ...(opts.key ? { idempotencyKey: opts.key } : {}) }),
    /** The tenant's E.2 state (after the first E.2 request). */
    inv: (tenant = 'tnt_larkspur') =>
      demo.partition(tenant).section<InventoryState>(INVENTORY_SECTION, () => {
        throw new Error('E.2 state not created yet');
      }),
    holds: (tenant = 'tnt_larkspur') => demo.partition(tenant).holds(),
    /**
     * Every partition of the session (the live state every read and write uses; the stored copy is
     * written from it), except the D.1 sign-in sessions (the transport records who called and when on
     * every request, refused or not, and saves the store then): a refused request leaves all business
     * records (holds, lead activity, the E.2 state, every other section) byte-identical.
     */
    snapshot: () => JSON.stringify((demo as unknown as { state: unknown }).state, (k, v: unknown) => (k === 'identity' && v && typeof v === 'object' && 'sessions' in (v as object) ? '[sessions]' : v)),
    /** The stored copy (sessionStorage stand-in), for persistence checks. */
    stored: () => store.getItem('demo:store:v2'),
    demo,
  };
  return api;
}

export type InvSession = ReturnType<typeof invSession>;

export const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.problem.status, code: e.problem.code, messageKey: e.problem.messageKey, errors: e.problem.errors ?? {} };
    throw e;
  }
  throw new Error('expected a refusal');
};
