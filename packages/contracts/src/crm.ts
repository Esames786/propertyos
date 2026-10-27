import type { ActivityEvent, Lead, LeadSource, LeadStatus, Party, Project, UnitStatus, UnitType } from './entities';
import type { Money } from './money';

/**
 * Sales / CRM read models for Stage 1.5R (Sales home, lead list, lead workspace, unit quick view).
 * Shapes mirror what the backend will return; fixtures build them from the demo store.
 */

/** Pipeline columns shown on Sales home. Blueprint lead statuses roll up into these stages. */
export const PIPELINE_STAGES = ['new', 'contacted', 'qualified', 'converted', 'closed'] as const;
export type PipelineStageId = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STATUSES: Record<PipelineStageId, readonly LeadStatus[]> = {
  new: ['new', 'assigned'],
  contacted: ['contacted'],
  qualified: ['qualified'],
  converted: ['converted'],
  closed: ['dormant', 'lost', 'unqualified'],
};

export interface PipelineStage {
  id: PipelineStageId;
  count: number;
  /** Sum of lead budgets in the stage. */
  value: Money;
}

export interface LeadListItem {
  id: string;
  ref: string;
  status: LeadStatus;
  source: LeadSource;
  projectId: string;
  projectName: string;
  partyId: string;
  displayName: string;
  phone: string;
  budget: Money;
  ownerName: string;
  createdAt: string;
  nextFollowUp?: string;
  interestUnitRef?: string;
  /** Created in this demo session (shown with a "New" marker). */
  createdInSession?: boolean;
  /** Created in practice mode (training store); never mixed with normal records silently. */
  practice?: boolean;
}

export const LEAD_SORTS = ['recent', 'followUp', 'budget', 'name'] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

export interface LeadListQuery {
  q?: string;
  status?: PipelineStageId | 'all';
  project?: string;
  sort?: LeadSort;
  page?: number;
}

export interface LeadListResponse {
  items: LeadListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Counts per pipeline stage for the filter pills (after search and project filters). */
  counts: Record<PipelineStageId | 'all', number>;
}

export type VisitStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface SiteVisit {
  id: string;
  leadId: string;
  leadRef: string;
  displayName: string;
  phone: string;
  projectId: string;
  projectName: string;
  unitRef?: string;
  at: string;
  status: VisitStatus;
  ownerName: string;
}

export interface FollowUp {
  leadId: string;
  leadRef: string;
  displayName: string;
  phone: string;
  projectName: string;
  dueAt: string;
  overdue: boolean;
  status: LeadStatus;
}

export interface SalesKpis {
  newLeads: { value: number; previous: number };
  followUpsDue: { value: number; overdue: number };
  visitsThisWeek: { value: number; confirmed: number };
  bookingsThisMonth: { value: number; amount: Money };
}

export interface SalesSummary {
  asOf: string;
  kpis: SalesKpis;
  pipeline: PipelineStage[];
  followUps: FollowUp[];
  visits: SiteVisit[];
  recentLeads: LeadListItem[];
}

export interface UnitSummary {
  id: string;
  ref: string;
  projectId: string;
  projectName: string;
  towerName?: string;
  floor?: number;
  block?: string;
  type: UnitType;
  areaSqft: number;
  price: Money;
  status: UnitStatus;
  /** Present when the unit is held in this demo session. */
  hold?: { leadRef: string; until: string };
}

export interface UnitDetail extends UnitSummary {
  plan: { downPaymentPercent: number; installments: number; perInstallment: Money; downPayment: Money };
  imageKey: 'heights-dusk' | 'gardens-residences' | 'interior-living-bright';
}

export interface LeadDetail {
  lead: Lead & { createdInSession?: boolean };
  party: Party;
  project: Project;
  ownerName: string;
  interestUnit: UnitSummary | null;
  activity: ActivityEvent[];
  visits: SiteVisit[];
  /** Available units in the lead's project within ±15 % of budget. */
  matchedUnits: UnitSummary[];
}

export interface CreateLeadInput {
  fullName: string;
  phone: string;
  email?: string;
  projectId: string;
  unitId?: string;
  budget?: string;
  source: LeadSource;
  notes?: string;
}

export type ActivityInputKind = 'call' | 'whatsapp' | 'note';

export interface LogActivityInput {
  kind: ActivityInputKind;
  note?: string;
  outcome?: 'answered' | 'no_answer' | 'callback';
}

export interface ScheduleVisitInput {
  leadId: string;
  at: string;
  unitId?: string;
}
