# Gate E.8: suppliers, payables and expenses — report

**Status:** all 17 screens are built against the mock API and remain **PARTIAL**: 0 BUILT, 17 PARTIAL, 0 PLANNED. The final complete run is green. Pushed and **STOPPED for GPT/owner review**.

> The coordinator wrote this report from Agent 3's hand-off. The harness does not allow subagents to write report files. Section 15 lists the coordinator's own checks and observations.

## 1. Assignment

Build E.8 (SUP-001…008 and EXP-001…009) on the E.0 foundation `b3a3b42`, for Wave 2 Agent 3 under the owner directive of 17 Nov 2026.
- Worktree `D:\laragon2\www\propertyos-e8`, ports 8573–8575 (`E2E_PORT_OFFSET=3400`).
- Uses only E.0's canonical helpers: `developer/scope.ts`, `idempotency.ts`, `projection.ts`, `projection.testkit.ts`, `developer/state.ts`, `DevScreen`/`DevRecord`/`devRoute`, `DEVELOPER_AREAS`, `DEVELOPER_AREA_HANDLERS` and `useKeyedCreate`. It keeps no local copies of them.
- It does not touch E.1, E.2, E.7 or E.13 code, nor E.4 quotations, which GPT owns.

## 2. Branch and commits

Branch `feature/gate-e8-payables-expenses-claude`, pushed without force.

| Commit | Content |
|---|---|
| `b01ca34` | Step 1: contracts, permissions, roles and persona, mock API, seed, vectors, API tests, i18n. Its message says 47 endpoints; there are **46**. |
| `736db4b` | Steps 2–5: the 17 screens, routes and navigation, register changed to PARTIAL, e2e/smoke/evidence specs, docs. |
| `f1e4bbf` | Final evidence (61 PNGs), test results and checkpoint. Docs only. |
| this commit | This report. Docs only. |

The complete browser run was made on the build of `736db4b`; `f1e4bbf` changes docs only.

## 3. Changed files (111 files, +9,586 / −50, measured from `b3a3b42`)

**Gate E.8's own files**
- `packages/contracts/src/payables.ts`
- `packages/fixtures/src/developer/payables/`: `rules.ts`, `state.ts`, `views.ts`, `handlers.ts`, `pay-test-kit.ts`, `payables.api.test.ts`, `payables.test.ts`, `payables.vectors.json`, `budgets.vectors.json`
- `apps/backoffice/src/pages/developer/payables/`: 11 files, including `routes.tsx`
- `packages/i18n/locales/{en-PK,ur-PK}/payables.json`
- `tests/e2e/e8-payables.spec.ts`, `tests/smoke/e8.smoke.spec.ts`, `tests/evidence/gatee8.evidence.spec.ts`
- `docs/status/gate-e8/`: `CHECKPOINT.md`, `FUNCTION_MATRIX.md`, `SECURITY_FINDINGS.md`, `MANUAL_VERIFICATION.md`, `test-results.md`, `REPORT.md`, `screenshots/` (61 PNGs)

**Shared files.** Every hunk is additive and marked "Gate E.8 (provisional; reconcile at integration)".

| File | Hunk |
|---|---|
| `contracts/src/permissions.ts` | One block of 7 permissions: `supplier.manage`, `supplier_bill.approve`, `supplier_payment.approve`, `expense.view`, `expense.approve`, `budget.manage`, `budget.approve` |
| `contracts/src/access.ts` | One `PERMISSION_MODULE` block; all 7 map to `payables` |
| `contracts/src/persona.ts` | `lsp_budget_holder` |
| `contracts/src/index.ts` | `export * from './payables'` |
| `fixtures/src/role-templates.ts` | A `GATE_E8_EXTRA` block. `LARKSPUR_ERP_ROLES` is wrapped in `withGateE8([...])`, which adds the `budget_holder` role. |
| `fixtures/src/role-templates.test.ts` | The Larkspur role count is derived as `6 + LARKSPUR_ERP_ROLES.length` |
| `fixtures/src/people.ts` | One persona, `usr_lsp_0021` |
| `fixtures/src/developer/handlers.ts` | An import and one `DEVELOPER_AREA_HANDLERS` entry |
| `apps/backoffice/src/prototype/routes.developer.tsx` | An import and one `DEVELOPER_AREAS` entry |
| `ui/src/workspace/tenantWorkspace.ts` | Two navigation items, shown only to holders of the new permissions |
| `i18n/src/resources.ts` | The `payables` namespace |
| `nav.json` (EN + UR) | 2 labels |
| `common.json` (EN + UR) | The role `budget_holder` and the welcome line for `lsp_budget_holder` |
| `workspace.json` (EN + UR) | 7 permission labels |
| `docs/ui/screen-register.csv` and `register.generated.ts` | 17 rows moved from PLANNED to PARTIAL. The register now stands at 449 rows / 362 screens: 139 BUILT, 60 PARTIAL, 163 PLANNED. |

## 4. Screen status: 0 BUILT, 17 PARTIAL, 0 PLANNED

| ID | Status | Works | Missing |
|---|---|---|---|
| SUP-001 Suppliers | PARTIAL | Legal-entity bar; category filter with counts; search, which never matches bank fields; supplier cards; New supplier drawer (needs the whole entity, refuses duplicates, idempotent) | Administration verifies a new supplier's bank details later |
| SUP-002 Supplier 360 | PARTIAL | Metrics; tabs Overview, Bills, Payments, Projects, Ledger, Documents and Activity, linking to bills and the ledger; masked payee account shown only to `bank.view` holders; activity projected per reader | PO and contract tabs planned (E.9/E.13) |
| SUP-003 Supplier bills | PARTIAL | State filter with counts; searchable supplier filter; search; separate badges for approval, posting and settlement | Posting and settlement |
| SUP-004 Bill workspace | PARTIAL | Submit; approve or reject by a second person; cancel; attach a demo document to a draft; prepare a payment instruction; lines by cost centre; history | Post is disabled with "Planned (E.7 posting rules, E-17)"; the server answers 409 `posting_planned` |
| SUP-005 New bill | PARTIAL | Searchable supplier and cost-centre pickers limited to the reader's scope; 1–20 lines with a running total; utility fields; inline server errors; save, or save and submit | 3-way match (PROC-008) waits on E.9 |
| SUP-006 Payment drawer | PARTIAL | Prepare up to the amount left; approve by someone else; mark sent (simulated); cancel with a reason; always shows "Not settled — no evidence" | No settlement (E-18) |
| SUP-007 Supplier ledger | PARTIAL | Approved bills with a running balance; bills awaiting approval and payment instructions are shown apart and never counted in the balance; withheld from partial readers | No credit notes or settled payments exist yet; GL posting planned |
| SUP-008 Utilities register | PARTIAL | Service tiles; filter; consumer number and period; "no automatic payment" | As SUP-004 |
| EXP-001 Expenses | PARTIAL | State, kind and searchable cost-centre filters; search; the S.1 voucher rule is stated | Posting and payment |
| EXP-002 New expense or claim | PARTIAL | Cost-centre, float and staff pickers limited to scope; petty cash capped at the float; demo receipt; inline errors | DOC-003 storage waits on E.13 |
| EXP-003 Expense workspace | PARTIAL | Submit; withdraw (maker only); approve or reject (never by the maker or the claimant); attach a receipt; history | E-18 / E-17 |
| EXP-004 Approvals | PARTIAL | To decide; waiting for someone else, with the reason in words; recently decided | APR thresholds wait on E-27 |
| EXP-005 Petty cash | PARTIAL | Cash on hand comes only from a witnessed count; count by denominations; a different person witnesses or disputes; top-up capped at the float and approved by someone else | Top-ups are instructions only (E-18) |
| EXP-006 Employee expenses | PARTIAL | Claims by staff member; new claim; "owed, not reimbursed" | HR link waits on E.14; reimbursement on E-18 |
| EXP-007 Budgets | PARTIAL | Fiscal-year switch; approved and open versions; new budget (draft v1) | — |
| EXP-008 Budget workspace | PARTIAL | Versions are never edited in place; the preparer submits or withdraws; someone else approves or rejects; a new version starts prefilled; supersession; history | — |
| EXP-009 Budget vs actual | PARTIAL | Approved versions only; columns for budget, posted actual, approved-not-posted (separate) and remaining; entity totals only for readers who see the whole entity; an honest empty state | Actual stays 0.00 until E-17; commitments wait on E.9 |

## 5. Features completed

- **Mock API:** 46 endpoints, checked in the order of plan §4.2.
- **Seed data:** 6 suppliers, 7 bills (5 submitted with labelled demo documents, 2 drafts), 6 expenses and claims, 2 petty-cash floats (one count awaiting its witness) and 3 budgets.
  - Nothing is seeded as approved, paid, settled, posted, witnessed or instructed.
  - Every approval in the evidence is made during the session, by Zubair.
- **R3 journey in the browser:** a bill is approved by a second person, a payment instruction is prepared and approved, then marked sent (simulated). The ledger still shows the full amount owed.
- **UI quality:**
  - searchable pickers for supplier, cost centre, legal entity and staff;
  - breadcrumbs, and Supplier 360 tabs that link to bills and the ledger;
  - loaders, and success toasts only after the server accepts;
  - blocked actions explained in words;
  - English and Urdu (right-to-left), dark mode;
  - 320 px at 200 % text, and keyboard reach.

## 6. Test outcomes

**Static checks**
- Typecheck: 0 errors.
- Lint (ESLint, logical CSS, and i18n parity across 28 namespaces × 11,593 keys): 0 problems.
- Production build: OK.

**Unit and API (Vitest)**
- `payables.api.test.ts`: 40/40.
- `payables.test.ts` (vectors): 8/8.
- Full suite: **1,797/1,799**.
  - The 2 failures are the known 5-second timeouts under 100 % CPU, in `community.test.ts` and `finance.api.test.ts`.
  - Both files pass when run alone (78/78).

**Complete Chromium run** (lock held 19:20:59Z–20:22:45Z; 3 workers; retries off; both loopbacks checked against `dist`)
- **528/528 passed, 0 failed**, in 57.0 min.
- The run covered all e2e specs, plus the `gatee8` evidence spec and the `gatee0` evidence spec. `gatee0` was included because E.8 adds menu items for the accounts officer.
- `e8-payables.spec.ts`: 14/14. `gatee8` evidence: 6/6.

**Firefox and WebKit smoke:** 76/76 in 4.6 min (`e8.smoke.spec.ts`: 6/6).

**Known intermittent tests:** both passed in this run: `identity.spec.ts:327`, and `s2a.smoke.spec.ts:52` in Firefox and WebKit.

**Power:** the e2e run and the smoke both started on AC. The check after the smoke (20:22Z) found the laptop on battery.

## 7. Permission and security tests

All are in `payables.api.test.ts`. Every refusal also checks that the whole store is byte-identical afterwards.

**Permissions**
- Every E.8 permission maps to `payables`.
- No original demo person gains any of them; only Faiza, Zubair and the new budget holder hold them.

**Maker ≠ checker**
- Every maker-checker pair is split between two people.
- A test-only person who holds both sides is still refused on their own bill, payment instruction, expense, budget version and petty-cash count.
- A claimant cannot approve their own claim (Zubair, `exp_lsp_0006`); a second checker can.
- Whoever counts the cash cannot witness their own count, and whoever requests a top-up cannot approve it.

**No id oracle**
- Hidden and invented ids get identical 404s for bills, expenses and budgets, and writes to either are refused identically.
- A hidden cost centre, float or supplier in a request body gets the same field error as an invented one.
- A hidden legal entity in a query or body gets the same answer as an invented one.

**Isolation**
- **Legal entity:** tested against E.0's test-only second entity, LRD. Its suppliers and bills are separate, and mixing in a supplier, cost centre or float from the other entity gives 422 `cross_entity_forbidden`.
- **Cost centre:** Rehan sees only Heights expenses, floats and budgets, and no entity totals.
- **Projection:** comparing narrow and full readers with E.0's test kit across 11 endpoints finds no leaks and no unexercised terms.

**Bound idempotency**
- A duplicate submit creates exactly one bill, one expense or one supplier.
- Reusing a key with a different input, person or operation gets 409.
- A replay after the caller has lost scope gets exactly the answer a never-made request would.

**Revocation:** removing `supplier.view`, `expense.view` or `bank.view` hides the data immediately.

**Existing permissions and licensing**
- Nadia and Farah hold `expense.create` but not `expense.view`, so they can create nothing.
- Crescent Bay gets `module_not_licensed`, and Bilal gets `permission_missing`.
- Nadia can read suppliers but cannot write anything.

**Suspension and practice mode:** a suspended organisation can read but not write, and practice mode refuses every write.

**Bank boundary**
- Mehwish's serialized responses contain no `3307`, `4021`, `Demo Bank` or masked digits.
- Supplier search does not match bank fields.
- Preparing a payment instruction needs `bank.view`.

**Money truth**
- Posting is refused with 409, and no settlement route exists.
- A payment instruction never reduces the ledger balance.
- "Actual" counts posted amounts only.
- The seed contains no approved records.

**Browser (e2e)**
- A person's own claim is blocked, with the reason in words.
- Mehwish sees no bank data.
- A hidden record looks exactly like an invented one.
- Nadia gets a read-only notice and no menu entry.

## 8. Mutation checks

**30/30 mutants were caught**, and every file was restored byte-identical (checked by SHA-256). The list is in `test-results.md`.

- **Mutant 30** ("reads compute the seed") makes every read save the whole store, so the batch run hit its 10-minute limit. Run alone, it fails 10 tests.
- **Interrupted first batch:** when the first batch was paused, Windows killed the process without running its restore handler, leaving mutant 11 in `handlers.ts`. `git diff` caught it, and the file was restored from HEAD before any build.

## 9. Accessibility

- **axe, complete run:** 1,693 scans, 0 violations. 86 of those scans are on E.8 screens: EN and UR at 1440 and 390 px, and dark mode in both languages at 390 px.
- **320 px at 200 % text:** every E.8 screen, in EN and UR, has no layout problems and no sideways scroll. Problems are checked and reported per screen.
- **Keyboard:** focus reaches every control at 320 px / 200 % without being hidden by the header or the bottom bar.
- **Still needs a person:** NVDA, VoiceOver and real devices (see `MANUAL_VERIFICATION.md`). No WCAG conformance is claimed.

## 10. Screenshots

61 PNGs are in `screenshots/`, and every width matches its file name:
- the 17 screens plus the payment drawer, in EN and UR at 1440 px;
- 9 screens at `…-200pct-320-en/ur`;
- 3 in dark mode;
- 4 boundary shots: bank details hidden, Heights only, own claim, and budget vs actual with no approved version.

## 11. Defects found and fixed (all in E.8's own code)

**At 320 px with 200 % text**
- Header metric amounts overflowed. They now show a compact amount, and screen readers still hear the full amount.
- Decision codes such as "E-17" broke at the hyphen. Word joiners now keep them whole.
- Unbreakable references ran off the screen in cards and history. They now stay whole when they fit, and wrap only when wider than their card.
- Petty cash nested one card inside another. It is now flat.
- The year and kind switches overflowed. They now wrap.
- Long filter defaults were clipped. They are shorter now.
- A seed description containing an en dash reflowed badly. It now reads "Lahore to Islamabad".

**Seen in the screenshots**
- U+2011 has no glyph in the app fonts and rendered as "Top_ups". It is replaced by a hyphen plus a word joiner.
- "(fictional)" appeared twice on sample documents.
- In Urdu, a supplier's phone and e-mail interleaved and the contact name was left-aligned. Each detail now has its own line.

## 12. Security findings

Details are in `SECURITY_FINDINGS.md`. No vulnerability was found in the E.0 base. Points to note:

1. People who already held `supplier.view` from their starter sets (Nadia, Farah and Mehwish) can now read the supplier screens, read-only and without a menu entry. Bank details reach only Nadia and Farah, through the `bank.view` they already had.
2. The claimant picker shows organisation staff names to expense makers. This is flagged for the E.14 privacy review.
3. Budget vs actual counts approved bills only for `supplier.view` holders, and shows them only as amounts.
4. When an idempotent request is replayed, its own re-check of authority is never the only check: an earlier scope check always runs first. The resulting behaviour is tested.

## 13. Owner decisions and blockers

None of these is approved yet. Each uses the conservative default.

| Decision | Default on this branch |
|---|---|
| E-06 | Faiza (maker) and Zubair (checker) hold the payables permissions. **New persona:** Rehan Saleem, `lsp_budget_holder` / `usr_lsp_0021`, role `budget_holder`, Larkspur Heights only, with `project.context.use`, `expense.view`, `expense.create` and `budget.manage`. |
| E-07 | `supplier.manage`, `supplier_bill.approve`, `supplier_payment.approve`, `expense.view`, `expense.approve`, `budget.manage`, `budget.approve` |
| E-17 | No GL posting |
| E-18 | No outgoing settlement. SUP-006, EXP-005 and EXP-006 stay PARTIAL until this is decided. |
| E-27 | APR-001…005 are not opened to developers |
| E-37 | Legal entities and cost centres come read-only from E.0 |
| E-08 | Isolation is tested on the test-only second entity |
| Edition | Screens serve developer organisations only (`DEV`), although the register says DEV+COMM, because payables data exists only for developers |
| Writes | Every payables write also needs the area's read permission |
| Bank | Preparing or approving a payment instruction needs `bank.view` |
| Quick create | "New expense" stays planned |
| Bill visibility | A bill is visible only to a reader who sees every cost centre it touches |

## 14. Integration readiness

**Aligned with Agent 1's canonical roster:**
- Faiza (`usr_lsp_0006`) and Zubair (`usr_lsp_0007`);
- the new principal at `usr_lsp_0021`, which is free on `integration/e-wave1` (that branch uses up to 0009);
- the role count, which is derived from the role list.

**Expected merge conflicts:**
- `role-templates.ts` (the `withGateE8` wrapper), `people.ts`, `persona.ts`;
- the permissions and access blocks, and the navigation block;
- the register CSV and `register.generated.ts`, and `resources.ts`;
- `common.json`, `nav.json` and `workspace.json`.

**Also to fix at integration:** Faiza's and Zubair's welcome lines still mention only journals.

**E.13 hooks needed at integration:**
- **Record providers:** `sup_` → SUP-002, `sbl_` → SUP-004, `spi_` → SUP-006 `?record=`, `exp_` → EXP-003, `bud_` → EXP-008, `pcf_` → EXP-005. Visibility comes from the payables finders.
- **Tasks:** bills, payment instructions, expenses and claims, and budget versions awaiting approval; counts awaiting a witness; top-ups awaiting approval.
- **Activity:** each record's history.

## 15. Coordinator verification and observations

- `git ls-remote` shows `f1e4bbf8dc296f743fc9086b2cd61fffbe83a952` before this report commit, and the worktree was clean.
- `git diff --name-only b3a3b42..HEAD`:
  - no `PROJECT_HANDOFF.md`, Nizam material, ZIPs, `.env` files, keys or credentials;
  - outside E.8's own folders, only the shared files listed in §3.
- **Grants match the allowed default:** `GATE_E8_EXTRA` adds payables permissions only to `accounts_officer` (Faiza) and `finance_controller` (Zubair), plus the new `budget_holder` role. No starter set changes.
- **Persona id:** `usr_lsp_0021` collides with nothing on `integration/e-wave1` or on the E.3 local-validation branch.
- **Ports:** 8573–8575 had no listeners after the hand-off. The lock passed straight to Agent 1.
- **Screenshots reviewed:**
  - the Supplier 360 Urdu 1440 shot;
  - the payment drawer English 1440 shot: "Not settled — no evidence", masked payee account;
  - the supplier ledger at 320 px / 200 %: the balance is unchanged by the instruction.

  All render correctly. In the 320 px full-page shot, the bottom bar appears mid-page. That is an artefact of full-page capture, not a layout defect.
- **Minor UX observation, not fixed:**
  - In Supplier 360, "Open bills" counts only draft and submitted bills (`views.ts:275`). The evidence state therefore shows "Open bills 0" beside "Approved, owed Rs 2,850,000.00".
  - In accounting, "open" usually means unpaid. A clearer label would be "In progress" or "Not yet decided"; the alternative is to count approved-but-unpaid bills.
  - This is a small follow-up for review, not a blocker.
- **Errata:** commit `b01ca34` says 47 endpoints; the correct number is 46.

**STOPPED for GPT/owner review. Nothing is merged to `main` and nothing is deployed.**
