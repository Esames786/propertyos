import type {
  CollectionPayment,
  DuesBillDetail,
  DuesBills,
  DuesHome,
  DuesPayInfo,
  Money,
  PartyLink,
  PaymentSubmission,
  Receipt,
  ResidentBill,
  ResidentChargeLine,
  ResidentMethods,
  ResidentPayee,
  ResidentPosition,
  ResidentSubmissionDetail,
  ResidentSubmissionSummary,
  Statement,
  SubmitProofDuesInput,
} from '@repo/contracts';
import { ApiError } from '@repo/contracts';
import { forbid, notFound, permits, requires, type Handler, type HandlerContext } from '../handler-types';
import { fromPaisa, liabilityRecord, toPaisa } from '../portal';
import { ALNOOR_SITE, OPENING_AS_OF } from './alnoor';
import { linesOf, type OpenLine } from './allocate';
import { createSubmission, proofFile } from './collections';
import { PENDING_STATES, possibleDuplicates } from './collections-read';
import { invalidField, log, problem, save, society, stamp, type Society } from './handlers';
import { factOn } from './model';
import { beneficiaryOn } from './state';
import { statementOf } from './statement';

/**
 * Resident portal, dues edition (Gate C.2; PORTAL-001/004/005/007/008/010/028/029). A resident sees
 * only lines they are liable for, on flats their verified links reach, on each line's own date: a
 * tenant-payer never sees the owner's flats or periods, an owner never sees the tenant's charges on
 * a shared account, and another resident's records answer "not found". A proof is evidence: it
 * shows "Pending verification" until finance verifies it, never "Paid".
 */

const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });
const sum = (xs: Iterable<bigint>) => [...xs].reduce((s, v) => s + v, 0n);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

interface Resident {
  s: Society;
  partyId: string;
  name: string;
  today: string;
  links: PartyLink[];
  /** The resident's lines (liable, reachable), with their invoice. */
  lines: OpenLine[];
  payments: CollectionPayment[];
  submissions: PaymentSubmission[];
}

function resident(ctx: HandlerContext): Resident {
  const persona = ctx.persona;
  if (!persona || persona.app !== 'customer' || !persona.partyId) forbid(ctx);
  if (!ctx.data.society) notFound(ctx);
  const s = society(ctx);
  const partyId = persona.partyId;
  const scope = ctx.access?.scopes.find((x) => x.type === 'party');
  const links = scope && scope.type === 'party' ? [...scope.links] : [];
  if (!links.some((l) => permits(ctx, 'resident_portal', liabilityRecord(l, ctx.at)))) notFound(ctx);
  const person = s.view.model.people.find((p) => p.id === partyId);
  if (!person) notFound(ctx);
  // Each line on its own date: the link in force then must reach its flat and account.
  const lines = linesOf(s.view.invoices).filter(
    (l) => l.payerPartyId === partyId && permits(ctx, 'resident_portal', { unitId: l.unitId, billingAccountId: l.billingAccountId, siteId: s.siteId, legalEntityId: l.legalEntityId, asOf: l.issuedOn < l.period ? l.issuedOn : `${l.period}-01` }),
  );
  const accounts = new Set(links.map((l) => l.billingAccountId));
  return {
    s,
    partyId,
    name: person.displayName,
    today: ctx.at,
    links,
    lines,
    payments: s.state.payments.filter((p) => p.payerPartyId === partyId && accounts.has(p.billingAccountId)),
    submissions: s.state.submissions.filter((x) => x.payerPartyId === partyId && accounts.has(x.billingAccountId)),
  };
}

const lineOf = (s: Society, l: OpenLine) => s.view.invoices.find((i) => i.id === l.invoiceId)!.lines.find((x) => x.id === l.lineId)!;

function billOf(r: Resident, invoiceId: string): ResidentBill | null {
  const mine = r.lines.filter((l) => l.invoiceId === invoiceId);
  if (!mine.length) return null;
  const inv = r.s.view.invoices.find((i) => i.id === invoiceId)!;
  const lines: ResidentChargeLine[] = mine.map((l) => {
    const x = lineOf(r.s, l);
    return { lineId: l.lineId, unitCode: l.unitCode, kind: l.kind, ...(l.category ? { category: l.category } : {}), amount: x.amount, credited: x.credited, paid: x.allocated, open: money(l.open) };
  });
  const total = sum(lines.map((l) => toPaisa(l.amount.amount)));
  const credited = sum(lines.map((l) => toPaisa(l.credited.amount)));
  const paid = sum(lines.map((l) => toPaisa(l.paid.amount)));
  const open = total - credited - paid;
  return {
    invoiceId: inv.id,
    ref: inv.ref,
    period: inv.period,
    source: inv.source,
    issuedOn: inv.issuedOn,
    dueOn: inv.dueOn,
    flats: [...new Set(lines.map((l) => l.unitCode))],
    lines,
    total: money(total),
    credited: money(credited),
    paid: money(paid),
    open: money(open),
    settlement: open <= 0n ? (paid > 0n ? 'paid' : 'credited') : paid > 0n ? 'partially_paid' : 'unpaid',
    overdue: open > 0n && inv.dueOn < r.today,
  };
}

function bills(r: Resident): ResidentBill[] {
  const ids = [...new Set(r.lines.map((l) => l.invoiceId))];
  return ids
    .map((id) => billOf(r, id)!)
    .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.ref.localeCompare(a.ref));
}

function position(r: Resident): ResidentPosition {
  const all = bills(r);
  // This month's bill: the latest bill raised by a billing run (opening balances are earlier balance).
  const current = all.find((b) => b.source === 'billing_run') ?? null;
  const previous = sum(all.filter((b) => b.invoiceId !== current?.invoiceId).map((b) => toPaisa(b.open.amount)));
  const overdue = sum(all.filter((b) => b.overdue).map((b) => toPaisa(b.open.amount)));
  const credit = sum(r.payments.map((p) => toPaisa(p.unapplied.amount)));
  const due = (current ? toPaisa(current.open.amount) : 0n) + previous - credit;
  const total = due > 0n ? due : 0n;
  // Every proof not settled yet (with the office or waiting for the bank line) counts as pending, never paid.
  const pending = sum(r.submissions.filter((x) => PENDING_STATES.includes(x.state) && x.state !== 'needs_information').map((x) => toPaisa(x.current.amount.amount)));
  const status: ResidentPosition['status'] =
    total === 0n ? (current && toPaisa(current.paid.amount) > 0n ? 'paid' : 'nothing_due') : pending > 0n && pending >= total ? 'pending_verification' : current?.overdue ? 'overdue' : current && toPaisa(current.paid.amount) > 0n ? 'partially_paid' : 'unpaid';
  return {
    current,
    previousBalance: money(previous),
    credit: money(credit > 0n ? credit : 0n),
    totalPayable: money(total),
    pendingVerification: money(pending),
    overdue: money(overdue),
    status,
    ...(current ? { dueOn: current.dueOn } : {}),
  };
}

/** The verified account in force for the issuing entity (never the platform's), with this bill's reference. */
function payeeFor(r: Resident, amount: Money): ResidentPayee | null {
  const legalEntityId = r.links[0]!.legalEntityId;
  const b = beneficiaryOn(r.s.state, legalEntityId, r.today);
  if (!b) return null;
  const flat = r.lines[0]?.unitCode ?? r.s.view.model.flats.find((f) => f.id === r.links[0]!.unitId)?.code ?? '';
  const period = [...r.lines].filter((l) => l.source === 'billing_run').sort((a, z) => z.period.localeCompare(a.period))[0]?.period ?? r.today.slice(0, 7);
  const reference = b.referenceFormat.replace('{flat}', flat.replace('-', '')).replace('{period}', period);
  const previous = r.s.state.beneficiaries.some((x) => x.legalEntityId === legalEntityId && x.activeTo !== undefined && x.activeTo === b.activeFrom);
  const recently = b.activeFrom !== undefined && Date.parse(`${r.today}T00:00:00Z`) - Date.parse(`${b.activeFrom}T00:00:00Z`) <= 30 * 86_400_000;
  return {
    legalEntityName: b.legalEntityName,
    bankName: b.bankName,
    branch: b.branch,
    accountTitle: b.accountTitle,
    iban: b.iban,
    reference,
    amount,
    // Fictional payment instruction (never a real account or a real payment scheme's format).
    qrPayload: `PROPERTYOS-DEMO|NOT A REAL ACCOUNT|PAYEE=${b.accountTitle}|IBAN=${b.iban}|REF=${reference}|AMOUNT=PKR ${amount.amount}`,
    ...(b.verifiedOn ? { verifiedOn: b.verifiedOn } : {}),
    ...(previous && recently && b.activeFrom ? { changedOn: b.activeFrom } : {}),
  };
}

function methods(r: Resident): ResidentMethods {
  const rule = (m: string) => r.s.state.methods.find((x) => x.method === m);
  const cash = rule('office_cash');
  return {
    bankTransfer: rule('bank_transfer')?.enabled ?? false,
    officeCash: { enabled: cash?.enabled ?? false, ...(cash?.counter ? { counter: cash.counter } : {}), ...(cash?.maxAmount ? { maxAmount: cash.maxAmount } : {}) },
    online: { available: false, gate: 'D' },
  };
}

const submissionSummary = (x: PaymentSubmission): ResidentSubmissionSummary => ({
  id: x.id,
  ref: x.ref,
  state: x.state,
  amount: x.current.amount,
  transferDate: x.current.transferDate,
  submittedAt: x.current.submittedAt,
  ...(x.request ? { request: x.request } : {}),
  ...(x.rejectionReason ? { rejectionReason: x.rejectionReason } : {}),
  ...(x.receiptId ? { receiptId: x.receiptId, receiptRef: x.receiptRef } : {}),
});

const receiptSummaries = (r: Resident) =>
  [...r.payments].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.ref.localeCompare(a.ref)).map((p) => ({ id: p.receiptId, ref: p.receiptRef, amount: p.amount, receivedOn: p.receivedOn, method: p.method }));

function flatsOf(r: Resident): DuesHome['property']['flats'] {
  return r.links.map((l) => {
    const flat = r.s.view.model.flats.find((f) => f.id === l.unitId)!;
    const roles = r.s.view.facts.filter((f) => f.flatId === l.unitId && f.partyId === r.partyId && factOn(f, r.today)).map((f) => f.role);
    return { id: flat.id, code: flat.code, role: roles.includes('payer') ? 'payer' : roles.includes('occupant') ? 'occupant' : 'owner' };
  });
}

function submissionOf(ctx: HandlerContext, r: Resident): PaymentSubmission {
  const x = r.submissions.find((y) => y.id === ctx.params.submissionId);
  if (!x) notFound(ctx);
  return x;
}

/** Validated proof details (the server never trusts the form). */
function proofInput(ctx: HandlerContext, today: string) {
  const input = (ctx.req.body ?? {}) as Partial<SubmitProofDuesInput> & { confirmDuplicate?: boolean };
  const errors: Record<string, Array<{ code: string; params?: Record<string, string> }>> = {};
  const amount = String(input.amount ?? '').trim().replace(/,/g, '');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount) || toPaisa(amount) <= 0n) errors.amount = [{ code: 'collections:problems.amount' }];
  const transferDate = String(input.transferDate ?? '');
  if (!DATE.test(transferDate)) errors.transferDate = [{ code: 'forms:errors.dateRequired' }];
  else if (transferDate > today) errors.transferDate = [{ code: 'collections:problems.dateFuture' }];
  else if (transferDate < OPENING_AS_OF.slice(0, 8) + '01') errors.transferDate = [{ code: 'collections:problems.dateTooOld' }];
  const bankReference = String(input.bankReference ?? '').trim().slice(0, 60);
  if (bankReference.length < 4) errors.bankReference = [{ code: 'collections:problems.reference' }];
  const f = input.file;
  if (!f || !f.name) errors.file = [{ code: 'collections:problems.fileRequired' }];
  else if (!FILE_TYPES.includes(String(f.type))) errors.file = [{ code: 'collections:problems.fileType' }];
  else if (!(Number(f.size) > 0) || Number(f.size) > MAX_PROOF_BYTES) errors.file = [{ code: 'collections:problems.fileSize' }];
  const note = String(input.note ?? '').trim().slice(0, 300);
  const payerBank = String(input.payerBank ?? '').trim().slice(0, 60);
  if (Object.keys(errors).length) problem(ctx, 422, 'validation_failed', 'errors:validation.summary', errors);
  return {
    version: { amount: { amount: fromPaisa(toPaisa(amount)), currency: 'PKR' as const }, transferDate, bankReference, file: proofFile({ name: String(f!.name).slice(0, 120), type: String(f!.type), size: Number(f!.size) }), ...(note ? { note } : {}), ...(payerBank ? { payerBank } : {}) },
    confirmDuplicate: input.confirmDuplicate === true,
  };
}

const RESIDENT = (cls: 'history_read' | 'settlement') => requires('resident_portal', 'portal.use', cls);

export const DUES_PORTAL_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/portal\/dues\/home$/,
    access: RESIDENT('history_read'),
    handle: (ctx): DuesHome => {
      const r = resident(ctx);
      const pos = position(r);
      const flats = flatsOf(r);
      const first = r.s.view.model.flats.find((f) => f.id === r.links[0]!.unitId)!;
      const account = r.s.view.model.accounts.find((a) => a.id === r.links[0]!.billingAccountId)!;
      return {
        resident: { partyId: r.partyId, name: r.name },
        property: { tenantName: ctx.access!.tenant.id === 'tnt_alnoor' ? 'Al-Noor Residency (Demo)' : '', siteName: ALNOOR_SITE.name, legalEntityName: r.s.view.invoices[0]?.legalEntityName ?? '', buildingName: r.s.view.model.buildings.find((b) => b.id === first.buildingId)!.name, flats, accountNo: account.accountNo },
        position: pos,
        payee: payeeFor(r, pos.totalPayable),
        methods: methods(r),
        submissions: [...r.submissions].sort((a, b) => b.current.submittedAt.localeCompare(a.current.submittedAt)).slice(0, 5).map(submissionSummary),
        receipts: receiptSummaries(r).slice(0, 5),
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/dues\/bills$/,
    access: RESIDENT('history_read'),
    handle: (ctx): DuesBills => {
      const r = resident(ctx);
      return {
        position: position(r),
        bills: bills(r),
        submissions: [...r.submissions].sort((a, b) => b.current.submittedAt.localeCompare(a.current.submittedAt)).map(submissionSummary),
        receipts: receiptSummaries(r),
        payments: [...r.payments]
          .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn))
          .map((p) => ({ id: p.id, ref: p.ref, amount: p.amount, receivedOn: p.receivedOn, method: p.method, receiptId: p.receiptId, receiptRef: p.receiptRef, allocated: money(sum(p.allocations.map((a) => toPaisa(a.amount.amount)))), unapplied: p.unapplied })),
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/dues\/bills\/(?<invoiceId>[\w-]+)$/,
    access: RESIDENT('history_read'),
    handle: (ctx): DuesBillDetail => {
      const r = resident(ctx);
      // Another resident's bill, or lines this resident is not liable for, do not exist here.
      const bill = billOf(r, ctx.params.invoiceId!);
      if (!bill) notFound(ctx);
      const pos = position(r);
      return {
        bill,
        position: pos,
        payee: payeeFor(r, pos.totalPayable),
        payments: r.payments
          .filter((p) => p.allocations.some((a) => a.invoiceId === bill.invoiceId))
          .map((p) => ({ paymentRef: p.ref, receiptId: p.receiptId, receiptRef: p.receiptRef, receivedOn: p.receivedOn, amount: money(sum(p.allocations.filter((a) => a.invoiceId === bill.invoiceId).map((a) => toPaisa(a.amount.amount)))) })),
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/dues\/pay$/,
    access: RESIDENT('history_read'),
    handle: (ctx): DuesPayInfo => {
      const r = resident(ctx);
      const pos = position(r);
      return { position: pos, payee: payeeFor(r, pos.totalPayable), methods: methods(r), pending: r.submissions.filter((x) => PENDING_STATES.includes(x.state)).map(submissionSummary) };
    },
  },
  {
    // A proof of transfer: recorded as "Pending verification". Nothing is paid until finance verifies it.
    method: 'POST',
    pattern: /^\/portal\/dues\/submissions$/,
    access: RESIDENT('settlement'),
    handle: (ctx): ResidentSubmissionDetail => {
      const r = resident(ctx);
      const methodsNow = methods(r);
      if (!methodsNow.bankTransfer) problem(ctx, 409, 'method_not_allowed', 'collections:problems.methodNotAllowed');
      const { version, confirmDuplicate } = proofInput(ctx, r.today);
      const accountId = String((ctx.req.body as { accountId?: string } | undefined)?.accountId ?? '') || (r.lines[0]?.billingAccountId ?? r.links.find((l) => r.s.view.facts.some((f) => f.role === 'payer' && f.partyId === r.partyId && f.flatId === l.unitId))?.billingAccountId ?? '');
      if (!r.links.some((l) => l.billingAccountId === accountId)) invalidField(ctx, 'accountId', 'collections:problems.account');
      const account = r.s.view.model.accounts.find((a) => a.id === accountId)!;
      const flats = [...new Set(r.lines.filter((l) => l.billingAccountId === accountId).map((l) => l.unitCode))];
      // The same file, or the same amount, date and reference, sent before: ask before sending again.
      const probe = { payerPartyId: r.partyId, versions: [{ file: version.file }], current: version, id: '' } as unknown as PaymentSubmission;
      const earlier = possibleDuplicates(r.s.state, probe);
      if (earlier.length && !confirmDuplicate) {
        throw new ApiError({ status: 409, code: 'possible_duplicate', messageKey: 'collections:problems.possibleDuplicate', errors: { file: [{ code: 'collections:problems.possibleDuplicate', params: { ref: earlier[0]!.ref, state: earlier[0]!.state } }] }, correlationId: ctx.correlationId, changed: false });
      }
      const sub = createSubmission(r.s.state, { at: stamp(ctx), account: { id: account.id, accountNo: account.accountNo }, payer: { partyId: r.partyId, name: r.name }, flats: flats.length ? flats : flatsOf(r).map((f) => f.code), version });
      log(ctx, r.s, 'proofSubmitted', { kind: 'submission', id: sub.id, label: sub.ref }, { flats: sub.flats, values: { amount: version.amount.amount } });
      save(ctx);
      return residentDetail(sub);
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/dues\/submissions\/(?<submissionId>[\w-]+)$/,
    access: RESIDENT('history_read'),
    handle: (ctx): ResidentSubmissionDetail => residentDetail(submissionOf(ctx, resident(ctx))),
  },
  {
    // Answering "needs information": a new version is added; earlier versions and notes stay.
    method: 'POST',
    pattern: /^\/portal\/dues\/submissions\/(?<submissionId>[\w-]+)\/resubmit$/,
    access: RESIDENT('settlement'),
    handle: (ctx): ResidentSubmissionDetail => {
      const r = resident(ctx);
      const sub = submissionOf(ctx, r);
      if (sub.state !== 'needs_information') problem(ctx, 409, 'invalid_state', 'collections:problems.invalidState');
      const { version } = proofInput(ctx, r.today);
      const v = { n: sub.versions.length + 1, submittedAt: stamp(ctx), ...version };
      sub.versions.push(v);
      sub.current = v;
      sub.state = 'submitted';
      sub.history.push({ at: v.submittedAt, by: r.partyId, byName: r.name, byKind: 'resident', action: 'resubmitted' });
      log(ctx, r.s, 'proofResubmitted', { kind: 'submission', id: sub.id, label: sub.ref }, { flats: sub.flats, values: { amount: v.amount.amount, version: String(v.n) } });
      save(ctx);
      return residentDetail(sub);
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/dues\/receipts\/(?<receiptId>[\w-]+)$/,
    access: RESIDENT('history_read'),
    handle: (ctx): Receipt => {
      const r = resident(ctx);
      const p = r.payments.find((x) => x.receiptId === ctx.params.receiptId);
      if (!p) notFound(ctx);
      return r.s.state.receipts.find((x) => x.id === p.receiptId)!;
    },
  },
  {
    method: 'GET',
    pattern: /^\/portal\/dues\/statement$/,
    access: RESIDENT('history_read'),
    handle: (ctx): Statement => {
      const r = resident(ctx);
      const accountId = String(ctx.req.query?.account ?? '') || r.links[0]!.billingAccountId;
      if (!r.links.some((l) => l.billingAccountId === accountId)) notFound(ctx);
      const account = r.s.view.model.accounts.find((a) => a.id === accountId)!;
      const { from, to } = (ctx.req.query ?? {}) as Record<string, string | undefined>;
      const mine = new Set(r.lines.map((l) => l.lineId));
      // Only the resident's own lines and payments (per-unit liability); since go-live by default.
      return statementOf({
        accountId,
        accountNo: account.accountNo,
        holderName: r.name,
        invoices: r.s.view.invoices.map((i) => ({ ...i, lines: i.lines.filter((l) => mine.has(l.id)) })),
        creditNotes: r.s.state.creditNotes,
        payments: r.payments,
        from: from && DATE.test(from) ? from : `${OPENING_AS_OF.slice(0, 8)}01`,
        to: to && DATE.test(to) ? to : lastDayOf(r.s),
        payer: { partyId: r.partyId, name: r.name },
      });
    },
  },
];

const lastDayOf = (s: Society) => {
  const period = [...s.state.runs].map((x) => x.period).sort().at(-1) ?? s.view.state.invoices.at(-1)?.period ?? '2026-11';
  return new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);
};

/**
 * The resident's own view of a submission: their versions and the steps, without staff names or the
 * office's internal decisions (an exception being approved reads as "being checked").
 */
function residentDetail(sub: PaymentSubmission): ResidentSubmissionDetail {
  type Step = ResidentSubmissionDetail['timeline'][number]['step'];
  const step = (a: PaymentSubmission['history'][number]['action']): Step | null =>
    a === 'review_started' ? 'under_review' : a === 'exception_requested' || a === 'exception_approved' || a === 'exception_rejected' ? null : a;
  return {
    submission: {
      ...submissionSummary(sub),
      accountNo: sub.accountNo,
      flats: sub.flats,
      bankReference: sub.current.bankReference,
      versions: sub.versions.map((v) => ({ n: v.n, submittedAt: v.submittedAt, amount: v.amount, transferDate: v.transferDate, bankReference: v.bankReference, ...(v.note ? { note: v.note } : {}), fileName: v.file.name })),
    },
    timeline: sub.history.flatMap((h) => {
      const st = step(h.action);
      return st ? [{ at: h.at, step: st, ...(h.note && (h.action === 'information_requested' || h.action === 'rejected') ? { note: h.note } : {}) }] : [];
    }),
    canResubmit: sub.state === 'needs_information',
  };
}

