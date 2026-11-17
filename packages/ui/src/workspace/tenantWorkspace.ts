import { decideTarget, MODULE_KEYS, type AccessDecision, type AccessTarget, type EffectiveAccess, type ModuleKey, type SuspensionClass } from '@repo/contracts';
import { findScreenByRegisterRoute } from '@repo/contracts/screens';
import { ArrowRightLeft, BadgeCheck, Banknote, BarChart3, Briefcase, Building, Building2, Calculator, CalendarClock, Car, ClipboardCheck, Compass, Contact, DatabaseZap, DoorOpen, FileText, FlaskConical, HandCoins, Coins, Home, KeyRound, Landmark, Megaphone, MessagesSquare, MonitorSmartphone, ReceiptText, Scale, Settings2, ShieldCheck, ShoppingCart, Smartphone, Users, UsersRound, Vote, Wallet, Wrench } from 'lucide-react';
import { LIVE, PLANNED } from '../shell/QuickCreateMenu';
import type { NavItem } from '../shell/types';

/**
 * The tenant workspace's navigation model (blueprint 01 §7): Home · Sales · Projects · Customers ·
 * Finance · Procurement · HR · Operations · Residents · Reports · Administration. The backoffice
 * renders it, and Platform HQ's "Preview as client" evaluates the same list against a tenant's
 * grants and a role, so the preview is the client's actual menu, never a copy of it.
 * Each item's module comes from its permission (PERMISSION_MODULE) unless it names one.
 */
export const TENANT_NAV: NavItem[] = [
  { id: 'home', labelKey: 'nav:items.home', href: '/backoffice/home/role-aware-dashboard', icon: Home, match: '/backoffice/home', bottomBar: true, suspension: 'history_read' },
  // A society's everyday areas (Gate C.1): its flats and people, and its monthly billing.
  { id: 'sites', labelKey: 'nav:items.sites', href: '/backoffice/sites', icon: Building, permission: 'site.view', match: '/backoffice/sites', group: 'workspace', bottomBar: true },
  { id: 'billing', labelKey: 'nav:items.billing', href: '/backoffice/billing/runs', icon: ReceiptText, permission: 'billing_run.view', match: '/backoffice/billing', group: 'workspace', bottomBar: true },
  // Collections (Gate C.2): what residents paid, proofs to verify, the bank and reconciliation. Built
  // for societies (monthly dues); other organisations keep these addresses as planned screens, so
  // their menus do not offer them.
  { id: 'collections', labelKey: 'nav:items.collections', href: '/backoffice/col/collections-dashboard', icon: HandCoins, permission: 'collections.view', module: 'dues', match: '/backoffice/col', group: 'workspace', bottomBar: true, suspension: 'history_read' },
  { id: 'bank', labelKey: 'nav:items.bank', href: '/backoffice/bank/reconciliation-workspace', icon: Banknote, permission: 'bank.view', module: 'dues', match: '/backoffice/bank', group: 'workspace', suspension: 'history_read' },
  // Gate S.1: society finance and governance (licensed features of banking, receivables and residents).
  { id: 'finance-overview', labelKey: 'nav:items.financeOverview', href: '/backoffice/fin/finance-dashboard', icon: Wallet, permission: 'cashbook.view', module: 'banking', feature: 'banking.cashbook', match: '/backoffice/fin/finance-dashboard', group: 'workspace', suspension: 'history_read' },
  // Areas without a menu entry: they open from Society finance and need cashbook.view (or bank.view), not
  // the bank feed's bank.view alone, so the building manager who takes cash to the bank can reach them.
  { id: 'cashbook', labelKey: 'nav:pages.cashbook', href: '/backoffice/bank/cashbook', icon: Wallet, anyOf: ['cashbook.view'], module: 'banking', feature: 'banking.cashbook', match: '/backoffice/bank/cashbook', group: 'workspace', suspension: 'history_read', menu: false, hub: 'finance-overview' },
  { id: 'bank-accounts', labelKey: 'nav:pages.bankAccounts', href: '/backoffice/bank/bank-accounts', icon: Wallet, anyOf: ['cashbook.view', 'bank.view'], module: 'banking', feature: 'banking.cashbook', match: '/backoffice/bank/bank-account', group: 'workspace', suspension: 'history_read', menu: false, hub: 'finance-overview' },
  { id: 'deposits-transfers', labelKey: 'nav:pages.transfers', href: '/backoffice/bank/transfers', icon: ArrowRightLeft, anyOf: ['cashbook.view', 'bank.view'], module: 'banking', feature: 'banking.cashbook', match: '/backoffice/bank/transfers', group: 'workspace', suspension: 'history_read', menu: false, hub: 'finance-overview' },
  { id: 'office-collections', labelKey: 'nav:items.officeCollections', href: '/backoffice/fin/office-collections', icon: Coins, anyOf: ['payment.receive', 'payment.batch.confirm'], module: 'receivables', feature: 'receivables.bulk_office_collection', match: '/backoffice/fin/office-collections', group: 'workspace', suspension: 'history_read' },
  { id: 'approvals', labelKey: 'nav:items.approvals', href: '/backoffice/apr/my-approvals', icon: ClipboardCheck, anyOf: ['approval.view', 'approval.decide'], module: 'dues', match: '/backoffice/apr', group: 'workspace', suspension: 'history_read' },
  { id: 'sales', labelKey: 'nav:items.sales', href: '/backoffice/crm/sales-home', icon: Briefcase, permission: 'lead.view', match: '/backoffice/crm', group: 'workspace', bottomBar: true },
  { id: 'projects', labelKey: 'nav:items.projects', href: '/backoffice/prj/projects-list', icon: Building2, permission: 'unit.view', module: 'projects', match: '/backoffice/prj', group: 'workspace', bottomBar: true },
  { id: 'customers', labelKey: 'nav:items.customers', href: '/backoffice/cus/customers-list', icon: Contact, permission: 'customer.view', match: '/backoffice/cus', group: 'workspace', bottomBar: true },
  { id: 'finance', labelKey: 'nav:items.finance', href: '/backoffice/fin/invoices-list', icon: Landmark, permission: 'invoice.view', match: '/backoffice/fin', group: 'workspace', bottomBar: true, suspension: 'history_read' },
  // ---- Gate E.0 (developer ERP areas): offered only to holders of the new permissions, so no existing
  // person's menu changes. No `match` yet: the addresses keep their register gating until the owner
  // decides who else holds gl.view (E-06/E-07; register.spec opens them as the Larkspur manager). ----
  { id: 'accounting', labelKey: 'nav:items.accounting', href: '/backoffice/acc/chart-of-accounts', icon: Scale, permission: 'gl.view', module: 'accounting', group: 'workspace', suspension: 'history_read' },
  // ---- end Gate E.0 ----
  { id: 'procurement', labelKey: 'nav:items.procurement', href: '/backoffice/proc/procurement-overview', icon: ShoppingCart, permission: 'procurement.view', match: '/backoffice/proc', group: 'operations' },
  { id: 'hr', labelKey: 'nav:items.hr', href: '/backoffice/hr/hr-dashboard', icon: UsersRound, permission: 'hr.view', match: '/backoffice/hr', group: 'operations' },
  // Gate S.2a (society HR add-on): the roster and attendance are open to supervisors who record
  // attendance (without staff records), advances to finance (without staff records either).
  { id: 'duty-roster', labelKey: 'nav:items.dutyRoster', href: '/backoffice/hr/roster', icon: CalendarClock, anyOf: ['shifts.manage', 'hr.view', 'attendance.record'], module: 'hr', feature: 'hr.shifts', match: '/backoffice/hr/roster', group: 'operations' },
  { id: 'hr-attendance', labelKey: 'nav:pages.attendance', href: '/backoffice/hr/attendance', icon: CalendarClock, anyOf: ['hr.view', 'attendance.record'], module: 'hr', feature: 'hr.shifts', match: '/backoffice/hr/attendance', group: 'operations', menu: false, hub: 'hr' },
  { id: 'hr-leave', labelKey: 'nav:pages.leaveAdjustments', href: '/backoffice/hr/leave-attendance-adjustments', icon: CalendarClock, anyOf: ['hr.view', 'leave.manage', 'attendance.adjust', 'attendance.record'], module: 'hr', match: '/backoffice/hr/leave-attendance-adjustments', group: 'operations', menu: false, hub: 'hr' },
  { id: 'staff-advances', labelKey: 'nav:items.staffAdvances', href: '/backoffice/hr/employee-advances', icon: HandCoins, anyOf: ['hr.advances.manage', 'hr.advances.approve'], module: 'hr', match: '/backoffice/hr/employee-advance', group: 'operations' },
  // Gate S.2b (society payroll add-on): pay is seen with payroll.view only, never with hr.view.
  { id: 'payroll', labelKey: 'nav:items.payroll', href: '/backoffice/pay/payroll-dashboard', icon: Calculator, permission: 'payroll.view', module: 'payroll', match: '/backoffice/pay', group: 'operations', suspension: 'history_read' },
  // Gate S.3 (rentals add-on, licensed by site): leases for everyone in rentals; the rent roll, owner
  // statements, payouts and settings each need their own permission (and feature) on top.
  { id: 'rentals', labelKey: 'nav:items.rentals', href: '/backoffice/rentals', icon: KeyRound, permission: 'lease.view', module: 'rentals', match: '/backoffice/rentals', group: 'workspace', suspension: 'history_read' },
  { id: 'rent-roll', labelKey: 'nav:items.rentRoll', href: '/backoffice/rentals/rent-roll', icon: KeyRound, anyOf: ['rent.bill', 'rent.approve'], module: 'rentals', match: '/backoffice/rentals/rent-roll', group: 'workspace', suspension: 'history_read', menu: false, hub: 'rentals' },
  { id: 'owner-statements', labelKey: 'nav:items.ownerStatements', href: '/backoffice/rentals/owner-statements', icon: KeyRound, permission: 'owner_statement.view', module: 'rentals', feature: 'rentals.owner_statements', match: '/backoffice/rentals/owner-statements', group: 'workspace', suspension: 'history_read', menu: false, hub: 'rentals' },
  { id: 'owner-payouts', labelKey: 'nav:items.ownerPayouts', href: '/backoffice/rentals/payouts', icon: KeyRound, anyOf: ['owner_payout.prepare', 'owner_payout.approve', 'owner_statement.view'], module: 'rentals', feature: 'rentals.owner_payouts', match: '/backoffice/rentals/payouts', group: 'workspace', suspension: 'history_read', menu: false, hub: 'rentals' },
  { id: 'rental-settings', labelKey: 'nav:items.rentalSettings', href: '/backoffice/rentals/settings', icon: KeyRound, permission: 'rentals.configure', module: 'rentals', match: '/backoffice/rentals/settings', group: 'workspace', suspension: 'history_read', menu: false, hub: 'rentals' },
  { id: 'operations', labelKey: 'nav:items.operations', href: '/backoffice/mnt/maintenance-dashboard', icon: Wrench, permission: 'operations.view', match: '/backoffice/mnt', group: 'operations', bottomBar: true },
  { id: 'residents', labelKey: 'nav:items.residents', href: '/backoffice/res/resident-dashboard', icon: Users, permission: 'residents.view', match: '/backoffice/res/', group: 'operations' },
  // Gate D.2: the gate and visitors, vehicles, and official notices (with the quick broadcast under them).
  { id: 'visitors', labelKey: 'nav:items.visitors', href: '/backoffice/vis/visitor-dashboard', icon: DoorOpen, anyOf: ['visitors.view', 'visitors.manage'], module: 'visitors', match: '/backoffice/vis', group: 'operations' },
  { id: 'vehicles', labelKey: 'nav:items.vehicles', href: '/backoffice/park/vehicle-registry', icon: Car, anyOf: ['parking.view', 'vehicles.approve'], module: 'parking', match: '/backoffice/park/vehicle-registry', group: 'operations' },
  { id: 'notices', labelKey: 'nav:items.notices', href: '/backoffice/res/community-announcements', icon: Megaphone, permission: 'residents.view', module: 'residents', match: '/backoffice/res/community-announcements', group: 'operations' },
  { id: 'send-message', labelKey: 'nav:pages.sendMessage', href: '/backoffice/not/send-message', icon: Megaphone, anyOf: ['messages.send'], module: 'communications', match: '/backoffice/not/send-message', group: 'operations', menu: false, hub: 'notices' },
  // Gate D.3: the optional community add-ons (each needs its licence for the site, the feature and the permission).
  { id: 'community-chat', labelKey: 'nav:items.communityChat', href: '/backoffice/chat', icon: MessagesSquare, permission: 'chat.use', module: 'community_chat', match: '/backoffice/chat', group: 'operations' },
  { id: 'chat-settings', labelKey: 'nav:items.chatSettings', href: '/backoffice/chat/settings', icon: ShieldCheck, anyOf: ['chat.groups.manage', 'chat.moderate'], module: 'community_chat', match: '/backoffice/chat/settings', group: 'operations' },
  { id: 'local-services', labelKey: 'nav:items.localServices', href: '/backoffice/community/services', icon: BadgeCheck, permission: 'directory.manage', module: 'community_hub', feature: 'community_hub.services_directory', match: '/backoffice/community/services', group: 'operations' },
  { id: 'polls', labelKey: 'nav:items.polls', href: '/backoffice/community/polls', icon: Vote, permission: 'polls.manage', module: 'community_hub', feature: 'community_hub.polls', match: '/backoffice/community/polls', group: 'operations' },
  { id: 'resident-documents', labelKey: 'nav:items.residentDocuments', href: '/backoffice/doc/document-center', icon: FileText, permission: 'resources.publish', module: 'community_hub', feature: 'community_hub.resources', match: '/backoffice/doc/document-center', group: 'operations' },
  // Gate D.1: residents' use of the resident app (societies: like Collections, other organisations keep the planned page).
  { id: 'committee', labelKey: 'nav:items.committee', href: '/backoffice/committee', icon: UsersRound, permission: 'committee.view', module: 'residents', feature: 'residents.committee', match: '/backoffice/committee', group: 'operations', suspension: 'history_read' },
  { id: 'ownership-transfers', labelKey: 'nav:items.ownershipTransfers', href: '/backoffice/own/transfers-list', icon: ArrowRightLeft, anyOf: ['transfer.review', 'transfer.approve', 'clearance.issue'], module: 'residents', feature: 'residents.transfer_clearance', match: '/backoffice/own/transfer', group: 'operations', suspension: 'history_read' },
  { id: 'portal-access', labelKey: 'nav:items.portalAccess', href: '/backoffice/residents/portal-access', icon: Smartphone, permission: 'portal_access.view', module: 'dues', match: '/backoffice/residents', group: 'operations', suspension: 'history_read' },
  { id: 'reports', labelKey: 'nav:items.reports', href: '/backoffice/rpt/report-center', icon: BarChart3, permission: 'reports.view', match: '/backoffice/rpt', group: 'insights' },
  { id: 'administration', labelKey: 'nav:items.administration', href: '/backoffice/adm/administration-home', icon: Settings2, permission: 'admin.view', match: '/backoffice/adm', group: 'insights' },
  // Gate D.1: staff sessions (administrators) and data exports and privacy requests.
  { id: 'users', labelKey: 'nav:items.users', href: '/backoffice/adm/user-workspace', icon: MonitorSmartphone, permission: 'admin.view', match: '/backoffice/adm/user-workspace', group: 'insights', suspension: 'history_read' },
  { id: 'data-privacy', labelKey: 'nav:items.dataPrivacy', href: '/backoffice/adm/data', icon: DatabaseZap, module: 'dues', anyOf: ['data_export.request', 'data_export.approve', 'privacy.requests.manage'], match: '/backoffice/adm/data', group: 'insights', suspension: 'history_read' },
  { id: 'help', labelKey: 'nav:items.help', href: '/backoffice/help/tours', icon: Compass, match: '/backoffice/help', group: 'support', suspension: 'history_read' },
];

/** Prototype-only tools: not part of a client's menu unless switched on in Preferences (owner, CP2). */
export const PROTOTYPE_NAV: NavItem[] = [
  { id: 'lab', labelKey: 'nav:items.lab', href: '/backoffice/lab', icon: FlaskConical, match: '/backoffice/lab', group: 'prototype' },
];

/** The menu with prototype tools added when the visitor has switched them on. */
export const withPrototypeTools = (items: readonly NavItem[], on: boolean): NavItem[] => (on ? [...items, ...PROTOTYPE_NAV] : [...items]);

/**
 * The Party area's name for the kind of organisation (owner decision, CP2 review). There is one
 * shared Party model; only the words change: a developer's customers and buyers, a society's owners
 * and residents, a property manager's people and properties, a maintenance-only client's contacts.
 */
export function partyAreaLabelKey(access: EffectiveAccess | null, at = new Date().toISOString().slice(0, 10)): string {
  if (!access) return 'nav:items.customers';
  const licensed = (m: ModuleKey) => access.grants.some((g) => g.module === m && decideTarget(access, { module: m, suspension: 'history_read' }, at).allowed);
  if (access.tenant.type === 'developer') return 'nav:party.developer';
  if (access.tenant.type === 'portfolio_manager') return 'nav:party.portfolio';
  if (licensed('residents')) return 'nav:party.society';
  if (licensed('crm') || licensed('sales')) return 'nav:party.developer';
  return 'nav:party.contacts';
}

/** The menu with the organisation's own words (the same items, checks and addresses). */
export function contextualNav(items: readonly NavItem[], access: EffectiveAccess | null, at?: string): NavItem[] {
  const party = partyAreaLabelKey(access, at);
  return items.map((i) => (i.id === 'customers' ? { ...i, labelKey: party } : i));
}

/** Quick create entries (live in the demo, or planned), as the workspace offers them. */
export const TENANT_QUICK_CREATE = [
  ...LIVE.map((e) => ({ id: e.id, labelKey: `common:quickCreate.${e.key}`, permission: e.permission, live: true })),
  ...PLANNED.map((e) => ({ id: e.id, labelKey: `common:quickCreate.${e.key}`, permission: e.permission, live: false })),
] as const;

/** Record types global search returns, and what each needs. */
export const TENANT_SEARCH_SCOPES: ReadonlyArray<{ id: string; labelKey: string } & AccessTarget> = [
  { id: 'customers', labelKey: 'common:entity.party', permission: 'customer.view' },
  { id: 'leads', labelKey: 'common:entity.lead', permission: 'lead.view' },
  { id: 'units', labelKey: 'common:entity.unit', permission: 'unit.view' },
  { id: 'invoices', labelKey: 'common:entity.invoice', permission: 'invoice.view' },
];

/** The navigation item that owns an address (longest matching prefix). */
export function navItemFor(pathname: string, items: readonly NavItem[] = [...TENANT_NAV, ...PROTOTYPE_NAV]): NavItem | undefined {
  return [...items].filter((i) => i.match && pathname.startsWith(i.match)).sort((a, b) => b.match!.length - a.match!.length)[0];
}

/** Evaluate a workspace target against an effective access (used by the HQ preview). */
export function evaluate(access: EffectiveAccess, target: AccessTarget, at: string): AccessDecision {
  return decideTarget(access, target, at);
}

const isModuleKey = (m: string | undefined): m is ModuleKey => !!m && (MODULE_KEYS as readonly string[]).includes(m);

/**
 * Addresses that stay open while the organisation is suspended (A1 §4, CP2 correction 4): the start
 * page, personal settings and help, the plan and "My access", and financial history. Everything
 * else is operational and paused.
 */
const HISTORY_READ = [
  '/backoffice/home',
  '/backoffice/more',
  '/backoffice/help/tours',
  '/backoffice/global/notifications',
  '/backoffice/global/context-help',
  '/backoffice/global/profile--preferences',
  '/backoffice/global/accessibility-preferences',
  '/backoffice/global/language-switcher',
  '/backoffice/global/my-access',
  '/backoffice/settings',
  '/backoffice/global/command-palette',
  '/backoffice/adm/plan',
  '/backoffice/fin/invoices-list',
  '/backoffice/fin/invoice-workspace',
];

/** The backoffice root only redirects to the start page. */
const START = ['/backoffice', '/backoffice/'];

export const suspensionOf = (pathname: string): SuspensionClass =>
  START.includes(pathname) || HISTORY_READ.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ? 'history_read' : 'operational';

/**
 * What a workspace address needs (V3.1 effective access): the module of its register row, else of
 * the menu area that owns it, and that area's permission. The backoffice checks every address with
 * this before rendering it (deep links, bookmarks, typed addresses), and Platform HQ's preview uses
 * the same rule to answer "would this role open this address?".
 */
export function workspaceRouteTarget(pathname: string): AccessTarget {
  const screen = findScreenByRegisterRoute(pathname);
  const area = navItemFor(pathname);
  const module = isModuleKey(screen?.module) ? screen.module : area?.module;
  return {
    ...(module ? { module } : {}),
    ...(area?.permission ? { permission: area.permission } : {}),
    // Gate S.1: an area open to several jobs (anyOf) or licensed by a feature carries both to the route gate.
    ...(area?.anyOf ? { anyOf: area.anyOf } : {}),
    ...(area?.feature ? { feature: area.feature } : {}),
    suspension: suspensionOf(pathname),
  };
}
