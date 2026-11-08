import {
  ApiError,
  GL_ACCOUNT_TYPES,
  JOURNAL_FILTERS,
  type BalanceSheet,
  type BankImportsView,
  type BankImportView,
  type ChartView,
  type GlAccountType,
  type GlAccountWorkspace,
  type JournalFilter,
  type JournalFormOptions,
  type JournalPolicy,
  type JournalsList,
  type JournalView,
  type LedgerPeriodsView,
  type PostingRulePreview,
  type PostingRulesView,
  type ProfitAndLoss,
  type TrialBalance,
} from '@repo/contracts';
import { matches, requires, type Handler, type HandlerContext } from '../../handler-types';
import { fromPaisa, toPaisa } from '../../portal';
import { stamp } from '../../society/handlers';
import { lastDayOf } from '../../society/finance/model';
import {
  ACCOUNT_CODE,
  CODE_RANGE,
  accountLines,
  addJournal,
  approveAccount,
  approveImport,
  approveJournal,
  balanceSheet,
  bookPeriods,
  cancelJournal,
  chartVersion,
  closeChecks,
  closePeriod,
  countsOf,
  createImport,
  dateProblem,
  decideReopen,
  declaredAccount,
  discardImport,
  draftAccount,
  draftRuleVersion,
  editJournal,
  fiscalYearStart,
  isClosed,
  isDate,
  isReversed,
  normaliseJournal,
  paisaOf,
  parseStatement,
  periodOfDate,
  periodRecord,
  pkr,
  postJournal,
  previewLines,
  profitAndLoss,
  rejectAccount,
  rejectImport,
  rejectJournal,
  requestReopen,
  reverseJournal,
  reversible,
  ruleVersionOn,
  submitImport,
  submitJournal,
  trialBalance,
  usableAccount,
  type FieldProblem,
  type Problems,
} from './engine';
import { ledgerSamples } from './samples';
import { bound, entityOf, hidden, keyReused, mayUse, seesBank } from './scope';
import { COLLECTION_ACCOUNT, ledgerState, OPERATING_ACCOUNT, type LedgerState, type StoredEntity, type StoredImport, type StoredJournal, type StoredPeriod } from './state';
import { accountView, bankRef, importSummary, importView, journalSummary, journalView, lineViews, me, periodView, ruleView, scopeOf, statementLines } from './views';

/**
 * Gate E.7 endpoints (provisional, Wave 1): the developer ledger (ACC-001…010) and the bank statement
 * import (BANK-005). The transport checks the module (accounting / banking), the permission and the
 * suspension class first. Every changing handler then checks, in this order (plan §4.2):
 * 1. **Authority over the entity**: the legal entity named in the body, or the record's entity, must be
 *    one the person may use with the permission of the step; anything else answers exactly like an id
 *    never issued (404 not_found), and so does an unknown record id.
 * 2. **Idempotency** (§4.5): the key binds operation, person, target and normalised input; a replay
 *    returns the earlier result after the scope check above; any other reuse is a non-disclosing 409.
 * 3. **The record's state**: posted journals are immutable (409), closed periods refuse postings (409).
 * 4. **Maker ≠ checker** by principal: nobody approves or posts their own journal, approves their own
 *    chart change, period reopening or statement import.
 * 5. **Validation** of every field before anything is stored; a problem never names a record of
 *    another entity.
 * 6. Mutate, audit (record history), save. A refusal leaves the stored state byte-identical.
 * Changes are refused in training mode (no practice ledger exists).
 *
 * Nothing here settles, pays, transfers or confirms money. Posting rules are proposals only (E-15…E-17).
 * Imported statement lines are unmatched statement lines; no receipt or payment is ever created.
 */

const R = 'history_read' as const;
const W = 'operational' as const;

export const JOURNAL_POLICY: JournalPolicy = { version: 1, effectiveFrom: '2026-07-01', approval: 'always', approverNotMaker: true, posterNotMaker: true };

type Body = Record<string, unknown>;
const body = (ctx: HandlerContext) => (ctx.req.body ?? {}) as Body;
const q = (ctx: HandlerContext, key: string) => String(ctx.req.query?.[key] ?? '').trim();
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');
const today = (ctx: HandlerContext) => ctx.at.slice(0, 10);
const save = (ctx: HandlerContext) => ctx.demo.save();

function problem(ctx: HandlerContext, status: number, code: string, messageKey: string, errors?: Problems): never {
  throw new ApiError({ status, code, messageKey, ...(errors && Object.keys(errors).length ? { errors } : {}), correlationId: ctx.correlationId, changed: false });
}
function invalid(ctx: HandlerContext, errors: Problems): never {
  problem(ctx, 422, 'validation_failed', 'errors:validation.summary', errors);
}
function field(ctx: HandlerContext, name: string, p: FieldProblem): never {
  invalid(ctx, { [name]: [p] });
}
function invalidState(ctx: HandlerContext): never {
  problem(ctx, 409, 'invalid_state', 'ledger:problems.invalidState');
}
function makerChecker(ctx: HandlerContext): never {
  problem(ctx, 403, 'maker_checker', 'ledger:problems.makerChecker');
}
function notMaker(ctx: HandlerContext): never {
  problem(ctx, 403, 'not_maker', 'ledger:problems.notMaker');
}
function periodClosed(ctx: HandlerContext, period: string): never {
  problem(ctx, 409, 'period_closed', 'ledger:problems.periodClosed', { date: [{ code: 'ledger:problems.periodClosedDetail', params: { period } }] });
}

function official(ctx: HandlerContext): void {
  if (ctx.req.training) problem(ctx, 403, 'training_not_supported', 'ledger:problems.training');
}

/** The organisation's ledger, created (and seeded) on first use in the demo session. */
const ledger = (ctx: HandlerContext) => ledgerState(ctx);

// ---------------------------------------------------------------------------------------------
// Scoped finders: unknown and out-of-scope ids answer alike
// ---------------------------------------------------------------------------------------------

function journalOf(ctx: HandlerContext, st: LedgerState, permission: 'gl.view' | 'gl.post' | 'journal.approve', id = ctx.params.id): StoredJournal {
  const j = st.journals.find((x) => x.id === id);
  if (!j || !mayUse(ctx, 'accounting', j.entityId, permission)) hidden(ctx);
  return j;
}

function scopeFor(ctx: HandlerContext, st: LedgerState, entityId: string, module: 'accounting' | 'banking' = 'accounting', permission: 'gl.view' | 'bank.view' = 'gl.view') {
  const { entity, entities } = entityOf(ctx, st, entityId, module, permission);
  return scopeOf(ctx, entity, entities);
}

/** A period addressed by its id ("fpd_lke_202610"): one of the entity's book months. */
function periodOf(ctx: HandlerContext, st: LedgerState, permissions: ReadonlyArray<'gl.view' | 'gl.post' | 'period.close'>): { entity: StoredEntity; period: string } {
  const m = /^fpd_([a-z0-9]+)_(\d{4})(\d{2})$/.exec(ctx.params.id ?? '');
  const entity = m ? st.entities.find((e) => e.code.toLowerCase() === m[1]) : undefined;
  const period = m ? `${m[2]}-${m[3]}` : '';
  if (!entity || !bookPeriods(st, entity.id, today(ctx)).includes(period)) hidden(ctx);
  if (!permissions.some((p) => mayUse(ctx, p === 'period.close' ? 'banking' : 'accounting', entity.id, p))) hidden(ctx);
  return { entity, period };
}

function storedPeriod(st: LedgerState, entity: StoredEntity, period: string): StoredPeriod | undefined {
  return periodRecord(st, entity.id, period);
}

function importOf(ctx: HandlerContext, st: LedgerState, permission: 'bank.view' | 'bank.reconcile', id = ctx.params.id): StoredImport {
  const imp = st.imports.find((x) => x.id === id);
  if (!imp || !mayUse(ctx, 'banking', imp.entityId, permission)) hidden(ctx);
  return imp;
}

/** The report period: one of the entity's book months (default: the demo month). */
function reportPeriod(ctx: HandlerContext, st: LedgerState, entity: StoredEntity): { period: string; periods: string[]; asOf: string } {
  const periods = bookPeriods(st, entity.id, today(ctx));
  const raw = q(ctx, 'period');
  const period = raw || periods.at(-1)!;
  if (!periods.includes(period)) field(ctx, 'period', { code: 'ledger:problems.periodUnknown' });
  const end = lastDayOf(period);
  return { period, periods, asOf: end < today(ctx) ? end : today(ctx) };
}

// ---------------------------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------------------------

function reason(ctx: HandlerContext, raw: unknown): string {
  const v = str(raw, 300);
  if (v.length < 3) field(ctx, 'reason', { code: 'ledger:problems.reasonShort', params: { min: '3' } });
  if (v.length > 300) field(ctx, 'reason', { code: 'ledger:problems.memoLong', params: { max: '300' } });
  return v;
}

/** The journal input as the key binds it (whitespace and amount formatting do not make a new request). */
function journalPrint(b: Body) {
  const lines = Array.isArray(b.lines) ? (b.lines as Body[]) : [];
  return {
    entityId: str(b.entityId),
    date: str(b.date),
    memo: str(b.memo),
    submit: b.submit === true,
    lines: lines.map((l) => ({ a: str(l?.accountId), d: String(paisaOf(l?.debit) ?? str(l?.debit)), c: String(paisaOf(l?.credit) ?? str(l?.credit)), m: str(l?.memo), cc: str(l?.costCentreId) })),
  };
}

/** A closed period refuses before field validation (the record's state, §4.2 step 3). */
function assertOpenOn(ctx: HandlerContext, st: LedgerState, entityId: string, rawDate: unknown): void {
  const date = str(rawDate, 10);
  if (isDate(date) && isClosed(st, entityId, date)) periodClosed(ctx, periodOfDate(date));
}

// ---------------------------------------------------------------------------------------------
// Chart of accounts (ACC-001, ACC-002)
// ---------------------------------------------------------------------------------------------

const chartHandlers: Handler[] = [
  {
    method: 'GET',
    pattern: /^\/ledger\/accounts$/,
    access: requires('accounting', 'gl.view', R),
    handle: (ctx): ChartView => {
      const st = ledger(ctx);
      const scope = scopeFor(ctx, st, q(ctx, 'entity'));
      const term = q(ctx, 'q');
      const type = q(ctx, 'type');
      const accounts = st.accounts
        .filter((a) => a.entityId === scope.entity.id)
        .filter((a) => !type || a.type === type)
        .filter((a) => !term || matches(term, a.code, a.name))
        .sort((a, b) => a.code.localeCompare(b.code) || a.state.localeCompare(b.state))
        .map((a) => accountView(ctx, st, a));
      return {
        ...scope,
        chartVersion: chartVersion(st, scope.entity.id),
        versions: st.chartVersions
          .filter((v) => v.entityId === scope.entity.id)
          .sort((a, b) => b.version - a.version)
          .map((v) => ({ version: v.version, at: v.at, byName: v.byName, ...(v.approvedByName ? { approvedByName: v.approvedByName } : {}), change: v.change, ...(v.accountCode ? { accountCode: v.accountCode } : {}) })),
        accounts,
        canDraft: mayUse(ctx, 'accounting', scope.entity.id, 'gl.post'),
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/ledger\/accounts\/(?<id>[\w-]+)$/,
    access: requires('accounting', 'gl.view', R),
    handle: (ctx): GlAccountWorkspace => {
      const st = ledger(ctx);
      const a = st.accounts.find((x) => x.id === ctx.params.id);
      if (!a || !mayUse(ctx, 'accounting', a.entityId, 'gl.view')) hidden(ctx);
      const scope = scopeFor(ctx, st, a.entityId);
      const pending = st.journals
        .filter((j) => j.entityId === a.entityId && (j.state === 'draft' || j.state === 'submitted' || j.state === 'approved'))
        .flatMap((j) => j.lines.filter((l) => l.accountId === a.id).map((l) => ({ journalId: j.id, journalRef: j.ref, date: j.date, state: j.state, debit: pkr(toPaisa(l.debit)), credit: pkr(toPaisa(l.credit)) })));
      const bankId = a.bankAccountId && seesBank(ctx, a.entityId) ? a.bankAccountId : undefined;
      const statement = bankId ? st.lines.filter((l) => l.beneficiaryId === bankId && l.state === 'unmatched') : [];
      const sumDir = (d: 'credit' | 'debit') => pkr(statement.filter((l) => (l.direction ?? 'credit') === d).reduce((n, l) => n + toPaisa(l.amount.amount), 0n));
      return {
        ...scope,
        account: accountView(ctx, st, a),
        lines: accountLines(st, a).map((x) => ({
          journalId: x.journal.id,
          journalRef: x.journal.ref,
          date: x.journal.date,
          memo: x.journal.memo,
          ...(x.line.memo ? { lineMemo: x.line.memo } : {}),
          debit: pkr(toPaisa(x.line.debit)),
          credit: pkr(toPaisa(x.line.credit)),
          running: pkr(x.running),
          kind: x.journal.kind,
        })),
        pending,
        history: a.history,
        ...(bankId ? { statementLines: { count: statement.length, credits: sumDir('credit'), debits: sumDir('debit') } } : {}),
      };
    },
  },
  {
    // E-16: a chart change is a draft until someone else approves it.
    method: 'POST',
    pattern: /^\/ledger\/accounts$/,
    access: requires('accounting', 'gl.post', W),
    handle: (ctx) => {
      official(ctx);
      const st = ledger(ctx);
      const b = body(ctx);
      const { entity } = entityOf(ctx, st, b.entityId, 'accounting', 'gl.post');
      const input = { entityId: entity.id, code: str(b.code, 4), name: str(b.name, 80), type: str(b.type, 20) };
      const idem = bound(ctx, st, 'account.draft', entity.id, input);
      if (idem.replay) {
        const a = st.accounts.find((x) => x.id === idem.replay && x.entityId === entity.id);
        return a ? accountView(ctx, st, a) : keyReused(ctx);
      }
      const problems: Problems = {};
      const add = (f: string, p: FieldProblem) => (problems[f] ??= []).push(p);
      const type = (GL_ACCOUNT_TYPES as readonly string[]).includes(input.type) ? (input.type as GlAccountType) : undefined;
      if (!type) add('type', { code: 'ledger:problems.typeRequired' });
      if (!ACCOUNT_CODE.test(input.code)) add('code', { code: 'ledger:problems.codeFormat' });
      else if (type && input.code[0] !== CODE_RANGE[type]) add('code', { code: 'ledger:problems.codeRange', params: { digit: CODE_RANGE[type] } });
      else if (st.accounts.some((a) => a.entityId === entity.id && a.code === input.code && a.state !== 'rejected')) add('code', { code: 'ledger:problems.codeTaken' });
      if (input.name.length < 3) add('name', { code: 'ledger:problems.nameShort', params: { min: '3' } });
      if (input.name.length > 80) add('name', { code: 'ledger:problems.memoLong', params: { max: '80' } });
      if (Object.keys(problems).length) invalid(ctx, problems);
      const a = draftAccount(st, { entityId: entity.id, code: input.code, name: input.name, type: type! }, me(ctx), stampOf(ctx));
      idem.remember(a.id);
      save(ctx);
      return accountView(ctx, st, a);
    },
  },
  ...(['approve', 'reject'] as const).map(
    (decision): Handler => ({
      method: 'POST',
      pattern: new RegExp(`^/ledger/accounts/(?<id>[\\w-]+)/${decision}$`),
      access: requires('accounting', 'journal.approve', W),
      handle: (ctx) => {
        official(ctx);
        const st = ledger(ctx);
        const a = st.accounts.find((x) => x.id === ctx.params.id);
        if (!a || !mayUse(ctx, 'accounting', a.entityId, 'journal.approve')) hidden(ctx);
        const note = decision === 'reject' ? str(body(ctx).reason, 300) : '';
        const idem = bound(ctx, st, `account.${decision}`, a.id, { note });
        if (idem.replay) return accountView(ctx, st, a);
        if (a.state !== 'draft') invalidState(ctx);
        if (a.draftedBy === me(ctx).by) makerChecker(ctx);
        if (decision === 'approve') approveAccount(st, a, me(ctx), stampOf(ctx));
        else rejectAccount(a, me(ctx), stampOf(ctx), reason(ctx, body(ctx).reason));
        idem.remember(a.id);
        save(ctx);
        return accountView(ctx, st, a);
      },
    }),
  ),
];

// ---------------------------------------------------------------------------------------------
// Journals (ACC-003, ACC-004, ACC-005)
// ---------------------------------------------------------------------------------------------

function inFilter(st: LedgerState, j: StoredJournal, f: JournalFilter): boolean {
  if (f === 'all') return true;
  if (f === 'draft') return j.state === 'draft';
  if (f === 'awaiting') return j.state === 'submitted';
  if (f === 'approved') return j.state === 'approved';
  if (f === 'posted') return j.state === 'posted';
  if (f === 'reversed') return isReversed(st, j);
  return j.state === 'rejected' || j.state === 'cancelled';
}

const view = (ctx: HandlerContext, st: LedgerState, j: StoredJournal): JournalView => journalView(ctx, st, j, scopeFor(ctx, st, j.entityId));

/** The scoped record a replayed key points at (or a non-disclosing 409 when it is no longer the reader's). */
function replayJournal(ctx: HandlerContext, st: LedgerState, id: string, entityId: string): JournalView {
  const j = st.journals.find((x) => x.id === id && x.entityId === entityId);
  return j && mayUse(ctx, 'accounting', j.entityId, 'gl.view') ? view(ctx, st, j) : keyReused(ctx);
}

/** The demo's business date at the organisation's wall-clock time (the shared action stamp, Issue #6). */
const stampOf = (ctx: HandlerContext) => stamp(ctx);

const journalHandlers: Handler[] = [
  {
    method: 'GET',
    pattern: /^\/ledger\/journals$/,
    access: requires('accounting', 'gl.view', R),
    handle: (ctx): JournalsList => {
      const st = ledger(ctx);
      const scope = scopeFor(ctx, st, q(ctx, 'entity'));
      const raw = q(ctx, 'filter');
      const filter: JournalFilter = (JOURNAL_FILTERS as readonly string[]).includes(raw) ? (raw as JournalFilter) : 'all';
      const term = q(ctx, 'q');
      const period = q(ctx, 'period');
      const mine = st.journals
        .filter((j) => j.entityId === scope.entity.id)
        .filter((j) => !period || periodOfDate(j.date) === period)
        .filter((j) => !term || matches(term, j.ref, j.memo, j.makerName))
        .sort((a, b) => b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref));
      const counts = Object.fromEntries(JOURNAL_FILTERS.map((f) => [f, mine.filter((j) => inFilter(st, j, f)).length])) as JournalsList['counts'];
      return { ...scope, items: mine.filter((j) => inFilter(st, j, filter)).map((j) => journalSummary(st, j)), counts, canCreate: mayUse(ctx, 'accounting', scope.entity.id, 'gl.post') };
    },
  },
  {
    method: 'GET',
    pattern: /^\/ledger\/journals\/(?<id>[\w-]+)$/,
    access: requires('accounting', 'gl.view', R),
    handle: (ctx): JournalView => {
      const st = ledger(ctx);
      return view(ctx, st, journalOf(ctx, st, 'gl.view'));
    },
  },
  {
    method: 'GET',
    pattern: /^\/ledger\/journal-form$/,
    access: requires('accounting', 'gl.post', R),
    handle: (ctx): JournalFormOptions => {
      const st = ledger(ctx);
      const { entity, entities } = entityOf(ctx, st, q(ctx, 'entity'), 'accounting', 'gl.post');
      return {
        ...scopeOf(ctx, entity, entities),
        accounts: st.accounts
          .filter((a) => a.entityId === entity.id && a.state === 'active')
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((a) => ({ id: a.id, code: a.code, name: a.name, ...(a.labelKey ? { labelKey: a.labelKey } : {}), type: a.type, ...(a.lock ? { lock: a.lock } : {}) })),
        costCentres: st.costCentres.filter((c) => c.entityId === entity.id).map((c) => ({ id: c.id, entityId: c.entityId, code: c.code, labelKey: c.labelKey })),
        openPeriods: bookPeriods(st, entity.id, today(ctx)).filter((p) => !isClosed(st, entity.id, `${p}-01`)),
        policy: JOURNAL_POLICY,
      };
    },
  },
  {
    method: 'POST',
    pattern: /^\/ledger\/journals$/,
    access: requires('accounting', 'gl.post', W),
    handle: (ctx): JournalView => {
      official(ctx);
      const st = ledger(ctx);
      const b = body(ctx);
      const { entity } = entityOf(ctx, st, b.entityId, 'accounting', 'gl.post');
      const idem = bound(ctx, st, 'journal.create', entity.id, journalPrint(b));
      if (idem.replay) return replayJournal(ctx, st, idem.replay, entity.id);
      assertOpenOn(ctx, st, entity.id, b.date);
      const n = normaliseJournal(st, entity.id, { date: b.date, memo: b.memo, lines: b.lines }, today(ctx));
      if (!n.journal) invalid(ctx, n.problems);
      const j = addJournal(st, n.journal, me(ctx), stampOf(ctx), { submit: b.submit === true });
      idem.remember(j.id);
      save(ctx);
      return view(ctx, st, j);
    },
  },
  {
    // A draft may change; a posted journal never does (corrections are reversals).
    method: 'POST',
    pattern: /^\/ledger\/journals\/(?<id>[\w-]+)\/edit$/,
    access: requires('accounting', 'gl.post', W),
    handle: (ctx): JournalView => {
      official(ctx);
      const st = ledger(ctx);
      const j = journalOf(ctx, st, 'gl.post');
      const b = body(ctx);
      const idem = bound(ctx, st, 'journal.edit', j.id, journalPrint({ ...b, entityId: j.entityId }));
      if (idem.replay) return view(ctx, st, j);
      if (j.state === 'posted') problem(ctx, 409, 'journal_posted', 'ledger:problems.journalPosted');
      if (j.state !== 'draft') invalidState(ctx);
      if (j.makerId !== me(ctx).by) notMaker(ctx);
      assertOpenOn(ctx, st, j.entityId, b.date);
      const n = normaliseJournal(st, j.entityId, { date: b.date, memo: b.memo, lines: b.lines }, today(ctx));
      if (!n.journal) invalid(ctx, n.problems);
      editJournal(j, n.journal, me(ctx), stampOf(ctx));
      idem.remember(j.id);
      save(ctx);
      return view(ctx, st, j);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ledger\/journals\/(?<id>[\w-]+)\/submit$/,
    access: requires('accounting', 'gl.post', W),
    handle: (ctx): JournalView => {
      official(ctx);
      const st = ledger(ctx);
      const j = journalOf(ctx, st, 'gl.post');
      const idem = bound(ctx, st, 'journal.submit', j.id, {});
      if (idem.replay) return view(ctx, st, j);
      if (j.state !== 'draft') invalidState(ctx);
      if (j.makerId !== me(ctx).by) notMaker(ctx);
      if (isClosed(st, j.entityId, j.date)) periodClosed(ctx, periodOfDate(j.date));
      // The accounts it names must still be usable (a chart change may have happened meanwhile).
      const n = normaliseJournal(st, j.entityId, { date: j.date, memo: j.memo, lines: j.lines.map((l) => ({ ...l })) }, today(ctx));
      if (!n.journal) invalid(ctx, n.problems);
      submitJournal(j, me(ctx), stampOf(ctx));
      idem.remember(j.id);
      save(ctx);
      return view(ctx, st, j);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ledger\/journals\/(?<id>[\w-]+)\/approve$/,
    access: requires('accounting', 'journal.approve', W),
    handle: (ctx): JournalView => {
      official(ctx);
      const st = ledger(ctx);
      const j = journalOf(ctx, st, 'journal.approve');
      const idem = bound(ctx, st, 'journal.approve', j.id, {});
      if (idem.replay) return view(ctx, st, j);
      if (j.state !== 'submitted') invalidState(ctx);
      if (isClosed(st, j.entityId, j.date)) periodClosed(ctx, periodOfDate(j.date));
      if (j.makerId === me(ctx).by) makerChecker(ctx);
      approveJournal(j, me(ctx), stampOf(ctx));
      idem.remember(j.id);
      save(ctx);
      return view(ctx, st, j);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ledger\/journals\/(?<id>[\w-]+)\/reject$/,
    access: requires('accounting', 'journal.approve', W),
    handle: (ctx): JournalView => {
      official(ctx);
      const st = ledger(ctx);
      const j = journalOf(ctx, st, 'journal.approve');
      const note = str(body(ctx).reason, 300);
      const idem = bound(ctx, st, 'journal.reject', j.id, { note });
      if (idem.replay) return view(ctx, st, j);
      if (j.state !== 'submitted') invalidState(ctx);
      if (j.makerId === me(ctx).by) makerChecker(ctx);
      rejectJournal(st, j, me(ctx), stampOf(ctx), reason(ctx, body(ctx).reason));
      idem.remember(j.id);
      save(ctx);
      return view(ctx, st, j);
    },
  },
  {
    // E-17: posted only after approval by someone else, by someone other than the maker, in an open period.
    method: 'POST',
    pattern: /^\/ledger\/journals\/(?<id>[\w-]+)\/post$/,
    access: requires('accounting', 'gl.post', W),
    handle: (ctx): JournalView => {
      official(ctx);
      const st = ledger(ctx);
      const j = journalOf(ctx, st, 'gl.post');
      const idem = bound(ctx, st, 'journal.post', j.id, {});
      if (idem.replay) return view(ctx, st, j);
      if (j.state !== 'approved') invalidState(ctx);
      if (isClosed(st, j.entityId, j.date)) periodClosed(ctx, periodOfDate(j.date));
      if (j.makerId === me(ctx).by) makerChecker(ctx);
      postJournal(st, j, me(ctx), stampOf(ctx));
      idem.remember(j.id);
      save(ctx);
      return view(ctx, st, j);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ledger\/journals\/(?<id>[\w-]+)\/cancel$/,
    access: requires('accounting', 'gl.post', W),
    handle: (ctx): JournalView => {
      official(ctx);
      const st = ledger(ctx);
      const j = journalOf(ctx, st, 'gl.post');
      const idem = bound(ctx, st, 'journal.cancel', j.id, {});
      if (idem.replay) return view(ctx, st, j);
      if (j.state === 'posted') problem(ctx, 409, 'journal_posted', 'ledger:problems.journalPosted');
      if (j.state !== 'draft' && j.state !== 'submitted') invalidState(ctx);
      if (j.makerId !== me(ctx).by) notMaker(ctx);
      cancelJournal(st, j, me(ctx), stampOf(ctx));
      idem.remember(j.id);
      save(ctx);
      return view(ctx, st, j);
    },
  },
  {
    // ACC-005: a posted journal is corrected only by a reversal journal (approved and posted by someone else).
    method: 'POST',
    pattern: /^\/ledger\/journals\/(?<id>[\w-]+)\/reverse$/,
    access: requires('accounting', 'gl.post', W),
    handle: (ctx): JournalView => {
      official(ctx);
      const st = ledger(ctx);
      const j = journalOf(ctx, st, 'gl.post');
      const b = body(ctx);
      const input = { date: str(b.date, 10), reason: str(b.reason, 300) };
      const idem = bound(ctx, st, 'journal.reverse', j.id, input);
      if (idem.replay) return replayJournal(ctx, st, idem.replay, j.entityId);
      const r = reversible(st, j);
      if (r !== 'ok') problem(ctx, 409, r === 'not_posted' ? 'not_posted' : r, `ledger:problems.${r === 'not_posted' ? 'notPosted' : r === 'already_reversed' ? 'alreadyReversed' : 'reversalNotReversible'}`);
      assertOpenOn(ctx, st, j.entityId, input.date);
      const problems: Problems = {};
      const dp = dateProblem(st, j.entityId, input.date, today(ctx));
      if (dp) problems.date = [dp];
      else if (input.date < j.date) problems.date = [{ code: 'ledger:problems.reverseBefore' }];
      if (input.reason.length < 3) problems.reason = [{ code: 'ledger:problems.reasonShort', params: { min: '3' } }];
      if (input.reason.length > 300) problems.reason = [{ code: 'ledger:problems.memoLong', params: { max: '300' } }];
      if (Object.keys(problems).length) invalid(ctx, problems);
      const rev = reverseJournal(st, j, input.date, input.reason, me(ctx), stampOf(ctx));
      idem.remember(rev.id);
      save(ctx);
      return view(ctx, st, rev);
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Reports (ACC-006, ACC-007, ACC-008): the same posted lines, three readings
// ---------------------------------------------------------------------------------------------

const row = (a: { id: string; code: string; name: string; labelKey?: string; type: GlAccountType }) => ({ accountId: a.id, code: a.code, name: a.name, ...(a.labelKey ? { labelKey: a.labelKey } : {}), type: a.type });
const sectionView = (s: { rows: Array<{ account: Parameters<typeof row>[0]; amount: bigint }>; total: bigint }) => ({ rows: s.rows.map((r) => ({ ...row(r.account), amount: pkr(r.amount) })), total: pkr(s.total) });

const reportHandlers: Handler[] = [
  {
    method: 'GET',
    pattern: /^\/ledger\/trial-balance$/,
    access: requires('accounting', 'gl.view', R),
    handle: (ctx): TrialBalance => {
      const st = ledger(ctx);
      const { entity, entities } = entityOf(ctx, st, q(ctx, 'entity'), 'accounting', 'gl.view');
      const { period, periods, asOf } = reportPeriod(ctx, st, entity);
      const tb = trialBalance(st, entity.id, asOf);
      return {
        ...scopeOf(ctx, entity, entities),
        period,
        asOf,
        periods,
        rows: tb.rows.map((r) => ({ ...row(r.account), debit: pkr(r.debit), credit: pkr(r.credit) })),
        totals: { debit: pkr(tb.debit), credit: pkr(tb.credit) },
        balanced: tb.debit === tb.credit,
        postedJournals: tb.journals,
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/ledger\/profit-and-loss$/,
    access: requires('accounting', 'gl.view', R),
    handle: (ctx): ProfitAndLoss => {
      const st = ledger(ctx);
      const { entity, entities } = entityOf(ctx, st, q(ctx, 'entity'), 'accounting', 'gl.view');
      const { period, periods, asOf } = reportPeriod(ctx, st, entity);
      const from = fiscalYearStart(st, entity.id, period);
      const pl = profitAndLoss(st, entity.id, from, asOf);
      return { ...scopeOf(ctx, entity, entities), from, to: asOf, period, periods, income: sectionView(pl.income), expenses: sectionView(pl.expenses), result: pkr(pl.result), revenuePolicy: 'not_set' };
    },
  },
  {
    method: 'GET',
    pattern: /^\/ledger\/balance-sheet$/,
    access: requires('accounting', 'gl.view', R),
    handle: (ctx): BalanceSheet => {
      const st = ledger(ctx);
      const { entity, entities } = entityOf(ctx, st, q(ctx, 'entity'), 'accounting', 'gl.view');
      const { period, periods, asOf } = reportPeriod(ctx, st, entity);
      const bs = balanceSheet(st, entity.id, asOf);
      const pl = profitAndLoss(st, entity.id, fiscalYearStart(st, entity.id, period), asOf);
      const tb = trialBalance(st, entity.id, asOf);
      return {
        ...scopeOf(ctx, entity, entities),
        asOf,
        period,
        periods,
        assets: sectionView(bs.assets),
        liabilities: sectionView(bs.liabilities),
        equity: sectionView(bs.equity),
        currentResult: pkr(bs.currentResult),
        liabilitiesEquityResult: pkr(bs.right),
        balances: bs.balances,
        resultMatchesProfitAndLoss: bs.currentResult === pl.result,
        trialBalanceBalanced: tb.debit === tb.credit,
      };
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Accounting periods (ACC-009)
// ---------------------------------------------------------------------------------------------

const periodsView = (ctx: HandlerContext, st: LedgerState, entity: StoredEntity, entities: StoredEntity[]): LedgerPeriodsView => ({
  ...scopeOf(ctx, entity, entities),
  periods: bookPeriods(st, entity.id, today(ctx))
    .reverse()
    .map((p) => periodView(ctx, st, entity.id, p)),
  policy: JOURNAL_POLICY,
});

const periodHandlers: Handler[] = [
  {
    method: 'GET',
    pattern: /^\/ledger\/periods$/,
    access: requires('accounting', 'gl.view', R),
    handle: (ctx): LedgerPeriodsView => {
      const st = ledger(ctx);
      const { entity, entities } = entityOf(ctx, st, q(ctx, 'entity'), 'accounting', 'gl.view');
      return periodsView(ctx, st, entity, entities);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ledger\/periods\/(?<id>[\w-]+)\/close$/,
    access: requires('banking', 'period.close', W),
    handle: (ctx) => {
      official(ctx);
      const st = ledger(ctx);
      const { entity, period } = periodOf(ctx, st, ['period.close']);
      const idem = bound(ctx, st, 'period.close', `${entity.id}:${period}`, {});
      if (idem.replay) return periodView(ctx, st, entity.id, period);
      if (storedPeriod(st, entity, period)?.state === 'closed') invalidState(ctx);
      const checks = closeChecks(st, entity.id, period, today(ctx));
      if (checks.some((c) => c.outcome === 'blocking')) problem(ctx, 409, 'close_blocked', 'ledger:problems.closeBlocked');
      const p = closePeriod(st, entity.id, period, me(ctx), stampOf(ctx));
      idem.remember(p.id);
      save(ctx);
      return periodView(ctx, st, entity.id, period);
    },
  },
  {
    method: 'POST',
    pattern: /^\/ledger\/periods\/(?<id>[\w-]+)\/reopen-request$/,
    access: requires('accounting', ['gl.post', 'period.close'], W),
    handle: (ctx) => {
      official(ctx);
      const st = ledger(ctx);
      const { entity, period } = periodOf(ctx, st, ['gl.post', 'period.close']);
      const note = str(body(ctx).reason, 300);
      const idem = bound(ctx, st, 'period.reopen_request', `${entity.id}:${period}`, { note });
      if (idem.replay) return periodView(ctx, st, entity.id, period);
      const p = storedPeriod(st, entity, period);
      if (!p || p.state !== 'closed' || p.reopenRequest) invalidState(ctx);
      requestReopen(p, me(ctx), stampOf(ctx), reason(ctx, body(ctx).reason));
      idem.remember(p.id);
      save(ctx);
      return periodView(ctx, st, entity.id, period);
    },
  },
  ...(['approve', 'reject'] as const).map(
    (decision): Handler => ({
      method: 'POST',
      pattern: new RegExp(`^/ledger/periods/(?<id>[\\w-]+)/reopen-${decision}$`),
      access: requires('banking', 'period.close', W),
      handle: (ctx) => {
        official(ctx);
        const st = ledger(ctx);
        const { entity, period } = periodOf(ctx, st, ['period.close']);
        const note = str(body(ctx).reason, 300);
        const idem = bound(ctx, st, `period.reopen_${decision}`, `${entity.id}:${period}`, { note });
        if (idem.replay) return periodView(ctx, st, entity.id, period);
        const p = storedPeriod(st, entity, period);
        if (!p || p.state !== 'closed' || !p.reopenRequest) invalidState(ctx);
        if (p.reopenRequest.by === me(ctx).by) makerChecker(ctx);
        decideReopen(p, me(ctx), stampOf(ctx), decision === 'approve', decision === 'reject' ? reason(ctx, body(ctx).reason) : note || undefined);
        idem.remember(p.id);
        save(ctx);
        return periodView(ctx, st, entity.id, period);
      },
    }),
  ),
];

// ---------------------------------------------------------------------------------------------
// Posting rules (ACC-010): proposals only; nothing applies them until E-15…E-17 are decided
// ---------------------------------------------------------------------------------------------

function ruleOf(ctx: HandlerContext, st: LedgerState, permission: 'gl.view' | 'gl.post') {
  const r = st.rules.find((x) => x.id === ctx.params.id);
  if (!r || !mayUse(ctx, 'accounting', r.entityId, permission)) hidden(ctx);
  return r;
}

const ruleHandlers: Handler[] = [
  {
    method: 'GET',
    pattern: /^\/ledger\/posting-rules$/,
    access: requires('accounting', 'gl.view', R),
    handle: (ctx): PostingRulesView => {
      const st = ledger(ctx);
      const { entity, entities } = entityOf(ctx, st, q(ctx, 'entity'), 'accounting', 'gl.view');
      return {
        ...scopeOf(ctx, entity, entities),
        rules: st.rules.filter((r) => r.entityId === entity.id).map((r) => ruleView(ctx, st, r)),
        proposedEvents: 0,
        canDraft: mayUse(ctx, 'accounting', entity.id, 'gl.post'),
      };
    },
  },
  {
    // What a rule version would propose for an amount: computed, never stored, never posted.
    method: 'GET',
    pattern: /^\/ledger\/posting-rules\/(?<id>[\w-]+)\/preview$/,
    access: requires('accounting', 'gl.view', R),
    handle: (ctx): PostingRulePreview => {
      const st = ledger(ctx);
      const r = ruleOf(ctx, st, 'gl.view');
      const n = Number(q(ctx, 'version'));
      const version = r.versions.find((v) => v.n === n) ?? ruleVersionOn(r, today(ctx)) ?? r.versions[0]!;
      const amount = paisaOf(q(ctx, 'amount'));
      if (amount === null || amount <= 0n) field(ctx, 'amount', { code: 'ledger:problems.amountInvalid' });
      const lines = previewLines(r, version, amount).map((l, i) => ({ n: i + 1, accountId: l.accountId, debit: fromPaisa(l.debit), credit: fromPaisa(l.credit) }));
      return { ruleId: r.id, version: version.n, amount: pkr(amount), lines: lineViews(st, lines), balanced: true };
    },
  },
  {
    method: 'POST',
    pattern: /^\/ledger\/posting-rules\/(?<id>[\w-]+)\/versions$/,
    access: requires('accounting', 'gl.post', W),
    handle: (ctx) => {
      official(ctx);
      const st = ledger(ctx);
      const r = ruleOf(ctx, st, 'gl.post');
      const b = body(ctx);
      const input = { effectiveFrom: str(b.effectiveFrom, 10), debitAccountId: str(b.debitAccountId, 60), creditAccountId: str(b.creditAccountId, 60), note: str(b.note, 200) };
      const idem = bound(ctx, st, 'rule.version', r.id, input);
      if (idem.replay) return ruleView(ctx, st, r);
      const problems: Problems = {};
      const entity = st.entities.find((e) => e.id === r.entityId)!;
      if (!isDate(input.effectiveFrom)) problems.effectiveFrom = [{ code: 'ledger:problems.dateInvalid' }];
      else if (input.effectiveFrom.slice(0, 7) < entity.booksFrom) problems.effectiveFrom = [{ code: 'ledger:problems.dateBeforeBooks' }];
      else if (r.versions.some((v) => v.effectiveFrom === input.effectiveFrom)) problems.effectiveFrom = [{ code: 'ledger:problems.versionDateTaken' }];
      if (!usableAccount(st, r.entityId, input.debitAccountId)) problems.debitAccountId = [{ code: 'ledger:problems.accountUnavailable' }];
      if (!usableAccount(st, r.entityId, input.creditAccountId)) problems.creditAccountId = [{ code: 'ledger:problems.accountUnavailable' }];
      else if (input.creditAccountId === input.debitAccountId) problems.creditAccountId = [{ code: 'ledger:problems.sameAccount' }];
      if (input.note.length > 200) problems.note = [{ code: 'ledger:problems.memoLong', params: { max: '200' } }];
      if (Object.keys(problems).length) invalid(ctx, problems);
      draftRuleVersion(r, { effectiveFrom: input.effectiveFrom, debitAccountId: input.debitAccountId, creditAccountId: input.creditAccountId, ...(input.note ? { note: input.note } : {}) }, me(ctx), stampOf(ctx));
      idem.remember(r.id);
      save(ctx);
      return ruleView(ctx, st, r);
    },
  },
  {
    // The blocked action, refused on the server too: no rule applies until an adviser decides.
    method: 'POST',
    pattern: /^\/ledger\/posting-rules\/(?<id>[\w-]+)\/apply$/,
    access: requires('accounting', 'journal.approve', W),
    handle: (ctx) => {
      official(ctx);
      const st = ledger(ctx);
      const r = ruleOf(ctx, st, 'gl.view');
      if (!mayUse(ctx, 'accounting', r.entityId, 'journal.approve')) hidden(ctx);
      problem(ctx, 409, 'decision_pending', 'ledger:problems.decisionPending', { rule: [{ code: 'ledger:problems.decisionPendingDetail', params: { decisions: r.blockedBy.join(', ') } }] });
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Bank statement import (BANK-005): bank permission only
// ---------------------------------------------------------------------------------------------

const samplesOf = (st: LedgerState, entityId: string) => {
  const collection = st.bankAccounts.find((b) => b.id === COLLECTION_ACCOUNT.id && b.entityId === entityId);
  const operating = st.bankAccounts.find((b) => b.id === OPERATING_ACCOUNT.id && b.entityId === entityId);
  return collection && operating ? ledgerSamples({ collection: { id: collection.id, iban: collection.iban }, operating: { id: operating.id, iban: operating.iban } }) : [];
};

const importScope = (ctx: HandlerContext, st: LedgerState, entityId: string) => scopeFor(ctx, st, entityId, 'banking', 'bank.view');

const bankHandlers: Handler[] = [
  {
    method: 'GET',
    pattern: /^\/bank\/imports$/,
    access: requires('banking', 'bank.view', R),
    handle: (ctx): BankImportsView => {
      const st = ledger(ctx);
      const scope = importScope(ctx, st, q(ctx, 'entity'));
      const id = scope.entity.id;
      const reconciler = mayUse(ctx, 'banking', id, 'bank.reconcile');
      return {
        ...scope,
        accounts: st.bankAccounts.filter((b) => b.entityId === id).map(bankRef),
        imports: st.imports.filter((i) => i.entityId === id).sort((a, b) => b.preparedAt.localeCompare(a.preparedAt) || b.ref.localeCompare(a.ref)).map((i) => importSummary(st, i)),
        lines: statementLines(st, id),
        samples: reconciler ? samplesOf(st, id) : [],
        canImport: reconciler,
        canApprove: reconciler,
      };
    },
  },
  {
    method: 'GET',
    pattern: /^\/bank\/imports\/(?<id>[\w-]+)$/,
    access: requires('banking', 'bank.view', R),
    handle: (ctx): BankImportView => {
      const st = ledger(ctx);
      const imp = importOf(ctx, st, 'bank.view');
      return importView(ctx, st, imp, importScope(ctx, st, imp.entityId));
    },
  },
  {
    // Preview: parse and validate the file, flag duplicates (in the file, against earlier imports).
    method: 'POST',
    pattern: /^\/bank\/imports$/,
    access: requires('banking', 'bank.reconcile', W),
    handle: (ctx): BankImportView => {
      official(ctx);
      const st = ledger(ctx);
      const b = body(ctx);
      const { entity } = entityOf(ctx, st, b.entityId, 'banking', 'bank.reconcile');
      const sampleNo = Number(b.sample ?? 0);
      const sample = sampleNo ? samplesOf(st, entity.id).find((s) => s.n === sampleNo) : undefined;
      const content = sample ? sample.content : typeof b.content === 'string' ? b.content.slice(0, 100_001) : '';
      const fileName = sample ? sample.fileName : str(b.fileName, 120) || 'statement.csv';
      const input = { accountId: str(b.accountId, 60), sample: sample ? sample.n : 0, fileName, content };
      const idem = bound(ctx, st, 'bank_import.preview', entity.id, input);
      if (idem.replay) {
        const imp = st.imports.find((x) => x.id === idem.replay && x.entityId === entity.id);
        return imp ? importView(ctx, st, imp, importScope(ctx, st, entity.id)) : keyReused(ctx);
      }
      // One answer for an account never issued, of another entity, or not verified (no oracle).
      const account = st.bankAccounts.find((x) => x.id === input.accountId && x.entityId === entity.id && x.verified);
      if (!account) field(ctx, 'accountId', { code: 'ledger:problems.bankAccountUnavailable' });
      if (sampleNo && !sample) field(ctx, 'file', { code: 'ledger:problems.fileEmpty' });
      if (!content.trim()) field(ctx, 'file', { code: 'ledger:problems.fileEmpty' });
      if (content.length > 100_000) field(ctx, 'file', { code: 'ledger:problems.fileLarge' });
      // A file that names another account is refused, never silently assigned.
      const declared = declaredAccount(content);
      if (declared && declared !== account.iban.replace(/\s/g, '')) field(ctx, 'accountId', { code: 'ledger:problems.statementAccountMismatch' });
      if (!parseStatement(content, today(ctx)).length) field(ctx, 'file', { code: 'ledger:problems.fileNoRows' });
      const imp = createImport(st, { entityId: entity.id, accountId: account.id, fileName, sample: !!sample, content }, me(ctx), stampOf(ctx), today(ctx));
      idem.remember(imp.id);
      save(ctx);
      return importView(ctx, st, imp, importScope(ctx, st, entity.id));
    },
  },
  ...(['submit', 'approve', 'reject', 'discard'] as const).map(
    (step): Handler => ({
      method: 'POST',
      pattern: new RegExp(`^/bank/imports/(?<id>[\\w-]+)/${step}$`),
      access: requires('banking', 'bank.reconcile', W),
      handle: (ctx): BankImportView => {
        official(ctx);
        const st = ledger(ctx);
        const imp = importOf(ctx, st, 'bank.reconcile');
        const note = step === 'reject' ? str(body(ctx).reason, 300) : '';
        const idem = bound(ctx, st, `bank_import.${step}`, imp.id, { note });
        if (idem.replay) return importView(ctx, st, imp, importScope(ctx, st, imp.entityId));
        const own = imp.preparedBy === me(ctx).by;
        const who = me(ctx);
        const at = stampOf(ctx);
        if (step === 'submit') {
          if (imp.state !== 'preview') invalidState(ctx);
          if (!own) notMaker(ctx);
          if (!countsOf(imp.rows).new) problem(ctx, 409, 'nothing_new', 'ledger:problems.nothingNew');
          submitImport(imp, who, at);
        } else if (step === 'discard') {
          if (imp.state !== 'preview' && imp.state !== 'awaiting_approval') invalidState(ctx);
          if (!own) notMaker(ctx);
          discardImport(imp, who, at);
        } else {
          if (imp.state !== 'awaiting_approval') invalidState(ctx);
          if (own) makerChecker(ctx);
          const account = st.bankAccounts.find((x) => x.id === imp.accountId && x.entityId === imp.entityId && x.verified);
          if (!account) field(ctx, 'accountId', { code: 'ledger:problems.bankAccountUnavailable' });
          if (step === 'approve') approveImport(st, imp, account.iban, who, at);
          else rejectImport(imp, who, at, reason(ctx, body(ctx).reason));
        }
        idem.remember(imp.id);
        save(ctx);
        return importView(ctx, st, imp, importScope(ctx, st, imp.entityId));
      },
    }),
  ),
];

export const LEDGER_HANDLERS: Handler[] = [...chartHandlers, ...journalHandlers, ...reportHandlers, ...periodHandlers, ...ruleHandlers, ...bankHandlers];

// Kept for the API tests: the engine's period and paisa helpers.
export { lastDayOf };
