import { ApiError, type BatchDetail, type CreditNote, type DuesHome, type EffectiveAccess, type FlatDetail, type InvoiceDetail, type InvoiceList, type OfficeCashRecorded, type PaymentDetail, type Permission, type Persona, type VoucherDetail } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { DemoStore } from '../demo-store';
import { HANDLERS, type Handler } from '../handlers';
import { MockTransport } from '../mock-transport';
import { effectiveAccessFor } from '../tenant-directory';
import { SOCIETY_SECTION, type SocietyState } from './state';

/**
 * GitHub Issue #21: request-bound idempotency for `POST /billing/invoices/:invoiceId/credit-notes`
 * (Al-Noor Residency, demo date 26 October 2026), through the fail-closed mock API.
 *
 * A request key is bound to the operation (`credit_note.create`), the person, the invoice in its scope
 * (organisation, legal entity, site, billing account, invoice) and the request (reason, lines and
 * amounts, normalised). The same authorised key with the same request answers with the credit note it
 * issued, with nothing changed; any other use of the key is one 409 that names nothing; a person who
 * lost the right or the scope gets the refusal anybody else gets. A refused request binds nothing and
 * uses no number. Without a key every Issue #19 rule runs exactly as before. "Unchanged" = the
 * society's whole store as JSON is byte-identical before and after.
 */
const SABA = 'alnoor_accounts';
const AYESHA = 'alnoor_treasurer';
const IMRAN = 'alnoor_manager';
const KAMRAN = 'alnoor_resident_a101';
const SANA = 'alnoor_tenant_a102';
const SITE = '/sites/site_alnoor';
const A101 = 'ba_anr_a101';
const REASON = 'Demo correction';
const KEY_REUSED = { status: 409, code: 'idempotency_key_reused', messageKey: 'finance:problems.idempotencyKeyReused', errors: {} };

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

type Rule = (a: EffectiveAccess) => EffectiveAccess;
/** Test-only access changes, applied to the named people from the next request on. */
const grant = (...add: Permission[]): Rule => (a) => ({ ...a, permissions: [...a.permissions, ...add] });
const withdraw = (p: Permission): Rule => (a) => ({ ...a, permissions: a.permissions.filter((x) => x !== p) });
const anotherEntity: Rule = (a) => ({ ...a, scopes: [{ type: 'legal_entity', ids: ['le_elsewhere'] }] });
const siteUnlicensed: Rule = (a) => ({ ...a, grants: a.grants.map((g) => (g.module === 'receivables' ? { ...g, sites: ['site_elsewhere'] } : g)) });
const suspended: Rule = (a) => ({ ...a, tenant: { ...a.tenant, status: 'suspended' } });
const notYetInForce: Rule = (a) => ({ ...a, grants: a.grants.map((g) => (g.module === 'receivables' ? { ...g, from: '2026-11-01' } : g)) });
const both = (...rules: Rule[]): Rule => (a) => rules.reduce((x, r) => r(x), a);

function session() {
  const demo = new DemoStore(memory());
  let personaId: string | null = SABA;
  const rules: Record<string, Rule> = {};
  const accessFor = (p: Persona) => {
    const a = effectiveAccessFor(p);
    const r = rules[p.id];
    return a && r ? r(a) : a;
  };
  const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo, accessFor });
  const ready = new MockTransport({ getContext: () => ({ personaId: IMRAN, projectId: 'all' }), getMode: () => 'fast', demo }).request({ method: 'POST', path: '/society/demo', body: { mode: 'collecting' } });
  const api = {
    rules,
    as(id: string | null) {
      personaId = id;
      return api;
    },
    get: async <T>(path: string) => (await ready, t.request<T>({ method: 'GET', path })),
    post: async <T>(path: string, body: unknown = {}, key?: string) => (await ready, t.request<T>({ method: 'POST', path, body, ...(key ? { idempotencyKey: key } : {}) })),
    patch: async <T>(path: string, body: unknown = {}) => (await ready, t.request<T>({ method: 'PATCH', path, body })),
    /** Another server on the same society (white-box: other endpoint code, same store). */
    transport: (handlers: readonly Handler[], persona: string) => new MockTransport({ getContext: () => ({ personaId: persona, projectId: 'all' }), getMode: () => 'fast', demo, handlers }),
    state: () =>
      demo.partition('tnt_alnoor').section<SocietyState>(SOCIETY_SECTION, () => {
        throw new Error('society state not created yet');
      }),
    snapshot: () => JSON.stringify(api.state()),
  };
  return api;
}
type Api = ReturnType<typeof session>;

const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return { status: e.problem.status, code: e.problem.code, messageKey: e.problem.messageKey, errors: e.problem.errors ?? {} };
    throw e;
  }
  throw new Error('expected a refusal');
};

/** A refusal that changes nothing: the society's stores are byte-identical before and after. */
async function refusedUnchanged(s: Api, request: () => Promise<unknown>) {
  const before = s.snapshot();
  const r = await refusal(request());
  expect(s.snapshot()).toBe(before);
  return r;
}

/** Office cash recorded by Saba and counted by Ayesha (D-46): the payment. */
async function officeCash(s: Api, amount: string) {
  await s.as(AYESHA).patch(`${SITE}/payment-methods`, { method: 'office_cash', enabled: true });
  const payer = (await s.as(SABA).get<FlatDetail>(`${SITE}/units/unt_anr_a101`)).currentPayer!;
  const recorded = await s.post<OfficeCashRecorded>('/payments/office', { accountId: A101, payerPartyId: payer.partyId, amount, idempotencyKey: `cn21-cash-${amount}` }, `cn21-cash-${amount}`);
  const confirmed = await s.as(AYESHA).post<BatchDetail>(`/office-collections/${recorded.batch.id}/confirm`, { countedCash: amount });
  const outcome = confirmed.batch.lines[0]!.outcome;
  if (outcome?.kind !== 'payment') throw new Error('expected a payment');
  return s.as(SABA).get<PaymentDetail>(`/payments/${outcome.paymentId}`);
}

/** A-101's November bill after 3,000 office cash: maintenance billed 3,000, paid 2,000, so 1,000.00 open. */
async function oneThousandOpen() {
  const s = session();
  const invoiceId = (await s.as(KAMRAN).get<DuesHome>('/portal/dues/home')).position.current!.invoiceId;
  const paid = await officeCash(s, '3000');
  const inv = await s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${invoiceId}`);
  const line = (category: string) => inv.invoice.lines.find((l) => l.category === category)!;
  const path = `/billing/invoices/${invoiceId}/credit-notes`;
  /** Ayesha (credit_note.create) unless another person is named. */
  const post = (body: unknown, key?: string, persona = AYESHA) => s.as(persona).post<CreditNote>(path, body, key);
  const read = () => s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${invoiceId}`);
  const open = (d: InvoiceDetail, id: string) => d.creditable.find((c) => c.lineId === id)!.open.amount;
  const issued = () => s.state().audit.filter((a) => a.action === 'creditNoteIssued').length;
  return { s, invoiceId, paid, inv, path, post, read, open, issued, maintenance: line('maintenance'), security: line('security'), lift: line('lift'), water: line('water') };
}
const one = (lineId: string, amount: string, reason = REASON) => ({ reason, lines: [{ lineId, amount }] });
/** Nothing in an answer about any record: no credit note, number, line or amount. */
const NAMES_NOTHING = /crn_|ANR-CN|iln_|cin_|\d+\.\d\d/;

describe('GitHub Issue #21: the same key with the same request answers with the credit note it issued', () => {
  it('(1) same id, number and amounts; one credit note, one number, one audit entry; nothing changes, also when the request is written differently', async () => {
    const t = await oneThousandOpen();
    const first = await t.post(one(t.maintenance.id, '600.00'), 'cn21-k1');
    expect(first).toMatchObject({ id: 'crn_anr_0001', ref: 'ANR-CN-0001', invoiceId: t.invoiceId, amount: { amount: '600.00' } });
    const firstAsSent = JSON.stringify(first);
    const counters = JSON.stringify(t.s.state().counters);
    // The binding itself (white-box): this operation, this person, this invoice in its scope, this note.
    expect(t.s.state().finance.idempotency['cn21-k1']).toMatchObject({
      op: 'credit_note.create',
      principal: 'usr_anr_0002',
      target: `tnt_alnoor|${t.inv.invoice.legalEntityId}|site_alnoor|${A101}|${t.invoiceId}`,
      recordId: first.id,
    });
    const before = t.s.snapshot();
    // The identical request again (a network retry): the same note; no new number, audit entry or change.
    const again = await t.post(one(t.maintenance.id, '600.00'), 'cn21-k1');
    expect(JSON.stringify(again)).toBe(firstAsSent);
    expect(t.s.snapshot()).toBe(before);
    // The same request written differently: the amount as "600", "600.0", the number 600 or with spaces;
    // the reason with spaces around it; the key in the body (as the S.1 screens send it); an unknown field.
    const variants: Array<[string, unknown, string | undefined]> = [
      ['amount without decimals', one(t.maintenance.id, '600'), 'cn21-k1'],
      ['amount with one decimal', one(t.maintenance.id, '600.0'), 'cn21-k1'],
      ['amount as a number', { reason: REASON, lines: [{ lineId: t.maintenance.id, amount: 600 }] }, 'cn21-k1'],
      ['amount with spaces', one(t.maintenance.id, ' 600.00 '), 'cn21-k1'],
      ['reason with spaces around it', one(t.maintenance.id, '600.00', `  ${REASON}  `), 'cn21-k1'],
      ['the key in the body only', { ...one(t.maintenance.id, '600.00'), idempotencyKey: 'cn21-k1' }, undefined],
      ['the key in the body and the request', { ...one(t.maintenance.id, '600.00'), idempotencyKey: 'cn21-k1' }, 'cn21-k1'],
      ['an unknown field', { ...one(t.maintenance.id, '600.00'), note: 'not part of a credit note' }, 'cn21-k1'],
    ];
    for (const [name, body, key] of variants) {
      const r = await t.post(body, key);
      expect(JSON.stringify(r), name).toBe(firstAsSent);
      expect(t.s.snapshot(), name).toBe(before);
    }
    expect(t.s.state().creditNotes.map((c) => c.ref)).toEqual(['ANR-CN-0001']);
    expect(JSON.stringify(t.s.state().counters)).toBe(counters);
    expect(t.issued()).toBe(1);
    const after = await t.read();
    expect(after.creditNotes).toHaveLength(1);
    expect(t.open(after, t.maintenance.id)).toBe('400.00');
    expect(after.invoice.outstanding.amount).toBe('1600.00');
  });

  it('(1b) several lines: their order is not part of the request (one credit note is a set of per-line credits)', async () => {
    const t = await oneThousandOpen();
    const first = await t.post({ reason: REASON, lines: [{ lineId: t.maintenance.id, amount: '100' }, { lineId: t.security.id, amount: '200' }, { lineId: t.lift.id, amount: '' }] }, 'cn21-order');
    expect(first).toMatchObject({ ref: 'ANR-CN-0001', amount: { amount: '300.00' } });
    const before = t.s.snapshot();
    const reordered = await t.post({ reason: REASON, lines: [{ lineId: t.lift.id, amount: '0' }, { lineId: t.security.id, amount: '200.00' }, { lineId: t.maintenance.id, amount: '100.00' }] }, 'cn21-order');
    expect(reordered.id).toBe(first.id);
    expect(t.s.snapshot()).toBe(before);
    // Leaving the blank line out is a different request (the drawer sends what it sent the first time).
    expect(await refusedUnchanged(t.s, () => t.post({ reason: REASON, lines: [{ lineId: t.maintenance.id, amount: '100' }, { lineId: t.security.id, amount: '200' }] }, 'cn21-order'))).toEqual(KEY_REUSED);
  });
});

describe('GitHub Issue #21: the same key with anything else is one 409 that names nothing; nothing changes', () => {
  it('(2) another amount, reason, line, invoice, person or operation; a malformed body; a key from before Issue #18', async () => {
    const t = await oneThousandOpen();
    const first = await t.post(one(t.maintenance.id, '600.00'), 'cn21-k1');
    const sana = (await t.s.as(SANA).get<DuesHome>('/portal/dues/home')).position.current!.invoiceId;
    const a102 = (await t.s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${sana}`)).invoice;
    const a102Maintenance = a102.lines.find((l) => l.category === 'maintenance')!;
    const earlier = (await t.s.as(AYESHA).get<InvoiceList>('/billing/invoices')).items.find((i) => i.billingAccountId === A101 && i.id !== t.invoiceId)!;
    t.s.rules[SABA] = grant('credit_note.create'); // test-only: a second person who may issue credit notes
    const collisions: Array<[string, () => Promise<unknown>]> = [
      ['another amount', () => t.post(one(t.maintenance.id, '500.00'), 'cn21-k1')],
      ['another reason', () => t.post(one(t.maintenance.id, '600.00', 'Another correction'), 'cn21-k1')],
      ['another line', () => t.post(one(t.security.id, '600.00'), 'cn21-k1')],
      ['an extra line', () => t.post({ reason: REASON, lines: [{ lineId: t.maintenance.id, amount: '600.00' }, { lineId: t.security.id, amount: '100.00' }] }, 'cn21-k1')],
      ['no lines', () => t.post({ reason: REASON, lines: [] }, 'cn21-k1')],
      ["another invoice (A-102's bill)", () => t.s.as(AYESHA).post(`/billing/invoices/${sana}/credit-notes`, one(a102Maintenance.id, '600.00'), 'cn21-k1')],
      ["this invoice's line sent to another invoice", () => t.s.as(AYESHA).post(`/billing/invoices/${sana}/credit-notes`, one(t.maintenance.id, '600.00'), 'cn21-k1')],
      ["the same body to another invoice of the same account (A-101's earlier bill)", () => t.s.as(AYESHA).post(`/billing/invoices/${earlier.id}/credit-notes`, one(t.maintenance.id, '600.00'), 'cn21-k1')],
      ['another person (Saba, test-only right)', () => t.post(one(t.maintenance.id, '600.00'), 'cn21-k1', SABA)],
      ['the same line twice (Issue #19 shape)', () => t.post({ reason: REASON, lines: [{ lineId: t.maintenance.id, amount: '300.00' }, { lineId: t.maintenance.id, amount: '300.00' }] }, 'cn21-k1')],
      ['a malformed entry', () => t.post({ reason: REASON, lines: [null] }, 'cn21-k1')],
      ['lines that are not a list', () => t.post({ reason: REASON, lines: { [t.maintenance.id]: '600.00' } }, 'cn21-k1')],
    ];
    const answers: Array<[string, Awaited<ReturnType<typeof refusal>>]> = [];
    for (const [name, request] of collisions) answers.push([name, await refusedUnchanged(t.s, request)]);
    // Another operation with the key (the S.1 creates share the map): Saba's voucher with Ayesha's key,
    // and, by one person, a credit note's key on a voucher and a voucher's key on a credit note.
    const voucher = { accountId: 'cac_anr_petty', direction: 'payment', category: 'office_supplies', amount: '250', onDate: '2026-10-26', purpose: 'Printer paper for notices', counterparty: 'City Stationers', evidence: { name: 'stationery.jpg', kind: 'receipt', size: 1000 }, submit: false };
    answers.push(['a voucher with the credit note key', await refusedUnchanged(t.s, () => t.s.as(SABA).post('/finance/vouchers', { ...voucher, idempotencyKey: 'cn21-k1' }, 'cn21-k1'))]);
    const sabas = await t.post(one(t.security.id, '100.00'), 'cn21-saba', SABA);
    expect(sabas.createdBy).toBe('usr_anr_0004');
    answers.push(['one person: a voucher with her credit note key', await refusedUnchanged(t.s, () => t.s.as(SABA).post('/finance/vouchers', { ...voucher, idempotencyKey: 'cn21-saba' }, 'cn21-saba'))]);
    const v = await t.s.as(SABA).post<VoucherDetail>('/finance/vouchers', { ...voucher, idempotencyKey: 'cn21-voucher' }, 'cn21-voucher');
    expect(v.voucher.status).toBe('draft');
    answers.push(['one person: a credit note with her voucher key', await refusedUnchanged(t.s, () => t.post(one(t.lift.id, '100.00'), 'cn21-voucher', SABA))]);
    // A key stored before Issue #18 (an id alone) was never bound to a request: it replays nothing.
    t.s.state().finance.idempotency['cn21-legacy'] = first.id;
    answers.push(['a key from before Issue #18', await refusedUnchanged(t.s, () => t.post(one(t.maintenance.id, '600.00'), 'cn21-legacy'))]);
    for (const [name, r] of answers) expect(r, name).toEqual(KEY_REUSED);
    expect(JSON.stringify(answers.map(([, r]) => r))).not.toMatch(NAMES_NOTHING);
    // The binding is intact: the identical request still answers with the first note, and nothing else was issued.
    expect((await t.post(one(t.maintenance.id, '600.00'), 'cn21-k1')).id).toBe(first.id);
    expect(t.s.state().creditNotes.map((c) => c.ref)).toEqual(['ANR-CN-0001', 'ANR-CN-0002']);
    expect(t.issued()).toBe(2);
  });
});

describe('GitHub Issue #21: authority before the key; a lost right or scope never replays', () => {
  it('(3) right withdrawn, invoice out of scope, site no longer licensed, organisation suspended, access not yet in force: the refusal anybody gets; nothing changes; with access back, the same note', async () => {
    const t = await oneThousandOpen();
    const body = one(t.maintenance.id, '600.00');
    const first = await t.post(body, 'cn21-k1');
    const cases: Array<[string, Rule, number, string]> = [
      ['credit_note.create withdrawn', withdraw('credit_note.create'), 403, 'permission_missing'],
      ['scope narrowed to another legal entity', anotherEntity, 404, 'out_of_scope'],
      ["the site's receivables licence withdrawn", siteUnlicensed, 403, 'site_not_licensed'],
      ['organisation suspended', suspended, 403, 'tenant_suspended'],
      ['access pending (not yet in force)', notYetInForce, 403, 'module_not_licensed'],
    ];
    for (const [name, rule, status, code] of cases) {
      t.s.rules[AYESHA] = rule;
      // Saba with the right (test-only) and the same change: a stranger to this key.
      t.s.rules[SABA] = both(grant('credit_note.create'), rule);
      const replay = await refusedUnchanged(t.s, () => t.post(body, 'cn21-k1'));
      const noKey = await refusedUnchanged(t.s, () => t.post(body));
      const freshKey = await refusedUnchanged(t.s, () => t.post(body, 'cn21-fresh'));
      const neverIssued = await refusedUnchanged(t.s, () => t.s.as(AYESHA).post('/billing/invoices/cin_anr_9999/credit-notes', body, 'cn21-k1'));
      const stranger = await refusedUnchanged(t.s, () => t.post(body, 'cn21-k1', SABA));
      expect(replay, name).toMatchObject({ status, code });
      for (const r of [noKey, freshKey, neverIssued, stranger]) expect(r, name).toEqual(replay);
      expect(JSON.stringify(replay)).not.toMatch(NAMES_NOTHING);
    }
    // With the access back, the same key and request answer with the same note (the refusals changed nothing).
    delete t.s.rules[AYESHA];
    delete t.s.rules[SABA];
    const before = t.s.snapshot();
    expect((await t.post(body, 'cn21-k1')).id).toBe(first.id);
    expect(t.s.snapshot()).toBe(before);
    expect(t.s.state().creditNotes).toHaveLength(1);
  });

  it('(3b) white-box: the handler itself re-checks the right on this invoice before it looks at the key (a right withdrawn after the route gate)', async () => {
    const t = await oneThousandOpen();
    const body = one(t.maintenance.id, '600.00');
    const first = await t.post(body, 'cn21-k1');
    const isCreditNotePost = (h: Handler) => h.method === 'POST' && h.pattern.test('/billing/invoices/x/credit-notes');
    // The route gate sees Ayesha's full access; the handler sees it without credit_note.create.
    const late = HANDLERS.map((h) => (isCreditNotePost(h) ? { ...h, handle: (ctx: Parameters<Handler['handle']>[0]) => h.handle({ ...ctx, access: ctx.access && { ...ctx.access, permissions: ctx.access.permissions.filter((p) => p !== 'credit_note.create') } }) } : h));
    const server = t.s.transport(late, AYESHA);
    const replay = await refusedUnchanged(t.s, () => server.request({ method: 'POST', path: t.path, body, idempotencyKey: 'cn21-k1' }));
    const noKey = await refusedUnchanged(t.s, () => server.request({ method: 'POST', path: t.path, body }));
    expect(replay).toMatchObject({ status: 403, code: 'permission_missing' });
    expect(noKey).toEqual(replay);
    expect((await t.post(body, 'cn21-k1')).id).toBe(first.id);
  });

  it('(3d) white-box: the stored binding is checked in full and its record id is never trusted alone', async () => {
    const t = await oneThousandOpen();
    const body = one(t.maintenance.id, '600.00');
    const first = await t.post(body, 'cn21-k1');
    const sana = (await t.s.as(SANA).get<DuesHome>('/portal/dues/home')).position.current!.invoiceId;
    const a102 = (await t.s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${sana}`)).invoice;
    const other = await t.s.as(AYESHA).post<CreditNote>(`/billing/invoices/${sana}/credit-notes`, one(a102.lines[0]!.id, '100.00'), 'cn21-other');
    const binding = t.s.state().finance.idempotency['cn21-k1'] as { op: string; recordId: string };
    // Altered (never possible through the API): the binding names another invoice's credit note. The replay
    // reads the note again through this invoice, so it answers as for a note that does not exist, never with A-102's.
    binding.recordId = other.id;
    expect(await refusedUnchanged(t.s, () => t.post(body, 'cn21-k1'))).toMatchObject({ status: 404, code: 'not_found' });
    // Altered: the same key, person, target and request recorded for another operation: refused (the operation is bound).
    binding.recordId = first.id;
    binding.op = 'voucher.create';
    expect(await refusedUnchanged(t.s, () => t.post(body, 'cn21-k1'))).toEqual(KEY_REUSED);
    binding.op = 'credit_note.create';
    expect((await t.post(body, 'cn21-k1')).id).toBe(first.id);
  });

  it('(3c) no oracle: the key on an invoice never issued, from another organisation or from a resident answers exactly as without it', async () => {
    const t = await oneThousandOpen();
    const body = one(t.maintenance.id, '600.00');
    await t.post(body, 'cn21-k1');
    const never = (key?: string) => t.s.as(AYESHA).post('/billing/invoices/cin_anr_9999/credit-notes', body, key);
    const withKey = await refusedUnchanged(t.s, () => never('cn21-k1'));
    expect(withKey).toMatchObject({ status: 404, code: 'not_found' });
    expect(await refusedUnchanged(t.s, () => never('cn21-unused'))).toEqual(withKey);
    expect(await refusedUnchanged(t.s, () => never())).toEqual(withKey);
    for (const persona of [SABA, IMRAN, KAMRAN, 'society_admin', 'cedar_treasurer']) {
      const keyed = await refusedUnchanged(t.s, () => t.post(body, 'cn21-k1', persona));
      const plain = await refusedUnchanged(t.s, () => t.post(body, undefined, persona));
      const elsewhere = await refusedUnchanged(t.s, () => t.s.as(persona).post('/billing/invoices/cin_anr_9999/credit-notes', body, 'cn21-k1'));
      expect(keyed.status, persona).toBe(403);
      expect(plain, persona).toEqual(keyed);
      expect(elsewhere, persona).toEqual(keyed);
    }
    expect(t.s.state().creditNotes).toHaveLength(1);
  });
});

describe('GitHub Issue #21: a new key is a new decision; a refused request binds nothing', () => {
  it('(4) a fresh key with the same content is a second, separately numbered credit note while enough is open; past the cap it is refused (Issue #19) and its key stays unused', async () => {
    const t = await oneThousandOpen();
    const body = one(t.maintenance.id, '400.00');
    const a = await t.post(body, 'cn21-a');
    const b = await t.post(body, 'cn21-b');
    expect([a.ref, b.ref]).toEqual(['ANR-CN-0001', 'ANR-CN-0002']);
    expect(b.id).not.toBe(a.id);
    expect(t.open(await t.read(), t.maintenance.id)).toBe('200.00');
    const counters = JSON.stringify(t.s.state().counters);
    const over = await refusedUnchanged(t.s, () => t.post(body, 'cn21-c'));
    expect(over.errors).toEqual({ [`lines.${t.maintenance.id}`]: [{ code: 'billing:creditNote.problems.overOpen', params: { open: '200.00', unit: 'A-101' } }] });
    expect(t.s.state().finance.idempotency['cn21-c']).toBeUndefined();
    expect(JSON.stringify(t.s.state().counters)).toBe(counters);
    // The refused key is still unused: a valid request with it is a first use.
    const c = await t.post(one(t.maintenance.id, '200.00'), 'cn21-c');
    expect(c.ref).toBe('ANR-CN-0003');
    const end = await t.read();
    expect(t.open(end, t.maintenance.id)).toBe('0.00');
    expect(end.creditable.every((x) => Number(x.open.amount) >= 0)).toBe(true);
    expect(t.issued()).toBe(3);
  });

  it('(5) Issue #19 refusals with a key: the answer a keyless request gets, nothing changed, no number used, the key not bound; the key then works for a first valid request', async () => {
    const t = await oneThousandOpen();
    const sana = (await t.s.as(SANA).get<DuesHome>('/portal/dues/home')).position.current!.invoiceId;
    const foreignLine = (await t.s.as(AYESHA).get<InvoiceDetail>(`/billing/invoices/${sana}`)).invoice.lines[0]!.id;
    const refused: Array<[string, unknown]> = [
      ['the same line twice (600 + 600)', { reason: REASON, lines: [{ lineId: t.maintenance.id, amount: '600.00' }, { lineId: t.maintenance.id, amount: '600.00' }] }],
      ['the same line twice (1,000 + 0.01)', { reason: REASON, lines: [{ lineId: t.maintenance.id, amount: '1000.00' }, { lineId: t.maintenance.id, amount: '0.01' }] }],
      ["a line of A-102's bill", one(foreignLine, '100.00')],
      ['a line never issued', one('iln_0000000000000000', '100.00')],
      ['a malformed entry', { reason: REASON, lines: [{ lineId: t.security.id, amount: '100' }, null] }],
      ['lines that are not a list', { reason: REASON, lines: 'iln_0000000000000000' }],
      ['over the open amount', one(t.maintenance.id, '1000.01')],
      ['an invalid amount', one(t.maintenance.id, 'abc')],
      ['a reason too short', one(t.maintenance.id, '100.00', 'x')],
      ['no lines', { reason: REASON, lines: [] }],
    ];
    const counters = JSON.stringify(t.s.state().counters);
    const audit = t.s.state().audit.length;
    for (const [name, body] of refused) {
      const keyed = await refusedUnchanged(t.s, () => t.post(body, 'cn21-first'));
      const plain = await refusedUnchanged(t.s, () => t.post(body));
      expect(keyed.status, name).toBe(422);
      expect(keyed, name).toEqual(plain);
      // The same key again with the same refused body: refused again the same way (nothing was bound).
      expect(await refusedUnchanged(t.s, () => t.post(body, 'cn21-first')), name).toEqual(keyed);
      expect(t.s.state().finance.idempotency['cn21-first'], name).toBeUndefined();
    }
    expect(JSON.stringify(t.s.state().counters)).toBe(counters);
    expect(t.s.state().audit.length).toBe(audit);
    expect(t.s.state().creditNotes).toEqual([]);
    // The key's first valid use: the first number.
    const cn = await t.post(one(t.maintenance.id, '600.00'), 'cn21-first');
    expect(cn.ref).toBe('ANR-CN-0001');
    expect((await t.post(one(t.maintenance.id, '600.00'), 'cn21-first')).id).toBe(cn.id);
    // Now bound: the earlier refused body with that key is another request (409, before any body check).
    expect(await refusedUnchanged(t.s, () => t.post(refused[0]![1], 'cn21-first'))).toEqual(KEY_REUSED);
    expect(t.issued()).toBe(1);
  });

  it('(6) without a key: exactly as before; a repeat that fits is a separate credit note, the cap still refuses, and no key is stored', async () => {
    const t = await oneThousandOpen();
    const keys = Object.keys(t.s.state().finance.idempotency).sort();
    const body = one(t.maintenance.id, '300.00');
    const refs = [];
    for (let i = 0; i < 3; i++) refs.push((await t.post(body)).ref);
    expect(refs).toEqual(['ANR-CN-0001', 'ANR-CN-0002', 'ANR-CN-0003']);
    const over = await refusedUnchanged(t.s, () => t.post(body));
    expect(over.errors).toEqual({ [`lines.${t.maintenance.id}`]: [{ code: 'billing:creditNote.problems.overOpen', params: { open: '100.00', unit: 'A-101' } }] });
    expect(Object.keys(t.s.state().finance.idempotency).sort()).toEqual(keys);
    expect(t.issued()).toBe(3);
    const end = await t.read();
    expect(t.open(end, t.maintenance.id)).toBe('100.00');
    expect(end.invoice.outstanding.amount).toBe('1300.00');
  });
});

describe('GitHub Issue #21: after the open amount changed', () => {
  it('(7) the same key and request still answer with the note it issued, whether less or more is open now; a new request is checked against what is open', async () => {
    const t = await oneThousandOpen();
    const body = one(t.maintenance.id, '1000.00');
    const first = await t.post(body, 'cn21-all');
    expect(t.open(await t.read(), t.maintenance.id)).toBe('0.00');
    // Less open now (0.00): the replay is the earlier result, not a second check of the cap.
    const before = t.s.snapshot();
    expect((await t.post(body, 'cn21-all')).id).toBe(first.id);
    expect(t.s.snapshot()).toBe(before);
    const capped = { [`lines.${t.maintenance.id}`]: [{ code: 'billing:creditNote.problems.overOpen', params: { open: '0.00', unit: 'A-101' } }] };
    expect((await refusedUnchanged(t.s, () => t.post(body, 'cn21-new'))).errors).toEqual(capped);
    expect((await refusedUnchanged(t.s, () => t.post(body))).errors).toEqual(capped);
    // Only for the same authorised person: anybody else with the key is refused.
    t.s.rules[SABA] = grant('credit_note.create');
    expect(await refusedUnchanged(t.s, () => t.post(body, 'cn21-all', SABA))).toEqual(KEY_REUSED);
    // More open now: the payment is reversed (maintenance open 3,000 − 0 − 1,000 = 2,000). The same key and
    // request are still the first note, never a second one.
    const asked = await t.s.as(SABA).post<{ approvalId: string }>(`/payments/${t.paid.payment.id}/reversal-request`, { reason: 'Recorded against the wrong flat by mistake' });
    await t.s.as(AYESHA).post(`/approvals/${asked.approvalId}/decide`, { decision: 'approve', reason: 'Checked against the cash book.' });
    expect(t.open(await t.read(), t.maintenance.id)).toBe('2000.00');
    const reopened = t.s.snapshot();
    expect((await t.post(body, 'cn21-all')).id).toBe(first.id);
    expect(t.s.snapshot()).toBe(reopened);
    expect(t.s.state().creditNotes).toHaveLength(1);
    // A new request (fresh key) may now credit what is open again.
    expect((await t.post(body, 'cn21-after-reversal')).ref).toBe('ANR-CN-0002');
    expect(t.open(await t.read(), t.maintenance.id)).toBe('1000.00');
  });
});
