import type { AccessScope, AdvancesList, AttendanceDay, Candidate, CommunityHome, DocumentsOverview, Employee360, EmployeeOptions, EmployeesList, HrDashboard, LeaveAndCorrections, LeaveRequestView, OnDutyBoard, Persona, ResidentStaffOnDuty, RosterWeek, StaffAdvanceView, VoucherDetail } from '@repo/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectiveAccessFor } from '../tenant-directory';
import { at, refusal, session, without, type Session } from './api-test-kit';
import { addFictionalSites } from './multisite.fixture';

/**
 * Gate S.2a closure (GitHub Issue #12) through the fail-closed mock API:
 * - P0: a fictional multi-site organisation (`multisite.fixture.ts`): a main-site principal never
 *   reaches another site's or another legal entity's staff records; ids are refused like ids never
 *   issued; counts give nothing away; organisation-wide HR keeps both; transfers, endings and
 *   revoked grants change access at once; double booking is still caught across sites.
 * - P1: residents' "Staff on duty" keeps confirmed, scheduled and unavailable apart.
 * - P1: no cashbook voucher can make a staff advance paid, repaid or owed.
 */
const SCOPES: Record<string, AccessScope[] | undefined> = {};
const REMOVED: Record<string, string[] | undefined> = {};
const scoped = (p: Persona) => {
  const a = effectiveAccessFor(p);
  if (!a) return null;
  const s = SCOPES[p.id];
  const off = REMOVED[p.id] ?? [];
  return { ...a, ...(s ? { scopes: s } : {}), permissions: a.permissions.filter((x) => !off.includes(x)) };
};
const siteOnly = (...ids: string[]): AccessScope[] => [{ type: 'site', ids }];

async function multi() {
  const api = session({ accessFor: scoped });
  await api.as('alnoor_manager').get('/hr/dashboard');
  const f = addFictionalSites(api.hr());
  return { api, f };
}

const byName = async (api: Session, name: string) => (await api.get<EmployeesList>('/hr/employees', { status: 'all' })).items.find((e) => e.name === name);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at('15:30');
  for (const k of Object.keys(SCOPES)) delete SCOPES[k];
  for (const k of Object.keys(REMOVED)) delete REMOVED[k];
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------------------------
// P0: multi-site record scope
// ---------------------------------------------------------------------------------------------

describe('Issue #12 P0: HR records are limited to the reader\'s sites and legal entities', () => {
  it('organisation-wide HR sees every site; a main-site manager sees none of the annexe in any list, count or summary', async () => {
    const { api, f } = await multi();
    const wide = await api.get<EmployeesList>('/hr/employees', { status: 'all' });
    expect(wide.items.map((e) => e.name)).toEqual(expect.arrayContaining(['Sajid Mahmood', 'Hina Akram', 'Rashid Latif', 'Omer Farooq']));
    expect(wide.items).toHaveLength(19);

    SCOPES.alnoor_manager = siteOnly(f.main.siteId);
    const list = await api.get<EmployeesList>('/hr/employees', { status: 'all' });
    // The 15 Al-Noor staff and Rashid (allocated to the main site as well as Block C).
    expect(list.items).toHaveLength(16);
    expect(list.items.map((e) => e.name)).not.toEqual(expect.arrayContaining(['Sajid Mahmood']));
    expect(Object.values(list.counts).reduce((n, c) => n + c, 0)).toBe(16);
    expect(list.departments.housekeeping).toBe(2);
    expect(list.items.find((e) => e.name === 'Rashid Latif')!.sites).toEqual([f.main.name]);

    const dashboard = await api.get<HrDashboard>('/hr/dashboard');
    expect(dashboard.kpis).toMatchObject({ activeStaff: 15, leavePending: 2, correctionsPending: 2, advancesAwaiting: 1 });
    const everything = JSON.stringify([
      list,
      dashboard,
      await api.get<DocumentsOverview>('/hr/documents'),
      await api.get<LeaveAndCorrections>('/hr/leave-adjustments'),
      await api.get<AttendanceDay>('/hr/attendance', { date: '2026-10-25' }),
      await api.get<AttendanceDay>('/hr/attendance'),
      await api.get<RosterWeek>('/hr/roster'),
      await api.get<OnDutyBoard>('/hr/roster/now'),
      await api.get<AdvancesList>('/hr/advances'),
      await api.get<EmployeeOptions>('/hr/employees/options'),
      await api.get<Employee360>(`/hr/employees/${f.rashid.id}`),
    ]);
    for (const secret of ['Sajid Mahmood', 'Hina Akram', 'Omer Farooq', f.sajid.personal.cnic, f.hina.personal.cnic, f.annexe.siteId, f.annexe.name, f.annexe.legalEntityId, f.blockC.siteId, f.blockC.name, f.ids.annexeAdvance, f.ids.annexeLeave, f.ids.annexeCorrection, f.ids.blockCNight]) {
      expect(everything, secret).not.toContain(secret);
    }
  });

  it('another site\'s ids get exactly the answer of an id that was never issued', async () => {
    const { api, f } = await multi();
    SCOPES.alnoor_manager = siteOnly(f.main.siteId);
    SCOPES.alnoor_treasurer = siteOnly(f.main.siteId);
    SCOPES.alnoor_guard = siteOnly(f.main.siteId);
    const same = async (persona: string, method: 'get' | 'post' | 'patch', real: string, fake: string, body: unknown = {}) => {
      api.as(persona);
      const a = await refusal(method === 'get' ? api.get(real) : api[method](real, body));
      const b = await refusal(method === 'get' ? api.get(fake) : api[method](fake, body));
      expect(a, real).toEqual(b);
      expect(a.status, real).toBe(404);
    };
    await same('alnoor_manager', 'get', `/hr/employees/${f.sajid.id}`, '/hr/employees/emp_none_999');
    await same('alnoor_manager', 'patch', `/hr/employees/${f.sajid.id}`, '/hr/employees/emp_none_999', { phone: '0300 0000999' });
    await same('alnoor_manager', 'post', `/hr/employees/${f.sajid.id}/status`, '/hr/employees/emp_none_999/status', { status: 'suspended', on: '2026-10-26', reason: 'Testing scope' });
    await same('alnoor_manager', 'post', `/hr/employees/${f.sajid.id}/profile`, '/hr/employees/emp_none_999/profile', { consent: false });
    await same('alnoor_manager', 'post', `/hr/leave/${f.ids.annexeLeave}/approve`, '/hr/leave/lve_none_9999/approve');
    await same('alnoor_manager', 'post', `/hr/leave/${f.ids.annexeLeave}/cancel`, '/hr/leave/lve_none_9999/cancel', { reason: 'Testing scope' });
    await same('alnoor_manager', 'post', `/hr/corrections/${f.ids.annexeCorrection}/approve`, '/hr/corrections/cor_none_9999/approve');
    await same('alnoor_manager', 'post', `/hr/roster/assignments/${f.ids.annexeDuty}/unassign`, '/hr/roster/assignments/asg_none_9999/unassign', { reason: 'Testing scope' });
    await same('alnoor_manager', 'post', `/hr/advances/${f.ids.annexeAdvance}/withdraw`, '/hr/advances/adv_none_9999/withdraw', { reason: 'Testing scope' });
    await same('alnoor_treasurer', 'post', `/hr/advances/${f.ids.annexeAdvance}/approve`, '/hr/advances/adv_none_9999/approve');
    await same('alnoor_manager', 'post', `/hr/advances/${f.ids.annexeAdvance}/link`, '/hr/advances/adv_none_9999/link', { purpose: 'disbursement', voucherId: 'cvh_x' });
    await same('alnoor_guard', 'post', `/hr/attendance/${f.ids.annexeDuty}/check-in`, '/hr/attendance/asg_none_9999/check-in');
    await same('alnoor_manager', 'get', `/hr/roster?site=${f.annexe.siteId}`, '/hr/roster?site=site_none');
    // Ids in a request body: the same answer as an unknown id (a validation error on that field).
    api.as('alnoor_manager');
    const sameField = async (path: string, body: Record<string, unknown>, field: string) => {
      const a = await refusal(api.post(path, body));
      const b = await refusal(api.post(path, { ...body, [field]: 'none_999' }));
      expect(a, path).toEqual(b);
      expect(a.fields, path).toContain(field);
    };
    const pdf = { name: 'x.pdf', type: 'application/pdf', sizeBytes: 1000 };
    await sameField('/hr/documents', { employeeId: f.sajid.id, kind: 'appointment_letter', file: pdf, issuedOn: '2026-10-01' }, 'employeeId');
    await sameField('/hr/leave', { employeeId: f.sajid.id, type: 'casual', from: '2026-10-30', to: '2026-10-30', reason: 'Testing scope' }, 'employeeId');
    await sameField('/hr/advances', { employeeId: f.sajid.id, kind: 'advance', amount: '1000', instalments: 1, firstMonth: '2026-11', reason: 'Testing the scope here', evidence: [pdf] }, 'employeeId');
    await sameField('/hr/roster/assignments', { employeeId: f.sajid.id, templateId: 'sht_anr_night', date: '2026-10-27' }, 'employeeId');
    await sameField('/hr/roster/assignments', { employeeId: (await byName(api, 'Asif Mehmood'))!.id, templateId: 'sht_anx_night', date: '2026-10-27' }, 'templateId');
    // Hiring at the annexe or for its legal entity is refused; the annexe's identity number is
    // refused as a duplicate without naming the record.
    const hire = { name: 'Usman Tariq', cnic: '35202-7777777-7', phone: '0300 0000777', address: 'House 7, Street 7, Lahore (Demo)', role: 'security_guard', employmentType: 'contract', startDate: '2026-10-26', legalEntityId: f.main.legalEntityId, siteId: f.main.siteId };
    expect((await refusal(api.post('/hr/employees', { ...hire, siteId: f.annexe.siteId }))).fields).toContain('siteId');
    expect((await refusal(api.post('/hr/employees', { ...hire, legalEntityId: f.annexe.legalEntityId, siteId: f.annexe.siteId }))).fields).toContain('legalEntityId');
    const duplicate = await refusal(api.post('/hr/employees', { ...hire, cnic: f.sajid.personal.cnic }));
    expect(duplicate).toMatchObject({ status: 409, code: 'duplicate_employee' });
    expect(JSON.stringify(duplicate)).toContain('hr:errors.duplicateElsewhere');
    expect(JSON.stringify(duplicate)).not.toMatch(/Sajid|ANX|emp_anx/);
    // The main site's own work goes on as before.
    expect((await api.post<Employee360>('/hr/employees', hire)).sites).toEqual([expect.objectContaining({ siteId: f.main.siteId })]);
  });

  it('each site\'s own manager sees only theirs; organisation-wide HR keeps both', async () => {
    const { api, f } = await multi();
    SCOPES.alnoor_admin = siteOnly(f.annexe.siteId);
    api.as('alnoor_admin');
    expect((await api.get<EmployeesList>('/hr/employees', { status: 'all' })).items.map((e) => e.name).sort()).toEqual(['Hina Akram', 'Sajid Mahmood']);
    const sajid = await api.get<Employee360>(`/hr/employees/${f.sajid.id}`);
    expect(sajid.personal?.cnic).toBe(f.sajid.personal.cnic);
    expect(sajid.legalEntity.name).toBe(f.annexe.legalEntityName);
    expect((await api.get<RosterWeek>('/hr/roster')).siteId).toBe(f.annexe.siteId);
    expect((await api.get<AdvancesList>('/hr/advances')).items.map((a) => a.id)).toEqual([f.ids.annexeAdvance]);
    // Shahid works at the main site only: "not found" for the annexe's manager.
    expect((await refusal(api.get('/hr/employees/emp_anr_001'))).status).toBe(404);
    // Organisation-wide (the default scope): both sites, and the site switcher lists them.
    delete SCOPES.alnoor_admin;
    expect((await api.get<EmployeesList>('/hr/employees', { status: 'all' })).items).toHaveLength(19);
    expect((await api.get<RosterWeek>('/hr/roster', { site: f.annexe.siteId })).sites.map((s) => s.id)).toEqual([f.main.siteId, f.annexe.siteId, f.blockC.siteId]);
    expect((await api.get<EmployeeOptions>('/hr/employees/options')).legalEntities.map((l) => l.id)).toEqual([f.main.legalEntityId, f.annexe.legalEntityId]);
    // A legal-entity scope covers that entity's sites only.
    SCOPES.alnoor_admin = [{ type: 'legal_entity', ids: [f.main.legalEntityId] }];
    const names = (await api.get<EmployeesList>('/hr/employees', { status: 'all' })).items.map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(['Rashid Latif', 'Omer Farooq']));
    expect(names).not.toContain('Sajid Mahmood');
  });

  it('a transfer, a future transfer, an ending and a revoked grant change access at once', async () => {
    const { api, f } = await multi();
    SCOPES.alnoor_manager = siteOnly(f.main.siteId);
    SCOPES.alnoor_admin = siteOnly(f.blockC.siteId);
    const sees = async (persona: string, id: string) => {
      try {
        await api.as(persona).get(`/hr/employees/${id}`);
        return true;
      } catch {
        return false;
      }
    };
    expect([await sees('alnoor_manager', f.omer.id), await sees('alnoor_admin', f.omer.id)]).toEqual([false, true]);
    // Transfer from Block C to the main site from today (S.2a has no transfer screen: the dated
    // allocation records are edited as a transfer would).
    f.omer.sites = [{ siteId: f.blockC.siteId, from: '2025-01-01', to: '2026-10-25' }, { siteId: f.main.siteId, from: '2026-10-26' }];
    expect([await sees('alnoor_manager', f.omer.id), await sees('alnoor_admin', f.omer.id)]).toEqual([true, false]);
    // A transfer back that starts next month: the main site until then, Block C sees the incoming person.
    f.omer.sites = [{ siteId: f.main.siteId, from: '2026-10-26', to: '2026-10-31' }, { siteId: f.blockC.siteId, from: '2026-11-01' }];
    expect([await sees('alnoor_manager', f.omer.id), await sees('alnoor_admin', f.omer.id)]).toEqual([true, true]);
    // Rashid works at both sites: a single-site manager may not end his employment; organisation-wide HR may.
    expect((await refusal(api.as('alnoor_manager').post(`/hr/employees/${f.rashid.id}/status`, { status: 'ended', on: '2026-10-26', reason: 'Contract ended' }))).code).toBe('other_sites');
    delete SCOPES.alnoor_admin;
    await api.as('alnoor_admin').post(`/hr/employees/${f.rashid.id}/status`, { status: 'ended', on: '2026-10-26', reason: 'Contract ended' });
    SCOPES.alnoor_admin = siteOnly(f.blockC.siteId);
    // A leaver stays with the sites they last worked at.
    expect([await sees('alnoor_manager', f.rashid.id), await sees('alnoor_admin', f.rashid.id)]).toEqual([true, true]);
    // Revoking: no site left in scope, then the permission gone, then the module withdrawn.
    SCOPES.alnoor_manager = siteOnly(f.annexe.siteId);
    expect(await sees('alnoor_manager', f.omer.id)).toBe(false);
    SCOPES.alnoor_manager = [];
    expect((await refusal(api.as('alnoor_manager').get('/hr/employees'))).status).toBe(404);
    delete SCOPES.alnoor_manager;
    REMOVED.alnoor_manager = ['hr.view'];
    expect((await refusal(api.get('/hr/employees'))).code).toBe('permission_missing');
    const noHr = session({ accessFor: without('hr') });
    expect((await refusal(noHr.get('/hr/employees'))).code).toBe('module_not_licensed');
  });

  it('double booking is still caught across sites, and the refusal discloses nothing of the other site', async () => {
    const { api, f } = await multi();
    SCOPES.alnoor_manager = siteOnly(f.main.siteId);
    at('20:00');
    api.as('alnoor_manager');
    const booked = await refusal(api.post('/hr/roster/assignments', { employeeId: f.rashid.id, templateId: 'sht_anr_night', date: '2026-10-26' }));
    expect(booked).toMatchObject({ status: 409, code: 'overlap' });
    expect(JSON.stringify(booked)).not.toMatch(/Block C|site_anc_demo|ANC|Patrol/);
    const options = await api.get<Candidate[]>('/hr/roster/candidates', { templateId: 'sht_anr_night', date: '2026-10-26' });
    expect(options.find((c) => c.name === 'Rashid Latif')).toMatchObject({ blocked: 'overlap' });
    expect(options.map((c) => c.name)).not.toContain('Omer Farooq');
    const rashid = await api.get<Employee360>(`/hr/employees/${f.rashid.id}`);
    expect(rashid.upcoming.map((d) => d.siteId)).not.toContain(f.blockC.siteId);
    expect(rashid.sites.map((s) => s.siteId)).toEqual([f.main.siteId]);
    // A supervisor records only where they work (owner decision O2): Shahid works at the main site.
    at('23:05');
    expect((await refusal(api.as('alnoor_guard').post(`/hr/attendance/${f.ids.blockCNight}/check-in`))).code).toBe('not_your_department');
  });
});

// ---------------------------------------------------------------------------------------------
// P1: residents' Staff on duty accuracy
// ---------------------------------------------------------------------------------------------

describe('Issue #12 P1: residents see confirmed, scheduled and unavailable staff apart', () => {
  const staff = (api: Session) => api.as('alnoor_resident_a101').get<ResidentStaffOnDuty>('/portal/community/staff');
  const keysOk = (s: ResidentStaffOnDuty) => {
    for (const x of s.confirmed) for (const k of Object.keys(x)) expect(['role', 'post', 'until', 'name', 'initials']).toContain(k);
    for (const x of s.expected) for (const k of Object.keys(x)) expect(['role', 'post', 'until']).toContain(k);
    expect(JSON.stringify(s)).not.toMatch(/\+92|35202|House|PKR|absent|late|attendance|checkIn|employeeId|assignmentId|Javed Akhtar/);
  };
  const board = async (api: Session, shift: string, name: string) => (await api.as('alnoor_guard').get<OnDutyBoard>('/hr/roster/now')).current.find((s) => s.shiftKey === shift)!.staff.find((p) => p.name === name)!;

  it('scheduled but not checked in: expected, never confirmed, and never named', async () => {
    const api = session();
    const s = await staff(api);
    expect(s.confirmed).toEqual([]);
    expect(s.expected.map((x) => [x.role, x.post])).toEqual([
      ['security_guard', 'Main gate'],
      ['security_guard', 'Patrol'],
      ['maintenance_supervisor', 'On call'],
      ['electrician', 'Plant room'],
      ['plumber', 'On call'],
      ['cleaner', 'Lobbies'],
      ['gardener', 'Garden'],
      ['building_manager', 'Office'],
      ['accounts_officer', 'Office'],
    ]);
    expect(s.unavailable).toBe(0);
    // Naveed and Imran agreed to show their names, but only an arrival makes them "on duty".
    expect(JSON.stringify(s)).not.toMatch(/Naveed|Imran/);
    keysOk(s);
  });

  it('checked in, on time or late: confirmed; a name only with consent; nothing about lateness', async () => {
    const api = session();
    const nadeem = await board(api, 'evening', 'Nadeem Abbas');
    const faisal = await board(api, 'evening', 'Faisal Iqbal');
    await api.post(`/hr/attendance/${nadeem.assignmentId}/check-in`); // 30 minutes late
    await api.post(`/hr/attendance/${faisal.assignmentId}/check-in`);
    const naveed = (await api.as('alnoor_maintenance').get<AttendanceDay>('/hr/attendance')).rows.find((r) => r.employeeName === 'Naveed Anjum')!;
    await api.post(`/hr/attendance/${naveed.assignmentId}/check-in`);
    const s = await staff(api);
    expect(s.confirmed.map((x) => [x.role, x.post, x.name ?? null])).toEqual([
      ['security_guard', 'Main gate', null], // Faisal: no consent
      ['security_guard', 'Patrol', null], // Nadeem: consented to his role only
      ['maintenance_supervisor', 'On call', 'Naveed Anjum'],
    ]);
    expect(s.expected).toHaveLength(6);
    keysOk(s);
  });

  it('an absent guard is unavailable until replaced; the replacement is expected, then confirmed', async () => {
    const api = session();
    const faisal = await board(api, 'evening', 'Faisal Iqbal');
    await api.post(`/hr/attendance/${faisal.assignmentId}/absent`);
    let s = await staff(api);
    expect(s.unavailable).toBe(1);
    expect(s.expected.filter((x) => x.role === 'security_guard').map((x) => x.post)).toEqual(['Patrol']);
    const asif = (await api.as('alnoor_guard').get<Candidate[]>('/hr/roster/candidates', { templateId: 'sht_anr_evening', date: '2026-10-26' })).find((c) => c.name === 'Asif Mehmood')!;
    const cover = await api.post<{ id: string }>('/hr/roster/assignments', { employeeId: asif.employeeId, templateId: 'sht_anr_evening', date: '2026-10-26', coverFor: faisal.assignmentId });
    s = await staff(api);
    expect(s.unavailable).toBe(0);
    expect(s.expected.filter((x) => x.role === 'security_guard').map((x) => x.post).sort()).toEqual(['Main gate', 'Patrol']);
    await api.as('alnoor_guard').post(`/hr/attendance/${cover.id}/check-in`);
    s = await staff(api);
    expect(s.confirmed).toEqual([expect.objectContaining({ role: 'security_guard', post: 'Main gate', name: 'Asif Mehmood' })]);
    keysOk(s);
  });

  it('approved leave makes the duty unavailable; pending leave does not', async () => {
    const api = session();
    at('23:30');
    const zubair = await board(api, 'night', 'Zubair Ahmed');
    const lv = await api.as('alnoor_manager').post<LeaveRequestView>('/hr/leave', { employeeId: zubair.employeeId, type: 'sick', from: '2026-10-26', to: '2026-10-26', reason: 'Fever this evening' });
    let s = await staff(api);
    expect([s.expected.length, s.unavailable]).toEqual([2, 0]);
    await api.as('alnoor_admin').post(`/hr/leave/${lv.id}/approve`);
    s = await staff(api);
    expect([s.expected.length, s.unavailable]).toEqual([1, 1]);
    keysOk(s);
  });

  it('overnight: last night\'s shift, checked in before midnight, is confirmed in the early morning', async () => {
    const api = session();
    at('05:00');
    const s = await staff(api);
    expect(s.confirmed.map((x) => [x.role, x.until])).toEqual([
      ['security_guard', '2026-10-26T07:00:00+05:00'],
      ['security_guard', '2026-10-26T07:00:00+05:00'],
    ]);
    expect(s.expected).toEqual([]);
  });

  it('employment ended: never on duty, and the gap counts until replaced', async () => {
    const api = session();
    const faisal = await board(api, 'evening', 'Faisal Iqbal');
    await api.post(`/hr/attendance/${faisal.assignmentId}/check-in`);
    expect((await staff(api)).confirmed).toHaveLength(1);
    await api.as('alnoor_manager').post(`/hr/employees/${faisal.employeeId}/status`, { status: 'ended', on: '2026-10-26', reason: 'Contract ended today' });
    const s = await staff(api);
    expect([s.confirmed.length, s.unavailable]).toEqual([0, 1]);
    keysOk(s);
  });

  it('another site\'s staff never appear; without HR there is no staff tab; chat and the hub play no part', async () => {
    const { api, f } = await multi();
    api.hr().attendance.push({ assignmentId: f.ids.annexeDuty, employeeId: f.sajid.id, state: 'present', checkIn: '2026-10-26T15:01:00+05:00', recordedBy: 'usr_anx_0001', recordedByName: 'Annexe office (Demo)', recordedAt: '2026-10-26T15:01:00+05:00', corrected: false, history: [] });
    const s = await staff(api);
    expect(JSON.stringify(s)).not.toMatch(/Sajid|Hina|Annexe|Block C/);
    expect(s.expected).toHaveLength(9);
    const noHr = session({ accessFor: without('hr') });
    expect((await refusal(noHr.as('alnoor_resident_a101').get('/portal/community/staff'))).status).toBeGreaterThanOrEqual(403);
    expect((await noHr.get<CommunityHome>('/portal/community/home')).tabs).not.toContain('staff');
    const noHub = session({ accessFor: without('community_hub', 'community_chat') });
    expect((await noHub.as('alnoor_resident_a101').get<ResidentStaffOnDuty>('/portal/community/staff')).expected).toHaveLength(9);
  });
});

// ---------------------------------------------------------------------------------------------
// P1: staff advance settlement integrity
// ---------------------------------------------------------------------------------------------

describe('Issue #12 P1: no cashbook voucher can make a staff advance paid, repaid or owed', () => {
  /** A voucher prepared, approved (two signers above 10,000) and posted through S.1 itself. */
  const posted = async (api: Session, v: { direction: 'payment' | 'receipt'; category: string; amount: string; purpose: string; counterparty: string }) => {
    const created = await api.as('alnoor_accounts').post<VoucherDetail>('/finance/vouchers', { accountId: 'cac_anr_office', onDate: '2026-10-26', evidence: { name: 'slip.pdf', kind: 'receipt', size: 1000 }, submit: true, ...v });
    await api.as('alnoor_treasurer').post(`/approvals/${created.voucher.approvalId}/decide`, { decision: 'approve', reason: 'Checked against the request' });
    if (Number(v.amount) > 10_000) await api.as('alnoor_admin').post(`/approvals/${created.voucher.approvalId}/decide`, { decision: 'approve', reason: 'Second signatory' });
    await api.as('alnoor_accounts').post(`/finance/vouchers/${created.voucher.id}/post`);
    return created.voucher.id;
  };

  it('every kind of posted voucher is refused, before and after reversal; the advance stays approved and unverified; the cashbook is untouched', async () => {
    const api = session();
    const rukhsana = (await api.as('alnoor_manager').get<EmployeesList>('/hr/employees')).items.find((e) => e.name === 'Rukhsana Bibi')!;
    const a = await api.post<StaffAdvanceView>('/hr/advances', { employeeId: rukhsana.id, kind: 'advance', amount: '8000', reason: 'School fees for her two children', instalments: 2, firstMonth: '2026-11', evidence: [{ name: 'fee-challan.pdf', type: 'application/pdf', sizeBytes: 50_000 }] });
    await api.as('alnoor_treasurer').post(`/hr/advances/${a.id}/approve`);
    // S.1 refuses a payment the cash box cannot cover: top it up first with a posted receipt.
    await posted(api, { direction: 'receipt', category: 'other_income', amount: '60000', purpose: 'Cash float for the test', counterparty: 'Society treasurer (Demo)' });
    const right = await posted(api, { direction: 'payment', category: 'misc_expense', amount: '8000', purpose: `Advance ${a.ref} to Rukhsana Bibi`, counterparty: 'Rukhsana Bibi (staff)' });
    const wrongEmployee = await posted(api, { direction: 'payment', category: 'misc_expense', amount: '8000', purpose: 'Advance to Ghulam Rasool', counterparty: 'Ghulam Rasool (staff)' });
    const wrongAdvance = await posted(api, { direction: 'payment', category: 'misc_expense', amount: '8000', purpose: 'Advance ANR-AD-0002 to Ghulam Rasool', counterparty: 'Ghulam Rasool (staff)' });
    const supplier = await posted(api, { direction: 'payment', category: 'repairs', amount: '8000', purpose: 'Pump repair', counterparty: 'Ravi Pumps (Demo)' });
    const receipt = await posted(api, { direction: 'receipt', category: 'hall_booking', amount: '4000', purpose: 'Hall booking, 26 October', counterparty: 'Hina Rana (B-204)' });
    const elsewhere = await posted(api, { direction: 'payment', category: 'misc_expense', amount: '8000', purpose: `Advance ${a.ref} to Rukhsana Bibi (other office)`, counterparty: 'Rukhsana Bibi (staff)' });
    const reversed = await posted(api, { direction: 'payment', category: 'misc_expense', amount: '8000', purpose: `Advance ${a.ref} to Rukhsana Bibi (entered twice)`, counterparty: 'Rukhsana Bibi (staff)' });
    await api.as('alnoor_accounts').post(`/finance/vouchers/${reversed}/reverse`, { reason: 'Entered twice by mistake' });
    // A voucher of another legal entity and site (S.1 keeps one entity in the demo, so the stored
    // voucher is moved there directly).
    const society = api.section<{ finance: { vouchers: Array<{ id: string; legalEntityId: string; siteId: string }> } }>('society');
    Object.assign(society.finance.vouchers.find((v) => v.id === elsewhere)!, { legalEntityId: 'le_anx_demo', siteId: 'site_anx_demo' });
    const before = JSON.stringify(society.finance);

    api.as('alnoor_manager');
    const tries: Array<[string, string, 'disbursement' | 'repayment']> = [
      ['correct amount, the right payee and reference', right, 'disbursement'],
      ['correct amount, wrong employee', wrongEmployee, 'disbursement'],
      ['correct amount, wrong advance', wrongAdvance, 'disbursement'],
      ['a supplier payment', supplier, 'disbursement'],
      ['an unrelated receipt as a repayment', receipt, 'repayment'],
      ['another legal entity and site', elsewhere, 'disbursement'],
      ['reversed before linking', reversed, 'disbursement'],
      ['the same voucher again', right, 'disbursement'],
    ];
    for (const [what, voucherId, purpose] of tries) {
      expect(await refusal(api.post(`/hr/advances/${a.id}/link`, { purpose, voucherId })), what).toMatchObject({ status: 409, code: 'settlement_unverifiable' });
    }
    // Reversed after an attempt: still nothing to undo.
    await api.as('alnoor_accounts').post(`/finance/vouchers/${right}/reverse`, { reason: 'Paid in cash instead' });
    expect(await refusal(api.as('alnoor_manager').post(`/hr/advances/${a.id}/link`, { purpose: 'disbursement', voucherId: right }))).toMatchObject({ code: 'settlement_unverifiable' });

    const list = await api.get<AdvancesList>('/hr/advances');
    const after = list.items.find((x) => x.id === a.id)!;
    expect(after).toMatchObject({ state: 'approved', payment: 'unverified', schedule: [{ state: 'planned' }, { state: 'planned' }] });
    expect(after.history.map((h) => h.action)).toEqual(['advance_requested', 'advance_approved']);
    expect(JSON.stringify(list)).not.toMatch(/disburs|repaid|received|outstanding|owed/);
    // 8,000 and Ghulam Rasool's 15,000: approved, payment not verified.
    expect(list.totals.approvedUnverified.amount).toBe('23000.00');
    // The cashbook is S.1's: HR's attempts changed none of its vouchers. (Reversing `right` is S.1's own
    // action: it marks that voucher and adds a reversal voucher, so both are left out of the comparison.)
    const earlier = (JSON.parse(before) as typeof society.finance).vouchers.filter((v) => v.id !== right);
    expect(JSON.stringify(society.finance.vouchers.filter((v) => earlier.some((x) => x.id === v.id)))).toBe(JSON.stringify(earlier));
    // No voucher listing for HR either.
    expect((await refusal(api.get(`/hr/advances/${a.id}/candidates`, { purpose: 'disbursement' }))).status).toBe(404);
  });

  it('maker ≠ checker: the requester may not approve their own request, even holding the approval permission', async () => {
    const api = session({ accessFor: (p) => {
      const a = effectiveAccessFor(p);
      return a && p.id === 'alnoor_manager' ? { ...a, permissions: [...a.permissions, 'hr.advances.approve'] } : a;
    } });
    const ghulam = (await api.as('alnoor_manager').get<EmployeesList>('/hr/employees')).items.find((e) => e.name === 'Ghulam Rasool')!;
    const own = await api.post<StaffAdvanceView>('/hr/advances', { employeeId: ghulam.id, kind: 'advance', amount: '3000', reason: 'Bus fare for the family visit', instalments: 1, firstMonth: '2026-11', evidence: [{ name: 'request.pdf', type: 'application/pdf', sizeBytes: 1000 }] });
    expect((await refusal(api.post(`/hr/advances/${own.id}/approve`))).code).toBe('maker_checker_required');
    expect((await api.as('alnoor_treasurer').post<StaffAdvanceView>(`/hr/advances/${own.id}/approve`)).state).toBe('approved');
  });
});
