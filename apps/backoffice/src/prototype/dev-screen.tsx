import { servesEdition, type AccessTarget, type DevEdition } from '@repo/contracts';
import { AccessOutcomeView, useSession } from '@repo/ui';
import { Suspense, type ComponentType, type LazyExoticComponent, type ReactElement, type ReactNode } from 'react';
import { LINKS } from '../nav.config';
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

/**
 * How a screen answers a person of a served edition whom its target refuses:
 * - `register` (E.0's default): the register's page at the same address, as before the screen existed;
 * - `outcome` (Wave 1 integration, Issue #25): the Gate B access-outcome page, which says in words why
 *   ("not part of your role", "not in your plan for this site") and shows no data. E.2, E.7 and E.13 built
 *   their screens this way; it is kept so their refusals are unchanged now that they route through here.
 * An organisation of an edition the screen does not serve always gets the register's page.
 */
export type DevRefusal = 'register' | 'outcome';

function Refused({ target }: { target: AccessTarget }) {
  const { decide, tenant, can } = useSession();
  const d = decide(target);
  if (d.allowed) return <RegisterResolver />;
  return <AccessOutcomeView reason={d.reason} {...(target.module ? { module: target.module } : {})} organisation={tenant.name} startHref={LINKS.start} {...(can('admin.view') ? { planHref: LINKS.plan } : {})} />;
}

/** A Gate E page: the edition, then the person's access, else the register's page (or the access outcome). */
export function DevScreen({ page: Page, target, edition = 'DEV', refusal = 'register', fallback = null }: { page: LazyExoticComponent<ComponentType>; target: AccessTarget; edition?: DevEdition; refusal?: DevRefusal; fallback?: ReactNode }) {
  const { access, allows } = useSession();
  if (!servesEdition(access, edition)) return <RegisterResolver />;
  return allows(target) ? (
    <Suspense fallback={fallback}>
      <Page />
    </Suspense>
  ) : refusal === 'outcome' ? (
    <Refused target={target} />
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
