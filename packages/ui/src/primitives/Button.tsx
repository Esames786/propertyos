import type { LucideIcon } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import { useId } from 'react-aria';
import { cn } from '../lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'on-primary bg-primary text-on-primary data-hovered:bg-primary-hover data-pressed:bg-primary-hover border border-transparent',
  secondary:
    'bg-panel text-text border border-border-control data-hovered:bg-sunken data-pressed:bg-sunken',
  quiet: 'bg-transparent text-primary border border-transparent data-hovered:bg-primary-soft data-pressed:bg-primary-soft',
  danger: 'bg-error text-inverse border border-transparent data-hovered:brightness-95 data-pressed:brightness-90',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm gap-1.5 pointer-coarse:min-h-11',
  md: 'min-h-10 px-4 text-sm gap-2 pointer-coarse:min-h-11',
  lg: 'min-h-12 px-5 text-base gap-2',
};

export const buttonClass = (variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra?: string) =>
  cn(
    'inline-flex select-none items-center justify-center rounded-control font-medium whitespace-nowrap',
    'transition-colors duration-[var(--motion-fast)] outline-offset-2',
    'data-disabled:cursor-not-allowed data-disabled:opacity-55 data-pending:cursor-progress',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );

export interface ButtonProps extends Omit<AriaButtonProps, 'className' | 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** Visible explanation shown next to a disabled button (blueprint: no unexplained dead buttons). */
  disabledReason?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Button with local loading: `isPending` keeps focus, blocks duplicate submits and is announced
 * by React Aria; the label stays visible next to the spinner.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, disabledReason, className, children, isPending, ...props },
  ref,
) {
  const reasonId = useId();
  const button = (
    <AriaButton
      ref={ref}
      {...props}
      isPending={isPending}
      aria-describedby={disabledReason && props.isDisabled ? reasonId : props['aria-describedby']}
      className={buttonClass(variant, size, className)}
    >
      {isPending ? <Spinner /> : Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      <span>{children}</span>
    </AriaButton>
  );
  if (!disabledReason || !props.isDisabled) return button;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {button}
      <span id={reasonId} className="max-w-xs text-xs text-muted">
        {disabledReason}
      </span>
    </span>
  );
});
