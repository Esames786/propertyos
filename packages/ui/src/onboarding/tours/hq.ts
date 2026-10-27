import { Calculator, LayoutDashboard, LifeBuoy } from 'lucide-react';
import type { TourDefinition } from '../tourTypes';

const k = (step: string, part: 'title' | 'body' | 'bodyMobile') => `platform:tour.${step}.${part}`;
const HQ = '/hq';

/**
 * HQ-TOUR-001 (GUIDE-007), the Platform HQ essentials. Offered on first sign-in and replayable from
 * Help. Every step spotlights a real control: what needs attention, the platform figures, Create
 * tenant, the navigation, search, the pricing simulator and help.
 */
export const HQ_TOUR: TourDefinition = {
  id: 'HQ-TOUR-001',
  version: 1,
  app: 'platform',
  applicablePersonas: '*',
  nameKey: 'platform:tour.name',
  summaryKey: 'platform:tour.summary',
  steps: [
    { id: 'welcome', kind: 'EXPLAIN', route: HQ, art: { icon: LayoutDashboard, hue: 'emerald' }, titleKey: k('welcome', 'title'), bodyKey: k('welcome', 'body') },
    { id: 'attention', kind: 'EXPLAIN', route: HQ, targetId: 'hq-attention', mobileTargetId: 'hq-attention-first', fallback: 'explain', titleKey: k('attention', 'title'), bodyKey: k('attention', 'body') },
    { id: 'figures', kind: 'EXPLAIN', route: HQ, targetId: 'hq-kpis', mobileTargetId: 'hq-kpi-first', fallback: 'explain', titleKey: k('figures', 'title'), bodyKey: k('figures', 'body') },
    {
      id: 'create',
      kind: 'EXPLAIN',
      route: HQ,
      targetId: 'hq-create-tenant',
      mobileTargetId: 'hq-create-fab',
      requiredPermission: 'platform.tenants.create',
      fallback: 'skip',
      titleKey: k('create', 'title'),
      bodyKey: k('create', 'body'),
    },
    {
      id: 'navigation',
      kind: 'EXPLAIN',
      route: HQ,
      targetId: 'nav-primary',
      mobileTargetId: 'bottom-nav',
      fallback: 'explain',
      titleKey: k('navigation', 'title'),
      bodyKey: k('navigation', 'body'),
      mobileBodyKey: k('navigation', 'bodyMobile'),
    },
    { id: 'search', kind: 'EXPLAIN', route: HQ, targetId: 'command-search', fallback: 'explain', titleKey: k('search', 'title'), bodyKey: k('search', 'body') },
    {
      id: 'quickActions',
      kind: 'EXPLAIN',
      route: HQ,
      targetId: 'hq-quick-actions',
      fallback: 'skip',
      art: { icon: Calculator, hue: 'sky' },
      titleKey: k('quickActions', 'title'),
      bodyKey: k('quickActions', 'body'),
    },
    { id: 'help', kind: 'EXPLAIN', targetId: 'global-help', art: { icon: LifeBuoy, hue: 'violet' }, titleKey: k('help', 'title'), bodyKey: k('help', 'body') },
  ],
};
