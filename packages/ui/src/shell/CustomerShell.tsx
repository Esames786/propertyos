import { ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { MAIN_CONTENT_ID, SkipLink } from '../a11y/SkipLink';
import { useRouteFocus } from '../a11y/useRouteFocus';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { PageEnter } from '../motion/Reveal';
import { useNavigation } from '../navigation/RouterAdapter';
import { useSession } from '../permissions/SessionProvider';
import { useDisplayPreferences } from '../preferences/DisplayPreferences';
import { useReducedMotion } from '../preferences/PreferencesProvider';
import { LocaleToggle, useLanguageAnnouncement } from './LocaleSwitcher';
import { isCurrent } from './NavList';
import type { NavItem } from './types';

/** A labelled group of the side navigation (tablet/desktop). */
export interface CustomerNavGroup {
  id: string;
  /** Translation key of the group label; the first group is usually unlabelled. */
  labelKey?: string;
  items: NavItem[];
}

const label = (t: ReturnType<typeof useT>['t'], key: string) => t(key as 'portal:nav.home');

/**
 * True while a text field has focus (on a phone the keyboard is open): the floating bottom bar steps
 * aside so it never covers the field or the keyboard's view of the page, and returns on blur.
 */
function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isText = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [contenteditable="true"]');
    const onIn = (e: FocusEvent) => setTyping(isText(e.target));
    const onOut = (e: FocusEvent) => {
      if (!isText(e.relatedTarget)) setTyping(false);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);
  return typing;
}

/** True once the page has scrolled, so the desktop header gains its hairline only when content passes under it. */
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

function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-[12px] bg-primary font-display text-xl leading-none text-on-primary shadow-[inset_0_0_0_1px_rgb(181_138_71/0.55)]',
        className,
      )}
    >
      {name.charAt(0)}
    </span>
  );
}

/**
 * Phones: the page's scroll padding equals the floating header above and the bottom bar below, so a
 * control reached with the keyboard (or an in-page link) is never left under either of them.
 */
function ScrollPadding() {
  return <style>{`@media (max-width: 47.99rem) { html { scroll-padding-top: 6.5rem; scroll-padding-bottom: calc(4.75rem + max(0.75rem, env(safe-area-inset-bottom)) + 1.5rem); } }`}</style>;
}

/** The persistent demo notice: a short pill on small screens, the full sentence on wide ones (always its accessible name). */
function DemoPill({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <span
      role="note"
      data-testid="demo-environment"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-pill border border-demo/30 bg-demo-soft px-2 py-0.5 text-nav font-medium text-demo',
        className,
      )}
    >
      <ShieldCheck aria-hidden className="size-3.5 shrink-0" />
      <span aria-hidden className="xl:hidden">
        {t('portal:shell.demoShort')}
      </span>
      <span className="sr-only xl:not-sr-only">{t('portal:shell.demoFull')}</span>
    </span>
  );
}

/**
 * Customer / owner / resident shell: one component tree for phone and desktop (blueprint 01 §5).
 *
 * - Phone: a floating rounded top bar (monogram, tenant, demo pill, language, help and account) and a
 *   floating bottom bar with four destinations split around a raised round centre action (Pay).
 * - Tablet/desktop: a white, grouped side rail like the backoffice (with the centre action as its
 *   primary button) and a header over the content.
 *
 * Labels are always visible; the current item carries `aria-current` plus a sliding marker (motion
 * `layoutId`, instant under reduced motion). Body text is 16 px+.
 */
export function CustomerShell({
  appName,
  navGroups,
  bottomItems,
  centreAction,
  aliases = {},
  pageTitle,
  headerEnd,
  children,
}: {
  appName: string;
  /** Side navigation on tablet/desktop. */
  navGroups: CustomerNavGroup[];
  /** Phone bottom bar: four destinations, two either side of the centre action. */
  bottomItems: NavItem[];
  /** The most-used action: raised round button on phones, primary button in the rail elsewhere. */
  centreAction?: NavItem;
  /** Path prefixes that belong to a nav item (e.g. a receipt page belongs to Payments). */
  aliases?: Record<string, string>;
  pageTitle: string;
  headerEnd?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useT();
  const { tenant } = useSession();
  const { location } = useNavigation();
  const reduced = useReducedMotion();
  const scrolled = useScrolled();
  const typing = useTyping();
  // From Large text up, the phone header keeps to one line: the organisation's monogram stands for
  // its name (read in full by screen readers, and shown on the page and in the account menu)
  // instead of a name wrapping word by word. The person's chosen size still applies to the page.
  const { textScale } = useDisplayPreferences();
  const compactHeader = textScale >= 1.25;
  useRouteFocus(location.pathname, pageTitle, appName);
  useLanguageAnnouncement();

  const aliasId = Object.entries(aliases).find(
    ([prefix]) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`),
  )?.[1];
  const current = (n: NavItem) => (aliasId ? aliasId === n.id : isCurrent(location.pathname, n));
  const spring = reduced
    ? { duration: 0 }
    : { type: 'spring' as const, bounce: 0.22, duration: 0.45 };
  const focusRing = 'outline-none data-focus-visible:outline-2 data-focus-visible:outline-focus';
  const half = Math.ceil(bottomItems.length / 2);

  const bottomItem = (n: NavItem) => {
    const Icon = n.icon;
    const on = current(n);
    return (
      <li key={n.id} className="min-w-0">
        <Link
          href={n.href}
          aria-current={on ? 'page' : undefined}
          data-tour-id={`portal-nav-${n.id}`}
          className={cn(
            '@container flex h-full min-h-14 flex-col items-center justify-center gap-0.5 rounded-[1rem] px-0.5 text-nav leading-tight font-medium data-focus-visible:outline-offset-[-3px]',
            focusRing,
            on ? 'font-semibold text-primary' : 'text-muted data-hovered:text-text',
          )}
        >
          <span className="relative grid h-8 w-12 place-items-center">
            {on && (
              <motion.span
                layoutId="portal-bottom-pill"
                aria-hidden
                transition={spring}
                className="absolute inset-0 rounded-pill bg-primary-soft"
              />
            )}
            <Icon aria-hidden className="relative size-5" strokeWidth={on ? 2.2 : 1.8} />
          </span>
          {/* Never larger than the slot allows (18 % of its width fits "Statement" on a 320 px phone). */}
          <span className="max-w-full truncate text-[length:min(var(--text-nav),18cqi)]">{label(t, n.labelKey)}</span>
        </Link>
      </li>
    );
  };

  const CentreIcon = centreAction?.icon;
  const centreOn = centreAction ? current(centreAction) : false;

  return (
    <div
      id="app-shell"
      className="min-h-dvh bg-bg [--body-size:var(--text-base)] [--portal-nav-height:4.75rem] [--portal-nav-space:calc(var(--portal-nav-height)+max(0.75rem,env(safe-area-inset-bottom))+3rem)] md:flex"
    >
      <ScrollPadding />
      <SkipLink />

      {/* Tablet / desktop rail */}
      <div className="hidden w-[var(--sidebar-width)] shrink-0 border-e border-border bg-panel md:block">
        <aside
          aria-label={t('a11y:landmarks.sidebar')}
          className="sticky top-0 flex h-dvh flex-col"
        >
          <div className="flex h-[var(--header-height)] shrink-0 items-center gap-3 border-b border-border/70 px-5">
            <Monogram name={tenant.name} />
            <span className="min-w-0 leading-tight">
              <span className="line-clamp-2 font-display text-base leading-tight text-text">
                <bdi>{tenant.name}</bdi>
              </span>
              <span className="block truncate text-xs text-muted">{appName}</span>
            </span>
          </div>
          {centreAction && CentreIcon && (
            <div className="px-3 pt-4">
              <Link
                href={centreAction.href}
                aria-current={centreOn ? 'page' : undefined}
                data-testid="portal-rail-action"
                className={cn(
                  'group flex min-h-12 w-full items-center justify-center gap-2 rounded-tile bg-primary px-4 text-md font-semibold text-on-primary shadow-fab',
                  'transition-[translate,background-color] duration-[var(--motion-fast)] data-hovered:-translate-y-0.5 data-hovered:bg-primary-hover data-pressed:translate-y-0',
                  'data-focus-visible:outline-offset-2',
                  focusRing,
                )}
              >
                <CentreIcon aria-hidden className="size-5" />
                {t('portal:nav.payLong')}
              </Link>
            </div>
          )}
          <nav
            aria-label={t('portal:nav.label')}
            data-tour-id="portal-side-nav"
            className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pt-5 pb-4"
          >
            {navGroups.map((g) => (
              <div key={g.id}>
                {g.labelKey && (
                  <p className="mb-2 px-3 text-mini font-semibold tracking-[0.08em] text-muted uppercase">
                    {label(t, g.labelKey)}
                  </p>
                )}
                <ul className="space-y-1">
                  {g.items.map((n) => {
                    const Icon = n.icon;
                    const on = current(n);
                    return (
                      <li key={n.id}>
                        <Link
                          href={n.href}
                          aria-current={on ? 'page' : undefined}
                          data-tour-id={`portal-side-${n.id}`}
                          className={cn(
                            'relative flex min-h-11 items-center gap-3 rounded-tile px-3 text-md data-focus-visible:outline-offset-[-2px]',
                            'transition-[background-color,color] duration-[var(--motion-fast)]',
                            focusRing,
                            on
                              ? 'bg-primary-soft font-semibold text-primary'
                              : 'text-muted data-hovered:bg-sunken data-hovered:text-text',
                          )}
                        >
                          {on && (
                            <motion.span
                              layoutId="portal-side-marker"
                              aria-hidden
                              transition={spring}
                              className="absolute inset-y-2.5 start-1 w-[3px] rounded-pill bg-primary"
                            />
                          )}
                          <Icon
                            aria-hidden
                            className="size-5 shrink-0"
                            strokeWidth={on ? 2.1 : 1.8}
                          />
                          <span className="truncate">{label(t, n.labelKey)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
          <div className="border-t border-border/70 p-4">
            <DemoPill className="max-w-full whitespace-normal" />
          </div>
        </aside>
      </div>

      <div className="min-w-0 flex-1">
        <header
          aria-label={t('a11y:landmarks.header')}
          data-scrolled={scrolled || undefined}
          data-compact={compactHeader || undefined}
          data-testid="portal-header"
          className={cn(
            'sticky z-30 flex items-center gap-2 transition-[border-color,box-shadow] duration-[var(--motion-regular)]',
            // Phone: floating rounded bar
            'top-2 mx-2 mt-2 min-h-16 rounded-[1.25rem] border border-border/80 bg-panel/95 py-1.5 ps-2.5 pe-1.5 shadow-card backdrop-blur-md',
            // Tablet/desktop: a bar over the content column
            'md:top-0 md:mx-0 md:mt-0 md:h-[var(--header-height)] md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:border-transparent md:bg-bg/85 md:px-8 md:shadow-none',
            'md:data-scrolled:border-border md:data-scrolled:shadow-[0_8px_24px_-18px_rgb(23_33_30/0.35)]',
          )}
        >
          <Monogram name={tenant.name} className="size-9 text-lg md:hidden" />
          <span className="min-w-0 flex-1 leading-tight">
            {/* Inline-block with its own direction: a Latin name keeps its order in Urdu too. */}
            <span className={cn('block text-chrome font-semibold text-text md:hidden', compactHeader && 'sr-only')} data-testid="portal-header-name">
              <span dir="auto" className="inline-block max-w-full align-bottom [overflow-wrap:anywhere]">
                {tenant.name}
              </span>
            </span>
            <span className="hidden truncate text-sm font-medium text-muted md:block">
              {appName}
            </span>
            <DemoPill className="mt-0.5 md:hidden" />
          </span>
          <span className="hidden md:inline-flex">
            <DemoPill className="py-1 text-xs" />
          </span>
          {/* Below 360px the button is icon-only (its name is still spoken) so the organisation name fits. */}
          <LocaleToggle className="text-chrome max-xs:px-2.5 max-md:min-h-10 max-md:px-3 max-xs:[&>span]:sr-only" />
          {headerEnd}
        </header>

        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          aria-label={pageTitle}
          className="mx-auto w-full max-w-6xl px-4 pt-5 pb-[var(--portal-nav-space)] text-base outline-none sm:px-5 md:px-8 md:pt-4 md:pb-12"
        >
          <PageEnter id={location.pathname}>{children}</PageEnter>
        </main>
      </div>

      {/* Phone bottom bar with a raised centre action */}
      <nav
        aria-label={t('portal:nav.label')}
        data-tour-id="portal-bottom-nav"
        data-testid="portal-bottom-nav"
        data-typing={typing || undefined}
        inert={typing}
        className={cn(
          'fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 rounded-[1.5rem] border border-border/80 bg-panel/95 shadow-lift backdrop-blur-md transition-transform duration-[var(--motion-fast)] motion-reduce:transition-none md:hidden',
          typing && 'translate-y-[calc(100%+2rem)]',
        )}
      >
        <ul className="mx-auto grid h-[var(--portal-nav-height)] max-w-lg grid-cols-5 items-stretch gap-0.5 px-1.5 py-1">
          {bottomItems.slice(0, half).map(bottomItem)}
          {centreAction && CentreIcon ? (
            <li className="relative min-w-0">
              <Link
                href={centreAction.href}
                aria-current={centreOn ? 'page' : undefined}
                data-tour-id="portal-centre-action"
                data-testid="portal-centre-action"
                className={cn(
                  'group flex h-full flex-col items-center justify-end gap-0.5 rounded-[1rem] pb-1 text-nav leading-tight font-semibold data-focus-visible:outline-offset-[-3px]',
                  focusRing,
                  centreOn ? 'text-primary' : 'text-text',
                )}
              >
                {/* Press feedback is CSS (motion's whileTap would make this decorative span focusable). */}
                <motion.span
                  aria-hidden
                  initial={reduced ? false : { scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={
                    reduced ? { duration: 0 } : { type: 'spring', bounce: 0.35, duration: 0.5 }
                  }
                  className="absolute -top-6 grid size-[3.75rem] place-items-center rounded-pill bg-primary text-on-primary shadow-fab ring-4 ring-bg transition-colors duration-[var(--motion-fast)] group-data-hovered:bg-primary-hover"
                >
                  <CentreIcon
                    className="size-6 transition-transform duration-[var(--motion-fast)] group-data-pressed:scale-90 motion-reduce:transition-none"
                    strokeWidth={2.2}
                  />
                </motion.span>
                <span className="max-w-full truncate">{label(t, centreAction.labelKey)}</span>
              </Link>
            </li>
          ) : null}
          {bottomItems.slice(half).map(bottomItem)}
        </ul>
      </nav>
    </div>
  );
}
