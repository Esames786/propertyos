import type { AccessTarget } from '@repo/contracts';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { devRoute, DevScreen } from '../../../prototype/dev-screen';
import { BANK_VIEW, GL_CREATE, GL_VIEW } from './lkit';

/**
 * Gate E.7 area route module: the eleven ledger and bank-import screens at the register's addresses
 * (ACC-001…010, BANK-005), registered once in E.0's `prototype/routes.developer.tsx` (`DEVELOPER_AREAS`,
 * Wave 1 integration). They serve the register's DEV+COMM edition. Each screen asks for its permission;
 * anyone without it gets the Gate B access-outcome page (the server refuses the same way). The menu entry
 * is E.0's canonical Accounting item (`tenantWorkspace.ts`).
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

const screen = (page: LazyExoticComponent<ComponentType>, target: AccessTarget) => <DevScreen page={page} target={target} edition="DEV+COMM" refusal="outcome" />;

export const routes = [
  devRoute('acc/chart-of-accounts', screen(Chart, GL_VIEW), (t) => t('ledger:chart.title')),
  devRoute('acc/account-workspace', screen(Account, GL_VIEW), (t) => t('ledger:account.title')),
  devRoute('acc/journal-entries', screen(Journals, GL_VIEW), (t) => t('ledger:journals.title')),
  devRoute('acc/create-journal', screen(Create, GL_CREATE), (t) => t('ledger:create.title')),
  devRoute('acc/reverse-journal', screen(Reverse, GL_VIEW), (t) => t('ledger:reverse.title')),
  devRoute('acc/trial-balance', screen(TrialBalance, GL_VIEW), (t) => t('ledger:tb.title')),
  devRoute('acc/profit-and-loss', screen(ProfitAndLoss, GL_VIEW), (t) => t('ledger:pl.title')),
  devRoute('acc/balance-sheet', screen(BalanceSheet, GL_VIEW), (t) => t('ledger:bs.title')),
  devRoute('acc/accounting-periods', screen(Periods, GL_VIEW), (t) => t('ledger:periods.title')),
  devRoute('acc/posting-rules', screen(Rules, GL_VIEW), (t) => t('ledger:rules.title')),
  devRoute('bank/bank-import', screen(BankImport, BANK_VIEW), (t) => t('ledger:bank.title')),
];
