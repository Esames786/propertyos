import { useSession } from '@repo/ui';
import SocietyDashboard from '../society/SocietyDashboard';
import ManagementDashboard from './ManagementDashboard';
import { PlanHome } from './PlanHome';

/** The developer dashboard's figures come from these modules; a workspace with none of them (a society
 * with receivables, a maintenance-only client, a suspended organisation) gets its plan home. */
const DEVELOPER_FIGURES = ['crm', 'inventory', 'sales'] as const;

/**
 * HOME-001: the role-aware dashboard, composed by the organisation's plan as well as the role. A
 * society with dues billing gives its site and billing staff the collections-first society
 * dashboard (Gate C.1); a role without either (a security guard) keeps the plan home.
 */
export default function HomePage() {
  const { allows, can } = useSession();
  if (allows({ module: 'dues' }) && (can('site.view') || can('billing_run.view'))) return <SocietyDashboard />;
  return DEVELOPER_FIGURES.some((module) => allows({ module })) ? <ManagementDashboard /> : <PlanHome />;
}
