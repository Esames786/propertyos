# Gate C.2: function matrix

The owner's review of C.1 authorised **Gate C.2** (A7 §C.2, plus the owner's C.2 brief and the additional text-size requirement). The owner's review of `d5e599d` ([Issue #4](https://github.com/Esames786/propertyos/issues/4)) required targeted corrections; they are in §8. This matrix lists each requirement, where it is built, how it is tested and where the evidence is.

**Paths and file names:**
- Paths are relative to the repository root.
- Screenshots: `docs/status/gate-c2/screenshots/<name>-<width>-<en|ur>.png`.
- Videos: `docs/status/gate-c2/video/*.webm`.
- Unit tests:
  - `collections.test` is `packages/fixtures/src/society/collections.test.ts`;
  - `collections.api.test` is the API-level suite next to it.
- E2E: `collections.spec` is `tests/e2e/collections.spec.ts`; the cross-browser smoke is `tests/smoke/c2.smoke.spec.ts`.

## 1. Resident app (dues edition)

| # | Requirement | Built in | Tests | Evidence |
|---|-------------|----------|-------|----------|
| 1 | Property and flat identity, current bill, previous balance, exact payable total, due date | PORTAL-001 `DuesHome.tsx` (bill card, breakdown, due date, overdue note); `GET /portal/dues/home` | `collections.api.test` (A-101 position); `collections.spec` storyline (4,200 + 1,000 = **5,200**, desktop EN and phone UR) | `r03-home-a101-owes-5200-large-*`, `r04-home-a101-owes-5200-*` |
| 2 | Itemised charges | PORTAL-005 `DuesPages.tsx` `DuesBillPage` (lines by flat and charge; previous balance apart; payments that settled it); PORTAL-004 bills list | `collections.api.test`; axe `bill`, `bills` | `r05-bill-itemised-*`, `r06-bills-*` |
| 3 | Payment history and online-payment availability | `DuesPages.tsx` `DuesHistoryPage`; `DuesPay.tsx` method switch (online: *arrives in Gate D*; cash: the society's rule) | axe `history`, `pay`; storyline | `r09-pay-office-cash-not-taken-*`, `r10-pay-online-later-*`, `r17-payment-history-*` |
| 4 | Verified association bank details, QR and instructions | PORTAL-007 `PayeeCard` (copy buttons, bidi-safe IBAN, reference to quote, QR of the instruction labelled demo, *only this account*); `/portal/dues/pay` serves the **account in force for the issuing entity** | `collections.api.test` (cooling-off hides a new account; never the platform's); `collections.spec` new collection account; axe `payee`, `pay` | `r07-pay-verified-account-and-proof-*`, `r11-bank-transfer-details-qr-*` |
| 5 | Proof upload; a manual bank proof never marks the bill Paid | `ProofForm` (file type and size, duplicate asks first) → `POST /portal/dues/submissions`; the home shows *pending verification*, never paid | `collections.api.test` AC-9; storyline (`data-status` not `paid`, no receipt until verified); `collections.spec` proof decisions (*Send again* confirmation) | `r08-proof-filled-*`, `r12-proof-sent-pending-verification-*`, `r13-home-pending-not-paid-*` |
| 6 | Proof status, receipts and statement | PORTAL-028 `DuesSubmissionPage` (stepper, versions, request / reason, resubmit); PORTAL-010 `DuesReceiptPage`; PORTAL-029 `DuesStatementPage` | storyline (receipt 5,200, statement 0.00); proof decisions (needs information → resubmit; rejection reason read by the resident) | `r14-home-paid-receipt-*`, `r15-receipt-*`, `r16-statement-zero-*` |

## 2. Association payment settings

| # | Requirement | Built in | Tests | Evidence |
|---|-------------|----------|-------|----------|
| 7 | Beneficiary, bank and account, reference format, QR instructions | BILL-010 `SettingsTabs.tsx` `CollectionAccountTab` (account in force, history, retired accounts) | `collections.api.test` AC-12 | `m06-collection-account-verified-*` |
| 8 | Maker-checker for beneficiary changes, cooling-off and audit | Propose (`beneficiary.manage`) → approve or reject by someone else (`beneficiary.approve`, by principal) → **3-day cooling-off** (demo control to end it) → in force; cancel; audit entries | `collections.api.test` AC-12; `collections.spec` (the manager cannot approve; residents keep the old account through cooling-off and see the new one with a *changed on* notice) | `m07-new-account-waiting-second-person-*`, `m08-treasurer-approved-cooling-off-*` |
| 9 | Enabled methods; cash and office policy; account verification status | BILL-012 `PaymentMethodsTab` (office cash allowed / maximum / counter; cheque Gate E; online Gate D); verification badge on the account | `collections.api.test` (cash refused, then allowed by the treasurer only, maximum enforced); `collections.spec` office cash | `m09-payment-methods-*`, `f18-office-cash-not-allowed-*` |
| 10 | Residents see only the verified beneficiary of the issuing entity; never the platform's account | `beneficiaryOn(state, entity, date)` in `state.ts`; `/portal/dues/pay` | `collections.api.test`; `collections.test` (entity isolation) | `r11-*` |
| 11 | Configurable numbering per issuing entity and site | BILL-016 `BillingControlsTab` + `numbering.ts` (patterns, per-kind and per-period counters, checks); `PATCH /sites/:id/numbering` | `collections.test` (patterns, problems, sequences); `collections.api.test` (new documents only; issued references unchanged) | `m10-numbering-and-posting-policy-*` |
| 12 | Configurable posting permissions (default Treasurer / Accounts) | BILL-016 posting policy (roles; reason); server check in run posting (`posting_policy`, preparer never posts) | `collections.api.test` (the manager refused; treasurer and accounts officer allowed; the preparer refused; policy narrowed) | `m10-*` |

## 3. Finance back office

| # | Requirement | Built in | Tests | Evidence |
|---|-------------|----------|-------|----------|
| 13 | Proof inbox: verify, reject, needs information, resubmission | FIN-008 `ProofInbox.tsx` (filters in the address, match signal, possible duplicates, reviewer); FIN-009 `ProofReview.tsx` | `collections.spec` proof decisions; keyboard path; axe `inbox`, `review`, info and reject dialogs | `f02-proof-inbox-6-to-review-*`, `f03…f07-review-*`, `f09-needs-information-dialog-*`; video `officer-verification-desktop-en` |
| 14 | Bank matching with duplicate prevention: a reused matched transaction is refused; a shared reference is not a duplicate | `matching.ts` (reasons; strength; destination; *taken*; best free candidate; shared-reference note; identity per account and source); server `bank_line_already_matched` | `collections.test` (incl. shared-reference regression); `collections.api.test` AC-11; `collections.spec` (A-204 refused, B-405 accepted) | `f04-review-a-204-resent-slip-transfer-already-matched-*`, `f05-review-b-405-shared-reference-different-transfer-*` |
| 15 | Manual verification audit (corrected, Issue #4) | No settlement by hand: *wait for the bank line* (a note, audited) settles nothing; a partial match needs an approved exception (reason, requester, approver, what did not match; audited) | `collections.api.test` (fabricated reason refused; awaiting; exception maker ≠ checker); `collections.spec` 6,000 and exception tests | `f10-*`, `f10b-*`, `f10c-*`, `f22`–`f25-*` |
| 16 | Allocation to invoices and flat-level liability; partial and overpayment | `allocate.ts` (oldest first; payer, entity and account only; edits need a reason); allocation table in review, office drawer, Payment 360 | `collections.test` + `collections.vectors.json` (5,200 / 3,000 / 6,000; shared account; second entity); `collections.api.test` AC-10, AC-11a, AC-11b; `collections.spec` (3,000 → 2,200; 6,000 → 800; A-202 only) | `f08-verified-receipt-issued-*`, `f11-payment-360-receipt-allocation-*` |
| 17 | Unapplied credits | FIN-011 `CreditsPage`; *Apply credit* in Payment 360 (same payer only) | `collections.api.test` (nothing to apply when nothing is open; only the same payer); `collections.spec` (credit row for A-101) | `f13-credits-unapplied-*` |
| 18 | Receipts | One receipt per payment (numbered per entity); office cash receipt at once; resident receipt only after verification | `collections.api.test`; storyline; office cash | `f11-*`, `r15-*` |
| 19 | Reconciliation | BANK-003 `BankFeedPage` (statements imported for a chosen verified account; sample files; re-import creates nothing; exclude with reason); BANK-004 `ReconciliationPage` (matched / unmatched / unidentified / excluded; proofs waiting for their bank line) | `collections.api.test` AC-14; axe `bank`, `reconciliation` | `f16-bank-feed-*`, `f17-reconciliation-*` |
| 20 | Arrears and collection reporting | COL-001 `CollectionsPage` / `CollectionsPanel`; COL-005 `AgingPage`; COL-004 `StatementPage` | `collections.api.test` (summary totals: billed 355,800 / 79; collected 12,600 / 3; pending 6); `collections.spec` dashboard | `m01-*`, `m02-collections-dashboard-*`, `f14-aging-arrears-*`, `f15-account-statement-a101-*` |
| 21 | Payer changes: auditable approval, effective dates, history, several future changes and corrections | BILL-017 `PayerChangesPage`; Flat 360 `LiabilityChanges` + `ChangePayerDrawer` (reason, from, corrects); `withPayerChanges` | `collections.test`; `collections.api.test` (two future changes by date; a correction supersedes; requester cannot approve; one pending per flat); `society.spec` AC-3 (requested → treasurer approves → October keeps the old payer) | `m11-payer-change-request-*`, `m12-payer-changes-waiting-approval-*`, `m13-flat-b204-liability-changes-*` |

## 4. Golden scenarios and isolation

| Scenario | Proved in |
|---|---|
| A-101 pays 5,200 → both balances settled, receipt | `collections.vectors.json`, `collections.api.test`, `collections.spec` storyline (EN desktop, UR phone), Firefox and WebKit smoke |
| A-101 pays 3,000 → 2,200 remains | vectors, `collections.api.test`, `collections.spec` office cash |
| A-101 pays 6,000 → 800 unapplied credit | vectors, `collections.api.test`, `collections.spec` |
| A-201 / A-202 shared account, different payers | vectors, `collections.api.test` AC-11a, `collections.spec` shared account |
| Cross-tenant, cross-site and cross-entity refusals | `collections.test` (second association), `collections.api.test` (other organisations; another site not found; another resident's receipt and statement not found), `collections.spec` isolation, the Gate B `security.spec` (every new endpoint fail-closed) |
| No receipt or Paid from a screenshot alone | `collections.api.test` AC-9, storyline |

## 5. UI and UX

| # | Requirement | Built in | Tests / evidence |
|---|-------------|----------|------------------|
| 22 | Reference experience 1: the resident's mobile bill and payment journey | `DuesHome`, `DuesPay`, `DuesPages` | `r*` screenshots at 1440 / 768 / 390, EN and UR; video `resident-pay-journey-phone-en` |
| 23 | Reference experience 2: the Finance Officer's verification and allocation workspace | `ProofReview` (two panes, decision bar, verified banner, next proof) | `f*` screenshots; video `officer-verification-desktop-en`; keyboard test |
| 24 | Reference experience 3: the Building Manager's actionable collections dashboard | `CollectionsPanel` | `m01`–`m04`; video `manager-collections-dashboard-desktop-en` |
| 25 | Every number opens its filtered records | KPI tiles, progress chips, queue, aging buckets, buildings all link to filtered lists | `collections.spec` dashboard (each KPI's destination checked) |
| 26 | Contextual navigation: Flat 360, Payment 360, account statement | Payment 360 links receipt, proof, bank line, statement and flats; review links the account; statement links payments | axe `payment`, `statement`; screenshots `f11`, `f15` |
| 27 | Fixed mobile navigation spacing; primary actions never obscured | `CustomerShell` (`--portal-nav-height`, `--portal-nav-space`, inset bar); chrome text capped at 112 %; a bar label is never larger than its slot (container query units) | text-size tests: at 200 % the last content ends above the bar, no label (or label span) clipped, *Send proof* clickable |
| 28 | Compact responsive billing-state stepper | `Stepper` (`packages/ui/src/data/Stepper.tsx`): proof states, run progress; condenses on narrow widths | screenshots `r12`, `f03`; axe |
| 29 | Loading, validation, error, success and pending feedback | Skeletons; field errors from the server; problem alerts; toasts; pending notes | axe; E2E flows |
| 30 | EN/UR RTL and accessibility | i18n `collections`, `dues` (EN + UR, parity-checked) | axe 0 violations on every new screen and overlay (EN/UR × 1440/390); 320 px reflow and 200 % zoom |
| 31 | Ready for font scaling, high contrast, dark mode, themes and reduced motion | Tokens on `:root`; text scale through `--text-scale`; motion respects reduced-motion | text-size tests; reduced motion in the chooser's check animation |

## 6. Text size (additional requirement)

| # | Requirement | Built in | Tests / evidence |
|---|-------------|----------|------------------|
| 32 | First-time step "Choose the text size that's comfortable for you": Small 100 %, Comfortable 112 %, Large 125 %, Extra Large 150 %; live preview; Continue; EN/UR | `TextSizeWelcome` (`packages/ui/src/preferences/TextSize.tsx`), shown before the first home page (`RootLayout.tsx`) | `collections.spec` text size (EN and UR phone), storyline (first-run Large); axe of the step in EN/UR at 1440 and 390; `r01`, `r02`; video `text-size-onboarding-settings-phone-ur` |
| 33 | Settings: 100, 112, 125, 150, 175, 200 %; instant preview; per user and tenant; survives refresh; reset | `TextSizeSettings` on *Text size & display* (side navigation, account menu → *Text size*); `DisplayPreferencesProvider` (key `pref:display:v1:{app}:{tenant}:{person}`) | `collections.spec` (200 % survives reload; stored value; reset to 100 %; another resident keeps their own) ; `r18`, `r19` |
| 34 | Reflow without clipping, overlap or horizontal scroll; respects browser zoom | `--text-*` tokens × `--text-scale`; rem layout; container queries | `collections.spec` (no overflow at 200 % on home, pay, statement, bills; bottom bar clear; labels whole); 320 px and 200 % zoom test; smoke at 200 % in Firefox and WebKit |
| 35 | Token architecture compatible with Gate D themes, contrast, motion, density and fonts | `packages/tokens/src/theme.css` (`--text-scale`, `--chrome-scale`, `--body-size`) | review |

## 8. Closure of the owner's C.2 review (Issue #4)

| # | Correction | Built in | Tests | Evidence |
|---|-----------|----------|-------|----------|
| 36 | No settled payment, Paid invoice or receipt without independent bank evidence | `/verify` requires a statement line (`bank_evidence_required`); `/await-bank` (state `awaiting_bank_evidence`); `ProofReview` *wait for the bank line* option; no manual path | `collections.api.test` "a reviewer's note settles nothing…"; `collections.spec` 6,000 test | `f10-*`, `f10b-*`, `f10c-*` |
| 37 | A clear reviewed / awaiting-bank-evidence state; evidence before finalising | Inbox filter, queue row, dashboard task `proofs_awaiting_bank`, reconciliation list, resident stepper (*checked; waiting for the bank*); the import lists waiting proofs it now matches | Same tests | `f20-*`, `f21-*`; video `bank-evidence-and-exception-approval-desktop-en` |
| 38 | Statements and lines bound to the receiving account, beneficiary and legal entity; validated at verification | `BankStatement` / `BankLine` (`beneficiaryId`, `legalEntityId`, `accountIban`, `source`); import requires a chosen verified account and refuses a file of another account; `settlementLine()` refuses `wrong_destination` / `cross_entity_forbidden` | Vectors `bankDestination`; `collections.api.test` "statements are bound…"; `collections.spec` "statements belong to the account…" | `f19-*`, `f26-*` |
| 39 | Deduplication per account and source; distinct transfers with the same reference kept | `lineKey()` / `newLines()` in `matching.ts` | Vector `bankIdentity`; unit, API and E2E (two lines with one bank ID) | `f16-*` |
| 40 | Exception workflow for amount-only or mismatched candidates | `/exception`, `/exception/approve`, `/exception/reject`; `payment_exception.approve` (treasurer); line held; maker ≠ checker by principal; `ExceptionCard`; dashboard approval `payment_exception`; Payment 360 shows the approved exception | Vectors `matchStrength`; `collections.api.test` "a partly matching line…"; `collections.spec` exception test | `f22`–`f25-*` |
| 41 | Mobile header and floating bar at 150–200 % (Urdu included), verified in the live viewport | `CustomerShell`: compact header from Large text, capped chrome on the language toggle, scroll padding, the bar steps aside and is inert while typing | `collections.spec` phone EN/UR 150 % and 200 % (header height, heading below it, every Tab stop clear, keyboard-open viewport) | `v01`–`v06-*` (viewport, not full page); video `phone-200-ur-header-scroll-focus-typing` |
| 42 | Office cash limits configurable (50,000 illustrative) | `CashRules` on *Payment methods*; PATCH keeps the other settings | `collections.api.test`; `collections.spec` office cash (2,500 / 5,000) | `m09-*` |

## 9. Not in C.2 (as instructed)

- **Gate D:** online gateway and late fees.
- **Gate E:** cheques, refunds and accounting postings.
- **Never in this prototype:** live bank connections and real transfers.
- **Not done:** Laravel migrations and merging into `main`.
