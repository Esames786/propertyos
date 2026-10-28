import type { AllocationLine, CustomerInvoice, Money, PaymentAllocation } from '@repo/contracts';
import { fromPaisa, toPaisa } from '../portal';

/**
 * Payment allocation (A4 §6, I-5, I-10). Pure and deterministic. A payment settles only open lines
 * the paying party is liable for, issued by the same legal entity, on the same billing account:
 * never another payer's flat on a shared account, never another association's invoice. The site
 * rule is oldest first (due date, then issue date, then reference, then line order); whatever is
 * left is unapplied credit. An edited allocation is checked against the same boundaries.
 */

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });

export interface OpenLine {
  invoiceId: string;
  invoiceRef: string;
  lineId: string;
  unitId: string;
  unitCode: string;
  period: string;
  kind: 'charge' | 'opening_balance';
  category?: AllocationLine['category'];
  source: CustomerInvoice['source'];
  dueOn: string;
  issuedOn: string;
  legalEntityId: string;
  billingAccountId: string;
  payerPartyId: string;
  /** Open amount in paisa (charged − credited − already allocated). */
  open: bigint;
}

export interface Payer {
  partyId: string;
  legalEntityId: string;
  billingAccountId: string;
}

/** Every line of the invoices as read (credits and allocations applied), with its liability facts. */
export function linesOf(invoices: readonly CustomerInvoice[]): OpenLine[] {
  return invoices.flatMap((i) =>
    i.lines.map((l) => ({
      invoiceId: i.id,
      invoiceRef: i.ref,
      lineId: l.id,
      unitId: l.unitId,
      unitCode: l.unitCode,
      period: l.period,
      kind: l.kind,
      ...(l.category ? { category: l.category } : {}),
      source: i.source,
      dueOn: i.dueOn,
      issuedOn: i.issuedOn,
      legalEntityId: i.legalEntityId,
      billingAccountId: l.billingAccountId,
      payerPartyId: l.payerPartyId,
      open: toPaisa(l.amount.amount) - toPaisa(l.credited.amount) - toPaisa(l.allocated.amount),
    })),
  );
}

const oldestFirst = (a: OpenLine, b: OpenLine) => a.dueOn.localeCompare(b.dueOn) || a.issuedOn.localeCompare(b.issuedOn) || a.invoiceRef.localeCompare(b.invoiceRef);

/** The payer's open lines on the account, oldest first (stable within an invoice: line order kept). */
export function openLinesFor(lines: readonly OpenLine[], payer: Payer): OpenLine[] {
  return lines
    .map((l, index) => ({ l, index }))
    .filter(({ l }) => l.open > 0n && l.payerPartyId === payer.partyId && l.legalEntityId === payer.legalEntityId && l.billingAccountId === payer.billingAccountId)
    .sort((a, b) => oldestFirst(a.l, b.l) || a.index - b.index)
    .map(({ l }) => l);
}

export interface Allocation {
  line: OpenLine;
  amount: bigint;
}

/** Oldest first: each line takes what is left of the payment up to its open amount. */
export function allocateOldestFirst(amount: bigint, open: readonly OpenLine[]): { allocations: Allocation[]; unapplied: bigint } {
  let left = amount;
  const allocations: Allocation[] = [];
  for (const line of open) {
    if (left <= 0n) break;
    const take = line.open < left ? line.open : left;
    if (take > 0n) allocations.push({ line, amount: take });
    left -= take;
  }
  return { allocations, unapplied: left };
}

export type AllocationProblem = 'cross_payer_forbidden' | 'cross_entity_forbidden' | 'cross_account_forbidden' | 'line_unknown' | 'line_not_open' | 'over_line' | 'over_amount' | 'not_positive';

/**
 * Check an edited allocation. `all` is every line the tenant has (so a line of another payer or
 * entity is recognised and refused with its own reason, never silently dropped).
 */
export function checkAllocation(
  proposed: ReadonlyArray<{ lineId: string; amount: bigint }>,
  amount: bigint,
  all: readonly OpenLine[],
  payer: Payer,
): { ok: true; allocations: Allocation[]; unapplied: bigint } | { ok: false; problem: AllocationProblem; lineId?: string } {
  let total = 0n;
  const allocations: Allocation[] = [];
  const seen = new Set<string>();
  for (const p of proposed) {
    if (p.amount === 0n) continue;
    if (p.amount < 0n) return { ok: false, problem: 'not_positive', lineId: p.lineId };
    const line = all.find((l) => l.lineId === p.lineId);
    if (!line) return { ok: false, problem: 'line_unknown', lineId: p.lineId };
    if (line.legalEntityId !== payer.legalEntityId) return { ok: false, problem: 'cross_entity_forbidden', lineId: p.lineId };
    if (line.payerPartyId !== payer.partyId) return { ok: false, problem: 'cross_payer_forbidden', lineId: p.lineId };
    if (line.billingAccountId !== payer.billingAccountId) return { ok: false, problem: 'cross_account_forbidden', lineId: p.lineId };
    if (seen.has(p.lineId)) return { ok: false, problem: 'line_unknown', lineId: p.lineId };
    seen.add(p.lineId);
    if (line.open <= 0n) return { ok: false, problem: 'line_not_open', lineId: p.lineId };
    if (p.amount > line.open) return { ok: false, problem: 'over_line', lineId: p.lineId };
    total += p.amount;
    allocations.push({ line, amount: p.amount });
  }
  if (total > amount) return { ok: false, problem: 'over_amount' };
  return { ok: true, allocations, unapplied: amount - total };
}

/** Whether an allocation is the site rule's own proposal (an edited one needs a reason). */
export function isRuleAllocation(allocations: readonly Allocation[], amount: bigint, open: readonly OpenLine[]): boolean {
  const rule = allocateOldestFirst(amount, open).allocations;
  const key = (a: readonly Allocation[]) => a.map((x) => `${x.line.lineId}:${x.amount}`).sort().join('|');
  return key(rule) === key(allocations);
}

export const toPaymentAllocations = (allocations: readonly Allocation[], appliedAt?: string): PaymentAllocation[] =>
  allocations.map(({ line, amount }) => ({
    invoiceId: line.invoiceId,
    invoiceRef: line.invoiceRef,
    lineId: line.lineId,
    unitId: line.unitId,
    unitCode: line.unitCode,
    period: line.period,
    kind: line.kind,
    ...(line.category ? { category: line.category } : {}),
    amount: money(amount),
    ...(appliedAt ? { appliedAt } : {}),
  }));

export const toAllocationLines = (allocations: ReadonlyArray<{ line: OpenLine; amount: bigint }>): AllocationLine[] =>
  allocations.map(({ line, amount }) => ({
    invoiceId: line.invoiceId,
    invoiceRef: line.invoiceRef,
    lineId: line.lineId,
    unitId: line.unitId,
    unitCode: line.unitCode,
    period: line.period,
    kind: line.kind,
    ...(line.category ? { category: line.category } : {}),
    source: line.source,
    dueOn: line.dueOn,
    open: money(line.open),
    amount: money(amount),
  }));
