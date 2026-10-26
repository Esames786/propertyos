import { findScreenByRegisterRoute } from '@repo/contracts/screens';
import { INVOICES, UNITS } from '@repo/fixtures';
import { LocaleToggle, NavigationProvider, NotFoundState, PlannedScreenView, useT } from '@repo/ui';
import { useCallback } from 'react';
import { createBrowserRouter, Navigate, useHref, useLoaderData, useLocation, useNavigate, type RouteObject } from 'react-router';
import AccessibilityPreferencesPage from '../pages/AccessibilityPreferencesPage';
import CustomerLab, { type CustomerLabProps } from '../pages/CustomerLab';
import { START } from '../nav.config';
import { RootLayout, type CustomerHandle } from './RootLayout';

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
