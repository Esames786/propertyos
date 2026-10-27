# V3.1 — Building / Society management, monthly dues and resident payments

A maintenance-only customer must be viable as a first-class tenant without CRM, a project launch, quotation, booking or construction work.

## Building setup
Create tenant + managed site → block/building → floors → flats/units (manual or CSV with preview, deduplication, validation) → Party roster → owners / occupancies / responsible payers → opening balance/import audit → site beneficiary and bank/payment setup → rate card → first billing run → portal invites.

## Charges in a building association
- Monthly recurring maintenance.
- Lift, water, generator, security, parking and common electricity.
- Sinking/reserve fund.
- Metered utilities with reading periods.
- Fixed, by area, by unit type, by occupancy and special unit overrides.
- One-time assessment, repair fees, late fees where lawful/contracted.
- Proration on handover, occupancy or liability transfer.
- Discounts, exemptions, waivers, penalties and adjustments with approval.
- Multi-period arrears carry-forward, partial payments and unapplied resident credit.

Charge priority: site defaults → building/block → unit type → unit-specific effective-dated override. Transparent preview of which rule won.

## Billing run state
DRAFT → PREVIEWED → APPROVAL_PENDING → APPROVED → POSTED → NOTIFIED.
Posted invoices and journals are not silently edited/deleted; use correction/credit/reversal procedures. Avoid duplicate generation for same unit, billing account, period, charge rule and posting version. A rerun must be idempotent.

### Worked resident statement
Flat A-101:
Maintenance PKR 3,000
Security PKR 500
Lift PKR 300
Water PKR 400
Previous due PKR 1,000
Total payable PKR 5,200 (assuming no other transactions).
Charges clearly separated from prior-balance carry-forward so the ledger is not double counted.

## Resident payment choices
1. **Online**: hosted gateway/approved rails provided through the tenant's merchant connection; checkout shows verified payee, invoice, amount, method and reference. Webhook signature + idempotency + success verification required.
2. **Transfer**: show verified tenant/site beneficiary bank, IBAN, structured reference, QR instructions and copy buttons. Resident uploads transaction reference, date, screenshot. UI shows PENDING VERIFICATION, NEVER PAID.
3. **Office / cash / cheque**: only with tenant policy and staff permission, receipt + reconciliation/audit.

Manual transfer: resident proof → submission → finance verification against bank transaction → confirmed payment → allocation to one/multiple invoices → receipt → statement updated. Rejected proof retains history and prompts resubmission.

## Financial boundary
Platform SaaS subscription fee belongs to SaaS company; resident maintenance and property dues belong to the relevant authorized association/developer. No silent collection into generic SaaS operator bank; any regulated collection or split settlement requires explicit provider/legal authority and contract.

## Resident 360 application
My properties/units, owner vs resident role, next dues, detailed bill, unpaid/paid history, transfer proof status, receipts/download, bank destination, maintenance tickets/photos/work orders, technician visit, visitor QR, parking, notices, amenities, help.
Responsive one React/TypeScript PWA codebase for desktop/tablet/mobile; mobile layout is app-like.

## Building Manager workspaces
Building 360 → Units/Payers → Charge Rules → Billing Calendar/Run → Assessments → Invoice → Receipts/Unverified Transfers → Collections/Aging → Bank/Reconciliation → Maintenance → Work Orders → Vendors → Notices → Visitors/Security → Reports.

## Audit checks
- No overcharging or duplicate billing on retries.
- Partial and unallocated payments supported.
- Bill payer can be distinct from owner and resident.
- Transferred ownership/occupancy must not rewrite historical dues.
- Charge rates and invoices preserve immutable commercial snapshots.
