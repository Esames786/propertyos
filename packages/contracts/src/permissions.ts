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
] as const;

export type Permission = (typeof PERMISSIONS)[number];
