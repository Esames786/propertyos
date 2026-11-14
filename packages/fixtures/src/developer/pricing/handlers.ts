import type { UnitPriceHistory, UnitPricePickerItem, UnitPricePickerResponse } from '@repo/contracts';
import { matches, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { projectVisible } from '../scope';

/**
 * INV-006: read the fictional seed's *current listed price*, not an invented
 * price-version ledger. Historical price changes are intentionally empty until
 * E.3's pricing approvals and the immutable version store have been accepted.
 *
 * The same effective inventory/site/project access is evaluated on every request.
 * Lists return only visible records/counts. Named hidden and unknown ids are 404.
 * No demo section is opened or written on these read endpoints.
 */
const NEED = { module: 'inventory', permission: 'unit.view' } as const;
const isDeveloper = (ctx: HandlerContext) => ctx.access?.tenant.type === 'developer';

function item(ctx: HandlerContext, unit: HandlerContext['data']['units'][number]): UnitPricePickerItem {
  const project = ctx.data.projects.find((p) => p.id === unit.projectId)!;
  return {
    id: unit.id,
    ref: unit.ref,
    projectId: project.id,
    projectName: project.name,
    currentListedPrice: { ...unit.price },
  };
}

function visible(ctx: HandlerContext) {
  if (!isDeveloper(ctx)) return [];
  return ctx.data.units.filter((u) => projectVisible(ctx, u.projectId, NEED));
}

export const PRICE_HISTORY_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/pricing\/units$/,
    access: requires('inventory', 'unit.view', 'operational'),
    handle: (ctx): UnitPricePickerResponse => {
      const q = String(ctx.req.query?.q ?? '').trim().slice(0, 100);
      const projectId = ctx.req.query?.project;
      const items = visible(ctx)
        .filter((u) => (projectId === undefined || u.projectId === String(projectId)) &&
          (!q || matches(q, u.ref, ctx.data.projects.find((p) => p.id === u.projectId)?.name)))
        .map((u) => item(ctx, u));
      // Total and pagination describe only authorized, currently-visible units.
      return { items: items.slice(0, 60), total: items.length };
    },
  },
  {
    method: 'GET',
    pattern: /^\/units\/(?<unitId>[\w-]+)\/prices$/,
    access: requires('inventory', 'unit.view', 'operational'),
    handle: (ctx): UnitPriceHistory => {
      const unit = visible(ctx).find((u) => u.id === ctx.params.unitId);
      if (!unit) notFound(ctx);
      const row = item(ctx, unit);
      return {
        unit: row,
        baseline: { price: { ...unit.price }, source: 'fictional_seed', dateKnown: false },
        revisions: [],
        canEdit: false,
        recordState: 'baseline_only',
      };
    },
  },
];
