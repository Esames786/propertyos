# Gate E.3 local validation: report

**Status:** All seven E.3 screens (INV-006, INV-007, COM-001…005) are validated and repaired on a local Windows worktree. They remain **PARTIAL**; none is BUILT. The work is pushed and **STOPPED for GPT/owner review**.

> The coordinator wrote this report from Agent 2's final hand-off (Wave 2). The harness does not let subagents write report or findings files, so the findings are included here. §16 lists the coordinator's own checks.

## 1. Assignment

Local validation and repair of GPT's E.3 pricing work (Issues #27–33, draft PR #34), under the owner directive of 17 Nov 2026 (Agent 2).
- **Base:** GPT's `fix/gate-e3-qa-hardening-gpt@c4a6f3a`.
- **GPT's branches are unchanged:** `fix/gate-e3-qa-hardening-gpt` is still at `c4a6f3a`.
- **Not merged:** `integration/e-wave1`.
- **Rules:** no pricing permission is granted to any ordinary demo role, and no pricing policy is activated.

## 2. Branch

`fix/gate-e3-local-validation-claude`, pushed without force.

| Commit | Content |
|---|---|
| `67be408` | Labelled checkpoint before the full regression (23 commits on top of `c4a6f3a`), pushed while the PC was on battery |
| `0c26493` | Results docs only (complete Chromium run, Firefox/WebKit smoke) |
| this commit | This report. Docs only. |

The complete run used the build of `67be408`. Its product source is identical to `8a341a0`, and `0c26493` changes docs only.

## 3. Changed files (105 files, +1,931 / −183, measured from `c4a6f3a`)

**Pages:** the seven pricing pages, plus new `amount.ts` and `saved-focus.ts`.

**Mock server:**
- the five draft handlers;
- `request-key.ts`, which adds `ownReplay`;
- the two calculators (type fixes only).

**Test-only principal:** new `packages/fixtures/src/developer/pricing/test-principals.ts`. It is exported only through `@repo/fixtures/testing` (`packages/fixtures/src/testing.ts`).

**Tests:**
- `packages/fixtures/src/developer/pricing/e3qa-flows.api.test.ts` (54 tests);
- `tests/e2e/`: `e3qa-authorized`, `e3qa-editors`, `e3qa-conflict`, `e3qa-quality` and `e3qa-keyboard` specs;
- `tests/evidence/e3qa.evidence.spec.ts` (60 PNGs);
- `tests/support/e3-pricing.ts` and `e3-editors.ts`;
- fixes to GPT's own tests.

**Docs:** `CHECKPOINT.md`, `test-results.md`, `REPORT.md` and `screenshots/`.

**Shared-file changes.** All are small, additive and marked *provisional, reconcile at integration*.

| File | Change |
|---|---|
| `apps/backoffice/src/main.tsx` | Personas list: `ALL_PERSONAS`, plus the test principals only when compiled in |
| `apps/backoffice/vite.config.ts` | One `define`: `__E2E_TEST_PRINCIPALS__` |
| `playwright.config.ts` | webServer env `PROPERTYOS_E2E_PRINCIPALS=1` |
| `vitest.config.ts` | Adds `apps/*/src/**/*.test.ts` |
| `packages/fixtures/package.json` | `"./testing"` export |
| `docs/ui/screen-register.csv` and `register.generated.ts` | INV-006, INV-007 and COM-001…005 move from PLANNED to PARTIAL |
| `packages/i18n/locales/en-PK/pricing.json` | A word joiner after the hyphen in 14 compound words; keys unchanged |

## 4. Screen status: 0 BUILT, 7 PARTIAL

The screens are INV-006 price history, INV-007 price drawer, and COM-001 to COM-005: plan templates, plan builder, pricing policies, fees and discounts, and approval rules.

All seven stay PARTIAL because:
- Wave 1 integration is not yet accepted;
- owner decisions E-07 and E-30 are open;
- no demo role or persona holds `pricing.manage`.

## 5. Features completed

**Five test-only principals:** all projects, a peer, Heights-only, a revoked variant, and a Crescent Bay tenant.
- None is in `ALL_PERSONAS` or `PERSONAS`, none has a `roleId`, and none is listed on the sign-in page.
- They are compiled in only when `PROPERTYOS_E2E_PRINCIPALS=1`, which only Playwright's builds set. A Vite `define` turns the switch into a literal, and the factory calls are marked PURE, so the bundler drops them otherwise.
- **Proof:** a build without the flag contains them in **0 files, sourcemaps included** (`scratch/shipped-check.sh`); the Playwright build contains them in 1 file.

**Flows proven by API and browser tests:**
- create and revise;
- retry with the same key, and a lost response;
- concurrent edit and stale version (409);
- a failed GET after a successful POST;
- access denial;
- project and tenant isolation with no id oracle;
- unit price and price history unchanged;
- store byte-identical after every refusal;
- header/body key mismatch refused.

## 6. Test outcomes

| Check | Baseline at `c4a6f3a` | Now |
|---|---|---|
| Typecheck | exit 2, **19 errors** | exit 0 |
| Lint | **3 ESLint errors** | exit 0 (ESLint, logical CSS, i18n parity 2 × 28 namespaces × 11,175 keys) |
| Vitest | 1,811/1,811, but `revision-sync.test.ts` was **never collected** | 79 files, 1,872 tests; see below |
| Build | OK | OK |
| E.3 Playwright | 14/16 | see the complete run |
| `register.spec` | 15/16 | 16/16 |

**Vitest now:** all 1,872 passed on `cefed5e`. On the final source, 1,870 passed and 2 hit the 5-second timeout under full CPU. Both are in suites this branch doesn't touch (`community.test.ts`, `finance.api.test.ts`), and both pass alone, 78/78.

**Complete Chromium run** (on AC, under the lock, 09:21–10:18Z, build of `67be408`, 3 workers, retries off): **575/575 passed, 0 flaky**, 50.2 min.

| Spec | Result |
|---|---|
| GPT's `e3-*` specs | 16/16 |
| `e3qa-authorized` | 9/9 |
| `e3qa-editors` | 19/19 |
| `e3qa-conflict` | 5/5 |
| `e3qa-quality` | 10/10 |
| `e3qa-keyboard` | 5/5 |
| `register.spec` | 16/16 |
| Evidence | 9/9 |

**Firefox and WebKit smoke:** 70/70 in 6.5 min. The known WebKit intermittent `s2a.smoke:52` passed.

**axe:** 1,681 scans, 0 violations (74 of them on E.3 screens). Other gates' accepted PNGs were not changed.

## 7. Permission and security tests

**Refusal and revocation**
- The ungranted sales user is refused on all seven screens and their endpoints, in EN and UR (GPT's specs).
- **Revoking `pricing.manage` mid-session** for the same principal:
  - lists, reads, writes and even an exact replay are refused, and the store stays byte-identical;
  - the COM screens fall back to the register page, and INV-007 offers no Save.
- With the inventory module withdrawn, requests are refused (API).

**Isolation and no id oracle**
- When the site scope is narrowed mid-session through the demo switch, Heights drafts and units answer exactly like unknown ids (browser).
- All of these get exactly the unknown-id 404, and lists do not count the draft (API in all five families; browser for COM-001 and INV-007):
  - another creator;
  - another project header;
  - Heights-only scope;
  - the Crescent tenant.
- A create limited to one project answers exactly like a nonexistent project or unit.

**Other checks**
- The COM-004 and COM-002 previews are refused without `unit.view`.
- A header/body key mismatch gets 422 in all five families, before any id, version or key is used (API and browser).
- No unit price, price history or other section ever changes.
- The test principals are never offered on the sign-in page.

## 8. Mutation checks

Every mutated file was restored byte-identical (checked by SHA-256).

**Vitest-backed: 22/25 caught.**
- V13 (COM-004 preview without `unit.view`) survived at first; the test added in `979d155` now catches it.
- Three survivors are equivalent:
  - **V03** removes the re-check before a replay, but the same checks already run earlier on both paths.
  - **V12** removes the excessive-discount guard, but `fromPaisa` refuses the negative payable anyway.
  - **V16** removes a per-project `pricing.manage` check, which is redundant with `unit.view` under the current access model.

**Browser: 12/14 caught.**
- B09 and B13 (the COM-005 field classes `min-w-0` / `w-full`) survived.
- B14 showed that COM-005's overflow came from its non-wrapping buttons, so those field classes are only defensive there.

## 9. Accessibility

**Layout:** all seven screens, populated, in English and Urdu (RTL), at 1440 px, 390 px, 320 px with 200 % text, and dark mode at 1440 and 390. Every one passes on `dir`, with no sideways scroll, `layoutProblems = []`, and axe 0.

**Keyboard-only journeys, in light and dark:**
- every stop draws a solid ring of at least 2 px;
- after Save, focus lands on the confirmation;
- in INV-007, Escape closes the drawer and focus returns to the unit card.

**Still open:** native Urdu and screen-reader review.

## 10. Screenshots

There are 60 PNGs in `screenshots/`, and all 60 widths match their names. Agent 2 reviewed them with 4× crops, which caught two defects:
- the U+2011 glyph problem, fixed in `568adb8`;
- the unit reference and amount wrapping in Urdu, fixed in `df0bd28`.

## 11. Defects found and fixed

| # | Commit | Defect | Origin | Test |
|---|---|---|---|---|
| D1 | `ed4a321` | The calculators' never-returning helpers did not narrow types (13 typecheck errors) | GPT code | typecheck |
| D2 | `57d597d` | The API suites' session `personaId` type rejected the test ids (5 × TS2322) | GPT test | typecheck |
| D3 | `1083b54` | `e3-price-history.spec.ts` shadowed `URL` (TS2351, plus a runtime TypeError) | GPT test | same spec |
| D4 | `a12725e` | The hidden-unit test expected the page's error state; the shell answers `out_of_scope` first, identically for hidden and unknown units | GPT test | same spec, now asserting that |
| D5 | `dffe342` | `react-router` imported in the INV-006/007 pages (ADR-0001 §2.3 lint rule) | GPT code | lint; INV-006/007 specs |
| D6 | `080f154` | Unused import | GPT code | lint |
| D7 | `641a6b7` | Vitest never collected `apps/**` tests, so `revision-sync.test.ts` (GPT passes 5 and 7) never ran | config | its 6 tests now run |
| D7b | `1c5364d` | The seven mounted screens were still PLANNED in the register, so `register.spec` failed | GPT code | `register.spec` |
| D8 | `c4cb1c0` + `76c6887` | After a successful save, failing reads hid the confirmation behind "This section couldn't load… Nothing was changed" (COM-001/003/005, INV-007), and COM-004 let Save resend identical content under a fresh key | GPT UI | `e3qa-editors` |
| D8b | `76c6887` | The first D8 fix disabled Save, which dropped keyboard focus to the page body; caught before push | this branch | `e3qa-editors`, `e3qa-keyboard` |
| D9 | `43e3d2e` | After a 409, reopening the draft rehydrated the stale cached version, so every retry was another 409 | GPT UI | `e3qa-conflict` (5 editors) |
| D10 | `c840822` | A 503 on a unit's price was titled "not available in your current scope" | GPT UI (honesty) | `e3qa-authorized` |
| D11 | `be4d882` | Replay lookups used `map[key]`, so valid keys named like `Object.prototype` members (`hasOwnProperty`, `__defineGetter__`) got a spurious 409. Fails closed. | GPT server (low) | `request-key.test`, `e3qa-flows` (5 families) |
| D12/D14 | `cefed5e`, `568adb8`, `df0bd28` | Reflow problems at 320 px with 200 % text (list below) | GPT code | `e3qa-quality` |
| D13 | `ab223d2` | After a save, keyboard focus fell to the page body; in INV-007, Escape stopped closing the drawer and focus did not return on close | GPT keyboard/focus | `e3qa-keyboard` |
| T1 | `979d155` | No test covered previews without `unit.view` (the V13 gap) | test gap | — |
| Harness | `ae4bb8d` | Injected failures are now real `ApiError`s | test harness | — |

**D12/D14 details:**
- Amounts could not wrap because of Intl's no-break space; fixed with `wrappable()`.
- Long buttons ran off the screen; fixed with `max-w-full whitespace-normal`.
- The four COM editors scrolled sideways because of the min-content size of fieldsets, selects and labels; fixed with `min-w-0 w-full`.
- Hyphenated words broke at the hyphen; fixed with a word joiner.
- The COM-004 unit option now shows only its reference, and INV-007's draft amount is an inline-block.

## 12. GPT's six QA passes, run locally

| Pass | Claim | Local result |
|---|---|---|
| 1 | Dirty guards; Save waits for the selected draft; INV-006 → INV-007 link | Holds |
| 2 | `res_e3_…` ids | Partly: the ids were valid, but the suites still failed typecheck (D2) |
| 3 | Identity section excluded from snapshots | Holds |
| 4 | Success depends only on the POST | The handler logic holds, but the screen still hid the confirmation or allowed a resend (D8) |
| 5 | Version floor | Holds, but its tests had never run before D7. Now collected, they pass, and mutants V24 and V25 are caught. |
| 6 | Header/body key mismatch refused | Holds in all five families |
| after 6 | `8831148…c4a6f3a`, which pin the submitted version | Holds |

## 13. Security findings

- **D11** is the only server flaw found, and it fails closed.
- No pricing grant was added to any role or persona.
- Drafts stay inert: there is no approval, posting, price change, quote or payment anywhere.
- The test-only principals cannot reach the shipped build (§5). Deployments must always build without `PROPERTYOS_E2E_PRINCIPALS`; never deploy a Playwright-made `dist`.

## 14. Remaining blockers and owner decisions

- E-07 and E-30 are still open.
- **E.0 DevScreen behaviour:** users without the permission see a "Planned / Partly built" register page instead of an access outcome. This is E.0's behaviour, so it belongs to integration (Agent 1 added a `refusal: 'outcome'` mode on `integration/e-wave1`). This branch asserts it as it is.
- **Deep links:** the COM pages ignore `?record=`, so a selected draft cannot be linked to and does not survive a reload.
- **Long titles:** a title of up to 100 characters scrolls inside its single-line field at 320 px / 200 %. The short values in the specs are deliberate.
- **Native selects** clip their text at 200 %, from the start of the text in Urdu.
- **Urdu labels:** `templateAdd` ("سطرداخل کریں") and `templateDelete` ("سطراٹھائیں") lack a space between their words.
- **Still to do:** native Urdu and screen-reader review.

## 15. Integration readiness

The branch is ready to transplant onto an **accepted** `integration/e-wave1`. Reconcile the shared-file changes listed in §3. In particular, the E.0 DevScreen refusal mode there should replace the register-page fallback this branch asserts.

## 16. Coordinator verification and observations

**Push and branch state**
- `git ls-remote` showed `0c26493b79182011d64d635e8a49a5ff71c467d1` before this report commit.
- The worktree was clean.
- `fix/gate-e3-qa-hardening-gpt` is still at `c4a6f3a`.

**Changed files**
- `67be408..0c26493` and `8a341a0..67be408` touch `docs/` only.
- `git diff --name-only c4a6f3a..HEAD`: no `PROJECT_HANDOFF.md`, Nizam material, ZIPs, `.env` files, keys or credentials, and no other gate's PNGs.
- No changes to `people.ts`, `role-templates.ts`, `persona.ts` or `permissions.ts`.

**Shipped build:** the `__E2E_TEST_PRINCIPALS__` wiring in `main.tsx`, `vite.config.ts` and `playwright.config.ts` was read and confirmed. The recorded shipped-build check found 0 files containing the principals.

**Lock and ports:** the lock passed straight to Agent 1's confirming Issue #25 run, and ports 8373–8375 had no listeners.

**Screenshots reviewed**
- `inv-007-price-drawer-1440-en`: "Current fictional listed price", draft revisions kept as immutable history.
- `com-004-fees-discounts-1440-ur`: the preview arithmetic checks out: 32,180,000 + fees 346,800 (25,000 + 1 % transfer 321,800) − discount 500,000 (2 %, capped) = 32,026,800.
- `focus-com-001-save-200pct-320-ur`: the focus ring is clearly visible on Save.

**Minor UX observation, not fixed:** in COM-004's breakdown, the discount row shows "Rs 500,000.00" with no minus sign or "less" label, beside the fee rows. Consider marking deductions explicitly.

**STOPPED for GPT/owner review. Nothing is merged to `main` and nothing is deployed.**
