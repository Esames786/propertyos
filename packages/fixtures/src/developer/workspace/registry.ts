import { DOCUMENT_LINK_TYPES, type RecordRef, type RelatedResponse, type UnifiedSearchGroup, type UnifiedSearchResponse, type WorkspaceRecordType } from '@repo/contracts';
import type { HandlerContext } from '../../handler-types';
import { DOCUMENT_PROVIDERS } from '../documents/providers';
import { canAttachTo, canViewDocuments, current, docHref, summaryOf, visibleDocs } from '../documents/views';
import { CORE_PROVIDERS, otherSearch, resolveWith, type RecordProvider } from './records';
import { isFavourite } from './store';

/**
 * Gate E.13 record registry: every kind of record the workspace can find, keep and relate.
 * **Integration hook (Wave 1):** other slices append their providers here (E.1 opportunities and
 * visits, E.2 projects/units/storage replacing the core project and unit providers, E.7 accounts and
 * journals). Order matters only where prefixes overlap: the first provider that owns an id decides it.
 */
export const PROVIDERS: readonly RecordProvider[] = [...DOCUMENT_PROVIDERS, ...CORE_PROVIDERS];

export const resolveRecord = (ctx: HandlerContext, id: string): RecordRef | null => resolveWith(PROVIDERS, ctx, id);

const TYPE_ORDER: readonly WorkspaceRecordType[] = ['document', 'lead', 'party', 'unit', 'project', 'invoice', 'lease', 'template', 'request', 'maintenance', 'pass', 'vehicle', 'notice', 'tenant'];
const byTypeOrder = (a: WorkspaceRecordType, b: WorkspaceRecordType) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b);

export const PAGE_SIZE = 20;
const GROUP_SIZE = 5;

/** GLOBAL-002: every kind the reader may search, grouped; one kind at a time is paged. No hidden counts. */
export function unifiedSearch(ctx: HandlerContext, rawQuery: string, rawType: string, rawPage: number): UnifiedSearchResponse {
  const query = rawQuery.trim().slice(0, 80);
  const searchable = PROVIDERS.filter((p) => p.search && p.searchable?.(ctx));
  const types = new Set<WorkspaceRecordType>(searchable.map((p) => p.type));
  const type = (TYPE_ORDER as readonly string[]).includes(rawType) ? (rawType as WorkspaceRecordType) : 'all';
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage < 50 ? rawPage : 1;
  if (query.length < 2) return { query, types: [...types].sort(byTypeOrder), type, page, groups: [], tooShort: true };

  const others = otherSearch(ctx, query);
  others.forEach((r) => types.add(r.type));
  const want = type === 'all' ? GROUP_SIZE + 1 : page * PAGE_SIZE + 1;
  const hits = new Map<WorkspaceRecordType, RecordRef[]>();
  const add = (r: RecordRef) => {
    const list = hits.get(r.type) ?? [];
    if (!list.some((x) => x.id === r.id)) list.push(r);
    hits.set(r.type, list);
  };
  for (const p of searchable) if (type === 'all' || p.type === type) p.search!(ctx, query, want).forEach(add);
  for (const r of others) if (type === 'all' || r.type === type) add(r);

  const groups: UnifiedSearchGroup[] = [...hits.entries()]
    .sort(([a], [b]) => byTypeOrder(a, b))
    .map(([t, list]) =>
      type === 'all'
        ? { type: t, items: list.slice(0, GROUP_SIZE), more: list.length > GROUP_SIZE }
        : { type: t, items: list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), more: list.length > page * PAGE_SIZE },
    )
    .filter((g) => g.items.length > 0);
  return { query, types: [...types].sort(byTypeOrder), type, page, groups, tooShort: false };
}

/** The record's related records, its documents (with `document.view`) and what the reader may do. */
export function relatedOf(ctx: HandlerContext, id: string): RelatedResponse | null {
  const record = resolveRecord(ctx, id);
  if (!record) return null;
  const provider = PROVIDERS.find((p) => p.owns(id));
  const documents = canViewDocuments(ctx)
    ? visibleDocs(ctx, { context: false })
        .filter((x) => x.doc.recordId === id)
        .map((x) => {
          const s = summaryOf(ctx, x);
          return { id: s.id, ref: s.ref, title: s.title, kind: s.kind, version: current(x.doc).n, expiry: s.expiry, href: docHref(s.id) };
        })
    : null;
  return {
    record,
    groups: provider?.related?.(ctx, id) ?? [],
    documents,
    canAttach: (DOCUMENT_LINK_TYPES as readonly string[]).includes(record.type) && canAttachTo(ctx, record),
    favourite: isFavourite(ctx, id),
  };
}
