import type { AdvancesList, Employee360, LeaveRequestView, PayAccounting, PayBreakdown, PayDashboard, PayDisbursements, PayExport, PayInstructionView, PayPeriodsList, PayPeriodView, PayRunsList, PayRunView, StaffAdvanceView } from '@repo/contracts';
import { describe, expect, it } from 'vitest';
import { addFictionalSites } from '../hr/multisite.fixture';
import { TENANT_DIRECTORY } from '../tenant-directory';
import { changed, paySession, plus, refusal, sitesOnly, withoutModules, type PaySession } from './pay-test-kit';
import vectors from './payroll.vectors.json';

/**
 * Gate S.2b payroll through the fail-closed mock server, with Al-Noor's fictional staff: Saba (accounts
 * officer) prepares, Ayesha (treasurer) approves; Imran (building manager, HR), Rabia (committee
 * secretary, HR administrator), the supervisors and the residents never see pay. Every refusal is
 * checked to leave the stored records byte-identical.
 */
const RUN = 'prn_anr_0001';
const OCT = 'ppd_anr_2026_10';
const NOV = 'ppd_anr_2026_11';
const E = { shahid: 'emp_anr_001', asif: 'emp_anr_002', zubair: 'emp_anr_003', karim: 'emp_anr_004', nadeem: 'emp_anr_005', faisal: 'emp_anr_006', tariq: 'emp_anr_007', naveed: 'emp_anr_008', waqas: 'emp_anr_009', bilal: 'emp_anr_010', rukhsana: 'emp_anr_011', ghulam: 'emp_anr_012', imran: 'emp_anr_013', saba: 'emp_anr_014', javed: 'emp_anr_015' };
const SABA = 'alnoor_accounts';
const AYESHA = 'alnoor_treasurer';
const IMRAN = 'alnoor_manager';
const RABIA = 'alnoor_admin';
const REASON = 'Paper attendance register for 1 to 18 October checked.';
const run = (api: PaySession) => api.as(SABA).get<PayRunView>(`/payroll/runs/${RUN}`);
const line = (api: PaySession, id: string) => api.get<PayBreakdown>(`/payroll/runs/${RUN}/lines/${id}`);

/** The two daily-wage lines confirmed: the run can then be submitted. */
async function confirmDaily(api: PaySession) {
  await api.as(SABA).post(`/payroll/runs/${RUN}/lines/${E.tariq}/days`, { days: 23, reason: REASON });
  await api.as(SABA).post(`/payroll/runs/${RUN}/lines/${E.rukhsana}/days`, { days: 26, reason: REASON });
}

async function approvedRun(api: PaySession) {
  await confirmDaily(api);
  await api.as(SABA).post(`/payroll/runs/${RUN}/submit`);
  return api.as(AYESHA).post<PayRunView>(`/payroll/runs/${RUN}/approve`, { acknowledge: true, note: 'Checked against the attendance summary.' });
}

/** Expects a refusal and that nothing stored changed. */
async function refusedUnchanged(api: PaySession, request: () => Promise<unknown>) {
  await api.as(SABA).get('/payroll/dashboard');
  const before = api.snapshot();
  const r = await refusal(request());
  expect(api.snapshot()).toBe(before);
  return r;
}

const READS = [
  '/payroll/dashboard',
  '/payroll/periods',
  '/payroll/runs',
  `/payroll/runs/${RUN}`,
  `/payroll/runs/${RUN}/lines/${E.shahid}`,
  `/payroll/runs/${RUN}/export`,
  `/payroll/employees/${E.shahid}/latest`,
  '/payroll/disbursements',
  '/payroll/accounting',
];

describe('S.2b licence, permissions and who sees pay', () => {
  it('the preparer and the approver see payroll; HR staff, supervisors and residents never see a wage', async () => {
    const api = paySession();
    expect((await api.as(SABA).get<PayDashboard>('/payroll/dashboard')).kpis.staffInRun).toBe(14);
    expect((await api.as(AYESHA).get<PayRunView>(`/payroll/runs/${RUN}`)).totals.net.amount).toBe('650500.00');
    for (const persona of [IMRAN, RABIA, 'alnoor_guard', 'alnoor_maintenance', 'alnoor_technician']) {
      for (const path of READS) expect(await refusal(api.as(persona).get(path)), `${persona} ${path}`).toMatchObject({ status: 403, code: 'permission_missing' });
    }
    for (const path of READS) expect((await refusal(api.as('alnoor_owner_a201').get(path))).status, path).toBe(403);
    // Employee 360 (hr.view) carries no pay: no amount of the pay terms, no payroll link data.
    const shahid = JSON.stringify(await api.as(IMRAN).get<Employee360>(`/hr/employees/${E.shahid}`));
    for (const secret of ['55000', '58000', '3000.00', 'payroll', 'Demo Bank']) expect(shahid).not.toContain(secret);
  });

  it('HR keeps working without payroll; payroll without HR is refused; no other organisation or preset gains payroll', async () => {
    const noPay = paySession({ accessFor: withoutModules('payroll') });
    expect(await refusal(noPay.as(SABA).get('/payroll/dashboard'))).toMatchObject({ status: 403, code: 'module_not_licensed' });
    expect((await noPay.as(IMRAN).get<{ items: unknown[] }>('/hr/employees')).items.length).toBeGreaterThan(10);
    const noHr = paySession({ accessFor: withoutModules('hr') });
    expect(await refusal(noHr.as(SABA).get('/payroll/dashboard'))).toMatchObject({ status: 403, code: 'module_not_licensed' });
    // Only Al-Noor has the fictional payroll amendment among societies (a developer's preset payroll is
    // Gate E, and the society payroll does not exist for it: see below).
    expect(TENANT_DIRECTORY.filter((t) => t.type !== 'developer' && t.modules.some((m) => m.module === 'payroll')).map((t) => t.id)).toEqual(['tnt_alnoor']);
    expect(TENANT_DIRECTORY.filter((t) => t.edition === 'community' && t.modules.some((m) => m.module === 'payroll' && !m.from)).map((t) => t.id)).toEqual([]);
    const api = paySession();
    expect((await refusal(api.as('society_admin').get('/payroll/dashboard'))).status).toBe(403);
    expect(await refusal(api.as('manager').get('/payroll/dashboard'))).toMatchObject({ status: 403, code: 'permission_missing' });
    // A developer's payroll is Gate E: even with the permission, the society payroll does not exist there.
    const dev = paySession({ accessFor: changed(['manager'], plus('payroll.view')) });
    expect(await refusal(dev.as('manager').get('/payroll/dashboard'))).toMatchObject({ status: 404, code: 'not_found' });
  });

  it('a suspended organisation keeps its payroll history readable and changes nothing; a licence not yet in force refuses everything', async () => {
    const suspended = paySession({ accessFor: changed([SABA, AYESHA], (a) => ({ ...a, tenant: { ...a.tenant, status: 'suspended' } })) });
    expect((await suspended.as(SABA).get<PayRunView>(`/payroll/runs/${RUN}`)).version).toBe(2);
    expect((await refusedUnchanged(suspended, () => suspended.as(SABA).post(`/payroll/runs/${RUN}/recompute`))).code).toBe('tenant_suspended');
    expect((await refusedUnchanged(suspended, () => suspended.as(SABA).post('/payroll/periods', { legalEntityId: 'le_alnoor', month: '2026-12', payDate: '2026-12-31' }))).code).toBe('tenant_suspended');
    const later = paySession({ accessFor: changed([SABA], (a) => ({ ...a, grants: a.grants.map((g) => (g.module === 'payroll' ? { ...g, from: '2026-11-01' } : g)) })) });
    expect(await refusal(later.as(SABA).get('/payroll/dashboard'))).toMatchObject({ status: 403, code: 'module_not_licensed' });
    const revoked = paySession({ accessFor: changed([SABA], (a) => ({ ...a, grants: a.grants.map((g) => (g.module === 'payroll' ? { ...g, to: '2026-10-20' } : g)) })) });
    expect(await refusal(revoked.as(SABA).get(`/payroll/runs/${RUN}`))).toMatchObject({ status: 403, code: 'module_not_licensed' });
  });

  it('payroll cannot be practised in training mode: nothing changes', async () => {
    const api = paySession();
    const r = await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${RUN}/lines/${E.tariq}/days`, { days: 20, reason: REASON }, { training: true }));
    expect(r).toMatchObject({ status: 403, code: 'training_not_supported' });
  });
});

describe('S.2b reference flow: run → breakdown → review → finalise → instruction, never paid', () => {
  it('Saba resolves the blockers and submits; Ayesha approves an obligation; the instruction is approved and "sent (simulated)"; nothing is ever paid or settled', async () => {
    const api = paySession();
    let r = await run(api);
    expect([r.ref, r.state, r.version, r.stale]).toEqual(['ANR-PR-2026-10', 'draft', 2, false]);
    expect(r.lines.map((l) => l.employeeName)).not.toContain('Javed Akhtar');
    expect(r.lines.filter((l) => l.blockers.length).map((l) => `${l.employeeName} ${l.blockers}`)).toEqual(['Tariq Javed days_unconfirmed', 'Rukhsana Bibi days_unconfirmed']);
    expect(r.lines.find((l) => l.employeeId === E.zubair)!.warnings).toEqual(['absences']);
    expect(r.lines.find((l) => l.employeeId === E.karim)!.warnings).toEqual(['bank_unverified']);
    expect(r.lines.find((l) => l.employeeId === E.saba)!.own).toBe(true);
    expect(r.policies.find((p) => p.key === 'statutory')!.state).toBe('not_configured');
    expect((await refusal(api.as(SABA).post(`/payroll/runs/${RUN}/submit`))).code).toBe('line_blockers');

    // PAY-004: Tariq's daily wage needs his days confirmed; HR recorded part of the month only.
    const tariq = await line(api.as(SABA), E.tariq);
    expect(tariq.days).toMatchObject({ recorded: 6, recordedFrom: '2026-10-19' });
    expect(tariq.deductions.statutory.map((s) => `${s.key} ${s.state}`)).toEqual(['income_tax not_configured', 'eobi not_configured', 'social_security not_configured']);
    await confirmDaily(api);
    const bonus = await api.as(SABA).post<PayBreakdown>(`/payroll/runs/${RUN}/lines/${E.shahid}/bonuses`, { label: 'Night patrol cover', amount: '5,000', reason: 'Covered the night patrol during the wedding week.' });
    expect([bonus.gross.amount, bonus.net.amount, bonus.bonuses.length]).toEqual(['63000.00', '63000.00', 1]);
    r = await run(api);
    expect([r.version, r.totals.net.amount, r.totals.blocked, r.runBlockers]).toEqual([5, '735050.00', 0, []]);
    expect(r.versions.map((v) => v.reason)).toEqual(['prepared', 'recalculated', 'days_confirmed', 'days_confirmed', 'bonus_added']);

    const submitted = await api.as(SABA).post<PayRunView>(`/payroll/runs/${RUN}/submit`);
    expect([submitted.state, submitted.actions.edit, submitted.actions.withdraw]).toEqual(['submitted', false, true]);
    // PAY-005: an approval needs the explicit acknowledgement that it approves what is owed, not a payment.
    expect((await refusedUnchanged(api, () => api.as(AYESHA).post(`/payroll/runs/${RUN}/approve`, {}))).fields).toEqual(['acknowledge']);
    const approved = await api.as(AYESHA).post<PayRunView>(`/payroll/runs/${RUN}/approve`, { acknowledge: true });
    expect([approved.state, approved.approvedByName, approved.makers]).toEqual(['approved', 'Ayesha Malik', ['Saba Javed']]);
    const boundary = async (label: string) => {
      const acc = await api.as(SABA).get<PayAccounting>('/payroll/accounting');
      const dash = await api.get<PayDashboard>('/payroll/dashboard');
      const text = JSON.stringify([acc, dash, await api.get<PayDisbursements>('/payroll/disbursements')]);
      expect(acc.posted, label).toEqual([]);
      expect(acc.obligation.settledVerified, label).toBeNull();
      expect(dash.kpis.settledVerified, label).toBeNull();
      expect(text, label).not.toMatch(/"(paid|settled|repaid)"/);
      return acc;
    };
    let acc = await boundary('approved');
    expect(acc.obligation.approved.amount).toBe('735050.00');
    expect(acc.runs[0]!.proposed.map((l) => `${l.side} ${l.account} ${l.amount.amount}`)).toEqual(['debit salaries_expense 735050.00', 'credit salaries_payable 735050.00']);
    expect(acc.gaps).toEqual(['no_ledger', 'no_category', 'no_settlement']);

    // PAY-006: an instruction holds Karim's pay (account not verified) rather than dropping it.
    const ins = await api.as(SABA).post<PayInstructionView>(`/payroll/runs/${RUN}/instructions`);
    expect(ins.held.map((h) => `${h.employeeName} ${h.reason} ${h.amount.amount}`)).toEqual(['Karim Bakhsh bank_unverified 42000.00']);
    expect([ins.total.amount, ins.state]).toEqual(['693050.00', 'prepared']);
    expect(ins.lines.every((l) => l.settlement === 'not_settled')).toBe(true);
    expect(ins.lines.find((l) => l.employeeId === E.shahid)).toMatchObject({ method: 'bank', account: '0201' });
    acc = await boundary('instruction prepared');
    expect(acc.obligation.instructed.amount).toBe('0.00');
    expect((await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/instructions/${ins.id}/sent`))).code).toBe('state_changed');
    await api.as(AYESHA).post(`/payroll/instructions/${ins.id}/approve`);
    acc = await boundary('instruction approved');
    expect(acc.obligation.instructed.amount).toBe('693050.00');
    const sent = await api.as(SABA).post<PayInstructionView>(`/payroll/instructions/${ins.id}/sent`);
    expect([sent.state, sent.lines.every((l) => l.settlement === 'not_settled')]).toEqual(['sent_simulated', true]);
    await boundary('sent (simulated)');
    expect((await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/instructions/${ins.id}/sent`))).code).toBe('state_changed');
    expect((await refusedUnchanged(api, () => api.as(AYESHA).post(`/payroll/instructions/${ins.id}/cancel`, { reason: 'Changed my mind.' }))).code).toBe('instruction_sent');
    expect((await api.get<PayDisbursements>('/payroll/disbursements')).settlementAvailable).toBe(false);

    // The period closes on the approved run; the obligation stays owed (never settled here).
    const closed = await api.as(AYESHA).post<PayPeriodView>(`/payroll/periods/${OCT}/close`);
    expect(closed.state).toBe('closed');
    expect((await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/periods/${NOV}/runs`))).code).toBe('period_not_open');
    // A closed period's approved run can no longer be reversed (checked before the live instruction).
    expect((await refusedUnchanged(api, () => api.as(AYESHA).post(`/payroll/runs/${RUN}/reverse`, { reason: 'Found an error after closing.' }))).code).toBe('period_closed');
    expect((await boundary('closed')).obligation.approved.amount).toBe('735050.00');
    // Every stage of the boundary table was walked: none of them is paid or settled.
    expect(vectors.boundary.filter((b) => b.paid || b.settled)).toEqual([]);
  });
});

describe('S.2b periods (PAY-002)', () => {
  it('no duplicate or overlapping month, in order from the licence month, not too far ahead, pay date near the month end; one open at a time', async () => {
    const api = paySession();
    const list = await api.as(SABA).get<PayPeriodsList>('/payroll/periods');
    expect(list.items.map((p) => `${p.ref} ${p.state}`)).toEqual(['ANR-PP-2026-11 draft', 'ANR-PP-2026-10 open']);
    expect(list.next).toMatchObject({ month: '2026-12', payDate: '2026-12-31' });
    expect(list.items.find((p) => p.id === NOV)!.blocked).toBe('another_open');
    const make = (body: Record<string, string>) => api.as(SABA).post<PayPeriodView>('/payroll/periods', { legalEntityId: 'le_alnoor', payDate: '2026-12-31', ...body });
    expect(await refusedUnchanged(api, () => make({ month: '2026-10', payDate: '2026-10-31' }))).toMatchObject({ status: 409, code: 'period_exists' });
    expect(await refusedUnchanged(api, () => make({ month: '2027-01', payDate: '2027-01-31' }))).toMatchObject({ status: 422, fields: ['month'] });
    expect(await refusedUnchanged(api, () => make({ month: '2026-13' }))).toMatchObject({ status: 422, fields: ['month'] });
    expect(await refusedUnchanged(api, () => make({ month: '2026-12', payDate: '2027-01-20' }))).toMatchObject({ status: 422, fields: ['payDate'] });
    expect(await refusedUnchanged(api, () => make({ month: '2026-12', payDate: '31-12-2026' }))).toMatchObject({ status: 422, fields: ['payDate'] });
    expect(await refusedUnchanged(api, () => make({ month: '2026-12', legalEntityId: 'le_unknown' }))).toMatchObject({ status: 422, fields: ['legalEntityId'] });
    // Idempotent: the same key twice is one period.
    const dec = await api.as(SABA).post<PayPeriodView>('/payroll/periods', { legalEntityId: 'le_alnoor', month: '2026-12', payDate: '2026-12-31' }, { key: 'k-dec' });
    const again = await api.as(SABA).post<PayPeriodView>('/payroll/periods', { legalEntityId: 'le_alnoor', month: '2026-12', payDate: '2026-12-31' }, { key: 'k-dec' });
    expect([dec.ref, again.id, api.pay().periods.length]).toEqual(['ANR-PP-2026-12', dec.id, 3]);
    // January 2027 would be next, but is more than two months ahead.
    expect(await refusedUnchanged(api, () => make({ month: '2027-01', payDate: '2027-01-31' }))).toMatchObject({ status: 422, fields: ['month'] });
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/periods/${NOV}/open`))).toMatchObject({ status: 409, code: 'another_open' });
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/periods/${NOV}/runs`))).toMatchObject({ status: 409, code: 'period_not_open' });
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/periods/${OCT}/runs`))).toMatchObject({ status: 409, code: 'run_exists' });
    // Closing needs the approved run; the preparer cannot close at all.
    expect(await refusedUnchanged(api, () => api.as(AYESHA).post(`/payroll/periods/${OCT}/close`))).toMatchObject({ status: 409, code: 'run_not_approved' });
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/periods/${OCT}/close`))).toMatchObject({ status: 403, code: 'permission_missing' });
    await approvedRun(api);
    await api.as(AYESHA).post(`/payroll/periods/${OCT}/close`);
    const opened = await api.as(SABA).post<PayPeriodView>(`/payroll/periods/${NOV}/open`);
    expect([opened.state, opened.actions.prepareRun]).toEqual(['open', true]);
    const nov = await api.as(SABA).post<PayRunView>(`/payroll/periods/${NOV}/runs`);
    expect([nov.ref, nov.month, nov.state, nov.version]).toEqual(['ANR-PR-2026-11', '2026-11', 'draft', 1]);
  });
});

describe('S.2b run inputs and validation (PAY-003, PAY-004)', () => {
  it('refuses negative, zero, malformed or oversized amounts and impossible days; nobody changes their own pay; nothing changes on a refusal', async () => {
    const api = paySession();
    const bonus = (id: string, body: Record<string, unknown>) => api.as(SABA).post(`/payroll/runs/${RUN}/lines/${id}/bonuses`, { label: 'Festival bonus', reason: 'Agreed by the committee for October.', ...body });
    for (const amount of ['-500', '0', '0.00', 'abc', '1.234', '500000.01', '']) expect((await refusedUnchanged(api, () => bonus(E.shahid, { amount }))).fields, amount).toEqual(['amount']);
    expect((await refusedUnchanged(api, () => bonus(E.shahid, { amount: '100', label: 'x' }))).fields).toEqual(['label']);
    expect((await refusedUnchanged(api, () => bonus(E.shahid, { amount: '100', reason: 'short' }))).fields).toEqual(['reason']);
    const days = (id: string, d: unknown, reason = REASON) => api.as(SABA).post(`/payroll/runs/${RUN}/lines/${id}/days`, { days: d, reason });
    // An empty answer is not zero days.
    for (const d of [-1, 32, 2.5, 'ten', '', '  ']) expect((await refusedUnchanged(api, () => days(E.tariq, d))).fields, String(d)).toEqual(['days']);
    expect((await refusedUnchanged(api, () => days(E.tariq, 20, 'short'))).fields).toEqual(['reason']);
    expect((await refusedUnchanged(api, () => days(E.shahid, 20))).fields).toEqual(['days']);
    // Saba's own line: she sees it, never changes it.
    expect(await refusedUnchanged(api, () => bonus(E.saba, { amount: '1000' }))).toMatchObject({ status: 403, code: 'own_record' });
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${RUN}/lines/${E.saba}/exclude`, { reason: 'Paid separately this month.' }))).toMatchObject({ status: 403, code: 'own_record' });
    expect((await line(api.as(SABA), E.saba))).toMatchObject({ own: true, blocked: 'own_line', actions: { addBonus: false, exclude: false } });
    // Idempotent bonus; removing it is a new version.
    const b1 = await api.as(SABA).post<PayBreakdown>(`/payroll/runs/${RUN}/lines/${E.asif}/bonuses`, { label: 'Festival bonus', amount: '2500.50', reason: 'Agreed by the committee for October.' }, { key: 'k-b1' });
    const b2 = await api.as(SABA).post<PayBreakdown>(`/payroll/runs/${RUN}/lines/${E.asif}/bonuses`, { label: 'Festival bonus', amount: '2500.50', reason: 'Agreed by the committee for October.' }, { key: 'k-b1' });
    expect([b1.bonuses.length, b2.bonuses.length, b1.net.amount]).toEqual([1, 1, '46500.50']);
    const removed = await api.as(SABA).post<PayBreakdown>(`/payroll/runs/${RUN}/lines/${E.asif}/bonuses/${b1.bonuses[0]!.id}/remove`);
    expect([removed.bonuses.length, removed.net.amount, removed.run.version]).toEqual([0, '44000.00', 4]);
    // Excluding a person needs a reason; it removes the line from the obligation, and can be undone.
    const out = await api.as(SABA).post<PayBreakdown>(`/payroll/runs/${RUN}/lines/${E.tariq}/exclude`, { reason: 'Daily wage settled by the contractor this month.' });
    expect([out.state, out.actions.confirmDays, out.actions.include]).toEqual(['excluded', false, true]);
    expect((await run(api)).totals).toMatchObject({ included: 13, excluded: 1, blocked: 1 });
    await api.as(SABA).post(`/payroll/runs/${RUN}/lines/${E.tariq}/include`);
    expect((await run(api)).totals).toMatchObject({ included: 14, excluded: 0, blocked: 2 });
  });

  it('a submitted run cannot be changed; an approved run is frozen, even when HR records change later', async () => {
    const api = paySession();
    await confirmDaily(api);
    await api.as(SABA).post(`/payroll/runs/${RUN}/submit`);
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${RUN}/recompute`))).toMatchObject({ status: 409, code: 'run_submitted' });
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${RUN}/lines/${E.tariq}/days`, { days: 1, reason: REASON }))).toMatchObject({ status: 409, code: 'run_submitted' });
    // The preparer may withdraw it (with a reason) and submit it again.
    expect((await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${RUN}/withdraw`, { reason: 'x' }))).fields).toEqual(['reason']);
    expect((await api.as(SABA).post<PayRunView>(`/payroll/runs/${RUN}/withdraw`, { reason: 'Checking Tariq’s days again.' })).state).toBe('draft');
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${RUN}/withdraw`, { reason: 'Checking again.' }))).toMatchObject({ status: 409, code: 'state_changed' });
    expect((await api.as(SABA).post<PayRunView>(`/payroll/runs/${RUN}/submit`)).state).toBe('submitted');
    await api.as(AYESHA).post(`/payroll/runs/${RUN}/approve`, { acknowledge: true });
    for (const path of [`/payroll/runs/${RUN}/recompute`, `/payroll/runs/${RUN}/lines/${E.tariq}/days`, `/payroll/runs/${RUN}/lines/${E.shahid}/bonuses`, `/payroll/runs/${RUN}/lines/${E.shahid}/exclude`, `/payroll/runs/${RUN}/lines/emp_none_999/exclude`]) {
      expect(await refusedUnchanged(api, () => api.as(SABA).post(path, { days: 1, reason: REASON, label: 'Late bonus', amount: '100' })), path).toMatchObject({ status: 409, code: 'run_frozen' });
    }
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${RUN}/submit`))).toMatchObject({ status: 409, code: 'state_changed' });
    // Faisal leaves on 20 October: HR changes, the approved obligation does not.
    await api.as(IMRAN).post(`/hr/employees/${E.faisal}/status`, { status: 'ended', on: '2026-10-20', reason: 'Resigned to join his family business.' });
    const r = await run(api);
    expect([r.state, r.stale, r.totals.net.amount, r.lines.find((l) => l.employeeId === E.faisal)!.net.amount]).toEqual(['approved', false, '730050.00', '42000.00']);
  });

  it('HR changes make a draft stale: it cannot be submitted or approved until recalculated', async () => {
    const api = paySession();
    await confirmDaily(api);
    await api.as(SABA).post(`/payroll/runs/${RUN}/submit`);
    // While it waits for approval, Faisal leaves: the approver cannot approve an out-of-date version.
    await api.as(IMRAN).post(`/hr/employees/${E.faisal}/status`, { status: 'ended', on: '2026-10-20', reason: 'Resigned to join his family business.' });
    expect((await api.as(AYESHA).get<PayRunView>(`/payroll/runs/${RUN}`))).toMatchObject({ stale: true, actions: { approve: false, return: true } });
    expect(await refusedUnchanged(api, () => api.as(AYESHA).post(`/payroll/runs/${RUN}/approve`, { acknowledge: true }))).toMatchObject({ status: 409, code: 'run_stale' });
    await api.as(AYESHA).post(`/payroll/runs/${RUN}/return`, { note: 'Faisal left on the 20th; please recalculate.' });
    expect((await run(api))).toMatchObject({ state: 'draft', stale: true, runBlockers: ['stale'] });
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${RUN}/submit`))).toMatchObject({ status: 409, code: 'run_stale' });
    const r = await api.as(SABA).post<PayRunView>(`/payroll/runs/${RUN}/recompute`);
    const faisal = await line(api, E.faisal);
    expect([r.stale, faisal.employedDays, faisal.warnings, faisal.earnings.map((e) => e.amount.amount), faisal.net.amount]).toEqual([false, 20, ['partial_month'], ['25806.45', '1290.32'], '27096.77']);
    expect(r.history.map((h) => h.action)).toContain('run_recalculated');
  });
});

describe('S.2b starters, leavers, transfers, unpaid leave and loans', () => {
  it('a starter without agreed pay is blocked (nothing invented) until excluded; a leaver is prorated; a transfer to another employer leaves the run', async () => {
    const api = paySession();
    const hamza = await api.as(IMRAN).post<Employee360>('/hr/employees', { name: 'Hamza Raza', cnic: '35202-1122334-5', phone: '0300 0000299', address: 'House 5, Street 9, Township, Lahore (Demo)', legalEntityId: 'le_alnoor', siteId: 'site_alnoor', role: 'security_guard', employmentType: 'contract', startDate: '2026-10-20' });
    const r = await api.as(SABA).post<PayRunView>(`/payroll/runs/${RUN}/recompute`);
    const h = r.lines.find((l) => l.employeeId === hamza.id)!;
    expect([h.basis, h.blockers, h.net.amount]).toEqual([null, ['missing_pay'], '0.00']);
    await confirmDaily(api);
    expect((await refusal(api.as(SABA).post(`/payroll/runs/${RUN}/submit`))).code).toBe('line_blockers');
    await api.as(SABA).post(`/payroll/runs/${RUN}/lines/${hamza.id}/exclude`, { reason: 'Pay terms still to be agreed by the committee.' });
    expect((await api.as(SABA).post<PayRunView>(`/payroll/runs/${RUN}/submit`)).state).toBe('submitted');
  });

  it('a person moved to another legal entity leaves the run; staff of another employer are never in it', async () => {
    const api = paySession();
    await run(api);
    const fx = addFictionalSites(api.hr());
    const r = await api.as(SABA).post<PayRunView>(`/payroll/runs/${RUN}/recompute`);
    const ids = r.lines.map((l) => l.employeeId);
    expect(ids).toEqual(expect.arrayContaining([fx.rashid.id, fx.omer.id]));
    expect(ids).not.toEqual(expect.arrayContaining([fx.sajid.id]));
    expect(ids).not.toContain(fx.hina.id);
    // Omer is moved to the annexe's employer: he leaves Al-Noor's run at the next calculation.
    const omer = api.hr().employees.find((e) => e.id === fx.omer.id)!;
    omer.legalEntityId = fx.annexe.legalEntityId;
    omer.sites = [{ siteId: fx.annexe.siteId, from: '2025-01-01' }];
    expect((await run(api)).stale).toBe(true);
    const again = await api.as(SABA).post<PayRunView>(`/payroll/runs/${RUN}/recompute`);
    expect(again.lines.map((l) => l.employeeId)).not.toContain(fx.omer.id);
    expect(again.history.at(-2)).toMatchObject({ action: 'line_removed', values: { name: fx.omer.name } });
  });

  it('approved unpaid leave holds the line (no adopted policy); pending unpaid leave only warns', async () => {
    const api = paySession();
    const leave = await api.as(IMRAN).post<LeaveRequestView>('/hr/leave', { employeeId: E.waqas, type: 'unpaid', from: '2026-10-29', to: '2026-10-30', reason: 'Personal matter in Multan, unpaid.' });
    await api.as(SABA).post(`/payroll/runs/${RUN}/recompute`);
    expect((await line(api.as(SABA), E.waqas))).toMatchObject({ warnings: ['leave_pending'], blockers: [] });
    await api.as(RABIA).post(`/hr/leave/${leave.id}/approve`);
    expect((await run(api)).stale).toBe(true);
    await api.as(SABA).post(`/payroll/runs/${RUN}/recompute`);
    const w = await line(api.as(SABA), E.waqas);
    expect([w.blockers, w.deductions.unpaidLeaveDays, w.net.amount, w.deductionsTotal.amount]).toEqual([['unpaid_leave_policy'], 2, '50500.00', '0.00']);
    await confirmDaily(api);
    expect((await refusal(api.as(SABA).post(`/payroll/runs/${RUN}/submit`))).code).toBe('line_blockers');
  });

  it('a loan instalment due in October is held, never deducted, and the loan is never marked repaid by payroll', async () => {
    const api = paySession();
    await run(api);
    const loan = await api.as(IMRAN).post<StaffAdvanceView>('/hr/advances', { employeeId: E.nadeem, kind: 'loan', amount: '30000', instalments: 3, firstMonth: '2026-10', reason: 'Medical bills after his father’s operation.', evidence: [{ name: 'hospital-estimate.pdf', type: 'application/pdf', sizeBytes: 90_000 }] });
    await api.as(AYESHA).post(`/hr/advances/${loan.id}/approve`);
    expect((await run(api)).stale).toBe(true);
    await api.as(SABA).post(`/payroll/runs/${RUN}/recompute`);
    const n = await line(api.as(SABA), E.nadeem);
    expect(n.deductions.held).toEqual([{ advanceId: loan.id, ref: loan.ref, kind: 'loan', instalment: 1, of: 3, amount: { amount: '10000.00', currency: 'PKR' }, reason: 'advance_unverified' }]);
    expect([n.warnings, n.deductionsTotal.amount, n.net.amount]).toEqual([['advance_held'], '0.00', '44000.00']);
    await approvedRun(api);
    const ins = await api.as(SABA).post<PayInstructionView>(`/payroll/runs/${RUN}/instructions`);
    await api.as(AYESHA).post(`/payroll/instructions/${ins.id}/approve`);
    await api.as(SABA).post(`/payroll/instructions/${ins.id}/sent`);
    // HR-007/008 are unchanged: approved, payment not verified; every instalment planned; no link.
    const adv = (await api.as(AYESHA).get<AdvancesList>('/hr/advances')).items.find((a) => a.id === loan.id)!;
    expect([adv.state, adv.payment, adv.schedule.map((s) => s.state)]).toEqual(['approved', 'unverified', ['planned', 'planned', 'planned']]);
    expect((await refusal(api.as(SABA).post(`/hr/advances/${loan.id}/link`, { voucherId: 'vch_anr_0001' }))).code).toBe('settlement_unverifiable');
  });
});

describe('S.2b maker-checker, reversal and disbursement rules (PAY-005, PAY-006)', () => {
  it('nobody approves a run they made or their own pay; the submitter cannot return it; reversal is the checker’s, before any instruction and before close', async () => {
    const both = paySession({ accessFor: changed([SABA, IMRAN], plus('payroll.view', 'payroll.approve')) });
    await confirmDaily(both);
    await both.as(SABA).post(`/payroll/runs/${RUN}/submit`);
    expect(await refusedUnchanged(both, () => both.as(SABA).post(`/payroll/runs/${RUN}/approve`, { acknowledge: true }))).toMatchObject({ status: 403, code: 'maker_checker_required' });
    expect(await refusedUnchanged(both, () => both.as(SABA).post(`/payroll/runs/${RUN}/return`, { note: 'Returning my own submission.' }))).toMatchObject({ status: 403, code: 'maker_checker_required' });
    // Imran made nothing, but his own pay is in the run.
    expect((await both.as(IMRAN).get<PayRunView>(`/payroll/runs/${RUN}`))).toMatchObject({ blocked: 'own_line', actions: { approve: false } });
    expect(await refusedUnchanged(both, () => both.as(IMRAN).post(`/payroll/runs/${RUN}/approve`, { acknowledge: true }))).toMatchObject({ status: 403, code: 'own_record' });
    expect((await both.as(AYESHA).post<PayRunView>(`/payroll/runs/${RUN}/approve`, { acknowledge: true })).state).toBe('approved');
    expect(await refusedUnchanged(both, () => both.as(SABA).post(`/payroll/runs/${RUN}/reverse`, { reason: 'Prepared with the wrong days.' }))).toMatchObject({ status: 403, code: 'maker_checker_required' });
    const ins = await both.as(SABA).post<PayInstructionView>(`/payroll/runs/${RUN}/instructions`);
    expect(await refusedUnchanged(both, () => both.as(AYESHA).post(`/payroll/runs/${RUN}/reverse`, { reason: 'Prepared with the wrong days.' }))).toMatchObject({ status: 409, code: 'instruction_live' });
    await both.as(AYESHA).post(`/payroll/instructions/${ins.id}/cancel`, { reason: 'Run to be reversed.' });
    expect((await refusedUnchanged(both, () => both.as(AYESHA).post(`/payroll/runs/${RUN}/reverse`, { reason: 'short' }))).fields).toEqual(['reason']);
    const reversed = await both.as(AYESHA).post<PayRunView>(`/payroll/runs/${RUN}/reverse`, { reason: 'Prepared with the wrong days for Tariq.' });
    expect([reversed.state, reversed.reversedByName]).toEqual(['reversed', 'Ayesha Malik']);
    const acc = await both.as(AYESHA).get<PayAccounting>('/payroll/accounting');
    expect([acc.obligation.approved.amount, acc.runs[0]!.state, acc.runs[0]!.reversal!.map((l) => l.side)]).toEqual(['0.00', 'reversed', ['credit', 'debit']]);
    // A reversed run never changes again; the period gets a new run.
    expect(await refusedUnchanged(both, () => both.as(SABA).post(`/payroll/runs/${RUN}/recompute`))).toMatchObject({ status: 409, code: 'run_frozen' });
    const second = await both.as(SABA).post<PayRunView>(`/payroll/periods/${OCT}/runs`);
    expect([second.ref, second.version, second.state]).toEqual(['ANR-PR-2026-10-2', 1, 'draft']);
  });

  it('instructions: one live per run, idempotent, maker ≠ checker, never by someone paid in it; an approved instruction can be cancelled, a sent one cannot', async () => {
    const api = paySession({ accessFor: changed([SABA, IMRAN], plus('payroll.approve')) });
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${RUN}/instructions`))).toMatchObject({ status: 409, code: 'run_not_approved' });
    await approvedRun(api);
    const a = await api.as(SABA).post<PayInstructionView>(`/payroll/runs/${RUN}/instructions`, {}, { key: 'k-ins' });
    const b = await api.as(SABA).post<PayInstructionView>(`/payroll/runs/${RUN}/instructions`, {}, { key: 'k-ins' });
    expect([a.ref, b.id, api.pay().instructions.length]).toEqual(['ANR-PD-0001', a.id, 1]);
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/runs/${RUN}/instructions`))).toMatchObject({ status: 409, code: 'instruction_exists' });
    expect(await refusedUnchanged(api, () => api.as(SABA).post(`/payroll/instructions/${a.id}/approve`))).toMatchObject({ status: 403, code: 'maker_checker_required' });
    expect(await refusedUnchanged(api, () => api.as(IMRAN).post(`/payroll/instructions/${a.id}/approve`))).toMatchObject({ status: 403, code: 'own_record' });
    await api.as(AYESHA).post(`/payroll/instructions/${a.id}/approve`);
    expect(await refusedUnchanged(api, () => api.as(AYESHA).post(`/payroll/instructions/${a.id}/approve`))).toMatchObject({ status: 409, code: 'state_changed' });
    const cancelled = await api.as(AYESHA).post<PayInstructionView>(`/payroll/instructions/${a.id}/cancel`, { reason: 'Bank holiday; prepare again on Monday.' });
    expect(cancelled.state).toBe('cancelled');
    const c = await api.as(SABA).post<PayInstructionView>(`/payroll/runs/${RUN}/instructions`);
    expect(c.ref).toBe('ANR-PD-0002');
    const d = await api.as(SABA).get<PayDisbursements>('/payroll/disbursements');
    expect([d.runs[0]!.instruction!.id, d.cancelled.map((x) => x.ref)]).toEqual([c.id, ['ANR-PD-0001']]);
  });

  it('no route records a payment, evidence or a posting: a free-text cashbook voucher naming a guard and "salary" changes nothing in payroll', async () => {
    const api = paySession();
    await approvedRun(api);
    const ins = await api.as(SABA).post<PayInstructionView>(`/payroll/runs/${RUN}/instructions`);
    await api.as(AYESHA).post(`/payroll/instructions/${ins.id}/approve`);
    const evidence = { voucherId: 'vch_anr_0001', statementLineId: 'stl_anr_0001', amount: '42000.00', reference: 'ANR-PD-0001', legalEntityId: 'le_anx_demo' };
    for (const path of [`/payroll/instructions/${ins.id}/settle`, `/payroll/instructions/${ins.id}/paid`, `/payroll/instructions/${ins.id}/evidence`, `/payroll/instructions/${ins.id}/match`, `/payroll/runs/${RUN}/post`, `/payroll/runs/${RUN}/paid`, `/payroll/runs/${RUN}/lines/${E.zubair}/settle`]) {
      expect(await refusedUnchanged(api, () => api.as(SABA).post(path, evidence)), path).toMatchObject({ status: 404, code: 'not_found' });
      expect(await refusedUnchanged(api, () => api.as(AYESHA).post(path, evidence)), path).toMatchObject({ status: 404, code: 'not_found' });
    }
    // A posted S.1 voucher with "October salary" and Zubair's name: free text, never evidence for payroll.
    const before = JSON.stringify([await api.as(SABA).get('/payroll/disbursements'), await api.get('/payroll/accounting')]);
    const v = await api.as(SABA).post<{ voucher: { id: string; approvalId?: string } }>('/finance/vouchers', { accountId: 'cac_anr_office', direction: 'payment', category: 'misc_expense', amount: '4000', onDate: '2026-10-26', purpose: 'October salary advance', counterparty: 'Zubair Ahmed', evidence: { name: 'salary-slip.jpg', kind: 'receipt', size: 1000 }, submit: true });
    await api.as(AYESHA).post(`/approvals/${v.voucher.approvalId}/decide`, { decision: 'approve', reason: 'Checked against the evidence.' });
    await api.as(SABA).post(`/finance/vouchers/${v.voucher.id}/post`).catch(() => undefined);
    expect(JSON.stringify([await api.as(SABA).get('/payroll/disbursements'), await api.get('/payroll/accounting')])).toBe(before);
  });
});

describe('S.2b no id oracles, no hidden counts, no export leaks', () => {
  it('an id never issued, another employer’s record and a hidden person get the same "not found"', async () => {
    const api = paySession();
    await run(api);
    const fx = addFictionalSites(api.hr());
    // The annexe (another legal entity) gets its own period and run.
    await api.as(SABA).post('/payroll/periods', { legalEntityId: fx.annexe.legalEntityId, month: '2026-10', payDate: '2026-10-31' });
    await api.as(SABA).post(`/payroll/periods/ppd_anx_2026_10/open`);
    const annexeRun = await api.as(SABA).post<PayRunView>('/payroll/periods/ppd_anx_2026_10/runs');
    expect(annexeRun.lines.map((l) => l.employeeName).sort()).toEqual([fx.hina.name, fx.sajid.name].sort());
    expect(annexeRun.lines.every((l) => l.blockers.includes('missing_pay'))).toBe(true);
    // Saba limited to the main site: she cannot see the annexe at all, and sees only her site's staff.
    // Imran stands in as a preparer with the whole organisation in scope (test-only access).
    const narrow = changed([SABA], sitesOnly('site_alnoor'));
    const wide = changed([IMRAN], plus('payroll.view', 'payroll.prepare'));
    const limited = paySession({ accessFor: (p) => (p.id === IMRAN ? wide(p) : narrow(p)) });
    await limited.as(SABA).get('/payroll/dashboard');
    const fx2 = addFictionalSites(limited.hr());
    await limited.as(IMRAN).post(`/payroll/runs/${RUN}/recompute`);
    await limited.as(IMRAN).post('/payroll/periods', { legalEntityId: fx2.annexe.legalEntityId, month: '2026-10', payDate: '2026-10-31' });
    const unknown = await refusal(limited.as(SABA).get('/payroll/runs/prn_none_9999'));
    expect(unknown).toMatchObject({ status: 404, code: 'not_found' });
    expect(await refusal(limited.as(SABA).post('/payroll/periods/ppd_anx_2026_10/open'))).toEqual(await refusal(limited.as(SABA).post('/payroll/periods/ppd_none_2026_10/open')));
    const r = await limited.as(SABA).get<PayRunView>(`/payroll/runs/${RUN}`);
    expect(r.scopeLimited).toBe(true);
    expect(r.lines.map((l) => l.employeeId)).not.toContain(fx2.omer.id);
    expect(r.lines.map((l) => l.employeeId)).toContain(fx2.rashid.id);
    expect(JSON.stringify(r)).not.toContain(fx2.omer.name);
    expect(r.actions).toMatchObject({ recompute: false, edit: false, submit: false });
    expect(r.blocked).toBe('other_sites');
    for (const id of [fx2.omer.id, fx2.sajid.id, 'emp_none_999']) expect(await refusal(limited.as(SABA).get(`/payroll/runs/${RUN}/lines/${id}`)), id).toEqual(unknown);
    // Every change is refused for the legal entity first: the same answer whatever the employee id.
    const answers = [];
    for (const id of [fx2.omer.id, fx2.rashid.id, E.shahid, 'emp_none_999']) answers.push(await refusedUnchanged(limited, () => limited.as(SABA).post(`/payroll/runs/${RUN}/lines/${id}/days`, { days: 1, reason: REASON })));
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect(answers[0]).toMatchObject({ status: 403, code: 'other_sites' });
    // Her export and her list carry her site's lines only, and say so; no count of anyone hidden.
    const ex = await limited.as(SABA).get<PayExport>(`/payroll/runs/${RUN}/export`);
    expect([ex.scopeLimited, ex.rows.some((x) => x.name === fx2.omer.name)]).toEqual([true, false]);
    const runs = await limited.as(SABA).get<PayRunsList>('/payroll/runs');
    expect(runs.items.map((x) => x.ref)).toEqual(['ANR-PR-2026-10']);
    expect(JSON.stringify(await limited.as(SABA).get('/payroll/dashboard'))).not.toContain('Annexe');
  });
});
