import { servesEdition, type AccessTarget, type DevEdition } from '@repo/contracts';
import { useSession } from '@repo/ui';
import { Suspense, type ComponentType, type LazyExoticComponent, type ReactElement } from 'react';
import { useSearchParams, type RouteObject } from 'react-router';
import type { RouteHandle } from './handle';
import { registerLoader, RegisterResolver } from './register';

/**
 * Gate E.0 deliverable 6: edition-aware route wrappers for the developer ERP, mirroring `OpsScreen` /
 * `S1Record` in `routes.tsx`. A Gate E screen renders only for an organisation of an edition it serves
 * (DEV by default; DEV+COMM or ALL per the register's `tenant_edition`) and for a person the target
 * allows (module, feature, permission, site, suspension class). Anyone else gets the register's page at
 * the same address (planned, or the access outcome), exactly as before the screen existed: nothing
 * unfinished looks finished, and the server refuses the same way.
 *
 * Area route modules (`pages/developer/<area>/routes.tsx`) build their routes with `devRoute`, wrapping
 * pages in `DevScreen` (no record) or `DevRecord` (`?record=<id>`), and register them in
 * `routes.developer.tsx`.
 */

/** A Gate E page: the edition, then the person's access, else the register's page. */
export function DevScreen({ page: Page, target, edition = 'DEV' }: { page: LazyExoticComponent<ComponentType>; target: AccessTarget; edition?: DevEdition }) {
  const { access, allows } = useSession();
  return servesEdition(access, edition) && allows(target) ? (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  ) : (
    <RegisterResolver />
  );
}

/**
 * A Gate E record screen addressed by `?record=<id>` (the id must carry the area's prefix). The page loads
 * the record from the API, which answers an out-of-scope id exactly like one never issued (404).
 */
export function DevRecord({ page: Page, target, prefix, edition = 'DEV' }: { page: LazyExoticComponent<ComponentType<{ id: string }>>; target: AccessTarget; prefix: string; edition?: DevEdition }) {
  const { access, allows } = useSession();
  const [params] = useSearchParams();
  const record = params.get('record');
  return servesEdition(access, edition) && allows(target) && record?.startsWith(prefix) ? (
    <Suspense fallback={null}>
      <Page id={record} />
    </Suspense>
  ) : (
    <RegisterResolver />
  );
}

/** A register address served by a Gate E screen: the register loader (for the planned or outcome page) and the title. */
export const devRoute = (path: string, element: ReactElement, title: RouteHandle['title']): RouteObject => ({ path, loader: registerLoader, element, handle: { title } satisfies RouteHandle });
