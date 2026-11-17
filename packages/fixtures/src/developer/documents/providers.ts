import { matches, type HandlerContext } from '../../handler-types';
import type { RecordRef } from '@repo/contracts';
import { CORE_PROVIDERS, type RecordProvider } from '../workspace/records';
import { docsOf, canViewDocuments, current, docHref, templateHref, templateVisible, visibleDoc, visibleDocs, type Visible } from './views';

/**
 * Documents and templates as kinds of record for the workspace (search, favourites, recent records,
 * related cards). They resolve only through the inheritance rule of views.ts, so a document the
 * reader may not see is unknown to every one of those screens.
 */
const docRef = ({ doc, record }: Visible): RecordRef => ({
  type: 'document',
  id: doc.id,
  ref: doc.ref,
  title: doc.title,
  subtitleKey: `documents:kinds.${doc.kind}`,
  href: docHref(doc.id),
  module: 'core',
  ...(record.project ? { project: record.project } : {}),
  favouritable: true,
});

function templateRef(ctx: HandlerContext, id: string): RecordRef | null {
  const t = docsOf(ctx).templates.find((x) => x.id === id);
  if (!t || !templateVisible(ctx, t)) return null;
  const p = t.projectId ? ctx.data.projects.find((x) => x.id === t.projectId) : undefined;
  return { type: 'template', id: t.id, ref: t.ref, title: t.name, subtitleKey: `documents:templates.category.${t.category}`, href: templateHref(t.id), module: 'core', ...(p ? { project: { id: p.id, name: p.name } } : {}), favouritable: true };
}

export const DOCUMENT_PROVIDERS: readonly RecordProvider[] = [
  {
    type: 'document',
    owns: (id) => id.startsWith('doc_'),
    resolve: (ctx, id) => {
      const v = visibleDoc(ctx, id);
      return v ? docRef(v) : null;
    },
    searchable: canViewDocuments,
    search: (ctx, q, limit) =>
      visibleDocs(ctx)
        .filter(({ doc }) => matches(q, doc.title, doc.ref, current(doc).fileName))
        .slice(0, limit)
        .map(docRef),
    related: (ctx, id) => {
      const v = visibleDoc(ctx, id)!;
      const own = CORE_PROVIDERS.find((p) => p.owns(v.record.id));
      return [{ type: v.record.type, relationKey: 'workspace:hub.related.rel.linkedTo', items: [v.record], more: false }, ...(own?.related?.(ctx, v.record.id) ?? [])];
    },
  },
  {
    type: 'template',
    owns: (id) => id.startsWith('dtp_'),
    resolve: templateRef,
    searchable: canViewDocuments,
    search: (ctx, q, limit) =>
      docsOf(ctx)
        .templates.filter((t) => templateVisible(ctx, t) && (t.projectId === null || ctx.allowsProject(t.projectId)) && matches(q, t.name, t.ref))
        .slice(0, limit)
        .map((t) => templateRef(ctx, t.id)!),
  },
];
