import { describe, expect, it } from 'vitest';
import type { Persona, PricingApprovalDraft, PricingApprovalDraftList, PricingApprovalRule } from '@repo/contracts';
import { DemoStore } from '../../demo-store';
import { MockTransport } from '../../mock-transport';
import { ALL_PERSONAS, findPersona } from '../../people';

const manager = findPersona('manager')!;
const author: Persona = { ...manager, id: 'e3_approval_author', principalId: 'usr_e3_approval_author', permissions: [...manager.permissions, 'pricing.manage'] };
const outsider: Persona = { ...author, id: 'e3_approval_outsider', principalId: 'usr_e3_approval_outsider' };
const scoped: Persona = { ...author, id: 'e3_approval_scoped', principalId: 'usr_e3_approval_scoped', projectScope: ['prj_heights'] };
const RULES: PricingApprovalRule[] = [
  { subject: 'unit_price_change', threshold: { amount: '0.00', currency: 'PKR' }, requiredReviewers: 2, makerCheckerRequired: true, allowSelfApproval: false },
  { subject: 'discount_exception', threshold: { amount: '3000.25', currency: 'PKR' }, requiredReviewers: 3, makerCheckerRequired: true, allowSelfApproval: false },
];
const KA = 'approval-create-key-001', KB = 'approval-revise-key-002', KC = 'approval-revise-key-003';
function world() {
  const memory = new Map<string, string>();
  const demo = new DemoStore({
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
    removeItem: (key) => void memory.delete(key),
  });
  const current = { personaId: author.id, projectId: 'all' };
  const api = new MockTransport({
    getContext: () => ({ ...current }), getMode: () => 'fast', demo,
    personas: [...ALL_PERSONAS, author, outsider, scoped],
  });
  return {
    api,
    as(personaId: string, projectId = 'all') { current.personaId = personaId; current.projectId = projectId; return api; },
    snapshot() { demo.save(); return JSON.stringify([...memory.entries()].sort()); },
  };
}
const create = (api: MockTransport, key = KA, projectId = 'prj_heights', rules: unknown = RULES, title = 'Illustrative maker checker rules') =>
  api.request<PricingApprovalDraft>({
    method: 'POST', path: '/pricing/approval-rules', idempotencyKey: key,
    body: { projectId, title, rules, idempotencyKey: key },
  });
const revise = (api: MockTransport, id: string, key: string, expectedVersion: number, rules: unknown = RULES, title = 'Updated review draft') =>
  api.request<PricingApprovalDraft>({
    method: 'POST', path: `/pricing/approval-rules/${id}/versions`, idempotencyKey: key,
    body: { title, expectedVersion, rules, idempotencyKey: key },
  });
const read = (api: MockTransport, id: string) =>
  api.request<PricingApprovalDraft>({ method: 'GET', path: `/pricing/approval-rules/${id}` });
const list = (api: MockTransport) =>
  api.request<PricingApprovalDraftList>({ method: 'GET', path: '/pricing/approval-rules' });
async function refused(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    const problem = (error as Error & { problem: { status: number; changed: boolean; code: string; correlationId?: string } }).problem;
    const { correlationId: _discard, ...safe } = problem;
    return safe;
  }
  throw Error('Expected refusal');
}

describe('E.3 COM-005 non-effective maker-checker configuration drafts', () => {
  it('creates private draft, all rules require checker, none can authorize transactions', async () => {
    const w = world();
    const created = await create(w.api);
    expect(created).toMatchObject({
      projectId: 'prj_heights', creatorPrincipalId: author.principalId, state: 'draft',
      effective: false, activationAllowed: false, approvesTransactions: false, currentVersion: 1,
    });
    expect(created.versions).toHaveLength(1);
    expect(created.versions[0]?.rules.every((r) => r.makerCheckerRequired && !r.allowSelfApproval)).toBe(true);
    expect(created.versions[0]?.rules.some((r) => r.threshold.amount === '0.00')).toBe(true);
    const before = w.snapshot();
    expect(await read(w.api, created.id)).toEqual(created);
    expect(await list(w.api)).toMatchObject({ total: 1, items: [{ id: created.id, state: 'draft' }] });
    expect(w.snapshot()).toBe(before);
  });

  it('refuses self-approval, missing maker-checker, duplicate subjects and invalid threshold without consuming an ID or key', async () => {
    const w = world();
    const before = w.snapshot();
    const bad: unknown[] = [
      [{ ...RULES[0]!, allowSelfApproval: true }],
      [{ ...RULES[0]!, makerCheckerRequired: false }],
      [{ ...RULES[0]!, requiredReviewers: 0 }],
      [{ ...RULES[0]!, requiredReviewers: 4 }],
      [RULES[0], RULES[0]],
      [{ ...RULES[0]!, threshold: { amount: '-1.00', currency: 'PKR' } }],
      [{ ...RULES[0]!, threshold: { amount: '1.001', currency: 'PKR' } }],
      [{ ...RULES[0]!, threshold: { amount: '1.00', currency: 'USD' } }],
      [{ ...RULES[0]!, secret: 'untrusted' }],
      [null],
      [],
    ];
    for (const rules of bad) {
      expect(await refused(create(w.api, KA, 'prj_heights', rules))).toMatchObject({ status: 422, changed: false });
      expect(w.snapshot()).toBe(before);
    }
    expect((await create(w.api)).id).toBe('pad_000001');
  });

  it('replays an identical request, refuses altered payload/cross-actor reuse without touching store', async () => {
    const w = world();
    const first = await create(w.api);
    const before = w.snapshot();
    expect(await create(w.api)).toEqual(first);
    expect(w.snapshot()).toBe(before);
    expect(await refused(create(w.api, KA, 'prj_heights', RULES, 'Changed draft name'))).toMatchObject({ status: 409, changed: false });
    w.as(outsider.id);
    expect(await refused(create(w.api))).toMatchObject({ status: 409, changed: false });
    expect(w.snapshot()).toBe(before);
    w.as(author.id);
    const other = await create(w.api, KB);
    expect(other.id).not.toBe(first.id);
  });

  it('hides another creator and unknown IDs identically on GET and version creation', async () => {
    const w = world();
    const draft = await create(w.api);
    const before = w.snapshot();
    w.as(outsider.id);
    const hidden = await refused(read(w.api, draft.id));
    const missing = await refused(read(w.api, 'pad_999999'));
    expect(hidden).toEqual(missing);
    expect(hidden).toMatchObject({ status: 404, code: 'not_found', changed: false });
    expect(await refused(revise(w.api, draft.id, KB, 1))).toEqual(hidden);
    expect(await list(w.api)).toEqual({ items: [], total: 0 });
    expect(w.snapshot()).toBe(before);
    w.as('sales');
    expect(await refused(read(w.api, draft.id))).toMatchObject({ status: 403, changed: false });
  });

  it('appends immutable versions and refuses stale or altered-key revisions', async () => {
    const w = world();
    const original = await create(w.api);
    const second = await revise(w.api, original.id, KB, 1);
    expect(second.currentVersion).toBe(2);
    expect(second.versions[0]).toEqual(original.versions[0]);
    const third = await revise(w.api, original.id, KC, 2, RULES, 'Third review draft');
    expect(third.currentVersion).toBe(3);
    const before = w.snapshot();
    expect(await revise(w.api, original.id, KB, 1)).toEqual(second);
    expect(w.snapshot()).toBe(before);
    expect(await refused(revise(w.api, original.id, 'approval-fresh-revise-004', 1))).toMatchObject({ status: 409, changed: false });
    expect(await refused(revise(w.api, original.id, KB, 1, RULES, 'Altered revision'))).toMatchObject({ status: 409, changed: false });
    expect(w.snapshot()).toBe(before);
  });

  it('project narrowing hides both list totals and detailed drafts immediately', async () => {
    const w = world();
    const first = await create(w.api);
    const second = await create(w.api, KB, 'prj_gardens');
    expect((await list(w.api)).total).toBe(2);
    const before = w.snapshot();
    w.as(author.id, 'prj_heights');
    expect((await list(w.api)).total).toBe(1);
    expect(await refused(read(w.api, second.id))).toEqual(await refused(read(w.api, 'pad_unknown')));
    expect(await refused(revise(w.api, second.id, KC, 1))).toMatchObject({ status: 404, changed: false });
    expect((await read(w.api, first.id)).id).toBe(first.id);
    expect(w.snapshot()).toBe(before);
  });

  it('ordinary staff permissions remain unchanged', () => {
    expect(ALL_PERSONAS.every((p) => !p.permissions.includes('pricing.manage'))).toBe(true);
  });
});
