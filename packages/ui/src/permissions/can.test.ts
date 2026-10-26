import type { Persona } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { allowed, filterAllowed } from './can';

const sales = { permissions: ['lead.view', 'unit.view'] } as Pick<Persona, 'permissions'>;

describe('permission filtering', () => {
  it('requires every listed permission', () => {
    expect(allowed(sales, { permission: 'lead.view' })).toBe(true);
    expect(allowed(sales, { permission: ['lead.view', 'invoice.view'] })).toBe(false);
  });

  it('denies everything when signed out', () => {
    expect(allowed(null, {})).toBe(false);
    expect(allowed(null, { permission: 'lead.view' })).toBe(false);
  });

  it('filters lists', () => {
    const items = [{ id: 'a' }, { id: 'b', permission: 'invoice.view' as const }, { id: 'c', permission: 'unit.view' as const }];
    expect(filterAllowed(sales, items).map((i) => i.id)).toEqual(['a', 'c']);
  });
});
