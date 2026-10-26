import { Button, InlineAlert, PageHeader, Panel, useApiQuery, useQueryParam, useT } from '@repo/ui';
import { LAB_TOUR, PRACTICE_LEAD_DRAWER, useGuidedTour } from '@repo/ui/onboarding';
import { Compass, GraduationCap } from 'lucide-react';

/** GUIDE-004 foundation: practice tasks run on fictional data with an isolated training store. */
export default function PracticeSandbox() {
  const { t } = useT();
  const tour = useGuidedTour();
  const [, setDrawer] = useQueryParam('drawer');
  const records = useApiQuery<{ count: number }>({ method: 'GET', path: '/practice/records' }, { refetchInterval: 2000 });
  const canPractice = tour.available.some((d) => d.id === LAB_TOUR.id) && tour.resolvedSteps(LAB_TOUR.id).some((s) => s.id === 'fillForm');

  return (
    <>
      <PageHeader title={t('onboarding:practice.title')} description={t('onboarding:practice.intro')} />
      <InlineAlert tone="info" className="mb-6">
        {t('onboarding:practice.banner')}
      </InlineAlert>
      <div className="space-y-6">
        <Panel title={t('onboarding:practice.tasksTitle')}>
          <div className="flex flex-col gap-4 rounded-card border border-border p-4 sm:flex-row sm:items-center">
            <GraduationCap aria-hidden className="size-8 shrink-0 text-demo" />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-text">{t('onboarding:practice.leadTask')}</h3>
              <p className="text-sm text-muted">{t('onboarding:practice.leadTaskBody')}</p>
              <p className="mt-1 text-xs text-muted" data-testid="training-count">
                {t('onboarding:practice.trainingRecords', { count: records.data?.count ?? 0 })}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={Compass} isDisabled={!canPractice} onPress={() => tour.start(LAB_TOUR.id)} data-testid="start-practice-tour">
                {t('onboarding:practice.startTask')}
              </Button>
              <Button variant="secondary" isDisabled={!canPractice} onPress={() => setDrawer(PRACTICE_LEAD_DRAWER, { replace: false })}>
                {t('onboarding:practice.doItYourself')}
              </Button>
            </div>
          </div>
        </Panel>
        <p className="text-sm text-muted">{t('onboarding:practice.comingLater')}</p>
      </div>
    </>
  );
}
