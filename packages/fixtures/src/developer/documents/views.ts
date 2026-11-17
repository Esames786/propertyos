import { DOCUMENT_LINK_TYPES, EXPIRING_WITHIN_DAYS, type DocumentDetail, type DocumentEvent, type DocumentPreview, type DocumentSummary, type ExpiryState, type RecordRef, type TemplateDetail, type TemplateEvent, type TemplateSummary, type TemplateVersionState, type TemplateVersionView } from '@repo/contracts';
import { can, type HandlerContext } from '../../handler-types';
import { daysBetween, orgWide } from '../workspace/common';
import { attachableCore, inContext, projectAllows, resolveCore } from '../workspace/records';
import { documentsState, type DocumentsState, type StoredDocument, type StoredTemplate, type StoredTemplateVersion, type StoredVersion } from './state';

/**
 * Gate E.13 document read models. **Inheritance:** a document is visible only when the reader holds
 * `document.view` AND its linked record resolves for them (the record kind's own rule, see
 * workspace/records.ts). **Projection:** every list, count, sibling list, version list, history,
 * task, activity entry and search hit is built from visible documents only, so a hidden document's
 * id, reference, title, file names, versions, notes and even its existence never reach the reader.
 */

export const canViewDocuments = (ctx: HandlerContext) => can(ctx, 'document.view', 'operational');
export const canUploadDocuments = (ctx: HandlerContext) => can(ctx, 'document.upload', 'operational');

export interface Visible {
  doc: StoredDocument;
  record: RecordRef;
}

export const docsOf = (ctx: HandlerContext): DocumentsState => documentsState(ctx);

/** The document with its linked record as this reader sees it, or null (unknown and hidden alike). */
export function visibleDoc(ctx: HandlerContext, id: string, st: DocumentsState = docsOf(ctx)): Visible | null {
  if (!canViewDocuments(ctx)) return null;
  const doc = st.docs.find((d) => d.id === id);
  if (!doc) return null;
  const record = resolveCore(ctx, doc.recordId);
  return record ? { doc, record } : null;
}

/** Every document the reader may see; lists also follow the header's project context. */
export function visibleDocs(ctx: HandlerContext, { context = true, st = docsOf(ctx) }: { context?: boolean; st?: DocumentsState } = {}): Visible[] {
  if (!canViewDocuments(ctx)) return [];
  const out: Visible[] = [];
  for (const doc of st.docs) {
    const record = resolveCore(ctx, doc.recordId);
    if (record && (!context || inContext(ctx, record))) out.push({ doc, record });
  }
  return out;
}

export const current = (doc: StoredDocument): StoredVersion => doc.versions[doc.versions.length - 1]!;

export function expiryOf(today: string, expiresOn: string | null): { expiry: ExpiryState; daysLeft: number | null } {
  if (!expiresOn) return { expiry: 'none', daysLeft: null };
  const daysLeft = daysBetween(today, expiresOn);
  return { expiry: daysLeft < 0 ? 'expired' : daysLeft <= EXPIRING_WITHIN_DAYS ? 'expiring' : 'valid', daysLeft };
}

export const docHref = (id: string, extra = '') => `/backoffice/doc/document-preview?record=${id}${extra}`;

export function summaryOf(ctx: HandlerContext, { doc, record }: Visible): DocumentSummary {
  const v = current(doc);
  return {
    id: doc.id,
    ref: doc.ref,
    title: doc.title,
    kind: doc.kind,
    record,
    version: v.n,
    fileName: v.fileName,
    mimeType: v.mimeType,
    sizeBytes: v.sizeBytes,
    expiresOn: v.expiresOn,
    ...expiryOf(ctx.at, v.expiresOn),
    updatedAt: v.uploadedAt,
    updatedByName: v.uploadedByName,
    href: docHref(doc.id),
    demo: true,
  };
}

function decodeText(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  const payload = dataUrl.slice(comma + 1);
  try {
    if (/;base64$/i.test(dataUrl.slice(0, comma))) {
      const bin = atob(payload);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes).slice(0, 20_000);
    }
    return decodeURIComponent(payload).slice(0, 20_000);
  } catch {
    return '';
  }
}

export function previewOf(doc: StoredDocument, v: StoredVersion): DocumentPreview {
  if (!v.content) return { kind: 'page', page: { heading: doc.title, lines: [doc.issuer ?? '', v.note].filter(Boolean) } };
  if (v.mimeType.startsWith('image/')) return { kind: 'image', dataUrl: v.content };
  if (v.mimeType === 'application/pdf') return { kind: 'pdf', dataUrl: v.content };
  if (v.mimeType.startsWith('text/')) return { kind: 'text', text: decodeText(v.content) };
  return { kind: 'none' };
}

export const canAttachTo = (ctx: HandlerContext, record: RecordRef) => canUploadDocuments(ctx) && (DOCUMENT_LINK_TYPES as readonly string[]).includes(record.type) && attachableCore(ctx, record.id);

export function detailOf(ctx: HandlerContext, visible: Visible, versionNo?: number): DocumentDetail {
  const { doc, record } = visible;
  const chosen = doc.versions.find((x) => x.n === versionNo) ?? current(doc);
  const history: DocumentEvent[] = doc.versions
    .map((x): DocumentEvent => ({ at: x.uploadedAt, byName: x.uploadedByName, action: x.n === 1 ? 'uploaded' : 'version_added', version: x.n, note: x.note }))
    .reverse();
  const siblings = visibleDocs(ctx, { context: false })
    .filter((x) => x.doc.recordId === doc.recordId && x.doc.id !== doc.id)
    .map((x) => summaryOf(ctx, x));
  return {
    ...summaryOf(ctx, visible),
    versions: [...doc.versions].reverse().map((x) => ({
      n: x.n,
      fileName: x.fileName,
      mimeType: x.mimeType,
      sizeBytes: x.sizeBytes,
      checksum: x.checksum,
      uploadedAt: x.uploadedAt,
      uploadedByName: x.uploadedByName,
      note: x.note,
      expiresOn: x.expiresOn,
      current: x.n === current(doc).n,
    })),
    preview: previewOf(doc, chosen),
    previewVersion: chosen.n,
    history,
    siblings,
    canUpload: canAttachTo(ctx, record),
  };
}

// ---------------------------------------------------------------------------------------------
// Templates and policies (DOC-006)
// ---------------------------------------------------------------------------------------------
export const canDraftTemplates = (ctx: HandlerContext) => can(ctx, 'document_template.manage', 'operational');
export const canApproveTemplates = (ctx: HandlerContext) => can(ctx, 'document_template.approve', 'operational');

/** An organisation-wide template is visible to every document reader; a project's needs that project. */
export function templateVisible(ctx: HandlerContext, t: StoredTemplate): boolean {
  if (!canViewDocuments(ctx)) return false;
  return t.projectId === null ? true : projectAllows(ctx, t.projectId, 'core');
}

/** Acting on a template needs authority over all it covers: the organisation, or its project. */
export const templateGoverned = (ctx: HandlerContext, t: StoredTemplate) => (t.projectId === null ? orgWide(ctx) : projectAllows(ctx, t.projectId, 'core'));

export const templateHref = (id: string, extra = '') => `/backoffice/doc/templates-and-policies?record=${id}${extra}`;

export function versionState(t: StoredTemplate, v: StoredTemplateVersion, today: string): TemplateVersionState {
  if (!v.decision) return 'pending';
  if (v.decision.kind === 'returned') return 'returned';
  if (v.effectiveFrom > today) return 'scheduled';
  const effective = [...t.versions].filter((x) => x.decision?.kind === 'approved' && x.effectiveFrom <= today).sort((a, b) => b.n - a.n)[0];
  return effective?.n === v.n ? 'effective' : 'superseded';
}

const projectName = (ctx: HandlerContext, id: string | null) => (id ? (ctx.data.projects.find((p) => p.id === id) ?? null) : null);

export function templateSummary(ctx: HandlerContext, t: StoredTemplate): TemplateSummary {
  const states = t.versions.map((v) => ({ v, state: versionState(t, v, ctx.at) }));
  const p = projectName(ctx, t.projectId);
  const last = t.versions[t.versions.length - 1]!;
  return {
    id: t.id,
    ref: t.ref,
    name: t.name,
    category: t.category,
    project: p ? { id: p.id, name: p.name } : null,
    effectiveVersion: states.find((x) => x.state === 'effective')?.v.n ?? null,
    pendingVersion: states.find((x) => x.state === 'pending')?.v.n ?? null,
    updatedAt: last.decision?.at ?? last.draftedAt,
    href: templateHref(t.id),
  };
}

export const mayDecide = (ctx: HandlerContext, t: StoredTemplate, v: StoredTemplateVersion) =>
  !v.decision && canApproveTemplates(ctx) && templateGoverned(ctx, t) && v.draftedBy !== ctx.persona?.principalId;

export function templateDetail(ctx: HandlerContext, t: StoredTemplate): TemplateDetail {
  const me = ctx.persona?.principalId;
  const versions: TemplateVersionView[] = [...t.versions].reverse().map((v) => ({
    n: v.n,
    state: versionState(t, v, ctx.at),
    effectiveFrom: v.effectiveFrom,
    body: v.body,
    note: v.note,
    draftedByName: v.draftedByName,
    draftedAt: v.draftedAt,
    ...(v.decision ? { decidedByName: v.decision.byName, decidedAt: v.decision.at, decisionNote: v.decision.note } : {}),
    mine: v.draftedBy === me,
    canDecide: mayDecide(ctx, t, v),
  }));
  const history: TemplateEvent[] = t.versions
    .flatMap((v): TemplateEvent[] => [
      { at: v.draftedAt, byName: v.draftedByName, action: 'drafted', version: v.n, note: v.note },
      ...(v.decision ? [{ at: v.decision.at, byName: v.decision.byName, action: v.decision.kind, version: v.n, note: v.decision.note } as TemplateEvent] : []),
    ])
    .sort((a, b) => b.at.localeCompare(a.at));
  return { ...templateSummary(ctx, t), versions, history, canDraft: canDraftTemplates(ctx) && templateGoverned(ctx, t) && !t.versions.some((v) => !v.decision) };
}
