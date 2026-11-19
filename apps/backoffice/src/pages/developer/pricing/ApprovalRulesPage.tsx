import { ApiError, type PricingApprovalDraft, type PricingApprovalDraftList, type PricingApprovalRule, type PricingApprovalSubject } from '@repo/contracts';
import { useSavedFocus } from './saved-focus';
import { FitSelect } from './FitSelect';
import { isNotFound, useRecordAddress } from './record-address';
import { Badge, Button, EmptyState, ErrorState, NotFoundState, PageHeader, SkeletonBlock, useApiMutation, useApiQuery, useCreateKey, useT } from '@repo/ui';
import { FileClock, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { canHydrateDraft, expectedDraftVersion, pinDraftVersion, type CommittedDraftFloor } from './revision-sync';
import { PricingRelatedLinks } from './PricingRelatedLinks';

type RuleDraft = { id: number; subject: PricingApprovalSubject; amount: string; reviewers: string };
const SUBJECTS: readonly PricingApprovalSubject[] = ['unit_price_change', 'discount_exception', 'fee_exception', 'payment_plan_exception'];
const initial = (): RuleDraft[] => [{ id: 1, subject: 'unit_price_change', amount: '0.00', reviewers: '2' }];
const fromRules = (rules: PricingApprovalRule[]): RuleDraft[] => rules.map((rule, i) => ({
  id: i + 1, subject: rule.subject, amount: rule.threshold.amount, reviewers: String(rule.requiredReviewers),
}));
function parse(rules: readonly RuleDraft[]): PricingApprovalRule[] | null {
  if (!rules.length || rules.length > 4 || new Set(rules.map((r) => r.subject)).size !== rules.length) return null;
  const result: PricingApprovalRule[] = [];
  for (const row of rules) {
    if (!/^(0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(row.amount) || !/^[123]$/.test(row.reviewers)) return null;
    const [major, minor = ''] = row.amount.split('.');
    if (BigInt(major!) * 100n + BigInt(minor.padEnd(2, '0') || '00') > 10_000_000_000_000n) return null;
    result.push({
      subject: row.subject,
      threshold: { amount: row.amount, currency: 'PKR' },
      requiredReviewers: Number(row.reviewers) as 1 | 2 | 3,
      makerCheckerRequired: true, allowSelfApproval: false,
    });
  }
  return result;
}

export default function ApprovalRulesPage() {
  const { t } = useT();
  const [search, setSearch] = useState('');
  // The open draft lives in the address (`?record=`): a deep link opens it, Back and Forward move between drafts.
  const [selectedId, openRecord] = useRecordAddress('record', (id) => reopen(id));
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<RuleDraft[]>(initial);
  const [sequence, setSequence] = useState(2);
  const [invalid, setInvalid] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [committedFloor, setCommittedFloor] = useState<CommittedDraftFloor | null>(null);
  const [createKey, renewCreate] = useCreateKey('pricing-approval-create');
  const [revisionKey, renewRevision] = useCreateKey('pricing-approval-revision');
  const projects = useApiQuery<{ items: Array<{ id: string; name: string }>; total: number }>({
    method: 'GET', path: '/pricing/template-projects',
  });
  const list = useApiQuery<PricingApprovalDraftList>({
    method: 'GET', path: '/pricing/approval-rules', query: { q: search },
  });
  const detail = useApiQuery<PricingApprovalDraft>(selectedId
    ? { method: 'GET', path: `/pricing/approval-rules/${encodeURIComponent(selectedId)}` } : null);
  const mutation = useApiMutation<PricingApprovalDraft>();
  const savedFocus = useSavedFocus();

  useEffect(() => {
    if (!canHydrateDraft(selectedId, detail.data, dirty, committedFloor)) return;
    setCommittedFloor((previous) => pinDraftVersion(previous, detail.data!));
    const current = detail.data.versions.at(-1);
    if (!current) return;
    setProjectId(detail.data.projectId);
    setTitle(current.title);
    setRows(fromRules(current.rules));
    setSequence(current.rules.length + 1);
    setInvalid(false);
  }, [selectedId, detail.data, dirty, committedFloor]);

  const changed = () => {
    setSaved(false); setInvalid(false); setDirty(true);
    if (selectedId) renewRevision(); else renewCreate();
  };
  const blank = () => {
    setCommittedFloor(null); setProjectId(''); setTitle(''); setRows(initial()); setSequence(2);
    setInvalid(false); setSaved(false); setDirty(false); renewCreate(); renewRevision();
  };
  const makeNew = () => { void openRecord(null); blank(); };
  // Back, Forward or a link changed the draft in the address: show that draft as stored (or a blank form).
  const reopen = (id: string | null) => {
    if (!id) { blank(); return; }
    setCommittedFloor(null); setSaved(false); setInvalid(false); setDirty(false); mutation.reset(); renewRevision();
  };
  const update = (id: number, patch: Partial<RuleDraft>) => {
    setRows((old) => old.map((r) => r.id === id ? { ...r, ...patch } : r));
    changed();
  };
  const save = async () => {
    // Nothing changed since the acknowledged save: a repeat press sends nothing (it would only duplicate the
    // draft under a fresh key). Save stays enabled, so keyboard focus is never dropped from it.
    if (mutation.isPending || saved || (selectedId && expectedDraftVersion(selectedId, committedFloor) === undefined)) return;
    const rules = parse(rows), trimmed = title.trim().replace(/\s+/g, ' ');
    if (!rules || trimmed.length < 3 || trimmed.length > 100 ||
      !projects.data?.items.some((p) => p.id === projectId)) { setInvalid(true); return; }
    setInvalid(false);
    const k = selectedId ? revisionKey : createKey;
    const path = selectedId
      ? `/pricing/approval-rules/${encodeURIComponent(selectedId)}/versions`
      : '/pricing/approval-rules';
    const body = selectedId
      ? { title: trimmed, rules, expectedVersion: expectedDraftVersion(selectedId, committedFloor), idempotencyKey: k }
      : { projectId, title: trimmed, rules, idempotencyKey: k };
    try {
      const response = await mutation.mutateAsync({ method: 'POST', path, body, idempotencyKey: k });
      setCommittedFloor({ id: response.id, version: response.currentVersion });
      // A new draft takes its place in the address (replacing the blank form's entry).
      if (response.id !== selectedId) void openRecord(response.id, { replace: true });
      renewCreate(); renewRevision();
      setSaved(true); setDirty(false);
      // The draft POST succeeded; cache refresh cannot turn that into a failed save.
      // useApiMutation also invalidates all API queries after success.
      void list.refetch();
      if (selectedId) void detail.refetch();
    } catch (e) {
      setSaved(false);
      // 409: the draft changed elsewhere (or its key was used). The cached copy is stale and a failed write
      // invalidates nothing, so fetch the latest now: reopening the draft then shows the version that won.
      if (e instanceof ApiError && e.problem.status === 409) { void list.refetch(); if (selectedId) void detail.refetch(); }
    }
  };
  const subjectLabels: Record<PricingApprovalSubject, string> = {
    unit_price_change: t('pricing:approvalPrice'),
    discount_exception: t('pricing:approvalDiscount'),
    fee_exception: t('pricing:approvalFee'),
    payment_plan_exception: t('pricing:approvalPlan'),
  };
  return (
    <div className="space-y-6 @container" data-testid="pricing-approval-rules-page">
      <PageHeader title={t('pricing:approvalTitle')} description={t('pricing:approvalIntro')} />
      <PricingRelatedLinks current="approvals" />
      <p className="rounded-control border border-border bg-sunken p-3 text-sm text-muted" data-testid="approval-draft-warning">
        {t('pricing:approvalWarning')}
      </p>
      <div className="grid gap-5 @3xl:grid-cols-[minmax(15rem,1fr)_minmax(0,1.6fr)]">
        <section className="min-w-0 space-y-4 rounded-card border border-border bg-panel p-4" aria-labelledby="approval-draft-list-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="approval-draft-list-title" className="font-semibold text-text">{t('pricing:approvalMy')}</h2>
            <Button className="max-w-full whitespace-normal" variant="secondary" icon={Plus} isDisabled={mutation.isPending} onPress={makeNew}>
              {t('pricing:approvalStart')}
            </Button>
          </div>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-text">{t('pricing:approvalSearch')}
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              className="min-h-11 w-full min-w-0 rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
          </label>
          {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> :
            !list.data ? <SkeletonBlock lines={4} /> :
            list.data.items.length === 0 ? <EmptyState title={t('pricing:approvalEmpty')} /> :
            <ul className="space-y-2" data-testid="approval-draft-list">
              {list.data.items.map((item) => (
                <li key={item.id}>
                  <button type="button" disabled={mutation.isPending}
                    aria-current={selectedId === item.id ? 'true' : undefined}
                    onClick={() => { setCommittedFloor(null); void openRecord(item.id); setSaved(false); setDirty(false); renewRevision(); }}
                    className="min-h-11 w-full min-w-0 rounded-control border border-border p-3 text-start text-text hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                    <span className="block break-words font-semibold">{item.title}</span>
                    <span className="text-sm text-muted">{t('pricing:approvalVersion', { version: item.currentVersion })}</span>
                  </button>
                </li>
              ))}
            </ul>}
        </section>
        <div className="min-w-0 space-y-5">
          <section className="space-y-4 rounded-card border border-border bg-panel p-4" aria-labelledby="approval-editor-title">
            <h2 id="approval-editor-title" className="font-semibold text-text">
              {/* Wave 2 integration (W2-D3a): a draft link that is not found never reads "Revise draft". */ selectedId ? (detail.isError && isNotFound(detail.error) ? t('pricing:draftUnavailable') : t('pricing:approvalEdit')) : t('pricing:approvalNew')}
            </h2>
            {projects.isError && <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />}
            {!projects.data && !projects.isError && <SkeletonBlock lines={2} />}
            {projects.data?.items.length === 0 && <EmptyState title={t('pricing:approvalNoProject')} />}
            {selectedId && detail.isError ? (isNotFound(detail.error) ? <NotFoundState /> : <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />) :
              <fieldset disabled={mutation.isPending || !projects.data || (!!selectedId && detail.data?.id !== selectedId)} className="min-w-0 space-y-4">
                <label className="flex min-w-0 flex-col gap-1 text-sm text-text">
                  {t('pricing:approvalProject')}
                  <FitSelect value={projectId} disabled={!!selectedId} onChange={(e) => { setProjectId(e.target.value); changed(); }}>
                    <option value="">{t('pricing:templateProjectPlaceholder')}</option>
                    {projects.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </FitSelect>
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-sm text-text">
                  {t('pricing:approvalName')}
                  <input type="text" maxLength={100} value={title} onChange={(e) => { setTitle(e.target.value); changed(); }}
                    className="min-h-11 w-full min-w-0 rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
                </label>
                {rows.map((rule) => (
                  <div key={rule.id} className="space-y-3 rounded-control border border-border bg-sunken p-3" data-testid="approval-rule-row">
                    <label className="flex min-w-0 flex-col gap-1 text-sm text-text">
                      {t('pricing:approvalSubject')}
                      <FitSelect value={rule.subject} onChange={(e) => update(rule.id, { subject: e.target.value as PricingApprovalSubject })}>
                        {SUBJECTS.map((subject) => <option key={subject} value={subject}>{subjectLabels[subject]}</option>)}
                      </FitSelect>
                    </label>
                    <div className="grid gap-3 @lg:grid-cols-2">
                      <label className="flex min-w-0 flex-col gap-1 text-sm text-text">
                        {t('pricing:approvalThreshold')}
                        <input type="text" inputMode="decimal" value={rule.amount} onChange={(e) => update(rule.id, { amount: e.target.value })}
                          className="min-h-11 w-full min-w-0 rounded-control border border-border-control bg-panel px-3 text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
                      </label>
                      <label className="flex min-w-0 flex-col gap-1 text-sm text-text">
                        {t('pricing:approvalReviewers')}
                        <FitSelect value={rule.reviewers} onChange={(e) => update(rule.id, { reviewers: e.target.value })}>
                          <option value="1">1</option><option value="2">2</option><option value="3">3</option>
                        </FitSelect>
                      </label>
                    </div>
                    <Button className="max-w-full whitespace-normal" variant="secondary" icon={Trash2} isDisabled={rows.length === 1}
                      onPress={() => { setRows((old) => old.filter((r) => r.id !== rule.id)); changed(); }}>
                      {t('pricing:approvalRemove')}
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-3">
                  <Button className="max-w-full whitespace-normal" variant="secondary" icon={Plus} isDisabled={rows.length >= 4}
                    onPress={() => {
                      const next = SUBJECTS.find((subject) => !rows.some((r) => r.subject === subject));
                      if (next) { setRows((old) => [...old, { id: sequence, subject: next, amount: '0.00', reviewers: '2' }]); setSequence((s) => s + 1); changed(); }
                    }}>{t('pricing:approvalAdd')}</Button>
                  <Button className="max-w-full whitespace-normal" variant="primary" icon={Save} isPending={mutation.isPending} onPress={() => void save()} data-testid="approval-draft-save">
                    {selectedId ? t('pricing:approvalRevise') : t('pricing:approvalSave')}
                  </Button>
                </div>
                {invalid && <p role="alert" className="text-sm text-error">{t('pricing:approvalInvalid')}</p>}
                {mutation.isError && <ErrorState error={mutation.error} title={t('pricing:approvalError')} />}
              </fieldset>}
            {/* Outside the read states: a refresh failing after the POST succeeded must not hide that it was saved. */}
            {saved && <p role="status" ref={savedFocus} tabIndex={-1} className="text-sm text-success focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{t('pricing:approvalSaved')}</p>}
            <p className="text-sm text-muted">{t('pricing:approvalNoSelf')}</p>
            <p className="text-sm text-muted">{t('pricing:approvalDisclaimer')}</p>
          </section>
          {selectedId && detail.data?.id === selectedId && <section className="space-y-3 rounded-card border border-border bg-panel p-4">
            <h3 className="flex items-center gap-2 font-semibold text-text">
              <FileClock aria-hidden className="size-4" />{t('pricing:approvalHistory')}
            </h3>
            <Badge tone="warning">{t('pricing:approvalWarning')}</Badge>
            <ol className="space-y-2" data-testid="approval-version-history">
              {detail.data.versions.map((v) => (
                <li key={v.version} className="rounded-control border border-border p-3 text-sm text-text">
                  <strong>{t('pricing:approvalVersion', { version: v.version })}</strong>
                  <p className="break-words">{v.title}</p>
                  <p className="text-muted">{v.rules.length} {t('pricing:approvalSubject')}</p>
                </li>
              ))}
            </ol>
          </section>}
        </div>
      </div>
    </div>
  );
}
