import type { BankLine, CustomerInvoice, LiabilityChange } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { fromPaisa, toPaisa } from '../portal';
import { flatIdOf, payerOn } from './model';
import { allocateOldestFirst, checkAllocation, linesOf, openLinesFor } from './allocate';
import { bucketOf } from './aging';
import { groupKey, totalsOf } from './billing-run';
import { recordPayment } from './collections';
import { candidatesOf, collectionsSummary, reconciliation, scopeOf, submissionRow } from './collections-read';
import { candidatesFor, destinationOf, lineKey, matchSignal, newLines } from './matching';
import { defaultNumbering, formatRef, patternProblem } from './numbering';
import { collectingSociety, declaredAccount, sampleBankStatements, statementFrom } from './scenario';
import { beneficiaryOn, nextRef, readySociety, viewOf, withPayerChanges, type SocietyState } from './state';
import { statementOf } from './statement';
import vectors from './collections.vectors.json';

const TODAY = vectors.today;
const staff = { principalId: 'usr_anr_0004', name: 'Saba Javed' };

function accountOf(state: SocietyState, code: string) {
  const view = viewOf(state, TODAY);
  const flat = view.model.flats.find((f) => f.code === code)!;
  const account = view.model.accounts.find((a) => a.id === flat.billingAccountId)!;
  const payer = payerOn(view.facts, flat.id, '2026-11-01')!;
  return { view, flat, account, payer: { partyId: payer.partyId, name: payer.partyName } };
}

/** Pays `amount` for a flat's payer with the allocation verification uses (oldest first). */
function pay(state: SocietyState, code: string, amount: string) {
  const { view, account, payer } = accountOf(state, code);
  const open = openLinesFor(linesOf(view.invoices), { partyId: payer.partyId, legalEntityId: 'le_alnoor', billingAccountId: account.id });
  const { allocations, unapplied } = allocateOldestFirst(toPaisa(amount), open);
  return recordPayment(state, {
    at: `${TODAY}T10:00:00Z`,
    receivedOn: TODAY,
    by: staff,
    account: { id: account.id, accountNo: account.accountNo },
    payer,
    flats: [code],
    method: 'bank_transfer',
    amount: toPaisa(amount),
    allocations,
    unapplied,
    source: { kind: 'office' },
    verification: 'counter',
  });
}

describe('the collecting scenario (A7 §C.2 fixture)', () => {
  const state = collectingSociety();
  const view = viewOf(state, TODAY);
  const v = vectors.scenario;

  it('November is posted: 79 invoices, PKR 355,800, through the same engine and numbering as the live path', () => {
    const nov = view.invoices.filter((i) => i.source === 'billing_run' && i.period === '2026-11');
    expect(nov).toHaveLength(v.invoices);
    expect(fromPaisa(nov.reduce((n, i) => n + toPaisa(i.total.amount), 0n))).toBe(v.billed);
    expect(nov.map((i) => i.ref).sort()[0]).toBe('ANR-INV-202611-0001');
    expect(state.runs[0]!.state).toBe('NOTIFIED');
    expect(state.runs[0]!.createdBy).not.toBe(state.runs[0]!.approvedBy);
  });

  it('two bank statements, 12 lines; three earlier payments verified against them; six proofs waiting', () => {
    expect(state.bank.statements).toHaveLength(v.statements);
    expect(state.bank.lines).toHaveLength(v.bankLines);
    expect(state.payments).toHaveLength(v.verifiedPayments);
    expect(state.payments.every((p) => p.verification === 'bank_matched' && p.bankLineId)).toBe(true);
    expect(fromPaisa(state.payments.reduce((n, p) => n + toPaisa(p.amount.amount), 0n))).toBe(v.collected);
    expect(state.submissions.filter((s) => s.state === 'submitted')).toHaveLength(v.queue);
    expect(state.receipts.map((r) => r.ref)).toEqual(['ANR-RCT-2026-00001', 'ANR-RCT-2026-00002', 'ANR-RCT-2026-00003']);
  });

  it('reconciliation: 3 matched, 2 unidentified; the rest point at a waiting proof or an account', () => {
    const rec = reconciliation(view);
    expect(rec.matched.count).toBe(v.matched);
    expect(rec.unidentified.count).toBe(v.unidentified);
    expect(rec.unidentified.amount.amount).toBe('4250.00');
    const junaid = rec.lines.find((l) => l.counterpartyName === 'JUNAID AKHTAR')!;
    expect(junaid.suggestion).toMatchObject({ kind: 'account', id: 'ba_anr_a201' });
    // Two transfers say "MAINTENANCE NOV": B-405's proof claims only its own, B-406's points to its account.
    const komal = rec.lines.find((l) => l.counterpartyName === 'KOMAL MIRZA')!;
    const imran = rec.lines.find((l) => l.counterpartyName === 'IMRAN HUSSAIN')!;
    expect(komal.suggestion).toMatchObject({ kind: 'submission', label: 'ANR-PRF-0007' });
    expect(imran.suggestion).toMatchObject({ kind: 'account', id: 'ba_anr_b406' });
  });

  it('the inbox signals: two clean matches, one already matched, one sharing a reference, one with no bank line', () => {
    const rows = state.submissions.filter((s) => s.state === 'submitted').map((s) => submissionRow(state, s));
    const by = (flat: string) => rows.find((r) => r.flats[0] === flat)!;
    expect(by('A-305').match).toBe('exact');
    expect(by('B-102').match).toBe('exact');
    expect(by('A-204').match).toBe('already_matched');
    expect(by('A-204').possibleDuplicateOf).toEqual(['ANR-PRF-0002']);
    expect(by('B-405').match).toBe('exact');
    expect(by('B-405').possibleDuplicateOf).toBeUndefined();
    expect(by('B-207').match).toBe('none');
  });

  it('summary figures agree with the records (AC-14)', () => {
    const sum = collectionsSummary({ view }, TODAY, { bank: true });
    expect(sum.billed.amount.amount).toBe(v.billed);
    expect(sum.collected.amount.amount).toBe(v.collected);
    expect(sum.pending.submissions).toBe(6);
    expect(sum.queue.toReview).toBe(6);
    expect(sum.bank.unidentified).toBe(2);
    const open = linesOf(view.invoices).reduce((n, l) => n + l.open, 0n);
    expect(sum.outstanding.amount.amount).toBe(fromPaisa(open));
    // Buildings add up to the site.
    expect(fromPaisa(sum.byBuilding.reduce((n, b) => n + toPaisa(b.billed.amount), 0n))).toBe(v.billed);
  });
});

describe('allocation golden vectors (AC-10)', () => {
  for (const g of vectors.allocation) {
    it(g.case, () => {
      const state = collectingSociety();
      const { payment, receipt } = pay(state, g.flat, g.amount);
      const view = viewOf(state, TODAY);
      expect(payment.allocations.map((a) => ({ source: a.kind === 'opening_balance' ? 'opening_balance' : 'billing_run', amount: a.amount.amount })).reduce<Array<{ source: string; amount: string }>>((out, a) => {
        const last = out.find((x) => x.source === a.source);
        if (last) last.amount = fromPaisa(toPaisa(last.amount) + toPaisa(a.amount));
        else out.push({ ...a });
        return out;
      }, [])).toEqual(g.settled);
      expect(payment.unapplied.amount).toBe(g.unapplied);
      expect(receipt.amount.amount).toBe(g.amount);
      const nov = view.invoices.find((i) => i.source === 'billing_run' && i.lines.some((l) => l.unitCode === g.flat))!;
      expect(nov.settlement).toBe(g.novemberSettlement);
      const open = linesOf(view.invoices).filter((l) => l.unitCode === g.flat).reduce((n, l) => n + l.open, 0n);
      expect(fromPaisa(open)).toBe(g.open);
      const { account } = accountOf(state, g.flat);
      const st = statementOf({ accountId: account.id, accountNo: account.accountNo, holderName: account.holderName, invoices: view.invoices, creditNotes: [], payments: state.payments, from: '2026-10-01', to: '2026-11-30' });
      expect(st.closingBalance.amount).toBe(g.statementClosing);
      expect(st.entries.filter((e) => e.kind === 'payment').map((e) => e.credit?.amount)).toEqual([g.amount]);
      // The stored invoice never changes: settlement is derived when read.
      expect(state.invoices.find((i) => i.id === nov.id)!.allocated.amount).toBe('0.00');
    });
  }
});

describe('per-unit liability on a shared account (AC-11a)', () => {
  const g = vectors.sharedAccount;
  it("Junaid's payment settles only A-202; Rabia's A-201 balance is untouched; allocating to A-201 is refused", () => {
    const state = collectingSociety();
    const { view, account } = accountOf(state, 'A-202');
    expect(account.accountNo).toBe(g.account);
    const junaid = view.model.people.find((p) => p.displayName === g.payer)!;
    const rabia = view.model.people.find((p) => p.displayName === 'Rabia Hashmi')!;
    const lines = linesOf(view.invoices);
    const payer = { partyId: junaid.id, legalEntityId: 'le_alnoor', billingAccountId: account.id };
    const open = openLinesFor(lines, payer);
    expect([...new Set(open.map((l) => l.unitCode))]).toEqual(g.settlesFlats);
    const { allocations, unapplied } = allocateOldestFirst(toPaisa(g.amount), open);
    expect(unapplied).toBe(0n);
    expect(allocations.every((a) => a.line.unitCode === 'A-202')).toBe(true);
    const rabiaOpen = openLinesFor(lines, { ...payer, partyId: rabia.id });
    expect(fromPaisa(rabiaOpen.reduce((n, l) => n + l.open, 0n))).toBe(g.ownerStillOwes);
    expect([...new Set(rabiaOpen.map((l) => l.unitCode))]).toEqual(g.ownerFlats);
    // An edited allocation onto the owner's flat is refused, never warned.
    const result = checkAllocation([{ lineId: rabiaOpen[0]!.lineId, amount: 100000n }], toPaisa(g.amount), lines, payer);
    expect(result).toMatchObject({ ok: false, problem: 'cross_payer_forbidden' });
  });
});

describe('entity isolation (AC-11b)', () => {
  it('a line of another association is refused: cross_entity_forbidden', () => {
    const state = collectingSociety();
    const view = viewOf(state, TODAY);
    const kamran = accountOf(state, 'A-101');
    const foreign: CustomerInvoice = { ...view.invoices.find((i) => i.lines.some((l) => l.unitCode === 'A-101') && i.source === 'billing_run')!, id: 'cin_other', legalEntityId: vectors.entityIsolation.otherEntity };
    foreign.lines = foreign.lines.map((l) => ({ ...l, id: `${l.id}_other` }));
    const lines = linesOf([...view.invoices, foreign]);
    const payer = { partyId: kamran.payer.partyId, legalEntityId: 'le_alnoor', billingAccountId: kamran.account.id };
    // The other entity's lines are never offered...
    expect(openLinesFor(lines, payer).some((l) => l.legalEntityId !== 'le_alnoor')).toBe(false);
    // ...and naming one is refused.
    expect(checkAllocation([{ lineId: foreign.lines[0]!.id, amount: 100n }], 100n, lines, payer)).toMatchObject({ ok: false, problem: vectors.entityIsolation.problem });
  });

  it('every other boundary is checked: over the line, over the amount, unknown and closed lines', () => {
    const state = collectingSociety();
    const { view, account, payer } = accountOf(state, 'A-101');
    const lines = linesOf(view.invoices);
    const p = { partyId: payer.partyId, legalEntityId: 'le_alnoor', billingAccountId: account.id };
    const open = openLinesFor(lines, p);
    expect(checkAllocation([{ lineId: open[0]!.lineId, amount: open[0]!.open + 1n }], 10_000_00n, lines, p)).toMatchObject({ problem: 'over_line' });
    expect(checkAllocation([{ lineId: open[0]!.lineId, amount: 500_00n }], 100_00n, lines, p)).toMatchObject({ problem: 'over_amount' });
    expect(checkAllocation([{ lineId: 'nope', amount: 1n }], 100n, lines, p)).toMatchObject({ problem: 'line_unknown' });
    const ok = checkAllocation([{ lineId: open[1]!.lineId, amount: 100_00n }], 500_00n, lines, p);
    expect(ok).toMatchObject({ ok: true, unapplied: 400_00n });
  });
});

describe('bank matching and duplicate prevention (AC-11)', () => {
  it('a transfer already matched is flagged; two genuine transfers with the same reference are not duplicates', () => {
    const state = collectingSociety();
    const resend = state.submissions.find((s) => s.flats[0] === 'A-204' && s.state === 'submitted')!;
    const cands = candidatesFor({ amount: resend.current.amount.amount, transferDate: resend.current.transferDate, bankReference: resend.current.bankReference, payerName: resend.payerName }, state.bank.lines);
    expect(cands[0]!.alreadyMatched?.paymentRef).toBe('ANR-PAY-2026-00002');
    expect(matchSignal(cands)).toBe('already_matched');

    const komal = state.submissions.find((s) => s.flats[0] === 'B-405')!;
    const c2 = candidatesFor({ amount: komal.current.amount.amount, transferDate: komal.current.transferDate, bankReference: komal.current.bankReference, payerName: komal.payerName }, state.bank.lines);
    expect(c2[0]!.bankLine.counterpartyName).toBe('KOMAL MIRZA');
    expect(c2[0]!.reasons).toEqual(['amount', 'date', 'reference', 'name']);
    const imran = c2.find((c) => c.bankLine.counterpartyName === 'IMRAN HUSSAIN')!;
    expect(imran.alreadyMatched).toBeUndefined();
    expect(imran.sharesReferenceWith).toEqual([c2[0]!.bankLine.id]);
    expect(c2[0]!.bankLine.bankTxnId).not.toBe(imran.bankLine.bankTxnId);
  });

  it('importing a statement again, or an overlapping one, adds only transfers the feed has not seen (by bank id)', () => {
    const state = collectingSociety();
    const [first] = sampleBankStatements();
    const main = state.beneficiaries.find((b) => b.id === 'ben_anr_main')!;
    const again = statementFrom(state, first!, main, `${TODAY}T12:00:00Z`, staff).lines;
    expect(newLines(state.bank.lines, again)).toEqual([]);
    const extra = { ...again[0]!, id: 'bnl_x', bankTxnId: 'DEMO-TXN-NEW' };
    expect(newLines(state.bank.lines, [...again, extra, { ...extra, id: 'bnl_y' }]).map((l) => l.bankTxnId)).toEqual(['DEMO-TXN-NEW']);
  });
});

describe('bank lines belong to an account and an entity (C.2 review)', () => {
  const lineOn = (account: string, entity: string, valueDate: string): BankLine => ({
    id: 'bnl_v',
    statementId: 'bst_v',
    beneficiaryId: account,
    legalEntityId: entity,
    accountIban: 'PK00DEMO0000000000000000',
    source: 'demo_bank_csv',
    bankTxnId: 'DEMO-TXN-V',
    valueDate,
    amount: { amount: '5200.00', currency: 'PKR' },
    narration: '',
    reference: '',
    counterpartyName: '',
    counterpartyAccount: '',
    state: 'unmatched',
  });

  for (const g of vectors.bankDestination) {
    it(g.case, () => {
      const state = collectingSociety();
      expect(destinationOf(lineOn(g.account, g.entity, g.valueDate), scopeOf(state, 'le_alnoor'))).toBe(g.destination);
    });
  }

  it('statements are bound to the chosen account; every sample says which account it is for', () => {
    const state = collectingSociety();
    expect(state.bank.statements.every((x) => x.beneficiaryId === 'ben_anr_main' && x.legalEntityId === 'le_alnoor' && x.source === 'demo_bank_csv')).toBe(true);
    expect(state.bank.lines.every((l) => l.beneficiaryId === 'ben_anr_main' && l.accountIban === 'PK36DEMO0000001234567890')).toBe(true);
    const samples = sampleBankStatements();
    expect(samples.map((x) => declaredAccount(x.content))).toEqual(samples.map((x) => x.iban));
    expect(samples.map((x) => x.iban)).toEqual(['PK36DEMO0000001234567890', 'PK36DEMO0000001234567890', 'PK36DEMO0000001234567890', 'PK70DEMO0000000987654321']);
  });

  it(vectors.bankIdentity.description, () => {
    const state = collectingSociety();
    const committee = state.beneficiaries.find((b) => b.id === 'ben_anr_committee')!;
    const main = state.beneficiaries.find((b) => b.id === 'ben_anr_main')!;
    const old = statementFrom(state, sampleBankStatements()[3]!, committee, `${TODAY}T12:00:00Z`, staff).lines;
    // The same bank id as a line already on the association's account: another account, another transaction.
    const twin = state.bank.lines.find((l) => l.bankTxnId === vectors.bankIdentity.sameIdOtherAccount.txn)!;
    expect(old[0]!.bankTxnId).toBe(twin.bankTxnId);
    expect(lineKey(old[0]!)).not.toBe(lineKey(twin));
    expect(newLines(state.bank.lines, old)).toHaveLength(1);
    // The same account, source and id again is the same transaction.
    const same = statementFrom(state, sampleBankStatements()[0]!, main, `${TODAY}T12:00:00Z`, staff).lines;
    expect(newLines(state.bank.lines, same)).toHaveLength(0);
    // And a line of the retired account never settles A-101's proof, however well it matches.
    state.bank.lines.push(...newLines(state.bank.lines, old));
    const kamran = accountOf(state, 'A-101');
    const claim = { amount: '5200.00', transferDate: '2026-10-20', bankReference: 'ANR-A101-2026-11', payerName: kamran.payer.name };
    const onOld = candidatesFor(claim, state.bank.lines, scopeOf(state, 'le_alnoor')).find((c) => c.bankLine.beneficiaryId === 'ben_anr_committee')!;
    expect(onOld).toMatchObject({ strength: 'full', destination: 'wrong_account' });
    expect(matchSignal([onOld])).toBe('none');
  });

  for (const g of vectors.matchStrength) {
    it(`match strength: ${g.case}`, () => {
      const state = collectingSociety();
      const sub = g.claim ? undefined : state.submissions.find((x) => x.flats[0] === g.flat && x.state === 'submitted');
      const kamran = accountOf(state, g.flat);
      const cands = sub ? candidatesOf(state, sub) : candidatesFor({ ...g.claim!, payerName: kamran.payer.name }, state.bank.lines, scopeOf(state, 'le_alnoor'));
      const c = cands.find((x) => x.bankLine.bankTxnId === g.txn)!;
      expect(c).toMatchObject({ strength: g.strength, missing: g.missing, destination: 'ok' });
    });
  }
});

describe('document numbering is configurable per issuing entity (owner decision, C.1 review)', () => {
  it('patterns, scopes and checks', () => {
    const n = defaultNumbering('ANR');
    expect(formatRef(n.invoice, { code: 'ANR', seq: 7, on: '2026-11' })).toBe('ANR-INV-202611-0007');
    expect(formatRef('{code}/RCPT/{yyyy}/{seq:6}', { code: 'NRH', seq: 12, on: '2026-10-24' })).toBe('NRH/RCPT/2026/000012');
    expect(patternProblem('receipt', 'RCPT-{yyyy}')).toBe('pattern_sequence');
    expect(patternProblem('receipt', '{code}-{seq:9}')).toBe('pattern_token');
    expect(patternProblem('run', '{code}-RUN-{yyyymm}')).toBeNull();
    const state = readySociety();
    state.numbering = { ...state.numbering, code: 'NRH', receipt: '{code}/R/{yyyy}/{seq:3}' };
    expect([nextRef(state, 'receipt', '2026-10-30'), nextRef(state, 'receipt', '2026-11-02'), nextRef(state, 'receipt', '2027-01-03')]).toEqual(['NRH/R/2026/001', 'NRH/R/2026/002', 'NRH/R/2027/001']);
  });

  it('invoice grouping is a setting: per flat or per payer keeps the same lines and amount', () => {
    const state = collectingSociety();
    const items = state.runs[0]!.items;
    const byAccountPayer = totalsOf(items);
    expect(byAccountPayer.invoices).toBe(79);
    for (const grouping of ['flat', 'payer'] as const) {
      const t = totalsOf(items, grouping);
      expect(t.amount.amount).toBe('355800.00');
      expect(new Set(items.filter((i) => toPaisa(i.total.amount) > 0n).map((i) => groupKey(i, grouping))).size).toBe(t.invoices);
    }
  });
});

describe('aging (COL-005)', () => {
  it('buckets by days past the due date', () => {
    expect([bucketOf('2026-11-10', TODAY), bucketOf('2026-10-20', TODAY), bucketOf('2026-09-01', TODAY), bucketOf('2026-08-01', TODAY), bucketOf('2026-06-01', TODAY)]).toEqual(['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus']);
  });
});

describe('liability changes: approval, future dates and corrections (owner decision, C.1 review)', () => {
  const change = (over: Partial<LiabilityChange> & Pick<LiabilityChange, 'id' | 'partyId' | 'from'>): LiabilityChange => ({
    flatId: flatIdOf('A-102'),
    flatCode: 'A-102',
    partyName: '',
    reason: 'Test',
    state: 'approved',
    requestedBy: 'usr_anr_0001',
    requestedByName: 'Imran Qureshi',
    requestedAt: `${TODAY}T09:00:00Z`,
    decidedAt: `${TODAY}T10:00:00Z`,
    ...over,
  });

  it('two future changes apply by their effective dates, whatever order they were approved in', () => {
    const view = viewOf(readySociety(), TODAY);
    const owner = view.model.people.find((p) => p.displayName === 'Tariq Mehmood')!;
    const sana = view.model.people.find((p) => p.displayName === 'Sana Iqbal')!;
    // January back to the owner approved first, December to the owner approved later... then
    // a December change to the owner and a January change back to the tenant.
    const facts = withPayerChanges(view.model.facts, [change({ id: 'jan', partyId: sana.id, from: '2027-01-01', decidedAt: `${TODAY}T09:30:00Z` }), change({ id: 'dec', partyId: owner.id, from: '2026-12-01', decidedAt: `${TODAY}T11:00:00Z` })], view.model.people);
    const payer = (on: string) => payerOn(facts, flatIdOf('A-102'), on)?.partyName;
    expect([payer('2026-11-01'), payer('2026-12-01'), payer('2027-01-01')]).toEqual(['Sana Iqbal', 'Tariq Mehmood', 'Sana Iqbal']);
    expect(payer('2026-02-01')).toBe('Tariq Mehmood');
  });

  it('a correction supersedes the change it corrects; history keeps both', () => {
    const view = viewOf(readySociety(), TODAY);
    const owner = view.model.people.find((p) => p.displayName === 'Tariq Mehmood')!;
    const changes = [change({ id: 'c1', partyId: owner.id, from: '2026-12-01', state: 'superseded' }), change({ id: 'c2', partyId: owner.id, from: '2027-02-01', corrects: 'c1' })];
    const facts = withPayerChanges(view.model.facts, changes, view.model.people);
    expect(payerOn(facts, flatIdOf('A-102'), '2026-12-01')?.partyName).toBe('Sana Iqbal');
    expect(payerOn(facts, flatIdOf('A-102'), '2027-02-01')?.partyName).toBe('Tariq Mehmood');
  });
});

describe('the collection account residents see (AC-12)', () => {
  it('the verified account in force; a new one stays hidden through cooling-off; the old one shows until then', () => {
    const state = collectingSociety();
    expect(beneficiaryOn(state, 'le_alnoor', TODAY)?.iban).toBe('PK36DEMO0000001234567890');
    expect(beneficiaryOn(state, 'le_alnoor', '2026-10-11')?.iban).toBe('PK70DEMO0000000987654321');
    state.beneficiaries.push({ ...state.beneficiaries[1]!, id: 'ben_new', iban: 'PK11DEMO0000000000000011', verifiedOn: TODAY, activeFrom: '2026-10-29' });
    state.beneficiaries[1]!.activeTo = '2026-10-29';
    expect(beneficiaryOn(state, 'le_alnoor', TODAY)?.iban).toBe('PK36DEMO0000001234567890');
    expect(beneficiaryOn(state, 'le_alnoor', '2026-10-29')?.iban).toBe('PK11DEMO0000000000000011');
    expect(beneficiaryOn(state, 'le_other', TODAY)).toBeNull();
    // Never the platform's own account (I-15): every account is the association's.
    expect(state.beneficiaries.every((b) => b.legalEntityId === 'le_alnoor' && /DEMO/.test(b.iban))).toBe(true);
  });
});
