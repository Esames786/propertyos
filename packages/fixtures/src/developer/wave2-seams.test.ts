import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RecordRef, UnifiedSearchResponse } from '@repo/contracts';
import { PERMISSION_MODULE, PERMISSIONS, PRICING_DRAFT_ID_PREFIXES } from '@repo/contracts';
import { NAMESPACES } from '@repo/i18n';
import { describe, expect, it } from 'vitest';
import { UNITS } from '../inventory';
import { datasetFor } from '../datasets';
import { ALL_PERSONAS } from '../people';
import { rolesOf } from '../role-templates';
import { effectiveAccessFor } from '../tenant-directory';
import { invSession, minus as invMinus, refusal as invRefusal } from './inventory/inv-test-kit';
import { E8_PERSONAS } from './payables/pay-test-kit';
import { E3QA_PRICING, E3QA_PRICING_REVOKED, E3QA_TEST_PRINCIPALS } from './pricing/test-principals';
import { e13Session, minus, refusal } from './workspace/e13-test-kit';
import { PROVIDERS } from './workspace/registry';

/**
 * Wave 2 integration (Issue #25 follow-up, `integration/e-wave2`): the seams between the accepted Wave 1 base
 * (`8126322`), the E.3 pricing candidate (`dfd52f8`) and the E.8 payables candidate (`7188c74`) that neither
 * candidate could test alone:
 * - one canonical set: principals and personas, roles, permissions, i18n namespaces, `DEVELOPER_AREAS`;
 * - the E.13 record registry with E.8 beside the CRM, inventory and ledger providers (one owner per record kind; E.3
 *   drafts are not E.13 records), one search across areas scoped per reader, no oracle, revocation, isolation;
 * - E.3 pricing over E.2's inventory (the same units, the same 404 for a hidden one);
 * - E.8 under E.7's bank-data boundary;
 * - E.8 stays DEV-only.
 */
const REPO = resolve(__dirname, '../../../..');
const source = (path: string) => readFileSync(resolve(REPO, path), 'utf8');
const hits = (r: UnifiedSearchResponse) => r.groups.flatMap((g) => g.items);
const groupTypes = (r: UnifiedSearchResponse) => r.groups.filter((g) => g.items.length > 0).map((g) => g.type);
const PAYABLES_TYPES = ['supplier', 'supplier_bill', 'supplier_payment', 'expense', 'budget'];

describe('one canonical set across the base, E.3 and E.8', () => {
  it('principals stay unique: one person per demo principal, and test-only principals are never demo identities', () => {
    // Demo roster: per organisation and app, a principal is one persona (Al-Noor's secretary is in two apps by design).
    const perApp = ALL_PERSONAS.map((p) => `${p.tenantId}:${p.app}:${p.principalId}`);
    expect(new Set(perApp).size).toBe(perApp.length);
    expect(ALL_PERSONAS.filter((p) => p.principalId === 'usr_lsp_0021').map((p) => [p.id, p.displayName])).toEqual([['lsp_budget_holder', 'Rehan Saleem']]);
    const demoIds = new Set(ALL_PERSONAS.map((p) => p.id));
    const demoPrincipals = new Set(ALL_PERSONAS.map((p) => p.principalId));
    // E.3's test-only pricing principals (behind the build switch) and E.8's test principals: none is a demo identity.
    const e8TestOnly = E8_PERSONAS.filter((p) => !demoIds.has(p.id));
    for (const p of [...E3QA_TEST_PRINCIPALS, ...e8TestOnly]) {
      expect(demoIds.has(p.id), p.id).toBe(false);
      expect(demoPrincipals.has(p.principalId), p.principalId).toBe(false);
    }
    // E.3's persona ids are unique; its only shared principal is the deliberate "revoked" variant of the same tester.
    expect(new Set(E3QA_TEST_PRINCIPALS.map((p) => p.id)).size).toBe(E3QA_TEST_PRINCIPALS.length);
    const shared = E3QA_TEST_PRINCIPALS.filter((p) => E3QA_TEST_PRINCIPALS.some((q) => q !== p && q.principalId === p.principalId));
    expect(shared.map((p) => p.id).sort()).toEqual([E3QA_PRICING.id, E3QA_PRICING_REVOKED.id].sort());
    // E.3 and E.8 test principals never share an id with each other.
    const e3 = new Set(E3QA_TEST_PRINCIPALS.flatMap((p) => [p.id, p.principalId]));
    for (const p of e8TestOnly) expect(e3.has(p.id) || e3.has(p.principalId), p.id).toBe(false);
  });

  it('roles stay unique; the only new Larkspur role is budget_holder (Rehan); nobody holds pricing.manage', () => {
    const roles = rolesOf('tnt_larkspur', 'developer');
    expect(new Set(roles.map((r) => r.id)).size).toBe(roles.length);
    expect(roles.find((r) => r.id === 'budget_holder')?.holders).toEqual(['lsp_budget_holder']);
    // E.3 is draft-only: no role and no demo persona holds pricing.manage (no ordinary pricing grant).
    expect(roles.filter((r) => (r.permissions as readonly string[]).includes('pricing.manage'))).toEqual([]);
    for (const p of ALL_PERSONAS) expect((effectiveAccessFor(p)?.permissions ?? []) as readonly string[], p.id).not.toContain('pricing.manage');
  });

  it('permissions are unique, and each E.3 and E.8 permission names its module (inventory; payables)', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    expect(PERMISSION_MODULE['pricing.manage']).toBe('inventory');
    for (const p of ['supplier.manage', 'supplier_bill.approve', 'supplier_payment.approve', 'expense.view', 'expense.approve', 'budget.manage', 'budget.approve'] as const) expect(PERMISSION_MODULE[p], p).toBe('payables');
    // The two blocks sit after E.0's, E.3 first, each once.
    const text = source('packages/contracts/src/permissions.ts');
    const e0 = text.indexOf('// ---- end Gate E.0 ----');
    const e3 = text.indexOf('// ---- Gate E.3 (integration candidate) ----');
    const e8 = text.indexOf('// ---- Gate E.8 (integration candidate) ----');
    expect(e0).toBeGreaterThan(0);
    expect(e3).toBeGreaterThan(e0);
    expect(e8).toBeGreaterThan(e3);
    expect(text.split('// ---- Gate E.3 (integration candidate) ----').length).toBe(2);
    expect(text.split('// ---- Gate E.8 (integration candidate) ----').length).toBe(2);
  });

  it('i18n namespaces are unique and include pricing (E.3) and payables (E.8)', () => {
    expect(new Set(NAMESPACES).size).toBe(NAMESPACES.length);
    expect(NAMESPACES).toEqual(expect.arrayContaining(['pricing', 'payables']));
  });

  it('DEVELOPER_AREAS registers each area once: the six Wave 1 areas, then pricing (E.3) and payables (E.8)', () => {
    const text = source('apps/backoffice/src/prototype/routes.developer.tsx');
    const block = text.slice(text.indexOf('export const DEVELOPER_AREAS'), text.indexOf('export const DEVELOPER_ROUTES'));
    const areas = [...block.matchAll(/\{ area: '([a-z]+)'/g)].map((m) => m[1]);
    expect(areas).toEqual(['crm', 'projects', 'inventory', 'ledger', 'workspace', 'documents', 'pricing', 'payables']);
  });

  it('E.8 stays DEV-only: no payables screen declares another edition (DevScreen serves DEV by default)', () => {
    const routes = source('apps/backoffice/src/pages/developer/payables/routes.tsx');
    expect(routes).toContain('<DevScreen');
    expect(routes).not.toMatch(/edition=/);
  });
});

describe('the E.13 record registry with E.8 beside the CRM, inventory and ledger providers', () => {
  it('every record kind has exactly one owner; E.3 drafts have none (and the shell posts no visit for them)', () => {
    const samples = ['led_0001', 'opp_0001', 'vst_0001', 'pty_0001', 'unt_lh_a_0101', 'prj_heights', 'stg_lh_c01', 'gla_lsp_c1000', 'jnl_lsp_0001', 'doc_lsp_0001', 'dtp_lsp_001', 'inv_0001', 'sup_lsp_ravi', 'sbl_lsp_0001', 'spi_lsp_0001', 'exp_lsp_0001', 'bud_lsp_0001'];
    for (const id of samples) expect(PROVIDERS.filter((p) => p.owns(id)).length, id).toBe(1);
    for (const prefix of PRICING_DRAFT_ID_PREFIXES) expect(PROVIDERS.filter((p) => p.owns(`${prefix}000001`)).length, prefix).toBe(0);
    // The shell's visit rule names the same prefixes.
    expect(source('apps/backoffice/src/pages/developer/workspace/visit.ts')).toContain('PRICING_DRAFT_ID_PREFIXES');
  });

  it('one search across areas, per reader: Faiza finds journals and suppliers; Saad journals only; a bank detail finds nothing', async () => {
    const s = e13Session('lsp_accounts');
    const faiza = await s.get<UnifiedSearchResponse>('/workspace/search', { q: 'LSP-' });
    expect(groupTypes(faiza)).toEqual(expect.arrayContaining(['journal', 'supplier']));
    const saad = await s.as('lsp_ledger_clerk').get<UnifiedSearchResponse>('/workspace/search', { q: 'LSP-' });
    expect(groupTypes(saad)).toContain('journal');
    for (const t of PAYABLES_TYPES) expect(groupTypes(saad), t).not.toContain(t);
    // A supplier's bank digits and the bank's name are never a way in.
    for (const q of ['3307', 'Demo Bank']) expect(hits(await s.as('lsp_accounts').get<UnifiedSearchResponse>('/workspace/search', { q })).filter((h) => PAYABLES_TYPES.includes(h.type)), q).toEqual([]);
  });

  it('an E.8 record: hidden and never issued answer alike; revoking supplier.view hides it at once; another organisation never resolves it', async () => {
    const s = e13Session('lsp_accounts');
    expect((await s.get<RecordRef>('/workspace/resolve', { id: 'sup_lsp_ravi' })).type).toBe('supplier');
    const unknown = await refusal(s.get('/workspace/resolve', { id: 'sup_lsp_never_issued' }));
    // Saad (no supplier.view) and Rehan (expenses only) get the never-issued answer.
    for (const who of ['lsp_ledger_clerk', 'lsp_budget_holder']) expect(await refusal(s.as(who).get('/workspace/resolve', { id: 'sup_lsp_ravi' })), who).toEqual(unknown);
    s.as('lsp_accounts').change('lsp_accounts', minus('supplier.view'));
    expect(await refusal(s.get('/workspace/resolve', { id: 'sup_lsp_ravi' }))).toEqual(unknown);
    s.change('lsp_accounts', null);
    expect((await s.get<RecordRef>('/workspace/resolve', { id: 'sup_lsp_ravi' })).id).toBe('sup_lsp_ravi');
    expect(await refusal(s.as('cb_manager').get('/workspace/resolve', { id: 'sup_lsp_ravi' }))).toEqual(unknown);
  });
});

describe('E.3 pricing over E.2 inventory', () => {
  it('E.3 lists exactly the units E.2 lets the reader see, and a hidden unit is refused alike by both', async () => {
    const api = invSession().as('sales');
    const heights = UNITS.filter((u) => u.projectId === 'prj_heights');
    const list = await api.get<{ items: Array<{ id: string; projectId?: string }>; total: number }>('/pricing/units');
    expect(list.total).toBe(heights.length);
    for (const u of list.items) await api.get(`/inventory/units/${u.id}`); // every listed unit opens in INV-002
    const gardens = UNITS.find((u) => u.projectId === 'prj_gardens')!;
    const e3Hidden = await invRefusal(api.get(`/units/${gardens.id}/prices`));
    expect(e3Hidden).toEqual(await invRefusal(api.get('/units/unt_never_issued/prices')));
    expect(e3Hidden.status).toBe(404);
    expect(await invRefusal(api.get(`/inventory/units/${gardens.id}`))).toEqual(await invRefusal(api.get('/inventory/units/unt_never_issued')));
    // Revoking unit.view closes both at once.
    api.change('sales', invMinus('unit.view'));
    expect((await invRefusal(api.get('/pricing/units'))).status).toBe(403);
    expect((await invRefusal(api.get(`/inventory/units/${heights[0]!.id}`))).status).toBe(403);
  });

  it('a unit on a site whose inventory is not licensed is nobody’s in E.2, and so nobody’s in E.3 (the licence, not only the person’s scope)', async () => {
    // Crescent Bay's Plaza: the person's scope covers it, but inventory is not licensed for its site (E.13's documents
    // test uses the same shop). E.3 reads units through E.2's inventoryVisible, so the person's scope alone is not enough.
    const api = invSession().as('cb_manager');
    const plaza = datasetFor('tnt_crescent')!.units.find((u) => u.id === 'unt_cb_p_0101')!;
    expect(await invRefusal(api.get(`/inventory/units/${plaza.id}`))).toEqual(await invRefusal(api.get('/inventory/units/unt_cb_never_issued')));
    expect(await invRefusal(api.get(`/units/${plaza.id}/prices`))).toEqual(await invRefusal(api.get('/units/unt_cb_never_issued/prices')));
    expect((await api.get<{ total: number }>('/pricing/units', { project: plaza.projectId })).total).toBe(0);
    // Its licensed sibling project still lists its units.
    expect((await api.get<{ total: number }>('/pricing/units')).total).toBeGreaterThan(0);
  });
});

describe('E.8 under E.7’s bank-data boundary', () => {
  it('Faiza sees a supplier’s bank account (masked) only while she holds bank.view; without it, no bank detail and no statement import', async () => {
    const s = e13Session('lsp_accounts');
    const withBank = JSON.stringify(await s.get('/suppliers/sup_lsp_ravi'));
    expect(withBank).toContain('3307');
    expect(withBank).not.toMatch(/\b\d{10,}\b/);
    s.change('lsp_accounts', minus('bank.view'));
    const without = JSON.stringify(await s.get('/suppliers/sup_lsp_ravi'));
    for (const x of ['3307', 'Demo Bank', '7890']) expect(without, x).not.toContain(x);
    for (const x of JSON.stringify(await s.get('/supplier-payments')).match(/\d{4}/g) ?? []) expect(['3307', '7890', '8812', '5146', '0420']).not.toContain(x);
    expect((await refusal(s.get('/bank/imports'))).status).toBeGreaterThanOrEqual(403);
  });
});
