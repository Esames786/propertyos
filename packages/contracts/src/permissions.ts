/**
 * ILLUSTRATIVE permission catalogue for the UI prototype only (Stage 0 conflict C17).
 * The register lists permissions as "TBD per role/scope"; the authoritative model is decided in
 * Stage 7 and enforced by the backend. Hiding UI is never a security control.
 */
export const PERMISSIONS = [
  'project.context.use',
  'quickcreate.use',
  'lead.view',
  'lead.create',
  'visit.schedule',
  'unit.view',
  'unit.hold',
  'quote.create',
  'customer.view',
  'booking.view',
  'invoice.view',
  'payment.receive',
  'finance.evidence.review',
  'expense.create',
  'supplier.view',
  'procurement.view',
  'hr.view',
  'operations.view',
  'residents.view',
  'reports.view',
  'admin.view',
  'portal.use',
  'construction.view',
  'workorder.update',
  'visitors.manage',
  // Society setup and monthly billing (Gate C.1). Preparing, approving and posting are separate
  // permissions so maker-checker can be held by different roles.
  'site.view',
  'site.manage',
  'opening_balance.import',
  'opening_balance.approve',
  'charges.manage',
  'billing_run.view',
  'billing_run.create',
  'billing_run.approve',
  'billing_run.post',
  'credit_note.create',
  // Collections (Gate C.2): verifying proofs and receiving cash stay with finance; the collection
  // account, method rules and posting policy are configured by one person and approved by another.
  'collections.view',
  'bank.view',
  'bank.reconcile',
  'beneficiary.manage',
  'beneficiary.approve',
  'payment_methods.manage',
  'billing_policy.manage',
  'liability.approve',
  // Settling a proof against a partly matching bank line: approved by someone other than the requester.
  'payment_exception.approve',
  // Platform HQ (central plane, V3.1). Operators are a separate principal type from tenant staff.
  'platform.dashboard.view',
  'platform.tenants.view',
  'platform.tenants.create',
  'platform.tenants.lifecycle',
  'platform.catalog.view',
  'platform.grants.manage',
  'platform.pricing.view',
  'platform.pricing.simulate',
  'platform.contracts.manage',
  'platform.contracts.approve',
  'platform.usage.view',
  'platform.preview.use',
  'platform.audit.view',
  'platform.requests.manage',
  // Supreme Admin: draft and schedule versions of rate cards, policies, the catalogue and signup rules.
  'platform.config.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
