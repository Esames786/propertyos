import { findScreenByRegisterRoute, type ScreenEntry } from '@repo/contracts/screens';
import { NotFoundState, PlannedScreenView } from '@repo/ui';
import { TextGuideView, TourLibraryView } from '@repo/ui/onboarding';
import type { ComponentType } from 'react';
import { createBrowserRouter, Navigate, useLoaderData, useParams, useSearchParams, type RouteObject } from 'react-router';
import { HQ } from '../nav.config';
import type { RouteHandle } from './handle';
import { RootLayout } from './RootLayout';
import { HqSignIn, ShellLayout } from './ShellLayout';

/** HQ pages are code-split; each route loads its page on first visit. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });
const h = (handle: RouteHandle) => handle;

interface RegisterData {
  screen: ScreenEntry | null;
  record: string | null;
}

function registerLoader({ request }: { request: Request }): RegisterData {
  const url = new URL(request.url);
  return { screen: findScreenByRegisterRoute(url.pathname) ?? null, record: url.searchParams.get('record') };
}

/** Register addresses of HQ screens not built yet: an intentional planned page, never a 404. */
function RegisterResolver() {
  const data = useLoaderData() as RegisterData;
  return data.screen ? <PlannedScreenView screen={data.screen} record={data.record} startHref={HQ.dashboard} /> : <NotFoundState headingLevel={1} />;
}

/** Pages that take the tenant id from the address (the page itself stays router-free). */
const withTenantId = (load: () => Promise<{ default: ComponentType<{ id: string }> }>) => async () => {
  const { default: Page } = await load();
  return {
    Component: function TenantRoute() {
      const { id } = useParams();
      return <Page id={id ?? ''} />;
    },
  };
};

function SignInRoute() {
  const [params] = useSearchParams();
  return <HqSignIn next={params.get('next') ?? undefined} />;
}

function TourLibraryRoute() {
  const { tourId } = useParams();
  return <TourLibraryView {...(tourId ? { autoStartTourId: tourId } : {})} />;
}

function TextGuideRoute() {
  const { tourId } = useParams();
  return <TextGuideView tourId={tourId ?? ''} />;
}

const shellChildren: RouteObject[] = [
  { index: true, lazy: page(() => import('../pages/dashboard/HqDashboard')), handle: h({ title: (t) => t('platform:pages.dashboard') }) },
  { path: 'tenants', lazy: page(() => import('../pages/tenants/TenantsPage')), handle: h({ title: (t) => t('platform:pages.tenants') }) },
  { path: 'tenants/new', lazy: page(() => import('../pages/create/CreateTenantPage')), handle: h({ title: (t) => t('platform:pages.createTenant') }) },
  { path: 'tenants/:id', lazy: withTenantId(() => import('../pages/tenant360/Tenant360Page')), handle: h({ title: (t) => t('platform:pages.tenant360') }) },
  { path: 'tenants/:id/preview', lazy: withTenantId(() => import('../pages/preview/PreviewPage')), handle: h({ title: (t) => t('platform:preview.title') }) },
  { path: 'tenants/:id/contracts/new', lazy: withTenantId(() => import('../pages/amend/AmendContractPage')), handle: h({ title: (t) => t('platform:pages.amend') }) },
  { path: 'catalogue', lazy: page(() => import('../pages/config/CataloguePage')), handle: h({ title: (t) => t('platform:pages.catalogue') }) },
  { path: 'rate-cards', lazy: page(() => import('../pages/config/RateCardsPage')), handle: h({ title: (t) => t('platform:pages.rateCards') }) },
  { path: 'policies', lazy: page(() => import('../pages/config/PoliciesPage')), handle: h({ title: (t) => t('platform:pages.policies') }) },
  { path: 'requests', lazy: page(() => import('../pages/config/RequestsPage')), handle: h({ title: (t) => t('platform:pages.requests') }) },
  { path: 'audit', lazy: page(() => import('../pages/config/AuditPage')), handle: h({ title: (t) => t('platform:pages.audit') }) },
  { path: 'simulator', lazy: page(() => import('../pages/simulator/SimulatorPage')), handle: h({ title: (t) => t('platform:pages.simulator') }) },
  { path: 'more', lazy: page(() => import('../pages/more/HqMorePage')), handle: h({ title: (t) => t('nav:pages.more') }) },
  { path: 'preferences', lazy: page(() => import('../pages/settings/PreferencesPage')), handle: h({ title: (t) => t('nav:pages.preferences'), helpKey: 'preferences' }) },
  { path: 'help/tours', element: <TourLibraryRoute />, handle: h({ title: (t) => t('nav:pages.tourLibrary'), helpKey: 'tours' }) },
  { path: 'help/tours/:tourId', element: <TourLibraryRoute />, handle: h({ title: (t) => t('nav:pages.tourLibrary'), helpKey: 'tours' }) },
  { path: 'help/tours/:tourId/text', element: <TextGuideRoute />, handle: h({ title: (t) => t('nav:pages.tourLibrary'), helpKey: 'tours' }) },
  {
    path: '*',
    loader: registerLoader,
    element: <RegisterResolver />,
    handle: h({ title: (t, d) => (d as RegisterData | undefined)?.screen?.name ?? t('nav:pages.notFound'), helpKey: 'planned' }),
  },
];

const routes: RouteObject[] = [
  { path: '/', element: <Navigate to={HQ.dashboard} replace /> },
  {
    path: '/hq',
    element: <RootLayout />,
    children: [
      { path: 'sign-in', element: <SignInRoute /> },
      { element: <ShellLayout />, children: shellChildren },
    ],
  },
  { path: '*', element: <NotFoundState headingLevel={1} /> },
];

export const router = createBrowserRouter(routes);
