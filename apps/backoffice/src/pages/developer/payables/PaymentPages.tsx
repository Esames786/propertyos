import { ApiError, PAYMENT_FILTERS, type BillView, type PaymentFilter, type PaymentsList, type PaymentView } from '@repo/contracts';
import { Button, ConfirmDialog, Drawer, dynamicT, EmptyState, ErrorState, FilterPills, InlineAlert, Link, NotFoundState, PageHeader, PlainTextField, useApiQuery, useKeyedCreate, useNavigation, useQueryParam, useQueryParams, useT, useToast } from '@repo/ui';
import { Ban, CheckCircle2, Send, Wallet } from 'lucide-react';
import { useState } from 'react';
import {
  Amount,
  BankLine,
  BlockedNote,
  Boundary,
  EntityBar,
  Fact,
  FactGrid,
  fieldErrorKey,
  History,
  KEEP,
  Loading,
  PAY,
  PayNav,
  PaymentBadge,
  ProblemAlert,
  ProvisionalNotice,
  Ref,
  SettlementBadge,
  useAction,
  useEntityParam,
  useProblemToast,
  useSocietyFormat,
  WRAP,
} from './apkit';

/**
 * Gate E.8 SUP-006 supplier payment instructions (provisional, PARTIAL; owner decision E-18).
 * A payment is an instruction and nothing more: prepared by the maker, approved by someone else, then
 * marked "Sent (simulated)". It is always "Not settled — no evidence": no bank, no transfer, no
 * settlement, and the bill's obligation never goes down. Deep-linkable: `?record=<instruction>`.
 */
export default function PaymentsPage() {
  const { t } = useT();
  const dt = dynamicT(t);
  const fmt = useSocietyFormat();
  const set = useQueryParams();
  const [entity, setEntity] = useEntityParam();
  const [stateParam] = useQueryParam('state');
  const [record, setRecord] = useQueryParam('record');
  const state: PaymentFilter = (PAYMENT_FILTERS as readonly string[]).includes(stateParam ?? '') ? (stateParam as PaymentFilter) : 'all';
  const q = useApiQuery<PaymentsList>({ method: 'GET', path: '/supplier-payments', query: { ...(entity ? { entity } : {}), ...(state !== 'all' ? { state } : {}) } }, KEEP);
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="pay-payments">
      <PageHeader title={t('payables:payments.title')} description={t('payables:payments.intro')} breadcrumbs={[{ label: t('payables:bills.title'), href: PAY.bills() }]} />
      <PayNav current="payments" />
      <ProvisionalNotice screen="payments" />
      <EntityBar scope={d.scope} onChange={setEntity} />
      <Boundary />
      <FilterPills label={t('payables:payments.filterLabel')} options={PAYMENT_FILTERS.map((f) => ({ id: f, label: dt(`payables:payments.filter.${f}`), count: d.counts[f] }))} value={state} onChange={(v) => set({ state: v === 'all' ? null : v })} testId="pay-payment-filter" />
      {d.items.length === 0 ? (
        <EmptyState title={t('payables:payments.none')} body={t('payables:payments.noneHint')} actions={<Link href={PAY.bills({ state: 'approved' })}>{t('payables:payments.toApproved')}</Link>} />
      ) : (
        <ul className="space-y-2" data-testid="pay-payment-list">
          {d.items.map((x) => (
            <li key={x.id} className="rounded-tile border border-border/70 bg-panel p-3 shadow-card" data-testid="pay-payment" data-id={x.id} data-state={x.state}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <Link href={PAY.payments({ record: x.id })} className="min-w-0 max-w-full font-semibold" data-testid="pay-payment-link">
                    <Ref value={x.ref} />
                  </Link>
                  <p className="text-sm break-words">
                    <bdi>{x.supplierName}</bdi> · {t('payables:payments.forBill')}{' '}
                    <Link href={PAY.bill(x.billId)}>
                      <Ref value={x.billRef} />
                    </Link>
                  </p>
                  <p className="text-xs text-muted">{t('payables:payments.preparedBy', { name: x.preparedByName, date: fmt.date(x.preparedAt) })}</p>
                </div>
                <Amount value={x.amount} className="text-base font-semibold" />
              </div>
              <p className="mt-2 flex flex-wrap gap-1.5">
                <PaymentBadge state={x.state} />
                <SettlementBadge />
              </p>
            </li>
          ))}
        </ul>
      )}
      {record && <PaymentDrawer id={record} onClose={() => setRecord(null)} />}
    </div>
  );
}

/** SUP-006 the instruction itself: approve (someone else), mark sent (simulated), cancel with a reason. */
export function PaymentDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<PaymentView>({ method: 'GET', path: `/supplier-payments/${id}` });
  const act = useAction<PaymentView>();
  const [cancelling, setCancelling] = useState(false);
  const x = q.data;
  return (
    <Drawer isOpen onOpenChange={(o) => !o && onClose()} title={t('payables:payment.title')} subtitle={x ? <Ref value={x.ref} /> : undefined} size="lg" testId="pay-payment-drawer">
      {q.isError ? (
        q.error instanceof ApiError && q.error.problem.status === 404 ? <NotFoundState /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !x ? (
        <Loading lines={6} />
      ) : (
        <div className="space-y-4" data-testid="pay-payment-view" data-state={x.state}>
          <p className="flex flex-wrap gap-1.5">
            <PaymentBadge state={x.state} />
            <SettlementBadge />
          </p>
          <InlineAlert tone="warning" title={t('payables:payment.notSettledTitle')} data-testid="pay-not-settled">
            {t('payables:payment.notSettledBody')}
          </InlineAlert>
          <BlockedNote reason={x.blocked} />
          <FactGrid testId="pay-payment-facts">
            <Fact label={t('payables:payment.amount')}>
              <Amount value={x.amount} className="font-semibold" />
            </Fact>
            <Fact label={t('payables:payment.bill')}>
              <Link href={PAY.bill(x.billId)}>
                <Ref value={x.billRef} />
              </Link>{' '}
              · <Amount value={x.billTotal} />
            </Fact>
            <Fact label={t('payables:bills.supplier')}>
              <Link href={PAY.supplier(x.supplierId)}>
                <bdi>{x.supplierName}</bdi>
              </Link>
            </Fact>
            <Fact label={t('payables:payment.payee')}>
              <BankLine bank={x.payee} hidden={x.bankHidden} />
            </Fact>
            <Fact label={t('payables:payment.payFrom')}>
              {x.bankHidden ? (
                <span className="text-muted">{t('payables:bank.hidden')}</span>
              ) : x.payFrom ? (
                <span>
                  <bdi>{x.payFrom.title}</bdi> · <bdi dir="ltr">{x.payFrom.maskedNumber}</bdi> <span className="text-xs text-muted">({t('payables:bank.sample')})</span>
                </span>
              ) : (
                '—'
              )}
            </Fact>
            <Fact label={t('payables:payment.prepared')}>
              <bdi>{x.preparedByName}</bdi> · {fmt.date(x.preparedAt)}
            </Fact>
            {x.approvedByName && (
              <Fact label={t('payables:payment.approved')}>
                <bdi>{x.approvedByName}</bdi> · {fmt.date(x.approvedAt!)}
              </Fact>
            )}
            {x.sentByName && (
              <Fact label={t('payables:payment.sent')}>
                <bdi>{x.sentByName}</bdi> · {fmt.date(x.sentAt!)}
              </Fact>
            )}
            {x.cancelledByName && (
              <Fact label={t('payables:payment.cancelled')}>
                <bdi>{x.cancelledByName}</bdi> · {fmt.date(x.cancelledAt!)} {x.cancelReason ? <span className="block text-xs text-muted">“<bdi>{x.cancelReason}</bdi>”</span> : null}
              </Fact>
            )}
            {x.note && (
              <Fact label={t('payables:payment.note')}>
                <bdi>{x.note}</bdi>
              </Fact>
            )}
          </FactGrid>
          {act.error ? <ProblemAlert error={act.error} /> : null}
          <div className="flex flex-wrap gap-2" data-testid="pay-payment-actions">
            {x.actions.approve && (
              <Button className={WRAP} variant="primary" icon={CheckCircle2} isPending={act.pending} onPress={() => void act.run(`/supplier-payments/${x.id}/approve`, {}, t('payables:payment.approvedToast', { ref: x.ref }))} data-testid="pay-payment-approve">
                {t('payables:payment.approve')}
              </Button>
            )}
            {x.actions.send && (
              <Button className={WRAP} variant="primary" icon={Send} isPending={act.pending} onPress={() => void act.run(`/supplier-payments/${x.id}/send`, {}, t('payables:payment.sentToast', { ref: x.ref }))} data-testid="pay-payment-send">
                {t('payables:payment.send')}
              </Button>
            )}
            {x.actions.cancel && (
              <Button className={WRAP} variant="quiet" icon={Ban} onPress={() => setCancelling(true)} data-testid="pay-payment-cancel">
                {t('payables:payment.cancel')}
              </Button>
            )}
          </div>
          <section aria-label={t('payables:history.title')} className="space-y-2">
            <h3 className="text-sm font-semibold">{t('payables:history.title')}</h3>
            <History events={x.history} />
          </section>
          <ConfirmDialog
            isOpen={cancelling}
            onOpenChange={setCancelling}
            title={t('payables:payment.cancelTitle', { ref: x.ref })}
            effect={t('payables:payment.cancelEffect')}
            confirmLabel={t('payables:payment.cancel')}
            destructive
            reasonLabel={t('payables:common.reason')}
            onConfirm={async (reason) => !!(await act.run(`/supplier-payments/${x.id}/cancel`, { reason }, t('payables:payment.cancelledToast', { ref: x.ref })))}
          />
        </div>
      )}
    </Drawer>
  );
}

/** Prepare an instruction for an approved bill (at most what is still instructable). */
export function NewPaymentDrawer({ bill, onClose }: { bill: BillView; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const problem = useProblemToast();
  const { navigate } = useNavigation();
  const create = useKeyedCreate<PaymentView>('spi');
  const [amount, setAmount] = useState(bill.instructable.amount);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const save = async () => {
    setError(null);
    try {
      const x = await create.send({ method: 'POST', path: `/supplier-bills/${bill.id}/payments`, body: { amount, ...(note.trim() ? { note } : {}) } });
      toast.success(t('payables:payment.preparedToast', { ref: x.ref }));
      navigate(PAY.payments({ record: x.id }));
    } catch (e) {
      setError(e);
      if (!(e instanceof ApiError) || !Object.keys(e.problem.errors ?? {}).length) problem(e);
    }
  };
  return (
    <Drawer
      isOpen
      onOpenChange={(o) => !o && onClose()}
      title={t('payables:payment.newTitle')}
      subtitle={<Ref value={bill.ref} />}
      testId="pay-new-payment"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button className={WRAP} variant="quiet" onPress={onClose}>
            {t('payables:common.cancel')}
          </Button>
          <Button className={WRAP} variant="primary" icon={Wallet} isPending={create.isPending} onPress={() => void save()} data-testid="pay-new-payment-save">
            {t('payables:payment.prepare')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="warning" title={t('payables:payment.notSettledTitle')}>
          {t('payables:payment.instructionOnly')}
        </InlineAlert>
        <p className="text-sm">
          <bdi className="font-medium">{bill.supplierName}</bdi> · {t('payables:bill.total')}: <Amount value={bill.total} />
        </p>
        <p className="text-sm text-muted" data-testid="pay-new-payment-left">
          {t('payables:bill.instructable', { amount: fmt.money(bill.instructable) })}
        </p>
        <PlainTextField label={t('payables:payment.amount')} value={amount} onChange={setAmount} inputMode="decimal" dir="ltr" errorKey={fieldErrorKey(error, 'amount')} testId="pay-new-payment-amount" />
        <PlainTextField label={t('payables:payment.note')} value={note} onChange={setNote} optional errorKey={fieldErrorKey(error, 'note')} testId="pay-new-payment-note" />
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}
