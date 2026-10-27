import type { NavItem } from '@repo/ui';
import { Accessibility, FileText, HardHat, House, LifeBuoy, ReceiptText, Wallet } from 'lucide-react';

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

const item = (id: string, href: string, icon: NavItem['icon']): NavItem => ({ id, labelKey: `portal:nav.${id}`, href, icon, match: href });

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

export const START = PORTAL.home;
