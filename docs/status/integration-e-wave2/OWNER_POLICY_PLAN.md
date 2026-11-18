# Owner-policy follow-up plan: D-INT-03, D-INT-05, D-INT-06, D-INT-07

Agent 1, Wave 2 integration coordinator, 19 Nov 2026. Branch `integration/e-wave2`, accepted base
`integration/e-wave1@8126322`.

**This is a plan, not a change.**
- It changes no behaviour, activates nothing and marks no decision as decided.
- Every "GPT recommends" below is quoted from GPT's review of 8126322 and is **recommended — not approved**.
- Each item ships, only after the owner approves it, as its own bounded follow-up branch, never inside the Wave 2
  integration.
- Line numbers refer to `8126322`.

Fictional people who matter here. Only backoffice staff holding `lead.view`, `unit.hold` or `document.view` are
listed.

| Tenant | Persona | Name | Scope | lead.view | lead.assign | lead.manage | unit.hold | document.view | customer.view |
|---|---|---|---|---|---|---|---|---|---|
| Larkspur | `manager` | Nadia Rahman | all | ✓ | — | ✓ (F-3) | ✓ | — | ✓ |
| Larkspur | `sales` | Bilal Ahmed | Heights | ✓ | — | ✓ (F-3) | ✓ | — | ✓ |
| Larkspur | `lsp_sales_manager` | Hamza Rashid | all | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Larkspur | `lsp_records_clerk` | Haroon Qadri | Heights | ✓ | — | — | — | ✓ | ✓ |
| Larkspur | `lsp_project_manager`, `lsp_accounts`, `lsp_finance_controller` | Mehwish, Faiza, Zubair | all | — | — | — | — | ✓ | — |
| Crescent Bay | `cb_manager` | Zain Abbasi | all | ✓ | — | ✓ (F-3) | ✓ | — | ✓ |
| Shalimar | `facility_manager` | Saima Akram | all | ✓ | — | — | — | — | — |

The canonical record rule already in force on every new developer surface (F-GPT-W1-01):
- `packages/fixtures/src/developer/crm/scope.ts:74` (`assignedOrAssigner`);
- `:81` (`leadVisible`, with the header project);
- `:82` (`leadOpen`, for a lead reached by id);
- `:92` / `:99` (`crmScopeOf`, `leadOpenTo`).

Each follow-up below **reuses** it. None writes a new copy.

---

## D-INT-03: lead visibility on the legacy CRM routes (owner decision E-05)

### Current behaviour on 8126322

The new developer surfaces already apply the record rule: E.1, the hold views, E.2 and E.13
(INTEGRATION_REPORT §12). The **legacy** CRM routes still use the whole-project rule: any `lead.view` holder sees
every lead of the projects in their scope and header.

| Surface | Where | Rule today |
|---|---|---|
| Lead list `GET /leads` (CRM-002) | `packages/fixtures/src/crm-handlers.ts:51-54` `visibleLeads`, used at `:247` | `can(lead.view)` + `ctx.allowsProject` |
| Lead 360 `GET /leads/:id` and its writes `/activity`, `/status`, `/follow-up` | `crm-handlers.ts:177-182` `findLead`, used at `:314`, `:350`, `:369`, `:382` | `can(lead.view)` + `ctx.allowsProject`; writes also need `lead.manage` (F-3) |
| Sales home `GET /crm/summary` (counts, due follow-ups) | `crm-handlers.ts:186-190` | `visibleLeads` |
| Visits `GET /visits`, `POST /visits` | `crm-handlers.ts:56-57` `visibleVisits`; `:411` `findLead` | project only |
| Hold for a lead `POST /units/:id/hold` | `crm-handlers.ts:461-472` (`findLead` at `:467`) | project only. The hold *view* it returns already applies the record rule (`crm-holds.ts:102`) |
| Lead matching / unit cards on Lead 360 | `crm-handlers.ts:316-318` (`holdViews`) | lead by project; the hold view already applies the record rule |
| Shell search `GET /search` (leads part) | `packages/fixtures/src/handlers.ts:180-197` (leads at `:191-196`) | `lead.view` + `ctx.allowsProject` |
| Address check `GET /access/record` for `led_` | `handlers.ts:86-89` | `decideRecord(project, lead.view)` |
| Customer directory `GET /parties` | `handlers.ts:45-52` `visibleParties`, route at `:167` | `lead.view` OR `customer.view`; parties of every lead or invoice in allowed projects |
| E.13 party provider | `developer/workspace/records.ts:104-107` `partyVisible` | as `/parties` (kept as a distinct customer-directory rule in F-GPT-W1-01) |

> **GPT recommends — not approved:** "D-INT-03 restrict legacy CRM salesperson access to own leads; managers require
> project-scoped lead.assign."

### Options

- **A. Keep as is.** Legacy routes stay whole-project; only the new surfaces are record-scoped. Bilal can open
  Nadia's lead on Lead 360 but not find it in E.13, E.2 or E.1.
- **B. GPT's recommendation, leads only.** Every lead-bearing legacy route uses `leadOpenTo` (id lookups) and
  `crmScopeOf(ctx).leadVisible` (lists). Parties stay on the customer-directory rule.
- **C. B plus parties.** A party seen only through a lead (a prospect with no invoice) follows that lead's record
  rule for readers who reach parties through `lead.view`. Parties with an invoice stay on `customer.view`. A
  separate sub-decision is needed, because it changes the customer directory.
- **Sub-decision for B/C: Nadia (administration) has `lead.view` but no `lead.assign`.** Under B she sees only
  her own leads everywhere. If the owner wants administrators to see all leads, that is a role change: give
  administration `lead.assign` (a new grant) or a separate read-all permission. It needs its own approval.

### Code touchpoints (B; C adds the last row)

| File:line | Change |
|---|---|
| `crm-handlers.ts:51-54` `visibleLeads` | Filter `crmScopeOf(ctx).leadVisible` (header kept). Fail closed for a reader without a principal |
| `crm-handlers.ts:177-182` `findLead` | After the existing `can(lead.view)` (403 first, F-2 order), `!lead \|\| !leadOpenTo(ctx, lead)` → the same 404 as an id never issued. This covers Lead 360, its writes, `POST /visits` and `POST /units/:id/hold` |
| `crm-handlers.ts:56-57` `visibleVisits` | Keep visits whose lead `leadVisible` allows (visits carry `leadId`) |
| `crm-handlers.ts:186-190` `/crm/summary` | Counts follow `visibleLeads`, which applies automatically |
| `handlers.ts:191-196` `/search` leads | Filter `crmScopeOf(ctx).leadVisible` |
| `handlers.ts:86-89` `/access/record` `led_` | Allowed only if the project decision allows AND `leadOpenTo`. Unknown and hidden ids answer alike (`OUT_OF_SCOPE`) |
| (C) `handlers.ts:45-52` `visibleParties` and `records.ts:104-107` `partyVisible` | A party reached only through leads needs one of those leads to be `leadOpenTo`-visible to a `lead.view`-only reader. Invoice-linked parties are unchanged |

UI: nothing new. The lead list, Lead 360 and the Sales home already render whatever the API returns. Lead 360
for a hidden id already shows the "not found" outcome.

### Tests to add (the same structure as `developer/lead-privacy.test.ts`)

- **Positive:**
  - Bilal sees his own Heights leads in `/leads`, `/leads/:id`, `/crm/summary`, `/visits` and `/search`.
  - Hamza sees every lead of his projects.
  - Nadia sees her own.
- **Negative:**
  - Bilal → Nadia's Heights lead on every route above. `GET` gives a 404 equal to `led_9999`. Writes are refused
    with a byte-identical store.
  - `/search` and `/crm/summary` contain no id, reference, name, phone or budget of it.
  - Hamza limited to Gardens reaches no Heights lead.
  - Crescent's `cb_manager` never resolves a Larkspur lead.
- **Reassignment:** after Hamza assigns Nadia's lead to Bilal, Bilal sees it at once and Nadia does not.
- **Revocation:** `minus('lead.view')` gives a 403, the same for every id. `projectsOnly('prj_gardens')` gives a 404.
- **(C) party:** a prospect-only party of Nadia's lead is absent from Bilal's `/parties` and E.13 party search. An
  invoiced party stays visible to `customer.view` holders.
- **Browser:**
  - `crm.spec.ts`-style journeys for Bilal (list, Lead 360 deep link to a colleague's lead shows the not-found
    outcome, Sales home counts).
  - EN/UR, 320 px at 200 %, axe.
- **Mutants**, one per check, each must be caught:
  - `visibleLeads` filter removed;
  - `findLead` record check removed;
  - `visibleVisits` lead filter removed;
  - `/search` filter removed;
  - `/access/record` record check removed;
  - (C) `partyVisible` lead rule removed.
- **Accepted historical tests that assert the whole-project rule** (for example the lead-list and Lead 360 cases
  in `crm.*` and `tests/e2e/crm.spec.ts`, and the Sales home counts):
  - change only on approval, in the follow-up branch;
  - each changed assertion is listed in its report with the reason;
  - none is deleted, and their intent is kept by running them as the lead's owner.

### Shipping

Branch `followup/d-int-03-legacy-crm-scope` from the accepted Wave 2 head, after the owner approves B or C.
1. One commit for the rule wiring.
2. One for tests.
3. One for any accepted-test updates.

Then targeted regression (crm, dashboard, e0-foundation, e13, lead-privacy), a complete Chromium run, smoke, and
mutations. Separate review; no BUILT promotion.

---

## D-INT-05: who sees the holder's staff identity on a held unit

### Current behaviour on 8126322

| Surface | Where | Today |
|---|---|---|
| The one hold projection | `packages/fixtures/src/crm-holds.ts:100-111` `holdViewFor` | `holderName` (the initiator's staff name, own organisation only, `:103`) goes to **every reader of the unit**. Lead identifiers only to readers who may see the lead (`:102`). `releasable` only to the initiator (`:109`) |
| E.2 unit drawer (INV-002) | `apps/backoffice/src/pages/developer/projects/UnitDrawer.tsx:156-159` | "Held by {name}" |
| E.2 live availability (INV-008) | `packages/fixtures/src/developer/inventory/views.ts:293` → `LiveAvailabilityPage.tsx:152` | holder column |
| Legacy CRM quick view (Lead 360) | `apps/backoffice/src/pages/crm/UnitQuickView.tsx:93` | shows the lead (when visible) and the expiry; no holder name |
| E.13 hold-expiry task | `developer/workspace/tasks.ts:88` | owner = the *lead's* owner, only when the lead is visible; no holder name otherwise |

> **GPT recommends — not approved:** "D-INT-05 show holder identity to initiator and authorized project management
> with explicit need, not ordinary colleagues; preserve held/expiry."

### Options

- **A. Keep as is.** Any reader of the unit sees who placed the hold. Lead identifiers are already withheld.
- **B. GPT's recommendation.** `holderName` goes only to the initiator and to "authorized project management".
  Everyone else sees "Held until …" (and the "not yours to release" note) without a name.
- **Sub-decision for B: who is "authorized project management"?** Candidates:
  - (i) a holder of `lead.assign` in the unit's project (the sales manager), the same per-project check as
    `crmScopeOf().assignsIn`;
  - (ii) `project.manage` / `project.approve` in that project;
  - (iii) a new explicit permission (for example `unit.hold.view_holder`), which needs E-07 naming and an E-06
    grant decision.

  (i) needs no new permission. (iii) is the most explicit but is a new grant.

### Code touchpoints (B with (i))

| File:line | Change |
|---|---|
| `crm-holds.ts:103` | `holderName` only when `releasableBy(hold, me)` OR the reader `assignsIn(unit's project)`. Expose a canonical `holdManagerIn(ctx, projectId)` from `developer/crm/scope.ts` (reusing `assignsIn`), not a local copy. The `UnitHoldView` contract is unchanged (`holderName` is already optional) |
| `inventory/views.ts:293` | Already reads `view.holderName ?? ''`. The live availability shows "—" instead of a name |
| `UnitDrawer.tsx:156-159`, `LiveAvailabilityPage.tsx:152` | No change needed (they render only when present). Optionally add a neutral "Held by a colleague" label (new EN/UR key, parity) |

### Tests to add

- **Positive:**
  - The initiator sees their own name.
  - Hamza (lead.assign in Heights) sees the holder of a Heights unit.
- **Negative:**
  - Nadia and a same-role peer see held, expiry and the "not yours" note, with no holder name in the unit detail,
    matrix, availability or CRM quick view (text scan, as in lead-privacy).
  - Hamza limited to Gardens sees no Heights holder.
- **Reassignment** of the lead does not change who sees the holder.
- **Revocation:** `minus('lead.assign')` hides it at once.
- **Mutants:** holder shown to all; manager check removed; manager check cross-project.
- **Browser:** UnitDrawer and live availability for Nadia (no name, axe, 320 px at 200 % EN/UR).
- **Accepted tests that assert `holderName` for every reader:**
  - E.0 validation's "only the initiator is told the hold is releasable" (holderName for peer and manager);
  - E.2's inventory.api hold tests (`holderName: 'Bilal Ahmed'` seen by others);
  - the seam test.

  They change only on approval and are listed with reasons.

### Shipping

Branch `followup/d-int-05-holder-identity`, after the owner approves B and picks (i), (ii) or (iii).
1. One commit for the projection and helper.
2. One for tests.
3. One for UI copy, if chosen.

Targeted e2e (int-ew1, e0-foundation, e2-projects) plus a complete run.

---

## D-INT-06: documents linked to a lead, for document or records staff

### Current behaviour on 8126322 (already the conservative default)

| Surface | Where | Today |
|---|---|---|
| A document's visibility | `packages/fixtures/src/developer/documents/views.ts:26-31` `visibleDoc`, `:35-42` `visibleDocs` → `resolveCore(doc.recordId)` (`developer/workspace/records.ts:397`) | Follows the linked record |
| A lead-linked document | `records.ts:79` `leadVisible` (CRM grant + `leadOpenTo`) | Visible only to the lead's owner or a `lead.assign` holder in its project (with `document.view`) |
| The uploader | `documents/views.ts` (no uploader bypass) | Uploading grants nothing. Haroon (records clerk) does not see `doc_lsp_0009`, a CNIC copy he uploaded for Bilal's lead `led_0004` |
| Test of record | `developer/documents/documents.api.test.ts:23-37` (`HEIGHTS_LEAD_DOCS`), `workspace.api.test.ts` (document expiry for the clerk), `tests/e2e/e13-workspaces.spec.ts`, `tests/smoke/e13.smoke.spec.ts` (the clerk sees 6 Heights documents) | |

> **GPT recommends — not approved:** "D-INT-06 keep lead-linked documents gated by linked record access until
> explicit scoped document-only policy approved; uploader status isn't a bypass."

The recommendation matches today's behaviour. Nothing needs to change unless the owner approves a document-only
policy.

### Options

- **A. Keep as is** (GPT's recommendation): lead documents follow the lead; uploading is never a bypass.
- **B. A scoped document-only policy, if approved.** A records or document role may read (not write) documents
  linked to leads of the projects in its scope, without seeing the lead itself. The document's linked-record
  card then shows only "Lead (restricted)" and no lead reference, customer name or budget.
  - It needs a new explicit permission (for example `document.lead_linked.view`: E-07 naming, E-06 grant, holder =
    the records clerk).
  - The documents module must resolve the linked record through a reduced reference that names nothing of the
    lead.
- Not an option under either A or B: an uploader bypass (GPT: "uploader status isn't a bypass").

### Code touchpoints (B only)

| File:line | Change |
|---|---|
| `contracts/src/permissions.ts` (after the Gate E blocks), `access.ts` PERMISSION_MODULE | New permission (module `core`), EN/UR labels in `workspace.json` |
| `role-templates.ts` | Grant to `records_clerk` only, after approval. Count derived; roster pin extended |
| `documents/views.ts:26-42` | If `resolveCore` refuses a `led_` record, fall back to `leadDocumentRef(ctx, doc)`: allowed when the reader holds the new permission for the lead's project (`decideRecord(project, 'document.lead_linked.view')`). It returns `{ type: 'lead', id: '', ref: '', title: t('documents:restrictedLead'), restricted: true }`, with no lead identifiers. Writes (versions, uploads to the lead) stay `lead.manage` and visible-lead only (F-3) |
| `documents/handlers.ts` | Previews and versions of restricted-linked documents read-only. `related`, `tasks` and `activity` use the restricted card |

### Tests to add (B)

- **Positive:** the clerk with the new permission reads `doc_lsp_0009`; its linked card is "restricted".
- **Negative:**
  - No lead id, reference, customer or budget in any response.
  - The clerk cannot add a version or upload to the lead (403/404 as today).
  - Without the permission (A), the clerk still gets a 404 equal to unknown.
  - Gardens lead documents stay hidden from the Heights clerk.
  - Revocation hides at once.
  - Another organisation never.
- **Mutants:** fallback without permission; fallback leaking the lead reference; write allowed through the fallback.
- **Browser:** documents finder count for the clerk (6 under A, 8 under B), the preview card, EN/UR, 320 px at 200 %.

### Shipping

- Under A: nothing ships. The current tests already pin A.
- Under B: branch `followup/d-int-06-lead-document-policy`, after approval of the permission name, the grant and
  the restricted card. Bounded commits (contract and permission; documents fallback; tests; UI copy), targeted
  plus complete regression.

---

## D-INT-07: E.8's payables grants to existing Wave 1 roles (provisional E-06)

The coordinator's ruling of 19 Nov 2026 on the seam pre-flight: E.8's grants to existing roles are kept **exactly
as GPT reviewed them** in `6ae5e9d`, in their delimited block, not widened, and recorded as a provisional owner
decision.

### Behaviour as reviewed (6ae5e9d; arrives on `integration/e-wave2` with the E.8 candidate)

| Where (6ae5e9d) | What |
|---|---|
| `packages/fixtures/src/role-templates.ts:214-217` `GATE_E8_EXTRA` | `accounts_officer` (Faiza Noor, `lsp_accounts`) gains `supplier.view`, `supplier.manage`, `expense.view`, `expense.create`, `budget.manage`: the payables and expense maker. `finance_controller` (Zubair Ansari, `lsp_finance_controller`) gains `supplier.view`, `supplier_bill.approve`, `supplier_payment.approve`, `expense.view`, `expense.approve`, `budget.approve`: the checker |
| `role-templates.ts:218-222` `withGateE8` | Appends these to the two Wave 1 roles. No starter set and no original demo person (Nadia, Bilal, Farah) changes |
| `role-templates.ts:233`; `people.ts:134` | New role `budget_holder` held by the new fictional `lsp_budget_holder` / `usr_lsp_0021` (Rehan Saleem, Larkspur Heights only): `expense.view`, `expense.create`, `budget.manage` |

On 8126322 the two roles are at `role-templates.ts:229` and `:233`.
- Faiza is already E.7's journal and statement-import maker.
- Zubair is already the E.0/E.7 checker, and holds `period.close` since Wave 1 (D-INT-01).

So E.8 makes them the payables maker and checker as well. Each pair stays split between two people, and no one
approves their own bill, payment instruction, expense or budget.

### Options

- **A. As reviewed (the current provisional default).** Faiza and Zubair hold the payables pairs. One finance maker
  and one finance checker hold the ledger, the bank import and the payables.
- **B. Dedicated payables personas.** New fictional `payables_officer` (maker) and `payables_approver` (checker)
  roles and people. Faiza and Zubair keep only their Wave 1 permissions. This is less concentration of duties, but
  the roster gets bigger and more E-06 role decisions are needed.
- **C. Mixed.** Keep Zubair as the single checker (the finance controller approves everything financial) and add
  only a dedicated payables maker.

> **Agent 1's recommendation (not approved; the coordinator accepted it only as the provisional technical
> default):** A for the demo, because it is what GPT reviewed. The production split of payables duties is an
> owner decision (E-06), recorded as D-INT-07.

### Code touchpoints, if B or C is approved

| File | Change |
|---|---|
| `role-templates.ts` `GATE_E8_EXTRA` | Remove the Faiza and/or Zubair entries. Add the new roles to `LARKSPUR_ERP_ROLES` (count derived; roster pin in `role-templates.test.ts` extended, never loosened) |
| `people.ts`, `contracts/src/persona.ts`, `tests/support/fixtures.ts` | New personas with unused principals (next free after `usr_lsp_0021`). PersonaId unions |
| `i18n` `common.json`, `workspace.json` (EN/UR) | Role names and welcome lines |
| `developer/foundation.test.ts` | The "nobody holds both sides" check over the new pairs |
| E.8 tests and specs (`payables.api.test.ts`, `tests/e2e/e8-*.spec.ts`, smoke, evidence) | Sign in as the new makers and checkers. Every assertion's intent is kept and the changes are listed |

### Tests to add (B or C)

- **Positive:** the new maker drafts and submits a bill, payment instruction, expense and budget; the new checker
  approves them.
- **Negative:**
  - Faiza and Zubair are refused every payables action (403 `permission_missing`, refused before anything is
    recorded).
  - The maker never approves their own work.
  - The budget holder stays Heights-only.
  - No new principal reuses an id.
- **Mutants:** maker equals checker; the old grant left on Faiza or Zubair; budget holder cross-cost-centre.

### Shipping

Under A, nothing ships beyond the reviewed E.8 candidate; D-INT-07 stays open. Under B or C: branch
`followup/d-int-07-payables-roles`, after the owner approves the role split.
1. Bounded commits: roles and personas; i18n; tests and specs.
2. Targeted e2e (e8 specs, foundation, the seams).
3. A complete run.

---

## Rules for all four follow-ups

- **Separate branch.** Each one is a separate branch from the accepted Wave 2 head, opened only after the owner's
  written approval of the specific option. Nothing is folded into `integration/e-wave2`.
- **No new access by default.** No new permission or grant without an explicit E-06/E-07 approval. The default is
  always "no access".
- **One rule.** Reuse the canonical record rule (`developer/crm/scope.ts`) and E.0 scope helpers; no local copies.
- **Same checks as the base.** No oracle (hidden equals unknown), byte-identical state after every refusal, and
  one mutant per new check, all caught.
- **Accepted tests** change only with the approval, and each change is listed with its reason.
