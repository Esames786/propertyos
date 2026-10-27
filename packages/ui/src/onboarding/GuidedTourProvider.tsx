import type { OnboardingProfile, TourProgressRecord } from '@repo/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { useIsTabletUp } from '../lib/useMediaQuery';
import { useT } from '../lib/useT';
import { useNavigation } from '../navigation/RouterAdapter';
import { useSession } from '../permissions/SessionProvider';
import { usePreferences } from '../preferences/PreferencesProvider';
import { waitForAnchor } from './TourAnchor';
import { LocalTourProgressStore, type TourProgressStore, type TourScope } from './TourProgressStore';
import { TourLayer } from './TourLayer';
import { resolveSteps, tourForModule, toursForPersona } from './TourRegistry';
import { useTraining } from './TrainingProvider';
import { IDLE, tourReducer, type TourMachineState } from './tourMachine';
import { TOUR_EVENT, useIsTourBusy } from './tourGuard';
import { TOUR_FIND_TIMEOUT_MS, type TourDefinition, type TourStep } from './tourTypes';

export interface GuidedTourContextValue {
  state: TourMachineState;
  currentStep: TourStep | null;
  available: TourDefinition[];
  profile: OnboardingProfile | null;
  target: HTMLElement | null;
  start: (tourId: string, options?: { resume?: boolean }) => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  pause: () => void;
  dismissCompletion: () => void;
  progressFor: (tourId: string) => TourProgressRecord | null;
  markCompleted: (tourId: string) => void;
  resolvedSteps: (tourId: string) => TourStep[];
  setAutoOffer: (value: boolean) => void;
  resetProgress: () => void;
  decideWelcome: (decision: 'accepted' | 'declined', autoOffer: boolean) => void;
  setModule: (moduleId: string | null) => void;
  links: TourLinks;
  /** The essentials tour for the signed-in persona (what Help → Take a tour starts). */
  welcomeTourId: string | undefined;
  /** A tour paused in this session (offered back with a Resume chip until resumed or hidden). */
  pausedTourId: string | null;
  hidePausedReminder: () => void;
}

export interface TourLinks {
  start: string;
  help: string;
  library: string;
  practice: string;
  textGuide: (tourId: string) => string;
}

const GuidedTourContext = createContext<GuidedTourContextValue | null>(null);

/**
 * Guided onboarding runtime (doc 09, ADR-0002). Owns tour state, persistence per
 * tenant + persona + app + tour version, the first-login welcome and module offers.
 * State lives here (not in the overlay), so language changes, breakpoint changes and route
 * navigation do not lose the current step.
 */
export function GuidedTourProvider({
  tours,
  welcomeTourId: welcomeTourFor,
  suppressWelcome = false,
  links,
  store: injectedStore,
  children,
}: {
  tours: readonly TourDefinition[];
  /** The tour offered on first login: one id, or chosen per persona (role-specific essentials). */
  welcomeTourId?: string | ((personaId: string) => string | undefined);
  /** Hide the first-login dialog (e.g. on the Get started flow, which asks the same question itself). */
  suppressWelcome?: boolean;
  links: TourLinks;
  store?: TourProgressStore;
  children: ReactNode;
}) {
  const session = useSession();
  const { preferences } = usePreferences();
  const { navigate, location } = useNavigation();
  const announce = useAnnounce();
  const training = useTraining();
  const { t } = useT();
  const isTablet = useIsTabletUp();
  const busy = useIsTourBusy();

  const [store] = useState<TourProgressStore>(() => injectedStore ?? new LocalTourProgressStore());
  const [state, dispatch] = useReducer(tourReducer, IDLE);
  const [revision, bump] = useReducer((n: number) => n + 1, 0);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [module, setModule] = useState<string | null>(null);
  const [offer, setOffer] = useState<TourDefinition | null>(null);
  const [pausedTourId, setPausedTourId] = useState<string | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const persona = session.persona;
  const welcomeTourId = persona ? (typeof welcomeTourFor === 'function' ? welcomeTourFor(persona.id) : welcomeTourFor) : undefined;
  const scope: TourScope | null = useMemo(
    () => (persona ? { tenantId: session.tenant.id, personaId: persona.id, app: session.app } : null),
    [persona, session.tenant.id, session.app],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `revision` re-reads the store after writes
  const profile = useMemo(() => (scope ? store.getProfile(scope) : null), [scope, store, revision]);
  const available = useMemo(() => toursForPersona(tours, persona), [tours, persona]);
  const running = state.status === 'running' ? state : null;
  const currentStep = running ? (running.steps[running.index] ?? null) : null;
  const def = (id: string) => available.find((d) => d.id === id);

  const save = useCallback(
    (tour: TourDefinition, patch: Partial<TourProgressRecord>) => {
      if (!scope) return;
      const prior = store.getProgress(scope, tour.id, tour.version);
      store.saveProgress({
        ...scope,
        tourId: tour.id,
        tourVersion: tour.version,
        status: 'in_progress',
        lastStepId: null,
        startedAt: null,
        completedAt: null,
        dismissedAt: null,
        updatedAt: new Date().toISOString(),
        ...prior,
        ...patch,
      });
      bump();
    },
    [scope, store],
  );

  /**
   * Return focus where the user was, or to the page heading if that element is gone (e.g. the
   * welcome dialog). Runs after React has committed and removed `inert` from the application.
   */
  const restoreFocus = () => {
    const el = returnFocus.current;
    setTimeout(() => {
      if (el && el.isConnected && !el.closest('[inert]')) {
        el.focus();
        return;
      }
      const heading = document.querySelector<HTMLElement>('main h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    }, 0);
  };

  const start = useCallback(
    (tourId: string, options: { resume?: boolean } = {}) => {
      const tour = def(tourId);
      if (!tour || !scope) return;
      if (preferences.textOnlyGuide) {
        navigate(links.textGuide(tourId));
        return;
      }
      const steps = resolveSteps(tour, session.can);
      const prior = store.getProgress(scope, tour.id, tour.version);
      const resumeIndex = options.resume && prior?.lastStepId ? steps.findIndex((s) => s.id === prior.lastStepId) : 0;
      const index = Math.max(0, resumeIndex);
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOffer(null);
      setPausedTourId(null);
      if (tour.practice) training.start();
      dispatch({ type: 'START', tourId, steps, index });
      save(tour, { status: 'in_progress', lastStepId: steps[index]?.id ?? null, startedAt: prior?.startedAt ?? new Date().toISOString(), dismissedAt: null });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [available, scope, preferences.textOnlyGuide, session.can, store, save, navigate, links, training],
  );

  // Persist the current step so a tour can be resumed from Help after a pause or reload.
  useEffect(() => {
    if (!running) return;
    const tour = def(running.tourId);
    const step = running.steps[running.index];
    if (tour && step) save(tour, { status: 'in_progress', lastStepId: step.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running?.tourId, running?.index]);

  // Completion: record the exact tour version as complete (acceptance 7).
  const completedId = state.status === 'completed' ? state.tourId : null;
  useEffect(() => {
    if (!completedId) return;
    const tour = def(completedId);
    if (tour) {
      save(tour, { status: 'completed', completedAt: new Date().toISOString() });
      if (tour.practice) void training.end();
    }
    setTarget(null);
    announce(t('onboarding:controls.completedAnnouncement'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedId]);

  const endRun = (status: 'dismissed' | 'paused') => {
    if (!running) return;
    const tour = def(running.tourId);
    if (tour) {
      save(tour, status === 'dismissed' ? { status, dismissedAt: new Date().toISOString() } : { status });
      if (tour.practice) void training.end();
    }
    dispatch({ type: status === 'dismissed' ? 'SKIP' : 'PAUSE' });
    setPausedTourId(status === 'paused' ? running.tourId : null);
    setTarget(null);
    if (status === 'paused') announce(t('onboarding:controls.paused'));
    restoreFocus();
  };

  // Navigate to the step's route first, if it has one.
  useEffect(() => {
    if (currentStep?.route && location.pathname !== currentStep.route) navigate(currentStep.route);
  }, [currentStep, location.pathname, navigate]);

  // Locate the anchor (desktop or phone variant), waiting for it to render; never highlight a ghost.
  useEffect(() => {
    if (!running || running.phase !== 'locating' || running.suspended || !currentStep) return;
    if (currentStep.route && location.pathname !== currentStep.route) return;
    const id = (!isTablet && currentStep.mobileTargetId) || currentStep.targetId;
    if (!id) return;
    const controller = new AbortController();
    void waitForAnchor(id, TOUR_FIND_TIMEOUT_MS, controller.signal).then((el) => {
      if (controller.signal.aborted) return;
      setTarget(el);
      dispatch({ type: el ? 'TARGET_FOUND' : 'TARGET_MISSING' });
    });
    return () => controller.abort();
  }, [running, currentStep, isTablet, location.pathname]);

  // Breakpoint or route changes mid-step: find the anchor again (sidebar ↔ phone menu).
  const relocateKey = `${isTablet}:${location.pathname}`;
  const lastRelocate = useRef(relocateKey);
  useEffect(() => {
    if (lastRelocate.current === relocateKey) return;
    lastRelocate.current = relocateKey;
    if (running) dispatch({ type: 'RELOCATE' });
  }, [relocateKey, running]);

  // Completion / suspend events emitted by app code.
  useEffect(() => {
    const onEvent = (e: Event) => dispatch({ type: 'EXTERNAL_EVENT', name: String((e as CustomEvent).detail) });
    window.addEventListener(TOUR_EVENT, onEvent);
    return () => window.removeEventListener(TOUR_EVENT, onEvent);
  }, []);

  // Ending a session (sign-out or identity switch) ends any running tour without recording it.
  useEffect(() => {
    dispatch({ type: 'PAUSE' });
    setTarget(null);
    setPausedTourId(null);
  }, [persona?.id]);

  // Module first-use offer (doc 09 §2B): once per module, only after the welcome was answered.
  useEffect(() => {
    if (!module || !scope || !profile || state.status !== 'idle' || busy) return;
    if (profile.welcomeDecision === 'pending' || !profile.autoOffer || profile.seenModules.includes(module)) return;
    const tour = tourForModule(available, module);
    if (!tour) return;
    const progress = store.getProgress(scope, tour.id, tour.version);
    store.saveProfile({ ...profile, seenModules: [...profile.seenModules, module] });
    bump();
    if (progress?.status === 'completed') return;
    setOffer(tour);
  }, [module, scope, profile, state.status, busy, available, store]);

  const value: GuidedTourContextValue = {
    state,
    currentStep,
    available,
    profile,
    target,
    start,
    next: () => dispatch({ type: 'NEXT' }),
    back: () => dispatch({ type: 'BACK' }),
    skip: () => endRun('dismissed'),
    pause: () => endRun('paused'),
    dismissCompletion: () => {
      dispatch({ type: 'DISMISS_COMPLETION' });
      restoreFocus();
    },
    progressFor: (tourId) => {
      const tour = def(tourId);
      return tour && scope ? store.getProgress(scope, tour.id, tour.version) : null;
    },
    markCompleted: (tourId) => {
      const tour = def(tourId);
      if (tour) save(tour, { status: 'completed', completedAt: new Date().toISOString() });
    },
    resolvedSteps: (tourId) => {
      const tour = def(tourId);
      return tour ? resolveSteps(tour, session.can) : [];
    },
    setAutoOffer: (autoOffer) => {
      if (!profile) return;
      store.saveProfile({ ...profile, autoOffer });
      bump();
    },
    resetProgress: () => {
      if (!scope) return;
      store.reset(scope);
      bump();
    },
    decideWelcome: (decision, autoOffer) => {
      if (!profile) return;
      // The page where the welcome was answered counts as seen: no second offer straight after "Explore on my own".
      const seenModules = module && !profile.seenModules.includes(module) ? [...profile.seenModules, module] : profile.seenModules;
      store.saveProfile({ ...profile, welcomeDecision: decision, autoOffer, seenModules });
      bump();
      if (decision === 'accepted' && welcomeTourId) start(welcomeTourId);
    },
    setModule,
    links,
    welcomeTourId,
    pausedTourId,
    hidePausedReminder: () => setPausedTourId(null),
  };

  const showWelcome =
    !suppressWelcome &&
    !!persona &&
    !!profile &&
    profile.welcomeDecision === 'pending' &&
    state.status === 'idle' &&
    !busy &&
    !!welcomeTourId &&
    !!def(welcomeTourId);

  return (
    <GuidedTourContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <TourLayer showWelcome={showWelcome} offer={offer} onDismissOffer={() => setOffer(null)} />,
          document.body,
        )}
    </GuidedTourContext.Provider>
  );
}

export function useGuidedTour(): GuidedTourContextValue {
  const ctx = useContext(GuidedTourContext);
  if (!ctx) throw new Error('useGuidedTour must be used inside <GuidedTourProvider>');
  return ctx;
}

/** Pages declare their module so a first-use tour can be offered (doc 09 §2B). */
export function useTourModule(moduleId: string) {
  const ctx = useContext(GuidedTourContext);
  useEffect(() => {
    ctx?.setModule(moduleId);
    return () => ctx?.setModule(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);
}
