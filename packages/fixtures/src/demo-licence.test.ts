import type { EffectiveAccess, Persona } from '@repo/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_SITE_SCOPE_KEY, DEMO_WITHDRAWN_KEY, demoAccessFor } from './demo-licence';

/**
 * The prototype's in-tab access overrides (Gate D.3 withdrawal; Gate S.2a closure, Issue #14 site
 * scope). Both may only take access away, never add it.
 */
const store = new Map<string, string>();
vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
afterEach(() => store.clear());

const persona = (id: string) => ({ id }) as Persona;
const access = (scopes: EffectiveAccess['scopes']): EffectiveAccess => ({ grants: [{ module: 'hr' }, { module: 'community_hub' }], scopes, permissions: ['hr.view'], features: [] }) as unknown as EffectiveAccess;

describe('demoAccessFor', () => {
  it('without overrides returns the access unchanged', () => {
    const a = access([{ type: 'all' }]);
    expect(demoAccessFor(() => a)(persona('alnoor_manager'))).toBe(a);
  });

  it('narrows an organisation-wide scope to the named sites, for that person only', () => {
    store.set(DEMO_SITE_SCOPE_KEY, JSON.stringify({ alnoor_manager: ['site_alnoor'] }));
    const of = demoAccessFor(() => access([{ type: 'all' }]));
    expect(of(persona('alnoor_manager'))!.scopes).toEqual([{ type: 'site', ids: ['site_alnoor'] }]);
    expect(of(persona('alnoor_admin'))!.scopes).toEqual([{ type: 'all' }]);
  });

  it('never widens: a person already limited keeps their scope; bad values are ignored', () => {
    store.set(DEMO_SITE_SCOPE_KEY, JSON.stringify({ alnoor_manager: ['site_anc_demo', 'site_alnoor'] }));
    const limited: EffectiveAccess['scopes'] = [{ type: 'legal_entity', ids: ['le_x'] }];
    expect(demoAccessFor(() => access(limited))(persona('alnoor_manager'))!.scopes).toEqual(limited);
    expect(demoAccessFor(() => access([]))(persona('alnoor_manager'))!.scopes).toEqual([]);
    store.set(DEMO_SITE_SCOPE_KEY, JSON.stringify({ alnoor_manager: 'site_alnoor' }));
    expect(demoAccessFor(() => access([{ type: 'all' }]))(persona('alnoor_manager'))!.scopes).toEqual([{ type: 'all' }]);
    store.set(DEMO_SITE_SCOPE_KEY, '{not json');
    expect(demoAccessFor(() => access([{ type: 'all' }]))(persona('alnoor_manager'))!.scopes).toEqual([{ type: 'all' }]);
  });

  it('withdrawal and site scope combine, and withdrawal still removes only optional add-ons', () => {
    store.set(DEMO_WITHDRAWN_KEY, JSON.stringify(['community_hub', 'dues']));
    store.set(DEMO_SITE_SCOPE_KEY, JSON.stringify({ alnoor_manager: ['site_alnoor'] }));
    const a = demoAccessFor(() => access([{ type: 'all' }]))(persona('alnoor_manager'))!;
    expect(a.grants.map((g) => g.module)).toEqual(['hr']);
    expect(a.scopes).toEqual([{ type: 'site', ids: ['site_alnoor'] }]);
  });
});
