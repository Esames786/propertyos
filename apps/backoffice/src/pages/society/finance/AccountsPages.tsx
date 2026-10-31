import type { CashbookView, FinanceAccountDetail, FinanceAccountRow } from '@repo/contracts';
import { Badge, Breadcrumbs, buttonClass, DirectionalIcon, EmptyState, ErrorState, Link, Money, PageHeader, UrlTabs, useApiQuery, useT } from '@repo/ui';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, BookOpenText, ChevronRight, Coins, FilePlus2, FileWarning, Hourglass, Landmark, Link2, Upload, Wallet } from 'lucide-react';
import { COLLECTIONS, FINANCE } from '../../../nav.config';
import { Loading, ScrollRegion, useSocietyFormat } from '../kit';
import { BankLineBadge } from '../collections/ckit';
import { EvidenceText, Fact, FactGrid, HistoryList, WRAP, WrapMoney } from './fkit';

/**
 * BANK-001 cash and bank accounts and BANK-002 Account 360 (Gate S.1, society slice). A bank account
 * is the verified beneficiary of BILL-010 itself (never a copy): it is added or changed only through
 * that maker-checker workflow. Cash and petty cash are account kinds of the same legal entity. Every
 * balance is the cashbook's (settled events only).
 */
export function BankAccountsPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<FinanceAccountRow[]>({ method: 'GET', path: '/finance/accounts' });
  return (
    <div className="@container space-y-6" data-testid="bank-accounts-page">
      <PageHeader
        title={t('nav:pages.bankAccounts')}
        description={t('finance:accounts.intro')}
        actions={
          <Link href={FINANCE.cashbook()} variant="plain" className={buttonClass('secondary', 'md', `gap-2 ${WRAP}`)}>
            <BookOpenText aria-hidden className="size-4 shrink-0" />
            {t('finance:dashboard.openCashbook')}
          </Link>
        }
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Loading lines={6} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 @3xl:grid-cols-2" data-testid="bank-accounts">
          {q.data.map((a) => (
            <li key={a.id}>
              <Link href={a.href} variant="plain" className="flex h-full flex-col gap-3 rounded-card border border-border/70 bg-panel p-5 shadow-card hover:bg-raised" data-testid="bank-account-card" data-account={a.id}>
                <span className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-tile bg-sunken text-muted">{a.kind === 'bank' ? <Landmark aria-hidden className="size-5" /> : a.kind === 'petty_cash' ? <Coins aria-hidden className="size-5" /> : <Wallet aria-hidden className="size-5" />}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-text">
                        <bdi>{a.name}</bdi>
                      </span>
                      <span className="block text-xs text-muted">{t(`finance:accountKind.${a.kind}`)}</span>
                    </span>
                  </span>
                  <DirectionalIcon icon={ChevronRight} className="size-4 text-muted" />
                </span>
                <WrapMoney value={a.balance} className="text-xl font-bold @xs:text-2xl" />
                <span className="flex flex-wrap gap-1.5 text-xs">
                  {a.receivesDues && <Badge tone="success" icon={Link2}>{t('finance:accounts.receivesDues')}</Badge>}
                  {a.iban && (
                    <span className="inline-flex max-w-full items-center rounded-pill border border-border px-2 py-0.5 text-muted">
                      <bdi dir="ltr" className="ltr-ref min-w-0 [overflow-wrap:anywhere]">{a.iban}</bdi>
                    </span>
                  )}
                  {a.unreconciled > 0 && <Badge tone="warning" icon={FileWarning}>{t('finance:accounts.unreconciled', { count: a.unreconciled })}</Badge>}
                  {Number(a.pending.amount) > 0 && <Badge tone="info" icon={Hourglass}>{t('finance:accounts.pending', { amount: fmt.money(a.pending) })}</Badge>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted">{t('finance:accounts.howAdded')}</p>
    </div>
  );
}

export function AccountWorkspace({ accountId }: { accountId: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const q = useApiQuery<FinanceAccountDetail>({ method: 'GET', path: `/finance/accounts/${accountId}` });
  const book = useApiQuery<CashbookView>({ method: 'GET', path: '/finance/cashbook', query: { account: accountId } });
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={8} />;
  const { account: a, actions } = q.data;
  const tabs = [
    { id: 'overview', label: t('finance:account.tabs.overview') },
    { id: 'cashbook', label: t('finance:account.tabs.cashbook') },
    ...(a.kind === 'bank' ? [{ id: 'lines', label: t('finance:account.tabs.lines') }, { id: 'reconciliation', label: t('finance:account.tabs.reconciliation') }] : []),
    { id: 'history', label: t('finance:account.tabs.history') },
  ];
  return (
    <div className="@container space-y-6" data-testid="account-workspace" data-account={a.id}>
      <Breadcrumbs items={[{ label: t('nav:pages.bankAccounts'), href: FINANCE.accounts }, { label: a.name }]} />
      <PageHeader
        title={a.name}
        description={a.kind === 'bank' ? t('finance:account.bankIntro') : t('finance:account.cashIntro', { name: a.custodian?.name ?? '' })}
        badge={<Badge tone="neutral">{t(`finance:accountKind.${a.kind}`)}</Badge>}
        actions={
          <div className="flex flex-wrap gap-2">
            {actions.voucher && (
              <Link href={FINANCE.cashbook({ drawer: 'voucher' })} variant="plain" className={buttonClass('secondary', 'md', `gap-2 ${WRAP}`)} data-testid="account-voucher">
                <FilePlus2 aria-hidden className="size-4" />
                {t('finance:voucher.new')}
              </Link>
            )}
            {actions.transfer && (
              <Link href={FINANCE.transfers()} variant="plain" className={buttonClass('secondary', 'md', `gap-2 ${WRAP}`)} data-testid="account-transfer">
                <ArrowRightLeft aria-hidden className="size-4" />
                {t('finance:dashboard.newTransfer')}
              </Link>
            )}
            {actions.importStatement && (
              <Link href={COLLECTIONS.bankFeed()} variant="plain" className={buttonClass('secondary', 'md', `gap-2 ${WRAP}`)} data-testid="account-import">
                <Upload aria-hidden className="size-4" />
                {t('finance:account.import')}
              </Link>
            )}
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-3">
        <div className="rounded-card bg-panel p-5 shadow-card">
          <p className="text-sm text-muted">{t('finance:account.balance')}</p>
          <WrapMoney value={a.balance} className="text-xl font-bold @xs:text-2xl" />
        </div>
        <div className="rounded-card bg-panel p-5 shadow-card">
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <ArrowDownLeft aria-hidden className="size-4" />
            {t('finance:account.inflow')}
          </p>
          <WrapMoney value={a.inflow} className="text-lg font-bold @xs:text-xl" />
        </div>
        <div className="rounded-card bg-panel p-5 shadow-card">
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <ArrowUpRight aria-hidden className="size-4" />
            {t('finance:account.outflow')}
          </p>
          <WrapMoney value={a.outflow} className="text-lg font-bold @xs:text-xl" />
        </div>
      </div>
      <UrlTabs label={t('finance:account.tabsLabel')} items={tabs}>
        {(tab) =>
          tab === 'overview' ? (
            <section className="space-y-4 rounded-card bg-panel p-5 shadow-card" data-testid="account-overview">
              <FactGrid>
                {a.bankName && <Fact label={t('finance:account.bank')}>{`${a.bankName} · ${a.branch ?? ''}`}</Fact>}
                {a.accountTitle && (
                  <Fact label={t('finance:account.title')}>
                    <bdi>{a.accountTitle}</bdi>
                  </Fact>
                )}
                {a.iban && (
                  <Fact label={t('finance:account.iban')}>
                    <bdi dir="ltr" className="ltr-ref">{a.iban}</bdi>
                  </Fact>
                )}
                <Fact label={t('finance:account.entity')}>{a.legalEntityName}</Fact>
                <Fact label={t('finance:account.opened')}>{fmt.date(a.openedOn)}</Fact>
                <Fact label={t('finance:account.dues')}>{a.receivesDues ? t('finance:account.duesYes') : t('finance:account.duesNo')}</Fact>
                {a.custodian && <Fact label={t('finance:account.custodian')}>{a.custodian.name}</Fact>}
                {q.data.lastCount && (
                  <Fact label={t('finance:account.lastCount')}>
                    {t('finance:account.countLine', { amount: fmt.money(q.data.lastCount.counted), date: fmt.date(q.data.lastCount.onDate), witness: q.data.lastCount.witnessedByName ?? t('finance:account.notWitnessed') })}
                  </Fact>
                )}
              </FactGrid>
              {a.kind === 'bank' && <p className="text-sm text-muted">{t('finance:account.beneficiaryNote')}</p>}
            </section>
          ) : tab === 'cashbook' ? (
            <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" data-testid="account-cashbook">
              {!book.data ? (
                <Loading lines={5} />
              ) : book.data.lines.length === 0 ? (
                <EmptyState title={t('finance:cashbook.emptyTitle')} body={t('finance:cashbook.emptyBody')} />
              ) : (
                <ul className="divide-y divide-border/70">
                  {book.data.lines.map((l) => (
                    <li key={l.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <span className="min-w-0">
                        <Link href={l.href}>
                          <bdi dir="ltr" className="ltr-ref">{l.sourceRef}</bdi>
                        </Link>
                        <span className="block text-xs text-muted">
                          {fmt.date(l.date)} · <EvidenceText evidence={l.evidence} />
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <Money value={l.amount} className={l.direction === 'in' ? 'font-semibold text-success' : 'font-semibold'} />
                        <span className="text-xs text-muted">{t(l.direction === 'in' ? 'finance:cashbook.in' : 'finance:cashbook.out')}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={FINANCE.cashbook({ account: accountId })}>{t('finance:account.openCashbook')}</Link>
            </section>
          ) : tab === 'lines' ? (
            <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" data-testid="account-lines">
              <p className="text-sm text-muted">{t('finance:account.linesIntro', { count: q.data!.statements.length })}</p>
              {q.data!.lines.length === 0 ? (
                <EmptyState title={t('finance:account.noLines')} />
              ) : (
                <ScrollRegion label={t('finance:account.tabs.lines')}>
                  <table className="w-full min-w-[44rem] text-sm">
                    <thead className="text-xs text-muted">
                      <tr className="border-b border-border">
                        <th scope="col" className="py-2 pe-3 text-start font-medium">{t('finance:cashbook.date')}</th>
                        <th scope="col" className="py-2 pe-3 text-start font-medium">{t('finance:account.lineRef')}</th>
                        <th scope="col" className="py-2 pe-3 text-start font-medium">{t('finance:account.lineState')}</th>
                        <th scope="col" className="py-2 text-end font-medium">{t('finance:account.lineAmount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.data!.lines.map((l) => (
                        <tr key={l.id} className="border-b border-border/60" data-testid="account-line">
                          <td className="py-2 pe-3 text-muted">{fmt.date(l.valueDate)}</td>
                          <td className="py-2 pe-3">
                            <bdi dir="ltr" className="ltr-ref">{l.bankTxnId}</bdi>
                            <span className="block text-xs text-muted">
                              <bdi>{l.counterpartyName}</bdi> · <bdi dir="ltr" className="ltr-ref">{l.reference}</bdi>
                            </span>
                          </td>
                          <td className="py-2 pe-3">
                            <BankLineBadge state={l.state} />
                          </td>
                          <td className="py-2 text-end">
                            <Money value={l.amount} className={l.direction === 'debit' ? 'font-semibold' : 'font-semibold text-success'} /> <span className="text-xs text-muted">{t(l.direction === 'debit' ? 'finance:account.debit' : 'finance:account.credit')}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollRegion>
              )}
            </section>
          ) : tab === 'reconciliation' ? (
            <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" data-testid="account-reconciliation">
              {book.data?.reconciliation.map((r) => (
                <FactGrid key={r.accountId}>
                  <Fact label={t('finance:cashbook.bookMovement')}>
                    <Money value={r.cashbookMovement} />
                  </Fact>
                  <Fact label={t('finance:cashbook.statementMovement')}>
                    <Money value={r.statementMovement} />
                  </Fact>
                  <Fact label={t('finance:cashbook.difference')}>
                    <Money value={r.difference} />
                  </Fact>
                  <Fact label={t('finance:account.unmatched')}>{t('finance:kpi.lines', { count: r.unmatchedLines })}</Fact>
                </FactGrid>
              ))}
              <Link href={COLLECTIONS.reconciliation}>{t('finance:account.openReconciliation')}</Link>
            </section>
          ) : (
            <section className="space-y-3 rounded-card bg-panel p-5 shadow-card" data-testid="account-history">
              {q.data!.history.length === 0 ? <p className="text-sm text-muted">{t('finance:close.noHistory')}</p> : <HistoryList label={t('finance:account.tabs.history')} items={q.data!.history.map((h) => ({ at: h.at, byName: h.byName, label: t(`finance:account.events.${h.action}` as 'finance:account.events.opening_approved'), ...(h.note ? { note: h.note } : {}) }))} />}
            </section>
          )
        }
      </UrlTabs>
    </div>
  );
}
