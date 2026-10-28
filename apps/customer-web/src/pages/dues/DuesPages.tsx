import { ApiError, type DuesBillDetail, type DuesBills, type Receipt, type ResidentBill, type ResidentSubmissionDetail, type Statement } from '@repo/contracts';
import { Badge, Breadcrumbs, Button, dynamicT, EmptyState, ErrorState, InlineAlert, Link, NotFoundState, PlainTextArea, PlainTextField, useApiMutation, useApiQuery, useQueryParam, useT, useToast } from '@repo/ui';
import { ArrowRight, CheckCircle2, FileText, Printer, ReceiptText, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { DUES } from '../../nav.config';
import { Amount, PortalSkeleton, usePortalFormat } from '../portal/shared';
import { BillStatusChip, DemoLinkNote, DEMO_TODAY, ProofStateChip, ProofStepper } from './kit';

const useFmt = () => usePortalFormat(`${DEMO_TODAY}T09:00:00Z`);

function NotYours({ error, children }: { error: unknown; children: ReactNode }) {
  if (error instanceof ApiError && [403, 404].includes(error.problem.status)) return <NotFoundState headingLevel={1} />;
  return <>{children}</>;
}

const settlementStatus = (b: ResidentBill) => (b.overdue ? 'overdue' : b.settlement === 'paid' || b.settlement === 'credited' ? 'paid' : b.settlement === 'partially_paid' ? 'partially_paid' : 'unpaid');

/** PORTAL-004, dues edition: every bill of the resident's own liability, newest first, with what is left. */
export function DuesBillsPage() {
  const { t } = useT();
  const fmt = useFmt();
  const q = useApiQuery<DuesBills>({ method: 'GET', path: '/portal/dues/bills' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <PortalSkeleton title={t('dues:bills.title')} />;
  const { position, bills } = q.data;
  return (
    <div className="@container space-y-6" data-testid="dues-bills">
      <header className="space-y-1">
        <h1 id="page-title" tabIndex={-1} className="text-figure-sm font-bold tracking-tight text-text outline-none">{t('dues:bills.title')}</h1>
        <p className="text-sm text-muted">{t('dues:bills.intro', { total: fmt.money(position.totalPayable.amount) })}</p>
      </header>
      {bills.length === 0 ? (
        <EmptyState title={t('dues:bills.emptyTitle')} body={t('dues:bills.emptyBody')} />
      ) : (
        <ul className="space-y-3">
          {bills.map((b) => (
            <li key={b.invoiceId}>
              <Link href={DUES.bill(b.invoiceId)} variant="plain" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card bg-panel p-4 shadow-card hover:bg-raised sm:p-5" data-testid="dues-bill-row" data-source={b.source}>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold tracking-[0.08em] text-muted uppercase">{b.source === 'opening_balance' ? t('dues:bills.opening') : t('dues:bills.monthly')}</span>
                  <span className="block text-lg font-bold text-text">{b.source === 'opening_balance' ? t('dues:bills.openingTitle', { date: fmt.date(b.issuedOn) }) : fmt.monthYear(`${b.period}-01`)}</span>
                  <span className="block text-xs text-muted"><bdi dir="ltr" className="ltr-ref">{b.ref}</bdi> · <bdi dir="ltr" className="ltr-ref">{b.flats.join(', ')}</bdi> · {t('dues:home.dueOn', { date: fmt.date(b.dueOn) })}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="text-xl font-bold text-text"><Amount value={b.total.amount} /></span>
                  {Number(b.open.amount) > 0 && Number(b.open.amount) !== Number(b.total.amount) && <span className="text-xs text-muted">{t('dues:bills.left', { amount: fmt.money(b.open.amount) })}</span>}
                  <BillStatusChip status={settlementStatus(b)} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <DemoLinkNote />
    </div>
  );
}

/** PORTAL-005 bill breakdown: the resident's charges by flat and category, credits, payments, what is left. */
export function DuesBillPage() {
  const { t } = useT();
  const fmt = useFmt();
  const [record] = useQueryParam('record');
  const q = useApiQuery<DuesBillDetail>(record ? { method: 'GET', path: `/portal/dues/bills/${record}` } : null);
  if (!record) return <NotFoundState headingLevel={1} />;
  if (q.isError) return <NotYours error={q.error}><ErrorState error={q.error} onRetry={() => void q.refetch()} /></NotYours>;
  if (!q.data) return <PortalSkeleton title={t('dues:bill.title')} />;
  const { bill, position, payments } = q.data;
  return (
    <div className="@container space-y-6" data-testid="dues-bill-detail" data-invoice={bill.ref}>
      <Breadcrumbs items={[{ label: t('dues:nav.bills'), href: DUES.bills }, { label: bill.ref }]} />
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 id="page-title" tabIndex={-1} className="text-figure-sm font-bold tracking-tight text-text outline-none">
            {bill.source === 'opening_balance' ? t('dues:bills.openingTitle', { date: fmt.date(bill.issuedOn) }) : t('dues:bill.title', { period: fmt.monthYear(`${bill.period}-01`) })}
          </h1>
          <p className="text-sm text-muted"><bdi dir="ltr" className="ltr-ref">{bill.ref}</bdi> · {t('dues:bill.issued', { date: fmt.date(bill.issuedOn) })} · {t('dues:home.dueOn', { date: fmt.date(bill.dueOn) })}</p>
        </div>
        <BillStatusChip status={settlementStatus(bill)} />
      </header>
      <section aria-label={t('dues:bill.charges')} className="rounded-card bg-panel p-5 shadow-card">
        <table className="w-full text-sm" data-testid="dues-bill-lines">
          <caption className="sr-only">{t('dues:bill.charges')}</caption>
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="py-2 pe-3 text-start font-medium">{t('dues:bill.charge')}</th>
              <th scope="col" className="py-2 text-end font-medium">{t('dues:bill.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((l) => (
              <tr key={l.lineId} className="border-b border-border/60" data-testid="dues-bill-line" data-category={l.category ?? l.kind}>
                <th scope="row" className="py-2.5 pe-3 text-start font-normal text-text">
                  {l.kind === 'opening_balance' ? t('dues:bill.opening') : t(`billing:categories.${l.category ?? 'maintenance'}`)}
                  <span className="block text-xs text-muted">{t('dues:home.flat')} <bdi dir="ltr" className="ltr-ref">{l.unitCode}</bdi>{Number(l.credited.amount) > 0 && <> · {t('dues:bill.credited', { amount: fmt.money(l.credited.amount) })}</>}{Number(l.paid.amount) > 0 && <> · {t('dues:bill.paidPart', { amount: fmt.money(l.paid.amount) })}</>}</span>
                </th>
                <td className="py-2.5 text-end font-semibold text-text"><Amount value={l.amount.amount} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-3 pe-3 text-start font-semibold text-text">{t('dues:bill.total')}</th>
              <td className="pt-3 text-end text-lg font-bold text-text"><Amount value={bill.total.amount} /></td>
            </tr>
            {Number(bill.credited.amount) > 0 && (
              <tr><th scope="row" className="pt-1 pe-3 text-start font-normal text-muted">{t('dues:bill.creditNotes')}</th><td className="pt-1 text-end text-success">− <Amount value={bill.credited.amount} /></td></tr>
            )}
            {Number(bill.paid.amount) > 0 && (
              <tr><th scope="row" className="pt-1 pe-3 text-start font-normal text-muted">{t('dues:bill.paid')}</th><td className="pt-1 text-end text-success">− <Amount value={bill.paid.amount} /></td></tr>
            )}
            <tr>
              <th scope="row" className="pt-2 pe-3 text-start font-semibold text-text">{t('dues:bill.left')}</th>
              <td className="pt-2 text-end font-bold text-text" data-testid="dues-bill-open"><Amount value={bill.open.amount} /></td>
            </tr>
          </tfoot>
        </table>
      </section>
      <section aria-label={t('dues:bill.position')} className="space-y-2 rounded-card border border-border bg-raised p-5 text-sm" data-testid="dues-bill-position">
        <p className="font-semibold text-text">{t('dues:bill.position')}</p>
        <p className="text-text">{t('dues:bill.positionLine', { previous: fmt.money(position.previousBalance.amount), current: fmt.money(position.current?.open.amount ?? '0.00'), total: fmt.money(position.totalPayable.amount) })}</p>
        <p className="text-xs text-muted">{t('dues:bill.positionRule')}</p>
      </section>
      {payments.length > 0 && (
        <section aria-label={t('dues:bill.payments')} className="space-y-2">
          <h2 className="text-lg font-bold text-text">{t('dues:bill.payments')}</h2>
          <ul className="space-y-2">
            {payments.map((p) => (
              <li key={p.receiptId}>
                <Link href={DUES.receipt(p.receiptId)} variant="plain" className="flex items-center gap-3 rounded-tile border border-success/30 bg-success-soft/40 p-4">
                  <ReceiptText aria-hidden className="size-5 text-success" />
                  <span className="min-w-0 flex-1 text-sm text-text">{t('dues:home.receipt', { ref: p.receiptRef })} · {fmt.date(p.receivedOn)}</span>
                  <Amount value={p.amount.amount} className="font-semibold text-success" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {Number(position.totalPayable.amount) > 0 && (
        <Link href={DUES.pay} variant="plain" className="inline-flex min-h-12 items-center gap-2 rounded-control bg-primary px-5 text-base font-semibold text-on-primary" data-testid="dues-bill-pay">
          {t('dues:home.pay', { amount: fmt.money(position.totalPayable.amount) })}
          <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
        </Link>
      )}
    </div>
  );
}

/** Payments, receipts and proofs (PORTAL-004 history): what was paid, what was sent, where each stands. */
export function DuesHistoryPage() {
  const { t } = useT();
  const fmt = useFmt();
  const q = useApiQuery<DuesBills>({ method: 'GET', path: '/portal/dues/bills' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <PortalSkeleton title={t('dues:history.title')} />;
  const { payments, submissions } = q.data;
  return (
    <div className="@container space-y-6" data-testid="dues-history">
      <header className="space-y-1">
        <h1 id="page-title" tabIndex={-1} className="text-figure-sm font-bold tracking-tight text-text outline-none">{t('dues:history.title')}</h1>
        <p className="text-sm text-muted">{t('dues:history.intro')}</p>
      </header>
      <section aria-labelledby="h-receipts" className="space-y-3">
        <h2 id="h-receipts" className="text-lg font-bold text-text">{t('dues:history.receipts')}</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted">{t('dues:history.noReceipts')}</p>
        ) : (
          <ul className="space-y-2">
            {payments.map((p) => (
              <li key={p.id}>
                <Link href={DUES.receipt(p.receiptId)} variant="plain" className="flex flex-wrap items-center gap-3 rounded-tile border border-success/30 bg-success-soft/40 p-4 hover:bg-success-soft" data-testid="history-receipt" data-ref={p.receiptRef}>
                  <CheckCircle2 aria-hidden className="size-5 text-success" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-text">{t('dues:home.receipt', { ref: p.receiptRef })}</span>
                    <span className="block text-xs text-muted">{t(`dues:method.${p.method}`)} · {fmt.date(p.receivedOn)}{Number(p.unapplied.amount) > 0 && <> · {t('dues:history.credit', { amount: fmt.money(p.unapplied.amount) })}</>}</span>
                  </span>
                  <Amount value={p.amount.amount} className="font-semibold text-success" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="h-proofs" className="space-y-3">
        <h2 id="h-proofs" className="text-lg font-bold text-text">{t('dues:history.proofs')}</h2>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted">{t('dues:history.noProofs')}</p>
        ) : (
          <ul className="space-y-2">
            {submissions.map((s) => (
              <li key={s.id}>
                <Link href={DUES.submission(s.id)} variant="plain" className="flex flex-wrap items-center gap-3 rounded-tile border border-border bg-panel p-4 hover:bg-raised" data-testid="history-proof" data-state={s.state}>
                  <FileText aria-hidden className="size-5 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-text">{t('dues:home.proofOf', { amount: fmt.money(s.amount.amount) })}</span>
                    <span className="block text-xs text-muted"><bdi dir="ltr" className="ltr-ref">{s.ref}</bdi> · {t('dues:home.sentOn', { date: fmt.instant(s.submittedAt) })}</span>
                  </span>
                  <ProofStateChip state={s.state} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <DemoLinkNote />
    </div>
  );
}

/**
 * PORTAL-028 a proof's status: where it stands (never "Paid" before verification), every version
 * sent, what the office asked for (with a resubmission that keeps history), the rejection reason,
 * and the receipt once verified.
 */
export function DuesSubmissionPage({ submissionId }: { submissionId: string }) {
  const { t } = useT();
  const fmt = useFmt();
  const [sent] = useQueryParam('sent');
  const q = useApiQuery<ResidentSubmissionDetail>({ method: 'GET', path: `/portal/dues/submissions/${submissionId}` });
  if (q.isError) return <NotYours error={q.error}><ErrorState error={q.error} onRetry={() => void q.refetch()} /></NotYours>;
  if (!q.data) return <PortalSkeleton title={t('dues:proof.title')} />;
  const { submission: s, timeline, canResubmit } = q.data;
  return (
    <div className="@container space-y-6" data-testid="dues-submission" data-state={s.state}>
      <Breadcrumbs items={[{ label: t('dues:nav.history'), href: DUES.history }, { label: s.ref }]} />
      {sent === '1' && s.state === 'submitted' && (
        <InlineAlert tone="success" title={t('dues:proof.sentTitle')} data-testid="proof-sent">
          <p>{t('dues:proof.sentBody')}</p>
        </InlineAlert>
      )}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 id="page-title" tabIndex={-1} className="text-figure-sm font-bold tracking-tight text-text outline-none">{t('dues:proof.title')}</h1>
          <p className="text-sm text-muted"><bdi dir="ltr" className="ltr-ref">{s.ref}</bdi> · <Amount value={s.amount.amount} /> · {t('dues:proof.transferOn', { date: fmt.date(s.transferDate) })}</p>
        </div>
        <ProofStateChip state={s.state} />
      </header>
      <section className="rounded-card bg-panel p-5 shadow-card">
        <ProofStepper state={s.state} resubmitted={s.versions.length > 1} />
        <p className="mt-4 text-sm text-text" data-testid="proof-explain">{t(`dues:proof.explain.${s.state}`)}</p>
      </section>
      {s.state === 'needs_information' && s.request && (
        <InlineAlert tone="warning" title={t('dues:proof.askedTitle')} data-testid="proof-request">
          <p><bdi>{t('billing:quote', { text: s.request })}</bdi></p>
        </InlineAlert>
      )}
      {s.state === 'rejected' && s.rejectionReason && (
        <InlineAlert tone="error" title={t('dues:proof.rejectedTitle')} data-testid="proof-rejected">
          <p><bdi>{t('billing:quote', { text: s.rejectionReason })}</bdi></p>
          <p className="mt-1">{t('dues:proof.rejectedNext')}</p>
        </InlineAlert>
      )}
      {s.state === 'verified' && s.receiptId && (
        <Link href={DUES.receipt(s.receiptId)} variant="plain" className="flex items-center gap-3 rounded-card border border-success/30 bg-success-soft/50 p-5" data-testid="proof-receipt">
          <ReceiptText aria-hidden className="size-6 text-success" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-text">{t('dues:proof.receiptReady', { ref: s.receiptRef ?? '' })}</span>
            <span className="block text-sm text-muted">{t('dues:proof.receiptOpen')}</span>
          </span>
          <ArrowRight aria-hidden className="size-5 text-success rtl:rotate-180" />
        </Link>
      )}
      {canResubmit && <Resubmit submissionId={s.id} defaults={{ amount: s.amount.amount, date: s.transferDate, reference: s.bankReference }} />}
      <section aria-labelledby="h-timeline" className="space-y-3 rounded-card bg-panel p-5 shadow-card">
        <h2 id="h-timeline" className="text-base font-bold text-text">{t('dues:proof.timeline')}</h2>
        <ol className="space-y-2">
          {[...timeline].reverse().map((e, i) => (
            <li key={`${e.at}-${i}`} className="text-sm">
              <span className="font-medium text-text">{t(`dues:proof.steps.${e.step}`)}</span> <span className="text-xs text-muted">· {fmt.instantTime(e.at)}</span>
              {e.note && <span className="block text-xs text-muted"><bdi>{t('billing:quote', { text: e.note })}</bdi></span>}
            </li>
          ))}
        </ol>
        {s.versions.length > 1 && (
          <p className="text-xs text-muted">{t('dues:proof.versions', { count: s.versions.length, files: s.versions.map((v) => v.fileName).join(', ') })}</p>
        )}
      </section>
    </div>
  );
}

function Resubmit({ submissionId, defaults }: { submissionId: string; defaults: { amount: string; date: string; reference: string } }) {
  const { t } = useT();
  const dt = dynamicT(t);
  const toast = useToast();
  const mutation = useApiMutation<ResidentSubmissionDetail>();
  const [amount, setAmount] = useState(defaults.amount);
  const [reference, setReference] = useState(defaults.reference);
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<unknown>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className="space-y-4 rounded-card border-2 border-warning/40 bg-panel p-5 shadow-card" aria-label={t('dues:proof.resubmitTitle')} data-testid="proof-resubmit">
      <h2 className="text-lg font-bold text-text">{t('dues:proof.resubmitTitle')}</h2>
      <PlainTextField label={t('dues:pay.paidAmount')} value={amount} onChange={setAmount} inputMode="decimal" dir="ltr" testId="resubmit-amount" />
      <PlainTextField label={t('dues:pay.yourReference')} value={reference} onChange={setReference} dir="ltr" testId="resubmit-reference" />
      <div className="flex flex-wrap items-center gap-3 rounded-tile border-2 border-dashed border-border-control p-4">
        <Button variant="secondary" icon={Upload} onPress={() => input.current?.click()} data-testid="resubmit-file-pick">{file ? t('dues:pay.fileChange') : t('dues:pay.filePick')}</Button>
        <span className="min-w-0 flex-1 text-sm text-muted" aria-live="polite">{file ? <bdi dir="ltr" className="ltr-ref font-medium text-text">{file.name}</bdi> : t('dues:pay.fileHint')}</span>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e: ChangeEvent<HTMLInputElement>) => setFile(e.target.files?.[0] ?? null)} aria-label={t('dues:pay.file')} className="sr-only" data-testid="resubmit-file" />
      </div>
      <PlainTextArea label={t('dues:pay.note')} value={note} onChange={setNote} optional rows={2} testId="resubmit-note" />
      {error ? <InlineAlert tone="error" role="alert">{error instanceof ApiError ? dt(error.problem.messageKey) : t('errors:network.unavailable')}</InlineAlert> : null}
      <Button
        variant="primary"
        icon={Upload}
        isPending={mutation.isPending}
        isDisabled={!file}
        onPress={async () => {
          setError(null);
          try {
            await mutation.mutateAsync({ method: 'POST', path: `/portal/dues/submissions/${submissionId}/resubmit`, body: { amount, transferDate: defaults.date, bankReference: reference, note, file: { name: file!.name, type: file!.type, size: file!.size } } });
            toast.success(t('dues:proof.resubmitted'));
          } catch (e) {
            setError(e);
          }
        }}
        data-testid="resubmit-send"
      >
        {t('dues:proof.resubmit')}
      </Button>
    </section>
  );
}

/** PORTAL-010, dues edition: the receipt, issued only after verification (or at the office counter). */
export function DuesReceiptPage() {
  const { t } = useT();
  const fmt = useFmt();
  const [record] = useQueryParam('record');
  const q = useApiQuery<Receipt>(record ? { method: 'GET', path: `/portal/dues/receipts/${record}` } : null);
  if (!record) return <NotFoundState headingLevel={1} />;
  if (q.isError) return <NotYours error={q.error}><ErrorState error={q.error} onRetry={() => void q.refetch()} /></NotYours>;
  if (!q.data) return <PortalSkeleton title={t('dues:receipt.title')} />;
  const r = q.data;
  return (
    <div className="@container space-y-5" data-testid="dues-receipt-page" data-ref={r.ref}>
      <Breadcrumbs items={[{ label: t('dues:nav.history'), href: DUES.history }, { label: r.ref }]} />
      <article className="mx-auto max-w-2xl space-y-5 rounded-card border border-border bg-panel p-6 shadow-card" aria-labelledby="page-title">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <Badge tone="success" icon={CheckCircle2}>{t('dues:receipt.paid')}</Badge>
            <h1 id="page-title" tabIndex={-1} className="mt-2 text-xl font-bold text-text outline-none">{t('dues:receipt.title')}</h1>
            <p className="text-sm text-muted"><bdi>{r.legalEntityName}</bdi> · <bdi>{r.siteName}</bdi></p>
          </div>
          <p className="text-end text-sm"><span className="block text-muted">{t('dues:receipt.number')}</span><bdi dir="ltr" className="ltr-ref font-semibold text-text">{r.ref}</bdi></p>
        </header>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">{t('dues:receipt.from')}</dt><dd className="font-semibold text-text"><bdi>{r.payerName}</bdi></dd></div>
          <div><dt className="text-muted">{t('dues:receipt.account')}</dt><dd className="font-semibold text-text"><bdi dir="ltr" className="ltr-ref">{r.accountNo}</bdi> · <bdi dir="ltr" className="ltr-ref">{r.flats.join(', ')}</bdi></dd></div>
          <div><dt className="text-muted">{t('dues:receipt.method')}</dt><dd className="font-semibold text-text">{t(`dues:method.${r.method}`)}</dd></div>
          <div><dt className="text-muted">{t('dues:receipt.received')}</dt><dd className="font-semibold text-text">{fmt.date(r.receivedOn)}</dd></div>
        </dl>
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-y border-border py-4">
          <span className="text-base font-semibold text-text">{t('dues:receipt.amount')}</span>
          <span className="text-2xl font-bold text-success" data-testid="receipt-amount"><Amount value={r.amount.amount} /></span>
        </p>
        <ul className="space-y-1 text-sm" data-testid="receipt-settles">
          {r.allocations.map((a) => (
            <li key={a.lineId} className="flex flex-wrap justify-between gap-x-3">
              <span className="text-text">{a.kind === 'opening_balance' ? t('dues:bill.opening') : t(`billing:categories.${a.category ?? 'maintenance'}`)} · <bdi dir="ltr" className="ltr-ref">{a.unitCode}</bdi> · {fmt.monthYear(`${a.period}-01`)}</span>
              <Amount value={a.amount.amount} className="font-medium" />
            </li>
          ))}
          {Number(r.unapplied.amount) > 0 && (
            <li className="flex justify-between gap-3 text-info"><span>{t('dues:receipt.credit')}</span><Amount value={r.unapplied.amount} /></li>
          )}
        </ul>
        <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span>{t('dues:receipt.issued', { date: fmt.instant(r.issuedAt) })} · {t('dues:receipt.demo')}</span>
          <Button variant="secondary" size="sm" icon={Printer} onPress={() => window.print()}>{t('dues:receipt.print')}</Button>
        </footer>
      </article>
    </div>
  );
}

/** PORTAL-029 statement: the resident's own lines and payments since go-live (previous balance kept apart). */
export function DuesStatementPage() {
  const { t } = useT();
  const fmt = useFmt();
  const q = useApiQuery<Statement>({ method: 'GET', path: '/portal/dues/statement' });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <PortalSkeleton title={t('dues:statement.title')} />;
  const s = q.data;
  const steps = [
    { id: 'charges', label: t('dues:statement.charges'), value: s.periodCharges.amount },
    { id: 'credits', label: t('dues:statement.payments'), value: s.periodCredits.amount },
    { id: 'closing', label: t('dues:statement.closing'), value: s.closingBalance.amount },
  ];
  return (
    <div className="@container space-y-6" data-testid="dues-statement">
      <header className="space-y-1">
        <h1 id="page-title" tabIndex={-1} className="text-figure-sm font-bold tracking-tight text-text outline-none">{t('dues:statement.title')}</h1>
        <p className="text-sm text-muted">{t('dues:statement.intro', { from: fmt.date(s.from), to: fmt.date(s.to) })} · <bdi dir="ltr" className="ltr-ref">{s.accountNo}</bdi></p>
      </header>
      <dl className="grid grid-cols-1 gap-3 @lg:grid-cols-3">
        {steps.map((x) => (
          <div key={x.id} className={x.id === 'closing' ? 'rounded-tile bg-primary p-4 text-on-primary' : 'rounded-tile bg-panel p-4 shadow-card'} data-testid={`statement-${x.id}`}>
            <dt className={x.id === 'closing' ? 'text-xs text-on-primary/80' : 'text-xs text-muted'}>{x.label}</dt>
            <dd className="mt-1 text-xl font-bold"><Amount value={x.value} /></dd>
          </div>
        ))}
      </dl>
      {Number(s.closingBalance.amount) < 0 && <p className="text-sm text-info">{t('dues:statement.inCredit', { amount: fmt.money(s.closingBalance.amount.replace('-', '')) })}</p>}
      <ol className="space-y-2" data-testid="statement-entries">
        {s.entries.map((e) => (
          <li key={`${e.kind}-${e.refId}`} className="flex flex-wrap items-center justify-between gap-3 rounded-tile border border-border bg-panel px-4 py-3" data-testid="statement-entry" data-kind={e.kind}>
            <span className="min-w-0">
              <span className="block font-medium text-text">{t(`dues:statement.kinds.${e.kind}`, { period: e.period ? fmt.monthYear(`${e.period}-01`) : '' })}</span>
              <span className="block text-xs text-muted">{fmt.date(e.on)} · <bdi dir="ltr" className="ltr-ref">{e.ref}</bdi>{e.flats.length > 0 && <> · <bdi dir="ltr" className="ltr-ref">{e.flats.join(', ')}</bdi></>}</span>
            </span>
            <span className="text-end">
              <span className={e.credit ? 'block font-semibold text-success' : 'block font-semibold text-text'}>{e.credit ? '− ' : ''}<Amount value={(e.debit ?? e.credit)!.amount} /></span>
              <span className="block text-xs text-muted">{t('dues:statement.balance')} <Amount value={e.balance.amount} /></span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
