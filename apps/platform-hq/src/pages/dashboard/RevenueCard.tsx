import type { HqOverview, Money } from '@repo/contracts';
import { ChartCard, ColumnTargetChart, useT, type ColumnTargetPoint } from '@repo/ui';
import { useHqFormat } from '../../lib/format';

/**
 * Platform billing (illustrative fixtures; platform finance is Gate G): collected columns against the
 * invoiced tick, with the data table twin and an always-written takeaway.
 */
export function RevenueCard({ months, outstanding, className }: { months: HqOverview['revenue']['months']; outstanding: Money; className?: string }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const data: ColumnTargetPoint[] = months.map((m) => ({
    id: m.month,
    label: fmt.monthShort(m.month),
    fullLabel: fmt.monthLong(m.month),
    value: Number(m.collected.amount),
    target: Number(m.invoiced.amount),
  }));
  const collected = data.reduce((s, p) => s + p.value, 0);
  const invoiced = data.reduce((s, p) => s + p.target, 0);
  const rate = (p: { value: number; target: number }) => fmt.percent(p.target ? p.value / p.target : 0);

  return (
    <ChartCard
      className={className}
      testId="hq-revenue"
      title={t('platform:dashboard.revenue.title')}
      summary={t('platform:dashboard.revenue.summary', {
        collected: fmt.moneyCompact(collected),
        invoiced: fmt.moneyCompact(invoiced),
        percent: fmt.percent(invoiced ? collected / invoiced : 0),
        outstanding: fmt.money(outstanding),
      })}
      legend={[
        { id: 'collected', label: t('platform:dashboard.revenue.collected'), color: 'var(--color-data-1)', shape: 'rect' },
        { id: 'invoiced', label: t('platform:dashboard.revenue.invoiced'), color: 'var(--color-text)', shape: 'line' },
      ]}
      table={{
        caption: t('platform:dashboard.revenue.caption'),
        columns: [
          { id: 'month', label: t('platform:dashboard.revenue.month') },
          { id: 'collected', label: t('platform:dashboard.revenue.collected'), numeric: true },
          { id: 'invoiced', label: t('platform:dashboard.revenue.invoiced'), numeric: true },
          { id: 'rate', label: t('platform:dashboard.revenue.rate'), numeric: true },
        ],
        rows: data.map((p) => ({
          id: p.id,
          cells: [
            p.fullLabel,
            <bdi key="c" dir="ltr" className="ltr-ref">
              {fmt.money(p.value)}
            </bdi>,
            <bdi key="i" dir="ltr" className="ltr-ref">
              {fmt.money(p.target)}
            </bdi>,
            <bdi key="r" dir="ltr" className="ltr-ref">
              {rate(p)}
            </bdi>,
          ],
        })),
      }}
    >
      {({ titleId, summaryId }) => (
        <ColumnTargetChart
          points={data}
          labelledBy={titleId}
          describedBy={summaryId}
          formatValue={(n) => fmt.moneyCompact(n)}
          formatTick={fmt.compact}
          valueLabel={t('platform:dashboard.revenue.collected')}
          targetLabel={t('platform:dashboard.revenue.invoiced')}
          describePoint={(p) => t('platform:dashboard.revenue.point', { month: p.fullLabel, collected: fmt.money(p.value), invoiced: fmt.money(p.target), percent: rate(p) })}
        />
      )}
    </ChartCard>
  );
}
