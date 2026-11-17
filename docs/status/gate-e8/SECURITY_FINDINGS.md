# Gate E.8 — security notes and findings (provisional)

Scope: the payables mock API (`packages/fixtures/src/developer/payables/`) and screens. Every rule below is tested in `payables.api.test.ts` (40 tests) with the whole store compared byte for byte after each refusal, and the guards are mutation-checked (`test-results-e8/mutations.json`).

## Rules implemented

| Rule | How |
|---|---|
| Order of checks (plan §4.2) | Transport: module, permission, suspension. Handler: practice mode and the area's read permission; authority over the entity / cost centre; the record's state; ids (out of scope = never issued); maker ≠ checker; validation of every field; bound replay; state-dependent checks (duplicates, amount left); mutate, then audit. |
| No id oracle (§4.3) | Path ids: `findSupplier` / `findBill` / `findPayment` / `findExpense` / `findFloat` / `findBudget` answer E.0's `notFound` for hidden and invented ids alike. Body ids (supplier, cost centre, float, claimant, entity): the same field problem or 404 for hidden and invented. Query filters (`?entity=`, `?costCentre=`): 404 alike. |
| Never half a record | A bill is visible only when the reader sees **every** cost centre it touches; partial readers never get part of a bill. |
| Nested projection (§4.4) | Supplier activity through E.0's `projectHistory` (events about hidden bills left out, values stripped from record-wide events for partial readers); entity totals, supplier totals, the ledger statement and budget-vs-actual entity totals through `wholeOnly` (withheld, never recalculated). Checked with E.0's `compareProjection` (no leaks, nothing unexercised). |
| Bound idempotency (§4.5) | E.0's `replayOf` / `remember` on every create (supplier, bill, payment instruction, expense, count, top-up, budget, budget version). Key reuse with another input, person or operation: 409 `idempotency_key_reused`, nothing changes. A replay after losing scope is answered exactly like a request never made. |
| Maker ≠ checker (§4.7) | By principal: bill approve/reject (maker or submitter refused), instruction approve (preparer refused), expense approve/reject (maker, submitter or claimant refused), count witness (counter refused), top-up approve (requester refused), budget version approve/reject (preparer refused) — also for a test person holding both permissions. |
| Legal-entity isolation (§4.8) | A supplier, cost centre or float of another entity in a bill, expense or budget: 422 `cross_entity_forbidden`, nothing changes (E-08 test-only second entity). |
| Bank boundary | Supplier payee accounts are stored masked (last four only); the payee and paying account appear only for `bank.view` holders; preparing or approving an instruction also needs `bank.view`; supplier search never matches bank fields. |
| Money truth (§4.6) | No approved, paid, settled, posted or witnessed seed; posting refused (409 `posting_planned`, E-17); no settlement route (E-18); instructions never reduce the ledger balance; budget actual = posted only. |
| Practice mode, suspension | Every change refused in practice mode (403 `training_not_supported`) and while suspended (`tenant_suspended`); history reads stay open. |
| Revocation | Access is evaluated per request; a revoked permission refuses at once (tests revoke `supplier.view` / `expense.view` / `bank.view` mid-session). |

## Findings and decisions to note

1. **Existing `supplier.view` holders now read supplier screens.** Nadia (manager), Farah (finance) and Mehwish (project manager) held `supplier.view` from their starter sets before E.8. With the screens built they can read suppliers, bills, instructions and the ledger (bank details only Nadia and Farah, through their existing `bank.view`). They cannot change anything, and they get no menu entry. Owner decision (E-06/E-07) whether that reading is intended.
2. **`expense.create` alone writes nothing.** Nadia and Farah also hold `expense.create` from their starter sets; every payables write also needs the area's read permission (`expense.view`), which they do not hold, so they are refused (tested).
3. **Staff names in the claimant picker.** The new-claim form lists the organisation's backoffice staff (names and roles) to expense makers. Same organisation; noted for the privacy review of E.14 (HR employee link).
4. **Budget vs actual and supplier bills.** Approved supplier bills count in "approved, not posted" only for readers who hold `supplier.view` (amounts by category only; no supplier or reference); others are told they are excluded.
5. **Replay authority re-check is reached only through the earlier scope checks.** In every create, the entity / cost centre / float scope check runs before `replayOf`, so the replay's own `stillAuthorized` check never decides alone (the same equivalent-mutant situation E.7 reported). The outcome is tested: a replay after losing scope is answered exactly like a request never made.
6. **No vulnerability found in the E.0 base** while building on it.
