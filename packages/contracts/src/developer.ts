import type { EffectiveAccess, TenantType } from './access';
import type { Permission } from './permissions';

/**
 * Gate E.0 foundation: the developer organisation's own state (plan §6 E.0 deliverable 1) and the
 * shared vocabulary every Gate E slice builds on. Everything here is fictional demo data.
 *
 * Seeded read-only (owner decision E-37, conservative default): legal entities, cost centres, document
 * numbering per entity and verified collection accounts belong to administration screens of Gate G
 * (ADM-008, -012, -013, -014). Gate E reads them; no Gate E screen edits them.
 */

/** Version of the developer demo-store section; a stored section of another version is re-seeded. */
export const DEVELOPER_STATE_VERSION = 1 as const;

/** A legal entity of a developer organisation (A2 §5.1): it sells, invoices and keeps books for its projects. */
export interface DevLegalEntity {
  id: string;
  /** Registered name (fictional, marked "Demo"). */
  name: string;
  /** Short code used in document references ("LSP"). */
  code: string;
  /** Fictional registration number, labelled as such wherever it is shown. */
  registration: string;
  currency: 'PKR';
  /** Projects this entity sells (from the tenant's own project records). */
  projectIds: readonly string[];
  siteIds: readonly string[];
  /** E-37: configured by administration (Gate G); read-only in Gate E. */
  source: 'administration';
}

export const COST_CENTRE_KINDS = ['head_office', 'project', 'sales', 'construction'] as const;
export type CostCentreKind = (typeof COST_CENTRE_KINDS)[number];

/** A cost centre of one legal entity; a project cost centre also names its project. */
export interface DevCostCentre {
  id: string;
  legalEntityId: string;
  code: string;
  name: string;
  kind: CostCentreKind;
  projectId?: string;
  source: 'administration';
}

/** Developer documents numbered per issuing legal entity (plan §4.6; BILL-016 pattern). */
export const DEVELOPER_DOCUMENT_KINDS = ['instalment_invoice', 'manual_invoice', 'receipt', 'credit_note', 'refund', 'journal', 'supplier_bill', 'payment_voucher', 'quotation', 'reservation', 'booking', 'purchase_order', 'bank_import'] as const;
export type DeveloperDocumentKind = (typeof DEVELOPER_DOCUMENT_KINDS)[number];

/**
 * A numbering series: `{code}` the entity's code, `{yyyy}` / `{yyyymm}` the document's year or period,
 * `{seq:N}` its sequence (the same tokens as the society engine, `society/numbering.ts`).
 */
export interface DevNumberingSeries {
  legalEntityId: string;
  kind: DeveloperDocumentKind;
  pattern: string;
  source: 'administration';
}

/**
 * A verified collection account of one legal entity (fictional; the number is stored masked, never
 * whole). Statement imports and proofs are accepted only for the issuing entity's verified account.
 */
export interface DevCollectionAccount {
  id: string;
  legalEntityId: string;
  bankName: string;
  title: string;
  /** Masked: the last four digits only. */
  maskedNumber: string;
  verified: true;
  verifiedOn: string;
  /** Always true in the prototype: no real bank is connected. */
  sample: true;
  source: 'administration';
}

/**
 * Developer approval subjects (plan §4.7; the final list is owner decision E-27). Kept apart from the
 * society `APPROVAL_SUBJECTS` so the accepted S.1 policy screens do not change: opening APR-001…005 to
 * every edition is deferred (E-27).
 */
export const DEVELOPER_APPROVAL_SUBJECTS = [
  'price_change', 'discount', 'plan_exception', 'quotation', 'hold_extension', 'booking', 'booking_amendment', 'booking_cancellation',
  'refund', 'credit_note', 'manual_invoice', 'supplier_bill', 'supplier_payment', 'expense', 'budget', 'purchase_request', 'purchase_order',
  'match_exception', 'journal', 'posting_rule', 'milestone_certification', 'publication', 'handover_waiver', 'kyc_verification',
  // Wave 1 additions named by the slices' maker-checker pairs (E.2, E.7, E.13).
  'project_activation', 'chart_change', 'bank_import', 'document_template',
] as const;
export type DeveloperApprovalSubject = (typeof DEVELOPER_APPROVAL_SUBJECTS)[number];

/**
 * One version of a developer approval policy (D-29): who may approve a subject, by permission (developer
 * approvers are roles, never committee offices). No default amount is proposed: `threshold` is null,
 * which means every request needs approval. The maker never approves their own request (checked by
 * principal on the server), a draft never governs its own approval, and versions are never edited.
 */
export interface DevApprovalPolicyVersion {
  id: string;
  legalEntityId: string;
  subject: DeveloperApprovalSubject;
  version: number;
  state: 'approved' | 'draft' | 'superseded';
  effectiveFrom: string;
  /** Who may approve: holders of this permission, other than the maker. */
  approverPermission: Permission;
  threshold: null;
  /** Labelled illustrative until the owner sets the policy (E-27). */
  illustrative: true;
}

/** The developer organisation's demo-store section (versioned, reset with the demo). */
export interface DeveloperState {
  version: typeof DEVELOPER_STATE_VERSION;
  tenantId: string;
  legalEntities: DevLegalEntity[];
  costCentres: DevCostCentre[];
  numbering: DevNumberingSeries[];
  collectionAccounts: DevCollectionAccount[];
  approvalPolicies: DevApprovalPolicyVersion[];
}

/**
 * Editions a Gate E screen serves (plan §4.1, register `tenant_edition`): DEV → developer organisations;
 * DEV+COMM → developers and property managers; ALL → every kind. A screen of another edition keeps the
 * register's planned page at its address (nothing unfinished looks finished).
 */
export const DEV_EDITIONS = {
  DEV: ['developer'],
  'DEV+COMM': ['developer', 'portfolio_manager'],
  ALL: ['developer', 'association', 'portfolio_manager', 'custom'],
} as const satisfies Record<string, readonly TenantType[]>;
export type DevEdition = keyof typeof DEV_EDITIONS;

/** Whether the signed-in organisation is of an edition the screen serves (fail closed without access). */
export function servesEdition(access: Pick<EffectiveAccess, 'tenant'> | null | undefined, edition: DevEdition = 'DEV'): boolean {
  if (!access) return false;
  return (DEV_EDITIONS[edition] as readonly TenantType[]).includes(access.tenant.type);
}
