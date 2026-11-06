# Gate S.3: Rentals (Riverbend Estate Managers)

**Status: PROVISIONAL. Issue #17 review (GPT, `7df5f80`: PROVISIONAL / HOLD) closed on this branch (closure 1, `d050bad`: the accepted Issue #18 hotfix merged, P0 and P1 fixed); GPT's follow-up review of `d050bad` held final security acceptance for one office-side edge, closed in closure 2 below; the final regression rerun; stopped for GPT's final review.** Nothing is merged into `main`; `main` is untouched. The closure is described first ([Issue #17 closure](#issue-17-closure)); the sections after it describe the gate as built, updated where the closure changed it.

**Commits**
- **Branch:** `feature/gate-s3-rentals` (dedicated worktree `propertyos-s3`). The legacy `feature/gate-s3-rentals-parallel` was not used.
- **Base:** started on `a0d4a70` (S.2b as delivered) while Issue #16 was open, as Issue #17 directed; **rebased onto `474e4ae`**, the S.2b Issue #16 closure GPT accepted. The rebase was clean: S.2b's closure touched payroll files, `tests/support/society.ts` and its own documents only, none of the global files S.3 changes.
- **Gate commit:** `Gate S.3: rentals …` on `474e4ae`; its SHA is in the delivery message.
- **Not touched:** `main`, Issue #13, the VPS, Bingoo, Laravel and any backend, real payment rails, SOS; no real person, property, account or amount. `PROJECT_HANDOFF.md` and the Nizam reference files are not committed. Issue #18 (`fix/s1-bank-feed-and-idempotency`, `04b6fde`, accepted by GPT) is **merged** in the closure (below); before it, its rules were applied by hand (§2.5).

**Brief.** [GitHub Issue #17](https://github.com/Esames786/propertyos/issues/17), the coordinator's updates (integrate `474e4ae`; apply Issue #18's rules; full combined regression).

**Sources** (V3.2 revision 4, `docs/nizam-v3.2-scope-review@0e57604`, adopted for S.3 only)
- `FRONTEND_ONLY_EXECUTION_PLAN.md` §S.3 and §4 (`rentals.vectors.json`);
- `SCREEN_REGISTER_DELTA.csv` rows RNT-001…009 and PORTAL-037 (adopted alone, never the rest of the delta);
- `MODULE_AND_LICENSING_MATRIX.md` §2 (module), §3 (features), §5.2 (permissions), §6 (dependencies), §7 (Riverbend amendment);
- `OWNER_DECISIONS.md` D-33 (issuing model open), D-43 (adoption), D-48 (no settlement without evidence);
- accepted C.1/C.2, S.1, resident Rule R and the live screen register.

## Issue #17 closure 2 (GPT follow-up review of `d050bad`)

GPT's follow-up review (Issue #17, 6 November 2026, comment 6689628632) accepted the portal P0 projection and the P1 issue permission at source level and held final S.3 security acceptance for **one office-side edge**. Chain: `d050bad` → the closure-2 commit (SHA in the delivery message); a fast-forward, no rebase or force-push.

### D1. Finding (reproduced on `d050bad`)

The office's `GET /rentals/owner-statements` listed **every** issued statement of a visible owner (id, reference, period), and `GET /rentals/owner-statements/statement?owner=&period=` answered an issued statement as **issued** (id, reference, issuer, date, the issue event) even when none of its sources was at a site the reader may see. With a TEST-ONLY October statement for Tahira Rehman sourced only from Riverbend Court and a reader limited to Riverbend Heights, the new tests fail on the `d050bad` code: the list carries `{ id: ost_rb_test_b, ref: RB-OS-0099, period: 2026-10 }` (also after the Court grant is withdrawn), and the lookup returns `state: issued`, the id, the reference, "Usman Ghani", the date and the issue event, with no lines (`test-results-s3/followup-repro-d050bad.txt`, `followup-probe-detail-d050bad.json`).

### D2. Fix: the same rule as the landlord view, one predicate

- `views.ts` **`statementKnown(statement, permitted, whole)`**: a reader may know an issued statement exists only with the whole owner or when at least one of the statement's own sites (`statementSites`) is theirs. It is now the only place this rule lives: the landlord view (`portal.ts`) calls it instead of its own expression, and the office calls it through `officeKnows` (the reader's sites; *whole* = every site of the owner and of the statement, the same `officeWhole` that `projectBody` uses for `projectStatement`).
- **List:** `statementsList` lists an owner's issued statements only if `officeKnows`: a statement of hidden sites only has no id, reference or period in the response (nor in anything counted from it).
- **Lookup:** `issuedOf` returns a statement only if `officeKnows`, so `statementView` answers a statement of hidden sites only **exactly as if it had never been issued**: the live draft of the reader's sites, labelled partial, without id, reference, issuer, date, issue event or "issued" state. Why the draft and not 404: in the office an in-range owner and month with no issued statement already answers with the live draft; a 404 for a hidden statement would itself tell the reader that something is there. The tests compare the two serialized answers (with and without the hidden statement) byte for byte.
- **Mixed statements** (a site of the reader and a hidden one) stay visible, issued and labelled partial, with the reader's sites' lines and totals only (`projectStatement`, unchanged).
- **Full-scope readers** keep everything; **issuing is unchanged** (`owner_statement.issue`, every site of the owner); its duplicate check reads the stored statement directly (`storedStatementOf`), which only a whole-owner issuer reaches.
- **Revocation is immediate:** scope is worked out on every request; withdrawing the Court rentals grant hides the Court-only statement on the next request (fail closed for every reader).
- No UI change: the office screen never rendered the `issued` list; the screens and their evidence are unchanged.

### D3. Tests and mutations

- `rentals.issue17.api.test.ts`, three new tests: (1) a Heights-only reader: the full serialized list and the October lookup are identical to a session where the Court-only statement was never issued; no id, ref, issuer, date, payout line, Court line or Court amount; the mixed September statement stays issued and labelled partial with Heights lines only; issuing is refused (403 `other_sites`); (2) a Court-only reader sees the Court-only statement issued, labelled partial, without its whole-owner payout line; (3) the full-scope officer sees everything, then the Court grant is withdrawn and the next list and lookup are identical to the never-issued session. Every read and refusal leaves the store byte-identical.
- Mutations: M26 (the shared rule lets anyone know every statement), M27 (the office list guard removed), M28 (the office lookup guard removed); M19 now breaks the landlord view's call of the shared rule. Results in D4.

### D4. Results of the final regression

- tsc and lint (logical CSS, i18n parity 10,884 keys) clean; **Vitest 1,621 / 1,621** (57 files); **mutations 28 / 28 killed**, files restored byte-identically.
- **Complete combined regression** (every e2e spec + the S.3 evidence spec; Chromium, production build, 3 workers, retries off): run 1 **426 / 429** — three Gate C.1 tests "timed out" because the PC entered Modern Standby at 18:04:50Z and resumed at 20:03:26Z (System log), mid-test; they passed 15 / 15 alone afterwards; **run 2 429 / 429 in 39.3 min**.
- **Axe:** 1,506 scans, **0 violations** (S.3: 80).
- **Firefox + WebKit smoke, every smoke spec:** **50 / 50** (one run).
- **Known intermittents:** D.1 `identity.spec.ts:327` passed in both combined runs and 10 / 10 alone. **WebKit** S.2a "a new guard" passed in the smoke run, but alone ten times on battery it passed 4 / 10 (closure 1: 8 / 10 on this branch and on clean `04b6fde`); the A/B was not repeated on battery; closure 2 touches no HR or UI code.
- No screen changed; the register is unchanged (449 / 362; 139 built, 43 partial, 180 planned).

## Issue #17 closure

GPT's independent review of `7df5f80` (Issue #17, 6 November 2026) accepted the core money model at source level and put the gate on **PROVISIONAL / HOLD** for one P0, one P1 and the integration of Issue #18. This closure answers each point. Chain: `474e4ae` (S.2b, accepted) → `7df5f80` (S.3 as reviewed) → merge `0dd9723` (with `04b6fde`) → the closure commit (SHA in the delivery message). No rebase, no force-push.

### C1. Merge of the accepted Issue #18 hotfix (`04b6fde`)

- `git merge --no-ff 04b6fde` into `feature/gate-s3-rentals` → merge commit **`0dd9723`**. **No textual conflict:** the two branches change disjoint files (S.3: rentals, contracts, catalogue, roles, register, nav, i18n `rentals`/`common`/`nav`/`platform`; the hotfix: S.1/C.2 finance and collections handlers, `bank-scope.ts`, `common.ts`, `useApi.ts`, i18n `finance`/`collections`, its own tests and `docs/status/s1-hotfix/`). tsc was clean and the full Vitest suite passed (1,603 / 1,603) on the merge before any closure change.
- **Semantic integration** (the rules the hotfix made shared, applied consistently to rentals in the closure commit):
  - **Idempotency code.** Rentals already bound every create's key to operation, principal, target and the normalised request (Issue #16), but refused reuse as `409 idempotency_conflict`. Payroll (accepted) and S.1 (hotfix) use `409 idempotency_key_reused`, which the shared UI helper `isKeyReused` recognises. Rentals now uses the same code (message key `rentals:problems.idempotencyKeyReused`, payroll's wording, EN and UR). Every create is covered and tested: lease, renewal, rent roll preview, statement issue, payout instruction, agreement version (`rentals.issue17.api.test.ts`).
  - **One key per logical create in the UI** (`useCreateKey`, `isKeyReused`): the new-lease wizard (kept until the whole save, including the submit, succeeded), the Lease 360 drawer forms, rent roll preview, statement issue, payout instruction and agreement version drafting. Before, each press minted a fresh key, so a double press could reach the server as two requests.
  - **Bank feed (`seesBankFeed`).** Rentals reads no S.1 bank data. The one bank-derived field it could carry is a settled statement line's source reference (the bank's line), which exists only when a settlement event exists (none can in this gate; tests inject one). It now goes through `seesBankFeed` in the one statement projection: readers without `bank.view` or `bank.reconcile` (every Riverbend role, every landlord) get the amount, never the reference.
- **Counts reconciled.** Screen register: unchanged at **449 rows / 362 distinct** (139 built, 43 partial, 180 planned): the hotfix added no row. Module catalogue: 30 (the hotfix added none). i18n: 2 locales × 27 namespaces, **10,884** keys each (S.3 alone: 10,866; the hotfix added `finance`/`collections` keys; the closure renamed one rentals key and added two). Test counts in [test-results.md](test-results.md).

### C2. P0: the landlord view and owner-wide data

**Finding (reproduced).** `landlordView()` listed every issued statement and every pending payout of the owners behind the landlord's permitted units, and `landlordStatement()` treated owner-wide lines (`siteId: ''`, payout instructions) as always visible. With the new negative tests run against the original `portal.ts`, the three partial-landlord cases fail (a Court-only statement is listed to a Heights-only landlord; `test-results-s3/p0-repro-original-portal.txt`).

**Fix: one site projection rule** (`packages/fixtures/src/rentals/views.ts` `projectStatement`), used by the office (`projectBody`) and by both portal endpoints (`portal.ts`):
- **Owner footprint** (`ownerFootprint`): every site an owner's rentals records touch — the leases they let, their approved expenses, settlement events and issued statements — whether or not rentals is licensed there today.
- **Permitted sites** of a landlord for an owner: the sites of their Rule R units of that owner (verified link in force, landlord role, portal and rentals for that site). The landlord is **whole** for the owner only if the permitted sites include the whole footprint.
- **Whole:** the statement as issued, and the owner's pending payout instructions.
- **Partial** (a site's rentals grant withdrawn, a link ended, a link unverified): a **labelled partial statement** — the permitted sites' lines only, totals recalculated from those lines and the permitted sites' own frozen openings — never an owner-wide line (`siteId: ''`), owner-wide opening or payout instruction; the list marks it "Partial statement". A statement with **no permitted site** is not listed, and its id answers exactly like an id never issued (`404 not_found`, same body). No payout card. Nothing synthetic: no settlement or payment is created to fill a gap.
- **Office, same rule:** `ownerWhole` now also needs every site of the owner's footprint, so a site whose rentals grant was withdrawn makes the owner partial for every member of staff: owner-wide figures are withheld and owner-wide actions (issue, prepare a payout, draft an agreement version) are refused until the grant returns (fail closed, R8).
- **Contract:** `LandlordView.statements[].scopeLimited`. **UI:** the partial badge in the landlord's list; the drawer's notice now also says payout lines are left out.
- **Negative tests** (`rentals.issue17.api.test.ts`): the fictional owner Tahira Rehman lets a flat at Riverbend Heights (A) and one at Riverbend Court (B). TEST ONLY: settled rent on both sites with bank references, a whole-owner payout instruction (prepared through the office route) and the October statement issued through the office route, plus an injected Court-only issued statement carrying a whole-owner payout line. Then (a) the Court rentals grant withdrawn, (b) her Court link ended, (c) her Court link unverified. Both portal reads are serialized and contain no site-B or whole-owner id, reference, amount, tenant name, payout metadata, bank reference or count; the hidden statement and an unknown id give identical refusals; reads and refusals leave the store byte-identical. With full authority she keeps everything that is hers. The office fail-closed case is tested too. **Mutations** M16–M19 and M23 (each breaks one part of the projection) are killed.

### C3. P1: issuing is its own permission

- New permission **`owner_statement.issue`** (contracts `permissions.ts`, module `rentals` in `access.ts`), held **only by Riverbend's client money accounts officer** (`accounts_officer`, Usman Ghani), who already issues in the reference flow and the seed. No other role and no starter set holds it (tested over every organisation's roles and every starter set). Maker-checker is unchanged: the officer prepares payout instructions and the finance controller approves them; nobody approves their own statement because issuing is a single act by the authorised officer on a frozen snapshot.
- **Server:** `POST /rentals/owner-statements/issue` requires it at the transport, before any id is read: a view-only reader gets `403 permission_missing`, identical for a real and a never-registered owner, and nothing changes. `statementView` offers `issue` only to its holders and tells everyone else why (`blocked: issue_permission`).
- **UI:** a view-only reader (portfolio manager, finance controller, director) has no Issue control; the statement says "Only the client money accounts officer issues statements to owners. You can read and print this one; issuing it is for them." (EN and UR; screenshots h01, h04). `owner_statement.view` stays read-only.
- **Tests:** API (view-only refused and unchanged, issuer, roles), e2e (three readers see the reason, their direct request is refused, Usman issues), Firefox/WebKit smoke. **Mutations** M20–M22 killed.

### C4. Owner rulings recorded (GPT review, 6 November 2026)

| # | Decision | Ruling |
|---|---|---|
| R1 | Keep "Riverbend Estate Managers (Demo)" | **Accepted** (owner policy default) |
| R2 | Finance controller holds tenant-local `lease.view` and `rentals.configure` | **Accepted** with checker separation (the director drafts versions, the controller approves; never their own) |
| R3 | "Client-money accounts officer" replaces the maintenance starter (tenant-local role) | **Accepted** |
| R4 | Statements issued by any `owner_statement.view` holder | **Rejected — tighten issuance.** Done: `owner_statement.issue` (C3) |
| R5 | Term 1–36 months, due day 1–28, no pro-rating | **Accepted as a demo-only placeholder** |
| R6 | Owner payouts behind the `rentals.owner_payouts` site feature | **Accepted** |
| R7 | Lease activation by a second person with `lease.manage` | **Accepted** |
| R8 | D-33 (issuing model) and D-48 (settlement evidence) | **Remain unapproved legal and settlement decisions: fail closed.** Unchanged: both models are labelled fictional alternatives; nothing is settled, posted or paid; the closure's office rule fails closed on a withdrawn site |

### C5. Results of the closure (details in [test-results.md](test-results.md))

- tsc and lint (logical CSS, i18n parity 2 × 27 namespaces, 10,884 keys) clean; **Vitest 1,618 / 1,618** (57 files; rentals 100, of which 14 new); golden vectors pass.
- **Mutations 25 / 25 killed** (10 new for P0, P1 and the Issue #18 rules), each file restored byte-identically.
- **Complete combined regression** (every e2e spec, gates B to S.3 and the S.1 hotfix, + the S.3 evidence spec; Chromium, production build, 3 workers, retries off): **428 / 429 in 52.0 min**. The one failure is the D.1 branding test `identity.spec.ts:327` (a single-read assertion right after a click at ~90 % CPU), untouched by this work; alone, `--repeat-each=10`: 10 / 10.
- **Axe:** 1,506 scans in that run, **0 violations** (S.3: 80).
- **Firefox + WebKit smoke, every smoke spec** (8 files, 3 workers, retries off): run 1 **50 / 50** (3.2 min); run 2 **49 / 50** (3.4 min). Firefox 25 / 25 both times.
- **WebKit, separately:** run 1 25 / 25; run 2 24 / 25: the known S.2a intermittent "a new guard…" (the option click did not close the list). A/B, that test alone, `--repeat-each=10`, 1 worker: **this branch 8 / 10, clean `04b6fde` 8 / 10**, same symptom: pre-existing, not caused by S.3; the test is unchanged.

### C6. Screens and evidence

- Statuses unchanged and honest: **BUILT** RNT-001, RNT-003, RNT-007, RNT-008 (drawer), PORTAL-037; **PARTIAL** RNT-002, RNT-004, RNT-005, RNT-006, RNT-009 (drawer). Register rows RNT-005 (permission column: `owner_statement.view; owner_statement.issue`, tests, note) and PORTAL-037 (tests, note) updated; no status changed.
- New screenshots (18, `docs/status/gate-s3/screenshots/h…`): h01 read-only statement with the reason (1440, 390; EN, UR), h02 partial landlord view (1440, 390; EN, UR), h03 partial statement drawer (1440, 390; EN, UR), h04–h06 the same at 320 px with 200 % text (EN, UR). Each file's width was checked against the viewport in its name and every phone and 200 % capture was looked at. All earlier S.3 screenshots were regenerated byte-identical; the video was re-recorded by the run and the committed one kept (same flow).
- The partial landlord is shown with the demo's narrow-only site scope (`demo:site-scope`, which now also narrows a resident's or landlord's links to the listed sites; it never adds or changes a link), standing in for an ended Court link.

### C7. Remaining risks and open decisions

- Settlement of rent, deposits and payouts still waits for a lease and payout subject in the S.1/C.2 reconciler (G1); posting stays refused (RNT-004 PARTIAL). D-33 and D-48 remain open (R8).
- Statement references come from one organisation-wide counter (G4 in [SECURITY_FINDINGS.md](SECURITY_FINDINGS.md)).
- Manual screen-reader and device checks remain open ([MANUAL_VERIFICATION.md](MANUAL_VERIFICATION.md)), now including the two closure states.

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
- (Gate build, before the closure.) Typecheck, lint (with logical CSS and i18n parity: 2 locales × 27 namespaces, same keys): clean.
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

## 4. Decisions made in S.3 (rulings: closure C4)

| # | Decision | Why |
|---|---|---|
| R1 | Riverbend keeps its display name "Riverbend Estate Managers (Demo)" (Issue #17 says "(Portfolio Demo)") | Accepted HQ tests assert the name; the edition is portfolio |
| R2 | The finance controller holds `lease.view` and `rentals.configure` (matrix: neither) | An approver reads leases; agreement versions need a second signatory |
| R3 | Riverbend's "maintenance" starter role is replaced by "Client-money accounts officer" | Keeps six roles (accepted role test) and splits the payout maker-checker pair |
| R4 | ~~Statements issued by any `owner_statement.view` holder~~ → issuing needs `owner_statement.issue` (closure C3) | Ruled: tighten issuance |
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
- **Issue #17 closure:** `rentals.api.test.ts`, three assertions: the refusal code `idempotency_conflict` → `idempotency_key_reused` (the shared code; nothing else in them changed) and one test title. `tests/e2e/s3.spec.ts`: the screen list of the axe, 320 px and dark-mode loops gains the read-only statement; the axe and 320 px loops also check the partial landlord view. No assertion was weakened, skipped or retried.
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
- Tests: `packages/fixtures/src/rentals/{rentals.test.ts,rentals.api.test.ts,rentals.issue17.api.test.ts,rentals.vectors.json,rent-test-kit.ts}`, `tests/e2e/s3.spec.ts`, `tests/evidence/gates3.evidence.spec.ts`, `tests/smoke/s3.smoke.spec.ts`.
- Issue #17 closure: `packages/contracts/src/{permissions,access,rentals}.ts`; `packages/fixtures/src/rentals/{views,portal,handlers}.ts`, `role-templates.ts`, `demo-licence.ts` (+ test); `apps/backoffice/src/pages/rentals/{OwnerStatementsPage,NewLeasePage,Lease360Page,RentRollPage,PayoutsPage,RentalSettingsPage}.tsx`; `apps/customer-web/src/pages/rentals/LandlordPage.tsx`; i18n `rentals` (EN, UR); register rows RNT-005, PORTAL-037.
- Register: `docs/ui/screen-register.csv` (10 rows appended), `packages/contracts/src/screens/register.generated.ts`.

## 9. Stop

S.3 is **provisional**: the Issue #17 closure is pushed to `feature/gate-s3-rentals` only (a fast-forward of `7df5f80`), for GPT and owner review. No merge into `main`, no deploy.
