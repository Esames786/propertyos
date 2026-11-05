# Gate S.2b: Society payroll (Al-Noor Residency)

**Status: built, stopped for GPT and owner review.**

**Commits**
- **Branch:** `feature/gate-s2b-society-payroll`.
- **Base:** `feature/gate-s2a-society-staff@16e7f54`, the owner-accepted S.2a.
- **Final commit:** see the delivery message; it holds the code, tests, register, evidence and these documents.
- **Not touched:** `main`, Issue #13, the VPS, Bingoo, Laravel and any backend; no real payment, bank account or payroll data.
- `docs/status/PROJECT_HANDOFF.md` is not committed.

**Brief.** The owner's S.2b directive and [GitHub Issue #15](https://github.com/Esames786/propertyos/issues/15).

**Sources**
- V3.2 revision 4 (`docs/nizam-v3.2-scope-review@0e57604`):
  - `FRONTEND_ONLY_EXECUTION_PLAN.md` §S.2;
  - `MODULE_AND_LICENSING_MATRIX.md` §2, §5.2 and §6;
  - `OWNER_DECISIONS.md` D-22, D-23, D-43 and D-48;
  - the PAY-001…007 rows of `SCREEN_REGISTER_DELTA.csv`, adopted alone, never the rest of the delta.
- S.1, C.2 and the accepted S.2a code and documents.

## Summary

| Screen | Status | What works | What does not (and why) |
|---|---|---|---|
| PAY-001 Payroll dashboard | **BUILT** | Current period and run, staff in the run, lines held, waiting for you; owed, instructed and verified-paid shown apart; every figure opens its records | Verified paid is always "not available" (no settlement evidence exists) |
| PAY-002 Payroll periods | **BUILT** | Create the next month (in order), open, prepare a run, close; why an action is not offered | — |
| PAY-003 Run workspace | **BUILT** | Version, held lines and warnings, totals, filters and search, recalculate, submit, withdraw, CSV, versions, policies, activity | — |
| PAY-004 Employee pay breakdown | **PARTIAL** | Earnings (prorated), bonuses, deductions (applied, held, statutory placeholders), net pay; confirm days, add or remove a bonus, exclude or include; own pay read only; account masked | Advance and loan instalments are listed but **held, never deducted** (an advance's payment to the employee cannot be verified); statutory, overtime, absence and unpaid-leave deductions are never calculated (no adopted policy) |
| PAY-005 Finalisation | **BUILT** | Maker ≠ checker, no approver with pay in the run, explicit acknowledgement, approve and freeze, return, reverse, close the period, audit trail | Single checker; whether payroll should follow S.1's approval policies is an open decision (O8) |
| PAY-006 Disbursement status | **PARTIAL** | Instruction prepared → approved (by another person) → "sent (simulated)", cancel before sending; unverified bank accounts held | **No settlement:** every line stays "Not settled — no evidence"; no route records a payment |
| PAY-007 Payroll accounting | **PARTIAL** | Proposed entry (and proposed reversal) per approved run, balanced; owed / instructed / verified-paid summary | **Nothing is posted:** no ledger for societies, no approved payroll classification, no evidenced payment |

**Register:** 439 rows, 354 distinct screens.
- Before S.2b: 131 built, 36 partial, 187 planned.
- After: **135 built, 39 partial, 180 planned**.
- HR-008 stays PARTIAL; only its notes and tests changed.

**Results**
- Unit and API: **1,497 / 1,497**, in two complete runs.
  - The payroll suite has 48 tests: 31 rules and golden vectors, 17 API.
- The money and security rules were broken one at a time **26** times; every break was caught.
- Complete combined Playwright regression, retries off: **400 / 400** in 40.1 minutes (e2e 388, every gate B to S.2b; evidence 12).
- Axe: **1,371 scans, 0 violations**.
- Firefox and WebKit smoke: **40 / 40**.
- Details are in [`test-results.md`](test-results.md).

## 1. How to try it

- **Preview.** Office app `/backoffice/pay/payroll-dashboard`, signed in as Saba Javed (accounts officer, the preparer) or Ayesha Malik (treasurer, the approver).
- **The fictional seed.**
  - October 2026 is open. Its run `ANR-PR-2026-10`, version 2, was prepared on 24 October and recalculated on 25 October.
  - Two daily-wage lines (Tariq, Rukhsana) wait for their days worked, so the run cannot be submitted yet.
  - November 2026 is a draft.
- **The reference flow** (also in the video):
  1. As Saba, open a held line from the overview and confirm the days worked. Optionally add a bonus.
  2. Submit the run.
  3. As Ayesha, open Finalisation, tick the acknowledgement and approve.
  4. As Saba, prepare the disbursement instruction.
  5. As Ayesha, approve the instruction.
  6. As Saba, mark it sent (simulated).
  7. Check Accounting: nothing is posted.
- **Who does not see pay:**
  - Imran (building manager, HR), Rabia (committee secretary, HR administrator), the supervisors and the residents: no menu entry, and deep links are refused;
  - Employee 360 shows no pay.

## 2. What S.2b adds

### 2.1 Licensing and roles (V3.2 D-22, matrix §5.2)

- **Catalogue** (`platform/catalog.ts`). `payroll` becomes an optional add-on for the community and portfolio editions.
  - It requires `hr` and integrates `accounting` and `banking`.
  - Its features are `payroll.loans` and `payroll.bonuses`.
  - It is in no society preset. The developer preset already included it; developer specifics are Gate E.
- **Al-Noor's licence** (`tenant-directory.ts`).
  - A fictional, explicit, dated amendment: `payroll` from **15 October 2026**, after HR (12 October), with both features.
  - No other society has it (tested).
- **Permissions.** `payroll.view`, `payroll.prepare` and `payroll.approve`, all mapped to the `payroll` module.
  - `payroll.post` (matrix §5.2) is **not added**: nothing can be posted (decision O1).
- **Holders**, Al-Noor only:
  - **Saba (accounts officer, Al-Noor's own role):** `payroll.view` and `payroll.prepare`.
  - **Ayesha (treasurer):** `payroll.view` and `payroll.approve`, through Al-Noor's own change to its treasurer role (`ALNOOR_EXTRA`), **never a starter set** (decision O2).
  - Nobody else. `hr.view`, `hr.manage` and the supervisors' `attendance.record` do not reach pay.
- **The demo hook** may withdraw `payroll` too (HR without payroll). It never grants anything.
- **HQ storyline test.** `platform.test.ts`'s `createAlNoor` adds `sel('payroll')`, so the HQ-created Al-Noor still equals the workspace's Al-Noor. S.2a did the same for `hr`; the assertion is unchanged.

### 2.2 Model and mock API

**Contracts** (`packages/contracts/src/payroll.ts`):
- typed periods, runs, lines, versions, breakdowns, instructions, the accounting view and the dashboard;
- money is always a decimal string with its currency (`Money`).

**Fixtures** (`packages/fixtures/src/payroll/`):

| File | What it does |
|---|---|
| `rules.ts` | Pure and table-tested. Calendar-day proration rounded half up to the paisa; one line from HR facts and the preparer's inputs; totals; the instruction split; the proposed journal; the HR-facts fingerprint |
| `state.ts` | The payroll records beside the organisation's HR state. The fictional pay terms, newly designed for the demo, never inferred from a person or timecard; accounts keep a bank name and four characters only |
| `compute.ts` | HR facts per employee and period (employment dates and status, unpaid leave, recorded attendance, approved advances); every calculation is a new version that stores what it calculated; the seed |
| `views.ts` | The request context (`payOf`), scope (`entityVisible`, `entityWhole`, `visibleLines`) and the read models |
| `handlers.ts` | 28 endpoints (below) |

**Endpoints** (permission in brackets; reads are `history_read`, changes `operational`):
- **Dashboard:** `GET /payroll/dashboard`.
- **Periods:**
  - `GET /payroll/periods`;
  - `POST /payroll/periods`, `/:id/open` and `/:id/runs` (prepare);
  - `POST /payroll/periods/:id/close` (approve).
- **Runs:**
  - `GET /payroll/runs`, `/payroll/runs/:id` and `/payroll/runs/:id/export`;
  - `POST /payroll/runs/:id/recompute`, `/submit` and `/withdraw` (prepare);
  - `POST /payroll/runs/:id/approve`, `/return` and `/reverse` (approve).
- **One person's line:**
  - `GET /payroll/runs/:id/lines/:employeeId` and `/payroll/employees/:employeeId/latest`;
  - `POST /payroll/runs/:id/lines/:employeeId/days`, `/bonuses` (with feature `payroll.bonuses`), `/bonuses/:bonusId/remove`, `/exclude` and `/include` (prepare).
- **Disbursement:**
  - `GET /payroll/disbursements`;
  - `POST /payroll/runs/:id/instructions` and `/payroll/instructions/:id/sent` (prepare);
  - `POST /payroll/instructions/:id/approve` (approve);
  - `POST /payroll/instructions/:id/cancel` (prepare or approve).
- **Accounting:** `GET /payroll/accounting`.

**There is no settle, paid, evidence, match or post route.** A test checks that such calls get "not found" and change nothing.

### 2.3 The money boundary (Issue #15, D-48)

1. **A run is an obligation.**
   - Preparing it calculates what is owed. Approving it freezes an *approved obligation*.
   - The badge reads "Approved obligation — not paid".
   - An approved run never changes: later HR changes do not alter it, and every change is refused with 409 `run_frozen`.
2. **A disbursement is an instruction.**
   - States: "Instruction prepared — not approved", then "Approved instruction — not sent", then "Sent (simulated) — not paid".
   - None of them moves cash, changes what is owed, or settles a line.
3. **A settlement is evidenced movement of funds. None exists in S.2b.**
   - Every line's settlement is `not_settled` and every view says "Not settled — no evidence".
   - The dashboard's and accounting's "Verified as paid" is `null`, shown as "Not available".
   - Why: an outgoing payroll payment cannot yet be bound, as C.2's rules require, to a statement line of a verified account, once, with second-person exceptions and a reversal restoring the liability. Building that would change the S.1/C.2 bank reconciler and add an unapproved accounting subject. So PAY-006 is a read-only "not settled" tracker and PARTIAL, as Issue #15 allows.
4. **Nothing is posted.** PAY-007 shows the *proposed* entry: Dr staff salaries and wages, Cr salaries payable, equal while no deduction applies. "Posted entries" is always "None", with the three reasons.
5. **Nothing is repaid by payroll.**
   - An approved advance's instalment due in the month is listed under "Held, not deducted".
   - Net pay is unchanged, and the HR advance stays "approved, payment not verified" with every instalment "planned".
   - HR-008 still refuses any link (`settlement_unverifiable`).

### 2.4 Policies: nothing statutory is assumed

| Policy | State | Behaviour |
|---|---|---|
| Part-month pay | Demo placeholder rule | Calendar days of employment over days in the period, rounded half up to the paisa; labelled on the line ("Part month (demo rule)") and in the policies panel |
| Statutory deductions (income tax, EOBI, social security) | Configuration needed | Placeholders in the breakdown and the journal note; **never calculated** |
| Overtime | Configuration needed | Not calculated |
| Unpaid leave | Configuration needed | Approved unpaid leave in the period **holds the line** (blocker) until the person is excluded with a reason; pending unpaid leave warns |
| Absences | Configuration needed | Reported on the line; never deducted |
| Advance and loan recovery | Configuration needed | Instalments listed and **held** (see 2.3) |
| Suspension | (no policy) | A suspended person's line is held |

No minimum wage, tax rate or legal threshold is checked or claimed.

### 2.5 Scope and the order of checks

S.2a's scope rules apply to pay.
- **The payroll sites** are the HR sites where both `payroll` and `hr` are licensed, and the person's data scope allows a record of that site and its legal entity. They are worked out on every request.
- **A period, run or instruction** belongs to a legal entity (the employer). It is visible when one of the entity's sites is.
- **A pay line** follows its employee (HR's `employeeVisible`).
- **Every change** needs **every site of the employer** (`entityWhole`, 403 `other_sites`; the other site is never named).
  - A reader with only some of the sites sees only their staff's lines, totals over those, and the note "You see the staff of your sites only".
  - They never see a count of anyone hidden, and never act.

The order inside every changing handler:
1. Authority over the employer.
2. The record's state: frozen, submitted, closed, sent.
3. The ids from the path or body. Out of scope gives the same "not found" as never issued.
4. Maker ≠ checker by principal, and nobody changes or approves their own pay.
5. Validation of every field, before anything is stored.

A refusal leaves the stored records byte-identical (checked in every negative API test).

The S.2a lesson applies: in a frozen run, any employee id, real or invented, gets the same 409 `run_frozen`. For a limited reader, any id gets the same 403 `other_sites`.

### 2.6 Screens (office app, `apps/backoffice/src/pages/society/payroll/`)

- **Shared.** Every screen has the payroll section navigation (`PayNav`), and badges that never rely on colour alone and never say "paid".
- **Boundary panel.** On the overview and the run: "Owed, instructed and paid are three different things".
- **Menu.** "Payroll" (needs `payroll.view` and the module).
- **Pages:**
  - `PayrollDashboardPage` (PAY-001);
  - `PayrollPeriodsPage` (PAY-002, with the new-period drawer);
  - `PayrollRunPage` (PAY-003);
  - `PayBreakdownPage` (PAY-004, with the days and bonus drawers);
  - `PayrollFinalisationPage` (PAY-005);
  - `PayrollDisbursementPage` (PAY-006);
  - `PayrollAccountingPage` (PAY-007).
- **Urdu and English.** New namespace `payroll` with 415 keys in each language, plus the menu label. Parity: 10,272 keys in each.
- **HR-008's explanation** ("Payroll (S.2b) lists advance and loan instalments but holds them…") replaces "…which are not built (S.2b)".
  - It still contains "not built (S.2b)", now about verified staff payments by bank.
  - S.2a's E2E assertion on it is unchanged.

### 2.7 Layout findings fixed during the gate

The 320 px / 200 % element checks found five real defects, all in the new screens, and all fixed:

| Finding | Fix |
|---|---|
| Money values clipped in the dashboard tiles | Compact amount in the tile, the full amount as its context and accessible value, as S.1's finance dashboard does |
| "Not available" clipped in its tile | Shown as a dash, with the words beside it |
| References broke at hyphens | Word joiners, as in HR |
| Long Urdu button labels ran off the screen (S.2a buttons are `whitespace-nowrap`) | Payroll buttons wrap |
| The journal table scrolled off the side in Urdu | A list that wraps |

The page title "Disbursement status" did not fit at 200 %. It became "Pay instructions" in English; the register name is unchanged.

## 3. Reference flows (browser, `tests/e2e/s2b.spec.ts`)

1. **Run to instruction, never paid.**
   - The overview shows 14 staff, 2 lines held and "Not available" verified paid.
   - The held filter opens from the attention list.
   - An empty days answer is refused (server and UI); 23 days are confirmed, giving PKR 37,950.00.
   - A negative bonus is refused; PKR 5,000 is added as a new version.
   - Saba's own line is read only.
   - She submits PKR 735,050.00. Without the acknowledgement Ayesha's approval is refused; with it, the run reads "Approved obligation — not paid".
   - The instruction totals PKR 693,050.00, holding Karim's PKR 42,000.00 (bank account not verified).
   - It is approved, then sent (simulated). All 13 lines read "Not settled — no evidence", and no cancel is offered.
   - Accounting shows the proposed entry and "None" posted. The overview shows PKR 735,050.00 owed, PKR 693,050.00 instructed, verified paid not available.
   - The word "Paid" appears nowhere.
2. **Periods in order.**
   - November cannot open while October is open.
   - January 2027 is refused ("the next one is 2026-12"); December is created as a draft.
   - October closes after approval. November then opens and gets `ANR-PR-2026-11`.
3. **Return and reversal.**
   - A returned run comes back to the preparer with the note.
   - It is approved again, then reversed; the proposed reversal appears.
   - The period gets `ANR-PR-2026-10-2`.
4. **Who sees pay.**
   - Imran, Rabia and Shahid: no menu entry, and 403 `permission_missing` on three deep links and in the mock server.
   - Employee 360 shows no pay; a resident's mock server refuses payroll.
   - HR without payroll: Saba sees "not in your plan" and HR keeps working.
   - A developer organisation (payroll in its preset) gets `permission_missing`.
5. **Accessibility.**
   - Axe on 8 screen states at 1440, 768 and 390 px in both languages.
   - 320 × 700 at 200 % text in both languages, on every screen and the three drawers.
   - Dark mode with high contrast at 390 px.
   - Keyboard walks at 320 px / 200 % on the run, the breakdown, the periods and finalisation.

## 4. Decisions made in S.2b (open to the owner)

Each is the safest fail-closed choice. None is an adopted pay policy.

| # | Decision | Prototype behaviour | Owner question |
|---|---|---|---|
| O1 | No `payroll.post` permission | Nothing can be posted, so a posting permission would guard nothing | Add it when payroll posting is designed (with an approved classification) |
| O2 | Treasurer's payroll permissions through Al-Noor's own role change | Other societies' treasurers gain nothing, even if later licensed | Should the society treasurer starter include them? |
| O3 | Part-month pay by calendar days, half up to the paisa | Labelled "demo rule" | Calendar days, working days, or 30-day months? |
| O4 | Advance and loan instalments held | Never deducted while the advance's payment is unverified (HR-008 dependency) | Recovery policy once disbursement can be verified |
| O5 | Unpaid leave and suspension hold the line; absences are reported only; overtime is not calculated | Fail closed (no deduction, no payment of a held line) | Policies for each |
| O6 | Daily wage paid on days confirmed by the preparer, with a reason | HR attendance is shown as a guide (it starts on 19 October) | Should attendance be the source once it covers whole periods? |
| O7 | No pay terms: the line is held, and excluded with a reason | There is no compensation set-up screen (not in the PAY register) | Where pay terms are agreed and approved (maker-checker) |
| O8 | One checker approves a run | Maker ≠ checker, no own pay, acknowledgement | Should payroll follow S.1's approval policies (two signatories above a threshold)? |
| O9 | Periods: one calendar month, in order from the licence month, at most two months ahead, one open per employer, pay date from 5 days before to 10 after month end | Server-enforced | Confirm the window and whether off-cycle runs are needed |
| O10 | Reversal only before close, with no live instruction, never by a maker | A reversed run never changes; the period gets a new run | Confirm |
| O11 | Instructions: unverified bank accounts held; cash lines instructed | Cash payment is not evidenced either (D-48 asks for a witnessed slip) | How cash pay is evidenced |
| O12 | Training mode refuses payroll changes | No practice store for payroll | Confirm |
| O13 | No payroll link on Employee 360 | No demo role holds both `hr.view` and `payroll.view` | Add one when such a role exists |

## 5. Partial and known limitations

- **PAY-006 (PARTIAL).** Verified settlement needs an outgoing payroll payment subject, matched by C.2's rules to an imported statement line of a verified account:
  - run, employee, period, legal entity, direction, amount, beneficiary and a unique reference;
  - used once; a partial match approved by a second person; a reversal restoring the liability.
  - Not built: it would change the S.1/C.2 reconciler.
- **PAY-007 (PARTIAL).** Posting needs a ledger (`accounting` is not licensed for societies) and an approved payroll classification.
- **PAY-004 (PARTIAL).** Advance and loan recovery depends on HR-008 verification, and statutory deductions need an adviser.
- **HR-008 stays PARTIAL.** Payroll does not change it.
- **The demo has one site.** Multi-site and other-employer behaviour is proven with the S.2a multi-site fixture in the API tests, not in the screens.
- **No compensation set-up screen** (O7). No payslips. No bank file generation: "sent (simulated)" is a status only.
- **Manual screen-reader, device and forced-colours checks** are open ([`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md)). No WCAG conformance is claimed.

## 6. Register reconciliation

- **Adopted S.2b delta.** PAY-001…007 change to:
  - tenant edition `DEV+COMM (add-on for COMM)`;
  - gate `S.2 (optional, after HR); E (developer specifics)`;
  - PAY-004's tabs from the delta.
  - Their statuses, permissions, linked records, actions, validation, states, mock API, tests, evidence and notes are filled.
  - No other delta row was adopted.
- **HR-008.** Notes and tests only; still PARTIAL.
- **Counts.** 439 rows and 354 distinct screens, unchanged. Built 131 → **135**, partial 36 → **39**, planned 187 → **180**. `npm run register:sync` regenerated `register.generated.ts`.

## 7. Evidence

- `screenshots/`: 49 captures.
  - b01–b10: before approval, 1440 English and 390 Urdu.
  - c01–c05: after approval and a sent (simulated) instruction, both languages.
  - d01–d07: finalisation refused without acknowledgement; the preparer's view; out-of-order period; a stale run after an HR change; a held loan instalment; HR-008 unchanged.
  - e01–e02: 768 px.
  - f01–f03: 320 px at 200 % text, Urdu and English (named `…-200pct-320-…`).
  - g01–g02: dark mode with high contrast, 390 Urdu.
  - h01–h02: HR refused payroll; payroll not in the plan.
- `video/held-run-to-sent-instruction-never-paid-desktop-en.webm`: the reference flow.

## 8. Files

- **New:**
  - `packages/contracts/src/payroll.ts`;
  - `packages/fixtures/src/payroll/*`: rules, state, compute, views, handlers, the test kit, `payroll.vectors.json`, `payroll.test.ts`, `payroll.api.test.ts`;
  - `apps/backoffice/src/pages/society/payroll/*`: 7 pages and `pkit.tsx`;
  - `packages/i18n/locales/{en-PK,ur-PK}/payroll.json`;
  - `tests/e2e/s2b.spec.ts`, `tests/evidence/gates2b.evidence.spec.ts`, `tests/smoke/s2b.smoke.spec.ts`;
  - `docs/status/gate-s2b/*`.
- **Changed:**
  - `packages/contracts/src/{permissions,access,index}.ts`;
  - `packages/fixtures/src/{handlers,demo-licence,role-templates,tenant-directory}.ts`, `platform/catalog.ts`, `platform/platform.test.ts`;
  - `packages/i18n/src/resources.ts`, `locales/*/nav.json`, `locales/*/hr.json` (HR-008 explanation);
  - `packages/ui/src/workspace/tenantWorkspace.ts` (menu entry);
  - `apps/backoffice/src/nav.config.ts`, `apps/backoffice/src/prototype/routes.tsx`;
  - `docs/ui/screen-register.csv`, `packages/contracts/src/screens/register.generated.ts`.
