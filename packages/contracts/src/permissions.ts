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
  // Gate S.2a: distinct staff-data, attendance and roster actions (no payroll permission).
  'hr.manage',
  'shifts.manage',
  'attendance.record',
  'attendance.adjust',
  'leave.manage',
  'hr.documents.manage',
  // Staff advances and loans (HR-007/008): a financial scope apart from hr.view. Requesting and
  // approving are separate so maker-checker can be held by different people.
  'hr.advances.manage',
  'hr.advances.approve',
  // Gate S.2b: the optional payroll add-on (V3.2 matrix §5.2). Seeing pay is apart from hr.view;
  // preparing (periods, runs, instructions) and approving are split so maker-checker holds.
  'payroll.view',
  'payroll.prepare',
  'payroll.approve',
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
  // Gate D.1: resident portal access, data and privacy, sessions, organisation colours.
  'portal_access.view',
  'portal_access.invite',
  'data_export.request',
  'data_export.approve',
  'privacy.requests.manage',
  'sessions.manage',
  'admin.branding',
  // Gate S.1: society finance and governance. Each maker-checker pair is split across roles
  // (prepare/approve, create/approve, collect/confirm); approval policies decide who approves what.
  'cashbook.view',
  'cash_voucher.prepare',
  'cash_voucher.approve',
  'funds_transfer.create',
  'funds_transfer.approve',
  'settlement_exception.approve',
  'cheque.manage',
  'payment.batch.confirm',
  'period.close',
  'reminders.manage',
  'reminders.send',
  'committee.view',
  'committee.manage',
  'approval.view',
  'approval.decide',
  'approval_policy.manage',
  'transfer.review',
  'transfer.approve',
  'clearance.issue',
  // Gate D.2: resident operations. Triage and assignment are separate from a technician's own work
  // orders; publishing official notices is separate from reading the residents register.
  'maintenance.manage',
  'issues.view',
  'issues.manage',
  'issues.moderate',
  'visitors.view',
  'parking.view',
  'vehicles.approve',
  'amenities.manage',
  'notices.publish',
  'messages.send',
  'merchant.manage',
  // V3.2 Gate D.3: the two optional, site-licensed community modules.
  'chat.use',
  'chat.groups.manage',
  'chat.moderate',
  'directory.manage',
  'polls.manage',
  'resources.publish',
  'marketplace.moderate',
  // Gate S.3: the optional, site-licensed rentals add-on (V3.2 matrix §5.2). Each maker-checker pair is
  // split: drafting and activating a lease, preparing and approving a rent roll, preparing and approving
  // an owner payout instruction, drafting and approving a management agreement version. Reading an owner
  // statement never publishes it: issuing one to the landlord is its own permission (Issue #17, R4).
  'lease.view',
  'lease.manage',
  'rent.bill',
  'rent.approve',
  'owner_statement.view',
  'owner_statement.issue',
  'owner_payout.prepare',
  'owner_payout.approve',
  'rentals.configure',
  // Gate E.7 (provisional; reconcile with E.0 at Wave 1 integration). Names as the Gate E plan gives
  // them (§6 E.7 table, decision E-07): reading the ledger; preparing, submitting and posting journals;
  // approving journals someone else prepared (the checker). Bank import keeps bank.view / bank.reconcile.
  'gl.view',
  'gl.post',
  'journal.approve',
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
