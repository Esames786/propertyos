import type { AdvanceKind, AdvanceState, CorrectionValues, EmployeePersonal, EmploymentPeriod, EmploymentStatus, EmploymentType, HrDepartment, HrDocumentKind, HrEvent, HrRole, LeaveState, LeaveType, Money, PublicProfile, SettlementLink, ShiftKey, ShiftTemplate } from '@repo/contracts';
import { ROLE_DEPARTMENT } from '@repo/contracts';
import type { HandlerContext } from '../handler-types';
import type { OpsSite } from '../operations/site';
import { opsStamp } from '../operations/state';
import { pad } from '../seed';
import { shiftWindow, weekDays } from './rules';

/**
 * Gate S.2a: the society's HR records (one state per organisation; employees are allocated to its
 * sites). Seeds are deterministic and fictional: staff of Al-Noor Residency (Demo) with three roster
 * weeks (last week with attendance, this week published, next week a draft) and every warning the
 * screens explain. History stops at yesterday: today is recorded live, at the time it is used.
 */
// 1: Gate S.2a.
export const HR_STATE_VERSION = 1;
export const HR_SECTION = 'hr';
export const HR_TODAY = '2026-10-26';

export interface StoredEmployee {
  id: string;
  code: string;
  name: string;
  role: HrRole;
  department: HrDepartment;
  employmentType: EmploymentType;
  legalEntityId: string;
  status: EmploymentStatus;
  startDate: string;
  endDate?: string;
  periods: EmploymentPeriod[];
  sites: Array<{ siteId: string; from: string; to?: string }>;
  personal: EmployeePersonal;
  /** The staff sign-in of this person, if they have one (maker-checker compares it). */
  principalId?: string;
  /** Departments whose attendance this person records (supervisors). */
  supervises: HrDepartment[];
  profile: PublicProfile;
  history: HrEvent[];
}

export interface StoredAssignment {
  id: string;
  siteId: string;
  employeeId: string;
  templateId: string;
  date: string;
  post?: string;
  coverFor?: string;
  state: 'planned' | 'cancelled';
  createdByName: string;
  createdAt: string;
  cancelled?: { at: string; byName: string; reason: string };
  history: HrEvent[];
}

export interface StoredAttendance {
  assignmentId: string;
  employeeId: string;
  state: 'present' | 'late' | 'absent';
  checkIn?: string;
  checkOut?: string;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
  corrected: boolean;
  history: HrEvent[];
}

export interface StoredCorrection {
  id: string;
  ref: string;
  assignmentId: string;
  employeeId: string;
  before: CorrectionValues;
  after: CorrectionValues;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  state: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  history: HrEvent[];
}

export interface StoredLeave {
  id: string;
  ref: string;
  employeeId: string;
  type: LeaveType;
  from: string;
  to: string;
  reason: string;
  state: LeaveState;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  history: HrEvent[];
}

export interface StoredDocument {
  id: string;
  employeeId: string;
  kind: HrDocumentKind;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  number?: string;
  issuedOn?: string;
  expiresOn?: string;
  version: number;
  uploadedByName: string;
  uploadedAt: string;
  /** Replaced by a newer version (kept in the history, no longer current). */
  replacedAt?: string;
  history: HrEvent[];
}

export interface StoredAdvance {
  id: string;
  ref: string;
  employeeId: string;
  kind: AdvanceKind;
  amount: Money;
  reason: string;
  instalments: number;
  firstMonth: string;
  state: AdvanceState;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  evidence: Array<{ name: string; type: string; sizeBytes: number }>;
  disbursement?: SettlementLink;
  repayments: SettlementLink[];
  history: HrEvent[];
}

export interface RosterWeekState {
  siteId: string;
  weekStart: string;
  state: 'draft' | 'published';
  publishedAt?: string;
  publishedBy?: string;
  publishedByName?: string;
  changesSincePublish: number;
}

export interface HrState {
  version: typeof HR_STATE_VERSION;
  counters: Record<string, number>;
  /** Minutes after a shift starts before a check-in counts as late (a society setting). */
  graceMinutes: number;
  templates: ShiftTemplate[];
  employees: StoredEmployee[];
  assignments: StoredAssignment[];
  attendance: StoredAttendance[];
  corrections: StoredCorrection[];
  leave: StoredLeave[];
  documents: StoredDocument[];
  advances: StoredAdvance[];
  weeks: RosterWeekState[];
}

export const hrStamp = opsStamp;

const PREFIX = { employee: ['emp', 'E'], assignment: ['asg', ''], correction: ['cor', 'AC'], leave: ['lve', 'LV'], document: ['doc', ''], advance: ['adv', 'AD'] } as const;

/** Next id and reference of a kind ("emp_anr_016", "ANR-E-016"; "lve_anr_0004", "ANR-LV-0004"). */
export function nextHr(state: HrState, code: string, kind: keyof typeof PREFIX): { id: string; ref: string } {
  const seq = (state.counters[kind] ?? 0) + 1;
  state.counters[kind] = seq;
  const [prefix, ref] = PREFIX[kind];
  const width = kind === 'employee' ? 3 : 4;
  return { id: `${prefix}_${code.toLowerCase()}_${pad(seq, width)}`, ref: ref ? `${code}-${ref}-${pad(seq, width)}` : '' };
}

export function hrState(ctx: HandlerContext, site: OpsSite): HrState {
  const state = ctx.demo.section<HrState>(HR_SECTION, () => seedHr(site));
  if (state.version !== HR_STATE_VERSION) Object.assign(state, seedHr(site));
  return state;
}

// ---------------------------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------------------------

/** A wall-clock time in Pakistan on a date, as an instant with the offset. */
export const pkt = (date: string, time: string) => `${date}T${time}:00+05:00`;

const IMRAN = { by: 'usr_anr_0001', byName: 'Imran Qureshi' };
const SHAHID = { by: 'usr_anr_0003', byName: 'Shahid Hussain' };
const AYESHA = { by: 'usr_anr_0002', byName: 'Ayesha Malik' };
const RABIA = { by: 'usr_anr_r0003', byName: 'Rabia Hashmi' };

const ev = (who: { by: string; byName: string }, at: string, action: string, extra: Partial<HrEvent> = {}): HrEvent => ({ at, by: who.by, byName: who.byName, action, ...extra });

interface Person {
  name: string;
  role: HrRole;
  type: EmploymentType;
  start: string;
  end?: string;
  endReason?: string;
  principalId?: string;
  supervises?: HrDepartment[];
  consent?: { on: string; showName: boolean };
  cnic: string;
  phone: string;
  area: string;
}

const PEOPLE: Person[] = [
  { name: 'Shahid Hussain', role: 'security_supervisor', type: 'permanent', start: '2023-03-01', principalId: 'usr_anr_0003', supervises: ['security'], consent: { on: '2026-10-14', showName: true }, cnic: '35202-4410231-1', phone: '+92 300 0000201', area: 'Township' },
  { name: 'Asif Mehmood', role: 'security_guard', type: 'permanent', start: '2023-06-15', consent: { on: '2026-10-14', showName: true }, cnic: '35202-5521349-3', phone: '+92 300 0000202', area: 'Kot Lakhpat' },
  { name: 'Zubair Ahmed', role: 'security_guard', type: 'contract', start: '2024-01-10', cnic: '35201-6632457-5', phone: '+92 300 0000203', area: 'Green Town' },
  { name: 'Karim Bakhsh', role: 'security_guard', type: 'contract', start: '2024-08-01', cnic: '36302-7743561-7', phone: '+92 300 0000204', area: 'Model Town Extension' },
  { name: 'Nadeem Abbas', role: 'security_guard', type: 'permanent', start: '2022-11-01', consent: { on: '2026-10-15', showName: false }, cnic: '35202-8854672-9', phone: '+92 300 0000205', area: 'Township' },
  { name: 'Faisal Iqbal', role: 'security_guard', type: 'contract', start: '2025-02-01', cnic: '35401-9965781-1', phone: '+92 300 0000206', area: 'Ichhra' },
  { name: 'Tariq Javed', role: 'security_guard', type: 'daily_wage', start: '2025-07-01', cnic: '35202-1076893-3', phone: '+92 300 0000207', area: 'Faisal Town' },
  { name: 'Naveed Anjum', role: 'maintenance_supervisor', type: 'permanent', start: '2022-05-01', principalId: 'usr_anr_0005', supervises: ['maintenance', 'housekeeping'], consent: { on: '2026-10-14', showName: true }, cnic: '35202-2187904-5', phone: '+92 300 0000208', area: 'Garden Town' },
  { name: 'Waqas Ali', role: 'electrician', type: 'permanent', start: '2023-09-01', principalId: 'usr_anr_0006', cnic: '35202-3298015-7', phone: '+92 300 0000209', area: 'Johar Town' },
  { name: 'Bilal Khan', role: 'plumber', type: 'contract', start: '2024-04-15', cnic: '35202-4309126-9', phone: '+92 300 0000210', area: 'Wapda Town' },
  { name: 'Rukhsana Bibi', role: 'cleaner', type: 'daily_wage', start: '2024-02-01', cnic: '35202-5410237-2', phone: '+92 300 0000211', area: 'Kot Lakhpat' },
  { name: 'Ghulam Rasool', role: 'gardener', type: 'permanent', start: '2021-10-01', cnic: '35202-6521348-4', phone: '+92 300 0000212', area: 'Township' },
  { name: 'Imran Qureshi', role: 'building_manager', type: 'permanent', start: '2021-01-04', principalId: 'usr_anr_0001', supervises: ['office'], consent: { on: '2026-10-14', showName: true }, cnic: '35202-7632459-6', phone: '+92 300 0000213', area: 'Garden Town' },
  { name: 'Saba Javed', role: 'accounts_officer', type: 'permanent', start: '2022-08-01', principalId: 'usr_anr_0004', cnic: '35202-8743560-8', phone: '+92 300 0000214', area: 'Faisal Town' },
  { name: 'Javed Akhtar', role: 'security_guard', type: 'contract', start: '2023-05-01', end: '2026-09-30', endReason: 'Contract ended', consent: { on: '2025-01-10', showName: true }, cnic: '35202-9854671-0', phone: '+92 300 0000215', area: 'Township' },
];

/** Shift templates of Al-Noor's site (the society's own times and minimums). */
function templatesFor(siteId: string, code: string): ShiftTemplate[] {
  const id = (k: string) => `sht_${code.toLowerCase()}_${k}`;
  // Security runs every day; the day shifts Monday to Saturday.
  const all = [0, 1, 2, 3, 4, 5, 6];
  const weekdays = [0, 1, 2, 3, 4, 5];
  return [
    { id: id('morning'), siteId, key: 'morning', start: '07:00', end: '15:00', crossesMidnight: false, department: 'security', minStaff: 2, posts: ['Main gate', 'Patrol', 'Supervisor'], days: all },
    { id: id('evening'), siteId, key: 'evening', start: '15:00', end: '23:00', crossesMidnight: false, department: 'security', minStaff: 2, posts: ['Main gate', 'Patrol', 'Supervisor'], days: all },
    { id: id('night'), siteId, key: 'night', start: '23:00', end: '07:00', crossesMidnight: true, department: 'security', minStaff: 2, posts: ['Main gate', 'Patrol', 'Supervisor'], days: all },
    { id: id('maintenance'), siteId, key: 'day', start: '09:00', end: '17:00', crossesMidnight: false, department: 'maintenance', minStaff: 1, posts: ['Plant room', 'On call'], days: weekdays },
    { id: id('housekeeping'), siteId, key: 'day', start: '08:00', end: '16:00', crossesMidnight: false, department: 'housekeeping', minStaff: 1, posts: ['Lobbies', 'Garden'], days: weekdays },
    { id: id('office'), siteId, key: 'day', start: '09:00', end: '17:00', crossesMidnight: false, department: 'office', minStaff: 0, posts: ['Office'], days: weekdays },
  ];
}

const LAST_WEEK = '2026-10-19';
const THIS_WEEK = '2026-10-26';
const NEXT_WEEK = '2026-11-02';

export function seedHr(site: OpsSite): HrState {
  const state: HrState = { version: HR_STATE_VERSION, counters: {}, graceMinutes: 15, templates: [], employees: [], assignments: [], attendance: [], corrections: [], leave: [], documents: [], advances: [], weeks: [] };
  // Only Al-Noor's staff are known to the demo; another society starts with no staff.
  if (site.code !== 'ANR') return state;
  const code = site.code;
  state.templates = templatesFor(site.siteId, code);
  const tpl = (department: HrDepartment, key: ShiftKey) => state.templates.find((t) => t.department === department && t.key === key)!;

  // Employees ------------------------------------------------------------------------------------
  for (const p of PEOPLE) {
    const { id, ref } = nextHr(state, code, 'employee');
    const hiredAt = pkt(p.start, '10:00');
    state.employees.push({
      id,
      code: ref,
      name: p.name,
      role: p.role,
      department: ROLE_DEPARTMENT[p.role],
      employmentType: p.type,
      legalEntityId: site.legalEntityId,
      status: p.end ? 'ended' : 'active',
      startDate: p.start,
      ...(p.end ? { endDate: p.end } : {}),
      periods: [{ from: p.start, type: p.type, ...(p.end ? { to: p.end, endReason: p.endReason! } : {}) }],
      sites: [{ siteId: site.siteId, from: p.start, ...(p.end ? { to: p.end } : {}) }],
      personal: { cnic: p.cnic, phone: p.phone, address: `House ${10 + state.employees.length}, Street ${2 + (state.employees.length % 5)}, ${p.area}, Lahore (Demo)`, emergencyContact: `+92 300 00003${pad(state.employees.length + 1, 2)}` },
      ...(p.principalId ? { principalId: p.principalId } : {}),
      supervises: p.supervises ?? [],
      profile: p.consent ? { consent: true, consentAt: pkt(p.consent.on, '11:00'), recordedByName: IMRAN.byName, showName: p.consent.showName, showPhoto: false } : { consent: false, showName: false, showPhoto: false },
      history: [
        ev(IMRAN, hiredAt, 'hired', { values: { role: p.role } }),
        ...(p.consent ? [ev(IMRAN, pkt(p.consent.on, '11:00'), 'consent_given')] : []),
        ...(p.end ? [ev(IMRAN, pkt(p.end, '17:00'), 'ended', { note: p.endReason! })] : []),
      ],
    });
  }
  const emp = (name: string) => state.employees.find((e) => e.name === name)!;

  // Roster ---------------------------------------------------------------------------------------
  // Security: six guards on three shifts, each with a weekly day off; Tariq relieves whoever is off
  // (and has his own day off on Saturday). Day staff work Monday to Saturday.
  const ROTA: Record<'morning' | 'evening' | 'night', Array<[string, string]>> = {
    morning: [['Shahid Hussain', 'Supervisor'], ['Asif Mehmood', 'Main gate']],
    evening: [['Faisal Iqbal', 'Main gate'], ['Nadeem Abbas', 'Patrol']],
    night: [['Karim Bakhsh', 'Main gate'], ['Zubair Ahmed', 'Patrol']],
  };
  const OFF: Record<string, number> = { 'Shahid Hussain': 6, 'Asif Mehmood': 0, 'Faisal Iqbal': 1, 'Nadeem Abbas': 2, 'Karim Bakhsh': 3, 'Zubair Ahmed': 4 };
  const DAY_STAFF: Array<[string, HrDepartment, string]> = [
    ['Naveed Anjum', 'maintenance', 'On call'],
    ['Waqas Ali', 'maintenance', 'Plant room'],
    ['Bilal Khan', 'maintenance', 'On call'],
    ['Rukhsana Bibi', 'housekeeping', 'Lobbies'],
    ['Ghulam Rasool', 'housekeeping', 'Garden'],
    ['Imran Qureshi', 'office', 'Office'],
    ['Saba Javed', 'office', 'Office'],
  ];
  const tariqOnLeave = (date: string) => date >= '2026-10-26' && date <= '2026-10-28';
  const assign = (name: string, t: ShiftTemplate, date: string, post: string, createdAt: string) => {
    const { id } = nextHr(state, code, 'assignment');
    state.assignments.push({ id, siteId: site.siteId, employeeId: emp(name).id, templateId: t.id, date, post, state: 'planned', createdByName: IMRAN.byName, createdAt, history: [ev(IMRAN, createdAt, 'assigned')] });
    return id;
  };
  const plan = (weekStart: string, createdAt: string, securityDays: number) => {
    weekDays(weekStart).forEach((date, i) => {
      if (i < securityDays) {
        for (const key of ['morning', 'evening', 'night'] as const) {
          for (const [name, post] of ROTA[key]) {
            if (OFF[name] === i) {
              // The reliever takes the day off's place (unless he is off or on leave himself).
              if (i !== 5 && !tariqOnLeave(date)) assign('Tariq Javed', tpl('security', key), date, post, createdAt);
            } else assign(name, tpl('security', key), date, post, createdAt);
          }
        }
      }
      if (i < 6) for (const [name, dept, post] of DAY_STAFF) assign(name, tpl(dept, 'day'), date, post, createdAt);
    });
  };
  plan(LAST_WEEK, pkt('2026-10-16', '16:00'), 7);
  plan(THIS_WEEK, pkt('2026-10-23', '16:00'), 7);
  // Next week is a draft: security only Monday to Wednesday so far.
  plan(NEXT_WEEK, pkt('2026-10-25', '18:00'), 3);
  state.weeks.push(
    { siteId: site.siteId, weekStart: LAST_WEEK, state: 'published', publishedAt: pkt('2026-10-16', '17:30'), publishedBy: IMRAN.by, publishedByName: IMRAN.byName, changesSincePublish: 0 },
    { siteId: site.siteId, weekStart: THIS_WEEK, state: 'published', publishedAt: pkt('2026-10-23', '17:30'), publishedBy: IMRAN.by, publishedByName: IMRAN.byName, changesSincePublish: 0 },
    { siteId: site.siteId, weekStart: NEXT_WEEK, state: 'draft', changesSincePublish: 0 },
  );

  // Leave ----------------------------------------------------------------------------------------
  const leave = (name: string, type: LeaveType, from: string, to: string, reason: string, by: { by: string; byName: string }, at: string, decided?: { state: LeaveState; who: { by: string; byName: string }; at: string; note?: string }) => {
    const { id, ref } = nextHr(state, code, 'leave');
    state.leave.push({
      id,
      ref,
      employeeId: emp(name).id,
      type,
      from,
      to,
      reason,
      state: decided?.state ?? 'pending',
      requestedBy: by.by,
      requestedByName: by.byName,
      requestedAt: at,
      ...(decided ? { decidedBy: decided.who.by, decidedByName: decided.who.byName, decidedAt: decided.at, ...(decided.note ? { decisionNote: decided.note } : {}) } : {}),
      history: [ev(by, at, 'leave_requested'), ...(decided ? [ev(decided.who, decided.at, `leave_${decided.state}`, decided.note ? { note: decided.note } : {})] : [])],
    });
  };
  leave('Bilal Khan', 'sick', '2026-10-21', '2026-10-21', 'Fever; doctor advised rest for a day.', IMRAN, pkt('2026-10-21', '08:20'), { state: 'approved', who: IMRAN, at: pkt('2026-10-21', '08:45') });
  leave('Tariq Javed', 'annual', '2026-10-26', '2026-10-28', 'Family wedding in Sahiwal.', IMRAN, pkt('2026-10-19', '12:00'), { state: 'approved', who: IMRAN, at: pkt('2026-10-20', '10:15') });
  leave('Karim Bakhsh', 'casual', '2026-10-30', '2026-10-31', 'Has to accompany his mother to hospital.', SHAHID, pkt('2026-10-24', '09:30'));
  leave('Waqas Ali', 'annual', '2026-11-10', '2026-11-12', 'Visiting family in Multan.', IMRAN, pkt('2026-10-22', '15:00'), { state: 'approved', who: IMRAN, at: pkt('2026-10-22', '16:10') });
  // The building manager's own request: someone else must decide it.
  leave('Imran Qureshi', 'annual', '2026-11-16', '2026-11-17', 'Two days off after the AGM.', IMRAN, pkt('2026-10-25', '11:00'));

  // Attendance: last week, and the night shift that started yesterday --------------------------------
  const assignmentsOn = (date: string) => state.assignments.filter((a) => a.date === date && a.state === 'planned');
  const record = (a: StoredAssignment, s: 'present' | 'late' | 'absent', checkIn?: string, checkOut?: string, by = SHAHID) => {
    const at = checkIn ?? pkt(a.date, '23:30');
    state.attendance.push({ assignmentId: a.id, employeeId: a.employeeId, state: s, ...(checkIn ? { checkIn } : {}), ...(checkOut ? { checkOut } : {}), recordedBy: by.by, recordedByName: by.byName, recordedAt: at, corrected: false, history: [ev(by, at, s === 'absent' ? 'marked_absent' : 'checked_in'), ...(checkOut ? [ev(by, checkOut, 'checked_out')] : [])] });
  };
  const recorderOf = (a: StoredAssignment) => {
    const dept = state.templates.find((t) => t.id === a.templateId)!.department;
    return dept === 'security' ? SHAHID : dept === 'office' ? RABIA : { by: 'usr_anr_0005', byName: 'Naveed Anjum' };
  };
  const byName = (a: StoredAssignment) => state.employees.find((e) => e.id === a.employeeId)!.name;
  for (const date of [...weekDays(LAST_WEEK), '2026-10-25']) {
    for (const [i, a] of assignmentsOn(date).entries()) {
      const t = state.templates.find((x) => x.id === a.templateId)!;
      const w = shiftWindow(t, a.date);
      const minus = (iso: string, m: number) => new Date(Date.parse(iso) - m * 60_000).toISOString().replace('.000Z', 'Z');
      const name = byName(a);
      if (name === 'Bilal Khan' && date === '2026-10-21') continue; // on approved sick leave
      if (date === '2026-10-25' && t.key === 'night') {
        // Last night's shift is still running this morning: checked in, not yet out.
        record(a, 'present', pkt(date, i % 2 ? '22:58' : '22:55'));
        continue;
      }
      if (name === 'Zubair Ahmed' && date === '2026-10-22' && t.key === 'night') {
        record(a, 'absent');
        continue;
      }
      if (name === 'Nadeem Abbas' && date === '2026-10-21' && t.key === 'evening') {
        record(a, 'late', pkt(date, '15:25'), pkt(date, '23:02'));
        continue;
      }
      if (name === 'Zubair Ahmed' && date === '2026-10-24' && t.key === 'night') {
        record(a, 'present', pkt(date, '22:56'));
        continue;
      }
      if (name === 'Imran Qureshi' && date === '2026-10-23') {
        record(a, 'late', pkt(date, '09:40'), pkt(date, '17:20'), RABIA);
        continue;
      }
      if (name === 'Asif Mehmood' && date === '2026-10-20' && t.key === 'morning') {
        record(a, 'late', pkt(date, '07:35'), pkt(date, '15:04'));
        continue;
      }
      record(a, 'present', minus(w.start, 4 + (i % 6)), new Date(Date.parse(w.end) + (2 + (i % 4)) * 60_000).toISOString().replace('.000Z', 'Z'), recorderOf(a));
    }
  }

  // Corrections ------------------------------------------------------------------------------------
  const correction = (name: string, date: string, key: 'morning' | 'night' | 'day', after: CorrectionValues, reason: string, by: { by: string; byName: string }, at: string, decided?: { who: { by: string; byName: string }; at: string; note?: string }) => {
    const e = emp(name);
    const a = state.assignments.find((x) => x.employeeId === e.id && x.date === date && state.templates.find((t) => t.id === x.templateId)!.key === key)!;
    const r = state.attendance.find((x) => x.assignmentId === a.id)!;
    const { id, ref } = nextHr(state, code, 'correction');
    const before: CorrectionValues = { state: r.state, ...(r.checkIn ? { checkIn: r.checkIn } : {}), ...(r.checkOut ? { checkOut: r.checkOut } : {}) };
    state.corrections.push({ id, ref, assignmentId: a.id, employeeId: e.id, before, after, reason, requestedBy: by.by, requestedByName: by.byName, requestedAt: at, state: decided ? 'approved' : 'pending', ...(decided ? { decidedBy: decided.who.by, decidedByName: decided.who.byName, decidedAt: decided.at, ...(decided.note ? { decisionNote: decided.note } : {}) } : {}), history: [ev(by, at, 'correction_requested', { note: reason }), ...(decided ? [ev(decided.who, decided.at, 'correction_approved')] : [])] });
    if (decided) {
      Object.assign(r, { state: after.state, checkIn: after.checkIn, checkOut: after.checkOut ?? r.checkOut, corrected: true });
      r.history.push(ev(decided.who, decided.at, 'corrected', { values: { ref } }));
    }
  };
  correction('Asif Mehmood', '2026-10-20', 'morning', { state: 'present', checkIn: pkt('2026-10-20', '07:02'), checkOut: pkt('2026-10-20', '15:04') }, 'Entered late from the queue at the gate; the gate log shows 07:02.', SHAHID, pkt('2026-10-20', '16:10'), { who: IMRAN, at: pkt('2026-10-21', '09:30') });
  correction('Zubair Ahmed', '2026-10-24', 'night', { state: 'present', checkIn: pkt('2026-10-24', '22:56'), checkOut: pkt('2026-10-25', '07:04') }, 'Check-out was missed at the shift change; Karim handed over at 07:04.', SHAHID, pkt('2026-10-25', '08:10'));
  correction('Imran Qureshi', '2026-10-23', 'day', { state: 'present', checkIn: pkt('2026-10-23', '08:30'), checkOut: pkt('2026-10-23', '17:20') }, 'I was at the committee meeting from 08:30 and checked in at the office later.', IMRAN, pkt('2026-10-24', '10:00'));

  // Documents --------------------------------------------------------------------------------------
  const doc = (name: string, kind: HrDocumentKind, issuedOn: string, expiresOn?: string, number?: string) => {
    const e = emp(name);
    const { id } = nextHr(state, code, 'document');
    const at = pkt(issuedOn > e.startDate ? issuedOn : e.startDate, '12:00');
    const slug = e.name.toLowerCase().replace(/\s+/g, '-');
    state.documents.push({ id, employeeId: e.id, kind, fileName: `${slug}-${kind.replace(/_/g, '-')}.pdf`, fileType: 'application/pdf', sizeBytes: 180_000 + state.documents.length * 7_313, ...(number ? { number } : {}), issuedOn, ...(expiresOn ? { expiresOn } : {}), version: 1, uploadedByName: IMRAN.byName, uploadedAt: at, history: [ev(IMRAN, at, 'document_added')] });
  };
  for (const e of state.employees) {
    const p = PEOPLE.find((x) => x.name === e.name)!;
    doc(e.name, 'cnic', '2021-06-01', '2031-06-01', p.cnic);
    if (e.name !== 'Bilal Khan') doc(e.name, 'appointment_letter', e.startDate);
    if (e.department === 'security') {
      if (e.name === 'Faisal Iqbal') doc(e.name, 'police_verification', '2025-11-10', '2026-11-10', 'PV-LHR-2025-11873');
      else if (e.name !== 'Karim Bakhsh') doc(e.name, 'police_verification', '2026-02-01', '2027-02-01', `PV-LHR-2026-${pad(1000 + state.documents.length, 5)}`);
      doc(e.name, 'security_training', '2025-10-01', e.name === 'Asif Mehmood' ? '2026-09-30' : '2027-10-01');
    }
  }

  // Advances and loans ---------------------------------------------------------------------------
  const advance = (name: string, kind: AdvanceKind, amount: string, instalments: number, firstMonth: string, reason: string, at: string, decided?: { state: 'approved' | 'rejected'; at: string; note?: string }) => {
    const { id, ref } = nextHr(state, code, 'advance');
    state.advances.push({
      id,
      ref,
      employeeId: emp(name).id,
      kind,
      amount: { amount, currency: 'PKR' },
      reason,
      instalments,
      firstMonth,
      state: decided?.state ?? 'submitted',
      requestedBy: IMRAN.by,
      requestedByName: IMRAN.byName,
      requestedAt: at,
      ...(decided ? { decidedBy: AYESHA.by, decidedByName: AYESHA.byName, decidedAt: decided.at, ...(decided.note ? { decisionNote: decided.note } : {}) } : {}),
      evidence: [{ name: `${kind}-request-${name.toLowerCase().replace(/\s+/g, '-')}.pdf`, type: 'application/pdf', sizeBytes: 96_400 }],
      repayments: [],
      history: [ev(IMRAN, at, 'advance_requested'), ...(decided ? [ev(AYESHA, decided.at, `advance_${decided.state}`, decided.note ? { note: decided.note } : {})] : [])],
    });
  };
  advance('Nadeem Abbas', 'advance', '8000.00', 1, '2026-11', 'Advance against November for school fees.', pkt('2026-10-08', '11:30'), { state: 'rejected', at: pkt('2026-10-10', '10:00'), note: 'Ask again after the October committee meeting.' });
  advance('Ghulam Rasool', 'advance', '15000.00', 1, '2026-11', 'Roof repair at home after the rain.', pkt('2026-10-21', '12:15'), { state: 'approved', at: pkt('2026-10-22', '17:40') });
  advance('Asif Mehmood', 'loan', '60000.00', 6, '2026-12', 'Motorcycle repair so he can reach night shifts on time.', pkt('2026-10-24', '13:00'));

  return state;
}
