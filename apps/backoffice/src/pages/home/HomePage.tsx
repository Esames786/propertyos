import { useSession } from '@repo/ui';
import ManagementDashboard from './ManagementDashboard';
import { PlanHome } from './PlanHome';

/** The dashboard's figures come from these modules; a workspace with none of them gets its plan home. */
const DEVELOPER_FIGURES = ['crm', 'inventory', 'sales', 'receivables'] as const;

/** HOME-001: the role-aware dashboard, composed by the organisation's plan as well as the role. */
export default function HomePage() {
  const { allows } = useSession();
  return DEVELOPER_FIGURES.some((module) => allows({ module })) ? <ManagementDashboard /> : <PlanHome />;
}
