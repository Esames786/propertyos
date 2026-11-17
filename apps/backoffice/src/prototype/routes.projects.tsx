import type { AccessTarget, UnitInventoryDetail } from '@repo/contracts';
import { ApiError, servesEdition } from '@repo/contracts';
import { ErrorState, NotFoundState, useApiQuery, useSession } from '@repo/ui';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { devRoute, DevScreen } from './dev-screen';
import { RegisterResolver } from './register';
import { Loading } from '../pages/society/kit';
import { PRJ, TARGETS } from '../pages/developer/projects/pkit';

/**
 * Gate E.2 area route module (PRJ-001…003, INV-001/002/008/010), registered once in E.0's
 * `routes.developer.tsx` (`DEVELOPER_AREAS`, Wave 1 integration). It lives in `prototype/` because INV-002's
 * register address redirects (pages may not import the router). Each screen serves developer organisations
 * (DEV edition) and needs its own permission; a person without it is told so in words (Gate B access outcome,
 * never data). The shell already checks every address (module, the header project's site, suspension, a
 * `?record=` id) and the mock API checks all of it again.
 */
const ProjectsList = lazy(() => import('../pages/developer/projects/ProjectsListPage'));
const Project360 = lazy(() => import('../pages/developer/projects/Project360Page'));
const ProjectSetup = lazy(() => import('../pages/developer/projects/ProjectSetupPage'));
const UnitMatrix = lazy(() => import('../pages/developer/projects/UnitMatrixPage'));
const LiveAvailability = lazy(() => import('../pages/developer/projects/LiveAvailabilityPage'));
const StorageInventory = lazy(() => import('../pages/developer/projects/StorageInventoryPage'));

const screen = (page: LazyExoticComponent<ComponentType>, target: AccessTarget) => <DevScreen page={page} target={target} refusal="outcome" fallback={<Loading lines={8} />} />;

/** INV-002's register address: the quick view opens over its project's unit matrix (`?record=<unit id>`). */
function QuickViewRoute() {
  const [params] = useSearchParams();
  const record = params.get('record');
  const { access, allows } = useSession();
  const served = servesEdition(access, 'DEV');
  const ok = served && allows(TARGETS.inventory);
  const q = useApiQuery<UnitInventoryDetail>(ok && record ? { method: 'GET', path: `/inventory/units/${record}` } : null, { retry: false });
  if (!served) return <RegisterResolver />;
  if (!ok) return screen(UnitMatrix, TARGETS.inventory);
  if (!record) return <Navigate to={PRJ.matrix()} replace />;
  if (q.isError) return q.error instanceof ApiError && q.error.problem.status === 404 ? <NotFoundState headingLevel={1} /> : <ErrorState error={q.error} />;
  if (!q.data) return <Loading lines={6} />;
  return <Navigate to={PRJ.matrix({ project: q.data.project.id, unit: q.data.id })} replace />;
}

export const PROJECT_ROUTES = [
  devRoute('prj/projects-list', screen(ProjectsList, TARGETS.projects), (t) => t('projects:list.title')),
  devRoute('prj/project-360-workspace', screen(Project360, TARGETS.projects), (t) => t('projects:p360.title')),
  // The setup page explains itself to readers without a setup permission (the server decides what they see).
  devRoute('prj/project-setup', screen(ProjectSetup, TARGETS.projects), (t) => t('projects:setup.title')),
];

export const INVENTORY_ROUTES = [
  devRoute('inv/unit-matrix', screen(UnitMatrix, TARGETS.inventory), (t) => t('projects:matrix.title')),
  devRoute('inv/unit-quick-view', <QuickViewRoute />, (t) => t('projects:matrix.title')),
  devRoute('inv/live-availability', screen(LiveAvailability, TARGETS.inventory), (t) => t('projects:availability.title')),
  devRoute('inv/storage-inventory', screen(StorageInventory, TARGETS.inventory), (t) => t('projects:storage.title')),
];
