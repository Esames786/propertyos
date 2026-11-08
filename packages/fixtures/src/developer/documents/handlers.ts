import {
  DOC_KINDS,
  DOCUMENT_LINK_TYPES,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  DOCUMENT_STORE_BUDGET,
  EXPIRY_STATES,
  EXPIRY_WINDOWS,
  TEMPLATE_CATEGORIES,
  type AttachTargets,
  type DocumentCreated,
  type DocumentDetail,
  type DocKind,
  type DocumentsList,
  type DocumentSummary,
  type DocumentUploadInput,
  type DocumentVersionInput,
  type ExpiringDocuments,
  type ExpiryWindow,
  type RecordRef,
  type TemplateDecisionInput,
  type TemplateDetail,
  type TemplateDraftInput,
  type TemplatesList,
} from '@repo/contracts';
import { forbid, matches, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { bodyOf, fingerprint, idemKey, invalidField, isDate, officeOnly, orgWide, problem, queryOf, remember, replayOf, stampOf, str } from '../workspace/common';
import { CORE_PROVIDERS, projectAllows, resolveCore } from '../workspace/records';
import { nextDocRef, nextTemplateRef, type DocumentsState, type StoredDocument, type StoredTemplate, type StoredVersion } from './state';
import {
  canAttachTo,
  canApproveTemplates,
  canDraftTemplates,
  canUploadDocuments,
  canViewDocuments,
  current,
  detailOf,
  docHref,
  docsOf,
  mayDecide,
  summaryOf,
  templateDetail,
  templateGoverned,
  templateSummary,
  templateVisible,
  visibleDoc,
  visibleDocs,
} from './views';

/**
 * Gate E.13 documents and templates API (DOC-002…006). Every changing handler follows the plan's
 * order of checks (§4.2): (1) module and permission (the transport), (2) authority over the linked
 * record or the template's project, (3) the record's state, (4) ids — an unknown id and a hidden one
 * answer the same 404, (5) maker ≠ checker by principal, (6) every field validated before anything is
 * stored (a message never names a record the reader cannot see), (7) mutate, then the history entry.
 * A refusal changes nothing. Creates bind their idempotency key to the operation, the person, the
 * target and the input (Issue #16 P0-2 pattern).
 */

const read = requires('core', 'document.view', 'operational');
const upload = requires('core', 'document.upload', 'operational');
const route = (p: string) => new RegExp(`^${p.replace(/:(\w+)/g, '(?<$1>[\\w-]+)')}$`);

const save = (ctx: HandlerContext) => ctx.demo.save();

function projectsFor(ctx: HandlerContext): Array<{ id: string; name: string }> {
  return ctx.data.projects.filter((p) => ctx.allowsProject(p.id) && projectAllows(ctx, p.id, 'core')).map((p) => ({ id: p.id, name: p.name }));
}

const byUpdated = (a: DocumentSummary, b: DocumentSummary) => b.updatedAt.localeCompare(a.updatedAt) || a.ref.localeCompare(b.ref);

function listDocuments(ctx: HandlerContext): DocumentsList {
  officeOnly(ctx);
  const q = str(queryOf(ctx).q, 80);
  const kind = str(queryOf(ctx).kind, 30);
  const expiry = str(queryOf(ctx).expiry, 20);
  const project = str(queryOf(ctx).project, 40);
  const type = str(queryOf(ctx).type, 20);
  const recordId = str(queryOf(ctx).record, 80);
  const base = visibleDocs(ctx)
    .map((x) => summaryOf(ctx, x))
    .filter((d) => !project || d.record.project?.id === project)
    .filter((d) => !type || d.record.type === type)
    .filter((d) => !recordId || d.record.id === recordId)
    .filter((d) => !q || matches(q, d.title, d.ref, d.fileName, d.record.title, d.record.ref));
  const counts: DocumentsList['counts'] = { all: base.length, expiry: Object.fromEntries(EXPIRY_STATES.map((s) => [s, base.filter((d) => d.expiry === s).length])) as DocumentsList['counts']['expiry'], kinds: {} };
  for (const d of base) counts.kinds[d.kind] = (counts.kinds[d.kind] ?? 0) + 1;
  const items = base.filter((d) => (!kind || d.kind === kind) && (!expiry || d.expiry === expiry)).sort(byUpdated);
  return { items, counts, projects: projectsFor(ctx), canUpload: canUploadDocuments(ctx) };
}

const inWindow = (d: DocumentSummary, w: ExpiryWindow) => d.daysLeft !== null && (w === 'expired' ? d.daysLeft < 0 : d.daysLeft >= 0 && d.daysLeft <= Number(w));

function expiringDocuments(ctx: HandlerContext): ExpiringDocuments {
  officeOnly(ctx);
  const raw = str(queryOf(ctx).window, 10);
  const window: ExpiryWindow = (EXPIRY_WINDOWS as readonly string[]).includes(raw) ? (raw as ExpiryWindow) : '30';
  const q = str(queryOf(ctx).q, 80);
  const kind = str(queryOf(ctx).kind, 30);
  const project = str(queryOf(ctx).project, 40);
  const base = visibleDocs(ctx)
    .map((x) => summaryOf(ctx, x))
    .filter((d) => d.daysLeft !== null)
    .filter((d) => !project || d.record.project?.id === project)
    .filter((d) => !kind || d.kind === kind)
    .filter((d) => !q || matches(q, d.title, d.ref, d.fileName, d.record.title, d.record.ref));
  const counts = Object.fromEntries(EXPIRY_WINDOWS.map((w) => [w, base.filter((d) => inWindow(d, w)).length])) as ExpiringDocuments['counts'];
  const items = base.filter((d) => inWindow(d, window)).sort((a, b) => a.daysLeft! - b.daysLeft! || a.ref.localeCompare(b.ref));
  return { today: ctx.at, window, items, counts, projects: projectsFor(ctx), canUpload: canUploadDocuments(ctx) };
}

/** Records the reader may attach a document to (searchable; nothing else is listed or counted). */
function attachTargets(ctx: HandlerContext): AttachTargets {
  officeOnly(ctx);
  const q = str(queryOf(ctx).q, 60);
  const providers = CORE_PROVIDERS.filter((p) => (DOCUMENT_LINK_TYPES as readonly string[]).includes(p.type) && p.search && p.searchable?.(ctx));
  const hits: RecordRef[] =
    q.length >= 2
      ? providers.flatMap((p) => p.search!(ctx, q, 8))
      : ctx.data.projects.filter((p) => ctx.allowsProject(p.id)).map((p) => resolveCore(ctx, p.id)).filter((r): r is RecordRef => r !== null);
  const seen = new Set<string>();
  return { items: hits.filter((r) => !seen.has(r.id) && seen.add(r.id) && canAttachTo(ctx, r)).slice(0, 20) };
}

// ---------------------------------------------------------------------------------------------
// Validation (step 6): the caller's own input only
// ---------------------------------------------------------------------------------------------
const FILE_NAME = /^[^\\/:*?"<>|\u0000-\u001f]{1,120}$/;

interface FileInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  content: string;
}

function base64Bytes(b64: string): number {
  const clean = b64.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) return -1;
  return (clean.length / 4) * 3 - (clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0);
}

function checkFile(ctx: HandlerContext, raw: Partial<FileInput>): FileInput {
  const fileName = str(raw.fileName, 200);
  const mimeType = str(raw.mimeType, 100);
  const sizeBytes = Number(raw.sizeBytes);
  const content = typeof raw.content === 'string' ? raw.content : '';
  if (!fileName || !FILE_NAME.test(fileName)) invalidField(ctx, 'file', 'documents:problems.fileName');
  if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)) invalidField(ctx, 'file', 'documents:problems.fileType');
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > DOCUMENT_MAX_BYTES) invalidField(ctx, 'file', 'documents:problems.fileSize', { max: '1 MB' });
  const prefix = `data:${mimeType};base64,`;
  if (!content.startsWith(prefix) || base64Bytes(content.slice(prefix.length)) !== sizeBytes) invalidField(ctx, 'file', 'documents:problems.fileUnreadable');
  return { fileName, mimeType, sizeBytes, content };
}

function checkExpiry(ctx: HandlerContext, kind: DocKind, raw: unknown): string | null {
  const value = raw === null || raw === undefined ? '' : str(raw, 10);
  if (!value) {
    if (kind === 'identity') invalidField(ctx, 'expiresOn', 'documents:problems.expiryRequired');
    return null;
  }
  if (!isDate(value) || value < '2000-01-01' || value > '2100-12-31') invalidField(ctx, 'expiresOn', 'documents:problems.expiryInvalid');
  return value;
}

/** Demo storage: the organisation's uploaded files together stay under the budget. */
function checkBudget(ctx: HandlerContext, st: DocumentsState, adding: number): void {
  const used = st.docs.flatMap((d) => d.versions).filter((v) => v.content).reduce((s, v) => s + v.sizeBytes, 0);
  if (used + adding > DOCUMENT_STORE_BUDGET) invalidField(ctx, 'file', 'documents:problems.storeFull');
}

function created(ctx: HandlerContext, docId: string, replayed: boolean): DocumentCreated {
  // A replay is answered only while the reader can still see what it created (authority re-checked).
  const visible = visibleDoc(ctx, docId);
  if (!visible) notFound(ctx);
  return { id: visible.doc.id, ref: visible.doc.ref, version: current(visible.doc).n, href: docHref(visible.doc.id), replayed };
}

function uploadDocument(ctx: HandlerContext): DocumentCreated {
  officeOnly(ctx);
  if (!canViewDocuments(ctx)) forbid(ctx);
  const body = bodyOf<DocumentUploadInput>(ctx);
  const st = docsOf(ctx);
  // (2) + (4): the record must be one the reader may see; unknown and hidden answer alike.
  const recordId = str(body.recordId, 80);
  if (!recordId) invalidField(ctx, 'recordId', 'documents:problems.recordRequired');
  const record = resolveCore(ctx, recordId);
  if (!record) notFound(ctx);
  if (!(DOCUMENT_LINK_TYPES as readonly string[]).includes(record.type)) invalidField(ctx, 'recordId', 'documents:problems.recordKind');
  if (!canAttachTo(ctx, record)) forbid(ctx);
  // (6)
  const title = str(body.title, 200);
  if (title.length < 3 || title.length > 120) invalidField(ctx, 'title', 'documents:problems.title');
  const kind = str(body.kind, 30) as DocKind;
  if (!(DOC_KINDS as readonly string[]).includes(kind)) invalidField(ctx, 'kind', 'documents:problems.kind');
  const file = checkFile(ctx, body);
  const expiresOn = checkExpiry(ctx, kind, body.expiresOn);
  const note = str(body.note, 400);
  if (note.length > 300) invalidField(ctx, 'note', 'documents:problems.noteLong');
  const input = { recordId, title, kind, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, checksum: fingerprint(file.content), expiresOn, note };
  const replay = replayOf(ctx, st.idempotency, 'document.upload', recordId, input);
  if (replay) return created(ctx, replay, true);
  checkBudget(ctx, st, file.sizeBytes);
  // (7)
  const id = ctx.demo.nextId('doc');
  const version: StoredVersion = { n: 1, ...file, checksum: input.checksum, uploadedAt: stampOf(ctx), uploadedBy: ctx.persona!.principalId, uploadedByName: ctx.persona!.displayName, note, expiresOn };
  const doc: StoredDocument = { id, ref: nextDocRef(st), title, kind, recordId, versions: [version] };
  st.docs.push(doc);
  remember(ctx, st.idempotency, 'document.upload', recordId, input, id);
  save(ctx);
  return created(ctx, id, false);
}

function addVersion(ctx: HandlerContext): DocumentCreated {
  officeOnly(ctx);
  const st = docsOf(ctx);
  const visible = visibleDoc(ctx, ctx.params.id!, st);
  if (!visible) notFound(ctx);
  if (!canAttachTo(ctx, visible.record)) forbid(ctx);
  const body = bodyOf<DocumentVersionInput>(ctx);
  const file = checkFile(ctx, body);
  const note = str(body.note, 400);
  if (note.length < 3 || note.length > 300) invalidField(ctx, 'note', 'documents:problems.versionNote');
  const expiresOn = checkExpiry(ctx, visible.doc.kind, body.expiresOn);
  const input = { fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, checksum: fingerprint(file.content), note, expiresOn };
  const replay = replayOf(ctx, st.idempotency, 'document.version', visible.doc.id, input);
  if (replay) return created(ctx, replay, true);
  checkBudget(ctx, st, file.sizeBytes);
  visible.doc.versions.push({ n: current(visible.doc).n + 1, ...file, checksum: input.checksum, uploadedAt: stampOf(ctx), uploadedBy: ctx.persona!.principalId, uploadedByName: ctx.persona!.displayName, note, expiresOn });
  remember(ctx, st.idempotency, 'document.version', visible.doc.id, input, visible.doc.id);
  save(ctx);
  return created(ctx, visible.doc.id, false);
}

// ---------------------------------------------------------------------------------------------
// Templates and policies
// ---------------------------------------------------------------------------------------------
function listTemplates(ctx: HandlerContext): TemplatesList {
  officeOnly(ctx);
  const st = docsOf(ctx);
  const q = str(queryOf(ctx).q, 80);
  const category = str(queryOf(ctx).category, 20);
  const project = str(queryOf(ctx).project, 40);
  const visible = st.templates.filter((t) => templateVisible(ctx, t) && (t.projectId === null || ctx.allowsProject(t.projectId)));
  const items = visible
    .filter((t) => !category || t.category === category)
    .filter((t) => !project || (project === 'org' ? t.projectId === null : t.projectId === project))
    .filter((t) => !q || matches(q, t.name, t.ref))
    .map((t) => templateSummary(ctx, t));
  const awaitingYou = visible.flatMap((t) => t.versions.filter((v) => mayDecide(ctx, t, v))).length;
  return { items, canDraft: canDraftTemplates(ctx), canApprove: canApproveTemplates(ctx), projects: projectsFor(ctx), awaitingYou };
}

function findTemplate(ctx: HandlerContext, st: DocumentsState, id: string): StoredTemplate {
  const t = st.templates.find((x) => x.id === id);
  if (!t || !templateVisible(ctx, t)) notFound(ctx);
  return t;
}

interface DraftFields {
  body: string;
  effectiveFrom: string;
  note: string;
}

function checkDraft(ctx: HandlerContext, raw: Partial<TemplateDraftInput>): DraftFields {
  const body = str(raw.body, 5000);
  if (body.length < 20 || body.length > 4000) invalidField(ctx, 'body', 'documents:problems.templateBody');
  const effectiveFrom = str(raw.effectiveFrom, 10);
  if (!isDate(effectiveFrom) || effectiveFrom < ctx.at) invalidField(ctx, 'effectiveFrom', 'documents:problems.effectiveFrom');
  const note = str(raw.note, 400);
  if (note.length < 3 || note.length > 300) invalidField(ctx, 'note', 'documents:problems.versionNote');
  return { body, effectiveFrom, note };
}

function createTemplate(ctx: HandlerContext): { id: string; ref: string; href: string; replayed: boolean } {
  officeOnly(ctx);
  if (!canViewDocuments(ctx)) forbid(ctx);
  const st = docsOf(ctx);
  const raw = bodyOf<TemplateDraftInput & { name: string; category: string; projectId: string | null }>(ctx);
  // (2): a project the reader may see and act on; an organisation-wide one needs organisation-wide scope.
  const projectId = raw.projectId ? str(raw.projectId, 40) : null;
  if (projectId !== null && !projectAllows(ctx, projectId, 'core')) notFound(ctx);
  if (projectId === null && !orgWide(ctx)) forbid(ctx);
  // (6)
  const name = str(raw.name, 200);
  if (name.length < 3 || name.length > 120) invalidField(ctx, 'name', 'documents:problems.templateName');
  const category = str(raw.category, 20);
  if (!(TEMPLATE_CATEGORIES as readonly string[]).includes(category)) invalidField(ctx, 'category', 'documents:problems.category');
  const fields = checkDraft(ctx, raw);
  const target = projectId ?? 'org';
  const input = { name, category, projectId, ...fields };
  const replay = replayOf(ctx, st.idempotency, 'template.create', target, input);
  const answer = (t: StoredTemplate, replayed: boolean) => ({ id: t.id, ref: t.ref, href: templateSummary(ctx, t).href, replayed });
  if (replay) return answer(findTemplate(ctx, st, replay), true);
  const t: StoredTemplate = {
    id: ctx.demo.nextId('dtp'),
    ref: nextTemplateRef(st),
    name,
    category: category as StoredTemplate['category'],
    projectId,
    versions: [{ n: 1, ...fields, draftedBy: ctx.persona!.principalId, draftedByName: ctx.persona!.displayName, draftedAt: stampOf(ctx) }],
  };
  st.templates.push(t);
  remember(ctx, st.idempotency, 'template.create', target, input, t.id);
  save(ctx);
  return answer(t, false);
}

function draftVersion(ctx: HandlerContext): TemplateDetail {
  officeOnly(ctx);
  const st = docsOf(ctx);
  const t = findTemplate(ctx, st, ctx.params.id!);
  if (!templateGoverned(ctx, t)) forbid(ctx);
  // (3) one draft at a time: the pending version is decided first. Only the request that drafted it
  // (same key, person and template) goes on, to be replayed (or refused as a reused key) below.
  if (t.versions.some((v) => !v.decision)) {
    const key = idemKey(ctx);
    const e = key ? st.idempotency[key] : undefined;
    if (!(e && e.op === 'template.version' && e.target === t.id && e.principal === ctx.persona!.principalId)) problem(ctx, 409, 'version_pending', 'documents:problems.versionPending');
  }
  // (6)
  const fields = checkDraft(ctx, bodyOf<TemplateDraftInput>(ctx));
  const replay = replayOf(ctx, st.idempotency, 'template.version', t.id, fields);
  if (replay) return templateDetail(ctx, t);
  t.versions.push({ n: t.versions.length + 1, ...fields, draftedBy: ctx.persona!.principalId, draftedByName: ctx.persona!.displayName, draftedAt: stampOf(ctx) });
  remember(ctx, st.idempotency, 'template.version', t.id, fields, t.id);
  save(ctx);
  return templateDetail(ctx, t);
}

function decideVersion(ctx: HandlerContext): TemplateDetail {
  officeOnly(ctx);
  const st = docsOf(ctx);
  const t = findTemplate(ctx, st, ctx.params.id!);
  if (!templateGoverned(ctx, t)) forbid(ctx);
  const v = t.versions.find((x) => String(x.n) === ctx.params.n);
  if (!v) notFound(ctx);
  // (3) state, (5) maker ≠ checker by principal, (6) the decision itself.
  if (v.decision) problem(ctx, 409, 'not_pending', 'documents:problems.notPending');
  if (v.draftedBy === ctx.persona!.principalId) problem(ctx, 403, 'separation_of_duties', 'documents:problems.ownDraft');
  const body = bodyOf<TemplateDecisionInput>(ctx);
  const decision = str(body.decision, 10);
  if (decision !== 'approve' && decision !== 'return') invalidField(ctx, 'decision', 'documents:problems.decision');
  const note = str(body.note, 400);
  if (note.length > 300 || (decision === 'return' && note.length < 3)) invalidField(ctx, 'note', 'documents:problems.returnNote');
  v.decision = { kind: decision === 'approve' ? 'approved' : 'returned', by: ctx.persona!.principalId, byName: ctx.persona!.displayName, at: stampOf(ctx), note };
  save(ctx);
  return templateDetail(ctx, t);
}

export const DOCUMENT_HANDLERS: readonly Handler[] = [
  { method: 'GET', pattern: route('/documents'), access: read, handle: listDocuments },
  { method: 'GET', pattern: route('/documents/expiring'), access: read, handle: expiringDocuments },
  { method: 'GET', pattern: route('/documents/targets'), access: upload, handle: attachTargets },
  {
    method: 'GET',
    pattern: route('/documents/:id'),
    access: read,
    handle: (ctx): DocumentDetail => {
      officeOnly(ctx);
      const visible = visibleDoc(ctx, ctx.params.id!);
      if (!visible) notFound(ctx);
      const n = Number(queryOf(ctx).version);
      return detailOf(ctx, visible, Number.isInteger(n) ? n : undefined);
    },
  },
  { method: 'POST', pattern: route('/documents'), access: upload, handle: uploadDocument },
  { method: 'POST', pattern: route('/documents/:id/versions'), access: upload, handle: addVersion },
  { method: 'GET', pattern: route('/document-templates'), access: read, handle: listTemplates },
  {
    method: 'GET',
    pattern: route('/document-templates/:id'),
    access: read,
    handle: (ctx): TemplateDetail => {
      officeOnly(ctx);
      return templateDetail(ctx, findTemplate(ctx, docsOf(ctx), ctx.params.id!));
    },
  },
  { method: 'POST', pattern: route('/document-templates'), access: requires('core', 'document_template.manage', 'operational'), handle: createTemplate },
  { method: 'POST', pattern: route('/document-templates/:id/versions'), access: requires('core', 'document_template.manage', 'operational'), handle: draftVersion },
  { method: 'POST', pattern: route('/document-templates/:id/versions/:n/decision'), access: requires('core', 'document_template.approve', 'operational'), handle: decideVersion },
];


