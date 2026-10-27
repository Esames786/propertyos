import type { HqOverview } from '@repo/contracts';
import { ErrorState, MetricCard, QuickActions, RevealItem, Skeleton, Stagger, useApiQuery, useSession, useT, type QuickAction } from '@repo/ui';
import { BadgeCheck, Building2, Calculator, FileClock, Hourglass, Inbox, Landmark, PlusCircle, TrendingUp, Users } from 'lucide-react';
import { HQ } from '../../nav.config';
import { HQ_AS_OF, useHqFormat } from '../../lib/format';
import { ActivityPanel, AttentionPanel, ModulesPanel, PolicyPanel, RequestsPanel, TenantMixPanel } from './panels';
import { RevenueCard } from './RevenueCard';

/**
 * HQ-001 Platform dashboard. What needs attention first, then the platform's figures (MRR, paying
 * tenants, trials, approvals, flats under management), quick actions, billing, tenant mix, module
 * adoption, requests and recent activity. Tenant metadata only: no tenant people or finance records.
 */
export default function HqDashboard() {
  const { t } = useT();
  const { persona } = useSession();
  const fmt = useHqFormat();
  const overview = useApiQuery<HqOverview>({ method: 'GET', path: '/platform/overview' });

  const greeting = fmt.hour < 12 ? 'morning' : fmt.hour < 17 ? 'afternoon' : 'evening';
  const firstName = persona?.displayName.split(' ')[0] ?? '';

  const actions: QuickAction[] = [
    { id: 'create', label: t('platform:shell.createTenant'), icon: PlusCircle, hue: 'emerald', href: HQ.createTenant, permission: 'platform.tenants.create', testId: 'hq-qa-create' },
    { id: 'simulator', label: t('platform:nav.simulator'), icon: Calculator, hue: 'sky', href: HQ.simulator, permission: 'platform.pricing.simulate', testId: 'hq-qa-simulator' },
    { id: 'approvals', label: t('platform:dashboard.quick.approvals'), icon: FileClock, hue: 'amber', href: `${HQ.tenants}?status=awaiting_approval`, permission: 'platform.tenants.view', testId: 'hq-qa-approvals' },
    { id: 'requests', label: t('platform:dashboard.quick.requests'), icon: Inbox, hue: 'violet', href: `${HQ.tenants}?tab=requests`, permission: 'platform.tenants.view', testId: 'hq-qa-requests' },
    { id: 'tenants', label: t('platform:nav.tenants'), icon: Building2, hue: 'teal', href: HQ.tenants, permission: 'platform.tenants.view', testId: 'hq-qa-tenants' },
  ];

  return (
    <div className="space-y-8" data-testid="hq-dashboard">
      <header className="space-y-1.5">
        <p className="text-xs font-semibold tracking-[0.08em] text-accent uppercase">{t('platform:dashboard.eyebrow')}</p>
        <h1 id="page-title" className="text-[1.75rem] leading-tight font-bold text-text sm:text-[2.25rem]">
          {t(`platform:dashboard.greeting.${greeting}`, { name: firstName })}
        </h1>
        <p className="text-muted">
          {t('platform:dashboard.subtitle', { operator: t('platform:app.operator'), date: fmt.date(HQ_AS_OF) })}
        </p>
      </header>

      {overview.isPending ? (
        <DashboardSkeleton />
      ) : overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : (
        <Body overview={overview.data} actions={actions} />
      )}
    </div>
  );
}

function Body({ overview: o, actions }: { overview: HqOverview; actions: QuickAction[] }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const mrr = Number(o.subscriptions.mrr.amount);
  const prev = Number(o.subscriptions.mrrPrevious.amount);
  const delta = mrr - prev;
  return (
    <>
      <Stagger
        as="ul"
        label={t('platform:dashboard.kpisLabel')}
        testId="hq-kpis"
        tourId="hq-kpis"
        className="grid grid-cols-1 gap-3 min-[24rem]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6"
      >
        <RevealItem as="li" tourId="hq-kpi-first">
          <MetricCard
            testId="hq-kpi-mrr"
            label={t('platform:dashboard.kpi.mrr')}
            value={fmt.money(o.subscriptions.mrr)}
            caption={
              delta === 0
                ? t('platform:dashboard.kpi.mrrFlat')
                : t(delta > 0 ? 'platform:dashboard.kpi.mrrUp' : 'platform:dashboard.kpi.mrrDown', { amount: fmt.money(Math.abs(delta)) })
            }
            icon={TrendingUp}
            hue="emerald"
            href={`${HQ.tenants}?sort=mrr`}
          />
        </RevealItem>
        <RevealItem as="li">
          <MetricCard
            testId="hq-kpi-arr"
            label={t('platform:dashboard.kpi.arr')}
            value={fmt.moneyCompact(o.subscriptions.arr)}
            accessibleValue={fmt.money(o.subscriptions.arr)}
            caption={t('platform:dashboard.kpi.arrCaption')}
            icon={Landmark}
            hue="teal"
          />
        </RevealItem>
        <RevealItem as="li">
          <MetricCard
            testId="hq-kpi-paying"
            label={t('platform:dashboard.kpi.paying')}
            value={fmt.count(o.subscriptions.paying)}
            caption={t('platform:dashboard.kpi.payingCaption', { total: fmt.count(o.tenants.total) })}
            icon={BadgeCheck}
            hue="sky"
            href={`${HQ.tenants}?status=active`}
          />
        </RevealItem>
        <RevealItem as="li">
          <MetricCard
            testId="hq-kpi-trials"
            label={t('platform:dashboard.kpi.trials')}
            value={fmt.count(o.subscriptions.trials)}
            caption={
              o.trials[0]
                ? t('platform:dashboard.kpi.trialsCaption', { days: fmt.count(o.trials[0].daysLeft) })
                : t('platform:dashboard.kpi.trialsNone')
            }
            icon={Hourglass}
            hue="violet"
            href={`${HQ.tenants}?status=trial`}
          />
        </RevealItem>
        <RevealItem as="li">
          <MetricCard
            testId="hq-kpi-approvals"
            label={t('platform:dashboard.kpi.approvals')}
            value={fmt.count(o.tenants.awaitingApproval)}
            caption={t('platform:dashboard.kpi.approvalsCaption')}
            valueTone={o.tenants.awaitingApproval > 0 ? 'warning' : 'default'}
            icon={FileClock}
            hue="amber"
            href={`${HQ.tenants}?status=awaiting_approval`}
          />
        </RevealItem>
        <RevealItem as="li">
          <MetricCard
            testId="hq-kpi-units"
            label={t('platform:dashboard.kpi.units')}
            value={fmt.count(o.usage.eligibleUnits)}
            caption={t('platform:dashboard.kpi.unitsCaption', { sites: fmt.count(o.usage.sites), seats: fmt.count(o.usage.staffSeats) })}
            icon={Users}
            hue="gold"
          />
        </RevealItem>
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
        <AttentionPanel items={o.attention} className="lg:col-span-7" />
        <div className="space-y-6 lg:col-span-5">
          <QuickActions title={t('platform:dashboard.quick.title')} actions={actions} tourId="hq-quick-actions" testId="hq-quick-actions" />
          <PolicyPanel policy={o.signupPolicy} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
        <RevenueCard months={o.revenue.months} outstanding={o.revenue.outstanding} className="lg:col-span-7" />
        <TenantMixPanel overview={o} className="lg:col-span-5" />
      </div>

      <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
        <ModulesPanel modules={o.modules} live={o.tenants.total - o.tenants.byStatus.draft} className="lg:col-span-7" />
        <RequestsPanel overview={o} className="lg:col-span-5" />
      </div>

      <ActivityPanel events={o.activity} />
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-card" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
        <Skeleton className="h-80 rounded-card lg:col-span-7" />
        <Skeleton className="h-80 rounded-card lg:col-span-5" />
      </div>
    </div>
  );
}
