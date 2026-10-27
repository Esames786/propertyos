import { STARTER_ROLE_SETS, type PreviewSession } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { PERSONAS } from './people';
import { PlatformStore } from './platform/store';
import { PlatformMockTransport } from './platform/transport';
import { rolesOf, starterRoles } from './role-templates';
import { TENANT_DIRECTORY } from './tenant-directory';

/**
 * Owner decision (CP2 review): tenant-defined role templates. Workspaces start from a starter set
 * for their kind of organisation and own their roles; the HQ preview uses those roles, and the
 * people holding a role have exactly its permissions.
 */
describe('tenant roles', () => {
  it('starter sets match the owner’s lists', () => {
    expect(starterRoles('t', 'developer').map((r) => r.id)).toEqual(['administration', 'sales', 'project_management', 'inventory', 'finance', 'construction']);
    expect(starterRoles('t', 'association').map((r) => r.id)).toEqual(['administrator', 'manager', 'treasurer', 'maintenance', 'technician', 'security']);
    expect(STARTER_ROLE_SETS.society).toHaveLength(6);
  });

  it('every workspace has roles of its own kind; Shalimar defined its own facility manager', () => {
    for (const t of TENANT_DIRECTORY) {
      const roles = rolesOf(t.id, t.type);
      expect(roles.length, t.id).toBe(6);
      expect(roles.every((r) => r.tenantId === t.id)).toBe(true);
    }
    const shalimar = rolesOf('tnt_shalimar', 'association');
    expect(shalimar.find((r) => r.id === 'facility_manager')).toMatchObject({ starter: null, holders: ['facility_manager'] });
    expect(shalimar.some((r) => r.id === 'manager')).toBe(false);
  });

  it('every staff identity holds a role of its own tenant and has exactly its permissions', () => {
    for (const p of PERSONAS.filter((x) => x.app === 'backoffice')) {
      const role = rolesOf(p.tenantId, 'developer').find((r) => r.id === p.roleId);
      expect(role, p.id).toBeTruthy();
      expect(role!.holders, p.id).toContain(p.id);
      expect(p.permissions).toEqual(role!.permissions);
      expect(p.roleKey).toBe(role!.labelKey);
    }
  });

  it('HQ previews a tenant’s own roles with their real permissions (no allow-list)', async () => {
    let personaId = 'supreme_admin';
    const t = new PlatformMockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', store: new PlatformStore(false) });
    const shalimar = await t.request<PreviewSession>({ method: 'POST', path: '/platform/tenants/tnt_shalimar/preview', body: { role: 'facility_manager' } });
    expect(shalimar.roles.map((r) => r.id)).toEqual(['administrator', 'facility_manager', 'treasurer', 'maintenance', 'technician', 'security']);
    expect(shalimar.access.permissions).toEqual(PERSONAS.find((p) => p.id === 'facility_manager')!.permissions);
    const cedar = await t.request<PreviewSession>({ method: 'POST', path: '/platform/tenants/tnt_cedar/preview', body: { role: 'treasurer' } });
    expect(cedar.access.tenant.status).toBe('suspended');
    expect(cedar.access.permissions).toEqual(PERSONAS.find((p) => p.id === 'cedar_treasurer')!.permissions);
    await expect(t.request({ method: 'POST', path: '/platform/tenants/tnt_larkspur/preview', body: { role: 'resident' } })).rejects.toMatchObject({ problem: { status: 422 } });
    personaId = 'commercial_approver';
    await expect(t.request({ method: 'POST', path: '/platform/tenants/tnt_larkspur/preview', body: {} })).rejects.toMatchObject({ problem: { status: 403 } });
  });
});
