import type { MaintenanceDashboard as Dashboard, RequestList, RequestRow, SlaDashboard, TechnicianBoard as Board } from '@repo/contracts';
import { buttonClass, cn, DirectionalIcon, EmptyState, ErrorState, FilterPills, Link, PageHeader, PlainTextField, SegmentedControl, useApiQuery, useQueryParam, useQueryParams, useSession, useT } from '@repo/ui';
import { ChevronRight, MessageSquareWarning, Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { OPS } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';
import { WRAP } from '../finance/fkit';
import { Figure, PriorityBadge, RequestBadge, ReopenedBadge, SlaBadge, useOpsWords, When, WhereText } from './okit';

/**
 * Society maintenance (Gate D.2 reference experience 1): MNT-001 dashboard, MNT-002 one request list
 * for repairs and community issues (D-28), MNT-006 technician board, MNT-007 service levels and
 * MNT-008 resident confirmation. Every figure opens the requests it counts; a technician sees only his
 * own work orders (the server filters them).
 */

export function MaintenanceTabs({ current }: { current: 'dashboard' | 'list' | 'issues' | 'board' | 'sla' | 'confirmation' }) {
  const { t } = useT();
  const { allows, can } = useSession();
  const tabs = [
    { id: 'dashboard', href: OPS.maintenance, label: t('operations:tabs.dashboard') },
    { id: 'list', href: OPS.requests(), label: t('operations:tabs.requests') },
    ...(allows({ module: 'maintenance', feature: 'maintenance.community_issues', permission: 'issues.view' }) ? [{ id: 'issues', href: OPS.issues(), label: t('operations:tabs.issues') }] : []),
    { id: 'board', href: OPS.technicians, label: can('maintenance.manage') ? t('operations:tabs.board') : t('operations:tabs.myJobs') },
    { id: 'sla', href: OPS.sla(), label: t('operations:tabs.sla') },
    ...(can('maintenance.manage') ? [{ id: 'confirmation', href: OPS.confirmation(), label: t('operations:tabs.confirmation') }] : []),
  ];
  return (
    <nav aria-label={t('operations:tabs.label')} className="-mx-1 overflow-x-auto px-1" data-testid="maintenance-tabs">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <Link
              href={tab.href}
              variant="plain"
              aria-current={tab.id === current ? 'page' : undefined}
              className={cn('inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium', tab.id === current ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-text')}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MaintenanceDashboardPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const w = useOpsWords();
  const { can } = useSession();
  const q = useApiQuery<Dashboard>({ method: 'GET', path: '/ops/maintenance/dashboard' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  return (
    <div className="@container space-y-6" data-testid="maintenance-dashboard">
      <PageHeader
        title={t('operations:maintenance.title')}
        description={t('operations:maintenance.intro')}
        actions={
          can('maintenance.manage') ? (
            <Link href={OPS.newRequest()} variant="plain" className={cn(buttonClass('primary', 'md', 'gap-2'), WRAP)} data-testid="new-request">
              <Plus aria-hidden className="size-4" />
              {t('operations:maintenance.new')}
            </Link>
          ) : undefined
        }
      />
      <MaintenanceTabs current="dashboard" />
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-6" data-testid="maintenance-figures">
        <Figure label={t('operations:maintenance.open')} value={fmt.count(d.open)} href={OPS.requests({ status: 'open' })} testId="fig-open" />
        <Figure label={t('operations:maintenance.unassigned')} value={fmt.count(d.unassigned)} href={OPS.requests({ status: 'unassigned' })} tone={d.unassigned ? 'warning' : 'default'} testId="fig-unassigned" />
        <Figure label={t('operations:maintenance.breached')} value={fmt.count(d.breached)} href={OPS.sla({ view: 'breaches' })} tone={d.breached ? 'error' : 'default'} testId="fig-breached" />
        <Figure label={t('operations:maintenance.atRisk')} value={fmt.count(d.atRisk)} href={OPS.sla({ view: 'at_risk' })} tone={d.atRisk ? 'warning' : 'default'} testId="fig-at-risk" />
        <Figure label={t('operations:maintenance.awaiting')} value={fmt.count(d.awaitingConfirmation)} href={OPS.requests({ status: 'awaiting_confirmation' })} testId="fig-awaiting" />
        <Figure label={t('operations:maintenance.issues')} value={fmt.count(d.communityIssues)} href={OPS.issues()} testId="fig-issues" />
      </div>
      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5 shadow-card" aria-labelledby="needs-attention" data-testid="needs-attention">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="needs-attention" className="text-lg font-semibold text-text">
              {t('operations:maintenance.attention')}
            </h2>
            <Link href={OPS.requests({ status: 'open' })} className="text-sm">
              {t('operations:maintenance.allOpen')}
            </Link>
          </div>
          {d.needsAttention.length === 0 ? <p className="text-sm text-muted">{t('operations:maintenance.nothingUrgent')}</p> : <RequestCards items={d.needsAttention} />}
        </section>
        <div className="space-y-5">
          <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5 shadow-card" aria-labelledby="by-technician" data-testid="by-technician">
            <div className="flex items-center justify-between gap-2">
              <h2 id="by-technician" className="text-lg font-semibold text-text">
                {t('operations:maintenance.byTechnician')}
              </h2>
              <Link href={OPS.technicians} className="text-sm">
                {t('operations:maintenance.board')}
              </Link>
            </div>
            {d.byTechnician.length === 0 ? (
              <p className="text-sm text-muted">{t('operations:maintenance.noJobs')}</p>
            ) : (
              <ul className="space-y-2">
                {d.byTechnician.map((x) => (
                  <li key={x.technicianId}>
                    <Link href={OPS.requests({ technician: x.technicianId, status: 'open' })} variant="plain" className="flex items-center justify-between gap-3 rounded-tile border border-border/70 px-3 py-2 hover:bg-raised">
                      <span className="min-w-0">
                        <bdi className="font-medium text-text">{x.name}</bdi>
                        <span className="block text-xs text-muted">{t(`operations:trade.${x.trade}`)}</span>
                      </span>
                      <span className="text-sm font-semibold text-text">{t('operations:maintenance.jobs', { count: x.open })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5 shadow-card" aria-labelledby="by-category" data-testid="by-category">
            <h2 id="by-category" className="text-lg font-semibold text-text">
              {t('operations:maintenance.byCategory')}
            </h2>
            <ul className="space-y-1.5">
              {d.byCategory.map((c) => (
                <li key={c.category} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text">{w.category(c.category)}</span>
                  <span className="font-semibold tabular-nums text-text">{fmt.count(c.open)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2 rounded-card border border-border/70 bg-panel p-5 shadow-card" aria-labelledby="confirmations" data-testid="confirmations">
            <h2 id="confirmations" className="text-lg font-semibold text-text">
              {t('operations:maintenance.confirmationTitle')}
            </h2>
            <p className="text-sm text-text">{t('operations:maintenance.confirmationLine', { confirmed: d.confirmation.confirmed, reopened: d.confirmation.reopened, awaiting: d.confirmation.awaiting })}</p>
            {d.confirmation.averageRating && (
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Star aria-hidden className="size-4 text-accent" />
                {t('operations:maintenance.rating', { rating: d.confirmation.averageRating })}
              </p>
            )}
            {can('maintenance.manage') && (
              <Link href={OPS.confirmation()} className="text-sm">
                {t('operations:maintenance.openConfirmation')}
              </Link>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** Request rows as cards (phones) that grow into a row layout on wide screens. */
export function RequestCards({ items, testId = 'request-list' }: { items: RequestRow[]; testId?: string }) {
  const { t } = useT();
  const w = useOpsWords();
  return (
    <ul className="space-y-2" data-testid={testId}>
      {items.map((r) => (
        <li key={r.id}>
          <Link
            href={OPS.request(r.id)}
            variant="plain"
            className="grid gap-2 rounded-tile border border-border/70 bg-panel p-3 hover:bg-raised @3xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] @3xl:items-center"
            data-testid="request-row"
            data-ref={r.ref}
            data-state={r.state}
          >
            <span className="min-w-0">
              <span className="block font-semibold text-text [overflow-wrap:anywhere]">
                <bdi>{r.title}</bdi>
              </span>
              <span className="block text-xs text-muted">
                <bdi dir="ltr" className="ltr-ref">{r.ref}</bdi> · <WhereText where={r.where} /> · {w.category(r.category)}
                {r.kind === 'community_issue' ? ` · ${t('operations:kind.community_issue')}` : ''}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <RequestBadge state={r.state} />
              {r.priority && <PriorityBadge priority={r.priority} />}
              <ReopenedBadge count={r.reopenCount} />
              {r.sla && (r.sla.resolution === 'breached' || r.sla.resolution === 'at_risk' || r.sla.response === 'breached') && <SlaBadge state={r.sla.response === 'breached' ? 'breached' : r.sla.resolution} />}
            </span>
            <span className="flex items-center justify-between gap-2 text-xs text-muted @3xl:justify-end">
              <span>{r.assigneeName ? <bdi>{r.assigneeName}</bdi> : t('operations:request.unassigned')}</span>
              <DirectionalIcon icon={ChevronRight} className="size-4" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const STATUSES = ['all', 'open', 'unassigned', 'breached', 'awaiting_confirmation', 'closed'] as const;

export function RequestsListPage() {
  const { t } = useT();
  const { can, allows } = useSession();
  const [status] = useQueryParam('status');
  const [kind] = useQueryParam('kind');
  const [technician] = useQueryParam('technician');
  const [flat] = useQueryParam('flat');
  const setParams = useQueryParams();
  const [text, setText] = useState('');
  const filter = (STATUSES as readonly string[]).includes(status ?? '') ? status! : 'all';
  const issues = allows({ module: 'maintenance', feature: 'maintenance.community_issues', permission: 'issues.view' });
  const q = useApiQuery<RequestList>({ method: 'GET', path: '/ops/requests', query: { status: filter, ...(kind ? { kind } : {}), ...(technician ? { technician } : {}), ...(flat ? { flat } : {}), ...(text.trim() ? { q: text.trim() } : {}) } }, { placeholderData: (prev) => prev });
  return (
    <div className="@container space-y-5" data-testid="requests-page">
      <PageHeader
        title={t('operations:list.title')}
        description={t('operations:list.intro')}
        actions={
          can('maintenance.manage') ? (
            <Link href={OPS.newRequest()} variant="plain" className={cn(buttonClass('primary', 'md', 'gap-2'), WRAP)} data-testid="new-request">
              <Plus aria-hidden className="size-4" />
              {t('operations:maintenance.new')}
            </Link>
          ) : undefined
        }
      />
      <MaintenanceTabs current="list" />
      <div className="flex flex-wrap items-end gap-3">
        {issues && (
          <SegmentedControl
            label={t('operations:list.kind')}
            value={kind === 'repair' || kind === 'community_issue' ? kind : 'all'}
            onChange={(v) => setParams({ kind: v === 'all' ? null : v })}
            options={[
              { id: 'all', label: t('operations:list.allKinds') },
              { id: 'repair', label: t('operations:kind.repair') },
              { id: 'community_issue', label: t('operations:kind.community_issue') },
            ]}
            testId="kind-filter"
          />
        )}
        <div className="min-w-56 flex-1">
          <PlainTextField label={t('operations:list.search')} value={text} onChange={setText} placeholder={t('operations:list.searchHint')} testId="request-search" />
        </div>
      </div>
      <FilterPills label={t('operations:list.status')} value={filter} testId="request-status" onChange={(v) => setParams({ status: v === 'all' ? null : v })} options={STATUSES.map((s) => ({ id: s, label: t(`operations:list.statuses.${s}`), ...(q.data ? { count: q.data.counts[s] } : {}) }))} />
      {(technician || flat) && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-text" data-testid="active-filter">
          {technician ? t('operations:list.filteredTechnician') : t('operations:list.filteredFlat')}
          <button type="button" className="text-primary underline" onClick={() => setParams({ technician: null, flat: null })}>
            {t('operations:list.clear')}
          </button>
        </p>
      )}
      {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data ? <Loading lines={8} /> : q.data.items.length === 0 ? <EmptyState title={t('operations:list.emptyTitle')} body={t('operations:list.emptyBody')} /> : <RequestCards items={q.data.items} />}
    </div>
  );
}

export function TechnicianBoardPage() {
  const { t } = useT();
  const w = useOpsWords();
  const q = useApiQuery<Board>({ method: 'GET', path: '/ops/technicians/board' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="technician-board" data-own={d.ownOnly || undefined}>
      <PageHeader title={d.ownOnly ? t('operations:board.myTitle') : t('operations:board.title')} description={d.ownOnly ? t('operations:board.myIntro') : t('operations:board.intro')} />
      <MaintenanceTabs current="board" />
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2 @6xl:grid-cols-3">
        {d.technicians.map((tech) => (
          <section key={tech.id} className="space-y-3 rounded-card border border-border/70 bg-panel p-4 shadow-card" aria-labelledby={`tech-${tech.id}`} data-testid="technician-column" data-technician={tech.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 id={`tech-${tech.id}`} className="font-semibold text-text">
                  <bdi>{tech.name}</bdi>
                </h2>
                <p className="text-xs text-muted">
                  {t(`operations:trade.${tech.trade}`)} · {tech.kind === 'vendor' ? t('operations:board.vendor') : t('operations:board.staff')}
                  {!tech.available ? ` · ${t('operations:board.unavailable')}` : ''}
                </p>
              </div>
              <span className="text-sm font-semibold text-text">{t('operations:maintenance.jobs', { count: tech.jobs.length })}</span>
            </div>
            {tech.jobs.length === 0 ? (
              <p className="text-sm text-muted">{t('operations:board.noJobs')}</p>
            ) : (
              <ol className="space-y-2">
                {tech.jobs.map((j) => (
                  <li key={j.id}>
                    <Link href={OPS.request(j.requestId)} variant="plain" className="block space-y-1.5 rounded-tile border border-border/70 p-3 hover:bg-raised" data-testid="job-card" data-ref={j.requestRef}>
                      <span className="block font-medium text-text [overflow-wrap:anywhere]">
                        <bdi>{j.title}</bdi>
                      </span>
                      <span className="block text-xs text-muted">
                        <bdi dir="ltr" className="ltr-ref">{j.ref}</bdi> · {j.flatCode ? <bdi dir="ltr" className="ltr-ref">{j.flatCode}</bdi> : j.areaKey ? w.areaKey(j.areaKey) : ''}
                        {j.scheduledOn ? (
                          <>
                            {' '}
                            · <When at={`${j.scheduledOn}T00:00:00Z`} style="date" />
                            {j.slot ? ` · ${w.slot(j.slot)}` : ''}
                          </>
                        ) : (
                          ` · ${t('operations:board.notScheduled')}`
                        )}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {j.priority && <PriorityBadge priority={j.priority} />}
                        {j.sla && <SlaBadge state={j.sla.resolution} />}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export function SlaDashboardPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [view] = useQueryParam('view');
  const setParams = useQueryParams();
  const q = useApiQuery<SlaDashboard>({ method: 'GET', path: '/ops/maintenance/sla' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  const list = view === 'at_risk' ? d.atRisk : d.breaches;
  return (
    <div className="@container space-y-5" data-testid="sla-dashboard">
      <PageHeader title={t('operations:sla.title')} description={t('operations:sla.intro')} />
      <MaintenanceTabs current="sla" />
      <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5 shadow-card" aria-labelledby="sla-targets" data-testid="sla-targets">
        <h2 id="sla-targets" className="text-lg font-semibold text-text">
          {t('operations:sla.targets')}
        </h2>
        <p className="text-sm text-muted">{t('operations:sla.illustrative')}</p>
        <div className="overflow-x-auto" role="region" aria-label={t('operations:sla.targets')} tabIndex={0}>
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-start text-xs text-muted">
                <th className="py-2 text-start font-medium">{t('operations:sla.priority')}</th>
                <th className="py-2 text-start font-medium">{t('operations:sla.respond')}</th>
                <th className="py-2 text-start font-medium">{t('operations:sla.resolve')}</th>
                <th className="py-2 text-start font-medium">{t('operations:sla.breached')}</th>
                <th className="py-2 text-start font-medium">{t('operations:sla.met')}</th>
              </tr>
            </thead>
            <tbody>
              {d.targets.map((x) => {
                const row = d.byPriority.find((p) => p.priority === x.priority)!;
                return (
                  <tr key={x.priority} className="border-t border-border/70">
                    <td className="py-2">
                      <PriorityBadge priority={x.priority} />
                    </td>
                    <td className="py-2 text-text">{t('operations:sla.hours', { count: x.respondHours })}</td>
                    <td className="py-2 text-text">{x.resolveHours >= 48 ? t('operations:sla.days', { count: x.resolveHours / 24 }) : t('operations:sla.hours', { count: x.resolveHours })}</td>
                    <td className="py-2 font-semibold text-error">{fmt.count(row.breached)}</td>
                    <td className="py-2 text-text">{fmt.count(row.met)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Figure label={t('operations:sla.resolutionBreached')} value={fmt.count(d.resolution.breached + d.response.breached)} tone="error" testId="sla-breached" />
        <Figure label={t('operations:sla.resolutionAtRisk')} value={fmt.count(d.resolution.at_risk)} tone="warning" testId="sla-at-risk" />
        <Figure label={t('operations:sla.onTrack')} value={fmt.count(d.resolution.on_track)} tone="success" testId="sla-on-track" />
        <Figure label={t('operations:sla.missedMet')} value={`${fmt.count(d.resolution.missed)} / ${fmt.count(d.resolution.met)}`} testId="sla-met" />
      </div>
      <FilterPills label={t('operations:sla.show')} value={view === 'at_risk' ? 'at_risk' : 'breaches'} onChange={(v) => setParams({ view: v })} testId="sla-view" options={[{ id: 'breaches', label: t('operations:sla.breaches'), count: d.breaches.length }, { id: 'at_risk', label: t('operations:sla.atRiskList'), count: d.atRisk.length }]} />
      {list.length === 0 ? <EmptyState title={t('operations:sla.emptyTitle')} body={t('operations:sla.emptyBody')} /> : <RequestCards items={list} testId="sla-list" />}
    </div>
  );
}

export function ConfirmationPage() {
  const { t } = useT();
  const [tab] = useQueryParam('tab');
  const setParams = useQueryParams();
  const awaiting = useApiQuery<RequestList>({ method: 'GET', path: '/ops/requests', query: { status: 'awaiting_confirmation', kind: 'repair' } });
  const closed = useApiQuery<RequestList>({ method: 'GET', path: '/ops/requests', query: { status: 'closed', kind: 'repair' } });
  const open = useApiQuery<RequestList>({ method: 'GET', path: '/ops/requests', query: { status: 'open', kind: 'repair' } });
  const current = tab === 'reopened' || tab === 'confirmed' ? tab : 'awaiting';
  const reopened = (open.data?.items ?? []).filter((r) => r.reopenCount > 0);
  const confirmed = (closed.data?.items ?? []).filter((r) => r.confirmation === 'confirmed' || r.confirmation === 'closed_by_office');
  const items = current === 'reopened' ? reopened : current === 'confirmed' ? confirmed : (awaiting.data?.items ?? []);
  return (
    <div className="@container space-y-5" data-testid="confirmation-page">
      <PageHeader title={t('operations:confirm.title')} description={t('operations:confirm.intro')} />
      <MaintenanceTabs current="confirmation" />
      <FilterPills
        label={t('operations:confirm.show')}
        value={current}
        onChange={(v) => setParams({ tab: v === 'awaiting' ? null : v })}
        testId="confirmation-tabs"
        options={[
          { id: 'awaiting', label: t('operations:confirm.awaiting'), ...(awaiting.data ? { count: awaiting.data.items.length } : {}) },
          { id: 'reopened', label: t('operations:confirm.reopened'), count: reopened.length },
          { id: 'confirmed', label: t('operations:confirm.done'), count: confirmed.length },
        ]}
      />
      <p className="flex items-start gap-2 text-sm text-muted">
        <MessageSquareWarning aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t(`operations:confirm.explain.${current}`)}
      </p>
      {!awaiting.data ? <Loading lines={6} /> : items.length === 0 ? <EmptyState title={t('operations:confirm.emptyTitle')} body={t('operations:confirm.emptyBody')} /> : <RequestCards items={items} testId="confirmation-list" />}
    </div>
  );
}

