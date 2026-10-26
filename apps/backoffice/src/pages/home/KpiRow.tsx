import type { DashboardKpi, DashboardRange, KpiId } from '@repo/contracts';
import { AnimatedNumber, StatTile, useT, type StatDelta } from '@repo/ui';
import { HandCoins, KeyRound, ReceiptText, ShieldCheck, Target, TrendingUp, Wallet } from 'lucide-react';
import type { DashboardFormat } from './useDashboardFormat';

const ICON: Record<KpiId, typeof Wallet> = {
  salesBooked: HandCoins,
  collected: Wallet,
  available: KeyRound,
  conversion: Target,
  pipeline: TrendingUp,
  receivables: ReceiptText,
  verifications: ShieldCheck,
};

const MINUS = '−';

/** Headline figures for the role, each with its change against the comparison period. */
export function KpiRow({ kpis, range, fmt }: { kpis: DashboardKpi[]; range: DashboardRange; fmt: DashboardFormat }) {
  const { t } = useT();
  const previousPeriod = t(`dashboard:range.previous.${range}`);

  const display = (k: DashboardKpi, n: number) =>
    k.format === 'money' ? fmt.money(n) : k.format === 'percent' ? fmt.percent(n, 1) : fmt.count(Math.round(n));

  const delta = (k: DashboardKpi): StatDelta | undefined => {
    if (k.previous === null) return undefined;
    const value = Number(k.value);
    const previous = Number(k.previous);
    const diff = value - previous;
    const direction = Math.abs(diff) < 1e-9 ? 'flat' : diff > 0 ? 'up' : 'down';
    const sign = direction === 'up' ? '+' : direction === 'down' ? MINUS : '';
    let change: string;
    if (k.format === 'percent') change = t('dashboard:kpi.points', { value: `${sign}${fmt.count(Math.round(Math.abs(diff) * 1000) / 10)}` });
    else if (k.format === 'count') change = `${sign}${fmt.count(Math.abs(diff))}`;
    else change = `${sign}${fmt.percent(previous ? Math.abs(diff) / previous : 0, 1)}`;
    const good = direction === 'flat' ? null : (direction === 'up') === (k.better === 'up');
    return {
      text: change,
      description: t(`dashboard:kpi.delta.${direction}`, { change: change.replace(/^[+−]/, ''), previous: previousPeriod }),
      direction,
      tone: good === null ? 'neutral' : good ? 'positive' : 'negative',
    };
  };

  const context = (k: DashboardKpi) => {
    switch (k.id) {
      case 'collected':
        return t('dashboard:kpi.context.collected', {
          percent: fmt.percent(Number(k.value) / Number(k.reference!.value)),
          target: fmt.money(k.reference!.value),
        });
      case 'available':
        return t('dashboard:kpi.context.available', { total: fmt.count(Number(k.reference!.value)) });
      case 'conversion':
        return t('dashboard:kpi.context.conversion');
      case 'pipeline':
        return t('dashboard:kpi.context.pipeline', { count: Number(k.reference!.value) });
      case 'verifications':
        return t('dashboard:kpi.context.verifications');
      default:
        return k.previous ? t('dashboard:kpi.context.previous', { value: display(k, Number(k.previous)) }) : undefined;
    }
  };

  return (
    <ul aria-label={t('dashboard:kpi.label')} className="grid grid-cols-1 gap-4 min-[30rem]:grid-cols-2 xl:grid-cols-4" data-testid="kpi-row">
      {kpis.map((k) => (
        <li key={k.id} className="flex min-w-0">
          <StatTile
            label={t(`dashboard:kpi.${k.id}`)}
            value={
              <bdi dir="ltr" className="ltr-ref">
                <AnimatedNumber value={Number(k.value)} format={(n) => display(k, n)} />
              </bdi>
            }
            accessibleValue={display(k, Number(k.value))}
            delta={delta(k)}
            context={context(k)}
            trend={k.trend}
            href={k.href}
            icon={ICON[k.id]}
            testId={`kpi-${k.id}`}
          />
        </li>
      ))}
    </ul>
  );
}
