import type { AccessDecision, DenyReason, RecordAccess } from '@repo/contracts';
import { AccessOutcomeView, AppShell, contextualNav, usePrototypeTools, withPrototypeTools, dynamicT, InlineAlert, Link, suspensionOf, useApiQuery, useOrgAppearanceSync, useSession, useSharedPreferences, useT, workspaceRouteTarget, type Destination } from '@repo/ui';
import { useMemo } from 'react';
import { Navigate, Outlet, useLocation, useMatches, useSearchParams } from 'react-router';
import { ACCESS_DATE, COLLECTIONS, LINKS, NAV_ITEMS, SOCIETY } from '../nav.config';
import type { RouteHandle } from './handle';

/**
 * Signed-in backoffice frame. Without a demo identity, first-time visitors go to Get started and
 * returning visitors to sign-in; the address they asked for is kept so they land there afterwards.
 * Every address is checked before it renders: the area (module, permission, the header project's
 * site, the suspension class) and, when it names a record (`?record=…`), that record too, by the
 * server's own rule (site licence, scope, tenant). The server still checks every data request.
 */
export function ShellLayout() {
  const { t } = useT();
  const { persona, returning, tenant, decide, can, access } = useSession();
  // ADM-022: the organisation's colours apply once someone is signed in (their own palette still wins).
  useOrgAppearanceSync();
  // D.1 closure: text size, contrast, motion, reading mode, fonts and language follow the person
  // between the office app and the resident app.
  useSharedPreferences();
  const location = useLocation();
  const [params] = useSearchParams();
  const matches = useMatches();
  const appName = t('common:app.backoffice');

  const match = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title);
  const handle = match?.handle as RouteHandle | undefined;

  const target = useMemo(() => workspaceRouteTarget(location.pathname), [location.pathname]);
  // The organisation's own words for its areas (e.g. "Owners & Residents" in a society).
  const [prototypeTools] = usePrototypeTools();
  const navItems = useMemo(() => withPrototypeTools(contextualNav(NAV_ITEMS, access, ACCESS_DATE), prototypeTools), [access, prototypeTools]);
  const area: AccessDecision = persona ? decide(target) : { allowed: true };
  // A record named in the address is checked as a record (another tenant's id is simply not found).
  const recordId = params.get('record');
  const recordCheck = useApiQuery<RecordAccess>(persona && area.allowed && recordId ? { method: 'GET', path: '/access/record', query: { id: recordId } } : null);
  const record = recordCheck.data?.record ? recordCheck.data : null;
  const decision: AccessDecision = !area.allowed ? area : record && !record.decision.allowed ? record.decision : { allowed: true };
  const deniedModule = !area.allowed ? target.module : record?.module;
  const pageTitle = !decision.allowed
    ? dynamicT(t)(`errors:access.${OUTCOME_TITLE[decision.reason] ?? 'role'}.title`)
    : handle
      ? handle.title(t, match?.data)
      : appName;

  const destinations = useMemo<Destination[]>(
    () => ([
      { id: 'leads', label: t('nav:pages.leadsList'), href: LINKS.leads, permission: 'lead.view', keywords: 'crm leads customers prospects' },
      { id: 'plan', label: t('nav:pages.plan'), href: LINKS.plan, permission: 'admin.view', keywords: 'plan modules licence subscription' },
      { id: 'my-access', label: t('nav:pages.myAccess'), href: LINKS.myAccess, keywords: 'access permissions role sites modules' },
      // Gate D.1: identity, devices, data and the organisation's colours.
      { id: 'profile', label: t('nav:pages.profile'), href: LINKS.profile, suspension: 'history_read', keywords: 'profile devices sessions sign out security contact' },
      { id: 'appearance', label: t('nav:pages.accessibility'), href: LINKS.preferences, suspension: 'history_read', keywords: 'text size theme dark contrast palette font language' },
      { id: 'branding', label: t('nav:pages.branding'), href: '/backoffice/adm/branding', permission: 'admin.branding', keywords: 'colours colors brand palette theme organisation' },
      { id: 'portal-access', label: t('nav:pages.portalAccess'), href: '/backoffice/residents/portal-access', permission: 'portal_access.view', keywords: 'invite residents app access login' },
      { id: 'lab-tokens', label: t('nav:pages.labTokens'), href: '/backoffice/lab/tokens', keywords: 'colour contrast typography' },
      { id: 'lab-components', label: t('nav:pages.labComponents'), href: '/backoffice/lab/components', keywords: 'button dialog drawer toast' },
      { id: 'lab-forms', label: t('nav:pages.labForms'), href: '/backoffice/lab/forms', keywords: 'form validation unit picker' },
      { id: 'lab-workspace', label: t('nav:pages.labWorkspace'), href: '/backoffice/lab/workspace', permission: 'lead.view', keywords: 'lead 360 tabs related' },
      { id: 'lab-states', label: t('nav:pages.labStates'), href: '/backoffice/lab/states', keywords: 'loading error offline' },
      // Society billing (Gate C.1): the screens below the Billing area, by what people call them.
      { id: 'new-run', label: t('nav:pages.newRun'), href: SOCIETY.newRun, permission: 'billing_run.create', keywords: 'billing run monthly maintenance bills prepare' },
      { id: 'charge-rules', label: t('nav:pages.rules'), href: SOCIETY.rules(), permission: 'billing_run.view', keywords: 'charges rates override penthouse which rule wins' },
      { id: 'exemptions', label: t('nav:pages.exemptions'), href: SOCIETY.exemptions, permission: 'billing_run.view', keywords: 'exemption waiver exempt' },
      { id: 'billing-accounts', label: t('nav:pages.accounts'), href: SOCIETY.accounts(), permission: 'billing_run.view', keywords: 'billing accounts arrears dues balance statement' },
      { id: 'roster', label: t('nav:pages.roster'), href: SOCIETY.roster(), permission: 'site.view', module: 'residents', keywords: 'occupancy tenants owners payers flats' },
      // Collections (Gate C.2).
      { id: 'proof-inbox', label: t('nav:pages.proofInbox'), href: COLLECTIONS.inbox(), permission: 'finance.evidence.review', module: 'dues', keywords: 'proof transfer screenshot verify payment receipt' },
      { id: 'payments', label: t('nav:pages.payments'), href: COLLECTIONS.payments(), permission: 'invoice.view', module: 'dues', keywords: 'payments received receipts cash' },
      { id: 'office-cash', label: t('collections:office.title'), href: COLLECTIONS.officePayment(), permission: 'payment.receive', module: 'dues', keywords: 'cash counter office receipt' },
      { id: 'bank-feed', label: t('nav:pages.bankFeed'), href: COLLECTIONS.bankFeed(), permission: 'bank.view', module: 'dues', keywords: 'bank statement import transactions' },
      { id: 'reconciliation', label: t('nav:pages.reconciliation'), href: COLLECTIONS.reconciliation, permission: 'bank.view', module: 'dues', keywords: 'reconcile matched unidentified' },
      { id: 'aging', label: t('nav:pages.aging'), href: COLLECTIONS.aging(), permission: 'collections.view', module: 'dues', keywords: 'aging arrears overdue defaulters' },
      { id: 'credits', label: t('nav:pages.credits'), href: COLLECTIONS.credits, permission: 'collections.view', module: 'dues', keywords: 'credit overpayment advance unapplied' },
      { id: 'statement', label: t('nav:pages.statement'), href: COLLECTIONS.statement(), permission: 'invoice.view', module: 'dues', keywords: 'statement account ledger balance' },
      { id: 'payer-changes', label: t('nav:pages.payerChanges'), href: COLLECTIONS.payerChanges(), permission: 'site.view', module: 'dues', keywords: 'payer liability tenant owner change approve' },
      { id: 'tours', label: t('nav:pages.tourLibrary'), href: '/backoffice/help/tours', keywords: 'tour guide onboarding' },
      { id: 'practice', label: t('nav:pages.practice'), href: '/backoffice/help/practice', permission: 'lead.create', keywords: 'training demo' },
      { id: 'preferences', label: t('nav:pages.preferences'), href: LINKS.preferences, keywords: 'language accessibility motion contrast' },
      { id: 'notifications', label: t('nav:header.notifications'), href: '/backoffice/global/notifications' },
      { id: 'quick-create', label: t('common:quickCreate.label'), href: '/backoffice/global/quick-create', permission: 'quickcreate.use' },
    ] as Destination[])
      // Prototype tools are offered only when switched on in Preferences.
      .filter((d) => prototypeTools || !d.href.startsWith('/backoffice/lab'))
      .map((d) => ({ ...d, suspension: suspensionOf(d.href.split(/[?#]/)[0]!) })),
    [t, prototypeTools],
  );

  // Phone bottom bar: finance people get their own areas first; others keep the menu order.
  const slots = useMemo(() => (can('finance.evidence.review') && !can('billing_run.create') ? { bottomOrder: ['home', 'collections', 'billing', 'finance'] } : {}), [can]);

  if (!persona) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`${returning ? LINKS.signIn : LINKS.getStarted}?next=${next}`} replace />;
  }

  // Until the record check answers, nothing of the record's page is shown. If the check itself
  // fails (offline, service error) the page renders and its own requests report the problem.
  const pending = recordId !== null && area.allowed && recordCheck.isPending;
  const suspended = access?.tenant.status === 'suspended';

  return (
    <AppShell appName={appName} navItems={navItems} destinations={destinations} links={LINKS} pageTitle={pageTitle} helpKey={handle?.helpKey ?? 'default'} slots={slots}>
      {suspended && (
        <InlineAlert tone="warning" title={t('workspace:suspended.title', { organisation: tenant.name })} className="mb-6" role="status">
          <p data-testid="suspended-banner">
            {t('workspace:suspended.body')}{' '}
            {can('invoice.view') || decide({ permission: 'invoice.view', suspension: 'history_read' }).allowed ? (
              <Link href={LINKS.invoices}>{t('workspace:suspended.history')}</Link>
            ) : null}
          </p>
        </InlineAlert>
      )}
      {pending ? (
        <div aria-busy="true" data-testid="record-check-pending" className="min-h-40" />
      ) : decision.allowed ? (
        <Outlet />
      ) : (
        <AccessOutcomeView
          reason={decision.reason}
          {...(deniedModule ? { module: deniedModule } : {})}
          organisation={tenant.name}
          startHref={LINKS.start}
          {...(can('admin.view') ? { planHref: LINKS.plan } : {})}
        />
      )}
    </AppShell>
  );
}

/** Title of the access outcome for each reason (the page body says why). */
const OUTCOME_TITLE: Partial<Record<DenyReason, string>> = {
  module_not_licensed: 'notInPlan',
  feature_not_licensed: 'notInPlan',
  site_not_licensed: 'site',
  site_context_missing: 'siteMissing',
  out_of_scope: 'notFound',
  tenant_suspended: 'suspended',
  tenant_inactive: 'inactive',
};
