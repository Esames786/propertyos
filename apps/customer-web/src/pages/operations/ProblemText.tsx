import { ApiError } from '@repo/contracts';
import { dynamicT, InlineAlert, NotFoundState, useT } from '@repo/ui';

/** The server's refusal in plain words, with every field it named (nothing was changed). */
export function ProblemText({ error }: { error: unknown }) {
  const { t } = useT();
  const dt = dynamicT(t);
  if (!(error instanceof ApiError)) {
    return (
      <InlineAlert tone="error" role="alert">
        {t('errors:network.unavailable')}
      </InlineAlert>
    );
  }
  const fields = Object.entries(error.problem.errors ?? {}).flatMap(([field, list]) => list.map((e, i) => ({ key: `${field}-${i}`, text: dt(e.code, e.params) })));
  return (
    <InlineAlert tone="error" role="alert" title={dt(error.problem.messageKey)}>
      {fields.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 ps-5" data-testid="problem-fields">
          {fields.map((f) => (
            <li key={f.key}>{f.text}</li>
          ))}
        </ul>
      )}
    </InlineAlert>
  );
}

/**
 * A screen the resident cannot open for this flat: their link has ended, the service is not part of
 * the society's plan for their site, or the address belongs to someone else (rule R).
 */
export function NotAvailable({ error }: { error: unknown }) {
  const { t } = useT();
  if (error instanceof ApiError && error.problem.status === 404) return <NotFoundState headingLevel={1} />;
  if (error instanceof ApiError && error.problem.status === 403)
    return (
      <div className="space-y-2 rounded-card border border-border bg-panel p-6" data-testid="not-in-plan" data-reason={error.problem.code}>
        <h1 id="page-title" tabIndex={-1} className="text-xl font-bold text-text outline-none">
          {t('operations:notInPlan.title')}
        </h1>
        <p className="text-sm text-muted">{t('operations:notInPlan.body')}</p>
      </div>
    );
  return <ProblemText error={error} />;
}
