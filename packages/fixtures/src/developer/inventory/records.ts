import type { RecordRef } from '@repo/contracts';
import { projectName } from '../../crm-data';
import { can, matches, type HandlerContext } from '../../handler-types';
import type { RecordProvider } from '../workspace/records';
import { inventoryVisible } from './scope';
import { inventoryState, type StorageRecord } from './state';

/**
 * Wave 1 integration (Issue #25): E.2's storage records in E.13's record registry. A storage record resolves
 * exactly when E.2's own inventory scope lets the reader see its project (the inventory grant for the
 * project's site, `unit.view`, the data scope); anything else answers like an id never issued. Its link opens
 * INV-010 filtered to it. (Projects and units keep the shell's rule in E.13's core providers, which now link to
 * E.2's live PRJ-002 and INV-002 screens.)
 */
function storageRef(ctx: HandlerContext, s: StorageRecord): RecordRef {
  return {
    type: 'storage',
    id: s.id,
    ref: s.ref,
    title: s.ref,
    subtitleKey: `projects:storage.state.${s.state}`,
    href: `/backoffice/inv/storage-inventory?project=${s.projectId}&q=${encodeURIComponent(s.ref)}`,
    module: 'inventory',
    project: { id: s.projectId, name: projectName(ctx.data, s.projectId) },
    favouritable: true,
  };
}

const visibleStorage = (ctx: HandlerContext, s: StorageRecord) => can(ctx, 'unit.view', 'operational') && inventoryVisible(ctx, s.projectId);

export const INVENTORY_RECORD_PROVIDERS: readonly RecordProvider[] = [
  {
    type: 'storage',
    owns: (id) => id.startsWith('stg_'),
    resolve: (ctx, id) => {
      const s = inventoryState(ctx).storage.find((x) => x.id === id);
      return s && visibleStorage(ctx, s) ? storageRef(ctx, s) : null;
    },
    searchable: (ctx) => can(ctx, 'unit.view', 'operational'),
    search: (ctx, q, limit) =>
      inventoryState(ctx)
        .storage.filter((s) => ctx.allowsProject(s.projectId) && matches(q, s.ref) && visibleStorage(ctx, s))
        .slice(0, limit)
        .map((s) => storageRef(ctx, s)),
  },
];
