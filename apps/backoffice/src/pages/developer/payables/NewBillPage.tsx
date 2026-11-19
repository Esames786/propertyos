import { ApiError, BILL_KINDS, SPEND_CATEGORIES, UTILITY_SERVICES, type BillKind, type BillOptions, type BillView, type PayablesEvidence, type SpendCategory, type UtilityService } from '@repo/contracts';
import { Button, dynamicT, ErrorState, IconButton, InlineAlert, PageHeader, Panel, PlainTextField, SegmentedControl, SelectControl, useApiMutation, useApiQuery, useKeyedCreate, useNavigation, useQueryParam, useT, useToast } from '@repo/ui';
import { Plus, Save, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Amount,
  DateInput,
  EntityBar,
  EvidencePicker,
  fieldErrorKey,
  LinkButton,
  Loading,
  PAY,
  PayNav,
  ProblemAlert,
  ProvisionalNotice,
  SearchSelect,
  useCostCentreName,
  useEntityParam,
  useFieldError,
  useProblemToast,
  WRAP,
} from './apkit';
import { paisaOf, moneyText } from './money';

/**
 * Gate E.8 SUP-005 new supplier bill (and utility bill, `?kind=utility`), provisional, PARTIAL. The
 * supplier, the cost centre of every line and the entity come from the reader's scope only; the server
 * checks everything again (cross-entity, duplicates, dates, amounts, the evidence before submission).
 * Saving creates a draft; submitting sends it to someone else for approval. The 3-way match with a goods
 * receipt (PROC-008) arrives with E.9.
 */
interface Line {
  description: string;
  category: SpendCategory | '';
  costCentreId: string;
  amount: string;
}
const blank = (): Line => ({ description: '', category: '', costCentreId: '', amount: '' });

export default function NewBillPage() {
  const { t } = useT();
  const [entity, setEntity] = useEntityParam();
  const q = useApiQuery<BillOptions>({ method: 'GET', path: '/supplier-bills/options', query: entity ? { entity } : {} });
  const header = <PageHeader title={t('payables:newBill.title')} description={t('payables:newBill.intro')} breadcrumbs={[{ label: t('payables:bills.title'), href: PAY.bills() }]} />;
  if (q.isError) {
    const readOnly = q.error instanceof ApiError && q.error.problem.code === 'permission_missing';
    return (
      <div className="@container space-y-5" data-testid="pay-new-bill">
        {header}
        <PayNav current="bills" />
        {readOnly ? (
          <InlineAlert tone="info" title={t('payables:newBill.readOnlyTitle')} data-testid="pay-new-bill-readonly">
            <p>{t('payables:newBill.readOnlyBody')}</p>
            <div className="mt-2">
              <LinkButton href={PAY.bills()}>{t('payables:bills.back')}</LinkButton>
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
    <div className="@container space-y-5" data-testid="pay-new-bill">
      {header}
      <PayNav current="bills" />
      <ProvisionalNotice screen="newBill" />
      <EntityBar scope={q.data.scope} onChange={setEntity} />
      <BillForm key={q.data.scope.entity.id} o={q.data} />
    </div>
  );
}

function BillForm({ o }: { o: BillOptions }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const toast = useToast();
  const problem = useProblemToast();
  const { navigate } = useNavigation();
  const ccName = useCostCentreName();
  const [kindParam] = useQueryParam('kind');
  const [supplierParam] = useQueryParam('supplier');
  const [kind, setKind] = useState<BillKind>(kindParam === 'utility' ? 'utility' : 'standard');
  const [supplierId, setSupplierId] = useState<string | null>(o.suppliers.some((s) => s.id === supplierParam) ? supplierParam : null);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(o.today);
  const [dueDate, setDueDate] = useState('');
  const [service, setService] = useState<UtilityService | ''>('');
  const [consumerNo, setConsumerNo] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [lines, setLines] = useState<Line[]>([{ ...blank(), ...(kindParam === 'utility' ? { category: 'utilities' as const } : {}) }]);
  const [evidence, setEvidence] = useState<PayablesEvidence | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const create = useKeyedCreate<BillView>('sbl');
  const submit = useApiMutation<BillView>();
  const fe = useFieldError(error);
  const total = lines.reduce((s, l) => s + paisaOf(l.amount), 0n);
  const suppliers = o.suppliers.filter((s) => kind === 'standard' || s.category === 'utilities');
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const save = async (andSubmit: boolean) => {
    setError(null);
    let bill: BillView | null = null;
    try {
      bill = await create.send({
        method: 'POST',
        path: '/supplier-bills',
        body: {
          legalEntityId: o.scope.entity.id,
          supplierId: supplierId ?? '',
          kind,
          supplierInvoiceNo: invoiceNo,
          invoiceDate,
          dueDate,
          ...(kind === 'utility' ? { utility: { service, consumerNo, periodFrom, periodTo } } : {}),
          lines,
          ...(evidence ? { evidence } : {}),
        },
      });
      if (andSubmit) await submit.mutateAsync({ method: 'POST', path: `/supplier-bills/${bill.id}/submit`, body: {} });
      toast.success(t(andSubmit ? 'payables:newBill.submitted' : 'payables:newBill.saved', { ref: bill.ref }));
      navigate(PAY.bill(bill.id));
    } catch (e) {
      if (bill) {
        // The draft exists; only the submission was refused (shown on the bill itself).
        problem(e);
        navigate(PAY.bill(bill.id));
        return;
      }
      setError(e);
      if (!(e instanceof ApiError) || !Object.keys(e.problem.errors ?? {}).length) problem(e);
    }
  };
  return (
    <div className="space-y-4">
      <Panel title={t('payables:newBill.document')}>
        <div className="space-y-4">
          <SegmentedControl label={t('payables:newBill.kind')} wrap value={kind} onChange={(k) => setKind(k as BillKind)} options={BILL_KINDS.map((k) => ({ id: k, label: dt(`payables:billKind.${k}`) }))} testId="pay-bill-kind" />
          <SearchSelect
            label={t('payables:bills.supplier')}
            description={t('payables:newBill.supplierHint')}
            value={supplierId}
            onChange={setSupplierId}
            options={suppliers.map((s) => ({ id: s.id, label: s.name, hint: dt(`payables:supplierCategory.${s.category}`) }))}
            errorText={fe('supplierId')}
            testId="pay-bill-supplier-select"
          />
          <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-3">
            <PlainTextField label={t('payables:bills.invoiceNo')} description={t('payables:newBill.invoiceNoHint')} value={invoiceNo} onChange={setInvoiceNo} dir="ltr" errorKey={fieldErrorKey(error, 'supplierInvoiceNo')} testId="pay-bill-invoice-no" />
            <DateInput id="pay-bill-invoice-date" label={t('payables:bills.invoiceDate')} value={invoiceDate} onChange={setInvoiceDate} max={o.today} testId="pay-bill-invoice-date" description={fe('invoiceDate')} />
            <DateInput id="pay-bill-due-date" label={t('payables:bills.dueDate')} value={dueDate} onChange={setDueDate} min={invoiceDate || undefined} testId="pay-bill-due-date" description={fe('dueDate')} />
          </div>
          {kind === 'utility' && (
            <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2" data-testid="pay-bill-utility">
              <SelectControl label={t('payables:utilities.service')} value={service || null} onChange={(v) => setService((v ?? '') as UtilityService)} options={UTILITY_SERVICES.map((s) => ({ id: s, label: dt(`payables:service.${s}`) }))} errorKey={fieldErrorKey(error, 'utility.service')} testId="pay-bill-service" />
              <PlainTextField label={t('payables:utilities.consumer')} value={consumerNo} onChange={setConsumerNo} dir="ltr" errorKey={fieldErrorKey(error, 'utility.consumerNo')} testId="pay-bill-consumer" />
              <DateInput id="pay-bill-period-from" label={t('payables:utilities.periodFrom')} value={periodFrom} onChange={setPeriodFrom} max={o.today} testId="pay-bill-period-from" description={fe('utility.periodFrom')} />
              <DateInput id="pay-bill-period-to" label={t('payables:utilities.periodTo')} value={periodTo} onChange={setPeriodTo} min={periodFrom || undefined} max={o.today} testId="pay-bill-period-to" description={fe('utility.periodTo')} />
            </div>
          )}
        </div>
      </Panel>
      <Panel title={t('payables:bill.lines')} description={t('payables:newBill.linesHint')}>
        <ol className="space-y-4" data-testid="pay-bill-form-lines">
          {lines.map((l, i) => (
            <li key={i} className="space-y-3 rounded-tile border border-border/70 p-3" data-testid={`pay-bill-form-line-${i}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{t('payables:newBill.line', { n: i + 1 })}</p>
                {lines.length > 1 && <IconButton icon={Trash2} label={t('payables:newBill.removeLine', { n: i + 1 })} onPress={() => setLines(lines.filter((_, j) => j !== i))} />}
              </div>
              <PlainTextField label={t('payables:newBill.description')} value={l.description} onChange={(v) => setLine(i, { description: v })} errorKey={fieldErrorKey(error, `lines.${i}.description`)} testId={`pay-line-${i}-description`} />
              <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
                <SelectControl label={t('payables:newBill.category')} value={l.category || null} onChange={(v) => setLine(i, { category: (v ?? '') as SpendCategory })} options={SPEND_CATEGORIES.map((c) => ({ id: c, label: dt(`payables:category.${c}`) }))} errorKey={fieldErrorKey(error, `lines.${i}.category`)} testId={`pay-line-${i}-category`} />
                <SearchSelect label={t('payables:newBill.costCentre')} value={l.costCentreId || null} onChange={(v) => setLine(i, { costCentreId: v })} options={o.costCentres.map((c) => ({ id: c.id, label: ccName(c), hint: c.code }))} errorText={fe(`lines.${i}.costCentreId`)} testId={`pay-line-${i}-cc`} />
                <PlainTextField label={t('payables:newBill.amount')} value={l.amount} onChange={(v) => setLine(i, { amount: v })} inputMode="decimal" dir="ltr" errorKey={fieldErrorKey(error, `lines.${i}.amount`)} testId={`pay-line-${i}-amount`} />
              </div>
            </li>
          ))}
        </ol>
        {fe('lines') && <p className="mt-2 text-sm font-medium text-error">{fe('lines')}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button className={WRAP} variant="secondary" icon={Plus} isDisabled={lines.length >= 20} onPress={() => setLines([...lines, blank()])} data-testid="pay-bill-add-line">
            {t('payables:newBill.addLine')}
          </Button>
          <p className="text-base font-semibold" data-testid="pay-bill-form-total">
            {t('payables:bill.total')}: <Amount value={{ amount: moneyText(total), currency: 'PKR' }} />
          </p>
        </div>
      </Panel>
      <Panel title={t('payables:bill.evidence')}>
        <EvidencePicker value={evidence} onChange={setEvidence} kind="invoice" sampleName={t('payables:evidence.sampleInvoice', { ref: invoiceNo || '—' })} error={fe('evidence')} testId="pay-bill-form-evidence" />
      </Panel>
      {error ? <ProblemAlert error={error} /> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button className={WRAP} icon={Save} isPending={create.isPending && !submit.isPending} onPress={() => void save(false)} data-testid="pay-bill-save">
          {t('payables:newBill.save')}
        </Button>
        <Button className={WRAP} variant="primary" icon={Send} isPending={create.isPending || submit.isPending} onPress={() => void save(true)} data-testid="pay-bill-save-submit">
          {t('payables:newBill.saveSubmit')}
        </Button>
      </div>
    </div>
  );
}
