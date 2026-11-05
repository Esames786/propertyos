# Gate E (Developer ERP): open decisions for the owner

**Status: NONE OF THESE DECISIONS IS APPROVED.** They are questions raised while planning Gate E ([`GATE_E_PLAN.md`](GATE_E_PLAN.md)).
- Each has a **proposed fail-closed default**: what the build would do if the owner says "approve", chosen so that nothing is shown as paid, settled, posted, owned or visible without evidence and authority.
- Approving a default approves that behaviour for the prototype only. It does not authorise Gate E, any slice, backend work, a register change or a merge to `main`.
- Decisions marked **financial**, **legal** or **privacy** follow V3.2's practice (`OWNER_DECISIONS.md` §0.2): the default lets the prototype proceed fail-closed, and a specialist review stays open before Gate H.
- Earlier rulings this file relies on, not re-opened here: the V3.2 approvals of D-21, D-23, D-24, D-43 and D-49 (`docs/status/gate-d1/GATE_D1_REPORT.md` line 4); the C.2 closure ruling (no settlement, Paid or receipt without independent bank evidence; V3.2 D-48 aligned to it); CP1 (commercial values are illustrative, configured and versioned; Rs 0 lines visible in detailed quotes); CP2 (fail-closed transport, site entitlements, party wording "Customers & Buyers" for developers).

**How to answer.** "Approve E-nn", "approve all defaults in group X", or name an alternative.

## Summary

| # | Decision | Proposed default (short) | Review | Blocks |
|---|---|---|---|---|
| **A. Authorisation, base and process** |||||
| E-01 | How Gate E is authorised and reviewed | Per wave; each wave stops for review | owner | everything |
| E-02 | Which commit Gate E starts from | The integrated head of the accepted S.2b closure (Issue #16) and S.3 | owner | E.0 |
| E-32 | Full-regression cadence | Full combined run (twice, retries off) per wave; targeted runs per slice | owner | evidence |
| E-34 | Register shape | No rows added, merged or split; counts stay as they are | owner | adoption |
| **B. Data model and fixtures** |||||
| E-03 | How developers reuse the C.1–S.2b money engines | Adapter over the pure functions; `SocietyState` untouched | owner | E.0, E.6, E.7, E.8 |
| E-04 | Seeded "paid" developer history | Regenerate through the evidence path; until then label it imported history and keep it out of evidenced totals | financial | E.6 |
| E-08 | A second legal entity for isolation tests | Test-only fixture; demo ids unchanged | owner | E.0, E.7, E.8 |
| E-09 | SITE structure screens for developer projects | Make SITE-001…006 edition-aware; grant `site.view` through Larkspur's own role changes | owner | E.2 |
| E-10 | Unit status model | Add inventory, delivery and occupancy dimensions; derive the legacy status | owner | E.2 |
| E-37 | Data owned by Gate G administration screens | Seed legal entities, cost centres, numbering and finance settings read-only | owner | E.0 |
| **C. Access, roles and privacy** |||||
| E-05 | Meaning of "project + assigned" in CRM | Salespeople see what is assigned to them in their projects; managers see the project | owner, privacy | E.1 |
| E-06 | Who holds maker and checker roles | Larkspur's own role changes and new fictional personas; starter sets unchanged | owner | E.0 |
| E-07 | Permission names | Add the register's names plus explicit write/approve permissions, each mapped to its module | owner | E.0 |
| E-26 | Identity (KYC) data | Masked; reveal audited and permissioned; verify by a second person | privacy, legal | E.5 |
| E-27 | Approvals for every edition and developer subjects | Open APR-001…005 to all editions; add the listed subjects; role-based approvers | owner | E.0 |
| E-28 | Record ids vs access-outcome pages | Ids out of scope = identical 404; routes without ids keep Gate B outcome pages | owner, privacy | E.0 |
| E-29 | S.1's unbound idempotency | Move S.1 to the shared bound helper in E.0, S.1 vectors unchanged | owner (touches accepted S.1) | E.0, E.7 |
| E-35 | Recent records and favourites | Browser-local, partitioned per tenant, app and principal; re-checked on display; cleared on sign-out and switch | privacy | E.13 |
| E-36 | Developer buyer portal screens | Include the developer edition of PORTAL-002/003/005/028/029 in Gate E | owner | E.6 |
| **D. Sales and commercial** |||||
| E-11 | Hold policy | One active hold per unit; illustrative 48 h; no extension without approval; release by holder or override with reason | owner | E.4 |
| E-12 | When a reservation is confirmed | Only when the token is evidenced; otherwise "Reserved — token not verified" | financial | E.4 |
| E-13 | Booking confirmation prerequisites | Approval by another person, KYC verified for every buyer, down payment evidenced | owner, financial | E.5 |
| E-14 | Cancellation and refund policy | No automatic forfeiture; a proposal under a versioned policy reference, approved by another person; refund settled only on evidence | legal, financial | E.5, E.6 |
| E-19 | Cheques and post-dated cheques | S.1 cheque rules; PDCs listed as "received — not a receipt of payment" until cleared | financial | E.6 |
| E-25 | When ownership starts | Only at completed handover or a registered transfer; booking holders are buyers, not owners | legal | E.5, E.11 |
| E-30 | Payment-plan rounding and schedule rules | Instalments rounded down to the paisa, remainder on the last instalment; sum checked exactly | financial | E.3 |
| **E. Money, accounting and evidence** |||||
| E-15 | Revenue recognition | None in the prototype; instalments post to a contract-liability account; profitability labelled "management view" | financial (adviser) | E.7, E.12 |
| E-16 | Chart of accounts | Illustrative, labelled, versioned per entity; changes by draft → approval | financial | E.7 |
| E-17 | Automatic posting | Source events create proposed journals; posting by someone other than the maker; cash lines only from confirmed payments or settlement confirmations | financial | E.7, E.8, E.14 |
| E-18 | Outgoing payment settlement (supplier payments, refunds, reimbursements, payroll) | Reuse S.3's accepted payout settlement; until then instructions only, "Not settled — no evidence", screens PARTIAL | financial | E.6, E.8, E.14 |
| E-20 | Construction-linked instalments | Due only after a milestone certification approved by a second person with an evidence document | financial, legal | E.3, E.10 |
| E-22 | Handover finance clearance | Every instalment due up to and including possession paid by evidence, or an approved waiver | financial | E.11 |
| E-31 | Procurement matching tolerances | Zero tolerance; any mismatch needs a second person's exception; lowest quote not auto-selected | owner, financial | E.9 |
| **F. Delivery and operations** |||||
| E-21 | Construction updates published to buyers | Approval by another person; audience = verified buyers in force; withdrawal leaves a tombstone | owner, privacy | E.10 |
| E-23 | Snags | Handover-owned records, not maintenance work orders | owner | E.11 |
| E-24 | Resident operations for developer buildings after handover | Not in Gate E; RPT-017 shows maintenance data only where an operations site exists | owner | E.12 |
| E-33 | Developer HR and payroll specifics | In Gate E after E.7 and the accepted S.2b closure; payroll posting stays proposed | owner | E.14 |

---

## A. Authorisation, base and process

### E-01 How Gate E is authorised and reviewed
- **Question.** Is Gate E authorised as one milestone (117 screens plus 62 edition extensions), or wave by wave?
- **Why it matters.** D-23 makes every milestone individually authorised with a stop for review. The owner has also asked for speed: finish a whole milestone, then review (2026-11-01). Gate E is about five times the size of S.1.
- **Options.** (a) One authorisation, internal wave checkpoints without stopping, one final review. (b) Authorise and review each wave (§7.2 of the plan). (c) Authorise E.0 and wave 1 first, then decide.
- **Proposed default (fail-closed).** (b): each wave is authorised separately and stops for GPT and owner review. Nothing starts without an explicit go-ahead.

### E-02 Base commit
- **Question.** Gate E starts from which commit?
- **Why it matters.** The S.2b Issue #16 closure supplies the bound-idempotency and history-projection fixes Gate E must reuse. S.3 changes the same shared files (catalogue, tenant directory, permissions, finance and billing contracts, register counts) and designs the first outgoing settlement.
- **Proposed default.** The integrated head of the **accepted** S.2b closure and the **accepted** S.3. If the owner prefers an earlier start, only the money-free slices (E.0, E.1, E.2, E.10, E.13) start on the S.2b closure, and E.6, E.7, E.8 and E.14 wait.

### E-32 Full-regression cadence
- **Question.** Must every slice run the complete combined E2E twice, or every wave?
- **Why it matters.** The full run took 40.1 minutes at S.2b on a shared machine; Gate E roughly doubles the suite.
- **Proposed default.** Per slice: typecheck, lint, unit/API with mutation checks, the slice's E2E and evidence, smoke. Per wave: the complete combined regression with retries off, two consecutive green runs, FF/WK smoke and axe.

### E-34 Register shape
- **Question.** May Gate E add, merge or split register rows (for example, separate rows for the hold drawer and the unit quick view, or new rows for a PDC register or a calendar)?
- **Proposed default.** No. Gate E adopts and fills its own 117 rows and the developer notes of shared rows. Missing views become states of existing rows. Any count change goes to the owner first (D-43, D-45 precedent).

---

## B. Data model and fixtures

### E-03 Reusing the money engines
- **Question.** Should developers run on the society engines (`packages/fixtures/src/society/*`, which hold one site and one entity in `SocietyState`), or through an adapter?
- **Options.** (a) Generalise `SocietyState` into a tenant-wide finance core (one engine for both editions). (b) A developer adapter that calls the pure functions (`allocate.ts`, `matching.ts`, `aging.ts`, `statement.ts`, `numbering.ts`) on developer state.
- **Why it matters.** (a) is closer to A2's "one invoice engine" but rewrites accepted C.1–S.2b code. (b) leaves accepted code untouched.
- **Proposed default.** (b). The C.2, S.1 and payroll vectors must pass unchanged as a gate condition. (a) can be revisited for Gate H with the logical model.

### E-04 Seeded "paid" developer history
- **Question.** What happens to the developer invoices and portal instalments seeded as paid and verified without a statement line (`records.ts` lines 100–101; `portal.ts` lines 144, 182, 424)?
- **Why it matters.** It contradicts the C.2 closure ruling the moment Gate E shows developer collections.
- **Options.** (a) Regenerate the seed so every paid amount comes from a labelled sample statement line matched by the same engine. (b) Label it "Imported history (demo) — not verified in PropertyOS", exclude it from evidenced totals and receipts, and treat outstanding amounts like C.1 opening balances (an approved import). (c) Keep it.
- **Proposed default.** (a), with (b) as the interim label until (a) lands. Never (c).
- **Review.** Financial.

### E-08 A second legal entity
- **Question.** How is legal-entity isolation shown when each developer tenant has one entity?
- **Options.** (a) A test-only fixture adds a second entity and project (like `hr/multisite.fixture.ts`). (b) Move Larkspur Gardens to its own fictional company in the demo. (c) Add a third, clearly fictional project under a second entity to the demo.
- **Proposed default.** (a) for API tests in every money slice; (c) only if the owner wants it on screen. Existing demo ids never change, so current tests stay valid.

### E-09 SITE screens for developer projects
- **Question.** PRJ-004…007 and INV-003…005 are merged into SITE-003…006. Should those built society screens serve developer projects, or should developer structure live only inside Project 360?
- **Why it matters.** The register already says "one structure explorer for both editions". Developer roles lack `site.view` today.
- **Proposed default.** Make SITE-001…006 edition-aware (developer tabs appear only when `inventory` or `sales` are granted). Grant `site.view` to Larkspur's administration, project management and inventory roles through Larkspur's own role changes, not the starter sets.

### E-10 Unit status model
- **Question.** Adopt A2 §4.2's three dimensions (inventory, delivery, occupancy) for developer units?
- **Proposed default.** Yes, alongside the existing 12-value `UnitStatus`, which is derived from the dimensions so Stage 1.5 screens and tests are unchanged. New Gate E screens read the dimensions.

### E-37 Data owned by Gate G administration screens
- **Question.** Gate E needs legal entities, cost centres, numbering and finance settings; their screens (ADM-008, -012, -013, -014) are Gate G.
- **Proposed default.** Seed them read-only in the developer state and show "Configured by administration" where they appear. No Gate G screen is built early.

---

## C. Access, roles and privacy

### E-05 "Project + assigned" in CRM
- **Question.** Does a salesperson see every lead, opportunity, visit and quote of their projects, or only those assigned to them?
- **Why it matters.** Today Bilal (Heights only) sees all Heights leads. "Assigned" in the register suggests narrower access.
- **Proposed default.** Salespeople see records assigned to them within their projects; a sales manager role sees the whole project; unassigned new leads are visible to the project's sales manager. Existing CRM tests are updated to the narrower rule only if this is approved.

### E-06 Maker and checker holders
- **Question.** Who holds each developer maker-checker pair?
- **Options.** (a) Change the developer starter sets. (b) Larkspur's own role changes plus new fictional personas, as Al-Noor did (`ALNOOR_EXTRA`, S.2b O2).
- **Proposed default.** (b). New personas (names fictional, chosen at build): sales manager, accounts officer, finance controller, procurement officer, site engineer, project manager, handover officer. Crescent Bay keeps its single manager for the licensing demo.

### E-07 Permission names
- **Question.** Use the register's names (`project.view`, `pricing.manage`, `party.view`, `ownership.view`, `gl.view`, `expense.view`, `document.view`, `handover.view`) or map to existing ones (`customer.view`, `expense.create`, …)? And which write and approve permissions?
- **Why it matters.** None of the register names exist in `permissions.ts`. CRM writes are guarded by `lead.view` today. An unmapped permission falls back to `core` (S.2a lesson).
- **Proposed default.** Add the register's names, each mapped in `PERMISSION_MODULE`, keeping the existing ones as they are. Add explicit write and approve permissions for every maker-checker pair (for example `lead.manage`, `lead.assign`, `pricing.approve`, `quote.approve`, `booking.manage`, `booking.approve`, `refund.request`, `refund.approve`, `gl.post`, `journal.approve`, `supplier_bill.approve`, `supplier_payment.approve`, `expense.approve`, `procurement.approve`, `construction.certify`, `publication.approve`, `handover.manage`, `handover.waive`, `party.kyc.verify`, `party.kyc.reveal`, `unit.hold.override`). Final names at E.0.

### E-26 Identity (KYC) data
- **Question.** How are CNIC and passport numbers shown and handled?
- **Proposed default.** Fictional numbers only; masked to the last four characters; full reveal needs `party.kyc.reveal`, is audited and never appears in search, exports or history; verification by someone other than the person who captured it; document expiry tracked (DOC-005); retention set by the tenant, none presumed.
- **Review.** Privacy and legal.

### E-27 Approvals for every edition
- **Question.** Open APR-001…005 (built for societies, gated by `dues`) to developers, and with which subjects and approvers?
- **Proposed default.** Yes, as the S.1 report anticipated. Add the developer subjects listed in the plan §4.7. Developer approvers are roles (committee offices stay society-only). All D-29 rules apply: versioned policies, no default amounts, a draft never governs its own approval, delegates never approve their own requests.

### E-28 Record ids vs access-outcome pages
- **Question.** Gate B shows "site not included" and "not in your plan" outcome pages; S.2a/S.2b require that out-of-scope ids answer like never-issued ones. Where is the line?
- **Proposed default.** Any request naming a record id (path, query or body) out of the caller's scope gets the same 404 as an invented id. Routes without a record id keep the Gate B outcome pages for unlicensed modules and sites. CRM's current 403 for out-of-project leads becomes 404.

### E-29 S.1's unbound idempotency
- **Question.** S.1's `replay()`/`remember()` (`packages/fixtures/src/society/finance/common.ts` lines 46–52) store `key → id` without binding, the pattern Issue #16 P0-2 found in payroll. Fix it in E.0?
- **Why it matters.** Gate E reuses S.1 banking for developers with several entities, where the gap becomes cross-entity. Fixing it touches accepted S.1 code.
- **Proposed default.** Yes: move S.1 to the shared bound helper in E.0, with S.1 vectors and E2E unchanged, reported as a separate security finding for GPT review. If not approved, developer banking uses the helper and S.1 stays as it is.

### E-35 Recent records and favourites
- **Proposed default.** Stored in the browser, partitioned per tenant, app and principal; at most 50 entries each; every entry re-checked through `GET /access/record` before it is shown; entries without access disappear without a count; cleared on sign-out, identity switch and app switch (D.1).

### E-36 Developer buyer portal screens
- **Question.** Include the developer edition of PORTAL-002/003/005/028/029 (built for societies, planned for developers) in Gate E?
- **Proposed default.** Yes, inside E.6, under Rule R, because buyers already submit proofs in the developer portal and Gate E builds the staff side of that path.

---

## D. Sales and commercial

### E-11 Hold policy
- **Proposed default.** One active hold per unit; the 48 hours of today's demo stays as an illustrative, configurable value; an extension needs approval by someone else; release by the holder, or by a holder of `unit.hold.override` with a reason; expired holds release on the next read or write at the fixture clock; no limit per salesperson unless the owner sets one.

### E-12 When a reservation is confirmed
- **Proposed default.** A reservation becomes "confirmed" only when its token is evidenced by a matched statement line (C.2 rules) or a second-person-confirmed office cash receipt (D-46 rules). Before that it reads "Reserved — token not verified" and expires on schedule. No forfeiture on expiry.
- **Review.** Financial.

### E-13 Booking confirmation prerequisites
- **Proposed default.** Confirmation needs (1) approval by someone other than the maker, (2) KYC verified for every buyer, (3) the down payment evidenced, (4) the booking documents checked (BKG-008). Missing evidence leaves "Approved — awaiting down-payment evidence".

### E-14 Cancellation and refund policy
- **Proposed default.** No automatic forfeiture or deduction. The system proposes a refund from evidenced receipts minus deductions under a versioned policy with a policy reference (illustrative values, labelled). Approval by someone else. The refund is an instruction, settled only per E-18. Every step is audited and history is never rewritten.
- **Review.** Legal and financial (lawfulness of deductions).

### E-19 Cheques and post-dated cheques
- **Question.** Developers commonly collect post-dated cheques for instalments. Is a PDC register needed, and how are PDCs shown?
- **Proposed default.** S.1 cheque rules apply unchanged: "Cheque received — not a receipt of payment"; cleared only by a matched statement line; returned cheques settle nothing; reversal after clearing reverses payment, allocation and receipt. PDCs are a filtered state of the existing cheque list, not a new screen (E-34).
- **Review.** Financial.

### E-25 When ownership starts
- **Proposed default.** An ownership record (OWN-001) starts only at a completed handover (HND-009) or a registered transfer (OWN-004). Booking holders are "buyers". Liability for instalments follows the booking's billing account from the start.
- **Review.** Legal.

### E-30 Payment-plan rounding and schedule rules
- **Question.** How are amounts that do not divide evenly spread across instalments? (Today's demo plan in `crm-data.ts` truncates and sums exactly only because fixture prices are whole thousands.)
- **Proposed default.** Each instalment rounded down to the paisa; the remainder added to the last instalment; the schedule must equal the price exactly (golden vectors). Due dates from the template's offsets; construction-linked lines have no date until E-20 applies. Plan templates, pricing policies, fees and discounts follow the CP1 treatment of HQ pricing (`docs/status/gate-b-checkpoint-1/GATE_B_CHECKPOINT_1_REPORT.md` line 15): illustrative values, configured and versioned, Rs 0 lines visible in detailed quotes.

---

## E. Money, accounting and evidence

### E-15 Revenue recognition
- **Question.** Booking does not mean revenue (V2.1 01 §9; A2 §6). What does the prototype post when instalments are invoiced and paid?
- **Proposed default.** No revenue recognition in the prototype. Instalment invoices post to receivables against a contract-liability (customer advances) account; payments post against receivables. Project profitability (RPT-013) and P&L show "management view — revenue recognition policy not set".
- **Review.** Financial (an accounting adviser decides before Gate H).

### E-16 Chart of accounts
- **Proposed default.** An illustrative chart per legal entity, labelled "illustrative, not a statutory chart", versioned; changes go draft → approval by someone else; no account is deleted once used.
- **Review.** Financial.

### E-17 Automatic posting
- **Question.** Do source events (invoices, payments, bills, payroll) post journals automatically?
- **Proposed default.** They create **proposed** journals ("Proposed — not posted"). Posting needs someone other than the source's maker, an open period and a balanced entry. Cash lines come only from confirmed payments or settlement confirmations. Payroll stays proposed (S.2b O1) until its classification is approved.
- **Review.** Financial.

### E-18 Outgoing payment settlement
- **Question.** Supplier payments (SUP-006), refunds (FIN-010), reimbursements (EXP-006) and payroll disbursement (PAY-006) need an outgoing settlement. None exists yet.
- **Options.** (a) Reuse S.3's owner-payout settlement once accepted: a matched **debit** line of the paying verified account, one line one subject, partial matches through a second person, reversal restoring the liability. (b) Build a Gate E design in E.8. (c) Keep everything as instructions.
- **Proposed default.** (a) when S.3 is accepted; until then (c): instructions only, "Not settled — no evidence", and these screens stay PARTIAL, as PAY-006 is today.
- **Review.** Financial.

### E-20 Construction-linked instalments
- **Proposed default.** A construction-linked instalment becomes due only when its milestone is certified: the engineer submits progress with an evidence document, someone else certifies. Progress percentages never raise invoices by themselves.
- **Review.** Financial and legal (agreement terms).

### E-22 Handover finance clearance
- **Question.** What must be paid before handover?
- **Options.** (a) Every instalment due up to and including the possession milestone. (b) The full price. (c) Per project policy.
- **Proposed default.** (a), configurable per project later; only evidenced payments count (pending proofs and uncleared cheques do not); a shortfall needs a waiver approved under the approval policy by someone other than the requester.
- **Review.** Financial.

### E-31 Procurement matching tolerances
- **Proposed default.** Zero tolerance on quantity and price: any mismatch between PO, receipt and bill needs an exception approved by a second person. The lowest supplier quote is not auto-selected; the selection needs a written reason.

---

## F. Delivery and operations

### E-21 Construction updates published to buyers
- **Proposed default.** A site engineer drafts, someone else approves before publication. The audience is the verified buyers whose bookings are in force for the project (or tower); cancelled and transferred-out buyers never receive it. Withdrawal leaves a tombstone and withdraws notifications. Demo media show no people or real places.
- **Review.** Privacy.

### E-23 Snags
- **Proposed default.** Snags are handover records (HND-007), so a developer without `maintenance` can still hand over. A later link to maintenance work orders is possible but not built.

### E-24 Resident operations for developer buildings after handover
- **Question.** V3.2 notes that "when a handed-over tower becomes a managed building, the same society features apply per site". D.2 and D.3 screens currently serve only societies and Shalimar (`operations/site.ts` line 57). Should Gate E open them to developer sites?
- **Proposed default.** Not in Gate E. RPT-017 (maintenance SLA) shows data only where an operations site exists and says "No maintenance operations for this organisation" otherwise. A separate decision can schedule developer-managed operations later.

### E-33 Developer HR and payroll specifics
- **Proposed default.** In Gate E (slice E.14), after E.7 and after the S.2b Issue #16 closure is accepted. Employees attach to projects and cost centres across several entities; payroll posting stays proposed (E-17); HR-008 and PAY-006 stay PARTIAL until E-18.
