import { Link } from 'react-aria-components';
import { filterAllowed } from '../permissions/can';
import { useSession } from '../permissions/SessionProvider';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { useNavigation } from '../navigation/RouterAdapter';
import { Tooltip } from '../overlays/Tooltip';
import type { NavItem } from './types';

export function isCurrent(pathname: string, item: NavItem): boolean {
  const prefix = item.match ?? item.href;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Main navigation links, filtered by the persona's permissions. The current item is marked with
 * aria-current plus a visible bar and weight (not colour alone). Collapsed mode keeps an
 * accessible name on every icon link and adds a tooltip.
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
  const visible = filterAllowed(persona, items);
  return (
    <ul className="space-y-0.5">
      {visible.map((item) => {
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
              'relative flex min-h-10 items-center gap-3 rounded-control px-3 text-sm outline-none pointer-coarse:min-h-11',
              'data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-offset-[-2px] data-focus-visible:outline-focus',
              current ? 'bg-primary-soft font-semibold text-primary' : 'text-muted data-hovered:text-text',
              collapsed && 'justify-center px-0',
            )}
          >
            {current && <span aria-hidden className="absolute inset-y-2 start-0 w-1 rounded-pill bg-primary" />}
            <Icon aria-hidden className="size-5 shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </Link>
        );
        return <li key={item.id}>{collapsed ? <Tooltip content={label} placement="end">{link}</Tooltip> : link}</li>;
      })}
    </ul>
  );
}
