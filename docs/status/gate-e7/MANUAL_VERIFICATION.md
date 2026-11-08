# Gate E.7 (provisional, Wave 1) — manual verification

Fictional money only. Business date of the demo: Monday 26 October 2026. Office app:
`http://localhost:5173/backoffice` (or `:7573` with `E2E_PORT_OFFSET=2400`). Sign in on the demo page as the
Larkspur Estates (Demo) person named in each step. "Reset demo" (Prototype tools) starts the seed again.

People (all fictional, new in this gate, decision E-06):
- **Saad Hameed** — accounts officer: `gl.view`, `gl.post`. Prepares journals. **No bank permission.**
- **Mehreen Aslam** — finance controller: `gl.view`, `gl.post`, `journal.approve`, `period.close`, `bank.view`, `bank.reconcile`.
- **Kashan Wasti** — treasury officer: `bank.view`, `bank.reconcile`. Uploads statement imports.
- Existing people keep their roles: Nadia Rahman (manager) and Farah Javed (finance) read imports only; Bilal Ahmed (sales) neither.

There is no menu entry yet (E.0 adds the developer navigation at integration). Open the addresses directly;
every ledger screen links to the others (the pill row under the title).

## 1. Journal: maker → checker → post (ACC-004, ACC-003)
1. As **Saad**, open `/backoffice/acc/create-journal`. The notice says the screen is provisional (partial).
2. Date `2026-10-24`, description "Demo accrual — security services, October (fictional)".
3. Line 1: account `5200 · Marketing and advertising`, debit `125000`. Line 2: account `2200 · Accrued expenses`, credit `124999.99`.
   - Expect: Difference −0.01 shown live; "Submit for approval" and "Save as draft" disabled with "Debits and credits must be equal."
   - Open the account list on line 2: `1000` and `1010` (cash at bank) and `4000` (revenue) are greyed with "Locked: …".
4. Change the credit to `125000` → "Balanced". Press **Submit for approval**.
   - Expect: the journal drawer `LKE-JV-2026-0009`, "Waiting for approval — not posted", and "You prepared this journal: someone else approves and posts it." No Approve button.
5. Sign in as **Mehreen**, open the same address (`/backoffice/acc/journal-entries?record=…`). Press **Approve**, tick "I checked…", confirm → "Approved — not posted". Press **Post**, tick, confirm → "Posted". No Edit button; the note says posted journals are never changed.

## 2. Reports move together (ACC-006/007/008)
1. `/backoffice/acc/trial-balance`: totals 176,775,000.00 debit and credit; "Debits equal credits."
2. `/backoffice/acc/profit-and-loss`: "Management view" badge, the E-15 warning, loss for the period 1,775,000.00.
3. `/backoffice/acc/balance-sheet`: assets 175,000,000.00 = liabilities + equity + current result; all three checks ticked.
4. Choose month "September 2026": trial balance 176,200,000.00; "July 2026": 175,000,000.00.

## 3. Reversal (ACC-005)
1. As **Saad**, open the posted journal and press **Reverse** (or `/backoffice/acc/reverse-journal?record=…`).
   - Expect: the original lines, then the reversal preview with every amount on the other side.
2. Date `2026-10-25`, reason "Entered in error (demo)" → **Request the reversal** → the reversal drawer, "Reversal of LKE-JV-2026-0009".
3. As **Mehreen**, approve and post the reversal. Open the original: "Posted · reversed", "Reversed by LKE-JV-2026-0010".
4. Trial balance back to 176,650,000.00; profit and loss back to a loss of 1,650,000.00.
5. Try **Reverse** again on the original: not offered ("already has a reversal").

## 4. Periods (ACC-009)
1. As **Mehreen**, `/backoffice/acc/accounting-periods`: July–September closed, October open; October's checks say the month has not ended and lists waiting journals; no Close button, the reason is shown.
2. As **Saad**, try a journal dated `2026-09-15`: both buttons disabled ("The date is not in an open month."). (The API refuses it with 409 `period_closed`.)
3. As **Saad**, on September press **Ask to reopen**, give a reason. As **Mehreen**, **Approve reopening** → "Reopened". Saad cannot approve his own request (the reason is shown).

## 5. Chart of accounts (ACC-001, ACC-002)
1. As **Saad**, `/backoffice/acc/chart-of-accounts`: "Illustrative — not a statutory chart", version 2; account 5500 is a draft waiting for approval.
2. **Draft an account**: type Expenses, code `5600`, name "Travel (demo)". Expect: it shows as a draft; no Approve button for Saad.
3. As **Mehreen**, approve it → active, chart version 3.
4. Open `1000 · Cash at bank — collection account`: balance 0.00, "Locked: needs payment evidence", and Mehreen sees the bank account (masked `•••• 7890`) and "4 unmatched statement lines … They change no balance." As **Saad** the same page shows no bank account and no statement-line count.

## 6. Posting rules (ACC-010)
1. `/backoffice/acc/posting-rules`: five rules, each "Proposed — not applied" with the decisions it waits for (E-15, E-16, E-17, E-18, E-33).
2. **Apply the rule** is disabled with "Blocked until an accounting adviser decides …".
3. **Preview** → amount 100000.00 → two lines, "Preview only — nothing is stored or posted."
4. LKE-PR-003 shows version 2 from 1 November 2026; version 1 "would apply on 26 October 2026".

## 7. Bank import (BANK-005)
1. As **Kashan**, `/backoffice/bank/bank-import`. The warning says imported lines are unmatched statement lines, never receipts.
2. Keep "Sample: collection account, 1–15 October 2026" → **Preview and check**.
   - Expect: 7 rows: 3 new, 1 repeated in the file, 2 already imported, 1 invalid ("Not a valid date").
3. **Submit for approval** → "Waiting for approval — not imported"; "You prepared this import: someone else approves it."
4. Choose account "Larkspur Gardens Escrow (DEMO)" (not verified) → preview → refused: "Choose one of this entity's verified bank accounts."
5. Choose the operating-account sample but the collections account → refused: "The file names another account than the one chosen."
6. As **Mehreen**, open the import, **Approve the import** → "Imported — unmatched lines"; the list now has 7 unmatched statement lines. The trial balance did not move.

## 8. Who sees what
- **Saad**: `/backoffice/bank/bank-import` shows "Your role doesn't include this" (access outcome); no "Bank import" pill on any ledger screen; no masked number, bank name or statement line anywhere in the ledger.
- **Nadia** / **Farah**: ledger addresses show the access outcome (they hold no ledger permission); the bank import is read-only ("importing and approving need the bank reconcile permission").
- **Bilal**: both closed.

## 9. Language, size, theme, keyboard
- Switch to اردو: every ledger screen reads right to left, references and amounts stay left-to-right.
- 320 px wide with text at 200 %: reports and journal lines are lists, nothing is cut off.
- Dark mode with high contrast: all screens readable.
- Keyboard: Tab to a journal in the list, Enter opens the drawer, Escape closes it; every control shows a focus ring.

## Not verified here (open)
NVDA, VoiceOver and real devices; a second legal entity on screen (only a test-only fixture, E-08).
