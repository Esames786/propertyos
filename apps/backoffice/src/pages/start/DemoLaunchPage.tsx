import { useNavigation, useQueryParam, useReducedMotion, useSession } from '@repo/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { LINKS } from '../../nav.config';
import { PreparingStep } from './demo/PreparingStep';
import { ReadyStep } from './demo/ReadyStep';
import { RoleStep } from './demo/RoleStep';
import { EntryFrame } from './EntryFrame';
import { entryHref, isDemoRole, useSafeNext, type DemoRole } from './entry';

type Step = 'role' | 'preparing' | 'ready';
const parseStep = (v: string | null): Step => (v === 'preparing' || v === 'ready' ? v : 'role');

/**
 * Explore a live demo (Stage 1.5R, entry B): role → preparing → ready, with the step in the URL
 * (`?step=`). Preparation does the real sign-in and data loading; "ready" asks whether to take the
 * guided tour. Opening a later step without the identity it needs returns to the role choice.
 */
export default function DemoLaunchPage() {
  const { persona } = useSession();
  const { navigate } = useNavigation();
  const [stepParam] = useQueryParam('step');
  const [roleParam] = useQueryParam('role');
  const [freshParam] = useQueryParam('fresh');
  const next = useSafeNext();
  const reduced = useReducedMotion();

  const step = parseStep(stepParam);
  const role: DemoRole | null = isDemoRole(roleParam) ? roleParam : null;
  const readyRole: DemoRole | null = isDemoRole(persona?.id) ? persona.id : null;

  const href = (s: Step, extra: Record<string, string | null> = {}) => entryHref(LINKS.demoLaunch, { step: s === 'role' ? null : s, ...extra, next });
  const toRole = () => navigate(href('role'), { replace: true });

  // Guards: "preparing" needs a role; "ready" needs a signed-in demo identity.
  const misplaced = (step === 'preparing' && !role) || (step === 'ready' && !readyRole);
  useEffect(() => {
    if (misplaced) navigate(href('role'), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check only when the decision changes
  }, [misplaced]);

  // Focus moves to the new step's heading on step changes, not on the first render.
  const [firstStep] = useState(step);
  const [moved, setMoved] = useState(false);
  if (step !== firstStep && !moved) setMoved(true);
  const autoFocus = moved || step !== firstStep;

  const forward = step !== 'role';
  return (
    <EntryFrame brandHref={entryHref(LINKS.getStarted, { next })} testId="demo-launch">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={misplaced ? 'redirect' : step}
          initial={reduced ? false : { opacity: 0, y: forward ? 14 : -14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -10, transition: { duration: 0.16 } }}
          transition={{ type: 'spring', bounce: 0.12, duration: 0.5 }}
        >
          {misplaced ? null : step === 'role' ? (
            <RoleStep
              next={next}
              autoFocus={autoFocus}
              onContinue={(r, fresh) => navigate(href('preparing', { role: r, fresh: fresh ? '1' : null }))}
            />
          ) : step === 'preparing' ? (
            <PreparingStep
              role={role!}
              fresh={freshParam === '1'}
              autoFocus={autoFocus}
              onReady={() => navigate(href('ready'), { replace: true })}
              onChooseAnother={toRole}
            />
          ) : (
            <ReadyStep role={readyRole!} next={next} autoFocus={autoFocus} onSwitchRole={() => navigate(href('role'))} />
          )}
        </motion.div>
      </AnimatePresence>
    </EntryFrame>
  );
}
