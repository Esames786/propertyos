import type { ApprovalRequest, ApprovalSubject, Delegation, Permission, ReminderChannel, ReminderPolicy } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { ALL_PERSONAS } from '../../people';
import { initialSociety } from '../scenario';
import { evaluate, policyOn, ruleFor } from './approvals';
import { cashbookView, cashEvents, inTransitOf } from './cashbook';
import approvalVectors from './approvals.vectors.json';
import opsVectors from './finance-ops.vectors.json';
import { inQuietHours, planFor, type ReminderTarget } from './reminders';

/** Gate S.1 golden vectors: pure rules, no transport (the API tests drive the same rules end to end). */

const TODAY = '2026-10-26';
const TENANT = 'tnt_alnoor';
const paisa = (v: string) => BigInt(Math.round(Number(v) * 100));
const permissionsOf = (principalId: string): readonly Permission[] => ALL_PERSONAS.find((p) => p.principalId === principalId && p.app === 'backoffice')?.permissions ?? [];

describe('finance-ops vectors: the cashbook is the sum of settled sources', () => {
  const state = initialSociety('collecting');
  for (const v of opsVectors.cashbook) {
    it(v.name, () => {
      const book = cashbookView(state, TODAY, v.account, v.period);
      expect([book.totals.opening.amount, book.totals.receipts.amount, book.totals.payments.amount, book.totals.closing.amount]).toEqual([v.opening, v.receipts, v.payments, v.closing]);
    });
  }

  it('every source event counts once, even if a source is listed twice', () => {
    const s = initialSociety('collecting');
    const before = cashEvents(s).length;
    s.payments.push(structuredClone(s.payments[0]!));
    s.finance.vouchers.push(structuredClone(s.finance.vouchers[0]!));
    expect(cashEvents(s).length).toBe(before);
  });

  it('an approved instruction without settlement changes nothing; a settled cash leg puts it in transit', () => {
    const s = initialSociety('collecting');
    const closingBefore = cashbookView(s, TODAY, null, '2026-10').totals.closing.amount;
    s.finance.transfers.push({
      id: 'trf_x',
      ref: 'ANR-TRF-2026-9999',
      legalEntityId: 'le_alnoor',
      siteId: 'site_alnoor',
      kind: 'deposit',
      fromAccountId: 'cac_anr_office',
      toAccountId: 'ben_anr_main',
      amount: { amount: '5000.00', currency: 'PKR' },
      purpose: 'x',
      bankReference: 'X',
      status: 'approved_instruction',
      preparedBy: 'usr_anr_0001',
      preparedByName: 'Imran Qureshi',
      preparedAt: `${TODAY}T10:00:00Z`,
      legs: [
        { leg: 'out', accountId: 'cac_anr_office', accountName: 'Office cash box', accountKind: 'cash', evidence: 'witnessed_slip', status: 'pending' },
        { leg: 'in', accountId: 'ben_anr_main', accountName: 'Association account', accountKind: 'bank', evidence: 'statement_line', status: 'pending' },
      ],
      history: [],
    });
    expect(cashbookView(s, TODAY, null, '2026-10').totals.closing.amount).toBe(closingBefore);
    expect(inTransitOf(s)).toBe(0n);
    const t = s.finance.transfers.at(-1)!;
    t.status = 'in_transit';
    t.legs[0]!.status = 'settled';
    s.finance.settlements.push({ id: 'stl_x', subjectType: 'transfer_leg', subjectId: t.id, leg: 'out', evidenceType: 'witnessed_deposit_slip', slipNo: 'DS-1', settledOn: TODAY, confirmedBy: 'usr_anr_0002', confirmedByName: 'Ayesha Malik', at: `${TODAY}T11:00:00Z` });
    expect(cashbookView(s, TODAY, 'cac_anr_office', '2026-10').totals.closing.amount).toBe('10000.00');
    expect(cashbookView(s, TODAY, 'ben_anr_main', '2026-10').totals.closing.amount).toBe('12600.00');
    expect(inTransitOf(s)).toBe(500000n);
  });

  it('credit = payment − allocations; a reversed payment counts nothing', () => {
    const s = initialSociety('collecting');
    const p = s.payments[0]!;
    const allocated = p.allocations.reduce((n, a) => n + paisa(a.amount.amount), 0n);
    expect(paisa(p.amount.amount) - allocated).toBe(paisa(p.unapplied.amount));
    const before = cashbookView(s, TODAY, 'ben_anr_main', '2026-10').totals.closing.amount;
    p.reversal = { on: TODAY, at: `${TODAY}T12:00:00Z`, reason: 'x', approvalId: 'a', approvalRef: 'A', requestedByName: 'Saba Javed', approvedByName: 'Ayesha Malik' };
    expect(paisa(cashbookView(s, TODAY, 'ben_anr_main', '2026-10').totals.closing.amount)).toBe(paisa(before) - paisa(p.amount.amount));
  });
});

describe('finance-ops vectors: reminder rules', () => {
  const { policy, today, base, cases } = opsVectors.reminders;
  const toTarget = (over: Record<string, unknown>): ReminderTarget => {
    const merged = { ...base, ...over } as typeof base & { alreadySent: string[] };
    return { ...merged, open: paisa(merged.open), overdue: paisa(merged.overdue), proof: merged.proof as ReminderTarget['proof'], alreadySent: new Set(merged.alreadySent) };
  };
  for (const c of cases as Array<{ name: string; target: Record<string, unknown>; manual?: boolean; clock?: string; licensed?: { sms: boolean; whatsapp: boolean }; expect: Record<string, string> }>) {
    it(c.name, () => {
      const plan = planFor(toTarget(c.target), { policy: policy as Pick<ReminderPolicy, 'steps' | 'quietHours' | 'monthlyCap' | 'status'>, today, clock: c.clock ?? '11:00', licensed: c.licensed ?? { sms: true, whatsapp: true }, ...(c.manual ? { manual: true } : {}) });
      for (const [channel, outcome] of Object.entries(c.expect)) {
        const got = plan.channels.find((x) => x.channel === (channel as ReminderChannel));
        expect(got ? (got.skip ? `${got.outcome}:${got.skip}` : got.outcome) : 'absent').toBe(outcome);
      }
    });
  }
  for (const q of opsVectors.quietHours) it(`quiet hours at ${q.clock}: ${q.inside ? 'inside' : 'outside'}`, () => expect(inQuietHours(q.clock, { from: '21:00', to: '09:00' })).toBe(q.inside));
});

describe('approvals vectors', () => {
  const state = initialSociety('collecting');
  for (const r of approvalVectors.rules) {
    it(`${r.subject} ${r.amount ?? ''} → ${r.rule}`, () => {
      expect(ruleFor(policyOn(state, TODAY)!, r.subject as ApprovalSubject, r.amount ? paisa(r.amount) : undefined)?.id).toBe(r.rule);
    });
  }
  for (const v of approvalVectors.versionByDate) {
    it(`the version in force on ${v.date} is ${v.version ?? 'none'}`, () => {
      const s = initialSociety('collecting');
      if (v.withV2From) {
        const v1 = s.finance.policies[0]!;
        v1.effectiveTo = v.withV2From;
        v1.status = 'retired';
        s.finance.policies.push({ ...structuredClone(v1), id: 'apv_anr_v2', version: 2, status: 'active', effectiveFrom: v.withV2From });
        delete s.finance.policies[1]!.effectiveTo;
      }
      expect(policyOn(s, v.date)?.version ?? null).toBe(v.version);
    });
  }
  it('a draft or pending version never governs, whatever its dates', () => {
    const s = initialSociety('collecting');
    s.finance.policies.push({ ...structuredClone(s.finance.policies[0]!), id: 'apv_x', version: 2, status: 'pending', effectiveFrom: '2026-10-02' });
    expect(policyOn(s, TODAY)?.version).toBe(1);
  });
  for (const v of approvalVectors.evaluate as Array<{ name: string; subject: string; amount?: string; requester: string; me: string; conflicted?: string[]; decided?: string[]; delegations?: Array<{ from: string; to: string; subjects: string[]; fromDate: string; toDate: string }>; canDecide: boolean; reason?: string; eligible?: string[]; as?: string }>) {
    it(v.name, () => {
      const s = initialSociety('collecting');
      const name = (p: string) => ALL_PERSONAS.find((x) => x.principalId === p)?.displayName ?? p;
      s.finance.delegations = (v.delegations ?? []).map((d, i): Delegation => ({ id: `dlg_${i}`, fromPrincipalId: d.from, fromName: name(d.from), toPrincipalId: d.to, toName: name(d.to), subjects: d.subjects as ApprovalSubject[], from: d.fromDate, to: d.toDate, reason: 'x', createdBy: d.from, createdByName: name(d.from), createdAt: TODAY, state: 'active' }));
      const rule = ruleFor(policyOn(s, TODAY)!, v.subject as ApprovalSubject, v.amount ? paisa(v.amount) : undefined)!;
      const request: ApprovalRequest = {
        id: 'apr_x',
        ref: 'APR-X',
        subject: v.subject as ApprovalSubject,
        subjectId: 'x',
        subjectRef: 'X',
        ...(v.amount ? { amount: { amount: v.amount, currency: 'PKR' as const } } : {}),
        summary: { key: 'x' },
        href: '#',
        requestedBy: v.requester,
        requestedByName: name(v.requester),
        requestedAt: `${TODAY}T09:00:00Z`,
        policy: { versionId: 'apv_anr_v1', version: 1 },
        rule,
        conflicted: v.conflicted ?? [],
        status: 'pending',
        decisions: (v.decided ?? []).map((by) => ({ by, byName: name(by), decision: 'approve' as const, reason: 'ok', at: `${TODAY}T10:00:00Z`, as: { kind: 'office' as const, office: 'treasurer' as const } })),
      };
      const ev = evaluate(s, TENANT, request, { principalId: v.me, permissions: permissionsOf(v.me) }, TODAY);
      expect([ev.you.canDecide, ev.you.reason ?? null]).toEqual([v.canDecide, v.reason ?? null]);
      if (v.eligible) expect(ev.eligible.map((e) => e.principalId).sort()).toEqual([...v.eligible].sort());
      if (v.as) expect(ev.eligible.find((e) => e.principalId === v.me)?.as.kind).toBe(v.as);
    });
  }
});
