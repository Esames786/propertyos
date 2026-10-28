# Gate C.2: test, accessibility and localisation results

**Run date:** 2026-10-28.

**Environment:**
- Production builds of all three apps: backoffice 5173, customer 5174, Platform HQ 5175.
- Node 20.20.1, Playwright 1.64.1 (Chromium; Firefox and WebKit for the smoke run), axe-core 4.13.0.
- Retries **off**.
- Leftover servers stopped before every run.

## Summary

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × **19** namespaces (new: `collections`, `dues`), **5,026 keys** each (C.1: 17 namespaces, 4,119 keys) |
| Unit and component tests | `npm test` | **562 / 562** in 31 files (C.1: 531 in 29) |
| Golden vectors | `packages/fixtures/src/society/collections.vectors.json` | Allocation (5,200 / 3,000 / 6,000), the shared account, entity isolation with a second association, 4 resident positions; all passing. C.1's `dues.vectors.json` is unchanged and passing |
| Register | `npm run register:sync` | 396 rows, 337 distinct: **67 built, 30 partial, 240 planned** (C.1: 62 / 18 / 255). New: BILL-016, BILL-017. All 321 V2.1 IDs and addresses preserved |
| End-to-end | `npx playwright test --project=e2e` | **242 / 242** on the final product code in full runs C and E (below). Run D between them: 241 / 242, a Gate B axe test past its 60 s time budget on a slow run; the budget was raised (test change only). C.1: 218 |
| Accessibility (inside E2E) | axe in every spec that scans | **674 axe scans per run, 18,640 rule passes, 0 violations** (C.1: 558 / 15,474 / 0). The C.2 spec alone: 116 scans, 3,165 passes; every C.2 screen and overlay in EN/UR at 1440 and 390, each also checked for horizontal overflow |
| Cross-browser smoke | `npx playwright test --project=firefox-smoke --project=webkit-smoke` | **18 / 18** (3 tests × 2 browsers, repeated 3 times, on the final code). Firefox and WebKit each pass: the resident proof → officer verification → receipt path through the demo link; Urdu at 200 % on a phone; the office dashboard with the guard refused. Earlier repeats found the late demo-link case (fixed) and one IPv4/IPv6 `localhost` connection refusal in Firefox (environment) |
| Evidence | `npx playwright test --project=evidence tests/evidence/gatec2.evidence.spec.ts` | **24 / 24** in one run (4.4 min, on the code with every layout fix): **308 screenshots** and **4 videos** (see the report, §9); every screenshot is exactly its viewport's width (no sideways scroll). Earlier attempts found three faults in the evidence script itself: waiting for `networkidle` (never reached once the demo-link frame is attached), clicking a visually hidden radio, and two ambiguous selectors |
| Manual screen reader (NVDA, VoiceOver) and real devices | [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md) | **not performed**: needs a person with NVDA, an iPhone and an Android phone |

## New unit tests

| File | Tests | Covers |
|---|---|---|
| `packages/fixtures/src/society/collections.test.ts` | 19 | **The collecting scenario:** November posted through the same engine and numbering (79, PKR 355,800); 2 statements, 12 lines, 3 earlier payments, 6 proofs; reconciliation 3 matched and 2 unidentified (a proof claims only its best free line, the regression for the shared-reference case); the inbox's match signals; summary figures agree with the records. **Allocation:** the three vector cases (5,200 / 3,000 / 6,000). **Shared account:** Junaid settles only A-202. **Second association:** `cross_entity_forbidden`. **Boundaries:** over the line, over the amount, unknown and closed lines. **Matching:** a matched transfer is flagged; two genuine transfers with the same reference are not duplicates; re-importing a statement adds only unseen transfers. **Numbering:** patterns, scopes and checks. **Invoice grouping:** a setting (per flat or per payer: same lines and amount). **Aging:** buckets by days past due. **Payer changes:** two future changes apply by date whatever the approval order; a correction supersedes and history keeps both. **Collection account:** the account in force; a new one hidden through cooling-off. |
| `packages/fixtures/src/society/collections.api.test.ts` | 12 | **Through the fail-closed mock API, person by person:** A-101's 5,200 pending until verified, then both balances settled with a receipt (AC-9, AC-10); duplicate, shared reference, needs information → resubmission, rejection (AC-11); 3,000 → 2,200 and 6,000 → 800 credit, credit only for the same payer (AC-10); the shared account (AC-11a); office cash refused until the treasurer allows it, then a receipt, a maximum, and the guard refused (AC-13); statements import once and reconciliation (AC-14); a new collection account needs a second person and stays hidden through cooling-off (AC-12); posting policy (the manager, the preparer); numbering (new documents only); payer changes (approval, two future changes, correction); other organisations and other residents see nothing (AC-15) |
| Updated: `society.test.ts`, `society.api.test.ts`, `role-templates.test.ts` | — | **Posting:** references now come from the numbering scheme; posting is for finance by default. **Payer changes:** approved by the treasurer. **Roles:** the accounts officer and the new permissions. |
| `packages/fixtures/src/security.test.ts` | unchanged count | **New endpoints:** enumerates every collections and resident-dues endpoint. Each declares module, permission and suspension class. Signed-out → 401, no access → 403, unlicensed module → 403, all before the handler runs. |

## End-to-end: `tests/e2e/collections.spec.ts` (24 tests)

| Test | Acceptance |
|---|---|
| Storyline, **desktop English** and **phone Urdu**. **Resident:** first run Large → A-101 owes 4,200 + 1,000 = 5,200 → pay (verified account, reference, QR, labelled demo link) → proof → *pending*, not paid, no receipt. **Officer:** the inbox → the suggested transfer DEMO-TXN-26102604 → five lines settled oldest first → verified. **Resident again:** paid, receipt 5,200 for A-101, statement 0.00. The text size stays at 125 % and nothing scrolls sideways | AC-1, AC-8, AC-9, AC-10 |
| **Proof decisions:** A-204's re-sent slip (duplicate warning, taken transfer refused, rejected with a reason); B-405's shared reference accepted; A-102 asked for information → Sana resubmits → verified → paid; Sana sends the same file again (asked first) → rejected → she reads the reason | AC-11 |
| **Office cash:** refused (the treasurer's rule; the officer cannot change it); allowed by the treasurer; 3,000 → two lines settled, 2,200 remains, receipt | AC-10, AC-13 |
| **6,000:** no matching transfer → verify by hand needs a reason → 800 unapplied → resident paid with 800 credit; the credit is listed for the officer | AC-10 |
| **Shared account:** Junaid sees only A-202 (4,200), pays; the allocation has no A-201 line; Rabia still owes 7,200 and gets *not found* for Junaid's bill | AC-11a, AC-15 |
| **New collection account:** the manager proposes, cannot approve; residents keep the account in force; the treasurer approves → cooling-off (still hidden) → ends → residents see the new account with a *changed* notice | AC-12 |
| **Manager's dashboard:** billed, collected, pending and arrears each open their filtered records; an aging bucket opens aging with the bucket; the queue opens 6 proofs; the manager reads a proof but cannot decide; no bank feed (403) | AC-14, owner UX |
| **Isolation:** the guard is refused every collections address and endpoint (including office cash); a resident gets no staff endpoint and no other receipt; Larkspur's buyer keeps the developer portal (no dues); Shalimar sees the setup explanation | AC-15 |
| **Keyboard only:** into the transfer choice, arrows between candidates and *verify by hand*, Tab to *Verify*, Enter → verified | AC-1 (keyboard) |
| **Dues tour:** frames the real bill; its guided step completes when *Pay* is opened | AC-18 |
| **Text size, phone, English and Urdu:** first run (four sizes) → Large → home at 125 % → Settings shows six sizes → 200 % → reload keeps it (stored per person) → at 200 % on home, pay, statement and bills, and again once the month is paid (home with its receipt, history, receipt, proof, statement entries): no sideways scroll, the last content ends above the bottom bar, no bar label clipped, *Send proof* clickable → reset to 100 % | Additional requirement |
| **Text size, desktop:** kept per person; another resident in the same browser keeps their own | Additional requirement |
| **axe and reflow:** every C.2 office screen and overlay (15 views + Payment 360 + the information and rejection dialogs) in EN/UR × 1440/390 | AC-1 (axe) |
| **axe and reflow:** every resident screen (home, bills, bill, pay, payee, proof status, history, receipt, statement, settings) in EN/UR × 1440/390 | AC-1 (axe) |
| **axe:** the first-run text-size step in EN/UR × 1440/390 (also no overflow at 150 %) | Additional requirement |
| **320 px reflow and 200 % zoom:** proof review, inbox, collections dashboard, resident home, pay and statement | AC-17 |

Updated C.1 tests (owner decisions applied, intent kept):
- **`society.spec`:**
  - starts from the *ready* demo (November not yet billed), since C.2 made *payments arriving* the default;
  - AC-3 now requests the payer change with a reason, checks that the requester cannot approve it, and has the treasurer approve it before checking October and November.
- **`register.spec`:** the Larkspur buyer has chosen a text size, as `seed()` does for every customer test; the counts include BILL-016 and BILL-017.
- **`gatec1.evidence.spec`:** starts from the *ready* demo.
- **`hq-commercial.spec`** (Gate B): the multi-page axe test has a 150 s budget instead of the 60 s default (see full run D).

## Bugs found and fixed while testing C.2

| Found by | Problem | Fix |
|---|---|---|
| First full run (stale servers) | The run reused development servers left on 5173–5175, so every page was slow and tests timed out | Stopped them; every run since uses fresh production builds (`reuseExistingServer` only finds nothing) |
| `register.spec` | The new permissions made the DEV+COMM collection and bank addresses answer *"Your role doesn't include this"* to developer staff instead of their planned page; FIN-007's address redirected to FIN-005 for developers | Developer finance and administration roles read collections and the bank feed; FIN-007 redirects only for societies |
| `collections.spec` | `InlineAlert` dropped `data-testid` (the duplicate warning, *cash not accepted*, *proof sent*, *request*, *rejected* notices were present but unaddressable) | `InlineAlert` forwards it |
| axe (resident pay and payee screens) | The copy rows nested `dt`/`dd` two levels inside the `dl` (axe `definition-list`, `dlitem`), on every resident pay screen in both languages | Each row is now a `dl` group: term, then value with its copy button |
| Code review | The default payment reference for a newly approved account fell back to Al-Noor's `ANR-` | It comes from the issuing entity's numbering code |
| Full run 1 | The *Collections* menu item reached the developer's bottom bar (it follows `collections.view`), pushing *Sales* out | *Collections* and *Bank* are offered only to organisations licensed for society dues |
| Evidence review (screenshot widths) | At 200 % on a 390 px phone, a **paid** home (with a receipt) scrolled sideways by 34–43 px: the home's two-section grid had no explicit column, so its track grew to the receipt reference's width. The E2E 200 % check had covered only the unpaid home | Resident grids use `grid-cols-1` (`minmax(0, 1fr)`) and the reference wraps (home, quick links, pay page, statement totals). The text-size test now also checks the paid month: home with receipt, history, receipt, proof and statement entries |
| The strengthened text-size test | At 200 % the **receipt page** scrolled sideways by 15 px in Urdu and 72 px in English: the large amount could not share a row with its label | The amount row, the breakdown rows and the settled lines wrap; the receipt's details grid uses `grid-cols-1` |
| Evidence review (the regenerated 200 % screenshots) | **Bottom-bar labels were cut** ("Receip…", "Statem…") on a 390 px phone at every text size. Cause: `cn()` (tailwind-merge) did not know the design system's own text sizes, took `text-nav` for a colour and dropped it when `text-muted` followed, so labels rendered at 16 px instead of 11 px. The test had measured the links, not the label spans. Also, the receipt row on the home page squeezed its text into a narrow column at 200 % | `cn()` now lists the design system's text sizes (`nav`, `chrome`, `figure*`, `hero`, `micro`, `mini`, `small`, `md`, `lead`). A bar label is never larger than 18 % of its slot (container query units), so "Statement" fits a 320 px phone. Measured after the fix: no label cut in English or Urdu at 390 or 320 px, at 100 % or 200 %. The test now checks the label spans. The receipt row puts the amount beside the reference while there is room and below it otherwise |
| Smoke repeated 3 times (Firefox, 1 of 3) | On a slow first load the office app answered the demo link after the 2.5 s wait. The resident app kept its own copy for the rest of the session (and said so), so the office would not have seen that resident's proof | The link waits up to 5 s. If the office app answers later, the resident app links then, provided nothing was saved in its own copy meanwhile (so nothing is lost). The demo-link note follows the change |

## Localisation

- **Parity:** every key exists in English and Urdu (5,026 each); placeholders match; no empty values; no untranslated stub (`⟦EN⟧`) ships.
- **RTL:** logical CSS only (the lint guard refuses physical left/right); directional icons mirror.
- **Bidi isolation:** amounts, flat codes, IBANs, bank transaction IDs and references are isolated left to right inside Urdu text (proof review, pay page, receipt, statement).
- **Digits:** numbers use Latin digits in both languages, as in Gates B and C.1.
- **Urdu runs:**
  - the phone storyline;
  - the phone text-size test;
  - every axe pass in Urdu;
  - Urdu screenshots of every reference screen;
  - the Urdu text-size video.

## Full runs

| Run | Result | Duration | Notes |
|---|---|---|---|
| Baseline (before the C.2 spec) | 205 / 218 | 21.4 min | The expected C.1 breaks from the owner's decisions (default demo, payer approval) and the register; fixed as described above |
| Focused: collections + society + register | 47 / 56 | 9.8 min | Found the `InlineAlert` and `dl` bugs, a test that switched sessions on the wrong app, and a wrong expectation (Urdu digits) |
| Focused: collections | 22 / 24 | 3.7 min | Both storylines expected 2 allocation lines; allocation is per invoice line (5). Test corrected |
| Storylines | 2 / 2 | 0.7 min | |
| Full 1 | 241 / 242 | 19.3 min | 674 axe scans, 18,641 passes, 0 violations. Found the developer bottom-bar regression (fixed) |
| Full 2 | **242 / 242** | 21.0 min | 674 scans, 18,640 passes, 0 violations |
| Full 3 | **242 / 242** | 21.8 min | 674 scans, 18,640 passes, 0 violations. Afterwards the evidence review found the paid-home overflow at 200 % (fixed, see above), so the confirmation was repeated |
| Full 4 | **242 / 242** | 25.4 min | With the paid-home and receipt fixes |
| Smoke (after full 4) | 5 / 6 | 3.6 min | Firefox, phone Urdu: the first page did not appear within 10 s on a cold start (the same test passed earlier in 21 s). The smoke projects now wait up to 20 s for a page |
| Full 5 | 238 / 242 | 22.0 min | The 4 HQ axe tests failed with `net::ERR_NETWORK_IO_SUSPENDED` at the same moment: Windows suspended network I/O (a power or network event), not the product |
| Focused (after the `cn()` and bottom-bar fixes) | **68 / 68** | 4.5 min | collections, customer shell, portal, reflow, dashboard, shell |
| Full A | **242 / 242** | 18.7 min | 674 scans, 18,640 passes, 0 violations |
| Smoke × 3 (after A) | 17 / 18 | 1.9 min | The late demo-link case in Firefox (fixed, see the bugs above) |
| Evidence | **24 / 24** | 4.4 min | The final screenshots and videos |
| Smoke × 3 (after the demo-link fix) | 17 / 18 | 2.1 min | One Firefox navigation failed with `NS_ERROR_CONNECTION_REFUSED` before the app loaded. The preview servers listen on IPv6 loopback only (`[::1]`), and Firefox sometimes tries IPv4 for `localhost` first. An environment issue, not the app. Every other repeat passed, including the cross-app path in both browsers |
| Full C | **242 / 242** | 17.1 min | **Final product code.** 674 scans, 18,640 passes, 0 violations |
| Full D | 241 / 242 | 23.9 min | The run was slow overall. A Gate B HQ axe test that scans many pages (usually 29–50 s) went past its 60 s default. It now has a 150 s budget, like the other multi-screen axe tests (test change only) |
| Full E | **242 / 242** | 18.5 min | **Final code and tests.** 674 scans, 18,640 passes, 0 violations |
| Smoke × 3 (final) | **18 / 18** | 2.9 min | Firefox and WebKit, 3 tests each, 3 times |
