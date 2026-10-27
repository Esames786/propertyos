import type { WorkspacePlan } from '@repo/contracts';
import { can, forbid, notFound, type Handler } from './handler-types';
import { MODULES } from './platform/catalog';
import { directoryTenant } from './tenant-directory';

/** ADM-023 "Your plan & modules": the signed-in organisation's licence, read-only (admins). */
export const PLAN_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/workspace\/plan$/,
    module: 'core',
    handle: (ctx): WorkspacePlan => {
      if (!can(ctx, 'admin.view')) forbid(ctx);
      const tenant = directoryTenant(ctx.tenantId ?? '') ?? notFound(ctx);
      const grants = new Map(tenant.modules.map((m) => [m.module, m]));
      return {
        tenant: { id: tenant.id, name: tenant.name, edition: tenant.edition, status: tenant.status, licensedFrom: tenant.licensedFrom },
        sites: tenant.sites.map((s) => ({ id: s.id, name: s.name, city: s.city, declaredUnits: s.declaredUnits })),
        modules: MODULES.map((m) => ({ key: m.key, category: m.category, licensed: grants.has(m.key), alwaysOn: m.alwaysOn, sites: grants.get(m.key)?.sites ?? null })),
      };
    },
  },
];
