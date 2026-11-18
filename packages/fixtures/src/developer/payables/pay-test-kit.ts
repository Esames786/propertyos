import { ApiError, type EffectiveAccess, type Permission, type Persona } from '@repo/contracts';
import { DEMO_STORE_KEY, DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';
import { datasetFor } from '../../datasets';
import { sessionGate } from '../../identity/gate';
import { findPersona } from '../../people';
import { ACCESS_TODAY } from '../../tenant-directory';
import { MULTI_ENTITY_PERSONAS, multiEntityAccess, multiEntityDataset, SECOND_ENTITY, SECOND_ENTITY_PROFILE } from '../multientity.fixture';
import { DEVELOPER_SECTION, ENTITY_PROFILES, seedDeveloperState } from '../state';
import { PAYABLES_SECTION, type PayablesState } from './state';

/**
 * Gate E.8 test helpers (test code only): one browser session over E.0's test-only multi-entity Larkspur
 * (`multientity.fixture.ts`: a second legal entity, LRD, with the Riverside project), through the real
 * fail-closed mock transport. Extra test principals (never demo identities) and access changes (revoked
 * permissions, suspension) can be given; `as` switches the signed-in person.
 */

const principal = (id: string, displayName: string, permissions: readonly Permission[], projectScope: Persona['projectScope'], roleKey = 'common:roles.accounts_officer'): Persona =>
  ({ id, tenantId: 'tnt_larkspur', principalId: `usr_${id}`, app: 'backoffice', displayName, email: `${id}@example.com`, roleKey, permissions, projectScope }) as unknown as Persona;

/** Reads suppliers and expenses of Larkspur Heights only (a cost-centre-limited reader). */
export const HEIGHTS_READER = principal('res_e8_heights_reader', 'E8 Test Reader (Heights)', ['project.context.use', 'supplier.view', 'expense.view'], ['prj_heights']);
/** A test-only person holding both sides of the bill pair: the server still refuses their own bill. */
export const BOTH_HATS = principal('res_e8_both_hats', 'E8 Test Both Hats', ['project.context.use', 'supplier.view', 'supplier.manage', 'supplier_bill.approve', 'supplier_payment.approve', 'bank.view', 'expense.view', 'expense.create', 'expense.approve', 'budget.manage', 'budget.approve'], 'all');
/** A second checker (Larkspur entity only) so a claim the finance controller made for himself can be decided. */
export const SECOND_CHECKER = principal('res_e8_checker_two', 'E8 Test Checker Two', ['project.context.use', 'expense.view', 'expense.approve', 'supplier.view', 'supplier_bill.approve'], 'all', 'common:roles.finance_controller');

export const E8_PERSONAS: readonly Persona[] = [...MULTI_ENTITY_PERSONAS, HEIGHTS_READER, BOTH_HATS, SECOND_CHECKER];

export type AccessChange = (persona: Persona, access: EffectiveAccess) => EffectiveAccess;

export function payWorld() {
  const data = multiEntityDataset();
  const mem = new Map<string, string>();
  const demo = new DemoStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
  demo.partition('tnt_larkspur').section(DEVELOPER_SECTION, () => seedDeveloperState(data, { ...ENTITY_PROFILES, [SECOND_ENTITY]: SECOND_ENTITY_PROFILE }));
  demo.save();
  // Every person's demo session exists before the test starts (D.1: a first request signs the person in,
  // which is stored), so a "state unchanged" comparison sees only what the request under test did.
  const signedInAt = `${ACCESS_TODAY}T${new Date().toISOString().slice(11)}`;
  for (const p of E8_PERSONAS.filter((x) => x.app === 'backoffice')) sessionGate({ demo: demo.partition(p.tenantId), persona: p, sessionId: undefined, device: undefined, app: 'backoffice', stamp: signedInAt });
  demo.save();
  const context = { personaId: 'lsp_accounts', projectId: 'all' };
  let change: AccessChange | null = null;
  let training = false;
  const api = new MockTransport({
    getContext: () => ({ ...context }),
    getMode: () => 'fast',
    demo,
    personas: E8_PERSONAS,
    accessFor: (p) => {
      const a = multiEntityAccess(p);
      return a && change ? change(p, a) : a;
    },
    datasetFor: (tenantId) => (tenantId === 'tnt_larkspur' ? data : datasetFor(tenantId)),
  });
  const w = {
    api,
    demo,
    data,
    as(personaId: string, projectId = 'all') {
      context.personaId = personaId;
      context.projectId = projectId;
      return w;
    },
    /** Change everyone's access from now on (revocation, suspension); `null` restores it. */
    access(c: AccessChange | null) {
      change = c;
      return w;
    },
    practice(on: boolean) {
      training = on;
      return w;
    },
    get: <T = unknown>(path: string, query?: Record<string, string>) => api.request<T>({ method: 'GET', path, ...(query ? { query } : {}) }),
    post: <T = unknown>(path: string, body: Record<string, unknown> = {}, key?: string) => api.request<T>({ method: 'POST', path, body: key ? { ...body, idempotencyKey: key } : body, ...(key ? { idempotencyKey: key } : {}), ...(training ? { training: true } : {}) }),
    /** The whole store as the browser keeps it: a refusal leaves it byte-identical. */
    snapshot(): string {
      demo.save();
      return mem.get(DEMO_STORE_KEY) ?? '';
    },
    /** Larkspur's stored payables section (undefined until the first accepted change). */
    stored: () => demo.partition('tnt_larkspur').peekSection<PayablesState>(PAYABLES_SECTION),
  };
  return w;
}

export type PayWorld = ReturnType<typeof payWorld>;

/** A refusal in a comparable form (the correlation id masked). */
export async function refusal(p: Promise<unknown>): Promise<{ status: number; code: string; messageKey: string; errors: Record<string, Array<{ code: string }>>; text: string }> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) {
      const problem = { ...e.problem, correlationId: '<masked>' };
      return { status: e.problem.status, code: e.problem.code, messageKey: e.problem.messageKey, errors: (e.problem.errors ?? {}) as Record<string, Array<{ code: string }>>, text: JSON.stringify({ name: e.name, message: e.message, problem }) };
    }
    throw e;
  }
  throw new Error('expected a refusal');
}

export const principalOf = (personaId: string) => findPersona(personaId)?.principalId ?? E8_PERSONAS.find((p) => p.id === personaId)!.principalId;
