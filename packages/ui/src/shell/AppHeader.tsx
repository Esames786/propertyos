import { Menu as MenuIcon, Search } from 'lucide-react';
import { Button as AriaButton } from 'react-aria-components';
import { Badge } from '../data/StatusLabel';
import { useT } from '../lib/useT';
import { HelpMenu } from './HelpMenu';
import { LocaleToggle } from './LocaleSwitcher';
import { NotificationsPanel } from './NotificationsPanel';
import { ProjectSwitcher } from './ProjectSwitcher';
import { QuickCreateMenu } from './QuickCreateMenu';
import { useShell } from './ShellContext';
import { UserMenu } from './UserMenu';

/**
 * Persistent header (blueprint 01 §7): tenant · project · search (Ctrl+K) · quick create ·
 * language · notifications · help · user. Density drops on phones, not information: language
 * and (below 360 px) notifications move into the menu sheet.
 */
export function AppHeader({ tenantName }: { tenantName: string }) {
  const { t } = useT();
  const { appName, setPaletteOpen, setMobileNavOpen } = useShell();
  return (
    <header
      aria-label={t('a11y:landmarks.header')}
      className="sticky top-0 z-30 flex h-[var(--header-height)] items-center gap-2 border-b border-border bg-panel/95 px-2 backdrop-blur sm:gap-3 sm:px-4"
    >
      <AriaButton
        data-tour-id="nav-menu-button"
        aria-label={t('common:actions.openMenu')}
        onPress={() => setMobileNavOpen(true)}
        className="grid size-10 shrink-0 place-items-center rounded-control text-muted data-hovered:bg-sunken pointer-coarse:size-11 md:hidden"
      >
        <MenuIcon aria-hidden className="size-5" />
      </AriaButton>
      <div className="hidden min-w-0 items-center gap-3 md:flex md:w-[calc(var(--sidebar-width)-1rem)]">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-control bg-primary text-sm font-bold text-on-primary">
          {tenantName.charAt(0)}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-text">
            <bdi>{tenantName}</bdi>
          </span>
          <span className="block truncate text-xs text-muted">
            {appName} · <span title={t('common:app.codenameNote')}>{t('common:app.productName')}</span>
          </span>
        </span>
      </div>
      <ProjectSwitcher />
      <AriaButton
        data-tour-id="command-search"
        onPress={() => setPaletteOpen(true)}
        aria-label={t('nav:header.search')}
        aria-keyshortcuts="Control+K Meta+K"
        data-testid="search-button"
        className="ms-auto flex min-h-10 items-center gap-2 rounded-control border border-border-control bg-bg px-3 text-sm text-muted data-hovered:bg-sunken pointer-coarse:min-h-11 max-lg:size-10 max-lg:justify-center max-lg:px-0 max-lg:pointer-coarse:size-11 lg:me-auto lg:ms-4 lg:w-80"
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="hidden min-w-0 flex-1 truncate text-start lg:inline">{t('nav:header.searchPlaceholder')}</span>
        <kbd className="ltr-ref hidden rounded-sm border border-border px-1.5 text-xs lg:inline">{t('nav:header.searchShortcut')}</kbd>
      </AriaButton>
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <span className="hidden xl:inline-flex">
          <Badge tone="demo">{t('common:app.prototypeBadge')}</Badge>
        </span>
        <span className="lg:hidden">
          <QuickCreateMenu compact />
        </span>
        <span className="hidden lg:inline-flex">
          <QuickCreateMenu />
        </span>
        <span className="hidden md:inline-flex">
          <LocaleToggle />
        </span>
        <span className="max-sm:hidden">
          <NotificationsPanel />
        </span>
        <HelpMenu />
        <UserMenu />
      </div>
    </header>
  );
}
