import {
  REMINDER_CHANNELS,
  S1_FEATURES,
  type ApprovalRequest,
  type ChequeRule,
  type CollectionSettings,
  type CustomerInvoice,
  type DuesCheck,
  type LiabilityChange,
  type OwnershipTransfer,
  type OwnershipTransferDetail,
  type OwnershipTransferRow,
  type PrintDocument,
  type PrintPack,
  type ReminderChannel,
  type ReminderEvent,
  type ReminderOverview,
  type ReminderPolicy,
  type ReminderPreview,
  type ReminderSendResult,
  type ReminderStep,
} from '@repo/contracts';
import { can, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { identityOf } from '../../identity/state';
import { invitedPrincipalId } from '../../identity/register-people';
import { pad } from '../../seed';
import { linesOf, openLinesFor, type OpenLine } from '../allocate';
import { isPosted } from '../billing-run';
import { PENDING_STATES } from '../collections-read';
import { fingerprint } from '../import';
import { log, openPeriod, save, siteOf, stamp, type Society } from '../handlers';
import { factOn } from '../model';
import { beneficiaryOn, nextRef, viewOf } from '../state';
import { principalsOfParty, raiseApproval } from './approvals';
import { amountField, body, me, query, refuse, remember, replay, required, text } from './common';
import { addDays, DATE, money, paisa, periodOf, sum } from './model';
import { planFor, type ReminderTarget } from './reminders';
import { FIN_ROUTES } from './routes';

/**
 * Reminders (COL-007/009), printing (BILL-018, COL-008), society transfers and clearance
 * (OWN-003/004/006) and the S.1 site settings (BILL-012 cheque rules, D-46 cash witnessing, D-42
 * transfer-fee rates). Messages are simulated (no SMS or WhatsApp leaves the prototype).
 */

const site = (ctx: HandlerContext) => siteOf(ctx, 'receivables');
const REMINDERS = S1_FEATURES.reminders;
const CLEARANCE = S1_FEATURES.transferClearance;

// ---------------------------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------------------------

const activeReminderPolicy = (s: Society) => s.state.finance.reminderPolicies.find((p) => p.status === 'active') ?? null;

/** Consent per channel of a payer (their own sign-in, or the invitation identity D.1 created for them). */
function consentsOf(ctx: HandlerContext, partyId: string): Record<'sms' | 'whatsapp', boolean> {
  const identity = identityOf(ctx);
  const principals = [...principalsOfParty(partyId), invitedPrincipalId(partyId)];
  const contact = principals.map((p) => identity.contacts[p]).find(Boolean);
  const agreed = (c: 'sms' | 'whatsapp') => !!contact?.phone && !!contact.consents.find((x) => x.channel === c && x.consented);
  return { sms: agreed('sms'), whatsapp: agreed('whatsapp') };
}

const channelLicensed = (ctx: HandlerContext) => ({
  sms: !!ctx.access?.features.includes('communications.sms'),
  whatsapp: !!ctx.access?.features.includes('communications.whatsapp'),
});

/** Every liable payer of every account, with what they owe and what is pending for them. */
function reminderTargets(ctx: HandlerContext, s: Society, accounts?: readonly string[]): ReminderTarget[] {
  const lines = linesOf(s.view.invoices);
  const month = periodOf(ctx.at);
  const out: ReminderTarget[] = [];
  for (const a of s.view.model.accounts.filter((x) => !accounts?.length || accounts.includes(x.id))) {
    const facts = s.view.facts.filter((f) => f.role === 'payer' && f.billingAccountId === a.id && factOn(f, ctx.at));
    for (const partyId of [...new Set(facts.map((f) => f.partyId))]) {
      const open = openLinesFor(lines, { partyId, legalEntityId: s.legalEntityId, billingAccountId: a.id });
      const proofs = s.state.submissions.filter((x) => x.billingAccountId === a.id && x.payerPartyId === partyId && PENDING_STATES.includes(x.state));
      const events = s.state.finance.reminders.filter((e) => e.partyId === partyId && e.billingAccountId === a.id);
      const bill = open[0]?.invoiceRef ?? '';
      out.push({
        billingAccountId: a.id,
        accountNo: a.accountNo,
        partyId,
        payerName: facts.find((f) => f.partyId === partyId)!.partyName,
        flats: facts.filter((f) => f.partyId === partyId).map((f) => s.view.model.flats.find((x) => x.id === f.flatId)?.code ?? ''),
        open: sum(open.map((l) => l.open)),
        overdue: sum(open.filter((l) => l.dueOn < ctx.at).map((l) => l.open)),
        ...(open[0] ? { oldestDue: open[0].dueOn } : {}),
        proof: proofs.some((x) => x.state !== 'needs_information') ? 'pending' : proofs.length ? 'needs_information' : 'none',
        chequePending: s.state.finance.cheques.some((c) => c.billingAccountId === a.id && ['received', 'deposited', 'exception_pending'].includes(c.status)),
        consents: consentsOf(ctx, partyId),
        sentThisMonth: new Set(events.filter((e) => e.outcome === 'sent' && periodOf(e.at) === month).map((e) => e.sendKey)).size,
        alreadySent: new Set(events.filter((e) => e.outcome === 'sent' && e.step !== undefined && e.flats.join() !== '' && bill && e.sendKey.includes(bill)).map((e) => `${e.step}|${e.channel}`)),
      });
    }
  }
  return out;
}

function preview(ctx: HandlerContext, s: Society, input: { accounts?: string[]; clock: string; manual: boolean }): ReminderPreview & { plans: Array<ReturnType<typeof planFor>> } {
  const policy = activeReminderPolicy(s);
  if (!policy) refuse(ctx, 409, 'no_reminder_policy');
  const plans = reminderTargets(ctx, s, input.accounts).map((t) => planFor(t, { policy: policy!, today: ctx.at, clock: input.clock, licensed: channelLicensed(ctx), manual: input.manual }));
  // Bulk sends list only payers with something to remind; a manual send shows its one payer whatever happens.
  const rows = input.manual ? plans : plans.filter((p) => !p.channels.every((c) => c.skip === 'paid' || c.skip === 'not_due_yet'));
  const flat = rows.flatMap((r) => r.channels);
  const bySkip: ReminderPreview['bySkip'] = {};
  for (const c of flat) if (c.skip) bySkip[c.skip] = (bySkip[c.skip] ?? 0) + 1;
  return {
    policyVersion: policy!.version,
    at: `${ctx.at}T${input.clock}`,
    quietNow: input.clock >= policy!.quietHours.from || input.clock < policy!.quietHours.to,
    rows: rows.map(({ step: _step, ...r }) => r),
    plans: rows,
    counts: { send: flat.filter((c) => c.outcome === 'send').length, skip: flat.filter((c) => c.outcome === 'skip').length, defer: flat.filter((c) => c.outcome === 'defer').length },
    bySkip,
  };
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function overview(ctx: HandlerContext, s: Society): ReminderOverview {
  const f = s.state.finance;
  const history = [...f.reminders].reverse().filter((e) => !query(ctx).account || e.billingAccountId === query(ctx).account);
  return {
    policies: [...f.reminderPolicies].sort((a, b) => b.version - a.version),
    active: activeReminderPolicy(s),
    history,
    counts: { sent: f.reminders.filter((e) => e.outcome === 'sent').length, skipped: f.reminders.filter((e) => e.outcome === 'skipped').length, deferred: f.reminders.filter((e) => e.outcome === 'deferred').length },
    channels: { in_app: true, ...channelLicensed(ctx) },
    actions: { manage: can(ctx, 'reminders.manage'), send: can(ctx, 'reminders.send') },
  };
}

// ---------------------------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------------------------

const label = (l: OpenLine | CustomerInvoice['lines'][number]) => ('category' in l && l.category ? l.category : 'opening_balance');

function payeeFor(s: Society, invoice: Pick<CustomerInvoice, 'legalEntityId' | 'issuedOn' | 'period'>, flat: string): PrintDocument['payee'] {
  const b = beneficiaryOn(s.state, invoice.legalEntityId, invoice.issuedOn) ?? beneficiaryOn(s.state, invoice.legalEntityId, s.state.beneficiaries.find((x) => x.activeFrom)?.activeFrom ?? invoice.issuedOn);
  if (!b) return null;
  return { legalEntityName: b.legalEntityName, bankName: b.bankName, accountTitle: b.accountTitle, iban: b.iban, reference: b.referenceFormat.replace('{flat}', flat.replace('-', '')).replace('{period}', invoice.period) };
}

function invoiceDocument(s: Society, i: CustomerInvoice, today: string): PrintDocument {
  const flats = [...new Set(i.lines.map((l) => l.unitCode))];
  return {
    id: i.id,
    kind: 'invoice',
    ref: i.ref,
    accountNo: i.accountNo,
    payerName: i.payerName,
    flats,
    issuedOn: i.issuedOn,
    dueOn: i.dueOn,
    lines: i.lines.map((l) => ({ label: label(l), ...(l.category ? { category: l.category } : {}), unitCode: l.unitCode, period: l.period, amount: l.amount, open: money(paisa(l.amount) - paisa(l.credited) - paisa(l.allocated)) })),
    total: i.total,
    open: i.outstanding,
    ...(i.dueOn < today ? { overdue: i.outstanding } : {}),
    payee: payeeFor(s, i, flats[0] ?? ''),
  };
}

// ---------------------------------------------------------------------------------------------
// Society transfers and clearance
// ---------------------------------------------------------------------------------------------

function ownershipOf(ctx: HandlerContext, s: Society): OwnershipTransfer {
  const t = s.state.finance.ownership.find((x) => x.id === ctx.params.transferId);
  if (!t) notFound(ctx);
  return t!;
}

/** Every open liability on the flat (whoever was liable for each period) and what is still pending for its account. */
export function duesCheckOf(s: Society, t: Pick<OwnershipTransfer, 'flatId' | 'billingAccountId'>, at: string): DuesCheck {
  const lines = linesOf(s.view.invoices).filter((l) => l.unitId === t.flatId && l.open > 0n);
  const pending = sum([
    ...s.state.submissions.filter((x) => x.billingAccountId === t.billingAccountId && PENDING_STATES.includes(x.state)).map((x) => paisa(x.current.amount)),
    ...s.state.finance.cheques.filter((c) => c.billingAccountId === t.billingAccountId && ['received', 'deposited', 'exception_pending'].includes(c.status)).map((c) => paisa(c.amount)),
  ]);
  return {
    checkedAt: at,
    lines: lines.map((l) => ({ invoiceId: l.invoiceId, invoiceRef: l.invoiceRef, period: l.period, label: l.category ?? l.kind, open: money(l.open) })),
    outstanding: money(sum(lines.map((l) => l.open))),
    pending: money(pending),
  };
}

const feeRateOn = (s: Society, on: string) => [...s.state.transferFees].filter((r) => r.from <= on && (r.to === undefined || on < r.to)).sort((a, b) => b.version - a.version)[0] ?? null;

/** Clear to approve and certify: nothing outstanding on the flat, or an approved waiver covering it. */
function clear(t: OwnershipTransfer, dues: DuesCheck) {
  const outstanding = paisa(dues.outstanding);
  return outstanding === 0n || (t.waiver?.status === 'approved' && paisa(t.waiver.amount) >= outstanding);
}

function ownershipDetail(ctx: HandlerContext, s: Society, t: OwnershipTransfer): OwnershipTransferDetail {
  // Read after any change made by this request (a fee invoice, a payment).
  s.view = viewOf(s.state, ctx.at);
  const who = me(ctx);
  const dues = duesCheckOf(s, t, stamp(ctx));
  const invoice = t.fee ? s.view.invoices.find((i) => i.id === t.fee!.invoiceId) : undefined;
  const reviewer = can(ctx, 'transfer.review');
  const approver = can(ctx, 'transfer.approve') && t.requestedBy !== who.principalId;
  const open = ['requested', 'dues_blocked', 'fee_invoiced', 'clearance_pending'].includes(t.status);
  const waiver = t.waiver ? s.state.finance.approvals.find((a) => a.id === t.waiver!.approvalId) : undefined;
  return {
    transfer: t,
    ...(invoice ? { feeInvoice: { id: invoice.id, ref: invoice.ref, total: invoice.total, open: invoice.outstanding, settlement: invoice.settlement } } : {}),
    rate: feeRateOn(s, ctx.at),
    ...(waiver ? { waiverApproval: waiver } : {}),
    actions: {
      checkDues: reviewer && open,
      invoiceFee: reviewer && open && !t.fee && !!feeRateOn(s, ctx.at),
      requestWaiver: reviewer && open && paisa(dues.outstanding) > 0n && (!t.waiver || t.waiver.status === 'rejected'),
      approve: approver && open && clear(t, dues) && (!!t.fee || !feeRateOn(s, ctx.at)),
      reject: approver && open,
      issueCertificate: can(ctx, 'clearance.issue') && t.status === 'approved' && clear(t, dues),
      withdraw: t.requestedBy === who.principalId && open,
      ...(can(ctx, 'transfer.approve') && t.requestedBy === who.principalId && open ? { reason: 'maker_checker_required' as const } : open && !clear(t, dues) ? { reason: 'balance_not_zero' as const } : {}),
    },
  };
}

const rowOf = (s: Society, t: OwnershipTransfer): OwnershipTransferRow => {
  const invoice = t.fee ? s.view.invoices.find((i) => i.id === t.fee!.invoiceId) : undefined;
  return {
    id: t.id,
    ref: t.ref,
    flatCode: t.flatCode,
    fromName: t.from.name,
    toName: t.to.name,
    effectiveOn: t.effectiveOn,
    status: t.status,
    fee: !t.fee ? 'none' : invoice && paisa(invoice.outstanding) === 0n ? 'paid' : 'invoiced',
    clearance: t.certificate ? 'issued' : 'not_issued',
    ...(t.dues ? { outstanding: t.dues.outstanding } : {}),
  };
};

/** A waiver decided under the policy: approved waivers let the transfer through; rejected ones do not. */
export function applyOwnershipOutcome(ctx: HandlerContext, s: Society, a: ApprovalRequest) {
  const t = s.state.finance.ownership.find((x) => x.id === a.subjectId);
  if (!t?.waiver) return;
  t.waiver.status = a.status;
  t.history.push({ at: stamp(ctx), byName: me(ctx).name, action: 'waiver_decided', note: a.status });
  log(ctx, s, 'waiverDecided', { kind: 'ownership_transfer', id: t.id, label: t.ref }, { values: { status: a.status } });
}

// ---------------------------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------------------------

/** OWN-004: approved or rejected by someone other than its requester; the balance is re-checked now. */
function decideOwnership(ctx: HandlerContext, decision: 'approve' | 'reject'): OwnershipTransferDetail {
  const s = siteOf(ctx, 'residents');
  const t = ownershipOf(ctx, s);
  const who = me(ctx);
  if (t.requestedBy === who.principalId) refuse(ctx, 403, 'maker_checker_required');
  if (!['requested', 'dues_blocked', 'fee_invoiced', 'clearance_pending'].includes(t.status)) refuse(ctx, 409, 'invalid_state');
  const note = text(body<{ note: string }>(ctx).note, 300);
  if (decision === 'reject') {
    required(ctx, 'note', note, 10);
    t.status = 'rejected';
    t.history.push({ at: stamp(ctx), byName: who.name, action: 'rejected', note });
  } else {
    const dues = duesCheckOf(s, t, stamp(ctx));
    // Re-checked now: a balance that appeared since the last check blocks the approval.
    if (!clear(t, dues)) refuse(ctx, 409, 'balance_not_zero', undefined, { outstanding: dues.outstanding.amount });
    if (!t.fee && feeRateOn(s, ctx.at)) refuse(ctx, 409, 'fee_not_invoiced');
    t.dues = dues;
    Object.assign(t, { status: 'approved', approvedBy: who.principalId, approvedByName: who.name, approvedAt: stamp(ctx) });
    t.history.push({ at: stamp(ctx), byName: who.name, action: 'approved', note });
  }
  log(ctx, s, decision === 'reject' ? 'ownershipTransferRejected' : 'ownershipTransferApproved', { kind: 'ownership_transfer', id: t.id, label: t.ref }, { flats: [t.flatCode] });
  save(ctx);
  return ownershipDetail(ctx, s, t);
}

export const FINANCE_DUES_HANDLERS: readonly Handler[] = [
  {
    method: 'GET',
    pattern: /^\/reminders$/,
    access: requires('receivables', ['reminders.manage', 'reminders.send', 'collections.view'], 'history_read', REMINDERS),
    handle: (ctx): ReminderOverview => overview(ctx, site(ctx)),
  },
  {
    method: 'POST',
    pattern: /^\/reminders\/preview$/,
    access: requires('receivables', ['reminders.manage', 'reminders.send', 'collections.view'], 'history_read', REMINDERS),
    handle: (ctx): ReminderPreview => {
      const s = site(ctx);
      const input = body<{ accounts: string[]; clock: string }>(ctx);
      const clock = CLOCK.test(String(input.clock)) ? String(input.clock) : '11:00';
      const accounts = Array.isArray(input.accounts) ? input.accounts.map(String) : undefined;
      const { plans: _plans, ...p } = preview(ctx, s, { ...(accounts ? { accounts } : {}), clock, manual: !!accounts?.length });
      return p;
    },
  },
  {
    // Simulated delivery. The same send key never sends twice (a double click returns the first result).
    method: 'POST',
    pattern: /^\/reminders\/send$/,
    access: requires('receivables', 'reminders.send', 'operational', REMINDERS),
    handle: (ctx): ReminderSendResult => {
      const s = site(ctx);
      const f = s.state.finance;
      const input = body<{ accounts: string[]; clock: string; sendKey: string }>(ctx);
      const sendKey = required(ctx, 'sendKey', text(input.sendKey, 80), 8);
      const earlier = f.reminders.filter((e) => e.sendKey.startsWith(`${sendKey}|`));
      if (earlier.length) return { sendKey, replayed: true, sent: earlier.filter((e) => e.outcome === 'sent').length, skipped: earlier.filter((e) => e.outcome === 'skipped').length, deferred: earlier.filter((e) => e.outcome === 'deferred').length, events: earlier };
      const clock = CLOCK.test(String(input.clock)) ? String(input.clock) : '11:00';
      const accounts = Array.isArray(input.accounts) ? input.accounts.map(String) : undefined;
      const p = preview(ctx, s, { ...(accounts ? { accounts } : {}), clock, manual: !!accounts?.length });
      const who = me(ctx);
      const events: ReminderEvent[] = [];
      const lines = linesOf(s.view.invoices);
      for (const plan of p.plans) {
        const bill = openLinesFor(lines, { partyId: plan.partyId, legalEntityId: s.legalEntityId, billingAccountId: plan.billingAccountId })[0]?.invoiceRef ?? 'none';
        for (const c of plan.channels) {
          events.push({
            id: `rme_anr_${pad(f.reminders.length + events.length + 1, 5)}`,
            at: `${ctx.at}T${clock}:00`,
            policyVersion: p.policyVersion,
            ...(plan.step !== null ? { step: plan.step } : {}),
            billingAccountId: plan.billingAccountId,
            accountNo: plan.accountNo,
            partyId: plan.partyId,
            payerName: plan.payerName,
            flats: plan.flats,
            channel: c.channel,
            outcome: c.outcome === 'send' ? 'sent' : c.outcome === 'defer' ? 'deferred' : 'skipped',
            ...(c.skip ? { skip: c.skip } : {}),
            amount: plan.amount,
            sendKey: `${sendKey}|${bill}`,
            byName: who.name,
          });
        }
      }
      f.reminders.push(...events);
      log(ctx, s, 'remindersSent', { kind: 'reminder', id: sendKey, label: `v${p.policyVersion}` }, { values: { sent: String(p.counts.send), skipped: String(p.counts.skip), deferred: String(p.counts.defer) } });
      save(ctx);
      return { sendKey, replayed: false, sent: events.filter((e) => e.outcome === 'sent').length, skipped: events.filter((e) => e.outcome === 'skipped').length, deferred: events.filter((e) => e.outcome === 'deferred').length, events };
    },
  },
  {
    // Rules change only as a new version: drafted, then activated (the old one is retired, never edited).
    method: 'POST',
    pattern: /^\/reminders\/policies$/,
    access: requires('receivables', 'reminders.manage', 'operational', REMINDERS),
    handle: (ctx): ReminderOverview => {
      const s = site(ctx);
      const f = s.state.finance;
      const input = body<{ steps: Array<{ offsetDays: number; channels: string[] }>; quietHours: { from: string; to: string }; monthlyCap: number; note: string; activate: boolean }>(ctx);
      const steps: ReminderStep[] = (Array.isArray(input.steps) ? input.steps : [])
        .map((st) => ({ offsetDays: Math.round(Number(st.offsetDays)), channels: [...new Set((Array.isArray(st.channels) ? st.channels : []).filter((c): c is ReminderChannel => REMINDER_CHANNELS.includes(c as ReminderChannel)))] }))
        .filter((st) => Number.isFinite(st.offsetDays) && st.offsetDays >= -15 && st.offsetDays <= 90 && st.channels.length);
      if (!steps.length || steps.length > 6 || new Set(steps.map((x) => x.offsetDays)).size !== steps.length) refuse(ctx, 422, 'reminder_steps', 'steps');
      // In-app is always part of a reminder (D-36); SMS and WhatsApp are extra channels, never the only one.
      if (steps.some((x) => !x.channels.includes('in_app'))) refuse(ctx, 422, 'reminder_in_app', 'steps');
      const quiet = input.quietHours ?? { from: '21:00', to: '09:00' };
      if (!CLOCK.test(quiet.from) || !CLOCK.test(quiet.to)) refuse(ctx, 422, 'reminder_quiet', 'quietHours');
      const cap = Math.floor(Number(input.monthlyCap));
      if (!(cap >= 1 && cap <= 6)) refuse(ctx, 422, 'reminder_cap', 'monthlyCap');
      const note = required(ctx, 'note', text(input.note, 300), 5);
      const who = me(ctx);
      for (const d of f.reminderPolicies.filter((p) => p.status === 'draft')) d.status = 'retired';
      const v: ReminderPolicy = { id: `rmp_anr_v${f.reminderPolicies.length + 1}`, siteId: s.siteId, version: Math.max(...f.reminderPolicies.map((p) => p.version)) + 1, status: 'draft', steps: steps.sort((a, b) => a.offsetDays - b.offsetDays), quietHours: quiet, monthlyCap: cap, lateFeeWording: false, createdBy: who.principalId, createdByName: who.name, createdAt: stamp(ctx), note };
      f.reminderPolicies.push(v);
      if (input.activate) {
        for (const p of f.reminderPolicies.filter((x) => x.status === 'active' || x.status === 'paused')) p.status = 'retired';
        Object.assign(v, { status: 'active', activatedByName: who.name, activatedAt: stamp(ctx) });
      }
      log(ctx, s, input.activate ? 'reminderPolicyActivated' : 'reminderPolicyDrafted', { kind: 'reminder', id: v.id, label: `v${v.version}` });
      save(ctx);
      return overview(ctx, s);
    },
  },
  {
    method: 'POST',
    pattern: /^\/reminders\/policies\/(?<policyId>[\w-]+)\/(?<action>[\w-]+)$/,
    access: requires('receivables', 'reminders.manage', 'operational', REMINDERS),
    handle: (ctx): ReminderOverview => {
      const s = site(ctx);
      const f = s.state.finance;
      const v = f.reminderPolicies.find((p) => p.id === ctx.params.policyId);
      if (!v) notFound(ctx);
      const action = ctx.params.action;
      if (!['activate', 'pause', 'resume'].includes(action!)) notFound(ctx);
      if (action === 'activate') {
        if (v!.status !== 'draft') refuse(ctx, 409, 'invalid_state');
        for (const p of f.reminderPolicies.filter((x) => x.status === 'active' || x.status === 'paused')) p.status = 'retired';
        Object.assign(v!, { status: 'active', activatedByName: me(ctx).name, activatedAt: stamp(ctx) });
      } else if (action === 'pause') {
        if (v!.status !== 'active') refuse(ctx, 409, 'invalid_state');
        v!.status = 'paused';
      } else {
        if (v!.status !== 'paused') refuse(ctx, 409, 'invalid_state');
        v!.status = 'active';
      }
      log(ctx, s, `reminderPolicy_${action}`, { kind: 'reminder', id: v!.id, label: `v${v!.version}` });
      save(ctx);
      return overview(ctx, s);
    },
  },
  // -------------------------------------------------------------------------------------------
  // Printing (BILL-018, COL-008)
  // -------------------------------------------------------------------------------------------
  {
    // The pack holds exactly the run's posted invoices (one per flat's account and payer), nothing else.
    method: 'GET',
    pattern: /^\/billing-runs\/(?<runId>[\w-]+)\/print-pack$/,
    access: requires('dues', 'billing_run.view', 'history_read'),
    handle: (ctx): PrintPack => {
      const s = siteOf(ctx, 'dues');
      const run = s.state.runs.find((r) => r.id === ctx.params.runId);
      if (!run) notFound(ctx);
      if (!isPosted(run!.state) || !run!.invoiceIds?.length) refuse(ctx, 409, 'run_not_posted');
      const { flat } = query(ctx);
      const docs = run!.invoiceIds!.map((id) => s.view.invoices.find((i) => i.id === id)).filter((i): i is CustomerInvoice => !!i && i.runId === run!.id).filter((i) => !flat || i.lines.some((l) => l.unitCode === flat));
      return {
        kind: 'billing_run',
        title: run!.ref,
        siteName: run!.siteName,
        legalEntityName: docs[0]?.legalEntityName ?? '',
        generatedAt: stamp(ctx),
        run: { id: run!.id, ref: run!.ref, period: run!.period, invoices: run!.invoiceIds!.length },
        documents: docs.map((i) => invoiceDocument(s, i, ctx.at)),
        total: money(sum(docs.map((i) => paisa(i.total)))),
      };
    },
  },
  {
    // One notice per liable payer and account, with only that payer's overdue lines (never a list of defaulters).
    method: 'GET',
    pattern: /^\/collections\/dues-notices$/,
    access: requires('receivables', 'collections.view', 'history_read'),
    handle: (ctx): PrintPack => {
      const s = site(ctx);
      const { account, min } = query(ctx);
      const lines = linesOf(s.view.invoices);
      const documents: PrintDocument[] = [];
      for (const a of s.view.model.accounts.filter((x) => !account || x.id === account)) {
        const payers = [...new Set(s.view.facts.filter((f) => f.role === 'payer' && f.billingAccountId === a.id && factOn(f, ctx.at)).map((f) => f.partyId))];
        for (const partyId of payers) {
          const overdue = openLinesFor(lines, { partyId, legalEntityId: s.legalEntityId, billingAccountId: a.id }).filter((l) => l.dueOn < ctx.at);
          const total = sum(overdue.map((l) => l.open));
          if (total <= 0n || (min && total < BigInt(Math.round(Number(min) * 100)))) continue;
          const invoice = s.view.invoices.find((i) => i.id === overdue[0]!.invoiceId)!;
          const flats = [...new Set(overdue.map((l) => l.unitCode))];
          documents.push({
            id: `${a.id}:${partyId}`,
            kind: 'dues_notice',
            ref: `${a.accountNo}-${ctx.at.replace(/-/g, '')}`,
            accountNo: a.accountNo,
            payerName: s.view.facts.find((f) => f.partyId === partyId)?.partyName ?? '',
            flats,
            issuedOn: ctx.at,
            lines: overdue.map((l) => ({ label: l.category ?? l.kind, ...(l.category ? { category: l.category } : {}), unitCode: l.unitCode, period: l.period, amount: money(l.open), open: money(l.open) })),
            total: money(total),
            open: money(total),
            overdue: money(total),
            payee: payeeFor(s, { legalEntityId: invoice.legalEntityId, issuedOn: ctx.at, period: invoice.period }, flats[0] ?? ''),
          });
        }
      }
      return { kind: 'dues_notices', title: 'dues_notices', siteName: 'Al-Noor Residency', legalEntityName: s.state.beneficiaries[0]?.legalEntityName ?? '', generatedAt: stamp(ctx), documents, total: money(sum(documents.map((d) => paisa(d.total)))) };
    },
  },
  // -------------------------------------------------------------------------------------------
  // Society transfers and clearance (OWN-003/004/006)
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/ownership-transfers$/,
    access: requires('residents', ['transfer.review', 'transfer.approve', 'clearance.issue'], 'history_read', CLEARANCE),
    handle: (ctx): OwnershipTransferRow[] => {
      const s = siteOf(ctx, 'residents');
      const { status } = query(ctx);
      return [...s.state.finance.ownership].reverse().filter((t) => !status || status === 'all' || t.status === status).map((t) => rowOf(s, t));
    },
  },
  {
    method: 'GET',
    pattern: /^\/ownership-transfers\/(?<transferId>[\w-]+)$/,
    access: requires('residents', ['transfer.review', 'transfer.approve', 'clearance.issue'], 'history_read', CLEARANCE),
    handle: (ctx): OwnershipTransferDetail => {
      const s = siteOf(ctx, 'residents');
      return ownershipDetail(ctx, s, ownershipOf(ctx, s));
    },
  },
  {
    method: 'POST',
    pattern: /^\/ownership-transfers$/,
    access: requires('residents', 'transfer.review', 'operational', CLEARANCE),
    handle: (ctx): OwnershipTransferDetail => {
      const s = siteOf(ctx, 'residents');
      const f = s.state.finance;
      const input = body<{ flatId: string; toPartyId: string; toName: string; toPhone: string; effectiveOn: string; reason: string; idempotencyKey: string }>(ctx);
      const key = text(input.idempotencyKey, 80) || undefined;
      const seen = replay(s, key);
      if (seen) return ownershipDetail(ctx, s, f.ownership.find((t) => t.id === seen)!);
      const flat = s.view.model.flats.find((x) => x.id === input.flatId || x.code === input.flatId);
      if (!flat) refuse(ctx, 422, 'flat_unknown', 'flatId');
      const owner = s.view.facts.find((x) => x.role === 'owner' && x.flatId === flat!.id && factOn(x, ctx.at));
      if (!owner) refuse(ctx, 409, 'no_owner', 'flatId');
      if (f.ownership.some((t) => t.flatId === flat!.id && !['completed', 'rejected', 'withdrawn'].includes(t.status))) refuse(ctx, 409, 'transfer_open', 'flatId');
      const existing = input.toPartyId ? s.view.model.people.find((p) => p.id === input.toPartyId) : undefined;
      if (input.toPartyId && !existing) refuse(ctx, 422, 'member_unknown', 'toPartyId');
      if (existing && existing.id === owner!.partyId) refuse(ctx, 422, 'same_owner', 'toPartyId');
      const toName = existing?.displayName ?? required(ctx, 'toName', text(input.toName, 120), 3);
      const toPhone = text(input.toPhone, 20);
      if (toPhone && !/^\+92 399 \d{3} \d{4}$/.test(toPhone)) refuse(ctx, 422, 'phone_fictional', 'toPhone');
      // Like any payer change: the first day of a month that has not been billed yet.
      const effectiveOn = String(input.effectiveOn ?? '');
      if (!DATE.test(effectiveOn) || !effectiveOn.endsWith('-01') || effectiveOn.slice(0, 7) < openPeriod(s.state)) refuse(ctx, 422, 'effective_date', 'effectiveOn', { period: openPeriod(s.state) });
      const reason = required(ctx, 'reason', text(input.reason, 200), 5);
      const who = me(ctx);
      const id = `owt_anr_${pad(f.ownership.length + 1, 4)}`;
      const t: OwnershipTransfer = {
        id,
        ref: nextRef(s.state, 'ownershipTransfer', ctx.at),
        siteId: s.siteId,
        legalEntityId: s.legalEntityId,
        flatId: flat!.id,
        flatCode: flat!.code,
        billingAccountId: flat!.billingAccountId,
        accountNo: s.view.model.accounts.find((a) => a.id === flat!.billingAccountId)?.accountNo ?? '',
        from: { partyId: owner!.partyId, name: owner!.partyName },
        to: { name: toName, ...(toPhone ? { phone: toPhone } : {}), ...(existing ? { partyId: existing.id } : {}) },
        effectiveOn,
        reason,
        status: 'requested',
        requestedBy: who.principalId,
        requestedByName: who.name,
        requestedAt: stamp(ctx),
        history: [{ at: stamp(ctx), byName: who.name, action: 'requested', note: reason }],
      };
      f.ownership.push(t);
      remember(s, key, id);
      log(ctx, s, 'ownershipTransferRequested', { kind: 'ownership_transfer', id, label: t.ref }, { flats: [flat!.code], values: { from: t.from.name, to: t.to.name, effectiveOn } });
      save(ctx);
      return ownershipDetail(ctx, s, t);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ownership-transfers\/(?<transferId>[\w-]+)\/dues-check$/,
    access: requires('residents', 'transfer.review', 'operational', CLEARANCE),
    handle: (ctx): OwnershipTransferDetail => {
      const s = siteOf(ctx, 'residents');
      const t = ownershipOf(ctx, s);
      if (!['requested', 'dues_blocked', 'fee_invoiced', 'clearance_pending'].includes(t.status)) refuse(ctx, 409, 'invalid_state');
      s.view = viewOf(s.state, ctx.at);
      t.dues = duesCheckOf(s, t, stamp(ctx));
      t.status = clear(t, t.dues) ? (t.fee || !feeRateOn(s, ctx.at) ? 'clearance_pending' : 'requested') : t.fee ? 'fee_invoiced' : 'dues_blocked';
      t.history.push({ at: stamp(ctx), byName: me(ctx).name, action: 'dues_checked', note: t.dues.outstanding.amount });
      log(ctx, s, 'duesChecked', { kind: 'ownership_transfer', id: t.id, label: t.ref }, { values: { outstanding: t.dues.outstanding.amount } });
      save(ctx);
      return ownershipDetail(ctx, s, t);
    },
  },
  {
    // The fee is an ordinary invoice of the shared engine (source transfer_fee), at the rate in force, once.
    method: 'POST',
    pattern: /^\/ownership-transfers\/(?<transferId>[\w-]+)\/fee-invoice$/,
    access: requires('residents', 'transfer.review', 'operational', CLEARANCE),
    handle: (ctx): OwnershipTransferDetail => {
      const s = siteOf(ctx, 'residents');
      const t = ownershipOf(ctx, s);
      if (t.fee) return ownershipDetail(ctx, s, t);
      if (!['requested', 'dues_blocked', 'clearance_pending'].includes(t.status)) refuse(ctx, 409, 'invalid_state');
      const rate = feeRateOn(s, ctx.at);
      if (!rate) refuse(ctx, 409, 'no_fee_rate');
      const key = fingerprint([s.siteId, t.id, 'transfer_fee', String(rate!.version)].join('|'));
      const period = periodOf(ctx.at);
      const invoice: CustomerInvoice = {
        id: `cin_tf_${t.id.slice(-4)}`,
        ref: nextRef(s.state, 'invoice', period),
        legalEntityId: s.legalEntityId,
        legalEntityName: s.state.beneficiaries[0]?.legalEntityName ?? '',
        siteId: s.siteId,
        billingAccountId: t.billingAccountId,
        accountNo: t.accountNo,
        payerPartyId: t.from.partyId,
        payerName: t.from.name,
        source: 'transfer_fee',
        period,
        issuedOn: ctx.at,
        dueOn: addDays(ctx.at, 7),
        issuance: 'issued',
        lines: [{ id: `iln_${key}`, kind: 'charge', category: 'transfer_fee', unitId: t.flatId, unitCode: t.flatCode, period, amount: rate!.amount, credited: money(0n), allocated: money(0n), billingAccountId: t.billingAccountId, sourceType: 'transfer_fee', sourceId: t.id, postingVersion: 1, idempotencyKey: key, payerPartyId: t.from.partyId, payerName: t.from.name }],
        total: rate!.amount,
        credited: money(0n),
        allocated: money(0n),
        outstanding: rate!.amount,
        settlement: 'unpaid',
        overdue: false,
      };
      s.state.invoices.push(invoice);
      t.fee = { rateVersion: rate!.version, amount: rate!.amount, bylawRef: rate!.bylawRef, invoiceId: invoice.id, invoiceRef: invoice.ref };
      if (t.status === 'requested' || t.status === 'clearance_pending' || t.status === 'dues_blocked') t.status = 'fee_invoiced';
      t.history.push({ at: stamp(ctx), byName: me(ctx).name, action: 'fee_invoiced', note: invoice.ref });
      log(ctx, s, 'transferFeeInvoiced', { kind: 'ownership_transfer', id: t.id, label: t.ref }, { flats: [t.flatCode], values: { invoice: invoice.ref, amount: rate!.amount.amount, bylaw: rate!.bylawRef } });
      save(ctx);
      return ownershipDetail(ctx, s, t);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ownership-transfers\/(?<transferId>[\w-]+)\/waiver-request$/,
    access: requires('residents', 'transfer.review', 'operational', CLEARANCE),
    handle: (ctx): OwnershipTransferDetail => {
      const s = siteOf(ctx, 'residents');
      const t = ownershipOf(ctx, s);
      const dues = duesCheckOf(s, t, stamp(ctx));
      if (paisa(dues.outstanding) <= 0n) refuse(ctx, 409, 'nothing_to_waive');
      if (t.waiver && t.waiver.status === 'pending') return ownershipDetail(ctx, s, t);
      const reason = required(ctx, 'reason', text(body<{ reason: string }>(ctx).reason, 300), 10);
      const who = me(ctx);
      const approval = raiseApproval(s.state, {
        subject: 'clearance_waiver',
        subjectId: t.id,
        subjectRef: t.ref,
        amount: paisa(dues.outstanding),
        summary: { key: 'clearance_waiver', values: { flat: t.flatCode, reason } },
        href: FIN_ROUTES.ownershipTransfer(t.id),
        requester: { principalId: who.principalId, name: who.name },
        // Neither side of the sale decides a waiver of the flat's dues.
        conflicted: [...principalsOfParty(t.from.partyId), ...principalsOfParty(t.to.partyId)],
        on: ctx.at,
        at: stamp(ctx),
      });
      if (!approval) refuse(ctx, 409, 'no_policy_rule');
      t.waiver = { approvalId: approval!.id, approvalRef: approval!.ref, amount: dues.outstanding, reason, status: 'pending' };
      t.history.push({ at: stamp(ctx), byName: who.name, action: 'waiver_requested', note: reason });
      log(ctx, s, 'waiverRequested', { kind: 'ownership_transfer', id: t.id, label: t.ref }, { values: { amount: dues.outstanding.amount, approval: approval!.ref } });
      save(ctx);
      return ownershipDetail(ctx, s, t);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ownership-transfers\/(?<transferId>[\w-]+)\/approve$/,
    access: requires('residents', 'transfer.approve', 'operational', CLEARANCE),
    handle: (ctx): OwnershipTransferDetail => decideOwnership(ctx, 'approve'),
  },
  {
    method: 'POST',
    pattern: /^\/ownership-transfers\/(?<transferId>[\w-]+)\/reject$/,
    access: requires('residents', 'transfer.approve', 'operational', CLEARANCE),
    handle: (ctx): OwnershipTransferDetail => decideOwnership(ctx, 'reject'),
  },
  {
    // OWN-006: the certificate takes the entity's numbering (BILL-016) and raises the ordinary payer
    // change in BILL-017's queue: never a second liability path, and history before the date stays.
    method: 'POST',
    pattern: /^\/ownership-transfers\/(?<transferId>[\w-]+)\/certificate$/,
    access: requires('residents', 'clearance.issue', 'operational', CLEARANCE),
    handle: (ctx): OwnershipTransferDetail => {
      const s = siteOf(ctx, 'residents');
      const t = ownershipOf(ctx, s);
      if (t.certificate) return ownershipDetail(ctx, s, t);
      if (t.status !== 'approved') refuse(ctx, 409, 'not_approved');
      const dues = duesCheckOf(s, t, stamp(ctx));
      if (!clear(t, dues)) refuse(ctx, 409, 'balance_not_zero', undefined, { outstanding: dues.outstanding.amount });
      const who = me(ctx);
      const f = s.state.finance;
      const cert = {
        id: `clc_anr_${pad(f.certificates.length + 1, 4)}`,
        ref: nextRef(s.state, 'clearance', ctx.at),
        transferId: t.id,
        flatCode: t.flatCode,
        accountNo: t.accountNo,
        ownerName: t.from.name,
        incomingName: t.to.name,
        issuedOn: ctx.at,
        validUntil: addDays(ctx.at, 30),
        balanceCheckedAt: stamp(ctx),
        outstanding: dues.outstanding,
        ...(t.waiver?.status === 'approved' ? { waived: t.waiver.amount } : {}),
        issuedBy: who.principalId,
        issuedByName: who.name,
        legalEntityName: s.state.beneficiaries[0]?.legalEntityName ?? '',
      };
      f.certificates.push(cert);
      t.certificate = cert;
      const flat = s.view.model.flats.find((x) => x.id === t.flatId)!;
      const current = s.view.facts.find((x) => x.role === 'payer' && x.flatId === t.flatId && factOn(x, t.effectiveOn));
      s.state.seq += 1;
      const partyId = t.to.partyId ?? `pty_anr_t${t.id.slice(-4)}`;
      const change: LiabilityChange = {
        id: `chg_anr_s${s.state.seq}`,
        flatId: flat.id,
        flatCode: flat.code,
        ...(current ? { previousPartyId: current.partyId, previousName: current.partyName } : {}),
        partyId,
        partyName: t.to.name,
        from: t.effectiveOn,
        reason: `${t.ref}: ${t.reason}`,
        state: 'pending_approval',
        // Raised for the person who requested the transfer, so someone else approves it in BILL-017.
        requestedBy: t.requestedBy,
        requestedByName: t.requestedByName,
        requestedAt: stamp(ctx),
        raisedBy: { kind: 'ownership_transfer', id: t.id, ref: t.ref },
      };
      s.state.payerChanges.push(change);
      t.payerChange = { id: change.id, state: change.state };
      t.status = 'completed';
      t.history.push({ at: stamp(ctx), byName: who.name, action: 'certificate_issued', note: cert.ref }, { at: stamp(ctx), byName: who.name, action: 'payer_change_raised', note: change.id });
      log(ctx, s, 'clearanceIssued', { kind: 'certificate', id: cert.id, label: cert.ref }, { flats: [t.flatCode], values: { transfer: t.ref, payerChange: change.id, effectiveOn: t.effectiveOn } });
      save(ctx);
      return ownershipDetail(ctx, s, t);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ownership-transfers\/(?<transferId>[\w-]+)\/withdraw$/,
    access: requires('residents', 'transfer.review', 'operational', CLEARANCE),
    handle: (ctx): OwnershipTransferDetail => {
      const s = siteOf(ctx, 'residents');
      const t = ownershipOf(ctx, s);
      if (t.requestedBy !== me(ctx).principalId) refuse(ctx, 403, 'not_preparer');
      if (!['requested', 'dues_blocked', 'fee_invoiced', 'clearance_pending'].includes(t.status)) refuse(ctx, 409, 'invalid_state');
      t.status = 'withdrawn';
      t.history.push({ at: stamp(ctx), byName: me(ctx).name, action: 'withdrawn' });
      save(ctx);
      return ownershipDetail(ctx, s, t);
    },
  },
  // -------------------------------------------------------------------------------------------
  // Site settings added by S.1 (BILL-012 cheques, D-46 cash witnessing, D-42 transfer fees)
  // -------------------------------------------------------------------------------------------
  {
    method: 'PATCH',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/cheque-rules$/,
    access: requires('receivables', 'payment_methods.manage', 'operational'),
    handle: (ctx): CollectionSettings['methods'] => {
      const s = site(ctx);
      const input = body<{ enabled: boolean; payableTo: string; depositAccountId: string; maxPostDatedDays: number }>(ctx);
      const rule = s.state.methods.find((m) => m.method === 'cheque')!;
      const deposit = s.state.beneficiaries.find((b) => b.id === input.depositAccountId && b.legalEntityId === s.legalEntityId && b.status === 'verified');
      // Cheques go into a verified account of the issuing entity (the one residents pay today).
      if (!deposit) refuse(ctx, 422, 'account_unknown', 'depositAccountId');
      const days = Math.floor(Number(input.maxPostDatedDays ?? 0));
      if (!(days >= 0 && days <= 30)) refuse(ctx, 422, 'post_dated_days', 'maxPostDatedDays');
      const cheque: ChequeRule = { payableTo: required(ctx, 'payableTo', text(input.payableTo, 120), 5), depositAccountId: deposit!.id, maxPostDatedDays: days };
      Object.assign(rule, { enabled: !!input.enabled, cheque });
      delete rule.gate;
      log(ctx, s, 'chequeRulesSaved', { kind: 'settings', id: 'cheque', label: 'cheque' }, { values: { enabled: String(!!input.enabled), days: String(days) } });
      save(ctx);
      return s.state.methods;
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/cash-witness$/,
    access: requires('receivables', 'payment_methods.manage', 'operational'),
    handle: (ctx) => {
      const s = site(ctx);
      const policy = body<{ policy: string }>(ctx).policy;
      if (policy !== 'single_counter' && policy !== 'second_person') refuse(ctx, 422, 'witness_policy', 'policy');
      s.state.cashWitness = policy as 'single_counter' | 'second_person';
      log(ctx, s, 'cashWitnessSaved', { kind: 'settings', id: 'cash_witness', label: policy! });
      save(ctx);
      return { cashWitness: s.state.cashWitness };
    },
  },
  {
    // A new fee is a new version from a future date with its bylaw reference; issued fees never change.
    method: 'POST',
    pattern: /^\/sites\/(?<siteId>[\w-]+)\/transfer-fees$/,
    access: requires('dues', 'billing_policy.manage', 'operational'),
    handle: (ctx) => {
      const s = siteOf(ctx, 'dues');
      const input = body<{ amount: string; from: string; bylawRef: string }>(ctx);
      const amount = amountField(ctx, 'amount', input.amount);
      const from = String(input.from ?? '');
      if (!DATE.test(from) || from <= ctx.at) refuse(ctx, 422, 'fee_from', 'from');
      const bylawRef = required(ctx, 'bylawRef', text(input.bylawRef, 160), 5);
      for (const r of s.state.transferFees.filter((x) => x.to === undefined || x.to > from)) r.to = from;
      s.state.transferFees.push({ version: Math.max(0, ...s.state.transferFees.map((r) => r.version)) + 1, amount: money(amount), from, bylawRef });
      log(ctx, s, 'transferFeeVersioned', { kind: 'settings', id: 'transfer_fee', label: money(amount).amount }, { values: { from, bylaw: bylawRef } });
      save(ctx);
      return { transferFees: s.state.transferFees };
    },
  },
];
