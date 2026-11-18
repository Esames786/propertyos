import { ApiError, FISCAL_YEARS, SPEND_CATEGORIES, type BudgetsList, type BudgetVsActual, type BudgetView, type BvaBudget, type FiscalYear, type SpendCategory } from '@repo/contracts';
import { Button, ConfirmDialog, Drawer, dynamicT, EmptyState, ErrorState, IconButton, InlineAlert, Link, NotFoundState, PageHeader, Panel, PlainTextField, SegmentedControl, SelectControl, useApiQuery, useKeyedCreate, useNavigation, useQueryParam, useQueryParams, useT, useToast, WorkspaceHeader } from '@repo/ui';
import { BarChart3, CheckCircle2, CopyPlus, Plus, ReceiptText, Send, Trash2, Undo2, XCircle } from 'lucide-react';
import { useState } from 'react';
import {
  Amount,
  BlockedNote,
  CostCentreName,
  DemoTag,
  EntityBar,
  fieldErrorKey,
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
  useAction,
  useCostCentreName,
  useEntityParam,
  useFieldError,
  useProblemToast,
  useSocietyFormat,
  VersionBadge,
  WRAP,
} from './apkit';
import { FavouriteStar, PayRelated } from './connect';
import { moneyText, paisaOf } from './money';

/**
 * Gate E.8 EXP-007 budgets, EXP-008 the budget workspace and EXP-009 budget vs actual (provisional,
 * PARTIAL). One budget per cost centre and fiscal year; versions are drafted, submitted and approved by
 * someone else, never edited in place (a new version supersedes the approved one). Budget vs actual
 * compares the approved version with posted actuals only; nothing can be posted until E.7's posting rules
 * (E-17), so approved-but-unposted obligations are shown in their own column and never as actual.
 * Commitments from open purchase orders arrive with E.9.
 */

const useYear = (): [FiscalYear, (y: FiscalYear) => void] => {
  const [raw, set] = useQueryParam('year');
  return [(FISCAL_YEARS as readonly string[]).includes(raw ?? '') ? (raw as FiscalYear) : 'FY2026-27', (y) => set(y)];
};

interface DraftLine {
  category: SpendCategory | '';
  amount: string;
}

function LinesEditor({ lines, setLines, error }: { lines: DraftLine[]; setLines: (l: DraftLine[]) => void; error: unknown }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const fe = useFieldError(error);
  const total = lines.reduce((s, l) => s + paisaOf(l.amount), 0n);
  return (
    <div className="space-y-3">
      <ol className="space-y-3" data-testid="pay-budget-lines">
        {lines.map((l, i) => (
          <li key={i} className="grid grid-cols-1 items-end gap-2 rounded-tile border border-border/70 p-3 @md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" data-testid={`pay-budget-line-${i}`}>
            <SelectControl label={t('payables:newBill.category')} value={l.category || null} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, category: (v ?? '') as SpendCategory } : x)))} options={SPEND_CATEGORIES.map((c) => ({ id: c, label: dt(`payables:category.${c}`) }))} errorKey={fieldErrorKey(error, `lines.${i}.category`)} testId={`pay-budget-line-${i}-category`} />
            <PlainTextField label={t('payables:budgets.amount')} value={l.amount} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: v } : x)))} inputMode="decimal" dir="ltr" errorKey={fieldErrorKey(error, `lines.${i}.amount`)} testId={`pay-budget-line-${i}-amount`} />
            {lines.length > 1 ? <IconButton icon={Trash2} label={t('payables:newBill.removeLine', { n: i + 1 })} onPress={() => setLines(lines.filter((_, j) => j !== i))} /> : <span />}
          </li>
        ))}
      </ol>
      {fe('lines') && <p className="text-sm font-medium text-error">{fe('lines')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button className={WRAP} size="sm" icon={Plus} isDisabled={lines.length >= SPEND_CATEGORIES.length} onPress={() => setLines([...lines, { category: '', amount: '' }])} data-testid="pay-budget-add-line">
          {t('payables:budgets.addLine')}
        </Button>
        <p className="font-semibold" data-testid="pay-budget-total">
          {t('payables:budgets.total')}: <Amount value={{ amount: moneyText(total), currency: 'PKR' }} />
        </p>
      </div>
    </div>
  );
}

export function BudgetsPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [entity, setEntity] = useEntityParam();
  const [year, setYear] = useYear();
  const [adding, setAdding] = useState(false);
  const q = useApiQuery<BudgetsList>({ method: 'GET', path: '/budgets', query: { year, ...(entity ? { entity } : {}) } }, KEEP);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="pay-budgets">
      <PageHeader
        title={t('payables:budgets.title')}
        description={t('payables:budgets.intro')}
        actions={
          <div className="flex flex-wrap gap-2">
            {d.canCreate && (
              <Button className={WRAP} variant="primary" icon={Plus} onPress={() => setAdding(true)} data-testid="pay-new-budget">
                {t('payables:budgets.new')}
              </Button>
            )}
            <LinkButton icon={BarChart3} href={PAY.bva({ year })} testId="pay-budgets-bva">
              {t('payables:budgets.toBva')}
            </LinkButton>
          </div>
        }
      />
      <PayNav current="budgets" />
      <ProvisionalNotice screen="budgets" />
      <EntityBar scope={d.scope} onChange={setEntity} />
      <SegmentedControl label={t('payables:budgets.year')} wrap value={year} onChange={setYear} options={FISCAL_YEARS.map((y) => ({ id: y, label: y }))} testId="pay-budget-year" />
      {d.items.length === 0 ? (
        <EmptyState title={t('payables:budgets.none', { year })} body={t('payables:budgets.noneHint')} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 @3xl:grid-cols-2" data-testid="pay-budget-list">
          {d.items.map((b) => (
            <li key={b.id} className="min-w-0 space-y-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="pay-budget" data-id={b.id}>
              <p className="flex flex-wrap items-center gap-2">
                <Link href={PAY.budget(b.id)} className="font-semibold" data-testid="pay-budget-link">
                  <CostCentreName cc={b.costCentre} />
                </Link>
                {b.demo && <DemoTag />}
              </p>
              <p className="text-xs text-muted">
                <Ref value={b.ref} /> · {b.year}
              </p>
              <p className="text-sm" data-testid="pay-budget-approved">
                {b.approved ? (
                  <>
                    {t('payables:budgets.approvedVersion', { n: b.approved.n })}: <Amount value={b.approved.total} className="font-semibold" />
                  </>
                ) : (
                  <span className="text-muted">{t('payables:budgets.noApproved')}</span>
                )}
              </p>
              {b.open && (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  {t('payables:budgets.openVersion', { n: b.open.n })} <VersionBadge state={b.open.state} /> <Amount value={b.open.total} />
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{t('payables:budgets.counted', { count: fmt.count(d.items.length) })}</p>
      {adding && <NewBudgetDrawer list={d} year={year} onClose={() => setAdding(false)} />}
    </div>
  );
}

function NewBudgetDrawer({ list, year, onClose }: { list: BudgetsList; year: FiscalYear; onClose: () => void }) {
  const { t } = useT();
  const ccName = useCostCentreName();
  const toast = useToast();
  const problem = useProblemToast();
  const { navigate } = useNavigation();
  const create = useKeyedCreate<BudgetView>('bud');
  const [costCentreId, setCostCentreId] = useState<string | null>(null);
  const [fy, setFy] = useState<FiscalYear>(year);
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ category: '', amount: '' }]);
  const [error, setError] = useState<unknown>(null);
  const fe = useFieldError(error);
  const save = async () => {
    setError(null);
    try {
      const b = await create.send({ method: 'POST', path: '/budgets', body: { legalEntityId: list.scope.entity.id, costCentreId: costCentreId ?? '', year: fy, reason, lines } });
      toast.success(t('payables:budgets.created', { ref: b.ref }));
      navigate(PAY.budget(b.id));
    } catch (e) {
      setError(e);
      if (!(e instanceof ApiError) || !Object.keys(e.problem.errors ?? {}).length) problem(e);
    }
  };
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('payables:budgets.newTitle')}
      subtitle={<bdi>{list.scope.entity.name}</bdi>}
      size="lg"
      testId="pay-budget-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button className={WRAP} variant="quiet" onPress={onClose}>
            {t('payables:common.cancel')}
          </Button>
          <Button className={WRAP} variant="primary" icon={Plus} isPending={create.isPending} onPress={() => void save()} data-testid="pay-budget-save">
            {t('payables:budgets.saveDraft')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <SearchSelect label={t('payables:expense.costCentre')} value={costCentreId} onChange={setCostCentreId} options={list.costCentres.map((c) => ({ id: c.id, label: ccName(c), hint: c.code }))} errorText={fe('costCentreId')} testId="pay-budget-cc" />
        <SegmentedControl label={t('payables:budgets.year')} wrap value={fy} onChange={setFy} options={FISCAL_YEARS.map((y) => ({ id: y, label: y }))} testId="pay-budget-fy" />
        <PlainTextField label={t('payables:budgets.reason')} value={reason} onChange={setReason} errorKey={fieldErrorKey(error, 'reason')} testId="pay-budget-reason" />
        <LinesEditor lines={lines} setLines={setLines} error={error} />
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

export function BudgetWorkspacePage({ id }: { id: string }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  const ccName = useCostCentreName();
  const q = useApiQuery<BudgetView>({ method: 'GET', path: `/budgets/${id}` });
  const act = useAction<BudgetView>();
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'withdraw' | null>(null);
  const [drafting, setDrafting] = useState(false);
  if (q.isError) return q.error instanceof ApiError && q.error.problem.status === 404 ? <NotFoundState headingLevel={1} actions={<LinkButton href={PAY.budgets()}>{t('payables:budgets.back')}</LinkButton>} /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const b = q.data;
  const open = b.versions.find((v) => v.state === 'draft' || v.state === 'submitted');
  const run = (action: string, success: string, body: Record<string, unknown> = {}) => (open ? act.run(`/budgets/${b.id}/versions/${open.n}/${action}`, body, success) : Promise.resolve(null));
  return (
    <div className="@container space-y-5" data-testid="pay-budget-workspace" data-id={b.id}>
      <WorkspaceHeader
        breadcrumbs={[{ label: t('payables:budgets.title'), href: PAY.budgets({ year: b.year, entity: b.legalEntityId }) }, { label: b.ref }]}
        entityLabel={t('payables:budget.entity', { year: b.year })}
        title={ccName(b.costCentre)}
        reference={b.ref}
        status={
          <span className="flex flex-wrap gap-1.5">
            {b.open && <VersionBadge state={b.open.state} />}
            {b.demo && <DemoTag />}
          </span>
        }
        metrics={[
          { label: t('payables:budget.approved'), value: b.approved ? <MetricAmount value={b.approved.total} /> : <span className="text-muted">{t('payables:budgets.noApproved')}</span> },
          { label: t('payables:budget.versions'), value: String(b.versions.length) },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2" data-testid="pay-budget-actions">
            <FavouriteStar id={b.id} title={`${ccName(b.costCentre)} · ${b.year}`} />
            {b.actions.submit && open && (
              <Button className={WRAP} variant="primary" icon={Send} isPending={act.pending} onPress={() => void run('submit', t('payables:budget.submittedToast', { n: open.n }))} data-testid="pay-budget-submit">
                {t('payables:budget.submit')}
              </Button>
            )}
            {b.actions.approve && (
              <Button className={WRAP} variant="primary" icon={CheckCircle2} onPress={() => setDialog('approve')} data-testid="pay-budget-approve">
                {t('payables:budget.approve')}
              </Button>
            )}
            {b.actions.reject && (
              <Button className={WRAP} variant="secondary" icon={XCircle} onPress={() => setDialog('reject')} data-testid="pay-budget-reject">
                {t('payables:budget.reject')}
              </Button>
            )}
            {b.actions.withdraw && (
              <Button className={WRAP} variant="quiet" icon={Undo2} onPress={() => setDialog('withdraw')} data-testid="pay-budget-withdraw">
                {t('payables:budget.withdraw')}
              </Button>
            )}
            {b.actions.newVersion && (
              <Button className={WRAP} icon={CopyPlus} onPress={() => setDrafting(true)} data-testid="pay-budget-new-version">
                {t('payables:budget.newVersion')}
              </Button>
            )}
            <LinkButton icon={BarChart3} href={PAY.bva({ year: b.year, costCentre: b.costCentre.id, entity: b.legalEntityId })} testId="pay-budget-to-bva">
              {t('payables:budgets.toBva')}
            </LinkButton>
            <LinkButton icon={ReceiptText} href={PAY.expenses({ costCentre: b.costCentre.id, entity: b.legalEntityId })} testId="pay-budget-to-expenses">
              {t('payables:budget.toExpenses')}
            </LinkButton>
          </div>
        }
      />
      <PayNav current="budgets" />
      <ProvisionalNotice screen="budget" />
      <BlockedNote reason={b.blocked} />
      {act.error ? <ProblemAlert error={act.error} /> : null}
      <p className="text-sm text-muted">{t('payables:budget.neverInPlace')}</p>
      <div className="grid grid-cols-1 gap-4 @5xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ol className="min-w-0 space-y-3" data-testid="pay-budget-versions">
          {b.versions.map((v) => (
            <li key={v.n} className="space-y-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card" data-testid="pay-budget-version" data-n={v.n} data-state={v.state}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {t('payables:budget.version', { n: v.n })} <VersionBadge state={v.state} />
                </p>
                <Amount value={v.total} className="font-semibold" />
              </div>
              <p className="text-xs text-muted">
                <span className="block">
                  “<bdi>{v.reason}</bdi>”
                </span>
                <span className="block">{t('payables:budget.preparedBy', { name: v.preparedByName, date: fmt.date(v.preparedAt) })}</span>
                {v.decidedByName ? <span className="block">{t(v.state === 'rejected' ? 'payables:budget.rejectedBy' : 'payables:budget.decidedBy', { name: v.decidedByName, date: fmt.date(v.decidedAt!) })}</span> : null}
              </p>
              {v.decisionNote && <p className="text-xs text-muted">“<bdi>{v.decisionNote}</bdi>”</p>}
              <ul className="space-y-1 text-sm">
                {v.lines.map((l) => (
                  <li key={l.category} className="flex flex-wrap justify-between gap-2 border-b border-border/50 pb-1 last:border-0">
                    <span>{dt(`payables:category.${l.category}`)}</span>
                    <Amount value={l.amount} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <div className="min-w-0 space-y-4">
          <Panel title={t('payables:history.title')}>
            <History events={b.history} />
          </Panel>
          <PayRelated id={b.id} />
        </div>
      </div>
      <ConfirmDialog
        isOpen={dialog === 'approve'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('payables:budget.approveTitle', { n: open?.n ?? 0 })}
        effect={t('payables:budget.approveEffect')}
        confirmLabel={t('payables:budget.approve')}
        onConfirm={async () => !!(await run('approve', t('payables:budget.approvedToast', { n: open?.n ?? 0 })))}
      />
      <ConfirmDialog
        isOpen={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('payables:budget.rejectTitle', { n: open?.n ?? 0 })}
        effect={t('payables:budget.rejectEffect')}
        confirmLabel={t('payables:budget.reject')}
        destructive
        reasonLabel={t('payables:common.reason')}
        onConfirm={async (reason) => !!(await run('reject', t('payables:budget.rejectedToast', { n: open?.n ?? 0 }), { reason }))}
      />
      <ConfirmDialog
        isOpen={dialog === 'withdraw'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('payables:budget.withdrawTitle', { n: open?.n ?? 0 })}
        effect={t('payables:budget.withdrawEffect')}
        confirmLabel={t('payables:budget.withdraw')}
        destructive
        onConfirm={async () => !!(await run('withdraw', t('payables:budget.withdrawnToast', { n: open?.n ?? 0 })))}
      />
      {drafting && <NewVersionDrawer b={b} onClose={() => setDrafting(false)} />}
    </div>
  );
}

function NewVersionDrawer({ b, onClose }: { b: BudgetView; onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  const create = useKeyedCreate<BudgetView>('bvn');
  const latest = b.versions[0];
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(latest ? latest.lines.map((l) => ({ category: l.category, amount: l.amount.amount })) : [{ category: '', amount: '' }]);
  const [error, setError] = useState<unknown>(null);
  const save = async () => {
    setError(null);
    try {
      await create.send({ method: 'POST', path: `/budgets/${b.id}/versions`, body: { reason, lines } });
      toast.success(t('payables:budget.versionCreated'));
      onClose();
    } catch (e) {
      setError(e);
      if (!(e instanceof ApiError) || !Object.keys(e.problem.errors ?? {}).length) problem(e);
    }
  };
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('payables:budget.newVersionTitle')}
      subtitle={<Ref value={b.ref} />}
      size="lg"
      testId="pay-version-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button className={WRAP} variant="quiet" onPress={onClose}>
            {t('payables:common.cancel')}
          </Button>
          <Button className={WRAP} variant="primary" icon={CopyPlus} isPending={create.isPending} onPress={() => void save()} data-testid="pay-version-save">
            {t('payables:budgets.saveDraft')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="info">{t('payables:budget.newVersionHint')}</InlineAlert>
        <PlainTextField label={t('payables:budgets.reason')} value={reason} onChange={setReason} errorKey={fieldErrorKey(error, 'reason')} testId="pay-version-reason" />
        <LinesEditor lines={lines} setLines={setLines} error={error} />
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

function BvaTable({ b }: { b: BvaBudget }) {
  const { t } = useT();
  const dt = dynamicT(t);
  return (
    <section className="space-y-3 rounded-card border border-border/70 bg-panel p-5 shadow-card" aria-labelledby={`bva-${b.budgetId}`} data-testid="pay-bva-budget" data-cc={b.costCentre.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id={`bva-${b.budgetId}`} className="text-lg font-semibold">
          <CostCentreName cc={b.costCentre} />
        </h2>
        <p className="text-sm text-muted">
          <Link href={PAY.budget(b.budgetId)}>
            <Ref value={b.budgetRef} />
          </Link>{' '}
          · {t('payables:budgets.approvedVersion', { n: b.version })}
        </p>
      </div>
      {!b.billsIncluded && (
        <p className="text-xs text-muted" data-testid="pay-bva-bills-excluded">
          {t('payables:bva.billsExcluded')}
        </p>
      )}
      <ul className="space-y-2" data-testid="pay-bva-rows">
        <li className="hidden grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] gap-2 text-xs font-medium text-muted @3xl:grid" aria-hidden>
          <span>{t('payables:bva.category')}</span>
          <span className="text-end">{t('payables:bva.budget')}</span>
          <span className="text-end">{t('payables:bva.actual')}</span>
          <span className="text-end">{t('payables:bva.approvedNotPosted')}</span>
          <span className="text-end">{t('payables:bva.remaining')}</span>
        </li>
        {[...b.rows.map((r) => ({ key: r.category, label: dt(`payables:category.${r.category}`), ...r })), { key: 'total', label: t('payables:bva.total'), ...b.totals }].map((r) => (
          <li key={r.key} className={`grid grid-cols-1 gap-1 border-b border-border/60 pb-2 text-sm last:border-0 @3xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] @3xl:gap-2 ${r.key === 'total' ? 'font-semibold' : ''}`} data-testid="pay-bva-row" data-category={r.key}>
            <span>{r.label}</span>
            {(['budget', 'actualPosted', 'approvedNotPosted', 'remaining'] as const).map((k) => (
              <span key={k} className="flex flex-wrap justify-between gap-2 @3xl:block @3xl:text-end">
                <span className="text-xs font-normal text-muted @3xl:hidden">{t(`payables:bva.${k === 'actualPosted' ? 'actual' : k}`)}</span>
                <Amount value={r[k]} />
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BudgetVsActualPage() {
  const { t } = useT();
  const dt = dynamicT(t);
  const ccName = useCostCentreName();
  const set = useQueryParams();
  const [entity, setEntity] = useEntityParam();
  const [year, setYear] = useYear();
  const [costCentre] = useQueryParam('costCentre');
  const q = useApiQuery<BudgetVsActual>({ method: 'GET', path: '/budget-vs-actual', query: { year, ...(entity ? { entity } : {}), ...(costCentre ? { costCentre } : {}) } }, KEEP);
  if (q.isError) return q.error instanceof ApiError && q.error.problem.status === 404 ? <NotFoundState headingLevel={1} actions={<LinkButton href={PAY.bva()}>{t('payables:bva.back')}</LinkButton>} /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="pay-bva">
      <PageHeader title={t('payables:bva.title')} description={t('payables:bva.intro')} breadcrumbs={[{ label: t('payables:budgets.title'), href: PAY.budgets({ year }) }]} />
      <PayNav current="bva" />
      <ProvisionalNotice screen="bva" />
      <EntityBar scope={d.scope} onChange={setEntity} />
      <InlineAlert tone="warning" title={t('payables:bva.actualTitle')} data-testid="pay-bva-posting">
        <p>{t('payables:bva.actualBody')}</p>
        <p className="mt-1">{t('payables:bva.commitments')}</p>
      </InlineAlert>
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedControl label={t('payables:budgets.year')} wrap value={year} onChange={setYear} options={FISCAL_YEARS.map((y) => ({ id: y, label: y }))} testId="pay-bva-year" />
        {costCentre && (
          <Button className={WRAP} size="sm" variant="quiet" onPress={() => set({ costCentre: null })} data-testid="pay-bva-all">
            {t('payables:bva.allCostCentres')}
          </Button>
        )}
      </div>
      {d.entityTotals ? (
        <p className="text-sm" data-testid="pay-bva-entity-totals">
          {t('payables:bva.entityTotals')}: <Amount value={d.entityTotals.budget} className="font-semibold" /> · {t('payables:bva.actual')}: <Amount value={d.entityTotals.actualPosted} /> · {t('payables:bva.approvedNotPosted')}: <Amount value={d.entityTotals.approvedNotPosted} />
        </p>
      ) : (
        !costCentre && (
          <p className="text-sm text-muted" data-testid="pay-bva-totals-withheld">
            {t('payables:bva.totalsWithheld')}
          </p>
        )
      )}
      {d.budgets.length === 0 ? (
        <EmptyState title={t('payables:bva.none')} body={t('payables:bva.noneHint')} actions={<LinkButton href={PAY.budgets({ year })}>{t('payables:budgets.title')}</LinkButton>} />
      ) : (
        <div className="space-y-4">
          {d.budgets.map((b) => (
            <BvaTable key={b.budgetId} b={b} />
          ))}
        </div>
      )}
      {d.withoutApproved.length > 0 && (
        <Panel title={t('payables:bva.withoutApproved')}>
          <ul className="space-y-2 text-sm" data-testid="pay-bva-without">
            {d.withoutApproved.map((w) => (
              <li key={w.costCentre.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <bdi dir="ltr" className="font-mono text-xs text-muted">
                    {w.costCentre.code}
                  </bdi>{' '}
                  <bdi>{ccName(w.costCentre)}</bdi>
                </span>
                {w.budgetId ? (
                  <Link href={PAY.budget(w.budgetId)}>{w.openState ? t('payables:bva.openState', { state: dt(`payables:versionState.${w.openState}`) }) : t('payables:bva.openBudget')}</Link>
                ) : (
                  <span className="text-muted">{t('payables:bva.noBudget')}</span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
