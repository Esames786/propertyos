import type { BalanceSheet, LedgerScope, ProfitAndLoss, StatementSection, TrialBalance } from '@repo/contracts';
import { Badge, EmptyState, ErrorState, InlineAlert, Link, PageHeader, Panel, SelectControl, useApiQuery, useQueryParam, useT } from '@repo/ui';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Loading, ScrollRegion, useSocietyFormat } from '../../society/kit';
import { unbroken } from '../../society/hr/hkit';
import { ACC, AccountRef, EntityBar, LedgerNav, ProvisionalNotice, useAccountName, useEntityParam, KEEP, Amount } from './lkit';

/**
 * ACC-006 Trial balance, ACC-007 Profit and loss, ACC-008 Balance sheet (PARTIAL, Gate E.7 Wave 1).
 * Three readings of the same posted lines of one legal entity, at the end of a chosen month (or the
 * demo date for the current month). Each shows its ties in words: debits equal credits; assets equal
 * liabilities plus equity plus the current result; the current result equals the profit and loss.
 * The profit and loss is a management view: no revenue recognition policy is set (E-15). Every account
 * opens its workspace. Tables become lists on phones and at large text sizes.
 */
function useReport<T extends LedgerScope & { period: string; periods: string[] }>(path: string) {
  const [entity, setEntity] = useEntityParam();
  const [period, setPeriod] = useQueryParam('period');
  const q = useApiQuery<T>({ method: 'GET', path, query: { ...(entity ? { entity } : {}), ...(period ? { period } : {}) } }, KEEP);
  return { q, entity, setEntity, setPeriod };
}

function PeriodBar({ scope, period, periods, onEntity, onPeriod, asOf }: { scope: LedgerScope; period: string; periods: string[]; onEntity: (id: string) => void; onPeriod: (p: string | null) => void; asOf: string }) {
  const { t } = useT();
  const fmt = useSocietyFormat();
  return (
    <div className="space-y-3">
      <EntityBar scope={scope} onChange={onEntity} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <SelectControl label={t('ledger:reports.period')} options={[...periods].reverse().map((p) => ({ id: p, label: fmt.period(p) }))} value={period} onChange={(p) => onPeriod(p)} testId="report-period" />
        </div>
        <p className="text-sm text-muted" data-testid="report-as-of" data-as-of={asOf}>
          {t('ledger:reports.asOf', { date: fmt.date(asOf) })}
        </p>
      </div>
    </div>
  );
}

function Tie({ ok, children, testId }: { ok: boolean; children: string; testId: string }) {
  return (
    <li className="flex items-start gap-2 text-sm" data-testid={testId} data-ok={ok}>
      {ok ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> : <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />}
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// ACC-006 Trial balance
// ---------------------------------------------------------------------------------------------

export function TrialBalancePage() {
  const { t } = useT();
  const name = useAccountName();
  const { q, setEntity, setPeriod } = useReport<TrialBalance>('/ledger/trial-balance');
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="ledger-tb" data-balanced={d.balanced} data-debit={d.totals.debit.amount} data-credit={d.totals.credit.amount}>
      <PageHeader title={t('ledger:tb.title')} description={t('ledger:tb.intro')} />
      <LedgerNav current="trialBalance" entity={d.entity.id} />
      <ProvisionalNotice screen="reports" />
      <PeriodBar scope={d} period={d.period} periods={d.periods} asOf={d.asOf} onEntity={setEntity} onPeriod={setPeriod} />
      <Panel title={t('ledger:tb.tableTitle', { count: d.postedJournals })}>
        {d.rows.length === 0 ? (
          <EmptyState title={t('ledger:reports.empty')} />
        ) : (
          <>
            <ol className="space-y-2 @min-[48em]:hidden" aria-label={t('ledger:tb.tableTitle', { count: d.postedJournals })} data-testid="tb-list">
              {d.rows.map((r) => (
                <li key={r.accountId} className="rounded-tile border border-border/70 p-3 text-sm" data-testid="tb-row" data-code={r.code}>
                  <AccountRef code={r.code} name={name(r)} href={ACC.account(r.accountId)} />
                  <dl className="mt-1 grid grid-cols-1 gap-1">
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-muted">{t('ledger:journal.debit')}</dt>
                      <dd><Amount value={r.debit} /></dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="text-muted">{t('ledger:journal.credit')}</dt>
                      <dd><Amount value={r.credit} /></dd>
                    </div>
                  </dl>
                </li>
              ))}
              <li className="space-y-1 rounded-tile bg-sunken p-3 text-sm font-semibold">
                <p>{t('ledger:journal.totals')}</p>
                <p><Amount value={d.totals.debit} /> / <Amount value={d.totals.credit} /></p>
              </li>
            </ol>
            <div className="hidden @min-[48em]:block">
              <ScrollRegion label={t('ledger:tb.tableTitle', { count: d.postedJournals })}>
                <table className="w-full min-w-[40rem] text-sm" data-testid="tb-table">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 pe-3 text-start font-medium">{t('ledger:journal.account')}</th>
                      <th scope="col" className="py-2 pe-3 text-end font-medium">{t('ledger:journal.debit')}</th>
                      <th scope="col" className="py-2 text-end font-medium">{t('ledger:journal.credit')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.accountId} className="border-b border-border/60" data-testid="tb-row" data-code={r.code}>
                        <td className="py-2 pe-3"><AccountRef code={r.code} name={name(r)} href={ACC.account(r.accountId)} /></td>
                        <td className="py-2 pe-3 text-end"><Amount value={r.debit} /></td>
                        <td className="py-2 text-end"><Amount value={r.credit} /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <th scope="row" className="py-2 pe-3 text-start">{t('ledger:journal.totals')}</th>
                      <td className="py-2 pe-3 text-end" data-testid="tb-total-debit"><Amount value={d.totals.debit} /></td>
                      <td className="py-2 text-end" data-testid="tb-total-credit"><Amount value={d.totals.credit} /></td>
                    </tr>
                  </tfoot>
                </table>
              </ScrollRegion>
            </div>
          </>
        )}
      </Panel>
      <Panel title={t('ledger:reports.tiesTitle')}>
        <ul className="space-y-2">
          <Tie ok={d.balanced} testId="tie-tb">{t(d.balanced ? 'ledger:reports.tie.tb' : 'ledger:reports.tie.tbFail')}</Tie>
        </ul>
        <p className="mt-3 text-sm">
          <Link href={ACC.profitAndLoss({ entity: d.entity.id, period: d.period })}>{t('ledger:nav.profitAndLoss')}</Link> · <Link href={ACC.balanceSheet({ entity: d.entity.id, period: d.period })}>{t('ledger:nav.balanceSheet')}</Link>
        </p>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Statement sections (P&L and balance sheet)
// ---------------------------------------------------------------------------------------------

function Section({ title, section, testId, total }: { title: string; section: StatementSection; testId: string; total: string }) {
  const { t } = useT();
  const name = useAccountName();
  return (
    <section aria-label={title} className="space-y-2" data-testid={testId} data-total={section.total.amount}>
      <h3 className="font-semibold">{title}</h3>
      {section.rows.length === 0 ? (
        <p className="text-sm text-muted">{t('ledger:reports.nothing')}</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {section.rows.map((r) => (
            <li key={r.accountId} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm" data-testid="statement-row" data-code={r.code}>
              <span className="min-w-0"><AccountRef code={r.code} name={name(r)} href={ACC.account(r.accountId)} /></span>
              <Amount value={r.amount} />
            </li>
          ))}
        </ul>
      )}
      <p className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-sm font-semibold">
        <span>{total}</span>
        <Amount value={section.total} />
      </p>
    </section>
  );
}

function Statement({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-2">{children}</div>;
}

// ---------------------------------------------------------------------------------------------
// ACC-007 Profit and loss (management view, E-15)
// ---------------------------------------------------------------------------------------------

export function ProfitAndLossPage() {
  const { t } = useT();
  const fmt = useSocietyFormat();
  const { q, setEntity, setPeriod } = useReport<ProfitAndLoss>('/ledger/profit-and-loss');
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="ledger-pl" data-result={d.result.amount}>
      <PageHeader title={t('ledger:pl.title')} description={t('ledger:pl.intro')} badge={<Badge tone="warning" icon={TriangleAlert}>{t('ledger:pl.managementView')}</Badge>} />
      <LedgerNav current="profitAndLoss" entity={d.entity.id} />
      <ProvisionalNotice screen="reports" />
      <InlineAlert tone="warning" title={unbroken(t('ledger:pl.policyTitle'))} data-testid="profit-revenue-policy">
        {unbroken(t('ledger:pl.policy'))}
      </InlineAlert>
      <PeriodBar scope={d} period={d.period} periods={d.periods} asOf={d.to} onEntity={setEntity} onPeriod={setPeriod} />
      <Panel title={t('ledger:pl.rangeTitle', { from: fmt.date(d.from), to: fmt.date(d.to) })}>
        <div className="space-y-5">
          <Statement>
            <Section title={t('ledger:pl.income')} section={d.income} testId="profit-income" total={t('ledger:pl.totalIncome')} />
            <Section title={t('ledger:pl.expenses')} section={d.expenses} testId="profit-expenses" total={t('ledger:pl.totalExpenses')} />
          </Statement>
          <p className="flex flex-wrap justify-between gap-2 rounded-tile bg-sunken p-3 text-base font-bold" data-testid="profit-result">
            <span>{t(Number(d.result.amount) < 0 ? 'ledger:pl.loss' : 'ledger:pl.profit')}</span>
            <Amount value={d.result} />
          </p>
        </div>
      </Panel>
      <p className="text-sm">
        <Link href={ACC.balanceSheet({ entity: d.entity.id, period: d.period })}>{t('ledger:pl.toBalanceSheet')}</Link>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// ACC-008 Balance sheet
// ---------------------------------------------------------------------------------------------

export function BalanceSheetPage() {
  const { t } = useT();
  const { q, setEntity, setPeriod } = useReport<BalanceSheet>('/ledger/balance-sheet');
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <Loading lines={10} />;
  const d = q.data;
  return (
    <div className="@container space-y-5" data-testid="ledger-bs" data-balances={d.balances} data-assets={d.assets.total.amount}>
      <PageHeader title={t('ledger:bs.title')} description={t('ledger:bs.intro')} />
      <LedgerNav current="balanceSheet" entity={d.entity.id} />
      <ProvisionalNotice screen="reports" />
      <PeriodBar scope={d} period={d.period} periods={d.periods} asOf={d.asOf} onEntity={setEntity} onPeriod={setPeriod} />
      <Panel title={t('ledger:bs.tableTitle')}>
        <Statement>
          <Section title={t('ledger:bs.assets')} section={d.assets} testId="bs-assets" total={t('ledger:bs.totalAssets')} />
          <div className="space-y-5">
            <Section title={t('ledger:bs.liabilities')} section={d.liabilities} testId="bs-liabilities" total={t('ledger:bs.totalLiabilities')} />
            <Section title={t('ledger:bs.equity')} section={d.equity} testId="bs-equity" total={t('ledger:bs.totalEquity')} />
            <p className="flex flex-wrap justify-between gap-2 text-sm" data-testid="bs-result" data-amount={d.currentResult.amount}>
              <span>{t('ledger:bs.currentResult')}</span>
              <Amount value={d.currentResult} />
            </p>
            <p className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-sm font-semibold" data-testid="bs-right" data-amount={d.liabilitiesEquityResult.amount}>
              <span>{t('ledger:bs.totalRight')}</span>
              <Amount value={d.liabilitiesEquityResult} />
            </p>
          </div>
        </Statement>
      </Panel>
      <Panel title={t('ledger:reports.tiesTitle')}>
        <ul className="space-y-2" data-testid="bs-ties">
          <Tie ok={d.balances} testId="tie-bs">{t(d.balances ? 'ledger:reports.tie.bs' : 'ledger:reports.tie.bsFail')}</Tie>
          <Tie ok={d.resultMatchesProfitAndLoss} testId="tie-pl">{t(d.resultMatchesProfitAndLoss ? 'ledger:reports.tie.pl' : 'ledger:reports.tie.plFail')}</Tie>
          <Tie ok={d.trialBalanceBalanced} testId="tie-tb">{t(d.trialBalanceBalanced ? 'ledger:reports.tie.tb' : 'ledger:reports.tie.tbFail')}</Tie>
        </ul>
        <p className="mt-3 text-sm">
          <Link href={ACC.trialBalance({ entity: d.entity.id, period: d.period })}>{t('ledger:nav.trialBalance')}</Link> · <Link href={ACC.profitAndLoss({ entity: d.entity.id, period: d.period })}>{t('ledger:nav.profitAndLoss')}</Link>
        </p>
        <p className="mt-2 text-xs text-muted">{t('ledger:bs.noYearEnd')}</p>
      </Panel>
    </div>
  );
}
