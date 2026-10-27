import type { ContractDraft, RateCard, TenantDraft, UsageDimension } from '@repo/contracts';

/**
 * Create tenant wizard (HQ-003), in the order of the owner's V3.1 journey: type & edition →
 * organisation → sites → modules (dependency check) → pricing builder → usage & unit counts →
 * tax & discounts → quote → review → activate. The draft lives on the mock server and is saved at
 * every step, so Back, a refresh or a language switch never lose entries.
 */
export const STEPS = ['type', 'organisation', 'sites', 'modules', 'pricing', 'counts', 'terms', 'quote', 'review'] as const;
export type Step = (typeof STEPS)[number];
export type Screen = Step | 'done';

export const stepIndex = (s: Step) => STEPS.indexOf(s);
export const isStep = (v: string | null): v is Step => STEPS.includes(v as Step);

/** The furthest step the draft has reached (saved with each Continue). */
export const reachedIndex = (draft: TenantDraft | null) => (draft ? Math.max(0, stepIndex(isStep(draft.step) ? draft.step : 'type')) : 0);

/** Which unit dimensions the contract prices (so the counts step asks only for those). */
export function usedDimensions(contract: ContractDraft | null): UsageDimension[] {
  const dims = new Set<UsageDimension>(['units.eligible']);
  for (const c of contract?.components ?? []) {
    if (c.dimension) dims.add(c.dimension);
    if (c.type === 'PER_SEAT') dims.add('seats.staff_active');
    if (c.type === 'PER_BUILDING') dims.add('buildings.active');
    if (c.type === 'PER_SITE' && !c.siteIds) dims.add('sites.licensed');
  }
  return [...dims];
}

/** Declared counts with defaults derived from the sites (A3 §4: estimates until go-live). */
export function quantitiesFor(draft: Pick<TenantDraft, 'sites' | 'quantities'>): Partial<Record<UsageDimension, number>> {
  const declared = draft.sites.reduce((s, x) => s + x.declaredUnits, 0);
  return {
    'units.registered': declared,
    'units.eligible': declared,
    'units.occupied': declared,
    'units.active': declared,
    'units.licensed_capacity': declared,
    'sites.licensed': draft.sites.length,
    'buildings.active': draft.sites.reduce((s, x) => s + x.buildings, 0),
    'seats.staff_active': 5,
    'sms.sent': 0,
    'storage.gb_month': 0,
    ...draft.quantities,
  };
}

/** Today in the demo's data clock; contracts start on the next billing boundary by default. */
export const DEMO_TODAY = '2026-10-26';

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Switching the trial on moves every charge to the end of the trial (and back when it is off). */
export function withTrial(contract: ContractDraft, on: boolean, rateCard: RateCard): ContractDraft {
  const start = contract.terms.start;
  const trialLine = rateCard.lines.find((l) => l.type === 'TRIAL');
  const days = trialLine?.trialDays ?? 30;
  const others = contract.components.filter((c) => c.type !== 'TRIAL');
  if (!on || !trialLine) return { ...contract, components: others.map((c) => (c.effectiveFrom === addDays(start, days) ? { ...c, effectiveFrom: start } : c)) };
  const chargesFrom = addDays(start, days);
  return {
    ...contract,
    components: [
      { id: 'cmp_trial', type: 'TRIAL', rateCardLineId: trialLine.id, trialDays: days, cadence: 'once', proration: 'none', effectiveFrom: start, effectiveTo: chargesFrom },
      ...others.map((c) => (c.effectiveFrom <= chargesFrom ? { ...c, effectiveFrom: chargesFrom } : c)),
    ],
  };
}

/** Moving the start date moves components that began with the contract. */
export function withStart(contract: ContractDraft, start: string): ContractDraft {
  const old = contract.terms.start;
  const trial = contract.components.find((c) => c.type === 'TRIAL');
  const oldCharges = trial?.effectiveTo ?? old;
  const days = trial?.trialDays ?? 0;
  const newCharges = addDays(start, days);
  return {
    ...contract,
    terms: { ...contract.terms, start },
    components: contract.components.map((c) => {
      if (c.type === 'TRIAL') return { ...c, effectiveFrom: start, effectiveTo: newCharges };
      if (c.effectiveFrom === old || c.effectiveFrom === oldCharges) return { ...c, effectiveFrom: trial ? newCharges : start };
      return c;
    }),
    discounts: contract.discounts.map((d) => (d.from === old ? { ...d, from: start } : d)),
  };
}
