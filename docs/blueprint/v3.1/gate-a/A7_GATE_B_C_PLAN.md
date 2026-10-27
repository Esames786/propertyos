# A7. Gate B and Gate C: bounded plans and acceptance checks

**Gate A output item 8.**
- **Nothing here starts without owner approval.**
- Each gate ends with a stop for review, in the same evidence format as Stage 1.5R:
  - a flow matrix;
  - EN/UR × 1440/390 screenshots;
  - videos;
  - E2E and axe on production builds;
  - an honest working / mock / simulated / planned list.

**Standing rules for both gates**
- No production backend, migrations, real payments or merge to `main`.
- Fictional data only.
- Stage 1.5R journeys, tours and all 134 E2E tests stay green. Larkspur receives every module grant, so its UI is unchanged.
- No Nizam branding or assets.

## Gate B: Supreme Admin tenant setup → modules → hybrid pricing → quote → activation → preview

### B.1 Goal
One high-fidelity, clickable, end-to-end operator journey (V3.1 doc 06 Gate B) in English and Urdu, desktop and phone, with a tour and accessibility evidence. It also delivers the **access foundation** that every later gate depends on.

### B.2 Demo storyline (the video and the main E2E test)
1. Sign in to Platform HQ as the **Supreme Admin (Demo)**. The HQ dashboard shows tenants by status and a pending **workspace request** (from Get started → Request a workspace).
2. **Create tenant** → type *Society / association* → organisation details → one site, **80 flats** (declared).
3. **Modules:** the Community preset is pre-selected. Add **Online payments**: the dependency check passes because Receivables is included. Remove Receivables: the check blocks it and explains that Online payments and Dues require it, then offers to restore it.
4. **Pricing builder:** components from the rate card. Base PKR 0; PKR 40 per **eligible** flat; PKR 500 per site; one-time onboarding PKR 15,000.
5. **Usage preview:** the declared estimate (80) is shown next to the other unit dimensions, labelled "estimate until go-live".
6. **Quote preview:** **PKR 18,700 first month, PKR 3,700 after**, every line explained.
7. Review → **Activate demo tenant** (labelled simulation). The tenant appears as Trial/Active in the list, with an audit entry.
8. Tenant 360:
   - schedule a **price change** from 1 Jan 2027 (flat fee PKR 45) → version 2 is "Scheduled", version 1 is kept;
   - the quote shows PKR 3,700 for Nov–Dec and PKR 4,100 from January.
9. **Pricing simulator:** count *occupied* (76) instead of eligible → PKR 3,540. The simulator is labelled "nothing is saved", and the mutation log is unchanged.
10. **Preview as role → Building manager:**
    - the backoffice opens in preview with **no Sales, Projects or CRM** in the navigation, palette or Quick create;
    - a typed link to `/backoffice/crm/sales-home` shows **"Not part of this workspace's plan"**;
    - "Your plan & modules" lists exactly the granted modules.
11. Sign in as the **Platform support agent (Demo)** → opening tenant records is refused ("support grant required").

### B.3 Screens (register IDs)

| Group | Screens |
|---|---|
| New app shell | `apps/platform-hq` (D-1): sidebar, header, phone bars, help, tour |
| HQ | HQ-001 dashboard; HQ-002 tenants; HQ-003 create wizard (with HQ-005 edition, HQ-011/012 pricing table, HQ-015 evidence, HQ-016 quote); HQ-004 Tenant 360 (with HQ-008 grants drawer, HQ-014 usage tab, HQ-019 audit tab); HQ-006/007 catalogue and dependency matrix; HQ-009 preview; HQ-010 rate card (read-only); HQ-013 simulator; HQ-018 activate / free plan |
| Backoffice | GLOBAL-012 access outcome pages; ADM-023 "Your plan & modules"; GLOBAL-011 More filtered by grants |
| Entry | ENTRY-003 request appears in HQ-002 as pending |
| Tour | GUIDE-007 HQ tour |

### B.4 Build items

**Shared foundation**
- **`decide()`** plus `access.vectors.json`, and `requires` on every handler, nav item, Quick create entry, widget, palette command and tour step.
- **`useAccess()`.**
- **Prototype tools switch** (flaw F-6); grouped and searchable More page (F-12); quick-actions grid with an "All actions" sheet (F-5).
- **Reusable components:**
  - `DataTable`: responsive, sticky header, row actions, card fallback, labelled scroll region (F-11);
  - `Stepper` / wizard frame, reused from the 1.5R setup wizard;
  - `PricingComponentTable`, `QuoteBreakdown`, `DependencyCheckPanel`, `ImpactReport`, `MeterEvidenceDrawer`, `PreviewBanner`, `AccessOutcome`.

**Data**
- **Fixtures:** module catalogue; rate card v1; 4 seeded tenants in different states (Larkspur active; one trial society; one in grace; one suspended); usage snapshots with evidence; the platform personas.
- **Engine:** `priceContract()` plus `pricing.vectors.json` (A3 §9).
- **i18n:** a new `platform` namespace (EN + UR, parity-checked).

### B.5 Acceptance checks (each becomes an automated test unless marked manual)

| # | Check |
|---|---|
| AB-1 | The storyline above passes end to end at 1440 px (EN) and 390 px (UR), keyboard only, with axe 0 violations on every step |
| AB-2 | Golden vectors: 18,700 / 3,700; 3,540 occupied; 16,850 mid-month start; 4,100 after amendment; graduated 3,300 vs volume 2,800 |
| AB-3 | The dependency check blocks a missing hard requirement and explains it in plain language; one click adds it; the price impact is shown before saving |
| AB-4 | Disabling a module shows the impact report first; data stays (re-enabling restores access with no re-configuration) |
| AB-5 | Contract amendment creates version 2; version 1 is immutable and visible; the audit shows who, when, why, before and after |
| AB-6 | The simulator never writes (mutation log unchanged; the tenant's contract unchanged) |
| AB-7 | Meter evidence shows the counted and excluded flat codes with reasons and **no personal names** |
| AB-8 | Preview as a society role: no developer modules in the navigation, palette, Quick create or dashboard; deep link → the "Not part of this workspace's plan" page; no tenant records are loaded (the preview session says `containsTenantRecords: false`) |
| AB-9 | The support agent gets 403 `support_grant_required` on any tenant-record endpoint; Supreme Admin screens show tenant metadata only |
| AB-10 | Access vectors: every layer and reason, including a suspended tenant (read-only) and a future-dated grant |
| AB-11 | **Regression:** the full Stage 1.5R suite (134 tests) passes unchanged on production builds; Larkspur's navigation is identical |
| AB-12 | 320 px reflow and 200 % zoom on HQ-003 (all steps), HQ-004, HQ-013; the Urdu language switch mid-wizard keeps entries |
| AB-13 | HQ tour: every step frames a real control at 1440 / 390 / 320 |
| AB-14 (manual) | NVDA + Chrome pass of the wizard and quote; findings listed honestly |

### B.6 Not in Gate B
Central invoices, payments and dunning (HQ-017); support-grant workflow (HQ-020); branding and domains (HQ-021); platform users (HQ-023); real sign-in and MFA; tenant provisioning (activation is simulated); full personalization (Gate D).

## Gate C: one 80-flat society, from setup to reconciled collections

### C.1 Goal
V3.1 Gate C: building setup and import → payers → charge plan → preview and post monthly billing → resident transfer proof → staff verification → receipt and reconciliation, with role and permission tests.

**D-18:** Gate C is delivered in two halves with a short **owner checkpoint** after C.1 (a demo, not a full stop) to keep it bounded:
- **C.1** Setup and billing.
- **C.2** Collections and resident.

### C.2 Fixture: Al-Noor Residency (Demo)

| Item | Value |
|---|---|
| Structure | 1 site; Block A and Block B; 5 floors × 8 flats each; **80 flats** A-101…B-508 |
| Unit types | Standard (64), Penthouse (16: the top floor of each block) |
| Occupancy | 63 owner-occupied, 12 tenant-occupied, 4 vacant, plus A-108 association office: **registered 80, occupied 76, eligible 80** |
| Payers | 8 of the 12 rented flats are paid by the tenant-occupant; 4 by the owner; vacant flats by the owner |
| Charges (Nov 2026) | Maintenance 3,000 (penthouse 4,500); security 500; lift 300; water 400. A-108 exempt (approved) |
| **Golden run total** | 79 invoices; 63 × 3,000 + 16 × 4,500 + 79 × 1,200 = **PKR 355,800** |
| Opening balances | 10 accounts in arrears, including **A-101: PKR 1,000** |
| Payee | Al-Noor Residency Owners' Association (Demo), Demo Bank, IBAN with bank code `DEMO`, verified |
| Bank feed | 12 incoming transfers; 9 match submissions, 1 is A-101's, 2 are unidentified |
| Proof queue | 6 submissions, including 1 duplicate reference and 1 that needs information |
| Personas | Building manager, Committee treasurer, Accounts officer, Security guard, A-101 owner-resident, A-102 tenant-payer (A4 §9) |

### C.3 Storyline

**C.1: Setup and billing (building manager, treasurer)**
1. Get started → **Explore the society demo** → Building manager. The dashboard is collections-first (F-3).
2. Site 360 → **onboarding checklist** → structure explorer (tree + list) → **import flats** from the sample CSV (3 errors, 2 duplicates) → fix → commit 80 → re-running creates nothing.
3. People and payers: A-102 shows owner Mr X, occupant and payer Ms Y. Change a payer from next month; the October invoice still shows the old payer.
4. Opening balances import → approve → A-101 shows PKR 1,000.
5. Charges: site defaults → penthouse override → A-108 exemption (treasurer approves). "Which rule wins" for A-501.
6. **Billing run Nov 2026:** create → preview by flat (79 invoiced, A-108 exempt) → submit.
   - The building manager **cannot approve** their own run.
   - The treasurer approves → post (**double-click and retry create no duplicates**) → notify (simulated).
   - The posted run is read-only.
7. Correct one posted invoice with a **credit note** (no edit action exists).

**C.2: Collections and resident (resident, accounts officer)**

8. Resident A-101, phone, Urdu:
   - **This month's bill** PKR 4,200 plus the previous balance PKR 1,000 = **PKR 5,200**;
   - the payee details are verified, with copy buttons, a bidi-safe IBAN and a reference;
   - upload proof → **Pending verification** (never Paid).
9. Accounts officer:
   - Proof queue → review → match the bank transaction → allocation oldest-first (Oct 1,000 + Nov 4,200) → **verify** → payment, receipt and statement updated;
   - the second submission with the same bank reference is **refused**;
   - one proof → **Needs information** → the resident resubmits → verified;
   - one proof → **Rejected** with a reason.
10. Partial payment variant: 3,000 → Nov partially paid, 2,200 outstanding. Over-payment 6,000 → **800 credit**.
11. **Office cash** payment: refused when the site's method rules disallow it; allowed after the rule changes; receipt issued.
12. Reconciliation: the verified payment shows *matched*; two lines remain unidentified.
13. **Collections dashboard and aging** reflect billed, collected, pending verification and arrears. The resident sees the receipt and the updated statement.
14. Roles:
    - the **security guard** sees no billing, people finance or statements;
    - the **tenant-payer** sees only the periods they are liable for;
    - another resident's invoice URL returns not found.

### C.4 Screens (register IDs)

**C.1**
- SITE-001…008; CUS-001, CUS-003; RES-002; SITE-007;
- BILL-001…005, BILL-008 (with 006, 007), BILL-009, BILL-010, BILL-012, BILL-014;
- HOME-001 society composition; ENTRY-001/002 society demo; GLOBAL-013 site context; GUIDE-008.

**C.2**
- FIN-002, 003, 005, 006, 007, 008, 009, 011; BANK-003, BANK-004; COL-001, COL-004, COL-005;
- PORTAL-001, 004, 005, 007, 008, 010 (dues variants), PORTAL-028, PORTAL-029; GUIDE-009.

### C.5 Build items
- **Engines:** `resolveCharges`, `billingRun` (state machine, idempotent post), `allocate`, `statement`, plus `dues.vectors.json`.
- **Components:**
  - `StructureTree` with a list alternative;
  - CSV `ImportWizard` with row-level errors;
  - `StateTimeline` (runs, submissions);
  - `ApprovalDrawer` (maker ≠ checker);
  - `PayeeCard` (copy, QR, bidi isolation);
  - `StatementView`, `AllocationEditor`, `ReconciliationList`.
- **Edition-aware composition:** dashboard, portal home and bottom bar from grants (F-3, F-4); tenant-type vocabulary (F-10); site context chip on phones (F-2).
- **Demo:** tenant chooser on Get started (F-9).
- **i18n:** new `billing` and `sites` namespaces (EN + UR, parity-checked).

### C.6 Acceptance checks

| # | Check |
|---|---|
| AC-1 | Storylines C.1 and C.2 pass end to end: desktop EN, phone UR, keyboard only; axe 0 violations on every screen and overlay |
| AC-2 | The import reports every invalid and duplicate row and commits all-or-nothing; re-running the same file creates nothing |
| AC-3 | Booking ≠ ownership ≠ occupancy ≠ payer: A-102's four facts are distinct; a payer change leaves the October invoice untouched |
| AC-4 | Rule resolution: penthouse override wins; A-108 is exempt; "which rule wins" lists the overridden rules |
| AC-5 | Billing run: full state path; a stale preview blocks submit; **the creator cannot approve**; one open run per period |
| AC-6 | **Idempotent posting:** post twice or retry → still 79 invoices, PKR 355,800 |
| AC-7 | A posted invoice has no edit action; the credit note corrects it and the statement shows both |
| AC-8 | Statement: A-101 = 1,000 + 4,200 = 5,200; the invoice total is 4,200 (the previous balance is not an invoice line) |
| AC-9 | **Submitted ≠ paid:** the resident sees Pending verification until VERIFIED; only verification creates the payment and receipt |
| AC-10 | Allocation: 5,200 → both paid; 3,000 → 2,200 outstanding; 6,000 → 800 credit |
| AC-11 | Duplicate bank reference refused; needs-information → resubmission keeps history; rejection reason shown to the resident |
| AC-12 | The payee shown is always the verified beneficiary of the issuing association. **The platform's account never appears**; an unverified beneficiary change is invisible to residents |
| AC-13 | Office cash obeys the site's method rules and the staff permission |
| AC-14 | Reconciliation marks the verified payment matched; collection dashboard and aging totals agree with the invoices and payments |
| AC-15 | Role and scope: the guard is denied billing; the tenant-payer sees only liable periods; another resident's invoice → not found; the society tenant has no developer modules |
| AC-16 | **Regression:** Gate B and Stage 1.5R suites stay green |
| AC-17 | 320 px reflow and 200 % zoom on the run workspace, proof review, statement and portal bill; the Urdu switch mid-import keeps state |
| AC-18 | Tours: building-manager and resident-dues tours frame real controls; their guided steps complete on real actions |
| AC-19 (manual) | NVDA + Chrome on proof review and the portal payment; VoiceOver on the portal bill (if a device is available) |

### C.7 Not in Gate C
Online gateway mock for dues (D); utility meters and late fees (G); refunds (E); accounting postings (E); real notifications; maintenance, visitors and notices (D); parking and amenities (G).

## Gates D–H (unchanged order from V3.1; detail at each gate's own approval)

| Gate | Scope | Register |
|---|---|---|
| D | Resident PWA completion, the personalization hub in all three apps (text size 100–200 %, theme incl. dark and high contrast, palettes, density, reading mode, Urdu font), maintenance, visitors, notices, online gateway mock | 33 distinct screens |
| E | Developer ERP: lead → booking → instalments → handover, projects, inventory, finance, accounting, AP, procurement, HR, payroll | 145 |
| F | Luxury public sites, 3D with accessible 2D alternative | 18 |
| G | Everything remaining; no placeholder counted as complete; real-device QA | 50 |
| H | Production Laravel, tenant DBs, payments, GL, only after explicit approval | — |
