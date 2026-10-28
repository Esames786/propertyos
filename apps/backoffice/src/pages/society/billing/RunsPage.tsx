import type { BillingRun, SiteSummary } from '@repo/contracts';
import { buttonClass, cn, DirectionalIcon, EmptyState, ErrorState, Link, Money, PageHeader, Panel, useApiQuery, useSession, useT } from '@repo/ui';
import { CalendarClock, ChevronRight, FilePlus2, Lock } from 'lucide-react';
import { SOCIETY } from '../../../nav.config';
import { Loading, RunStateBadge, useSocietyFormat } from '../kit';

const addMonths = (period: string, n: number) => {
  const d = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * BILL-005 billing calendar and runs. Each month at a glance: go-live balances, the month being
 * billed and what opens next; then every run with who prepared and who approved it.
 */
export default function RunsPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { can } = useSession();
  const q = useApiQuery<{ runs: BillingRun[]; nextPeriod: string; canCreate: boolean }>({ method: 'GET', path: '/billing-runs' });
  const sites = useApiQuery<SiteSummary[]>(can('site.view') ? { method: 'GET', path: '/sites' } : null);
  const site = sites.data?.[0];

  return (
    <div className="@container space-y-6" data-testid="runs-page">
      <PageHeader
        title={t('nav:pages.billingRuns')}
        description={t('billing:runs.intro')}
        actions={
          q.data?.canCreate ? (
            <Link href={SOCIETY.newRun} variant="plain" className={buttonClass('primary')} data-testid="runs-new">
              <span className="inline-flex items-center gap-2">
                <FilePlus2 aria-hidden className="size-4" />
                {t('billing:runs.new')}
              </span>
            </Link>
          ) : undefined
        }
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={8} />
      ) : (
        <>
          <section aria-label={t('billing:runs.calendar')} className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-4" data-testid="billing-calendar" data-tour-id="billing-calendar">
            {[addMonths(q.data.nextPeriod, -1), q.data.nextPeriod, addMonths(q.data.nextPeriod, 1), addMonths(q.data.nextPeriod, 2)].map((p) => {
              const run = q.data!.runs.find((r) => r.period === p && r.state !== 'CANCELLED');
              const goLive = p === '2026-10';
              const opensLater = p > q.data!.nextPeriod;
              return (
                <div key={p} className={cn('flex min-h-36 flex-col justify-between gap-3 rounded-card border p-4', p === q.data!.nextPeriod ? 'border-primary/40 bg-primary-soft/30' : 'border-border bg-panel')} data-testid="calendar-month" data-period={p}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold text-text">
                      <CalendarClock aria-hidden className="size-4 text-muted" />
                      {fmt.period(p)}
                    </span>
                    {run && <RunStateBadge state={run.state} stale={run.stale} />}
                  </div>
                  {run ? (
                    <div className="space-y-1">
                      {run.totals && (
                        <p className="text-sm text-text">
                          <Money value={run.totals.amount} className="font-semibold" /> · {t('billing:runs.invoicesCount', { count: run.totals.invoices })}
                        </p>
                      )}
                      <Link href={SOCIETY.run(run.id)} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium">
                        {t('billing:runs.open', { ref: run.ref })}
                        <DirectionalIcon icon={ChevronRight} className="size-4" />
                      </Link>
                    </div>
                  ) : goLive ? (
                    <div className="space-y-1 text-sm">
                      <p className="text-muted">{t('billing:runs.goLive')}</p>
                      {site && (
                        <Link href={SOCIETY.openingBalances(site.id)} className="inline-flex min-h-10 items-center">
                          {t('billing:runs.openingLink')}
                        </Link>
                      )}
                    </div>
                  ) : opensLater ? (
                    <p className="flex items-start gap-2 text-sm text-muted">
                      <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
                      {t('billing:runs.opensAfter', { period: fmt.period(addMonths(p, -1)) })}
                    </p>
                  ) : q.data!.canCreate ? (
                    <Link href={SOCIETY.newRun} variant="plain" className={cn(buttonClass('secondary', 'sm'), 'self-start')} data-testid="calendar-create">
                      {t('billing:runs.createFor', { period: fmt.period(p) })}
                    </Link>
                  ) : (
                    <p className="text-sm text-muted">{t('billing:runs.notStarted')}</p>
                  )}
                </div>
              );
            })}
          </section>

          <Panel title={t('billing:runs.allRuns')}>
            {q.data.runs.length === 0 ? (
              <EmptyState title={t('billing:runs.emptyTitle')} body={t('billing:runs.emptyBody')} />
            ) : (
              <ul className="divide-y divide-border" data-testid="runs-list">
                {q.data.runs.map((r) => (
                  <li key={r.id}>
                    <Link href={SOCIETY.run(r.id)} variant="plain" className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-control px-2 py-3 hover:bg-raised" data-testid="run-row" data-state={r.state}>
                      <span className="min-w-0 flex-1 basis-48">
                        <span className="block font-semibold text-text">{t('billing:run.title', { period: fmt.period(r.period) })}</span>
                        <span className="block text-xs text-muted">
                          <bdi dir="ltr" className="ltr-ref">{r.ref}</bdi> · {t('billing:runs.preparedBy', { name: r.createdByName })}
                          {r.approvedByName ? <> · {t('billing:runs.approvedBy', { name: r.approvedByName })}</> : null}
                        </span>
                      </span>
                      <RunStateBadge state={r.state} stale={r.stale} />
                      <span className="text-sm text-text">{r.totals ? <Money value={r.totals.amount} className="font-semibold" /> : '—'}</span>
                      <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <p className="text-xs text-muted">{t('billing:runs.supplementary')}</p>
        </>
      )}
    </div>
  );
}
