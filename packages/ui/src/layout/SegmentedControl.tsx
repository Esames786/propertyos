import { motion } from 'motion/react';
import { useId } from 'react';
import { Radio, RadioGroup } from 'react-aria-components';
import { cn } from '../lib/cn';
import { useReducedMotion } from '../preferences/PreferencesProvider';

/**
 * Single choice among a few options (date range, view): a radio group styled as segments, so
 * arrow keys move the choice and screen readers hear "radio, 2 of 4". The selection pill slides
 * between segments (Motion layout animation), and is still under reduced motion.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  testId,
}: {
  label: string;
  options: Array<{ id: T; label: string; shortLabel?: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  testId?: string;
}) {
  const reduced = useReducedMotion();
  const layoutId = useId();
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onChange={(v) => onChange(v as T)}
      orientation="horizontal"
      data-testid={testId}
      className={cn('inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-pill bg-sunken p-1 scrollbar-none', className)}
    >
      {options.map((o) => (
        <Radio
          key={o.id}
          value={o.id}
          className={cn(
            'relative min-h-8 shrink-0 cursor-default rounded-pill px-3.5 text-sm whitespace-nowrap text-muted outline-none',
            'grid place-items-center transition-colors duration-[var(--motion-fast)] data-hovered:text-text data-selected:font-medium data-selected:text-text pointer-coarse:min-h-10',
            'data-focus-visible:outline-2 data-focus-visible:outline-offset-1 data-focus-visible:outline-focus',
          )}
        >
          {({ isSelected }) => (
            <>
              {isSelected && (
                <motion.span
                  layoutId={layoutId}
                  transition={reduced ? { duration: 0 } : { type: 'spring', bounce: 0.18, duration: 0.45 }}
                  className="absolute inset-0 rounded-pill bg-panel shadow-card"
                />
              )}
              <span className="relative">
                {o.shortLabel ? (
                  <>
                    <span className="sm:hidden">{o.shortLabel}</span>
                    <span className="max-sm:hidden">{o.label}</span>
                  </>
                ) : (
                  o.label
                )}
              </span>
            </>
          )}
        </Radio>
      ))}
    </RadioGroup>
  );
}
