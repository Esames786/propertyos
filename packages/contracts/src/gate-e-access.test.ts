import { describe, expect, it } from 'vitest';
import { decide, decideTarget, MODULE_KEYS, PERMISSION_MODULE, type EffectiveAccess, type ModuleKey } from './access';
import { DEV_EDITIONS, DEVELOPER_APPROVAL_SUBJECTS, servesEdition } from './developer';
import { PERMISSIONS, type Permission } from './permissions';
import table from './gate-e-access.vectors.json';

/**
 * Gate E.0: the Wave 1 permission catalogue. Each new permission belongs to its module, so holding it
 * never reaches an unlicensed module (an unmapped permission would fall back to `core` in decideTarget:
 * the S.2a lesson), and each maker-checker pair is two different permissions.
 */
const PERMS = table.permissions as Record<string, ModuleKey>;
const today = '2026-10-26';

const accessWith = (permissions: readonly Permission[], modules: readonly ModuleKey[]): EffectiveAccess => ({
  tenant: { id: 'tnt_test', type: 'developer', status: 'active', suspensionPolicy: { allowSettlement: true } },
  grants: modules.map((module) => ({ module, sites: 'all', from: '2026-01-01', source: 'preset' })),
  features: [],
  permissions,
  scopes: [{ type: 'all' }],
  userId: 'usr_test',
});

describe('Gate E.0 permissions (gate-e-access.vectors.json)', () => {
  it('every Wave 1 permission is in the catalogue and mapped to the module the vectors name', () => {
    for (const [permission, module] of Object.entries(PERMS)) {
      expect(PERMISSIONS, permission).toContain(permission);
      expect(PERMISSION_MODULE[permission as Permission], permission).toBe(module);
      expect(MODULE_KEYS, permission).toContain(module);
    }
  });

  it('the register’s Wave 1 view permissions all exist', () => {
    for (const perms of Object.values(table.registerViewPermissions)) for (const p of perms) expect(PERMISSIONS).toContain(p);
  });

  it('no tenant permission falls back to core unmapped (guard for every later slice)', () => {
    expect(PERMISSIONS.filter((p) => !p.startsWith('platform.') && !PERMISSION_MODULE[p])).toEqual([]);
  });

  it('holding a Wave 1 permission reaches nothing while its module is unlicensed, and works once it is', () => {
    for (const [permission, module] of Object.entries(PERMS) as Array<[Permission, ModuleKey]>) {
      const others = MODULE_KEYS.filter((m) => m !== module);
      const without = accessWith([permission], module === 'core' ? MODULE_KEYS : others);
      const withModule = accessWith([permission], ['core', module]);
      if (module !== 'core') {
        expect(decideTarget(without, { permission }, today), permission).toEqual({ allowed: false, reason: 'module_not_licensed' });
        expect(decide(without, { module, permission, at: today }), permission).toEqual({ allowed: false, reason: 'module_not_licensed' });
      }
      expect(decideTarget(withModule, { permission }, today), permission).toEqual({ allowed: true });
      expect(decideTarget(accessWith([], ['core', module]), { permission }, today), permission).toEqual({ allowed: false, reason: 'permission_missing' });
    }
  });

  it('each maker-checker pair is two different permissions of the same module', () => {
    for (const pair of table.pairs) {
      expect(pair.maker, pair.subject).not.toBe(pair.checker);
      expect(PERMS[pair.maker], pair.subject).toBe(PERMS[pair.checker]);
    }
  });

  it('developer approval subjects are kept apart from the society subjects and are unique', () => {
    expect(new Set(DEVELOPER_APPROVAL_SUBJECTS).size).toBe(DEVELOPER_APPROVAL_SUBJECTS.length);
    for (const s of ['project_activation', 'journal', 'chart_change', 'posting_rule', 'bank_import', 'document_template']) expect(DEVELOPER_APPROVAL_SUBJECTS).toContain(s);
  });
});

describe('Gate E.0 editions (servesEdition)', () => {
  const of = (type: EffectiveAccess['tenant']['type']) => ({ tenant: { ...accessWith([], ['core']).tenant, type } });
  it('a DEV screen serves developers only; DEV+COMM adds property managers; ALL serves everyone', () => {
    expect(servesEdition(of('developer'))).toBe(true);
    for (const t of ['association', 'portfolio_manager', 'custom'] as const) expect(servesEdition(of(t)), t).toBe(false);
    expect(servesEdition(of('portfolio_manager'), 'DEV+COMM')).toBe(true);
    expect(servesEdition(of('association'), 'DEV+COMM')).toBe(false);
    for (const t of DEV_EDITIONS.ALL) expect(servesEdition(of(t), 'ALL'), t).toBe(true);
  });
  it('fails closed without access', () => {
    expect(servesEdition(null)).toBe(false);
    expect(servesEdition(undefined, 'ALL')).toBe(false);
  });
});
