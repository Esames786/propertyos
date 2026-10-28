import type {
  BillingRunAction,
  BillingRunItem,
  BillingRunState,
  BillingRunTotals,
  ChargeCategoryKey,
  ChargeRule,
  CustomerInvoice,
  Exemption,
  FlatFact,
  InvoiceLine,
  Money,
  UnitTypeCode,
} from '@repo/contracts';
import { fromPaisa, toPaisa } from '../portal';
import { pad } from '../seed';
import { resolveCharges, totalOf } from './charges';
import { fingerprint } from './import';
import { payerOn, periodStart, type SocietyModel } from './model';

/**
 * Billing run engine (A4 §3). The state machine, the assessment snapshot and posting are pure;
 * the mock server only stores what they return. Posting is idempotent: each line carries
 * hash(site, account, flat, period, rule, posting version), and a line already posted is never
 * posted again (I-7). One invoice per billing account and responsible payer: an account covering
 * flats with different payers gives each payer their own invoice (per-unit liability, A2 §4.5).
 */

/** Which states each action may start from (A4 §3 diagram). */
export const ALLOWED_FROM: Record<BillingRunAction, readonly BillingRunState[]> = {
  preview: ['DRAFT', 'PREVIEWED'],
  submit: ['PREVIEWED'],
  return: ['APPROVAL_PENDING'],
  approve: ['APPROVAL_PENDING'],
  post: ['APPROVED'],
  notify: ['POSTED'],
  cancel: ['DRAFT', 'PREVIEWED', 'APPROVAL_PENDING'],
};

export const STATE_AFTER: Record<BillingRunAction, BillingRunState> = {
  preview: 'PREVIEWED',
  submit: 'APPROVAL_PENDING',
  return: 'PREVIEWED',
  approve: 'APPROVED',
  post: 'POSTED',
  notify: 'NOTIFIED',
  cancel: 'CANCELLED',
};

/** A run that still blocks another run for the same site and period. */
export const isOpen = (state: BillingRunState) => state !== 'CANCELLED';
/** Posted runs are read-only (corrections are credit notes). */
export const isPosted = (state: BillingRunState) => state === 'POSTED' || state === 'NOTIFIED';

export const canStart = (action: BillingRunAction, state: BillingRunState) => ALLOWED_FROM[action].includes(state);

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });

export const lineKey = (siteId: string, accountId: string, flatId: string, period: string, ruleId: string, postingVersion: number) =>
  fingerprint([siteId, accountId, flatId, period, ruleId, postingVersion].join('|'));

export interface Assessment {
  items: BillingRunItem[];
  totals: BillingRunTotals;
  /** Fingerprint of everything the preview depends on; a change makes the preview stale. */
  hash: string;
}

/** Assess every flat for a period (the preview snapshot): lines, winning rule, exemption, payer. */
export function assess(input: { model: SocietyModel; facts: readonly FlatFact[]; rules: readonly ChargeRule[]; exemptions: readonly Exemption[]; period: string; postingVersion: number; runId: string }): Assessment {
  const { model, facts, rules, exemptions, period, postingVersion, runId } = input;
  const on = periodStart(period);
  const items: BillingRunItem[] = model.flats.map((flat) => {
    const account = model.accounts.find((a) => a.id === flat.billingAccountId)!;
    const payer = payerOn(facts, flat.id, on);
    const lines = resolveCharges(flat, rules, exemptions, period);
    const total = totalOf(lines);
    const keyParts = [flat.siteId, account.id, flat.id, period, lines.map((l) => l.winner.id).join('+'), postingVersion].join('|');
    return {
      id: `${runId}_${flat.code.replace('-', '').toLowerCase()}`,
      unitId: flat.id,
      unitCode: flat.code,
      buildingCode: flat.code.split('-')[0]!,
      type: (model.types.find((t) => t.id === flat.typeId)?.code ?? 'standard') as UnitTypeCode,
      occupancy: flat.occupancy,
      billingAccountId: account.id,
      accountNo: account.accountNo,
      payerPartyId: payer?.partyId ?? '',
      payerName: payer?.partyName ?? '',
      lines,
      total: money(total),
      exempt: lines.length > 0 && total === 0n && lines.some((l) => l.exemption),
      idempotencyKey: fingerprint(keyParts),
    };
  });
  return { items, totals: totalsOf(items), hash: assessmentHash(items) };
}

export function assessmentHash(items: readonly BillingRunItem[]): string {
  return fingerprint(JSON.stringify(items.map((i) => [i.unitId, i.billingAccountId, i.payerPartyId, i.lines.map((l) => [l.category, l.amount.amount, l.winner.id, l.exemption?.id ?? ''])])));
}

const billable = (i: BillingRunItem) => toPaisa(i.total.amount) > 0n;
const groupKey = (i: BillingRunItem) => `${i.billingAccountId}|${i.payerPartyId}`;

export function totalsOf(items: readonly BillingRunItem[]): BillingRunTotals {
  const billed = items.filter(billable);
  const byCategory = new Map<ChargeCategoryKey, { amount: bigint; flats: number }>();
  for (const i of billed) {
    for (const l of i.lines) {
      const c = byCategory.get(l.category) ?? { amount: 0n, flats: 0 };
      const a = toPaisa(l.amount.amount);
      byCategory.set(l.category, { amount: c.amount + a, flats: c.flats + (a > 0n ? 1 : 0) });
    }
  }
  const byType = new Map<UnitTypeCode, { amount: bigint; flats: number }>();
  for (const i of billed) {
    const t = byType.get(i.type) ?? { amount: 0n, flats: 0 };
    byType.set(i.type, { amount: t.amount + toPaisa(i.total.amount), flats: t.flats + 1 });
  }
  return {
    invoices: new Set(billed.map(groupKey)).size,
    flats: billed.length,
    exempt: items.filter((i) => i.exempt).length,
    accounts: new Set(billed.map((i) => i.billingAccountId)).size,
    amount: money(billed.reduce((s, i) => s + toPaisa(i.total.amount), 0n)),
    byCategory: [...byCategory].map(([category, v]) => ({ category, amount: money(v.amount), flats: v.flats })),
    byType: [...byType].map(([type, v]) => ({ type, amount: money(v.amount), flats: v.flats })),
  };
}

export interface PostContext {
  run: { id: string; ref: string; siteId: string; period: string; postingVersion: number; issueDate: string; dueDate: string };
  legalEntity: { id: string; name: string };
  /** Every invoice already posted for the site (to find lines posted before). */
  posted: readonly CustomerInvoice[];
}

/**
 * Post a run's items as invoices. Returns the run's invoices: those created now and those found
 * already posted for the same lines (a retry, a double click or a repeated request creates nothing).
 */
export function post(items: readonly BillingRunItem[], ctx: PostContext): { created: CustomerInvoice[]; invoiceIds: string[]; itemInvoices: Record<string, { id: string; ref: string }> } {
  const { run } = ctx;
  const byLineKey = new Map<string, CustomerInvoice>();
  for (const inv of ctx.posted) for (const l of inv.lines) byLineKey.set(l.idempotencyKey, inv);
  let sequence = ctx.posted.filter((i) => i.source === 'billing_run' && i.period === run.period).length;

  const groups = new Map<string, BillingRunItem[]>();
  for (const item of items.filter(billable)) {
    const k = groupKey(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }

  const created: CustomerInvoice[] = [];
  const invoiceIds: string[] = [];
  const itemInvoices: Record<string, { id: string; ref: string }> = {};
  for (const group of groups.values()) {
    const lines: InvoiceLine[] = group.flatMap((item) =>
      item.lines
        .filter((l) => toPaisa(l.amount.amount) > 0n)
        .map((l) => {
          const key = lineKey(run.siteId, item.billingAccountId, item.unitId, run.period, l.winner.id, run.postingVersion);
          return {
            id: `iln_${key}`,
            kind: 'charge' as const,
            category: l.category,
            unitId: item.unitId,
            unitCode: item.unitCode,
            period: run.period,
            amount: l.amount,
            credited: money(0n),
            sourceType: 'billing_run' as const,
            sourceId: item.id,
            postingVersion: run.postingVersion,
            idempotencyKey: key,
            payerPartyId: item.payerPartyId,
            payerName: item.payerName,
            rule: l.winner,
          };
        }),
    );
    const already = lines.map((l) => byLineKey.get(l.idempotencyKey)).find((i) => i !== undefined);
    if (already) {
      if (!invoiceIds.includes(already.id)) invoiceIds.push(already.id);
      for (const item of group) itemInvoices[item.id] = { id: already.id, ref: already.ref };
      continue;
    }
    sequence += 1;
    const first = group[0]!;
    const total = lines.reduce((s, l) => s + toPaisa(l.amount.amount), 0n);
    const ref = `ANR-INV-${run.period.replace('-', '')}-${pad(sequence, 4)}`;
    const invoice: CustomerInvoice = {
      id: `cin_${run.period.replace('-', '')}_${pad(sequence, 4)}_v${run.postingVersion}`,
      ref,
      legalEntityId: ctx.legalEntity.id,
      legalEntityName: ctx.legalEntity.name,
      siteId: run.siteId,
      billingAccountId: first.billingAccountId,
      accountNo: first.accountNo,
      payerPartyId: first.payerPartyId,
      payerName: first.payerName,
      source: 'billing_run',
      runId: run.id,
      runRef: run.ref,
      period: run.period,
      issuedOn: run.issueDate,
      dueOn: run.dueDate,
      issuance: 'issued',
      lines,
      total: money(total),
      credited: money(0n),
      allocated: money(0n),
      outstanding: money(total),
      settlement: 'unpaid',
      overdue: false,
    };
    for (const l of lines) byLineKey.set(l.idempotencyKey, invoice);
    created.push(invoice);
    invoiceIds.push(invoice.id);
    for (const item of group) itemInvoices[item.id] = { id: invoice.id, ref };
  }
  return { created, invoiceIds, itemInvoices };
}
