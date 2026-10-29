# V3.2 proposal: decisions for the owner (revision 4)

**Status: NONE OF THESE DECISIONS IS APPROVED.**
- **Revision 4** rebases the package on the committed, approved C.2 register (`e2ccd89`). It also prepares **final recommended resolutions** for D-21, D-23, D-24, D-43 and D-49 (§0.1), ready for the owner to ratify.
- **GPT's re-review of `eba5cec`** accepted revision 3 as the planning baseline, with one access-mapping fix (PORTAL-042). That fix is now made.
- **Ratifying a decision approves the planning baseline only.** It does not authorise:
  - any milestone;
  - backend work;
  - changes to `main`;
  - changes to the live register.

  Each milestone, starting with D.1, needs its own explicit authorisation.
- Decisions that need financial, privacy, legal or safety review stay **conditional** (§0.2).

**How to read this**
- Numbering continues from Gate A (D-1 to D-20).
- Reply "approve", or name an alternative.
- **Blocks** says what cannot start until the decision is made.

## 0. Summary of the final recommendations (revision 4)

### 0.1 Ready to ratify

| # | Recommended resolution | Ratifying it settles | It does not authorise |
|---|---|---|---|
| **D-21** | Add four catalogue modules: `community_chat`, `community_hub` and `rentals` (add-ons), and `safety` (add-on, catalogue status **restricted**). The catalogue goes 27 → 31 as a new HQ catalogue version. **Rule R:** a resident-facing screen of any module is entered through `resident_portal` + `portal.use`, then needs that module's grant for the same site | The module boundaries the register delta uses | Selling or granting the modules, or building their screens. `safety` stays unavailable (D-26) |
| **D-23** | Sequence: C.2 (closed, `e2ccd89`) → this review → **D.1** → S.1 → D.2 → D.3 → S.2 → S.3 → safety design (documents only) → S.4 (parked) → E, F, G → H. Each milestone is bounded and individually authorised, and stops for review at its end | The order of the execution plan | Starting D.1 or any other milestone |
| **D-24** | Split Gate D (49 distinct) into **D.1 (15)**, **D.2 (26)** and **D.3 (8)**, with a checkpoint after each | Slice contents (reconciliation §5.3) | Building any slice |
| **D-43** | **Baseline:** the committed C.2 register `e2ccd89` (396 rows, 337 distinct). **Delta:** revision 4 (112 operations) gives **455 rows and 365 distinct** (362 active + 3 parked) once every milestone is adopted. **Adoption:** a milestone's rows enter the live register only when that milestone is authorised. **Drift:** any other change to the live register first means regenerating the delta and re-running the verification | The counts and the adoption rule | Changing the live register now |
| **D-49** | Keep **PORTAL-023** as the canonical resident notices page, delivered in **D.2** with:<br>• PORTAL-043 notice detail;<br>• PORTAL-042 notifications (`resident_portal` + `portal.use`; corrected in revision 4);<br>• RES-005 and NOT-003.<br>Publishing needs `notices.publish` (`communications`). No `community_hub` or `community_chat` grant or permission is on the path. The alternative (a minimal Community shell in D.2) is **not** recommended | The official-notices design | Building it |

### 0.2 Still conditional: specialist review needed before a final decision

| Review | Decisions | What the review must settle |
|---|---|---|
| Financial | D-34, D-35, D-37, D-42, D-46, D-48 | When money counts as received or settled: cashbook, cheques, credit, fees, office cash, and settlement evidence |
| Legal and tax | D-33, D-42, D-30, and retention in D-25 | The rentals issuing model and client money; fee lawfulness; formal ballots; chat retention |
| Privacy | D-25, D-27, D-38, D-39, D-40, D-47 | Chat, login status, published finance, standing, exports, small-audience thresholds |
| Safety | D-26 | The SOS safety design (parked) |

### 0.3 Owner product choices (no specialist review; recommendations unchanged)

D-22, D-28, D-29, D-31, D-32, D-36, D-41, D-44 and D-45.

## A. Scope, modules, sequence and counting

| # | Decision | Recommendation | GPT review | Blocks |
|---|---|---|---|---|
| **D-21** | Four new catalogue modules: `community_chat`, `community_hub`, `safety` (**restricted**), `rentals` (27 → 31) | **Ratify** (revision 4, final). **Rule R** (revision 4): resident-facing screens of these and every other module enter through `resident_portal` + `portal.use` and then need the module's grant for the same site, as the committed portal handlers do. Alternative: fold chat and the hub into `communications` as features | Sensible; safety restricted | All new-module milestones |
| **D-22** | `hr` and `payroll` as separately licensed add-ons for community and portfolio (one edition-aware module) | Approve | Agrees; reuse the shared modules | S.2 |
| **D-23** | Order: C.2 (**closed, `e2ccd89`**) → docs baseline review → D.1 → S.1 → D.2 → D.3 → S.2 → S.3 → safety design → S.4 → E/F/G → H, **each bounded and individually authorised** | **Ratify** (revision 4, final). Alternative: Issue #2's order, with finance after all of Gate D | Agrees | D.1 |
| **D-24** | Split Gate D (**49 distinct, verified on `e2ccd89`**: D.1 15, D.2 26, D.3 8) into D.1, D.2 and D.3, with a checkpoint after each | **Ratify** (revision 4, final) | Agrees | D.1 |
| **D-43** | Baseline and adoption | **Ratify** (revision 4, final). The baseline is the committed, approved C.2 register `e2ccd89` (396/337). Delta revision 4: 112 operations (28 ADD, 31 ADD-STATE, 53 MODIFY) → 455 rows and 365 distinct (362 active + 3 parked). Revision 3 replayed on `e2ccd89` gives exactly 108 operations; the 4 extra MODIFY rows reconcile C.2 overlaps and change no count. Adopt only each authorised milestone's rows; never change the live register before that | Re-review: final count to be recomputed on the C.2 commit (now done: `SCREEN_COUNT_RECONCILIATION.md`) | Register sync |
| **D-44** | Prices for the new add-ons | Supreme Admin sets rate-card components in HQ; no prices proposed | — | Commercial demos |
| **D-45** | Overlay counting rule for the **existing** register. V3.2 counts overlays without their own route as states (SOS-004, PORTAL-033, GLOBAL-015, PORTAL-040). The live register still counts GLOBAL-013 and the GUIDE tour overlays as screens | Align the existing rows the same way in a separate, owner-approved register change, or document why tours count. No change in this proposal | Requested consistency | Final totals |

## B. Privacy, community and communication

| # | Decision | Recommendation | GPT review | Blocks |
|---|---|---|---|---|
| **D-25** | Chat policies | (1) Resident direct messages **off** by default. (2) No history before joining. (3) **On membership end:** the server revokes access, queued deliveries and pending notifications **at once**. A device's downloaded copy is removed **when it next connects**, and messages written offline are rejected then. Immediate deletion from an offline or unreachable device is **never promised** (revision 3). Optionally, cached content is hidden after a tenant-set offline limit; no default is proposed. (4) Moderation only through the report workflow. (5) **Retention is a legally configurable tenant setting with deletion exceptions and user notice; no statutory period presumed; chat stays off until it is set.** (6) Chat takes the phone's centre slot only if licensed and chosen | Privacy-first. Re-review: offline revocation is enforceable only on reconnect or next sync; server access and queued delivery revoke immediately | D.3 |
| **D-27** | Login status visibility and invitation channels | Permitted staff only; date granularity; never visible to residents; simulated WhatsApp/SMS with consent, printed codes | — | D.1 |
| **D-28** | Community complaints model | One request entity with `kind` (repair \| community issue) | — | D.2 |
| **D-30** | Polls | Informal only, labelled; formal ballots deferred | — | D.3 |
| **D-31** | Marketplace | Optional, off by default; reasonable to defer if D.3 grows | Optional/off; may defer | D.3 |
| **D-32** | Services directory | Vetted only; consent; counts only; disclaimer | — | D.3 |
| **D-38** | Society finance visible to residents | Aggregate committee-approved summaries only; **no defaulter list** | — | D.3 |
| **D-39** | Resident "standing" | Private and opt-in only, or drop | — | S.1 |
| **D-40** | Data export and deletion | Content = granted modules ∩ the **requester's own** effective access, re-checked at generation and download; **approval narrows only, never widens**; approver ≠ requester; purpose required; consent-limited contacts; files expire in 7 days; financial records anonymised, never deleted | Must not expand scope | D.1 |
| **D-41** | App switching | Allowed for people holding both roles; audited; separate scopes and caches; a tenant can disable it per role | — | D.1 |
| **D-47** | Small-audience privacy threshold, **including differencing** | (1) Show affected counts and poll results only when the count ≥ **3** and the eligible audience ≥ **5** households (tenant-configurable upwards, not downwards); otherwise "Reported" / "Not enough responses to show". (2) **Revision 3:** residents get fixed groupings only (site, or a qualifying block), with no free filters or date ranges. (3) A grouping is hidden when its difference from any other shown count falls below the threshold. (4) Resident-visible counts are scheduled snapshots, not live tallies. The interval is the owner's choice; daily is suggested. (5) Poll results appear only after the poll closes. (6) Tests cover site − block, adjacent groupings, consecutive snapshots and affirm–withdraw toggling | Re-review: must test differencing across small subgroup filters and consecutive time snapshots, not just single cells | D.2, D.3 |
| **D-49** *(revision 3)* | Official notices without `community_hub` | **Ratify** (revision 4, final). **PORTAL-023 stays the canonical resident notices page**, delivered in **D.2** with notice detail (PORTAL-043, `/customer/portal/community-notices/:id`), the resident notifications panel (PORTAL-042), RES-005 and NOT-003. Routes, deep links and access name no hub key: residents need `resident_portal` + `portal.use` (PORTAL-042 corrected from `core` in revision 4, with negative tests for a revoked `resident_portal`, another site's notice, a moved-out resident, a withdrawn notice and a deep link outside the audience); `residents.view` opens RES-005; the new `notices.publish` publishes. The notification service itself stays `core`. The D.3 Community home only links to notices. Counts on `e2ccd89`: 365 distinct, D.2 = 26. **Alternative (not recommended):** a minimal `resident_portal` Community shell in D.2 holding notices (PORTAL-036 moves to D.2, with PORTAL-023 as its state and its old route redirecting), with hub tabs added in D.3. Counts: 364 distinct, D.2 = 26, D.3 = 7 | Revision 3 accepted; PORTAL-042 to guard via `resident_portal` + `portal.use` with site and audience scope (done) | D.2 |

## C. Money, governance and legal

| # | Decision | Recommendation | GPT review | Blocks |
|---|---|---|---|---|
| **D-29** | Approval policies | No default amounts; versioned rules with maker-checker. **A draft never governs its own approval**: it is approved under the version in force by someone other than its creator, and cannot make its creator an approver of their own requests. Delegates never approve their own requests. **Revision 4:** the approval kinds C.1/C.2 already raise (billing runs, exemptions, opening balances, payer changes, collection accounts, payment exceptions) keep their fixed maker-checker and appear in the S.1 inbox; billing-run posting roles stay in BILL-016 | Draft policies must not grant approval to their creators | S.1 |
| **D-33** | Rentals legal model | **Configurable per management agreement, not assumed:** *agent* model (manager issues as agent into a client-money account with an owner sub-ledger) or *principal* model (owner's client legal entity issues into the owner's account). Both prototyped as labelled fictional alternatives. Legal and tax adviser chooses before Gate H. Deposits are liabilities in client or deposit accounts. Nothing reaches the SaaS company | Remains conditional; do not assume the manager issues | S.3 (invoice header) |
| **D-34** | Cashbook source of truth | **A derived view** over settled source events: confirmed payments, **posted cash vouchers** (approved, reversible, only for cash no other module owns; expense vouchers disabled when `payables` is granted) and **settlement confirmations**. One period lock per legal entity; idempotent by source and settlement leg. **Revision 4:** C.2 payments enter by their verification kind (`bank_matched` and `exception_approved` on the bank account; `counter` on the cash account until deposited) | Corrected as required | S.1 |
| **D-35** | Bulk collection, cash vs cheque | Method-specific. **Cash:** counted total = sum, second-person confirmation, recognised per D-46, each line within the site's office-cash maximum (a per-site setting since C.2). **Cheque:** "received" acknowledgement only; no payment, allocation or final receipt until cleared by a matched statement line (C.2 matching); returned cheques settle nothing; reversals after clearing reverse payment, allocation and receipt and reopen lines. A4 §5.3 to be aligned | Corrected as required | S.1 |
| **D-36** | Reminder defaults | In-app always; SMS/WhatsApp with consent; quiet hours 21:00–09:00; ≤ 3 a month; never when paid or a proof is pending (**revision 4:** any C.2 pending state, including awaiting bank evidence and exception pending); no late-fee wording unless enabled | — | S.1 |
| **D-37** | Credit and wallet | Show unapplied credit (shown to residents since C.2); allow paying in advance via transfer-and-verify under the C.2 settlement rules; **no funded wallet** | No funded wallet | S.1 |
| **D-42** | Transfer and clearance fees | A fee needs a bylaw reference and versioned rate; clearance needs a zero balance or approved waiver; an approved transfer raises an ordinary payer change (BILL-017); lawfulness reviewed before Gate H | — | S.1 |
| **D-46** | When confirmed office cash counts as received | **On second-person confirmation** (a receipt is issued then), with the later deposit settled by evidence as cash in transit. Alternative: only when the bank deposit settles (safer, but residents wait for receipts). **Revision 4, C.2 today:** a single office cash payment (FIN-007) issues a receipt at once within the site's maximum, counted by one person. That was accepted for the C.2 prototype, and witnessing was deferred to S.1. S.1 must decide whether single payments also need the second-person count | Allows site policy; GPT (Issue #4): do not apply settled-bank rules blindly to cash | S.1 |
| **D-48** | Settlement evidence in the prototype | **Revised in revision 4 to follow the C.2 closure ruling** (Issue #4: no settlement, Paid status or receipt without independent bank evidence). **No control settles anything without evidence.** For bank legs, the evidence is a line from a labelled fictional statement imported for the verified account, exactly as in C.2. It is matched by C.2's rules: a full match settles directly; a partial match needs an exception approved by a second person; one line settles one subject once. A demo helper may *generate* such a statement file, but never settles. For cash legs, the evidence is a witnessed deposit slip. This replaces revision 2's free "Simulated bank confirmation" control | No live rails in the UI-first phase. Revision 4 aligns with the C.2 closure | S.1, S.2, S.3 |

## D. Safety

| # | Decision | Recommendation | GPT review | Blocks |
|---|---|---|---|---|
| **D-26** | SOS | **Parked potential scope, not authorised work** (revision 3). SOS remains unavailable until safety approval. No UI of any kind (pages, overlays, global buttons), fixtures or contracts until a **separate, owner-approved safety design** exists and S.4 is separately authorised. The 3 SOS pages are counted only as parked scope (365 = 362 active + 3 parked) and belong to no D or S milestone. `safety` stays restricted in the catalogue. Emergency numbers are **verified and region-specific at implementation**; nothing implies live dispatch | Keep restricted; the three pages are parked potential scope, not authorised work | S.4 |

## E. Already decided (unchanged)

These rulings carry over into V3.2:
- Frontend first.
- No defaulter lists to residents.
- Never mark proofs as Paid.
- The association's money is never the SaaS company's.
- Maker-checker by principal.
- Configurable, versioned commercial policies.
- Mandatory personal accessibility preferences.
- Late fees off by default (D-11).
- Collection on behalf only with written authority (D-15).
- No merge to `main`.
- **From the C.2 review (Issue #4):**
  - no settlement on a reviewer's note alone;
  - statements are bound to a verified account, legal entity and source;
  - partial matches only through a second person's exception;
  - the office-cash limit is per-site configuration;
  - cash witnessing is formalised in S.1.
