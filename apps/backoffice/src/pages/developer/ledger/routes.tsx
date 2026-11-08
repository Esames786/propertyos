import type { AccessTarget } from '@repo/contracts';
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { RouteHandle } from '../../../prototype/handle';
import { registerLoader } from '../../../prototype/register';
import { BANK_VIEW, GL_POST, GL_VIEW, LedgerGate } from './lkit';

/**
 * Gate E.7 (provisional; reconcile with E.0's developer route module at Wave 1 integration): the eleven
 * ledger and bank-import screens at the register's addresses (ACC-001…010, BANK-005). Each screen asks
 * for its permission; anyone without it gets the Gate B access-outcome page (the server refuses the
 * same way). No menu entry, quick-create item or edition gate is added here: those come from E.0.
 */
const Chart = lazy(() => import('./ChartPage'));
const Account = lazy(() => import('./AccountWorkspacePage'));
const Journals = lazy(() => import('./JournalsPage'));
const Create = lazy(() => import('./CreateJournalPage'));
const Reverse = lazy(() => import('./ReverseJournalPage'));
const TrialBalance = lazy(() => import('./ReportsPages').then((m) => ({ default: m.TrialBalancePage })));
const ProfitAndLoss = lazy(() => import('./ReportsPages').then((m) => ({ default: m.ProfitAndLossPage })));
const BalanceSheet = lazy(() => import('./ReportsPages').then((m) => ({ default: m.BalanceSheetPage })));
const Periods = lazy(() => import('./PeriodsPage'));
const Rules = lazy(() => import('./PostingRulesPage'));
const BankImport = lazy(() => import('./BankImportPage'));

function Screen({ page: Page, target }: { page: LazyExoticComponent<ComponentType>; target: AccessTarget }) {
  return (
    <LedgerGate target={target}>
      <Suspense fallback={null}>
        <Page />
      </Suspense>
    </LedgerGate>
  );
}

const h = (handle: RouteHandle) => handle;

export const LEDGER_ROUTES = [
  { path: 'acc/chart-of-accounts', loader: registerLoader, element: <Screen page={Chart} target={GL_VIEW} />, handle: h({ title: (t) => t('ledger:chart.title') }) },
  { path: 'acc/account-workspace', loader: registerLoader, element: <Screen page={Account} target={GL_VIEW} />, handle: h({ title: (t) => t('ledger:account.title') }) },
  { path: 'acc/journal-entries', loader: registerLoader, element: <Screen page={Journals} target={GL_VIEW} />, handle: h({ title: (t) => t('ledger:journals.title') }) },
  { path: 'acc/create-journal', loader: registerLoader, element: <Screen page={Create} target={GL_POST} />, handle: h({ title: (t) => t('ledger:create.title') }) },
  { path: 'acc/reverse-journal', loader: registerLoader, element: <Screen page={Reverse} target={GL_VIEW} />, handle: h({ title: (t) => t('ledger:reverse.title') }) },
  { path: 'acc/trial-balance', loader: registerLoader, element: <Screen page={TrialBalance} target={GL_VIEW} />, handle: h({ title: (t) => t('ledger:tb.title') }) },
  { path: 'acc/profit-and-loss', loader: registerLoader, element: <Screen page={ProfitAndLoss} target={GL_VIEW} />, handle: h({ title: (t) => t('ledger:pl.title') }) },
  { path: 'acc/balance-sheet', loader: registerLoader, element: <Screen page={BalanceSheet} target={GL_VIEW} />, handle: h({ title: (t) => t('ledger:bs.title') }) },
  { path: 'acc/accounting-periods', loader: registerLoader, element: <Screen page={Periods} target={GL_VIEW} />, handle: h({ title: (t) => t('ledger:periods.title') }) },
  { path: 'acc/posting-rules', loader: registerLoader, element: <Screen page={Rules} target={GL_VIEW} />, handle: h({ title: (t) => t('ledger:rules.title') }) },
  { path: 'bank/bank-import', loader: registerLoader, element: <Screen page={BankImport} target={BANK_VIEW} />, handle: h({ title: (t) => t('ledger:bank.title') }) },
];
