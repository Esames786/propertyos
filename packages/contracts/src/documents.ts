import type { RecordRef } from './productivity';

/**
 * Gate E.13 (provisional, Wave 1): documents attached to records (DOC-002 preview, DOC-003 upload,
 * DOC-004 versions, DOC-005 expiring documents) and versioned templates and policies (DOC-006).
 *
 * **Per linked record.** A document has no access of its own: it inherits its record's. Seeing it
 * needs `document.view` AND the linked record visible to the reader under that record's own rule
 * (module licence for its site, permission, project scope); adding one needs `document.upload` and
 * a record the reader may change. Ids, file names, counts, versions and notes of any other document
 * are never returned: an unknown id and a hidden one answer the same 404.
 *
 * **Demo files only.** An uploaded file stays in this browser's demo store (no storage service, no
 * network), is labelled demo and is limited in type and size. Seeded documents are fictional pages.
 * Versions are immutable: a new upload adds a version, nothing is overwritten or deleted.
 */

export const DOC_KINDS = ['agreement', 'identity', 'allotment', 'payment_plan', 'approval', 'drawing', 'correspondence', 'photo', 'other'] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/** Kinds of record a document can be attached to today (later slices add theirs at integration). */
export const DOCUMENT_LINK_TYPES = ['lead', 'party', 'unit', 'project'] as const;
export type DocumentLinkType = (typeof DOCUMENT_LINK_TYPES)[number];

/** File types the demo accepts (checked in the browser first and again by the mock server). */
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv'] as const;
export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];

/** 1 MB per demo file; the documents of one organisation keep at most 4 MB of demo content. */
export const DOCUMENT_MAX_BYTES = 1_048_576;
export const DOCUMENT_STORE_BUDGET = 4_194_304;

export const EXPIRY_STATES = ['none', 'valid', 'expiring', 'expired'] as const;
export type ExpiryState = (typeof EXPIRY_STATES)[number];
/** "Expiring" means within this many days of today (the demo's business date). */
export const EXPIRING_WITHIN_DAYS = 30;
export const EXPIRY_WINDOWS = ['expired', '30', '60', '90'] as const;
export type ExpiryWindow = (typeof EXPIRY_WINDOWS)[number];

export interface DocumentPreview {
  /**
   * `page`: a generated fictional page (seeded documents); `image` / `pdf` / `text`: the demo file kept
   * in this browser; `none`: no preview for this file type (it can still be downloaded).
   */
  kind: 'page' | 'image' | 'pdf' | 'text' | 'none';
  dataUrl?: string;
  text?: string;
  page?: { heading: string; lines: string[] };
}

export interface DocumentSummary {
  id: string;
  ref: string;
  title: string;
  kind: DocKind;
  /** The linked record, as this reader sees it. */
  record: RecordRef;
  version: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  expiresOn: string | null;
  expiry: ExpiryState;
  /** Days from today to the expiry date (negative once expired); null without an expiry date. */
  daysLeft: number | null;
  updatedAt: string;
  updatedByName: string;
  href: string;
  demo: true;
}

export interface DocumentVersionView {
  n: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Fingerprint of the demo content (identical files show the same value). */
  checksum: string;
  uploadedAt: string;
  uploadedByName: string;
  note: string;
  expiresOn: string | null;
  current: boolean;
}

export interface DocumentEvent {
  at: string;
  byName: string;
  action: 'uploaded' | 'version_added';
  version: number;
  note: string;
}

export interface DocumentDetail extends DocumentSummary {
  versions: DocumentVersionView[];
  preview: DocumentPreview;
  previewVersion: number;
  history: DocumentEvent[];
  /** Other documents of the same record that this reader may see. */
  siblings: DocumentSummary[];
  canUpload: boolean;
}

export interface DocumentsList {
  items: DocumentSummary[];
  /** Counts of the reader's own visible documents (never of hidden ones). */
  counts: { all: number; expiry: Record<ExpiryState, number>; kinds: Partial<Record<DocKind, number>> };
  projects: Array<{ id: string; name: string }>;
  canUpload: boolean;
}

export interface ExpiringDocuments {
  today: string;
  window: ExpiryWindow;
  items: DocumentSummary[];
  counts: Record<ExpiryWindow, number>;
  projects: Array<{ id: string; name: string }>;
  canUpload: boolean;
}

/** Records the reader may attach a document to (the upload drawer's searchable list). */
export interface AttachTargets {
  items: RecordRef[];
}

export interface DocumentUploadInput {
  recordId: string;
  title: string;
  kind: DocKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** The demo file as a data URL (kept in this browser only). */
  content: string;
  expiresOn?: string | null;
  note?: string;
  idempotencyKey?: string;
}

export interface DocumentVersionInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  content: string;
  note: string;
  expiresOn?: string | null;
  idempotencyKey?: string;
}

export interface DocumentCreated {
  id: string;
  ref: string;
  version: number;
  href: string;
  /** The same request was answered before: nothing new was created. */
  replayed: boolean;
}

// ---------------------------------------------------------------------------------------------
// DOC-006 templates and policies (the APR-004 versioned-policy pattern)
// ---------------------------------------------------------------------------------------------
export const TEMPLATE_CATEGORIES = ['template', 'policy'] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** A version is drafted (awaiting approval), then approved by another person or returned. */
export type TemplateVersionState = 'pending' | 'effective' | 'scheduled' | 'superseded' | 'returned';

export interface TemplateVersionView {
  n: number;
  state: TemplateVersionState;
  effectiveFrom: string;
  body: string;
  note: string;
  draftedByName: string;
  draftedAt: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  /** The reader drafted it (and may therefore never approve it). */
  mine: boolean;
  /** The reader may approve or return it now. */
  canDecide: boolean;
}

export interface TemplateSummary {
  id: string;
  ref: string;
  name: string;
  category: TemplateCategory;
  /** Null: the whole organisation. */
  project: { id: string; name: string } | null;
  effectiveVersion: number | null;
  pendingVersion: number | null;
  updatedAt: string;
  href: string;
}

export interface TemplateEvent {
  at: string;
  byName: string;
  action: 'drafted' | 'approved' | 'returned';
  version: number;
  note: string;
}

export interface TemplateDetail extends TemplateSummary {
  versions: TemplateVersionView[];
  history: TemplateEvent[];
  canDraft: boolean;
}

export interface TemplatesList {
  items: TemplateSummary[];
  canDraft: boolean;
  canApprove: boolean;
  projects: Array<{ id: string; name: string }>;
  /** Versions waiting for this reader's decision (their own drafts are never counted). */
  awaitingYou: number;
}

export interface TemplateDraftInput {
  body: string;
  effectiveFrom: string;
  note: string;
  idempotencyKey?: string;
}

export interface TemplateDecisionInput {
  decision: 'approve' | 'return';
  note: string;
}
