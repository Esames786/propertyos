import { describe, expect, it } from 'vitest';
import type { IssuingModel } from '@repo/contracts';
import vectors from './rentals.vectors.json';
import { availableToInstruct, basisPoints, depositWithinCap, fingerprint, instructionAllowed, ledger, money, overlaps, paisa, refundable, rentKey, schedule, sharesValid, termMonths } from './rules';

/** Gate S.3: the pure rentals rules against the golden vectors (no state, no clock, no access). */
describe('rentals rules (rentals.vectors.json)', () => {
  it.each(vectors.shares)('landlord shares: $name', (v) => {
    expect(sharesValid(v.shares)).toBe(v.valid);
  });

  it.each(vectors.schedule)('rent schedule: $name', (v) => {
    const lines = schedule(v.versions.map((x) => ({ ...x, rent: paisa(x.rent) })), v.end);
    expect(lines).toHaveLength(v.count);
    const shape = (l: (typeof lines)[number] | undefined) => l && { period: l.period, dueDate: l.dueDate, amount: money(l.amount).amount, version: l.version };
    if ('first' in v && v.first) expect(shape(lines[0])).toEqual(v.first);
    if ('last' in v && v.last) expect(shape(lines.at(-1))).toEqual(v.last);
    if ('at' in v && v.at) {
      const at = lines.find((l) => l.period === v.at!.period)!;
      expect({ period: at.period, amount: money(at.amount).amount, version: at.version }).toEqual(v.at);
    }
    // Never two lines for one month.
    expect(new Set(lines.map((l) => l.period)).size).toBe(lines.length);
  });

  it.each(vectors.rentKeys)('rent line key $key', (v) => {
    expect(rentKey(v.lease, v.period, v.version)).toBe(v.key);
  });

  it.each(vectors.ledger)('owner sub-ledger on a settled basis: $name', (v) => {
    const out = ledger({ model: v.model as IssuingModel, feeBp: basisPoints(v.feePct)!, opening: paisa(v.opening), settledRent: v.settledRent.map((x) => paisa(x)), settledExpenses: v.settledExpenses.map((x) => paisa(x)), settledPayouts: v.settledPayouts.map((x) => paisa(x)) });
    expect({ settledRent: money(out.settledRent).amount, fees: money(out.fees).amount, settledExpenses: money(out.settledExpenses).amount, settledPayouts: money(out.settledPayouts).amount, closing: money(out.closing).amount }).toEqual(v.expect);
  });

  it.each(vectors.available)('available to instruct: $name', (v) => {
    expect(money(availableToInstruct(paisa(v.closing), v.pending.map((x) => paisa(x)))).amount).toBe(v.available);
  });

  it.each(vectors.instruction)('payout instruction amount: $name', (v) => {
    expect(instructionAllowed(paisa(v.amount), paisa(v.available))).toBe(v.allowed);
  });

  it.each(vectors.refund)('deposit refund: $name', (v) => {
    expect(money(refundable(paisa(v.held), paisa(v.deductions))).amount).toBe(v.refundable);
  });

  it.each(vectors.depositCap)('deposit cap: $name', (v) => {
    expect(depositWithinCap(paisa(v.deposit), paisa(v.rent), v.months)).toBe(v.ok);
  });

  it.each(vectors.overlaps)('lease terms $a and $b overlap: $overlap', (v) => {
    expect(overlaps({ from: v.a[0]!, to: v.a[1]! }, { from: v.b[0]!, to: v.b[1]! })).toBe(v.overlap);
  });

  it.each(vectors.termMonths)('term from $from to $to is $months months', (v) => {
    expect(termMonths(v.from, v.to)).toBe(v.months);
  });

  it.each(vectors.fingerprint)('request fingerprint: $name', (v) => {
    expect(fingerprint(v.a) === fingerprint(v.b)).toBe(v.same);
  });
});

describe('the rentals add-on in the catalogue and Riverbend’s licence', () => {
  it('is a site-scoped add-on needing residents and receivables, in no edition preset', async () => {
    const { MODULES, PRESETS } = await import('../platform/catalog');
    const rentals = MODULES.find((m) => m.key === 'rentals')!;
    expect(rentals).toMatchObject({ scope: 'site', requires: ['residents', 'receivables'], includedIn: [] });
    expect(rentals.features).toEqual(['rentals.owner_statements', 'rentals.owner_payouts', 'rentals.management_fees']);
    for (const p of PRESETS) expect(p.modules, p.key).not.toContain('rentals');
  });

  it('Riverbend holds it on two of its three sites from 1 September 2026; no other organisation holds it', async () => {
    const { TENANT_DIRECTORY } = await import('../tenant-directory');
    const holders = TENANT_DIRECTORY.filter((t) => t.modules.some((m) => m.module === 'rentals'));
    expect(holders.map((t) => t.id)).toEqual(['tnt_riverbend']);
    const rb = holders[0]!;
    expect(rb.modules.find((m) => m.module === 'rentals')).toEqual({ module: 'rentals', sites: ['site_rb_heights', 'site_rb_court'], from: '2026-09-01' });
    expect(rb.sites.map((s) => s.id)).toContain('site_rb_villas');
    expect(rb.features).toEqual(['rentals.owner_statements', 'rentals.owner_payouts', 'rentals.management_fees']);
  });
});
