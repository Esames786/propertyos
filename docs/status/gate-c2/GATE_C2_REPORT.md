# Gate C.2: Resident Collections (Al-Noor Residency)

**Status: built. Stopped for owner review.**
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
| Collections → **Proofs to check** | Saba | **Proofs:** each proof shows the suggested bank transfer and its reasons, what the money settles (oldest first, this payer only), then verify, ask for information or reject. Try A-204 (re-sent slip), B-405 (shared reference) and B-207 (paid to another account). |
| Finance → Payments → **Record an office payment** | Saba | **Office cash:** refused, because the committee has not turned on cash. **Ayesha Malik** (treasurer) can turn it on under *Sites & flats → Al-Noor → Payment methods*. |
| Bank & reconciliation | Saba | **Bank:** the statements (re-importing one creates nothing), matched / unmatched / excluded lines, and reconciliation. |
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
- States: submitted → under review → needs information → verified / rejected.
- Each resubmission is a new version; versions and history are kept.
- **A proof never creates a payment.** Only verification does.

**Bank:**
- Statements and lines, identified by the bank's transaction ID.
- A line is unmatched, matched to one payment, or excluded with a reason.

**Payments and receipts:**
- A payment holds its allocations to invoice lines, any unapplied credit, how it was confirmed (bank-matched, by hand with a reason, or at the counter) and its source.
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
| `matching.ts` | Bank-line candidates with reasons (amount, date window, reference, name); a line already matched is *taken* and refused; a different transfer that shares a reference string is **not** a duplicate; a proof claims a line only when that line is its best free candidate |
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
- resident positions.

### 2.3 Mock API

Every new endpoint declares its module, permission and suspension class, and the fail-closed transport refuses a request before the handler runs. The Gate B security test covers the new endpoints automatically.

The handlers then enforce the rules on the server:
- **Verify:**
  - the bank line must exist, be unmatched and not be excluded (`bank_line_already_matched`);
  - verifying without a bank line needs a reason of at least 10 characters, and the payment is flagged as "verified, awaiting bank line" in reconciliation;
  - edited allocations need a reason and stay within the payer, entity and account.
- **Resident proof:**
  - the file type and size are checked;
  - the same file, or the same amount, date and reference, returns `409 possible_duplicate` until the resident confirms;
  - the resident sees only their own flats' lines, bills, proofs and receipts. Anything else is *not found*, not *forbidden*.
- **Beneficiary change:**
  - the proposer can never approve (checked by principal);
  - an approved change starts after a 3-day cooling-off;
  - residents are shown only the account in force for the issuing entity;
  - the platform's own account never appears.
- **Office cash:** the site's method rule (allowed, maximum amount) and `payment.receive`.
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
| Accounts officer (Saba, new) | **Proofs:** verify, request information, reject. **Payments:** office cash, apply credit. **Bank:** import and reconcile. Posts approved runs. Cannot approve beneficiaries, payer changes or runs. |
| Treasurer (Ayesha) | Approves beneficiary changes and payer changes; changes method rules, numbering and posting policy; posts. |
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
| A-101 pays 3,000 | Oldest first: 1,000 + 2,000 → November **partially paid, 2,200 outstanding** |
| A-101 pays 6,000 | 5,200 settled, **800 unapplied credit**. The credit can only be applied to Kamran's own lines. |
| A-201 / A-202 (one account, two payers) | Junaid's payment settles **only A-202**. An allocation to Rabia's A-201 line is refused (`cross_payer_forbidden`). Rabia still owes 7,200 and cannot open Junaid's bill (not found). |
| A-204 re-sends a verified slip | Flagged as a possible duplicate. Its transfer is *taken*, so verifying against it is refused. Rejected with a reason. |
| B-405 quotes "MAINTENANCE NOV" | B-406's transfer has the same words but is a different transfer. Accepted against Komal's own transfer. |
| A-102 blurred photo | Needs information → Sana resubmits (version 2, history kept) → verified. |
| B-207 paid to another account | Rejected with the reason; the resident sees the reason. |
| Office cash | Refused while not allowed; allowed after the treasurer's change; receipt at once. |
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
3. **Verifying without a bank line is allowed with a written reason.** The payment shows as *verified, awaiting bank line* until the statement arrives. The alternative is to forbid it until the bank line is imported.
4. **Overpayment stays as unapplied credit on the same payer**, applied by staff to that payer's later lines. It is not applied automatically to the next invoice.
5. **Cooling-off is 3 days**, with a demo-only control to end it early. The value is a setting.
6. **Office cash is off by default for Al-Noor**, with a 50,000 maximum when turned on.
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
- **Manual NVDA, VoiceOver and real-device checks have not been performed.** Firefox and WebKit run a smoke suite only. See [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md).

## 9. Evidence

- **Screenshots**: 308 in `screenshots/`.
  - The three reference experiences at 1440, 768 and 390 in English and Urdu (300):
    - resident `r01`–`r19`;
    - finance `f01`–`f18`;
    - manager and settings `m01`–`m13`.
  - Other organisations and empty states at 1440 and 390 (8).
- **Videos** in `video/`:

  | Video | Shows |
  |---|---|
  | `resident-pay-journey-phone-en` | First run (Large) → bill 5,200 → pay → verified account and QR → proof → pending → verified by the office → receipt → statement |
  | `officer-verification-desktop-en` | Queue → A-101 verified against its transfer → A-204's re-sent slip refused and rejected → B-405's shared reference accepted → A-102 asked for information → reconciliation |
  | `manager-collections-dashboard-desktop-en` | Each figure opens its filtered records; aging bucket; a building's owing accounts |
  | `text-size-onboarding-settings-phone-ur` | In Urdu on a phone: first-run sizes previewed, Large chosen → home → settings 150–200 % → refresh keeps it → home and pay at 200 % → reset |
