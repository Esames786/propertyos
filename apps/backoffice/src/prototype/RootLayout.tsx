import { GLOBAL_TOUR, GuidedTourProvider, LAB_TOUR } from '@repo/ui/onboarding';
import { AppShell, DemoSignIn, NavigationProvider, useSession, useT, type Destination } from '@repo/ui';
import { useCallback, useMemo } from 'react';
import { Outlet, ScrollRestoration, useHref, useLocation, useMatches, useNavigate } from 'react-router';
import { LINKS, NAV_ITEMS, TOUR_LINKS } from '../nav.config';
import type { RouteHandle } from './handle';

const TOURS = [GLOBAL_TOUR, LAB_TOUR];

/**
 * Prototype-only glue between React Router and the router-agnostic UI (ADR-0001 §2.3).
 * At the backend stage this file is replaced by the Inertia app setup; pages stay unchanged.
 */
export function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const nav = useCallback((href: string, options?: { replace?: boolean }) => navigate(href, { replace: options?.replace }), [navigate]);
  return (
    <NavigationProvider navigate={nav} location={location} useHref={useHref}>
      <GuidedTourProvider tours={TOURS} welcomeTourId={GLOBAL_TOUR.id} links={TOUR_LINKS}>
        <SignedInShell />
      </GuidedTourProvider>
      <ScrollRestoration />
    </NavigationProvider>
  );
}

function SignedInShell() {
  const { t } = useT();
  const { persona } = useSession();
  const matches = useMatches();
  const appName = t('common:app.backoffice');

  const match = [...matches].reverse().find((m) => (m.handle as RouteHandle | undefined)?.title);
  const handle = match?.handle as RouteHandle | undefined;
  const pageTitle = handle ? handle.title(t, match?.data) : appName;

  const destinations = useMemo<Destination[]>(
    () => [
      { id: 'lab-tokens', label: t('nav:pages.labTokens'), href: '/backoffice/lab/tokens', keywords: 'colour contrast typography' },
      { id: 'lab-components', label: t('nav:pages.labComponents'), href: '/backoffice/lab/components', keywords: 'button dialog drawer toast' },
      { id: 'lab-forms', label: t('nav:pages.labForms'), href: '/backoffice/lab/forms', keywords: 'form validation unit picker' },
      { id: 'lab-workspace', label: t('nav:pages.labWorkspace'), href: '/backoffice/lab/workspace', keywords: 'lead 360 tabs related' },
      { id: 'lab-states', label: t('nav:pages.labStates'), href: '/backoffice/lab/states', keywords: 'loading error offline' },
      { id: 'tours', label: t('nav:pages.tourLibrary'), href: '/backoffice/help/tours', keywords: 'tour guide onboarding' },
      { id: 'practice', label: t('nav:pages.practice'), href: '/backoffice/help/practice', keywords: 'training demo' },
      { id: 'preferences', label: t('nav:pages.preferences'), href: LINKS.preferences, keywords: 'language accessibility motion contrast' },
      { id: 'notifications', label: t('nav:header.notifications'), href: '/backoffice/global/notifications' },
      { id: 'quick-create', label: t('common:quickCreate.label'), href: '/backoffice/global/quick-create', permission: 'quickcreate.use' },
    ],
    [t],
  );

  if (!persona) return <DemoSignIn appName={appName} />;

  return (
    <AppShell appName={appName} navItems={NAV_ITEMS} destinations={destinations} links={LINKS} pageTitle={pageTitle} helpKey={handle?.helpKey ?? 'default'}>
      <Outlet />
    </AppShell>
  );
}
