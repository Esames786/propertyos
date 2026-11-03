import type { AdvancesList, AttendanceCorrectionView, AttendanceDay, AttendanceRow, Candidate, CommunityHome, DocumentsOverview, Employee360, EmployeesList, HrDashboard, LeaveAndCorrections, LeaveRequestView, OnDutyBoard, ResidentStaffOnDuty, RosterWeek, StaffAdvanceView, AssignmentView } from '@repo/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectiveAccessFor } from '../tenant-directory';
import { at, emp, refusal, session, without } from './api-test-kit';

/**
 * Gate S.2a through the fail-closed mock API: the three reference flows (new employee to duty, the
 * guards' week, attendance and leave), and every guarantee the screens rely on: licensing (the
 * add-on and its roster feature), society-only HR, role permissions, supervisors limited to their
 * department, maker ≠ checker and nobody deciding their own record, effective dates, suspended
 * organisations, residents seeing roles only (names with consent), and advances that are never paid
 * by an approval. The demo's business date is Monday 26 October 2026; the wall clock is set per test.
 */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at('21:30');
});
afterEach(() => vi.useRealTimers());

const roster = (api: ReturnType<typeof session>, week = '2026-10-26') => api.get<RosterWeek>('/hr/roster', { week });
const shiftOf = (w: RosterWeek, date: string, key: string, dept = 'security') => w.days.find((d) => d.date === date)!.shifts.find((s) => s.shiftKey === key && s.department === dept)!;
const tpl = (key: string) => `sht_anr_${key}`;

const HIRE = { name: 'Hamza Raza', cnic: '35202-1122334-5', phone: '0300 0000299', address: 'House 5, Street 9, Township, Lahore (Demo)', legalEntityId: 'le_alnoor', siteId: 'site_alnoor', role: 'security_guard', employmentType: 'contract', startDate: '2026-10-26' };

describe('licensing, society-only HR and who may see what', () => {
  it('without the HR add-on: the office is refused and residents have no staff tab', async () => {
    const api = session({ accessFor: without('hr') });
    expect((await refusal(api.get('/hr/dashboard'))).code).toBe('module_not_licensed');
    expect((await refusal(api.get('/hr/roster'))).code).toBe('module_not_licensed');
    const home = await api.as('alnoor_resident_a101').get<CommunityHome>('/portal/community/home');
    expect(home.tabs).not.toContain('staff');
    expect(home.staff).toBeNull();
    expect((await refusal(api.get('/portal/community/staff'))).status).toBe(403);
  });

  it('without the roster feature: staff records work, the roster, attendance and residents\' tab do not', async () => {
    const api = session({ accessFor: (p) => {
      const a = effectiveAccessFor(p);
      return a ? { ...a, features: a.features.filter((f) => f !== 'hr.shifts') } : null;
    } });
    expect((await api.get<EmployeesList>('/hr/employees')).items.length).toBeGreaterThan(10);
    for (const path of ['/hr/roster', '/hr/roster/now', '/hr/attendance']) expect((await refusal(api.get(path))).code, path).toBe('feature_not_licensed');
    expect((await api.as('alnoor_resident_a101').get<CommunityHome>('/portal/community/home')).tabs).not.toContain('staff');
  });

  it('society HR only: a developer with HR in its plan gets "not found"; another organisation never sees Al-Noor', async () => {
    const api = session();
    // Larkspur's manager holds hr.view and the developer preset includes HR: developer HR is Gate E.
    expect((await refusal(api.as('manager').get('/hr/employees'))).status).toBe(404);
    // Shalimar (core + maintenance) is refused before anything is read.
    expect((await refusal(api.as('facility_manager').get('/hr/employees'))).status).toBe(403);
  });

  it('role permissions: the guard, treasurer and technician see only their part; residents never reach office HR', async () => {
    const api = session();
    api.as('alnoor_guard');
    for (const path of ['/hr/employees', '/hr/dashboard', '/hr/documents', '/hr/advances']) expect((await refusal(api.get(path))).code, path).toBe('permission_missing');
    expect((await api.get<OnDutyBoard>('/hr/roster/now')).current.length).toBeGreaterThan(0);
    // The supervisor's attendance list holds his own department's duties only.
    const day = await api.get<AttendanceDay>('/hr/attendance');
    expect(day.rows.length).toBeGreaterThan(0);
    expect(new Set(day.rows.map((r) => r.role))).toEqual(new Set(['security_supervisor', 'security_guard']));
    api.as('alnoor_treasurer');
    expect((await refusal(api.get('/hr/employees'))).code).toBe('permission_missing');
    expect((await api.get<AdvancesList>('/hr/advances')).canApprove).toBe(true);
    api.as('alnoor_technician');
    for (const path of ['/hr/employees', '/hr/roster/now', '/hr/advances', '/hr/attendance']) expect((await refusal(api.get(path))).status, path).toBe(403);
    expect((await refusal(api.as('alnoor_resident_a101').get('/hr/employees'))).status).toBe(403);
  });

  it('personal details only with hr.manage; nothing financial or personal in the directory', async () => {
    const api = session({ accessFor: (p) => {
      const a = effectiveAccessFor(p);
      return a && p.id === 'alnoor_manager' ? { ...a, permissions: a.permissions.filter((x) => x !== 'hr.manage' && x !== 'hr.documents.manage' && x !== 'hr.advances.manage') } : a;
    } });
    const list = await api.get<EmployeesList>('/hr/employees');
    expect(JSON.stringify(list)).not.toMatch(/35202-\d{7}|\+92 300|House \d+|PKR|amount/);
    const asif = await api.get<Employee360>(`/hr/employees/${list.items.find((e) => e.name === 'Asif Mehmood')!.id}`);
    expect(asif.personal).toBeUndefined();
    expect(asif.cnicMasked).toBe('35202-•••••••-3');
    expect(asif.advances).toBeUndefined();
    expect(asif.documents.items).toBeUndefined();
    expect(asif.documents.status.find((d) => d.kind === 'security_training')!.status).toBe('expired');
    const docs = await api.get<DocumentsOverview>('/hr/documents');
    expect(docs.canManage).toBe(false);
    expect(docs.rows.every((r) => r.documentId === undefined)).toBe(true);
  });

  it('a suspended organisation keeps reading its records but records nothing new', async () => {
    const api = session({ accessFor: (p) => {
      const a = effectiveAccessFor(p);
      return a ? { ...a, tenant: { ...a.tenant, status: 'suspended' } } : null;
    } });
    expect((await api.get<EmployeesList>('/hr/employees')).items.length).toBeGreaterThan(10);
    const day = await api.as('alnoor_guard').get<AttendanceDay>('/hr/attendance');
    expect((await refusal(api.post(`/hr/attendance/${day.rows[0]!.assignmentId}/check-in`))).code).toBe('tenant_suspended');
    expect((await refusal(api.as('alnoor_manager').post('/hr/employees', HIRE))).code).toBe('tenant_suspended');
  });
});

describe('reference flow 1: a new employee to active duty', () => {
  it('validated hire, Employee 360, a shift on the roster, attendance by the supervisor, and the 360 updated', async () => {
    const api = session();
    api.as('alnoor_manager');
    const bad = await refusal(api.post('/hr/employees', { ...HIRE, cnic: '1234', phone: '042 1234', role: 'pilot', startDate: '2027-06-01' }));
    expect(bad.fields).toEqual(expect.arrayContaining(['cnic']));
    // The same identity card number is refused (Asif's), naming the existing record.
    expect(await refusal(api.post('/hr/employees', { ...HIRE, cnic: '3520255213493' }))).toMatchObject({ status: 409, code: 'duplicate_employee', fields: ['cnic'] });
    expect((await refusal(api.post('/hr/employees', { ...HIRE, legalEntityId: 'le_other' }))).fields).toContain('legalEntityId');
    expect((await refusal(api.post('/hr/employees', { ...HIRE, siteId: 'site_shalimar' }))).fields).toContain('siteId');
    const hamza = await api.post<Employee360>('/hr/employees', HIRE);
    expect(hamza).toMatchObject({ code: 'ANR-E-016', status: 'active', department: 'security', legalEntity: { id: 'le_alnoor' }, personal: { phone: '+92 300 0000299' } });
    expect(hamza.documents.status.filter((d) => d.status === 'missing').map((d) => d.kind)).toEqual(['cnic', 'police_verification', 'appointment_letter', 'security_training']);
    // Tonight's night shift: on the roster, then the supervisor records him at 23:04 (on time).
    const a = await api.post<AssignmentView>('/hr/roster/assignments', { employeeId: hamza.id, templateId: tpl('night'), date: '2026-10-26', post: 'Patrol' });
    expect(a).toMatchObject({ shiftKey: 'night', start: '2026-10-26T23:00:00+05:00', end: '2026-10-27T07:00:00+05:00', attendance: 'planned' });
    expect(shiftOf(await roster(api), '2026-10-26', 'night').assignments.map((x) => x.employeeName)).toContain('Hamza Raza');
    at('23:04');
    const row = await api.as('alnoor_guard').post<AttendanceRow>(`/hr/attendance/${a.id}/check-in`);
    expect(row).toMatchObject({ state: 'present', recordedByName: 'Shahid Hussain' });
    const after = await api.as('alnoor_manager').get<Employee360>(`/hr/employees/${hamza.id}`);
    expect(after.today).toMatchObject({ state: 'on_duty', shiftKey: 'night' });
    expect(after.attendance.recent[0]).toMatchObject({ state: 'present' });
    expect(after.history.map((h) => h.action)).toContain('hired');
  });

  it('effective dates: an employee leaving at month end keeps duties until then, loses the ones after, and is never on duty after', async () => {
    const api = session();
    const zubair = await emp(api, 'Zubair Ahmed');
    await api.post(`/hr/employees/${zubair.id}/status`, { status: 'ended', on: '2026-10-29', reason: 'Resigned with notice' });
    const w = await roster(api);
    expect(shiftOf(w, '2026-10-29', 'night').assignments.map((x) => x.employeeName)).toContain('Zubair Ahmed');
    expect(shiftOf(w, '2026-10-31', 'night').assignments.map((x) => x.employeeName)).not.toContain('Zubair Ahmed');
    expect((await refusal(api.post('/hr/roster/assignments', { employeeId: zubair.id, templateId: tpl('morning'), date: '2026-10-30' }))).code).toBe('not_employed');
    // Rehire after an ended period starts a new one; an earlier date is refused.
    const javed = await emp(api, 'Javed Akhtar');
    expect((await refusal(api.post(`/hr/employees/${javed.id}/status`, { status: 'active', on: '2026-09-15', reason: 'Back again' }))).fields).toContain('on');
    const back = await api.post<Employee360>(`/hr/employees/${javed.id}/status`, { status: 'active', on: '2026-11-01', reason: 'Rehired for the winter' });
    expect(back.periods).toHaveLength(2);
    expect(back.status).toBe('active');
  });
});

describe('reference flow 2: the guards\' week', () => {
  it('overnight shifts, double booking and leave refused, pending leave warned, swaps, unassigning and publishing', async () => {
    const api = session();
    api.as('alnoor_manager');
    const w = await roster(api);
    expect(w.state).toBe('published');
    // Monday's evening is short only when someone is absent; Tuesday and Wednesday lack the reliever (on leave).
    expect(w.warnings.filter((x) => x.kind === 'short_staffed').map((x) => `${x.date} ${x.shiftKey}`)).toEqual(expect.arrayContaining(['2026-10-26 morning', '2026-10-27 evening', '2026-10-28 evening']));
    expect(w.warnings).toContainEqual(expect.objectContaining({ kind: 'leave_conflict', employeeName: 'Karim Bakhsh', date: '2026-10-30' }));
    const karim = await emp(api, 'Karim Bakhsh');
    const tariq = await emp(api, 'Tariq Javed');
    // Karim already holds Tuesday's night (a second one double-books him); his Tuesday evening would be
    // back to back with it, which is allowed. Tariq is on approved leave on Tuesday.
    expect((await refusal(api.post('/hr/roster/assignments', { employeeId: karim.id, templateId: tpl('night'), date: '2026-10-27' }))).code).toBe('overlap');
    await api.post('/hr/roster/assignments', { employeeId: karim.id, templateId: tpl('evening'), date: '2026-10-28', acknowledgeLeave: true });
    expect((await refusal(api.post('/hr/roster/assignments', { employeeId: tariq.id, templateId: tpl('evening'), date: '2026-10-27' }))).code).toBe('on_leave');
    // Pending leave: asked first, then assigned when acknowledged.
    expect((await refusal(api.post('/hr/roster/assignments', { employeeId: karim.id, templateId: tpl('morning'), date: '2026-10-31' }))).code).toBe('leave_pending');
    await api.post('/hr/roster/assignments', { employeeId: karim.id, templateId: tpl('morning'), date: '2026-10-31', acknowledgeLeave: true });
    // Swap Asif's Tuesday morning with Nadeem's Tuesday evening.
    const tue = await roster(api);
    const asifTue = shiftOf(tue, '2026-10-27', 'morning').assignments.find((x) => x.employeeName === 'Asif Mehmood')!;
    const nadeemTue = shiftOf(tue, '2026-10-27', 'evening').assignments.find((x) => x.employeeName === 'Nadeem Abbas')!;
    const swapped = await api.post<{ first: AssignmentView; second: AssignmentView }>(`/hr/roster/assignments/${asifTue.id}/swap`, { withAssignmentId: nadeemTue.id });
    expect([swapped.first.employeeName, swapped.second.employeeName]).toEqual(['Nadeem Abbas', 'Asif Mehmood']);
    // Unassigning needs a reason and is refused once the duty has begun.
    const tonight = shiftOf(tue, '2026-10-26', 'evening').assignments[0]!;
    expect((await refusal(api.post(`/hr/roster/assignments/${tonight.id}/unassign`, { reason: 'No longer needed' }))).code).toBe('duty_started');
    expect((await refusal(api.post(`/hr/roster/assignments/${nadeemTue.id}/unassign`, { reason: '' }))).fields).toContain('reason');
    await api.post(`/hr/roster/assignments/${nadeemTue.id}/unassign`, { reason: 'Covering the AGM instead' });
    const changed = await roster(api);
    // Two assignments, a swap (two duties) and an unassignment since the week was published.
    expect(changed.changesSincePublish).toBe(5);
    expect(changed.actions.publish).toBe(true);
    // Next week: a draft until published.
    const next = await roster(api, '2026-11-02');
    expect(next.state).toBe('draft');
    expect(next.warnings.some((x) => x.kind === 'short_staffed' && x.date === '2026-11-05')).toBe(true);
    expect((await api.post<RosterWeek>('/hr/roster/publish', { weekStart: '2026-11-02' })).state).toBe('published');
    expect((await refusal(api.post('/hr/roster/publish', { weekStart: '2026-11-02' }))).code).toBe('nothing_to_publish');
    expect((await refusal(api.as('alnoor_guard').post('/hr/roster/publish', { weekStart: '2026-10-26' }))).status).toBe(403);
  });

  it('on duty now: absent marked, a replacement suggested and brought in by the supervisor, coverage restored', async () => {
    const api = session();
    at('15:20');
    api.as('alnoor_guard');
    let board = await api.get<OnDutyBoard>('/hr/roster/now');
    const evening = board.current.find((s) => s.shiftKey === 'evening')!;
    expect(evening.staff.map((s) => [s.name, s.state])).toEqual([['Faisal Iqbal', 'not_checked_in'], ['Nadeem Abbas', 'not_checked_in']]);
    const faisal = evening.staff.find((s) => s.name === 'Faisal Iqbal')!;
    const nadeem = evening.staff.find((s) => s.name === 'Nadeem Abbas')!;
    // Too early to call someone absent within the grace period.
    at('15:10');
    expect((await refusal(api.post(`/hr/attendance/${faisal.assignmentId}/absent`))).code).toBe('too_early_absent');
    at('15:22');
    expect((await api.post<AttendanceRow>(`/hr/attendance/${nadeem.assignmentId}/check-in`)).state).toBe('late');
    await api.post(`/hr/attendance/${faisal.assignmentId}/absent`, { note: 'No answer on his phone' });
    board = await api.get<OnDutyBoard>('/hr/roster/now');
    expect(board.current.find((s) => s.shiftKey === 'evening')).toMatchObject({ available: 1, short: true });
    // Candidates: Asif (his day off) first; Karim and Zubair are on tonight's night shift, back to back, so free too.
    const candidates = await api.get<Candidate[]>('/hr/roster/candidates', { templateId: tpl('evening'), date: '2026-10-26' });
    expect(candidates[0]).toMatchObject({ name: 'Asif Mehmood' });
    expect(candidates.find((c) => c.name === 'Nadeem Abbas')!.blocked).toBe('overlap');
    expect(candidates.find((c) => c.name === 'Tariq Javed')!.blocked).toBe('on_leave');
    const asif = candidates[0]!;
    const cover = await api.post<AssignmentView>('/hr/roster/assignments', { employeeId: asif.employeeId, templateId: tpl('evening'), date: '2026-10-26', coverFor: faisal.assignmentId });
    expect(cover.coverFor).toMatchObject({ employeeName: 'Faisal Iqbal' });
    board = await api.get<OnDutyBoard>('/hr/roster/now');
    const now = board.current.find((s) => s.shiftKey === 'evening')!;
    expect(now.staff.find((s) => s.name === 'Faisal Iqbal')).toMatchObject({ state: 'absent', coveredBy: 'Asif Mehmood' });
    expect(now).toMatchObject({ available: 2, short: false });
    // The supervisor plans nothing else: a future duty is the manager's.
    expect((await refusal(api.post('/hr/roster/assignments', { employeeId: asif.employeeId, templateId: tpl('morning'), date: '2026-10-29' }))).status).toBe(403);
    // A second cover for the same absence is refused.
    expect((await refusal(api.post('/hr/roster/assignments', { employeeId: (await emp(api.as('alnoor_manager'), 'Zubair Ahmed')).id, templateId: tpl('evening'), date: '2026-10-26', coverFor: faisal.assignmentId }))).code).toBe('already_covered');
  });

  it('the next duty to start, and last night\'s shift still running this morning', async () => {
    const api = session();
    at('06:30');
    const board = await api.as('alnoor_guard').get<OnDutyBoard>('/hr/roster/now');
    expect(board.current.map((s) => `${s.date} ${s.shiftKey}`)).toEqual(['2026-10-25 night']);
    expect(board.current[0]!.staff.every((s) => s.state === 'present')).toBe(true);
    expect(board.next.map((s) => s.shiftKey)).toEqual(['morning']);
  });
});

describe('reference flow 3: attendance corrections and leave', () => {
  it('recording is separate from approving; a correction changes the record only when someone else approves it', async () => {
    const api = session();
    // The maintenance supervisor records his own departments only.
    const day = await api.as('alnoor_guard').get<AttendanceDay>('/hr/attendance');
    expect((await refusal(api.as('alnoor_maintenance').post(`/hr/attendance/${day.rows[0]!.assignmentId}/check-in`))).code).toBe('not_your_department');
    // The guard cannot approve: no attendance.adjust.
    const list = await api.as('alnoor_manager').get<LeaveAndCorrections>('/hr/leave-adjustments');
    const zubair = list.corrections.find((c) => c.employeeName === 'Zubair Ahmed' && c.state === 'pending')!;
    expect((await refusal(api.as('alnoor_guard').post(`/hr/corrections/${zubair.id}/approve`))).status).toBe(403);
    const ok = await api.as('alnoor_manager').post<AttendanceCorrectionView>(`/hr/corrections/${zubair.id}/approve`);
    expect(ok).toMatchObject({ state: 'approved', decidedByName: 'Imran Qureshi' });
    const night = await api.get<AttendanceDay>('/hr/attendance', { date: '2026-10-24' });
    expect(night.rows.find((r) => r.employeeName === 'Zubair Ahmed' && r.shiftKey === 'night')).toMatchObject({ checkOut: '2026-10-25T07:04:00+05:00', corrected: true });
    // A new request by the supervisor, and he may not decide his own.
    const row = night.rows.find((r) => r.employeeName === 'Karim Bakhsh' && r.shiftKey === 'night')!;
    expect((await refusal(api.as('alnoor_guard').post(`/hr/attendance/${row.assignmentId}/corrections`, { after: { checkIn: row.checkIn, checkOut: row.checkOut }, reason: 'Same times again for the record' }))).fields).toContain('checkIn');
    const asked = await api.post<AttendanceCorrectionView>(`/hr/attendance/${row.assignmentId}/corrections`, { after: { checkIn: '2026-10-24T23:20:00+05:00', checkOut: row.checkOut }, reason: 'The gate log shows he arrived at 23:20, not before.' });
    expect(asked).toMatchObject({ state: 'pending', after: { state: 'late' } });
    expect((await refusal(api.post(`/hr/attendance/${row.assignmentId}/corrections`, { after: { state: 'absent' }, reason: 'Second request for the same duty' }))).code).toBe('correction_pending');
    expect((await refusal(api.as('alnoor_manager').post(`/hr/corrections/${asked.id}/reject`, { note: '' }))).fields).toContain('note');
  });

  it('nobody approves their own attendance correction or leave: the building manager\'s go to the committee secretary', async () => {
    const api = session();
    const list = await api.as('alnoor_manager').get<LeaveAndCorrections>('/hr/leave-adjustments');
    const own = list.corrections.find((c) => c.employeeName === 'Imran Qureshi')!;
    expect(own).toMatchObject({ state: 'pending', blocked: 'own_record', actions: { approve: false } });
    expect((await refusal(api.post(`/hr/corrections/${own.id}/approve`))).code).toBe('maker_checker_required');
    const ownLeave = list.leave.find((l) => l.employeeName === 'Imran Qureshi')!;
    expect((await refusal(api.post(`/hr/leave/${ownLeave.id}/approve`))).status).toBe(403);
    expect((await api.as('alnoor_admin').post<AttendanceCorrectionView>(`/hr/corrections/${own.id}/approve`)).state).toBe('approved');
    expect((await api.post<LeaveRequestView>(`/hr/leave/${ownLeave.id}/approve`)).state).toBe('approved');
  });

  it('leave: overlapping requests refused, conflicts with duties listed, approval turns them into gaps; no balance is invented', async () => {
    const api = session();
    const list = await api.as('alnoor_manager').get<LeaveAndCorrections>('/hr/leave-adjustments');
    expect(list.policy).toEqual({ adopted: false });
    const karimLeave = list.leave.find((l) => l.employeeName === 'Karim Bakhsh')!;
    expect(karimLeave.conflicts.map((c) => `${c.date} ${c.shiftKey}`)).toEqual(['2026-10-30 night', '2026-10-31 night']);
    const karim = await emp(api, 'Karim Bakhsh');
    expect((await refusal(api.post('/hr/leave', { employeeId: karim.id, type: 'sick', from: '2026-10-31', to: '2026-11-01', reason: 'Fever' }))).code).toBe('leave_overlap');
    expect((await refusal(api.post('/hr/leave', { employeeId: karim.id, type: 'sick', from: '2026-11-05', to: '2026-11-03', reason: 'Fever' }))).fields).toContain('to');
    // Shahid asked on Karim's behalf, so Imran may decide; the duties become gaps on the roster.
    await api.post(`/hr/leave/${karimLeave.id}/approve`);
    const w = await roster(api);
    expect(shiftOf(w, '2026-10-30', 'night').coverage).toMatchObject({ available: 1, short: true });
    expect(w.warnings).toContainEqual(expect.objectContaining({ kind: 'approved_leave', employeeName: 'Karim Bakhsh', date: '2026-10-30' }));
  });
});

describe('documents (fictional files, access-scoped)', () => {
  it('uploading is for hr.documents.manage; identity numbers must match; a new version replaces the old one', async () => {
    const api = session();
    const karim = await emp(api, 'Karim Bakhsh');
    const upload = { employeeId: karim.id, kind: 'police_verification', file: { name: 'karim-police.pdf', type: 'application/pdf', sizeBytes: 120_000 }, number: 'PV-LHR-2026-20001', issuedOn: '2026-10-20', expiresOn: '2027-10-20' };
    expect((await refusal(api.as('alnoor_guard').post('/hr/documents', upload))).status).toBe(403);
    api.as('alnoor_manager');
    expect((await refusal(api.post('/hr/documents', { ...upload, file: { ...upload.file, type: 'application/x-msdownload' } }))).fields).toContain('file');
    expect((await refusal(api.post('/hr/documents', { ...upload, kind: 'cnic', number: '35202-0000000-0' }))).fields).toContain('number');
    expect((await refusal(api.post('/hr/documents', { ...upload, expiresOn: '' }))).fields).toContain('expiresOn');
    const done = await api.post<Employee360>('/hr/documents', upload);
    expect(done.documents.status.find((d) => d.kind === 'police_verification')!.status).toBe('valid');
    const again = await api.post<Employee360>('/hr/documents', { ...upload, file: { ...upload.file, name: 'karim-police-v2.pdf' } });
    expect(again.documents.items!.filter((d) => d.kind === 'police_verification')).toMatchObject([{ version: 2, fileName: 'karim-police-v2.pdf' }]);
    const docs = await api.get<DocumentsOverview>('/hr/documents', { status: 'attention' });
    expect(docs.rows.map((r) => `${r.employeeName} ${r.kind} ${r.status}`)).toEqual(expect.arrayContaining(['Bilal Khan appointment_letter missing', 'Asif Mehmood security_training expired', 'Faisal Iqbal police_verification expiring']));
    expect(docs.rows.some((r) => r.employeeName === 'Karim Bakhsh')).toBe(false);
  });
});

describe('advances and loans: an approval is an instruction, never a payment', () => {
  it('request, maker ≠ checker, approved with its payment not verified; no voucher can be linked (Issue #12)', async () => {
    const api = session();
    const rukhsana = await emp(api, 'Rukhsana Bibi');
    const input = { employeeId: rukhsana.id, kind: 'advance', amount: '8000', reason: 'School fees for her two children', instalments: 2, firstMonth: '2026-11', evidence: [{ name: 'fee-challan.pdf', type: 'application/pdf', sizeBytes: 50_000 }] };
    expect((await refusal(api.post('/hr/advances', { ...input, evidence: [] }))).fields).toContain('evidence');
    expect((await refusal(api.post('/hr/advances', { ...input, amount: '-5' }))).fields).toContain('amount');
    expect((await refusal(api.post('/hr/advances', { ...input, instalments: 12 }))).fields).toContain('instalments');
    const a = await api.post<StaffAdvanceView>('/hr/advances', input);
    expect(a).toMatchObject({ state: 'submitted', payment: 'unverified', schedule: [{ amount: { amount: '4000.00' }, state: 'planned' }, { amount: { amount: '4000.00' }, state: 'planned' }] });
    // The manager raised it: he holds no approval permission; the treasurer decides.
    expect((await refusal(api.post(`/hr/advances/${a.id}/approve`))).status).toBe(403);
    const approved = await api.as('alnoor_treasurer').post<StaffAdvanceView>(`/hr/advances/${a.id}/approve`);
    expect(approved).toMatchObject({ state: 'approved', payment: 'unverified', actions: { approve: false, reject: false, withdraw: false } });
    expect(JSON.stringify(approved)).not.toMatch(/"paid"|disburs|outstanding|received/);
    // Settlement is read only: any link is refused (the full voucher matrix is in hr.closure.api.test.ts).
    expect((await refusal(api.as('alnoor_manager').post(`/hr/advances/${a.id}/link`, { purpose: 'disbursement', voucherId: 'cvh_any' }))).code).toBe('settlement_unverifiable');
    const list = await api.get<AdvancesList>('/hr/advances');
    expect(list.items.find((x) => x.id === a.id)!.state).toBe('approved');
    expect(list.counts).toEqual({ submitted: 1, approved: 2, rejected: 1, withdrawn: 0 });
  });

  it('nobody approves an advance for themselves, even holding the approval permission', async () => {
    const api = session({ accessFor: (p) => {
      const a = effectiveAccessFor(p);
      return a && p.id === 'alnoor_manager' ? { ...a, permissions: [...a.permissions, 'hr.advances.approve'] } : a;
    } });
    const imran = await emp(api, 'Imran Qureshi');
    const own = await api.as('alnoor_accounts').post<StaffAdvanceView>('/hr/advances', { employeeId: imran.id, kind: 'advance', amount: '5000', reason: 'Advance against November salary', instalments: 1, firstMonth: '2026-11', evidence: [{ name: 'request.pdf', type: 'application/pdf', sizeBytes: 1000 }] });
    expect((await refusal(api.as('alnoor_manager').post(`/hr/advances/${own.id}/approve`))).code).toBe('own_record');
    expect((await api.as('alnoor_treasurer').post<StaffAdvanceView>(`/hr/advances/${own.id}/approve`)).state).toBe('approved');
  });
});

describe('residents: staff on duty from the published roster, roles only unless consented', () => {
  it('names only with consent, never personal details; scheduled staff are expected, not on duty; independent of the hub and chat', async () => {
    const api = session({ accessFor: without('community_hub', 'community_chat') });
    at('15:30');
    const board = await api.as('alnoor_guard').get<OnDutyBoard>('/hr/roster/now');
    const evening = board.current.find((s) => s.shiftKey === 'evening')!;
    for (const name of ['Faisal Iqbal', 'Nadeem Abbas']) await api.post(`/hr/attendance/${evening.staff.find((p) => p.name === name)!.assignmentId}/check-in`);
    const imran = (await api.as('alnoor_manager').get<AttendanceDay>('/hr/attendance')).rows.find((r) => r.employeeName === 'Imran Qureshi')!;
    await api.as('alnoor_admin').post(`/hr/attendance/${imran.assignmentId}/check-in`);
    const staff = await api.as('alnoor_resident_a101').get<ResidentStaffOnDuty>('/portal/community/staff');
    expect(staff.confirmed.map((s) => [s.role, s.post, s.name ?? null])).toEqual([
      ['security_guard', 'Main gate', null], // Faisal: no consent
      ['security_guard', 'Patrol', null], // Nadeem: consented to his role only
      ['building_manager', 'Office', 'Imran Qureshi'],
    ]);
    // Not checked in yet: role and post only, even for Naveed, who agreed to show his name.
    expect(staff.expected.map((s) => [s.role, s.post])).toEqual([
      ['maintenance_supervisor', 'On call'],
      ['electrician', 'Plant room'],
      ['plumber', 'On call'],
      ['cleaner', 'Lobbies'],
      ['gardener', 'Garden'],
      ['accounts_officer', 'Office'],
    ]);
    expect(JSON.stringify(staff)).not.toMatch(/\+92|35202|House|PKR|absent|late|attendance|checkIn|employeeId|assignmentId|Javed Akhtar|Naveed/);
    expect(staff.next).toEqual([{ role: 'security_guard', startsAt: '2026-10-26T23:00:00+05:00', count: 2 }]);
  });

  it('an absent guard is not shown on duty; a draft week shows nobody; a resident who moved out sees nothing', async () => {
    const api = session();
    at('15:30');
    const board = await api.as('alnoor_guard').get<OnDutyBoard>('/hr/roster/now');
    const faisal = board.current.find((s) => s.shiftKey === 'evening')!.staff.find((s) => s.name === 'Faisal Iqbal')!;
    await api.post(`/hr/attendance/${faisal.assignmentId}/absent`);
    const staff = await api.as('alnoor_resident_a101').get<ResidentStaffOnDuty>('/portal/community/staff');
    expect([...staff.confirmed, ...staff.expected].filter((s) => s.role === 'security_guard')).toHaveLength(1);
    expect(staff.unavailable).toBe(1);
    api.hr().weeks.find((w) => w.weekStart === '2026-10-26')!.state = 'draft';
    const draft = await api.get<ResidentStaffOnDuty>('/portal/community/staff');
    expect([draft.confirmed, draft.expected, draft.unavailable]).toEqual([[], [], 0]);
    // The office board still shows the draft week's duties (flagged as not published).
    expect((await api.as('alnoor_guard').get<OnDutyBoard>('/hr/roster/now')).published).toBe(false);
  });
});

describe('the dashboard links every figure to its records', () => {
  it('counts and attention items point at filtered screens', async () => {
    const api = session();
    const d = await api.as('alnoor_manager').get<HrDashboard>('/hr/dashboard');
    expect(d.kpis).toMatchObject({ activeStaff: 14, leavePending: 2, correctionsPending: 2, documentsAttention: 4, advancesAwaiting: 1 });
    expect(d.attention.map((a) => a.kind)).toEqual(expect.arrayContaining(['short_staffed', 'leave_conflict', 'roster_draft', 'document', 'correction', 'leave']));
    for (const a of d.attention) expect(a.href).toMatch(/^\/backoffice\/hr\//);
  });
});
