import { CustomerShell, DemoSignIn, IconButton, MenuButton, NavigationProvider, useSession, useT } from '@repo/ui';
import { GuidedTourProvider, PORTAL_TOUR, useGuidedTour } from '@repo/ui/onboarding';
import { Accessibility, CircleHelp, Compass, LogOut } from 'lucide-react';
import { useCallback } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Outlet, ScrollRestoration, useHref, useLocation, useMatches, useNavigate } from 'react-router';
import { CUSTOMER_BOTTOM_NAV, CUSTOMER_CENTRE_ACTION, CUSTOMER_NAV_ALIASES, CUSTOMER_NAV_GROUPS, PORTAL, START } from '../nav.config';

export interface CustomerHandle {
  title: (t: ReturnType<typeof useT>['t'], data: unknown) => string;
}

/**
 * Prototype glue for the customer web/PWA. The same router-agnostic UI as the backoffice, with the
 * owner tour (PORTAL-TOUR-001) offered on first sign-in and replayable from the header help button.
 */
export function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const nav = useCallback((href: string, options?: { replace?: boolean }) => navigate(href, { replace: options?.replace }), [navigate]);
  return (
    <NavigationProvider navigate={nav} location={location} useHref={useHref}>
      <GuidedTourProvider
        tours={[PORTAL_TOUR]}
        welcomeTourId={PORTAL_TOUR.id}
        links={{ start: START, help: START, library: PORTAL.tours, practice: START, textGuide: () => PORTAL.tours }}
      >
        <SignedIn />
      </GuidedTourProvider>
      <ScrollRestoration />
    </NavigationProvider>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/** Header end: replay the tour, and the account menu (preferences, tour, sign out). */
function HeaderActions() {
  const { t } = useT();
  const { persona, signOut } = useSession();
  const tour = useGuidedTour();
  if (!persona) return null;
  return (
    <>
      <IconButton label={t('portal:shell.help')} icon={CircleHelp} onPress={() => tour.start(PORTAL_TOUR.id)} data-tour-id="portal-help" data-testid="portal-help" />
      <MenuButton
        label={t('portal:shell.account', { name: persona.displayName })}
        trigger={
          <AriaButton
            aria-label={t('portal:shell.account', { name: persona.displayName })}
            data-testid="portal-account"
            className="grid size-10 shrink-0 place-items-center rounded-pill bg-primary text-sm font-semibold text-on-primary shadow-[inset_0_0_0_1.5px_rgb(181_138_71/0.6)] outline-none transition-transform duration-[var(--motion-fast)] data-hovered:scale-[1.04] data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus pointer-coarse:size-11"
          >
            <span aria-hidden>{initials(persona.displayName)}</span>
          </AriaButton>
        }
        groups={[
          {
            id: 'who',
            title: t('portal:shell.signedInAs', { name: persona.displayName }),
            items: [
              { id: 'accessibility', label: t('portal:shell.accessibility'), icon: Accessibility, href: PORTAL.accessibility },
              { id: 'tour', label: t('portal:shell.replayTour'), icon: Compass },
            ],
          },
          { id: 'session', items: [{ id: 'signout', label: t('portal:shell.signOut'), icon: LogOut, testId: 'customer-sign-out' }] },
        ]}
        onAction={(id) => {
          if (id === 'tour') tour.start(PORTAL_TOUR.id);
          if (id === 'signout') signOut();
        }}
      />
    </>
  );
}

function SignedIn() {
  const { t } = useT();
  const { persona } = useSession();
  const matches = useMatches();
  const appName = t('portal:shell.ownerPortal');
  const match = [...matches].reverse().find((m) => (m.handle as CustomerHandle | undefined)?.title);
  const pageTitle = match ? (match.handle as CustomerHandle).title(t, match.data) : appName;
  if (!persona) return <DemoSignIn appName={t('common:app.customerPortal')} />;
  return (
    <CustomerShell
      appName={appName}
      navGroups={CUSTOMER_NAV_GROUPS}
      bottomItems={CUSTOMER_BOTTOM_NAV}
      centreAction={CUSTOMER_CENTRE_ACTION}
      aliases={CUSTOMER_NAV_ALIASES}
      pageTitle={pageTitle}
      headerEnd={<HeaderActions />}
    >
      <Outlet />
    </CustomerShell>
  );
}
