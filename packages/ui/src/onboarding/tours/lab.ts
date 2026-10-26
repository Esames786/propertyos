import type { TourDefinition } from '../tourTypes';

const k = (step: string, part: 'title' | 'body') => `onboarding:tours.LAB-TOUR-001.${step}.${part}`;

/**
 * LAB-TOUR-001: demonstrates the module-tour mechanism with real controls in practice mode.
 * Exercises every step kind, a role-specific step (Finance only), a step inside a modal drawer
 * (inline slot) and the "explain" fallback when an anchor is not on screen (phone menu).
 * Real Sales/Inventory/Finance tours register the same way in Stage 3.
 */
export const LAB_TOUR: TourDefinition = {
  id: 'LAB-TOUR-001',
  version: 1,
  app: 'backoffice',
  applicablePersonas: ['manager', 'sales', 'finance'],
  moduleId: 'lab',
  practice: true,
  nameKey: 'onboarding:tours.LAB-TOUR-001.name',
  summaryKey: 'onboarding:tours.LAB-TOUR-001.summary',
  steps: [
    { id: 'intro', kind: 'EXPLAIN', titleKey: k('intro', 'title'), bodyKey: k('intro', 'body') },
    {
      id: 'openQuickCreate',
      kind: 'GUIDED_ACTION',
      targetId: 'quick-create',
      requiredPermission: 'lead.create',
      suspendEvent: 'quickCreate.opened',
      resumeEvent: 'quickCreate.closed',
      completionEvent: 'quickCreate.practiceLead.opened',
      titleKey: k('openQuickCreate', 'title'),
      bodyKey: k('openQuickCreate', 'body'),
    },
    {
      id: 'fillForm',
      kind: 'SIMULATED_TASK',
      targetId: 'practice-lead-form',
      inlineSlot: 'practice-lead',
      requiredPermission: 'lead.create',
      completionEvent: 'practice.lead.submitted',
      titleKey: k('fillForm', 'title'),
      bodyKey: k('fillForm', 'body'),
    },
    {
      id: 'financeReview',
      kind: 'EXPLAIN',
      targetId: 'nav-finance',
      requiredPermission: 'finance.evidence.review',
      fallback: 'explain',
      titleKey: k('financeReview', 'title'),
      bodyKey: k('financeReview', 'body'),
    },
    { id: 'replay', kind: 'EXPLAIN', targetId: 'global-help', titleKey: k('replay', 'title'), bodyKey: k('replay', 'body') },
  ],
};
