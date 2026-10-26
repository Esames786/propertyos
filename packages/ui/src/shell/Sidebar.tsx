import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { DirectionalIcon } from '../primitives/DirectionalIcon';
import { Button as AriaButton } from 'react-aria-components';
import { NavList } from './NavList';
import { useShell } from './ShellContext';

/** Tablet/desktop sidebar: 256 px expanded, 72 px collapsed; a labelled navigation landmark. */
export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useT();
  const { navItems } = useShell();
  const announce = useAnnounce();
  return (
    <aside
      aria-label={t('a11y:landmarks.sidebar')}
      className={cn(
        'sticky top-[var(--header-height)] hidden h-[calc(100dvh-var(--header-height))] shrink-0 flex-col border-e border-border bg-panel md:flex',
        collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]',
      )}
    >
      <nav aria-label={t('nav:primaryLabel')} data-tour-id="nav-primary" className="min-h-0 flex-1 overflow-y-auto p-3">
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
            'flex min-h-10 w-full items-center gap-3 rounded-control px-3 text-sm text-muted data-hovered:bg-sunken data-hovered:text-text',
            collapsed && 'justify-center px-0',
          )}
        >
          <DirectionalIcon icon={collapsed ? PanelLeftOpen : PanelLeftClose} className="size-5" />
          {!collapsed && <span>{t('common:actions.collapseSidebar')}</span>}
        </AriaButton>
      </div>
    </aside>
  );
}
