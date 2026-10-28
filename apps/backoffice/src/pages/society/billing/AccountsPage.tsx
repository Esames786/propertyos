import type { BillingAccountRow } from '@repo/contracts';
import { Badge, Button, DirectionalIcon, EmptyState, ErrorState, FilterPills, Link, Money, PageHeader, useApiQuery, useQueryParam, useQueryParams, useT, type StatusTone } from '@repo/ui';
import { CheckCircle2, ChevronRight, Clock3, PiggyBank, Search, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input, Label, SearchField } from 'react-aria-components';
import { SOCIETY } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';

const STATUSES = ['all', 'owing', 'arrears', 'clear'] as const;
const PAGE = 20;
const STATUS: Record<BillingAccountRow['status'], [StatusTone, LucideIcon]> = { clear: ['success', CheckCircle2], due: ['warning', Clock3], arrears: ['error', TriangleAlert], credit: ['info', PiggyBank] };

/** BILL-001 billing accounts: what each account owes, what is overdue, its flats and who pays for each. */
export default function AccountsPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [q] = useQueryParam('q');
  const [status] = useQueryParam('status');
  const [page] = useQueryParam('page');
  const setParams = useQueryParams();
  const [draft, setDraft] = useState(q ?? '');
  const filter = (STATUSES as readonly string[]).includes(status ?? '') ? (status as (typeof STATUSES)[number]) : 'all';
  useEffect(() => {
    const id = setTimeout(() => {
      if ((q ?? '') !== draft.trim()) setParams({ q: draft.trim() || null, page: null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  const list = useApiQuery<BillingAccountRow[]>({ method: 'GET', path: '/billing-accounts', query: { q: q ?? undefined, status: filter } }, { placeholderData: (prev) => prev });
  const rows = list.data ?? [];
  const pageNo = Math.max(1, Number(page) || 1);
  const shown = rows.slice((pageNo - 1) * PAGE, pageNo * PAGE);
  return (
    <div className="@container space-y-6" data-testid="accounts-page" data-status={filter}>
      <PageHeader title={t('nav:pages.accounts')} description={t('billing:accounts.intro')} />
      <div className="space-y-4 rounded-card border border-border/70 bg-panel p-4 shadow-card">
        <SearchField value={draft} onChange={setDraft} className="flex max-w-xl flex-col gap-1.5" data-testid="accounts-search">
          <Label className="text-sm font-medium text-text">{t('billing:accounts.search')}</Label>
          <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
            <Search aria-hidden className="size-4 shrink-0 text-muted" />
            <Input placeholder={t('billing:accounts.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden" />
          </div>
        </SearchField>
        <FilterPills label={t('billing:accounts.status')} showLabel value={filter} testId="accounts-status" onChange={(v) => setParams({ status: v === 'all' ? null : v, page: null })} options={STATUSES.map((s) => ({ id: s, label: t(`billing:accounts.filters.${s}`) }))} />
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <Loading lines={8} />
      ) : rows.length === 0 ? (
        <EmptyState title={t('billing:accounts.emptyTitle')} body={t('billing:accounts.emptyBody')} />
      ) : (
        <>
          <p className="text-sm text-muted" role="status" data-testid="accounts-count">{t('billing:accounts.count', { count: rows.length })}</p>
          <ul className="space-y-2" data-testid="accounts-list">
            {shown.map((a) => {
              const [tone, Icon] = STATUS[a.status];
              return (
                <li key={a.id}>
                  <Link href={SOCIETY.account(a.id)} variant="plain" className="grid gap-x-6 gap-y-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card hover:bg-raised @2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto_auto] @2xl:items-center" data-testid="account-row" data-account={a.accountNo}>
                    <span className="min-w-0">
                      <bdi dir="ltr" className="ltr-ref block font-semibold text-text">{a.accountNo}</bdi>
                      <span className="block truncate text-sm text-muted"><bdi>{a.holderName}</bdi> · <bdi dir="ltr" className="ltr-ref">{a.flats.map((f) => f.code).join(', ')}</bdi></span>
                    </span>
                    <span className="min-w-0 truncate text-xs text-muted">{a.payers.map((p) => t('billing:accounts.payerOf', { name: p.name, flat: p.flatCode })).join(' · ')}</span>
                    <span className="text-end">
                      <Money value={a.balance} className="font-semibold" />
                      {a.status === 'arrears' && <span className="block text-xs text-error">{t('billing:accounts.overdue', { amount: fmt.money(a.overdue) })}</span>}
                    </span>
                    <span className="flex items-center justify-end gap-2">
                      <Badge tone={tone} icon={Icon}>{t(`billing:accounts.statuses.${a.status}`)}</Badge>
                      <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {rows.length > PAGE && (
            <nav aria-label={t('crm:list.pagination')} className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">{t('crm:list.showing', { from: fmt.count((pageNo - 1) * PAGE + 1), to: fmt.count(Math.min(rows.length, pageNo * PAGE)), total: fmt.count(rows.length) })}</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" isDisabled={pageNo <= 1} onPress={() => setParams({ page: pageNo - 1 > 1 ? String(pageNo - 1) : null }, { replace: false })}>{t('crm:list.previous')}</Button>
                <Button variant="secondary" size="sm" isDisabled={pageNo * PAGE >= rows.length} onPress={() => setParams({ page: String(pageNo + 1) }, { replace: false })}>{t('crm:list.next')}</Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
