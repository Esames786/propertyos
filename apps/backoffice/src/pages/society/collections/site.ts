import type { SiteSummary } from '@repo/contracts';
import { useApiQuery } from '@repo/ui';

/** The society's site (one per demo society; several sites would come with a picker). */
export function useSocietySiteId(enabled = true): string | null {
  const sites = useApiQuery<SiteSummary[]>({ method: 'GET', path: '/sites' }, { enabled });
  return sites.data?.[0]?.id ?? null;
}
