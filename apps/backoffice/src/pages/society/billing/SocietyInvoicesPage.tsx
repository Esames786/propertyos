import type { InvoiceList } from '@repo/contracts';
import { AmountStrip, Button, DirectionalIcon, EmptyState, ErrorState, FilterPills, Link, Money, PageHeader, useApiQuery, useQueryParam, useQueryParams, useT } from '@repo/ui';
import { Ban, ChevronRight, CircleDollarSign, ReceiptText, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input, Label, SearchField } from 'react-aria-components';
import { SOCIETY } from '../../../nav.config';
import { Loading, SettlementBadge, useSocietyFormat } from '../kit';

const SOURCES = ['all', 'billing_run', 'opening_balance'] as const;
const STATUSES = ['all', 'unpaid', 'overdue', 'credited'] as const;
const PAGE = 20;

/**
 * FIN-002 invoices, society composition: one list for every source (monthly bills and opening
 * balances), each showing where it came from. Filters live in the address, so a dashboard figure
 * can open exactly the invoices behind it.
 */
export default function SocietyInvoicesPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [q] = useQueryParam('q');
  const [source] = useQueryParam('source');
  const [status] = useQueryParam('status');
  const [period] = useQueryParam('period');
  const [run] = useQueryParam('run');
  const [page] = useQueryParam('page');
  const setParams = useQueryParams();
  const [draft, setDraft] = useState(q ?? '');
  const src = (SOURCES as readonly string[]).includes(source ?? '') ? source! : 'all';
  const st = (STATUSES as readonly string[]).includes(status ?? '') ? status! : 'all';
  useEffect(() => {
    const id = setTimeout(() => {
      if ((q ?? '') !== draft.trim()) setParams({ q: draft.trim() || null, page: null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  const list = useApiQuery<InvoiceList>({ method: 'GET', path: '/billing/invoices', query: { q: q ?? undefined, source: src, status: st, period: period ?? undefined, run: run ?? undefined } }, { placeholderData: (prev) => prev });
  const data = list.data;
  const pageNo = Math.max(1, Number(page) || 1);
  const shown = data?.items.slice((pageNo - 1) * PAGE, pageNo * PAGE) ?? [];
  return (
    <div className="@container space-y-6" data-testid="society-invoices-page">
      <PageHeader title={t('nav:pages.invoices')} description={t('billing:invoices.intro')} />
      {data && (
        <div className="grid gap-3 @3xl:grid-cols-3" data-testid="invoices-totals">
          <AmountStrip tone="neutral" icon={ReceiptText} label={t('billing:invoices.billed')} amount={<Money value={data.totals.billed} />} />
          <AmountStrip tone="neutral" icon={Ban} label={t('billing:invoices.credited')} amount={<Money value={data.totals.credited} />} />
          <AmountStrip tone="warning" icon={CircleDollarSign} label={t('billing:invoices.outstanding')} amount={<Money value={data.totals.outstanding} />} />
        </div>
      )}
      <div className="space-y-4 rounded-card border border-border/70 bg-panel p-4 shadow-card">
        <SearchField value={draft} onChange={setDraft} className="flex max-w-xl flex-col gap-1.5" data-testid="invoices-search">
          <Label className="text-sm font-medium text-text">{t('billing:invoices.search')}</Label>
          <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
            <Search aria-hidden className="size-4 shrink-0 text-muted" />
            <Input placeholder={t('billing:invoices.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden" />
          </div>
        </SearchField>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <FilterPills label={t('billing:invoices.source')} showLabel value={src} testId="invoices-source" onChange={(v) => setParams({ source: v === 'all' ? null : v, page: null })} options={SOURCES.map((s) => ({ id: s, label: s === 'all' ? t('billing:invoices.all') : t(`billing:source.${s}`) }))} />
          <FilterPills label={t('billing:invoices.status')} showLabel value={st} testId="invoices-status" onChange={(v) => setParams({ status: v === 'all' ? null : v, page: null })} options={STATUSES.map((s) => ({ id: s, label: s === 'all' ? t('billing:invoices.all') : s === 'overdue' ? t('billing:settlement.overdue') : t(`billing:settlement.${s}`) }))} />
        </div>
        {(period || run) && (
          <p className="text-sm text-muted">
            {period && t('billing:invoices.periodFilter', { period: fmt.period(period) })} {run && t('billing:invoices.runFilter')}{' '}
            <button type="button" className="font-medium text-primary underline" onClick={() => setParams({ period: null, run: null, page: null })}>{t('common:actions.clear')}</button>
          </p>
        )}
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !data ? (
        <Loading lines={8} />
      ) : data.items.length === 0 ? (
        <EmptyState title={t('billing:invoices.emptyTitle')} body={t('billing:invoices.emptyBody')} />
      ) : (
        <>
          <p className="text-sm text-muted" role="status" data-testid="invoices-count">{t('billing:invoices.count', { count: data.total })}</p>
          <ul className="space-y-2" data-testid="society-invoices">
            {shown.map((i) => (
              <li key={i.id}>
                <Link href={SOCIETY.invoice(i.id)} variant="plain" className="grid gap-x-6 gap-y-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card hover:bg-raised @2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] @2xl:items-center" data-testid="society-invoice-row" data-ref={i.ref}>
                  <span className="min-w-0">
                    <bdi dir="ltr" className="ltr-ref block font-semibold text-text">{i.ref}</bdi>
                    <span className="block truncate text-sm text-muted">{t(`billing:source.${i.source}`)} · {fmt.period(i.period)} · <bdi dir="ltr" className="ltr-ref">{i.flats.join(', ')}</bdi></span>
                  </span>
                  <span className="min-w-0 truncate text-sm text-text"><bdi>{i.payerName}</bdi><span className="block text-xs text-muted"><bdi dir="ltr" className="ltr-ref">{i.accountNo}</bdi></span></span>
                  <span className="text-end">
                    <Money value={i.total} className="font-semibold" />
                    {i.credited.amount !== '0.00' && <span className="block text-xs text-muted">{t('billing:invoices.creditedLine', { amount: fmt.money(i.credited) })}</span>}
                  </span>
                  <span className="flex items-center justify-end gap-2">
                    <SettlementBadge invoice={i} />
                    <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {data.total > PAGE && (
            <nav aria-label={t('crm:list.pagination')} className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">{t('crm:list.showing', { from: fmt.count((pageNo - 1) * PAGE + 1), to: fmt.count(Math.min(data.total, pageNo * PAGE)), total: fmt.count(data.total) })}</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" isDisabled={pageNo <= 1} onPress={() => setParams({ page: pageNo - 1 > 1 ? String(pageNo - 1) : null }, { replace: false })}>{t('crm:list.previous')}</Button>
                <Button variant="secondary" size="sm" isDisabled={pageNo * PAGE >= data.total} onPress={() => setParams({ page: String(pageNo + 1) }, { replace: false })} data-testid="invoices-next">{t('crm:list.next')}</Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
