import { CheckCircle2, CircleDashed, Compass, GraduationCap, ListChecks, PauseCircle, PlayCircle, RotateCcw, SkipForward, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Badge, type StatusTone } from '../data/StatusLabel';
import { NotFoundState } from '../feedback/States';
import { PageHeader } from '../layout/PageHeader';
import { Panel } from '../layout/Panel';
import { useT } from '../lib/useT';
import { Button, buttonClass } from '../primitives/Button';
import { Link } from '../primitives/Link';
import { useGuidedTour } from './GuidedTourProvider';
import { TextOnlyTour } from './TextOnlyTour';
import type { TourDefinition } from './tourTypes';

/**
 * GUIDE-003: every tour available to this persona, with status, start/resume/replay and its text
 * version. GUIDE-002's register URL (/help/tours/:tourId) lands here and starts that tour. Shared by
 * every app; the practice panel appears only where the app offers a practice sandbox.
 */
export function TourLibraryView({ autoStartTourId, practiceHref }: { autoStartTourId?: string; practiceHref?: string }) {
  const { t } = useT();
  const tour = useGuidedTour();
  const started = useRef(false);

  useEffect(() => {
    if (!autoStartTourId || started.current) return;
    started.current = true;
    const id = requestAnimationFrame(() => tour.start(autoStartTourId));
    return () => cancelAnimationFrame(id);
  }, [autoStartTourId, tour]);

  return (
    <>
      <PageHeader title={t('onboarding:library.title')} description={t('onboarding:library.intro')} />
      <div className="space-y-4" data-testid="tour-library">
        {tour.available.length === 0 && <p className="text-muted">{t('onboarding:library.noTours')}</p>}
        {tour.available.map((def) => (
          <TourRow key={def.id} def={def} />
        ))}
        {practiceHref && (
          <Panel
            title={t('onboarding:library.practiceTitle')}
            description={t('onboarding:library.practiceBody')}
            actions={
              <Link variant="plain" href={practiceHref} className={buttonClass('secondary')}>
                <GraduationCap aria-hidden className="size-4" />
                {t('onboarding:library.openPractice')}
              </Link>
            }
          >
            {null}
          </Panel>
        )}
      </div>
    </>
  );
}

function TourRow({ def }: { def: TourDefinition }) {
  const { t } = useT();
  const tour = useGuidedTour();
  const progress = tour.progressFor(def.id);
  const steps = tour.resolvedSteps(def.id);
  const index = progress?.lastStepId ? Math.max(0, steps.findIndex((s) => s.id === progress.lastStepId)) : 0;
  const status = progress?.status;

  const [tone, Icon, label]: [StatusTone, LucideIcon, string] =
    status === 'completed'
      ? ['success', CheckCircle2, t('onboarding:status.completed')]
      : status === 'paused'
        ? ['warning', PauseCircle, t('onboarding:status.paused', { current: index + 1, total: steps.length })]
        : status === 'in_progress'
          ? ['info', PlayCircle, t('onboarding:status.inProgress', { current: index + 1, total: steps.length })]
          : status === 'dismissed'
            ? ['neutral', SkipForward, t('onboarding:status.dismissed')]
            : ['neutral', CircleDashed, t('onboarding:status.notStarted')];

  const resumable = status === 'paused' || status === 'in_progress';

  return (
    <Panel
      title={t(def.nameKey as 'onboarding:library.title')}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span>{t(def.summaryKey as 'onboarding:library.title')}</span>
          <span aria-hidden>·</span>
          <span>{t('onboarding:library.steps', { count: steps.length })}</span>
          <span aria-hidden>·</span>
          <span>{t('onboarding:library.version', { version: def.version })}</span>
        </span>
      }
      actions={<Badge tone={tone} icon={Icon}>{label}</Badge>}
    >
      <div className="flex flex-wrap gap-2" data-testid={`tour-row-${def.id}`}>
        {resumable && (
          <Button variant="primary" icon={PlayCircle} onPress={() => tour.start(def.id, { resume: true })} data-testid={`resume-${def.id}`}>
            {t('onboarding:controls.resume')}
          </Button>
        )}
        <Button
          variant={resumable ? 'secondary' : 'primary'}
          icon={status === 'completed' || status === 'dismissed' ? RotateCcw : Compass}
          onPress={() => tour.start(def.id)}
          data-testid={`start-${def.id}`}
        >
          {status === 'completed' || status === 'dismissed'
            ? t('onboarding:controls.replay')
            : resumable
              ? t('onboarding:controls.restart')
              : t('onboarding:controls.start')}
        </Button>
        <Link variant="plain" href={tour.links.textGuide(def.id)} className={buttonClass('secondary')}>
          <ListChecks aria-hidden className="size-4" />
          {t('onboarding:controls.textVersion')}
        </Link>
      </div>
    </Panel>
  );
}

/** Accessible text-only version of a tour (doc 09 §7): same steps, no spotlight required. */
export function TextGuideView({ tourId }: { tourId: string }) {
  const { t } = useT();
  const { available, links } = useGuidedTour();
  const def = available.find((d) => d.id === tourId);
  if (!def) return <NotFoundState headingLevel={1} />;
  const name = t(def.nameKey as 'onboarding:library.title');
  return (
    <>
      <PageHeader
        title={t('nav:pages.textGuide', { tour: name })}
        description={t(def.summaryKey as 'onboarding:library.title')}
        breadcrumbs={[{ label: t('nav:pages.tourLibrary'), href: links.library }, { label: name }]}
      />
      <TextOnlyTour tourId={tourId} />
    </>
  );
}
