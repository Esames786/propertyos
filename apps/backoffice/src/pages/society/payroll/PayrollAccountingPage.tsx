import type { PayAccounting, PayJournalLine } from '@repo/contracts';
import { EmptyState, ErrorState, InlineAlert, Link, Money, PageHeader, Panel, useApiQuery, useQueryParam, useT } from '@repo/ui';
import { CircleDashed, Scale } from 'lucide-react';
import { PAYROLL } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { unbroken } from '../hr/hkit';
import { PayNav, RunBadge } from './pkit';

/**
 * PAY-007 payroll accounting (PARTIAL): what an approved run would record (and its proposed
 * reversal), kept apart from posted, evidenced entries, of which there are none: payroll never makes
 * a ledger or cashbook entry. The obligation summary separates owed, instructed and verified paid.
 */
export default function PayrollAccountingPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [run] = useQueryParam('run');
  const q = useApiQuery<PayAccounting>({ method: 'GET', path: '/payroll/accounting', ...(run ? { query: { run } } : {}) });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="pay-accounting">
      <PageHeader title={t('payroll:accounting.title')} description={t('payroll:accounting.intro')} />
      <PayNav current="accounting" />
      <InlineAlert tone="warning" title={t('payroll:accounting.partialTitle')} data-testid="pay-accounting-partial">
        {t('payroll:accounting.partial')}
      </InlineAlert>
      <Panel title={t('payroll:accounting.obligationTitle')}>
        <dl className="grid grid-cols-1 gap-3 text-sm @md:grid-cols-3" data-testid="pay-accounting-obligation">
          <div>
            <dt className="text-muted">{t('payroll:accounting.approved')}</dt>
            <dd className="text-lg font-semibold">
              <Money value={d.obligation.approved} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('payroll:accounting.instructed')}</dt>
            <dd className="text-lg font-semibold">
              <Money value={d.obligation.instructed} />
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t('payroll:accounting.settled')}</dt>
            <dd className="flex items-center gap-1.5 text-lg font-semibold text-muted" data-testid="pay-accounting-settled">
              <CircleDashed aria-hidden className="size-4" />
              {t('payroll:accounting.settledNone')}
            </dd>
          </div>
        </dl>
      </Panel>
      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="pay-proposed" className="min-w-0 space-y-3">
          <h2 id="pay-proposed" className="text-base font-semibold text-text">
            {t('payroll:accounting.proposed')}
          </h2>
          {d.runs.length === 0 ? (
            <EmptyState title={t('payroll:accounting.none')} />
          ) : (
            <ul className="space-y-4" data-testid="pay-accounting-runs">
              {d.runs.map((r) => (
                <li key={r.runId} className="space-y-3 rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="pay-accounting-run" data-run={r.runId} data-state={r.state}>
                  <h3 className="flex flex-wrap items-center gap-2 font-semibold text-text">
                    <Link href={PAYROLL.run(r.runId)}>
                      <bdi dir="ltr">{unbroken(r.runRef)}</bdi>
                    </Link>
                    <span className="text-sm font-normal text-muted">{fmt.period(r.month)}</span>
                    <RunBadge state={r.state} />
                  </h3>
                  {r.scopeLimited && <p className="text-sm text-muted">{t('payroll:scopeLimited')}</p>}
                  <Journal title={t('payroll:accounting.proposed')} lines={r.proposed} testId="pay-journal-proposed" />
                  {r.reversal && <Journal title={t('payroll:accounting.reversal')} lines={r.reversal} testId="pay-journal-reversal" />}
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <Scale aria-hidden className="size-3.5" />
                    {r.balanced ? t('payroll:accounting.balanced') : t('payroll:accounting.unbalanced')}
                  </p>
                  <p className="text-xs text-muted">{t('payroll:accounting.statutoryNote', { list: r.statutory.map((s) => t(`payroll:statutory.${s}`)).join(', ') })}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="min-w-0 space-y-5">
          <Panel title={t('payroll:accounting.postedTitle')}>
            <p className="text-sm text-muted" data-testid="pay-accounting-posted">
              {t('payroll:accounting.postedNone')}
            </p>
          </Panel>
          <Panel title={t('payroll:accounting.gapsTitle')}>
            <ul className="space-y-2 text-sm" data-testid="pay-accounting-gaps">
              {d.gaps.map((g) => (
                <li key={g} className="flex items-start gap-2">
                  <CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                  <span className="min-w-0 break-words">{t(`payroll:accounting.gaps.${g}`)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Journal({ title, lines, testId }: { title: string; lines: PayJournalLine[]; testId: string }) {
  const { t } = useT();
  // A list, not a table: each line wraps on a phone at 200 % text instead of scrolling off the side.
  return (
    <section aria-label={title} className="space-y-1">
      <h4 className="text-xs font-semibold text-muted">{title}</h4>
      <ul className="divide-y divide-border/60 rounded-control border border-border/70" data-testid={testId}>
        {lines.map((l, i) => (
          <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm" data-account={l.account} data-side={l.side}>
            <span className="min-w-0 break-words">{t(`payroll:accounting.accounts.${l.account}`)}</span>
            <span className="tabular-nums">
              <span className="text-xs text-muted">{l.side === 'debit' ? t('payroll:accounting.debit') : t('payroll:accounting.credit')}</span>{' '}
              <Money value={l.amount} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
