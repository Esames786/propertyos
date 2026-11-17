import { describe, expect, it } from 'vitest';
import type { EffectiveAccess, Permission, Persona } from '@repo/contracts';
import { DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';
import { ALL_PERSONAS, PERSONAS } from '../../people';
import { rolesOf } from '../../role-templates';
import { effectiveAccessFor, TENANT_DIRECTORY } from '../../tenant-directory';
import { datasetFor } from '../../datasets';
import * as fixturesIndex from '../../index';
import { E3QA_PRICING, E3QA_PRICING_CRESCENT, E3QA_PRICING_HEIGHTS, E3QA_PRICING_PEER, E3QA_PRICING_REVOKED, E3QA_TEST_PRINCIPALS } from './test-principals';

/**
 * Gate E.3 local validation (Issue #33, Wave 2 Agent 2): the flows the directive lists, through the real
 * MockTransport (access gate, session gate, handlers) for all five draft families, with the shared
 * test-only principals. Each refusal is followed by a byte-for-byte comparison of the tenant overlay
 * (identity section excepted: the session gate records sign-ins there, GPT pass 3).
 */

const HEIGHTS_UNIT = 'unt_lh_a_0101';
const GARDENS_UNIT = 'unt_lg_p1_001';
const PKR = (amount: string) => ({ amount, currency: 'PKR' as const });

interface Family {
  name: string;
  section: string;
  rows: 'templates' | 'policies' | 'drafts';
  list: (unitId?: string) => string;
  detail: (id: string) => string;
  create: (unitId?: string) => string;
  revise: (id: string) => string;
  /** A valid create body (without key) for the given project / unit. */
  createBody: (projectId: string) => Record<string, unknown>;
  /** A valid revision body (without key). */
  reviseBody: (expectedVersion: number, n: number) => Record<string, unknown>;
  /** INV-007 addresses a unit, the others a project. */
  byUnit?: boolean;
}

const ALLOC = [{ kind: 'down_payment', shareBps: 2000 }, { kind: 'instalments', shareBps: 8000, count: 4 }];
const POLICY_RULES = [{ unitType: 'residential', baseRate: PKR('12500.50'), floorRiseBps: 100, cornerPremiumBps: 0, parkFacingPremiumBps: 250 }];
const FEES = [{ code: 'FILE_FEE', label: 'Illustrative fee', mode: 'fixed', amount: PKR('1.00') }];
const DISCOUNTS = [{ code: 'EARLY_DISC', label: 'Illustrative discount', rateBps: 2000, maxAmount: PKR('30.00') }];
const APPROVAL_RULES = [{ subject: 'unit_price_change', threshold: PKR('0.00'), requiredReviewers: 2, makerCheckerRequired: true, allowSelfApproval: false }];

const FAMILIES: readonly Family[] = [
  {
    name: 'COM-001 plan templates', section: 'developer.pricing.templates', rows: 'templates',
    list: () => '/pricing/plan-templates', detail: (id) => `/pricing/plan-templates/${id}`, create: () => '/pricing/plan-templates', revise: (id) => `/pricing/plan-templates/${id}/versions`,
    createBody: (projectId) => ({ projectId, title: 'QA template', allocations: ALLOC }),
    reviseBody: (expectedVersion, n) => ({ expectedVersion, title: `QA template v${n}`, allocations: ALLOC }),
  },
  {
    name: 'COM-003 pricing policies', section: 'developer.pricing.policies', rows: 'policies',
    list: () => '/pricing/policies', detail: (id) => `/pricing/policies/${id}`, create: () => '/pricing/policies', revise: (id) => `/pricing/policies/${id}/versions`,
    createBody: (projectId) => ({ projectId, title: 'QA policy', rules: POLICY_RULES }),
    reviseBody: (expectedVersion, n) => ({ expectedVersion, title: `QA policy v${n}`, rules: POLICY_RULES }),
  },
  {
    name: 'COM-004 fees and discounts', section: 'developer.pricing.commercial', rows: 'drafts',
    list: () => '/pricing/commercial-rules', detail: (id) => `/pricing/commercial-rules/${id}`, create: () => '/pricing/commercial-rules', revise: (id) => `/pricing/commercial-rules/${id}/versions`,
    createBody: (projectId) => ({ projectId, title: 'QA fees', fees: FEES, discounts: DISCOUNTS }),
    reviseBody: (expectedVersion, n) => ({ expectedVersion, title: `QA fees v${n}`, fees: FEES, discounts: DISCOUNTS }),
  },
  {
    name: 'COM-005 approval rules', section: 'developer.pricing.approval-rules', rows: 'drafts',
    list: () => '/pricing/approval-rules', detail: (id) => `/pricing/approval-rules/${id}`, create: () => '/pricing/approval-rules', revise: (id) => `/pricing/approval-rules/${id}/versions`,
    createBody: (projectId) => ({ projectId, title: 'QA approval rules', rules: APPROVAL_RULES }),
    reviseBody: (expectedVersion, n) => ({ expectedVersion, title: `QA approval rules v${n}`, rules: APPROVAL_RULES }),
  },
  {
    name: 'INV-007 price-change drafts', section: 'developer.pricing.price-change-drafts', rows: 'drafts', byUnit: true,
    list: (unitId = HEIGHTS_UNIT) => `/units/${unitId}/price-change-drafts`, detail: (id) => `/price-change-drafts/${id}`,
    create: (unitId = HEIGHTS_UNIT) => `/units/${unitId}/price-change-drafts`, revise: (id) => `/price-change-drafts/${id}/versions`,
    createBody: () => ({ proposedPrice: PKR('17400000.25'), reason: 'Illustrative internal proposal for QA only' }),
    reviseBody: (expectedVersion, n) => ({ expectedVersion, proposedPrice: PKR(`17400${String(n).padStart(3, '0')}.75`), reason: `Illustrative internal revision ${n} for QA only` }),
  },
];

type Problem = { status: number; code: string; changed: boolean };
type Draft = { id: string; currentVersion: number; versions: unknown[]; state: string };

function world() {
  const memory = new Map<string, string>();
  const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) };
  let demo = new DemoStore(storage);
  const session: { personaId: string; projectId: string } = { personaId: E3QA_PRICING.id, projectId: 'all' };
  /** Grants taken away from a principal mid-session (true revocation: same person, same session). */
  const revoked = new Map<string, Permission[]>();
  const withdrawnModules: string[] = [];
  const accessFor = (persona: Persona): EffectiveAccess | null => {
    const base = effectiveAccessFor(persona);
    if (!base) return base;
    const gone = revoked.get(persona.id) ?? [];
    return { ...base, permissions: base.permissions.filter((p) => !gone.includes(p)), grants: base.grants.filter((g) => !withdrawnModules.includes(g.module)) };
  };
  const server = () => new MockTransport({ getContext: () => ({ ...session }), getMode: () => 'fast', demo, personas: [...ALL_PERSONAS, ...E3QA_TEST_PRINCIPALS], accessFor });
  let api = server();
  const send = <T,>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>, key?: string, headerKey = key) =>
    api.request<T>({ method, path, ...(headerKey ? { idempotencyKey: headerKey } : {}), ...(body ? { body: key ? { ...body, idempotencyKey: key } : body } : {}) });
  return {
    send, revoked, withdrawnModules,
    /** A page reload: a new store and server over the same session storage (sections come back from JSON). */
    reload() { demo.save(); demo = new DemoStore(storage); api = server(); },
    as(id: string, projectId = 'all') { session.personaId = id; session.projectId = projectId; },
    state() {
      demo.save();
      const raw = memory.get('demo:store:v2');
      if (!raw) return '';
      const value = JSON.parse(raw) as { partitions: Record<string, { sections: Record<string, unknown> }> };
      for (const partition of Object.values(value.partitions)) delete partition.sections.identity;
      return JSON.stringify(value);
    },
    rows<T = Draft>(f: Family): T[] {
      demo.save();
      const raw = memory.get('demo:store:v2');
      const value = raw ? (JSON.parse(raw) as { partitions: Record<string, { sections: Record<string, Record<string, unknown>> }> }) : null;
      return ((value?.partitions.tnt_larkspur?.sections[f.section]?.[f.rows] as T[] | undefined) ?? []);
    },
  };
}
async function refused(p: Promise<unknown>): Promise<Problem> {
  try { await p; } catch (e) {
    const { status, code, changed } = (e as { problem: Problem }).problem;
    return { status, code, changed };
  }
  throw new Error('expected a refusal');
}
const unitPrice = async (w: ReturnType<typeof world>, unitId = HEIGHTS_UNIT) => JSON.stringify(await w.send('GET', `/units/${unitId}/prices`));
const listedPrices = () => JSON.stringify(datasetFor('tnt_larkspur')!.units.map((u) => [u.id, u.price]));

describe('E.3 test-only pricing principals are not demo identities', () => {
  it('none is a demo persona, holds a role, or is offered for sign-in; no demo role or persona holds pricing.manage', () => {
    const demoIds = new Set([...ALL_PERSONAS, ...PERSONAS].map((p) => p.id));
    for (const p of E3QA_TEST_PRINCIPALS) {
      expect(demoIds.has(p.id), p.id).toBe(false);
      expect(p.unlisted, p.id).toBe(true);
      expect(p.roleId, p.id).toBeUndefined();
      expect(p.app).toBe('backoffice');
    }
    expect(ALL_PERSONAS.filter((p) => p.permissions.includes('pricing.manage'))).toEqual([]);
    for (const tenant of TENANT_DIRECTORY) {
      for (const role of rolesOf(tenant.id, tenant.type)) expect(role.permissions.includes('pricing.manage'), `${tenant.id} ${role.id}`).toBe(false);
    }
  });

  it('the package index does not export them; only the `@repo/fixtures/testing` entry does', () => {
    const exported = Object.entries(fixturesIndex);
    expect(exported.filter(([name]) => /E3QA/.test(name))).toEqual([]);
    expect(exported.filter(([, value]) => (E3QA_TEST_PRINCIPALS as readonly unknown[]).includes(value))).toEqual([]);
  });

  it('the backoffice compiles them in only behind the build-time switch, which only the test build turns on', async () => {
    const { readFileSync } = await import('node:fs');
    const main = readFileSync(new URL('../../../../../apps/backoffice/src/main.tsx', import.meta.url), 'utf8');
    const vite = readFileSync(new URL('../../../../../apps/backoffice/vite.config.ts', import.meta.url), 'utf8');
    expect(main).toContain("const personas = __E2E_TEST_PRINCIPALS__ ? [...ALL_PERSONAS, ...E3QA_TEST_PRINCIPALS] : ALL_PERSONAS;");
    expect(main.match(/E3QA_TEST_PRINCIPALS/g)).toHaveLength(2); // the import and the switch, nothing else
    expect(vite).toContain("__E2E_TEST_PRINCIPALS__: JSON.stringify(process.env.PROPERTYOS_E2E_PRINCIPALS === '1')");
    // Pure factory calls: an unused result is dropped from a build where the switch is false.
    const source = readFileSync(new URL('./test-principals.ts', import.meta.url), 'utf8');
    expect(source.match(/^export const E3QA_[A-Z_]+ = \/\* @__PURE__ \*\/ principal\(/gm)).toHaveLength(5);
  });
});

for (const f of FAMILIES) {
  const target = f.byUnit ? HEIGHTS_UNIT : 'prj_heights';
  describe(`${f.name} — directive flows (test-only principal)`, () => {
    it('create then revise; a same-key retry of either replays the original and writes nothing', async () => {
      const w = world();
      const price = await unitPrice(w);
      const created = await w.send<Draft>('POST', f.create(), f.createBody(target), 'qa-create-key-000001');
      expect(created.currentVersion).toBe(1);
      let before = w.state();
      expect(await w.send<Draft>('POST', f.create(), f.createBody(target), 'qa-create-key-000001')).toEqual(created);
      expect(w.state()).toBe(before);
      const revised = await w.send<Draft>('POST', f.revise(created.id), f.reviseBody(1, 2), 'qa-revise-key-000002');
      expect(revised.currentVersion).toBe(2);
      before = w.state();
      expect(await w.send<Draft>('POST', f.revise(created.id), f.reviseBody(1, 2), 'qa-revise-key-000002')).toEqual(revised);
      expect(w.state()).toBe(before);
      expect(w.rows(f)).toHaveLength(1);
      expect(await unitPrice(w)).toBe(price);
      expect(listedPrices()).toBe(listedPrices());
    });

    it('a lost response (applied, never seen) retried with the same key returns the same draft; a fresh key would be a second draft', async () => {
      const w = world();
      // The first send is applied by the server; the client never sees its answer.
      await w.send('POST', f.create(), f.createBody(target), 'qa-lost-key-0000001');
      const before = w.state();
      const retried = await w.send<Draft>('POST', f.create(), f.createBody(target), 'qa-lost-key-0000001');
      expect(w.state()).toBe(before);
      expect(retried.id).toBe(w.rows(f)[0]!.id);
      expect(w.rows(f)).toHaveLength(1);
      // Contrast: a fresh key is a new logical create (this is what the UI must never send for a retry).
      await w.send('POST', f.create(), f.createBody(target), 'qa-fresh-key-000002');
      expect(w.rows(f)).toHaveLength(2);
    });

    it('a stale expected version is a 409 and changes nothing; the current version succeeds', async () => {
      const w = world();
      const d = await w.send<Draft>('POST', f.create(), f.createBody(target), 'qa-create-key-000003');
      await w.send('POST', f.revise(d.id), f.reviseBody(1, 2), 'qa-tab-a-key-000004');
      const before = w.state();
      expect(await refused(w.send('POST', f.revise(d.id), f.reviseBody(1, 3), 'qa-tab-b-key-000005'))).toEqual({ status: 409, code: 'idempotency_key_reused', changed: false });
      expect(w.state()).toBe(before);
      expect((await w.send<Draft>('POST', f.revise(d.id), f.reviseBody(2, 3), 'qa-tab-b-key-000006')).currentVersion).toBe(3);
    });

    it('a header key and a body key that differ are refused (422) before any id, version or key is used', async () => {
      const w = world();
      await w.send('GET', f.list());
      const before = w.state();
      expect(await refused(w.send('POST', f.create(), f.createBody(target), 'qa-body-key-0000007', 'qa-header-key-000008'))).toMatchObject({ status: 422, changed: false });
      expect(w.state()).toBe(before);
      const d = await w.send<Draft>('POST', f.create(), f.createBody(target), 'qa-header-key-000008');
      expect(d.id).toMatch(/_000001$/);
      const mid = w.state();
      expect(await refused(w.send('POST', f.revise(d.id), f.reviseBody(1, 2), 'qa-body-key-0000009', 'qa-header-key-000010'))).toMatchObject({ status: 422, changed: false });
      expect(w.state()).toBe(mid);
    });

    it('revoking pricing.manage (same person, same session) refuses list, read, write and even an exact replay; nothing written', async () => {
      const w = world();
      const d = await w.send<Draft>('POST', f.create(), f.createBody(target), 'qa-create-key-000011');
      w.revoked.set(E3QA_PRICING.id, ['pricing.manage']);
      const before = w.state();
      for (const p of [w.send('GET', f.list()), w.send('GET', f.detail(d.id)), w.send('POST', f.create(), f.createBody(target), 'qa-create-key-000011'), w.send('POST', f.revise(d.id), f.reviseBody(1, 2), 'qa-revise-key-000012')]) {
        expect(await refused(p)).toMatchObject({ status: 403, changed: false });
      }
      expect(w.state()).toBe(before);
      // The browser's revoked principal (same principalId, no pricing.manage) is refused the same way.
      w.revoked.clear();
      w.as(E3QA_PRICING_REVOKED.id);
      expect(await refused(w.send('GET', f.detail(d.id)))).toMatchObject({ status: 403, changed: false });
      expect(w.state()).toBe(before);
    });

    it('withdrawing the inventory module (licence) refuses at once, nothing written', async () => {
      const w = world();
      const d = await w.send<Draft>('POST', f.create(), f.createBody(target), 'qa-create-key-000013');
      w.withdrawnModules.push('inventory');
      const before = w.state();
      expect((await refused(w.send('GET', f.detail(d.id)))).changed).toBe(false);
      expect((await refused(w.send('POST', f.revise(d.id), f.reviseBody(1, 2), 'qa-revise-key-000014'))).changed).toBe(false);
      expect(w.state()).toBe(before);
    });

    it('another creator, another project scope or header, and another tenant get exactly the unknown-id answer; lists do not count it', async () => {
      const w = world();
      const d = await w.send<Draft>('POST', f.create(), f.createBody(target), 'qa-create-key-000015');
      const viewers: Array<[string, string]> = [[E3QA_PRICING_PEER.id, 'all'], [E3QA_PRICING.id, 'prj_gardens'], [E3QA_PRICING_CRESCENT.id, 'all'], [E3QA_PRICING_HEIGHTS.id, 'all']];
      for (const [who, project] of viewers) {
        w.as(who, project);
        // A first sign-in to another organisation opens its (empty) partition: prime it with a legitimate read first.
        await w.send('GET', '/pricing/units');
        const before = w.state();
        const own = await refused(w.send('GET', f.detail(d.id)));
        const unknown = await refused(w.send('GET', f.detail(d.id.replace(/\d+$/, '999999'))));
        expect(own, `${who} @ ${project}`).toEqual(unknown);
        expect(own).toEqual({ status: 404, code: 'not_found', changed: false });
        expect(await refused(w.send('POST', f.revise(d.id), f.reviseBody(1, 2), `qa-intruder-${who.slice(-6)}-01`))).toEqual(unknown);
        if (!f.byUnit) expect((await w.send<{ total: number }>('GET', f.list())).total).toBe(0);
        expect(w.state(), `${who} @ ${project}: nothing written`).toBe(before);
      }
    });

    if (!f.byUnit) {
      it('a project-limited principal cannot create in another project; Gardens answers exactly like a project that does not exist', async () => {
        const w = world();
        w.as(E3QA_PRICING_HEIGHTS.id);
        await w.send('GET', f.list());
        const before = w.state();
        const gardens = await refused(w.send('POST', f.create(), f.createBody('prj_gardens'), 'qa-create-key-000016'));
        const nowhere = await refused(w.send('POST', f.create(), f.createBody('prj_never_issued'), 'qa-create-key-000016'));
        expect(gardens).toEqual(nowhere);
        expect(gardens).toEqual({ status: 404, code: 'not_found', changed: false });
        expect(w.state()).toBe(before);
      });
    } else {
      it('a project-limited principal cannot propose for a Gardens unit; it answers exactly like a unit that does not exist', async () => {
        const w = world();
        w.as(E3QA_PRICING_HEIGHTS.id);
        await w.send('GET', f.list());
        const before = w.state();
        const gardens = await refused(w.send('POST', f.create(GARDENS_UNIT), f.createBody(''), 'qa-create-key-000017'));
        const nowhere = await refused(w.send('POST', f.create('unt_lh_never_issued'), f.createBody(''), 'qa-create-key-000017'));
        expect(gardens).toEqual(nowhere);
        expect(gardens).toEqual({ status: 404, code: 'not_found', changed: false });
        expect(await refused(w.send('GET', f.list(GARDENS_UNIT)))).toEqual(await refused(w.send('GET', f.list('unt_lh_never_issued'))));
        expect(w.state()).toBe(before);
      });
    }

    it('no draft action changes any unit price, the price history, or any other section', async () => {
      const w = world();
      const listed = listedPrices();
      const history = await unitPrice(w);
      const gardensHistory = await unitPrice(w, GARDENS_UNIT);
      const d = await w.send<Draft>('POST', f.create(), f.createBody(target), 'qa-create-key-000018');
      await w.send('POST', f.revise(d.id), f.reviseBody(1, 2), 'qa-revise-key-000019');
      await refused(w.send('POST', f.revise(d.id), f.reviseBody(1, 3), 'qa-revise-key-000020'));
      expect(await unitPrice(w)).toBe(history);
      expect(await unitPrice(w, GARDENS_UNIT)).toBe(gardensHistory);
      expect(listedPrices()).toBe(listed);
      const parsed = JSON.parse(w.state()) as { partitions: Record<string, { sections: Record<string, unknown> }> };
      expect(Object.keys(parsed.partitions)).toEqual(['tnt_larkspur']);
      expect(Object.keys(parsed.partitions.tnt_larkspur!.sections)).toEqual([f.section]);
    });

    it('a valid key that names an Object.prototype member is an ordinary key, before and after a reload', async () => {
      // The request-key format admits 12–100 of [A-Za-z0-9._:-], so these are valid keys. The replay maps come
      // back from session storage as plain objects, where `map[key]` finds the inherited member.
      for (const key of ['hasOwnProperty', 'isPrototypeOf', 'toLocaleString', 'propertyIsEnumerable', '__defineGetter__', '__lookupSetter__']) {
        const w = world();
        const first = await w.send<Draft>('POST', f.create(), f.createBody(target), 'qa-ordinary-key-0001');
        w.reload();
        // As a create key: a new draft, then an exact replay of it.
        const created = await w.send<Draft>('POST', f.create(), f.createBody(target), key);
        expect(created.id, key).not.toBe(first.id);
        w.reload();
        const before = w.state();
        expect(await w.send<Draft>('POST', f.create(), f.createBody(target), key), `${key} replay`).toEqual(created);
        expect(w.state()).toBe(before);
        // As a revision key on the other draft: a new version (another operation than the create it named).
        const other = world();
        const draft = await other.send<Draft>('POST', f.create(), f.createBody(target), 'qa-ordinary-key-0002');
        other.reload();
        expect((await other.send<Draft>('POST', f.revise(draft.id), f.reviseBody(1, 2), key)).currentVersion, `${key} as a revision key`).toBe(2);
      }
    });
  });
}
