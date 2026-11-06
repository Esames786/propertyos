import type { LeaseExport, LeaseFilter, LeasesList } from '@repo/contracts';
import { LEASE_FILTERS } from '@repo/contracts';
import { Button, EmptyState, ErrorState, FilterPills, InlineAlert, Link, Money, PageHeader, PlainTextField, saveFile, SelectControl, StatTile, useApiQuery, useQueryParam, useQueryParams, useT, useTransport } from '@repo/ui';
import { CalendarClock, Download, FilePlus2, HandCoins, KeyRound, Landmark, Send } from 'lucide-react';
import { RENTALS } from '../../nav.config';
import { Loading, useSocietyFormat } from '../society/kit';
import { LinkButton, unbroken, useProblemToast } from '../society/hr/hkit';
import { Boundary, LeaseBadge, ModelBadge, RentNav, share, WRAP } from './rkit';

/**
 * RNT-001 leases: every lease of the reader's rentals sites, filtered by state and site and searched
 * by reference, unit, tenant or landlord. Each KPI opens the records behind it. The figures are
 * contract and demand figures; the settled owner payable stays 0.00 until settlement evidence exists.
 */
export default function LeasesPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const problem = useProblemToast();
  const { transport } = useTransport();
  const set = useQueryParams();
  const [statusParam] = useQueryParam('status');
  const [site] = useQueryParam('site');
  const [search] = useQueryParam('q');
  const status: LeaseFilter = (LEASE_FILTERS as readonly string[]).includes(statusParam ?? '') ? (statusParam as LeaseFilter) : 'all';
  const query = { status, ...(site ? { site } : {}), ...(search ? { q: search } : {}) };
  // The previous list stays on screen while a filter or the search changes (the search field keeps focus).
  const q = useApiQuery<LeasesList>({ method: 'GET', path: '/rentals/leases', query }, { placeholderData: (prev) => prev });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  const k = d.kpis;
  const exportCsv = async () => {
    try {
      const x = await transport.request<LeaseExport>({ method: 'GET', path: '/rentals/leases/export', query: { ...(site ? { site } : {}), ...(search ? { q: search } : {}) } });
      const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
      const rows = x.rows.map((r) => [r.ref, r.state, r.unit, r.site, r.tenant, r.landlords, r.model, r.rent, r.from, r.to, r.deposit].map(cell).join(','));
      saveFile({ fileName: t('rentals:leases.exportName', { date: d.today }), mime: 'text/csv', content: [`# ${t(x.scopeLimited ? 'rentals:leases.csvNoteLimited' : 'rentals:leases.csvNote')}`, t('rentals:leases.csvHeader'), ...rows].join('\n') });
    } catch (e) {
      problem(e);
    }
  };
  return (
    <div className="@container space-y-5" data-testid="rent-leases">
      <PageHeader
        title={t('rentals:leases.title')}
        description={t('rentals:leases.intro')}
        actions={
          <div className="flex flex-wrap gap-2">
            {d.canCreate && (
              <LinkButton variant="primary" icon={FilePlus2} href={RENTALS.newLease()} testId="rent-new-lease">
                {t('rentals:leases.new')}
              </LinkButton>
            )}
            <Button className={WRAP} variant="quiet" icon={Download} onPress={() => void exportCsv()} data-testid="rent-export">
              {t('rentals:leases.export')}
            </Button>
          </div>
        }
      />
      <RentNav current="leases" />
      <Boundary compact />
      {d.scopeLimited && (
        <InlineAlert tone="info" data-testid="rent-scope-limited">
          {t('rentals:scopeLimited')}
        </InlineAlert>
      )}
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-5">
        <StatTile label={t('rentals:leases.kpi.active')} value={fmt.count(k.active)} accessibleValue={String(k.active)} href={RENTALS.leases({ status: 'active' })} icon={KeyRound} hue="emerald" testId="rent-kpi-active" />
        <StatTile label={t('rentals:leases.kpi.rent')} value={fmt.compact(k.rentUnderManagement)} accessibleValue={fmt.money(k.rentUnderManagement)} context={`${fmt.money(k.rentUnderManagement)} · ${t('rentals:leases.kpi.rentHint')}`} href={RENTALS.leases({ status: 'active' })} icon={Landmark} hue="sky" testId="rent-kpi-rent" />
        <StatTile label={t('rentals:leases.kpi.due', { month: fmt.period(k.dueMonth) })} value={fmt.compact(k.dueThisMonth)} accessibleValue={fmt.money(k.dueThisMonth)} context={`${fmt.money(k.dueThisMonth)} · ${t(`rentals:leases.kpi.dueHint.${k.rollState}`)}`} href={RENTALS.rentRoll(k.dueMonth)} icon={CalendarClock} hue="violet" testId="rent-kpi-due" />
        <StatTile label={t('rentals:leases.kpi.payable')} value={fmt.compact(k.ownerPayableSettled)} accessibleValue={`${fmt.money(k.ownerPayableSettled)}. ${t('rentals:leases.kpi.payableHint')}`} context={`${fmt.money(k.ownerPayableSettled)} · ${t('rentals:leases.kpi.payableHint')}`} href={RENTALS.statements()} icon={HandCoins} hue="amber" testId="rent-kpi-payable" />
        <StatTile label={t('rentals:leases.kpi.pending')} value={fmt.count(k.pendingPayouts)} accessibleValue={String(k.pendingPayouts)} context={t('rentals:leases.kpi.pendingHint')} href={RENTALS.payouts()} icon={Send} hue="slate" testId="rent-kpi-pending" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <FilterPills
          label={t('rentals:leases.filterLabel')}
          options={LEASE_FILTERS.map((f) => ({ id: f, label: t(`rentals:leases.filter.${f}`), count: d.counts[f] }))}
          value={status}
          onChange={(v) => set({ status: v === 'all' ? null : v })}
          testId="rent-filter"
        />
        {d.sites.length > 1 && (
          <div className="w-full max-w-xs">
            <SelectControl
              label={t('rentals:leases.site')}
              value={site ?? 'all'}
              onChange={(v) => set({ site: !v || v === 'all' ? null : v })}
              options={[{ id: 'all', label: t('rentals:leases.allSites') }, ...d.sites.map((s) => ({ id: s.id, label: s.name }))]}
              testId="rent-site"
            />
          </div>
        )}
        <div className="w-full max-w-sm">
          <PlainTextField label={t('rentals:leases.search')} value={search ?? ''} onChange={(v) => set({ q: v.trim() ? v : null })} optional testId="rent-search" />
        </div>
      </div>
      {d.items.length === 0 ? (
        <EmptyState
          title={t(search || site || status !== 'all' ? 'rentals:leases.noneFiltered' : 'rentals:leases.none')}
          body={t('rentals:leases.noneHint')}
          actions={
            d.canCreate ? (
              <LinkButton variant="primary" icon={FilePlus2} href={RENTALS.newLease()}>
                {t('rentals:leases.new')}
              </LinkButton>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2" data-testid="rent-lease-list">
          {d.items.map((l) => (
            <li key={l.id} className="rounded-tile border border-border/70 bg-panel p-3 shadow-card" data-testid="rent-lease" data-ref={l.ref} data-state={l.state} data-site={l.siteId}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link href={RENTALS.lease(l.id)} className="font-semibold" data-testid="rent-lease-link" data-ref={l.ref}>
                      <bdi dir="ltr">{unbroken(l.ref)}</bdi>
                    </Link>
                    <LeaseBadge state={l.state} ending={l.ending} />
                    <ModelBadge model={l.model} />
                  </p>
                  <p className="text-sm text-text">
                    <bdi className="font-medium">{unbroken(l.unitCode)}</bdi> · <bdi>{l.siteName}</bdi> · {t('rentals:leases.tenant')}: <bdi>{l.tenantName}</bdi>
                  </p>
                  <p className="text-sm break-words text-muted">
                    {t('rentals:leases.landlords')}:{' '}
                    {l.landlords.map((x, i) => (
                      <span key={x.ownerId}>
                        {i > 0 ? ' · ' : ''}
                        <bdi>{x.name}</bdi> <bdi dir="ltr">{share(x.share)}</bdi>
                      </span>
                    ))}
                  </p>
                </div>
                <div className="space-y-0.5 text-sm @lg:text-end">
                  <p className="font-semibold">
                    <Money value={l.rent} /> <span className="font-normal text-muted">{t('rentals:leases.perMonth')}</span>
                  </p>
                  <p className="text-muted">{t('rentals:leases.term', { from: fmt.date(l.from), to: fmt.date(l.terminationDate ?? l.to) })}</p>
                  {l.terminationDate && <p className="text-xs text-warning">{t('rentals:leases.endsEarly', { date: fmt.date(l.terminationDate) })}</p>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
