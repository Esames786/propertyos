import { Button, cn, DirectionalIcon, useT } from '@repo/ui';
import { ArrowLeft, ArrowRight, Check, Info, Minus } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { focusHeading } from '../entry';
import { firstOpenStep, isStepComplete, SETUP_STEPS, stepIndex, type SetupDraft, type SetupStep } from './draft';

const TOTAL = SETUP_STEPS.length;

/** The card that holds one wizard step: "Step n of 6", the step heading (h1) and its content. */
export function StepFrame({
  step,
  title,
  intro,
  autoFocus,
  children,
  testId,
}: {
  step: SetupStep;
  title: string;
  intro?: ReactNode;
  autoFocus: boolean;
  children: ReactNode;
  testId: string;
}) {
  const { t } = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  const position = { current: stepIndex(step) + 1, total: TOTAL };

  useEffect(() => {
    if (autoFocus) focusHeading(heading.current);
  }, [autoFocus]);

  return (
    <section aria-labelledby="page-title" className="rounded-card border border-border bg-panel p-5 shadow-raised sm:p-8" data-testid={testId}>
      <p aria-hidden className="text-xs font-semibold tracking-[0.08em] text-accent uppercase">
        {t('start:setup.stepOf', position)}
      </p>
      <h1 id="page-title" ref={heading} tabIndex={-1} className="mt-1.5 font-display text-figure-sm leading-tight text-text outline-none sm:text-4xl [:lang(ur)_&]:leading-[1.75] [:lang(ur)_&]:pt-1">
        <span className="sr-only">{t('start:setup.stepPrefix', position)} </span>
        {title}
      </h1>
      {intro && <div className="mt-2 max-w-2xl text-base text-muted">{intro}</div>}
      <div className="mt-7">{children}</div>
    </section>
  );
}

/** Back · Skip · Continue. On phones Back and Skip share a row and Continue spans the next one. */
export function StepActions({
  onBack,
  backLabel,
  onSkip,
  submitLabel,
  pending = false,
  testId,
}: {
  onBack: () => void;
  backLabel?: string;
  onSkip?: () => void;
  submitLabel: string;
  pending?: boolean;
  testId: string;
}) {
  const { t } = useT();
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
      <Button variant="secondary" size="lg" onPress={onBack} data-testid={`${testId}-back`} className="max-sm:flex-1">
        <span className="inline-flex items-center gap-2">
          <DirectionalIcon icon={ArrowLeft} className="size-4" />
          {backLabel ?? t('start:setup.actions.back')}
        </span>
      </Button>
      {onSkip && (
        <Button variant="quiet" size="lg" onPress={onSkip} data-testid={`${testId}-skip`} className="max-sm:flex-1 sm:ms-auto">
          {t('start:setup.actions.skip')}
        </Button>
      )}
      <Button type="submit" variant="primary" size="lg" isPending={pending} data-testid={`${testId}-next`} className={cn('max-sm:w-full', !onSkip && 'sm:ms-auto')}>
        <span className="inline-flex items-center gap-2">
          {submitLabel}
          {!pending && <DirectionalIcon icon={ArrowRight} className="size-4" />}
        </span>
      </Button>
    </div>
  );
}

type StepState = 'done' | 'current' | 'skipped' | 'upcoming';

function stateOf(step: SetupStep, current: SetupStep, draft: SetupDraft): StepState {
  if (step === current) return 'current';
  if ((step === 'project' && draft.projectState === 'skipped') || (step === 'team' && draft.teamState === 'skipped')) return 'skipped';
  return isStepComplete(step, draft) ? 'done' : 'upcoming';
}

/**
 * Progress through the six steps. Wide screens get the full list (finished steps can be reopened);
 * phones get the current step name and a segmented bar. The current step is marked aria-current.
 */
export function Stepper({ current, draft, onGo }: { current: SetupStep; draft: SetupDraft; onGo: (step: SetupStep) => void }) {
  const { t } = useT();
  const reachableUpTo = stepIndex(firstOpenStep(draft));
  const index = stepIndex(current);
  return (
    <nav aria-label={t('start:setup.progressLabel')} data-testid="setup-stepper">
      {/* Phone and tablet: compact */}
      <div className="rounded-card border border-border bg-panel p-4 shadow-card lg:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-bold text-text" aria-current="step">
            {t(`start:setup.steps.${current}`)}
          </p>
          <p className="shrink-0 text-xs font-medium text-muted tabular">{t('start:setup.stepOf', { current: index + 1, total: TOTAL })}</p>
        </div>
        <div aria-hidden className="mt-3 grid grid-cols-6 gap-1.5">
          {SETUP_STEPS.map((s) => {
            const state = stateOf(s, current, draft);
            return (
              <span
                key={s}
                className={cn(
                  'h-2 rounded-pill transition-colors duration-[var(--motion-regular)]',
                  state === 'done' && 'bg-primary',
                  state === 'current' && 'bg-tile-emerald',
                  state === 'skipped' && 'bg-border-control/50',
                  state === 'upcoming' && 'bg-sunken',
                )}
              />
            );
          })}
        </div>
      </div>

      {/* Desktop: full list */}
      <ol className="hidden rounded-card border border-border bg-panel p-2 shadow-card lg:block">
        {SETUP_STEPS.map((s, i) => {
          const state = stateOf(s, current, draft);
          const reachable = s !== current && i <= reachableUpTo;
          const content = (
            <>
              <span
                aria-hidden
                className={cn(
                  'relative z-10 grid size-8 shrink-0 place-items-center rounded-pill border-2 text-sm font-bold tabular transition-colors duration-[var(--motion-regular)]',
                  state === 'done' && 'border-primary bg-primary text-on-primary',
                  state === 'current' && 'border-primary bg-primary-soft text-primary',
                  state === 'skipped' && 'border-border-control bg-panel text-muted',
                  state === 'upcoming' && 'border-border bg-panel text-muted',
                )}
              >
                {state === 'done' ? <Check className="size-4" strokeWidth={3} /> : state === 'skipped' ? <Minus className="size-4" /> : i + 1}
              </span>
              <span className="min-w-0 text-start">
                <span className={cn('block text-sm leading-snug', state === 'current' ? 'font-bold text-text' : 'font-medium text-text')}>{t(`start:setup.steps.${s}`)}</span>
                <span className="block text-xs text-muted">{t(`start:setup.stepState.${state}`)}</span>
              </span>
            </>
          );
          return (
            <li key={s} aria-current={state === 'current' ? 'step' : undefined} className="relative">
              {i < SETUP_STEPS.length - 1 && <span aria-hidden className="absolute start-[1.5rem] top-11 bottom-[-0.25rem] w-0.5 rounded-pill bg-border" />}
              {reachable ? (
                <AriaButton
                  onPress={() => onGo(s)}
                  data-testid={`setup-stepper-${s}`}
                  className="flex min-h-14 w-full items-center gap-3 rounded-control px-2 py-2 outline-none data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-focus"
                >
                  {content}
                </AriaButton>
              ) : (
                <div className={cn('flex min-h-14 items-center gap-3 rounded-control px-2 py-2', state === 'current' && 'bg-primary-soft/60')}>{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Persistent label: the whole wizard is a simulation. */
export function SimulationNote({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <div className={cn('flex gap-3 rounded-card border border-demo/30 bg-demo-soft p-4 text-sm', className)} data-testid="setup-simulation-note">
      <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-demo" />
      <div className="min-w-0">
        <p className="font-semibold text-text">{t('start:setup.simulationTitle')}</p>
        <p className="mt-1 text-text">{t('start:setup.simulationBody')}</p>
      </div>
    </div>
  );
}
