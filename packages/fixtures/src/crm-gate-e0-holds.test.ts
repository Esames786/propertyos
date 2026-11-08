import { describe, expect, it } from 'vitest';
import type { UnitDetail } from '@repo/contracts';
import { DemoStore } from './demo-store';
import { datasetFor } from './datasets';
import { MockTransport } from './mock-transport';

const memory = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
};
const data = datasetFor('tnt_larkspur')!;
const unit = data.units.find((u) => u.projectId === 'prj_heights' && u.status === 'available')!;
const lead = data.leads.find((l) => l.projectId === 'prj_heights')!;
function fixture() {
  const demo = new DemoStore(memory());
  let personaId = 'manager';
  const api = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo });
  return { api, demo, as: (who: string) => { personaId = who; } };
}
const path = `/units/${unit.id}`;
const hold = (api: MockTransport) => api.request<{ ok: true; until: string }>({ method: 'POST', path: `${path}/hold`, body: { leadId: lead.id } });
const release = (api: MockTransport) => api.request({ method: 'POST', path: `${path}/release`, body: {} });
async function problem(promise: Promise<unknown>) {
  try { await promise; } catch (e) {
    const { correlationId: _id, ...safe } = (e as { problem: { correlationId?: string; status: number; code: string; changed: boolean } }).problem;
    return safe;
  }
  throw new Error('Expected refusal');
}

describe('Gate E.0 F-4 — held inventory is time-bound and released only by its maker', () => {
  it('an active hold is visible, blocks another hold, and its maker can release it', async () => {
    const { api, demo } = fixture();
    await hold(api);
    const h = demo.partition('tnt_larkspur').holds()[unit.id]!;
    expect(h.principalId).toBeTruthy();
    const view = await api.request<UnitDetail>({ method: 'GET', path });
    expect(view.status).toBe('held');
    expect(await problem(hold(api))).toMatchObject({ status: 422, code: 'validation_failed', changed: false });
    await release(api);
    expect(demo.partition('tnt_larkspur').holds()[unit.id]).toBeUndefined();
    expect((await api.request<UnitDetail>({ method: 'GET', path })).status).toBe('available');
  });

  it('a different authorised principal gets the same refusal as an unknown hold, with no change', async () => {
    const f = fixture();
    await hold(f.api);
    const before = JSON.stringify(f.demo.partition('tnt_larkspur').holds());
    f.as('sales');
    const other = await problem(release(f.api));
    expect(other).toMatchObject({ status: 404, code: 'not_found', changed: false });
    expect(JSON.stringify(f.demo.partition('tnt_larkspur').holds())).toBe(before);
    const empty = fixture();
    const unknown = await problem(release(empty.api));
    expect(other).toEqual(unknown);
    f.as('manager');
    await release(f.api);
  });

  it('an expired hold is not shown, does not block a new hold, and cannot be released', async () => {
    const f = fixture();
    const partition = f.demo.partition('tnt_larkspur');
    partition.hold(unit.id, { leadId: lead.id, leadRef: 'PRIVATE-OLD', until: '2020-01-01T00:00:00.000Z', principalId: 'usr_old' });
    const before = JSON.stringify(partition.holds());
    expect((await f.api.request<UnitDetail>({ method: 'GET', path })).status).toBe('available');
    expect(JSON.stringify(partition.holds())).toBe(before);
    expect(await problem(release(f.api))).toMatchObject({ status: 404, code: 'not_found' });
    expect(JSON.stringify(partition.holds())).toBe(before);
    await hold(f.api);
    expect(partition.holds()[unit.id]?.leadRef).toBe(lead.ref);
  });

  it('legacy holds without an owner cannot be released and do not disappear during a read', async () => {
    const f = fixture();
    const partition = f.demo.partition('tnt_larkspur');
    partition.hold(unit.id, { leadId: lead.id, leadRef: lead.ref, until: '2099-01-01T00:00:00.000Z' });
    const before = JSON.stringify(partition.holds());
    expect((await f.api.request<UnitDetail>({ method: 'GET', path })).status).toBe('held');
    expect(await problem(release(f.api))).toMatchObject({ status: 404, code: 'not_found' });
    expect(JSON.stringify(partition.holds())).toBe(before);
  });
});
