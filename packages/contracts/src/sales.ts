import type { VisitStatus } from './crm';
import type { LeadSource, LeadStatus, UnitType } from './entities';
import type { Money } from './money';

/**
 * Gate E.1 (CRM pipeline and visits): opportunities, lead assignment, the site-visit calendar and the
 * visit workspace (CRM-006…009, CRM-011). Read models are projected by the reader's scope on the
 * server before they are serialised (plan §4.4); nothing here is a booking, a hold, a quotation or a
 * payment. Provisional until Gate E.0 is accepted (wave 1).
 */

/**
 * Opportunity stages (V2.1 01 §9: qualified → visit → quotation → negotiation → hold/reservation →
 * won | lost). A stage records where the sales conversation is: moving a card never creates a
 * quotation, hold, reservation or booking. `won` needs a booking (Gate E.5) and cannot be set yet.
 */
export const OPPORTUNITY_STAGES = ['qualified', 'visit', 'quotation', 'negotiation', 'reservation', 'won', 'lost'] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

/** Stages an opportunity can be moved between by hand (the board's open columns). */
export const OPEN_STAGES = ['qualified', 'visit', 'quotation', 'negotiation', 'reservation'] as const;
export type OpenStage = (typeof OPEN_STAGES)[number];

export const LOST_REASONS = ['price', 'payment_plan', 'location', 'competitor', 'timing', 'not_reachable', 'other'] as const;
export type LostReason = (typeof LOST_REASONS)[number];

/** A person who can own leads, opportunities and visits (staff of the reader's own organisation). */
export interface SalesPerson {
  principalId: string;
  name: string;
}

export interface Opportunity {
  id: string;
  ref: string;
  leadId: string;
  leadRef: string;
  displayName: string;
  phone: string;
  projectId: string;
  projectName: string;
  stage: OpportunityStage;
  /** The lead's budget: the expected value of the sale (not money received). */
  value: Money;
  owner: SalesPerson;
  expectedCloseOn?: string;
  createdAt: string;
  updatedAt: string;
  /** Record version: a change names the version it was made on (a stale one is refused). */
  version: number;
  lostReason?: LostReason;
  /** The next scheduled or confirmed visit of the lead. */
  nextVisitAt?: string;
  nextFollowUp?: string;
}

export const OPPORTUNITY_SORTS = ['updated', 'value', 'close', 'name'] as const;
export type OpportunitySort = (typeof OPPORTUNITY_SORTS)[number];

export interface OpportunityQuery {
  q?: string;
  stage?: OpportunityStage | 'all' | 'open';
  project?: string;
  owner?: string;
  lead?: string;
  sort?: OpportunitySort;
  page?: number;
  /** `board`: every matching opportunity, unpaged (the Kanban board). */
  view?: 'board' | 'list';
}

export interface StageSummary {
  stage: OpportunityStage;
  count: number;
  value: Money;
}

export interface OpportunityList {
  items: Opportunity[];
  total: number;
  page: number;
  pageSize: number;
  /**
   * Count and expected value per stage after the search, project and owner filters: each count is
   * exactly the length of the list that stage filter returns (counts equal lists).
   */
  stages: StageSummary[];
  owners: SalesPerson[];
  projects: Array<{ id: string; name: string }>;
  /** The reader may move, lose and reopen opportunities (`lead.manage`) and convert qualified leads. */
  canManage: boolean;
  /** The reader assigns leads and sees every record of their projects (`lead.assign`, decision E-05). */
  canAssign: boolean;
  /** `assigned`: only records assigned to the reader are listed (E-05 default for salespeople). */
  scope: 'project' | 'assigned';
}

export const OPPORTUNITY_EVENT_KINDS = ['converted', 'stage', 'lost', 'reopened', 'assigned', 'visit_outcome', 'visit_rescheduled', 'follow_up'] as const;
export type OpportunityEventKind = (typeof OPPORTUNITY_EVENT_KINDS)[number];

/** One entry of an opportunity's timeline, projected for the reader. */
export interface OpportunityEvent {
  id: string;
  at: string;
  kind: OpportunityEventKind;
  actorName?: string;
  from?: string;
  to?: string;
  reason?: string;
  note?: string;
  visitId?: string;
  /** Unit references shown during a visit (only units the reader may see). */
  units?: string[];
  /** Names and reasons were removed for this reader (plan §4.4); the action and time are kept. */
  sanitised?: boolean;
}

export interface OpportunityDetail {
  opportunity: Opportunity;
  lead: { id: string; ref: string; status: LeadStatus; source: LeadSource; nextFollowUp?: string };
  party: { displayName: string; phone: string; email?: string };
  interestUnit: { id: string; ref: string } | null;
  visits: CalendarVisit[];
  timeline: OpportunityEvent[];
  lostNote?: string;
  /** What this reader may do now (the server checks again on every request). */
  allowed: { move: OpenStage[]; lose: boolean; reopen: boolean; reassign: boolean; scheduleVisit: boolean };
}

/** Convert a qualified lead (POST /leads/:id/opportunities, request-bound idempotency). */
export interface ConvertLeadInput {
  note?: string;
  expectedCloseOn?: string;
}

export interface StageMoveInput {
  stage: OpportunityStage;
  version: number;
  note?: string;
}

export interface LoseInput {
  reason: LostReason;
  note?: string;
  version: number;
}

export interface ReopenInput {
  note: string;
  version: number;
}

/** Lead assignment (CRM-006): one or more leads to one person, with a reason. */
export interface AssignmentInput {
  leadIds: string[];
  assigneeId: string;
  reason: string;
}

export interface AssignmentResult {
  assigned: number;
  assignee: SalesPerson;
}

/** One reassignment of a lead, projected for the reader. */
export interface AssignmentEvent {
  id: string;
  at: string;
  actorName?: string;
  fromName?: string;
  toName?: string;
  reason?: string;
  /** For a reader who sees only their own records: whether the lead came to or left them. */
  mine?: 'to_me' | 'from_me';
  sanitised?: boolean;
}

export interface AssignmentLead {
  id: string;
  ref: string;
  displayName: string;
  phone: string;
  projectId: string;
  projectName: string;
  status: LeadStatus;
  source: LeadSource;
  owner: SalesPerson;
  budget: Money;
  createdAt: string;
  nextFollowUp?: string;
  overdue: boolean;
  opportunityId?: string;
}

export const ASSIGNMENT_FILTERS = ['all', 'new', 'overdue', 'no_follow_up', 'qualified'] as const;
export type AssignmentFilter = (typeof ASSIGNMENT_FILTERS)[number];

export interface AssignmentList {
  items: AssignmentLead[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<AssignmentFilter, number>;
  owners: SalesPerson[];
  projects: Array<{ id: string; name: string }>;
  sources: LeadSource[];
  canAssign: boolean;
  scope: 'project' | 'assigned';
}

/** People a lead (or every lead of a selection) may be assigned to: they hold its project. */
export interface AssigneeOption extends SalesPerson {
  roleKey: string;
  /** Leads of the selection this person already owns. */
  owns: number;
}

/** Site-visit calendar request (CRM-009): a date range of at most 42 days. */
export interface CalendarQuery {
  from: string;
  to: string;
  owner?: string;
  project?: string;
  status?: VisitStatus | 'all' | 'upcoming';
  q?: string;
}

export interface CalendarVisit {
  id: string;
  leadId: string;
  leadRef: string;
  displayName: string;
  projectId: string;
  projectName: string;
  at: string;
  status: VisitStatus;
  host: SalesPerson;
  unitRef?: string;
  opportunityId?: string;
  outcomeRecorded: boolean;
}

export interface VisitCalendar {
  from: string;
  to: string;
  today: string;
  items: CalendarVisit[];
  counts: Record<VisitStatus | 'all', number>;
  owners: SalesPerson[];
  projects: Array<{ id: string; name: string }>;
  canSchedule: boolean;
  scope: 'project' | 'assigned';
}

export const SITE_VISIT_OUTCOMES = ['completed', 'no_show', 'cancelled'] as const;
export type SiteVisitOutcome = (typeof SITE_VISIT_OUTCOMES)[number];
export const SITE_VISIT_INTEREST = ['hot', 'warm', 'cold'] as const;
export type SiteVisitInterest = (typeof SITE_VISIT_INTEREST)[number];

export interface VisitEvent {
  id: string;
  at: string;
  kind: 'booked' | 'confirmed' | 'rescheduled' | 'outcome' | 'follow_up';
  actorName?: string;
  from?: string;
  to?: string;
  reason?: string;
  outcome?: SiteVisitOutcome;
}

export interface ShownUnit {
  id: string;
  ref: string;
  type: UnitType;
  price: Money;
}

export interface VisitDetail {
  visit: CalendarVisit & { version: number };
  lead: { id: string; ref: string; status: LeadStatus; nextFollowUp?: string };
  party: { displayName: string; phone: string };
  opportunity: { id: string; ref: string; stage: OpportunityStage } | null;
  outcome: { outcome: SiteVisitOutcome; interest?: SiteVisitInterest; feedback?: string; recordedAt: string; recordedBy: string } | null;
  /** Units shown during the visit that the reader may see (inventory licensed on the site). */
  unitsShown: ShownUnit[];
  followUpAt?: string;
  history: VisitEvent[];
  allowed: { reschedule: boolean; outcome: boolean; confirm: boolean };
}

export interface RescheduleInput {
  at: string;
  reason: string;
  version: number;
}

export interface SiteVisitOutcomeInput {
  outcome: SiteVisitOutcome;
  interest?: SiteVisitInterest;
  feedback?: string;
  unitsShown?: string[];
  followUpAt?: string;
  version: number;
}
