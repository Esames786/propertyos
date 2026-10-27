# PropertyOS V3.1 — OFFICIAL HANDOFF / READ FIRST

Status: **GATE A ARCHITECTURE + SCREEN RECONCILIATION AUTHORIZED. NO NEW PRODUCTION IMPLEMENTATION.**

Repository: Esames786/propertyos
Working branch: feature/stage-1.5-premium-design
Baseline: docs/blueprint/v2.1/, docs/ui/screen-register.csv (321 registered items), and docs/status/ui-stage-1.5R/.

This is a **consolidated authoritative V3.1 Git handoff**. The V2.1 architecture remains the complete baseline. The six domain documents here correct and extend it for modular licensing, Supreme Admin, tenant fee flexibility, standalone building/community management, and personal accessibility settings.

## Read in order
1. 01_PRODUCT_AND_MODULE_CONTROL.md
2. 02_LOGICAL_ERD_AND_BOUNDARIES.md
3. 03_PLATFORM_SAAS_PRICING.md
4. 04_COMMUNITY_BILLING_AND_PAYMENTS.md
5. 05_USER_UX_AND_PERSONALIZATION.md
6. 06_SCREEN_MAP_AND_UI_GATES.md
7. 07_CLAUDE_GATE_A.md

Read original docs/blueprint/v2.1 and existing code **before changing architecture**.

## Conflict resolution
- V3.1 overrides V2.1 for Supreme Admin pricing combinations, maintenance-only tenancy, user-level appearance and accessibility, and UI gate sequence.
- V2.1 remains authoritative for the full developer ERP, CRM/booking, Party model, accounting GL, ownership, luxury website, audit, and existing screen IDs unless this delta explicitly changes them.
- Historical V3 review-draft wording is NOT authorization to start Stage 2.
- Existing Stage 1.5R React UI, working demo journeys, tours, tests, mock API and accessibility must be preserved.

## Next action
Claude: complete Gate A documentation and reconcile screens. **STOP for owner approval** before implementing Gate B. Do not merge main.

## Two demonstration tenant personas
- Full Developer: CRM, leads, projects, inventory, booking, finance, construction, handover, resident services.
- Maintenance-Only Society: site/building/flats, owners/residents, monthly charges, payment collection, complaints, visitors, parking, notices; NO forced sales/project CRM shell.

## Accounting boundary
Platform subscription/SaaS income and tenant resident dues are different obligations, payees, settlement destinations and ledgers. No ordinary SaaS operating bank commingling with tenant resident funds.

## Product promise
An operator Supreme Admin can sell any combination of modules with any approved combination of charging rules, and an end user can customize accessibility/appearance without weakening security or tenant branding.
