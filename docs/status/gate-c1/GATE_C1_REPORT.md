# Gate C.1: Society Setup + Monthly Maintenance Billing (Al-Noor Residency)

**Status: built; STOPPED FOR OWNER REVIEW.**
- Gate C.2 (collections and the resident) and Gate D have not been started.
- **Branch:** `feature/stage-1.5-premium-design`. `main` is untouched.
- **Not done, as instructed:** no Laravel migrations, no real payments, no bank integrations, no real financial postings, no merge. Everything runs in the browser session against the typed mock API.
- **Data:** fictional throughout. PropertyOS is a codename.
- **Not claimed:** full WCAG conformance. Automated accessibility checks pass; the manual NVDA and cross-browser checks are still outstanding and tracked in [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md).

Results of every check: [`test-results.md`](test-results.md). Requirement by requirement:
[`FUNCTION_MATRIX.md`](FUNCTION_MATRIX.md).

## 1. How to try it

| Where | Who | What to look at |
|---|---|---|
| http://localhost:5173/backoffice/get-started → **Explore the society demo** | **Imran Qureshi**, building manager | Leave *Start before setup* off: the society is set up and November is ready to bill. Turn it on to import the flat register, opening balances and charges yourself |
| Home | Imran | Collections first; *What needs doing*; the November run; approvals; flats by block; largest arrears; what later stages bring. Type `a102` in *Open a flat* |
| Billing → New billing run | Imran | Create → Generate preview → the **Flats** tab → Send for approval. *Approve* stays disabled: he prepared it |
| More → sign out → **Ayesha Malik**, committee treasurer | Ayesha | Home shows the run waiting for her → Approve → Post 79 invoices (try clicking twice) → Notify residents (simulated). Then Finance → an invoice → *Issue a credit note* |
| Sites & flats → Al-Noor Residency | either | The onboarding checklist, the block/floor explorer, flat types, opening balances, the collection account and payment methods |
| `/backoffice/sites/site_alnoor/units/unt_anr_a102` | either | Flat 360: owner, occupant and payer kept apart; the chain from the block to the statement |
| sign in as **Shahid Hussain**, security guard | Shahid | No billing, no payers, no statements; *My access* says why |

## 2. What C.1 adds

### 2.1 The model (contracts `sites.ts`, `billing.ts`)
- **Site-rooted hierarchy**: site → block → floor → flat. Al-Noor has no developer projects (A2 I-2).
- **Four separate facts, each effective-dated**: sale/booking (none for a society), ownership, occupancy, and the **responsible payer per flat**. One billing account may cover several flats with different payers (A-201 and A-202).
- **Charge rules** (site, block, flat type, flat), versioned by month, most specific wins; **exemptions** need approval.
- **Billing runs**: DRAFT → PREVIEWED → APPROVAL_PENDING → APPROVED → POSTED → NOTIFIED (CANCELLED before posting).
- **Invoices** from the shared receivables engine, with their source (`billing_run`, `opening_balance`); **credit notes**; a **derived statement** whose previous balance is never an invoice line.

### 2.2 Engines (pure, deterministic, in `packages/fixtures/src/society/`)
| Engine | Does |
|---|---|
| `model.ts` | Builds flats, people, facts and accounts from the society's register rows; the *ready* demo and a fresh import of the sample file produce the same model |
| `import.ts` | CSV parsing; row checks against the site's structure; duplicates in the file and against registered flats; suggested fixes; file fingerprint |
| `charges.ts` | Which rule wins for a flat and month; the rules it overrode; approved exemptions |
| `billing-run.ts` | Transition table; assessment snapshot and its fingerprint (staleness); idempotent posting keyed by hash(site, account, flat, period, rule, posting version) |
| `statement.ts` | Invoice read model (credits applied when read; stored invoices never change); statement for an account, one payer or one flat |

Golden vectors: [`packages/fixtures/src/society/dues.vectors.json`](../../../packages/fixtures/src/society/dues.vectors.json).

### 2.3 The mock API (`society/handlers.ts`)
Every endpoint declares its module, permission and suspension class, and the fail-closed transport refuses before the handler runs (the Gate B security test covers the new endpoints automatically). The handlers then check the record (site, legal entity, scope) and the workflow rules **on the server**:
- one open run per site and month (`duplicate_period`, with a link to the existing run);
- a preview made before a change of rules, exemptions, flats or payers is **stale**, and submit and approval are refused (`stale_preview`);
- **maker ≠ checker by principal** for runs, exemptions and opening balances (`maker_checker_required`), even for a person who holds both permissions;
- posting twice, retrying or double-clicking returns the same invoices (`replayed: true`) and records the replay;
- there is **no edit path** for an invoice (`PATCH` → 409 `state_locked`); a credit note is limited to each line's open amount and needs a reason;
- imports are all-or-nothing; repeated rows must be acknowledged; re-running the same file creates nothing;
- a payer change starts on the first of a month that is not yet billed; October's balance keeps the person who was liable then.

### 2.4 Roles (society starter set, A4 §9)
| Role | Prepares | Approves | Posts | Credit notes |
|---|---|---|---|---|
| Building manager (Imran) | site, import, payers, opening balances, charges, exemption requests, runs | — | yes | — |
| Committee treasurer (Ayesha) | — | runs, exemptions, opening balances | yes | yes |
| Security guard (Shahid) | nothing financial | — | — | — |

## 3. The golden scenario, end to end

| Step | Result |
|---|---|
| Import the sample register | 82 rows: 77 ready, 3 to fix (A-305 type, B-207 area, B-406 floor), 2 repeated (A-206, B-408). Suggestions fix the three; the repeats are skipped after confirmation → **80 flats**. Re-running the file: all 80 already registered, nothing created |
| People | 63 owner-occupied, 12 rented (8 tenants pay, 4 owners pay), 4 vacant (owners pay), A-108 the association's office: **registered 80, occupied 76** |
| Opening balances | 10 accounts, PKR 49,100, imported by Imran, approved by Ayesha. **A-101: PKR 1,000** |
| Charges | Maintenance 3,000 (penthouse 4,500), security 500, lift 300, water 400. A-108 exempt (approved). *Which rule wins* for A-501: Penthouse 4,500 over the site default 3,000 |
| November run | 80 flats assessed; **79 invoices, PKR 355,800** (63 × 3,000 + 16 × 4,500 + 79 × 1,200); A-108 listed at zero |
| Approval | Imran cannot approve; Ayesha approves |
| Posting | 79 invoices; a second post returns the same 79 and creates nothing |
| Statement, A-101 | Previous balance 1,000 + November 4,200 = **5,200**; the invoice itself is 4,200 |
| Correction | A credit note of 400 on A-101's water line; the invoice stays as issued; the statement shows both (4,800) |

## 4. Reference experiences

Built first and reviewed at **1440 / 768 / 390 in English and Urdu** before the other screens (screenshots `a-*`, `b-*`, `c-*`):
- **A. Society Dashboard.** Collections first (billed, outstanding, in arrears, and *collected*, which says plainly that it arrives in C.2 instead of showing a number). Then the person's own work and what waits for someone else, the month's run, approvals, flats by block, the largest arrears, and what later stages bring. Every figure opens its records.
- **B. Flat 360.** Breadcrumbs to the block and floor, the floor's neighbours, the four facts kept apart, and the chain **Where → Who → Money** (block, floor, flat; owner, occupant, payer; this month's charges, latest invoice, owed now). Tabs for ownership and occupancy history, payer and account, *which rule wins*, invoices and statement, activity.
- **C. Monthly Billing Workspace.** Calendar, builder with checks, and the run workspace: progress with who moved it, one next step explained for the person reading it, the per-flat assessment (filters, 20 per page, a *why* drawer per flat), exceptions, approval history and how posting works.

Benchmarked against the Nizam reference for clarity of everyday workflows and collection hierarchy only. No Nizam branding, code, layout or asset is used; the Limestone & Evergreen design is unchanged.

## 5. Decisions made in C.1 (please confirm or correct)
1. **One invoice per billing account *and responsible payer*.** A4 §3 says one invoice per account. Al-Noor's shared account (A-201 owner-paid, A-202 tenant-paid) would then give 78 invoices, not the golden 79, and would put the tenant's charges on the owner's invoice. Grouping by account and payer gives 79 and keeps per-unit liability intact.
2. **Al-Noor is not seeded in Platform HQ.** HQ's Gate B storyline *creates* Al-Noor, so seeding it would duplicate it. The workspace has it in the tenant directory, and a test checks that what HQ creates has the same site and modules.
3. **Two starting points for the society demo**: *ready* (default: set up, November not billed) and *fresh* (before the import).
4. **Opening balances** are dated 20 Oct 2026 (go-live) and posted as opening-balance invoices once approved.
5. **Both the manager and the treasurer may post** an approved run. Neither may approve their own work.
6. **Payer changes need no approval** in C.1; they start on the first of an unbilled month and keep history.
7. **Society starter roles gained the new permissions** (administrator, manager, treasurer). Shalimar Court's administrator therefore sees *Sites & flats* (empty: no flat register in that demo), and Cedar Hills' treasurer gains billing permissions that its suspension keeps paused.
8. **A credit note is dated no earlier than its invoice**, because bills are issued ahead of their month.

## 6. Limitations and what is not in C.1
- **Collections are C.2**: payments, proofs, receipts, allocation, reconciliation, office cash, the resident portal and the accounts officer. Nothing is ever marked paid in C.1.
- **Supplementary runs** (posting version 2 for missed flats) are not built; posted amounts are corrected with credit notes. A second run for a posted month is refused.
- **Collection account and payment methods** are read-only. Proposing and second-approving a beneficiary change, and office-cash rules, arrive with C.2.
- **Scope of a run** is the whole site; billing only some blocks is listed as later.
- **People come from the flat register.** There is no separate people import, no household members and no merging of possible duplicates (same phone) in the UI yet.
- **Notifications are simulated** ("79 notices recorded"); nothing is sent.
- **One society site** in the demo. Several sites would turn the header chip into a picker.
- **Charge categories** beyond the four of C.1 are listed as not set up; late fees and parking are marked as arriving in Gate G.
- **Statements** offer October and November (the demo's months).
- **FIN-002 for developers** remains the read-only Gate B list; the society list is the new one.
- **Manual NVDA and cross-browser checks have not been performed** (Chromium only). See [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md).

## 7. Evidence
- **Screenshots**: 232 in `screenshots/`. The reference experiences at 1440, 768 and 390 in English and Urdu (76); every other screen and overlay at 1440 and 390 in both languages.
- **Videos** (`video/`):

  | Video | Shows |
  |---|---|
  | `society-onboarding-to-79-posted-invoices-desktop-en` | Get started → society demo before setup → import with fixes → opening balances approved by the treasurer → site defaults and the penthouse override → A-108 exemption approved → November run → the manager can't approve → the treasurer approves, posts 79 invoices and notifies |
  | `flat-360-connected-records-payer-change-desktop-en` | Flat finder → A-102 → its tabs and neighbours → B-204 payer change from November → October keeps the old payer → everything connected |
  | `billing-run-maker-checker-phone-ur` | On a phone, in Urdu: the manager prepares and sends November; the treasurer approves and posts |
  | `credit-note-correction-desktop-en` | A posted invoice corrected with a credit note; the statement shows both |
