import { FLAT_IMPORT_COLUMNS, type SiteSummary } from '@repo/contracts';
import { Button, buttonClass, cn, DirectionalIcon, ErrorState, Link, PageHeader, ProgressRing, useApiQuery, useSession, useT } from '@repo/ui';
import { Building, ChevronRight, Download, FileSpreadsheet, KeyRound, Layers, Users } from 'lucide-react';
import { LINKS, SOCIETY } from '../../../nav.config';
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
        <NoSiteYet />
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

/**
 * No site yet (owner, C.1 review: never an unexplained blank page). Says what this area is for, what
 * setting a site up takes, and offers the next steps that work today: the flat-register template
 * and what the organisation's plan includes.
 */
function NoSiteYet() {
  const { t } = useT();
  const { tenant, can } = useSession();
  const download = () => {
    const blob = new Blob([`${FLAT_IMPORT_COLUMNS.join(',')}
`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flat-register-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };
  const steps = [
    { icon: Building, key: 'site' },
    { icon: Layers, key: 'structure' },
    { icon: FileSpreadsheet, key: 'flats' },
    { icon: Users, key: 'people' },
  ] as const;
  return (
    <section className="space-y-6 rounded-card border border-border bg-panel p-6 shadow-card sm:p-8" aria-labelledby="no-site-title" data-testid="sites-empty">
      <div className="flex flex-wrap items-start gap-4">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-tile bg-primary-soft text-primary">
          <Building className="size-6" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="no-site-title" className="text-xl font-bold text-text">{t('sites:list.emptyTitle')}</h2>
          <p className="text-sm text-muted">{t('sites:list.emptyBody', { organisation: tenant.name })}</p>
        </div>
      </div>
      <ol className="grid gap-3 @3xl:grid-cols-4">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.key} className="flex gap-3 rounded-tile bg-sunken/60 p-4">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-pill bg-panel text-sm font-semibold text-text">{i + 1}</span>
              <span className="min-w-0 space-y-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-text">
                  <Icon aria-hidden className="size-4 text-muted" />
                  {t(`sites:list.emptySteps.${s.key}.title`)}
                </span>
                <span className="block text-xs text-muted">{t(`sites:list.emptySteps.${s.key}.body`)}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" icon={Download} onPress={download} data-testid="sites-empty-template">
          {t('sites:list.emptyTemplate')}
        </Button>
        <Link href={can('admin.view') ? LINKS.plan : LINKS.myAccess} variant="plain" className={cn(buttonClass('secondary'), 'gap-2')} data-testid="sites-empty-plan">
          <KeyRound aria-hidden className="size-4" />
          {can('admin.view') ? t('sites:list.emptyPlan') : t('sites:list.emptyAccess')}
        </Link>
      </div>
      <p className="text-xs text-muted">{t('sites:list.emptyNote')}</p>
    </section>
  );
}
