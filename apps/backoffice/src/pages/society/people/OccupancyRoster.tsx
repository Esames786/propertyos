import { OCCUPANCY_STATUSES, type OccupancyRow, type SiteSummary } from '@repo/contracts';
import { DateTime, EmptyState, ErrorState, FilterPills, Link, PageHeader, useApiQuery, useQueryParam, useQueryParams, useSession, useT } from '@repo/ui';
import { Repeat2 } from 'lucide-react';
import { SOCIETY } from '../../../nav.config';
import { Loading, OccupancyBadge, ScrollRegion } from '../kit';

/**
 * RES-002 units and payers: every flat with who lives there, who owns it and who pays, filtered by
 * block and occupancy. A payer change opens the flat's own drawer, so the history rule (from a month,
 * never rewriting issued bills) is explained where the change is made.
 */
export default function OccupancyRoster() {
  const { t } = useT();
  const { can } = useSession();
  const [occupancy] = useQueryParam('occupancy');
  const [block] = useQueryParam('block');
  const setParams = useQueryParams();
  const sites = useApiQuery<SiteSummary[]>({ method: 'GET', path: '/sites' });
  const siteId = sites.data?.[0]?.id;
  const q = useApiQuery<OccupancyRow[]>(siteId ? { method: 'GET', path: `/sites/${siteId}/roster` } : null);
  const filter = (OCCUPANCY_STATUSES as readonly string[]).includes(occupancy ?? '') ? occupancy! : 'all';
  if (sites.isError || q.isError) return <ErrorState error={sites.error ?? q.error} onRetry={() => void q.refetch()} />;
  if (sites.data && !siteId) return <EmptyState title={t('sites:list.emptyTitle')} body={t('sites:list.emptyBody')} />;
  if (!q.data) return <Loading lines={8} />;
  const blocks = [...new Set(q.data.map((r) => r.building))];
  const rows = q.data.filter((r) => (filter === 'all' || r.occupancy === filter) && (!block || r.building === block));
  return (
    <div className="@container space-y-6" data-testid="roster-page">
      <PageHeader title={t('nav:pages.roster')} description={t('sites:roster.intro')} />
      <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-card border border-border/70 bg-panel p-4 shadow-card">
        <FilterPills label={t('sites:roster.occupancy')} showLabel value={filter} testId="roster-occupancy" onChange={(v) => setParams({ occupancy: v === 'all' ? null : v })} options={[{ id: 'all', label: t('sites:roster.all') }, ...OCCUPANCY_STATUSES.map((o) => ({ id: o, label: t(`sites:occupancy.${o}`) }))]} />
        <FilterPills label={t('sites:structure.block')} showLabel value={block ?? 'all'} testId="roster-block" onChange={(v) => setParams({ block: v === 'all' ? null : v })} options={[{ id: 'all', label: t('sites:structure.allBlocks') }, ...blocks.map((b) => ({ id: b, label: b }))]} />
      </div>
      <p className="text-sm text-muted" role="status" data-testid="roster-count">{t('sites:structure.count', { count: rows.length })}</p>
      <ScrollRegion label={t('nav:pages.roster')} className="hidden rounded-card border border-border/70 bg-panel p-4 shadow-card @3xl:block">
        <table className="w-full min-w-[48rem] text-sm" data-testid="roster-table">
          <caption className="sr-only">{t('nav:pages.roster')}</caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              {(['flat', 'occupancy', 'livesHere', 'owner', 'payer', 'since', 'action'] as const).map((c) => (
                <th key={c} scope="col" className="py-2 pe-3 text-start font-medium">{c === 'action' ? <span className="sr-only">{t('sites:roster.cols.action')}</span> : t(`sites:roster.cols.${c}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.flatId} className="border-b border-border/60" data-testid="roster-row" data-flat={r.flatCode}>
                <th scope="row" className="py-2 pe-3 text-start"><Link href={siteId ? SOCIETY.flat(siteId, r.flatId) : '#'}><bdi dir="ltr">{r.flatCode}</bdi></Link><span className="block text-xs font-normal text-muted">{r.building}</span></th>
                <td className="py-2 pe-3"><OccupancyBadge occupancy={r.occupancy} /></td>
                <td className="py-2 pe-3"><bdi>{r.occupantNames.join(', ') || '—'}</bdi></td>
                <td className="py-2 pe-3"><bdi>{r.ownerNames.join(', ')}</bdi></td>
                <td className="py-2 pe-3"><bdi>{r.payerName ?? '—'}</bdi></td>
                <td className="py-2 pe-3 whitespace-nowrap">{r.since ? <DateTime value={r.since} style="calendar" /> : '—'}</td>
                <td className="py-2 text-end">
                  {can('site.manage') && siteId && (
                    <Link href={`${SOCIETY.flat(siteId, r.flatId, 'payer')}&drawer=change-payer`} className="inline-flex min-h-9 items-center gap-1 text-xs" aria-label={t('sites:roster.changePayerFor', { flat: r.flatCode })}>
                      <Repeat2 aria-hidden className="size-3.5" />
                      {t('sites:flat.changePayer')}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      <ul className="space-y-2 @3xl:hidden">
        {rows.map((r) => (
          <li key={r.flatId}>
            <Link href={siteId ? SOCIETY.flat(siteId, r.flatId) : '#'} variant="plain" className="block rounded-tile border border-border bg-panel px-3 py-2.5 hover:bg-raised" data-testid="roster-card">
              <span className="flex items-center justify-between gap-2">
                <bdi dir="ltr" className="font-semibold text-text">{r.flatCode}</bdi>
                <OccupancyBadge occupancy={r.occupancy} />
              </span>
              <span className="mt-1 block text-xs text-muted">{t('sites:roster.card', { lives: r.occupantNames.join(', ') || '—', payer: r.payerName ?? '—' })}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
