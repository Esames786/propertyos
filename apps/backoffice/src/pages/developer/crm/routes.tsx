import type { AccessTarget } from '@repo/contracts';
import { lazy } from 'react';
import { devRoute, DevScreen } from '../../../prototype/dev-screen';

/**
 * Gate E.1 area route module (CRM-006…009, CRM-011), registered once in E.0's
 * `prototype/routes.developer.tsx` (`DEVELOPER_AREAS`, Wave 1 integration). Each screen serves developer
 * organisations (the register's DEV edition) and needs the CRM module and `lead.view` (the register's
 * permission); anyone else gets the register's planned page or access outcome at the same address (the
 * server refuses the same way).
 */

const PipelinePage = lazy(() => import('./PipelinePage'));
// CRM-006 is a drawer (register surface): its address opens it over the pipeline.
const AssignmentPage = lazy(() => import('./PipelinePage').then((m) => ({ default: () => <m.default assignmentRoute /> })));
const OpportunityWorkspace = lazy(() => import('./OpportunityWorkspace'));
const VisitCalendarPage = lazy(() => import('./VisitCalendarPage'));
const VisitWorkspace = lazy(() => import('./VisitWorkspace'));

const CRM_VIEW: AccessTarget = { module: 'crm', permission: 'lead.view' };

export const routes = [
  devRoute('crm/lead-assignment', <DevScreen page={AssignmentPage} target={CRM_VIEW} />, (t) => t('sales:assign.title')),
  devRoute('crm/opportunities-pipeline', <DevScreen page={PipelinePage} target={CRM_VIEW} />, (t) => t('sales:pipeline.title')),
  devRoute('crm/opportunity-360-workspace', <DevScreen page={OpportunityWorkspace} target={CRM_VIEW} />, (t) => t('sales:opportunity.chooseTitle')),
  devRoute('crm/site-visits-calendar', <DevScreen page={VisitCalendarPage} target={CRM_VIEW} />, (t) => t('sales:calendar.title')),
  devRoute('crm/visit-workspace', <DevScreen page={VisitWorkspace} target={CRM_VIEW} />, (t) => t('sales:visit.chooseTitle')),
];
