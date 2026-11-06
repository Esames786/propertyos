# UX repair batch B1 "Money truth": report

**Branch** `fix/ux-b1-money-truth` from `04b6fde` (S.1 hotfix, Issue #18 closed; parent `474e4ae`).
**Source** `docs/ux-backlog@90c2b0a` (§1–§6, the ten B1 entries in §8, §3 N-1 and N-2) and the audit
`docs/frontend-ux-audit@1a0779e`. Neither branch was merged. Worktree `D:\laragon2\www\propertyos-b1`,
`E2E_PORT_OFFSET=1000` (office 6173, resident 6174, HQ 6175).
**Status:** implemented and tested; STOPPED for GPT and owner review after the push.

Rule kept everywhere: money is decided on the server (the mock API in `packages/fixtures`), the UI only
shows it. Stored history is never rewritten: a reversed payment keeps its allocations and its unapplied
amount, its receipt is kept and marked reversed (S.1), and every fix is a read model (projection) or a
validation. Nothing marks a bank or payment event settled. Issue #18 (bank feed behind `bank.view`, bound
idempotency, a fresh key per logical create), maker-checker and the period lock are unchanged.

Contents: 1 findings · 2 OD-1 · 3 function matrix (server rules and their tests) · 4 tests and results ·
5 mutation checks · 6 evidence · 7 manual verification · 8 observed, not fixed · 9 integration notes ·
10 every interim failure.

## 1. Findings

| ID | What was wrong | Fix (server / UI) | Status |
|---|---|---|---|
| RES-01 + N-1 (P1) | A reversed receipt showed "Paid" / "ادا شدہ", "Amount received" and what it settles; Home drew it as a success; the bill listed it as paying; `position()` still subtracted the reversed payment's unapplied credit (A-101: Rs 4,400 shown, office balance Rs 5,200) | **Server** `dues-portal-handlers.ts`: `position()` counts live credit only; `reversed: { on, reason }` on Home and bills receipt summaries and on the bill's payment items; a reversed payment's history row carries no credit. Contracts `ResidentReceiptSummary.reversed`, `DuesBillDetail.payments[].reversed`. **UI** receipt: "Reversed" badge (error tone, icon, words), "Reversed on {date}", the office's reason (quoted, isolated), what it means, "Amount (reversed)" struck and muted, "No longer pays" list, "Was kept as credit: no longer available"; Home and history: neutral card, "Reversed on {date}", amount struck; bill: "Reversed on {date}: pays nothing on this bill" | fixed |
| COL-02 (P1) | Reversed payments listed and totalled as received; dashboard count used every payment | **Server** `collections-read.ts` `paymentRow.reversed`; `collected.payments` = live payments; `collections-handlers.ts` `GET /payments` totals and count over live rows, `totals.reversed` (contract), `credit=1` leaves reversed out. Same rule: `POST /payments/:id/apply-credit` on a reversed payment → `409 already_reversed`, nothing changed; Payment 360's `applyCredit` false. **UI** "Reversed" badge on the list row and in "Latest payments" (COL-001 and HOME-001), amount struck, no statement/credit badges on a reversed row, count line "· 1 reversed payment listed, not counted" | fixed (apply-credit refusal added under COL-02; listed openly) |
| COL-01 (P1) | Credit-note "Open" = amount − credited (drawer and server); paid money could be credited; outstanding could go negative beside "Paid" | **Server** one helper `creditableOf` (`statement.ts`): billed − paid (live) − credited, clamped at 0; used by `InvoiceDetail.creditable` (contract) and the credit-note POST: above it `422`, `lines.<id>` `overOpen` with `{ open, unit }`, no credit note, no number used. **UI** per line "Billed · paid · credited · open"; no input on a line with nothing open, with the reason; the refusal shown at the line (money formatted) | fixed, **recommended default of OD-1, awaiting the owner** |
| FIN-03 (P1) | Save as draft: `replaceState` then `onClose()` overwrote the address, the draft was unreachable; pending list had approved/submitted only; Reverse left the address on another record | **Server** `handlers-books.ts` `GET /finance/cashbook`: the reader's own drafts as `voucher_draft` pending items (preparer only, while holding `cash_voucher.prepare`, this legal entity, the account shown), added after the cashbook view so no total, "in transit", dashboard or close check counts them. Contract `PendingItem.kind`. **UI** `VoucherDrawer`/`TransferDrawer` `onShow(id)` = one router navigation; Save as draft keeps the drawer on the draft (`?voucher=<id>`, `drawer` cleared) with a note, Edit (existing PATCH), Send, Withdraw; Send from a new voucher closes as before through the router; voucher and transfer Reverse move address and drawer together. `useCreateKey`/`isKeyReused` untouched | fixed |
| FIN-04 (P1) | Draft date reset to `2026-11-01` and saved back; note could not be cleared; Send posted `{}` without the edits | **UI** `ApprovalPages.tsx`: date and note from the saved draft; edits belong to one draft id; "unsaved" computed against the stored version and said in words; Send saves first (stops if the save fails), then sends; beforeunload warning while unsaved. **Server hardening** `handlers-governance.ts`: submit may carry `expected` (rules, date, note); a stored draft that differs → `409 policy_changed`, nothing sent or changed; checked after the permission and author checks; without `expected` as before | fixed |
| COL-12 (P1) | Statement rows keyed by `refId`; a payment and its reversal share it | `parts.tsx` keys rows and cards by `${kind}-${refId}` (the resident statement already did). React warns about duplicate keys only in development builds: the production e2e checks row counts across period switches; the API test checks the keys are unique | fixed |
| RES-02 (P1) + N-2 | "In credit Rs 0.00" for every flat in credit; site name hard-coded | **Server** `MyProperty.credit` (contract) from live payments, exact paisa; `siteName` from the tenant's licensed sites for the link's site. **UI** "In credit {credit}" | fixed |
| COL-04 (P2) | "Waiting for verification" counted proofs sent back to residents, took them off "Still owed", linked to "To review" | **Server** `WAITING_STATES` (submitted, under review, awaiting bank evidence, exception pending) for the tile, the progress share, the inbox header amount and FIN-001 "Proofs waiting"; new inbox filter `state=waiting`, which the tile and FIN-001 open. The month close still blocks on every unsettled proof. **UI** inbox pill "Waiting for verification (n)" | fixed (FIN-001's link now opens the counted list: part of FIN-15, same figure) |
| RES-03 (P2) | Home lost "Pay" and "See your proof" while the proof waited for the bank or an exception | **Server** `ResidentPosition.pendingSubmissionId` (latest waiting proof; never returned, verified, rejected or another payer's). **UI** Home shows "See your proof" whenever pending, or "See your proofs" (history) without an id | fixed |
| RES-12 (P2) | Bill settled by credit note labelled "Paid"; bill page offered Pay while a proof was pending | **UI** chip "Settled by credit note" / "کریڈٹ نوٹ سے طے شدہ"; bill page shows "See your proof" instead of Pay while pending | fixed |

Phone layout on the screens B1 changed (320 px at 200 % text): the bill's charges are a list, not a
table; flat codes and proof references stay whole; payment rows and the bills list keep their words
(the amount moves below instead of squeezing the text to a word per line); My properties uses a smaller
figure on narrow containers and the badge moves below; the receipt's large amount may wrap at the
currency; the voucher drawer's footer buttons wrap. Several of these were problems before B1 on those
screens (receipt and bill: shown with an A/B on states B1 does not touch); the overlap of the badge on
My properties and of the amount on the new reversed bill row were caused by this batch and fixed.

## 2. Owner decision OD-1 (COL-01)

Applied: the backlog's **recommended default**, labelled as such and awaiting the owner's ruling. A credit
note never credits money already paid (creditable = billed − paid − already credited). Crediting a paid
line would be a refund or an account credit: a separate feature with its own approval. `creditableOf` is
the single place to change if the owner rules otherwise.

## 3. Function matrix: server rules and their tests

API tests: `packages/fixtures/src/society/ux-b1.api.test.ts` (18). "Unchanged" = the society's whole store
as JSON is byte-identical before and after.

| Rule | Where | Refusal / projection | Negative tests |
|---|---|---|---|
| Reversed payment leaves no credit (resident) | `dues-portal-handlers.ts` `position()` | total = office balance | RES-01 test (credit 0.00, total 5,200 = `/billing-accounts` balance) |
| Reversal carried through Home, bills, bill payments, history | `reversalOf` | projection | RES-01 test; other resident's receipt: identical 404 for a real one and one never issued, unchanged |
| Payment list totals/count/credit filter over live rows | `GET /payments` | projection | COL-02 test; resident 403 unchanged |
| No credit applied from a reversed payment | `POST /payments/:id/apply-credit` | `409 already_reversed`, unchanged | without the permission: identical 403 for the real payment and one never issued, unchanged |
| Reversal not replayed | existing S.1 rules | `409 already_reversed`; second decision 409 | both unchanged |
| Credit capped at billed − paid − credited | credit-note POST | `422 overOpen {open, unit}`, no number used, unchanged | over by 500 and by 0.01; nothing left (0.00); legacy over-credit reads 0 (never negative); wrong permission (Saba, Imran), resident, other organisations (Shalimar, suspended Cedar): identical 403 for a real invoice and one never issued, unchanged |
| Drafts only for their preparer, entity, account | `GET /finance/cashbook` | projection | Ayesha, Imran, a second preparer (Rabia, test-only grant), revoked preparer, another legal entity (white-box): no drafts; money figures and FIN-001 byte-identical with a draft |
| Draft edits only by the preparer, never into a closed month | existing PATCH | `403 not_preparer` unchanged; `409 period_closed` with the voucher unchanged and only the I-27 refusal record added | both |
| Policy send must equal the stored draft | submit `expected` | `409 policy_changed`, unchanged; invalid → 422 unchanged | other rules, date, note; authority first: Ayesha (no permission) and Imran (holder, not author) get the same 403 whatever they claim |
| Waiting = office or bank only | `WAITING_STATES` | projection | returned proof excluded everywhere; `state=waiting` list = tile count and amount; FIN-001 equal |
| Pending proof id | `position().pendingSubmissionId` | projection | all four waiting states; never returned, rejected, verified; never another payer's (shared account A-201/A-202) |
| Credit and site name on My properties | `household-handlers.ts` | projection | in credit 800.00; 0.00 after reversal; owing flat unchanged |

## 4. Tests and results

Final regression: §4.3 (combined e2e 418/418, smoke 50/50, Vitest 1,535/1,535, axe 0 violations).

### 4.1 New tests

- Vitest `ux-b1.api.test.ts`: 18 (shared scenario 7, COL-01 3, FIN-03 3, FIN-04 2, COL-04/RES-03 3).
- Playwright `tests/e2e/ux-b1.spec.ts`: 9 — shared scenario EN and UR (receipt, Home, bill, history, My
  properties, payments list, COL-001 and HOME-001, Flat 360 statement period switching, credit-note
  drawer), COL-01 drawer, FIN-03, FIN-04, RES-12/RES-03, COL-04, and the changed screens EN and UR at
  320 px / 200 % (layout check, a new text-overlap check, money-inside-its-card check, no sideways scroll
  where B1 owns the page), dark mode with high contrast at 390 px (axe), keyboard walks.
- `tests/evidence/uxb1.evidence.spec.ts`: 9 tests, 55 screenshots.
- `tests/smoke/uxb1.smoke.spec.ts`: 3 tests × Firefox and WebKit.

### 4.2 Existing tests

No existing test or assertion was changed, skipped or weakened. Full Vitest before any B1 test was added:
1,517 / 1,517.

### 4.3 Final regression

All on the final sources (no source change after the build of 15:29Z; the previews on 6173-6175, both
loopbacks, served that build). Machine: other agents' previews and PHP load tests running; CPU load
sampled before each run.

| Check | Result | Time | Workers / load |
|---|---|---|---|
| Build (backoffice, customer-web, platform-hq; offset 1000) | built, no errors | - | - |
| `tsc` (all workspaces) | exit 0 | 3 min 9 s | - |
| Lint: eslint + logical CSS + i18n | exit 0; no physical left/right; 2 locales × 26 namespaces, 10,319 keys each, parity OK | 1 min 8 s | - |
| Vitest, full (run 3) | **1,535 / 1,535**, 55 files (golden vectors in `payroll`, `pricing`, `validation`, `collections`, `finance` tests) | 2 min 24 s | 3 workers; CPU 84 % at start (agent C's regression running) |
| Vitest, full (run 4, after the browser runs) | **1,535 / 1,535**, 55 files | 1 min 15 s | 3 workers; CPU 17 % at start |
| Combined e2e (every gate, `tests/e2e`) + `tests/evidence/uxb1.evidence.spec.ts`, Chromium, production build, retries off | **418 / 418** passed; 0 failed, 0 flaky, 0 skipped | 34.1 min | 3 workers; CPU 14 % at start |
| axe in that run | **1,468 scans, 0 violations** (40,579 rule passes); B1 spec 42 scans, 0 violations | | |
| Smoke, full: Firefox + WebKit (every smoke spec) | **50 / 50** (Firefox 25, WebKit 25) | 2.6 min | 3 workers; CPU 13 % at start |

WebKit: no failure, so no `--repeat-each` comparison was needed; the known intermittent
(`tests/smoke/s2a.smoke.spec.ts` "a new guard") passed. The two S.1 phone/axe tests that failed on
infrastructure in the saturated single-spec run (§10 #19) passed in the combined run. The evidence
screenshots in `screenshots/` are the ones from this final run (55, widths re-checked: 0 mismatches).
Lock: `D:\laragon2\www\.e2e-busy` created atomically at 16:52:35Z, released at 17:29:54Z.

## 5. Mutation checks

`test-results-b1/scratch/mutate.cjs`: break one server rule, run `ux-b1.api.test.ts`, restore and compare
SHA-256. Round 1: 34 / 36 caught (K5 survived; C3's target string was wrong). A legacy over-credit test
was added; round 2: C3 and K5 caught. **Round 3 (all 36 against the final tests): 36 / 36 caught, every
file restored byte-identical.**

| # | Rule broken | Caught by (round 3) |
|---|---|---|
| R1 | position counts reversed credit | RES-01 projections; My properties (2) |
| R2 | reversal dropped from resident projections | RES-01 projections |
| R3 | Home receipts lose the reversal | RES-01 projections |
| R4 | bill payments lose the reversal | RES-01 projections |
| R5 | history keeps reversed credit | RES-01 projections |
| R6 | pending proof includes returned ones | RES-03 four states |
| R7 | pending proof id not sent | RES-03 four states |
| R8 | My properties credit counts reversed | RES-02 |
| R9 | My properties credit not sent | RES-02 |
| R10 | site name hard-coded | RES-02 |
| C1 | payment row not flagged reversed | RES-01 (5, 6); COL-02 list (2) |
| C2 | list totals count reversed rows | COL-02 list |
| C3 | credit filter keeps reversed | COL-02 list |
| C4 | dashboard counts every payment | COL-02 list |
| C5 | credit applied from a reversed payment | COL-02 apply-credit |
| C6 | apply-credit action offered when reversed | COL-02 list |
| C7 | summary counts returned proofs | COL-04 |
| C8 | waiting filter lists returned proofs | COL-04 |
| C9 | inbox amount counts returned proofs | COL-04 |
| C10 | FIN-001 counts returned proofs | COL-04 |
| C11 | tile opens another list | COL-04 |
| K1 | creditable ignores paid | COL-01 main |
| K2 | credit-note POST uses the old formula | COL-01 main |
| K3 | drawer figure not the server rule | COL-01 main |
| K4 | over-credit message does not name the flat | COL-01 main and legacy (2) |
| K5 | creditable not clamped at 0 | COL-01 legacy over-credit |
| V1 | drafts of another preparer listed | FIN-03 nobody else |
| V2 | drafts without `cash_voucher.prepare` | FIN-03 nobody else |
| V3 | drafts of another legal entity | FIN-03 nobody else |
| V4 | drafts of another account | FIN-03 main |
| V5 | drafts not listed | FIN-03 main and nobody else (2) |
| P1 | send not checked against the screen | FIN-04 main |
| P2 | date not compared | FIN-04 main |
| P3 | note not compared | FIN-04 main |
| P4 | rules not compared | FIN-04 main |
| P5 | check before the authority check | FIN-04 authority first |

## 6. Evidence

`docs/status/ux-b1/screenshots/`, 55 PNGs from `tests/evidence/uxb1.evidence.spec.ts`. Every width was
read from the PNG header and equals the viewport in the name (`…-1440-xx`, `…-390-xx`,
`…-200pct-320-xx`); the 320 px ones were looked at at full size. Prefixes: `r01` receipt/Home/bill/history
reversed; `r02` My properties in credit and after reversal; `r03` Home with a proof waiting for the bank;
`r12` bills settled by credit note and the bill with a pending proof; `c01` credit-note drawer; `c02`
payments list and dashboards; `c04` inbox "Waiting for verification" and COL-001; `c12` Flat 360 statement
with payment and reversal; `f03` voucher draft, pending list, reversal; `f04` policy draft.
FIN-005 at 320 px is a viewport shot of the reversed row: the page scrolls sideways there because of the
shared page-header action (before B1 too), so a full-page picture would be wider than 320 px.

## 7. Manual verification

Not done by me and still needed: a screen-reader pass (NVDA/VoiceOver) of the receipt, Home receipt card,
bill payments, payments list row, credit-note drawer (field error at the line), voucher draft drawer and
policy draft notice; no WCAG claim is made beyond axe and the automated checks.

**Urdu for a native reader** (new or changed strings): `dues:receipt.reversed` واپس شدہ,
`receipt.reversedOn` {{date}} کو واپس کی گئی, `receipt.reasonLabel` دفتر کی بتائی گئی وجہ:,
`receipt.reversedBody`, `receipt.amountReversed` رقم (واپس شدہ), `receipt.noLongerSettles` اب ادا نہیں کرتی,
`receipt.creditGone`, `home.receiptReversed`, `home.seeProofs` اپنے ثبوت دیکھیں, `bill.reversedPayment`,
`status.credited` کریڈٹ نوٹ سے طے شدہ; `collections:payments.reversedShown_one/_other`,
`problems.reversedNoCredit`, `inbox.filters.waiting` تصدیق کے منتظر, `inbox.empty.waiting`;
`billing:creditNote.rule` (changed), `breakdown`, `nothingOpen`, `problems.overOpen` (changed, names the
flat); `finance:pending.kind.voucher_draft`, `pending.describe.voucher_draft`, `problems.policy_changed`,
`voucher.edit`, `voucher.saveChanges`, `voucher.draftNote`; `governance:policy.unsaved`. 25 new keys
(10,294 → 10,319 per locale).

## 8. Observed, not fixed (outside B1)

- Shared components at 320 px / 200 % (seen with no B1 state): page-header actions run off screen and make
  FIN-005 and COL-001 scroll sideways; drawer footers push "Cancel" off screen (credit-note drawer);
  COL-001 stat tiles, block cards and progress-legend pills clip; the inbox's duplicate badge breaks a proof
  reference. B10 / B2.
- `ProblemAlert` prints server amounts raw ("1000.00") in every form's error summary (COL-13, B3).
- "Receipt {{ref}}" phrases can break a receipt reference at its hyphens at 320 px / 200 % (Home card,
  bill payment rows, payments list row in Urdu). B8/B10.
- Bill page position line omits a live credit when one exists ("earlier + this month = total" then does
  not add up).
- Property 360 marks a bill settled by credit notes as "paid" (RES-12 class, other screen).
- FIN-001 "Collected" count counts the incoming movement of a payment later reversed (amount is net).
- FIN-04: leaving the page inside the app with unsaved draft changes is not blocked (no router blocker);
  reload/close are warned.
- `InvoiceDetail.payments` (not rendered; COL-05) does not flag reversed payments.
- `ProofInbox` maps `state=pending` to "To review" (the close check's link; FIN-15).

## 9. Integration notes

- Shared UI components in `packages/ui`: **none changed.** `Badge`, `Drawer`, `StatTile`, `PageHeader`,
  `SelectControl` untouched.
- `apps/customer-web/src/pages/dues/DuesPages.tsx`: many B1 edits (bills list, bill page, history,
  receipt); Agent C (B2, RES-06) edits one attribute in this file: a textual merge conflict is possible.
- `CollectionsPanel.tsx` (COL-001/HOME-001 "Latest payments" row) and `ProofInbox.tsx` changed; B2 edits
  `StatTile` used there (no overlap in lines expected).
- `docs/ui/screen-register.csv`: notes appended on 18 rows (statuses unchanged); S.3 and B2 may touch the
  same file.
- Locale JSON (`billing`, `collections`, `dues`, `finance`, `governance`, EN and UR) and contracts
  (`billing`, `collections`, `finance`, `identity`): additive.
- For S.3 Rentals: owner statements and payouts should follow the same rules: a reversed receipt is never
  money received or "Paid" (`!p.reversal` before counting; reversal shown with date and reason), credit of
  a reversed payment is not credit, and any credit-note-like correction is capped like `creditableOf`.

## 10. Every interim failure

| # | Where | Failure | Cause | Resolution |
|---|---|---|---|---|
| 1 | B1 API tests, first run | 2 of 17 failed | Test mistakes: A-101's current bill is "unpaid", not "overdue"; the transport returns live objects, so the "unsaved" rules were read after the save | Tests corrected |
| 2 | B1 e2e | COL-04 tile click timed out | The StatTile is itself the link | Test corrected |
| 3 | B1 e2e | COL-01 message text | Summary (`ProblemAlert`, shared) prints raw amounts; the line shows money | Test checks both as they are; recorded (COL-13) |
| 4 | B1 e2e | statement period click timed out | Clicked the visually hidden radio | Click the label |
| 5 | B1 e2e, 320 px / 200 % | receipt: "A-101" broken (twice) | Pre-existing (same on an unreversed receipt, A/B) | Flat codes kept whole on the receipt |
| 6 | same | bill: amounts off screen (table) | Pre-existing (same on A-102's untouched bill, A/B) | Charges as a list |
| 7 | same | My properties: "A-101" broken; my first fix then let the badge cover the flat code (seen in the evidence, not by the checker) | First pre-existing, then caused by B1 | Header row restructured; explicit badge-overlap assertion |
| 8 | evidence review | new reversed bill row: amount drawn over the text at 320 px / 200 % | Caused by B1 (flex squeeze) | Rows keep 10em of text; a general text-overlap check added to the layout test; it then found the bills list overlap (my nowrap reference), fixed |
| 9 | same | voucher draft drawer footer off screen in Urdu | Caused by B1 (drafts newly reachable, Edit added) | Footer buttons wrap |
| 10 | same | office screens: header actions, drawer footer, stat tiles, duplicate badge | Pre-existing shared components (A/B with no B1 state) | Scoped to B1's parts; recorded in §8 |
| 11 | evidence | 1440 px shots taken at 200 % text | Lowering the text size back does not take (the apps keep it) | Text size only raised at the end of each context |
| 12 | evidence | FIN-005 320 px shot wider than 320 | Page scrolls sideways (pre-existing header) | Viewport shot of the reversed row |
| 13 | evidence | Urdu: quotes of the English reason misplaced | Whole sentence isolated as one run | Label plus the quote isolated on its own |
| 14 | evidence | payments count line ran two sentences together | Missing separator | " · " and a shorter phrase |
| 15 | evidence | receipt amount past the card edge at 320 px / 200 % | Could not wrap (also before B1) | Currency may wrap; money-inside-card check added |
| 16 | mutations | C3 "target not found"; K5 survived | Wrong target string; no API path makes a line negative | Target fixed; legacy over-credit test; both caught |
| 17 | Vitest run 1 (heavy load) | 1 of 1,535: 5 s timeout, `community.test.ts` | Load (other agent's regression, my e2e, tsc) | Rerun |
| 18 | Vitest run 2 (saturated, 50 min) | 15 timeouts, 5 worker processes died | Machine saturated (another agent's 3-worker regression, my S.1 e2e, the API stream stall) | Discarded; rerun |
| 19 | S.1 e2e single run (saturated, 55 min) | 2 phone/axe tests: test timeout with "Target crashed" in axe; worker exit 0xC0000142 | Infrastructure (process start-up failure under exhaustion) | Re-checked in the combined run: both passed (418/418) |
