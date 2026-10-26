import { motion } from 'motion/react';
import { useState } from 'react';
import { cn } from '../lib/cn';
import { useReducedMotion } from '../preferences/PreferencesProvider';

export interface FunnelStep {
  id: string;
  label: string;
  value: number;
}

const RAMP = ['var(--color-bronze-1)', 'var(--color-bronze-2)', 'var(--color-bronze-3)', 'var(--color-bronze-4)', 'var(--color-bronze-5)'];

/**
 * Ordered stages (an ordinal form): one-hue bronze ramp, light → dark, so the colour itself reads
 * as "further along". Every value is directly labelled with its step-to-step conversion, so the
 * list is complete without hover; hovering a stage only emphasises it.
 */
export function FunnelChart({
  steps,
  formatCount,
  formatPercent,
  conversionLabel,
}: {
  steps: FunnelStep[];
  formatCount: (n: number) => string;
  formatPercent: (ratio: number) => string;
  /** e.g. (pct) => `${pct} of previous stage` */
  conversionLabel: (percent: string) => string;
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="space-y-3" onPointerLeave={() => setActive(null)}>
      {steps.map((step, i) => {
        const prev = steps[i - 1];
        const conversion = prev && prev.value ? step.value / prev.value : null;
        return (
          <li
            key={step.id}
            onPointerEnter={() => setActive(step.id)}
            className={cn('transition-opacity duration-[var(--motion-fast)]', active && active !== step.id && 'opacity-50')}
            data-testid="funnel-step"
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-text">{step.label}</span>
              <span className="flex shrink-0 items-baseline gap-2">
                {conversion !== null && (
                  <span className="text-xs text-muted">
                    <span className="sr-only">{conversionLabel(formatPercent(conversion))}</span>
                    <span aria-hidden>
                      <bdi dir="ltr" className="ltr-ref">
                        {formatPercent(conversion)}
                      </bdi>
                    </span>
                  </span>
                )}
                <bdi dir="ltr" className="ltr-ref font-semibold text-text">
                  {formatCount(step.value)}
                </bdi>
              </span>
            </div>
            <div aria-hidden className="h-2.5 rounded-e-[4px] bg-transparent">
              <motion.div
                initial={reduced ? false : { width: '0%' }}
                animate={{ width: `${Math.max(1.5, (step.value / max) * 100)}%` }}
                transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-e-[4px]"
                style={{ background: RAMP[Math.min(i, RAMP.length - 1)] }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
