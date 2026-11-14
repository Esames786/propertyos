import { describe, expect, it } from 'vitest';
import type { UnitPriceHistory, UnitPricePickerResponse } from '@repo/contracts';
import { datasetFor } from '../../datasets';
import { DEMO_STORE_KEY, DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';

const L = datasetFor('tnt_larkspur')!;
const C = datasetFor('tnt_crescent')!;
const HEIGHTS = L.units.find((u) => u.projectId === 'prj_heights')!;
const GARDENS = L.units.find((u) => u.projectId === 'prj_gardens')!;
const OTHER_TENANT = C.units[0]!;
const UNKNOWN = 'unt_e3_never_issued_0001';

function world() {
  const mem = new Map<string, string>();
  const demo = new DemoStore({
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  });
  const identity = { personaId: 'manager', projectId: 'all' };
  const api = new MockTransport({ getContext: () => ({ ...identity }), getMode: () => 'fast', demo });
  return {
    api,
    as(personaId: string, projectId = 'all') {
      identity.personaId = personaId;
      identity.projectId = projectId;
      return api;
    },
    snapshot() {
      demo.save();
      return mem.get(DEMO_STORE_KEY) ?? '';
    },
  };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const e = error as Error & { problem: { correlationId?: string; status: number; code: string; changed: boolean } };
    expect(e.problem?.correlationId).toMatch(/^demo-/);
    return JSON.stringify({
      name: e.name,
      message: e.message,
      problem: { ...e.problem, correlationId: '<masked>' },
    });
  }
  throw new Error('Expected API refusal');
}

const prices = (api: MockTransport, id: string) =>
  api.request<UnitPriceHistory>({ method: 'GET', path: `/units/${id}/prices` });

const list = (api: MockTransport, query: Record<string, string> = {}) =>
  api.request<UnitPricePickerResponse>({ method: 'GET', path: '/pricing/units', query });

describe('E.3 INV-006: unit price history is only the fictional baseline', () => {
  it('returns current unit price without invented revisions, dates, approvals, money or writes', async () => {
    const w = world();
    await list(w.api);
    const before = w.snapshot();
    const result = await prices(w.api, HEIGHTS.id);
    expect(result.unit).toMatchObject({ id: HEIGHTS.id, ref: HEIGHTS.ref, projectId: HEIGHTS.projectId });
    expect(result.unit.currentListedPrice).toEqual(HEIGHTS.price);
    expect(result.baseline).toEqual({ price: HEIGHTS.price, source: 'fictional_seed', dateKnown: false });
    expect(result.revisions).toEqual([]);
    expect(result.recordState).toBe('baseline_only');
    expect(result.canEdit).toBe(false);
    expect(w.snapshot()).toBe(before);
  });

  it('a Heights-only reader sees neither Gardens units nor their counts in picker/search/filter', async () => {
    const w = world();
    const api = w.as('sales');
    const all = await list(api);
    expect(all.items.length).toBeGreaterThan(0);
    expect(all.items.every((r) => r.projectId === 'prj_heights')).toBe(true);
    expect(all.total).toBe(L.units.filter((u) => u.projectId === 'prj_heights').length);
    const byProject = await list(api, { project: 'prj_gardens' });
    expect(byProject).toEqual({ items: [], total: 0 });
    const byHiddenRef = await list(api, { q: GARDENS.ref });
    expect(byHiddenRef).toEqual({ items: [], total: 0 });
  });

  it('named out-of-scope, other-tenant and unknown unit IDs return serialized identical 404s with no mutation', async () => {
    const w = world();
    const api = w.as('sales');
    await list(api);
    const before = w.snapshot();
    const hidden = await refusal(prices(api, GARDENS.id));
    const never = await refusal(prices(api, UNKNOWN));
    const otherTenant = await refusal(prices(api, OTHER_TENANT.id));
    expect(hidden).toEqual(never);
    expect(hidden).toEqual(otherTenant);
    expect(JSON.parse(hidden).problem).toMatchObject({ status: 404, code: 'not_found', changed: false });
    expect(w.snapshot()).toBe(before);
  });

  it('project filter and identity change recheck access rather than replaying a manager response', async () => {
    const w = world();
    const manager = await prices(w.as('manager'), GARDENS.id);
    expect(manager.unit.id).toBe(GARDENS.id);
    const sales = w.as('sales', 'prj_heights');
    await list(sales);
    const before = w.snapshot();
    const noLongerVisible = await refusal(prices(sales, GARDENS.id));
    const unknown = await refusal(prices(sales, UNKNOWN));
    expect(noLongerVisible).toEqual(unknown);
    expect(w.snapshot()).toBe(before);
    const hiddenByHeader = await refusal(prices(w.as('manager', 'prj_heights'), GARDENS.id));
    expect(hiddenByHeader).toEqual(unknown);
    expect((await prices(w.as('sales', 'prj_heights'), HEIGHTS.id)).unit.id).toBe(HEIGHTS.id);
  });
});
