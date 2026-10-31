import type { ApprovalPolicyVersion, ApprovalRule, CashCount, CashVoucher, CommitteeMember, CommitteeTerm, Money, ReminderPolicy } from '@repo/contracts';
import { pad } from '../../seed';
import { ALNOOR_ENTITY, ALNOOR_PAYEE, ALNOOR_OLD_PAYEE, ALNOOR_SITE, ALNOOR_STAFF } from '../alnoor';
import { buildSociety, flatIdOf } from '../model';
import { nextRef, type SocietyState } from '../state';
import { raiseApproval, recordDecision } from './approvals';
import { OFFICE_CASH, PETTY_CASH } from './model';
import { FIN_ROUTES } from './routes';

/**
 * The S.1 starting point (fictional, A7 style). Al-Noor went live in October 2026:
 * - handover balances as at 30 September (the committee account, the office cash box, petty cash),
 *   approved by the treasurer on 5 October; September is closed with witnessed cash counts;
 * - the managing committee elected at the 2026 AGM, and approval policy version 1 adopted by
 *   resolution 8/2026 (no amount in an engine: every threshold is this data);
 * - three October cash vouchers already posted and one waiting for the treasurer.
 * Policy amounts are illustrative. Nothing here is a balance: balances are derived (cashbook.ts).
 */

const { manager, treasurer, accounts } = ALNOOR_STAFF;
const admin = { principalId: 'usr_anr_r0003', name: 'Rabia Hashmi' };
const pkr = (amount: string): Money => ({ amount, currency: 'PKR' });
const HANDOVER_AT = '2026-10-05T10:00:00Z';

/** Policy v1 (resolution 8/2026): who approves what, by amount band. */
export const POLICY_V1_RULES: ApprovalRule[] = [
  { id: 'rul_v1_voucher_small', subject: 'cash_voucher', maxAmount: pkr('10000.00'), approvers: [{ kind: 'office', office: 'treasurer' }], approvalsRequired: 1 },
  { id: 'rul_v1_voucher_large', subject: 'cash_voucher', minAmount: pkr('10000.00'), approvers: [{ kind: 'office', office: 'treasurer' }, { kind: 'office', office: 'general_secretary' }], approvalsRequired: 2 },
  { id: 'rul_v1_transfer_small', subject: 'funds_transfer', maxAmount: pkr('100000.00'), approvers: [{ kind: 'office', office: 'treasurer' }], approvalsRequired: 1 },
  { id: 'rul_v1_transfer_large', subject: 'funds_transfer', minAmount: pkr('100000.00'), approvers: [{ kind: 'office', office: 'treasurer' }, { kind: 'office', office: 'general_secretary' }], approvalsRequired: 2 },
  { id: 'rul_v1_reopen', subject: 'period_reopen', approvers: [{ kind: 'office', office: 'general_secretary' }, { kind: 'office', office: 'president' }], approvalsRequired: 1 },
  { id: 'rul_v1_reversal', subject: 'payment_reversal', approvers: [{ kind: 'office', office: 'treasurer' }], approvalsRequired: 1 },
  { id: 'rul_v1_waiver', subject: 'clearance_waiver', approvers: [{ kind: 'office', office: 'treasurer' }, { kind: 'office', office: 'general_secretary' }], approvalsRequired: 2 },
  { id: 'rul_v1_policy', subject: 'approval_policy', approvers: [{ kind: 'office', office: 'treasurer' }, { kind: 'office', office: 'president' }], approvalsRequired: 1 },
];

export const REMINDER_V1: Omit<ReminderPolicy, 'siteId'> = {
  id: 'rmp_anr_v1',
  version: 1,
  status: 'active',
  steps: [
    { offsetDays: -3, channels: ['in_app'] },
    { offsetDays: 0, channels: ['in_app', 'sms'] },
    { offsetDays: 7, channels: ['in_app', 'sms', 'whatsapp'] },
    { offsetDays: 21, channels: ['in_app', 'sms', 'whatsapp'] },
  ],
  quietHours: { from: '21:00', to: '09:00' },
  monthlyCap: 3,
  lateFeeWording: false,
  createdBy: admin.principalId,
  createdByName: admin.name,
  createdAt: '2026-09-28T12:00:00Z',
  activatedByName: admin.name,
  activatedAt: '2026-10-01T09:00:00Z',
  note: 'D-36 defaults: in-app always; SMS and WhatsApp only with consent; quiet hours; at most three a month.',
};

export function seedFinance(s: SocietyState): void {
  const f = s.finance;
  const model = buildSociety(s.register?.rows ?? []);
  const owner = (flat: string): CommitteeMember | null => {
    const fact = model.facts.find((x) => x.role === 'owner' && x.flatId === flatIdOf(flat));
    return fact ? { name: fact.partyName, partyId: fact.partyId, flats: [flat] } : null;
  };
  const named = (flat: string, name: string, extra: Partial<CommitteeMember> = {}): CommitteeMember => ({ ...(owner(flat) ?? { name, flats: [flat] }), ...extra });

  f.bankNames = { [ALNOOR_PAYEE.id]: 'Association account', [ALNOOR_OLD_PAYEE.id]: 'Committee account' };
  f.cashAccounts = [
    { id: OFFICE_CASH, kind: 'cash', name: 'Office cash box', custodian: { principalId: accounts.principalId, name: accounts.name }, openedOn: '2026-09-30' },
    { id: PETTY_CASH, kind: 'petty_cash', name: 'Petty cash', custodian: { principalId: manager.principalId, name: manager.name }, openedOn: '2026-09-30' },
  ];
  const handover = (n: number, accountId: string, amount: string, document: string) => ({ id: `obl_anr_${pad(n, 4)}`, accountId, on: '2026-09-30', amount: pkr(amount), document, approvedBy: treasurer.principalId, approvedByName: treasurer.name, at: HANDOVER_AT });
  f.openings = [
    handover(1, ALNOOR_OLD_PAYEE.id, '285400.00', 'Committee account statement, 30 Sep 2026 (handover)'),
    handover(2, OFFICE_CASH, '12500.00', 'Office cash count sheet, 30 Sep 2026 (handover)'),
    handover(3, PETTY_CASH, '5000.00', 'Petty cash count sheet, 30 Sep 2026 (handover)'),
  ];
  const count = (n: number, accountId: string, name: string, amount: string, denominations: CashCount['denominations']): CashCount => ({
    id: `cct_anr_${pad(n, 4)}`,
    accountId,
    accountName: name,
    onDate: '2026-09-30',
    counted: pkr(amount),
    expected: pkr(amount),
    denominations,
    countedBy: accounts.principalId,
    countedByName: accounts.name,
    countedAt: '2026-10-05T09:30:00Z',
    witnessedBy: treasurer.principalId,
    witnessedByName: treasurer.name,
    witnessedAt: '2026-10-05T09:40:00Z',
    status: 'witnessed',
  });
  f.cashCounts = [
    count(1, OFFICE_CASH, 'Office cash box', '12500.00', [{ note: '5000', count: 2 }, { note: '1000', count: 2 }, { note: '500', count: 1 }]),
    count(2, PETTY_CASH, 'Petty cash', '5000.00', [{ note: '1000', count: 4 }, { note: '500', count: 2 }]),
  ];
  f.periods = [
    {
      id: 'fpd_anr_202609',
      legalEntityId: ALNOOR_ENTITY.id,
      period: '2026-09',
      state: 'closed',
      closedBy: treasurer.principalId,
      closedByName: treasurer.name,
      closedAt: '2026-10-05T10:30:00Z',
      cashCountIds: f.cashCounts.map((c) => c.id),
      history: [{ at: '2026-10-05T10:30:00Z', by: treasurer.principalId, byName: treasurer.name, action: 'closed', note: 'Handover month closed with witnessed cash counts.' }],
    },
  ];

  // The managing committee (2026 AGM). Office powers act only through a member's staff sign-in.
  const term = (n: number, office: CommitteeTerm['office'], member: CommitteeMember, extra: Partial<CommitteeTerm> = {}): CommitteeTerm => ({ id: `ctm_anr_${pad(n, 4)}`, office, member, from: '2026-04-01', to: '2028-04-01', appointedBy: 'election', decisionRef: 'R-3/2026', state: 'active', ...extra });
  f.committee = {
    id: 'cmt_anr_main',
    name: 'Al-Noor Residency Managing Committee',
    termStarts: '2026-04-01',
    termEnds: '2028-03-31',
    offices: [
      { office: 'president', singleHolder: true },
      { office: 'vice_president', singleHolder: true },
      { office: 'general_secretary', singleHolder: true, roleId: 'administrator' },
      { office: 'treasurer', singleHolder: true, roleId: 'treasurer' },
      { office: 'joint_secretary', singleHolder: true },
      { office: 'member', singleHolder: false },
    ],
    terms: [
      term(1, 'president', named('A-102', 'Tariq Mehmood')),
      term(2, 'vice_president', named('B-204', 'Faisal Chaudhry')),
      term(3, 'general_secretary', named('A-201', 'Rabia Hashmi', { principalId: admin.principalId, flats: ['A-201', 'A-202'] })),
      term(4, 'treasurer', { name: treasurer.name, principalId: treasurer.principalId }),
      term(5, 'joint_secretary', named('A-101', 'Kamran Siddiqui')),
      term(6, 'member', named('B-501', 'Committee member')),
      term(7, 'member', named('A-404', 'Committee member'), { to: '2026-09-01', state: 'ended', endedReason: 'Resigned (moved abroad); seat left vacant until the next AGM.' }),
    ],
    meetings: [
      { id: 'cmm_anr_0001', ref: 'AGM-2026', on: '2026-03-29', title: 'Annual general meeting 2026', attendees: ['Tariq Mehmood', 'Faisal Chaudhry', 'Rabia Hashmi', 'Kamran Siddiqui'], quorum: true, minutes: 'Committee elected for 2026–2028. Accounts for 2025–26 adopted.', recordedByName: admin.name },
      { id: 'cmm_anr_0002', ref: 'CM-7/2026', on: '2026-09-28', title: 'Committee meeting 7/2026', attendees: ['Tariq Mehmood', 'Rabia Hashmi', treasurer.name, 'Kamran Siddiqui'], quorum: true, minutes: 'Going live with PropertyOS from October. Office flat A-108 exempt from dues. Approval policy version 1 adopted. The association opens its own bank account.', recordedByName: admin.name },
    ],
    decisions: [
      { id: 'cmd_anr_0003', ref: 'R-3/2026', meetingId: 'cmm_anr_0001', meetingRef: 'AGM-2026', on: '2026-03-29', subject: 'Election of the managing committee for 2026–2028', outcome: 'approved', votes: { for: 41, against: 3, abstain: 2 }, recordedByName: admin.name, published: true },
      { id: 'cmd_anr_0007', ref: 'R-7/2026', meetingId: 'cmm_anr_0002', meetingRef: 'CM-7/2026', on: '2026-09-28', subject: 'Flat A-108 (association office) exempt from maintenance dues', outcome: 'approved', votes: { for: 6, against: 0, abstain: 1 }, recordedByName: admin.name, published: true },
      { id: 'cmd_anr_0008', ref: 'R-8/2026', meetingId: 'cmm_anr_0002', meetingRef: 'CM-7/2026', on: '2026-09-28', subject: 'Approval policy version 1 (vouchers, transfers, reopening a month, waivers)', outcome: 'approved', votes: { for: 7, against: 0, abstain: 0 }, recordedByName: admin.name, published: true, linked: { kind: 'policy', ref: 'v1', href: FIN_ROUTES.policies() } },
      { id: 'cmd_anr_0009', ref: 'R-9/2026', meetingId: 'cmm_anr_0002', meetingRef: 'CM-7/2026', on: '2026-09-28', subject: 'Open the association’s own bank account; move the committee account’s balance to it', outcome: 'approved', votes: { for: 7, against: 0, abstain: 0 }, recordedByName: admin.name, published: false },
    ],
  };

  const v1: ApprovalPolicyVersion = {
    id: 'apv_anr_v1',
    legalEntityId: ALNOOR_ENTITY.id,
    version: 1,
    status: 'active',
    effectiveFrom: '2026-10-01',
    rules: structuredClone(POLICY_V1_RULES),
    note: 'Adopted by resolution R-8/2026.',
    createdBy: admin.principalId,
    createdByName: admin.name,
    createdAt: '2026-09-28T12:00:00Z',
  };
  f.policies = [v1];
  f.reminderPolicies = [{ ...structuredClone(REMINDER_V1), siteId: ALNOOR_SITE.id }];

  // October vouchers: three posted (prepared by the accounts officer, approved by the treasurer).
  const voucher = (input: { onDate: string; accountId: string; direction: CashVoucher['direction']; category: CashVoucher['category']; amount: string; purpose: string; counterparty: string; evidence: string; preparedAt: string; decidedAt?: string; postedAt?: string }): CashVoucher => {
    const n = f.vouchers.length + 1;
    const id = `cvr_anr_${pad(n, 4)}`;
    const ref = nextRef(s, 'voucher', input.onDate);
    const v: CashVoucher = {
      id,
      ref,
      legalEntityId: ALNOOR_ENTITY.id,
      siteId: ALNOOR_SITE.id,
      accountId: input.accountId,
      accountName: f.cashAccounts.find((c) => c.id === input.accountId)!.name,
      direction: input.direction,
      category: input.category,
      amount: pkr(input.amount),
      onDate: input.onDate,
      purpose: input.purpose,
      counterparty: { name: input.counterparty },
      evidence: { name: input.evidence, kind: input.direction === 'receipt' ? 'receipt' : 'bill', size: 184_220 },
      status: 'submitted',
      preparedBy: accounts.principalId,
      preparedByName: accounts.name,
      preparedAt: input.preparedAt,
      history: [
        { at: input.preparedAt, by: accounts.principalId, byName: accounts.name, action: 'prepared' },
        { at: input.preparedAt, by: accounts.principalId, byName: accounts.name, action: 'submitted' },
      ],
    };
    const approval = raiseApproval(s, {
      subject: 'cash_voucher',
      subjectId: id,
      subjectRef: ref,
      amount: BigInt(Math.round(Number(input.amount) * 100)),
      summary: { key: input.direction === 'receipt' ? 'voucher_receipt' : 'voucher_payment', values: { purpose: input.purpose, account: v.accountName } },
      href: FIN_ROUTES.voucher(id),
      requester: { principalId: accounts.principalId, name: accounts.name },
      on: input.onDate,
      at: input.preparedAt,
    })!;
    Object.assign(v, { approvalId: approval.id, approvalRef: approval.ref });
    if (input.decidedAt) {
      recordDecision(approval, { by: treasurer.principalId, byName: treasurer.name, decision: 'approve', reason: 'Bill checked against the purpose.', at: input.decidedAt, as: { kind: 'office', office: 'treasurer' } });
      v.status = 'approved';
      v.history.push({ at: input.decidedAt, by: treasurer.principalId, byName: treasurer.name, action: 'approved' });
    }
    if (input.postedAt) {
      Object.assign(v, { status: 'posted', postedBy: accounts.principalId, postedByName: accounts.name, postedAt: input.postedAt });
      v.history.push({ at: input.postedAt, by: accounts.principalId, byName: accounts.name, action: 'posted' });
    }
    f.vouchers.push(v);
    return v;
  };
  // October's activity belongs to the collecting storyline (the C.1 'ready' demo has none yet).
  if (s.mode !== 'collecting') return;
  voucher({ onDate: '2026-10-14', accountId: PETTY_CASH, direction: 'payment', category: 'utilities', amount: '3200.00', purpose: 'Generator diesel, 40 litres', counterparty: 'Gulberg Fuel Station (Demo)', evidence: 'diesel-bill-1410.jpg', preparedAt: '2026-10-14T11:20:00Z', decidedAt: '2026-10-14T15:05:00Z', postedAt: '2026-10-14T15:30:00Z' });
  voucher({ onDate: '2026-10-18', accountId: OFFICE_CASH, direction: 'receipt', category: 'hall_booking', amount: '2500.00', purpose: 'Community hall booking, 18 October', counterparty: 'Hina Rana (B-204)', evidence: 'hall-booking-1810.pdf', preparedAt: '2026-10-18T10:00:00Z', decidedAt: '2026-10-18T13:00:00Z', postedAt: '2026-10-18T13:10:00Z' });
  voucher({ onDate: '2026-10-21', accountId: PETTY_CASH, direction: 'payment', category: 'cleaning', amount: '1150.00', purpose: 'Cleaning supplies for both lobbies', counterparty: 'Model Town Stores (Demo)', evidence: 'cleaning-bill-2110.jpg', preparedAt: '2026-10-21T09:40:00Z', decidedAt: '2026-10-21T12:00:00Z', postedAt: '2026-10-21T12:20:00Z' });
  voucher({ onDate: '2026-10-25', accountId: OFFICE_CASH, direction: 'payment', category: 'repairs', amount: '7500.00', purpose: 'Lift call-out: Block B door sensor', counterparty: 'Lahore Lift Services (Demo)', evidence: 'lift-callout-2510.pdf', preparedAt: '2026-10-25T16:10:00Z' });
}
