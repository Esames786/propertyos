import type { RouteObject } from 'react-router';

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

/** Registered areas (none in E.0: it adds no screens). */
export const DEVELOPER_AREAS: readonly DeveloperArea[] = [];

/** Every registered Gate E route, spread into the backoffice shell by `routes.tsx`. */
export const DEVELOPER_ROUTES: RouteObject[] = DEVELOPER_AREAS.flatMap((a) => [...a.routes]);
