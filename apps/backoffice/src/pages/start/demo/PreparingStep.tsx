import type { ApiRequest } from '@repo/contracts';
import { Button, cn, InlineAlert, Spinner, useAnnounce, useApiMutation, useApiPrefetch, useReducedMotion, useSession, useT } from '@repo/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, CircleDashed, Hourglass } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { MonogramTile } from '../EntryFrame';
import { demoOf, focusHeading, type DemoRole, type SocietyStart } from '../entry';

type TaskId = 'identity' | 'reset' | 'society' | 'dashboard' | 'projects' | 'notifications' | 'pipeline' | 'overview';
type TaskState = 'pending' | 'loading' | 'done' | 'error';
interface Task {
  id: TaskId;
  request?: ApiRequest;
}

/** Brief hold after the last tick so it can be seen (full motion only; never a timer standing in for work). */
const SETTLE_MS = 450;

/**
 * Demo step 2: real preparation, not a timer. Signs in as the chosen role, optionally clears this
 * tab's earlier demo changes, then warms the first screens' data through the transport. Each line
 * ticks when its request has actually resolved; a failure stops with a retry.
 */
export function PreparingStep({
  role,
  fresh,
  start,
  autoFocus,
  onReady,
  onChooseAnother,
}: {
  role: DemoRole;
  fresh: boolean;
  /** Where the society demo starts (ignored for the developer demo). */
  start: SocietyStart;
  autoFocus: boolean;
  onReady: () => void;
  onChooseAnother: () => void;
}) {
  const { t } = useT();
  const { persona, personas, signIn, projectId } = useSession();
  const prefetch = useApiPrefetch();
  const queryClient = useQueryClient();
  const reset = useApiMutation();
  const announce = useAnnounce();
  const reduced = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [states, setStates] = useState<Partial<Record<TaskId, TaskState>>>({});
  const resetDone = useRef(false);

  const target = personas.find((p) => p.id === role);
  const name = target?.displayName ?? '';
  const seesLeads = target?.permissions.includes('lead.view') ?? false;
  const society = demoOf(role) === 'society';
  const seesSociety = target?.permissions.some((p) => p === 'site.view' || p === 'billing_run.view') ?? false;

  // A society demo always starts from a known point: collections open (November billed), set up
  // and ready to bill, or before setup. Only this organisation's demo changes are reset.
  const tasks = useMemo<Task[]>(
    () =>
      society
        ? [
            { id: 'identity' },
            { id: 'society' },
            ...(seesSociety ? [{ id: 'dashboard' as const, request: { method: 'GET', path: '/society/dashboard' } as const }] : []),
            { id: 'notifications', request: { method: 'GET', path: '/notifications' } },
          ]
        : [
            { id: 'identity' },
            ...(fresh ? [{ id: 'reset' as const }] : []),
            { id: 'dashboard', request: { method: 'GET', path: '/dashboard/summary', query: { range: '6m' } } },
            { id: 'projects', request: { method: 'GET', path: '/projects' } },
            { id: 'notifications', request: { method: 'GET', path: '/notifications' } },
            ...(seesLeads ? [{ id: 'pipeline' as const, request: { method: 'GET', path: '/crm/summary' } as const }] : []),
            { id: 'overview', request: { method: 'GET', path: '/demo/overview' } },
          ],
    [fresh, seesLeads, society, seesSociety],
  );

  useEffect(() => {
    if (autoFocus) focusHeading(heading.current);
  }, [autoFocus]);

  // 1. Sign in as the chosen role (also after a reload of this address with another identity).
  const ensureSignedIn = useEffectEvent(() => {
    if (persona?.id !== role) signIn(role);
  });
  useEffect(() => ensureSignedIn(), [role]);

  // 2. Once the session really is that role, do the work. The transport reads the session on
  // render, so requests made earlier would run as the previous identity.
  const run = useEffectEvent(async (cancelled: () => boolean) => {
    const mark = (id: TaskId, state: TaskState) => {
      if (!cancelled()) setStates((prev) => ({ ...prev, [id]: state }));
    };
    mark('identity', 'done');
    if (attempt === 0) announce(t('start:demo.preparing.announceStart', { name }));

    if (society && !resetDone.current) {
      mark('society', 'loading');
      try {
        await reset.mutateAsync({ method: 'POST', path: '/society/demo', body: { mode: start } });
        resetDone.current = true;
        mark('society', 'done');
      } catch {
        mark('society', 'error');
        if (!cancelled()) announce(t('start:demo.preparing.failed'), 'assertive');
        return;
      }
    }

    if (!society && fresh && !resetDone.current) {
      mark('reset', 'loading');
      try {
        await reset.mutateAsync({ method: 'POST', path: '/demo/reset' });
        resetDone.current = true;
        mark('reset', 'done');
      } catch {
        mark('reset', 'error');
        if (!cancelled()) announce(t('start:demo.preparing.failed'), 'assertive');
        return;
      }
    }

    const results = await Promise.all(
      tasks
        .filter((task) => task.request)
        .map(async (task) => {
          const request = task.request!;
          mark(task.id, 'loading');
          await prefetch(request, role);
          // Same cache key as useApiPrefetch / useApiQuery: prefetching never throws, so read the outcome.
          const failed = queryClient.getQueryState(['api', role, projectId, request.path, request.query, false])?.status === 'error';
          mark(task.id, failed ? 'error' : 'done');
          if (!failed && !cancelled()) announce(t(`start:demo.preparing.tasks.${task.id}.done`, { name }));
          return !failed;
        }),
    );
    if (cancelled()) return;
    if (!results.every(Boolean)) {
      announce(t('start:demo.preparing.failed'), 'assertive');
      return;
    }
    announce(t('start:demo.preparing.announceReady'));
    if (reduced) onReady();
    else setTimeout(() => !cancelled() && onReady(), SETTLE_MS);
  });

  useEffect(() => {
    if (persona?.id !== role) return;
    let cancelled = false;
    // Deferred one tick: right after an identity change the transport drops inactive cached
    // queries in its own effect (which runs after this one), and would discard fresh prefetches.
    const timer = setTimeout(() => void run(() => cancelled), 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [persona?.id, role, attempt]);

  const stateOf = (id: TaskId): TaskState => states[id] ?? (id === 'identity' && persona?.id === role ? 'done' : 'pending');
  const failed = tasks.some((task) => states[task.id] === 'error');
  const doneCount = tasks.filter((task) => stateOf(task.id) === 'done').length;

  const retry = () => {
    setStates((prev) => Object.fromEntries(Object.entries(prev).filter(([, s]) => s !== 'error')));
    setAttempt((n) => n + 1);
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center pt-6 text-center sm:pt-12" data-testid="demo-preparing-step">
      <BrandSpinner active={!failed && doneCount < tasks.length} />
      <h1 id="page-title" ref={heading} tabIndex={-1} className="mt-6 font-display text-figure leading-tight text-text outline-none sm:text-figure-lg [:lang(ur)_&]:leading-[1.75] [:lang(ur)_&]:pt-1">
        {t('start:demo.preparing.heading')}
      </h1>
      <p className="mt-3 text-base text-muted">
        {t('start:demo.preparing.intro', { name, role: t(`common:persona.${role}`) })}
      </p>

      <div className="mt-8 w-full rounded-card border border-border bg-panel p-2 text-start shadow-raised sm:p-3">
        <div className="flex items-center justify-between gap-3 px-3 pt-2 pb-3">
          <p className="text-sm font-semibold text-text">{t('start:demo.preparing.listTitle')}</p>
          <p className="text-sm text-muted tabular" data-testid="demo-progress">
            {t('start:demo.preparing.progress', { done: doneCount, total: tasks.length })}
          </p>
        </div>
        <ol aria-label={t('start:demo.preparing.listTitle')} className="divide-y divide-border border-t border-border" data-testid="demo-checklist">
          {tasks.map((task) => {
            const state = stateOf(task.id);
            const label = t(`start:demo.preparing.tasks.${task.id}.${state === 'done' ? 'done' : 'active'}`, { name });
            return (
              <li key={task.id} className="flex min-h-14 items-center gap-3 px-3 py-3" data-testid={`demo-task-${task.id}`} data-state={state}>
                <TaskIcon state={state} reduced={reduced} />
                <span className={cn('min-w-0 flex-1 text-sm font-medium', state === 'pending' ? 'text-muted' : 'text-text')}>{label}</span>
                <span className={cn('shrink-0 text-xs font-semibold', state === 'error' ? 'text-error' : state === 'done' ? 'text-success' : 'text-muted')}>
                  {t(`start:demo.preparing.state.${state}`)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {failed && (
        <InlineAlert tone="error" role="alert" title={t('start:demo.preparing.failed')} className="mt-5 w-full text-start">
          <p>{t('start:demo.preparing.failedBody')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onPress={retry} data-testid="demo-retry">
              {t('common:actions.retry')}
            </Button>
            <Button variant="secondary" onPress={onChooseAnother}>
              {t('start:demo.preparing.chooseAnother')}
            </Button>
          </div>
        </InlineAlert>
      )}

      {!failed && (
        <Button variant="quiet" className="mt-5" onPress={onChooseAnother} data-testid="demo-preparing-back">
          {t('start:demo.preparing.chooseAnother')}
        </Button>
      )}
    </div>
  );
}

function TaskIcon({ state, reduced }: { state: TaskState; reduced: boolean }) {
  if (state === 'done') {
    return (
      <motion.span
        aria-hidden
        initial={reduced ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.5, duration: 0.45 }}
        className="grid size-7 shrink-0 place-items-center rounded-pill bg-tile-emerald text-on-tile"
      >
        <CheckCircle2 className="size-4" strokeWidth={2.5} />
      </motion.span>
    );
  }
  if (state === 'error') {
    return (
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-pill bg-error-soft text-error">
        <CircleAlert className="size-4" />
      </span>
    );
  }
  if (state === 'loading') {
    return (
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-pill bg-primary-soft text-primary">
        {reduced ? <Hourglass className="size-4" /> : <Spinner className="size-4" />}
      </span>
    );
  }
  return (
    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-pill bg-sunken text-muted">
      <CircleDashed className="size-4" />
    </span>
  );
}

/** The product mark inside a turning ring while work is in progress (still under reduced motion). */
function BrandSpinner({ active }: { active: boolean }) {
  const { t } = useT();
  const reduced = useReducedMotion();
  return (
    <span aria-hidden className="relative grid size-24 place-items-center">
      <motion.svg
        viewBox="0 0 96 96"
        className="absolute inset-0 size-full text-primary"
        animate={active && !reduced ? { rotate: 360 } : { rotate: 0 }}
        transition={active && !reduced ? { repeat: Infinity, ease: 'linear', duration: 1.6 } : { duration: 0 }}
      >
        <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="4" />
        <path d="M48 4a44 44 0 0 1 44 44" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity={active ? 1 : 0} />
      </motion.svg>
      <MonogramTile letter={t('common:app.productName').charAt(0)} size="lg" />
    </span>
  );
}
