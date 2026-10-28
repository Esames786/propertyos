import type { FlatTile, OccupancyStatus, SiteStructure, SiteSummary } from '@repo/contracts';
import { Badge, Breadcrumbs, buttonClass, cn, EmptyState, ErrorState, FilterPills, Link, Money, PageHeader, SegmentedControl, useApiQuery, useQueryParam, useQueryParams, useSession, useT } from '@repo/ui';
import { Ban, DoorOpen, Home, KeyRound, Landmark, TriangleAlert, type LucideIcon } from 'lucide-react';
import { SOCIETY } from '../../../nav.config';
import { FlatJump, Loading, OccupancyBadge, ScrollRegion, useSocietyFormat } from '../kit';

const ICON: Record<OccupancyStatus, LucideIcon> = { owner_occupied: Home, tenant_occupied: KeyRound, vacant: DoorOpen, association_use: Landmark };
const TINT: Record<OccupancyStatus, string> = {
  owner_occupied: 'border-s-[var(--color-ever-4)]',
  tenant_occupied: 'border-s-[var(--color-ever-3)]',
  association_use: 'border-s-[var(--color-ever-2)]',
  vacant: 'border-s-[var(--color-ever-1)]',
};

/**
 * SITE-003 structure explorer: blocks → floors → flats as a tree (floors top-down, as the building
 * stands) or as a list. Every flat opens its Flat 360; occupancy is an icon and a word, never colour
 * alone. The block filter and the view live in the address, so a view can be shared.
 */
export default function StructurePage({ siteId }: { siteId: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { can } = useSession();
  const [building] = useQueryParam('building');
  const [view] = useQueryParam('view');
  const setParams = useQueryParams();
  const q = useApiQuery<SiteStructure>({ method: 'GET', path: `/sites/${siteId}/structure` });
  const sites = useApiQuery<SiteSummary[]>({ method: 'GET', path: '/sites' });
  const siteName = sites.data?.find((s) => s.id === siteId)?.name ?? '';
  const mode = view === 'list' ? 'list' : 'tree';

  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const buildings = q.data.buildings.filter((b) => !building || b.id === building);
  const flats = buildings.flatMap((b) => b.levels.flatMap((l) => l.flats.map((f) => ({ ...f, building: b.name, level: l.floor.level }))));
  const empty = q.data.buildings.every((b) => b.levels.every((l) => l.flats.length === 0));

  return (
    <div className="@container space-y-6" data-testid="structure-page" data-view={mode}>
      <Breadcrumbs items={[{ label: t('nav:items.sites'), href: SOCIETY.sites }, { label: siteName, href: SOCIETY.site(siteId) }]} />
      <PageHeader
        title={t('nav:pages.structure')}
        description={t('sites:structure.intro')}
        actions={!empty ? <FlatJump siteId={siteId} className="w-full sm:w-72" testId="structure-flat-jump" /> : undefined}
      />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FilterPills
          label={t('sites:structure.block')}
          showLabel
          value={building ?? 'all'}
          testId="structure-block"
          onChange={(v) => setParams({ building: v === 'all' ? null : v })}
          options={[{ id: 'all', label: t('sites:structure.allBlocks') }, ...q.data.buildings.map((b) => ({ id: b.id, label: b.name }))]}
        />
        <SegmentedControl
          label={t('sites:structure.view')}
          value={mode}
          onChange={(v) => setParams({ view: v === 'tree' ? null : v })}
          testId="structure-view"
          options={[{ id: 'tree', label: t('sites:structure.tree') }, { id: 'list', label: t('sites:structure.list') }]}
        />
      </div>

      {empty ? (
        <EmptyState
          title={t('sites:structure.emptyTitle')}
          body={t('sites:structure.emptyBody', { blocks: q.data.buildings.length, floors: q.data.buildings.reduce((n, b) => n + b.floors, 0) })}
          actions={
            can('site.manage') ? (
              <Link href={SOCIETY.importFlats(siteId)} variant="plain" className={buttonClass('primary')} data-testid="structure-import">
                {t('sites:structure.import')}
              </Link>
            ) : undefined
          }
        />
      ) : mode === 'tree' ? (
        <ul className="space-y-6" aria-label={t('sites:structure.tree')} data-testid="structure-tree">
          {buildings.map((b) => (
            <li key={b.id} className="rounded-card border border-border/70 bg-panel p-4 shadow-card sm:p-5" data-building={b.code}>
              <h2 className="mb-3 text-lg font-bold text-text">{b.name}</h2>
              <ul className="space-y-3" aria-label={t('sites:structure.floorsOf', { name: b.name })}>
                {b.levels.map((l) => (
                  <li key={l.floor.id} className="grid gap-2 @3xl:grid-cols-[6rem_1fr] @3xl:items-start" data-floor={l.floor.level}>
                    <h3 className="pt-2 text-sm font-semibold text-muted">{t('sites:flat.floorN', { level: l.floor.level })}</h3>
                    <ul className="grid grid-cols-2 gap-2 @lg:grid-cols-4 @5xl:grid-cols-8" aria-label={t('sites:structure.flatsOn', { name: b.name, level: l.floor.level })}>
                      {l.flats.map((f) => (
                        <li key={f.id}>
                          <FlatCell siteId={siteId} flat={f} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-card border border-border/70 bg-panel p-4 shadow-card" data-testid="structure-list">
          <p className="mb-3 text-sm text-muted" role="status">{t('sites:structure.count', { count: flats.length })}</p>
          <ScrollRegion label={t('sites:structure.list')} className="hidden @3xl:block">
            <table className="w-full min-w-[44rem] text-sm">
              <caption className="sr-only">{t('sites:structure.list')}</caption>
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  {['flat', 'block', 'floor', 'type', 'occupancy', 'owner', 'payer', 'owed'].map((c) => (
                    <th key={c} scope="col" className={cn('py-2 pe-3 font-medium', c === 'owed' ? 'text-end' : 'text-start')}>{t(`sites:structure.cols.${c as 'flat'}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flats.map((f) => (
                  <tr key={f.id} className="border-b border-border/60">
                    <th scope="row" className="py-2 pe-3 text-start"><Link href={SOCIETY.flat(siteId, f.id)}><bdi dir="ltr">{f.code}</bdi></Link></th>
                    <td className="py-2 pe-3">{f.building}</td>
                    <td className="py-2 pe-3">{fmt.count(f.level)}</td>
                    <td className="py-2 pe-3">{t(`sites:types.${f.type}`)}</td>
                    <td className="py-2 pe-3"><OccupancyBadge occupancy={f.occupancy} /></td>
                    <td className="py-2 pe-3"><bdi>{f.ownerName ?? '—'}</bdi></td>
                    <td className="py-2 pe-3"><bdi>{f.payerName ?? '—'}</bdi></td>
                    <td className="py-2 text-end">{f.exempt ? <Badge tone="info" icon={Ban}>{t('sites:flat.exempt')}</Badge> : <Money value={f.balance} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
          <ul className="space-y-2 @3xl:hidden">
            {flats.map((f) => (
              <li key={f.id}>
                <FlatCell siteId={siteId} flat={f} wide />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FlatCell({ siteId, flat, wide }: { siteId: string; flat: FlatTile; wide?: boolean }) {
  const { t } = useT();
  const Icon = ICON[flat.occupancy];
  const owes = Number(flat.balance.amount) > 0;
  return (
    <Link
      href={SOCIETY.flat(siteId, flat.id)}
      variant="plain"
      className={cn('flex h-full min-h-16 flex-col justify-between gap-1 rounded-tile border border-border border-s-4 bg-panel px-2.5 py-2 hover:bg-raised', TINT[flat.occupancy], wide && 'flex-row items-center')}
      data-testid="structure-flat"
      data-flat={flat.code}
      data-occupancy={flat.occupancy}
    >
      <span className="flex items-center justify-between gap-1">
        <bdi dir="ltr" className="font-semibold text-text">{flat.code}</bdi>
        <span className="flex items-center gap-1 text-muted">
          {flat.exempt && <Ban aria-hidden className="size-3.5" />}
          {owes && <TriangleAlert aria-hidden className="size-3.5 text-warning" />}
          <Icon aria-hidden className="size-3.5" />
        </span>
      </span>
      <span className="min-w-0 truncate text-mini text-muted">
        {t(`sites:occupancyShort.${flat.occupancy}`)}
        {flat.exempt ? ` · ${t('sites:flat.exempt')}` : owes ? ` · ${t('sites:structure.owes')}` : ''}
      </span>
    </Link>
  );
}
