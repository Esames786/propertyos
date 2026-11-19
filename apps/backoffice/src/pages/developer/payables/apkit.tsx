import type { AccessTarget, BillState, BudgetVersionState, CostCentreRef, CountState, ExpenseState, MoneyStates, PayablesEvent, PayablesEvidence, PaymentState, PayScope, TopUpState } from '@repo/contracts';
import { ApiError } from '@repo/contracts';
import { Badge, Button, cn, DateTime, dynamicT, InlineAlert, Link, useAnnounce, useApiMutation, useQueryParam, useSession, useT, useToast, type StatusTone } from '@repo/ui';
import { Ban, BadgeCheck, CircleDashed, FileClock, FileText, FlaskConical, Hourglass, Landmark, Paperclip, PencilLine, ReceiptText, Send, ShieldCheck, Undo2, XCircle, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { FileTrigger } from 'react-aria-components';
import { WrapMoney } from '../../society/finance/fkit';
import { SearchSelect, unbroken, useProblemToast } from '../../society/hr/hkit';
import { useSocietyFormat } from '../../society/kit';

/** An amount that may wrap after its currency on a narrow phone with large text (S.1's WrapMoney). */
export { WrapMoney as Amount, Fact, FactGrid } from '../../society/finance/fkit';
export { Loading, ProblemAlert, useSocietyFormat } from '../../society/kit';
export { LinkButton, SearchSelect, DateInput, useFieldError, fieldErrorKey, unbroken, useProblemToast } from '../../society/hr/hkit';

/**
 * Gate E.8 (provisional): shared pieces of the supplier, payables and expense screens. Approval,
 * posting and settlement are always three separate badges (V2.1 01 §9); none ever says "paid",
 * "settled" or "posted". Section navigation, the legal-entity bar, evidence (demo documents), history
 * and the provisional notice every screen carries while its register row is PARTIAL.
 */
export const SUP_TARGET: AccessTarget = { module: 'payables', permission: 'supplier.view', suspension: 'history_read' };
export const EXP_TARGET: AccessTarget = { module: 'payables', permission: 'expense.view', suspension: 'history_read' };

/** A button label that wraps (320 px with 200 % text, long Urdu labels). */
export const WRAP = 'max-w-full whitespace-normal text-center';
/** A list keeps what it showed while a filter or search changes (no flash of the whole screen). */
export const KEEP = { placeholderData: <T,>(previous: T | undefined) => previous };

const withQuery = (path: string, params: Record<string, string | undefined | null> = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return q ? `${path}?${q}` : path;
};

export const PAY = {
  suppliers: (p: { category?: string; q?: string; entity?: string } = {}) => withQuery('/backoffice/sup/suppliers-list', p),
  supplier: (id: string, tab?: string) => withQuery('/backoffice/sup/supplier-360-workspace', { record: id, tab }),
  bills: (p: { state?: string; supplier?: string; entity?: string; q?: string } = {}) => withQuery('/backoffice/sup/supplier-bills-list', p),
  bill: (id: string) => withQuery('/backoffice/sup/supplier-bill-workspace', { record: id }),
  newBill: (p: { supplier?: string; kind?: string } = {}) => withQuery('/backoffice/sup/new-supplier-bill', p),
  payments: (p: { record?: string; state?: string; bill?: string } = {}) => withQuery('/backoffice/sup/supplier-payment-drawer', p),
  ledger: (supplier?: string) => withQuery('/backoffice/sup/supplier-ledger', { supplier }),
  utilities: (p: { service?: string } = {}) => withQuery('/backoffice/sup/utilities-bills-register', p),
  expenses: (p: { state?: string; costCentre?: string; kind?: string; q?: string; entity?: string } = {}) => withQuery('/backoffice/exp/expenses-list', p),
  newExpense: (p: { kind?: string } = {}) => withQuery('/backoffice/exp/new-expense', p),
  expense: (id: string) => withQuery('/backoffice/exp/expense-workspace', { record: id }),
  approvals: () => '/backoffice/exp/expense-approvals',
  pettyCash: () => '/backoffice/exp/petty-cash',
  employee: (p: { claimant?: string } = {}) => withQuery('/backoffice/exp/employee-expenses', p),
  budgets: (p: { year?: string; entity?: string } = {}) => withQuery('/backoffice/exp/budget-list', p),
  budget: (id: string) => withQuery('/backoffice/exp/budget-workspace', { record: id }),
  bva: (p: { year?: string; costCentre?: string; entity?: string } = {}) => withQuery('/backoffice/exp/budget-vs-actual', p),
};

type Section = 'suppliers' | 'bills' | 'payments' | 'ledger' | 'utilities' | 'expenses' | 'approvals' | 'employee' | 'pettyCash' | 'budgets' | 'bva';
const SECTIONS: Array<{ id: Section; href: string; target: AccessTarget }> = [
  { id: 'suppliers', href: PAY.suppliers(), target: SUP_TARGET },
  { id: 'bills', href: PAY.bills(), target: SUP_TARGET },
  { id: 'payments', href: PAY.payments(), target: SUP_TARGET },
  { id: 'ledger', href: PAY.ledger(), target: SUP_TARGET },
  { id: 'utilities', href: PAY.utilities(), target: SUP_TARGET },
  { id: 'expenses', href: PAY.expenses(), target: EXP_TARGET },
  { id: 'approvals', href: PAY.approvals(), target: EXP_TARGET },
  { id: 'employee', href: PAY.employee(), target: EXP_TARGET },
  { id: 'pettyCash', href: PAY.pettyCash(), target: EXP_TARGET },
  { id: 'budgets', href: PAY.budgets(), target: EXP_TARGET },
  { id: 'bva', href: PAY.bva(), target: EXP_TARGET },
];

/** Every payables screen one step from every other the person may open; folds into a disclosure on narrow screens. */
export function PayNav({ current }: { current: Section | null }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const { allows } = useSession();
  const shown = SECTIONS.filter((s) => allows(s.target));
  if (shown.length < 2) return null;
  const pills = (compact: boolean) => (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((s) => (
        <li key={s.id}>
          <Link
            href={s.href}
            variant="plain"
            aria-current={s.id === current ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-9 items-center rounded-pill border px-3 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-focus',
              s.id === current ? 'border-primary bg-primary text-on-primary' : 'border-border bg-panel text-text hover:bg-raised',
            )}
            data-testid={compact ? `pay-navc-${s.id}` : `pay-nav-${s.id}`}
          >
            {dt(`payables:nav.${s.id}`)}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <nav aria-label={t('payables:nav.label')} className="-mt-2 mb-5" data-testid="pay-nav">
      <details className="@min-[48em]:hidden" data-testid="pay-nav-compact">
        <summary className="inline-flex min-h-9 cursor-pointer items-center rounded-pill border border-border bg-panel px-3 text-sm font-medium text-text outline-none focus-visible:outline-2 focus-visible:outline-focus">
          {current ? t('payables:nav.compact', { screen: dt(`payables:nav.${current}`) }) : t('payables:nav.label')}
        </summary>
        <div className="mt-2">{pills(true)}</div>
      </details>
      <div className="hidden @min-[48em]:block">{pills(false)}</div>
    </nav>
  );
}

/** The `?entity=` a list is for (the server answers for the reader's first entity by default). */
export function useEntityParam(): [string | undefined, (id: string) => void] {
  const [entity, setEntity] = useQueryParam('entity');
  return [entity ?? undefined, (id) => setEntity(id)];
}

/** Which legal entity: a choice when the reader has several, a plain statement otherwise (E-37: set by administration). */
export function EntityBar({ scope, onChange }: { scope: PayScope; onChange: (id: string) => void }) {
  const { t } = useT();
  return (
    <div className="space-y-2" data-testid="pay-entity" data-entity={scope.entity.id}>
      <div className="flex flex-wrap items-end gap-3">
        {scope.entities.length > 1 ? (
          <div className="w-full max-w-sm">
            <SearchSelect label={t('payables:entity.label')} options={scope.entities.map((e) => ({ id: e.id, label: e.name, hint: e.code }))} value={scope.entity.id} onChange={(id) => onChange(id)} testId="pay-entity-select" />
          </div>
        ) : (
          <p className="text-sm">
            <span className="text-muted">{t('payables:entity.label')}:</span> <bdi className="font-semibold">{scope.entity.name}</bdi>
          </p>
        )}
        <p className="text-xs text-muted">{t('payables:entity.configured')}</p>
      </div>
      {scope.scopeLimited && (
        <InlineAlert tone="info" data-testid="pay-scope-limited">
          {t('payables:scopeLimited')}
        </InlineAlert>
      )}
    </div>
  );
}

export type ProvisionalScreen = 'suppliers' | 'supplier' | 'bills' | 'bill' | 'newBill' | 'payments' | 'ledger' | 'utilities' | 'expenses' | 'newExpense' | 'expense' | 'approvals' | 'pettyCash' | 'employee' | 'budgets' | 'budget' | 'bva';

/** Every screen is PARTIAL in this wave: the notice names what waits and why. */
export function ProvisionalNotice({ screen }: { screen: ProvisionalScreen }) {
  const { t } = useT();
  const dt = dynamicT(t);
  return (
    <InlineAlert tone="info" title={t('payables:provisional.title')} data-testid="pay-provisional">
      <p className="break-words">{unbroken(dt(`payables:provisional.${screen}`))}</p>
      <p className="mt-1 text-xs break-words text-muted">{t('payables:provisional.fictional')}</p>
    </InlineAlert>
  );
}

/** Approval, posting and settlement are three different things (V2.1 01 §9; E-17, E-18). */
export function Boundary({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  return (
    <section aria-labelledby="pay-boundary-title" className="rounded-tile border border-warning/40 bg-warning-soft/40 p-3 text-sm text-text" data-testid="pay-boundary">
      <h2 id="pay-boundary-title" className="font-semibold">
        {t('payables:boundary.title')}
      </h2>
      {compact ? (
        <p className="mt-1 text-muted">{t('payables:boundary.short')}</p>
      ) : (
        <ol className="mt-1.5 list-decimal space-y-0.5 ps-5">
          <li>{t('payables:boundary.approval')}</li>
          <li>{t('payables:boundary.posting')}</li>
          <li>{t('payables:boundary.settlement')}</li>
        </ol>
      )}
    </section>
  );
}

const stateBadge = <K extends string>(table: Record<K, [StatusTone, LucideIcon]>, ns: string, testId: string) =>
  function StateBadge({ state, className }: { state: K; className?: string }) {
    const { t } = useT();
    const dt = dynamicT(t);
    const [tone, icon] = table[state];
    return (
      <Badge tone={tone} icon={icon} className={className} data-testid={testId} data-state={state}>
        {dt(`payables:${ns}.${state}`)}
      </Badge>
    );
  };

export const BillBadge = stateBadge<BillState>({ draft: ['neutral', PencilLine], submitted: ['info', Hourglass], approved: ['warning', ShieldCheck], rejected: ['error', XCircle], cancelled: ['neutral', Ban] }, 'billState', 'bill-state');
export const PaymentBadge = stateBadge<PaymentState>({ prepared: ['info', FileClock], approved: ['warning', BadgeCheck], sent_simulated: ['warning', Send], cancelled: ['neutral', Ban] }, 'paymentState', 'payment-state');
export const ExpenseBadge = stateBadge<ExpenseState>({ draft: ['neutral', PencilLine], submitted: ['info', Hourglass], approved: ['warning', ShieldCheck], rejected: ['error', XCircle], withdrawn: ['neutral', Undo2] }, 'expenseState', 'expense-state');
export const CountBadge = stateBadge<CountState>({ awaiting_witness: ['info', Hourglass], witnessed: ['success', ShieldCheck], disputed: ['error', XCircle] }, 'countState', 'count-state');
export const TopUpBadge = stateBadge<TopUpState>({ prepared: ['info', FileClock], approved: ['warning', BadgeCheck], cancelled: ['neutral', Ban] }, 'topUpState', 'topup-state');
export const VersionBadge = stateBadge<BudgetVersionState>({ draft: ['neutral', PencilLine], submitted: ['info', Hourglass], approved: ['success', ShieldCheck], rejected: ['error', XCircle], superseded: ['neutral', Undo2], withdrawn: ['neutral', Ban] }, 'versionState', 'version-state');

/** Posting waits on E.7's posting rules (E-17): always "Posting planned". */
export function PostingBadge() {
  const { t } = useT();
  return (
    <Badge tone="neutral" icon={ReceiptText} data-testid="posting-state" data-state="planned">
      {t('payables:posting.planned')}
    </Badge>
  );
}

/** The only settlement state this wave has (E-18). */
export function SettlementBadge() {
  const { t } = useT();
  return (
    <Badge tone="neutral" icon={CircleDashed} data-testid="settlement-state" data-state="not_settled">
      {t('payables:settlement.not_settled')}
    </Badge>
  );
}

/** The three states of a bill or expense, side by side and in words. */
export function ThreeStates({ approval }: { approval: ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5" data-testid="three-states">
      {approval}
      <PostingBadge />
      <SettlementBadge />
    </span>
  );
}

export function DemoTag() {
  const { t } = useT();
  return (
    <Badge tone="demo" icon={FlaskConical} data-testid="pay-demo">
      {t('payables:demo')}
    </Badge>
  );
}

export function Ref({ value, className }: { value: string; className?: string }) {
  return (
    // Whole when it fits; wraps only when a long reference is wider than its card (320 px with 200 % text).
    <bdi dir="ltr" className={cn('ltr-ref [overflow-wrap:anywhere]', className)}>
      {unbroken(value)}
    </bdi>
  );
}

/** A cost centre: its code and name (head office and sales are named in the reader's language). */
export function useCostCentreName() {
  const { t } = useT();
  const dt = dynamicT(t);
  return (cc: CostCentreRef) => (cc.kind === 'head_office' || cc.kind === 'sales' ? dt(`payables:costCentreKind.${cc.kind}`) : cc.name);
}

export function CostCentreName({ cc }: { cc: CostCentreRef }) {
  const name = useCostCentreName();
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-testid="cost-centre" data-cc={cc.id}>
      <bdi dir="ltr" className="font-mono text-xs text-muted">
        {cc.code}
      </bdi>
      <bdi>{name(cc)}</bdi>
    </span>
  );
}

/** A demo document: its name, labelled fictional when it is the sample. */
export function EvidenceLine({ evidence }: { evidence: PayablesEvidence | undefined }) {
  const { t } = useT();
  if (!evidence) return <span className="text-muted">{t('payables:evidence.none')}</span>;
  return (
    // A block that wraps between words only (a file name has spaces; no word is cut at 320 px with 200 % text).
    <span className="block min-w-0 break-words" data-testid="evidence">
      <Paperclip aria-hidden className="me-1.5 inline size-4 align-text-bottom text-muted" />
      <bdi>{evidence.name}</bdi>
      {/* Sample documents are labelled fictional once (seeded names already say so). */}
      {evidence.sample && !/fictional|فرضی/i.test(evidence.name) && <span className="ms-1 text-xs whitespace-nowrap text-muted">({t('payables:evidence.fictional')})</span>}
    </span>
  );
}

/** Attach a file (the prototype keeps only its name and size) or use the labelled sample document (S.1's voucher pattern). */
export function EvidencePicker({ value, onChange, kind, sampleName, error, testId = 'evidence-picker' }: { value: PayablesEvidence | undefined; onChange: (e: PayablesEvidence | undefined) => void; kind: PayablesEvidence['kind']; sampleName: string; error?: string; testId?: string }) {
  const { t } = useT();
  return (
    <div className="space-y-2" data-testid={testId}>
      <p className="text-sm font-medium text-text">{t('payables:evidence.label')}</p>
      <p className="text-xs text-muted">{t('payables:evidence.hint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <FileTrigger acceptedFileTypes={['image/*', 'application/pdf']} onSelect={(files) => files?.[0] && onChange({ name: files[0].name, kind, size: files[0].size, sample: false })}>
          <Button className={WRAP} variant="secondary" icon={Paperclip}>
            {t('payables:evidence.attach')}
          </Button>
        </FileTrigger>
        <Button className={WRAP} variant="quiet" icon={FileText} onPress={() => onChange({ name: sampleName, kind, size: 120_000, sample: true })} data-testid={`${testId}-sample`}>
          {t('payables:evidence.sample')}
        </Button>
        {value && (
          <Button className={WRAP} variant="quiet" size="sm" onPress={() => onChange(undefined)} data-testid={`${testId}-clear`}>
            {t('payables:evidence.remove')}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted" role="status" data-testid={`${testId}-status`}>
        {value ? t('payables:evidence.attached', { name: value.name }) : t('payables:evidence.none')}
      </p>
      {error && <p className="text-xs font-medium text-error">{error}</p>}
    </div>
  );
}

/** A record's history, oldest first, in the reader's language (amounts and dates formatted). */
export function History({ events, testId = 'pay-history' }: { events: PayablesEvent[]; testId?: string }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  // References stay whole (word joiners); amounts may wrap after their currency.
  const shown = (values: Record<string, string> = {}) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, /^-?\d+\.\d{2}$/.test(v) ? fmt.money({ amount: v, currency: 'PKR' }).replace(/[\u00a0\u202f]/g, ' ') : unbroken(v)]));
  if (!events.length) return <p className="text-sm text-muted">{t('payables:history.none')}</p>;
  const label = t('payables:history.title');
  // S.1's HistoryList markup, with one difference: a reference wider than the whole line (320 px with 200 % text)
  // wraps inside the line instead of running off the screen.
  return (
    <ol className="relative space-y-3 border-s border-border ps-5" aria-label={label} data-testid={testId}>
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative text-sm">
          <span aria-hidden className="absolute -start-[1.6rem] top-1.5 size-2.5 rounded-pill bg-border-control" />
          <p className="text-text [overflow-wrap:anywhere]">
            <bdi className="font-medium">{e.byName ?? t('payables:history.someone')}</bdi>
            {' \u00b7 '}
            {dt(`payables:history.${e.action}`, { defaultValue: e.action, ...shown(e.values) })}
          </p>
          {e.note ? (
            <p className="text-xs text-muted [overflow-wrap:anywhere]">
              <bdi>{e.note}</bdi>
            </p>
          ) : null}
          <p className="text-xs text-muted">
            <DateTime value={e.at} style="dateTime" />
          </p>
        </li>
      ))}
    </ol>
  );
}

/**
 * One server action at a time: success is said (toast and live region) only after the server accepted,
 * a refusal is kept for the form or toasted when it names no field.
 */
export function useAction<T>() {
  const { t } = useT();
  const toast = useToast();
  const problem = useProblemToast();
  const announce = useAnnounce();
  const mutation = useApiMutation<T>();
  const [error, setError] = useState<unknown>(null);
  const run = async (path: string, body: Record<string, unknown>, success: string): Promise<T | null> => {
    setError(null);
    try {
      const r = await mutation.mutateAsync({ method: 'POST', path, body });
      toast.success(success);
      announce(success);
      return r;
    } catch (e) {
      setError(e);
      if (!(e instanceof ApiError) || !Object.keys(e.problem.errors ?? {}).length) problem(e);
      return null;
    }
  };
  return { run, error, setError, pending: mutation.isPending, t };
}

/**
 * An amount in a workspace header's metrics: the full figure where there is room, the compact one on a
 * phone or with large text (the full amount is still what a screen reader reads). S.2a's tile lesson.
 */
export function MetricAmount({ value }: { value: { amount: string; currency: 'PKR' } }) {
  const fmt = useSocietyFormat();
  return (
    <span data-amount={value.amount} data-testid="metric-amount">
      <bdi dir="ltr" className="ltr-ref hidden whitespace-nowrap @2xl:inline">
        {fmt.money(value)}
      </bdi>
      {/* Wraps only at its spaces (currency, figure, unit): the shared header's metrics are two narrow columns on a phone. */}
      <bdi dir="ltr" aria-hidden className="ltr-ref whitespace-normal @2xl:hidden">
        {fmt.compact(value).replace(/[\u00a0\u202f]/g, ' ')}
      </bdi>
      <span className="sr-only @2xl:hidden">{fmt.money(value)}</span>
    </span>
  );
}

/** "You may not decide this one" in words, never a silent missing button. */
export function BlockedNote({ reason, testId = 'pay-blocked' }: { reason: string | undefined; testId?: string }) {
  const { t } = useT();
  const dt = dynamicT(t);
  if (!reason) return null;
  return (
    <p className="flex items-start gap-1.5 text-sm text-muted" data-testid={testId} data-reason={reason}>
      <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
      {dt(`payables:blocked.${reason}`)}
    </p>
  );
}

/** The payee account shown masked to `bank.view` holders; in words when it is withheld. */
export function BankLine({ bank, hidden }: { bank?: { bankName: string; title: string; last4: string } | undefined; hidden: boolean }) {
  const { t } = useT();
  if (hidden) return <span className="text-muted" data-testid="bank-hidden">{t('payables:bank.hidden')}</span>;
  if (!bank) return <span className="text-muted" data-testid="bank-none">{t('payables:bank.none')}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" data-testid="bank-line">
      <Landmark aria-hidden className="size-4 text-muted" />
      <bdi>{bank.bankName}</bdi> · <span>{t('payables:bank.ending', { last4: bank.last4 })}</span>
      <span className="text-xs text-muted">({t('payables:bank.sample')})</span>
    </span>
  );
}

/**
 * Wave 2 integration (owner money rule): approved, posted, instructed and settled, each in its own line and
 * in words. Posted and settled are 0.00 in this wave (posting planned, E-17; no settlement without bank
 * evidence, E-18); nothing here ever reads "paid".
 */
export function MoneyStatesList({ states, testId = 'pay-money-states' }: { states: MoneyStates; testId?: string }) {
  const { t } = useT();
  const dt = dynamicT(t);
  // Two columns only where the list itself has room (its own container: a sidebar panel stays one column).
  return (
    <div className="@container">
      <dl className="grid grid-cols-1 gap-3 text-sm @md:grid-cols-2" data-testid={testId}>
        {(['approved', 'posted', 'instructed', 'settled'] as const).map((k) => (
          <div key={k} className="min-w-0" data-testid="pay-money-state" data-state={k} data-amount={states[k].amount}>
            <dt className="text-xs text-muted">{dt(`payables:moneyStates.${k}`)}</dt>
            <dd className="space-y-0.5">
              <WrapMoney value={states[k]} className="font-semibold" />
              <span className="block text-xs text-muted">{dt(`payables:moneyStates.${k}Note`)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
