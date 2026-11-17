import type { AccessTarget } from '@repo/contracts';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { Navigate, useSearchParams, type RouteObject } from 'react-router';
import { devRoute, DevScreen } from './dev-screen';

/**
 * Gate E.13 area route modules, registered once in E.0's `routes.developer.tsx` (`DEVELOPER_AREAS`, Wave 1
 * integration). They live in `prototype/` because DOC-003's register address redirects (pages may not import
 * the router; ADR-0001 §2.3). Every screen serves every edition (the register's ALL).
 * - The connected workspace (GLOBAL-002/005/006, HOME-002/004/005) is open to every signed-in office
 *   member (the core module, readable even while suspended): each screen's data is filtered per record by
 *   the server.
 * - Documents (DOC-002…006) need `document.view` (anyone else is told so in words, the Gate B access
 *   outcome); each document is then checked against its linked record.
 */
const WORKSPACE: AccessTarget = { module: 'core', suspension: 'history_read' };
const DOCUMENTS: AccessTarget = { module: 'core', permission: 'document.view' };

const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => lazy(async () => ({ default: (await load())[name] }));
const hub = (page: LazyExoticComponent<ComponentType>) => <DevScreen page={page} target={WORKSPACE} edition="ALL" />;
const doc = (page: LazyExoticComponent<ComponentType>) => <DevScreen page={page} target={DOCUMENTS} edition="ALL" refusal="outcome" />;

const UnifiedSearch = lazy(() => import('../pages/developer/workspace/UnifiedSearchPage'));
const RecentRecords = named(() => import('../pages/developer/workspace/SavedListPages'), 'RecentRecordsPage');
const Favourites = named(() => import('../pages/developer/workspace/SavedListPages'), 'FavouritesPage');
const MyTasks = named(() => import('../pages/developer/workspace/TaskPages'), 'MyTasksPage');
const WorkQueue = named(() => import('../pages/developer/workspace/TaskPages'), 'WorkQueuePage');
const RecentActivity = lazy(() => import('../pages/developer/workspace/RecentActivityPage'));

export const WORKSPACE_ROUTES = [
  devRoute('global/unified-search-results', hub(UnifiedSearch), (t) => t('workspace:hub.search.title')),
  devRoute('global/recent-records', hub(RecentRecords), (t) => t('workspace:hub.recent.title')),
  devRoute('global/favorites', hub(Favourites), (t) => t('workspace:hub.favourites.title')),
  devRoute('home/my-tasks', hub(MyTasks), (t) => t('workspace:hub.tasks.title')),
  devRoute('home/work-queue', hub(WorkQueue), (t) => t('workspace:hub.queue.title')),
  devRoute('home/recent-activity', hub(RecentActivity), (t) => t('workspace:hub.activity.title')),
];

const Preview = lazy(() => import('../pages/developer/documents/DocumentPreviewPage'));
const Versions = lazy(() => import('../pages/developer/documents/DocumentVersionsPage'));
const Expiring = lazy(() => import('../pages/developer/documents/ExpiringDocumentsPage'));
const Templates = lazy(() => import('../pages/developer/documents/TemplatesPage'));

/** DOC-003's register address opens the upload drawer over the documents list (its `for` record kept). */
function UploadDrawerRoute() {
  const [params] = useSearchParams();
  const forId = params.get('for');
  return <Navigate to={`/backoffice/doc/document-preview?drawer=upload${forId ? `&for=${encodeURIComponent(forId)}` : ''}`} replace />;
}

export const DOCUMENT_ROUTES: RouteObject[] = [
  devRoute('doc/document-preview', doc(Preview), (t) => t('documents:finder.title')),
  // A redirect only (no page, so no title of its own): the documents list checks access again.
  { path: 'doc/upload-drawer', element: <UploadDrawerRoute /> },
  devRoute('doc/document-versions', doc(Versions), (t) => t('documents:versions.finderTitle')),
  devRoute('doc/expiring-documents', doc(Expiring), (t) => t('documents:expiring.title')),
  devRoute('doc/templates-and-policies', doc(Templates), (t) => t('documents:templates.title')),
];
