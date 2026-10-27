import {
  ApiError,
  type AmendmentImpact,
  type ContractDraft,
  type ContractHistory,
  type ModuleCatalog,
  type ModuleKey,
  type ModuleSelection,
  type RateCard,
  type TenantDetail,
} from '@repo/contracts';
import {
  Badge,
  Button,
  buttonClass,
  dynamicT,
  ErrorState,
  InlineAlert,
  Link,
  NotFoundState,
  PageHeader,
  Panel,
  Skeleton,
  useAnnounce,
  useApiMutation,
  useApiQuery,
  useNavigation,
  useSession,
  useT,
  useToast,
  useTransport,
} from '@repo/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowRight, Send, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CheckList } from '../../components/CheckList';
import { ChangeList, ProblemSummary } from '../../components/config';
import { DateInput, TextInput } from '../../components/inputs';
import { PricingBuilder } from '../../components/PricingBuilder';
import { ApprovalNotice } from '../../components/quote';
import { useHqFormat } from '../../lib/format';
import { moduleName } from '../../lib/labels';
import { HQ } from '../../nav.config';

/** First day of the month after the demo's today: the default date of a change. */
const NEXT_BILLING_DAY = '2026-11-01';

/**
 * HQ-011 Contract amendment with HQ-008 grant changes (Gate B remaining scope). Starting from the
 * version in force, change the modules and their sites, the prices, discounts or terms, and the date
 * the change takes effect. The impact is previewed by the server with the configuration in force on
 * that date: price before and after, missing requirements, which of the client's roles gain or lose
 * which areas, and what is kept read-only. Submitting creates a new contract version; if the
 * commercial policy flags it, a second person approves it before it is scheduled.
 */
export default function AmendContractPage({ id }: { id: string }) {
  const { t } = useT();
  const tenant = useApiQuery<TenantDetail>({ method: 'GET', path: `/platform/tenants/${id}` });
  const history = useApiQuery<ContractHistory>({ method: 'GET', path: `/platform/tenants/${id}/contracts` });
  if (tenant.isPending || history.isPending) return <Skeleton className="h-[32rem] rounded-card" />;
  if (tenant.isError) return tenant.error instanceof ApiError && tenant.error.problem.status === 404 ? <NotFoundState headingLevel={1} /> : <ErrorState error={tenant.error} onRetry={() => void tenant.refetch()} />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => void history.refetch()} />;
  const current = history.data.versions.find((v) => v.display === 'in_force');
  const open = history.data.versions.find((v) => v.display === 'pending_approval' || v.display === 'scheduled');
  if (!current) return <InlineAlert tone="info" title={t('platform:amend.noContract')}>{t('platform:t360.noContract')}</InlineAlert>;
  return (
    <div className="@container space-y-6" data-testid="amend-page" data-tenant-id={id}>
      <PageHeader
        title={t('platform:amend.title', { tenant: tenant.data.displayName })}
        breadcrumbs={[
          { label: t('platform:nav.tenants'), href: HQ.tenants },
          { label: tenant.data.displayName, href: HQ.tenant360(id) },
          { label: t('platform:amend.crumb') },
        ]}
        description={t('platform:amend.intro', { version: current.contract.version })}
      />
      {open ? (
        <InlineAlert tone="warning" title={t('platform:amend.openTitle', { version: open.contract.version })}>
          <p data-testid="amend-open">{t('platform:amend.openBody', { date: open.effectiveFrom })}</p>
          <Link href={HQ.tenant360(id, 'subscription')} className="mt-2 inline-block font-medium">
            {t('platform:amend.openHistory')}
          </Link>
        </InlineAlert>
      ) : (
        <AmendForm tenant={tenant.data} base={{ modules: current.modules, contract: current.contract }} />
      )}
    </div>
  );
}

const sitesOf = (s: ModuleSelection['sites']) => (s === 'all' ? ['all'] : [...s]);

function AmendForm({ tenant: d, base }: { tenant: TenantDetail; base: { modules: readonly ModuleSelection[]; contract: ContractDraft } }) {
  const { t } = useT();
  const tr = dynamicT(t);
  const fmt = useHqFormat();
  const { transport } = useTransport();
  const { persona } = useSession();
  const { navigate } = useNavigation();
  const toast = useToast();
  const announce = useAnnounce();
  const submit = useApiMutation<ContractHistory>();
  const [effectiveFrom, setEffectiveFrom] = useState(NEXT_BILLING_DAY);
  const [reason, setReason] = useState('');
  const [modules, setModules] = useState<ModuleSelection[]>(() => base.modules.map(({ from: _f, ...m }) => m));
  const [contract, setContract] = useState<ContractDraft>(() => structuredClone(base.contract) as ContractDraft);
  const [error, setError] = useState<unknown>(null);
  const catalog = useApiQuery<ModuleCatalog>({ method: 'GET', path: '/platform/catalog', query: { at: effectiveFrom } });
  const card = useApiQuery<{ rateCard: RateCard }>({ method: 'GET', path: '/platform/rate-card', query: { at: effectiveFrom } });

  const body = useMemo(() => ({ modules, contract, effectiveFrom, reason }), [modules, contract, effectiveFrom, reason]);
  const preview = useQuery<AmendmentImpact>({
    queryKey: ['hq-amend-preview', persona?.id, d.id, JSON.stringify({ modules, contract, effectiveFrom })],
    queryFn: ({ signal }) => transport.request<AmendmentImpact>({ method: 'POST', path: `/platform/tenants/${d.id}/amendments/preview`, body, signal }),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const siteName = (s: string) => (s === 'all' ? t('platform:t360.allSites') : (d.sites.find((x) => x.id === s)?.name ?? s));
  const selected = modules.map((m) => m.module);
  const entry = (k: ModuleKey) => catalog.data?.modules.find((m) => m.key === k);

  /** Adding a priced add-on also adds its rate-card price from the change date; removing it removes the price. */
  const setSelected = (keys: string[]) => {
    const next = keys as ModuleKey[];
    const added = next.filter((k) => !selected.includes(k));
    const removed = selected.filter((k) => !next.includes(k));
    setModules([...modules.filter((m) => !removed.includes(m.module)), ...added.map((k) => ({ module: k, sites: 'all' as const }))]);
    const lines = card.data?.rateCard.lines ?? [];
    setContract((c) => ({
      ...c,
      components: [
        ...c.components.filter((x) => !(x.type === 'PER_MODULE' && x.module && removed.includes(x.module))),
        ...added.flatMap((k) => {
          const line = lines.find((l) => l.type === 'PER_MODULE' && l.module === k && l.editions.includes(d.edition));
          return line?.unitPrice ? [{ id: `cmp_mod_${k}_${Date.now().toString(36)}`, type: 'PER_MODULE' as const, rateCardLineId: line.id, module: k, unitPrice: line.unitPrice, cadence: line.cadence, proration: 'actual_days' as const, effectiveFrom }] : [];
        }),
      ],
    }));
  };
  const setSites = (k: ModuleKey, values: string[]) => {
    const all = values.includes('all') && !sitesOf(modules.find((m) => m.module === k)!.sites).includes('all');
    const sites = all || values.length === 0 ? ('all' as const) : values.filter((v) => v !== 'all');
    setModules(modules.map((m) => (m.module === k ? { ...m, sites } : m)));
  };

  const send = async () => {
    setError(null);
    try {
      await submit.mutateAsync({ method: 'POST', path: `/platform/tenants/${d.id}/amendments`, body });
      const msg = t('platform:amend.submitted', { tenant: d.displayName });
      toast.success(msg);
      announce(msg);
      navigate(HQ.tenant360(d.id, 'subscription'));
    } catch (e) {
      setError(e);
      announce(t('platform:config.refused'), 'assertive');
    }
  };

  const impact = preview.data;
  return (
    <div className="grid gap-6 xl:grid-cols-12 [&>*]:min-w-0">
      <div className="space-y-6 xl:col-span-7">
        <Panel title={t('platform:amend.when')}>
          <div className="grid gap-4 @2xl:grid-cols-2">
            <DateInput label={t('platform:amend.effectiveFrom')} value={effectiveFrom} onChange={setEffectiveFrom} description={t('platform:amend.effectiveHint')} testId="amend-effective" />
            <TextInput label={t('platform:amend.reason')} value={reason} onChange={setReason} description={t('platform:amend.reasonHint')} testId="amend-reason" />
          </div>
        </Panel>
        <Panel title={t('platform:amend.modules')} description={t('platform:amend.modulesHint')}>
          {catalog.data ? (
            <div className="space-y-5">
              <CheckList
                label={t('platform:amend.modules')}
                hideLabel
                options={catalog.data.modules.map((m) => ({ id: m.key, label: moduleName(t, m.key), disabled: m.alwaysOn, ...(m.scope === 'site' ? { hint: t('platform:catalogue.scopes.site') } : {}) }))}
                value={selected}
                onChange={setSelected}
                className="@xl:grid-cols-2 @4xl:grid-cols-3"
                testId="amend-modules"
              />
              {d.sites.length > 1 &&
                modules
                  .filter((m) => entry(m.module)?.scope === 'site')
                  .map((m) => (
                    <CheckList
                      key={m.module}
                      label={t('platform:amend.sitesFor', { module: moduleName(t, m.module) })}
                      options={[{ id: 'all', label: t('platform:t360.allSites') }, ...d.sites.map((s) => ({ id: s.id, label: s.name }))]}
                      value={sitesOf(m.sites)}
                      onChange={(v) => setSites(m.module, v)}
                      className="@xl:grid-cols-3"
                      testId={`amend-sites-${m.module}`}
                    />
                  ))}
            </div>
          ) : (
            <Skeleton className="h-40 rounded-tile" />
          )}
        </Panel>
        <Panel title={t('platform:amend.pricing')} description={t('platform:amend.pricingHint')}>
          {card.data ? (
            <PricingBuilder contract={contract} onChange={setContract} rateCard={card.data.rateCard} edition={d.edition} siteIds={d.sites.map((s) => s.id)} testId="amend-pricing" />
          ) : (
            <Skeleton className="h-40 rounded-tile" />
          )}
        </Panel>
      </div>

      <aside className="space-y-4 xl:col-span-5" aria-label={t('platform:amend.impact')}>
        <div className="space-y-4 xl:sticky xl:top-24">
          <Panel title={t('platform:amend.impact')} description={t('platform:amend.impactHint')}>
            {preview.isError ? (
              <ProblemSummary error={preview.error} testId="amend-preview-problems" />
            ) : !impact ? (
              <Skeleton className="h-48 rounded-tile" />
            ) : (
              <div className="space-y-4" data-testid="amend-impact" aria-busy={preview.isFetching}>
                <dl className="grid grid-cols-3 gap-2 text-sm" data-testid="amend-price">
                  <div>
                    <dt className="text-xs text-muted">{t('platform:amend.before')}</dt>
                    <dd className="font-semibold tabular">
                      <bdi dir="ltr">{fmt.money(impact.before.regularPeriod.net)}</bdi>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t('platform:amend.after')}</dt>
                    <dd className="font-semibold tabular">
                      <bdi dir="ltr">{fmt.money(impact.after.regularPeriod.net)}</bdi>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t('platform:amend.delta')}</dt>
                    <dd className="font-semibold tabular" data-testid="amend-delta">
                      <bdi dir="ltr">{Number(impact.delta.amount) > 0 ? '+' : ''}{fmt.money(impact.delta)}</bdi>
                    </dd>
                  </div>
                </dl>
                {!impact.dependencies.ok && (
                  <InlineAlert tone="error" title={t('platform:amend.missing')}>
                    <ul className="list-disc space-y-0.5 ps-5" data-testid="amend-dependencies">
                      {impact.dependencies.issues.map((i, k) => (
                        <li key={k}>{t('platform:amend.requires', { module: moduleName(t, i.module), requires: moduleName(t, i.requires) })}</li>
                      ))}
                    </ul>
                    <Button
                      variant="secondary"
                      icon={Wrench}
                      className="mt-2"
                      onPress={() => setSelected([...selected, ...impact.dependencies.fixes.map((f) => f.module).filter((m) => !selected.includes(m))])}
                      data-testid="amend-fix"
                    >
                      {t('platform:amend.addRequired')}
                    </Button>
                  </InlineAlert>
                )}
                {(impact.added.length > 0 || impact.removed.length > 0 || impact.resited.length > 0) && (
                  <ul className="space-y-1 text-sm" data-testid="amend-module-changes">
                    {impact.added.map((m) => (
                      <li key={`a-${m.module}`}>
                        <Badge tone="success">{t('platform:amend.added')}</Badge> {moduleName(t, m.module)} · {sitesOf(m.sites).map(siteName).join(', ')}
                      </li>
                    ))}
                    {impact.removed.map((m) => (
                      <li key={`r-${m.module}`}>
                        <Badge tone="warning">{t('platform:amend.removed')}</Badge> {moduleName(t, m.module)}
                      </li>
                    ))}
                    {impact.resited.map((m) => (
                      <li key={`s-${m.module}`}>
                        <Badge tone="info">{t('platform:amend.resited')}</Badge> {moduleName(t, m.module)}: {sitesOf(m.before).map(siteName).join(', ')} → {sitesOf(m.after).map(siteName).join(', ')}
                      </li>
                    ))}
                  </ul>
                )}
                {impact.retention.length > 0 && (
                  <InlineAlert tone="info" title={t('platform:amend.retentionTitle')}>
                    {t('platform:amend.retentionBody', { modules: impact.retention.map((m) => moduleName(t, m)).join(', ') })}
                  </InlineAlert>
                )}
                <div>
                  <h3 className="text-sm font-bold text-text">{t('platform:amend.access')}</h3>
                  <ul className="mt-2 divide-y divide-border/70 text-sm" data-testid="amend-access">
                    {impact.access.map((a) => (
                      <li key={a.roleId} className="py-2" data-testid={`amend-access-${a.roleId}`}>
                        <p className="font-medium text-text">
                          {tr(a.roleLabelKey)} <span className="text-xs font-normal text-muted">· {t('platform:amend.holders', { count: a.holders })}</span>
                        </p>
                        <p className="text-muted">
                          {a.gained.length === 0 && a.lost.length === 0
                            ? t('platform:amend.noAccessChange')
                            : [a.gained.length ? t('platform:amend.gains', { areas: a.gained.map((m) => moduleName(t, m)).join(', ') }) : null, a.lost.length ? t('platform:amend.loses', { areas: a.lost.map((m) => moduleName(t, m)).join(', ') }) : null].filter(Boolean).join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
                <ApprovalNotice approval={impact.after.approval} />
                <p className="text-xs text-muted">{t('platform:amend.evaluatedWith', impact.evaluatedWith)}</p>
              </div>
            )}
          </Panel>
          {error !== null && <ProblemSummary error={error} testId="amend-problems" />}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={Send} isPending={submit.isPending} onPress={() => void send()} data-testid="amend-submit">
              {impact?.after.approval.required ? t('platform:amend.submitForApproval') : t('platform:amend.schedule')}
            </Button>
            <Link variant="plain" href={HQ.tenant360(d.id, 'subscription')} className={buttonClass('quiet')} data-testid="amend-cancel">
              {t('platform:amend.cancel')}
              <ArrowRight aria-hidden className="size-4 rtl:-scale-x-100" />
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}

/** What an amendment changed (used in the contract history). */
export { ChangeList as AmendmentChanges };
