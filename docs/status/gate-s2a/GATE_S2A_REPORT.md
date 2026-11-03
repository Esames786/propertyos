# Gate S.2a: Society staff operations (Al-Noor Residency)

**Status: built, frontend only, on typed mock APIs; stopped for GPT and owner review.**

- **Branch:** `feature/gate-s2a-society-staff`. It continues GPT's foundation commit `311dfb5` (on the approved D.3 closure `c497942`, GitHub Issue #11). The S.2a commit sits directly on `311dfb5`.
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
  - that HR-008 settles money: it links vouchers that S.1 already posted. Staff payment by bank and payroll deduction are S.2b ([§8](#8-partial-and-known-limitations)).

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
| Roster → **On duty now** | **Shahid Hussain**, security supervisor | Who is in, late or absent. Mark the absent guard; **Bring in cover** suggests people and says why the others cannot. Shows the next shift. |
| **Attendance** (`/backoffice/hr/attendance`) | Shahid; **Naveed Anjum** (maintenance supervisor) | Each supervisor records only his own departments. A correction is a request, never an edit. |
| **Leave & corrections** (`/backoffice/hr/leave-attendance-adjustments`) | Imran, then **Rabia Hashmi** (committee secretary, administrator) | Imran decides Shahid's requests but not his own: those go to Rabia. Approving Karim's leave turns his nights into gaps on the roster. |
| **Documents** (`/backoffice/hr/employee-documents`) | Imran | Missing, expired and expiring documents. Upload is simulated; numbers are masked. |
| **Advances & loans** (`/backoffice/hr/employee-advances`) → **Settlement** | Imran raises; Ayesha approves ("Approved — not paid"); **Saba Javed** (accounts) links a posted cashbook voucher | Nothing is "paid" until a posted S.1 voucher of the exact amount is linked. |
| Resident app → Community → **Staff on duty** | **Kamran Siddiqui** (A-101) | From the published roster: roles and posts, with names only where the staff member consented. No phone or personal detail. Works without chat and the hub. |

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
| Advances | `GET /hr/advances`; `POST /hr/advances`, `…/withdraw`, `…/link`, `GET …/candidates`; `POST …/approve`, `…/reject` | `hr.advances.manage`; decide `hr.advances.approve`, never the requester or the staff member |
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
- **Advance states.** Submitted → approved ("approved — not paid") → disbursed → repaid, or rejected or withdrawn. Outstanding stays 0 until a disbursement is linked.

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
| HR-008 | Advance and loan settlement | `/backoffice/hr/employee-advance-settlement` | **PARTIAL** |
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
| Accounts officer (Al-Noor) | `hr.advances.manage` only (links vouchers) |
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
7. **Advances and loans are settled only through S.1 cashbook vouchers.**
   - Payment: a posted payment voucher of the exact amount, after approval.
   - Repayments: posted receipts, each no more than what is still owed.
   - All vouchers: same legal entity, not reversed, each used once.
   - Until a staff-advance category is approved, the cashbook files them under its existing categories (miscellaneous expense / other income).
8. **The residents' "Staff on duty"** needs `hr` + `hr.shifts` for the resident's site, never the hub or chat.
   - It shows only published weeks: roles and posts.
   - Names appear only with recorded consent and the "show name" choice; with the "show photo" choice, initials (no photos are stored).
   - Absent staff are not shown on duty.
9. **Shift templates are read-only** in S.2a (seeded per society).
10. **One HR state per organisation.** HR is tenant-scoped, as in the catalogue. Employees belong to a legal entity and hold site allocations.

## 7. Owner decisions requested

| # | Decision | Recommendation |
|---|---|---|
| O1 | Confirm the permissions: GPT's six (`hr.manage`, `shifts.manage`, `attendance.record`, `attendance.adjust`, `leave.manage`, `hr.documents.manage`) and S.2a's two (`hr.advances.manage`, `hr.advances.approve`). The V3.2 matrix lists only `hr.manage`, `shifts.manage` and `attendance.record` | Confirm; keep advances apart from `hr.view` |
| O2 | Starter-role grants ([§3.3](#33-licensing-and-roles)), including `attendance.record` for the maintenance role (the matrix gives it to security only) and `hr.advances.manage` for Al-Noor's accounts officer | Confirm |
| O3 | The supervisor's cover rule (decision 3) | Confirm, or require `shifts.manage` for all assignments |
| O4 | Register permission changes: HR-004…009 move from `hr.view` to their real permissions; HR-010 adds `attendance.record`; HR-011 adds `shifts.manage` and `attendance.record`; HR-005 and HR-010/011 carry `hr.shifts`. The delta's HR-010 route `?week=&site=` is registered as the plain address with optional parameters | Accept the register as reconciled |
| O5 | HR-007/008 are tagged F07 (payroll) in the delta. S.2a licenses them under `hr` with no payroll feature; loan deduction from pay (`payroll.loans`) stays S.2b | Confirm |
| O6 | Grace period 15 minutes; required documents per department; 30-day expiry warning | Al-Noor to set its own values (all are society settings in the model) |
| O7 | A leave policy (types, entitlements, carry-over) before balances are shown | Decide in S.2b or with the society |
| O8 | A staff-advance category in the cashbook, so advances are not filed as expense or income | Approve the category with S.2b |
| O9 | The Al-Noor amendment (HR from 12 October 2026, fictional) | Confirm as demo data |
| O10 | The shared tab and select changes ([§5](#5-design-and-accessibility)) affect every screen that uses them | Accept. The full regression ran with them at 382 / 383; its one failure was a D.3 expectation that S.2a changes by design (the Staff tab), corrected and re-run 25 / 25 ([`test-results.md`](test-results.md)) |
| O11 | Developer HR stays planned (Gate E) | Confirm |

## 8. Partial and known limitations

- **HR-008 is PARTIAL.**
  - Paying staff by bank transfer and deducting instalments from pay need payroll and outgoing bank payments (S.2b, not authorised).
  - Here a payment or repayment counts only when an already-posted S.1 voucher is linked. Nothing invents a bank transaction, and an approval never shows as paid.
- **No staff self-service.** A guard has no "My duty" page or app sign-in of their own. Attendance is recorded by the supervisor.
- **One site in the demo.** Multi-site overlap is enforced by the server and covered by vectors (two sites, back to back, allocation ended); the demo has a single site.
- **No editing of shift templates or minimum staffing** (seeded).
- **Simulated documents:** no storage, download or virus scan.
- **No real-time.** On duty now refreshes when opened or acted on. There is no live tracking, by design.
- **Leave balances are not calculated** (O7).
- **Times inside sentences elsewhere in the app.** The shared `DateTime` still renders Urdu times without isolation; S.2a isolates its own uses.
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
- **Result:** **439 rows, 354 distinct: 131 built, 36 partial, 187 planned.** D.3 had 437 / 353 (122 / 35 / 196).
- `tests/e2e/register.spec.ts` checks the new counts and still opens every register address.

## 10. Evidence

`docs/status/gate-s2a/screenshots/` holds 67 PNGs; `video/` holds two WebM recordings. They are produced by `tests/evidence/gates2a.evidence.spec.ts` on production builds.

| Prefix | Content |
|---|---|
| `a01`…`a16` | Every HR screen at 1440 px in English and 390 px in Urdu, plus the duty drawer with its leave warning |
| `b`, `c`, `d` | Reference flows 1, 2 and 3, step by step |
| `e` | A simulated document upload; a loan "approved — not paid"; settlement before and after a posted voucher |
| `f01` | Residents' Staff on duty at 1440 px (English) and 390 px (Urdu) |
| `g01`…`g05` | 320 × 700, Urdu, 200 % text: the roster, On duty now, Employee 360, leave, and the residents' tab (viewport captures) |
| `h01`, `h02` | Dark mode with high contrast, Urdu, 390 px |
| `i01`…`i03` | Who sees what: the supervisor's roster-only menu; staff records refused; HR not in the plan |

Each screenshot's width was read from the PNG and matches its viewport. Element captures (`b05`, `c01`, `d04`) are narrower by design.
