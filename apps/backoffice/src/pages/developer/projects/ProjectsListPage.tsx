import { PROJECT_FILTERS, PROJECT_SORTS, type ProjectFilter, type ProjectSort, type ProjectsPortfolio, type ProjectSummary } from '@repo/contracts';
import { Badge, EmptyState, ErrorState, FilterPills, Link, PageHeader, PlainTextField, SelectControl, StatTile, useApiQuery, useQueryParam, useQueryParams, useT } from '@repo/ui';
import { BadgeCheck, Building2, CheckCircle2, ClipboardList, FilePlus2, Grid3x3, Lock } from 'lucide-react';
import { Loading } from '../../society/kit';
import { LinkButton } from '../../society/hr/hkit';
import { AreaNav, BucketBar, PRJ, ProvisionalNote, SeedNote, StateBadge, unbroken, useInvFormat } from './pkit';

/**
 * PRJ-001 projects list: the projects the reader may see (the header project narrows it), searched,
 * filtered by kind and city and sorted; each project's inventory computed from its units now, each
 * figure opening the units behind it, and the reasons figures are withheld (licence or role) in words.
 */
export default function ProjectsListPage() {
  const { t } = useT();
  const f = useInvFormat();
  const set = useQueryParams();
  const [kindParam] = useQueryParam('kind');
  const [sortParam] = useQueryParam('sort');
  const [city] = useQueryParam('city');
  const [search] = useQueryParam('q');
  const kind: ProjectFilter = (PROJECT_FILTERS as readonly string[]).includes(kindParam ?? '') ? (kindParam as ProjectFilter) : 'all';
  const sort: ProjectSort = (PROJECT_SORTS as readonly string[]).includes(sortParam ?? '') ? (sortParam as ProjectSort) : 'name';
  const query = { kind, sort, ...(city ? { city } : {}), ...(search ? { q: search } : {}) };
  // The list on screen stays while a filter changes (the search field keeps focus).
  const q = useApiQuery<ProjectsPortfolio>({ method: 'GET', path: '/projects/portfolio', query }, { placeholderData: (prev) => prev });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  const b = d.totals.buckets;
  const filtered = kind !== 'all' || !!city || !!search;
  return (
    <div className="@container space-y-5" data-testid="projects-list">
      <PageHeader
        title={t('projects:list.title')}
        description={t('projects:list.intro')}
        actions={
          <div className="flex flex-wrap gap-2">
            {d.canSetUp && (
              <LinkButton variant="primary" icon={FilePlus2} href={PRJ.setup({ new: '1' })} testId="projects-set-up">
                {t('projects:list.setUp')}
              </LinkButton>
            )}
            <LinkButton variant="quiet" icon={Grid3x3} href={PRJ.matrix()} testId="projects-open-matrix">
              {t('projects:common.openMatrix')}
            </LinkButton>
          </div>
        }
      />
      <AreaNav current="projects" />
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-5">
        <StatTile label={t('projects:list.kpi.projects')} value={f.count(d.totals.projects)} accessibleValue={String(d.totals.projects)} href={PRJ.list()} icon={Building2} hue="emerald" testId="prj-kpi-projects" />
        <StatTile label={t('projects:list.kpi.units')} value={f.count(d.totals.units)} accessibleValue={String(d.totals.units)} href={PRJ.matrix()} icon={Grid3x3} hue="sky" testId="prj-kpi-units" />
        <StatTile label={t('projects:list.kpi.available')} value={f.count(b.available)} accessibleValue={String(b.available)} href={PRJ.matrix({ bucket: 'available' })} icon={CheckCircle2} hue="teal" testId="prj-kpi-available" />
        <StatTile label={t('projects:list.kpi.held')} value={f.count(b.held)} accessibleValue={String(b.held)} href={PRJ.availability()} icon={Lock} hue="amber" testId="prj-kpi-held" />
        <StatTile label={t('projects:list.kpi.booked')} value={f.count(b.booked)} accessibleValue={String(b.booked)} context={t('projects:list.kpi.bookedHint')} href={PRJ.matrix({ bucket: 'booked' })} icon={BadgeCheck} hue="slate" testId="prj-kpi-booked" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <FilterPills label={t('projects:list.filterLabel')} options={PROJECT_FILTERS.map((x) => ({ id: x, label: t(`projects:list.filter.${x}`), count: d.counts[x] }))} value={kind} onChange={(v) => set({ kind: v === 'all' ? null : v })} testId="projects-filter" />
        {d.cities.length > 1 && (
          <div className="w-full max-w-xs">
            <SelectControl label={t('projects:list.city')} value={city ?? 'all'} onChange={(v) => set({ city: !v || v === 'all' ? null : v })} options={[{ id: 'all', label: t('projects:list.allCities') }, ...d.cities.map((c) => ({ id: c, label: c }))]} testId="projects-city" />
          </div>
        )}
        <div className="w-full max-w-xs">
          <SelectControl label={t('projects:list.sort')} value={sort} onChange={(v) => set({ sort: !v || v === 'name' ? null : v })} options={PROJECT_SORTS.map((s) => ({ id: s, label: t(`projects:list.sorts.${s}`) }))} testId="projects-sort" />
        </div>
        <div className="w-full max-w-sm">
          <PlainTextField label={t('projects:list.search')} value={search ?? ''} onChange={(v) => set({ q: v.trim() ? v : null })} optional testId="projects-search" />
        </div>
      </div>
      {d.inSetup > 0 && (
        <p className="text-sm">
          <Link href={PRJ.setup()} data-testid="projects-in-setup">
            <ClipboardList aria-hidden className="me-1 inline size-4" />
            {t('projects:list.inSetup', { count: d.inSetup })}
          </Link>
        </p>
      )}
      {d.items.length === 0 ? (
        <EmptyState title={t(filtered ? 'projects:list.emptyFiltered' : 'projects:list.empty')} body={t('projects:list.emptyHint')} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 @4xl:grid-cols-2" data-testid="project-cards">
          {d.items.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </ul>
      )}
      <SeedNote />
      <ProvisionalNote />
    </div>
  );
}

function ProjectCard({ p }: { p: ProjectSummary }) {
  const { t } = useT();
  const f = useInvFormat();
  return (
    <li className="min-w-0 space-y-3 rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="project-card" data-project={p.id} aria-label={t('projects:list.cardLabel', { name: p.name })}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h2 className="text-base font-semibold break-words text-text">
            <Link href={p.href} data-testid="project-open">
              <bdi>{p.name}</bdi>
            </Link>
          </h2>
          <p className="text-sm text-muted">
            <bdi dir="ltr" className="font-medium">{unbroken(p.ref)}</bdi> · <bdi>{p.city}</bdi> · {t(`projects:kind.${p.kind}`)} · {t('projects:list.site')}: <bdi>{p.siteName}</bdi>
          </p>
          <p className="text-sm text-muted">{p.structure.towers > 0 ? t('projects:list.structureTowers', { towers: f.count(p.structure.towers), floors: f.count(p.structure.floors) }) : t('projects:list.structurePhases', { phases: f.count(p.structure.phases) })}</p>
        </div>
        <StateBadge state={p.state} testId="project-state" />
      </div>
      {p.setupRecordId ? (
        <p className="text-sm text-muted">{t('projects:list.newProject')}</p>
      ) : p.units ? (
        <>
          <BucketBar counts={p.units.buckets} total={p.units.total} testId="project-buckets" hrefFor={(bucket) => PRJ.matrix({ project: p.id, bucket })} />
          <p className="text-sm text-text">
            {t('projects:common.units', { count: p.units.total })} · {p.units.fromPrice ? t('projects:list.fromPrice', { price: f.money(p.units.fromPrice) }) : t('projects:list.noneAvailable')}
          </p>
        </>
      ) : (
        <Badge tone="neutral" icon={Lock} data-testid="project-units-withheld" data-reason={p.unitsWithheld}>
          {t(`projects:withheld.${p.unitsWithheld ?? 'no_permission'}`)}
        </Badge>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        {p.leads && <span data-testid="project-leads">{t('projects:list.leads', { open: f.count(p.leads.open), total: f.count(p.leads.total) })}</span>}
        {p.storage && p.storage.total > 0 && <span>{t('projects:list.storage', { allocated: f.count(p.storage.allocated), total: f.count(p.storage.total) })}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <LinkButton size="sm" variant="secondary" href={p.href} testId="project-open-360">
          {t('projects:common.open360')}
        </LinkButton>
        {p.units && !p.setupRecordId && (
          <>
            <LinkButton size="sm" variant="quiet" href={PRJ.matrix({ project: p.id })}>
              {t('projects:common.openMatrix')}
            </LinkButton>
            <LinkButton size="sm" variant="quiet" href={PRJ.availability({ project: p.id })}>
              {t('projects:common.openAvailability')}
            </LinkButton>
          </>
        )}
      </div>
    </li>
  );
}
