import { ArrowLeft, ArrowRight, Crosshair } from 'lucide-react';
import { useT } from '../lib/useT';
import { Button } from '../primitives/Button';
import { DirectionalIcon } from '../primitives/DirectionalIcon';

/**
 * Back | Next/Finish | Skip tour. "Next" is always index + 1; only its arrow mirrors in RTL.
 * Guided actions that must be performed hide Next and offer "Go to the highlighted control".
 */
export function TourControls({
  index,
  total,
  canAdvance,
  canShowTarget,
  onBack,
  onNext,
  onSkip,
  onShowTarget,
}: {
  index: number;
  total: number;
  canAdvance: boolean;
  canShowTarget: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onShowTarget: () => void;
}) {
  const { t } = useT();
  const isLast = index === total - 1;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button variant="quiet" size="sm" onPress={onSkip} className="me-auto" data-testid="tour-skip">
        {t('onboarding:controls.skip')}
      </Button>
      {canShowTarget && (
        <Button variant="secondary" size="sm" icon={Crosshair} onPress={onShowTarget} data-testid="tour-show-target">
          {t('onboarding:controls.showTarget')}
        </Button>
      )}
      {index > 0 && (
        <Button variant="secondary" size="sm" onPress={onBack} data-testid="tour-back">
          <span className="inline-flex items-center gap-1.5">
            <DirectionalIcon icon={ArrowLeft} className="size-4" />
            {t('onboarding:controls.back')}
          </span>
        </Button>
      )}
      {canAdvance && (
        <Button variant="primary" size="sm" onPress={onNext} data-testid="tour-next">
          <span className="inline-flex items-center gap-1.5">
            {isLast ? t('onboarding:controls.finish') : t('onboarding:controls.next')}
            {!isLast && <DirectionalIcon icon={ArrowRight} className="size-4" />}
          </span>
        </Button>
      )}
    </div>
  );
}
