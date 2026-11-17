import type { EffectiveAccess, Permission, Persona, Project } from '@repo/contracts';
import type { TenantDataset } from '../dataset-types';
import { datasetFor } from '../datasets';
import { DEMO_STORE_KEY, DemoStore } from '../demo-store';
import { MockTransport } from '../mock-transport';
import { PERSONAS } from '../people';
import { tenantRole } from '../role-templates';
import { effectiveAccessFor } from '../tenant-directory';
import { DEVELOPER_SECTION, ENTITY_PROFILES, seedDeveloperState, type EntityProfile } from './state';

/**
 * Gate E.0 deliverable 1 (owner decision E-08, conservative default): a fictional **test-only** second
 * legal entity and third project for Larkspur, so legal-entity isolation (A2 §5.1, I-19) can be tested.
 * The demo itself is unchanged: Larkspur keeps one entity (`le_larkspur`) and its two projects, and every
 * existing id stays as it is. Pattern: `hr/multisite.fixture.ts`.
 *
 * - **Larkspur Riverside (Demo)** (`prj_lsp_riverside_demo`, site `site_lk_riverside_demo`), sold and booked by
 *   **Larkspur Riverside Developers (Pvt) Ltd (Demo)** (`le_lsp_two_demo`, code `LRD`).
 * - Test principals (never demo identities): an accounts officer scoped to the second entity only, and a
 *   ledger reader scoped to Larkspur Heights only. The existing personas are unchanged (Nadia: all).
 *
 * `multiEntityWorld()` gives a transport over this dataset with the developer state seeded for both
 * entities; areas add their own records on top (in their own sections) for their tests.
 */

export const SECOND_ENTITY = 'le_lsp_two_demo';
export const SECOND_ENTITY_PROFILE: EntityProfile = { name: 'Larkspur Riverside Developers (Pvt) Ltd (Demo)', code: 'LRD', registration: 'DEMO-REG-LRD-0001', accountLast4: '5582' };

export const RIVERSIDE: Project = { id: 'prj_lsp_riverside_demo', ref: 'LR', name: 'Larkspur Riverside (Demo)', city: 'Lahore', kind: 'towers', siteId: 'site_lk_riverside_demo', legalEntityId: SECOND_ENTITY };

/** Larkspur's dataset with the test-only third project (another legal entity). */
export function multiEntityDataset(base: TenantDataset = datasetFor('tnt_larkspur')!): TenantDataset {
  return { ...base, projects: [...base.projects, RIVERSIDE] };
}

const testPrincipal = (id: string, principalId: string, displayName: string, permissions: readonly Permission[], projectScope: Persona['projectScope']): Persona =>
  ({ id, tenantId: 'tnt_larkspur', principalId, app: 'backoffice', displayName, email: `${principalId}@example.com`, roleKey: 'common:roles.accounts_officer', permissions, projectScope }) as unknown as Persona;

/** Accounts officer of the second entity only (scope: that legal entity). */
export const ACCOUNTS_TWO = testPrincipal('res_e0_accounts_two', 'usr_e0_accounts_two', 'E0 Test Accounts (Riverside)', tenantRole('tnt_larkspur', 'accounts_officer').permissions, [RIVERSIDE.id]);
/** Reads the ledger and bank records of Larkspur Heights only (scope: that project). */
export const HEIGHTS_LEDGER = testPrincipal('res_e0_heights_ledger', 'usr_e0_heights_ledger', 'E0 Test Ledger (Heights)', ['project.context.use', 'gl.view', 'bank.view'], ['prj_heights']);

export const MULTI_ENTITY_PERSONAS: readonly Persona[] = [...PERSONAS, ACCOUNTS_TWO, HEIGHTS_LEDGER];

/** Effective access: the second-entity officer is scoped by legal entity; everyone else as in the demo. */
export function multiEntityAccess(persona: Persona): EffectiveAccess | null {
  const access = effectiveAccessFor(persona);
  if (!access) return null;
  if (persona.id === ACCOUNTS_TWO.id) return { ...access, scopes: [{ type: 'legal_entity', ids: [SECOND_ENTITY] }] };
  return access;
}

const memory = () => {
  const m = new Map<string, string>();
  return { storage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }, raw: m };
};

/**
 * A browser session over the multi-entity Larkspur: one demo store, the developer section seeded for both
 * entities, and a transport whose identity (and header project) can be switched with `as`.
 */
export function multiEntityWorld() {
  const data = multiEntityDataset();
  const { storage, raw } = memory();
  const demo = new DemoStore(storage);
  demo.partition('tnt_larkspur').section(DEVELOPER_SECTION, () => seedDeveloperState(data, { ...ENTITY_PROFILES, [SECOND_ENTITY]: SECOND_ENTITY_PROFILE }));
  demo.save();
  const context = { personaId: 'manager', projectId: 'all' };
  const api = new MockTransport({
    getContext: () => ({ ...context }),
    getMode: () => 'fast',
    demo,
    personas: MULTI_ENTITY_PERSONAS,
    accessFor: multiEntityAccess,
    datasetFor: (tenantId) => (tenantId === 'tnt_larkspur' ? data : datasetFor(tenantId)),
  });
  return {
    api,
    demo,
    data,
    as(personaId: string, projectId = 'all') {
      context.personaId = personaId;
      context.projectId = projectId;
      return api;
    },
    /** The whole store as the browser keeps it (for "state unchanged" checks). */
    snapshot(): string {
      demo.save();
      return raw.get(DEMO_STORE_KEY) ?? '';
    },
  };
}
