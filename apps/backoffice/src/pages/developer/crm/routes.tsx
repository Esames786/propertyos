import type { AccessTarget } from '@repo/contracts';
import { useSession } from '@repo/ui';
import { lazy, Suspense, type ReactNode } from 'react';
import type { RouteHandle } from '../../../prototype/handle';
import { registerLoader, RegisterResolver } from '../../../prototype/register';

/**
 * Gate E.1 route module (CRM-006…009, CRM-011), mounted by one hook in the CRM section of
 * `prototype/routes.tsx`. Each screen needs the CRM module and `lead.view` (the register's
 * permission); anyone else gets the register's planned page or access outcome at the same address
 * (the server refuses the same way). Edition-aware wrappers, navigation items and quick-create entries
 * come from Gate E.0 at Wave 1 integration (provisional until then).
 */

const PipelinePage = lazy(() => import('./PipelinePage'));
const OpportunityWorkspace = lazy(() => import('./OpportunityWorkspace'));
const VisitCalendarPage = lazy(() => import('./VisitCalendarPage'));
const VisitWorkspace = lazy(() => import('./VisitWorkspace'));

const CRM_VIEW: AccessTarget = { module: 'crm', permission: 'lead.view' };

function E1Screen({ children }: { children: ReactNode }) {
  const { allows } = useSession();
  return allows(CRM_VIEW) ? <Suspense fallback={null}>{children}</Suspense> : <RegisterResolver />;
}

const h = (handle: RouteHandle) => handle;

export const E1_CRM_ROUTES = [
  // CRM-006 is a drawer (register surface): its address opens it over the pipeline.
  { path: 'crm/lead-assignment', loader: registerLoader, element: <E1Screen><PipelinePage assignmentRoute /></E1Screen>, handle: h({ title: (t) => t('sales:assign.title') }) },
  { path: 'crm/opportunities-pipeline', loader: registerLoader, element: <E1Screen><PipelinePage /></E1Screen>, handle: h({ title: (t) => t('sales:pipeline.title') }) },
  { path: 'crm/opportunity-360-workspace', loader: registerLoader, element: <E1Screen><OpportunityWorkspace /></E1Screen>, handle: h({ title: (t) => t('sales:opportunity.chooseTitle') }) },
  { path: 'crm/site-visits-calendar', loader: registerLoader, element: <E1Screen><VisitCalendarPage /></E1Screen>, handle: h({ title: (t) => t('sales:calendar.title') }) },
  { path: 'crm/visit-workspace', loader: registerLoader, element: <E1Screen><VisitWorkspace /></E1Screen>, handle: h({ title: (t) => t('sales:visit.chooseTitle') }) },
];
