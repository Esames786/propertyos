import { Building2, Calculator, LayoutDashboard, LifeBuoy } from 'lucide-react';
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

const c = (step: string, part: 'title' | 'body' | 'bodyMobile') => `platform:createTour.${step}.${part}`;
const CREATE = '/hq/tenants/new';

/**
 * HQ-TOUR-002 "Create a tenant": guided help on the wizard's real controls (UX review of
 * checkpoint 1). Offered on the first visit to the wizard and from its "Show me how" button.
 */
export const HQ_CREATE_TOUR: TourDefinition = {
  id: 'HQ-TOUR-002',
  version: 1,
  app: 'platform',
  applicablePersonas: '*',
  moduleId: 'hq-create',
  requiredPermission: 'platform.tenants.create',
  nameKey: 'platform:createTour.name',
  summaryKey: 'platform:createTour.summary',
  steps: [
    { id: 'intro', kind: 'EXPLAIN', route: CREATE, art: { icon: Building2, hue: 'emerald' }, titleKey: c('intro', 'title'), bodyKey: c('intro', 'body') },
    { id: 'progress', kind: 'EXPLAIN', route: CREATE, targetId: 'wizard-stepper', fallback: 'explain', titleKey: c('progress', 'title'), bodyKey: c('progress', 'body') },
    { id: 'edition', kind: 'EXPLAIN', route: CREATE, targetId: 'edition-options', fallback: 'explain', titleKey: c('edition', 'title'), bodyKey: c('edition', 'body') },
    { id: 'price', kind: 'EXPLAIN', route: CREATE, art: { icon: Calculator, hue: 'sky' }, titleKey: c('price', 'title'), bodyKey: c('price', 'body'), mobileBodyKey: c('price', 'bodyMobile') },
    { id: 'save', kind: 'EXPLAIN', route: CREATE, targetId: 'wizard-continue', fallback: 'explain', titleKey: c('save', 'title'), bodyKey: c('save', 'body') },
    { id: 'help', kind: 'EXPLAIN', targetId: 'global-help', art: { icon: LifeBuoy, hue: 'violet' }, titleKey: c('help', 'title'), bodyKey: c('help', 'body') },
  ],
};
