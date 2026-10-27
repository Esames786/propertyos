import type { EffectiveAccess } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { evaluate, navItemFor, TENANT_NAV, workspaceRouteTarget } from './tenantWorkspace';

/** A maintenance-only organisation whose role nevertheless holds sales permissions. */
const maintenanceOnly: EffectiveAccess = {
  tenant: { id: 't', type: 'association', status: 'active', suspensionPolicy: { allowSettlement: true } },
  grants: [
    { module: 'core', sites: 'all', from: '2026-08-01', source: 'preset' },
    { module: 'maintenance', sites: 'all', from: '2026-08-01', source: 'preset' },
  ],
  features: [],
  permissions: ['quickcreate.use', 'operations.view', 'lead.view', 'booking.view'],
  scopes: [{ type: 'all' }],
  userId: 'u',
};
const AT = '2026-10-26';

describe('workspace addresses (the rule the backoffice guard and the HQ preview share)', () => {
  it('takes the module from the register and the permission from the owning menu area', () => {
    expect(workspaceRouteTarget('/backoffice/crm/sales-home')).toEqual({ module: 'crm', permission: 'lead.view' });
    expect(workspaceRouteTarget('/backoffice/mnt/new-request')).toEqual({ module: 'maintenance', permission: 'operations.view' });
    expect(workspaceRouteTarget('/backoffice/adm/plan')).toEqual({ module: 'core', permission: 'admin.view' });
    expect(workspaceRouteTarget('/backoffice/con/construction-update-list')).toMatchObject({ module: 'construction' });
  });

  it('prototype tools need nothing', () => {
    expect(workspaceRouteTarget('/backoffice/lab/tokens')).toEqual({});
    expect(navItemFor('/backoffice/lab/tokens')?.id).toBe('lab');
  });

  it('a maintenance-only plan opens maintenance and nothing developer-side, whatever the role holds', () => {
    expect(evaluate(maintenanceOnly, workspaceRouteTarget('/backoffice/mnt/maintenance-list'), AT)).toEqual({ allowed: true });
    for (const path of ['/backoffice/crm/sales-home', '/backoffice/crm/leads-list', '/backoffice/prj/projects-list', '/backoffice/con/construction-update-list']) {
      expect(evaluate(maintenanceOnly, workspaceRouteTarget(path), AT), path).toEqual({ allowed: false, reason: 'module_not_licensed' });
    }
    const menu = TENANT_NAV.filter((i) => evaluate(maintenanceOnly, i, AT).allowed).map((i) => i.id);
    expect(menu).toEqual(['home', 'operations', 'lab', 'help']);
  });

  it('a grant that starts later is not in force yet', () => {
    const future: EffectiveAccess = { ...maintenanceOnly, grants: [...maintenanceOnly.grants, { module: 'crm', sites: 'all', from: '2026-12-01', source: 'addon' }] };
    expect(evaluate(future, { permission: 'lead.view' }, AT)).toEqual({ allowed: false, reason: 'module_not_licensed' });
    expect(evaluate(future, { permission: 'lead.view' }, '2026-12-01')).toEqual({ allowed: true });
  });
});
