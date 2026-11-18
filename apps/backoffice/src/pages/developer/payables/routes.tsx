import { lazy } from 'react';
import { DevRecord, DevScreen, devRoute } from '../../../prototype/dev-screen';
import { EXP_TARGET, SUP_TARGET } from './apkit';

/**
 * Gate E.8 (provisional; reconcile at integration): the 17 payables and expenses screens at the
 * register's addresses (SUP-001…008, EXP-001…009), registered once in E.0's `DEVELOPER_AREAS`. Each
 * screen is wrapped in E.0's `DevScreen` / `DevRecord`: developer organisations only (the payables
 * state exists only for them; the COMM edition is not served yet) and the register's view permission.
 * Anyone else gets the register's page at the same address, and the server refuses the same way.
 */
const named = <K extends string>(loader: () => Promise<Record<K, React.ComponentType<never>>>, name: K) => lazy(() => loader().then((m) => ({ default: m[name] as React.ComponentType })));
const record = <K extends string>(loader: () => Promise<Record<K, React.ComponentType<{ id: string }>>>, name: K) => lazy(() => loader().then((m) => ({ default: m[name] })));

const suppliers = () => import('./SupplierPages');
const bills = () => import('./BillPages');
const expenses = () => import('./ExpensePages');
const budgets = () => import('./BudgetPages');

const Suppliers = named(suppliers, 'SuppliersPage');
const Supplier360 = record(suppliers, 'Supplier360Page');
const Ledger = named(suppliers, 'SupplierLedgerPage');
const Bills = named(bills, 'BillsPage');
const Bill = record(bills, 'BillWorkspacePage');
const Utilities = named(bills, 'UtilitiesPage');
const NewBill = lazy(() => import('./NewBillPage'));
const Payments = lazy(() => import('./PaymentPages'));
const Expenses = named(expenses, 'ExpensesPage');
const Expense = record(expenses, 'ExpenseWorkspacePage');
const Approvals = named(expenses, 'ExpenseApprovalsPage');
const Employee = named(expenses, 'EmployeeExpensesPage');
const NewExpense = lazy(() => import('./NewExpensePage'));
const PettyCash = lazy(() => import('./PettyCashPage'));
const Budgets = named(budgets, 'BudgetsPage');
const Budget = record(budgets, 'BudgetWorkspacePage');
const Bva = named(budgets, 'BudgetVsActualPage');

/** Route objects built with E.0's `devRoute` (the prototype owns the router types). */
export const routes = [
  devRoute('sup/suppliers-list', <DevScreen page={Suppliers} target={SUP_TARGET} />, (t) => t('payables:suppliers.title')),
  devRoute('sup/supplier-360-workspace', <DevRecord page={Supplier360} target={SUP_TARGET} prefix="sup_" />, (t) => t('payables:supplier.title')),
  devRoute('sup/supplier-bills-list', <DevScreen page={Bills} target={SUP_TARGET} />, (t) => t('payables:bills.title')),
  devRoute('sup/supplier-bill-workspace', <DevRecord page={Bill} target={SUP_TARGET} prefix="sbl_" />, (t) => t('payables:bill.title')),
  devRoute('sup/new-supplier-bill', <DevScreen page={NewBill} target={SUP_TARGET} />, (t) => t('payables:newBill.title')),
  devRoute('sup/supplier-payment-drawer', <DevScreen page={Payments} target={SUP_TARGET} />, (t) => t('payables:payments.title')),
  devRoute('sup/supplier-ledger', <DevScreen page={Ledger} target={SUP_TARGET} />, (t) => t('payables:ledger.title')),
  devRoute('sup/utilities-bills-register', <DevScreen page={Utilities} target={SUP_TARGET} />, (t) => t('payables:utilities.title')),
  devRoute('exp/expenses-list', <DevScreen page={Expenses} target={EXP_TARGET} />, (t) => t('payables:expenses.title')),
  devRoute('exp/new-expense', <DevScreen page={NewExpense} target={EXP_TARGET} />, (t) => t('payables:newExpense.title')),
  devRoute('exp/expense-workspace', <DevRecord page={Expense} target={EXP_TARGET} prefix="exp_" />, (t) => t('payables:expense.title')),
  devRoute('exp/expense-approvals', <DevScreen page={Approvals} target={EXP_TARGET} />, (t) => t('payables:approvals.title')),
  devRoute('exp/petty-cash', <DevScreen page={PettyCash} target={EXP_TARGET} />, (t) => t('payables:petty.title')),
  devRoute('exp/employee-expenses', <DevScreen page={Employee} target={EXP_TARGET} />, (t) => t('payables:employee.title')),
  devRoute('exp/budget-list', <DevScreen page={Budgets} target={EXP_TARGET} />, (t) => t('payables:budgets.title')),
  devRoute('exp/budget-workspace', <DevRecord page={Budget} target={EXP_TARGET} prefix="bud_" />, (t) => t('payables:budget.title')),
  devRoute('exp/budget-vs-actual', <DevScreen page={Bva} target={EXP_TARGET} />, (t) => t('payables:bva.title')),
];
