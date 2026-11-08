import { describe, expect, it } from 'vitest';
import type { LeadDetail } from '@repo/contracts';
import { DemoStore } from './demo-store';
import { datasetFor } from './datasets';
import { MockTransport } from './mock-transport';

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (key: string) => m.get(key) ?? null,
    setItem: (key: string, value: string) => void m.set(key, value),
    removeItem: (key: string) => void m.delete(key),
  };
};

function session(personaId: string, projectId = 'all') {
  const demo = new DemoStore(memory());
  const api = new MockTransport({ getContext: () => ({ personaId, projectId }), getMode: () => 'fast', demo });
  return { api, demo };
}

async function refusal(p: Promise<unknown>) {
  try {
    await p;
  } catch (error) {
    const problem = (error as { problem: { status: number; code: string; messageKey: string; changed: boolean; correlationId?: string } }).problem;
    const { correlationId: _correlationId, ...safe } = problem;
    return safe;
  }
  throw new Error('Expected an API refusal');
}

describe('Gate E.0 F-2: hidden CRM lead IDs are indistinguishable from never-issued IDs', () => {
  const data = datasetFor('tnt_larkspur')!;
  const visible = data.leads.find((lead) => lead.projectId === 'prj_heights')!;
  const hidden = data.leads.find((lead) => lead.projectId === 'prj_gardens')!;
  const absent = 'led_never_issued_e0_0001';

  it('reads an in-project lead normally, but cannot distinguish hidden from absent', async () => {
    const { api, demo } = session('sales');
    const good = await api.request<LeadDetail>({ method: 'GET', path: `/leads/${visible.id}` });
    expect(good.lead.id).toBe(visible.id);
    const before = JSON.stringify(demo.partition('tnt_larkspur').leads(data.leads));
    const blocked = await refusal(api.request({ method: 'GET', path: `/leads/${hidden.id}` }));
    const nonexistent = await refusal(api.request({ method: 'GET', path: `/leads/${absent}` }));
    expect(blocked).toEqual(nonexistent);
    expect(blocked).toMatchObject({ status: 404, code: 'not_found', changed: false });
    expect(JSON.stringify(demo.partition('tnt_larkspur').leads(data.leads))).toBe(before);
  });

  it('refuses all lead mutations for hidden IDs exactly like unknown IDs, without changing state', async () => {
    const { api, demo } = session('sales');
    const cases = [
      { suffix: '/activity', body: { kind: 'note', note: 'Private test' } },
      { suffix: '/status', body: { status: 'contacted' } },
      { suffix: '/follow-up', body: { done: true } },
    ] as const;
    const part = demo.partition('tnt_larkspur');
    const before = JSON.stringify(part.leads(data.leads));
    for (const { suffix, body } of cases) {
      const blocked = await refusal(api.request({ method: 'POST', path: `/leads/${hidden.id}${suffix}`, body }));
      const nonexistent = await refusal(api.request({ method: 'POST', path: `/leads/${absent}${suffix}`, body }));
      expect(blocked, suffix).toEqual(nonexistent);
      expect(blocked, suffix).toMatchObject({ status: 404, code: 'not_found', changed: false });
    }
    expect(JSON.stringify(part.leads(data.leads))).toBe(before);
    expect(part.sessionActivity(hidden.id)).toEqual([]);
  });

  it('does not reveal hidden leads when creating visits or holding a visible unit', async () => {
    const { api, demo } = session('sales');
    const visibleUnit = data.units.find((unit) => unit.projectId === 'prj_heights' && unit.status === 'available')!;
    const before = JSON.stringify(demo.partition('tnt_larkspur').visits(data.visits));
    for (const leadId of [hidden.id, absent]) {
      const visit = await refusal(api.request({ method: 'POST', path: '/visits', body: { leadId, at: '2026-11-12T10:00:00+05:00' } }));
      const hold = await refusal(api.request({ method: 'POST', path: `/units/${visibleUnit.id}/hold`, body: { leadId } }));
      expect(visit).toMatchObject({ status: 404, code: 'not_found' });
      expect(hold).toEqual(visit);
    }
    expect(JSON.stringify(demo.partition('tnt_larkspur').visits(data.visits))).toBe(before);
    expect(demo.partition('tnt_larkspur').holds()).toEqual({});
  });

  it('a manager can open both projects, while a sales person with a narrowed project header cannot', async () => {
    const manager = session('manager').api;
    await expect(manager.request<LeadDetail>({ method: 'GET', path: `/leads/${hidden.id}` }))
      .resolves.toMatchObject({ lead: { id: hidden.id } });
    const sales = session('sales', 'prj_gardens').api;
    const hiddenByFilter = await refusal(sales.request({ method: 'GET', path: `/leads/${visible.id}` }));
    const unknown = await refusal(sales.request({ method: 'GET', path: `/leads/${absent}` }));
    expect(hiddenByFilter).toEqual(unknown);
  });
});
