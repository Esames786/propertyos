import { ApiError, type BillingAccountRow, type BillingRunDetail, type ChargeRule, type CreditNote, type Exemption, type FlatDetail, type ImportCommitResult, type ImportPreview, type InvoiceDetail, type InvoiceList, type OpeningBalanceBatch, type PersonRow, type PostResult, type SocietyDashboard, type Statement } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { DemoStore } from '../demo-store';
import { MockTransport } from '../mock-transport';
import { findPersona } from '../people';

/**
 * Gate C.1 through the fail-closed mock API, person by person (A7 §C.3 storyline 1–7): every rule
 * the UI shows is enforced here, on the server, by principal and by record.
 */
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

/** One browser session (one demo store) in which people sign in and out. */
function session() {
  const demo = new DemoStore(memory());
  let personaId: string | null = 'alnoor_manager';
  const t = new MockTransport({ getContext: () => ({ personaId, projectId: 'all' }), getMode: () => 'fast', demo });
  return {
    as(id: string | null) {
      personaId = id;
      return this;
    },
    get: <T>(path: string, query?: Record<string, string>) => t.request<T>({ method: 'GET', path, ...(query ? { query } : {}) }),
    post: <T>(path: string, body: unknown = {}) => t.request<T>({ method: 'POST', path, body }),
    patch: <T>(path: string, body: unknown = {}) => t.request<T>({ method: 'PATCH', path, body }),
  };
}

const problem = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e.problem;
    throw e;
  }
  throw new Error('expected a refusal');
};

const SITE = '/sites/site_alnoor';

describe('Gate C.1 storyline through the mock API', () => {
  it('fresh society: import → opening balances → charges → November run → posted → credit note', async () => {
    const s = session();
    await s.post('/society/demo', { mode: 'fresh' });
    expect((await s.get<{ flats: number }[]>('/sites'))[0]!.flats).toBe(0);

    // 2. Import the flat register: 3 errors and 2 duplicates are reported; commit is all-or-nothing.
    let imp = await s.post<ImportPreview>(`${SITE}/flat-imports`, { sample: true });
    expect(imp.counts).toEqual({ rows: 82, valid: 77, errors: 3, duplicates: 2, existing: 0 });
    expect(await problem(s.post(`${SITE}/flat-imports/${imp.importId}/commit`, { acknowledgeDuplicates: true }))).toMatchObject({ status: 422, code: 'import_has_errors' });
    const a305 = imp.rows.find((r) => r.values.flat === 'A-305')!;
    imp = await s.patch<ImportPreview>(`${SITE}/flat-imports/${imp.importId}/rows/${a305.line}`, { values: { type: 'Standard' } });
    expect(imp.counts.errors).toBe(2);
    imp = await s.post<ImportPreview>(`${SITE}/flat-imports/${imp.importId}/suggestions`);
    expect(imp.counts).toMatchObject({ valid: 80, errors: 0, duplicates: 2 });
    expect(await problem(s.post(`${SITE}/flat-imports/${imp.importId}/commit`))).toMatchObject({ status: 422, code: 'import_has_duplicates' });
    expect(await s.post<ImportCommitResult>(`${SITE}/flat-imports/${imp.importId}/commit`, { acknowledgeDuplicates: true })).toEqual({ created: 80, unchanged: 0, alreadyCommitted: false });
    // Re-running the same file creates nothing.
    const again = await s.post<ImportPreview>(`${SITE}/flat-imports`, { sample: true });
    expect(again).toMatchObject({ alreadyCommitted: true, canCommit: false, counts: { valid: 0, existing: 82 } });
    expect(await s.post<ImportCommitResult>(`${SITE}/flat-imports/${again.importId}/commit`, { acknowledgeDuplicates: true })).toMatchObject({ created: 0 });
    expect((await s.get<{ flats: number }[]>('/sites'))[0]!.flats).toBe(80);

    // 3. People and payers: A-102 shows owner, occupant and payer as separate facts.
    const a102 = await s.get<FlatDetail>(`${SITE}/units/unt_anr_a102`);
    expect([a102.owners[0]!.partyName, a102.occupants[0]!.partyName, a102.currentPayer!.partyName]).toEqual(['Tariq Mehmood', 'Sana Iqbal', 'Sana Iqbal']);
    expect(a102.payers.map((p) => [p.partyName, p.from, p.to ?? null])).toEqual([['Sana Iqbal', '2026-03-01', null], ['Tariq Mehmood', '2019-06-01', '2026-03-01']]);

    // 4. Opening balances: imported by the manager, approved by the treasurer (never by the importer).
    const ob = await s.post<ImportPreview>(`${SITE}/opening-imports`, { sample: true });
    expect(ob).toMatchObject({ counts: { valid: 10, errors: 0 }, total: { amount: '49100.00' } });
    const batch = await s.post<OpeningBalanceBatch>(`${SITE}/opening-imports/${ob.importId}/submit`);
    expect(batch.state).toBe('pending_approval');
    expect(await problem(s.post(`/opening-balances/${batch.id}/approve`))).toMatchObject({ status: 403 });
    s.as('alnoor_treasurer');
    expect((await s.post<OpeningBalanceBatch>(`/opening-balances/${batch.id}/approve`)).state).toBe('approved');
    expect((await s.get<BillingAccountRow[]>('/billing-accounts', { q: 'A-101' }))[0]!.balance.amount).toBe('1000.00');

    // 5. Charges: site defaults → penthouse override → A-108 exemption approved by the treasurer.
    s.as('alnoor_manager');
    await s.post<ChargeRule[]>('/charges/defaults', { amounts: { maintenance: '3000', security: '500', lift: '300', water: '400' } });
    await s.post<ChargeRule>('/charges/rules', { category: 'maintenance', scope: { level: 'unit_type', id: 'utp_anr_penthouse' }, amount: '4500' });
    const which = await s.get<{ lines: Array<{ category: string; amount: { amount: string }; winner: { scopeName: string }; overridden: Array<{ scopeName: string }> }> }>('/charges/resolve', { flat: 'unt_anr_a501', period: '2026-11' });
    expect(which.lines[0]).toMatchObject({ category: 'maintenance', amount: { amount: '4500.00' }, winner: { scopeName: 'Penthouse' }, overridden: [{ scopeName: 'Al-Noor Residency' }] });
    const ex = await s.post<Exemption>('/exemptions', { flatId: 'unt_anr_a108', categories: 'all', percent: 100, reason: 'Association office' });
    expect(await problem(s.post(`/exemptions/${ex.id}/approve`))).toMatchObject({ status: 403 });
    s.as('alnoor_treasurer');
    expect((await s.post<Exemption>(`/exemptions/${ex.id}/approve`)).state).toBe('approved');

    // 6. November run: create → one open run per period → preview → stale preview blocks submit.
    s.as('alnoor_manager');
    let run = await s.post<BillingRunDetail>('/billing-runs', { period: '2026-11' });
    const id = run.run.id;
    expect(await problem(s.post('/billing-runs', { period: '2026-11' }))).toMatchObject({ status: 409, code: 'duplicate_period' });
    run = await s.post<BillingRunDetail>(`/billing-runs/${id}/preview`);
    expect(run.run.totals).toMatchObject({ invoices: 79, flats: 79, exempt: 1, amount: { amount: '355800.00' } });
    const water = (await s.get<{ rules: ChargeRule[] }>('/charges/rules')).rules.find((r) => r.category === 'water')!;
    await s.post(`/charges/rules/${water.ruleId}/versions`, { amount: '450', from: '2026-11' });
    expect((await s.get<BillingRunDetail>(`/billing-runs/${id}`)).run.stale).toBe(true);
    expect(await problem(s.post(`/billing-runs/${id}/submit`))).toMatchObject({ status: 409, code: 'stale_preview' });
    await s.post(`/charges/rules/${water.ruleId}/versions`, { amount: '400', from: '2026-11' });
    run = await s.post<BillingRunDetail>(`/billing-runs/${id}/preview`);
    expect(run.run.totals!.amount.amount).toBe('355800.00');
    run = await s.post<BillingRunDetail>(`/billing-runs/${id}/submit`);
    expect(run.run.state).toBe('APPROVAL_PENDING');

    // The building manager cannot approve their own run.
    expect(run.actions.approve).toEqual({ allowed: false, reason: 'maker_checker_required' });
    expect(await problem(s.post(`/billing-runs/${id}/approve`))).toMatchObject({ status: 403 });

    s.as('alnoor_treasurer');
    run = await s.post<BillingRunDetail>(`/billing-runs/${id}/approve`);
    expect(run.run).toMatchObject({ state: 'APPROVED', approvedByName: 'Ayesha Malik' });

    // Post twice (a double click) and retry: still 79 invoices, PKR 355,800.
    const [first, second] = await Promise.all([s.post<PostResult>(`/billing-runs/${id}/post`), s.post<PostResult>(`/billing-runs/${id}/post`)]);
    const retry = await s.post<PostResult>(`/billing-runs/${id}/post`);
    expect(first.invoiceIds).toHaveLength(79);
    expect(second.invoiceIds).toEqual(first.invoiceIds);
    expect(retry).toMatchObject({ replayed: true, invoiceIds: first.invoiceIds });
    const nov = await s.get<InvoiceList>('/billing/invoices', { period: '2026-11', source: 'billing_run' });
    expect([nov.total, nov.totals.billed.amount]).toEqual([79, '355800.00']);
    expect((await s.post<BillingRunDetail>(`/billing-runs/${id}/notify`)).run).toMatchObject({ state: 'NOTIFIED', notified: { notices: 79 } });

    // A-101: November invoice 4,200; statement 1,000 + 4,200 = 5,200.
    const a101 = nov.items.find((i) => i.flats.includes('A-101'))!;
    expect(a101.total.amount).toBe('4200.00');
    const st = await s.get<Statement>(`/statements/${a101.billingAccountId}`);
    expect([st.previousBalance.amount, st.periodCharges.amount, st.closingBalance.amount]).toEqual(['1000.00', '4200.00', '5200.00']);

    // 7. A posted invoice is never edited; a credit note corrects it and the statement shows both.
    expect(await problem(s.patch(`/billing/invoices/${a101.id}`, { total: '0.00' }))).toMatchObject({ status: 409, code: 'state_locked' });
    const detail = await s.get<InvoiceDetail>(`/billing/invoices/${a101.id}`);
    expect(detail.actions).toEqual({ creditNote: true, edit: false });
    const water101 = detail.invoice.lines.find((l) => l.category === 'water')!;
    expect(await problem(s.post(`/billing/invoices/${a101.id}/credit-notes`, { reason: 'Water tank closed for repairs', lines: [{ lineId: water101.id, amount: '500' }] }))).toMatchObject({ status: 422 });
    const cn = await s.post<CreditNote>(`/billing/invoices/${a101.id}/credit-notes`, { reason: 'Water tank closed for repairs', lines: [{ lineId: water101.id, amount: '400' }] });
    expect(cn).toMatchObject({ ref: 'ANR-CN-0001', amount: { amount: '400.00' } });
    const after = await s.get<Statement>(`/statements/${a101.billingAccountId}`);
    expect(after.entries.map((e) => [e.kind, e.ref])).toEqual([['invoice', a101.ref], ['credit_note', 'ANR-CN-0001']]);
    expect(after.closingBalance.amount).toBe('4800.00');
    expect((await s.get<InvoiceDetail>(`/billing/invoices/${a101.id}`)).invoice).toMatchObject({ total: { amount: '4200.00' }, credited: { amount: '400.00' }, outstanding: { amount: '3800.00' } });
  });

  it('a payer change from next month leaves the October balance with the old payer (AC-3)', async () => {
    const s = session();
    const b204 = await s.get<FlatDetail>(`${SITE}/units/unt_anr_b204`);
    const tenant = b204.occupants[0]!;
    expect(await problem(s.post(`${SITE}/units/unt_anr_b204/payer`, { partyId: tenant.partyId, from: '2026-10-01' }))).toMatchObject({ status: 422 });
    await s.post(`${SITE}/units/unt_anr_b204/payer`, { partyId: tenant.partyId, from: '2026-11-01' });
    const october = await s.get<InvoiceList>('/billing/invoices', { flat: 'unt_anr_b204', source: 'opening_balance' });
    expect(october.items[0]!.payerName).toBe('Faisal Chaudhry');
    const run = await s.post<BillingRunDetail>('/billing-runs', { period: '2026-11' });
    const preview = await s.post<BillingRunDetail>(`/billing-runs/${run.run.id}/preview`);
    expect(preview.items.find((i) => i.unitCode === 'B-204')!.payerName).toBe('Hina Rana');
  });

  it('the dashboard leads to records, and says what waits for whom', async () => {
    const s = session();
    const d = await s.get<SocietyDashboard>('/society/dashboard');
    expect(d.occupancy).toMatchObject({ registered: 80, occupied: 76, ownerOccupied: 63, tenantOccupied: 12, vacant: 4, association: 1, declared: 80 });
    expect(d.arrears).toMatchObject({ accounts: 10, amount: { amount: '49100.00' } });
    expect(d.collected).toEqual({ later: 'C.2' });
    expect(d.tasks[0]).toMatchObject({ key: 'create_run', yours: true, href: '/backoffice/billing/runs/new' });
    const run = await s.post<BillingRunDetail>('/billing-runs', { period: '2026-11' });
    await s.post(`/billing-runs/${run.run.id}/preview`);
    await s.post(`/billing-runs/${run.run.id}/submit`);
    expect((await s.get<SocietyDashboard>('/society/dashboard')).tasks[0]).toMatchObject({ key: 'approve_run', yours: false });
    s.as('alnoor_treasurer');
    const t = await s.get<SocietyDashboard>('/society/dashboard');
    expect(t.approvals).toMatchObject({ count: 1, yours: 1 });
    expect(t.tasks[0]).toMatchObject({ key: 'approve_run', yours: true });
  });
});

describe('roles, scope and isolation (AC-15)', () => {
  it('the security guard reaches no billing, payers, people finance or statements', async () => {
    const s = session().as('alnoor_guard');
    for (const path of ['/society/dashboard', '/billing-runs', '/billing/invoices', '/billing-accounts', '/statements/ba_anr_a101', '/people', `${SITE}/roster`, `${SITE}/units/unt_anr_a101`, '/charges/rules', `${SITE}/opening-balances`]) {
      expect(await problem(s.get(path)), path).toMatchObject({ status: 403 });
    }
    expect(await problem(s.post('/billing-runs', { period: '2026-11' }))).toMatchObject({ status: 403 });
  });

  it('maker ≠ checker is decided by principal: a person holding both permissions still cannot approve their own run', async () => {
    const manager = findPersona('alnoor_manager')!;
    const both = { ...manager, permissions: [...manager.permissions, 'billing_run.approve' as const] };
    const t = new MockTransport({ getContext: () => ({ personaId: 'alnoor_manager', projectId: 'all' }), getMode: () => 'fast', demo: new DemoStore(memory()), personas: [both] });
    const run = await t.request<BillingRunDetail>({ method: 'POST', path: '/billing-runs', body: { period: '2026-11' } });
    await t.request({ method: 'POST', path: `/billing-runs/${run.run.id}/preview` });
    const submitted = await t.request<BillingRunDetail>({ method: 'POST', path: `/billing-runs/${run.run.id}/submit` });
    expect(submitted.actions.approve).toEqual({ allowed: false, reason: 'maker_checker_required' });
    expect(await problem(t.request({ method: 'POST', path: `/billing-runs/${run.run.id}/approve` }))).toMatchObject({ status: 403, code: 'maker_checker_required' });
  });

  it('the treasurer approves but does not prepare; the manager prepares but issues no credit notes', async () => {
    const s = session().as('alnoor_treasurer');
    expect(await problem(s.post('/billing-runs', { period: '2026-11' }))).toMatchObject({ status: 403, code: 'permission_missing' });
    expect(await problem(s.post('/charges/rules', { category: 'water', scope: { level: 'site' }, amount: '1' }))).toMatchObject({ status: 403 });
    s.as('alnoor_manager');
    const ob = await s.get<InvoiceList>('/billing/invoices');
    expect(await problem(s.post(`/billing/invoices/${ob.items[0]!.id}/credit-notes`, { reason: 'x', lines: [] }))).toMatchObject({ status: 403 });
  });

  it('other organisations never see Al-Noor: no site, no flats, no invoices', async () => {
    const s = session().as('society_admin'); // Shalimar Court: no society records in the demo
    expect(await s.get('/sites')).toEqual([]);
    expect(await problem(s.get(`${SITE}/units/unt_anr_a101`))).toMatchObject({ status: 404 });
    expect(await problem(s.get('/billing/invoices'))).toMatchObject({ status: 403, code: 'module_not_licensed' });
    s.as('manager'); // Larkspur: a developer administration role has no society permissions
    expect(await problem(s.get('/sites'))).toMatchObject({ status: 403 });
    s.as('cedar_treasurer'); // suspended: billing history readable, no operational change
    expect(await s.get<{ runs: unknown[] }>('/billing-runs')).toMatchObject({ runs: [] });
    expect(await problem(s.post('/billing-runs', { period: '2026-11' }))).toMatchObject({ status: 403, code: 'tenant_suspended' });
  });

  it('society charges stay apart from SaaS unit meters (I-15)', async () => {
    const s = session();
    const run = await s.post<BillingRunDetail>('/billing-runs', { period: '2026-11' });
    const preview = await s.post<BillingRunDetail>(`/billing-runs/${run.run.id}/preview`);
    const categories = new Set(preview.items.flatMap((i) => i.lines.map((l) => l.category)));
    expect([...categories].sort()).toEqual(['lift', 'maintenance', 'security', 'water']);
    // Platform billing (unit meters, usage snapshots) is not served by the tenant plane at all.
    expect(await problem(s.get('/platform/tenants/tnt_alnoor/usage'))).toMatchObject({ status: 404 });
    const people = await s.get<PersonRow[]>('/people', { q: 'Association' });
    expect(people.map((p) => p.person.displayName)).toEqual(['Al-Noor Residency Owners’ Association (Demo)']);
  });
});
