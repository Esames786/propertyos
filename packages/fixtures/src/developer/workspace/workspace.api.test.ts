import type { ActivityResponse, FavouriteItem, RecentItem, RecordAccess, RecordRef, RelatedResponse, SavedListResponse, TasksResponse, UnifiedSearchResponse, WorkQueueResponse } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { e13Session, GARDENS_ONLY, refusal, sitesOnly, withoutModules } from './e13-test-kit';

/**
 * Gate E.13 connected workspace (GLOBAL-002/005/006, HOME-002/004/005, related records) through the
 * fail-closed mock transport. Larkspur: Nadia Rahman (manager, all projects), Bilal Ahmed (sales,
 * Heights only), Tehmina Durrani (document controller), Haroon Qadri (records clerk, Heights).
 * Crescent Bay: Zain Abbasi. Riverbend: Sadia Rauf (rentals). Business date 26 October 2026.
 */
const favs = (s: ReturnType<typeof e13Session>, query?: Record<string, string>) => s.get<SavedListResponse<FavouriteItem>>('/workspace/favourites', query);
const recents = (s: ReturnType<typeof e13Session>) => s.get<SavedListResponse<RecentItem>>('/workspace/recents');
const allItems = (r: UnifiedSearchResponse) => r.groups.flatMap((g) => g.items);

describe('the registry answers like GET /access/record (one rule for every record kind)', () => {
  it('for leads, units, projects, invoices and parties, a record resolves exactly when the address check allows it', async () => {
    const s = e13Session();
    const sample = ['led_0004', 'led_0006', 'led_9999', 'unt_lh_a_0101', 'unt_lg_p1_002', 'prj_heights', 'prj_gardens', 'inv_0001', 'inv_0040', 'pty_0004', 'pty_0032'];
    for (const persona of ['manager', 'sales', 'finance', 'lsp_records_clerk', 'lsp_doc_controller']) {
      s.as(persona);
      for (const id of sample) {
        const access = await s.get<RecordAccess>('/access/record', { id });
        const allowed = access.record && access.decision.allowed;
        const resolved = await s.get<RecordRef>('/workspace/resolve', { id }).then(() => true, () => false);
        expect(resolved, `${persona} ${id}`).toBe(allowed);
      }
    }
  });

  it('unknown, hidden and another organisation’s ids answer the same 404', async () => {
    const s = e13Session('sales');
    const unknown = await refusal(s.get('/workspace/resolve', { id: 'led_9999' }));
    expect(unknown).toMatchObject({ status: 404, code: 'not_found' });
    expect(await refusal(s.get('/workspace/resolve', { id: 'led_0006' }))).toEqual(unknown);
    expect(await refusal(s.get('/workspace/related', { record: 'led_0006' }))).toEqual(unknown);
    expect(await refusal(s.as('cb_manager').get('/workspace/resolve', { id: 'led_0004' }))).toEqual(unknown);
  });
});

describe('GLOBAL-002 universal search', () => {
  it('Bilal (Heights) finds Heights units and never a Gardens one; nothing hidden is counted', async () => {
    const s = e13Session('sales');
    const heights = await s.get<UnifiedSearchResponse>('/workspace/search', { q: 'LH-A-01' });
    expect(allItems(heights).every((r) => r.project?.id === 'prj_heights')).toBe(true);
    expect(allItems(heights).some((r) => r.type === 'unit')).toBe(true);
    const gardens = await s.get<UnifiedSearchResponse>('/workspace/search', { q: 'LG-P1' });
    expect(gardens.groups).toEqual([]);
    expect(JSON.stringify(gardens)).not.toMatch(/LG-P1-0|prj_gardens/);
    // Bilal cannot search documents (no document.view): the kind is not even offered.
    expect(heights.types).not.toContain('document');
  });

  it('kinds are grouped, a kind pages on its own, one character searches nothing', async () => {
    const s = e13Session('manager');
    expect(await s.get<UnifiedSearchResponse>('/workspace/search', { q: 'L' })).toMatchObject({ tooShort: true, groups: [] });
    const all = await s.get<UnifiedSearchResponse>('/workspace/search', { q: 'Larkspur' });
    expect(all.groups.map((g) => g.type)).toContain('project');
    const units = await s.get<UnifiedSearchResponse>('/workspace/search', { q: 'LH-A', type: 'unit' });
    expect(units.groups).toHaveLength(1);
    expect(units.groups[0]!.items).toHaveLength(20);
    expect(units.groups[0]!.more).toBe(true);
    const page2 = await s.get<UnifiedSearchResponse>('/workspace/search', { q: 'LH-A', type: 'unit', page: '2' });
    expect(page2.groups[0]!.items[0]!.id).not.toBe(units.groups[0]!.items[0]!.id);
  });

  it('the controller finds documents and templates; the clerk never finds a Gardens one', async () => {
    const s = e13Session('lsp_doc_controller');
    const full = await s.get<UnifiedSearchResponse>('/workspace/search', { q: 'master plan' });
    expect(allItems(full).map((r) => r.id)).toContain('doc_lsp_0004');
    const narrow = await s.as('lsp_records_clerk').get<UnifiedSearchResponse>('/workspace/search', { q: 'master plan' });
    expect(allItems(narrow).map((r) => r.id)).not.toContain('doc_lsp_0004');
  });

  it('a society manager finds society records; a rentals manager finds leases', async () => {
    const s = e13Session('alnoor_manager');
    const society = await s.get<UnifiedSearchResponse>('/workspace/search', { q: 'A-1' });
    expect(allItems(society).some((r) => r.type === 'unit' && r.favouritable)).toBe(true);
    const rentals = await s.as('rb_manager').get<UnifiedSearchResponse>('/workspace/search', { q: 'RB-LS' });
    expect(allItems(rentals).some((r) => r.type === 'lease')).toBe(true);
  });
});

describe('GLOBAL-005/006 favourites and recent records (decision E-35)', () => {
  it('are kept per person: Bilal never sees Nadia’s; another organisation never sees either', async () => {
    const s = e13Session('manager');
    await s.post('/workspace/favourites', { recordId: 'led_0004' });
    await s.post('/workspace/recents', { recordId: 'unt_lh_a_0101' });
    expect((await favs(s)).items.map((f) => f.id)).toEqual(['led_0004']);
    s.as('sales');
    expect((await favs(s)).items).toEqual([]);
    expect((await recents(s)).items).toEqual([]);
    s.as('cb_manager');
    expect((await favs(s)).items).toEqual([]);
    // Nadia's list is still hers.
    expect((await favs(s.as('manager'))).items.map((f) => f.id)).toEqual(['led_0004']);
  });

  it('a hidden or unknown record cannot be saved, and nothing changes', async () => {
    const s = e13Session('sales');
    await favs(s);
    const before = s.snapshot();
    const hidden = await refusal(s.post('/workspace/favourites', { recordId: 'led_0006' }));
    expect(hidden).toEqual(await refusal(s.post('/workspace/favourites', { recordId: 'led_9999' })));
    expect(hidden).toEqual(await refusal(s.post('/workspace/recents', { recordId: 'unt_lg_p1_002' })));
    expect(hidden).toMatchObject({ status: 404 });
    expect(s.snapshot()).toBe(before);
  });

  it('revoking access hides saved records at once — no count, no stale title — and they return with access', async () => {
    const s = e13Session('manager');
    await s.post('/workspace/favourites', { recordId: 'led_0006' });
    await s.post('/workspace/favourites', { recordId: 'led_0004' });
    await s.post('/workspace/recents', { recordId: 'unt_lg_p1_002' });
    s.change('manager', sitesOnly('site_lk_heights'));
    const f = await favs(s);
    expect(f.items.map((x) => x.id)).toEqual(['led_0004']);
    expect(JSON.stringify(f)).not.toMatch(/led_0006|Hina Chaudhry|LG-P1/);
    expect((await recents(s)).items).toEqual([]);
    s.change('manager', null);
    expect((await favs(s)).items.map((x) => x.id)).toEqual(['led_0004', 'led_0006']);
  });

  it('a withdrawn add-on hides its records from the lists (rentals leases)', async () => {
    const s = e13Session('rb_manager');
    const hit = allItems(await s.get<UnifiedSearchResponse>('/workspace/search', { q: 'RB-LS' })).find((r) => r.type === 'lease')!;
    await s.post('/workspace/favourites', { recordId: hit.id });
    expect((await favs(s)).items.map((x) => x.id)).toEqual([hit.id]);
    s.change('rb_manager', withoutModules('rentals'));
    expect((await favs(s)).items).toEqual([]);
  });

  it('are bound to the sign-in session: a new session starts empty and clears the older lists on its first save', async () => {
    const s = e13Session().as('manager', 'ses_one');
    await s.post('/workspace/favourites', { recordId: 'led_0004' });
    s.as('manager', 'ses_two');
    expect((await favs(s)).items).toEqual([]);
    await s.post('/workspace/favourites', { recordId: 'prj_heights' });
    expect((await favs(s.as('manager', 'ses_one'))).items).toEqual([]);
  });

  it('recent records keep the newest first with a view count; removing and clearing are real', async () => {
    const s = e13Session('manager');
    await s.post('/workspace/recents', { recordId: 'led_0004' });
    await s.post('/workspace/recents', { recordId: 'prj_heights' });
    await s.post('/workspace/recents', { recordId: 'led_0004' });
    const r = await recents(s);
    expect(r.items.map((x) => [x.id, x.views])).toEqual([['led_0004', 2], ['prj_heights', 1]]);
    await s.del('/workspace/recents/prj_heights');
    expect((await recents(s)).items.map((x) => x.id)).toEqual(['led_0004']);
    await s.del('/workspace/recents');
    expect((await recents(s)).items).toEqual([]);
    await s.del('/workspace/favourites/led_0004');
  });

  it('the office app only: the resident app cannot use the workspace', async () => {
    const s = e13Session('resident').app('customer');
    expect(await refusal(s.get('/workspace/favourites'))).toMatchObject({ status: 404 });
  });
});

describe('HOME-002 my tasks and HOME-004 work queue', () => {
  it('Bilal’s tasks are his own follow-ups and visits; Nadia’s queue shows the team’s, with owners', async () => {
    const s = e13Session('sales');
    const mine = await s.get<TasksResponse>('/workspace/tasks');
    expect(mine.items.length).toBeGreaterThan(0);
    expect(mine.items.every((i) => i.owner?.mine)).toBe(true);
    expect(mine.items.every((i) => i.record?.project?.id === 'prj_heights')).toBe(true);
    expect(mine.kinds).toContain('follow_up');
    expect(mine.kinds).not.toContain('document_expiry');
    const team = await s.as('manager').get<WorkQueueResponse>('/workspace/queue', { kind: 'follow_up' });
    expect(team.items.some((i) => i.owner?.name === 'Bilal Ahmed' && !i.owner.mine)).toBe(true);
    expect(team.counts.overdue + team.counts.today + team.counts.soon + team.counts.later).toBe(team.items.length);
    const heights = await s.get<WorkQueueResponse>('/workspace/queue', { project: 'prj_heights' });
    expect(heights.items.every((i) => i.record?.project?.id === 'prj_heights')).toBe(true);
    const others = await s.get<WorkQueueResponse>('/workspace/queue', { owner: 'others' });
    expect(others.items.every((i) => i.owner && !i.owner.mine)).toBe(true);
  });

  it('the header project context narrows the queue', async () => {
    const s = e13Session('manager').project('prj_gardens');
    const q = await s.get<WorkQueueResponse>('/workspace/queue');
    expect(q.items.length).toBeGreaterThan(0);
    expect(q.items.every((i) => i.record?.project?.id === 'prj_gardens')).toBe(true);
  });

  it('documents: expiry work for visible documents only; template approvals never include your own draft', async () => {
    const s = e13Session('lsp_records_clerk');
    const clerk = await s.get<WorkQueueResponse>('/workspace/queue', { kind: 'document_expiry' });
    expect(clerk.items.map((i) => i.record!.id).sort()).toEqual(['doc_lsp_0001', 'doc_lsp_0003', 'doc_lsp_0009']);
    const controller = await s.as('lsp_doc_controller').get<TasksResponse>('/workspace/tasks', { kind: 'template_approval' });
    expect(controller.items.map((i) => i.record!.id)).toEqual(['dtp_lsp_003']);
    const queue = await s.get<WorkQueueResponse>('/workspace/queue', { kind: 'template_approval' });
    expect(queue.items.map((i) => [i.record!.id, i.owner!.mine])).toEqual([
      ['dtp_lsp_001', false],
      ['dtp_lsp_003', true],
    ]);
  });

  it('a returned draft is its drafter’s task', async () => {
    const s = e13Session('lsp_doc_controller');
    const t = await s.get<TasksResponse>('/workspace/tasks', { kind: 'template_returned' });
    expect(t.items.map((i) => i.record!.id)).toEqual(['dtp_lsp_004']);
    expect((await s.as('lsp_records_clerk').get<TasksResponse>('/workspace/tasks', { kind: 'template_returned' })).items).toEqual([]);
  });

  it('a society manager sees the society’s own work items', async () => {
    const s = e13Session('alnoor_manager');
    const q = await s.get<WorkQueueResponse>('/workspace/queue');
    expect(q.kinds).toContain('society_task');
    expect(q.items.some((i) => i.kind === 'society_task' || i.kind === 'society_approval')).toBe(true);
  });
});

describe('HOME-005 recent activity (scope-projected)', () => {
  it('a Heights reader’s activity names no Gardens record; the full reader sees both', async () => {
    const s = e13Session('lsp_records_clerk');
    const narrow = await s.get<ActivityResponse>('/workspace/activity', { range: '30d', limit: '400' });
    expect(narrow.items.length).toBeGreaterThan(0);
    const text = JSON.stringify(narrow);
    for (const hidden of GARDENS_ONLY) expect(text, hidden).not.toContain(hidden);
    const full = await s.as('lsp_doc_controller').get<ActivityResponse>('/workspace/activity', { range: '30d', limit: '400' });
    expect(JSON.stringify(full)).toContain('corner plot in Phase 2');
  });

  it('filters by group and by who did it; Bilal sees CRM activity only', async () => {
    const s = e13Session('sales');
    const a = await s.get<ActivityResponse>('/workspace/activity', { range: '30d' });
    expect(a.groups).toEqual(['crm']);
    const mine = await s.get<ActivityResponse>('/workspace/activity', { range: '30d', who: 'mine' });
    expect(mine.items.every((i) => i.mine && i.actorName === 'Bilal Ahmed')).toBe(true);
  });
});

describe('related records', () => {
  it('a lead shows its customer, project and documents to a reader with document.view', async () => {
    const s = e13Session('lsp_records_clerk');
    const r = await s.get<RelatedResponse>('/workspace/related', { record: 'led_0004' });
    expect(r.groups.map((g) => g.type)).toEqual(expect.arrayContaining(['party', 'project']));
    expect(r.documents!.map((d) => d.id)).toEqual(['doc_lsp_0009']);
    expect(r.canAttach).toBe(true);
    const bilal = await s.as('sales').get<RelatedResponse>('/workspace/related', { record: 'led_0004' });
    expect(bilal.documents).toBeNull();
    expect(bilal.canAttach).toBe(false);
  });
});
