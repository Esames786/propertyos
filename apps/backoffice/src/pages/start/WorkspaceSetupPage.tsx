import type { WorkspaceProfile } from '@repo/contracts';
import { directionOf, useLocale } from '@repo/i18n';
import { useAnnounce, useApiQuery, useNavigation, useQueryParam, useReducedMotion, useSession, useT } from '@repo/ui';
import { useGuidedTour } from '@repo/ui/onboarding';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { LINKS } from '../../nav.config';
import { EntryBackLink, EntryFrame } from './EntryFrame';
import { entryHref, useSafeNext } from './entry';
import { AccountStep, type AccountValues } from './setup/AccountStep';
import { SimulationNote, Stepper } from './setup/chrome';
import { DoneStep } from './setup/DoneStep';
import {
  clearDraft,
  DRAFT_KEY,
  firstOpenStep,
  isStepComplete,
  loadDraft,
  saveDraft,
  SETUP_STEPS,
  stepIndex,
  type SetupDraft,
  type SetupSecrets,
  type SetupStep,
  type WizardScreen,
} from './setup/draft';
import { OrganisationStep } from './setup/OrganisationStep';
import { ProjectStep } from './setup/ProjectStep';
import { ReviewStep } from './setup/ReviewStep';
import { TeamStep } from './setup/TeamStep';
import { VerifyStep } from './setup/VerifyStep';

const parseScreen = (v: string | null): WizardScreen => (v === 'done' || SETUP_STEPS.includes(v as SetupStep) ? (v as WizardScreen) : 'account');

const NO_SECRETS: SetupSecrets = { password: '', confirm: '' };

const slide: Variants = {
  enter: (d: number) => ({ opacity: 0, x: 28 * d }),
  center: { opacity: 1, x: 0 },
  exit: (d: number) => ({ opacity: 0, x: -20 * d, transition: { duration: 0.14 } }),
};

/**
 * Set up my developer workspace (Stage 1.5R, entry C): a validated wizard that is a simulation from
 * start to finish. Account → verify (code shown on screen) → organisation → first project (skip) →
 * team (skip) → review → done. The step is in the URL; the draft lives here, above the steps, and is
 * mirrored to sessionStorage without the password. Nothing is provisioned and nothing is sent.
 */
export default function WorkspaceSetupPage() {
  const { t } = useT();
  const { locale } = useLocale();
  const { navigate } = useNavigation();
  const [stepParam] = useQueryParam('step');
  const next = useSafeNext();
  const reduced = useReducedMotion();
  const announce = useAnnounce();
  const { persona, signIn } = useSession();
  const tour = useGuidedTour();

  const [restored] = useState(() => {
    try {
      return globalThis.sessionStorage?.getItem(DRAFT_KEY) !== null;
    } catch {
      return false;
    }
  });
  const [draft, setDraft] = useState<SetupDraft>(() => loadDraft(locale));
  const [secrets, setSecrets] = useState<SetupSecrets>(NO_SECRETS);
  const [returning, setReturning] = useState(false);
  const [submitted, setSubmitted] = useState<WorkspaceProfile | null>(null);
  const [launching, setLaunching] = useState(false);

  const getStartedHref = entryHref(LINKS.getStarted, { next });
  const go = (screen: WizardScreen, replace = false) =>
    navigate(entryHref(LINKS.workspaceSetup, { step: screen === 'account' ? null : screen, next }), { replace });

  // Mirror the draft (never the password) until the simulated submit clears it.
  useEffect(() => {
    if (!submitted) saveDraft(draft);
  }, [draft, submitted]);

  const announceRestored = useEffectEvent(() => announce(t('start:setup.draftRestored')));
  useEffect(() => {
    if (restored) announceRestored();
  }, [restored]);

  // Which screen may be shown: any step up to the first unfinished one; "done" needs a recorded setup.
  const requested = parseScreen(stepParam);
  const open = firstOpenStep(draft);
  const stored = useApiQuery<WorkspaceProfile | null>(requested === 'done' && !submitted ? { method: 'GET', path: '/workspace' } : null);
  const profile = submitted ?? stored.data ?? null;
  const screen: WizardScreen | null =
    requested === 'done' ? (profile ? 'done' : stored.isFetching ? null : open) : stepIndex(requested) <= stepIndex(open) ? requested : open;

  useEffect(() => {
    if (screen !== null && screen !== requested) go(screen, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the allowed screen differs from the address
  }, [screen, requested]);

  // Step changes: focus goes to the new heading (not on first load) and the slide follows the direction.
  const shown = screen ?? 'account';
  const [firstScreen] = useState(shown);
  const [moved, setMoved] = useState(false);
  if (shown !== firstScreen && !moved) setMoved(true);
  const autoFocus = moved || shown !== firstScreen;
  const [previous, setPrevious] = useState(shown);
  const [direction, setDirection] = useState(1);
  if (previous !== shown) {
    setPrevious(shown);
    setDirection(stepIndex(shown) >= stepIndex(previous) ? 1 : -1);
  }
  const slideDir = direction * (directionOf(locale) === 'rtl' ? -1 : 1);

  /** Where to go after finishing a step: the next one, or straight back to the review when editing. */
  const proceed = (from: SetupStep, d: SetupDraft) => {
    if (returning && firstOpenStep(d) === 'review') {
      setReturning(false);
      go('review');
      return;
    }
    let to = SETUP_STEPS[stepIndex(from) + 1] ?? 'review';
    if (to === 'verify' && isStepComplete('verify', d)) to = 'organisation';
    if (to === 'review') setReturning(false);
    go(to);
  };
  const back = (from: SetupStep) => {
    if (from === 'account') {
      navigate(getStartedHref);
      return;
    }
    let to = SETUP_STEPS[stepIndex(from) - 1]!;
    if (to === 'verify' && isStepComplete('verify', draft)) to = 'account';
    go(to);
  };
  const update = (patch: Partial<SetupDraft>) => setDraft((d) => ({ ...d, ...patch }));

  // "Open the demo workspace": sign in as the demo manager, then start the essentials tour once the
  // session (and the tour provider's own identity-change handling) has settled.
  const launched = useRef(false);
  const launchTour = useEffectEvent(() => {
    if (launched.current) return;
    launched.current = true;
    const available = !!tour.welcomeTourId && tour.available.some((d) => d.id === tour.welcomeTourId);
    tour.decideWelcome('accepted', true);
    if (!available) navigate(LINKS.start);
  });
  useEffect(() => {
    if (!launching || persona?.id !== 'manager' || !tour.profile) return;
    const timer = setTimeout(() => launchTour(), 0);
    return () => clearTimeout(timer);
  }, [launching, persona?.id, tour.profile]);

  const motionProps = {
    custom: slideDir,
    variants: slide,
    initial: reduced ? false : ('enter' as const),
    animate: 'center' as const,
    exit: reduced ? { opacity: 1, transition: { duration: 0 } } : ('exit' as const),
    transition: { type: 'spring' as const, bounce: 0.1, duration: 0.45 },
  };

  if (screen === 'done' && profile) {
    return (
      <EntryFrame brandHref={getStartedHref} testId="workspace-setup">
        <motion.div key="done" {...motionProps}>
          <DoneStep
            profile={profile}
            autoFocus={autoFocus}
            launching={launching}
            getStartedHref={getStartedHref}
            onOpenDemo={() => {
              setLaunching(true);
              signIn('manager');
            }}
          />
        </motion.div>
      </EntryFrame>
    );
  }

  const step = screen === null || screen === 'done' ? null : screen;
  return (
    <EntryFrame brandHref={getStartedHref} testId="workspace-setup">
      <div className="mx-auto max-w-6xl pt-1 sm:pt-4">
        <EntryBackLink href={getStartedHref} testId="setup-back-link">
          {t('start:frame.backToStart')}
        </EntryBackLink>
        <div className="mt-4 grid items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
          <div className="min-w-0 space-y-4 lg:sticky lg:top-6">
            {step && (
              <Stepper
                current={step}
                draft={draft}
                onGo={(s) => {
                  setReturning(false);
                  go(s);
                }}
              />
            )}
            <SimulationNote className="max-lg:hidden" />
          </div>
          <div className="min-w-0">
            <SimulationNote className="mb-5 lg:hidden" />
            <AnimatePresence mode="wait" initial={false} custom={slideDir}>
              <motion.div key={step ?? 'loading'} {...motionProps}>
                {step === 'account' && (
                  <AccountStep
                    draft={draft}
                    secrets={secrets}
                    autoFocus={autoFocus}
                    returning={returning}
                    onChange={(account, s) => {
                      update({ account });
                      setSecrets(s);
                    }}
                    onDone={(v: AccountValues) => {
                      const d: SetupDraft = { ...draft, account: { fullName: v.fullName, email: v.email, phone: v.phone }, accountDone: true };
                      setDraft(d);
                      setSecrets({ password: v.password, confirm: v.confirm });
                      proceed('account', d);
                    }}
                    onBack={() => back('account')}
                  />
                )}
                {step === 'verify' && (
                  <VerifyStep
                    draft={draft}
                    autoFocus={autoFocus}
                    returning={returning}
                    onVerified={() => {
                      const d: SetupDraft = { ...draft, verifiedEmail: draft.account.email };
                      setDraft(d);
                      proceed('verify', d);
                    }}
                    onChangeEmail={() => go('account')}
                  />
                )}
                {step === 'organisation' && (
                  <OrganisationStep
                    draft={draft}
                    autoFocus={autoFocus}
                    returning={returning}
                    onChange={(organisation) => update({ organisation })}
                    onDone={() => {
                      const d: SetupDraft = { ...draft, organisationDone: true };
                      setDraft(d);
                      proceed('organisation', d);
                    }}
                    onBack={() => back('organisation')}
                  />
                )}
                {step === 'project' && (
                  <ProjectStep
                    draft={draft}
                    autoFocus={autoFocus}
                    returning={returning}
                    onChange={(project) => update({ project })}
                    onDone={() => {
                      const d: SetupDraft = { ...draft, projectState: 'done' };
                      setDraft(d);
                      proceed('project', d);
                    }}
                    onSkip={() => {
                      const d: SetupDraft = { ...draft, projectState: 'skipped' };
                      setDraft(d);
                      announce(t('start:setup.project.skipped'));
                      proceed('project', d);
                    }}
                    onBack={() => back('project')}
                  />
                )}
                {step === 'team' && (
                  <TeamStep
                    draft={draft}
                    autoFocus={autoFocus}
                    returning={returning}
                    onChange={(invites) => update({ invites })}
                    onDone={() => {
                      const d: SetupDraft = { ...draft, teamState: 'done' };
                      setDraft(d);
                      proceed('team', d);
                    }}
                    onSkip={() => {
                      const d: SetupDraft = { ...draft, teamState: 'skipped' };
                      setDraft(d);
                      announce(t('start:setup.team.skipped'));
                      proceed('team', d);
                    }}
                    onBack={() => back('team')}
                  />
                )}
                {step === 'review' && (
                  <ReviewStep
                    draft={draft}
                    autoFocus={autoFocus}
                    onEdit={(s) => {
                      setReturning(true);
                      go(s);
                    }}
                    onBack={() => back('review')}
                    onSubmitted={(p) => {
                      clearDraft();
                      setSubmitted(p);
                      setSecrets(NO_SECRETS);
                      announce(t('start:setup.done.announce'));
                      go('done', true);
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </EntryFrame>
  );
}
