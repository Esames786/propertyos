import { CRM_TOUR, GLOBAL_TOUR, GuidedTourProvider, LAB_TOUR } from '@repo/ui/onboarding';
import { NavigationProvider } from '@repo/ui';
import { useCallback } from 'react';
import { Outlet, ScrollRestoration, useHref, useLocation, useNavigate } from 'react-router';
import { TOUR_LINKS } from '../nav.config';

const TOURS = [GLOBAL_TOUR, CRM_TOUR, LAB_TOUR];

/** Routes that run before or outside the signed-in shell (they ask about the tour themselves). */
const isEntryRoute = (pathname: string) => pathname.startsWith('/backoffice/get-started') || pathname.startsWith('/backoffice/sign-in');

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
      <GuidedTourProvider tours={TOURS} welcomeTourId={GLOBAL_TOUR.id} suppressWelcome={isEntryRoute(location.pathname)} links={TOUR_LINKS}>
        <Outlet />
      </GuidedTourProvider>
      <ScrollRestoration />
    </NavigationProvider>
  );
}
