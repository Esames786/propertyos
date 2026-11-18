import type { Permission, Persona } from '@repo/contracts';

/**
 * Gate E.3 local validation (Issue #33, Wave 2 Agent 2): **test-only** pricing principals.
 *
 * Owner decisions E-07 / E-30 (who may draft prices, and under which maker-checker rule) are still open, so
 * no demo role or persona holds `pricing.manage` (conservative default). These principals exist so the
 * positive E.3 journeys can be exercised at all. They are deliberately:
 *
 * - **not** in `PERSONAS` / `ALL_PERSONAS` (the demo's identities) and not exported from `@repo/fixtures`;
 * - **unlisted**, so even where they are loaded the demo sign-in page never offers them;
 * - holders of **no role** (`roleId` absent): no role template, starter role or ERP role gains anything;
 * - in the browser, compiled **only** into a build made with `PROPERTYOS_E2E_PRINCIPALS=1` (Playwright's own
 *   build, see `playwright.config.ts`): only there does `apps/backoffice/vite.config.ts` resolve the backoffice's
 *   empty `prototype/build-personas` to a module that imports them (Wave 2 integration). No other build imports
 *   this module at all, so neither its files nor its sourcemaps name them (`scripts/check-test-principals.mjs`).
 *   The shipped demo cannot sign in as them, by any page or by a stored session naming them.
 *
 * Their ids use the `res_${string}` branch of `Persona['id']` (the pattern E.0's `multientity.fixture.ts` and
 * GPT's E.3 API suites use for test principals); they are backoffice staff (`app: 'backoffice'`, no party).
 */
const BASE: readonly Permission[] = ['project.context.use', 'unit.view', 'pricing.manage'];

const principal = (id: `res_e3qa_${string}`, principalId: string, displayName: string, tenantId: string, permissions: readonly Permission[], projectScope: Persona['projectScope']): Persona => ({
  id,
  tenantId,
  app: 'backoffice',
  principalId,
  displayName,
  roleKey: 'common:roles.inventory',
  email: `${principalId}@example.test`,
  permissions,
  projectScope,
  unlisted: true,
});

/** Larkspur, every project: the positive create / revise / retry journeys. */
export const E3QA_PRICING = /* @__PURE__ */ principal('res_e3qa_pricing', 'usr_e3qa_pricing', 'E3 QA Pricing Tester (test only)', 'tnt_larkspur', BASE, 'all');
/** Another Larkspur person with the same rights: drafts are private to their creator. */
export const E3QA_PRICING_PEER = /* @__PURE__ */ principal('res_e3qa_pricing_peer', 'usr_e3qa_pricing_peer', 'E3 QA Pricing Peer (test only)', 'tnt_larkspur', BASE, 'all');
/** Larkspur Heights only: project isolation (Gardens ids answer exactly like unknown ids). */
export const E3QA_PRICING_HEIGHTS = /* @__PURE__ */ principal('res_e3qa_pricing_heights', 'usr_e3qa_pricing_heights', 'E3 QA Pricing Heights (test only)', 'tnt_larkspur', BASE, ['prj_heights']);
/** The same person as `E3QA_PRICING` after `pricing.manage` was taken away (revocation in the browser). */
export const E3QA_PRICING_REVOKED = /* @__PURE__ */ principal('res_e3qa_pricing_revoked', 'usr_e3qa_pricing', 'E3 QA Pricing Tester (test only)', 'tnt_larkspur', ['project.context.use', 'unit.view'], 'all');
/** Crescent Bay (another developer tenant) with the same rights: tenant isolation. */
export const E3QA_PRICING_CRESCENT = /* @__PURE__ */ principal('res_e3qa_cb_pricing', 'usr_e3qa_cb_pricing', 'E3 QA Crescent Pricing (test only)', 'tnt_crescent', BASE, 'all');

export const E3QA_TEST_PRINCIPALS: readonly Persona[] = [E3QA_PRICING, E3QA_PRICING_PEER, E3QA_PRICING_HEIGHTS, E3QA_PRICING_REVOKED, E3QA_PRICING_CRESCENT];
