import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Label, Radio, RadioGroup, Text } from 'react-aria-components';
import { cn } from '../lib/cn';

export interface ChoiceCard<T extends string> {
  id: T;
  label: string;
  description?: string;
  /** A small visual sample of the choice (decorative; the label carries the meaning). */
  visual?: ReactNode;
  isDisabled?: boolean;
}

/**
 * A setting as a group of cards (Gate D.1 personalization hub). A radio group: arrow keys move, the
 * choice applies at once and is announced; each card shows what it does before it is chosen.
 */
export function ChoiceCards<T extends string>({
  label,
  hideLabel = false,
  description,
  value,
  onChange,
  options,
  columns = 'auto',
  testId,
}: {
  label: string;
  hideLabel?: boolean;
  description?: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<ChoiceCard<T>>;
  /** 'auto': as many as fit (at least 9.5rem each); 'list': one per row. */
  columns?: 'auto' | 'list' | 2 | 3;
  testId?: string;
}) {
  // Each card is named by its label alone and described by its description (screen readers read
  // "More contrast, radio button" first, then the detail).
  const base = useId();
  return (
    <RadioGroup value={value} onChange={(v) => onChange(v as T)} className="min-w-0 space-y-3" data-testid={testId} data-value={value}>
      <Label className={cn('block text-sm font-semibold text-text', hideLabel && 'sr-only')}>{label}</Label>
      {description && (
        <Text slot="description" className="-mt-1.5 block text-sm text-muted">
          {description}
        </Text>
      )}
      <div
        className={cn(
          'grid gap-2.5',
          // Each card's minimum width grows with the person's text size, so large text gets fewer, wider cards.
          columns === 'auto' && 'grid-cols-[repeat(auto-fill,minmax(min(100%,calc(9.5rem*var(--text-scale))),1fr))]',
          columns === 2 && 'grid-cols-[repeat(auto-fill,minmax(min(100%,calc(11rem*var(--text-scale))),1fr))]',
          columns === 3 && 'grid-cols-[repeat(auto-fill,minmax(min(100%,calc(9rem*var(--text-scale))),1fr))]',
          columns === 'list' && 'grid-cols-1',
        )}
      >
        {options.map((o) => (
          <Radio
            key={o.id}
            value={o.id}
            isDisabled={o.isDisabled}
            aria-labelledby={`${base}-${o.id}-label`}
            aria-describedby={o.description ? `${base}-${o.id}-desc` : undefined}
            data-testid={testId ? `${testId}-${o.id}` : undefined}
            className={cn(
              'group flex min-w-0 cursor-pointer gap-3 rounded-tile border-2 border-border bg-panel p-3 text-start outline-none',
              columns === 'list' ? 'flex-row items-start' : 'flex-col',
              'transition-[border-color,background-color] duration-[var(--motion-fast)] data-hovered:border-border-control',
              'data-selected:border-primary data-selected:bg-primary-soft/50 data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
              'data-disabled:cursor-not-allowed data-disabled:opacity-60',
            )}
          >
            {({ isSelected }) => {
              // The check sits in the flow (never over a sample), at the end of the first row.
              const check = (
                <span
                  aria-hidden
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded-pill border-2',
                    isSelected ? 'border-primary bg-primary text-on-primary' : 'border-border-control bg-panel text-transparent',
                  )}
                >
                  <Check className="size-3" strokeWidth={3.5} />
                </span>
              );
              const text = (
                <span className="block min-w-0 flex-1">
                  <span id={`${base}-${o.id}-label`} className="block text-sm font-semibold text-text [overflow-wrap:anywhere]">
                    {o.label}
                  </span>
                  {o.description && (
                    <span id={`${base}-${o.id}-desc`} className="mt-0.5 block text-xs text-muted [overflow-wrap:anywhere]">
                      {o.description}
                    </span>
                  )}
                </span>
              );
              return o.visual ? (
                <>
                  <span className="flex w-full min-w-0 items-start gap-2">
                    <span aria-hidden className="block min-w-0 flex-1">
                      {o.visual}
                    </span>
                    {check}
                  </span>
                  {text}
                </>
              ) : (
                <span className="flex w-full min-w-0 items-start gap-3">
                  {text}
                  {check}
                </span>
              );
            }}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}
