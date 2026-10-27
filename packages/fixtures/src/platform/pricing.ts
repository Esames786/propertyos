import {
  pkr,
  type ComponentType,
  type ContractDraft,
  type ContractDiscount,
  type Money,
  type PricingComponent,
  type QuoteLine,
  type QuotePeriod,
  type QuotePreview,
  type QuoteQuantity,
  type UsageDimension,
} from '@repo/contracts';
import { checkApproval } from './approvals';

/**
 * Platform pricing engine (Gate A, A3 §2–6). It runs in the mock SERVER, never in a component.
 * Money is integer paisa throughout; every line is rounded half away from zero to the paisa, and
 * totals are sums of rounded lines. The same golden vectors (pricing.vectors.json) will later prove
 * the Laravel implementation.
 *
 * Calculation order (A3 §6): select components in force → quantity → allowance → price by method
 * → prorate → component discounts, then contract discounts (before tax) → round each line →
 * contract minimum / cap as explicit adjustment lines → tax per line → totals.
 */

// ---------------------------------------------------------------- money and dates

export function toPaisa(m: Money | undefined): number {
  if (!m) return 0;
  const [whole, frac = ''] = m.amount.replace('-', '').split('.');
  const value = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return m.amount.startsWith('-') ? -value : value;
}

export function fromPaisa(p: number): Money {
  const sign = p < 0 ? '-' : '';
  const abs = Math.abs(p);
  return pkr(`${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`);
}

/** Half away from zero, so a negative cap adjustment rounds like its positive twin. */
export const roundHalf = (x: number) => Math.sign(x) * Math.round(Math.abs(x) + 1e-9);

const DAY = 86_400_000;
const toTime = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addMonths = (iso: string, months: number) => {
  const d = new Date(toTime(iso));
  d.setUTCMonth(d.getUTCMonth() + months);
  return toIso(d.getTime());
};
const daysBetween = (a: string, b: string) => Math.round((toTime(b) - toTime(a)) / DAY);
const maxIso = (...xs: string[]) => xs.reduce((m, x) => (x > m ? x : m));
const minIso = (...xs: string[]) => xs.reduce((m, x) => (x < m ? x : m));

// ---------------------------------------------------------------- periods

const MONTHS: Record<ContractDraft['terms']['billingFrequency'], number> = { monthly: 1, quarterly: 3, annual: 12 };
/** Months a recurring price covers ('once' never reaches the recurring branch). */
const CADENCE_MONTHS: Record<PricingComponent['cadence'], number> = { once: 1, monthly: 1, quarterly: 3, annual: 12 };

interface Period {
  start: string;
  end: string;
  /** Days in the full billing period this one belongs to (the proration denominator). */
  fullDays: number;
}

/** Billing periods are aligned to calendar months; the first one starts on the contract start date. */
export function billingPeriods(start: string, frequency: ContractDraft['terms']['billingFrequency'], count: number): Period[] {
  const n = MONTHS[frequency];
  const anchor = `${start.slice(0, 7)}-01`;
  const out: Period[] = [];
  for (let i = 0; i < count; i++) {
    const fullStart = addMonths(anchor, i * n);
    const fullEnd = addMonths(anchor, (i + 1) * n);
    out.push({ start: i === 0 ? start : fullStart, end: fullEnd, fullDays: daysBetween(fullStart, fullEnd) });
  }
  return out;
}

// ---------------------------------------------------------------- quantities

const RECURRING: ReadonlySet<ComponentType> = new Set(['FREE', 'FIXED_RECURRING', 'PER_SITE', 'PER_BUILDING', 'PER_UNIT', 'PER_SEAT', 'PER_MODULE', 'TIERED']);
export const isRecurring = (type: ComponentType) => RECURRING.has(type);

const DEFAULT_DIMENSION: Partial<Record<ComponentType, UsageDimension>> = {
  PER_SITE: 'sites.licensed',
  PER_BUILDING: 'buildings.active',
  PER_SEAT: 'seats.staff_active',
};

export type Quantities = Partial<Record<UsageDimension, number>>;

function quantityOf(c: PricingComponent, q: Quantities): number {
  if (c.quantity !== undefined) return c.quantity;
  if (c.type === 'PER_MODULE') return c.siteIds?.length ?? 1;
  if (c.type === 'PER_SITE' && c.siteIds) return c.siteIds.length;
  const dim = c.dimension ?? DEFAULT_DIMENSION[c.type];
  if (dim) return q[dim] ?? 0;
  return 1;
}

// ---------------------------------------------------------------- one line

function priceTiers(c: PricingComponent, qty: number): { amount: number; bands: NonNullable<QuoteLine['bands']> } {
  const tiers = c.tiers ?? [];
  const bands: NonNullable<QuoteLine['bands']> = [];
  if (c.tierMethod === 'volume') {
    const band = tiers.find((t) => t.upTo === null || qty <= t.upTo) ?? tiers[tiers.length - 1]!;
    const amount = roundHalf(qty * toPaisa(band.unitPrice));
    bands.push({ quantity: qty, unitPrice: band.unitPrice, amount: fromPaisa(amount) });
    return { amount, bands };
  }
  let remaining = qty;
  let lower = 0;
  let amount = 0;
  for (const t of tiers) {
    if (remaining <= 0) break;
    const size = t.upTo === null ? remaining : Math.min(remaining, t.upTo - lower);
    const part = roundHalf(size * toPaisa(t.unitPrice));
    bands.push({ quantity: size, unitPrice: t.unitPrice, amount: fromPaisa(part) });
    amount += part;
    remaining -= size;
    lower = t.upTo ?? lower;
  }
  return { amount, bands };
}

const overlaps = (aStart: string, aEnd: string | undefined, bStart: string, bEnd: string) => aStart < bEnd && (aEnd === undefined || aEnd > bStart);

function discountFor(line: { componentId: string; type: ComponentType; gross: number }, discounts: readonly ContractDiscount[], period: Period): number {
  let total = 0;
  for (const d of discounts) {
    if (!overlaps(d.from, d.to, period.start, period.end)) continue;
    const applies = d.target === 'contract' || d.target === line.componentId || (d.target === 'recurring' && isRecurring(line.type));
    if (!applies) continue;
    if (d.kind === 'percent') total += roundHalf((line.gross * Number(d.value)) / 100);
    else if (d.target === line.componentId) total += toPaisa(pkr(d.value));
  }
  return Math.min(total, Math.max(line.gross, 0));
}

interface RawLine extends Omit<QuoteLine, 'gross' | 'discount' | 'net' | 'tax' | 'total'> {
  grossP: number;
  discountP: number;
  netP: number;
  recurringCoverage: number;
}

function priceComponent(c: PricingComponent, contract: ContractDraft, period: Period, q: Quantities): RawLine | null {
  const contractStart = contract.terms.start;
  const from = maxIso(period.start, c.effectiveFrom, contractStart);
  const to = c.effectiveTo ? minIso(period.end, c.effectiveTo) : period.end;
  const covered = Math.max(0, daysBetween(from, to));

  const base = { componentId: c.id, type: c.type, ...(c.dimension ? { dimension: c.dimension } : {}), ...(c.module ? { module: c.module } : {}) };

  if (c.type === 'ONE_TIME') {
    // Charged once, in the period containing its effective date; never prorated.
    if (!(c.effectiveFrom >= period.start && c.effectiveFrom < period.end) || c.effectiveFrom < contractStart) return null;
    const qty = quantityOf(c, q);
    const gross = roundHalf(qty * toPaisa(c.unitPrice));
    return { ...base, quantity: String(qty), unitPrice: c.unitPrice, grossP: gross, discountP: 0, netP: gross, recurringCoverage: 0 };
  }
  if (covered === 0) return null;

  if (c.type === 'TRIAL') {
    return { ...base, quantity: String(covered), grossP: 0, discountP: 0, netP: 0, recurringCoverage: 0 };
  }

  if (c.type === 'USAGE') {
    const used = quantityOf(c, q);
    const billable = Math.max(0, used - (c.allowance ?? 0));
    const gross = roundHalf(billable * toPaisa(c.unitPrice));
    return { ...base, quantity: String(used), ...(c.allowance !== undefined ? { allowance: c.allowance } : {}), unitPrice: c.unitPrice, grossP: gross, discountP: 0, netP: gross, recurringCoverage: 0 };
  }

  // Recurring: full-period amount (a monthly price billed quarterly counts three months), then
  // prorated by covered days.
  const qty = quantityOf(c, q);
  const perPeriod = MONTHS[contract.terms.billingFrequency] / CADENCE_MONTHS[c.cadence];
  let full: number;
  let bands: QuoteLine['bands'];
  if (c.type === 'TIERED') {
    const t = priceTiers(c, qty);
    full = t.amount * perPeriod;
    bands = t.bands;
  } else {
    full = qty * toPaisa(c.unitPrice) * perPeriod;
  }
  const ofDays = c.proration === 'thirty_day' ? 30 : period.fullDays;
  const days = c.proration === 'none' ? ofDays : Math.min(covered, ofDays);
  const gross = roundHalf((full * days) / ofDays);
  return {
    ...base,
    quantity: String(qty),
    ...(c.unitPrice ? { unitPrice: c.unitPrice } : {}),
    ...(c.tierMethod ? { tierMethod: c.tierMethod } : {}),
    ...(bands ? { bands } : {}),
    ...(days < ofDays ? { proration: { days, ofDays } } : {}),
    grossP: gross,
    discountP: 0,
    netP: gross,
    recurringCoverage: days / ofDays,
  };
}

// ---------------------------------------------------------------- one period

export function pricePeriod(contract: ContractDraft, period: Period, q: Quantities): QuotePeriod {
  const rate = Number(contract.terms.tax.ratePct || '0');
  const taxOf = (net: number) => roundHalf((net * rate) / 100);

  const raw = contract.components.map((c) => priceComponent(c, contract, period, q)).filter((l): l is RawLine => l !== null);
  for (const l of raw) {
    l.discountP = discountFor({ componentId: l.componentId, type: l.type, gross: l.grossP }, contract.discounts, period);
    l.netP = l.grossP - l.discountP;
  }

  // Contract minimum / cap on recurring charges (prorated like the period), as explicit adjustments.
  const adjustments: QuotePeriod['adjustments'] = [];
  const recurring = raw.filter((l) => isRecurring(l.type));
  if (recurring.length > 0) {
    const coverage = Math.max(...recurring.map((l) => l.recurringCoverage));
    const recurringNet = recurring.reduce((s, l) => s + l.netP, 0);
    const months = MONTHS[contract.terms.billingFrequency];
    const min = contract.terms.minimumMonthly ? roundHalf(toPaisa(contract.terms.minimumMonthly) * months * coverage) : null;
    const cap = contract.terms.capMonthly ? roundHalf(toPaisa(contract.terms.capMonthly) * months * coverage) : null;
    if (min !== null && recurringNet < min) adjustments.push({ kind: 'minimum', amount: fromPaisa(min - recurringNet), tax: fromPaisa(taxOf(min - recurringNet)) });
    if (cap !== null && recurringNet > cap) adjustments.push({ kind: 'cap', amount: fromPaisa(cap - recurringNet), tax: fromPaisa(taxOf(cap - recurringNet)) });
  }

  const lines: QuoteLine[] = raw.map(({ grossP, discountP, netP, recurringCoverage: _c, ...rest }) => {
    const tax = taxOf(netP);
    return { ...rest, gross: fromPaisa(grossP), discount: fromPaisa(discountP), net: fromPaisa(netP), tax: fromPaisa(tax), total: fromPaisa(netP + tax) };
  });

  const sum = (f: (l: QuoteLine) => Money) => lines.reduce((s, l) => s + toPaisa(f(l)), 0);
  const adjNet = adjustments.reduce((s, a) => s + toPaisa(a.amount), 0);
  const adjTax = adjustments.reduce((s, a) => s + toPaisa(a.tax), 0);
  const net = sum((l) => l.net) + adjNet;
  const tax = sum((l) => l.tax) + adjTax;
  return {
    start: period.start,
    end: period.end,
    lines,
    subtotal: fromPaisa(sum((l) => l.gross)),
    discounts: fromPaisa(sum((l) => l.discount)),
    adjustments,
    net: fromPaisa(net),
    tax: fromPaisa(tax),
    total: fromPaisa(net + tax),
  };
}

// ---------------------------------------------------------------- whole quote

export interface QuoteInput {
  contract: ContractDraft;
  quantities: Quantities;
  quantitySource: QuoteQuantity['source'];
  edition: Parameters<typeof checkApproval>[1]['edition'];
}

/** Twelve billing periods, the first one from the contract start. */
export function priceContract({ contract, quantities, quantitySource, edition }: QuoteInput): QuotePreview {
  const periods = billingPeriods(contract.terms.start, contract.terms.billingFrequency, 12);
  const priced = periods.map((p) => pricePeriod(contract, p, quantities));
  const hasOneTime = (qp: QuotePeriod) => qp.lines.some((l) => l.type === 'ONE_TIME');
  const regular = priced.find((qp, i) => i > 0 && !hasOneTime(qp) && qp.lines.every((l) => !l.proration)) ?? priced[1]!;
  // Twelve months of billing: 12 monthly, 4 quarterly or 1 annual period(s).
  const yearPeriods = 12 / MONTHS[contract.terms.billingFrequency];
  const firstYearNet = priced.slice(0, yearPeriods).reduce((s, qp) => s + toPaisa(qp.net), 0);

  const used = new Set<UsageDimension>();
  for (const c of contract.components) {
    const dim = c.dimension ?? DEFAULT_DIMENSION[c.type];
    if (dim && c.quantity === undefined && !(c.type === 'PER_SITE' && c.siteIds)) used.add(dim);
  }

  const preview: Omit<QuotePreview, 'approval'> = {
    nonAuthoritative: true,
    firstPeriod: priced[0]!,
    nextPeriod: priced[1]!,
    regularPeriod: regular,
    schedule: priced.map((qp) => ({ start: qp.start, end: qp.end, net: qp.net, total: qp.total, oneTime: hasOneTime(qp) })),
    firstYearValue: fromPaisa(firstYearNet),
    quantities: [...used].map((dimension) => ({ dimension, value: quantities[dimension] ?? 0, source: quantitySource })),
  };
  return { ...preview, approval: checkApproval(contract, { edition, firstYearValue: preview.firstYearValue }) };
}
