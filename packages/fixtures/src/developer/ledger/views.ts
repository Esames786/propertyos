import type {
  BankImportSummary,
  BankImportView,
  GlAccountView,
  JournalLink,
  JournalLineView,
  JournalSummary,
  JournalView,
  LedgerBankAccountRef,
  LedgerEntityRef,
  LedgerPeriodView,
  LedgerScope,
  LedgerStatementLine,
  PostingRuleView,
} from '@repo/contracts';
import { normalSideOf } from '@repo/contracts';
import { can, type HandlerContext } from '../../handler-types';
import { toPaisa } from '../../portal';
import { closeChecks, countsOf, isClosed, isMaker, isReversed, journalTotals, normalOf, pkr, periodOfDate, periodStateOf, postedLines, balances, reversible, ruleVersionOn, totalOf } from './engine';
import { maskIban, mayUse, seesBank } from './scope';
import type { LedgerState, StoredBankAccount, StoredEntity, StoredGlAccount, StoredImport, StoredJournal, StoredPeriod, StoredRule } from './state';

/**
 * Gate E.7 read models. Every view is built for one reader and one entity, from that entity's records
 * only. Bank details (the linked bank account, statement lines and imports) are projected out on the
 * server for a reader without the bank permission of that entity, before anything is returned.
 */

export const me = (ctx: HandlerContext) => ({ by: ctx.persona?.principalId ?? '', byName: ctx.persona?.displayName ?? '' });
export const entityRef = (e: StoredEntity): LedgerEntityRef => ({ id: e.id, name: e.name, code: e.code });
export const scopeOf = (ctx: HandlerContext, entity: StoredEntity, entities: StoredEntity[]): LedgerScope => ({ entity: entityRef(entity), entities: entities.map(entityRef), today: ctx.at.slice(0, 10) });

export function bankRef(b: StoredBankAccount): LedgerBankAccountRef {
  return { id: b.id, name: b.name, bankName: b.bankName, ibanMasked: maskIban(b.iban), verified: b.verified };
}

const accountName = (a: StoredGlAccount) => a.name;

export function accountView(ctx: HandlerContext, st: LedgerState, a: StoredGlAccount): GlAccountView {
  const posted = postedLines(st, a.entityId).filter((x) => x.line.accountId === a.id);
  const pending = st.journals.filter((j) => j.entityId === a.entityId && (j.state === 'draft' || j.state === 'submitted' || j.state === 'approved') && j.lines.some((l) => l.accountId === a.id)).length;
  const balance = balances(st, a.entityId).get(a.id) ?? 0n;
  const bank = a.bankAccountId && seesBank(ctx, a.entityId) ? st.bankAccounts.find((b) => b.id === a.bankAccountId) : undefined;
  const checker = a.state === 'draft' && can(ctx, 'journal.approve') && mayUse(ctx, 'accounting', a.entityId, 'journal.approve');
  const own = a.draftedBy === me(ctx).by;
  return {
    id: a.id,
    entityId: a.entityId,
    code: a.code,
    ...(a.labelKey ? { labelKey: a.labelKey } : {}),
    name: accountName(a),
    type: a.type,
    normal: normalSideOf(a.type),
    state: a.state,
    ...(a.lock ? { lock: a.lock } : {}),
    balance: pkr(balance),
    normalBalance: pkr(normalOf(a, balance)),
    postedLines: posted.length,
    pendingLines: pending,
    ...(a.sinceVersion ? { sinceVersion: a.sinceVersion } : {}),
    ...(bank ? { bank: bankRef(bank) } : {}),
    ...(a.state !== 'active' ? { draftedByName: a.draftedByName } : {}),
    ...(a.approvedByName ? { approvedByName: a.approvedByName } : {}),
    ...(a.rejectedByName ? { rejectedByName: a.rejectedByName, rejectReason: a.rejectReason ?? '' } : {}),
    actions: { approve: checker && !own, reject: checker && !own },
    ...(checker && own ? { blocked: 'own_draft' as const } : {}),
  };
}

const link = (j: StoredJournal | undefined): JournalLink | undefined => (j ? { id: j.id, ref: j.ref, state: j.state } : undefined);

export function journalSummary(st: LedgerState, j: StoredJournal): JournalSummary {
  const t = journalTotals(j.lines);
  const reversal = link(st.journals.find((x) => x.id === j.reversalId));
  const reversalOf = link(st.journals.find((x) => x.id === j.reversalOfId));
  return {
    id: j.id,
    ref: j.ref,
    entityId: j.entityId,
    date: j.date,
    period: periodOfDate(j.date),
    memo: j.memo,
    kind: j.kind,
    state: j.state,
    reversed: isReversed(st, j),
    ...(reversal ? { reversal } : {}),
    ...(reversalOf ? { reversalOf } : {}),
    total: pkr(t.debit),
    makerName: j.makerName,
    demo: j.demo,
  };
}

export function lineViews(st: LedgerState, lines: StoredJournal['lines']): JournalLineView[] {
  return lines.map((l) => {
    const a = st.accounts.find((x) => x.id === l.accountId)!;
    const cc = l.costCentreId ? st.costCentres.find((c) => c.id === l.costCentreId) : undefined;
    return {
      n: l.n,
      accountId: a.id,
      accountCode: a.code,
      accountName: accountName(a),
      ...(a.labelKey ? { accountLabelKey: a.labelKey } : {}),
      debit: pkr(toPaisa(l.debit)),
      credit: pkr(toPaisa(l.credit)),
      ...(l.memo ? { memo: l.memo } : {}),
      ...(cc ? { costCentreId: cc.id, costCentreLabelKey: cc.labelKey } : {}),
    };
  });
}

/** A journal for one reader: what they may do next, and why not when they could otherwise. */
export function journalView(ctx: HandlerContext, st: LedgerState, j: StoredJournal, scope: LedgerScope): JournalView {
  const who = me(ctx).by;
  const t = journalTotals(j.lines);
  const closed = isClosed(st, j.entityId, j.date);
  const maker = isMaker(j, who);
  const poster = can(ctx, 'gl.post') && mayUse(ctx, 'accounting', j.entityId, 'gl.post');
  const checker = can(ctx, 'journal.approve') && mayUse(ctx, 'accounting', j.entityId, 'journal.approve');
  const rev = reversible(st, j);
  const actions = {
    edit: j.state === 'draft' && maker && poster && !closed,
    submit: j.state === 'draft' && maker && poster && !closed,
    cancel: (j.state === 'draft' || j.state === 'submitted') && maker && poster,
    approve: j.state === 'submitted' && checker && !maker && !closed,
    reject: j.state === 'submitted' && checker && !maker,
    post: j.state === 'approved' && poster && !maker && !closed,
    reverse: rev === 'ok' && poster,
  };
  let blocked: JournalView['blocked'];
  // The maker always learns why the next step is not theirs (approval and posting are someone else's).
  if ((j.state === 'submitted' || j.state === 'approved') && maker) blocked = 'own_journal';
  else if ((j.state === 'submitted' && checker) || (j.state === 'approved' && poster)) blocked = closed ? 'period_closed' : undefined;
  else if (j.state === 'posted' && poster && rev !== 'ok' && rev !== 'not_posted') blocked = rev;
  return {
    ...journalSummary(st, j),
    ...scope,
    lines: lineViews(st, j.lines),
    totals: { debit: pkr(t.debit), credit: pkr(t.credit) },
    balanced: t.debit === t.credit,
    periodState: periodStateOf(st, j.entityId, periodOfDate(j.date)),
    ...(j.submittedAt ? { submittedAt: j.submittedAt } : {}),
    ...(j.approvedByName ? { approvedByName: j.approvedByName, approvedAt: j.approvedAt! } : {}),
    ...(j.postedByName ? { postedByName: j.postedByName, postedAt: j.postedAt! } : {}),
    ...(j.rejectedByName ? { rejectedByName: j.rejectedByName, rejectReason: j.rejectReason ?? '' } : {}),
    ...(j.reverseReason ? { reverseReason: j.reverseReason } : {}),
    history: j.history,
    actions,
    ...(blocked ? { blocked } : {}),
  };
}

export function periodView(ctx: HandlerContext, st: LedgerState, entityId: string, period: string): LedgerPeriodView {
  const p: StoredPeriod = st.periods.find((x) => x.legalEntityId === entityId && x.period === period) ?? {
    id: `fpd_${st.entities.find((e) => e.id === entityId)!.code.toLowerCase()}_${period.replace('-', '')}`,
    legalEntityId: entityId,
    period,
    state: 'open',
    history: [],
  };
  const checks = closeChecks(st, entityId, period, ctx.at.slice(0, 10));
  const closer = can(ctx, 'period.close') && mayUse(ctx, 'banking', entityId, 'period.close');
  const requester = (can(ctx, 'gl.post') && mayUse(ctx, 'accounting', entityId, 'gl.post')) || closer;
  const own = p.reopenRequest?.by === me(ctx).by;
  const blocking = checks.some((c) => c.outcome === 'blocking');
  const posted = new Set(postedLines(st, entityId).filter((x) => periodOfDate(x.journal.date) === period).map((x) => x.journal.id)).size;
  const { reopenRequest, ...rest } = p;
  return {
    ...rest,
    history: [...p.history],
    postedJournals: posted,
    checks,
    ...(reopenRequest ? { reopenRequest: { byName: reopenRequest.byName, at: reopenRequest.at, reason: reopenRequest.reason } } : {}),
    actions: {
      close: p.state !== 'closed' && closer && !blocking,
      requestReopen: p.state === 'closed' && !reopenRequest && requester,
      approveReopen: p.state === 'closed' && !!reopenRequest && closer && !own,
      rejectReopen: p.state === 'closed' && !!reopenRequest && closer && !own,
    },
    ...(p.state !== 'closed' && closer && blocking ? { blocked: 'blocking_checks' as const } : p.state === 'closed' && reopenRequest && closer && own ? { blocked: 'own_request' as const } : {}),
  };
}

export function ruleView(ctx: HandlerContext, st: LedgerState, r: StoredRule): PostingRuleView {
  const acc = (id: string) => {
    const a = st.accounts.find((x) => x.id === id)!;
    return { id: a.id, code: a.code, name: accountName(a), ...(a.labelKey ? { labelKey: a.labelKey } : {}) };
  };
  const today = ruleVersionOn(r, ctx.at.slice(0, 10));
  return {
    id: r.id,
    ref: r.ref,
    entityId: r.entityId,
    event: r.event,
    sourceSlice: r.sourceSlice,
    blockedBy: [...r.blockedBy],
    versions: r.versions.map((v) => ({ n: v.n, effectiveFrom: v.effectiveFrom, debit: acc(v.debitAccountId), credit: acc(v.creditAccountId), state: 'proposed', draftedByName: v.draftedByName, draftedAt: v.draftedAt, ...(v.note ? { note: v.note } : {}) })),
    ...(today ? { versionToday: today.n } : {}),
    history: r.history,
    actions: { draftVersion: can(ctx, 'gl.post') && mayUse(ctx, 'accounting', r.entityId, 'gl.post') },
  };
}

// ---------------------------------------------------------------------------------------------
// Bank import (only ever built for a reader with the bank permission of the entity)
// ---------------------------------------------------------------------------------------------

export function importSummary(st: LedgerState, imp: StoredImport): BankImportSummary {
  const account = st.bankAccounts.find((b) => b.id === imp.accountId)!;
  return {
    id: imp.id,
    ref: imp.ref,
    entityId: imp.entityId,
    account: bankRef(account),
    fileName: imp.fileName,
    sample: imp.sample,
    state: imp.state,
    counts: countsOf(imp.rows),
    credits: pkr(totalOf(imp.rows, 'credit')),
    debits: pkr(totalOf(imp.rows, 'debit')),
    preparedByName: imp.preparedByName,
    preparedAt: imp.preparedAt,
    ...(imp.approvedByName ? { approvedByName: imp.approvedByName } : {}),
    ...(imp.committedLines !== undefined ? { committedLines: imp.committedLines } : {}),
  };
}

export function importView(ctx: HandlerContext, st: LedgerState, imp: StoredImport, scope: LedgerScope): BankImportView {
  const who = me(ctx).by;
  const reconciler = can(ctx, 'bank.reconcile') && mayUse(ctx, 'banking', imp.entityId, 'bank.reconcile');
  const own = imp.preparedBy === who;
  const actions = {
    submit: imp.state === 'preview' && own && reconciler,
    approve: imp.state === 'awaiting_approval' && !own && reconciler,
    reject: imp.state === 'awaiting_approval' && !own && reconciler,
    discard: (imp.state === 'preview' || imp.state === 'awaiting_approval') && own && reconciler,
  };
  return {
    ...importSummary(st, imp),
    ...scope,
    rows: imp.rows,
    ...(imp.rejectedByName ? { rejectedByName: imp.rejectedByName, rejectReason: imp.rejectReason ?? '' } : {}),
    history: imp.history,
    actions,
    ...(imp.state === 'awaiting_approval' && reconciler && own ? { blocked: 'own_import' as const } : imp.state === 'awaiting_approval' && !reconciler ? { blocked: 'permission_missing' as const } : {}),
  };
}

export function statementLines(st: LedgerState, entityId: string): LedgerStatementLine[] {
  return st.lines
    .filter((l) => l.legalEntityId === entityId)
    .sort((a, b) => b.valueDate.localeCompare(a.valueDate) || a.bankTxnId.localeCompare(b.bankTxnId))
    .map((l) => ({
      id: l.id,
      bankTxnId: l.bankTxnId,
      valueDate: l.valueDate,
      amount: l.amount,
      narration: l.narration,
      reference: l.reference,
      counterpartyName: l.counterpartyName,
      state: l.state,
      direction: l.direction ?? 'credit',
      importRef: st.imports.find((i) => i.id === l.statementId)?.ref ?? '',
      accountId: l.beneficiaryId,
    }));
}

export const toPaisaOf = toPaisa;
