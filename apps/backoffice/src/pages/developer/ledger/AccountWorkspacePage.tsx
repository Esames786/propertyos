import { ApiError, type GlAccountWorkspace } from '@repo/contracts';
import { Badge, EmptyState, ErrorState, KeyValueList, Link, Money, NotFoundState, PageHeader, Panel, useApiQuery, useQueryParam, useSession, useT } from '@repo/ui';
import type { ReactNode } from 'react';
import { Landmark } from 'lucide-react';
import { Loading, ScrollRegion, useSocietyFormat } from '../../society/kit';
import { ACC, BANK_VIEW, History, JournalBadge, LedgerNav, LockBadge, ProvisionalNotice, Ref, useAccountName } from './lkit';

/**
 * ACC-002 Account workspace (PARTIAL, Gate E.7 Wave 1): one ledger account (`?record=`), its balance
 * from posted lines only, every posted line with a running balance and a link to its journal, the
 * journals not posted yet (never in the balance) and the account's history. For a cash-at-bank account
 * a holder of the bank permission also sees the bank account it stands for (masked) and how many
 * unmatched statement lines that account has, with a link to the bank import; anyone else sees neither.
 */
export default function AccountWorkspacePage() {
  const { t } = useT();
  const [record] = useQueryParam('record');
  const q = useApiQuery<GlAccountWorkspace>(record ? { method: 'GET', path: `/ledger/accounts/${record}` } : null);
  if (!record) {
    return (
      <div className="space-y-5" data-testid="account-choose">
        <LedgerNav current={null} />
        <EmptyState title={t('ledger:account.choose')} actions={<Link href={ACC.chart()}>{t('ledger:account.toChart')}</Link>} />
      </div>
    );
  }
  if (q.error instanceof ApiError && q.error.problem.status === 404) return <NotFoundState headingLevel={1} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  return <Workspace w={q.data} />;
}

function Workspace({ w }: { w: GlAccountWorkspace }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const name = useAccountName();
  const { allows } = useSession();
  const a = w.account;
  return (
    <div className="@container space-y-5" data-testid="account-workspace" data-code={a.code}>
      <PageHeader title={`${a.code} · ${name(a)}`} description={w.entity.name} badge={<Badge tone="neutral" icon={Landmark}>{t(`ledger:accountType.${a.type}`)}</Badge>} />
      <LedgerNav current={null} entity={w.entity.id} />
      <ProvisionalNotice screen="account" />
      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-3">
        <Panel title={t('ledger:account.summaryTitle')} className="@4xl:col-span-1">
          <KeyValueList
            items={[
              { label: t('ledger:account.balance'), value: <span data-testid="account-balance" data-amount={a.normalBalance.amount}><Money value={a.normalBalance} /> · {t(`ledger:normal.${a.normal}`)}</span> },
              { label: t('ledger:account.postedLines'), value: fmt.count(a.postedLines) },
              { label: t('ledger:account.pendingLines'), value: fmt.count(a.pendingLines) },
              { label: t('ledger:account.since'), value: a.sinceVersion ? t('ledger:chart.version', { version: a.sinceVersion }) : '—' },
            ]}
          />
          {a.lock && (
            <div className="mt-3 space-y-1">
              <LockBadge lock={a.lock} />
              <p className="text-xs break-words text-muted">{t(`ledger:lock.${a.lock}Hint`)}</p>
            </div>
          )}
          {a.bank && (
            <div className="mt-3 space-y-1 text-sm" data-testid="account-bank">
              <p className="font-semibold">{t('ledger:account.bankTitle')}</p>
              <p>
                <bdi>{a.bank.name}</bdi> · <bdi>{a.bank.bankName}</bdi> · <bdi dir="ltr">{a.bank.ibanMasked}</bdi>
              </p>
              {w.statementLines && (
                <p className="text-muted" data-testid="account-statement-lines">
                  {t('ledger:account.unmatched', { count: w.statementLines.count, credits: fmt.money(w.statementLines.credits), debits: fmt.money(w.statementLines.debits) })}
                </p>
              )}
              {allows(BANK_VIEW) && <Link href={ACC.bankImport({ entity: w.entity.id })}>{t('ledger:account.toBank')}</Link>}
              <p className="text-xs text-muted">{t('ledger:account.bankNote')}</p>
            </div>
          )}
        </Panel>
        <Panel title={t('ledger:account.linesTitle')} className="@4xl:col-span-2">
          {w.lines.length === 0 ? (
            <EmptyState title={t('ledger:account.noLines')} body={a.lock === 'cash_evidence' ? t('ledger:lock.cash_evidenceHint') : undefined} />
          ) : (
            <>
              <ol className="space-y-2 @min-[56em]:hidden" aria-label={t('ledger:account.linesTitle')} data-testid="account-lines-list">
                {w.lines.map((l) => (
                  <li key={`${l.journalId}-${l.journalRef}-${l.running.amount}`} className="rounded-tile border border-border/70 p-3 text-sm" data-testid="account-line" data-ref={l.journalRef}>
                    <p className="flex flex-wrap justify-between gap-2">
                      <Link href={ACC.journal(l.journalId)}>
                        <Ref value={l.journalRef} />
                      </Link>
                      <bdi>{fmt.date(l.date)}</bdi>
                    </p>
                    <p className="break-words text-muted">{l.memo}</p>
                    <dl className="mt-1 grid grid-cols-1 gap-1">
                      <Pair label={t('ledger:journal.debit')}>
                        <Money value={l.debit} />
                      </Pair>
                      <Pair label={t('ledger:journal.credit')}>
                        <Money value={l.credit} />
                      </Pair>
                      <Pair label={t('ledger:account.running')}>
                        <Money value={l.running} />
                      </Pair>
                    </dl>
                  </li>
                ))}
              </ol>
              <div className="hidden @min-[56em]:block">
                <ScrollRegion label={t('ledger:account.linesTitle')}>
                  <table className="w-full min-w-[44rem] text-sm" data-testid="account-lines">
                    <thead className="text-xs text-muted">
                      <tr className="border-b border-border">
                        <th scope="col" className="py-2 pe-3 text-start font-medium">{t('ledger:account.date')}</th>
                        <th scope="col" className="py-2 pe-3 text-start font-medium">{t('ledger:account.journal')}</th>
                        <th scope="col" className="py-2 pe-3 text-end font-medium">{t('ledger:journal.debit')}</th>
                        <th scope="col" className="py-2 pe-3 text-end font-medium">{t('ledger:journal.credit')}</th>
                        <th scope="col" className="py-2 text-end font-medium">{t('ledger:account.running')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {w.lines.map((l) => (
                        <tr key={`${l.journalId}-${l.running.amount}`} className="border-b border-border/60 align-top" data-testid="account-line" data-ref={l.journalRef}>
                          <td className="py-2 pe-3"><bdi>{fmt.date(l.date)}</bdi></td>
                          <td className="py-2 pe-3">
                            <Link href={ACC.journal(l.journalId)}>
                              <Ref value={l.journalRef} />
                            </Link>
                            <span className="block text-xs break-words text-muted">{l.memo}</span>
                          </td>
                          <td className="py-2 pe-3 text-end"><Money value={l.debit} /></td>
                          <td className="py-2 pe-3 text-end"><Money value={l.credit} /></td>
                          <td className="py-2 text-end"><Money value={l.running} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollRegion>
              </div>
            </>
          )}
        </Panel>
      </div>
      <Panel title={t('ledger:account.pendingTitle')}>
        {w.pending.length === 0 ? (
          <p className="text-sm text-muted">{t('ledger:account.noPending')}</p>
        ) : (
          <ul className="divide-y divide-border/70" data-testid="account-pending">
            {w.pending.map((p, i) => (
              <li key={`${p.journalId}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={ACC.journal(p.journalId)}>
                    <Ref value={p.journalRef} />
                  </Link>
                  <JournalBadge state={p.state} />
                </span>
                <span>
                  {p.debit.amount !== '0.00' ? <Money value={p.debit} /> : <Money value={p.credit} />} · {t(p.debit.amount !== '0.00' ? 'ledger:journal.debit' : 'ledger:journal.credit')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">{t('ledger:account.pendingNote')}</p>
      </Panel>
      <Panel title={t('ledger:account.historyTitle')}>
        <History events={w.history} testId="account-history" />
      </Panel>
    </div>
  );
}

function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
