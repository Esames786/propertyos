import { ApiError, AVAILABILITY_BUCKETS, UNIT_DELIVERY_STATES, type AvailabilityBucket, type MatrixCell, type MatrixGroup, type UnitMatrix } from '@repo/contracts';
import { useLocale } from '@repo/i18n';
import { Button, cn, EmptyState, ErrorState, FilterPills, NotFoundState, PageHeader, PlainTextField, SegmentedControl, SelectControl, useApiQuery, useIsTabletUp, useNavigation, useQueryParams, useT } from '@repo/ui';
import { Package, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Loading, ScrollRegion } from '../../society/kit';
import { LinkButton } from '../../society/hr/hkit';
import { AreaNav, BUCKET_CELL, BucketBadge, PRJ, ProvisionalNote, SeedNote, unbroken, useInvFormat } from './pkit';
import { UnitDrawer, useWhere } from './UnitDrawer';

/**
 * INV-001 unit matrix: every unit of one project as a tower → floor → position grid (or plots by phase),
 * with availability, type, tower, floor, delivery, price, area and reference filters in the address.
 * Status is written in each cell and drawn as a pattern, never told by colour alone. The grid is one
 * keyboard stop (arrow keys inside, Enter opens); a list with the same units and the same drawer is the
 * alternative, and the only view on narrow screens (320 px at 200 % text). Opening a unit opens the
 * INV-002 quick view over the matrix (`?unit=`).
 */

const FILTER_KEYS = ['tower', 'block', 'floor', 'type', 'delivery', 'q', 'minPrice', 'maxPrice', 'minArea', 'maxArea'] as const;
const UNIT_TYPES = ['apartment_1bed', 'apartment_2bed', 'apartment_3bed', 'penthouse', 'villa', 'plot', 'shop'] as const;
const PAGE = 60;

export default function UnitMatrixPage() {
  const { t } = useT();
  const set = useQueryParams();
  const { location } = useNavigation();
  const params = new URLSearchParams(location.search);
  const get = (k: string) => params.get(k) ?? undefined;
  const record = get('record');
  // Addresses from the dashboard and search name a tower, a phase, a unit type or a unit as `record`.
  const fromRecord = record?.startsWith('twr_') ? { tower: record } : record?.startsWith('blk_') ? { block: record } : record && (UNIT_TYPES as readonly string[]).includes(record) ? { type: record } : {};
  const filters: Record<string, string> = Object.fromEntries([...FILTER_KEYS.map((k) => [k, get(k)] as const), ...Object.entries(fromRecord)].filter((e): e is [string, string] => !!e[1]));
  const project = get('project');
  const bucketParam = get('bucket');
  const bucket = (AVAILABILITY_BUCKETS as readonly string[]).includes(bucketParam ?? '') ? (bucketParam as AvailabilityBucket) : undefined;
  const unitId = get('unit') ?? (record?.startsWith('unt_') ? record : undefined);
  const isWide = useIsTabletUp();
  const view = isWide && get('view') !== 'list' ? 'grid' : 'list';
  const [more, setMore] = useState(Object.keys(filters).some((k) => k !== 'q'));
  const query = { ...(project ? { project } : {}), ...filters, ...(bucket ? { bucket } : {}) };
  const q = useApiQuery<UnitMatrix>({ method: 'GET', path: '/inventory/matrix', query }, { placeholderData: (prev) => prev, retry: false });
  const closeUnit = () => set({ unit: null, ...(record?.startsWith('unt_') ? { record: null } : {}) });

  if (q.isError) {
    if (q.error instanceof ApiError && q.error.problem.status === 404) return <NotFoundState headingLevel={1} actions={<LinkButton href={PRJ.matrix()}>{t('projects:matrix.clear')}</LinkButton>} />;
    return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  }
  if (!q.data) return <Loading lines={12} />;
  const m = q.data;
  if (!m.project) {
    return (
      <div className="space-y-5" data-testid="unit-matrix" data-project="none">
        <PageHeader title={t('projects:matrix.title')} />
        <EmptyState title={t('projects:matrix.noProject')} />
      </div>
    );
  }
  const towers = m.groups.filter((g) => g.kind === 'tower');
  const phases = m.groups.filter((g) => g.kind === 'phase');
  const tower = towers.find((g) => g.id === filters.tower);
  const levels = [...new Set((tower ? [tower] : towers).flatMap((g) => g.floors!.map((f) => f.level)))].sort((a, b) => a - b);
  const anyFilter = Object.keys(filters).length > 0 || !!bucket;
  const clear = () => set({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), bucket: null, record: null });
  return (
    <div className="@container space-y-5" data-testid="unit-matrix" data-project={m.project.id} data-view={view}>
      <PageHeader
        title={t('projects:matrix.title')}
        description={t('projects:matrix.intro')}
        breadcrumbs={[{ label: t('projects:list.title'), href: PRJ.list() }, { label: m.project.name, href: PRJ.p360(m.project.id) }, { label: t('projects:matrix.title') }]}
        actions={
          <LinkButton variant="quiet" href={PRJ.availability({ project: m.project.id })}>
            {t('projects:common.openAvailability')}
          </LinkButton>
        }
      />
      <AreaNav current="matrix" />
      <div className="flex flex-wrap items-end gap-3">
        {m.projects.length > 1 && (
          <div className="w-full max-w-xs">
            <SelectControl label={t('projects:matrix.project')} value={m.project.id} onChange={(v) => v && set({ project: v, ...Object.fromEntries(['tower', 'block', 'floor', 'unit', 'record'].map((k) => [k, null])) })} options={m.projects.map((p) => ({ id: p.id, label: p.name }))} testId="matrix-project" />
          </div>
        )}
        {isWide && (
          <SegmentedControl label={t('projects:matrix.view')} options={[{ id: 'grid', label: t('projects:matrix.grid') }, { id: 'list', label: t('projects:matrix.list') }]} value={view} onChange={(v) => set({ view: v === 'grid' ? null : v })} testId="matrix-view" />
        )}
      </div>
      <FilterPills
        label={t('projects:matrix.filterLabel')}
        options={[{ id: 'all' as const, label: t('projects:matrix.all'), count: m.total }, ...AVAILABILITY_BUCKETS.map((b) => ({ id: b, label: t(`projects:bucket.${b}`), count: m.counts[b] }))]}
        value={bucket ?? 'all'}
        onChange={(v) => set({ bucket: v === 'all' ? null : v })}
        testId="matrix-bucket"
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <PlainTextField label={t('projects:matrix.search')} value={filters.q ?? ''} onChange={(v) => set({ q: v.trim() ? v : null })} optional dir="ltr" testId="matrix-search" />
        </div>
        <Button variant="quiet" icon={SlidersHorizontal} onPress={() => setMore((x) => !x)} aria-expanded={more} aria-controls="matrix-more" data-testid="matrix-more-toggle">
          {more ? t('projects:matrix.fewer') : t('projects:matrix.more')}
        </Button>
        {anyFilter && (
          <Button variant="quiet" icon={X} onPress={clear} data-testid="matrix-clear">
            {t('projects:matrix.clear')}
          </Button>
        )}
      </div>
      {more && (
        <div id="matrix-more" className="grid grid-cols-1 gap-3 rounded-tile border border-border/70 bg-panel p-4 @md:grid-cols-2 @4xl:grid-cols-4" data-testid="matrix-more">
          {towers.length > 0 && (
            <SelectControl label={t('projects:matrix.tower')} value={filters.tower ?? 'all'} onChange={(v) => set({ tower: !v || v === 'all' ? null : v, floor: null, record: null })} options={[{ id: 'all', label: t('projects:matrix.allTowers') }, ...towers.map((g) => ({ id: g.id, label: g.label }))]} testId="matrix-tower" />
          )}
          {towers.length > 0 && (
            <SelectControl label={t('projects:matrix.floor')} value={filters.floor ?? 'all'} onChange={(v) => set({ floor: !v || v === 'all' ? null : v })} options={[{ id: 'all', label: t('projects:matrix.allFloors') }, ...levels.map((l) => ({ id: String(l), label: String(l) }))]} testId="matrix-floor" />
          )}
          {phases.length > 0 && (
            <SelectControl label={t('projects:matrix.phase')} value={phases.find((g) => g.id === filters.block || g.label === filters.block)?.id ?? 'all'} onChange={(v) => set({ block: !v || v === 'all' ? null : v, record: null })} options={[{ id: 'all', label: t('projects:matrix.allPhases') }, ...phases.map((g) => ({ id: g.id, label: g.label }))]} testId="matrix-phase" />
          )}
          <SelectControl label={t('projects:matrix.type')} value={filters.type ?? 'all'} onChange={(v) => set({ type: !v || v === 'all' ? null : v, record: null })} options={[{ id: 'all', label: t('projects:matrix.allTypes') }, ...m.types.map((x) => ({ id: x, label: t(`crm:types.${x}`) }))]} testId="matrix-type" />
          <SelectControl label={t('projects:matrix.delivery')} value={filters.delivery ?? 'all'} onChange={(v) => set({ delivery: !v || v === 'all' ? null : v })} options={[{ id: 'all', label: t('projects:matrix.allDelivery') }, ...UNIT_DELIVERY_STATES.map((x) => ({ id: x, label: t(`projects:delivery.${x}`) }))]} testId="matrix-delivery" />
          <PlainTextField label={t('projects:matrix.minPrice')} value={filters.minPrice ?? ''} onChange={(v) => set({ minPrice: /^\d+$/.test(v.trim()) ? v.trim() : null })} optional inputMode="numeric" dir="ltr" testId="matrix-min-price" />
          <PlainTextField label={t('projects:matrix.maxPrice')} value={filters.maxPrice ?? ''} onChange={(v) => set({ maxPrice: /^\d+$/.test(v.trim()) ? v.trim() : null })} optional inputMode="numeric" dir="ltr" testId="matrix-max-price" />
          <PlainTextField label={t('projects:matrix.minArea')} value={filters.minArea ?? ''} onChange={(v) => set({ minArea: /^\d+$/.test(v.trim()) ? v.trim() : null })} optional inputMode="numeric" dir="ltr" testId="matrix-min-area" />
          <PlainTextField label={t('projects:matrix.maxArea')} value={filters.maxArea ?? ''} onChange={(v) => set({ maxArea: /^\d+$/.test(v.trim()) ? v.trim() : null })} optional inputMode="numeric" dir="ltr" testId="matrix-max-area" />
        </div>
      )}
      <p className="text-sm text-muted" role="status" data-testid="matrix-matched" data-matched={m.matched} data-total={m.total}>
        {t('projects:matrix.matched', { matched: String(m.matched), total: String(m.total) })}
      </p>
      {view === 'grid' ? <Grids m={m} onOpen={(id) => set({ unit: id }, { replace: false })} /> : <UnitList m={m} onOpen={(id) => set({ unit: id }, { replace: false })} />}
      <SeedNote />
      <ProvisionalNote />
      <UnitDrawer unitId={unitId ?? null} onClose={closeUnit} />
    </div>
  );
}

/** The last part of a reference (floor and position "1204", or plot "017"). */
const shortRef = (ref: string) => ref.slice(ref.lastIndexOf('-') + 1);

function Grids({ m, onOpen }: { m: UnitMatrix; onOpen: (id: string) => void }) {
  const { t } = useT();
  const shown = m.groups.filter((g) => (g.floors ?? []).some((f) => f.cells.some((c) => c.match)) || (g.cells ?? []).some((c) => c.match));
  if (shown.length === 0) return <EmptyState title={t('projects:matrix.noneMatch')} />;
  return (
    <div className="space-y-6" data-testid="matrix-grids">
      <p className="text-xs text-muted" id="matrix-keys">
        {t('projects:matrix.keyboardHint')}
      </p>
      {shown.map((g) => (
        <section key={g.id} aria-labelledby={`grp-${g.id}`} className="space-y-2" data-testid="matrix-group" data-group={g.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`grp-${g.id}`} className="text-base font-semibold text-text">
              {g.kind === 'tower' ? t('projects:p360.group.tower', { label: g.label }) : g.label}
            </h2>
            <GroupCounts g={g} />
          </div>
          <ScrollRegion label={g.kind === 'tower' ? t('projects:matrix.gridLabel', { tower: g.label }) : t('projects:matrix.phaseGridLabel', { phase: g.label })}>
            <UnitGrid g={g} onOpen={onOpen} />
          </ScrollRegion>
        </section>
      ))}
    </div>
  );
}

function GroupCounts({ g }: { g: MatrixGroup }) {
  const { t } = useT();
  const f = useInvFormat();
  return (
    <p className="text-xs text-muted">
      {AVAILABILITY_BUCKETS.filter((b) => g.counts[b] > 0)
        .map((b) => t('projects:common.count', { label: t(`projects:bucket.${b}`), count: f.count(g.counts[b]) }))
        .join(' · ')}
    </p>
  );
}

/**
 * One tower (floors × positions) or one phase (plots in rows of ten) as an ARIA grid with a single tab
 * stop: arrow keys follow the reading direction, Home and End go to the ends of a row, Control+Home and
 * Control+End to the first and last unit; Enter or Space opens the unit.
 */
function UnitGrid({ g, onOpen }: { g: MatrixGroup; onOpen: (id: string) => void }) {
  const { t } = useT();
  const { dir } = useLocale();
  const f = useInvFormat();
  const ref = useRef<HTMLDivElement>(null);
  const rows: Array<{ id: string; header?: string; cells: MatrixCell[] }> = useMemo(
    () =>
      g.kind === 'tower'
        ? g.floors!.map((fl) => ({ id: fl.id, header: t('projects:matrix.floorRow', { level: String(fl.level) }), cells: fl.cells }))
        : Array.from({ length: Math.ceil(g.cells!.length / 10) }, (_, i) => ({ id: `${g.id}-${i}`, cells: g.cells!.slice(i * 10, i * 10 + 10) })),
    [g, t],
  );
  const first = rows.flatMap((r, ri) => r.cells.map((c, ci) => ({ c, ri, ci }))).find((x) => x.c.match) ?? { ri: 0, ci: 0 };
  const [active, setActive] = useState<[number, number]>([first.ri, first.ci]);
  const [ar, ac] = rows[active[0]]?.cells[active[1]] ? active : [first.ri, first.ci];
  const move = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(rows.length - 1, r));
    const cc = Math.max(0, Math.min(rows[rr]!.cells.length - 1, c));
    setActive([rr, cc]);
    ref.current?.querySelector<HTMLButtonElement>(`[data-pos="${rr}-${cc}"]`)?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const fwd = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    const keys: Record<string, () => void> = {
      [fwd]: () => move(ar, ac + 1),
      [back]: () => move(ar, ac - 1),
      ArrowDown: () => move(ar + 1, ac),
      ArrowUp: () => move(ar - 1, ac),
      Home: () => (e.ctrlKey ? move(0, 0) : move(ar, 0)),
      End: () => (e.ctrlKey ? move(rows.length - 1, rows[rows.length - 1]!.cells.length - 1) : move(ar, rows[ar]!.cells.length - 1)),
    };
    const act = keys[e.key];
    if (act) {
      e.preventDefault();
      act();
    }
  };
  const cols = Math.max(...rows.map((r) => r.cells.length));
  // Every row lays out its cells on the same column template, so floors line up under each other.
  const template = `${g.kind === 'tower' ? 'minmax(5.5rem,auto) ' : ''}repeat(${cols}, minmax(4.75rem, 1fr))`;
  return (
    <div
      ref={ref}
      role="grid"
      aria-labelledby={`grp-${g.id}`}
      aria-describedby="matrix-keys"
      aria-rowcount={rows.length}
      aria-colcount={cols + (g.kind === 'tower' ? 1 : 0)}
      onKeyDown={onKeyDown}
      className="flex min-w-max flex-col gap-1.5 p-1"
      data-testid="matrix-grid"
    >
      {rows.map((r, ri) => (
        <div key={r.id} role="row" aria-rowindex={ri + 1} className="grid gap-1.5" style={{ gridTemplateColumns: template }}>
          {r.header && (
            <div role="rowheader" className="flex items-center text-xs font-medium text-muted">
              {r.header}
            </div>
          )}
          {r.cells.map((c, ci) => {
            const status = t(`projects:bucket.${c.bucket}`);
            const extra = `${c.hold?.until ? t('projects:matrix.heldUntil', { until: f.when(c.hold.until) }) : ''}${c.storage ? t('projects:matrix.withStorage') : ''}${c.match ? '' : t('projects:matrix.notMatching')}`;
            return (
              <div key={c.id} role="gridcell" className="min-w-0">
                <button
                  type="button"
                  tabIndex={ri === ar && ci === ac ? 0 : -1}
                  data-pos={`${ri}-${ci}`}
                  data-testid="matrix-cell"
                  data-unit={c.id}
                  data-ref={c.ref}
                  data-bucket={c.bucket}
                  data-match={c.match}
                  aria-label={t('projects:matrix.cellLabel', { ref: c.ref, status, extra })}
                  onFocus={() => setActive([ri, ci])}
                  onClick={() => onOpen(c.id)}
                  className={cn(
                    'flex min-h-14 w-full flex-col items-start justify-between gap-0.5 rounded-control border px-1.5 py-1 text-start outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                    c.match ? BUCKET_CELL[c.bucket] : 'border-dashed border-border bg-panel text-muted',
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-1 text-xs font-semibold tabular-nums">
                    <bdi dir="ltr">{shortRef(c.ref)}</bdi>
                    {c.storage > 0 && <Package aria-hidden className="size-3.5 shrink-0" />}
                  </span>
                  <span className="text-xs leading-tight [overflow-wrap:anywhere]">{status}</span>
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function UnitList({ m, onOpen }: { m: UnitMatrix; onOpen: (id: string) => void }) {
  const { t } = useT();
  const f = useInvFormat();
  const where = useWhere();
  const isWide = useIsTabletUp();
  const [limit, setLimit] = useState(PAGE);
  const towerName = new Map(m.groups.filter((g) => g.kind === 'tower').map((g) => [g.id, g.label]));
  const cells = m.groups.flatMap((g) => [...(g.floors ?? []).slice().reverse().flatMap((fl) => fl.cells), ...(g.cells ?? [])]).filter((c) => c.match);
  if (cells.length === 0) return <EmptyState title={t('projects:matrix.noneMatch')} />;
  const shown = cells.slice(0, limit);
  const whereOf = (c: MatrixCell) => where({ ...(c.towerId ? { towerName: towerName.get(c.towerId) ?? '' } : {}), ...(c.floor !== undefined ? { floor: c.floor } : {}), ...(c.block ? { block: c.block } : {}) });
  return (
    <div className="space-y-3" data-testid="matrix-list">
      {isWide ? (
        <ScrollRegion label={t('projects:matrix.listCaption', { project: m.project!.name })}>
          <table className="w-full text-sm">
            <caption className="sr-only">{t('projects:matrix.listCaption', { project: m.project!.name })}</caption>
            <thead>
              <tr className="border-b border-border text-start text-xs text-muted">
                {(['unit', 'where', 'type', 'area', 'price', 'status', 'storage'] as const).map((k) => (
                  <th key={k} scope="col" className="px-2 py-2 text-start font-medium">
                    {t(`projects:matrix.col.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-b border-border/60" data-testid="matrix-row" data-unit={c.id} data-bucket={c.bucket}>
                  <th scope="row" className="px-2 py-2 text-start font-medium">
                    <button type="button" onClick={() => onOpen(c.id)} className="rounded-control text-primary underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus" data-testid="matrix-row-open">
                      <bdi dir="ltr">{unbroken(c.ref)}</bdi>
                    </button>
                  </th>
                  <td className="px-2 py-2">{whereOf(c)}</td>
                  <td className="px-2 py-2">{unbroken(t(`crm:types.${c.type}`))}</td>
                  <td className="px-2 py-2">
                    <bdi dir="ltr">{f.area(c.areaSqft)}</bdi>
                  </td>
                  <td className="px-2 py-2">
                    <bdi dir="ltr">{f.money(c.price)}</bdi>
                  </td>
                  <td className="px-2 py-2">
                    <BucketBadge bucket={c.bucket} />
                  </td>
                  <td className="px-2 py-2">{c.storage > 0 ? t('projects:matrix.storageCount', { count: f.count(c.storage) }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      ) : (
        <ul className="space-y-2">
          {shown.map((c) => (
            <li key={c.id} data-testid="matrix-row" data-unit={c.id} data-bucket={c.bucket}>
              <button type="button" onClick={() => onOpen(c.id)} className="flex w-full min-w-0 flex-col gap-1.5 rounded-tile border border-border/70 bg-panel p-3 text-start shadow-card outline-none focus-visible:outline-2 focus-visible:outline-focus" data-testid="matrix-row-open">
                <span className="flex w-full flex-wrap items-center justify-between gap-2">
                  <bdi dir="ltr" className="font-semibold text-primary">
                    {unbroken(c.ref)}
                  </bdi>
                  <BucketBadge bucket={c.bucket} />
                </span>
                <span className="text-sm break-words text-muted">
                  {whereOf(c)} · {unbroken(t(`crm:types.${c.type}`))} · <bdi dir="ltr">{f.area(c.areaSqft)}</bdi>
                </span>
                <span className="text-sm text-text">
                  <bdi dir="ltr">{f.money(c.price)}</bdi>
                  {c.storage > 0 ? ` · ${t('projects:matrix.storageCount', { count: f.count(c.storage) })}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {cells.length > limit && (
        <Button variant="secondary" onPress={() => setLimit((n) => n + PAGE)} data-testid="matrix-show-more">
          {t('projects:matrix.showMore', { count: String(Math.min(PAGE, cells.length - limit)) })}
        </Button>
      )}
    </div>
  );
}
