import type { InvoiceHistoryResponse, InvoiceSettlement } from '@repo/contracts';
import { formatNumber, useLocale } from '@repo/i18n';
import {
  AmountStrip,
  Badge,
  Button,
  DateTime,
  DirectionalIcon,
  EmptyState,
  ErrorState,
  FilterPills,
  Money,
  PageHeader,
  Skeleton,
  StatusLabel,
  useApiQuery,
  useQueryParam,
  useQueryParams,
  useSession,
  useT,
} from '@repo/ui';
import { ChevronLeft, ChevronRight, CircleDollarSign, Eye, HandCoins, ReceiptText, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button as AriaButton, Input, Label, SearchField } from 'react-aria-components';

const FILTERS = ['all', 'unpaid', 'partially_paid', 'paid'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * FIN-002 Invoices, read-only (CP2 security correction 4). The organisation's issued invoices and
 * what was paid against them. It is financial history, so it stays available while a workspace is
 * suspended; creating, changing or collecting invoices is planned for a later gate and is not
 * offered here. Search and the status filter live in the address.
 */
export default function InvoicesPage() {
  const { t } = useT();
  const { locale } = useLocale();
  const { tenant } = useSession();
  const [q] = useQueryParam('q');
  const [status] = useQueryParam('status');
  const [page] = useQueryParam('page');
  const setParams = useQueryParams();
  const [draft, setDraft] = useState(q ?? '');
  const filter: Filter = (FILTERS as readonly string[]).includes(status ?? '') ? (status as Filter) : 'all';
  const pageNo = Math.max(1, Number(page) || 1);

  useEffect(() => {
    const id = setTimeout(() => {
      if ((q ?? '') !== draft.trim()) setParams({ q: draft.trim() || null, page: null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const list = useApiQuery<InvoiceHistoryResponse>(
    { method: 'GET', path: '/finance/invoices', query: { q: q ?? undefined, settlement: filter, page: pageNo } },
    { placeholderData: (prev) => prev },
  );
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const start = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const end = data ? Math.min(data.total, data.page * data.pageSize) : 0;

  return (
    <div className="@container space-y-6" data-testid="invoices-page">
      <PageHeader
        title={t('nav:pages.invoices')}
        badge={<Badge tone="neutral" icon={Eye}>{t('workspace:plan.readOnly')}</Badge>}
        description={t('workspace:invoices.intro', { organisation: tenant.name })}
      />

      {data && (
        <div className="grid gap-3 @3xl:grid-cols-3" data-testid="invoices-totals">
          <AmountStrip tone="neutral" icon={ReceiptText} label={t('workspace:invoices.billed')} amount={<Money value={data.totals.billed} />} />
          <AmountStrip tone="success" icon={HandCoins} label={t('workspace:invoices.collected')} amount={<Money value={data.totals.collected} />} />
          <AmountStrip tone="warning" icon={CircleDollarSign} label={t('workspace:invoices.outstanding')} amount={<Money value={data.totals.outstanding} />} />
        </div>
      )}

      <div className="space-y-4 rounded-card border border-border/70 bg-panel p-4 shadow-card">
        <SearchField value={draft} onChange={setDraft} className="flex min-w-0 flex-col gap-1.5" data-testid="invoices-search">
          <Label className="text-sm font-medium text-text">{t('workspace:invoices.search')}</Label>
          <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
            <Search aria-hidden className="size-4 shrink-0 text-muted" />
            <Input placeholder={t('workspace:invoices.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden" />
            {draft && (
              <AriaButton aria-label={t('common:actions.clear')} className="grid size-8 place-items-center rounded-pill text-muted outline-none data-hovered:bg-sunken data-focus-visible:outline-2 data-focus-visible:outline-focus">
                <X aria-hidden className="size-4" />
              </AriaButton>
            )}
          </div>
        </SearchField>
        <FilterPills
          label={t('workspace:invoices.filter')}
          showLabel
          value={filter}
          testId="invoices-filter"
          onChange={(v) => setParams({ status: v === 'all' ? null : v, page: null })}
          options={FILTERS.map((f) => ({ id: f, label: f === 'all' ? t('workspace:invoices.all') : t(`status:settlement.${f as InvoiceSettlement}`) }))}
        />
      </div>

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !data ? (
        <div role="status" aria-busy="true" className="space-y-2">
          <span className="sr-only">{t('common:state.loading')}</span>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-tile" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState title={t('workspace:invoices.emptyTitle')} body={t('workspace:invoices.emptyBody')} />
      ) : (
        <>
          <ul className="space-y-2" data-testid="invoices-list" aria-label={t('nav:pages.invoices')}>
            {data.items.map((i) => (
              <li key={i.id} className="rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="invoice-row" data-ref={i.ref}>
                <div className="grid gap-x-6 gap-y-2 @2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] @2xl:items-center">
                  <div className="min-w-0">
                    <p className="font-semibold text-text">
                      <bdi>{i.ref}</bdi>
                    </p>
                    <p className="truncate text-sm text-muted">
                      <bdi>{i.partyName}</bdi> · <bdi>{i.unitRef}</bdi> · {i.projectName}
                    </p>
                  </div>
                  <dl className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted">{t('workspace:invoices.due')}</dt>
                      <dd className="text-text">
                        <DateTime value={i.dueDate} style="calendar" />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t('workspace:invoices.total')}</dt>
                      <dd className="text-text">
                        <Money value={i.total} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{t('workspace:invoices.paid')}</dt>
                      <dd className="text-text">
                        <Money value={i.paid} />
                      </dd>
                    </div>
                  </dl>
                  <StatusLabel kind="settlement" status={i.settlement} className="justify-self-start @2xl:justify-self-end" />
                </div>
              </li>
            ))}
          </ul>
          <nav aria-label={t('crm:list.pagination')} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" data-testid="invoices-showing">
              {t('crm:list.showing', { from: formatNumber(start, locale), to: formatNumber(end, locale), total: formatNumber(data.total, locale) })}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" isDisabled={pageNo <= 1} onPress={() => setParams({ page: pageNo - 1 > 1 ? String(pageNo - 1) : null }, { replace: false })}>
                <span className="inline-flex items-center gap-1.5">
                  <DirectionalIcon icon={ChevronLeft} className="size-4" />
                  {t('crm:list.previous')}
                </span>
              </Button>
              <Button variant="secondary" isDisabled={pageNo >= pages} onPress={() => setParams({ page: String(pageNo + 1) }, { replace: false })} data-testid="invoices-next">
                <span className="inline-flex items-center gap-1.5">
                  {t('crm:list.next')}
                  <DirectionalIcon icon={ChevronRight} className="size-4" />
                </span>
              </Button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
