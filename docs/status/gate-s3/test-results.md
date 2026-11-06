# Gate S.3 test results

All runs on Windows 11, Node 20.20.1, production builds served by `vite preview` on ports 5773–5775 (`E2E_PORT_OFFSET=600`, both loopbacks), retries off. Business date: Monday 26 October 2026 (fixed clock in browser tests).

## Issue #17 closure (6 November 2026): `7df5f80` + merge of `04b6fde` (`0dd9723`) + the closure commit

The machine was shared with two other agents (their previews on 6173–6175 and 6373–6375, their targeted single-worker runs). Before the complete run: no `.e2e-busy` lock, none of my Playwright or Vite processes other than my own previews on 5773–5775, CPU about 19 %; during it, 47–91 %. The lock `D:\laragon2\www\.e2e-busy` was held for the complete Chromium run and the cross-browser smoke, and released after.

| Check | Result |
|---|---|
| Merge `04b6fde` (`0dd9723`), before any closure change | tsc clean; Vitest **1,603 / 1,603** (56 files, 67 s) |
| Build (three apps, production), final code | built (60 s) |
| Typecheck (`tsc --noEmit`), final code | clean |
| Lint (`eslint`, logical CSS, i18n parity), final code | clean; **2 locales × 27 namespaces, 10,884 keys each** |
| Vitest, full suite (all packages) | **1,618 / 1,618** (57 files): 49 s before the complete browser run; again on the final code (after a comment-only reflow in `role-templates.ts`), 98 s |
| Vitest, rentals | **100 / 100**: `rentals.test.ts` 45 (rules, **golden vectors** `rentals.vectors.json`, catalogue), `rentals.api.test.ts` 41, `rentals.issue17.api.test.ts` 14 (new). The other golden vectors (payroll, S.1/C.2) run inside the full suite |
| Vitest, `demo-licence.test.ts` | 5 / 5 (one new: party scope narrowed, never widened) |
| Mutation checks | **25 / 25 killed** (M1–M15 rerun, M16–M25 new), every file restored byte-identically |
| S.3 spec `tests/e2e/s3.spec.ts` (targeted, 1 worker) | **17 / 17**, first run, 3.1 min |
| S.3 evidence `tests/evidence/gates3.evidence.spec.ts` (targeted, 1 worker) | **12 / 12**, 3.1 min; then the closure test alone twice (h06 recapture) 1 / 1, 1 / 1 |
| **Complete combined regression**: every spec in `tests/e2e` (gates B to S.3 and the S.1 hotfix) + the S.3 evidence spec, Chromium, production build, **3 workers, retries off** | **428 / 429** in **52.0 min**. The one failure: `identity.spec.ts:327` (D.1 organisation colours, see interim failure 1); rerun alone `--repeat-each=10`, 1 worker: **10 / 10** |
| Axe (in that run; JSON reporter, `PLAYWRIGHT_JSON_OUTPUT_NAME`) | **1,506 scans, 0 violations** (every attachment parsed); S.3: **80 scans, 0 violations** (68 before: + the read-only statement at 1440/768/390 × 2 languages and in dark mode × 2, + the partial landlord view at 1440/390 × 2) |
| Firefox + WebKit smoke, **every smoke spec** (8 files), 3 workers, retries off | run 1: **50 / 50** (Firefox 25 / 25, WebKit 25 / 25), 3.2 min; run 2: **49 / 50** (Firefox 25 / 25, WebKit 24 / 25), 3.4 min: WebKit `s2a.smoke.spec.ts` "a new guard…" failed (the option click did not close the list), the known intermittent; see the WebKit A/B below |
| S.3 smoke alone (Firefox + WebKit, targeted, before the complete runs) | 6 / 6 |
| 320 px with 200 % text, EN and UR | in the S.3 spec (every rentals screen incl. the read-only statement, the drawers, the landlord view, the partial landlord view and its statement drawer: no clipping, spill or mid-word break) and 6 evidence captures (h04–h06) |

**WebKit, reported separately.** Complete smoke run 1: WebKit **25 / 25**. Run 2: WebKit **24 / 25**: `s2a.smoke.spec.ts:52` "a new guard: validated, refused as a duplicate, saved, given tonight's night shift and on the roster" failed at `expect(page.getByRole('listbox')).toHaveCount(0)` after the click on the role option (the list stayed open for 20 s): the known intermittent, seen before on `474e4ae` and `04b6fde` (S.1 hotfix interim failure 10). **A/B on the same machine**, that test alone, `--repeat-each=10`, 1 worker, WebKit:

| Build | Result | Symptom of the failures |
|---|---|---|
| This branch (final code, served on 5773–5775), CPU about 6 % at start | **8 passed, 2 failed** (repeats 1 and 8) | listbox still open after the option click |
| Clean `04b6fde` (temporary detached worktree, its own `npm ci`, built and served on 5773–5775; the served `index.html` checked to be that build's; removed afterwards) | **8 passed, 2 failed** (repeats 7 and 9) | the same |

**"Pre-existing" is shown** to the extent ten repeats can show it: the untouched accepted base fails the same test at the same rate with the same symptom, and neither S.3 nor the closure changes HR, the roster or the search list. The test was not changed, skipped or retried. Logs: `ab-webkit-branch.txt`, `ab-webkit-base-04b6fde.txt`.

### Mutation checks (`test-results-s3/scratch/mutations-closure.cjs`, log `test-results-s3/mutations-closure.txt`)

All **25 / 25 killed**, each file restored byte-identically (SHA-256 of every rentals file and `role-templates.ts` compared before and after the whole run). M1–M15 are the gate's (rerun; M7's pattern follows the new `ownerWhole`), M16–M25 are new:

| # | Rule broken | Failing tests |
|---|---|---|
| M16 | P0: a landlord treated as the whole owner whatever sites she may see (owner-wide projection broken) | 4 |
| M17 | P0: a partial statement keeps owner-wide lines (`siteId: ''`, the reviewed bug) | 4 |
| M18 | P0: payout instructions sent to a partial landlord | 3 |
| M19 | P0: a statement of hidden sites only is listed and opened | 3 |
| M20 | P1: the issue route accepts `owner_statement.view` | 1 |
| M21 | P1: the issue action offered to every statement reader | 1 |
| M22 | P1: the accounts officer role loses `owner_statement.issue` | 12 |
| M23 | P0 (office): owner-wide figures without every site the owner's records touch | 1 |
| M24 | Issue #18: a settled line keeps its bank reference without the bank feed | 5 |
| M25 | Issue #18: an idempotent replay by another person | 6 |

**Reproduction of the P0 finding:** the new P0 tests run against the original `portal.ts` of `7df5f80` (file swapped in, then restored byte-identically): the three partial-landlord tests fail (a Court-only statement listed to a Heights-only landlord), and the full-authority test fails only on the new `scopeLimited` field (`test-results-s3/p0-repro-original-portal.txt`).

### Accepted tests changed in the closure (disclosed)

- `rentals.api.test.ts`: three assertions' refusal code `idempotency_conflict` → `idempotency_key_reused` (the shared code), one test title. Nothing else changed in them.
- `tests/e2e/s3.spec.ts`: the screen list gains the read-only statement (more axe scans and layout checks); the partial landlord view is added to the axe and 320 px loops. No assertion weakened, skipped or retried; no timeout raised.

### Every interim failure in the closure (in order)

1. **Complete combined run, Chromium:** `tests/e2e/identity.spec.ts:327` (D.1 "Organisation colours … a preset previews at once"), `expect(await html(page, 'data-palette')).toBe('indigo')` received `evergreen`. The assertion reads the attribute once, immediately after the click, without polling; the machine was at about 90 % CPU (three agents' runs). Neither the test nor the branding code is touched by S.3 or the closure (the closure's demo-scope change applies only when `demo:site-scope` is set, which this test does not do). Rerun alone, `--repeat-each=10`, 1 worker: **10 / 10**. Not proven pre-existing by an A/B (the brief asks for A/B on WebKit failures); recorded for the D.1 owner as a timing-sensitive assertion. The test was not changed, skipped or retried.
2. **API test, while writing it:** the office fail-closed test found the token `awaiting_approval` in the payouts view — it is a **key** of the `counts` object (`{"awaiting_approval": 0, …}`), not a hidden record. The test now asserts `instructions: []` and every count 0, and scans the rest of the response for the hidden tokens. No product code changed for this.
3. **Evidence review:** the h06 capture (320 px, 200 %) first cut the partial-statement notice mid-way, then showed only its start; the spec now scrolls to the notice's end (the new sentence). Recaptured twice; no product change.
4. **Complete Firefox + WebKit smoke, run 2:** WebKit `s2a.smoke.spec.ts:52` "a new guard…" failed (listbox still open after the option click), 49 / 50. Run 1 had passed 50 / 50. A/B (above): this branch 8 / 10, clean `04b6fde` 8 / 10, same symptom. Pre-existing; not changed.
5. **Merge:** no conflict and no failure (tsc clean, Vitest 1,603 / 1,603 on `0dd9723`).
6. The P0 reproduction (new tests against the original `portal.ts`) failed as intended: 4 failed, 1 passed, 9 skipped (`-t P0`).
7. Every other run listed above passed first time.

Raw logs (git-ignored, `test-results-s3/`): `vitest-merge-1.txt`, `vitest-closure-1.txt`, `tsc-merge-1.txt`, `tsc-closure-1.txt`, `tsc-closure-2.txt`, `lint-closure-1.txt`, `lint-closure-2.txt`, `mutations-closure.txt`, `p0-repro-original-portal.txt`, `closure-s3-run1.txt`, `closure-evidence-run{1,2,3}.txt`, `closure-smoke-s3-run1.txt`, `closure-full-run1.{txt,json}`, `closure-identity-repeat10.txt`, `closure-smoke-full-run{1,2}.{txt,json}`, `ab-webkit-branch.txt`, `ab-webkit-base-04b6fde.txt`, `ab-npm-ci.txt`.

## Gate build results (integrated branch: S.3 rebased onto `474e4ae`, before the closure)

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
