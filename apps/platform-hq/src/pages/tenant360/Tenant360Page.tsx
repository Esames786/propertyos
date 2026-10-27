import type { ModuleCatalog, TenantDetail } from '@repo/contracts';
import {
  Badge,
  buttonClass,
  dynamicT,
  ErrorState,
  InlineAlert,
  Link,
  NotFoundState,
  Panel,
  Skeleton,
  UrlTabs,
  useApiQuery,
  useCan,
  useT,
  WorkspaceHeader,
} from '@repo/ui';
import { ApiError } from '@repo/contracts';
import { Calculator, Eye, MapPin } from 'lucide-react';
import { componentLabel } from '../../components/PricingBuilder';
import { AuditTrail } from '../../components/audit';
import { ApprovalNotice, QuantitySources, QuoteBreakdown, QuoteTotals } from '../../components/quote';
import { useHqFormat } from '../../lib/format';
import { editionName, lifecycleOf, moduleName, STATUS_ICON, STATUS_TONE } from '../../lib/labels';
import { HQ } from '../../nav.config';
import { ApprovalPanel } from '../tenants/TenantSummaryDrawer';

/**
 * HQ-004 Tenant 360: one tenant's licence, subscription, modules and sites, usage, commercial
 * record and audit, in tabs kept in the address (?tab=). Tenant metadata only: Platform HQ never
 * reads the tenant's people, flats or payments (A1 §4). From here an operator may preview what the
 * client's roles see (HQ-009) or try prices (HQ-013); changes to a live contract are amendments.
 */
export default function Tenant360Page({ id }: { id: string }) {
  const { t } = useT();
  const detail = useApiQuery<TenantDetail>({ method: 'GET', path: `/platform/tenants/${id}` });
  if (detail.isPending) return <Skeleton className="h-[32rem] rounded-card" />;
  if (detail.isError) {
    return detail.error instanceof ApiError && detail.error.problem.status === 404 ? <NotFoundState headingLevel={1} /> : <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  }
  return <Workspace tenant={detail.data} t={t} />;
}

function Workspace({ tenant: d, t }: { tenant: TenantDetail; t: ReturnType<typeof useT>['t'] }) {
  const fmt = useHqFormat();
  const can = useCan();
  const s = lifecycleOf(d);
  const tabs = [
    { id: 'overview', label: t('platform:t360.tabs.overview') },
    { id: 'subscription', label: t('platform:t360.tabs.subscription') },
    { id: 'modules', label: t('platform:t360.tabs.modules') },
    { id: 'usage', label: t('platform:t360.tabs.usage') },
    { id: 'commercial', label: t('platform:t360.tabs.commercial') },
    { id: 'audit', label: t('platform:t360.tabs.audit') },
  ];
  return (
    <div data-testid="tenant-360" data-tenant-id={d.id}>
      <WorkspaceHeader
        entityLabel={t('common:entity.tenant')}
        title={d.displayName}
        reference={d.id}
        breadcrumbs={[{ label: t('platform:nav.tenants'), href: HQ.tenants }, { label: d.displayName }]}
        status={
          <Badge tone={STATUS_TONE[s]} icon={STATUS_ICON[s]}>
            {t(`platform:status.${s}`)}
          </Badge>
        }
        metrics={[
          { label: t('platform:summary.mrr'), value: <bdi dir="ltr">{fmt.money(d.mrr)}</bdi> },
          { label: t('platform:t360.metrics.edition'), value: editionName(t, d.edition) },
          { label: t('platform:t360.metrics.flats'), value: fmt.count(d.units.declared) },
          { label: t('platform:t360.metrics.modules'), value: fmt.count(d.grants.length) },
        ]}
        actions={
          <>
            {can('platform.preview.use') && (
              <Link variant="plain" href={HQ.preview(d.id)} className={buttonClass('primary')} data-testid="t360-preview">
                <Eye aria-hidden className="size-4" />
                {t('platform:t360.preview')}
              </Link>
            )}
            {can('platform.pricing.simulate') && (
              <Link variant="plain" href={`${HQ.simulator}?tenant=${d.id}`} className={buttonClass('secondary')} data-testid="t360-simulate">
                <Calculator aria-hidden className="size-4" />
                {t('platform:summary.simulate')}
              </Link>
            )}
          </>
        }
      />
      <UrlTabs label={t('platform:t360.tabsLabel')} items={tabs}>
        {(tab) => (
          <div className="space-y-6 pt-6" data-testid={`t360-tab-${tab}`}>
            {tab === 'overview' && <Overview d={d} />}
            {tab === 'subscription' && <Subscription d={d} />}
            {tab === 'modules' && <Modules d={d} />}
            {tab === 'usage' && <Usage d={d} />}
            {tab === 'commercial' && <Commercial d={d} />}
            {tab === 'audit' && (
              <Panel title={t('platform:t360.auditTitle')} description={t('platform:t360.auditHint')}>
                <AuditTrail events={d.audit} />
              </Panel>
            )}
            <p className="text-xs text-muted">{t('platform:summary.metadataOnly')}</p>
          </div>
        )}
      </UrlTabs>
    </div>
  );
}

function Facts({ items, testId }: { items: Array<{ label: string; value: React.ReactNode }>; testId?: string }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 @md:grid-cols-2 @3xl:grid-cols-3" data-testid={testId}>
      {items.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-xs text-muted">{f.label}</dt>
          <dd className="mt-0.5 font-medium text-text">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Overview({ d }: { d: TenantDetail }) {
  const { t } = useT();
  const fmt = useHqFormat();
  return (
    <>
      {d.approval && <ApprovalPanel approval={d.approval} tenant={d} />}
      {d.status === 'suspended' && <InlineAlert tone="error" title={t('platform:t360.suspendedTitle')}>{t('platform:t360.suspendedBody')}</InlineAlert>}
      {d.status === 'grace' && <InlineAlert tone="warning" title={t('platform:t360.graceTitle')}>{t('platform:t360.graceBody')}</InlineAlert>}
      <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
        <Panel title={t('platform:t360.organisation')} className="lg:col-span-7">
          <Facts
            testId="t360-organisation"
            items={[
              { label: t('platform:summary.legalName'), value: <bdi>{d.legalName}</bdi> },
              { label: t('platform:summary.type'), value: t(`platform:tenantTypes.${d.type}`) },
              { label: t('platform:t360.city'), value: d.city },
              { label: t('platform:summary.contact'), value: <bdi>{d.organisation.contactName}</bdi> },
              { label: t('platform:summary.origin'), value: t(`platform:origins.${d.origin}`) },
              { label: t('platform:summary.created'), value: fmt.date(d.createdAt) },
              ...(d.contract?.activatedAt ? [{ label: t('platform:t360.activated'), value: fmt.date(d.contract.activatedAt) }] : []),
              ...(d.trialEndsOn ? [{ label: t('platform:summary.trialEnds'), value: fmt.date(d.trialEndsOn) }] : []),
            ]}
          />
        </Panel>
        <Panel title={t('platform:t360.state')} className="lg:col-span-5">
          <div className="flex flex-wrap gap-2" data-testid="t360-state">
            <Badge tone={STATUS_TONE[lifecycleOf(d)]} icon={STATUS_ICON[lifecycleOf(d)]}>
              {t(`platform:status.${lifecycleOf(d)}`)}
            </Badge>
            <Badge tone="neutral">{t(`platform:contractStatus.${d.contractStatus}`)}</Badge>
            <Badge tone={d.billingStatus === 'overdue' ? 'warning' : 'neutral'}>{t(`platform:billingStatus.${d.billingStatus}`)}</Badge>
          </div>
          <p className="mt-3 text-sm text-muted">{t('platform:t360.stateHint')}</p>
        </Panel>
      </div>
      <Panel title={t('platform:t360.accessTitle')} description={t('platform:t360.accessHint')}>
        <ul className="flex flex-wrap gap-1.5" data-testid="t360-modules-summary">
          {d.grants.map((g) => (
            <li key={g.module}>
              <Badge tone="neutral">{moduleName(t, g.module)}</Badge>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

function Subscription({ d }: { d: TenantDetail }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const c = d.contract;
  if (!c || !d.quote) return <p className="text-muted">{t('platform:t360.noContract')}</p>;
  return (
    <>
      <Panel title={t('platform:summary.contract', { version: c.version })} description={t(`platform:contractStatus.${c.status}`)}>
        <Facts
          testId="t360-terms"
          items={[
            { label: t('platform:wizard.pricing.start'), value: fmt.date(c.terms.start) },
            { label: t('platform:t360.term'), value: c.terms.termMonths ? t('platform:t360.months', { count: c.terms.termMonths }) : t('platform:t360.rolling') },
            { label: t('platform:wizard.pricing.frequency'), value: t(`platform:cadence.${c.terms.billingFrequency}`) },
            { label: t('platform:t360.tax'), value: `${c.terms.tax.code} · ${c.terms.tax.ratePct}%` },
            ...(c.terms.minimumMonthly ? [{ label: t('platform:t360.minimum'), value: <bdi dir="ltr">{fmt.money(c.terms.minimumMonthly)}</bdi> }] : []),
            ...(c.terms.capMonthly ? [{ label: t('platform:t360.cap'), value: <bdi dir="ltr">{fmt.money(c.terms.capMonthly)}</bdi> }] : []),
            { label: t('platform:t360.createdBy'), value: <bdi>{c.createdBy}</bdi> },
          ]}
        />
      </Panel>
      <QuoteTotals quote={d.quote} />
      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel title={t('platform:t360.components')}>
          <ul className="divide-y divide-border/70" data-testid="t360-components">
            {c.components.map((x) => (
              <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-text">{componentLabel(t, x)}</span>
                  <span className="block text-xs text-muted">
                    {t('platform:t360.effective', { from: fmt.date(x.effectiveFrom) })}
                    {x.effectiveTo ? ` · ${t('platform:t360.until', { to: fmt.date(x.effectiveTo) })}` : ''}
                  </span>
                </span>
                <span className="shrink-0 tabular">{x.unitPrice && x.type !== 'FREE' ? <bdi dir="ltr">{fmt.money(x.unitPrice)}</bdi> : x.type === 'TRIAL' ? t('platform:builder.trialDays', { days: x.trialDays ?? 30 }) : '—'}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="rounded-card border border-border/70 bg-panel p-5 shadow-card">
          <QuoteBreakdown period={d.quote.regularPeriod} title={t('platform:quote.regularPeriod')} testId="t360-regular" />
        </div>
      </div>
      <p className="text-sm text-muted">{t('platform:t360.amendmentsNext')}</p>
    </>
  );
}

function Modules({ d }: { d: TenantDetail }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const can = useCan();
  const catalog = useApiQuery<ModuleCatalog>({ method: 'GET', path: '/platform/catalog' });
  const siteName = (id: string) => d.sites.find((s) => s.id === id)?.name ?? id;
  const since = (d.contract?.activatedAt ?? d.contract?.terms.start ?? d.createdAt).slice(0, 10);
  const granted = new Set(d.grants.map((g) => g.module));
  return (
    <>
      <Panel
        title={t('platform:t360.grantsTitle', { count: d.grants.length })}
        description={t('platform:t360.grantsHint')}
        actions={
          can('platform.preview.use') ? (
            <Link variant="plain" href={HQ.preview(d.id)} className={buttonClass('secondary')} data-testid="t360-modules-preview">
              <Eye aria-hidden className="size-4" />
              {t('platform:t360.preview')}
            </Link>
          ) : undefined
        }
      >
        <div className="overflow-x-auto" role="region" aria-label={t('platform:t360.grantsTitle', { count: d.grants.length })} tabIndex={0}>
          <table className="w-full min-w-[34rem] text-sm" data-testid="t360-grants">
            <thead>
              <tr className="border-b border-border text-start text-xs text-muted">
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:t360.module')}</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:t360.sites')}</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:t360.since')}</th>
                <th scope="col" className="py-2 text-start font-medium">{t('platform:t360.requires')}</th>
              </tr>
            </thead>
            <tbody>
              {d.grants.map((g) => {
                const entry = catalog.data?.modules.find((m) => m.key === g.module);
                return (
                  <tr key={g.module} className="border-b border-border/60 last:border-0" data-testid={`t360-grant-${g.module}`}>
                    <th scope="row" className="py-2.5 pe-3 text-start font-medium text-text">{moduleName(t, g.module)}</th>
                    <td className="py-2.5 pe-3">{g.sites === 'all' ? t('platform:t360.allSites') : g.sites.map(siteName).join(', ')}</td>
                    <td className="py-2.5 pe-3 whitespace-nowrap">{fmt.date(since)}</td>
                    <td className="py-2.5 text-muted">{entry && entry.requires.length ? entry.requires.map((r) => moduleName(t, r)).join(', ') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-6 lg:grid-cols-12 [&>*]:min-w-0">
        <Panel title={t('platform:summary.sites', { count: d.sites.length })} className="lg:col-span-6">
          <ul className="space-y-2" data-testid="t360-sites">
            {d.sites.map((site) => (
              <li key={site.id} className="flex items-start gap-2 text-sm">
                <MapPin aria-hidden className="mt-0.5 size-4 text-muted" />
                <span>
                  <bdi className="font-medium text-text">{site.name}</bdi>
                  <span className="block text-muted">
                    {site.city} · {t(`platform:siteKinds.${site.kind}`)} · {t('platform:wizard.review.siteUnits', { count: site.declaredUnits })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title={t('platform:t360.notLicensed')} description={t('platform:t360.notLicensedHint')} className="lg:col-span-6">
          {catalog.data ? (
            <ul className="flex flex-wrap gap-1.5" data-testid="t360-not-licensed">
              {catalog.data.modules
                .filter((m) => !granted.has(m.key))
                .map((m) => (
                  <li key={m.key} className="rounded-pill border border-border px-2.5 py-0.5 text-xs text-muted">
                    {moduleName(t, m.key)}
                  </li>
                ))}
            </ul>
          ) : (
            <Skeleton className="h-16 rounded-tile" />
          )}
        </Panel>
      </div>
      <p className="text-sm text-muted">{t('platform:t360.grantChangesNext')}</p>
    </>
  );
}

function Usage({ d }: { d: TenantDetail }) {
  const { t } = useT();
  const fmt = useHqFormat();
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3" data-testid="t360-usage">
        {[
          { id: 'flats', label: t('platform:t360.metrics.flats'), value: fmt.count(d.units.declared) },
          { id: 'eligible', label: t('platform:t360.eligible'), value: d.units.eligible === null ? '—' : fmt.count(d.units.eligible) },
          { id: 'sites', label: t('platform:summary.sites', { count: d.siteCount }), value: fmt.count(d.siteCount) },
        ].map((m) => (
          <div key={m.id} className="rounded-card border border-border/70 bg-panel p-4 shadow-card">
            <p className="text-sm text-muted">{m.label}</p>
            <p className="mt-1 text-2xl font-bold text-text tabular">{m.value}</p>
          </div>
        ))}
      </div>
      {d.quote && (
        <Panel title={t('platform:t360.pricedCounts')} description={t('platform:t360.pricedCountsHint')}>
          <QuantitySources quote={d.quote} />
        </Panel>
      )}
      <InlineAlert tone="info" title={t('platform:t360.metersTitle')}>
        {t('platform:t360.metersBody')}
      </InlineAlert>
    </>
  );
}

function Commercial({ d }: { d: TenantDetail }) {
  const { t } = useT();
  const fmt = useHqFormat();
  return (
    <>
      {d.quote && <ApprovalNotice approval={d.quote.approval} />}
      {d.approval && (
        <Panel title={t('platform:t360.approvalTitle')}>
          <Facts
            testId="t360-approval"
            items={[
              { label: t('platform:t360.approvalStatus'), value: t(`platform:t360.approvalStatuses.${d.approval.status}`) },
              { label: t('platform:t360.requestedBy'), value: <bdi>{d.approval.requestedBy}</bdi> },
              { label: t('platform:t360.requestedOn'), value: fmt.date(d.approval.requestedAt) },
              ...(d.approval.decidedBy ? [{ label: t('platform:t360.decidedBy'), value: <bdi>{d.approval.decidedBy}</bdi> }] : []),
              ...(d.approval.comment ? [{ label: t('platform:t360.comment'), value: d.approval.comment }] : []),
            ]}
          />
          <ul className="mt-3 list-disc space-y-1 ps-5 text-sm">
            {d.approval.reasons.map((r, i) => (
              <li key={`${r.rule}-${i}`}>{dynamicT(t)(`platform:approval.rules.${r.rule}`, r.params)}</li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title={t('platform:t360.discounts')}>
        {d.contract && d.contract.discounts.length ? (
          <ul className="divide-y divide-border/70" data-testid="t360-discounts">
            {d.contract.discounts.map((x) => (
              <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-3 py-2.5 text-sm">
                <span>
                  <span className="font-medium text-text">{x.reason ?? t('platform:summary.discount')}</span>
                  <span className="block text-xs text-muted">
                    {t('platform:t360.effective', { from: fmt.date(x.from) })}
                    {x.to ? ` · ${t('platform:t360.until', { to: fmt.date(x.to) })}` : ''}
                  </span>
                </span>
                <span className="tabular text-warning">{x.kind === 'percent' ? `−${x.value}%` : <bdi dir="ltr">−{fmt.money(x.value)}</bdi>}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('platform:t360.noDiscounts')}</p>
        )}
      </Panel>
      <Panel title={t('platform:t360.billing')}>
        <Facts
          items={[
            { label: t('platform:t360.billingStatus'), value: t(`platform:billingStatus.${d.billingStatus}`) },
            { label: t('platform:summary.mrr'), value: <bdi dir="ltr">{fmt.money(d.mrr)}</bdi> },
            ...(d.quote ? [{ label: t('platform:quote.firstYear'), value: <bdi dir="ltr">{fmt.money(d.quote.firstYearValue)}</bdi> }] : []),
          ]}
        />
        <p className="mt-3 text-sm text-muted">{t('platform:t360.invoicesNext')}</p>
      </Panel>
    </>
  );
}
