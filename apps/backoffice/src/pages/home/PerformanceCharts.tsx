import type { CollectionsPoint, DashboardRange, FunnelStage } from '@repo/contracts';
import { ChartCard, ColumnTargetChart, FunnelChart, useT, type ColumnTargetPoint } from '@repo/ui';
import type { DashboardFormat } from './useDashboardFormat';

/** Collections against schedule: bullet columns (collected) with a target tick (scheduled). */
export function CollectionsCard({ points, range, fmt, className }: { points: CollectionsPoint[]; range: DashboardRange; fmt: DashboardFormat; className?: string }) {
  const { t } = useT();
  const collected = points.reduce((s, p) => s + Number(p.collected), 0);
  const scheduled = points.reduce((s, p) => s + Number(p.scheduled), 0);
  const partial = points.find((p) => p.partial);
  const data: ColumnTargetPoint[] = points.map((p) => ({
    id: p.period,
    label: fmt.monthShort(p.period),
    fullLabel: p.partial ? t('dashboard:collections.toDate', { month: fmt.monthLong(p.period) }) : fmt.monthLong(p.period),
    value: Number(p.collected),
    target: Number(p.scheduled),
  }));
  const rate = (p: { value: number; target: number }) => fmt.percent(p.target ? p.value / p.target : 0);

  return (
    <ChartCard
      className={className}
      headingLevel={3}
      testId="collections-chart"
      title={t('dashboard:collections.title')}
      summary={
        <>
          {t('dashboard:collections.summary', {
            collected: fmt.money(collected),
            scheduled: fmt.money(scheduled),
            percent: fmt.percent(scheduled ? collected / scheduled : 0),
            period: t(`dashboard:range.period.${range}`),
          })}{' '}
          {partial && t('dashboard:collections.partialNote', { month: fmt.monthLong(partial.period) })}
        </>
      }
      legend={[
        { id: 'collected', label: t('dashboard:collections.collected'), color: 'var(--color-data-1)', shape: 'rect' },
        { id: 'scheduled', label: t('dashboard:collections.scheduled'), color: 'var(--color-text)', shape: 'line' },
      ]}
      table={{
        caption: t('dashboard:collections.caption'),
        columns: [
          { id: 'month', label: t('dashboard:collections.month') },
          { id: 'collected', label: t('dashboard:collections.collected'), numeric: true },
          { id: 'scheduled', label: t('dashboard:collections.scheduled'), numeric: true },
          { id: 'rate', label: t('dashboard:collections.rate'), numeric: true },
        ],
        rows: data.map((p) => ({
          id: p.id,
          cells: [
            p.fullLabel,
            <bdi key="c" dir="ltr" className="ltr-ref">
              {fmt.moneyExact(p.value)}
            </bdi>,
            <bdi key="s" dir="ltr" className="ltr-ref">
              {fmt.moneyExact(p.target)}
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
          formatValue={(n) => fmt.money(n, 1)}
          formatTick={fmt.tick}
          valueLabel={t('dashboard:collections.collected')}
          targetLabel={t('dashboard:collections.scheduled')}
          describePoint={(p) =>
            t('dashboard:collections.point', { month: p.fullLabel, collected: fmt.money(p.value, 1), scheduled: fmt.money(p.target, 1), percent: rate(p) })
          }
        />
      )}
    </ChartCard>
  );
}

/** Lead funnel for the period: ordinal bronze ramp, every stage directly labelled. */
export function FunnelCard({
  funnel,
  range,
  fmt,
  className,
}: {
  funnel: Array<{ stage: FunnelStage; count: number }>;
  range: DashboardRange;
  fmt: DashboardFormat;
  className?: string;
}) {
  const { t } = useT();
  const first = funnel[0]?.count ?? 0;
  const last = funnel[funnel.length - 1]?.count ?? 0;
  return (
    <ChartCard
      className={className}
      headingLevel={3}
      testId="funnel-chart"
      title={t('dashboard:funnel.title')}
      summary={t('dashboard:funnel.summary', {
        booked: fmt.count(last),
        enquiries: fmt.count(first),
        percent: fmt.percent(first ? last / first : 0, 1),
        period: t(`dashboard:range.period.${range}`),
      })}
      table={{
        caption: t('dashboard:funnel.caption'),
        columns: [
          { id: 'stage', label: t('dashboard:funnel.stageHeader') },
          { id: 'count', label: t('dashboard:funnel.count'), numeric: true },
          { id: 'from', label: t('dashboard:funnel.fromPrevious'), numeric: true },
        ],
        rows: funnel.map((f, i) => ({
          id: f.stage,
          cells: [
            t(`dashboard:funnel.stage.${f.stage}`),
            <bdi key="c" dir="ltr" className="ltr-ref">
              {fmt.count(f.count)}
            </bdi>,
            i === 0 ? '—' : (
              <bdi key="p" dir="ltr" className="ltr-ref">
                {fmt.percent(funnel[i - 1]!.count ? f.count / funnel[i - 1]!.count : 0)}
              </bdi>
            ),
          ],
        })),
      }}
    >
      {() => (
        <FunnelChart
          steps={funnel.map((f) => ({ id: f.stage, label: t(`dashboard:funnel.stage.${f.stage}`), value: f.count }))}
          formatCount={fmt.count}
          formatPercent={(r) => fmt.percent(r)}
          conversionLabel={(percent) => t('dashboard:funnel.conversion', { percent })}
        />
      )}
    </ChartCard>
  );
}
