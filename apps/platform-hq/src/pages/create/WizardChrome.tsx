import type { QuotePreview } from '@repo/contracts';
import { Button, cn, DirectionalIcon, Skeleton, useT } from '@repo/ui';
import { ArrowLeft, ArrowRight, Check, Lock } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { useHqFormat } from '../../lib/format';
import { ApprovalBadge } from '../../components/quote';
import { STEPS, stepIndex, type Step } from './wizard';

const TOTAL = STEPS.length;

function focusHeading(el: HTMLElement | null) {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest' });
}

/** One wizard step: "Step n of 9", the step heading (h1, focused on step change) and its content. */
export function StepFrame({ step, title, intro, autoFocus, children, testId }: { step: Step; title: string; intro?: ReactNode; autoFocus: boolean; children: ReactNode; testId: string }) {
  const { t } = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  const position = { current: stepIndex(step) + 1, total: TOTAL };
  useEffect(() => {
    if (autoFocus) focusHeading(heading.current);
  }, [autoFocus]);
  return (
    <section aria-labelledby="page-title" className="rounded-card border border-border bg-panel p-5 shadow-raised sm:p-7" data-testid={testId}>
      <p aria-hidden className="text-xs font-semibold tracking-[0.08em] text-accent uppercase">
        {t('platform:wizard.stepOf', position)}
      </p>
      <h1 id="page-title" ref={heading} tabIndex={-1} className="mt-1.5 text-[1.6rem] leading-tight font-bold text-text outline-none sm:text-[1.9rem]">
        <span className="sr-only">{t('platform:wizard.stepPrefix', position)} </span>
        {title}
      </h1>
      {intro && <div className="mt-2 max-w-3xl text-base text-muted">{intro}</div>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Back · Continue (or the final action). On phones Continue spans the row. */
export function StepActions({
  onBack,
  onNext,
  nextLabel,
  pending = false,
  nextDisabledReason,
  testId,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  pending?: boolean;
  /** When set, Continue is disabled and the reason is shown (never a silent dead button). */
  nextDisabledReason?: string;
  testId: string;
}) {
  const { t } = useT();
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
      {onBack && (
        <Button variant="secondary" size="lg" onPress={onBack} data-testid={`${testId}-back`} className="max-sm:flex-1">
          <span className="inline-flex items-center gap-2">
            <DirectionalIcon icon={ArrowLeft} className="size-4" />
            {t('platform:wizard.back')}
          </span>
        </Button>
      )}
      <div className="flex flex-col items-end gap-1.5 max-sm:w-full sm:ms-auto">
        <Button
          variant="primary"
          size="lg"
          onPress={onNext}
          isPending={pending}
          isDisabled={!!nextDisabledReason}
          disabledReason={nextDisabledReason}
          data-testid={`${testId}-next`}
          className="max-sm:w-full"
        >
          <span className="inline-flex items-center gap-2">
            {nextLabel ?? t('platform:wizard.continue')}
            {!pending && <DirectionalIcon icon={ArrowRight} className="size-4" />}
          </span>
        </Button>
      </div>
    </div>
  );
}

/**
 * Progress through the nine steps. Wide screens list every step (reached ones can be reopened,
 * later ones are locked); phones show the current step and a segmented bar. aria-current marks it.
 */
export function Stepper({ current, reached, onGo }: { current: Step; reached: number; onGo: (step: Step) => void }) {
  const { t } = useT();
  const index = stepIndex(current);
  return (
    <nav aria-label={t('platform:wizard.progress')} data-testid="wizard-stepper">
      <div className="rounded-card border border-border bg-panel p-4 shadow-card lg:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-bold text-text" aria-current="step">
            {t(`platform:wizard.steps.${current}`)}
          </p>
          <p className="shrink-0 text-xs font-medium text-muted tabular">{t('platform:wizard.stepOf', { current: index + 1, total: TOTAL })}</p>
        </div>
        <div aria-hidden className="mt-3 grid grid-cols-9 gap-1">
          {STEPS.map((s, i) => (
            <span key={s} className={cn('h-1.5 rounded-pill', i < index || i <= reached ? (i === index ? 'bg-primary' : 'bg-primary/45') : 'bg-sunken')} />
          ))}
        </div>
      </div>
      <ol className="hidden space-y-1 rounded-card border border-border bg-panel p-3 shadow-card lg:block">
        {STEPS.map((s, i) => {
          const isCurrent = s === current;
          const done = i < index || (i <= reached && !isCurrent);
          const locked = i > reached + 1 && !isCurrent;
          return (
            <li key={s}>
              <AriaButton
                onPress={() => onGo(s)}
                isDisabled={locked || isCurrent}
                aria-current={isCurrent ? 'step' : undefined}
                data-testid={`stepper-${s}`}
                className={cn(
                  'flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-start text-sm outline-none',
                  'data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-focus',
                  isCurrent ? 'bg-primary-soft font-bold text-primary' : locked ? 'text-subtle' : 'text-text',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-pill text-xs font-bold',
                    isCurrent ? 'bg-primary text-on-primary' : done ? 'bg-primary/15 text-primary' : 'bg-sunken text-muted',
                  )}
                >
                  {done ? <Check className="size-3.5" /> : locked ? <Lock className="size-3" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{t(`platform:wizard.steps.${s}`)}</span>
                <span className="sr-only">{done ? t('platform:wizard.stepDone') : locked ? t('platform:wizard.stepLocked') : ''}</span>
              </AriaButton>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Live price beside the pricing steps: re-priced on the server after every edit. */
export function QuoteAside({ quote, loading, unavailable = false }: { quote: QuotePreview | undefined; loading: boolean; unavailable?: boolean }) {
  const { t } = useT();
  const fmt = useHqFormat();
  return (
    <aside aria-label={t('platform:wizard.liveQuote')} className="rounded-card border border-border bg-panel p-4 shadow-card" data-testid="quote-aside">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-text">{t('platform:wizard.liveQuote')}</h2>
        {loading && <span className="text-xs text-muted">{t('platform:wizard.repricing')}</span>}
      </div>
      {unavailable ? (
        <p className="mt-3 text-sm font-medium text-error" role="status" data-testid="aside-unavailable">
          {t('platform:validation.quoteUnavailable')}
        </p>
      ) : !quote ? (
        <Skeleton className="mt-3 h-24 rounded-tile" />
      ) : (
        <dl className="mt-3 space-y-3" aria-live="polite">
          <div>
            <dt className="text-xs text-muted">{t('platform:quote.firstPeriod')}</dt>
            <dd className="text-xl font-bold text-text tabular" data-testid="aside-first">
              <bdi dir="ltr">{fmt.money(quote.firstPeriod.total)}</bdi>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('platform:quote.regularPeriod')}</dt>
            <dd className="text-xl font-bold text-text tabular" data-testid="aside-regular">
              <bdi dir="ltr">{fmt.money(quote.regularPeriod.total)}</bdi>
            </dd>
          </div>
          <div>
            <dt className="sr-only">{t('platform:approval.title')}</dt>
            <dd>
              <ApprovalBadge approval={quote.approval} />
            </dd>
          </div>
        </dl>
      )}
      <p className="mt-3 text-xs text-muted">{t('platform:wizard.notInvoice')}</p>
    </aside>
  );
}
