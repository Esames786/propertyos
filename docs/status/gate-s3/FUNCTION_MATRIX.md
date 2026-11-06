# Gate S.3 function matrix

Each function: where it is, who may use it, what the server checks, and the test that proves it.
API = `packages/fixtures/src/rentals/rentals.api.test.ts`; vectors = `rentals.vectors.json` via `rentals.test.ts`; e2e = `tests/e2e/s3.spec.ts`.

| Screen | Function | Who (permission, feature) | Server rule | State | Tests |
|---|---|---|---|---|---|
| RNT-001 | List, counts, KPIs | `lease.view` | reader's rentals sites only; KPIs over them | BUILT | API "Riverbend staff see…", "KPIs…"; e2e reference flow |
| RNT-001 | Filters and search | `lease.view` | state, site, text (ref, unit, tenant, landlord) | BUILT | e2e reference flow |
| RNT-001 | CSV export | `lease.view` | reader's sites only, `scopeLimited` noted | BUILT | API "Court-only… export" |
| RNT-002 | Lease 360 read | `lease.view` | lease's site in scope, else "not found" like a never-issued id | PARTIAL (invoices, deposit, sub-ledger) | API scope; e2e |
| RNT-002 | Submit | `lease.manage` | draft only | BUILT | API "draft → review → activated" |
| RNT-002 | Activate | `lease.manage` | review; not the drafter or submitter; not a landlord's own person; no blocker (agreements signed and in force on the start date, one model matching the lease, collection authority, verified account, owner authority, shares, ownership, no overlap, start not over a month ago); binds agreement versions; creates the lease payer account (kind lease) | BUILT | API activation, conflict, unsigned agreement; e2e |
| RNT-002 | Cancel draft | `lease.manage` | draft or review; reason | BUILT | — (UI) |
| RNT-002 | Record owner authority | `lease.manage` | draft or review, none recorded; reference, date ≤ today, confirmation | BUILT | API wizard validation |
| RNT-008 | Renew | `lease.manage` | active, not terminating; new version from the day after the end, 1–36 months, bound to agreement versions in force then; idempotent | BUILT | API renewal; e2e |
| RNT-008 | End early | `lease.manage` | active; today ≤ date < end; reason | BUILT | API termination; e2e |
| RNT-009 | Deposit refund | `lease.view` | read only; refundable on an evidenced basis = 0 | PARTIAL | API deposit; e2e |
| RNT-003 | Options | `lease.manage` | reader's units; owners today with agreement state; prospective tenants | BUILT | API options |
| RNT-003 | Draft | `lease.manage` | unit in scope; registered owners; shares = 100 %; agreement exists (a draft agreement allows a draft lease only); model = agreements' (never mixed); tenant not a landlord; dates, term 1–36, start within −31…+366 days; rent; due day 1–28; deposit ≤ cap; duplicate and overlap refused; idempotent (operation, principal, unit, fingerprint) | BUILT | API wizard validation (15 cases), mixed models, duplicate/overlap, idempotency; e2e |
| RNT-004 | Read roll | `rent.bill` or `rent.approve` | lines of the reader's sites; history values for whole readers only | PARTIAL | API scope; e2e |
| RNT-004 | Preview | `rent.bill` | every rentals site; licence month … next month; not approved; lines keyed (lease, period, version); new version only when lines changed; idempotent | BUILT | API preview, periods |
| RNT-004 | Approve | `rent.approve` | every rentals site; draft; not stale; approver previewed nothing; acknowledgement | BUILT | API maker ≠ checker, stale, acknowledgement; e2e |
| RNT-004 | Post | `rent.bill` or `rent.approve` | approved roll → **always** `409 posting_unavailable`, nothing changes | PARTIAL | API posting refused; e2e (no control) |
| RNT-005 | List owners and periods | `owner_statement.view`, `rentals.owner_statements` | owners with an agreement in force; reader's sites | BUILT | API list |
| RNT-005 | Statement | same | settled basis; memo lines; sources; projection for limited readers; principal closing 0 | PARTIAL (no settled lines can exist) | API statement, principal, scope |
| RNT-005 | Issue | same | every site of the owner; this month or earlier; agreement in force; once (snapshot frozen); idempotent | BUILT | API issue, freeze, replay; e2e |
| RNT-006 | Payouts view | prepare, approve or `owner_statement.view`; `rentals.owner_payouts` | whole-owner money only for whole readers; holds; masked owner account only for preparers and approvers | PARTIAL | API payouts, Issue #18 rule |
| RNT-006 | Prepare | `owner_payout.prepare`, feature | owner in scope with agreement in force; every site; not the owner's own person; idempotent; principal model, no collection authority, unverified account refused; amount ≤ settled closing − pending | PARTIAL (nothing settled) | API holds, exceeds, injected settled source |
| RNT-006 | Approve | `owner_payout.approve`, feature | awaiting approval; not the preparer; not the owner's own person; re-checks what is left; acknowledgement; changes no payable | PARTIAL | API maker ≠ checker, conflict, payable unchanged |
| RNT-006 | Reject, cancel | approve; prepare or approve | state; reason | PARTIAL | — (UI, API state) |
| RNT-006 | Settle, send, mark paid | — | **no route** (404) | — | API "no posting, settlement… route"; e2e |
| RNT-007 | Settings read | `rentals.configure` | agreements of visible owners; notes and bound leases projected | BUILT | API settings scope |
| RNT-007 | Draft or replace a version | `rentals.configure` | every site of the owner; effective today or later; model; fee 0–30 %; deposit holding matches the model; 0–3 months; principal never collects; signed reference and date together; idempotent | BUILT | API unsigned flow, scope |
| RNT-007 | Approve a version | `rentals.configure` | every site; a draft; not its drafter; signed agreement on file; not effective in the past; acknowledgement | BUILT | API unsigned flow; e2e |
| PORTAL-037 | Landlord view | `portal.use` (`resident_portal`) | Rule R (§2.4 of the report) | BUILT | API Rule R (6 tests); e2e |
| PORTAL-037 | Issued statement | same | the landlord's own owner, issued only; lines of permitted sites; no office history | BUILT | API; e2e |
