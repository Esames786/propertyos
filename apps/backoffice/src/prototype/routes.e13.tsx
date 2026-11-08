import { lazy, type ComponentType } from 'react';
import { Navigate, useSearchParams, type RouteObject } from 'react-router';
import { DocumentsScreen } from '../pages/developer/documents/dkit';
import type { RouteHandle } from './handle';

/**
 * Gate E.13 (provisional; reconcile with E.0 at Wave 1 integration): the slice's local route module,
 * mounted by one hook in routes.tsx (pages stay router-agnostic, ADR-0001 §2.3; E.0's edition-aware
 * per-area route modules replace this file).
 * - The connected workspace (GLOBAL-002/005/006, HOME-002/004/005) is open to every signed-in office
 *   member: each screen's data is filtered per record by the server; the routes add no access of their own.
 * - Documents (DOC-002…006) need `document.view`; each document is then checked against its linked record.
 */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });
const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => async () => ({ Component: (await load())[name] });
const h = (handle: RouteHandle) => handle;

export const WORKSPACE_ROUTES: RouteObject[] = [
  { path: 'global/unified-search-results', lazy: page(() => import('../pages/developer/workspace/UnifiedSearchPage')), handle: h({ title: (t) => t('workspace:hub.search.title') }) },
  { path: 'global/recent-records', lazy: named(() => import('../pages/developer/workspace/SavedListPages'), 'RecentRecordsPage'), handle: h({ title: (t) => t('workspace:hub.recent.title') }) },
  { path: 'global/favorites', lazy: named(() => import('../pages/developer/workspace/SavedListPages'), 'FavouritesPage'), handle: h({ title: (t) => t('workspace:hub.favourites.title') }) },
  { path: 'home/my-tasks', lazy: named(() => import('../pages/developer/workspace/TaskPages'), 'MyTasksPage'), handle: h({ title: (t) => t('workspace:hub.tasks.title') }) },
  { path: 'home/work-queue', lazy: named(() => import('../pages/developer/workspace/TaskPages'), 'WorkQueuePage'), handle: h({ title: (t) => t('workspace:hub.queue.title') }) },
  { path: 'home/recent-activity', lazy: page(() => import('../pages/developer/workspace/RecentActivityPage')), handle: h({ title: (t) => t('workspace:hub.activity.title') }) },
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
  { path: 'doc/document-preview', element: <DocumentsScreen page={Preview} />, handle: h({ title: (t) => t('documents:finder.title') }) },
  { path: 'doc/upload-drawer', element: <UploadDrawerRoute /> },
  { path: 'doc/document-versions', element: <DocumentsScreen page={Versions} />, handle: h({ title: (t) => t('documents:versions.finderTitle') }) },
  { path: 'doc/expiring-documents', element: <DocumentsScreen page={Expiring} />, handle: h({ title: (t) => t('documents:expiring.title') }) },
  { path: 'doc/templates-and-policies', element: <DocumentsScreen page={Templates} />, handle: h({ title: (t) => t('documents:templates.title') }) },
];
