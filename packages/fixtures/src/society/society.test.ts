import type { BillingRunItem } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { toPaisa } from '../portal';
import { alnoorRegister, OPENING_AS_OF, sampleFlatFile } from './alnoor';
import { assess, post, type PostContext } from './billing-run';
import { resolveCharges } from './charges';
import { committable, FLAT_COLUMNS, fingerprint, rowsOf, validateFlats } from './import';
import { buildSociety, flatIdOf, payerOn } from './model';
import { readySociety, viewOf, withPayerChanges } from './state';
import { statementOf } from './statement';
import vectors from './dues.vectors.json';

const TODAY = '2026-10-26';
const PERIOD = vectors.period;

function november(state = readySociety(), postingVersion = 1) {
  const view = viewOf(state, TODAY);
  return { view, ...assess({ model: view.model, facts: view.facts, rules: state.rules, exemptions: state.exemptions, period: PERIOD, postingVersion, runId: 'brn_test' }) };
}

const postCtx = (posted: PostContext['posted'] = []): PostContext => ({
  run: { id: 'brn_test', ref: 'ANR-RUN-202611', siteId: 'site_alnoor', period: PERIOD, postingVersion: 1, issueDate: '2026-11-01', dueDate: '2026-11-10' },
  legalEntity: { id: 'le_alnoor', name: 'Al-Noor Residency Owners’ Association (Demo)' },
  posted,
});

const sum = (items: Array<{ total: { amount: string } }>) => items.reduce((s, i) => s + toPaisa(i.total.amount), 0n);

describe('Al-Noor register (A7 §C.2 fixture)', () => {
  const rows = alnoorRegister();
  it('80 flats: 63 owner-occupied, 12 rented, 4 vacant and the association office; 64 standard, 16 penthouse', () => {
    expect(rows).toHaveLength(80);
    const by = (k: keyof (typeof rows)[number], v: string) => rows.filter((r) => r[k] === v).length;
    expect([by('occupancy', 'owner'), by('occupancy', 'tenant'), by('occupancy', 'vacant'), by('occupancy', 'office')]).toEqual([63, 12, 4, 1]);
    expect([by('type', 'Standard'), by('type', 'Penthouse')]).toEqual([64, 16]);
    expect(rows.filter((r) => r.occupancy === 'tenant' && r.payer === 'occupant')).toHaveLength(8);
    expect(rows.filter((r) => r.occupancy === 'vacant').every((r) => r.payer === 'owner')).toBe(true);
    expect(rows.find((r) => r.flat === 'A-108')!.occupancy).toBe('office');
  });

  it('is fictional: +92 399 phones, names only, no CNIC', () => {
    for (const r of rows) {
      expect(r.owner_phone).toMatch(/^\+92399\d{7}$/);
      if (r.occupant_phone) expect(r.occupant_phone).toMatch(/^\+92399\d{7}$/);
    }
  });

  it('booking ≠ ownership ≠ occupancy ≠ payer: A-102 has owner Tariq Mehmood, occupant and payer Sana Iqbal (AC-3, I-4)', () => {
    const model = buildSociety(rows);
    const a102 = flatIdOf('A-102');
    const facts = model.facts.filter((f) => f.flatId === a102);
    expect(facts.filter((f) => f.role === 'owner').map((f) => f.partyName)).toEqual(['Tariq Mehmood']);
    expect(facts.filter((f) => f.role === 'occupant').map((f) => f.partyName)).toEqual(['Sana Iqbal']);
    for (const p of vectors.payers) expect(payerOn(model.facts, flatIdOf(p.flat), p.on)?.partyName, `${p.flat} on ${p.on}`).toBe(p.payer);
  });

  it('one owner, two flats, one account; A-201 and A-202 have different payers (per-unit liability, A2 §4.5)', () => {
    const model = buildSociety(rows);
    expect(model.accounts).toHaveLength(79);
    const shared = model.accounts.find((a) => a.accountNo === 'ANR-A201')!;
    expect(shared.flatIds).toEqual([flatIdOf('A-201'), flatIdOf('A-202')]);
    expect(shared.holderName).toBe('Rabia Hashmi');
  });
});

describe('flat import (AC-2)', () => {
  const file = sampleFlatFile();
  const parsed = rowsOf(file.content, FLAT_COLUMNS);

  it('reports every invalid and duplicate row of the sample file, with a suggested fix', () => {
    expect(parsed.missing).toEqual([]);
    const result = validateFlats(parsed.rows, new Set(), TODAY);
    expect(result).toHaveLength(82);
    const errors = result.filter((r) => r.status === 'error');
    expect(errors.map((r) => [r.values.flat, r.problems.map((p) => `${p.column}:${p.code}`)])).toEqual([
      ['A-305', ['type:required']],
      ['B-207', ['area_sqft:areaPositive']],
      ['B-406', ['floor:floorUnknown']],
    ]);
    expect(errors.map((r) => r.suggestion)).toEqual([{ type: 'Standard' }, { area_sqft: '1150' }, { floor: '4' }]);
    const duplicates = result.filter((r) => r.status === 'duplicate');
    expect(duplicates.map((r) => [r.values.flat, typeof r.duplicateOf])).toEqual([['A-206', 'number'], ['B-408', 'number']]);
  });

  it('fixing the three rows gives exactly the society register; a re-run finds every flat already registered', () => {
    const fixed = validateFlats(parsed.rows, new Set(), TODAY).map((r) => (r.suggestion ? { line: r.line, values: { ...r.values, ...r.suggestion } } : { line: r.line, values: r.values }));
    const revalidated = validateFlats(fixed, new Set(), TODAY);
    expect(revalidated.filter((r) => r.status === 'error')).toEqual([]);
    expect(committable(revalidated)).toEqual(alnoorRegister());
    const again = validateFlats(parsed.rows, new Set(alnoorRegister().map((r) => r.flat)), TODAY);
    expect(again.filter((r) => r.status === 'valid')).toHaveLength(0);
    const existing = again.filter((r) => r.duplicateOf === 'existing');
    expect(existing).toHaveLength(82);
    expect(new Set(existing.map((r) => r.values.flat)).size).toBe(80);
  });

  it('the file fingerprint is stable (re-running the same file is recognised)', () => {
    expect(fingerprint(file.content)).toBe(fingerprint(sampleFlatFile().content));
    expect(fingerprint(file.content)).not.toBe(fingerprint(`${file.content}\n`));
  });
});

describe('which rule wins (AC-4)', () => {
  const state = readySociety();
  const model = buildSociety(state.register!.rows);
  for (const v of vectors.flats) {
    it(`${v.flat}: ${v.total}${v.exempt ? ' (exempt)' : ''}`, () => {
      const flat = model.flats.find((f) => f.code === v.flat)!;
      const lines = resolveCharges(flat, state.rules, state.exemptions, PERIOD);
      expect(Object.fromEntries(lines.map((l) => [l.category, l.amount.amount]))).toEqual(v.lines);
      expect(sum(lines.map((l) => ({ total: l.amount })))).toBe(toPaisa(v.total));
      for (const [category, level] of Object.entries(v.winner ?? {})) expect(lines.find((l) => l.category === category)!.winner.scope.level).toBe(level);
      for (const [category, levels] of Object.entries(v.overridden ?? {})) expect(lines.find((l) => l.category === category)!.overridden.map((r) => r.scope.level)).toEqual(levels);
      if (v.exempt) expect(lines.every((l) => l.exemption?.percent === 100 && l.base.amount !== '0.00')).toBe(true);
    });
  }

  it('an exemption waiting for approval changes nothing', () => {
    const pending = state.exemptions.map((e) => ({ ...e, state: 'pending_approval' as const }));
    const a108 = model.flats.find((f) => f.code === 'A-108')!;
    expect(sum(resolveCharges(a108, state.rules, pending, PERIOD).map((l) => ({ total: l.amount })))).toBe(420000n);
  });
});

describe('November 2026 billing run (AC-5, AC-6)', () => {
  it('assesses 80 flats: 79 invoiced for PKR 355,800, A-108 exempt', () => {
    const { items, totals } = november();
    expect(items).toHaveLength(vectors.run.items);
    expect(totals).toMatchObject({ invoices: vectors.run.invoices, flats: vectors.run.flats, exempt: vectors.run.exempt, accounts: vectors.run.accounts, amount: { amount: vectors.run.amount } });
    expect(items.find((i) => i.unitCode === 'A-108')!.exempt).toBe(true);
  });

  it('posting twice, or retrying, creates the same 79 invoices and nothing more (I-7)', () => {
    const { items } = november();
    const first = post(items, postCtx());
    expect(first.created).toHaveLength(79);
    expect(sum(first.created)).toBe(toPaisa('355800.00'));
    const second = post(items, postCtx(first.created));
    expect(second.created).toHaveLength(0);
    expect(second.invoiceIds).toEqual(first.invoiceIds);
    const keys = first.created.flatMap((i) => i.lines.map((l) => l.idempotencyKey));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('one invoice per account and responsible payer: A-201 (owner) and A-202 (tenant) are billed separately', () => {
    const { created } = post(november().items, postCtx());
    const shared = created.filter((i) => i.accountNo === 'ANR-A201');
    expect(shared.map((i) => [i.payerName, i.lines.map((l) => l.unitCode)[0]])).toEqual([
      ['Rabia Hashmi', 'A-201'],
      ['Junaid Akhtar', 'A-202'],
    ]);
  });

  it('the assessment is deterministic, and a changed rule changes its fingerprint (stale preview)', () => {
    const a = november();
    expect(november().hash).toBe(a.hash);
    const state = readySociety();
    state.rules = state.rules.map((r) => (r.ruleId === 'rul_anr_water' ? { ...r, amount: { amount: '450.00', currency: 'PKR' } } : r));
    expect(november(state).hash).not.toBe(a.hash);
  });
});

describe('statement (AC-8)', () => {
  const state = readySociety();
  const { created } = post(november(state).items, postCtx(state.invoices));
  const view = viewOf({ ...state, invoices: [...state.invoices, ...created] }, TODAY);
  for (const v of vectors.statements) {
    it(`${v.account}: ${v.previous} + ${v.charges} = ${v.closing}`, () => {
      const account = view.model.accounts.find((a) => a.accountNo === v.account)!;
      const st = statementOf({ accountId: account.id, accountNo: account.accountNo, holderName: account.holderName, invoices: view.invoices, creditNotes: [], from: v.from, to: v.to });
      expect([st.previousBalance.amount, st.periodCharges.amount, st.closingBalance.amount]).toEqual([v.previous, v.charges, v.closing]);
      const invoice = view.invoices.find((i) => i.billingAccountId === account.id && i.source === 'billing_run')!;
      expect(invoice.total.amount).toBe(v.invoiceTotal);
      expect(invoice.lines.every((l) => l.kind === 'charge')).toBe(true);
    });
  }

  it('a tenant-payer’s statement holds only the flat they are liable for', () => {
    const account = view.model.accounts.find((a) => a.accountNo === 'ANR-A201')!;
    const junaid = view.model.people.find((p) => p.displayName === 'Junaid Akhtar')!;
    const st = statementOf({ accountId: account.id, accountNo: account.accountNo, holderName: account.holderName, invoices: view.invoices, creditNotes: [], from: '2026-11-01', to: '2026-11-30', payer: { partyId: junaid.id, name: junaid.displayName } });
    expect(st.entries.flatMap((e) => e.flats)).toEqual(['A-202']);
    expect(st.previousBalance.amount).toBe('0.00');
    expect(st.closingBalance.amount).toBe('4200.00');
  });
});

describe('a payer change does not rewrite history (AC-3, I-5)', () => {
  it('B-204 moves to its tenant from November: the October balance keeps the owner, November bills the tenant', () => {
    const state = readySociety();
    const view0 = viewOf(state, TODAY);
    const hina = view0.model.people.find((p) => p.displayName === 'Hina Rana')!;
    state.payerChanges = [{ id: 'chg1', flatId: flatIdOf('B-204'), partyId: hina.id, from: '2026-11-01', by: 'usr_anr_0001', byName: 'Imran Qureshi', at: '2026-10-26T10:00:00Z' }];
    const view = viewOf(state, TODAY);
    const october = view.invoices.find((i) => i.source === 'opening_balance' && i.lines[0]!.unitCode === 'B-204')!;
    expect(october.payerName).toBe('Faisal Chaudhry');
    expect(payerOn(view.facts, flatIdOf('B-204'), OPENING_AS_OF)?.partyName).toBe('Faisal Chaudhry');
    const item = assess({ model: view.model, facts: view.facts, rules: state.rules, exemptions: state.exemptions, period: PERIOD, postingVersion: 1, runId: 'r' }).items.find((i: BillingRunItem) => i.unitCode === 'B-204')!;
    expect(item.payerName).toBe('Hina Rana');
    // The owner's liability period ended; the tenant's starts, nothing is overwritten.
    expect(view.facts.filter((f) => f.role === 'payer' && f.flatCode === 'B-204').map((f) => [f.partyName, f.from, f.to ?? null])).toEqual([
      ['Faisal Chaudhry', '2016-11-01', '2026-11-01'],
      ['Hina Rana', '2026-11-01', null],
    ]);
    // Changing again from the same date replaces the pending change instead of stacking periods.
    const again = withPayerChanges(view0.model.facts, [...state.payerChanges, { ...state.payerChanges[0]!, id: 'chg2', partyId: view0.model.facts.find((f) => f.flatCode === 'B-204' && f.role === 'owner')!.partyId, at: '2026-10-26T11:00:00Z' }], view0.model.people);
    expect(again.filter((f) => f.role === 'payer' && f.flatCode === 'B-204').map((f) => [f.partyName, f.from])).toEqual([
      ['Faisal Chaudhry', '2016-11-01'],
      ['Faisal Chaudhry', '2026-11-01'],
    ]);
  });
});
