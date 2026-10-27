# V3.1 — Screen register reconciliation and UI-first gates

Existing screen register: docs/ui/screen-register.csv contains **321** registered routes/views/actions across SaaS, backoffice, portal and onboarding. Some routes are planned placeholders; routes are not completed UI. Existing Stage 1.5R reports say 24 built, 8 partial, 289 planned at that checkpoint. Verify status against current branch before repeating figures.

## Critical Supreme Admin screen families
HQ Dashboard; Tenants List; Create Tenant Wizard; Tenant 360; Edition Selector; Module/Feature Catalog; Module Dependency Matrix; Tenant Module/Site Grants; Tenant Role/Entitlement Preview; Plan/Rates Versioning; Subscription Contract Builder; Pricing Component Table; Pricing Simulator; Usage Meter/Snapshot Explorer; Seat/Flat Eligibility Count; SaaS Quote/Invoice Preview; Central Invoices/Credits/Payments; Trial/Renewal/Suspension; Tenant Billing Audit; Support Access; Branding/Domain; Company Billing Reports.
These must be real clickable flows, NOT placeholder cards.

## Critical maintenance-only client screens
Managed Sites; Building/Block/Floor/Unit Explorer; Bulk Flat Import + validation; Owners/Residents/Payers; Billing Account/Responsible Payers; Charges/Rate Versions; Charge Rule Overrides; Billing Run Calendar/Builder; Preview Assessment by Flat; Approval/Posting; Maintenance Invoice/Statement; Collection Dashboard; Aging/Arrears; Bank Beneficiary/QR Setup; Online Gateway Settings Mock; Transfer Proof Review; Receipts/Credits/Refunds; Reconciliation; Maintenance Requests; Work Orders/Technicians; Visitors/Security; Parking; Notices; Site Reports.

## Critical resident PWA screens
Welcome/Setup; My Property; Payments; Next Bill Breakdown; Pay Online Demo; Site Bank/QR Details; Submit Payment Evidence; Proof Verification Status; Receipt; Past Statements; Maintenance Request; Visitor Pass; Property Documents; Notices; Profile; Appearance & Accessibility (font 100–200%, contrast, palettes, theme, Urdu/English, reduce motion); Help/Guided Tour.

## Additional system UI
Platform admin user personalization, tenant admin personalization, staff personalization; consistent theme/contrast/RTL across module navigation, forms, drawer, table, chart, onboarding, new screens.
Do not multiply identical routes: tabs/drawers/overlays are tracked as states/actions, not redundant separate full pages.

## Gates
**Gate A (NOW, documentation only):** inspect baseline, produce comprehensive deduplicated screen register diff, normalized architecture/ERD, module dependencies, pricing/billing constraints, mock typed API/state contract and UI gate plan. STOP for owner approval.
**Gate B (after authorization):** one high-fidelity clickable end-to-end Supreme Admin tenant setup → modules → hybrid pricing/quote/activation/preview journey, English/Urdu desktop/mobile, tours, automated/manual accessibility evidence. Stop for review.
**Gate C:** one high-fidelity 80-flat society: building setup/import → payers → charge plan → preview/post monthly billing → resident transfer proof → staff verification → receipt/reconciliation, including role and permission tests.
**Gate D:** complete resident PWA and personal theme/font/RTL/contrast screens + maintenance, visitors, notices.
**Gate E:** complete developer ERP prototype and connected entity tabs, finance, projects and company operations.
**Gate F:** luxury public websites, branded portfolios, tower/floor/unit 3D and accessible 2D.
**Gate G:** full UI completeness and accessibility/behavior QA on real devices; no placeholders counted completed.
**Gate H:** only after approval, production Laravel/tenant DB/payment/GL systems with migrations and real provider connections.

## Required screen register fields
Screen ID; application; tenant edition; module; feature grant; minimum role permission; data scope; page/tab/drawer; route; current BUILT/PARTIAL/PLANNED; core entity; tabs; linked records; actions; validation; states; mock API; responsible gate; tests; screen reader/mobile/RTL evidence.

## Gate A output
1. Master product map + 2 demo tenant capabilities.
2. Normalized logical ERD and authoritative platform/tenant boundaries.
3. Module entitlement dependency table.
4. Operator pricing rule matrix, example and metering policy.
5. Community dues/collections workflows and bank/merchant destination map.
6. Deduplicated screen register diff with built status.
7. Proposed mock types/services.
8. Gate B and C bounded plan, acceptance checks.
9. Open architectural decisions/risks.
10. STOP pending owner approval.
