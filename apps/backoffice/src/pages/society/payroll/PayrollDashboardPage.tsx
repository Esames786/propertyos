import type { PayDashboard } from '@repo/contracts';
import { EmptyState, ErrorState, InlineAlert, Link, Money, PageHeader, Panel, StatTile, useApiQuery, useT } from '@repo/ui';
import { BadgeCheck, CalendarRange, CircleDashed, ClipboardCheck, HandCoins, Send, TriangleAlert, UsersRound } from 'lucide-react';
import { PAYROLL } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { LinkButton, unbroken } from '../hr/hkit';
import { Boundary, PayNav, PeriodBadge, RunBadge } from './pkit';

/**
 * PAY-001 payroll dashboard: the current period and run, what is owed (approved obligations), what
 * is instructed, and what can be verified as paid ("not available": no settlement evidence exists in
 * this gate). Every figure opens the records behind it; nothing is decorative or invented.
 */
export default function PayrollDashboardPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<PayDashboard>({ method: 'GET', path: '/payroll/dashboard' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  const k = d.kpis;
  const runHref = d.run ? PAYROLL.run(d.run.id) : PAYROLL.periods();
  return (
    <div className="@container space-y-6" data-testid="pay-dashboard">
      <PageHeader
        title={t('payroll:dashboard.title')}
        description={t('payroll:dashboard.intro', { entity: d.legalEntityName })}
        actions={
          d.run ? (
            <LinkButton variant="primary" icon={ClipboardCheck} href={runHref} testId="pay-open-run">
              {t('payroll:dashboard.openRun')}
            </LinkButton>
          ) : undefined
        }
      />
      <PayNav current="dashboard" />
      {d.scopeLimited && (
        <InlineAlert tone="info" data-testid="pay-dashboard-limited">
          {t('payroll:scopeLimited')}
        </InlineAlert>
      )}
      <Boundary />
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
        <StatTile label={t('payroll:dashboard.kpi.staffInRun')} value={fmt.count(k.staffInRun)} accessibleValue={String(k.staffInRun)} href={runHref} icon={UsersRound} hue="emerald" testId="pay-kpi-staffInRun" />
        <StatTile label={t('payroll:dashboard.kpi.blockedLines')} value={fmt.count(k.blockedLines)} accessibleValue={String(k.blockedLines)} href={d.run ? PAYROLL.run(d.run.id, 'blocked') : PAYROLL.periods()} icon={TriangleAlert} hue="amber" testId="pay-kpi-blockedLines" />
        <StatTile label={t('payroll:dashboard.kpi.awaitingMe')} value={fmt.count(k.awaitingMe)} accessibleValue={String(k.awaitingMe)} href={d.canApprove ? PAYROLL.finalisation() : runHref} icon={ClipboardCheck} hue="violet" testId="pay-kpi-awaitingMe" />
        <StatTile label={t('payroll:dashboard.kpi.approvedObligation')} value={fmt.compact(k.approvedObligation)} accessibleValue={fmt.money(k.approvedObligation)} context={fmt.money(k.approvedObligation)} href={PAYROLL.accounting()} icon={HandCoins} hue="sky" testId="pay-kpi-approvedObligation" />
        <StatTile label={t('payroll:dashboard.kpi.instructed')} value={fmt.compact(k.instructed)} accessibleValue={fmt.money(k.instructed)} context={fmt.money(k.instructed)} href={PAYROLL.disbursement()} icon={Send} hue="slate" testId="pay-kpi-instructed" />
        <StatTile
          label={t('payroll:dashboard.kpi.settledVerified')}
          value="—"
          accessibleValue={`${t('payroll:dashboard.notAvailable')}. ${t('payroll:dashboard.notAvailableHint')}`}
          context={`${t('payroll:dashboard.notAvailable')}. ${t('payroll:dashboard.notAvailableHint')}`}
          href={PAYROLL.disbursement()}
          icon={CircleDashed}
          hue="rose"
          testId="pay-kpi-settledVerified"
        />
      </div>
      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title={t('payroll:dashboard.currentTitle')}>
          {!d.period ? (
            <EmptyState title={t('payroll:dashboard.noPeriod')} />
          ) : (
            <div className="space-y-3 text-sm" data-testid="pay-current">
              <p className="flex flex-wrap items-center gap-2">
                <CalendarRange aria-hidden className="size-4 text-muted" />
                <span className="font-semibold text-text">{fmt.period(d.period.month)}</span>
                <bdi dir="ltr" className="text-muted">
                  {unbroken(d.period.ref)}
                </bdi>
                <PeriodBadge state={d.period.state} />
              </p>
              {d.run ? (
                <div className="space-y-1.5 rounded-tile border border-border/70 p-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link href={PAYROLL.run(d.run.id)} className="font-medium">
                      <bdi dir="ltr">{unbroken(d.run.ref)}</bdi> · {t('payroll:run.version', { version: d.run.version })}
                    </Link>
                    <RunBadge state={d.run.state} />
                  </p>
                  <p className="text-muted">
                    {t('payroll:money.net')}: <Money value={d.run.net} /> · {t('payroll:run.included')}: {fmt.count(d.run.included)}
                  </p>
                </div>
              ) : (
                <p className="text-muted">{t('payroll:dashboard.noRun')}</p>
              )}
              {d.nextPeriod && (
                <p className="text-muted">
                  {t('payroll:dashboard.nextPeriod', { ref: unbroken(d.nextPeriod.ref), state: t(`payroll:period.state.${d.nextPeriod.state}`) })}
                </p>
              )}
              <p>
                <Link href={PAYROLL.periods()}>{t('payroll:dashboard.toPeriods')}</Link>
              </p>
            </div>
          )}
        </Panel>
        <Panel title={t('payroll:dashboard.attentionTitle')}>
          {d.attention.length === 0 ? (
            <EmptyState title={t('payroll:dashboard.allClear')} />
          ) : (
            <ul className="space-y-2" data-testid="pay-attention">
              {d.attention.map((a) => (
                <li key={a.kind}>
                  <Link href={a.href} variant="plain" className="flex items-start gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-raised" data-testid="pay-attention-item" data-kind={a.kind}>
                    {a.kind === 'statutory' ? <BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" /> : <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />}
                    <span className="min-w-0 break-words">{t(`payroll:dashboard.attention.${a.kind}`, { count: a.count ?? 0 })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
