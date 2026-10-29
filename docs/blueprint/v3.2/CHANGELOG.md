# V3.2 proposal: changelog

## Revision 4: final documentation reconciliation on the committed C.2 register (`e2ccd89`)

**Status:** documentation only. This revision follows two reviews:
- GPT's re-review of `eba5cec` (Issue #3), which accepted revision 3 with one access-mapping fix;
- GPT's approval of the C.2 closure `e2ccd89` (Issue #4).

**What is and is not approved**
- **Not approved:** decisions D-21 to D-49. Five of them (D-21, D-23, D-24, D-43, D-49) are now ready to ratify.
- **Ratifying them approves documentation only.** D.1 still needs its own authorisation.
- **Unchanged:**
  - the live register;
  - the C.2 branch (`e2ccd89`);
  - `main` (`d9a420c`);
  - all code.

### Counts

| Measure | Revision 3 (C.1 base) | Revision 3 replayed on `e2ccd89` | **Revision 4 (final)** |
|---|---:|---:|---:|
| Baseline rows / distinct | 394 / 335 | 396 / 337 | **396 / 337** |
| Delta operations | 108 | 108 | **112** |
| ADD / ADD-STATE / MODIFY / SUPERSEDE | 28 / 31 / 49 / 0 | 28 / 31 / 49 / 0 | **28 / 31 / 53 / 0** |
| Rows after the delta | 453 | 455 | **455** |
| Distinct after the delta | 363 (360 + 3 parked) | 365 (362 + 3 parked) | **365 (362 + 3 parked)** |
| Built, B and C | 89 | 91 | **91** |
| D (D.1 / D.2 / D.3) | 49 (15 / 26 / 8) | 49 | **49 (15 / 26 / 8)** |
| S active (S.1 / S.2 / S.3) + parked | 40 + 3 | 40 + 3 | **40 (15 / 17 / 8) + 3** |
| E / F / G | 117 / 18 / 47 | 117 / 18 / 47 | **117 / 18 / 47** |
| Status of distinct screens (BUILT / PARTIAL / PLANNED) | 62 / 18 / 283 | 67 / 30 / 268 | **67 / 30 / 268** |

**Why there are 4 more MODIFY rows.** They reconcile C.2 overlaps: BILL-012, BANK-004, BILL-016 and BILL-017. They change no count.

**How the counts were checked.** An independent verifier recomputed every count and checked the whole register. Planted defects were all caught. See [`SCREEN_COUNT_RECONCILIATION.md`](SCREEN_COUNT_RECONCILIATION.md).

### `SCREEN_REGISTER_DELTA.csv`: exactly what changed

- **Every non-parked row:**
  - `delta_status` now reads "PROPOSED (baseline: committed C.2 register e2ccd89, 396 rows / 337 distinct; adopted only when its milestone is authorised, D-43)";
  - the 6 parked SOS rows keep their PARKED status.
- **Every MODIFY row:** `changed_fields` is rebuilt against the `e2ccd89` values. Fields equal to the committed value are dropped.
- **39 rows changed in content:**

| Row | Fields | Why |
|---|---|---|
| PORTAL-042 | module, feature_grant, min_permission, data_scope, validation, states, tests, notes | **GPT fix.** `core` + `portal.use` → `resident_portal` + `portal.use`, with verified-link, site and audience scope re-checked on read and open; negative tests (revoked `resident_portal`, another site, moved out, withdrawn, deep link outside the audience); the notification service stays `core` |
| PORTAL-043, PORTAL-023 | data_scope (043), validation, tests | Same guard and negative tests as PORTAL-042 |
| PORTAL-031, -032 | module, feature_grant, notes | Rule R: `community_chat` → `resident_portal`; `community_chat` becomes the site grant checked second |
| PORTAL-033 (parked) | module, feature_grant, notes | Rule R (`safety` second); still parked |
| PORTAL-034, -035 | module, feature_grant, notes | Rule R (`maintenance.community_issues` second) |
| PORTAL-037 | module, feature_grant, notes | Rule R (`rentals` second) |
| PORTAL-038, -039 | module, feature_grant, notes | Rule R (`community_hub.marketplace` / `.polls` second) |
| PORTAL-040 | module, feature_grant, notes | Rule R (`visitors.live_queue` second); missing full stop fixed |
| PORTAL-041 | module, feature_grant, data_scope, notes | Rule R: was `core` + `portal.use`, the PORTAL-042 defect |
| PORTAL-036 | notes | Hub tabs also need `community_hub` for the resident's site |
| FIN-007 | min_permission, gate, notes | C.2 built single office cash. Permission aligned to the contract (`payment.receive` + `receivables.office_collections`). Gate "C (built part: office cash); S.1 (cheques; cash witnessing per D-46)" |
| BILL-012 (**new MODIFY**) | gate | Society cheque rules move from "Gate E" to S.1. Status stays BUILT for C.2's scope and is reassessed at adoption |
| BANK-004 (**new MODIFY**) | gate | S.1 settles cheques, deposits and transfer legs with C.2's matching |
| BANK-001 | linked_records, validation | Receiving accounts are BILL-010's verified beneficiaries, never copies |
| BANK-002 | linked_records, notes | Reuses C.2's account-bound statement lines and reconciliation |
| BANK-006 | notes | Settlement evidence per C.2 (replaces "visibly simulated-cleared demo event") |
| BANK-007 | validation | C.2 payment verification kinds decide the account a receipt counts on |
| BANK-008 | notes | The close checklist lists C.2's pending proof states and links BANK-004, FIN-008 and BILL-008 |
| BANK-009, OWN-006 | notes | Numbered with the issuing entity's BILL-016 pattern |
| FIN-013 | min_permission, linked_records, validation | `payment.receive` (with the feature); each cash line within the site's office-cash maximum; cheques cleared only by C.2 matching |
| COL-007 | validation | Reminders skipped for every C.2 pending proof state; needs-information gets the information request |
| FIN-011 | notes | C.2 built unapplied credit; S.1 adds advance payments verified under C.2's rules |
| PORTAL-004 | tabs, gate, notes | Credit display exists since C.2; S.1 adds "paid in advance"; gate "built; C extends; S.1 and S.3 extend" |
| OWN-004 | linked_records, validation; tenant_edition dropped | An approved transfer raises a BILL-017 payer change; no-op `tenant_edition` removed |
| OWN-003 | tenant_edition dropped | No-op removed |
| BILL-017 (**new MODIFY**) | gate, linked_records | Transfer-sourced payer changes in S.1; status stays BUILT |
| BILL-016 (**new MODIFY**) | gate, actions | S.1 document kinds (clearance certificate, cash voucher, office collection batch); status stays BUILT |
| APR-001 | linked_records, notes | The S.1 inbox also lists the C.1/C.2 approval kinds from the dashboard (HOME-001) |
| APR-004 | notes | Billing-run posting roles stay in BILL-016 |
| PORTAL-030 | notes | Reuses C.2's first-run text-size step; stays PLANNED |
| RNT-001, -002, -005, -006 | notes (and actions, mock_api on RNT-006) | Payout settlement on a matched statement line of the paying client-money account (D-48) |

### Other files

| File | Changes |
|---|---|
| **`SCREEN_COUNT_RECONCILIATION.md`** (new) | Covers: baseline integrity (git and GitHub copies identical); what C.2 changed; delta operations; counts by gate and milestone; built screens each milestone extends; findings F-1 to F-7 with the C.2 overlap table; validation of the whole register (14 checks); pre-existing register observations |
| `OWNER_DECISIONS.md` | **New §0:** final recommended resolutions for D-21, D-23, D-24, D-43 and D-49 (ready to ratify; documentation only); the decisions that stay conditional, by review type; the owner's product choices. **D-48 revised** to the C.2 closure ruling (no settlement without a statement line; a demo helper may only generate a sample statement). **Notes added:** D-29, D-34, D-35, D-36, D-37, D-42, D-46 (C.2 single office cash). **D-26 and D-49** counts updated to `e2ccd89`. **§E** adds the C.2 review rulings |
| `MODULE_AND_LICENSING_MATRIX.md` | **Rule R** (§2). **§5.1:** the C.2 permissions V3.2 reuses, with holders at `e2ccd89`. **§5.2 permission changes:** `settlement.confirm` withdrawn (C.2's `bank.reconcile` matches); `settlement_exception.approve` added for outgoing legs; the accounts officer is noted as Al-Noor's own role, not a starter. **§2:** integrates column for `communications` and `reports` aligned to the committed catalogue. **§6:** two dependency checks (resident-facing add-on without `resident_portal` on the site; bulk collection without office collections) |
| `FRONTEND_ONLY_EXECUTION_PLAN.md` | **Baseline and counts:** `e2ccd89`; C.2 closed; the gate table is now before/after. **Definition of done:** rule R and "no settlement without evidence" added; wording tests use C.2's sample-statement labels instead of "Simulated bank confirmation". **D.1:** the extended PORTAL-027 and C.2 text-size step, plus two checks. **S.1:** the C.2 screens it extends, and a reference experience and golden vectors on C.2 matching. **D.2:** the PORTAL-042/043/023 negatives and rule R checks. **D.3 and S.3:** rule R checks. **Test assets:** `resident-access.vectors.json` |
| `PRODUCT_SCOPE_EXPANSION.md` | **Opening sections:** revision 4 note; the package table; the baseline; rule 5 (no settlement without evidence); the register effect. **Rule R:** F01, F02 and F04. **Settlement and permissions:** F07, F09, F10 and F11 (`bank.reconcile`, exceptions, `payment.receive`, C.2 today, A4 re-check). **Other features:** F13 pending states; the F15 PORTAL-042 guard, with the undefined `hub.manage` removed; F20 BILL-017 and BILL-016; F21 credit already shown since C.2. **Controls and risks:** §5 adds two controls; §6 updates R-20 and R-37 and adds R-43 to R-45 |
| `ERD_PROPOSED_CHANGES.md` | **Revision 4 note.** **Settlement confirmations:** the evidence is a statement line or a witnessed slip, `simulated_demo` is withdrawn, and the C.2 matching rules apply. **§2.8 and §1:** C.2 entities marked REUSED; the A4 alignment re-checked on `e2ccd89`. **Clearance certificates:** numbering via BILL-016, and the payer change via BILL-017. **Invariants:** I-28 uses statement-line identity; I-37 (rule R) and I-38 (no settlement without evidence) added. Table counts unchanged |

### Still open

1. **Ratification.** The owner ratifies, or amends, D-21, D-23, D-24, D-43 and D-49. This is documentation approval only.
2. **D.1.** A separate, explicit authorisation is needed before any D.1 work. Only then are D.1's delta rows adopted into the live register.
3. **Conditional decisions** (specialist review):
   - financial: D-34, D-35, D-37, D-42, D-46, D-48;
   - legal and tax: D-33, D-42, D-30, chat retention;
   - privacy: D-25, D-27, D-38, D-39, D-40, D-47;
   - safety: D-26.
4. **New in revision 4, for review:**
   - rule R (part of D-21);
   - `settlement_exception.approve`;
   - the withdrawal of `settlement.confirm`;
   - the four C.2 MODIFY rows.
5. **Live-register hygiene, outside this branch** (`SCREEN_COUNT_RECONCILIATION.md` §8):
   - C.2's resident text size is not recorded on PORTAL-027 and PORTAL-030;
   - register permission names are not yet in the contract;
   - SITE-006 lists `unit.view`;
   - GPT's minor `MANUAL_VERIFICATION.md` D3 wording on the C.2 branch.
6. **Logical model.** An architecture review before Gate H (unchanged).

### Next

1. GPT and the owner review revision 4.
2. The owner ratifies the five decisions, or amends them.
3. The owner decides whether, and when, to authorise D.1.

## Revision 3: amendment after GPT's re-review of `3f018d0` (Issue #3)

**Status:** documentation only.
- **GPT's re-review:** it accepted all the original Issue #3 corrections and conditionally approved V3.2 as a **planning baseline, not implementation authorisation**.
- **Not approved:** decisions D-21 to D-49.
- **Unchanged:** the live screen register, `main`, the C.2 branch and all code.

| Item | Change | Where |
|---|---|---|
| **Official notices are independent of `community_hub`** | **The problem.** Revision 2 folded PORTAL-023 into the D.3 Community home, which made notices wait for D.3 and sit on a page that hosts optional hub tabs. **The fix.** PORTAL-023 stays the **canonical** notices page, delivered in **D.2**. The complete journey is in D.2: RES-005 / NOT-003 compose → PORTAL-042 resident notification (new state of the resident home) → PORTAL-043 notice detail (new state, `/customer/portal/community-notices/:id`). Routes, deep links and access are unchanged. No hub key or permission is on the path; the only new permission is `notices.publish` (`communications`). Community home (D.3) only links to notices. The alternative design is recorded in D-49 | Delta CSV (PORTAL-023, -036, -042, -043, RES-005, NOT-003); Scope F15; Plan D.2/D.3; Matrix §2, §5, §6, §8; ERD §2.13, I-36; D-49 |
| **Audience rules shared** | `chat_audience_rules` becomes the shared core `audience_rules`. Notices, polls and chat no longer depend on each other's licence (polls previously reused the chat add-on's entity). Table counts unchanged | ERD §1, §2.1, §2.11 |
| **Offline chat revocation** | The server revokes access, queued deliveries and notifications at once. A downloaded copy on a disconnected device is removed only when it next connects, and messages written offline are rejected then. Immediate remote deletion is never promised | Scope F01; ERD §2.1, I-24; CSV CHAT-001, PORTAL-031; D-25; Plan D.3 |
| **Privacy threshold vs differencing** | Fixed groupings for residents (no free filters or date ranges); a complement check across shown counts; scheduled snapshots instead of live tallies; poll results after close; differencing test vectors | Scope F04, F15, §5; ERD §2.4, §2.9, I-23; CSV MNT-012, PORTAL-034, CMTY-002; D-47; Plan D.2/D.3 |
| **SOS** | Restated as **parked potential scope, not authorised work**, unavailable until safety approval. SOS rows carry a `PARKED` delta status. Totals show active and parked scope separately | Scope §2, F02; Plan §1, §3; CSV; D-26 |
| **C.2 status** | C.2 is now committed (`d5e599d`) and awaits review. The official baseline stays C.1 until that review; the C.2 figures are informational | All files; D-43 |
| **Wording fix** | A leftover "national numbers" in the F02 tests now reads "verified local emergency numbers" | Scope F02 |

**Revised counts (provisional)**

| Measure | Revision 2 | Revision 3 |
|---|---|---|
| Delta rows | 106: 28 ADD, 29 ADD-STATE, 48 MODIFY, 1 SUPERSEDE | **108: 28 ADD, 31 ADD-STATE, 49 MODIFY, 0 SUPERSEDE** |
| Distinct screens (C.1 base 335) | 362 | **363** (360 active + 3 parked SOS) |
| Rows (C.1 base 394) | 451 | **453** |
| Informational, on C.2 `d5e599d` (337 / 396) | 364 | **365** distinct / 455 rows |
| Gate D / S / E / G | 48 / 43 / 117 / 47 | **49** / 43 (40 + 3 parked) / 117 / 47 |
| D.1 / D.2 / D.3 | 15 / 25 / 8 | 15 / **26** / 8 |
| Logical tables | 38 NEW + 8 FORMALISED + 3 PARKED | Unchanged (a rename only; notices reuse A2 entities) |

**Still open:** the revision-2 list below, plus **D-49** (keep PORTAL-023 canonical, or use a minimal Community shell in D.2).

**Next:**
1. The owner and GPT review this amendment.
2. The owner approves D-21, D-23, D-24 and D-43.
3. After the C.2 review, the delta is regenerated on the C.2 register.
4. Each milestone is authorised separately.

## Revision 2: answers the GPT architecture review (Issue #3)

**Status:** documentation only and still a PROPOSAL.
- **Not approved:** decisions D-21 to D-48.
- **Unchanged:** the live screen register, `main`, the C.2 branch, and all code.

### What changed, by finding

| Finding | Change | Where |
|---|---|---|
| **P0-1 Cashbook source of truth** | **Before:** `cash_movements` (a projection that also took manual entries). **Now:** the cashbook is a **derived view** over settled source events. Cash that no other module owns goes through **approved, reversible cash vouchers** (maker-checker, evidence, immutable once posted). One period lock per legal entity. Idempotent by source and settlement leg. Behaviour documented with `accounting`/`payables` on and off | ERD §2.8; Scope F10; D-34 |
| **P0-2 Instruction vs settlement** | Owner payouts, transfers, deposits, payroll disbursements and deposit refunds are **instructions**. Only a `settlement_confirmation` changes settled cash or the owner payable. Evidence: a matched bank line, a witnessed deposit slip, or a visibly labelled simulated demo event. Cash in transit is shown separately | ERD §2.7–2.8; Scope F07, F09, F10; D-48 |
| **P0-3 Cheques** | Method-specific states. **Confirmed cash** is recognised per site policy (D-46). **An uncleared cheque** creates no payment, allocation or final receipt. Returned cheques and reversals after clearing are covered. Conflict with A4 §5.3 recorded (R-37) | ERD §2.8; Scope F11; D-35 |
| **P0-4 Screen counting** | Four overlays without their own route are now states: SOS-004 → SOS-001; PORTAL-033 → PORTAL-001; GLOBAL-015 → GLOBAL-008; PORTAL-040 → PORTAL-015. The existing register's own overlay inconsistency is flagged (D-45) | Delta CSV; Scope §2 |
| **P0-5 Baseline** | The official baseline is the committed C.1 register (394/335). 396/337 is labelled uncommitted C.2. Every delta row is marked `PROVISIONAL` | All files; D-43 |
| **P1-6 Model deduplication** | **63 tenant + 1 central → 38 NEW + 8 FORMALISED (+3 PARKED).** Each entity is classed NEW, FORMALISED, EXTENDED, REUSED or VIEW, with its owner module. The model is labelled conceptual, for architecture review | ERD §1 |
| **P1-7 Rentals legal entities** | The issuing model is configurable per management agreement (agent with a client-money account and owner sub-ledger, or principal with the owner's client entity). Both are labelled alternatives pending D-33. Deposits are liabilities in client or deposit accounts | ERD §2.7; Scope F08–F09; D-33 |
| **P1-8 Chat privacy** | On membership end, revoke access including cached/offline copies, queued messages and notifications. Moderation only via reports. Retention is legally configurable with exceptions and notice; no presumed period | ERD §2.1; Scope F01; D-25 |
| **P1-9 Governance and exports** | **Exports:** never exceed the requester's own access; approval only narrows. **Approval policies:** drafts cannot approve themselves or their creators' requests. **Counts:** a small-audience privacy threshold for affected counts and polls | ERD §2.5, §2.11; Scope F04, F05, F15, F18; D-29, D-40, D-47 |
| **P1-10 SOS** | No UI of any kind (including global controls) before a separate safety design and authorisation. Emergency numbers are no longer named: they are verified and region-specific at implementation | Scope F02; Plan §3; D-26 |
| **P1-11 Unverified Nizam features** | Chat groups ("as described"), the SOS action, the gateway and the wallet card are marked UNVERIFIED or *inferred* | NIZAM_FEATURES_AND_GAPS.md |

### Revised counts (provisional)

| Measure | Revision 1 | Revision 2 |
|---|---|---|
| Baseline | 396 / 337 (uncommitted C.2) | **394 / 335 (committed C.1)**; C.2 figures informational |
| New distinct screens | 32 | **28** (3 SOS pages parked) |
| New state rows | 25 | **29** |
| Modified / superseded rows | 48 / 1 | 48 / 1 |
| Distinct screens after the delta | 368 | **362** (C.1 base); 364 on the uncommitted C.2 tree |
| Rows after the delta | 453 | **451** (C.1 base) |
| Gate D / S / E / G | 50 / 45 / 117 / 47 | **48 / 43 / 117 / 47** |
| Milestones D.1 / S.1 / D.2 / D.3 / S.2 / S.3 / S.4 | 16 / 15 / 26 / 8 / 17 / 8 / 5 | **15 / 15 / 25 / 8 / 17 / 8 / 3 (parked)** |
| Logical tables | 63 tenant + 1 central | **38 NEW + 8 FORMALISED + 3 PARKED** |
| Owner decisions | D-21 to D-44 | **D-21 to D-48** (new: D-45 overlay counting, D-46 cash recognition, D-47 privacy threshold, D-48 simulated settlement) |

### Still open for the owner

1. Approve or amend D-21, D-23, D-24 and D-43. Nothing starts without them, and each milestone still needs its own authorisation.
2. **D-33.** The rentals issuing model and client-money handling (legal and tax adviser).
3. **D-45.** Whether to align the existing register's overlays (GLOBAL-013, GUIDE tours) with the state rule.
4. **D-46.** Recognise confirmed office cash on confirmation, or only on deposit settlement.
5. **D-47.** Privacy threshold values.
6. **D-31.** Build the marketplace in D.3, or defer it.
7. **D-26.** Who writes and approves the SOS safety design.
8. An architecture review of the logical model (38 + 8 tables) before any Gate H physical design.

### Next steps (not started)

1. C.2 is committed and reviewed (primary session).
2. The delta is regenerated on the committed C.2 register.
3. The owner gives decisions.
4. The first milestone is authorised, separately.

## Revision 1 (commit `3ba6e32`)

The initial seven-file package: scope, matrix, ERD, register delta, plan, decisions and the privacy-safe Nizam reference.
