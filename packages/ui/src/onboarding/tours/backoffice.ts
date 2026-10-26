import type { TourDefinition } from '../tourTypes';

const k = (step: string, part: 'title' | 'body' | 'bodyMobile') => `onboarding:tours.GLOBAL-TOUR-001.${step}.${part}`;

/** GLOBAL-TOUR-001, Backoffice essentials (doc 09 §3), six steps on real shell anchors. */
export const GLOBAL_TOUR: TourDefinition = {
  id: 'GLOBAL-TOUR-001',
  version: 1,
  app: 'backoffice',
  applicablePersonas: '*',
  nameKey: 'onboarding:tours.GLOBAL-TOUR-001.name',
  summaryKey: 'onboarding:tours.GLOBAL-TOUR-001.summary',
  steps: [
    { id: 'welcome', kind: 'EXPLAIN', titleKey: k('welcome', 'title'), bodyKey: k('welcome', 'body') },
    {
      id: 'sidebar',
      kind: 'EXPLAIN',
      targetId: 'nav-primary',
      mobileTargetId: 'nav-menu-button',
      titleKey: k('sidebar', 'title'),
      bodyKey: k('sidebar', 'body'),
      mobileBodyKey: k('sidebar', 'bodyMobile'),
    },
    {
      id: 'project',
      kind: 'EXPLAIN',
      targetId: 'project-switcher',
      requiredPermission: 'project.context.use',
      titleKey: k('project', 'title'),
      bodyKey: k('project', 'body'),
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
      requiredPermission: 'quickcreate.use',
      titleKey: k('quickCreate', 'title'),
      bodyKey: k('quickCreate', 'body'),
    },
    { id: 'help', kind: 'EXPLAIN', targetId: 'global-help', titleKey: k('help', 'title'), bodyKey: k('help', 'body') },
  ],
};
