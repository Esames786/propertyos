# V3.1 — Logical ERD, key entities, invariants

This is a logical specification, NOT an approved production migration schema. Claude must reconcile duplicates/keys with docs/blueprint/v2.1 and produce one normalized version before implementation.

## Central platform DB
- tenants (tenant_type, legal entity, status, timezone/currency, db locator)
- tenant_domains, tenant_branding, tenant_site_entitlements
- platform_users, global_users, tenant_memberships, platform_roles
- module_catalog, feature_catalog, module_feature_dependencies, feature_dependencies
- plan_versions, rate_card_lines, pricing_rule_versions
- tenant_module_grants, entitlement_change_requests, tenant_price_overrides
- subscription_contracts, subscription_components, subscription_discounts
- usage_dimensions, usage_meter_events, usage_snapshots
- billing_previews (non-authoritative), subscription_adjustments
- platform_invoices, platform_invoice_lines, platform_payments, platform_receipts, credits/refunds
- platform_support_access_grants, platform_audit_events
- tenant_theme_policies

## Tenant operational DB: shared identity and sites
- roles, permissions, role_permissions, user_roles, access_scopes
- parties, individual_profiles, organization_profiles, party_contacts, party_addresses, party_relationships, party_user_links
- managed_sites, site_legal_entities, buildings, blocks, floors, units, unit_types, parking_spaces
- ownerships, ownership_parties, occupancies, occupant_roles, household_members
- billing_accounts, billing_account_units (liable parties with effective dates and percentages), resident_portal_user_links
- cost_centers, bank_accounts, document types/links, approvals, activity/audit, outbox

## Tenant operational DB: recurring site dues
- charge_categories, charge_rate_versions, recurring_charge_rules, unit_charge_overrides
- utility_meters, utility_meter_readings, exemptions, subsidies, waivers
- community_billing_periods, billing_runs, billing_run_items
- customer_invoices, customer_invoice_lines, account_statements, credit_notes
- payment_intents, gateway_transactions, gateway_webhook_events
- site_merchant_connections, site_beneficiary_profiles, site_qr_payment_instructions
- manual_payment_submissions, payment_evidence, manual_verification_decisions
- confirmed_payments, payment_allocations, receipts, refunds, bank_transactions, bank_reconciliation_matches
- collections_cases, aging/reminder records

## Tenant operational DB: operations
- maintenance_categories, maintenance_requests, work_orders, vendor/technician assignments
- preventive_maintenance_schedules, building_assets (lifts/generators/pumps), inspections
- visitor_passes, visitor_events, vehicles, parking_allocations, amenities, amenity_bookings
- communications, announcements, notifications, preferences, user_onboarding_progress
- user_interface_preferences (user + tenant + locale/theme/palette/font scale/density/motion)
- accounting accounts, fiscal periods, journal entries/lines, cost center allocations
- Full Developer edition adds CRM, leads, opportunities, site visits, versioned pricing, quotes, unit holds, reservations, bookings, booking amendments, installment plans, contracts, construction/handover, HR/payroll, suppliers/AP/procurement.

## Core relational invariants
- Every operational query executes in resolved tenant DB. Globally authenticated user memberships map into tenant roles; central/tenant IDs are explicit references, not fictional cross-DB foreign keys.
- A site/building/flat can exist with no developer Project, opportunity or booking.
- A person (Party) may be owner, co-owner, occupant, resident, payer, supplier or buyer; these are related roles, not duplicated identity tables.
- Unit sale booking != ownership != occupancy != responsible billed payer.
- Billing account can cover one/multiple units with effective-dated responsibility; support shared liabilities and correction history.
- Rate versions must be effective-dated; billing_run_item snapshots source/rate version, eligibility, meter reading and exemptions.
- Platform invoice lines take immutable meter snapshots, not a moving live unit count.
- Invoice ← PaymentAllocation → ConfirmedPayment (many-to-many); partial and unapplied credits supported.
- Payment proof SUBMITTED != PAID; confirmation requires authorized finance verification and bank/provable settlement evidence.
- Online gateway webhooks need verified signature/provider idempotency; store no card PAN/CVV.
- Posted journals immutable and reversible; debits == credits; check period locks.
- Holds/reservations/booking concurrency require transaction locks. Unit holds must expire in application and future production service.
- Support access is authorized, time-limited and audited.

## High-priority relationships
Tenant → TenantModuleGrant → ModuleCatalog/FeatureCatalog; Tenant → SubscriptionContract → SubscriptionComponents → RateCardVersions; Tenant + Period → UsageSnapshot → PlatformInvoiceLine.
ManagedSite → Building → Floor → Unit; Unit → Ownership → OwnershipParty → Party; Unit → Occupancy → Party; BillingAccount → BillingAccountUnit → Unit.
ManagedSite → RecurringChargeRule → BillingRun → BillingRunItem → CustomerInvoiceLine → CustomerInvoice; CustomerInvoice ← PaymentAllocation → ConfirmedPayment; ManualSubmission → VerificationDecision → ConfirmedPayment; Site → VerifiedBeneficiary/MerchantConnection.

## Issues Gate A must resolve
- Central vs tenant identity identifiers.
- Maintenance-only site not dependent on project-sales foreign keys.
- ERP invoice engine and community dues using common core without confusing charge sources.
- Site-specific settlement, legal entities, taxes and support-access guarantees.
- Cross-module versioning, meter correction, proration and posted-entry reversal handling.
