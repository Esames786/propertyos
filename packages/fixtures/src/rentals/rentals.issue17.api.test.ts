import type { EffectiveAccess, LandlordView, ModuleGrant, OwnerStatementsList, OwnerStatementView, PartyLink, Persona, PayoutsView, PayoutView, AgreementView, LeaseView, RentRollView, StatementLineView } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { ALL_PERSONAS } from '../people';
import { rolesOf, starterRoles } from '../role-templates';
import { effectiveAccessFor, TENANT_DIRECTORY } from '../tenant-directory';
import { plus, refusal, rentalsOn, rentSession, sitesOnly, type RentSession } from './rent-test-kit';
import type { StoredStatement } from './state';
import { memoOf, totalsOf } from './views';

/**
 * GitHub Issue #17, GPT review of `7df5f80` (PROVISIONAL / HOLD), and the Issue #18 rules on rentals.
 *
 * P0: the landlord view (`GET /portal/rentals`, `GET /portal/rentals/statements/:id`) projects an
 * owner's statements and payout instructions by one site rule. The fictional owner Tahira Rehman lets
 * a flat at Riverbend Heights (site A) and one at Riverbend Court (site B); her landlord access to B is
 * then cut (the Court rentals grant withdrawn, her link to C-07 ended, or that link unverified). TEST
 * ONLY: settlement events, a payout instruction and a Court-only statement are injected or created
 * through the office routes, with amounts from site B and from the whole owner. The serialized portal
 * reads must name nothing of B or of the whole owner.
 *
 * P1: issuing a statement needs `owner_statement.issue`; reading it never publishes it.
 *
 * Issue #18: every rentals create binds its key to operation, person, target and request
 * (`idempotency_key_reused` otherwise); a settled line's bank reference is for the bank feed only.
 */
const TAHIRA = 'own_rb_tahira';
const LANDLORD = 'rb_landlord_tahira';

/** Refused (or read) requests leave Riverbend's records byte-identical. */
async function refusedUnchanged(api: RentSession, p: () => Promise<unknown>) {
  const before = api.snapshot();
  const r = await refusal(p());
  expect(api.snapshot()).toBe(before);
  return r;
}

type Cut = (p: Persona, a: EffectiveAccess) => EffectiveAccess;
const landlordLinks = (change: (l: PartyLink) => PartyLink) => (a: EffectiveAccess): EffectiveAccess => ({
  ...a,
  scopes: a.scopes.map((s) => (s.type === 'party' ? { ...s, links: s.links.map(change) } : s)),
});
const forLandlord = (change: (a: EffectiveAccess) => EffectiveAccess): Cut => (p, a) => (p.id === LANDLORD ? change(a) : a);

/** The three ways the landlord loses site B (Riverbend Court). */
const PARTIAL: ReadonlyArray<[string, Cut]> = [
  ['the Court rentals grant is withdrawn', (_p, a) => rentalsOn('site_rb_heights')(a)],
  ['her party link to C-07 has ended', forLandlord(landlordLinks((l) => (l.unitId === 'unt_rb_c07' ? { ...l, to: '2026-10-01' } : l)))],
  ['her link to C-07 is not verified', forLandlord(landlordLinks((l) => (l.unitId === 'unt_rb_c07' ? { ...l, verified: false } : l)))],
];

/**
 * A session whose access can be cut later (`cut`), with Tahira's records prepared while nothing is cut:
 * settled rent on both sites (TEST ONLY), a whole-owner payout instruction prepared and the October
 * statement issued through the office routes, and a Court-only issued statement (TEST ONLY) carrying a
 * whole-owner payout line.
 */
async function world() {
  let cut: Cut | null = null;
  const api = rentSession({
    accessFor: (p) => {
      const a = effectiveAccessFor(p);
      return a && cut ? cut(p, a) : a;
    },
  });
  await api.as('rb_accounts').get('/rentals/leases');
  const st = api.rent();
  st.settled.push(
    { id: 'set_p0_h', kind: 'rent', ownerId: TAHIRA, siteId: 'site_rb_heights', period: '2026-10', amount: { amount: '85000.00', currency: 'PKR' }, sourceRef: 'TEST-HEIGHTS-LINE-11' },
    { id: 'set_p0_c', kind: 'rent', ownerId: TAHIRA, siteId: 'site_rb_court', period: '2026-10', amount: { amount: '61234.00', currency: 'PKR' }, sourceRef: 'TEST-COURT-LINE-77' },
  );
  const payout = await api.post<PayoutView>('/rentals/payouts', { ownerId: TAHIRA, amount: '7777.00', note: 'Whole-owner payout instruction (test only)' }, { key: 'k-p0-po' });
  const october = await api.post<OwnerStatementView>('/rentals/owner-statements/issue', { ownerId: TAHIRA, period: '2026-10' }, { key: 'k-p0-st' });
  const courtLines: StatementLineView[] = [
    { kind: 'rent_settled', siteId: 'site_rb_court', siteName: 'Riverbend Court', basis: 'settled', amount: { amount: '59876.00', currency: 'PKR' }, source: { kind: 'lease', id: 'set_p0_c8', ref: 'TEST-COURT-LINE-88' }, state: 'settled' },
    { kind: 'payout_pending', siteId: '', siteName: '', basis: 'memo', amount: { amount: '5555.00', currency: 'PKR' }, source: { kind: 'payout', id: 'opi_rb_test_p0', ref: 'RB-PO-TEST-0098' }, state: 'awaiting_approval' },
  ];
  const courtOnly: StoredStatement = {
    id: 'ost_rb_test_court',
    ref: 'RB-OS-0098',
    ownerId: TAHIRA,
    period: '2026-08',
    body: { owner: { id: TAHIRA, name: 'Tahira Rehman', ref: 'RB-OW-001' }, period: '2026-08', model: 'agent', agreement: { ref: 'RB-MA-0001', version: 1, feePct: '8.00' }, lines: courtLines, totals: totalsOf(courtLines, 'agent', 0n), memo: memoOf(courtLines) },
    openingBySite: { site_rb_court: '0' },
    issuedBy: 'usr_rb_0004',
    issuedByName: 'Usman Ghani',
    issuedAt: '2026-09-03T11:30:00+05:00',
    history: [],
  };
  st.statements.push(courtOnly);
  return { api, payout, october, cutWith: (c: Cut) => void (cut = c) };
}

/** Whatever names site B or the whole owner: ids, refs, amounts, the tenant, payout metadata, bank refs. */
const hiddenOf = (payout: PayoutView) => [
  'site_rb_court', 'Riverbend Court', 'C-07', 'unt_rb_c07', 'lse_rb_0002', 'RB-LS-0002', 'Mehwish',
  '62000.00', '124000.00', '61234.00', '4898.72', '59876.00', '7777.00', '5555.00',
  'TEST-COURT-LINE-77', 'TEST-COURT-LINE-88', 'RB-OS-0098', 'ost_rb_test_court',
  'RB-PO-TEST-0098', 'opi_rb_test_p0', payout.ref, payout.id, 'awaiting_approval', 'payout_pending', 'payout_settled',
];

describe('Issue #17 P0: the landlord view projects owner-wide data by one site rule', () => {
  it('with authority over every site of the owner, the landlord keeps everything that is rightfully hers', async () => {
    const { api, payout, october } = await world();
    const v = await api.as(LANDLORD).get<LandlordView>('/portal/rentals');
    expect(v.properties.map((p) => p.unitCode)).toEqual(['H-1204', 'C-07']);
    expect(v.statements.map((s) => [s.ref, s.period, s.scopeLimited])).toEqual([['RB-OS-0002', '2026-10', false], ['RB-OS-0001', '2026-09', false], ['RB-OS-0098', '2026-08', false]]);
    expect(v.payouts.pending).toEqual([{ ref: payout.ref, amount: { amount: '7777.00', currency: 'PKR' }, state: 'awaiting_approval' }]);
    const s = await api.get<OwnerStatementView>(`/portal/rentals/statements/${october.id}`);
    expect(s.scopeLimited).toBe(false);
    expect(s.lines.find((l) => l.kind === 'payout_pending')).toMatchObject({ siteId: '', amount: { amount: '7777.00' } });
    expect(s.lines.filter((l) => l.siteId === 'site_rb_court').map((l) => l.amount.amount)).toEqual(['62000.00', '61234.00', '4898.72', '124000.00']);
    // Fee 8 %: 85,000 + 61,234 − 6,800 − 4,898.72.
    expect(s.totals.closing.amount).toBe('134535.28');
    expect((await api.get<OwnerStatementView>('/portal/rentals/statements/ost_rb_test_court')).lines).toHaveLength(2);
    // Issue #18: a landlord never holds the bank feed, so no settled line names the bank's line.
    expect(JSON.stringify([v, s])).not.toMatch(/TEST-(HEIGHTS|COURT)-LINE/);
  });

  for (const [why, cut] of PARTIAL) {
    it(`when ${why}: no site-B or whole-owner id, ref, amount, tenant, payout or count reaches her; hidden statements answer like unknown ones`, async () => {
      const { api, payout, october, cutWith } = await world();
      cutWith(cut);
      api.as(LANDLORD);
      const before = api.snapshot();
      const v = await api.get<LandlordView>('/portal/rentals');
      expect(v.properties.map((p) => p.unitCode)).toEqual(['H-1204']);
      // Both statements with Heights lines are listed as partial; the Court-only one is not listed at all.
      expect(v.statements.map((s) => [s.id, s.ref, s.scopeLimited])).toEqual([[october.id, 'RB-OS-0002', true], ['ost_rb_0001', 'RB-OS-0001', true]]);
      expect(v.statements.map((s) => s.closing.amount)).toEqual(['78200.00', '0.00']);
      // A payout instruction belongs to the whole owner: not sent.
      expect(v.payouts).toEqual({ settled: [], pending: [] });
      expect(Object.keys(v).sort()).toEqual(['name', 'payouts', 'properties', 'statements', 'today']);

      const oct = await api.get<OwnerStatementView>(`/portal/rentals/statements/${october.id}`);
      expect(oct.scopeLimited).toBe(true);
      expect(oct.lines.every((l) => l.siteId === 'site_rb_heights')).toBe(true);
      expect(oct.lines.map((l) => [l.kind, l.amount.amount])).toEqual([['rent_due', '85000.00'], ['rent_settled', '85000.00'], ['management_fee', '6800.00'], ['owner_expense', '18500.00'], ['deposit_held', '170000.00']]);
      expect(oct.totals).toMatchObject({ opening: { amount: '0.00' }, settledRent: { amount: '85000.00' }, fees: { amount: '6800.00' }, settledPayouts: { amount: '0.00' }, closing: { amount: '78200.00' } });
      expect(oct.memo).toMatchObject({ rentDue: { amount: '85000.00' }, depositsAgreed: { amount: '170000.00' }, pendingPayouts: { amount: '0.00' } });
      const sept = await api.get<OwnerStatementView>('/portal/rentals/statements/ost_rb_0001');
      expect(sept.scopeLimited).toBe(true);
      expect(sept.lines.every((l) => l.siteId === 'site_rb_heights')).toBe(true);

      const serialized = JSON.stringify([v, oct, sept]);
      for (const token of hiddenOf(payout)) expect(serialized, token).not.toContain(token);
      expect(serialized).not.toMatch(/TEST-HEIGHTS-LINE/);
      expect(serialized).not.toMatch(/"siteId":""/);

      // A statement with no permitted site, another owner's id and a never-issued id: the same answer.
      const hidden = await refusedUnchanged(api, () => api.get('/portal/rentals/statements/ost_rb_test_court'));
      const unknown = await refusedUnchanged(api, () => api.get('/portal/rentals/statements/ost_rb_9999'));
      expect(hidden).toEqual(unknown);
      expect(hidden).toMatchObject({ status: 404, code: 'not_found' });
      // Reading changed nothing either.
      expect(api.snapshot()).toBe(before);
    });
  }

  it('the office follows the same rule: with a site of the owner withdrawn, nobody holds the whole owner (fail closed)', async () => {
    const { api, payout, cutWith } = await world();
    cutWith((_p, a) => rentalsOn('site_rb_heights')(a));
    api.as('rb_accounts');
    const s = await api.get<OwnerStatementView>('/rentals/owner-statements/statement', { owner: TAHIRA, period: '2026-10' });
    expect(s).toMatchObject({ scopeLimited: true, actions: { issue: false }, blocked: 'other_sites' });
    expect(s.lines.every((l) => l.siteId === 'site_rb_heights')).toBe(true);
    const p = await api.get<PayoutsView>('/rentals/payouts');
    expect(p.owners.find((o) => o.id === TAHIRA)).toMatchObject({ holds: ['other_sites'] });
    // The office's counts are keyed by state name; the instruction she cannot see is not counted.
    expect(p.instructions).toEqual([]);
    expect(p.counts).toEqual({ awaiting_approval: 0, approved: 0, rejected: 0, cancelled: 0 });
    const serialized = JSON.stringify([s, { ...p, counts: undefined }]);
    for (const token of hiddenOf(payout)) expect(serialized, token).not.toContain(token);
    expect(await refusedUnchanged(api, () => api.post('/rentals/owner-statements/issue', { ownerId: TAHIRA, period: '2026-09' }))).toMatchObject({ status: 403, code: 'other_sites' });
    expect(await refusedUnchanged(api, () => api.post('/rentals/payouts', { ownerId: TAHIRA, amount: '1.00', note: 'Should be refused' }))).toMatchObject({ status: 403, code: 'other_sites' });
  });
});

/** Riverbend's access with the banking module and `bank.view` (a test identity of the bank feed). */
const withBankFeed = (a: EffectiveAccess): EffectiveAccess => {
  const banking: ModuleGrant = { module: 'banking', sites: 'all', from: '2026-01-01', source: 'override' };
  return plus('bank.view')({ ...a, grants: a.grants.some((g) => g.module === 'banking') ? a.grants : [...a.grants, banking] });
};

describe('Issue #18 rule on rentals: a settled line’s bank reference is for the bank feed only', () => {
  it('without bank.view or bank.reconcile the settled line keeps its amount, never the bank’s line reference', async () => {
    let feed = false;
    const api = rentSession({ accessFor: (p) => {
      const a = effectiveAccessFor(p);
      return a && feed && p.id === 'rb_accounts' ? withBankFeed(a) : a;
    } }).as('rb_accounts');
    await api.get('/rentals/leases');
    api.rent().settled.push({ id: 'set_b18', kind: 'rent', ownerId: TAHIRA, siteId: 'site_rb_heights', period: '2026-10', amount: { amount: '85000.00', currency: 'PKR' }, sourceRef: 'TEST-BANK-LINE-18' });
    const plain = await api.get<OwnerStatementView>('/rentals/owner-statements/statement', { owner: TAHIRA, period: '2026-10' });
    expect(plain.lines.find((l) => l.kind === 'rent_settled')).toMatchObject({ amount: { amount: '85000.00' }, source: { ref: '' } });
    expect(JSON.stringify(plain)).not.toContain('TEST-BANK-LINE-18');
    feed = true;
    const bank = await api.get<OwnerStatementView>('/rentals/owner-statements/statement', { owner: TAHIRA, period: '2026-10' });
    expect(bank.lines.find((l) => l.kind === 'rent_settled')).toMatchObject({ source: { ref: 'TEST-BANK-LINE-18' } });
  });
});

describe('Issue #17 P1: issuing a statement needs owner_statement.issue; reading never publishes', () => {
  it('view-only readers see why they cannot issue; a direct POST is refused before any id is read, and nothing changes', async () => {
    const api = rentSession();
    await api.get('/rentals/leases');
    for (const who of ['rb_manager', 'rb_finance', 'rb_director']) {
      const s = await api.as(who).get<OwnerStatementView>('/rentals/owner-statements/statement', { owner: TAHIRA, period: '2026-10' });
      expect(s, who).toMatchObject({ state: 'draft', scopeLimited: false, actions: { issue: false }, blocked: 'issue_permission' });
      const real = await refusedUnchanged(api, () => api.as(who).post('/rentals/owner-statements/issue', { ownerId: TAHIRA, period: '2026-10' }, { key: `k-${who}` }));
      const never = await refusedUnchanged(api, () => api.as(who).post('/rentals/owner-statements/issue', { ownerId: 'own_rb_nobody', period: '2026-10' }));
      expect(real, who).toMatchObject({ status: 403, code: 'permission_missing' });
      expect(never, who).toEqual(real);
    }
    expect(api.rent().statements.map((s) => s.ref)).toEqual(['RB-OS-0001']);
  });

  it('the client money accounts officer issues it', async () => {
    const api = rentSession().as('rb_accounts');
    const s = await api.get<OwnerStatementView>('/rentals/owner-statements/statement', { owner: TAHIRA, period: '2026-10' });
    expect(s.actions.issue).toBe(true);
    expect(s.blocked).toBeUndefined();
    const issued = await api.post<OwnerStatementView>('/rentals/owner-statements/issue', { ownerId: TAHIRA, period: '2026-10' });
    expect(issued).toMatchObject({ state: 'issued', ref: 'RB-OS-0002', issuedByName: 'Usman Ghani', blocked: 'already_issued' });
  });

  it('only Riverbend’s client money accounts officer role holds it: no other role and no starter set', () => {
    const holders = TENANT_DIRECTORY.flatMap((t) => rolesOf(t.id, t.type).filter((r) => r.permissions.includes('owner_statement.issue')).map((r) => `${t.id}/${r.id}`));
    expect(holders).toEqual(['tnt_riverbend/accounts_officer']);
    for (const t of TENANT_DIRECTORY) expect(starterRoles(t.id, t.type).some((r) => r.permissions.includes('owner_statement.issue')), t.id).toBe(false);
    const people = ALL_PERSONAS.filter((p) => effectiveAccessFor(p)?.permissions.includes('owner_statement.issue')).map((p) => p.id);
    expect(people).toEqual(['rb_accounts']);
  });
});

describe('Issue #18 rule on rentals: every create binds its key to operation, person, target and request', () => {
  const REUSED = { status: 409, code: 'idempotency_key_reused', messageKey: 'rentals:problems.idempotencyKeyReused', fields: [], errors: {} };

  it('lease renewal', async () => {
    const api = rentSession();
    const body = { to: '2027-12-15', rent: '64000.00', reason: 'Tenant renews for a year at the agreed rent.' };
    const a = await api.post<LeaseView>('/rentals/leases/lse_rb_0002/renew', body, { key: 'k-renew' });
    const b = await api.post<LeaseView>('/rentals/leases/lse_rb_0002/renew', { ...body, reason: ` ${body.reason} ` }, { key: 'k-renew' });
    expect(b.versions).toHaveLength(2);
    expect(b.versions).toEqual(a.versions);
    expect(await refusedUnchanged(api, () => api.post('/rentals/leases/lse_rb_0002/renew', { ...body, rent: '65000.00' }, { key: 'k-renew' }))).toEqual(REUSED);
    expect(await refusedUnchanged(api, () => api.as('rb_accounts').post('/rentals/leases/lse_rb_0002/renew', body, { key: 'k-renew' }))).toEqual(REUSED);
    expect(await refusedUnchanged(api, () => api.as('rb_manager').post('/rentals/leases/lse_rb_0001/renew', body, { key: 'k-renew' }))).toEqual(REUSED);
  });

  it('rent roll preview', async () => {
    const api = rentSession();
    const a = await api.post<RentRollView>('/rentals/rent-roll/2026-11/preview', {}, { key: 'k-roll' });
    const b = await api.post<RentRollView>('/rentals/rent-roll/2026-11/preview', {}, { key: 'k-roll' });
    expect([a.version, b.version]).toEqual([1, 1]);
    expect(api.rent().rolls.find((r) => r.period === '2026-11')!.history).toHaveLength(1);
    expect(await refusedUnchanged(api, () => api.as('rb_accounts').post('/rentals/rent-roll/2026-11/preview', {}, { key: 'k-roll' }))).toEqual(REUSED);
    expect(await refusedUnchanged(api, () => api.as('rb_manager').post('/rentals/rent-roll/2026-12/preview', {}, { key: 'k-roll' }))).toEqual(REUSED);
  });

  it('statement issue', async () => {
    const api = rentSession({ accessFor: (p) => {
      const a = effectiveAccessFor(p);
      return a && p.id === 'rb_finance' ? plus('owner_statement.issue')(a) : a;
    } }).as('rb_accounts');
    const a = await api.post<OwnerStatementView>('/rentals/owner-statements/issue', { ownerId: TAHIRA, period: '2026-10' }, { key: 'k-ost' });
    const b = await api.post<OwnerStatementView>('/rentals/owner-statements/issue', { ownerId: TAHIRA, period: '2026-10' }, { key: 'k-ost' });
    expect(b.id).toBe(a.id);
    expect(api.rent().statements).toHaveLength(2);
    expect(await refusedUnchanged(api, () => api.post('/rentals/owner-statements/issue', { ownerId: TAHIRA, period: '2026-09' }, { key: 'k-ost' }))).toEqual(REUSED);
    expect(await refusedUnchanged(api, () => api.as('rb_finance').post('/rentals/owner-statements/issue', { ownerId: TAHIRA, period: '2026-10' }, { key: 'k-ost' }))).toEqual(REUSED);
  });

  it('owner payout instruction', async () => {
    const api = rentSession({ accessFor: (p) => {
      const a = effectiveAccessFor(p);
      return a && p.id === 'rb_finance' ? plus('owner_payout.prepare')(a) : a;
    } }).as('rb_accounts');
    await api.get('/rentals/leases');
    api.rent().settled.push({ id: 'set_k', kind: 'rent', ownerId: TAHIRA, siteId: 'site_rb_heights', period: '2026-10', amount: { amount: '85000.00', currency: 'PKR' }, sourceRef: 'TEST-LINE-K' });
    const body = { ownerId: TAHIRA, amount: '1000.00', note: 'October payout to the owner' };
    const a = await api.post<PayoutView>('/rentals/payouts', body, { key: 'k-opi' });
    const b = await api.post<PayoutView>('/rentals/payouts', body, { key: 'k-opi' });
    expect(b.id).toBe(a.id);
    expect(api.rent().payouts).toHaveLength(1);
    expect(await refusedUnchanged(api, () => api.post('/rentals/payouts', { ...body, amount: '1000.01' }, { key: 'k-opi' }))).toEqual(REUSED);
    expect(await refusedUnchanged(api, () => api.as('rb_finance').post('/rentals/payouts', body, { key: 'k-opi' }))).toEqual(REUSED);
    expect(await refusedUnchanged(api, () => api.as('rb_accounts').post('/rentals/owner-statements/issue', { ownerId: TAHIRA, period: '2026-10' }, { key: 'k-opi' }))).toEqual(REUSED);
  });

  it('management agreement version', async () => {
    const api = rentSession().as('rb_director');
    const body = { effectiveFrom: '2026-11-01', model: 'agent', feePct: '8.00', depositHolding: 'client_deposit_account', depositMaxMonths: 2, collectOnBehalf: true, signedReference: 'RB-MA-2026-044 (fictional)', signedDate: '2026-10-26', note: 'Signed today.' };
    const a = await api.post<AgreementView>('/rentals/settings/agreements/agr_rb_0004/versions', body, { key: 'k-agr' });
    const b = await api.post<AgreementView>('/rentals/settings/agreements/agr_rb_0004/versions', body, { key: 'k-agr' });
    expect(b.versions).toEqual(a.versions);
    expect(await refusedUnchanged(api, () => api.post('/rentals/settings/agreements/agr_rb_0004/versions', { ...body, note: 'Another note.' }, { key: 'k-agr' }))).toEqual(REUSED);
    expect(await refusedUnchanged(api, () => api.as('rb_finance').post('/rentals/settings/agreements/agr_rb_0004/versions', body, { key: 'k-agr' }))).toEqual(REUSED);
  });
});

/**
 * GPT's follow-up review of `d050bad` (Issue #17, 6 November 2026): the office's owner-statement list
 * (`GET /rentals/owner-statements`) and lookup (`GET /rentals/owner-statements/statement`) must not
 * disclose an issued statement whose every source is at a site the reader may not see: no id, ref,
 * period, issuer, date or "issued" state. TEST ONLY: an October statement for Tahira Rehman sourced
 * only from Riverbend Court (B), with a whole-owner payout line; the reader (Usman, who may read and
 * issue) is limited to Riverbend Heights (A). A mixed A + B statement (September) stays visible as a
 * labelled partial statement.
 */
const B_ONLY_LINES: StatementLineView[] = [
  { kind: 'rent_due', siteId: 'site_rb_court', siteName: 'Riverbend Court', unitCode: 'C-07', leaseId: 'lse_rb_0002', leaseRef: 'RB-LS-0002', basis: 'memo', amount: { amount: '62000.00', currency: 'PKR' }, source: { kind: 'rent_roll', id: '2026-10', ref: 'lse_rb_0002:2026-10:v1' }, state: 'approved_demand' },
  { kind: 'deposit_held', siteId: 'site_rb_court', siteName: 'Riverbend Court', unitCode: 'C-07', leaseId: 'lse_rb_0002', leaseRef: 'RB-LS-0002', basis: 'memo', amount: { amount: '124000.00', currency: 'PKR' }, source: { kind: 'lease', id: 'lse_rb_0002', ref: 'RB-LS-0002' }, state: 'awaiting_evidence' },
  { kind: 'payout_pending', siteId: '', siteName: '', basis: 'memo', amount: { amount: '4444.00', currency: 'PKR' }, source: { kind: 'payout', id: 'opi_rb_test_b', ref: 'RB-PO-TEST-0099' }, state: 'awaiting_approval' },
];
const B_ONLY: StoredStatement = {
  id: 'ost_rb_test_b',
  ref: 'RB-OS-0099',
  ownerId: TAHIRA,
  period: '2026-10',
  body: { owner: { id: TAHIRA, name: 'Tahira Rehman', ref: 'RB-OW-001' }, period: '2026-10', model: 'agent', agreement: { ref: 'RB-MA-0001', version: 1, feePct: '8.00' }, lines: B_ONLY_LINES, totals: totalsOf(B_ONLY_LINES, 'agent', 0n), memo: memoOf(B_ONLY_LINES) },
  openingBySite: { site_rb_court: '0' },
  issuedBy: 'usr_rb_0004',
  issuedByName: 'Usman Ghani',
  issuedAt: '2026-10-20T10:00:00+05:00',
  history: [{ at: '2026-10-20T10:00:00+05:00', by: 'usr_rb_0004', byName: 'Usman Ghani', action: 'statement_issued', values: { period: '2026-10', closing: '0.00' } }],
};
const HIDDEN_B = ['ost_rb_test_b', 'RB-OS-0099', '2026-10-20T10:00', 'RB-PO-TEST-0099', '4444.00', 'Riverbend Court', 'C-07', '62000.00', '124000.00'];

/** Usman's office session, with or without the Court-only statement; `cutWith` narrows his access later. */
async function officeWorld(withBOnly: boolean) {
  let cut: ((a: EffectiveAccess) => EffectiveAccess) | null = null;
  const api = rentSession({
    accessFor: (p) => {
      const a = effectiveAccessFor(p);
      return a && cut && p.id === 'rb_accounts' ? cut(a) : a;
    },
  }).as('rb_accounts');
  await api.get('/rentals/leases');
  if (withBOnly) api.rent().statements.push(structuredClone(B_ONLY));
  return { api, cutWith: (c: (a: EffectiveAccess) => EffectiveAccess) => void (cut = c) };
}
const LIST = '/rentals/owner-statements';
const STATEMENT = '/rentals/owner-statements/statement';

describe('Issue #17 follow-up: the office statement list and lookup never disclose a statement of hidden sites only', () => {
  it('a reader limited to Heights: list and lookup answer exactly as if the Court-only statement had never been issued; the mixed statement stays a labelled partial', async () => {
    const withB = await officeWorld(true);
    const without = await officeWorld(false);
    for (const w of [withB, without]) w.cutWith(sitesOnly('site_rb_heights'));
    const before = withB.api.snapshot();

    const list = await withB.api.get<OwnerStatementsList>(LIST);
    expect(JSON.stringify(list)).toBe(JSON.stringify(await without.api.get<OwnerStatementsList>(LIST)));
    expect(list.owners.find((o) => o.id === TAHIRA)).toMatchObject({ scopeLimited: true, issued: [{ id: 'ost_rb_0001', ref: 'RB-OS-0001', period: '2026-09' }] });

    const oct = await withB.api.get<OwnerStatementView>(STATEMENT, { owner: TAHIRA, period: '2026-10' });
    expect(JSON.stringify(oct)).toBe(JSON.stringify(await without.api.get<OwnerStatementView>(STATEMENT, { owner: TAHIRA, period: '2026-10' })));
    expect(oct).toMatchObject({ state: 'draft', scopeLimited: true, history: [], actions: { issue: false }, blocked: 'other_sites' });
    for (const k of ['id', 'ref', 'issuedByName', 'issuedAt'] as const) expect(oct[k], k).toBeUndefined();
    expect(oct.lines.every((l) => l.siteId === 'site_rb_heights')).toBe(true);

    for (const token of HIDDEN_B) expect(JSON.stringify([list, oct]), token).not.toContain(token);

    // The mixed Heights + Court statement of September: issued, labelled partial, Heights lines only.
    const sept = await withB.api.get<OwnerStatementView>(STATEMENT, { owner: TAHIRA, period: '2026-09' });
    expect(sept).toMatchObject({ state: 'issued', ref: 'RB-OS-0001', scopeLimited: true });
    expect(sept.lines.length).toBeGreaterThan(0);
    expect(sept.lines.every((l) => l.siteId === 'site_rb_heights')).toBe(true);
    // Issuing is refused before anything is read, and nothing changed.
    expect(await refusedUnchanged(withB.api, () => withB.api.post('/rentals/owner-statements/issue', { ownerId: TAHIRA, period: '2026-10' }))).toMatchObject({ status: 403, code: 'other_sites' });
    expect(withB.api.snapshot()).toBe(before);
  });

  it('a reader limited to Court sees the Court-only statement as issued, labelled partial and without its whole-owner line', async () => {
    const { api, cutWith } = await officeWorld(true);
    cutWith(sitesOnly('site_rb_court'));
    const before = api.snapshot();
    const list = await api.get<OwnerStatementsList>(LIST);
    expect(list.owners.find((o) => o.id === TAHIRA)!.issued.map((s) => s.ref)).toEqual(['RB-OS-0001', 'RB-OS-0099']);
    const oct = await api.get<OwnerStatementView>(STATEMENT, { owner: TAHIRA, period: '2026-10' });
    expect(oct).toMatchObject({ state: 'issued', ref: 'RB-OS-0099', scopeLimited: true });
    expect(oct.lines.map((l) => l.kind)).toEqual(['rent_due', 'deposit_held']);
    expect(JSON.stringify(oct)).not.toContain('RB-PO-TEST-0099');
    expect(api.snapshot()).toBe(before);
  });

  it('the full-scope officer keeps every statement, the Court-only one issued and whole; withdrawing the Court grant hides it on the next request', async () => {
    const withB = await officeWorld(true);
    const without = await officeWorld(false);
    const before = withB.api.snapshot();
    const full = await withB.api.get<OwnerStatementsList>(LIST);
    expect(full.owners.find((o) => o.id === TAHIRA)!.issued.map((s) => s.ref)).toEqual(['RB-OS-0001', 'RB-OS-0099']);
    const oct = await withB.api.get<OwnerStatementView>(STATEMENT, { owner: TAHIRA, period: '2026-10' });
    expect(oct).toMatchObject({ state: 'issued', id: 'ost_rb_test_b', ref: 'RB-OS-0099', issuedByName: 'Usman Ghani', scopeLimited: false, actions: { issue: false }, blocked: 'already_issued' });
    expect(oct.lines.find((l) => l.kind === 'payout_pending')).toMatchObject({ amount: { amount: '4444.00' } });
    // Revocation applies at once: the Court rentals grant is withdrawn (fail closed for every reader).
    for (const w of [withB, without]) w.cutWith(rentalsOn('site_rb_heights'));
    const list = await withB.api.get<OwnerStatementsList>(LIST);
    expect(JSON.stringify(list)).toBe(JSON.stringify(await without.api.get<OwnerStatementsList>(LIST)));
    const after = await withB.api.get<OwnerStatementView>(STATEMENT, { owner: TAHIRA, period: '2026-10' });
    expect(JSON.stringify(after)).toBe(JSON.stringify(await without.api.get<OwnerStatementView>(STATEMENT, { owner: TAHIRA, period: '2026-10' })));
    for (const token of HIDDEN_B) expect(JSON.stringify([list, after]), token).not.toContain(token);
    expect(withB.api.snapshot()).toBe(before);
  });
});
