import { TENANT_NAV, type NavItem } from '@repo/ui';

/**
 * Main sidebar (blueprint 01 §7). The model is shared with Platform HQ's "Preview as client" so the
 * preview shows a tenant's actual menu; what each person sees is limited by their organisation's
 * licensed modules and their own permissions (V3.1 effective access).
 */
export const NAV_ITEMS: NavItem[] = TENANT_NAV;

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
  /** ADM-023 Your plan & modules (read-only). */
  plan: '/backoffice/adm/plan',
} as const;

export const TOUR_LINKS = {
  start: LINKS.start,
  help: '/backoffice/global/context-help',
  library: '/backoffice/help/tours',
  practice: '/backoffice/help/practice',
  textGuide: (tourId: string) => `/backoffice/help/tours/${tourId}/text`,
};
