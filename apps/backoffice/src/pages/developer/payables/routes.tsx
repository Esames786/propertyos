import type { AccessTarget } from '@repo/contracts';
import { NotFoundState, useQueryParam, useT } from '@repo/ui';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { DevScreen, devRoute } from '../../../prototype/dev-screen';
import { EXP_TARGET, LinkButton, PAY, SUP_TARGET } from './apkit';

/**
 * Gate E.8 (integration candidate): the 17 payables and expenses screens at the
 * register's addresses (SUP-001…008, EXP-001…009), registered once in E.0's `DEVELOPER_AREAS`. Each
 * screen is wrapped in E.0's `DevScreen`: developer organisations only (the DEV edition; the payables state
 * exists only for them and the COMM edition is not served until edition licensing is approved) and the
 * register's view permission.
 *
 * Wave 2 integration (canonical seam notes §4): a person of a served edition whom the target refuses gets the
 * Gate B access outcome in words (`refusal="outcome"`, as E.2, E.7 and E.13), never data; an organisation of
 * another edition gets the register's page. Record screens are `DevScreen`s whose page reads its own
 * `?record` (as E.2's Project 360): an address without a record of the screen's kind answers exactly like a
 * record never issued, and the server refuses an out-of-scope id the same way.
 */
const named = <K extends string>(loader: () => Promise<Record<K, ComponentType<never>>>, name: K) => lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));

/** Where each record screen's "not found" answer leads back to (the same as the page's own 404). */
const BACK = {
  supplier: { href: PAY.suppliers(), labelKey: 'payables:suppliers.back' },
  bill: { href: PAY.bills(), labelKey: 'payables:bills.back' },
  expense: { href: PAY.expenses(), labelKey: 'payables:expenses.back' },
  budget: { href: PAY.budgets(), labelKey: 'payables:budgets.back' },
} as const;
type Back = (typeof BACK)[keyof typeof BACK];

function NoRecord({ back }: { back: Back }) {
  const { t } = useT();
  return <NotFoundState headingLevel={1} actions={<LinkButton href={back.href}>{t(back.labelKey)}</LinkButton>} />;
}

const record = <K extends string>(loader: () => Promise<Record<K, ComponentType<{ id: string }>>>, name: K, prefix: string, back: Back) =>
  lazy(() =>
    loader().then((m) => {
      const Page: ComponentType<{ id: string }> = m[name];
      function RecordScreen() {
        const [id] = useQueryParam('record');
        return id && id.startsWith(prefix) ? <Page id={id} /> : <NoRecord back={back} />;
      }
      return { default: RecordScreen };
    }),
  );

const suppliers = () => import('./SupplierPages');
const bills = () => import('./BillPages');
const expenses = () => import('./ExpensePages');
const budgets = () => import('./BudgetPages');

const Suppliers = named(suppliers, 'SuppliersPage');
const Supplier360 = record(suppliers, 'Supplier360Page', 'sup_', BACK.supplier);
const Ledger = named(suppliers, 'SupplierLedgerPage');
const Bills = named(bills, 'BillsPage');
const Bill = record(bills, 'BillWorkspacePage', 'sbl_', BACK.bill);
const Utilities = named(bills, 'UtilitiesPage');
const NewBill = lazy(() => import('./NewBillPage'));
const Payments = lazy(() => import('./PaymentPages'));
const Expenses = named(expenses, 'ExpensesPage');
const Expense = record(expenses, 'ExpenseWorkspacePage', 'exp_', BACK.expense);
const Approvals = named(expenses, 'ExpenseApprovalsPage');
const Employee = named(expenses, 'EmployeeExpensesPage');
const NewExpense = lazy(() => import('./NewExpensePage'));
const PettyCash = lazy(() => import('./PettyCashPage'));
const Budgets = named(budgets, 'BudgetsPage');
const Budget = record(budgets, 'BudgetWorkspacePage', 'bud_', BACK.budget);
const Bva = named(budgets, 'BudgetVsActualPage');

/** Every E.8 screen: DEV edition (E.0's default), the register's view permission, the access outcome on refusal. */
const screen = (page: LazyExoticComponent<ComponentType>, target: AccessTarget) => <DevScreen page={page} target={target} refusal="outcome" />;

/** Route objects built with E.0's `devRoute` (the prototype owns the router types). */
export const routes = [
  devRoute('sup/suppliers-list', screen(Suppliers, SUP_TARGET), (t) => t('payables:suppliers.title')),
  devRoute('sup/supplier-360-workspace', screen(Supplier360, SUP_TARGET), (t) => t('payables:supplier.title')),
  devRoute('sup/supplier-bills-list', screen(Bills, SUP_TARGET), (t) => t('payables:bills.title')),
  devRoute('sup/supplier-bill-workspace', screen(Bill, SUP_TARGET), (t) => t('payables:bill.title')),
  devRoute('sup/new-supplier-bill', screen(NewBill, SUP_TARGET), (t) => t('payables:newBill.title')),
  devRoute('sup/supplier-payment-drawer', screen(Payments, SUP_TARGET), (t) => t('payables:payments.title')),
  devRoute('sup/supplier-ledger', screen(Ledger, SUP_TARGET), (t) => t('payables:ledger.title')),
  devRoute('sup/utilities-bills-register', screen(Utilities, SUP_TARGET), (t) => t('payables:utilities.title')),
  devRoute('exp/expenses-list', screen(Expenses, EXP_TARGET), (t) => t('payables:expenses.title')),
  devRoute('exp/new-expense', screen(NewExpense, EXP_TARGET), (t) => t('payables:newExpense.title')),
  devRoute('exp/expense-workspace', screen(Expense, EXP_TARGET), (t) => t('payables:expense.title')),
  devRoute('exp/expense-approvals', screen(Approvals, EXP_TARGET), (t) => t('payables:approvals.title')),
  devRoute('exp/petty-cash', screen(PettyCash, EXP_TARGET), (t) => t('payables:petty.title')),
  devRoute('exp/employee-expenses', screen(Employee, EXP_TARGET), (t) => t('payables:employee.title')),
  devRoute('exp/budget-list', screen(Budgets, EXP_TARGET), (t) => t('payables:budgets.title')),
  devRoute('exp/budget-workspace', screen(Budget, EXP_TARGET), (t) => t('payables:budget.title')),
  devRoute('exp/budget-vs-actual', screen(Bva, EXP_TARGET), (t) => t('payables:bva.title')),
];
