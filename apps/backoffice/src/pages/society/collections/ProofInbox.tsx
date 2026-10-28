import type { SubmissionQueue, SubmissionRow } from '@repo/contracts';
import { Badge, DateTime, DirectionalIcon, EmptyState, ErrorState, FilterPills, Link, Money, PageHeader, useApiQuery, useQueryParam, useQueryParams, useSession, useT } from '@repo/ui';
import { ChevronRight, Copy, History, Search, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input, Label, SearchField } from 'react-aria-components';
import { COLLECTIONS } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { MatchBadge, SubmissionStateBadge } from './ckit';

const FILTERS = ['to_review', 'needs_information', 'verified', 'rejected', 'all'] as const;

/**
 * FIN-008 payment-proof inbox: worked oldest first. Each proof says at a glance whether a bank
 * transfer matches it, whether it looks like a copy of an earlier one, and who is reviewing it.
 */
export default function ProofInbox() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { can } = useSession();
  const [state] = useQueryParam('state');
  const [q] = useQueryParam('q');
  const setParams = useQueryParams();
  const [draft, setDraft] = useState(q ?? '');
  const filter = (FILTERS as readonly string[]).includes(state ?? '') ? (state as (typeof FILTERS)[number]) : state === 'submitted' || state === 'pending' ? 'to_review' : 'to_review';
  useEffect(() => {
    const id = setTimeout(() => {
      if ((q ?? '') !== draft.trim()) setParams({ q: draft.trim() || null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  const query = useApiQuery<SubmissionQueue>({ method: 'GET', path: '/payment-submissions', query: { state: filter, q: q ?? undefined } }, { placeholderData: (prev) => prev });
  const counts = query.data?.counts;
  const count = (f: (typeof FILTERS)[number]) =>
    !counts ? undefined : f === 'to_review' ? counts.submitted + counts.under_review : f === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[f];
  return (
    <div className="@container space-y-6" data-testid="proof-inbox" data-filter={filter}>
      <PageHeader
        title={t('nav:pages.proofInbox')}
        description={can('finance.evidence.review') ? t('collections:inbox.intro') : t('collections:inbox.introReadOnly')}
        badge={query.data ? <Badge tone="info" icon={History}>{t('collections:inbox.pending', { amount: fmt.money(query.data.pending) })}</Badge> : undefined}
      />
      <div className="space-y-4 rounded-card border border-border/70 bg-panel p-4 shadow-card">
        <SearchField value={draft} onChange={setDraft} className="flex max-w-xl flex-col gap-1.5" data-testid="inbox-search">
          <Label className="text-sm font-medium text-text">{t('collections:inbox.search')}</Label>
          <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
            <Search aria-hidden className="size-4 shrink-0 text-muted" />
            <Input placeholder={t('collections:inbox.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden" />
          </div>
        </SearchField>
        <FilterPills
          label={t('collections:inbox.filterLabel')}
          showLabel
          value={filter}
          testId="inbox-filter"
          onChange={(v) => setParams({ state: v === 'to_review' ? null : v })}
          options={FILTERS.map((f) => ({ id: f, label: count(f) === undefined ? t(`collections:inbox.filters.${f}`) : t('collections:inbox.filterCount', { label: t(`collections:inbox.filters.${f}`), count: count(f) }) }))}
        />
      </div>
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data ? (
        <Loading lines={8} />
      ) : query.data.items.length === 0 ? (
        <EmptyState title={t(`collections:inbox.empty.${filter}`)} body={t('collections:inbox.emptyBody')} />
      ) : (
        <>
          <p className="text-sm text-muted" role="status" data-testid="inbox-count">
            {t('collections:inbox.count', { count: query.data.items.length })}
          </p>
          <ul className="space-y-2" data-testid="inbox-list">
            {query.data.items.map((row) => (
              <li key={row.id}>
                <ProofRow row={row} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ProofRow({ row }: { row: SubmissionRow }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <Link
      href={COLLECTIONS.review(row.id)}
      variant="plain"
      className="grid gap-x-6 gap-y-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card hover:bg-raised @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] @3xl:items-center"
      data-testid="proof-row"
      data-flat={row.flats[0]}
      data-state={row.state}
      data-match={row.match}
    >
      <span className="min-w-0 space-y-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-text">
            <bdi>{row.payerName}</bdi>
          </span>
          <bdi dir="ltr" className="ltr-ref text-sm text-muted">
            {row.flats.join(', ')} · {row.accountNo}
          </bdi>
        </span>
        <span className="block text-xs text-muted">
          <bdi dir="ltr" className="ltr-ref">{row.ref}</bdi> · {t('collections:inbox.sent')} <DateTime value={row.submittedAt} style="dateTime" /> · {t('collections:inbox.transfer', { date: fmt.date(row.transferDate) })} · <bdi dir="ltr" className="ltr-ref">{row.bankReference}</bdi>
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <SubmissionStateBadge state={row.state} />
        {row.state !== 'verified' && row.state !== 'rejected' && <MatchBadge match={row.match} />}
        {row.versions > 1 && <Badge tone="neutral" icon={History}>{t('collections:inbox.versions', { count: row.versions })}</Badge>}
        {row.possibleDuplicateOf && <Badge tone="warning" icon={Copy}>{t('collections:inbox.duplicate', { ref: row.possibleDuplicateOf[0] })}</Badge>}
        {row.reviewer && row.state === 'under_review' && <Badge tone="neutral" icon={UserRound}>{t('collections:inbox.reviewer', { name: row.reviewer })}</Badge>}
      </span>
      <span className="flex items-center justify-end gap-3">
        <Money value={row.amount} className="text-lg font-bold" />
        <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
      </span>
    </Link>
  );
}
