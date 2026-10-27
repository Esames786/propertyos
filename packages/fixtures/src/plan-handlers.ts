import type { WorkspacePlan } from '@repo/contracts';
import { notFound, requires, type Handler } from './handler-types';
import { MODULES } from './platform/catalog';
import { directoryTenant } from './tenant-directory';

/**
 * ADM-023 "Your plan & modules": the signed-in organisation's licence, read-only, for workspace
 * administrators only (others use "My access", which carries no commercial information).
 */
export const PLAN_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/workspace\/plan$/,
    access: requires('core', 'admin.view', 'history_read'),
    handle: (ctx): WorkspacePlan => {
      const tenant = directoryTenant(ctx.tenantId ?? '') ?? notFound(ctx);
      // In force today; a module added by an approved, scheduled change is shown with its start date.
      const grants = new Map(tenant.modules.filter((m) => !m.from || m.from <= ctx.at).map((m) => [m.module, m]));
      const scheduled = new Map(tenant.modules.filter((m) => m.from && m.from > ctx.at).map((m) => [m.module, m.from!]));
      return {
        tenant: { id: tenant.id, name: tenant.name, edition: tenant.edition, status: tenant.status, licensedFrom: tenant.licensedFrom },
        sites: tenant.sites.map((s) => ({ id: s.id, name: s.name, city: s.city, declaredUnits: s.declaredUnits })),
        modules: MODULES.map((m) => ({ key: m.key, category: m.category, licensed: grants.has(m.key), alwaysOn: m.alwaysOn, sites: grants.get(m.key)?.sites ?? null, scheduledFrom: scheduled.get(m.key) ?? null })),
      };
    },
  },
];
