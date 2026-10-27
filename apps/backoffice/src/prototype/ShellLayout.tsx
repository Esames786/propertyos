import { AccessOutcomeView, AppShell, dynamicT, useSession, useT, workspaceRouteTarget, type Destination } from '@repo/ui';
import { useMemo } from 'react';
import { Navigate, Outlet, useLocation, useMatches } from 'react-router';
import { LINKS, NAV_ITEMS } from '../nav.config';
import type { RouteHandle } from './handle';

/**
 * Signed-in backoffice frame. Without a demo identity, first-time visitors go to Get started and
 * returning visitors to sign-in; the address they asked for is kept so they land there afterwards.
 */
export function ShellLayout() {
  const { t } = useT();
  const { persona, returning, tenant, decide, can } = useSession();
  const location = useLocation();
  const matches = useMatches();
  const appName = t('common:app.backoffice');

  const match = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title);
  const handle = match?.handle as RouteHandle | undefined;

  const target = useMemo(() => workspaceRouteTarget(location.pathname), [location.pathname]);
  const decision = persona ? decide(target) : { allowed: true as const };
  const pageTitle = !decision.allowed
    ? dynamicT(t)(`errors:access.${decision.reason === 'module_not_licensed' || decision.reason === 'feature_not_licensed' ? 'notInPlan' : decision.reason === 'tenant_suspended' ? 'suspended' : 'role'}.title`)
    : handle
      ? handle.title(t, match?.data)
      : appName;

  const destinations = useMemo<Destination[]>(
    () => [
      { id: 'leads', label: t('nav:pages.leadsList'), href: LINKS.leads, permission: 'lead.view', keywords: 'crm leads customers prospects' },
      { id: 'plan', label: t('nav:pages.plan'), href: LINKS.plan, permission: 'admin.view', keywords: 'plan modules licence subscription' },
      { id: 'lab-tokens', label: t('nav:pages.labTokens'), href: '/backoffice/lab/tokens', keywords: 'colour contrast typography' },
      { id: 'lab-components', label: t('nav:pages.labComponents'), href: '/backoffice/lab/components', keywords: 'button dialog drawer toast' },
      { id: 'lab-forms', label: t('nav:pages.labForms'), href: '/backoffice/lab/forms', keywords: 'form validation unit picker' },
      { id: 'lab-workspace', label: t('nav:pages.labWorkspace'), href: '/backoffice/lab/workspace', permission: 'lead.view', keywords: 'lead 360 tabs related' },
      { id: 'lab-states', label: t('nav:pages.labStates'), href: '/backoffice/lab/states', keywords: 'loading error offline' },
      { id: 'tours', label: t('nav:pages.tourLibrary'), href: '/backoffice/help/tours', keywords: 'tour guide onboarding' },
      { id: 'practice', label: t('nav:pages.practice'), href: '/backoffice/help/practice', permission: 'lead.create', keywords: 'training demo' },
      { id: 'preferences', label: t('nav:pages.preferences'), href: LINKS.preferences, keywords: 'language accessibility motion contrast' },
      { id: 'notifications', label: t('nav:header.notifications'), href: '/backoffice/global/notifications' },
      { id: 'quick-create', label: t('common:quickCreate.label'), href: '/backoffice/global/quick-create', permission: 'quickcreate.use' },
    ],
    [t],
  );

  if (!persona) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`${returning ? LINKS.signIn : LINKS.getStarted}?next=${next}`} replace />;
  }

  return (
    <AppShell appName={appName} navItems={NAV_ITEMS} destinations={destinations} links={LINKS} pageTitle={pageTitle} helpKey={handle?.helpKey ?? 'default'}>
      {decision.allowed ? (
        <Outlet />
      ) : (
        <AccessOutcomeView
          reason={decision.reason}
          {...(target.module ? { module: target.module } : {})}
          organisation={tenant.name}
          startHref={LINKS.start}
          {...(can('admin.view') ? { planHref: LINKS.plan } : {})}
        />
      )}
    </AppShell>
  );
}
