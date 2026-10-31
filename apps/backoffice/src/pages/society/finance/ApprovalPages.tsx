import { APPROVAL_SUBJECTS, COMMITTEE_OFFICES, type ApprovalDetail, type ApprovalInbox, type ApprovalRow, type ApprovalRule, type ApprovalSubject, type ApproverRef, type CommitteeOffice, type Delegation, type PolicyOverview } from '@repo/contracts';
import {
  Badge,
  Breadcrumbs,
  Button,
  DateTime,
  DirectionalIcon,
  Drawer,
  dynamicT,
  EmptyState,
  ErrorState,
  InlineAlert,
  Link,
  Money,
  PageHeader,
  PlainCheckbox,
  PlainTextArea,
  PlainTextField,
  SegmentedControl,
  SelectControl,
  UrlTabs,
  useApiMutation,
  useApiQuery,
  useQueryParam,
  useQueryParams,
  useSession,
  useT,
  useToast,
} from '@repo/ui';
import { CheckCircle2, ChevronRight, ClipboardCheck, FilePlus2, Gavel, Plus, Search, Send, ShieldCheck, Trash2, UserRoundCheck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { FINANCE } from '../../../nav.config';
import { AmountInput, Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { ApprovalBadge, Fact, FactGrid, HistoryList, WRAP, WrapMoney } from './fkit';

/**
 * Approvals (APR-001…005, reference experience 3, Gate S.1). One inbox for every request the society
 * raises: the S.1 subjects decided under the approval policy in force, and the C.1/C.2 approvals that
 * keep their own maker-checker (listed, decided on their own screens). Approval 360 shows the rule
 * the policy applied, who may decide and why someone may not; the decision is the server's to check.
 */

function useSummary() {
  const { t } = useT();
  const tr = dynamicT(t);
  return (r: Pick<ApprovalRow, 'summary'>) => tr(`governance:summary.${r.summary.key}`, r.summary.values ?? {});
}

const refLabel = (t: ReturnType<typeof useT>['t'], ref: ApproverRef, roles?: Array<{ id: string; labelKey: string }>) =>
  ref.kind === 'office' ? t(`governance:office.${ref.office}`) : dynamicT(t)(roles?.find((r) => r.id === ref.roleId)?.labelKey ?? `common:roles.${ref.roleId}`);

export function ApprovalsInboxPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const summary = useSummary();
  const [q, setQ] = useState('');
  const inbox = useApiQuery<ApprovalInbox>({ method: 'GET', path: '/approvals', query: q.trim() ? { q: q.trim() } : {} }, { placeholderData: (prev) => prev });
  const rows = (list: ApprovalRow[], empty: string, testId: string) =>
    list.length === 0 ? (
      <EmptyState title={empty} />
    ) : (
      <ul className="space-y-2" data-testid={testId}>
        {list.map((r) => (
          <li key={r.id}>
            <Link href={FINANCE.approval(r.id)} variant="plain" className="grid gap-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card hover:bg-raised @3xl:grid-cols-[minmax(0,1.6fr)_auto_auto] @3xl:items-center" data-testid="approval-row" data-subject={r.subject} data-status={r.status} data-yours={r.yours}>
              <span className="min-w-0">
                <span className="block font-semibold text-text">
                  <bdi>{summary(r)}</bdi>
                </span>
                <span className="block text-xs text-muted">
                  <bdi dir="ltr" className="ltr-ref">{r.ref}</bdi> · {t(`governance:subject.${r.subject}`)} · {t('governance:inbox.askedBy', { name: r.requestedByName })} · {fmt.date(r.requestedAt)}
                  {r.status === 'pending' ? ` · ${t('governance:inbox.remaining', { count: r.remaining })}` : ''}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {r.yours && <Badge tone="info" icon={UserRoundCheck}>{t('governance:inbox.yours')}</Badge>}
                <ApprovalBadge state={r.status} />
              </span>
              <span className="flex items-center justify-end gap-3">
                {r.amount ? <Money value={r.amount} className="text-lg font-bold" /> : null}
                <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  return (
    <div className="@container space-y-6" data-testid="approvals-inbox">
      <PageHeader title={t('nav:pages.myApprovals')} description={t('governance:inbox.intro')} actions={<Link href={FINANCE.policies()}>{t('governance:inbox.policies')}</Link>} />
      <PlainTextField label={t('governance:inbox.search')} value={q} onChange={setQ} placeholder={t('governance:inbox.searchPlaceholder')} testId="approvals-search" />
      {inbox.isError ? (
        <ErrorState error={inbox.error} onRetry={() => void inbox.refetch()} />
      ) : !inbox.data ? (
        <Loading lines={6} />
      ) : (
        <UrlTabs
          label={t('nav:pages.myApprovals')}
          items={[
            { id: 'mine', label: t('governance:inbox.tabs.mine', { count: inbox.data.counts.mine }) },
            { id: 'requested', label: t('governance:inbox.tabs.requested', { count: inbox.data.counts.requested }) },
            { id: 'others', label: t('governance:inbox.tabs.others') },
            { id: 'fixed', label: t('governance:inbox.tabs.fixed', { count: inbox.data.counts.fixed }) },
          ]}
        >
          {(tab) => (
            <div className="space-y-3 pt-4">
              {tab === 'mine' && rows(inbox.data!.mine, t('governance:inbox.emptyMine'), 'approvals-mine')}
              {tab === 'requested' && rows(inbox.data!.requested, t('governance:inbox.emptyRequested'), 'approvals-requested')}
              {tab === 'others' && rows(inbox.data!.others, t('governance:inbox.emptyOthers'), 'approvals-others')}
              {tab === 'fixed' && (
                <>
                  <p className="text-sm text-muted">{t('governance:inbox.fixedIntro')}</p>
                  {inbox.data!.fixed.length === 0 ? (
                    <EmptyState title={t('governance:inbox.emptyFixed')} />
                  ) : (
                    <ul className="space-y-2" data-testid="approvals-fixed">
                      {inbox.data!.fixed.map((f) => (
                        <li key={`${f.kind}-${f.id}`}>
                          <Link href={f.href} variant="plain" className="flex items-center justify-between gap-3 rounded-tile border border-border/70 bg-panel p-4 hover:bg-raised" data-testid="approval-fixed" data-kind={f.kind}>
                            <span>
                              <span className="block font-medium text-text">{t(`billing:approvals.${f.kind}`)}</span>
                              <span className="block text-xs text-muted">
                                <bdi dir="ltr" className="ltr-ref">{f.label}</bdi>
                              </span>
                            </span>
                            {f.yours ? <Badge tone="info" icon={UserRoundCheck}>{t('governance:inbox.yours')}</Badge> : <Badge tone="neutral">{t('governance:inbox.someoneElse')}</Badge>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </UrlTabs>
      )}
    </div>
  );
}

const FACT_VALUES: Record<string, string> = { direction: 'finance:voucher.directions', category: 'finance:voucherCategory', kind: 'finance:transferKind', method: 'collections:method' };

export function ApprovalWorkspace({ approvalId }: { approvalId: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const tr = dynamicT(t);
  const summary = useSummary();
  const [drawer] = useQueryParam('drawer');
  const setParams = useQueryParams();
  const q = useApiQuery<ApprovalDetail>({ method: 'GET', path: `/approvals/${approvalId}` });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const { request: r, evaluation: ev, policy, subject, audit } = q.data;
  const factValue = (key: string, value: string) => (FACT_VALUES[key] ? tr(`${FACT_VALUES[key]}.${value}`) : key === 'amount' ? fmt.money({ amount: value, currency: 'PKR' }) : key === 'date' || key === 'effectiveFrom' ? fmt.date(value) : value);
  return (
    <div className="@container space-y-6" data-testid="approval-workspace" data-status={r.status}>
      <Breadcrumbs items={[{ label: t('nav:pages.myApprovals'), href: FINANCE.approvals() }, { label: r.ref }]} />
      <PageHeader
        title={summary(r)}
        description={t('governance:detail.intro', { ref: r.ref, subject: t(`governance:subject.${r.subject}`), name: r.requestedByName })}
        badge={<ApprovalBadge state={r.status} testId="approval-status" />}
        actions={
          ev.you.canDecide ? (
            <Button variant="primary" icon={Gavel} onPress={() => setParams({ drawer: 'decide' })} className={WRAP} data-testid="approval-decide">
              {t('governance:detail.decide')}
            </Button>
          ) : undefined
        }
      />
      {!ev.you.canDecide && ev.you.reason && r.status === 'pending' && (
        <InlineAlert tone={ev.you.reason === 'not_an_approver' || ev.you.reason === 'permission_missing' ? 'info' : 'warning'} title={t(`governance:why.${ev.you.reason}`)} data-testid="approval-why" data-reason={ev.you.reason}>
          <p>{t(`governance:whyBody.${ev.you.reason}`)}</p>
        </InlineAlert>
      )}
      <div className="grid gap-5 @5xl:grid-cols-12">
        <section className="space-y-4 rounded-card bg-panel p-5 shadow-card @5xl:col-span-7" aria-labelledby="subject-title" data-testid="approval-subject">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="subject-title" className="text-lg font-bold text-text">
              {t('governance:detail.subject')}
            </h2>
            <Link href={subject.href} className="min-w-0 [overflow-wrap:anywhere]" data-testid="approval-open-subject">
              {t('governance:detail.openSubject', { ref: subject.label })}
            </Link>
          </div>
          {r.amount && <WrapMoney value={r.amount} className="text-xl font-bold @xs:text-2xl" />}
          <FactGrid>
            {subject.facts.map((f) => (
              <Fact key={f.key} label={tr(`governance:facts.${f.key}`)}>
                <bdi>{factValue(f.key, f.value)}</bdi>
              </Fact>
            ))}
          </FactGrid>
        </section>
        <section className="space-y-4 rounded-card bg-panel p-5 shadow-card @5xl:col-span-5" aria-labelledby="policy-title" data-testid="approval-policy">
          <h2 id="policy-title" className="flex items-center gap-2 text-lg font-bold text-text">
            <ShieldCheck aria-hidden className="size-5 text-muted" />
            {t('governance:detail.policy')}
          </h2>
          <p className="text-sm text-text" data-testid="approval-rule">
            {t('governance:detail.rule', { version: r.policy.version, from: fmt.date(policy.effectiveFrom), subject: t(`governance:subject.${r.subject}`) })}
          </p>
          <RuleText rule={r.rule} />
          <div>
            <p className="text-sm font-semibold text-text">{t('governance:detail.eligible')}</p>
            {ev.eligible.length === 0 ? (
              <p className="text-sm text-muted">{r.status === 'pending' ? t('governance:detail.nobody') : t('governance:detail.decided')}</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm" data-testid="approval-eligible">
                {ev.eligible.map((e) => (
                  <li key={e.principalId} data-principal={e.principalId}>
                    <bdi className="font-medium">{e.name}</bdi> · {e.as.kind === 'delegate' ? t('governance:detail.asDelegate', { name: e.as.forName }) : e.as.kind === 'office' ? t(`governance:office.${e.as.office}`) : tr(`common:roles.${e.as.roleId}`)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-sm text-muted">{t('governance:detail.never')}</p>
        </section>
      </div>
      <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" aria-labelledby="decisions-title" data-testid="approval-decisions">
        <h2 id="decisions-title" className="text-lg font-bold text-text">
          {t('governance:detail.decisions', { given: r.decisions.filter((d) => d.decision === 'approve').length, required: r.rule.approvalsRequired })}
        </h2>
        {r.decisions.length === 0 ? (
          <p className="text-sm text-muted">{t('governance:detail.noDecisions')}</p>
        ) : (
          <ul className="space-y-2">
            {r.decisions.map((d) => (
              <li key={`${d.by}-${d.at}`} className="rounded-tile border border-border/70 p-3 text-sm" data-testid="approval-decision" data-decision={d.decision}>
                <p className="flex flex-wrap items-center gap-2 font-medium text-text">
                  {d.decision === 'approve' ? <CheckCircle2 aria-hidden className="size-4 text-success" /> : <XCircle aria-hidden className="size-4 text-error" />}
                  <bdi>{d.byName}</bdi> · {t(d.decision === 'approve' ? 'governance:detail.approved' : 'governance:detail.rejected')} · {d.as.kind === 'delegate' ? t('governance:detail.asDelegate', { name: d.as.forName }) : d.as.kind === 'office' ? t(`governance:office.${d.as.office}`) : tr(`common:roles.${d.as.roleId}`)}
                </p>
                <p className="text-muted">
                  <bdi>{t('billing:quote', { text: d.reason })}</bdi> · <DateTime value={d.at} style="dateTime" />
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" aria-labelledby="audit-title">
        <h2 id="audit-title" className="text-lg font-bold text-text">
          {t('governance:detail.audit')}
        </h2>
        <HistoryList label={t('governance:detail.audit')} testId="approval-audit" items={audit.map((a) => ({ at: a.at, byName: a.byName, label: tr(`governance:audit.${a.action}`), ...(a.note ? { note: a.note } : {}) }))} />
      </section>
      <DecideDrawer isOpen={drawer === 'decide' && ev.you.canDecide} approvalId={r.id} title={summary(r)} onClose={() => setParams({ drawer: null })} onDone={() => void q.refetch()} />
    </div>
  );
}

function RuleText({ rule }: { rule: ApprovalRule }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <p className="text-sm text-text" data-testid="rule-text">
      {rule.minAmount || rule.maxAmount
        ? `${rule.minAmount ? t('finance:approval.from', { amount: fmt.money(rule.minAmount) }) : ''}${rule.minAmount && rule.maxAmount ? ' ' : ''}${rule.maxAmount ? t('finance:approval.below', { amount: fmt.money(rule.maxAmount) }) : ''}: `
        : `${t('governance:policy.anyAmount')}: `}
      {t('governance:policy.needs', { count: rule.approvalsRequired, from: rule.approvers.map((a) => refLabel(t, a)).join(t('governance:policy.or')) })}
    </p>
  );
}

/** APR-003: approve or reject with a reason. The server decides whether this person may. */
function DecideDrawer({ isOpen, approvalId, title, onClose, onDone }: { isOpen: boolean; approvalId: string; title: string; onClose: () => void; onDone: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const decide = useApiMutation<ApprovalDetail>();
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t('governance:decide.title')}
      subtitle={<bdi>{title}</bdi>}
      testId="decide-drawer"
      footer={
        <>
          <Button variant="quiet" onPress={onClose}>{t('common:actions.cancel')}</Button>
          <Button
            variant={decision === 'reject' ? 'danger' : 'primary'}
            icon={decision === 'reject' ? XCircle : CheckCircle2}
            isPending={decide.isPending}
            isDisabled={reason.trim().length < (decision === 'reject' ? 10 : 3)}
            onPress={async () => {
              setError(null);
              try {
                await decide.mutateAsync({ method: 'POST', path: `/approvals/${approvalId}/decide`, body: { decision, reason } });
                toast.success(t(decision === 'approve' ? 'governance:decide.approvedToast' : 'governance:decide.rejectedToast'));
                onDone();
                onClose();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="decide-submit"
          >
            {t(decision === 'approve' ? 'governance:decide.approve' : 'governance:decide.reject')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SegmentedControl
          label={t('governance:decide.decision')}
          value={decision}
          onChange={(v) => setDecision(v as 'approve' | 'reject')}
          options={[
            { id: 'approve', label: t('governance:decide.approve') },
            { id: 'reject', label: t('governance:decide.reject') },
          ]}
          testId="decide-choice"
        />
        <PlainTextArea label={t(decision === 'approve' ? 'governance:decide.approveReason' : 'governance:decide.rejectReason')} value={reason} onChange={setReason} testId="decide-reason" />
        <p className="text-sm text-muted">{t('governance:decide.note')}</p>
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------------------------
// APR-004 approval policies
// ---------------------------------------------------------------------------------------------

type DraftRule = { subject: ApprovalSubject; minAmount: string; maxAmount: string; approvers: ApproverRef[]; approvalsRequired: number };

export function PoliciesPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const q = useApiQuery<PolicyOverview>({ method: 'GET', path: '/approval-policies' });
  const act = useApiMutation<PolicyOverview>();
  const [rules, setRules] = useState<DraftRule[] | null>(null);
  const [from, setFrom] = useState('2026-11-01');
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const { persona } = useSession();
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  const draft = d.versions.find((v) => v.status === 'draft');
  const mineDraft = draft && draft.createdBy === persona?.principalId;
  const editing = rules ?? (draft ? draft.rules.map((r) => ({ subject: r.subject, minAmount: r.minAmount?.amount ?? '', maxAmount: r.maxAmount?.amount ?? '', approvers: r.approvers, approvalsRequired: r.approvalsRequired })) : null);
  const run = async (method: 'POST' | 'PATCH', path: string, body: unknown, message: string) => {
    setError(null);
    try {
      await act.mutateAsync({ method, path, body });
      toast.success(message);
      setRules(null);
      void q.refetch();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <div className="@container space-y-6" data-testid="policies-page">
      <PageHeader
        title={t('nav:pages.approvalPolicies')}
        description={t('governance:policy.intro')}
        actions={
          d.actions.draft ? (
            <Button variant="primary" icon={FilePlus2} onPress={() => void run('POST', '/approval-policies', {}, t('governance:policy.drafted'))} className={WRAP} data-testid="policy-new-draft">
              {t('governance:policy.newDraft')}
            </Button>
          ) : undefined
        }
      />
      <InlineAlert tone="info" title={t('governance:policy.selfTitle')}>
        <p>{t('governance:policy.selfBody')}</p>
      </InlineAlert>
      <UrlTabs
        label={t('nav:pages.approvalPolicies')}
        items={[
          { id: 'rules', label: t('governance:policy.tabs.rules', { version: d.active.version }) },
          { id: 'versions', label: t('governance:policy.tabs.versions') },
          ...(draft ? [{ id: 'draft', label: t('governance:policy.tabs.draft', { version: draft.version }) }] : []),
          { id: 'holders', label: t('governance:policy.tabs.holders') },
        ]}
      >
        {(tab) =>
          tab === 'rules' ? (
            <section className="space-y-3 pt-4" data-testid="policy-rules">
              <p className="text-sm text-muted">{t('governance:policy.inForce', { version: d.active.version, from: fmt.date(d.active.effectiveFrom), note: d.active.note })}</p>
              {APPROVAL_SUBJECTS.map((s) => {
                const list = d.active.rules.filter((r) => r.subject === s);
                return list.length ? (
                  <div key={s} className="rounded-tile border border-border/70 bg-panel p-4" data-testid="policy-subject" data-subject={s}>
                    <p className="font-semibold text-text">{t(`governance:subject.${s}`)}</p>
                    {list.map((r) => (
                      <RuleText key={r.id} rule={r} />
                    ))}
                  </div>
                ) : null;
              })}
            </section>
          ) : tab === 'versions' ? (
            <ul className="space-y-2 pt-4" data-testid="policy-versions">
              {d.versions.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border/70 bg-panel p-4 text-sm" data-testid="policy-version" data-status={v.status}>
                  <span>
                    <span className="block font-semibold text-text">{t('governance:policy.version', { version: v.version })}</span>
                    <span className="block text-muted">
                      {t('governance:policy.versionLine', { from: fmt.date(v.effectiveFrom), name: v.createdByName })}
                      {v.effectiveTo ? ` · ${t('governance:policy.until', { date: fmt.date(v.effectiveTo) })}` : ''}
                    </span>
                    {v.note && (
                      <span className="block text-muted">
                        <bdi>{v.note}</bdi>
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={v.status === 'active' ? 'success' : v.status === 'pending' ? 'warning' : 'neutral'}>{t(`governance:policy.status.${v.status}`)}</Badge>
                    {v.approvalId && <Link href={FINANCE.approval(v.approvalId)}>{v.approvalRef}</Link>}
                  </span>
                </li>
              ))}
            </ul>
          ) : tab === 'draft' && draft && editing ? (
            <section className="space-y-4 pt-4" data-testid="policy-draft">
              {!mineDraft && <p className="text-sm text-muted">{t('governance:policy.draftOf', { name: draft.createdByName })}</p>}
              {editing.map((r, i) => (
                <div key={i} className="grid grid-cols-1 gap-3 rounded-tile border border-border/70 bg-panel p-4 @3xl:grid-cols-2" data-testid="draft-rule">
                  <SelectControl label={t('governance:policy.subject')} value={r.subject} isDisabled={!mineDraft} onChange={(k) => setRules(editing.map((x, j) => (j === i ? { ...x, subject: (k ?? x.subject) as ApprovalSubject } : x)))} options={APPROVAL_SUBJECTS.map((s) => ({ id: s, label: t(`governance:subject.${s}`) }))} />
                  <SelectControl
                    label={t('governance:policy.required')}
                    value={String(r.approvalsRequired)}
                    isDisabled={!mineDraft}
                    onChange={(k) => setRules(editing.map((x, j) => (j === i ? { ...x, approvalsRequired: Number(k ?? 1) } : x)))}
                    options={['1', '2', '3'].map((n) => ({ id: n, label: n }))}
                    testId={`draft-required-${i}`}
                  />
                  <AmountInput label={t('governance:policy.minAmount')} value={r.minAmount} onChange={(v) => setRules(editing.map((x, j) => (j === i ? { ...x, minAmount: v } : x)))} />
                  <AmountInput label={t('governance:policy.maxAmount')} value={r.maxAmount} onChange={(v) => setRules(editing.map((x, j) => (j === i ? { ...x, maxAmount: v } : x)))} />
                  <fieldset className="space-y-1 @3xl:col-span-2">
                    <legend className="text-sm font-medium text-text">{t('governance:policy.approvers')}</legend>
                    <div className="flex flex-wrap gap-3">
                      {COMMITTEE_OFFICES.filter((o) => o !== 'member').map((o) => (
                        <PlainCheckbox
                          key={o}
                          isDisabled={!mineDraft}
                          isSelected={r.approvers.some((a) => a.kind === 'office' && a.office === o)}
                          onChange={(on) => setRules(editing.map((x, j) => (j === i ? { ...x, approvers: on ? [...x.approvers, { kind: 'office', office: o as CommitteeOffice }] : x.approvers.filter((a) => !(a.kind === 'office' && a.office === o)) } : x)))}
                          testId={`draft-approver-${i}-${o}`}
                        >
                          {t(`governance:office.${o}`)}
                        </PlainCheckbox>
                      ))}
                    </div>
                  </fieldset>
                  {mineDraft && (
                    <Button variant="quiet" size="sm" icon={Trash2} onPress={() => setRules(editing.filter((_, j) => j !== i))}>
                      {t('governance:policy.removeRule')}
                    </Button>
                  )}
                </div>
              ))}
              {mineDraft && (
                <>
                  <Button variant="secondary" size="sm" icon={Plus} onPress={() => setRules([...editing, { subject: 'cash_voucher', minAmount: '', maxAmount: '', approvers: [{ kind: 'office', office: 'treasurer' }], approvalsRequired: 1 }])}>
                    {t('governance:policy.addRule')}
                  </Button>
                  <PlainTextField label={t('governance:policy.effectiveFrom')} value={from} onChange={setFrom} dir="ltr" testId="draft-from" />
                  <PlainTextArea label={t('governance:policy.note')} value={note || draft.note} onChange={setNote} testId="draft-note" />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" isPending={act.isPending} onPress={() => void run('PATCH', `/approval-policies/${draft.id}`, { rules: editing.map((r) => ({ ...r, minAmount: r.minAmount || undefined, maxAmount: r.maxAmount || undefined })), effectiveFrom: from, note: note || draft.note }, t('governance:policy.saved'))} data-testid="draft-save">
                      {t('governance:policy.save')}
                    </Button>
                    <Button variant="primary" icon={Send} isPending={act.isPending} onPress={() => void run('POST', `/approval-policies/${draft.id}/submit`, {}, t('governance:policy.submitted'))} data-testid="draft-submit">
                      {t('governance:policy.submit')}
                    </Button>
                    <Button variant="quiet" icon={Trash2} onPress={() => void run('POST', `/approval-policies/${draft.id}/discard`, {}, t('governance:policy.discarded'))} data-testid="draft-discard">
                      {t('governance:policy.discard')}
                    </Button>
                  </div>
                </>
              )}
              {error ? <ProblemAlert error={error} /> : null}
            </section>
          ) : (
            <ul className="space-y-2 pt-4" data-testid="policy-holders">
              {d.holders
                .filter((h) => h.people.length)
                .map((h, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border/70 bg-panel p-4 text-sm">
                    <span className="font-medium text-text">{refLabel(t, h.ref, d.roles)}</span>
                    <span className="text-muted">{h.people.map((p) => p.name).join(', ')}</span>
                  </li>
                ))}
            </ul>
          )
        }
      </UrlTabs>
      {error ? <ProblemAlert error={error} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// APR-005 delegation
// ---------------------------------------------------------------------------------------------

export function DelegationPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const q = useApiQuery<{ delegations: Delegation[]; people: Array<{ principalId: string; name: string }>; actions: { create: boolean } }>({ method: 'GET', path: '/delegations' });
  const act = useApiMutation<Delegation>();
  const [to, setTo] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<ApprovalSubject[]>(['cash_voucher']);
  const [fromDate, setFromDate] = useState('2026-10-26');
  const [toDate, setToDate] = useState('2026-11-02');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const { persona } = useSession();
  const run = async (path: string, body: unknown, message: string) => {
    setError(null);
    try {
      await act.mutateAsync({ method: 'POST', path, body });
      toast.success(message);
      setReason('');
      void q.refetch();
    } catch (e) {
      setError(e);
    }
  };
  return (
    <div className="@container space-y-6" data-testid="delegation-page">
      <PageHeader title={t('nav:pages.delegation')} description={t('governance:delegation.intro')} />
      <InlineAlert tone="info" title={t('governance:delegation.ruleTitle')}>
        <p>{t('governance:delegation.ruleBody')}</p>
      </InlineAlert>
      {q.data?.actions.create && (
        <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" aria-labelledby="delegate-title" data-testid="delegation-form">
          <h2 id="delegate-title" className="text-lg font-bold text-text">
            {t('governance:delegation.new')}
          </h2>
          <SelectControl label={t('governance:delegation.to')} value={to} onChange={setTo} options={q.data.people.map((p) => ({ id: p.principalId, label: p.name }))} testId="delegation-to" />
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium text-text">{t('governance:delegation.subjects')}</legend>
            <div className="flex flex-wrap gap-3">
              {APPROVAL_SUBJECTS.map((s) => (
                <PlainCheckbox key={s} isSelected={subjects.includes(s)} onChange={(on) => setSubjects(on ? [...subjects, s] : subjects.filter((x) => x !== s))} testId={`delegation-subject-${s}`}>
                  {t(`governance:subject.${s}`)}
                </PlainCheckbox>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
            <PlainTextField label={t('governance:delegation.from')} value={fromDate} onChange={setFromDate} dir="ltr" testId="delegation-from" />
            <PlainTextField label={t('governance:delegation.until')} value={toDate} onChange={setToDate} dir="ltr" testId="delegation-until" />
          </div>
          <PlainTextField label={t('governance:delegation.reason')} value={reason} onChange={setReason} testId="delegation-reason" />
          <Button variant="primary" icon={ClipboardCheck} isPending={act.isPending} isDisabled={!to || !subjects.length || reason.trim().length < 5} onPress={() => void run('/delegations', { toPrincipalId: to, subjects, from: fromDate, to: toDate, reason }, t('governance:delegation.created'))} data-testid="delegation-create">
            {t('governance:delegation.create')}
          </Button>
          {error ? <ProblemAlert error={error} /> : null}
        </section>
      )}
      <section className="space-y-3" aria-labelledby="delegations-title">
        <h2 id="delegations-title" className="text-lg font-bold text-text">
          {t('governance:delegation.list')}
        </h2>
        {!q.data ? (
          <Loading lines={4} />
        ) : q.data.delegations.length === 0 ? (
          <EmptyState title={t('governance:delegation.empty')} />
        ) : (
          <ul className="space-y-2" data-testid="delegations">
            {q.data.delegations.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border/70 bg-panel p-4 text-sm" data-testid="delegation-row" data-state={d.state}>
                <span>
                  <span className="block font-semibold text-text">{t('governance:delegation.line', { from: d.fromName, to: d.toName })}</span>
                  <span className="block text-muted">
                    {d.subjects.map((s) => t(`governance:subject.${s}`)).join(', ')} · {fmt.date(d.from)} – {fmt.date(d.to)} · <bdi>{d.reason}</bdi>
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={d.state === 'active' ? 'success' : d.state === 'scheduled' ? 'info' : 'neutral'}>{t(`governance:delegation.state.${d.state}`)}</Badge>
                  {(d.state === 'active' || d.state === 'scheduled') && d.fromPrincipalId === persona?.principalId && (
                    <Button variant="quiet" size="sm" onPress={() => void run(`/delegations/${d.id}/end`, {}, t('governance:delegation.ended'))} data-testid="delegation-end">
                      {t('governance:delegation.end')}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Search aria-hidden className="size-4" />
        {t('governance:delegation.audited')}
      </p>
    </div>
  );
}
