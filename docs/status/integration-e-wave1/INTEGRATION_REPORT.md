# Gate E Wave 1 integration (Issue #25): E.0 + E.1 + E.2 + E.7 + E.13 + B10

Agent 1, worktree `D:\laragon2\www\propertyos-int-e-wave1`, branch `integration/e-wave1` from the accepted
`integration/s3-b1-b2@373d0cf`. Bounded integration and regression only (Issue #25): no E.3/E.4/E.5 source work,
no `main`, VPS, Bingoo, Laravel, payments, SOS, Issue #13, private Nizam material or `PROJECT_HANDOFF.md`.
**Status: pushed for GPT and owner review. Nothing is promoted to BUILT.** Test outcomes are in
[test-results.md](test-results.md), findings in §11 below, the manual checklist in
[MANUAL_VERIFICATION.md](MANUAL_VERIFICATION.md).

Results at a glance (code `97474f8`, all on AC power):
- Vitest **1,951 / 1,951**.
- Complete Chromium run (every historical e2e spec plus the evidence specs) **725 / 728**. The 3 failures had one
  cause, fixed in `97474f8`; their specs then passed **70 / 70**.
- Firefox and WebKit smoke **98 / 98**. axe **0 violations** in 2,092 scans.
- Mutations: E0 51/51, E1 18/19, E2 20/20, E7 19/20, E13 18/18, B10 2/2, seams 15/15. The two survivors are
  equivalent, as on their branches.
- B10's own 712 / 717 is **not** reported as green here. This is a separate complete run on the integrated code.

## 1. Merge ancestry

Six `--no-ff` merges in the order Issue #25 gives; each source SHA is its merge's second parent (no rebase, no
squash, no force push). Then four reconciliation commits, one separate test-only commit for the C.2 videos, the
fixes from the integration's own browser and mutation runs, and the docs.

```
* <docs>     Wave 1 integration: report, test results, manual QA, evidence (this folder)
* 97474f8    Wave 1 integration: INV-002 amount strips keep each figure whole at 320 px / 200 % (F-INT-W1-20)
* d8de2df    Test-only: E.7 cross-entity write check uses the roster's journal maker (F-INT-W1-19)
* 6c2a4b6    Wave 1 integration: year-form ledger series and Lead 360 e-mail wrap (F-INT-W1-18, F-INT-W1-11)
* 36896f1    Test-only: Gate C.2 video specs reach the statement through the current navigation (B10 finding)
* f57d31b    Wave 1 integration: E.13 registry with E.1/E.2/E.7 records, task kinds, deep links, register notes, seam tests
* ed6dda3    Wave 1 integration: E.1, E.2, E.7 and E.13 helpers swapped onto E.0's canonical ones
* c26aee3    Wave 1 integration: one hold ledger, clock and projection for INV-002; Urdu 320 px quick view
* eb6dc82    Wave 1 integration: one roster, canonical permissions, one route and handler registry
*   b1d0645  Integrate UX B10 reflow and focus fix (0774049)                    parents 30042f5 0774049
*   30042f5  Integrate Gate E.13 connected workspaces and documents (0809ba3)  parents c71d143 0809ba3
*   c71d143  Integrate Gate E.7 accounting and banking (4a49ffc)              parents b3c13be 4a49ffc
*   b3c13be  Integrate Gate E.2 projects and inventory (9d74405)              parents b5b99b9 9d74405
*   b5b99b9  Integrate Gate E.1 CRM pipeline (31b6027)                        parents 544e3f2 31b6027
*   544e3f2  Integrate Gate E.0 foundation (b3a3b42)                          parents 373d0cf b3a3b42
```

The merge commits resolve textual conflicts only, always to E.0's canonical text for the roster and permission
files, and keep both sides of the registration hooks; every deliberate reconciliation decision is in the four
commits after them, so each can be reviewed on its own.

## 2. Conflict-resolution matrix

| File | Conflicted in | Resolution in the merge | Reconciled in |
|---|---|---|---|
| `contracts/src/permissions.ts` | E.1, E.2, E.7, E.13 | E.0's canonical block kept; identical names dropped | eb6dc82: `storage.manage` retired |
| `contracts/src/access.ts` | E.1, E.2, E.7, E.13 | E.0's `PERMISSION_MODULE` block kept | — |
| `contracts/src/persona.ts` | E.2, E.7, E.13 | both unions kept | eb6dc82: one roster union |
| `contracts/src/index.ts` | E.1, E.2, E.7, E.13 | all exports kept (`developer`, `sales`, `projects`, `ledger`, `productivity`, `documents`) | — |
| `fixtures/src/people.ts` | E.1 (conflict), E.7 and E.13 (auto-merged, reverted) | E.0's four people | eb6dc82: + Saad, + Haroon |
| `fixtures/src/role-templates.ts` | E.1, E.2, E.7, E.13 | E.0's roles (E.1's `sales_manager` id collided with E.0's) | eb6dc82: + ledger_clerk, + records_clerk, controller + `period.close` |
| `fixtures/src/role-templates.test.ts` | all four | E.0's constant | eb6dc82: count derived from `LARKSPUR_ERP_ROLES`, roster pinned by id |
| `fixtures/src/handlers.ts` | E.1, E.2, E.7, E.13 | every area spread kept (syntax fixed) | eb6dc82: back to E.0's text; areas in `DEVELOPER_AREA_HANDLERS` |
| `backoffice/prototype/routes.tsx` | E.2, E.7, E.13 | every hook kept | eb6dc82: back to E.0's text; areas in `DEVELOPER_AREAS` |
| `i18n/src/resources.ts` | E.2, E.7, E.13 | all namespaces kept (`sales`, `projects`, `ledger`, `documents`) | — |
| `i18n/locales/*/workspace.json` | E.13 | E.0's 18 permission labels kept, E.13's 4 duplicates dropped, E.13's `hub` block kept | f57d31b: labels of the new record and task kinds |
| `tests/support/fixtures.ts` | E.2 | both kept | eb6dc82: canonical `PersonaId` list |
| `contracts/src/crm.ts` + `projects.ts` `UnitHoldView` | E.0 vs E.2 (type clash, not textual) | — | c26aee3: one type in `crm.ts` |
| `docs/ui/screen-register.csv`, `register.generated.ts` | auto-merged (disjoint rows) | — | f57d31b: notes of the 34 rows |
| B10 files (`StatTile`, `Dialog`, `int-s3b.spec`) | none | clean merge | — |

## 3. Reconciled principals and permissions

### 3.1 One roster (Larkspur, all fictional)

| Persona | Principal | Name | Role | Permissions beyond the starter set | From |
|---|---|---|---|---|---|
| `lsp_sales_manager` | `usr_lsp_0004` | Hamza Rashid | sales_manager | sales starter + lead.manage, lead.assign, project.view, document.view, document.upload | E.0 (absorbs E.1's Samina Latif) |
| `lsp_project_manager` | `usr_lsp_0005` | Mehwish Kazmi | project_manager | project_management starter + project.view, project.manage, inventory.manage, document.view, document.upload, document_template.manage | E.0 (absorbs E.2's Hina Baig) |
| `lsp_accounts` | `usr_lsp_0006` | Faiza Noor | accounts_officer | project.context.use, gl.view, gl.manage, journal.create, bank.view, bank.import, document.view, document.upload | E.0 (absorbs E.7's Kashan Wasti) |
| `lsp_finance_controller` | `usr_lsp_0007` | Zubair Ansari | finance_controller | project.context.use, reports.view, unit.view, project.view, project.approve, gl.view, gl.approve, journal.approve, gl.post, **period.close**, bank.view, bank.import.approve, document.view, document_template.approve | E.0 (absorbs Kashan Lodhi, Mehreen Aslam, Tehmina Durrani) |
| `lsp_ledger_clerk` | `usr_lsp_0008` | Saad Hameed | ledger_clerk | gl.view, journal.create (no bank permission) | E.7, kept: the `bank.view` boundary maker |
| `lsp_records_clerk` | `usr_lsp_0009` | Haroon Qadri | records_clerk (Larkspur Heights only) | project.context.use, lead.view, unit.view, customer.view, document.view, document.upload, document_template.manage | E.13, kept: the project-limited document reader |

Removed: Samina Latif (`sales_manager`), Hina Baig (`lk_project_officer`), Kashan Lodhi (`lk_projects_director`),
Mehreen Aslam (`lk_controller`), Kashan Wasti (`lk_treasury`), Tehmina Durrani (`lsp_doc_controller`). The branches had
reused `usr_lsp_0004`/`0005` for different people; every principal is now one person (seam test). Larkspur has
6 starter roles + 6 ERP roles; `role-templates.test.ts` derives the count from `LARKSPUR_ERP_ROLES` and pins the six
roles and their single holders by id. Existing people gain nothing beyond E.0's F-3 `lead.manage` (foundation test).

Maker–checker pairs: project setup Mehwish → Zubair; journals Faiza or Saad → Zubair (approve and post); chart and
posting rules Faiza → Zubair; statement import Faiza → Zubair; templates Mehwish or Haroon → Zubair; period close
and reopen approval Zubair, reopen request Faiza or Saad. Nobody holds both sides of any pair (foundation test).

### 3.2 Permission names (E.0 canonical only)

| Area action | Branch name | Canonical |
|---|---|---|
| E.1 write to a lead (activity, status, follow-up; F-3) | lead.manage | lead.manage |
| E.1 assign leads; see the whole project (E-05) | lead.assign | lead.assign |
| E.1 convert, move, lose, reopen opportunities | lead.manage | **lead.manage AND lead.assign** (`requiresAll`, transport) |
| E.2 read projects / draft setup / activate | project.view / manage / approve | same |
| E.2 allocate and release storage | storage.manage (**retired**) | inventory.manage |
| E.7 read the ledger | gl.view | gl.view |
| E.7 draft, edit, submit, cancel, reverse a journal | gl.post | journal.create |
| E.7 approve / reject a journal | journal.approve | journal.approve |
| E.7 post an approved journal | gl.post | gl.post |
| E.7 chart and posting-rule drafts | gl.post | gl.manage |
| E.7 chart approval, posting-rule apply (still refused, E-17) | journal.approve | gl.approve |
| E.7 close a period, approve a reopen | period.close | period.close |
| E.7 request a reopen | gl.post or period.close | journal.create or period.close |
| E.7 statement import preview, submit, discard | bank.reconcile | bank.import |
| E.7 statement import approve, reject | bank.reconcile | bank.import.approve |
| E.7 read imports and bank lines | bank.view | bank.view (`bank.reconcile` stays S.1's) |
| E.13 documents and templates | document.* / document_template.* | same; attaching to a lead also needs lead.manage (F-3) |

Retired: `storage.manage`; E.7's use of `bank.reconcile` for imports. New mechanism, no new permission:
`requiresAll(module, [p1, p2], suspension)` in `handler-types.ts`, checked by `decideEndpoint` before anything is read
or recorded (an in-handler check would have recorded the D.1 sign-in session first; found by E.1's own test).

## 4. Canonical route, handler and access matrix

All 34 Wave 1 addresses are registered once, through `routes.developer.tsx` `DEVELOPER_AREAS`, with E.0's `devRoute`
and `DevScreen` (edition first, then access). `DevScreen` gained an optional `refusal: 'outcome'` (Gate B access
outcome) so E.2, E.7 and E.13 refuse in words as they did; E.1 keeps E.0's register page. Static route audit: 175
paths, 34/34 Wave 1 addresses served exactly once, the only repeated path is the pre-existing pair of `*` catch-alls
(shell and root). Mock API: one entry per area in `DEVELOPER_AREA_HANDLERS`; `registry.integration.test.ts` checks one
registration, no duplicate method + pattern in the whole mock API and tenant access on every Wave 1 endpoint.

| Area | Route module | Addresses | Edition | Screen target | Refusal | Handlers |
|---|---|---|---|---|---|---|
| E.1 crm | `pages/developer/crm/routes.tsx` | crm/lead-assignment, opportunities-pipeline, opportunity-360-workspace, site-visits-calendar, visit-workspace | DEV | crm + lead.view | register page | `CRM_PIPELINE_HANDLERS` |
| E.2 projects | `prototype/routes.projects.tsx` | prj/projects-list, project-360-workspace, project-setup | DEV | projects + project.view/unit.view | access outcome | `DEV_INVENTORY_HANDLERS` |
| E.2 inventory | `prototype/routes.projects.tsx` | inv/unit-matrix, unit-quick-view, live-availability, storage-inventory | DEV | inventory + unit.view | access outcome | (same) |
| E.7 ledger | `pages/developer/ledger/routes.tsx` | acc/chart-of-accounts … posting-rules (10), bank/bank-import | DEV+COMM | accounting + gl.view (create: journal.create; bank: banking + bank.view) | access outcome | `LEDGER_HANDLERS` |
| E.13 workspace | `prototype/routes.workspace.tsx` | global/unified-search-results, recent-records, favorites, home/my-tasks, work-queue, recent-activity | ALL | core (readable while suspended) | register page | `E13_HANDLERS` |
| E.13 documents | `prototype/routes.workspace.tsx` | doc/document-preview, upload-drawer (redirect), document-versions, expiring-documents, templates-and-policies | ALL | core + document.view | access outcome | (same) |

Menu: E.0's canonical **Accounting** item (gl.view) opens E.7's chart of accounts (no `match`, D-E0-09). No other
menu, quick-create or nav change.

## 5. Shared helpers: what each area now uses

| Concern | E.0 canonical | E.1 | E.2 | E.7 | E.13 |
|---|---|---|---|---|---|
| Record scope | `developer/scope.ts` | `projectVisible` (identical to E.1's check) + E-05 "assigned" layer | `projectGoverned` (id lookups ignore the header filter, as E.2 did) | `entityWhole` (U14: a project-limited reader reaches no ledger) | `projectGoverned` + E.13's persona-scope guard |
| Whole organisation | `organisationWhole` (new, in E.0's module) | — | replaces `organisationWide` | — | replaces `orgWide` |
| Bound idempotency | `idempotency.ts` | adapter `bound()` | adapter `replayOf/remember` (hold replay derives its result from the bound expiry) | adapter `bound()`; `keyReused` | adapter `replayOf/remember` |
| Developer state | `developer/state.ts` | section `developer.crm` (v2) | entity names from developer state | entity, code LSP, cost centres, collection account `dca_lsp_01`, numbering series; section `developer.ledger` (v2); E-08 second entity = E.0's | documents state v2 |
| Holds | `crm-holds.ts` | — | `holdActive`, `activeHolds`, `releasableBy`, `holdUntil`, `lapsedHolds`, `mayRelease`, `requestNow`, `holdViewFor`, `SEED_HOLD` (its copy removed) | — | — |
| History projection | `projection.ts` | own projections kept (different output contract: `sanitised`, `mine: to_me`); checked with E.0's `compareProjection` | own `projectEvent` | own views | own (Issue #16 pattern) |

E.0 extensions made here (all marked "Wave 1 integration"): `organisationWhole`; `crm-holds.ts` gains E.2's helpers
and the one projection `holdViewFor`; Larkspur's collection account now carries the last four digits of the account
the buyer portal shows (`7890`, was `4021`: the same account, two numbers); E.0's journal and statement-import series
take the year form E.7's screens were checked with (`LSP-JV-{yyyy}-{seq:4}`, `LSP-BIM-{yyyy}-{seq:4}`; the month form
went off-screen at 320 px / 200 %, F-INT-W1-18); `requiresAll` in the transport.

## 6. INV-002 and holds

- One hold store (`ctx.demo.holds()`), one clock (`holdClock`, read once per request via `requestNow`), one active-hold
  projection (`activeHolds`), owner-only release (`releasableBy` / `mayRelease`), legacy holds released by nobody,
  and one view (`UnitHoldView`: `source` live or seed, `until`, `leadRef`/`leadId` only for a reader who may see the
  lead, `holderName`, `releasable` only for the initiator). E.2's `mine` flag and duplicate type are gone.
- Both UIs remain (the CRM quick view of matching units on Lead 360 and E.2's matrix drawer); both read the same
  projection. Seam tests: a CRM hold is identical in INV-002 and released there by its initiator only; at the
  expiry instant both stop showing it.
- E.0's Urdu 320 px finding is fixed. Measured in the browser, it had two causes: the 111 px of sideways scroll came
  from Lead 360 itself, under the drawer (the party's e-mail address in an unbreakable LTR span, 394 px wide), now
  allowed to wrap; and the drawer's two amount strips needed 301 px in a 200 px column. With `AmountStrip wrap`
  (opt-in, only this quick view) a strip whose amount cannot fit beside its icon puts the label and amount under the
  icon at the strip's whole width, and the amount wraps at the space after its currency, so each figure stays whole
  (F-INT-W1-20). The title keeps `LH-A-0102` whole (`Drawer heading`, opt-in; the dialog's name is unchanged).

## 7. E.13 record registry

| Kind | Provider | Rule | Link |
|---|---|---|---|
| opportunity (`opp_`) | `developer/crm/records.ts` | E.1 scope (`crmScope`, E-05) | `/backoffice/crm/opportunity-360-workspace?record=` |
| visit (`vst_`) | same | the visit's lead visible to the reader | `/backoffice/crm/visit-workspace?record=` |
| storage (`stg_`) | `developer/inventory/records.ts` | E.2 inventory scope | `/backoffice/inv/storage-inventory?project=…&q=<ref>` |
| account (`gla_`), journal (`jnl_`) | `developer/ledger/records.ts` | gl.view over the whole entity (`entityWhole`); no bank data in a reference | `/backoffice/acc/account-workspace?record=`, `/backoffice/acc/journal-entries?record=` |
| project, unit | E.13 core providers (the shell's rule, as GET /access/record) | unchanged | PRJ-002 (live) and **INV-002** (was the planned Unit 360) |

Task kinds added: `journal_approval` (E.7, the checker's; never the maker's) and `project_activation` (E.2, a submitted
setup for `project.approve` holders). Activity sources of E.1/E.2/E.7 are not added (§11.4, F-INT-W1-15).
PRJ-002's Documents tab now shows E.13's documents of the project (per-record access through GET /workspace/related),
live for `document.view` holders and an access outcome for others. E.1's project link no longer says "planned".

## 8. Money rules (E.7) kept

All 11 E.7 screens stay PARTIAL (E-15…E-18, U1–U15). No automatic posting from society or Rentals data (posting
rules are proposals; apply is refused 409 `decision_pending`); no inferred settled money (statement lines settle
nothing); entity-wide reports refuse project-limited readers (`entityWhole`; seam test and E.7's projectsOnly test);
no bank-feed leakage to a reader without `bank.view` (E.7's tests plus the registry's references).

## 9. Screen register

`npm run register:sync`: **449 rows, 362 distinct screens: 139 BUILT, 76 PARTIAL, 147 PLANNED** (baseline 139 / 43 /
180; the 33 PLANNED Wave 1 rows are now PARTIAL; INV-002 was PARTIAL already). The generated register needed no change.
**No screen is promoted to BUILT:** every one of the 34 still has an open owner decision (E-06 and E-07 for all; E-05,
E-28 for E.1; E-10, E-11, E-24, E-37 for E.2; E-15…E-18, E-27, E-29, E-33, E-37 and U1–U15 for E.7; E-35 for E.13),
and GPT/owner review of this integration is outstanding. The 34 rows' notes now say so (status unchanged).

## 10. End-to-end traceability

| Screen | Server (mock API) | Unit/API tests | Browser tests | Evidence |
|---|---|---|---|---|
| CRM-006/007/008/009/011 | `developer/crm/handlers.ts` | crm-pipeline.api, pipeline, integration-seams | e1-crm, e1.smoke, int-ew1 | gatee1, intew1 b01 |
| PRJ-001/002/003, INV-001/008/010 | `developer/inventory/handlers.ts` | inventory.api, inventory.vectors, integration-seams | e2-projects, e2.smoke, security, int-ew1 | gatee2, intew1 c01–c02 |
| INV-002 | `crm-handlers.ts` + `developer/inventory/handlers.ts` + `crm-holds.ts` | crm-gate-e0-*, inventory.*, integration-seams | e0-foundation, e2-projects, int-ew1 | gatee0, gatee2, intew1 a01–a02 |
| ACC-001…010, BANK-005 | `developer/ledger/handlers.ts` | ledger, ledger.api, integration-seams | e7-ledger, e7.smoke, int-ew1 | gatee7, intew1 d01–d02 |
| GLOBAL-002/005/006, HOME-002/004/005, DOC-002…006 | `developer/workspace/*`, `developer/documents/*` | workspace.api, documents.api, registry.integration, integration-seams | e13-workspaces, e13.smoke, int-ew1 | gatee13, intew1 b02–b03, d03 |

## 11. Findings

"Fixed" means fixed on `integration/e-wave1` with a test; the rest are recorded for the owner or a later gate.

### 11.1 Security and access (fixed)

| # | Finding | Where | Fix | Test |
|---|---|---|---|---|
| F-INT-W1-1 | **Silent grant through F-3.** E.0 gave `lead.manage` to Nadia, Bilal and Zain (lead writes). E.1 used `lead.manage` alone for converting, moving, losing and reopening opportunities, so a plain merge would have given those three the pipeline. | E.0 × E.1 | Pipeline writes need `lead.manage` AND `lead.assign` (`requiresAll`, in the transport). No new permission. | seams "F-3 meets E.1"; E.1 "Bilal cannot convert or move"; mutants S07, S08 |
| F-INT-W1-2 | **A refusal recorded state.** A first in-handler version of that check let the transport record the D.1 sign-in session before refusing. | integration | Moved into `decideEndpoint` (`alsoRequires`), before anything is read or recorded. | E.1 "refused before anything is read" (byte-identical) |
| F-INT-W1-3 | **A records clerk as a lead owner.** E.13's clerk holds `lead.view` (to read lead documents), so E.1's picker would offer him leads he cannot work (F-3). | E.1 × E.13 | Owners hold `lead.view` and `lead.manage`; anyone else gets the unknown-id 422. | seams "only people who may work a lead"; S09 |
| F-INT-W1-4 | **Lead documents written with a read permission** (E.13's own note: "E.0 adds `lead.manage`"). | E.0 × E.13 | Attaching to a lead needs `lead.manage`; a visible lead without it answers 403 (no oracle). | documents.api "F-3"; workspace.api related; S10 |
| F-INT-W1-5 | **Principals reused for different people** (`usr_lsp_0004`: Hamza, Samina, Hina; `0005`: Mehwish, Kashan Lodhi). Audit, idempotency and maker ≠ checker compare principals. | E.0 × E.1 × E.2 | One roster; one person per principal. | seams "the one roster"; foundation; S06 |
| F-INT-W1-6 | **Two hold vocabularies and projections** (`releasable` vs `mine`/`source`, different lead-visibility checks). | E.0 × E.2 | One `UnitHoldView`, one `holdViewFor` on `decideRecord`. | seams hold ledger; M18, M19, E2-M14, S14 |
| F-INT-W1-7 | **Two code books for one entity** (E.7 `LKE` with its own cost centres and account; E.0 `LSP`, `cc_lsp_*`, `dca_lsp_01`; E.0's account ended 4021, the portal's 7890). | E.0 × E.7 | E.7 reads E.0's entity, code, cost centres, account and numbering; E.0's account carries 7890. | ledger vectors and API; foundation |
| F-INT-W1-8 | **Two test-only second entities** (E.7 LGD, E.0 LRD). | E.0 × E.7 | E.7's tests use E.0's E-08 fixture. | ledger.api cross-entity |
| F-INT-W1-9 | A naive swap of E.7's entity check to `entityVisible` would let a project-limited reader total the entity. | integration | `entityWhole`. | ledger.api projectsOnly; seams; S11 |
| F-INT-W1-19 | **A test went vacuous under the new roster** (found by the mutation re-run: E7-M10 "record of another entity readable" survived). E.7's "reverse another entity's journal answers like an invented id" sent the write as the finance controller, who in the reconciled roster is the checker without `journal.create`; both requests were refused by role before any lookup. The product code was right (the read path is also guarded by `scopeFor`). | E.0 × E.7 tests | Test-only commit `d8de2df`: the write comes from the ledger clerk (the maker, Larkspur only) and must be the 404 of an id never issued. | ledger.api no-oracle; E7-M10 caught |

### 11.2 Integration and UX (fixed)

| # | Finding | Fix |
|---|---|---|
| F-INT-W1-10 | Four hooks in `routes.tsx`, four spreads in `handlers.ts`. | One registration each in `DEVELOPER_AREAS` / `DEVELOPER_AREA_HANDLERS`. |
| F-INT-W1-11 | INV-002 CRM quick view, 320 px, 200 %, Urdu: 111 px sideways scroll; title broken inside "LH-A-0102" (E.0). The scroll came from Lead 360's e-mail (394 px, unbreakable), not the strips E.0 named; the strips overflowed their own column too. | E-mail wraps; opt-in `AmountStrip wrap`; `Drawer heading`. int-ew1 + evidence a02. |
| F-INT-W1-20 | **Found by the final complete run:** with the first `AmountStrip wrap`, the figure itself broke ("548,975.00" on 2 lines in a 212 px column) at 320 px / 200 %, EN and UR (int-ew1 :85, intew1 a02; 3 of 728). | `97474f8`: the strip's text moves under the icon when the amount cannot fit beside it; the figure stays whole. Quick-view specs 70/70 on the new build. |
| F-INT-W1-18 | **Regression found by the integration's own run:** E.0's month-form series (`LSP-JV-202610-0003`) put E.7's references off-screen at 320 px / 200 % and broke one mid-reference at 390 px (e7-ledger 320 px and dark tests). | E.0's journal and import series take E.7's year form (`LSP-JV-2026-0003`). |
| F-INT-W1-12 | E.13 unit links opened the planned Unit 360; PRJ-002 Documents said "planned (E.13)"; E.1's project link said "planned". | INV-002; E.13 related records; plain link text. |
| F-INT-W1-13 | E.0's e2e spec asserted planned pages for Accounting and Projects (true before E.2/E.7 landed). | Asserts the live screens. |
| F-INT-W1-14 | Two Gate C.2 video specs clicked a bottom-bar link Gate D.2 removed (B10). | Separate test-only commit: Home → Statement. |

### 11.3 Open: owner decisions (conservative defaults kept)

| # | Item |
|---|---|
| D-INT-01 (E-06) | The one roster (§3.1); Zubair's role gains `period.close` from E.7's controller. |
| D-INT-02 (E-07) | Canonical names; `storage.manage` retired; pipeline writes need `lead.manage` + `lead.assign`; lead documents need `lead.manage`. |
| D-INT-03 (E-05) | Salespeople see only their own records on the new CRM screens (unchanged from E.1). |
| D-INT-04 | Template approval sits with the finance controller (E.0); E.13 had proposed a document controller. |
| D-INT-05 | Holder names shown to every reader of a held unit (E.2's design), now in the CRM view too (staff names only). |
| E-15…E-18, U1–U15; E-10, E-11, E-24, E-27, E-28, E-29, E-33, E-35, E-37 | As in each branch's report; every E.7 screen stays PARTIAL. |

### 11.4 Open: later gates

- F-INT-W1-15: HOME-005 has no E.1/E.2/E.7 activity sources yet (each needs a per-reader projection, §4.4).
- F-INT-W1-16: INV-002 has two components on one data path; one component is a later UX consolidation.
- F-INT-W1-17: Project 360's `documents` response field is an empty placeholder (the tab reads E.13).
- B10's open items (F-INT-2, F-INT-4, N-B2-7, MetricCard clamp, sidebar ellipsis, pay-form hint) are unchanged.
- Manual screen-reader, real-device and native Urdu review remain open (no WCAG claim).

## 12. Not done here (out of Issue #25's scope)

E.3/E.4/E.5 source work; E.0 roadmap items E.0 deferred (finance core adapter E-03, fixture truthfulness E-04, S.1
idempotency migration E-29, APR for all editions, live quick-create); E.1/E.2/E.7 activity sources in HOME-005; a
single INV-002 component (both quick views remain, on one data path); manual screen reader, device and native Urdu
review (no WCAG claim).
