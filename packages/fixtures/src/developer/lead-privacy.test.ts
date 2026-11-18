import type { AvailabilitySnapshot, HoldLeadOption, Lead, Project360, ProjectsPortfolio, RecordRef, TasksResponse, UnifiedSearchResponse, UnitInventoryDetail, WorkQueueResponse } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { UNITS } from '../inventory';
import { PARTIES } from '../people';
import { LEADS } from '../records';
import { invSession, minus, projectsOnly, refusal, type InvSession } from './inventory/inv-test-kit';
import { e13Session, refusal as e13Refusal } from './workspace/e13-test-kit';

/**
 * F-GPT-W1-01 (Issue #25, GPT review of 0205b73; owner directive): "A salesperson must not discover another
 * salesperson's confidential lead details through related screens. Managers remain project-scoped. Preserve hold
 * availability and expiry visibility without exposing unauthorized customer details."
 *
 * One canonical record-level rule (`developer/crm/scope.ts` `crmScope` `leadVisible` / `leadOpen`, reached through
 * `leadOpenTo`): a lead is visible when its project is in the reader's CRM scope AND it is assigned to them, or they
 * hold `lead.assign` in that project. Every new developer surface uses it: the hold view (`crm-holds.ts`
 * `holdViewFor`), E.2's hold picker and hold write, Project 360's leads and counts, the portfolio's lead figures,
 * the inventory activity, and E.13's record registry (search, related records, favourites, recents, tasks,
 * activity and the documents linked to a lead).
 *
 * Larkspur (fictional): Bilal Ahmed (`sales`, Heights only, no lead.assign), Nadia Rahman (`manager`, all projects,
 * no lead.assign) and Hamza Rashid (`lsp_sales_manager`, lead.assign). Bilal and Nadia each have their own Heights
 * leads; every Gardens lead is Nadia's.
 */
const OPEN = ['new', 'assigned', 'contacted', 'qualified'];
const ownLead = (projectId: string, owner: string, skip = 0) => LEADS.filter((l) => l.projectId === projectId && l.ownerPersonaId === owner && OPEN.includes(l.status))[skip]!;
const avail = (skip: number) => UNITS.filter((u) => u.projectId === 'prj_heights' && u.status === 'available')[skip]!;
const heightsOf = (owner?: string) => LEADS.filter((l) => l.projectId === 'prj_heights' && (!owner || l.ownerPersonaId === owner));
const partyName = (lead: Lead) => PARTIES.find((p) => p.id === lead.partyId)!.displayName;
/** Everything that identifies a lead or its customer. */
const identifiers = (lead: Lead) => [lead.id, lead.ref, partyName(lead), lead.budget.amount];

const BILALS = ownLead('prj_heights', 'sales');
const NADIAS = ownLead('prj_heights', 'manager');

/** Every lead-bearing E.2 read for one person, as text. */
async function e2Reads(api: InvSession, who: string, unitIds: string[]) {
  api.as(who);
  const out: unknown[] = [await api.get('/projects/prj_heights'), await api.get('/projects/portfolio'), await api.get('/inventory/availability')];
  for (const id of unitIds) out.push(await api.get(`/inventory/units/${id}`), await api.get(`/inventory/units/${id}/hold-leads`));
  return JSON.stringify(out);
}

async function refusedUnchanged(api: InvSession, p: () => Promise<unknown>) {
  const before = api.snapshot();
  const r = await refusal(p());
  expect(api.snapshot()).toBe(before);
  return r;
}

describe('F-GPT-W1-01: E.2 surfaces (hold view, picker, hold write, Project 360, portfolio, activity)', () => {
  it('positives: the lead’s owner and a lead.assign manager in the project see the lead on every surface', async () => {
    const api = invSession();
    const held = avail(0);
    await api.as('sales').post(`/inventory/units/${held.id}/hold`, { leadId: BILALS.id });
    for (const who of ['sales', 'lsp_sales_manager']) {
      api.as(who);
      const d = await api.get<UnitInventoryDetail>(`/inventory/units/${held.id}`);
      expect(d.hold, who).toMatchObject({ source: 'live', leadRef: BILALS.ref, leadId: BILALS.id, holderName: 'Bilal Ahmed' });
      expect(d.history.find((e) => e.kind === 'unit_held')!.refs.lead, who).toBe(BILALS.ref);
      expect((await api.get<AvailabilitySnapshot>('/inventory/availability')).holds.find((h) => h.unitId === held.id)!.leadRef, who).toBe(BILALS.ref);
      const p360 = await api.get<Project360>('/projects/prj_heights');
      expect(p360.leads!.items.length, who).toBeGreaterThan(0);
      expect(p360.activity.find((e) => e.kind === 'unit_held')!.refs.lead, who).toBe(BILALS.ref);
    }
    // Bilal: his own leads only, everywhere. Hamza: every Heights lead (lead.assign in Heights).
    api.as('sales');
    expect((await api.get<HoldLeadOption[]>(`/inventory/units/${avail(1).id}/hold-leads`)).map((o) => o.id)).toContain(BILALS.id);
    const bilal360 = await api.get<Project360>('/projects/prj_heights');
    expect(bilal360.leads!.total).toBe(heightsOf('sales').length);
    expect(bilal360.leads!.items.every((l) => l.ownerName === 'Bilal Ahmed')).toBe(true);
    api.as('lsp_sales_manager');
    const picker = (await api.get<HoldLeadOption[]>(`/inventory/units/${avail(1).id}/hold-leads`)).map((o) => o.id);
    expect(picker).toEqual(expect.arrayContaining([BILALS.id, NADIAS.id]));
    const hamza360 = await api.get<Project360>('/projects/prj_heights');
    expect(hamza360.leads!.total).toBe(heightsOf().length);
    expect(Object.values(hamza360.leads!.byStatus).reduce((a, b) => a + b, 0)).toBe(heightsOf().length);
    expect((await api.get<ProjectsPortfolio>('/projects/portfolio')).items.find((p) => p.id === 'prj_heights')!.leads!.total).toBe(heightsOf().length);
    // Hamza holds a unit for Nadia's lead (lead.assign in Heights): eligible.
    await api.post(`/inventory/units/${avail(1).id}/hold`, { leadId: NADIAS.id });
    expect(api.holds()[avail(1).id]).toMatchObject({ leadId: NADIAS.id, principalId: 'usr_lsp_0004' });
  });

  it('negatives: a colleague in the same project sees that the unit is held and until when, and nothing of the lead', async () => {
    const api = invSession();
    const held = avail(2);
    await api.as('sales').post(`/inventory/units/${held.id}/hold`, { leadId: BILALS.id });
    api.as('manager');
    const d = await api.get<UnitInventoryDetail>(`/inventory/units/${held.id}`);
    // Hold view: held state and expiry stay visible; no lead id or reference.
    expect(d.bucket).toBe('held');
    expect(d.hold).toEqual({ source: 'live', until: api.holds()[held.id]!.until, holderName: 'Bilal Ahmed' });
    expect(d.history.find((e) => e.kind === 'unit_held')!.refs).not.toHaveProperty('lead');
    const row = (await api.get<AvailabilitySnapshot>('/inventory/availability')).holds.find((h) => h.unitId === held.id)!;
    expect(row).toMatchObject({ unitRef: held.ref, until: api.holds()[held.id]!.until });
    expect(row).not.toHaveProperty('leadRef');
    // Picker: Nadia's own leads only.
    const picker = await api.get<HoldLeadOption[]>(`/inventory/units/${avail(3).id}/hold-leads`);
    expect(picker.length).toBeGreaterThan(0);
    expect(picker.every((o) => LEADS.find((l) => l.id === o.id)!.ownerPersonaId === 'manager')).toBe(true);
    // Project 360: items, total and per-status counts from Nadia's leads only; the activity names no lead.
    const p360 = await api.get<Project360>('/projects/prj_heights');
    expect(p360.leads!.total).toBe(heightsOf('manager').length);
    expect(Object.values(p360.leads!.byStatus).reduce((a, b) => a + b, 0)).toBe(heightsOf('manager').length);
    expect(p360.leads!.items.every((l) => l.ownerName === 'Nadia Rahman')).toBe(true);
    expect(p360.activity.find((e) => e.kind === 'unit_held')!.refs).not.toHaveProperty('lead');
    // Portfolio: the lead figures count Nadia's leads only.
    expect((await api.get<ProjectsPortfolio>('/projects/portfolio')).items.find((p) => p.id === 'prj_heights')!.leads!.total).toBe(heightsOf('manager').length);
    // No identifier of Bilal's lead or its customer anywhere in Nadia's reads; Bilal's own reads carry them.
    const nadiaText = await e2Reads(api, 'manager', [held.id, avail(3).id]);
    for (const x of identifiers(BILALS)) expect(nadiaText, x).not.toContain(x);
    const bilalText = await e2Reads(api, 'sales', [held.id, avail(3).id]);
    for (const x of [BILALS.id, BILALS.ref]) expect(bilalText, x).toContain(x);
    // And the other way round: Bilal reads nothing of Nadia's Heights leads.
    for (const x of identifiers(NADIAS)) expect(bilalText, x).not.toContain(x);
  });

  it('direct hold write: a colleague’s lead answers exactly like a lead id never issued; nothing is written', async () => {
    const api = invSession();
    const unit = avail(4);
    await api.as('manager').get('/inventory/matrix');
    const hidden = await refusedUnchanged(api, () => api.as('manager').post(`/inventory/units/${unit.id}/hold`, { leadId: BILALS.id }));
    const invented = await refusedUnchanged(api, () => api.as('manager').post(`/inventory/units/${unit.id}/hold`, { leadId: 'led_9999' }));
    expect(hidden).toEqual(invented);
    expect(hidden).toMatchObject({ status: 422, errors: { leadId: [{ code: 'projects:problems.leadNotEligible' }] } });
    // Bilal and Nadia's lead: the same.
    const other = await refusedUnchanged(api, () => api.as('sales').post(`/inventory/units/${unit.id}/hold`, { leadId: NADIAS.id }));
    expect(other).toEqual(await refusedUnchanged(api, () => api.as('sales').post(`/inventory/units/${unit.id}/hold`, { leadId: 'led_9999' })));
    expect(api.holds()[unit.id]).toBeUndefined();
    // The owner's own request goes through.
    await api.as('sales').post(`/inventory/units/${unit.id}/hold`, { leadId: BILALS.id });
    expect(api.holds()[unit.id]).toMatchObject({ leadId: BILALS.id, principalId: 'usr_lsp_0002' });
  });

  it('a manager stays scoped to their projects: Hamza limited to Gardens reaches no Heights lead, and keeps every Gardens lead', async () => {
    const api = invSession();
    const held = avail(5);
    await api.as('sales').post(`/inventory/units/${held.id}/hold`, { leadId: BILALS.id });
    api.change('lsp_sales_manager', projectsOnly('prj_gardens')).as('lsp_sales_manager');
    expect(await refusedUnchanged(api, () => api.get('/projects/prj_heights'))).toEqual(await refusedUnchanged(api, () => api.get('/projects/prj_nope')));
    expect((await refusedUnchanged(api, () => api.get(`/inventory/units/${held.id}`))).status).toBe(404);
    const gardens = await api.get<Project360>('/projects/prj_gardens');
    expect(gardens.leads!.total).toBe(LEADS.filter((l) => l.projectId === 'prj_gardens').length);
    const text = JSON.stringify([gardens, await api.get('/projects/portfolio'), await api.get('/inventory/availability')]);
    for (const x of identifiers(BILALS)) expect(text, x).not.toContain(x);
  });

  it('reassignment: visibility follows the new owner at once (picker, hold view, Project 360)', async () => {
    const api = invSession();
    const lead = ownLead('prj_heights', 'manager', 1);
    const unit = avail(6);
    await api.as('manager').post(`/inventory/units/${unit.id}/hold`, { leadId: lead.id });
    expect((await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`)).hold).toMatchObject({ leadRef: lead.ref, releasable: true });
    const bilalBefore = (await api.as('sales').get<Project360>('/projects/prj_heights')).leads!.total;
    expect((await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`)).hold).not.toHaveProperty('leadRef');
    // Hamza (lead.assign) gives Nadia's lead to Bilal.
    await api.as('lsp_sales_manager').post('/leads/assign', { leadIds: [lead.id], assigneeId: 'usr_lsp_0002', reason: 'Bilal covers the Tower A enquiries' });
    api.as('sales');
    expect((await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`)).hold).toMatchObject({ leadRef: lead.ref, leadId: lead.id });
    expect((await api.get<HoldLeadOption[]>(`/inventory/units/${avail(7).id}/hold-leads`)).map((o) => o.id)).toContain(lead.id);
    expect((await api.get<Project360>('/projects/prj_heights')).leads!.total).toBe(bilalBefore + 1);
    api.as('manager');
    const nadia = await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`);
    // Nadia placed the hold, so she may still release it; the lead is no longer hers to see.
    expect(nadia.hold).toEqual({ source: 'live', until: api.holds()[unit.id]!.until, holderName: 'Nadia Rahman', releasable: true });
    expect((await api.get<HoldLeadOption[]>(`/inventory/units/${avail(7).id}/hold-leads`)).map((o) => o.id)).not.toContain(lead.id);
    expect(await refusedUnchanged(api, () => api.post(`/inventory/units/${avail(7).id}/hold`, { leadId: lead.id }))).toEqual(await refusedUnchanged(api, () => api.post(`/inventory/units/${avail(7).id}/hold`, { leadId: 'led_9999' })));
  });

  it('scope revocation: without lead.view the owner’s own hold keeps its state and expiry but loses the lead, and gets it back with access', async () => {
    const api = invSession();
    const unit = avail(8);
    await api.as('sales').post(`/inventory/units/${unit.id}/hold`, { leadId: BILALS.id });
    api.change('sales', minus('lead.view'));
    const d = await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`);
    expect(d.hold).toEqual({ source: 'live', until: api.holds()[unit.id]!.until, holderName: 'Bilal Ahmed', releasable: true });
    expect(await api.get<HoldLeadOption[]>(`/inventory/units/${avail(9).id}/hold-leads`)).toEqual([]);
    expect(JSON.stringify(await api.get('/projects/prj_heights'))).not.toContain(BILALS.ref);
    api.change('sales', null);
    expect((await api.get<UnitInventoryDetail>(`/inventory/units/${unit.id}`)).hold).toMatchObject({ leadRef: BILALS.ref });
  });
});

describe('F-GPT-W1-01: the E.13 registry (search, resolve, related, favourites, tasks)', () => {
  const hits = (r: UnifiedSearchResponse) => r.groups.flatMap((g) => g.items).map((i) => i.id);

  it('search and resolve: the owner and the sales manager find the lead; a colleague gets the 404 of an id never issued', async () => {
    const s = e13Session('sales');
    for (const who of ['sales', 'lsp_sales_manager']) {
      s.as(who);
      expect(hits(await s.get<UnifiedSearchResponse>('/workspace/search', { q: BILALS.ref })), who).toContain(BILALS.id);
      expect((await s.get<RecordRef>('/workspace/resolve', { id: BILALS.id })).ref, who).toBe(BILALS.ref);
    }
    s.as('manager');
    const found = await s.get<UnifiedSearchResponse>('/workspace/search', { q: BILALS.ref });
    expect(hits(found)).not.toContain(BILALS.id);
    // (The response repeats the query itself; its results name nothing of the lead.)
    for (const x of [BILALS.id, BILALS.ref, partyName(BILALS)]) expect(JSON.stringify(found.groups)).not.toContain(x);
    const unknown = await e13Refusal(s.get('/workspace/resolve', { id: 'led_9999' }));
    expect(await e13Refusal(s.get('/workspace/resolve', { id: BILALS.id }))).toEqual(unknown);
    expect(await e13Refusal(s.get('/workspace/related', { record: BILALS.id }))).toEqual(unknown);
    // Bilal and Nadia's Heights lead: the same.
    expect(await e13Refusal(s.as('sales').get('/workspace/resolve', { id: NADIAS.id }))).toEqual(unknown);
  });

  it('a colleague’s lead cannot be saved as a favourite or recent record (same answer as unknown, nothing written)', async () => {
    const s = e13Session('manager');
    await s.get('/workspace/favourites');
    const before = s.snapshot();
    const hidden = await e13Refusal(s.post('/workspace/favourites', { recordId: BILALS.id }));
    expect(hidden).toEqual(await e13Refusal(s.post('/workspace/favourites', { recordId: 'led_9999' })));
    expect(hidden).toEqual(await e13Refusal(s.post('/workspace/recents', { recordId: BILALS.id })));
    expect(s.snapshot()).toBe(before);
    // Her own lead is fine.
    await s.post('/workspace/favourites', { recordId: NADIAS.id });
  });

  it('a hold-expiry item shows the unit and its expiry to a colleague’s work queue, without the lead', async () => {
    const api = invSession();
    const unit = avail(10);
    await api.as('sales').post(`/inventory/units/${unit.id}/hold`, { leadId: BILALS.id });
    const nadia = await api.as('manager').get<WorkQueueResponse>('/workspace/queue', { kind: 'hold_expiry' });
    const task = nadia.items.find((i) => i.record?.id === unit.id)!;
    expect(task).toMatchObject({ kind: 'hold_expiry', due: api.holds()[unit.id]!.until, detail: {}, owner: null });
    for (const x of identifiers(BILALS)) expect(JSON.stringify(nadia), x).not.toContain(x);
    const bilal = await api.as('sales').get<TasksResponse>('/workspace/tasks', { kind: 'hold_expiry' });
    expect(bilal.items.find((i) => i.record?.id === unit.id)!.detail).toEqual({ lead: BILALS.ref });
  });

  it('reassignment and revocation apply to the registry at once; another organisation never resolves the lead', async () => {
    const s = e13Session('lsp_sales_manager');
    const lead = ownLead('prj_heights', 'manager', 2);
    expect((await s.as('manager').get<RecordRef>('/workspace/resolve', { id: lead.id })).id).toBe(lead.id);
    await s.as('lsp_sales_manager').post('/leads/assign', { leadIds: [lead.id], assigneeId: 'usr_lsp_0002', reason: 'Bilal covers the Tower A enquiries' });
    const unknown = await e13Refusal(s.get('/workspace/resolve', { id: 'led_9999' }));
    expect(await e13Refusal(s.as('manager').get('/workspace/resolve', { id: lead.id }))).toEqual(unknown);
    expect((await s.as('sales').get<RecordRef>('/workspace/resolve', { id: lead.id })).id).toBe(lead.id);
    s.change('sales', minus('lead.view'));
    expect(await e13Refusal(s.get('/workspace/resolve', { id: lead.id }))).toEqual(unknown);
    s.change('sales', null);
    expect(await e13Refusal(s.as('cb_manager').get('/workspace/resolve', { id: BILALS.id }))).toEqual(await e13Refusal(s.get('/workspace/resolve', { id: 'led_9999' })));
    expect(JSON.stringify(await s.get('/workspace/search', { q: BILALS.ref }))).not.toContain(BILALS.id);
  });
});
