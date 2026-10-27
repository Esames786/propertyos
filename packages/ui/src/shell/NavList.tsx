import { motion } from 'motion/react';
import { useId } from 'react';
import { Link } from 'react-aria-components';
import { filterAllowed } from '../permissions/can';
import { useSession } from '../permissions/SessionProvider';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { useNavigation } from '../navigation/RouterAdapter';
import { useReducedMotion } from '../preferences/PreferencesProvider';
import { Tooltip } from '../overlays/Tooltip';
import type { NavGroup, NavItem } from './types';

export function isCurrent(pathname: string, item: NavItem): boolean {
  const prefix = item.match ?? item.href;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const GROUP_ORDER: Array<NavGroup | undefined> = [undefined, 'workspace', 'operations', 'insights', 'prototype'];

/**
 * Main navigation links, filtered by the persona's permissions and grouped into labelled rail
 * sections. The current item carries aria-current plus a visible inset marker and weight (not
 * colour alone); the marker slides to the new item. Collapsed mode keeps an accessible name on
 * every icon link and adds a tooltip.
 */
export function NavList({
  items,
  collapsed = false,
  onNavigate,
  anchorPrefix = 'nav',
}: {
  items: NavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
  anchorPrefix?: string;
}) {
  const { t } = useT();
  const { persona } = useSession();
  const { location } = useNavigation();
  const reduced = useReducedMotion();
  const markerId = useId();
  const visible = filterAllowed(persona, items);
  const groups = GROUP_ORDER.map((g) => ({ group: g, items: visible.filter((i) => i.group === g) })).filter((g) => g.items.length);

  return (
    <div className="space-y-6">
      {groups.map(({ group, items: groupItems }) => (
        <div key={group ?? 'top'}>
          {group &&
            (collapsed ? (
              <div aria-hidden className="mx-auto mb-2 h-px w-6 bg-border" />
            ) : (
              <p className="mb-2 px-3 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted uppercase">{t(`nav:groups.${group}`)}</p>
            ))}
          <ul className="space-y-1">
            {groupItems.map((item) => {
              const Icon = item.icon;
              const current = isCurrent(location.pathname, item);
              const label = t(item.labelKey as 'nav:items.home');
              const link = (
                <Link
                  href={item.href}
                  onPress={onNavigate}
                  aria-current={current ? 'page' : undefined}
                  aria-label={collapsed ? label : undefined}
                  data-tour-id={`${anchorPrefix}-${item.id}`}
                  className={cn(
                    'relative flex min-h-11 items-center gap-3 rounded-tile px-3 text-[0.9375rem] outline-none',
                    'transition-[background-color,color,translate] duration-[var(--motion-fast)] data-pressed:translate-y-px',
                    'data-focus-visible:outline-2 data-focus-visible:outline-offset-[-2px] data-focus-visible:outline-focus',
                    current ? 'bg-primary-soft font-semibold text-primary' : 'text-muted data-hovered:bg-sunken data-hovered:text-text',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  {current && (
                    <motion.span
                      layoutId={`${markerId}-${anchorPrefix}`}
                      aria-hidden
                      transition={reduced ? { duration: 0 } : { type: 'spring', bounce: 0.2, duration: 0.5 }}
                      className="absolute inset-y-2.5 start-1 w-[3px] rounded-pill bg-primary"
                    />
                  )}
                  <Icon aria-hidden className="size-5 shrink-0" strokeWidth={current ? 2.1 : 1.8} />
                  {!collapsed && <span className="truncate">{label}</span>}
                </Link>
              );
              return <li key={item.id}>{collapsed ? <Tooltip content={label} placement="end">{link}</Tooltip> : link}</li>;
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
