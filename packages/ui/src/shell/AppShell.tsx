import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { MAIN_CONTENT_ID, SkipLink } from '../a11y/SkipLink';
import { useRouteFocus } from '../a11y/useRouteFocus';
import { CommandPalette } from '../command/CommandPalette';
import { useCommandHotkey } from '../command/useCommandHotkey';
import { readJson, writeJson } from '../lib/storage';
import { useIsDesktop } from '../lib/useMediaQuery';
import { useNavigation } from '../navigation/RouterAdapter';
import { PracticeLeadDrawer } from '../onboarding/PracticeLeadDrawer';
import { PracticeModeBanner } from '../onboarding/PracticeModeBanner';
import { useSession } from '../permissions/SessionProvider';
import { AppHeader } from './AppHeader';
import { HelpDrawer } from './HelpDrawer';
import { useLanguageAnnouncement } from './LocaleSwitcher';
import { MobileNavSheet } from './MobileNavSheet';
import { ShellContext, type ShellContextValue } from './ShellContext';
import { Sidebar } from './Sidebar';
import type { Destination, HelpKey, NavItem, ShellLinks } from './types';

const SIDEBAR_KEY = 'pref:sidebar';

/**
 * Backoffice application shell: skip link, header, sidebar (tablet/desktop) or menu sheet (phone),
 * one <main>, and the global overlays (Ctrl+K, help, practice drawer). Responsive composition,
 * same features at every width (blueprint 01 §5).
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsedPref, setCollapsedPref] = useState<boolean | null>(() => readJson<{ collapsed: boolean | null }>(SIDEBAR_KEY, { collapsed: null }).collapsed);
  const collapsed = collapsedPref ?? !isDesktop;

  useRouteFocus(location.pathname, pageTitle, appName);
  useLanguageAnnouncement();
  useCommandHotkey(useCallback(() => setPaletteOpen((o) => !o), []));

  const value = useMemo<ShellContextValue>(
    () => ({ appName, navItems, destinations, links, helpKey, paletteOpen, setPaletteOpen, mobileNavOpen, setMobileNavOpen }),
    [appName, navItems, destinations, links, helpKey, paletteOpen, mobileNavOpen],
  );

  return (
    <ShellContext.Provider value={value}>
      <div id="app-shell" className="min-h-dvh bg-bg">
        <SkipLink />
        <AppHeader tenantName={tenant.name} />
        <div className="flex">
          <Sidebar
            collapsed={collapsed}
            onToggle={() => {
              writeJson(SIDEBAR_KEY, { collapsed: !collapsed });
              setCollapsedPref(!collapsed);
            }}
          />
          <div className="min-w-0 flex-1">
            <PracticeModeBanner />
            <main id={MAIN_CONTENT_ID} tabIndex={-1} aria-label={pageTitle} className="mx-auto w-full max-w-7xl px-4 py-6 outline-none md:px-6 lg:px-8">
              {children}
            </main>
          </div>
        </div>
      </div>
      <MobileNavSheet tenantName={tenant.name} />
      <CommandPalette />
      <HelpDrawer />
      <PracticeLeadDrawer />
    </ShellContext.Provider>
  );
}

/** Lets a route (e.g. GLOBAL-001 /backoffice/global/command-palette) open the palette. */
export { useShell } from './ShellContext';
