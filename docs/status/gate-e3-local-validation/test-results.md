# Gate E.3 local validation — test results (Agent 2, Wave 2)

Machine: Windows 11, Node 20.20.1 (Laragon), Playwright 1.64.1, Vitest 4.1.12, Vite 8.3.5, shared with two other
agents (CPU often 90–100 %). Worktree `D:\laragon2\www\propertyos-e3-qa`, `E2E_PORT_OFFSET=3200` (8373–8375),
production builds served by `vite preview` on both 127.0.0.1 and ::1; retries OFF everywhere. Raw logs and JSON
are in `test-results-e3qa/` (git-ignored).

## 1. Baseline — GPT's tip `c4a6f3a`, before any change

| Check | Result |
|---|---|
| `npm ci` | OK |
| `npm run typecheck` | **exit 2, 19 errors**: 13 in `calculator.ts` / `commercial-calculator.ts` (TS18046/18047/2322/2345/7006), 5 × TS2322 in the E.3 API suites (session `personaId`), 1 × TS2351 in `e3-price-history.spec.ts` (`new URL` on a shadowing const) |
| `npm run lint` | **exit 1**: ESLint 3 errors (react-router imported by `UnitPriceHistoryPage` and `EditPriceDrawerPage`; unused `Money` in `price-change-handlers.ts`). Run separately: logical CSS OK; i18n parity OK (2 × 28 namespaces, 11,175 keys) |
| `npm test` (Vitest) | 77 files, **1,811 passed**, 0 failed (68.7 s). Not collected: `apps/backoffice/.../revision-sync.test.ts` (6 tests of GPT passes 5 and 7) |
| `npm run build` | OK (3 apps; pre-existing chunk-size warnings only) |
| `npx playwright test tests/e2e/e3-*.spec.ts --project=e2e --retries=0` | **16 tests: 14 passed, 2 failed** (30.5 s): `e3-price-history.spec.ts:32` (waits for `state-error`; the shell answers first) and `:54` (`TypeError: URL is not a constructor`) |
| `tests/e2e/register.spec.ts` (extra) | 16 tests: 15 passed, **1 failed** — "register addresses 51–75": INV-006 renders its page while its row is PLANNED |

GPT could run none of these; every number above is the first local execution of that tip.

## 2. After — branch tip (see §5 for the complete browser run)

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 (ESLint, logical CSS, i18n parity 2 × 28 namespaces, 11,175 keys) |
| `npm test` (Vitest) | **79 files, 1,872 tests** (+1 collected file `revision-sync.test.ts` with 6, +1 new `e3qa-flows.api.test.ts` with 54, +1 case in `request-key.test.ts`). On `cefed5e`: 1,872 passed. On `faf60e0` (CPU 80–100 % with the other agents' runs): 1,870 passed, 2 timed out at 5 s in `community.test.ts` and `finance.api.test.ts` (suites this branch does not touch; the known load-sensitive ones) — rerun alone: 2 files, 78/78 passed |
| `npm run build` | OK |
| Shipped-build proof (`scratch/shipped-check.sh`) | `npm run build`-style backoffice build without the flag: **0** emitted files (JS and sourcemaps) contain `res_e3qa`, `usr_e3qa` or "E3 QA Pricing"; the Playwright build: 1 JS file |

### E.3 browser specs (Chromium, test-only principal unless stated)

| Spec | Tests | What |
|---|---|---|
| `e3-*.spec.ts` (GPT, 7 files) | 16 | ungranted sales: every screen and endpoint refused (403, `changed:false`), EN/UR; INV-006 baseline, deep link, axe; hidden == unknown unit |
| `e3qa-authorized.spec.ts` | 9 | sign-in never lists the principals; key mismatch refused (422, state byte-identical) for all 5 families; COM-001 creator / project / tenant privacy (unknown-id answer, empty list); INV-007 cross-tenant drawer == nonexistent unit; revocation (register page, no Save, 403, nothing written); site scope narrowed mid-session; COM-002 shows exactly the server preview; outage vs 404 title; drafts never become price history |
| `e3qa-editors.spec.ts` | 19 | per editor (COM-001/003/004/005, INV-007): create + revise (inert, unit price unchanged), lost create / lost revision retried with the same key (one record), reads failing after a save (confirmation holds, one POST, no duplicate) |
| `e3qa-conflict.spec.ts` | 5 | concurrent revision → 409, state byte-identical, reopening shows the latest, revision becomes v3 |
| `e3qa-quality.spec.ts` | 10 | all 7 screens populated × EN/UR × 1440 / 390 / 320 @ 200 % / dark-1440 / dark-390: `dir`, no sideways scroll, layoutProblems = [], axe 0 |
| `e3qa-keyboard.spec.ts` | 5 | COM-001 and INV-007 keyboard-only in light and dark (rings ≥ 2 px solid, focus to the confirmation, Escape closes, focus back on the unit card); COM-004 preview by keyboard |
| `tests/evidence/e3qa.evidence.spec.ts` | 9 | 60 PNGs in `screenshots/` (widths 60/60 match their names) |

## 3. Mutation checks

**Vitest (server guards, revision-sync, principal gate): 22/25 caught** (`test-results-e3qa/mutations-vitest.json`;
every file restored byte-identical by SHA-256). V13 (COM-004 preview without `unit.view`) first survived; the
test added in `979d155` now catches it. Equivalent survivors: V03 (re-authorization before replay — the same
checks run earlier on both paths), V12 (excessive-discount guard — `fromPaisa` refuses the negative payable),
V16 (pricing.manage per project in the plan preview — same module and scope as `unit.view` today).

**Browser (UI fixes; backoffice rebuilt per mutant, targeted spec): 12/14 caught** (`mutations-browser*.json`):
B01 D8b repeat press resent · B02 D8 confirmation hidden on failing read · B03 D9 no refetch after 409 · B04 D10
scope title for every error · B05 INV-007 no-permission notice · B06 D13 no focus to the confirmation · B07 D13 no
focus return · B08 D12 amounts keep the no-break space · B10 drawer buttons `nowrap` · B11 word joiners removed ·
B12 shell record check skipped for units · B14 COM-005 buttons `nowrap` — all caught. B09 / B13 (COM-005 field
`min-w-0` / `w-full`) survived: B14 shows COM-005's overflow came from its non-wrapping buttons; the field
classes are defensive there.

## 4. Known intermittents and notes

- A first full E.3 browser run was invalid and was stopped: it ran against a build made while `mutate.cjs` had a
  fixture mutant applied (the browser bundle contains the mock server). Rule since then: never build during a
  mutation run; rebuild cleanly afterwards (done).

## 5. Complete regression (under the shared lock)

**Pre-regression checkpoint: the complete Chromium regression and the Firefox/WebKit smoke have NOT yet been
run (blocked on AC).** The PC has been on battery since about 20:30 UTC; Agent 1 holds the shared lock with
priority until AC returns. `test-results-e3qa/scratch/wait-and-run.sh` waits, yields to Agent 1, needs AC, then
runs `final.sh`; the results will be added here in a separate docs/test-results commit.

What was run on this code (product source identical to `8a341a0`; later commits are docs only):

| Check | Result |
|---|---|
| typecheck | exit 0 |
| lint (ESLint, logical CSS, i18n parity) | exit 0 |
| Vitest | 79 files, 1,872 tests: 1,870 passed + 2 timed out at 5 s under full CPU (`community.test.ts`, `finance.api.test.ts`, untouched by this branch), which pass alone (78/78) |
| E.3 browser specs, Chromium (64) | last result per spec on this branch: GPT `e3-*` 16/16, `e3qa-authorized` 9/9, `e3qa-editors` 19/19, `e3qa-conflict` 5/5 (run q4, build of `ab223d2`'s source + the uncommitted reflow work, before `cefed5e`…`df0bd28`); `e3qa-quality` 10/10 and `e3qa-keyboard` 5/5 (run q9, final product source) |
| Evidence (`e3qa.evidence.spec.ts`) | 9/9 on the final product source; 60 PNGs, widths 60/60, reviewed |
| Mutations | Vitest 22/25 caught (V03, V12, V16 equivalent); browser 12/14 caught (B09, B13: defensive classes) |
| Shipped-build proof | 0 files with the test principals; Playwright build: 1 |
