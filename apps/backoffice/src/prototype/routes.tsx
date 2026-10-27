import { LEADS } from '@repo/fixtures';
import { DemoSignIn, Link, useT } from '@repo/ui';
import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, useLoaderData, useNavigate, useParams, useSearchParams, type RouteObject } from 'react-router';
import TextGuidePage from '../pages/help/TextGuidePage';
import TourLibrary from '../pages/help/TourLibrary';
import WorkspaceLab from '../pages/lab/WorkspaceLab';
import PreferencesPage from '../pages/settings/PreferencesPage';
import { LINKS } from '../nav.config';
import { RouteError } from './RouteError';
import { CommandPaletteRoute } from './CommandPaletteRoute';
import { registerLoader, RegisterResolver, type RegisterData } from './register';
import type { RouteHandle } from './handle';
import { RootLayout } from './RootLayout';
import { ShellLayout } from './ShellLayout';
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

/** `/backoffice` (GUIDE-001 register route) → start page (HOME-001 dashboard), keeping any query string. */
function StartRedirect() {
  const [params] = useSearchParams();
  return <Navigate to={`${LINKS.start}${params.size ? `?${params}` : ''}`} replace />;
}

/** Where to go after entry: the address the visitor originally asked for, if it is inside the backoffice. */
export function useNextHref(): string {
  const [params] = useSearchParams();
  const next = params.get('next');
  return next && next.startsWith('/backoffice/') && !next.startsWith('/backoffice/get-started') && !next.startsWith('/backoffice/sign-in') ? next : LINKS.start;
}

/** Returning visitors pick a demo identity; new visitors are pointed to Get started. */
function SignInRoute() {
  const { t } = useT();
  const navigate = useNavigate();
  const next = useNextHref();
  return (
    <DemoSignIn
      appName={t('common:app.backoffice')}
      onSignedIn={() => navigate(next, { replace: true })}
      footer={
        <p className="text-center text-sm text-muted">
          {t('start:signIn.newHere')}{' '}
          <Link href={LINKS.getStarted} data-testid="sign-in-get-started">
            {t('start:signIn.getStarted')}
          </Link>
        </p>
      }
    />
  );
}

const preferences = (tab: 'language' | 'accessibility' | 'tours'): RouteObject => ({
  element: <PreferencesPage defaultTab={tab} />,
  handle: h({ title: (t) => t('nav:pages.preferences'), helpKey: 'preferences' }),
});

const shellChildren: RouteObject[] = [
  { index: true, element: <StartRedirect /> },
  {
    path: 'home/role-aware-dashboard',
    lazy: page(() => import('../pages/home/ManagementDashboard')),
    handle: h({ title: (t) => t('nav:pages.dashboard') }),
  },
  { path: 'crm/sales-home', lazy: page(() => import('../pages/crm/SalesHome')), handle: h({ title: (t) => t('nav:pages.salesHome') }) },
  { path: 'crm/leads-list', lazy: page(() => import('../pages/crm/LeadsList')), handle: h({ title: (t) => t('nav:pages.leadsList') }) },
  { path: 'crm/lead-360-workspace', lazy: page(() => import('../pages/crm/LeadWorkspace')), handle: h({ title: (t) => t('nav:pages.leadWorkspace') }) },
  // Drawer screens from the register open over Sales home (deep-linkable ?drawer=…).
  { path: 'crm/new-lead-drawer', element: <Navigate to={`${LINKS.salesHome}?drawer=new-lead`} replace /> },
  { path: 'crm/schedule-visit-drawer', element: <Navigate to={`${LINKS.salesHome}?drawer=schedule-visit`} replace /> },
  { path: 'more', lazy: page(() => import('../pages/more/MorePage')), handle: h({ title: (t) => t('nav:pages.more') }) },
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

/** Entry routes render without the shell and without a signed-in identity. */
const entryChildren: RouteObject[] = [
  { path: 'get-started', lazy: page(() => import('../pages/start/GetStartedPage')) },
  { path: 'get-started/demo', lazy: page(() => import('../pages/start/DemoLaunchPage')) },
  { path: 'get-started/setup', lazy: page(() => import('../pages/start/WorkspaceSetupPage')) },
  { path: 'sign-in', element: <SignInRoute /> },
];

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/backoffice" replace /> },
  {
    path: '/backoffice',
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [...entryChildren, { element: <ShellLayout />, children: shellChildren }],
  },
  // SaaS HQ and staff sign-in screens are Stage 2; their register URLs resolve to planned pages.
  { path: '*', loader: registerLoader, element: <StandaloneLayout />, errorElement: <RouteError /> },
]);
