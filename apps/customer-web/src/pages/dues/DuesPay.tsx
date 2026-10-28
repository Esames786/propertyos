import { ApiError, type DuesPayInfo, type ResidentPayee, type ResidentSubmissionDetail } from '@repo/contracts';
import { formatIban } from '@repo/i18n';
import { Badge, Button, ConfirmDialog, dynamicT, ErrorState, IconButton, InlineAlert, Link, PlainTextArea, PlainTextField, SegmentedControl, useApiMutation, useApiQuery, useNavigation, useT, useToast } from '@repo/ui';
import { emitTourEvent } from '@repo/ui/onboarding';
import { BadgeCheck, Banknote, CalendarClock, Copy, CreditCard, FileUp, Hourglass, Landmark, QrCode, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { encode } from 'uqr';
import { DUES } from '../../nav.config';
import { Amount, PortalSkeleton, usePortalFormat } from '../portal/shared';
import { DemoLinkNote, DEMO_TODAY } from './kit';

const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 5 * 1024 * 1024;
type Method = 'bank_transfer' | 'office_cash' | 'online';

/**
 * PORTAL-007 + PORTAL-008, dues edition (Gate C.2 reference experience 1). How to pay the exact
 * total: the association's verified account (copy buttons, a bidi-safe IBAN, the reference to quote,
 * a QR of the instruction), the office counter when the society takes cash, and online payment
 * shown honestly as not available yet. Then the proof of transfer, which is recorded as "Pending
 * verification": nothing is paid until the office verifies it.
 */
export default function DuesPay({ mode = 'pay' }: { mode?: 'pay' | 'details' }) {
  const { t } = useT();
  const q = useApiQuery<DuesPayInfo>({ method: 'GET', path: '/portal/dues/pay' });
  useEffect(() => emitTourEvent('dues.pay.opened'), []);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <PortalSkeleton title={t('dues:pay.title')} />;
  return <PayView data={q.data} mode={mode} />;
}

function PayView({ data, mode }: { data: DuesPayInfo; mode: 'pay' | 'details' }) {
  const { t } = useT();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const [method, setMethod] = useState<Method>('bank_transfer');
  const p = data.position;
  return (
    <div className="@container space-y-6" data-testid="dues-pay-page" data-mode={mode}>
      <header className="space-y-2">
        <h1 id="page-title" tabIndex={-1} className="text-figure-sm leading-tight font-bold tracking-tight text-text outline-none sm:text-4xl">
          {mode === 'details' ? t('dues:pay.detailsTitle') : t('dues:pay.title')}
        </h1>
        <p className="text-base text-muted">{mode === 'details' ? t('dues:pay.detailsIntro') : t('dues:pay.intro')}</p>
      </header>

      <section aria-label={t('dues:pay.amountTitle')} className="rounded-card bg-primary p-5 text-on-primary shadow-raised sm:p-6" data-testid="pay-amount">
        <p className="text-sm text-on-primary/80">{t('dues:pay.amountTitle')}</p>
        <p className="mt-1 text-figure leading-none font-bold tracking-tight sm:text-figure-lg">
          <Amount value={p.totalPayable.amount} />
        </p>
        <p className="mt-2 text-sm text-on-primary/85">
          {Number(p.credit.amount) > 0
            ? t('dues:pay.amountBreakdownCredit', { current: fmt.money(p.current?.open.amount ?? '0.00'), previous: fmt.money(p.previousBalance.amount), credit: fmt.money(p.credit.amount) })
            : t('dues:pay.amountBreakdown', { current: fmt.money(p.current?.open.amount ?? '0.00'), previous: fmt.money(p.previousBalance.amount) })}
        </p>
        {p.dueOn && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-on-primary/85">
            <CalendarClock aria-hidden className="size-4" />
            {t('dues:home.dueOn', { date: fmt.date(p.dueOn) })}
          </p>
        )}
      </section>

      {data.pending.length > 0 && (
        <InlineAlert tone="info" title={t('dues:pay.pendingTitle')} data-testid="pay-pending">
          <ul className="space-y-1">
            {data.pending.map((s) => (
              <li key={s.id}>
                <Link href={DUES.submission(s.id)}>{t('dues:pay.pendingLine', { amount: fmt.money(s.amount.amount), date: fmt.instant(s.submittedAt), state: t(`dues:proofState.${s.state}`) })}</Link>
              </li>
            ))}
          </ul>
        </InlineAlert>
      )}

      <SegmentedControl
        label={t('dues:pay.methodLabel')}
        value={method}
        onChange={setMethod}
        testId="pay-method"
        options={[
          { id: 'bank_transfer', label: t('dues:method.bank_transfer') },
          { id: 'office_cash', label: t('dues:method.office_cash') },
          { id: 'online', label: t('dues:method.online') },
        ]}
      />

      {method === 'bank_transfer' ? (
        data.methods.bankTransfer && data.payee ? (
          <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-2">
            <PayeeCard payee={data.payee} />
            {mode === 'pay' ? <ProofForm payee={data.payee} defaultAmount={p.totalPayable.amount} /> : (
              <div className="flex flex-col justify-center gap-3 rounded-card border border-dashed border-border p-5">
                <p className="text-sm text-text">{t('dues:pay.detailsNext')}</p>
                <Link href={DUES.pay} variant="plain" className="inline-flex min-h-11 items-center gap-2 self-start rounded-control bg-primary px-4 text-sm font-semibold text-on-primary">
                  <Upload aria-hidden className="size-4" />
                  {t('dues:pay.sendProof')}
                </Link>
              </div>
            )}
          </div>
        ) : (
          <InlineAlert tone="warning">{t('dues:pay.noPayee')}</InlineAlert>
        )
      ) : method === 'office_cash' ? (
        <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" data-testid="pay-cash">
          <h2 className="flex items-center gap-2 text-lg font-bold text-text">
            <Banknote aria-hidden className="size-5 text-primary" />
            {t('dues:pay.cashTitle')}
          </h2>
          {data.methods.officeCash.enabled ? (
            <>
              <p className="text-sm text-text">{t('dues:pay.cashBody', { counter: data.methods.officeCash.counter ?? '' })}</p>
              {data.methods.officeCash.maxAmount && <p className="text-sm text-muted">{t('dues:pay.cashLimit', { max: fmt.money(data.methods.officeCash.maxAmount.amount) })}</p>}
              <p className="text-sm text-muted">{t('dues:pay.cashReceipt')}</p>
            </>
          ) : (
            <p className="text-sm text-text" data-testid="pay-cash-off">{t('dues:pay.cashOff')}</p>
          )}
        </section>
      ) : (
        <section className="space-y-2 rounded-card border border-dashed border-border p-5" data-testid="pay-online">
          <h2 className="flex items-center gap-2 text-lg font-bold text-text">
            <CreditCard aria-hidden className="size-5 text-muted" />
            {t('dues:pay.onlineTitle')}
          </h2>
          <p className="text-sm text-text">{t('dues:pay.onlineBody')}</p>
          <Badge tone="neutral" icon={Hourglass}>{t('dues:pay.onlineLater', { gate: data.methods.online.gate })}</Badge>
        </section>
      )}
      <DemoLinkNote />
    </div>
  );
}

function CopyRow({ label, value, display, testId }: { label: string; value: string; display?: string; testId: string }) {
  const { t } = useT();
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('dues:pay.copied', { label }));
    } catch {
      toast.error(t('dues:pay.copyFailed'));
    }
  };
  // A <dl> group: the term and its value sit directly in this div; the copy button belongs to the value.
  return (
    <div className="rounded-tile bg-sunken/60 px-4 py-3" data-testid={testId}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-base font-semibold [overflow-wrap:anywhere] text-text">
          <bdi dir="ltr" className="ltr-ref">{display ?? value}</bdi>
        </span>
        <IconButton label={t('dues:pay.copy', { label })} icon={Copy} onPress={() => void copy()} data-testid={`${testId}-copy`} />
      </dd>
    </div>
  );
}

/** The association's verified account (never the platform's), with what to quote and a QR of the instruction. */
function PayeeCard({ payee }: { payee: ResidentPayee }) {
  const { t } = useT();
  const fmt = usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="space-y-4 rounded-card bg-panel p-5 shadow-card" data-testid="payee-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-text">
          <Landmark aria-hidden className="size-5 text-primary" />
          {t('dues:pay.payeeTitle')}
        </h2>
        <Badge tone="success" icon={BadgeCheck}>{t('dues:pay.verified')}</Badge>
      </div>
      <p className="flex items-start gap-2 text-sm text-text">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
        {t('dues:pay.payeeOf', { entity: payee.legalEntityName, date: payee.verifiedOn ? fmt.date(payee.verifiedOn) : '' })}
      </p>
      {payee.changedOn && (
        <InlineAlert tone="warning" title={t('dues:pay.changedTitle', { date: fmt.date(payee.changedOn) })} data-testid="payee-changed">
          <p>{t('dues:pay.changedBody')}</p>
        </InlineAlert>
      )}
      <dl className="space-y-2">
        <CopyRow label={t('dues:pay.accountTitle')} value={payee.accountTitle} testId="payee-title" />
        <CopyRow label={t('dues:pay.iban')} value={payee.iban} display={formatIban(payee.iban)} testId="payee-iban" />
        <CopyRow label={t('dues:pay.reference')} value={payee.reference} testId="payee-reference" />
        <CopyRow label={t('dues:pay.amount')} value={payee.amount.amount} display={fmt.money(payee.amount.amount)} testId="payee-amount" />
      </dl>
      <p className="text-sm text-muted">{t('dues:pay.bank', { bank: payee.bankName, branch: payee.branch })}</p>
      <PaymentQr payload={payee.qrPayload} />
      <p className="flex items-start gap-2 rounded-tile border border-warning/40 bg-warning-soft/40 px-3 py-2 text-xs text-text">
        <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        {t('dues:pay.onlyThisAccount')}
      </p>
    </section>
  );
}

/** A QR of the payment instruction (fictional account; labelled so it is never mistaken for a real one). */
function PaymentQr({ payload }: { payload: string }) {
  const { t } = useT();
  const qr = useMemo(() => encode(payload, { ecc: 'M', border: 2 }), [payload]);
  const path = useMemo(() => {
    const parts: string[] = [];
    qr.data.forEach((row, y) => row.forEach((on, x) => on && parts.push(`M${x},${y}h1v1h-1z`)));
    return parts.join('');
  }, [qr]);
  return (
    <figure className="flex flex-wrap items-center gap-4 rounded-tile border border-border p-4" data-testid="payee-qr">
      <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label={t('dues:pay.qrLabel')} className="size-36 shrink-0 rounded-sm bg-white text-black" shapeRendering="crispEdges">
        <path d={path} fill="currentColor" />
      </svg>
      <figcaption className="min-w-0 flex-1 space-y-1 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-text">
          <QrCode aria-hidden className="size-4" />
          {t('dues:pay.qrTitle')}
        </span>
        <span className="block text-xs text-muted">{t('dues:pay.qrDemo')}</span>
      </figcaption>
    </figure>
  );
}

function ProofForm({ payee, defaultAmount }: { payee: ResidentPayee; defaultAmount: string }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const toast = useToast();
  const { navigate } = useNavigation();
  const titleId = useId();
  const [amount, setAmount] = useState(defaultAmount);
  const [date, setDate] = useState(DEMO_TODAY);
  const [reference, setReference] = useState(payee.reference);
  const [bank, setBank] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const mutation = useApiMutation<ResidentSubmissionDetail>();

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFileError(null);
    if (f && !FILE_TYPES.includes(f.type)) setFileError(t('dues:pay.fileType'));
    else if (f && f.size > MAX_BYTES) setFileError(t('dues:pay.fileSize'));
    setFile(f);
  };

  const send = async (confirmDuplicate = false) => {
    setError(null);
    if (!file) {
      setFileError(t('dues:pay.fileRequired'));
      return;
    }
    try {
      const result = await mutation.mutateAsync({
        method: 'POST',
        path: '/portal/dues/submissions',
        body: { amount, transferDate: date, bankReference: reference, payerBank: bank, note, file: { name: file.name, type: file.type, size: file.size }, confirmDuplicate },
      });
      toast.success(t('dues:pay.sent'));
      navigate(`${DUES.submission(result.submission.id)}?sent=1`);
    } catch (e) {
      if (e instanceof ApiError && e.problem.code === 'possible_duplicate') {
        setDuplicateOf(e.problem.errors?.file?.[0]?.params?.ref ?? '');
        return;
      }
      setError(e);
    }
  };

  const fieldErrors = error instanceof ApiError ? error.problem.errors ?? {} : {};
  const fieldError = (k: string) => (fieldErrors[k]?.[0] ? dt(fieldErrors[k]![0]!.code, fieldErrors[k]![0]!.params) : undefined);

  return (
    <section aria-labelledby={titleId} className="space-y-4 rounded-card bg-panel p-5 shadow-card" data-testid="proof-form">
      <div>
        <h2 id={titleId} className="flex items-center gap-2 text-lg font-bold text-text">
          <FileUp aria-hidden className="size-5 text-primary" />
          {t('dues:pay.proofTitle')}
        </h2>
        <p className="mt-0.5 text-sm text-muted">{t('dues:pay.proofIntro')}</p>
      </div>
      <PlainTextField label={t('dues:pay.paidAmount')} value={amount} onChange={setAmount} inputMode="decimal" dir="ltr" testId="proof-amount" {...(fieldError('amount') ? { description: fieldError('amount') } : {})} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text">{t('dues:pay.transferDate')}</span>
        <input type="date" value={date} max={DEMO_TODAY} onChange={(e) => setDate(e.target.value)} className="ltr-input min-h-11 w-full rounded-control border border-border-control bg-panel px-3 py-2 text-sm text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" data-testid="proof-date" />
        {fieldError('transferDate') && <span className="text-sm text-error">{fieldError('transferDate')}</span>}
      </label>
      <PlainTextField label={t('dues:pay.yourReference')} description={fieldError('bankReference') ?? t('dues:pay.yourReferenceHelp')} value={reference} onChange={setReference} dir="ltr" testId="proof-reference" />
      <PlainTextField label={t('dues:pay.yourBank')} value={bank} onChange={setBank} optional testId="proof-bank" />
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-text" id={`${titleId}-file`}>{t('dues:pay.file')}</span>
        <div className="flex flex-wrap items-center gap-3 rounded-tile border-2 border-dashed border-border-control p-4">
          <Button variant="secondary" icon={Upload} onPress={() => input.current?.click()} data-testid="proof-file-pick">
            {file ? t('dues:pay.fileChange') : t('dues:pay.filePick')}
          </Button>
          <span className="min-w-0 flex-1 text-sm text-muted" aria-live="polite">
            {file ? <><bdi dir="ltr" className="ltr-ref font-medium text-text">{file.name}</bdi> · {t('dues:pay.fileKb', { kb: Math.max(1, Math.round(file.size / 1024)) })}</> : t('dues:pay.fileHint')}
          </span>
          <input ref={input} type="file" accept={FILE_TYPES.join(',')} onChange={pick} aria-labelledby={`${titleId}-file`} className="sr-only" data-testid="proof-file" />
        </div>
        {(fileError ?? fieldError('file')) && <p className="text-sm text-error" role="alert">{fileError ?? fieldError('file')}</p>}
      </div>
      <PlainTextArea label={t('dues:pay.note')} value={note} onChange={setNote} optional rows={2} testId="proof-note" />
      {error && !(error instanceof ApiError && Object.keys(fieldErrors).length) ? (
        <InlineAlert tone="error" role="alert">{error instanceof ApiError ? dt(error.problem.messageKey) : t('errors:network.unavailable')}</InlineAlert>
      ) : null}
      <p className="rounded-tile bg-info-soft px-3 py-2 text-sm text-info">{t('dues:pay.pendingRule')}</p>
      <Button variant="primary" size="lg" icon={Upload} className="w-full justify-center" isPending={mutation.isPending} isDisabled={!!fileError} onPress={() => void send()} data-testid="proof-send">
        {t('dues:pay.send')}
      </Button>
      <ConfirmDialog
        isOpen={duplicateOf !== null}
        onOpenChange={(o) => !o && setDuplicateOf(null)}
        title={t('dues:pay.duplicateTitle')}
        effect={t('dues:pay.duplicateBody', { ref: duplicateOf ?? '' })}
        confirmLabel={t('dues:pay.duplicateConfirm')}
        onConfirm={async () => {
          setDuplicateOf(null);
          await send(true);
        }}
      />
    </section>
  );
}
