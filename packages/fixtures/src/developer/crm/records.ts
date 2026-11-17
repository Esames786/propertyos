import type { RecordRef } from '@repo/contracts';
import { projectName } from '../../crm-data';
import { can, matches, type HandlerContext } from '../../handler-types';
import type { RecordProvider } from '../workspace/records';
import { crmScope } from './scope';
import { pipelineState } from './state';
import { allVisits, leadById, leadMap, partyOf, visitVisible, type Ctx } from './views';

/**
 * Wave 1 integration (Issue #25): E.1's record kinds in E.13's record registry (search, favourites, recent
 * records, related records). Every answer goes through E.1's own scope (`crmScope`: the CRM grant, `lead.view`,
 * the data scope and E-05's "assigned" rule), so the registry sees exactly what the pipeline and calendar
 * show: an opportunity or visit the reader may not open resolves to nothing, like an id never issued.
 */
const open = (ctx: HandlerContext): Ctx => ({ ctx, scope: crmScope(ctx), st: pipelineState(ctx) });
const project = (ctx: HandlerContext, id: string) => ({ id, name: projectName(ctx.data, id) });
const capped = (refs: RecordRef[], limit: number) => refs.slice(0, limit);

function opportunityRef(c: Ctx, id: string): RecordRef | null {
  const o = c.st.opportunities.find((x) => x.id === id);
  const lead = o ? leadById(c, o.leadId) : undefined;
  if (!o || !lead) return null;
  return {
    type: 'opportunity',
    id: o.id,
    ref: o.ref,
    title: partyOf(c.ctx, lead.partyId)?.displayName ?? lead.ref,
    subtitleKey: `sales:stage.${o.stage}`,
    href: `/backoffice/crm/opportunity-360-workspace?record=${o.id}`,
    module: 'crm',
    project: project(c.ctx, o.projectId),
    favouritable: true,
  };
}

function visitRef(c: Ctx, id: string): RecordRef | null {
  const v = allVisits(c.ctx).find((x) => x.id === id);
  const lead = v ? visitVisible(c, v, leadMap(c.ctx)) : undefined;
  if (!v || !lead) return null;
  return {
    type: 'visit',
    id: v.id,
    ref: v.id.toUpperCase().replace(/_/g, '-'),
    title: partyOf(c.ctx, lead.partyId)?.displayName ?? lead.ref,
    subtitle: v.at.slice(0, 10),
    href: `/backoffice/crm/visit-workspace?record=${v.id}`,
    module: 'crm',
    project: project(c.ctx, v.projectId),
    favouritable: true,
  };
}

export const CRM_RECORD_PROVIDERS: readonly RecordProvider[] = [
  {
    type: 'opportunity',
    owns: (id) => id.startsWith('opp_'),
    resolve: (ctx, id) => (can(ctx, 'lead.view', 'operational') ? opportunityRef(open(ctx), id) : null),
    searchable: (ctx) => can(ctx, 'lead.view', 'operational'),
    search: (ctx, q, limit) => {
      const c = open(ctx);
      return capped(
        c.st.opportunities
          .filter((o) => ctx.allowsProject(o.projectId))
          .map((o) => opportunityRef(c, o.id))
          .filter((r): r is RecordRef => !!r && matches(q, r.ref, r.title)),
        limit,
      );
    },
  },
  {
    type: 'visit',
    owns: (id) => id.startsWith('vst_'),
    resolve: (ctx, id) => (can(ctx, 'lead.view', 'operational') ? visitRef(open(ctx), id) : null),
  },
];
