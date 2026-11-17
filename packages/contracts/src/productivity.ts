import type { ModuleKey } from './access';

/**
 * Gate E.13 (provisional, Wave 1): the connected workspace — universal search (GLOBAL-002), recent
 * records (GLOBAL-005), favourites (GLOBAL-006), my tasks (HOME-002), the work queue (HOME-004),
 * recent activity (HOME-005) and the related records a record page shows.
 *
 * Every record the API returns here was resolved through the record registry
 * (`packages/fixtures/src/developer/workspace/registry.ts`) with the reader's own access: the same
 * rule as the record's own endpoint and `GET /access/record`. Nothing hidden is counted, named or
 * summed: a record the reader may not open is simply absent (unknown and hidden ids answer alike).
 */

/**
 * Kinds of record the registry resolves today. Later slices add theirs (opportunity, visit,
 * booking, journal …) by registering a provider and extending this list at integration.
 */
export const WORKSPACE_RECORD_TYPES = [
  'lead',
  'party',
  'unit',
  'project',
  'invoice',
  'document',
  'template',
  'lease',
  'request',
  'maintenance',
  'pass',
  'vehicle',
  'notice',
  'tenant',
] as const;
export type WorkspaceRecordType = (typeof WORKSPACE_RECORD_TYPES)[number];

/** A record as the reader may see it (title, reference, where it opens). */
export interface RecordRef {
  type: WorkspaceRecordType;
  id: string;
  ref: string;
  /** As stored (names stay in their own script). */
  title: string;
  /** Plain second line (a phone, a site); Latin values are shown bidi-isolated. */
  subtitle?: string;
  /** A translation key for the second line when it is a status (e.g. `status:lead.qualified`). */
  subtitleKey?: string;
  href: string;
  module: ModuleKey;
  /** The project (or site) the record belongs to, when it has one the reader may see. */
  project?: { id: string; name: string };
  /** The registry can re-resolve it by id, so it can be a favourite or a recent record. */
  favouritable: boolean;
}

// ---------------------------------------------------------------------------------------------
// GLOBAL-002 universal search
// ---------------------------------------------------------------------------------------------
export interface UnifiedSearchGroup {
  type: WorkspaceRecordType;
  items: RecordRef[];
  /** More records of this kind match (no count: the reader opens the kind to page through them). */
  more: boolean;
}

export interface UnifiedSearchResponse {
  query: string;
  /** Kinds this person may search at all (the filter never offers a kind they cannot see). */
  types: WorkspaceRecordType[];
  type: WorkspaceRecordType | 'all';
  page: number;
  groups: UnifiedSearchGroup[];
  /** Fewer than two characters: nothing is searched. */
  tooShort: boolean;
}

// ---------------------------------------------------------------------------------------------
// GLOBAL-005 recent records, GLOBAL-006 favourites (decision E-35)
// ---------------------------------------------------------------------------------------------
export const SAVED_LIST_LIMIT = 50;

export interface FavouriteItem extends RecordRef {
  addedAt: string;
}

export interface RecentItem extends RecordRef {
  viewedAt: string;
  views: number;
}

export interface SavedListResponse<T> {
  items: T[];
  limit: number;
  /** Kept for this sign-in only (E-35): signing out or switching identity clears it. */
  sessionBound: true;
}

// ---------------------------------------------------------------------------------------------
// HOME-002 my tasks, HOME-004 work queue
// ---------------------------------------------------------------------------------------------
export const TASK_KINDS = ['follow_up', 'site_visit', 'hold_expiry', 'document_expiry', 'template_approval', 'template_returned', 'society_task', 'society_approval'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_URGENCIES = ['overdue', 'today', 'soon', 'later'] as const;
export type TaskUrgency = (typeof TASK_URGENCIES)[number];

export interface TaskItem {
  /** Stable: `<kind>:<record id>` (and a version for template work). */
  id: string;
  kind: TaskKind;
  module: ModuleKey;
  urgency: TaskUrgency;
  /** Due date or time (ISO), when the work has one. */
  due?: string;
  /** The record the work is about (absent for organisation-level work such as a society's billing step). */
  record?: RecordRef;
  /** Translation key and values of the work's title when it has no record (society tasks). */
  titleKey?: string;
  params?: Record<string, string>;
  /** Where the work is done: a deep link to the right tab or drawer. */
  actionHref: string;
  /** Who the work sits with, when the reader may know; null = nobody yet. */
  owner: { name: string; mine: boolean } | null;
  /** Plain values for the description (a version number, a society task key …). */
  detail?: Record<string, string>;
}

export interface TasksResponse {
  today: string;
  items: TaskItem[];
  /** Of the items above only (never of anything hidden). */
  counts: Record<TaskUrgency, number>;
  /** Kinds this person's modules and permissions can produce (the filter offers these). */
  kinds: TaskKind[];
}

export interface WorkQueueResponse extends TasksResponse {
  projects: Array<{ id: string; name: string }>;
}

// ---------------------------------------------------------------------------------------------
// HOME-005 recent activity
// ---------------------------------------------------------------------------------------------
export const ACTIVITY_RANGES = ['today', '7d', '30d'] as const;
export type ActivityRange = (typeof ACTIVITY_RANGES)[number];

export const ACTIVITY_GROUPS = ['crm', 'documents', 'templates'] as const;
export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number];

export interface ActivityItem {
  id: string;
  at: string;
  actorName: string;
  /** The reader did it. */
  mine: boolean;
  group: ActivityGroup;
  /** Full translation key (`crm:activity.called`, `documents:events.uploaded` …). */
  messageKey: string;
  params: Record<string, string>;
  record: RecordRef;
}

export interface ActivityResponse {
  items: ActivityItem[];
  range: ActivityRange;
  /** More (older) items exist inside the range for this reader. */
  more: boolean;
  groups: ActivityGroup[];
}

// ---------------------------------------------------------------------------------------------
// Related records (contextual cards on record pages)
// ---------------------------------------------------------------------------------------------
export interface RelatedGroup {
  type: WorkspaceRecordType;
  /** Translation key of the relationship (e.g. `workspace:hub.related.rel.customer`). */
  relationKey: string;
  items: RecordRef[];
  more: boolean;
}

export interface RelatedResponse {
  record: RecordRef;
  groups: RelatedGroup[];
  /** Documents of the record, when the reader holds `document.view` (else null, not empty). */
  documents: Array<{ id: string; ref: string; title: string; kind: string; version: number; expiry: string; href: string }> | null;
  /** The reader may attach a document to this record. */
  canAttach: boolean;
  favourite: boolean;
}
