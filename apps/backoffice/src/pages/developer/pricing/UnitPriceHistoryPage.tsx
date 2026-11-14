import type { UnitPriceHistory, UnitPricePickerResponse } from '@repo/contracts';
import { Badge, EmptyState, ErrorState, Link, PageHeader, SkeletonBlock, useApiQuery, useT } from '@repo/ui';
import { Search, History, LockKeyhole, Layers3 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useCrmFormat } from '../../crm/format';

/**
 * INV-006, Gate E.3 preview: never displays a fictional approval, previous price,
 * revision date, quotation or receipt. The visible baseline is sourced from the unit fixture.
 */
export default function UnitPriceHistoryPage() {
  const { t } = useT();
  const money = useCrmFormat();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const unitId = params.get('record');
  const choices = useApiQuery<UnitPricePickerResponse>({
    method: 'GET', path: '/pricing/units', query: { q: search.trim() },
  });
  const selected = useApiQuery<UnitPriceHistory>(
    unitId ? { method: 'GET', path: `/units/${encodeURIComponent(unitId)}/prices` } : null,
  );
  const choose = (id: string | null) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set('record', id);
      else next.delete('record');
      return next;
    });
  };

  return (
    <div className="space-y-6 @container" data-testid="unit-price-history-page">
      <PageHeader title={t('pricing:title')} description={t('pricing:description')} />
      <p className="rounded-control border border-border bg-sunken p-3 text-sm text-muted" data-testid="pricing-demo-warning">
        {t('pricing:changesBlocked')}
      </p>
      <div className="grid gap-5 @3xl:grid-cols-[minmax(15rem,1fr)_minmax(0,1.5fr)]">
        <section className="min-w-0 space-y-4 rounded-card border border-border bg-panel p-4" aria-labelledby="price-unit-picker">
          <h2 id="price-unit-picker" className="font-semibold text-text">{t('pricing:choose')}</h2>
          <label htmlFor="price-unit-search" className="block text-sm font-medium text-text">
            {t('pricing:search')}
          </label>
          <div className="flex items-center gap-2 rounded-control border border-border-control px-3">
            <Search aria-hidden className="size-4 shrink-0 text-muted" />
            <input
              id="price-unit-search"
              data-testid="price-unit-search"
              type="search"
              className="min-h-11 min-w-0 flex-1 bg-transparent text-text outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted">{t('pricing:searchHint')}</p>
          {choices.isError ? (
            <ErrorState error={choices.error} onRetry={() => void choices.refetch()} />
          ) : !choices.data ? (
            <SkeletonBlock lines={4} />
          ) : choices.data.items.length === 0 ? (
            <EmptyState title={t('pricing:noneFound')} />
          ) : (
            <>
              <p className="text-xs text-muted" data-testid="price-visible-count">
                {t('pricing:visibleCount', { count: choices.data.total })}
              </p>
              <ul className="max-h-[28rem] space-y-2 overflow-y-auto" data-testid="price-unit-options">
                {choices.data.items.map((unit) => (
                  <li key={unit.id}>
                    <Link
                      href={`/backoffice/inv/unit-price-history?record=${encodeURIComponent(unit.id)}`}
                      variant="plain"
                      aria-current={unitId === unit.id ? 'page' : undefined}
                      className="flex min-w-0 flex-col gap-1 rounded-control border border-border p-3 text-sm text-text data-hovered:bg-raised data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
                      data-testid="price-unit-option"
                    >
                      <span className="font-semibold"><bdi dir="ltr">{unit.ref}</bdi></span>
                      <span className="break-words text-muted">{unit.projectName}</span>
                      <span className="font-medium"><bdi dir="ltr">{money.moneyExact(unit.currentListedPrice)}</bdi></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="min-w-0 space-y-5 rounded-card border border-border bg-panel p-5" aria-live="polite" aria-labelledby="price-history-detail">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="price-history-detail" className="flex items-center gap-2 font-semibold text-text">
              <History aria-hidden className="size-5" />
              {t('pricing:title')}
            </h2>
            {unitId && (
              <button
                type="button"
                className="min-h-10 rounded-control px-3 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                onClick={() => choose(null)}
              >
                {t('pricing:back')}
              </button>
            )}
          </div>
          {!unitId ? (
            <EmptyState title={t('pricing:noSelection')} />
          ) : selected.isError ? (
            <ErrorState error={selected.error} title={t('pricing:unknown')} onRetry={() => void selected.refetch()} />
          ) : !selected.data ? (
            <SkeletonBlock lines={5} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info" icon={Layers3}>{t('pricing:baselineOnly')}</Badge>
                <span className="text-sm text-muted"><bdi dir="ltr">{selected.data.unit.ref}</bdi></span>
              </div>
              <dl className="grid gap-3 @md:grid-cols-2">
                <div className="min-w-0 rounded-control bg-sunken p-3">
                  <dt className="text-sm text-muted">{t('pricing:project')}</dt>
                  <dd className="break-words font-semibold text-text">{selected.data.unit.projectName}</dd>
                </div>
                <div className="min-w-0 rounded-control bg-sunken p-3">
                  <dt className="text-sm text-muted">{t('pricing:listedPrice')}</dt>
                  <dd className="font-semibold text-text"><bdi dir="ltr">{money.moneyExact(selected.data.baseline.price)}</bdi></dd>
                </div>
              </dl>
              <div className="space-y-2 border-s-2 border-primary ps-4" data-testid="price-baseline">
                <h3 className="font-semibold text-text">{t('pricing:baseline')}</h3>
                <p className="text-sm text-muted">{t('pricing:baselineInfo')}</p>
                <p className="text-xs text-muted">{t('pricing:noDate')}</p>
              </div>
              <section className="space-y-3" aria-label={t('pricing:approvedHistory')}>
                <h3 className="flex items-center gap-2 font-semibold text-text">
                  <LockKeyhole aria-hidden className="size-4" />
                  {t('pricing:approvedHistory')}
                </h3>
                <EmptyState title={t('pricing:none')} />
              </section>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
