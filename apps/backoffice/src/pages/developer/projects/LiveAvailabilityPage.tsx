import { ApiError, AVAILABILITY_BUCKETS, type AvailabilitySnapshot } from '@repo/contracts';
import { Badge, Button, EmptyState, ErrorState, Link, NotFoundState, PageHeader, Panel, SelectControl, StatTile, useApiQuery, useIsTabletUp, useQueryParam, useQueryParams, useT } from '@repo/ui';
import { BadgeCheck, Ban, Bookmark, CheckCircle2, Clock3, History, Lock, RefreshCw } from 'lucide-react';
import { Loading, ScrollRegion } from '../../society/kit';
import { LinkButton } from '../../society/hr/hkit';
import { AreaNav, BucketBar, PRJ, ProvisionalNote, SeedNote, unbroken, useInvFormat } from './pkit';
import { UnitDrawer } from './UnitDrawer';

/**
 * INV-008 live availability: available, held, reserved and booked units right now, derived from the
 * units and the holds in force on every request (never stored counts). A hold counts only until it
 * expires (the Issue #23 rule); expired holds are listed apart as history. The view refreshes every
 * 30 seconds and at once after any change (every mutation refreshes every query), and a unit opens
 * the quick view in place, where its holder can release it.
 */
const ICONS = { available: CheckCircle2, held: Lock, reserved: Bookmark, booked: BadgeCheck, unavailable: Ban } as const;
const HUES = { available: 'teal', held: 'amber', reserved: 'sky', booked: 'slate', unavailable: 'slate' } as const;

export default function LiveAvailabilityPage() {
  const { t } = useT();
  const f = useInvFormat();
  const set = useQueryParams();
  const [project] = useQueryParam('project');
  const [unit] = useQueryParam('unit');
  const isWide = useIsTabletUp();
  const q = useApiQuery<AvailabilitySnapshot>({ method: 'GET', path: '/inventory/availability', query: project ? { project } : {} }, { refetchInterval: 30_000, placeholderData: (prev) => prev, retry: false });
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.problem.status === 404) return <NotFoundState headingLevel={1} actions={<LinkButton href={PRJ.availability()}>{t('projects:availability.allProjects')}</LinkButton>} />;
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  }
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  const remaining = (until: string) => {
    const ms = Math.max(0, Date.parse(until) - Date.parse(d.asOf));
    return t('projects:availability.remaining', { hours: f.count(Math.floor(ms / 3_600_000)), minutes: f.count(Math.floor((ms % 3_600_000) / 60_000)) });
  };
  const matrixFor = (projectId: string | undefined, extra: Record<string, string> = {}) => PRJ.matrix({ ...(projectId ? { project: projectId } : {}), ...extra });
  return (
    <div className="@container space-y-5" data-testid="live-availability" data-as-of={d.asOf}>
      <PageHeader
        title={t('projects:availability.title')}
        description={t('projects:availability.intro')}
        actions={
          <Button variant="secondary" icon={RefreshCw} onPress={() => void q.refetch()} isPending={q.isFetching} data-testid="availability-refresh">
            {t('projects:common.refresh')}
          </Button>
        }
      />
      <AreaNav current="availability" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted" role="status" data-testid="availability-as-of">
          {t('projects:common.asOf', { time: f.when(d.asOf) })} · {t('projects:availability.autoRefresh')}
        </p>
        {(d.projects.length > 1 || project) && (
          <div className="w-full max-w-xs">
            <SelectControl label={t('projects:availability.project')} value={project ?? 'all'} onChange={(v) => set({ project: !v || v === 'all' ? null : v })} options={[{ id: 'all', label: t('projects:availability.allProjects') }, ...d.projects.map((p) => ({ id: p.projectId, label: p.name }))]} testId="availability-project" />
          </div>
        )}
      </div>
      {d.projects.length === 0 ? (
        <EmptyState title={t('projects:availability.noProjects')} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-5" data-testid="availability-totals">
            {AVAILABILITY_BUCKETS.map((b) => (
              <StatTile
                key={b}
                label={t(`projects:bucket.${b}`)}
                value={f.count(d.counts[b])}
                accessibleValue={String(d.counts[b])}
                href={matrixFor(project ?? undefined, { bucket: b })}
                icon={ICONS[b]}
                hue={HUES[b]}
                testId={`availability-total-${b}`}
              />
            ))}
          </div>
          {d.projects.map((p) => (
            <Panel key={p.projectId} title={p.name} description={t('projects:common.units', { count: p.total })} actions={<LinkButton size="sm" variant="quiet" href={PRJ.p360(p.projectId)}>{t('projects:common.open360')}</LinkButton>}>
              <div className="space-y-4" data-testid="availability-project" data-project={p.projectId}>
                <BucketBar counts={p.counts} total={p.total} hrefFor={(b) => matrixFor(p.projectId, { bucket: b })} />
                {isWide ? (
                  <ScrollRegion label={t('projects:availability.tableCaption', { project: p.name })}>
                    <table className="w-full text-sm">
                      <caption className="sr-only">{t('projects:availability.tableCaption', { project: p.name })}</caption>
                      <thead>
                        <tr className="border-b border-border text-xs text-muted">
                          <th scope="col" className="px-2 py-2 text-start font-medium">
                            {t('projects:availability.group')}
                          </th>
                          {AVAILABILITY_BUCKETS.map((b) => (
                            <th key={b} scope="col" className="px-2 py-2 text-end font-medium">
                              {t(`projects:bucket.${b}`)}
                            </th>
                          ))}
                          <th scope="col" className="px-2 py-2 text-end font-medium">
                            {t('projects:availability.total')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.rows.map((r) => (
                          <tr key={r.id} className="border-b border-border/60" data-testid="availability-row" data-group={r.id}>
                            <th scope="row" className="px-2 py-2 text-start font-medium">
                              <Link href={r.href}>{r.kind === 'tower' ? t('projects:p360.group.tower', { label: r.label }) : r.label}</Link>
                            </th>
                            {AVAILABILITY_BUCKETS.map((b) => (
                              <td key={b} className="px-2 py-2 text-end tabular-nums" data-bucket={b}>
                                {r.buckets[b] > 0 ? <Link href={matrixFor(p.projectId, { ...(r.kind === 'tower' ? { tower: r.id } : { block: r.label }), bucket: b })}>{f.count(r.buckets[b])}</Link> : f.count(0)}
                              </td>
                            ))}
                            <td className="px-2 py-2 text-end font-semibold tabular-nums">{f.count(r.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollRegion>
                ) : (
                  <ul className="space-y-3">
                    {p.rows.map((r) => (
                      <li key={r.id} className="space-y-2 rounded-tile border border-border/70 p-3" data-testid="availability-row" data-group={r.id}>
                        <p className="text-sm font-semibold">
                          <Link href={r.href}>{r.kind === 'tower' ? t('projects:p360.group.tower', { label: r.label }) : r.label}</Link> <span className="font-normal text-muted">· {t('projects:common.units', { count: r.total })}</span>
                        </p>
                        <BucketBar counts={r.buckets} total={r.total} hrefFor={(b) => matrixFor(p.projectId, { ...(r.kind === 'tower' ? { tower: r.id } : { block: r.label }), bucket: b })} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          ))}
        </>
      )}
      <Panel title={t('projects:availability.holdsTitle')}>
        {d.holds.length === 0 ? (
          <p className="text-sm text-muted" data-testid="availability-holds-empty">
            {t('projects:availability.holdsEmpty')}
          </p>
        ) : (
          <ul className="divide-y divide-border" data-testid="availability-holds">
            {d.holds.map((h) => (
              <li key={h.unitId} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm" data-testid="availability-hold" data-unit={h.unitId} data-mine={h.mine}>
                <div className="min-w-0 space-y-0.5">
                  <p>
                    <button type="button" className="rounded-control font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus" onClick={() => set({ unit: h.unitId }, { replace: false })} data-testid="availability-hold-open">
                      <bdi dir="ltr">{unbroken(h.unitRef)}</bdi>
                    </button>{' '}
                    <span className="text-muted">· {h.projectName}</span>
                  </p>
                  <p className="text-muted">
                    {t('projects:availability.holder', { name: h.holderName || '—' })}
                    {h.leadRef ? <> · <bdi dir="ltr">{unbroken(h.leadRef)}</bdi></> : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {h.mine && <Badge tone="info">{t('projects:availability.mine')}</Badge>}
                  <Badge tone="warning" icon={Clock3}>
                    {remaining(h.until)}
                  </Badge>
                  <span className="text-xs text-muted">{t('projects:availability.expires', { until: f.when(h.until) })}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {d.lapsed.length > 0 && (
        <Panel title={t('projects:availability.lapsedTitle')} description={t('projects:availability.lapsedIntro')}>
          <ul className="space-y-1.5 text-sm" data-testid="availability-lapsed">
            {d.lapsed.map((h) => (
              <li key={h.unitId} className="flex flex-wrap items-center gap-2" data-unit={h.unitId}>
                <History aria-hidden className="size-4 text-muted" />
                <bdi dir="ltr" className="font-medium">
                  {unbroken(h.unitRef)}
                </bdi>
                <span className="text-muted">
                  · {h.projectName} · {t('projects:availability.lapsedRow', { until: f.when(h.until) })}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title={t('projects:availability.seededTitle')}>
        <p className="text-sm text-text" data-testid="availability-seeded">
          {t('projects:availability.seeded', { held: f.count(d.seeded.held), reserved: f.count(d.seeded.reserved), booked: f.count(d.seeded.booked) })}
        </p>
      </Panel>
      <SeedNote />
      <ProvisionalNote />
      <UnitDrawer unitId={unit} onClose={() => set({ unit: null })} />
    </div>
  );
}
