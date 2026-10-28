import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

const TONE = {
  success: ['bg-success-soft', 'text-success', 'bg-panel/70 text-success'],
  error: ['bg-error-soft', 'text-error', 'bg-panel/70 text-error'],
  warning: ['bg-warning-soft', 'text-warning', 'bg-panel/70 text-warning'],
  info: ['bg-info-soft', 'text-info', 'bg-panel/70 text-info'],
  primary: ['bg-primary-soft', 'text-primary', 'bg-panel/70 text-primary'],
  neutral: ['bg-sunken', 'text-text', 'bg-panel/70 text-muted'],
} as const;

/**
 * The key amount of a record in its own tinted strip ("AMOUNT PAID Rs 8,000", "PENDING Rs 5,000").
 * The uppercase label always states the meaning, so the tint is never the only signal.
 */
export function AmountStrip({
  tone,
  icon: Icon,
  label,
  amount,
  end,
  className,
}: {
  tone: keyof typeof TONE;
  icon: LucideIcon;
  label: string;
  amount: ReactNode;
  /** Optional trailing figure, e.g. "2 pending bills". */
  end?: ReactNode;
  className?: string;
}) {
  const [bg, ink, square] = TONE[tone];
  return (
    <div className={cn('flex items-center gap-3 rounded-tile px-3.5 py-3', bg, className)}>
      <span aria-hidden className={cn('grid size-10 shrink-0 place-items-center rounded-control', square)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-mini font-semibold tracking-[0.06em] uppercase', ink)}>{label}</p>
        <p className={cn('text-xl leading-tight font-bold tracking-tight whitespace-nowrap tabular', ink)}>{amount}</p>
      </div>
      {end && <div className={cn('shrink-0 border-s ps-3 text-end', tone === 'neutral' ? 'border-border' : 'border-current/20', ink)}>{end}</div>}
    </div>
  );
}
