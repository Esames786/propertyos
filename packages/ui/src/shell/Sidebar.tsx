import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button as AriaButton } from 'react-aria-components';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { DirectionalIcon } from '../primitives/DirectionalIcon';
import { BrandBlock } from './BrandBlock';
import { NavList } from './NavList';
import { useShell } from './ShellContext';

/**
 * Tablet/desktop navigation rail: a light surface floating on the limestone canvas, full height,
 * with the tenant brand, grouped navigation and the collapse control. 264 px expanded, 80 px
 * collapsed; a labelled complementary landmark containing the main navigation.
 */
export function Sidebar({ collapsed, onToggle, tenantName }: { collapsed: boolean; onToggle: () => void; tenantName: string }) {
  const { t } = useT();
  const { navItems } = useShell();
  const announce = useAnnounce();
  return (
    <aside
      aria-label={t('a11y:landmarks.sidebar')}
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 p-3 pe-0 md:block',
        'transition-[width] duration-[var(--motion-regular)] ease-[var(--ease-emphasized)]',
        collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]',
      )}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-card bg-panel shadow-card">
        <div className={cn('flex h-[var(--header-height)] shrink-0 items-center', collapsed ? 'justify-center' : 'px-4')}>
          <BrandBlock tenantName={tenantName} compact={collapsed} />
        </div>
        <nav aria-label={t('nav:primaryLabel')} data-tour-id="nav-primary" className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-3">
          <NavList items={navItems} collapsed={collapsed} />
        </nav>
        <div className="border-t border-border p-3">
          <AriaButton
            onPress={() => {
              onToggle();
              announce(collapsed ? t('a11y:announce.sidebarExpanded') : t('a11y:announce.sidebarCollapsed'));
            }}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t('common:actions.expandSidebar') : t('common:actions.collapseSidebar')}
            className={cn(
              'flex min-h-10 w-full items-center gap-3 rounded-control px-3 text-sm text-muted outline-none data-hovered:bg-raised data-hovered:text-text',
              'data-focus-visible:outline-2 data-focus-visible:outline-offset-[-2px] data-focus-visible:outline-focus',
              collapsed && 'justify-center px-0',
            )}
          >
            <DirectionalIcon icon={collapsed ? PanelLeftOpen : PanelLeftClose} className="size-[1.125rem]" />
            {!collapsed && <span>{t('common:actions.collapseSidebar')}</span>}
          </AriaButton>
        </div>
      </div>
    </aside>
  );
}
