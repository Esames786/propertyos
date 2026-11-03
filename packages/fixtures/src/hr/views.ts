import type { AssignmentView, AttendanceRow, AttendanceState, DocumentStatus, DutyNow, Employee360, EmployeeRow, EmploymentView, HrDepartment, HrDocumentKind, HrDocumentView, LeaveRequestView, LeaveType, OnDutyBoard, OnDutyShift, OnDutyStaff, Permission, RosterWeek, RosterWarning, ShiftTemplate, StaffAdvanceView, AttendanceCorrectionView } from '@repo/contracts';
import { HR_DOCUMENT_KINDS, LEAVE_TYPES } from '@repo/contracts';
import { can, type HandlerContext } from '../handler-types';
import type { OpsSite } from '../operations/site';
import { money, paisa, sum } from '../society/finance/model';
import { directoryTenant } from '../tenant-directory';
import { addDays, coverage, documentStatus, initialsOf, instalmentPlan, lateBy, maskCnic, ms, REQUIRED_DOCUMENTS, shiftWindow, weekDays, weekStartOf, type Window } from './rules';
import { hrStamp, type HrState, type StoredAdvance, type StoredAssignment, type StoredCorrection, type StoredDocument, type StoredEmployee, type StoredLeave } from './state';

/**
 * Gate S.2a read models: what each screen shows, derived on every read from the stored records (an
 * attendance state, a duty "now", coverage, document status and what is owed are never stored).
 * Each view carries only what the reader's permissions allow: personal details with `hr.manage`,
 * document files with `hr.documents.manage`, money with an advances permission.
 */

export interface Hr {
  site: OpsSite;
  state: HrState;
  today: string;
  /** Now, as an instant with the organisation's offset. */
  now: string;
  me: { principalId: string; name: string };
  ctx: HandlerContext;
}

export const hrNow = (ctx: HandlerContext) => hrStamp(ctx);
/** The employing legal entity's name (the organisation's one association in the demo). */
export const legalEntityName = (h: Pick<Hr, 'site'>) => directoryTenant(h.site.tenantId)?.legalName ?? h.site.name;
export const templateOf = (state: HrState, id: string) => state.templates.find((t) => t.id === id)!;
export const windowOf = (state: HrState, a: Pick<StoredAssignment, 'templateId' | 'date'>): Window => shiftWindow(templateOf(state, a.templateId), a.date);
export const employeeOf = (state: HrState, id: string) => state.employees.find((e) => e.id === id);
export const live = (state: HrState) => state.assignments.filter((a) => a.state === 'planned');

/** The leave that covers a date for an employee (approved first, then pending). */
export function leaveOn(state: HrState, employeeId: string, date: string): StoredLeave | undefined {
  const covering = state.leave.filter((l) => l.employeeId === employeeId && (l.state === 'approved' || l.state === 'pending') && l.from <= date && date <= l.to);
  return covering.find((l) => l.state === 'approved') ?? covering[0];
}

export const recordOf = (state: HrState, assignmentId: string) => state.attendance.find((r) => r.assignmentId === assignmentId);

/** Approved leave wins; then what was recorded; otherwise planned. */
export function attendanceState(state: HrState, a: StoredAssignment): AttendanceState {
  if (leaveOn(state, a.employeeId, a.date)?.state === 'approved') return 'on_leave';
  return recordOf(state, a.id)?.state ?? 'planned';
}

export const employmentView = (e: StoredEmployee, today: string): EmploymentView => (e.status === 'active' && e.startDate > today ? 'upcoming' : e.status);

/** Whether a person holds a permission that is licensed (never just the role). */
export const holds = (h: Hr, permission: Permission) => can(h.ctx, permission);

/** The reader's own employee record (a supervisor's departments, maker-checker on their own records). */
export const myEmployee = (h: Hr) => h.state.employees.find((e) => e.principalId === h.me.principalId);

/** Records attendance for this department: the permission, and HR management or supervising it. */
export const recordsFor = (h: Hr, department: HrDepartment) => holds(h, 'attendance.record') && (holds(h, 'hr.manage') || (myEmployee(h)?.supervises ?? []).includes(department));

export function assignmentView(state: HrState, a: StoredAssignment, now: string): AssignmentView {
  const e = employeeOf(state, a.employeeId)!;
  const t = templateOf(state, a.templateId);
  const w = shiftWindow(t, a.date);
  const leave = leaveOn(state, a.employeeId, a.date);
  const covered = a.coverFor ? state.assignments.find((x) => x.id === a.coverFor) : undefined;
  return {
    id: a.id,
    siteId: a.siteId,
    employeeId: e.id,
    employeeName: e.name,
    role: e.role,
    templateId: t.id,
    shiftKey: t.key,
    date: a.date,
    start: w.start,
    end: w.end,
    ...(a.post ? { post: a.post } : {}),
    ...(covered ? { coverFor: { assignmentId: covered.id, employeeName: employeeOf(state, covered.employeeId)!.name } } : {}),
    attendance: attendanceState(state, a),
    ...(leave ? { leave: leave.state as 'pending' | 'approved' } : {}),
    started: ms(w.start) <= ms(now),
  };
}

/** Where a staff member's duty stands at `now` (the current shift, else today's). */
export function dutyNow(h: Hr, employeeId: string): DutyNow {
  const { state, now, today } = h;
  const mine = live(state).filter((a) => a.employeeId === employeeId && (a.date === today || a.date === addDays(today, -1)));
  const at = ms(now);
  const current = mine.find((a) => {
    const w = windowOf(state, a);
    return ms(w.start) <= at && at < ms(w.end);
  });
  const view = (a: StoredAssignment, s: DutyNow['state']): DutyNow => {
    const w = windowOf(state, a);
    return { state: s, shiftKey: templateOf(state, a.templateId).key, start: w.start, end: w.end, ...(a.post ? { post: a.post } : {}) };
  };
  if (current) {
    const s = attendanceState(state, current);
    if (s === 'on_leave') return view(current, 'on_leave');
    if (s === 'absent') return view(current, 'absent');
    if (s === 'late') return view(current, 'late');
    if (s === 'present') return view(current, recordOf(state, current.id)?.checkOut ? 'done' : 'on_duty');
    return view(current, at - ms(windowOf(state, current).start) > state.graceMinutes * 60_000 ? 'late' : 'scheduled');
  }
  if (leaveOn(state, employeeId, today)?.state === 'approved') return { state: 'on_leave' };
  const later = mine.filter((a) => a.date === today && ms(windowOf(state, a).start) > at).sort((a, b) => ms(windowOf(state, a).start) - ms(windowOf(state, b).start))[0];
  if (later) return view(later, 'scheduled');
  const done = mine.find((a) => a.date === today);
  return done ? view(done, 'done') : { state: 'off' };
}

// ---------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------

export const currentDocuments = (state: HrState, employeeId: string) => state.documents.filter((d) => d.employeeId === employeeId && !d.replacedAt);

type DocumentState = { kind: HrDocumentKind; status: DocumentStatus; expiresOn?: string; doc?: StoredDocument; required: boolean };

export function documentStatuses(state: HrState, e: StoredEmployee, today: string): DocumentState[] {
  const required = REQUIRED_DOCUMENTS[e.department];
  const docs = currentDocuments(state, e.id);
  return HR_DOCUMENT_KINDS.flatMap((kind): DocumentState[] => {
    const doc = docs.find((d) => d.kind === kind);
    const isRequired = required.includes(kind);
    if (!doc) return isRequired ? [{ kind, status: 'missing' as const, required: true }] : [];
    return [{ kind, status: documentStatus(doc.expiresOn, today), ...(doc.expiresOn ? { expiresOn: doc.expiresOn } : {}), doc, required: isRequired }];
  });
}

/** Required documents needing attention: missing, expired or expiring within 30 days. */
export const documentsAttention = (state: HrState, e: StoredEmployee, today: string) => (e.status === 'ended' ? 0 : documentStatuses(state, e, today).filter((d) => d.required && d.status !== 'valid').length);

export function documentView(d: StoredDocument, today: string): HrDocumentView {
  return {
    id: d.id,
    employeeId: d.employeeId,
    kind: d.kind,
    fileName: d.fileName,
    fileType: d.fileType,
    sizeBytes: d.sizeBytes,
    ...(d.number ? { numberMasked: d.kind === 'cnic' ? maskCnic(d.number) : `${d.number.slice(0, 4)}…${d.number.slice(-3)}` } : {}),
    ...(d.issuedOn ? { issuedOn: d.issuedOn } : {}),
    ...(d.expiresOn ? { expiresOn: d.expiresOn } : {}),
    status: documentStatus(d.expiresOn, today),
    version: d.version,
    uploadedByName: d.uploadedByName,
    uploadedAt: d.uploadedAt,
    history: d.history,
  };
}

// ---------------------------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------------------------

export function employeeRow(h: Hr, e: StoredEmployee): EmployeeRow {
  return {
    id: e.id,
    code: e.code,
    name: e.name,
    role: e.role,
    department: e.department,
    status: employmentView(e, h.today),
    employmentType: e.employmentType,
    sites: e.sites.filter((s) => !s.to || s.to >= h.today).map(() => h.site.name),
    startDate: e.startDate,
    ...(e.endDate ? { endDate: e.endDate } : {}),
    today: e.status === 'active' ? dutyNow(h, e.id) : { state: 'off' },
    documentsAttention: documentsAttention(h.state, e, h.today),
  };
}

export function leaveView(h: Hr, l: StoredLeave): LeaveRequestView {
  const e = employeeOf(h.state, l.employeeId)!;
  const own = e.principalId === h.me.principalId;
  const ownRequest = l.requestedBy === h.me.principalId;
  const pending = l.state === 'pending';
  const may = holds(h, 'leave.manage') && pending;
  const conflicts = live(h.state)
    .filter((a) => a.employeeId === l.employeeId && l.from <= a.date && a.date <= l.to)
    .map((a) => ({ assignmentId: a.id, date: a.date, shiftKey: templateOf(h.state, a.templateId).key }));
  return {
    id: l.id,
    ref: l.ref,
    employeeId: e.id,
    employeeName: e.name,
    type: l.type,
    from: l.from,
    to: l.to,
    days: Math.round((Date.parse(`${l.to}T00:00:00Z`) - Date.parse(`${l.from}T00:00:00Z`)) / 86_400_000) + 1,
    reason: l.reason,
    state: l.state,
    requestedByName: l.requestedByName,
    requestedAt: l.requestedAt,
    ...(l.decidedByName ? { decidedByName: l.decidedByName, decidedAt: l.decidedAt! } : {}),
    ...(l.decisionNote ? { decisionNote: l.decisionNote } : {}),
    conflicts,
    ...(pending && own ? { blocked: 'own_record' as const } : pending && ownRequest ? { blocked: 'own_request' as const } : {}),
    actions: { approve: may && !own && !ownRequest, reject: may && !own && !ownRequest, cancel: (l.state === 'pending' || (l.state === 'approved' && l.from > h.today)) && (ownRequest || holds(h, 'leave.manage')) },
    history: l.history,
  };
}

export function correctionView(h: Hr, c: StoredCorrection): AttendanceCorrectionView {
  const e = employeeOf(h.state, c.employeeId)!;
  const a = h.state.assignments.find((x) => x.id === c.assignmentId)!;
  const own = e.principalId === h.me.principalId;
  const ownRequest = c.requestedBy === h.me.principalId;
  const may = holds(h, 'attendance.adjust') && c.state === 'pending' && !own && !ownRequest;
  return {
    id: c.id,
    ref: c.ref,
    assignmentId: a.id,
    employeeId: e.id,
    employeeName: e.name,
    date: a.date,
    shiftKey: templateOf(h.state, a.templateId).key,
    before: c.before,
    after: c.after,
    reason: c.reason,
    requestedByName: c.requestedByName,
    requestedAt: c.requestedAt,
    state: c.state,
    ...(c.decidedByName ? { decidedByName: c.decidedByName, decidedAt: c.decidedAt! } : {}),
    ...(c.decisionNote ? { decisionNote: c.decisionNote } : {}),
    ...(c.state === 'pending' && own ? { blocked: 'own_record' as const } : c.state === 'pending' && ownRequest ? { blocked: 'own_request' as const } : {}),
    actions: { approve: may, reject: may },
    history: c.history,
  };
}

/** What is owed: the evidenced disbursement less the evidenced repayments (zero before a disbursement). */
export function outstandingOf(a: StoredAdvance): bigint {
  if (!a.disbursement) return 0n;
  const left = paisa(a.disbursement.amount) - sum(a.repayments.map((r) => paisa(r.amount)));
  return left > 0n ? left : 0n;
}

export function advanceView(h: Hr, a: StoredAdvance): StaffAdvanceView {
  const e = employeeOf(h.state, a.employeeId)!;
  const own = e.principalId === h.me.principalId;
  const ownRequest = a.requestedBy === h.me.principalId;
  const submitted = a.state === 'submitted';
  const may = holds(h, 'hr.advances.approve') && submitted && !own && !ownRequest;
  const manage = holds(h, 'hr.advances.manage');
  // The plan is an instruction; an instalment shows as received only once evidenced receipts cover it.
  let received = sum(a.repayments.map((r) => paisa(r.amount)));
  const schedule = instalmentPlan(paisa(a.amount), a.instalments, a.firstMonth).map((i) => {
    const covered = received >= i.paisa;
    if (covered) received -= i.paisa;
    return { n: i.n, month: i.month, amount: money(i.paisa), state: covered ? ('received' as const) : ('planned' as const) };
  });
  return {
    id: a.id,
    ref: a.ref,
    employeeId: e.id,
    employeeName: e.name,
    kind: a.kind,
    amount: a.amount,
    reason: a.reason,
    instalments: a.instalments,
    schedule,
    state: a.state,
    requestedByName: a.requestedByName,
    requestedAt: a.requestedAt,
    ...(a.decidedByName ? { decidedByName: a.decidedByName, decidedAt: a.decidedAt! } : {}),
    ...(a.decisionNote ? { decisionNote: a.decisionNote } : {}),
    evidence: a.evidence,
    ...(a.disbursement ? { disbursement: a.disbursement } : {}),
    repayments: a.repayments,
    outstanding: money(outstandingOf(a)),
    ...(submitted && own ? { blocked: 'own_record' as const } : submitted && ownRequest ? { blocked: 'own_request' as const } : {}),
    actions: {
      approve: may,
      reject: may,
      withdraw: manage && (a.state === 'submitted' || a.state === 'approved'),
      linkDisbursement: manage && a.state === 'approved',
      linkRepayment: manage && a.state === 'disbursed',
    },
    history: a.history,
  };
}

export const viewsAdvances = (h: Hr) => holds(h, 'hr.advances.manage') || holds(h, 'hr.advances.approve');

export function attendanceRow(h: Hr, a: StoredAssignment): AttendanceRow {
  const { state } = h;
  const e = employeeOf(state, a.employeeId)!;
  const t = templateOf(state, a.templateId);
  const w = shiftWindow(t, a.date);
  const r = recordOf(state, a.id);
  const s = attendanceState(state, a);
  const at = ms(h.now);
  const mayRecord = recordsFor(h, t.department) && s !== 'on_leave';
  const started = at >= ms(w.start) - 60 * 60_000;
  const pending = state.corrections.some((c) => c.assignmentId === a.id && c.state === 'pending');
  return {
    assignmentId: a.id,
    employeeId: e.id,
    employeeName: e.name,
    role: e.role,
    department: t.department,
    shiftKey: t.key,
    started: at >= ms(w.start),
    ended: at >= ms(w.end),
    date: a.date,
    start: w.start,
    end: w.end,
    ...(a.post ? { post: a.post } : {}),
    state: s,
    ...(r?.checkIn ? { checkIn: r.checkIn } : {}),
    ...(r?.checkOut ? { checkOut: r.checkOut } : {}),
    ...(r?.checkIn && lateBy(w.start, r.checkIn, state.graceMinutes) ? { lateMinutes: lateBy(w.start, r.checkIn, state.graceMinutes) } : {}),
    corrected: !!r?.corrected,
    correctionPending: pending,
    ...(r ? { recordedByName: r.recordedByName } : {}),
    actions: {
      checkIn: mayRecord && !r && started && at < ms(w.end),
      checkOut: mayRecord && !!r?.checkIn && !r.checkOut,
      markAbsent: mayRecord && !r && at > ms(w.start) + state.graceMinutes * 60_000,
      correct: mayRecord && !!r && !pending,
    },
  };
}

export function employee360(h: Hr, e: StoredEmployee): Employee360 {
  const { state, today } = h;
  const manage = holds(h, 'hr.manage');
  const docsManage = holds(h, 'hr.documents.manage');
  const mine = live(state).filter((a) => a.employeeId === e.id);
  const byStart = (x: StoredAssignment, y: StoredAssignment) => ms(windowOf(state, x).start) - ms(windowOf(state, y).start);
  const upcoming = mine.filter((a) => a.date >= today && a.date <= addDays(today, 7)).sort(byStart);
  const past = mine.filter((a) => a.date < today && a.date >= addDays(today, -14)).sort(byStart).reverse();
  const recent = mine
    .filter((a) => a.date <= today && a.date >= addDays(today, -30))
    .sort(byStart)
    .reverse()
    .map((a) => attendanceRow(h, a))
    .filter((r) => r.state !== 'planned' || ms(r.start) <= ms(h.now));
  const summary = { present: 0, late: 0, absent: 0, on_leave: 0 };
  for (const r of recent) if (r.state !== 'planned') summary[r.state] += 1;
  const year = today.slice(0, 4);
  const taken = Object.fromEntries(LEAVE_TYPES.map((t) => [t, 0])) as Record<LeaveType, number>;
  for (const l of state.leave.filter((x) => x.employeeId === e.id && x.state === 'approved' && x.from.startsWith(year))) taken[l.type] += Math.round((Date.parse(`${l.to}T00:00:00Z`) - Date.parse(`${l.from}T00:00:00Z`)) / 86_400_000) + 1;
  const docs = documentStatuses(state, e, today);
  const active = e.status === 'active';
  const advances = viewsAdvances(h) ? state.advances.filter((a) => a.employeeId === e.id).map((a) => advanceView(h, a)) : undefined;
  return {
    id: e.id,
    code: e.code,
    name: e.name,
    initials: initialsOf(e.name),
    role: e.role,
    department: e.department,
    status: employmentView(e, today),
    employmentType: e.employmentType,
    legalEntity: { id: e.legalEntityId, name: legalEntityName(h) },
    startDate: e.startDate,
    ...(e.endDate ? { endDate: e.endDate } : {}),
    periods: e.periods,
    sites: e.sites.map((s) => ({ siteId: s.siteId, siteName: h.site.name, from: s.from, ...(s.to ? { to: s.to } : {}) })),
    cnicMasked: maskCnic(e.personal.cnic),
    ...(manage ? { personal: e.personal } : {}),
    hasSignIn: !!e.principalId,
    supervises: e.supervises,
    publicProfile: e.profile,
    businessDate: today,
    today: active ? dutyNow(h, e.id) : { state: 'off' },
    upcoming: upcoming.map((a) => assignmentView(state, a, h.now)),
    shiftHistory: past.map((a) => assignmentView(state, a, h.now)),
    attendance: { recent, summary },
    leave: { requests: state.leave.filter((l) => l.employeeId === e.id).sort((a, b) => b.from.localeCompare(a.from)).map((l) => leaveView(h, l)), takenThisYear: taken },
    documents: {
      required: [...REQUIRED_DOCUMENTS[e.department]],
      status: docs.map((d) => ({ kind: d.kind, status: d.status, ...(d.expiresOn ? { expiresOn: d.expiresOn } : {}) })),
      ...(docsManage ? { items: currentDocuments(state, e.id).map((d) => documentView(d, today)) } : {}),
    },
    ...(advances ? { advances } : {}),
    history: [...e.history].sort((a, b) => ms(b.at) - ms(a.at)),
    actions: {
      edit: manage && e.status !== 'ended',
      changeStatus: manage,
      assign: holds(h, 'shifts.manage') && active && !!h.ctx.access?.features.includes('hr.shifts'),
      recordAttendance: recordsFor(h, e.department) && active,
      requestLeave: (manage || holds(h, 'leave.manage')) && active,
      manageDocuments: docsManage,
      viewAdvances: viewsAdvances(h),
      requestAdvance: holds(h, 'hr.advances.manage') && active,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The roster and who is on duty now
// ---------------------------------------------------------------------------------------------

const DEPT_ORDER: HrDepartment[] = ['security', 'maintenance', 'housekeeping', 'office'];
export const orderedTemplates = (state: HrState, siteId: string) =>
  state.templates.filter((t) => t.siteId === siteId).sort((a, b) => DEPT_ORDER.indexOf(a.department) - DEPT_ORDER.indexOf(b.department) || a.start.localeCompare(b.start) || Number(a.crossesMidnight) - Number(b.crossesMidnight));

export function weekStateOf(state: HrState, siteId: string, weekStart: string) {
  return state.weeks.find((w) => w.siteId === siteId && w.weekStart === weekStart);
}

export function rosterWeek(h: Hr, weekStart: string): RosterWeek {
  const { state, site } = h;
  const templates = orderedTemplates(state, site.siteId);
  const warnings: RosterWarning[] = [];
  const days = weekDays(weekStart).map((date, i) => ({
    date,
    shifts: templates.map((t) => {
      const assignments = live(state)
        .filter((a) => a.templateId === t.id && a.date === date)
        .map((a) => assignmentView(state, a, h.now))
        .sort((a, b) => Number(!!a.coverFor) - Number(!!b.coverFor) || a.employeeName.localeCompare(b.employeeName));
      const runs = t.days.includes(i);
      // A shift that does not run that day needs no cover; one added as an exception is shown all the same.
      const cov = runs ? coverage(t.minStaff, assignments.map((a) => a.attendance)) : { required: 0, available: assignments.length, short: false };
      const w = shiftWindow(t, date);
      const where = { date, shiftKey: t.key, department: t.department, end: w.end };
      if (cov.short) warnings.push({ kind: 'short_staffed', ...where, required: cov.required, available: cov.available });
      for (const a of assignments.filter((x) => x.leave)) warnings.push({ kind: a.leave === 'approved' ? 'approved_leave' : 'leave_conflict', ...where, employeeName: a.employeeName });
      return { templateId: t.id, shiftKey: t.key, start: w.start, end: w.end, department: t.department, minStaff: t.minStaff, runs, assignments, coverage: cov };
    }),
  }));
  const week = weekStateOf(state, site.siteId, weekStart);
  const edit = holds(h, 'shifts.manage');
  return {
    siteId: site.siteId,
    siteName: site.name,
    weekStart,
    today: h.today,
    days,
    state: week?.state ?? 'draft',
    ...(week?.publishedAt ? { publishedAt: week.publishedAt, publishedByName: week.publishedByName! } : {}),
    changesSincePublish: week?.changesSincePublish ?? 0,
    warnings,
    templates,
    sites: [{ id: site.siteId, name: site.name }],
    actions: { edit, publish: edit && (week?.state !== 'published' || (week?.changesSincePublish ?? 0) > 0) },
  };
}

/** The shifts running at `now` (yesterday's night included) and the next ones to start. */
export function onDutyShifts(h: Hr, opts: { publishedOnly: boolean }): { current: OnDutyShift[]; next: OnDutyShift[] } {
  const { state, site, today } = h;
  const at = ms(h.now);
  const published = (date: string) => weekStateOf(state, site.siteId, weekStartOf(date))?.state === 'published';
  const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const candidates = orderedTemplates(state, site.siteId).flatMap((t) =>
    [addDays(today, -1), today, addDays(today, 1)]
      // A shift that does not run that day appears only if someone was put on it as an exception.
      .filter((date) => t.days.includes(weekday(date)) || live(state).some((a) => a.templateId === t.id && a.date === date))
      .map((date) => ({ t, date, w: shiftWindow(t, date) })),
  );
  const shiftOf = (t: ShiftTemplate, date: string, w: Window): OnDutyShift => {
    const assignments = live(state).filter((a) => a.templateId === t.id && a.date === date);
    const staff: OnDutyStaff[] = assignments.map((a) => {
      const e = employeeOf(state, a.employeeId)!;
      const s = attendanceState(state, a);
      const r = recordOf(state, a.id);
      const cover = live(state).find((x) => x.coverFor === a.id);
      const covered = a.coverFor ? state.assignments.find((x) => x.id === a.coverFor) : undefined;
      return {
        assignmentId: a.id,
        employeeId: e.id,
        name: e.name,
        role: e.role,
        ...(a.post ? { post: a.post } : {}),
        state: s === 'planned' ? 'not_checked_in' : s,
        ...(r?.checkIn ? { checkInAt: r.checkIn } : {}),
        ...(covered ? { coverFor: employeeOf(state, covered.employeeId)!.name } : {}),
        ...(cover ? { coveredBy: employeeOf(state, cover.employeeId)!.name } : {}),
      };
    });
    const available = staff.filter((s) => s.state !== 'absent' && s.state !== 'on_leave').length;
    return { templateId: t.id, shiftKey: t.key, department: t.department, date, start: w.start, end: w.end, minStaff: t.minStaff, staff, available, short: available < t.minStaff, graceOver: at - ms(w.start) > state.graceMinutes * 60_000 };
  };
  const ok = (date: string) => !opts.publishedOnly || published(date);
  const current = candidates.filter((c) => ok(c.date) && ms(c.w.start) <= at && at < ms(c.w.end)).map((c) => shiftOf(c.t, c.date, c.w));
  const upcoming = candidates.filter((c) => ok(c.date) && ms(c.w.start) > at);
  const firstStart = Math.min(...upcoming.map((c) => ms(c.w.start)));
  const next = upcoming.filter((c) => ms(c.w.start) === firstStart).map((c) => shiftOf(c.t, c.date, c.w));
  return { current, next };
}

export function onDutyBoard(h: Hr): OnDutyBoard {
  const { current, next } = onDutyShifts(h, { publishedOnly: false });
  return {
    siteId: h.site.siteId,
    siteName: h.site.name,
    at: h.now,
    published: weekStateOf(h.state, h.site.siteId, weekStartOf(h.today))?.state === 'published',
    current,
    next,
    graceMinutes: h.state.graceMinutes,
    actions: { record: holds(h, 'attendance.record'), cover: holds(h, 'shifts.manage') || holds(h, 'attendance.record') },
  };
}

export const roleCounts = <T extends { role: string }>(list: readonly T[]) => [...new Set(list.map((x) => x.role))].map((role) => ({ role, count: list.filter((x) => x.role === role).length }));
