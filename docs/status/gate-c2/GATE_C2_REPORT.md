# Gate C.2: Resident Collections (Al-Noor Residency)

**Status: built, then corrected after the owner's review of `d5e599d` ([Issue #4](https://github.com/Esames786/propertyos/issues/4)). Stopped for owner review.**
- The corrections are summarised in [§10](#10-closure-of-the-c2-review-issue-4).
- **Gate D not started.**
- **Branch:** `feature/stage-1.5-premium-design`. `main` is untouched.
- **Not done, as instructed:**
  - no Laravel migrations;
  - no live bank connection or payment gateway;
  - no real transfers;
  - no merge.
- **How it runs:** everything runs in the browser against the typed mock API.
- **Data:** fictional throughout. PropertyOS is a codename.
- **Not claimed:** WCAG conformance. Automated accessibility checks pass, but manual NVDA and real-device checks are still open (see [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md)).

Further detail:
- Results of every check: [`test-results.md`](test-results.md).
- Requirement by requirement: [`FUNCTION_MATRIX.md`](FUNCTION_MATRIX.md).

## 1. How to try it

Start both apps with `npm run dev`. The office app runs on port 5173, the resident app on 5174.

| Where | Who | What to look at |
|---|---|---|
| http://localhost:5173/backoffice/get-started → **Explore the society demo** | **Saba Javed**, accounts officer | **Start:** *Payments arriving* (the default). November is posted, two bank statements are imported and six proofs are waiting. Home shows collections and the work queue. Every figure opens its records. |
| Collections → **Proofs to check** | Saba | **Proofs:** each proof shows the statement lines that could be its transfer: the reasons, whether they match fully, and whether the money reached the association's account in force. Then: verify a full match; ask for an exception on a partial match (someone else approves); wait for the bank line when it is not on a statement yet; ask for information; or reject. Try A-204 (re-sent slip), B-405 (shared reference; choose Imran's transfer to see the exception) and B-207 (paid to another account). |
| Finance → Payments → **Record an office payment** | Saba | **Office cash:** refused, because the committee has not turned on cash. **Ayesha Malik** (treasurer) can turn it on under *Sites & flats → Al-Noor → Payment methods*. |
| Bank & reconciliation | Saba | **Bank:** import a statement **for the account you choose** (a file of another account is refused). Sample 3 brings A-101's 6,000 and 3,000; sample 4 is the retired committee account's statement. Then matched / unmatched / excluded lines, and reconciliation with the proofs waiting for their bank line. |
| http://localhost:5174/customer/portal/home | **Kamran Siddiqui**, A-101 owner-resident | **First run:** choose a text size. **Bill:** 4,200 + previous 1,000 = **5,200**. **Pay:** the association's verified account (copy buttons, QR, reference), send proof → *Pending verification*. Once Saba verifies it, the receipt and statement appear here. |
| Resident app, sign in as **Sana Iqbal** (A-102 tenant) or **Junaid Akhtar** (A-202 tenant) | residents | **Tenant-payer:** sees only the flats and lines they are liable for. **Rabia Hashmi** (A-201 owner) shares the account but not the tenant's bill. |
| Sites & flats → Al-Noor → **Collection account** | **Imran Qureshi** (manager), then Ayesha | **Account change:** proposing a new account needs a second person, then a three-day cooling-off. Residents keep seeing the account in force. |

**The demo link (simulated cross-app provisioning).** Each app runs its own mock server. To let one browser tell the whole story, the society's demo data is kept in the office app's storage, and the resident app reaches it through a small same-host page (`/demo-bridge.html`) in a hidden frame.

The link is labelled wherever it matters:
- the office's *Get started* says the resident app shares this demo;
- the resident's pay page says *"Demo: linked with the society office app in this browser"*;
- if the office app cannot be reached within 5 seconds, the resident app keeps its own copy and says so. It links later if the office app answers before anything was saved locally.

Nothing leaves the browser, and *Reset demo* clears it. A real deployment has one backend.

## 2. What C.2 adds

### 2.1 Model (`packages/contracts/src/collections.ts`)

**Proofs (payment submissions):**
- States: submitted → under review → (awaiting bank evidence) → (exception pending) → needs information → verified / rejected.
- *Awaiting bank evidence*: reviewed, but no statement line shows the money yet. Not settled, not allocated, no receipt.
- *Exception pending*: a partly matching line was proposed with a reason; a second person decides.
- Each resubmission is a new version; versions and history are kept.
- **A proof never creates a payment.** Only verification against independent settlement evidence does.

**Bank:**
- Each statement is bound to one of the association's verified accounts, chosen at import, and to its legal entity and source.
- Each line carries its receiving account, entity and source. A transaction is identified by (account, source, the bank's transaction ID).
- A line is unmatched, matched to one payment, held for an exception, or excluded with a reason.

**Payments and receipts:**
- A payment holds its allocations to invoice lines, any unapplied credit, how it was confirmed and its source.
- Confirmation is one of: a fully matching statement line; a partly matching line through an approved exception (who asked, who approved, what did not match); or cash at the counter.
- Every payment has exactly one receipt.

**Collection settings per site and issuing entity:**
- the beneficiary (bank account) in force, with its history;
- beneficiary changes, which pass through approval and then cooling-off;
- method rules;
- **numbering** patterns;
- the **posting policy**;
- invoice grouping.

**Payer changes:** an approval record (`LiabilityChange`) with an effective date. Corrections supersede.

### 2.2 Engines (pure functions in `packages/fixtures/src/society/`)

| Engine | Does |
|---|---|
| `allocate.ts` | Oldest-first allocation over the payer's own open lines on the **same legal entity and billing account**; validates edited allocations (`cross_payer_forbidden`, `cross_entity_forbidden`, `cross_account_forbidden`, `over_line`, `over_amount`) |
| `matching.ts` | Bank-line candidates with reasons (amount, date window, reference, name), **strength** (full only with all four) and **destination** (the issuing entity's account in force on the value date, or not). A line already matched is *taken* and refused; a different transfer that shares a reference string is **not** a duplicate; duplicates are recognised per (account, source, bank ID); a proof claims a line only when that line is its best free candidate |
| `collections.ts` | Creates submissions, records payments and receipts, applies credit (same payer, entity and account only) |
| `collections-read.ts` | Inbox rows, possible duplicates (same file, or same amount, date and reference), payments, credits, aging, reconciliation, collections summary |
| `aging.ts` | Buckets: not yet due, 1–30, 31–60, 61–90, over 90 days |
| `numbering.ts` | `{code}`, `{yyyy}`, `{yyyymm}` and `{seq:N}` patterns; counters per document kind and period; pattern checks |
| `statement.ts` | Payments shown as one movement each; a line counts toward its own account only |
| `state.ts` | Payer changes applied by effective date (approved only); balances; credit per account; the beneficiary in force on a date |

Golden vectors are in [`collections.vectors.json`](../../../packages/fixtures/src/society/collections.vectors.json). They cover:
- allocation for 5,200, 3,000 and 6,000;
- the shared account;
- entity isolation with a second association;
- bank destination: the account in force, the retired committee account before and after its retirement, the new account before it came into force, and another association's account;
- transaction identity (the same bank ID on two accounts) and match strength;
- resident positions.

### 2.3 Mock API

Every new endpoint declares its module, permission and suspension class, and the fail-closed transport refuses a request before the handler runs. The Gate B security test covers the new endpoints automatically.

The handlers then enforce the rules on the server:
- **Verify:**
  - a statement line is required (`bank_evidence_required`): a reviewer's note is never evidence of the money;
  - the line must exist, be unmatched, not excluded and not held for another proof (`bank_line_already_matched`, `bank_line_held`);
  - it must have reached the issuing entity's account in force on its value date (`wrong_destination`, `cross_entity_forbidden`), even when the amount matches;
  - only a **full match** verifies directly; a partial one returns `exception_required`;
  - edited allocations need a reason and stay within the payer, entity and account.
- **Waiting for the bank line** (`await-bank`): a note of at least 10 characters; nothing is settled, allocated or receipted; the resident still sees *pending verification*. When a statement arrives, the import names the waiting proofs it now matches (it settles nothing by itself).
- **Exception** (`exception`, then `exception/approve` or `exception/reject`):
  - only for a partly matching line on the right account, with a reason of at least 20 characters; the line is held;
  - decided by someone holding `payment_exception.approve` (the treasurer) who is not the requester (by principal);
  - approval re-checks everything, then records the payment as an approved exception;
  - rejection releases the line and returns the proof for review.
- **Statement import:** the officer chooses one of the entity's verified accounts; a file that names another account is refused (`statement_account_mismatch`); re-importing creates nothing.
- **Resident proof:**
  - the file type and size are checked;
  - the same file, or the same amount, date and reference, returns `409 possible_duplicate` until the resident confirms;
  - the resident sees only their own flats' lines, bills, proofs and receipts. Anything else is *not found*, not *forbidden*.
- **Beneficiary change:**
  - the proposer can never approve (checked by principal);
  - an approved change starts after a 3-day cooling-off;
  - residents are shown only the account in force for the issuing entity;
  - the platform's own account never appears.
- **Office cash:** the site's method rule (allowed; the maximum per receipt and the counter, set by the treasurer) and `payment.receive`. Changing the limit leaves the rest of the rule as it was.
- **Posting:** the role must be in the site's posting policy (default: treasurer and accounts officer). **The person who prepared the run never posts.**
- **Payer changes:**
  - requested with a reason;
  - approved by someone else (`liability.approve`);
  - one pending change per flat;
  - a correction supersedes an approved change that has not started;
  - applied by effective date, with history kept.

### 2.4 Roles

| Role | Collections |
|---|---|
| Accounts officer (Saba, new) | **Proofs:** verify full matches, wait for the bank line, request exceptions, request information, reject. **Payments:** office cash, apply credit. **Bank:** import and reconcile. Posts approved runs. Cannot approve exceptions, beneficiaries, payer changes or runs. |
| Treasurer (Ayesha) | Approves payment exceptions (never her own), beneficiary changes and payer changes; changes method rules (including the cash limit), numbering and posting policy; posts. |
| Building manager (Imran) | **Reads** collections (proofs read-only, no bank feed); proposes beneficiary changes; requests payer changes. **No longer posts** (owner decision). |
| Security guard (Shahid) | Nothing financial; every collections address and endpoint refuses. |
| Residents (Kamran, Sana, Rabia, Junaid) | Their own bill, pay page, proofs, receipts and statement only. |

The developer starter roles (administration, finance) gained read access to collections and the bank feed, so the DEV+COMM register addresses show their planned pages to developer staff. The menu offers *Collections* and *Bank & reconciliation* only to organisations licensed for society dues, so a developer's menu and bottom bar are unchanged.

## 3. Golden scenarios

| Scenario | Result |
|---|---|
| A-101 owes | November 4,200 + previous balance 1,000 = **5,200**, due 10 Nov |
| A-101 sends proof of 5,200 | *Pending verification*. The bill is **not** paid and no receipt exists. |
| Saba verifies it against DEMO-TXN-26102604 | Opening balance 1,000 and November 4,200 settled; **receipt** issued; statement closes at **0.00**; reconciliation shows the line matched. |
| A-101 pays 3,000 | At the counter, or by transfer once statement 3 shows it. Oldest first: 1,000 + 2,000 → November **partially paid, 2,200 outstanding** |
| A-101 pays 6,000 | Not on a statement yet: *awaiting bank evidence*, nothing settled, the resident still owes 5,200. Statement 3 brings the line; verified: 5,200 settled, **800 unapplied credit**. The credit can only be applied to Kamran's own lines. |
| Settling on a reason alone | Refused (`bank_evidence_required`). No payment, allocation or receipt; collections figures unchanged. |
| Kamran paid the retired committee account (20 Oct) | The line is imported for that account only (the same bank ID on the association's account is another transaction). It **never settles** his proof (`wrong_destination`), however well it matches. |
| Imran's transfer for B-405 (name does not match) | Partial: verifying is refused (`exception_required`). Saba asks for an exception with a reason; she cannot approve it; Ayesha approves; the payment shows the approved exception. |
| A-201 / A-202 (one account, two payers) | Junaid's payment settles **only A-202**. An allocation to Rabia's A-201 line is refused (`cross_payer_forbidden`). Rabia still owes 7,200 and cannot open Junaid's bill (not found). |
| A-204 re-sends a verified slip | Flagged as a possible duplicate. Its transfer is *taken*, so verifying against it is refused. Rejected with a reason. |
| B-405 quotes "MAINTENANCE NOV" | B-406's transfer has the same words but is a different transfer. Accepted against Komal's own transfer. |
| A-102 blurred photo | Needs information → Sana resubmits (version 2, history kept) → verified. |
| B-207 paid to another account | Rejected with the reason; the resident sees the reason. |
| Office cash | Refused while not allowed; allowed after the treasurer's change, within the limit she sets (lowered to 2,500 then raised to 5,000 in the test); receipt at once. |
| Second association (vectors) | Any cross-entity allocation or match → `cross_entity_forbidden` |

## 4. Reference experiences

Built and reviewed at **1440 / 768 / 390, English and Urdu**. Screenshots: `r*` for the resident journey, `f*` for finance, `m*` for the manager.

1. **Resident bill and payment (mobile first).**
   - One card answers *how much, by when*: total, current and previous balance, due date, status.
   - *Pay* opens the association's verified account, with copy buttons, a bidi-safe IBAN, the reference to quote and a QR. Cash and online are shown honestly as not available.
   - The proof form explains that nothing is paid until it is verified.
   - The proof page shows a stepper (sent → checked → verified → receipt), versions, the office's request or reason, and resubmission.
   - Receipts, history and the statement are one tap away in the bottom bar.
2. **Finance verification and allocation workspace.**
   - Left: what the resident sent (preview, details, versions, history).
   - Right: the decision:
     - bank-transfer candidates with reason badges, taken lines and shared references;
     - the allocation table (editing needs a reason);
     - one action bar: verify, request information, reject.
   - After verifying: the receipt, the new balance and *Next proof*.
   - Previous and next move through the queue.
3. **Building manager's collections dashboard.**
   - Billed, collected (a progress bar of collected / pending / owed), pending verification, outstanding, arrears and credit.
   - The work queue; aging buckets; buildings; recent payments.
   - **Every number is a link to its filtered records.** The E2E suite checks each KPI's destination.

**Contextual navigation:**
- Payment 360 links the receipt, the source proof, the bank line, the statement and each flat.
- Flat 360 shows its liability changes and statement.
- The account statement links each payment.

**Design:**
- The design system (Limestone & Evergreen) is unchanged.
- Nizam was used only as a benchmark for everyday clarity; no branding, layout, code or asset is used.

## 5. Owner decisions from the C.1 review, as applied

| Decision | Applied |
|---|---|
| One invoice per billing account and responsible payer; flat-level lines | Kept. Grouping is a configurable setting (`account_payer` default; consolidated or per-flat later). Allocation never crosses payer, entity or account. |
| Al-Noor not seeded in HQ; Ready and Fresh starts kept | Kept, plus a third start, **Payments arriving** (default for C.2). The resident app link is labelled as simulated. |
| Posting configurable; default finance roles; maker-checker | Posting policy per site (roles, reason). Default treasurer and accounts officer; the manager no longer posts; the preparer never posts. Audited. |
| Payer changes need auditable approval | Request (reason) → approve or reject by a second person → applied from its date. Withdraw; correct (supersede). Several future changes apply in date order. The approval queue is BILL-017. |
| Shalimar's empty Sites & Flats | Explains what a site is, how setup works, and who to ask. |
| Remove Al-Noor-specific reference assumptions | Every document reference comes from the issuing entity's numbering scheme (`numbering.ts`): invoice, opening balance, credit note, payment, receipt, proof and run. So does the payment reference residents quote. Patterns are editable per site (new documents only; issued references never change). `ANR` remains only in Al-Noor's fixture data (record ids, account numbers from the flat register). |
| Future payer changes by effective date, with regression tests | `withPayerChanges` applies approved changes in date order; unit and API tests cover two future changes and a correction. |

## 6. Decisions made in C.2 (please confirm or correct)

1. **Demo start "Payments arriving" is the default.** November is posted on 21 Oct by the treasurer, two statements are imported and six proofs are waiting; the demo clock is 26 Oct 2026. *Ready* and *Fresh* remain.
2. **The accounts officer is a new society starter role.** It verifies, records and reconciles; it approves nothing.
3. ~~Verifying without a bank line is allowed with a written reason.~~ **Not accepted by the owner and removed.** A proof without a statement line waits as *awaiting bank evidence*; nothing settles until the line arrives. A partial match needs an approved exception.
4. **Overpayment stays as unapplied credit on the same payer**, applied by staff to that payer's later lines. It is not applied automatically to the next invoice.
5. **Cooling-off is 3 days**, with a demo-only control to end it early. The value is a setting.
6. **Office cash is off by default for Al-Noor.** The 50,000 maximum is this fixture's starting value only; the treasurer sets the society's own limit.
7. **Duplicate proofs:** the resident is asked before sending the same file, or the same amount, date and reference, again. Staff see the possible duplicates.
8. **Text size is kept per person and organisation in the browser.** A real deployment would keep it in the user profile. The first-run step is in the resident app; staff apps use the same tokens, and their control arrives with the Gate D personalisation hub.

## 7. Text size (additional requirement)

- **First run:** one short step titled *"Choose the text size that's comfortable for you"*.
  - Four choices: Small 100 %, Comfortable 112 %, Large 125 %, Extra large 150 %.
  - A live preview of a bill card, and *Continue with N %*.
  - English and Urdu (RTL).
- **Settings:** *Text size & display*, reached from the side navigation and the account menu (*Text size*).
  - A scale of 100, 112, 125, 150, 175 and 200 %, with an instant preview.
  - *Reset to default*.
  - Saved per person and organisation; survives a refresh.
- **How it works:** design tokens.
  - Every text token is `calc(base × var(--text-scale))`.
  - Navigation and chrome labels use `--chrome-scale`, capped at 112 %, so the bottom bar never truncates.
  - Layout uses rem and container queries, so browser zoom still applies on top.
  - The same token layer is where Gate D's themes, contrast, motion, density and fonts plug in.
- **Verified by E2E:**
  - First run Large applies everywhere.
  - Settings → 200 % → refresh keeps it.
  - English and Urdu on a phone.
  - At 200 %: no horizontal scroll, the bottom bar never covers content, labels are not clipped, and the primary action is reachable.
  - Another resident in the same browser keeps their own size.
  - axe on the first-run step.

## 8. Limitations and what is not in C.2

- **No live bank, gateway or transfer.** Bank statements come from sample files. Online payment is shown as arriving in Gate D.
- **Cheques** are listed as Gate E. Refunds and accounting postings are Gate E.
- **The developer edition** of these screens remains planned. The register marks them PARTIAL: society edition built.
- **Notifications are simulated.** Residents see changes when they open the app.
- **The cross-app link is a prototype device** (same browser, same host). A second browser or device has its own demo.
- **One association and one site** in the demo. The second-entity isolation is proven in engine vectors and API tests, not in a second demo tenant.
- **Staff text-size control** is not exposed in C.2 (see decision 8).
- **No exceptional settlement on bank confirmation without a statement line.** The owner allowed one only with strong evidence (account, transaction identity, amount, date, reviewer), higher privilege and independent approval. The prototype does not offer it: a proof without a line waits for the statement. An exception exists only for a partly matching line that *is* on an imported statement.
- **Bank evidence is simulated**: statements are sample files; no bank is contacted, and the files' account line is trusted as the bank would print it. Authenticated feeds belong to a later gate.
- **Cash witnessing and period locks** (a second person confirming cash) are Gate S.1, as the owner noted.
- **Manual NVDA, VoiceOver and real-device checks have not been performed.** Firefox and WebKit run a smoke suite only. See [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md).

## 9. Evidence

- **Screenshots**: 390 in `screenshots/`.
  - The three reference experiences at 1440, 768 and 390 in English and Urdu (360):
    - resident `r01`–`r19`;
    - finance `f01`–`f26` (with `f10b`, `f10c`): the bank-evidence wait, the account-bound import, the exception and its approval, the retired account;
    - manager and settings `m01`–`m13`.
  - Other organisations and empty states at 1440 and 390 (8).
  - **Live-viewport phone shots** `v01`–`v06` at 150 % and 200 %, English and Urdu (22): exactly what the phone shows (top, scrolled, end of page, keyboard focus, typing, keyboard open), not full-page captures.
- **Videos** in `video/`:

  | Video | Shows |
  |---|---|
  | `resident-pay-journey-phone-en` | First run (Large) → bill 5,200 → pay → verified account and QR → proof → pending → verified by the office → receipt → statement |
  | `officer-verification-desktop-en` | Queue → A-101 verified against its transfer → A-204's re-sent slip refused and rejected → B-405's shared reference accepted → A-102 asked for information → reconciliation |
  | `manager-collections-dashboard-desktop-en` | Each figure opens its filtered records; aging bucket; a building's owing accounts |
  | `text-size-onboarding-settings-phone-ur` | In Urdu on a phone: first-run sizes previewed, Large chosen → home → settings 150–200 % → refresh keeps it → home and pay at 200 % → reset |
  | `bank-evidence-and-exception-approval-desktop-en` | 6,000 not on a statement: *wait for the bank line* → import the statement for the chosen account → the waiting proof is named → verified; then Imran's partly matching transfer for B-405 → exception → the treasurer approves from her dashboard |
  | `phone-200-ur-header-scroll-focus-typing` | In Urdu at 200 % on a phone (live viewport): the one-line header while scrolling, keyboard focus on the pay page, the bar stepping aside while typing and returning |

## 10. Closure of the C.2 review (Issue #4)

| # | Required correction | What changed | Proved by |
|---|---|---|---|
| 1 | Manual verification without independent bank evidence must not create a settled payment, mark invoices Paid or issue a receipt | *Verify by hand* is gone. Verifying needs a statement line (`bank_evidence_required`); the reviewer can only mark the proof as checked and **waiting for the bank line** | `collections.api.test` (a fabricated reason is refused; nothing moves; the line arrives later; verified once; no second recognition); `collections.spec` (6,000 waits, then verified after the import) |
| 2 | A clear reviewed / awaiting-bank-evidence state; independent settlement evidence before a payment is final | New state `awaiting_bank_evidence` (inbox filter, queue row, dashboard task, reconciliation list, resident: *checked, waiting for the bank*). The import lists the waiting proofs it now matches; the officer verifies them | Same tests; screenshots `f10`–`f10c`, `f20`, `f21`; video `bank-evidence-and-exception-approval-desktop-en` |
| 3 | Bind imported transactions to the receiving account, beneficiary and legal entity; validate during verification | Statements and lines carry the chosen verified account, its entity and source; the import refuses a file of another account; verification refuses a line that did not reach the entity's account in force on its value date (`wrong_destination`) or another entity (`cross_entity_forbidden`) | Vectors `bankDestination` (5 cases); `collections.api.test` (account required, mismatch refused, retired-account line refused); `collections.spec` (choose account, mismatch refused, line disabled); `f19`, `f26` |
| 4 | Deduplicate per receiving account and source; keep distinct transfers with the same reference | Identity = (source, account, bank ID). The committee account's statement carries the same bank ID as a line on the association's account: both kept. Shared reference text still never makes a duplicate | Vector `bankIdentity`; unit and API tests; `collections.spec` (two lines with the same ID) |
| 5 | Stronger rules for amount-only or mismatched candidates; an explicit exception workflow | Candidates show strength (full / partial) and what does not match. Only a full match verifies. A partial match needs an exception: a reason, the line held, approval by another person with `payment_exception.approve`, everything re-checked, audited. A shared reference with a genuine, fully matching transfer stays valid | Vectors `matchStrength`; `collections.api.test` (refused directly, maker ≠ checker, rejection releases the line); `collections.spec` exception test; `f22`–`f25` |
| 6 | Mobile header and floating navigation at 150–200 %, especially Urdu; verify the live viewport | From Large text up, the phone header keeps to one line (monogram; full name for screen readers, on the page and in the menu); the language toggle uses the capped chrome size; scroll padding keeps keyboard focus clear of the header and the bar; the bar steps aside (and is inert) while a field is being typed in | `collections.spec` (EN and UR at 150 % and 200 %: header height, first heading below it, every Tab stop clear of header and bar, a short "keyboard open" viewport while typing); viewport screenshots `v01`–`v06`; video `phone-200-ur-header-scroll-focus-typing` |
| 7 | Office cash limits configurable; 50,000 is illustrative | The treasurer edits the limit and the counter on *Payment methods*; changing one setting leaves the others (a latent bug, fixed) | `collections.api.test`; `collections.spec` (2,500 refuses 3,000; 5,000 takes it); `m09` |
| 8 | Update tests, screenshots, function matrix and limitations | This report, [`FUNCTION_MATRIX.md`](FUNCTION_MATRIX.md), [`test-results.md`](test-results.md), [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md), the register notes, regenerated evidence | — |

The owner's product recommendations in the issue are applied as written:
- accepted as delivered: the *Payments arriving* default, the accounts officer's scope, credit scoped by payer, entity and account, duplicate-proof confirmation as a warning only, resident text size;
- cooling-off: a demo default with a demo-only end control, labelled as such;
- office cash: a fixture policy, now editable.

