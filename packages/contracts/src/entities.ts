import type { Money } from './money';

/**
 * Prototype entity shapes for Stage 1. Statuses mirror blueprint 01 §9 exactly and are stored as
 * codes; labels come from the `status` translation namespace. Fixtures display these states;
 * they do not implement transitions (the backend owns state machines).
 */

export interface Tenant {
  id: string;
  name: string;
}

export type ProjectKind = 'towers' | 'plots' | 'commercial';

export interface Project {
  id: string;
  ref: string;
  name: string;
  city: string;
  kind: ProjectKind;
  /** The licensed site the project is on: site-scoped modules are granted per site (V3.1). */
  siteId: string;
  /** The legal entity that sells and invoices for it (D-5: no cross-entity links). */
  legalEntityId: string;
}

export interface Tower {
  id: string;
  projectId: string;
  name: string;
  floorCount: number;
}

export interface Floor {
  id: string;
  towerId: string;
  level: number;
}

export const UNIT_STATUSES = [
  'draft',
  'available',
  'held',
  'reserved',
  'booked',
  'allocated',
  'handover_ready',
  'handed_over',
  'occupied',
  'blocked',
  'disputed',
  'withdrawn',
] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export type UnitType =
  | 'apartment_1bed'
  | 'apartment_2bed'
  | 'apartment_3bed'
  | 'penthouse'
  | 'villa'
  | 'plot'
  | 'shop';

export interface Unit {
  id: string;
  ref: string;
  projectId: string;
  towerId?: string;
  floorId?: string;
  /** Phase/block label for projects without towers. */
  block?: string;
  type: UnitType;
  areaSqft: number;
  price: Money;
  status: UnitStatus;
}

export type PartyKind = 'individual' | 'company';

export interface Party {
  id: string;
  ref: string;
  kind: PartyKind;
  /** As entered; may be Latin or Urdu script. */
  displayName: string;
  phone: string;
  email: string;
  cnic?: string;
  city: string;
}

export const LEAD_STATUSES = [
  'new',
  'assigned',
  'contacted',
  'qualified',
  'converted',
  'dormant',
  'lost',
  'unqualified',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = ['website', 'walk_in', 'referral', 'social', 'broker', 'phone'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface Lead {
  id: string;
  ref: string;
  partyId: string;
  projectId: string;
  status: LeadStatus;
  source: LeadSource;
  ownerPersonaId: string;
  budget: Money;
  createdAt: string;
  nextFollowUp?: string;
}

export type InvoiceIssuance = 'draft' | 'issued' | 'cancelled';
export type InvoiceSettlement = 'unpaid' | 'partially_paid' | 'paid';
/** Manual proof lifecycle (05 §Manual proof). Evidence never marks an invoice paid by itself. */
export type EvidenceStatus = 'none' | 'submitted' | 'under_review' | 'needs_information' | 'rejected' | 'verified';

export interface Invoice {
  id: string;
  ref: string;
  partyId: string;
  unitId: string;
  projectId: string;
  /** The account liable for the invoice (A2 §4.4); residents reach it only through a verified link. */
  billingAccountId: string;
  kind: 'installment' | 'down_payment' | 'maintenance' | 'parking';
  total: Money;
  paid: Money;
  dueDate: string;
  issuance: InvoiceIssuance;
  settlement: InvoiceSettlement;
  evidence: EvidenceStatus;
}

export interface AppNotification {
  id: string;
  /** Translation key + params; notifications are system text, so they translate. */
  titleKey: string;
  bodyKey: string;
  params: Record<string, string>;
  createdAt: string;
  read: boolean;
  href: string;
  /** Permission needed to receive it (demo persona scoping). */
  audience: string;
}

export interface ActivityEvent {
  id: string;
  at: string;
  actorName: string;
  /** Translation key describing what happened. */
  messageKey: string;
  params: Record<string, string>;
  kind: 'note' | 'call' | 'visit' | 'status' | 'document' | 'payment' | 'system';
}

/** One row of the read-only invoice history (FIN-002, financial history: readable while suspended). */
export interface InvoiceHistoryItem {
  id: string;
  ref: string;
  kind: Invoice['kind'];
  partyName: string;
  unitRef: string;
  projectName: string;
  total: Money;
  paid: Money;
  dueDate: string;
  settlement: InvoiceSettlement;
}

export interface InvoiceHistoryResponse {
  items: InvoiceHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Sums over every matching invoice (not only this page). */
  totals: { billed: Money; collected: Money; outstanding: Money };
}
