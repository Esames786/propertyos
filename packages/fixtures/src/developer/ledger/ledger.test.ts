import { describe, expect, it } from 'vitest';
import { fromPaisa, toPaisa } from '../../portal';
import {
  addJournal,
  approveImport,
  approveJournal,
  balanceSheet,
  classify,
  countsOf,
  createImport,
  dateProblem,
  isClosed,
  journalTotals,
  normaliseJournal,
  parseStatement,
  postJournal,
  profitAndLoss,
  proposalKey,
  reverseJournal,
  ruleVersionOn,
  submitImport,
  submitJournal,
  totalOf,
  trialBalance,
} from './engine';
import { ledgerSamples } from './samples';
import { accountId, COLLECTION_ACCOUNT, emptyLedger, KASHAN, LEDGER_TODAY, MEHREEN, OPERATING_ACCOUNT, SAAD, seedLarkspur, type LedgerState } from './state';
import vectors from './ledger.vectors.json';

/**
 * Gate E.7 golden vectors (ledger.vectors.json): balanced entries, trial balance = Σ posted lines,
 * profit and loss and balance sheet tie (assets = liabilities + equity + current result), reversal
 * symmetry, period lock, rule version by date, idempotent posting keys and import duplicates.
 */
const E = vectors.entity;
const seeded = (): LedgerState => {
  const s = emptyLedger();
  seedLarkspur(s);
  return s;
};
const acc = (code: string) => accountId('LKE', code);
const lines = (ls: Array<{ code: string; debit?: string; credit?: string }>) => ls.map((l) => ({ accountId: acc(l.code), debit: l.debit ?? '', credit: l.credit ?? '' }));

function reports(s: LedgerState, asOf: string, from = '2026-07-01') {
  const tb = trialBalance(s, E, asOf);
  const pl = profitAndLoss(s, E, from, asOf);
  const bs = balanceSheet(s, E, asOf);
  return { tb, pl, bs };
}

describe('Gate E.7 ledger vectors', () => {
  it('the seed is entered through the journal path, every journal balances, nothing touches cash at bank', () => {
    const s = seeded();
    for (const v of vectors.seed.journals) {
      const j = s.journals.find((x) => x.ref === v.ref)!;
      expect(j, v.ref).toBeTruthy();
      expect(j.date).toBe(v.date);
      expect(j.state).toBe(v.state);
      expect(j.demo).toBe(true);
      const t = journalTotals(j.lines);
      expect(t.debit).toBe(t.credit);
      expect(fromPaisa(t.debit)).toBe(v.total);
      // Maker ≠ checker on every posted seed journal.
      if (j.state === 'posted') expect(j.approvedBy).not.toBe(j.makerId);
      if (j.state === 'posted') expect(j.postedBy).not.toBe(j.makerId);
      if ('reversedBy' in v) expect(s.journals.find((x) => x.id === j.reversalId)!.ref).toBe(v.reversedBy);
      if ('reverses' in v) expect(s.journals.find((x) => x.id === j.reversalOfId)!.ref).toBe(v.reverses);
    }
    for (const [p, state] of Object.entries(vectors.seed.periods)) expect(isClosed(s, E, `${p}-15`), p).toBe(state === 'closed');
    expect(Math.max(...s.chartVersions.filter((v) => v.entityId === E).map((v) => v.version))).toBe(vectors.seed.chartVersion);
    const tb = trialBalance(s, E, LEDGER_TODAY);
    for (const [code, amount] of Object.entries(vectors.seed.cashAtBank)) {
      const row = tb.rows.find((r) => r.account.code === code);
      expect(fromPaisa(row ? row.debit - row.credit : 0n), code).toBe(amount);
    }
  });

  it.each(vectors.reports)('reports at $asOf: TB = Σ posted lines; P&L and balance sheet tie', (v) => {
    const s = seeded();
    const { tb, pl, bs } = reports(s, v.asOf, v.profitAndLoss.from);
    expect(fromPaisa(tb.debit)).toBe(v.trialBalance.debit);
    expect(fromPaisa(tb.credit)).toBe(v.trialBalance.credit);
    expect(tb.journals).toBe(v.trialBalance.journals);
    expect(fromPaisa(pl.income.total)).toBe(v.profitAndLoss.income);
    expect(fromPaisa(pl.expenses.total)).toBe(v.profitAndLoss.expenses);
    expect(fromPaisa(pl.result)).toBe(v.profitAndLoss.result);
    expect(fromPaisa(bs.assets.total)).toBe(v.balanceSheet.assets);
    expect(fromPaisa(bs.liabilities.total)).toBe(v.balanceSheet.liabilities);
    expect(fromPaisa(bs.equity.total)).toBe(v.balanceSheet.equity);
    expect(fromPaisa(bs.currentResult)).toBe(v.balanceSheet.currentResult);
    // The ties.
    expect(tb.debit).toBe(tb.credit);
    expect(bs.assets.total).toBe(bs.liabilities.total + bs.equity.total + bs.currentResult);
    expect(bs.balances).toBe(true);
    expect(bs.currentResult).toBe(pl.result);
    // TB = Σ posted lines, line by line.
    const posted = s.journals.filter((j) => j.entityId === E && j.state === 'posted' && j.date <= v.asOf).flatMap((j) => j.lines);
    expect(tb.debit - tb.credit).toBe(posted.reduce((n, l) => n + toPaisa(l.debit) - toPaisa(l.credit), 0n));
  });

  it.each(vectors.balanced)('journal rule: $name', (v) => {
    const s = seeded();
    const n = normaliseJournal(s, E, { date: '2026-10-24', memo: 'Vector journal', lines: lines(v.lines) }, LEDGER_TODAY);
    const codes = Object.values(n.problems).flat().map((p) => p.code);
    if (v.problem === null) {
      expect(codes).toEqual([]);
      expect(n.journal).toBeTruthy();
    } else {
      expect(codes).toContain(v.problem);
      expect(n.journal).toBeUndefined();
    }
  });

  it('scenario: post moves every report by the same amount; the reversal restores them exactly', () => {
    const s = seeded();
    const before = reports(s, LEDGER_TODAY);
    const n = normaliseJournal(s, E, { ...vectors.scenario.journal, lines: lines(vectors.scenario.journal.lines) }, LEDGER_TODAY);
    const j = addJournal(s, n.journal!, SAAD, '2026-10-24T10:00:00+05:00', { submit: true });
    expect(j.state).toBe('submitted');
    // Nothing reaches a report before posting.
    expect(reports(s, LEDGER_TODAY).tb.debit).toBe(before.tb.debit);
    expect(() => approveJournal(j, SAAD, 'x')).toThrow();
    approveJournal(j, MEHREEN, '2026-10-24T11:00:00+05:00');
    expect(() => postJournal(s, j, SAAD, 'x')).toThrow();
    postJournal(s, j, MEHREEN, '2026-10-24T11:05:00+05:00');
    const after = reports(s, LEDGER_TODAY);
    const a = vectors.scenario.afterPost;
    expect(fromPaisa(after.tb.debit)).toBe(a.trialBalance);
    expect(fromPaisa(after.pl.expenses.total)).toBe(a.expenses);
    expect(fromPaisa(after.pl.result)).toBe(a.result);
    expect(fromPaisa(after.bs.liabilities.total)).toBe(a.liabilities);
    expect(fromPaisa(after.bs.assets.total)).toBe(a.assets);
    expect(after.bs.balances).toBe(true);
    // Reversal: every line on the other side, linked both ways; the original never changes.
    const original = JSON.stringify(j.lines);
    const r = reverseJournal(s, j, '2026-10-25', 'Entered in error (vector)', SAAD, '2026-10-25T09:00:00+05:00');
    expect(r.reversalOfId).toBe(j.id);
    expect(j.reversalId).toBe(r.id);
    expect(JSON.stringify(j.lines)).toBe(original);
    expect(r.lines.map((l) => [l.accountId, l.debit, l.credit])).toEqual(j.lines.map((l) => [l.accountId, l.credit, l.debit]));
    expect(() => reverseJournal(s, j, '2026-10-25', 'again', SAAD, 'x')).toThrow();
    approveJournal(r, MEHREEN, '2026-10-25T10:00:00+05:00');
    postJournal(s, r, MEHREEN, '2026-10-25T10:05:00+05:00');
    const back = reports(s, LEDGER_TODAY);
    const b = vectors.scenario.afterReversal;
    expect(fromPaisa(back.tb.debit)).toBe(b.trialBalance);
    expect(fromPaisa(back.pl.expenses.total)).toBe(b.expenses);
    expect(fromPaisa(back.pl.result)).toBe(b.result);
    expect(fromPaisa(back.bs.liabilities.total)).toBe(b.liabilities);
    expect(back.bs.balances).toBe(true);
    expect(() => reverseJournal(s, r, '2026-10-25', 'reverse the reversal', SAAD, 'x')).toThrow();
  });

  it.each(vectors.periodLock)('period lock: $date', (v) => {
    const s = seeded();
    const p = dateProblem(s, E, v.date, LEDGER_TODAY);
    if ('problem' in v) expect(p?.code).toBe(v.problem);
    else {
      expect(p).toBeNull();
      expect(isClosed(s, E, v.date)).toBe(v.closed);
    }
  });

  it('the engine itself refuses to store an unbalanced or empty journal (defence in depth)', () => {
    const s = seeded();
    const before = s.journals.length;
    expect(() => addJournal(s, { entityId: E, date: '2026-10-24', memo: 'Unbalanced', lines: [{ accountId: acc('5200'), debit: 10000n, credit: 0n }, { accountId: acc('2200'), debit: 0n, credit: 9999n }] }, SAAD, 'x')).toThrow();
    expect(() => addJournal(s, { entityId: E, date: '2026-10-24', memo: 'Empty', lines: [{ accountId: acc('5200'), debit: 0n, credit: 0n }, { accountId: acc('2200'), debit: 0n, credit: 0n }] }, SAAD, 'x')).toThrow();
    expect(s.journals).toHaveLength(before);
  });

  it('a posting into a closed period is refused by the engine as well', () => {
    const s = seeded();
    const n = normaliseJournal(s, E, { date: '2026-09-15', memo: 'Late accrual', lines: lines([{ code: '5200', debit: '1.00' }, { code: '2200', credit: '1.00' }]) }, LEDGER_TODAY);
    const j = addJournal(s, n.journal!, SAAD, 'x', { submit: true });
    approveJournal(j, MEHREEN, 'x');
    expect(() => postJournal(s, j, MEHREEN, 'x')).toThrow();
    expect(j.state).toBe('approved');
  });

  it.each(vectors.ruleVersions)('rule version by date: $rule on $date', (v) => {
    const s = seeded();
    const rule = s.rules.find((r) => r.ref === v.rule)!;
    expect(ruleVersionOn(rule, v.date)?.n ?? null).toBe(v.version);
  });

  it('idempotent posting key: one proposal per (source, posting version)', () => {
    const s = seeded();
    const keys = vectors.idempotentPosting.map((v) => {
      const rule = s.rules.find((r) => r.ref === v.rule)!;
      const key = proposalKey(v.source, rule, ruleVersionOn(rule, v.date)!);
      expect(key).toBe(v.key);
      return key;
    });
    expect(new Set(keys).size).toBe(2);
  });

  it.each(vectors.importDuplicates)('statement import duplicates: sample $sample after $afterSample', (v) => {
    const s = seeded();
    const samples = ledgerSamples({ collection: COLLECTION_ACCOUNT, operating: OPERATING_ACCOUNT });
    if ('afterSample' in v && v.afterSample) {
      const first = createImport(s, { entityId: E, accountId: COLLECTION_ACCOUNT.id, fileName: 'a.csv', sample: true, content: samples[v.afterSample - 1]!.content }, KASHAN, 'x', LEDGER_TODAY);
      submitImport(first, KASHAN, 'x');
      expect(() => approveImport(s, first, COLLECTION_ACCOUNT.iban, KASHAN, 'x')).toThrow();
      approveImport(s, first, COLLECTION_ACCOUNT.iban, MEHREEN, 'x');
    }
    const rows = classify(parseStatement(samples[v.sample - 1]!.content, LEDGER_TODAY), COLLECTION_ACCOUNT.id, s.lines);
    expect(rows.map((r) => r.status)).toEqual(v.statuses);
    expect(countsOf(rows)).toEqual(v.counts);
    expect(fromPaisa(totalOf(rows, 'credit'))).toBe(v.credits);
    expect(fromPaisa(totalOf(rows, 'debit'))).toBe(v.debits);
  });

  it('re-importing a committed file adds no line; statement lines are unmatched, never receipts', () => {
    const s = seeded();
    const samples = ledgerSamples({ collection: COLLECTION_ACCOUNT, operating: OPERATING_ACCOUNT });
    const go = () => {
      const imp = createImport(s, { entityId: E, accountId: COLLECTION_ACCOUNT.id, fileName: 'a.csv', sample: true, content: samples[0]!.content }, KASHAN, 'x', LEDGER_TODAY);
      submitImport(imp, KASHAN, 'x');
      return approveImport(s, imp, COLLECTION_ACCOUNT.iban, MEHREEN, 'x');
    };
    const before = s.lines.length;
    expect(go()).toHaveLength(3);
    expect(go()).toHaveLength(0);
    expect(s.lines).toHaveLength(before + 3);
    expect(s.lines.every((l) => l.state === 'unmatched' && !l.paymentId && !l.settlementId)).toBe(true);
    // No journal came from the bank lines.
    expect(s.journals.filter((j) => j.lines.some((l) => l.accountId === acc('1000') || l.accountId === acc('1010')))).toEqual([]);
  });

  it('any balanced journal keeps the trial balance and balance sheet tied (deterministic sweep)', () => {
    const s = seeded();
    const codes = ['1100', '1200', '1300', '1310', '2000', '2100', '2200', '3000', '3100', '4100', '5000', '5100', '5200', '5300'];
    let seed = 20261026;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let i = 0; i < 60; i++) {
      const dr = codes[next() % codes.length]!;
      let cr = codes[next() % codes.length]!;
      if (cr === dr) cr = codes[(codes.indexOf(dr) + 1) % codes.length]!;
      const amount = fromPaisa(BigInt(1 + (next() % 99_999_999)));
      const n = normaliseJournal(s, E, { date: '2026-10-24', memo: `Sweep ${i}`, lines: lines([{ code: dr, debit: amount }, { code: cr, credit: amount }]) }, LEDGER_TODAY);
      const j = addJournal(s, n.journal!, SAAD, 'x');
      submitJournal(j, SAAD, 'x');
      approveJournal(j, MEHREEN, 'x');
      postJournal(s, j, MEHREEN, 'x');
      const { tb, pl, bs } = reports(s, LEDGER_TODAY);
      expect(tb.debit).toBe(tb.credit);
      expect(bs.balances).toBe(true);
      expect(bs.currentResult).toBe(pl.result);
    }
  });
});
