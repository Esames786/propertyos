import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface TooltipRow {
  id: string;
  /** The value leads (strong); the series name follows. */
  value: string;
  label: string;
  color?: string;
  shape?: 'rect' | 'line';
}

/**
 * Visual tooltip for charts. It is aria-hidden because the focused mark already carries the same
 * text as its accessible name, and every value is also in the data table (tooltips never gate).
 * Positioned in the chart's own box, clamped so it never leaves the card (no overflow at 320 px).
 */
export function ChartTooltip({
  x,
  y,
  containerWidth,
  title,
  rows,
  footer,
}: {
  x: number;
  y: number;
  containerWidth: number;
  title: string;
  rows: TooltipRow[];
  footer?: ReactNode;
}) {
  const width = Math.min(240, containerWidth - 8);
  const left = Math.max(4, Math.min(x - width / 2, containerWidth - width - 4));
  return (
    <div
      aria-hidden
      // logical-exception: tooltip position is computed in physical SVG pixels from the plotted mark.
      style={{ left, top: Math.max(0, y), width }}
      className="pointer-events-none absolute z-10 -translate-y-full rounded-tile bg-text px-3 py-2.5 text-xs text-inverse shadow-overlay"
    >
      <p className="mb-1.5 font-medium opacity-80">{title}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            {r.color && (
              <span aria-hidden className={cn('shrink-0', r.shape === 'rect' ? 'size-2 rounded-[2px]' : 'h-0.5 w-3 rounded-pill')} style={{ background: r.color }} />
            )}
            <bdi dir="ltr" className="ltr-ref text-sm font-semibold">
              {r.value}
            </bdi>
            <span className="truncate opacity-80">{r.label}</span>
          </li>
        ))}
      </ul>
      {footer && <p className="mt-1.5 border-t border-inverse/20 pt-1.5 opacity-80">{footer}</p>}
    </div>
  );
}
