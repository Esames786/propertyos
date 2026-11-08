# Integration report: S.3 Rentals + UX B1 + Issue #21 + UX B2

**Branch:** `integration/s3-b1-b2` (worktree `D:\laragon2\www\propertyos-int-s3b`), from the accepted S.3 commit `ae3b3a1`.
**Directive:** owner, 8 November 2026 (GPT approved S.3 `ae3b3a1`, B1 `682216f`, B2 `7ac865f`, Issue #21 `15333a7`; Issues #17, #19, #20, #21 closed).
**Plan:** `docs/status/integration-s3-b1-b2/INTEGRATION_PLAN.md` at `bd7b8ec` (branch `docs/integration-plan-s3-b1-b2`), followed in §5–§9 with the directive's changes: Issue #21 included (merged as `15333a7`, which carries B1), `682216f` never merged on its own, the `cnidem` evidence spec added to the run, and two integration mutants (I-1, I-2).
**Status: STOPPED for independent GPT and owner review.** Nothing is merged to `main`; nothing is deployed.

## Summary

- **Merges:** `58f5f03` (S.3 + `15333a7`, which carries B1 `682216f`) and `7c24a31` (+ B2 `7ac865f`), both `--no-ff`, **no conflicts** (trees equal the `merge-tree` dry run; `git show --cc` empty). Integration commit `be70695`: tests only.
- **§5.1:** every Rentals KPI tile states its amount once, its hint once, its count once, in EN and UR, at 1440 px and at 320 px with 200 % text (B2's StatTile, path A; no Rentals change). **§5.2:** unchanged: `settled` has no writer; Rentals imports only `problem`, `stamp` and `seesBankFeed` from society code. R-INT-1…4 are recorded as binding requirements on S.3's G1.
- **Register:** 449 rows / 362 distinct (139 built, 43 partial, 180 planned); `register.generated.ts` unchanged.
- **Static:** `tsc` clean; ESLint, logical CSS and i18n parity clean (10,915 keys per locale); Vitest **1,682 / 1,682** twice (= 1,678 expected + 4 integration); golden vectors green.
- **Chromium:** **538 / 538** (495 e2e + 43 evidence; computed per source branch), 46.7 min, 3 workers, retries off, on AC, no standby. **axe:** 1,606 scans, **0 violations**.
- **Smoke:** Firefox **35 / 35**; WebKit **34 / 35**, the known S.2a "a new guard" intermittent (alone 5 / 20 failed; source branches 6–12 / 20).
- **Mutations:** every previously caught mutant is still caught, with the same failing-test counts as on its own branch (S.3 28, B1 36 + Issue #19 10, Issue #21 37 + W1–W4, Issue #18 35 of 36 with I5 equivalent as before, Issue #16 all but J1 as before); the new I-1, I-2, G-1 and G-2 are caught.
- **All 12 required survivals** have named, passing tests (§9).
- **Accepted evidence:** untouched (rewritten files compared, explained, restored). New evidence: 12 screenshots in this folder.
- **Recommendation:** accept (§10), with the findings in §7 recorded and the manual checks open.

## 1. Merges and ancestry

| Step | Commit | Parents | What it brings |
|---|---|---|---|
| Base | `ae3b3a1` | – | S.3 Rentals, closure 2 (Issue #17), containing the S.1 hotfix `04b6fde` (Issue #18) |
| Merge 1 | `58f5f03` "Integrate UX B1 + Issue #21 credit-note idempotency (15333a7) into S.3" | `ae3b3a1`, `15333a7` | UX B1 money truth (`6b1d7f9`, Issue #19 closure `682216f`) and Issue #21 (`15333a7`). `682216f` is an ancestor of `15333a7` and is not merged separately. |
| Merge 2 | `7c24a31` "Integrate UX B2 accessibility (Issue #20 closure, 7ac865f) into S.3 + B1 + Issue #21" | `58f5f03`, `7ac865f` | UX B2 (`a0897b9`, `0884f03`, Issue #20 closure `7ac865f`) |
| Integration commit | `be70695` | `7c24a31` | Tests only (§3) |
| Docs commit | the branch tip (the commit that adds this file) | `be70695` | This folder: this report, `test-results.md`, `MANUAL_VERIFICATION.md`, 12 screenshots |

```
$ git log --graph --oneline ae3b3a1~1..be70695
* be70695 Integration S.3 + B1 + Issue #21 + B2: Rentals KPI names, no-writer guard, Rentals focus rings, evidence spec
*   7c24a31 Integrate UX B2 accessibility (Issue #20 closure, 7ac865f) into S.3 + B1 + Issue #21
|\
| * 7ac865f UX B2 follow-up (Issue #20): keyboard focus rings product-wide; Rentals KPI names
| * 0884f03 UX batch B2: report (findings, observations, integration notes)
| * a0897b9 UX batch B2: accessibility blockers and one-line shared fixes
*   58f5f03 Integrate UX B1 + Issue #21 credit-note idempotency (15333a7) into S.3
|\
| * 15333a7 Issue #21: credit notes bound to their request key; a retry shows the note already issued
| * 682216f Issue #19: a credit note can never credit one line twice or a line of another bill
| * 6b1d7f9 UX B1 "Money truth": reversed payments, credit notes, drafts and policy sends tell the truth
* ae3b3a1 Gate S.3 closure 2 (Issue #17): office statement list and lookup never disclose hidden-site statements
```

- Both merges were made with `git merge --no-ff`; no rebase, no squash, no force push. No source branch was touched: `feature/gate-s3-rentals` = `ae3b3a1`, `fix/ux-b1-money-truth` = `682216f`, `fix/credit-note-idempotency` = `15333a7`, `fix/ux-b2-accessibility` = `7ac865f` on `origin` before and after.
- All four inputs share the merge base `04b6fde` (S.1 hotfix, Issue #18).

## 2. Conflicts and resolutions

**None.** Checks used:
- Dry run before merging: `git merge-tree --write-tree` of `ae3b3a1` + `15333a7` gave tree `4b65a61`, and of that result + `7ac865f` gave tree `004983e`, both without conflicts.
- After merging: `58f5f03^{tree}` = `4b65a61` and `7c24a31^{tree}` = `004983e`, the dry-run trees exactly.
- `git show --cc` of each merge commit is empty: no line of the result differs from both parents (no hand-made change inside a merge).
- Files changed on both sides (against `04b6fde`), read hunk by hunk:
  - Merge 1: `docs/ui/screen-register.csv` only (S.3 appends 10 rows; B1 edits notes on 18 rows). Independent; `npm run register:sync` afterwards reports 449 / 362 and leaves `register.generated.ts` unchanged.
  - Merge 2: `apps/backoffice/src/pages/society/collections/CollectionsPanel.tsx` (B1: reversed badge in "Latest payments"; B2: the four tiles' `accessibleValue` now leave the context to StatTile; the "collected" name counts `data.collected.payments`, which B1 made live payments only, as intended), `apps/customer-web/src/pages/dues/DuesPages.tsx` (B1: bill, history and receipt pages; B2: `tabIndex={-1}` on the re-send file input), `packages/i18n/locales/{en-PK,ur-PK}/common.json` (S.3 role names; B2 `calendar` block). Independent regions; both intents kept by git's text merge.
- Post-merge checks: after merge 1, `tsc` clean and Vitest `packages/fixtures` + `packages/ui` 867 / 867; after merge 2, `tsc` clean and Vitest `packages/ui` 92 / 92.

## 3. Integration commit `be70695` (the only new code)

Tests only; no product file changed. Defects found are findings (§7), not fixed.

| File | Purpose |
|---|---|
| `packages/fixtures/src/rentals/rentals.integration.test.ts` (4 tests) | Plan §5.2 as a test: no non-test source writes `RentalsState.settled` (member-access writes, assignments, index writes, length changes; the store's only initialiser is `settled: []`; only `state.ts` names `SettledEvent`); from society code Rentals imports exactly `problem`, `stamp` (`society/handlers`) and `seesBankFeed` (`society/finance/bank-scope`), with no namespace, default, side-effect or dynamic import; no code outside Rentals reaches into its records (only the route table registers its handlers; nobody else names its demo section); on the merged demo every settled-basis figure is 0.00 and the store holds no settled event. |
| `tests/e2e/int-s3b.spec.ts` (9 tests) | Plan §5.1: every `rent-kpi-*` accessible name in EN and UR at 1440 px and at 320 px with 200 % text, with axe (2 tests). B2's keyboard rings (helper `tests/support/focus.ts`, B2's thresholds) on Rentals controls in light, dark with high contrast and 320 px at 200 %, EN and UR (6 tests), and in the ocean, indigo and warm palettes, light and dark (1 test). |
| `tests/evidence/ints3b.evidence.spec.ts` (4 tests) | The integration screenshots, written to this folder only. |

`npm run register:sync`: **449 rows, 362 distinct screens (139 built, 43 partial, 180 planned)**; 321 V2.1 IDs and addresses preserved. `packages/contracts/src/screens/register.generated.ts` is unchanged (git's merge of the CSV already gives the synced result; B1's 18 note edits do not reach the generated file), so it is not committed.

## 4. Plan §5 outcomes

### §5.1 Rentals KPI names (path A, B2's `StatTile`)

No Rentals change was needed. On the merged build, at 1440 px and at 320 px with 200 % text (EN and UR identical in structure):

| Tile | Accessible name (EN) | Accessible name (UR) |
|---|---|---|
| `rent-kpi-active` | Active leases, 4 | فعال لیز, 4 |
| `rent-kpi-rent` | Monthly rent under management, Rs 273,000.00, a contract figure, not money received | زیرِ انتظام ماہانہ کرایہ, Rs 273,000.00, معاہدے کی رقم، وصول شدہ رقم نہیں |
| `rent-kpi-due` | Rent due in October 2026, Rs 273,000.00, approved demand — not invoiced, not collected | اکتوبر 2026 میں واجب کرایہ, Rs 273,000.00, منظور شدہ مطالبہ — نہ انوائس، نہ وصول |
| `rent-kpi-payable` | Owner payable (settled money only), Rs 0.00. nothing is settled: no bank evidence exists here | مالکان کو واجب الادا (صرف طے شدہ رقم), Rs 0.00. کچھ طے نہیں: یہاں کوئی بینک ثبوت نہیں |
| `rent-kpi-pending` | Payout instructions pending, 0, prepared or approved — none is sent or paid | زیرِ التوا ادائیگی ہدایات, 0, تیار یا منظور — کوئی بھیجی یا ادا نہیں ہوئی |

The test asserts, per tile: the computed accessible name equals the `aria-label` and no description is attached; the name starts with the visible label; an amount tile's visible context is "amount · hint", the amount's digits are the server's KPI, the amount occurs once and the hint once, and the name is exactly "label, amount, hint" ("label, amount. hint" for the payable tile); a count tile's number occurs once as a whole number. axe: 0 violations at both sizes. Mutant I-2 (StatTile de-dup disabled) is caught by it (§6).

### §5.2 B1's reversal rules in Rentals

**The answer is unchanged; the integration continues.** On the merged tree (test `rentals.integration.test.ts`, and a raw-text scan with comments included that gives the same result):
- `RentalsState.settled` has **no writer** outside tests. Its only writes are the test-only injections in `rentals.api.test.ts` and `rentals.issue17.api.test.ts`.
- From society code Rentals imports exactly **`problem`, `stamp`** (`../society/handlers`) and **`seesBankFeed`** (`../society/finance/bank-scope`). Its other imports outside `rentals/` are unchanged helpers (`../handler-types`, `../operations/common`, `../portal` money and link helpers, `../hr/state` `pkt`, `../seed`, `../tenant-directory`, `../demo-store`, `../mock-transport`, `../people`).
- No other code reaches into Rentals' records: outside `rentals/`, only `packages/fixtures/src/handlers.ts` imports Rentals (its two route tables), and nothing else names its demo section.
- Every settled-basis figure is 0.00 (leases KPI, payouts closing, Tahira's October statement), and no Rentals screen can count a reversed payment as received.

Self-checks: G-1 (a writer `st.settled.push()` added) and G-2 (one more society import, `recordOf`) are both caught by the guard (§6).

#### Binding requirements on S.3's G1 (settlement subject), recorded by this integration

When Rentals gains settled money (S.3 risk G1: a lease and payout billing subject in the reconciler), B1's rules apply to it. These are **binding requirements on G1**:

- **R-INT-1 (immutable reversal history):** a settled rent, expense or payout event that is later reversed keeps its record. It gains a reversal with date, reason and evidence reference, as B1 gives payments. Nothing is deleted or rewritten.
- **R-INT-2 (live events only):** `settledOf` (`packages/fixtures/src/rentals/views.ts`) and every total built on it count live events only: owner statements, the management fee (`feeOn`), the landlord portal and `rent-kpi-payable`. A reversed event is shown as "Reversed", never as received or paid, on office and landlord screens alike.
- **R-INT-3 (no credit from a reversal; one cap):** credit from a reversed receipt is not credit (B1, N-1). Any rent-side credit or correction is capped like `creditableOf` (billed − live paid − credited, never below 0), refuses duplicate lines in one request (Issue #19), and, if it is created with a request key, binds that key to operation, person, target and request as Issue #21 does.
- **R-INT-4 (shared scenario):** G1 brings a Rentals copy of B1's shared scenario (reverse a settled rent receipt, then check the statement, the portal, the KPI and the fee) with byte-identical refusal checks, and updates `rentals.integration.test.ts` deliberately (the guard is meant to fail when G1 adds the first writer).

D-33 and D-48 stay unresolved; every financial flow stays fail-closed; no settled rent payment was invented (the test asserts the store's settled list is empty).

### §5.3 Product-wide focus style and accepted evidence

- Rentals controls B2 never measured now have measured rings (`test-results.md` §5; 102 measurements in the final run): every ring solid, 2 px (3 px for links in high contrast), at least 99 % of the sampled band changed by at least 3:1, median contrast 6.99–14.67:1, one ring at a time; in EN and UR, light, dark with high contrast, 320 px at 200 %, and the ocean, indigo and warm palettes in light and dark. Controls: the lease KPI tiles and a lease link; the owner statement's owner list, a source link, the Issue button and its confirm dialog's buttons; the Lease 360 renewal drawer's save and close; the landlord's statement list button and statement drawer's print button.
- A link that wraps onto two lines (an owner statement's source link at 320 px / 200 %) gets one ring per line box; B2's helper samples one rectangle around both, so only 61 % (EN) / 53 % (UR) of that rectangle lies on the drawn rings. The integration test measures each line box's ring on its own in that case (100 % / 100 %). Not a product defect (F-INT-4).
- Accepted evidence: the run rewrote 14 accepted PNGs and the S.3 video; all were compared with HEAD, explained, and restored byte-identical (§5 below; `test-results.md` §6). Two real changes come from the merged code and are intended: Issue #21's wrapping credit-note drawer footer (B1's `c01 … 200pct-320`), and B2's one-ring-at-a-time rule (B1's `f04`). One is data from S.3 (B2's `r09`: Riverbend has 13 modules with rentals). The rest is anti-aliasing noise, one capture-timing difference that re-ran byte-identical twice, and the video re-encode.

### §5.4 Type and contract seams

`tsc` was clean after each merge and at the end. Rentals still imports `problem` and `stamp` from `society/handlers`, which B1 and Issue #21 changed (credit-note route, Issue #19, request keys); their signatures are unchanged.

## 5. Regression on the final production build

Details in [`test-results.md`](test-results.md).

| Check | Expected | Result |
|---|---|---|
| `tsc` | clean | clean (after each merge and final) |
| ESLint, logical CSS, i18n parity | clean; 10,913 + 2 = 10,915 keys | clean; **10,915 keys per locale**, 27 namespaces |
| Vitest + golden vectors | 1,663 + 15 = 1,678 + integration | **1,682 / 1,682**, run twice, no timeout; 10 golden-vector files green |
| Chromium, complete: every gate's e2e, evidence `gates3`, `uxb1`, `uxb2`, `cnidem`, integration `ints3b` | 538, computed with `playwright test --list` per source branch: e2e 400 + 17 (S.3) + 9 (B1) + 4 (Issue #21) + 56 (B2) = 486, + 9 integration = 495; evidence 12 + 9 + 16 + 2 = 39, + 4 = 43 | **538 / 538**, 46.7 min, 3 workers, retries off |
| axe | ~1,594 + integration | **1,606 scans, 0 violations** |
| Firefox / WebKit smoke | 35 / 35 | **35 / 35** and **34 / 35** (S.2a guard, known; 5 / 20 alone) |
| EN / UR, RTL, dark mode, 320 px at 200 % | – | covered by every gate's specs in the run, and by the integration spec in all of these modes |
| Known D.1 intermittent `identity.spec.ts:327` | – | passed |

The plan's figures (482 e2e, 37 evidence, 34 smoke, ~1,586 axe, 1,663 Vitest) change only by Issue #21's own share (+4 e2e, +2 evidence, +1 smoke per browser, ~8 axe, +15 Vitest, +2 i18n keys) and the integration's tests.

**Accepted evidence** (plan §5.3): the evidence specs rewrote 14 accepted PNGs and one video. Each was compared with HEAD pixel by pixel:

| Accepted file(s) | Change | Cause |
|---|---|---|
| `cn-idempotency` n01 1440 EN/UR, n02 1440 EN; `ux-b1` c01 over-credit 1440 EN/UR | 16–71 px, channel difference 1 | anti-aliasing noise |
| `ux-b1` c02 collections recent 320 px / 200 % EN/UR | 16–26 px, difference ≤ 13 | sub-pixel edge of the round bottom-bar action |
| `ux-b1` c01 credit drawer lines 320 px / 200 % EN/UR | 10–12 % | **Issue #21** made that drawer's footer wrap ("Cancel" no longer off screen); B1's shot predates it. Intended |
| `ux-b1` f04 policy draft 1440 EN/UR | ~0.5 % | **B2**: the tab panel no longer draws a second ring around the focused note field. Intended |
| `ux-b1` c12 Flat 360 statement 1440 UR | 0.09 %, at the selected period pill | capture timing; re-run alone twice: **byte-identical** to the accepted file |
| `ux-b2` r09 HQ tenant row 1440 EN/UR | 63–66 px | **S.3** data: Riverbend's module count 12 → 13 (rentals add-on) |
| `gate-s3` video | re-encoded | videos are not byte-reproducible |

All were restored (`git checkout -- docs/status/gate-s3 docs/status/ux-b1 docs/status/ux-b2 docs/status/cn-idempotency`); afterwards `git status docs/status` lists only this folder. Older gates' evidence specs were not run.

**New screenshots** (`screenshots/`, all 12 looked at, widths equal their names): `i01-rent-tiles-focus-1440-{en,ur}` (1440 × 900), `i02-rent-tiles-focus-dark-contrast-390-{en,ur}` (390 × 844), `i03-rent-tiles-focus-200pct-320-{en,ur}` (320 × 700), `i04-rent-confirm-dialog-focus-200pct-320-{en,ur}` (320 × 700), `i05-b1-reversed-receipt-focus-390-{en,ur}` (390 × 844), `i06-cn-drawer-focus-1440-{en,ur}` (1440 × 900).

## 6. Mutation re-check

Every script was copied with paths only changed; no anchor needed fixing; every mutated file was restored byte-identically and the tracked tree equalled HEAD after every set.

| Set | Integrated tree | Against the source branch |
|---|---|---|
| S.3 M1–M28 (`mutations-followup.cjs`) | 28 / 28 caught | identical failing-test counts |
| S.3 `mutations.cjs` / `mutations-closure.cjs` | 14 / 15, 24 / 25; M7 / M19 not applied: anchors superseded inside S.3 before `ae3b3a1` (0 matches there too); their current versions are caught in the follow-up set | – |
| B1 `mutate.cjs` (36, incl. K1–K5) | 36 / 36 | identical (K1–K5 as in B1's post-Issue #19 re-run) |
| B1 `mutate19.cjs` (Issue #19, 10) | 10 / 10 | identical |
| Issue #21 `mutate21.cjs` (37) | 37 / 37 | identical |
| Issue #21 drawer W1–W4 (builds) | 4 / 4 | same assertions |
| Issue #18 `mutate.cjs` (36) | 35 / 36; I5 survives (equivalent mutant, as on `04b6fde`) | identical |
| Issue #16 `mutate-i16.cjs` (P1–P26, I1–I9, J1–J5, R0) | all caught except J1 (not observable by design, as in S.2b); R0 fails all 4 Issue #16 tests | identical |
| I-1: B2's unlayered focus rule removed (build) | caught by `ux-b2-focus.spec.ts` and `int-s3b.spec.ts` ("outline style") | – |
| I-2: StatTile de-dup disabled | caught by B2's `MetricCard.test.tsx` (3 tests) and `int-s3b.spec.ts` (EN and UR: the amount twice) | – |
| G-1 / G-2: a `settled` writer / one more society import | caught by `rentals.integration.test.ts` | – |

## 7. Findings (not fixed here; no product change was made)

| Ref | Finding | Since | Impact |
|---|---|---|---|
| F-INT-1 | At 320 px with 200 % text the owner-payable tile's **label** is cut to two lines with "…" ("Owner payable (settled mone…", Urdu "مالکان کو واجب الادا (صرف طے…"), by StatTile's `line-clamp-2` on the label. The accessible name is complete. | S.3 (`ae3b3a1`: the label markup is byte-identical there; B2 did not change it) | Visible text only; a shared-component follow-up (B10 / B2 class) |
| F-INT-2 | In the resident app at 390 px in Urdu, the header's organisation name breaks mid-word ("Al-Noor Residenc / y (Demo)") | before B1 (visible in B1's accepted `r01-receipt-reversed-390-ur.png`) | Visible text only |
| F-INT-3 | At 320 px with 200 % text a Rentals confirm dialog's scrolling body clips 37 % of the Cancel button's keyboard ring (EN); the rest shows at ≥ 3:1 | B2's N-B2-3 class (drawers), now seen on `ConfirmDialog` | Ring partly hidden until scrolled |
| F-INT-4 | B2's helper `ringOf` samples one rectangle; a link wrapped onto two lines gets one ring per line box, so the helper under-reports (61 % / 53 %). The integration test measures per line box. | B2 test helper | Test tooling only; no product effect |
| F-INT-5 | The WebKit S.2a "a new guard" intermittent persists (5 / 20 here) | `04b6fde` | Known; the D.1 / S.2a test fixes need their own approval |

## 8. Every interim failure

1. Development run 1 of the KPI-name test: 2 failed. My whole-number regex counted the list comma after "0" as part of a figure. Test bug, fixed (a comma or point joins a figure only between digits).
2. Development run 2: 2 failed. I read the root font size for 200 %; the app marks `data-text-scale="200"`. Test bug, fixed.
3. Development run of the ring tests: 2 of 7 failed at 320 px / 200 % on the wrapped statement link (61 % / 53 % of B2's rectangle). Diagnosed with a screenshot (two rings, one per line box); fixed by measuring each line box (100 % / 100 %), not by lowering the threshold.
4. Two of the earlier S.3 mutation scripts each have one anchor S.3 itself had already replaced before `ae3b3a1` (M7, M19): not applied; their current versions are caught.
5. The laptop lost AC power between 21:30Z and 21:53Z on 7 November (Modern Standby blips 21:40–21:53Z, during development runs only). The static checks and Vitest mutation sets ran on battery with no standby (none is timing-sensitive), and the six build-based mutants ran on battery with no standby (verdicts by assertion message). The complete regression waited for AC (11.5 h); AC returned 09:31Z, the machine was in standby 09:41–10:01Z, and the run started at 10:06Z on AC with no standby event during it.
6. Final smoke: WebKit `s2a.smoke.spec.ts:52` failed once (known); 5 / 20 alone.
7. Final evidence run: 14 accepted PNGs and the video rewritten; explained and restored (§5).

## 9. The owner's required survivals: named tests passing on the integrated tree

| # | Requirement | Tests (all passed in the final runs) |
|---|---|---|
| 1 | Payroll Issue #16 security | Vitest `payroll.issue16.api.test.ts` 4 / 4 ("a main-site-only payroll reader gets no Block C person, wage, count, total or note from any endpoint…", three "Issue #16 P0-2: idempotency keys bound to the exact request" tests); e2e `s2b.spec.ts` "S.2b closure (Issue #16)… sees no Block C person, amount or note…" |
| 2 | S.1 bank-feed confidentiality | Vitest `finance.issue18.api.test.ts` "Issue #18 FIN-01…" 6 / 6; `rentals.issue17.api.test.ts` "Issue #18 rule on rentals: a settled line's bank reference is for the bank feed only"; e2e `s1-hotfix.spec.ts` FIN-01 6 / 6; smoke `s1hotfix.smoke.spec.ts` 4 / 4 (Firefox, WebKit) |
| 3 | S.1 finance idempotency | Vitest `finance.issue18.api.test.ts` "Issue #18 FIN-02…" 7 / 7; `rentals.issue17.api.test.ts` "every create binds its key…" 5 / 5; e2e `s1-hotfix.spec.ts` FIN-02 3 / 3 |
| 4 | Rentals landlord and office site-scoped privacy (Issue #17) | Vitest `rentals.issue17.api.test.ts` "Issue #17 P0: the landlord view projects owner-wide data by one site rule" 5 / 5 and "Issue #17 follow-up: the office statement list and lookup never disclose…" 3 / 3; e2e `s3.spec.ts` "a manager limited to Riverbend Court…", "Rule R in the resident app…", "a landlord who may see only Riverbend Heights gets a labelled partial statement…"; smoke `s3.smoke.spec.ts` 3 / 3 per browser |
| 5 | Separate owner-statement issue permission | Vitest `rentals.issue17.api.test.ts` "Issue #17 P1: issuing a statement needs owner_statement.issue; reading never publishes" 3 / 3; e2e `s3.spec.ts` "Sadia, Naila and Faisal read the statement and are told why they cannot issue it; a direct request is refused; Usman issues it" |
| 6 | B1 reversed-payment financial truth | Vitest `ux-b1.api.test.ts` "B1 shared scenario…" 7 / 7; e2e `ux-b1.spec.ts` "B1 shared scenario (en)" and "(ur)"; smoke `uxb1.smoke.spec.ts` (e.g. "in Urdu, a reversed receipt says واپس شدہ, never ادا شدہ") 3 / 3 per browser |
| 7 | Credit-note paid / unpaid cap | Vitest `ux-b1.api.test.ts` "COL-01: a credit note never credits money already paid…" 3 / 3; e2e `ux-b1.spec.ts` "COL-01: the drawer shows billed, paid, credited and open per line…"; smoke "the credit-note drawer refuses a credit above billed − paid − credited…" |
| 8 | Issue #19 duplicate-line refusal | Vitest `ux-b1.api.test.ts` "GitHub Issue #19…" (1)–(5) 5 / 5; `credit-note-idempotency.api.test.ts` "(5) Issue #19 refusals with a key…" |
| 9 | Issue #21 request-bound replay | Vitest `credit-note-idempotency.api.test.ts` 11 / 11; `useKeyedCreate.test.tsx` 4 / 4; e2e `cn-idempotency.spec.ts` 4 / 4; smoke `cnidem.smoke.spec.ts` 1 / 1 per browser |
| 10 | B2 keyboard focus visibility | e2e `ux-b2-focus.spec.ts` 24 / 24; `int-s3b.spec.ts` "Rentals keyboard rings…" 7 / 7 (Rentals controls, all modes and palettes); smoke `uxb2.smoke.spec.ts` 6 / 6 per browser |
| 11 | B2 Rentals KPI accessible names | Vitest `MetricCard.test.tsx` "StatTile with the S.3 Rentals patterns (Issue #20): the amount is read once" 4 / 4; e2e `int-s3b.spec.ts` "§5.1 Rentals KPI names, en / ur…" 2 / 2 |
| 12 | Screen register truthful at 449 / 362 | `npm run register:sync`: 449 rows, 362 distinct (139 / 43 / 180), generated file unchanged; e2e `register.spec.ts` 16 / 16 (asserts 449 rows and 362 canonical screens, and opens every address) |

The §5.2 guard (`rentals.integration.test.ts`, 4 / 4) and the B1 reversal flows above also show that no Rentals figure can count a reversed payment as received.

## 10. Remaining limitations and recommendation

**Limitations**
- No manual verification was done: screen readers, real phones, Windows contrast themes and a native Urdu read are open for all four branches and for the integration's Rentals tiles ([`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md)). No WCAG conformance is claimed.
- Rentals still has no settled money (S.3 risk G1); B1's reversal rules can only be checked there once G1 exists. R-INT-1…4 bind G1. D-33 and D-48 stay unresolved; financial flows stay fail-closed.
- Findings F-INT-1…5 (§7) are recorded, not fixed.
- The two known intermittents (D.1 palette read, WebKit S.2a guard) remain; changing those tests needs its own approval.
- Brand (custom) organisation colours were not measured on Rentals; the three preset palettes were, in light and dark.
- The Chromium run is the complete suite; Firefox and WebKit run the smoke suite only (as on every source branch).

**Recommendation for GPT acceptance:** accept `integration/s3-b1-b2` at its tip. Both merges are clean and keep both sides' intent; the only new code is tests; every required survival has passing named tests; every mutation set behaves exactly as on its source branch; the complete Chromium run is 538 / 538 with axe clean; the one smoke failure is the documented WebKit intermittent at a rate no worse than its source branches. Before any merge to `main`, decide whether F-INT-1 and F-INT-3 go to the UX backlog, and keep the manual checks on the list.
