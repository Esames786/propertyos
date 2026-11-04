import type { AdvanceInput, AdvancesList, AssignInput, Candidate, CorrectionValues, DocumentInput, DocumentsOverview, Employee360, EmployeeInput, EmployeeOptions, EmployeesList, EmploymentView, HrDashboard, HrDepartment, LeaveAndCorrections, LeaveInput, OnDutyBoard, Permission, RosterWeek, StaffAdvanceView, AttendanceDay, AttendanceState } from '@repo/contracts';
import { ADVANCE_KINDS, EMPLOYMENT_TYPES, HR_DEPARTMENTS, HR_DOCUMENT_KINDS, HR_ROLES, LEAVE_TYPES, ROLE_DEPARTMENT } from '@repo/contracts';
import { authorize, notFound, requires, type Handler, type HandlerContext } from '../handler-types';
import { invalid } from '../operations/common';
import { opsSite, siteRecord } from '../operations/site';
import { AMOUNT, money, paisa } from '../society/finance/model';
import { problem } from '../society/handlers';
import { addDays, assignBlock, DATE, lateBy, ms, normaliseCnic, normalisePhone, pendingLeaveOn, restHours, shiftWindow, weekDays, weekStartOf, type DutyFacts } from './rules';
import { allocatedOn, assignmentVisible, homeSites, scopeOf } from './scope';
import { hrState, nextHr, type StoredAdvance, type StoredAssignment, type StoredEmployee } from './state';
import {
  advanceView,
  assignmentView,
  attendanceRow,
  attendanceState,
  correctionView,
  currentDocuments,
  documentsAttention,
  documentStatuses,
  employee360,
  employeeOf,
  employeeRow,
  employmentView,
  governs,
  holds,
  hrNow,
  leaveView,
  live,
  onDutyBoard,
  onDutyShifts,
  recordOf,
  recordsFor,
  rosterWeek,
  sees,
  seesAllStaffing,
  staffingShown,
  staffingSites,
  templateOf,
  viewsAdvances,
  visibleEmployees,
  visibleLive,
  weekStateOf,
  windowOf,
  type Hr,
} from './views';

/**
 * Gate S.2a society HR endpoints (HR-001…011). Every endpoint needs the office app, a society (other
 * kinds of organisation get "not found": developer HR is Gate E), the `hr` add-on licensed and in
 * force, and its permission; the roster and attendance also need the `hr.shifts` feature. Then the
 * server checks each rule itself: maker ≠ checker by principal, nobody decides their own record,
 * supervisors record only their own department, no double booking (any site), approved leave
 * blocks a duty and pending leave warns, and nothing financial is ever shown as paid on an approval.
 * Reads are `history_read` (a suspended organisation keeps its records); changes are `operational`.
 *
 * Gate S.2a closure (Issue #12): every list, count, summary, detail and action is limited to the
 * reader's HR scope (`scope.ts`) before anything is returned, and an id outside it is "not found".
 * Linking cashbook vouchers to staff advances is disabled (no state change can come from a voucher).
 *
 * Gate S.2a closure (Issue #14):
 * - **P0.** Seeing an employee needs one of their sites. Changing their employee-wide record needs
 *   all of them (`wholeEmployee`): details, role, resident-facing profile, documents, leave, advances
 *   and employment. The check runs before anything changes.
 * - **P1.** Staffing screens (roster, On duty now, attendance, cover candidates) show a supervisor
 *   only the departments they record for, at the sites they work at (`staffingShown`).
 */

const HR = 'hr' as const;
const SHIFTS = 'hr.shifts' as const;

function hrOf(ctx: HandlerContext, opts: { shifts?: boolean } = {}): Hr {
  if (ctx.persona?.app !== 'backoffice') problem(ctx, 403, 'forbidden', 'errors:api.forbidden');
  const ops = opsSite(ctx);
  if (!ops.society) notFound(ctx);
  const state = hrState(ctx, ops);
  const scope = scopeOf(ctx, state);
  if (!scope.sites.length) {
    // No HR site in scope: the shared rule's own refusal for the organisation's site (a licence or
    // lifecycle reason as usual; out of scope is "not found", never a hint that records exist).
    authorize(ctx, HR, siteRecord(ops));
    notFound(ctx);
  }
  if (opts.shifts && !ctx.access?.features.includes(SHIFTS)) problem(ctx, 403, 'feature_not_licensed', 'errors:access.feature_not_licensed');
  // The site a screen works on: `?site=` when it is in scope (another site's id is "not found"), else the first.
  const wanted = String(ctx.req.query?.site ?? '').trim();
  const site = wanted ? scope.sites.find((s) => s.siteId === wanted) : scope.sites[0];
  if (!site) notFound(ctx);
  return { site, scope, state, today: ctx.at, now: hrNow(ctx), me: { principalId: ctx.persona!.principalId, name: ctx.persona!.displayName }, ctx };
}

const body = <T>(ctx: HandlerContext) => (ctx.req.body ?? {}) as Partial<Record<keyof T, unknown>>;
const q = (ctx: HandlerContext, key: string) => String(ctx.req.query?.[key] ?? '').trim();
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const save = (h: Hr) => h.ctx.demo.save();
const ev = (h: Hr, action: string, extra: { note?: string; values?: Record<string, string> } = {}) => ({ at: h.now, by: h.me.principalId, byName: h.me.name, action, ...extra });

function text(ctx: HandlerContext, field: string, raw: unknown, min: number, max: number): string {
  const v = str(raw);
  if (v.length < min) invalid(ctx, field, min <= 1 ? 'forms:errors.required' : 'hr:errors.minLength', { min: String(min) });
  if (v.length > max) invalid(ctx, field, 'hr:errors.maxLength', { max: String(max) });
  return v;
}

function date(ctx: HandlerContext, field: string, raw: unknown): string {
  const v = str(raw);
  if (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) invalid(ctx, field, 'hr:errors.date');
  return v;
}

/** A refusal with its reason in plain words (and the names or values it is about). */
function refuse(ctx: HandlerContext, status: number, code: string, key: string, values?: Record<string, string>): never {
  if (values) problem(ctx, status, code, `hr:problems.${key}`, { _: [{ code: `hr:problems.${key}Detail`, params: values }] });
  problem(ctx, status, code, `hr:problems.${key}`);
}

/** An employee in the reader's scope; any other id, issued or not, is "not found". */
function findEmployee(h: Hr, id: string | undefined): StoredEmployee {
  const e = id ? employeeOf(h.state, id) : undefined;
  if (!e || !sees(h, e)) notFound(h.ctx);
  return e;
}

/**
 * Gate S.2a closure (Issue #14, P0): authority over the employee-wide record. Seeing an employee needs
 * one of their sites; changing what all of their sites share needs every one of them (`governs`).
 * That covers their details, role, resident-facing profile and consent, documents, leave, advances and
 * employment.
 *
 * The check runs before any other check or change, so a refused request changes nothing. The refusal
 * says only that the person also works elsewhere; it never names the other site.
 */
function wholeEmployee(h: Hr, e: StoredEmployee): StoredEmployee {
  if (!governs(h, e)) refuse(h.ctx, 403, 'other_sites', 'otherSites');
  return e;
}

/**
 * Gate S.2a closure (Issue #14, P1): the working site of a staffing screen (roster, On duty now,
 * attendance). HR viewers and planners keep `hrOf`'s choice. A supervisor works only on sites where
 * they record for a department: the first of them by default. Any other `?site=` is "not found", like
 * a site that does not exist.
 */
function staffingOf(ctx: HandlerContext): Hr {
  const h = hrOf(ctx, { shifts: true });
  if (seesAllStaffing(h)) return h;
  const sites = staffingSites(h);
  const wanted = q(ctx, 'site');
  const site = wanted ? sites.find((s) => s.siteId === wanted) : (sites[0] ?? h.site);
  if (!site) notFound(ctx);
  return { ...h, site };
}

/** An employee named in a request body, in scope; otherwise the same answer as an unknown id. */
function employeeIn(h: Hr, raw: unknown): StoredEmployee {
  const e = employeeOf(h.state, str(raw));
  if (!e || !sees(h, e)) invalid(h.ctx, 'employeeId', 'forms:errors.required');
  return e;
}

/** A duty at a site in the reader's scope. */
function findAssignment(h: Hr): StoredAssignment {
  const a = h.state.assignments.find((x) => x.id === h.ctx.params.id && assignmentVisible(h.scope, x));
  if (!a) notFound(h.ctx);
  return a;
}

/** A site's reference code (ANR-LV-0006); the working site's when none is known. */
const codeOf = (h: Hr, siteId: string | undefined) => h.state.sites.find((s) => s.siteId === siteId)?.code ?? h.site.code;

/** A correction belongs to its duty's site. */
function correctionVisible(h: Hr, assignmentId: string): boolean {
  const a = h.state.assignments.find((x) => x.id === assignmentId);
  return !!a && assignmentVisible(h.scope, a);
}

/** Facts the assignment rule needs about one employee (their other duties anywhere, leave, employment). */
function factsOf(h: Hr, e: StoredEmployee): DutyFacts {
  return {
    duties: live(h.state)
      .filter((a) => a.employeeId === e.id)
      .map((a) => ({ id: a.id, ...windowOf(h.state, a) })),
    leave: h.state.leave.filter((l) => l.employeeId === e.id && (l.state === 'pending' || l.state === 'approved')).map((l) => ({ from: l.from, to: l.to, state: l.state as 'pending' | 'approved' })),
    employment: { status: e.status, startDate: e.startDate, ...(e.endDate ? { endDate: e.endDate } : {}) },
    department: e.department,
    sites: e.sites,
  };
}

const BLOCK_KEY = { overlap: 'overlap', on_leave: 'onLeave', not_at_site: 'notAtSite', not_employed: 'notEmployed', other_department: 'otherDepartment' } as const;

function markChanged(h: Hr, siteId: string, date: string) {
  const week = weekStateOf(h.state, siteId, weekStartOf(date));
  if (week?.state === 'published') week.changesSincePublish += 1;
}

// ---------------------------------------------------------------------------------------------
// Dashboard and employees (HR-001…004)
// ---------------------------------------------------------------------------------------------

/**
 * The overview, counted only over what the reader may see: their employees (staff, documents, leave,
 * advances) and the duties and corrections of their sites. Shifts running now are the working site's.
 */
function dashboard(h: Hr): HrDashboard {
  const { state, today } = h;
  const shifts = h.ctx.access?.features.includes(SHIFTS) ?? false;
  const { current } = shifts ? onDutyShifts(h, { publishedOnly: false }) : { current: [] };
  const mine = visibleEmployees(h);
  const active = mine.filter((e) => employmentView(e, today) === 'active');
  const todays = visibleLive(h).filter((a) => a.siteId === h.site.siteId && a.date === today);
  const week = shifts ? rosterWeek(h, weekStartOf(today)) : null;
  const shortAhead = week ? week.warnings.filter((w) => w.kind === 'short_staffed' && ms(w.end) > ms(h.now)) : [];
  const attention: HrDashboard['attention'] = [];
  const weekHref = (d: string) => `/backoffice/hr/roster?week=${weekStartOf(d)}`;
  for (const w of shortAhead.slice(0, 4)) attention.push({ kind: 'short_staffed', values: { date: w.date, shift: w.shiftKey, department: w.department, available: String(w.available), required: String(w.required) }, href: weekHref(w.date) });
  for (const a of todays.filter((x) => attendanceState(state, x) === 'absent')) attention.push({ kind: 'absent', values: { name: employeeOf(state, a.employeeId)!.name, shift: templateOf(state, a.templateId).key }, href: `/backoffice/hr/attendance?date=${today}` });
  if (week) for (const w of week.warnings.filter((x) => x.kind === 'leave_conflict' && ms(x.end) > ms(h.now)).slice(0, 3)) attention.push({ kind: 'leave_conflict', values: { name: w.employeeName!, date: w.date, shift: w.shiftKey, department: w.department }, href: weekHref(w.date) });
  const next = addDays(weekStartOf(today), 7);
  if (shifts && weekStateOf(state, h.site.siteId, next)?.state !== 'published') attention.push({ kind: 'roster_draft', values: { week: next }, href: weekHref(next) });
  for (const e of active) for (const d of documentStatuses(state, e, today).filter((x) => x.required && x.status !== 'valid')) attention.push({ kind: 'document', values: { name: e.name, document: d.kind, status: d.status }, href: `/backoffice/hr/employee-documents?status=attention` });
  const corrections = state.corrections.filter((c) => c.state === 'pending' && correctionVisible(h, c.assignmentId)).length;
  const leave = state.leave.filter((l) => l.state === 'pending' && mine.some((e) => e.id === l.employeeId)).length;
  if (corrections) attention.push({ kind: 'correction', values: { count: String(corrections) }, href: '/backoffice/hr/leave-attendance-adjustments?tab=corrections' });
  if (leave) attention.push({ kind: 'leave', values: { count: String(leave) }, href: '/backoffice/hr/leave-attendance-adjustments' });
  return {
    siteName: h.site.name,
    today,
    at: h.now,
    kpis: {
      activeStaff: active.length,
      onDutyNow: current.flatMap((s) => s.staff).filter((s) => s.state === 'present' || s.state === 'late').length,
      absentToday: todays.filter((a) => attendanceState(state, a) === 'absent').length,
      shortShifts: shortAhead.length,
      leavePending: leave,
      correctionsPending: corrections,
      documentsAttention: active.reduce((n, e) => n + documentsAttention(state, e, today), 0),
      ...(viewsAdvances(h) ? { advancesAwaiting: state.advances.filter((a) => a.state === 'submitted' && mine.some((e) => e.id === a.employeeId)).length } : {}),
    },
    shifts: current,
    attention,
    rosterState: week?.state ?? 'draft',
    canSee: { roster: shifts, documents: true, advances: viewsAdvances(h) },
  };
}

const VIEWS: readonly EmploymentView[] = ['active', 'upcoming', 'suspended', 'ended'];

function employeesList(h: Hr): EmployeesList {
  const status = q(h.ctx, 'status');
  const department = q(h.ctx, 'department');
  const search = q(h.ctx, 'q').toLowerCase();
  // Counts and department totals come from the reader's employees only (no hint of anyone else).
  const all = visibleEmployees(h).map((e) => employeeRow(h, e));
  const counts = Object.fromEntries(VIEWS.map((v) => [v, all.filter((r) => r.status === v).length])) as Record<EmploymentView, number>;
  const departments = Object.fromEntries(HR_DEPARTMENTS.map((d) => [d, all.filter((r) => r.department === d && r.status !== 'ended').length])) as Record<HrDepartment, number>;
  const shown = all
    .filter((r) => (status === 'all' ? true : (VIEWS as readonly string[]).includes(status) ? r.status === status : r.status !== 'ended'))
    .filter((r) => !department || r.department === department)
    .filter((r) => !search || r.name.toLowerCase().includes(search) || r.code.toLowerCase().includes(search) || r.role.replace(/_/g, ' ').includes(search))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { items: shown, counts, departments, canCreate: holds(h, 'hr.manage') };
}

/** Legal entities and sites a new employee may be recorded for: the reader's own HR sites. */
function options(h: Hr): EmployeeOptions {
  const entities = [...new Map(h.scope.sites.map((s) => [s.legalEntityId, { id: s.legalEntityId, name: s.legalEntityName }])).values()];
  return { legalEntities: entities, sites: h.scope.sites.map((s) => ({ id: s.siteId, name: s.name, legalEntityId: s.legalEntityId })), roles: [...HR_ROLES], types: [...EMPLOYMENT_TYPES], today: h.today };
}

function hire(h: Hr): Employee360 {
  const { ctx, state } = h;
  const b = body<EmployeeInput>(ctx);
  const name = text(ctx, 'name', b.name, 3, 80);
  if (!/^[\p{L}][\p{L} .'-]*$/u.test(name)) invalid(ctx, 'name', 'hr:errors.name');
  const cnic = normaliseCnic(str(b.cnic));
  if (!cnic) invalid(ctx, 'cnic', 'hr:errors.cnic');
  const phone = normalisePhone(str(b.phone));
  if (!phone) invalid(ctx, 'phone', 'hr:errors.phone');
  const address = text(ctx, 'address', b.address, 5, 200);
  const emergency = str(b.emergencyContact) ? normalisePhone(str(b.emergencyContact)) : undefined;
  if (emergency === null) invalid(ctx, 'emergencyContact', 'hr:errors.phone');
  // The employing entity must own one of the reader's sites, and the site must belong to it.
  if (!h.scope.sites.some((s) => s.legalEntityId === str(b.legalEntityId))) invalid(ctx, 'legalEntityId', 'hr:errors.legalEntity');
  const at = h.scope.sites.find((s) => s.siteId === str(b.siteId) && s.legalEntityId === str(b.legalEntityId));
  if (!at) invalid(ctx, 'siteId', 'hr:errors.site');
  const role = str(b.role) as (typeof HR_ROLES)[number];
  if (!HR_ROLES.includes(role)) invalid(ctx, 'role', 'hr:errors.role');
  const type = str(b.employmentType) as (typeof EMPLOYMENT_TYPES)[number];
  if (!EMPLOYMENT_TYPES.includes(type)) invalid(ctx, 'employmentType', 'hr:errors.type');
  const start = date(ctx, 'startDate', b.startDate);
  if (start < '2000-01-01' || start > addDays(h.today, 90)) invalid(ctx, 'startDate', 'hr:errors.startDate');
  const dob = str(b.dateOfBirth) ? date(ctx, 'dateOfBirth', b.dateOfBirth) : undefined;
  if (dob && dob > `${Number(start.slice(0, 4)) - 18}${start.slice(4)}`) invalid(ctx, 'dateOfBirth', 'hr:errors.dob');
  // One person, one record across the organisation: the same CNIC is refused, including someone who
  // has left (rehire instead). The record is named only when the reader may see it.
  const same = state.employees.find((e) => e.personal.cnic === cnic);
  if (same && sees(h, same)) problem(ctx, 409, 'duplicate_employee', 'hr:problems.duplicate', { cnic: [{ code: 'hr:errors.duplicate', params: { code: same.code, name: same.name, id: same.id } }] });
  if (same) problem(ctx, 409, 'duplicate_employee', 'hr:problems.duplicate', { cnic: [{ code: 'hr:errors.duplicateElsewhere' }] });
  const { id, ref } = nextHr(state, at.code, 'employee');
  const e: StoredEmployee = {
    id,
    code: ref,
    name,
    role,
    department: ROLE_DEPARTMENT[role],
    employmentType: type,
    legalEntityId: at.legalEntityId,
    status: 'active',
    startDate: start,
    periods: [{ from: start, type }],
    sites: [{ siteId: at.siteId, from: start }],
    personal: { cnic, phone, address, ...(dob ? { dateOfBirth: dob } : {}), ...(emergency ? { emergencyContact: emergency } : {}) },
    supervises: [],
    profile: { consent: false, showName: false, showPhoto: false },
    history: [ev(h, 'hired', { values: { role } })],
  };
  state.employees.push(e);
  save(h);
  return employee360(h, e);
}

function edit(h: Hr): Employee360 {
  const { ctx } = h;
  const e = wholeEmployee(h, findEmployee(h, ctx.params.id));
  if (e.status === 'ended') refuse(ctx, 409, 'employment_ended', 'employmentEnded');
  const b = body<EmployeeInput>(ctx);
  // Every field is checked before anything changes (Issue #14): a refused request leaves the record
  // exactly as it was, even when its other fields were valid.
  let phone: string | undefined;
  if (b.phone !== undefined) {
    const v = normalisePhone(str(b.phone));
    if (!v) invalid(ctx, 'phone', 'hr:errors.phone');
    phone = v;
  }
  const address = b.address !== undefined ? text(ctx, 'address', b.address, 5, 200) : undefined;
  let emergency: string | undefined;
  if (b.emergencyContact !== undefined) {
    const v = str(b.emergencyContact) ? normalisePhone(str(b.emergencyContact)) : '';
    if (v === null) invalid(ctx, 'emergencyContact', 'hr:errors.phone');
    emergency = v;
  }
  let role: (typeof HR_ROLES)[number] | undefined;
  if (b.role !== undefined && b.role !== e.role) {
    role = str(b.role) as (typeof HR_ROLES)[number];
    if (!HR_ROLES.includes(role)) invalid(ctx, 'role', 'hr:errors.role');
    // A move to another department first needs its duties there reassigned.
    if (ROLE_DEPARTMENT[role] !== e.department && live(h.state).some((a) => a.employeeId === e.id && ms(windowOf(h.state, a).end) > ms(h.now))) refuse(ctx, 409, 'reassign_first', 'reassignFirst');
  }
  const changed: string[] = [];
  if (phone !== undefined && phone !== e.personal.phone) {
    e.personal.phone = phone;
    changed.push('phone');
  }
  if (address !== undefined && address !== e.personal.address) {
    e.personal.address = address;
    changed.push('address');
  }
  if (emergency !== undefined) {
    if (emergency) e.personal.emergencyContact = emergency;
    else delete e.personal.emergencyContact;
    changed.push('emergencyContact');
  }
  if (role) {
    e.history.push(ev(h, 'role_changed', { values: { from: e.role, to: role } }));
    e.role = role;
    e.department = ROLE_DEPARTMENT[role];
  }
  if (changed.length) e.history.push(ev(h, 'updated', { values: { fields: changed.join(', ') } }));
  save(h);
  return employee360(h, e);
}

/** Effective-dated status: suspend from today, end from a date (future duties cancelled), reinstate or rehire. */
function changeStatus(h: Hr): Employee360 {
  const { ctx, state } = h;
  // Employment is organisation-wide (it cancels duties at every site the person works at), so it is
  // changed only by someone whose scope covers all of the employee's sites (Issue #12; since Issue
  // #14 the same shared rule as every other employee-wide change, checked first).
  const e = wholeEmployee(h, findEmployee(h, ctx.params.id));
  const b = body<{ status: string; on: string; reason: string }>(ctx);
  const to = str(b.status);
  if (!['active', 'suspended', 'ended'].includes(to)) invalid(ctx, 'status', 'hr:errors.status');
  const on = date(ctx, 'on', b.on);
  const reason = text(ctx, 'reason', b.reason, 5, 300);
  const cancelFrom = (from: string, why: string) => {
    for (const a of live(state).filter((x) => x.employeeId === e.id && x.date >= from && !recordOf(state, x.id))) {
      a.state = 'cancelled';
      a.cancelled = { at: h.now, byName: h.me.name, reason: why };
      a.history.push(ev(h, 'unassigned', { note: why }));
      markChanged(h, a.siteId, a.date);
    }
  };
  if (to === 'ended') {
    if (e.status === 'ended') refuse(ctx, 409, 'state_changed', 'stateChanged');
    if (on < e.startDate) invalid(ctx, 'on', 'hr:errors.endDate');
    e.endDate = on;
    if (on <= h.today) e.status = 'ended';
    const period = e.periods[e.periods.length - 1]!;
    period.to = on;
    period.endReason = reason;
    for (const s of e.sites.filter((x) => !x.to || x.to > on)) s.to = on;
    cancelFrom(addDays(on, 1), reason);
    e.history.push(ev(h, 'ended', { note: reason, values: { on } }));
  } else if (to === 'suspended') {
    if (e.status !== 'active') refuse(ctx, 409, 'state_changed', 'stateChanged');
    if (on !== h.today) invalid(ctx, 'on', 'hr:errors.suspendToday');
    e.status = 'suspended';
    cancelFrom(on, reason);
    e.history.push(ev(h, 'suspended', { note: reason }));
  } else if (e.status === 'suspended') {
    e.status = 'active';
    e.history.push(ev(h, 'reinstated', { note: reason }));
  } else if (e.status === 'ended') {
    // Rehire: a new employment period from a date after the last one ended.
    if (on <= (e.endDate ?? e.startDate)) invalid(ctx, 'on', 'hr:errors.rehireDate');
    e.status = 'active';
    delete e.endDate;
    e.periods.push({ from: on, type: e.employmentType });
    // Back at the site they last worked at (in the reader's scope, as checked above).
    e.sites.push({ siteId: homeSites(e, h.today)[0] ?? h.site.siteId, from: on });
    e.history.push(ev(h, 'rehired', { note: reason, values: { on } }));
  } else refuse(ctx, 409, 'state_changed', 'stateChanged');
  save(h);
  return employee360(h, e);
}

function profile(h: Hr): Employee360 {
  const { ctx } = h;
  // Residents of every site the person works at see this profile, so consent is recorded only by
  // someone responsible for all of them (Issue #14).
  const e = wholeEmployee(h, findEmployee(h, ctx.params.id));
  const b = body<{ consent: boolean; showName: boolean; showPhoto: boolean }>(ctx);
  const consent = b.consent === true;
  const was = e.profile.consent;
  e.profile = consent ? { consent: true, consentAt: was ? e.profile.consentAt! : h.now, recordedByName: was ? e.profile.recordedByName! : h.me.name, showName: b.showName === true, showPhoto: b.showPhoto === true } : { consent: false, showName: false, showPhoto: false };
  e.history.push(ev(h, consent ? (was ? 'profile_changed' : 'consent_given') : 'consent_withdrawn'));
  save(h);
  return employee360(h, e);
}

// ---------------------------------------------------------------------------------------------
// Roster (HR-010) and on duty now (HR-011)
// ---------------------------------------------------------------------------------------------

function weekParam(h: Hr): string {
  const raw = q(h.ctx, 'week');
  if (raw && (!DATE.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`)))) invalid(h.ctx, 'week', 'hr:errors.date');
  // `?site=` was resolved in hrOf: a site outside the reader's scope is already "not found".
  return weekStartOf(raw || h.today);
}

/** Shift times of a site in the reader's scope (a template of another site is unknown). */
function templateIn(h: Hr, raw: unknown) {
  const t = h.state.templates.find((x) => x.id === str(raw) && h.scope.has(x.siteId));
  if (!t) invalid(h.ctx, 'templateId', 'hr:errors.shift');
  return t;
}

function assign(h: Hr) {
  const { ctx, state } = h;
  const b = body<AssignInput>(ctx);
  const t = templateIn(h, b.templateId);
  const site = h.scope.sites.find((s) => s.siteId === t.siteId)!;
  const on = date(ctx, 'date', b.date);
  const e = employeeIn(h, b.employeeId);
  const post = str(b.post);
  if (post && !t.posts.includes(post)) invalid(ctx, 'post', 'hr:errors.post');
  const w = shiftWindow(t, on);
  let covered: StoredAssignment | undefined;
  if (b.coverFor) {
    if (!holds(h, 'shifts.manage')) {
      // Owner decision O3: a supervisor may bring in cover within their own department and site, for a
      // shift of today or last night's that is still running; planning is the manager's.
      if (!(recordsFor(h, t.department, t.siteId) && on >= addDays(h.today, -1) && on <= h.today)) problem(ctx, 403, 'permission_missing', 'errors:access.permission_missing');
      // Issue #14 (P1): the cover comes from the supervisor's own staffing view, so anyone else gets the
      // answer of an unknown id, not a refusal that names them. Both are checked before anything about
      // the covered duty is read, so another department's attendance is never revealed either.
      if (!coverable(e, t, on)) invalid(ctx, 'employeeId', 'forms:errors.required');
    }
    covered = live(state).find((x) => x.id === str(b.coverFor) && x.templateId === t.id && x.date === on);
    if (!covered) invalid(ctx, 'coverFor', 'hr:errors.coverNotFound');
    const s = attendanceState(state, covered);
    if (s !== 'absent' && s !== 'on_leave') refuse(ctx, 409, 'cover_not_needed', 'coverNotNeeded');
    if (live(state).some((x) => x.coverFor === covered!.id)) refuse(ctx, 409, 'already_covered', 'alreadyCovered');
  } else if (!holds(h, 'shifts.manage')) problem(ctx, 403, 'permission_missing', 'errors:access.permission_missing');
  if (ms(w.end) <= ms(h.now)) refuse(ctx, 409, 'duty_ended', 'dutyEnded');
  // Double booking is checked against the employee's duties at every site (the one HR state); the
  // refusal names only the employee, never another site's duty.
  const block = assignBlock(factsOf(h, e), { siteId: t.siteId, date: on, department: t.department, ...w });
  if (block) refuse(ctx, 409, block, BLOCK_KEY[block], { name: e.name });
  if (pendingLeaveOn(factsOf(h, e), on) && b.acknowledgeLeave !== true) refuse(ctx, 409, 'leave_pending', 'leavePending', { name: e.name });
  const { id } = nextHr(state, site.code, 'assignment');
  const a: StoredAssignment = { id, siteId: t.siteId, employeeId: e.id, templateId: t.id, date: on, ...(post ? { post } : covered?.post ? { post: covered.post } : {}), ...(covered ? { coverFor: covered.id } : {}), state: 'planned', createdByName: h.me.name, createdAt: h.now, history: [ev(h, covered ? 'covered' : 'assigned', covered ? { values: { for: employeeOf(state, covered.employeeId)!.name } } : {})] };
  state.assignments.push(a);
  if (covered) covered.history.push(ev(h, 'cover_assigned', { values: { by: e.name } }));
  markChanged(h, t.siteId, on);
  save(h);
  return assignmentView(state, a, h.now);
}

function unassign(h: Hr) {
  const { ctx, state } = h;
  const a = findAssignment(h);
  if (a.state !== 'planned') refuse(ctx, 409, 'state_changed', 'stateChanged');
  if (recordOf(state, a.id) || ms(windowOf(state, a).start) <= ms(h.now)) refuse(ctx, 409, 'duty_started', 'dutyStarted');
  const reason = text(ctx, 'reason', body<{ reason: string }>(ctx).reason, 5, 300);
  a.state = 'cancelled';
  a.cancelled = { at: h.now, byName: h.me.name, reason };
  a.history.push(ev(h, 'unassigned', { note: reason }));
  markChanged(h, a.siteId, a.date);
  save(h);
  return assignmentView(state, a, h.now);
}

/** Two people exchange duties: both must be free for the other's (no overlap, leave or department clash). */
function swap(h: Hr) {
  const { ctx, state } = h;
  const a = findAssignment(h);
  // Swaps stay within one site (both duties visible to the reader).
  const other = live(state).find((x) => x.id === str(body<{ withAssignmentId: string }>(ctx).withAssignmentId) && x.siteId === a.siteId);
  if (!other) invalid(ctx, 'withAssignmentId', 'hr:errors.swapWith');
  if (a.state !== 'planned') refuse(ctx, 409, 'state_changed', 'stateChanged');
  if (a.employeeId === other.employeeId) invalid(ctx, 'withAssignmentId', 'hr:errors.swapSame');
  for (const x of [a, other]) if (recordOf(state, x.id) || ms(windowOf(state, x).start) <= ms(h.now)) refuse(ctx, 409, 'duty_started', 'dutyStarted');
  const ea = employeeOf(state, a.employeeId)!;
  const eb = employeeOf(state, other.employeeId)!;
  for (const [e, target] of [
    [ea, other],
    [eb, a],
  ] as const) {
    const t = templateOf(state, target.templateId);
    const block = assignBlock(factsOf(h, e), { siteId: target.siteId, date: target.date, department: t.department, ignore: [a.id, other.id], ...windowOf(state, target) });
    if (block) refuse(ctx, 409, block, BLOCK_KEY[block], { name: e.name });
  }
  [a.employeeId, other.employeeId] = [other.employeeId, a.employeeId];
  a.history.push(ev(h, 'swapped', { values: { from: ea.name, to: eb.name } }));
  other.history.push(ev(h, 'swapped', { values: { from: eb.name, to: ea.name } }));
  markChanged(h, a.siteId, a.date);
  markChanged(h, other.siteId, other.date);
  save(h);
  return { first: assignmentView(state, a, h.now), second: assignmentView(state, other, h.now) };
}

/** A supervisor's cover (owner decision O3, Issue #14): the shift's department, allocated to its site on that date. */
const coverable = (e: StoredEmployee, t: { department: HrDepartment; siteId: string }, on: string) => e.department === t.department && allocatedOn(e, t.siteId, on);

function candidates(h: Hr): Candidate[] {
  const { ctx } = h;
  const t = templateIn(h, q(ctx, 'templateId'));
  const on = q(ctx, 'date');
  if (!DATE.test(on)) invalid(ctx, 'date', 'hr:errors.date');
  const planner = holds(h, 'shifts.manage');
  // Issue #14 (P1). Without roster planning, candidates exist only for the cover a supervisor may
  // bring in (owner decision O3): their own department and site, a shift of today or last night.
  // Anything else is refused before any staff is read.
  if (!planner) {
    if (!recordsFor(h, t.department, t.siteId)) refuse(ctx, 403, 'not_your_department', 'notYourDepartment');
    if (on < addDays(h.today, -1) || on > h.today) problem(ctx, 403, 'permission_missing', 'errors:access.permission_missing');
  }
  const w = shiftWindow(t, on);
  // Only people the reader may see are offered; their duties elsewhere still count for overlap. A
  // supervisor is offered only staff of that department allocated to that site on that date.
  return visibleEmployees(h)
    .filter((e) => planner || coverable(e, t, on))
    .filter((e) => e.status !== 'ended' || (e.endDate ?? '') >= on)
    .map((e): Candidate => {
      const facts = factsOf(h, e);
      const block = assignBlock(facts, { siteId: t.siteId, date: on, department: t.department, ...w });
      const before = facts.duties.filter((d) => ms(d.end) <= ms(w.start)).sort((x, y) => ms(y.end) - ms(x.end))[0];
      return { employeeId: e.id, name: e.name, role: e.role, ...(block ? { blocked: block } : {}), ...(pendingLeaveOn(facts, on) ? { pendingLeave: true } : {}), ...(before ? { restHours: restHours(before.end, w.start) } : {}) };
    })
    .filter((c) => c.blocked !== 'other_department' && c.blocked !== 'not_employed')
    .sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || Number(!!a.pendingLeave) - Number(!!b.pendingLeave) || (b.restHours ?? 999) - (a.restHours ?? 999) || a.name.localeCompare(b.name));
}

function publish(h: Hr): RosterWeek {
  const { ctx, state } = h;
  const weekStart = date(ctx, 'weekStart', body<{ weekStart: string }>(ctx).weekStart);
  if (weekStartOf(weekStart) !== weekStart) invalid(ctx, 'weekStart', 'hr:errors.week');
  if (weekDays(weekStart)[6]! < h.today) refuse(ctx, 409, 'week_past', 'weekPast');
  let week = weekStateOf(state, h.site.siteId, weekStart);
  if (!week) state.weeks.push((week = { siteId: h.site.siteId, weekStart, state: 'draft', changesSincePublish: 0 }));
  if (week.state === 'published' && week.changesSincePublish === 0) refuse(ctx, 409, 'nothing_to_publish', 'nothingToPublish');
  Object.assign(week, { state: 'published', publishedAt: h.now, publishedBy: h.me.principalId, publishedByName: h.me.name, changesSincePublish: 0 });
  save(h);
  return rosterWeek(h, weekStart);
}

// ---------------------------------------------------------------------------------------------
// Attendance (HR-005) and corrections (HR-006)
// ---------------------------------------------------------------------------------------------

function attendanceDay(h: Hr): AttendanceDay {
  const raw = q(h.ctx, 'date');
  const on = raw ? date(h.ctx, 'date', raw) : h.today;
  // The shared staffing rule (Issue #14): HR viewers and planners see every department; a supervisor
  // sees the departments they record for at that site.
  const rows = visibleLive(h)
    .filter((a) => a.siteId === h.site.siteId && a.date === on)
    .filter((a) => staffingShown(h, templateOf(h.state, a.templateId).department, a.siteId))
    .sort((a, b) => ms(windowOf(h.state, a).start) - ms(windowOf(h.state, b).start) || employeeOf(h.state, a.employeeId)!.name.localeCompare(employeeOf(h.state, b.employeeId)!.name))
    .map((a) => attendanceRow(h, a));
  const summary = { planned: 0, present: 0, late: 0, absent: 0, on_leave: 0 } as Record<AttendanceState, number>;
  for (const r of rows) summary[r.state] += 1;
  return { date: on, today: h.today, siteName: h.site.name, rows, summary, graceMinutes: h.state.graceMinutes, canRecord: holds(h, 'attendance.record') };
}

function recordable(h: Hr): StoredAssignment {
  const a = visibleLive(h).find((x) => x.id === h.ctx.params.id);
  if (!a) notFound(h.ctx);
  if (!recordsFor(h, templateOf(h.state, a.templateId).department, a.siteId)) refuse(h.ctx, 403, 'not_your_department', 'notYourDepartment');
  if (attendanceState(h.state, a) === 'on_leave') refuse(h.ctx, 409, 'on_leave', 'onLeave', { name: employeeOf(h.state, a.employeeId)!.name });
  return a;
}

function checkIn(h: Hr) {
  const { state } = h;
  const a = recordable(h);
  if (recordOf(state, a.id)) refuse(h.ctx, 409, 'already_recorded', 'alreadyRecorded');
  const w = windowOf(state, a);
  if (ms(h.now) < ms(w.start) - 60 * 60_000 || ms(h.now) >= ms(w.end)) refuse(h.ctx, 409, 'not_on_duty_time', 'notOnDutyTime');
  const late = lateBy(w.start, h.now, state.graceMinutes);
  state.attendance.push({ assignmentId: a.id, employeeId: a.employeeId, state: late ? 'late' : 'present', checkIn: h.now, recordedBy: h.me.principalId, recordedByName: h.me.name, recordedAt: h.now, corrected: false, history: [ev(h, 'checked_in', late ? { values: { late: String(late) } } : {})] });
  save(h);
  return attendanceRow(h, a);
}

function checkOut(h: Hr) {
  const a = recordable(h);
  const r = recordOf(h.state, a.id);
  if (!r?.checkIn) refuse(h.ctx, 409, 'not_checked_in', 'notCheckedIn');
  if (r.checkOut) refuse(h.ctx, 409, 'already_recorded', 'alreadyRecorded');
  if (ms(h.now) <= ms(r.checkIn)) refuse(h.ctx, 409, 'not_on_duty_time', 'notOnDutyTime');
  r.checkOut = h.now;
  r.history.push(ev(h, 'checked_out'));
  save(h);
  return attendanceRow(h, a);
}

function markAbsent(h: Hr) {
  const { state } = h;
  const a = recordable(h);
  if (recordOf(state, a.id)) refuse(h.ctx, 409, 'already_recorded', 'alreadyRecorded');
  if (ms(h.now) <= ms(windowOf(state, a).start) + state.graceMinutes * 60_000) refuse(h.ctx, 409, 'too_early_absent', 'tooEarlyAbsent', { minutes: String(state.graceMinutes) });
  const note = str(body<{ note: string }>(h.ctx).note).slice(0, 300);
  state.attendance.push({ assignmentId: a.id, employeeId: a.employeeId, state: 'absent', recordedBy: h.me.principalId, recordedByName: h.me.name, recordedAt: h.now, corrected: false, history: [ev(h, 'marked_absent', note ? { note } : {})] });
  save(h);
  return attendanceRow(h, a);
}

/** A correction is a request: the record changes only when someone else with attendance.adjust approves it. */
function requestCorrection(h: Hr) {
  const { ctx, state } = h;
  const a = recordable(h);
  const r = recordOf(state, a.id);
  if (!r) refuse(ctx, 409, 'nothing_to_correct', 'nothingToCorrect');
  if (state.corrections.some((c) => c.assignmentId === a.id && c.state === 'pending')) refuse(ctx, 409, 'correction_pending', 'correctionPending');
  const b = body<{ after: CorrectionValues; reason: string }>(ctx);
  const after = (b.after ?? {}) as Partial<CorrectionValues>;
  const w = windowOf(state, a);
  let next: CorrectionValues;
  if (after.state === 'absent') next = { state: 'absent' };
  else {
    const checkInAt = str(after.checkIn);
    if (!checkInAt || Number.isNaN(ms(checkInAt)) || ms(checkInAt) < ms(w.start) - 2 * 3_600_000 || ms(checkInAt) > ms(w.end)) invalid(ctx, 'checkIn', 'hr:errors.checkInTime');
    const checkOutAt = str(after.checkOut);
    if (checkOutAt && (Number.isNaN(ms(checkOutAt)) || ms(checkOutAt) <= ms(checkInAt) || ms(checkOutAt) > ms(w.end) + 6 * 3_600_000)) invalid(ctx, 'checkOut', 'hr:errors.checkOutTime');
    // The state follows from the times (late beyond the grace period), never typed separately.
    next = { state: lateBy(w.start, checkInAt, state.graceMinutes) ? 'late' : 'present', checkIn: checkInAt, ...(checkOutAt ? { checkOut: checkOutAt } : {}) };
  }
  const reason = text(ctx, 'reason', b.reason, 10, 400);
  const before: CorrectionValues = { state: r.state, ...(r.checkIn ? { checkIn: r.checkIn } : {}), ...(r.checkOut ? { checkOut: r.checkOut } : {}) };
  if (before.state === next.state && before.checkIn === next.checkIn && before.checkOut === next.checkOut) invalid(ctx, 'checkIn', 'hr:errors.noChange');
  const { id, ref } = nextHr(state, codeOf(h, a.siteId), 'correction');
  const c = { id, ref, assignmentId: a.id, employeeId: a.employeeId, before, after: next, reason, requestedBy: h.me.principalId, requestedByName: h.me.name, requestedAt: h.now, state: 'pending' as const, history: [ev(h, 'correction_requested', { note: reason })] };
  state.corrections.push(c);
  r.history.push(ev(h, 'correction_requested', { values: { ref } }));
  save(h);
  return correctionView(h, c);
}

/** Maker ≠ checker by principal, and nobody decides their own attendance, leave or advance. */
function checker(h: Hr, requestedBy: string, employeeId: string) {
  if (requestedBy === h.me.principalId) refuse(h.ctx, 403, 'maker_checker_required', 'ownRequest');
  if (employeeOf(h.state, employeeId)?.principalId === h.me.principalId) refuse(h.ctx, 403, 'own_record', 'ownRecord');
}

function decideCorrection(h: Hr, approve: boolean) {
  const { ctx, state } = h;
  const c = state.corrections.find((x) => x.id === ctx.params.id);
  if (!c || !correctionVisible(h, c.assignmentId)) notFound(ctx);
  if (c.state !== 'pending') refuse(ctx, 409, 'state_changed', 'stateChanged');
  checker(h, c.requestedBy, c.employeeId);
  const note = text(ctx, 'note', body<{ note: string }>(ctx).note, approve ? 0 : 5, 400);
  Object.assign(c, { state: approve ? 'approved' : 'rejected', decidedBy: h.me.principalId, decidedByName: h.me.name, decidedAt: h.now, ...(note ? { decisionNote: note } : {}) });
  c.history.push(ev(h, approve ? 'correction_approved' : 'correction_rejected', note ? { note } : {}));
  const r = recordOf(state, c.assignmentId)!;
  if (approve) {
    r.state = c.after.state as 'present' | 'late' | 'absent';
    if (c.after.checkIn) r.checkIn = c.after.checkIn;
    else delete r.checkIn;
    if (c.after.checkOut) r.checkOut = c.after.checkOut;
    else delete r.checkOut;
    r.corrected = true;
  }
  r.history.push(ev(h, approve ? 'corrected' : 'correction_rejected', { values: { ref: c.ref } }));
  save(h);
  return correctionView(h, c);
}

// ---------------------------------------------------------------------------------------------
// Leave (HR-006)
// ---------------------------------------------------------------------------------------------

function leaveAndCorrections(h: Hr): LeaveAndCorrections {
  const { state } = h;
  const allLeave = holds(h, 'hr.view') || holds(h, 'leave.manage');
  const allCorrections = holds(h, 'hr.view') || holds(h, 'attendance.adjust');
  // Leave follows the employee and corrections follow their duty's site, both inside the reader's
  // scope; a supervisor without hr.view sees only the departments and sites they record for.
  const mine = visibleEmployees(h);
  const supervised = (e: StoredEmployee) => homeSites(e, h.today).some((id) => recordsFor(h, e.department, id));
  const leave = state.leave
    .filter((l) => {
      const e = mine.find((x) => x.id === l.employeeId);
      return !!e && (allLeave || supervised(e));
    })
    .sort((a, b) => Number(b.state === 'pending') - Number(a.state === 'pending') || ms(b.requestedAt) - ms(a.requestedAt))
    .map((l) => leaveView(h, l));
  const corrections = state.corrections
    .filter((c) => {
      const a = state.assignments.find((x) => x.id === c.assignmentId);
      if (!a || !assignmentVisible(h.scope, a)) return false;
      return allCorrections || c.requestedBy === h.me.principalId || recordsFor(h, templateOf(state, a.templateId).department, a.siteId);
    })
    .sort((a, b) => Number(b.state === 'pending') - Number(a.state === 'pending') || ms(b.requestedAt) - ms(a.requestedAt))
    .map((c) => correctionView(h, c));
  return { leave, corrections, counts: { leavePending: leave.filter((l) => l.state === 'pending').length, correctionsPending: corrections.filter((c) => c.state === 'pending').length }, policy: { adopted: false }, canRequestLeave: holds(h, 'hr.manage') || holds(h, 'leave.manage'), today: h.today };
}

function requestLeave(h: Hr) {
  const { ctx, state } = h;
  const b = body<LeaveInput>(ctx);
  // Leave applies at every site the person works at (approved leave makes their duties there gaps),
  // so it is requested by someone responsible for all of them (Issue #14).
  const e = wholeEmployee(h, employeeIn(h, b.employeeId));
  if (employmentView(e, h.today) !== 'active') refuse(ctx, 409, 'not_employed', 'notEmployed', { name: e.name });
  const type = str(b.type) as (typeof LEAVE_TYPES)[number];
  if (!LEAVE_TYPES.includes(type)) invalid(ctx, 'type', 'hr:errors.leaveType');
  const from = date(ctx, 'from', b.from);
  const to = date(ctx, 'to', b.to);
  if (to < from || to > addDays(from, 60)) invalid(ctx, 'to', 'hr:errors.leaveDates');
  if (from < addDays(h.today, -30)) invalid(ctx, 'from', 'hr:errors.leaveBackdated');
  if (e.endDate && to > e.endDate) invalid(ctx, 'to', 'hr:errors.afterEnd');
  const clash = state.leave.find((l) => l.employeeId === e.id && (l.state === 'pending' || l.state === 'approved') && l.from <= to && from <= l.to);
  if (clash) refuse(ctx, 409, 'leave_overlap', 'leaveOverlap', { ref: clash.ref });
  const reason = text(ctx, 'reason', b.reason, 5, 400);
  const { id, ref } = nextHr(state, codeOf(h, homeSites(e, h.today)[0]), 'leave');
  const l = { id, ref, employeeId: e.id, type, from, to, reason, state: 'pending' as const, requestedBy: h.me.principalId, requestedByName: h.me.name, requestedAt: h.now, history: [ev(h, 'leave_requested')] };
  state.leave.push(l);
  e.history.push(ev(h, 'leave_requested', { values: { ref } }));
  save(h);
  return leaveView(h, l);
}

function decideLeave(h: Hr, approve: boolean) {
  const { ctx, state } = h;
  const l = findLeave(h);
  if (l.state !== 'pending') refuse(ctx, 409, 'state_changed', 'stateChanged');
  checker(h, l.requestedBy, l.employeeId);
  const note = text(ctx, 'note', body<{ note: string }>(ctx).note, approve ? 0 : 5, 400);
  Object.assign(l, { state: approve ? 'approved' : 'rejected', decidedBy: h.me.principalId, decidedByName: h.me.name, decidedAt: h.now, ...(note ? { decisionNote: note } : {}) });
  l.history.push(ev(h, approve ? 'leave_approved' : 'leave_rejected', note ? { note } : {}));
  employeeOf(state, l.employeeId)!.history.push(ev(h, approve ? 'leave_approved' : 'leave_rejected', { values: { ref: l.ref } }));
  save(h);
  // Approved leave turns the employee's duties in those dates into gaps the roster shows to fill.
  return leaveView(h, l);
}

/**
 * A leave request of an employee in the reader's scope, for a decision or a cancellation. Both
 * change leave that applies at every one of the person's sites, so they also need all of them
 * (Issue #14).
 */
function findLeave(h: Hr) {
  const l = h.state.leave.find((x) => x.id === h.ctx.params.id);
  const e = l ? employeeOf(h.state, l.employeeId) : undefined;
  if (!l || !e || !sees(h, e)) notFound(h.ctx);
  wholeEmployee(h, e);
  return l;
}

function cancelLeave(h: Hr) {
  const { ctx } = h;
  const l = findLeave(h);
  const view = leaveView(h, l);
  if (!view.actions.cancel) refuse(ctx, 409, 'state_changed', 'stateChanged');
  const reason = text(ctx, 'reason', body<{ reason: string }>(ctx).reason, 5, 300);
  l.state = 'cancelled';
  l.history.push(ev(h, 'leave_cancelled', { note: reason }));
  save(h);
  return leaveView(h, l);
}

// ---------------------------------------------------------------------------------------------
// Documents (HR-009)
// ---------------------------------------------------------------------------------------------

const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const EXPIRES: readonly string[] = ['cnic', 'police_verification', 'security_training', 'medical_fitness'];

function documentsOverview(h: Hr): DocumentsOverview {
  const { state, today } = h;
  const manage = holds(h, 'hr.documents.manage');
  const status = q(h.ctx, 'status');
  const rows = visibleEmployees(h)
    .filter((e) => e.status !== 'ended')
    .flatMap((e) =>
      documentStatuses(state, e, today).map((d) => ({ employeeId: e.id, employeeName: e.name, role: e.role, kind: d.kind, status: d.status, ...(d.expiresOn ? { expiresOn: d.expiresOn } : {}), ...(manage && d.doc ? { documentId: d.doc.id } : {}), required: d.required })),
    );
  const counts = { valid: 0, expiring: 0, expired: 0, missing: 0 };
  for (const r of rows) counts[r.status] += 1;
  const shown = rows.filter((r) => (status === 'attention' ? r.status !== 'valid' : status && status !== 'all' ? r.status === status : true));
  const rank = { missing: 0, expired: 1, expiring: 2, valid: 3 };
  shown.sort((a, b) => rank[a.status] - rank[b.status] || a.employeeName.localeCompare(b.employeeName) || HR_DOCUMENT_KINDS.indexOf(a.kind) - HR_DOCUMENT_KINDS.indexOf(b.kind));
  return { rows: shown, counts, canManage: manage };
}

function addDocument(h: Hr) {
  const { ctx, state } = h;
  const b = body<DocumentInput>(ctx);
  // An employee's documents serve every site they work at (a new version replaces the current one
  // for all of them), so they are changed by someone responsible for all of those sites (Issue #14).
  const e = wholeEmployee(h, employeeIn(h, b.employeeId));
  const kind = str(b.kind) as (typeof HR_DOCUMENT_KINDS)[number];
  if (!HR_DOCUMENT_KINDS.includes(kind)) invalid(ctx, 'kind', 'hr:errors.documentKind');
  const file = (b.file ?? {}) as Partial<DocumentInput['file']>;
  const name = str(file.name);
  if (!name || name.length > 120) invalid(ctx, 'file', 'hr:errors.fileName');
  if (!FILE_TYPES.includes(str(file.type))) invalid(ctx, 'file', 'hr:errors.fileType');
  if (typeof file.sizeBytes !== 'number' || file.sizeBytes <= 0 || file.sizeBytes > 5 * 1024 * 1024) invalid(ctx, 'file', 'hr:errors.fileSize');
  const issuedOn = str(b.issuedOn) ? date(ctx, 'issuedOn', b.issuedOn) : undefined;
  if (issuedOn && issuedOn > h.today) invalid(ctx, 'issuedOn', 'hr:errors.issuedFuture');
  const expiresOn = str(b.expiresOn) ? date(ctx, 'expiresOn', b.expiresOn) : undefined;
  if (EXPIRES.includes(kind) && !expiresOn) invalid(ctx, 'expiresOn', 'hr:errors.expiryRequired');
  if (expiresOn && issuedOn && expiresOn <= issuedOn) invalid(ctx, 'expiresOn', 'hr:errors.expiryOrder');
  let number = str(b.number) || undefined;
  if (kind === 'cnic') {
    const cnic = number ? normaliseCnic(number) : null;
    // The identity card must be the employee's own: the number has to match the record.
    if (!cnic || cnic !== e.personal.cnic) invalid(ctx, 'number', 'hr:errors.cnicMismatch');
    number = cnic;
  }
  if (kind === 'police_verification' && !number) invalid(ctx, 'number', 'hr:errors.referenceRequired');
  const previous = currentDocuments(state, e.id).find((d) => d.kind === kind);
  if (previous) {
    previous.replacedAt = h.now;
    previous.history.push(ev(h, 'document_replaced'));
  }
  const { id } = nextHr(state, codeOf(h, homeSites(e, h.today)[0]), 'document');
  const doc = { id, employeeId: e.id, kind, fileName: name, fileType: str(file.type), sizeBytes: file.sizeBytes, ...(number ? { number } : {}), ...(issuedOn ? { issuedOn } : {}), ...(expiresOn ? { expiresOn } : {}), version: (previous?.version ?? 0) + 1, uploadedByName: h.me.name, uploadedAt: h.now, history: [ev(h, previous ? 'document_replaced' : 'document_added')] };
  state.documents.push(doc);
  e.history.push(ev(h, previous ? 'document_replaced' : 'document_added', { values: { document: kind } }));
  save(h);
  return employee360(h, e);
}

// ---------------------------------------------------------------------------------------------
// Advances and loans (HR-007) and their settlement (HR-008)
// ---------------------------------------------------------------------------------------------

function advancesList(h: Hr): AdvancesList {
  const { state } = h;
  const status = q(h.ctx, 'status');
  // Advances follow their employee: only the reader's employees count, in the figures too.
  const mine = visibleEmployees(h);
  const own = state.advances.filter((a) => mine.some((e) => e.id === a.employeeId));
  const all = own.map((a) => advanceView(h, a));
  const counts = { submitted: 0, approved: 0, rejected: 0, withdrawn: 0 };
  for (const a of all) counts[a.state] += 1;
  const items = all.filter((a) => !status || status === 'all' || a.state === status).sort((a, b) => ms(b.requestedAt) - ms(a.requestedAt));
  const approved = own.filter((a) => a.state === 'approved').reduce((n, a) => n + paisa(a.amount), 0n);
  const canRequest = holds(h, 'hr.advances.manage');
  // Only staff whose whole record the reader may change can have an advance raised (Issue #14).
  const staff = canRequest ? mine.filter((e) => employmentView(e, h.today) === 'active' && governs(h, e)).map((e) => ({ id: e.id, name: e.name, role: e.role })) : [];
  return { items, counts, totals: { approvedUnverified: money(approved) }, canRequest, canApprove: holds(h, 'hr.advances.approve'), staff, today: h.today };
}

/**
 * An advance of an employee in the reader's scope. With `whole`, also the authority to change it:
 * an advance belongs to the employee, not to one site, so deciding or withdrawing it needs all of
 * their sites (Issue #14).
 */
function findAdvance(h: Hr, whole = true): StoredAdvance {
  const a = h.state.advances.find((x) => x.id === h.ctx.params.id);
  const e = a ? employeeOf(h.state, a.employeeId) : undefined;
  if (!a || !e || !sees(h, e)) notFound(h.ctx);
  if (whole) wholeEmployee(h, e);
  return a;
}

function requestAdvance(h: Hr): StaffAdvanceView {
  const { ctx, state } = h;
  const b = body<AdvanceInput>(ctx);
  const e = wholeEmployee(h, employeeIn(h, b.employeeId));
  if (employmentView(e, h.today) !== 'active') refuse(ctx, 409, 'not_employed', 'notEmployed', { name: e.name });
  const kind = str(b.kind) as (typeof ADVANCE_KINDS)[number];
  if (!ADVANCE_KINDS.includes(kind)) invalid(ctx, 'kind', 'hr:errors.advanceKind');
  const raw = str(b.amount).replace(/,/g, '');
  if (!AMOUNT.test(raw) || Number(raw) <= 0) invalid(ctx, 'amount', 'hr:errors.amount');
  const amount = money(paisa({ amount: raw, currency: 'PKR' }));
  const instalments = Number(b.instalments);
  const max = kind === 'loan' ? 36 : 6;
  if (!Number.isInteger(instalments) || instalments < 1 || instalments > max) invalid(ctx, 'instalments', 'hr:errors.instalments', { max: String(max) });
  const firstMonth = str(b.firstMonth);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(firstMonth) || firstMonth < h.today.slice(0, 7) || firstMonth > `${Number(h.today.slice(0, 4)) + 1}${h.today.slice(4, 7)}`) invalid(ctx, 'firstMonth', 'hr:errors.firstMonth');
  if (paisa(amount) / BigInt(instalments) < 100n) invalid(ctx, 'instalments', 'hr:errors.instalmentTooSmall');
  const reason = text(ctx, 'reason', b.reason, 10, 400);
  const evidence = Array.isArray(b.evidence) ? (b.evidence as AdvanceInput['evidence']) : [];
  if (!evidence.length) invalid(ctx, 'evidence', 'hr:errors.evidenceRequired');
  for (const f of evidence) if (!FILE_TYPES.includes(f.type) || !(f.sizeBytes > 0 && f.sizeBytes <= 5 * 1024 * 1024) || !str(f.name)) invalid(ctx, 'evidence', 'hr:errors.fileType');
  const { id, ref } = nextHr(state, codeOf(h, homeSites(e, h.today)[0]), 'advance');
  const a: StoredAdvance = { id, ref, employeeId: e.id, kind, amount, reason, instalments, firstMonth, state: 'submitted', requestedBy: h.me.principalId, requestedByName: h.me.name, requestedAt: h.now, evidence: evidence.map((f) => ({ name: str(f.name), type: f.type, sizeBytes: f.sizeBytes })), history: [ev(h, 'advance_requested')] };
  state.advances.push(a);
  save(h);
  return advanceView(h, a);
}

function decideAdvance(h: Hr, approve: boolean): StaffAdvanceView {
  const { ctx } = h;
  const a = findAdvance(h);
  if (a.state !== 'submitted') refuse(ctx, 409, 'state_changed', 'stateChanged');
  checker(h, a.requestedBy, a.employeeId);
  const note = text(ctx, 'note', body<{ note: string }>(ctx).note, approve ? 0 : 5, 400);
  // Approval is an instruction only: nothing is paid, and nothing is owed until a payment is evidenced.
  Object.assign(a, { state: approve ? 'approved' : 'rejected', decidedBy: h.me.principalId, decidedByName: h.me.name, decidedAt: h.now, ...(note ? { decisionNote: note } : {}) });
  a.history.push(ev(h, approve ? 'advance_approved' : 'advance_rejected', note ? { note } : {}));
  save(h);
  return advanceView(h, a);
}

function withdrawAdvance(h: Hr): StaffAdvanceView {
  const { ctx } = h;
  const a = findAdvance(h);
  if (a.state !== 'submitted' && a.state !== 'approved') refuse(ctx, 409, 'state_changed', 'stateChanged');
  const reason = text(ctx, 'reason', body<{ reason: string }>(ctx).reason, 5, 300);
  a.state = 'withdrawn';
  a.history.push(ev(h, 'advance_withdrawn', { note: reason }));
  save(h);
  return advanceView(h, a);
}

/**
 * HR-008, Gate S.2a closure (Issue #12, P1; owner decision O8). Linking a cashbook voucher to a staff
 * advance is disabled, so no voucher can make an advance paid, repaid or owed. A posted S.1 voucher
 * of the right amount, date and legal entity still says nothing about this employee or this advance:
 * the cashbook has no staff-advance subject or category, and the voucher's counterparty and purpose
 * are free text. Verification needs a staff-specific subject (advance id, employee, legal entity,
 * site, direction, amount, posting and reversal status, used once) and an approved category (S.2b).
 * The route stays so that a direct call is refused, never silently accepted.
 */
function link(h: Hr): never {
  // Unchanged since Issue #12: the advance is looked up (out of scope is "not found"), then every
  // request is refused, whoever asks, so no voucher can change it.
  findAdvance(h, false);
  refuse(h.ctx, 409, 'settlement_unverifiable', 'settlementUnverifiable');
}
// ---------------------------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------------------------

const read = (permission: Permission | readonly Permission[], feature?: typeof SHIFTS) => requires(HR, permission, 'history_read', feature);
const change = (permission: Permission | readonly Permission[], feature?: typeof SHIFTS) => requires(HR, permission, 'operational', feature);
const ROSTER_READERS = ['shifts.manage', 'hr.view', 'attendance.record'] as const satisfies readonly Permission[];
const ADVANCE_READERS = ['hr.advances.manage', 'hr.advances.approve'] as const satisfies readonly Permission[];

export const HR_HANDLERS: Handler[] = [
  { method: 'GET', pattern: /^\/hr\/dashboard$/, access: read('hr.view'), handle: (ctx): HrDashboard => dashboard(hrOf(ctx)) },
  { method: 'GET', pattern: /^\/hr\/employees$/, access: read('hr.view'), handle: (ctx): EmployeesList => employeesList(hrOf(ctx)) },
  { method: 'GET', pattern: /^\/hr\/employees\/options$/, access: read('hr.manage'), handle: (ctx): EmployeeOptions => options(hrOf(ctx)) },
  { method: 'POST', pattern: /^\/hr\/employees$/, access: change('hr.manage'), handle: (ctx) => hire(hrOf(ctx)) },
  {
    method: 'GET',
    pattern: /^\/hr\/employees\/(?<id>[\w-]+)$/,
    access: read('hr.view'),
    handle: (ctx): Employee360 => {
      const h = hrOf(ctx);
      return employee360(h, findEmployee(h, ctx.params.id));
    },
  },
  { method: 'PATCH', pattern: /^\/hr\/employees\/(?<id>[\w-]+)$/, access: change('hr.manage'), handle: (ctx) => edit(hrOf(ctx)) },
  { method: 'POST', pattern: /^\/hr\/employees\/(?<id>[\w-]+)\/status$/, access: change('hr.manage'), handle: (ctx) => changeStatus(hrOf(ctx)) },
  { method: 'POST', pattern: /^\/hr\/employees\/(?<id>[\w-]+)\/profile$/, access: change('hr.manage'), handle: (ctx) => profile(hrOf(ctx)) },

  {
    method: 'GET',
    pattern: /^\/hr\/roster$/,
    access: read(ROSTER_READERS, SHIFTS),
    handle: (ctx): RosterWeek => {
      const h = staffingOf(ctx);
      return rosterWeek(h, weekParam(h));
    },
  },
  { method: 'GET', pattern: /^\/hr\/roster\/now$/, access: read(ROSTER_READERS, SHIFTS), handle: (ctx): OnDutyBoard => onDutyBoard(staffingOf(ctx)) },
  { method: 'GET', pattern: /^\/hr\/roster\/candidates$/, access: read(['shifts.manage', 'attendance.record'], SHIFTS), handle: (ctx): Candidate[] => candidates(hrOf(ctx, { shifts: true })) },
  { method: 'POST', pattern: /^\/hr\/roster\/assignments$/, access: change(['shifts.manage', 'attendance.record'], SHIFTS), handle: (ctx) => assign(hrOf(ctx, { shifts: true })) },
  { method: 'POST', pattern: /^\/hr\/roster\/assignments\/(?<id>[\w-]+)\/unassign$/, access: change('shifts.manage', SHIFTS), handle: (ctx) => unassign(hrOf(ctx, { shifts: true })) },
  { method: 'POST', pattern: /^\/hr\/roster\/assignments\/(?<id>[\w-]+)\/swap$/, access: change('shifts.manage', SHIFTS), handle: (ctx) => swap(hrOf(ctx, { shifts: true })) },
  { method: 'POST', pattern: /^\/hr\/roster\/publish$/, access: change('shifts.manage', SHIFTS), handle: (ctx) => publish(hrOf(ctx, { shifts: true })) },

  { method: 'GET', pattern: /^\/hr\/attendance$/, access: read(['hr.view', 'attendance.record'], SHIFTS), handle: (ctx): AttendanceDay => attendanceDay(staffingOf(ctx)) },
  { method: 'POST', pattern: /^\/hr\/attendance\/(?<id>[\w-]+)\/check-in$/, access: change('attendance.record', SHIFTS), handle: (ctx) => checkIn(hrOf(ctx, { shifts: true })) },
  { method: 'POST', pattern: /^\/hr\/attendance\/(?<id>[\w-]+)\/check-out$/, access: change('attendance.record', SHIFTS), handle: (ctx) => checkOut(hrOf(ctx, { shifts: true })) },
  { method: 'POST', pattern: /^\/hr\/attendance\/(?<id>[\w-]+)\/absent$/, access: change('attendance.record', SHIFTS), handle: (ctx) => markAbsent(hrOf(ctx, { shifts: true })) },
  { method: 'POST', pattern: /^\/hr\/attendance\/(?<id>[\w-]+)\/corrections$/, access: change('attendance.record', SHIFTS), handle: (ctx) => requestCorrection(hrOf(ctx, { shifts: true })) },
  { method: 'POST', pattern: /^\/hr\/corrections\/(?<id>[\w-]+)\/approve$/, access: change('attendance.adjust'), handle: (ctx) => decideCorrection(hrOf(ctx), true) },
  { method: 'POST', pattern: /^\/hr\/corrections\/(?<id>[\w-]+)\/reject$/, access: change('attendance.adjust'), handle: (ctx) => decideCorrection(hrOf(ctx), false) },

  { method: 'GET', pattern: /^\/hr\/leave-adjustments$/, access: read(['hr.view', 'leave.manage', 'attendance.adjust', 'attendance.record']), handle: (ctx): LeaveAndCorrections => leaveAndCorrections(hrOf(ctx)) },
  { method: 'POST', pattern: /^\/hr\/leave$/, access: change(['hr.manage', 'leave.manage']), handle: (ctx) => requestLeave(hrOf(ctx)) },
  { method: 'POST', pattern: /^\/hr\/leave\/(?<id>[\w-]+)\/approve$/, access: change('leave.manage'), handle: (ctx) => decideLeave(hrOf(ctx), true) },
  { method: 'POST', pattern: /^\/hr\/leave\/(?<id>[\w-]+)\/reject$/, access: change('leave.manage'), handle: (ctx) => decideLeave(hrOf(ctx), false) },
  { method: 'POST', pattern: /^\/hr\/leave\/(?<id>[\w-]+)\/cancel$/, access: change(['leave.manage', 'hr.manage']), handle: (ctx) => cancelLeave(hrOf(ctx)) },

  { method: 'GET', pattern: /^\/hr\/documents$/, access: read('hr.view'), handle: (ctx): DocumentsOverview => documentsOverview(hrOf(ctx)) },
  { method: 'POST', pattern: /^\/hr\/documents$/, access: change('hr.documents.manage'), handle: (ctx) => addDocument(hrOf(ctx)) },

  { method: 'GET', pattern: /^\/hr\/advances$/, access: read(ADVANCE_READERS), handle: (ctx): AdvancesList => advancesList(hrOf(ctx)) },
  { method: 'POST', pattern: /^\/hr\/advances$/, access: change('hr.advances.manage'), handle: (ctx) => requestAdvance(hrOf(ctx)) },
  { method: 'POST', pattern: /^\/hr\/advances\/(?<id>[\w-]+)\/approve$/, access: change('hr.advances.approve'), handle: (ctx) => decideAdvance(hrOf(ctx), true) },
  { method: 'POST', pattern: /^\/hr\/advances\/(?<id>[\w-]+)\/reject$/, access: change('hr.advances.approve'), handle: (ctx) => decideAdvance(hrOf(ctx), false) },
  { method: 'POST', pattern: /^\/hr\/advances\/(?<id>[\w-]+)\/withdraw$/, access: change('hr.advances.manage'), handle: (ctx) => withdrawAdvance(hrOf(ctx)) },
  // HR-008: no voucher listing (it would show finance records to HR) and no linking (see `link`).
  { method: 'POST', pattern: /^\/hr\/advances\/(?<id>[\w-]+)\/link$/, access: change('hr.advances.manage'), handle: (ctx) => link(hrOf(ctx)) },
];
