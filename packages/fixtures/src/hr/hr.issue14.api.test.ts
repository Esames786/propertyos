import type { AccessScope, AdvancesList, AttendanceDay, Candidate, Employee360, EmployeesList, HrDepartment, LeaveAndCorrections, LeaveRequestView, OnDutyBoard, Persona, RosterWeek, StaffAdvanceView } from '@repo/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectiveAccessFor } from '../tenant-directory';
import { at, emp, refusal, session, type Session } from './api-test-kit';
import { addFictionalSites } from './multisite.fixture';

/**
 * Gate S.2a closure (GitHub Issue #14) through the fail-closed mock API.
 * - **P0.** On the fictional multi-site organisation (`multisite.fixture.ts`), Rashid works at the
 *   main site and at Block C. A manager scoped to the main site may see him, but may not change what
 *   both sites share: details, role, consent, documents, leave or advances. Every refused request
 *   leaves the stored HR state exactly as it was, Block C's roster and coverage included. HR covering
 *   both sites still may, and the refusals never name Block C.
 * - **P1.** A supervisor holding only `attendance.record` sees the staffing of the departments they
 *   supervise at the sites they work at: roster, On duty now, attendance, cover candidates. Nothing
 *   else, even by a direct query.
 */
const SCOPES: Record<string, AccessScope[] | undefined> = {};
const scoped = (p: Persona) => {
  const a = effectiveAccessFor(p);
  if (!a) return null;
  const s = SCOPES[p.id];
  return s ? { ...a, scopes: s } : a;
};
const siteOnly = (...ids: string[]): AccessScope[] => [{ type: 'site', ids }];

async function multi() {
  const api = session({ accessFor: scoped });
  await api.as('alnoor_manager').get('/hr/dashboard');
  const f = addFictionalSites(api.hr());
  return { api, f };
}

/** The whole stored HR state, to prove a refused request changed nothing at all. */
const snapshot = (api: Session) => JSON.stringify(api.hr());
const NOT_BLOCK_C = /Block C|site_anc_demo|ANC|sht_anc|Omer Farooq|Patrol/;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at('15:30');
  for (const k of Object.keys(SCOPES)) delete SCOPES[k];
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------------------------
// P0: employee-wide changes need every one of the employee's sites
// ---------------------------------------------------------------------------------------------

describe('Issue #14 P0: a single-site manager cannot change a shared multi-site employee', () => {
  it('details, role, contacts and resident-facing consent: refused, nothing stored changes; HR for both sites may', async () => {
    const { api, f } = await multi();
    SCOPES.alnoor_manager = siteOnly(f.main.siteId);
    api.as('alnoor_manager');
    // Rashid stays visible to the main site (Issue #12), read only.
    const view = await api.get<Employee360>(`/hr/employees/${f.rashid.id}`);
    expect(view.allSitesInScope).toBe(false);
    expect(view.actions).toMatchObject({ edit: false, changeStatus: false, requestLeave: false, manageDocuments: false, requestAdvance: false });
    // Duties and attendance are the main site's own: planning there stays available.
    expect(view.actions.assign).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(NOT_BLOCK_C);
    const list = await api.get<EmployeesList>('/hr/employees', { status: 'all' });
    expect(list.items.find((e) => e.id === f.rashid.id)!.allSitesInScope).toBe(false);
    expect(list.items.filter((e) => e.id !== f.rashid.id).every((e) => e.allSitesInScope)).toBe(true);

    const before = snapshot(api);
    const refused = [
      await refusal(api.patch(`/hr/employees/${f.rashid.id}`, { role: 'cleaner' })),
      await refusal(api.patch(`/hr/employees/${f.rashid.id}`, { phone: '0300 0000999', emergencyContact: '0300 0000998', address: 'House 1, Street 1, Lahore (Demo)' })),
      // An invalid body is refused for authority first: no hint from validation either.
      await refusal(api.patch(`/hr/employees/${f.rashid.id}`, { phone: 'not a phone' })),
      await refusal(api.post(`/hr/employees/${f.rashid.id}/profile`, { consent: false })),
      await refusal(api.post(`/hr/employees/${f.rashid.id}/profile`, { consent: true, showName: false, showPhoto: true })),
      await refusal(api.post(`/hr/employees/${f.rashid.id}/status`, { status: 'suspended', on: '2026-10-26', reason: 'Testing the scope' })),
    ];
    for (const r of refused) expect(r).toMatchObject({ status: 403, code: 'other_sites' });
    expect(JSON.stringify(refused)).not.toMatch(NOT_BLOCK_C);
    expect(snapshot(api)).toBe(before);

    // Someone responsible for both sites may: organisation-wide, or a legal-entity scope covering both.
    SCOPES.alnoor_manager = [{ type: 'legal_entity', ids: [f.main.legalEntityId] }];
    expect((await api.get<Employee360>(`/hr/employees/${f.rashid.id}`)).actions.edit).toBe(true);
    delete SCOPES.alnoor_manager;
    const changed = await api.patch<Employee360>(`/hr/employees/${f.rashid.id}`, { phone: '0300 0000999' });
    expect(changed.personal?.phone).toBe('+92 300 0000999');
    expect((await api.post<Employee360>(`/hr/employees/${f.rashid.id}/profile`, { consent: false })).publicProfile.consent).toBe(false);
    // A single-site employee of the main site: the main-site manager keeps every action.
    SCOPES.alnoor_manager = siteOnly(f.main.siteId);
    const asif = await emp(api, 'Asif Mehmood');
    expect(asif.allSitesInScope).toBe(true);
    expect((await api.patch<Employee360>(`/hr/employees/${asif.id}`, { phone: '0300 0000990' })).personal?.phone).toBe('+92 300 0000990');
  });

  it('a refused edit changes nothing, even when its other fields were valid', async () => {
    const api = session();
    const asif = await emp(api, 'Asif Mehmood');
    const before = snapshot(api);
    expect((await refusal(api.patch(`/hr/employees/${asif.id}`, { phone: '0300 0000991', role: 'astronaut' }))).fields).toContain('role');
    expect((await refusal(api.patch(`/hr/employees/${asif.id}`, { phone: '0300 0000991', address: 'x' }))).fields).toContain('address');
    expect((await refusal(api.patch(`/hr/employees/${asif.id}`, { address: 'House 2, Street 2, Lahore (Demo)', emergencyContact: 'nope' }))).fields).toContain('emergencyContact');
    expect(snapshot(api)).toBe(before);
  });

  it('shared documents: a main-site manager cannot add or replace one; HR for both sites can', async () => {
    const { api, f } = await multi();
    const pdf = { name: 'rashid-appointment.pdf', type: 'application/pdf', sizeBytes: 50_000 };
    // HR for both sites records his appointment letter.
    await api.as('alnoor_admin').post('/hr/documents', { employeeId: f.rashid.id, kind: 'appointment_letter', file: pdf, issuedOn: '2025-01-01' });
    SCOPES.alnoor_manager = siteOnly(f.main.siteId);
    api.as('alnoor_manager');
    const before = snapshot(api);
    const replace = await refusal(api.post('/hr/documents', { employeeId: f.rashid.id, kind: 'appointment_letter', file: { ...pdf, name: 'forged.pdf' }, issuedOn: '2026-10-01' }));
    const add = await refusal(api.post('/hr/documents', { employeeId: f.rashid.id, kind: 'police_verification', number: 'PV-123456', file: pdf, issuedOn: '2026-10-01', expiresOn: '2027-10-01' }));
    for (const r of [replace, add]) expect(r).toMatchObject({ status: 403, code: 'other_sites' });
    expect(JSON.stringify([replace, add])).not.toMatch(NOT_BLOCK_C);
    expect(snapshot(api)).toBe(before);
    delete SCOPES.alnoor_manager;
    const done = await api.post<Employee360>('/hr/documents', { employeeId: f.rashid.id, kind: 'appointment_letter', file: { ...pdf, name: 'rashid-appointment-v2.pdf' }, issuedOn: '2026-10-01' });
    expect(done.documents.items?.find((d) => d.kind === 'appointment_letter')).toMatchObject({ version: 2, fileName: 'rashid-appointment-v2.pdf' });
  });

  it('leave touching Block C: a main-site manager can neither submit, approve, reject nor cancel it; Block C\'s roster stays as published', async () => {
    const { api, f } = await multi();
    const blockCRoster = async () => JSON.stringify(await api.as('alnoor_admin').get<RosterWeek>('/hr/roster', { site: f.blockC.siteId }));
    const mainRoster = async () => JSON.stringify(await api.as('alnoor_admin').get<RosterWeek>('/hr/roster'));
    // HR for both sites asks for Rashid's leave (tonight, when he is on Block C's night duty) and a later day.
    const tonight = await api.as('alnoor_admin').post<LeaveRequestView>('/hr/leave', { employeeId: f.rashid.id, type: 'casual', from: '2026-10-26', to: '2026-10-26', reason: 'Family matter tonight' });
    const later = await api.post<LeaveRequestView>('/hr/leave', { employeeId: f.rashid.id, type: 'casual', from: '2026-10-29', to: '2026-10-29', reason: 'Family matter later' });
    await api.as('alnoor_manager').post(`/hr/leave/${later.id}/approve`);
    const rosters = [await blockCRoster(), await mainRoster()];

    SCOPES.alnoor_manager = siteOnly(f.main.siteId);
    api.as('alnoor_manager');
    // The list shows the request read only, with the reason given.
    const listed = (await api.get<LeaveAndCorrections>('/hr/leave-adjustments')).leave.find((l) => l.id === tonight.id)!;
    expect(listed).toMatchObject({ blocked: 'other_sites', actions: { approve: false, reject: false, cancel: false } });
    expect((await api.get<LeaveAndCorrections>('/hr/leave-adjustments')).leave.find((l) => l.id === later.id)!.actions.cancel).toBe(false);
    const before = snapshot(api);
    const refused = [
      await refusal(api.post('/hr/leave', { employeeId: f.rashid.id, type: 'sick', from: '2026-10-27', to: '2026-10-27', reason: 'Testing the scope' })),
      await refusal(api.post(`/hr/leave/${tonight.id}/approve`)),
      await refusal(api.post(`/hr/leave/${tonight.id}/reject`, { note: 'Testing the scope' })),
      await refusal(api.post(`/hr/leave/${tonight.id}/cancel`, { reason: 'Testing the scope' })),
      await refusal(api.post(`/hr/leave/${later.id}/cancel`, { reason: 'Testing the scope' })),
    ];
    for (const r of refused) expect(r).toMatchObject({ status: 403, code: 'other_sites' });
    expect(JSON.stringify(refused)).not.toMatch(NOT_BLOCK_C);
    expect(snapshot(api)).toBe(before);
    SCOPES.alnoor_manager = undefined;
    expect([await blockCRoster(), await mainRoster()]).toEqual(rosters);

    // HR for both sites decides it, and Block C's night duty then shows the gap (the reason for the rule).
    await api.as('alnoor_manager').post(`/hr/leave/${tonight.id}/approve`);
    const night = (await api.as('alnoor_admin').get<RosterWeek>('/hr/roster', { site: f.blockC.siteId })).days[0]!.shifts.find((s) => s.shiftKey === 'night')!;
    expect(night.assignments.find((a) => a.employeeId === f.rashid.id)!.attendance).toBe('on_leave');
  });

  it('advances: a main-site manager or treasurer cannot raise, decide or withdraw one for the shared employee', async () => {
    const { api, f } = await multi();
    const pdf = { name: 'request.pdf', type: 'application/pdf', sizeBytes: 9_000 };
    const raised = await api.as('alnoor_admin').post<StaffAdvanceView>('/hr/advances', { employeeId: f.rashid.id, kind: 'advance', amount: '5000', instalments: 1, firstMonth: '2026-11', reason: 'Advance against November', evidence: [pdf] });
    SCOPES.alnoor_manager = siteOnly(f.main.siteId);
    SCOPES.alnoor_treasurer = siteOnly(f.main.siteId);
    const staff = (await api.as('alnoor_manager').get<AdvancesList>('/hr/advances')).staff.map((s) => s.id);
    expect(staff).not.toContain(f.rashid.id);
    expect(staff.length).toBeGreaterThan(0);
    const shown = (await api.as('alnoor_treasurer').get<AdvancesList>('/hr/advances')).items.find((a) => a.id === raised.id)!;
    expect(shown).toMatchObject({ blocked: 'other_sites', actions: { approve: false, reject: false, withdraw: false } });
    const before = snapshot(api);
    const refused = [
      await refusal(api.as('alnoor_manager').post('/hr/advances', { employeeId: f.rashid.id, kind: 'advance', amount: '1000', instalments: 1, firstMonth: '2026-11', reason: 'Testing the scope here', evidence: [pdf] })),
      await refusal(api.post(`/hr/advances/${raised.id}/withdraw`, { reason: 'Testing the scope' })),
      await refusal(api.as('alnoor_treasurer').post(`/hr/advances/${raised.id}/approve`)),
      await refusal(api.post(`/hr/advances/${raised.id}/reject`, { note: 'Testing the scope' })),
    ];
    for (const r of refused) expect(r).toMatchObject({ status: 403, code: 'other_sites' });
    expect(snapshot(api)).toBe(before);
    // Linking stays refused for everyone (Issue #12).
    expect((await refusal(api.as('alnoor_manager').post(`/hr/advances/${raised.id}/link`, { purpose: 'disbursement', voucherId: 'cvh_x' }))).code).toBe('settlement_unverifiable');
    delete SCOPES.alnoor_treasurer;
    expect((await api.as('alnoor_treasurer').post<StaffAdvanceView>(`/hr/advances/${raised.id}/approve`)).state).toBe('approved');
  });

  it('another site\'s employee is still "not found", never "other sites" (nothing discloses that they exist)', async () => {
    const { api, f } = await multi();
    SCOPES.alnoor_manager = siteOnly(f.main.siteId);
    api.as('alnoor_manager');
    const a = await refusal(api.patch(`/hr/employees/${f.omer.id}`, { phone: '0300 0000999' }));
    const b = await refusal(api.patch('/hr/employees/emp_none_999', { phone: '0300 0000999' }));
    expect(a).toEqual(b);
    expect(a.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------------------------
// P1: supervisors see their own departments' staffing only
// ---------------------------------------------------------------------------------------------

const SECURITY: HrDepartment[] = ['security'];
const UPKEEP: HrDepartment[] = ['maintenance', 'housekeeping'];

/** The names on this week's roster by department, as the manager (full HR) sees them. */
async function namesByDepartment(api: Session) {
  const week = await api.as('alnoor_manager').get<RosterWeek>('/hr/roster');
  const map = new Map<HrDepartment, Set<string>>();
  for (const d of week.days) for (const s of d.shifts) for (const a of s.assignments) (map.get(s.department) ?? map.set(s.department, new Set()).get(s.department)!).add(a.employeeName);
  return map;
}
const othersThan = (map: Map<HrDepartment, Set<string>>, mine: HrDepartment[]) => [...map].filter(([d]) => !mine.includes(d)).flatMap(([, names]) => [...names]);

function departmentsOf(w: RosterWeek | OnDutyBoard) {
  if ('days' in w) return new Set([...w.templates.map((t) => t.department), ...w.days.flatMap((d) => d.shifts.map((s) => s.department)), ...w.warnings.map((x) => x.department)]);
  return new Set([...w.current, ...w.next].map((s) => s.department));
}
const staffNames = (w: RosterWeek | OnDutyBoard) => ('days' in w ? w.days.flatMap((d) => d.shifts.flatMap((s) => s.assignments.map((a) => a.employeeName))) : [...w.current, ...w.next].flatMap((s) => s.staff.flatMap((p) => [p.name, p.coverFor ?? '', p.coveredBy ?? ''])).filter(Boolean));

describe('Issue #14 P1: supervisors see only the staffing of their own departments and sites', () => {
  it('roster, On duty now and attendance: Shahid security only, Naveed maintenance and housekeeping only; full HR sees every department', async () => {
    const api = session();
    const names = await namesByDepartment(api);
    expect([...names.keys()].sort()).toEqual(['housekeeping', 'maintenance', 'office', 'security']);
    for (const [persona, mine] of [
      ['alnoor_guard', SECURITY],
      ['alnoor_maintenance', UPKEEP],
    ] as const) {
      api.as(persona);
      const week = await api.get<RosterWeek>('/hr/roster');
      const next = await api.get<RosterWeek>('/hr/roster', { week: '2026-11-02' });
      at('09:30');
      const board = await api.get<OnDutyBoard>('/hr/roster/now');
      at('15:30');
      for (const w of [week, next, board]) {
        expect([...departmentsOf(w)].every((d) => mine.includes(d)), persona).toBe(true);
        for (const name of othersThan(names, mine)) expect(staffNames(w), `${persona} ${name}`).not.toContain(name);
      }
      expect(departmentsOf(week).size).toBe(mine.length);
      expect(week.actions).toEqual({ edit: false, publish: false });
      const day = await api.get<AttendanceDay>('/hr/attendance');
      expect(day.rows.length).toBeGreaterThan(0);
      expect(day.rows.every((r) => mine.includes(r.department))).toBe(true);
    }
    // The manager (hr.view and shifts.manage) still sees the combined roster and board.
    at('09:30');
    expect([...departmentsOf(await api.as('alnoor_manager').get<OnDutyBoard>('/hr/roster/now'))].sort()).toEqual(['housekeeping', 'maintenance', 'office', 'security']);
    expect(departmentsOf(await api.get<RosterWeek>('/hr/roster')).size).toBe(4);
  });

  it('cover candidates: only for their own department, today or last night; refused before any staff is read otherwise', async () => {
    const api = session();
    const names = await namesByDepartment(api);
    const today = '2026-10-26';
    // Naveed asks for the guards' evening shift, Shahid for the plumbers' day: refused.
    expect(await refusal(api.as('alnoor_maintenance').get('/hr/roster/candidates', { templateId: 'sht_anr_evening', date: today }))).toMatchObject({ status: 403, code: 'not_your_department' });
    expect(await refusal(api.as('alnoor_guard').get('/hr/roster/candidates', { templateId: 'sht_anr_maintenance', date: today }))).toMatchObject({ status: 403, code: 'not_your_department' });
    expect(await refusal(api.get('/hr/roster/candidates', { templateId: 'sht_anr_housekeeping', date: today }))).toMatchObject({ status: 403, code: 'not_your_department' });
    // Planning next week is the manager's (O3): no candidates for a supervisor.
    expect(await refusal(api.get('/hr/roster/candidates', { templateId: 'sht_anr_evening', date: '2026-10-28' }))).toMatchObject({ status: 403, code: 'permission_missing' });
    // Their own shift today: guards only.
    const own = await api.get<Candidate[]>('/hr/roster/candidates', { templateId: 'sht_anr_evening', date: today });
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((c) => names.get('security')!.has(c.name) || c.role === 'security_guard' || c.role === 'security_supervisor')).toBe(true);
    for (const name of othersThan(names, SECURITY)) expect(own.map((c) => c.name)).not.toContain(name);
    // The manager keeps planning candidates for any shift and date.
    expect((await api.as('alnoor_manager').get<Candidate[]>('/hr/roster/candidates', { templateId: 'sht_anr_maintenance', date: '2026-10-28' })).length).toBeGreaterThan(0);
  });

  it('cover: a supervisor still brings in a guard for an absent one, but naming anyone outside their staffing gets the answer of an unknown id', async () => {
    const api = session();
    api.as('alnoor_guard');
    const evening = (await api.get<OnDutyBoard>('/hr/roster/now')).current.find((s) => s.shiftKey === 'evening')!;
    const faisal = evening.staff.find((p) => p.name === 'Faisal Iqbal')!;
    const waqas = await emp(api, 'Waqas Ali'); // electrician (maintenance)
    // Naveed's cover on a guard's duty is refused the same way before and after the guard is marked
    // absent: nothing about another department's attendance can be learned from the answer.
    const naveedCover = () => api.as('alnoor_maintenance').post('/hr/roster/assignments', { employeeId: waqas.id, templateId: 'sht_anr_evening', date: '2026-10-26', coverFor: faisal.assignmentId });
    const notYetAbsent = await refusal(naveedCover());
    await api.as('alnoor_guard').post(`/hr/attendance/${faisal.assignmentId}/absent`);
    expect(await refusal(naveedCover())).toEqual(notYetAbsent);
    expect(notYetAbsent).toMatchObject({ status: 403, code: 'permission_missing' });
    api.as('alnoor_guard');
    const cover = (employeeId: string) => api.post('/hr/roster/assignments', { employeeId, templateId: 'sht_anr_evening', date: '2026-10-26', coverFor: faisal.assignmentId });
    const before = snapshot(api);
    const a = await refusal(cover(waqas.id));
    const b = await refusal(cover('emp_none_999'));
    expect(a).toEqual(b);
    expect(a.fields).toContain('employeeId');
    expect(JSON.stringify(a)).not.toContain('Waqas');
    expect(snapshot(api)).toBe(before);
    // The permitted cover still works (owner decision O3).
    const pick = (await api.get<Candidate[]>('/hr/roster/candidates', { templateId: 'sht_anr_evening', date: '2026-10-26' })).find((c) => !c.blocked)!;
    await api.post('/hr/roster/assignments', { employeeId: pick.employeeId, templateId: 'sht_anr_evening', date: '2026-10-26', coverFor: faisal.assignmentId });
    const after = (await api.get<OnDutyBoard>('/hr/roster/now')).current.find((s) => s.shiftKey === 'evening')!;
    expect(after.staff.find((p) => p.name === 'Faisal Iqbal')!.coveredBy).toBe(pick.name);
    // Recording their own department goes on as before.
    const nadeem = after.staff.find((p) => p.name === 'Nadeem Abbas')!;
    expect((await api.post<{ state: string }>(`/hr/attendance/${nadeem.assignmentId}/check-in`)).state).toBe('late');
  });

  it('another site: never on a supervisor\'s roster, board or candidates, by default or by direct query', async () => {
    const { api, f } = await multi();
    at('23:30');
    api.as('alnoor_guard');
    const week = await api.get<RosterWeek>('/hr/roster');
    expect(week.siteId).toBe(f.main.siteId);
    expect(week.sites.map((s) => s.id)).toEqual([f.main.siteId]);
    // A direct ?site= of a site where Shahid does not work answers like a site that does not exist.
    for (const path of ['/hr/roster', '/hr/roster/now', '/hr/attendance']) {
      const a = await refusal(api.get(path, { site: f.blockC.siteId }));
      const b = await refusal(api.get(path, { site: 'site_none' }));
      expect(a, path).toEqual(b);
      expect(a.status, path).toBe(404);
    }
    expect(await refusal(api.get('/hr/roster/candidates', { templateId: 'sht_anc_night', date: '2026-10-26' }))).toMatchObject({ status: 403, code: 'not_your_department' });
    // Main-site night candidates: guards allocated to the main site only (Rashid works here too).
    const night = await api.get<Candidate[]>('/hr/roster/candidates', { templateId: 'sht_anr_night', date: '2026-10-26' });
    expect(night.map((c) => c.name)).toContain('Rashid Latif');
    for (const name of ['Omer Farooq', 'Sajid Mahmood', 'Hina Akram']) expect(night.map((c) => c.name)).not.toContain(name);
    expect(night.some((c) => c.blocked === 'not_at_site')).toBe(false);
    const board = await api.get<OnDutyBoard>('/hr/roster/now');
    expect(JSON.stringify([week, board, night])).not.toMatch(/Block C|site_anc_demo|Omer Farooq|Annexe|Sajid/);
    // Bringing Omer (Block C) in as cover: the answer of an unknown id.
    const absentee = board.current.find((s) => s.shiftKey === 'night')!.staff[0]!;
    await api.post(`/hr/attendance/${absentee.assignmentId}/absent`);
    const cover = (employeeId: string) => api.post('/hr/roster/assignments', { employeeId, templateId: 'sht_anr_night', date: '2026-10-26', coverFor: absentee.assignmentId });
    const before = snapshot(api);
    expect(await refusal(cover(f.omer.id))).toEqual(await refusal(cover('emp_none_999')));
    expect(snapshot(api)).toBe(before);
    // HR for every site keeps the site switcher and Block C's roster.
    expect((await api.as('alnoor_admin').get<RosterWeek>('/hr/roster', { site: f.blockC.siteId })).siteId).toBe(f.blockC.siteId);
  });

  it('leave conflicts shown to a supervisor list their own departments\' duties only', async () => {
    const api = session();
    const asif = await emp(api, 'Asif Mehmood');
    const leave = await api.as('alnoor_admin').post<LeaveRequestView>('/hr/leave', { employeeId: asif.id, type: 'casual', from: '2026-10-27', to: '2026-10-28', reason: 'Family matter' });
    expect(leave.conflicts.length).toBeGreaterThan(0);
    // Shahid supervises security (Asif is a guard): he sees the clashing duties; Naveed does not see the request at all.
    expect((await api.as('alnoor_guard').get<LeaveAndCorrections>('/hr/leave-adjustments')).leave.find((l) => l.id === leave.id)!.conflicts).toEqual(leave.conflicts);
    expect((await api.as('alnoor_maintenance').get<LeaveAndCorrections>('/hr/leave-adjustments')).leave.find((l) => l.id === leave.id)).toBeUndefined();
  });

  it('a shared guard\'s leave: the supervisor sees the clash at his own site, never the one at Block C', async () => {
    const { api, f } = await multi();
    const main = await api.as('alnoor_manager').post<{ id: string }>('/hr/roster/assignments', { employeeId: f.rashid.id, templateId: 'sht_anr_morning', date: '2026-10-28', post: 'Main gate' });
    const leave = await api.as('alnoor_admin').post<LeaveRequestView>('/hr/leave', { employeeId: f.rashid.id, type: 'casual', from: '2026-10-26', to: '2026-10-28', reason: 'Family matter' });
    // HR for both sites sees both clashes.
    expect(leave.conflicts.map((c) => c.assignmentId).sort()).toEqual([f.ids.blockCNight, main.id].sort());
    // Shahid supervises security at the main site only.
    const shown = (await api.as('alnoor_guard').get<LeaveAndCorrections>('/hr/leave-adjustments')).leave.find((l) => l.id === leave.id)!;
    expect(shown.conflicts.map((c) => c.assignmentId)).toEqual([main.id]);
  });
});

// ---------------------------------------------------------------------------------------------
// Issue #14 follow-up (GPT review of 31bb0ed): no employee-id oracle on assignments; no fallback site
// ---------------------------------------------------------------------------------------------

describe('Issue #14 follow-up: a supervisor learns nothing from a refused assignment, and gets no site without staffing authority', () => {
  it('Naveed cannot tell a real security or office employee id from an id never issued, with or without cover; nothing changes', async () => {
    const api = session();
    const faisal = await emp(api, 'Faisal Iqbal'); // security guard
    const saba = await emp(api, 'Saba Javed'); // accounts officer (office)
    const evening = (await api.as('alnoor_guard').get<OnDutyBoard>('/hr/roster/now')).current.find((s) => s.shiftKey === 'evening')!;
    const faisalDuty = evening.staff.find((p) => p.name === 'Faisal Iqbal')!.assignmentId;
    const maintenance = (await api.as('alnoor_maintenance').get<AttendanceDay>('/hr/attendance')).rows.find((r) => r.department === 'maintenance' && r.employeeName === 'Bilal Khan')!;
    await api.post(`/hr/attendance/${maintenance.assignmentId}/absent`);
    const before = snapshot(api);
    const post = (body: Record<string, unknown>) => refusal(api.as('alnoor_maintenance').post('/hr/roster/assignments', body));
    const pairs: Array<[string, Record<string, unknown>]> = [
      // (a) no cover: planning, which Naveed may not do, on any shift.
      ['plan a guard shift', { templateId: 'sht_anr_evening', date: '2026-10-27' }],
      ['plan his own department', { templateId: 'sht_anr_maintenance', date: '2026-10-27' }],
      ['plan the office', { templateId: 'sht_anr_office', date: '2026-10-27' }],
      // (b) cover on the guards' evening shift, a department he does not supervise.
      ['cover a guard', { templateId: 'sht_anr_evening', date: '2026-10-26', coverFor: faisalDuty }],
      // (c) permitted cover (his own department today), with someone outside his staffing view.
      ['cover his own department', { templateId: 'sht_anr_maintenance', date: '2026-10-26', coverFor: maintenance.assignmentId }],
    ];
    for (const [what, body] of pairs) {
      const unknown = await post({ ...body, employeeId: 'emp_none_999' });
      for (const id of [faisal.id, saba.id]) expect(await post({ ...body, employeeId: id }), `${what}: ${id}`).toEqual(unknown);
      expect(JSON.stringify(unknown)).not.toMatch(/Faisal|Saba|Al-Noor|security|office/);
      expect(unknown.status, what).toBe(what.startsWith('cover his own') ? 422 : 403);
    }
    expect(snapshot(api)).toBe(before);
    // Shahid's permitted cover in his own department still works.
    api.as('alnoor_guard');
    await api.post(`/hr/attendance/${faisalDuty}/absent`);
    const pick = (await api.get<Candidate[]>('/hr/roster/candidates', { templateId: 'sht_anr_evening', date: '2026-10-26' })).find((c) => !c.blocked)!;
    await api.post('/hr/roster/assignments', { employeeId: pick.employeeId, templateId: 'sht_anr_evening', date: '2026-10-26', coverFor: faisalDuty });
    expect((await api.get<OnDutyBoard>('/hr/roster/now')).current.find((s) => s.shiftKey === 'evening')!.staff.find((p) => p.name === 'Faisal Iqbal')!.coveredBy).toBe(pick.name);
    // The manager still plans: Saba on Sunday's office shift (an exception day, when she has no duty).
    expect((await api.as('alnoor_manager').post<{ employeeId: string }>('/hr/roster/assignments', { employeeId: saba.id, templateId: 'sht_anr_office', date: '2026-11-01' })).employeeId).toBe(saba.id);
  });

  it('a supervisor with no staffing site (allocation ended, or no department) gets "not found" with no site named; valid supervisors keep their default site', async () => {
    const api = session();
    const main = (await api.as('alnoor_manager').get<RosterWeek>('/hr/roster')).siteId;
    const naveed = api.hr().employees.find((e) => e.name === 'Naveed Anjum')!;
    const kept = { sites: structuredClone(naveed.sites), supervises: [...naveed.supervises] };
    const paths = ['/hr/roster', '/hr/roster/now', '/hr/attendance'];
    const refused = async () => {
      api.as('alnoor_maintenance');
      for (const path of paths) {
        const a = await refusal(api.get(path));
        expect(a, path).toEqual(await refusal(api.get(path, { site: 'site_none' })));
        expect(a.status, path).toBe(404);
        expect(JSON.stringify(a)).not.toMatch(/Al-Noor|site_|published/i);
      }
    };
    // His allocation ended yesterday.
    naveed.sites = naveed.sites.map((s) => ({ ...s, to: '2026-10-25' }));
    await refused();
    // Allocated again, but supervising no department.
    naveed.sites = structuredClone(kept.sites);
    naveed.supervises = [];
    await refused();
    // Restored: his default site and departments are back; Shahid's default is unchanged.
    naveed.supervises = kept.supervises;
    expect((await api.as('alnoor_maintenance').get<RosterWeek>('/hr/roster')).siteId).toBe(main);
    expect((await api.as('alnoor_guard').get<RosterWeek>('/hr/roster')).siteId).toBe(main);
  });
});
