import { describe, expect, it } from 'vitest';
import type { PaymentPlanTemplate, PaymentPlanTemplateList, PlanAllocationInput } from '@repo/contracts';
import { DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';
import { ALL_PERSONAS, findPersona } from '../../people';

const manager = findPersona('manager')!;
const alice = { ...manager, id: 'e3_template_alice', principalId: 'usr_e3_template_01', permissions: [...manager.permissions, 'pricing.manage'] };
const bob = { ...manager, id: 'e3_template_bob', principalId: 'usr_e3_template_02', permissions: [...manager.permissions, 'pricing.manage'] };
const scopes = { ...alice, id: 'e3_template_scoped', principalId: 'usr_e3_template_03', projectScope: ['prj_heights'] };
const VIEWER = 'sales';
const ROWS: PlanAllocationInput[] = [
  { kind: 'down_payment', shareBps: 2000 },
  { kind: 'instalments', shareBps: 8000, count: 4 },
];
const KEY1 = 'draft-template-key-00000001';
const KEY2 = 'draft-template-key-00000002';
const KEY3 = 'draft-template-key-00000003';
const PROJECT = 'prj_heights';
function env() {
  const mem = new Map<string, string>();
  const demo = new DemoStore({
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  });
  const session = { personaId: alice.id, projectId: 'all' };
  const api = new MockTransport({
    getContext: () => ({ ...session }),
    getMode: () => 'fast', demo,
    personas: [...ALL_PERSONAS, alice, bob, scopes],
  });
  return {
    api,
    as(id: string, projectId = 'all') { session.personaId = id; session.projectId = projectId; return api; },
    snapshot() { demo.save(); return JSON.stringify([...mem.entries()].sort()); },
  };
}
const create = (api: MockTransport, key = KEY1, projectId = PROJECT, title = 'Standard fictional payment plan', allocations: unknown = ROWS) =>
  api.request<PaymentPlanTemplate>({
    method: 'POST', path: '/pricing/plan-templates', idempotencyKey: key,
    body: { projectId, title, allocations, idempotencyKey: key },
  });
const revise = (api: MockTransport, id: string, key: string, version: number, title: string, allocations: unknown = ROWS) =>
  api.request<PaymentPlanTemplate>({
    method: 'POST', path: `/pricing/plan-templates/${id}/versions`, idempotencyKey: key,
    body: { title, expectedVersion: version, allocations, idempotencyKey: key },
  });
const list = (api: MockTransport, query: Record<string, string> = {}) =>
  api.request<PaymentPlanTemplateList>({ method: 'GET', path: '/pricing/plan-templates', query });
const detail = (api: MockTransport, id: string) =>
  api.request<PaymentPlanTemplate>({ method: 'GET', path: `/pricing/plan-templates/${id}` });
async function denied(promise: Promise<unknown>) {
  try { await promise; } catch (e) {
    const err = e as Error & { problem: { status: number; code: string; changed: boolean; correlationId?: string } };
    const { correlationId: _id, ...p } = err.problem;
    return p;
  }
  throw Error('Expected an API denial');
}

describe('E.3 COM-001 — private, immutable, request-bound draft templates', () => {
  it('creates a private draft, not an approved/posted plan; reads do not write', async () => {
    const w = env();
    const created = await create(w.api);
    expect(created).toMatchObject({
      tenantId: alice.tenantId, projectId: PROJECT, creatorPrincipalId: alice.principalId,
      currentVersion: 1, state: 'draft', approvalAllowed: false, postingAllowed: false,
    });
    expect(created.versions).toEqual([{
      version: 1, title: 'Standard fictional payment plan', allocations: ROWS,
      createdAt: expect.any(String), createdBy: alice.principalId, state: 'draft',
    }]);
    const before = w.snapshot();
    const rows = await list(w.api);
    expect(rows).toMatchObject({ total: 1, items: [{ id: created.id, state: 'draft' }] });
    expect(await detail(w.api, created.id)).toEqual(created);
    expect(w.snapshot()).toBe(before);
  });

  it('the same authorized create key returns the exact original snapshot and never another draft', async () => {
    const w = env();
    const first = await create(w.api);
    const before = w.snapshot();
    expect(await create(w.api)).toEqual(first);
    expect(w.snapshot()).toBe(before);
    expect((await list(w.api)).total).toBe(1);
    expect(await denied(create(w.api, KEY1, PROJECT, 'Changed title'))).toMatchObject({
      status: 409, code: 'idempotency_key_reused', changed: false,
    });
    expect(w.snapshot()).toBe(before);
    const second = await create(w.api, KEY2);
    expect(second.id).not.toBe(first.id);
    expect((await list(w.api)).total).toBe(2);
  });

  it('different principals, hidden and unknown IDs cannot discover drafts or revisions', async () => {
    const w = env();
    const first = await create(w.api);
    const before = w.snapshot();
    w.as(bob.id);
    const hidden = await denied(detail(w.api, first.id));
    const unknown = await denied(detail(w.api, 'pt_888888'));
    expect(hidden).toEqual(unknown);
    expect(hidden).toMatchObject({ status: 404, code: 'not_found', changed: false });
    expect(await list(w.api)).toEqual({ items: [], total: 0 });
    expect(await denied(revise(w.api, first.id, KEY2, 1, 'Wrong-owner edit'))).toEqual(hidden);
    expect(await denied(create(w.api, KEY1))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    expect(w.snapshot()).toBe(before);
    w.as(VIEWER);
    expect(await denied(detail(w.api, first.id))).toMatchObject({ status: 403, changed: false });
    expect(w.snapshot()).toBe(before);
  });

  it('versions are appended; stale editors and key collisions do not alter previous snapshots', async () => {
    const w = env();
    const first = await create(w.api);
    const v2 = await revise(w.api, first.id, KEY2, 1, 'Second draft revision');
    expect(v2.currentVersion).toBe(2);
    expect(v2.versions[0]).toEqual(first.versions[0]);
    expect(v2.versions[1]).toMatchObject({ version: 2, title: 'Second draft revision', state: 'draft' });
    const v3 = await revise(w.api, first.id, KEY3, 2, 'Third draft revision');
    expect(v3.currentVersion).toBe(3);
    const before = w.snapshot();
    expect(await revise(w.api, first.id, KEY2, 1, 'Second draft revision')).toEqual(v2);
    expect(w.snapshot()).toBe(before);
    expect(await denied(revise(w.api, first.id, 'fresh-version-key-04', 1, 'Stale revision'))).toMatchObject({ status: 409, changed: false });
    expect(await denied(revise(w.api, first.id, KEY2, 1, 'Different draft revision'))).toMatchObject({ status: 409, changed: false });
    expect(w.snapshot()).toBe(before);
    expect((await detail(w.api, first.id)).versions[0]).toEqual(first.versions[0]);
  });

  it('all invalid data is refused before any ID, version or key is consumed', async () => {
    const w = env();
    const before = w.snapshot();
    const bad: unknown[] = [
      null, [null],
      [{ kind: 'down_payment', shareBps: 10001 }],
      [{ kind: 'down_payment', shareBps: 9900 }],
      [{ kind: 'instalments', shareBps: 10000, count: 99 }],
      [{ kind: 'construction_linked', shareBps: 10000, milestoneKey: '../x' }],
    ];
    for (const lines of bad) {
      expect(await denied(create(w.api, KEY1, PROJECT, 'Valid draft name', lines))).toMatchObject({ status: 422, changed: false });
      expect(w.snapshot()).toBe(before);
    }
    const created = await create(w.api);
    expect(created.id).toBe('pt_000001');
    expect(await denied(revise(w.api, created.id, KEY2, 99, 'Invalid previous version'))).toMatchObject({ status: 409, changed: false });
  });

  it('project filter and scope narrowing hide existing projects and their draft totals immediately', async () => {
    const w = env();
    await create(w.api, KEY1, PROJECT);
    const other = await create(w.api, KEY2, 'prj_gardens');
    expect((await list(w.api)).total).toBe(2);
    const before = w.snapshot();
    w.as(alice.id, PROJECT);
    expect(await list(w.api)).toMatchObject({ total: 1 });
    expect(await denied(detail(w.api, other.id))).toEqual(await denied(detail(w.api, 'pt_999999')));
    expect(await denied(revise(w.api, other.id, KEY3, 1, 'Invisible revision'))).toMatchObject({ status: 404 });
    expect(w.snapshot()).toBe(before);
  });
});
