import type { AllocationPreview, BillingAccountDetail, BillingAccountRow, CollectionSettings, PaymentDetail, PaymentList } from '@repo/contracts';
import {
  Badge,
  Button,
  DirectionalIcon,
  Drawer,
  EmptyState,
  ErrorState,
  FilterPills,
  InlineAlert,
  Link,
  Money,
  PageHeader,
  SelectControl,
  PlainTextField,
  useApiMutation,
  useApiQuery,
  useQueryParam,
  useQueryParams,
  useSession,
  useT,
  useToast,
} from '@repo/ui';
import { Banknote, ChevronRight, Link2, Link2Off, PiggyBank, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Input, Label, SearchField } from 'react-aria-components';
import { COLLECTIONS } from '../../../nav.config';
import { AmountInput, Loading, ProblemAlert, useSocietyFormat } from '../kit';
import { AllocationTable, MethodBadge, VerificationBadge } from './ckit';
import { useSocietySiteId } from './site';

const METHODS = ['all', 'bank_transfer', 'office_cash'] as const;

/** FIN-005 payments: every verified payment, how it was confirmed, what it settled and its receipt. */
export default function PaymentsPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { can } = useSession();
  const [q] = useQueryParam('q');
  const [method] = useQueryParam('method');
  const [credit] = useQueryParam('credit');
  const [account] = useQueryParam('account');
  const [drawer] = useQueryParam('drawer');
  const setParams = useQueryParams();
  const [draft, setDraft] = useState(q ?? '');
  const filter = (METHODS as readonly string[]).includes(method ?? '') ? (method as (typeof METHODS)[number]) : 'all';
  useEffect(() => {
    const id = setTimeout(() => {
      if ((q ?? '') !== draft.trim()) setParams({ q: draft.trim() || null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  const list = useApiQuery<PaymentList>({ method: 'GET', path: '/payments', query: { q: q ?? undefined, method: filter, credit: credit ?? undefined, account: account ?? undefined } }, { placeholderData: (prev) => prev });
  return (
    <div className="@container space-y-6" data-testid="payments-page">
      <PageHeader
        title={t('nav:pages.payments')}
        description={t('collections:payments.intro')}
        actions={
          can('payment.receive') ? (
            <Button variant="primary" icon={Banknote} onPress={() => setParams({ drawer: 'office' })} data-testid="record-office-payment">
              {t('collections:office.open')}
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4 rounded-card border border-border/70 bg-panel p-4 shadow-card">
        <SearchField value={draft} onChange={setDraft} className="flex max-w-xl flex-col gap-1.5" data-testid="payments-search">
          <Label className="text-sm font-medium text-text">{t('collections:payments.search')}</Label>
          <div className="flex min-h-11 items-center gap-2 rounded-control border border-border-control bg-panel px-3 focus-within:outline-2 focus-within:outline-focus">
            <Search aria-hidden className="size-4 shrink-0 text-muted" />
            <Input placeholder={t('collections:payments.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden" />
          </div>
        </SearchField>
        <FilterPills label={t('collections:payments.method')} showLabel value={filter} testId="payments-method" onChange={(v) => setParams({ method: v === 'all' ? null : v })} options={METHODS.map((m) => ({ id: m, label: m === 'all' ? t('collections:payments.allMethods') : t(`collections:method.${m}`) }))} />
        {(credit === '1' || account) && (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {credit === '1' && <Badge tone="info" icon={PiggyBank}>{t('collections:payments.withCredit')}</Badge>}
            {account && <Badge tone="neutral" icon={Link2}>{t('collections:payments.oneAccount')}</Badge>}
            <Button variant="quiet" size="sm" onPress={() => setParams({ credit: null, account: null })}>{t('collections:payments.clear')}</Button>
          </p>
        )}
      </div>
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <Loading lines={8} />
      ) : list.data.items.length === 0 ? (
        <EmptyState title={t('collections:payments.emptyTitle')} body={t('collections:payments.emptyBody')} />
      ) : (
        <>
          <p className="text-sm text-muted" role="status" data-testid="payments-count">
            {t('collections:payments.count', { count: list.data.totals.count, amount: fmt.money(list.data.totals.amount), unapplied: fmt.money(list.data.totals.unapplied) })}
          </p>
          <ul className="space-y-2" data-testid="payments-list">
            {list.data.items.map((p) => (
              <li key={p.id}>
                <Link href={COLLECTIONS.payment(p.id)} variant="plain" className="grid gap-x-6 gap-y-2 rounded-tile border border-border/70 bg-panel p-4 shadow-card hover:bg-raised @3xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] @3xl:items-center" data-testid="payment-row" data-ref={p.ref}>
                  <span className="min-w-0">
                    <span className="block font-semibold text-text"><bdi>{p.payerName}</bdi></span>
                    <span className="block text-xs text-muted">
                      <bdi dir="ltr" className="ltr-ref">{p.ref}</bdi> · <bdi dir="ltr" className="ltr-ref">{p.flats.join(', ') || p.accountNo}</bdi> · {fmt.date(p.receivedOn)} · {t('collections:payments.receipt', { ref: p.receiptRef })}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <MethodBadge method={p.method} />
                    <VerificationBadge verification={p.verification} />
                    {p.method === 'bank_transfer' && (p.reconciled ? <Badge tone="success" icon={Link2}>{t('collections:payments.reconciled')}</Badge> : <Badge tone="warning" icon={Link2Off}>{t('collections:payments.awaitingLine')}</Badge>)}
                    {Number(p.unapplied.amount) > 0 && <Badge tone="info" icon={PiggyBank}>{t('collections:payments.credit', { amount: fmt.money(p.unapplied) })}</Badge>}
                  </span>
                  <span className="flex items-center justify-end gap-3">
                    <Money value={p.amount} className="text-lg font-bold" />
                    <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {can('payment.receive') && <OfficePaymentDrawer isOpen={drawer === 'office'} onClose={() => setParams({ drawer: null })} accountId={account} />}
    </div>
  );
}

/**
 * FIN-007 office payment: cash handed over at the society office. The site's method rules decide
 * whether cash is taken at all (and up to what amount); the counter confirms the money, so the
 * receipt is issued at once. What it settles is previewed first (the payer's own lines, oldest first).
 */
function OfficePaymentDrawer({ isOpen, onClose, accountId }: { isOpen: boolean; onClose: () => void; accountId: string | null }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const siteId = useSocietySiteId(isOpen);
  const settings = useApiQuery<CollectionSettings>({ method: 'GET', path: `/sites/${siteId}/collection-settings` }, { enabled: isOpen && !!siteId });
  const accounts = useApiQuery<BillingAccountRow[]>({ method: 'GET', path: '/billing-accounts', query: { status: 'all' } }, { enabled: isOpen });
  const [account, setAccount] = useState<string>(accountId ?? '');
  const [payer, setPayer] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<PaymentDetail | null>(null);
  const detail = useApiQuery<BillingAccountDetail>({ method: 'GET', path: `/billing-accounts/${account}` }, { enabled: isOpen && !!account });
  const record = useApiMutation<PaymentDetail>();
  useEffect(() => {
    if (accountId) setAccount(accountId);
  }, [accountId]);
  const payers = detail.data?.payers ?? [];
  useEffect(() => {
    if (payers.length && !payers.some((p) => p.partyId === payer)) setPayer(payers[0]!.partyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data]);
  const cash = settings.data?.methods.find((m) => m.method === 'office_cash');
  const close = () => {
    setDone(null);
    setError(null);
    setAmount('');
    setNote('');
    onClose();
  };
  const submit = async () => {
    setError(null);
    try {
      const result = await record.mutateAsync({ method: 'POST', path: '/payments/office', body: { accountId: account, payerPartyId: payer, amount, note } });
      setDone(result);
      toast.success(t('collections:office.done', { receipt: result.receipt.ref }));
    } catch (e) {
      setError(e);
    }
  };
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && close()}
      title={t('collections:office.title')}
      subtitle={t('collections:office.subtitle')}
      testId="office-drawer"
      banner={
        cash && !cash.enabled ? (
          <InlineAlert tone="warning" title={t('collections:office.disabledTitle')} data-testid="office-disabled">
            <p>{t('collections:office.disabledBody')}</p>
          </InlineAlert>
        ) : cash?.counter ? (
          <p className="text-sm text-muted">{t('collections:office.rules', { counter: cash.counter, max: cash.maxAmount ? fmt.money(cash.maxAmount) : '—' })}</p>
        ) : undefined
      }
      footer={
        done ? (
          <Button variant="primary" onPress={close}>{t('common:actions.done')}</Button>
        ) : (
          <>
            <Button variant="quiet" onPress={close}>{t('common:actions.cancel')}</Button>
            <Button variant="primary" icon={Banknote} isPending={record.isPending} isDisabled={!account || !payer || !amount.trim()} onPress={() => void submit()} data-testid="office-submit">
              {t('collections:office.submit')}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-4" data-testid="office-done" role="status">
          <p className="text-base font-semibold text-success">{t('collections:office.receiptIssued', { receipt: done.receipt.ref, amount: fmt.money(done.payment.amount) })}</p>
          <AllocationTable lines={done.payment.allocations} unapplied={done.payment.unapplied} label={t('collections:office.settled')} />
          <Link href={COLLECTIONS.payment(done.payment.id)}>{t('collections:review.openPayment', { ref: done.payment.ref })}</Link>
        </div>
      ) : (
        <div className="space-y-4">
          <SelectControl
            label={t('collections:office.account')}
            value={account || null}
            onChange={(k) => setAccount(k ?? '')}
            options={(accounts.data ?? []).map((a) => ({ id: a.id, label: `${a.accountNo} · ${a.holderName} · ${a.flats.map((f) => f.code).join(', ')}` }))}
            testId="office-account"
          />
          {payers.length > 0 && (
            <SelectControl
              label={t('collections:office.payer')}
              value={payer || null}
              onChange={(k) => setPayer(k ?? '')}
              options={payers.map((p) => ({ id: p.partyId, label: t('billing:accounts.payerOf', { name: p.name, flat: p.flatCode }) }))}
              testId="office-payer"
            />
          )}
          {detail.data && <p className="text-sm text-muted">{t('collections:office.owes', { amount: fmt.money(detail.data.balance) })}</p>}
          <AmountInput label={t('collections:office.amount')} value={amount} onChange={setAmount} testId="office-amount" />
          <PlainTextField label={t('collections:office.note')} value={note} onChange={setNote} />
          {account && payer && amount.trim() && <OfficePreview accountId={account} payerPartyId={payer} amount={amount} />}
          {error ? <ProblemAlert error={error} /> : null}
        </div>
      )}
    </Drawer>
  );
}

/** What the cash would settle, computed the way verification does (shown before anything is recorded). */
function OfficePreview({ accountId, payerPartyId, amount }: { accountId: string; payerPartyId: string; amount: string }) {
  const { t } = useT();
  const preview = useApiQuery<AllocationPreview>({ method: 'GET', path: '/payment-previews/office', query: { account: accountId, payer: payerPartyId, amount } }, { placeholderData: (prev) => prev, retry: false });
  if (!preview.data) return null;
  return (
    <div className="space-y-2" data-testid="office-preview">
      <p className="text-sm font-semibold text-text">{t('collections:office.preview')}</p>
      <AllocationTable lines={preview.data.lines} unapplied={preview.data.unapplied} label={t('collections:office.preview')} />
    </div>
  );
}
