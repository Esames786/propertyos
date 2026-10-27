import { Compass, LayoutDashboard, LifeBuoy } from 'lucide-react';
import type { TourDefinition } from '../tourTypes';

const k = (step: string, part: 'title' | 'body' | 'bodyMobile') => `onboarding:tours.GLOBAL-TOUR-001.${step}.${part}`;
const DASHBOARD = '/backoffice/home/role-aware-dashboard';

/**
 * GLOBAL-TOUR-001 v2, Backoffice essentials (Stage 1.5R). Runs on the real dashboard and spotlights
 * the actual controls and widgets: navigation, project context, figures, quick actions, the action
 * centre, collections (finance roles only), search, quick create and help. Steps a role cannot use
 * are removed before the tour starts; a widget missing on screen falls back to a text explanation.
 */
export const GLOBAL_TOUR: TourDefinition = {
  id: 'GLOBAL-TOUR-001',
  version: 2,
  app: 'backoffice',
  applicablePersonas: '*',
  nameKey: 'onboarding:tours.GLOBAL-TOUR-001.name',
  summaryKey: 'onboarding:tours.GLOBAL-TOUR-001.summary',
  steps: [
    { id: 'welcome', kind: 'EXPLAIN', route: DASHBOARD, art: { icon: LayoutDashboard, hue: 'emerald' }, titleKey: k('welcome', 'title'), bodyKey: k('welcome', 'body') },
    {
      id: 'sidebar',
      kind: 'EXPLAIN',
      route: DASHBOARD,
      targetId: 'nav-primary',
      mobileTargetId: 'bottom-nav',
      titleKey: k('sidebar', 'title'),
      bodyKey: k('sidebar', 'body'),
      mobileBodyKey: k('sidebar', 'bodyMobile'),
    },
    {
      id: 'project',
      kind: 'EXPLAIN',
      route: DASHBOARD,
      targetId: 'project-switcher',
      requiredPermission: 'project.context.use',
      titleKey: k('project', 'title'),
      bodyKey: k('project', 'body'),
    },
    {
      id: 'kpis',
      kind: 'EXPLAIN',
      route: DASHBOARD,
      targetId: 'dashboard-kpis',
      // On phones the four figures stack taller than the screen: frame the first one instead.
      mobileTargetId: 'dashboard-kpi-first',
      fallback: 'explain',
      titleKey: k('kpis', 'title'),
      bodyKey: k('kpis', 'body'),
    },
    {
      id: 'quickActions',
      kind: 'EXPLAIN',
      route: DASHBOARD,
      targetId: 'dashboard-quick-actions',
      fallback: 'skip',
      titleKey: k('quickActions', 'title'),
      bodyKey: k('quickActions', 'body'),
    },
    {
      id: 'actionCentre',
      kind: 'EXPLAIN',
      route: DASHBOARD,
      targetId: 'dashboard-action-centre',
      fallback: 'explain',
      titleKey: k('actionCentre', 'title'),
      bodyKey: k('actionCentre', 'body'),
    },
    {
      id: 'collections',
      kind: 'EXPLAIN',
      route: DASHBOARD,
      targetId: 'dashboard-collections',
      requiredPermission: 'invoice.view',
      fallback: 'skip',
      titleKey: k('collections', 'title'),
      bodyKey: k('collections', 'body'),
    },
    {
      id: 'search',
      kind: 'GUIDED_ACTION',
      optional: true,
      targetId: 'command-search',
      suspendEvent: 'commandPalette.opened',
      completionEvent: 'commandPalette.closed',
      titleKey: k('search', 'title'),
      bodyKey: k('search', 'body'),
      mobileBodyKey: k('search', 'bodyMobile'),
    },
    {
      id: 'quickCreate',
      kind: 'EXPLAIN',
      targetId: 'quick-create',
      mobileTargetId: 'quick-create-fab',
      requiredPermission: 'quickcreate.use',
      art: { icon: Compass, hue: 'sky' },
      titleKey: k('quickCreate', 'title'),
      bodyKey: k('quickCreate', 'body'),
    },
    { id: 'help', kind: 'EXPLAIN', targetId: 'global-help', art: { icon: LifeBuoy, hue: 'violet' }, titleKey: k('help', 'title'), bodyKey: k('help', 'body') },
  ],
};
