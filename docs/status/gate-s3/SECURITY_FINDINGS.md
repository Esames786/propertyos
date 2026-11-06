# Gate S.3 security findings

Applied from the start (lessons of Issues #12, #14, #16 and the Issue #18 brief) and checked by API tests that compare the stored records before and after every refusal.

## Controls

| # | Risk | Control | Proof |
|---|---|---|---|
| S1 | Id oracle: a Heights lease, owner, statement or payout probed by a Court-only reader | Out-of-scope ids answer exactly like ids never issued (same status, code and message); field ids (unit, owner) give the same field problem | API "a Heights lease answers exactly like an id never issued", "the field problem is the same", owner statement issue, payout approve |
| S2 | Acting on multi-site facts with partial authority | Owner-wide records (agreements, statements, payouts) need every site of the owner; the rent roll needs every rentals site | API scope suite; mutation M7 killed |
| S3 | Hidden data leaking through nested fields | Limited readers: lines and totals over their sites, roll and statement history without values or notes, agreement notes and other sites' bound leases dropped, whole-owner money and instructions withheld | API scope suite (history `values` undefined, notes undefined, bound leases) |
| S4 | Idempotency key replay with another request, person, target or operation | Entry binds operation, principal, target and a normalised fingerprint; replay only of the same request after authority checks, re-read through the scoped lookup; otherwise `409 idempotency_conflict`, no change | API idempotency (4 cases, incl. lost scope); mutation M8 killed |
| S5 | Self-approval | Lease activation, roll approval, payout approval and agreement-version approval each refuse the maker (by principal) | API; mutations M3, M4, M5 killed |
| S6 | Conflict of interest | A member of staff who is one of the owner's own people cannot activate the owner's lease or approve their payout | API (test identities) |
| S7 | Fake money states | No posting, settlement, payment, evidence, send or deposit-receipt route; posting refuses with no change; every amount "Not settled — no evidence"; wording check finds no "paid/sent/received/collected" outside negations | API "no … route" (9 paths 404), posting refused; e2e wording check; mutation M6 killed |
| S8 | Payout above settled money; approved instruction treated as paid | Prepare ≤ settled closing − pending; re-checked at approval; approval changes neither payable nor statement closing | Vectors; API injected source; mutations M1, M12 killed |
| S9 | Deposits as owner money; principal-model owner money held by the manager | Deposits memo-only liabilities; principal closing 0 | Vectors; API statement; mutations M2, M11 killed |
| S10 | Rule R bypass in the landlord view | Verified link in force, landlord role in the owner register, portal and rentals for the same site; lessee, unverified claim, sold flat, unlicensed site and other landlord refused; suspended or withdrawn organisation refused at the transport | API Rule R suite; mutations M9, M10 killed |
| S11 | Bank detail exposure (Issue #18) | No raw bank line, reference or IBAN exists in rentals; accounts masked to 4 characters; an owner's payout account only for payout preparers and approvers | API "masked bank details…" |
| S12 | Training-mode writes into official records | Every rentals change refused in training mode | API training test |
| S13 | Rent mixed with society dues or payroll | Rent has its own billing kind and per-lease payer account (kind lease); Al-Noor has no rentals; Riverbend has no payroll | API isolation; roll line checks |
| S14 | Backdated policy rewriting history | Agreement versions take effect today or later; leases keep the versions they were bound to; issued statements are frozen | API renewal binding, statement freeze |

## Known gaps (not defects of this gate)

- **G1 Settlement subject.** The S.1/C.2 reconciler has no lease or payout subject; until it has one bound to a verified client-money account, owner, legal entity and one statement line (with a second-person exception path and reversal), rent, deposits and payouts cannot be settled. The `settled` store has no writer; API tests inject into it to exercise the instruction rules.
- **G2 Client-side mock.** The whole mock server runs in the browser: anyone can edit their own local demo storage. This is the prototype's accepted model (no backend), not a control.
- **G3 Statement issue permission** is `owner_statement.view` (register); a separate issue permission is an owner decision (R4).
