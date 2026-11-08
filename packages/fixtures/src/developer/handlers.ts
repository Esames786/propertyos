import type { DevApprovalPolicyVersion, DevCollectionAccount, DevCostCentre, DevLegalEntity, DevNumberingSeries } from '@repo/contracts';
import { notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { costCentreVisible, entityVisible, requireEntity, type ScopeNeed } from './scope';
import { developerState } from './state';

/**
 * Gate E.0 deliverable 6 (mock API): the developer ERP's handler registration point.
 *
 * **How an area plugs in (B–E at Wave 1 integration).** Each area keeps its handlers in its own folder,
 * `packages/fixtures/src/developer/<area>/handlers.ts`, exporting one `readonly Handler[]`, and adds one
 * import and one entry to `DEVELOPER_AREA_HANDLERS` below. Nothing else in `handlers.ts` changes:
 * `HANDLERS` already includes `DEVELOPER_HANDLERS`. Every handler declares `requires(...)` and follows
 * the §4.2 order of checks; use `developer/scope.ts` for record scope, `idempotency.ts` for creates and
 * `projection.ts` for embedded history.
 *
 * The core endpoints here serve the administration data seeded read-only (E-37) to whoever needs a
 * picker or a label; none changes anything. Another kind of organisation has no developer state: lists
 * come back empty, and an entity named in the query is not found.
 */

const entityQuery = (ctx: HandlerContext) => {
  const v = ctx.req.query?.entity;
  return v === undefined || v === '' ? undefined : String(v);
};

/** The entities a list covers: one named entity (404 when hidden or unknown), else every visible one. */
function entitiesFor(ctx: HandlerContext, need: ScopeNeed): string[] {
  const named = entityQuery(ctx);
  const state = developerState(ctx);
  if (named !== undefined) {
    // Hidden, unknown and another organisation's entity all answer alike.
    if (!state?.legalEntities.some((e) => e.id === named)) notFound(ctx);
    return [requireEntity(ctx, named, need)];
  }
  return state ? state.legalEntities.map((e) => e.id).filter((id) => entityVisible(ctx, id, need)) : [];
}

const LEDGER: ScopeNeed = { module: 'accounting', permission: 'gl.view' };
const BANK: ScopeNeed = { module: 'banking', permission: 'bank.view' };
const CORE: ScopeNeed = { module: 'core' };

/** Who may read the approval policies of Wave 1 subjects: their makers and checkers. */
const POLICY_READERS = ['project.manage', 'project.approve', 'gl.manage', 'gl.approve', 'journal.create', 'journal.approve', 'gl.post', 'bank.import', 'bank.import.approve', 'document_template.manage', 'document_template.approve'] as const;

export const DEVELOPER_CORE_HANDLERS: readonly Handler[] = [
  {
    // Legal entities as a picker and label (names and codes only).
    method: 'GET',
    pattern: /^\/developer\/legal-entities$/,
    access: requires('core', ['project.view', 'gl.view', 'bank.view'], 'history_read'),
    handle: (ctx): DevLegalEntity[] => {
      const state = developerState(ctx);
      return state ? state.legalEntities.filter((e) => entityVisible(ctx, e.id, CORE)) : [];
    },
  },
  {
    method: 'GET',
    pattern: /^\/developer\/cost-centres$/,
    access: requires('accounting', 'gl.view', 'history_read'),
    handle: (ctx): DevCostCentre[] => {
      const ids = entitiesFor(ctx, LEDGER);
      const state = developerState(ctx);
      return state ? state.costCentres.filter((c) => ids.includes(c.legalEntityId) && costCentreVisible(ctx, state, c.id, LEDGER)) : [];
    },
  },
  {
    method: 'GET',
    pattern: /^\/developer\/numbering$/,
    access: requires('accounting', 'gl.view', 'history_read'),
    handle: (ctx): DevNumberingSeries[] => {
      const ids = entitiesFor(ctx, LEDGER);
      return developerState(ctx)?.numbering.filter((n) => ids.includes(n.legalEntityId)) ?? [];
    },
  },
  {
    // Verified collection accounts: masked numbers only, and only for people who may see bank records.
    method: 'GET',
    pattern: /^\/developer\/collection-accounts$/,
    access: requires('banking', 'bank.view', 'history_read'),
    handle: (ctx): DevCollectionAccount[] => {
      const ids = entitiesFor(ctx, BANK);
      return developerState(ctx)?.collectionAccounts.filter((a) => ids.includes(a.legalEntityId)) ?? [];
    },
  },
  {
    method: 'GET',
    pattern: /^\/developer\/approval-policies$/,
    access: requires('core', POLICY_READERS, 'history_read'),
    handle: (ctx): DevApprovalPolicyVersion[] => {
      const ids = entitiesFor(ctx, CORE);
      return developerState(ctx)?.approvalPolicies.filter((p) => ids.includes(p.legalEntityId)) ?? [];
    },
  },
];

/**
 * One entry per Gate E area, added at Wave 1 integration (and by later waves), for example:
 *   import { CRM_PIPELINE_HANDLERS } from './crm/handlers';      // E.1
 *   import { INVENTORY_HANDLERS } from './inventory/handlers';   // E.2
 *   import { LEDGER_HANDLERS } from './ledger/handlers';         // E.7
 *   import { DOCUMENT_HANDLERS } from './documents/handlers';    // E.13
 */
export const DEVELOPER_AREA_HANDLERS: ReadonlyArray<readonly Handler[]> = [];

export const DEVELOPER_HANDLERS: readonly Handler[] = [...DEVELOPER_CORE_HANDLERS, ...DEVELOPER_AREA_HANDLERS.flat()];
