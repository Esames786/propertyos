import type { ResolvedCharge, SiteStructure, SiteSummary, SiteUnitType, Money as MoneyValue } from '@repo/contracts';
import { Breadcrumbs, ErrorState, Link, Money, PageHeader, Panel, useApiQuery, useSession, useT } from '@repo/ui';
import { SOCIETY } from '../../../nav.config';
import { Loading, useSocietyFormat } from '../kit';

/**
 * SITE-005 flat types. Each type with its default area and how many flats it has; for people who
 * see charges, the month's charge for a typical flat of the type and the rule that sets it.
 */
export default function UnitTypesPage({ siteId }: { siteId: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { can } = useSession();
  const q = useApiQuery<SiteUnitType[]>({ method: 'GET', path: `/sites/${siteId}/unit-types` });
  const sites = useApiQuery<SiteSummary[]>({ method: 'GET', path: '/sites' });
  const structure = useApiQuery<SiteStructure>({ method: 'GET', path: `/sites/${siteId}/structure` });
  const siteName = sites.data?.find((s) => s.id === siteId)?.name ?? '';
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={4} />;
  const sample = (code: string) => structure.data?.buildings.flatMap((b) => b.levels.flatMap((l) => l.flats)).find((f) => f.type === code && !f.exempt);
  return (
    <div className="@container space-y-6" data-testid="unit-types-page">
      <Breadcrumbs items={[{ label: t('nav:items.sites'), href: SOCIETY.sites }, { label: siteName, href: SOCIETY.site(siteId) }]} />
      <PageHeader title={t('nav:pages.unitTypes')} description={t('sites:types.intro')} />
      <ul className="grid gap-4 @3xl:grid-cols-2">
        {q.data.map((ty) => (
          <li key={ty.id}>
            <Panel title={ty.name}>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-muted">{t('sites:types.area')}</dt><dd className="font-semibold text-text">{t('sites:flat.area', { area: fmt.count(ty.areaSqft) })}</dd></div>
                <div><dt className="text-xs text-muted">{t('sites:types.flats')}</dt><dd className="font-semibold text-text">{fmt.count(ty.flats)}</dd></div>
              </dl>
              {(can('billing_run.view') || can('charges.manage')) && sample(ty.code) && <TypeCharge flatId={sample(ty.code)!.id} code={sample(ty.code)!.code} />}
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TypeCharge({ flatId, code }: { flatId: string; code: string }) {
  const { t } = useT();
  const q = useApiQuery<{ lines: ResolvedCharge[]; total: MoneyValue; period: string }>({ method: 'GET', path: '/charges/resolve', query: { flat: flatId } });
  if (!q.data) return null;
  const maintenance = q.data.lines.find((l) => l.category === 'maintenance');
  return (
    <p className="mt-4 border-t border-border pt-3 text-sm text-text">
      {t('sites:types.charge', { flat: code })} <Money value={q.data.total} className="font-semibold" />
      {maintenance && <span className="block text-xs text-muted">{t('sites:types.maintenanceBy', { scope: maintenance.winner.scopeName })}</span>}
      <Link href={SOCIETY.rules(flatId)} className="text-xs">{t('sites:flat.allRules')}</Link>
    </p>
  );
}
