import { GraduationCap } from 'lucide-react';
import { useT } from '../lib/useT';
import { Button } from '../primitives/Button';
import { useTraining } from './TrainingProvider';

/** Always-visible TRAINING / DEMO marker while practice mode is on (doc 09 §2C, acceptance 12). */
export function PracticeModeBanner() {
  const { active, end } = useTraining();
  const { t } = useT();
  if (!active) return null;
  return (
    <div
      role="status"
      data-testid="practice-banner"
      className="sticky top-[var(--header-height)] z-20 flex flex-wrap items-center gap-3 border-b-2 border-demo bg-demo-soft px-4 py-2 text-sm text-demo"
    >
      <GraduationCap aria-hidden className="size-5 shrink-0" />
      <p className="min-w-0 flex-1 font-medium">{t('onboarding:practice.banner')}</p>
      <Button size="sm" variant="secondary" onPress={() => void end()}>
        {t('onboarding:practice.end')}
      </Button>
    </div>
  );
}
