import { INVENTORY_BUCKETS, type ConstructionUpdate, type InventoryRow, type ResidenceSummary } from '@repo/contracts';
import { ChartCard, cn, DirectionalIcon, dynamicT, IconButton, Link, Photo, PlotIllustration, ProgressRing, StackedBarList, useT, type StackSeries } from '@repo/ui';
import { ArrowRight, ChevronLeft, ChevronRight, Ruler } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { DashboardFormat } from './useDashboardFormat';

const SERIES_COLOR = {
  available: ['var(--color-ever-1)', 'dark'],
  onHold: ['var(--color-ever-2)', 'dark'],
  sold: ['var(--color-ever-3)', 'light'],
  handedOver: ['var(--color-ever-4)', 'light'],
} as const;

/** Units by building, stacked by lifecycle (ordinal evergreen ramp: darker = further along). */
export function InventoryCard({ rows, fmt, className }: { rows: InventoryRow[]; fmt: DashboardFormat; className?: string }) {
  const { t } = useT();
  const name = (r: InventoryRow) =>
    r.kind === 'tower' ? t('dashboard:inventory.tower', { name: r.label }) : t('dashboard:inventory.phase', { name: r.label.replace(/\D/g, '') });
  const series: StackSeries[] = INVENTORY_BUCKETS.map((b) => ({
    id: b,
    label: t(`dashboard:inventory.bucket.${b}`),
    color: SERIES_COLOR[b][0],
    ink: SERIES_COLOR[b][1],
  }));
  const total = (r: InventoryRow) => INVENTORY_BUCKETS.reduce((s, b) => s + r.counts[b], 0) + r.other;
  const available = rows.reduce((s, r) => s + r.counts.available, 0);
  const all = rows.reduce((s, r) => s + total(r), 0);
  const top = [...rows].sort((a, b) => b.counts.available - a.counts.available)[0];
  return (
    <ChartCard
      className={className}
      headingLevel={3}
      testId="inventory-chart"
      title={t('dashboard:inventory.title')}
      summary={t('dashboard:inventory.summary', { available: fmt.count(available), total: fmt.count(all), top: top ? name(top) : '' })}
      legend={series.map((s) => ({ id: s.id, label: s.label, color: s.color, shape: 'rect' as const }))}
      table={{
        caption: t('dashboard:inventory.caption'),
        columns: [
          { id: 'building', label: t('dashboard:inventory.building') },
          ...series.map((s) => ({ id: s.id, label: s.label, numeric: true })),
          { id: 'other', label: t('dashboard:inventory.other'), numeric: true },
          { id: 'total', label: t('dashboard:inventory.total'), numeric: true },
        ],
        rows: rows.map((r) => ({
          id: r.id,
          cells: [name(r), ...INVENTORY_BUCKETS.map((b) => fmt.count(r.counts[b])), fmt.count(r.other), fmt.count(total(r))],
        })),
      }}
    >
      {() => (
        <StackedBarList
          rows={rows.map((r) => ({ id: r.id, label: name(r), href: r.href, values: r.counts, extra: r.other }))}
          series={series}
          formatCount={fmt.count}
          totalLabel={t('dashboard:inventory.totalNote')}
          describeRow={(row) => {
            const r = rows.find((x) => x.id === row.id)!;
            return t('dashboard:inventory.row', {
              name: row.label,
              available: fmt.count(r.counts.available),
              onHold: fmt.count(r.counts.onHold),
              sold: fmt.count(r.counts.sold),
              handedOver: fmt.count(r.counts.handedOver),
              total: fmt.count(total(r)),
            });
          }}
        />
      )}
    </ChartCard>
  );
}

/** Latest site report: photo, headline, body, overall progress. */
export function ConstructionCard({ update, fmt, className }: { update: ConstructionUpdate; fmt: DashboardFormat; className?: string }) {
  const { t } = useT();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn('flex min-w-0 flex-col overflow-hidden rounded-card bg-panel shadow-card sm:flex-row', className)} data-testid="construction-card">
      <Photo imageKey={update.imageKey} sizes="(min-width: 640px) 320px, 100vw" className="aspect-[16/10] shrink-0 sm:aspect-auto sm:w-[42%]" labelPosition="top-start" />
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:p-6">
        <div>
          <p className="text-xs font-medium tracking-[0.08em] text-accent uppercase">{t('dashboard:construction.title')}</p>
          <h3 id={titleId} className="mt-2 font-display text-xl leading-snug text-text">
            {dynamicT(t)(`dashboard:${update.titleKey}`, update.params)}
          </h3>
          <p className="mt-1 text-xs text-muted">
            <bdi>{update.projectName}</bdi> · {t('dashboard:construction.eyebrow', { time: fmt.relative(update.at) })}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">{dynamicT(t)(`dashboard:${update.bodyKey}`, update.params)}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <ProgressRing value={update.progress} size={56} stroke={6} label={`${t('dashboard:construction.progress')}: ${fmt.percent(update.progress)}`}>
              <bdi dir="ltr" className="ltr-ref text-xs font-semibold text-text">
                {fmt.percent(update.progress)}
              </bdi>
            </ProgressRing>
            <span className="text-sm text-muted">{t('dashboard:construction.progress')}</span>
          </div>
          <Link href={update.href} variant="plain" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium whitespace-nowrap text-primary">
            {t('dashboard:construction.open')}
            <DirectionalIcon icon={ArrowRight} className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * Residence types as image-led cards in a horizontal rail (scroll-snap, swipe on touch, arrow
 * buttons on pointer devices). Each card is one link; the availability meter has a text twin.
 */
export function ResidencesRail({ residences, fmt }: { residences: ResidenceSummary[]; fmt: DashboardFormat }) {
  const { t } = useT();
  const titleId = useId();
  const scroller = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const pos = Math.abs(el.scrollLeft); // negative in RTL
      setEdges({ start: pos < 4, end: pos > max - 4 });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [residences.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const card = el.querySelector('li')?.getBoundingClientRect().width ?? 280;
    el.scrollBy({ left: dir * (card + 16) * (rtl ? -1 : 1), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce' ? 'auto' : 'smooth' });
  };

  return (
    <section aria-labelledby={titleId} className="min-w-0" data-testid="residences">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id={titleId} className="font-display text-xl text-text">
            {t('dashboard:residences.title')}
          </h3>
          <p className="mt-1 text-sm text-muted">{t('dashboard:residences.summary')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/backoffice/inv/unit-matrix" variant="plain" className="me-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary">
            {t('dashboard:residences.openMatrix')}
            <DirectionalIcon icon={ArrowRight} className="size-4" />
          </Link>
          <span className="hidden gap-1 sm:flex">
            <IconButton label={t('dashboard:residences.previous')} icon={ChevronLeft} iconClassName="rtl:-scale-x-100" isDisabled={edges.start} onPress={() => scrollBy(-1)} className="rounded-pill bg-panel shadow-card" />
            <IconButton label={t('dashboard:residences.next')} icon={ChevronRight} iconClassName="rtl:-scale-x-100" isDisabled={edges.end} onPress={() => scrollBy(1)} className="rounded-pill bg-panel shadow-card" />
          </span>
        </div>
      </div>
      <ul
        ref={scroller}
        aria-label={t('dashboard:residences.listLabel')}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-3 scrollbar-none sm:-mx-1 sm:scroll-px-1 sm:px-1"
      >
        {residences.map((r) => {
          const share = r.total ? r.available / r.total : 0;
          return (
            <li key={r.type} className="w-[16.5rem] shrink-0 snap-start sm:w-[17.5rem]">
              <Link
                href={r.href}
                variant="plain"
                className="group flex h-full flex-col overflow-hidden rounded-card bg-panel shadow-card transition-[box-shadow,translate] duration-[var(--motion-regular)] ease-[var(--ease-emphasized)] hover:-translate-y-0.5 hover:shadow-raised"
                data-testid="residence-card"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  {r.imageKey ? (
                    <Photo
                      imageKey={r.imageKey}
                      sizes="280px"
                      className="size-full"
                      imgClassName="transition-transform duration-[600ms] ease-[var(--ease-emphasized)] group-hover:scale-[1.04]"
                      decorative
                    />
                  ) : (
                    <PlotIllustration />
                  )}
                  <span className="absolute bottom-3 start-3 inline-flex max-w-[80%] items-center rounded-pill bg-[rgb(12_17_15/0.66)] px-2.5 py-0.5 text-[11px] font-medium text-inverse backdrop-blur-sm">
                    <bdi className="truncate">{r.projectName}</bdi>
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <h4 className="font-display text-lg leading-snug text-text">{t(`dashboard:residences.type.${r.type}`)}</h4>
                  <div>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-muted">{t('dashboard:residences.available', { available: fmt.count(r.available), total: fmt.count(r.total) })}</span>
                    </div>
                    <span aria-hidden className="block h-1.5 overflow-hidden rounded-pill bg-primary-soft">
                      <span className="block h-full rounded-pill bg-data-1" style={{ width: `${share * 100}%` }} />
                    </span>
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-2 border-t border-border pt-3">
                    <span>
                      <span className="block text-[11px] text-muted">{t('dashboard:residences.from')}</span>
                      <bdi dir="ltr" className="ltr-ref text-base font-semibold text-text">
                        {fmt.money(r.fromPrice.amount, 1)}
                      </bdi>
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <Ruler aria-hidden className="size-3.5" />
                      {t('dashboard:residences.avgArea', { area: fmt.area(r.avgArea) })}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
