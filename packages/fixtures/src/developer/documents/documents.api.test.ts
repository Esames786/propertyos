import type { DocumentCreated, DocumentDetail, DocumentsList, ExpiringDocuments, TemplateDetail, TemplatesList } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { demoFile, e13Session, GARDENS_ONLY, plus, refusal, sitesOnly } from '../workspace/e13-test-kit';

/**
 * Gate E.13 documents (DOC-002…006) through the fail-closed mock transport, with Larkspur's fictional
 * people of the reconciled Wave 1 roster: Hamza Rashid (sales manager: reads and uploads documents of every
 * Larkspur record), Zubair Ansari (finance controller: approves templates), Mehwish Kazmi (project manager:
 * drafts templates), Haroon Qadri (records clerk,
 * Larkspur Heights only), Nadia Rahman (manager, no document permission) and Bilal Ahmed (sales,
 * Heights). The demo's business date is Monday 26 October 2026.
 */
// Wave 1 integration: E.13's provisional document controller (Tehmina Durrani) is folded into the roster.
const READER = 'lsp_sales_manager';
const CHECKER = 'lsp_finance_controller';
const MAKER = 'lsp_project_manager';
const CLERK = 'lsp_records_clerk';
const HEIGHTS_DOCS = ['doc_lsp_0001', 'doc_lsp_0002', 'doc_lsp_0003', 'doc_lsp_0006', 'doc_lsp_0007', 'doc_lsp_0009', 'doc_lsp_0010', 'doc_lsp_0013'];
const GARDENS_DOCS = ['doc_lsp_0004', 'doc_lsp_0005', 'doc_lsp_0008', 'doc_lsp_0011', 'doc_lsp_0012', 'doc_lsp_0014'];

const ids = (l: { items: Array<{ id: string }> }) => l.items.map((i) => i.id).sort();

describe('documents inherit their linked record’s access', () => {
  it('the full-scope reader sees every Larkspur document; the Heights clerk sees Heights documents only', async () => {
    const s = e13Session(READER);
    const all = await s.get<DocumentsList>('/documents');
    expect(ids(all)).toEqual([...HEIGHTS_DOCS, ...GARDENS_DOCS].sort());
    const heights = await s.as(CLERK).get<DocumentsList>('/documents');
    expect(ids(heights)).toEqual([...HEIGHTS_DOCS].sort());
    // Counts are of the reader's own visible documents.
    expect(heights.counts.all).toBe(HEIGHTS_DOCS.length);
  });

  it('an unknown id and a hidden one answer exactly the same, for every document route', async () => {
    const s = e13Session(CLERK);
    for (const path of ['/documents/doc_lsp_0004', '/documents/doc_lsp_0011']) {
      expect(await refusal(s.get(path))).toEqual(await refusal(s.get('/documents/doc_nope_0001')));
    }
    const before = s.snapshot();
    const hidden = await refusal(s.post('/documents/doc_lsp_0004/versions', { ...demoFile(), note: 'Try to add a version' }, 'k-hidden'));
    const unknown = await refusal(s.post('/documents/doc_nope_0001/versions', { ...demoFile(), note: 'Try to add a version' }, 'k-unknown'));
    expect(hidden).toEqual(unknown);
    expect(hidden.status).toBe(404);
    expect(s.snapshot()).toBe(before);
  });

  it('a Heights-only reader receives no Gardens id, name, file name, version, note or count from any endpoint', async () => {
    const s = e13Session(CLERK);
    const narrow: string[] = [];
    const full: string[] = [];
    const read = async (persona: string, out: string[]) => {
      s.as(persona);
      const list = await s.get<DocumentsList>('/documents');
      out.push(JSON.stringify(list));
      for (const w of ['expired', '30', '60', '90']) out.push(JSON.stringify(await s.get<ExpiringDocuments>('/documents/expiring', { window: w })));
      for (const d of list.items) out.push(JSON.stringify(await s.get<DocumentDetail>(`/documents/${d.id}`)));
      const templates = await s.get<TemplatesList>('/document-templates');
      out.push(JSON.stringify(templates));
      for (const t of templates.items) out.push(JSON.stringify(await s.get<TemplateDetail>(`/document-templates/${t.id}`)));
      for (const q of ['LG', 'Gardens', 'plan', 'CNIC', 'cda', 'Plot']) out.push(JSON.stringify(await s.get('/workspace/search', { q })));
      out.push(JSON.stringify(await s.get('/workspace/tasks')), JSON.stringify(await s.get('/workspace/queue')), JSON.stringify(await s.get('/workspace/activity', { range: '30d', limit: '400' })));
      for (const id of ['led_0004', 'led_0007', 'prj_heights', 'unt_lh_a_0101', 'pty_0012']) out.push(JSON.stringify(await s.get('/workspace/related', { record: id })));
      out.push(JSON.stringify(await s.get('/documents/targets', { q: 'LG' })));
    };
    await read(CLERK, narrow);
    await read(READER, full);
    const narrowText = narrow.join('\n');
    for (const hidden of GARDENS_ONLY) expect(narrowText, hidden).not.toContain(hidden);
    // The full reader still sees the legitimate history (positive control for the projection).
    const fullText = full.join('\n');
    for (const shown of ['Revised plot sizes', 'Block C road widened', 'CDA boundary marker', 'DOC-LSP-0014']) expect(fullText).toContain(shown);
  });

  it('documents follow the linked record’s licence: a Plaza shop drawing is nobody’s (inventory is not licensed there)', async () => {
    const s = e13Session('cb_manager').change('cb_manager', plus('document.view'));
    expect(ids(await s.get<DocumentsList>('/documents'))).toEqual(['doc_cbd_0001']);
    expect(await refusal(s.get('/documents/doc_cbd_0002'))).toEqual(await refusal(s.get('/documents/doc_cbd_9999')));
    // Another organisation's document is simply not found.
    expect(await refusal(s.get('/documents/doc_lsp_0001'))).toEqual(await refusal(s.get('/documents/doc_cbd_9999')));
  });

  it('without document.view nothing is served (Nadia, Bilal), and the customer app is refused', async () => {
    const s = e13Session('manager');
    expect(await refusal(s.get('/documents'))).toMatchObject({ status: 403, code: 'permission_missing' });
    expect(await refusal(s.as('sales').get('/documents/doc_lsp_0001'))).toMatchObject({ status: 403, code: 'permission_missing' });
    expect(await refusal(s.as('resident').get('/documents'))).toMatchObject({ status: 403 });
  });

  it('revoking scope hides documents at once: no stale list, detail or expiry entry', async () => {
    const s = e13Session(READER);
    expect((await s.get<DocumentsList>('/documents')).items.some((d) => d.id === 'doc_lsp_0004')).toBe(true);
    s.change(READER, sitesOnly('site_lk_heights'));
    expect(ids(await s.get<DocumentsList>('/documents'))).toEqual([...HEIGHTS_DOCS].sort());
    expect(await refusal(s.get('/documents/doc_lsp_0004'))).toMatchObject({ status: 404, code: 'not_found' });
    const expired = await s.get<ExpiringDocuments>('/documents/expiring', { window: 'expired' });
    expect(expired.items.map((d) => d.id)).toEqual(['doc_lsp_0003']);
    s.change(READER, null);
    expect((await s.get<DocumentsList>('/documents')).items.some((d) => d.id === 'doc_lsp_0004')).toBe(true);
  });
});

describe('expiry', () => {
  it('expired and expiring windows are worked out from the business date', async () => {
    const s = e13Session(READER);
    const expired = await s.get<ExpiringDocuments>('/documents/expiring', { window: 'expired' });
    expect(expired.items.map((d) => [d.id, d.daysLeft])).toEqual([
      ['doc_lsp_0014', -26],
      ['doc_lsp_0003', -6],
    ]);
    const soon = await s.get<ExpiringDocuments>('/documents/expiring', { window: '30' });
    expect(soon.items.map((d) => [d.id, d.daysLeft, d.expiry])).toEqual([
      ['doc_lsp_0011', 4, 'expiring'],
      ['doc_lsp_0009', 10, 'expiring'],
      ['doc_lsp_0001', 20, 'expiring'],
      ['doc_lsp_0008', 35, 'valid'],
    ].filter(([, d]) => (d as number) <= 30));
    expect(soon.counts).toEqual({ expired: 2, '30': 3, '60': 5, '90': 5 });
    // "Expiring" means within 30 days: 35 days is still valid (the list and every badge agree).
    const all = await s.get<DocumentsList>('/documents');
    expect(all.counts.expiry).toEqual({ none: 6, valid: 3, expiring: 3, expired: 2 });
    expect(all.items.find((d) => d.id === 'doc_lsp_0008')).toMatchObject({ daysLeft: 35, expiry: 'valid' });
  });
});

describe('uploads and versions (demo files, bound idempotency)', () => {
  const upload = (recordId: string, extra: Record<string, unknown> = {}) => ({ recordId, title: 'Visit note — Amna Abbasi', kind: 'correspondence', ...demoFile(), note: 'Taken at the sales office', ...extra });

  it('the clerk uploads to a Heights unit; the same request replays, a reused key is refused', async () => {
    // Wave 1 integration: the clerk may not write to leads (F-3, next test), so his upload goes to a Heights unit.
    const s = e13Session(CLERK);
    const first = await s.post<DocumentCreated>('/documents', upload('unt_lh_a_0101'), 'up-1');
    expect(first).toMatchObject({ version: 1, replayed: false });
    expect(first.ref).toBe('DOC-LSP-0015');
    const detail = await s.get<DocumentDetail>(`/documents/${first.id}`);
    expect(detail.preview).toEqual({ kind: 'text', text: 'Fictional demo document' });
    expect(detail.record).toMatchObject({ type: 'unit', id: 'unt_lh_a_0101' });
    const again = await s.post<DocumentCreated>('/documents', upload('unt_lh_a_0101'), 'up-1');
    expect(again).toEqual({ ...first, replayed: true });
    expect(s.docs().docs).toHaveLength(15);
    const before = s.snapshot();
    expect(await refusal(s.post('/documents', upload('unt_lh_a_0101', { title: 'Another title' }), 'up-1'))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    expect(await refusal(s.post('/documents', upload('unt_lh_a_0102'), 'up-1'))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    expect(s.snapshot()).toBe(before);
    // Another person can never replay the clerk's key (their own sign-in is recorded first).
    await s.as(READER).get('/documents');
    const other = s.snapshot();
    expect(await refusal(s.post('/documents', upload('unt_lh_a_0101'), 'up-1'))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    expect(s.snapshot()).toBe(other);
  });

  it('F-3 (Wave 1 integration): a lead’s documents are written only by people who may work the lead', async () => {
    const s = e13Session(CLERK);
    await s.get('/documents');
    const before = s.snapshot();
    // The clerk sees the Heights lead (lead.view) but may not write to it (no lead.manage): refused, nothing stored.
    expect(await refusal(s.post('/documents', upload('led_0004'), 'f3-1'))).toMatchObject({ status: 403, code: 'forbidden' });
    expect(await refusal(s.post('/documents/doc_lsp_0009/versions', { ...demoFile(), note: 'Renewed CNIC', expiresOn: '2031-01-01' }, 'f3-2'))).toMatchObject({ status: 403, code: 'forbidden' });
    expect(s.snapshot()).toBe(before);
    // The sales manager holds lead.manage: the same upload is accepted.
    const ok = await s.as(READER).post<DocumentCreated>('/documents', upload('led_0004'), 'f3-3');
    expect(ok).toMatchObject({ version: 1, replayed: false });
  });

  it('a Gardens lead is unknown to the clerk (same answer as an id never issued), and nothing changes', async () => {
    const s = e13Session(CLERK);
    await s.get('/documents');
    const before = s.snapshot();
    const hidden = await refusal(s.post('/documents', upload('led_0006'), 'k1'));
    const unknown = await refusal(s.post('/documents', upload('led_9999'), 'k2'));
    expect(hidden).toEqual(unknown);
    expect(hidden).toMatchObject({ status: 404, code: 'not_found' });
    expect(s.snapshot()).toBe(before);
  });

  it('every field is validated before anything is stored; a message never names another record', async () => {
    const s = e13Session(CLERK);
    await s.get('/documents');
    const before = s.snapshot();
    const cases: Array<[Record<string, unknown>, string, string]> = [
      [{ title: 'ab' }, 'title', 'documents:problems.title'],
      [{ kind: 'secret' }, 'kind', 'documents:problems.kind'],
      [{ ...demoFile('x', 'application/zip', 'a.zip') }, 'file', 'documents:problems.fileType'],
      [{ sizeBytes: 99 }, 'file', 'documents:problems.fileUnreadable'],
      [{ sizeBytes: 2_000_000 }, 'file', 'documents:problems.fileSize'],
      [{ fileName: '../etc/passwd' }, 'file', 'documents:problems.fileName'],
      [{ kind: 'identity' }, 'expiresOn', 'documents:problems.expiryRequired'],
      [{ kind: 'identity', expiresOn: '2026-02-31' }, 'expiresOn', 'documents:problems.expiryInvalid'],
      [{ recordId: 'inv_0001' }, 'recordId', 'documents:problems.recordKind'],
    ];
    for (const [patch, field, code] of cases) {
      const r = await refusal(s.post('/documents', upload('unt_lh_a_0101', patch), `v-${field}-${code}`));
      if (patch.recordId === 'inv_0001') {
        // An invoice the clerk cannot see is unknown (404) before any field is looked at.
        expect(r).toMatchObject({ status: 404 });
        continue;
      }
      expect(r, code).toMatchObject({ status: 422, code: 'validation_failed', fields: [field] });
      expect(r.errors[field]![0]!.code).toBe(code);
    }
    expect(s.snapshot()).toBe(before);
  });

  it('a new version is appended (never overwritten); older versions stay previewable', async () => {
    const s = e13Session(READER);
    const added = await s.post<DocumentCreated>('/documents/doc_lsp_0004/versions', { ...demoFile('Revision 4 (demo)'), note: 'Phase 3 added' }, 'ver-1');
    expect(added).toMatchObject({ id: 'doc_lsp_0004', version: 4, replayed: false });
    const d = await s.get<DocumentDetail>('/documents/doc_lsp_0004');
    expect(d.versions.map((v) => [v.n, v.current])).toEqual([[4, true], [3, false], [2, false], [1, false]]);
    expect(d.history[0]).toMatchObject({ action: 'version_added', version: 4, byName: 'Hamza Rashid' });
    const v1 = await s.get<DocumentDetail>('/documents/doc_lsp_0004', { version: '1' });
    expect(v1.previewVersion).toBe(1);
    expect(v1.preview.kind).toBe('page');
    // Replay and reuse.
    expect(await s.post<DocumentCreated>('/documents/doc_lsp_0004/versions', { ...demoFile('Revision 4 (demo)'), note: 'Phase 3 added' }, 'ver-1')).toMatchObject({ version: 4, replayed: true });
    expect(await refusal(s.post('/documents/doc_lsp_0001/versions', { ...demoFile('Revision 4 (demo)'), note: 'Phase 3 added' }, 'ver-1'))).toMatchObject({ code: 'idempotency_key_reused' });
    // A version needs a note saying what changed; identity documents need an expiry date.
    expect(await refusal(s.post('/documents/doc_lsp_0004/versions', { ...demoFile(), note: '' }, 'ver-2'))).toMatchObject({ fields: ['note'] });
    expect(await refusal(s.post('/documents/doc_lsp_0009/versions', { ...demoFile(), note: 'Renewed CNIC' }, 'ver-3'))).toMatchObject({ fields: ['expiresOn'] });
  });

  it('people without document.upload are refused before anything is read', async () => {
    const s = e13Session('manager');
    expect(await refusal(s.post('/documents', upload('led_0004'), 'm1'))).toMatchObject({ status: 403, code: 'permission_missing' });
    expect(await refusal(s.as('sales').post('/documents/doc_lsp_0001/versions', { ...demoFile(), note: 'x' }, 'm2'))).toMatchObject({ status: 403, code: 'permission_missing' });
  });

  it('the demo store keeps uploads under its budget', async () => {
    const s = e13Session(READER);
    const big = 'x'.repeat(1_000_000);
    for (let i = 0; i < 4; i++) await s.post('/documents', upload('prj_heights', { ...demoFile(`${big}${i}`), title: `Large demo file ${i}` }), `big-${i}`);
    const before = s.snapshot();
    expect(await refusal(s.post('/documents', upload('prj_heights', { ...demoFile(`${big}9`), title: 'One too many' }), 'big-9'))).toMatchObject({ fields: ['file'], errors: { file: [{ code: 'documents:problems.storeFull' }] } });
    expect(s.snapshot()).toBe(before);
  });
});

describe('templates and policies: draft, then approved by another person', () => {
  it('the clerk sees organisation-wide and Heights templates only; the Gardens checklist is unknown to them', async () => {
    const s = e13Session(CLERK);
    const list = await s.get<TemplatesList>('/document-templates');
    expect(ids(list)).toEqual(['dtp_lsp_001', 'dtp_lsp_002', 'dtp_lsp_003']);
    expect(await refusal(s.get('/document-templates/dtp_lsp_004'))).toEqual(await refusal(s.get('/document-templates/dtp_lsp_999')));
  });

  it('the finance controller approves the clerk’s draft; nobody approves their own; the clerk cannot approve at all', async () => {
    const s = e13Session(CHECKER);
    const before = await s.get<TemplatesList>('/document-templates');
    // Two drafts await him: Mehwish's allotment letter v2 and Haroon's safety policy v2 (he drafted neither).
    expect(before.awaitingYou).toBe(2);
    // Mehwish drafted the allotment letter's v2: even holding the approval permission, she cannot approve her own.
    s.change(MAKER, plus('document_template.approve'));
    expect((await s.as(MAKER).get<TemplatesList>('/document-templates')).awaitingYou).toBe(1);
    const snap = s.snapshot();
    expect(await refusal(s.post('/document-templates/dtp_lsp_001/versions/2/decision', { decision: 'approve', note: '' }))).toMatchObject({ status: 403, code: 'separation_of_duties' });
    expect(await refusal(s.as(CLERK).post('/document-templates/dtp_lsp_003/versions/2/decision', { decision: 'approve', note: '' }))).toMatchObject({ status: 403, code: 'permission_missing' });
    expect(s.snapshot()).toBe(snap);
    const approved = await s.as(CHECKER).post<TemplateDetail>('/document-templates/dtp_lsp_003/versions/2/decision', { decision: 'approve', note: 'Approved for November' });
    expect(approved.versions[0]).toMatchObject({ n: 2, state: 'scheduled', decidedByName: 'Zubair Ansari' });
    expect(approved.versions[1]).toMatchObject({ n: 1, state: 'effective' });
    expect(await refusal(s.post('/document-templates/dtp_lsp_003/versions/2/decision', { decision: 'approve', note: '' }))).toMatchObject({ status: 409, code: 'not_pending' });
  });

  it('one draft at a time; the clerk drafts only for Heights; returning needs a reason', async () => {
    const s = e13Session(CLERK);
    const draft = { body: 'SITE VISIT SAFETY (illustrative)\n\nVisitors sign in at the gate.', effectiveFrom: '2026-12-01', note: 'Adds sign-in' };
    expect(await refusal(s.post('/document-templates/dtp_lsp_003/versions', draft, 'd1'))).toMatchObject({ status: 409, code: 'version_pending' });
    expect(await refusal(s.post('/document-templates/dtp_lsp_002/versions', draft, 'd2'))).toMatchObject({ status: 403, code: 'forbidden' });
    expect(await refusal(s.as(CHECKER).post('/document-templates/dtp_lsp_003/versions/2/decision', { decision: 'return', note: '' }))).toMatchObject({ fields: ['note'] });
    await s.post('/document-templates/dtp_lsp_003/versions/2/decision', { decision: 'return', note: 'Name the Tower C supervisor' });
    const v3 = await s.as(CLERK).post<TemplateDetail>('/document-templates/dtp_lsp_003/versions', draft, 'd3');
    expect(v3.versions[0]).toMatchObject({ n: 3, state: 'pending', mine: true, canDecide: false });
    expect(v3.versions[1]).toMatchObject({ n: 2, state: 'returned', decisionNote: 'Name the Tower C supervisor' });
    expect(await refusal(s.post('/document-templates/dtp_lsp_003/versions', { ...draft, effectiveFrom: '2026-01-01' }, 'd4'))).toMatchObject({ status: 409 });
  });

  it('a new template is created pending; a Gardens project is unknown to the clerk', async () => {
    const s = e13Session(CLERK);
    const input = { name: 'Heights parking rules', category: 'policy', projectId: 'prj_heights', body: 'PARKING (illustrative)\n\nOne space per flat.', effectiveFrom: '2026-11-15', note: 'First version' };
    const created = await s.post<{ id: string; ref: string; replayed: boolean }>('/document-templates', input, 'tc-1');
    expect(created).toMatchObject({ ref: 'TPL-LSP-005', replayed: false });
    expect(await s.post('/document-templates', input, 'tc-1')).toMatchObject({ id: created.id, replayed: true });
    const before = s.snapshot();
    expect(await refusal(s.post('/document-templates', { ...input, projectId: 'prj_gardens' }, 'tc-2'))).toEqual(await refusal(s.post('/document-templates', { ...input, projectId: 'prj_nowhere' }, 'tc-3')));
    expect(await refusal(s.post('/document-templates', { ...input, projectId: null }, 'tc-4'))).toMatchObject({ status: 403 });
    expect(s.snapshot()).toBe(before);
  });
});
