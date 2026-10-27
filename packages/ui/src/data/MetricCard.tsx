import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { cn } from '../lib/cn';
import { DirectionalIcon } from '../primitives/DirectionalIcon';
import { IconTile, type TileHue } from './IconTile';

const VALUE_TONE = {
  default: 'text-text',
  success: 'text-success',
  error: 'text-error',
  warning: 'text-warning',
  primary: 'text-primary',
} as const;

/**
 * Metric card: icon square · label · big bold value · one context line. With `href` the whole
 * card is one link (lifts on hover) whose accessible name is label, value and context in order.
 * Colour on the value is always backed by the label and context text (never colour alone).
 */
export function MetricCard({
  label,
  value,
  accessibleValue,
  caption,
  icon,
  hue,
  href,
  valueTone = 'default',
  testId,
  tourId,
  className,
}: {
  label: string;
  value: ReactNode;
  /** Plain-text value for the accessible name when `value` is formatted markup or animating. */
  accessibleValue?: string;
  caption?: ReactNode;
  icon: LucideIcon;
  hue: TileHue;
  href?: string;
  valueTone?: keyof typeof VALUE_TONE;
  testId?: string;
  tourId?: string;
  className?: string;
}) {
  // Narrow cards (two-up on phones) stack the icon above the text; wider cards put it beside.
  const body = (
    <span className="flex w-full min-w-0 flex-col gap-2.5 @[15rem]:flex-row @[15rem]:items-start @[15rem]:gap-3.5">
      <IconTile icon={icon} hue={hue} size="md" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-sm leading-snug text-muted">{label}</span>
        <span aria-hidden={accessibleValue ? true : undefined} className={cn('mt-0.5 block text-[1.375rem] leading-tight font-bold tracking-tight whitespace-nowrap tabular @[15rem]:text-2xl', VALUE_TONE[valueTone])}>
          {value}
        </span>
        {caption && <span className="mt-0.5 block text-xs text-muted">{caption}</span>}
      </span>
      {href && (
        <DirectionalIcon
          icon={ChevronRight}
          className="absolute end-3 top-3 size-4 text-muted opacity-0 transition-opacity duration-[var(--motion-fast)] group-data-hovered:opacity-100 group-data-focus-visible:opacity-100"
        />
      )}
    </span>
  );
  const frame = cn(
    '@container group relative flex w-full min-w-0 rounded-card border border-border/70 bg-panel p-4 text-start shadow-card sm:p-5',
    className,
  );
  if (!href) {
    return (
      <div data-testid={testId} data-tour-id={tourId} className={frame}>
        {body}
      </div>
    );
  }
  return (
    <Link
      href={href}
      data-testid={testId}
      data-tour-id={tourId}
      aria-label={accessibleValue ? [label, accessibleValue, typeof caption === 'string' ? caption : undefined].filter(Boolean).join(', ') : undefined}
      className={cn(
        frame,
        'outline-none transition-[translate,box-shadow] duration-[var(--motion-regular)] ease-[var(--ease-emphasized)]',
        'data-hovered:-translate-y-0.5 data-hovered:shadow-lift data-pressed:translate-y-0',
        'data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
      )}
    >
      {body}
    </Link>
  );
}
