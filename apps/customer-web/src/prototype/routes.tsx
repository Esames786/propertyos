import { findScreenByRegisterRoute } from '@repo/contracts/screens';
import { demoSignInNumbers, INVOICES, UNITS } from '@repo/fixtures';
import { AppSwitchLanding, LocaleToggle, NavigationProvider, NotFoundState, PlannedScreenView, useT } from '@repo/ui';
import { lazy, Suspense, useCallback, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, Navigate, Outlet, useHref, useLoaderData, useLocation, useNavigate, useParams, type RouteObject } from 'react-router';
import AccessibilityPreferencesPage from '../pages/AccessibilityPreferencesPage';
import CustomerLab, { type CustomerLabProps } from '../pages/CustomerLab';
import { START } from '../nav.config';
import { RootLayout, useIsDuesResident, type CustomerHandle } from './RootLayout';

function registerLoader({ request }: { request: Request }) {
  const url = new URL(request.url);
  return { screen: findScreenByRegisterRoute(url.pathname) ?? null, record: url.searchParams.get('record') };
}
type RegisterData = ReturnType<typeof registerLoader>;

function RegisterResolver() {
  const data = useLoaderData() as RegisterData;
  return data.screen ? <PlannedScreenView screen={data.screen} record={data.record} startHref={START} /> : <NotFoundState headingLevel={1} />;
}

/** Pages outside the portal shell: invitation and phone sign-in (Gate D.1) and register placeholders. */
function StandaloneNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const nav = useCallback((href: string, o?: { replace?: boolean }) => navigate(href, { replace: o?.replace }), [navigate]);
  return (
    <NavigationProvider navigate={nav} location={location} useHref={useHref}>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </NavigationProvider>
  );
}

/** Register routes not built yet that live outside the portal shell (e.g. the public site, Stage 5). */
function Standalone() {
  const { t } = useT();
  return (
    <div className="min-h-dvh bg-bg">
      <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-3">
        <span className="font-semibold text-text">{t('common:app.productName')}</span>
        <LocaleToggle />
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-8 outline-none">
        <RegisterResolver />
      </main>
    </div>
  );
}

// Gate D.1: AUTH-007 accept invitation, AUTH-006 phone sign-in, PORTAL-030 welcome.
const InvitationPage = lazy(() => import('../pages/auth/InvitationPage'));
const PortalSignInPage = lazy(() => import('../pages/auth/PortalSignInPage'));
const WelcomePage = lazy(() => import('../pages/auth/WelcomePage'));
const ProfilePage = lazy(() => import('../pages/profile/ProfilePage'));

function SwitchRoute() {
  const { token = '' } = useParams();
  return <AppSwitchLanding token={token} homeHref={START} signInHref="/shared/auth/customer-portal-login" />;
}

function InvitationRoute() {
  const { token = '' } = useParams();
  return <InvitationPage token={token} />;
}

function CustomerLabRoute() {
  return <CustomerLab {...(useLoaderData() as CustomerLabProps)} />;
}

const handle = (h: CustomerHandle) => h;

/**
 * One address, the edition's screen (Gate C.2): a society resident gets the dues screen, a buyer the
 * developer one. Screens of the other edition answer with the register's planned page.
 */
const dues = {
  home: lazy(() => import('../pages/dues/DuesHome')),
  pay: lazy(() => import('../pages/dues/DuesPay')),
  bills: lazy(() => import('../pages/dues/DuesPages').then((m) => ({ default: m.DuesBillsPage }))),
  bill: lazy(() => import('../pages/dues/DuesPages').then((m) => ({ default: m.DuesBillPage }))),
  history: lazy(() => import('../pages/dues/DuesPages').then((m) => ({ default: m.DuesHistoryPage }))),
  receipt: lazy(() => import('../pages/dues/DuesPages').then((m) => ({ default: m.DuesReceiptPage }))),
  statement: lazy(() => import('../pages/dues/DuesPages').then((m) => ({ default: m.DuesStatementPage }))),
};
const developer = {
  home: lazy(() => import('../pages/portal/PortalHomePage')),
  payments: lazy(() => import('../pages/portal/PaymentsPage')),
  pay: lazy(() => import('../pages/portal/PayPage')),
  receipt: lazy(() => import('../pages/portal/ReceiptPage')),
  construction: lazy(() => import('../pages/portal/ConstructionPage')),
  services: lazy(() => import('../pages/portal/ServicesPage')),
  documents: lazy(() => import('../pages/portal/DocumentsPage')),
};
const household = {
  properties: lazy(() => import('../pages/household/HouseholdPages').then((m) => ({ default: m.MyPropertiesPage }))),
  property: lazy(() => import('../pages/household/HouseholdPages').then((m) => ({ default: m.PropertyPage }))),
  household: lazy(() => import('../pages/household/HouseholdPages').then((m) => ({ default: m.HouseholdPage }))),
};
const DuesPayDetails = lazy(() => import('../pages/dues/DuesPay').then((m) => ({ default: () => <m.default mode="details" /> })));
const DuesSubmission = lazy(() => import('../pages/dues/DuesPages').then((m) => ({ default: m.DuesSubmissionPage })));

type Page = LazyExoticComponent<ComponentType>;
function Edition({ dues: Dues, developer: Developer }: { dues?: Page; developer?: Page }) {
  const isDues = useIsDuesResident();
  const Page = isDues ? Dues : Developer;
  return Page ? (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  ) : (
    <RegisterResolver />
  );
}

function SubmissionRoute() {
  const { id } = useParams();
  const isDues = useIsDuesResident();
  return isDues && id ? (
    <Suspense fallback={null}>
      <DuesSubmission submissionId={id} />
    </Suspense>
  ) : (
    <RegisterResolver />
  );
}

/** PORTAL history: the dues edition's own page; a buyer's history stays the paid filter of Payments. */
function PaymentHistoryRoute() {
  const isDues = useIsDuesResident();
  return isDues ? <Edition dues={dues.history} /> : <Navigate to="/customer/portal/payments-dashboard?status=paid" replace />;
}

const portalChildren: RouteObject[] = [
  { index: true, element: <Navigate to={START} replace /> },
  // Stage 1.5R customer portal (PORTAL-001, 004, 008, 010, 011, 012, 015): real screens on mock data.
  { path: 'home', element: <Edition dues={dues.home} developer={developer.home} />, handle: handle({ title: (t) => t('portal:pages.home') }) },
  { path: 'payments-dashboard', element: <Edition dues={dues.bills} developer={developer.payments} />, handle: handle({ title: (t) => t('portal:pages.payments') }) },
  { path: 'upload-proof-mock', element: <Edition dues={dues.pay} developer={developer.pay} />, handle: handle({ title: (t) => t('portal:pages.pay') }) },
  { path: 'receipt', element: <Edition dues={dues.receipt} developer={developer.receipt} />, handle: handle({ title: (t) => t('portal:pages.receipt') }) },
  { path: 'construction-updates', loader: registerLoader, element: <Edition developer={developer.construction} />, handle: handle({ title: (t) => t('portal:pages.construction') }) },
  { path: 'services-home', loader: registerLoader, element: <Edition developer={developer.services} />, handle: handle({ title: (t) => t('portal:pages.services') }) },
  { path: 'documents', loader: registerLoader, element: <Edition developer={developer.documents} />, handle: handle({ title: (t) => t('portal:pages.documents') }) },
  // Society dues screens (Gate C.2): PORTAL-005, 007, 028, 029.
  { path: 'invoice-detail', loader: registerLoader, element: <Edition dues={dues.bill} />, handle: handle({ title: (t) => t('dues:pages.bill') }) },
  { path: 'bank-transfer-details', loader: registerLoader, element: <Edition dues={DuesPayDetails} />, handle: handle({ title: (t) => t('dues:pages.payee') }) },
  { path: 'submissions/:id', loader: registerLoader, element: <SubmissionRoute />, handle: handle({ title: (t) => t('dues:pages.submission') }) },
  { path: 'statements', loader: registerLoader, element: <Edition dues={dues.statement} />, handle: handle({ title: (t) => t('dues:pages.statement') }) },
  // Register screens served by a built screen (deep links keep working; see the screen register notes).
  { path: 'pay-online-mock', element: <Navigate to="/customer/portal/upload-proof-mock?mode=online" replace /> },
  { path: 'payment-history', element: <PaymentHistoryRoute />, handle: handle({ title: (t) => t('dues:pages.history') }) },
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
  {
    path: 'welcome',
    element: (
      <Suspense fallback={null}>
        <WelcomePage />
      </Suspense>
    ),
    handle: handle({ title: (t) => t('nav:pages.welcome'), bare: true }),
  },
  // Gate D.1: PORTAL-002 my properties, PORTAL-003 Property 360, PORTAL-025 household (society edition).
  { path: 'my-properties', loader: registerLoader, element: <Edition dues={household.properties} />, handle: handle({ title: (t) => t('nav:pages.myProperties') }) },
  { path: 'property-360-workspace', loader: registerLoader, element: <Edition dues={household.property} />, handle: handle({ title: (t) => t('nav:pages.propertyDetail') }) },
  { path: 'household', loader: registerLoader, element: <Edition dues={household.household} />, handle: handle({ title: (t) => t('nav:pages.household') }) },
  { path: 'profile', element: <Suspense fallback={null}><ProfilePage /></Suspense>, handle: handle({ title: (t) => t('nav:pages.profile') }) },
  { path: 'accessibility-preferences', element: <AccessibilityPreferencesPage />, handle: handle({ title: (t) => t('nav:pages.accessibility') }) },
  { path: 'help/tours', loader: registerLoader, element: <RegisterResolver />, handle: handle({ title: (t) => t('nav:pages.tourLibrary') }) },
  { path: '*', loader: registerLoader, element: <RegisterResolver />, handle: handle({ title: (t, d) => (d as RegisterData | undefined)?.screen?.name ?? t('nav:pages.notFound') }) },
];

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/customer/portal" replace /> },
  { path: '/customer/portal', element: <RootLayout />, children: portalChildren },
  // GUIDE-005 register URL lacked the /customer prefix (Stage 0 conflict C12): keep it working as an alias.
  { path: '/portal/help/tours', element: <Navigate to="/customer/portal/help/tours" replace /> },
  {
    element: <StandaloneNavigation />,
    children: [
      { path: '/shared/auth/invite/:token', element: <InvitationRoute /> },
      // GLOBAL-015: a switch from the office app lands here and starts this app's own session.
      { path: '/shared/auth/switch/:token', element: <SwitchRoute /> },
      // Prototype: the featured residents' fictional numbers are offered as demo shortcuts.
      { path: '/shared/auth/customer-portal-login', element: <PortalSignInPage demoNumbers={demoSignInNumbers()} /> },
      { path: '*', loader: registerLoader, element: <Standalone /> },
    ],
  },
]);
