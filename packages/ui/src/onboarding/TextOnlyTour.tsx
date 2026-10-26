import { useState } from 'react';
import { useIsTabletUp } from '../lib/useMediaQuery';
import { useT } from '../lib/useT';
import { Button } from '../primitives/Button';
import { useGuidedTour } from './GuidedTourProvider';
import { findAnchor } from './TourAnchor';

/**
 * Accessible text-only equivalent of a tour (doc 09 §7): the same steps as an ordered list,
 * each with "Show me", which focuses the real control. Needs no spotlight, hover or animation.
 */
export function TextOnlyTour({ tourId }: { tourId: string }) {
  const { t } = useT();
  const { resolvedSteps, markCompleted, progressFor, available } = useGuidedTour();
  const isTablet = useIsTabletUp();
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const tour = available.find((d) => d.id === tourId);
  if (!tour) return null;
  const steps = resolvedSteps(tourId);
  const done = progressFor(tourId)?.status === 'completed';

  const showMe = (stepId: string, targetId?: string, mobileTargetId?: string) => {
    const id = (!isTablet && mobileTargetId) || targetId;
    const el = id ? findAnchor(id) : null;
    if (!el) {
      setUnavailable(stepId);
      return;
    }
    setUnavailable(null);
    el.scrollIntoView({ block: 'center' });
    const focusable = el.matches('a,button,input,select,textarea,[tabindex]') ? el : el.querySelector<HTMLElement>('a,button,input,select,textarea');
    (focusable ?? el).focus();
    el.setAttribute('data-tour-active', '');
    setTimeout(() => el.removeAttribute('data-tour-active'), 2500);
  };

  return (
    <div className="space-y-6">
      <ol className="space-y-4" data-testid="text-guide">
        {steps.map((step, i) => (
          <li key={step.id} className="rounded-card border border-border bg-panel p-4">
            <p className="text-xs font-medium text-muted">{t('onboarding:controls.progress', { current: i + 1, total: steps.length })}</p>
            <h2 className="mt-1 text-base font-semibold text-text">{t(step.titleKey as 'onboarding:completion.title')}</h2>
            <p className="mt-1 text-sm text-text">
              {t(((!isTablet && step.mobileBodyKey) || step.bodyKey) as 'onboarding:completion.body')}
            </p>
            {step.targetId && (
              <div className="mt-3">
                <Button size="sm" variant="secondary" onPress={() => showMe(step.id, step.targetId, step.mobileTargetId)}>
                  {t('onboarding:controls.showMe')}
                </Button>
                {unavailable === step.id && (
                  <p role="status" className="mt-2 text-sm text-muted">
                    {t('onboarding:controls.targetUnavailable')}
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      <Button variant="primary" isDisabled={done} onPress={() => markCompleted(tourId)}>
        {done ? t('onboarding:status.completed') : t('onboarding:controls.finish')}
      </Button>
    </div>
  );
}
