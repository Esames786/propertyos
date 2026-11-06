# Gate S.3: Rentals (Riverbend Estate Managers)

**Status: built and verified, PROVISIONAL, stopped for GPT and owner review.** Nothing is merged; `main` is untouched.

**Commits**
- **Branch:** `feature/gate-s3-rentals` (dedicated worktree `propertyos-s3`). The legacy `feature/gate-s3-rentals-parallel` was not used.
- **Base:** started on `a0d4a70` (S.2b as delivered) while Issue #16 was open, as Issue #17 directed; **rebased onto `474e4ae`**, the S.2b Issue #16 closure GPT accepted. The rebase was clean: S.2b's closure touched payroll files, `tests/support/society.ts` and its own documents only, none of the global files S.3 changes.
- **Gate commit:** `Gate S.3: rentals …` on `474e4ae`; its SHA is in the delivery message.
- **Not touched:** `main`, Issue #13, the VPS, Bingoo, Laravel and any backend, real payment rails, SOS; no real person, property, account or amount. `PROJECT_HANDOFF.md` and the Nizam reference files are not committed. Issue #18 (`fix/s1-bank-feed-and-idempotency`) is **not** integrated; its rules are applied here from the start (§2.5).

**Brief.** [GitHub Issue #17](https://github.com/Esames786/propertyos/issues/17), the coordinator's updates (integrate `474e4ae`; apply Issue #18's rules; full combined regression).

**Sources** (V3.2 revision 4, `docs/nizam-v3.2-scope-review@0e57604`, adopted for S.3 only)
- `FRONTEND_ONLY_EXECUTION_PLAN.md` §S.3 and §4 (`rentals.vectors.json`);
- `SCREEN_REGISTER_DELTA.csv` rows RNT-001…009 and PORTAL-037 (adopted alone, never the rest of the delta);
- `MODULE_AND_LICENSING_MATRIX.md` §2 (module), §3 (features), §5.2 (permissions), §6 (dependencies), §7 (Riverbend amendment);
- `OWNER_DECISIONS.md` D-33 (issuing model open), D-43 (adoption), D-48 (no settlement without evidence);
- accepted C.1/C.2, S.1, resident Rule R and the live screen register.

## Summary

| Screen | Status | What works | What does not (and why) |
|---|---|---|---|
| RNT-001 Leases | **BUILT** | Search (reference, unit, tenant, landlord), state filters with counts (all, active, ending in 60 days, drafts, ended), site filter, five KPIs that each open their records, CSV export limited to the reader's sites | — |
| RNT-002 Lease 360 | **PARTIAL** | Parties and shares, terms, issuing model from the agreements (agent or principal, D-33 label), rent schedule by version with the roll state of each month, documents (references), versions, the unit's letting history, related links, activity; submit, activate (second person), cancel, record the owner's authority; RNT-008 renewal and early end | **Invoices and payments** are empty (posting not connected); the **deposit** is a liability "awaiting evidence" (no receipt can be evidenced); the **owner sub-ledger** has no settled entry |
| RNT-003 New lease wizard | **BUILT** | Unit (Villas never offered), landlords and shares (= 100 %), tenant, term and rent, deposit (agreement cap), payer effect and the owner's written authority, review; save a draft or save and submit; server problems return to their step | — |
| RNT-004 Rent roll | **PARTIAL** | Period selector, preview of every let lease's line (key: lease, period, schedule version), re-preview only when something changed, stale-roll detection, approval of a **demand** by someone who previewed nothing, with an explicit acknowledgement | **Posting** to invoices is refused honestly (`posting_unavailable`): the C.1/C.2 engine has no lease billing subject. Nothing is invoiced, collected or paid; there is no post control |
| RNT-005 Owner statements | **PARTIAL** | Owner and month; settled-basis totals; memo lines (approved demands, approved owner expenses, deposits, pending instructions) apart; every line opens its source; issue as an immutable snapshot; print or save as PDF; scope-limited projection | Settled rent, fee and payout lines need settlement evidence that does not exist, so every closing payable is **0.00** |
| RNT-006 Owner payouts | **PARTIAL** | Per owner: settled closing payable, already instructed, left to instruct and why nothing can be instructed; prepare (≤ what is left) and approve by a second person, reject, cancel, all API-tested; the settlement needs list | **"Not settled — no evidence"** everywhere; in the demo nothing is settled, so nothing can be instructed; no settle, send or paid control and no settlement route |
| RNT-007 Rental settings | **BUILT** | Versioned management agreements (model, signed agreement, authority to collect, fee, deposit rules, account), draft or replace the draft, approval by a second person (never without a signed agreement, never backdated), leases bound to each version; fee and deposit rule tabs; read-only fictional notice templates | — |
| PORTAL-037 Landlord view | **BUILT** | Rule R; the landlord's own let units, each tenant's name and this month's rent status, deposit agreed and held (nothing evidenced), issued statements (drawer, print), pending instructions | Settled payouts: none can be shown |

States: **RNT-008** (renew or end early, a drawer of RNT-002) is **BUILT**; **RNT-009** (deposit refund) is **PARTIAL**, read only: nothing is refundable on an evidenced basis.

**Register:** 439 rows / 354 distinct before S.3 → **449 rows / 362 distinct** (139 built, 43 partial, 180 planned). The 10 rows are the delta's own; their routes are the delta's paths without the query strings (filters are query parameters of the same screen, as for HR-010).

**Results** (details in [`test-results.md`](test-results.md))
- Typecheck, lint (with logical CSS and i18n parity: 2 locales × 27 namespaces, same keys): clean.
- Vitest: **1,587 / 1,587** (54 files) on the integrated branch; the rentals suites: **86** tests (45 rules, golden vectors and catalogue; 41 API).
- Mutation checks: **15 / 15** killed, each file restored byte-identically.
- **Complete combined regression** (every e2e spec, gates B to S.3, retries off): **404 / 404** in 38.5 minutes.
- On the final build: the S.3 spec **15 / 15** (two consecutive runs), the S.3 evidence **11 / 11**, Firefox and WebKit smoke **4 / 4**; axe **68 scans, 0 violations** in the S.3 spec.

## 1. How to try it

- **Office app** (`/backoffice/rentals`), Riverbend Estate Managers (Demo) on the sign-in page:
  - **Sadia Rauf**, portfolio manager: leases, the wizard, renewals and early ends, rent roll previews.
  - **Usman Ghani**, client-money accounts officer: activates leases someone else drafted, previews rolls, issues statements, prepares payout instructions.
  - **Naila Haider**, finance controller: approves rent rolls, payout instructions and agreement versions; reads leases.
  - **Faisal Butt**, director: drafts management agreement versions.
- **Resident app** (`/customer/portal/rentals`): **Tahira Rehman** and **Kashif Mirza** (landlords), **Adeel Shah** (rents a flat; no landlord view).
- **The fictional seed** (26 October 2026):
  - Rentals is licensed on **Riverbend Heights** and **Riverbend Court** from 1 September 2026, never on **Riverbend Villas**.
  - Owners: Tahira Rehman (agent model, a flat at each site), Mirza Family Properties (Demo) (principal model), Farhan Saeed (agent), Nida Saeed (her agreement is an unsigned draft), Zafar Iqbal and Aamir Javed (no agreement).
  - Leases: RB-LS-0001 (H-1204), 0002 (C-07, ending 15 December), 0003 (C-11, principal), 0004 (H-0802, ended), 0005 (H-0802, joint 50/50, awaiting activation: Nida's agreement is unsigned), 0006 (H-0507, renewed in April at a higher rent).
  - Rent rolls: September and October approved (demands); November not prepared.
  - Statement RB-OS-0001 (Tahira, September) issued.
- **The reference flow** (also the video):
  1. As Sadia, *New lease*: C-12, Mirza Family Properties 100 %, Hamid Raza, 1 November 2026 – 31 October 2027, PKR 55,000, deposit 110,000, the owner's authority; *Save and submit*.
  2. As Usman, open the lease and *Activate* (Sadia cannot): it gets payer account RB-LA-0007 (kind lease).
  3. As Sadia, *Rent roll* → November → *Preview*. As Naila, *Approve the demand* (with the acknowledgement). There is no post control; the posting panel says why.
  4. As Usman, *Owner statements* → Tahira, October → *Issue to the owner*.
  5. As Tahira (resident app), open the statement.
  6. *Owner payouts*: nothing can be instructed, and why.
- **Unsigned agreement:** as Faisal, *Rental settings* → Nida Saeed → *Edit the draft*, add the signed reference; as Naila, approve it; as Usman, activate RB-LS-0005.

## 2. What S.3 adds

### 2.1 Licensing, roles and people

- **Module** `rentals` (catalogue 29 → **30**): category property, **site** scope, requires `residents` and `receivables`, integrates banking, payables, accounting, resident_portal and communications; an add-on for every edition, in **no** preset. Features `rentals.owner_statements`, `rentals.owner_payouts`, `rentals.management_fees`.
- **Riverbend** (`tnt_riverbend`, portfolio edition; its display name stays "Riverbend Estate Managers (Demo)" so accepted HQ tests are unchanged): a dated, fictional amendment grants `rentals` on Heights and Court from 1 September 2026 with the three features. No other organisation holds it. The demo can withdraw it (`demo:withdrawn-modules`, remove-only) to show "not in your plan".
- **Permissions** (matrix §5.2): `lease.view`, `lease.manage`, `rent.bill`, `rent.approve`, `owner_statement.view`, `owner_payout.prepare`, `owner_payout.approve`, `rentals.configure`, all of module `rentals`.
- **Riverbend's roles** (six, as before): Director (administrator), Portfolio manager, Finance controller (treasurer), Client-money accounts officer (replacing the unused maintenance starter), technician and security starters. Deviations from the matrix, both owner decisions: the finance controller also holds `lease.view` (an approver reads what is approved) and `rentals.configure` (the second signatory of agreement versions). No Riverbend role holds a society billing, collections or HR permission: those screens are built for societies only.
- **Dataset:** Riverbend's verified links (landlords, a sold flat whose link ended, a Villas plot, an unverified claim, the lessee's link).
- **Both apps share Riverbend's demo partition** (`SHARED_TENANTS`), as Al-Noor's: a statement issued in the office is the one the landlord opens.

### 2.2 Model and mock API (`packages/fixtures/src/rentals/`)

- `rules.ts`: pure rules (shares in basis points = 100 %, schedule by version with no pro-rating, rent-line key, settled-basis ledger, fee per settled line (agent only), what is left to instruct, refundable deposit, deposit cap, overlap, term, request fingerprint), table-tested by `rentals.vectors.json`.
- `state.ts`: the per-tenant state in the demo partition; Riverbend's fictional seed; `settled` (bound settlement events) **has no writer**.
- `views.ts`: the request context (`rentOf`) and scope helpers, Lease 360, rent roll, statements (body, projection), payouts and agreements read models.
- `handlers.ts`: 25 office endpoints. `portal.ts`: 2 landlord endpoints.
- Contracts: `packages/contracts/src/rentals.ts`.

### 2.3 The money boundary (D-33, D-48, Issue #17)

- **A lease is a contract; an approved rent roll is a demand.** Approving freezes the demand schedule; it is not an invoice.
- **Posting** an approved roll is refused (`409 posting_unavailable`), with nothing created. The C.1/C.2 engine is society-only and has no lease billing subject; binding rent to it safely needs: a lease billing subject, the lease payer account (kind `lease`) in the engine, numbering per issuing entity, and one invoice per (lease, period, version). These are listed on the screen.
- **Rent is its own billing kind** (`rent`) with its own payer account per lease (kind `lease`, RB-LA-…), never a society maintenance account; the wizard says the society dues payer is separate and unchanged.
- **Settled basis only.** Closing payable = opening + settled rent − fee − settled expenses − settled payouts. Approved demands, approved owner expenses, deposits and payout instructions are memo lines. With no settlement evidence path, every closing payable is 0.00.
- **Principal model:** the owner's own entity collects into its own account; the manager holds nothing and owes nothing (closing 0, payouts "not applicable").
- **Deposits** are the tenant's money: a liability, "awaiting evidence", never owner income, never payable to the owner; a refund can only return an evidenced deposit (none here).
- **Payout instructions:** prepared ≤ what is left (settled closing − every pending instruction), approved by someone else; **approval changes neither cash nor the payable** (API-tested with a test-injected settled source). There is **no** settle, send, paid or evidence route: `POST /settlements`, `/rentals/payouts/:id/settle` and similar answer 404.

### 2.4 Scope, Rule R and the order of checks

- **Rentals sites** of a person: sites where `decide` allows a `rentals` record of that site and its legal entity, worked out on every request.
- **A lease** follows its unit's site. **An owner** (agreement, statements, payouts) spans the sites of their leases: seeing needs one, acting needs all (`ownerWhole`). **A rent roll** spans every licensed rentals site.
- **Limited readers** get their sites' lines with totals over them and a `scopeLimited` flag; roll history and statement history lose their values and notes; agreement notes and leases bound to other sites are dropped; whole-owner money (closing, pending, left, payout instructions) is withheld.
- **Order in every handler:** training refused → authority over the record's sites → the ids, in scope (else "not found" or the same field problem as for an id never issued) → **idempotency** → state → maker ≠ checker and conflict → validation. A refusal changes nothing (every API refusal test compares the stores before and after).
- **Rule R (PORTAL-037):** `resident_portal` + `portal.use` (transport) → a verified link in force today at a site with the portal → a **landlord role in the owner register** today (a lessee's link or an unverified claim is not one) → `rentals` licensed for **that** site. No landlord role: "not found"; a role only on unlicensed sites: the shared refusal (`site_not_licensed`, `module_not_licensed`). An organisation that is suspended or withdrew the portal is refused at the transport.

### 2.5 Issue #16 and Issue #18 rules applied from the start

- **Idempotency** entries bind the operation, the principal, the target and a normalised fingerprint of the request (`fingerprint()` sorts keys and trims strings). A repeated key replays only the same request, after the authority checks, re-reading the record through the scoped lookup; anything else is a non-disclosing `409 idempotency_conflict` with no change.
- **Nested data** (history values and notes, version notes, bound leases, payout instructions) is projected for limited readers.
- **Bank confidentiality (Issue #18):** rentals shows no bank statement line, reference or IBAN at all (none exists). Accounts are masked to their last four characters; an **owner's payout account** is shown only to those who prepare or approve payouts (API-tested); a lease's issuing account (where rent would be paid in) is shown masked, like C.2's payee details.

### 2.6 Screens

- Office: `apps/backoffice/src/pages/rentals/` (`LeasesPage`, `Lease360Page` with the renewal, early end, authority and refund drawers, `NewLeasePage`, `RentRollPage`, `OwnerStatementsPage`, `PayoutsPage`, `RentalSettingsPage`, `rkit`). Menu: one "Rentals & owners" item; the other screens open from the rentals section navigation (each gated by its own permission and feature).
- Resident app: `apps/customer-web/src/pages/rentals/LandlordPage.tsx` and a **landlord edition** for a property manager's people (their resident app is the landlord view; buyer and dues pages lead to it; no buyer tour is offered there).

### 2.7 Layout findings fixed during the gate

- References, unit codes and account references broke at their hyphens at 320 px with 200 % text → a word joiner after each hyphen (`unbroken`), in the office and the landlord view.
- "sub-ledger", "client-money", "maintenance-dues" broke the same way → written without hyphens.
- Lease 360's title ("Lease RB-LS-0005") ran off a 320 px screen → the title is "Lease 360", the reference is in the description.
- The wizard's selected unit ("C-12 · Riverbend Court") overflowed its field → the unit code is the option, the site its hint.
- A toast covered the wizard's buttons after a field problem → field problems show on their step without a toast.
- The renewal drawer showed an ISO date → the reader's date format.

## 3. Reference flows (browser, `tests/e2e/s3.spec.ts`)

1. Draft (wizard, with a deposit-cap problem returned to its step) → own draft cannot be activated → a second person activates → roll previewed by one, approved by another, not postable → statement issued and frozen → the landlord opens it. A wording check finds no "paid", "sent", "received" or "collected" outside negations.
2. Unsigned co-owner agreement blocks activation → the director records the signature (cannot approve his own draft) → the finance controller approves → activation.
3. Renewal (validation, then a version bound to agreement version 2), early end (schedule stops), deposit refund not available.
4. Payouts: holds, no prepare control, no settle/send/paid control, the server refuses an instruction and has no settle route.
5. A Court-only manager: Court leases only, a Heights lease is an error state, the roll and statements are scope-limited.
6. Rentals withdrawn: "not in your plan" on every screen; Al-Noor never sees rentals.
7. Rule R in the resident app: Kashif's verified flat only, another landlord's statement not available, the lessee has no landlord view, buyer pages lead to the landlord view, a withdrawn add-on closes the view.
8. Both languages: axe at 1440/768/390 and the landlord view; 320 px at 200 % (screens, drawers, landlord view); dark mode with high contrast; the keyboard walk.

## 4. Decisions made in S.3 (open to the owner)

| # | Decision | Why |
|---|---|---|
| R1 | Riverbend keeps its display name "Riverbend Estate Managers (Demo)" (Issue #17 says "(Portfolio Demo)") | Accepted HQ tests assert the name; the edition is portfolio |
| R2 | The finance controller holds `lease.view` and `rentals.configure` (matrix: neither) | An approver reads leases; agreement versions need a second signatory |
| R3 | Riverbend's "maintenance" starter role is replaced by "Client-money accounts officer" | Keeps six roles (accepted role test) and splits the payout maker-checker pair |
| R4 | Statements are generated live and issued by any `owner_statement.view` holder with every site of the owner (register: `owner_statement.view`) | A separate issue permission may be wanted |
| R5 | No pro-rating of part months; due day 1–28; term 1–36 months; deposit cap from the agreement (2 months in the seed) | Fictional demo rules, stated on screen |
| R6 | Owner payouts require `rentals.owner_payouts` (off by default in the matrix; granted to Riverbend) | Matrix §3 |
| R7 | A lease activation needs a second person (`lease.manage`), not only an approval permission | "No self-approval of leases" (Issue #17) without a new permission |
| R8 | D-33 (issuing model), D-48 (evidence) remain open; both models are labelled fictional alternatives | Owner decisions |

## 5. Partial and known limitations

- Posting (RNT-004), settlement of rent, deposits and payouts (RNT-002, 005, 006, 009) wait for a **safe lease and payout subject in the S.1/C.2 reconciler** (§2.3). The state field for bound settlement events exists, has no writer, and is exercised only by API tests.
- No Unit 360 or Person 360 for a portfolio manager exists yet: Lease 360 shows the unit's letting history and parties itself.
- Templates are read-only samples; nothing is sent.
- The search box filters as you type (no separate search button).
- Manual screen-reader and device checks are open ([`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md)); no WCAG conformance is claimed.

## 6. Accepted tests changed (disclosed)

- `packages/fixtures/src/platform/platform.test.ts`, `packages/fixtures/src/tenant-access.test.ts`: module count 29 → 30 (and the plan check now also says rentals is not in Shalimar's plan).
- `tests/e2e/register.spec.ts`: register 439 → 449 rows, 354 → 362 distinct, with the S.3 note.
- `tests/support/fixtures.ts`: the seven Riverbend identities added to the persona list and maps (no existing entry changed).
- The customer app's dues edition now also requires the organisation not to be a portfolio manager (Riverbend licenses dues but has no society register); no existing tenant is a portfolio manager with residents in the resident app.

## 7. Evidence

- Screenshots: `docs/status/gate-s3/screenshots/` (a: every screen at 1440 and 390 in both languages; b: Lease 360 drawers and tabs; c: the reference flow; d: who sees what; e: 768; f: 320 px at 200 % in both languages; g: dark mode with high contrast).
- Video: `docs/status/gate-s3/video/s3-draft-lease-to-approved-demand-and-issued-statement-desktop-en.webm`.

## 8. Files

- Contracts: `packages/contracts/src/rentals.ts`; `permissions.ts`, `access.ts` (module, site scope, permission modules), `persona.ts`, `index.ts`.
- Fixtures: `packages/fixtures/src/rentals/*`; `platform/catalog.ts`, `tenant-directory.ts`, `role-templates.ts`, `people.ts`, `datasets.ts`, `demo-licence.ts`, `shared-demo.ts`, `handlers.ts`, `index.ts`.
- Office app: `apps/backoffice/src/pages/rentals/*`, `nav.config.ts` (`RENTALS`), `prototype/routes.tsx`; menu `packages/ui/src/workspace/tenantWorkspace.ts`.
- Resident app: `apps/customer-web/src/pages/rentals/LandlordPage.tsx`, `nav.config.ts`, `prototype/RootLayout.tsx`, `prototype/routes.tsx`.
- i18n: `rentals` namespace (en-PK, ur-PK), `common`, `nav`, `platform` additions; `packages/i18n/src/resources.ts`.
- Tests: `packages/fixtures/src/rentals/{rentals.test.ts,rentals.api.test.ts,rentals.vectors.json,rent-test-kit.ts}`, `tests/e2e/s3.spec.ts`, `tests/evidence/gates3.evidence.spec.ts`, `tests/smoke/s3.smoke.spec.ts`.
- Register: `docs/ui/screen-register.csv` (10 rows appended), `packages/contracts/src/screens/register.generated.ts`.

## 9. Stop

S.3 is **provisional**: pushed to `feature/gate-s3-rentals` only, for GPT and owner review. No merge, no deploy.
