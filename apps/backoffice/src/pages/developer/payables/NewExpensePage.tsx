import { ApiError, SPEND_CATEGORIES, type ExpenseKind, type ExpenseOptions, type ExpenseView, type PaidVia, type PayablesEvidence, type SpendCategory } from '@repo/contracts';
import { Button, dynamicT, ErrorState, InlineAlert, PageHeader, Panel, PlainTextArea, PlainTextField, SegmentedControl, SelectControl, useApiMutation, useApiQuery, useKeyedCreate, useNavigation, useQueryParam, useT, useToast } from '@repo/ui';
import { Save, Send } from 'lucide-react';
import { useState } from 'react';
import { DateInput, EntityBar, EvidencePicker, fieldErrorKey, LinkButton, Loading, PAY, PayNav, ProblemAlert, ProvisionalNotice, SearchSelect, useCostCentreName, useEntityParam, useFieldError, useProblemToast, WRAP } from './apkit';

/**
 * Gate E.8 EXP-002 new expense or employee claim (`?kind=claim`), provisional, PARTIAL. S.1's voucher
 * pattern (amount, date, payee, purpose and a demo document as evidence); S.1 expense vouchers stay off
 * where payables is licensed. Cost centres, floats and claimants come from the reader's scope only; the
 * server checks everything again. Saving creates a draft; submitting sends it to someone else.
 */
export default function NewExpensePage() {
  const { t } = useT();
  const [entity, setEntity] = useEntityParam();
  const [kindParam] = useQueryParam('kind');
  const kind: ExpenseKind = kindParam === 'claim' ? 'claim' : 'business';
  const q = useApiQuery<ExpenseOptions>({ method: 'GET', path: '/expenses/options', query: entity ? { entity } : {} });
  const header = <PageHeader title={t(kind === 'claim' ? 'payables:newExpense.claimTitle' : 'payables:newExpense.title')} description={t(kind === 'claim' ? 'payables:newExpense.claimIntro' : 'payables:newExpense.intro')} breadcrumbs={[{ label: t(kind === 'claim' ? 'payables:employee.title' : 'payables:expenses.title'), href: kind === 'claim' ? PAY.employee() : PAY.expenses() }]} />;
  if (q.isError) {
    const readOnly = q.error instanceof ApiError && q.error.problem.code === 'permission_missing';
    return (
      <div className="@container space-y-5" data-testid="pay-new-expense">
        {header}
        <PayNav current={kind === 'claim' ? 'employee' : 'expenses'} />
        {readOnly ? (
          <InlineAlert tone="info" title={t('payables:newExpense.readOnlyTitle')} data-testid="pay-new-expense-readonly">
            <p>{t('payables:newExpense.readOnlyBody')}</p>
            <div className="mt-2">
              <LinkButton href={PAY.expenses()}>{t('payables:expenses.back')}</LinkButton>
            </div>
          </InlineAlert>
        ) : (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        )}
      </div>
    );
  }
  if (!q.data) return <Loading lines={10} />;
  return (
    <div className="@container space-y-5" data-testid="pay-new-expense" data-kind={kind}>
      {header}
      <PayNav current={kind === 'claim' ? 'employee' : 'expenses'} />
      <ProvisionalNotice screen="newExpense" />
      <EntityBar scope={q.data.scope} onChange={setEntity} />
      <ExpenseForm key={`${q.data.scope.entity.id}-${kind}`} o={q.data} kind={kind} />
    </div>
  );
}

function ExpenseForm({ o, kind }: { o: ExpenseOptions; kind: ExpenseKind }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const toast = useToast();
  const problem = useProblemToast();
  const { navigate } = useNavigation();
  const ccName = useCostCentreName();
  const [costCentreId, setCostCentreId] = useState<string | null>(o.costCentres.length === 1 ? o.costCentres[0]!.id : null);
  const [category, setCategory] = useState<SpendCategory | ''>(kind === 'claim' ? 'travel' : '');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [incurredOn, setIncurredOn] = useState(o.today);
  const [payee, setPayee] = useState('');
  const [paidVia, setPaidVia] = useState<PaidVia>('payable');
  const [floatId, setFloatId] = useState<string | null>(null);
  const [claimantId, setClaimantId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<PayablesEvidence | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const create = useKeyedCreate<ExpenseView>('exp');
  const submit = useApiMutation<ExpenseView>();
  const fe = useFieldError(error);
  const floats = o.floats.filter((f) => !costCentreId || f.costCentreId === costCentreId);
  const save = async (andSubmit: boolean) => {
    setError(null);
    let made: ExpenseView | null = null;
    try {
      made = await create.send({
        method: 'POST',
        path: '/expenses',
        body: {
          kind,
          legalEntityId: o.scope.entity.id,
          costCentreId: costCentreId ?? '',
          category,
          description,
          amount,
          incurredOn,
          ...(kind === 'claim' ? { claimantId: claimantId ?? '' } : { payee, paidVia, ...(paidVia === 'petty_cash' ? { floatId: floatId ?? '' } : {}) }),
          ...(evidence ? { evidence } : {}),
        },
      });
      if (andSubmit) await submit.mutateAsync({ method: 'POST', path: `/expenses/${made.id}/submit`, body: {} });
      toast.success(t(andSubmit ? 'payables:newExpense.submitted' : 'payables:newExpense.saved', { ref: made.ref }));
      navigate(PAY.expense(made.id));
    } catch (e) {
      if (made) {
        problem(e);
        navigate(PAY.expense(made.id));
        return;
      }
      setError(e);
      if (!(e instanceof ApiError) || !Object.keys(e.problem.errors ?? {}).length) problem(e);
    }
  };
  return (
    <div className="space-y-4">
      <InlineAlert tone="info" data-testid="pay-voucher-rule">
        {t('payables:expenses.voucherRule')}
      </InlineAlert>
      <Panel title={t(kind === 'claim' ? 'payables:newExpense.claimDetails' : 'payables:newExpense.details')}>
        <div className="space-y-4">
          {kind === 'claim' && (
            <SearchSelect label={t('payables:newExpense.claimant')} description={t('payables:newExpense.claimantHint')} value={claimantId} onChange={setClaimantId} options={o.claimants.map((c) => ({ id: c.id, label: c.name, hint: dt(c.roleKey) }))} errorText={fe('claimantId')} testId="pay-expense-claimant" />
          )}
          <SearchSelect label={t('payables:expense.costCentre')} description={t('payables:newExpense.costCentreHint')} value={costCentreId} onChange={(v) => { setCostCentreId(v); setFloatId(null); }} options={o.costCentres.map((c) => ({ id: c.id, label: ccName(c), hint: c.code }))} errorText={fe('costCentreId')} testId="pay-expense-cc-select" />
          <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-3">
            <SelectControl label={t('payables:expense.category')} value={category || null} onChange={(v) => setCategory((v ?? '') as SpendCategory)} options={SPEND_CATEGORIES.map((c) => ({ id: c, label: dt(`payables:category.${c}`) }))} errorKey={fieldErrorKey(error, 'category')} testId="pay-expense-category" />
            <PlainTextField label={t('payables:expense.amount')} value={amount} onChange={setAmount} inputMode="decimal" dir="ltr" errorKey={fieldErrorKey(error, 'amount')} testId="pay-expense-amount" />
            <DateInput id="pay-expense-date" label={t('payables:expense.incurredOn')} value={incurredOn} onChange={setIncurredOn} max={o.today} testId="pay-expense-date" description={fe('incurredOn')} />
          </div>
          <PlainTextArea label={t('payables:newExpense.description')} value={description} onChange={setDescription} errorKey={fieldErrorKey(error, 'description')} testId="pay-expense-description" />
          {kind === 'business' && (
            <>
              <PlainTextField label={t('payables:expense.payee')} description={t('payables:newExpense.payeeHint')} value={payee} onChange={setPayee} errorKey={fieldErrorKey(error, 'payee')} testId="pay-expense-payee" />
              <SegmentedControl label={t('payables:expense.paidVia')} wrap value={paidVia} onChange={(v) => setPaidVia(v as PaidVia)} options={[{ id: 'payable', label: t('payables:paidVia.payable') }, { id: 'petty_cash', label: t('payables:paidVia.petty_cash') }]} testId="pay-expense-paid-via" />
              {paidVia === 'petty_cash' && (
                <SearchSelect label={t('payables:newExpense.float')} description={floats.length ? t('payables:newExpense.floatHint') : t('payables:newExpense.noFloat')} value={floatId} onChange={setFloatId} options={floats.map((f) => ({ id: f.id, label: f.name }))} errorText={fe('floatId')} testId="pay-expense-float" />
              )}
            </>
          )}
        </div>
      </Panel>
      <Panel title={t('payables:expense.evidence')}>
        <EvidencePicker value={evidence} onChange={setEvidence} kind="receipt" sampleName={t('payables:evidence.sampleReceipt', { ref: incurredOn })} error={fe('evidence')} testId="pay-expense-form-evidence" />
      </Panel>
      {error ? <ProblemAlert error={error} /> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button className={WRAP} icon={Save} isPending={create.isPending && !submit.isPending} onPress={() => void save(false)} data-testid="pay-expense-save">
          {t('payables:newExpense.save')}
        </Button>
        <Button className={WRAP} variant="primary" icon={Send} isPending={create.isPending || submit.isPending} onPress={() => void save(true)} data-testid="pay-expense-save-submit">
          {t('payables:newExpense.saveSubmit')}
        </Button>
      </div>
    </div>
  );
}
