import { NavigationProvider } from '@repo/ui';
import { GuidedTourProvider, HQ_CREATE_TOUR, HQ_TOUR } from '@repo/ui/onboarding';
import { useCallback } from 'react';
import { Outlet, ScrollRestoration, useHref, useLocation, useNavigate } from 'react-router';
import { HQ, HQ_TOUR_LINKS } from '../nav.config';

/** A page opened by a full load keeps its own scroll position, never the previous page's (as in the office app). */
const scrollKey = (location: { key: string; pathname: string; search: string }) => (location.key === 'default' ? location.pathname + location.search : location.key);

/**
 * Prototype glue between React Router and the router-agnostic UI (ADR-0001 §2.3), as in the other
 * apps. The HQ essentials tour (HQ-TOUR-001) is offered on first sign-in and replayable from Help.
 */
export function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const nav = useCallback((href: string, options?: { replace?: boolean }) => navigate(href, { replace: options?.replace }), [navigate]);
  return (
    <NavigationProvider navigate={nav} location={location} useHref={useHref}>
      <GuidedTourProvider tours={[HQ_TOUR, HQ_CREATE_TOUR]} welcomeTourId={HQ_TOUR.id} suppressWelcome={location.pathname.startsWith(HQ.signIn)} links={HQ_TOUR_LINKS}>
        <Outlet />
      </GuidedTourProvider>
      <ScrollRestoration getKey={scrollKey} />
    </NavigationProvider>
  );
}
