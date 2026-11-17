import { DEVELOPER_STATE_VERSION, type DevCollectionAccount, type DevCostCentre, type DeveloperState, type DevLegalEntity, type Persona } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import table from '../../../contracts/src/gate-e-access.vectors.json';
import { datasetFor } from '../datasets';
import { DEMO_STORE_KEY, DemoStore } from '../demo-store';
import type { HandlerContext } from '../handler-types';
import { MockTransport } from '../mock-transport';
import { compareProjection } from '../projection.testkit';
import { ALL_PERSONAS, findPersona, PERSONAS } from '../people';
import { LARKSPUR_ERP_ROLES, rolesOf, tenantRole } from '../role-templates';
import { effectiveAccessFor } from '../tenant-directory';
import { ACCOUNTS_TWO, HEIGHTS_LEDGER, multiEntityAccess, multiEntityDataset, multiEntityWorld, RIVERSIDE, SECOND_ENTITY, SECOND_ENTITY_PROFILE } from './multientity.fixture';
import { costCentreVisible, entityVisible, entityWhole, projectGoverned, projectVisible, visibleEntityIds } from './scope';
import { DEVELOPER_SECTION, developerState, developerStateForWrite, ENTITY_PROFILES, formatDeveloperRef, seedDeveloperState } from './state';

/**
 * Gate E.0 foundation (plan §6 E.0 deliverables 1, 2, 5, 6 and F-3): the developer state, the scope
 * helpers on a multi-entity fixture, the read-only administration endpoints, permissions and personas.
 */
const GATE_E = Object.keys(table.permissions);
const NEW_PERSONAS = ['lsp_sales_manager', 'lsp_project_manager', 'lsp_accounts', 'lsp_finance_controller'];
const L = datasetFor('tnt_larkspur')!;
const heightsLead = L.leads.find((l) => l.projectId === 'prj_heights')!;
const NEVER_LEAD = 'led_never_issued_e0';
const NOT_FOUND = JSON.stringify({ name: 'ApiError', message: 'not_found', problem: { status: 404, code: 'not_found', messageKey: 'errors:api.notFound', correlationId: '<masked>', changed: false } });

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { problem: Record<string, unknown> };
    return JSON.stringify({ name: err.name, message: err.message, problem: { ...err.problem, correlationId: '<masked>' } });
  }
  throw new Error('expected a refusal');
}

function session(personas: readonly Persona[] = PERSONAS) {
  const mem = new Map<string, string>();
  const demo = new DemoStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
  const context = { personaId: 'manager', projectId: 'all' };
  const api = new MockTransport({ getContext: () => ({ ...context }), getMode: () => 'fast', demo, personas });
  return {
    api,
    demo,
    as(id: string, projectId = 'all') {
      context.personaId = id;
      context.projectId = projectId;
      return api;
    },
    snapshot() {
      demo.save();
      return mem.get(DEMO_STORE_KEY) ?? '';
    },
  };
}

describe('permissions and personas (E-06, E-07)', () => {
  it('no existing person gains a Gate E permission, except lead.manage for the three who wrote leads with lead.view (F-3, D-E0-01)', () => {
    for (const p of ALL_PERSONAS.filter((x) => !NEW_PERSONAS.includes(x.id))) {
      const gained = p.permissions.filter((x) => GATE_E.includes(x));
      expect(gained, p.id).toEqual(['manager', 'sales', 'cb_manager'].includes(p.id) ? ['lead.manage'] : []);
      if (gained.length) expect(p.permissions, p.id).toContain('lead.view');
    }
  });

  it('every developer starter set is unchanged (Larkspur and Crescent Bay change their own roles only)', () => {
    for (const r of rolesOf('tnt_test_dev', 'developer')) expect(r.permissions.some((x) => GATE_E.includes(x)), r.id).toBe(false);
  });

  it('the four new fictional Larkspur people each hold exactly their own new role', () => {
    for (const id of NEW_PERSONAS) {
      const p = findPersona(id)!;
      const role = LARKSPUR_ERP_ROLES.find((r) => r.id === p.roleId)!;
      expect(p).toMatchObject({ tenantId: 'tnt_larkspur', app: 'backoffice', projectScope: 'all' });
      expect(role.holders).toEqual([id]);
      expect(p.permissions).toEqual(role.permissions);
      expect(p.email.endsWith('@example.com')).toBe(true);
    }
    // Their principals are their own (nobody else, in either app, is the same person).
    for (const id of NEW_PERSONAS) expect(ALL_PERSONAS.filter((p) => p.principalId === findPersona(id)!.principalId).map((p) => p.id), id).toEqual([id]);
  });

  it('every maker-checker pair is split: nobody holds both sides, and each side has a holder at Larkspur', () => {
    for (const pair of table.pairs) {
      for (const p of ALL_PERSONAS) expect(p.permissions.includes(pair.maker as never) && p.permissions.includes(pair.checker as never), `${pair.subject} ${p.id}`).toBe(false);
      const larkspur = PERSONAS.filter((p) => p.tenantId === 'tnt_larkspur');
      expect(larkspur.some((p) => p.permissions.includes(pair.maker as never)), pair.subject).toBe(true);
      expect(larkspur.some((p) => p.permissions.includes(pair.checker as never)), pair.subject).toBe(true);
    }
  });
});

describe('F-3: writing to a lead needs lead.manage', () => {
  const viewer = { ...findPersona('sales')!, id: 'res_e0_viewer', principalId: 'usr_e0_viewer', permissions: ['lead.view'] } as unknown as Persona;
  const writerOnly = { ...findPersona('sales')!, id: 'res_e0_writer', principalId: 'usr_e0_writer', permissions: ['lead.manage'] } as unknown as Persona;
  const writes = (id: string) => [
    { method: 'POST' as const, path: `/leads/${id}/activity`, body: { kind: 'note', note: 'probe' } },
    { method: 'POST' as const, path: `/leads/${id}/status`, body: { status: 'contacted' } },
    { method: 'POST' as const, path: `/leads/${id}/follow-up`, body: { done: true } },
  ];

  it('a reader without lead.manage reads leads but every write is refused alike for known and invented ids; nothing changes', async () => {
    const s = session([...PERSONAS, viewer]);
    await expect(s.as('res_e0_viewer').request({ method: 'GET', path: `/leads/${heightsLead.id}` })).resolves.toMatchObject({ lead: { id: heightsLead.id } });
    const before = s.snapshot();
    const known = writes(heightsLead.id);
    const invented = writes(NEVER_LEAD);
    for (let i = 0; i < known.length; i++) {
      const a = await refusal(s.as('res_e0_viewer').request(known[i]!));
      expect(a, known[i]!.path).toBe(await refusal(s.as('res_e0_viewer').request(invented[i]!)));
      expect(JSON.parse(a).problem, known[i]!.path).toMatchObject({ status: 403, code: 'permission_missing' });
    }
    expect(s.snapshot()).toBe(before);
  });

  it('lead.manage without lead.view writes nothing either (the lead permission is checked before the id)', async () => {
    const s = session([...PERSONAS, writerOnly]);
    await s.as('res_e0_writer').request({ method: 'GET', path: '/notifications' });
    const before = s.snapshot();
    for (const [k, u] of writes(heightsLead.id).map((r, i) => [r, writes(NEVER_LEAD)[i]!] as const)) {
      const a = await refusal(s.as('res_e0_writer').request(k));
      expect(a).toBe(await refusal(s.as('res_e0_writer').request(u)));
      expect(JSON.parse(a).problem).toMatchObject({ status: 403, code: 'forbidden' });
    }
    expect(s.snapshot()).toBe(before);
  });

  it('Nadia and Bilal still write exactly as before', async () => {
    const s = session();
    for (const who of ['manager', 'sales']) {
      for (const r of writes(heightsLead.id)) await expect(s.as(who).request(r), `${who} ${r.path}`).resolves.toBeTruthy();
    }
  });
});

describe('developer state (deliverable 1)', () => {
  it('is seeded from the existing ids: Larkspur’s one entity, its two projects and their cost centres', () => {
    const s = seedDeveloperState(L);
    expect(s.version).toBe(DEVELOPER_STATE_VERSION);
    expect(s.legalEntities).toEqual([expect.objectContaining({ id: 'le_larkspur', code: 'LSP', projectIds: ['prj_heights', 'prj_gardens'], siteIds: ['site_lk_heights', 'site_lk_gardens'], source: 'administration' })]);
    expect(s.costCentres.map((c) => [c.id, c.projectId ?? null])).toEqual([['cc_lsp_hq', null], ['cc_lsp_sales', null], ['cc_heights', 'prj_heights'], ['cc_gardens', 'prj_gardens']]);
    expect(s.collectionAccounts).toEqual([expect.objectContaining({ legalEntityId: 'le_larkspur', maskedNumber: '•••• 4021', verified: true, sample: true })]);
    expect(s.approvalPolicies.every((p) => p.threshold === null && p.illustrative && p.state === 'approved' && p.version === 1)).toBe(true);
    expect(seedDeveloperState(L)).toEqual(s);
    expect(formatDeveloperRef(s, 'le_larkspur', 'journal', { seq: 1, on: '2026-10-26' })).toBe('LSP-JV-202610-0001');
    expect(() => formatDeveloperRef(s, 'le_never', 'journal', { seq: 1, on: '2026-10-26' })).toThrow(RangeError);
    expect(seedDeveloperState(datasetFor('tnt_crescent')!).legalEntities.map((e) => [e.id, e.code])).toEqual([['le_crescent', 'CBD']]);
  });

  const ctxOf = (personaId: string, demo: DemoStore) => {
    const persona = findPersona(personaId)!;
    return { access: effectiveAccessFor(persona), data: datasetFor(persona.tenantId)!, demo: demo.partition(persona.tenantId) } as unknown as HandlerContext;
  };

  it('reading never stores anything; the first write stores the section; a stale version is re-seeded; a demo reset clears it', () => {
    const demo = new DemoStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    const ctx = ctxOf('manager', demo);
    expect(developerState(ctx)?.legalEntities[0]?.id).toBe('le_larkspur');
    expect(ctx.demo.peekSection(DEVELOPER_SECTION)).toBeUndefined();
    const live = developerStateForWrite(ctx);
    expect(ctx.demo.peekSection(DEVELOPER_SECTION)).toBe(live);
    expect(developerState(ctx)).toBe(live);
    (live as { version: number }).version = 0;
    expect(developerState(ctx)).not.toBe(live);
    expect(developerStateForWrite(ctx).version).toBe(DEVELOPER_STATE_VERSION);
    demo.reset();
    expect(ctxOf('manager', demo).demo.peekSection(DEVELOPER_SECTION)).toBeUndefined();
  });

  it('only developer organisations have it', () => {
    const demo = new DemoStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    expect(developerState(ctxOf('alnoor_manager', demo))).toBeNull();
    expect(developerState(ctxOf('rb_director', demo))).toBeNull();
    expect(() => developerStateForWrite(ctxOf('alnoor_manager', demo))).toThrow();
    expect(developerState(ctxOf('cb_manager', demo))?.legalEntities.map((e) => e.id)).toEqual(['le_crescent']);
  });
});

describe('scope helpers on the multi-entity fixture (deliverable 2, E-08)', () => {
  const data = multiEntityDataset();
  const state = seedDeveloperState(data, { ...ENTITY_PROFILES, [SECOND_ENTITY]: SECOND_ENTITY_PROFILE });
  const ctx = (persona: Persona, projectFilter = 'all'): HandlerContext => {
    const scope = persona.projectScope;
    return {
      persona,
      tenantId: 'tnt_larkspur',
      access: multiEntityAccess(persona),
      data,
      allowsProject: (id: string) => (scope === 'all' || scope.includes(id)) && (projectFilter === 'all' || projectFilter === id),
      at: '2026-10-26',
      suspension: 'history_read',
      correlationId: 'demo-test',
    } as unknown as HandlerContext;
  };
  const LEDGER = { module: 'accounting', permission: 'gl.view' } as const;
  const faiza = findPersona('lsp_accounts')!;
  const bilal = findPersona('sales')!;

  it('the fixture adds a second entity and project without changing the demo', () => {
    expect(data.projects.map((p) => [p.id, p.legalEntityId])).toEqual([['prj_heights', 'le_larkspur'], ['prj_gardens', 'le_larkspur'], [RIVERSIDE.id, SECOND_ENTITY]]);
    expect(datasetFor('tnt_larkspur')!.projects).toHaveLength(2);
  });

  it('entity-wide scope (Faiza, all): sees and governs both entities', () => {
    for (const e of ['le_larkspur', SECOND_ENTITY]) {
      expect(entityVisible(ctx(faiza), e, LEDGER), e).toBe(true);
      expect(entityWhole(ctx(faiza), e, LEDGER), e).toBe(true);
    }
    expect(visibleEntityIds(ctx(faiza), LEDGER)).toEqual(['le_larkspur', SECOND_ENTITY]);
  });

  it('one project (Heights ledger reader): sees Larkspur’s entity but not the whole of it, and never the other entity', () => {
    const c = ctx(HEIGHTS_LEDGER);
    expect(entityVisible(c, 'le_larkspur', LEDGER)).toBe(true);
    expect(entityWhole(c, 'le_larkspur', LEDGER)).toBe(false);
    expect(entityVisible(c, SECOND_ENTITY, LEDGER)).toBe(false);
    expect(costCentreVisible(c, state, 'cc_heights', LEDGER)).toBe(true);
    expect(costCentreVisible(c, state, 'cc_gardens', LEDGER)).toBe(false);
    expect(costCentreVisible(c, state, 'cc_lsp_hq', LEDGER)).toBe(false);
    expect(costCentreVisible(c, state, 'cc_lsp_riverside_demo', LEDGER)).toBe(false);
  });

  it('legal-entity scope (Riverside accounts): the second entity only', () => {
    const c = ctx(ACCOUNTS_TWO);
    expect(visibleEntityIds(c, LEDGER)).toEqual([SECOND_ENTITY]);
    expect(entityWhole(c, SECOND_ENTITY, LEDGER)).toBe(true);
    expect(costCentreVisible(c, state, 'cc_lrd_hq', LEDGER)).toBe(true);
    expect(costCentreVisible(c, state, 'cc_lsp_hq', LEDGER)).toBe(false);
  });

  it('visible follows the header project; governed needs every project the record touches and ignores the header', () => {
    const NEED = { module: 'projects', permission: 'unit.view' } as const;
    expect(projectVisible(ctx(bilal), 'prj_heights', NEED)).toBe(true);
    expect(projectVisible(ctx(bilal), 'prj_gardens', NEED)).toBe(false);
    expect(projectVisible(ctx(findPersona('manager')!, 'prj_gardens'), 'prj_heights', NEED)).toBe(false);
    expect(projectGoverned(ctx(findPersona('manager')!, 'prj_gardens'), ['prj_heights', 'prj_gardens'], NEED)).toBe(true);
    expect(projectGoverned(ctx(bilal), ['prj_heights', 'prj_gardens'], NEED)).toBe(false);
    expect(projectGoverned(ctx(bilal), 'prj_heights', NEED)).toBe(true);
    expect(projectGoverned(ctx(bilal), [], NEED)).toBe(false);
    expect(projectVisible(ctx(bilal), 'prj_never', NEED)).toBe(false);
    // A permission the person does not hold: nothing is visible.
    expect(projectVisible(ctx(bilal), 'prj_heights', { module: 'projects', permission: 'project.view' })).toBe(false);
  });

  it('cost centres of another entity’s project never count for a project cost centre', () => {
    const forged: DeveloperState = { ...state, costCentres: [...state.costCentres, { id: 'cc_forged', legalEntityId: SECOND_ENTITY, code: 'X', name: 'X', kind: 'project', projectId: 'prj_heights', source: 'administration' }] };
    expect(costCentreVisible(ctx(faiza), forged, 'cc_forged', LEDGER)).toBe(false);
  });
});

describe('read-only administration endpoints (E-37) through the transport', () => {
  it('legal entities, cost centres, numbering, collection accounts and policies follow each reader’s scope', async () => {
    const w = multiEntityWorld();
    const entities = async (who: string) => (await w.as(who).request<DevLegalEntity[]>({ method: 'GET', path: '/developer/legal-entities' })).map((e) => e.id);
    expect(await entities('lsp_accounts')).toEqual(['le_larkspur', SECOND_ENTITY]);
    expect(await entities('res_e0_accounts_two')).toEqual([SECOND_ENTITY]);
    expect(await entities('res_e0_heights_ledger')).toEqual(['le_larkspur']);
    const centres = async (who: string) => (await w.as(who).request<DevCostCentre[]>({ method: 'GET', path: '/developer/cost-centres' })).map((c) => c.id);
    expect(await centres('res_e0_heights_ledger')).toEqual(['cc_heights']);
    expect(await centres('res_e0_accounts_two')).toEqual(['cc_lrd_hq', 'cc_lrd_sales', 'cc_lsp_riverside_demo']);
    const accounts = await w.as('lsp_finance_controller').request<DevCollectionAccount[]>({ method: 'GET', path: '/developer/collection-accounts' });
    expect(accounts.map((a) => a.maskedNumber)).toEqual(['•••• 4021', '•••• 5582']);
    expect(JSON.stringify(accounts)).not.toMatch(/\d{5,}/);
    expect((await w.as('lsp_finance_controller').request<unknown[]>({ method: 'GET', path: '/developer/approval-policies', query: { entity: SECOND_ENTITY } })).length).toBe(6);
  });

  it('an entity out of scope, an invented one and another organisation’s are refused alike, and nothing changes', async () => {
    const w = multiEntityWorld();
    await w.as('res_e0_accounts_two').request({ method: 'GET', path: '/notifications' });
    const before = w.snapshot();
    for (const path of ['/developer/cost-centres', '/developer/numbering', '/developer/collection-accounts', '/developer/approval-policies']) {
      const hidden = await refusal(w.as('res_e0_accounts_two').request({ method: 'GET', path, query: { entity: 'le_larkspur' } }));
      expect(hidden, path).toBe(await refusal(w.as('res_e0_accounts_two').request({ method: 'GET', path, query: { entity: 'le_never_issued' } })));
      expect(hidden, path).toBe(await refusal(w.as('res_e0_accounts_two').request({ method: 'GET', path, query: { entity: 'le_crescent' } })));
      expect(hidden, path).toBe(NOT_FOUND);
    }
    expect(w.snapshot()).toBe(before);
  });

  it('a missing permission stays 403; other kinds of organisation have no developer records', async () => {
    const s = session();
    expect(JSON.parse(await refusal(s.as('sales').request({ method: 'GET', path: '/developer/cost-centres' }))).problem).toMatchObject({ status: 403, code: 'permission_missing' });
    expect(JSON.parse(await refusal(s.as('sales').request({ method: 'GET', path: '/developer/collection-accounts' }))).problem).toMatchObject({ status: 403, code: 'permission_missing' });
    // Al-Noor's accounts officer may see bank records, but a society has no developer entity: empty, and a named one is not found.
    await expect(s.as('alnoor_accounts').request({ method: 'GET', path: '/developer/collection-accounts' })).resolves.toEqual([]);
    expect(await refusal(s.as('alnoor_accounts').request({ method: 'GET', path: '/developer/collection-accounts', query: { entity: 'le_larkspur' } }))).toBe(NOT_FOUND);
  });

  it('narrow vs full (projection test kit): the Heights reader’s answers name nothing of Gardens, head office or Riverside', async () => {
    const w = multiEntityWorld();
    const read = async (who: string) => ({
      entities: await w.as(who).request({ method: 'GET', path: '/developer/legal-entities' }),
      centres: await w.as(who).request({ method: 'GET', path: '/developer/cost-centres' }),
      accounts: await w.as(who).request({ method: 'GET', path: '/developer/collection-accounts' }),
    });
    const report = compareProjection({ narrow: await read('res_e0_heights_ledger'), full: await read('lsp_finance_controller'), hidden: ['Larkspur Gardens', 'LSP-LG', 'Head office', 'Larkspur Riverside', 'LRD', '5582'] });
    expect(report).toEqual({ leaks: [], unexercised: [] });
  });

  it('the multi-entity transport gives the second-entity officer a legal-entity scope only', () => {
    expect(multiEntityAccess(ACCOUNTS_TWO)?.scopes).toEqual([{ type: 'legal_entity', ids: [SECOND_ENTITY] }]);
    expect(multiEntityAccess(findPersona('manager')!)?.scopes).toEqual([{ type: 'all' }]);
    expect(tenantRole('tnt_larkspur', 'accounts_officer').holders).toEqual(['lsp_accounts']);
  });
});
