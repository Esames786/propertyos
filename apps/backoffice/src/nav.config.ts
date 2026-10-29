import { TENANT_NAV, type NavItem } from '@repo/ui';

/**
 * Main sidebar (blueprint 01 §7). The model is shared with Platform HQ's "Preview as client" so the
 * preview shows a tenant's actual menu; what each person sees is limited by their organisation's
 * licensed modules and their own permissions (V3.1 effective access).
 */
export const NAV_ITEMS: NavItem[] = TENANT_NAV;

/** The demo's frozen "today" (fixtures' ACCESS_TODAY); access and labels are evaluated on it. */
export const ACCESS_DATE = '2026-10-26';

/** The resident app in this browser (same host, port 5174 unless VITE_CUSTOMER_ORIGIN says otherwise). */
export const customerOrigin = () => (import.meta.env.VITE_CUSTOMER_ORIGIN as string | undefined) ?? `${window.location.protocol}//${window.location.hostname}:5174`;

export const LINKS = {
  start: '/backoffice/home/role-aware-dashboard',
  /** GLOBAL-010 appearance and accessibility (the personalization hub). */
  preferences: '/backoffice/global/accessibility-preferences',
  /** GLOBAL-008 profile, signed-in devices and security activity (Gate D.1). */
  profile: '/backoffice/global/profile--preferences',
  /** GLOBAL-015: where a switch ticket opens the resident app. */
  appSwitchUrl: (token: string) => `${customerOrigin()}/shared/auth/switch/${token}`,
  signIn: '/backoffice/sign-in',
  getStarted: '/backoffice/get-started',
  demoLaunch: '/backoffice/get-started/demo',
  workspaceSetup: '/backoffice/get-started/setup',
  tourLibrary: '/backoffice/help/tours',
  salesHome: '/backoffice/crm/sales-home',
  leads: '/backoffice/crm/leads-list',
  leadWorkspace: (leadId: string) => `/backoffice/crm/lead-360-workspace?record=${leadId}`,
  more: '/backoffice/more',
  /** ADM-023 Your plan & modules (read-only, administrators). */
  plan: '/backoffice/adm/plan',
  /** My access: what this person can use, for everyone (no commercial information). */
  myAccess: '/backoffice/global/my-access',
  /** FIN-002 invoices (read-only financial history). */
  invoices: '/backoffice/fin/invoices-list',
} as const;

/** Society setup and monthly billing (Gate C.1). Addresses follow the screen register. */
const q = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return s ? `?${s}` : '';
};
export const SOCIETY = {
  sites: '/backoffice/sites',
  site: (siteId: string, tab?: string) => `/backoffice/sites/${siteId}${q({ tab })}`,
  structure: (siteId: string, building?: string) => `/backoffice/sites/${siteId}/structure${q({ building })}`,
  importFlats: (siteId: string) => `/backoffice/sites/${siteId}/import`,
  unitTypes: (siteId: string) => `/backoffice/sites/${siteId}/unit-types`,
  openingBalances: (siteId: string) => `/backoffice/sites/${siteId}/opening-balances`,
  flat: (siteId: string, flatId: string, tab?: string) => `/backoffice/sites/${siteId}/units/${flatId}${q({ tab })}`,
  people: (role?: string) => `/backoffice/cus/customers-list${q({ role })}`,
  person: (partyId: string, tab?: string) => `/backoffice/cus/customer-360-workspace${q({ record: partyId, tab })}`,
  roster: (occupancy?: string) => `/backoffice/res/occupancy-list${q({ occupancy })}`,
  accounts: (status?: string) => `/backoffice/billing/accounts${q({ status })}`,
  account: (accountId: string, tab?: string) => `/backoffice/billing/accounts/${accountId}${q({ tab })}`,
  charges: '/backoffice/billing/charges',
  rules: (flat?: string) => `/backoffice/billing/rules${q({ flat })}`,
  exemptions: '/backoffice/billing/exemptions',
  runs: '/backoffice/billing/runs',
  newRun: '/backoffice/billing/runs/new',
  run: (runId: string, tab?: string) => `/backoffice/billing/runs/${runId}${q({ tab })}`,
  invoices: (params: Record<string, string | undefined> = {}) => `/backoffice/fin/invoices-list${q(params)}`,
  invoice: (invoiceId: string, drawer?: string) => `/backoffice/fin/invoice-workspace${q({ record: invoiceId, drawer })}`,
} as const;

/** Collections (Gate C.2): proofs, payments, receipts, the bank, reconciliation and reporting. */
export const COLLECTIONS = {
  dashboard: '/backoffice/col/collections-dashboard',
  inbox: (state?: string) => `/backoffice/fin/unverified-transfers-queue${q({ state })}`,
  review: (submissionId: string) => `/backoffice/fin/transfer-proof-review${q({ record: submissionId })}`,
  payments: (params: Record<string, string | undefined> = {}) => `/backoffice/fin/payment-list${q(params)}`,
  payment: (paymentId: string, tab?: string) => `/backoffice/fin/payment-workspace${q({ record: paymentId, tab })}`,
  officePayment: (account?: string) => `/backoffice/fin/payment-list${q({ drawer: 'office', account })}`,
  credits: '/backoffice/fin/customer-credit-overpayments',
  aging: (bucket?: string) => `/backoffice/col/aging-breakdown${q({ bucket })}`,
  statement: (account?: string) => `/backoffice/col/customer-statement${q({ account })}`,
  bankFeed: (state?: string) => `/backoffice/bank/bank-transaction-feed${q({ state })}`,
  reconciliation: '/backoffice/bank/reconciliation-workspace',
  payerChanges: (state?: string) => `/backoffice/billing/payer-changes${q({ state })}`,
} as const;

export const TOUR_LINKS = {
  start: LINKS.start,
  help: '/backoffice/global/context-help',
  library: '/backoffice/help/tours',
  practice: '/backoffice/help/practice',
  textGuide: (tourId: string) => `/backoffice/help/tours/${tourId}/text`,
};
