import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useReducedMotion } from '../preferences/PreferencesProvider';

/**
 * Single-ratio meter as a ring. The unfilled track is a lighter step of the same hue, so state
 * reads across the whole ring; the centre states the value in text (never colour alone).
 */
export function ProgressRing({
  value,
  size = 96,
  stroke = 8,
  label,
  children,
  color = 'var(--color-primary)',
  track = 'var(--color-primary-soft)',
}: {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  /** Accessible name, e.g. "Construction 64% complete". */
  label: string;
  children?: ReactNode;
  color?: string;
  track?: string;
}) {
  const reduced = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div role="img" aria-label={label} className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg aria-hidden width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={reduced ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: reduced ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div aria-hidden className="absolute inset-0 grid place-items-center text-center">
        {children}
      </div>
    </div>
  );
}
