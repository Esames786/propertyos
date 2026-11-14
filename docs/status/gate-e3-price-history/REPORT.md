# Gate E.3 — INV-006 Unit Price History (GPT independent development)

**Status:** SOURCE IMPLEMENTED AND PUSHED · NOT LOCALLY EXECUTED · NOT ACCEPTED
**Tracking:** GitHub Issue #26.
**Base:** E.0 approved foundation `b3a3b42`; independent branch `feature/gate-e3-unit-price-history-gpt`.
**Coordination:** Claude's Gate E Wave 1 integration is not merged; Issue #25 remains open. No changes to its branch, worktree, test lock, `main`, production or Bingoo.

## Actual implementation

1. New type contract `packages/contracts/src/pricing.ts`: `UnitPriceHistory`, `UnitPricePickerResponse`, `UnitPriceRevision`; unit price is a fixed-decimal `Money` value. The contract distinguishes a fictional seed baseline from actual approved revisions.
2. New mock server `packages/fixtures/src/developer/pricing/handlers.ts`: `GET /pricing/units` (scoped search/list with visible-only totals) and `GET /units/:unitId/prices` (one unit). E.0's `projectVisible` + inventory `unit.view` at operational suspension enforce tenant, edition, project header, site licence and data scope. Hidden, other-tenant and nonexistent ids get the same `404 not_found`. Reads neither open nor write a demo overlay section.
3. React screen `apps/backoffice/src/pages/developer/pricing/UnitPriceHistoryPage.tsx`: searchable unit picker, shareable `?record=` deep link, project/unit/current price, clearly labelled fictional baseline, explicit no-approved-price-history state, loading/error/empty states, EN/UR/RTL and responsive CSS. E.0's edition-aware route registry and API registry are used, without editing the global catch-all route.
4. EN and UR `pricing` dictionary with matching keys. Existing CRM formatter reused for Pakistani rupees.
5. Four Vitest/API tests `price-history.api.test.ts`, three Playwright tests `e3-price-history.spec.ts`. Tests are written but **not executed**.

## Intentional restrictions

The seed has `unit.price` but **no approved price versions**. Do not manufacture earlier prices, approval dates, maker/checker, quotations, invoice postings, payment receipts, or price changes. `revisions: []` and `canEdit: false` are deliberately honest. E.3 policy decisions (E-30) and E.2/parallel integration are not yet accepted, so this is a **PARTIAL** screen, not fully BUILT. The actual register remains unchanged until local validation and integration. A hidden unit's price cannot be found by guessing its identifier. This UI is not a property valuation.

## Mandatory validation before acceptance

- On a clean worktree containing this branch, run `npm run typecheck`, `npm run lint`, `npm test -- --run packages/fixtures/src/developer/pricing/price-history.api.test.ts`, and the entire Vitest suite.
- Run the new E3 Playwright spec on the final production build (retries OFF), Firefox/WebKit smoke and axe; review EN/UR at 390px and 320px/200% with dark mode/high contrast; verify keyboard navigation and selected unit deep link; inspect screenshots. Screen-reader and native Urdu review remain open.
- Validate branch on top of the **eventually reviewed and accepted** `integration/e-wave1`; reconcile route/handler registration, E.2 inventory and E.13 document cross-links. Existing E.3 code must not overwrite Wave 1's canonical shared files.
- Verify further negative cases: plan/site licence withdrawal mid-session, out-of-scope project-name search totals, cross-tenant IDs, and no writes after 404. Mutation-test `projectVisible`/non-disclosing not-found checks. Fix tests or code without weakening accepted protection.
- Do not merge to `main`, deploy, touch VPS, Bingoo, Laravel/backend, live money, Issue #13 or SOS. Stop for GPT and owner final review after local regression.

## Reviewer note

GitHub file commits are verified, **but GitHub-only editing cannot run the user's Windows Playwright/Vitest environment**. A passing status has deliberately **not** been claimed.
