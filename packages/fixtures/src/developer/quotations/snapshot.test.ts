import { describe, expect, it } from 'vitest';
import type { UnitPricePickerItem } from '@repo/contracts';
import { InvalidPlanError } from '../pricing/calculator';
import { illustrativeQuotationSnapshot } from './snapshot';

const unit: UnitPricePickerItem = {
  id: 'unt_lh_preview', ref: 'LH-A-101', projectId: 'prj_heights',
  projectName: 'Larkspur Heights', currentListedPrice: { amount: '1000.01', currency: 'PKR' },
};
const allocations = [
  { kind: 'down_payment', shareBps: 2000 },
  { kind: 'instalments', shareBps: 8000, count: 3 },
] as const;

describe('E.4 CRM-013: pure, non-effective quotation worksheet', () => {
  it('reconciles an illustrative PKR price in integer paisa without any approval or posting', () => {
    const worksheet = illustrativeQuotationSnapshot(unit, allocations);
    expect(worksheet).toMatchObject({
      status: 'illustrative_draft', priceSource: 'fictional_seed',
      approvedPriceVersionId: null, approvedPlanVersionId: null,
      canSend: false, canAccept: false, canReserve: false, postingAllowed: false,
      listedPrice: { amount: '1000.01', currency: 'PKR' },
      totalAllocated: { amount: '1000.01', currency: 'PKR' },
    });
    expect(worksheet.lines.map((x) => x.amount.amount)).toEqual([
      '200.00', '266.67', '266.67', '266.67',
    ]);
    expect(worksheet.lines.reduce((n, x) => n + BigInt(x.amount.amount.replace('.', '')), 0n)).toBe(100001n);
  });
  it('keeps zero-share lines visible with zero money', () => {
    const worksheet = illustrativeQuotationSnapshot(unit, [
      { kind: 'down_payment', shareBps: 0 },
      { kind: 'instalments', shareBps: 10000, count: 2 },
    ]);
    expect(worksheet.lines).toHaveLength(3);
    expect(worksheet.lines[0]?.amount.amount).toBe('0.00');
    expect(worksheet.totalAllocated.amount).toBe(unit.currentListedPrice.amount);
  });
  it('does not mutate the caller unit or proposed schedule, and returns independent snapshots', () => {
    const before = JSON.stringify({ unit, allocations });
    const a = illustrativeQuotationSnapshot(unit, allocations);
    const b = illustrativeQuotationSnapshot(unit, allocations);
    expect(JSON.stringify({ unit, allocations })).toBe(before);
    expect(a).toEqual(b);
    a.unit.projectName = 'EDITED';
    a.allocations[0]!.shareBps = 1;
    a.lines[0]!.amount.amount = '999.00';
    expect(b.unit.projectName).toBe('Larkspur Heights');
    expect(b.allocations[0]?.shareBps).toBe(2000);
    expect(b.lines[0]?.amount.amount).toBe('200.00');
    expect(unit.projectName).toBe('Larkspur Heights');
  });
  it('rejects missing, partial, overallocated or unbounded schedule input', () => {
    for (const bad of [
      null, [], [{ kind: 'down_payment', shareBps: 9999 }],
      [{ kind: 'down_payment', shareBps: 10001 }],
      [{ kind: 'instalments', shareBps: 10000, count: 0 }],
      [{ kind: 'instalments', shareBps: 10000, count: 37 }],
      [{ kind: 'down_payment', shareBps: 10000, approval: 'granted' }],
      [{ kind: 'construction_linked', shareBps: 10000, milestoneKey: '../x' }],
    ]) expect(() => illustrativeQuotationSnapshot(unit, bad)).toThrow(InvalidPlanError);
  });
  it('rejects foreign currency and malformed money rather than guessing values', () => {
    expect(() => illustrativeQuotationSnapshot({
      ...unit, currentListedPrice: { amount: '1000.01', currency: 'USD' as 'PKR' },
    }, allocations)).toThrow(InvalidPlanError);
    expect(() => illustrativeQuotationSnapshot({
      ...unit, currentListedPrice: { amount: '-100.00', currency: 'PKR' },
    }, allocations)).toThrow(InvalidPlanError);
  });
});
