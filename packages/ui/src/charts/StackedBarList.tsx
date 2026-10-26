import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-aria-components';
import { cn } from '../lib/cn';
import { useReducedMotion } from '../preferences/PreferencesProvider';
import { ChartTooltip } from './ChartTooltip';
import { useElementSize } from './useElementSize';

export interface StackSeries {
  id: string;
  label: string;
  /** Fill (token var). Series keep their colour whatever is filtered (colour follows the entity). */
  color: string;
  /** Label colour inside the fill: white or near-black by the fill's luminance. */
  ink: 'light' | 'dark';
}

export interface StackRow {
  id: string;
  label: string;
  href?: string;
  values: Record<string, number>;
  /** Extra count shown in the total (e.g. units not for sale), not drawn as a segment. */
  extra?: number;
}

/**
 * Horizontal stacked bars, one row per entity (tower, phase). Part-to-whole with a 2 px surface gap
 * between segments, 4 px rounded data end, square at the baseline, and bars scaled to the largest
 * row so rows compare. Logical layout: bars grow from the reading-start edge, so RTL mirrors.
 * Each row is a link (opens the matching screen); hover or focus shows every series for that row.
 */
export function StackedBarList({
  rows,
  series,
  describeRow,
  formatCount,
  totalLabel,
}: {
  rows: StackRow[];
  series: StackSeries[];
  describeRow: (row: StackRow) => string;
  formatCount: (n: number) => string;
  totalLabel: string;
}) {
  const reduced = useReducedMotion();
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [active, setActive] = useState<string | null>(null);
  const [tip, setTip] = useState<{ row: StackRow; x: number; y: number } | null>(null);
  const totals = rows.map((r) => series.reduce((s, ser) => s + (r.values[ser.id] ?? 0), 0));
  const max = Math.max(1, ...totals);

  const show = (row: StackRow, el: HTMLElement) => {
    const box = ref.current?.getBoundingClientRect();
    const bar = el.getBoundingClientRect();
    if (!box) return;
    setActive(row.id);
    setTip({ row, x: bar.left - box.left + bar.width / 2, y: bar.top - box.top - 6 });
  };
  const hide = () => {
    setActive(null);
    setTip(null);
  };

  return (
    <div ref={ref} className="relative">
      <ul className="space-y-3.5">
        {rows.map((row, ri) => {
          const total = totals[ri]!;
          const content = (
            <>
              <span className="min-w-0 truncate text-sm font-medium text-text">{row.label}</span>
              <span aria-hidden className="flex h-7 min-w-0 items-stretch" style={{ width: `${(total / max) * 100}%` }}>
                {series.map((ser, si) => {
                  const value = row.values[ser.id] ?? 0;
                  if (!value) return null;
                  const share = value / total;
                  const segPx = (share * (total / max) * Math.max(0, width - 160)) | 0;
                  const label = formatCount(value);
                  const fits = segPx >= label.length * 7.5 + 14;
                  const isLast = series.slice(si + 1).every((s) => !(row.values[s.id] ?? 0));
                  return (
                    <motion.span
                      key={ser.id}
                      initial={reduced ? false : { flexGrow: 0 }}
                      animate={{ flexGrow: value, opacity: active && active !== row.id ? 0.5 : 1 }}
                      transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : ri * 0.05 + si * 0.04, ease: [0.16, 1, 0.3, 1] }}
                      className={cn(
                        'grid min-w-0 basis-0 place-items-center overflow-hidden text-[11px] font-semibold tabular',
                        si > 0 && 'ms-0.5',
                        isLast && 'rounded-e-[4px]',
                        ser.ink === 'light' ? 'text-inverse' : 'text-text',
                      )}
                      style={{ background: ser.color }}
                    >
                      {fits && <span className="ltr-ref">{label}</span>}
                    </motion.span>
                  );
                })}
              </span>
              <span className="text-end text-sm text-muted tabular">
                <bdi dir="ltr" className="ltr-ref">
                  {formatCount(total + (row.extra ?? 0))}
                </bdi>
              </span>
            </>
          );
          const className =
            'grid grid-cols-[5rem_minmax(0,1fr)_3rem] items-center gap-3 rounded-control px-1 py-0.5 outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus sm:grid-cols-[6rem_minmax(0,1fr)_3.5rem]';
          return (
            <li key={row.id}>
              {row.href ? (
                <Link
                  href={row.href}
                  aria-label={describeRow(row)}
                  onHoverStart={(e) => show(row, e.target as HTMLElement)}
                  onHoverEnd={hide}
                  onFocus={(e) => show(row, e.currentTarget as HTMLElement)}
                  onBlur={hide}
                  className={cn(className, 'data-hovered:bg-raised')}
                  data-testid="stack-row"
                >
                  {content}
                </Link>
              ) : (
                <div role="img" aria-label={describeRow(row)} className={className}>
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-end text-xs text-muted">{totalLabel}</p>
      {tip && width > 0 && (
        <ChartTooltip
          x={tip.x}
          y={tip.y}
          containerWidth={width}
          title={tip.row.label}
          rows={series.map((s) => ({ id: s.id, value: formatCount(tip.row.values[s.id] ?? 0), label: s.label, color: s.color, shape: 'rect' as const }))}
        />
      )}
    </div>
  );
}
