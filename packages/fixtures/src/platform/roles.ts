import type { TenantRoleTemplate, TenantType } from '@repo/contracts';
import { PERSONAS } from '../people';

/**
 * Role templates a tenant's people can hold, for HQ's "Preview as client". The permissions are the
 * demo identities' own, so a preview of "Facility manager" is exactly what Saima Akram sees.
 */
const roleOf = (id: string): TenantRoleTemplate => {
  const p = PERSONAS.find((x) => x.id === id)!;
  return { id, labelKey: p.roleKey, permissions: p.permissions };
};

const DEVELOPER_ROLES = ['manager', 'sales', 'finance'];
const COMMUNITY_ROLES = ['society_admin', 'facility_manager', 'finance'];

export function rolesFor(type: TenantType): TenantRoleTemplate[] {
  return (type === 'developer' ? DEVELOPER_ROLES : COMMUNITY_ROLES).map(roleOf);
}
