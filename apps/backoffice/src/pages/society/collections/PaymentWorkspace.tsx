import type { PaymentDetail, Receipt } from '@repo/contracts';
import { Badge, Breadcrumbs, Button, buttonClass, cn, DateTime, ErrorState, InlineAlert, KeyValueList, Link, Money, UrlTabs, useApiMutation, useApiQuery, useT, useToast } from '@repo/ui';
import { FileText, Link2, Link2Off, PiggyBank, Printer, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { COLLECTIONS, SOCIETY } from '../../../nav.config';
import { Loading, moneyMinus, ProblemAlert, useSocietyFormat } from '../kit';
import { AuditList } from '../parts';
import { AllocationTable, MethodBadge, VerificationBadge } from './ckit';

/**
 * FIN-006 Payment 360: one verified payment and everything connected to it — who paid, for which
 * account and flats, how the money was confirmed (bank line, by hand with the reason, or the
 * counter), what it settled, its receipt, its place in reconciliation and its history. Unapplied
 * credit can be applied to the same payer's open lines (never another payer's).
 */
export default function PaymentWorkspace({ paymentId }: { paymentId: string }) {
  const query = useApiQuery<PaymentDetail>({ method: 'GET', path: `/payments/${paymentId}` });
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return <Loading lines={12} />;
  return <PaymentView data={query.data} />;
}

function PaymentView({ data }: { data: PaymentDetail }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const p = data.payment;
  const flats = [...new Set(p.allocations.map((a) => a.unitCode))];
  return (
    <div className="@container space-y-6" data-testid="payment-workspace" data-ref={p.ref}>
      <Breadcrumbs items={[{ label: t('nav:pages.payments'), href: COLLECTIONS.payments() }, { label: p.ref }]} />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-semibold tracking-[0.12em] text-accent uppercase">{t('collections:payment.eyebrow')}</p>
          <h1 className="text-2xl font-bold tracking-tight text-text sm:text-figure-sm">
            <bdi>{p.payerName}</bdi> · <Money value={p.amount} />
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <bdi dir="ltr" className="ltr-ref">{p.ref}</bdi>
            <span aria-hidden>·</span>
            <Link href={SOCIETY.account(p.billingAccountId)}><bdi dir="ltr" className="ltr-ref">{p.accountNo}</bdi></Link>
            {flats.map((f) => (
              <span key={f} className="inline-flex items-center gap-2">
                <span aria-hidden>·</span>
                <bdi dir="ltr" className="ltr-ref">{f}</bdi>
              </span>
            ))}
          </p>
          <span className="flex flex-wrap gap-1.5">
            <MethodBadge method={p.method} />
            <VerificationBadge verification={p.verification} />
            {Number(p.unapplied.amount) > 0 && <Badge tone="info" icon={PiggyBank}>{t('collections:payments.credit', { amount: fmt.money(p.unapplied) })}</Badge>}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={COLLECTIONS.statement(p.billingAccountId)} variant="plain" className={buttonClass('secondary')} data-testid="payment-statement">
            {t('collections:payment.statement')}
          </Link>
          <Link href={`${COLLECTIONS.payment(p.id, 'receipt')}`} variant="plain" className={cn(buttonClass('primary'), 'gap-2')}>
            <ReceiptText aria-hidden className="size-4" />
            {t('collections:payment.receipt', { ref: data.receipt.ref })}
          </Link>
        </div>
      </header>
      <UrlTabs
        label={t('collections:payment.tabs')}
        items={[
          { id: 'overview', label: t('collections:payment.tab.overview') },
          { id: 'allocations', label: t('collections:payment.tab.allocations') },
          { id: 'receipt', label: t('collections:payment.tab.receipt') },
          { id: 'reconciliation', label: t('collections:payment.tab.reconciliation') },
          { id: 'activity', label: t('collections:payment.tab.activity') },
        ]}
      >
        {(tab) =>
          tab === 'allocations' ? (
            <Allocations data={data} />
          ) : tab === 'receipt' ? (
            <ReceiptView receipt={data.receipt} />
          ) : tab === 'reconciliation' ? (
            <Reconciliation data={data} />
          ) : tab === 'activity' ? (
            <Activity accountId={p.billingAccountId} />
          ) : (
            <Overview data={data} />
          )
        }
      </UrlTabs>
    </div>
  );
}

function Overview({ data }: { data: PaymentDetail }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const p = data.payment;
  return (
    <div className="grid gap-5 @4xl:grid-cols-2">
      <section className="rounded-card bg-panel p-5 shadow-card" aria-label={t('collections:payment.tab.overview')}>
        <KeyValueList
          items={[
            { label: t('collections:payment.received'), value: fmt.date(p.receivedOn) },
            { label: t('collections:payment.amount'), value: <Money value={p.amount} className="font-semibold" /> },
            { label: t('collections:payment.settled'), value: <Money value={moneyMinus(p.amount, p.unapplied)} /> },
            { label: t('collections:payment.unapplied'), value: <Money value={p.unapplied} /> },
            { label: t('collections:payment.verifiedBy'), value: <span><bdi>{p.verifiedByName}</bdi> · <DateTime value={p.verifiedAt} style="dateTime" /></span> },
            { label: t('collections:payment.accountBalance'), value: <Money value={data.accountBalance} className="font-semibold" /> },
          ]}
        />
      </section>
      <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" aria-label={t('collections:payment.sourceTitle')}>
        <h2 className="text-base font-bold text-text">{t('collections:payment.sourceTitle')}</h2>
        {p.source.kind === 'submission' ? (
          <p className="text-sm text-text">
            {t('collections:payment.fromProof')}{' '}
            <Link href={COLLECTIONS.review(p.source.submissionId)}><bdi dir="ltr" className="ltr-ref">{p.source.submissionRef}</bdi></Link>
          </p>
        ) : p.source.kind === 'cheque' ? (
          <p className="text-sm text-text">
            <Link href={`/backoffice/fin/office-collections?tab=cheques&cheque=${p.source.chequeId}`}>{t('collections:payment.fromCheque', { ref: p.source.chequeRef })}</Link>
          </p>
        ) : p.source.kind === 'batch' ? (
          <p className="text-sm text-text">
            <Link href={`/backoffice/fin/office-collections?batch=${p.source.batchId}`}>{t('collections:payment.fromBatch', { ref: p.source.batchRef, collector: p.verifiedByName, witness: p.witness?.byName ?? '' })}</Link>
          </p>
        ) : (
          <p className="text-sm text-text">{t('collections:payment.fromCounter')}{p.source.note ? <> · <bdi>{t('billing:quote', { text: p.source.note })}</bdi></> : null}</p>
        )}
        {p.reversal && (
          <InlineAlert tone="warning" title={t('collections:payment.reversedTitle')} data-testid="payment-reversed">
            <p>{t('collections:payment.reversedBody', { date: fmt.date(p.reversal.on), ref: p.reversal.approvalRef, approver: p.reversal.approvedByName })}</p>
            <p><bdi>{t('billing:quote', { text: p.reversal.reason })}</bdi></p>
          </InlineAlert>
        )}
        {p.exception && (
          <InlineAlert tone="warning" title={t('collections:payment.exceptionTitle')} data-testid="payment-exception">
            <p>{t('collections:payment.exceptionBody', { requested: p.exception.requestedByName, approved: p.exception.approvedByName, list: p.exception.missing.map((m) => t(`collections:review.field.${m}`)).join(', ') })}</p>
            <p><bdi>{t('billing:quote', { text: p.exception.reason })}</bdi></p>
          </InlineAlert>
        )}
        {p.overrideReason && (
          <InlineAlert tone="info" title={t('collections:payment.overrideTitle')}>
            <p><bdi>{t('billing:quote', { text: p.overrideReason })}</bdi></p>
          </InlineAlert>
        )}
        <ul className="flex flex-wrap gap-2 pt-1">
          {[...new Set(p.allocations.map((a) => a.invoiceId))].map((id) => {
            const ref = p.allocations.find((a) => a.invoiceId === id)!.invoiceRef;
            return (
              <li key={id}>
                <Link href={SOCIETY.invoice(id)} variant="plain" className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-border px-3 text-xs font-medium text-text hover:bg-raised">
                  <FileText aria-hidden className="size-3.5" />
                  <bdi dir="ltr" className="ltr-ref">{ref}</bdi>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Allocations({ data }: { data: PaymentDetail }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const apply = useApiMutation<PaymentDetail>();
  const [error, setError] = useState<unknown>(null);
  const p = data.payment;
  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" aria-label={t('collections:payment.tab.allocations')}>
        <AllocationTable lines={p.allocations} unapplied={p.unapplied} label={t('collections:payment.tab.allocations')} testId="payment-allocations" />
      </section>
      {Number(p.unapplied.amount) > 0 && (
        <section className="space-y-3 rounded-card border border-info/30 bg-info-soft/40 p-5" aria-label={t('collections:payment.creditTitle')} data-testid="payment-credit">
          <h2 className="text-base font-bold text-text">{t('collections:payment.creditTitle')}</h2>
          {data.creditTargets.length ? (
            <>
              <p className="text-sm text-text">{t('collections:payment.creditTargets', { amount: fmt.money(p.unapplied), count: data.creditTargets.length })}</p>
              <AllocationTable lines={data.creditTargets} label={t('collections:payment.creditTitle')} testId="credit-targets" />
            </>
          ) : (
            <p className="text-sm text-text">{t('collections:payment.creditNothingOpen', { amount: fmt.money(p.unapplied) })}</p>
          )}
          {error ? <ProblemAlert error={error} /> : null}
          {data.actions.applyCredit && (
            <Button
              variant="primary"
              icon={PiggyBank}
              isPending={apply.isPending}
              onPress={async () => {
                setError(null);
                try {
                  await apply.mutateAsync({ method: 'POST', path: `/payments/${p.id}/apply-credit`, body: {} });
                  toast.success(t('collections:payment.creditApplied'));
                } catch (e) {
                  setError(e);
                }
              }}
              data-testid="apply-credit"
            >
              {t('collections:payment.applyCredit')}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

/** The receipt as issued (printable). Issued once, on verification or at the counter; never edited. */
export function ReceiptView({ receipt }: { receipt: Receipt }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <article className="mx-auto max-w-2xl space-y-5 rounded-card border border-border bg-panel p-6 shadow-card print:shadow-none" data-testid="receipt" aria-label={t('collections:receipt.title', { ref: receipt.ref })}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-accent uppercase">{t('collections:receipt.eyebrow')}</p>
          <h2 className="mt-1 text-xl font-bold text-text"><bdi>{receipt.legalEntityName}</bdi></h2>
          <p className="text-sm text-muted"><bdi>{receipt.siteName}</bdi></p>
        </div>
        <div className="text-end">
          <p className="text-sm text-muted">{t('collections:receipt.number')}</p>
          <p className="font-semibold text-text"><bdi dir="ltr" className="ltr-ref">{receipt.ref}</bdi></p>
        </div>
      </header>
      <KeyValueList
        items={[
          { label: t('collections:receipt.receivedFrom'), value: <bdi>{receipt.payerName}</bdi> },
          { label: t('collections:receipt.account'), value: <span><bdi dir="ltr" className="ltr-ref">{receipt.accountNo}</bdi> · <bdi dir="ltr" className="ltr-ref">{receipt.flats.join(', ')}</bdi></span> },
          { label: t('collections:receipt.method'), value: t(`collections:method.${receipt.method}`) },
          { label: t('collections:receipt.receivedOn'), value: fmt.date(receipt.receivedOn) },
          ...(receipt.bankReference ? [{ label: t('collections:receipt.reference'), value: <bdi dir="ltr" className="ltr-ref">{receipt.bankReference}</bdi> }] : []),
          { label: t('collections:receipt.amount'), value: <Money value={receipt.amount} className="text-lg font-bold" /> },
        ]}
      />
      <AllocationTable lines={receipt.allocations} unapplied={receipt.unapplied} label={t('collections:receipt.settles')} testId="receipt-allocations" />
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted">
        <span>{t('collections:receipt.issued')} <DateTime value={receipt.issuedAt} style="dateTime" /> · {t('collections:receipt.demo')}</span>
        <Button variant="secondary" size="sm" icon={Printer} onPress={() => window.print()}>{t('collections:receipt.print')}</Button>
      </footer>
    </article>
  );
}

function Reconciliation({ data }: { data: PaymentDetail }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const line = data.bankLine;
  return (
    <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" aria-label={t('collections:payment.tab.reconciliation')} data-testid="payment-reconciliation">
      {line ? (
        <>
          <p className="flex items-center gap-2 font-semibold text-success">
            <Link2 aria-hidden className="size-4" />
            {t('collections:payment.matched')}
          </p>
          <KeyValueList
            items={[
              { label: t('collections:bank.txn'), value: <bdi dir="ltr" className="ltr-ref">{line.bankTxnId}</bdi> },
              { label: t('collections:bank.valueDate'), value: fmt.date(line.valueDate) },
              { label: t('collections:bank.narration'), value: <bdi dir="ltr" className="ltr-ref">{line.narration}</bdi> },
              { label: t('collections:bank.amount'), value: <Money value={line.amount} /> },
            ]}
          />
          <Link href={COLLECTIONS.reconciliation}>{t('collections:payment.openReconciliation')}</Link>
        </>
      ) : (
        <p className="flex items-start gap-2 text-sm text-text">
          <Link2Off aria-hidden className="mt-0.5 size-4 text-muted" />
          {t('collections:payment.cashNoLine')}
        </p>
      )}
    </section>
  );
}

function Activity({ accountId }: { accountId: string }) {
  return <AuditList query={{ account: accountId }} testId="payment-activity" />;
}
