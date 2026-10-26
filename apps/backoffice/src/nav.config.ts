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
  { id: 'home', labelKey: 'nav:items.home', href: '/backoffice/home/role-aware-dashboard', icon: Home, match: '/backoffice/home' },
  { id: 'sales', labelKey: 'nav:items.sales', href: '/backoffice/crm/sales-home', icon: Briefcase, permission: 'lead.view', match: '/backoffice/crm' },
  { id: 'projects', labelKey: 'nav:items.projects', href: '/backoffice/prj/projects-list', icon: Building2, permission: 'unit.view', match: '/backoffice/prj' },
  { id: 'customers', labelKey: 'nav:items.customers', href: '/backoffice/cus/customers-list', icon: Contact, permission: 'customer.view', match: '/backoffice/cus' },
  { id: 'finance', labelKey: 'nav:items.finance', href: '/backoffice/fin/finance-dashboard', icon: Landmark, permission: 'invoice.view', match: '/backoffice/fin' },
  { id: 'procurement', labelKey: 'nav:items.procurement', href: '/backoffice/proc/procurement-overview', icon: ShoppingCart, permission: 'procurement.view', match: '/backoffice/proc' },
  { id: 'hr', labelKey: 'nav:items.hr', href: '/backoffice/hr/hr-dashboard', icon: UsersRound, permission: 'hr.view', match: '/backoffice/hr' },
  { id: 'operations', labelKey: 'nav:items.operations', href: '/backoffice/mnt/maintenance-dashboard', icon: Wrench, permission: 'operations.view', match: '/backoffice/mnt' },
  { id: 'residents', labelKey: 'nav:items.residents', href: '/backoffice/res/resident-dashboard', icon: Users, permission: 'residents.view', match: '/backoffice/res' },
  { id: 'reports', labelKey: 'nav:items.reports', href: '/backoffice/rpt/report-center', icon: BarChart3, permission: 'reports.view', match: '/backoffice/rpt' },
  { id: 'administration', labelKey: 'nav:items.administration', href: '/backoffice/adm/administration-home', icon: Settings2, permission: 'admin.view', match: '/backoffice/adm' },
  { id: 'lab', labelKey: 'nav:items.lab', href: '/backoffice/lab', icon: FlaskConical, match: '/backoffice/lab' },
  { id: 'help', labelKey: 'nav:items.help', href: '/backoffice/help/tours', icon: Compass, match: '/backoffice/help' },
];

export const LINKS = {
  start: '/backoffice/lab',
  preferences: '/backoffice/global/profile--preferences',
  signIn: '/backoffice',
  tourLibrary: '/backoffice/help/tours',
} as const;

export const TOUR_LINKS = {
  start: LINKS.start,
  help: '/backoffice/global/context-help',
  library: '/backoffice/help/tours',
  practice: '/backoffice/help/practice',
  textGuide: (tourId: string) => `/backoffice/help/tours/${tourId}/text`,
};
