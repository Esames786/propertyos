import type { Money, PlanAllocationInput, PlanAllocationKind, PlanPreviewRow } from '@repo/contracts';

/**
 * Pure fixed-decimal calculator for the fictional E.3 plan preview.
 * JavaScript money floats, implicit due dates, rounding loss and a negative
 * "last payment" are deliberately impossible here.
 */
export class InvalidPlanError extends Error {
  constructor() {
    super('invalid_plan');
    this.name = 'InvalidPlanError';
  }
}

const KINDS = new Set<PlanAllocationKind>(['down_payment', 'instalments', 'on_possession', 'balloon', 'construction_linked']);
const AMOUNT = /^(0|[1-9]\d{0,17})(?:\.(\d{1,2}))?$/;
const MILESTONE = /^[A-Za-z][A-Za-z0-9_-]{1,39}$/;
const invalid = (): never => { throw new InvalidPlanError(); };

function paisa(value: string): bigint {
  const match = AMOUNT.exec(value);
  if (!match) invalid();
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '00');
}

function money(value: bigint): Money {
  if (value < 0n) invalid();
  return { amount: `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`, currency: 'PKR' };
}

function allocationsOf(raw: unknown): PlanAllocationInput[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 24) invalid();
  let total = 0;
  let rows = 0;
  const items: PlanAllocationInput[] = [];
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) invalid();
    const value = candidate as Record<string, unknown>;
    if (typeof value.kind !== 'string' || !KINDS.has(value.kind as PlanAllocationKind)) invalid();
    if (!Number.isSafeInteger(value.shareBps) || (value.shareBps as number) < 0 || (value.shareBps as number) > 10000) invalid();
    if (Object.keys(value).some((key) => !['kind', 'shareBps', 'count', 'milestoneKey'].includes(key))) invalid();
    const kind = value.kind as PlanAllocationKind;
    const count = kind === 'instalments' ? value.count : 1;
    if (kind === 'instalments') {
      if (!Number.isSafeInteger(count) || (count as number) < 1 || (count as number) > 36 || value.milestoneKey !== undefined) invalid();
    } else if (value.count !== undefined) invalid();
    if (kind === 'construction_linked') {
      if (typeof value.milestoneKey !== 'string' || !MILESTONE.test(value.milestoneKey)) invalid();
    } else if (value.milestoneKey !== undefined) invalid();
    rows += count as number;
    total += value.shareBps as number;
    if (rows > 120 || total > 10000) invalid();
    items.push({
      kind,
      shareBps: value.shareBps as number,
      ...(kind === 'instalments' ? { count: count as number } : {}),
      ...(kind === 'construction_linked' ? { milestoneKey: value.milestoneKey as string } : {}),
    });
  }
  if (total !== 10000) invalid();
  return items;
}

/**
 * Allocate shares to the cent. Floor every component except the last nonzero
 * share, which receives the remaining rounding cents. A zero-percent line is
 * always exactly Rs 0.00 (even when it is the final display line).
 *
 * Split each instalment segment evenly in paisa; the final instalment
 * receives its segment's remainder. Display rows remain in input order.
 */
export function calculatePlanPreview(total: Money, untrusted: unknown): {
  lines: PlanPreviewRow[];
  totalAllocated: Money;
  difference: Money;
} {
  if (total.currency !== 'PKR') invalid();
  const totalPaisa = paisa(total.amount);
  const allocations = allocationsOf(untrusted);
  const lastNonzero = allocations.findLastIndex((line) => line.shareBps > 0);
  if (lastNonzero < 0) invalid();
  let consumed = 0n;
  const lines: PlanPreviewRow[] = [];

  for (const [position, allocation] of allocations.entries()) {
    const share = allocation.shareBps;
    const amount = position === lastNonzero
      ? totalPaisa - consumed
      : (totalPaisa * BigInt(share)) / 10000n;
    if (amount < 0n) invalid();
    consumed += amount;
    const count = allocation.kind === 'instalments' ? allocation.count! : 1;
    const each = amount / BigInt(count);
    for (let index = 0; index < count; index++) {
      lines.push({
        rowKey: `${position + 1}:${index + 1}`,
        kind: allocation.kind,
        shareBps: share,
        amount: money(index === count - 1 ? amount - each * BigInt(count - 1) : each),
        ...(allocation.kind === 'instalments' ? { instalmentNumber: index + 1, instalmentCount: count } : {}),
        ...(allocation.milestoneKey ? { milestoneKey: allocation.milestoneKey } : {}),
      });
    }
  }

  if (consumed !== totalPaisa) invalid();
  return { lines, totalAllocated: money(consumed), difference: money(totalPaisa - consumed) };
}
