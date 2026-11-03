# Gate S.2a: function matrix

The owner's brief "PROPERTYOS — GATE S.2a SOCIETY STAFF OPERATIONS" and GitHub Issue #11 asked for two things on `feature/gate-s2a-society-staff`: stabilise GPT's foundation `311dfb5`, then build society staff operations for Al-Noor Residency. This matrix lists each requirement, where it is built and what checks it.

**Status words:**
- **BUILT**: works end to end on the mock API;
- **PARTIAL**: works, with a named part left to a later, unauthorised slice;
- **PLANNED**: not built.

**Where things are** (paths relative to the repository root):
- Office pages: `apps/backoffice/src/pages/society/hr/`.
- Residents' tab: `apps/customer-web/src/pages/community/CommunityHomePage.tsx`.
- Mock API: `packages/fixtures/src/hr/`.
- Contracts: `packages/contracts/src/hr.ts`.
- Screenshots: `docs/status/gate-s2a/screenshots/`.

**Test names used below:**
- `api` = `hr.api.test.ts` (20);
- `closure` = `hr.closure.api.test.ts` (14, Issue #12; on the fictional multi-site organisation of `multisite.fixture.ts`);
- `vectors` = `hr.test.ts` on `hr-roster.vectors.json` (52);
- `s2a.spec` = `tests/e2e/s2a.spec.ts` (23, axe inside);
- `smoke` = `tests/smoke/s2a.smoke.spec.ts` (4, Firefox and WebKit);
- `evidence` = `tests/evidence/gates2a.evidence.spec.ts`.

## 1. Starting point

| # | Requirement | Status | Where | Checked by |
|---|---|---|---|---|
| 1.1 | Inspect and test the existing branch first; do not restart or overwrite GPT's work | BUILT | `311dfb5` reviewed and tested as received (tsc, lint, i18n, vitest 1,345 / 1,345); nothing reversed ([report §2](GATE_S2A_REPORT.md#2-review-of-gpts-foundation-311dfb5)) | commands in [`test-results.md`](test-results.md) |
| 1.2 | One deeply connected system: HR dashboard → employees → Employee 360 → roster → attendance → leave → documents | BUILT | section links on every HR screen (`HrNav`); records link both ways; the dashboard's figures open filtered lists | `s2a.spec` (flows cross the screens); `api` (dashboard links) |
| 1.3 | Contextual tabs, related-record links, drawers, search, validation, notifications, no reloads | BUILT | URL tabs (deep-linkable); drawers for assign, swap, cover, leave, documents, status, profile, corrections and advances; toasts; searchable comboboxes | `s2a.spec` |
| 1.4 | Limestone & Evergreen preserved | BUILT | shared kit and tokens only | evidence (`a01`…`a16`) |

## 2. Screens and register

| # | Requirement | Status | Where | Checked by |
|---|---|---|---|---|
| 2.1 | HR-001…HR-010, with HR-011 On duty now as a state of HR-010, at the original registered routes | BUILT (HR-008 PARTIAL) | [report §3.2](GATE_S2A_REPORT.md#32-screens) | `register.spec` (every address opens); `s2a.spec` |
| 2.2 | Reconcile the V3.2 delta with the register; distinguish BUILT, PARTIAL and PLANNED | BUILT | `docs/ui/screen-register.csv`: 439 rows, 354 distinct (131 / 36 / 187) | `sync-screen-register.mjs`; `register.spec` counts |
| 2.3 | Do not overwrite the developer-edition HR scope | BUILT | edition `DEV+COMM (add-on for COMM)`, gate "S.2 (society slice); E (developer specifics)"; developer organisations see HR as planned | `s2a.spec` (Larkspur → planned HR-001); `api` (404 for a developer) |

## 3. Reference flow 1: new employee to active duty

| # | Requirement | Status | Where | Checked by |
|---|---|---|---|---|
| 3.1 | Validation, searchable dropdowns, duplicate checks | BUILT | New employee: CNIC 13 digits, Pakistani mobile, 18 or over, start date window; role combobox; the same CNIC is refused, naming the record | `s2a.spec`, `smoke`, `api`, vectors (CNIC, phone) |
| 3.2 | Effective dates and status controls | BUILT | Employee 360 → change status: suspend, end, reinstate, rehire, each with a date and a reason; periods kept | `api` (effective dates) |
| 3.3 | Site and legal-entity isolation | BUILT | entity and site chosen explicitly; only this organisation's own | `api` |
| 3.4 | Permission-controlled actions | BUILT | actions appear only where the server would allow them (`actions` in each view) | `api`, `s2a.spec` |
| 3.5 | Toasts and drawers, no reloads; to active duty | BUILT | 360 → assign drawer → roster → On duty now check-in → 360 shows on duty | `s2a.spec`, `smoke`; evidence `b01`…`b07`, video |

## 4. Reference flow 2: security guards' weekly roster

| # | Requirement | Status | Where | Checked by |
|---|---|---|---|---|
| 4.1 | Morning, evening, night; overnight shifts; weekly calendar | BUILT | week grid (desktop), day picker (phone); night ends the next day | vectors (windows across month and year end); `s2a.spec` |
| 4.2 | Assign, swap, unassign | BUILT | duty drawer: swap with a listed duty; remove with a reason; started duties locked | `api`, `s2a.spec` |
| 4.3 | Overlap prevention | BUILT | `assignBlock`: any site, back to back allowed | vectors (7 overlap, 3 multi-site); `api` |
| 4.4 | Leave conflict warnings | BUILT | approved leave refuses; pending leave asks first; roster warnings | `api`, `s2a.spec`; evidence `c02`, `a16` |
| 4.5 | Minimum-staff coverage warnings | BUILT | per shift, a warning never a refusal | vectors (coverage); `s2a.spec` |
| 4.6 | Published vs draft | BUILT | publish with a change count; next week's draft seen by the office only; residents see published weeks only | `api`, `s2a.spec` |
| 4.7 | On Duty Now: who is on duty, absent, short-staffed, replacement, next duty | BUILT | HR-011: present, late, not in, absent; Short; **Bring in cover** with suggested people and the reasons others cannot; next shift | `api`, `s2a.spec`, `smoke`; evidence `c05`…`c07`, video |
| 4.8 | No fake emergency function; SOS prohibited | BUILT (none) | nothing of the kind | code review |

## 5. Reference flow 3: attendance and leave

| # | Requirement | Status | Where | Checked by |
|---|---|---|---|---|
| 5.1 | Check-in and out; present, absent, late; overnight | BUILT | Attendance and On duty now; late after the grace period; absent only after it; a night shift belongs to its start day | vectors (lateness); `api`; `s2a.spec` |
| 5.2 | Corrections; recording separate from approving | BUILT | `attendance.record` asks; `attendance.adjust` decides | `api`, `s2a.spec`, `smoke` |
| 5.3 | Nobody approves their own sensitive corrections | BUILT | `checker`: own request or own record refused | `api`, `s2a.spec`, `smoke` |
| 5.4 | Leave apply, approve, reject; history; conflicting dates; audit | BUILT | leave drawer (from 360 or the list); overlapping leave refused; conflicting duties listed; approval makes them roster gaps; decisions with names, dates and notes | `api`, `s2a.spec` |
| 5.5 | Leave balances that depend on an unapproved policy shown as policy-dependent | BUILT | "No leave balance is calculated" in the leave drawer and the 360 Leave tab; days taken recorded | `s2a.spec` |

## 6. Employee 360

| # | Requirement | Status | Where | Checked by |
|---|---|---|---|---|
| 6.1 | Overview, Employment, Assigned sites, Duty, Attendance, Leave, Documents, Activity | BUILT | tabs; assigned sites in Employment | `s2a.spec`; evidence `a04`…`a06`, `b07` |
| 6.2 | Advances and loans only when authorised | BUILT | tab only with an advances permission; `advances` absent from the payload otherwise | `api` |
| 6.3 | Sensitive financial data never in the directory or in resident responses | BUILT | directory and resident payloads carry no money or personal data | `api` (`not.toMatch`) |

## 7. Advances and loans (HR-007, HR-008)

| # | Requirement | Status | Where | Checked by |
|---|---|---|---|---|
| 7.1 | Request, loan, approval states, outstanding, repayment schedule, evidence, audit | BUILT (outstanding: PARTIAL) | request drawer (kind, amount, instalments, reason, evidence); states; planned schedule (last instalment takes the remainder); history. Since Issue #12 nothing is "outstanding": no payment can be verified | vectors (schedules); `api`, `s2a.spec` |
| 7.2 | An approval or repayment instruction is never cash paid or received; only a matched, authorised settlement changes cash or reduces the obligation | BUILT (closure) | "Approved — payment not verified". No paid, repaid or owed state exists; linking any voucher is refused (Issue #12, O8) | `closure` (9 voucher kinds posted through S.1, each refused); `api`; `s2a.spec`; evidence `e02`…`e05` |
| 7.3 | Preserve S.1 accounting and reconciliation guarantees | BUILT | HR reads nothing from the cashbook and changes nothing in it | `closure` (vouchers unchanged after the attempts); full regression (S.1 specs) |
| 7.4 | Payroll or banking needed → explicitly PARTIAL; no invented bank transactions | PARTIAL | HR-008 read only: verified payment evidence, staff payment by bank and payroll deduction are S.2b; the screen says so and lists what verification will need | `s2a.spec` (`hr-settlement-partial`, `hr-settlement-needs`, no link) |

## 8. Documents (HR-009)

| # | Requirement | Status | Where | Checked by |
|---|---|---|---|---|
| 8.1 | List, categories, expiry, missing warnings, history | BUILT | Needs attention, Missing, Expired, Expiring, Valid; required documents per department; versions | vectors (expiry); `api`, `s2a.spec` |
| 8.2 | Simulated upload, no real storage | BUILT | name, type and size only (PDF, JPG or PNG up to 5 MB) | `s2a.spec`; evidence `e01` |
| 8.3 | Access restrictions | BUILT | files, numbers and history only with `hr.documents.manage`; numbers masked | `api` |

## 9. Resident-visible staff

| # | Requirement | Status | Where | Checked by |
|---|---|---|---|---|
| 9.1 | Duty role and approved public profile only; never salary, phone, CNIC, bank, loans, attendance, address or documents | BUILT | Community → Staff on duty; no check-in time either | `api` (`not.toMatch`); `closure`; `s2a.spec` |
| 9.2 | Name or photo only with consent and society policy | BUILT | consent recorded by the office; "show name"; "show photo" shows initials (no photos stored); names for confirmed staff only | `api`, `closure`, `s2a.spec` |
| 9.3 | Verified site membership; independent of Community Chat and Hub | BUILT | `residentOps` with `hr` + `hr.shifts` for the resident's site; another site's staff never appear | `api`; `closure`; `s2a.spec` (chat and hub withdrawn) |
| 9.4 | Issue #12: confirmed on duty, scheduled and unavailable kept apart; never describe an unconfirmed employee as on duty | BUILT | `confirmed` (arrival recorded), `expected` (role and post only), `unavailable` (a count); two labelled lists | `closure` (7); `api`; `s2a.spec`; smoke; evidence `f01`, `f02`, `g05`, `g06` |

## 10. Licensing and security

| # | Requirement | Status | Where | Checked by |
|---|---|---|---|---|
| 10.1 | One shared HR module; optional add-on for societies; payroll separate; `hr.shifts` | BUILT | GPT's catalogue entry, kept | `platform.test.ts` |
| 10.2 | Other societies get no HR automatically; an explicit fictional Al-Noor amendment | BUILT | `tenant-directory.ts`, dated 2026-10-12 | `api`; `platform.test.ts` |
| 10.3 | No change to general pricing or edition presets | BUILT (unchanged) | — | `platform.test.ts` (18,700 / 3,700) |
| 10.4 | Tenant, legal-entity and site isolation; employee scoping; role permissions; effective dates; suspended tenants; direct route and API authorisation; sensitive documents | BUILT (record-level since Issue #12) | `scope.ts`; [`SECURITY_FINDINGS.md`](SECURITY_FINDINGS.md) §1a, §2 | `closure`, `api`, vectors, `s2a.spec` |
| 10.5 | Guards, residents and unrelated roles cannot reach confidential HR | BUILT | the supervisor gets the roster and attendance only; residents get the public tab only; the technician gets nothing | `api`, `s2a.spec` |
| 10.6 | Issue #11: separate `hr.manage`, `shifts.manage`, `attendance.record`, leave and financial scopes; `hr.view` is not a salary permission | BUILT | nine HR permissions | `api` |
| 10.7 | Issue #11: maker and checker for adjustments | BUILT | corrections, leave, advances | `api` |
| 10.8 | Issue #11: expired contracts lose duty visibility | BUILT | ended employment removes later duties and residents' visibility | `api`, vectors |
| 10.9 | Issue #11: no live location tracking, emergency or SOS implication | BUILT (none) | — | code review |
| 10.10 | Issue #11: multi-site overlap and overnight cases | BUILT | — | vectors |

## 11. Design and accessibility

| # | Requirement | Status | Where | Checked by |
|---|---|---|---|---|
| 11.1 | Responsive: desktop, tablet, 390 and 320 phones | BUILT | — | `s2a.spec` (1440, 768, 390 with axe and no sideways scroll; 320 × 700 element checks) |
| 11.2 | EN and UR, RTL | BUILT | `hr` namespace in both languages; bidi-safe times | `s2a.spec` (both languages); evidence (390 Urdu) |
| 11.3 | 200 % text | BUILT | — | `s2a.spec` (100, 150 and 200 % at 320 px); evidence `g01`…`g05` |
| 11.4 | Dark mode, high contrast, reduced motion | BUILT | D.1 hub | `s2a.spec` (dark plus high contrast with axe); tests run with reduced motion |
| 11.5 | No D.2 clipping or toast-overlay defects | BUILT | shared components; tabs and select fixed for 320 px | `s2a.spec` layout checks and keyboard walks |
| 11.6 | Issue #11: EN and UR at 320, 390, 768 and 1440, including 200 % | BUILT | — | `s2a.spec` |

## 12. Testing, documents and delivery

| # | Requirement | Status | Where | Checked by |
|---|---|---|---|---|
| 12.1 | TypeScript, ESLint, i18n; unit and API; staff and shift vectors; attendance and leave regression; cross-tenant and site security | done | — | [`test-results.md`](test-results.md) |
| 12.2 | Full combined E2E, retries off; Firefox and WebKit smoke; axe; EN and UR responsive | done | — | [`test-results.md`](test-results.md) |
| 12.3 | Gates B, C, D and S.1 keep working | done | — | full regression |
| 12.4 | Documents: report, matrix, results, security, manual checks, screenshots and video | done | `docs/status/gate-s2a/` | — |
| 12.5 | S.2b excluded: PAY-001…007, payroll, disbursement, statutory, bank transfers, payroll accounting | not built (as instructed) | register rows unchanged | — |
| 12.6 | No `main`, merge, VPS, Bingoo, Laravel, migrations, live payments, SOS, Rentals or Developer ERP | respected | — | `git diff --stat` touches only the frontend, fixtures, tests and docs |

## 13. Issue #12 final security closure

| # | Requirement | Status | Where | Checked by |
|---|---|---|---|---|
| 13.1 | P0: verify tenant, legal entity and site for each record; respect effective-dated site allocations | BUILT | `scope.ts` (`scopeOf` through the shared `decide`; `homeSites`; `employeeVisible`; `assignmentVisible`) | `closure` |
| 13.2 | P0: filter records before lists, counts and summaries | BUILT | `visibleEmployees` and `visibleLive` in every list, count, KPI, candidate list and option list | `closure` (19 identifying strings absent from 11 responses; counts and department totals) |
| 13.3 | P0: direct URLs to unauthorised records get a non-disclosing refusal | BUILT | `findEmployee`, `findAssignment`, `findLeave`, `findAdvance`, `correctionVisible`, `employeeIn`, `templateIn`; `?site=` | `closure` (14 path ids and 5 body ids answered exactly like never-issued ids) |
| 13.4 | P0: revoked site access takes effect immediately | BUILT | scope worked out on every request | `closure` (site scope removed, permission removed, module withdrawn) |
| 13.5 | P0: cross-site overlap still detected without exposing other sites | BUILT | `assignBlock` over the one HR state; refusal names only the employee | `closure`; vectors |
| 13.6 | P0: multi-site administrators keep access; transfers and effective dates update access | BUILT | `all` and `legal_entity` scopes; dated allocations; `other_sites` for employment changes | `closure` |
| 13.7 | P1: residents can tell verified staffing from scheduled staffing; consent, privacy, independence, Pay action, no emergency implication | BUILT | `resident.ts`, `CommunityHomePage.tsx` | `closure` (7), `api`, `s2a.spec` (incl. Pay at 390 px), smoke, 320 px / 200 % in both languages |
| 13.8 | P1: no advance DISBURSED or REPAID without evidence identifying the employee and the advance | BUILT (option B) | linking refused; paid, repaid and owed states removed; HR-008 read only (PARTIAL) | `closure` (wrong employee, wrong advance, wrong entity and site, supplier payment, unrelated receipt, reused, reversed before and after, the right-looking voucher); `s2a.spec` |
| 13.9 | P1: maker ≠ checker preserved | BUILT | `checker` | `closure`; `api` |
| 13.10 | Complete combined regression on the final code, retries off; Firefox and WebKit; axe; 320 px / 200 % | done | — | [`test-results.md`](test-results.md) § Issue #12 closure |
