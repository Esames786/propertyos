import {
  ACTIVITY_GROUPS,
  ACTIVITY_RANGES,
  SAVED_LIST_LIMIT,
  TASK_KINDS,
  TASK_URGENCIES,
  type ActivityGroup,
  type ActivityRange,
  type ActivityResponse,
  type FavouriteItem,
  type RecentItem,
  type RecordRef,
  type RelatedResponse,
  type SavedListResponse,
  type TasksResponse,
  type UnifiedSearchResponse,
  type WorkQueueResponse,
} from '@repo/contracts';
import { matches, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { DOCUMENT_HANDLERS } from '../documents/handlers';
import { activityFor } from './activity';
import { bodyOf, officeOnly, problem, queryOf, stampOf, str } from './common';
import { relatedOf, resolveRecord, unifiedSearch } from './registry';
import { readBucket, writeBucket } from './store';
import { countsOf, tasksFor } from './tasks';

/**
 * Gate E.13 connected-workspace API (GLOBAL-002/005/006, HOME-002/004/005, related cards). Every
 * member of the office app may call it; each answer is filtered per record by the registry with the
 * caller's own access, so it never lists, names or counts what the caller may not open. Ids that are
 * unknown, hidden or of another organisation answer the same 404. Favourites and recent records are
 * the caller's own (organisation, person, app, sign-in session).
 */
const member = requires('core', 'signed_in', 'history_read');
const memberWrite = requires('core', 'signed_in', 'operational');
const route = (p: string) => new RegExp(`^${p.replace(/:(\w+)/g, '(?<$1>[\\w-]+)')}$`);
const save = (ctx: HandlerContext) => ctx.demo.save();

const pick = <T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T => ((allowed as readonly string[]).includes(String(raw ?? '')) ? (String(raw) as T) : fallback);

/** Re-resolve saved ids for the reader; entries they can no longer open are left out (never counted). */
function resolved<T extends { id: string }>(ctx: HandlerContext, entries: readonly T[]): Array<{ entry: T; record: RecordRef }> {
  return entries.flatMap((entry) => {
    const record = resolveRecord(ctx, entry.id);
    return record?.favouritable ? [{ entry, record }] : [];
  });
}

const filterSaved = (ctx: HandlerContext) => {
  const type = str(queryOf(ctx).type, 20);
  const q = str(queryOf(ctx).q, 80);
  return (r: RecordRef) => (!type || r.type === type) && (!q || matches(q, r.title, r.ref, r.project?.name));
};

function favourites(ctx: HandlerContext): SavedListResponse<FavouriteItem> {
  officeOnly(ctx);
  const keep = filterSaved(ctx);
  const items = resolved(ctx, readBucket(ctx).favourites)
    .filter(({ record }) => keep(record))
    .map(({ entry, record }) => ({ ...record, addedAt: entry.addedAt }))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  return { items, limit: SAVED_LIST_LIMIT, sessionBound: true };
}

function recents(ctx: HandlerContext): SavedListResponse<RecentItem> {
  officeOnly(ctx);
  const keep = filterSaved(ctx);
  const items = resolved(ctx, readBucket(ctx).recents)
    .filter(({ record }) => keep(record))
    .map(({ entry, record }) => ({ ...record, viewedAt: entry.viewedAt, views: entry.views }))
    .sort((a, b) => b.viewedAt.localeCompare(a.viewedAt));
  return { items, limit: SAVED_LIST_LIMIT, sessionBound: true };
}

/** A record named by the caller: one they may open now, or the uniform 404. */
function openable(ctx: HandlerContext, raw: unknown): RecordRef {
  const id = str(raw, 80);
  const record = id ? resolveRecord(ctx, id) : null;
  if (!record || !record.favouritable) notFound(ctx);
  return record;
}

function addFavourite(ctx: HandlerContext): { favourite: true; id: string } {
  officeOnly(ctx);
  const record = openable(ctx, bodyOf<{ recordId: string }>(ctx).recordId);
  // Read first: a refusal (a full list) must leave the stored lists exactly as they were.
  const current = readBucket(ctx);
  if (current.favourites.some((f) => f.id === record.id)) return { favourite: true, id: record.id };
  const visible = resolved(ctx, current.favourites);
  if (visible.length >= SAVED_LIST_LIMIT) problem(ctx, 409, 'favourites_full', 'workspace:hub.problems.favouritesFull');
  const bucket = writeBucket(ctx);
  // Entries the person can no longer open make room first (they are not shown anyway).
  const shown = new Set(visible.map((v) => v.entry.id));
  if (bucket.favourites.length >= SAVED_LIST_LIMIT) bucket.favourites = bucket.favourites.filter((f) => shown.has(f.id));
  bucket.favourites.unshift({ id: record.id, addedAt: stampOf(ctx) });
  save(ctx);
  return { favourite: true, id: record.id };
}

function removeFavourite(ctx: HandlerContext): { favourite: false } {
  officeOnly(ctx);
  const id = ctx.params.id!;
  // Only the caller's own list is touched; an id that is not on it changes nothing (and says nothing).
  if (readBucket(ctx).favourites.some((f) => f.id === id)) {
    const bucket = writeBucket(ctx);
    bucket.favourites = bucket.favourites.filter((f) => f.id !== id);
    save(ctx);
  }
  return { favourite: false };
}

function visit(ctx: HandlerContext): { recorded: true } {
  officeOnly(ctx);
  const record = openable(ctx, bodyOf<{ recordId: string }>(ctx).recordId);
  const bucket = writeBucket(ctx);
  const existing = bucket.recents.find((r) => r.id === record.id);
  const entry = { id: record.id, viewedAt: stampOf(ctx), views: (existing?.views ?? 0) + 1 };
  bucket.recents = [entry, ...bucket.recents.filter((r) => r.id !== record.id)].slice(0, SAVED_LIST_LIMIT);
  save(ctx);
  return { recorded: true };
}

function forget(ctx: HandlerContext): { cleared: true } {
  officeOnly(ctx);
  const id = ctx.params.id;
  const current = readBucket(ctx).recents;
  if (id ? current.some((r) => r.id === id) : current.length > 0) {
    const bucket = writeBucket(ctx);
    bucket.recents = id ? bucket.recents.filter((r) => r.id !== id) : [];
    save(ctx);
  }
  return { cleared: true };
}

function tasks(ctx: HandlerContext): TasksResponse {
  officeOnly(ctx);
  const kind = pick(queryOf(ctx).kind, ['all', ...TASK_KINDS], 'all');
  const urgency = pick(queryOf(ctx).urgency, ['all', ...TASK_URGENCIES], 'all');
  const all = tasksFor(ctx, 'mine');
  const ofKind = all.items.filter((i) => kind === 'all' || i.kind === kind);
  return { today: ctx.at, items: ofKind.filter((i) => urgency === 'all' || i.urgency === urgency), counts: countsOf(ofKind), kinds: all.kinds };
}

function queue(ctx: HandlerContext): WorkQueueResponse {
  officeOnly(ctx);
  const query = queryOf(ctx);
  const kind = pick(query.kind, ['all', ...TASK_KINDS], 'all');
  const urgency = pick(query.urgency, ['all', ...TASK_URGENCIES], 'all');
  const owner = pick(query.owner, ['all', 'mine', 'others', 'unassigned'], 'all');
  const project = str(query.project, 40);
  const q = str(query.q, 80);
  const all = tasksFor(ctx, 'team');
  const base = all.items
    .filter((i) => kind === 'all' || i.kind === kind)
    .filter((i) => !project || i.record?.project?.id === project)
    .filter((i) => owner === 'all' || (owner === 'mine' ? i.owner?.mine : owner === 'unassigned' ? i.owner === null : i.owner !== null && !i.owner.mine))
    .filter((i) => !q || (i.record ? matches(q, i.record.title, i.record.ref) : matches(q, ...Object.values(i.params ?? {}))));
  const projects = [...new Map(all.items.flatMap((i) => (i.record?.project ? [[i.record.project.id, i.record.project] as const] : []))).values()];
  return { today: ctx.at, items: base.filter((i) => urgency === 'all' || i.urgency === urgency), counts: countsOf(base), kinds: all.kinds, projects };
}

function activity(ctx: HandlerContext): ActivityResponse {
  officeOnly(ctx);
  const query = queryOf(ctx);
  const range = pick<ActivityRange>(query.range, ACTIVITY_RANGES, '7d');
  const group = pick<ActivityGroup | 'all'>(query.group, ['all', ...ACTIVITY_GROUPS], 'all');
  const who = pick(query.who, ['all', 'mine'], 'all');
  const limit = Math.min(Math.max(Number(query.limit) || 40, 10), 400);
  const { items, groups } = activityFor(ctx, range, group, who);
  return { items: items.slice(0, limit), range, more: items.length > limit, groups };
}

export const WORKSPACE_E13_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: route('/workspace/search'),
    access: member,
    handle: (ctx): UnifiedSearchResponse => {
      officeOnly(ctx);
      return unifiedSearch(ctx, str(queryOf(ctx).q, 120), str(queryOf(ctx).type, 20), Number(queryOf(ctx).page ?? 1));
    },
  },
  {
    method: 'GET',
    pattern: route('/workspace/resolve'),
    access: member,
    handle: (ctx): RecordRef => {
      officeOnly(ctx);
      const r = resolveRecord(ctx, str(queryOf(ctx).id, 80));
      if (!r) notFound(ctx);
      return r;
    },
  },
  {
    method: 'GET',
    pattern: route('/workspace/related'),
    access: member,
    handle: (ctx): RelatedResponse => {
      officeOnly(ctx);
      const r = relatedOf(ctx, str(queryOf(ctx).record, 80));
      if (!r) notFound(ctx);
      return r;
    },
  },
  { method: 'GET', pattern: route('/workspace/favourites'), access: member, handle: favourites },
  { method: 'POST', pattern: route('/workspace/favourites'), access: memberWrite, handle: addFavourite },
  { method: 'DELETE', pattern: route('/workspace/favourites/:id'), access: memberWrite, handle: removeFavourite },
  { method: 'GET', pattern: route('/workspace/recents'), access: member, handle: recents },
  { method: 'POST', pattern: route('/workspace/recents'), access: memberWrite, handle: visit },
  { method: 'DELETE', pattern: route('/workspace/recents'), access: memberWrite, handle: forget },
  { method: 'DELETE', pattern: route('/workspace/recents/:id'), access: memberWrite, handle: forget },
  { method: 'GET', pattern: route('/workspace/tasks'), access: member, handle: tasks },
  { method: 'GET', pattern: route('/workspace/queue'), access: member, handle: queue },
  { method: 'GET', pattern: route('/workspace/activity'), access: member, handle: activity },
];

/** Gate E.13 endpoints, registered once in handlers.ts. */
export const E13_HANDLERS: readonly Handler[] = [...WORKSPACE_E13_HANDLERS, ...DOCUMENT_HANDLERS];
