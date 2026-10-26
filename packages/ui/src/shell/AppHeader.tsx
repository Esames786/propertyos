import { Menu as MenuIcon, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Badge } from '../data/StatusLabel';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { BrandBlock } from './BrandBlock';
import { HelpMenu } from './HelpMenu';
import { LocaleToggle } from './LocaleSwitcher';
import { NotificationsPanel } from './NotificationsPanel';
import { ProjectSwitcher } from './ProjectSwitcher';
import { QuickCreateMenu } from './QuickCreateMenu';
import { useShell } from './ShellContext';
import { UserMenu } from './UserMenu';

/** True once the page has scrolled, so the header can gain its hairline only when content passes under it. */
function useScrolled(threshold = 4) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}

/**
 * Persistent header (blueprint 01 §7): project · search (Ctrl+K) · quick create · language ·
 * notifications · help · user. It floats on the canvas (no heavy bar) and gains a hairline once
 * content scrolls under it. On phones the brand shows here (the rail is hidden), language moves to
 * the menu sheet and, below 640 px, notifications too: density drops, information does not.
 */
export function AppHeader({ tenantName }: { tenantName: string }) {
  const { t } = useT();
  const { setPaletteOpen, setMobileNavOpen } = useShell();
  const scrolled = useScrolled();
  return (
    <header
      aria-label={t('a11y:landmarks.header')}
      data-scrolled={scrolled || undefined}
      className={cn(
        'sticky top-0 z-30 flex h-[var(--header-height)] items-center gap-2 border-b border-transparent bg-bg/85 px-3 backdrop-blur-md transition-[border-color,box-shadow] duration-[var(--motion-regular)] sm:gap-3 sm:px-5 lg:px-8',
        'data-scrolled:border-border data-scrolled:shadow-[0_8px_24px_-18px_rgb(23_33_30/0.35)]',
      )}
    >
      <AriaButton
        data-tour-id="nav-menu-button"
        aria-label={t('common:actions.openMenu')}
        onPress={() => setMobileNavOpen(true)}
        className="grid size-10 shrink-0 place-items-center rounded-control text-text outline-none data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-focus pointer-coarse:size-11 md:hidden"
      >
        <MenuIcon aria-hidden className="size-5" />
      </AriaButton>
      <span className="hidden min-w-0 sm:max-md:flex">
        <BrandBlock tenantName={tenantName} compact />
      </span>
      <ProjectSwitcher />
      <AriaButton
        data-tour-id="command-search"
        onPress={() => setPaletteOpen(true)}
        aria-label={t('nav:header.search')}
        aria-keyshortcuts="Control+K Meta+K"
        data-testid="search-button"
        className={cn(
          'ms-auto flex min-h-10 items-center gap-2.5 rounded-pill bg-panel px-4 text-sm text-muted shadow-inset outline-none pointer-coarse:min-h-11',
          'transition-shadow duration-[var(--motion-fast)] data-hovered:shadow-card data-focus-visible:outline-2 data-focus-visible:outline-focus',
          'max-lg:size-10 max-lg:justify-center max-lg:px-0 max-lg:pointer-coarse:size-11 lg:me-auto lg:ms-2 lg:w-[22rem]',
        )}
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="hidden min-w-0 flex-1 truncate text-start lg:inline">{t('nav:header.searchPlaceholder')}</span>
        <kbd className="ltr-ref hidden rounded-sm bg-sunken px-1.5 py-0.5 text-[11px] text-muted lg:inline">{t('nav:header.searchShortcut')}</kbd>
      </AriaButton>
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <span className="hidden 2xl:inline-flex">
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
