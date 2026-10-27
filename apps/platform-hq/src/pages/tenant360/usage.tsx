import type { MeterEvidence, TenantDetail, TenantUsage, UsageSnapshot } from '@repo/contracts';
import { Badge, Button, Drawer, dynamicT, ErrorState, InlineAlert, Panel, Skeleton, useApiQuery, useQueryParams, useQueryParam, useT } from '@repo/ui';
import { FileSearch } from 'lucide-react';
import { QuoteBreakdown } from '../../components/quote';
import { useHqFormat } from '../../lib/format';
import { dimensionLabel } from '../../lib/labels';

/**
 * HQ-014 usage meters and snapshots and HQ-015 meter evidence (Gate B remaining scope), with the
 * billing calculation they feed. Counts come from the monthly snapshots (declared before go-live);
 * evidence lists flat codes and reasons only, never people. The calculation uses the same engine
 * and versions as quotes and is not an invoice (platform billing is Gate G).
 */
export function UsageTab({ tenant: d }: { tenant: TenantDetail }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const [snapshot] = useQueryParam('snapshot');
  const setParams = useQueryParams();
  const usage = useApiQuery<TenantUsage>({ method: 'GET', path: `/platform/tenants/${d.id}/usage` });
  if (usage.isError) return <ErrorState error={usage.error} onRetry={() => void usage.refetch()} />;
  if (!usage.data) return <Skeleton className="h-64 rounded-card" />;
  const u = usage.data;
  const open = (s: UsageSnapshot) => setParams({ drawer: 'meter-evidence', snapshot: s.id }, { replace: false });
  return (
    <>
      <div className="grid gap-3 @md:grid-cols-2 @4xl:grid-cols-4" data-testid="t360-meters">
        {u.meters.map((m) => (
          <div key={m.dimension} className="rounded-card border border-border/70 bg-panel p-4 shadow-card" data-testid={`meter-${m.dimension}`}>
            <p className="text-sm text-muted">{dimensionLabel(t, m.dimension)}</p>
            <p className="mt-1 text-2xl font-bold text-text tabular">{m.latest ? fmt.count(m.latest.value) : m.declared !== null ? fmt.count(m.declared) : '—'}</p>
            <p className="text-xs text-muted">
              {m.latest ? t('platform:usage.counted', { month: fmt.monthLong(m.latest.period) }) : t('platform:usage.declaredOnly')}
              {m.priced ? ` · ${t('platform:usage.priced')}` : ''}
            </p>
          </div>
        ))}
      </div>

      <Panel title={t('platform:usage.snapshots')} description={t('platform:usage.snapshotsHint')}>
        {u.snapshots.length ? (
          <div className="overflow-x-auto" role="region" aria-label={t('platform:usage.snapshots')} tabIndex={0}>
            <table className="w-full min-w-[40rem] text-sm" data-testid="t360-snapshots">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:usage.month')}</th>
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:usage.meter')}</th>
                  <th scope="col" className="py-2 pe-3 text-end font-medium">{t('platform:usage.value')}</th>
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:usage.status')}</th>
                  <th scope="col" className="py-2 text-start font-medium">{t('platform:usage.evidence')}</th>
                </tr>
              </thead>
              <tbody>
                {u.snapshots.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0" data-testid={`snapshot-${s.id}`}>
                    <th scope="row" className="py-2 pe-3 text-start font-medium whitespace-nowrap">{fmt.monthLong(s.period)}</th>
                    <td className="py-2 pe-3">{dimensionLabel(t, s.dimension)}</td>
                    <td className="py-2 pe-3 text-end tabular">
                      {fmt.count(s.value)}
                      {s.correction && <span className="block text-xs text-muted">{t('platform:usage.was', { n: fmt.count(s.correction.from) })}</span>}
                    </td>
                    <td className="py-2 pe-3">
                      <Badge tone={s.status === 'corrected' ? 'warning' : s.source === 'declared' ? 'neutral' : 'success'}>{t(`platform:usage.statuses.${s.source === 'declared' ? 'declared' : s.status}`)}</Badge>
                    </td>
                    <td className="py-2">
                      <Button variant="quiet" icon={FileSearch} onPress={() => open(s)} data-testid={`snapshot-evidence-${s.id}`} aria-label={t('platform:usage.openEvidence', { meter: dimensionLabel(t, s.dimension), month: fmt.monthLong(s.period) })}>
                        {t('platform:usage.evidence')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('platform:usage.noSnapshots')}</p>
        )}
      </Panel>

      <Panel title={t('platform:usage.billing')} description={t('platform:usage.billingHint')}>
        {u.billing ? (
          <div className="space-y-4" data-testid="t360-billing">
            <p className="text-sm text-muted">
              {t('platform:usage.period', { start: fmt.date(u.billing.period.start), end: fmt.date(u.billing.period.end) })} · {t('platform:usage.evaluatedWith', u.billing.evaluatedWith)}
            </p>
            <ul className="flex flex-wrap gap-2 text-sm" data-testid="t360-billing-quantities">
              {u.billing.quantities.map((q) => (
                <li key={q.dimension} className="rounded-pill border border-border px-3 py-1">
                  {dimensionLabel(t, q.dimension)}: <span className="font-semibold tabular">{fmt.count(q.value)}</span>
                  {q.declared !== null && q.declared !== q.value ? <span className="text-muted"> ({t('platform:usage.declaredWas', { n: fmt.count(q.declared) })})</span> : null}
                </li>
              ))}
            </ul>
            <QuoteBreakdown period={{ start: u.billing.period.start, end: u.billing.period.end, lines: [...u.billing.lines], subtotal: u.billing.net, discounts: { amount: '0.00', currency: 'PKR' }, adjustments: [], net: u.billing.net, tax: u.billing.tax, total: u.billing.total }} title={t('platform:usage.thisMonth')} testId="t360-billing-breakdown" />
            <p className="text-xs text-muted">{t('platform:usage.notInvoice')}</p>
          </div>
        ) : (
          <InlineAlert tone="info" title={t('platform:usage.noBillingTitle')}>
            {t(`platform:usage.noBilling.${d.status === 'suspended' ? 'suspended' : 'other'}`)}
          </InlineAlert>
        )}
      </Panel>

      <EvidenceDrawer snapshotId={snapshot} snapshots={u.snapshots} onClose={() => setParams({ drawer: null, snapshot: null })} />
    </>
  );
}

function EvidenceDrawer({ snapshotId, snapshots, onClose }: { snapshotId: string | null; snapshots: readonly UsageSnapshot[]; onClose: () => void }) {
  const { t } = useT();
  const tr = dynamicT(t);
  const fmt = useHqFormat();
  const snap = snapshots.find((s) => s.id === snapshotId);
  const evidence = useApiQuery<MeterEvidence>(snap ? { method: 'GET', path: `/platform/usage/snapshots/${snap.id}/evidence` } : null);
  return (
    <Drawer isOpen={!!snap} onOpenChange={(o) => !o && onClose()} title={snap ? t('platform:usage.evidenceTitle', { meter: dimensionLabel(t, snap.dimension), month: fmt.monthLong(snap.period) }) : ''} size="lg" testId="meter-evidence">
      {!evidence.data ? (
        <Skeleton className="h-64 rounded-tile" />
      ) : (
        <div className="space-y-5 p-5">
          <p className="text-sm text-text">{tr(evidence.data.definitionTextKey)}</p>
          <p className="text-xs text-muted">
            {t('platform:usage.definition')}: <bdi dir="ltr">{evidence.data.definition}</bdi> · {t('platform:usage.capturedAt', { date: fmt.date(snap!.capturedAt) })}
          </p>
          {snap?.correction && (
            <InlineAlert tone="warning" title={t('platform:usage.correctedTitle', { from: fmt.count(snap.correction.from), to: fmt.count(snap.correction.to) })}>
              {snap.correction.reason} · <bdi>{snap.correction.by}</bdi>
            </InlineAlert>
          )}
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="evidence-side-by-side">
            {evidence.data.sideBySide.map((x) => (
              <div key={x.dimension} className="rounded-tile border border-border/70 p-2">
                <dt className="text-xs text-muted">{dimensionLabel(t, x.dimension)}</dt>
                <dd className="font-semibold tabular">{fmt.count(x.value)}</dd>
              </div>
            ))}
          </dl>
          <section aria-labelledby="ev-excluded">
            <h3 id="ev-excluded" className="text-sm font-bold text-text">
              {t('platform:usage.excludedTitle', { count: evidence.data.excluded.length })}
            </h3>
            {evidence.data.excluded.length ? (
              <ul className="mt-2 space-y-1 text-sm" data-testid="evidence-excluded">
                {evidence.data.excluded.map((x) => (
                  <li key={x.code}>
                    <bdi dir="ltr" className="font-mono">{x.code}</bdi> · {x.site} · {tr(x.reasonKey)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">{t('platform:usage.noneExcluded')}</p>
            )}
          </section>
          <section aria-labelledby="ev-counted">
            <h3 id="ev-counted" className="text-sm font-bold text-text">
              {t('platform:usage.countedTitle', { count: evidence.data.counted.length })}
            </h3>
            {evidence.data.counted.length ? (
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4" data-testid="evidence-counted">
                {evidence.data.counted.map((x) => (
                  <li key={x.code}>
                    <bdi dir="ltr" className="font-mono">{x.code}</bdi>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">{t('platform:usage.declaredNoList')}</p>
            )}
          </section>
          <p className="text-xs text-muted">{t('platform:usage.noPersonalData')}</p>
        </div>
      )}
    </Drawer>
  );
}
