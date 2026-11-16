import { describe, expect, it } from 'vitest';
import type { Persona, PricingPolicyDraft, PricingPolicyDraftList, PricingPolicyRule } from '@repo/contracts';
import { DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';
import { ALL_PERSONAS, findPersona } from '../../people';

const manager = findPersona('manager')!;
const editor: Persona = {
  ...manager, id: 'res_e3_policy_editor', principalId: 'usr_e3_policy_editor',
  permissions: [...manager.permissions, 'pricing.manage'],
};
const another: Persona = {
  ...editor, id: 'res_e3_policy_other', principalId: 'usr_e3_policy_other',
};
const limited: Persona = {
  ...editor, id: 'res_e3_policy_limited', principalId: 'usr_e3_policy_limited',
  projectScope: ['prj_heights'],
};
const project = 'prj_heights';
const hiddenProject = 'prj_gardens';
const firstKey = 'pricing-policy-key-11111111';
const secondKey = 'pricing-policy-key-22222222';
const thirdKey = 'pricing-policy-key-33333333';
const rules: PricingPolicyRule[] = [{
  unitType: 'residential', baseRate: { amount: '14000.25', currency: 'PKR' },
  floorRiseBps: 125, cornerPremiumBps: 0, parkFacingPremiumBps: 75,
}];

function env() {
  const memory = new Map<string, string>();
  const demo = new DemoStore({
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  });
  const ctx = { personaId: editor.id, projectId: 'all' };
  const api = new MockTransport({
    getContext: () => ({ ...ctx }),
    getMode: () => 'fast', demo,
    personas: [...ALL_PERSONAS, editor, another, limited],
  });
  return {
    api,
    as(id: string, projectId = 'all') { ctx.personaId = id; ctx.projectId = projectId; return api; },
    snapshot() { demo.save(); return JSON.stringify([...memory.entries()].sort()); },
  };
}
const create = (api: MockTransport, key = firstKey, projectId = project, title = 'Illustrative residential policy', input: unknown = rules) =>
  api.request<PricingPolicyDraft>({
    method: 'POST', path: '/pricing/policies', idempotencyKey: key,
    body: { projectId, title, rules: input, idempotencyKey: key },
  });
const revise = (api: MockTransport, id: string, key: string, expectedVersion: number, title: string, input: unknown = rules) =>
  api.request<PricingPolicyDraft>({
    method: 'POST', path: `/pricing/policies/${id}/versions`, idempotencyKey: key,
    body: { expectedVersion, title, rules: input, idempotencyKey: key },
  });
const list = (api: MockTransport, query: Record<string, string> = {}) =>
  api.request<PricingPolicyDraftList>({ method: 'GET', path: '/pricing/policies', query });
const read = (api: MockTransport, id: string) =>
  api.request<PricingPolicyDraft>({ method: 'GET', path: `/pricing/policies/${id}` });
async function refused(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    const e = error as Error & { problem: { correlationId?: string; status: number; code: string; changed: boolean } };
    const { correlationId: _discard, ...problem } = e.problem;
    return problem;
  }
  throw new Error('Expected refusal');
}

describe('E.3 COM-003 draft pricing rules remain private and non-effective', () => {
  it('creates a typed pricing draft but does not apply or approve its rate', async () => {
    const w = env();
    const created = await create(w.api);
    expect(created).toMatchObject({
      projectId: project, creatorPrincipalId: editor.principalId,
      currentVersion: 1, state: 'draft', effective: false, approvalAllowed: false,
    });
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0]).toMatchObject({
      title: 'Illustrative residential policy', createdBy: editor.principalId,
      state: 'draft', rules: [{
        unitType: 'residential', baseRate: { amount: '14000.25', currency: 'PKR' },
      }],
    });
    const before = w.snapshot();
    expect(await read(w.api, created.id)).toEqual(created);
    expect(await list(w.api)).toMatchObject({ total: 1, items: [{ id: created.id, currentVersion: 1, state: 'draft' }] });
    expect(w.snapshot()).toBe(before);
    expect(JSON.stringify(created)).not.toMatch(/effectiveFrom|approvedAt|postedAt|unitPriceVersion|settled/);
  });

  it('replays identical authorized creates without new records, rejects changed input and respects fresh keys', async () => {
    const w = env();
    const created = await create(w.api);
    const before = w.snapshot();
    expect(await create(w.api)).toEqual(created);
    expect(w.snapshot()).toBe(before);
    expect(await refused(create(w.api, firstKey, project, 'A different draft'))).toMatchObject({ status: 409, code: 'idempotency_key_reused', changed: false });
    expect(w.snapshot()).toBe(before);
    expect((await create(w.api, secondKey)).id).not.toEqual(created.id);
    expect((await list(w.api)).total).toBe(2);
  });

  it('refuses hidden and unknown policy IDs exactly, even on direct revision routes', async () => {
    const w = env();
    const created = await create(w.api);
    const before = w.snapshot();
    w.as(another.id);
    const hidden = await refused(read(w.api, created.id));
    const unknown = await refused(read(w.api, 'prp_999999'));
    expect(hidden).toEqual(unknown);
    expect(hidden).toMatchObject({ status: 404, code: 'not_found', changed: false });
    expect(await refused(revise(w.api, created.id, secondKey, 1, 'Wrong editor'))).toEqual(hidden);
    expect(await list(w.api)).toEqual({ items: [], total: 0 });
    expect(w.snapshot()).toBe(before);
    w.as('sales');
    expect(await refused(read(w.api, created.id))).toMatchObject({ status: 403, changed: false });
    expect(w.snapshot()).toBe(before);
  });

  it('appends immutable versions, refuses stale edits, safely replays original revision snapshots', async () => {
    const w = env();
    const created = await create(w.api);
    const newer = await revise(w.api, created.id, secondKey, 1, 'Second illustrative policy');
    expect(newer.currentVersion).toBe(2);
    expect(newer.versions[0]).toEqual(created.versions[0]);
    const latest = await revise(w.api, created.id, thirdKey, 2, 'Third illustrative policy');
    expect(latest.currentVersion).toBe(3);
    const before = w.snapshot();
    expect(await revise(w.api, created.id, secondKey, 1, 'Second illustrative policy')).toEqual(newer);
    expect(w.snapshot()).toBe(before);
    expect(await refused(revise(w.api, created.id, 'pricing-policy-key-44444444', 1, 'Stale edit'))).toMatchObject({ status: 409, changed: false });
    expect(await refused(revise(w.api, created.id, secondKey, 1, 'Changed replay'))).toMatchObject({ status: 409, changed: false });
    expect((await read(w.api, created.id)).versions[0]).toEqual(created.versions[0]);
    expect(w.snapshot()).toBe(before);
  });

  it('validates whole money and rate payload before consuming a record number or request key', async () => {
    const w = env();
    const before = w.snapshot();
    const invalidRules: unknown[] = [
      null, [null], [],
      [{ ...rules[0]!, baseRate: { amount: '-1.00', currency: 'PKR' } }],
      [{ ...rules[0]!, baseRate: { amount: '1.001', currency: 'PKR' } }],
      [{ ...rules[0]!, baseRate: { amount: '1.00', currency: 'USD' } }],
      [{ ...rules[0]!, floorRiseBps: -1 }],
      [{ ...rules[0]!, cornerPremiumBps: 10001 }],
      [rules[0], rules[0]],
      [{ ...rules[0]!, extra: 'hidden' }],
    ];
    for (const input of invalidRules) {
      expect(await refused(create(w.api, firstKey, project, 'Valid name', input))).toMatchObject({ status: 422, changed: false });
      expect(w.snapshot()).toBe(before);
    }
    expect((await create(w.api)).id).toBe('prp_000001');
  });

  it('changes to project filter or user scope immediately remove both list counts and direct record access', async () => {
    const w = env();
    const first = await create(w.api);
    const second = await create(w.api, secondKey, hiddenProject, 'Gardens rate draft');
    expect((await list(w.api)).total).toBe(2);
    const before = w.snapshot();
    w.as(editor.id, project);
    expect(await list(w.api)).toMatchObject({ total: 1 });
    expect(await refused(read(w.api, second.id))).toEqual(await refused(read(w.api, 'prp_unknown')));
    expect(await refused(revise(w.api, second.id, thirdKey, 1, 'Out-of-scope revision'))).toMatchObject({ status: 404, changed: false });
    expect(w.snapshot()).toBe(before);
    expect((await read(w.api, first.id)).id).toBe(first.id);
  });

  it('existing demo personas receive no new pricing.manage permission', () => {
    expect(ALL_PERSONAS.every((p) => !p.permissions.includes('pricing.manage'))).toBe(true);
  });
});
