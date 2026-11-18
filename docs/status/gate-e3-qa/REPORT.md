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

## Fourth QA pass — E3-QA-06: a committed draft cannot be reported as failed because its follow-up GET failed

**Source finding:** Four E.3 editors awaited read-only refreshes *inside the same try/catch* as their successful POST mutation. When a create/revision was saved but a subsequent list/detail/history GET failed, the UI fell into `catch`, cleared the success indicator, and could lead the user to submit the draft again with a **new idempotency key**. Worse, COM-003 called `detail.refetch()` even on initial creation, when there had been no selected detail request. A refresh result is not the write transaction's result.

**Fix:** `PricingPoliciesPage.tsx`, `FeesDiscountsPage.tsx`, `ApprovalRulesPage.tsx`, and `EditPriceDrawerPage.tsx` now determine save success solely from the resolved POST and launch subsequent reads without awaiting them in the POST try/catch. Detail refresh remains conditional on a previously selected draft. `useApiMutation` already invalidates API queries on successful writes; the explicit refreshes are best-effort updates. Failed GET responses are handled by the respective query's existing retry/error UI, not recast as a failed POST.

**Acceptance testing still required:** with a **test-only** authorized pricing principal, force POST success followed by 500/offline GET list/detail/history and confirm the saved message remains truthful, the last idempotency key is not reused for a new logical request, and revisiting the draft shows exactly one newly appended version. Separately test a true POST rejection, where the save message must not show. Verify no change to listed unit price, quote, payment, ledger, settlement or approval. No GitHub Actions CI status / local TypeScript, Vitest or Playwright test evidence is available for this pass, so this is a source fix pending runner validation.

## Fifth QA pass — E3-QA-07: stale detail after a successful draft POST

**Confirmed source behavior:** The editor dirty guard protects unsaved typing, but a completed create/revision sets dirty=false while the previous detail GET may still be cached. Until the new version's GET returns, the stale detail could rehydrate the form with an older version. An immediate second revision also read `expectedVersion` from this stale detail, causing an avoidable 409 after a genuine successful save.

**Source fix:** Introduced `revision-sync.ts` shared pure functions, and `revision-sync.test.ts` six focused test cases (written, not executed). All five stateful E.3 editors now track the last successful mutation's authoritative `{id, currentVersion}` as a committed floor. They do **not** rehydrate from a GET that predates the last acknowledged save, and subsequent revision requests use the latest known committed version rather than an older cached number. Switching to a different record or starting a new draft clears the floor, preventing leakage between records. In Fees & Discounts, the read-only preview also refuses to run while its selected draft detail is older than the last saved revision, avoiding a misleading mismatch.

**Testing hold:** Run TypeScript, all unit tests and actual positive authorized test-only React/browser flows (create, edit, save, injected stale GET, second revision, failed GET, later successful refetch, switch records, EN/UR 320px and keyboard). The new six pure unit tests are not evidence of a pass. No standard demo role has been granted pricing.manage, no price approval/activation/financial posting occurred, and no main merge or deployment is allowed.

## Sixth QA pass — E3-QA-08: conflicting request idempotency keys

**Confirmed source flaw:** All five E.3 mutating handler families previously used `ctx.req.idempotencyKey ?? body.idempotencyKey`. A client could send two **different** keys and the backend would silently prefer one; it would then bind/replay the request under a different logical identity than the JSON body claimed. This was inconsistent with the contract expectation that the same key accompanies each logical draft mutation in both request positions.

**Fix delivered:** New `packages/fixtures/src/developer/pricing/request-key.ts` provides a common `parseDraftRequestKey` and `requireDraftRequestKey`. Both supplied locations must agree exactly. One location alone is accepted for backward compatibility. Keys require the existing conservative ASCII character set and 12–100 character length. A missing, mismatched, malformed, oversize or invalid-type key receives a non-mutating 422 validation refusal *before* replay map or record sequence changes. Adopted in:
- Payment plan templates (`template-handlers.ts`)
- Pricing policies (`policy-handlers.ts`)
- Fee/discount schedules (`commercial-handlers.ts`)
- Approval-rule drafts (`approval-draft-handlers.ts`)
- Unit price-change proposals (`price-change-handlers.ts`)

**Test code:** `request-key.test.ts` has five precise parser acceptance/refusal cases. An additional `price-change.api.test.ts` case sends a real header/body key mismatch through `MockTransport`, snapshots business state, checks 422 with `changed:false`, then confirms the original key is still usable and the first accepted record still receives the initial ID. The tests are **written, not locally executed**, and therefore not evidence of a green Vitest suite.

**Still required:** TypeScript/lint/Vitest/Playwright on a clean local worktree, positive test-only authorized pricing user with query-refresh failure injection, all fail-closed permission and project/site revocation tests, integrated E.0/Wave1 test run. No demo role grants, main merge, production deployment or effective pricing changes.
