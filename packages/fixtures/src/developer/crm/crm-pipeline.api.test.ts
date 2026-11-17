import type { AssignmentList, AssigneeOption, LeadDetail, Opportunity, OpportunityDetail, OpportunityList, Persona, SiteVisit, VisitCalendar, VisitDetail } from '@repo/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { datasetFor } from '../../datasets';
import type { HandlerContext } from '../../handler-types';
import { PERSONAS } from '../../people';
import { LEADS } from '../../records';
import { changed, minus, refusal, sitesOnly } from '../../rentals/rent-test-kit';
import { crmSession, type CrmSession } from './crm-test-kit';
import { mayHold } from './scope';

/**
 * Gate E.1 API tests (plan §4.2–4.5 and the E.1 test list): the positive journey (assign → convert →
 * visit outcome → follow-up), unauthorized principals, cross-project and cross-tenant ids answered like
 * ids never issued, narrowed and revoked access taking effect at once, invalid input, duplicate
 * conversion under a bound key, the projection of nested history, and a byte-identical state after
 * every refusal. Business date: Monday 26 October 2026, 15:10 Pakistan time.
 */

const BILAL = 'usr_lsp_0002';
const NADIA = 'usr_lsp_0001';
const SAMINA = 'usr_lsp_0004';
const FARAH = 'usr_lsp_0003';
const CRESCENT_MANAGER = PERSONAS.find((p) => p.id === 'cb_manager')!.principalId;
const GARDENS = 'Larkspur Gardens';

const RANGE = { from: '2026-10-01', to: '2026-11-11' };
const at = (local: string) => new Date(`${local}+05:00`).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-26T15:10:00+05:00'));
});
afterEach(() => vi.useRealTimers());

const board = (s: CrmSession, query: Record<string, string> = {}) => s.get<OpportunityList>('/opportunities', { view: 'board', ...query });

/** A refusal's body without the request-specific correlation id. */
const body = async (p: Promise<unknown>) => {
  const r = await refusal(p);
  return { status: r.status, code: r.code, messageKey: r.messageKey, errors: r.errors };
};

async function unchanged(s: CrmSession, attempt: () => Promise<unknown>) {
  const before = s.snapshot();
  const r = await refusal(attempt());
  expect(s.snapshot()).toBe(before);
  return r;
}

describe('Gate E.1 pipeline: scope (E-05 default) and counts', () => {
  it('a sales manager sees both projects; each stage count equals the list that stage opens', async () => {
    const s = crmSession();
    const all = await board(s);
    expect(new Set(all.items.map((o) => o.projectId))).toEqual(new Set(['prj_heights', 'prj_gardens']));
    expect(all.scope).toBe('project');
    expect(all.canManage && all.canAssign).toBe(true);
    expect(all.items.some((o) => o.stage === 'won')).toBe(false);
    for (const st of all.stages) {
      const list = await s.get<OpportunityList>('/opportunities', { stage: st.stage, page: '1' });
      expect(list.total, st.stage).toBe(st.count);
      const everyPage = await board(s, { stage: st.stage });
      expect(everyPage.items).toHaveLength(st.count);
    }
    expect(all.stages.reduce((n, x) => n + x.count, 0)).toBe(all.total);
  });

  it('Bilal (Heights only, no lead.assign) sees only what is assigned to him in Heights: lists, totals, calendar and search', async () => {
    const s = crmSession({ persona: 'sales' });
    const mine = await board(s);
    expect(mine.scope).toBe('assigned');
    expect(mine.canManage || mine.canAssign).toBe(false);
    expect(mine.items.length).toBeGreaterThan(0);
    expect(mine.items.every((o) => o.projectId === 'prj_heights' && o.owner.principalId === BILAL)).toBe(true);
    expect(mine.projects).toEqual([{ id: 'prj_heights', name: 'Larkspur Heights' }]);
    expect(mine.owners.map((o) => o.principalId)).toEqual([BILAL]);
    // A search or project filter naming Gardens finds nothing (and says nothing about Gardens).
    const searched = await board(s, { q: 'LD-2026', project: 'prj_gardens' });
    expect(searched.total).toBe(0);
    const cal = await s.get<VisitCalendar>('/visits/calendar', RANGE);
    expect(cal.items.length).toBeGreaterThan(0);
    expect(cal.items.every((v) => v.projectId === 'prj_heights' && v.host.principalId === BILAL)).toBe(true);
    const assignments = await s.get<AssignmentList>('/crm/assignments');
    expect(assignments.canAssign).toBe(false);
    expect(assignments.items.every((l) => l.projectId === 'prj_heights' && l.owner.principalId === BILAL)).toBe(true);
    for (const json of [JSON.stringify(mine), JSON.stringify(cal), JSON.stringify(assignments)]) expect(json).not.toContain(GARDENS);
    // Totals are the sum of what he can see.
    const manager = await board(crmSession());
    expect(mine.total).toBeLessThan(manager.total);
  });

  it('Nadia (administration, no lead.assign) sees only her own records under the new screens', async () => {
    const s = crmSession({ persona: 'manager' });
    const list = await board(s);
    expect(list.items.every((o) => o.owner.principalId === NADIA)).toBe(true);
    expect(list.scope).toBe('assigned');
  });

  it('unauthorized principals are refused before anything is read', async () => {
    const s = crmSession();
    await board(s);
    s.as('finance');
    expect((await refusal(s.get('/opportunities'))).status).toBe(403);
    s.as('resident');
    expect((await refusal(s.get('/visits/calendar', RANGE))).status).toBe(403);
    s.as('sales');
    const lead = LEADS.find((l) => l.projectId === 'prj_heights' && l.status === 'qualified')!;
    expect((await unchanged(s, () => s.post('/leads/assign', { leadIds: [lead.id], assigneeId: BILAL, reason: 'Covering' }))).status).toBe(403);
    expect((await unchanged(s, () => s.post(`/leads/${lead.id}/opportunities`, {}))).status).toBe(403);
    expect((await unchanged(s, () => s.post('/opportunities/opp_0001/stage', { stage: 'visit', version: 1 }))).status).toBe(403);
    expect((await refusal(s.get('/crm/assignees', { leads: lead.id }))).status).toBe(403);
  });
});

describe('Gate E.1: no id oracle (unknown and out-of-scope ids answer alike)', () => {
  it('Bilal: a Gardens opportunity, a Heights opportunity of someone else and an invented id are one answer', async () => {
    const manager = crmSession();
    const all = await board(manager);
    const gardens = all.items.find((o) => o.projectId === 'prj_gardens')!;
    const heightsOther = all.items.find((o) => o.projectId === 'prj_heights' && o.owner.principalId !== BILAL)!;
    const s = crmSession({ persona: 'sales' });
    const unknown = await body(s.get('/opportunities/opp_9999'));
    expect(unknown.status).toBe(404);
    expect(await body(s.get(`/opportunities/${gardens.id}`))).toEqual(unknown);
    expect(await body(s.get(`/opportunities/${heightsOther.id}`))).toEqual(unknown);
    expect(await body(s.get(`/leads/${gardens.leadId}/assignments`))).toEqual(await body(s.get('/leads/led_9999/assignments')));
  });

  it('visits: a Gardens visit and an invented visit id are one answer, for reads and changes', async () => {
    const manager = crmSession();
    const cal = await manager.get<VisitCalendar>('/visits/calendar', RANGE);
    const gardens = cal.items.find((v) => v.projectId === 'prj_gardens')!;
    const s = crmSession({ persona: 'sales' });
    await s.get('/visits/calendar', RANGE);
    const unknown = await body(s.get('/visits/vst_999'));
    expect(await body(s.get(`/visits/${gardens.id}`))).toEqual(unknown);
    const before = s.snapshot();
    const reschedule = { at: at('2026-10-28T11:00:00'), reason: 'Customer asked', version: 1 };
    expect(await body(s.post(`/visits/${gardens.id}/reschedule`, reschedule))).toEqual(await body(s.post('/visits/vst_999/reschedule', reschedule)));
    expect(s.snapshot()).toBe(before);
  });

  it('another organisation’s manager never finds Larkspur records', async () => {
    const all = await board(crmSession());
    const s = crmSession({ persona: 'cb_manager' });
    const unknown = await body(s.get('/opportunities/opp_9999'));
    expect(await body(s.get(`/opportunities/${all.items[0]!.id}`))).toEqual(unknown);
  });

  it('the header project filter hides the other project in the same way', async () => {
    const s = crmSession();
    const all = await board(s);
    const gardens = all.items.find((o) => o.projectId === 'prj_gardens')!;
    s.project('prj_heights');
    expect(await body(s.get(`/opportunities/${gardens.id}`))).toEqual(await body(s.get('/opportunities/opp_9999')));
    expect((await board(s)).items.every((o) => o.projectId === 'prj_heights')).toBe(true);
  });
});

describe('Gate E.1: lead assignment (assignee must hold the lead’s project)', () => {
  const heightsLead = () => LEADS.find((l) => l.projectId === 'prj_heights' && l.ownerPersonaId === 'manager' && l.status === 'contacted')!;
  const gardensLead = () => LEADS.find((l) => l.projectId === 'prj_gardens' && l.status === 'contacted')!;

  it('assigns, patches the lead everywhere and records projected history', async () => {
    const s = crmSession();
    const lead = heightsLead();
    const options = await s.get<{ items: AssigneeOption[] }>('/crm/assignees', { leads: lead.id });
    expect(options.items.map((o) => o.principalId).sort()).toEqual([NADIA, BILAL, SAMINA].sort());
    const res = await s.post<{ assigned: number }>('/leads/assign', { leadIds: [lead.id], assigneeId: BILAL, reason: 'Bilal covers Tower B this month' });
    expect(res.assigned).toBe(1);
    const detail = await s.get<LeadDetail>(`/leads/${lead.id}`);
    expect(detail.ownerName).toBe('Bilal Ahmed');
    expect(detail.activity[0]!.messageKey).toBe('activity.assigned');
    const full = await s.get<{ items: Array<{ fromName?: string; toName?: string; reason?: string }> }>(`/leads/${lead.id}/assignments`);
    expect(full.items[0]).toMatchObject({ fromName: 'Nadia Rahman', toName: 'Bilal Ahmed', reason: 'Bilal covers Tower B this month' });
    // Bilal now sees the lead, but its history without the other person or the reason (plan §4.4).
    s.as('sales');
    const narrow = await s.get<{ items: Array<{ mine?: string; sanitised?: boolean }> }>(`/leads/${lead.id}/assignments`);
    expect(narrow.items[0]).toEqual({ id: expect.any(String), at: expect.any(String), mine: 'to_me', sanitised: true });
    expect(JSON.stringify(narrow)).not.toContain('Nadia Rahman');
    expect(JSON.stringify(narrow)).not.toContain('Tower B');
  });

  it('a colleague without the lead’s project, an invented id and another organisation’s person get one answer; nothing changes', async () => {
    const s = crmSession();
    const lead = gardensLead();
    await board(s);
    const bilal = await unchanged(s, () => s.post('/leads/assign', { leadIds: [lead.id], assigneeId: BILAL, reason: 'Try Bilal' }));
    const invented = await unchanged(s, () => s.post('/leads/assign', { leadIds: [lead.id], assigneeId: 'usr_lsp_9999', reason: 'Try Bilal' }));
    const crescent = await unchanged(s, () => s.post('/leads/assign', { leadIds: [lead.id], assigneeId: CRESCENT_MANAGER, reason: 'Try Bilal' }));
    const finance = await unchanged(s, () => s.post('/leads/assign', { leadIds: [lead.id], assigneeId: FARAH, reason: 'Try Bilal' }));
    for (const r of [invented, crescent, finance]) expect({ ...r }).toEqual({ ...bilal });
    expect(bilal).toMatchObject({ status: 422, fields: ['assigneeId'] });
    expect(JSON.stringify(bilal)).not.toContain(GARDENS);
    // The picker never offers him for a Gardens lead.
    const options = await s.get<{ items: AssigneeOption[] }>('/crm/assignees', { leads: lead.id });
    expect(options.items.map((o) => o.principalId)).not.toContain(BILAL);
  });

  it('invalid input and unknown or hidden lead ids are refused without a change', async () => {
    const s = crmSession();
    const lead = heightsLead();
    await board(s);
    expect(await unchanged(s, () => s.post('/leads/assign', { leadIds: [lead.id], assigneeId: BILAL, reason: '' }))).toMatchObject({ status: 422, fields: ['reason'] });
    expect(await unchanged(s, () => s.post('/leads/assign', { leadIds: [], assigneeId: BILAL, reason: 'Covering' }))).toMatchObject({ status: 422, fields: ['leadIds'] });
    const unknown = await unchanged(s, () => s.post('/leads/assign', { leadIds: [lead.id, 'led_9999'], assigneeId: BILAL, reason: 'Covering' }));
    expect(unknown.status).toBe(404);
    s.project('prj_gardens');
    expect({ ...(await unchanged(s, () => s.post('/leads/assign', { leadIds: [lead.id], assigneeId: NADIA, reason: 'Covering' }))) }).toEqual({ ...unknown });
    s.project('all');
    const owned = LEADS.find((l) => l.projectId === 'prj_heights' && l.ownerPersonaId === 'sales')!;
    expect(await unchanged(s, () => s.post('/leads/assign', { leadIds: [owned.id], assigneeId: BILAL, reason: 'Again' }))).toMatchObject({ status: 422, fields: ['leadIds'] });
    expect((await unchanged(s, () => s.post('/leads/assign', { leadIds: [lead.id], assigneeId: BILAL, reason: 'Practice' }, { training: true }))).status).toBe(403);
  });

  it('reassigning away from Bilal hides the lead and its opportunity from him on the next request (revocation)', async () => {
    const manager = crmSession();
    const mine = (await board(crmSession({ persona: 'sales' }))).items[0]!;
    const s = manager;
    await s.post('/leads/assign', { leadIds: [mine.leadId], assigneeId: NADIA, reason: 'Bilal on leave' });
    s.as('sales');
    expect((await refusal(s.get(`/opportunities/${mine.id}`))).status).toBe(404);
    expect((await board(s)).items.some((o) => o.id === mine.id)).toBe(false);
  });
});

describe('Gate E.1: conversion with request-bound idempotency', () => {
  const convertible = async (s: CrmSession, project = 'prj_heights') =>
    (await s.get<{ items: Array<{ id: string; projectName: string }> }>('/crm/convertible-leads')).items.find((l) => LEADS.find((x) => x.id === l.id)?.projectId === project)!;

  it('converts once; the same request replays; any other use of the key is refused; nothing doubles', async () => {
    const s = crmSession();
    const lead = await convertible(s);
    const input = { note: 'Ready to see the show flat', expectedCloseOn: '2026-12-15' };
    const first = await s.post<Opportunity>(`/leads/${lead.id}/opportunities`, input, { key: 'conv-1' });
    expect(first).toMatchObject({ stage: 'qualified', leadId: lead.id, version: 1 });
    const count = s.pipeline().opportunities.length;
    const again = await s.post<Opportunity>(`/leads/${lead.id}/opportunities`, input, { key: 'conv-1' });
    expect(again.id).toBe(first.id);
    expect(s.pipeline().opportunities.length).toBe(count);
    // Same key, other input: refused without saying what the key was used for.
    expect(await unchanged(s, () => s.post(`/leads/${lead.id}/opportunities`, { ...input, note: 'Changed' }, { key: 'conv-1' }))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    // Same key on another lead.
    const other = await convertible(s);
    expect(await unchanged(s, () => s.post(`/leads/${other.id}/opportunities`, input, { key: 'conv-1' }))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    // A new key on the same lead: already converted.
    expect(await unchanged(s, () => s.post(`/leads/${lead.id}/opportunities`, input, { key: 'conv-2' }))).toMatchObject({ status: 409, code: 'already_converted' });
    expect(s.pipeline().opportunities.filter((o) => o.leadId === lead.id)).toHaveLength(1);
  });

  it('the key is bound to the principal: another manager replaying it is refused', async () => {
    // A test-only second sales manager (same permissions and scope, another principal).
    const twin: Persona = { ...PERSONAS.find((p) => p.id === 'sales_manager')!, id: 'res_twin_manager', principalId: 'usr_lsp_test2' };
    const shared = crmSession({ personas: [twin] });
    const l2 = await convertible(shared);
    await shared.post(`/leads/${l2.id}/opportunities`, {}, { key: 'conv-q' });
    shared.as('res_twin_manager');
    await board(shared);
    expect(await unchanged(shared, () => shared.post(`/leads/${l2.id}/opportunities`, {}, { key: 'conv-q' }))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
  });

  it('a replay re-checks authority over the lead: narrowed access answers like an unknown lead', async () => {
    const s = crmSession();
    const lead = await convertible(s, 'prj_gardens');
    await s.post(`/leads/${lead.id}/opportunities`, {}, { key: 'conv-g' });
    s.access(changed(['sales_manager'], sitesOnly('site_lk_heights')));
    const hidden = await unchanged(s, () => s.post(`/leads/${lead.id}/opportunities`, {}, { key: 'conv-g' }));
    expect({ ...hidden }).toEqual({ ...(await refusal(s.post('/leads/led_9999/opportunities', {}, { key: 'conv-x' }))) });
  });

  it('refuses a lead that is not qualified, an invalid date, unknown leads and practice mode', async () => {
    const s = crmSession();
    await board(s);
    const contacted = LEADS.find((l) => l.status === 'contacted')!;
    expect(await unchanged(s, () => s.post(`/leads/${contacted.id}/opportunities`, {}, { key: 'c1' }))).toMatchObject({ status: 409, code: 'not_qualified' });
    const lead = await convertible(s);
    expect(await unchanged(s, () => s.post(`/leads/${lead.id}/opportunities`, { expectedCloseOn: '2026-10-01' }, { key: 'c2' }))).toMatchObject({ status: 422, fields: ['expectedCloseOn'] });
    expect(await unchanged(s, () => s.post(`/leads/${lead.id}/opportunities`, { expectedCloseOn: 'soon' }, { key: 'c3' }))).toMatchObject({ status: 422, fields: ['expectedCloseOn'] });
    expect(await unchanged(s, () => s.post(`/leads/${lead.id}/opportunities`, { note: 'x'.repeat(501) }, { key: 'c4' }))).toMatchObject({ status: 422, fields: ['note'] });
    expect((await unchanged(s, () => s.post(`/leads/${lead.id}/opportunities`, {}, { key: 'c5', training: true }))).status).toBe(403);
    expect((await unchanged(s, () => s.post('/leads/led_9999/opportunities', {}, { key: 'c6' }))).status).toBe(404);
  });
});

describe('Gate E.1: stages, lost and reopen', () => {
  it('moves on the current version only; won needs a booking; lost needs a reason; reopen restores the stage', async () => {
    const s = crmSession();
    const o = (await board(s, { stage: 'quotation' })).items[0]!;
    expect(await unchanged(s, () => s.post(`/opportunities/${o.id}/stage`, { stage: 'negotiation', version: o.version + 1 }))).toMatchObject({ status: 409, code: 'stale_version' });
    expect(await unchanged(s, () => s.post(`/opportunities/${o.id}/stage`, { stage: 'won', version: o.version }))).toMatchObject({ status: 409, code: 'booking_required' });
    expect(await unchanged(s, () => s.post(`/opportunities/${o.id}/stage`, { stage: 'quotation', version: o.version }))).toMatchObject({ status: 422, fields: ['stage'] });
    const moved = await s.post<Opportunity>(`/opportunities/${o.id}/stage`, { stage: 'negotiation', version: o.version });
    expect(moved).toMatchObject({ stage: 'negotiation', version: o.version + 1 });
    expect(await unchanged(s, () => s.post(`/opportunities/${o.id}/lost`, { reason: 'other', version: moved.version }))).toMatchObject({ status: 422, fields: ['note'] });
    const lost = await s.post<Opportunity>(`/opportunities/${o.id}/lost`, { reason: 'competitor', note: 'Chose a rival tower', version: moved.version });
    expect(lost).toMatchObject({ stage: 'lost', lostReason: 'competitor' });
    expect(await unchanged(s, () => s.post(`/opportunities/${o.id}/reopen`, { note: '', version: lost.version }))).toMatchObject({ status: 422, fields: ['note'] });
    const reopened = await s.post<Opportunity>(`/opportunities/${o.id}/reopen`, { note: 'Rival tower delayed', version: lost.version });
    expect(reopened.stage).toBe('negotiation');
    const detail = await s.get<OpportunityDetail>(`/opportunities/${o.id}`);
    expect(detail.timeline.slice(0, 3).map((e) => e.kind)).toEqual(['reopened', 'lost', 'stage']);
    expect(detail.allowed.move).not.toContain('negotiation');
  });
});

describe('Gate E.1: site visits (calendar, reschedule, outcome, follow-up)', () => {
  async function bilalsVisit(s: CrmSession, when: 'past' | 'future') {
    const cal = await s.get<VisitCalendar>('/visits/calendar', RANGE);
    const now = Date.parse('2026-10-26T15:10:00+05:00');
    return cal.items.find((v) => (v.status === 'scheduled' || v.status === 'confirmed') && (when === 'past' ? Date.parse(v.at) < now : Date.parse(v.at) > now))!;
  }

  it('the calendar refuses a range over 42 days or upside down; counts equal the filtered lists', async () => {
    const s = crmSession();
    expect(await refusal(s.get('/visits/calendar', { from: '2026-10-01', to: '2026-12-31' }))).toMatchObject({ status: 422, fields: ['to'] });
    expect(await refusal(s.get('/visits/calendar', { from: '2026-10-20', to: '2026-10-01' }))).toMatchObject({ status: 422, fields: ['to'] });
    const cal = await s.get<VisitCalendar>('/visits/calendar', RANGE);
    for (const status of ['scheduled', 'confirmed', 'completed', 'no_show', 'cancelled'] as const) {
      const one = await s.get<VisitCalendar>('/visits/calendar', { ...RANGE, status });
      expect(one.items, status).toHaveLength(cal.counts[status]);
    }
  });

  it('Bilal reschedules his visit; the existing visit list shows the new time; invalid times change nothing', async () => {
    const s = crmSession({ persona: 'sales' });
    const v = await bilalsVisit(s, 'future');
    const detail = await s.get<VisitDetail>(`/visits/${v.id}`);
    expect(await unchanged(s, () => s.post(`/visits/${v.id}/reschedule`, { at: at('2026-10-20T11:00:00'), reason: 'Moved', version: detail.visit.version }))).toMatchObject({ status: 422, fields: ['at'] });
    expect(await unchanged(s, () => s.post(`/visits/${v.id}/reschedule`, { at: at('2026-10-29T22:00:00'), reason: 'Moved', version: detail.visit.version }))).toMatchObject({ status: 422, fields: ['at'] });
    expect(await unchanged(s, () => s.post(`/visits/${v.id}/reschedule`, { at: at('2026-10-29T11:00:00'), reason: '', version: detail.visit.version }))).toMatchObject({ status: 422, fields: ['reason'] });
    expect(await unchanged(s, () => s.post(`/visits/${v.id}/reschedule`, { at: at('2026-10-29T11:00:00'), reason: 'Moved', version: 99 }))).toMatchObject({ status: 409, code: 'stale_version' });
    const moved = await s.post<VisitDetail>(`/visits/${v.id}/reschedule`, { at: at('2026-10-29T11:00:00'), reason: 'Customer travelling', version: detail.visit.version });
    expect(moved.visit).toMatchObject({ at: at('2026-10-29T11:00:00'), status: 'scheduled', version: detail.visit.version + 1 });
    expect(moved.history[0]).toMatchObject({ kind: 'rescheduled', reason: 'Customer travelling' });
    const list = await s.get<SiteVisit[]>('/visits');
    expect(list.find((x) => x.id === v.id)!.at).toBe(at('2026-10-29T11:00:00'));
  });

  it('records an outcome with units shown and a follow-up; another project’s unit and an invented unit get one answer', async () => {
    const s = crmSession({ persona: 'sales' });
    const v = await bilalsVisit(s, 'past');
    const detail = await s.get<VisitDetail>(`/visits/${v.id}`);
    const heights = (await s.get<Array<{ id: string; ref: string }>>('/units', { projectId: 'prj_heights' })).slice(0, 2);
    const gardensUnit = (await crmSession().get<Array<{ id: string }>>('/units', { projectId: 'prj_gardens' }))[0]!;
    const base = { outcome: 'completed', interest: 'hot', feedback: 'Liked the corner units', version: detail.visit.version };
    const other = await unchanged(s, () => s.post(`/visits/${v.id}/outcome`, { ...base, unitsShown: [gardensUnit.id] }));
    const invented = await unchanged(s, () => s.post(`/visits/${v.id}/outcome`, { ...base, unitsShown: ['unt_nope'] }));
    expect({ ...other }).toEqual({ ...invented });
    expect(JSON.stringify(other)).not.toContain(GARDENS);
    expect(await unchanged(s, () => s.post(`/visits/${v.id}/outcome`, { ...base, outcome: 'maybe' }))).toMatchObject({ status: 422, fields: ['outcome'] });
    expect(await unchanged(s, () => s.post(`/visits/${v.id}/outcome`, { ...base, followUpAt: at('2026-10-20T11:00:00') }))).toMatchObject({ status: 422, fields: ['followUpAt'] });
    const followUpAt = at('2026-10-28T12:00:00');
    const done = await s.post<VisitDetail>(`/visits/${v.id}/outcome`, { ...base, unitsShown: heights.map((u) => u.id), followUpAt });
    expect(done.visit.status).toBe('completed');
    expect(done.outcome).toMatchObject({ outcome: 'completed', interest: 'hot', feedback: 'Liked the corner units', recordedBy: 'Bilal Ahmed' });
    expect(done.unitsShown.map((u) => u.ref)).toEqual(heights.map((u) => u.ref));
    expect(done.followUpAt).toBe(followUpAt);
    const lead = await s.get<LeadDetail>(`/leads/${v.leadId}`);
    expect(lead.lead.nextFollowUp).toBe(followUpAt);
    expect(await unchanged(s, () => s.post(`/visits/${v.id}/outcome`, { ...base, version: done.visit.version }))).toMatchObject({ status: 409, code: 'visit_not_pending' });
  });

  it('a visit still to come cannot be completed; cancelling it needs a reason', async () => {
    const s = crmSession({ persona: 'sales' });
    const v = await bilalsVisit(s, 'future');
    const d = await s.get<VisitDetail>(`/visits/${v.id}`);
    expect(await unchanged(s, () => s.post(`/visits/${v.id}/outcome`, { outcome: 'completed', version: d.visit.version }))).toMatchObject({ status: 422, fields: ['outcome'] });
    expect(await unchanged(s, () => s.post(`/visits/${v.id}/outcome`, { outcome: 'cancelled', version: d.visit.version }))).toMatchObject({ status: 422, fields: ['feedback'] });
    const cancelled = await s.post<VisitDetail>(`/visits/${v.id}/outcome`, { outcome: 'cancelled', feedback: 'Customer unwell', version: d.visit.version });
    expect(cancelled.visit.status).toBe('cancelled');
  });
});

describe('Gate E.1: the positive journey and projection (narrow vs full readers)', () => {
  it('assign → convert → visit outcome → follow-up; the narrow reader’s responses hold no hidden name or reason', async () => {
    const s = crmSession();
    const lead = (await s.get<{ items: Array<{ id: string }> }>('/crm/convertible-leads')).items.find((l) => {
      const x = LEADS.find((y) => y.id === l.id)!;
      return x.projectId === 'prj_heights' && x.ownerPersonaId === 'manager';
    });
    expect(lead).toBeTruthy();
    await s.post('/leads/assign', { leadIds: [lead!.id], assigneeId: BILAL, reason: 'Private reason: Nadia overloaded' });
    const opp = await s.post<Opportunity>(`/leads/${lead!.id}/opportunities`, { note: 'Wants a 3-bed' }, { key: 'journey-1' });
    // Bilal sees it on his board and in his workspace.
    s.as('sales');
    expect((await board(s)).items.some((o) => o.id === opp.id)).toBe(true);
    const visit = await s.post<SiteVisit>('/visits', { leadId: lead!.id, at: at('2026-10-26T11:00:00') });
    const d = await s.get<VisitDetail>(`/visits/${visit.id}`);
    expect(d.opportunity?.id).toBe(opp.id);
    await s.post(`/visits/${visit.id}/outcome`, { outcome: 'completed', feedback: 'Keen', followUpAt: at('2026-10-27T12:00:00'), version: d.visit.version });
    const narrow = await s.get<OpportunityDetail>(`/opportunities/${opp.id}`);
    expect(narrow.timeline.map((e) => e.kind)).toEqual(expect.arrayContaining(['follow_up', 'visit_outcome', 'converted']));
    expect(narrow.opportunity.nextFollowUp).toBe(at('2026-10-27T12:00:00'));
    const narrowJson = JSON.stringify([narrow, await s.get(`/leads/${lead!.id}/assignments`), await board(s), await s.get('/visits/calendar', RANGE)]);
    for (const secret of ['Nadia overloaded', GARDENS]) expect(narrowJson).not.toContain(secret);
    // The full reader keeps the whole audit.
    s.as('sales_manager');
    const full = JSON.stringify(await s.get(`/leads/${lead!.id}/assignments`));
    expect(full).toContain('Nadia overloaded');
    expect(full).toContain('Nadia Rahman');
  });

  it('an opportunity reassigned to Bilal: his timeline shows "reassigned" without the names or the reason; the manager keeps them', async () => {
    const s = crmSession();
    const o = (await board(s)).items.find((x) => x.projectId === 'prj_heights' && x.owner.principalId === NADIA)!;
    await s.post('/leads/assign', { leadIds: [o.leadId], assigneeId: BILAL, reason: 'Confidential: Nadia on medical leave' });
    const full = await s.get<OpportunityDetail>(`/opportunities/${o.id}`);
    expect(full.timeline[0]).toMatchObject({ kind: 'assigned', from: 'Nadia Rahman', to: 'Bilal Ahmed', reason: 'Confidential: Nadia on medical leave', actorName: 'Samina Latif' });
    s.as('sales');
    const narrow = await s.get<OpportunityDetail>(`/opportunities/${o.id}`);
    expect(narrow.timeline[0]).toEqual({ id: expect.any(String), at: expect.any(String), kind: 'assigned', sanitised: true });
    const json = JSON.stringify(narrow);
    // The reason and the person who reassigned it appear nowhere (Nadia's own earlier stage moves stay visible).
    for (const secret of ['medical leave', 'Samina Latif']) expect(json, secret).not.toContain(secret);
    for (const e of narrow.timeline.filter((x) => x.kind === 'assigned')) expect(Object.keys(e).sort()).toEqual(['at', 'id', 'kind', 'sanitised']);
  });

  it('an assignee is a person of the caller’s own organisation: another organisation’s staff never qualify, whatever their access', () => {
    const ctx = { tenantId: 'tnt_larkspur', data: datasetFor('tnt_larkspur')!, at: '2026-10-26' } as unknown as HandlerContext;
    const crescent = PERSONAS.find((p) => p.id === 'cb_manager')!;
    // Same principal shape, scope "all" and lead.view: refused only because it is another organisation's.
    expect(mayHold(ctx, crescent, 'prj_heights')).toBe(false);
    expect(mayHold(ctx, PERSONAS.find((p) => p.id === 'sales')!, 'prj_heights')).toBe(true);
    expect(mayHold(ctx, PERSONAS.find((p) => p.id === 'sales')!, 'prj_gardens')).toBe(false);
    expect(mayHold(ctx, PERSONAS.find((p) => p.id === 'finance')!, 'prj_heights')).toBe(false);
  });

  it('revoked or narrowed access hides records on the very next request', async () => {
    const s = crmSession();
    const gardens = (await board(s)).items.find((o) => o.projectId === 'prj_gardens')!;
    expect((await s.get<OpportunityDetail>(`/opportunities/${gardens.id}`)).opportunity.id).toBe(gardens.id);
    s.access(changed(['sales_manager'], sitesOnly('site_lk_heights')));
    expect((await refusal(s.get(`/opportunities/${gardens.id}`))).status).toBe(404);
    const narrowed = await board(s);
    expect(narrowed.items.every((o) => o.projectId === 'prj_heights')).toBe(true);
    expect(JSON.stringify(narrowed)).not.toContain(GARDENS);
    s.access(changed(['sales_manager'], minus('lead.view')));
    expect((await refusal(board(s))).status).toBe(403);
    s.access(changed(['sales_manager'], minus('lead.assign')));
    expect((await board(s)).scope).toBe('assigned');
  });
});
