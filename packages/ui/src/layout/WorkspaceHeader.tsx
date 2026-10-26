import type { ReactNode } from 'react';
import { Reference } from '../data/Reference';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';

/**
 * 360° record header: context (type + reference), the record name as H1, status, key metrics
 * and next actions. Names keep their original script; references stay LTR-isolated.
 */
export function WorkspaceHeader({
  entityLabel,
  title,
  reference,
  status,
  metrics,
  actions,
  breadcrumbs = [],
}: {
  entityLabel: string;
  title: string;
  reference: string;
  status?: ReactNode;
  metrics: Array<{ label: string; value: ReactNode }>;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
}) {
  return (
    <header className="mb-6 space-y-4">
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{entityLabel}</span>
            <span aria-hidden>·</span>
            <Reference value={reference} />
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 id="page-title" className="text-2xl font-semibold tracking-tight text-text outline-none">
              <bdi>{title}</bdi>
            </h1>
            {status}
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-card border border-border bg-panel px-4 py-3">
            <dt className="text-xs text-muted">{m.label}</dt>
            <dd className="mt-1 text-sm font-semibold text-text">{m.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
