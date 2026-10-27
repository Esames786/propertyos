import { findScreen, findScreenByRegisterRoute, type ScreenEntry } from '@repo/contracts/screens';
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

/** HQ-004 Tenant 360 is next in Gate B; its address works today and points back to the summary. */
function Tenant360Planned() {
  const { id } = useParams();
  const screen = findScreen('HQ-004')!;
  return <PlannedScreenView screen={screen} record={id ?? null} startHref={HQ.dashboard} secondary={id ? { label: screen.name, href: HQ.tenant(id) } : undefined} />;
}

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
  { path: 'tenants/:id', element: <Tenant360Planned />, handle: h({ title: () => findScreen('HQ-004')!.name, helpKey: 'planned' }) },
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
