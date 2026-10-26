import type { LucideIcon } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import { cn } from '../lib/cn';

export interface IconButtonProps extends Omit<AriaButtonProps, 'className' | 'children' | 'aria-label'> {
  /** Required accessible name; icon-only controls are never unlabeled. */
  label: string;
  icon: LucideIcon;
  /** Optional decoration such as an unread badge (must also be reflected in `label`). */
  badge?: ReactNode;
  className?: string;
  iconClassName?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon: Icon, badge, className, iconClassName, ...props },
  ref,
) {
  return (
    <AriaButton
      ref={ref}
      aria-label={label}
      {...props}
      className={cn(
        'relative grid size-10 shrink-0 place-items-center rounded-control text-muted pointer-coarse:size-11',
        'transition-colors duration-[var(--motion-fast)] data-hovered:bg-sunken data-hovered:text-text data-pressed:bg-sunken',
        'data-disabled:opacity-50',
        className,
      )}
    >
      <Icon aria-hidden className={cn('size-5', iconClassName)} />
      {badge}
    </AriaButton>
  );
});
