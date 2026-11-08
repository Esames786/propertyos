import type { AccessTarget, UnitInventoryDetail } from '@repo/contracts';
import { ApiError } from '@repo/contracts';
import { AccessOutcomeView, ErrorState, NotFoundState, useApiQuery, useSession } from '@repo/ui';
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Navigate, useSearchParams, type RouteObject } from 'react-router';
import { LINKS } from '../nav.config';
import type { RouteHandle } from './handle';
import { registerLoader } from './register';
import { Loading } from '../pages/society/kit';
import { PRJ, TARGETS } from '../pages/developer/projects/pkit';

/**
 * Gate E.2 area route module (provisional; reconcile with E.0's edition-aware `DevScreen` wrappers at
 * Wave 1 integration). The shell already checks every address (module, the header project's site,
 * suspension, and a `?record=` id); each screen here then needs its own permission, and a person
 * without it is told so in words (never shown data). The mock API checks all of it again.
 */
const ProjectsList = lazy(() => import('../pages/developer/projects/ProjectsListPage'));
const Project360 = lazy(() => import('../pages/developer/projects/Project360Page'));
const ProjectSetup = lazy(() => import('../pages/developer/projects/ProjectSetupPage'));
const UnitMatrix = lazy(() => import('../pages/developer/projects/UnitMatrixPage'));
const LiveAvailability = lazy(() => import('../pages/developer/projects/LiveAvailabilityPage'));
const StorageInventory = lazy(() => import('../pages/developer/projects/StorageInventoryPage'));

function Screen({ page: Page, target }: { page: LazyExoticComponent<ComponentType>; target: AccessTarget }) {
  const { decide, tenant, can } = useSession();
  const decision = decide(target);
  if (!decision.allowed) return <AccessOutcomeView reason={decision.reason} {...(target.module ? { module: target.module } : {})} organisation={tenant.name} startHref={LINKS.start} {...(can('admin.view') ? { planHref: LINKS.plan } : {})} />;
  return (
    <Suspense fallback={<Loading lines={8} />}>
      <Page />
    </Suspense>
  );
}

/** INV-002's register address: the quick view opens over its project's unit matrix (`?record=<unit id>`). */
function QuickViewRoute() {
  const [params] = useSearchParams();
  const record = params.get('record');
  const { allows } = useSession();
  const ok = allows(TARGETS.inventory);
  const q = useApiQuery<UnitInventoryDetail>(ok && record ? { method: 'GET', path: `/inventory/units/${record}` } : null, { retry: false });
  if (!ok) return <Screen page={UnitMatrix} target={TARGETS.inventory} />;
  if (!record) return <Navigate to={PRJ.matrix()} replace />;
  if (q.isError) return q.error instanceof ApiError && q.error.problem.status === 404 ? <NotFoundState headingLevel={1} /> : <ErrorState error={q.error} />;
  if (!q.data) return <Loading lines={6} />;
  return <Navigate to={PRJ.matrix({ project: q.data.project.id, unit: q.data.id })} replace />;
}

const h = (handle: RouteHandle) => handle;

export const PROJECT_ROUTES: RouteObject[] = [
  { path: 'prj/projects-list', loader: registerLoader, element: <Screen page={ProjectsList} target={TARGETS.projects} />, handle: h({ title: (t) => t('projects:list.title') }) },
  { path: 'prj/project-360-workspace', loader: registerLoader, element: <Screen page={Project360} target={TARGETS.projects} />, handle: h({ title: (t) => t('projects:p360.title') }) },
  // The setup page explains itself to readers without a setup permission (the server decides what they see).
  { path: 'prj/project-setup', loader: registerLoader, element: <Screen page={ProjectSetup} target={TARGETS.projects} />, handle: h({ title: (t) => t('projects:setup.title') }) },
];

export const INVENTORY_ROUTES: RouteObject[] = [
  { path: 'inv/unit-matrix', loader: registerLoader, element: <Screen page={UnitMatrix} target={TARGETS.inventory} />, handle: h({ title: (t) => t('projects:matrix.title') }) },
  { path: 'inv/unit-quick-view', loader: registerLoader, element: <QuickViewRoute />, handle: h({ title: (t) => t('projects:matrix.title') }) },
  { path: 'inv/live-availability', loader: registerLoader, element: <Screen page={LiveAvailability} target={TARGETS.inventory} />, handle: h({ title: (t) => t('projects:availability.title') }) },
  { path: 'inv/storage-inventory', loader: registerLoader, element: <Screen page={StorageInventory} target={TARGETS.inventory} />, handle: h({ title: (t) => t('projects:storage.title') }) },
];
