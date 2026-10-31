# Gate S.1: function matrix

The owner authorised **Gate S.1, Society Finance & Governance** as parallel, frontend-only work (branch `feature/gate-s1-society-finance` from `afd9357`, V3.2 documents at `0e57604`). This matrix lists each requirement of that brief, where it is built, how it is tested and where the evidence is. Results of every run: [`test-results.md`](test-results.md).

**Paths and file names:**
- Paths are relative to the repository root.
- Office pages: `apps/backoffice/src/pages/society/finance/`. Mock API: `packages/fixtures/src/society/finance/`. Contracts: `packages/contracts/src/finance.ts`.
- Screenshots: `docs/status/gate-s1/screenshots/<name>-<width>-<en|ur>.png` (`-200` = 200 % text). Videos: `docs/status/gate-s1/video/*.webm`.
- Tests:
  - `finance.api` is `packages/fixtures/src/society/finance/finance.api.test.ts` (through the fail-closed mock server);
  - `finance.vectors` is `finance.test.ts` next to it, running `finance-ops.vectors.json` and `approvals.vectors.json`;
  - `s1.spec` is `tests/e2e/s1.spec.ts` (production builds, axe inside).

## 1. Society finance dashboard and cashbook

| # | Requirement | Built in | Tests | Evidence |
|---|---|---|---|---|
| 1 | FIN-001: every KPI opens its records | `FinanceDashboard.tsx`; `GET /finance/overview` (each figure carries its `href`) | `s1.spec` reference 1 (unreconciled → bank feed filtered to unmatched) | `f01-finance-dashboard-*`, `m01-dashboard-*`, `t01-dashboard-dark-*` |
| 2 | Billed ≠ Collected ≠ Cash received ≠ Bank settled | The four-step ladder on FIN-001, each explained and linked | `s1.spec` reference 1 (49,100 / 12,600 / 0 / 12,600) | `f01-*` |
| 3 | BANK-007 cashbook is derived, never a second ledger | `cashbook.ts` `cashEvents` (openings, verified payments and their reversals, posted vouchers, settled transfer legs; key `source|id|1|leg`); no stored cashbook rows | `finance.vectors` (sum of settled sources; each source counted once); `finance.api` seed test | `f02-cashbook-october-*`, `f13-cashbook-after-deposit-*` |
| 4 | Each cashbook line shows its evidence; pending items apart | `EvidenceText` (statement line, witnessed count or slip, counter, voucher, handover, approval); pending items section; reconciliation per bank account by month | `s1.spec` reference 1 (6 October lines, pending items, reconciliation row) | `f02-*`, `t02-cashbook-high-contrast-*` |
| 5 | BANK-001/002: cash and bank accounts with settled balances | `AccountsPages.tsx`; `GET /finance/accounts`, `/finance/accounts/:id` | `s1.spec` phones (axe 390/768/1440 EN/UR) | `f03-*`, `f04-office-cash-workspace-*` |
| 6 | BANK-009 cash vouchers: maker ≠ approver | `CashbookPage.tsx` `VoucherDrawer`; `POST /finance/vouchers` raises an approval; the preparer is refused by principal id | `s1.spec` reference 3 (`own_request`); `finance.api` reference 4 | `g04-cash-voucher-*`, `g05-approval-preparer-cannot-decide-*` |
| 7 | Posted vouchers corrected only by a reversal | `POST /finance/vouchers/:id/reverse` (opposite voucher, approved by someone else; the original stays posted) | `finance.api` (diesel voucher reversed; petty cash back to 3,850) | — |
| 8 | No expense vouchers while `payables` is licensed (D-34) | `handlers-books.ts` refuses `expense_owned_by_payables`; receipts still allowed | `finance.api` D-34 test (adds a payables grant for that test only) | — |
| 9 | Vouchers only on cash accounts | `voucher_cash_only` | `finance.api` | — |

## 2. Deposits and transfers (BANK-006), settlement by evidence (BANK-004)

| # | Requirement | Built in | Tests | Evidence |
|---|---|---|---|---|
| 10 | An approved instruction is not a settlement | `TransfersPage.tsx` (“Approved instruction — not sent”); the cashbook does not move until a leg settles | `finance.vectors`; `finance.api` reference 1; `s1.spec` reference 1 | `f07-*`, `f08-approved-instruction-not-sent-*` |
| 11 | Cash legs settle on a witnessed slip | Slip recorded by one person, witnessed by another; then *in transit* | `s1.spec` reference 1 (the manager who recorded the slip cannot witness it) | `f09-in-transit-*` |
| 12 | Bank legs settle on a matched statement line (C.2 rules) | `settle.ts` `legCandidates` on the leg's own account (debit for money out, credit for money in); full match settles; a partial match only through an exception a second person approves; a line settles one subject once | `finance.api` reference 1 (full and partial); `s1.spec` reference 1 | `f10-demo-statement-*`, `f11-match-statement-line-*`, `f12-deposit-settled-*`, video `ref1-finance-deposit-desktop-en` |
| 13 | Demo statement helper generates a labelled fictional file, never settles (D-48) | `GET/POST /finance/demo-statement` (`#sample=Demo document, fictional data`); import goes through C.2's `/bank/statements` | `finance.api`; `s1.spec` reference 1 | `f10-*` |
| 14 | Legal-entity separation | Transfers only between the society's own verified accounts | `finance.api` (“money never moves to another entity or to an account the society does not have”) | — |
| 15 | Bank feed suggests S.1 subjects | C.2 `BankPages.tsx` suggestion kinds `transfer` and `cheque`; debit, settles and held markers | `finance.api` | — |

## 3. Bulk office collection (FIN-013/014) and cheques (FIN-007)

| # | Requirement | Built in | Tests | Evidence |
|---|---|---|---|---|
| 16 | Collect cash and cheques for many flats, per liable payer | `OfficeCollectionsPage.tsx` `BatchDrawer` (searchable candidates, add cash or cheque) | `s1.spec` reference 2; `finance.api` reference 2 (4 cash lines + 1 cheque) | `c01-*`, `c02-batch-draft-*` |
| 17 | Cash witnessed by a second person | The collector never confirms (shown as *You collected this*); a second person enters the count; a differing count is refused | `s1.spec` reference 2; `finance.api` (“cash needs a second person”) | `c03-batch-submitted-collector-cannot-confirm-*`, `c04-batch-witness-count-*` |
| 18 | Cheques only acknowledged until cleared | “Cheque received — not a receipt of payment”; no payment, allocation or receipt until a statement line clears it | `s1.spec` reference 2 (A-101 still owes 5,200); `finance.api` | `c05-*`, `c06-cheques-pending-*`, `c07-cheque-received-not-a-receipt-*`, video `ref2-office-collection-desktop-en` |
| 19 | Returned cheque settles nothing | `POST /cheques/:id/return` | `finance.api` reference 2; `finance.vectors` | — |
| 20 | Duplicate cheque refused | `cheque_duplicate`, `cheque_duplicate_in_batch` | `finance.api` reference 2 | — |
| 21 | Partial match only by exception | Same C.2 rule as transfer legs | `finance.api` | — |
| 22 | Reversal after clearing, with approval | The bank's debit line is the evidence; the treasurer approves; payment, allocation and receipt reversed; lines reopen; the resident sees it | `s1.spec` cheque test (5,200 → 0 → 5,200; resident history *reversed*); `finance.api` | — |
| 23 | Single office cash (FIN-007) and D-46 | Per-site cash-witnessing setting (`single_counter` default keeps C.2's immediate receipt; `second_person_required` refuses single cash) | `finance.api` | — |

## 4. Month close (BANK-008) and period locks

| # | Requirement | Built in | Tests | Evidence |
|---|---|---|---|---|
| 24 | Checklist from live records, each opening its records | `closeChecks` (period ended, unreconciled lines, proofs waiting, exceptions, unposted runs, vouchers open, cash in transit, unsettled instructions, cheques pending, batches open, witnessed cash count) | `s1.spec` reference 1 (October blocked); `finance.api` reference 3 | `f05-close-october-blocked-*` |
| 25 | Close, lock and refused late posting | `POST /finance/periods/:p/close`; `assertOpen` refuses and records `posting_refused` | `s1.spec` month close; `finance.api` reference 3 | `o05-september-closed-reopen-*` |
| 26 | Reopen only by independent approval | `reopen-request` raises an approval (general secretary or president); the requester cannot decide it | `s1.spec` month close | — |
| 27 | Witnessed cash count | Count by one person, witness by another; it must equal the expected balance | `s1.spec` month close (13,200 counted) | — |

## 5. Reminders and printing (COL-007/008/009, BILL-018)

| # | Requirement | Built in | Tests | Evidence |
|---|---|---|---|---|
| 28 | Versioned reminder rules (D-36 defaults) | `RemindersPage.tsx`; `POST /reminders/policies` | `s1.spec` governance records (version 2, cap 3, in force) | `o01-reminders-*`, `m07-reminders-*` |
| 29 | Consent, quiet hours, rate limit, skip rules | `reminders.ts` `planFor` (proof pending in any C.2 state, no consent, quiet hours, monthly cap, not due yet) | `finance.vectors` reminder rules; `finance.api`; `s1.spec` (A-305 skipped, SMS waits at 22:30) | `o02-reminder-preview-skips-*` |
| 30 | Idempotent sends | Send key; a repeat returns `replayed: true` | `s1.spec`; `finance.api` | — |
| 31 | Dues notices one per liable payer (COL-008) | `POST /collections/dues-notices`; aging page action | `s1.spec` delegation and dues notices | — |
| 32 | Print pack = posted invoices of the run (BILL-018) | `PrintPackDrawer` from the run workspace | `s1.spec` reminders and printing | — |
| 33 | Nothing is really sent | Every channel simulated; documents labelled “Demo document, fictional data” | `s1.spec` | — |

## 6. Committee 360 and approvals (RES-008, APR-001…005)

| # | Requirement | Built in | Tests | Evidence |
|---|---|---|---|---|
| 34 | Committee terms, offices and their authority | `CommitteePage.tsx`; authority read from the policy in force | `s1.spec` reference 3 | `g01-*`, `g02-committee-offices-and-authority-*`, `t04-*` |
| 35 | Meetings and decisions | `RecordMeeting`, `RecordDecision` (forms clear after saving; attendees split on `,` and `،`) | `s1.spec` governance records (3 attending) | — |
| 36 | Inbox of S.1 and C.1/C.2 approvals | `ApprovalsInboxPage`; C.1/C.2 kinds keep their own maker-checker | `s1.spec` phones; `finance.api` | `g06-my-approvals-*`, `t05-*` |
| 37 | Approval 360: rule, version, eligible people, why not | `ApprovalWorkspace` (own request, conflict of interest, already decided, not an approver, permission missing) | `s1.spec` reference 3 | `g05-*`, `g08-*`, `g09-approval-approved-with-audit-*`, video `ref3-committee-approvals-desktop-en` |
| 38 | Policies are versioned; the version on the request date governs | `policyOn`, `raiseApproval` | `finance.vectors` (version by date) | `g03-approval-policy-v1-*` |
| 39 | A draft never governs itself; its author cannot approve it | `approval_policy` subject | `finance.api`; `s1.spec` governance records (`own_request`) | — |
| 40 | Principal IDs, never names | `eligibleFor`, `evaluate` compare principal ids | `finance.vectors`; `finance.api` | — |
| 41 | Delegation | `DelegationPage`; dated, by subject; never one's own request or one that pays the delegate; each decision names whom the delegate acted for | `s1.spec` delegation; `finance.api` | `g10-delegation-*` |

## 7. Transfers and clearance (OWN-003/004/006)

| # | Requirement | Built in | Tests | Evidence |
|---|---|---|---|---|
| 42 | Dues check refuses while the flat owes | `POST /ownership-transfers/:id/dues-check` | `s1.spec` society transfer (5,700 outstanding); `finance.api` | `o03-*`, `o04-transfer-dues-check-*` |
| 43 | Transfer fee by bylaw and versioned rate (D-42) | Site setting (5,000.00, Bylaw 14(2), version 1); fee invoice with a BILL-016 number | `s1.spec`; `finance.api` | — |
| 44 | Clearance certificate only at zero balance or with a waiver | `OWN-006`; `ANR-CLR-2026-0001` | `s1.spec`; `finance.api` | — |
| 45 | The approved transfer raises the BILL-017 payer change | `raisedBy` on the liability change | `s1.spec` (payer changes list shows `ANR-OWT-2026-0001`) | — |

## 8. Financial invariants (brief, part 3)

| Invariant | Where enforced | Proved by |
|---|---|---|
| Settlement only on evidence | `settle.ts`, `consumeLine` (a line proves one subject once), C.2 `candidatesFor` | `finance.api` references 1–2; `finance.vectors` |
| Legal-entity separation | Accounts by issuing entity; transfers only between the society's verified accounts | `finance.api` |
| Idempotency | `replay`/`remember` keys on posting endpoints; reminder send keys | `finance.api`; `s1.spec` reminders |
| Cash and cheque controls | Second person for cash; cheques never receipts until cleared | `finance.api`; `s1.spec` reference 2 |
| Payer liability | Collections only for the liable payer of the account | `finance.api` reference 2 (`payer_not_liable`) |
| Immutable posted history | Reversal vouchers and payment reversals; originals stay | `finance.api` |
| Period locks | `assertOpen` on vouchers, settlements and office cash | `s1.spec` month close; `finance.api` reference 3 |

## 9. Licensing and authorization

| # | Requirement | Built in | Tests |
|---|---|---|---|
| 46 | Supreme Admin licensing preserved (module and feature) | `requires(module, permission, suspension, feature)` in the mock transport; S.1 features in the catalogue; Al-Noor's fictional amendment | `finance.api` authorization; `s1.spec` access (Larkspur: `feature_not_licensed`; Shalimar: `module_not_licensed`) |
| 47 | Site-level authorization and route gate | `workspaceRouteTarget` carries the area's `anyOf` and `feature`; the cashbook, accounts and transfers own their addresses without new menu entries | `s1.spec` reference 1 (the manager prepares a deposit but cannot open the bank feed) |
| 48 | Roles | Guard: no money; secretary reads, never prepares; accounts officer prepares; treasurer approves | `s1.spec` access; `finance.api` |
| 49 | Security sample paths | Every S.1 route pattern uses `[\w-]+` groups validated in the handler | `packages/fixtures/src/security.test.ts` |

## 10. UI and accessibility

| # | Requirement | Built in | Tests | Evidence |
|---|---|---|---|---|
| 50 | English and Urdu (RTL) | `finance` and `governance` namespaces; i18n parity | `npm run lint` (parity) | `*-ur.png` |
| 51 | Desktop, tablet, phone; 320 px at 200 % text | Container queries; long action labels wrap (`WRAP`); large amounts break between the currency and the number, never inside it (`WrapMoney`), and step down a size in a narrow page; IBANs break anywhere; tables scroll inside their own labelled region | `s1.spec` sweep (20 screens, tabs and drawers; 390/768/1440 axe and no sideways scroll; 320 px at 200 %) | `m01`–`m07` at 390 and 320-200, EN/UR |
| 52 | Light, dark, high contrast | D.1 personalization applies unchanged | evidence only | `t01`–`t05` |
| 53 | Searchable dropdowns, keyboard access | React Aria selects and the batch's searchable candidates; the select trigger no longer grows a second line (shared fix) | `s1.spec` (every flow driven through them) | video `phone-ur-200-finance` |
| 54 | No placeholder content | Every S.1 address renders its page or an access outcome | `register.spec` | — |
