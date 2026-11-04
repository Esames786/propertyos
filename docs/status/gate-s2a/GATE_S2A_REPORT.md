# Gate S.2a: Society staff operations (Al-Noor Residency)

**Status: built, frontend only, on typed mock APIs. The Issue #12 and Issue #14 closures are done; stopped for GPT and owner final review.**

- **Branch:** `feature/gate-s2a-society-staff`. It continues GPT's foundation commit `311dfb5` (on the approved D.3 closure `c497942`, GitHub Issue #11).
  - `95d70d0` is the S.2a gate, reviewed in Issue #12: functionality provisionally accepted.
  - `0e14895` makes the three Issue #12 corrections ([§11](#11-issue-12-final-security-closure)): HR records limited to the reader's sites and legal entities (P0), residents told confirmed staff from scheduled staff (P1), and no voucher able to make a staff advance paid (P1).
  - `d7cb324`, the Issue #14 closure on `0e14895`, makes two more corrections ([§12](#12-issue-14-final-closure)). The commit after it only records this SHA in the documents:
    - a manager who sees a multi-site employee through one site can no longer change what all of the employee's sites share (P0);
    - supervisors see only their own departments' staffing (P1).
  - The follow-up commit closes the two residual edges from GPT's review of `31bb0ed` ([§12.6](#126-follow-up-review-of-31bb0ed)):
    - a refused assignment no longer shows whether an employee id exists;
    - a supervisor with no staffing site gets "not found" rather than a default site.
- **Sources:**
  - the owner's brief "PROPERTYOS — GATE S.2a SOCIETY STAFF OPERATIONS" and Issue #11;
  - V3.2 at `0e57604` (`docs/blueprint/v3.2/*`): execution plan §S.2, matrix §5.2 (HR permissions), D-22 (HR as a society add-on) and D-26 (SOS parked), and the HR rows of the register delta.
- **Not done, as instructed:**
  - nothing of S.2b: no payroll run, payslip, statutory calculation, disbursement, bank transfer or payroll journal (PAY-001…007 stay planned);
  - no Laravel, migrations, live payments or real bank transactions;
  - no SOS, emergency-response or live-location function;
  - no change to general pricing or to edition presets;
  - nothing deployed to the VPS preview; Bingoo untouched; `main` untouched; no merge.
- **How it runs:** in the browser against the fail-closed mock server. Rules are enforced by the server, not by the screens.
- **Data:** fictional. Al-Noor Residency and its people come from the fictional demo. Identity numbers are made up. Phone numbers are `+92 300 00002xx`. Files are simulated: name, type and size only; nothing is stored.
- **Not claimed:**
  - WCAG conformance: automated checks pass; the manual screen-reader and device checks are open in [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md);
  - that HR-008 settles money. It is read only: no voucher can be linked, and no advance is ever shown as paid, repaid or owed. Verified payment evidence, staff payment by bank and payroll deduction are S.2b ([§8](#8-partial-and-known-limitations), [§11.3](#113-p1-staff-advance-settlement-integrity)).

Detail:
- every check's result: [`test-results.md`](test-results.md);
- requirement by requirement: [`FUNCTION_MATRIX.md`](FUNCTION_MATRIX.md);
- security and privacy: [`SECURITY_FINDINGS.md`](SECURITY_FINDINGS.md).

## 1. How to try it

`npm run dev` starts the office app (5173) and the resident app (5174). In the office app: `/backoffice/get-started` → **Explore the society demo**, then switch person with the demo's persona menu. The demo's business date is Monday 26 October 2026; the time of day is the computer's clock.

| Where | Who | What to look at |
|---|---|---|
| Office → **HR** (`/backoffice/hr/hr-dashboard`) | **Imran Qureshi**, building manager | Staff counts, who is on duty, short-staffed shifts, documents and decisions waiting. Every figure opens its records, already filtered. |
| HR → **Employees** → **New employee** | Imran | Validation (CNIC, mobile, age, start date). Asif's CNIC is refused as a duplicate, naming his record. The legal entity and site are chosen explicitly. After saving, Employee 360 opens. |
| **Employee 360** (`/backoffice/hr/employee-360-workspace/emp_anr_001`) | Imran; then **Ayesha Malik** (treasurer) | Tabs:<br>• Overview, Employment (effective-dated status changes), Duty, Attendance, Leave, Documents, Activity;<br>• **Advances** only with an advances permission.<br>The full identity number, phone and address appear only with `hr.manage` (others see the number masked). Also: the resident-facing profile and consent. |
| **Duty roster** (`/backoffice/hr/roster`) | Imran | The guards' week: morning, evening and the overnight night shift. Warnings for short staffing and leave. Assign, swap or remove (with a reason). Publish, or open next week's draft. |
| Roster → **On duty now** | **Shahid Hussain**, security supervisor | Who is in, late or absent. Mark the absent guard; **Bring in cover** suggests people and says why the others cannot. Shows the next shift. Since Issue #14 a supervisor's roster and board show **only his own departments**; names are plain text, since he cannot open staff records. |
| **Attendance** (`/backoffice/hr/attendance`) | Shahid; **Naveed Anjum** (maintenance supervisor) | Each supervisor sees and records only his own departments: Naveed has maintenance and housekeeping, also on the roster and board. A correction is a request, never an edit. |
| **Leave & corrections** (`/backoffice/hr/leave-attendance-adjustments`) | Imran, then **Rabia Hashmi** (committee secretary, administrator) | Imran decides Shahid's requests but not his own: those go to Rabia. Approving Karim's leave turns his nights into gaps on the roster. |
| **Documents** (`/backoffice/hr/employee-documents`) | Imran | Missing, expired and expiring documents. Upload is simulated; numbers are masked. |
| **Advances & loans** (`/backoffice/hr/employee-advances`) → **Settlement** | Imran raises; Ayesha approves ("Approved — payment not verified"); **Saba Javed** (accounts) opens Settlement | Settlement is read only: it explains what a verified payment will need. No voucher can be linked, so nothing is shown as paid, repaid or owed (Issue #12). |
| Resident app → Community → **Staff on duty** | **Kamran Siddiqui** (A-101) | From the published roster, in three states (Issue #12): **confirmed** (the office recorded the arrival; a name only with consent), **scheduled, not yet confirmed** (role and post only), and a count of staff **unavailable**. No phone or personal detail. Works without chat and the hub. |

## 2. Review of GPT's foundation `311dfb5`

The branch was inspected and tested before anything was added. The commit:

- adds six permissions to `packages/contracts/src/permissions.ts`: `hr.manage`, `shifts.manage`, `attendance.record`, `attendance.adjust`, `leave.manage` and `hr.documents.manage`;
- makes `hr` an **optional** add-on for the community and portfolio editions, with the feature `hr.shifts`, in `packages/fixtures/src/platform/catalog.ts`;
- adds one catalogue test: HR is not in any preset, payroll still requires HR, and the dependency check passes.

As received, it was checked with `tsc`, `eslint`, the i18n parity check and `vitest`: clean, **1,345 / 1,345**. Nothing in it was reversed. Everything below builds on it:

- the six permissions are mapped to the `hr` module;
- two financial permissions are added for advances;
- the catalogue entry is used as GPT wrote it;
- no preset or price changed. The platform test still prices the Al-Noor selection at 18,700 / 3,700.

## 3. What S.2a adds

### 3.1 Model and mock API

**Contracts:** `packages/contracts/src/hr.ts`. Employees, employment periods, the public profile, shift templates, assignments and the roster week, the On duty board, attendance and corrections, leave, documents, advances and settlement links, the dashboard and the residents' view.

**Server:** `packages/fixtures/src/hr/`:
- `rules.ts`: pure rules, tested by `hr-roster.vectors.json`;
- `state.ts`: the seeded Al-Noor staff;
- `views.ts`: what each person may see;
- `handlers.ts`: 36 office endpoints;
- `resident.ts`: 1 resident endpoint.

Every endpoint runs through the shared fail-closed checks:
- licence (`hr`, plus `hr.shifts` for the roster, attendance and the residents' tab);
- permission;
- tenant suspension (reads continue; changes are refused);
- society only (a developer organisation gets "not found");
- the operating site.

| Area | Endpoints | Permission |
|---|---|---|
| Overview | `GET /hr/dashboard` | `hr.view` |
| Employees | `GET /hr/employees`, `GET /hr/employees/:id`; `GET /hr/employees/options`, `POST /hr/employees`, `PATCH /hr/employees/:id`, `POST …/status`, `POST …/profile` | read `hr.view`; change `hr.manage` |
| Roster | `GET /hr/roster`, `GET /hr/roster/now`; `GET /hr/roster/candidates`, `POST /hr/roster/assignments`; `POST …/unassign`, `…/swap`, `POST /hr/roster/publish` | read `hr.view`, `shifts.manage` or `attendance.record`; assign `shifts.manage` (or `attendance.record` for cover only, [§6](#6-decisions-made-in-s2a)); the rest `shifts.manage` |
| Attendance | `GET /hr/attendance`; `POST /hr/attendance/:id/check-in`, `…/check-out`, `…/absent`, `…/corrections` | read `hr.view` or `attendance.record`; record `attendance.record` (own departments unless `hr.manage`) |
| Corrections | `POST /hr/corrections/:id/approve`, `…/reject` | `attendance.adjust`, never the requester or the person concerned |
| Leave | `GET /hr/leave-adjustments`; `POST /hr/leave`, `…/approve`, `…/reject`, `…/cancel` | request `hr.manage` or `leave.manage`; decide `leave.manage`, never one's own |
| Documents | `GET /hr/documents`, `POST /hr/documents` | read `hr.view` (files and history `hr.documents.manage` only); add `hr.documents.manage` |
| Advances | `GET /hr/advances`; `POST /hr/advances`, `…/withdraw`; `POST …/approve`, `…/reject`; `POST …/link` (always refused since Issue #12; the candidates route is removed) | `hr.advances.manage`; decide `hr.advances.approve`, never the requester or the staff member |
| Residents | `GET /portal/community/staff` (also in the Community home) | resident portal + `hr` with `hr.shifts` for the resident's site |

**Rules worth knowing:**

- **Time.** Shift windows are instants at +05:00, and a night shift ends the next morning. The demo's "now" is the business date with the computer's time of day.
- **Booking.** Nobody is double-booked at any site; back-to-back shifts are allowed.
  - Approved leave refuses a duty.
  - Pending leave asks first (`leave_pending`, then "assign anyway").
  - Leave applies to a shift's own date.
- **Coverage.** Counts everyone expected except absent staff and staff on leave. A shortage is a warning, never a refusal.
- **Duties that have started cannot be changed.** A past week cannot be published.
- **Effective dates.** Ending someone's employment removes their duties after the end date and keeps the ones before it. Rehiring starts a new period.
- **Maker and checker.** Enforced by principal on corrections, leave and advances. Nobody decides their own request or a record about themselves (`maker_checker_required`, `own_record`).
- **Advance states.** Submitted → approved ("approved — payment not verified"), or rejected or withdrawn. Since Issue #12 there is no paid, repaid or owed state: payment evidence cannot be verified until S.2b ([§11.3](#113-p1-staff-advance-settlement-integrity)).
- **Record scope.** Since Issue #12, every read and action is limited to the reader's HR sites and legal entities ([§11.1](#111-p0-multi-site-hr-record-isolation)).

### 3.2 Screens

All of them use the original registered addresses.

| ID | Screen | Address | Status |
|---|---|---|---|
| HR-001 | HR overview | `/backoffice/hr/hr-dashboard` | BUILT |
| HR-002 | Employees | `/backoffice/hr/employees-list` | BUILT |
| HR-003 | Employee 360 | `/backoffice/hr/employee-360-workspace/:id`; the register address opens the directory | BUILT |
| HR-004 | New employee | `/backoffice/hr/new-employee` | BUILT |
| HR-005 | Attendance | `/backoffice/hr/attendance` | BUILT |
| HR-006 | Leave and corrections | `/backoffice/hr/leave-attendance-adjustments` | BUILT |
| HR-007 | Advances and loans | `/backoffice/hr/employee-advances` | BUILT |
| HR-008 | Advance and loan settlement (read only since Issue #12) | `/backoffice/hr/employee-advance-settlement` | **PARTIAL** |
| HR-009 | Documents | `/backoffice/hr/employee-documents` | BUILT |
| HR-010 | Duty roster (new) | `/backoffice/hr/roster` (`?week=`, `?site=`, `?tab=`) | BUILT |
| HR-011 | On duty now (state of HR-010) | `/backoffice/hr/roster?tab=now` | BUILT |
| PORTAL-036 | Community home: **Staff on duty** tab | `/customer/portal/community?tab=staff` | built inside the D.3 screen |

**Moving between screens:**
- Every HR screen carries the same section links (overview, employees, roster, attendance, leave and corrections, documents, advances). Each link appears only to people who may open it.
- The office menu gains **HR**, **Duty roster** (also for supervisors) and **Staff advances** (also for finance). Each is gated by module, feature and permission.
- Records link both ways: employee ↔ duty ↔ attendance ↔ correction ↔ leave ↔ documents ↔ advance ↔ voucher.
- Actions open in drawers; results appear as toasts; nothing reloads the page.

### 3.3 Licensing and roles

- **Licence.** Al-Noor gets HR through an explicit, dated, fictional amendment: `{ module: 'hr', sites: 'all', from: '2026-10-12' }` and the feature `hr.shifts` (`tenant-directory.ts`). No preset includes HR, so no other society gains it. Larkspur (the developer demo) has HR in its plan, but society HR answers it "not found", and its HR screens stay planned (Gate E).
- **Demo-only withdrawal.** The demo can withdraw the add-on in one tab (`demo-licence.ts`, remove-only), to show "not in your plan" and the residents' tab disappearing.
- **Roles** (starter roles; a grant counts only where the organisation is licensed):

| Role | HR permissions |
|---|---|
| Administrator | all nine |
| Manager | all except `hr.advances.approve` |
| Treasurer | `hr.advances.approve` only |
| Accounts officer (Al-Noor) | `hr.advances.manage` only (raises and withdraws requests; linking vouchers is disabled since Issue #12) |
| Security, Maintenance | `attendance.record` only, for the departments they supervise |
| Technician, residents | none |

## 4. Reference flows

| Flow | Verified by | Evidence |
|---|---|---|
| **1. New employee to active duty.** Validation, duplicate CNIC, explicit legal entity and site, Employee 360, tonight's night shift ("ends next day"), the supervisor checks him in, and Employee 360 shows him on duty | `s2a.spec` (axe on each step); `hr.api.test` (flow 1, effective dates); smoke in Firefox and WebKit | `b01`…`b07`; video `new-guard-to-active-duty-desktop-en.webm` |
| **2. The guards' weekly roster.** Morning, evening and overnight shifts; assign, swap and remove with a reason; overlap refused; approved leave refused and pending leave asked first; minimum-staff warnings; publish; next week from draft to published. **On duty now:** present, late and absent; short-staffed shifts; a suggested replacement brought in; the next shift. No emergency or SOS function | `s2a.spec` (2 tests); `hr.api.test` (3 tests); vectors (windows, overlap, coverage, multi-site); smoke | `c01`…`c07`, `a07`, `a08`, `a16`; video `absent-guard-replaced-desktop-en.webm` |
| **3. Attendance and leave.** Check-in and check-out, present, absent and late; overnight; a correction requested by the recorder (`attendance.record`) and decided by someone else (`attendance.adjust`); nobody decides their own; leave apply, approve and reject; overlapping leave refused; conflicts listed; approved leave becomes a roster gap; history and audit. Leave balances are shown as policy-dependent | `s2a.spec` (2 tests); `hr.api.test` (3 tests); smoke | `d01`…`d04`, `a10`…`a12` |

## 5. Design and accessibility

- **Style.** Limestone & Evergreen tokens and the shared kit throughout. English and Urdu (RTL), with full Urdu translations in a new `hr` namespace. Dark mode and high contrast follow the D.1 hub.
- **Automated checks:**
  - every S.2a screen, in both languages, at 1440, 768 and 390 px: axe and no sideways scroll;
  - at 320 × 700 with 100, 150 and 200 % text, every screen, the assign drawer and the residents' tab are checked element by element: nothing clipped, spilled or broken mid-word;
  - keyboard walks at 320 px / 200 % on the roster, On duty now and Employee 360: no focused control hidden under the header or the bottom bar;
  - dark mode with high contrast at 390 px.
- **D.2 defects.** S.2a uses the shared toast and drawer components with their D.2 fixes, unchanged; drawers keep their actions in their own footers. No S.2a test checks toast placement on its own: the keyboard walks and the 320 px layout checks cover the screens, not the toasts.
- **Fixed during this gate** (found by the 320 px checks and by reviewing the evidence):
  - **Shared tabs** (`packages/ui/src/layout/Tabs.tsx`): tabs that do not fit now wrap to a second row, and a long label wraps at its spaces. Before, they scrolled out of sight; at 200 % text even one "Attendance corrections (2)" tab was wider than a 320 px screen. Desktop is unchanged, since everything fits there.
  - **Shared select** (`ChoiceFields.tsx` `SelectControl`): a long value now wraps inside the field instead of running past it. Example: "Al-Noor Residency Owners' Association (Demo)".
  - **Single-column grids** for the S.2a forms and filters, so narrow screens do not widen them.
  - Long button labels and references wrap whole (no "ANR-AD-" / "0002" split).
  - Employee names and dates in the corrections list are 24 px targets.
  - **Times in Urdu.** The organisation's times carry Latin AM/PM in Urdu as well. Inside an Urdu line, the bidi algorithm reordered "7:00 AM – 3:00 PM" into "AM – 3:00 PM 7:00". Each HR time is now isolated, and a range flows in the page's direction: in Urdu the start time stands on the right, where reading begins. The same isolation is applied to the residents' staff tab. The shared `DateTime` component itself is not isolated; see [`SECURITY_FINDINGS.md`](SECURITY_FINDINGS.md) §4.
- **Screen-reader and device checks:** listed in [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md), not performed.

## 6. Decisions made in S.2a

These are prototype choices, open to the owner:

1. **Two more permissions** beyond GPT's six: `hr.advances.manage` (request, withdraw, link vouchers) and `hr.advances.approve` (decide). Money is apart from `hr.view`: `hr.view` never shows advances, and shows identity numbers only masked (`35202-•••••••-1`). Pay is not modelled at all (S.2b).
2. **Supervisors record their own departments only.** `attendance.record` covers the departments the person supervises (Shahid: security; Naveed: maintenance and housekeeping), unless the person also holds `hr.manage`.
   - The matrix (§5.2) grants `attendance.record` to security "(own post)". The maintenance role holding it is an addition.
3. **Cover by the supervisor.** With `attendance.record`, a supervisor may bring in cover for an absent or on-leave colleague in his own department, for today or last night only. Planning, swapping, removing and publishing stay with `shifts.manage`.
4. **Grace period:** 15 minutes, a society setting. A late arrival can be marked absent only after it.
5. **Required documents per department** (fictional society rule):
   - security: CNIC, police verification, appointment letter, security training;
   - other departments: CNIC and appointment letter.
   - "Expiring" means within 30 days.
6. **Leave balances are not calculated.** Al-Noor has adopted no leave policy, so the screens say so and record days taken. There are no balances, entitlements or carry-over.
7. **Advances and loans are never settled in S.2a** (Issue #12, owner decision O8).
   - An approval is an instruction. Its payment is shown as "not verified", and nothing is shown as paid, received or owed.
   - Linking a cashbook voucher is refused. A posted voucher of the same amount, date and legal entity does not identify this employee and this advance. Verification needs a staff-advance voucher subject and an approved category (S.2b). See [§11.3](#113-p1-staff-advance-settlement-integrity).
8. **The residents' "Staff on duty"** needs `hr` + `hr.shifts` for the resident's site, never the hub or chat.
   - It shows only published weeks, in three states kept apart ([§11.2](#112-p1-residents-staff-on-duty-accuracy)):
     - **confirmed**: arrival recorded; a name only with recorded consent and the "show name" choice, initials with "show photo" (no photos are stored);
     - **scheduled, not yet confirmed**: role and post only, never a name;
     - **unavailable**: absent, on leave or no longer employed, and not replaced; a count only.
   - It is not an emergency or security service, and it says so.
9. **Shift templates are read-only** in S.2a (seeded per society).
10. **One HR state per organisation, with record-level scope.** HR is tenant-scoped, as in the catalogue, so double booking is checked across every site.
    - Every record is limited to the reader's HR sites and legal entities ([§11.1](#111-p0-multi-site-hr-record-isolation)).
    - Employees belong to a legal entity and hold dated site allocations.

## 7. Owner rulings (confirmed in Issue #12)

| # | Ruling | Applied |
|---|---|---|
| O1 | Permissions approved: GPT's six, plus `hr.advances.manage` and `hr.advances.approve`, all mapped to HR. Advance management and approval stay separate; payroll permissions stay separate | as built |
| O2 | Roles approved with department restrictions. A maintenance supervisor records attendance only for explicitly assigned maintenance and housekeeping departments, with no general security or financial access | supervisors record only for the departments they supervise **and only at the sites they are allocated to** (closure: the site restriction is new) |
| O3 | Supervisor cover approved with audit: within their own department, for an active shift today or an overnight shift still in progress; no future scheduling or publishing | as built, now also limited to the supervisor's own site; every cover is in the duty's history ("Cover brought in") |
| O4 | Register approved subject to access-verification tests. HR-008 stays PARTIAL; HR-011 is part of HR-010 | HR-008 PARTIAL (now read only); the access tests are in [§11.4](#114-tests-added) |
| O5 | HR add-on may include the prototype advances workflow; payroll deductions remain S.2b | as built |
| O6 | The 15-minute grace period, document requirements and 30-day expiry warning are fictional Al-Noor demo settings, not universal policies. Security documents must not imply NADRA or police integration | as built: settings in the model, no external check (the documents page records a reference only) |
| O7 | No leave balances without an approved leave policy | as built |
| O8 | Staff-specific classification and reliable evidence are mandatory before claiming cash settlement; otherwise read-only partial | HR-008 read only; linking disabled ([§11.3](#113-p1-staff-advance-settlement-integrity)) |
| O9 | Al-Noor's fictional HR grant dated 12 October 2026 approved; no changes to other tenants or presets | unchanged |
| O10 | Tabs and select wrapping accepted. Keep 320 px / 200 % usability. No unrelated shared date and time changes in this closure | kept; the shared `DateTime` is untouched |
| O11 | Developer HR stays planned for Gate E | unchanged |

## 8. Partial and known limitations

- **HR-008 is PARTIAL and read only.**
  - Verified payment evidence needs a staff-advance voucher subject and an approved cashbook category.
  - Paying staff by bank and deducting instalments from pay need payroll and outgoing bank payments.
  - All of this is S.2b, not authorised. Nothing invents a bank transaction, and no advance is shown as paid, repaid or owed.
- **No staff self-service.** A guard has no "My duty" page or app sign-in of their own. Attendance is recorded by the supervisor.
- **One site in the demo.** Multi-site isolation is enforced by the server and proven at the API with a fictional multi-site organisation (`multisite.fixture.ts`). The demo itself has a single site.
  - Since Issue #14 the browser tests and evidence add a shared guard and a second site in the tab, and narrow the manager to the main site with a demo-only, narrow-only hook (`demo:site-scope`).
  - That shows the read-only Employee 360. It is test set-up, not a demo feature.
- **No routing of shared employees' requests (Issue #14).** A single-site manager cannot change a multi-site employee's shared record, and nothing passes the request on to someone responsible for all of the sites; they must make the change. A routing or approval contract would need its own owner-approved design ([§12.3](#123-decisions-made-in-this-closure-open-to-the-owner)).
- **No transfer screen.** Site allocations are dated records. The transfer tests edit them as a transfer would. A transfer workflow is not built.
- **"Own record" depends on the employee–user link.** It relies on the employee record carrying the user's principal id ([`SECURITY_FINDINGS.md`](SECURITY_FINDINGS.md) §3).
- **No editing of shift templates or minimum staffing** (seeded).
- **Simulated documents:** no storage, download or virus scan.
- **No real-time.** On duty now and the residents' tab refresh when opened or acted on. There is no live tracking, by design.
- **Leave balances are not calculated** (O7).
- **Times inside sentences elsewhere in the app.** The shared `DateTime` still renders Urdu times without isolation; S.2a isolates its own uses (O10: left for a separate change).
- **Firefox and WebKit:** the smoke only (4 S.2a tests in each browser). Every other check runs in Chromium.

## 9. Register reconciliation

`docs/ui/screen-register.csv`, then `node scripts/sync-screen-register.mjs`:

- **HR-001…009:**
  - V3.2 delta adopted: edition `DEV+COMM (add-on for COMM)` and gate "S.2 (society slice); E (developer specifics)";
  - HR-007 and HR-008 renamed;
  - each row gets its real permissions, tabs, actions, validation, states, mock API and tests;
  - status BUILT, except HR-008 PARTIAL.
- **HR-010** added (BUILT) and **HR-011** added as a state of HR-010.
- **PORTAL-036:** notes that the Staff on duty tab is built.
- **Payroll** PAY-001…007 is unchanged (planned, S.2b).
- **Closure (Issue #12):**
  - every HR row's notes state the record scope and name the closure tests;
  - HR-007's tabs and states drop "paid out" and "repaid";
  - HR-008's actions, validation, states and mock API describe the read-only page;
  - PORTAL-036 notes the three staffing states.
  - No status changed.
- **Closure (Issue #14):**
  - the notes of HR-003, HR-006, HR-007 and HR-009 state the employee-wide rule;
  - the notes of HR-005, HR-010 and HR-011 state the supervisors' department rule;
  - those rows also name `hr.issue14.api.test.ts`.
  - No status changed.
- **Result:** **439 rows, 354 distinct: 131 built, 36 partial, 187 planned.** D.3 had 437 / 353 (122 / 35 / 196).
- `tests/e2e/register.spec.ts` checks the counts and still opens every register address.

## 10. Evidence

`docs/status/gate-s2a/screenshots/` holds PNGs and `video/` two WebM recordings, produced by `tests/evidence/gates2a.evidence.spec.ts` on production builds. All were recaptured on the closure code.

| Prefix | Content |
|---|---|
| `a01`…`a16` | Every HR screen at 1440 px in English and 390 px in Urdu, plus the duty drawer with its leave warning |
| `b`, `c`, `d` | Reference flows 1, 2 and 3, step by step |
| `e01` | A simulated document upload |
| `e02`…`e05` | A loan "approved — payment not verified"; read-only settlement; settlement after a posted voucher of the exact amount (still unverified); the advances list |
| `f01`, `f02` | Residents' Staff on duty at 1440 px (English) and 390 px (Urdu): scheduled only; then confirmed, scheduled and unavailable together |
| `g01`…`g06` | 320 × 700, Urdu, 200 % text: the roster, On duty now, Employee 360, leave; the residents' confirmed and scheduled lists (viewport captures) |
| `h01`, `h02` | Dark mode with high contrast, Urdu, 390 px |
| `i01`…`i03` | Who sees what: the supervisor's roster-only menu; staff records refused; HR not in the plan |
| `j01`…`j05` (Issue #14) | <ul><li>The shared guard's Employee 360, read only for a main-site manager, at 1440 px (English), 390 px (Urdu), and 320 × 700 at 200 % in Urdu (`j02`).</li><li>The maintenance supervisor's roster and On duty now with his own departments only.</li><li>The security supervisor's board with security only.</li></ul> |

Since Issue #14, `c05`–`c07` and `i01` (the security supervisor's board) show security shifts only; nothing else in them changed.

Each screenshot's width was read from the PNG and matches its viewport. Element captures (`b05`, `c01`, `d04`) are narrower by design.

## 11. Issue #12 final security closure

GitHub Issue #12 reviewed `95d70d0`. It accepted the functionality provisionally and held final sign-off for three corrections and a complete green combined regression on the final code. Nothing accepted was re-implemented.

### 11.1 P0: multi-site HR record isolation

**Root cause.**
- The HR state is one per organisation (`hrState`, section `hr`). That is right for cross-site overlap.
- But `hrOf()` authorised only the operations site record (`authorize(ctx, 'hr', siteRecord(site))`), and the handlers then read the whole state:
  - `employeesList()` mapped every employee;
  - `findEmployee()` accepted any id;
  - documents, leave, corrections, advances, the dashboard and the candidates list read tenant-wide arrays.
- A person scoped to site A could therefore read site B's staff records, CNICs included, and see them in counts.
- The demo has one site, so no test could catch it.

**Found while fixing it**, beyond the issue:
- the duplicate-CNIC refusal named the other record (code and name), even across sites;
- a supervisor could record attendance at any site for their department;
- a single-site manager could end the employment of someone who also works at another site, cancelling that site's duties;
- the settlement candidates list showed cashbook vouchers to HR managers who have no finance permission.

All four are closed ([`SECURITY_FINDINGS.md`](SECURITY_FINDINGS.md) §1a).

**The access model** (`packages/fixtures/src/hr/scope.ts`):
- **HR sites in scope.** The organisation's HR sites (`HrState.sites`, each with its owning legal entity) are filtered per request through the shared rule `decide(access, { module: 'hr', record: { siteId, legalEntityId } })`. That checks the tenant lifecycle, the module licence for the site, and the person's data scope (`all`, `legal_entity` or `site`). It is worked out on every request, so a revoked or narrowed grant applies at once.
- **Site-bound records** (duties, attendance, corrections, roster weeks, shift times) are visible when their site is in scope.
- **Employee-bound records** (the employee, documents, leave, advances, history) follow the employee:
  - the employee's sites are their dated allocations, in force or still to come;
  - a leaver's sites are the ones they last worked at;
  - the allocated site must belong to the employing legal entity, or nobody sees the record (fail closed).
- **Applied first.** Every list, count, summary, KPI, detail, action and candidate list is filtered before anything is computed or returned.
- **Non-disclosing refusals.**
  - An out-of-scope id in a path is "not found", identical to an id never issued.
  - In a request body it gives the same validation error as an unknown id.
  - A duplicate CNIC elsewhere is refused without naming the record (`hr:errors.duplicateElsewhere`).
- **Cross-site overlap still works.** Double booking is checked against the employee's duties at every site. The refusal names only the employee ("already on duty at that time (at any site)"), and another site's duty never appears in the reader's roster, Employee 360 or candidates.
- **Cross-site management is preserved.**
  - Organisation-wide HR (`all`) sees every site, and the roster has a site switcher (`?site=`).
  - A legal-entity scope covers that entity's sites.
  - Changing employment (end, suspend, rehire) needs a scope covering all of the employee's sites (`other_sites` otherwise), because it cancels duties everywhere.
- **Supervisors (O2, O3)** record attendance and bring in cover only for the departments they supervise and only at sites they are allocated to that day.

**Code:**
- `scope.ts` (new): `scopeOf`, `homeSites`, `employeeVisible`, `assignmentVisible`, `allocatedOn`.
- `state.ts`: `HrSite` and `HrState.sites`; the state version moves to 2, so existing demo sessions reseed.
- `views.ts`: `Hr.scope`; `visibleLive` and `visibleEmployees`; scoped duty-now, directory row, leave conflicts and Employee 360; `recordsFor(h, department, siteId)`.
- `handlers.ts`:
  - `hrOf` computes the scope and the working site;
  - `findEmployee`, `employeeIn`, `findAssignment`, `findLeave`, `findAdvance`, `templateIn` and `correctionVisible` give "not found";
  - every list and count is scoped;
  - hire validates the entity and site against the scope;
  - the duplicate check is non-disclosing;
  - status changes use `other_sites`.

### 11.2 P1: residents' Staff on duty accuracy

**Root cause.**
- `residentStaff()` filtered out `absent` and `on_leave` but kept `not_checked_in`.
- So scheduled people were listed, with consented names, under "on duty now", while the office board showed them as "Not in yet".

**Correction.**
- `ResidentStaffOnDuty` now has `confirmed`, `expected` and `unavailable` in place of `onDuty` (`contracts/src/hr.ts`, `fixtures/src/hr/resident.ts`):
  - **Confirmed:** arrival recorded for a shift running now and no departure. Late arrivals are confirmed; lateness is never shown. A name only with consent.
  - **Scheduled, not yet confirmed:** role and post only, never a name, even with consent. Whether a named person has arrived is their attendance.
  - **Unavailable:** absent, on approved leave or no longer employed, and not replaced; a count only. A replacement appears on their own, scheduled until checked in.
  - Checked-out staff are neither.
- It is worked out on every read, so attendance, leave, cover and employment changes show at once.
- The resident's own site only, from the published roster; independent of chat and the hub. Never a check-in time, attendance history, identity number, contact, pay or advance.
- **UI** (`CommunityHomePage.tsx`): two labelled lists, a dashed card style for scheduled staff, and the unavailable count. The note says what "confirmed" means and that this is not an emergency service. The bottom bar's Pay action is unchanged.
- **Office wording.** The office dashboard's "n on duty" for zero-minimum shifts now reads "n scheduled", since it counted people before arrival.

### 11.3 P1: staff advance settlement integrity

**Root cause.**
- `settlementCandidates()` offered every posted, unreversed voucher of the legal entity.
- `link()` checked only direction, date, amount (exact, or at most what was owed) and single use, never who or what the voucher was for.
- An unrelated supplier payment of the same amount could therefore make an advance "disbursed", and an unrelated receipt could reduce what the employee "owed".

**Decision: the conservative option** (Issue #12 option B; owner decision O8).
- A safe staff-specific subject would need a new S.1 voucher subject and an unapproved accounting category. Both expand S.1 and touch S.2b.
- Instead:
  - **Linking is disabled.** `POST /hr/advances/:id/link` is refused for every request (`409 settlement_unverifiable`) after the scope check, and the route stays so that a direct call is refused, never silently accepted. The voucher candidates route is removed, since it also exposed finance records to HR.
  - **No paid states.** `AdvanceState` is `submitted | approved | rejected | withdrawn`: `disbursed` and `repaid` are gone from the contract, with the link records and "outstanding". The instalment plan is always "planned".
  - **Truthful wording.** An approved advance reads "Approved — payment not verified", with a "Payment: Not verified" line. The list totals "Approved, payment not verified" and counts nothing as owed.
  - **HR-008 is read only and stays PARTIAL.** It lists approved advances and what a verified payment will need:
    - a voucher made for this advance, naming it and the employee;
    - an approved staff-advance category;
    - the employing legal entity and site;
    - the direction;
    - the exact amount and posting date;
    - posted, unreversed and used once, with a later reversal undoing it;
    - an approver other than the preparer.
- **S.1 is untouched.** HR reads nothing from the cashbook, and its accounting and reconciliation guarantees are unchanged.

### 11.4 Tests added

The tests are in `packages/fixtures/src/hr/hr.closure.api.test.ts` (14 tests). The fictional multi-site organisation (`multisite.fixture.ts`) has:
- the main site;
- **Al-Noor Annexe (Demo)**, owned by another legal entity, with staff, duties, a correction, leave, a document and an advance;
- **Al-Noor Block C (Demo)**, owned by Al-Noor, with a guard who works at both.

Principals are narrowed per test through the access override.

| Area | Tests |
|---|---|
| P0 isolation | <ul><li>Organisation-wide sees both sites; a main-site manager sees none of the annexe in the directory, counts, department totals, dashboard KPIs, documents, leave and corrections, attendance, roster, On duty now, advances, options or Employee 360. Nineteen identifying strings are checked absent from every response.</li><li>Fourteen direct-id requests (Employee 360, edit, status, profile, leave approve and cancel, correction approve, unassign, advance withdraw, approve and link, check-in, `?site=`) get exactly the answer of a never-issued id.</li><li>Five body ids get the same answer as an unknown id.</li><li>Hiring for another site or entity is refused; a duplicate CNIC elsewhere is refused without naming it.</li></ul> |
| P0 cross-site management | <ul><li>Each site's own manager sees only theirs.</li><li>Organisation-wide sees all, with the site switcher.</li><li>A legal-entity scope covers its sites.</li></ul> |
| P0 effective dates and revocation | <ul><li>A transfer today, then a future transfer, change access at once.</li><li>A single-site manager may not end a multi-site employee's employment.</li><li>A leaver stays with the sites they last worked at.</li><li>Revoking access refuses at once: no site in scope, then the `hr.view` permission removed, then the module withdrawn.</li></ul> |
| P0 overlap | <ul><li>Double booking across sites is still refused, disclosing nothing of the other site.</li><li>Candidates show the person as blocked, and no other site's staff.</li><li>A supervisor cannot record at a site they do not work at.</li></ul> |
| P1 residents | <ul><li>Scheduled but not checked in.</li><li>Checked in on time and late.</li><li>Absent, unavailable until replaced; the replacement scheduled, then confirmed.</li><li>Approved leave against pending leave.</li><li>Overnight (last night's shift at 05:00).</li><li>Employment ended.</li><li>Missing consent.</li><li>Another site.</li><li>HR not licensed.</li><li>Chat and hub withdrawn.</li></ul> |
| P1 settlement | Every voucher is posted through S.1 itself (prepared, approved, posted, and reversed where needed). Each is refused, and the advance stays approved and unverified:<ul><li>the right amount, payee and reference;</li><li>a wrong employee;</li><li>a wrong advance;</li><li>a supplier payment;</li><li>an unrelated receipt as a repayment;</li><li>another legal entity and site;</li><li>reversed before linking;</li><li>reused;</li><li>reversed after the attempt.</li></ul>HR changed none of S.1's vouchers. The candidates route is gone. A maker may not approve their own request. |

**Checked against the broken behaviour.** The new tests were run against deliberately broken code:
- with the employee scope disabled, all 5 P0 tests failed;
- with the site-bound scope disabled, 3 failed;
- with "not checked in" treated as confirmed, 7 resident tests failed.

The code was then restored, and the suite passes.

**Updated tests:**
- `hr.api.test.ts`: the advance and resident tests use the new contract;
- `s2a.spec.ts`:
  - the advance flow shows read-only settlement, even after a posted voucher of the exact amount;
  - residents see scheduled staff, then a confirmed arrival, with Pay still in the phone bar;
  - the 320 px checks cover both lists;
- `s2a.smoke.spec.ts`: the scheduled list in Firefox and WebKit;
- `gates2a.evidence.spec.ts`: the new captures above.

### 11.5 Results

On the final code, with retries off:

| Check | Result |
|---|---|
| Typecheck, lint, i18n parity | clean (9,854 keys per locale) |
| Unit and API | **1,431 / 1,431** |
| Complete combined E2E with evidence | **383 / 383** in 37.6 minutes: e2e 370 / 370, evidence 13 / 13 |
| Axe | 1,292 scans, 0 violations |
| Firefox and WebKit smoke | **36 / 36** |
| Evidence | 70 screenshots and 2 videos, recaptured |

Earlier runs on the way, including a WebKit test that failed 4 times in 5 and how it was made reliable, are reported as they happened in [`test-results.md`](test-results.md#issue-12-closure-results-final-code).

## 12. Issue #14 final closure

GitHub Issue #14 reviewed the Issue #12 closure `0e14895`. It accepted the three Issue #12 corrections and held the final S.2a sign-off for two authorisation defects found in the source. Both are closed here, with related defects found while fixing them. Nothing accepted was re-implemented, and no status, price, preset or other gate changed.

### 12.1 P0: changes to a shared multi-site employee

**Root cause.**
- Issue #12 gave HR one rule for employee-bound records: visible when **any** of the employee's sites is in the reader's scope (`employeeVisible`).
- `findEmployee`, `employeeIn`, `findLeave` and `findAdvance` used that same rule for changes.
- Only `changeStatus` had a stricter check, added as a special case (`other_sites`) rather than as a rule.
- So a manager scoped to the main site who could see Rashid (main site and Block C) could:
  - edit his role and personal and emergency contacts;
  - change his resident-facing consent;
  - add or replace his documents;
  - submit, approve, reject or cancel his leave;
  - raise, decide or withdraw his advances.
- Each of these applies at every site the person works at. Approved leave, for example, turns his Block C duty into a gap (`leaveOn` → `attendanceState`).

**Found while fixing it.**
- **Partial edits.** `edit()` applied the phone and address before it checked the role and the duties to reassign. The demo keeps the state in memory between requests, so a refused PATCH could leave part of its change in place for the next save.
- **Impossible actions on screen.** Employee 360, the leave and advance lists, and the leave and document pickers offered changes the server must refuse.

**The rule** (`scope.ts` `employeeGoverned`; `views.ts` `governs`; `handlers.ts` `wholeEmployee`):
- **Seeing** an employee needs one of their sites in scope (unchanged since Issue #12).
- **Changing what all of their sites share** needs every one of them, each belonging to the employing legal entity. No site at all means nobody (fail closed). This covers:
  - details, role and personal and emergency contacts (`PATCH /hr/employees/:id`);
  - the resident-facing profile and consent (`/profile`);
  - employment: end, suspend, reinstate, rehire (`/status`);
  - documents: adding a kind, or replacing the current version (`POST /hr/documents`);
  - leave: request, approve, reject, cancel;
  - advances: request, approve, reject, withdraw.
- **Checked first.** The check runs before any validation or change, so a refused request changes nothing. The refusal is `403 other_sites`: it says the person also works elsewhere and never names the site.
- **Out of scope stays "not found".** An employee of another site is still answered exactly like an id never issued. `other_sites` is only for someone the reader can see.
- **Site-bound work is unchanged.** At the reader's own site, a manager still plans, swaps, removes and publishes duties, records attendance and decides corrections, for shared staff too. Those records belong to the site. Double booking is still checked across every site.
- **Organisation-wide HR keeps everything**, and so does a legal-entity scope covering all of the person's sites. Single-site employees are unaffected.
- **Linking an advance to a voucher** stays refused for everyone (Issue #12).

**On screen.**
- `EmployeeRow` and `Employee360` carry `allSitesInScope`. When it is false, every employee-wide action is false and Employee 360 shows a note ("Read only for you: … also works at a site you do not manage …"), without naming the site.
- Leave and advance requests show `blocked: 'other_sites'` with the reason, and no decision buttons.
- The leave and document pickers, and the advance request list, leave the person out.

**Edit is atomic.** `edit()` checks every field (phone, address, emergency contact, role, duties to reassign) before it changes any.

### 12.2 P1: supervisors' staffing view

**Root cause.**
- `GET /hr/roster`, `/hr/roster/now` and `/hr/roster/candidates` accept `attendance.record`, the supervisors' permission (owner decision O2).
- `rosterWeek()` and `onDutyBoard()` listed every department's shifts, names, coverage and warnings.
- `candidates()` searched every visible employee for any shift template in scope, without checking the department.
- `attendanceDay()` already filtered by department; nothing else followed it.

**Found while fixing it**, all reachable by a direct API call:
- **Another site's roster.** A supervisor with an organisation-wide data scope could open `?site=` of a site where they do not work, and see all its departments.
- **Names in refusals.** Bringing in cover with any employee id answered with that person's name ("another department", "not working at this site").
- **Attendance from refusals.** A cover request read the covered duty first: "cover not needed" or "already covered" came before the supervisor's own permission check. A maintenance supervisor could therefore learn whether a guard had been marked absent.
- **Other sites' staff as candidates.** Candidates included same-department staff of other sites, marked "not at this site".
- **Leave clashes.** Leave clashes listed duties at sites where the supervisor does not work.
- **Dead-end links.** The board, attendance, leave and corrections linked every name to Employee 360, which supervisors may not open ("permission missing").

**The rule** (`views.ts` `seesAllStaffing`, `staffingShown`, `staffingSites`; `handlers.ts` `staffingOf`, `coverable`):
- **HR viewers and planners** (`hr.view` or `shifts.manage`) see every department at their HR sites, as before.
- **Supervisors** (only `attendance.record`) see a department's staffing only where they record for it: their assigned departments, at the sites they are allocated to today. This applies, server-side and before anything is listed or counted, to:
  - the roster week: shifts, names, coverage, warnings and shift times;
  - On duty now, current and next;
  - attendance;
  - leave clashes;
  - the site list.
- **Their working site** is the first site where they record. Any other `?site=` answers like a site that does not exist.
- **Candidates** exist for a supervisor only for the cover they may bring in (O3): their own department and site, for a shift of today or last night.
  - Another department's shift gives `403 not_your_department`, before any staff is read.
  - Another date gives `403 permission_missing`.
  - The list holds only that department's staff allocated to that site on that date.
- **Cover** with anyone outside that view gets the answer of an unknown id, naming no one. The supervisor's permission and this check both run before the covered duty is read, so the answer is the same whatever that duty's attendance.
- **On screen.** Names are plain text for anyone without `hr.view`.

**Preserved.**
- Supervisors still record their own departments' attendance.
- They still bring in permitted cover from On duty now, today or last night.
- Full HR sees the combined roster and board.
- The residents' "Staff on duty" (Issue #12) is unchanged: it never used the office rule.
- No SOS or emergency function was added.

### 12.3 Decisions made in this closure (open to the owner)

1. **Advances follow the employee-wide rule.** Leave and advances are both employee-bound records, not site records. A main-site treasurer cannot decide an advance of a shared employee; organisation-wide finance can.
2. **Rejecting or cancelling leave counts as a change**, like approving it. A pending request already shows as a warning on every site's roster.
3. **No routing in S.2a.** A single-site principal is refused (`other_sites`); there is no site-scoped routing that would pass the request to someone responsible for all sites. This is the safest fail-closed answer. A routing or approval contract would be a separate, owner-approved design.
4. **A supervisor's candidates** are limited to the cover window of O3 (today or last night's shift). Planning other dates is the manager's.
5. **The browser case uses a test hook** (`demo:site-scope`, demo only). It narrows an organisation-wide scope to named sites, never widens one, and is unit-tested. It shows the read-only Employee 360 in the browser, since the demo itself has one site.

### 12.4 Tests added

The new tests are in `packages/fixtures/src/hr/hr.issue14.api.test.ts` (12 tests: 6 for P0, 6 for P1), on the fictional multi-site organisation.

| Area | Tests |
|---|---|
| P0 details, role, contacts, consent | <ul><li>A main-site manager sees Rashid read only: `allSitesInScope` false, every employee-wide action false, nothing of Block C.</li><li>Six refused requests: role; phone, emergency contact and address; an invalid phone; consent withdrawn; consent changed; suspension.</li><li>Each answers `403 other_sites` with nothing of Block C, and the **whole stored HR state is byte-identical** afterwards.</li><li>A legal-entity scope covering both sites, and organisation-wide HR, may.</li><li>A main-site-only employee is still edited by the main-site manager.</li></ul> |
| P0 atomic edit | A refused PATCH (valid phone with an invalid role, address or emergency contact) leaves the state byte-identical |
| P0 documents | Replacing his appointment letter and adding a police verification are refused, state unchanged. HR for both sites replaces it (version 2) |
| P0 leave touching Block C | <ul><li>Submit, approve, reject and cancel (pending and approved future) are all refused, with `blocked: 'other_sites'` and no actions in the list.</li><li>The state is unchanged, and the published rosters of **both** sites are identical to before.</li><li>When organisation-wide HR approves, Block C's night duty becomes "on leave", the reason for the rule.</li></ul> |
| P0 advances | <ul><li>A main-site manager's request list leaves Rashid out.</li><li>Raising, withdrawing, approving (main-site treasurer) and rejecting are refused, state unchanged.</li><li>Linking is still `settlement_unverifiable`.</li><li>Organisation-wide finance approves.</li></ul> |
| P0 non-disclosure | Another site's employee is still answered exactly like a never-issued id (404), never `other_sites` |
| P1 roster, board, attendance | <ul><li>Shahid: security only. Naveed: maintenance and housekeeping only. This holds for this week, next week, On duty now and attendance: departments, shifts, templates and warnings, and no name of another department.</li><li>The manager still sees all four departments.</li></ul> |
| P1 candidates | <ul><li>Naveed asking for the guards' shift, or Shahid for maintenance or housekeeping: `not_your_department`.</li><li>Next week: `permission_missing`.</li><li>Shahid's own shift today: guards only.</li><li>The manager plans any shift and date.</li></ul> |
| P1 cover | <ul><li>Naveed's cover on a guard's duty gets the same `permission_missing` before and after the guard is marked absent.</li><li>Shahid naming the electrician gets exactly the unknown-id answer, without the name, and nothing changes.</li><li>Permitted cover still works, and recording goes on.</li></ul> |
| P1 another site | <ul><li>Shahid's roster lists his site only.</li><li>`?site=` Block C on the roster, board and attendance answers exactly like a site that does not exist.</li><li>Block C's template: `not_your_department`.</li><li>Main-site night candidates exclude Block C and the annexe, with no "not at site".</li><li>Omer as cover gets the unknown-id answer.</li><li>Organisation-wide HR keeps Block C.</li></ul> |
| P1 leave clashes | <ul><li>A guard's leave shows Shahid his own department's clashes, and Naveed nothing.</li><li>For the shared guard, Shahid sees the main-site clash only. Organisation-wide HR sees both.</li></ul> |

Also:
- `demo-licence.test.ts` (4 tests): the site-scope hook narrows only, and withdrawal still removes only optional add-ons.
- `s2a.spec.ts` (4 new tests):
  - the read-only Employee 360 of the shared guard, the server's refusals and the pickers;
  - the same at 320 × 700 with 200 % text in English and Urdu;
  - Naveed and Shahid seeing only their departments on the roster and board, with no Employee 360 links, the staff record refused, and `?site=` and another department's candidates refused.
- `s2a.smoke.spec.ts`: the security supervisor's board shows security only, in Firefox and WebKit.
- `gates2a.evidence.spec.ts`: captures `j01`–`j05`.

**Checked against the broken behaviour (mutation checks).** Each rule was broken on purpose, one at a time. The HR API tests (`hr.issue14`, `hr.closure`, `hr.api`) were run, then the code was restored and compared byte for byte:

| Rule broken | Tests failing |
|---|---|
| No employee-wide guard | 5 |
| Back to the any-site rule for changes (`.some`) | 5 |
| The handlers of `0e14895` (edit applied field by field; no supervisor rules) | 8, including "a refused edit changes nothing" |
| No department filter | 2 |
| No supervisor working-site rule | 1 |
| Candidates not limited to the site and department | 1 |
| Another department's candidates not refused | 2 |
| Cover from outside the staffing view | 2 |
| The supervisor's cover checks removed | 2 |
| The supervisor's cover checks moved back after the covered duty is read | 1 ("the same `permission_missing` before and after the guard is marked absent") |
| Leave clashes unfiltered | 1 |
| Leave actions ignore the rule | 1 |
| Employee 360 actions ignore the rule | 1 |
| Advance request list unfiltered | 1 |
| Roster site list unfiltered | 1 |
| Board unfiltered | 1 |
| Attendance unfiltered | 2 |
| Restored | 0 of 46 |

### 12.5 Results

On the final code, with retries off:

| Check | Result |
|---|---|
| Typecheck, lint, logical CSS, i18n parity | clean (9,856 keys per locale; two new strings and one reworded refusal, in English and Urdu) |
| Unit and API | **1,447 / 1,447** (16 new: 12 for Issue #14, 4 for the demo hook). Four earlier complete runs on the same code each failed one or two tests this closure does not touch, on the 5-second timeout; each passed alone ([`test-results.md`](test-results.md#runs-before-the-final-ones-as-they-happened)) |
| Mutation checks | 17 breaks, each caught |
| Complete combined E2E with evidence | **388 / 388** in 49.5 minutes: e2e 374 / 374 (every gate, B to S.2a; 4 new), evidence 14 / 14 |
| Axe | 1,299 scans, 35,889 rule passes, 0 violations; `s2a.spec` 119 of them |
| Firefox and WebKit smoke | **36 / 36** |
| Evidence | 79 screenshots (9 new) and 2 videos, recaptured; every width matches its viewport |
| Register | 439 rows, 354 distinct (131 / 36 / 187), statuses unchanged |

Every run, including any failure on the way, is in [`test-results.md`](test-results.md#issue-14-closure-results-final-code).

### 12.6 Follow-up review of `31bb0ed`

GPT's follow-up comment on Issue #14 accepted both corrections at source level. It held sign-off for one P1 residual and one related fail-closed edge. Both are closed here, with no other change.

**Residual 1: an employee-id oracle in `POST /hr/roster/assignments`.**
- **Cause.** `assign()` looked up `employeeId` (HR-site visibility only) before it checked whether the caller may plan or bring in cover. A maintenance supervisor sending a real security or office employee id got `403 permission_missing`, while an id never issued got the `employeeId` validation error. Together they told real ids from invented ones.
- **Correction.** Authority comes first, before the employee or the covered duty is read:
  - planning needs `shifts.manage`;
  - otherwise only a supervisor's cover is allowed: their own department and site, for today or last night (O3).
- Then, for a supervisor's permitted cover, anyone outside their staffing view gets the unknown-id answer: another department, another site, or no such person.
- Full HR planners are unchanged.

**Residual 2: a fallback site without staffing authority.**
- **Cause.** `staffingOf()` fell back to the first HR site when a supervisor had no staffing site at all (allocation ended, or no department supervised). The roster then showed that site's name, publication state and metadata, though no staff.
- **Correction.** No staffing site gives "not found", the same answer as `?site=` of a site that does not exist, on the roster, On duty now and attendance. Valid supervisors keep their default site.

**Tests** (2 more in `hr.issue14.api.test.ts`, now 14):
- **Naveed and staff ids.** Naveed cannot tell a real security guard's or office employee's id from `emp_none_999`. The answers are identical in each case, the HR state is byte-identical, and no name or site appears:
  - (a) planning without cover, on the guards', his own and the office's shifts (`403 permission_missing`);
  - (b) cover on the guards' shift (`403`);
  - (c) permitted cover in his own department (the unknown-id answer, `422`).
- Shahid's same-department cover still succeeds, and the manager still plans.
- **No staffing site.** With Naveed's allocation ended, and again with no department supervised:
  - the roster, On duty now and attendance answer exactly like `?site=` of a site that does not exist (404), naming nothing;
  - restored, his default site is back, and Shahid's default is unchanged.

**Mutation checks** (scripted, on the final code; HR API tests, 48):

| Rule broken | Tests failing |
|---|---|
| Employee looked up before authority (the `31bb0ed` order) | 1 (the new oracle test) |
| Fallback site without staffing authority (the `31bb0ed` fallback) | 1 (the new no-site test) |
| The handlers file of `31bb0ed`, as reviewed | 2: exactly the two new tests |
| The supervisor's authority check removed | 3 |
| Cover from outside the staffing view | 3 |
| No supervisor working-site rule | 2 |
| The 13 other scripted breaks of §12.4 | each still caught (the handlers of `0e14895` now fail 10 tests, the 2 new ones included) |
| Restored | 0 of 48 |

**Results:** in [`test-results.md`](test-results.md#issue-14-follow-up-results-final-code). The follow-up changes no screen, string or register row.
