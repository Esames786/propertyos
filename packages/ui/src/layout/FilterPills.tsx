import { motion } from 'motion/react';
import { useId } from 'react';
import { Label, Radio, RadioGroup } from 'react-aria-components';
import { cn } from '../lib/cn';
import { useReducedMotion } from '../preferences/PreferencesProvider';

export interface FilterPill<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/**
 * Single-choice filter as a row of pills (a radio group: arrow keys move, the choice is announced).
 * The selected pill fills with the action colour and slides between options; counts are part of
 * each option's name. Wraps on narrow screens rather than hiding options.
 */
export function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
  showLabel = false,
  testId,
  className,
}: {
  label: string;
  options: FilterPill<T>[];
  value: T;
  onChange: (value: T) => void;
  showLabel?: boolean;
  testId?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const pillId = useId();
  return (
    <RadioGroup
      value={value}
      onChange={(v) => onChange(v as T)}
      orientation="horizontal"
      data-testid={testId}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      <Label className={showLabel ? 'me-1 text-sm text-muted' : 'sr-only'}>{label}</Label>
      {options.map((o) => (
        <Radio
          key={o.id}
          value={o.id}
          data-testid={testId ? `${testId}-${o.id}` : undefined}
          className={cn(
            'relative inline-flex min-h-9 cursor-default items-center gap-1.5 rounded-pill border border-border bg-panel px-3.5 text-sm font-medium text-text outline-none pointer-coarse:min-h-10',
            'transition-colors duration-[var(--motion-fast)] data-hovered:border-border-control',
            'data-selected:border-transparent data-selected:text-on-primary',
            'data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
          )}
        >
          {({ isSelected }) => (
            <>
              {isSelected && (
                <motion.span
                  layoutId={pillId}
                  aria-hidden
                  transition={reduced ? { duration: 0 } : { type: 'spring', bounce: 0.2, duration: 0.4 }}
                  className="absolute inset-0 rounded-pill bg-primary"
                />
              )}
              <span className="relative">{o.label}</span>
              {o.count !== undefined && (
                <span className={cn('relative rounded-pill px-1.5 text-xs tabular', isSelected ? 'bg-primary-hover' : 'bg-sunken text-muted')}>{o.count}</span>
              )}
            </>
          )}
        </Radio>
      ))}
    </RadioGroup>
  );
}
