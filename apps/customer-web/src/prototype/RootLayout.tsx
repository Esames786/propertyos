import { CustomerShell, DemoSignIn, IconButton, MenuButton, NavigationProvider, TextSizeWelcome, useDisplayPreferences, useSession, useT } from '@repo/ui';
import { DUES_TOUR, GuidedTourProvider, PORTAL_TOUR, useGuidedTour } from '@repo/ui/onboarding';
import { Accessibility, CircleHelp, Compass, LogOut, Type } from 'lucide-react';
import { useCallback } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Outlet, ScrollRestoration, useHref, useLocation, useMatches, useNavigate } from 'react-router';
import { CUSTOMER_BOTTOM_NAV, CUSTOMER_CENTRE_ACTION, CUSTOMER_NAV_ALIASES, CUSTOMER_NAV_GROUPS, DUES, DUES_BOTTOM_NAV, DUES_CENTRE_ACTION, DUES_NAV_ALIASES, DUES_NAV_GROUPS, PORTAL, START } from '../nav.config';

export interface CustomerHandle {
  title: (t: ReturnType<typeof useT>['t'], data: unknown) => string;
}

/** A society resident (the dues edition): their organisation licenses dues. */
export function useIsDuesResident(): boolean {
  const { persona, allows } = useSession();
  return !!persona && allows({ module: 'dues' });
}

const TOUR_OF = (personaId: string) => (DUES_TOUR.applicablePersonas.includes(personaId) ? DUES_TOUR.id : PORTAL_TOUR.id);

/**
 * Prototype glue for the customer web/PWA. One app, two editions: a developer's buyer (instalments,
 * construction, services) and a society's resident (bills, payment, receipts, statement). On first
 * sign-in a resident chooses their text size (owner, C.2) before anything else; the welcome tour is
 * offered after that, never on top of it.
 */
export function RootLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const display = useDisplayPreferences();
  const nav = useCallback((href: string, options?: { replace?: boolean }) => navigate(href, { replace: options?.replace }), [navigate]);
  return (
    <NavigationProvider navigate={nav} location={location} useHref={useHref}>
      <GuidedTourProvider
        tours={[PORTAL_TOUR, DUES_TOUR]}
        welcomeTourId={TOUR_OF}
        suppressWelcome={display.signedIn && !display.saved}
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

/** Header end: replay the tour, and the account menu (text size, preferences, tour, sign out). */
function HeaderActions() {
  const { t } = useT();
  const { persona, signOut } = useSession();
  const tour = useGuidedTour();
  const dues = useIsDuesResident();
  const tourId = persona ? TOUR_OF(persona.id) : PORTAL_TOUR.id;
  if (!persona) return null;
  return (
    <>
      <IconButton label={t('portal:shell.help')} icon={CircleHelp} onPress={() => tour.start(tourId)} data-tour-id="portal-help" data-testid="portal-help" />
      <MenuButton
        label={t('portal:shell.account', { name: persona.displayName })}
        trigger={
          <AriaButton
            aria-label={t('portal:shell.account', { name: persona.displayName })}
            data-testid="portal-account"
            className="grid size-10 shrink-0 place-items-center rounded-pill bg-primary text-chrome font-semibold text-on-primary shadow-[inset_0_0_0_1.5px_rgb(181_138_71/0.6)] outline-none transition-transform duration-[var(--motion-fast)] data-hovered:scale-[1.04] data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus pointer-coarse:size-11"
          >
            <span aria-hidden>{initials(persona.displayName)}</span>
          </AriaButton>
        }
        groups={[
          {
            id: 'who',
            title: t('portal:shell.signedInAs', { name: persona.displayName }),
            items: [
              { id: 'text-size', label: t('a11y:textSize.menu'), icon: Type, href: `${PORTAL.accessibility}#text-size`, testId: 'menu-text-size' },
              { id: 'accessibility', label: t('portal:shell.accessibility'), icon: Accessibility, href: PORTAL.accessibility },
              { id: 'tour', label: t('portal:shell.replayTour'), icon: Compass },
            ],
          },
          { id: 'session', items: [{ id: 'signout', label: t('portal:shell.signOut'), icon: LogOut, testId: 'customer-sign-out' }] },
        ]}
        onAction={(id) => {
          if (id === 'tour') tour.start(dues ? DUES_TOUR.id : PORTAL_TOUR.id);
          if (id === 'signout') signOut();
        }}
      />
    </>
  );
}

function SignedIn() {
  const { t } = useT();
  const { persona, tenant } = useSession();
  const display = useDisplayPreferences();
  const dues = useIsDuesResident();
  const matches = useMatches();
  const appName = dues ? t('dues:shell.appName') : t('portal:shell.ownerPortal');
  const match = [...matches].reverse().find((m) => (m.handle as CustomerHandle | undefined)?.title);
  const pageTitle = match ? (match.handle as CustomerHandle).title(t, match.data) : appName;
  if (!persona) return <DemoSignIn appName={t('common:app.customerPortal')} describe={(p) => (p.tenantId === 'tnt_alnoor' ? t('dues:signIn.describe') : t('common:demo.scopeOne', { project: 'Larkspur Heights' }))} />;
  // First run: one short, welcoming step to choose a comfortable text size (changeable later).
  if (!display.saved) return <TextSizeWelcome appName={appName} organisation={tenant.name} />;
  return (
    <CustomerShell
      appName={appName}
      navGroups={dues ? DUES_NAV_GROUPS : CUSTOMER_NAV_GROUPS}
      bottomItems={dues ? DUES_BOTTOM_NAV : CUSTOMER_BOTTOM_NAV}
      centreAction={dues ? DUES_CENTRE_ACTION : CUSTOMER_CENTRE_ACTION}
      aliases={dues ? DUES_NAV_ALIASES : CUSTOMER_NAV_ALIASES}
      pageTitle={pageTitle}
      headerEnd={<HeaderActions />}
    >
      <Outlet />
    </CustomerShell>
  );
}

export { DUES };
