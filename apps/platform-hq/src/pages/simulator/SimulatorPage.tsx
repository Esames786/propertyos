import type { ContractDiscount, ContractDraft, EditionKey, QuotePreview, RateCard, TenantListResponse, UsageDimension } from '@repo/contracts';
import { EDITIONS } from '@repo/contracts';
import {
  Badge,
  Button,
  ChartCard,
  ColumnTargetChart,
  ErrorState,
  InlineAlert,
  PageHeader,
  SegmentedControl,
  SelectControl,
  Skeleton,
  useApiQuery,
  useNavigation,
  useQueryParams,
  useReducedMotion,
  useT,
  useTransport,
  type ColumnTargetPoint,
} from '@repo/ui';
import { ArrowDown, FlaskConical, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Label, Slider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components';
import { CountInput, DateInput } from '../../components/inputs';
import { PricingBuilder } from '../../components/PricingBuilder';
import { ApprovalNotice, LivePriceBar, QuantitySources, QuoteBreakdown, QuoteTotals } from '../../components/quote';
import { useHqFormat } from '../../lib/format';
import { dimensionLabel, editionName } from '../../lib/labels';
import { useQuote } from '../../lib/useQuote';
import { withStart } from '../create/wizard';

interface Scenario {
  edition: EditionKey;
  contract: ContractDraft;
  quantities: Partial<Record<UsageDimension, number>>;
}
type Source = 'example' | 'tenant' | EditionKey;
const UNIT_BASES: UsageDimension[] = ['units.eligible', 'units.occupied', 'units.registered'];

/** The owner's V3.1 example (A3 §5.1): 80 eligible flats, one site, onboarding. */
const EXAMPLE_QUANTITIES = { 'units.eligible': 80, 'units.occupied': 76, 'units.registered': 80, 'sites.licensed': 1, 'buildings.active': 2, 'seats.staff_active': 5, 'sms.sent': 0 } satisfies Partial<Record<UsageDimension, number>>;

/**
 * HQ-013 Pricing simulator. Start from the V3.1 example, a tenant's current contract or an edition
 * template, then change counts, the unit basis, dates, prices, tiers and discounts: every scenario
 * is priced by the server and NOTHING is saved (A3 §8, AB-6). The chart compares the scenario with
 * the starting point month by month.
 */
export default function SimulatorPage() {
  const { t } = useT();
  const { transport } = useTransport();
  const setParams = useQueryParams();
  const { location } = useNavigation();
  const params = new URLSearchParams(location.search);
  const tenantParam = params.get('tenant');
  const [source, setSource] = useState<Source>(tenantParam ? 'tenant' : 'example');
  const [tenantId, setTenantId] = useState<string | null>(tenantParam);
  const [baseline, setBaseline] = useState<Scenario | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const reduced = useReducedMotion();
  /** Phones and tablets: the results sit under the controls, so the price bar offers a jump to them. */
  const focusResults = () => {
    const el = document.getElementById('sim-results');
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  };

  const rateCard = useApiQuery<{ rateCard: RateCard }>({ method: 'GET', path: '/platform/rate-card' });
  const tenants = useApiQuery<TenantListResponse>({ method: 'GET', path: '/platform/tenants', query: { sort: 'name' } });

  // Load the starting point for the chosen source.
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<Scenario | null> => {
      if (source === 'tenant') {
        if (!tenantId) return null;
        const d = await transport.request<{ contract: ContractDraft | null; quote: QuotePreview | null; edition: EditionKey; sites: Array<{ declaredUnits: number; buildings: number }> }>({ method: 'GET', path: `/platform/tenants/${tenantId}` });
        if (!d.contract) return null;
        const q: Partial<Record<UsageDimension, number>> = Object.fromEntries((d.quote?.quantities ?? []).map((x) => [x.dimension, x.value]));
        const units = d.sites.reduce((n, s) => n + s.declaredUnits, 0);
        return {
          edition: d.edition,
          contract: { terms: d.contract.terms, components: d.contract.components, discounts: d.contract.discounts },
          quantities: { 'units.eligible': units, 'units.occupied': units, 'units.registered': units, 'sites.licensed': d.sites.length, 'buildings.active': d.sites.reduce((n, s) => n + s.buildings, 0), 'seats.staff_active': 5, ...q },
        };
      }
      const edition: EditionKey = source === 'example' ? 'community' : source;
      const contract = await transport.request<ContractDraft>({ method: 'POST', path: '/platform/contract-templates', body: { edition, start: '2026-11-01' } });
      return { edition, contract, quantities: { ...EXAMPLE_QUANTITIES } };
    };
    load()
      .then((s) => {
        if (cancelled) return;
        setBaseline(s);
        setScenario(s);
        setLoadError(null);
      })
      .catch((e) => !cancelled && setLoadError(e));
    return () => {
      cancelled = true;
    };
  }, [source, tenantId, transport]);

  const quote = useQuote(scenario?.contract ?? null, scenario?.quantities ?? {}, scenario?.edition ?? null, 'simulation');
  const base = useQuote(baseline?.contract ?? null, baseline?.quantities ?? {}, baseline?.edition ?? null, 'simulation');

  const sourceOptions = [
    { id: 'example', label: t('platform:simulator.sources.example') },
    { id: 'tenant', label: t('platform:simulator.sources.tenant') },
    ...EDITIONS.filter((e) => e !== 'custom').map((e) => ({ id: e, label: t('platform:simulator.sources.edition', { edition: editionName(t, e) }) })),
  ];

  return (
    <div className="space-y-6" data-testid="simulator">
      <PageHeader title={t('platform:pages.simulator')} description={t('platform:simulator.description')} badge={<Badge tone="demo" icon={FlaskConical}>{t('platform:simulator.badge')}</Badge>} />
      <InlineAlert tone="info" title={t('platform:simulator.bannerTitle')}>
        <span data-testid="simulator-banner">{t('platform:simulator.bannerBody')}</span>
      </InlineAlert>

      <div className="grid gap-3 rounded-card border border-border/70 bg-panel p-4 shadow-card sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        <SelectControl
          label={t('platform:simulator.startFrom')}
          value={source}
          options={sourceOptions}
          onChange={(v) => {
            if (!v) return;
            setSource(v as Source);
            if (v !== 'tenant') setParams({ tenant: null });
          }}
          testId="sim-source"
        />
        {source === 'tenant' && (
          <SelectControl
            label={t('platform:simulator.tenant')}
            value={tenantId}
            placeholder={t('platform:simulator.chooseTenant')}
            options={(tenants.data?.items ?? []).map((tn) => ({ id: tn.id, label: tn.displayName }))}
            onChange={(v) => {
              setTenantId(v);
              setParams({ tenant: v });
            }}
            testId="sim-tenant"
          />
        )}
        <div className="flex items-end">
          <Button variant="quiet" icon={RotateCcw} isDisabled={!baseline} onPress={() => setScenario(baseline)} data-testid="sim-reset">
            {t('platform:simulator.reset')}
          </Button>
        </div>
      </div>

      {loadError ? (
        <ErrorState error={loadError} />
      ) : !scenario || !rateCard.data ? (
        source === 'tenant' && !tenantId ? (
          <p className="text-muted">{t('platform:simulator.pickTenant')}</p>
        ) : (
          <Skeleton className="h-96 rounded-card" />
        )
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] [&>*]:min-w-0">
          <div>
            <LivePriceBar
              quote={quote.data}
              loading={quote.isFetching}
              unavailable={quote.isError}
              testId="sim-price-bar"
              action={
                <Button variant="quiet" size="sm" icon={ArrowDown} onPress={() => focusResults()} data-testid="sim-see-results">
                  {t('platform:simulator.seeResults')}
                </Button>
              }
            />
            <Controls scenario={scenario} onChange={setScenario} rateCard={rateCard.data.rateCard} />
          </div>
          <Results quote={quote.data} baseline={base.data} loading={quote.isFetching} unavailable={quote.isError} />
        </div>
      )}
    </div>
  );
}

function Controls({ scenario, onChange, rateCard }: { scenario: Scenario; onChange: (s: Scenario) => void; rateCard: RateCard }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const c = scenario.contract;
  const unitComponent = c.components.find((x) => x.type === 'PER_UNIT' || x.type === 'TIERED');
  const basis = unitComponent?.dimension ?? 'units.eligible';
  const setQ = (d: UsageDimension, n: number) => onChange({ ...scenario, quantities: { ...scenario.quantities, [d]: n } });
  const setContract = (contract: ContractDraft) => onChange({ ...scenario, contract });
  const setBasis = (d: UsageDimension) =>
    setContract({ ...c, components: c.components.map((x) => (x.type === 'PER_UNIT' || x.type === 'TIERED' ? { ...x, dimension: d } : x)) });
  const quick = c.discounts.find((d) => d.id === 'sim_quick');
  const setQuickDiscount = (pct: number) => {
    const others = c.discounts.filter((d) => d.id !== 'sim_quick');
    const next: ContractDiscount[] = pct > 0 ? [...others, { id: 'sim_quick', target: 'recurring', kind: 'percent', value: String(pct), from: c.terms.start, reason: t('platform:simulator.quickDiscountReason') }] : others;
    setContract({ ...c, discounts: next });
  };
  const units = scenario.quantities[basis] ?? 0;

  return (
    <div className="space-y-5">
      <section aria-labelledby="sim-counts" className="rounded-card border border-border/70 bg-panel p-5 shadow-card">
        <h2 id="sim-counts" className="text-base font-bold text-text">
          {t('platform:simulator.counts')}
        </h2>
        {unitComponent && (
          <div className="mt-4">
            <SegmentedControl
              label={t('platform:simulator.basis')}
              value={basis}
              options={UNIT_BASES.map((d) => ({ id: d, label: dimensionLabel(t, d) }))}
              onChange={(v) => setBasis(v)}
              testId="sim-basis"
            />
          </div>
        )}
        <Slider value={units} minValue={0} maxValue={Math.max(500, units)} step={1} onChange={(n) => setQ(basis, n as number)} className="mt-5 flex flex-col gap-2" data-testid="sim-units-slider">
          <div className="flex items-baseline justify-between gap-3">
            <Label className="text-sm font-medium text-text">{dimensionLabel(t, basis)}</Label>
            <SliderOutput className="text-lg font-bold text-text tabular">{({ state }) => fmt.count(state.getThumbValue(0))}</SliderOutput>
          </div>
          <SliderTrack className="relative h-7 w-full">
            {({ state }) => (
              <>
                <div className="absolute top-1/2 h-2 w-full -translate-y-1/2 rounded-pill bg-sunken" />
                <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-pill bg-primary" style={{ width: `${state.getThumbPercent(0) * 100}%` }} />
                <SliderThumb className="top-1/2 size-6 rounded-pill border-2 border-panel bg-primary shadow-card outline-none data-dragging:scale-110 data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus" />
              </>
            )}
          </SliderTrack>
        </Slider>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <CountInput label={dimensionLabel(t, basis)} value={units} onChange={(n) => setQ(basis, n)} max={1_000_000} testId="sim-units" />
          <CountInput label={dimensionLabel(t, 'sites.licensed')} value={scenario.quantities['sites.licensed'] ?? 1} min={1} max={500} onChange={(n) => setQ('sites.licensed', n)} testId="sim-sites" />
          <CountInput label={dimensionLabel(t, 'seats.staff_active')} value={scenario.quantities['seats.staff_active'] ?? 0} max={5000} onChange={(n) => setQ('seats.staff_active', n)} testId="sim-seats" />
          <CountInput label={dimensionLabel(t, 'sms.sent')} value={scenario.quantities['sms.sent'] ?? 0} max={1_000_000} step={10} onChange={(n) => setQ('sms.sent', n)} testId="sim-sms" />
        </div>
      </section>

      <section aria-labelledby="sim-terms" className="rounded-card border border-border/70 bg-panel p-5 shadow-card">
        <h2 id="sim-terms" className="text-base font-bold text-text">
          {t('platform:simulator.terms')}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <DateInput label={t('platform:wizard.pricing.start')} value={c.terms.start} onChange={(v) => v && setContract(withStart(c, v))} testId="sim-start" />
          <SegmentedControl
            label={t('platform:wizard.pricing.frequency')}
            value={c.terms.billingFrequency}
            options={(['monthly', 'quarterly', 'annual'] as const).map((f) => ({ id: f, label: t(`platform:cadence.${f}`) }))}
            onChange={(v) => setContract({ ...c, terms: { ...c.terms, billingFrequency: v } })}
            testId="sim-frequency"
          />
        </div>
        <Slider value={Number(quick?.value ?? 0)} minValue={0} maxValue={50} step={5} onChange={(n) => setQuickDiscount(n as number)} className="mt-5 flex flex-col gap-2" data-testid="sim-discount">
          <div className="flex items-baseline justify-between gap-3">
            <Label className="text-sm font-medium text-text">{t('platform:simulator.quickDiscount')}</Label>
            <SliderOutput className="font-bold text-text tabular">{({ state }) => `${state.getThumbValue(0)}%`}</SliderOutput>
          </div>
          <SliderTrack className="relative h-7 w-full">
            {({ state }) => (
              <>
                <div className="absolute top-1/2 h-2 w-full -translate-y-1/2 rounded-pill bg-sunken" />
                <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-pill bg-accent" style={{ width: `${state.getThumbPercent(0) * 100}%` }} />
                <SliderThumb className="top-1/2 size-6 rounded-pill border-2 border-panel bg-accent shadow-card outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus" />
              </>
            )}
          </SliderTrack>
        </Slider>
      </section>

      <section aria-labelledby="sim-components" className="rounded-card border border-border/70 bg-panel p-5 shadow-card">
        <h2 id="sim-components" className="text-base font-bold text-text">
          {t('platform:simulator.components')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('platform:simulator.componentsHint')}</p>
        <div className="mt-4">
          <PricingBuilder contract={c} onChange={setContract} rateCard={rateCard} edition={scenario.edition} siteIds={Array.from({ length: scenario.quantities['sites.licensed'] ?? 1 }, (_, i) => `site_${i + 1}`)} testId="sim-builder" />
        </div>
      </section>
    </div>
  );
}

function Results({ quote, baseline, loading, unavailable }: { quote: QuotePreview | undefined; baseline: QuotePreview | undefined; loading: boolean; unavailable: boolean }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const points = useMemo<ColumnTargetPoint[]>(
    () =>
      (quote?.schedule ?? []).map((p, i) => ({
        id: p.start,
        label: fmt.monthShort(p.start),
        fullLabel: fmt.monthLong(p.start),
        value: Number(p.total.amount),
        target: Number(baseline?.schedule[i]?.total.amount ?? 0),
      })),
    [quote, baseline, fmt],
  );
  if (unavailable)
    return (
      <div id="sim-results" tabIndex={-1} className="outline-none" data-testid="sim-results">
        <InlineAlert tone="error" title={t('platform:validation.quoteUnavailable')} />
      </div>
    );
  if (!quote) return <Skeleton className="h-96 rounded-card" />;
  const delta = baseline ? Number(quote.regularPeriod.total.amount) - Number(baseline.regularPeriod.total.amount) : 0;
  const yearDelta = baseline ? Number(quote.firstYearValue.amount) - Number(baseline.firstYearValue.amount) : 0;
  return (
    <div
      id="sim-results"
      tabIndex={-1}
      role="region"
      aria-label={t('platform:simulator.results')}
      className="scroll-mt-24 space-y-5 outline-none xl:sticky xl:top-24 xl:self-start"
      aria-live="polite"
      aria-busy={loading}
      data-testid="sim-results"
    >
      <QuoteTotals quote={quote} />
      {baseline && (delta !== 0 || yearDelta !== 0) && (
        <p className="flex items-center gap-2 text-sm font-medium" data-testid="sim-delta">
          {delta >= 0 ? <TrendingUp aria-hidden className="size-4 text-success" /> : <TrendingDown aria-hidden className="size-4 text-error" />}
          {t('platform:simulator.delta', {
            month: `${delta >= 0 ? '+' : '−'}${fmt.money(Math.abs(delta))}`,
            year: `${yearDelta >= 0 ? '+' : '−'}${fmt.money(Math.abs(yearDelta))}`,
          })}
        </p>
      )}
      <QuantitySources quote={quote} />
      <ApprovalNotice approval={quote.approval} />
      <ChartCard
        testId="sim-chart"
        title={t('platform:simulator.chartTitle')}
        summary={t('platform:simulator.chartSummary', { first: fmt.money(quote.firstPeriod.total), regular: fmt.money(quote.regularPeriod.total), year: fmt.money(quote.firstYearValue) })}
        legend={[
          { id: 'scenario', label: t('platform:simulator.scenario'), color: 'var(--color-data-1)', shape: 'rect' },
          { id: 'baseline', label: t('platform:simulator.baseline'), color: 'var(--color-text)', shape: 'line' },
        ]}
        table={{
          caption: t('platform:simulator.chartCaption'),
          columns: [
            { id: 'month', label: t('platform:dashboard.revenue.month') },
            { id: 'scenario', label: t('platform:simulator.scenario'), numeric: true },
            { id: 'baseline', label: t('platform:simulator.baseline'), numeric: true },
          ],
          rows: points.map((p) => ({
            id: p.id,
            cells: [
              p.fullLabel,
              <bdi key="s" dir="ltr">
                {fmt.money(p.value)}
              </bdi>,
              <bdi key="b" dir="ltr">
                {fmt.money(p.target)}
              </bdi>,
            ],
          })),
        }}
      >
        {({ titleId, summaryId }) => (
          <ColumnTargetChart
            points={points}
            labelledBy={titleId}
            describedBy={summaryId}
            formatValue={(n) => fmt.moneyCompact(n)}
            formatTick={fmt.compact}
            valueLabel={t('platform:simulator.scenario')}
            targetLabel={t('platform:simulator.baseline')}
            height={220}
            describePoint={(p) => t('platform:simulator.point', { month: p.fullLabel, scenario: fmt.money(p.value), baseline: fmt.money(p.target) })}
          />
        )}
      </ChartCard>
      <div className="rounded-card border border-border/70 bg-panel p-5 shadow-card">
        <QuoteBreakdown period={quote.regularPeriod} title={t('platform:quote.regularPeriod')} testId="sim-regular" />
      </div>
    </div>
  );
}
