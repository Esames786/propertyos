import type { NavItem } from '@repo/ui';
import { Accessibility, FileText, HardHat, History, House, LifeBuoy, ReceiptText, ScrollText, Wallet } from 'lucide-react';

/** Customer portal routes (register URLs, blueprint 06). */
export const PORTAL = {
  home: '/customer/portal/home',
  payments: '/customer/portal/payments-dashboard',
  pay: '/customer/portal/upload-proof-mock',
  receipt: '/customer/portal/receipt',
  construction: '/customer/portal/construction-updates',
  services: '/customer/portal/services-home',
  documents: '/customer/portal/documents',
  accessibility: '/customer/portal/accessibility-preferences',
  tours: '/customer/portal/help/tours',
} as const;

/** Society dues edition (Gate C.2): the same register addresses, plus the dues-only screens. */
export const DUES = {
  home: PORTAL.home,
  bills: PORTAL.payments,
  bill: (invoiceId: string) => `/customer/portal/invoice-detail?record=${invoiceId}`,
  pay: PORTAL.pay,
  payee: '/customer/portal/bank-transfer-details',
  submission: (id: string) => `/customer/portal/submissions/${id}`,
  receipt: (id: string) => `${PORTAL.receipt}?record=${id}`,
  statement: '/customer/portal/statements',
  history: '/customer/portal/payment-history',
  settings: PORTAL.accessibility,
} as const;

const item = (id: string, href: string, icon: NavItem['icon'], labelKey = `portal:nav.${id}`): NavItem => ({ id, labelKey, href, icon, match: href.split('?')[0]! });

const HOME = item('home', PORTAL.home, House);
const PAYMENTS = item('payments', PORTAL.payments, ReceiptText);
const CONSTRUCTION = item('construction', PORTAL.construction, HardHat);
const SERVICES = item('services', PORTAL.services, LifeBuoy);
const DOCUMENTS = item('documents', PORTAL.documents, FileText);
const ACCESSIBILITY = item('accessibility', PORTAL.accessibility, Accessibility);

/** Raised centre button on phones (the most-used job); the rail's primary button on wider screens. */
export const CUSTOMER_CENTRE_ACTION: NavItem = item('pay', PORTAL.pay, Wallet);

/** Phone bottom bar: Home · Payments · (Pay) · Progress · Services. */
export const CUSTOMER_BOTTOM_NAV: NavItem[] = [HOME, PAYMENTS, CONSTRUCTION, SERVICES];

/** Tablet/desktop rail, grouped like the backoffice rail. */
export const CUSTOMER_NAV_GROUPS = [
  { id: 'top', items: [HOME] },
  { id: 'property', labelKey: 'portal:nav.groups.property', items: [PAYMENTS, CONSTRUCTION, DOCUMENTS] },
  { id: 'services', labelKey: 'portal:nav.groups.services', items: [SERVICES] },
  { id: 'account', labelKey: 'portal:nav.groups.account', items: [ACCESSIBILITY] },
];

/** Pages that belong to a nav item without sharing its path. */
export const CUSTOMER_NAV_ALIASES: Record<string, string> = { [PORTAL.receipt]: 'payments' };

// --- Society resident (dues edition) --------------------------------------------------------------

const D_HOME = item('home', DUES.home, House, 'dues:nav.home');
const D_BILLS = item('bills', DUES.bills, ReceiptText, 'dues:nav.bills');
const D_HISTORY = item('history', DUES.history, History, 'dues:nav.history');
const D_STATEMENT = item('statement', DUES.statement, ScrollText, 'dues:nav.statement');
const D_SETTINGS = item('settings', DUES.settings, Accessibility, 'dues:nav.settings');

export const DUES_CENTRE_ACTION: NavItem = item('pay', DUES.pay, Wallet, 'dues:nav.pay');
/** Phone bottom bar: Home · Bills · (Pay) · Receipts · Statement. */
export const DUES_BOTTOM_NAV: NavItem[] = [D_HOME, D_BILLS, D_HISTORY, D_STATEMENT];
export const DUES_NAV_GROUPS = [
  { id: 'top', items: [D_HOME] },
  { id: 'money', labelKey: 'dues:nav.groups.money', items: [D_BILLS, D_HISTORY, D_STATEMENT] },
  { id: 'account', labelKey: 'portal:nav.groups.account', items: [D_SETTINGS] },
];
export const DUES_NAV_ALIASES: Record<string, string> = {
  '/customer/portal/invoice-detail': 'bills',
  [PORTAL.receipt]: 'history',
  '/customer/portal/submissions': 'history',
  '/customer/portal/bank-transfer-details': 'pay',
};

export const START = PORTAL.home;
