import {
  APPROVAL_SUBJECTS,
  COMMITTEE_OFFICES,
  S1_FEATURES,
  type ApprovalDetail,
  type ApprovalInbox,
  type ApprovalPolicyVersion,
  type ApprovalRequest,
  type ApprovalRow,
  type ApprovalRule,
  type ApprovalSubject,
  type ApproverRef,
  type Committee360,
  type CommitteeOffice,
  type CommitteeTerm,
  type Delegation,
  type PolicyOverview,
} from '@repo/contracts';
import { can, notFound, requires, type Handler, type HandlerContext } from '../../handler-types';
import { rolesOf } from '../../role-templates';
import { pad } from '../../seed';
import { log, save, siteOf, societyDashboardOf, stamp, type Society } from '../handlers';
import { factOn } from '../model';
import { approvalsGiven, delegationState, evaluate, holdersOf, policyOn, principalsOfParty, raiseApproval, recordDecision, staffOf } from './approvals';
import { amountField, body, me, query, refuse, required, text } from './common';
import { executeReversal, rejectReversal } from './handlers-collect';
import { DATE, addDays, money } from './model';
import { FIN_ROUTES } from './routes';
import { applyOwnershipOutcome } from './handlers-dues';

/**
 * Approvals (APR-001…005) and Committee 360 (RES-008). One decision path for every S.1 subject:
 * the server evaluates the request against the rule snapshotted from the policy in force, refuses
 * the requester, anyone named in the request and anyone without the seat, and only when enough
 * distinct people have approved does the subject move on (`applyOutcome`).
 */

const COMMITTEE = S1_FEATURES.committee;
const core = (ctx: HandlerContext) => siteOf(ctx);

function approvalOf(ctx: HandlerContext, s: Society): ApprovalRequest {
  const a = s.state.finance.approvals.find((x) => x.id === ctx.params.approvalId);
  if (!a) notFound(ctx);
  return a!;
}

/** What the subject is, in facts the approver needs (amounts, accounts, dates, reasons). */
function subjectOf(s: Society, a: ApprovalRequest): ApprovalDetail['subject'] {
  const f = s.state.finance;
  const fact = (key: string, value: string | undefined) => (value ? [{ key, value }] : []);
  switch (a.subject) {
    case 'cash_voucher': {
      const v = f.vouchers.find((x) => x.id === a.subjectId);
      return {
        label: a.subjectRef,
        href: FIN_ROUTES.voucher(a.subjectId),
        facts: v ? [...fact('account', v.accountName), ...fact('direction', v.direction), ...fact('category', v.category), ...fact('amount', v.amount.amount), ...fact('date', v.onDate), ...fact('purpose', v.purpose), ...fact('counterparty', v.counterparty.name), ...fact('evidence', v.evidence.name), ...fact('reversalOf', v.reversalOf?.ref)] : [],
      };
    }
    case 'funds_transfer': {
      const t = f.transfers.find((x) => x.id === a.subjectId);
      return { label: a.subjectRef, href: FIN_ROUTES.transfer(a.subjectId), facts: t ? [...fact('kind', t.kind), ...fact('from', t.legs[0]?.accountName), ...fact('to', t.legs[1]?.accountName), ...fact('amount', t.amount.amount), ...fact('purpose', t.purpose), ...fact('bankReference', t.bankReference), ...fact('reversalOf', t.reversalOf?.ref)] : [] };
    }
    case 'period_reopen': {
      const p = f.periods.find((x) => x.id === a.subjectId);
      return { label: a.subjectRef, href: FIN_ROUTES.close(a.subjectRef), facts: p ? [...fact('period', p.period), ...fact('closedBy', p.closedByName), ...fact('reason', a.summary.values?.reason)] : [] };
    }
    case 'payment_reversal': {
      const p = s.state.payments.find((x) => x.id === a.subjectId);
      const r = f.reversals.find((x) => x.approvalId === a.id);
      const line = r?.bankLineId ? s.state.bank.lines.find((l) => l.id === r.bankLineId) : undefined;
      return { label: a.subjectRef, href: FIN_ROUTES.payment(a.subjectId), facts: p ? [...fact('payer', p.payerName), ...fact('amount', p.amount.amount), ...fact('receipt', p.receiptRef), ...fact('method', p.method), ...fact('reason', r?.reason), ...fact('bankLine', line ? `${line.bankTxnId} · ${line.valueDate}` : undefined)] : [] };
    }
    case 'clearance_waiver': {
      const t = f.ownership.find((x) => x.id === a.subjectId);
      return { label: a.subjectRef, href: FIN_ROUTES.ownershipTransfer(a.subjectId), facts: t ? [...fact('flat', t.flatCode), ...fact('from', t.from.name), ...fact('to', t.to.name), ...fact('amount', t.waiver?.amount.amount), ...fact('reason', t.waiver?.reason)] : [] };
    }
    case 'approval_policy': {
      const v = f.policies.find((x) => x.id === a.subjectId);
      return { label: a.subjectRef, href: FIN_ROUTES.policies('versions'), facts: v ? [...fact('version', String(v.version)), ...fact('effectiveFrom', v.effectiveFrom), ...fact('rules', String(v.rules.length)), ...fact('note', v.note)] : [] };
    }
  }
}

/** The subject moves on only when its request is decided (approved by enough people, or rejected). */
function applyOutcome(ctx: HandlerContext, s: Society, a: ApprovalRequest) {
  const f = s.state.finance;
  const who = me(ctx);
  const at = stamp(ctx);
  const approved = a.status === 'approved';
  const names = a.decisions.filter((d) => d.decision === 'approve').map((d) => d.byName).join(', ');
  switch (a.subject) {
    case 'cash_voucher': {
      const v = f.vouchers.find((x) => x.id === a.subjectId)!;
      v.status = approved ? 'approved' : 'rejected';
      v.history.push({ at, by: who.principalId, byName: who.name, action: approved ? 'approved' : 'rejected', note: a.decisions.at(-1)?.reason });
      if (!approved && v.reversalOf) {
        const original = f.vouchers.find((x) => x.id === v.reversalOf!.id);
        if (original?.reversedBy?.id === v.id) delete original.reversedBy;
      }
      break;
    }
    case 'funds_transfer': {
      const t = f.transfers.find((x) => x.id === a.subjectId)!;
      // Approved means "approved instruction — not sent": nothing settles until evidence arrives.
      t.status = approved ? 'approved_instruction' : 'rejected';
      t.history.push({ at, by: who.principalId, byName: who.name, action: approved ? 'approved' : 'rejected', note: approved ? names : a.decisions.at(-1)?.reason });
      if (!approved && t.reversalOf) {
        const original = f.transfers.find((x) => x.id === t.reversalOf!.id);
        if (original?.reversedBy?.id === t.id) delete original.reversedBy;
      }
      break;
    }
    case 'period_reopen': {
      const p = f.periods.find((x) => x.id === a.subjectId)!;
      if (approved) p.state = 'reopened';
      p.history.push({ at, by: who.principalId, byName: who.name, action: approved ? 'reopened' : 'reopen_rejected', note: a.decisions.at(-1)?.reason });
      log(ctx, s, approved ? 'periodReopened' : 'reopenRejected', { kind: 'period', id: p.id, label: p.period }, { values: { approval: a.ref } });
      break;
    }
    case 'payment_reversal': {
      const r = f.reversals.find((x) => x.approvalId === a.id);
      if (approved && r) executeReversal(ctx, s, r.id, { name: names });
      else rejectReversal(s, a.id);
      if (!approved && r?.chequeId) {
        const c = f.cheques.find((x) => x.id === r.chequeId);
        if (c) delete c.reversal;
      }
      break;
    }
    case 'clearance_waiver':
      applyOwnershipOutcome(ctx, s, a);
      break;
    case 'approval_policy': {
      const v = f.policies.find((x) => x.id === a.subjectId)!;
      if (approved) {
        // The previous version governs until the new one starts; nothing is edited in place.
        for (const old of f.policies.filter((x) => x.status === 'active' && x.id !== v.id && x.effectiveTo === undefined)) {
          old.effectiveTo = v.effectiveFrom;
          old.status = 'retired';
        }
        v.status = 'active';
      } else v.status = 'rejected';
      log(ctx, s, approved ? 'policyActivated' : 'policyRejected', { kind: 'policy', id: v.id, label: `v${v.version}` }, { values: { effectiveFrom: v.effectiveFrom } });
      break;
    }
  }
}

function inboxRow(ctx: HandlerContext, s: Society, a: ApprovalRequest): ApprovalRow {
  const ev = evaluate(s.state, ctx.tenantId!, a, me(ctx), ctx.at);
  return { ...a, yours: ev.you.canDecide, remaining: ev.remaining };
}

function audit(a: ApprovalRequest): ApprovalDetail['audit'] {
  return [
    { at: a.requestedAt, byName: a.requestedByName, action: 'requested' },
    ...a.decisions.map((d) => ({ at: d.at, byName: d.byName, action: d.decision === 'approve' ? (d.as.kind === 'delegate' ? 'approved_as_delegate' : 'approved') : 'rejected', note: d.reason })),
    ...(a.status === 'withdrawn' && a.decidedAt ? [{ at: a.decidedAt, byName: a.requestedByName, action: 'withdrawn' }] : []),
  ];
}

// ---------------------------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------------------------

function policyOverview(ctx: HandlerContext, s: Society): PolicyOverview {
  const f = s.state.finance;
  const active = policyOn(s.state, ctx.at) ?? f.policies[0]!;
  const refs: ApproverRef[] = [...COMMITTEE_OFFICES.map((office) => ({ kind: 'office' as const, office })), ...rolesOf(ctx.tenantId!, 'association').map((r) => ({ kind: 'role' as const, roleId: r.id }))];
  const manager = can(ctx, 'approval_policy.manage');
  return {
    versions: [...f.policies].sort((a, b) => b.version - a.version),
    active,
    holders: refs.map((ref) => ({ ref, people: holdersOf(s.state, ctx.tenantId!, ref, ctx.at) })),
    roles: rolesOf(ctx.tenantId!, 'association').map((r) => ({ id: r.id, labelKey: r.labelKey })),
    actions: { draft: manager && !f.policies.some((p) => p.status === 'draft' || p.status === 'pending'), submit: manager },
  };
}

function rulesFrom(ctx: HandlerContext, raw: unknown): ApprovalRule[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 40) refuse(ctx, 422, 'policy_rules', 'rules');
  return (raw as Array<Record<string, unknown>>).map((r, i) => {
    const subject = APPROVAL_SUBJECTS.find((x) => x === r.subject);
    if (!subject) refuse(ctx, 422, 'policy_subject', `rules.${i}.subject`);
    const approvers = (Array.isArray(r.approvers) ? r.approvers : []) as ApproverRef[];
    const clean = approvers.filter((a) => (a.kind === 'office' && COMMITTEE_OFFICES.includes(a.office)) || (a.kind === 'role' && typeof a.roleId === 'string'));
    if (!clean.length) refuse(ctx, 422, 'policy_approvers', `rules.${i}.approvers`);
    const required = Math.floor(Number(r.approvalsRequired));
    if (!(required >= 1 && required <= 3)) refuse(ctx, 422, 'policy_required', `rules.${i}.approvalsRequired`);
    const min = r.minAmount ? amountField(ctx, `rules.${i}.minAmount`, r.minAmount) : undefined;
    const max = r.maxAmount ? amountField(ctx, `rules.${i}.maxAmount`, r.maxAmount) : undefined;
    if (min !== undefined && max !== undefined && min >= max) refuse(ctx, 422, 'policy_band', `rules.${i}.maxAmount`);
    return { id: `rul_${pad(i + 1, 2)}_${subject}`, subject: subject!, ...(min !== undefined ? { minAmount: money(min) } : {}), ...(max !== undefined ? { maxAmount: money(max) } : {}), approvers: clean, approvalsRequired: required };
  });
}

// ---------------------------------------------------------------------------------------------
// Committee
// ---------------------------------------------------------------------------------------------

const termState = (t: Pick<CommitteeTerm, 'from' | 'to'>, on: string): CommitteeTerm['state'] => (on < t.from ? 'scheduled' : t.to !== undefined && on >= t.to ? 'ended' : 'active');

function committee360(ctx: HandlerContext, s: Society): Committee360 {
  const f = s.state.finance;
  const c = f.committee;
  const policy = policyOn(s.state, ctx.at) ?? f.policies[0]!;
  const people = s.view.facts.filter((x) => x.role === 'owner' && factOn(x, ctx.at));
  const candidates = [...new Map(people.map((p) => [p.partyId, p])).values()].map((p) => {
    const principal = principalsOfParty(p.partyId)[0];
    return { partyId: p.partyId, name: p.partyName, flats: people.filter((x) => x.partyId === p.partyId).map((x) => s.view.model.flats.find((fl) => fl.id === x.flatId)?.code ?? ''), ...(principal ? { principalId: principal } : {}) };
  });
  return {
    committee: { id: c.id, name: c.name, legalEntityName: s.state.beneficiaries[0]?.legalEntityName ?? '', termEnds: c.termEnds },
    offices: c.offices.map((o) => ({
      office: o.office,
      singleHolder: o.singleHolder,
      ...(o.roleId ? { roleId: o.roleId } : {}),
      // Spending authority is read from the policy in force: an office has no power of its own.
      authority: policy.rules.filter((r) => r.approvers.some((a) => a.kind === 'office' && a.office === o.office)).map((r) => ({ subject: r.subject, ...(r.maxAmount ? { upTo: r.maxAmount } : {}), withOthers: r.approvalsRequired - 1 })),
    })),
    terms: c.terms.map((t) => ({ ...t, state: termState(t, ctx.at) })),
    meetings: [...c.meetings].sort((a, b) => b.on.localeCompare(a.on)),
    decisions: [...c.decisions].sort((a, b) => b.on.localeCompare(a.on) || b.ref.localeCompare(a.ref)),
    policy: { id: policy.id, version: policy.version, effectiveFrom: policy.effectiveFrom },
    delegations: f.delegations.map((d) => ({ ...d, state: delegationState(d, ctx.at) })),
    approvals: { pending: f.approvals.filter((a) => a.status === 'pending').length, href: FIN_ROUTES.approvals() },
    audit: s.state.audit.filter((e) => e.target.kind === 'committee' || e.target.kind === 'policy' || e.target.kind === 'delegation').map((e) => ({ at: e.at, byName: e.byName, action: e.action, label: e.target.label })).reverse(),
    roles: rolesOf(ctx.tenantId!, 'association').map((r) => ({ id: r.id, labelKey: r.labelKey })),
    candidates,
    actions: { manage: can(ctx, 'committee.manage') },
  };
}

const SEE = ['approval.view', 'approval.decide', 'approval_policy.manage'] as const;

export const FINANCE_GOVERNANCE_HANDLERS: readonly Handler[] = [
  // -------------------------------------------------------------------------------------------
  // APR-001/002/003
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/approvals$/,
    access: requires('core', SEE, 'history_read'),
    handle: (ctx): ApprovalInbox => {
      const s = core(ctx);
      const who = me(ctx);
      const rows = [...s.state.finance.approvals].reverse().map((a) => inboxRow(ctx, s, a));
      const mine = rows.filter((r) => r.status === 'pending' && r.yours);
      const requested = rows.filter((r) => r.requestedBy === who.principalId);
      const others = rows.filter((r) => !mine.includes(r) && !requested.includes(r));
      // The approvals C.1/C.2/D.1 already raise keep their own screens and maker-checker; listed here.
      const fixed = can(ctx, 'site.view', 'history_read') || can(ctx, 'billing_run.view', 'history_read') ? societyDashboardOf(ctx).approvals.items.flatMap((i) => (i.kind === 'approval_request' ? [] : [{ kind: i.kind, id: i.id, label: i.label, href: i.href, yours: i.yours }])) : [];
      const { q } = query(ctx);
      const hit = (r: ApprovalRow) => !q || [r.ref, r.subjectRef, r.requestedByName, ...Object.values(r.summary.values ?? {})].some((v) => v.toLocaleLowerCase('en').includes(q.toLocaleLowerCase('en')));
      return { mine: mine.filter(hit), requested: requested.filter(hit), others: others.filter(hit), fixed, counts: { mine: mine.length, requested: requested.filter((r) => r.status === 'pending').length, fixed: fixed.filter((x) => x.yours).length } };
    },
  },
  {
    method: 'GET',
    pattern: /^\/approvals\/(?<approvalId>[\w-]+)$/,
    access: requires('core', SEE, 'history_read'),
    handle: (ctx): ApprovalDetail => {
      const s = core(ctx);
      const a = approvalOf(ctx, s);
      const policy = s.state.finance.policies.find((p) => p.id === a.policy.versionId)!;
      return { request: a, evaluation: evaluate(s.state, ctx.tenantId!, a, me(ctx), ctx.at), policy, subject: subjectOf(s, a), audit: audit(a) };
    },
  },
  {
    // APR-003: one person's decision. The server re-evaluates eligibility; a name never decides it.
    method: 'POST',
    pattern: /^\/approvals\/(?<approvalId>[\w-]+)\/decide$/,
    access: requires('core', 'approval.decide', 'operational'),
    handle: (ctx): ApprovalDetail => {
      const s = core(ctx);
      const a = approvalOf(ctx, s);
      const input = body<{ decision: string; reason: string }>(ctx);
      const decision = input.decision === 'reject' ? 'reject' : input.decision === 'approve' ? 'approve' : null;
      if (!decision) refuse(ctx, 422, 'decision', 'decision');
      const reason = required(ctx, 'reason', text(input.reason, 300), decision === 'reject' ? 10 : 3);
      const ev = evaluate(s.state, ctx.tenantId!, a, me(ctx), ctx.at);
      if (!ev.you.canDecide) refuse(ctx, ev.you.reason === 'not_pending' ? 409 : 403, `decide_${ev.you.reason}`);
      const seat = ev.eligible.find((e) => e.principalId === me(ctx).principalId)!;
      const before = a.status;
      recordDecision(a, { by: seat.principalId, byName: seat.name, decision: decision!, reason, at: stamp(ctx), as: seat.as });
      log(ctx, s, decision === 'approve' ? 'approvalGiven' : 'approvalRejected', { kind: 'approval', id: a.id, label: a.ref }, { values: { subject: a.subject, ref: a.subjectRef, as: seat.as.kind, remaining: String(Math.max(0, a.rule.approvalsRequired - approvalsGiven(a))) } });
      if (before === 'pending' && a.status !== 'pending') applyOutcome(ctx, s, a);
      save(ctx);
      return { request: a, evaluation: evaluate(s.state, ctx.tenantId!, a, me(ctx), ctx.at), policy: s.state.finance.policies.find((p) => p.id === a.policy.versionId)!, subject: subjectOf(s, a), audit: audit(a) };
    },
  },
  // -------------------------------------------------------------------------------------------
  // APR-004 policies
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/approval-policies$/,
    access: requires('core', [...SEE, 'committee.view'], 'history_read'),
    handle: (ctx): PolicyOverview => policyOverview(ctx, core(ctx)),
  },
  {
    method: 'POST',
    pattern: /^\/approval-policies$/,
    access: requires('core', 'approval_policy.manage', 'operational'),
    handle: (ctx): PolicyOverview => {
      const s = core(ctx);
      const f = s.state.finance;
      if (f.policies.some((p) => p.status === 'draft' || p.status === 'pending')) refuse(ctx, 409, 'policy_draft_exists');
      const base = policyOn(s.state, ctx.at)!;
      const who = me(ctx);
      const v: ApprovalPolicyVersion = { id: `apv_anr_v${f.policies.length + 1}`, legalEntityId: s.legalEntityId, version: Math.max(...f.policies.map((p) => p.version)) + 1, status: 'draft', effectiveFrom: addDays(ctx.at, 1), rules: structuredClone(base.rules), note: '', createdBy: who.principalId, createdByName: who.name, createdAt: stamp(ctx) };
      f.policies.push(v);
      log(ctx, s, 'policyDrafted', { kind: 'policy', id: v.id, label: `v${v.version}` });
      save(ctx);
      return policyOverview(ctx, s);
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/approval-policies\/(?<policyId>[\w-]+)$/,
    access: requires('core', 'approval_policy.manage', 'operational'),
    handle: (ctx): PolicyOverview => {
      const s = core(ctx);
      const v = s.state.finance.policies.find((p) => p.id === ctx.params.policyId);
      if (!v) notFound(ctx);
      if (v!.status !== 'draft') refuse(ctx, 409, 'policy_not_draft');
      if (v!.createdBy !== me(ctx).principalId) refuse(ctx, 403, 'not_preparer');
      const input = body<{ rules: unknown; effectiveFrom: string; note: string }>(ctx);
      const effectiveFrom = String(input.effectiveFrom ?? v!.effectiveFrom);
      if (!DATE.test(effectiveFrom) || effectiveFrom <= ctx.at) refuse(ctx, 422, 'policy_effective', 'effectiveFrom');
      Object.assign(v!, { rules: rulesFrom(ctx, input.rules ?? v!.rules), effectiveFrom, note: text(input.note, 300) });
      save(ctx);
      return policyOverview(ctx, s);
    },
  },
  {
    // A draft is approved under the version in force, by someone other than its author: it never governs itself.
    method: 'POST',
    pattern: /^\/approval-policies\/(?<policyId>[\w-]+)\/submit$/,
    access: requires('core', 'approval_policy.manage', 'operational'),
    handle: (ctx): PolicyOverview => {
      const s = core(ctx);
      const v = s.state.finance.policies.find((p) => p.id === ctx.params.policyId);
      if (!v) notFound(ctx);
      if (v!.status === 'pending') return policyOverview(ctx, s);
      if (v!.status !== 'draft') refuse(ctx, 409, 'policy_not_draft');
      if (v!.createdBy !== me(ctx).principalId) refuse(ctx, 403, 'not_preparer');
      required(ctx, 'note', v!.note, 5);
      const who = me(ctx);
      const approval = raiseApproval(s.state, { subject: 'approval_policy', subjectId: v!.id, subjectRef: `v${v!.version}`, summary: { key: 'approval_policy', values: { version: String(v!.version), from: v!.effectiveFrom } }, href: FIN_ROUTES.policies('versions'), requester: { principalId: who.principalId, name: who.name }, on: ctx.at, at: stamp(ctx) });
      if (!approval) refuse(ctx, 409, 'no_policy_rule');
      Object.assign(v!, { status: 'pending', approvalId: approval!.id, approvalRef: approval!.ref });
      log(ctx, s, 'policySubmitted', { kind: 'policy', id: v!.id, label: `v${v!.version}` }, { values: { approval: approval!.ref } });
      save(ctx);
      return policyOverview(ctx, s);
    },
  },
  {
    method: 'POST',
    pattern: /^\/approval-policies\/(?<policyId>[\w-]+)\/discard$/,
    access: requires('core', 'approval_policy.manage', 'operational'),
    handle: (ctx): PolicyOverview => {
      const s = core(ctx);
      const f = s.state.finance;
      const v = f.policies.find((p) => p.id === ctx.params.policyId);
      if (!v || v.status !== 'draft') refuse(ctx, 409, 'policy_not_draft');
      if (v!.createdBy !== me(ctx).principalId) refuse(ctx, 403, 'not_preparer');
      f.policies = f.policies.filter((p) => p.id !== v!.id);
      save(ctx);
      return policyOverview(ctx, s);
    },
  },
  // -------------------------------------------------------------------------------------------
  // APR-005 delegation
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/delegations$/,
    access: requires('core', SEE, 'history_read'),
    handle: (ctx): { delegations: Delegation[]; people: Array<{ principalId: string; name: string }>; actions: { create: boolean } } => {
      const s = core(ctx);
      return {
        delegations: [...s.state.finance.delegations].reverse().map((d) => ({ ...d, state: delegationState(d, ctx.at) })),
        people: staffOf(ctx.tenantId!).filter((p) => p.permissions.includes('approval.decide') && p.principalId !== me(ctx).principalId).map((p) => ({ principalId: p.principalId, name: p.name })),
        actions: { create: can(ctx, 'approval.decide') },
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/delegations$/,
    access: requires('core', 'approval.decide', 'operational'),
    handle: (ctx): Delegation => {
      const s = core(ctx);
      const input = body<{ toPrincipalId: string; subjects: string[]; from: string; to: string; reason: string }>(ctx);
      const who = me(ctx);
      const to = staffOf(ctx.tenantId!).find((p) => p.principalId === input.toPrincipalId && p.permissions.includes('approval.decide'));
      if (!to) refuse(ctx, 422, 'delegate_unknown', 'toPrincipalId');
      if (to!.principalId === who.principalId) refuse(ctx, 422, 'delegate_self', 'toPrincipalId');
      const subjects = [...new Set((Array.isArray(input.subjects) ? input.subjects : []).filter((x): x is ApprovalSubject => APPROVAL_SUBJECTS.includes(x as ApprovalSubject)))];
      if (!subjects.length) refuse(ctx, 422, 'delegate_subjects', 'subjects');
      const from = String(input.from ?? '');
      const until = String(input.to ?? '');
      if (!DATE.test(from) || from < ctx.at) refuse(ctx, 422, 'delegate_from', 'from');
      if (!DATE.test(until) || until < from || until > addDays(from, 90)) refuse(ctx, 422, 'delegate_to', 'to');
      const reason = required(ctx, 'reason', text(input.reason, 200), 5);
      const d: Delegation = { id: `dlg_anr_${pad(s.state.finance.delegations.length + 1, 4)}`, fromPrincipalId: who.principalId, fromName: who.name, toPrincipalId: to!.principalId, toName: to!.name, subjects, from, to: until, reason, createdBy: who.principalId, createdByName: who.name, createdAt: stamp(ctx), state: 'scheduled' };
      s.state.finance.delegations.push(d);
      log(ctx, s, 'delegationCreated', { kind: 'delegation', id: d.id, label: `${d.fromName} → ${d.toName}` }, { values: { from, to: until, subjects: subjects.join(', ') } });
      save(ctx);
      return { ...d, state: delegationState(d, ctx.at) };
    },
  },
  {
    method: 'POST',
    pattern: /^\/delegations\/(?<delegationId>[\w-]+)\/end$/,
    access: requires('core', ['approval.decide', 'approval_policy.manage'], 'operational'),
    handle: (ctx): Delegation => {
      const s = core(ctx);
      const d = s.state.finance.delegations.find((x) => x.id === ctx.params.delegationId);
      if (!d) notFound(ctx);
      if (d!.fromPrincipalId !== me(ctx).principalId && !can(ctx, 'approval_policy.manage')) refuse(ctx, 403, 'not_delegator');
      if (!d!.endedAt) Object.assign(d!, { endedAt: stamp(ctx), endedByName: me(ctx).name });
      log(ctx, s, 'delegationEnded', { kind: 'delegation', id: d!.id, label: `${d!.fromName} → ${d!.toName}` });
      save(ctx);
      return { ...d!, state: delegationState(d!, ctx.at) };
    },
  },
  // -------------------------------------------------------------------------------------------
  // RES-008 Committee 360
  // -------------------------------------------------------------------------------------------
  {
    method: 'GET',
    pattern: /^\/committee$/,
    access: requires('residents', 'committee.view', 'history_read', COMMITTEE),
    handle: (ctx): Committee360 => committee360(ctx, siteOf(ctx, 'residents')),
  },
  {
    // A term is effective-dated; a single-holder office never has two holders on the same day.
    method: 'POST',
    pattern: /^\/committee\/terms$/,
    access: requires('residents', 'committee.manage', 'operational', COMMITTEE),
    handle: (ctx): Committee360 => {
      const s = siteOf(ctx, 'residents');
      const c = s.state.finance.committee;
      const input = body<{ office: string; partyId: string; from: string; to: string; appointedBy: string; decisionRef: string }>(ctx);
      const office = c.offices.find((o) => o.office === input.office);
      if (!office) refuse(ctx, 422, 'office_unknown', 'office');
      const owner = s.view.facts.find((x) => x.role === 'owner' && x.partyId === input.partyId);
      if (!owner) refuse(ctx, 422, 'member_unknown', 'partyId');
      const from = String(input.from ?? '');
      const to = input.to ? String(input.to) : undefined;
      if (!DATE.test(from) || (to !== undefined && (!DATE.test(to) || to <= from))) refuse(ctx, 422, 'term_dates', 'from');
      const overlaps = (t: CommitteeTerm) => t.office === office!.office && t.from < (to ?? '9999-12-31') && (t.to === undefined || from < t.to);
      if (office!.singleHolder && c.terms.some(overlaps)) refuse(ctx, 409, 'office_taken', 'from');
      if (c.terms.some((t) => t.member.partyId === owner!.partyId && overlaps(t))) refuse(ctx, 409, 'member_already_holds', 'partyId');
      const principal = principalsOfParty(owner!.partyId)[0];
      const t: CommitteeTerm = {
        id: `ctm_anr_${pad(c.terms.length + 1, 4)}`,
        office: office!.office as CommitteeOffice,
        member: { name: owner!.partyName, partyId: owner!.partyId, ...(principal ? { principalId: principal } : {}), flats: s.view.facts.filter((x) => x.role === 'owner' && x.partyId === owner!.partyId).map((x) => s.view.model.flats.find((fl) => fl.id === x.flatId)?.code ?? '') },
        from,
        ...(to ? { to } : {}),
        appointedBy: input.appointedBy === 'co_option' ? 'co_option' : input.appointedBy === 'resolution' ? 'resolution' : 'election',
        ...(text(input.decisionRef, 30) ? { decisionRef: text(input.decisionRef, 30) } : {}),
        state: 'active',
      };
      c.terms.push(t);
      log(ctx, s, 'termAdded', { kind: 'committee', id: t.id, label: t.member.name }, { values: { office: t.office, from } });
      save(ctx);
      return committee360(ctx, s);
    },
  },
  {
    method: 'POST',
    pattern: /^\/committee\/terms\/(?<termId>[\w-]+)\/end$/,
    access: requires('residents', 'committee.manage', 'operational', COMMITTEE),
    handle: (ctx): Committee360 => {
      const s = siteOf(ctx, 'residents');
      const t = s.state.finance.committee.terms.find((x) => x.id === ctx.params.termId);
      if (!t) notFound(ctx);
      const input = body<{ on: string; reason: string }>(ctx);
      const on = String(input.on ?? ctx.at);
      if (!DATE.test(on) || on <= t!.from || (t!.to !== undefined && on >= t!.to)) refuse(ctx, 422, 'term_dates', 'on');
      Object.assign(t!, { to: on, endedReason: required(ctx, 'reason', text(input.reason, 200), 5) });
      log(ctx, s, 'termEnded', { kind: 'committee', id: t!.id, label: t!.member.name }, { values: { office: t!.office, on } });
      save(ctx);
      return committee360(ctx, s);
    },
  },
  {
    method: 'POST',
    pattern: /^\/committee\/meetings$/,
    access: requires('residents', 'committee.manage', 'operational', COMMITTEE),
    handle: (ctx): Committee360 => {
      const s = siteOf(ctx, 'residents');
      const c = s.state.finance.committee;
      const input = body<{ on: string; title: string; attendees: string[]; quorum: boolean; minutes: string }>(ctx);
      const on = String(input.on ?? '');
      if (!DATE.test(on) || on > ctx.at) refuse(ctx, 422, 'meeting_date', 'on');
      const title = required(ctx, 'title', text(input.title, 120), 5);
      const minutes = required(ctx, 'minutes', text(input.minutes, 2000), 10);
      const n = c.meetings.length + 1;
      c.meetings.push({ id: `cmm_anr_${pad(n, 4)}`, ref: `CM-${n + 6}/2026`, on, title, attendees: (Array.isArray(input.attendees) ? input.attendees : []).map((a) => text(a, 80)).filter(Boolean).slice(0, 20), quorum: !!input.quorum, minutes, recordedByName: me(ctx).name });
      log(ctx, s, 'meetingRecorded', { kind: 'committee', id: `cmm_anr_${pad(n, 4)}`, label: title }, { values: { on } });
      save(ctx);
      return committee360(ctx, s);
    },
  },
  {
    method: 'POST',
    pattern: /^\/committee\/decisions$/,
    access: requires('residents', 'committee.manage', 'operational', COMMITTEE),
    handle: (ctx): Committee360 => {
      const s = siteOf(ctx, 'residents');
      const c = s.state.finance.committee;
      const input = body<{ meetingId: string; on: string; subject: string; outcome: string; votes: { for: number; against: number; abstain: number }; published: boolean }>(ctx);
      const meeting = input.meetingId ? c.meetings.find((m) => m.id === input.meetingId) : undefined;
      if (input.meetingId && !meeting) refuse(ctx, 422, 'meeting_unknown', 'meetingId');
      const on = meeting?.on ?? String(input.on ?? '');
      if (!DATE.test(on) || on > ctx.at) refuse(ctx, 422, 'meeting_date', 'on');
      const subject = required(ctx, 'subject', text(input.subject, 200), 5);
      const votes = { for: Math.max(0, Math.floor(Number(input.votes?.for) || 0)), against: Math.max(0, Math.floor(Number(input.votes?.against) || 0)), abstain: Math.max(0, Math.floor(Number(input.votes?.abstain) || 0)) };
      const outcome = input.outcome === 'rejected' ? 'rejected' : input.outcome === 'noted' ? 'noted' : 'approved';
      if (outcome === 'approved' && votes.for <= votes.against) refuse(ctx, 422, 'votes_outcome', 'votes');
      const n = c.decisions.length + 7;
      const id = `cmd_anr_${pad(n, 4)}`;
      c.decisions.push({ id, ref: `R-${n}/2026`, ...(meeting ? { meetingId: meeting.id, meetingRef: meeting.ref } : {}), on, subject, outcome, votes, recordedByName: me(ctx).name, published: !!input.published });
      log(ctx, s, 'decisionRecorded', { kind: 'committee', id, label: `R-${n}/2026` }, { values: { subject, outcome } });
      save(ctx);
      return committee360(ctx, s);
    },
  },
  {
    // Linking an office to a staff role: the holder's powers come from that role and the policy, never the title.
    method: 'PATCH',
    pattern: /^\/committee\/offices\/(?<office>[\w-]+)$/,
    access: requires('residents', 'committee.manage', 'operational', COMMITTEE),
    handle: (ctx): Committee360 => {
      const s = siteOf(ctx, 'residents');
      const o = s.state.finance.committee.offices.find((x) => x.office === ctx.params.office);
      if (!o) notFound(ctx);
      const roleId = text(body<{ roleId: string }>(ctx).roleId, 40);
      if (roleId && !rolesOf(ctx.tenantId!, 'association').some((r) => r.id === roleId)) refuse(ctx, 422, 'role_unknown', 'roleId');
      if (roleId) o!.roleId = roleId;
      else delete o!.roleId;
      log(ctx, s, 'officeLinked', { kind: 'committee', id: o!.office, label: o!.office }, { values: { role: roleId || '—' } });
      save(ctx);
      return committee360(ctx, s);
    },
  },
];
