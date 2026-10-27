import { BriefcaseBusiness, PartyPopper } from 'lucide-react';
import type { TourDefinition } from '../tourTypes';

const k = (step: string, part: 'title' | 'body' | 'bodyMobile') => `onboarding:tours.CRM-TOUR-001.${step}.${part}`;
const SALES_HOME = '/backoffice/crm/sales-home';

/**
 * CRM-TOUR-001, Sales workspace (Stage 1.5R). Offered on the first visit to Sales home. Teaches the
 * real controls, then a guided task: create a demo lead and see it appear in the list straight away.
 */
export const CRM_TOUR: TourDefinition = {
  id: 'CRM-TOUR-001',
  version: 1,
  app: 'backoffice',
  applicablePersonas: ['manager', 'sales'],
  moduleId: 'crm',
  nameKey: 'onboarding:tours.CRM-TOUR-001.name',
  summaryKey: 'onboarding:tours.CRM-TOUR-001.summary',
  steps: [
    { id: 'intro', kind: 'EXPLAIN', route: SALES_HOME, art: { icon: BriefcaseBusiness, hue: 'sky' }, titleKey: k('intro', 'title'), bodyKey: k('intro', 'body') },
    { id: 'kpis', kind: 'EXPLAIN', route: SALES_HOME, targetId: 'crm-kpis', fallback: 'explain', titleKey: k('kpis', 'title'), bodyKey: k('kpis', 'body') },
    { id: 'followUps', kind: 'EXPLAIN', route: SALES_HOME, targetId: 'crm-follow-ups', fallback: 'explain', titleKey: k('followUps', 'title'), bodyKey: k('followUps', 'body') },
    { id: 'pipeline', kind: 'EXPLAIN', route: SALES_HOME, targetId: 'crm-pipeline', fallback: 'explain', titleKey: k('pipeline', 'title'), bodyKey: k('pipeline', 'body') },
    { id: 'visits', kind: 'EXPLAIN', route: SALES_HOME, targetId: 'crm-visits', fallback: 'explain', titleKey: k('visits', 'title'), bodyKey: k('visits', 'body') },
    {
      id: 'newLead',
      kind: 'GUIDED_ACTION',
      route: SALES_HOME,
      targetId: 'crm-new-lead',
      requiredPermission: 'lead.create',
      optional: true,
      suspendEvent: 'crm.newLead.opened',
      resumeEvent: 'crm.newLead.closed',
      completionEvent: 'crm.lead.created',
      titleKey: k('newLead', 'title'),
      bodyKey: k('newLead', 'body'),
    },
    { id: 'recentLeads', kind: 'EXPLAIN', route: SALES_HOME, targetId: 'crm-recent-leads', fallback: 'explain', titleKey: k('recentLeads', 'title'), bodyKey: k('recentLeads', 'body') },
    { id: 'done', kind: 'EXPLAIN', targetId: 'global-help', art: { icon: PartyPopper, hue: 'emerald' }, titleKey: k('done', 'title'), bodyKey: k('done', 'body') },
  ],
};
