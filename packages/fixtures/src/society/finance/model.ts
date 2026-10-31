import type {
  ApprovalPolicyVersion,
  ApprovalRequest,
  CashCount,
  CashVoucher,
  ChequeInstrument,
  ClearanceCertificate,
  CommitteeDecision,
  CommitteeMeeting,
  CommitteeOffice,
  CommitteeTerm,
  Delegation,
  FinanceAccountKind,
  FiscalPeriod,
  FundsTransfer,
  Money,
  OfficeCollectionBatch,
  OwnershipTransfer,
  ReminderEvent,
  ReminderPolicy,
  SettlementConfirmation,
} from '@repo/contracts';
import { fromPaisa, toPaisa } from '../../portal';

/**
 * Gate S.1 state: the society's finance and governance records, kept in the same demo section as
 * C.1/C.2 (one source of truth). Nothing here stores a balance or a cashbook row: balances are
 * derived from settled source events (cashbook.ts).
 */

export interface StoredCashAccount {
  id: string;
  kind: Extract<FinanceAccountKind, 'cash' | 'petty_cash'>;
  name: string;
  custodian: { principalId: string; name: string };
  openedOn: string;
}

/** Balances carried in from the committee's books at handover (approved, with their evidence). */
export interface StoredOpening {
  id: string;
  accountId: string;
  on: string;
  amount: Money;
  /** The document the balance was taken from (statement, cash count sheet). */
  document: string;
  approvedBy: string;
  approvedByName: string;
  at: string;
}

export interface CommitteeState {
  id: string;
  name: string;
  termStarts: string;
  termEnds: string;
  offices: Array<{ office: CommitteeOffice; singleHolder: boolean; roleId?: string }>;
  terms: CommitteeTerm[];
  meetings: CommitteeMeeting[];
  decisions: CommitteeDecision[];
}

export interface FinanceState {
  /** Names the society uses for its verified bank accounts (the accounts themselves are BILL-010's). */
  bankNames: Record<string, string>;
  cashAccounts: StoredCashAccount[];
  openings: StoredOpening[];
  vouchers: CashVoucher[];
  transfers: FundsTransfer[];
  settlements: SettlementConfirmation[];
  cheques: ChequeInstrument[];
  batches: OfficeCollectionBatch[];
  periods: FiscalPeriod[];
  cashCounts: CashCount[];
  policies: ApprovalPolicyVersion[];
  approvals: ApprovalRequest[];
  delegations: Delegation[];
  committee: CommitteeState;
  reminderPolicies: ReminderPolicy[];
  reminders: ReminderEvent[];
  ownership: OwnershipTransfer[];
  certificates: ClearanceCertificate[];
  /** Payment reversals asked for (each waits for its approval; nothing changes before it). */
  reversals: Array<{ id: string; approvalId: string; paymentId: string; chequeId?: string; reason: string; bankLineId?: string; requestedBy: string; requestedByName: string; at: string; status: 'pending' | 'approved' | 'rejected' }>;
  /** Idempotency keys already used (key → the record they created): a repeat returns it, never a copy. */
  idempotency: Record<string, string>;
}

export const OFFICE_CASH = 'cac_anr_office';
export const PETTY_CASH = 'cac_anr_petty';

export const emptyFinance = (): FinanceState => ({
  bankNames: {},
  cashAccounts: [],
  openings: [],
  vouchers: [],
  transfers: [],
  settlements: [],
  cheques: [],
  batches: [],
  periods: [],
  cashCounts: [],
  policies: [],
  approvals: [],
  delegations: [],
  committee: { id: '', name: '', termStarts: '', termEnds: '', offices: [], terms: [], meetings: [], decisions: [] },
  reminderPolicies: [],
  reminders: [],
  ownership: [],
  certificates: [],
  reversals: [],
  idempotency: {},
});

export const money = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });
export const paisa = (m: Money | undefined) => (m ? toPaisa(m.amount) : 0n);
export const sum = (values: readonly bigint[]) => values.reduce((s, v) => s + v, 0n);
export const periodOf = (date: string) => date.slice(0, 7);
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const lastDayOf = (period: string) => new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);
export const nextPeriod = (period: string) => {
  const d = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 1));
  return d.toISOString().slice(0, 7);
};
export const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
