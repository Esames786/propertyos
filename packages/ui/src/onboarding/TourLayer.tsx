import { useLocale } from '@repo/i18n';
import { Compass, Play, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { cn } from '../lib/cn';
import { BREAKPOINTS, useMediaQuery } from '../lib/useMediaQuery';
import { useT } from '../lib/useT';
import { usePreferences } from '../preferences/PreferencesProvider';
import { Button } from '../primitives/Button';
import { IconButton } from '../primitives/IconButton';
import { Spinner } from '../primitives/Spinner';
import { FirstLoginWelcome, TourCompletion } from './TourDialogs';
import { useGuidedTour } from './GuidedTourProvider';
import { TourOverlay } from './TourOverlay';
import { TourCard } from './TourPopover';
import { placeCard, sheetEdge, type Box } from './placement';
import type { TourDefinition } from './tourTypes';

function focusTarget(el: HTMLElement | null) {
  if (!el) return;
  const focusable = el.matches('a,button,input,select,textarea,[tabindex]')
    ? el
    : el.querySelector<HTMLElement>('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
  (focusable ?? el).focus();
}

/** Renders the welcome, the running step (spotlight + card), the locating notice, completion and offers. */
export function TourLayer({ showWelcome, offer, onDismissOffer }: { showWelcome: boolean; offer: TourDefinition | null; onDismissOffer: () => void }) {
  const tour = useGuidedTour();
  const { t } = useT();
  const { reducedMotion, preferences } = usePreferences();
  const { dir } = useLocale();
  const isPhone = !useMediaQuery(BREAKPOINTS.sm);
  const highContrast = preferences.contrast === 'more';
  const running = tour.state.status === 'running' ? tour.state : null;
  const step = tour.currentStep;
  const [rect, setRect] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ width: 1024, height: 768 });
  const [cardSize, setCardSize] = useState({ width: 352, height: 240 });
  const cardRef = useRef<HTMLDivElement>(null);
  const [slowLocate, setSlowLocate] = useState(false);

  const visible =
    !!running && !!step && !running.suspended && !step.inlineSlot && (running.phase === 'shown' || running.phase === 'fallback');
  const modal = visible && (step!.kind === 'EXPLAIN' || running!.phase === 'fallback');
  const highlighted = visible && running!.phase === 'shown' && !!step!.targetId ? tour.target : null;

  // Follow the target every frame while shown (scrolling, sticky headers, resizes, RTL reflow).
  useEffect(() => {
    if (!highlighted) {
      setRect(null);
      return;
    }
    // Bring the target to the middle of the viewport (room for the card above or below it); very tall
    // targets are aligned to the top instead so their start is visible.
    const fits = highlighted.getBoundingClientRect().height < innerHeight * 0.55;
    highlighted.scrollIntoView({ block: fits ? 'center' : 'start', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    let frame = 0;
    let last = '';
    const tick = () => {
      const r = highlighted.getBoundingClientRect();
      const key = `${Math.round(r.top)}|${Math.round(r.left)}|${Math.round(r.width)}|${Math.round(r.height)}|${innerWidth}|${innerHeight}`;
      if (key !== last) {
        last = key;
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        setViewport({ width: innerWidth, height: innerHeight });
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [highlighted, reducedMotion, dir]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    setViewport({ width: innerWidth, height: innerHeight });
    const ro = new ResizeObserver(() => setCardSize({ width: el.offsetWidth, height: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible, step?.id]);

  // Modal steps: the application is inert while the explanation is open (WAI-ARIA modal dialog).
  useEffect(() => {
    if (!modal) return;
    const shell = document.getElementById('app-shell');
    shell?.setAttribute('inert', '');
    return () => shell?.removeAttribute('inert');
  }, [modal]);

  // Inline steps (target inside a host dialog) mark the target instead of drawing a spotlight.
  useEffect(() => {
    if (!running || !step?.inlineSlot || running.phase !== 'shown' || !tour.target) return;
    const el = tour.target;
    el.setAttribute('data-tour-active', '');
    return () => el.removeAttribute('data-tour-active');
  }, [running, step, tour.target]);

  useEffect(() => {
    if (running?.phase !== 'locating') {
      setSlowLocate(false);
      return;
    }
    const id = setTimeout(() => setSlowLocate(true), 500);
    return () => clearTimeout(id);
  }, [running?.phase, running?.index]);

  const placement = placeCard(running?.phase === 'fallback' ? null : rect, cardSize, viewport, dir);
  const edge = sheetEdge(running?.phase === 'fallback' ? null : rect, viewport.height);

  return (
    <div className="relative z-40" data-testid="tour-layer">
      {visible && running && step && (
        <>
          <TourOverlay rect={running.phase === 'fallback' ? null : step.targetId ? rect : null} reducedMotion={reducedMotion} highContrast={highContrast} />
          <TourCard
            ref={cardRef}
            step={step}
            index={running.index}
            total={running.steps.length}
            isPhone={isPhone}
            isFallback={running.phase === 'fallback'}
            modal={modal}
            onBack={tour.back}
            onNext={tour.next}
            onSkip={tour.skip}
            onPause={tour.pause}
            onShowTarget={() => focusTarget(tour.target)}
            className={cn(
              'fixed',
              isPhone ? cn('inset-x-2', edge === 'top' ? 'top-2' : 'bottom-2 pb-[max(1rem,env(safe-area-inset-bottom))]') : 'w-[min(22rem,calc(100vw-1.5rem))]',
            )}
            style={isPhone ? undefined : { top: placement.top, left: placement.left }}
            arrow={
              !isPhone && rect && placement.arrow !== undefined && (placement.side === 'bottom' || placement.side === 'top')
                ? { side: placement.side === 'bottom' ? 'top' : 'bottom', offset: placement.arrow }
                : null
            }
          />
        </>
      )}
      {running && running.phase === 'locating' && slowLocate && !running.suspended && (
        <div role="status" className="fixed bottom-4 start-4 flex items-center gap-3 rounded-card border border-border bg-panel p-3 text-sm shadow-overlay">
          <Spinner className="text-primary" />
          <span>{t('onboarding:controls.lookingForTarget')}</span>
          <Button size="sm" variant="quiet" onPress={tour.skip}>
            {t('onboarding:controls.skip')}
          </Button>
        </div>
      )}
      {!running && tour.state.status === 'idle' && tour.pausedTourId && <PausedReminder tourId={tour.pausedTourId} />}
      <FirstLoginWelcome isOpen={showWelcome} />
      <TourCompletion />
      {offer && <ModuleOffer tour={offer} onDismiss={onDismissOffer} />}
    </div>
  );
}

/** After a pause: a small, non-modal reminder with Resume (the tour continues from the same step). */
function PausedReminder({ tourId }: { tourId: string }) {
  const { t } = useT();
  const { start, progressFor, resolvedSteps, hidePausedReminder } = useGuidedTour();
  const steps = resolvedSteps(tourId);
  const last = progressFor(tourId)?.lastStepId;
  const index = steps.findIndex((s) => s.id === last);
  return (
    <section
      aria-label={t('onboarding:controls.pausedChipNoStep')}
      data-testid="tour-paused"
      className="fixed bottom-4 start-4 flex max-w-[calc(100vw-2rem)] animate-pop-in items-center gap-2 rounded-pill border border-border bg-panel py-1.5 ps-3 pe-1.5 text-sm text-text shadow-overlay max-md:bottom-[calc(var(--bottom-nav-height)+1.75rem)]"
    >
      <Compass aria-hidden className="size-4 shrink-0 text-primary" />
      <span className="truncate">
        {index >= 0 ? t('onboarding:controls.pausedChip', { current: index + 1, total: steps.length }) : t('onboarding:controls.pausedChipNoStep')}
      </span>
      <Button size="sm" variant="primary" icon={Play} onPress={() => start(tourId, { resume: true })} className="rounded-pill" data-testid="tour-resume">
        {t('onboarding:controls.resumeShort')}
      </Button>
      <IconButton label={t('onboarding:controls.dismissPaused')} icon={X} onPress={hidePausedReminder} className="size-9" />
    </section>
  );
}

/** Non-modal, non-blocking first-use offer for a module (doc 09 §2B). */
function ModuleOffer({ tour, onDismiss }: { tour: TourDefinition; onDismiss: () => void }) {
  const { t } = useT();
  const { start, resolvedSteps } = useGuidedTour();
  const announce = useAnnounce();
  const moduleName = t(`onboarding:modules.${tour.moduleId}` as 'onboarding:modules.lab');
  const count = resolvedSteps(tour.id).length;
  useEffect(() => {
    announce(`${t('onboarding:moduleOffer.title')} ${t('onboarding:moduleOffer.body', { count, module: moduleName })}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id]);
  return (
    <section
      aria-labelledby="module-offer-title"
      data-testid="module-offer"
      className="fixed bottom-4 start-4 w-[min(22rem,calc(100vw-2rem))] rounded-card border border-border bg-panel p-4 shadow-overlay max-md:bottom-[calc(var(--bottom-nav-height)+1rem)]"
    >
      <h2 id="module-offer-title" className="text-sm font-semibold text-text">
        {t('onboarding:moduleOffer.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('onboarding:moduleOffer.body', { count, module: moduleName })}</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="primary" onPress={() => start(tour.id)}>
          {t('onboarding:moduleOffer.start')}
        </Button>
        <Button size="sm" variant="secondary" onPress={onDismiss}>
          {t('onboarding:moduleOffer.notNow')}
        </Button>
      </div>
    </section>
  );
}

/** Renders the current step inside a host dialog when its target lives in that dialog. */
export function TourInlineSlot({ slot }: { slot: string }) {
  const tour = useGuidedTour();
  const isPhone = !useMediaQuery(BREAKPOINTS.sm);
  const running = tour.state.status === 'running' ? tour.state : null;
  const step = tour.currentStep;
  if (!running || !step || step.inlineSlot !== slot || running.phase === 'locating' || running.suspended) return null;
  return (
    <TourCard
      inline
      step={step}
      index={running.index}
      total={running.steps.length}
      isPhone={isPhone}
      isFallback={running.phase === 'fallback'}
      modal={false}
      onBack={tour.back}
      onNext={tour.next}
      onSkip={tour.skip}
      onPause={tour.pause}
      onShowTarget={() => focusTarget(tour.target)}
      className="mb-4"
    />
  );
}
