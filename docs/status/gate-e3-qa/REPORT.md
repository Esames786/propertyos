# Gate E.3 — GPT QA hardening review (Issue #33)

**Base:** `feature/gate-e3-unit-price-history-gpt@f80de924f39c77f53b8738047564b963c0ccec19`  
**Work branch:** `fix/gate-e3-qa-hardening-gpt`  
**Status:** GitHub source edits pushed, **NO LOCAL TYPECHECK/VITEST/PLAYWRIGHT**. Review/HOLD.  
**Safety:** No merge to `main`, no deployment, no Laravel/backend, banking, Bingoo, or pricing-role grants.

## Confirmed source-level UX defect and fixes

**E3-QA-01 — Unsaved price/pricing edits overwritten by background React Query updates**  
The four COM pricing editors and INV-007 drawer originally hydrated their inputs on *every* selected-record data update. Background refetch, query invalidation after an unrelated mutation, or an in-flight older fetch could overwrite unsaved user input while the user was typing. The editor components now track `dirty` and skip hydration while edits are unsaved. A new record selection resets the flag, genuine field changes set it, and successful draft saves clear it. The affected components are:
- `PaymentPlanTemplatesPage.tsx`
- `PricingPoliciesPage.tsx`
- `FeesDiscountsPage.tsx`
- `ApprovalRulesPage.tsx`
- `EditPriceDrawerPage.tsx`

**E3-QA-02 — Premature drawer save action**  
INV-007's Save footer was rendered while the selected private revision was still loading or after a failed lookup. The handler's early return was silent. The footer now waits for the draft list result and disables Save when the selected revision is pending, failed, or does not match the selected draft. Ordinary `unit.view` users with no `pricing.manage` continue to get no Save action.

**E3-QA-03 — Connected pricing navigation**  
INV-006 displayed a selected unit's fictional baseline without a direct link to its related change-request drawer. Added an accessible focusable link to `/backoffice/inv/edit-price-drawer?record=<unitId>`. Both pages independently re-check site/project/unit and pricing permissions. Added a browser regression checking same-unit navigation and that an ungranted sales user cannot save.

## Review restrictions and outstanding test debt

The source-only QA review cannot establish that `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, or `npx playwright test` pass. This private repository cannot be cloned from the current container, and GitHub returned **zero combined statuses and zero PR-triggered workflow runs** for the E.3 baseline commit. There is no `.github/workflows` directory on this ref.

Before acceptance, on a **clean local worktree** of this QA branch:
1. Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. Fix errors without weakening permission checks or altering approved foundation tests.
2. Run all E3 browser tests on a final build with retries OFF, Firefox/WebKit smoke and axe. In particular, implement a **test-only** `pricing.manage` + `unit.view` principal (do not grant production/demo roles) and exercise authorized create/edit/refetch/save/revise, including query invalidation while a form is dirty, stale-version 409, lost-response idempotent replay, hidden/unknown IDs, site licence and permission revocation. Verify 320px/200% EN/UR RTL, dark/high contrast, keyboard focus/focus return.
3. Confirm that no draft changes `units[].price`, `UnitPriceHistory.revisions`, invoices, quotes, approvals, ledger entries or payments.
4. Integrate only after Claude's Issue #25 Wave 1 integration is reviewed, through an **isolated transplant branch** that reconciles E.0 developer handlers/routes/permissions and EN/UR namespace keys with other Wave 1 branches. Then rerun the full combined regression.
5. No BUILT screen-register promotion based solely on GitHub source review; all 7 E.3 screens remain provisional PARTIAL.

## Status assertion

No compiler or browser suites were executed during this GPT-only GitHub review. This is a targeted source hardening patch and test-code addition, not evidence of gate acceptance. All authorizations, `pricing.manage` no-grant policy, maker-checker restrictions and real-money safety holds remain unchanged.

## Second QA pass — E3-QA-04: strict Persona ID union typecheck blocker

The actual `Persona.id` contract in `packages/contracts/src/persona.ts` is a closed union, including `res_${string}` for generated test-compatible fixture identities. Six E.3 API suites constructed explicit `Persona` literals using `id: 'e3_...'`, values **outside the allowed union**. The API test sources were therefore structurally invalid TypeScript even before executing tests.

**Fix pushed:** All six source suites retain their existing *test-only* fictional principal IDs, tenant, permissions, staff backoffice app and project scopes, but their `Persona.id` strings now use the contract-compatible `res_e3_...` prefix, and all literal selectors in the first suite were updated in lockstep. The wildcard ID template is only a type-space convention: these principals are still `app:'backoffice'` because they spread Larkspur's staff manager, have no resident `partyId`, and are supplied **only** through `MockTransport({personas:[...]})`. They are not added to `ALL_PERSONAS`, real roles, sign-in menu or product default permissions.

Files:
- `plan-preview.test.ts`
- `template-handlers.api.test.ts`
- `policy-handlers.api.test.ts`
- `commercial-handlers.api.test.ts`
- `approval-draft-handlers.api.test.ts`
- `price-change.api.test.ts`

**Limits:** This source-level correction removes a visible type mismatch; it does **not** prove all tests compile or pass. Check all test suites, permission scopes, session-gate side effects and mock-data invariants in a real isolated toolchain. The current private repo cannot be cloned from this container (no external network route), and GitHub has no CI status on the previous QA commit. No source screen is accepted BUILT yet.

## Third QA pass — E3-QA-05: mutation tests versus legitimate session login writes

The actual `MockTransport` calls `sessionGate` before handing a request to the feature handler. On a test principal's first request, sessionGate opens or updates the tenant `identity` section to record a legitimate sign-in/session event. Several E.3 tests asserted that the *entire* raw storage string remained identical across a refused operation, including ordinary login telemetry. That can produce false mutation failures even though no pricing/business data was changed. Some tests also snapshotted an entirely empty storage partition before invoking their first request.

**Corrections in six test files:** Their `snapshot()` check serializes the tenant overlay minus the `sections.identity` subtree, preserving **every other section, including all pricing drafts, sequence counters, key replays and non-pricing business sections**. Five tests that examine the first invalid request now prime the session with an authorized read-only list or unit-price read before establishing the baseline; a partition appearing for legitimate login cannot falsely fail the business invariance check. All sign-in/audit security tests remain separately owned by the identity gate and are not removed or changed.

This is a targeted test-harness correction, **not permission broadening, financial state weakening or a passing-test claim**. It must be validated with actual Vitest, including all fail-closed/hidden-vs-unknown cases on a clean local workspace. A local test run must still explicitly validate that denied business writes create no pricing entries, no sequence number and no idempotency key.
