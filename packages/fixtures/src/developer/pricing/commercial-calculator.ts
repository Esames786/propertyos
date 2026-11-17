import type { CommercialDiscountRule, CommercialFeeRule, CommercialPreviewLine, Money } from '@repo/contracts';

/** Strict, pure validation and money-exact calculations. No commercial rate is assumed. */
export class InvalidCommercialRule extends Error {
  constructor() { super('invalid_commercial_rule'); this.name = 'InvalidCommercialRule'; }
}
// A function declaration (not an arrow const): TypeScript narrows after a call only to a declared `never` function.
function fail(): never { throw new InvalidCommercialRule(); }
const AMOUNT = /^(0|[1-9]\d{0,11})(?:\.(\d{1,2}))?$/;
const CODE = /^[A-Z][A-Z0-9_]{1,23}$/;
const MAX_P = 10_000_000_000_000n;
export const fromPaisa = (value: bigint): Money => {
  if (value < 0n) fail();
  return { amount: `${value / 100n}.${String(value % 100n).padStart(2, '0')}`, currency: 'PKR' };
};
export const toPaisa = (value: unknown): bigint => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const r = value as Record<string, unknown>;
  if (Object.keys(r).some((key) => !['currency', 'amount'].includes(key)) ||
      r.currency !== 'PKR' || typeof r.amount !== 'string') fail();
  const matched = AMOUNT.exec(r.amount);
  if (!matched) fail();
  const cents = BigInt(matched[1]!) * 100n + BigInt((matched[2] ?? '').padEnd(2, '0') || '00');
  if (cents > MAX_P) fail();
  return cents;
};
const bpsOf = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10000) fail();
  return value as number;
};
const nameOf = (value: unknown): string => {
  if (typeof value !== 'string') fail();
  const s = value.trim().replace(/\s+/g, ' ');
  if (s.length < 3 || s.length > 80) fail();
  return s;
};
const codeOf = (value: unknown, seen: Set<string>): string => {
  if (typeof value !== 'string' || !CODE.test(value) || seen.has(value)) fail();
  seen.add(value);
  return value;
};
export function validateCommercialRules(rawFees: unknown, rawDiscounts: unknown): {
  fees: CommercialFeeRule[]; discounts: CommercialDiscountRule[];
} {
  if (!Array.isArray(rawFees) || !Array.isArray(rawDiscounts) ||
      rawFees.length > 16 || rawDiscounts.length > 16 || !rawFees.length && !rawDiscounts.length) fail();
  const seen = new Set<string>();
  const fees: CommercialFeeRule[] = rawFees.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
    const v = raw as Record<string, unknown>;
    if (Object.keys(v).some((k) => !['code', 'label', 'mode', 'amount', 'rateBps'].includes(k))) fail();
    const code = codeOf(v.code, seen), label = nameOf(v.label);
    if (v.mode === 'fixed') {
      if (v.rateBps !== undefined) fail();
      return { code, label, mode: 'fixed', amount: fromPaisa(toPaisa(v.amount)) };
    }
    if (v.mode === 'rate_bps') {
      if (v.amount !== undefined) fail();
      return { code, label, mode: 'rate_bps', rateBps: bpsOf(v.rateBps) };
    }
    return fail();
  });
  const discounts: CommercialDiscountRule[] = rawDiscounts.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail();
    const v = raw as Record<string, unknown>;
    if (Object.keys(v).some((k) => !['code', 'label', 'rateBps', 'maxAmount'].includes(k))) fail();
    return {
      code: codeOf(v.code, seen), label: nameOf(v.label), rateBps: bpsOf(v.rateBps),
      maxAmount: fromPaisa(toPaisa(v.maxAmount)),
    };
  });
  // Order is semantically relevant to UI presentation, but duplicate codes never pass.
  return { fees, discounts };
}
/** Preview uses the unmodified fictional listed price as every BPS calculation basis. */
export function previewCommercial(listedPrice: Money, fees: CommercialFeeRule[], discounts: CommercialDiscountRule[]) {
  const base = toPaisa(listedPrice);
  let feeTotal = 0n, discountTotal = 0n;
  const lines: CommercialPreviewLine[] = [];
  for (const fee of fees) {
    const amount = fee.mode === 'fixed' ? toPaisa(fee.amount) : base * BigInt(bpsOf(fee.rateBps)) / 10000n;
    feeTotal += amount;
    if (feeTotal > MAX_P) fail();
    lines.push({ code: fee.code, label: fee.label, kind: 'fee', amount: fromPaisa(amount) });
  }
  for (const discount of discounts) {
    const raw = base * BigInt(bpsOf(discount.rateBps)) / 10000n;
    const max = toPaisa(discount.maxAmount);
    const amount = raw < max ? raw : max;
    discountTotal += amount;
    lines.push({ code: discount.code, label: discount.label, kind: 'discount', amount: fromPaisa(amount) });
  }
  if (discountTotal > MAX_P || base + feeTotal > MAX_P) fail(); // Defensive bound on total illustrative exposure.
  if (discountTotal > base + feeTotal) fail(); // Never silently clamp an excessive discount.
  return {
    lines, totalFees: fromPaisa(feeTotal), totalDiscounts: fromPaisa(discountTotal),
    illustrativePayable: fromPaisa(base + feeTotal - discountTotal),
  };
}
