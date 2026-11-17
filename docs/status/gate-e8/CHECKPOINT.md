# Gate E.8 — suppliers, payables and expenses: checkpoint

Agent 3 (Wave 2). Worktree `D:\laragon2\www\propertyos-e8`, branch `feature/gate-e8-payables-expenses-claude`, base E.0 `b3a3b42`. Ports 8573–8575 (`E2E_PORT_OFFSET=3400`). Test output `test-results-e8/` (git-ignored).

**Status: provisional, Wave 2.** All 17 screens mount for developer organisations and are PARTIAL in the register. Nothing is BUILT.

## Done

### Step 1: shared building blocks

- **Contracts:** `packages/contracts/src/payables.ts` (exported from `index.ts` in a delimited block).
- **Permissions (owner decision E-07, conservative names; delimited "Gate E.8 (provisional)" blocks in `permissions.ts` and `access.ts`):** `supplier.manage`, `supplier_bill.approve`, `supplier_payment.approve`, `expense.view`, `expense.approve`, `budget.manage`, `budget.approve`, all mapped to `payables`. `supplier.view` and `expense.create` already existed.
- **Holders (owner decision E-06; listed, never silent; delimited block in `role-templates.ts`):**
  - Faiza Noor (`lsp_accounts`, maker): `supplier.view`, `supplier.manage`, `expense.view`, `expense.create`, `budget.manage`.
  - Zubair Ansari (`lsp_finance_controller`, checker): `supplier.view`, `supplier_bill.approve`, `supplier_payment.approve`, `expense.view`, `expense.approve`, `budget.approve`.
  - **New persona:** Rehan Saleem (`lsp_budget_holder`, `usr_lsp_0021`, role `budget_holder`), Larkspur Heights only (cost-centre-limited least-privilege role): `project.context.use`, `expense.view`, `expense.create`, `budget.manage`.
  - No original demo person gains anything. Nadia and Farah keep `supplier.view` and `expense.create` from their starter sets; writes also need the area's view permission, so they read suppliers and create nothing.
- **Mock API:** `packages/fixtures/src/developer/payables/` (`rules.ts`, `state.ts`, `views.ts`, `handlers.ts`), registered once in E.0's `DEVELOPER_AREA_HANDLERS`. 47 endpoints; plan §4.2 order of checks; E.0 `scope.ts`, `idempotency.ts` (`replayOf`/`remember`), `projection.ts` (`projectHistory`, `wholeOnly`) and `developer/state.ts` only.
- **Seed (fictional, evidence-based, bounded):** 6 suppliers; 7 bills (5 submitted with a labelled demo document, 2 drafts); 6 expenses and claims (5 submitted, 1 draft); 2 petty-cash floats (one count awaiting its witness); 3 budgets (2 version 1 submitted, 1 draft). Nothing seeded approved, paid, settled, posted, witnessed or instructed.
- **Vectors:** `payables.vectors.json` and `budgets.vectors.json` (`payables.test.ts`).
- **i18n:** `payables` namespace EN + UR (parity), plus labels in `nav.json`, `common.json` (role, welcome line) and `workspace.json` (permission labels).
- **Routes:** `apps/backoffice/src/pages/developer/payables/routes.tsx`, registered once in E.0's `DEVELOPER_AREAS` (`DevScreen` / `DevRecord`, `devRoute`).
- **Navigation:** two items (Suppliers and bills; Expenses and budgets) offered only to holders of the new permissions; no `match`.

### Steps 2–5: the 17 screens (all PARTIAL)

SUP-001 suppliers, SUP-002 Supplier 360, SUP-003 bills, SUP-004 bill workspace, SUP-005 new bill, SUP-006 payment instructions (drawer), SUP-007 supplier ledger, SUP-008 utilities register, EXP-001 expenses, EXP-002 new expense / claim, EXP-003 expense workspace, EXP-004 approvals, EXP-005 petty cash, EXP-006 employee expenses, EXP-007 budgets, EXP-008 budget workspace, EXP-009 budget vs actual.

## Tests so far

- `payables.api.test.ts` 40/40 and `payables.test.ts` (vectors) 8/8; foundation, role-templates and gate-e-access unchanged and green (targeted Vitest).
- Typecheck clean; ESLint, logical CSS and i18n parity clean.
- Browser (targeted, `--workers=2`, my previews 8573–8575): the journeys, maker ≠ checker, bank boundary, cost-centre isolation and "Nadia reads only" tests pass; axe 0 in EN and UR at 1440 and 390 px; dark mode and keyboard pass. The 320 px / 200 % sweep found and drove these fixes: compact header-metric amounts, word joiners in decision codes (E‑17), references that wrap only when wider than their card, history sentences, flattened petty-cash nesting, wrapping year and kind switches, shorter filter defaults, a seed description without an en dash.
- Commit `b01ca34` (step 1, building blocks) is local; the screens commit follows once the 320 px sweep is green.

## Next

1. Finish the targeted e2e, smoke and evidence runs; look at every PNG (widths, clipping, Urdu).
2. Mutation checks on the guards.
3. Full Vitest, build, complete Chromium run and Firefox/WebKit smoke under the lock (Agent 1 has priority).
4. Commit and push; hand-off.

## How to resume

```sh
. test-results-e8/scripts/env.sh            # node on PATH, TEMP on D:, E2E_PORT_OFFSET=3400
sh test-results-e8/scripts/build.sh         # stop my previews, build for 8573-8575
sh test-results-e8/scripts/preview.sh &     # serve on 127.0.0.1 and ::1
sh test-results-e8/scripts/serve-check.sh   # both loopbacks serve the current build
npx playwright test --project=e2e tests/e2e/e8-payables.spec.ts --workers=1 --retries=0
```

## Open owner decisions (conservative defaults applied)

| # | Default in this branch |
|---|---|
| E-06 | Faiza (maker) and Zubair (checker) hold the payables pairs; the new budget holder Rehan Saleem is Heights-only. |
| E-07 | The seven permission names above. |
| E-17 | No GL posting: every bill and expense reads "Posting planned (E.7 posting rules, E-17)"; `POST /supplier-bills/:id/post` answers 409 `posting_planned`. |
| E-18 | Payments, top-ups and reimbursements are instructions only, "Not settled — no evidence"; no settlement route. SUP-006, EXP-005, EXP-006 stay PARTIAL. |
| E-27 | Developer approvals use per-subject permissions; APR-001…005 are not opened. |
| E-37 | Cost centres, entities and the paying account come read-only from E.0's developer state. |
| E-08 | Isolation is tested on E.0's test-only second entity (LRD). |
| — | Payables screens serve developer organisations only (`DevScreen` edition `DEV`), although the register says DEV+COMM: the payables state exists only for developers. |
| — | Existing `supplier.view` holders (Nadia, Farah, Mehwish) now read the supplier screens (their starter permission's purpose); bank details only with `bank.view`; no menu entry for them. |
