import type { ApprovalDecision, ApprovalEvaluation, ApprovalPolicyVersion, ApprovalRequest, ApprovalRule, ApprovalSubject, ApproverRef, Delegation, Money, Permission } from '@repo/contracts';
import { ALL_PERSONAS } from '../../people';
import { pad } from '../../seed';
import { nextRef, type SocietyState } from '../state';
import { money, paisa } from './model';

/**
 * Approval policies (APR-001…005, D-29, P1-9). Rules are versioned data, chosen by date; no amount
 * is hard-coded in an engine. Who may decide is derived from the rule (committee offices in force,
 * staff roles) and time-bound delegations, never from a title alone. Every check uses principal ids:
 * - the requester never decides their own request, and nobody named in it (the person paid, the
 *   outgoing owner) decides it either (I-35);
 * - a delegate never decides their own request, nor acts for the person who asked;
 * - a draft policy never governs its own approval: it is approved under the version in force.
 * C.1/C.2/D.1 approvals keep their own fixed maker-checker; they are only listed in the inbox.
 */

/** The permission a person needs, besides `approval.decide`, to approve a subject as an office or role holder. */
export const SUBJECT_PERMISSION: Partial<Record<ApprovalSubject, Permission>> = {
  cash_voucher: 'cash_voucher.approve',
  funds_transfer: 'funds_transfer.approve',
  payment_reversal: 'payment_exception.approve',
  clearance_waiver: 'transfer.approve',
};

export interface StaffPrincipal {
  principalId: string;
  name: string;
  permissions: readonly Permission[];
  roleId?: string;
}

/** The organisation's staff sign-ins (one per principal; a person with two apps is one principal). */
export function staffOf(tenantId: string): StaffPrincipal[] {
  return ALL_PERSONAS.filter((p) => p.tenantId === tenantId && p.app === 'backoffice').map((p) => ({ principalId: p.principalId, name: p.displayName, permissions: p.permissions, ...(p.roleId ? { roleId: p.roleId } : {}) }));
}

/** Principals who are this party (a resident with a staff sign-in is one principal across apps). */
export const principalsOfParty = (partyId: string | undefined) => (partyId ? [...new Set(ALL_PERSONAS.filter((p) => p.partyId === partyId).map((p) => p.principalId))] : []);

/** The version in force on a date (active, or retired after it). Drafts and pending versions never govern. */
export function policyOn(state: SocietyState, date: string): ApprovalPolicyVersion | null {
  return (
    state.finance.policies
      .filter((p) => (p.status === 'active' || p.status === 'retired') && p.effectiveFrom <= date && (p.effectiveTo === undefined || date < p.effectiveTo))
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

/** The rule for a subject and amount (bands: from inclusive, to exclusive). */
export function ruleFor(policy: Pick<ApprovalPolicyVersion, 'rules'>, subject: ApprovalSubject, amount?: bigint): ApprovalRule | null {
  return (
    policy.rules.find((r) => r.subject === subject && (amount === undefined || ((r.minAmount === undefined || amount >= paisa(r.minAmount)) && (r.maxAmount === undefined || amount < paisa(r.maxAmount))))) ??
    null
  );
}

const inForce = (from: string, to: string | undefined, on: string) => from <= on && (to === undefined || on < to);

/** People who hold an approver seat on a date: an office (through its term holders with a sign-in) or a role. */
export function holdersOf(state: SocietyState, tenantId: string, ref: ApproverRef, on: string): Array<{ principalId: string; name: string }> {
  if (ref.kind === 'office') {
    return state.finance.committee.terms
      .filter((t) => t.office === ref.office && t.member.principalId && inForce(t.from, t.to, on))
      .map((t) => ({ principalId: t.member.principalId!, name: t.member.name }));
  }
  return staffOf(tenantId)
    .filter((s) => s.roleId === ref.roleId)
    .map((s) => ({ principalId: s.principalId, name: s.name }));
}

export const delegationState = (d: Pick<Delegation, 'from' | 'to' | 'endedAt'>, on: string): Delegation['state'] =>
  d.endedAt ? 'ended' : on < d.from ? 'scheduled' : on > d.to ? 'expired' : 'active';

/**
 * Everyone who may decide a pending request today, and how. Excluded: the requester, anyone named
 * in the request, anyone who already decided, anyone without `approval.decide` (and, for an office
 * or role holder, the subject's own permission). A delegate acts only for an eligible holder who is
 * not themselves excluded, and only within the delegation's subjects and dates.
 */
export function eligibleFor(state: SocietyState, tenantId: string, request: ApprovalRequest, on: string): ApprovalEvaluation['eligible'] {
  const staff = staffOf(tenantId);
  const holds = (pid: string, p: Permission) => staff.find((s) => s.principalId === pid)?.permissions.includes(p) ?? false;
  const blocked = new Set([request.requestedBy, ...request.conflicted, ...request.decisions.map((d) => d.by)]);
  const subjectPermission = SUBJECT_PERMISSION[request.subject];
  const seats: Array<{ principalId: string; name: string; as: ApprovalDecision['as'] }> = [];
  for (const ref of request.rule.approvers) {
    for (const h of holdersOf(state, tenantId, ref, on)) seats.push({ ...h, as: ref.kind === 'office' ? { kind: 'office', office: ref.office } : { kind: 'role', roleId: ref.roleId } });
  }
  const out: ApprovalEvaluation['eligible'] = [];
  const add = (e: ApprovalEvaluation['eligible'][number]) => {
    if (!out.some((x) => x.principalId === e.principalId)) out.push(e);
  };
  for (const seat of seats) {
    if (blocked.has(seat.principalId)) continue;
    if (!holds(seat.principalId, 'approval.decide') || (subjectPermission && !holds(seat.principalId, subjectPermission))) continue;
    add(seat);
  }
  for (const d of state.finance.delegations.filter((x) => delegationState(x, on) === 'active' && x.subjects.includes(request.subject))) {
    const seat = seats.find((s) => s.principalId === d.fromPrincipalId);
    // A delegate never acts for the requester or a conflicted person, and never on their own request.
    if (!seat || request.requestedBy === d.fromPrincipalId || request.conflicted.includes(d.fromPrincipalId)) continue;
    if (blocked.has(d.toPrincipalId) || !holds(d.toPrincipalId, 'approval.decide')) continue;
    // One person, one approval: whoever already decided for that seat makes the delegate redundant.
    if (request.decisions.some((x) => x.by === d.fromPrincipalId)) continue;
    add({
      principalId: d.toPrincipalId,
      name: d.toName,
      as: { kind: 'delegate', ...(seat.as.kind === 'office' ? { office: seat.as.office } : seat.as.kind === 'role' ? { roleId: seat.as.roleId } : {}), forPrincipalId: d.fromPrincipalId, forName: d.fromName, delegationId: d.id },
    });
  }
  return out;
}

export const approvalsGiven = (r: Pick<ApprovalRequest, 'decisions'>) => new Set(r.decisions.filter((d) => d.decision === 'approve').map((d) => d.by)).size;

export function evaluate(state: SocietyState, tenantId: string, request: ApprovalRequest, me: { principalId: string; permissions: readonly Permission[] }, on: string): ApprovalEvaluation {
  const eligible = request.status === 'pending' ? eligibleFor(state, tenantId, request, on) : [];
  const remaining = Math.max(0, request.rule.approvalsRequired - approvalsGiven(request));
  const reason: ApprovalEvaluation['you']['reason'] =
    request.status !== 'pending'
      ? 'not_pending'
      : request.requestedBy === me.principalId
        ? 'own_request'
        : request.conflicted.includes(me.principalId)
          ? 'conflict_of_interest'
          : request.decisions.some((d) => d.by === me.principalId)
            ? 'already_decided'
            : !me.permissions.includes('approval.decide')
              ? 'permission_missing'
              : eligible.some((e) => e.principalId === me.principalId)
                ? undefined
                : state.finance.delegations.some((d) => d.toPrincipalId === me.principalId && d.fromPrincipalId === request.requestedBy && delegationState(d, on) === 'active')
                  ? 'delegate_own_request'
                  : 'not_an_approver';
  return { eligible, you: { canDecide: reason === undefined, ...(reason ? { reason } : {}) }, remaining };
}

export interface NewApproval {
  subject: ApprovalSubject;
  subjectId: string;
  subjectRef: string;
  amount?: bigint;
  summary: ApprovalRequest['summary'];
  href: string;
  requester: { principalId: string; name: string };
  /** Principals who may not decide besides the requester (the person paid, the outgoing owner …). */
  conflicted?: string[];
  on: string;
  at: string;
}

/**
 * Raises a request under the version in force on its date. Null when no rule covers the subject
 * and amount: nothing proceeds without a policy (fail closed).
 */
export function raiseApproval(state: SocietyState, input: NewApproval): ApprovalRequest | null {
  const policy = policyOn(state, input.on);
  const rule = policy ? ruleFor(policy, input.subject, input.amount) : null;
  if (!policy || !rule) return null;
  const n = state.finance.approvals.length + 1;
  const request: ApprovalRequest = {
    id: `apr_anr_${pad(n, 4)}`,
    ref: nextRef(state, 'approval', input.on),
    subject: input.subject,
    subjectId: input.subjectId,
    subjectRef: input.subjectRef,
    ...(input.amount !== undefined ? { amount: money(input.amount) } : {}),
    summary: input.summary,
    href: input.href,
    requestedBy: input.requester.principalId,
    requestedByName: input.requester.name,
    requestedAt: input.at,
    policy: { versionId: policy.id, version: policy.version },
    rule: structuredClone(rule),
    conflicted: [...new Set([input.requester.principalId, ...(input.conflicted ?? [])])].filter((p) => p !== input.requester.principalId),
    status: 'pending',
    decisions: [],
  };
  state.finance.approvals.push(request);
  return request;
}

/** Records one decision; returns the request's status after it (a rejection ends it at once). */
export function recordDecision(request: ApprovalRequest, decision: ApprovalDecision): ApprovalRequest['status'] {
  request.decisions.push(decision);
  if (decision.decision === 'reject') request.status = 'rejected';
  else if (approvalsGiven(request) >= request.rule.approvalsRequired) request.status = 'approved';
  if (request.status !== 'pending') request.decidedAt = decision.at;
  return request.status;
}

export const amountOf = (m: Money | undefined) => (m ? paisa(m) : undefined);

/**
 * HOME-001 approvals card (APR-001 linked record): pending S.1 requests the person may decide, or
 * asked for themselves (shown as waiting for someone else). The C.1/C.2 items stay as they are.
 */
export function approvalItems(state: SocietyState, tenantId: string, me: { principalId: string; permissions: readonly Permission[] }, on: string) {
  return state.finance.approvals
    .filter((a) => a.status === 'pending')
    .map((a) => ({ a, yours: evaluate(state, tenantId, a, me, on).you.canDecide }))
    .filter(({ a, yours }) => yours || a.requestedBy === me.principalId)
    .map(({ a, yours }) => ({ kind: 'approval_request' as const, id: a.id, label: a.ref, href: `/backoffice/apr/approval-360-view?record=${a.id}`, yours }));
}
