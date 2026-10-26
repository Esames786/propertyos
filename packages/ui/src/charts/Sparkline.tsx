import { directionOf, useLocale } from '@repo/i18n';
import { scaleLinear } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';
import { motion } from 'motion/react';
import { useId } from 'react';
import { useReducedMotion } from '../preferences/PreferencesProvider';

/**
 * Twelve-point trend for a stat tile: context in the de-emphasis hue, the current period as an
 * accent end-dot with a surface ring. Decorative (aria-hidden): the tile's text states the value
 * and its change, so the line adds shape, not information.
 */
export function Sparkline({
  values,
  width = 112,
  height = 36,
  color = 'var(--color-data-1)',
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const { locale } = useLocale();
  const rtl = directionOf(locale) === 'rtl';
  const reduced = useReducedMotion();
  const gradientId = `spark${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (values.length < 2) return null;
  const pad = 4;
  const x = scaleLinear()
    .domain([0, values.length - 1])
    .range(rtl ? [width - pad, pad] : [pad, width - pad]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const y = scaleLinear()
    .domain(min === max ? [min - 1, max + 1] : [min, max])
    .range([height - pad, pad]);
  const pts = values.map((v, i) => [x(i), y(v)] as [number, number]);
  const d = line().curve(curveMonotoneX)(pts) ?? '';
  const fill = area().curve(curveMonotoneX).y0(height)(pts) ?? '';
  const last = pts[pts.length - 1]!;
  return (
    <svg aria-hidden width={width} height={height} className="block overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.16} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${gradientId})`} />
      <motion.path
        d={d}
        fill="none"
        stroke="var(--color-chart-context)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduced ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
      />
      <circle cx={last[0]} cy={last[1]} r={4} fill={color} stroke="var(--color-panel)" strokeWidth={2} />
    </svg>
  );
}
