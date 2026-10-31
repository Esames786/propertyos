import type { BeneficiaryChange, CollectionSettings, DocumentKind, MethodRule } from '@repo/contracts';
import { formatIban } from '@repo/i18n';
import {
  Badge,
  Button,
  Link,
  PlainCheckbox,
  SelectControl,
  ConfirmDialog,
  DateTime,
  dynamicT,
  ErrorState,
  InlineAlert,
  Panel,
  Switch,
  PlainTextArea,
  PlainTextField,
  useApiMutation,
  useApiQuery,
  useT,
  useToast,
} from '@repo/ui';
import { BadgeCheck, Ban, CalendarClock, Check, Clock3, History, Landmark, Lock, ShieldCheck, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { AmountInput, LaterBadge, Loading, ProblemAlert, useSocietyFormat } from '../kit';

const useSettings = (siteId: string) => useApiQuery<CollectionSettings>({ method: 'GET', path: `/sites/${siteId}/collection-settings` });

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <dt className="text-muted">{label}</dt>
      <dd className="text-end font-medium text-text">{value}</dd>
    </div>
  );
}

const CHANGE_TONE: Record<BeneficiaryChange['state'], ['success' | 'warning' | 'info' | 'error' | 'neutral', typeof Check]> = {
  pending_approval: ['warning', Clock3],
  cooling_off: ['info', CalendarClock],
  active: ['success', BadgeCheck],
  rejected: ['error', XCircle],
  cancelled: ['neutral', Ban],
};

/**
 * BILL-010 collection account. Residents only ever see the verified account in force. A new account
 * is proposed with the reason and the bank's confirmation, approved by a second person, then waits
 * out the cooling-off period before residents see it; every step is audited and can be cancelled
 * before it takes effect.
 */
export function CollectionAccountTab({ siteId }: { siteId: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useSettings(siteId);
  const [proposing, setProposing] = useState(false);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={6} />;
  const s = q.data;
  const open = s.changes.find((c) => c.state === 'pending_approval' || c.state === 'cooling_off');
  return (
    <div className="space-y-5" data-testid="collection-account">
      <div className="grid gap-5 @4xl:grid-cols-2">
        <Panel title={t('collections:settings.payeeTitle')} description={t('collections:settings.payeeHint')}>
          {s.payee ? (
            <dl className="space-y-3 text-sm" data-testid="payee-card">
              <Row label={t('sites:collection.status')} value={<Badge tone="success" icon={BadgeCheck}>{t('collections:settings.verifiedOn', { date: s.payee.verifiedOn ? fmt.date(s.payee.verifiedOn) : '' })}</Badge>} />
              <Row label={t('sites:collection.title')} value={<bdi>{s.payee.accountTitle}</bdi>} />
              <Row label={t('sites:collection.bank')} value={<span>{s.payee.bankName} · <bdi>{s.payee.branch}</bdi></span>} />
              <Row label={t('sites:collection.iban')} value={<bdi dir="ltr" className="ltr-ref font-mono" data-testid="payee-iban">{formatIban(s.payee.iban)}</bdi>} />
              <Row label={t('sites:collection.reference')} value={<bdi dir="ltr" className="ltr-ref font-mono">{s.payee.referenceFormat}</bdi>} />
              <Row label={t('collections:settings.inForceSince')} value={s.payee.activeFrom ? fmt.date(s.payee.activeFrom) : '—'} />
            </dl>
          ) : (
            <p className="text-sm text-muted">{t('sites:collection.none')}</p>
          )}
          <p className="mt-4 flex items-start gap-2 text-xs text-muted">
            <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-success" />
            {t('collections:settings.platformNote')}
          </p>
          {s.actions.proposeBeneficiary && !open && !proposing && (
            <Button variant="secondary" icon={Landmark} className="mt-4" onPress={() => setProposing(true)} data-testid="propose-account">
              {t('collections:settings.propose')}
            </Button>
          )}
        </Panel>
        <Panel title={t('sites:collection.rulesTitle')}>
          <dl className="space-y-3 text-sm">
            <Row label={t('sites:collection.issueDay')} value={t('sites:collection.dayN', { day: s.issueDay })} />
            <Row label={t('sites:collection.dueDay')} value={t('sites:collection.dayN', { day: s.dueDay })} />
            <Row label={t('sites:collection.allocation')} value={t('sites:collection.oldestFirst')} />
            <Row label={t('collections:settings.coolingOff')} value={t('collections:settings.days', { count: s.coolingOffDays })} />
            <Row label={t('sites:collection.lateFees')} value={<LaterBadge gate="G" />} />
            <Row label={t('sites:collection.reminders')} value={<Link href="/backoffice/col/reminders">{t('finance:settings.reminderRules')}</Link>} />
          </dl>
        </Panel>
      </div>
      {proposing && <ProposeForm siteId={siteId} onDone={() => setProposing(false)} />}
      {open && <ChangeCard change={open} settings={s} />}
      <Panel title={t('collections:settings.historyTitle')}>
        <ol className="space-y-3" data-testid="beneficiary-history">
          {s.changes.map((c) => {
            const [tone, Icon] = CHANGE_TONE[c.state];
            return (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 rounded-tile border border-border px-4 py-3 text-sm">
                <span className="min-w-0">
                  <bdi dir="ltr" className="ltr-ref block font-semibold text-text">{formatIban(c.proposed.iban)}</bdi>
                  <span className="block text-xs text-muted">
                    {t('collections:settings.proposedBy', { name: c.proposedByName })} · <DateTime value={c.proposedAt} style="dateTime" />
                    {c.decidedByName && <> · {t('collections:settings.decidedBy', { name: c.decidedByName })}</>}
                    {c.effectiveOn && <> · {t('collections:settings.effectiveOn', { date: fmt.date(c.effectiveOn) })}</>}
                  </span>
                  <span className="block text-xs text-muted"><bdi>{t('billing:quote', { text: c.reason })}</bdi></span>
                </span>
                <Badge tone={tone} icon={Icon}>{t(`collections:settings.changeState.${c.state}`)}</Badge>
              </li>
            );
          })}
          {s.history.map((b) => (
            <li key={b.id} className="flex flex-wrap items-start justify-between gap-3 rounded-tile border border-dashed border-border px-4 py-3 text-sm text-muted">
              <span>
                <bdi dir="ltr" className="ltr-ref block">{formatIban(b.iban)}</bdi>
                <span className="block text-xs"><bdi>{b.accountTitle}</bdi>{b.activeTo && <> · {t('collections:settings.retiredOn', { date: fmt.date(b.activeTo) })}</>}</span>
              </span>
              <Badge tone="neutral" icon={History}>{b.activeFrom && b.activeFrom > (s.payee?.activeFrom ?? '') ? t('collections:settings.upcoming') : t('collections:settings.retired')}</Badge>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

function ProposeForm({ siteId, onDone }: { siteId: string; onDone: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const mutation = useApiMutation<CollectionSettings>();
  const [form, setForm] = useState({ bankName: 'Demo Bank', branch: '', accountTitle: '', iban: '', reason: '', checked: false });
  const [error, setError] = useState<unknown>(null);
  const set = (k: keyof typeof form) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Panel title={t('collections:settings.proposeTitle')} description={t('collections:settings.proposeHint')}>
      <div className="grid gap-4 @3xl:grid-cols-2" data-testid="propose-form">
        <PlainTextField label={t('sites:collection.bank')} value={form.bankName} onChange={set('bankName')} />
        <PlainTextField label={t('collections:settings.branch')} value={form.branch} onChange={set('branch')} testId="propose-branch" />
        <PlainTextField label={t('sites:collection.title')} value={form.accountTitle} onChange={set('accountTitle')} testId="propose-title" />
        <PlainTextField label={t('sites:collection.iban')} description={t('collections:settings.ibanHelp')} value={form.iban} onChange={set('iban')} testId="propose-iban" />
        <div className="@3xl:col-span-2">
          <PlainTextArea label={t('collections:settings.reason')} value={form.reason} onChange={set('reason')} testId="propose-reason" />
        </div>
        <div className="@3xl:col-span-2">
          <PlainCheckbox isSelected={form.checked} onChange={set('checked')} testId="propose-checked">
            {t('collections:settings.letterChecked')}
          </PlainCheckbox>
        </div>
      </div>
      {error ? <ProblemAlert error={error} className="mt-4" /> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="quiet" onPress={onDone}>{t('common:actions.cancel')}</Button>
        <Button
          variant="primary"
          isPending={mutation.isPending}
          onPress={async () => {
            setError(null);
            try {
              await mutation.mutateAsync({ method: 'POST', path: `/sites/${siteId}/beneficiary-changes`, body: { ...form, verification: form.checked ? 'bank_letter_checked' : 'not_checked' } });
              toast.success(t('collections:settings.proposed'));
              onDone();
            } catch (e) {
              setError(e);
            }
          }}
          data-testid="propose-submit"
        >
          {t('collections:settings.proposeSubmit')}
        </Button>
      </div>
    </Panel>
  );
}

function ChangeCard({ change, settings }: { change: BeneficiaryChange; settings: CollectionSettings }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const mutation = useApiMutation<CollectionSettings>();
  const [dialog, setDialog] = useState<null | 'reject' | 'cancel'>(null);
  const [error, setError] = useState<unknown>(null);
  const act = async (decision: string, note?: string) => {
    setError(null);
    try {
      await mutation.mutateAsync({ method: 'POST', path: `/beneficiary-changes/${change.id}/${decision}`, body: note ? { note } : {} });
      toast.success(t(`collections:settings.done.${decision}` as 'collections:settings.done.approve'));
      setDialog(null);
    } catch (e) {
      setError(e);
    }
  };
  const pending = change.state === 'pending_approval';
  return (
    <section className="space-y-4 rounded-card border-2 border-warning/40 bg-warning-soft/30 p-5" aria-label={t('collections:settings.changeTitle')} data-testid="beneficiary-change" data-state={change.state}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-text">{pending ? t('collections:settings.pendingTitle') : t('collections:settings.coolingTitle', { date: change.effectiveOn ? fmt.date(change.effectiveOn) : '' })}</h3>
          <p className="mt-0.5 text-sm text-text">{pending ? t('collections:settings.pendingBody', { name: change.proposedByName }) : t('collections:settings.coolingBody')}</p>
        </div>
        <Badge tone={pending ? 'warning' : 'info'} icon={pending ? Clock3 : CalendarClock}>{t(`collections:settings.changeState.${change.state}`)}</Badge>
      </div>
      <dl className="grid gap-2 text-sm @3xl:grid-cols-2">
        <Row label={t('sites:collection.bank')} value={<span>{change.proposed.bankName} · <bdi>{change.proposed.branch}</bdi></span>} />
        <Row label={t('sites:collection.title')} value={<bdi>{change.proposed.accountTitle}</bdi>} />
        <Row label={t('sites:collection.iban')} value={<bdi dir="ltr" className="ltr-ref font-mono">{formatIban(change.proposed.iban)}</bdi>} />
        <Row label={t('collections:settings.verification')} value={change.verification === 'bank_letter_checked' ? <Badge tone="success" icon={BadgeCheck}>{t('collections:settings.letterOk')}</Badge> : <Badge tone="warning" icon={Lock}>{t('collections:settings.letterMissing')}</Badge>} />
      </dl>
      <p className="text-sm text-muted"><bdi>{t('billing:quote', { text: change.reason })}</bdi></p>
      {error ? <ProblemAlert error={error} /> : null}
      <div className="flex flex-wrap gap-2">
        {pending && settings.actions.approveBeneficiary && (
          <>
            <Button variant="primary" icon={BadgeCheck} isPending={mutation.isPending} onPress={() => void act('approve')} data-testid="beneficiary-approve">
              {t('collections:settings.approve')}
            </Button>
            <Button variant="danger" icon={XCircle} onPress={() => setDialog('reject')} data-testid="beneficiary-reject">
              {t('collections:settings.reject')}
            </Button>
          </>
        )}
        {(settings.actions.approveBeneficiary || settings.actions.proposeBeneficiary) && (
          <Button variant="secondary" icon={Ban} onPress={() => setDialog('cancel')} data-testid="beneficiary-cancel">
            {t('collections:settings.cancelChange')}
          </Button>
        )}
        {!pending && settings.actions.approveBeneficiary && (
          <Button variant="quiet" icon={CalendarClock} onPress={() => void act('end-cooling-off')} data-testid="beneficiary-end-cooling">
            {t('collections:settings.endCooling')}
          </Button>
        )}
      </div>
      {!pending && <p className="text-xs text-muted">{t('collections:settings.endCoolingNote')}</p>}
      <ConfirmDialog
        isOpen={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog === 'reject' ? t('collections:settings.rejectTitle') : t('collections:settings.cancelTitle')}
        effect={dialog === 'reject' ? t('collections:settings.rejectEffect') : t('collections:settings.cancelEffect')}
        confirmLabel={dialog === 'reject' ? t('collections:settings.reject') : t('collections:settings.cancelChange')}
        destructive
        reasonLabel={t('collections:settings.note')}
        onConfirm={(note) => act(dialog!, note)}
      />
    </section>
  );
}

/** BILL-012 payment method rules per site: transfers always; office cash on/off with its limit and counter. */
export function PaymentMethodsTab({ siteId }: { siteId: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const q = useSettings(siteId);
  const mutation = useApiMutation<CollectionSettings>();
  const [error, setError] = useState<unknown>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={4} />;
  const s = q.data;
  const update = async (m: MethodRule, patch: Partial<{ enabled: boolean; maxAmount: string; counter: string }>) => {
    setError(null);
    try {
      await mutation.mutateAsync({ method: 'PATCH', path: `/sites/${siteId}/payment-methods`, body: { method: m.method, enabled: m.enabled, ...patch } });
      toast.success(t('collections:settings.methodSaved'));
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Panel title={t('sites:methods.title')} description={s.actions.manageMethods ? t('collections:settings.methodsHint') : t('sites:methods.hint')}>
      <ul className="divide-y divide-border rounded-tile border border-border" data-testid="payment-methods">
        {s.methods.map((m) => (
          <li key={m.method} className="space-y-3 px-4 py-3" data-method={m.method} data-allowed={m.enabled}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-semibold text-text">{t(`sites:methods.kinds.${m.method}`)}</span>
                <span className="block text-xs text-muted">{t(`sites:methods.hints.${m.method}`)}</span>
              </span>
              {m.gate ? (
                <LaterBadge gate={m.gate} />
              ) : s.actions.manageMethods && m.method !== 'bank_transfer' ? (
                <Switch isSelected={m.enabled} onChange={(on) => void update(m, { enabled: on })} label={m.enabled ? t('sites:methods.allowed') : t('sites:methods.notAllowed')} testId={`method-toggle-${m.method}`} />
              ) : m.enabled ? (
                <Badge tone="success" icon={Check}>{t('sites:methods.allowed')}</Badge>
              ) : (
                <Badge tone="neutral" icon={Ban}>{t('sites:methods.notAllowed')}</Badge>
              )}
            </div>
            {m.method === 'office_cash' &&
              (s.actions.manageMethods ? (
                <CashRules rule={m} pending={mutation.isPending} onSave={(patch) => update(m, patch)} />
              ) : (
                <p className="text-xs text-muted">{t('collections:settings.cashRules', { max: m.maxAmount ? fmt.money(m.maxAmount) : '—', counter: m.counter ?? '—' })}</p>
              ))}
            {m.method === 'office_cash' && <CashWitness siteId={siteId} settings={s} canManage={s.actions.manageMethods} />}
            {m.method === 'cheque' && <ChequeRules siteId={siteId} rule={m} settings={s} canManage={s.actions.manageMethods} />}
          </li>
        ))}
      </ul>
      {error ? <ProblemAlert error={error} className="mt-3" /> : null}
      <p className="mt-3 text-xs text-muted">{t('sites:methods.proofNote')}</p>
    </Panel>
  );
}

/**
 * Office cash rules the society sets for itself: the most one receipt may take and where and when
 * residents can pay. The demo starts at 50,000; it is the society's setting, not a platform limit.
 */
function CashRules({ rule, pending, onSave }: { rule: MethodRule; pending: boolean; onSave: (patch: { maxAmount: string; counter: string }) => Promise<void> }) {
  const { t } = useT();
  const [max, setMax] = useState(rule.maxAmount?.amount ?? '');
  const [counter, setCounter] = useState(rule.counter ?? '');
  return (
    <div className="grid gap-3 @2xl:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] @2xl:items-end" data-testid="cash-rules">
      <AmountInput label={t('collections:settings.methodsLimit')} value={max} onChange={setMax} testId="cash-limit" />
      <PlainTextField label={t('collections:settings.methodsCounter')} value={counter} onChange={setCounter} testId="cash-counter" />
      <Button variant="secondary" isPending={pending} isDisabled={!max.trim() || counter.trim().length < 5} onPress={() => void onSave({ maxAmount: max, counter })} data-testid="cash-rules-save">
        {t('collections:settings.methodsSave')}
      </Button>
      <p className="text-xs text-muted @2xl:col-span-3">{t('collections:settings.methodsLimitHelp')}</p>
    </div>
  );
}

// Gate S.1 adds its documents (vouchers, instructions, cheque acknowledgements, batches, certificates …).
const KINDS: DocumentKind[] = ['invoice', 'opening', 'creditNote', 'payment', 'receipt', 'submission', 'run', 'voucher', 'transfer', 'cheque', 'batch', 'clearance', 'approval', 'ownershipTransfer'];

/** Document numbering per issuing entity and site, the posting policy and invoice grouping. */
/**
 * D-46 (Gate S.1): whether single office cash also needs a second person's count. Bulk office
 * collections always do. The default keeps C.2's receipt at once (the owner's decision is open).
 */
function CashWitness({ settings }: { siteId: string; settings: CollectionSettings; canManage: boolean }) {
  const { t } = useT();
  // D-46 (owner decision at the D.1/S.1 integration): every office cash payment is counted by a second
  // person before its receipt; the site keeps its own cash limit (above), not a choice of witnessing.
  return (
    <div className="space-y-2 rounded-tile bg-sunken/40 p-3" data-testid="cash-witness" data-policy={settings.cashWitness}>
      <p className="text-sm text-text">{t('finance:settings.witnessFixed')}</p>
    </div>
  );
}

/** BILL-012 cheque rules (Gate S.1): payee wording, the verified account cheques go into, post-dating. */
function ChequeRules({ siteId, rule, settings, canManage }: { siteId: string; rule: MethodRule; settings: CollectionSettings; canManage: boolean }) {
  const { t } = useT();
  const toast = useToast();
  const mutation = useApiMutation<unknown>();
  const q = useSettings(siteId);
  const [payableTo, setPayableTo] = useState(rule.cheque?.payableTo ?? settings.legalEntityName);
  const [account, setAccount] = useState<string | null>(rule.cheque?.depositAccountId ?? settings.payee?.id ?? null);
  const [days, setDays] = useState(String(rule.cheque?.maxPostDatedDays ?? 0));
  const [error, setError] = useState<unknown>(null);
  if (!canManage) return <p className="text-xs text-muted">{t('finance:settings.chequeRules', { payee: rule.cheque?.payableTo ?? '—', days: rule.cheque?.maxPostDatedDays ?? 0 })}</p>;
  return (
    <div className="grid gap-3 @2xl:grid-cols-3 @2xl:items-end" data-testid="cheque-rules">
      <PlainTextField label={t('finance:settings.payableTo')} value={payableTo} onChange={setPayableTo} testId="cheque-payable" />
      <SelectControl label={t('finance:settings.depositAccount')} value={account} onChange={setAccount} options={settings.payee ? [{ id: settings.payee.id, label: `${settings.payee.bankName} · ${settings.payee.iban}` }] : []} testId="cheque-account" />
      <PlainTextField label={t('finance:settings.postDated')} value={days} onChange={setDays} inputMode="numeric" dir="ltr" testId="cheque-days" />
      <Button
        variant="secondary"
        isPending={mutation.isPending}
        onPress={async () => {
          setError(null);
          try {
            await mutation.mutateAsync({ method: 'PATCH', path: `/sites/${siteId}/cheque-rules`, body: { enabled: rule.enabled, payableTo, depositAccountId: account, maxPostDatedDays: Number(days) } });
            toast.success(t('finance:settings.chequeSaved'));
            void q.refetch();
          } catch (e) {
            setError(e);
          }
        }}
        data-testid="cheque-rules-save"
      >
        {t('collections:settings.methodsSave')}
      </Button>
      {error ? <ProblemAlert error={error} /> : null}
    </div>
  );
}

/** D-42 (Gate S.1): the transfer fee as versioned rates, each with its bylaw; a change starts on a future date. */
function TransferFees({ siteId, settings }: { siteId: string; settings: CollectionSettings }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const mutation = useApiMutation<unknown>();
  const q = useSettings(siteId);
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState('2026-12-01');
  const [bylaw, setBylaw] = useState('');
  const [error, setError] = useState<unknown>(null);
  return (
    <Panel title={t('finance:settings.feesTitle')} description={t('finance:settings.feesHint')}>
      <ul className="space-y-2 text-sm" data-testid="transfer-fees">
        {settings.transferFees.map((r) => (
          <li key={r.version} className="rounded-tile border border-border px-3 py-2">
            {t('finance:settings.feeLine', { version: r.version, amount: fmt.money(r.amount), from: fmt.date(r.from), to: r.to ? fmt.date(r.to) : '—' })} · <bdi>{r.bylawRef}</bdi>
          </li>
        ))}
      </ul>
      {settings.actions.manageNumbering && (
        <div className="mt-4 grid gap-3 @2xl:grid-cols-3 @2xl:items-end">
          <AmountInput label={t('finance:settings.feeAmount')} value={amount} onChange={setAmount} />
          <PlainTextField label={t('finance:settings.feeFrom')} value={from} onChange={setFrom} dir="ltr" />
          <PlainTextField label={t('finance:settings.feeBylaw')} value={bylaw} onChange={setBylaw} />
          <Button
            variant="secondary"
            isDisabled={!amount.trim() || bylaw.trim().length < 5}
            onPress={async () => {
              setError(null);
              try {
                await mutation.mutateAsync({ method: 'POST', path: `/sites/${siteId}/transfer-fees`, body: { amount, from, bylawRef: bylaw } });
                toast.success(t('finance:settings.feeSaved'));
                void q.refetch();
              } catch (e) {
                setError(e);
              }
            }}
          >
            {t('finance:settings.feeAdd')}
          </Button>
        </div>
      )}
      {error ? <ProblemAlert error={error} className="mt-3" /> : null}
    </Panel>
  );
}

export function BillingControlsTab({ siteId }: { siteId: string }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const toast = useToast();
  const q = useSettings(siteId);
  const mutation = useApiMutation<CollectionSettings>();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={6} />;
  const s = q.data;
  const numbering = draft ?? { code: s.numbering.code, ...Object.fromEntries(KINDS.map((k) => [k, s.numbering[k]])) };
  const chosen = roles ?? s.posting.roles;
  const save = async (path: string, body: unknown, done: string) => {
    setError(null);
    try {
      await mutation.mutateAsync({ method: 'PATCH', path, body });
      toast.success(done);
      setDraft(null);
      setRoles(null);
      setReason('');
    } catch (e) {
      setError(e);
    }
  };
  return (
    <div className="space-y-5" data-testid="billing-controls">
      <Panel title={t('collections:settings.postingTitle')} description={t('collections:settings.postingHint')}>
        <fieldset className="space-y-2" disabled={!s.actions.managePosting} data-testid="posting-policy">
          <legend className="sr-only">{t('collections:settings.postingTitle')}</legend>
          {s.posting.eligibleRoles.map((r) => (
            <PlainCheckbox key={r.id} isSelected={chosen.includes(r.id)} isDisabled={!s.actions.managePosting} onChange={(on) => setRoles(on ? [...chosen, r.id] : chosen.filter((x) => x !== r.id))} testId={`posting-role-${r.id}`}>
              {dt(r.labelKey)}
            </PlainCheckbox>
          ))}
        </fieldset>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted">
          <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t('collections:settings.postingRule')}
        </p>
        {s.posting.updatedByName && <p className="mt-1 text-xs text-muted">{t('collections:settings.postingUpdated', { name: s.posting.updatedByName })}</p>}
        {s.actions.managePosting && roles && (
          <div className="mt-4 space-y-3">
            <PlainTextField label={t('collections:settings.reason')} value={reason} onChange={setReason} testId="posting-reason" />
            <Button variant="primary" isPending={mutation.isPending} onPress={() => void save(`/sites/${siteId}/posting-policy`, { roles: chosen, reason }, t('collections:settings.postingSaved'))} data-testid="posting-save">
              {t('collections:settings.save')}
            </Button>
          </div>
        )}
      </Panel>
      <Panel title={t('collections:settings.numberingTitle')} description={t('collections:settings.numberingHint')}>
        <div className="grid gap-4 @3xl:grid-cols-2" data-testid="numbering">
          <PlainTextField label={t('collections:settings.code')} value={numbering.code ?? ''} isDisabled={!s.actions.manageNumbering} onChange={(v) => setDraft({ ...numbering, code: v })} />
          {KINDS.map((k) => (
            <PlainTextField key={k} label={t(`collections:settings.kinds.${k}`)} value={numbering[k] ?? ''} isDisabled={!s.actions.manageNumbering} onChange={(v) => setDraft({ ...numbering, [k]: v })} testId={`numbering-${k}`} />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">{t('collections:settings.tokens')}</p>
        {s.actions.manageNumbering && draft && (
          <Button variant="primary" className="mt-4" isPending={mutation.isPending} onPress={() => void save(`/sites/${siteId}/numbering`, draft, t('collections:settings.numberingSaved'))} data-testid="numbering-save">
            {t('collections:settings.save')}
          </Button>
        )}
      </Panel>
      <TransferFees siteId={siteId} settings={s} />
      <Panel title={t('collections:settings.groupingTitle')}>
        <p className="text-sm text-text">{t(`collections:settings.grouping.${s.invoiceGrouping}`)}</p>
        <p className="mt-2 text-xs text-muted">{t('collections:settings.groupingHint')}</p>
      </Panel>
      {error ? <ProblemAlert error={error} /> : null}
      {!s.actions.managePosting && !s.actions.manageNumbering && <InlineAlert tone="info">{t('collections:settings.readOnly')}</InlineAlert>}
    </div>
  );
}
