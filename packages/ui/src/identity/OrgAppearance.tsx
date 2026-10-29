import type { OrgAppearanceSettings } from '@repo/contracts';
import { useEffect } from 'react';
import { useApiQuery } from '../data/TransportProvider';
import { useSession } from '../permissions/SessionProvider';
import { useDisplayPreferences } from '../preferences/DisplayPreferences';

export type OrgAppearanceAnswer = OrgAppearanceSettings & { chosen: boolean };

/**
 * ADM-022: the organisation's colours, read once the person is signed in and handed to the display
 * preferences (which cache them for the next first paint). A person's own palette and high contrast
 * still win. Mounted by the office app and the resident app, not by Platform HQ.
 */
export function useOrgAppearanceSync() {
  const { persona } = useSession();
  const { setOrganisation } = useDisplayPreferences();
  const query = useApiQuery<OrgAppearanceAnswer>(persona ? { method: 'GET', path: '/org/appearance' } : null, { staleTime: 60_000 });
  const data = query.data;
  useEffect(() => {
    if (!data) return;
    setOrganisation(data.chosen ? { palette: data.palette, ...(data.brand ? { brand: data.brand } : {}) } : null);
  }, [data, setOrganisation]);
  return query;
}
