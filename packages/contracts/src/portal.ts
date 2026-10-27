import type { ProjectMilestone } from './dashboard';
import type { EvidenceStatus, UnitType } from './entities';
import type { Money } from './money';

/**
 * Customer portal read models (Stage 1.5R, PORTAL-001 … PORTAL-015). The signed-in owner sees only
 * their own property, plan, receipts and requests. Money is always a 2-decimal string.
 *
 * Payment rule (blueprint 05): uploading proof, or the labelled "pay online" simulation, moves an
 * instalment to `awaiting_verification` (evidence `submitted`). Only Finance verification makes it
 * `paid`, and that never happens in the prototype.
 */

export const INSTALMENT_STATUSES = ['paid', 'due', 'overdue', 'awaiting_verification', 'needs_information', 'upcoming'] as const;
export type InstalmentStatus = (typeof INSTALMENT_STATUSES)[number];

/** Statuses the owner can act on (pay, upload or upload again). */
export const PAYABLE_INSTALMENT_STATUSES: readonly InstalmentStatus[] = ['due', 'overdue', 'needs_information', 'upcoming'];

export const PAYMENT_METHODS = ['bank_transfer', 'cheque', 'cash_deposit', 'online_simulated'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PortalOwner {
  partyId: string;
  customerRef: string;
  displayName: string;
  phone: string;
  email: string;
}

export interface PortalProperty {
  unitId: string;
  unitRef: string;
  projectId: string;
  projectName: string;
  city: string;
  towerName?: string;
  floor?: number;
  type: UnitType;
  areaSqft: number;
  price: Money;
  /** Asset registry key of the illustrative photograph. */
  imageKey: string;
  /** Calendar date the booking was confirmed. */
  bookedOn: string;
  /** Calendar date possession was handed over (post-possession instalments continue). */
  possessionOn?: string;
}

/** The proof (or simulated online payment) the owner sent for an instalment. */
export interface PaymentProof {
  submittedAt: string;
  method: PaymentMethod;
  amount: Money;
  /** Bank / transaction reference as typed by the owner (Latin data). */
  reference: string;
  /** Calendar date the owner says the money was sent. */
  paidOn: string;
  fileName?: string;
  /** True for the "pay online" simulation: no gateway was contacted. */
  simulated: boolean;
}

export interface InstalmentItem {
  id: string;
  ref: string;
  /** 0 = down payment, then 1 … `of`. */
  number: number;
  of: number;
  kind: 'down_payment' | 'instalment';
  /** Calendar date. */
  dueDate: string;
  amount: Money;
  status: InstalmentStatus;
  evidence: EvidenceStatus;
  /** Set once Finance verified the payment (fixtures only). */
  receiptId?: string;
  paidOn?: string;
  method?: PaymentMethod;
  proof?: PaymentProof;
  /** Finance's request when status is `needs_information` (translation key in `portal:`). */
  financeNoteKey?: string;
  /** Changed in this demo session (proof uploaded or simulated payment). */
  changedInSession?: boolean;
}

export interface PlanSummary {
  totalPrice: Money;
  paidToDate: Money;
  /** Total price minus verified payments (includes amounts not yet due). */
  outstanding: Money;
  overdue: Money;
  awaitingVerification: Money;
  paidCount: number;
  /** Number of monthly instalments in the plan (excludes the down payment). */
  instalmentCount: number;
  /** 0..1 share of the price verified as paid. */
  paidShare: number;
}

export interface PortalReceipt {
  id: string;
  ref: string;
  instalmentId: string;
  instalmentNumber: number;
  of: number;
  kind: InstalmentItem['kind'];
  /** Calendar date of the instalment the payment settled. */
  period: string;
  amount: Money;
  /** Instant Finance verified the payment. */
  verifiedAt: string;
  paidOn: string;
  method: PaymentMethod;
  bankReference: string;
}

export interface ReceiptDetail extends PortalReceipt {
  owner: PortalOwner;
  property: PortalProperty;
  verifiedBy: string;
}

export interface PortalConstructionUpdate {
  id: string;
  /** Translation keys in `portal:` + params (site reports are system text in this prototype). */
  titleKey: string;
  bodyKey: string;
  params: Record<string, string>;
  imageKey?: string;
  at: string;
  /** Milestone the update belongs to. */
  milestone: ProjectMilestone['key'];
}

export interface PortalConstruction {
  projectId: string;
  projectName: string;
  /** 0..1 */
  progress: number;
  /** Calendar date of planned project completion. */
  completion: string;
  milestones: ProjectMilestone[];
  updates: PortalConstructionUpdate[];
}

export const DOCUMENT_KINDS = ['allotment_letter', 'payment_plan', 'booking_form', 'account_statement', 'construction_report', 'possession_letter'] as const;
export type PortalDocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface PortalDocument {
  id: string;
  ref: string;
  kind: PortalDocumentKind;
  issuedAt: string;
  pages: number;
  sizeKb: number;
  /** Issued in the last 30 days. */
  isNew: boolean;
}

export const SERVICE_CATEGORIES = ['plumbing', 'electrical', 'carpentry', 'air_conditioning', 'cleaning', 'other'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];
export type ServiceRequestStatus = 'submitted' | 'scheduled' | 'in_progress' | 'resolved';

export interface ServiceRequest {
  id: string;
  ref: string;
  category: ServiceCategory;
  /** Free text as typed by the owner (never translated). */
  description: string;
  /** Calendar date the owner prefers. */
  preferredDate?: string;
  status: ServiceRequestStatus;
  createdAt: string;
  /** Visit booked by the facilities team. */
  visitAt?: string;
  technician?: { name: string; phone: string };
  createdInSession?: boolean;
}

export const VISITOR_PURPOSES = ['guest', 'family', 'delivery', 'contractor'] as const;
export type VisitorPurpose = (typeof VISITOR_PURPOSES)[number];
export type VisitorPassStatus = 'active' | 'used' | 'expired';

export interface VisitorPass {
  id: string;
  ref: string;
  /** Code shown at the gate (Latin data). */
  code: string;
  visitorName: string;
  phone?: string;
  purpose: VisitorPurpose;
  /** Calendar date of the visit. */
  visitDate: string;
  status: VisitorPassStatus;
  createdAt: string;
  createdInSession?: boolean;
}

export interface CollectionAccount {
  bankName: string;
  accountTitle: string;
  iban: string;
}

export interface PortalHome {
  asOf: string;
  owner: PortalOwner;
  property: PortalProperty;
  plan: PlanSummary;
  /** First instalment that is not paid and not waiting for a new upload (may be awaiting verification). */
  nextInstalment: InstalmentItem | null;
  /** Instalments where Finance asked for more information. */
  attention: InstalmentItem[];
  recentReceipts: PortalReceipt[];
  construction: { projectName: string; progress: number; milestones: ProjectMilestone[]; latest: PortalConstructionUpdate | null };
  documents: { count: number; newCount: number };
  services: { openRequests: number; activePasses: number };
}

export interface PortalPayments {
  asOf: string;
  property: PortalProperty;
  plan: PlanSummary;
  schedule: InstalmentItem[];
  receipts: PortalReceipt[];
  collectionAccount: CollectionAccount;
}

export interface PortalServices {
  asOf: string;
  unitRef: string;
  requests: ServiceRequest[];
  passes: VisitorPass[];
}

export interface PortalDocuments {
  asOf: string;
  owner: PortalOwner;
  property: PortalProperty;
  documents: PortalDocument[];
}

export interface SubmitProofInput {
  method: Exclude<PaymentMethod, 'online_simulated'>;
  amount: string;
  paidOn: string;
  reference: string;
  fileName?: string;
}

export interface CreateServiceRequestInput {
  category: ServiceCategory;
  description: string;
  preferredDate?: string;
}

export interface CreateVisitorPassInput {
  visitorName: string;
  phone?: string;
  purpose: VisitorPurpose;
  visitDate: string;
}
