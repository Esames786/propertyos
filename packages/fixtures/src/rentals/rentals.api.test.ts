import type { AgreementView, LandlordView, LeaseExport, LeaseOptions, LeasesList, LeaseView, OwnerStatementsList, OwnerStatementView, Persona, PayoutsView, PayoutView, RentalSettings, RentRollView } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { changed, everyone, minus, plus, refusal, rentalsOn, rentSession, sitesOnly, suspended, withoutFeatures, withoutModules, type RentSession } from './rent-test-kit';
import type { RentalsState } from './state';

/**
 * Gate S.3 rentals API (RNT-001…009, PORTAL-037) through the fail-closed mock transport. Fictional
 * Riverbend Estate Managers (Demo): rentals on Riverbend Heights and Riverbend Court, never on
 * Riverbend Villas. Every refusal is checked to leave the stored records byte-identical.
 */
const COURT_ONLY = sitesOnly('site_rb_court');

const draftC12 = (extra: Record<string, unknown> = {}) => ({
  unitId: 'unt_rb_c12',
  landlords: [{ ownerId: 'own_rb_mirza', share: '100.00' }],
  tenantPartyId: 'pty_rb_0016',
  model: 'principal',
  from: '2026-11-01',
  to: '2027-10-31',
  rent: '55000.00',
  dueDay: 1,
  deposit: '110000.00',
  authority: { reference: 'MFP-AUTH-2026-10 (fictional)', date: '2026-10-25', confirmed: true },
  ...extra,
});

/** Calls a refused request and checks it changed nothing. */
async function refusedUnchanged(api: RentSession, p: () => Promise<unknown>) {
  await api.get('/rentals/leases');
  const before = api.snapshot();
  const r = await refusal(p());
  expect(api.snapshot()).toBe(before);
  return r;
}

describe('licensing, sites and isolation', () => {
  it('Riverbend staff see their leases; Riverbend Villas (not licensed) never appears', async () => {
    const api = rentSession();
    const list = await api.get<LeasesList>('/rentals/leases');
    expect(list.items.map((l) => l.ref)).toEqual(['RB-LS-0001', 'RB-LS-0002', 'RB-LS-0003', 'RB-LS-0004', 'RB-LS-0005', 'RB-LS-0006']);
    expect(list.counts).toEqual({ all: 6, active: 4, ending: 1, draft: 1, ended: 1 });
    expect(list.sites.map((s) => s.id)).toEqual(['site_rb_heights', 'site_rb_court']);
    expect(list.items.some((l) => l.siteId === 'site_rb_villas')).toBe(false);
    expect(list.scopeLimited).toBe(false);
  });

  it('KPIs are contract and demand figures; the settled owner payable is 0.00 (nothing settled)', async () => {
    const list = await rentSession().get<LeasesList>('/rentals/leases');
    expect(list.kpis).toMatchObject({ active: 4, rentUnderManagement: { amount: '273000.00' }, dueThisMonth: { amount: '273000.00' }, dueMonth: '2026-10', rollState: 'approved', ownerPayableSettled: { amount: '0.00' }, pendingPayouts: 0 });
  });

  it('another organisation has no rentals licence; Riverbend has no payroll; neither reaches the other', async () => {
    const api = rentSession();
    expect(await refusal(api.as('alnoor_manager').get('/rentals/leases'))).toMatchObject({ status: 403, code: 'module_not_licensed' });
    expect(await refusal(api.as('alnoor_treasurer').post('/rentals/rent-roll/2026-11/preview'))).toMatchObject({ status: 403 });
    expect(await refusal(api.as('rb_finance').get('/payroll/dashboard'))).toMatchObject({ status: 403, code: 'module_not_licensed' });
    expect(api.partitions()).not.toContain('tnt_alnoor');
  });

  it('a withdrawn rentals add-on, a missing permission, a missing feature and a suspended organisation are refused', async () => {
    expect(await refusal(rentSession({ accessFor: everyone(withoutModules('rentals')) }).get('/rentals/leases'))).toMatchObject({ status: 403, code: 'module_not_licensed' });
    expect(await refusal(rentSession({ accessFor: changed(['rb_manager'], minus('lease.manage')) }).post('/rentals/leases', draftC12()))).toMatchObject({ status: 403, code: 'permission_missing' });
    expect(await refusal(rentSession({ accessFor: everyone(withoutFeatures('rentals.owner_payouts')) }).as('rb_finance').get('/rentals/payouts'))).toMatchObject({ status: 403, code: 'feature_not_licensed' });
    expect(await refusal(rentSession({ accessFor: everyone(withoutFeatures('rentals.owner_statements')) }).as('rb_accounts').get('/rentals/owner-statements'))).toMatchObject({ status: 403, code: 'feature_not_licensed' });
    const susp = rentSession({ accessFor: everyone(suspended) });
    // History stays readable while suspended; nothing changes.
    expect((await susp.get<LeasesList>('/rentals/leases')).counts.all).toBe(6);
    expect(await refusal(susp.post('/rentals/leases', draftC12()))).toMatchObject({ status: 403, code: 'tenant_suspended' });
  });

  it('training mode cannot change rentals (no practice store)', async () => {
    const api = rentSession();
    expect(await refusedUnchanged(api, () => api.post('/rentals/leases', draftC12(), { training: true }))).toMatchObject({ status: 403, code: 'training_not_supported' });
  });

  it('no posting, settlement, payment or evidence route exists', async () => {
    const api = rentSession().as('rb_finance');
    await api.get('/rentals/leases');
    const before = api.snapshot();
    for (const path of ['/rentals/payouts/opi_rb_0001/settle', '/rentals/payouts/opi_rb_0001/paid', '/rentals/payouts/opi_rb_0001/sent', '/rentals/payouts/opi_rb_0001/evidence', '/settlements', '/rentals/settlements', '/rentals/rent-roll/2026-10/invoices', '/rentals/leases/lse_rb_0001/payments', '/rentals/leases/lse_rb_0001/deposit/receive']) {
      expect(await refusal(api.post(path, { amount: '1.00' })), path).toMatchObject({ status: 404, code: 'not_found' });
    }
    expect(api.snapshot()).toBe(before);
  });
});

describe('scope: a reader limited to Riverbend Court', () => {
  it('sees Court leases only; a Heights lease answers exactly like an id never issued', async () => {
    const api = rentSession({ accessFor: changed(['rb_manager'], COURT_ONLY) });
    const list = await api.get<LeasesList>('/rentals/leases');
    expect(list.items.map((l) => l.ref)).toEqual(['RB-LS-0002', 'RB-LS-0003']);
    expect(list.scopeLimited).toBe(true);
    expect(list.kpis.rentUnderManagement.amount).toBe('120000.00');
    const hidden = await refusal(api.get('/rentals/leases/lse_rb_0001'));
    const never = await refusal(api.get('/rentals/leases/lse_rb_9999'));
    expect(hidden).toEqual(never);
    expect(hidden).toMatchObject({ status: 404, code: 'not_found' });
    const exp = await api.get<LeaseExport>('/rentals/leases/export');
    expect(exp.scopeLimited).toBe(true);
    expect(exp.rows.map((r) => r.ref)).toEqual(['RB-LS-0002', 'RB-LS-0003']);
  });

  it('cannot act on a Heights lease or use a Heights unit; the field problem is the same as for an unknown unit', async () => {
    const api = rentSession({ accessFor: changed(['rb_manager'], COURT_ONLY) });
    expect(await refusedUnchanged(api, () => api.post('/rentals/leases/lse_rb_0001/terminate', { date: '2026-11-30', reason: 'Owner asked to end early.' }))).toMatchObject({ status: 404 });
    const heights = await refusedUnchanged(api, () => api.post('/rentals/leases', draftC12({ unitId: 'unt_rb_h0310' })));
    const unknown = await refusedUnchanged(api, () => api.post('/rentals/leases', draftC12({ unitId: 'unt_rb_x9999' })));
    expect(heights).toEqual(unknown);
    expect(heights).toMatchObject({ status: 422, fields: ['unitId'] });
  });

  it('the rent roll shows Court lines only, without whole-roll totals in its history, and cannot be prepared', async () => {
    const api = rentSession({ accessFor: changed(['rb_accounts'], COURT_ONLY) }).as('rb_accounts');
    const roll = await api.get<RentRollView>('/rentals/rent-roll', { period: '2026-10' });
    expect(roll.scopeLimited).toBe(true);
    expect(roll.lines.map((l) => l.leaseRef)).toEqual(['RB-LS-0002', 'RB-LS-0003']);
    expect(roll.totals.amount.amount).toBe('120000.00');
    expect(roll.history.every((h) => h.values === undefined)).toBe(true);
    expect(roll.actions.preview).toBe(false);
    expect(roll.blocked).toBe('other_sites');
    expect(await refusedUnchanged(api, () => api.post('/rentals/rent-roll/2026-11/preview'))).toMatchObject({ status: 403, code: 'other_sites' });
  });

  it('a multi-site owner’s statement shows Court lines with Court totals, and cannot be issued', async () => {
    const api = rentSession({ accessFor: changed(['rb_accounts'], COURT_ONLY) }).as('rb_accounts');
    const s = await api.get<OwnerStatementView>('/rentals/owner-statements/statement', { owner: 'own_rb_tahira', period: '2026-10' });
    expect(s.scopeLimited).toBe(true);
    expect(s.lines.every((l) => l.siteId === 'site_rb_court')).toBe(true);
    expect(s.memo.rentDue.amount).toBe('62000.00');
    expect(s.lines.some((l) => l.unitCode === 'H-1204')).toBe(false);
    expect(s.actions.issue).toBe(false);
    // The issued September snapshot is filtered the same way, and its history carries no whole-owner values.
    const sept = await api.get<OwnerStatementView>('/rentals/owner-statements/statement', { owner: 'own_rb_tahira', period: '2026-09' });
    expect(sept.state).toBe('issued');
    expect(sept.lines.every((l) => l.siteId === 'site_rb_court')).toBe(true);
    expect(sept.history.every((h) => h.values === undefined)).toBe(true);
    expect(await refusedUnchanged(api, () => api.post('/rentals/owner-statements/issue', { ownerId: 'own_rb_tahira', period: '2026-10' }))).toMatchObject({ status: 403, code: 'other_sites' });
    // A Heights-only owner is invisible: the same field problem as an owner never registered.
    const farhan = await refusedUnchanged(api, () => api.post('/rentals/owner-statements/issue', { ownerId: 'own_rb_farhan', period: '2026-10' }));
    const nobody = await refusedUnchanged(api, () => api.post('/rentals/owner-statements/issue', { ownerId: 'own_rb_nobody', period: '2026-10' }));
    expect(farhan).toEqual(nobody);
  });

  it('payouts: whole-owner money is withheld from a partial reader, and acting needs every site', async () => {
    const api = rentSession({ accessFor: changed(['rb_accounts'], COURT_ONLY) }).as('rb_accounts');
    const v = await api.get<PayoutsView>('/rentals/payouts');
    const tahira = v.owners.find((o) => o.id === 'own_rb_tahira')!;
    expect(tahira.holds).toEqual(['other_sites']);
    expect(tahira.closing).toBeUndefined();
    expect(tahira.available).toBeUndefined();
    expect(v.owners.some((o) => o.id === 'own_rb_farhan')).toBe(false);
    expect(await refusedUnchanged(api, () => api.post('/rentals/payouts', { ownerId: 'own_rb_tahira', amount: '1.00', note: 'Monthly payout' }))).toMatchObject({ status: 403, code: 'other_sites' });
  });

  it('settings: a Court-only director may draft for a Court-only owner, never for a multi-site owner', async () => {
    const api = rentSession({ accessFor: changed(['rb_director'], COURT_ONLY) }).as('rb_director');
    const s = await api.get<RentalSettings>('/rentals/settings');
    const tahira = s.agreements.find((a) => a.owner.id === 'own_rb_tahira')!;
    expect(tahira.scopeLimited).toBe(true);
    expect(tahira.blocked).toBe('other_sites');
    expect(tahira.versions.every((v) => v.note === undefined)).toBe(true);
    expect(tahira.versions.flatMap((v) => v.boundLeases)).not.toContain('RB-LS-0001');
    expect(await refusedUnchanged(api, () => api.post('/rentals/settings/agreements/agr_rb_0001/versions', { effectiveFrom: '2027-01-01', model: 'agent', feePct: '7.00', depositHolding: 'client_deposit_account', depositMaxMonths: 2, collectOnBehalf: true, signedReference: '', signedDate: '', note: '' }))).toMatchObject({ status: 403, code: 'other_sites' });
    expect(s.agreements.find((a) => a.owner.id === 'own_rb_mirza')!.actions.draft).toBe(true);
  });
});

describe('new lease wizard (RNT-003) and activation', () => {
  it('offers the reader’s units and prospective tenants only', async () => {
    const o = await rentSession().get<LeaseOptions>('/rentals/leases/options');
    expect(o.units.map((u) => u.code)).toEqual(['H-1204', 'H-0802', 'H-0507', 'H-0310', 'C-07', 'C-11', 'C-12', 'C-03']);
    expect(o.units.find((u) => u.code === 'H-0802')!.owners.map((x) => [x.name, x.share, x.agreement?.signed])).toEqual([['Farhan Saeed', '50.00', true], ['Nida Saeed', '50.00', false]]);
    // A former tenant may rent again; current tenants and owners are not offered.
    expect(o.tenants.map((t) => t.name)).toEqual(['Usama Khalid', 'Hamid Raza', 'Laila Ahmed']);
  });

  it('refuses every invalid draft without storing anything', async () => {
    const api = rentSession();
    const cases: Array<[Record<string, unknown>, string, string]> = [
      [{ unitId: 'unt_rb_v14', landlords: [{ ownerId: 'own_rb_tahira', share: '100.00' }] }, 'unitId', 'forms:errors.required'],
      [{ landlords: [{ ownerId: 'own_rb_tahira', share: '100.00' }] }, 'landlords', 'rentals:errors.notOwner'],
      [{ landlords: [{ ownerId: 'own_rb_mirza', share: '90.00' }] }, 'landlords', 'rentals:errors.shares'],
      [{ unitId: 'unt_rb_h0310', landlords: [{ ownerId: 'own_rb_zafar', share: '100.00' }], model: 'agent' }, 'landlords', 'rentals:errors.noAgreement'],
      [{ model: 'agent' }, 'model', 'rentals:errors.modelMismatch'],
      [{ to: '2026-10-31' }, 'to', 'rentals:errors.endAfterStart'],
      [{ to: '2030-10-31' }, 'to', 'rentals:errors.term'],
      [{ from: '2026-02-30' }, 'from', 'rentals:errors.date'],
      [{ from: '2026-08-01', to: '2027-07-31' }, 'from', 'rentals:errors.startTooEarly'],
      [{ deposit: '110000.01' }, 'deposit', 'rentals:errors.depositCap'],
      [{ rent: '0' }, 'rent', 'rentals:errors.amount'],
      [{ dueDay: 31 }, 'dueDay', 'rentals:errors.dueDay'],
      [{ tenantPartyId: 'pty_rb_0002' }, 'tenantPartyId', 'forms:errors.required'],
      [{ authority: { reference: 'X', date: '2026-10-25', confirmed: true } }, 'authority.reference', 'rentals:errors.minLength'],
      [{ authority: { reference: 'MFP-AUTH', date: '2026-10-25', confirmed: false } }, 'authority.confirmed', 'rentals:errors.authorityConfirm'],
    ];
    for (const [patch, field, code] of cases) {
      const r = await refusedUnchanged(api, () => api.post('/rentals/leases', draftC12(patch)));
      expect(r, JSON.stringify(patch)).toMatchObject({ status: 422, fields: [field] });
      expect(r.errors[field]![0]!.code, JSON.stringify(patch)).toBe(code);
    }
  });

  it('mixed issuing models (an agent and a principal owner) cannot share one lease', async () => {
    const api = rentSession();
    await api.get('/rentals/leases');
    // Test setup only: make C-12 jointly owned by an agent-model and a principal-model owner.
    const st = api.rent() as RentalsState;
    st.ownerships = st.ownerships.map((o) => (o.unitId === 'unt_rb_c12' ? { ...o, share: '50.00' } : o));
    st.ownerships.push({ unitId: 'unt_rb_c12', ownerId: 'own_rb_tahira', share: '50.00', from: '2025-11-01' });
    const r = await refusedUnchanged(api, () => api.post('/rentals/leases', draftC12({ landlords: [{ ownerId: 'own_rb_mirza', share: '50.00' }, { ownerId: 'own_rb_tahira', share: '50.00' }] })));
    expect(r).toMatchObject({ status: 422, fields: ['model'] });
    expect(r.errors.model![0]!.code).toBe('rentals:errors.mixedModels');
  });

  it('a duplicate or an overlapping lease of the same unit is refused, naming only the reader’s own lease', async () => {
    const api = rentSession();
    await api.post('/rentals/leases', draftC12());
    expect(await refusedUnchanged(api, () => api.post('/rentals/leases', draftC12()))).toMatchObject({ status: 409, code: 'duplicate_lease' });
    expect(await refusedUnchanged(api, () => api.post('/rentals/leases', draftC12({ tenantPartyId: 'pty_rb_0017', from: '2027-01-01', to: '2027-12-31' })))).toMatchObject({ status: 409, code: 'lease_overlap' });
    expect(await refusedUnchanged(api, () => api.post('/rentals/leases', { ...draftC12(), unitId: 'unt_rb_h1204', landlords: [{ ownerId: 'own_rb_tahira', share: '100.00' }], model: 'agent', from: '2026-12-01', to: '2027-11-30', deposit: '0' }))).toMatchObject({ status: 409, code: 'lease_overlap' });
  });

  it('draft → review → activated by a second person, with its own lease payer account', async () => {
    const api = rentSession();
    const d = await api.post<LeaseView>('/rentals/leases', draftC12());
    expect(d).toMatchObject({ state: 'draft', billingAccount: null, blockers: [] });
    const sub = await api.post<LeaseView>(`/rentals/leases/${d.id}/submit`);
    expect(sub.state).toBe('review');
    expect(sub.actions.activate).toBe(false);
    expect(sub.blocked).toBe('own_draft');
    expect(await refusedUnchanged(api, () => api.post(`/rentals/leases/${d.id}/activate`))).toMatchObject({ status: 403, code: 'maker_checker_required' });
    const act = await api.as('rb_accounts').post<LeaseView>(`/rentals/leases/${d.id}/activate`);
    expect(act).toMatchObject({ state: 'active', activatedByName: 'Usman Ghani', billingAccount: { ref: 'RB-LA-0007', kind: 'lease' } });
    expect(act.issuing).toMatchObject({ model: 'principal', entityName: 'Mirza Family Properties (Pvt) Ltd (Demo)', account: { kind: 'owner_account', last4: '7781' }, subLedgers: [] });
    expect(act.schedule[0]).toMatchObject({ period: '2026-11', dueDate: '2026-11-01', amount: { amount: '55000.00' }, roll: 'not_prepared', settlement: 'not_settled' });
    expect(act.invoices).toEqual([]);
    expect(act.deposit).toMatchObject({ agreed: { amount: '110000.00' }, heldEvidenced: { amount: '0.00' }, holding: 'owner_account', state: 'awaiting_evidence' });
  });

  it('idempotency binds operation, principal, target and the exact request (Issues #16 and #18)', async () => {
    const api = rentSession();
    const a = await api.post<LeaseView>('/rentals/leases', draftC12(), { key: 'k-lease-1' });
    const again = await api.post<LeaseView>('/rentals/leases', { ...draftC12(), rent: ' 55000.00 ' }, { key: 'k-lease-1' });
    expect(again.id).toBe(a.id);
    expect(api.rent().leases.filter((l) => l.unitId === 'unt_rb_c12')).toHaveLength(1);
    // The same key with another request, another person or another operation: a non-disclosing 409.
    expect(await refusedUnchanged(api, () => api.post('/rentals/leases', draftC12({ rent: '56000.00' }), { key: 'k-lease-1' }))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    expect(await refusedUnchanged(api, () => api.as('rb_accounts').post('/rentals/leases', draftC12(), { key: 'k-lease-1' }))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    expect(await refusedUnchanged(api, () => api.as('rb_manager').post('/rentals/rent-roll/2026-11/preview', {}, { key: 'k-lease-1' }))).toMatchObject({ status: 409, code: 'idempotency_key_reused' });
    // A replay is checked for authority first: a reader who lost the site gets nothing back.
    const narrowed = rentSession({ accessFor: changed(['rb_manager'], sitesOnly('site_rb_heights')) });
    await narrowed.get('/rentals/leases');
    narrowed.rent().idempotency['k-lease-x'] = { op: 'lease.create', principal: 'usr_rb_0002', target: 'unt_rb_c12', fp: '{}', id: 'lse_rb_0003' };
    expect(await refusedUnchanged(narrowed, () => narrowed.post('/rentals/leases', draftC12(), { key: 'k-lease-x' }))).toMatchObject({ status: 422, fields: ['unitId'] });
  });

  it('a lease whose co-owner has no signed agreement cannot be activated, until the agreement is signed and approved by a second person', async () => {
    const api = rentSession().as('rb_accounts');
    const l5 = await api.get<LeaseView>('/rentals/leases/lse_rb_0005');
    expect(l5).toMatchObject({ state: 'review', blockers: ['agreement_unsigned'], blocked: 'blockers' });
    expect(l5.landlords.map((x) => [x.ownerName, x.share, x.signed])).toEqual([['Farhan Saeed', '50.00', true], ['Nida Saeed', '50.00', false]]);
    expect(await refusedUnchanged(api, () => api.post('/rentals/leases/lse_rb_0005/activate'))).toMatchObject({ status: 409, code: 'lease_blocked' });
    // The finance controller cannot approve the unsigned draft.
    expect(await refusedUnchanged(api, () => api.as('rb_finance').post('/rentals/settings/agreements/agr_rb_0004/approve', { acknowledge: true }))).toMatchObject({ status: 409, code: 'agreement_unsigned' });
    // The director records the signature on the draft; he cannot approve his own draft.
    const sign = { effectiveFrom: '2026-11-01', model: 'agent', feePct: '8.00', depositHolding: 'client_deposit_account', depositMaxMonths: 2, collectOnBehalf: true, signedReference: 'RB-MA-2026-044 (fictional)', signedDate: '2026-10-26', note: 'Signed today.' };
    const drafted = await api.as('rb_director').post<AgreementView>('/rentals/settings/agreements/agr_rb_0004/versions', sign);
    expect(drafted.versions[0]).toMatchObject({ n: 1, state: 'draft', signed: { reference: 'RB-MA-2026-044 (fictional)' } });
    expect(await refusedUnchanged(api, () => api.as('rb_director').post('/rentals/settings/agreements/agr_rb_0004/approve', { acknowledge: true }))).toMatchObject({ status: 403, code: 'maker_checker_required' });
    const approved = await api.as('rb_finance').post<AgreementView>('/rentals/settings/agreements/agr_rb_0004/approve', { acknowledge: true });
    expect(approved.versions[0]).toMatchObject({ n: 1, state: 'scheduled', approvedByName: 'Naila Haider' });
    // The drafter of the lease cannot activate it; the accounts officer can.
    expect(await refusedUnchanged(api, () => api.as('rb_manager').post('/rentals/leases/lse_rb_0005/activate'))).toMatchObject({ status: 403, code: 'maker_checker_required' });
    const act = await api.as('rb_accounts').post<LeaseView>('/rentals/leases/lse_rb_0005/activate');
    expect(act.state).toBe('active');
    expect(act.versions[0]!.agreements.map((a) => [a.ref, a.version])).toEqual([['RB-MA-0003', 1], ['RB-MA-0004', 1]]);
    expect(act.issuing?.subLedgers).toEqual(['OSL-0003', 'OSL-0004']);
  });

  it('a member of staff who is one of the landlords cannot activate the lease (conflict)', async () => {
    // Test identity: Kashif Mirza (who signs for Mirza Family Properties) as a member of staff.
    const conflictedStaff = { id: 'rb_conflict' as Persona['id'], tenantId: 'tnt_riverbend', principalId: 'usr_rb_c0002', app: 'backoffice' as const, displayName: 'Kashif Mirza (staff test identity)', roleKey: 'common:roles.client_money_officer', email: 'k@example.com', permissions: ['lease.view', 'lease.manage'] as const, projectScope: 'all' as const };
    const api = rentSession({ personas: [conflictedStaff] });
    const d = await api.post<LeaseView>('/rentals/leases', draftC12());
    await api.post(`/rentals/leases/${d.id}/submit`);
    expect(await refusedUnchanged(api, () => api.as('rb_conflict').post(`/rentals/leases/${d.id}/activate`))).toMatchObject({ status: 403, code: 'own_record' });
  });
});

describe('Lease 360 actions: renewal, termination, deposits (RNT-002, RNT-008, RNT-009)', () => {
  it('renewal adds a version bound to the agreement in force then; the earlier version keeps its binding', async () => {
    const api = rentSession();
    const before = await api.get<LeaseView>('/rentals/leases/lse_rb_0002');
    expect(before.ending).toBe(true);
    const r = await api.post<LeaseView>('/rentals/leases/lse_rb_0002/renew', { to: '2027-12-15', rent: '64000.00', reason: 'Tenant renews for a year at the agreed rent.' });
    expect(r.versions.map((v) => [v.n, v.from, v.to, v.rent.amount, v.reason, v.agreements[0]!.version])).toEqual([
      [1, '2025-12-16', '2026-12-15', '62000.00', 'created', 1],
      [2, '2026-12-16', '2027-12-15', '64000.00', 'renewed', 2],
    ]);
    expect(r.ending).toBe(false);
    expect(r.schedule.find((s) => s.period === '2026-12')).toMatchObject({ amount: { amount: '62000.00' }, version: 1 });
    expect(r.schedule.find((s) => s.period === '2027-01')).toMatchObject({ amount: { amount: '64000.00' }, version: 2 });
    expect(await refusedUnchanged(api, () => api.post('/rentals/leases/lse_rb_0002/renew', { to: '2027-06-30', rent: '64000.00', reason: 'Too short a renewal.' }))).toMatchObject({ status: 422, fields: ['to'] });
  });

  it('termination stops later rent; dates before today or after the end are refused', async () => {
    const api = rentSession();
    expect(await refusedUnchanged(api, () => api.post('/rentals/leases/lse_rb_0001/terminate', { date: '2026-10-01', reason: 'Backdated end requested.' }))).toMatchObject({ status: 422, fields: ['date'] });
    const t = await api.post<LeaseView>('/rentals/leases/lse_rb_0001/terminate', { date: '2026-11-30', reason: 'Tenant gave notice; owner agreed to end early.' });
    expect(t.terms.terminationDate).toBe('2026-11-30');
    expect(t.schedule.at(-1)!.period).toBe('2026-11');
    expect(t.actions.renew).toBe(false);
    expect(await refusedUnchanged(api, () => api.post('/rentals/leases/lse_rb_0001/terminate', { date: '2026-11-15', reason: 'A second termination attempt.' }))).toMatchObject({ status: 409, code: 'state_changed' });
  });

  it('a deposit is a liability awaiting evidence; an ended lease has nothing refundable on an evidenced basis', async () => {
    const api = rentSession();
    const ended = await api.get<LeaseView>('/rentals/leases/lse_rb_0004');
    expect(ended.state).toBe('ended');
    expect(ended.deposit).toMatchObject({ agreed: { amount: '140000.00' }, heldEvidenced: { amount: '0.00' }, state: 'awaiting_evidence', refund: { due: true, refundable: { amount: '0.00' }, reason: 'no_evidence' } });
    const active = await api.get<LeaseView>('/rentals/leases/lse_rb_0001');
    expect(active.deposit.refund).toMatchObject({ due: false, reason: 'not_due' });
    expect(active.subLedger).toMatchObject({ applicable: true, refs: ['OSL-0001'], settled: { amount: '0.00' } });
    expect(active.invoices).toEqual([]);
  });
});

describe('rent roll (RNT-004): demand schedule, maker ≠ checker, posting refused', () => {
  it('previews November with one line per let lease, keyed by lease, period and version; rent never uses a society dues account', async () => {
    const api = rentSession();
    const r = await api.post<RentRollView>('/rentals/rent-roll/2026-11/preview');
    expect(r).toMatchObject({ period: '2026-11', state: 'draft', version: 1, stale: false, totals: { amount: { amount: '273000.00' }, lines: 4 } });
    expect(r.lines.map((l) => l.key)).toEqual(['lse_rb_0001:2026-11:v1', 'lse_rb_0002:2026-11:v1', 'lse_rb_0003:2026-11:v1', 'lse_rb_0006:2026-11:v2']);
    for (const l of r.lines) {
      expect(l.billingKind).toBe('rent');
      expect(l.payerAccountRef).toMatch(/^RB-LA-\d{4}$/);
      expect(l.settlement).toBe('not_settled');
    }
    expect(r.posting).toEqual({ available: false, needs: ['lease_subject', 'payer_account', 'numbering', 'idempotent_source'] });
    // Previewing again with nothing changed adds no version and no line.
    const again = await api.post<RentRollView>('/rentals/rent-roll/2026-11/preview');
    expect(again.version).toBe(1);
    expect(again.lines).toHaveLength(4);
  });

  it('only someone who previewed nothing may approve; a stale roll must be previewed again', async () => {
    const api = rentSession();
    await api.post('/rentals/rent-roll/2026-11/preview');
    await api.as('rb_accounts').post('/rentals/rent-roll/2026-11/preview');
    const withApprove = rentSession({ accessFor: changed(['rb_accounts'], plus('rent.approve')) });
    await withApprove.as('rb_accounts').post('/rentals/rent-roll/2026-11/preview');
    expect(await refusedUnchanged(withApprove, () => withApprove.as('rb_accounts').post('/rentals/rent-roll/2026-11/approve', { acknowledge: true }))).toMatchObject({ status: 403, code: 'maker_checker_required' });
    // A lease change after the preview makes it stale.
    await api.as('rb_manager').post('/rentals/leases/lse_rb_0001/terminate', { date: '2026-11-03', reason: 'Owner and tenant agreed an early end.' });
    const stale = await api.as('rb_finance').get<RentRollView>('/rentals/rent-roll', { period: '2026-11' });
    expect(stale).toMatchObject({ stale: true, blocked: 'stale' });
    expect(await refusedUnchanged(api, () => api.as('rb_finance').post('/rentals/rent-roll/2026-11/approve', { acknowledge: true }))).toMatchObject({ status: 409, code: 'roll_stale' });
    const fresh = await api.as('rb_manager').post<RentRollView>('/rentals/rent-roll/2026-11/preview');
    expect(fresh).toMatchObject({ version: 2, totals: { lines: 3 } });
    expect(await refusedUnchanged(api, () => api.as('rb_finance').post('/rentals/rent-roll/2026-11/approve', {}))).toMatchObject({ status: 422, fields: ['acknowledge'] });
    const ok = await api.as('rb_finance').post<RentRollView>('/rentals/rent-roll/2026-11/approve', { acknowledge: true, note: 'Checked against the leases.' });
    expect(ok).toMatchObject({ state: 'approved', approvedByName: 'Naila Haider', actions: { preview: false, approve: false } });
    expect(await refusedUnchanged(api, () => api.as('rb_manager').post('/rentals/rent-roll/2026-11/preview'))).toMatchObject({ status: 409, code: 'roll_approved' });
    expect(await refusedUnchanged(api, () => api.as('rb_finance').post('/rentals/rent-roll/2026-11/approve', { acknowledge: true }))).toMatchObject({ status: 409, code: 'state_changed' });
  });

  it('posting an approved roll is refused honestly and creates nothing; a draft cannot be posted either', async () => {
    const api = rentSession().as('rb_finance');
    expect(await refusedUnchanged(api, () => api.post('/rentals/rent-roll/2026-10/post'))).toMatchObject({ status: 409, code: 'posting_unavailable', messageKey: 'rentals:problems.postingUnavailable' });
    await api.as('rb_manager').post('/rentals/rent-roll/2026-11/preview');
    expect(await refusedUnchanged(api, () => api.as('rb_manager').post('/rentals/rent-roll/2026-11/post'))).toMatchObject({ status: 409, code: 'state_changed' });
    expect(await refusedUnchanged(api, () => api.as('rb_manager').post('/rentals/rent-roll/2026-12/post'))).toMatchObject({ status: 404 });
  });

  it('periods before the rentals licence or beyond next month are refused', async () => {
    const api = rentSession();
    expect(await refusedUnchanged(api, () => api.post('/rentals/rent-roll/2026-08/preview'))).toMatchObject({ status: 409, code: 'period_not_allowed' });
    expect(await refusedUnchanged(api, () => api.post('/rentals/rent-roll/2027-01/preview'))).toMatchObject({ status: 409, code: 'period_not_allowed' });
    expect(await refusedUnchanged(api, () => api.post('/rentals/rent-roll/2026-13/preview'))).toMatchObject({ status: 422, fields: ['period'] });
  });
});

describe('owner statements (RNT-005): settled basis, memo lines, immutable snapshots', () => {
  it('October for Tahira: approved demands, an approved expense and deposits are memo lines; the closing payable is 0.00', async () => {
    const api = rentSession().as('rb_accounts');
    const s = await api.get<OwnerStatementView>('/rentals/owner-statements/statement', { owner: 'own_rb_tahira', period: '2026-10' });
    expect(s).toMatchObject({ state: 'draft', model: 'agent', agreement: { ref: 'RB-MA-0001', version: 1, feePct: '8.00' }, scopeLimited: false, actions: { issue: true } });
    expect(s.lines.map((l) => [l.kind, l.basis, l.unitCode ?? '', l.amount.amount, l.state])).toEqual([
      ['rent_due', 'memo', 'H-1204', '85000.00', 'approved_demand'],
      ['rent_due', 'memo', 'C-07', '62000.00', 'approved_demand'],
      ['owner_expense', 'memo', 'H-1204', '18500.00', 'approved_unpaid'],
      ['deposit_held', 'memo', 'H-1204', '170000.00', 'awaiting_evidence'],
      ['deposit_held', 'memo', 'C-07', '124000.00', 'awaiting_evidence'],
    ]);
    expect(s.totals).toEqual({ opening: { amount: '0.00', currency: 'PKR' }, settledRent: { amount: '0.00', currency: 'PKR' }, fees: { amount: '0.00', currency: 'PKR' }, settledExpenses: { amount: '0.00', currency: 'PKR' }, settledPayouts: { amount: '0.00', currency: 'PKR' }, closing: { amount: '0.00', currency: 'PKR' } });
    expect(s.memo).toMatchObject({ rentDue: { amount: '147000.00' }, expensesApproved: { amount: '18500.00' }, depositsAgreed: { amount: '294000.00' }, depositsHeld: { amount: '0.00' } });
    // Every line opens its source.
    expect(s.lines.every((l) => l.source.id && l.source.ref)).toBe(true);
  });

  it('a joint lease splits by share; the principal-model owner’s manager holds and owes nothing', async () => {
    const api = rentSession().as('rb_accounts');
    const mirza = await api.get<OwnerStatementView>('/rentals/owner-statements/statement', { owner: 'own_rb_mirza', period: '2026-10' });
    expect(mirza).toMatchObject({ model: 'principal', totals: { closing: { amount: '0.00' } } });
    // Nida's agreement is not in force: no statement for her.
    expect(await refusal(api.get('/rentals/owner-statements/statement', { owner: 'own_rb_nida', period: '2026-10' }))).toMatchObject({ status: 404 });
    const list = await api.get<OwnerStatementsList>('/rentals/owner-statements');
    expect(list.owners.map((o) => o.name)).toEqual(['Tahira Rehman', 'Mirza Family Properties (Demo)', 'Farhan Saeed']);
    expect(list.periods).toEqual(['2026-10', '2026-09']);
    expect(list.owners[0]!.issued.map((x) => [x.ref, x.period])).toEqual([['RB-OS-0001', '2026-09']]);
  });

  it('issuing freezes a snapshot: later changes never rewrite it; a second issue is refused; a replay returns it', async () => {
    const api = rentSession().as('rb_accounts');
    const issued = await api.post<OwnerStatementView>('/rentals/owner-statements/issue', { ownerId: 'own_rb_tahira', period: '2026-10' }, { key: 'k-st-1' });
    expect(issued).toMatchObject({ state: 'issued', ref: 'RB-OS-0002', issuedByName: 'Usman Ghani', actions: { issue: false }, blocked: 'already_issued' });
    const replay = await api.post<OwnerStatementView>('/rentals/owner-statements/issue', { ownerId: 'own_rb_tahira', period: '2026-10' }, { key: 'k-st-1' });
    expect(replay.ref).toBe('RB-OS-0002');
    expect(await refusedUnchanged(api, () => api.post('/rentals/owner-statements/issue', { ownerId: 'own_rb_tahira', period: '2026-10' }))).toMatchObject({ status: 409, code: 'already_issued' });
    const frozen = JSON.stringify(api.rent().statements.find((s) => s.ref === 'RB-OS-0002'));
    await api.as('rb_manager').post('/rentals/leases/lse_rb_0002/renew', { to: '2027-12-15', rent: '99000.00', reason: 'Renewed at a much higher rent.' });
    const after = await api.as('rb_accounts').get<OwnerStatementView>('/rentals/owner-statements/statement', { owner: 'own_rb_tahira', period: '2026-10' });
    expect(after.memo.rentDue.amount).toBe('147000.00');
    expect(JSON.stringify(api.rent().statements.find((s) => s.ref === 'RB-OS-0002'))).toBe(frozen);
    expect(await refusedUnchanged(api, () => api.post('/rentals/owner-statements/issue', { ownerId: 'own_rb_tahira', period: '2026-11' }))).toMatchObject({ status: 422, fields: ['period'] });
  });
});

describe('owner payouts (RNT-006): instructions only, never more than the settled payable', () => {
  it('nothing is settled, so nothing can be instructed; a principal-model owner has nothing held for them', async () => {
    const api = rentSession().as('rb_accounts');
    const v = await api.get<PayoutsView>('/rentals/payouts');
    expect(v.settlementAvailable).toBe(false);
    expect(v.owners.map((o) => [o.name, o.available?.amount, o.holds, o.canPrepare])).toEqual([
      ['Tahira Rehman', '0.00', ['no_settled_money'], false],
      ['Mirza Family Properties (Demo)', '0.00', ['principal_model'], false],
      ['Farhan Saeed', '0.00', ['no_settled_money'], false],
    ]);
    const over = await refusedUnchanged(api, () => api.post('/rentals/payouts', { ownerId: 'own_rb_tahira', amount: '1.00', note: 'Monthly payout' }));
    expect(over).toMatchObject({ status: 409, code: 'exceeds_available' });
    expect(over.errors._![0]!.params).toEqual({ available: '0.00' });
    expect(await refusedUnchanged(api, () => api.post('/rentals/payouts', { ownerId: 'own_rb_mirza', amount: '1.00', note: 'Monthly payout' }))).toMatchObject({ status: 409, code: 'principal_model' });
    expect(await refusedUnchanged(api, () => api.post('/rentals/payouts', { ownerId: 'own_rb_nida', amount: '1.00', note: 'Monthly payout' }))).toMatchObject({ status: 422, fields: ['ownerId'] });
  });

  it('with a settled source (test-injected, standing in for the missing S.1/C.2 integration): prepare ≤ available, approve by another person; neither changes the payable', async () => {
    const api = rentSession().as('rb_accounts');
    await api.get('/rentals/leases');
    // Test setup only: no route can write a settled event in this gate.
    api.rent().settled.push({ id: 'set_test_1', kind: 'rent', ownerId: 'own_rb_tahira', siteId: 'site_rb_heights', period: '2026-10', amount: { amount: '85000.00', currency: 'PKR' }, sourceRef: 'TEST-LINE-1' });
    const before = await api.get<PayoutsView>('/rentals/payouts');
    expect(before.owners[0]).toMatchObject({ closing: { amount: '78200.00' }, available: { amount: '78200.00' }, holds: [], canPrepare: true });
    const p = await api.post<PayoutView>('/rentals/payouts', { ownerId: 'own_rb_tahira', amount: '50000.00', note: 'October payout to the owner' }, { key: 'k-po-1' });
    expect(p).toMatchObject({ state: 'awaiting_approval', settlement: 'not_settled', actions: { approve: false } });
    expect((await api.post<PayoutView>('/rentals/payouts', { ownerId: 'own_rb_tahira', amount: '50000.00', note: 'October payout to the owner' }, { key: 'k-po-1' })).id).toBe(p.id);
    const mid = await api.get<PayoutsView>('/rentals/payouts');
    expect(mid.owners[0]).toMatchObject({ closing: { amount: '78200.00' }, pending: { amount: '50000.00' }, available: { amount: '28200.00' } });
    expect(await refusedUnchanged(api, () => api.post('/rentals/payouts', { ownerId: 'own_rb_tahira', amount: '28200.01', note: 'A second payout' }))).toMatchObject({ status: 409, code: 'exceeds_available' });
    // Maker ≠ checker: the preparer cannot approve (even holding the approval permission).
    const both = rentSession({ accessFor: changed(['rb_accounts'], plus('owner_payout.approve')) });
    await both.as('rb_accounts').get('/rentals/leases');
    both.rent().settled.push({ id: 'set_test_1', kind: 'rent', ownerId: 'own_rb_tahira', siteId: 'site_rb_heights', period: '2026-10', amount: { amount: '85000.00', currency: 'PKR' }, sourceRef: 'TEST-LINE-1' });
    const own = await both.as('rb_accounts').post<PayoutView>('/rentals/payouts', { ownerId: 'own_rb_tahira', amount: '1000.00', note: 'Own instruction test' });
    expect(await refusedUnchanged(both, () => both.as('rb_accounts').post(`/rentals/payouts/${own.id}/approve`, { acknowledge: true }))).toMatchObject({ status: 403, code: 'maker_checker_required' });
    const ok = await api.as('rb_finance').post<PayoutView>(`/rentals/payouts/${p.id}/approve`, { acknowledge: true });
    expect(ok).toMatchObject({ state: 'approved', settlement: 'not_settled', approvedByName: 'Naila Haider' });
    // Approved is an instruction, not a movement of money: closing payable and the statement are unchanged.
    const after = await api.get<PayoutsView>('/rentals/payouts');
    expect(after.owners[0]).toMatchObject({ closing: { amount: '78200.00' }, pending: { amount: '50000.00' } });
    const st = await api.as('rb_accounts').get<OwnerStatementView>('/rentals/owner-statements/statement', { owner: 'own_rb_tahira', period: '2026-10' });
    expect(st.totals.closing.amount).toBe('78200.00');
    expect(st.lines.find((l) => l.kind === 'payout_pending')).toMatchObject({ basis: 'memo', state: 'approved_not_sent', amount: { amount: '50000.00' } });
    expect(await refusedUnchanged(api, () => api.as('rb_finance').post(`/rentals/payouts/${p.id}/approve`, { acknowledge: true }))).toMatchObject({ status: 409, code: 'state_changed' });
  });

  it('a whole-owner instruction is invisible to a reader with only some of the owner’s sites (like an id never issued)', async () => {
    const court = rentSession({ accessFor: changed(['rb_finance'], COURT_ONLY) }).as('rb_accounts');
    await court.get('/rentals/leases');
    court.rent().settled.push({ id: 'set_test_1', kind: 'rent', ownerId: 'own_rb_tahira', siteId: 'site_rb_heights', period: '2026-10', amount: { amount: '85000.00', currency: 'PKR' }, sourceRef: 'TEST-LINE-1' });
    const p = await court.post<PayoutView>('/rentals/payouts', { ownerId: 'own_rb_tahira', amount: '1000.00', note: 'Scope test payout' });
    const hidden = await refusedUnchanged(court, () => court.as('rb_finance').post(`/rentals/payouts/${p.id}/approve`, { acknowledge: true }));
    const never = await refusedUnchanged(court, () => court.as('rb_finance').post('/rentals/payouts/opi_rb_9999/approve', { acknowledge: true }));
    expect(hidden).toEqual(never);
    expect(hidden).toMatchObject({ status: 404 });
    expect((await court.as('rb_finance').get<PayoutsView>('/rentals/payouts')).instructions).toEqual([]);
  });

  it('the owner’s masked bank details are for payout preparers and approvers only (Issue #18 rule)', async () => {
    const api = rentSession();
    const reader = await api.as('rb_manager').get<PayoutsView>('/rentals/payouts');
    expect(reader.owners.every((o) => o.beneficiary === undefined)).toBe(true);
    expect(JSON.stringify(reader)).not.toMatch(/3301|7781|5520|Demo Bank/);
    const preparer = await api.as('rb_accounts').get<PayoutsView>('/rentals/payouts');
    expect(preparer.owners.find((o) => o.id === 'own_rb_tahira')!.beneficiary).toEqual({ bankName: 'Demo Bank (fictional)', last4: '3301', verified: true });
  });

  it('an approver who is the owner’s own person is refused (conflict)', async () => {
    // Test identity: Tahira Rehman (the owner) as a member of staff who may approve payouts.
    const owner = { id: 'rb_conflict' as Persona['id'], tenantId: 'tnt_riverbend', principalId: 'usr_rb_c0001', app: 'backoffice' as const, displayName: 'Tahira Rehman (staff test identity)', roleKey: 'common:roles.finance_controller', email: 't@example.com', permissions: ['lease.view', 'owner_payout.approve', 'owner_statement.view'] as const, projectScope: 'all' as const };
    const api = rentSession({ personas: [owner] });
    await api.as('rb_accounts').get('/rentals/leases');
    api.rent().settled.push({ id: 'set_test_1', kind: 'rent', ownerId: 'own_rb_tahira', siteId: 'site_rb_heights', period: '2026-10', amount: { amount: '85000.00', currency: 'PKR' }, sourceRef: 'TEST-LINE-1' });
    const p = await api.as('rb_accounts').post<PayoutView>('/rentals/payouts', { ownerId: 'own_rb_tahira', amount: '1000.00', note: 'Conflict test' });
    expect(await refusedUnchanged(api, () => api.as('rb_conflict').post(`/rentals/payouts/${p.id}/approve`, { acknowledge: true }))).toMatchObject({ status: 403, code: 'own_record' });
  });
});

describe('landlord view (PORTAL-037): Rule R', () => {
  it('Tahira sees her two let flats at licensed sites, never the Villas plot or the flat she sold', async () => {
    const v = await rentSession().as('rb_landlord_tahira').get<LandlordView>('/portal/rentals');
    expect(v.properties.map((p) => [p.unitCode, p.siteName, p.share])).toEqual([['H-1204', 'Riverbend Heights', '100.00'], ['C-07', 'Riverbend Court', '100.00']]);
    expect(v.properties[0]!.lease).toEqual({ ref: 'RB-LS-0001', tenantName: 'Adeel Shah', from: '2026-03-01', to: '2027-02-28', rent: { amount: '85000.00', currency: 'PKR' }, period: '2026-10', roll: 'approved', settlement: 'not_settled' });
    expect(v.properties[0]!.deposit).toEqual({ agreed: { amount: '170000.00', currency: 'PKR' }, heldEvidenced: { amount: '0.00', currency: 'PKR' } });
    expect(v.statements.map((s) => [s.ref, s.period, s.closing.amount])).toEqual([['RB-OS-0001', '2026-09', '0.00']]);
    expect(v.payouts).toEqual({ settled: [], pending: [] });
  });

  it('opens her own issued statement (without the office’s internal history); another landlord gets "not found"', async () => {
    const api = rentSession();
    const s = await api.as('rb_landlord_tahira').get<OwnerStatementView>('/portal/rentals/statements/ost_rb_0001');
    expect(s).toMatchObject({ state: 'issued', period: '2026-09', history: [], issuedByName: '' });
    const other = await refusal(api.as('rb_landlord_kashif').get('/portal/rentals/statements/ost_rb_0001'));
    const never = await refusal(api.as('rb_landlord_kashif').get('/portal/rentals/statements/ost_rb_9999'));
    expect(other).toEqual(never);
    expect(other).toMatchObject({ status: 404 });
  });

  it('Kashif sees his company’s verified flat only (an unverified claim reaches nothing); the lessee has no landlord view', async () => {
    const api = rentSession();
    const k = await api.as('rb_landlord_kashif').get<LandlordView>('/portal/rentals');
    expect(k.properties.map((p) => p.unitCode)).toEqual(['C-11']);
    expect(k.properties[0]!.lease).toMatchObject({ tenantName: 'Rizwan Ali' });
    expect(await refusal(api.as('rb_tenant_adeel').get('/portal/rentals'))).toMatchObject({ status: 404, code: 'not_found' });
    // Staff never use the landlord endpoints.
    expect(await refusal(api.as('rb_manager').get('/portal/rentals'))).toMatchObject({ status: 403 });
  });

  it('rentals withdrawn, the portal withdrawn, rentals on another site only, or the organisation suspended: refused at once', async () => {
    expect(await refusal(rentSession({ accessFor: everyone(withoutModules('rentals')) }).as('rb_landlord_tahira').get('/portal/rentals'))).toMatchObject({ status: 403, code: 'module_not_licensed' });
    expect(await refusal(rentSession({ accessFor: everyone(withoutModules('resident_portal')) }).as('rb_landlord_tahira').get('/portal/rentals'))).toMatchObject({ status: 403, code: 'module_not_licensed' });
    expect(await refusal(rentSession({ accessFor: everyone(rentalsOn('site_rb_villas')) }).as('rb_landlord_kashif').get('/portal/rentals'))).toMatchObject({ status: 403, code: 'site_not_licensed' });
    expect(await refusal(rentSession({ accessFor: everyone(suspended) }).as('rb_landlord_tahira').get('/portal/rentals'))).toMatchObject({ status: 403, code: 'tenant_suspended' });
  });

  it('rentals on Heights only: the Court flat and the Court lines of her statement disappear, with totals over what remains', async () => {
    const api = rentSession({ accessFor: everyone(rentalsOn('site_rb_heights')) }).as('rb_landlord_tahira');
    const v = await api.get<LandlordView>('/portal/rentals');
    expect(v.properties.map((p) => p.unitCode)).toEqual(['H-1204']);
    const s = await api.get<OwnerStatementView>('/portal/rentals/statements/ost_rb_0001');
    expect(s.scopeLimited).toBe(true);
    expect(s.lines.every((l) => l.siteId === 'site_rb_heights')).toBe(true);
    expect(s.memo.rentDue.amount).toBe('85000.00');
  });

  it('a landlord never sees a draft statement, the tenant’s other accounts or another landlord’s flats', async () => {
    const v = await rentSession().as('rb_landlord_tahira').get<LandlordView>('/portal/rentals');
    expect(JSON.stringify(v)).not.toMatch(/Rizwan|Mirza|Bushra|Farhan|ba_|RB-LA-|OSL-|Nida/);
    for (const p of v.properties) expect(Object.keys(p.lease ?? {}).sort()).toEqual(['from', 'period', 'ref', 'rent', 'roll', 'settlement', 'tenantName', 'to']);
  });
});
