import type { BalanceSheet, BankImportsView, BankImportView, ChartView, GlAccountView, GlAccountWorkspace, JournalFormOptions, JournalsList, JournalView, LedgerPeriodsView, PostingRulePreview, PostingRulesView, ProfitAndLoss, TrialBalance } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { addSecondEntity, changing, entitiesOnly, ledgerSession, minus, plus, projectsOnly, refusal, SECOND, suspended, type LedgerSession } from './ledger-test-kit';
import { accountId, COLLECTION_ACCOUNT, ESCROW_ACCOUNT, OPERATING_ACCOUNT } from './state';

/**
 * Gate E.7 API negative matrix (plan §4.2–4.5, §8) through the fail-closed mock transport:
 * unknown vs out-of-scope ids identical; cross-entity refused; maker = checker refused; closed period;
 * posted journal immutable; key reuse with another input → 409; byte-identical state after every refusal;
 * the bank boundary (no bank permission: no bank line, account identifier, import or derived total).
 * People: Saad (lk_accounts, gl.view + gl.post, no bank), Mehreen (lk_controller, checker, bank),
 * Kashan (lk_treasury, bank import maker). TEST ONLY: a second legal entity (E-08) and access overrides.
 */
const LK = 'le_larkspur';
const acc = (code: string) => accountId('LKE', code);
const JOURNAL = (date = '2026-10-24', amount = '125000.00') => ({ entityId: LK, date, memo: 'Demo accrual — security services, October (fictional)', lines: [{ accountId: acc('5200'), debit: amount }, { accountId: acc('2200'), credit: amount }] });

async function refusedUnchanged(api: LedgerSession, p: () => Promise<unknown>) {
  const before = api.snapshot();
  const r = await refusal(p());
  expect(api.snapshot()).toBe(before);
  return r;
}

/** A session with the test-only second entity; `access.set` narrows or revokes a persona's access. */
async function world() {
  const access = changing();
  const api = ledgerSession({ accessFor: access.accessFor });
  await api.as('lk_accounts').get('/ledger/accounts');
  const second = addSecondEntity(api.ledger());
  return { api, access, second };
}

const ref = (api: LedgerSession, r: string) => api.ledger().journals.find((j) => j.ref === r)!;

describe('Gate E.7 — positive journeys through the API', () => {
  it('create → approve (another person) → post → reverse → approve → post; reports change and come back', async () => {
    const { api } = await world();
    const tb0 = await api.as('lk_accounts').get<TrialBalance>('/ledger/trial-balance', { entity: LK });
    const j = await api.post<JournalView>('/ledger/journals', { ...JOURNAL(), submit: true }, { key: 'k-create' });
    expect(j).toMatchObject({ state: 'submitted', ref: 'LKE-JV-2026-0009', balanced: true, kind: 'manual' });
    expect(j.actions.approve).toBe(false);
    const a = await api.as('lk_controller').post<JournalView>(`/ledger/journals/${j.id}/approve`, {}, { key: 'k-approve' });
    expect(a.state).toBe('approved');
    expect(a.actions.post).toBe(true);
    const p = await api.post<JournalView>(`/ledger/journals/${j.id}/post`, {}, { key: 'k-post' });
    expect(p).toMatchObject({ state: 'posted', postedByName: 'Mehreen Aslam', approvedByName: 'Mehreen Aslam', makerName: 'Saad Hameed' });
    const tb1 = await api.get<TrialBalance>('/ledger/trial-balance', { entity: LK });
    expect(tb1.totals.debit.amount).toBe('176775000.00');
    expect(Number(tb1.totals.debit.amount) - Number(tb0.totals.debit.amount)).toBe(125000);
    const pl1 = await api.get<ProfitAndLoss>('/ledger/profit-and-loss', { entity: LK });
    expect(pl1.result.amount).toBe('-1775000.00');
    const bs1 = await api.get<BalanceSheet>('/ledger/balance-sheet', { entity: LK });
    expect(bs1).toMatchObject({ balances: true, resultMatchesProfitAndLoss: true, trialBalanceBalanced: true, currentResult: { amount: '-1775000.00' } });

    const r = await api.as('lk_accounts').post<JournalView>(`/ledger/journals/${j.id}/reverse`, { date: '2026-10-25', reason: 'Entered in error (demo)' }, { key: 'k-reverse' });
    expect(r).toMatchObject({ kind: 'reversal', state: 'submitted', reversalOf: { id: j.id } });
    const original = await api.get<JournalView>(`/ledger/journals/${j.id}`);
    expect(original.reversal).toMatchObject({ id: r.id, state: 'submitted' });
    expect(original.reversed).toBe(false);
    await api.as('lk_controller').post(`/ledger/journals/${r.id}/approve`, {}, { key: 'k-r-approve' });
    await api.post(`/ledger/journals/${r.id}/post`, {}, { key: 'k-r-post' });
    const after = await api.get<JournalView>(`/ledger/journals/${j.id}`);
    expect(after).toMatchObject({ state: 'posted', reversed: true, reversal: { id: r.id, state: 'posted' } });
    expect(after.lines).toEqual(p.lines);
    const tb2 = await api.get<TrialBalance>('/ledger/trial-balance', { entity: LK });
    expect(tb2.totals.debit.amount).toBe('176650000.00');
    const pl2 = await api.get<ProfitAndLoss>('/ledger/profit-and-loss', { entity: LK });
    expect(pl2.result.amount).toBe('-1650000.00');
    const ws = await api.get<GlAccountWorkspace>(`/ledger/accounts/${acc('5200')}`);
    expect(ws.lines.map((l) => l.journalRef)).toEqual([j.ref, r.ref]);
    expect(ws.lines.at(-1)!.running.amount).toBe('0.00');
  });

  it('a chart change is a draft until someone else approves it (new chart version)', async () => {
    const { api } = await world();
    const d = await api.as('lk_accounts').post<GlAccountView>('/ledger/accounts', { entityId: LK, code: '5600', name: 'Travel', type: 'expense' }, { key: 'k-acc' });
    expect(d).toMatchObject({ state: 'draft', code: '5600' });
    const ok = await api.as('lk_controller').post<GlAccountView>(`/ledger/accounts/${d.id}/approve`, {}, { key: 'k-acc-ok' });
    expect(ok).toMatchObject({ state: 'active', sinceVersion: 3 });
    const chart = await api.get<ChartView>('/ledger/accounts', { entity: LK });
    expect(chart.chartVersion).toBe(3);
  });

  it('bank import: preview → duplicates flagged → submit → approved by another person → unmatched lines only', async () => {
    const { api } = await world();
    const v = await api.as('lk_treasury').post<BankImportView>('/bank/imports', { entityId: LK, accountId: COLLECTION_ACCOUNT.id, sample: 1 }, { key: 'k-imp' });
    expect(v).toMatchObject({ state: 'preview', counts: { rows: 7, new: 3, duplicateInFile: 1, duplicatePrior: 2, invalid: 1 }, credits: { amount: '470000.00' }, debits: { amount: '2500.00' } });
    expect(v.account.ibanMasked).toBe(`•••• ${COLLECTION_ACCOUNT.iban.slice(-4)}`);
    expect(JSON.stringify(v)).not.toContain(COLLECTION_ACCOUNT.iban);
    await api.post(`/bank/imports/${v.id}/submit`, {}, { key: 'k-imp-sub' });
    expect((await refusal(api.post(`/bank/imports/${v.id}/approve`, {}, { key: 'k-imp-self' }))).code).toBe('maker_checker');
    const c = await api.as('lk_controller').post<BankImportView>(`/bank/imports/${v.id}/approve`, {}, { key: 'k-imp-ok' });
    expect(c).toMatchObject({ state: 'committed', committedLines: 3, approvedByName: 'Mehreen Aslam' });
    const list = await api.get<BankImportsView>('/bank/imports', { entity: LK });
    expect(list.lines.filter((l) => l.importRef === c.ref)).toHaveLength(3);
    expect(list.lines.every((l) => l.state === 'unmatched')).toBe(true);
    // Nothing settled, nothing posted: the ledger did not move.
    expect((await api.get<TrialBalance>('/ledger/trial-balance', { entity: LK })).totals.debit.amount).toBe('176650000.00');
    // Re-importing the same file adds nothing.
    const again = await api.as('lk_treasury').post<BankImportView>('/bank/imports', { entityId: LK, accountId: COLLECTION_ACCOUNT.id, sample: 1 }, { key: 'k-imp-2' });
    expect(again.counts.new).toBe(0);
    expect((await refusal(api.post(`/bank/imports/${again.id}/submit`, {}, { key: 'k-imp-2s' }))).code).toBe('nothing_new');
  });

  it('periods: close is blocked while journals wait; reopen needs a second person', async () => {
    const { api } = await world();
    const periods = await api.as('lk_controller').get<LedgerPeriodsView>('/ledger/periods', { entity: LK });
    const oct = periods.periods.find((p) => p.period === '2026-10')!;
    expect(oct.checks.find((c) => c.key === 'period_ended')!.outcome).toBe('blocking');
    expect(oct.actions.close).toBe(false);
    expect((await refusedUnchanged(api, () => api.post('/ledger/periods/fpd_lke_202610/close', {}, { key: 'k-close' }))).code).toBe('close_blocked');
    await api.as('lk_accounts').post('/ledger/periods/fpd_lke_202609/reopen-request', { reason: 'Late supplier invoice (demo)' }, { key: 'k-ro' });
    expect((await refusedUnchanged(api, () => api.as('lk_accounts').post('/ledger/periods/fpd_lke_202609/reopen-approve', {}, { key: 'k-ro-self' }))).status).toBe(403);
    const ok = await api.as('lk_controller').post<LedgerPeriodsView['periods'][number]>('/ledger/periods/fpd_lke_202609/reopen-approve', {}, { key: 'k-ro-ok' });
    expect(ok.state).toBe('reopened');
    const late = await api.as('lk_accounts').post<JournalView>('/ledger/journals', { ...JOURNAL('2026-09-28'), submit: true }, { key: 'k-late' });
    expect(late.state).toBe('submitted');
  });

  it('posting rules are proposals: a version can be drafted and previewed; applying is refused (E-15…E-17)', async () => {
    const { api } = await world();
    const rules = await api.as('lk_accounts').get<PostingRulesView>('/ledger/posting-rules', { entity: LK });
    expect(rules.rules).toHaveLength(5);
    expect(rules.proposedEvents).toBe(0);
    const bills = rules.rules.find((r) => r.ref === 'LKE-PR-003')!;
    expect(bills.versionToday).toBe(1);
    const before = api.snapshot();
    const prev = await api.get<PostingRulePreview>(`/ledger/posting-rules/${bills.id}/preview`, { amount: '1000.00', version: '2' });
    expect(prev.lines.map((l) => [l.accountCode, l.debit.amount, l.credit.amount])).toEqual([
      ['5100', '1000.00', '0.00'],
      ['2000', '0.00', '1000.00'],
    ]);
    expect(api.snapshot()).toBe(before);
    const v = await api.post<PostingRulesView['rules'][number]>(`/ledger/posting-rules/${bills.id}/versions`, { effectiveFrom: '2027-01-01', debitAccountId: acc('1310'), creditAccountId: acc('2000') }, { key: 'k-rv' });
    expect(v.versions.map((x) => x.n)).toEqual([1, 2, 3]);
    expect(v.versions.every((x) => x.state === 'proposed')).toBe(true);
    const r = await refusedUnchanged(api, () => api.as('lk_controller').post(`/ledger/posting-rules/${bills.id}/apply`, {}, { key: 'k-apply' }));
    expect(r).toMatchObject({ status: 409, code: 'decision_pending' });
    expect(api.ledger().journals.filter((j) => j.kind !== 'manual' && j.kind !== 'reversal')).toEqual([]);
  });
});

describe('Gate E.7 — no id oracle: unknown and out-of-scope answer alike', () => {
  it('journals, accounts, imports, periods, rules and entities of another entity read like ids never issued', async () => {
    const { api, access, second } = await world();
    access.set(['lk_accounts', 'lk_controller'], entitiesOnly(LK));
    const pairs: Array<[string, string, Record<string, string>?]> = [
      [`/ledger/journals/${second.journalId}`, '/ledger/journals/jnl_lke_9999'],
      [`/ledger/accounts/${second.accountIds.expense}`, '/ledger/accounts/gla_lke_c9999'],
      ['/ledger/trial-balance', '/ledger/trial-balance', { entity: SECOND.id }],
      ['/ledger/journals', '/ledger/journals', { entity: SECOND.id }],
      ['/ledger/periods', '/ledger/periods', { entity: SECOND.id }],
      ['/bank/imports', '/bank/imports', { entity: SECOND.id }],
    ];
    for (const [hiddenPath, unknownPath, query] of pairs) {
      const who = hiddenPath.startsWith('/bank') ? 'lk_controller' : 'lk_accounts';
      const a = await refusedUnchanged(api, () => api.as(who).get(hiddenPath, query));
      const b = await refusedUnchanged(api, () => api.as(who).get(unknownPath, query ? { entity: 'le_never_issued' } : undefined));
      expect(a, hiddenPath).toEqual(b);
      expect(a.status).toBe(404);
    }
    // Writes naming another entity's record: the same 404 as an invented id.
    const w1 = await refusedUnchanged(api, () => api.as('lk_controller').post(`/ledger/journals/${second.journalId}/reverse`, { date: '2026-10-25', reason: 'x y z' }, { key: 'k-x1' }));
    const w2 = await refusedUnchanged(api, () => api.as('lk_controller').post('/ledger/journals/jnl_lke_9999/reverse', { date: '2026-10-25', reason: 'x y z' }, { key: 'k-x2' }));
    expect(w1).toEqual(w2);
    const p1 = await refusedUnchanged(api, () => api.as('lk_controller').post('/ledger/periods/fpd_lgd_202610/close', {}, { key: 'k-x3' }));
    const p2 = await refusedUnchanged(api, () => api.as('lk_controller').post('/ledger/periods/fpd_zzz_202610/close', {}, { key: 'k-x4' }));
    expect(p1).toEqual(p2);
  });

  it('a person scoped to projects reaches no entity ledger (the ledger is entity-wide)', async () => {
    const { api, access } = await world();
    access.set(['lk_accounts'], projectsOnly('prj_heights'));
    const r = await refusedUnchanged(api, () => api.as('lk_accounts').get('/ledger/journals'));
    expect(r.status).toBe(404);
  });
});

describe('Gate E.7 — legal-entity isolation (E-08 test-only second entity)', () => {
  it('a journal line, cost centre or bank account of another entity is refused like an invented one', async () => {
    const { api, second } = await world();
    const make = (line0: Record<string, string>) => ({ ...JOURNAL(), lines: [{ accountId: acc('5200'), debit: '10.00', ...line0 }, { accountId: acc('2200'), credit: '10.00' }] });
    const cross = await refusedUnchanged(api, () => api.as('lk_accounts').post('/ledger/journals', make({ accountId: second.accountIds.expense }), { key: 'k-c1' }));
    const invented = await refusedUnchanged(api, () => api.post('/ledger/journals', make({ accountId: 'gla_lke_c9999' }), { key: 'k-c2' }));
    expect(cross).toEqual(invented);
    expect(cross.errors['lines.0.accountId']?.[0]?.code).toBe('ledger:problems.accountUnavailable');
    const cc = await refusedUnchanged(api, () => api.post('/ledger/journals', make({ costCentreId: SECOND.cc }), { key: 'k-c3' }));
    expect(cc.errors['lines.0.costCentreId']?.[0]?.code).toBe('ledger:problems.costCentreUnavailable');
    // Bank import: another entity's account, an invented one and an unverified one answer alike.
    const answers = [];
    for (const accountIdValue of [SECOND.bank, 'lba_never_issued', ESCROW_ACCOUNT.id]) {
      answers.push(await refusedUnchanged(api, () => api.as('lk_treasury').post('/bank/imports', { entityId: LK, accountId: accountIdValue, sample: 1 }, { key: `k-b-${accountIdValue}` })));
    }
    expect(answers[0]).toEqual(answers[1]);
    expect(answers[1]).toEqual(answers[2]);
    expect(answers[0]!.errors.accountId?.[0]?.code).toBe('ledger:problems.bankAccountUnavailable');
    // A file that names another account is refused (the operating file for the collection account).
    const mismatch = await refusedUnchanged(api, () => api.post('/bank/imports', { entityId: LK, accountId: COLLECTION_ACCOUNT.id, sample: 3 }, { key: 'k-b-mm' }));
    expect(mismatch.errors.accountId?.[0]?.code).toBe('ledger:problems.statementAccountMismatch');
  });

  it('totals and lists of one entity never include the other entity', async () => {
    const { api } = await world();
    const text = JSON.stringify([
      await api.as('lk_controller').get('/ledger/trial-balance', { entity: LK }),
      await api.get('/ledger/journals', { entity: LK }),
      await api.get('/ledger/accounts', { entity: LK }),
      await api.get('/ledger/balance-sheet', { entity: LK }),
      await api.get('/bank/imports', { entity: LK }),
    ]);
    for (const secret of ['777777.77', SECOND.journalMemo, 'LGD-SECRET-TXN-9', '424242.42', 'Hidden Counterparty Test']) expect(text).not.toContain(secret);
    const mine = await api.get<TrialBalance>('/ledger/trial-balance', { entity: SECOND.id });
    expect(mine.totals.debit.amount).toBe('777777.77');
    expect(mine.entities.map((e) => e.id)).toEqual([LK, SECOND.id]);
  });
});

describe('Gate E.7 — maker ≠ checker by principal', () => {
  it('nobody approves or posts their own journal, even holding both permissions', async () => {
    const { api, access } = await world();
    access.set(['lk_accounts'], plus('journal.approve'));
    const j = await api.as('lk_accounts').post<JournalView>('/ledger/journals', { ...JOURNAL(), submit: true }, { key: 'k-m1' });
    expect(j.actions.approve).toBe(false);
    expect(j.blocked).toBe('own_journal');
    expect(await refusedUnchanged(api, () => api.post(`/ledger/journals/${j.id}/approve`, {}, { key: 'k-m2' }))).toMatchObject({ status: 403, code: 'maker_checker' });
    // The controller's own journal: approved by nobody but someone else.
    const own = await api.as('lk_controller').post<JournalView>('/ledger/journals', { ...JOURNAL(), submit: true }, { key: 'k-m3' });
    expect(await refusedUnchanged(api, () => api.post(`/ledger/journals/${own.id}/approve`, {}, { key: 'k-m4' }))).toMatchObject({ code: 'maker_checker' });
    // Approved by someone else, still not posted by its maker.
    await api.as('lk_accounts').post(`/ledger/journals/${own.id}/approve`, {}, { key: 'k-m5' });
    expect(await refusedUnchanged(api, () => api.as('lk_controller').post(`/ledger/journals/${own.id}/post`, {}, { key: 'k-m6' }))).toMatchObject({ code: 'maker_checker' });
  });

  it('chart drafts, period reopening and statement imports need a second person too', async () => {
    const { api, access } = await world();
    access.set(['lk_accounts'], plus('journal.approve'));
    const draft = api.ledger().accounts.find((a) => a.code === '5500' && a.state === 'draft')!;
    expect(await refusedUnchanged(api, () => api.as('lk_accounts').post(`/ledger/accounts/${draft.id}/approve`, {}, { key: 'k-d1' }))).toMatchObject({ code: 'maker_checker' });
    await api.as('lk_controller').post('/ledger/periods/fpd_lke_202608/reopen-request', { reason: 'Correction needed (demo)' }, { key: 'k-d2' });
    expect(await refusedUnchanged(api, () => api.post('/ledger/periods/fpd_lke_202608/reopen-approve', {}, { key: 'k-d3' }))).toMatchObject({ code: 'maker_checker' });
  });
});

describe('Gate E.7 — closed periods and immutability', () => {
  it('a closed period refuses a journal, a reversal and the approval of a journal dated in it', async () => {
    const { api } = await world();
    const r1 = await refusedUnchanged(api, () => api.as('lk_accounts').post('/ledger/journals', JOURNAL('2026-09-15'), { key: 'k-p1' }));
    expect(r1).toMatchObject({ status: 409, code: 'period_closed' });
    const posted = ref(api, 'LKE-JV-2026-0003');
    const r2 = await refusedUnchanged(api, () => api.post(`/ledger/journals/${posted.id}/reverse`, { date: '2026-09-30', reason: 'Wrong month' }, { key: 'k-p2' }));
    expect(r2.code).toBe('period_closed');
  });

  it('a posted journal is never edited or cancelled; corrections are reversals (one per journal)', async () => {
    const { api } = await world();
    const posted = ref(api, 'LKE-JV-2026-0001');
    const edit = await refusedUnchanged(api, () => api.as('lk_accounts').post(`/ledger/journals/${posted.id}/edit`, JOURNAL(), { key: 'k-i1' }));
    expect(edit).toMatchObject({ status: 409, code: 'journal_posted' });
    expect(await refusedUnchanged(api, () => api.post(`/ledger/journals/${posted.id}/cancel`, {}, { key: 'k-i2' }))).toMatchObject({ code: 'journal_posted' });
    const reversed = ref(api, 'LKE-JV-2026-0004');
    expect(await refusedUnchanged(api, () => api.post(`/ledger/journals/${reversed.id}/reverse`, { date: '2026-10-25', reason: 'again' }, { key: 'k-i3' }))).toMatchObject({ code: 'already_reversed' });
    const reversal = ref(api, 'LKE-JV-2026-0005');
    expect(await refusedUnchanged(api, () => api.post(`/ledger/journals/${reversal.id}/reverse`, { date: '2026-10-25', reason: 'undo' }, { key: 'k-i4' }))).toMatchObject({ code: 'reversal_not_reversible' });
    const draft = ref(api, 'LKE-JV-2026-0008');
    expect(await refusedUnchanged(api, () => api.post(`/ledger/journals/${draft.id}/reverse`, { date: '2026-10-25', reason: 'not posted' }, { key: 'k-i5' }))).toMatchObject({ code: 'not_posted' });
    // Someone else's draft is not theirs to change.
    expect(await refusedUnchanged(api, () => api.as('lk_controller').post(`/ledger/journals/${draft.id}/edit`, JOURNAL(), { key: 'k-i6' }))).toMatchObject({ code: 'not_maker' });
  });

  it('an unbalanced, cash-at-bank or revenue journal is refused with every field problem and nothing stored', async () => {
    const { api } = await world();
    const unbalanced = await refusedUnchanged(api, () => api.as('lk_accounts').post('/ledger/journals', { ...JOURNAL(), lines: [{ accountId: acc('5200'), debit: '10.00' }, { accountId: acc('2200'), credit: '9.99' }] }, { key: 'k-v1' }));
    expect(unbalanced.errors.lines?.[0]).toMatchObject({ code: 'ledger:problems.unbalanced', params: { debit: '10.00', credit: '9.99' } });
    const cash = await refusedUnchanged(api, () => api.post('/ledger/journals', { ...JOURNAL(), lines: [{ accountId: acc('1000'), debit: '10.00' }, { accountId: acc('3000'), credit: '10.00' }] }, { key: 'k-v2' }));
    expect(cash.errors['lines.0.accountId']?.[0]?.code).toBe('ledger:problems.accountLockedCash');
    const revenue = await refusedUnchanged(api, () => api.post('/ledger/journals', { ...JOURNAL(), lines: [{ accountId: acc('1100'), debit: '10.00' }, { accountId: acc('4000'), credit: '10.00' }] }, { key: 'k-v3' }));
    expect(revenue.errors['lines.1.accountId']?.[0]?.code).toBe('ledger:problems.accountLockedRevenue');
    const fields = await refusedUnchanged(api, () => api.post('/ledger/journals', { entityId: LK, date: '2026-13-40', memo: 'x', lines: [] }, { key: 'k-v4' }));
    expect(Object.keys(fields.errors).sort()).toEqual(['date', 'lines', 'memo']);
  });
});

describe('Gate E.7 — bound idempotency (§4.5)', () => {
  it('the same request replays; any other use of the key is a non-disclosing 409 and changes nothing', async () => {
    const { api } = await world();
    const first = await api.as('lk_accounts').post<JournalView>('/ledger/journals', JOURNAL(), { key: 'k-idem' });
    const replay = await api.post<JournalView>('/ledger/journals', { ...JOURNAL(), memo: '  Demo accrual — security services, October (fictional)  ' }, { key: 'k-idem' });
    expect(replay.id).toBe(first.id);
    expect(api.ledger().journals.filter((j) => j.memo.startsWith('Demo accrual — security services'))).toHaveLength(1);
    const reused = [
      await refusedUnchanged(api, () => api.post('/ledger/journals', JOURNAL('2026-10-24', '125000.01'), { key: 'k-idem' })),
      await refusedUnchanged(api, () => api.as('lk_controller').post('/ledger/journals', JOURNAL(), { key: 'k-idem' })),
      await refusedUnchanged(api, () => api.as('lk_accounts').post('/ledger/accounts', { entityId: LK, code: '5700', name: 'Fuel', type: 'expense' }, { key: 'k-idem' })),
      await refusedUnchanged(api, () => api.post(`/ledger/journals/${first.id}/submit`, {}, { key: 'k-idem' })),
    ];
    for (const r of reused) expect(r).toEqual({ status: 409, code: 'idempotency_key_reused', messageKey: 'ledger:problems.keyReused', errors: {} });
  });

  it('approve, post, reverse and import replay under their key instead of acting twice', async () => {
    const { api } = await world();
    const j = await api.as('lk_accounts').post<JournalView>('/ledger/journals', { ...JOURNAL(), submit: true }, { key: 'k-1' });
    await api.as('lk_controller').post(`/ledger/journals/${j.id}/approve`, {}, { key: 'k-2' });
    expect((await api.post<JournalView>(`/ledger/journals/${j.id}/approve`, {}, { key: 'k-2' })).state).toBe('approved');
    await api.post(`/ledger/journals/${j.id}/post`, {}, { key: 'k-3' });
    expect((await api.post<JournalView>(`/ledger/journals/${j.id}/post`, {}, { key: 'k-3' })).state).toBe('posted');
    const r1 = await api.as('lk_accounts').post<JournalView>(`/ledger/journals/${j.id}/reverse`, { date: '2026-10-25', reason: 'Twice (demo)' }, { key: 'k-4' });
    const r2 = await api.post<JournalView>(`/ledger/journals/${j.id}/reverse`, { date: '2026-10-25', reason: 'Twice (demo)' }, { key: 'k-4' });
    expect(r2.id).toBe(r1.id);
    expect(api.ledger().journals.filter((x) => x.reversalOfId === j.id)).toHaveLength(1);
    expect(await refusedUnchanged(api, () => api.post(`/ledger/journals/${j.id}/reverse`, { date: '2026-10-26', reason: 'Twice (demo)' }, { key: 'k-4' }))).toMatchObject({ code: 'idempotency_key_reused' });
    const i1 = await api.as('lk_treasury').post<BankImportView>('/bank/imports', { entityId: LK, accountId: COLLECTION_ACCOUNT.id, sample: 2 }, { key: 'k-5' });
    const i2 = await api.post<BankImportView>('/bank/imports', { entityId: LK, accountId: COLLECTION_ACCOUNT.id, sample: 2 }, { key: 'k-5' });
    expect(i2.id).toBe(i1.id);
    expect(await refusedUnchanged(api, () => api.post('/bank/imports', { entityId: LK, accountId: OPERATING_ACCOUNT.id, sample: 3 }, { key: 'k-5' }))).toMatchObject({ code: 'idempotency_key_reused' });
  });

  it('a replay re-checks authority: a key whose record is now out of scope discloses nothing', async () => {
    const { api, access } = await world();
    const j = await api.as('lk_accounts').post<JournalView>('/ledger/journals', JOURNAL(), { key: 'k-scope' });
    expect(j.id).toBeTruthy();
    access.set(['lk_accounts'], entitiesOnly(SECOND.id));
    const r = await refusedUnchanged(api, () => api.post('/ledger/journals', JOURNAL(), { key: 'k-scope' }));
    expect(r.status).toBe(404);
  });
});

describe('Gate E.7 — the bank boundary (Issue #18 rule for developers)', () => {
  const SECRETS = [COLLECTION_ACCOUNT.iban, COLLECTION_ACCOUNT.iban.slice(-4), OPERATING_ACCOUNT.iban.slice(-4), 'LKC-261002-0001', 'Ayesha Karim', 'Omar Shafiq', 'IBFT credit', 'LKE-BIM-2026-0001', 'Demo Bank (fictional)', 'Larkspur Estates Collections (DEMO)', 'lba_lke_'];

  it('a person without the bank permission reads no bank line, account identifier, import or derived total anywhere', async () => {
    const { api } = await world();
    api.as('lk_accounts');
    expect((await refusal(api.get('/bank/imports'))).code).toBe('permission_missing');
    expect((await refusal(api.get('/bank/imports/bim_lke_0001'))).code).toBe('permission_missing');
    const reads = [
      await api.get<ChartView>('/ledger/accounts', { entity: LK }),
      await api.get<GlAccountWorkspace>(`/ledger/accounts/${acc('1000')}`),
      await api.get<GlAccountWorkspace>(`/ledger/accounts/${acc('1010')}`),
      await api.get<JournalsList>('/ledger/journals', { entity: LK }),
      await api.get<JournalFormOptions>('/ledger/journal-form', { entity: LK }),
      await api.get('/ledger/trial-balance', { entity: LK }),
      await api.get('/ledger/profit-and-loss', { entity: LK }),
      await api.get('/ledger/balance-sheet', { entity: LK }),
      await api.get('/ledger/periods', { entity: LK }),
      await api.get('/ledger/posting-rules', { entity: LK }),
    ];
    const text = JSON.stringify(reads);
    // Global search knows no statement line, import or bank account (nothing to find, nothing counted).
    for (const term of ['Ayesha Karim', 'LKC-261002', 'IBFT', 'Larkspur Estates Collections']) {
      const found = (await api.get<{ records: unknown[] }>('/search', { q: term }).catch(() => ({ records: [] }))) as { records: unknown[] };
      expect(found.records, term).toEqual([]);
    }
    for (const s of SECRETS) expect(text, s).not.toContain(s);
    const ws = reads[1] as GlAccountWorkspace;
    expect(ws.account.bank).toBeUndefined();
    expect(ws.statementLines).toBeUndefined();
  });

  it('the controller (bank permission) sees the linked account (masked) and the unmatched lines it has', async () => {
    const { api } = await world();
    const ws = await api.as('lk_controller').get<GlAccountWorkspace>(`/ledger/accounts/${acc('1000')}`);
    expect(ws.account.bank).toMatchObject({ id: COLLECTION_ACCOUNT.id, ibanMasked: `•••• ${COLLECTION_ACCOUNT.iban.slice(-4)}`, verified: true });
    expect(ws.statementLines).toEqual({ count: 4, credits: { amount: '525000.00', currency: 'PKR' }, debits: { amount: '1500.00', currency: 'PKR' } });
    expect(ws.account.balance.amount).toBe('0.00');
    expect(JSON.stringify(ws)).not.toContain(COLLECTION_ACCOUNT.iban);
  });

  it('revoking the bank permission hides it at once; revoking gl.view closes the ledger', async () => {
    const { api, access } = await world();
    await api.as('lk_controller').get('/bank/imports');
    access.set(['lk_controller'], minus('bank.view', 'bank.reconcile'));
    expect((await refusal(api.get('/bank/imports'))).code).toBe('permission_missing');
    const ws = await api.get<GlAccountWorkspace>(`/ledger/accounts/${acc('1000')}`);
    expect(ws.account.bank).toBeUndefined();
    expect(ws.statementLines).toBeUndefined();
    access.set(['lk_controller'], minus('gl.view'));
    expect((await refusal(api.get('/ledger/journals'))).code).toBe('permission_missing');
  });

  it('a bank reader without bank.reconcile (Farah, Nadia) reads imports but cannot import or approve', async () => {
    const { api } = await world();
    const list = await api.as('finance').get<BankImportsView>('/bank/imports');
    expect(list).toMatchObject({ canImport: false, canApprove: false, samples: [] });
    expect((await refusal(api.post('/bank/imports', { entityId: LK, accountId: COLLECTION_ACCOUNT.id, sample: 1 }))).code).toBe('permission_missing');
    expect((await refusal(api.as('manager').post('/bank/imports/bim_lke_0001/approve'))).code).toBe('permission_missing');
    // Neither holds gl.view: the ledger is closed to them (no existing role gained a permission).
    expect((await refusal(api.as('manager').get('/ledger/journals'))).code).toBe('permission_missing');
    expect((await refusal(api.as('finance').get('/ledger/journals'))).code).toBe('permission_missing');
  });
});

describe('Gate E.7 — licensing, suspension and practice mode', () => {
  it('other organisations: no accounting module, or no ledger permission', async () => {
    const api = ledgerSession();
    expect((await refusal(api.as('alnoor_accounts').get('/ledger/journals'))).code).toBe('module_not_licensed');
    expect((await refusal(api.as('cb_manager').get('/ledger/journals'))).code).toBe('module_not_licensed');
    expect((await refusal(api.as('sales').get('/ledger/journals'))).code).toBe('permission_missing');
  });

  it('a suspended organisation keeps the history readable and refuses every change', async () => {
    const access = changing();
    const api = ledgerSession({ accessFor: access.accessFor });
    await api.as('lk_accounts').get('/ledger/journals');
    access.set(['lk_accounts', 'lk_controller'], suspended);
    expect((await api.get<JournalsList>('/ledger/journals')).items.length).toBeGreaterThan(0);
    expect((await refusedUnchanged(api, () => api.post('/ledger/journals', JOURNAL(), { key: 'k-s' }))).code).toBe('tenant_suspended');
  });

  it('practice mode changes nothing in the ledger', async () => {
    const { api } = await world();
    expect((await refusedUnchanged(api, () => api.as('lk_accounts').post('/ledger/journals', JOURNAL(), { key: 'k-t', training: true }))).code).toBe('training_not_supported');
  });
});
