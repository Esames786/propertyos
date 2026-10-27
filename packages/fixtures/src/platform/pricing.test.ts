import { pkr, type ContractDiscount, type ContractDraft, type PricingComponent } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { priceContract, roundHalf, type Quantities } from './pricing';
import table from './pricing.vectors.json';
import { RATE_CARD } from './rate-card';
import { contractProblems } from './validation';

interface RawComponent {
  id: string;
  type: PricingComponent['type'];
  line?: string;
  unitPrice?: string;
  dimension?: PricingComponent['dimension'];
  module?: PricingComponent['module'];
  tierMethod?: 'graduated' | 'volume';
  tiers?: Array<[number | null, string]>;
  allowance?: number;
  trialDays?: number;
  quantity?: number;
  siteIds?: string[];
  effectiveFrom?: string;
  effectiveTo?: string;
}

interface Vector {
  name: string;
  start: string;
  use?: 'alnoor';
  components?: RawComponent[];
  add?: RawComponent[];
  patch?: Record<string, Partial<RawComponent>>;
  chargesFrom?: string;
  discounts?: Array<Omit<ContractDiscount, 'from'> & { from?: string }>;
  terms?: { minimumMonthly?: string; capMonthly?: string; tax?: { code: string; ratePct: string }; termMonths?: number; billingFrequency?: 'monthly' | 'quarterly' | 'annual' };
  quantities: Quantities;
  expect: { first?: string; next?: string; regular?: string; firstYear?: string; schedule?: Record<string, string>; approval?: string[] };
}

function component(raw: RawComponent, from: string): PricingComponent {
  return {
    id: raw.id,
    type: raw.type,
    ...(raw.line ? { rateCardLineId: raw.line } : {}),
    ...(raw.unitPrice ? { unitPrice: pkr(raw.unitPrice) } : {}),
    ...(raw.dimension ? { dimension: raw.dimension } : {}),
    ...(raw.module ? { module: raw.module } : {}),
    ...(raw.tierMethod ? { tierMethod: raw.tierMethod } : {}),
    ...(raw.tiers ? { tiers: raw.tiers.map(([upTo, price]) => ({ upTo, unitPrice: pkr(price) })) } : {}),
    ...(raw.allowance !== undefined ? { allowance: raw.allowance } : {}),
    ...(raw.trialDays !== undefined ? { trialDays: raw.trialDays } : {}),
    ...(raw.quantity !== undefined ? { quantity: raw.quantity } : {}),
    ...(raw.siteIds ? { siteIds: raw.siteIds } : {}),
    cadence: raw.type === 'ONE_TIME' || raw.type === 'TRIAL' ? 'once' : 'monthly',
    proration: raw.type === 'ONE_TIME' ? 'none' : 'actual_days',
    effectiveFrom: raw.effectiveFrom ?? from,
    ...(raw.effectiveTo ? { effectiveTo: raw.effectiveTo } : {}),
  };
}

function contractOf(v: Vector): ContractDraft {
  const base = v.use === 'alnoor' ? (table.alnoor as RawComponent[]) : (v.components ?? []);
  const raws = [...base.map((c) => ({ ...c, ...(v.patch?.[c.id] ?? {}) })), ...(v.add ?? [])];
  const chargesFrom = v.chargesFrom ?? v.start;
  return {
    terms: {
      start: v.start,
      termMonths: v.terms?.termMonths ?? 12,
      billingFrequency: v.terms?.billingFrequency ?? 'monthly',
      timing: 'advance',
      tax: v.terms?.tax ?? { code: 'NONE', ratePct: '0' },
      ...(v.terms?.minimumMonthly ? { minimumMonthly: pkr(v.terms.minimumMonthly) } : {}),
      ...(v.terms?.capMonthly ? { capMonthly: pkr(v.terms.capMonthly) } : {}),
    },
    components: raws.map((r) => component(r, r.type === 'TRIAL' ? v.start : chargesFrom)),
    discounts: (v.discounts ?? []).map((d) => ({ ...d, from: d.from ?? v.start })),
  };
}

describe('pricing golden vectors (A3 §5)', () => {
  for (const v of table.vectors as unknown as Vector[]) {
    it(v.name, () => {
      const quote = priceContract({ contract: contractOf(v), quantities: v.quantities, quantitySource: 'declared', edition: 'community' });
      if (v.expect.first) expect(quote.firstPeriod.total.amount, 'first period').toBe(v.expect.first);
      if (v.expect.next) expect(quote.nextPeriod.total.amount, 'next period').toBe(v.expect.next);
      if (v.expect.regular) expect(quote.regularPeriod.total.amount, 'regular period').toBe(v.expect.regular);
      if (v.expect.firstYear) expect(quote.firstYearValue.amount, 'first-year value').toBe(v.expect.firstYear);
      for (const [i, total] of Object.entries(v.expect.schedule ?? {})) expect(quote.schedule[Number(i)]!.total.amount, `schedule[${i}]`).toBe(total);
      if (v.expect.approval) {
        expect(quote.approval.reasons.map((r) => r.rule).sort()).toEqual([...v.expect.approval].sort());
        expect(quote.approval.required).toBe(v.expect.approval.length > 0);
      }
      expect(quote.nonAuthoritative).toBe(true);
    });
  }

  it('every vector also passes the server’s pricing rules (nothing valid is refused)', () => {
    for (const v of table.vectors as unknown as Vector[]) expect(contractProblems(contractOf(v), { commit: false, rateCard: RATE_CARD }), v.name).toEqual({});
  });
});

describe('pricing engine details', () => {
  const alnoor = contractOf((table.vectors as unknown as Vector[])[0]!);

  it('explains every line: quantity, unit price, proration and source', () => {
    const quote = priceContract({ contract: { ...alnoor, terms: { ...alnoor.terms, start: '2026-11-16' } }, quantities: { 'units.eligible': 80, 'sites.licensed': 1 }, quantitySource: 'declared', edition: 'community' });
    const flats = quote.firstPeriod.lines.find((l) => l.componentId === 'flats')!;
    expect(flats.quantity).toBe('80');
    expect(flats.unitPrice?.amount).toBe('40.00');
    expect(flats.proration).toEqual({ days: 15, ofDays: 30 });
    expect(flats.net.amount).toBe('1600.00');
    expect(quote.quantities).toEqual(expect.arrayContaining([{ dimension: 'units.eligible', value: 80, source: 'declared' }]));
  });

  it('totals are sums of rounded lines', () => {
    const quote = priceContract({ contract: alnoor, quantities: { 'units.eligible': 80, 'sites.licensed': 1 }, quantitySource: 'declared', edition: 'community' });
    const sum = quote.firstPeriod.lines.reduce((s, l) => s + Math.round(Number(l.total.amount) * 100), 0);
    expect(Math.round(Number(quote.firstPeriod.total.amount) * 100)).toBe(sum);
  });

  it('rounds half away from zero', () => {
    expect(roundHalf(2.5)).toBe(3);
    expect(roundHalf(-2.5)).toBe(-3);
    expect(roundHalf(13066.666)).toBe(13067);
  });

  it('graduated tiers show their bands', () => {
    const v = (table.vectors as unknown as Vector[]).find((x) => x.name.startsWith('Tiered, graduated'))!;
    const line = priceContract({ contract: contractOf(v), quantities: v.quantities, quantitySource: 'declared', edition: 'community' }).firstPeriod.lines[0]!;
    expect(line.bands?.map((b) => [b.quantity, b.amount.amount])).toEqual([
      [50, '2250.00'],
      [30, '1050.00'],
    ]);
  });
});
