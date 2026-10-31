import {
  CASHBOOK_CATEGORIES,
  RECEIPT_CATEGORIES,
  VOUCHER_CATEGORIES,
  type CashbookLine,
  type CashbookView,
  type CashCount,
  type CloseChecklist,
  type VoucherCategory,
  type VoucherDetail,
} from '@repo/contracts';
import {
  AmountStrip,
  Badge,
  Button,
  ConfirmDialog,
  DateTime,
  cn,
  Drawer,
  dynamicT,
  EmptyState,
  ErrorState,
  FilterPills,
  InlineAlert,
  Link,
  Money,
  PageHeader,
  PlainTextArea,
  PlainTextField,
  SegmentedControl,
  SelectControl,
  useApiMutation,
  useApiQuery,
  useQueryParam,
  useQueryParams,
  useSession,
  useT,
  useToast,
} from '@repo/ui';
import { ArrowDownLeft, ArrowUpRight, Ban, CheckCircle2, Coins, FilePlus2, Hourglass, Lock, LockOpen, Paperclip, ReceiptText, Scale, Send, TriangleAlert, Undo2, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FileTrigger } from 'react-aria-components';
import { FINANCE } from '../../../nav.config';
import { AmountInput, Loading, ProblemAlert, ScrollRegion, useSocietyFormat } from '../kit';
import { ApprovalPanel, EvidenceText, Fact, FactGrid, HistoryList, PeriodBadge, VoucherBadge, WRAP, WrapMoney } from './fkit';

/**
 * BANK-007 cashbook (reference experience 1): a derived view, never a ledger of its own. Every line
 * is a settled source event (a verified payment, a posted voucher, a settled transfer leg, a
 * handover balance) with its evidence and a link to its record; running balances follow. What is
 * not settled yet (instructions, cash in transit, cheques, proofs) is listed apart. The month close
 * (BANK-008) and cash vouchers (BANK-009) open as drawers.
 */
export default function CashbookPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const [account] = useQueryParam('account');
  const [period] = useQueryParam('period');
  const [category] = useQueryParam('category');
  const [drawer] = useQueryParam('drawer');
  const [voucher] = useQueryParam('voucher');
  const setParams = useQueryParams();
  const q = useApiQuery<CashbookView>({ method: 'GET', path: '/finance/cashbook', query: { account: account ?? 'all', period: period ?? undefined, category: category ?? undefined } }, { placeholderData: (prev) => prev });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} label={t('finance:cashbook.loading')} />;
  const d = q.data;
  const p = fmt.period(d.period);
  const accountName = d.accounts.find((a) => a.id === d.accountId)?.name;
  return (
    <div className="@container space-y-6" data-testid="cashbook-page">
      <PageHeader
        title={t('nav:pages.cashbook')}
        description={t('finance:cashbook.intro')}
        badge={<PeriodBadge state={d.periodState} testId="cashbook-period-state" />}
        actions={
          <div className="flex flex-wrap gap-2">
            {d.actions.voucher && (
              <Button variant="primary" icon={FilePlus2} onPress={() => setParams({ drawer: 'voucher', voucher: null })} className={WRAP} data-testid="new-voucher">
                {t('finance:voucher.new')}
              </Button>
            )}
            {d.actions.count && (
              <Button variant="secondary" icon={Coins} onPress={() => setParams({ drawer: 'count' })} className={WRAP} data-testid="count-cash">
                {t('finance:count.open')}
              </Button>
            )}
            <Button variant="secondary" icon={Lock} onPress={() => setParams({ drawer: 'close' })} className={WRAP} data-testid="open-close">
              {t('finance:close.open', { period: p })}
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-3 rounded-card border border-border/70 bg-panel p-4 shadow-card @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <SelectControl
          label={t('finance:cashbook.account')}
          value={d.accountId ?? 'all'}
          onChange={(k) => setParams({ account: k && k !== 'all' ? k : null })}
          options={[{ id: 'all', label: t('finance:cashbook.allAccounts') }, ...d.accounts.map((a) => ({ id: a.id, label: `${a.name} · ${t(`finance:accountKind.${a.kind}`)}` }))]}
          testId="cashbook-account"
        />
        <SelectControl label={t('finance:cashbook.period')} value={d.period} onChange={(k) => setParams({ period: k ?? null })} options={d.periods.map((x) => ({ id: x.period, label: `${fmt.period(x.period)} · ${t(`finance:periodState.${x.state}`)}` }))} testId="cashbook-period" />
        <FilterPills
          className="@3xl:col-span-2"
          label={t('finance:cashbook.category')}
          showLabel
          value={category ?? 'all'}
          testId="cashbook-category"
          onChange={(v) => setParams({ category: v === 'all' ? null : v })}
          options={[{ id: 'all', label: t('finance:cashbook.allCategories') }, ...CASHBOOK_CATEGORIES.filter((c) => c !== 'opening').map((c) => ({ id: c, label: t(`finance:category.${c}`) }))]}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-4" data-testid="cashbook-totals" aria-label={t('finance:cashbook.totals', { period: p })}>
        <AmountStrip tone="neutral" icon={Wallet} label={t('finance:cashbook.opening', { period: p })} amount={<WrapMoney value={d.totals.opening} className="text-lg @xs:text-xl" />} />
        <AmountStrip tone="success" icon={ArrowDownLeft} label={t('finance:cashbook.receipts')} amount={<WrapMoney value={d.totals.receipts} className="text-lg @xs:text-xl" />} />
        <AmountStrip tone="warning" icon={ArrowUpRight} label={t('finance:cashbook.payments')} amount={<WrapMoney value={d.totals.payments} className="text-lg @xs:text-xl" />} />
        <AmountStrip tone="primary" icon={Scale} label={t('finance:cashbook.closing', { period: p })} amount={<WrapMoney value={d.totals.closing} className="text-lg @xs:text-xl" />} />
      </div>

      <section aria-labelledby="lines-title" className="space-y-3 rounded-card bg-panel p-5 shadow-card">
        <h2 id="lines-title" className="text-lg font-bold text-text">
          {accountName ? t('finance:cashbook.linesOf', { account: accountName, period: p }) : t('finance:cashbook.lines', { period: p })}
        </h2>
        {d.lines.length === 0 ? (
          <EmptyState title={t('finance:cashbook.emptyTitle')} body={t('finance:cashbook.emptyBody')} />
        ) : (
          <>
            {/*
              Issue #6: below 64em of the page (phones, tablets, and any width at large text sizes, since em
              follows the text size) each line is a card with every fact in full; the table where it fits.
            */}
            <ol className="space-y-3 @min-[64em]:hidden" aria-label={t('finance:cashbook.cardsLabel', { period: p })} data-testid="cashbook-cards">
              {d.lines.map((l) => (
                <LineCard key={l.key} line={l} showAccount={!d.accountId} accountName={d.accounts.find((a) => a.id === l.accountId)?.name ?? ''} />
              ))}
            </ol>
            <div className="hidden @min-[64em]:block">
          <ScrollRegion label={t('finance:cashbook.lines', { period: p })}>
            <table className="w-full min-w-[56rem] text-sm" data-testid="cashbook-lines">
              <thead className="text-start text-xs text-muted">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t('finance:cashbook.date')}</th>
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t('finance:cashbook.entry')}</th>
                  <th scope="col" className="py-2 pe-3 text-start font-medium">{t('finance:cashbook.evidence')}</th>
                  <th scope="col" className="py-2 pe-3 text-end font-medium">{t('finance:cashbook.inCol')}</th>
                  <th scope="col" className="py-2 pe-3 text-end font-medium">{t('finance:cashbook.outCol')}</th>
                  <th scope="col" className="py-2 text-end font-medium">{t('finance:cashbook.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => (
                  <Line key={l.key} line={l} showAccount={!d.accountId} accountName={d.accounts.find((a) => a.id === l.accountId)?.name ?? ''} />
                ))}
              </tbody>
            </table>
          </ScrollRegion>
            </div>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 @5xl:grid-cols-2">
        <section aria-labelledby="pending-title" className="space-y-3 rounded-card bg-panel p-5 shadow-card" data-testid="cashbook-pending">
          <h2 id="pending-title" className="flex items-center gap-2 text-lg font-bold text-text">
            <Hourglass aria-hidden className="size-5 text-muted" />
            {t('finance:cashbook.pending')}
          </h2>
          <p className="text-sm text-muted">{t('finance:cashbook.pendingIntro', { amount: fmt.money(d.inTransit) })}</p>
          {d.pending.length === 0 ? (
            <p className="text-sm text-text">{t('finance:cashbook.nothingPending')}</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {d.pending.map((x) => (
                <li key={`${x.kind}-${x.id}`}>
                  <Link href={x.href} variant="plain" className="flex flex-wrap items-center justify-between gap-2 py-2.5 hover:bg-raised" data-testid="pending-item" data-kind={x.kind}>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text">{dynamicT(t)(`finance:pending.describe.${x.describe.key}`, x.describe.values ?? {})}</span>
                      <span className="block text-xs text-muted">
                        <bdi dir="ltr" className="ltr-ref">{x.ref}</bdi> · {t(`finance:pending.kind.${x.kind}`)}
                      </span>
                    </span>
                    <Money value={x.amount} className="font-semibold" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="rec-title" className="space-y-3 rounded-card bg-panel p-5 shadow-card" data-testid="cashbook-reconciliation">
          <h2 id="rec-title" className="text-lg font-bold text-text">
            {t('finance:cashbook.reconciliation', { period: p })}
          </h2>
          <p className="text-sm text-muted">{t('finance:cashbook.reconciliationIntro')}</p>
          <ul className="space-y-3">
            {d.reconciliation.map((r) => (
              <li key={r.accountId} className="rounded-tile border border-border/70 p-4" data-testid="reconciliation-row" data-reconciled={r.reconciled}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-text">
                    <bdi>{r.name}</bdi>
                  </p>
                  {r.reconciled ? (
                    <Badge tone="success" icon={CheckCircle2}>{t('finance:cashbook.reconciled')}</Badge>
                  ) : (
                    <Badge tone="warning" icon={TriangleAlert}>{t('finance:cashbook.notReconciled', { count: r.unmatchedLines })}</Badge>
                  )}
                </div>
                <dl className="mt-2 grid gap-1 text-sm @md:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted">{t('finance:cashbook.bookMovement')}</dt>
                    <dd><Money value={r.cashbookMovement} /></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t('finance:cashbook.statementMovement')}</dt>
                    <dd><Money value={r.statementMovement} /></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t('finance:cashbook.difference')}</dt>
                    <dd><Money value={r.difference} /></dd>
                  </div>
                </dl>
                {!r.reconciled && (
                  <Link href={r.href} className="mt-2 inline-block text-sm">
                    {t('finance:cashbook.openUnmatched')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {d.actions.voucher && <VoucherDrawer isOpen={drawer === 'voucher' || !!voucher} voucherId={voucher} onClose={() => setParams({ drawer: null, voucher: null })} />}
      {!d.actions.voucher && voucher && <VoucherDrawer isOpen voucherId={voucher} onClose={() => setParams({ voucher: null })} />}
      <CloseDrawer isOpen={drawer === 'close'} period={d.period} onClose={() => setParams({ drawer: null })} />
      <CountDrawer isOpen={drawer === 'count'} onClose={() => setParams({ drawer: null })} accounts={d.accounts.filter((a) => a.kind !== 'bank')} />
    </div>
  );
}

/** What a cashbook line says it is (the same words in the table and on the card). */
function useDescription(line: CashbookLine) {
  const { t } = useT();
  const tr = dynamicT(t);
  return tr(`finance:cashbook.describe.${line.describe.key}`, {
    ...(line.describe.values ?? {}),
    ...(line.describe.values?.category ? { category: tr(`finance:voucherCategory.${line.describe.values.category}`) } : {}),
    ...(line.describe.values?.kind ? { kind: tr(`finance:transferKind.${line.describe.values.kind}`) } : {}),
  });
}

/**
 * One cashbook line as a card (phones and large text, Issue #6): nothing is cut or hidden: the full
 * reference, payer or payee, flats, account, category, evidence, amount (money in or out, said in
 * words) and the running balance, with the line's record one tap away.
 */
function LineCard({ line, showAccount, accountName }: { line: CashbookLine; showAccount: boolean; accountName: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const describe = useDescription(line);
  const incoming = line.direction === 'in';
  return (
    <li className="space-y-3 rounded-tile border border-border/70 p-4" data-testid="cashbook-card" data-source={line.source} data-category={line.category} data-ref={line.sourceRef}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <Link href={line.href} className="min-w-0 font-medium [overflow-wrap:anywhere]" data-testid="cashbook-card-link">
          {describe}
        </Link>
        <p className="text-end" data-testid="cashbook-card-amount" data-direction={line.direction}>
          <span className="block text-xs text-muted">{t(incoming ? 'finance:cashbook.moneyIn' : 'finance:cashbook.moneyOut')}</span>
          <WrapMoney value={line.amount} className={cn('text-base font-semibold', incoming ? 'text-success' : 'text-text')} />
        </p>
      </div>
      <FactGrid>
        <Fact label={t('finance:cashbook.date')}>{fmt.date(line.date)}</Fact>
        <Fact label={t('finance:cashbook.reference')}>
          <bdi dir="ltr" className="ltr-ref">{line.sourceRef}</bdi>
        </Fact>
        {line.counterparty ? (
          <Fact label={t('finance:cashbook.counterparty')}>
            <bdi>{line.counterparty}</bdi>
          </Fact>
        ) : null}
        {line.flats?.length ? (
          <Fact label={t('finance:cashbook.flats')}>
            <bdi dir="ltr" className="ltr-ref">{line.flats.join(', ')}</bdi>
          </Fact>
        ) : null}
        {showAccount ? (
          <Fact label={t('finance:cashbook.accountLabel')}>
            <bdi>{accountName}</bdi>
          </Fact>
        ) : null}
        <Fact label={t('finance:cashbook.categoryLabel')}>{t(`finance:category.${line.category}`)}</Fact>
        <Fact label={t('finance:cashbook.evidence')}>
          <EvidenceText evidence={line.evidence} />
        </Fact>
        <Fact label={t('finance:cashbook.balance')}>
          <WrapMoney value={line.balance} />
        </Fact>
      </FactGrid>
    </li>
  );
}

function Line({ line, showAccount, accountName }: { line: CashbookLine; showAccount: boolean; accountName: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const describe = useDescription(line);
  return (
    <tr className="border-b border-border/60 align-top" data-testid="cashbook-line" data-source={line.source} data-category={line.category}>
      <td className="py-2.5 pe-3 whitespace-nowrap text-muted">{fmt.date(line.date)}</td>
      <td className="py-2.5 pe-3">
        <Link href={line.href} className="font-medium">
          {describe}
        </Link>
        <span className="block text-xs text-muted">
          <bdi dir="ltr" className="ltr-ref">{line.sourceRef}</bdi>
          {line.counterparty ? (
            <>
              {' · '}
              <bdi>{line.counterparty}</bdi>
            </>
          ) : null}
          {line.flats?.length ? (
            <>
              {' · '}
              <bdi dir="ltr" className="ltr-ref">{line.flats.join(', ')}</bdi>
            </>
          ) : null}
          {showAccount ? ` · ${accountName}` : ''} · {t(`finance:category.${line.category}`)}
        </span>
      </td>
      <td className="py-2.5 pe-3 text-xs text-muted">
        <EvidenceText evidence={line.evidence} />
      </td>
      <td className="py-2.5 pe-3 text-end">{line.direction === 'in' ? <Money value={line.amount} className="font-semibold text-success" /> : null}</td>
      <td className="py-2.5 pe-3 text-end">{line.direction === 'out' ? <Money value={line.amount} className="font-semibold" /> : null}</td>
      <td className="py-2.5 text-end">
        <Money value={line.balance} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------------------------
// BANK-009 cash voucher
// ---------------------------------------------------------------------------------------------

interface VoucherDraft {
  accountId: string;
  direction: 'receipt' | 'payment';
  category: VoucherCategory | '';
  amount: string;
  onDate: string;
  purpose: string;
  counterparty: string;
  evidence: { name: string; kind: 'bill' | 'receipt' | 'quotation' | 'other'; size: number } | null;
}

const blank = (today: string): VoucherDraft => ({ accountId: '', direction: 'payment', category: '', amount: '', onDate: today, purpose: '', counterparty: '', evidence: null });

export function VoucherDrawer({ isOpen, voucherId, onClose }: { isOpen: boolean; voucherId: string | null; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const { can } = useSession();
  const today = '2026-10-26';
  const book = useApiQuery<CashbookView>({ method: 'GET', path: '/finance/cashbook', query: { period: '2026-10' } }, { enabled: isOpen });
  const detail = useApiQuery<VoucherDetail>({ method: 'GET', path: `/finance/vouchers/${voucherId}` }, { enabled: isOpen && !!voucherId });
  const save = useApiMutation<VoucherDetail>();
  const [draft, setDraft] = useState<VoucherDraft>(blank(today));
  const [error, setError] = useState<unknown>(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [key] = useState(() => `cv-${Date.now().toString(36)}`);
  useEffect(() => {
    if (!isOpen) {
      setDraft(blank(today));
      setError(null);
    }
  }, [isOpen]);
  const v = voucherId ? detail.data?.voucher : undefined;
  const cashAccounts = (book.data?.accounts ?? []).filter((a) => a.kind !== 'bank');
  const categories = VOUCHER_CATEGORIES.filter((c) => RECEIPT_CATEGORIES.includes(c) === (draft.direction === 'receipt'));
  const act = async (path: string, body: unknown, done: string) => {
    setError(null);
    try {
      const r = await save.mutateAsync({ method: 'POST', path, body });
      toast.success(done);
      return r;
    } catch (e) {
      setError(e);
      return null;
    }
  };
  const create = async (submit: boolean) => {
    const r = await act('/finance/vouchers', { ...draft, submit, idempotencyKey: key }, t(submit ? 'finance:voucher.submitted' : 'finance:voucher.saved'));
    if (r) window.history.replaceState(null, '', FINANCE.voucher(r.voucher.id));
    if (r) onClose();
  };
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={v ? t('finance:voucher.title', { ref: v.ref }) : t('finance:voucher.new')}
      subtitle={v ? <VoucherBadge state={v.status} testId="voucher-state" /> : t('finance:voucher.subtitle')}
      testId="voucher-drawer"
      footer={
        v ? (
          <div className="flex flex-wrap gap-2">
            {detail.data?.actions.submit && (
              <Button variant="primary" icon={Send} isPending={save.isPending} onPress={() => void act(`/finance/vouchers/${v.id}/submit`, {}, t('finance:voucher.submitted'))} data-testid="voucher-submit">
                {t('finance:voucher.submit')}
              </Button>
            )}
            {detail.data?.actions.post && (
              <Button variant="primary" icon={CheckCircle2} isPending={save.isPending} onPress={() => void act(`/finance/vouchers/${v.id}/post`, {}, t('finance:voucher.posted'))} data-testid="voucher-post">
                {t('finance:voucher.post')}
              </Button>
            )}
            {detail.data?.actions.withdraw && (
              <Button variant="quiet" icon={Ban} onPress={() => void act(`/finance/vouchers/${v.id}/withdraw`, {}, t('finance:voucher.withdrawn'))} data-testid="voucher-withdraw">
                {t('finance:voucher.withdraw')}
              </Button>
            )}
            {detail.data?.actions.reverse && (
              <Button variant="secondary" icon={Undo2} onPress={() => setReverseOpen(true)} data-testid="voucher-reverse">
                {t('finance:voucher.reverse')}
              </Button>
            )}
            <Button variant="quiet" onPress={onClose}>{t('common:actions.close')}</Button>
          </div>
        ) : (
          <>
            <Button variant="quiet" onPress={onClose}>{t('common:actions.cancel')}</Button>
            <Button variant="secondary" isPending={save.isPending} isDisabled={!can('cash_voucher.prepare')} onPress={() => void create(false)} data-testid="voucher-save-draft">
              {t('finance:voucher.saveDraft')}
            </Button>
            <Button variant="primary" icon={Send} isPending={save.isPending} isDisabled={!can('cash_voucher.prepare')} onPress={() => void create(true)} data-testid="voucher-create-submit">
              {t('finance:voucher.submitNew')}
            </Button>
          </>
        )
      }
    >
      {voucherId && !v ? (
        detail.isError ? <ErrorState error={detail.error} /> : <Loading lines={6} />
      ) : v ? (
        <div className="space-y-5" data-testid="voucher-detail">
          {detail.data?.periodState === 'closed' && (
            <InlineAlert tone="warning" title={t('finance:voucher.periodClosed')}>
              <p>{t('finance:voucher.periodClosedBody')}</p>
            </InlineAlert>
          )}
          {v.reversalOf && (
            <InlineAlert tone="info" title={t('finance:voucher.reversalOf', { ref: v.reversalOf.ref })}>
              <p>{t('finance:voucher.reversalBody')}</p>
            </InlineAlert>
          )}
          {v.reversedBy && (
            <InlineAlert tone="warning" title={t('finance:voucher.reversedBy', { ref: v.reversedBy.ref })} data-testid="voucher-reversed">
              <Link href={FINANCE.voucher(v.reversedBy.id)}>{t('finance:voucher.openReversal')}</Link>
            </InlineAlert>
          )}
          <FactGrid testId="voucher-facts">
            <Fact label={t('finance:voucher.amount')}>
              <Money value={v.amount} className="text-lg font-bold" />
            </Fact>
            <Fact label={t('finance:voucher.direction')}>{t(`finance:voucher.directions.${v.direction}`)}</Fact>
            <Fact label={t('finance:voucher.account')}>{v.accountName}</Fact>
            <Fact label={t('finance:voucher.category')}>{t(`finance:voucherCategory.${v.category}`)}</Fact>
            <Fact label={t('finance:voucher.date')}>{fmt.date(v.onDate)}</Fact>
            <Fact label={t('finance:voucher.counterparty')}>
              <bdi>{v.counterparty.name}</bdi>
            </Fact>
            <Fact label={t('finance:voucher.purpose')}>
              <bdi>{v.purpose}</bdi>
            </Fact>
            <Fact label={t('finance:voucher.evidence')}>
              <span className="inline-flex items-center gap-1.5">
                <Paperclip aria-hidden className="size-4 text-muted" />
                <bdi>{v.evidence.name}</bdi>
              </span>
            </Fact>
            <Fact label={t('finance:voucher.preparedBy')}>
              {v.preparedByName} · <DateTime value={v.preparedAt} style="dateTime" />
            </Fact>
            {v.postedByName && (
              <Fact label={t('finance:voucher.postedBy')}>
                {v.postedByName} · <DateTime value={v.postedAt!} style="dateTime" />
              </Fact>
            )}
          </FactGrid>
          {v.approvalId && <ApprovalPanel approvalId={v.approvalId} />}
          <section aria-label={t('finance:voucher.history')} className="space-y-2">
            <h3 className="text-sm font-semibold text-text">{t('finance:voucher.history')}</h3>
            <HistoryList label={t('finance:voucher.history')} items={v.history.map((h) => ({ at: h.at, byName: h.byName, label: t(`finance:voucher.events.${h.action}`), ...(h.note ? { note: h.note } : {}) }))} />
          </section>
          {error ? <ProblemAlert error={error} /> : null}
          <ConfirmDialog
            isOpen={reverseOpen}
            onOpenChange={setReverseOpen}
            title={t('finance:voucher.reverseTitle', { ref: v.ref })}
            effect={t('finance:voucher.reverseEffect')}
            confirmLabel={t('finance:voucher.reverseConfirm')}
            reasonLabel={t('finance:voucher.reverseReason')}
            onConfirm={async (reason) => {
              const r = await act(`/finance/vouchers/${v.id}/reverse`, { reason }, t('finance:voucher.reversalPrepared'));
              if (r) window.history.replaceState(null, '', FINANCE.voucher(r.voucher.id));
            }}
          />
        </div>
      ) : (
        <div className="space-y-4" data-testid="voucher-form">
          <InlineAlert tone="info" title={t('finance:voucher.rulesTitle')}>
            <p>{t('finance:voucher.rulesBody')}</p>
          </InlineAlert>
          <SelectControl label={t('finance:voucher.account')} value={draft.accountId || null} onChange={(k) => setDraft({ ...draft, accountId: k ?? '' })} options={cashAccounts.map((a) => ({ id: a.id, label: `${a.name} · ${fmt.money(a.balance)}` }))} testId="voucher-account" />
          <SegmentedControl
            label={t('finance:voucher.direction')}
            value={draft.direction}
            onChange={(k) => setDraft({ ...draft, direction: k as VoucherDraft['direction'], category: '' })}
            options={[
              { id: 'payment', label: t('finance:voucher.directions.payment') },
              { id: 'receipt', label: t('finance:voucher.directions.receipt') },
            ]}
            testId="voucher-direction"
          />
          <SelectControl label={t('finance:voucher.category')} value={draft.category || null} onChange={(k) => setDraft({ ...draft, category: (k ?? '') as VoucherCategory })} options={categories.map((c) => ({ id: c, label: t(`finance:voucherCategory.${c}`) }))} testId="voucher-category" />
          <AmountInput label={t('finance:voucher.amount')} value={draft.amount} onChange={(v2) => setDraft({ ...draft, amount: v2 })} testId="voucher-amount" />
          <PlainTextField label={t('finance:voucher.date')} description={t('finance:voucher.dateHint')} value={draft.onDate} onChange={(v2) => setDraft({ ...draft, onDate: v2 })} dir="ltr" testId="voucher-date" />
          <PlainTextField label={t('finance:voucher.counterparty')} value={draft.counterparty} onChange={(v2) => setDraft({ ...draft, counterparty: v2 })} testId="voucher-counterparty" />
          <PlainTextArea label={t('finance:voucher.purpose')} value={draft.purpose} onChange={(v2) => setDraft({ ...draft, purpose: v2 })} testId="voucher-purpose" />
          <EvidencePicker value={draft.evidence} onChange={(e) => setDraft({ ...draft, evidence: e })} />
          {error ? <ProblemAlert error={error} /> : null}
        </div>
      )}
    </Drawer>
  );
}

/** The supporting document (described only: the prototype stores no files). */
function EvidencePicker({ value, onChange }: { value: VoucherDraft['evidence']; onChange: (e: VoucherDraft['evidence']) => void }) {
  const { t } = useT();
  return (
    <div className="space-y-2" data-testid="voucher-evidence">
      <p className="text-sm font-medium text-text">{t('finance:voucher.evidence')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <FileTrigger acceptedFileTypes={['image/*', 'application/pdf']} onSelect={(files) => files?.[0] && onChange({ name: files[0].name, kind: 'bill', size: files[0].size })}>
          <Button variant="secondary" icon={Paperclip}>{t('finance:voucher.attach')}</Button>
        </FileTrigger>
        <Button variant="quiet" icon={ReceiptText} onPress={() => onChange({ name: 'sample-bill-demo.jpg', kind: 'bill', size: 120_000 })} data-testid="voucher-sample-evidence">
          {t('finance:voucher.sampleEvidence')}
        </Button>
      </div>
      <p className="text-sm text-muted" role="status">
        {value ? t('finance:voucher.attached', { name: value.name }) : t('finance:voucher.noEvidence')}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Cash count (witnessed) and BANK-008 month close
// ---------------------------------------------------------------------------------------------

const NOTES = ['5000', '1000', '500', '100', '50', '20', '10'];

function CountDrawer({ isOpen, onClose, accounts }: { isOpen: boolean; onClose: () => void; accounts: CashbookView['accounts'] }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const record = useApiMutation<CashCount>();
  const [account, setAccount] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<CashCount | null>(null);
  const total = NOTES.reduce((s, n) => s + Number(n) * (Number(counts[n] ?? 0) || 0), 0);
  const close = () => {
    setDone(null);
    setCounts({});
    setError(null);
    onClose();
  };
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && close()}
      title={t('finance:count.title')}
      subtitle={t('finance:count.subtitle')}
      testId="count-drawer"
      footer={
        done ? (
          <Button variant="primary" onPress={close}>{t('common:actions.done')}</Button>
        ) : (
          <>
            <Button variant="quiet" onPress={close}>{t('common:actions.cancel')}</Button>
            <Button
              variant="primary"
              isPending={record.isPending}
              isDisabled={!account}
              onPress={async () => {
                setError(null);
                try {
                  const r = await record.mutateAsync({ method: 'POST', path: '/finance/cash-counts', body: { accountId: account, denominations: NOTES.map((n) => ({ note: n, count: Number(counts[n] ?? 0) || 0 })) } });
                  setDone(r);
                  toast.success(t('finance:count.recorded'));
                } catch (e) {
                  setError(e);
                }
              }}
              data-testid="count-submit"
            >
              {t('finance:count.record')}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-3" role="status" data-testid="count-done">
          <p className="text-base font-semibold text-text">{t('finance:count.done', { counted: fmt.money(done.counted), expected: fmt.money(done.expected) })}</p>
          <p className="text-sm text-muted">{t('finance:count.needsWitness')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <SelectControl label={t('finance:count.account')} value={account || null} onChange={(k) => setAccount(k ?? '')} options={accounts.map((a) => ({ id: a.id, label: `${a.name} · ${t('finance:count.books', { amount: fmt.money(a.balance) })}` }))} testId="count-account" />
          <div className="grid grid-cols-1 grid-cols-2 gap-3 @md:grid-cols-4">
            {NOTES.map((n) => (
              <PlainTextField key={n} label={t('finance:count.note', { note: fmt.money({ amount: `${n}.00`, currency: 'PKR' }) })} value={counts[n] ?? ''} onChange={(v) => setCounts({ ...counts, [n]: v.replace(/\D/g, '') })} inputMode="numeric" dir="ltr" testId={`count-note-${n}`} />
            ))}
          </div>
          <p className="text-base font-semibold text-text" role="status" data-testid="count-total">
            {t('finance:count.total', { amount: fmt.money({ amount: `${total}.00`, currency: 'PKR' }) })}
          </p>
          {error ? <ProblemAlert error={error} /> : null}
        </div>
      )}
    </Drawer>
  );
}

function CloseDrawer({ isOpen, period, onClose }: { isOpen: boolean; period: string; onClose: () => void }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const toast = useToast();
  const [chosen, setChosen] = useState(period);
  useEffect(() => setChosen(period), [period]);
  const q = useApiQuery<CloseChecklist>({ method: 'GET', path: `/finance/periods/${chosen}/checklist` }, { enabled: isOpen });
  const act = useApiMutation<CloseChecklist | CashCount>();
  const [error, setError] = useState<unknown>(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const run = async (path: string, body: unknown, message: string) => {
    setError(null);
    try {
      await act.mutateAsync({ method: 'POST', path, body });
      toast.success(message);
      void q.refetch();
    } catch (e) {
      setError(e);
    }
  };
  const d = q.data;
  const p = fmt.period(chosen);
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={t('finance:close.title', { period: p })}
      subtitle={d ? <PeriodBadge state={d.period.state} testId="close-period-state" /> : undefined}
      testId="close-drawer"
      footer={
        <div className="flex flex-wrap gap-2">
          {d?.actions.close && (
            <Button variant="primary" icon={Lock} onPress={() => setConfirm(true)} data-testid="close-period">
              {t('finance:close.close', { period: p })}
            </Button>
          )}
          <Button variant="quiet" onPress={onClose}>{t('common:actions.close')}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <SelectControl
          label={t('finance:close.month')}
          value={chosen}
          onChange={(k) => k && setChosen(k)}
          options={['2026-09', '2026-10'].map((x) => ({ id: x, label: fmt.period(x) }))}
          testId="close-month"
        />
        {!d ? (
          <Loading lines={6} />
        ) : (
          <>
            {d.period.state === 'closed' ? (
              <InlineAlert tone="info" title={t('finance:close.isClosed', { period: p, name: d.period.closedByName ?? '' })} data-testid="close-is-closed">
                <p>{t('finance:close.isClosedBody')}</p>
              </InlineAlert>
            ) : d.canClose ? (
              <InlineAlert tone="success" title={t('finance:close.ready', { period: p })}>
                <p>{t('finance:close.readyBody')}</p>
              </InlineAlert>
            ) : (
              <InlineAlert tone="warning" title={t('finance:close.blocked', { count: d.checks.filter((c) => c.outcome === 'blocking').length })}>
                <p>{t('finance:close.blockedBody')}</p>
              </InlineAlert>
            )}
            <ul className="space-y-2" data-testid="close-checks" aria-label={t('finance:close.checks')}>
              {d.checks.map((c) => (
                <li key={c.key} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-border/70 px-4 py-3" data-testid="close-check" data-key={c.key} data-outcome={c.outcome}>
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    {c.outcome === 'passed' ? <CheckCircle2 aria-hidden className="size-4 shrink-0 text-success" /> : c.outcome === 'blocking' ? <Ban aria-hidden className="size-4 shrink-0 text-error" /> : <TriangleAlert aria-hidden className="size-4 shrink-0 text-warning" />}
                    <span>
                      <span className="block font-medium text-text">{t(`finance:close.check.${c.key}`, { period: p })}</span>
                      <span className="block text-xs text-muted">
                        {t(`finance:close.outcome.${c.outcome}`)}
                        {c.count ? ` · ${t('finance:close.items', { count: c.count })}` : ''}
                        {c.amount ? ` · ${fmt.money(c.amount)}` : ''}
                      </span>
                    </span>
                  </span>
                  {c.href && c.outcome !== 'passed' && <Link href={c.href} className="text-sm">{t('finance:close.openItems')}</Link>}
                </li>
              ))}
            </ul>
            <section className="space-y-2" aria-label={t('finance:close.cash')}>
              <h3 className="text-sm font-semibold text-text">{t('finance:close.cash')}</h3>
              <ul className="space-y-2">
                {d.cashAccounts.map((a) => (
                  <li key={a.id} className="rounded-tile border border-border/70 px-4 py-3 text-sm" data-testid="close-cash-account">
                    <p className="font-medium text-text">{a.name}</p>
                    <p className="text-muted">
                      {t('finance:close.expected', { amount: fmt.money(a.expected) })} ·{' '}
                      {a.counted ? t('finance:close.counted', { amount: fmt.money(a.counted.counted), date: fmt.date(a.counted.onDate), witness: a.counted.witnessedByName ?? '' }) : t('finance:close.notCounted')}
                    </p>
                  </li>
                ))}
              </ul>
              {d.counts.filter((c) => c.status === 'awaiting_witness').map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-tile border border-warning/40 bg-warning-soft/40 px-4 py-3 text-sm" data-testid="count-awaiting">
                  <span>{t('finance:close.awaitingWitness', { account: c.accountName, amount: fmt.money(c.counted), name: c.countedByName })}</span>
                  {d.actions.witness && (
                    <Button variant="secondary" size="sm" onPress={() => void run(`/finance/cash-counts/${c.id}/witness`, {}, t('finance:count.witnessed'))} data-testid="count-witness">
                      {t('finance:count.witness')}
                    </Button>
                  )}
                </div>
              ))}
              <Link href={FINANCE.cashbook({ drawer: 'count' })} className="text-sm">{t('finance:count.open')}</Link>
            </section>
            {d.period.state === 'closed' && d.actions.requestReopen && (
              <section className="space-y-2" aria-label={t('finance:close.reopen')}>
                <h3 className="text-sm font-semibold text-text">{t('finance:close.reopen')}</h3>
                <p className="text-sm text-muted">{t('finance:close.reopenBody')}</p>
                <PlainTextArea label={t('finance:close.reopenReason')} value={reason} onChange={setReason} testId="reopen-reason" />
                <Button variant="secondary" icon={LockOpen} isDisabled={reason.trim().length < 10} onPress={() => void run(`/finance/periods/${chosen}/reopen-request`, { reason }, t('finance:close.reopenRequested'))} data-testid="reopen-request">
                  {t('finance:close.reopenSend')}
                </Button>
              </section>
            )}
            {d.reopenApproval && <ApprovalPanel approvalId={d.reopenApproval.id} testId="reopen-approval" />}
            <section className="space-y-2" aria-label={t('finance:close.history')}>
              <h3 className="text-sm font-semibold text-text">{t('finance:close.history')}</h3>
              {d.period.history.length === 0 ? (
                <p className="text-sm text-muted">{t('finance:close.noHistory')}</p>
              ) : (
                <ul className="space-y-1 text-sm" data-testid="period-history">
                  {d.period.history.map((h, i) => (
                    <li key={i} data-action={h.action}>
                      <DateTime value={h.at} style="dateTime" /> · {h.byName} · {t(`finance:close.events.${h.action}`)}
                      {h.note ? (
                        <>
                          {' · '}
                          <bdi>{h.note}</bdi>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {error ? <ProblemAlert error={error} /> : null}
          </>
        )}
      </div>
      <ConfirmDialog
        isOpen={confirm}
        onOpenChange={setConfirm}
        title={t('finance:close.confirmTitle', { period: p })}
        effect={t('finance:close.confirmEffect', { period: p })}
        confirmLabel={t('finance:close.close', { period: p })}
        onConfirm={() => run(`/finance/periods/${chosen}/close`, {}, t('finance:close.closed', { period: p }))}
      />
    </Drawer>
  );
}
