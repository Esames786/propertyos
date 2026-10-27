import {
  componentFromLine,
  type ContractDraft,
  type EditionKey,
  type PricingComponent,
  type RateCard,
  type RateCardLine,
  type UsageDimension,
} from '@repo/contracts';
import { Badge, Button, cn, IconButton, MenuButton, SegmentedControl, SelectControl, Switch, useT, type MenuGroup } from '@repo/ui';
import { useState } from 'react';
import { CalendarClock, Layers, Plus, Trash2 } from 'lucide-react';
import { useHqFormat } from '../lib/format';
import { componentName, dimensionLabel, moduleName } from '../lib/labels';
import { CountInput, DateInput, MoneyInput, TextInput } from './inputs';

const UNIT_DIMENSIONS: UsageDimension[] = ['units.eligible', 'units.occupied', 'units.registered', 'units.active', 'units.licensed_capacity'];

let seq = 0;
const newId = (base: string) => `${base}_${Date.now().toString(36)}${(seq++).toString(36)}`;

/** First day of the month after `iso`. */
function nextMonth(iso: string): string {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function componentLabel(t: ReturnType<typeof useT>['t'], c: Pick<PricingComponent, 'type' | 'module' | 'dimension'>): string {
  if (c.module) return t('platform:quote.moduleAddOn', { module: moduleName(t, c.module) });
  if ((c.type === 'PER_UNIT' || c.type === 'TIERED') && c.dimension) return t(`platform:components.${c.type}.withBasis`, { basis: dimensionLabel(t, c.dimension) });
  return componentName(t, c.type);
}

/**
 * HQ-012 pricing component table: one card per component with its basis, price and dates, the
 * rate-card price beside any override (which then needs a reason), and "Schedule a price change"
 * for versioned rates. No arithmetic happens here: the server prices the contract.
 *
 * Basic shows what most contracts change (each price and what it counts); Advanced adds effective
 * dates and scheduled price changes. Prices that already carry their own dates keep them visible.
 */
export function PricingBuilder({
  contract,
  onChange,
  rateCard,
  edition,
  siteIds,
  testId = 'pricing-builder',
}: {
  contract: ContractDraft;
  onChange: (next: ContractDraft) => void;
  rateCard: RateCard;
  edition: EditionKey;
  /** Sites a site-scoped add-on is charged for. */
  siteIds: readonly string[];
  testId?: string;
}) {
  const { t } = useT();
  const fmt = useHqFormat();
  const lines = rateCard.lines.filter((l) => l.editions.includes(edition));
  const lineOf = (c: PricingComponent) => rateCard.lines.find((l) => l.id === c.rateCardLineId);
  const [advancedChoice, setAdvanced] = useState(false);
  const dated = contract.components.some((c) => c.type !== 'TRIAL' && (c.effectiveFrom !== contract.terms.start || !!c.effectiveTo));
  const advanced = advancedChoice || dated;

  const update = (id: string, patch: Partial<PricingComponent>) =>
    onChange({ ...contract, components: contract.components.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const remove = (id: string) => onChange({ ...contract, components: contract.components.filter((c) => c.id !== id), discounts: contract.discounts.filter((d) => d.target !== id) });
  const add = (line: RateCardLine) => {
    const c = componentFromLine(line, newId(line.id.replace(/^rc_/, 'cmp_')), contract.terms.start);
    onChange({ ...contract, components: [...contract.components, line.type === 'PER_MODULE' && line.module ? { ...c, siteIds } : c] });
  };
  /** Versioned rate: the current component ends where the new one (same basis, new price) starts. */
  const schedule = (c: PricingComponent) => {
    // Default: the start of the third billing month (editable), e.g. 1 Jan 2027 for a 1 Nov 2026 start.
    const from = nextMonth(nextMonth(c.effectiveFrom > contract.terms.start ? c.effectiveFrom : contract.terms.start));
    const next: PricingComponent = { ...c, id: newId(c.id.replace(/_v\d+.*$/, '')), effectiveFrom: from, effectiveTo: undefined, overrideReason: undefined };
    onChange({ ...contract, components: contract.components.flatMap((x) => (x.id === c.id ? [{ ...x, effectiveTo: from }, next] : [x])) });
  };

  const groups: MenuGroup[] = [
    {
      id: 'recurring',
      title: t('platform:builder.addGroups.recurring'),
      items: lines.filter((l) => ['FIXED_RECURRING', 'PER_UNIT', 'TIERED', 'PER_SITE', 'PER_BUILDING', 'PER_SEAT', 'FREE'].includes(l.type)).map((l) => menuItem(l)),
    },
    { id: 'addons', title: t('platform:builder.addGroups.addons'), items: lines.filter((l) => l.type === 'PER_MODULE').map((l) => menuItem(l)) },
    { id: 'other', title: t('platform:builder.addGroups.other'), items: lines.filter((l) => ['ONE_TIME', 'USAGE', 'TRIAL'].includes(l.type)).map((l) => menuItem(l)) },
  ].filter((g) => g.items.length > 0);

  function menuItem(l: RateCardLine) {
    const name = l.module ? t('platform:quote.moduleAddOn', { module: moduleName(t, l.module) }) : componentLabel(t, l);
    const price = l.unitPrice ? fmt.money(l.unitPrice) : l.tiers ? t('platform:builder.tiered') : l.trialDays ? t('platform:builder.trialDays', { days: l.trialDays }) : '';
    return { id: l.id, label: name, description: price ? `${price} · ${t(`platform:cadence.${l.cadence}`)}` : t(`platform:cadence.${l.cadence}`), testId: `add-${l.id}` };
  }

  return (
    <div className="space-y-3" data-testid={testId} data-mode={advanced ? 'advanced' : 'basic'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {dated ? (
          <p className="text-sm text-muted" data-testid={`${testId}-dated`}>
            <CalendarClock aria-hidden className="me-1 inline size-4" />
            {t('platform:builder.datedShown')}
          </p>
        ) : (
          <Switch isSelected={advancedChoice} onChange={setAdvanced} label={t('platform:builder.advanced')} description={t('platform:builder.advancedHint')} testId={`${testId}-advanced`} />
        )}
      </div>
      {contract.components.length === 0 && <p className="rounded-tile border border-dashed border-border p-4 text-sm text-muted">{t('platform:builder.empty')}</p>}
      <ul className="space-y-3">
        {contract.components.map((c) => {
          const line = lineOf(c);
          const name = componentLabel(t, c);
          const listPrice = line?.unitPrice;
          const overridden = listPrice !== undefined && c.unitPrice !== undefined && Number(listPrice.amount) !== Number(c.unitPrice.amount);
          const recurring = !['ONE_TIME', 'TRIAL', 'USAGE'].includes(c.type);
          return (
            <li key={c.id} className="rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid={`component-${c.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-text">{name}</p>
                  <p className="text-xs text-muted">
                    {t(`platform:components.${c.type}.description`)}
                    {c.effectiveTo ? ` · ${t('platform:builder.until', { date: fmt.date(c.effectiveTo) })}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {c.effectiveFrom > contract.terms.start && <Badge tone="info" icon={CalendarClock}>{t('platform:builder.scheduled', { date: fmt.date(c.effectiveFrom) })}</Badge>}
                  {advanced && recurring && c.type !== 'FREE' && !c.effectiveTo && (
                    <IconButton label={t('platform:builder.schedule', { name })} icon={CalendarClock} onPress={() => schedule(c)} data-testid={`schedule-${c.id}`} />
                  )}
                  <IconButton label={t('platform:builder.remove', { name })} icon={Trash2} onPress={() => remove(c.id)} data-testid={`remove-${c.id}`} />
                </div>
              </div>

              <div className="@container mt-3">
              <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-4">
                {(c.type === 'PER_UNIT' || c.type === 'TIERED') && (
                  <SelectControl
                    label={t('platform:builder.basis')}
                    value={c.dimension ?? 'units.eligible'}
                    options={UNIT_DIMENSIONS.map((d) => ({ id: d, label: dimensionLabel(t, d) }))}
                    onChange={(v) => v && update(c.id, { dimension: v as UsageDimension })}
                    testId={`basis-${c.id}`}
                  />
                )}
                {c.unitPrice !== undefined && c.type !== 'FREE' && (
                  <MoneyInput
                    label={c.type === 'USAGE' ? t('platform:builder.pricePerUse') : c.type === 'ONE_TIME' ? t('platform:builder.oneTimePrice') : t('platform:builder.unitPrice')}
                    value={c.unitPrice.amount}
                    onChange={(amount) => update(c.id, { unitPrice: { amount: amount || '0.00', currency: 'PKR' } })}
                    description={listPrice ? t('platform:builder.listPrice', { price: fmt.money(listPrice) }) : undefined}
                    testId={`price-${c.id}`}
                  />
                )}
                {c.type === 'TIERED' && (
                  <div className="space-y-2 @md:col-span-2">
                    <SegmentedControl
                      label={t('platform:builder.tierMethod')}
                      value={c.tierMethod ?? 'graduated'}
                      options={[
                        { id: 'graduated', label: t('platform:builder.graduated') },
                        { id: 'volume', label: t('platform:builder.volume') },
                      ]}
                      onChange={(v) => update(c.id, { tierMethod: v })}
                      testId={`tier-method-${c.id}`}
                    />
                    <ul className="grid gap-2 @md:grid-cols-2">
                      {(c.tiers ?? []).map((tier, i) => (
                        <li key={i}>
                          <MoneyInput
                            label={tier.upTo === null ? t('platform:builder.tierRest', { from: ((c.tiers ?? [])[i - 1]?.upTo ?? 0) + 1 }) : t('platform:builder.tierUpTo', { upTo: tier.upTo })}
                            value={tier.unitPrice.amount}
                            onChange={(amount) => update(c.id, { tiers: (c.tiers ?? []).map((x, j) => (j === i ? { ...x, unitPrice: { amount: amount || '0.00', currency: 'PKR' } } : x)) })}
                            testId={`tier-${c.id}-${i}`}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {c.type === 'USAGE' && (
                  <CountInput label={t('platform:builder.allowance')} value={c.allowance ?? 0} onChange={(n) => update(c.id, { allowance: n })} testId={`allowance-${c.id}`} />
                )}
                {c.type === 'TRIAL' && <CountInput label={t('platform:builder.trialLength')} value={c.trialDays ?? 30} min={1} max={365} onChange={(n) => update(c.id, { trialDays: n })} testId={`trial-${c.id}`} />}
                {c.type === 'PER_MODULE' && c.siteIds && (
                  <p className="self-end text-sm text-muted">
                    <Layers aria-hidden className="me-1 inline size-4" />
                    {t('platform:builder.perSite', { count: c.siteIds.length })}
                  </p>
                )}
                {advanced && <DateInput label={t('platform:builder.from')} value={c.effectiveFrom} onChange={(v) => v && update(c.id, { effectiveFrom: v })} testId={`from-${c.id}`} />}
                {advanced && recurring && (
                  <DateInput label={t('platform:builder.to')} optional value={c.effectiveTo ?? ''} onChange={(v) => update(c.id, { effectiveTo: v || undefined })} description={t('platform:builder.toHint')} testId={`to-${c.id}`} />
                )}
              </div>
              </div>

              {overridden && (
                <TextInput
                  className="mt-3"
                  label={t('platform:builder.overrideReason', { price: fmt.money(listPrice) })}
                  value={c.overrideReason ?? ''}
                  onChange={(v) => update(c.id, { overrideReason: v })}
                  isInvalid={!c.overrideReason?.trim()}
                  errorMessage={t('platform:builder.overrideReasonRequired')}
                  testId={`reason-${c.id}`}
                />
              )}
            </li>
          );
        })}
      </ul>
      <MenuButton
        label={t('platform:builder.add')}
        placement="bottom start"
        trigger={
          <Button variant="secondary" icon={Plus} data-testid={`${testId}-add`}>
            {t('platform:builder.add')}
          </Button>
        }
        groups={groups}
        onAction={(id) => {
          const l = rateCard.lines.find((x) => x.id === id);
          if (l) add(l);
        }}
      />
      <p className={cn('text-xs text-muted')}>{t('platform:builder.serverNote')}</p>
    </div>
  );
}

/** Every price override has a reason (D-14): the step cannot continue without them. */
export const overridesMissingReason = (contract: ContractDraft, rateCard: RateCard) =>
  contract.components.some((c) => {
    const list = rateCard.lines.find((l) => l.id === c.rateCardLineId)?.unitPrice;
    return list && c.unitPrice && Number(list.amount) !== Number(c.unitPrice.amount) && !c.overrideReason?.trim();
  });
