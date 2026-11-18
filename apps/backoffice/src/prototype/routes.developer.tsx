import type { RouteObject } from 'react-router';
import { routes as crmPipelineRoutes } from '../pages/developer/crm/routes';
import { routes as ledgerRoutes } from '../pages/developer/ledger/routes';
import { INVENTORY_ROUTES, PROJECT_ROUTES } from './routes.projects';
import { DOCUMENT_ROUTES, WORKSPACE_ROUTES } from './routes.workspace';
// Gate E.3 (integration candidate): pricing drafts and price history (INV-006, INV-007, COM-001…005).
import { routes as pricingRoutes } from '../pages/developer/pricing/routes';

/**
 * Gate E.0 deliverable 6: the one place Gate E areas register their screens (plan §7.4: "E.0 adds one
 * route module per area … each slice then edits only its own area module").
 *
 * **How an area plugs in (B–E at Wave 1 integration).** The area owns
 * `apps/backoffice/src/pages/developer/<area>/routes.tsx`, exporting `routes: RouteObject[]` built with
 * `devRoute` and wrapped in `DevScreen` / `DevRecord` (`./dev-screen`), at the register's addresses
 * (relative to `/backoffice`, e.g. `crm/opportunities-pipeline`). It then adds one import and one entry
 * below; `routes.tsx` already spreads `DEVELOPER_ROUTES` into the shell, so it is not edited again and its
 * existing blocks are never reordered. Addresses not registered here keep resolving to the register's
 * planned page through the `*` route.
 *
 *   import { routes as crmPipelineRoutes } from '../pages/developer/crm/routes';   // E.1
 *   { area: 'crm', routes: crmPipelineRoutes },
 *
 * Moving a row from PLANNED to PARTIAL/BUILT stays the area's own register adoption (`register.spec.ts`).
 */
export type DeveloperAreaKey = 'crm' | 'projects' | 'inventory' | 'ledger' | 'workspace' | 'documents' | 'pricing' | 'selling' | 'bookings' | 'accounts' | 'payables' | 'procurement' | 'construction' | 'handover' | 'reports';

export interface DeveloperArea {
  area: DeveloperAreaKey;
  routes: readonly RouteObject[];
}

/**
 * Registered areas. Wave 1 integration (Issue #25): the four Wave 1 slices, each registered here once (their
 * provisional hooks in `routes.tsx` are gone). Each area's screens are wrapped in `DevScreen` (edition, then
 * access). `tests/e2e/register.spec.ts` opens every register address; the integration's route audit
 * (docs/status/integration-e-wave1) checks one route per address, with no duplicate or shadowed path.
 */
export const DEVELOPER_AREAS: readonly DeveloperArea[] = [
  { area: 'crm', routes: crmPipelineRoutes }, // E.1: CRM-006…009, CRM-011
  { area: 'projects', routes: PROJECT_ROUTES }, // E.2: PRJ-001…003
  { area: 'inventory', routes: INVENTORY_ROUTES }, // E.2: INV-001/002/008/010
  { area: 'ledger', routes: ledgerRoutes }, // E.7: ACC-001…010, BANK-005
  { area: 'workspace', routes: WORKSPACE_ROUTES }, // E.13: GLOBAL-002/005/006, HOME-002/004/005
  { area: 'documents', routes: DOCUMENT_ROUTES }, // E.13: DOC-002…006
  // Gate E.3 (integration candidate)
  { area: 'pricing', routes: pricingRoutes }, // E.3: INV-006/007, COM-001…005
];

/** Every registered Gate E route, spread into the backoffice shell by `routes.tsx`. */
export const DEVELOPER_ROUTES: RouteObject[] = DEVELOPER_AREAS.flatMap((a) => [...a.routes]);
