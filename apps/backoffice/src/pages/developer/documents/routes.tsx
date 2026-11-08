import { lazy } from 'react';
import { Navigate, useSearchParams, type RouteObject } from 'react-router';
import type { RouteHandle } from '../../../prototype/handle';
import { DocumentsScreen } from './dkit';

/**
 * Gate E.13 local route module for documents (provisional; mounted by one hook in prototype/routes.tsx
 * until E.0's edition-aware route modules land). DOC-002…006 need `document.view`; each document is
 * then checked against its linked record by the server.
 */
const h = (handle: RouteHandle) => handle;
const Preview = lazy(() => import('./DocumentPreviewPage'));
const Versions = lazy(() => import('./DocumentVersionsPage'));
const Expiring = lazy(() => import('./ExpiringDocumentsPage'));
const Templates = lazy(() => import('./TemplatesPage'));

/** DOC-003's register address opens the upload drawer over the documents list (deep link kept). */
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
