import { forwardRef } from 'react';
import { Link as AriaLink, type LinkProps as AriaLinkProps } from 'react-aria-components';
import { cn } from '../lib/cn';

export interface LinkProps extends Omit<AriaLinkProps, 'className'> {
  className?: string;
  variant?: 'inline' | 'plain';
}

/** Client-side link through the navigation adapter (React Aria RouterProvider). */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ className, variant = 'inline', ...props }, ref) {
  return (
    <AriaLink
      ref={ref}
      {...props}
      className={cn(
        variant === 'inline' &&
          'text-primary underline decoration-1 underline-offset-[3px] data-hovered:decoration-2 data-current:font-semibold',
        'rounded-sm',
        className,
      )}
    />
  );
});
