import { describe, expect, it } from 'vitest';
import type { Money, PlanAllocationInput, PlanPreview, Persona } from '@repo/contracts';
import { DemoStore } from '../../demo-store';
import { datasetFor } from '../../datasets';
import { MockTransport } from '../../mock-transport';
import { ALL_PERSONAS, findPersona } from '../../people';
import { calculatePlanPreview, InvalidPlanError } from './calculator';

const pkr = (amount: string): Money => ({ amount, currency: 'PKR' });
const row = (kind: PlanAllocationInput['kind'], shareBps: number, extra: Partial<PlanAllocationInput> = {}): PlanAllocationInput =>
  ({ kind, shareBps, ...extra });
const common: PlanAllocationInput[] = [row('down_payment', 1000), row('instalments', 9000, { count: 12 })];

describe('E.3 COM-002: fixed-decimal, immutable, read-only preview arithmetic', () => {
  it('allocates every paisa, with instalment remainder on the final row', () => {
    const r = calculatePlanPreview(pkr('1000.01'), common);
    expect(r.lines).toHaveLength(13);
    expect(r.lines[0]?.amount.amount).toBe('100.00');
    expect(r.lines[1]?.amount.amount).toBe('75.00');
    expect(r.lines[12]?.amount.amount).toBe('75.01');
    expect(r.totalAllocated).toEqual(pkr('1000.01'));
    expect(r.difference).toEqual(pkr('0.00'));
  });

  it('keeps zero-percent lines visible as Rs 0.00, even in the final position', () => {
    const lines = [
      row('down_payment', 5000),
      row('on_possession', 5000),
      row('balloon', 0),
    ];
    const r = calculatePlanPreview(pkr('1.01'), lines);
    expect(r.lines.map((x) => x.amount.amount)).toEqual(['0.50', '0.51', '0.00']);
  });

  it('keeps construction-linked milestone keys without inventing a date', () => {
    const r = calculatePlanPreview(pkr('25000000.37'), [
      row('down_payment', 500),
      row('construction_linked', 5000, { milestoneKey: 'structure_complete' }),
      row('instalments', 4500, { count: 7 }),
    ]);
    expect(r.lines).toHaveLength(9);
    expect(r.lines[1]?.milestoneKey).toBe('structure_complete');
    expect(JSON.stringify(r)).not.toMatch(/dueDate|postedAt|approvedAt|paidAt/);
    expect(r.totalAllocated).toEqual(pkr('25000000.37'));
  });

  it('rejects malformed totals, counts, percentages, milestones and unknown fields', () => {
    const invalidValues: unknown[] = [
      [], null, [null],
      [row('down_payment', 9999)],
      [row('down_payment', 10001)],
      [row('instalments', 10000)],
      [row('instalments', 10000, { count: 0 })],
      [row('instalments', 10000, { count: 37 })],
      [row('construction_linked', 10000)],
      [row('construction_linked', 10000, { milestoneKey: '../hidden' })],
      [{ kind: 'balloon', shareBps: 10000, amount: '1.00' }],
      [{ kind: 'balloon', shareBps: 10000.5 }],
    ];
    for (const value of invalidValues) expect(() => calculatePlanPreview(pkr('1000.01'), value), JSON.stringify(value)).toThrow(InvalidPlanError);
    expect(() => calculatePlanPreview(pkr('-1.00'), [row('balloon', 10000)])).toThrow(InvalidPlanError);
  });
});

const L = datasetFor('tnt_larkspur')!;
const HEIGHTS = L.units.find((u) => u.projectId === 'prj_heights')!;
const GARDENS = L.units.find((u) => u.projectId === 'prj_gardens')!;
const NEVER = 'unt_never_issued_e3_preview';
const manager = findPersona('manager')!;
const pricer: Persona = {
  ...manager, id: 'res_e3_pricer', principalId: 'usr_e3_pricer', permissions: [...manager.permissions, 'pricing.manage'],
};
const scoped: Persona = { ...pricer, id: 'res_e3_scoped', principalId: 'usr_e3_scoped', projectScope: ['prj_heights'] };
const readonlyPricer: Persona = { ...pricer, id: 'res_e3_price_only', principalId: 'usr_e3_price_only', permissions: ['pricing.manage'] };
const onlyView: Persona = { ...manager, id: 'res_e3_view_only', principalId: 'usr_e3_view_only', permissions: ['unit.view'] };

function world() {
  const mem = new Map<string, string>();
  const demo = new DemoStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
  const ctx = { personaId: 'res_e3_pricer', projectId: 'all' };
  const api = new MockTransport({ getContext: () => ({ ...ctx }), getMode: () => 'fast', demo, personas: [...ALL_PERSONAS, pricer, scoped, readonlyPricer, onlyView] });
  return {
    api,
    as(id: string, projectId = 'all') { ctx.personaId = id; ctx.projectId = projectId; return api; },
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
const preview = (api: MockTransport, id: string, allocations: unknown = common) =>
  api.request<PlanPreview>({ method: 'POST', path: '/pricing/plan-preview', body: { unitId: id, allocations } });
async function refusal(promise: Promise<unknown>) {
  try { await promise; } catch (e) {
    const err = e as Error & { problem: { correlationId: string; status: number; code: string; changed: boolean } };
    const { correlationId: _ignored, ...safe } = err.problem;
    return { name: err.name, message: err.message, ...safe };
  }
  throw new Error('Expected refusal');
}

describe('E.3 COM-002: secured pure preview endpoint', () => {
  it('returns exactly the current fictional price, no writes or financial status', async () => {
    const w = world();
    await w.api.request({ method: 'GET', path: '/pricing/units' });
    const before = w.snapshot();
    const out = await preview(w.api, HEIGHTS.id);
    expect(out.unit.currentListedPrice).toEqual(HEIGHTS.price);
    expect(out.totalAllocated).toEqual({ ...HEIGHTS.price, amount: out.totalAllocated.amount });
    expect(out.totalPrice).toEqual(HEIGHTS.price);
    expect(out.totalAllocated.amount).toBe(calculatePlanPreview(HEIGHTS.price, common).totalAllocated.amount);
    expect(out).toMatchObject({ totalShareBps: 10000, difference: pkr('0.00'), previewOnly: true, postingAllowed: false, priceSource: 'fictional_seed', policyStatus: 'not_approved', hasScheduledDates: false });
    expect(w.snapshot()).toBe(before);
  });

  it('hides existence of out-of-scope, unknown and filtered unit ids, no state mutation', async () => {
    const w = world();
    await w.api.request({ method: 'GET', path: '/pricing/units' });
    w.as('res_e3_scoped');
    await w.api.request({ method: 'GET', path: '/pricing/units' });
    const before = w.snapshot();
    const hidden = await refusal(preview(w.api, GARDENS.id));
    const absent = await refusal(preview(w.api, NEVER));
    expect(hidden).toEqual(absent);
    expect(hidden).toMatchObject({ status: 404, code: 'not_found', changed: false });
    expect(w.snapshot()).toBe(before);
    w.as('res_e3_pricer', 'prj_heights');
    expect(await refusal(preview(w.api, GARDENS.id))).toEqual(await refusal(preview(w.api, NEVER)));
  });

  it('does not leak price to a pricing-only principal lacking unit.view, or a view-only principal', async () => {
    const w = world();
    w.as('res_e3_price_only');
    expect(await refusal(preview(w.api, HEIGHTS.id))).toMatchObject({ status: 404, code: 'not_found' });
    w.as('res_e3_view_only');
    expect(await refusal(preview(w.api, HEIGHTS.id))).toMatchObject({ status: 403, changed: false });
  });

  it('invalid allocations refuse entirely and leave the whole demo overlay unchanged', async () => {
    const w = world();
    await w.api.request({ method: 'GET', path: '/pricing/units' });
    const before = w.snapshot();
    const invalidInputs: unknown[] = [
      [row('down_payment', 9900)],
      [{ kind: 'down_payment', shareBps: 10000 }, null],
      [row('instalments', 10000, { count: 99 })],
      [row('construction_linked', 10000, { milestoneKey: 'bad key' })],
    ];
    for (const input of invalidInputs) {
      const error = await refusal(preview(w.api, HEIGHTS.id, input));
      expect(error).toMatchObject({ status: 422, code: 'validation_failed', changed: false });
      expect(w.snapshot()).toBe(before);
    }
  });

  it('no demo starter or existing manager gained a pricing permission', () => {
    expect(manager.permissions).not.toContain('pricing.manage');
    expect(ALL_PERSONAS.every((p) => !p.permissions.includes('pricing.manage'))).toBe(true);
  });
});
