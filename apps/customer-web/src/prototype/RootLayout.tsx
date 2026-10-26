import { CustomerShell, DemoSignIn, IconButton, NavigationProvider, useSession, useT } from '@repo/ui';
import { GuidedTourProvider } from '@repo/ui/onboarding';
import { LogOut } from 'lucide-react';
import { useCallback } from 'react';
import { Outlet, ScrollRestoration, useHref, useLocation, useMatches, useNavigate } from 'react-router';
import { CUSTOMER_NAV, START } from '../nav.config';

export interface CustomerHandle {
  title: (t: ReturnType<typeof useT>['t'], data: unknown) => string;
}

/**
 * Prototype glue for the customer web/PWA. The same router-agnostic UI as the backoffice; the guided
 * tour engine is wired with no tours yet (the resident tour arrives in Stage 4).
 */
export function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const nav = useCallback((href: string, options?: { replace?: boolean }) => navigate(href, { replace: options?.replace }), [navigate]);
  return (
    <NavigationProvider navigate={nav} location={location} useHref={useHref}>
      <GuidedTourProvider
        tours={[]}
        links={{ start: START, help: START, library: '/customer/portal/help/tours', practice: START, textGuide: () => START }}
      >
        <SignedIn />
      </GuidedTourProvider>
      <ScrollRestoration />
    </NavigationProvider>
  );
}

function SignedIn() {
  const { t } = useT();
  const { persona, signOut } = useSession();
  const matches = useMatches();
  const appName = t('common:app.customerPortal');
  const match = [...matches].reverse().find((m) => (m.handle as CustomerHandle | undefined)?.title);
  const pageTitle = match ? (match.handle as CustomerHandle).title(t, match.data) : appName;
  if (!persona) return <DemoSignIn appName={appName} />;
  return (
    <CustomerShell
      appName={appName}
      navItems={CUSTOMER_NAV}
      pageTitle={pageTitle}
      headerEnd={<IconButton label={t('common:demo.signOut')} icon={LogOut} onPress={signOut} data-testid="customer-sign-out" />}
    >
      <Outlet />
    </CustomerShell>
  );
}
