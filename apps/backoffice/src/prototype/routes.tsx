import { LEADS } from '@repo/fixtures';
import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, useLoaderData, useParams, useSearchParams, type RouteObject } from 'react-router';
import TextGuidePage from '../pages/help/TextGuidePage';
import TourLibrary from '../pages/help/TourLibrary';
import WorkspaceLab from '../pages/lab/WorkspaceLab';
import PreferencesPage from '../pages/settings/PreferencesPage';
import { RouteError } from './RouteError';
import { CommandPaletteRoute } from './CommandPaletteRoute';
import { registerLoader, RegisterResolver, type RegisterData } from './register';
import type { RouteHandle } from './handle';
import { RootLayout } from './RootLayout';
import { StandaloneLayout } from './StandaloneLayout';

/**
 * Prototype route table (React Router 7, data mode). Pages are code-split and receive plain props;
 * everything router-specific stays in this folder, which the Inertia setup replaces later.
 */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });
const h = (handle: RouteHandle) => handle;

function TourLibraryRoute() {
  const { tourId } = useParams();
  return <TourLibrary autoStartTourId={tourId} />;
}

function TextGuideRoute() {
  const { tourId } = useParams();
  return <TextGuidePage tourId={tourId ?? ''} />;
}

function WorkspaceLabRoute() {
  const { leadId } = useLoaderData() as { leadId: string };
  return <WorkspaceLab leadId={leadId} />;
}

/** `/backoffice` (GUIDE-001 register route) → start page, keeping any query string. */
function StartRedirect() {
  const [params] = useSearchParams();
  return <Navigate to={`/backoffice/lab${params.size ? `?${params}` : ''}`} replace />;
}

const preferences = (tab: 'language' | 'accessibility' | 'tours'): RouteObject => ({
  element: <PreferencesPage defaultTab={tab} />,
  handle: h({ title: (t) => t('nav:pages.preferences'), helpKey: 'preferences' }),
});

const backofficeChildren: RouteObject[] = [
  { index: true, element: <StartRedirect /> },
  { path: 'lab', lazy: page(() => import('../pages/lab/LabHome')), handle: h({ title: (t) => t('nav:pages.lab'), helpKey: 'lab' }) },
  { path: 'lab/tokens', lazy: page(() => import('../pages/lab/TokensLab')), handle: h({ title: (t) => t('nav:pages.labTokens'), helpKey: 'lab' }) },
  { path: 'lab/components', lazy: page(() => import('../pages/lab/ComponentsLab')), handle: h({ title: (t) => t('nav:pages.labComponents'), helpKey: 'lab' }) },
  { path: 'lab/forms', lazy: page(() => import('../pages/lab/FormsLab')), handle: h({ title: (t) => t('nav:pages.labForms'), helpKey: 'forms' }) },
  {
    path: 'lab/workspace',
    // The prototype loader picks a fictional record; at the backend stage a controller supplies the same prop.
    loader: () => ({ leadId: LEADS.find((l) => l.projectId === 'prj_heights' && l.ownerPersonaId === 'sales')!.id }),
    element: <WorkspaceLabRoute />,
    handle: h({ title: (t) => t('nav:pages.labWorkspace'), helpKey: 'lab' }),
  },
  { path: 'lab/states', lazy: page(() => import('../pages/lab/StatesLab')), handle: h({ title: (t) => t('nav:pages.labStates'), helpKey: 'lab' }) },
  { path: 'help/tours', element: <TourLibraryRoute />, handle: h({ title: (t) => t('nav:pages.tourLibrary'), helpKey: 'tours' }) },
  { path: 'help/tours/:tourId', element: <TourLibraryRoute />, handle: h({ title: (t) => t('nav:pages.tourLibrary'), helpKey: 'tours' }) },
  { path: 'help/tours/:tourId/text', element: <TextGuideRoute />, handle: h({ title: (t) => t('nav:pages.tourLibrary'), helpKey: 'tours' }) },
  { path: 'help/practice', lazy: page(() => import('../pages/help/PracticeSandbox')), handle: h({ title: (t) => t('nav:pages.practice'), helpKey: 'tours' }) },
  { path: 'global/command-palette', element: <CommandPaletteRoute />, handle: h({ title: (t) => t('common:command.title'), helpKey: 'lab' }) },
  { path: 'global/quick-create', lazy: page(() => import('../pages/global/QuickCreatePage')), handle: h({ title: (t) => t('common:quickCreate.label') }) },
  { path: 'global/notifications', lazy: page(() => import('../pages/global/NotificationsPage')), handle: h({ title: (t) => t('nav:header.notifications') }) },
  { path: 'global/context-help', lazy: page(() => import('../pages/global/HelpPage')), handle: h({ title: (t) => t('help:drawerTitle') }) },
  { path: 'global/profile--preferences', ...preferences('language') },
  { path: 'global/language-switcher', ...preferences('language') },
  { path: 'global/accessibility-preferences', ...preferences('accessibility') },
  { path: 'settings/onboarding', ...preferences('tours') },
  {
    path: '*',
    loader: registerLoader,
    element: <RegisterResolver />,
    handle: h({ title: (t, data) => (data as RegisterData | undefined)?.screen?.name ?? t('nav:pages.notFound'), helpKey: 'planned' }),
  },
];

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/backoffice" replace /> },
  { path: '/backoffice', element: <RootLayout />, errorElement: <RouteError />, children: backofficeChildren },
  // SaaS HQ and staff sign-in screens are Stage 2; their register URLs resolve to planned pages.
  { path: '*', loader: registerLoader, element: <StandaloneLayout />, errorElement: <RouteError /> },
]);
