import { describe, expect, it } from 'vitest';
import { money, paisa } from '../society/finance/model';
import { computeLine, employedDays, fingerprint, lastDay, periodDays, prorate, proposedJournal, splitForInstruction, type LineFacts } from './rules';
import vectors from './payroll.vectors.json';

/**
 * Gate S.2b payroll rules against the golden vectors (`payroll.vectors.json`): proration and its
 * rounding, net pay, what blocks a line, what is held and never deducted, the disbursement split and
 * the proposed journal. The API tests (`payroll.api.test.ts`) check the same rules through the server.
 */
const P = (s: string) => paisa({ amount: s, currency: 'PKR' });
const M = (p: bigint) => money(p).amount;

type V = (typeof vectors.lines)[number];

function factsOf(v: V): LineFacts {
  const f = v.facts as V['facts'] & { endDate?: string; unpaidLeaveDays?: number; pendingUnpaidDays?: number; absences?: number; advances?: Array<{ id: string; ref: string; kind: string; amount: string; instalments: number; firstMonth: string }> };
  return {
    terms: f.terms ? { basis: f.terms.basis as 'monthly' | 'daily', rate: P(f.terms.rate), allowances: f.terms.allowances.map((a) => ({ key: a.key as 'conveyance', paisa: P(a.amount) })), method: f.terms.method as 'bank' | 'cash', accountVerified: f.terms.accountVerified } : null,
    status: f.status as LineFacts['status'],
    startDate: f.startDate,
    ...(f.endDate ? { endDate: f.endDate } : {}),
    unpaidLeaveDays: f.unpaidLeaveDays ?? 0,
    pendingUnpaidDays: f.pendingUnpaidDays ?? 0,
    absences: f.absences ?? 0,
    advances: (f.advances ?? []).map((a) => ({ id: a.id, ref: a.ref, kind: a.kind as 'advance' | 'loan', paisa: P(a.amount), instalments: a.instalments, firstMonth: a.firstMonth })),
  };
}

describe('S.2b payroll golden vectors', () => {
  it.each(vectors.prorate)('prorate: $name', (v) => {
    expect(M(prorate(P(v.amount), v.counted, v.of))).toBe(v.expect);
  });

  it.each(vectors.lines)('line: $name', (v) => {
    const inputs = v.inputs as { daysConfirmed?: number; bonuses?: string[] };
    const r = computeLine(v.period, factsOf(v), { ...(inputs.daysConfirmed !== undefined ? { daysConfirmed: inputs.daysConfirmed } : {}), bonuses: (inputs.bonuses ?? []).map(P) });
    expect(r.employedDays).toBe(v.expect.employedDays);
    expect(r.earnings.map((e) => `${e.kind === 'base' ? 'base' : e.allowance} ${M(e.paisa)}`)).toEqual(v.expect.earnings);
    expect(M(r.gross)).toBe(v.expect.gross);
    expect(M(r.deductions)).toBe(v.expect.deductions);
    expect(M(r.net)).toBe(v.expect.net);
    expect(r.held.map((h) => `${h.ref} ${h.instalment}/${h.of} ${M(h.paisa)}`)).toEqual(v.expect.held);
    expect(r.blockers).toEqual(v.expect.blockers);
    expect(r.warnings).toEqual(v.expect.warnings);
    // The boundary in every vector: nothing is ever deducted, so net pay is gross pay.
    expect(r.net).toBe(r.gross);
  });

  it.each(vectors.instructions)('instruction split: $name', (v) => {
    const s = splitForInstruction(v.lines.map((l) => ({ ...l, method: l.method as 'bank' | 'cash', net: P(l.net) })));
    expect(s.pay.map((l) => l.employeeId)).toEqual(v.expect.pay);
    expect(s.held.map((l) => `${l.employeeId} ${l.reason}`)).toEqual(v.expect.held);
    expect(M(s.total)).toBe(v.expect.total);
  });

  it.each(vectors.journal)('proposed journal: $name', (v) => {
    const j = proposedJournal(P(v.gross), P(v.net), P(v.deductions));
    expect(j.lines.map((l) => `${l.side} ${l.account} ${M(l.paisa)}`)).toEqual(v.expect.lines);
    expect(j.balanced).toBe(v.expect.balanced);
  });

  it('the boundary table never shows anything paid or settled', () => {
    expect(vectors.boundary.every((b) => !b.paid && !b.settled)).toBe(true);
  });
});

describe('S.2b payroll rules', () => {
  it('counts calendar days, the days employed in a period and month ends', () => {
    expect(periodDays({ from: '2026-10-01', to: '2026-10-31' })).toBe(31);
    expect(periodDays({ from: '2027-02-01', to: '2027-02-28' })).toBe(28);
    expect(employedDays({ from: '2026-10-01', to: '2026-10-31' }, '2026-11-02')).toBe(0);
    expect(employedDays({ from: '2026-10-01', to: '2026-10-31' }, '2020-01-01', '2026-09-30')).toBe(0);
    expect(lastDay('2028-02')).toBe('2028-02-29');
    expect(lastDay('2026-12')).toBe('2026-12-31');
  });

  it('rounds only half up and never produces a negative amount', () => {
    expect(prorate(1n, 1, 3)).toBe(0n);
    expect(prorate(1n, 2, 3)).toBe(1n);
    expect(prorate(5_000_000n, -3, 31)).toBe(0n);
    expect(prorate(5_000_000n, 40, 31)).toBe(5_000_000n);
  });

  it('fingerprints are stable for equal facts and change with any fact', () => {
    const a = fingerprint([['emp_1', { absences: 0, paisa: 10n }]]);
    expect(fingerprint([['emp_1', { absences: 0, paisa: 10n }]])).toBe(a);
    expect(fingerprint([['emp_1', { absences: 1, paisa: 10n }]])).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
});
