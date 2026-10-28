import { AL_NOOR, CEDAR_HILLS, CRESCENT_BAY, LEADS, SHALIMAR } from '@repo/fixtures';
import { DemoSignIn, Link, useSession, useT } from '@repo/ui';
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
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

/**
 * Addresses shared by every kind of organisation (the people directory, Person 360, units and
 * payers, invoices). A society with the residents module and site access gets its own screen; any
 * other workspace keeps the register's planned page, so nothing unfinished looks finished.
 */
const SocietyPeople = lazy(() => import('../pages/society/people/PeopleDirectory'));
const SocietyPerson = lazy(() => import('../pages/society/people/PersonWorkspace'));
const SocietyRoster = lazy(() => import('../pages/society/people/OccupancyRoster'));
const SocietyInvoices = lazy(() => import('../pages/society/billing/SocietyInvoicesPage'));
const DeveloperInvoices = lazy(() => import('../pages/fin/InvoicesPage'));
const SocietyInvoice = lazy(() => import('../pages/society/billing/InvoiceWorkspace'));

function SocietyOrPlanned({ page: Page, module = 'residents' }: { page: LazyExoticComponent<ComponentType>; module?: 'residents' | 'dues' }) {
  const { allows, can } = useSession();
  return allows({ module }) && can('site.view') ? (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  ) : (
    <RegisterResolver />
  );
}

function InvoicesRoute() {
  const { allows, can } = useSession();
  return <Suspense fallback={null}>{allows({ module: 'dues' }) && can('site.view') ? <SocietyInvoices /> : <DeveloperInvoices />}</Suspense>;
}

/** FIN-003: a society invoice (a `cin_` record) opens its workspace; others are still planned. */
function InvoiceWorkspaceRoute() {
  const [params] = useSearchParams();
  const record = params.get('record');
  return record?.startsWith('cin_') ? (
    <Suspense fallback={null}>
      <SocietyInvoice invoiceId={record} />
    </Suspense>
  ) : (
    <RegisterResolver />
  );
}

/**
 * Collections (Gate C.2): a society's working screens; any other kind of organisation keeps the
 * register's planned page at these addresses (nothing unfinished looks finished).
 */
const CollectionsPage = lazy(() => import('../pages/society/collections/CollectionsPage'));
const ProofInbox = lazy(() => import('../pages/society/collections/ProofInbox'));
const PaymentsPage = lazy(() => import('../pages/society/collections/PaymentsPage'));
const PayerChangesPage = lazy(() => import('../pages/society/collections/PayerChangesPage'));
const CreditsPage = lazy(() => import('../pages/society/collections/ReportsPages').then((m) => ({ default: m.CreditsPage })));
const AgingPage = lazy(() => import('../pages/society/collections/ReportsPages').then((m) => ({ default: m.AgingPage })));
const StatementPage = lazy(() => import('../pages/society/collections/ReportsPages').then((m) => ({ default: m.StatementPage })));
const BankFeedPage = lazy(() => import('../pages/society/collections/BankPages').then((m) => ({ default: m.BankFeedPage })));
const ReconciliationPage = lazy(() => import('../pages/society/collections/BankPages').then((m) => ({ default: m.ReconciliationPage })));

function SocietyScreen({ page: Page }: { page: LazyExoticComponent<ComponentType> }) {
  const { allows } = useSession();
  return allows({ module: 'dues' }) ? (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  ) : (
    <RegisterResolver />
  );
}

/** FIN-007's register address: a society records office cash in the payments list's drawer. */
function OfficePaymentRedirect() {
  const { allows } = useSession();
  return allows({ module: 'dues' }) ? <Navigate to="/backoffice/fin/payment-list?drawer=office" replace /> : <RegisterResolver />;
}

/** A society record screen addressed by `?record=` (Payment 360, proof review). */
function SocietyRecord({ page: Page, prefix }: { page: LazyExoticComponent<ComponentType<{ id: string }>>; prefix: string }) {
  const { allows } = useSession();
  const [params] = useSearchParams();
  const record = params.get('record');
  return allows({ module: 'dues' }) && record?.startsWith(prefix) ? (
    <Suspense fallback={null}>
      <Page id={record} />
    </Suspense>
  ) : (
    <RegisterResolver />
  );
}

const ProofReviewById = lazy(() => import('../pages/society/collections/ProofReview').then((m) => ({ default: ({ id }: { id: string }) => <m.default submissionId={id} /> })));
const PaymentById = lazy(() => import('../pages/society/collections/PaymentWorkspace').then((m) => ({ default: ({ id }: { id: string }) => <m.default paymentId={id} /> })));

/** BILL-014's register address opens the invoice workspace with the credit-note drawer. */
function BillingInvoiceRedirect() {
  const { invoiceId } = useParams();
  const [params] = useSearchParams();
  const drawer = params.get('drawer');
  return <Navigate to={`/backoffice/fin/invoice-workspace?record=${invoiceId}${drawer ? `&drawer=${drawer}` : ''}`} replace />;
}

/** A code-split page that takes route parameters as plain props (pages stay router-agnostic). */
function paramPage<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, pick: (params: Readonly<Record<string, string | undefined>>) => P) {
  return async () => {
    const Page = (await load()).default;
    return { Component: () => <Page {...pick(useParams())} /> };
  };
}

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
      describe={(p) =>
        p.tenantId === SHALIMAR.id
          ? t('workspace:signIn.maintenancePlan')
          : p.tenantId === CRESCENT_BAY.id
            ? t('workspace:signIn.twoSites')
            : p.tenantId === CEDAR_HILLS.id
              ? t('workspace:signIn.suspended')
              : p.tenantId === AL_NOOR.id
                ? t('workspace:signIn.society')
              : p.projectScope === 'all'
            ? t('common:demo.scopeAll')
            : t('common:demo.scopeOne', { project: 'Larkspur Heights' })
      }
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
    lazy: page(() => import('../pages/home/HomePage')),
    handle: h({ title: (t) => t('nav:pages.dashboard') }),
  },
  { path: 'crm/sales-home', lazy: page(() => import('../pages/crm/SalesHome')), handle: h({ title: (t) => t('nav:pages.salesHome') }) },
  { path: 'crm/leads-list', lazy: page(() => import('../pages/crm/LeadsList')), handle: h({ title: (t) => t('nav:pages.leadsList') }) },
  { path: 'crm/lead-360-workspace', lazy: page(() => import('../pages/crm/LeadWorkspace')), handle: h({ title: (t) => t('nav:pages.leadWorkspace') }) },
  // Drawer screens from the register open over Sales home (deep-linkable ?drawer=…).
  { path: 'crm/new-lead-drawer', element: <Navigate to={`${LINKS.salesHome}?drawer=new-lead`} replace /> },
  { path: 'crm/schedule-visit-drawer', element: <Navigate to={`${LINKS.salesHome}?drawer=schedule-visit`} replace /> },
  { path: 'more', lazy: page(() => import('../pages/more/MorePage')), handle: h({ title: (t) => t('nav:pages.more') }) },
  { path: 'adm/plan', lazy: page(() => import('../pages/adm/PlanPage')), handle: h({ title: (t) => t('nav:pages.plan') }) },
  { path: 'global/my-access', lazy: page(() => import('../pages/adm/MyAccessPage')), handle: h({ title: (t) => t('nav:pages.myAccess') }) },
  { path: 'fin/invoices-list', element: <InvoicesRoute />, handle: h({ title: (t) => t('nav:pages.invoices') }) },
  { path: 'fin/invoice-workspace', loader: registerLoader, element: <InvoiceWorkspaceRoute />, handle: h({ title: (t) => t('nav:pages.invoice') }) },
  { path: 'cus/customers-list', loader: registerLoader, element: <SocietyOrPlanned page={SocietyPeople} />, handle: h({ title: (t) => t('nav:pages.people') }) },
  { path: 'cus/customer-360-workspace', loader: registerLoader, element: <SocietyOrPlanned page={SocietyPerson} />, handle: h({ title: (t) => t('nav:pages.person') }) },
  { path: 'res/occupancy-list', loader: registerLoader, element: <SocietyOrPlanned page={SocietyRoster} />, handle: h({ title: (t) => t('nav:pages.roster') }) },
  { path: 'sites', lazy: page(() => import('../pages/society/sites/SitesPage')), handle: h({ title: (t) => t('nav:pages.sites') }) },
  { path: 'sites/:siteId', lazy: paramPage(() => import('../pages/society/sites/SiteWorkspace'), (p) => ({ siteId: p.siteId! })), handle: h({ title: (t) => t('nav:pages.site') }) },
  { path: 'sites/:siteId/structure', lazy: paramPage(() => import('../pages/society/sites/StructurePage'), (p) => ({ siteId: p.siteId! })), handle: h({ title: (t) => t('nav:pages.structure') }) },
  { path: 'sites/:siteId/import', lazy: paramPage(() => import('../pages/society/sites/ImportPage'), (p) => ({ siteId: p.siteId! })), handle: h({ title: (t) => t('nav:pages.importFlats') }) },
  { path: 'sites/:siteId/unit-types', lazy: paramPage(() => import('../pages/society/sites/UnitTypesPage'), (p) => ({ siteId: p.siteId! })), handle: h({ title: (t) => t('nav:pages.unitTypes') }) },
  { path: 'sites/:siteId/opening-balances', lazy: paramPage(() => import('../pages/society/sites/OpeningBalancesPage'), (p) => ({ siteId: p.siteId! })), handle: h({ title: (t) => t('nav:pages.openingBalances') }) },
  { path: 'billing/accounts', lazy: page(() => import('../pages/society/billing/AccountsPage')), handle: h({ title: (t) => t('nav:pages.accounts') }) },
  { path: 'billing/accounts/:accountId', lazy: paramPage(() => import('../pages/society/billing/AccountWorkspace'), (p) => ({ accountId: p.accountId! })), handle: h({ title: (t) => t('nav:pages.account') }) },
  { path: 'billing/charges', lazy: page(() => import('../pages/society/billing/ChargesPage')), handle: h({ title: (t) => t('nav:pages.charges') }) },
  { path: 'billing/rules', lazy: page(() => import('../pages/society/billing/RulesPage')), handle: h({ title: (t) => t('nav:pages.rules') }) },
  { path: 'billing/exemptions', lazy: page(() => import('../pages/society/billing/ExemptionsPage')), handle: h({ title: (t) => t('nav:pages.exemptions') }) },
  { path: 'billing/invoices/:invoiceId', element: <BillingInvoiceRedirect /> },
  { path: 'billing/payer-changes', loader: registerLoader, element: <SocietyScreen page={PayerChangesPage} />, handle: h({ title: (t) => t('nav:pages.payerChanges') }) },
  // Collections (Gate C.2): register addresses (COL, FIN, BANK).
  { path: 'col/collections-dashboard', loader: registerLoader, element: <SocietyScreen page={CollectionsPage} />, handle: h({ title: (t) => t('nav:pages.collections') }) },
  { path: 'col/aging-breakdown', loader: registerLoader, element: <SocietyScreen page={AgingPage} />, handle: h({ title: (t) => t('nav:pages.aging') }) },
  { path: 'col/customer-statement', loader: registerLoader, element: <SocietyScreen page={StatementPage} />, handle: h({ title: (t) => t('nav:pages.statement') }) },
  { path: 'fin/unverified-transfers-queue', loader: registerLoader, element: <SocietyScreen page={ProofInbox} />, handle: h({ title: (t) => t('nav:pages.proofInbox') }) },
  { path: 'fin/transfer-proof-review', loader: registerLoader, element: <SocietyRecord page={ProofReviewById} prefix="psb_" />, handle: h({ title: (t) => t('nav:pages.proofReview') }) },
  { path: 'fin/payment-list', loader: registerLoader, element: <SocietyScreen page={PaymentsPage} />, handle: h({ title: (t) => t('nav:pages.payments') }) },
  { path: 'fin/payment-workspace', loader: registerLoader, element: <SocietyRecord page={PaymentById} prefix="pay_" />, handle: h({ title: (t) => t('nav:pages.payment') }) },
  { path: 'fin/receive-payment-drawer', loader: registerLoader, element: <OfficePaymentRedirect /> },
  { path: 'fin/customer-credit-overpayments', loader: registerLoader, element: <SocietyScreen page={CreditsPage} />, handle: h({ title: (t) => t('nav:pages.credits') }) },
  { path: 'bank/bank-transaction-feed', loader: registerLoader, element: <SocietyScreen page={BankFeedPage} />, handle: h({ title: (t) => t('nav:pages.bankFeed') }) },
  { path: 'bank/reconciliation-workspace', loader: registerLoader, element: <SocietyScreen page={ReconciliationPage} />, handle: h({ title: (t) => t('nav:pages.reconciliation') }) },
  // Society setup and monthly billing (Gate C.1)
  { path: 'billing', element: <Navigate to="/backoffice/billing/runs" replace /> },
  { path: 'billing/runs', lazy: page(() => import('../pages/society/billing/RunsPage')), handle: h({ title: (t) => t('nav:pages.billingRuns') }) },
  { path: 'billing/runs/new', lazy: page(() => import('../pages/society/billing/NewRunPage')), handle: h({ title: (t) => t('nav:pages.newRun') }) },
  {
    path: 'billing/runs/:runId',
    lazy: paramPage(() => import('../pages/society/billing/RunWorkspace'), (p) => ({ runId: p.runId! })),
    handle: h({ title: (t) => t('nav:pages.billingRun') }),
  },
  {
    path: 'sites/:siteId/units/:unitId',
    lazy: paramPage(() => import('../pages/society/sites/FlatWorkspace'), (p) => ({ siteId: p.siteId!, unitId: p.unitId! })),
    handle: h({ title: (t) => t('nav:pages.flat') }),
  },
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
