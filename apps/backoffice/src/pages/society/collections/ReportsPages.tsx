import { AGING_BUCKETS, type AgingReport, type BillingAccountRow, type CreditRow } from '@repo/contracts';
import { Badge, DirectionalIcon, EmptyState, ErrorState, FilterPills, Link, Money, PageHeader, SelectControl, useApiQuery, useQueryParam, useQueryParams, useT } from '@repo/ui';
import { ChevronRight, PiggyBank } from 'lucide-react';
import { useState } from 'react';
import { COLLECTIONS, SOCIETY } from '../../../nav.config';
import { Loading, ScrollRegion, useSocietyFormat } from '../kit';
import { StatementView } from '../parts';

/** FIN-011 unapplied credit: who paid more than they owed (or ahead), and whether it can be applied now. */
export function CreditsPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<CreditRow[]>({ method: 'GET', path: '/collections/credits' });
  return (
    <div className="@container space-y-6" data-testid="credits-page">
      <PageHeader title={t('nav:pages.credits')} description={t('collections:credits.intro')} />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={6} />
      ) : q.data.length === 0 ? (
        <EmptyState title={t('collections:credits.emptyTitle')} body={t('collections:credits.emptyBody')} />
      ) : (
        <ul className="space-y-2" data-testid="credits-list">
          {q.data.map((c) => (
            <li key={`${c.billingAccountId}-${c.payerPartyId}`} className="space-y-3 rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="credit-row" data-account={c.accountNo}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-text"><bdi>{c.payerName}</bdi></p>
                  <p className="text-xs text-muted">
                    <Link href={SOCIETY.account(c.billingAccountId)}><bdi dir="ltr" className="ltr-ref">{c.accountNo}</bdi></Link> · <bdi dir="ltr" className="ltr-ref">{c.flats.join(', ')}</bdi>
                  </p>
                </div>
                <span className="text-end">
                  <Money value={c.credit} className="text-lg font-bold" />
                  <span className="block text-xs text-muted">{c.openLines ? t('collections:credits.canApply', { count: c.openLines }) : t('collections:credits.nothingOpen')}</span>
                </span>
              </div>
              <ul className="flex flex-wrap gap-2">
                {c.payments.map((p) => (
                  <li key={p.id}>
                    <Link href={COLLECTIONS.payment(p.id, 'allocations')} variant="plain" className="inline-flex min-h-9 items-center gap-2 rounded-pill border border-border px-3 text-xs font-medium text-text hover:bg-raised">
                      <PiggyBank aria-hidden className="size-3.5 text-info" />
                      <bdi dir="ltr" className="ltr-ref">{p.ref}</bdi> · {fmt.money(p.unapplied)}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const BUCKET_FILTERS = ['all', ...AGING_BUCKETS, 'credit'] as const;

/** COL-005 aging and arrears: open amounts by how long past due, per account; credit is shown apart. */
export function AgingPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [bucket] = useQueryParam('bucket');
  const setParams = useQueryParams();
  const filter = (BUCKET_FILTERS as readonly string[]).includes(bucket ?? '') ? (bucket as (typeof BUCKET_FILTERS)[number]) : 'all';
  const q = useApiQuery<AgingReport>({ method: 'GET', path: '/collections/aging', query: { bucket: filter } }, { placeholderData: (prev) => prev });
  return (
    <div className="@container space-y-6" data-testid="aging-page" data-bucket={filter}>
      <PageHeader title={t('nav:pages.aging')} description={t('collections:agingPage.intro', { date: q.data ? fmt.date(q.data.asOf) : '' })} />
      {q.data && (
        <ul className="grid gap-3 @lg:grid-cols-3 @4xl:grid-cols-6" data-testid="aging-buckets">
          {q.data.buckets.map((b) => (
            <li key={b.key}>
              <Link href={b.href} variant="plain" className={`flex h-full flex-col gap-1 rounded-tile border p-4 hover:bg-raised ${filter === b.key ? 'border-primary bg-primary-soft/40' : 'border-border bg-panel'}`} data-testid="aging-bucket-card" data-bucket={b.key}>
                <span className="text-xs text-muted">{t(`collections:aging.${b.key}`)}</span>
                <Money value={b.amount} className="text-lg font-bold" />
                <span className="text-xs text-muted">{t('collections:summary.accounts', { count: b.accounts })}</span>
              </Link>
            </li>
          ))}
          <li>
            <Link href={q.data.credit.href} variant="plain" className="flex h-full flex-col gap-1 rounded-tile border border-info/40 bg-info-soft/40 p-4 hover:bg-raised" data-testid="aging-credit">
              <span className="text-xs text-muted">{t('collections:agingPage.credit')}</span>
              <Money value={q.data.credit.amount} className="text-lg font-bold" />
              <span className="text-xs text-muted">{t('collections:summary.accounts', { count: q.data.credit.accounts })}</span>
            </Link>
          </li>
        </ul>
      )}
      <FilterPills label={t('collections:agingPage.filter')} value={filter} testId="aging-filter" onChange={(v) => setParams({ bucket: v === 'all' ? null : v })} options={BUCKET_FILTERS.map((b) => ({ id: b, label: b === 'all' ? t('collections:agingPage.all') : b === 'credit' ? t('collections:agingPage.credit') : t(`collections:aging.${b}`) }))} />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={8} />
      ) : q.data.rows.length === 0 ? (
        <EmptyState title={t('collections:agingPage.emptyTitle')} body={t('collections:agingPage.emptyBody')} />
      ) : (
        <ScrollRegion label={t('nav:pages.aging')}>
          <table className="w-full min-w-[46rem] text-sm" data-testid="aging-table">
            <caption className="sr-only">{t('nav:pages.aging')}</caption>
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t('collections:agingPage.account')}</th>
                {AGING_BUCKETS.map((b) => (
                  <th key={b} scope="col" className="py-2 pe-3 text-end font-medium">{t(`collections:aging.${b}`)}</th>
                ))}
                <th scope="col" className="py-2 pe-3 text-end font-medium">{t('collections:agingPage.total')}</th>
                <th scope="col" className="py-2 text-end font-medium">{t('collections:agingPage.credit')}</th>
              </tr>
            </thead>
            <tbody>
              {q.data.rows.map((r) => (
                <tr key={r.billingAccountId} className="border-b border-border/60" data-testid="aging-row" data-account={r.accountNo}>
                  <th scope="row" className="py-2.5 pe-3 text-start font-normal">
                    <Link href={COLLECTIONS.statement(r.billingAccountId)} className="font-medium"><bdi dir="ltr" className="ltr-ref">{r.accountNo}</bdi></Link>
                    <span className="block text-xs text-muted"><bdi>{r.holderName}</bdi> · <bdi dir="ltr" className="ltr-ref">{r.flats.join(', ')}</bdi></span>
                  </th>
                  {AGING_BUCKETS.map((b) => (
                    <td key={b} className="py-2.5 pe-3 text-end">{Number(r.buckets[b].amount) ? <Money value={r.buckets[b]} /> : <span className="text-subtle">—</span>}</td>
                  ))}
                  <td className="py-2.5 pe-3 text-end font-semibold"><Money value={r.total} /></td>
                  <td className="py-2.5 text-end">{Number(r.credit.amount) ? <Money value={r.credit} /> : <span className="text-subtle">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
    </div>
  );
}

/**
 * COL-004 account statement: choose an account (or arrive from a link), then the statement with
 * opening balance, charges, credit notes, payments and the closing balance.
 */
export function StatementPage() {
  const { t } = useT();
  const [account] = useQueryParam('account');
  const [period] = useQueryParam('period');
  const setParams = useQueryParams();
  const accounts = useApiQuery<BillingAccountRow[]>({ method: 'GET', path: '/billing-accounts', query: { status: 'all' } });
  const [chosen, setChosen] = useState<string | null>(account);
  const current = account ?? chosen;
  const row = accounts.data?.find((a) => a.id === current);
  return (
    <div className="@container space-y-6" data-testid="statement-page">
      <PageHeader title={t('nav:pages.statement')} description={t('collections:statementPage.intro')} />
      <div className="max-w-xl">
        <SelectControl
          label={t('collections:statementPage.account')}
          value={current}
          onChange={(k) => {
            setChosen(k);
            setParams({ account: k });
          }}
          options={(accounts.data ?? []).map((a) => ({ id: a.id, label: `${a.accountNo} · ${a.holderName} · ${a.flats.map((f) => f.code).join(', ')}` }))}
          testId="statement-account"
        />
      </div>
      {row && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={row.status === 'credit' ? 'info' : row.status === 'arrears' ? 'error' : row.status === 'due' ? 'warning' : 'success'}>{t(`billing:accounts.statuses.${row.status}`)}</Badge>
          <Link href={SOCIETY.account(row.id)} className="inline-flex items-center gap-1">
            {t('collections:statementPage.openAccount')}
            <DirectionalIcon icon={ChevronRight} className="size-4" />
          </Link>
          <Link href={COLLECTIONS.payments({ account: row.id })}>{t('collections:statementPage.payments')}</Link>
        </p>
      )}
      {current ? (
        <div className="rounded-card bg-panel p-5 shadow-card">
          <StatementView accountId={current} period={period ?? 'all'} onPeriod={(p) => setParams({ period: p === 'all' ? null : p })} testId="account-statement" />
        </div>
      ) : (
        <EmptyState title={t('collections:statementPage.pickTitle')} body={t('collections:statementPage.pickBody')} />
      )}
    </div>
  );
}
