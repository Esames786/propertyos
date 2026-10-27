import type { ContractDiscount, ContractDraft, EditionKey, LicensedSite, ModuleSelection, QuotePreview, RateCard, UsageDimension } from '@repo/contracts';
import { Badge, Button, IconButton, InlineAlert, SegmentedControl, SelectControl, useT } from '@repo/ui';
import { Info, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Switch } from 'react-aria-components';
import { CountInput, DateInput, MoneyInput, TextInput } from '../../../components/inputs';
import { Expandable } from '../../../components/Expandable';
import { componentLabel, overridesMissingReason, PricingBuilder } from '../../../components/PricingBuilder';
import { useHqFormat } from '../../../lib/format';
import { dimensionLabel } from '../../../lib/labels';
import { StepActions, StepFrame } from '../WizardChrome';
import { usedDimensions, withStart, withTrial } from '../wizard';

interface StepProps {
  autoFocus: boolean;
  onBack: () => void;
  pending: boolean;
}

function TrialSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const { t } = useT();
  return (
    <Switch isSelected={on} onChange={onChange} className="group flex cursor-default items-center gap-3 text-sm font-medium text-text outline-none" data-testid="trial-switch">
      <span className="relative h-6 w-11 shrink-0 rounded-pill border-2 border-border-control bg-sunken transition-colors group-data-selected:border-primary group-data-selected:bg-primary group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus">
        <span className="absolute top-0.5 start-0.5 size-4 rounded-pill bg-panel shadow-card transition-transform group-data-selected:translate-x-5 rtl:group-data-selected:-translate-x-5" />
      </span>
      {t('platform:wizard.pricing.trial')}
    </Switch>
  );
}

// ---------------------------------------------------------------- 5. Pricing builder

export function PricingStep({
  contract,
  onChange,
  rateCard,
  edition,
  sites,
  modules,
  onSubmit,
  ...p
}: StepProps & {
  contract: ContractDraft;
  onChange: (c: ContractDraft) => void;
  rateCard: RateCard;
  edition: EditionKey;
  sites: LicensedSite[];
  modules: ModuleSelection[];
  onSubmit: () => void;
}) {
  const { t } = useT();
  const [attempt, setAttempt] = useState(0);
  const missingReason = overridesMissingReason(contract, rateCard);
  const errors = [...(contract.components.length === 0 ? [t('platform:wizard.pricing.errors.none')] : []), ...(missingReason ? [t('platform:wizard.pricing.errors.reason')] : [])];
  const onlineSites = modules.find((m) => m.module === 'online_payments')?.sites;
  const addOnSites = onlineSites === 'all' || onlineSites === undefined ? sites.map((s) => s.id) : [...onlineSites];
  const trial = contract.components.some((c) => c.type === 'TRIAL');
  return (
    <StepFrame step="pricing" title={t('platform:wizard.pricing.title')} intro={t('platform:wizard.pricing.intro')} autoFocus={p.autoFocus} testId="step-pricing">
      {attempt > 0 && errors.length > 0 && (
        <InlineAlert tone="error" role="alert" className="mb-5" title={t('platform:wizard.errors.title', { count: errors.length })}>
          <ul className="list-disc ps-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </InlineAlert>
      )}
      <section aria-labelledby="terms-heading" className="rounded-tile border border-border/70 bg-raised p-4">
        <h2 id="terms-heading" className="text-sm font-bold text-text">
          {t('platform:wizard.pricing.terms')}
        </h2>
        <div className="@container mt-3">
        <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-4">
          <DateInput label={t('platform:wizard.pricing.start')} value={contract.terms.start} onChange={(v) => v && onChange(withStart(contract, v))} testId="contract-start" />
          <SelectControl
            label={t('platform:wizard.pricing.term')}
            value={contract.terms.termMonths === null ? 'rolling' : String(contract.terms.termMonths)}
            options={['12', '24', '36', '48', 'rolling'].map((m) => ({ id: m, label: m === 'rolling' ? t('platform:wizard.pricing.rolling') : t('platform:wizard.pricing.months', { count: Number(m) }) }))}
            onChange={(v) => v && onChange({ ...contract, terms: { ...contract.terms, termMonths: v === 'rolling' ? null : Number(v) } })}
            testId="contract-term"
          />
          <div className="@md:col-span-2">
            <SegmentedControl
              label={t('platform:wizard.pricing.frequency')}
              value={contract.terms.billingFrequency}
              options={(['monthly', 'quarterly', 'annual'] as const).map((f) => ({ id: f, label: t(`platform:cadence.${f}`) }))}
              onChange={(v) => onChange({ ...contract, terms: { ...contract.terms, billingFrequency: v } })}
              testId="contract-frequency"
            />
          </div>
        </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <TrialSwitch on={trial} onChange={(v) => onChange(withTrial(contract, v, rateCard))} />
          <span className="text-xs text-muted">{t('platform:wizard.pricing.trialHint')}</span>
        </div>
      </section>

      <h2 className="mt-6 mb-3 text-sm font-bold text-text">{t('platform:wizard.pricing.components')}</h2>
      <PricingBuilder contract={contract} onChange={onChange} rateCard={rateCard} edition={edition} siteIds={addOnSites} />

      <StepActions
        testId="step-pricing"
        onBack={p.onBack}
        pending={p.pending}
        onNext={() => {
          setAttempt((a) => a + 1);
          if (errors.length === 0) onSubmit();
        }}
      />
    </StepFrame>
  );
}

// ---------------------------------------------------------------- 6. Usage and unit counts

const READ_ONLY: UsageDimension[] = ['sites.licensed', 'buildings.active'];

export function CountsStep({
  contract,
  quantities,
  onChange,
  onSubmit,
  ...p
}: StepProps & {
  contract: ContractDraft;
  quantities: Partial<Record<UsageDimension, number>>;
  onChange: (q: Partial<Record<UsageDimension, number>>) => void;
  onSubmit: () => void;
}) {
  const { t } = useT();
  const fmt = useHqFormat();
  const used = usedDimensions(contract);
  const unitDims: UsageDimension[] = ['units.registered', 'units.active', 'units.occupied', 'units.eligible', 'units.licensed_capacity'];
  const pricedUnitDim = contract.components.find((c) => c.type === 'PER_UNIT' || c.type === 'TIERED')?.dimension;
  const editable = used.filter((d) => !READ_ONLY.includes(d));
  return (
    <StepFrame step="counts" title={t('platform:wizard.counts.title')} intro={t('platform:wizard.counts.intro')} autoFocus={p.autoFocus} testId="step-counts">
      <InlineAlert tone="info" title={t('platform:wizard.counts.estimateTitle')}>
        {t('platform:wizard.counts.estimateBody')}
      </InlineAlert>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {editable.map((d) => (
          <CountInput
            key={d}
            label={dimensionLabel(t, d)}
            description={t(`platform:dimensionHelp.${d.replace(/\./g, '_') as 'units_eligible'}`)}
            value={quantities[d] ?? 0}
            min={0}
            max={1_000_000}
            onChange={(n) => onChange({ ...quantities, [d]: n })}
            testId={`count-${d}`}
          />
        ))}
      </div>

      <section aria-labelledby="unit-compare" className="mt-6 rounded-tile border border-border/70 p-4" data-testid="unit-dimensions">
        <h2 id="unit-compare" className="text-sm font-bold text-text">
          {t('platform:wizard.counts.compareTitle')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('platform:wizard.counts.compareBody')}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {unitDims.map((d) => (
            <div key={d} className={`rounded-tile border p-3 ${d === pricedUnitDim ? 'border-primary bg-primary-soft/50' : 'border-border/70'}`}>
              <dt className="text-xs text-muted">{dimensionLabel(t, d)}</dt>
              <dd className="text-lg font-bold text-text tabular">{fmt.count(quantities[d] ?? 0)}</dd>
              {d === pricedUnitDim && (
                <dd>
                  <Badge tone="success">{t('platform:wizard.counts.priced')}</Badge>
                </dd>
              )}
            </div>
          ))}
        </dl>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t('platform:wizard.counts.duesNote')}
        </p>
      </section>

      <p className="mt-4 text-sm text-muted">
        {t('platform:wizard.counts.fromSites', { sites: fmt.count(quantities['sites.licensed'] ?? 0), buildings: fmt.count(quantities['buildings.active'] ?? 0) })}
      </p>
      <StepActions testId="step-counts" onBack={p.onBack} pending={p.pending} onNext={onSubmit} />
    </StepFrame>
  );
}

// ---------------------------------------------------------------- 7. Tax and discounts

let dSeq = 0;

export function TermsStep({
  contract,
  onChange,
  taxCodes,
  onSubmit,
  quote,
  ...p
}: StepProps & {
  contract: ContractDraft;
  onChange: (c: ContractDraft) => void;
  taxCodes: ReadonlyArray<{ code: string; ratePct: string }>;
  onSubmit: () => void;
  quote: QuotePreview | undefined;
}) {
  const { t } = useT();
  const [attempt, setAttempt] = useState(0);
  const setDiscount = (id: string, patch: Partial<ContractDiscount>) => onChange({ ...contract, discounts: contract.discounts.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  const errors = contract.discounts.flatMap((d, i) => [
    ...(!(Number(d.value) > 0) ? [t('platform:wizard.terms.errors.value', { n: i + 1 })] : []),
    ...(d.kind === 'percent' && Number(d.value) > 100 ? [t('platform:wizard.terms.errors.percent', { n: i + 1 })] : []),
    ...(!d.reason?.trim() ? [t('platform:wizard.terms.errors.reason', { n: i + 1 })] : []),
  ]);
  const targets = [
    { id: 'recurring', label: t('platform:wizard.terms.targets.recurring') },
    { id: 'contract', label: t('platform:wizard.terms.targets.contract') },
    ...contract.components.filter((c) => c.type !== 'TRIAL' && c.type !== 'FREE').map((c) => ({ id: c.id, label: componentLabel(t, c) })),
  ];
  const show = attempt > 0;
  const moreSet = contract.terms.tax.code !== 'NONE' || !!contract.terms.minimumMonthly || !!contract.terms.capMonthly;
  const moreSummary = moreSet ? t('platform:wizard.terms.moreSet') : t('platform:wizard.terms.moreDefault');
  return (
    <StepFrame step="terms" title={t('platform:wizard.terms.title')} intro={t('platform:wizard.terms.intro')} autoFocus={p.autoFocus} testId="step-terms">
      {show && errors.length > 0 && (
        <InlineAlert tone="error" role="alert" className="mb-5" title={t('platform:wizard.errors.title', { count: errors.length })}>
          <ul className="list-disc ps-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </InlineAlert>
      )}

      <section aria-labelledby="discounts-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="discounts-heading" className="text-sm font-bold text-text">
            {t('platform:wizard.terms.discounts')}
          </h2>
          <Button
            variant="secondary"
            icon={Plus}
            onPress={() =>
              onChange({ ...contract, discounts: [...contract.discounts, { id: `dsc_${Date.now().toString(36)}${dSeq++}`, target: 'recurring', kind: 'percent', value: '10', from: contract.terms.start, reason: '' }] })
            }
            data-testid="add-discount"
          >
            {t('platform:wizard.terms.addDiscount')}
          </Button>
        </div>
        {contract.discounts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t('platform:wizard.terms.noDiscounts')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {contract.discounts.map((d, i) => (
              <li key={d.id} className="rounded-tile border border-border/70 p-4" data-testid={`discount-${i}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-text">{t('platform:wizard.terms.discountN', { n: i + 1 })}</h3>
                  <IconButton label={t('platform:wizard.terms.removeDiscount', { n: i + 1 })} icon={Trash2} onPress={() => onChange({ ...contract, discounts: contract.discounts.filter((x) => x.id !== d.id) })} />
                </div>
                <div className="@container mt-3">
                <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-4">
                  <SelectControl label={t('platform:wizard.terms.target')} value={d.target} options={targets} onChange={(v) => v && setDiscount(d.id, { target: v, kind: v === 'recurring' || v === 'contract' ? 'percent' : d.kind })} testId={`discount-target-${i}`} />
                  <SegmentedControl
                    label={t('platform:wizard.terms.kind')}
                    value={d.kind}
                    options={[
                      { id: 'percent', label: t('platform:wizard.terms.percent') },
                      ...(d.target !== 'recurring' && d.target !== 'contract' ? [{ id: 'amount' as const, label: t('platform:wizard.terms.amount') }] : []),
                    ]}
                    onChange={(v) => setDiscount(d.id, { kind: v, value: v === 'percent' ? '10' : '1000.00' })}
                    testId={`discount-kind-${i}`}
                  />
                  {d.kind === 'percent' ? (
                    <CountInput label={t('platform:wizard.terms.percentValue')} value={Number(d.value)} min={0} max={100} onChange={(n) => setDiscount(d.id, { value: String(n) })} isInvalid={show && !(Number(d.value) > 0)} testId={`discount-value-${i}`} />
                  ) : (
                    <MoneyInput label={t('platform:wizard.terms.amountValue')} value={d.value} onChange={(a) => setDiscount(d.id, { value: a || '0.00' })} isInvalid={show && !(Number(d.value) > 0)} testId={`discount-value-${i}`} />
                  )}
                  <DateInput label={t('platform:builder.from')} value={d.from} onChange={(v) => v && setDiscount(d.id, { from: v })} testId={`discount-from-${i}`} />
                  <DateInput label={t('platform:builder.to')} optional value={d.to ?? ''} onChange={(v) => setDiscount(d.id, { to: v || undefined })} testId={`discount-to-${i}`} />
                  <TextInput
                    className="@md:col-span-2 @3xl:col-span-3"
                    label={t('platform:wizard.terms.reason')}
                    value={d.reason ?? ''}
                    onChange={(v) => setDiscount(d.id, { reason: v })}
                    isInvalid={show && !d.reason?.trim()}
                    errorMessage={t('platform:wizard.terms.errors.reasonField')}
                    testId={`discount-reason-${i}`}
                  />
                </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {quote?.approval.required && (
          <p className="mt-3 text-sm text-warning" data-testid="terms-approval-hint">
            {t('platform:wizard.terms.approvalHint', { count: quote.approval.reasons.length })}
          </p>
        )}
      </section>

      <div className="mt-6">
        <Expandable
          title={t('platform:wizard.terms.more')}
          summary={moreSummary}
          defaultExpanded={moreSet}
          testId="terms-more"
        >
        <section aria-labelledby="tax-heading" className="border-t border-border/70 pt-4">
          <h3 id="tax-heading" className="text-sm font-semibold text-text">
            {t('platform:wizard.terms.tax')}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <SelectControl
              label={t('platform:wizard.terms.taxCode')}
              value={contract.terms.tax.code}
              options={taxCodes.map((c) => ({ id: c.code, label: t(`platform:taxCodes.${c.code.replace(/-/g, '_') as 'NONE'}`, { rate: c.ratePct }) }))}
              onChange={(v) => {
                const code = taxCodes.find((c) => c.code === v);
                if (code) onChange({ ...contract, terms: { ...contract.terms, tax: { code: code.code, ratePct: code.ratePct } } });
              }}
              description={t('platform:wizard.terms.taxHint')}
              testId="tax-code"
            />
          </div>
        </section>

        <section aria-labelledby="limits-heading" className="mt-4 border-t border-border/70 pt-4">
          <h3 id="limits-heading" className="text-sm font-semibold text-text">
            {t('platform:wizard.terms.limits')}
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <MoneyInput
              label={t('platform:wizard.terms.minimum')}
              description={t('platform:wizard.terms.minimumHint')}
              value={contract.terms.minimumMonthly?.amount ?? ''}
              onChange={(a) => onChange({ ...contract, terms: { ...contract.terms, minimumMonthly: a ? { amount: a, currency: 'PKR' } : undefined } })}
              testId="terms-minimum"
            />
            <MoneyInput
              label={t('platform:wizard.terms.cap')}
              description={t('platform:wizard.terms.capHint')}
              value={contract.terms.capMonthly?.amount ?? ''}
              onChange={(a) => onChange({ ...contract, terms: { ...contract.terms, capMonthly: a ? { amount: a, currency: 'PKR' } : undefined } })}
              testId="terms-cap"
            />
          </div>
        </section>

        </Expandable>
      </div>

      <StepActions
        testId="step-terms"
        onBack={p.onBack}
        pending={p.pending}
        onNext={() => {
          setAttempt((a) => a + 1);
          if (errors.length === 0) onSubmit();
        }}
      />
    </StepFrame>
  );
}
