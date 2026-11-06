# Gate S.3 test results

All runs on Windows 11, Node 20.20.1, production builds served by `vite preview` on ports 5773–5775 (`E2E_PORT_OFFSET=600`, both loopbacks), retries off. Business date: Monday 26 October 2026 (fixed clock in browser tests).

## Final results (integrated branch: S.3 rebased onto `474e4ae`)

| Check | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | clean |
| Lint (`eslint`, logical CSS, i18n parity: 2 locales × 27 namespaces, 10,866 keys each) | clean |
| Vitest, full suite | **1,587 / 1,587** (54 files) |
| Vitest, rentals | **86 / 86** (`rentals.test.ts`: 45 rules, vectors and catalogue; `rentals.api.test.ts`: 41 API) |
| Mutation checks | **15 / 15 killed**, each file restored byte-identically (SHA-256) |
| **Complete combined regression** (every spec in `tests/e2e`, gates B to S.3, Chromium, 3 workers, retries off) | **404 / 404** in 38.5 minutes |
| Playwright `tests/e2e/s3.spec.ts` on the final build (after a one-word Urdu label change and a test wait, see below) | **15 / 15**, two consecutive runs |
| Playwright `tests/evidence/gates3.evidence.spec.ts` on the final build | **11 / 11** (71 screenshots, 1 video) |
| Firefox and WebKit smoke `tests/smoke/s3.smoke.spec.ts` on the final build | **4 / 4** |
| Axe in the S.3 spec: 8 office screens × 3 widths × 2 languages, the landlord view × 2 widths × 2 languages, 8 screens in dark mode with high contrast × 2 languages | **68 scans, 0 violations** |

The combined regression ran on the build before two last changes: the Urdu resident-app menu label "میری کرایہ داری" → "کرایہ داری" (it was cut off in the phone bar) and the evidence spec hiding the resident app's bottom bar in full-page captures. The S.3 spec, evidence and smoke were rerun on the final build; tsc, lint and the full Vitest suite were rerun on the final code.

## Mutation checks (`test-results-s3/scratch/mutations.cjs`)

| # | Rule broken | Result |
|---|---|---|
| M1 | Pending instructions ignored in what is left to instruct | killed (3 tests) |
| M2 | Principal model: the manager shows a payable it does not hold | killed (1) |
| M3 | Payout approval by its own preparer | killed (1) |
| M4 | Lease activated by its drafter | killed (2) |
| M5 | Rent roll approved by someone who previewed it | killed (1) |
| M6 | Posting an approved roll "succeeds" | killed (1) |
| M7 | Owner-wide action with only some of the owner's sites | killed (4) |
| M8 | Idempotent replay without comparing the request fingerprint | killed (1) |
| M9 | Landlord view without the rentals grant for the site (Rule R) | killed (4) |
| M10 | Any verified link treated as a landlord role | killed (1) |
| M11 | Deposits counted as settled owner money | killed (3) |
| M12 | Payout instruction above what is left to instruct | killed (2) |
| M13 | Landlord shares not checked to make 100 % | killed (1) |
| M14 | An unsigned co-owner agreement does not block activation | killed (1) |
| M15 | A Heights lease answers a Court-only reader | killed (4) |

## Accepted tests changed (counts only, disclosed)

- `platform.test.ts`, `tenant-access.test.ts`: module catalogue 29 → 30.
- `register.spec.ts`: 439 → 449 rows, 354 → 362 distinct.

## Every interim failure (in order)

1. **Typecheck, first run (on `a0d4a70`):** HQ module-label types missing `platform:modules.rentals` (fixed: labels added in both languages); `authorityOf` input type (fixed); `leaseBlockers` called the overlap helper with a lease instead of a date range (fixed: `overlappingLease`).
2. **Background run interrupted** by the usage limit (tsc output empty); rerun clean.
3. **Exploration screenshots** (not a test): "Owner statement: Nida Saeed" linked to an owner with no agreement in force (fixed: only signed landlords); the home page listed "Rentals & owners" four times (fixed: distinct labels for the hub items); a statement's rent line showed the lease reference but linked to the rent roll (fixed: both links).
4. **S.3 e2e run 1 (10/15):** test id `wizard-unit` used twice (fixed: steps are `wizard-step-*`); at 320 px / 200 % the selected unit overflowed its field (fixed: code as option, site as hint); "sub-ledger." and "(D-33)" broke mid-word (fixed: no hyphen; word joiner).
5. **Run 2 (11/15):** unit codes and payer references broke at hyphens in the rent roll (fixed: `unbroken`); "client-money" broke (fixed: no hyphen); an error toast covered the wizard's Next button (fixed: field problems stay on their step without a toast).
6. **Run 3 (10/15):** assertions did not allow the word joiners now inside references (fixed in the test with a joiner-tolerant matcher); Lease 360's title ran off a 320 px screen (fixed: title "Lease 360").
7. **Run 4 (12/15):** an expense description broke at "H-1204" (fixed); the landlord did not see the statement issued in the office app — Riverbend's demo partition was not shared between the apps (fixed: `SHARED_TENANTS`).
8. **Run 5 (14/15):** the renewal drawer showed an ISO date that broke at 200 % (fixed: the reader's date format).
9. **Run 6 (after the rebase onto `474e4ae`):** 15/15.
10. **Evidence run 1 (10/11):** the "not in your plan" capture set the withdrawal in the resident app's tab storage only (fixed in the spec: set it in the office app too); rerun 1/1.
11. **Evidence review:** the Urdu menu label of the landlord view was cut off in the phone bar (fixed: shorter label); full-page captures showed the resident app's fixed bottom bar over content (fixed in the spec).
12. **Combined regression:** 404 / 404, first run, no failure.
13. **S.3 spec on the final build, run 1 (14/15):** the reference flow typed the search while the previous filter change was still replacing the address, so the search was applied to the "ending" filter (a test timing issue: a fast click and type). Fixed in the test by waiting for the filter's result and the address before typing; then 15/15 twice in a row.
14. Every other run listed above passed first time.

The raw logs are kept outside the repository (`test-results-s3/`, git-ignored): `full-run1.txt`, `s3-run1.txt` … `s3-final3.txt`, `evidence-run1.txt`, `evidence-final.txt`, `smoke-final.txt`, `mutations.txt`, `vitest-3.txt`.
