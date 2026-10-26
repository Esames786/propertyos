import { directionOf, useLocale } from '@repo/i18n';
import { scaleBand, scaleLinear } from 'd3-scale';
import { motion } from 'motion/react';
import { useId, useState, type KeyboardEvent } from 'react';
import { useReducedMotion } from '../preferences/PreferencesProvider';
import { ChartTooltip } from './ChartTooltip';
import { useElementSize } from './useElementSize';

export interface ColumnTargetPoint {
  id: string;
  /** Short axis label ("Oct"). */
  label: string;
  /** Full label for the tooltip and accessible name ("October 2026, to date"). */
  fullLabel: string;
  value: number;
  target: number;
}

const MARGIN = { top: 28, bottom: 30, axis: 52, end: 8 };
const BAR_MAX = 24;
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Columns (actual) with a target tick per period: a bullet-column chart on one y-scale.
 * - Thin marks (≤ 24 px), 4 px rounded data end, square at the baseline; hairline solid grid.
 * - Mirrors in RTL (time runs right → left, y-axis on the reading-start edge).
 * - Hover or focus a period for the tooltip; arrows/Home/End move between periods (one tab stop).
 * - Grows from the baseline on first paint and morphs between ranges; still under reduced motion.
 */
export function ColumnTargetChart({
  points,
  formatValue,
  formatTick,
  valueLabel,
  targetLabel,
  describePoint,
  labelledBy,
  describedBy,
  height = 260,
  valueColor = 'var(--color-data-1)',
  targetColor = 'var(--color-text)',
}: {
  points: ColumnTargetPoint[];
  formatValue: (n: number) => string;
  formatTick: (n: number) => string;
  valueLabel: string;
  targetLabel: string;
  /** Accessible name for a period, e.g. "October: Rs 308M collected of Rs 327M scheduled (94%)". */
  describePoint: (p: ColumnTargetPoint) => string;
  labelledBy: string;
  describedBy: string;
  height?: number;
  valueColor?: string;
  targetColor?: string;
}) {
  const { locale } = useLocale();
  const rtl = directionOf(locale) === 'rtl';
  const reduced = useReducedMotion();
  const [ref, { width }] = useElementSize<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(points.length - 1);
  const [hasFocus, setHasFocus] = useState(false);
  const clipId = `cols${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const innerW = Math.max(0, width - MARGIN.axis - MARGIN.end);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const plotX = rtl ? MARGIN.end : MARGIN.axis;
  const max = Math.max(1, ...points.map((p) => Math.max(p.value, p.target)));
  const y = scaleLinear().domain([0, max]).nice(4).range([innerH, 0]);
  const x = scaleBand<string>()
    .domain(points.map((p) => p.id))
    .range(rtl ? [innerW, 0] : [0, innerW])
    .paddingInner(0.35)
    .paddingOuter(0.2);
  const barW = Math.min(BAR_MAX, x.bandwidth());
  const ticks = y.ticks(4);
  const transition = reduced ? { duration: 0 } : { duration: 0.6, ease: EASE };
  const shown = active ?? (hasFocus ? focusIndex : null);
  const lastIndex = points.length - 1;

  const move = (event: KeyboardEvent, i: number) => {
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
    const back = rtl ? 'ArrowRight' : 'ArrowLeft';
    const targets: Record<string, number> = { [forward]: Math.min(lastIndex, i + 1), [back]: Math.max(0, i - 1), Home: 0, End: lastIndex };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setFocusIndex(next);
    (event.currentTarget.parentElement?.children[next] as SVGGElement | undefined)?.focus();
  };

  // Direct label on the latest period only (selective labelling).
  const labelled = points[lastIndex];

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="absolute inset-0 block overflow-visible">
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={-MARGIN.top} width={innerW} height={innerH + MARGIN.top} />
            </clipPath>
          </defs>
          <g transform={`translate(${plotX},${MARGIN.top})`}>
            {ticks.map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`} aria-hidden>
                <line x1={0} x2={innerW} stroke={t === 0 ? 'var(--color-chart-axis)' : 'var(--color-chart-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
                <text
                  x={rtl ? innerW + 10 : -10}
                  dy="0.32em"
                  textAnchor={rtl ? 'start' : 'end'}
                  className="fill-muted text-[11px] tabular"
                  direction="ltr"
                >
                  {formatTick(t)}
                </text>
              </g>
            ))}
            {points.map((p) => {
              const cx = (x(p.id) ?? 0) + x.bandwidth() / 2;
              return (
                <text key={p.id} aria-hidden x={cx} y={innerH + 20} textAnchor="middle" className="fill-muted text-[11px]">
                  {p.label}
                </text>
              );
            })}
            <g>
              {points.map((p, i) => {
                const cx = (x(p.id) ?? 0) + x.bandwidth() / 2;
                const top = y(p.value);
                const h = Math.max(0, innerH - top);
                const r = Math.min(4, h / 2, barW / 2);
                const dim = shown !== null && shown !== i;
                const isFocusVisible = hasFocus && focusIndex === i;
                return (
                  <g
                    key={p.id}
                    role="img"
                    aria-label={describePoint(p)}
                    tabIndex={i === focusIndex ? 0 : -1}
                    onFocus={() => {
                      setHasFocus(true);
                      setFocusIndex(i);
                    }}
                    onBlur={() => setHasFocus(false)}
                    onKeyDown={(e) => move(e, i)}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                    className="cursor-default outline-none"
                    data-testid="chart-column"
                  >
                    {/* Hit target: the whole band, taller than the mark. */}
                    <rect x={x(p.id) ?? 0} y={-MARGIN.top} width={x.bandwidth()} height={innerH + MARGIN.top} fill="transparent" />
                    {isFocusVisible && (
                      <rect
                        x={(x(p.id) ?? 0) + 1}
                        y={-MARGIN.top + 2}
                        width={x.bandwidth() - 2}
                        height={innerH + MARGIN.top - 2}
                        rx={8}
                        fill="none"
                        stroke="var(--color-focus)"
                        strokeWidth={2}
                      />
                    )}
                    {/* Rounded rect extended past the baseline and clipped: 4 px data end, square base. */}
                    <g clipPath={`url(#${clipId})`}>
                      <motion.rect
                        x={cx - barW / 2}
                        width={barW}
                        rx={r}
                        initial={reduced ? false : { attrY: innerH, height: 0 }}
                        animate={{ attrY: top, height: h + r, opacity: dim ? 0.45 : 1 }}
                        transition={{ ...transition, delay: reduced ? 0 : i * 0.035 }}
                        fill={valueColor}
                      />
                    </g>
                    <motion.line
                      initial={false}
                      animate={{ y1: y(p.target), y2: y(p.target), opacity: dim ? 0.45 : 1 }}
                      transition={transition}
                      x1={cx - barW / 2 - 6}
                      x2={cx + barW / 2 + 6}
                      stroke={targetColor}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}
            </g>
            {labelled && shown === null && x.bandwidth() >= 56 && (
              <text
                aria-hidden
                x={(x(labelled.id) ?? 0) + x.bandwidth() / 2}
                y={Math.min(y(labelled.value), y(labelled.target)) - 9}
                textAnchor="middle"
                direction="ltr"
                className="fill-text text-[11px] font-semibold"
              >
                {formatValue(labelled.value)}
              </text>
            )}
          </g>
        </svg>
      )}
      {shown !== null && points[shown] && width > 0 && (
        <ChartTooltip
          x={plotX + (x(points[shown].id) ?? 0) + x.bandwidth() / 2}
          y={MARGIN.top + Math.min(y(points[shown].value), y(points[shown].target)) - 12}
          containerWidth={width}
          title={points[shown].fullLabel}
          rows={[
            { id: 'v', value: formatValue(points[shown].value), label: valueLabel, color: valueColor, shape: 'rect' },
            { id: 't', value: formatValue(points[shown].target), label: targetLabel, color: targetColor, shape: 'line' },
          ]}
        />
      )}
    </div>
  );
}
