import { ApiError, type InventoryGroupRow, type Project360, type Project360Tab, type Project360TabInfo, type ProjectsPortfolio } from '@repo/contracts';
import { Badge, DateTime, EmptyState, ErrorState, KeyValueList, Link, NotFoundState, PageHeader, Panel, StatTile, UrlTabs, useApiQuery, useQueryParam, useT, dynamicT, InlineAlert } from '@repo/ui';
import { BadgeCheck, Bookmark, CalendarClock, CheckCircle2, Grid3x3, Lock, PackageX } from 'lucide-react';
import { Loading } from '../../society/kit';
import { LinkButton } from '../../society/hr/hkit';
import { AreaNav, BucketBar, PRJ, ProvisionalNote, SeedNote, StateBadge, unbroken, useEventText, useInvFormat } from './pkit';

/**
 * PRJ-002 Project 360: one project in fifteen register tabs. Overview, Units, Leads, Documents and
 * Activity are built in this slice; every other tab says plainly whether it is planned (and in which
 * gate), not in the organisation's plan for the project's site, or not for the reader's role. Each tab
 * shows only what the server returned for this reader (scoped and projected there).
 */
export default function Project360Page() {
  const { t } = useT();
  const [record] = useQueryParam('record');
  const q = useApiQuery<Project360>(record ? { method: 'GET', path: `/projects/${record}` } : null, { retry: false });
  if (!record) return <ChooseProject />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.problem.status === 404) return <NotFoundState headingLevel={1} actions={<LinkButton href={PRJ.list()}>{t('projects:p360.back')}</LinkButton>} />;
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  }
  if (!q.data) return <Loading lines={12} />;
  const d = q.data;
  const p = d.project;
  return (
    <div className="@container space-y-5" data-testid="project-360" data-project={p.id}>
      <PageHeader
        title={p.name}
        breadcrumbs={[{ label: t('projects:list.title'), href: PRJ.list() }, { label: p.name }]}
        badge={<StateBadge state={p.state} testId="p360-state" />}
        description={
          <span>
            <bdi dir="ltr">{unbroken(p.ref)}</bdi> · <bdi>{p.city}</bdi> · {t(`projects:kind.${p.kind}`)}
          </span>
        }
        actions={
          p.units && !p.setupRecordId ? (
            <div className="flex flex-wrap gap-2">
              <LinkButton variant="primary" icon={Grid3x3} href={PRJ.matrix({ project: p.id })} testId="p360-open-matrix">
                {t('projects:common.openMatrix')}
              </LinkButton>
              <LinkButton variant="quiet" href={PRJ.availability({ project: p.id })}>
                {t('projects:common.openAvailability')}
              </LinkButton>
            </div>
          ) : undefined
        }
      />
      <AreaNav current="projects" />
      <UrlTabs label={t('projects:tabs.label')} items={d.tabs.map((tab) => ({ id: tab.id, label: t(`projects:tabs.${tab.id}`) }))}>
        {(id) => <TabBody d={d} tab={d.tabs.find((x) => x.id === id)!} />}
      </UrlTabs>
      <ProvisionalNote />
    </div>
  );
}

/** The register address without a project: choose one of the projects the reader may open. */
function ChooseProject() {
  const { t } = useT();
  const q = useApiQuery<ProjectsPortfolio>({ method: 'GET', path: '/projects/portfolio' });
  return (
    <div className="space-y-5" data-testid="project-360-choose">
      <PageHeader title={t('projects:p360.title')} description={t('projects:p360.choose')} breadcrumbs={[{ label: t('projects:list.title'), href: PRJ.list() }, { label: t('projects:p360.title') }]} />
      <AreaNav current="projects" />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={4} />
      ) : (
        <ul className="space-y-2">
          {q.data.items.map((p) => (
            <li key={p.id}>
              <Link href={p.href} className="font-medium" data-testid="p360-choose-project">
                <bdi>{p.name}</bdi>
              </Link>{' '}
              <span className="text-sm text-muted">
                · <bdi dir="ltr">{unbroken(p.ref)}</bdi> · <bdi>{p.city}</bdi>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabBody({ d, tab }: { d: Project360; tab: Project360TabInfo }) {
  if (tab.state !== 'live' && tab.id !== 'documents') return <TabOutcome tab={tab} site={d.project.siteName} />;
  switch (tab.id as Project360Tab) {
    case 'overview':
      return <Overview d={d} />;
    case 'units':
      return <Units d={d} />;
    case 'leads':
      return <Leads d={d} />;
    case 'documents':
      return <Documents />;
    case 'activity':
      return <Activity d={d} />;
    default:
      return <TabOutcome tab={tab} site={d.project.siteName} />;
  }
}

function TabOutcome({ tab, site }: { tab: Project360TabInfo; site: string }) {
  const { t } = useT();
  const decision = tab.gate?.startsWith('E-');
  const [title, body, icon] =
    tab.state === 'planned'
      ? [t('projects:tabState.plannedTitle'), decision ? t('projects:tabState.plannedDecision', { gate: tab.gate! }) : t('projects:tabState.planned', { gate: tab.gate! }), CalendarClock]
      : tab.state === 'not_in_plan'
        ? [t('projects:tabState.notInPlanTitle'), t('projects:tabState.notInPlan', { site }), PackageX]
        : [t('projects:tabState.noPermissionTitle'), t('projects:tabState.noPermission'), Lock];
  return (
    <Panel className="mt-4" headingLevel={2} title={title}>
      <div className="flex items-start gap-3" data-testid="p360-tab-outcome" data-state={tab.state} data-tab={tab.id}>
        <Badge tone="neutral" icon={icon}>
          {tab.state === 'planned' ? (decision ? title : `${title} · ${tab.gate}`) : title}
        </Badge>
        <p className="min-w-0 text-sm text-text">{body}</p>
      </div>
    </Panel>
  );
}

function Overview({ d }: { d: Project360 }) {
  const { t } = useT();
  const f = useInvFormat();
  const p = d.project;
  const u = p.units;
  return (
    <div className="mt-4 space-y-5" data-testid="p360-overview">
      {d.setup && (
        <InlineAlert tone="info" data-testid="p360-setup-note">
          {t('projects:p360.setupNote')}{' '}
          <Link href={PRJ.setup({ record: d.setup.id })}>{t('projects:p360.setupLink')}</Link>
        </InlineAlert>
      )}
      {u && !d.setup && (
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
          <StatTile label={t('projects:bucket.available')} value={f.count(u.buckets.available)} accessibleValue={String(u.buckets.available)} context={u.fromPrice ? t('projects:list.fromPrice', { price: f.money(u.fromPrice) }) : undefined} href={PRJ.matrix({ project: p.id, bucket: 'available' })} icon={CheckCircle2} hue="teal" testId="p360-kpi-available" />
          <StatTile label={t('projects:bucket.held')} value={f.count(u.buckets.held)} accessibleValue={String(u.buckets.held)} href={PRJ.availability({ project: p.id })} icon={Lock} hue="amber" testId="p360-kpi-held" />
          <StatTile label={t('projects:bucket.reserved')} value={f.count(u.buckets.reserved)} accessibleValue={String(u.buckets.reserved)} href={PRJ.matrix({ project: p.id, bucket: 'reserved' })} icon={Bookmark} hue="sky" testId="p360-kpi-reserved" />
          <StatTile label={t('projects:list.kpi.booked')} value={f.count(u.buckets.booked)} accessibleValue={String(u.buckets.booked)} context={`${f.money(u.soldListValue)} · ${t('projects:list.kpi.bookedHint')}`} href={PRJ.matrix({ project: p.id, bucket: 'booked' })} icon={BadgeCheck} hue="slate" testId="p360-kpi-booked" />
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title={t('projects:p360.facts')}>
          <KeyValueList
            className="@container"
            items={[
              { label: t('projects:p360.code'), value: <bdi dir="ltr">{unbroken(p.ref)}</bdi> },
              { label: t('projects:p360.city'), value: <bdi>{p.city}</bdi> },
              { label: t('projects:p360.kind'), value: t(`projects:kind.${p.kind}`) },
              { label: t('projects:p360.site'), value: <bdi>{p.siteName}</bdi> },
              { label: t('projects:p360.entity'), value: <span><bdi>{p.legalEntityName}</bdi> <span className="text-xs text-muted">({t('projects:common.legalEntityNote')})</span></span> },
              { label: t('projects:p360.structure'), value: p.structure.towers > 0 ? t('projects:list.structureTowers', { towers: f.count(p.structure.towers), floors: f.count(p.structure.floors) }) : t('projects:list.structurePhases', { phases: f.count(p.structure.phases) }) },
              ...(p.storage ? [{ label: t('projects:p360.storageSummary'), value: <Link href={PRJ.storage({ project: p.id })}>{t('projects:p360.storageLine', { allocated: f.count(p.storage.allocated), total: f.count(p.storage.total) })}</Link> }] : []),
            ]}
          />
        </Panel>
        {d.inventory && d.inventory.length > 0 ? (
          <Panel title={t('projects:p360.byGroup')}>
            <GroupRows rows={d.inventory} projectId={p.id} />
          </Panel>
        ) : !u ? (
          <Panel title={t('projects:p360.byGroup')}>
            <Badge tone="neutral" icon={Lock} data-testid="p360-units-withheld">
              {t(`projects:withheld.${p.unitsWithheld ?? 'no_permission'}`)}
            </Badge>
          </Panel>
        ) : null}
      </div>
      {u && !d.setup && <SeedNote />}
    </div>
  );
}

function GroupRows({ rows, projectId }: { rows: InventoryGroupRow[]; projectId: string }) {
  const { t } = useT();
  const f = useInvFormat();
  return (
    <ul className="space-y-4" data-testid="p360-groups">
      {rows.map((r) => (
        <li key={r.id} className="space-y-2" data-testid="p360-group" data-group={r.id}>
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <Link href={r.href} className="font-semibold">
              {t(`projects:p360.group.${r.kind}`, { label: r.label })}
            </Link>
            <span className="text-muted">
              {t('projects:common.units', { count: r.total })}
              {r.floors ? ` · ${t('projects:p360.floors', { count: f.count(r.floors) })}` : ''}
            </span>
          </p>
          <BucketBar counts={r.buckets} total={r.total} hrefFor={(bucket) => PRJ.matrix({ project: projectId, ...(r.kind === 'tower' ? { tower: r.id } : { block: r.label }), bucket })} />
        </li>
      ))}
    </ul>
  );
}

function Units({ d }: { d: Project360 }) {
  const { t } = useT();
  const p = d.project;
  return (
    <div className="mt-4 space-y-4" data-testid="p360-units">
      <Panel title={t('projects:p360.unitsTitle')} description={t('projects:p360.unitsIntro')}>
        {d.inventory && d.inventory.length > 0 ? <GroupRows rows={d.inventory} projectId={p.id} /> : <EmptyState body={t('projects:p360.setupNote')} />}
      </Panel>
      {!d.setup && (
        <div className="flex flex-wrap gap-2">
          <LinkButton variant="primary" href={PRJ.matrix({ project: p.id })}>
            {t('projects:common.openMatrix')}
          </LinkButton>
          <LinkButton variant="secondary" href={PRJ.availability({ project: p.id })}>
            {t('projects:common.openAvailability')}
          </LinkButton>
          <LinkButton variant="quiet" href={PRJ.storage({ project: p.id })}>
            {t('projects:common.openStorage')}
          </LinkButton>
        </div>
      )}
    </div>
  );
}

function Leads({ d }: { d: Project360 }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const f = useInvFormat();
  const l = d.leads;
  if (!l) return null;
  return (
    <div className="mt-4 space-y-4" data-testid="p360-leads">
      <Panel title={t('projects:p360.leadsTitle')} description={t('projects:p360.leadsTotal', { count: f.count(l.total) })} actions={<LinkButton size="sm" variant="quiet" href={PRJ.leads}>{t('projects:p360.leadsAll')}</LinkButton>}>
        {l.items.length === 0 ? (
          <p className="text-sm text-muted">{t('projects:p360.leadsEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {l.items.map((x) => (
              <li key={x.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm" data-testid="p360-lead">
                <div className="min-w-0">
                  <Link href={PRJ.lead(x.id)} className="font-medium">
                    <bdi>{x.name}</bdi>
                  </Link>{' '}
                  <span className="text-muted">
                    · <bdi dir="ltr">{unbroken(x.ref)}</bdi>
                  </span>
                  <p className="text-muted">
                    {t('projects:p360.owner')}: <bdi>{x.ownerName}</bdi> · <DateTime value={x.createdAt} style="date" />
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{dt(`status:lead.${x.status}`)}</Badge>
                  <span className="font-medium">
                    <bdi dir="ltr">{f.money(x.budget)}</bdi>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {Object.keys(l.byStatus).length > 0 && (
        <Panel title={t('projects:p360.byStatus')}>
          <ul className="flex flex-wrap gap-2 text-sm">
            {Object.entries(l.byStatus).map(([status, n]) => (
              <li key={status} className="rounded-pill border border-border px-3 py-1">
                {dt(`status:lead.${status}`)} <span className="font-semibold">{f.count(n)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function Documents() {
  const { t } = useT();
  return (
    <Panel className="mt-4" title={t('projects:p360.documentsTitle')}>
      <div className="flex items-start gap-3" data-testid="p360-documents" data-state="planned">
        <Badge tone="neutral" icon={CalendarClock}>{`${t('projects:tabState.plannedTitle')} · E.13`}</Badge>
        <p className="min-w-0 text-sm text-text">{t('projects:p360.documentsEmpty')}</p>
      </div>
    </Panel>
  );
}

function Activity({ d }: { d: Project360 }) {
  const { t } = useT();
  const text = useEventText();
  return (
    <Panel className="mt-4" title={t('projects:p360.activityTitle')}>
      {d.activity.length === 0 ? (
        <p className="text-sm text-muted" data-testid="p360-activity-empty">
          {t('projects:p360.activityEmpty')}
        </p>
      ) : (
        <ol className="space-y-3 border-s border-border ps-4" data-testid="p360-activity">
          {d.activity.map((e) => (
            <li key={e.id} className="text-sm" data-kind={e.kind}>
              <p className="text-text">{text(e)}</p>
              <p className="text-xs text-muted">
                <DateTime value={e.at} style="dateTime" />
                {e.note && !e.kind.startsWith('unit_') && e.kind !== 'setup_saved' ? <> · <bdi>{e.note}</bdi></> : null}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
