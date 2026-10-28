import { Building, LifeBuoy } from 'lucide-react';
import type { TourDefinition } from '../tourTypes';

const k = (step: string, part: 'title' | 'body' | 'bodyMobile') => `onboarding:tours.SOCIETY-TOUR-001.${step}.${part}`;
const DASHBOARD = '/backoffice/home/role-aware-dashboard';

/**
 * SOCIETY-TOUR-001 (register GUIDE-008), the building manager's tour of Al-Noor Residency (Gate C.1).
 * Frames the real controls: the collections-first dashboard, the work list, the flat finder, one
 * flat's connected facts and the billing calendar. Its guided step completes on a real action: the
 * manager creates the month's draft run and generates the preview. The treasurer gets the same tour
 * without the preparing steps and with the approvals list instead.
 */
export const SOCIETY_TOUR: TourDefinition = {
  id: 'SOCIETY-TOUR-001',
  version: 1,
  app: 'backoffice',
  applicablePersonas: ['alnoor_manager', 'alnoor_treasurer'],
  requiredPermission: 'site.view',
  nameKey: 'onboarding:tours.SOCIETY-TOUR-001.name',
  summaryKey: 'onboarding:tours.SOCIETY-TOUR-001.summary',
  steps: [
    { id: 'welcome', kind: 'EXPLAIN', route: DASHBOARD, art: { icon: Building, hue: 'emerald' }, titleKey: k('welcome', 'title'), bodyKey: k('welcome', 'body') },
    { id: 'sidebar', kind: 'EXPLAIN', route: DASHBOARD, targetId: 'nav-primary', mobileTargetId: 'bottom-nav', titleKey: k('sidebar', 'title'), bodyKey: k('sidebar', 'body'), mobileBodyKey: k('sidebar', 'bodyMobile') },
    { id: 'collections', kind: 'EXPLAIN', route: DASHBOARD, targetId: 'society-collections', fallback: 'explain', titleKey: k('collections', 'title'), bodyKey: k('collections', 'body') },
    { id: 'tasks', kind: 'EXPLAIN', route: DASHBOARD, targetId: 'society-tasks', fallback: 'explain', titleKey: k('tasks', 'title'), bodyKey: k('tasks', 'body') },
    { id: 'approvals', kind: 'EXPLAIN', route: DASHBOARD, targetId: 'society-approvals', requiredPermission: 'billing_run.approve', fallback: 'explain', titleKey: k('approvals', 'title'), bodyKey: k('approvals', 'body') },
    { id: 'flatJump', kind: 'EXPLAIN', route: DASHBOARD, targetId: 'society-flat-jump', fallback: 'skip', titleKey: k('flatJump', 'title'), bodyKey: k('flatJump', 'body') },
    { id: 'flat', kind: 'EXPLAIN', route: '/backoffice/sites/site_alnoor/units/unt_anr_a102', targetId: 'flat-facts', fallback: 'explain', titleKey: k('flat', 'title'), bodyKey: k('flat', 'body') },
    { id: 'calendar', kind: 'EXPLAIN', route: '/backoffice/billing/runs', targetId: 'billing-calendar', requiredPermission: 'billing_run.view', fallback: 'explain', titleKey: k('calendar', 'title'), bodyKey: k('calendar', 'body') },
    {
      id: 'newRun',
      kind: 'GUIDED_ACTION',
      route: '/backoffice/billing/runs/new',
      targetId: 'new-run-create',
      requiredPermission: 'billing_run.create',
      optional: true,
      completionEvent: 'billing.run.created',
      fallback: 'explain',
      titleKey: k('newRun', 'title'),
      bodyKey: k('newRun', 'body'),
    },
    {
      id: 'preview',
      kind: 'GUIDED_ACTION',
      targetId: 'run-preview',
      requiredPermission: 'billing_run.create',
      optional: true,
      completionEvent: 'billing.run.previewed',
      fallback: 'explain',
      titleKey: k('preview', 'title'),
      bodyKey: k('preview', 'body'),
    },
    { id: 'help', kind: 'EXPLAIN', targetId: 'global-help', art: { icon: LifeBuoy, hue: 'violet' }, titleKey: k('help', 'title'), bodyKey: k('help', 'body') },
  ],
};
