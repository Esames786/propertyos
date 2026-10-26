import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { Sparkline } from '../charts/Sparkline';
import { cn } from '../lib/cn';

export interface StatDelta {
  /** Signed, formatted change, e.g. "+12.4%". */
  text: string;
  /** Plain-language version for screen readers, e.g. "up 12.4% on the previous 6 months". */
  description: string;
  direction: 'up' | 'down' | 'flat';
  /** Whether this change is good news (colour = direction × whether up is good). */
  tone: 'positive' | 'negative' | 'neutral';
}

const TONE = {
  positive: 'bg-success-soft text-success',
  negative: 'bg-error-soft text-error',
  neutral: 'bg-sunken text-muted',
};

/**
 * Stat tile: label · value · delta vs a named period · context line · 12-point trend.
 * Proportional figures for the big number (tabular only in columns). The whole tile is one link
 * to the screen behind the number; its accessible name is the label, value and change in words.
 */
export function StatTile({
  label,
  value,
  accessibleValue,
  delta,
  context,
  trend,
  href,
  icon: Icon,
  testId,
}: {
  label: string;
  value: ReactNode;
  /** The value as plain text (the visible one may be animating). */
  accessibleValue: string;
  delta?: StatDelta;
  context?: ReactNode;
  trend?: number[];
  href: string;
  icon?: LucideIcon;
  testId?: string;
}) {
  const DeltaIcon = delta?.direction === 'up' ? ArrowUpRight : delta?.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <Link
      href={href}
      aria-label={[label, accessibleValue, delta?.description].filter(Boolean).join(', ')}
      data-testid={testId}
      className={cn(
        'group relative flex w-full min-w-0 flex-col justify-between gap-4 overflow-hidden rounded-card bg-panel p-5 shadow-card outline-none',
        'transition-[box-shadow,translate] duration-[var(--motion-regular)] ease-[var(--ease-emphasized)]',
        'data-hovered:-translate-y-0.5 data-hovered:shadow-raised',
        'data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm text-muted">
          {Icon && (
            <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-pill bg-primary-soft text-primary">
              <Icon className="size-3.5" />
            </span>
          )}
          <span className="truncate">{label}</span>
        </span>
        {delta && (
          <span aria-hidden className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-pill px-2 py-0.5 text-xs font-semibold', TONE[delta.tone])}>
            <DeltaIcon className="size-3.5 rtl:-scale-x-100" />
            <bdi dir="ltr" className="ltr-ref">
              {delta.text}
            </bdi>
          </span>
        )}
      </div>
      <div aria-hidden className="min-w-0">
        <div className="text-[1.875rem] leading-none font-semibold tracking-tight whitespace-nowrap text-text">{value}</div>
        <div className="mt-3 flex items-end justify-between gap-3">
          {context ? <div className="min-w-0 text-xs leading-snug text-muted">{context}</div> : <span />}
          {trend && (
            <span className="shrink-0">
              <Sparkline values={trend} width={84} height={30} />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
