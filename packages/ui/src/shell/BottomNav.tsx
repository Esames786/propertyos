import { LayoutGrid } from 'lucide-react';
import { motion } from 'motion/react';
import { Button as AriaButton, Link } from 'react-aria-components';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { useNavigation } from '../navigation/RouterAdapter';
import { filterAllowed } from '../permissions/can';
import { useSession } from '../permissions/SessionProvider';
import { useReducedMotion } from '../preferences/PreferencesProvider';
import { isCurrent } from './NavList';
import { useShell } from './ShellContext';

/**
 * Phone bottom bar (< 768 px): the four most-used destinations the persona may open, plus "More"
 * for the full menu sheet. Thumb-reach targets (≥ 48 px), labels always visible, current item
 * marked with aria-current and a pill (not colour alone). Sits above the home-indicator inset.
 */
export function BottomNav() {
  const { t } = useT();
  const { navItems, setMobileNavOpen } = useShell();
  const { persona } = useSession();
  const { location } = useNavigation();
  const reduced = useReducedMotion();
  const items = filterAllowed(persona, navItems.filter((i) => i.bottomBar)).slice(0, 4);
  return (
    <nav
      aria-label={t('nav:bottomBarLabel')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      data-testid="bottom-nav"
    >
      <ul className="mx-auto flex h-[var(--bottom-nav-height)] max-w-lg items-stretch px-1">
        {items.map((item) => {
          const Icon = item.icon;
          const current = isCurrent(location.pathname, item);
          return (
            <li key={item.id} className="flex-1">
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className="group flex h-full flex-col items-center justify-center gap-1 rounded-control text-[11px] font-medium text-muted outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-[-4px] data-focus-visible:outline-focus aria-[current=page]:text-primary"
              >
                <span className="relative grid h-7 w-12 place-items-center">
                  {current && (
                    <motion.span
                      layoutId="bottom-nav-pill"
                      aria-hidden
                      transition={reduced ? { duration: 0 } : { type: 'spring', bounce: 0.22, duration: 0.45 }}
                      className="absolute inset-0 rounded-pill bg-primary-soft"
                    />
                  )}
                  <Icon aria-hidden className="relative size-5" strokeWidth={current ? 2.1 : 1.8} />
                </span>
                <span className="max-w-full truncate px-0.5">{t(item.labelKey as 'nav:items.home')}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <AriaButton
            onPress={() => setMobileNavOpen(true)}
            className={cn(
              'flex h-full w-full flex-col items-center justify-center gap-1 rounded-control text-[11px] font-medium text-muted outline-none',
              'data-focus-visible:outline-2 data-focus-visible:outline-offset-[-4px] data-focus-visible:outline-focus',
            )}
          >
            <span className="relative grid h-7 w-12 place-items-center">
              <LayoutGrid aria-hidden className="size-5" strokeWidth={1.8} />
            </span>
            <span>{t('nav:more')}</span>
          </AriaButton>
        </li>
      </ul>
    </nav>
  );
}
