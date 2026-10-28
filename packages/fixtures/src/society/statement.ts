import type { CreditNote, CustomerInvoice, InvoiceRow, Money, Statement, StatementEntry } from '@repo/contracts';
import { fromPaisa, toPaisa } from '../portal';

/**
 * Invoice read model and account statement (A4 §4, A2 §5). Stored invoices never change: what was
 * credited, what is outstanding and the settlement are derived from credit notes when read. The
 * statement is derived too; the previous balance is never an invoice line.
 */

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });

/** An invoice as read today: credits applied per line, settlement and overdue derived. */
export function readInvoice(stored: CustomerInvoice, creditNotes: readonly CreditNote[], today: string): CustomerInvoice {
  const credits = new Map<string, bigint>();
  for (const cn of creditNotes.filter((c) => c.invoiceId === stored.id)) {
    for (const l of cn.lines) credits.set(l.invoiceLineId, (credits.get(l.invoiceLineId) ?? 0n) + toPaisa(l.amount.amount));
  }
  const lines = stored.lines.map((l) => ({ ...l, credited: money(credits.get(l.id) ?? 0n) }));
  const total = toPaisa(stored.total.amount);
  const credited = [...credits.values()].reduce((s, c) => s + c, 0n);
  const allocated = toPaisa(stored.allocated.amount);
  const outstanding = total - credited - allocated;
  const settlement: CustomerInvoice['settlement'] = outstanding <= 0n ? (allocated > 0n ? 'paid' : 'credited') : allocated > 0n ? 'partially_paid' : 'unpaid';
  return { ...stored, lines, credited: money(credited), outstanding: money(outstanding), settlement, overdue: outstanding > 0n && stored.dueOn < today };
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
 * Statement of one billing account between two dates. With `payerPartyId`, only the lines that
 * party is liable for count (per-unit liability): a tenant-payer never sees the owner's flats.
 */
export function statementOf(input: {
  accountId: string;
  accountNo: string;
  holderName: string;
  invoices: readonly CustomerInvoice[];
  creditNotes: readonly CreditNote[];
  from: string;
  to: string;
  payer?: { partyId: string; name: string };
  /** Restricted to one flat's lines (Flat 360), whoever was liable for each period. */
  flat?: { id: string; code: string };
}): Statement {
  const { invoices, creditNotes, from, to, payer, flat } = input;
  const lineOk = (l: { payerPartyId: string; unitId: string }) => (!payer || l.payerPartyId === payer.partyId) && (!flat || l.unitId === flat.id);
  const lineIds = new Set<string>();
  const movements: Array<Omit<StatementEntry, 'balance'> & { delta: bigint }> = [];

  for (const inv of invoices.filter((i) => i.billingAccountId === input.accountId)) {
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
  // Same day: the charge first, then what corrects or settles it.
  const order: Record<StatementEntry['kind'], number> = { opening_balance: 0, invoice: 1, credit_note: 2, payment: 3 };
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
