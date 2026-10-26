import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Header,
  Menu as AriaMenu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
  Separator,
  Text,
  type Placement,
} from 'react-aria-components';
import { cn } from '../lib/cn';

export interface MenuAction {
  id: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  href?: string;
  isDisabled?: boolean;
  tone?: 'default' | 'danger';
  testId?: string;
}

export interface MenuGroup {
  id: string;
  title?: string;
  items: MenuAction[];
}

export const popoverClass =
  'min-w-56 max-w-[calc(100vw-1.5rem)] overflow-auto rounded-card border border-border bg-panel p-1 shadow-overlay outline-none data-entering:animate-overlay-in data-exiting:animate-overlay-out';

const itemClass = (tone: MenuAction['tone']) =>
  cn(
    'flex cursor-default items-start gap-3 rounded-control px-3 py-2 text-sm outline-none',
    'data-focused:bg-primary-soft data-focused:text-primary data-disabled:cursor-not-allowed data-disabled:opacity-60',
    'pointer-coarse:py-3',
    tone === 'danger' ? 'text-error' : 'text-text',
  );

/**
 * Menu button with optional sections and descriptions. Disabled items stay visible with their
 * description so the reason is readable (no unexplained dead actions).
 */
export function MenuButton({
  trigger,
  groups,
  onAction,
  placement = 'bottom end',
  label,
}: {
  trigger: ReactNode;
  groups: MenuGroup[];
  onAction?: (id: string) => void;
  placement?: Placement;
  label?: string;
}) {
  return (
    <MenuTrigger>
      {trigger}
      <Popover placement={placement} offset={6} className={popoverClass}>
        <AriaMenu aria-label={label} onAction={(key) => onAction?.(String(key))} className="outline-none">
          {groups.map((group, i) => (
            <MenuSection key={group.id} id={group.id}>
              {i > 0 && <Separator className="my-1 border-t border-border" />}
              {group.title && (
                <Header className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{group.title}</Header>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <MenuItem
                    key={item.id}
                    id={item.id}
                    href={item.href}
                    isDisabled={item.isDisabled}
                    textValue={item.label}
                    data-testid={item.testId}
                    className={itemClass(item.tone)}
                  >
                    {Icon && <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />}
                    <span className="flex min-w-0 flex-col">
                      <Text slot="label">{item.label}</Text>
                      {item.description && (
                        <Text slot="description" className="text-xs text-muted">
                          {item.description}
                        </Text>
                      )}
                    </span>
                  </MenuItem>
                );
              })}
            </MenuSection>
          ))}
        </AriaMenu>
      </Popover>
    </MenuTrigger>
  );
}
