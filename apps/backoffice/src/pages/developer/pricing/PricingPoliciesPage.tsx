import { PricingRelatedLinks } from './PricingRelatedLinks';
import { useSavedFocus } from './saved-focus';
import { ApiError, type PricingPolicyDraft, type PricingPolicyDraftList, type PricingPolicyRule } from '@repo/contracts';
import { Badge, Button, EmptyState, ErrorState, PageHeader, SkeletonBlock, useApiMutation, useApiQuery, useCreateKey, useT } from '@repo/ui';
import { FileClock, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { canHydrateDraft, expectedDraftVersion, pinDraftVersion, type CommittedDraftFloor } from './revision-sync';

type UnitKind = PricingPolicyRule['unitType'];
type DraftRule = { id: number; unitType: UnitKind; amount: string; floor: string; corner: string; park: string };
const UNITS: readonly UnitKind[] = ['residential', 'commercial', 'mixed'];
const newRules = (): DraftRule[] => [{ id: 1, unitType: 'residential', amount: '0.00', floor: '0', corner: '0', park: '0' }];
const ruleFrom = (rule: PricingPolicyRule, id: number): DraftRule => ({
  id, unitType: rule.unitType, amount: rule.baseRate.amount, floor: String(rule.floorRiseBps),
  corner: String(rule.cornerPremiumBps), park: String(rule.parkFacingPremiumBps),
});
const validAmount = (value: string) => /^(0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value);
function validatedRules(draft: readonly DraftRule[]): PricingPolicyRule[] | null {
  if (!draft.length || draft.length > 3 || new Set(draft.map((r) => r.unitType)).size !== draft.length) return null;
  const rules: PricingPolicyRule[] = [];
  for (const rule of draft) {
    if (!validAmount(rule.amount)) return null;
    const [rupees, fraction = ''] = rule.amount.split('.');
    const precisePaisa = BigInt(rupees!) * 100n + BigInt(fraction.padEnd(2, '0') || '00');
    if (precisePaisa > 10_000_000_000_000n) return null;
    const ints = [rule.floor, rule.corner, rule.park];
    if (ints.some((x) => !/^\d{1,5}$/.test(x) || Number(x) > 10000)) return null;
    rules.push({
      unitType: rule.unitType,
      baseRate: { amount: rule.amount, currency: 'PKR' },
      floorRiseBps: Number(rule.floor), cornerPremiumBps: Number(rule.corner), parkFacingPremiumBps: Number(rule.park),
    });
  }
  return rules;
}

export default function PricingPoliciesPage() {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [rules, setRules] = useState<DraftRule[]>(newRules);
  const [nextRuleId, setNextRuleId] = useState(2);
  const [validation, setValidation] = useState(false);
  const [success, setSuccess] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [committedFloor, setCommittedFloor] = useState<CommittedDraftFloor | null>(null);
  const [createKey, renewCreate] = useCreateKey('pricing-policy');
  const [revisionKey, renewRevision] = useCreateKey('pricing-revision');

  const projects = useApiQuery<{ items: Array<{ id: string; name: string }>; total: number }>({ method: 'GET', path: '/pricing/template-projects' });
  const list = useApiQuery<PricingPolicyDraftList>({ method: 'GET', path: '/pricing/policies', query: { q } });
  const detail = useApiQuery<PricingPolicyDraft>(
    selectedId ? { method: 'GET', path: `/pricing/policies/${encodeURIComponent(selectedId)}` } : null,
  );
  const mutation = useApiMutation<PricingPolicyDraft>();
  const savedFocus = useSavedFocus();

  useEffect(() => {
    if (!canHydrateDraft(selectedId, detail.data, dirty, committedFloor)) return;
    setCommittedFloor((previous) => pinDraftVersion(previous, detail.data!));
    const version = detail.data.versions.at(-1);
    if (!version) return;
    setProjectId(detail.data.projectId);
    setTitle(version.title);
    setRules(version.rules.map((row, index) => ruleFrom(row, index + 1)));
    setNextRuleId(version.rules.length + 1);
    setValidation(false);
  }, [detail.data, selectedId, dirty, committedFloor]);

  const edit = () => {
    setValidation(false);
    setSuccess(false); setDirty(true);
    if (selectedId) renewRevision();
    else renewCreate();
  };
  const clear = () => {
    setSelectedId(null); setCommittedFloor(null); setProjectId(''); setTitle(''); setRules(newRules()); setNextRuleId(2); setDirty(false);
    renewCreate(); renewRevision(); setValidation(false); setSuccess(false);
  };
  const updateRule = (id: number, patch: Partial<DraftRule>) => {
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
    edit();
  };

  const save = async () => {
    // Nothing changed since the acknowledged save: a repeat press sends nothing (it would only duplicate the
    // draft under a fresh key). Save stays enabled, so keyboard focus is never dropped from it.
    if (mutation.isPending || success || (selectedId && expectedDraftVersion(selectedId, committedFloor) === undefined)) return;
    const normalizedTitle = title.trim().replace(/\s+/g, ' ');
    const normalizedRules = validatedRules(rules);
    if (!projectId || !projects.data?.items.some((p) => p.id === projectId) ||
      normalizedTitle.length < 3 || normalizedTitle.length > 100 || !normalizedRules) {
      setValidation(true); setSuccess(false); return;
    }
    setValidation(false);
    const key = selectedId ? revisionKey : createKey;
    const path = selectedId ? `/pricing/policies/${encodeURIComponent(selectedId)}/versions` : '/pricing/policies';
    const body = selectedId
      ? { expectedVersion: expectedDraftVersion(selectedId, committedFloor), title: normalizedTitle, rules: normalizedRules, idempotencyKey: key }
      : { projectId, title: normalizedTitle, rules: normalizedRules, idempotencyKey: key };
    try {
      const result = await mutation.mutateAsync({ method: 'POST', path, body, idempotencyKey: key });
      setCommittedFloor({ id: result.id, version: result.currentVersion }); setSelectedId(result.id); setDirty(false);
      renewCreate(); renewRevision(); setSuccess(true);
      // The POST already succeeded. Refetches are optional visibility updates and
      // must never flip the mutation result to "failed" or invite a duplicate POST.
      // A create has no previously selected detail query to refetch.
      void list.refetch();
      if (selectedId) void detail.refetch();
    } catch (e) {
      setSuccess(false);
      // 409: the draft changed elsewhere (or its key was used). The cached copy is stale and a failed write
      // invalidates nothing, so fetch the latest now: reopening the draft then shows the version that won.
      if (e instanceof ApiError && e.problem.status === 409) { void list.refetch(); if (selectedId) void detail.refetch(); }
    }
  };

  const typeLabels: Record<UnitKind, string> = {
    residential: t('pricing:policyResidential'), commercial: t('pricing:policyCommercial'), mixed: t('pricing:policyMixed'),
  };
  const bound = (id: number, key: keyof Pick<DraftRule, 'amount' | 'floor' | 'corner' | 'park'>, label: string, mode: 'decimal' | 'numeric') => (
    <label key={key} className="flex min-w-0 flex-col gap-1 text-sm text-text">
      {label}
      <input type="text" inputMode={mode} value={rules.find((row) => row.id === id)?.[key] ?? ''}
        onChange={(event) => updateRule(id, { [key]: event.target.value })}
        className="min-h-11 w-full min-w-0 rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
    </label>
  );

  return (
    <div className="space-y-6 @container" data-testid="pricing-policies-page">
      <PageHeader title={t('pricing:policyTitle')} description={t('pricing:policyIntro')} />
      <PricingRelatedLinks current="policies" />
      <p className="rounded-control border border-border bg-sunken p-3 text-sm text-muted" data-testid="pricing-draft-warning">
        {t('pricing:policyWarning')}
      </p>
      <div className="grid gap-5 @3xl:grid-cols-[minmax(15rem,1fr)_minmax(0,1.6fr)]">
        <section className="min-w-0 space-y-4 rounded-card border border-border bg-panel p-4" aria-labelledby="pricing-policy-list-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="pricing-policy-list-heading" className="font-semibold text-text">{t('pricing:policyList')}</h2>
            <Button icon={Plus} variant="secondary" isDisabled={mutation.isPending} onPress={clear}>
              {t('pricing:policyStart')}
            </Button>
          </div>
          <label className="flex flex-col gap-1 text-sm text-text">{t('pricing:policySearch')}
            <input type="search" value={q} onChange={(event) => setQ(event.target.value)}
              className="min-h-11 w-full rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
          </label>
          {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} />
            : !list.data ? <SkeletonBlock lines={4} />
              : list.data.items.length === 0 ? <EmptyState title={t('pricing:policyEmpty')} />
                : <ul className="space-y-2" data-testid="pricing-policy-list">
                  {list.data.items.map((policy) => <li key={policy.id}>
                    <button type="button" disabled={mutation.isPending}
                      onClick={() => { setCommittedFloor(null); setSelectedId(policy.id); setSuccess(false); setDirty(false); renewRevision(); }}
                      aria-current={selectedId === policy.id ? 'true' : undefined}
                      className="min-h-11 w-full rounded-control border border-border p-3 text-start text-text hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                      <span className="block break-words font-semibold">{policy.title}</span>
                      <span className="text-sm text-muted">{t('pricing:policyVersion', { version: policy.currentVersion })}</span>
                    </button>
                  </li>)}
                </ul>}
        </section>
        <section className="min-w-0 space-y-4 rounded-card border border-border bg-panel p-4" aria-labelledby="pricing-policy-editor-heading">
          <h2 id="pricing-policy-editor-heading" className="font-semibold text-text">
            {selectedId ? t('pricing:policyEdit') : t('pricing:policyNew')}
          </h2>
          {projects.isError && <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />}
          {!projects.data && !projects.isError && <SkeletonBlock lines={2} />}
          {projects.data?.items.length === 0 && <EmptyState title={t('pricing:policyNoProjects')} />}
          {selectedId && detail.isError ? <ErrorState error={detail.error} onRetry={() => void detail.refetch()} /> :
            <fieldset className="space-y-4" disabled={mutation.isPending || !projects.data || (!!selectedId && !detail.data)}>
              <label className="flex flex-col gap-1 text-sm text-text">{t('pricing:policyProject')}
                <select value={projectId} disabled={!!selectedId} onChange={(event) => { setProjectId(event.target.value); edit(); }}
                  className="min-h-11 w-full rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  <option value="">{t('pricing:templateProjectPlaceholder')}</option>
                  {projects.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-text">{t('pricing:policyName')}
                <input type="text" maxLength={100} value={title} onChange={(event) => { setTitle(event.target.value); edit(); }}
                  className="min-h-11 w-full rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
              </label>
              {rules.map((rule) =>
                <div key={rule.id} className="space-y-3 rounded-control border border-border bg-sunken p-3" data-testid="pricing-policy-rule">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <label className="flex min-w-0 flex-col gap-1 text-sm text-text">{t('pricing:policyUnitType')}
                      <select value={rule.unitType} onChange={(event) => updateRule(rule.id, { unitType: event.target.value as UnitKind })}
                        className="min-h-11 rounded-control border border-border-control bg-panel px-3 text-text">
                        {UNITS.map((kind) => <option key={kind} value={kind}>{typeLabels[kind]}</option>)}
                      </select>
                    </label>
                    <Button icon={Trash2} variant="secondary" isDisabled={rules.length === 1}
                      onPress={() => { setRules((old) => old.filter((r) => r.id !== rule.id)); edit(); }}>
                      {t('pricing:policyRemoveRule')}
                    </Button>
                  </div>
                  <div className="grid gap-3 @lg:grid-cols-2">
                    {bound(rule.id, 'amount', t('pricing:policyRate'), 'decimal')}
                    {bound(rule.id, 'floor', t('pricing:policyFloor'), 'numeric')}
                    {bound(rule.id, 'corner', t('pricing:policyCorner'), 'numeric')}
                    {bound(rule.id, 'park', t('pricing:policyPark'), 'numeric')}
                  </div>
                </div>,
              )}
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" icon={Plus} isDisabled={rules.length >= 3} onPress={() => {
                  const unused = UNITS.find((k) => !rules.some((r) => r.unitType === k));
                  if (unused) { setRules((old) => [...old, { id: nextRuleId, unitType: unused, amount: '0.00', floor: '0', corner: '0', park: '0' }]); setNextRuleId((n) => n + 1); edit(); }
                }}>{t('pricing:policyAddRule')}</Button>
                <Button variant="primary" icon={Save} isPending={mutation.isPending} onPress={() => void save()} data-testid="pricing-policy-save">
                  {selectedId ? t('pricing:policyRevise') : t('pricing:policySave')}
                </Button>
              </div>
              {validation && <p role="alert" className="text-sm text-error">{t('pricing:policyValidation')}</p>}
              {mutation.isError && <ErrorState error={mutation.error} title={t('pricing:policyError')} />}
            </fieldset>}
          {/* Outside the read states: a refresh failing after the POST succeeded must not hide that it was saved. */}
          {success && <p role="status" ref={savedFocus} tabIndex={-1} className="text-sm text-success focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{t('pricing:policySaved')}</p>}
          {selectedId && detail.data?.id === selectedId &&
            <section className="space-y-3" aria-labelledby="pricing-versions-heading">
              <h3 id="pricing-versions-heading" className="flex items-center gap-2 font-semibold text-text">
                <FileClock aria-hidden className="size-4" /> {t('pricing:policyHistory')}
              </h3>
              <Badge tone="warning">{t('pricing:policyWarning')}</Badge>
              <ol className="space-y-2" data-testid="pricing-policy-versions">
                {detail.data.versions.map((v) =>
                  <li key={v.version} className="rounded-control border border-border p-3 text-sm text-text">
                    <strong>{t('pricing:policyVersion', { version: v.version })}</strong>
                    <p className="break-words">{v.title}</p>
                    <p className="text-muted">{v.rules.length} {t('pricing:policyUnitType')}</p>
                  </li>)}
              </ol>
            </section>}
        </section>
      </div>
    </div>
  );
}
