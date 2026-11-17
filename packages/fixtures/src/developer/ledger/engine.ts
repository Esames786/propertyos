import type { BankImportCounts, BankImportRow, BankImportRowProblem, BankLine, GlAccountType, JournalKind, Money, PeriodState } from '@repo/contracts';
import { normalSideOf } from '@repo/contracts';
import { fromPaisa, toPaisa } from '../../portal';
import { fingerprint } from '../../society/import';
import { lineKey, newLines } from '../../society/matching';
import { formatRef } from '../../society/numbering';
import { AMOUNT, DATE, lastDayOf, periodOf } from '../../society/finance/model';
import type { LedgerState, StoredGlAccount, StoredImport, StoredJournal, StoredJournalLine, StoredPeriod, StoredRule, StoredRuleVersion } from './state';

/**
 * Gate E.7 ledger engine: pure functions over one organisation's ledger state. Handlers check access,
 * scope, idempotency, state and maker ≠ checker first, then call these. The seed calls the very same
 * functions, so the demo ledger is entered through the journal path like any other journal.
 *
 * Money is whole paisa (bigint) in every calculation and a two-decimal string at rest. A journal is
 * stored only when its debits equal its credits; only posted lines reach a balance or a report, so the
 * trial balance, profit and loss and balance sheet are three readings of one set of lines.
 *
 * Reused (called, never copied): `formatRef` (society numbering), `lineKey` / `newLines` (C.2 statement
 * dedupe), `fingerprint` (C.1 import), `toPaisa` / `fromPaisa`, the S.1 period helpers.
 */

export const pkr = (paisa: bigint): Money => ({ amount: fromPaisa(paisa), currency: 'PKR' });
export const ZERO = 0n;
export const sum = (xs: readonly bigint[]) => xs.reduce((a, b) => a + b, 0n);
const abs = (p: bigint) => (p < 0n ? -p : p);

/** "1,250.50" → 125050n; anything else (empty, negative, more than two decimals, > 999,999,999.99) → null. */
export function paisaOf(raw: unknown): bigint | null {
  const v = String(raw ?? '').trim().replace(/,/g, '');
  if (!AMOUNT.test(v)) return null;
  return toPaisa(v);
}

export const isDate = (v: string) => DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

// ---------------------------------------------------------------------------------------------
// References (society numbering, per entity)
// ---------------------------------------------------------------------------------------------

export const PATTERNS = {
  journal: '{code}-JV-{yyyy}-{seq:4}',
  import: '{code}-BIM-{yyyy}-{seq:4}',
  rule: '{code}-PR-{seq:3}',
  account: '{code}-GLA-{seq:4}',
} as const;
type RefKind = keyof typeof PATTERNS;

/** The next id and reference of a kind for an entity; sequences restart each year where the pattern has {yyyy}. */
export function nextRef(state: LedgerState, entityId: string, kind: RefKind, on: string): { id: string; ref: string } {
  const entity = state.entities.find((e) => e.id === entityId)!;
  const pattern = PATTERNS[kind];
  const scope = pattern.includes('{yyyy}') ? `${entityId}:${kind}:${on.slice(0, 4)}` : `${entityId}:${kind}`;
  const seq = (state.counters[scope] ?? 0) + 1;
  state.counters[scope] = seq;
  const idScope = `${entityId}:${kind}:id`;
  const n = (state.counters[idScope] ?? 0) + 1;
  state.counters[idScope] = n;
  const prefix = { journal: 'jnl', import: 'bim', rule: 'prl', account: 'gla' }[kind];
  return { id: `${prefix}_${entity.code.toLowerCase()}_${String(n).padStart(4, '0')}`, ref: formatRef(pattern, { code: entity.code, seq, on }) };
}

// ---------------------------------------------------------------------------------------------
// Periods (one FiscalPeriod per legal entity and month, the S.1 record)
// ---------------------------------------------------------------------------------------------

export const periodOfDate = periodOf;

export function nextMonth(period: string): string {
  const d = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 1));
  return d.toISOString().slice(0, 7);
}

/** Months the entity keeps books for: its first month up to the demo month. */
export function bookPeriods(state: LedgerState, entityId: string, today: string): string[] {
  const entity = state.entities.find((e) => e.id === entityId);
  if (!entity) return [];
  const out: string[] = [];
  for (let p = entity.booksFrom; p <= periodOf(today); p = nextMonth(p)) out.push(p);
  return out;
}

export const periodRecord = (state: LedgerState, entityId: string, period: string): StoredPeriod | undefined => state.periods.find((p) => p.legalEntityId === entityId && p.period === period);

export function periodStateOf(state: LedgerState, entityId: string, period: string): PeriodState {
  return periodRecord(state, entityId, period)?.state ?? 'open';
}

/** A posting dated in a closed month is refused (a reopened month accepts postings again). */
export const isClosed = (state: LedgerState, entityId: string, date: string) => periodStateOf(state, entityId, periodOf(date)) === 'closed';

/** The fiscal year start (first day) of a period, by the entity's first fiscal month. */
export function fiscalYearStart(state: LedgerState, entityId: string, period: string): string {
  const fy = state.entities.find((e) => e.id === entityId)!.fiscalYearStartMonth;
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return `${month >= fy ? year : year - 1}-${String(fy).padStart(2, '0')}-01`;
}

export interface PeriodCheck {
  key: 'period_ended' | 'journals_unposted';
  outcome: 'passed' | 'blocking';
  count: number;
}

/** Why a month cannot close yet: it has not ended, or journals dated in it are not posted (or cancelled/rejected). */
export function closeChecks(state: LedgerState, entityId: string, period: string, today: string): PeriodCheck[] {
  const open = state.journals.filter((j) => j.entityId === entityId && periodOf(j.date) === period && (j.state === 'draft' || j.state === 'submitted' || j.state === 'approved')).length;
  return [
    { key: 'period_ended', outcome: lastDayOf(period) < today ? 'passed' : 'blocking', count: 0 },
    { key: 'journals_unposted', outcome: open ? 'blocking' : 'passed', count: open },
  ];
}

// ---------------------------------------------------------------------------------------------
// Journals: normalising input (every rule a journal must meet before it is stored)
// ---------------------------------------------------------------------------------------------

export interface FieldProblem {
  code: string;
  params?: Record<string, string>;
}
export type Problems = Record<string, FieldProblem[]>;

export interface NormalLine {
  accountId: string;
  debit: bigint;
  credit: bigint;
  memo?: string;
  costCentreId?: string;
}

export interface NormalJournal {
  entityId: string;
  date: string;
  memo: string;
  lines: NormalLine[];
}

export interface RawJournal {
  date?: unknown;
  memo?: unknown;
  lines?: unknown;
}

export const MAX_LINES = 20;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');

/** An account a new journal line may use: an active account of the same entity. Anything else is one answer. */
export const usableAccount = (state: LedgerState, entityId: string, id: string): StoredGlAccount | undefined =>
  state.accounts.find((a) => a.id === id && a.entityId === entityId && a.state === 'active');

/** The journal's date problem, if any (invalid, in the future, before the books began). */
export function dateProblem(state: LedgerState, entityId: string, raw: unknown, today: string): FieldProblem | null {
  const date = typeof raw === 'string' ? raw.trim() : '';
  if (!isDate(date)) return { code: 'ledger:problems.dateInvalid' };
  if (date > today) return { code: 'ledger:problems.dateFuture' };
  const entity = state.entities.find((e) => e.id === entityId)!;
  if (periodOf(date) < entity.booksFrom) return { code: 'ledger:problems.dateBeforeBooks' };
  return null;
}

/**
 * Every field of a journal checked before anything is stored. A line naming an account of another
 * entity, a draft or an invented id gets the same problem (no oracle). Debits must equal credits.
 */
export function normaliseJournal(state: LedgerState, entityId: string, raw: RawJournal, today: string): { journal?: NormalJournal; problems: Problems } {
  const problems: Problems = {};
  const add = (field: string, p: FieldProblem) => (problems[field] ??= []).push(p);
  const date = typeof raw.date === 'string' ? raw.date.trim() : '';
  const dp = dateProblem(state, entityId, raw.date, today);
  if (dp) add('date', dp);
  const memo = text(raw.memo, 200);
  if (memo.length < 3) add('memo', { code: 'ledger:problems.memoShort', params: { min: '3' } });
  if (memo.length > 200) add('memo', { code: 'ledger:problems.memoLong', params: { max: '200' } });
  const list = Array.isArray(raw.lines) ? (raw.lines as unknown[]) : [];
  if (list.length < 2) add('lines', { code: 'ledger:problems.linesFew' });
  if (list.length > MAX_LINES) add('lines', { code: 'ledger:problems.linesMany', params: { max: String(MAX_LINES) } });
  const lines: NormalLine[] = [];
  list.slice(0, MAX_LINES).forEach((item, i) => {
    const l = (item ?? {}) as Record<string, unknown>;
    const field = `lines.${i}`;
    const accountId = typeof l.accountId === 'string' ? l.accountId : '';
    const account = usableAccount(state, entityId, accountId);
    if (!account) add(`${field}.accountId`, { code: 'ledger:problems.accountUnavailable' });
    else if (account.lock === 'cash_evidence') add(`${field}.accountId`, { code: 'ledger:problems.accountLockedCash' });
    else if (account.lock === 'revenue_policy') add(`${field}.accountId`, { code: 'ledger:problems.accountLockedRevenue' });
    const hasDebit = String(l.debit ?? '').trim() !== '';
    const hasCredit = String(l.credit ?? '').trim() !== '';
    const debit = hasDebit ? paisaOf(l.debit) : 0n;
    const credit = hasCredit ? paisaOf(l.credit) : 0n;
    if (debit === null) add(`${field}.debit`, { code: 'ledger:problems.amountInvalid' });
    if (credit === null) add(`${field}.credit`, { code: 'ledger:problems.amountInvalid' });
    if (debit !== null && credit !== null && (debit > 0n) === (credit > 0n)) add(`${field}.amount`, { code: 'ledger:problems.amountOneSide' });
    const lineMemo = text(l.memo, 120);
    if (lineMemo.length > 120) add(`${field}.memo`, { code: 'ledger:problems.memoLong', params: { max: '120' } });
    const cc = typeof l.costCentreId === 'string' && l.costCentreId ? l.costCentreId : undefined;
    if (cc && !state.costCentres.some((c) => c.id === cc && c.entityId === entityId)) add(`${field}.costCentreId`, { code: 'ledger:problems.costCentreUnavailable' });
    lines.push({ accountId, debit: debit ?? 0n, credit: credit ?? 0n, ...(lineMemo ? { memo: lineMemo } : {}), ...(cc ? { costCentreId: cc } : {}) });
  });
  if (!Object.keys(problems).length) {
    const dr = sum(lines.map((l) => l.debit));
    const cr = sum(lines.map((l) => l.credit));
    if (dr !== cr) add('lines', { code: 'ledger:problems.unbalanced', params: { debit: fromPaisa(dr), credit: fromPaisa(cr) } });
  }
  if (Object.keys(problems).length) return { problems };
  return { journal: { entityId, date, memo, lines }, problems };
}

/** Debits = credits on stored lines (a stored journal always balances; vectors check this). */
export function journalTotals(lines: readonly StoredJournalLine[]): { debit: bigint; credit: bigint } {
  return { debit: sum(lines.map((l) => toPaisa(l.debit))), credit: sum(lines.map((l) => toPaisa(l.credit))) };
}

const stored = (lines: readonly NormalLine[]): StoredJournalLine[] =>
  lines.map((l, i) => ({ n: i + 1, accountId: l.accountId, debit: fromPaisa(l.debit), credit: fromPaisa(l.credit), ...(l.memo ? { memo: l.memo } : {}), ...(l.costCentreId ? { costCentreId: l.costCentreId } : {}) }));

export interface Actor {
  by: string;
  byName: string;
}

const event = (who: Actor, at: string, action: string, extra: { note?: string; values?: Record<string, string> } = {}) => ({ at, by: who.by, byName: who.byName, action, ...extra });

/** Stores a normalised journal as a draft (or submitted). Only call with the output of `normaliseJournal`. */
export function addJournal(state: LedgerState, n: NormalJournal, who: Actor, at: string, opts: { submit?: boolean; kind?: JournalKind; reversalOfId?: string; reverseReason?: string; demo?: boolean } = {}): StoredJournal {
  const totals = { debit: sum(n.lines.map((l) => l.debit)), credit: sum(n.lines.map((l) => l.credit)) };
  if (totals.debit !== totals.credit || totals.debit <= 0n) throw new Error('unbalanced journal');
  const { id, ref } = nextRef(state, n.entityId, 'journal', n.date);
  const j: StoredJournal = {
    id,
    ref,
    entityId: n.entityId,
    date: n.date,
    memo: n.memo,
    kind: opts.kind ?? 'manual',
    state: 'draft',
    lines: stored(n.lines),
    demo: opts.demo ?? false,
    makerId: who.by,
    makerName: who.byName,
    createdAt: at,
    ...(opts.reversalOfId ? { reversalOfId: opts.reversalOfId } : {}),
    ...(opts.reverseReason ? { reverseReason: opts.reverseReason } : {}),
    history: [event(who, at, opts.kind === 'reversal' ? 'reversal_requested' : 'drafted', { values: { total: fromPaisa(totals.debit) } })],
  };
  state.journals.push(j);
  if (opts.submit) submitJournal(j, who, at);
  return j;
}

export function editJournal(j: StoredJournal, n: NormalJournal, who: Actor, at: string): void {
  if (j.state !== 'draft') throw new Error('only a draft is edited');
  j.date = n.date;
  j.memo = n.memo;
  j.lines = stored(n.lines);
  j.history.push(event(who, at, 'edited', { values: { total: fromPaisa(sum(n.lines.map((l) => l.debit))) } }));
}

export function submitJournal(j: StoredJournal, who: Actor, at: string): void {
  if (j.state !== 'draft') throw new Error('only a draft is submitted');
  j.state = 'submitted';
  j.submittedAt = at;
  j.history.push(event(who, at, 'submitted'));
}

/** Maker ≠ checker: compared by principal, never by name. */
export const isMaker = (j: StoredJournal, principal: string) => j.makerId === principal;

export function approveJournal(j: StoredJournal, who: Actor, at: string): void {
  if (j.state !== 'submitted' || isMaker(j, who.by)) throw new Error('approval refused');
  j.state = 'approved';
  j.approvedBy = who.by;
  j.approvedByName = who.byName;
  j.approvedAt = at;
  j.history.push(event(who, at, 'approved'));
}

export function rejectJournal(state: LedgerState, j: StoredJournal, who: Actor, at: string, reason: string): void {
  if (j.state !== 'submitted' || isMaker(j, who.by)) throw new Error('rejection refused');
  j.state = 'rejected';
  j.rejectedBy = who.by;
  j.rejectedByName = who.byName;
  j.rejectReason = reason;
  j.history.push(event(who, at, 'rejected', { note: reason }));
  releaseReversal(state, j, who, at);
}

export function cancelJournal(state: LedgerState, j: StoredJournal, who: Actor, at: string): void {
  if ((j.state !== 'draft' && j.state !== 'submitted') || !isMaker(j, who.by)) throw new Error('cancel refused');
  j.state = 'cancelled';
  j.history.push(event(who, at, 'cancelled'));
  releaseReversal(state, j, who, at);
}

/** A reversal that will never post frees its original (both keep the history). */
function releaseReversal(state: LedgerState, j: StoredJournal, who: Actor, at: string): void {
  if (j.kind !== 'reversal' || !j.reversalOfId) return;
  const original = state.journals.find((x) => x.id === j.reversalOfId);
  if (original && original.reversalId === j.id) {
    delete original.reversalId;
    original.history.push(event(who, at, 'reversal_withdrawn', { values: { ref: j.ref } }));
  }
}

/** Posting: approved by someone else, posted by someone other than the maker, in an open period. */
export function postJournal(state: LedgerState, j: StoredJournal, who: Actor, at: string): void {
  if (j.state !== 'approved' || isMaker(j, who.by) || isClosed(state, j.entityId, j.date)) throw new Error('posting refused');
  const t = journalTotals(j.lines);
  if (t.debit !== t.credit) throw new Error('unbalanced journal');
  j.state = 'posted';
  j.postedBy = who.by;
  j.postedByName = who.byName;
  j.postedAt = at;
  j.history.push(event(who, at, 'posted'));
  if (j.kind === 'reversal' && j.reversalOfId) {
    const original = state.journals.find((x) => x.id === j.reversalOfId);
    original?.history.push(event(who, at, 'reversed', { values: { ref: j.ref } }));
  }
}

/** Whether a posted journal may be reversed now (not a reversal itself, no reversal pending or posted). */
export function reversible(state: LedgerState, j: StoredJournal): 'ok' | 'not_posted' | 'already_reversed' | 'reversal_not_reversible' {
  if (j.state !== 'posted') return 'not_posted';
  if (j.kind === 'reversal') return 'reversal_not_reversible';
  if (j.reversalId) return 'already_reversed';
  return 'ok';
}

/** The reversal journal: every line on the other side, dated in an open period, linked both ways. */
export function reverseJournal(state: LedgerState, original: StoredJournal, date: string, reason: string, who: Actor, at: string): StoredJournal {
  if (reversible(state, original) !== 'ok') throw new Error('reversal refused');
  const lines: NormalLine[] = original.lines.map((l) => ({ accountId: l.accountId, debit: toPaisa(l.credit), credit: toPaisa(l.debit), ...(l.memo ? { memo: l.memo } : {}), ...(l.costCentreId ? { costCentreId: l.costCentreId } : {}) }));
  const r = addJournal(state, { entityId: original.entityId, date, memo: reason, lines }, who, at, { submit: true, kind: 'reversal', reversalOfId: original.id, reverseReason: reason, demo: original.demo });
  original.reversalId = r.id;
  original.history.push(event(who, at, 'reversal_requested', { values: { ref: r.ref }, note: reason }));
  return r;
}

/** A posted journal whose reversal is posted. */
export const isReversed = (state: LedgerState, j: StoredJournal) => !!j.reversalId && state.journals.find((x) => x.id === j.reversalId)?.state === 'posted';

// ---------------------------------------------------------------------------------------------
// Balances and reports: posted lines only
// ---------------------------------------------------------------------------------------------

export interface PostedLine {
  journal: StoredJournal;
  line: StoredJournalLine;
}

/** Posted lines of an entity dated from `from` (inclusive) to `to` (inclusive). */
export function postedLines(state: LedgerState, entityId: string, range: { from?: string; to?: string } = {}): PostedLine[] {
  return state.journals
    .filter((j) => j.entityId === entityId && j.state === 'posted' && (!range.from || j.date >= range.from) && (!range.to || j.date <= range.to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref))
    .flatMap((journal) => journal.lines.map((line) => ({ journal, line })));
}

/** Debit-positive balance per account. */
export function balances(state: LedgerState, entityId: string, range: { from?: string; to?: string } = {}): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const { line } of postedLines(state, entityId, range)) out.set(line.accountId, (out.get(line.accountId) ?? 0n) + toPaisa(line.debit) - toPaisa(line.credit));
  return out;
}

const accountsOf = (state: LedgerState, entityId: string) => state.accounts.filter((a) => a.entityId === entityId && a.state === 'active').sort((a, b) => a.code.localeCompare(b.code));

export interface TbRow {
  account: StoredGlAccount;
  debit: bigint;
  credit: bigint;
}

/** Trial balance at a date: every account with posted lines, its debit or credit balance; the columns are equal. */
export function trialBalance(state: LedgerState, entityId: string, asOf: string): { rows: TbRow[]; debit: bigint; credit: bigint; journals: number } {
  const b = balances(state, entityId, { to: asOf });
  const used = new Set(postedLines(state, entityId, { to: asOf }).map((x) => x.line.accountId));
  const rows = accountsOf(state, entityId)
    .filter((a) => used.has(a.id))
    .map((account) => {
      const v = b.get(account.id) ?? 0n;
      return { account, debit: v > 0n ? v : 0n, credit: v < 0n ? -v : 0n };
    });
  const journals = new Set(postedLines(state, entityId, { to: asOf }).map((x) => x.journal.id)).size;
  return { rows, debit: sum(rows.map((r) => r.debit)), credit: sum(rows.map((r) => r.credit)), journals };
}

export interface SectionRow {
  account: StoredGlAccount;
  amount: bigint;
}

/** Accounts of some types with their balance on their normal side (zero balances left out). */
function section(state: LedgerState, entityId: string, types: readonly GlAccountType[], range: { from?: string; to?: string }): { rows: SectionRow[]; total: bigint } {
  const b = balances(state, entityId, range);
  const rows = accountsOf(state, entityId)
    .filter((a) => types.includes(a.type))
    .map((account) => {
      const v = b.get(account.id) ?? 0n;
      return { account, amount: normalSideOf(account.type) === 'debit' ? v : -v };
    })
    .filter((r) => r.amount !== 0n);
  return { rows, total: sum(rows.map((r) => r.amount)) };
}

/** Profit and loss for a range: income − expenses (management view; no revenue recognition, E-15). */
export function profitAndLoss(state: LedgerState, entityId: string, from: string, to: string) {
  const income = section(state, entityId, ['income'], { from, to });
  const expenses = section(state, entityId, ['expense'], { from, to });
  return { income, expenses, result: income.total - expenses.total };
}

/** Balance sheet at a date: assets = liabilities + equity + the current result (cumulative, not closed). */
export function balanceSheet(state: LedgerState, entityId: string, asOf: string) {
  const assets = section(state, entityId, ['asset'], { to: asOf });
  const liabilities = section(state, entityId, ['liability'], { to: asOf });
  const equity = section(state, entityId, ['equity'], { to: asOf });
  const pl = profitAndLoss(state, entityId, '0000-01-01', asOf);
  const right = liabilities.total + equity.total + pl.result;
  return { assets, liabilities, equity, currentResult: pl.result, right, balances: assets.total === right };
}

/** An account's posted lines with a running balance, oldest first. */
export function accountLines(state: LedgerState, account: StoredGlAccount): Array<PostedLine & { running: bigint }> {
  let running = 0n;
  return postedLines(state, account.entityId)
    .filter((x) => x.line.accountId === account.id)
    .map((x) => {
      running += toPaisa(x.line.debit) - toPaisa(x.line.credit);
      return { ...x, running };
    });
}

export const normalOf = (account: StoredGlAccount, debitPositive: bigint) => (normalSideOf(account.type) === 'debit' ? debitPositive : -debitPositive);
export { abs };

// ---------------------------------------------------------------------------------------------
// Chart of accounts (E-16: draft → approval by someone else; never deleted once used)
// ---------------------------------------------------------------------------------------------

export const ACCOUNT_CODE = /^\d{4}$/;
/** The code range of each type in the illustrative chart (1xxx assets … 5xxx expenses). */
export const CODE_RANGE: Record<GlAccountType, string> = { asset: '1', liability: '2', equity: '3', income: '4', expense: '5' };

export const chartVersion = (state: LedgerState, entityId: string) => Math.max(0, ...state.chartVersions.filter((v) => v.entityId === entityId).map((v) => v.version));

// ---------------------------------------------------------------------------------------------
// Posting rules (ACC-010): versioned by effective date; proposed only (E-15…E-17)
// ---------------------------------------------------------------------------------------------

/** The version in force on a date: the latest effective on or before it. */
export function ruleVersionOn(rule: StoredRule, date: string): StoredRuleVersion | undefined {
  return [...rule.versions].filter((v) => v.effectiveFrom <= date).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.n - b.n).at(-1);
}

/**
 * When source slices exist, a source event would propose one journal per (source, posting version):
 * the same event under the same version proposes nothing twice. No proposal is created in this gate.
 */
export const proposalKey = (source: { type: string; id: string }, rule: StoredRule, version: StoredRuleVersion) => `${source.type}:${source.id}|${rule.id}|v${version.n}`;

export function previewLines(rule: StoredRule, version: StoredRuleVersion, amount: bigint): NormalLine[] {
  return [
    { accountId: version.debitAccountId, debit: amount, credit: 0n },
    { accountId: version.creditAccountId, debit: 0n, credit: amount },
  ];
}

// ---------------------------------------------------------------------------------------------
// Bank statement import (BANK-005): parse, validate, find duplicates, commit new lines only
// ---------------------------------------------------------------------------------------------

export const STATEMENT_SOURCE = 'demo_bank_csv' as const;

function cells(row: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;
    if (quoted && ch === '"' && row[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** The account number a file declares in a "# Account: …" line, if any. */
export function declaredAccount(content: string): string | undefined {
  const m = /^#\s*Account:\s*([A-Z0-9 ]+)$/im.exec(content);
  return m ? m[1]!.replace(/\s/g, '') : undefined;
}

export interface ParsedRow {
  n: number;
  bankTxnId: string;
  valueDate: string;
  amount: bigint;
  direction: 'credit' | 'debit';
  narration: string;
  reference: string;
  counterparty: string;
  problems: BankImportRowProblem[];
}

/** Rows of a statement file (comment lines start with #; the first other line is the header). */
export function parseStatement(content: string, today: string): ParsedRow[] {
  const rows = content.split(/\r?\n/).filter((r) => r.trim() && !r.trim().startsWith('#')).slice(1);
  return rows.slice(0, 500).map((r, i) => {
    const c = cells(r);
    const problems: BankImportRowProblem[] = [];
    if (c.length < 6) problems.push('columns');
    const [txn = '', on = '', raw = '', narration = '', reference = '', counterparty = ''] = c;
    if (!txn) problems.push('txn_missing');
    if (!isDate(on)) problems.push('date_invalid');
    else if (on > today) problems.push('date_future');
    const debit = raw.startsWith('-');
    const p = paisaOf(debit ? raw.slice(1) : raw);
    if (p === null || p === 0n) problems.push('amount_invalid');
    return { n: i + 1, bankTxnId: txn.slice(0, 40), valueDate: on.slice(0, 10), amount: p ?? 0n, direction: debit ? 'debit' : 'credit', narration: narration.slice(0, 120), reference: reference.slice(0, 60), counterparty: counterparty.slice(0, 80), problems };
  });
}

/** A statement line as the C.2 contract has it, so the C.2 dedupe (`lineKey`, `newLines`) applies unchanged. */
export function asBankLine(row: Pick<ParsedRow, 'bankTxnId' | 'valueDate' | 'amount' | 'direction' | 'narration' | 'reference' | 'counterparty'>, ids: { id: string; importId: string; accountId: string; entityId: string; iban: string }): BankLine {
  return {
    id: ids.id,
    statementId: ids.importId,
    beneficiaryId: ids.accountId,
    legalEntityId: ids.entityId,
    accountIban: ids.iban,
    source: STATEMENT_SOURCE,
    bankTxnId: row.bankTxnId,
    valueDate: row.valueDate,
    amount: pkr(row.amount),
    narration: row.narration,
    reference: row.reference,
    counterpartyName: row.counterparty,
    counterpartyAccount: '',
    state: 'unmatched',
    direction: row.direction,
  };
}

/**
 * Each row's status: invalid; the same transaction earlier in the file; already imported (an earlier
 * committed import of the same account); or new. Identity is (account, source, the bank's id) — C.2's
 * `lineKey`: a shared reference text never makes two transfers duplicates.
 */
export function classify(rows: readonly ParsedRow[], accountId: string, committed: readonly BankLine[]): BankImportRow[] {
  const prior = new Set(committed.filter((l) => l.beneficiaryId === accountId).map(lineKey));
  const seen = new Set<string>();
  return rows.map((r) => {
    const key = lineKey({ source: STATEMENT_SOURCE, beneficiaryId: accountId, bankTxnId: r.bankTxnId });
    const status = r.problems.length ? 'invalid' : seen.has(key) ? 'duplicate_in_file' : prior.has(key) ? 'duplicate_prior' : 'new';
    if (!r.problems.length) seen.add(key);
    return { n: r.n, bankTxnId: r.bankTxnId, valueDate: r.valueDate, amount: pkr(r.amount), direction: r.direction, narration: r.narration, reference: r.reference, counterparty: r.counterparty, status, problems: [...r.problems] };
  });
}

export function countsOf(rows: readonly BankImportRow[]): BankImportCounts {
  return {
    rows: rows.length,
    new: rows.filter((r) => r.status === 'new').length,
    duplicateInFile: rows.filter((r) => r.status === 'duplicate_in_file').length,
    duplicatePrior: rows.filter((r) => r.status === 'duplicate_prior').length,
    invalid: rows.filter((r) => r.status === 'invalid').length,
  };
}

export const totalOf = (rows: readonly BankImportRow[], direction: 'credit' | 'debit') => sum(rows.filter((r) => r.status === 'new' && r.direction === direction).map((r) => toPaisa(r.amount.amount)));

export const fileHash = (content: string) => fingerprint(content.replace(/\r\n/g, '\n').trim());

/**
 * Commits an approved import: rows are classified again against what is committed now (another import
 * may have been approved meanwhile) and only new lines are added, through C.2's `newLines`. Each becomes
 * an unmatched statement line: never a receipt, never a payment, never a settlement.
 */
export function commitImport(state: LedgerState, imp: StoredImport, iban: string): BankLine[] {
  const rows = classify(
    imp.rows.map((r) => ({ ...r, amount: toPaisa(r.amount.amount), problems: [...r.problems] })),
    imp.accountId,
    state.lines,
  );
  imp.rows = rows;
  let n = state.lines.length;
  const incoming = rows
    .filter((r) => r.status === 'new')
    .map((r) => {
      n += 1;
      return asBankLine({ ...r, amount: toPaisa(r.amount.amount) }, { id: `bsl_${imp.id.slice(4)}_${String(n).padStart(4, '0')}`, importId: imp.id, accountId: imp.accountId, entityId: imp.entityId, iban });
    });
  const fresh = newLines(state.lines, incoming);
  state.lines.push(...fresh);
  return fresh;
}

// ---------------------------------------------------------------------------------------------
// State changes of periods, chart, rules and imports (called after every check has passed)
// ---------------------------------------------------------------------------------------------

export function closePeriod(state: LedgerState, entityId: string, period: string, who: Actor, at: string): StoredPeriod {
  let p = periodRecord(state, entityId, period);
  if (!p) {
    p = { id: `fpd_${state.entities.find((e) => e.id === entityId)!.code.toLowerCase()}_${period.replace('-', '')}`, legalEntityId: entityId, period, state: 'open', history: [] };
    state.periods.push(p);
  }
  if (p.state === 'closed') throw new Error('already closed');
  p.state = 'closed';
  p.closedBy = who.by;
  p.closedByName = who.byName;
  p.closedAt = at;
  delete p.reopenRequest;
  p.history.push({ at, by: who.by, byName: who.byName, action: 'closed' });
  return p;
}

export function requestReopen(p: StoredPeriod, who: Actor, at: string, reason: string): void {
  if (p.state !== 'closed' || p.reopenRequest) throw new Error('reopen request refused');
  p.reopenRequest = { by: who.by, byName: who.byName, at, reason };
  p.history.push({ at, by: who.by, byName: who.byName, action: 'reopen_requested', note: reason });
}

export function decideReopen(p: StoredPeriod, who: Actor, at: string, approve: boolean, note?: string): void {
  if (p.state !== 'closed' || !p.reopenRequest || p.reopenRequest.by === who.by) throw new Error('reopen decision refused');
  delete p.reopenRequest;
  if (approve) p.state = 'reopened';
  p.history.push({ at, by: who.by, byName: who.byName, action: approve ? 'reopened' : 'reopen_rejected', ...(note ? { note } : {}) });
}

export interface AccountDraft {
  entityId: string;
  code: string;
  name: string;
  type: GlAccountType;
}

export function draftAccount(state: LedgerState, d: AccountDraft, who: Actor, at: string): StoredGlAccount {
  const { id } = nextRef(state, d.entityId, 'account', at.slice(0, 10));
  const a: StoredGlAccount = { id, entityId: d.entityId, code: d.code, name: d.name, type: d.type, state: 'draft', draftedBy: who.by, draftedByName: who.byName, draftedAt: at, history: [event(who, at, 'account_drafted', { values: { code: d.code } })] };
  state.accounts.push(a);
  return a;
}

/** Approving a drafted account adds it to the chart as a new chart version. */
export function approveAccount(state: LedgerState, a: StoredGlAccount, who: Actor, at: string): void {
  if (a.state !== 'draft' || a.draftedBy === who.by) throw new Error('approval refused');
  const version = chartVersion(state, a.entityId) + 1;
  a.state = 'active';
  a.sinceVersion = version;
  a.approvedBy = who.by;
  a.approvedByName = who.byName;
  a.approvedAt = at;
  a.history.push(event(who, at, 'account_approved', { values: { version: String(version) } }));
  state.chartVersions.push({ entityId: a.entityId, version, at, by: a.draftedBy, byName: a.draftedByName, approvedByName: who.byName, change: 'account_added', accountCode: a.code });
}

export function rejectAccount(a: StoredGlAccount, who: Actor, at: string, reason: string): void {
  if (a.state !== 'draft' || a.draftedBy === who.by) throw new Error('rejection refused');
  a.state = 'rejected';
  a.rejectedBy = who.by;
  a.rejectedByName = who.byName;
  a.rejectReason = reason;
  a.history.push(event(who, at, 'account_rejected', { note: reason }));
}

export function draftRuleVersion(rule: StoredRule, v: Omit<StoredRuleVersion, 'n' | 'draftedBy' | 'draftedByName' | 'draftedAt'>, who: Actor, at: string): StoredRuleVersion {
  const version: StoredRuleVersion = { ...v, n: Math.max(0, ...rule.versions.map((x) => x.n)) + 1, draftedBy: who.by, draftedByName: who.byName, draftedAt: at };
  rule.versions.push(version);
  rule.history.push(event(who, at, 'rule_version_drafted', { values: { version: String(version.n), from: version.effectiveFrom } }));
  return version;
}

export function createImport(state: LedgerState, input: { entityId: string; accountId: string; fileName: string; sample: boolean; content: string }, who: Actor, at: string, today: string): StoredImport {
  const rows = classify(parseStatement(input.content, today), input.accountId, state.lines);
  const { id, ref } = nextRef(state, input.entityId, 'import', today);
  const imp: StoredImport = {
    id,
    ref,
    entityId: input.entityId,
    accountId: input.accountId,
    fileName: input.fileName,
    sample: input.sample,
    fileHash: fileHash(input.content),
    state: 'preview',
    rows,
    preparedBy: who.by,
    preparedByName: who.byName,
    preparedAt: at,
    history: [event(who, at, 'import_previewed', { values: { rows: String(rows.length), fresh: String(countsOf(rows).new) } })],
  };
  state.imports.push(imp);
  return imp;
}

export function submitImport(imp: StoredImport, who: Actor, at: string): void {
  if (imp.state !== 'preview' || imp.preparedBy !== who.by) throw new Error('submit refused');
  imp.state = 'awaiting_approval';
  imp.submittedAt = at;
  imp.history.push(event(who, at, 'import_submitted'));
}

/** Approval by someone other than the uploader commits the new lines (unmatched statement lines only). */
export function approveImport(state: LedgerState, imp: StoredImport, iban: string, who: Actor, at: string): BankLine[] {
  if (imp.state !== 'awaiting_approval' || imp.preparedBy === who.by) throw new Error('approval refused');
  const fresh = commitImport(state, imp, iban);
  imp.state = 'committed';
  imp.approvedBy = who.by;
  imp.approvedByName = who.byName;
  imp.approvedAt = at;
  imp.committedLines = fresh.length;
  imp.history.push(event(who, at, 'import_committed', { values: { lines: String(fresh.length) } }));
  return fresh;
}

export function rejectImport(imp: StoredImport, who: Actor, at: string, reason: string): void {
  if (imp.state !== 'awaiting_approval' || imp.preparedBy === who.by) throw new Error('rejection refused');
  imp.state = 'rejected';
  imp.rejectedBy = who.by;
  imp.rejectedByName = who.byName;
  imp.rejectReason = reason;
  imp.history.push(event(who, at, 'import_rejected', { note: reason }));
}

export function discardImport(imp: StoredImport, who: Actor, at: string): void {
  if ((imp.state !== 'preview' && imp.state !== 'awaiting_approval') || imp.preparedBy !== who.by) throw new Error('discard refused');
  imp.state = 'discarded';
  imp.history.push(event(who, at, 'import_discarded'));
}
