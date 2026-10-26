import { X } from 'lucide-react';
import { forwardRef, useEffect, useRef, type CSSProperties } from 'react';
import { FocusScope, useId } from 'react-aria';
import { DemoBadge } from '../data/StatusLabel';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { IconButton } from '../primitives/IconButton';
import { LocaleToggle } from '../shell/LocaleSwitcher';
import { TourControls } from './TourControls';
import type { TourStep } from './tourTypes';

export interface TourCardProps {
  step: TourStep;
  index: number;
  total: number;
  isPhone: boolean;
  isFallback: boolean;
  modal: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onPause: () => void;
  onShowTarget: () => void;
  style?: CSSProperties;
  className?: string;
  arrow?: { side: 'top' | 'bottom'; offset: number } | null;
  inline?: boolean;
}

/**
 * The step card. Real heading, step x of y, and labelled controls. Focus moves to the heading on
 * each step. EXPLAIN steps are modal dialogs (focus contained, page inert); guided-action steps are
 * non-modal dialogs so the highlighted control can be used.
 */
export const TourCard = forwardRef<HTMLDivElement, TourCardProps>(function TourCard(
  { step, index, total, isPhone, isFallback, modal, onBack, onNext, onSkip, onPause, onShowTarget, style, className, arrow, inline },
  ref,
) {
  const { t } = useT();
  const titleId = useId();
  const bodyId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actionStep = step.kind !== 'EXPLAIN';
  const body = isPhone && step.mobileBodyKey ? step.mobileBodyKey : step.bodyKey;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step.id]);

  const card = (
    <div
      ref={ref}
      role="dialog"
      aria-modal={modal ? 'true' : 'false'}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-testid="tour-card"
      data-step-id={step.id}
      data-kind={step.kind}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onPause();
        }
      }}
      style={style}
      className={cn(
        'rounded-card border border-border bg-panel p-4 text-start shadow-overlay',
        !inline && 'transition-[top,left] duration-[var(--motion-tour)] ease-[var(--ease-standard)]',
        inline && 'border-2 border-primary',
        className,
      )}
    >
      {arrow && (
        <span
          aria-hidden
          className={cn('absolute size-3 rotate-45 border-border bg-panel', arrow.side === 'top' ? '-top-1.5 border-s border-t' : '-bottom-1.5 border-e border-b')}
          style={{ left: arrow.offset - 6 }}
        />
      )}
      <div className="flex items-start gap-2">
        <p className="flex-1 text-xs font-medium text-muted" data-testid="tour-progress">
          {t('onboarding:controls.progress', { current: index + 1, total })}
        </p>
        {step.kind === 'SIMULATED_TASK' && <DemoBadge training />}
        {/* Language stays switchable mid-tour, including while a modal step makes the page inert. */}
        <LocaleToggle className="min-h-8 px-2 text-xs pointer-coarse:min-h-10" />
        <IconButton label={t('onboarding:controls.close')} icon={X} onPress={onPause} className="-m-2 size-9" />
      </div>
      <div aria-hidden className="mt-2 flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-pill', i <= index ? 'bg-primary' : 'bg-border')} />
        ))}
      </div>
      <h2 ref={headingRef} id={titleId} tabIndex={-1} className="mt-3 text-base font-semibold text-text outline-none">
        {t(step.titleKey as 'onboarding:completion.title')}
      </h2>
      <div id={bodyId} className="mt-1 space-y-2 text-sm text-text">
        <p className="sr-only">{t('onboarding:controls.progress', { current: index + 1, total })}.</p>
        <p>{t(body as 'onboarding:completion.body')}</p>
        {isFallback && <p className="rounded-control bg-sunken p-2 text-muted">{t('onboarding:controls.targetUnavailable')}</p>}
      </div>
      <TourControls
        index={index}
        total={total}
        canAdvance={!actionStep || step.optional === true || isFallback}
        canShowTarget={actionStep && !isFallback}
        onBack={onBack}
        onNext={onNext}
        onSkip={onSkip}
        onShowTarget={onShowTarget}
      />
    </div>
  );

  return modal ? (
    <FocusScope contain autoFocus={false} restoreFocus={false}>
      {card}
    </FocusScope>
  ) : (
    card
  );
});
