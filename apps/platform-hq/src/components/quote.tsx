import type { ApprovalCheck, QuoteLine, QuotePeriod, QuotePreview } from '@repo/contracts';
import { Badge, cn, dynamicT, InlineAlert, Skeleton, useT } from '@repo/ui';
import { CalendarRange, CheckCircle2, FileClock, Hourglass, Repeat2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useHqFormat, type HqFormat } from '../lib/format';
import { componentName, dimensionLabel, moduleName } from '../lib/labels';

type T = ReturnType<typeof useT>['t'];

/** The line's name: the module for add-ons, otherwise the component type (with its unit basis). */
export function lineName(t: T, l: Pick<QuoteLine, 'type' | 'module' | 'dimension'>) {
  if (l.module) return t('platform:quote.moduleAddOn', { module: moduleName(t, l.module) });
  if ((l.type === 'PER_UNIT' || l.type === 'TIERED') && l.dimension) return t(`platform:components.${l.type}.withBasis`, { basis: dimensionLabel(t, l.dimension) });
  return componentName(t, l.type);
}

/** One sentence that explains how the line was priced (A3 §8). */
export function explainLine(t: T, fmt: HqFormat, l: QuoteLine): string {
  const parts: string[] = [];
  const qty = Number(l.quantity);
  if (l.type === 'TRIAL') return t('platform:quote.explain.trial', { days: fmt.count(qty) });
  if (l.type === 'FREE') return t('platform:quote.explain.free');
  if (l.bands?.length) parts.push(l.bands.map((b) => t('platform:quote.explain.band', { quantity: fmt.count(b.quantity), price: fmt.money(b.unitPrice) })).join(' + '));
  else if (l.type === 'USAGE' && l.unitPrice)
    parts.push(t('platform:quote.explain.usage', { used: fmt.count(qty), allowance: fmt.count(l.allowance ?? 0), billable: fmt.count(Math.max(0, qty - (l.allowance ?? 0))), price: fmt.money(l.unitPrice) }));
  else if (l.unitPrice) parts.push(t('platform:quote.explain.qtyPrice', { quantity: fmt.count(qty), price: fmt.money(l.unitPrice) }));
  if (l.proration) parts.push(t('platform:quote.explain.prorated', { days: l.proration.days, of: l.proration.ofDays }));
  if (Number(l.discount.amount) > 0) parts.push(t('platform:quote.explain.discount', { amount: fmt.money(l.discount) }));
  if (Number(l.tax.amount) !== 0) parts.push(t('platform:quote.explain.tax', { amount: fmt.money(l.tax) }));
  return parts.join(' · ');
}

const figure = 'text-[1.4rem] leading-tight font-bold text-text tabular [overflow-wrap:anywhere] @2xl:text-[1.6rem] @4xl:text-[1.85rem]';

/** The three numbers everyone asks for: first invoice, a typical month, the first year. */
export function QuoteTotals({ quote, className, compact = false }: { quote: QuotePreview; className?: string; compact?: boolean }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const tiles: Array<{ id: string; icon: typeof CalendarRange; label: string; value: string; note: string }> = [
    {
      id: 'first',
      icon: CalendarRange,
      label: t('platform:quote.firstPeriod'),
      value: fmt.money(quote.firstPeriod.total),
      note: t('platform:quote.periodRange', { from: fmt.date(quote.firstPeriod.start), to: fmt.date(dayBefore(quote.firstPeriod.end)) }),
    },
    {
      id: 'regular',
      icon: Repeat2,
      label: t('platform:quote.regularPeriod'),
      value: fmt.money(quote.regularPeriod.total),
      note: t('platform:quote.regularNote', { month: fmt.monthLong(quote.regularPeriod.start) }),
    },
    {
      id: 'year',
      icon: Hourglass,
      label: t('platform:quote.firstYear'),
      value: fmt.money(quote.firstYearValue),
      note: t('platform:quote.firstYearNote'),
    },
  ];
  return (
    <div className={cn('@container', className)}>
    <dl className={cn('grid gap-3', compact ? 'grid-cols-1' : '@xl:grid-cols-3')} data-testid="quote-totals">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <div key={tile.id} className="rounded-tile border border-border/70 bg-raised p-4" data-testid={`quote-${tile.id}`}>
            <dt className="flex items-center gap-1.5 text-sm font-medium text-muted">
              <Icon aria-hidden className="size-4" />
              {tile.label}
            </dt>
            <dd className={cn(figure, 'mt-1')}>
              <bdi dir="ltr">{tile.value}</bdi>
            </dd>
            <dd className="mt-0.5 text-xs text-muted">{tile.note}</dd>
          </div>
        );
      })}
    </dl>
    </div>
  );
}

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Where the quantities came from: declared estimates before go-live, snapshots afterwards (A3 §4). */
export function QuantitySources({ quote }: { quote: QuotePreview }) {
  const { t } = useT();
  const fmt = useHqFormat();
  if (quote.quantities.length === 0) return null;
  return (
    <p className="text-sm text-muted" data-testid="quote-quantities">
      {t(`platform:quote.source.${quote.quantities[0]!.source}`)}{' '}
      {quote.quantities.map((q, i) => (
        <span key={q.dimension}>
          {i > 0 && ' · '}
          {dimensionLabel(t, q.dimension)}: <bdi className="font-semibold text-text tabular">{fmt.count(q.value)}</bdi>
        </span>
      ))}
    </p>
  );
}

/**
 * One billing period, line by line. Desktop: a table in a labelled, keyboard-scrollable region;
 * phones: one card per line. Every amount is exact; every line says how it was priced.
 */
export function QuoteBreakdown({ period, title, testId }: { period: QuotePeriod; title: string; testId?: string }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const range = t('platform:quote.periodRange', { from: fmt.date(period.start), to: fmt.date(dayBefore(period.end)) });
  const money = (m: { amount: string }) => <bdi dir="ltr">{fmt.money(m.amount)}</bdi>;
  const adjustments = period.adjustments.map((a, i) => ({ id: `adj-${i}`, label: t(`platform:quote.adjustment.${a.kind}`), amount: a.amount, tax: a.tax }));
  return (
    <section aria-label={`${title}, ${range}`} data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-text">{title}</h3>
        <p className="text-sm text-muted">{range}</p>
      </div>

      <div role="region" aria-label={t('platform:quote.tableLabel', { period: title })} tabIndex={0} className="mt-3 hidden overflow-x-auto rounded-tile border border-border/70 outline-none focus-visible:outline-2 focus-visible:outline-focus md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{`${title}, ${range}`}</caption>
          <thead className="bg-sunken/60 text-start text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-semibold">{t('platform:quote.col.component')}</th>
              <th scope="col" className="px-3 py-2 text-end font-semibold">{t('platform:quote.col.gross')}</th>
              <th scope="col" className="px-3 py-2 text-end font-semibold">{t('platform:quote.col.discount')}</th>
              <th scope="col" className="px-3 py-2 text-end font-semibold">{t('platform:quote.col.tax')}</th>
              <th scope="col" className="px-3 py-2 text-end font-semibold">{t('platform:quote.col.total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {period.lines.map((l) => (
              <tr key={l.componentId} data-testid={`quote-line-${l.componentId}`}>
                <th scope="row" className="px-3 py-2.5 text-start font-normal">
                  <span className="block font-semibold text-text">{lineName(t, l)}</span>
                  <span className="block text-xs text-muted">{explainLine(t, fmt, l)}</span>
                </th>
                <td className="px-3 py-2.5 text-end tabular">{money(l.gross)}</td>
                <td className="px-3 py-2.5 text-end tabular">{Number(l.discount.amount) ? <>−{money(l.discount)}</> : '—'}</td>
                <td className="px-3 py-2.5 text-end tabular">{Number(l.tax.amount) ? money(l.tax) : '—'}</td>
                <td className="px-3 py-2.5 text-end font-semibold tabular">{money(l.total)}</td>
              </tr>
            ))}
            {adjustments.map((a) => (
              <tr key={a.id}>
                <th scope="row" className="px-3 py-2.5 text-start font-semibold text-text">{a.label}</th>
                <td className="px-3 py-2.5 text-end tabular">{money(a.amount)}</td>
                <td className="px-3 py-2.5 text-end">—</td>
                <td className="px-3 py-2.5 text-end tabular">{Number(a.tax.amount) ? money(a.tax) : '—'}</td>
                <td className="px-3 py-2.5 text-end font-semibold tabular"><bdi dir="ltr">{fmt.money((Number(a.amount.amount) + Number(a.tax.amount)).toFixed(2))}</bdi></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-border">
            <tr>
              <th scope="row" className="px-3 py-3 text-start text-base font-bold text-text">{t('platform:quote.total')}</th>
              <td className="px-3 py-3 text-end tabular">{money(period.subtotal)}</td>
              <td className="px-3 py-3 text-end tabular">{Number(period.discounts.amount) ? <>−{money(period.discounts)}</> : '—'}</td>
              <td className="px-3 py-3 text-end tabular">{Number(period.tax.amount) ? money(period.tax) : '—'}</td>
              <td className="px-3 py-3 text-end text-base font-bold tabular" data-testid={testId ? `${testId}-total` : undefined}>{money(period.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <ul className="mt-3 space-y-2 md:hidden">
        {period.lines.map((l) => (
          <li key={l.componentId} className="rounded-tile border border-border/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold text-text">{lineName(t, l)}</span>
              <span className="shrink-0 font-semibold tabular">{money(l.total)}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted">{explainLine(t, fmt, l)}</p>
          </li>
        ))}
        {adjustments.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 rounded-tile border border-border/70 p-3">
            <span className="font-semibold text-text">{a.label}</span>
            <span className="shrink-0 font-semibold tabular">{money(a.amount)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 rounded-tile bg-sunken/70 p-3">
          <span className="font-bold text-text">{t('platform:quote.total')}</span>
          <span className="text-lg font-bold tabular">{money(period.total)}</span>
        </li>
      </ul>
    </section>
  );
}

/** Commercial policy outcome (D-14): each tripped rule in plain language, or "within policy". */
export function ApprovalNotice({ approval, footer, className }: { approval: ApprovalCheck; footer?: ReactNode; className?: string }) {
  const { t } = useT();
  if (!approval.required) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-success', className)} data-testid="approval-ok">
        <CheckCircle2 aria-hidden className="size-4 shrink-0" />
        <span>{t('platform:approval.withinPolicy')}</span>
      </div>
    );
  }
  return (
    <InlineAlert tone="warning" title={t('platform:approval.requiredTitle')} className={className}>
      <div data-testid="approval-required">
        <p>{t('platform:approval.requiredBody')}</p>
        <ul className="mt-2 list-disc space-y-1 ps-5">
          {approval.reasons.map((r, i) => (
            <li key={`${r.rule}-${i}`} data-testid={`approval-reason-${r.rule}`}>
              {dynamicT(t)(`platform:approval.rules.${r.rule}`, r.params)}
            </li>
          ))}
        </ul>
        {footer}
      </div>
    </InlineAlert>
  );
}

/** Small status chip for a quote's approval outcome. */
/**
 * Below xl the full live-price panel would sit under the form, out of sight while prices are edited.
 * This compact bar stays pinned under the header instead; at xl the panel beside the form takes over.
 */
export function LivePriceBar({ quote, loading, action, testId }: { quote: QuotePreview | undefined; loading: boolean; action?: ReactNode; testId: string }) {
  const { t } = useT();
  const fmt = useHqFormat();
  return (
    <div className="sticky top-20 z-20 mb-4 xl:hidden" data-testid={testId}>
      <section
        aria-label={t('platform:wizard.liveQuote')}
        className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-tile border border-border bg-panel/95 px-4 py-2.5 shadow-card backdrop-blur-md"
      >
        {!quote ? (
          <Skeleton className="h-10 w-full rounded-tile" />
        ) : (
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5" aria-live="polite" aria-busy={loading}>
            <div>
              <dt className="text-xs text-muted">{t('platform:quote.firstPeriod')}</dt>
              <dd className="font-bold text-text tabular" data-testid={`${testId}-first`}>
                <bdi dir="ltr">{fmt.money(quote.firstPeriod.total)}</bdi>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t('platform:quote.regularPeriod')}</dt>
              <dd className="font-bold text-text tabular" data-testid={`${testId}-regular`}>
                <bdi dir="ltr">{fmt.money(quote.regularPeriod.total)}</bdi>
              </dd>
            </div>
            <div>
              <dt className="sr-only">{t('platform:approval.title')}</dt>
              <dd>
                <ApprovalBadge approval={quote.approval} />
              </dd>
            </div>
          </dl>
        )}
        {action && <div className="ms-auto">{action}</div>}
      </section>
    </div>
  );
}

export function ApprovalBadge({ approval }: { approval: ApprovalCheck }) {
  const { t } = useT();
  return approval.required ? (
    <Badge tone="warning" icon={FileClock}>{t('platform:approval.badgeRequired')}</Badge>
  ) : (
    <Badge tone="success" icon={CheckCircle2}>{t('platform:approval.badgeOk')}</Badge>
  );
}
