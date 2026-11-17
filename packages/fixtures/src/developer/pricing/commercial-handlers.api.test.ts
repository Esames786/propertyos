import { describe, expect, it } from 'vitest';
import type { CommercialDiscountRule, CommercialFeeRule, CommercialRulesDraft, CommercialRulesDraftList, CommercialRulesPreview, Persona } from '@repo/contracts';
import { DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';
import { ALL_PERSONAS, findPersona } from '../../people';
import { datasetFor } from '../../datasets';
import { fromPaisa, InvalidCommercialRule, previewCommercial, toPaisa, validateCommercialRules } from './commercial-calculator';

const money = (amount: string) => ({ amount, currency: 'PKR' as const });
const FIXED: CommercialFeeRule = { code: 'FILE_FEE', label: 'Illustrative fee', mode: 'fixed', amount: money('1.00') };
const PERCENT: CommercialFeeRule = { code: 'ADMIN_RATE', label: 'Illustrative rate', mode: 'rate_bps', rateBps: 100 };
const ZERO: CommercialFeeRule = { code: 'ZERO_FEE', label: 'Zero value fee', mode: 'fixed', amount: money('0.00') };
const DISCOUNT: CommercialDiscountRule = { code: 'EARLY_DISC', label: 'Illustrative discount', rateBps: 2000, maxAmount: money('30.00') };
const L = datasetFor('tnt_larkspur')!;
const heights = L.units.find((u) => u.projectId === 'prj_heights')!;
const gardens = L.units.find((u) => u.projectId === 'prj_gardens')!;
const manager = findPersona('manager')!;
const author: Persona = { ...manager, id: 'res_e3_com_author', principalId: 'usr_com_author', permissions: [...manager.permissions, 'pricing.manage'] };
const other: Persona = { ...author, id: 'res_e3_com_other', principalId: 'usr_com_other' };
const scoped: Persona = { ...author, id: 'res_e3_com_scoped', principalId: 'usr_com_scoped', projectScope: ['prj_heights'] };
const keyA = 'commercial-draft-key-00000001', keyB = 'commercial-draft-key-00000002', keyC = 'commercial-draft-key-00000003';
const project = 'prj_heights';
function context() {
  const mem = new Map<string, string>();
  const demo = new DemoStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
  const selected: { personaId: string; projectId: string } = { personaId: author.id, projectId: 'all' };
  const api = new MockTransport({
    getContext: () => ({ ...selected }), getMode: () => 'fast', demo,
    personas: [...ALL_PERSONAS, author, other, scoped],
  });
  return {
    api,
    as(id: string, projectId = 'all') { selected.personaId = id; selected.projectId = projectId; return api; },
    snapshot() {
      // Ignore legitimate sign-in/session telemetry. Assert the rest of the tenant
      // overlay (including every pricing section and sequence/key map) is unchanged.
      demo.save();
      const raw = mem.get('demo:store:v2');
      if (!raw) return '';
      const value = JSON.parse(raw) as { partitions: Record<string, { sections: Record<string, unknown> }> };
      for (const partition of Object.values(value.partitions)) delete partition.sections.identity;
      return JSON.stringify(value);
    },
  };
}
const create = (api: MockTransport, key = keyA, projectId = project, title = 'Illustrative commercial draft', fees: unknown = [FIXED], discounts: unknown = [DISCOUNT]) =>
  api.request<CommercialRulesDraft>({
    method: 'POST', path: '/pricing/commercial-rules', idempotencyKey: key,
    body: { projectId, title, fees, discounts, idempotencyKey: key },
  });
const revise = (api: MockTransport, id: string, key: string, expectedVersion: number, title: string, fees: unknown = [FIXED], discounts: unknown = [DISCOUNT]) =>
  api.request<CommercialRulesDraft>({
    method: 'POST', path: `/pricing/commercial-rules/${id}/versions`, idempotencyKey: key,
    body: { expectedVersion, title, fees, discounts, idempotencyKey: key },
  });
const list = (api: MockTransport) => api.request<CommercialRulesDraftList>({ method: 'GET', path: '/pricing/commercial-rules' });
const read = (api: MockTransport, id: string) => api.request<CommercialRulesDraft>({ method: 'GET', path: `/pricing/commercial-rules/${id}` });
const preview = (api: MockTransport, draftId: string, unitId = heights.id) =>
  api.request<CommercialRulesPreview>({ method: 'POST', path: '/pricing/commercial-preview', body: { draftId, unitId } });
async function denied(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    const p = (error as Error & { problem: { status: number; code: string; changed: boolean; correlationId?: string } }).problem;
    const { correlationId: _random, ...safe } = p;
    return safe;
  }
  throw new Error('Expected a denial');
}

describe('COM-004 deterministic fees and discounts (zero must stay visible)', () => {
  it('rounds fee rates in integer paisa, caps discounts and reconciles preview without floats', () => {
    const result = previewCommercial(money('1000.01'), [FIXED, PERCENT, ZERO], [DISCOUNT]);
    expect(result.lines.map((row) => row.amount.amount)).toEqual(['1.00', '10.00', '0.00', '30.00']);
    expect(result.totalFees).toEqual(money('11.00'));
    expect(result.totalDiscounts).toEqual(money('30.00'));
    expect(result.illustrativePayable).toEqual(money('981.01'));
  });
  it('zero base, zero capped discount and a zero fee remain valid visible rows', () => {
    const validated = validateCommercialRules([ZERO], [{ ...DISCOUNT, maxAmount: money('0.00') }]);
    const result = previewCommercial(money('0.00'), validated.fees, validated.discounts);
    expect(result.lines).toHaveLength(2);
    expect(result.lines.map((l) => l.amount.amount)).toEqual(['0.00', '0.00']);
    expect(result.illustrativePayable).toEqual(money('0.00'));
  });
  it('refuses excessive combined discounts instead of generating negative payable', () => {
    expect(() => previewCommercial(money('1000.00'), [ZERO], [
      { ...DISCOUNT, rateBps: 10000, maxAmount: money('2000.00') },
      { ...DISCOUNT, code: 'SECOND_DISC', rateBps: 10000, maxAmount: money('2000.00') },
    ])).toThrow(InvalidCommercialRule);
  });
  it('refuses duplicate codes, extra fields, foreign currency, malformed strings, illegal rates and overflow', () => {
    const invalid: Array<[unknown, unknown]> = [
      [null, []], [[null], []], [[], []], [[FIXED, { ...FIXED }], []],
      [[{ ...FIXED, mode: 'rate_bps', rateBps: 100 }], []],
      [[{ ...FIXED, amount: money('1.001') }], []],
      [[{ ...FIXED, amount: { amount: '1.00', currency: 'USD' } }], []],
      [[{ ...FIXED, amount: money('100000000001.00') }], []],
      [[{ ...PERCENT, rateBps: 10001 }], []],
      [[{ ...FIXED, secret: 'private' }], []],
      [[FIXED], [{ ...DISCOUNT, code: FIXED.code }]],
      [[], [{ ...DISCOUNT, maxAmount: money('-1.00') }]],
      [[], [{ ...DISCOUNT, rateBps: -1 }]],
    ];
    for (const [fees, discounts] of invalid) expect(() => validateCommercialRules(fees, discounts)).toThrow(InvalidCommercialRule);
    expect(() => toPaisa({ amount: '2.00', currency: 'USD' })).toThrow(InvalidCommercialRule);
    expect(fromPaisa(101n)).toEqual(money('1.01'));
  });
});

describe('COM-004 scoped draft API and non-posting preview', () => {
  it('creates private draft only, its reads are mutation-free and it never becomes approved', async () => {
    const w = context();
    const draft = await create(w.api);
    expect(draft).toMatchObject({ creatorPrincipalId: author.principalId, projectId: project, state: 'draft', effective: false, approvalAllowed: false, currentVersion: 1 });
    expect(draft.versions[0]).toMatchObject({ version: 1, fees: [FIXED], discounts: [DISCOUNT], state: 'draft' });
    const before = w.snapshot();
    expect(await read(w.api, draft.id)).toEqual(draft);
    expect(await list(w.api)).toMatchObject({ total: 1, items: [{ id: draft.id, currentVersion: 1 }] });
    expect(w.snapshot()).toBe(before);
  });
  it('same key returns original response; changed payload and wrong actor refuse without mutation', async () => {
    const w = context();
    const first = await create(w.api);
    const before = w.snapshot();
    expect(await create(w.api)).toEqual(first);
    expect(w.snapshot()).toBe(before);
    expect(await denied(create(w.api, keyA, project, 'Changed draft title'))).toMatchObject({ status: 409, changed: false });
    w.as(other.id);
    expect(await denied(create(w.api))).toMatchObject({ status: 409, changed: false });
    expect(w.snapshot()).toBe(before);
    w.as(author.id);
    expect((await create(w.api, keyB)).id).not.toBe(first.id);
  });
  it('known hidden and unknown IDs are identical on direct GET and POST revision, list totals stay private', async () => {
    const w = context();
    const first = await create(w.api);
    const before = w.snapshot();
    w.as(other.id);
    const hidden = await denied(read(w.api, first.id));
    const absent = await denied(read(w.api, 'cdr_999999'));
    expect(hidden).toEqual(absent);
    expect(hidden).toMatchObject({ status: 404, code: 'not_found', changed: false });
    expect(await denied(revise(w.api, first.id, keyB, 1, 'Other private revision'))).toEqual(hidden);
    expect(await list(w.api)).toEqual({ items: [], total: 0 });
    expect(w.snapshot()).toBe(before);
  });
  it('version append never alters previous snapshot; stale request and collision are byte-identically denied', async () => {
    const w = context();
    const draft = await create(w.api);
    const v2 = await revise(w.api, draft.id, keyB, 1, 'Second version');
    expect(v2.currentVersion).toBe(2);
    expect(v2.versions[0]).toEqual(draft.versions[0]);
    const v3 = await revise(w.api, draft.id, keyC, 2, 'Third version');
    expect(v3.currentVersion).toBe(3);
    const before = w.snapshot();
    expect(await revise(w.api, draft.id, keyB, 1, 'Second version')).toEqual(v2);
    expect(w.snapshot()).toBe(before);
    expect(await denied(revise(w.api, draft.id, 'fresh-revision-key-222', 1, 'Stale'))).toMatchObject({ status: 409, changed: false });
    expect(await denied(revise(w.api, draft.id, keyB, 1, 'Changed revision'))).toMatchObject({ status: 409, changed: false });
    expect(w.snapshot()).toBe(before);
    expect((await read(w.api, draft.id)).versions[0]).toEqual(draft.versions[0]);
  });
  it('invalid payload refuses whole create, never consumes an ID or key', async () => {
    const w = context();
    await list(w.api);
    const before = w.snapshot();
    for (const [fees, discounts] of [[null, []], [[FIXED, FIXED], []], [[{ ...FIXED, amount: money('1.001') }], []]] as Array<[unknown, unknown]>) {
      expect(await denied(create(w.api, keyA, project, 'Valid title', fees, discounts))).toMatchObject({ status: 422, changed: false });
      expect(w.snapshot()).toBe(before);
    }
    expect((await create(w.api)).id).toBe('cdr_000001');
  });
  it('preview is exact, read-only, and a hidden unit or another project cannot be guessed', async () => {
    const w = context();
    const draft = await create(w.api);
    const before = w.snapshot();
    const result = await preview(w.api, draft.id);
    expect(result).toMatchObject({
      unit: { id: heights.id }, listedPrice: heights.price, previewOnly: true, postingAllowed: false, policyStatus: 'not_approved',
    });
    expect(result.totalFees).toEqual(money('1.00'));
    expect(result.totalDiscounts).toEqual(money('30.00'));
    expect(w.snapshot()).toBe(before);
    const hidden = await denied(preview(w.api, draft.id, gardens.id));
    const absent = await denied(preview(w.api, draft.id, 'unt_nonexistent_commercial'));
    expect(hidden).toEqual(absent);
    expect(hidden).toMatchObject({ status: 404, code: 'not_found', changed: false });
    expect(w.snapshot()).toBe(before);
  });
  it('project narrowing immediately removes list, detail, revise and preview access', async () => {
    const w = context();
    const draft = await create(w.api);
    const before = w.snapshot();
    w.as(author.id, 'prj_gardens');
    expect(await list(w.api)).toMatchObject({ total: 0, items: [] });
    expect(await denied(read(w.api, draft.id))).toEqual(await denied(read(w.api, 'cdr_never_issued')));
    expect(await denied(revise(w.api, draft.id, keyB, 1, 'Hidden'))).toMatchObject({ status: 404, changed: false });
    expect(await denied(preview(w.api, draft.id))).toMatchObject({ status: 404, changed: false });
    expect(w.snapshot()).toBe(before);
  });
  it('no current demo role automatically gains pricing manage', () => {
    expect(ALL_PERSONAS.every((p) => !p.permissions.includes('pricing.manage'))).toBe(true);
  });
});
