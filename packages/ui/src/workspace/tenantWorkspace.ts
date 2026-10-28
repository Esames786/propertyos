import { decideTarget, MODULE_KEYS, type AccessDecision, type AccessTarget, type EffectiveAccess, type ModuleKey, type SuspensionClass } from '@repo/contracts';
import { findScreenByRegisterRoute } from '@repo/contracts/screens';
import { Banknote, BarChart3, Briefcase, Building, Building2, Compass, Contact, FlaskConical, HandCoins, Home, Landmark, ReceiptText, Settings2, ShoppingCart, Users, UsersRound, Wrench } from 'lucide-react';
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
  { id: 'sales', labelKey: 'nav:items.sales', href: '/backoffice/crm/sales-home', icon: Briefcase, permission: 'lead.view', match: '/backoffice/crm', group: 'workspace', bottomBar: true },
  { id: 'projects', labelKey: 'nav:items.projects', href: '/backoffice/prj/projects-list', icon: Building2, permission: 'unit.view', module: 'projects', match: '/backoffice/prj', group: 'workspace', bottomBar: true },
  { id: 'customers', labelKey: 'nav:items.customers', href: '/backoffice/cus/customers-list', icon: Contact, permission: 'customer.view', match: '/backoffice/cus', group: 'workspace', bottomBar: true },
  { id: 'finance', labelKey: 'nav:items.finance', href: '/backoffice/fin/invoices-list', icon: Landmark, permission: 'invoice.view', match: '/backoffice/fin', group: 'workspace', bottomBar: true, suspension: 'history_read' },
  { id: 'procurement', labelKey: 'nav:items.procurement', href: '/backoffice/proc/procurement-overview', icon: ShoppingCart, permission: 'procurement.view', match: '/backoffice/proc', group: 'operations' },
  { id: 'hr', labelKey: 'nav:items.hr', href: '/backoffice/hr/hr-dashboard', icon: UsersRound, permission: 'hr.view', match: '/backoffice/hr', group: 'operations' },
  { id: 'operations', labelKey: 'nav:items.operations', href: '/backoffice/mnt/maintenance-dashboard', icon: Wrench, permission: 'operations.view', match: '/backoffice/mnt', group: 'operations', bottomBar: true },
  { id: 'residents', labelKey: 'nav:items.residents', href: '/backoffice/res/resident-dashboard', icon: Users, permission: 'residents.view', match: '/backoffice/res', group: 'operations' },
  { id: 'reports', labelKey: 'nav:items.reports', href: '/backoffice/rpt/report-center', icon: BarChart3, permission: 'reports.view', match: '/backoffice/rpt', group: 'insights' },
  { id: 'administration', labelKey: 'nav:items.administration', href: '/backoffice/adm/administration-home', icon: Settings2, permission: 'admin.view', match: '/backoffice/adm', group: 'insights' },
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
  return { ...(module ? { module } : {}), ...(area?.permission ? { permission: area.permission } : {}), suspension: suspensionOf(pathname) };
}
