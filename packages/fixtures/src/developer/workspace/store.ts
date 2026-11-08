import { SAVED_LIST_LIMIT } from '@repo/contracts';
import type { HandlerContext } from '../../handler-types';

/**
 * Gate E.13 favourites and recent records (GLOBAL-005/006), kept by the mock server in the
 * organisation's own demo partition (tenant partition by construction) and, inside it, per person,
 * app and sign-in session: `<principal>|backoffice|<session>`. Decision E-35 (conservative default):
 * at most 50 entries each; every entry is re-resolved through the record registry on every read, so
 * an entry the person can no longer open disappears at once without a count; signing out or switching
 * identity starts a new session, and the first write of a new session discards that person's older
 * lists. Only ids and times are stored: titles always come from the record, as the reader may see it.
 */
export const WS_SECTION = 'e13.workspace';
// 1: Gate E.13 Wave 1.
export const WS_STATE_VERSION = 1;

export interface Bucket {
  favourites: Array<{ id: string; addedAt: string }>;
  recents: Array<{ id: string; viewedAt: string; views: number }>;
}

interface WorkspaceState {
  version: number;
  buckets: Record<string, Bucket>;
}

const APP = 'backoffice';
export const bucketKey = (ctx: HandlerContext) => `${ctx.persona?.principalId ?? ''}|${APP}|${ctx.sessionId ?? 'none'}`;

function stateOf(ctx: HandlerContext): WorkspaceState {
  const state = ctx.demo.section<WorkspaceState>(WS_SECTION, () => ({ version: WS_STATE_VERSION, buckets: {} }));
  if (state.version !== WS_STATE_VERSION) Object.assign(state, { version: WS_STATE_VERSION, buckets: {} });
  return state;
}

/** The person's lists for this session (empty when they have none: reading creates nothing that is saved). */
export function readBucket(ctx: HandlerContext): Bucket {
  return stateOf(ctx).buckets[bucketKey(ctx)] ?? { favourites: [], recents: [] };
}

/** The person's lists for writing; the first write of a new session clears their older sessions' lists. */
export function writeBucket(ctx: HandlerContext): Bucket {
  const state = stateOf(ctx);
  const key = bucketKey(ctx);
  const mine = `${ctx.persona?.principalId ?? ''}|${APP}|`;
  for (const k of Object.keys(state.buckets)) if (k !== key && k.startsWith(mine)) delete state.buckets[k];
  return (state.buckets[key] ??= { favourites: [], recents: [] });
}

export const isFavourite = (ctx: HandlerContext, id: string) => readBucket(ctx).favourites.some((f) => f.id === id);

export { SAVED_LIST_LIMIT };
