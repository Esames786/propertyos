# V3.2 proposal: changelog

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
