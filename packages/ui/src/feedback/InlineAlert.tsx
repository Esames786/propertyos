import { CheckCircle2, CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type Tone = 'info' | 'success' | 'warning' | 'error';

const STYLE: Record<Tone, [string, LucideIcon]> = {
  info: ['bg-info-soft border-info/30 text-info', Info],
  success: ['bg-success-soft border-success/30 text-success', CheckCircle2],
  warning: ['bg-warning-soft border-warning/30 text-warning', TriangleAlert],
  error: ['bg-error-soft border-error/30 text-error', CircleAlert],
};

/** Static, in-flow message. Use `role="alert"` only for errors that appear after an action. */
export function InlineAlert({
  tone = 'info',
  title,
  children,
  role,
  className,
  ...data
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  role?: 'alert' | 'status';
  className?: string;
} & { [k: `data-${string}`]: string | number | boolean | undefined }) {
  const [style, Icon] = STYLE[tone];
  return (
    <div role={role} className={cn('flex gap-3 rounded-card border p-3 text-sm', style, className)} {...data}>
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 text-text">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
