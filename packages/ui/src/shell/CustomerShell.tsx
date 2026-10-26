import { type ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { MAIN_CONTENT_ID, SkipLink } from '../a11y/SkipLink';
import { useRouteFocus } from '../a11y/useRouteFocus';
import { Badge } from '../data/StatusLabel';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { useNavigation } from '../navigation/RouterAdapter';
import { useSession } from '../permissions/SessionProvider';
import { LocaleToggle, useLanguageAnnouncement } from './LocaleSwitcher';
import { isCurrent } from './NavList';
import type { NavItem } from './types';

/**
 * Customer/owner/resident shell: one component tree for phone and desktop (blueprint 01 §5).
 * Phone: bottom navigation (Home | Property | Payments | Services | Profile).
 * Tablet/desktop: the same items as a side navigation. Body text is 16 px+.
 */
export function CustomerShell({
  appName,
  navItems,
  pageTitle,
  headerEnd,
  children,
}: {
  appName: string;
  navItems: NavItem[];
  pageTitle: string;
  headerEnd?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useT();
  const { tenant } = useSession();
  const { location } = useNavigation();
  useRouteFocus(location.pathname, pageTitle, appName);
  useLanguageAnnouncement();

  const item = (n: NavItem, variant: 'side' | 'bottom') => {
    const current = isCurrent(location.pathname, n);
    const Icon = n.icon;
    return (
      <li key={n.id} className={variant === 'bottom' ? 'flex-1' : undefined}>
        <Link
          href={n.href}
          aria-current={current ? 'page' : undefined}
          data-tour-id={`portal-nav-${n.id}`}
          className={cn(
            'outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-[-2px] data-focus-visible:outline-focus',
            variant === 'bottom'
              ? 'relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs'
              : 'relative flex min-h-11 items-center gap-3 rounded-control px-3 text-base data-hovered:bg-sunken',
            current ? 'font-semibold text-primary' : 'text-muted',
            variant === 'side' && current && 'bg-primary-soft',
          )}
        >
          <Icon aria-hidden className={variant === 'bottom' ? 'size-6' : 'size-5'} />
          <span>{t(n.labelKey as 'nav:customer.home')}</span>
          {variant === 'bottom' && current && <span aria-hidden className="absolute top-0 h-0.5 w-10 rounded-pill bg-primary" />}
        </Link>
      </li>
    );
  };

  return (
    <div id="app-shell" className="min-h-dvh bg-bg [--body-size:1rem]">
      <SkipLink />
      <header aria-label={t('a11y:landmarks.header')} className="sticky top-0 z-30 flex h-[var(--header-height)] items-center gap-3 border-b border-border bg-panel/95 px-4 backdrop-blur">
        <span aria-hidden className="grid size-9 place-items-center rounded-control bg-primary font-bold text-on-primary">
          {tenant.name.charAt(0)}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate font-semibold text-text">
            <bdi>{tenant.name}</bdi>
          </span>
          <span className="block truncate text-xs text-muted">{appName}</span>
        </span>
        <span className="hidden sm:inline-flex">
          <Badge tone="demo">{t('common:app.prototypeBadge')}</Badge>
        </span>
        <LocaleToggle compact={false} className="max-xs:px-2" />
        {headerEnd}
      </header>
      <div className="mx-auto flex max-w-6xl gap-8 md:px-6 md:py-6">
        <nav aria-label={t('nav:customer.nav')} className="sticky top-[calc(var(--header-height)+1.5rem)] hidden h-fit w-56 shrink-0 md:block">
          <ul className="space-y-1">{navItems.map((n) => item(n, 'side'))}</ul>
        </nav>
        <main id={MAIN_CONTENT_ID} tabIndex={-1} aria-label={pageTitle} className="min-w-0 flex-1 px-4 py-6 pb-28 text-base outline-none md:px-0 md:py-0 md:pb-6">
          {children}
        </main>
      </div>
      <nav aria-label={t('nav:customer.nav')} className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-panel pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="relative flex">{navItems.map((n) => item(n, 'bottom'))}</ul>
      </nav>
    </div>
  );
}
