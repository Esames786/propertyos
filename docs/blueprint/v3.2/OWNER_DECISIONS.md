# V3.2 proposal: decisions for the owner (revision 3)

**Status: NONE OF THESE DECISIONS IS APPROVED.**
- GPT's review (Issue #3) approved the product direction *in principle* and recommended directions; those are shown below.
- GPT's re-review of `3f018d0` accepted the revision-2 corrections and conditionally approved V3.2 as a **planning baseline only, not implementation authorisation**. Revision 3 adds D-49 and tightens D-25, D-26 and D-47.
- A decision becomes final only when the owner accepts it.
- No decision authorises backend work, changes to `main`, changes to the live register, or starting any milestone.

**How to read this**
- Numbering continues from Gate A (D-1 to D-20).
- Reply "approve", or name an alternative.
- **Blocks** says what cannot start until the decision is made.
- Nothing in V3.2 starts until D-21, D-23, D-24 and D-43 are settled **and** the milestone is separately authorised.

## A. Scope, modules, sequence and counting

| # | Decision | Recommendation | GPT review | Blocks |
|---|---|---|---|---|
| **D-21** | Four new catalogue modules: `community_chat`, `community_hub`, `safety` (**restricted**), `rentals` (27 → 31) | Approve. Alternative: fold chat and the hub into `communications` as features | Sensible; safety restricted | All new-module milestones |
| **D-22** | `hr` and `payroll` as separately licensed add-ons for community and portfolio (one edition-aware module) | Approve | Agrees; reuse the shared modules | S.2 |
| **D-23** | Order: C.2 finish → docs baseline review → D.1 → S.1 → D.2 → D.3 → S.2 → S.3 → safety design → S.4 → E/F/G → H, **each bounded and individually authorised** | Approve. Alternative: Issue #2's order with finance after all of Gate D | Agrees | D.1 |
| **D-24** | Split Gate D (49 distinct, provisional; D.1 15, D.2 26, D.3 8) into D.1, D.2 and D.3, with a checkpoint after each | Approve | Agrees | D.1 |
| **D-43** | Baseline and adoption | The official baseline is the **committed** register (C.1: 394/335). C.2 is now committed (`d5e599d`, 396/337) and awaits review. Regenerate the delta on it after that review (informational today: 365 distinct). Adopt only each authorised milestone's rows; never change the live register before that | Agrees; final count to be recomputed on the C.2 commit | Register sync |
| **D-44** | Prices for the new add-ons | Supreme Admin sets rate-card components in HQ; no prices proposed | — | Commercial demos |
| **D-45** *(new)* | Overlay counting rule for the **existing** register. V3.2 counts overlays without their own route as states (SOS-004, PORTAL-033, GLOBAL-015, PORTAL-040). The live register still counts GLOBAL-013 and the GUIDE tour overlays as screens | Align the existing rows the same way in a separate, owner-approved register change after C.2, or document why tours count. No change in this proposal | Requested consistency | Final totals |

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
| **D-49** *(new, revision 3)* | Official notices without `community_hub` | **PORTAL-023 stays the canonical resident notices page**, delivered in **D.2** with notice detail (PORTAL-043, `/customer/portal/community-notices/:id`), the resident notifications panel (PORTAL-042), RES-005 and NOT-003. Routes, deep links and access (`resident_portal` + `portal.use`; `residents.view` to open RES-005; new `notices.publish` to publish) name no hub key. The D.3 Community home only links to notices. Counts: 363 distinct, D.2 = 26. **Alternative:** a minimal `resident_portal` Community shell in D.2 holding notices (PORTAL-036 moves to D.2, with PORTAL-023 as its state and its old route redirecting), with hub tabs added in D.3. Counts: 362 distinct, D.2 = 26, D.3 = 7. The recommendation keeps notice routes stable whatever happens to Community home | Required: notices must not depend on the hub; either design acceptable | D.2 |

## C. Money, governance and legal

| # | Decision | Recommendation | GPT review | Blocks |
|---|---|---|---|---|
| **D-29** | Approval policies | No default amounts; versioned rules with maker-checker. **A draft never governs its own approval**: it is approved under the version in force by someone other than its creator, and cannot make its creator an approver of their own requests. Delegates never approve their own requests | Draft policies must not grant approval to their creators | S.1 |
| **D-33** | Rentals legal model | **Configurable per management agreement, not assumed:** *agent* model (manager issues as agent into a client-money account with an owner sub-ledger) or *principal* model (owner's client legal entity issues into the owner's account). Both prototyped as labelled fictional alternatives. Legal and tax adviser chooses before Gate H. Deposits are liabilities in client or deposit accounts. Nothing reaches the SaaS company | Remains conditional; do not assume the manager issues | S.3 (invoice header) |
| **D-34** | Cashbook source of truth | **A derived view** over settled source events: confirmed payments, **posted cash vouchers** (approved, reversible, only for cash no other module owns; expense vouchers disabled when `payables` is granted) and **settlement confirmations**. One period lock per legal entity; idempotent by source and settlement leg | Corrected as required | S.1 |
| **D-35** | Bulk collection, cash vs cheque | Method-specific. **Cash:** counted total = sum, second-person confirmation, recognised per D-46. **Cheque:** "received" acknowledgement only; no payment, allocation or final receipt until cleared; returned cheques settle nothing; reversals after clearing reverse payment, allocation and receipt and reopen lines. A4 §5.3 to be aligned | Corrected as required | S.1 |
| **D-36** | Reminder defaults | In-app always; SMS/WhatsApp with consent; quiet hours 21:00–09:00; ≤ 3 a month; never when paid or a proof is pending; no late-fee wording unless enabled | — | S.1 |
| **D-37** | Credit and wallet | Show unapplied credit; allow paying in advance via transfer-and-verify; **no funded wallet** | No funded wallet | S.1 |
| **D-42** | Transfer and clearance fees | A fee needs a bylaw reference and versioned rate; clearance needs a zero balance or approved waiver; lawfulness reviewed before Gate H | — | S.1 |
| **D-46** *(new)* | When confirmed office cash counts as received | **On second-person confirmation** (a receipt is issued then), with the later deposit settled by evidence as cash in transit. Alternative: only when the bank deposit settles (safer, but residents wait for receipts) | Allows site policy | S.1 |
| **D-48** *(new)* | Settlement evidence in the prototype | Allow a **visible demo control** that creates a "Simulated bank confirmation" (never automatic, always labelled) so flows can be shown end to end without live rails | No live rails in UI-first phase | S.1, S.2, S.3 |

## D. Safety

| # | Decision | Recommendation | GPT review | Blocks |
|---|---|---|---|---|
| **D-26** | SOS | **Parked potential scope, not authorised work** (revision 3). SOS remains unavailable until safety approval. No UI of any kind (pages, overlays, global buttons), fixtures or contracts until a **separate, owner-approved safety design** exists and S.4 is separately authorised. The 3 SOS pages are counted only as parked scope (363 = 360 active + 3 parked) and belong to no D or S milestone. `safety` stays restricted in the catalogue. Emergency numbers are **verified and region-specific at implementation**; nothing implies live dispatch | Keep restricted; the three pages are parked potential scope, not authorised work | S.4 |

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
