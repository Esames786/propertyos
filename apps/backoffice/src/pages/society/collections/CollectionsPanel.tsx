import type { CollectionsSummary, Money as MoneyValue } from '@repo/contracts';
import { cn, DirectionalIcon, Link, Money, StatTile, useT } from '@repo/ui';
import { ArrowRight, Banknote, CalendarClock, ChevronRight, FileCheck2, Hand, HandCoins, Hourglass, Landmark, PiggyBank, ReceiptText, TriangleAlert, Wallet } from 'lucide-react';
import { useId } from 'react';
import { COLLECTIONS, SOCIETY } from '../../../nav.config';
import { useSocietyFormat } from '../kit';
import { MethodBadge } from './ckit';

/** Bar lengths only (the amounts shown are the server's, in exact paisa). */
const size = (m: MoneyValue) => Number(m.amount);

/**
 * Collections at a glance (Gate C.2 reference experience 3): what was billed this month, what came
 * in, what waits for verification, what is owed and overdue, and where (aging, blocks, the bank).
 * Every figure is a link to the records it counts, already filtered; nothing is decorative.
 */
export function CollectionsPanel({ data, headingLevel = 2, testId = 'collections-panel' }: { data: CollectionsSummary; headingLevel?: 2 | 3; testId?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const titleId = useId();
  const H = `h${headingLevel}` as const;
  const period = data.period ? fmt.period(data.period) : '';
  const billed = size(data.billed.amount);
  const pct = (m: MoneyValue) => (billed > 0 ? Math.max(0, Math.min(100, (size(m) / billed) * 100)) : 0);
  const { progress } = data;

  return (
    <section aria-labelledby={titleId} className="space-y-5" data-testid={testId} data-tour-id="society-collections">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <H id={titleId} className="text-xl font-bold tracking-tight text-text sm:text-2xl">
            {t('collections:summary.title', { period })}
          </H>
          <p className="mt-0.5 text-sm text-muted">{t('collections:summary.subtitle')}</p>
        </div>
        <Link href={COLLECTIONS.dashboard} variant="plain" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary" data-testid="open-collections">
          {t('collections:summary.open')}
          <DirectionalIcon icon={ArrowRight} className="size-4" />
        </Link>
      </div>

      <div className="grid gap-4 @lg:grid-cols-2 @5xl:grid-cols-4">
        <StatTile
          testId="kpi-billed"
          icon={ReceiptText}
          hue="emerald"
          label={t('collections:summary.billed', { period })}
          value={data.billed.invoices ? fmt.compact(data.billed.amount) : t('collections:summary.notBilled')}
          accessibleValue={`${fmt.money(data.billed.amount)}, ${t('collections:summary.invoices', { count: data.billed.invoices })}`}
          context={t('collections:summary.invoices', { count: data.billed.invoices })}
          href={data.billed.href}
        />
        <StatTile
          testId="kpi-collected"
          icon={HandCoins}
          hue="teal"
          label={t('collections:summary.collected')}
          value={fmt.compact(data.collected.amount)}
          accessibleValue={`${fmt.money(data.collected.amount)}, ${t('collections:summary.payments', { count: data.collected.payments })}, ${t('collections:summary.rate', { rate: Math.round(data.rate * 100), period })}`}
          context={t('collections:summary.rate', { rate: Math.round(data.rate * 100), period })}
          href={data.collected.href}
        />
        <StatTile
          testId="kpi-pending"
          icon={Hourglass}
          hue="sky"
          label={t('collections:summary.pending')}
          value={fmt.compact(data.pending.amount)}
          accessibleValue={`${fmt.money(data.pending.amount)}, ${t('collections:summary.proofs', { count: data.pending.submissions })}`}
          context={t('collections:summary.proofs', { count: data.pending.submissions })}
          href={data.pending.href}
        />
        <StatTile
          testId="kpi-arrears"
          icon={TriangleAlert}
          hue="gold"
          label={t('collections:summary.arrears')}
          value={fmt.compact(data.arrears.amount)}
          accessibleValue={`${fmt.money(data.arrears.amount)}, ${t('collections:summary.accounts', { count: data.arrears.accounts })}`}
          context={t('collections:summary.arrearsContext', { count: data.arrears.accounts, outstanding: fmt.money(data.outstanding.amount) })}
          href={data.arrears.href}
        />
      </div>

      {/* Progress of the month: collected, waiting for verification, still owed (numbers beside the bar, never colour alone). */}
      {billed > 0 && (
        <div className="rounded-card bg-panel p-5 shadow-card sm:p-6" data-testid="collections-progress">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-text">{t('collections:summary.progressTitle', { period })}</p>
            <p className="text-sm text-muted">{t('collections:summary.progressOf', { rate: Math.round(data.rate * 100), billed: fmt.money(data.billed.amount) })}</p>
          </div>
          <div
            role="img"
            aria-label={t('collections:summary.progressAria', { collected: fmt.money(progress.collected), pending: fmt.money(progress.pending), owed: fmt.money(progress.owed) })}
            className="mt-3 flex h-3 overflow-hidden rounded-pill bg-sunken"
          >
            <span className="h-full bg-success" style={{ width: `${pct(progress.collected)}%` }} />
            <span className="h-full bg-info/70 [margin-inline-start:2px]" style={{ width: `${pct(progress.pending)}%` }} />
          </div>
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            <li>
              <Link href={data.collected.href} variant="plain" className="inline-flex min-h-9 items-center gap-2 rounded-pill border border-border px-3 font-medium text-text hover:bg-raised">
                <span aria-hidden className="size-2.5 rounded-pill bg-success" />
                {t('collections:summary.legendCollected')}
                <bdi dir="ltr" className="ltr-ref font-semibold">{fmt.money(progress.collected)}</bdi>
              </Link>
            </li>
            <li>
              <Link href={data.pending.href} variant="plain" className="inline-flex min-h-9 items-center gap-2 rounded-pill border border-border px-3 font-medium text-text hover:bg-raised">
                <span aria-hidden className="size-2.5 rounded-pill bg-info/70" />
                {t('collections:summary.legendPending')}
                <bdi dir="ltr" className="ltr-ref font-semibold">{fmt.money(progress.pending)}</bdi>
              </Link>
            </li>
            <li>
              <Link href={data.outstanding.href} variant="plain" className="inline-flex min-h-9 items-center gap-2 rounded-pill border border-border px-3 font-medium text-text hover:bg-raised">
                <span aria-hidden className="size-2.5 rounded-pill bg-sunken ring-1 ring-border-control" />
                {t('collections:summary.legendOwed')}
                <bdi dir="ltr" className="ltr-ref font-semibold">{fmt.money(progress.owed)}</bdi>
              </Link>
            </li>
            {size(data.credit.amount) > 0 && (
              <li>
                <Link href={data.credit.href} variant="plain" className="inline-flex min-h-9 items-center gap-2 rounded-pill border border-border px-3 font-medium text-text hover:bg-raised" data-testid="kpi-credit">
                  <PiggyBank aria-hidden className="size-3.5 text-info" />
                  {t('collections:summary.legendCredit', { count: data.credit.accounts })}
                  <bdi dir="ltr" className="ltr-ref font-semibold">{fmt.money(data.credit.amount)}</bdi>
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="grid gap-5 @5xl:grid-cols-12">
        <WorkQueue data={data} className="@5xl:col-span-5" />
        <Aging data={data} className="@5xl:col-span-7" />
      </div>

      <div className="grid gap-5 @5xl:grid-cols-12">
        <ByBuilding data={data} className="@5xl:col-span-7" />
        <Recent data={data} className="@5xl:col-span-5" />
      </div>
    </section>
  );
}

function WorkQueue({ data, className }: { data: CollectionsSummary; className?: string }) {
  const { t } = useT();
  const titleId = useId();
  const rows = [
    { id: 'review', icon: FileCheck2, label: t('collections:summary.queueReview', { count: data.queue.toReview }), href: data.queue.href, count: data.queue.toReview, urgent: data.queue.toReview > 0 },
    ...(data.queue.exceptions > 0
      ? [{ id: 'exceptions', icon: Hand, label: t('collections:summary.queueExceptions', { count: data.queue.exceptions }), href: COLLECTIONS.inbox('exception_pending'), count: data.queue.exceptions, urgent: true }]
      : []),
    ...(data.queue.awaitingBank > 0
      ? [{ id: 'awaiting', icon: CalendarClock, label: t('collections:summary.queueAwaitingBank', { count: data.queue.awaitingBank }), href: COLLECTIONS.inbox('awaiting_bank_evidence'), count: data.queue.awaitingBank, urgent: false }]
      : []),
    { id: 'info', icon: Hourglass, label: t('collections:summary.queueInfo', { count: data.queue.needsInformation }), href: COLLECTIONS.inbox('needs_information'), count: data.queue.needsInformation, urgent: false },
    ...(data.bank.href
      ? [
          { id: 'bank', icon: Landmark, label: t('collections:summary.bankUnmatched', { count: data.bank.unmatched }), href: data.bank.href, count: data.bank.unmatched, urgent: false },
          { id: 'unidentified', icon: TriangleAlert, label: t('collections:summary.bankUnidentified', { count: data.bank.unidentified }), href: COLLECTIONS.bankFeed('unidentified'), count: data.bank.unidentified, urgent: data.bank.unidentified > 0 },
        ]
      : []),
  ];
  return (
    <section aria-labelledby={titleId} className={cn('flex min-w-0 flex-col rounded-card bg-panel p-5 shadow-card sm:p-6', className)} data-testid="collections-queue">
      <h3 id={titleId} className="text-lg font-bold tracking-tight text-text">{t('collections:summary.queueTitle')}</h3>
      <p className="mt-0.5 text-sm text-muted">{t('collections:summary.queueSubtitle')}</p>
      <ul className="-mx-2 mt-3 divide-y divide-border">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <li key={r.id}>
              <Link href={r.href} variant="plain" className="flex items-center gap-3 rounded-control px-2 py-3 hover:bg-raised" data-testid={`queue-${r.id}`} data-count={r.count}>
                <span aria-hidden className={cn('grid size-10 shrink-0 place-items-center rounded-pill', r.urgent ? 'bg-warning-soft text-warning' : 'bg-sunken text-muted')}>
                  <Icon className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-text">{r.label}</span>
                <DirectionalIcon icon={ChevronRight} className="size-4 shrink-0 text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
      {data.queue.toReview > 0 && (
        <Link href={data.queue.reviewHref} variant="plain" className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-4 pt-0 text-sm font-semibold text-on-primary hover:bg-primary-hover" data-testid="queue-start">
          {t('collections:summary.startReview')}
          <DirectionalIcon icon={ArrowRight} className="size-4" />
        </Link>
      )}
    </section>
  );
}

function Aging({ data, className }: { data: CollectionsSummary; className?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const titleId = useId();
  const max = Math.max(1, ...data.aging.map((b) => size(b.amount)));
  return (
    <section aria-labelledby={titleId} className={cn('min-w-0 rounded-card bg-panel p-5 shadow-card sm:p-6', className)} data-testid="collections-aging">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={titleId} className="text-lg font-bold tracking-tight text-text">{t('collections:summary.agingTitle')}</h3>
          <p className="mt-0.5 text-sm text-muted">{t('collections:summary.agingSubtitle')}</p>
        </div>
        <Link href={COLLECTIONS.aging()} variant="plain" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary">
          {t('collections:summary.agingOpen')}
          <DirectionalIcon icon={ArrowRight} className="size-4" />
        </Link>
      </div>
      <ul className="mt-4 space-y-1">
        {data.aging.map((b) => (
          <li key={b.key}>
            <Link href={b.href} variant="plain" className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-control px-2 py-2 hover:bg-raised" data-testid="aging-bucket" data-bucket={b.key}>
              <span className="text-sm text-text">{t(`collections:aging.${b.key}`)}</span>
              <span aria-hidden className="h-2 overflow-hidden rounded-pill bg-sunken">
                <span className="block h-full rounded-pill bg-primary/80" style={{ width: `${(size(b.amount) / max) * 100}%` }} />
              </span>
              <span className="text-end text-sm">
                <bdi dir="ltr" className="ltr-ref font-semibold text-text">{fmt.money(b.amount)}</bdi>
                <span className="block text-xs text-muted">{t('collections:summary.accounts', { count: b.accounts })}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ByBuilding({ data, className }: { data: CollectionsSummary; className?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn('min-w-0 rounded-card bg-panel p-5 shadow-card sm:p-6', className)} data-testid="collections-buildings">
      <h3 id={titleId} className="text-lg font-bold tracking-tight text-text">{t('collections:summary.buildingsTitle')}</h3>
      <p className="mt-0.5 text-sm text-muted">{t('collections:summary.buildingsSubtitle')}</p>
      <ul className="mt-4 grid gap-3 @md:grid-cols-2">
        {data.byBuilding.map((b) => (
          <li key={b.id}>
            <Link href={b.href} variant="plain" className="flex h-full flex-col gap-3 rounded-tile border border-border p-4 hover:bg-raised" data-testid="collections-building" data-building={b.code}>
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold text-text">{b.name}</span>
                <span className="text-sm font-semibold text-text">{t('collections:summary.buildingRate', { rate: Math.round(b.rate * 100) })}</span>
              </span>
              <span aria-hidden className="h-2 overflow-hidden rounded-pill bg-sunken">
                <span className="block h-full rounded-pill bg-success" style={{ width: `${Math.round(b.rate * 100)}%` }} />
              </span>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted">{t('collections:summary.buildingBilled')}</dt>
                  <dd className="mt-0.5 font-semibold text-text"><bdi dir="ltr" className="ltr-ref">{fmt.compact(b.billed)}</bdi></dd>
                </div>
                <div>
                  <dt className="text-muted">{t('collections:summary.buildingCollected')}</dt>
                  <dd className="mt-0.5 font-semibold text-text"><bdi dir="ltr" className="ltr-ref">{fmt.compact(b.collected)}</bdi></dd>
                </div>
                <div>
                  <dt className="text-muted">{t('collections:summary.buildingOwed')}</dt>
                  <dd className="mt-0.5 font-semibold text-text"><bdi dir="ltr" className="ltr-ref">{fmt.compact(b.outstanding)}</bdi></dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Recent({ data, className }: { data: CollectionsSummary; className?: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn('flex min-w-0 flex-col rounded-card bg-panel p-5 shadow-card sm:p-6', className)} data-testid="collections-recent">
      <h3 id={titleId} className="text-lg font-bold tracking-tight text-text">{t('collections:summary.recentTitle')}</h3>
      {data.recent.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('collections:summary.recentEmpty')}</p>
      ) : (
        <ul className="-mx-2 mt-3 divide-y divide-border">
          {data.recent.map((p) => (
            <li key={p.id}>
              <Link href={COLLECTIONS.payment(p.id)} variant="plain" className="flex items-center gap-3 rounded-control px-2 py-2.5 hover:bg-raised" data-testid="recent-payment">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text"><bdi>{p.payerName}</bdi></span>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr" className="ltr-ref">{p.flats.join(', ') || p.accountNo}</bdi> · {fmt.date(p.receivedOn)}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <Money value={p.amount} className="text-sm font-semibold" />
                  <MethodBadge method={p.method} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={COLLECTIONS.payments()} variant="plain" className="mt-auto inline-flex min-h-10 items-center gap-1.5 pt-3 text-sm font-medium text-primary">
        <Wallet aria-hidden className="size-4" />
        {t('collections:summary.allPayments', { count: data.collected.payments })}
      </Link>
      <Link href={SOCIETY.accounts('owing')} variant="plain" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary">
        <Banknote aria-hidden className="size-4" />
        {t('collections:summary.owingAccounts', { count: data.outstanding.accounts, amount: fmt.money(data.outstanding.amount) })}
      </Link>
    </section>
  );
}
