# Gate E.8 Wave 2 integration — notes

Gate E.8 (suppliers, payables and expenses; SUP-001…008, EXP-001…009) transplanted from the reviewed `6ae5e9d`
onto the accepted Wave 1 base `integration/e-wave1@8126322`, reconciled canonically (the base wins), connected to
E.13, and kept PARTIAL, DEV-only and provisional. Test results: `test-results.md`. Evidence:
`screenshots/` (the reviewed E.8 screenshots in `docs/status/gate-e8/` are unchanged).

## 1. History

| Commit | What |
|---|---|
| `e3648fd` | `git merge --no-ff 6ae5e9d` onto `8126322`. 11 conflicts resolved to compile only (base first, E.8 appended). |
| `b0c3ab7` | 1/n canonical seams: shared-file blocks, roster pins, maker-checker pairs, handler registry test. |
| `d6dbd5b` | 2/n the bank-data boundary is E.7's (`seesBank` over the whole legal entity). |
| `d0848d2` | 3/n DevScreen `refusal="outcome"` for all 17 screens; record pages read `?record`. |
| `a4a0bd7` | 4/n E.13 connections, contextual links, "In progress", money states apart. |
| `1abbd3d` | 5/n tests and evidence for the integration. |
| `850a5e2` | 6/n fixes from the first targeted Chromium run (E.13 reference wrapping; a record screen's bare address). |
| later | docs (see `git log`). |

## 2. Reconciliation (the base wins)

- **Staff and personas.** The base roster is kept as it is (usr_lsp_0004 … 0009). E.8 adds one person only: Rehan
  Saleem, `lsp_budget_holder`, principal `usr_lsp_0021` (unique), role `budget_holder`, Larkspur Heights only. Added to
  `contracts/persona.ts` and to the e2e `PersonaId`. The pinned roster in `role-templates.test.ts` is EXTENDED with
  `['budget_holder', ['lsp_budget_holder']]` (never loosened); `foundation.test.ts` counts him among the new people
  (scope `prj_heights`) and checks E.8's four maker-checker pairs (supplier_bill, supplier_payment, expense, budget)
  with E.0's in "nobody holds both sides; each side has a Larkspur holder".
- **Payables grants to Faiza and Zubair (`GATE_E8_EXTRA`).** Unchanged from `6ae5e9d`, inside its delimited block,
  not widened. Provisional owner decision **E-06**, recorded for the combined report as **D-INT-07** (coordinator
  ruling). Dedicated payables personas are the alternative for the owner; not built.
- **Roles.** No other role or persona gains anything. The pinned roster test and `payables.api.test.ts` ("no original
  demo person gains an E.8 permission") both hold.
- **Permissions.** The seven provisional E.8 permissions (`supplier.manage`, `supplier_bill.approve`,
  `supplier_payment.approve`, `expense.view`, `expense.approve`, `budget.manage`, `budget.approve`) sit in one
  `Gate E.8 (integration candidate)` block right after `end Gate E.0` in `permissions.ts`, and map to `payables` in
  `access.ts` in the same place. No name clashes with Wave 1 (`bank.import` / `bank.import.approve` etc.). EN and
  UR labels exist in `workspace.json` "permissions".
- **Scope.** E.8 already used E.0's `entityVisible` / `entityWhole` / `costCentreVisible` / `requireEntity`; the E.13
  providers use the same rule (§4).
- **Bank data.** E.8 used `may(bank.view)`. It now uses E.7's canonical `seesBank(ctx, entityId)` from
  `ledger/scope.ts`: `bank.view` or `bank.reconcile` over the WHOLE legal entity, on the banking module. Supplier 360
  and payment instructions show the payee and paying account only then; preparing, approving, sending or cancelling
  an instruction needs it over the record's entity (else the canonical `out_of_scope` refusal, store unchanged).
  The paying account is E.0's registered collection account `dca_lsp_01` (already masked at source: `•••• 7890`, the
  same account E.7 imports). Saad (`lsp_ledger_clerk`, no bank permission) sees no bank detail anywhere, as before.
- **Idempotency.** E.8 already used the shared `idempotency.ts` (`replayOf` with `stillAuthorized`, `remember`,
  `keyReused`); every `replayOf` call passes `stillAuthorized`. `idempotency.ts` is not touched (Agent 2 fixes the
  own-property bug).
- **Edition.** DEV only (E.0's DevScreen default) until edition licensing is approved. The register's target edition
  column (DEV+COMM) is the planned target and is unchanged.
- **DevScreen.** All 17 screens use `refusal="outcome"` (the Gate B access outcome in words, no data). The four record
  screens (Supplier 360, bill, expense and budget workspaces) are DevScreens whose page reads `?record`; an id of
  another kind answers exactly like a record never issued, and the bare address (no `?record`) says to choose a
  record from its list (as E.2's Project 360; `register.spec.ts` requires a PARTIAL screen's own address never to
  read "not found"). `dev-screen.tsx` is not edited.

### 2.1 Shared files (one delimited block per file where the base pattern allows)

| File | Hunks |
|---|---|
| `routes.developer.tsx` | (1) the import, in a `// ---- Gate E.8 (integration candidate) ----` block after the base imports; (2) `{ area: 'payables', routes: payablesRoutes }` in a block after the documents entry. |
| `screen-register.csv` | SUP-001…008 and EXP-001…009 rows: PLANNED → PARTIAL with notes/tests (from `6ae5e9d`, unchanged). No re-sort. |
| `register.generated.ts` | the same 17 rows, regenerated by `npm run register:sync` (no hand edit). |
| `contracts/src/access.ts` | one block after `end Gate E.0`: the seven permissions → `'payables'`. |
| `contracts/src/index.ts` | one block: `export * from './payables'`. |
| `contracts/src/permissions.ts` | one block after `end Gate E.0`, before Platform HQ: the seven permissions. |
| `developer/handlers.ts` | (1) the import in a block after `E13_HANDLERS`' import; (2) `PAYABLES_HANDLERS` in a block after `E13_HANDLERS`. |
| `i18n/src/resources.ts` | (1) the EN+UR import pair in one block after the UR imports; (2) `'payables'` in NAMESPACES; (3) `payables: enPayables`; (4) `payables: urPayables` — each a single labelled line (the file's structure needs four places). |

Other files shared with the base (not on the list of eight) that E.8 extends, each with a labelled line or block:
`contracts/src/productivity.ts` (record types, task kinds, activity group), `workspace/registry.ts`, `tasks.ts`,
`activity.ts`, `wkit.tsx` (icons), `RelatedRecords.tsx` (optional `withDocuments`, default unchanged),
`RecentActivityPage.tsx` (amount formatting), `wkit.tsx` `REF_LINE` (a record line's reference wraps inside only when
wider than the whole line: E.8's 17-character references ran off a related-records card at 320 px / 200 % under
`NOWRAP`; a small labelled base fix, `NOWRAP` unchanged elsewhere), `people.ts`, `role-templates.ts`, `persona.ts`,
`tenantWorkspace.ts` (E.8's nav entries from `6ae5e9d`), `workspace.json`, `common.json` (EN/UR).

## 3. "In progress" (was "Open bills")

`SupplierSummary.openBills` counted draft + submitted bills only. Renamed to `inProgressBills`
(`BILL_IN_PROGRESS = ['draft', 'submitted']`), labelled "In progress" / "زیرِ کارروائی", and the bills list gained the
`in_progress` filter, so the suppliers list and Supplier 360 tiles open exactly the bills they count.

## 4. E.13 connections

`developer/payables/records.ts` exports `PAYABLES_RECORD_PROVIDERS` (spread in `workspace/registry.ts` before
`CORE_PROVIDERS`), the task providers and the activity source.

| Kind | Prefix | Opens | Eligible |
|---|---|---|---|
| `supplier` | `sup_` | SUP-002 Supplier 360 | yes |
| `supplier_bill` | `sbl_` | SUP-004 bill workspace | yes |
| `supplier_payment` | `spi_` | SUP-006 payment instruction drawer | yes |
| `expense` | `exp_` | EXP-003 expense workspace | yes |
| `budget` | `bud_` | EXP-008 budget workspace | yes |
| petty-cash float, count, top-up | `pcf_`, `pcc_`, `pct_` | (inside EXP-005) | no: no record address of their own |

No prefix collides with `cin_ doc_ dtp_ gla_ inv_ jnl_ led_ lse_ opp_ prj_ pty_ stg_ unt_ vst_`.

- **Record-level scope.** E.8's own record rule on E.0's helpers: a supplier is a legal-entity record; a bill (and
  so its instructions) needs the entity and every cost centre it touches; an expense and a budget their cost centre.
- **No oracle.** `resolve` returns null for a never-issued and a hidden id alike; resolve, related records,
  favourites and recent records give byte-identical 404s for both (tested pairwise, store unchanged).
- **Revocation.** Worked out per request: removing `supplier.view` hides favourites, recents, search hits and
  resolve at once; restoring brings them back.
- **Isolation.** Another organisation's persona and the second legal entity's officer get "never issued" for
  Larkspur's records; each entity's officer resolves their own.
- **No bank detail.** References carry reference, title, state only (no bank name, digits, or amount); search never
  matches a bank detail (`3307`, `7890`, `Demo Bank` find nothing).
- **Related records.** supplier ↔ bills and instructions; bill → supplier, instructions, the budgets it counts
  against; instruction → bill, supplier; expense → its budget; budget → its cost centre's expenses and bills. Each
  item resolved for the reader.
- **Tasks.** `bill_approval`, `payment_approval` (also E.7's bank boundary over the entity, as the endpoint),
  `expense_approval`, `budget_approval`. "Mine" is never the maker's own (or a claimant's own claim, or a version's
  preparer); the team queue lists it with `mine: false`.
- **Activity.** Group `payables`; each event once, on its own record (a bill's payment events belong to the
  instruction; a supplier's copies of bill events belong to the bill), with that record's values only.
- **Favourites and recents.** Through the registry: the star on each record page; the shell records `?record=`
  visits.

## 5. Context links (both ways, no dead links)

Supplier 360 → bills (in progress / awaiting / all, in the supplier's entity), bill workspace, instructions,
ledger; bill workspace → supplier, instruction drawer, related budgets; drawer → bill, supplier; expense → its
cost centre's expenses, its budget, budget vs actual; budget → its cost centre's expenses, budget vs actual;
budget vs actual → budget. Every list link carries the record's legal entity, so a second-entity record never
lands on the first entity's list. Browser back returns along each path (tested).

## 6. Money states

- `MoneyStates { approved, posted, instructed, settled }` on the bill workspace; Supplier 360's header shows the
  four (approved obligation, posted 0.00, instructed, settled 0.00), the awaiting amount moves to its tile.
- The payment drawer shows the bill's **actual** balance (approved − settled; an instruction never lowers it), the
  bill's money states and, in a dashed box labelled **Simulation**, what would remain if this instruction were
  later settled with bank evidence ("nothing is paid or settled; the actual balance stays …"). The server derives
  the actual balance again through the supplier-ledger rule and returns `ledgerCheck` (shown as "Checked against the
  supplier ledger: the actual balance matches"). A cancelled instruction has no simulation.
- No posting, no settlement, no bank transfer: unchanged (`postBill` still refuses `posting_planned`).

## 7. Owner decisions (open, not activated)

- **E-06 / D-INT-07:** `GATE_E8_EXTRA` payables grants to the accounts officer (Faiza) and finance controller
  (Zubair); Rehan as a provisional budget-holder persona. Alternative: dedicated payables personas.
- **E-07:** the seven conservative E.8 permission names.
- **E-17:** posting rules (posting stays planned). **E-18:** settlement evidence (nothing is settled).
- Edition licensing (E.8 DEV only).
