import { ApiError, EXPENSE_FILTERS, type ApprovalItem, type ExpenseApprovals, type ExpenseFilter, type ExpensesList, type ExpenseSummary, type ExpenseView, type PayablesEvidence } from '@repo/contracts';
import { Badge, Button, ConfirmDialog, dynamicT, EmptyState, ErrorState, FilterPills, InlineAlert, Link, NotFoundState, PageHeader, Panel, PlainTextField, SegmentedControl, useApiQuery, useQueryParam, useQueryParams, useT, WorkspaceHeader } from '@repo/ui';
import { CheckCircle2, FilePlus2, Paperclip, Send, Undo2, UserRound, XCircle } from 'lucide-react';
import { useState } from 'react';
import {
  Amount,
  BlockedNote,
  Boundary,
  CostCentreName,
  DemoTag,
  EntityBar,
  EvidenceLine,
  EvidencePicker,
  ExpenseBadge,
  Fact,
  FactGrid,
  History,
  KEEP,
  LinkButton,
  Loading,
  MetricAmount,
  PAY,
  PayNav,
  ProblemAlert,
  ProvisionalNotice,
  Ref,
  SearchSelect,
  ThreeStates,
  useAction,
  useCostCentreName,
  useEntityParam,
  useSocietyFormat,
  WRAP,
} from './apkit';

/**
 * Gate E.8 EXP-001 expenses, EXP-003 the expense workspace, EXP-004 approvals and EXP-006 employee
 * expenses (provisional, PARTIAL). Scope: legal entity + cost centre (a cost-centre reader sees only
 * their cost centres, lists and counts included). Approver ≠ maker ≠ claimant, checked by principal on
 * the server. An approved expense or claim is an obligation; reimbursement and payment wait on E-18.
 */

export function ExpenseRow({ e }: { e: ExpenseSummary }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  return (
    <li className="min-w-0 rounded-tile border border-border/70 bg-panel p-3 shadow-card" data-testid="pay-expense" data-id={e.id} data-state={e.state} data-cc={e.costCentre.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <Link href={PAY.expense(e.id)} className="min-w-0 max-w-full font-semibold" data-testid="pay-expense-link">
              <Ref value={e.ref} />
            </Link>
            <Badge tone="neutral" icon={e.kind === 'claim' ? UserRound : undefined}>
              {dt(`payables:expenseKind.${e.kind}`)}
            </Badge>
            {e.demo && <DemoTag />}
          </p>
          <p className="text-sm break-words">
            <bdi>{e.description}</bdi>
          </p>
          <p className="text-xs text-muted">
            {dt(`payables:category.${e.category}`)} · <CostCentreName cc={e.costCentre} /> · {fmt.date(e.incurredOn)}
          </p>
          <p className="text-xs text-muted">
            {e.kind === 'claim' ? t('payables:expenses.claimant', { name: e.claimant?.name ?? '' }) : t('payables:expenses.payee', { name: e.payee })}
            {e.paidVia === 'petty_cash' && e.floatName ? ` · ${t('payables:expenses.fromFloat', { name: e.floatName })}` : ''}
          </p>
        </div>
        <Amount value={e.amount} className="text-base font-semibold" />
      </div>
      <div className="mt-2">
        <ThreeStates approval={<ExpenseBadge state={e.state} />} />
      </div>
    </li>
  );
}

export function ExpensesPage() {
  const { t } = useT();
  const dt = dynamicT(t);
  const ccName = useCostCentreName();
  const set = useQueryParams();
  const [entity, setEntity] = useEntityParam();
  const [stateParam] = useQueryParam('state');
  const [kindParam] = useQueryParam('kind');
  const [costCentre] = useQueryParam('costCentre');
  const [search] = useQueryParam('q');
  const state: ExpenseFilter = (EXPENSE_FILTERS as readonly string[]).includes(stateParam ?? '') ? (stateParam as ExpenseFilter) : 'all';
  const kind = kindParam === 'business' || kindParam === 'claim' ? kindParam : 'all';
  const q = useApiQuery<ExpensesList>({ method: 'GET', path: '/expenses', query: { ...(entity ? { entity } : {}), ...(state !== 'all' ? { state } : {}), ...(kind !== 'all' ? { kind } : {}), ...(costCentre ? { costCentre } : {}), ...(search ? { q: search } : {}) } }, KEEP);
  if (q.isError) return q.error instanceof ApiError && q.error.problem.status === 404 ? <NotFoundState headingLevel={1} actions={<LinkButton href={PAY.expenses()}>{t('payables:expenses.back')}</LinkButton>} /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="pay-expenses">
      <PageHeader
        title={t('payables:expenses.title')}
        description={t('payables:expenses.intro')}
        actions={
          d.canCreate ? (
            <div className="flex flex-wrap gap-2">
              <LinkButton variant="primary" icon={FilePlus2} href={PAY.newExpense()} testId="pay-new-expense">
                {t('payables:expenses.new')}
              </LinkButton>
              <LinkButton icon={UserRound} href={PAY.newExpense({ kind: 'claim' })} testId="pay-new-claim">
                {t('payables:expenses.newClaim')}
              </LinkButton>
            </div>
          ) : undefined
        }
      />
      <PayNav current="expenses" />
      <ProvisionalNotice screen="expenses" />
      <EntityBar scope={d.scope} onChange={setEntity} />
      <InlineAlert tone="info" data-testid="pay-voucher-rule">
        {t('payables:expenses.voucherRule')}
      </InlineAlert>
      <FilterPills label={t('payables:expenses.filterLabel')} options={EXPENSE_FILTERS.map((f) => ({ id: f, label: dt(`payables:expenses.filter.${f}`), count: d.counts[f] }))} value={state} onChange={(v) => set({ state: v === 'all' ? null : v })} testId="pay-expense-filter" />
      <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
        <SegmentedControl label={t('payables:expenses.kind')} wrap value={kind} onChange={(v) => set({ kind: v === 'all' ? null : v })} options={[{ id: 'all', label: t('payables:expenses.allKinds') }, { id: 'business', label: t('payables:expenseKind.business') }, { id: 'claim', label: t('payables:expenseKind.claim') }]} testId="pay-expense-kind" />
        <SearchSelect label={t('payables:expenses.costCentre')} value={costCentre ?? 'all'} onChange={(v) => set({ costCentre: v === 'all' ? null : v })} options={[{ id: 'all', label: t('payables:expenses.allCostCentres') }, ...d.costCentres.map((c) => ({ id: c.id, label: ccName(c), hint: c.code }))]} testId="pay-expense-cc" />
        <PlainTextField label={t('payables:expenses.search')} value={search ?? ''} onChange={(v) => set({ q: v.trim() ? v : null })} optional testId="pay-expense-search" />
      </div>
      {d.items.length === 0 ? (
        <EmptyState title={t(state !== 'all' || kind !== 'all' || costCentre || search ? 'payables:expenses.noneFiltered' : 'payables:expenses.none')} body={t('payables:expenses.noneHint')} />
      ) : (
        <ul className="space-y-2" data-testid="pay-expense-list">
          {d.items.map((e) => (
            <ExpenseRow key={e.id} e={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function ExpenseWorkspacePage({ id }: { id: string }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  const q = useApiQuery<ExpenseView>({ method: 'GET', path: `/expenses/${id}` });
  const act = useAction<ExpenseView>();
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'withdraw' | null>(null);
  const [evidence, setEvidence] = useState<PayablesEvidence | undefined>(undefined);
  if (q.isError) return q.error instanceof ApiError && q.error.problem.status === 404 ? <NotFoundState headingLevel={1} actions={<LinkButton href={PAY.expenses()}>{t('payables:expenses.back')}</LinkButton>} /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const e = q.data;
  const run = (path: string, success: string, body: Record<string, unknown> = {}) => act.run(`/expenses/${e.id}/${path}`, body, success);
  return (
    <div className="@container space-y-5" data-testid="pay-expense-workspace" data-id={e.id} data-state={e.state}>
      <WorkspaceHeader
        breadcrumbs={[{ label: t(e.kind === 'claim' ? 'payables:employee.title' : 'payables:expenses.title'), href: e.kind === 'claim' ? PAY.employee() : PAY.expenses() }, { label: e.ref }]}
        entityLabel={dt(`payables:expenseKind.${e.kind}`)}
        title={e.description}
        reference={e.ref}
        status={<ThreeStates approval={<ExpenseBadge state={e.state} />} />}
        metrics={[
          { label: t('payables:expense.amount'), value: <MetricAmount value={e.amount} /> },
          { label: t('payables:expense.incurredOn'), value: fmt.date(e.incurredOn) },
          { label: t('payables:expense.category'), value: dt(`payables:category.${e.category}`) },
        ]}
        actions={
          <div className="flex flex-wrap gap-2" data-testid="pay-expense-actions">
            {e.actions.submit && (
              <Button className={WRAP} variant="primary" icon={Send} isPending={act.pending} onPress={() => void run('submit', t('payables:expense.submittedToast', { ref: e.ref }))} data-testid="pay-expense-submit">
                {t('payables:expense.submit')}
              </Button>
            )}
            {e.actions.approve && (
              <Button className={WRAP} variant="primary" icon={CheckCircle2} onPress={() => setDialog('approve')} data-testid="pay-expense-approve">
                {t('payables:expense.approve')}
              </Button>
            )}
            {e.actions.reject && (
              <Button className={WRAP} variant="secondary" icon={XCircle} onPress={() => setDialog('reject')} data-testid="pay-expense-reject">
                {t('payables:expense.reject')}
              </Button>
            )}
            {e.actions.withdraw && (
              <Button className={WRAP} variant="quiet" icon={Undo2} onPress={() => setDialog('withdraw')} data-testid="pay-expense-withdraw">
                {t('payables:expense.withdraw')}
              </Button>
            )}
          </div>
        }
      />
      <PayNav current={e.kind === 'claim' ? 'employee' : 'expenses'} />
      <ProvisionalNotice screen="expense" />
      <BlockedNote reason={e.blocked} />
      {act.error ? <ProblemAlert error={act.error} /> : null}
      {e.state === 'approved' && (
        <InlineAlert tone="warning" title={t('payables:expense.obligationTitle')} data-testid="pay-expense-obligation">
          {t(e.kind === 'claim' ? 'payables:expense.claimObligation' : 'payables:expense.obligationBody')}
        </InlineAlert>
      )}
      <div className="grid grid-cols-1 gap-4 @5xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Panel title={t('payables:expense.details')}>
            <FactGrid testId="pay-expense-facts">
              <Fact label={t('payables:entity.label')}>
                <bdi>{e.legalEntity.name}</bdi>
              </Fact>
              <Fact label={t('payables:expense.costCentre')}>
                <CostCentreName cc={e.costCentre} />
              </Fact>
              {e.kind === 'claim' ? (
                <Fact label={t('payables:expense.claimant')}>
                  <bdi>{e.claimant?.name}</bdi>
                </Fact>
              ) : (
                <Fact label={t('payables:expense.payee')}>
                  <bdi>{e.payee}</bdi>
                </Fact>
              )}
              {e.kind === 'business' && <Fact label={t('payables:expense.paidVia')}>{e.paidVia === 'petty_cash' ? t('payables:expenses.fromFloat', { name: e.floatName ?? '' }) : t('payables:paidVia.payable')}</Fact>}
              <Fact label={t('payables:expense.evidence')}>
                <EvidenceLine evidence={e.evidence} />
              </Fact>
              <Fact label={t('payables:expense.preparedBy')}>
                <bdi>{e.createdByName}</bdi> · {fmt.date(e.createdAt)}
              </Fact>
              {e.submittedByName && (
                <Fact label={t('payables:expense.submittedBy')}>
                  <bdi>{e.submittedByName}</bdi> · {fmt.date(e.submittedAt!)}
                </Fact>
              )}
              {e.decidedByName && (
                <Fact label={t(e.state === 'rejected' ? 'payables:expense.rejectedBy' : 'payables:expense.approvedBy')}>
                  <bdi>{e.decidedByName}</bdi> · {fmt.date(e.decidedAt!)}
                  {e.decisionNote ? <span className="block text-xs text-muted">“<bdi>{e.decisionNote}</bdi>”</span> : null}
                </Fact>
              )}
            </FactGrid>
          </Panel>
          {e.actions.attach && (
            <Panel title={t('payables:expense.attachTitle')}>
              <EvidencePicker value={evidence} onChange={setEvidence} kind="receipt" sampleName={t('payables:evidence.sampleReceipt', { ref: e.ref })} testId="pay-expense-evidence" />
              <div className="mt-3">
                <Button className={WRAP} icon={Paperclip} isDisabled={!evidence} isPending={act.pending} onPress={() => void act.run(`/expenses/${e.id}/evidence`, { evidence }, t('payables:expense.attached')).then((r) => r && setEvidence(undefined))} data-testid="pay-expense-attach">
                  {t('payables:expense.attach')}
                </Button>
              </div>
            </Panel>
          )}
        </div>
        <div className="min-w-0 space-y-4">
          <Boundary compact />
          <Panel title={t('payables:history.title')}>
            <History events={e.history} />
          </Panel>
        </div>
      </div>
      <ConfirmDialog
        isOpen={dialog === 'approve'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('payables:expense.approveTitle', { ref: e.ref })}
        effect={t('payables:expense.approveEffect')}
        confirmLabel={t('payables:expense.approve')}
        onConfirm={async () => !!(await run('approve', t('payables:expense.approvedToast', { ref: e.ref })))}
      />
      <ConfirmDialog
        isOpen={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('payables:expense.rejectTitle', { ref: e.ref })}
        effect={t('payables:expense.rejectEffect')}
        confirmLabel={t('payables:expense.reject')}
        destructive
        reasonLabel={t('payables:common.reason')}
        onConfirm={async (reason) => !!(await run('reject', t('payables:expense.rejectedToast', { ref: e.ref }), { reason }))}
      />
      <ConfirmDialog
        isOpen={dialog === 'withdraw'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('payables:expense.withdrawTitle', { ref: e.ref })}
        effect={t('payables:expense.withdrawEffect')}
        confirmLabel={t('payables:expense.withdraw')}
        destructive
        onConfirm={async () => !!(await run('withdraw', t('payables:expense.withdrawnToast', { ref: e.ref })))}
      />
    </div>
  );
}

function ApprovalCard({ item, onDecide }: { item: ApprovalItem; onDecide?: (decision: 'approve' | 'reject') => void }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  return (
    <li className="min-w-0 rounded-tile border border-border/70 bg-panel p-3 shadow-card" data-testid="pay-approval" data-id={item.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <Link href={PAY.expense(item.id)} className="min-w-0 max-w-full font-semibold" data-testid="pay-approval-link">
              <Ref value={item.ref} />
            </Link>
            <Badge tone="neutral">{dt(`payables:expenseKind.${item.kind}`)}</Badge>
          </p>
          <p className="text-sm break-words">
            <bdi>{item.description}</bdi>
          </p>
          <p className="text-xs text-muted">
            <CostCentreName cc={item.costCentre} />
            {item.claimantName ? ` · ${t('payables:expenses.claimant', { name: item.claimantName })}` : ''}
          </p>
          <p className="text-xs text-muted">{t('payables:approvals.submittedBy', { name: item.submittedByName, date: fmt.date(item.submittedAt) })}</p>
        </div>
        <Amount value={item.amount} className="text-base font-semibold" />
      </div>
      {onDecide ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button className={WRAP} size="sm" variant="primary" icon={CheckCircle2} onPress={() => onDecide('approve')} data-testid="pay-approval-approve">
            {t('payables:expense.approve')}
          </Button>
          <Button className={WRAP} size="sm" variant="secondary" icon={XCircle} onPress={() => onDecide('reject')} data-testid="pay-approval-reject">
            {t('payables:expense.reject')}
          </Button>
        </div>
      ) : (
        <div className="mt-2">
          <BlockedNote reason={item.blocked} testId="pay-approval-blocked" />
        </div>
      )}
    </li>
  );
}

export function ExpenseApprovalsPage() {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  const [entity, setEntity] = useEntityParam();
  const q = useApiQuery<ExpenseApprovals>({ method: 'GET', path: '/expense-approvals', query: entity ? { entity } : {} }, KEEP);
  const act = useAction<ExpenseView>();
  const [deciding, setDeciding] = useState<{ item: ApprovalItem; decision: 'approve' | 'reject' } | null>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="pay-approvals">
      <PageHeader title={t('payables:approvals.title')} description={t('payables:approvals.intro')} breadcrumbs={[{ label: t('payables:expenses.title'), href: PAY.expenses() }]} />
      <PayNav current="approvals" />
      <ProvisionalNotice screen="approvals" />
      <EntityBar scope={d.scope} onChange={setEntity} />
      {act.error ? <ProblemAlert error={act.error} /> : null}
      <Panel title={t('payables:approvals.toDecide', { count: d.toDecide.length })} description={d.canDecide ? t('payables:approvals.toDecideHint') : t('payables:approvals.noPermission')}>
        {d.toDecide.length === 0 ? (
          <p className="text-sm text-muted" data-testid="pay-approvals-empty">
            {t('payables:approvals.nothing')}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="pay-approvals-decide">
            {d.toDecide.map((x) => (
              <ApprovalCard key={x.id} item={x} onDecide={(decision) => setDeciding({ item: x, decision })} />
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={t('payables:approvals.waiting', { count: d.waiting.length })} description={t('payables:approvals.waitingHint')}>
        {d.waiting.length === 0 ? (
          <p className="text-sm text-muted">{t('payables:common.none')}</p>
        ) : (
          <ul className="space-y-2" data-testid="pay-approvals-waiting">
            {d.waiting.map((x) => (
              <ApprovalCard key={x.id} item={x} />
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={t('payables:approvals.recent')}>
        {d.recent.length === 0 ? (
          <p className="text-sm text-muted">{t('payables:approvals.noneRecent')}</p>
        ) : (
          <ul className="space-y-2 text-sm" data-testid="pay-approvals-recent">
            {d.recent.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="space-y-1">
                  <Link href={PAY.expense(x.id)}>
                    <Ref value={x.ref} />
                  </Link>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <ExpenseBadge state={x.state} /> {t('payables:approvals.decidedBy', { name: x.decidedByName, date: fmt.date(x.decidedAt) })}
                  </span>
                </span>
                <Amount value={x.amount} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {deciding && (
        <ConfirmDialog
          isOpen
          onOpenChange={(o) => !o && setDeciding(null)}
          title={dt(`payables:expense.${deciding.decision}Title`, { ref: deciding.item.ref })}
          effect={dt(`payables:expense.${deciding.decision}Effect`)}
          confirmLabel={dt(`payables:expense.${deciding.decision}`)}
          destructive={deciding.decision === 'reject'}
          {...(deciding.decision === 'reject' ? { reasonLabel: t('payables:common.reason') } : {})}
          onConfirm={async (reason) => {
            const ok = await act.run(`/expenses/${deciding.item.id}/${deciding.decision}`, reason ? { reason } : {}, dt(`payables:expense.${deciding.decision === 'approve' ? 'approvedToast' : 'rejectedToast'}`, { ref: deciding.item.ref }));
            if (ok) setDeciding(null);
            return !!ok;
          }}
        />
      )}
    </div>
  );
}

export function EmployeeExpensesPage() {
  const { t } = useT();
  const set = useQueryParams();
  const [entity, setEntity] = useEntityParam();
  const [claimant] = useQueryParam('claimant');
  const q = useApiQuery<ExpensesList>({ method: 'GET', path: '/expenses', query: { kind: 'claim', ...(entity ? { entity } : {}) } }, KEEP);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  const people = [...new Map(d.items.filter((e) => e.claimant).map((e) => [e.claimant!.id, e.claimant!.name])).entries()];
  const shown = d.items.filter((e) => !claimant || e.claimant?.id === claimant);
  return (
    <div className="@container space-y-5" data-testid="pay-employee">
      <PageHeader
        title={t('payables:employee.title')}
        description={t('payables:employee.intro')}
        actions={
          d.canCreate ? (
            <LinkButton variant="primary" icon={FilePlus2} href={PAY.newExpense({ kind: 'claim' })} testId="pay-employee-new">
              {t('payables:expenses.newClaim')}
            </LinkButton>
          ) : undefined
        }
      />
      <PayNav current="employee" />
      <ProvisionalNotice screen="employee" />
      <EntityBar scope={d.scope} onChange={setEntity} />
      <InlineAlert tone="info" title={t('payables:employee.reimbursementTitle')} data-testid="pay-employee-reimbursement">
        {t('payables:employee.reimbursementBody')}
      </InlineAlert>
      <div className="max-w-md">
        <SearchSelect label={t('payables:employee.person')} value={claimant ?? 'all'} onChange={(v) => set({ claimant: v === 'all' ? null : v })} options={[{ id: 'all', label: t('payables:employee.everyone') }, ...people.map(([id, name]) => ({ id, label: name }))]} testId="pay-employee-person" />
      </div>
      {shown.length === 0 ? (
        <EmptyState title={t('payables:employee.none')} body={t('payables:employee.noneHint')} />
      ) : (
        <ul className="space-y-2" data-testid="pay-employee-list">
          {shown.map((e) => (
            <ExpenseRow key={e.id} e={e} />
          ))}
        </ul>
      )}
    </div>
  );
}
