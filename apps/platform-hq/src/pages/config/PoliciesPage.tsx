import { COMMERCIAL_RULES, EDITIONS, type CommercialPolicyConfig, type CommercialRuleKey, type ConfigPayload, type ConfigVersion, type EditionKey, type PolicyException } from '@repo/contracts';
import { Badge, Button, dynamicT, ErrorState, PageHeader, Panel, SelectControl, Skeleton, Switch, useQueryParam, useT } from '@repo/ui';
import { Plus, Trash2 } from 'lucide-react';
import { ConfigVersions, DraftEditor, InForce, NewVersionButton, useConfig } from '../../components/config';
import { CountInput, DateInput, MoneyInput, TextInput } from '../../components/inputs';
import { useHqFormat } from '../../lib/format';
import { editionName } from '../../lib/labels';

type PolicyPayload = Extract<ConfigPayload, { kind: 'commercial_policy' }>;

/** Platform roles that may be named as approvers (support never approves). */
const ROLES = [
  { id: 'commercial_approver', key: 'platform:personas.commercialApprover' },
  { id: 'supreme_admin', key: 'platform:personas.supremeAdmin' },
] as const;

const THRESHOLDS = [
  { key: 'maxDiscountPct', unit: 'percent', max: 100 },
  { key: 'maxBelowRateCardPct', unit: 'percent', max: 100 },
  { key: 'maxOnboardingReductionPct', unit: 'percent', max: 100 },
  { key: 'maxFreeDays', unit: 'days', max: 365 },
  { key: 'maxTermMonths', unit: 'months', max: 120 },
] as const;

/**
 * Commercial approval policy (Gate B remaining scope; owner decision at checkpoint 1: thresholds
 * are illustrative and configurable, never hard-coded). The limits that send a contract to a
 * second person, who may approve, and exceptions per edition, as versions with effective dates.
 */
export default function PoliciesPage() {
  const { t } = useT();
  const config = useConfig('commercial_policy');
  const [draftId, setDraftId] = useQueryParam('draft');
  if (config.isPending) return <Skeleton className="h-[32rem] rounded-card" />;
  if (config.isError) return <ErrorState error={config.error} onRetry={() => void config.refetch()} />;
  const o = config.data;
  const draft = o.versions.find((v) => v.id === draftId && (v.state === 'draft' || v.state === 'returned'));
  return (
    <div className="@container space-y-6" data-testid="policies-page">
      <PageHeader
        title={t('platform:pages.policies')}
        description={t('platform:policies.intro')}
        actions={o.canManage && !draft ? <NewVersionButton kind="commercial_policy" onCreated={(id) => setDraftId(id, { replace: false })} /> : undefined}
      />
      <InForce version={o.current} />
      <div className="grid gap-6 xl:grid-cols-12 [&>*]:min-w-0">
        <div className="space-y-6 xl:col-span-7">
          {draft ? (
            <DraftEditor version={draft as ConfigVersion & { payload: PolicyPayload }} onClose={() => setDraftId(null)}>
              {(payload, set) => <PolicyEditor policy={payload.policy} onChange={(policy) => set({ kind: 'commercial_policy', policy })} />}
            </DraftEditor>
          ) : (
            <PolicyView policy={(o.current.payload as PolicyPayload).policy} />
          )}
        </div>
        <div className="xl:col-span-5">
          <ConfigVersions overview={o} onEdit={(id) => setDraftId(id, { replace: false })} />
        </div>
      </div>
    </div>
  );
}

function PolicyView({ policy }: { policy: CommercialPolicyConfig }) {
  const { t } = useT();
  const fmt = useHqFormat();
  const tr = dynamicT(t);
  return (
    <>
      <Panel title={t('platform:policies.thresholds')} description={t('platform:policies.thresholdsHint')}>
        <dl className="grid gap-3 @md:grid-cols-2" data-testid="policy-thresholds">
          {THRESHOLDS.map((x) => (
            <div key={x.key} className="rounded-tile border border-border/70 p-3">
              <dt className="text-sm text-muted">{tr(`platform:policies.fields.${x.key}`)}</dt>
              <dd className="mt-1 text-lg font-bold text-text tabular" data-testid={`policy-${x.key}`}>
                {tr(`platform:policies.units.${x.unit}`, { value: fmt.count(policy[x.key]) })}
              </dd>
            </div>
          ))}
          <div className="rounded-tile border border-border/70 p-3">
            <dt className="text-sm text-muted">{t('platform:policies.fields.minFirstYearValue')}</dt>
            <dd className="mt-1 text-lg font-bold text-text tabular">
              <bdi dir="ltr">{fmt.money(policy.minFirstYearValue)}</bdi>
            </dd>
          </div>
        </dl>
      </Panel>
      <Panel title={t('platform:policies.approvers')} description={t('platform:policies.approversHint')}>
        <ul className="flex flex-wrap gap-2" data-testid="policy-approvers">
          {policy.approverRoles.map((r) => (
            <li key={r}>
              <Badge tone="info">{tr(ROLES.find((x) => x.id === r)?.key ?? r)}</Badge>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={t('platform:policies.exceptions')} description={t('platform:policies.exceptionsHint')}>
        {policy.exceptions.length ? (
          <ul className="divide-y divide-border/70" data-testid="policy-exceptions">
            {policy.exceptions.map((e) => (
              <li key={e.id} className="py-2.5 text-sm">
                <p className="font-medium text-text">
                  {editionName(t, e.edition)} · {tr(`platform:policies.rules.${e.rule}`)} · {e.limit}
                </p>
                <p className="text-muted">
                  {e.reason}
                  {e.until ? ` · ${t('platform:policies.until', { date: fmt.date(e.until) })}` : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('platform:policies.noExceptions')}</p>
        )}
      </Panel>
    </>
  );
}

function PolicyEditor({ policy, onChange }: { policy: CommercialPolicyConfig; onChange: (p: CommercialPolicyConfig) => void }) {
  const { t } = useT();
  const tr = dynamicT(t);
  const set = (patch: Partial<CommercialPolicyConfig>) => onChange({ ...policy, ...patch });
  const setException = (id: string, patch: Partial<PolicyException>) => set({ exceptions: policy.exceptions.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="text-sm font-bold text-text">{t('platform:policies.thresholds')}</legend>
        <div className="grid gap-4 @2xl:grid-cols-2">
          {THRESHOLDS.map((x) => (
            <CountInput key={x.key} label={tr(`platform:policies.fields.${x.key}`)} value={policy[x.key]} min={0} max={x.max} onChange={(n) => set({ [x.key]: n } as Partial<CommercialPolicyConfig>)} testId={`policy-input-${x.key}`} />
          ))}
          <MoneyInput label={t('platform:policies.fields.minFirstYearValue')} value={policy.minFirstYearValue.amount} onChange={(amount) => set({ minFirstYearValue: { amount, currency: 'PKR' } })} testId="policy-input-minFirstYearValue" />
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-sm font-bold text-text">{t('platform:policies.approvers')}</legend>
        <p className="text-sm text-muted">{t('platform:policies.approversHint')}</p>
        {ROLES.map((r) => (
          <Switch
            key={r.id}
            isSelected={policy.approverRoles.includes(r.id)}
            onChange={(on) => set({ approverRoles: on ? [...policy.approverRoles, r.id] : policy.approverRoles.filter((x) => x !== r.id) })}
            label={tr(r.key)}
            testId={`policy-approver-${r.id}`}
          />
        ))}
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-sm font-bold text-text">{t('platform:policies.exceptions')}</legend>
        <p className="text-sm text-muted">{t('platform:policies.exceptionsHint')}</p>
        {policy.exceptions.map((e, i) => (
          <div key={e.id} className="grid gap-3 rounded-tile border border-border/70 p-3 @2xl:grid-cols-2" data-testid={`policy-exception-${i}`}>
            <SelectControl label={t('platform:policies.edition')} value={e.edition} options={EDITIONS.map((ed) => ({ id: ed, label: editionName(t, ed) }))} onChange={(v) => v && setException(e.id, { edition: v as EditionKey })} testId={`policy-exception-edition-${i}`} />
            <SelectControl label={t('platform:policies.rule')} value={e.rule} options={COMMERCIAL_RULES.map((r) => ({ id: r, label: tr(`platform:policies.rules.${r}`) }))} onChange={(v) => v && setException(e.id, { rule: v as CommercialRuleKey })} testId={`policy-exception-rule-${i}`} />
            <CountInput label={t('platform:policies.limit')} value={e.limit} min={0} onChange={(n) => setException(e.id, { limit: n })} testId={`policy-exception-limit-${i}`} />
            <DateInput label={t('platform:policies.untilLabel')} value={e.until ?? ''} optional onChange={(d) => setException(e.id, { until: d || undefined })} testId={`policy-exception-until-${i}`} />
            <TextInput className="@2xl:col-span-2" label={t('platform:policies.exceptionReason')} value={e.reason} onChange={(reason) => setException(e.id, { reason })} testId={`policy-exception-reason-${i}`} />
            <div>
              <Button variant="quiet" icon={Trash2} onPress={() => set({ exceptions: policy.exceptions.filter((x) => x.id !== e.id) })} data-testid={`policy-exception-remove-${i}`}>
                {t('platform:policies.removeException')}
              </Button>
            </div>
          </div>
        ))}
        <Button
          variant="secondary"
          icon={Plus}
          onPress={() => set({ exceptions: [...policy.exceptions, { id: `exc_${policy.exceptions.length + 1}_${Date.now().toString(36)}`, edition: 'community', rule: 'free_beyond_trial', limit: 60, reason: '' }] })}
          data-testid="policy-exception-add"
        >
          {t('platform:policies.addException')}
        </Button>
      </fieldset>
    </div>
  );
}
