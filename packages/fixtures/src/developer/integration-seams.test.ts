import type { EffectiveAccess, OpportunityDetail, OpportunityList, RecordRef, TasksResponse, UnifiedSearchResponse, UnitDetail, UnitInventoryDetail } from '@repo/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNITS } from '../inventory';
import { ALL_PERSONAS } from '../people';
import { compareProjection } from '../projection.testkit';
import { LEADS } from '../records';
import { crmSession } from './crm/crm-test-kit';
import { invSession, refusal as invRefusal } from './inventory/inv-test-kit';
import { e13Session, plus, refusal } from './workspace/e13-test-kit';

/**
 * Wave 1 integration (Issue #25): the seams between E.0, E.1, E.2, E.7 and E.13 that no single branch could
 * test. The E.13 record registry with the providers of E.1, E.2 and E.7 (scope, hidden ids, revocation, no
 * bank data, deep links to the live screens); the one roster (unique principals, removed people gone); one
 * hold ledger shared by the CRM and INV-002; the new task kinds; E.1's history projection checked with E.0's
 * projection test kit.
 */
const projectsOnly = (...ids: string[]) => (a: EffectiveAccess): EffectiveAccess => ({ ...a, scopes: [{ type: 'project', ids }] });
const allItems = (r: UnifiedSearchResponse) => r.groups.flatMap((g) => g.items);
const resolve = (s: ReturnType<typeof e13Session>, id: string) => s.get<RecordRef>('/workspace/resolve', { id });

describe('the one roster', () => {
  it('every principal is one person; the provisional people of E.1, E.2, E.7 and E.13 are gone', () => {
    // One principal is one person (Al-Noor's secretary is the same person in two apps, by design, Gate D.1);
    // within one app a principal is one persona. The branches had reused usr_lsp_0004/0005 for different people.
    const names = new Map<string, Set<string>>();
    for (const p of ALL_PERSONAS) names.set(`${p.tenantId}:${p.principalId}`, new Set([...(names.get(`${p.tenantId}:${p.principalId}`) ?? []), p.displayName]));
    expect([...names].filter(([, n]) => n.size > 1)).toEqual([]);
    const perApp = ALL_PERSONAS.map((p) => `${p.tenantId}:${p.app}:${p.principalId}`);
    expect(new Set(perApp).size).toBe(perApp.length);
    for (const gone of ['sales_manager', 'lk_project_officer', 'lk_projects_director', 'lk_accounts', 'lk_controller', 'lk_treasury', 'lsp_doc_controller']) expect(ALL_PERSONAS.some((p) => p.id === gone), gone).toBe(false);
    for (const name of ['Samina Latif', 'Hina Baig', 'Kashan Lodhi', 'Mehreen Aslam', 'Kashan Wasti', 'Tehmina Durrani']) expect(ALL_PERSONAS.some((p) => p.displayName === name), name).toBe(false);
  });

  it('F-3 meets E.1: Nadia and Bilal write to leads (lead.manage) but cannot move the pipeline (lead.assign too); refused before anything is recorded', async () => {
    const s = crmSession();
    const before = JSON.stringify(s.transport.demo.partition('tnt_larkspur'));
    for (const who of ['manager', 'sales']) {
      s.as(who);
      const lead = LEADS.find((l) => l.projectId === 'prj_heights' && l.status === 'qualified')!;
      for (const call of [() => s.post(`/leads/${lead.id}/opportunities`, {}), () => s.post('/opportunities/opp_0013/stage', { stage: 'visit', version: 1 }), () => s.get('/crm/convertible-leads')]) {
        await expect(call()).rejects.toMatchObject({ problem: { status: 403, code: 'permission_missing' } });
      }
    }
    // Not even a sign-in session was recorded for them: the transport refused before the handler (and D.1) ran.
    expect(JSON.stringify(s.transport.demo.partition('tnt_larkspur'))).toBe(before);
  });

  it('only people who may work a lead are offered as its owner (a records clerk reads leads but holds no lead.manage)', async () => {
    const s = crmSession();
    const lead = LEADS.find((l) => l.projectId === 'prj_heights')!;
    const options = await s.get<{ items: Array<{ principalId: string }> }>('/crm/assignees', { leads: lead.id });
    expect(options.items.map((o) => o.principalId)).not.toContain('usr_lsp_0009');
    const before = s.snapshot();
    await expect(s.post('/leads/assign', { leadIds: [lead.id], assigneeId: 'usr_lsp_0009', reason: 'Clerk covers it' })).rejects.toMatchObject({ problem: { status: 422 } });
    expect(s.snapshot()).toBe(before);
  });
});

describe('the E.13 registry with E.1, E.2 and E.7 providers', () => {
  it('E.1: an opportunity resolves for the sales manager, links to Opportunity 360, and is unknown to Bilal unless it is his (E-05)', async () => {
    const s = e13Session('lsp_sales_manager');
    const crm = crmSession();
    const board = await crm.get<OpportunityList>('/opportunities');
    const gardens = board.items.find((o) => o.projectId === 'prj_gardens')!;
    const r = await resolve(s, gardens.id);
    expect(r).toMatchObject({ type: 'opportunity', href: `/backoffice/crm/opportunity-360-workspace?record=${gardens.id}`, module: 'crm', project: { id: 'prj_gardens' } });
    const hidden = await refusal(resolve(s.as('sales'), gardens.id));
    const unknown = await refusal(resolve(s, 'opp_never_issued'));
    expect(hidden).toEqual(unknown);
    // Search never shows (or counts) it either.
    expect(allItems(await s.get<UnifiedSearchResponse>('/workspace/search', { q: gardens.ref, type: 'opportunity' })).map((x) => x.id)).not.toContain(gardens.id);
  });

  it('E.1: a site visit resolves to its workspace for whoever may see its lead', async () => {
    const s = e13Session('lsp_sales_manager');
    const r = await resolve(s, 'vst_001');
    expect(r).toMatchObject({ type: 'visit', href: '/backoffice/crm/visit-workspace?record=vst_001', module: 'crm' });
    expect(await refusal(resolve(s.as('finance'), 'vst_001'))).toEqual(await refusal(resolve(s, 'vst_never_issued')));
  });

  it('E.2: units open INV-002 and projects PRJ-002 (live screens); storage resolves within inventory scope and opens INV-010 filtered to it', async () => {
    const s = e13Session('lsp_project_manager');
    expect(await resolve(s, 'unt_lh_a_0101')).toMatchObject({ type: 'unit', href: '/backoffice/inv/unit-quick-view?record=unt_lh_a_0101' });
    expect(await resolve(s, 'prj_gardens')).toMatchObject({ type: 'project', href: '/backoffice/prj/project-360-workspace?record=prj_gardens' });
    const storage = await resolve(s, 'stg_lh_a03');
    expect(storage).toMatchObject({ type: 'storage', module: 'inventory', project: { id: 'prj_heights' } });
    expect(storage.href).toMatch(/^\/backoffice\/inv\/storage-inventory\?project=prj_heights&q=/);
    // A Heights-only reader: a Gardens storage record is unknown, exactly like an invented id.
    s.change('lsp_project_manager', projectsOnly('prj_heights'));
    const gardens = (await (async () => {
      const full = e13Session('lsp_project_manager');
      const hits = allItems(await full.get<UnifiedSearchResponse>('/workspace/search', { q: 'LG', type: 'storage' }));
      return hits[0]!.id;
    })());
    expect(await refusal(resolve(s, gardens))).toEqual(await refusal(resolve(s, 'stg_never_issued')));
  });

  it('E.7: journals and accounts resolve only for a whole-entity ledger reader; no bank data in any reference; a project-limited reader finds none', async () => {
    const s = e13Session('lsp_finance_controller');
    const j = await resolve(s, 'jnl_lsp_0001');
    expect(j).toMatchObject({ type: 'journal', ref: 'LSP-JV-202607-0001', href: '/backoffice/acc/journal-entries?record=jnl_lsp_0001', module: 'accounting' });
    expect(await resolve(s, 'gla_lsp_c1000')).toMatchObject({ type: 'account', ref: '1000', href: '/backoffice/acc/account-workspace?record=gla_lsp_c1000' });
    // Saad holds no bank permission: the cash account's reference carries no bank name, IBAN or last four digits.
    const saad = JSON.stringify(await resolve(s.as('lsp_ledger_clerk'), 'gla_lsp_c1000'));
    for (const secret of ['7890', 'Demo Bank', 'DEMO000', 'Collections (DEMO)']) expect(saad, secret).not.toContain(secret);
    // Project-limited: no ledger record resolves or is found (U14), answering like an invented id.
    s.as('lsp_ledger_clerk').change('lsp_ledger_clerk', projectsOnly('prj_heights'));
    expect(await refusal(resolve(s, 'jnl_lsp_0001'))).toEqual(await refusal(resolve(s, 'jnl_never_issued')));
    expect(allItems(await s.get<UnifiedSearchResponse>('/workspace/search', { q: 'LSP-JV' }))).toEqual([]);
    // Revocation is immediate.
    s.change('lsp_ledger_clerk', null);
    expect(await resolve(s, 'jnl_lsp_0001')).toMatchObject({ type: 'journal' });
  });

  it('a favourite on a ledger journal disappears once the reader loses the whole entity, with no count of it', async () => {
    const s = e13Session('lsp_ledger_clerk');
    await s.post('/workspace/favourites', { recordId: 'jnl_lsp_0001' });
    expect((await s.get<{ items: Array<{ id: string }>; total?: number }>('/workspace/favourites')).items.map((f) => f.id)).toEqual(['jnl_lsp_0001']);
    s.change('lsp_ledger_clerk', projectsOnly('prj_heights'));
    const after = await s.get<{ items: Array<{ id: string }> }>('/workspace/favourites');
    expect(after.items).toEqual([]);
    expect(JSON.stringify(after)).not.toContain('jnl_lsp_0001');
  });
});

describe('E.13 task kinds of E.7 and E.2', () => {
  it('the seeded journal waiting for approval is the finance controller’s task, never its maker’s', async () => {
    const s = e13Session('lsp_finance_controller');
    const mine = await s.get<TasksResponse>('/workspace/tasks', { kind: 'journal_approval' });
    expect(mine.items.length).toBeGreaterThan(0);
    expect(mine.items.every((i) => i.record?.type === 'journal' && i.owner?.mine === true && i.actionHref.startsWith('/backoffice/acc/journal-entries?record='))).toBe(true);
    // Saad prepared it: he has no approval permission, so the kind is not even offered to him.
    expect((await s.as('lsp_ledger_clerk').get<TasksResponse>('/workspace/tasks')).items.some((i) => i.kind === 'journal_approval')).toBe(false);
    // Even given the approval permission, his own journal is never "his to decide" (maker ≠ checker).
    s.change('lsp_ledger_clerk', plus('journal.approve'));
    const own = await s.get<TasksResponse>('/workspace/queue', { kind: 'journal_approval' });
    expect(own.items.length).toBeGreaterThan(0);
    expect(own.items.every((i) => i.owner?.mine === false)).toBe(true);
    expect((await s.get<TasksResponse>('/workspace/tasks', { kind: 'journal_approval' })).items).toEqual([]);
  });

  it('a submitted project setup is the checker’s task (Zubair), never the maker’s (Mehwish); a draft is nobody’s', async () => {
    const s = e13Session('lsp_project_manager');
    const created = await s.post<{ id: string }>('/projects', { basics: { name: 'Larkspur Meadows (Demo)', code: 'LM', city: 'Lahore', kind: 'towers' } });
    const id = `project_activation:${created.id}`;
    expect((await s.as('lsp_finance_controller').get<TasksResponse>('/workspace/tasks', { kind: 'project_activation' })).items.some((i) => i.id === id)).toBe(false);
    s.as('lsp_project_manager');
    await s.post(`/projects/${created.id}/setup/site`, { value: { siteId: 'site_lk_heights' } });
    await s.post(`/projects/${created.id}/setup/structure`, { value: { towers: [{ name: 'A', floors: 4, unitsPerFloor: 4 }] } });
    await s.post(`/projects/${created.id}/submit`);
    const zubair = await s.as('lsp_finance_controller').get<TasksResponse>('/workspace/tasks', { kind: 'project_activation' });
    expect(zubair.items.find((i) => i.id === id)).toMatchObject({ owner: { name: 'Mehwish Kazmi', mine: true }, actionHref: `/backoffice/prj/project-setup?record=${created.id}`, params: { name: 'Larkspur Meadows (Demo)' } });
    // Mehwish holds no project.approve: the kind is not offered to her.
    expect((await s.as('lsp_project_manager').get<TasksResponse>('/workspace/tasks')).kinds).not.toContain('project_activation');
  });
});

describe('one hold ledger, clock and projection for the CRM and INV-002', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T10:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('a hold placed in the CRM is the same hold in INV-002 (same expiry, same releasable flag), released there by its initiator only', async () => {
    const api = invSession();
    const unit = UNITS.find((u) => u.projectId === 'prj_heights' && u.status === 'available')!;
    const lead = LEADS.find((l) => l.projectId === 'prj_heights' && ['new', 'assigned', 'contacted', 'qualified'].includes(l.status))!;
    api.as('sales');
    await api.post(`/units/${unit.id}/hold`, { leadId: lead.id });
    const crm = (await api.get<UnitDetail>(`/units/${unit.id}`)).hold;
    const inv = (await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`)).hold;
    expect(inv).toEqual(crm);
    expect(crm).toMatchObject({ source: 'live', releasable: true, holderName: 'Bilal Ahmed' });
    // Someone else: the same view without `releasable`, in both places; their release is refused alike.
    api.as('manager');
    expect((await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`)).hold).toEqual((await api.get<UnitDetail>(`/units/${unit.id}`)).hold);
    expect((await api.get<UnitDetail>(`/units/${unit.id}`)).hold).not.toHaveProperty('releasable');
    expect((await invRefusal(api.post(`/inventory/units/${unit.id}/release`))).status).toBe(404);
    // The initiator releases it through INV-002: the CRM sees it gone at once.
    api.as('sales');
    await api.post(`/inventory/units/${unit.id}/release`);
    expect((await api.get<UnitDetail>(`/units/${unit.id}`)).hold).toBeUndefined();
  });

  it('one clock: at the expiry instant both the CRM and INV-002 stop showing the hold, and either path may place a new one', async () => {
    const api = invSession();
    const unit = UNITS.find((u) => u.projectId === 'prj_heights' && u.status === 'available')!;
    const lead = LEADS.find((l) => l.projectId === 'prj_heights' && ['new', 'assigned', 'contacted', 'qualified'].includes(l.status))!;
    api.as('sales');
    await api.post(`/inventory/units/${unit.id}/hold`, { leadId: lead.id });
    vi.setSystemTime(new Date('2026-11-10T09:59:59.999Z'));
    expect((await api.get<UnitDetail>(`/units/${unit.id}`)).status).toBe('held');
    expect((await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`)).bucket).toBe('held');
    vi.setSystemTime(new Date('2026-11-10T10:00:00.000Z'));
    expect((await api.get<UnitDetail>(`/units/${unit.id}`)).status).toBe('available');
    expect((await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`)).bucket).toBe('available');
    await api.post(`/units/${unit.id}/hold`, { leadId: lead.id });
    expect((await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`)).hold).toMatchObject({ source: 'live', releasable: true });
  });
});

describe('E.1 history projection, checked with E.0’s projection test kit', () => {
  it('Bilal’s view of a reassignment to him leaks no name, reason or other project; the manager’s view keeps them', async () => {
    const s = crmSession();
    const board = await s.get<OpportunityList>('/opportunities');
    const o = board.items.find((x) => x.projectId === 'prj_heights' && x.owner.principalId === 'usr_lsp_0001')!;
    await s.post('/leads/assign', { leadIds: [o.leadId], assigneeId: 'usr_lsp_0002', reason: 'Confidential seam reason' });
    const full = { detail: await s.get<OpportunityDetail>(`/opportunities/${o.id}`), board: await s.get<OpportunityList>('/opportunities') };
    s.as('sales');
    const narrow = { detail: await s.get<OpportunityDetail>(`/opportunities/${o.id}`), board: await s.get<OpportunityList>('/opportunities') };
    const report = compareProjection({ narrow, full, hidden: ['Confidential seam reason', 'Hamza Rashid', 'Larkspur Gardens'] });
    expect(report.leaks).toEqual([]);
    expect(report.unexercised).toEqual([]);
  });
});


