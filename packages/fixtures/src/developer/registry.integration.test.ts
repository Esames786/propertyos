import { describe, expect, it } from 'vitest';
import { HANDLERS } from '../handlers';
import { CRM_PIPELINE_HANDLERS } from './crm/handlers';
import { DEVELOPER_AREA_HANDLERS, DEVELOPER_CORE_HANDLERS, DEVELOPER_HANDLERS } from './handlers';
import { DEV_INVENTORY_HANDLERS } from './inventory/handlers';
import { LEDGER_HANDLERS } from './ledger/handlers';
import { E13_HANDLERS } from './workspace/handlers';
import { PROVIDERS } from './workspace/registry';

/**
 * Wave 1 integration (Issue #25): the mock API of the four Wave 1 slices goes through E.0's one registration
 * point, `DEVELOPER_AREA_HANDLERS`, exactly once, and nothing shadows anything else.
 */
const key = (h: { method: string; pattern: RegExp }) => `${h.method} ${h.pattern.source}`;

describe('Wave 1 handler registry', () => {
  it('registers E.1, E.2, E.7 and E.13 in DEVELOPER_AREA_HANDLERS, in that order, and nowhere else', () => {
    expect(DEVELOPER_AREA_HANDLERS).toEqual([CRM_PIPELINE_HANDLERS, DEV_INVENTORY_HANDLERS, LEDGER_HANDLERS, E13_HANDLERS]);
    expect(DEVELOPER_HANDLERS).toEqual([...DEVELOPER_CORE_HANDLERS, ...DEVELOPER_AREA_HANDLERS.flat()]);
    for (const h of DEVELOPER_HANDLERS) expect(HANDLERS.filter((x) => x === h), key(h)).toHaveLength(1);
  });

  it('no two endpoints of the whole mock API share a method and pattern (no shadowed handler)', () => {
    const seen = new Map<string, number>();
    for (const h of HANDLERS) seen.set(key(h), (seen.get(key(h)) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1)).toEqual([]);
  });

  it('every Wave 1 endpoint declares tenant access (module, permission, suspension): none is open before sign-in', () => {
    for (const h of DEVELOPER_AREA_HANDLERS.flat()) {
      expect(h.access.kind, key(h)).toBe('tenant');
      if (h.access.kind === 'tenant') expect(['operational', 'history_read'], key(h)).toContain(h.access.suspension);
    }
  });
});

describe('Wave 1 record registry (E.13 with E.1, E.2 and E.7)', () => {
  it('every kind of record has exactly one provider, so the order of the list never decides anything', () => {
    const samples = ['opp_0013', 'vst_001', 'stg_lh_a03', 'gla_lsp_c1000', 'jnl_lsp_0001', 'unt_lh_a_0101', 'prj_heights', 'led_0004', 'pty_0012', 'inv_0001', 'doc_lsp_0001', 'dtp_lsp_001', 'lse_rb_0001'];
    for (const id of samples) expect(PROVIDERS.filter((p) => p.owns(id)).map((p) => p.type), id).toHaveLength(1);
    for (const type of ['opportunity', 'visit', 'storage', 'account', 'journal'] as const) expect(PROVIDERS.filter((p) => p.type === type), type).toHaveLength(1);
  });
});
