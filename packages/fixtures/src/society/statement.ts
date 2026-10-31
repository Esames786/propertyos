import type { CollectionPayment, CreditNote, CustomerInvoice, InvoiceRow, Money, Statement, StatementEntry } from '@repo/contracts';
import { fromPaisa, toPaisa } from '../portal';

/**
 * Invoice read model and account statement (A4 §4, A2 §5). Stored invoices never change: what was
 * credited, what payments settled, what is outstanding and the settlement are derived when read
 * from credit notes and payment allocations. The statement is derived too; the previous balance is
 * never an invoice line, and a payment is one movement of its whole amount (unapplied credit shows
 * as a balance below zero, never as a reduced charge).
 */

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });

/**
 * Allocated amount per invoice line across every payment (including credit applied later). A
 * reversed payment (Gate S.1) settles nothing any more: its lines reopen, its history stays.
 */
export function allocatedByLine(payments: readonly CollectionPayment[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const p of payments) if (!p.reversal) for (const a of p.allocations) out.set(a.lineId, (out.get(a.lineId) ?? 0n) + toPaisa(a.amount.amount));
  return out;
}

/** An invoice as read today: credits and payments applied per line, settlement and overdue derived. */
export function readInvoice(stored: CustomerInvoice, creditNotes: readonly CreditNote[], today: string, allocated: ReadonlyMap<string, bigint> = new Map()): CustomerInvoice {
  const credits = new Map<string, bigint>();
  for (const cn of creditNotes.filter((c) => c.invoiceId === stored.id)) {
    for (const l of cn.lines) credits.set(l.invoiceLineId, (credits.get(l.invoiceLineId) ?? 0n) + toPaisa(l.amount.amount));
  }
  const lines = stored.lines.map((l) => ({ ...l, credited: money(credits.get(l.id) ?? 0n), allocated: money(allocated.get(l.id) ?? 0n) }));
  const total = toPaisa(stored.total.amount);
  const credited = lines.reduce((s, l) => s + toPaisa(l.credited.amount), 0n);
  const paid = lines.reduce((s, l) => s + toPaisa(l.allocated.amount), 0n);
  const outstanding = total - credited - paid;
  const settlement: CustomerInvoice['settlement'] = outstanding <= 0n ? (paid > 0n ? 'paid' : 'credited') : paid > 0n ? 'partially_paid' : 'unpaid';
  return { ...stored, lines, credited: money(credited), allocated: money(paid), outstanding: money(outstanding), settlement, overdue: outstanding > 0n && stored.dueOn < today };
}

export function invoiceRow(i: CustomerInvoice): InvoiceRow {
  return {
    id: i.id,
    ref: i.ref,
    source: i.source,
    period: i.period,
    accountNo: i.accountNo,
    billingAccountId: i.billingAccountId,
    flats: [...new Set(i.lines.map((l) => l.unitCode))],
    payerName: i.payerName,
    total: i.total,
    credited: i.credited,
    outstanding: i.outstanding,
    settlement: i.settlement,
    issuedOn: i.issuedOn,
    dueOn: i.dueOn,
    overdue: i.overdue,
  };
}

/**
 * Statement of one billing account between two dates. With `payer`, only the lines that party is
 * liable for and the payments they made count (per-unit liability): a tenant-payer never sees the
 * owner's flats. With `flat`, only that flat's lines and the parts of payments allocated to them.
 */
export function statementOf(input: {
  accountId: string;
  accountNo: string;
  holderName: string;
  invoices: readonly CustomerInvoice[];
  creditNotes: readonly CreditNote[];
  payments?: readonly CollectionPayment[];
  from: string;
  to: string;
  payer?: { partyId: string; name: string };
  /** Restricted to one flat's lines (Flat 360), whoever was liable for each period. */
  flat?: { id: string; code: string };
}): Statement {
  const { invoices, creditNotes, from, to, payer, flat } = input;
  const lineOk = (l: { payerPartyId: string; unitId: string; billingAccountId: string }) =>
    l.billingAccountId === input.accountId && (!payer || l.payerPartyId === payer.partyId) && (!flat || l.unitId === flat.id);
  const lineIds = new Set<string>();
  const movements: Array<Omit<StatementEntry, 'balance'> & { delta: bigint }> = [];

  for (const inv of invoices) {
    const lines = inv.lines.filter(lineOk);
    if (!lines.length) continue;
    lines.forEach((l) => lineIds.add(l.id));
    const amount = lines.reduce((s, l) => s + toPaisa(l.amount.amount), 0n);
    movements.push({
      on: inv.issuedOn,
      kind: inv.source === 'opening_balance' ? 'opening_balance' : 'invoice',
      ref: inv.ref,
      refId: inv.id,
      period: inv.period,
      flats: [...new Set(lines.map((l) => l.unitCode))],
      payerName: lines[0]!.payerName,
      debit: money(amount),
      delta: amount,
    });
  }
  for (const cn of creditNotes.filter((c) => c.billingAccountId === input.accountId)) {
    const lines = cn.lines.filter((l) => lineIds.has(l.invoiceLineId));
    if (!lines.length) continue;
    const amount = lines.reduce((s, l) => s + toPaisa(l.amount.amount), 0n);
    movements.push({ on: cn.on, kind: 'credit_note', ref: cn.ref, refId: cn.id, flats: [...new Set(lines.map((l) => l.unitCode))], credit: money(amount), delta: -amount });
  }
  for (const p of (input.payments ?? []).filter((x) => x.billingAccountId === input.accountId)) {
    if (payer && p.payerPartyId !== payer.partyId) continue;
    // One flat: the part of the payment settling that flat's lines (unapplied credit belongs to no flat).
    const amount = flat ? p.allocations.filter((a) => lineIds.has(a.lineId)).reduce((s, a) => s + toPaisa(a.amount.amount), 0n) : toPaisa(p.amount.amount);
    if (amount <= 0n) continue;
    movements.push({
      on: p.receivedOn,
      kind: 'payment',
      ref: p.receiptRef,
      refId: p.id,
      flats: [...new Set(p.allocations.filter((a) => !flat || lineIds.has(a.lineId)).map((a) => a.unitCode))],
      payerName: p.payerName,
      method: p.method,
      credit: money(amount),
      delta: -amount,
    });
    // Gate S.1: a reversal is its own movement on its own date; the payment line above never changes.
    if (p.reversal) {
      movements.push({
        on: p.reversal.on,
        kind: 'payment_reversal',
        ref: p.reversal.approvalRef,
        refId: p.id,
        flats: [...new Set(p.allocations.filter((a) => !flat || lineIds.has(a.lineId)).map((a) => a.unitCode))],
        payerName: p.payerName,
        method: p.method,
        debit: money(amount),
        delta: amount,
      });
    }
  }
  // Same day: the charge first, then what corrects or settles it.
  const order: Record<StatementEntry['kind'], number> = { opening_balance: 0, invoice: 1, credit_note: 2, payment: 3, payment_reversal: 4 };
  movements.sort((a, b) => a.on.localeCompare(b.on) || order[a.kind] - order[b.kind] || a.ref.localeCompare(b.ref));

  const previous = movements.filter((m) => m.on < from).reduce((s, m) => s + m.delta, 0n);
  let balance = previous;
  let charges = 0n;
  let credits = 0n;
  const entries: StatementEntry[] = [];
  for (const m of movements.filter((x) => x.on >= from && x.on <= to)) {
    balance += m.delta;
    if (m.delta > 0n) charges += m.delta;
    else credits -= m.delta;
    const { delta: _delta, ...entry } = m;
    entries.push({ ...entry, balance: money(balance) });
  }
  return {
    billingAccountId: input.accountId,
    accountNo: input.accountNo,
    holderName: input.holderName,
    ...(payer ? { payer } : {}),
    ...(flat ? { flat } : {}),
    from,
    to,
    previousBalance: money(previous),
    entries,
    periodCharges: money(charges),
    periodCredits: money(credits),
    closingBalance: money(balance),
  };
}
