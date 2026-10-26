import { ApiError } from '@repo/contracts';
import { CircleAlert, Compass, Inbox, Lock, WifiOff, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Reference } from '../data/Reference';
import { cn } from '../lib/cn';
import { useT } from '../lib/useT';
import { Button } from '../primitives/Button';

function StateFrame({
  icon: Icon,
  tone,
  title,
  children,
  actions,
  headingLevel = 2,
  testId,
}: {
  icon: LucideIcon;
  tone: 'neutral' | 'error' | 'warning';
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 1 | 2 | 3;
  testId?: string;
}) {
  const H = `h${headingLevel}` as const;
  return (
    <div data-testid={testId} className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-panel px-6 py-10 text-center">
      <span
        className={cn(
          'grid size-12 place-items-center rounded-pill',
          tone === 'error' ? 'bg-error-soft text-error' : tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-sunken text-muted',
        )}
      >
        <Icon aria-hidden className="size-6" />
      </span>
      <H className="text-base font-semibold text-text">{title}</H>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, body, actions }: { title?: string; body?: string; actions?: ReactNode }) {
  const { t } = useT();
  return (
    <StateFrame icon={Inbox} tone="neutral" title={title ?? t('errors:states.emptyTitle')} actions={actions} testId="state-empty">
      {body ?? t('errors:states.emptyBody')}
    </StateFrame>
  );
}

/**
 * Error with the blueprint's four parts: what happened, whether anything changed, a recovery
 * action and a safe reference for support.
 */
export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const { t } = useT();
  const problem = error instanceof ApiError ? error.problem : null;
  if (problem?.code === 'offline') return <OfflineState onRetry={onRetry} />;
  const reason = problem ? t(problem.messageKey as 'errors:network.unavailable') : t('errors:network.unavailable');
  const changed = problem?.changed ? t('errors:network.maybeChanged') : t('errors:network.nothingChanged');
  return (
    <StateFrame
      icon={CircleAlert}
      tone="error"
      title={title ?? t('errors:states.errorTitle')}
      testId="state-error"
      actions={onRetry && <Button variant="secondary" onPress={onRetry}>{t('common:actions.retry')}</Button>}
    >
      <p>{t('errors:states.errorBody', { reason, changed })}</p>
      {problem?.correlationId && (
        <p className="mt-2 text-xs">
          {t('errors:states.reference', { id: '' })}
          <Reference value={problem.correlationId} />
        </p>
      )}
    </StateFrame>
  );
}

export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useT();
  return (
    <StateFrame
      icon={WifiOff}
      tone="warning"
      title={t('errors:states.offlineTitle')}
      testId="state-offline"
      actions={onRetry && <Button variant="secondary" onPress={onRetry}>{t('common:actions.retry')}</Button>}
    >
      {t('errors:states.offlineBody')}
    </StateFrame>
  );
}

export function ForbiddenState({ role }: { role: string }) {
  const { t } = useT();
  return (
    <StateFrame icon={Lock} tone="neutral" title={t('errors:states.forbiddenTitle')} testId="state-forbidden">
      {t('errors:states.forbiddenBody', { role })}
    </StateFrame>
  );
}

export function NotFoundState({ actions, headingLevel = 2 }: { actions?: ReactNode; headingLevel?: 1 | 2 }) {
  const { t } = useT();
  return (
    <StateFrame icon={Compass} tone="neutral" title={t('errors:states.notFoundTitle')} actions={actions} headingLevel={headingLevel} testId="state-not-found">
      {t('errors:states.notFoundBody')}
    </StateFrame>
  );
}
