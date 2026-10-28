import type { SocietyDashboard as Dashboard, SocietyTask } from '@repo/contracts';
import {
  Badge,
  buttonClass,
  cn,
  DirectionalIcon,
  dynamicT,
  ErrorState,
  Link,
  Skeleton,
  StackedBarList,
  StatTile,
  useApiQuery,
  useSession,
  useT,
  type StackSeries,
} from '@repo/ui';
import {
  ArrowRight,
  BadgeCheck,
  Building,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  FilePlus2,
  FileCheck2,
  FileSpreadsheet,
  Hourglass,
  Landmark,
  PiggyBank,
  UserCog,
  ListChecks,
  ReceiptText,
  RefreshCw,
  Send,
  TriangleAlert,
  Undo2,
  UserCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useId } from 'react';
import { ACCESS_DATE, SOCIETY } from '../../nav.config';
import { CollectionsPanel } from './collections/CollectionsPanel';
import { FlatJump, LaterBadge, RunProgress, RunStateBadge, useSocietyFormat, type SocietyFormat } from './kit';

const TASK_ICON: Record<SocietyTask['key'], LucideIcon> = {
  import_flats: FileSpreadsheet,
  approve_opening_balances: ClipboardCheck,
  approve_exemptions: ClipboardCheck,
  create_run: FilePlus2,
  preview_run: ListChecks,
  submit_run: Send,
  approve_run: BadgeCheck,
  post_run: ReceiptText,
  notify_run: Send,
  stale_run: RefreshCw,
  returned_run: Undo2,
  finish_setup: ListChecks,
  review_proofs: FileCheck2,
  proofs_waiting_resident: Hourglass,
  reconcile_bank: Landmark,
  approve_beneficiary: Landmark,
  approve_payer_changes: UserCog,
  approve_payment_exceptions: BadgeCheck,
  proofs_awaiting_bank: Landmark,
  apply_credit: PiggyBank,
};

/** Occupancy keeps its colour whatever is shown (ordinal evergreen ramp, validated with the dashboard). */
const OCCUPANCY_SERIES = [
  ['ownerOccupied', 'var(--color-ever-4)', 'light'],
  ['tenantOccupied', 'var(--color-ever-3)', 'light'],
  ['association', 'var(--color-ever-2)', 'dark'],
  ['vacant', 'var(--color-ever-1)', 'dark'],
] as const;

/**
 * HOME-001, society composition (Gate C.1 reference experience A). Collections first: what was
 * billed, what is owed and what is overdue; then the work waiting for this person and for others,
 * the month's billing run, approvals, occupancy and each block. Every figure opens its records, or
 * says plainly which stage brings it; nothing on the page is decorative.
 */
export default function SocietyDashboard() {
  const query = useApiQuery<Dashboard>({ method: 'GET', path: '/society/dashboard' });
  if (query.isPending) return <DashboardSkeleton />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <DashboardView data={query.data} />;
}

function DashboardView({ data }: { data: Dashboard }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const { persona } = useSession();
  const fmt = useSocietyFormat();
  const firstName = (persona?.displayName ?? '').split(/\s+/)[0] ?? '';
  const period = fmt.period(data.period);
  const top = data.tasks.find((x) => x.yours);

  return (
    <div className="@container space-y-8 sm:space-y-10" data-testid="society-dashboard" data-mode={data.mode}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-2 motion-safe:animate-rise-in">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">
            <bdi>{data.site.name}</bdi> · {persona ? dt(persona.roleKey) : ''}
          </p>
          <h1 id="page-title" className="mt-1.5 text-figure-sm leading-tight font-bold tracking-tight text-text outline-none sm:text-4xl">
            {t('dashboard:greeting.morning', { name: firstName })}
          </h1>
          <p className="mt-1.5 text-sm text-muted">{t('billing:dashboard.subtitle', { period, date: fmt.date(ACCESS_DATE) })}</p>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:items-center" data-tour-id="society-flat-jump">
          <FlatJump siteId={data.site.id} className="sm:w-72" />
          {top && (
            <Link href={top.href} variant="plain" className={cn(buttonClass('primary'), 'justify-center')} data-testid="dashboard-primary-action">
              <span className="inline-flex items-center gap-2">
                {t(`billing:tasks.${top.key}.action`, { period })}
                <DirectionalIcon icon={ArrowRight} className="size-4" />
              </span>
            </Link>
          )}
        </div>
      </header>

      {data.collections ? <CollectionsPanel data={data.collections} /> : <CollectionsRow data={data} fmt={fmt} period={period} />}

      <div className="grid gap-5 lg:gap-6 @5xl:grid-cols-12">
        <div className="min-w-0 @5xl:col-span-7">
          <TasksPanel tasks={data.tasks} period={period} />
        </div>
        <div className="min-w-0 @5xl:col-span-5">
          <RunCard data={data} fmt={fmt} period={period} />
        </div>
      </div>

      <ApprovalsPanel data={data} />

      <div className="grid gap-5 lg:gap-6 @5xl:grid-cols-12">
        <div className="min-w-0 @5xl:col-span-7">
          <OccupancyPanel data={data} fmt={fmt} />
        </div>
        <div className="min-w-0 @5xl:col-span-5">
          <ArrearsPanel data={data} fmt={fmt} />
        </div>
      </div>

      {/* The first run is already the top task; the strip is for earlier setup steps only. */}
      {data.setup.next && data.setup.next.key !== 'first_run' && <SetupPanel data={data} fmt={fmt} />}
      <LaterPanel data={data} />
    </div>
  );
}

function CollectionsRow({ data, fmt, period }: { data: Dashboard; fmt: SocietyFormat; period: string }) {
  const { t } = useT();
  const titleId = useId();
  const billed = data.billing;
  return (
    <section aria-labelledby={titleId} className="space-y-4" data-tour-id="society-collections">
      <h2 id={titleId} className="text-xl font-bold tracking-tight text-text sm:text-2xl">
        {t('billing:dashboard.collections', { period })}
      </h2>
      <div className="grid gap-4 @lg:grid-cols-3">
        <StatTile
          testId="kpi-billed"
          icon={ReceiptText}
          hue="emerald"
          label={t('billing:dashboard.billed', { period })}
          value={billed.invoices ? fmt.compact(billed.billed) : t('billing:dashboard.notBilled')}
          accessibleValue={billed.invoices ? `${fmt.money(billed.billed)}, ${t('billing:dashboard.invoices', { count: billed.invoices })}` : t('billing:dashboard.notBilled')}
          context={billed.invoices ? t('billing:dashboard.billedContext', { invoices: fmt.count(billed.invoices), exempt: fmt.count(billed.exempt) }) : billed.run ? t('billing:dashboard.runIs', { state: t(`billing:runState.${billed.run.state}`) }) : t('billing:dashboard.noRunYet')}
          href={billed.href}
        />
        <StatTile
          testId="kpi-outstanding"
          icon={Wallet}
          hue="sky"
          label={t('billing:dashboard.outstanding')}
          value={fmt.compact(data.outstanding.amount)}
          accessibleValue={`${fmt.money(data.outstanding.amount)}, ${t('billing:dashboard.accounts', { count: data.outstanding.accounts })}`}
          context={t('billing:dashboard.accounts', { count: data.outstanding.accounts })}
          href={data.outstanding.href}
        />
        <StatTile
          testId="kpi-arrears"
          icon={TriangleAlert}
          hue="gold"
          label={t('billing:dashboard.arrears')}
          value={fmt.compact(data.arrears.amount)}
          accessibleValue={`${fmt.money(data.arrears.amount)}, ${t('billing:dashboard.accounts', { count: data.arrears.accounts })}`}
          context={t('billing:dashboard.arrearsContext', { count: data.arrears.accounts })}
          href={data.arrears.href}
        />
      </div>
    </section>
  );
}

function TasksPanel({ tasks, period }: { tasks: SocietyTask[]; period: string }) {
  const { t } = useT();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex h-full min-w-0 flex-col rounded-card bg-panel p-5 shadow-card sm:p-6" data-testid="society-tasks" data-tour-id="society-tasks">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-bold tracking-tight text-text">
            {t('billing:dashboard.tasksTitle')}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{t('billing:dashboard.tasksSubtitle')}</p>
        </div>
      </div>
      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted" data-testid="society-tasks-empty">
          {t('billing:dashboard.tasksEmpty')}
        </p>
      ) : (
        <ul className="-mx-2 divide-y divide-border">
          {tasks.map((task) => {
            const Icon = TASK_ICON[task.key];
            return (
              <li key={task.key}>
                <Link href={task.href} variant="plain" className="group flex items-center gap-3 rounded-control px-2 py-3 transition-colors duration-[var(--motion-fast)] hover:bg-raised" data-testid="society-task" data-task={task.key} data-yours={task.yours}>
                  <span aria-hidden className={cn('grid size-10 shrink-0 place-items-center rounded-pill', task.urgency === 'urgent' && task.yours ? 'bg-warning-soft text-warning' : task.yours ? 'bg-primary-soft text-primary' : 'bg-sunken text-muted')}>
                    <Icon className="size-4.5" />
                  </span>
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-sm font-semibold text-text">{t(`billing:tasks.${task.key}.title`, { period, count: task.count ?? 0 })}</span>
                    <span className="block text-xs text-muted">{task.yours ? t(`billing:tasks.${task.key}.yours`, { period }) : t(`billing:tasks.${task.key}.waiting`, { period })}</span>
                  </span>
                  {task.yours ? (
                    task.urgency === 'urgent' && (
                      <Badge tone="warning" icon={TriangleAlert} className="shrink-0 max-sm:hidden">
                        {t('billing:dashboard.urgent')}
                      </Badge>
                    )
                  ) : (
                    <Badge tone="neutral" icon={Hourglass} className="shrink-0 max-sm:hidden">
                      {t('billing:dashboard.waitingOthers')}
                    </Badge>
                  )}
                  <DirectionalIcon icon={ChevronRight} className="size-4 shrink-0 text-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RunCard({ data, fmt, period }: { data: Dashboard; fmt: SocietyFormat; period: string }) {
  const { t } = useT();
  const titleId = useId();
  const run = data.billing.run;
  return (
    <section aria-labelledby={titleId} className="flex h-full min-w-0 flex-col gap-4 rounded-card bg-panel p-5 shadow-card sm:p-6" data-testid="society-run-card" data-tour-id="society-run-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-bold tracking-tight text-text">
            {t('billing:dashboard.runTitle', { period })}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{t('billing:dashboard.runSubtitle')}</p>
        </div>
        {run && <RunStateBadge state={run.state} stale={run.stale} />}
      </div>
      {run ? (
        <>
          <RunProgress state={run.state} history={[]} compact />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-tile bg-sunken/60 px-3 py-2">
              <dt className="text-xs text-muted">{t('billing:dashboard.runInvoices')}</dt>
              <dd className="mt-0.5 font-semibold text-text">{data.billing.invoices ? fmt.count(data.billing.invoices) : '—'}</dd>
            </div>
            <div className="rounded-tile bg-sunken/60 px-3 py-2">
              <dt className="text-xs text-muted">{t('billing:dashboard.runExempt')}</dt>
              <dd className="mt-0.5 font-semibold text-text">{fmt.count(data.billing.exempt)}</dd>
            </div>
          </dl>
          <Link href={SOCIETY.run(run.id)} variant="plain" className={cn(buttonClass('secondary'), 'mt-auto justify-center')} data-testid="dashboard-open-run">
            <span className="inline-flex items-center gap-2">
              {t('billing:dashboard.openRun', { ref: run.ref })}
              <DirectionalIcon icon={ArrowRight} className="size-4" />
            </span>
          </Link>
        </>
      ) : (
        <div className="flex flex-1 flex-col justify-between gap-4">
          <p className="text-sm text-text">{t('billing:dashboard.noRunBody', { period })}</p>
          <Link href={SOCIETY.runs} variant="plain" className={cn(buttonClass('secondary'), 'justify-center')}>
            <span className="inline-flex items-center gap-2">
              <CalendarClock aria-hidden className="size-4" />
              {t('billing:dashboard.openCalendar')}
            </span>
          </Link>
        </div>
      )}
    </section>
  );
}

function ApprovalsPanel({ data }: { data: Dashboard }) {
  const { t } = useT();
  const titleId = useId();
  const items = data.approvals.items;
  return (
    <section id="approvals" tabIndex={-1} aria-labelledby={titleId} className="rounded-card bg-panel p-5 shadow-card outline-none sm:p-6" data-testid="society-approvals" data-tour-id="society-approvals">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-lg font-bold tracking-tight text-text">
            {t('billing:dashboard.approvalsTitle')}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{t('billing:dashboard.approvalsSubtitle')}</p>
        </div>
        <Badge tone={data.approvals.yours ? 'warning' : 'neutral'} icon={UserCheck}>
          {t('billing:dashboard.approvalsCount', { count: data.approvals.count, yours: data.approvals.yours })}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{t('billing:dashboard.approvalsEmpty')}</p>
      ) : (
        <ul className="grid gap-2 @3xl:grid-cols-2">
          {items.map((a) => (
            <li key={a.id}>
              <Link href={a.href} variant="plain" className="group flex items-center gap-3 rounded-tile border border-border px-3 py-2.5 hover:bg-raised" data-testid="approval-item" data-kind={a.kind}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">{t(`billing:approvals.${a.kind}`)}</span>
                  <bdi dir="ltr" className="ltr-ref block text-xs text-muted">
                    {a.label}
                  </bdi>
                </span>
                <Badge tone={a.yours ? 'warning' : 'neutral'} icon={a.yours ? UserCheck : Hourglass}>
                  {a.yours ? t('billing:approvals.yours') : t('billing:approvals.notYours')}
                </Badge>
                <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OccupancyPanel({ data, fmt }: { data: Dashboard; fmt: SocietyFormat }) {
  const { t } = useT();
  const titleId = useId();
  const o = data.occupancy;
  const series: StackSeries[] = OCCUPANCY_SERIES.map(([id, color, ink]) => ({ id, label: t(`billing:dashboard.occupancy.${id}`), color, ink }));
  const rows = data.buildings.map((b) => ({ id: b.id, label: b.name, href: b.href, values: { ownerOccupied: b.ownerOccupied, tenantOccupied: b.tenantOccupied, association: b.association, vacant: b.vacant } }));
  return (
    <section aria-labelledby={titleId} className="flex h-full flex-col gap-5 rounded-card bg-panel p-5 shadow-card sm:p-6" data-testid="society-occupancy" data-tour-id="society-occupancy">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-lg font-bold tracking-tight text-text">
            {t('billing:dashboard.occupancyTitle')}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {t('billing:dashboard.occupancySubtitle', { registered: fmt.count(o.registered), occupied: fmt.count(o.occupied), declared: fmt.count(o.declared) })}
          </p>
        </div>
        <Link href={o.href} variant="plain" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary">
          {t('billing:dashboard.openRoster')}
          <DirectionalIcon icon={ArrowRight} className="size-4" />
        </Link>
      </div>
      <StackedBarList
        rows={rows}
        series={series}
        formatCount={fmt.count}
        totalLabel={t('billing:dashboard.flatsTotal')}
        describeRow={(row) =>
          t('billing:dashboard.occupancyRow', {
            name: row.label,
            owner: fmt.count(row.values.ownerOccupied ?? 0),
            tenant: fmt.count(row.values.tenantOccupied ?? 0),
            association: fmt.count(row.values.association ?? 0),
            vacant: fmt.count(row.values.vacant ?? 0),
          })
        }
      />
      <ul className="flex flex-wrap gap-2" aria-label={t('billing:dashboard.occupancyLegend')}>
        {OCCUPANCY_SERIES.map(([id, color]) => {
          const value = id === 'ownerOccupied' ? o.ownerOccupied : id === 'tenantOccupied' ? o.tenantOccupied : id === 'association' ? o.association : o.vacant;
          const filter = id === 'ownerOccupied' ? 'owner_occupied' : id === 'tenantOccupied' ? 'tenant_occupied' : id === 'association' ? 'association_use' : 'vacant';
          return (
            <li key={id}>
              <Link href={SOCIETY.roster(filter)} variant="plain" className="inline-flex min-h-9 items-center gap-2 rounded-pill border border-border px-3 text-xs font-medium text-text hover:bg-raised" data-testid={`occupancy-${filter}`}>
                <span aria-hidden className="size-2.5 rounded-pill" style={{ background: color }} />
                {t(`billing:dashboard.occupancy.${id}`)}
                <span className="font-semibold">{fmt.count(value)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <ul className="grid gap-3 @md:grid-cols-2" aria-label={t('billing:dashboard.blocks')}>
        {data.buildings.map((b) => (
          <li key={b.id}>
            <Link href={b.href} variant="plain" className="group flex h-full flex-col gap-3 rounded-tile border border-border p-4 hover:bg-raised" data-testid="building-card" data-building={b.code}>
              <span className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-semibold text-text">
                  <Building aria-hidden className="size-4 text-muted" />
                  {b.name}
                </span>
                <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
              </span>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted">{t('billing:dashboard.blockFlats')}</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-text">{fmt.count(b.flats)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t('billing:dashboard.blockVacant')}</dt>
                  <dd className="mt-0.5 text-sm font-semibold text-text">{fmt.count(b.vacant)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t('billing:dashboard.blockArrears')}</dt>
                  <dd className={cn('mt-0.5 text-sm font-semibold', b.arrearsAccounts ? 'text-warning' : 'text-text')}>{fmt.count(b.arrearsAccounts)}</dd>
                </div>
              </dl>
              <p className="text-xs text-muted">{t('billing:dashboard.blockOwed', { amount: fmt.money(b.outstanding) })}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ArrearsPanel({ data, fmt }: { data: Dashboard; fmt: SocietyFormat }) {
  const { t } = useT();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex h-full flex-col rounded-card bg-panel p-5 shadow-card sm:p-6" data-testid="society-arrears">
      <div className="mb-3">
        <h2 id={titleId} className="text-lg font-bold tracking-tight text-text">
          {t('billing:dashboard.arrearsTitle')}
        </h2>
        <p className="mt-0.5 text-sm text-muted">{t('billing:dashboard.arrearsSubtitle')}</p>
      </div>
      {data.topArrears.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('billing:dashboard.arrearsEmpty')}</p>
      ) : (
        <ol className="-mx-2 divide-y divide-border">
          {data.topArrears.map((a) => (
            <li key={a.accountId}>
              <Link href={a.href} variant="plain" className="flex items-center gap-3 rounded-control px-2 py-2.5 hover:bg-raised" data-testid="arrears-item">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text">
                    <bdi>{a.holderName}</bdi>
                  </span>
                  <span className="block text-xs text-muted">
                    <bdi dir="ltr" className="ltr-ref">
                      {a.flats.join(', ')}
                    </bdi>{' '}
                    · <bdi dir="ltr" className="ltr-ref">{a.accountNo}</bdi>
                  </span>
                </span>
                <bdi dir="ltr" className="ltr-ref shrink-0 text-sm font-semibold text-text">
                  {fmt.money(a.amount)}
                </bdi>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <Link href={data.arrears.href} variant="plain" className="mt-auto inline-flex min-h-10 items-center gap-1.5 pt-3 text-sm font-medium text-primary">
        {t('billing:dashboard.allArrears', { count: data.arrears.accounts })}
        <DirectionalIcon icon={ArrowRight} className="size-4" />
      </Link>
    </section>
  );
}

function SetupPanel({ data, fmt }: { data: Dashboard; fmt: SocietyFormat }) {
  const { t } = useT();
  const next = data.setup.next!;
  return (
    <section aria-label={t('billing:dashboard.setupTitle')} className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-primary/25 bg-primary-soft/40 p-5" data-testid="society-setup">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-text">{t('billing:dashboard.setupTitle')}</h2>
        <p className="mt-0.5 text-sm text-muted">{t('billing:dashboard.setupBody', { done: fmt.count(data.setup.done), total: fmt.count(data.setup.total), next: t(`sites:checklist.steps.${next.key}.title`) })}</p>
      </div>
      <Link href={next.href} variant="plain" className={buttonClass('primary')}>
        {t('billing:dashboard.setupContinue')}
      </Link>
    </section>
  );
}

function LaterPanel({ data }: { data: Dashboard }) {
  const { t } = useT();
  return (
    <section aria-label={t('billing:dashboard.laterTitle')} className="rounded-card border border-dashed border-border p-5" data-testid="society-later">
      <h2 className="text-sm font-semibold text-text">{t('billing:dashboard.laterTitle')}</h2>
      <p className="mt-0.5 text-sm text-muted">{t('billing:dashboard.laterBody')}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {data.later.map((l) => (
          <li key={l.key} className="inline-flex items-center gap-2 rounded-pill bg-sunken px-3 py-1.5 text-xs text-text" data-later={l.gate}>
            {t(`billing:dashboard.later.${l.key}`)}
            <LaterBadge gate={l.gate} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DashboardSkeleton() {
  const { t } = useT();
  return (
    <div role="status" aria-busy="true" className="space-y-8">
      <span className="sr-only">{t('common:state.loading')}</span>
      <Skeleton className="h-16 w-2/3 rounded-tile" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}
