import type { SiteSummary } from '@repo/contracts';
import { DirectionalIcon, EmptyState, ErrorState, Link, PageHeader, ProgressRing, useApiQuery, useT } from '@repo/ui';
import { Building, ChevronRight } from 'lucide-react';
import { SOCIETY } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';

/** SITE-001 managed sites: only the sites licensed to this organisation (the server lists them). */
export default function SitesPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<SiteSummary[]>({ method: 'GET', path: '/sites' });
  return (
    <div className="@container space-y-6" data-testid="sites-page">
      <PageHeader title={t('nav:pages.sites')} description={t('sites:list.intro')} />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={4} />
      ) : q.data.length === 0 ? (
        <EmptyState title={t('sites:list.emptyTitle')} body={t('sites:list.emptyBody')} />
      ) : (
        <ul className="grid gap-4 @3xl:grid-cols-2">
          {q.data.map((s) => (
            <li key={s.id}>
              <Link href={SOCIETY.site(s.id)} variant="plain" className="group flex h-full flex-col gap-4 rounded-card border border-border/70 bg-panel p-5 shadow-card hover:shadow-lift" data-testid="site-card" data-site={s.id}>
                <span className="flex items-start gap-3">
                  <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-tile bg-primary text-on-primary">
                    <Building className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold text-text"><bdi>{s.name}</bdi></span>
                    <span className="block text-sm text-muted">{s.city} · <bdi>{s.legalEntityName}</bdi></span>
                  </span>
                  <DirectionalIcon icon={ChevronRight} className="size-5 text-muted" />
                </span>
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-xs text-muted">{t('sites:list.blocks')}</dt><dd className="font-semibold text-text">{fmt.count(s.buildings)}</dd></div>
                  <div><dt className="text-xs text-muted">{t('sites:list.flats')}</dt><dd className="font-semibold text-text">{t('sites:list.flatsOf', { flats: fmt.count(s.flats), declared: fmt.count(s.declaredFlats) })}</dd></div>
                  <div><dt className="text-xs text-muted">{t('sites:list.occupied')}</dt><dd className="font-semibold text-text">{fmt.count(s.occupied)}</dd></div>
                </dl>
                <span className="flex items-center gap-3 border-t border-border pt-3 text-sm text-muted">
                  <span aria-hidden><ProgressRing value={s.setupDone / Math.max(1, s.setupTotal)} size={36} stroke={5} label="" /></span>
                  {t('sites:list.setup', { done: fmt.count(s.setupDone), total: fmt.count(s.setupTotal) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
