import type { Money } from './money';

/**
 * Gate S.2a society staff operations (HR-001…011): employees and their employment, sites, shifts
 * and the duty roster, attendance, leave, documents, and staff advances and loans. One HR module
 * for both editions (`hr`, an optional add-on for societies; feature `hr.shifts` for the roster).
 * No payroll: salaries, pay runs and deductions are S.2b and are not modelled here. Everything is
 * fictional and stays in the browser.
 *
 * Times of a shift are instants with the site's offset ("2026-10-26T23:00:00+05:00"); a night shift
 * ends on the next calendar day. Business dates (a shift's date, leave days) are plain dates.
 */

export const HR_DEPARTMENTS = ['security', 'maintenance', 'housekeeping', 'office'] as const;
export type HrDepartment = (typeof HR_DEPARTMENTS)[number];

export const HR_ROLES = ['security_supervisor', 'security_guard', 'maintenance_supervisor', 'electrician', 'plumber', 'cleaner', 'gardener', 'building_manager', 'accounts_officer', 'office_assistant'] as const;
export type HrRole = (typeof HR_ROLES)[number];

export const ROLE_DEPARTMENT: Record<HrRole, HrDepartment> = {
  security_supervisor: 'security',
  security_guard: 'security',
  maintenance_supervisor: 'maintenance',
  electrician: 'maintenance',
  plumber: 'maintenance',
  cleaner: 'housekeeping',
  gardener: 'housekeeping',
  building_manager: 'office',
  accounts_officer: 'office',
  office_assistant: 'office',
};

export const EMPLOYMENT_TYPES = ['permanent', 'contract', 'daily_wage'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** Stored status; `upcoming` (start date ahead) is derived for reading only. */
export type EmploymentStatus = 'active' | 'suspended' | 'ended';
export type EmploymentView = EmploymentStatus | 'upcoming';

/** One entry in a record's history: who did what, when (the principal id makes maker-checker checkable). */
export interface HrEvent {
  at: string;
  by: string;
  byName: string;
  /** Key under `hr:history.*`. */
  action: string;
  /** Free text exactly as typed (never translated). */
  note?: string;
  values?: Record<string, string>;
}

export interface SiteAllocation {
  siteId: string;
  siteName: string;
  from: string;
  to?: string;
}

/** Where a staff member's duty stands now (or today), as the office sees it. */
export type DutyState = 'on_duty' | 'late' | 'absent' | 'on_leave' | 'scheduled' | 'done' | 'off';

export interface DutyNow {
  state: DutyState;
  shiftKey?: ShiftKey;
  start?: string;
  end?: string;
  post?: string;
}

export interface EmployeeRow {
  id: string;
  code: string;
  name: string;
  role: HrRole;
  department: HrDepartment;
  status: EmploymentView;
  employmentType: EmploymentType;
  sites: string[];
  startDate: string;
  endDate?: string;
  today: DutyNow;
  /** Required documents missing, expired or expiring within 30 days (a count, no detail). */
  documentsAttention: number;
}

export interface EmployeesList {
  items: EmployeeRow[];
  counts: Record<EmploymentView, number>;
  departments: Record<HrDepartment, number>;
  canCreate: boolean;
}

/** Personal details: only for `hr.manage` (never in the directory, never to residents). */
export interface EmployeePersonal {
  cnic: string;
  phone: string;
  address: string;
  dateOfBirth?: string;
  emergencyContact?: string;
}

export interface PublicProfile {
  /** The staff member agreed that residents may see what is chosen below (recorded by HR). */
  consent: boolean;
  consentAt?: string;
  recordedByName?: string;
  showName: boolean;
  showPhoto: boolean;
}

export interface EmploymentPeriod {
  from: string;
  to?: string;
  type: EmploymentType;
  endReason?: string;
}

export interface Employee360 {
  id: string;
  code: string;
  name: string;
  initials: string;
  role: HrRole;
  department: HrDepartment;
  status: EmploymentView;
  employmentType: EmploymentType;
  legalEntity: { id: string; name: string };
  startDate: string;
  endDate?: string;
  periods: EmploymentPeriod[];
  sites: SiteAllocation[];
  /** "35202-•••••••-1": enough to tell people apart, never the whole number without `hr.manage`. */
  cnicMasked: string;
  personal?: EmployeePersonal;
  hasSignIn: boolean;
  supervises: HrDepartment[];
  publicProfile: PublicProfile;
  /** The organisation's business date (dates in the forms default to it). */
  businessDate: string;
  today: DutyNow;
  upcoming: AssignmentView[];
  shiftHistory: AssignmentView[];
  attendance: { recent: AttendanceRow[]; summary: Record<'present' | 'late' | 'absent' | 'on_leave', number> };
  leave: { requests: LeaveRequestView[]; takenThisYear: Record<LeaveType, number> };
  documents: { required: HrDocumentKind[]; status: Array<{ kind: HrDocumentKind; status: DocumentStatus; expiresOn?: string }>; items?: HrDocumentView[] };
  /** Only with an advances permission. */
  advances?: StaffAdvanceView[];
  history: HrEvent[];
  actions: {
    edit: boolean;
    changeStatus: boolean;
    assign: boolean;
    recordAttendance: boolean;
    requestLeave: boolean;
    manageDocuments: boolean;
    viewAdvances: boolean;
    requestAdvance: boolean;
  };
}

export interface EmployeeInput {
  name: string;
  cnic: string;
  phone: string;
  address: string;
  dateOfBirth?: string;
  emergencyContact?: string;
  legalEntityId: string;
  siteId: string;
  role: HrRole;
  employmentType: EmploymentType;
  startDate: string;
}

export interface EmployeeOptions {
  legalEntities: Array<{ id: string; name: string }>;
  sites: Array<{ id: string; name: string; legalEntityId: string }>;
  roles: HrRole[];
  types: EmploymentType[];
  today: string;
}

// ---------------------------------------------------------------------------------------------
// Shifts and the duty roster (HR-010; HR-011 "On duty now" is its live state)
// ---------------------------------------------------------------------------------------------

export const SHIFT_KEYS = ['morning', 'evening', 'night', 'day'] as const;
export type ShiftKey = (typeof SHIFT_KEYS)[number];

export interface ShiftTemplate {
  id: string;
  siteId: string;
  key: ShiftKey;
  start: string;
  end: string;
  crossesMidnight: boolean;
  department: HrDepartment;
  /** The society's minimum on duty; below it the roster warns (it never refuses). */
  minStaff: number;
  posts: string[];
  /** Days of the week the shift runs (0 = Monday … 6 = Sunday); other days need no cover. */
  days: number[];
}

export interface AssignmentView {
  id: string;
  siteId: string;
  employeeId: string;
  employeeName: string;
  role: HrRole;
  templateId: string;
  shiftKey: ShiftKey;
  date: string;
  start: string;
  end: string;
  post?: string;
  /** This assignment covers for someone absent or swapped out. */
  coverFor?: { assignmentId: string; employeeName: string };
  attendance: AttendanceState;
  /** A leave request of the employee covers this duty (pending: a warning; approved: should be reassigned). */
  leave?: 'pending' | 'approved';
  /** The duty has begun by the organisation's clock (it can no longer be swapped or removed). */
  started: boolean;
}

export interface RosterShift {
  templateId: string;
  shiftKey: ShiftKey;
  start: string;
  end: string;
  department: HrDepartment;
  minStaff: number;
  /** The shift runs on this day of the week (otherwise "not scheduled", and no cover is expected). */
  runs: boolean;
  assignments: AssignmentView[];
  /** People expected on duty (not absent, not on leave) against the minimum. */
  coverage: { required: number; available: number; short: boolean };
}

export interface RosterWarning {
  kind: 'short_staffed' | 'leave_conflict' | 'approved_leave';
  date: string;
  shiftKey: ShiftKey;
  department: HrDepartment;
  /** When the shift ends (a past shortage is history, not something to act on). */
  end: string;
  employeeName?: string;
  required?: number;
  available?: number;
}

export interface RosterWeek {
  siteId: string;
  siteName: string;
  weekStart: string;
  today: string;
  days: Array<{ date: string; shifts: RosterShift[] }>;
  state: 'draft' | 'published';
  publishedAt?: string;
  publishedByName?: string;
  /** Changes made after the last publish (residents and staff still see the published version). */
  changesSincePublish: number;
  warnings: RosterWarning[];
  templates: ShiftTemplate[];
  sites: Array<{ id: string; name: string }>;
  actions: { edit: boolean; publish: boolean };
}

export interface AssignInput {
  employeeId: string;
  templateId: string;
  date: string;
  post?: string;
  coverFor?: string;
  /** The person asking saw the warning about a pending leave request and assigns anyway. */
  acknowledgeLeave?: boolean;
}

export interface Candidate {
  employeeId: string;
  name: string;
  role: HrRole;
  /** Why someone cannot take this duty (none = available). */
  blocked?: 'overlap' | 'on_leave' | 'not_at_site' | 'not_employed' | 'other_department';
  pendingLeave?: boolean;
  /** Hours since their previous duty ended (for fatigue, shown, not enforced). */
  restHours?: number;
}

export interface OnDutyStaff {
  assignmentId: string;
  employeeId: string;
  name: string;
  role: HrRole;
  post?: string;
  state: 'present' | 'late' | 'not_checked_in' | 'absent' | 'on_leave';
  checkInAt?: string;
  coverFor?: string;
  coveredBy?: string;
}

export interface OnDutyShift {
  templateId: string;
  shiftKey: ShiftKey;
  department: HrDepartment;
  date: string;
  start: string;
  end: string;
  minStaff: number;
  staff: OnDutyStaff[];
  /** On duty or expected (checked in, late, or not yet in within the grace period). */
  available: number;
  short: boolean;
  /** The grace period after the start is over (someone not in can now be marked absent). */
  graceOver: boolean;
}

export interface OnDutyBoard {
  siteId: string;
  siteName: string;
  at: string;
  published: boolean;
  current: OnDutyShift[];
  next: OnDutyShift[];
  graceMinutes: number;
  actions: { record: boolean; cover: boolean };
}

// ---------------------------------------------------------------------------------------------
// Attendance (HR-005) and corrections (HR-006)
// ---------------------------------------------------------------------------------------------

export type AttendanceState = 'planned' | 'present' | 'late' | 'absent' | 'on_leave';

export interface AttendanceRow {
  assignmentId: string;
  employeeId: string;
  employeeName: string;
  role: HrRole;
  department: HrDepartment;
  shiftKey: ShiftKey;
  /** By the organisation's clock: the duty has begun / is over. */
  started: boolean;
  ended: boolean;
  date: string;
  start: string;
  end: string;
  post?: string;
  state: AttendanceState;
  checkIn?: string;
  checkOut?: string;
  lateMinutes?: number;
  corrected: boolean;
  correctionPending: boolean;
  recordedByName?: string;
  actions: { checkIn: boolean; checkOut: boolean; markAbsent: boolean; correct: boolean };
}

export interface AttendanceDay {
  date: string;
  today: string;
  siteName: string;
  rows: AttendanceRow[];
  summary: Record<AttendanceState, number>;
  graceMinutes: number;
  canRecord: boolean;
}

export interface CorrectionValues {
  state: AttendanceState;
  checkIn?: string;
  checkOut?: string;
}

export interface AttendanceCorrectionView {
  id: string;
  ref: string;
  assignmentId: string;
  employeeId: string;
  employeeName: string;
  date: string;
  shiftKey: ShiftKey;
  before: CorrectionValues;
  after: CorrectionValues;
  reason: string;
  requestedByName: string;
  requestedAt: string;
  state: 'pending' | 'approved' | 'rejected';
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  /** Why the reader may not decide it: their own request, or their own attendance. */
  blocked?: 'own_request' | 'own_record';
  actions: { approve: boolean; reject: boolean };
  history: HrEvent[];
}

// ---------------------------------------------------------------------------------------------
// Leave (HR-006)
// ---------------------------------------------------------------------------------------------

export const LEAVE_TYPES = ['annual', 'sick', 'casual', 'unpaid'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export type LeaveState = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequestView {
  id: string;
  ref: string;
  employeeId: string;
  employeeName: string;
  type: LeaveType;
  from: string;
  to: string;
  days: number;
  reason: string;
  state: LeaveState;
  requestedByName: string;
  requestedAt: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  /** Duties on the roster inside the leave dates. */
  conflicts: Array<{ assignmentId: string; date: string; shiftKey: ShiftKey }>;
  blocked?: 'own_request' | 'own_record';
  actions: { approve: boolean; reject: boolean; cancel: boolean };
  history: HrEvent[];
}

export interface LeaveAndCorrections {
  leave: LeaveRequestView[];
  corrections: AttendanceCorrectionView[];
  counts: { leavePending: number; correctionsPending: number };
  /** Entitlements depend on a leave policy the society has not adopted: balances are not computed. */
  policy: { adopted: false };
  canRequestLeave: boolean;
  today: string;
}

export interface LeaveInput {
  employeeId: string;
  type: LeaveType;
  from: string;
  to: string;
  reason: string;
}

// ---------------------------------------------------------------------------------------------
// Documents (HR-009): fictional files and metadata only
// ---------------------------------------------------------------------------------------------

export const HR_DOCUMENT_KINDS = ['cnic', 'police_verification', 'appointment_letter', 'contract', 'medical_fitness', 'security_training', 'other'] as const;
export type HrDocumentKind = (typeof HR_DOCUMENT_KINDS)[number];
export type DocumentStatus = 'valid' | 'expiring' | 'expired' | 'missing';

export interface HrDocumentView {
  id: string;
  employeeId: string;
  kind: HrDocumentKind;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  /** Identity numbers are masked even here. */
  numberMasked?: string;
  issuedOn?: string;
  expiresOn?: string;
  status: DocumentStatus;
  version: number;
  uploadedByName: string;
  uploadedAt: string;
  history: HrEvent[];
}

export interface DocumentsOverview {
  rows: Array<{ employeeId: string; employeeName: string; role: HrRole; kind: HrDocumentKind; status: DocumentStatus; expiresOn?: string; documentId?: string; required: boolean }>;
  counts: Record<DocumentStatus, number>;
  /** Without `hr.documents.manage`, the status only: no file, number or history. */
  canManage: boolean;
}

export interface DocumentInput {
  employeeId: string;
  kind: HrDocumentKind;
  file: { name: string; type: string; sizeBytes: number };
  number?: string;
  issuedOn?: string;
  expiresOn?: string;
}

// ---------------------------------------------------------------------------------------------
// Advances and loans (HR-007) and their settlement (HR-008)
// ---------------------------------------------------------------------------------------------

export const ADVANCE_KINDS = ['advance', 'loan'] as const;
export type AdvanceKind = (typeof ADVANCE_KINDS)[number];

/**
 * `approved` is an approved instruction: nothing has been paid. Only a posted S.1 payment voucher
 * linked as evidence makes it `disbursed`; only posted receipts linked as evidence reduce what is
 * owed, until `repaid`. Payroll deduction does not exist (S.2b).
 */
export type AdvanceState = 'submitted' | 'approved' | 'disbursed' | 'repaid' | 'rejected' | 'withdrawn';

export interface SettlementLink {
  voucherId: string;
  voucherRef: string;
  accountName: string;
  postedOn: string;
  amount: Money;
  linkedByName: string;
  linkedAt: string;
}

export interface StaffAdvanceView {
  id: string;
  ref: string;
  employeeId: string;
  employeeName: string;
  kind: AdvanceKind;
  amount: Money;
  reason: string;
  instalments: number;
  /** A planned repayment schedule: an instruction, never a deduction or a receipt. */
  schedule: Array<{ n: number; month: string; amount: Money; state: 'planned' | 'received' }>;
  state: AdvanceState;
  requestedByName: string;
  requestedAt: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
  evidence: Array<{ name: string; type: string; sizeBytes: number }>;
  disbursement?: SettlementLink;
  repayments: SettlementLink[];
  /** What the staff member owes now: zero until a disbursement is evidenced. */
  outstanding: Money;
  blocked?: 'own_request' | 'own_record';
  actions: { approve: boolean; reject: boolean; withdraw: boolean; linkDisbursement: boolean; linkRepayment: boolean };
  history: HrEvent[];
}

export interface AdvancesList {
  items: StaffAdvanceView[];
  counts: Record<AdvanceState, number>;
  totals: { approvedNotPaid: Money; outstanding: Money };
  canRequest: boolean;
  canApprove: boolean;
  /** Active staff to raise a request for (names and roles only), when the reader may request. */
  staff: Array<{ id: string; name: string; role: HrRole }>;
  today: string;
}

export interface AdvanceInput {
  employeeId: string;
  kind: AdvanceKind;
  amount: string;
  reason: string;
  instalments: number;
  firstMonth: string;
  evidence: Array<{ name: string; type: string; sizeBytes: number }>;
}

/** Posted S.1 vouchers that could evidence a disbursement (payments) or a repayment (receipts). */
export interface SettlementCandidates {
  advanceId: string;
  purpose: 'disbursement' | 'repayment';
  expected: Money;
  vouchers: Array<{ id: string; ref: string; accountName: string; postedOn: string; amount: Money; description: string; eligible: boolean; reason?: 'amount' | 'date' | 'used' | 'direction' }>;
}

// ---------------------------------------------------------------------------------------------
// HR dashboard (HR-001)
// ---------------------------------------------------------------------------------------------

export interface HrDashboard {
  siteName: string;
  today: string;
  at: string;
  kpis: {
    activeStaff: number;
    onDutyNow: number;
    absentToday: number;
    shortShifts: number;
    leavePending: number;
    correctionsPending: number;
    documentsAttention: number;
    /** Only with an advances permission. */
    advancesAwaiting?: number;
  };
  shifts: OnDutyShift[];
  attention: Array<{ kind: 'short_staffed' | 'absent' | 'leave_conflict' | 'document' | 'roster_draft' | 'correction' | 'leave'; values: Record<string, string>; href: string }>;
  rosterState: 'draft' | 'published';
  canSee: { roster: boolean; documents: boolean; advances: boolean };
}

// ---------------------------------------------------------------------------------------------
// Residents: staff on duty (PORTAL-036 "Staff on duty" tab)
// ---------------------------------------------------------------------------------------------

/**
 * What a resident may see: the duty role, the post, and until when; a name or initials only where
 * the staff member consented and the society publishes profiles. Never a phone number, identity
 * details, pay, advances, attendance history, address or documents.
 */
export interface ResidentStaffOnDuty {
  siteName: string;
  at: string;
  onDuty: Array<{ role: HrRole; post?: string; until: string; name?: string; initials?: string }>;
  next: Array<{ role: HrRole; startsAt: string; count: number }>;
}
