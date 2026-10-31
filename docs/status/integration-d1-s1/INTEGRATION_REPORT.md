# Integration of Gate D.1 (closure) and Gate S.1

**Status: integrated, fixed and verified on branch `integration/d1-s1`; stopped for GPT and owner review.** Nothing is merged into `main`; neither original branch was changed or force-pushed.

- **Base:** `7ddc606` (Gate D.1 closure). **Cherry-picked:** `60d0e8a` (Gate S.1) as `0348317`.
- **Then, on this branch:**
  - `d3950e2`: the Issue #6 fixes;
  - `81e86d0`: the demo link between apps on sibling subdomains;
  - `5973b12`: fixes found reviewing the evidence (§2.5) and the Firefox and WebKit smoke for the integration;
  - a closing commit with this report and its evidence only.
- **Review followed:** [Issue #6](https://github.com/Esames786/propertyos/issues/6) (S.1 accepted for isolated integration, items 1–7) and the owner's integration authorisation.
- **Not done, as instructed:** no Laravel, migrations, real banks, payment gateway, SMS or money; no D.2, D.3 or S.2; no change to `main` or to another session's working directory.
- **Not claimed:** WCAG conformance. Automated checks pass; manual checks are open in [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md).

Results of every check: [`test-results.md`](test-results.md).

## 1. What was merged

The cherry-pick applied **without conflicts**. Only two files were changed on both sides (`tests/e2e/identity.spec.ts`, `tests/evidence/gated1.evidence.spec.ts`); git merged them line by line, and both sets of changes are kept: the D.1 closure's new reach tests and S.1's port-independent addresses. The files the S.1 report expected to conflict (`nav.json`, `tenantWorkspace.ts`, `routes.tsx`, the register) were not touched by the D.1 closure. `npm run register:sync` regenerates the register unchanged: **415 rows, 344 distinct screens (92 built, 32 partial, 220 planned)**.

## 2. What was fixed (Issue #6 and the owner's authorisation)

### 2.1 Mobile cashbook (item 1)

At 320 px with 200 % Urdu text, the S.1 cashbook table clipped its labels inside a sideways-scrolling region.
- **Now:** below 64em of the page width each line is a **card** in an ordered list ("Cashbook lines, October 2026"). Because the breakpoint is in em, it follows the text size: phones and tablets always get cards, and so does a desktop at 150 % or 200 % text. The **desktop table is kept** where it fits.
- **Each card carries every fact in full:**
  - the description, as a link to the line's record (the drill-down);
  - *Money in* or *Money out*, said in words beside the amount;
  - date, full reference, payer or payee, flats, account, category, evidence and running balance, each labelled.
- **Tests (`integration.spec`):**
  - 320 px at 200 % in Urdu and English, and 390 px at 100 % (Urdu) and 200 % (English);
  - each card's reference and counterparty match the server's lines;
  - no element sticks out of its card and no text is cut;
  - no sideways scroll;
  - Tab moves from each card's record to the next;
  - axe passes;
  - the drill-down opens the record;
  - the desktop shows the table at 100 % and cards at 200 %.
- **Not tested:** VoiceOver and NVDA ([manual](MANUAL_VERIFICATION.md)).

### 2.2 Financial timestamps (item 2)

**Before:** the shared `stamp()` (society) and `nowStamp()` (identity) joined the demo date to the *UTC* clock time. An action at 03:12 in Karachi showed as the next day.

**Now:**
- An action is stamped on the demo's business date at the **wall-clock time of the organisation's configured time zone, with its offset**, e.g. `2026-10-26T23:59:59.500+05:00` (`packages/fixtures/src/clock.ts`).
- The zone is configured per organisation (`timeZone` in the tenant directory; Al-Noor: **Asia/Karachi**; the default is the display zone, also Asia/Karachi).
- Times are shown in Asia/Karachi as before.
- **Unchanged:** posting dates, invoice dates, due dates and month-close periods are plain dates and are never derived from these clock times.
- Seeded records stay in UTC (`…Z`). Every place that ordered or compared these timestamps as text now compares instants (23 places in the society, identity and S.1 code).
- **Tests:**
  - `clock.test` (6): 23:59:59 and 00:00:00 in Karachi both stay on the demo date; offsets of three zones; D.1's `nowStamp`; mixed UTC and offset stamps ordered by instant;
  - `finance.api.test`: a voucher prepared at 23:59:59 and posted at 00:00:30 keeps its date and its October period;
  - `integration.spec` (browser clock fixed by Playwright): an approval at 23:59 and a posting at 00:00 both read *26 Oct 2026*, and the line stays in October.
- **Known limit:** the demo's business date is fixed, so an action after real midnight shows an earlier clock time on the same demo date than one just before midnight. Lists order by instant, so such an action appears before the one at 23:59 in the activity log; the business dates are unaffected.

### 2.3 Single office cash payment (owner decision D-46, item 5)

**Before:** C.2 issued a receipt at the counter. S.1 offered a per-site choice.

**Now:**
- **Every new office cash payment** waits for a second person's count before settlement and receipt.
- The counter (FIN-007) records the cash as an office collection of one line, already submitted (`origin: 'single'`). It shows what the cash *would* settle (oldest first), but no payment, allocation, receipt or Paid status exists yet.
- A second person with `payment.batch.confirm` counts it in the collection drawer (FIN-014). A differing count is refused, and the collector can never confirm. Only then are the payment, allocation and receipt created (`verification: 'witnessed'`).
- **Where the waiting cash shows:**
  - the office drawer: the rule beforehand, "waiting for a second count" afterwards;
  - the billing account (staff);
  - the resident's home: "you handed in Rs …; not paid until confirmed";
  - the cashbook's pending list;
  - the finance dashboard: a new "Office cash waiting for a count" tile;
  - the society dashboard: an urgent task for the confirmer;
  - the approvals inbox (*Billing and collections* tab).
- **Settings:** the cash limit stays the site's own setting. The witnessing choice is now a fixed, explained rule (the endpoint refuses a single counter, `witness_required`).
- **History preserved:** earlier demo payments keep their receipts (`verification: 'counter'`). No saved demo is reset (no state version change), and nothing is reversed.
- **Tests:** C.2's office-cash API and E2E tests and S.1's transfer tests now follow the new rule (§5). New: the collector cannot confirm; a wrong count is refused; the account, resident home, cashbook, finance dashboard and society dashboard show the waiting cash; unconfirmed cash clears no transfer dues.

### 2.4 C.1 evidence script (item 3)

The C.1 *Flat 360 … payer change* video script now types the reason the payer-change drawer requires. The validation is unchanged.

### 2.5 Found and fixed during integration

- **Audit labels:** 52 actions written to the society activity log had no label, so the log would have shown keys. Most are S.1's; some, such as `proofAwaitingBank` and `paymentExceptionRequested`, are older. All **72** logged actions now read as sentences in English and Urdu.
- **D.1 closure tests:** they hard-coded ports 5173/5174 in four places (`identity.spec`, `gated1.evidence.spec`). They now use the origin constants, so they also pass on isolated ports.
- **Test loading:** the time-zone default is imported from `@repo/i18n/format` (`DISPLAY_TIME_ZONE` re-exported there). The package root loads JSON locale files, which the Playwright runner cannot import in tests that read the tenant directory.
- **D-46 wording in the office payment drawer** (found reviewing the evidence screenshots):
  - **Before:** the drawer's subtitle, submit button and preview heading still promised a receipt at the counter ("A receipt is issued straight away", "Record and issue receipt", "This will settle").
  - **Now:** they say the cash is settled and receipted only after a second count. The button reads "Record cash for a second count", or "Record the cheque" when a cheque is chosen. The counter and cash-limit line now has the drawer's margins; it touched the drawer's edge before.
  - **Test:** `collections.spec` checks that nothing on the form promises a receipt.
- **Confirmed collections said "more than owed"** (S.1, found in the same screenshots):
  - **Cause:** the review warnings were computed again after confirmation, against a balance that already included the line's own payment. A confirmed line of Rs 3,000 therefore read "More than owed now (Rs 2200.00)".
  - **Now:** warnings apply only to lines not yet settled.
  - **Amounts:** they read as money ("Rs 2,200.00", not "2200.00") in a line's warnings and problems and in the collection's history.
  - **Tests:** `collections.api.test` and `collections.spec`.
- **Demo link on separate subdomains** (found on the temporary preview deployment, §7):
  - **Before:** the office app's demo bridge page answered only pages on its own host name, so the resident app on `portal.<domain>` could not reach the society demo kept by the office on `<domain>`.
  - **Now:** it also answers a subdomain or the parent domain (`81e86d0`). Same-host local runs are unchanged.

## 3. Items 6 and 7 of the review, as verified

- **D-42:** the transfer fee (Rs 5,000, *Bylaw 14(2)*) remains a fictional fixture; lawfulness is pending.
- **D-35:** post-dated cheques are off by default (`maxPostDatedDays: 0`; cheque rules start disabled).
- **D-48:** the demo helper only *generates* labelled fictional statements; matching and exceptions still decide settlement. Unchanged.
- **Owner/payer link lifecycle (item 7):** an approved society transfer raises the BILL-017 payer change only. `finance.api.test` now checks that B-403's resident app access is identical before and after the transfer and certificate, and that no account or invitation is created for the buyer. The resident-access lifecycle remains for D.2.
- **Versioned approvals never self-approve:** a draft policy cannot govern its own approval, and its author cannot approve it (`finance.api.test`; `s1.spec` governance test, which checks `own_request`).

## 4. Still outstanding

- **Manual checks:** NVDA, VoiceOver, real phones, printing, forced colours, and the clock near real midnight on a device ([`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md)).
- **Owner decisions:** D-42 lawfulness; whether D-46 should later also require the count for cash in other modules (only society office cash exists today).
- **Resident access after a transfer:** pending D.2 (item 7).
- **Earlier gates' evidence folders** were not regenerated on the integrated code (they record their own deliveries). The C.1 evidence spec was rerun to prove the script fix; its regenerated payer-change video is kept here, and C.1's folder is unchanged.
- **The allocation table in the office payment drawer** (C.2) is wider than the drawer, so its last column ("Still owed") scrolls sideways inside a labelled region. It is reachable by keyboard and was left as C.2 built it; cards like the cashbook's would read better there.
- **The preview deployment** (§7) is temporary and runs the demo only. It should be removed with its rollback steps when the review ends.

## 5. Tests changed, and why (no test removed or skipped)

| Test | Change | Why |
|---|---|---|
| `collections.api.test` (C.2) office cash | Now expects "awaiting count", then a second person's confirmation before the receipt | Owner decision D-46 |
| `collections.spec` (C.2) office cash journey | Records, sees the resident still owing, the treasurer counts and confirms, then the receipt | Owner decision D-46 |
| `finance.api.test` (S.1) society transfer | The cash is confirmed by a second person before the dues clear; resident access checked unchanged | D-46; item 7 |
| `s1.spec` society transfer | The accounts officer records, the treasurer confirms | D-46 |
| `identity.spec`, `gated1.evidence.spec` (D.1 closure) | Origin constants instead of hard-coded ports | Isolated ports |
| `gatec1.evidence.spec` (C.1) | Types the required reason, then waits for the drawer to close (the save went through) | Item 3 |
| `collections.spec` (C.2) office cash journey | Also checks the form promises no receipt, and the confirmed line has no warning | §2.5 |
| `tests/smoke/integration.smoke.spec.ts` (new) | Firefox and WebKit: cashbook cards at 320 px with 200 % Urdu, the desktop table, and D-46 from recording to receipt | Cross-browser check of the integration |

## 6. Evidence

Produced by `tests/evidence/integration.evidence.spec.ts` on production builds of the integrated code. Every screenshot's width matches its viewport (46 / 46).

**Screenshots** ([`screenshots/`](screenshots/)):

| Files | What they show |
|---|---|
| `k01`–`k04` | **The cashbook.** Cards at 320 px with 200 % text (English and Urdu); cards at 390 px (English and Urdu); dark mode at 390 px with 200 % Urdu; the desktop table (English and Urdu). |
| `c01`–`c07` | **D-46, desktop, English.** The rule before recording; "waiting for a second count"; the account; the society dashboard's task; the approvals inbox; the treasurer's own count; the confirmed line with its receipt. |
| `c08`–`c09` | **D-46 on a phone, Urdu.** The resident's home ("cash handed in, not paid until confirmed") and the second count. |
| `t01`–`t02` | **Midnight in Karachi** (browser clock fixed). An approval at 23:59 and a voucher posted at 00:00, both on 26 October. |
| `r01`–`r07` | **Representative D.1 and S.1 screens**, at 1440 and 390 px in English and Urdu. Finance dashboard, office collections, committee, approvals, personalization hub, resident app access, resident home. |

**Videos** ([`video/`](video/)):
- `single-office-cash-second-count-desktop-en.webm`: D-46 from recording the cash to the treasurer's count and the receipt.
- `phone-ur-200-cashbook-cards.webm`: the cashbook as cards on a phone in Urdu at 200 %. It scrolls, opens a card's record and comes back.
- `c1-flat-360-payer-change-with-reason-desktop-en.webm`: C.1's payer-change video rerun with the script fix (item 3). The reason is typed, and the change saves and the drawer closes. C.1's own evidence folder is unchanged.

## 7. Temporary preview deployment (owner's authorisation, 31 October 2026)

The owner asked for this branch on a temporary preview: commit `5973b12` (the code of this branch; the closing commit adds only this report and its evidence).

- **Addresses:**
  - office: `https://syedmohsinsajjad.site`;
  - resident app: `https://portal.syedmohsinsajjad.site`;
  - Platform HQ: `https://hq.syedmohsinsajjad.site`.
- **Access:** every address is behind a password (given to the owner directly, not in this repository). The demo bridge page is the only file served without it; it holds no data.
- **How it runs:**
  - built from this branch's commit with its own Node in `/opt/propertyos-preview`, owned by an unprivileged `propertyos` user;
  - three `vite preview` servers listen on 127.0.0.1 only (5273–5275);
  - an Nginx site of its own and a Let's Encrypt certificate front them;
  - start, stop and status scripts are in `/opt/propertyos-preview/bin`; removal steps are in `/opt/propertyos-preview/ROLLBACK.md`.
- **What was left alone:** another production application on the same server, including its files, database, web configuration, certificates, environment, services, firewall and ports. No service was restarted. Nginx was reloaded gracefully after adding the preview's own site, as the owner approved. That application's health was checked after every step.
- **Data:** fictional demo data only, kept in each visitor's own browser. There is no backend, database, payment or message.
- **Live check (Chromium through the password):** 12 / 12 on `5973b12`. The office, resident app and Platform HQ load; a deep link survives a refresh; Urdu reads right to left; dark mode and 200 % text show the cashbook as cards; the resident's bill and payment page reach the office's demo through the bridge page; the office payment drawer promises no receipt at the counter; and switching from the office to the resident app and back works. No page errors.
