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
    expect(workspaceRouteTarget('/backoffice/crm/sales-home')).toEqual({ module: 'crm', permission: 'lead.view', suspension: 'operational' });
    expect(workspaceRouteTarget('/backoffice/mnt/new-request')).toEqual({ module: 'maintenance', permission: 'operations.view', suspension: 'operational' });
    expect(workspaceRouteTarget('/backoffice/adm/plan')).toEqual({ module: 'core', permission: 'admin.view', suspension: 'history_read' });
    expect(workspaceRouteTarget('/backoffice/fin/invoices-list')).toEqual({ module: 'receivables', permission: 'invoice.view', suspension: 'history_read' });
    expect(workspaceRouteTarget('/backoffice/con/construction-update-list')).toMatchObject({ module: 'construction' });
  });

  it('prototype tools need no module or permission (they are operational, so paused while suspended)', () => {
    expect(workspaceRouteTarget('/backoffice/lab/tokens')).toEqual({ suspension: 'operational' });
    expect(navItemFor('/backoffice/lab/tokens')?.id).toBe('lab');
  });

  it('a maintenance-only plan opens maintenance and nothing developer-side, whatever the role holds', () => {
    expect(evaluate(maintenanceOnly, workspaceRouteTarget('/backoffice/mnt/maintenance-list'), AT)).toEqual({ allowed: true });
    for (const path of ['/backoffice/crm/sales-home', '/backoffice/crm/leads-list', '/backoffice/prj/projects-list', '/backoffice/con/construction-update-list']) {
      expect(evaluate(maintenanceOnly, workspaceRouteTarget(path), AT), path).toEqual({ allowed: false, reason: 'module_not_licensed' });
    }
    const menu = TENANT_NAV.filter((i) => evaluate(maintenanceOnly, i, AT).allowed).map((i) => i.id);
    expect(menu).toEqual(['home', 'operations', 'help']);
  });

  it('a suspended organisation keeps its start page, financial history and help; everything else is paused', () => {
    const suspended: EffectiveAccess = {
      ...maintenanceOnly,
      tenant: { ...maintenanceOnly.tenant, status: 'suspended' },
      grants: [...maintenanceOnly.grants, { module: 'receivables', sites: 'all', from: '2026-02-01', source: 'preset' }],
      permissions: ['invoice.view', 'operations.view'],
    };
    const menu = TENANT_NAV.filter((i) => evaluate(suspended, i, AT).allowed).map((i) => i.id);
    expect(menu).toEqual(['home', 'finance', 'help']);
    expect(evaluate(suspended, workspaceRouteTarget('/backoffice/fin/invoices-list'), AT)).toEqual({ allowed: true });
    expect(evaluate(suspended, workspaceRouteTarget('/backoffice/fin/create-invoice'), AT)).toEqual({ allowed: false, reason: 'tenant_suspended' });
    expect(evaluate(suspended, workspaceRouteTarget('/backoffice/mnt/maintenance-list'), AT)).toEqual({ allowed: false, reason: 'tenant_suspended' });
  });

  it('with a project chosen, its site must be licensed for the area', () => {
    const twoSites: EffectiveAccess = {
      ...maintenanceOnly,
      grants: [
        { module: 'core', sites: 'all', from: '2026-08-01', source: 'preset' },
        { module: 'projects', sites: 'all', from: '2026-08-01', source: 'preset' },
        { module: 'inventory', sites: ['site_a'], from: '2026-08-01', source: 'preset' },
        { module: 'maintenance', sites: ['site_b'], from: '2026-08-01', source: 'preset' },
      ],
      permissions: ['unit.view', 'operations.view'],
    };
    const projects = TENANT_NAV.find((i) => i.id === 'projects')!;
    expect(evaluate(twoSites, { ...projects, siteId: 'site_a' }, AT)).toEqual({ allowed: true });
    expect(evaluate(twoSites, { ...projects, siteId: 'site_b' }, AT)).toEqual({ allowed: false, reason: 'site_not_licensed' });
    expect(evaluate(twoSites, { ...workspaceRouteTarget('/backoffice/inv/unit-matrix'), siteId: 'site_b' }, AT)).toEqual({ allowed: false, reason: 'site_not_licensed' });
    expect(evaluate(twoSites, { ...workspaceRouteTarget('/backoffice/mnt/maintenance-list'), siteId: 'site_b' }, AT)).toEqual({ allowed: true });
  });

  it('a grant that starts later is not in force yet', () => {
    const future: EffectiveAccess = { ...maintenanceOnly, grants: [...maintenanceOnly.grants, { module: 'crm', sites: 'all', from: '2026-12-01', source: 'addon' }] };
    expect(evaluate(future, { permission: 'lead.view' }, AT)).toEqual({ allowed: false, reason: 'module_not_licensed' });
    expect(evaluate(future, { permission: 'lead.view' }, '2026-12-01')).toEqual({ allowed: true });
  });
});
