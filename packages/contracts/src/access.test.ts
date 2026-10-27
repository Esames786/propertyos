import { describe, expect, it } from 'vitest';
import { decide, denyStatus, grantActive, type AccessRequest, type AccessScope, type EffectiveAccess, type FeatureKey, type ModuleGrant, type TenantStatus } from './access';
import type { Permission } from './permissions';
import table from './access.vectors.json';

interface Vector {
  name: string;
  tenant?: { status?: TenantStatus; allowSettlement?: boolean };
  grants?: ModuleGrant[];
  features?: FeatureKey[];
  permissions?: Permission[];
  scopes?: AccessScope[];
  request: AccessRequest;
  expect: string;
}

const base = table.base as unknown as EffectiveAccess;

function accessFor(v: Vector): EffectiveAccess {
  return {
    ...base,
    tenant: {
      ...base.tenant,
      status: v.tenant?.status ?? base.tenant.status,
      suspensionPolicy: { allowSettlement: v.tenant?.allowSettlement ?? base.tenant.suspensionPolicy.allowSettlement },
    },
    grants: v.grants ?? base.grants,
    features: v.features ?? base.features,
    permissions: v.permissions ?? base.permissions,
    scopes: v.scopes ?? base.scopes,
  };
}

describe('access decision vectors', () => {
  for (const v of table.vectors as unknown as Vector[]) {
    it(v.name, () => {
      const result = decide(accessFor(v), v.request);
      expect(result.allowed ? 'allow' : result.reason).toBe(v.expect);
    });
  }

  it('covers every deny reason at least once', () => {
    const outcomes = new Set((table.vectors as unknown as Vector[]).map((v) => v.expect));
    for (const reason of ['tenant_inactive', 'tenant_suspended', 'module_not_licensed', 'site_not_licensed', 'feature_not_licensed', 'permission_missing', 'out_of_scope', 'state_locked', 'separation_of_duties']) {
      expect(outcomes, reason).toContain(reason);
    }
  });
});

describe('access helpers', () => {
  it('treats grant dates as a half-open interval', () => {
    const g: ModuleGrant = { module: 'dues', sites: 'all', from: '2026-11-01', to: '2026-12-01', source: 'preset' };
    expect(grantActive(g, '2026-10-31T23:00:00Z')).toBe(false);
    expect(grantActive(g, '2026-11-01')).toBe(true);
    expect(grantActive(g, '2026-11-30')).toBe(true);
    expect(grantActive(g, '2026-12-01')).toBe(false);
  });

  it('maps out-of-scope records to 404 so their existence is not confirmed', () => {
    expect(denyStatus('out_of_scope')).toBe(404);
    expect(denyStatus('module_not_licensed')).toBe(403);
    expect(denyStatus('state_locked')).toBe(409);
  });
});
