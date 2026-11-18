# E.3 pricing integration: test results

Branch `integration/e3-wave1-claude`. Each run records its head, its power state and its numbers. Nothing is rounded.

## Power log

Power is checked with `PowerOnline` and `Win32_Battery.EstimatedChargeRemaining`.

| UTC | PowerOnline | Charge | Used for |
|---|---|---|---|
| 2026-11-18 21:24 | False | 63 % | Own specs, 1 worker: e3qa-denied + e3qa-links |
| 2026-11-18 21:46 | False | 44 % | No browser run (below 50 %) |
| 2026-11-18 21:55 | False | 37 % | Pre-regression checkpoint; waiting for AC |

## What ran so far (before the regression)

| Check | Result |
|---|---|
| Typecheck and lint (changed files) | Clean after every commit |
| Vitest, E.3 API suites + `idempotency.test.ts` | 130 / 130 (after `9f276b9`) |
| Vitest, `packages/fixtures` | 1,183 / 1,183 (after `c156134`) |
| Vitest, `pricing-urdu.test.ts` | 3 / 3. It fails 2 / 3 on the old strings. |
| Vitest, `registry.integration.test.ts` | 4 / 4 (extended with `PRICING_HANDLERS`) |
| Chromium (own specs, 1 worker, no lock): `e3qa-denied` 6 + `e3qa-links` 18 | 24 / 24 (build of `94247ed` + deep links) |
| Normal build of all 3 apps, scanned with `scripts/check-test-principals.mjs` | **0 hits** in 713 files (287 sourcemaps).<br>Needles: 28, including every id, principal id, display name, exported name, `@repo/fixtures/testing`, `test-principals` and `build-personas.e2e`. |
| Playwright build (`PROPERTYOS_E2E_PRINCIPALS=1`), same scan `--expect-present` | The principals are in the backoffice bundle and its map only. customer-web and platform-hq: 0. |

The targeted regression has **not** run yet: full Vitest, Chromium targeted, Firefox + WebKit smoke, axe counts, mutations and the PNG review.
