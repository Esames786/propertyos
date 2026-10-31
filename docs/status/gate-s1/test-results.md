# Gate S.1: test, accessibility and localisation results

**Run dates:** 2026-10-30 and 2026-10-31.

**Environment:**
- Production builds of all three apps on **isolated ports** beside another checkout: `E2E_PORT_OFFSET=100` (office 5273, resident 5274, HQ 5275; apps built with `VITE_OFFICE_ORIGIN` / `VITE_CUSTOMER_ORIGIN`), output in `test-results-s1/`.
- Node 20.20.1, Playwright (Chromium), axe-core with WCAG 2.0/2.1/2.2 A and AA rules.
- Retries **off**. My own leftover development servers were stopped before every run; no other session's processes were touched. The machine was shared with other sessions' load tests throughout, so runs used 2–3 workers.

## Summary (final code)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × **22** namespaces (new: `finance`, `governance`), **7,147 keys** each (D.1 at `afd9357`: 20 namespaces, 5,873 keys) |
| Unit and API tests | `npx vitest run --maxWorkers=2` | **1,182 / 1,182** in 36 files (D.1: 1,115 in 34). New: `finance.test.ts` (51, golden vectors) and `finance.api.test.ts` (16). C.2's `collections.vectors.json` and every earlier suite pass unchanged |
| Register | `npm run register:sync` | **415 rows, 344 distinct: 92 built, 32 partial, 220 planned** (D.1: 404 / 340; 82 / 27 / 231). All 321 V2.1 IDs and addresses preserved |
| End-to-end, full | `E2E_PORT_OFFSET=100 npx playwright test --project=e2e --project=evidence --workers=3` | **e2e: 280 / 280** (Gates B, C.1, C.2, D.1 and S.1), in one 50.3-minute run that also ran the evidence project. The run before it (43.7 min, code before those fixes) was 275 / 280; its 5 failures are explained and fixed below. After this run only S.1 page layouts (`apps/backoffice/src/pages/society/finance/`), `s1.spec` and the register's evidence column changed; `s1.spec` and the S.1 evidence were then rerun on that final code (next rows) |
| Accessibility (inside E2E) | axe in every spec that scans | Full run: **836 axe scans, 23,276 rule passes, 0 violations** (D.1: 764 / 21,133 / 0); `s1.spec` then had 72 of them. On the final code `s1.spec` alone has 141 (next row) |
| S.1 end-to-end, final code | `E2E_PORT_OFFSET=100 npx playwright test tests/e2e/s1.spec.ts tests/evidence/gates1.evidence.spec.ts --project=e2e --project=evidence --workers=3` | **13 / 13** (10.3-minute run with the evidence). Axe: **141 scans, 3,863 rule passes, 0 violations**: 20 S.1 screens, tabs and address-opened drawers (Account 360, Approval 360, committee meetings and decisions, voucher, cash count, close month, new transfer, sample statement) × EN/UR × 1440/768/390 = 120, plus 21 open drawers and workspaces inside the journeys at 1440 px in English (close month twice, new transfer, transfer, batch review, cheque, voucher, decision, ownership, certificate, send reminder, print pack, dues notices, policy draft, reminder rules editor, meeting form, and the pages around them). No sideways scroll at 390, 768, 1440 px or at 320 px with 200 % text |
| Evidence, final code | same run as the previous row | **11 / 11**: **105 screenshots** and **4 videos**; every screenshot exactly its viewport's width (checked by reading each PNG's width) |
| Earlier gates' evidence specs | same run (selected with the evidence project) | 75 passed, 70 skipped by their own conditions, 1 failed: Gate C.1's *Flat 360 … payer change* video. That script never fills the reason the payer-change drawer requires; `FlatWorkspace.tsx` is unchanged since `afd9357`, so it is not an S.1 regression. Their regenerated files were **restored from git**: earlier gates' evidence is not part of this delivery |
| Cross-browser smoke | `npx playwright test --project=firefox-smoke --project=webkit-smoke` | **6 / 6** (the C.2 smoke: 3 tests each in Firefox and WebKit, final code, isolated ports) |
| Manual screen reader, devices, printing, forced colours | [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md) | **not performed**: needs a person and devices |

## New tests

**API (`packages/fixtures/src/society/finance/finance.api.test.ts`, 16 tests, all through the fail-closed mock server):**
- The seed: handover balances, September closed, October from vouchers and verified payments; no stored cashbook rows.
- Reference 1: approval is not settlement; the cash leg needs a witness; the bank leg a full match; the cashbook moves only at each settlement. A partly matching line settles only through a second person's exception. Money never moves to another entity or to an account the society does not have.
- Reference 2: 4 cash lines and 1 cheque; another flat's payer is refused (`payer_not_liable`); a wrong declared total is refused; the collector cannot confirm; the cheque clears on its line, another is returned (nothing settles), a duplicate is refused, the cleared one is reversed. Cash needs a second person; a differing count is refused.
- Reference 3: October blocked; a September posting refused; reopening approved by someone else; September closes again after a witnessed count.
- Reference 4: a 12,000 voucher needs the treasurer and the secretary; nobody approves twice or their own; a delegate approves within the delegation, never a request that pays them; a draft policy never governs its own approval and its author cannot approve it; the inbox lists S.1 requests and the C.1/C.2 approvals.
- Society transfer: dues refusal → fee invoice → payment → approval → certificate → payer change in BILL-017.
- Reminders: never a payer whose proof is pending; SMS waits in quiet hours; the same send key never sends twice.
- Authorization: the guard sees no money; the secretary reads the cashbook but prepares nothing; a resident never reaches finance; another organisation is refused before any handler.
- Vouchers: refused outside cash accounts; a posted voucher corrected only by a reversal; **D-34**: with `payables` licensed, an expense voucher is refused and a receipt still works.

**Golden vectors (`finance.test.ts`):** `finance-ops.vectors.json` (25 cases: 6 cashbook = Σ settled sources, 14 reminder skip rules, 5 quiet-hours cases; the test file adds each source counted once, an instruction without settlement changing nothing, and credit = payment − allocations) and `approvals.vectors.json` (22 cases: 6 rules by subject and amount, 4 versions by date, 12 evaluations by principal ID; the test file adds that a draft or pending version never governs). C.2's `collections.vectors.json` passes unchanged.

**End-to-end (`tests/e2e/s1.spec.ts`, 13 tests):**
1. Reference 1, dashboard and cashbook: every figure opens its records; the cashbook is settled sources only, each with its evidence; the October checklist blocks.
2. Reference 1, a cash deposit: approved instruction, witnessed slip, matched statement line; the cashbook moves only at each settlement.
3. Reference 2: Saba collects cash and a cheque; Ayesha counts and confirms; receipts for cash, an acknowledgement for the cheque.
4. A cheque clears only on its bank line; a cleared one is reversed with approval; the resident sees it.
5. Reference 3: a 12,000 voucher needs the treasurer and the general secretary; the preparer sees why they cannot decide.
6. Month close: a refused late voucher, an approved reopening, a witnessed count, close again.
7. A society transfer: dues refusal, fee invoice, payment, approval, certificate, payer change raised.
8. Reminders skip pending proofs, wait in quiet hours and never send twice; the run prints exactly its posted invoices.
9. Delegation: Rabia decides the lift voucher as Ayesha's delegate; aging prints a notice per liable payer.
10. Governance records: policy version 2 (its author cannot approve it), a new reminder rules version, a meeting and a decision.
11. Access: the guard has no finance; the secretary reads but does not prepare; Shalimar (`module_not_licensed`) and Larkspur (`feature_not_licensed`) are told what their plan lacks.
12–13. Every S.1 screen at 390, 768 and 1440 px and at 320 px with 200 % text, in English and in Urdu: no sideways scroll, no axe violation.

## Problems found while building, and their fixes

| Found by | Problem | Fix |
|---|---|---|
| `s1.spec` (first focused run) | The building manager was refused on `/backoffice/bank/*`: the office shell gates each address by its menu area, and every bank address fell under the C.2 bank feed (`bank.view`) | The cashbook, accounts and transfers own their addresses as areas without menu entries (`menu: false`, needing `cashbook.view` or `bank.view`); the route gate now also carries an area's `anyOf` and licensed feature. The manager still cannot open the bank feed |
| `s1.spec` | The collector was told why they could not confirm their batch only if they also held the confirm permission | The collector is always told |
| `s1.spec` at 320 px with 200 % text | The finance dashboard, cashbook, accounts, account workspace, transfers, reminders and policies scrolled sideways (long action labels, large amounts, IBANs, auto-sized grid columns) | Long labels wrap; grids use one `minmax(0, 1fr)` column on phones; IBANs break anywhere; the month picker moved under the page title |
| Evidence review (reading the 200 % phone shots) | Large amounts broke inside the number (`Rs 49,100.` / `00`): the formatter joins currency and number with a no-break space | `WrapMoney` breaks only between the currency and the number, and the largest figures step down a size in a narrow page |
| `s1.spec` (delegation) | A selected value in every React Aria select (shared `SelectControl`, all apps) carried the option's hidden check mark into the trigger, making the field taller with the value at the top | The trigger hides it |
| `s1.spec` (governance records) | The reminder rules editor stayed open after saving (a second press would make another version); the committee's meeting and decision forms kept their text | The editor closes and the forms clear after a successful save |
| Code review | On the cashbook, accounts and transfers the sidebar marked *Bank & reconciliation* as current (or nothing, for the manager) | Areas without a menu entry mark their hub, *Society finance* |
| `register.spec` (full run) | The *Transfers and clearance* area claimed every `/backoffice/own` address, so OWN-001/002/005 (not S.1) lost their planned pages for other organisations | The area now covers `/backoffice/own/transfer…` only |
| `society.spec` (full run) | The C.1 keyboard test tabbed at most 25 times to the flat search; the S.1 menu areas pushed it further | The bound is 40 (the menu grows with what a persona may open) |
| `identity.spec` (full run, isolated ports) | Two assertions hard-coded ports 5173/5174 | They use the origin constants, which follow `E2E_PORT_OFFSET` (D.1's evidence spec likewise) |
| `identity.spec` (full run) | One D.1 axe test failed while Playwright wrote its trace (`file data stream has unexpected number of bytes`): drive C: had **0.7 GB** free | Not a product fault. Later runs put the temporary files on drive D:; the test passed in the final run |
| `security.spec` (full run) | Ctrl+K did not open the command palette once, under load (the palette de-duplicates its entries by address, so the new areas cannot collide) | Passed in the final run without change |
| Code review of the register's evidence column | The open drawers were not scanned by axe, and Account 360, Approval 360 and the committee's meetings and decisions tabs were not in the phone/tablet/desktop sweep | Axe now runs on every open drawer in the journeys, and those screens, tabs and the address-opened drawers joined the sweep in both languages |
| `s1.spec` (the wider sweep) at 320 px with 200 % text | The sample-statement drawer and the transfers header (as the accounts officer sees it: a second, non-wrapping button), Approval 360 (an auto-sized grid column and a large amount), and the committee's meetings and decisions (record buttons; decision titles in a non-wrapping flex row) scrolled sideways | The remaining header and drawer-footer actions wrap; every responsive S.1 grid has a one-column base; the approval amount uses `WrapMoney`; decision titles wrap. The register's evidence column now says, per row, which checks ran |

Retries were off throughout; no test was marked to skip or to allow a failure.
