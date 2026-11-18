import { describe, expect, it } from 'vitest';
import type { Persona, UnitPriceChangeDraft, UnitPriceChangeDraftList, UnitPriceHistory } from '@repo/contracts';
import { DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';
import { ALL_PERSONAS, findPersona } from '../../people';
import { datasetFor } from '../../datasets';

const L = datasetFor('tnt_larkspur')!;
const heights = L.units.find((u) => u.projectId === 'prj_heights')!;
const gardens = L.units.find((u) => u.projectId === 'prj_gardens')!;
const manager = findPersona('manager')!;
const author: Persona = { ...manager, id: 'res_e3_price_change_author', principalId: 'usr_e3_price_change_author', permissions: [...manager.permissions, 'pricing.manage'] };
const another: Persona = { ...author, id: 'res_e3_price_change_other', principalId: 'usr_e3_price_change_other' };
const scoped: Persona = { ...author, id: 'res_e3_price_change_scoped', principalId: 'usr_e3_price_change_scoped', projectScope: ['prj_heights'] };
const missingView: Persona = { ...author, id: 'res_e3_price_change_no_view', principalId: 'usr_e3_price_change_no_view', permissions: ['pricing.manage'] };
const K1 = 'price-change-create-000001', K2 = 'price-change-revise-000002', K3 = 'price-change-revise-000003';
const proposed = { amount: '17400000.25', currency: 'PKR' as const };
const reason = 'Illustrative price adjustment for internal draft review only';
function setup() {
  const memory = new Map<string, string>();
  const demo = new DemoStore({ getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) });
  const chosen = { personaId: author.id, projectId: 'all' };
  const api = new MockTransport({ getContext: () => ({ ...chosen }), getMode: () => 'fast', demo, personas: [...ALL_PERSONAS, author, another, scoped, missingView] });
  return {
    api, as(personaId: string, projectId = 'all') { chosen.personaId = personaId; chosen.projectId = projectId; return api; },
    snapshot() {
      // Ignore legitimate sign-in/session telemetry. Assert the rest of the tenant
      // overlay (including every pricing section and sequence/key map) is unchanged.
      demo.save();
      const raw = memory.get('demo:store:v2');
      if (!raw) return '';
      const value = JSON.parse(raw) as { partitions: Record<string, { sections: Record<string, unknown> }> };
      for (const partition of Object.values(value.partitions)) delete partition.sections.identity;
      return JSON.stringify(value);
    },
  };
}
const create = (api: MockTransport, unitId = heights.id, key = K1, price: unknown = proposed, why = reason) =>
  api.request<UnitPriceChangeDraft>({ method: 'POST', path: `/units/${unitId}/price-change-drafts`, idempotencyKey: key,
    body: { proposedPrice: price, reason: why, idempotencyKey: key } });
const revise = (api: MockTransport, id: string, key: string, expectedVersion: number, price: unknown = proposed, why = reason) =>
  api.request<UnitPriceChangeDraft>({ method: 'POST', path: `/price-change-drafts/${id}/versions`, idempotencyKey: key,
    body: { expectedVersion, proposedPrice: price, reason: why, idempotencyKey: key } });
const list = (api: MockTransport, id = heights.id) =>
  api.request<UnitPriceChangeDraftList>({ method: 'GET', path: `/units/${id}/price-change-drafts` });
const read = (api: MockTransport, id: string) =>
  api.request<UnitPriceChangeDraft>({ method: 'GET', path: `/price-change-drafts/${id}` });
const history = (api: MockTransport, id = heights.id) =>
  api.request<UnitPriceHistory>({ method: 'GET', path: `/units/${id}/prices` });
async function denied(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    const e = error as Error & { problem: { status: number; code: string; changed: boolean; correlationId?: string } };
    const { correlationId: _hidden, ...safe } = e.problem;
    return safe;
  }
  throw new Error('Expected refusal');
}
describe('INV-007 proposed unit prices are private, non-effective drafts', () => {

  it('rejects a mismatched transport/header and JSON-body request key without consuming an ID', async () => {
    const w = setup();
    await history(w.api); // Prime legitimate sign-in telemetry before measuring business state.
    const before = w.snapshot();
    const refusedWrite = w.api.request<UnitPriceChangeDraft>({
      method: 'POST',
      path: `/units/${heights.id}/price-change-drafts`,
      idempotencyKey: K1,
      body: {
        proposedPrice: proposed,
        reason,
        idempotencyKey: K2,
      },
    });
    expect(await denied(refusedWrite)).toMatchObject({ status: 422, changed: false });
    expect(w.snapshot()).toBe(before);
    const real = await create(w.api, heights.id, K1);
    expect(real.id).toBe('pcd_000001');
    expect((await list(w.api)).total).toBe(1);
  });

  it('draft creation preserves unit listing, approved history, and fictional price baseline', async () => {
    const w = setup();
    const priceBefore = await history(w.api);
    const listedBefore = heights.price;
    const d = await create(w.api);
    expect(d).toMatchObject({
      unitId: heights.id, projectId: heights.projectId, baselinePrice: heights.price, creatorPrincipalId: author.principalId,
      currentVersion: 1, state: 'draft', effective: false, approvalAllowed: false, changesListedPrice: false,
    });
    const listedAfter = await history(w.api);
    expect(listedAfter).toEqual(priceBefore);
    expect(listedAfter.revisions).toEqual([]);
    expect(heights.price).toEqual(listedBefore);
    expect((await list(w.api)).total).toBe(1);
  });
  it('same-key original replay never issues another draft, changed-key input returns 409 unchanged', async () => {
    const w = setup();
    const d = await create(w.api);
    const before = w.snapshot();
    expect(await create(w.api)).toEqual(d);
    expect(w.snapshot()).toBe(before);
    expect(await denied(create(w.api, heights.id, K1, { amount: '18200000.00', currency: 'PKR' }))).toMatchObject({ status: 409, changed: false });
    expect(w.snapshot()).toBe(before);
    const second = await create(w.api, heights.id, K2);
    expect(second.id).not.toBe(d.id);
    expect((await list(w.api)).total).toBe(2);
  });
  it('hidden/unknown units and another creator draft IDs return indistinguishable responses and no mutations', async () => {
    const w = setup();
    const d = await create(w.api);
    const before = w.snapshot();
    w.as(scoped.id);
    const hiddenUnit = await denied(create(w.api, gardens.id, K3));
    const unknownUnit = await denied(create(w.api, 'unt_missing_price_change', K3));
    expect(hiddenUnit).toEqual(unknownUnit);
    expect(hiddenUnit).toMatchObject({ status: 404, code: 'not_found', changed: false });
    expect(await denied(list(w.api, gardens.id))).toEqual(await denied(list(w.api, 'unt_missing_price_change')));
    expect(w.snapshot()).toBe(before);
    w.as(another.id);
    expect(await denied(read(w.api, d.id))).toEqual(await denied(read(w.api, 'pcd_999999')));
    expect(await list(w.api)).toEqual({ items: [], total: 0 });
    expect(w.snapshot()).toBe(before);
  });
  it('append-only versions keep snapshot, stale edits or changed replay cannot overwrite older drafts', async () => {
    const w = setup();
    const d = await create(w.api);
    const changedPrice = { amount: '18500000.05', currency: 'PKR' };
    const v2 = await revise(w.api, d.id, K2, 1, changedPrice, 'Revised proposal after fictional valuation comparison');
    expect(v2.currentVersion).toBe(2);
    expect(v2.versions[0]).toEqual(d.versions[0]);
    const v3 = await revise(w.api, d.id, K3, 2, changedPrice, 'Third internal proposal without any approvals');
    expect(v3.currentVersion).toBe(3);
    const before = w.snapshot();
    expect(await revise(w.api, d.id, K2, 1, changedPrice, 'Revised proposal after fictional valuation comparison')).toEqual(v2);
    expect(w.snapshot()).toBe(before);
    expect(await denied(revise(w.api, d.id, 'price-change-new-000004', 1))).toMatchObject({ status: 409, changed: false });
    expect(await denied(revise(w.api, d.id, K2, 1, proposed, 'Reused original key with another price'))).toMatchObject({ status: 409, changed: false });
    expect(w.snapshot()).toBe(before);
    expect((await history(w.api)).revisions).toEqual([]);
  });
  it('invalid price, unchanged baseline, malformed reason and unknown fields refuse before sequence/key consumption', async () => {
    const w = setup();
    await history(w.api);
    const before = w.snapshot();
    const bad: unknown[] = [
      null, { amount: '-1.00', currency: 'PKR' }, { amount: '1.001', currency: 'PKR' },
      { amount: '1.00', currency: 'USD' }, heights.price,
    ];
    for (const price of bad) {
      expect(await denied(create(w.api, heights.id, K1, price))).toMatchObject({ status: 422, changed: false });
      expect(w.snapshot()).toBe(before);
    }
    expect(await denied(create(w.api, heights.id, K1, proposed, 'short'))).toMatchObject({ status: 422, changed: false });
    expect(w.snapshot()).toBe(before);
    expect((await create(w.api)).id).toBe('pcd_000001');
  });
  it('revoked pricing permission or reduced project scope refuses original replay and list immediately', async () => {
    const w = setup();
    const d = await create(w.api);
    const before = w.snapshot();
    w.as('sales');
    expect(await denied(create(w.api))).toMatchObject({ status: 403, changed: false });
    expect(await denied(read(w.api, d.id))).toMatchObject({ status: 403, changed: false });
    w.as(author.id, 'prj_gardens');
    expect(await denied(create(w.api))).toMatchObject({ status: 404, changed: false });
    expect(await denied(read(w.api, d.id))).toMatchObject({ status: 404, changed: false });
    expect(w.snapshot()).toBe(before);
  });
  it('pricing.manage without unit.view cannot name, list or propose a unit price', async () => {
    const w = setup();
    w.as(missingView.id);
    expect(await denied(create(w.api))).toMatchObject({ status: 404, changed: false });
    expect(await denied(list(w.api))).toMatchObject({ status: 404, changed: false });
  });
  it('none of the standard demo staff gains pricing.manage', () => {
    expect(ALL_PERSONAS.every((p) => !p.permissions.includes('pricing.manage'))).toBe(true);
  });
});
