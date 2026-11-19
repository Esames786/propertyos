# Gate E.4 — GPT quotation worksheet checkpoint (19 November 2026)

**Branch:** `feature/gate-e4-quotation-gpt` (isolated; no Wave 2 source files modified).
**Status:** Source and tests pushed; NOT locally compiled or run. CRM-013 remains PLANNED/PARTIAL candidate, no screen acceptance.

## Work completed
1. `packages/contracts/src/quotation-draft.ts` and re-export from `packages/contracts/src/index.ts`: typed `QuotationDraftSnapshot` and input, with literal non-effective flags.
2. `packages/fixtures/src/developer/quotations/snapshot.ts`: pure `illustrativeQuotationSnapshot(authorizedUnit, allocations)` built on E.3's exact integer-paisa `allocationsOf` and `calculatePlanPreview`. Copies the unit and output, retains zero-share lines, requires total 10000 bps; never mutates the input.
3. `packages/fixtures/src/developer/quotations/snapshot.test.ts`: five focused test cases written: precise PKR arithmetic/rounding and inert flags, visible zero rows, input/output immutability, malformed allocation refusal, and foreign currency/negative money refusal. These tests are **unrun**.

## Important integration boundary
This is **not** a quotation endpoint or an authorized CRM quotation screen yet. The helper's argument is explicitly a *unit already authorized by the future caller*; every future E.4 API must independently check the lead/opportunity using Wave 1's canonical `crmScopeOf/leadOpenTo` and the unit's project/site scope. A quote links the same project and same visible lead/opportunity to the selected unit. Cross-project, hidden and unknown IDs must have indistinguishable refusals; test GET/list/direct create and reassignment/revocation cases. The preview intentionally does not infer a legally approved price/version, a policy-approved fee/discount, a price-effective quote, an actual payment plan or an authorized reservation.

No `POST /quotations`, submit/send/accept/approve, price approval, hold, token, booking, invoice, ledger or payment state was added. Owner decisions E-07/E-11/E-30 and Wave 2 combined acceptance remain pending. There is no permission grant or status promotion.

## QA required
- Run clean local TypeScript, lint, Vitest and screenshots for the pure helper first.
- **Transplant** reviewed E.4 source onto a new isolated branch based on final accepted `integration/e-wave2`, not by blindly merging an E.3-derived branch over Wave 2.
- The E.4 route (CRM-013) and other 6 screens must be implemented and tested against the accepted E.1 CRM / E.2 inventory / E.3 pricing contracts before any BUILT change.
- Preserve strict project-scoped lead privacy, maker/checker separation, a single active hold per unit and financial evidence holds.

Nothing merged to `main` or deployed. The active Wave 2 runner/test lock was not touched by GPT.
