import { LOST_REASONS, type Lead, type LostReason, type OpenStage, type OpportunityEventKind, type OpportunityStage, type SiteVisitInterest, type SiteVisitOutcome } from '@repo/contracts';
import type { HandlerContext } from '../../handler-types';
import { FIXTURE_NOW } from '../../seed';
import { staffOf } from './scope';

/**
 * Gate E.1: the CRM pipeline's own state, a versioned section of the tenant's demo partition
 * (`dev.crm.pipeline`), reset by `/demo/reset` with the rest of the session. It holds opportunities and
 * their timelines, lead reassignment history, what was recorded at each site visit, and the bound
 * idempotency keys of conversions. Leads and visits themselves stay in the existing CRM overlay: a
 * reassignment patches the lead's owner there, a reschedule or an outcome patches the visit, so every
 * existing screen (Sales home, Lead 360) shows the change at once.
 *
 * Replace with E.0's developer state (`developer/state.ts`) at Wave 1 integration.
 */

export const PIPELINE_SECTION = 'dev.crm.pipeline';
export const PIPELINE_VERSION = 1;

export interface StoredEvent {
  id: string;
  at: string;
  kind: OpportunityEventKind;
  /** Principal who acted (audit compares principals, never names). */
  by: string;
  byName: string;
  from?: string;
  to?: string;
  /** Principals of a reassignment (projected away for readers who see only their own records). */
  fromPrincipal?: string;
  toPrincipal?: string;
  reason?: string;
  note?: string;
  visitId?: string;
  /** Unit ids shown during a visit (projected to the units the reader may see). */
  units?: string[];
}

export interface StoredOpportunity {
  id: string;
  ref: string;
  leadId: string;
  projectId: string;
  stage: OpportunityStage;
  lostFrom?: OpenStage;
  lostReason?: LostReason;
  lostNote?: string;
  expectedCloseOn?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  version: number;
  /** Newest first. */
  events: StoredEvent[];
}

export interface StoredAssignment {
  id: string;
  at: string;
  by: string;
  byName: string;
  from?: string;
  fromName?: string;
  to: string;
  toName: string;
  reason: string;
}

export interface StoredVisitEvent {
  id: string;
  at: string;
  kind: 'confirmed' | 'rescheduled' | 'outcome' | 'follow_up';
  by: string;
  byName: string;
  from?: string;
  to?: string;
  reason?: string;
  outcome?: SiteVisitOutcome;
}

export interface StoredVisitDetail {
  version: number;
  outcome?: { outcome: SiteVisitOutcome; interest?: SiteVisitInterest; feedback?: string; at: string; by: string; byName: string };
  unitsShown: string[];
  followUpAt?: string;
  /** Newest first. */
  history: StoredVisitEvent[];
}

/** A conversion's key, bound to the operation, the principal, the target lead and the normalised input. */
export interface IdemEntry {
  op: string;
  principal: string;
  target: string;
  fp: string;
  id: string;
}

export interface PipelineState {
  version: typeof PIPELINE_VERSION;
  seq: number;
  opportunities: StoredOpportunity[];
  /** Lead id → reassignments, newest first. */
  assignments: Record<string, StoredAssignment[]>;
  /** Visit id → what was recorded. */
  visits: Record<string, StoredVisitDetail>;
  idempotency: Record<string, IdemEntry>;
}

/** An opportunity's id and reference follow its lead's (one opportunity per lead). */
export const opportunityIdFor = (leadId: string) => `opp_${leadId.replace(/^led_/, '')}`;
export const opportunityRefFor = (leadRef: string) => (leadRef.includes('LD') ? leadRef.replace('LD', 'OP') : `OP-${leadRef}`);

const DAY = 86_400_000;
const SEED_STAGES: readonly OpportunityStage[] = ['qualified', 'visit', 'quotation', 'negotiation', 'reservation', 'lost'];
const SEED_REASONS: readonly LostReason[] = LOST_REASONS.filter((r) => r !== 'other');
const PATH: Record<OpportunityStage, readonly OpportunityStage[]> = {
  qualified: [],
  visit: ['visit'],
  quotation: ['visit', 'quotation'],
  negotiation: ['visit', 'quotation', 'negotiation'],
  reservation: ['visit', 'quotation', 'negotiation', 'reservation'],
  won: [],
  lost: ['visit', 'quotation', 'negotiation'],
};

const plusDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * Deterministic opportunities for the tenant's own qualified fixture leads: three of every four have
 * one, spread over the open stages (and some lost, with a reason); the rest are left to convert. No
 * opportunity is won (that needs a booking). Fictional history, labelled as demo data on the screens.
 */
function seed(ctx: HandlerContext): PipelineState {
  const staff = staffOf(ctx);
  const now = FIXTURE_NOW.getTime();
  const qualified = ctx.data.leads.filter((l) => l.status === 'qualified').sort((a, b) => a.id.localeCompare(b.id));
  const opportunities: StoredOpportunity[] = [];
  qualified.forEach((lead: Lead, i) => {
    if (i % 4 === 3) return;
    const stage = SEED_STAGES[i % SEED_STAGES.length]!;
    const owner = staff.find((p) => p.id === lead.ownerPersonaId);
    const by = owner?.principalId ?? '';
    const byName = owner?.displayName ?? '';
    const created = Date.parse(lead.createdAt);
    const start = created + Math.min(2 * DAY, (now - created) / 2);
    const steps = PATH[stage].length;
    const step = Math.min(DAY, (now - start) / (steps + 2));
    const at = (k: number) => new Date(start + k * step).toISOString();
    const id = opportunityIdFor(lead.id);
    const events: StoredEvent[] = [{ id: `${id}_e0`, at: at(0), kind: 'converted', by, byName, to: 'qualified' }];
    let previous: OpportunityStage = 'qualified';
    PATH[stage].forEach((s, k) => {
      events.unshift({ id: `${id}_e${k + 1}`, at: at(k + 1), kind: 'stage', by, byName, from: previous, to: s });
      previous = s;
    });
    const lost = stage === 'lost';
    const reason = SEED_REASONS[i % SEED_REASONS.length]!;
    if (lost) events.unshift({ id: `${id}_e9`, at: at(steps + 1), kind: 'lost', by, byName, from: previous, to: 'lost', reason });
    opportunities.push({
      id,
      ref: opportunityRefFor(lead.ref),
      leadId: lead.id,
      projectId: lead.projectId,
      stage,
      ...(lost ? { lostFrom: 'negotiation' as const, lostReason: reason } : {}),
      expectedCloseOn: plusDays(ctx.at, 14 + ((i * 9) % 60)),
      createdAt: at(0),
      updatedAt: events[0]!.at,
      createdBy: by,
      version: 1,
      events,
    });
  });
  return { version: PIPELINE_VERSION, seq: 0, opportunities, assignments: {}, visits: {}, idempotency: {} };
}

/** The tenant's pipeline state (seeded on first use; a section of another version starts again). */
export function pipelineState(ctx: HandlerContext): PipelineState {
  const s = ctx.demo.section<PipelineState>(PIPELINE_SECTION, () => seed(ctx));
  if (s.version === PIPELINE_VERSION) return s;
  ctx.demo.resetSection(PIPELINE_SECTION);
  return ctx.demo.section<PipelineState>(PIPELINE_SECTION, () => seed(ctx));
}

/** A new id within this section (only ever called after every check passed). */
export function nextId(s: PipelineState, prefix: string): string {
  s.seq += 1;
  return `${prefix}_e1_${s.seq}`;
}
