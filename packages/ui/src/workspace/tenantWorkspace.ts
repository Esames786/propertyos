import { decideTarget, MODULE_KEYS, type AccessDecision, type AccessTarget, type EffectiveAccess, type ModuleKey } from '@repo/contracts';
import { findScreenByRegisterRoute } from '@repo/contracts/screens';
import { BarChart3, Briefcase, Building2, Compass, Contact, FlaskConical, Home, Landmark, Settings2, ShoppingCart, Users, UsersRound, Wrench } from 'lucide-react';
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
  { id: 'home', labelKey: 'nav:items.home', href: '/backoffice/home/role-aware-dashboard', icon: Home, match: '/backoffice/home', bottomBar: true },
  { id: 'sales', labelKey: 'nav:items.sales', href: '/backoffice/crm/sales-home', icon: Briefcase, permission: 'lead.view', match: '/backoffice/crm', group: 'workspace', bottomBar: true },
  { id: 'projects', labelKey: 'nav:items.projects', href: '/backoffice/prj/projects-list', icon: Building2, permission: 'unit.view', module: 'projects', match: '/backoffice/prj', group: 'workspace', bottomBar: true },
  { id: 'customers', labelKey: 'nav:items.customers', href: '/backoffice/cus/customers-list', icon: Contact, permission: 'customer.view', match: '/backoffice/cus', group: 'workspace', bottomBar: true },
  { id: 'finance', labelKey: 'nav:items.finance', href: '/backoffice/fin/finance-dashboard', icon: Landmark, permission: 'invoice.view', match: '/backoffice/fin', group: 'workspace', bottomBar: true },
  { id: 'procurement', labelKey: 'nav:items.procurement', href: '/backoffice/proc/procurement-overview', icon: ShoppingCart, permission: 'procurement.view', match: '/backoffice/proc', group: 'operations' },
  { id: 'hr', labelKey: 'nav:items.hr', href: '/backoffice/hr/hr-dashboard', icon: UsersRound, permission: 'hr.view', match: '/backoffice/hr', group: 'operations' },
  { id: 'operations', labelKey: 'nav:items.operations', href: '/backoffice/mnt/maintenance-dashboard', icon: Wrench, permission: 'operations.view', match: '/backoffice/mnt', group: 'operations', bottomBar: true },
  { id: 'residents', labelKey: 'nav:items.residents', href: '/backoffice/res/resident-dashboard', icon: Users, permission: 'residents.view', match: '/backoffice/res', group: 'operations' },
  { id: 'reports', labelKey: 'nav:items.reports', href: '/backoffice/rpt/report-center', icon: BarChart3, permission: 'reports.view', match: '/backoffice/rpt', group: 'insights' },
  { id: 'administration', labelKey: 'nav:items.administration', href: '/backoffice/adm/administration-home', icon: Settings2, permission: 'admin.view', match: '/backoffice/adm', group: 'insights' },
  { id: 'lab', labelKey: 'nav:items.lab', href: '/backoffice/lab', icon: FlaskConical, match: '/backoffice/lab', group: 'prototype' },
  { id: 'help', labelKey: 'nav:items.help', href: '/backoffice/help/tours', icon: Compass, match: '/backoffice/help', group: 'prototype' },
];

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
export function navItemFor(pathname: string, items: readonly NavItem[] = TENANT_NAV): NavItem | undefined {
  return [...items].filter((i) => i.match && pathname.startsWith(i.match)).sort((a, b) => b.match!.length - a.match!.length)[0];
}

/** Evaluate a workspace target against an effective access (used by the HQ preview). */
export function evaluate(access: EffectiveAccess, target: AccessTarget, at: string): AccessDecision {
  return decideTarget(access, target, at);
}

const isModuleKey = (m: string | undefined): m is ModuleKey => !!m && (MODULE_KEYS as readonly string[]).includes(m);

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
  return { ...(module ? { module } : {}), ...(area?.permission ? { permission: area.permission } : {}) };
}
