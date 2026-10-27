import { grantActive, MODULE_KEYS, PERMISSION_MODULE, type MyAccess } from '@repo/contracts';
import { notFound, requires, type Handler } from './handler-types';
import { directoryTenant } from './tenant-directory';

/**
 * "My access" for staff who are not workspace administrators (owner decision, CP2 review): the
 * areas they can use, on which sites, and their project scope. Built from the same effective access
 * the API enforces; it carries no edition, price, contract or list of unlicensed modules.
 */
export const MY_ACCESS_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/workspace\/my-access$/,
    access: requires('core', 'signed_in', 'history_read'),
    handle: (ctx): MyAccess => {
      const persona = ctx.persona!;
      const access = ctx.access!;
      const tenant = directoryTenant(access.tenant.id) ?? notFound(ctx);
      const siteName = new Map(tenant.sites.map((s) => [s.id, s.name]));
      const areas = MODULE_KEYS.flatMap((module) => {
        const grants = access.grants.filter((g) => g.module === module && grantActive(g, ctx.at));
        const permissions = access.permissions.filter((p) => (PERMISSION_MODULE[p] ?? 'core') === module);
        if (!grants.length || !permissions.length) return [];
        const sites = grants.some((g) => g.sites === 'all') ? ('all' as const) : [...new Set(grants.flatMap((g) => g.sites as readonly string[]))].map((id) => ({ id, name: siteName.get(id) ?? id }));
        return [{ module, sites, permissions }];
      });
      const scope: MyAccess['scope'] = persona.projectScope === 'all'
        ? { kind: 'all' }
        : { kind: 'projects', names: persona.projectScope.map((id) => ctx.data.projects.find((p) => p.id === id)?.name ?? id) };
      return {
        organisation: { id: tenant.id, name: tenant.name, status: tenant.status },
        person: { displayName: persona.displayName, roleKey: persona.roleKey },
        areas,
        scope,
      };
    },
  },
];
