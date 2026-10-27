import type { NavItem } from '@repo/ui';
import {
  BarChart3,
  Briefcase,
  Building2,
  Compass,
  Contact,
  FlaskConical,
  Home,
  Landmark,
  Settings2,
  ShoppingCart,
  Users,
  UsersRound,
  Wrench,
} from 'lucide-react';

/**
 * Main sidebar (blueprint 01 §7): Home · Sales · Projects · Customers · Finance · Procurement · HR ·
 * Operations · Residents · Reports · Administration. Targets are register routes; until Stage 2 they
 * open intentional planned-screen pages. Permissions are the illustrative prototype catalogue.
 */
export const NAV_ITEMS: NavItem[] = [
  { id: 'home', labelKey: 'nav:items.home', href: '/backoffice/home/role-aware-dashboard', icon: Home, match: '/backoffice/home', bottomBar: true },
  { id: 'sales', labelKey: 'nav:items.sales', href: '/backoffice/crm/sales-home', icon: Briefcase, permission: 'lead.view', match: '/backoffice/crm', group: 'workspace', bottomBar: true },
  { id: 'projects', labelKey: 'nav:items.projects', href: '/backoffice/prj/projects-list', icon: Building2, permission: 'unit.view', match: '/backoffice/prj', group: 'workspace', bottomBar: true },
  { id: 'customers', labelKey: 'nav:items.customers', href: '/backoffice/cus/customers-list', icon: Contact, permission: 'customer.view', match: '/backoffice/cus', group: 'workspace', bottomBar: true },
  { id: 'finance', labelKey: 'nav:items.finance', href: '/backoffice/fin/finance-dashboard', icon: Landmark, permission: 'invoice.view', match: '/backoffice/fin', group: 'workspace', bottomBar: true },
  { id: 'procurement', labelKey: 'nav:items.procurement', href: '/backoffice/proc/procurement-overview', icon: ShoppingCart, permission: 'procurement.view', match: '/backoffice/proc', group: 'operations' },
  { id: 'hr', labelKey: 'nav:items.hr', href: '/backoffice/hr/hr-dashboard', icon: UsersRound, permission: 'hr.view', match: '/backoffice/hr', group: 'operations' },
  { id: 'operations', labelKey: 'nav:items.operations', href: '/backoffice/mnt/maintenance-dashboard', icon: Wrench, permission: 'operations.view', match: '/backoffice/mnt', group: 'operations' },
  { id: 'residents', labelKey: 'nav:items.residents', href: '/backoffice/res/resident-dashboard', icon: Users, permission: 'residents.view', match: '/backoffice/res', group: 'operations' },
  { id: 'reports', labelKey: 'nav:items.reports', href: '/backoffice/rpt/report-center', icon: BarChart3, permission: 'reports.view', match: '/backoffice/rpt', group: 'insights' },
  { id: 'administration', labelKey: 'nav:items.administration', href: '/backoffice/adm/administration-home', icon: Settings2, permission: 'admin.view', match: '/backoffice/adm', group: 'insights' },
  { id: 'lab', labelKey: 'nav:items.lab', href: '/backoffice/lab', icon: FlaskConical, match: '/backoffice/lab', group: 'prototype' },
  { id: 'help', labelKey: 'nav:items.help', href: '/backoffice/help/tours', icon: Compass, match: '/backoffice/help', group: 'prototype' },
];

export const LINKS = {
  start: '/backoffice/home/role-aware-dashboard',
  preferences: '/backoffice/global/profile--preferences',
  signIn: '/backoffice/sign-in',
  getStarted: '/backoffice/get-started',
  demoLaunch: '/backoffice/get-started/demo',
  workspaceSetup: '/backoffice/get-started/setup',
  tourLibrary: '/backoffice/help/tours',
  salesHome: '/backoffice/crm/sales-home',
  leads: '/backoffice/crm/leads-list',
  leadWorkspace: (leadId: string) => `/backoffice/crm/lead-360-workspace?record=${leadId}`,
  more: '/backoffice/more',
} as const;

export const TOUR_LINKS = {
  start: LINKS.start,
  help: '/backoffice/global/context-help',
  library: '/backoffice/help/tours',
  practice: '/backoffice/help/practice',
  textGuide: (tourId: string) => `/backoffice/help/tours/${tourId}/text`,
};
