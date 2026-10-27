import type { ConfigPayload, ConfigVersion, RateCard, RateCardLine } from '@repo/contracts';
import { ErrorState, PageHeader, Panel, Skeleton, useQueryParam, useT } from '@repo/ui';
import { componentLabel } from '../../components/PricingBuilder';
import { ConfigVersions, DraftEditor, InForce, NewVersionButton, useConfig } from '../../components/config';
import { CountInput, MoneyInput } from '../../components/inputs';
import { useHqFormat } from '../../lib/format';
import { editionName } from '../../lib/labels';

type RatePayload = Extract<ConfigPayload, { kind: 'rate_card' }>;

/**
 * HQ-010 Rate cards (Gate B remaining scope: rate-card management). The list prices every new
 * contract starts from, as versions with effective dates: a new version applies to contracts and
 * quotes from its date; signed contracts keep their prices until amended. Floors are the lowest
 * price allowed without commercial approval.
 */
export default function RateCardsPage() {
  const { t } = useT();
  const config = useConfig('rate_card');
  const [draftId, setDraftId] = useQueryParam('draft');
  if (config.isPending) return <Skeleton className="h-[32rem] rounded-card" />;
  if (config.isError) return <ErrorState error={config.error} onRetry={() => void config.refetch()} />;
  const o = config.data;
  const draft = o.versions.find((v) => v.id === draftId && (v.state === 'draft' || v.state === 'returned'));
  return (
    <div className="@container space-y-6" data-testid="rate-cards-page">
      <PageHeader
        title={t('platform:pages.rateCards')}
        description={t('platform:rateCards.intro')}
        actions={o.canManage && !draft ? <NewVersionButton kind="rate_card" onCreated={(id) => setDraftId(id, { replace: false })} /> : undefined}
      />
      <InForce version={o.current} />
      {draft ? (
        <DraftEditor version={draft as ConfigVersion & { payload: RatePayload }} onClose={() => setDraftId(null)}>
          {(payload, set) => <Lines card={payload.rateCard} onChange={(rateCard) => set({ kind: 'rate_card', rateCard })} />}
        </DraftEditor>
      ) : (
        <Panel title={t('platform:rateCards.lines')} description={t('platform:rateCards.linesHint')}>
          <Lines card={(o.current.payload as RatePayload).rateCard} />
        </Panel>
      )}
      <ConfigVersions overview={o} onEdit={(id) => setDraftId(id, { replace: false })} />
    </div>
  );
}

/** The lines as a table; with `onChange`, prices, tiers, floors and trial length are editable. */
function Lines({ card, onChange }: { card: RateCard; onChange?: (card: RateCard) => void }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const update = (id: string, patch: Partial<RateCardLine>) => onChange?.({ ...card, lines: card.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  return (
    <div className="overflow-x-auto" role="region" aria-label={t('platform:rateCards.lines')} tabIndex={0}>
      <table className="w-full min-w-[46rem] text-sm" data-testid={onChange ? 'rate-card-editor' : 'rate-card-lines'}>
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:rateCards.line')}</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:rateCards.editions')}</th>
            <th scope="col" className="py-2 pe-3 text-start font-medium">{t('platform:rateCards.price')}</th>
            <th scope="col" className="py-2 text-start font-medium">{t('platform:rateCards.floor')}</th>
          </tr>
        </thead>
        <tbody>
          {card.lines.map((l) => {
            const name = componentLabel(t, { type: l.type, ...(l.module ? { module: l.module } : {}), ...(l.dimension ? { dimension: l.dimension } : {}) });
            return (
              <tr key={l.id} className="border-b border-border/60 last:border-0 align-top" data-testid={`rate-line-${l.id}`}>
                <th scope="row" className="py-2.5 pe-3 text-start">
                  <span className="font-medium text-text">{name}</span>
                  <span className="block text-xs font-normal text-muted">
                    <bdi dir="ltr">{l.id}</bdi> · {t(`platform:cadence.${l.cadence}`)}
                  </span>
                </th>
                <td className="py-2.5 pe-3 text-muted">{l.editions.map((e) => editionName(t, e)).join(', ')}</td>
                <td className="py-2.5 pe-3">
                  {l.type === 'TRIAL' ? (
                    onChange ? (
                      <CountInput label={t('platform:rateCards.trialDaysFor', { name })} hideLabel value={l.trialDays ?? 30} min={1} max={365} onChange={(n) => update(l.id, { trialDays: n })} testId={`rate-trial-${l.id}`} />
                    ) : (
                      t('platform:builder.trialDays', { days: l.trialDays ?? 30 })
                    )
                  ) : l.tiers ? (
                    <ul className="space-y-1.5">
                      {l.tiers.map((tier, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted">{tier.upTo === null ? t('platform:rateCards.tierRest') : t('platform:rateCards.tierUpTo', { n: tier.upTo })}</span>
                          {onChange ? (
                            <MoneyInput
                              label={t('platform:rateCards.tierPriceFor', { name, n: i + 1 })}
                              hideLabel
                              value={tier.unitPrice.amount}
                              onChange={(amount) => update(l.id, { tiers: l.tiers!.map((x, j) => (j === i ? { ...x, unitPrice: { amount, currency: 'PKR' } } : x)) })}
                              testId={`rate-tier-${l.id}-${i}`}
                            />
                          ) : (
                            <bdi dir="ltr" className="tabular">{fmt.money(tier.unitPrice)}</bdi>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : l.unitPrice ? (
                    onChange ? (
                      <MoneyInput label={t('platform:rateCards.priceFor', { name })} hideLabel value={l.unitPrice.amount} onChange={(amount) => update(l.id, { unitPrice: { amount, currency: 'PKR' } })} testId={`rate-price-${l.id}`} />
                    ) : (
                      <span className="tabular">
                        <bdi dir="ltr">{fmt.money(l.unitPrice)}</bdi>
                        {l.allowance ? <span className="block text-xs text-muted">{t('platform:rateCards.allowance', { n: l.allowance })}</span> : null}
                      </span>
                    )
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2.5">
                  {l.floorPrice ? (
                    onChange ? (
                      <MoneyInput label={t('platform:rateCards.floorFor', { name })} hideLabel value={l.floorPrice.amount} onChange={(amount) => update(l.id, { floorPrice: { amount, currency: 'PKR' } })} testId={`rate-floor-${l.id}`} />
                    ) : (
                      <bdi dir="ltr" className="tabular">{fmt.money(l.floorPrice)}</bdi>
                    )
                  ) : (
                    <span className="text-xs text-muted">{t('platform:rateCards.policyFloor')}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
