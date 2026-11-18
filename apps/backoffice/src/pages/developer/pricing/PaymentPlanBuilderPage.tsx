import { PricingRelatedLinks } from './PricingRelatedLinks';
import { wrappable } from './amount';
import type { PlanAllocationInput, PlanAllocationKind, PlanPreview, UnitPricePickerResponse } from '@repo/contracts';
import { Badge, Button, EmptyState, ErrorState, PageHeader, SelectControl, SkeletonBlock, useApiMutation, useApiQuery, useT } from '@repo/ui';
import { Calculator, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useCrmFormat } from '../../crm/format';

const KINDS: readonly PlanAllocationKind[] = ['down_payment', 'instalments', 'on_possession', 'balloon', 'construction_linked'];
type DraftRow = { id: number; kind: PlanAllocationKind; percent: string; count: string; milestoneKey: string };
const START: DraftRow[] = [
  { id: 1, kind: 'down_payment', percent: '10', count: '1', milestoneKey: '' },
  { id: 2, kind: 'instalments', percent: '90', count: '12', milestoneKey: '' },
];

/** Percent input is parsed in hundredths (basis points), never with JS float money arithmetic. */
function basisPoints(raw: string): number | null {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(raw)) return null;
  const [whole, decimals = ''] = raw.split('.');
  const bps = Number(whole) * 100 + Number(decimals.padEnd(2, '0') || '0');
  return bps >= 0 && bps <= 10000 ? bps : null;
}

function asAllocations(rows: readonly DraftRow[]): PlanAllocationInput[] | null {
  if (!rows.length || rows.length > 24) return null;
  const allocations: PlanAllocationInput[] = [];
  for (const row of rows) {
    const shareBps = basisPoints(row.percent);
    if (shareBps === null) return null;
    if (row.kind === 'instalments') {
      const count = Number(row.count);
      if (!/^\d{1,2}$/.test(row.count) || !Number.isInteger(count) || count < 1 || count > 36) return null;
      allocations.push({ kind: row.kind, shareBps, count });
    } else if (row.kind === 'construction_linked') {
      if (!/^[A-Za-z][A-Za-z0-9_-]{1,39}$/.test(row.milestoneKey)) return null;
      allocations.push({ kind: row.kind, shareBps, milestoneKey: row.milestoneKey });
    } else {
      allocations.push({ kind: row.kind, shareBps });
    }
  }
  return allocations.reduce((sum, row) => sum + row.shareBps, 0) === 10000 ? allocations : null;
}

/**
 * COM-002. This page calls one pure, permission-gated preview endpoint. There is no
 * save, issue, approve, post or payment action anywhere in the UI.
 */
export default function PaymentPlanBuilderPage() {
  const { t } = useT();
  const fmt = useCrmFormat();
  const [unitId, setUnitId] = useState<string | null>(null);
  const [rows, setRows] = useState<DraftRow[]>(START);
  const [nextRowId, setNextRowId] = useState(3);
  const [previewData, setPreviewData] = useState<PlanPreview | null>(null);
  const [invalid, setInvalid] = useState(false);
  const units = useApiQuery<UnitPricePickerResponse>({ method: 'GET', path: '/pricing/units' });
  const compute = useApiMutation<PlanPreview>();
  const kindLabels: Record<PlanAllocationKind, string> = {
    down_payment: t('pricing:previewKindDown'),
    instalments: t('pricing:previewKindInstalments'),
    on_possession: t('pricing:previewKindPossession'),
    balloon: t('pricing:previewKindBalloon'),
    construction_linked: t('pricing:previewKindConstruction'),
  };
  const update = (id: number, patch: Partial<DraftRow>) => {
    setRows((old) => old.map((row) => row.id === id ? { ...row, ...patch } : row));
    setPreviewData(null);
    setInvalid(false);
  };
  const onPreview = async () => {
    const allocations = asAllocations(rows);
    if (!unitId || !allocations) { setInvalid(true); return; }
    setInvalid(false);
    try {
      const result = await compute.mutateAsync({ method: 'POST', path: '/pricing/plan-preview', body: { unitId, allocations } });
      setPreviewData(result);
    } catch {
      setPreviewData(null);
    }
  };
  const selectionOptions = (units.data?.items ?? []).map((unit) => ({
    id: unit.id,
    label: `${unit.ref} — ${unit.projectName}`,
  }));
  const selectedUnit = units.data?.items.find((unit) => unit.id === unitId);
  const rawTotal = rows.reduce((sum, line) => sum + (basisPoints(line.percent) ?? 0), 0);
  const displayedTotal = `${Math.floor(rawTotal / 100)}.${String(rawTotal % 100).padStart(2, '0')}`;

  return (
    <div className="space-y-6 @container" data-testid="payment-plan-builder-page">
      <PageHeader title={t('pricing:previewTitle')} description={t('pricing:previewIntro')} />
      <PricingRelatedLinks current="builder" />
      <p className="rounded-control border border-border bg-sunken p-3 text-sm text-muted" data-testid="plan-preview-warning">
        {t('pricing:previewMoneyWarning')}
      </p>
      {units.isError ? (
        <ErrorState error={units.error} onRetry={() => void units.refetch()} />
      ) : !units.data ? (
        <SkeletonBlock lines={6} />
      ) : (
        <div className="space-y-6">
          <section className="rounded-card border border-border bg-panel p-4 space-y-3" aria-labelledby="plan-unit-heading">
            <h2 id="plan-unit-heading" className="font-semibold text-text">{t('pricing:previewUnit')}</h2>
            <SelectControl
              label={t('pricing:previewSelectUnit')}
              value={unitId}
              onChange={(id) => { setUnitId(id); setPreviewData(null); setInvalid(false); }}
              isDisabled={compute.isPending}
              options={selectionOptions}
              optional
              testId="plan-unit-picker"
            />
            {selectedUnit && (
              <p className="text-sm font-semibold text-text" data-testid="plan-unit-price">
                <bdi dir="ltr">{selectedUnit.ref}</bdi>{' — '}
                <bdi dir="ltr" className="[overflow-wrap:anywhere]">{wrappable(fmt.moneyExact(selectedUnit.currentListedPrice))}</bdi>
              </p>
            )}
            {!units.data.items.length && <EmptyState title={t('pricing:noneFound')} />}
          </section>
          <section className="space-y-4 rounded-card border border-border bg-panel p-4" aria-labelledby="plan-allocations">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="plan-allocations" className="font-semibold text-text">{t('pricing:previewLines')}</h2>
              <span className="text-sm text-muted" data-testid="plan-share-total">{t('pricing:previewTotalShare')}: <bdi dir="ltr">{displayedTotal}%</bdi></span>
            </div>
            <fieldset disabled={compute.isPending} className="space-y-3">
              {rows.map((row, index) => (
                <div key={row.id} className="grid min-w-0 gap-3 rounded-control border border-border bg-sunken p-3 @lg:grid-cols-[minmax(0,2fr)_minmax(7rem,1fr)_auto]" data-testid="plan-allocation">
                  <SelectControl
                    label={t('pricing:previewKind')}
                    value={row.kind}
                    onChange={(kind) => update(row.id, { kind: (kind ?? 'down_payment') as PlanAllocationKind })}
                    options={KINDS.map((kind) => ({ id: kind, label: kindLabels[kind] }))}
                    testId={`plan-kind-${index}`}
                  />
                  <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-text">
                    {t('pricing:previewPercent')}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.percent}
                      onChange={(e) => update(row.id, { percent: e.target.value })}
                      data-testid={`plan-percent-${index}`}
                      className="min-h-11 w-full min-w-0 rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      aria-invalid={invalid && basisPoints(row.percent) === null}
                    />
                  </label>
                  <div className="flex items-end">
                    <Button
                      className="max-w-full whitespace-normal"
                      variant="secondary"
                      icon={Trash2}
                      isDisabled={rows.length <= 1}
                      onPress={() => { setRows((old) => old.filter((r) => r.id !== row.id)); setPreviewData(null); setInvalid(false); }}
                      data-testid={`plan-remove-${index}`}
                    >
                      {t('pricing:previewRemove')}
                    </Button>
                  </div>
                  {row.kind === 'instalments' && (
                    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-text">
                      {t('pricing:previewCount')}
                      <input
                        type="number" min={1} max={36} step={1}
                        value={row.count}
                        onChange={(e) => update(row.id, { count: e.target.value })}
                        data-testid={`plan-count-${index}`}
                        className="min-h-11 w-full min-w-0 rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      />
                    </label>
                  )}
                  {row.kind === 'construction_linked' && (
                    <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-text">
                      {t('pricing:previewMilestone')}
                      <input
                        type="text"
                        value={row.milestoneKey}
                        onChange={(e) => update(row.id, { milestoneKey: e.target.value })}
                        data-testid={`plan-milestone-${index}`}
                        className="min-h-11 w-full min-w-0 rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      />
                    </label>
                  )}
                </div>
              ))}
            </fieldset>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                className="max-w-full whitespace-normal" variant="secondary" icon={Plus}
                onPress={() => {
                  setRows((old) => [...old, { id: nextRowId, kind: 'balloon', percent: '0', count: '1', milestoneKey: '' }]);
                  setNextRowId((old) => old + 1); setPreviewData(null); setInvalid(false);
                }}
                isDisabled={rows.length >= 24 || compute.isPending}
                data-testid="plan-add-row"
              >
                {t('pricing:previewAdd')}
              </Button>
              <Button className="max-w-full whitespace-normal" variant="primary" icon={Calculator} onPress={() => void onPreview()} isPending={compute.isPending} isDisabled={!unitId || compute.isPending} data-testid="plan-preview-submit">
                {t('pricing:previewCompute')}
              </Button>
            </div>
            {invalid && <p role="alert" className="text-sm text-error" data-testid="plan-input-error">{t('pricing:previewShareError')}</p>}
            {compute.isError && <ErrorState error={compute.error} title={t('pricing:previewFailed')} />}
            <p className="text-sm text-muted">{t('pricing:previewHelp')}</p>
          </section>

          <section className="space-y-4 rounded-card border border-border bg-panel p-4" aria-labelledby="plan-preview-result" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="plan-preview-result" className="font-semibold text-text">{t('pricing:previewResult')}</h2>
              <Badge tone="warning">{t('pricing:baselineOnly')}</Badge>
            </div>
            {!previewData ? <EmptyState title={t('pricing:previewSelect')} /> : (
              <>
                <p className="text-sm text-muted" data-testid="plan-not-approved">{t('pricing:previewStatus')}</p>
                <dl className="grid gap-3 @md:grid-cols-3">
                  {([
                    [t('pricing:previewTotalPrice'), fmt.moneyExact(previewData.totalPrice)],
                    [t('pricing:previewAllocations'), fmt.moneyExact(previewData.totalAllocated)],
                    [t('pricing:previewDifference'), fmt.moneyExact(previewData.difference)],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-control bg-sunken p-3">
                      <dt className="text-sm text-muted">{label}</dt>
                      <dd className="font-semibold text-text"><bdi dir="ltr" className="[overflow-wrap:anywhere]">{wrappable(value)}</bdi></dd>
                    </div>
                  ))}
                </dl>
                <h3 className="font-semibold text-text">{t('pricing:previewRows')}</h3>
                <ul className="divide-y divide-border" data-testid="plan-preview-lines">
                  {previewData.lines.map((line) => (
                    <li key={line.rowKey} className="flex min-w-0 flex-wrap items-start justify-between gap-2 py-3">
                      <span className="min-w-0 break-words text-sm text-text">
                        {kindLabels[line.kind]}
                        {line.instalmentNumber ? ` — ${t('pricing:previewNumber', { number: line.instalmentNumber, count: line.instalmentCount })}` : ''}
                        {line.milestoneKey ? ` — ${t('pricing:previewMilestoneLabel', { key: line.milestoneKey })}` : ''}
                      </span>
                      <strong className="text-sm text-text"><bdi dir="ltr" className="[overflow-wrap:anywhere]">{wrappable(fmt.moneyExact(line.amount))}</bdi></strong>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
