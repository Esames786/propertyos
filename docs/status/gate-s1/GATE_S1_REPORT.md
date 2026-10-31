# Gate S.1: Society Finance & Governance (Al-Noor Residency)

**Status: built in parallel, frontend only, and stopped for review and integration planning.**
- **Branch:** `feature/gate-s1-society-finance`, from `afd9357` (Gate D.1, before its closure). The D.1 closure (`7ddc606`) is not in this branch, as instructed; [§9](#9-integration-notes) lists what to expect when the two meet.
- **Source documents:** V3.2 at `0e57604` (`docs/nizam-v3.2-scope-review`): execution plan §S.1, owner decisions D-34, D-35, D-36, D-42, D-46, D-48, and the register delta.
- **Not done, as instructed:**
  - no Laravel or production migrations;
  - no real bank, payment gateway, funds transfer, SMS, WhatsApp or identity provider;
  - no merge into `main`;
  - no change to the main working directory;
  - no Gate D.2 or later; no SOS.
- **How it runs:** in the browser against the typed, fail-closed mock API. **Data:** fictional throughout (`(Demo)` names, `+92 399` numbers, `example.com`). PropertyOS is a codename.
- **Not claimed:** WCAG conformance. Automated accessibility checks pass; manual screen-reader, device, printing and forced-colour checks are open in [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md).

Further detail:
- Results of every check: [`test-results.md`](test-results.md).
- Requirement by requirement: [`FUNCTION_MATRIX.md`](FUNCTION_MATRIX.md).

## 1. How to try it

`npm run dev` starts the office app (5173), the resident app (5174) and Platform HQ (5175). In the office app: `/backoffice/get-started` → **Explore the society demo** (*Payments arriving*, the default).

| Where | Who | What to look at |
|---|---|---|
| **Society finance** (`/backoffice/fin/finance-dashboard`) | **Ayesha Malik**, treasurer | The four numbers people confuse, side by side: billed ≠ collected ≠ cash received ≠ settled in the bank. Every figure opens its records. |
| Society finance → **Open the cashbook** | Ayesha | October: handover openings, verified payments, posted vouchers; each line with its evidence. Pending items listed apart. Reconciliation per bank account. **Close the month** shows what blocks October. |
| Cashbook → **New cash voucher** | **Saba Javed**, accounts officer | A 12,000 repair voucher needs the treasurer **and** the general secretary (policy version 1). Saba sees why the preparer cannot decide the request. |
| **Deposits and transfers** | **Imran Qureshi**, building manager | Prepare a deposit of office cash. After approval it is an *approved instruction — not sent*; Imran records the slip, Ayesha witnesses it (*in transit*); Saba imports the demo statement and matches the bank line (*settled*). |
| **Office collections** | Saba, then Ayesha | A batch of cash and a cheque. Saba, who collected it, cannot confirm it; Ayesha counts and confirms. Cash gets receipts; the cheque says *Cheque received — not a receipt of payment* until a statement line clears it. |
| **Approvals**, **Approval policies**, **Delegation** | Ayesha; **Rabia Hashmi**, general secretary | The inbox, each request's rule, version, eligible people and audit; drafting policy version 2 (Rabia, who drafted it, cannot approve it); delegating vouchers while away. |
| **Committee** | Rabia | Terms, offices and their authority (from the policy in force), meetings and decisions. |
| **Reminders**; a billing run → **Print pack**; Aging → **Print dues notices** | Saba | Who would be reminded and who is skipped, and why (proof pending, no consent, quiet hours, cap). Every send is simulated and never sent twice. |
| **Transfers and clearance** | Imran, then Ayesha | B-403's sale: the dues check refuses, a fee invoice, payment, approval, clearance certificate, and a payer change raised in C.2's queue. |
| Resident app → **Payment history** (A-101) | Kamran Siddiqui | The cheque's state in plain words, and a reversed receipt if the bank takes a cleared cheque back. |

## 2. What S.1 adds

### 2.1 Model (`packages/contracts/src/finance.ts`; mock API `packages/fixtures/src/society/finance/`)

- **Accounts:** the society's bank accounts (C.2's verified collection accounts), the office cash box and petty cash, each with a custodian.
- **Cashbook (D-34): a derived view, never a second ledger.** It is the sum of settled sources: handover openings, verified payments and their reversals, posted cash vouchers, and settled transfer legs. Nothing is stored as a cashbook row. Each line names its evidence (statement line, witnessed count or slip, counter, voucher, handover, approval).
- **Cash vouchers:** prepared on cash accounts only, approved by someone else under the policy in force, then posted; corrected only by an opposite voucher. Refused for expenses while `payables` is licensed.
- **Deposits and transfers:** an instruction with two legs. Approval makes an *approved instruction*, which settles nothing. A cash leg settles on a slip witnessed by a second person; a bank leg on a statement line of its own account, matched by C.2's rules (D-48).
- **Office collection batches and cheques (D-35):** cash lines need a second person's count; a cheque is an acknowledgement until a statement line clears it; returned, duplicate, partial-match and reversal-after-clearing paths.
- **Periods:** one lock per legal entity and month; a checklist; close; refused late postings are recorded; reopening goes through an approval.
- **Approvals:** versioned policies (by subject and amount band, offices as approvers, approvals required), chosen by the request date; principal IDs, never names; delegations.
- **Committee:** terms by office, meetings, decisions.
- **Reminders and printing (D-36):** versioned rules, a send preview with skip reasons, idempotent sends, print packs and dues notices.
- **Ownership transfers (D-42):** dues check, fee by bylaw and versioned rate, approval, clearance certificate, and an ordinary BILL-017 payer change.

### 2.2 Screens (15 distinct, plus states)

| Screen | Address | Register status |
|---|---|---|
| FIN-001 Society finance | `/backoffice/fin/finance-dashboard` | PARTIAL (society slice; developer specifics in Gate E) |
| BANK-001 Cash and bank accounts | `/backoffice/bank/bank-accounts` | PARTIAL (same) |
| BANK-002 Account 360 | `/backoffice/bank/bank-account-360-workspace?record=` | PARTIAL (same) |
| BANK-006 Deposits and transfers | `/backoffice/bank/transfers` | PARTIAL (same) |
| BANK-007 Cashbook (new) | `/backoffice/bank/cashbook` | BUILT, with states BANK-008 close month and BANK-009 cash voucher |
| FIN-013 Office collections (new) | `/backoffice/fin/office-collections` | BUILT, with state FIN-014 batch review |
| COL-007 Reminders (new) | `/backoffice/col/reminders` | BUILT, with states COL-008 dues notices and COL-009 send reminder |
| RES-008 Committee 360 (new) | `/backoffice/committee` | BUILT |
| APR-001…005 Approvals | `/backoffice/apr/…` | BUILT |
| OWN-003, OWN-004 Transfers and clearance | `/backoffice/own/…` | PARTIAL (society transfers; developer sales in Gate E), with state OWN-006 clearance certificate (BUILT) |
| BILL-018 Print pack | from the run workspace | BUILT |

**C.2 screens extended:** FIN-007 (cheques; the cash-witnessing setting), FIN-011 (paid in advance), COL-005 (print and remind; now BUILT), BANK-004 (S.1 suggestions and settlement), BILL-012 (cheque rules), BILL-016 (new document kinds), BILL-017 (changes raised by a transfer), PORTAL-004 (paid in advance).

## 3. The reference experiences

1. **Society finance** (video `ref1-finance-deposit-desktop-en.webm`; screenshots `f*`): the dashboard, cashbook, accounts and the month-close checklist; then a cash deposit from instruction to settlement, the cashbook moving only at each settlement.
2. **Bulk office collection** (video `ref2-office-collection-desktop-en.webm`; screenshots `c*`): cash witnessed by a second person, a cheque acknowledged but not paid.
3. **Committee approvals** (video `ref3-committee-approvals-desktop-en.webm`; screenshots `g*`): the committee and its authority, a voucher needing two signatories, the preparer unable to decide, the decision drawer, the audit, delegation.

Each runs in English on desktop and in Urdu on a phone. Further: the other S.1 screens (`o*`), every S.1 screen on phones at 390 px and at 320 px with 200 % text in both languages (`m*`), dark and high contrast (`t*`), and a phone video in Urdu at 200 % (`phone-ur-200-finance.webm`).

## 4. Owner decisions, as applied

| Decision | Applied |
|---|---|
| D-34 cashbook | A derived view over settled sources; posted vouchers only for cash no other module owns; expense vouchers refused while `payables` is licensed (tested by granting `payables` in one test only). |
| D-35 cash vs cheque | Cash needs a second person's count; cheques are acknowledgements until cleared on a statement line. |
| D-36 reminder defaults | Version 1: in-app always; SMS and WhatsApp with consent; quiet hours 21:00–09:00; at most 3 a month; never when paid or a proof is pending in any C.2 state. |
| D-42 transfer fee | A versioned rate with a bylaw reference (fixture: 5,000.00, *Bylaw 14(2)*, illustrative); clearance at zero balance or with a waiver; a BILL-017 payer change raised. |
| D-46 office cash | **Still open.** Batches are always witnessed. A per-site setting decides single office cash; the default (`single_counter`) keeps C.2's immediate receipt. See [§7](#7-product-decisions-still-open). |
| D-48 settlement evidence | No control settles anything without evidence. The demo helper only *generates* a labelled fictional statement; it is imported through C.2's statement import and matched by C.2's rules. |
| D-43 register | Only the S.1 delta rows adopted ([§5](#5-screen-register)). |

## 5. Screen register

**Adopted from the V3.2 delta, S.1 rows only:** 11 added (BANK-007, FIN-013, COL-007, RES-008; states BANK-008, BANK-009, FIN-014, BILL-018, COL-008, COL-009, OWN-006) and 19 modified. Result: **415 rows, 344 distinct screens**; `npm run register:sync` reports **92 built, 32 partial, 220 planned** (D.1 at `afd9357`: 404 / 340; 82 / 27 / 231). `register.spec` updated to the new counts.

**Statuses set by what was built and tested** (26 rows, only their lines changed):
- **BUILT:** BANK-007, BANK-008, BANK-009, FIN-013, FIN-014, COL-007, COL-008, COL-009, BILL-018, RES-008, APR-001…005, OWN-006, and COL-005 (its C.2 part plus S.1's print and remind).
- **PARTIAL:** FIN-001, BANK-001, BANK-002, BANK-006, OWN-003, OWN-004 (Gate E keeps a developer part); FIN-007 (D-46 open); FIN-011 (refunds are Gate E); BANK-004.
- Each row's `tests` and evidence columns now name `s1.spec`, the API tests and this folder.

## 6. Decisions made in S.1 (please confirm or correct)

1. **Who prepares a deposit:** the building manager (Imran) prepares deposits and transfers; the accounts officer (Saba) matches statement lines; the treasurer (Ayesha) approves and witnesses. Nobody confirms or witnesses their own step (checked by principal ID).
2. **September 2026 is seeded as the closed handover month** (openings dated 30 September from the committee's statement and count sheets; witnessed counts), so a refused late posting, an approved reopening and a second close can be shown. October is live.
3. **Al-Noor's fictional contract amendment** licenses the S.1 features (`banking.cashbook`, `receivables.office_collections`, `receivables.bulk_office_collection`, `receivables.reminders`, `residents.committee`, `residents.transfer_clearance`). Al-Noor's role templates gain the S.1 permissions per the V3.2 matrix; in Al-Noor the administrator (Rabia) also approves vouchers and transfers, and the manager prepares transfers.
4. **The policy in force on the request date governs**, not the date the money moved. A late voucher for 30 September raised in October uses October's policy.
5. **Cash vouchers are for cash accounts only.** Bank charges and other bank-only movements are not vouchers in S.1: they stay statement lines (C.2 lets the bank feed exclude a line with a reason); booking them belongs to accounting or payables.
6. **Society state version 3**: earlier demo sessions restart (as in C.2).
7. **The cashbook, accounts and transfers have no menu entries of their own.** They open from *Society finance* and need `cashbook.view` (or `bank.view` for accounts and transfers), so the building manager reaches them without gaining the bank feed (`bank.view`). Their address areas also carry the licensed feature, so another organisation is told *not in your plan* rather than shown a planned page.
8. **Approvals pages are gated by the `dues` module** (the society edition) with any of `approval.view`, `approval.decide` or `approval_policy.manage`. The register's module stays `core`; Gate E brings approvals to every edition.
9. **One shared fix found during S.1:** a selected value in every React Aria select (`SelectControl`, all apps) carried its hidden check mark into the trigger, which made the field taller with the value at the top. The trigger now hides it. The D.1 closure did not touch this component.
10. **The collector of a batch is always told why they cannot confirm it**, whether or not they hold the confirm permission.

## 7. Product decisions still open

- **D-46:** should a single office cash payment (FIN-007) also need a second person's count? The setting exists; the default keeps C.2's behaviour.
- **D-42:** the transfer fee is illustrative; its lawfulness is to be reviewed before Gate H.
- **D-35:** post-dated cheques are refused (`maxPostDatedDays: 0`), and cheque rules start disabled until the committee turns them on.
- **D-48:** is the demo statement helper acceptable as the only way to produce bank evidence in the prototype?
- **Owner of record:** an approved society transfer raises the payer change (BILL-017) but does not move resident app links or household membership; that belongs to the residents register (D.2 or later).
- **PDF:** dues notices, print packs and certificates print through the browser; no PDF files are generated.
- **The cashbook on phones** is a table in a labelled scroll region (as C.2's tables). A card layout for phones can follow if preferred.

## 8. Limitations and what is not in S.1

- **Simulated:** every reminder and message; the bank statements (fictional files from the demo helper or C.2's samples); printing.
- **Not in S.1:** real bank movement, cheque clearing or refunds; a wallet; late fees (D-11); developer specifics of FIN-001, BANK-001/002/006 and OWN-003/004 (Gate E).
- **Urdu:** translated for this gate and checked for parity; a native finance reader's review is still open.
- **Times of actions** use the demo date with the real clock time (UTC), from the shared society `stamp()` that S.1 did not change; evidence recorded late in the evening shows the next day in Pakistan time (for example, a voucher dated 26 October approved "27 Oct, 3:12 am").
- **Manual checks** (screen readers, real devices, printing, forced colours): [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md).

## 9. Integration notes

- This branch starts at `afd9357` and does not contain the D.1 closure (`7ddc606`). Both change the office shell and translations; expect conflicts in `packages/i18n/locales/*/nav.json`, `packages/ui/src/workspace/tenantWorkspace.ts`, `apps/backoffice/src/prototype/routes.tsx`, `docs/ui/screen-register.csv` and the register's generated file. Re-run `npm run register:sync` after merging the CSV.
- `playwright.config.ts` and `tests/support/fixtures.ts` gain an optional `E2E_PORT_OFFSET`; without it nothing changes. `.gitignore` and ESLint ignore `test-results-*/` (isolated output folders).
- Earlier gates' tests changed by S.1, each for a stated reason ([test results](test-results.md#problems-found-while-building-and-their-fixes)): `register.spec` (new counts), `society.spec` (the keyboard test's Tab bound), `identity.spec` and `gated1.evidence.spec` (origins instead of hard-coded ports). Shared UI changes: `SelectControl` (the trigger's check mark), `NavList` and `NavItem` (areas without a menu entry and their hub), `workspaceRouteTarget` (an area's `anyOf` and feature).

## 10. Evidence

- Screenshots: **105** in `screenshots/<name>-<width>[-200]-<en|ur>.png`, every one exactly its viewport's width:
  - reference 1 `f01`–`f13`, reference 2 `c01`–`c07`, reference 3 `g01`–`g10`, other S.1 screens `o01`–`o06`: desktop 1440 in English and phone 390 in Urdu;
  - phones `m01`–`m07`: seven S.1 screens at 390 px and at 320 px with 200 % text, in English and Urdu;
  - themes `t01`–`t05`: dark, high contrast, and both, on desktop (English) and phone (Urdu).
- Videos: `video/ref1-finance-deposit-desktop-en.webm`, `video/ref2-office-collection-desktop-en.webm`, `video/ref3-committee-approvals-desktop-en.webm`, `video/phone-ur-200-finance.webm` (phone, Urdu, 200 % text: a figure to its records, the cashbook, keyboard focus).
- Accessibility: axe on every S.1 screen, tab and address-opened drawer in English and Urdu at 1440, 768 and 390 px, and on every open drawer inside the journeys (1440 px, English): **141 scans, 0 violations** in `s1.spec` on the final code; **836 scans, 0 violations** across the whole E2E suite in the full run.
- Golden vectors: `packages/fixtures/src/society/finance/finance-ops.vectors.json` (25 cases) and `approvals.vectors.json` (22 cases), run by `finance.test.ts`.
- Authorization tests: `finance.api.test.ts` (roles, maker-checker by principal ID, other organisations refused before any handler, D-34) and `s1.spec` access (`permission_missing`, `module_not_licensed`, `feature_not_licensed`).
- Tests and results: [`test-results.md`](test-results.md). In short: unit and API **1,182 / 1,182**; E2E **280 / 280** in the full run (Gates B, C.1, C.2, D.1 and S.1), then `s1.spec` **13 / 13** and the S.1 evidence **11 / 11** again on the final code; Firefox and WebKit smoke **6 / 6**.
