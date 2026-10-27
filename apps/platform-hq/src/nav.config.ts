import type { NavItem, ShellLinks } from '@repo/ui';
import { Building2, Calculator, Compass, LayoutDashboard } from 'lucide-react';

/** Platform HQ routes (V3.1 register: HQ-*). */
export const HQ = {
  dashboard: '/hq',
  tenants: '/hq/tenants',
  createTenant: '/hq/tenants/new',
  simulator: '/hq/simulator',
  more: '/hq/more',
  preferences: '/hq/preferences',
  signIn: '/hq/sign-in',
  tours: '/hq/help/tours',
  tenant: (id: string) => `/hq/tenants?tenant=${encodeURIComponent(id)}`,
  resumeDraft: (id: string) => `/hq/tenants/new?draft=${encodeURIComponent(id)}`,
  tenant360: (id: string, tab?: string) => `/hq/tenants/${encodeURIComponent(id)}${tab ? `?tab=${tab}` : ''}`,
  preview: (id: string, role?: string) => `/hq/tenants/${encodeURIComponent(id)}/preview${role ? `?role=${role}` : ''}`,
} as const;

/**
 * Only built areas appear in the navigation (Gate A flaw F-1): planned HQ screens are reachable from
 * their register addresses and honest planned pages, never from menus.
 */
export const HQ_NAV: NavItem[] = [
  { id: 'dashboard', labelKey: 'platform:nav.dashboard', href: HQ.dashboard, icon: LayoutDashboard, permission: 'platform.dashboard.view', match: '/hq', exact: true, bottomBar: true },
  { id: 'tenants', labelKey: 'platform:nav.tenants', href: HQ.tenants, icon: Building2, permission: 'platform.tenants.view', match: '/hq/tenants', group: 'workspace', bottomBar: true },
  { id: 'simulator', labelKey: 'platform:nav.simulator', href: HQ.simulator, icon: Calculator, permission: 'platform.pricing.simulate', match: '/hq/simulator', group: 'workspace', bottomBar: true },
  { id: 'help', labelKey: 'platform:nav.help', href: HQ.tours, icon: Compass, match: '/hq/help', group: 'support' },
];

export const HQ_LINKS: ShellLinks = {
  start: HQ.dashboard,
  preferences: HQ.preferences,
  signIn: HQ.signIn,
  tourLibrary: HQ.tours,
  more: HQ.more,
};

export const HQ_TOUR_LINKS = {
  start: HQ.dashboard,
  help: HQ.tours,
  library: HQ.tours,
  practice: HQ.dashboard,
  textGuide: (tourId: string) => `/hq/help/tours/${tourId}/text`,
};
