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
] as const;

export type Permission = (typeof PERMISSIONS)[number];
