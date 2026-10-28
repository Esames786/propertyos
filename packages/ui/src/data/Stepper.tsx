import { Check, Clock3, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';

export interface StepperStep {
  id: string;
  label: string;
  /** Who moved it and when, or what happens next. */
  detail?: ReactNode;
  state: 'done' | 'current' | 'upcoming' | 'failed' | 'waiting';
}

/**
 * A compact, responsive progress stepper (billing runs, payment proofs, receipts). On a narrow
 * container it is one row of segments with the current step named under it ("Step 3 of 6"); with
 * room, every step is labelled. The state of each step is in words for assistive technology, never
 * colour alone; `aria-current="step"` marks where things stand.
 */
export function Stepper({ steps, label, testId, className }: { steps: StepperStep[]; label: string; testId?: string; className?: string }) {
  const { t } = useT();
  const allDone = steps.every((s) => s.state === 'done');
  // Where things stand: the first step in progress, else the last one done.
  const active = steps.findIndex((s) => s.state === 'current' || s.state === 'failed' || s.state === 'waiting');
  const at = allDone ? steps.length - 1 : active >= 0 ? active : Math.max(0, steps.findLastIndex((s) => s.state === 'done'));
  const current = steps[at] ?? steps[steps.length - 1]!;
  const word = (s: StepperStep['state']) => t(`common:stepper.state.${s}`);
  return (
    <div className={cn('@container min-w-0', className)} data-testid={testId} data-step={allDone ? 'done' : current.id}>
      <ol aria-label={label} className="flex gap-1.5 @lg:grid @lg:gap-0" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const isCurrent = !allDone && i === at;
          return (
            <li key={s.id} aria-current={isCurrent ? 'step' : undefined} className="relative min-w-0 flex-1" data-state={s.state}>
              {/* Narrow: one segment per step. */}
              <span aria-hidden className={cn('block h-1.5 rounded-pill @lg:hidden', s.state === 'done' ? 'bg-primary' : s.state === 'failed' ? 'bg-error' : isCurrent ? 'bg-accent' : 'bg-sunken')} />
              {/* Wide: a marker on a line, the label and the detail. */}
              <span className="hidden @lg:flex @lg:flex-col @lg:items-center @lg:px-1 @lg:text-center">
                <span aria-hidden className="relative flex w-full items-center justify-center">
                  {i > 0 && <span className={cn('absolute end-1/2 me-4 h-0.5 w-[calc(100%-2rem)] rounded-pill', steps[i - 1]!.state === 'done' ? 'bg-primary' : 'bg-sunken')} />}
                  <span
                    className={cn(
                      'relative grid size-7 place-items-center rounded-pill border-2 bg-panel',
                      s.state === 'done' && 'border-primary bg-primary text-on-primary',
                      s.state === 'failed' && 'border-error bg-error text-on-primary',
                      isCurrent && s.state !== 'failed' && 'border-accent text-accent',
                      !isCurrent && s.state === 'upcoming' && 'border-border-control text-subtle',
                    )}
                  >
                    {s.state === 'done' ? <Check className="size-4" strokeWidth={2.6} /> : s.state === 'failed' ? <X className="size-4" strokeWidth={2.6} /> : s.state === 'waiting' ? <Clock3 className="size-3.5" /> : <span className={cn('size-2 rounded-pill', isCurrent ? 'bg-accent' : 'bg-border-control')} />}
                  </span>
                </span>
                <span className={cn('mt-2 block text-xs font-semibold', isCurrent || s.state === 'failed' ? 'text-text' : s.state === 'done' ? 'text-muted' : 'text-subtle')}>{s.label}</span>
                {s.detail && <span className="mt-0.5 block max-w-full text-xs text-muted">{s.detail}</span>}
              </span>
              <span className="sr-only">
                {s.label}: {word(isCurrent && s.state === 'upcoming' ? 'current' : s.state)}
              </span>
            </li>
          );
        })}
      </ol>
      {/* Narrow: name the step that matters now. */}
      <p aria-hidden className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm @lg:hidden">
        <span className="text-xs text-muted">{t('common:stepper.stepOf', { n: at + 1, total: steps.length })}</span>
        <span className="font-semibold text-text">{allDone ? steps[steps.length - 1]!.label : current.label}</span>
        {current.detail && !allDone && <span className="text-xs text-muted">{current.detail}</span>}
      </p>
    </div>
  );
}
