import { findScreenByRegisterRoute } from '@repo/contracts/screens';
import { INVOICES, UNITS } from '@repo/fixtures';
import { LocaleToggle, NavigationProvider, NotFoundState, PlannedScreenView, useT } from '@repo/ui';
import { useCallback, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, useHref, useLoaderData, useLocation, useNavigate, type RouteObject } from 'react-router';
import AccessibilityPreferencesPage from '../pages/AccessibilityPreferencesPage';
import CustomerLab, { type CustomerLabProps } from '../pages/CustomerLab';
import { START } from '../nav.config';
import { RootLayout, type CustomerHandle } from './RootLayout';

/** Portal pages are code-split: each route loads its page on first visit (keeps the entry bundle small). */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default });

function registerLoader({ request }: { request: Request }) {
  const url = new URL(request.url);
  return { screen: findScreenByRegisterRoute(url.pathname) ?? null, record: url.searchParams.get('record') };
}
type RegisterData = ReturnType<typeof registerLoader>;

function RegisterResolver() {
  const data = useLoaderData() as RegisterData;
  return data.screen ? <PlannedScreenView screen={data.screen} record={data.record} startHref={START} /> : <NotFoundState headingLevel={1} />;
}

/** Register routes served outside the portal shell: customer sign-in (AUTH-006) and the public site (Stage 5). */
function Standalone() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = useCallback((href: string, o?: { replace?: boolean }) => navigate(href, { replace: o?.replace }), [navigate]);
  return (
    <NavigationProvider navigate={nav} location={location} useHref={useHref}>
      <div className="min-h-dvh bg-bg">
        <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-3">
          <span className="font-semibold text-text">{t('common:app.productName')}</span>
          <LocaleToggle />
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-8 outline-none">
          <RegisterResolver />
        </main>
      </div>
    </NavigationProvider>
  );
}

function CustomerLabRoute() {
  return <CustomerLab {...(useLoaderData() as CustomerLabProps)} />;
}

const handle = (h: CustomerHandle) => h;

const portalChildren: RouteObject[] = [
  { index: true, element: <Navigate to={START} replace /> },
  // Stage 1.5R customer portal (PORTAL-001, 004, 008, 010, 011, 012, 015): real screens on mock data.
  { path: 'home', lazy: page(() => import('../pages/portal/PortalHomePage')), handle: handle({ title: (t) => t('portal:pages.home') }) },
  { path: 'payments-dashboard', lazy: page(() => import('../pages/portal/PaymentsPage')), handle: handle({ title: (t) => t('portal:pages.payments') }) },
  { path: 'upload-proof-mock', lazy: page(() => import('../pages/portal/PayPage')), handle: handle({ title: (t) => t('portal:pages.pay') }) },
  { path: 'receipt', lazy: page(() => import('../pages/portal/ReceiptPage')), handle: handle({ title: (t) => t('portal:pages.receipt') }) },
  { path: 'construction-updates', lazy: page(() => import('../pages/portal/ConstructionPage')), handle: handle({ title: (t) => t('portal:pages.construction') }) },
  { path: 'services-home', lazy: page(() => import('../pages/portal/ServicesPage')), handle: handle({ title: (t) => t('portal:pages.services') }) },
  { path: 'documents', lazy: page(() => import('../pages/portal/DocumentsPage')), handle: handle({ title: (t) => t('portal:pages.documents') }) },
  // Register screens served by a built screen (deep links keep working; see the screen register notes).
  { path: 'pay-online-mock', element: <Navigate to="/customer/portal/upload-proof-mock?mode=online" replace /> },
  { path: 'payment-history', element: <Navigate to="/customer/portal/payments-dashboard?status=paid" replace /> },
  { path: 'maintenance-list', element: <Navigate to="/customer/portal/services-home?tab=maintenance" replace /> },
  { path: 'create-maintenance', element: <Navigate to="/customer/portal/services-home?tab=maintenance&new=1" replace /> },
  { path: 'visitor-passes', element: <Navigate to="/customer/portal/services-home?tab=visitors" replace /> },
  { path: 'create-visitor-pass', element: <Navigate to="/customer/portal/services-home?tab=visitors&new=1" replace /> },
  {
    path: 'lab',
    // Prototype loader: fictional records become page props (a versioned API supplies them later).
    loader: (): CustomerLabProps => {
      const invoice = INVOICES.find((i) => i.kind === 'installment' && i.evidence === 'under_review') ?? INVOICES[1]!;
      return { unit: UNITS.find((u) => u.id === invoice.unitId)!, invoice };
    },
    element: <CustomerLabRoute />,
    handle: handle({ title: (t) => t('nav:pages.customerLab') }),
  },
  { path: 'accessibility-preferences', element: <AccessibilityPreferencesPage />, handle: handle({ title: (t) => t('nav:pages.accessibility') }) },
  { path: 'help/tours', loader: registerLoader, element: <RegisterResolver />, handle: handle({ title: (t) => t('nav:pages.tourLibrary') }) },
  { path: '*', loader: registerLoader, element: <RegisterResolver />, handle: handle({ title: (t, d) => (d as RegisterData | undefined)?.screen?.name ?? t('nav:pages.notFound') }) },
];

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/customer/portal" replace /> },
  { path: '/customer/portal', element: <RootLayout />, children: portalChildren },
  // GUIDE-005 register URL lacked the /customer prefix (Stage 0 conflict C12): keep it working as an alias.
  { path: '/portal/help/tours', element: <Navigate to="/customer/portal/help/tours" replace /> },
  { path: '*', loader: registerLoader, element: <Standalone /> },
]);
