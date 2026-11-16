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

## COM-002 — deterministic read-only payment plan builder (Issue #27)

**Status: pushed source, not locally run; provisional PARTIAL.**

### Implemented

- `packages/contracts/src/pricing.ts` now also defines `PlanAllocationInput`, fixed-decimal `PlanPreview`, preview rows, construction milestone keys and explicit `postingAllowed: false`.
- `packages/fixtures/src/developer/pricing/calculator.ts` parses money as **BigInt paisa**, shares as integer basis points (100% = 10000). Input must be 1–24 allocations, no more than 120 output rows, every share 0–100%, total exactly 100%. Instalment counts 1–36, no due dates; construction milestones require an identifier rather than an invented calendar date. Each segment's final instalment receives its paisa rounding remainder; Rs 0 allocations remain Rs 0.00.
- `POST /pricing/plan-preview` executes only an ephemeral calculation. The endpoint requires `pricing.manage` in the inventory module plus the scoped `unit.view` for the unit. Both site licensing and E.0 project scope are checked at request time. Hidden and unknown unit IDs both return 404; invalid body returns all-or-nothing 422 without financial-state mutation. The prototype transport may record a generic POST invocation in its **transient mutation telemetry**, but no finance, approval, numbering, invoice, quotation or demo pricing record is created.
- `apps/backoffice/src/pages/developer/pricing/PaymentPlanBuilderPage.tsx` is the interactive, responsive EN/UR preview builder: unit picker, editable percentage, count, construction milestones and zero share, full money breakdown, clear unapproved-preview notices and recovery states. Registered in the E.0 area route registry at `/backoffice/com/payment-plan-builder`.
- A new `pricing.manage` permission is mapped to inventory, **but not granted to any existing persona or starter role**. Until a separately approved commercial pricing role exists, COM-002 correctly denies everyone in the current demo. Do not broaden access as a workaround; this is an intentionally provisional security boundary.
- Test code: `plan-preview.test.ts` (four pure arithmetic vector tests and five API/security tests), `tests/e2e/e3-plan-preview-access.spec.ts` (existing sales persona cannot enter the builder or directly invoke its endpoint). All tests are **written but not executed**.

### Not implemented

No saved payment-plan templates or versions, pricing change requests, unit price edits, rule approvals, financial postings, quotations, token-payment evidence or booking settlement. The E-30 pricing-policy and commercial maker-checker decisions require owner signoff; no real banking.

### Required independent validation

- On a clean local worktree, run `npm run typecheck`, `npm run lint`, `npm test` and the E.3 API/browser specs, then full production-build Chromium E2E+evidence retries OFF, Firefox/WebKit smoke, axe. Check deep-link and selection, 320px/200% EN+UR RTL, keyboard and dark/contrast layouts.
- Create a **test-only** pricing persona to exercise the authorized COM-002 UI and compare every rendered line with the API preview. Do not grant `pricing.manage` to real/demo roles merely to make a test pass.
- Verify permission revocation, missing unit.view, site licence revocation, cross-tenant and cross-project IDs, malformed/foreign body, all-or-nothing refusal, no financial writes and no hidden unit prices/counts. Mutation-check the dual pricing/unit access boundary and sum-to-100 guard.
- After accepted Issue #25 Wave 1 integration, transplant to the integrated source in an isolated branch; reconcile both E.0 handler and routes registries. Do not overwrite the accepted E.1/E.2/E.7/E.13 registrations. STOP for reviewer acceptance.

**GPT only used the GitHub connector for writes/source review in this wave. No Windows compiler or browser suite has been executed.**

## COM-001 — Payment plan template drafts and immutable revisions (Issue #28)

**Status: CODE AND TESTS PUSHED, BUT NOT LOCALLY EXECUTED. No final approval.**

### Actual GitHub changes
- `packages/contracts/src/pricing.ts`: project-bound `PaymentPlanTemplate` plus append-only `PaymentPlanTemplateVersion` and minimal private list contract. Every template is `state:'draft'`, `approvalAllowed:false`, `postingAllowed:false`.
- `packages/fixtures/src/developer/pricing/template-handlers.ts`: `GET /pricing/template-projects` (live licensed project scope), `GET /pricing/plan-templates` (creator-filtered list/total), `GET /pricing/plan-templates/:id` (creator-scoped snapshot), `POST /pricing/plan-templates` (create draft) and `POST /pricing/plan-templates/:id/versions` (optimistic append-only revision). Requires `pricing.manage` and current inventory/project/site authorization at every request. Unknown and other-creator/out-of-project IDs answer the same 404. Reads do not write. An invalid payload/refusal consumes no number, version or idempotency key.
- Draft/create/revision requests use non-guessable request keys supplied by UI and are bound to creator, target project/template, operation and normalized title/allocations; exact authorized replays return the stored original response, never a second version; other reuse gives non-disclosing 409. A stale `expectedVersion` cannot silently overwrite another draft revision. Previous versions are never edited.
- Shared calculator validator `allocationsOf` reused: whole 100% in basis points, 1–24 lines, 1–36 instalments, 120 resulting lines max, construction milestone identifier required, malformed/duplicate extra fields refused. No invented due dates.
- New `PaymentPlanTemplatesPage.tsx` at `/backoffice/com/payment-plan-templates`: project selector from direct `pricing.manage` scoped project API (not a limited unit list), own-draft search, reusable EN/UR/RTL allocation editor, create, revise, saved/error states, immutable version history. Accessible controls/labels, responsive layout and no fake Approve/Publish controls. Request key is renewed on genuine form edits and after success, retained for the same request's uncertain network retry.
- E.0 canonical handler and route registries extended in isolated branch, without touching Claude's Wave 1 branch.
- New `template-handlers.api.test.ts`: seven test cases for current project-choice scope, author-only privacy, hidden==unknown, create replay, fresh-create keys, append-only revisions, stale conflicts, malformed input no writes, narrowed project header. New `e3-plan-templates-access.spec.ts`: English and Urdu unauthorized browser denial. Tests written, **not executed**.

### Strict limitations
No demo staff role gets `pricing.manage`; existing users cannot access COM-001 or COM-002 until an approved role or a **test-only** pricing principal is used. Do not grant pricing rights to starter roles. Project-private ownership is a conservative provisional prototype choice, not a final multi-author pricing-template policy. No template approval, scheduling, effective-dated plan, quote, price change, booking, financial posting, invoice, bank instruction or settlement endpoint. E-30 and E-07 remain open. This is **PARTIAL** work, not a BUILT register promotion. The official screen register is deliberately unchanged.

### Required local verification and integration
1. Validate typecheck, lint, EN/UR key parity, full Vitest and the COM-001/002 E.3 API tests.
2. Run full Chromium production-build regression + evidence with retries OFF, Firefox/WebKit smoke and axe. Add authorized test-only pricing persona to exercise COM-001 create/revise browser flow, not actual staff roles. Include 320px/200% EN/UR/RTL, dark/high-contrast, keyboard and focus. Manual screen-reader/native-Urdu still open.
3. Mutation tests must remove creator-only guard, project/site scope, immutable revision append, request-key binding and expected-version check; each mutation should be caught. Test a revoked grant or site license mid-session.
4. After issue #25 Wave 1 integration becomes accepted, transplant E.3 code onto a **new** isolated worktree; reconcile central registries and imports with E.1/E.2/E.7/E.13. No overwriting merged shared catalogues or routes.
5. Stop for GPT/owner review. Do not merge to `main`, deploy, touch VPS/Bingoo/Laravel, real money or SOS.

GitHub branch/source changes are verified, but GPT **has not executed any Windows TypeScript, Vitest, Playwright or visual test** in this wave.

## COM-003 — draft pricing policies and immutable versions (Issue #29)

**Status: SOURCE PUSHED · TESTS WRITTEN, NOT EXECUTED · PARTIAL/HOLD.**

### Actual implemented files
- `packages/contracts/src/pricing.ts`: typed `PricingPolicyRule`, `PricingPolicyDraftVersion`, `PricingPolicyDraft` and scoped list. Draft fields are explicitly `effective:false`, `approvalAllowed:false`.
- `packages/fixtures/src/developer/pricing/policy-handlers.ts`: `GET /pricing/policies`, `GET /pricing/policies/:id`, `POST /pricing/policies`, `POST /pricing/policies/:id/versions`. Project and current site/feature scope are enforced with E.0 `projectVisible` and existing inventory `pricing.manage`. Each draft is creator-private and tenant-partitioned. Hidden, other-creator and unknown IDs give identical 404. Reads/list totals filter by effective access and do not write. Draft writes validate all fields before version/id consumption; immutable version snapshots; optimistic concurrency via expectedVersion. Idempotency key is bound to operation, principal, project or policy target and canonical title/rule fingerprint, with authorization checked before replay. Same request replays its original snapshot; changed payload/key collision returns 409 unchanged.
- Rate drafts are canonical PKR decimal money, validated with BigInt paisa against a defensive illustrative size ceiling, never calculated with JS money floats. Premiums/floor rise use integer basis points 0–10000; types are unique among residential/commercial/mixed. These defensive numerical bounds are **not adopted commercial policy**.
- `apps/backoffice/src/pages/developer/pricing/PricingPoliciesPage.tsx` and area route: project-scoped editor, three unit types and premium fields, create/revise, saved/error/empty/loading states and historical draft versions. EN/UR/RTL. New `PricingRelatedLinks.tsx` provides contextual, keyboard-focusable links between COM-001, COM-002 and COM-003; each route retains its server/edition gate.
- `packages/fixtures/src/developer/pricing/policy-handlers.api.test.ts`: seven API regression cases: create/read without effective policy; idempotent replay, collisions; author isolation; hidden==unknown; append-only revisions and stale write; strict monetary/rule payload refusal before writes; scoped project filter; no existing user receives pricing.manage.
- `tests/e2e/e3-pricing-policies-access.spec.ts`: two EN/UR browser tests that an existing ungranted sales principal cannot reach COM-003 nor the new API.
- English and Urdu pricing dictionary keys and E.0 handler/route registries updated.

### Strict non-scope
There is **no endpoint** to approve, schedule, activate, publish, apply to units, generate quotations, post journals, make invoices or settle money. The approval/maker-checker and E-30 rate policies remain open. No demo role is granted pricing.manage. COM-003 is not BUILT; screen register is unchanged.

### Mandatory acceptance checks (GPT cannot execute Windows build through GitHub connector)
- Validate TypeScript, ESLint, EN/UR parity and all Vitest/API tests. Investigate type/runtime compatibility, including test-only persona assignments and JSX button/link props.
- Run full final-build Chromium E2E and evidence retries OFF, Firefox/WebKit smoke and axe. Add **authorized test-only** pricing principal for positive COM-003 creation, revisions, resubmission after lost reply, EN/UR RTL reflow at 320px/200%, dark/high-contrast, keyboard and actual focus-ring visibility. Never broaden demo staff permission merely to pass a test.
- Negative tests for licence/site/project scope revoked between reads and replay, wrong creator/tenant, malformed amounts, overflow, duplicate unit types and cross-action idempotency reuse. Mutation-check creator privacy, project scope, expectedVersion and key replay guard.
- When Wave 1 Issue #25 integration is approved, transplant E.3 into an isolated new worktree and carefully merge canonical handler/router/permission resources. Do not overwrite E.1/E.2/E.7/E.13 registries.
- STOP for GPT/owner review. No main/VPS/Bingoo/Laravel, real banking, SOS, Issue #13 or private documents.

**No source compilation or browser suite was run by GPT.**

## COM-004 — Fees & Discounts (Issue #30, 15 November 2026)

**Status: GitHub source and tests pushed, but NOT LOCALLY EXECUTED. PARTIAL/HOLD.**

### Implementation
- `packages/contracts/src/pricing.ts`: typed fixed/percentage fee and percent+PKR-cap discount rules, immutable private draft versions and non-posting preview response.
- `packages/fixtures/src/developer/pricing/commercial-calculator.ts`: pure integer BigInt paisa arithmetic. The listed fictional unit price is the basis for each percentage; no JS money floats. Validates PKR decimal format, max values, unique uppercase codes across fees+discounts, 3–80 character rule descriptions, max 16 fee and 16 discount rows, 0–10000 basis-point rates; fixed-fee or percentage mode must have only its own associated field. Discounts are bounded by explicit PKR maximums. Sum of discounts cannot exceed listed price plus fees; excess causes a refusal, NEVER a silent clamp/negative payable. Zero fee/discount rows remain visible. Excess aggregate fees/discounts are refused.
- `packages/fixtures/src/developer/pricing/commercial-handlers.ts`: `GET /pricing/commercial-rules`, `GET /pricing/commercial-rules/:id`, `POST /pricing/commercial-rules`, `POST /pricing/commercial-rules/:id/versions` and pure `POST /pricing/commercial-preview`. Current `pricing.manage` authorization, tenant+project+licensing scopes, creator-private IDs and list totals, no hidden/unknown record oracle, stable mutation-free reads, append-only draft version snapshots, optimistic `expectedVersion`, request-bound idempotency and authorization-before-replay. Preview checks selected unit project and `unit.view` separately from draft scope. No fees/discounts ever modify a unit price, quote, bill, payment, payout or bank record.
- UI `apps/backoffice/src/pages/developer/pricing/FeesDiscountsPage.tsx`: responsive EN/UR form with scoped projects, fee/discount rows, fixed/rate/cap fields, validation/feedback, project-private draft list, revision history, unit selector and exact preview with zero-value lines. Routed through E.0 canonical registry at `/backoffice/com/fees-and-discounts`. Contextual pricing workspaces navigation now also includes COM-004.
- English/Urdu `pricing` dictionary extended with matching COM-004 keys.
- `commercial-handlers.api.test.ts`: 12 test cases (4 pure price/invalid vectors and 8 mock API privacy, replay, versioning, scope, preview/unchanged-state tests) **written but not run**.
- `e3-commercial-access.spec.ts`: 2 EN/UR browser permission-denial tests **written but not run**.

### Deferred / safety boundary
No adopted developer commercial policy E-30; the mock rates are **user-entered fictional draft examples**. No default or statutory percentage is assumed. No approval/activation/scheduling endpoint, real quote/invoice/payment posting, tax determination, receipt, paid status or settlement. No existing demo persona is granted `pricing.manage`; COM-004 is inaccessible to standard staff until a separately approved pricing role or test-only principal is supplied. All E.3 screens remain PARTIAL, official screen register unchanged. No `main` merge/deployment.

### Review and testing needed
1. On an isolated local worktree with this branch, run full TypeScript, lint, EN/UR parity, all Vitest, COM-004 API/security tests, final-build Chromium E2E/evidence retries OFF, Firefox/WebKit smoke, axe and 320px/200% EN/UR RTL/dark/contrast. Native Urdu and screen-reader/manual phone checks remain open.
2. Add test-only authorized pricing principal to prove real create/revise/preview keyboard journeys. Do not silently grant ordinary demo staff.
3. Mutation checks for creator-only read/updates, project/site scope, idempotency operation/actor/target/normalized payload, approval block, immutable revisions, excessive discount refusal, oversized/malformed rates and negative money. Verify false requests byte-identically preserve entire tenant section. Recheck access on replay/revocation and cross-tenant IDs. Confirm unit-price and preview remain identical to fictional baseline.
4. After Issue #25 Wave 1 integration is accepted, transplant only reviewed E.3 code into a new isolated integration branch, reconcile canonical E.0 + E1/E2/E7/E13 routes, handler registries, role counts and resource dictionaries, run the combined regression, then STOP for GPT/owner review.

**The GPT GitHub connector performed file writes and source readback, but could not run the user's Windows toolchain. Do not claim tests passed or that the module is BUILT.**

### Final COM-004 UI integrity correction

The frontend now tracks unsaved fee/discount form edits; until the draft is saved, the pure preview button is disabled and a bilingual 'save changes first' explanation is displayed. This prevents presenting the stored last-saved revision's arithmetic as if it were the user's unsaved modifications. No extra payment, pricing authority or posting operation was introduced.

## COM-005 — Pricing approval-rule draft configuration (Issue #31)

**Status: source pushed; tests written but NOT executed; PARTIAL/HOLD.**

### Delivered
- `packages/contracts/src/pricing.ts`: typed `PricingApprovalRule`, `PricingApprovalDraftVersion`, draft/list contracts and four categories: unit price change, discount exception, fee exception and payment-plan exception.
- `packages/fixtures/src/developer/pricing/approval-draft-handlers.ts`: project/creator-private `GET /pricing/approval-rules`, `GET /pricing/approval-rules/:id`, `POST /pricing/approval-rules`, `POST /pricing/approval-rules/:id/versions`. Current `pricing.manage` and E.0 site/project scope checked per request. Hidden/unknown and other-creator IDs identical 404; filtered list counts don't disclose hidden data. Full request validation before mutation, append-only version snapshots, immutable original replay, optimistic stale-version refusal and operation+actor+target+normalized-content idempotency binding. Money thresholds canonicalized in integer PKR paisa; defensive max amount, unique subjects and maximum four categories.
- Crucially, `makerCheckerRequired:true` and `allowSelfApproval:false` are **mandatory validated literal values** on every rule, never user-configurable. Reviewer count is constrained to 1–3 but defines a *draft requirement only*; the request cannot appoint or impersonate reviewers.
- `apps/backoffice/src/pages/developer/pricing/ApprovalRulesPage.tsx`: responsive EN/UR draft editor at `/backoffice/com/approval-rules`, project selector, unique review categories, PKR threshold, reviewer count, new draft/revise and version-history UX, error/empty/saved states, accessible native form controls. Added to E.0 canonical route/API registries and connected pricing-workspace navigation.
- `packages/fixtures/src/developer/pricing/approval-draft-handlers.api.test.ts`: seven positive/negative API tests written for draft/no activation, maker-checker/self-approval refusal, malformed data consumes no IDs/keys, replay and cross-principal collision, privacy of IDs/lists, append-only revisions, stale version, scope narrowing and unchanged starter permissions.
- `tests/e2e/e3-approval-rules-access.spec.ts`: English/Urdu browser tests written proving standard ungranted sales persona cannot read/create draft rule records.

### Explicit safety restrictions
There is no `approve`, `submit`, `activate`, `schedule` or `apply` handler. All objects are permanently `state:'draft'`, `effective:false`, `activationAllowed:false`, `approvesTransactions:false`. No code uses drafts to approve a real price, discount, fee, quotation, booking, invoice or payment. No live or demo starter permissions were added. Reviewer names, legal owner and threshold policy decisions E-07/E-30 remain unresolved; threshold amounts are only creator-entered fictional input. Official screen register unchanged.

### Required before final acceptance
- Clean local typecheck, lint, EN/UR key parity, all Vitest and E.3 API tests; final production-build full Chromium E2E + screenshot evidence retries OFF, Firefox/WebKit smoke, axe, EN/UR RTL and 320px/200% keyboard focus/dark/high-contrast; native Urdu/manual screen-reader review remains open.
- Separate *test-only* authorized pricing principal for positive create → revise → version history browser journeys. Do not grant `pricing.manage` to existing roles just to make tests pass.
- Mutation tests targeting `allowSelfApproval`, `makerCheckerRequired`, scope, actor/target/key fingerprint, replay authorization, currentVersion and untouched state on invalid input; direct URL unknown-vs-hidden and request after permission/site licence revocation.
- After Wave 1 Issue #25 is accepted, integrate E.3 in an isolated worktree, reconcile shared E.0 route/handler registries with E.1/E.2/E.7/E.13, rerun full combined regression, STOP for GPT/owner review.

**GPT verified GitHub source/commit writes but did not execute Windows Node/Playwright toolchain; this is not a release or BUILT acceptance.**

## INV-007 — Edit Price Drawer, private proposed-price versions (Issue #32)

**Status: source pushed, tests written but not locally executed. PARTIAL/HOLD.**

### Delivered in source
- `packages/contracts/src/pricing.ts` includes `UnitPriceChangeDraftVersion`, `UnitPriceChangeDraft` and creator-only list contract. Every proposal is `state:'draft'`, `effective:false`, `approvalAllowed:false`, `changesListedPrice:false`.
- `packages/fixtures/src/developer/pricing/price-change-handlers.ts` implements `GET /units/:id/price-change-drafts`, `GET /price-change-drafts/:id`, `POST /units/:id/price-change-drafts`, `POST /price-change-drafts/:id/versions`. Requires **both** `pricing.manage` and `unit.view` on the same current project/site for each named unit; API-level `pricing.manage` is additionally required. Creator-private list/detail counts, hidden-vs-unknown 404, tenant partitioning, current authorization-before-original-key replay, request keys bound to actor+operation+record+normalized reason/amount, all-or-nothing exact PKR money validation and append-only optimistic revisions. Initial proposal snapshots the original unit's fictional price, and each revision is distinct from that baseline.
- `apps/backoffice/src/pages/developer/pricing/EditPriceDrawerPage.tsx` route `/backoffice/inv/edit-price-drawer`: searchable visible-unit picker, React Aria `Drawer` with focus trap/Escape/focus-return behavior from the shared component, original fictional price context, a deep link to INV-006 price history, creator-private draft list, reason and proposed-PKR inputs, append-only draft revision history, localized success/error states. The drawer route is accessible with `unit.view`, but a missing `pricing.manage` presents a **clear disabled notice** and no Save action. Actual network failures instead show retryable errors, not false permission notices.
- EN/UR `pricing` keys, 4 E.3 API handlers added to E.0 canonical handlers registry, route registered in E.0 developer route registry.
- `packages/fixtures/src/developer/pricing/price-change.api.test.ts`: eight API test cases (test code written, not executed) covering original `unit.price` + `UnitPriceHistory.revisions=[]` unchanged, create replay vs changed payload, hidden/unknown parity, creator isolation, immutable revisions/stale edits, malformed money/no-op prices and short reasons, immediate access loss, absence of `unit.view` and absence of default demo grants.
- `tests/e2e/e3-price-change-drawer.spec.ts`: EN/UR accessibility and permission-denied drawer checks plus unauthorized direct API browser checks, **not executed**.

### Safety boundary

**This does not edit the unit price.** No actual `unit.price` write, no approved `UnitPriceRevision`, no approve/reject/submit/schedule/publish handler, no quotations, bookings, financial ledgers, bank or settlement changes. Owner E-07/E-30 pricing approval policy is still open. No existing starter/staff `pricing.manage` grant was added. The draft route is only a prototype and remains PARTIAL. The official register remains unchanged.

### Before reviewer acceptance

Run clean local TypeScript, lint, EN/UR parity, complete Vitest, all INV-007/E3 API tests, full production-build Chromium E2E/evidence retries OFF, Firefox+WebKit smoke, axe, 320px/200% and EN/UR RTL dark/high-contrast, focus-trap/Escape/focus-return, real-device and screen-reader checks. Use a **test-only principal** holding pricing.manage+unit.view for positive drawer save/revise, screenshot/evidence and mutations. Mutation targets: remove either permission, unit-to-project/site check, creator-private lookup, idempotency replay binding, baseline-difference guard, refusal-before-write, stale version check and unchanged original unit price. Test cross-tenant and revocation mid-session. After Issue #25 accepts Wave 1 integration, transplant E.3 into a **new isolated** integration branch, reconcile shared routes/permission/handler registries, rerun complete suite, stop for GPT/owner acceptance.

**Independent execution:** GitHub file creation/readback performed; no Windows project compilation, browser suite or server startup was executed by GPT. E.3 now has source code on all 7 planned screen routes but **0 newly accepted BUILT screens** until the actual tests/policy dependencies pass.
