import { LayoutGrid } from 'lucide-react';
import { motion } from 'motion/react';
import { Link } from 'react-aria-components';
import type { NavItem } from './types';
import { useT } from '../lib/useT';
import { useNavigation } from '../navigation/RouterAdapter';
import { useSession } from '../permissions/SessionProvider';
import { useReducedMotion } from '../preferences/PreferencesProvider';
import { currentItemId } from './NavList';
import { QuickCreateMenu, quickCreateAvailable } from './QuickCreateMenu';
import { useShell } from './ShellContext';

/**
 * Phone bottom bar (< 768 px): a floating rounded bar with two destinations either side of a raised
 * centre Quick create button, and "More" for everything else. Thumb-reach targets (≥ 48 px), labels
 * always visible, the current item marked with aria-current and a sliding pill (not colour alone).
 * Sits above the home-indicator inset.
 */
export function BottomNav() {
  const { t } = useT();
  const { navItems, links, slots } = useShell();
  const { allows, can } = useSession();
  const { location } = useNavigation();
  const reduced = useReducedMotion();
  const rank = (id: string) => {
    const i = slots.bottomOrder?.indexOf(id) ?? -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const items = navItems
    .filter((i) => i.bottomBar && allows(i))
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item.id) - rank(b.item.id) || a.index - b.index)
    .map(({ item }) => item)
    .slice(0, 3);
  const more: NavItem | null = links.more ? { id: 'more', labelKey: 'nav:more', href: links.more, icon: LayoutGrid, match: links.more } : null;
  const hasFab = slots.create === undefined ? quickCreateAvailable(can) : slots.create !== null;
  const start = items.slice(0, 2);
  const end = [...items.slice(2), ...(more ? [more] : [])];

  const currentId = currentItemId(location.pathname, [...items, ...(more ? [more] : [])]);
  const cell = (item: NavItem) => {
    const Icon = item.icon;
    const current = item.id === currentId;
    return (
      <li key={item.id} className="flex-1">
        <Link
          href={item.href}
          aria-current={current ? 'page' : undefined}
          data-testid={item.id === 'more' ? 'bottom-nav-more' : undefined}
          className="group flex h-full flex-col items-center justify-center gap-1 rounded-tile text-nav font-medium text-muted outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-[-4px] data-focus-visible:outline-focus data-pressed:scale-95 aria-[current=page]:text-primary"
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
            <Icon aria-hidden className="relative size-5" strokeWidth={current ? 2.2 : 1.8} />
          </span>
          <span className="line-clamp-2 max-w-full px-0.5 text-center leading-[1.15]">{t(item.labelKey as 'nav:items.home')}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label={t('nav:bottomBarLabel')}
      data-tour-id="bottom-nav"
      data-testid="bottom-nav"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 rounded-[1.375rem] border border-border/80 bg-panel/95 shadow-overlay backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto flex h-[var(--bottom-nav-height)] max-w-lg items-stretch px-1.5">
        {start.map(cell)}
        {hasFab && (
          <li className="relative flex w-[4.5rem] shrink-0 justify-center">
            <span className="absolute -top-6">{slots.create ? slots.create.fab : <QuickCreateMenu variant="fab" />}</span>
          </li>
        )}
        {end.map(cell)}
      </ul>
    </nav>
  );
}
