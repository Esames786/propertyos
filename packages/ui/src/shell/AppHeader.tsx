import { Search, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { Tooltip } from '../overlays/Tooltip';
import { BrandBlock } from './BrandBlock';
import { HelpMenu } from './HelpMenu';
import { LocaleToggle } from './LocaleSwitcher';
import { NotificationsPanel } from './NotificationsPanel';
import { ProjectSwitcher } from './ProjectSwitcher';
import { QuickCreateMenu } from './QuickCreateMenu';
import { useShell } from './ShellContext';
import { UserMenu } from './UserMenu';
import { RoleModeChip } from '../identity/AppSwitch';

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
 * The demo notice that persists through every fictional workflow: the full sentence on wide screens,
 * a short "Demo" pill elsewhere (the full sentence is its accessible name and tooltip).
 */
export function DemoEnvironmentPill({ className }: { className?: string }) {
  const { t } = useT();
  const pill = (
    <span
      role="note"
      aria-label={t('nav:demoEnvironment')}
      data-testid="demo-environment"
      className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-demo/30 bg-demo-soft px-2.5 py-1 text-xs font-medium text-demo', className)}
    >
      <ShieldCheck aria-hidden className="size-3.5" />
      <span aria-hidden className="hidden 2xl:inline">{t('nav:demoEnvironment')}</span>
      <span aria-hidden className="2xl:hidden">{t('nav:demoShort')}</span>
    </span>
  );
  return (
    <Tooltip content={t('nav:demoEnvironment')}>
      <AriaButton className="rounded-pill outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus">{pill}</AriaButton>
    </Tooltip>
  );
}

/**
 * Persistent header (blueprint 01 §7): project · search (Ctrl+K) · quick create · language ·
 * notifications · help · user. Desktop: it sits over the content column and gains a hairline once
 * content scrolls under it. Phone: a floating rounded top bar with the brand, the demo pill and the
 * essentials; quick create moves to the bottom bar's centre button and the rest to the More page.
 */
export function AppHeader({ tenantName }: { tenantName: string }) {
  const { t } = useT();
  const { setPaletteOpen, slots, links } = useShell();
  const scrolled = useScrolled();
  return (
    <header
      aria-label={t('a11y:landmarks.header')}
      data-scrolled={scrolled || undefined}
      className={cn(
        'sticky z-30 flex items-center gap-2 transition-[border-color,box-shadow,background-color] duration-[var(--motion-regular)]',
        // Phone: floating rounded bar
        'top-2 mx-2 mt-2 h-16 rounded-[1.25rem] border border-border/80 bg-panel/95 px-2.5 shadow-card backdrop-blur-md',
        // Tablet/desktop: full-width bar over the content
        'md:top-0 md:mx-0 md:mt-0 md:h-[var(--header-height)] md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:border-transparent md:bg-bg/85 md:px-5 md:shadow-none lg:px-8',
        'md:data-scrolled:border-border md:data-scrolled:shadow-[0_8px_24px_-18px_rgb(23_33_30/0.35)]',
      )}
    >
      <span className="flex min-w-0 md:hidden">
        <BrandBlock tenantName={tenantName} compact className="gap-2" />
      </span>
      <span className="min-w-0 max-md:flex-1">{slots.context === undefined ? <ProjectSwitcher /> : slots.context}</span>
      <AriaButton
        data-tour-id="command-search"
        onPress={() => setPaletteOpen(true)}
        aria-label={t('nav:header.search')}
        aria-keyshortcuts="Control+K Meta+K"
        data-testid="search-button"
        className={cn(
          'flex min-h-10 items-center gap-2.5 rounded-pill bg-panel px-4 text-sm text-muted shadow-inset outline-none pointer-coarse:min-h-11 md:ms-auto',
          'transition-shadow duration-[var(--motion-fast)] data-hovered:shadow-card data-focus-visible:outline-2 data-focus-visible:outline-focus',
          'max-lg:size-10 max-lg:justify-center max-lg:px-0 max-lg:pointer-coarse:size-11 lg:me-auto lg:ms-2 lg:w-[22rem]',
        )}
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="hidden min-w-0 flex-1 truncate text-start lg:inline">{t('nav:header.searchPlaceholder')}</span>
        <kbd className="ltr-ref hidden rounded-sm bg-sunken px-1.5 py-0.5 text-mini text-muted lg:inline">{t('nav:header.searchShortcut')}</kbd>
      </AriaButton>
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <span className="max-xs:hidden">
          <DemoEnvironmentPill />
        </span>
        <span className="hidden md:inline-flex lg:hidden">{slots.create === undefined ? <QuickCreateMenu variant="compact" /> : slots.create?.compact}</span>
        <span className="hidden lg:inline-flex">{slots.create === undefined ? <QuickCreateMenu /> : slots.create?.header}</span>
        <span className="hidden md:inline-flex">
          <LocaleToggle />
        </span>
        <span className="max-sm:hidden">
          <NotificationsPanel />
        </span>
        <HelpMenu />
        {links.appSwitchUrl && <RoleModeChip app="backoffice" className="max-lg:hidden" />}
        <UserMenu />
      </div>
    </header>
  );
}
