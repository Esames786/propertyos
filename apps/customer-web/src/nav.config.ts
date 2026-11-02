import type { NavItem } from '@repo/ui';
import { Accessibility, Building2, FileText, HardHat, HeartHandshake, History, House, LifeBuoy, Megaphone, ReceiptText, ScrollText, UserRound, UsersRound, Wallet, Wrench } from 'lucide-react';

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
  /** PORTAL-024 profile, signed-in devices (PORTAL-041) and my data (Gate D.1). */
  profile: '/customer/portal/profile',
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
const PROFILE = item('profile', PORTAL.profile, UserRound, 'nav:customer.profile');

/** Raised centre button on phones (the most-used job); the rail's primary button on wider screens. */
export const CUSTOMER_CENTRE_ACTION: NavItem = item('pay', PORTAL.pay, Wallet);

/** Phone bottom bar: Home · Payments · (Pay) · Progress · Services. */
export const CUSTOMER_BOTTOM_NAV: NavItem[] = [HOME, PAYMENTS, CONSTRUCTION, SERVICES];

/** Tablet/desktop rail, grouped like the backoffice rail. */
export const CUSTOMER_NAV_GROUPS = [
  { id: 'top', items: [HOME] },
  { id: 'property', labelKey: 'portal:nav.groups.property', items: [PAYMENTS, CONSTRUCTION, DOCUMENTS] },
  { id: 'services', labelKey: 'portal:nav.groups.services', items: [SERVICES] },
  // The buyer's profile is in the account menu; the rail keeps its Stage 1.5R destinations.
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
// Gate D.1: the resident's flats and household (PORTAL-002, PORTAL-003, PORTAL-025).
const D_PROPERTIES = item('properties', '/customer/portal/my-properties', Building2, 'nav:pages.myProperties');
const D_HOUSEHOLD = item('household', '/customer/portal/household', UsersRound, 'nav:pages.household');

/**
 * Gate D.2: resident operations. Requests (repairs, community issues, visitors, vehicles, parking,
 * amenities) and official notices; addresses follow the screen register.
 */
export const OPS = {
  services: '/customer/portal/services-home',
  visitors: '/customer/portal/services-home?tab=visitors',
  invite: '/customer/portal/services-home?tab=visitors&new=1',
  repairs: '/customer/portal/maintenance-workspace',
  repair: (id: string) => `/customer/portal/maintenance-workspace?record=${id}`,
  newRepair: '/customer/portal/maintenance-workspace?new=1',
  issues: '/customer/portal/issues',
  issue: (id: string) => `/customer/portal/issues?record=${id}`,
  raiseIssue: '/customer/portal/issues?new=1',
  notices: '/customer/portal/community-notices',
  notice: (id: string) => `/customer/portal/community-notices/${id}`,
  vehicles: '/customer/portal/vehicles',
  parking: '/customer/portal/parking',
  amenities: '/customer/portal/amenities',
} as const;

/**
 * Gate D.3: the Community home (PORTAL-036, notices summary for every resident; hub tabs where the
 * society has the add-on) and the community chat (PORTAL-031/032).
 */
export const COMMUNITY = {
  home: '/customer/portal/community',
  tab: (tab: string) => `/customer/portal/community?tab=${tab}`,
  chat: '/customer/portal/chat',
  chatGroup: (id: string) => `/customer/portal/chat/${encodeURIComponent(id)}`,
} as const;

const D_REQUESTS = item('requests', OPS.services, Wrench, 'operations:nav.requests');
const D_COMMUNITY = item('community', COMMUNITY.home, HeartHandshake, 'community:nav.community');
const D_NOTICES = item('notices', OPS.notices, Megaphone, 'operations:nav.notices');

export const DUES_CENTRE_ACTION: NavItem = item('pay', DUES.pay, Wallet, 'dues:nav.pay');
/**
 * Phone bottom bar: Home · Bills · (Pay) · Requests · Notices (Gate D.2: purpose first). Receipts and
 * the statement stay one tap away from Bills and Home, and in the rail on larger screens.
 */
export const DUES_BOTTOM_NAV: NavItem[] = [D_HOME, D_BILLS, D_REQUESTS, D_NOTICES];
export const DUES_NAV_GROUPS = [
  { id: 'top', items: [D_HOME] },
  { id: 'money', labelKey: 'dues:nav.groups.money', items: [D_BILLS, D_HISTORY, D_STATEMENT] },
  { id: 'services', labelKey: 'operations:nav.group', items: [D_REQUESTS, D_NOTICES, D_COMMUNITY] },
  { id: 'flats', labelKey: 'portal:nav.groups.property', items: [D_PROPERTIES, D_HOUSEHOLD] },
  { id: 'account', labelKey: 'portal:nav.groups.account', items: [PROFILE, D_SETTINGS] },
];
export const DUES_NAV_ALIASES: Record<string, string> = {
  '/customer/portal/invoice-detail': 'bills',
  [PORTAL.receipt]: 'history',
  '/customer/portal/submissions': 'history',
  '/customer/portal/bank-transfer-details': 'pay',
  '/customer/portal/property-360-workspace': 'properties',
  '/customer/portal/maintenance-workspace': 'requests',
  '/customer/portal/issues': 'requests',
  '/customer/portal/vehicles': 'requests',
  '/customer/portal/parking': 'requests',
  '/customer/portal/amenities': 'requests',
  [COMMUNITY.chat]: 'community',
};

export const START = PORTAL.home;

/** The office app in this browser (same host, port 5173 unless VITE_OFFICE_ORIGIN says otherwise). */
export const officeOrigin = () => (import.meta.env.VITE_OFFICE_ORIGIN as string | undefined) ?? `${window.location.protocol}//${window.location.hostname}:5173`;

/** GLOBAL-015: where a switch ticket opens the office app. */
export const switchToOfficeUrl = (token: string) => `${officeOrigin()}/backoffice/switch/${token}`;
