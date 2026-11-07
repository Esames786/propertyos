import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-aria-components';
import { Sparkline } from '../charts/Sparkline';
import { cn } from '../lib/cn';
import { IconTile, type TileHue } from './IconTile';

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

/** Where a repeated leading amount ends: end of text, a space, or punctuation followed by a space. */
const BOUNDARY = /^(?:$|\s|[·.,;:،۔–—-](?:\s|$))/;

/** The longest shared start of `a` and `b` that ends on a boundary in both and holds a digit (an amount or count). */
function sharedFigure(a: string, b: string) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  for (; n > 0; n--) {
    const head = a.slice(0, n).trimEnd();
    if (/\d/.test(head) && BOUNDARY.test(a.slice(head.length)) && BOUNDARY.test(b.slice(head.length))) return head;
  }
  return '';
}

/**
 * The context line as it goes into the tile's name, or undefined when it adds nothing. A context the
 * value already says is left out (payroll: the context is the amount); one that starts with the same
 * figure as the accessible or the displayed value is read from after that figure, so the amount is
 * said once ("Rs 1,234.00, a contract figure, not money received"), in English and Urdu alike.
 */
function contextForName(context: string, accessibleValue: string, shown?: string) {
  let text = context.trim();
  if (!text || accessibleValue.includes(text)) return undefined;
  for (const value of [accessibleValue, shown?.trim() ?? '']) {
    const figure = value && sharedFigure(value, text);
    if (figure) {
      text = text.slice(figure.length).replace(/^[\s·.,;:،۔–—-]+/, '');
      break;
    }
  }
  return text && !accessibleValue.includes(text) ? text : undefined;
}

/**
 * Stat tile: label · value · delta vs a named period · context line · 12-point trend.
 * Proportional figures for the big number (tabular only in columns). The whole tile is one link
 * to the screen behind the number; its accessible name is the label, value, change in words and
 * context line, each once (SH-02). A context that the caller already folded into `accessibleValue`
 * is not repeated; a context that starts with the tile's amount (S.3: "Rs 1,234.00 · a contract
 * figure…") is read without that amount; a context that is not plain text becomes the link's
 * description.
 */
export function StatTile({
  label,
  value,
  accessibleValue,
  delta,
  context,
  trend,
  href,
  icon,
  hue = 'emerald',
  testId,
}: {
  label: string;
  value: ReactNode;
  /** The value as plain text (the visible one may be animating). The context line is added by the tile. */
  accessibleValue: string;
  delta?: StatDelta;
  context?: ReactNode;
  trend?: number[];
  href: string;
  icon?: LucideIcon;
  /** Tile hue of the icon square (identifies the metric, never its status). */
  hue?: TileHue;
  testId?: string;
}) {
  const DeltaIcon = delta?.direction === 'up' ? ArrowUpRight : delta?.direction === 'down' ? ArrowDownRight : Minus;
  const contextId = useId();
  const contextText = typeof context === 'string' ? contextForName(context, accessibleValue, typeof value === 'string' ? value : undefined) : undefined;
  const describedBy = context && typeof context !== 'string' ? contextId : undefined;
  return (
    <Link
      href={href}
      aria-label={[label, accessibleValue, delta?.description, contextText].filter(Boolean).join(', ')}
      aria-describedby={describedBy}
      data-testid={testId}
      className={cn(
        'group relative flex w-full min-w-0 flex-col justify-between gap-4 overflow-hidden rounded-card border border-border/70 bg-panel p-5 shadow-card outline-none',
        'transition-[box-shadow,translate] duration-[var(--motion-regular)] ease-[var(--ease-emphasized)]',
        'data-hovered:-translate-y-0.5 data-hovered:shadow-lift',
        'data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3 text-sm text-muted">
          {icon && <IconTile icon={icon} hue={hue} size="md" />}
          <span className="line-clamp-2 leading-snug">{label}</span>
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
      <div aria-hidden className="@container min-w-0">
        {/* 320 px with 200 % text: the value was cut off by the tile's clip (S.1 hotfix report, residual 5).
            It now never grows past about a fifth of the tile's width per glyph height, so "Rs 355.8K" and
            "Rs 12.6 ہزار" stay whole on one line; at ordinary sizes text-3xl is the smaller of the two. */}
        <div className="text-[length:min(var(--text-3xl),19cqi)] leading-none font-bold tracking-tight whitespace-nowrap text-text">{value}</div>
        <div className="mt-3 flex items-end justify-between gap-3">
          {context ? (
            <div id={describedBy} className="min-w-0 text-xs leading-snug text-muted">
              {context}
            </div>
          ) : (
            <span />
          )}
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
