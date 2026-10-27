import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { MAIN_CONTENT_ID, SkipLink } from '../a11y/SkipLink';
import { useRouteFocus } from '../a11y/useRouteFocus';
import { CommandPalette } from '../command/CommandPalette';
import { useCommandHotkey } from '../command/useCommandHotkey';
import { NewLeadDrawer } from '../crm/NewLeadDrawer';
import { ScheduleVisitDrawer } from '../crm/ScheduleVisitDrawer';
import { readJson, writeJson } from '../lib/storage';
import { useIsDesktop } from '../lib/useMediaQuery';
import { PageEnter } from '../motion/Reveal';
import { useNavigation } from '../navigation/RouterAdapter';
import { PracticeLeadDrawer } from '../onboarding/PracticeLeadDrawer';
import { PracticeModeBanner } from '../onboarding/PracticeModeBanner';
import { useSession } from '../permissions/SessionProvider';
import { AppHeader } from './AppHeader';
import { BottomNav } from './BottomNav';
import { HelpDrawer } from './HelpDrawer';
import { useLanguageAnnouncement } from './LocaleSwitcher';
import { ShellContext, type ShellContextValue } from './ShellContext';
import { Sidebar } from './Sidebar';
import type { Destination, HelpKey, NavItem, ShellLinks } from './types';

const SIDEBAR_KEY = 'pref:sidebar';

/**
 * Backoffice application shell: skip link, white rail (tablet/desktop) or floating top bar + bottom
 * bar with a centre Quick create button and a More page (phone), a header over the content column,
 * one <main> whose page settles in on navigation, and the global overlays (Ctrl+K, help, the demo
 * New lead / Schedule visit drawers, the practice drawer). Same features at every width (01 §5).
 */
export function AppShell({
  appName,
  navItems,
  destinations,
  links,
  pageTitle,
  helpKey = 'default',
  children,
}: {
  appName: string;
  navItems: NavItem[];
  destinations: Destination[];
  links: ShellLinks;
  pageTitle: string;
  helpKey?: HelpKey;
  children: ReactNode;
}) {
  const { tenant } = useSession();
  const { location } = useNavigation();
  const isDesktop = useIsDesktop();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsedPref, setCollapsedPref] = useState<boolean | null>(() => readJson<{ collapsed: boolean | null }>(SIDEBAR_KEY, { collapsed: null }).collapsed);
  const collapsed = collapsedPref ?? !isDesktop;

  useRouteFocus(location.pathname, pageTitle, appName);
  useLanguageAnnouncement();
  useCommandHotkey(useCallback(() => setPaletteOpen((o) => !o), []));

  const value = useMemo<ShellContextValue>(
    () => ({ appName, navItems, destinations, links, helpKey, paletteOpen, setPaletteOpen }),
    [appName, navItems, destinations, links, helpKey, paletteOpen],
  );

  return (
    <ShellContext.Provider value={value}>
      <div id="app-shell" className="min-h-dvh bg-bg md:flex">
        <SkipLink />
        <Sidebar
          tenantName={tenant.name}
          collapsed={collapsed}
          onToggle={() => {
            writeJson(SIDEBAR_KEY, { collapsed: !collapsed });
            setCollapsedPref(!collapsed);
          }}
        />
        <div className="min-w-0 flex-1">
          <AppHeader tenantName={tenant.name} />
          <PracticeModeBanner />
          <main
            id={MAIN_CONTENT_ID}
            tabIndex={-1}
            aria-label={pageTitle}
            className="mx-auto w-full max-w-[90rem] px-4 pt-5 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+2.75rem)] outline-none sm:px-5 md:pt-4 md:pb-10 lg:px-8"
          >
            <PageEnter id={location.pathname}>{children}</PageEnter>
          </main>
        </div>
        <BottomNav />
      </div>
      <CommandPalette />
      <HelpDrawer />
      <NewLeadDrawer />
      <ScheduleVisitDrawer />
      <PracticeLeadDrawer />
    </ShellContext.Provider>
  );
}

/** Lets a route (e.g. GLOBAL-001 /backoffice/global/command-palette) open the palette. */
export { useShell } from './ShellContext';
