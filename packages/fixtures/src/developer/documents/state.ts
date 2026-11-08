import type { DocKind, TemplateCategory } from '@repo/contracts';
import type { HandlerContext } from '../../handler-types';
import { fingerprint, type BoundKey } from '../workspace/common';

/**
 * Gate E.13 documents of an organisation (one versioned state per tenant, in its demo partition;
 * module-local until E.0's developer state lands). Seeds are deterministic and fictional: Larkspur
 * Estates has documents on its two projects, on units, leads and customers, and four templates and
 * policies; Crescent Bay has two (one on a Plaza shop, where inventory is not licensed, so nobody can
 * see it). Nothing here is a real person, approval, file or authority.
 *
 * A document never stores who may see it: it inherits its linked record's access on every read.
 * Versions are append-only; a demo upload keeps its file as a data URL in this browser only.
 */
// 1: Gate E.13 Wave 1.
export const DOC_STATE_VERSION = 1;
export const DOC_SECTION = 'e13.documents';

export interface StoredVersion {
  n: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  /** The uploaded demo file (data URL); absent for seeded documents, whose page is generated. */
  content?: string;
  uploadedAt: string;
  uploadedBy: string;
  uploadedByName: string;
  note: string;
  expiresOn: string | null;
}

export interface StoredDocument {
  id: string;
  ref: string;
  title: string;
  kind: DocKind;
  recordId: string;
  versions: StoredVersion[];
  /** Seeded: a fictional issuer line for the generated page. */
  issuer?: string;
}

export interface StoredTemplateVersion {
  n: number;
  body: string;
  effectiveFrom: string;
  note: string;
  draftedBy: string;
  draftedByName: string;
  draftedAt: string;
  decision?: { kind: 'approved' | 'returned'; by: string; byName: string; at: string; note: string };
}

export interface StoredTemplate {
  id: string;
  ref: string;
  name: string;
  category: TemplateCategory;
  /** Null: the whole organisation. */
  projectId: string | null;
  versions: StoredTemplateVersion[];
}

export interface DocumentsState {
  version: number;
  counter: number;
  code: string;
  docs: StoredDocument[];
  templates: StoredTemplate[];
  idempotency: Record<string, BoundKey>;
}

const CODES: Record<string, string> = { tnt_larkspur: 'LSP', tnt_crescent: 'CBD' };

const empty = (tenantId: string): DocumentsState => ({ version: DOC_STATE_VERSION, counter: 0, code: CODES[tenantId] ?? 'ORG', docs: [], templates: [], idempotency: {} });

/** The organisation's documents, created (and seeded) on first use. */
export function documentsState(ctx: HandlerContext): DocumentsState {
  const make = () => seeded(ctx.tenantId ?? '');
  const state = ctx.demo.section<DocumentsState>(DOC_SECTION, make);
  if (state.version !== DOC_STATE_VERSION) Object.assign(state, make());
  return state;
}

export const nextDocRef = (s: DocumentsState) => {
  s.counter += 1;
  return `DOC-${s.code}-${String(s.counter).padStart(4, '0')}`;
};
export const nextTemplateRef = (s: DocumentsState) => `TPL-${s.code}-${String(s.templates.length + 1).padStart(3, '0')}`;

// ---------------------------------------------------------------------------------------------
// Seeds (fictional)
// ---------------------------------------------------------------------------------------------
const NADIA = { by: 'usr_lsp_0001', name: 'Nadia Rahman' };
const TEHMINA = { by: 'usr_lsp_d0001', name: 'Tehmina Durrani' };
const HAROON = { by: 'usr_lsp_d0002', name: 'Haroon Qadri' };
const ZAIN = { by: 'usr_cbd_0001', name: 'Zain Abbasi' };

type Who = typeof NADIA;
const v = (docId: string, n: number, who: Who, at: string, fileName: string, mimeType: string, sizeBytes: number, note: string, expiresOn: string | null = null): StoredVersion => ({
  n,
  fileName,
  mimeType,
  sizeBytes,
  checksum: fingerprint(`${docId}:v${n}:${fileName}`),
  uploadedAt: at,
  uploadedBy: who.by,
  uploadedByName: who.name,
  note,
  expiresOn,
});

function doc(s: DocumentsState, id: string, title: string, kind: DocKind, recordId: string, issuer: string, versions: (id: string) => StoredVersion[]): void {
  s.counter += 1;
  s.docs.push({ id, ref: `DOC-${s.code}-${String(s.counter).padStart(4, '0')}`, title, kind, recordId, issuer, versions: versions(id) });
}

const PDF = 'application/pdf';
const JPG = 'image/jpeg';

function seedLarkspur(s: DocumentsState): void {
  // Larkspur Heights (project)
  doc(s, 'doc_lsp_0001', 'Building plan approval — LDA (Demo)', 'approval', 'prj_heights', 'Lahore Development Authority (fictional)', (id) => [
    v(id, 1, NADIA, '2026-03-02T10:15:00Z', 'LH-building-plan-approval.pdf', PDF, 482_133, 'Initial approval received', '2026-09-30'),
    v(id, 2, HAROON, '2026-09-10T08:40:00Z', 'LH-building-plan-approval-renewal.pdf', PDF, 498_870, 'Renewal application filed; interim approval attached', '2026-11-15'),
  ]);
  doc(s, 'doc_lsp_0002', 'Larkspur Heights brochure (Demo)', 'other', 'prj_heights', 'Larkspur Estates marketing (fictional)', (id) => [v(id, 1, NADIA, '2026-04-12T07:00:00Z', 'LH-brochure-2026.pdf', PDF, 914_220, 'Spring edition')]);
  doc(s, 'doc_lsp_0003', 'Fire safety NOC — Tower A (Demo)', 'approval', 'prj_heights', 'Rescue 1122 Lahore (fictional)', (id) => [v(id, 1, HAROON, '2025-10-21T09:00:00Z', 'LH-tower-a-fire-noc.pdf', PDF, 201_455, 'Annual NOC', '2026-10-20')]);
  // Larkspur Gardens (project): its version notes must never reach a Heights-only reader.
  doc(s, 'doc_lsp_0004', 'Larkspur Gardens master plan (Demo)', 'drawing', 'prj_gardens', 'Larkspur Estates planning (fictional)', (id) => [
    v(id, 1, NADIA, '2026-01-15T11:00:00Z', 'LG-master-plan-r1.pdf', PDF, 702_310, 'First issue'),
    v(id, 2, TEHMINA, '2026-05-04T09:30:00Z', 'LG-master-plan-r2.pdf', PDF, 715_002, 'Revised plot sizes after CDA review'),
    v(id, 3, TEHMINA, '2026-08-19T13:05:00Z', 'LG-master-plan-r3.pdf', PDF, 719_448, 'Block C road widened to 40 ft'),
  ]);
  doc(s, 'doc_lsp_0005', 'CDA layout approval — Larkspur Gardens (Demo)', 'approval', 'prj_gardens', 'Capital Development Authority (fictional)', (id) => [v(id, 1, TEHMINA, '2025-12-11T10:00:00Z', 'LG-cda-layout-approval.pdf', PDF, 356_771, 'Layout approval letter', '2026-12-10')]);
  // Units
  doc(s, 'doc_lsp_0006', 'Allotment letter — LH-A-0101 (Demo)', 'allotment', 'unt_lh_a_0101', 'Larkspur Estates sales office (fictional)', (id) => [v(id, 1, HAROON, '2026-06-03T06:45:00Z', 'LH-A-0101-allotment.pdf', PDF, 128_904, 'Issued after booking approval')]);
  doc(s, 'doc_lsp_0007', 'Floor plan — LH-A-0103 (Demo)', 'drawing', 'unt_lh_a_0103', 'Larkspur Estates planning (fictional)', (id) => [v(id, 1, HAROON, '2026-02-20T12:00:00Z', 'LH-A-0103-floor-plan.jpg', JPG, 244_118, 'As-built layout')]);
  doc(s, 'doc_lsp_0008', 'Plot possession checklist — LG-P1-002 (Demo)', 'other', 'unt_lg_p1_002', 'Larkspur Gardens site office (fictional)', (id) => [v(id, 1, TEHMINA, '2026-09-28T08:00:00Z', 'LG-P1-002-possession-checklist.pdf', PDF, 96_310, 'Boundary pillars to verify on site', '2026-11-30')]);
  // Leads
  doc(s, 'doc_lsp_0009', 'CNIC copy — Amna Abbasi (Demo)', 'identity', 'led_0004', 'Fictional identity copy', (id) => [v(id, 1, HAROON, '2026-10-02T09:20:00Z', 'amna-abbasi-cnic.jpg', JPG, 188_402, 'Front and back, fictional numbers', '2026-11-05')]);
  doc(s, 'doc_lsp_0010', 'Payment plan proposal — LD-2026-00007 (Demo)', 'payment_plan', 'led_0007', 'Larkspur Estates sales office (fictional)', (id) => [
    v(id, 1, HAROON, '2026-10-12T11:10:00Z', 'LD-2026-00007-plan-v1.pdf', PDF, 64_220, 'Illustrative 36-month plan'),
    v(id, 2, HAROON, '2026-10-19T15:45:00Z', 'LD-2026-00007-plan-v2.pdf', PDF, 66_015, 'Customer asked for a longer plan: 48 months (illustrative)'),
  ]);
  doc(s, 'doc_lsp_0011', 'CNIC copy — Hina Chaudhry (Demo)', 'identity', 'led_0006', 'Fictional identity copy', (id) => [v(id, 1, TEHMINA, '2026-09-14T10:00:00Z', 'hina-chaudhry-cnic.jpg', JPG, 176_550, 'Gardens enquiry: identity copy', '2026-10-30')]);
  doc(s, 'doc_lsp_0012', 'Site visit feedback — Haris Sheikh (Demo)', 'correspondence', 'led_0025', 'Larkspur Gardens site office (fictional)', (id) => [v(id, 1, TEHMINA, '2026-10-08T14:30:00Z', 'haris-sheikh-visit-feedback.txt', 'text/plain', 2_310, 'Prefers a corner plot in Phase 2')]);
  // Customers
  doc(s, 'doc_lsp_0013', 'NTN certificate — Evergreen Holdings (Demo)', 'identity', 'pty_0012', 'Fictional tax registration', (id) => [v(id, 1, NADIA, '2026-02-01T09:00:00Z', 'evergreen-ntn.pdf', PDF, 88_640, 'Company registration copy', '2027-02-01')]);
  doc(s, 'doc_lsp_0014', 'Passport copy — Fatima Siddiqui (Demo)', 'identity', 'pty_0032', 'Fictional identity copy', (id) => [v(id, 1, TEHMINA, '2026-03-30T10:40:00Z', 'fatima-siddiqui-passport.jpg', JPG, 205_771, 'Overseas buyer: Gardens only', '2026-09-30')]);

  s.templates.push(
    {
      id: 'dtp_lsp_001',
      ref: 'TPL-LSP-001',
      name: 'Allotment letter',
      category: 'template',
      projectId: null,
      versions: [
        tv(1, 'ALLOTMENT LETTER (illustrative template)\n\nDear {{buyer.name}},\n\nWe confirm the allotment of unit {{unit.ref}} in {{project.name}} on the terms of booking {{booking.ref}}.\nThis letter does not confirm any payment; payments are confirmed only by receipts.\n\nLarkspur Estates (Demo)', '2026-04-01', 'First approved wording', NADIA, '2026-03-20T09:00:00Z', { kind: 'approved', ...who(TEHMINA), at: '2026-03-25T11:00:00Z', note: 'Approved for use' }),
        tv(2, 'ALLOTMENT LETTER (illustrative template)\n\nDear {{buyer.name}},\n\nWe confirm the allotment of unit {{unit.ref}} in {{project.name}} on the terms of booking {{booking.ref}} and payment plan {{plan.ref}}.\nThis letter does not confirm any payment; payments are confirmed only by receipts.\n\nLarkspur Estates (Demo)', '2026-11-01', 'Adds the payment plan reference', TEHMINA, '2026-10-20T10:30:00Z'),
      ],
    },
    {
      id: 'dtp_lsp_002',
      ref: 'TPL-LSP-002',
      name: 'Booking cancellation policy',
      category: 'policy',
      projectId: null,
      versions: [
        tv(1, 'BOOKING CANCELLATION POLICY (illustrative, not legal advice)\n\n1. A cancellation request is recorded with its reason.\n2. Any refund is proposed under this policy and approved by a second person.\n3. No amount is forfeited automatically.', '2026-01-01', 'First version', NADIA, '2025-12-15T09:00:00Z', { kind: 'approved', ...who(TEHMINA), at: '2025-12-20T09:00:00Z', note: '' }),
        tv(2, 'BOOKING CANCELLATION POLICY (illustrative, not legal advice)\n\n1. A cancellation request is recorded with its reason and the customer is told within 3 working days.\n2. Any refund is proposed under this policy and approved by a second person.\n3. No amount is forfeited automatically.\n4. A refund is settled only on bank evidence.', '2026-07-01', 'Adds notice period and evidence rule', NADIA, '2026-06-10T09:00:00Z', { kind: 'approved', ...who(TEHMINA), at: '2026-06-18T12:00:00Z', note: 'Approved' }),
      ],
    },
    {
      id: 'dtp_lsp_003',
      ref: 'TPL-LSP-003',
      name: 'Site visit safety policy — Larkspur Heights',
      category: 'policy',
      projectId: 'prj_heights',
      versions: [
        tv(1, 'SITE VISIT SAFETY (illustrative)\n\nVisitors wear a helmet and stay with a staff member on every construction floor.', '2026-05-01', 'First version', HAROON, '2026-04-20T08:00:00Z', { kind: 'approved', ...who(TEHMINA), at: '2026-04-22T08:00:00Z', note: '' }),
        tv(2, 'SITE VISIT SAFETY (illustrative)\n\nVisitors wear a helmet and high-visibility vest and stay with a staff member on every construction floor. Children under 12 do not enter Tower C until handover.', '2026-11-01', 'Adds vests and the Tower C rule', HAROON, '2026-10-24T09:15:00Z'),
      ],
    },
    {
      id: 'dtp_lsp_004',
      ref: 'TPL-LSP-004',
      name: 'Plot handover checklist — Larkspur Gardens',
      category: 'template',
      projectId: 'prj_gardens',
      versions: [
        tv(1, 'PLOT HANDOVER CHECKLIST (illustrative)\n\n[ ] Boundary pillars shown\n[ ] Plot number plate fixed\n[ ] Possession letter signed', '2026-06-01', 'First version', TEHMINA, '2026-05-20T09:00:00Z', { kind: 'approved', ...who(NADIA), at: '2026-05-22T09:00:00Z', note: '' }),
        tv(2, 'PLOT HANDOVER CHECKLIST (illustrative)\n\n[ ] Boundary pillars shown\n[ ] Plot number plate fixed\n[ ] Possession letter signed\n[ ] Road access confirmed', '2026-10-15', 'Adds road access', TEHMINA, '2026-10-01T09:00:00Z', { kind: 'returned', ...who(NADIA), at: '2026-10-03T10:00:00Z', note: 'Add the CDA boundary marker step before approval' }),
      ],
    },
  );
}

function seedCrescent(s: DocumentsState): void {
  doc(s, 'doc_cbd_0001', 'Crescent Bay Towers — building approval (Demo)', 'approval', 'prj_cb_towers', 'Karachi Building Control (fictional)', (id) => [v(id, 1, ZAIN, '2026-10-16T09:00:00Z', 'CBT-building-approval.pdf', PDF, 300_100, 'Approval on file', '2026-11-20')]);
  doc(s, 'doc_cbd_0002', 'Shop fit-out drawing — CB-P-0101 (Demo)', 'drawing', 'unt_cb_p_0101', 'Crescent Bay Plaza (fictional)', (id) => [v(id, 1, ZAIN, '2026-10-17T09:00:00Z', 'CBP-0101-fit-out.pdf', PDF, 150_220, 'Tenant fit-out')]);
}

function who(w: Who) {
  return { by: w.by, byName: w.name };
}

function tv(n: number, body: string, effectiveFrom: string, note: string, drafter: Who, draftedAt: string, decision?: StoredTemplateVersion['decision']): StoredTemplateVersion {
  return { n, body, effectiveFrom, note, draftedBy: drafter.by, draftedByName: drafter.name, draftedAt, ...(decision ? { decision } : {}) };
}

function seeded(tenantId: string): DocumentsState {
  const s = empty(tenantId);
  if (tenantId === 'tnt_larkspur') seedLarkspur(s);
  if (tenantId === 'tnt_crescent') seedCrescent(s);
  return s;
}
