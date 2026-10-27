# A5. Screen register reconciliation and gap analysis

**Gate A output item 6.** Machine-readable result: `screen-register-v3.1-proposed.csv` (in this folder), produced by `scripts/gate-a-register-proposal.mjs` from the live register.

**The live register `docs/ui/screen-register.csv` is not changed in Gate A.** It drives the apps' route resolver and `register.spec`. After approval, the proposal replaces it at the start of Gate B, together with `register.generated.ts` and the spec (D-19).

## 1. Baseline verified on this branch (commit `c9f7274`)

| Check | Result |
|---|---|
| Live register rows | 321 |
| Status as recorded | 24 implemented, 8 partial, 289 planned (matches the Stage 1.5R report) |
| Rows whose recorded status is wrong | **7** (§3.3) |
| Built screens missing from the register | **7**: Get started, Explore demo, Workspace setup, backoffice demo sign-in, portal demo sign-in, the phone More page, the Sales module tour |

## 2. Rules used to de-duplicate

1. **Screen IDs are stable.** No existing ID is renumbered or deleted; a row that stops being a separate screen keeps its ID and points to its canonical screen.
2. **Dispositions**

| Disposition | Meaning |
|---|---|
| `keep` | A screen in its own right |
| `merge->X` | Same purpose as X; X is canonical |
| `state-of->X` | A tab, drawer, step or filter of X (V3.1 doc 06: "tabs/drawers/overlays are tracked as states/actions") |
| `supersede->X` | Replaced by a redesigned V3.1 screen |
| `new` | Added in V3.1 |

3. **When a drawer counts as its own screen.** Only when it is reachable from several places, such as the global Quick create (New lead, Schedule visit, Record office payment). A drawer reachable only from one record is a state of that record's screen (credit note, grant change).
4. **The same shared component in a different app is a separate screen.** Personalization in HQ, backoffice and portal is three screens and one component.
5. **Counted** = rows whose canonical ID is themselves.

## 3. Result

### 3.1 Totals

| | Rows | Distinct screens | Built | Partial | Planned |
|---|---:|---:|---:|---:|---:|
| Live register | 321 | 321 | 24 | 8 | 289 |
| **Proposed V3.1 register** | **390** (321 + 69 new) | **331** (59 rows are states, merges or supersessions) | **28** | **8** | **295** |

**How the counts move**
- **Built**: 24
  - −2 now states of the personalization hub (language switcher GLOBAL-009, tour preferences GUIDE-006);
  - −2 re-graded to partial against V3.1 (GLOBAL-010, PORTAL-027);
  - +1 corrected to built (GUIDE-005);
  - +7 previously unregistered.
  - Total: 28.
- **Partial**: 8
  - −6 portal aliases (pay online, payment history, the maintenance and visitor lists and their create drawers), now states of the screens that serve them;
  - +2 re-graded (GLOBAL-010, PORTAL-027);
  - +3 corrected from planned (CRM-016, INV-002, PORTAL-007);
  - +1 new partial control (GLOBAL-013 context switcher).
  - Total: 8.

### 3.2 By gate (distinct screens)

| Gate | Distinct screens | What |
|---|---:|---|
| Built (no change needed) | 20 | Stage 1–1.5R screens that already meet scope |
| **B** | **16** (+2 built screens extended) | Supreme Admin journey, access outcome pages, tenant "Your plan" view, HQ tour. Extended: More page, workspace request |
| **C** | **39** (+8 built screens extended) | Sites, structure, import, people and payers, charges, billing runs, invoices, statement, proofs, verification, reconciliation, collections, resident bill/payee/status/statements, society tours. Extended: dashboard, portal home/payments/upload/receipt, entry screens |
| D | 33 | Resident PWA completion, personalization hub (all apps), maintenance, visitors, notices, online gateway mock, tenant theme policy |
| E | 145 | Developer ERP: CRM to booking, projects, inventory, finance, accounting, AP, procurement, HR, payroll, construction, handover, documents, approvals, reports |
| F | 18 | Luxury public website |
| G | 50 | Remaining completeness: auth screens, platform finance and support, parking, amenities, communications, admin, assets, site reports, late fees, utility meters |
| **Total** | **331** | |

### 3.3 Status corrections (the live register was wrong)

| ID | Recorded | Should be | Evidence |
|---|---|---|---|
| GUIDE-005 Resident guided tour | planned | **BUILT** | `PORTAL-TOUR-001`, 8 steps, `portal.spec` |
| CRM-016 Hold unit drawer | planned | **PARTIAL** | The 48 h hold works from the unit quick view in the lead workspace |
| INV-002 Unit quick view | planned | **PARTIAL** | The drawer is reachable from the lead workspace's matching units |
| PORTAL-007 Bank transfer details | planned | **PARTIAL** | The bank details panel exists on the payments page |
| GLOBAL-010 Accessibility preferences | implemented | **PARTIAL (V3.1)** | Has motion, contrast, sound and text-only guide; lacks text size, theme, palettes, density, reading mode, haptics and Urdu font |
| PORTAL-027 Accessibility preferences | implemented | **PARTIAL (V3.1)** | Same component |
| RPT-010 Cash flow | template "wizard" | template "report" | Register error |

### 3.4 Merges, states and supersessions (50 legacy rows stop counting separately)

| Group | Rows → canonical |
|---|---|
| SaaS → HQ redesign | SAAS-001→HQ-001, 002→HQ-002, 003→HQ-004, 004→HQ-003, 005→HQ-006 (+HQ-010), 006→HQ-017 (+HQ-011), 007→HQ-021, 008→HQ-023, 009→HQ-020 (+HQ-019), 010→HQ-014 |
| One property structure for both editions | PRJ-004→SITE-003; PRJ-005, PRJ-006, INV-004 → states of SITE-003; PRJ-007→SITE-005; INV-003→SITE-006; INV-005→SITE-004 |
| One Unit 360 | OWN-002, OWN-005, RES-003 → tabs of SITE-006 |
| One People directory | CUS-002 → drawer of CUS-001; CUS-005, 006, 007, 008 → tabs of CUS-003 |
| Payment settings move to the site | ADM-015→BILL-012, ADM-016→BILL-010, ADM-017→BILL-011, ADM-018→BILL-012 |
| Dues billing | FIN-012→BILL-005 |
| Duplicate reports | RPT-007/008/009→ACC-006/007/008, RPT-011 and RPT-004→COL-005, RPT-014→EXP-009; COL-002→FIN-002 |
| Duplicate inboxes and notices | HOME-003→APR-001, RES-006→RES-005 |
| Parking inventory | INV-009→PARK-002 |
| Personalization hub | GLOBAL-009, GUIDE-006, NOT-006 → tabs of GLOBAL-010 |
| Lead quick view | CRM-005 → drawer of CRM-002 |
| Portal aliases | PORTAL-006→PORTAL-008; PORTAL-009→PORTAL-004; PORTAL-016, 017, 019, 020 → states of PORTAL-015 |

### 3.5 New rows (69; 60 distinct)

| Family | Rows | Distinct | Gate |
|---|---:|---:|---|
| `HQ-*` Platform Supreme Admin | 25 | 20 | B (13), D (1), G (6) |
| `SITE-*` Sites and property structure (both editions) | 8 | 7 | C |
| `BILL-*` Billing accounts and dues | 15 | 12 | C (9), D (1), G (2) |
| `ENTRY-*` Built entry screens, now registered | 5 | 5 | Built |
| `GLOBAL-011..013` More page, access outcome pages, context switcher | 3 | 3 | Built / B / C |
| `PORTAL-028..030` Submission status, statements, welcome & setup | 3 | 3 | C, C, D |
| `GUIDE-007..010` HQ, building manager, resident dues and Sales tours | 4 | 4 | B, C, C, built |
| `ADM-022..023`, `MNT-009..011`, `RPT-018` | 6 | 6 | B, D, G |

## 4. V3.1 critical screen families: coverage

### 4.1 Supreme Admin (V3.1 doc 06): all 22 items are mapped, 18 in Gate B

| V3.1 item | Register | Surface | Gate |
|---|---|---|---|
| HQ Dashboard | HQ-001 | page | B |
| Tenants List | HQ-002 | page | B |
| Create Tenant Wizard | HQ-003 | wizard | B |
| Tenant 360 | HQ-004 | workspace | B |
| Edition Selector | HQ-005 | step of HQ-003 | B |
| Module/Feature Catalog | HQ-006 | page | B (read-only) |
| Module Dependency Matrix | HQ-007 | tab of HQ-006 (+ list alternative) | B |
| Tenant Module/Site Grants | HQ-008 | drawer of HQ-004 | B |
| Tenant Role/Entitlement Preview | HQ-009 (+ ADM-023 inside the preview) | overlay | B |
| Plan/Rates Versioning | HQ-010 | page | B (read-only) |
| Subscription Contract Builder | HQ-011 | step / page | B |
| Pricing Component Table | HQ-012 | state of HQ-011 | B |
| Pricing Simulator | HQ-013 | page | B |
| Usage Meter/Snapshot Explorer | HQ-014 | tab in B; explorer in G | B / G |
| Seat/Flat Eligibility Count | HQ-015 | drawer | B |
| SaaS Quote/Invoice Preview | HQ-016 | step | B |
| Trial/Renewal/Suspension | HQ-018 | drawer | B (activate, free plan) / G |
| Tenant Billing Audit | HQ-019 | tab of HQ-004 | B |
| Central Invoices/Credits/Payments | HQ-017 | page | G |
| Support Access | HQ-020 | page | G (Gate B proves the denial) |
| Branding/Domain | HQ-021 | page | G |
| Company Billing Reports | HQ-022 | page | G |

### 4.2 Maintenance-only client: all 24 items are mapped, 17 in Gate C (plus opening balances)

| V3.1 item | Register | Gate |
|---|---|---|
| Managed Sites | SITE-001, SITE-002 | C |
| Building/Block/Floor/Unit Explorer | SITE-003 | C |
| Bulk Flat Import + validation | SITE-004 | C |
| Owners/Residents/Payers | CUS-001 (people), RES-002 (units & payers) | C |
| Billing Account/Responsible Payers | BILL-001, BILL-002 | C |
| Charges/Rate Versions | BILL-003 | C |
| Charge Rule Overrides | BILL-004 | C |
| Billing Run Calendar/Builder | BILL-005, BILL-006 | C |
| Preview Assessment by Flat | BILL-007 | C |
| Approval/Posting | BILL-008 | C |
| Maintenance Invoice/Statement | FIN-003, COL-004 | C |
| Collection Dashboard | COL-001 | C |
| Aging/Arrears | COL-005 | C |
| Bank Beneficiary/QR Setup | BILL-010 | C |
| Transfer Proof Review | FIN-008, FIN-009 | C |
| Receipts/Credits/Refunds | FIN-005, FIN-006, BILL-014 (credit note), FIN-011 (credit view) in C; FIN-010 refunds in E | C / E |
| Reconciliation | BANK-003, BANK-004 | C |
| Online Gateway Settings Mock | BILL-011 | D |
| Maintenance Requests | MNT-002..004 | D |
| Work Orders/Technicians | MNT-005, MNT-006 | D |
| Visitors/Security | VIS-001..006 | D |
| Notices | RES-005 | D |
| Parking | PARK-001..006 | G |
| Site Reports | RPT-018 | G |
| *(also)* Opening balances | SITE-007 | C |

### 4.3 Resident PWA: all 17 items are mapped

| V3.1 item | Register | Status today | Gate |
|---|---|---|---|
| Welcome/Setup | PORTAL-030 | planned | D |
| My Property | PORTAL-002, PORTAL-003 | planned | D |
| Payments | PORTAL-004 | built (instalments) | C (dues) |
| Next Bill Breakdown | PORTAL-005 | planned | C |
| Pay Online Demo | PORTAL-006 → PORTAL-008 | partial | D (dues) |
| Site Bank/QR Details | PORTAL-007 | partial | C |
| Submit Payment Evidence | PORTAL-008 | built | C (dues) |
| Proof Verification Status | PORTAL-028 | planned | C |
| Receipt | PORTAL-010 | built | C (dues) |
| Past Statements | PORTAL-029 | planned | C |
| Maintenance Request | PORTAL-015 (+ states), PORTAL-018 | built / planned | D |
| Visitor Pass | PORTAL-015 (+ states) | built | D |
| Property Documents | PORTAL-011 | built | D (society documents) |
| Notices | PORTAL-023 | planned | D |
| Profile | PORTAL-024 | planned | D |
| Appearance & Accessibility | PORTAL-027 | partial (V3.1) | D |
| Help/Guided Tour | GUIDE-005 (built), GUIDE-009 | built / planned | C |

### 4.4 Personalization for every user type (Gate D)

| App | Screen | Shared component |
|---|---|---|
| Platform HQ | HQ-024 | One personalization hub |
| Backoffice (admins and staff) | GLOBAL-010 | One personalization hub |
| Resident PWA | PORTAL-027 | One personalization hub |
| Tenant theme policy | ADM-022 (within the HQ-021 guardrails) | — |

## 5. Design flaws that colour alone will not fix

These are taken from the Stage 1.5R screenshots (`docs/status/ui-stage-1.5R/screenshots/`) and from the code. Each has a fix and a gate.

| # | Flaw | Where seen | Fix | Gate |
|---|---|---|---|---|
| F-1 | **Navigation ignores licensing.** The sidebar and More list 11 areas to every user; 7 open "planned" pages. A society tenant would see Sales and Projects | `dashboard-1440-en.png` (sidebar), `more-390-en.png` | Nav, quick create, palette and widgets declare `requires {modules, permission}`; render from effective access | B |
| F-2 | **Context is developer-only and hidden on phones.** "All projects" is the only context. On a phone the switcher is an unlabeled icon, and the tenant name is truncated in the portal header | `sales-home-390-ur.png`, `portal-home-390-en.png` ("Larkspur Estates (…") | Site/project context with a visible current-context chip, full name available to screen readers and on focus | C |
| F-3 | **Hero-first dashboard.** At 1440×900, the featured-project photo and action centre fill the first screen; quick actions start at the fold (y ≈ 810). For a society manager the first screen must answer "billed, collected, awaiting verification, in arrears" | `dashboard-1440-en.png` | Role/edition compositions: figures and actions first, hero optional and smaller | C (society); developer re-order optional |
| F-4 | **The portal assumes a buyer with instalments.** "Next instalment 16 of 36"; the bottom bar has "Progress" (construction). A society resident needs "This month's bill" with the breakdown and the carried-forward balance shown separately | `portal-home-390-en.png` | Edition-aware portal home and bottom bar built from granted modules | C |
| F-5 | **Phone quick actions scroll sideways with the fourth tile cut off**, so actions are hidden with only a weak cue | `sales-home-390-ur.png` | 2×2 grid plus an "All actions" sheet, or a visible scroll affordance with a count | B (shared component) |
| F-6 | **Prototype tools mixed with product areas.** "Design system lab" and "Practice mode" appear in the sidebar and More for every persona | `dashboard-1440-en.png`, `more-390-en.png` | "Prototype tools" switch, off in customer demos | B |
| F-7 | **Settings split across four places**: Preferences, Accessibility preferences, Guided tours, Notifications, plus a separate language button | `more-390-en.png` | One personalization hub with tabs and live preview | D |
| F-8 | **No text-size control independent of browser zoom.** The authored dark palette is hidden; no density or reading mode | `PreferencesProvider.tsx` (motion, contrast, sound, text guide only); `theme.css` night set "not exposed" | Font-scale tokens (rem-based), theme switch, palettes validated by the contrast tests, density | D |
| F-9 | **The demo shows only one product.** Get started offers three developer roles; nothing demonstrates the society product | `entry-demo-role-*.png` | Demo tenant chooser: Developer or Society | C |
| F-10 | **Developer vocabulary is hard-wired** ("Customers", "Projects", "Instalment") | Throughout | Label keys by tenant type (A1 §7) | B (nav) / C (screens) |
| F-11 | **No proven dense-table pattern on phones.** Billing preview (80 flats), aging and the proof queue need sticky headers, row actions, a card fallback and a labelled scroll region; today only record-card lists exist | Code: `packages/ui/src/data` | Accessible responsive `DataTable` with tests at 320 px and 200 % | C |
| F-12 | **The phone More page is one very long list** (about 2,350 px at 390 wide, 20+ cards) | `more-390-en.png` | Grouped sections with search. The list also shrinks once F-1 filters by grants | B |
| F-13 | **"Not licensed", "not permitted" and "not built yet" all look the same**: every gap opens the same planned page | Register resolver | Distinct access outcome pages (GLOBAL-012) | B |
