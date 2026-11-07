# Integration plan: S.3 Rentals + UX B1 (money truth) + UX B2 (accessibility)

**Status: plan only.** Nothing has been integrated. No integration branch exists yet, and neither unfinished branch (B1, B2) has been merged anywhere.
**Prepared:** 7 November 2026, by the coordinator, from the pushed branches and static checks only (no build or test run, so the shared machine stays free for the B1 and B2 closures).
**Updated:** 7 November 2026, after the closures were pushed: B1 final `682216f` (Issue #19, approved by GPT) and B2 final `7ac865f` (Issue #20, awaiting review). The §3 dry run was repeated with them and is still clean; §5.1 is resolved by path A; §8 uses the final figures.
**Branch of this document:** `docs/integration-plan-s3-b1-b2`, based on the accepted S.3 commit `ae3b3a1`. It adds this file only.

## 1. Inputs

| Line of work | Branch | Commit used for this plan | Review state |
|---|---|---|---|
| Base (S.1 security hotfix) | `fix/s1-bank-feed-and-idempotency` | `04b6fde` | Accepted, Issue #18 closed |
| S.3 Rentals | `feature/gate-s3-rentals` | **`ae3b3a1`** (contains `04b6fde` via merge `0dd9723`) | **Accepted, Issue #17 closed** |
| UX B1 money truth | `fix/ux-b1-money-truth` | **`682216f`** (Issue #19 closure on `6b1d7f9`) | **Approved by GPT, Issue #19 closed** |
| UX B2 accessibility | `fix/ux-b2-accessibility` | **`7ac865f`** (Issue #20 closure on `a0897b9` + `0884f03`) | Eight fixes accepted at source level; **Issue #20 closure pushed, awaiting GPT review** |
| Credit-note idempotency (later input) | `fix/credit-note-idempotency` | from `682216f` | Issue #21, in progress. **Not part of this integration** unless accepted before it starts; if accepted later, it is merged on top as its own step with its own complete run |

B1 and B2 are both built on `04b6fde`. S.3 contains `04b6fde`. All three therefore share one base, and each merge below brings in only that branch's own work.

## 2. Preconditions (nothing starts before all are true)

1. GPT has accepted the **final** B1 commit (Issue #19 closure) and the **final** B2 commit (Issue #20 closure). Their SHAs replace `6b1d7f9` and `0884f03` everywhere below.
2. The dry run in §3 has been repeated with those final SHAs and is still clean. If a closure touched a file listed in §4, re-read its hunks first.
3. No other complete browser run is in progress: `D:\laragon2\www\.e2e-busy` is absent, and the integration takes it atomically (`set -C`).
4. The laptop is on AC power. A run on 6 November was frozen for two hours by Modern Standby while unplugged. Check `BatteryStatus.PowerOnline` before each long run, and read the System log for sleep/resume if a run is slow.

**Staging.** One integration of all three is recommended once both closures are accepted. If one closure is delayed by more than a day, integrate S.3 + the accepted one first (stage 1, with its own complete run), then add the other (stage 2, another complete run). Never integrate a branch that is still under review.

## 3. Dry run already done (static, 7 November)

- **Textual merge:** `git merge-tree --write-tree` on `ae3b3a1`, `6b1d7f9` and `0884f03` merges cleanly **pairwise and all three together**. No conflict markers expected.
- **Files changed against `04b6fde`:** S.3 154, B1 97, B2 58.
- **Files changed by more than one branch:** 5 (section 4).

This is a textual result only. It says nothing about types, behaviour or tests; sections 5 and 7 cover those.

## 4. Files changed by more than one branch

| File | Branches | B1 hunks | Other hunks | Verdict |
|---|---|---|---|---|
| `apps/backoffice/src/pages/society/collections/CollectionsPanel.tsx` | B1, B2 | `Recent` (lines ~288–296): reversed badge in "Latest payments" | B2: the four tiles' `accessibleValue` (lines 49–79) | Independent regions. Semantically aligned: B2's "collected" tile name uses `data.collected.payments`, which B1 now counts as live payments only. That is the intended combined result. |
| `apps/customer-web/src/pages/dues/DuesPages.tsx` | B1, B2 | Bills, bill, history and receipt pages (many hunks, lines 3–434) | B2: one attribute, `tabIndex={-1}`, on the re-send file input in `Resubmit` (line 322) | Independent regions. B2's RES-06 test checks the re-send form, which B1 does not change. |
| `docs/ui/screen-register.csv` | S.3, B1 | Notes on 18 existing rows | S.3: 10 new rows appended | Independent. After merging, run `npm run register:sync` (§7, step 4). |
| `packages/i18n/locales/en-PK/common.json`, `ur-PK/common.json` | S.3, B2 | – | S.3: role names and descriptions; B2: new `calendar` block after `actions` | Independent blocks. |

**Test expectations that could have collided, checked:**
- `tests/e2e/register.spec.ts` expects 449 rows on S.3 and 439 on B1 and B2. Only S.3 changed that line, so the merge keeps 449, which is correct.
- B2's tile tests (`ux-b2.spec.ts`, "stat tiles…") are structural: the context appears once, and an amount or "—" is present. They do not pin counts, so B1's corrected counts (COL-02, COL-04) cannot break them.
- B1's COL-04 test clicks `kpi-pending` and checks its URL and filter. B2 does not change tile links.
- S.3's tests assert the Rentals tiles' **visible** text (`s3.spec.ts:89–91`), not their accessible names. B2 changes names only.

## 5. Behaviour to reconcile

### 5.1 Rentals KPI names under B2's `StatTile` change

B2 makes a tile's accessible name: label, value, change, context. The context is left out only when the value already contains it. Rentals (`apps/backoffice/src/pages/rentals/LeasesPage.tsx:68–72`) puts the full amount at the start of three contexts:

| Tile | `accessibleValue` | `context` | Name on S.3 today | Name after B2 (`a0897b9`) |
|---|---|---|---|---|
| `rent-kpi-active` | count | none | label, count | unchanged |
| `rent-kpi-rent` | `Rs X` | `Rs X · {rentHint}` | label, Rs X | label, Rs X, **Rs X** · hint (amount twice) |
| `rent-kpi-due` | `Rs X` | `Rs X · {dueHint}` | label, Rs X | label, Rs X, **Rs X** · hint (amount twice) |
| `rent-kpi-payable` | `Rs X. {payableHint}` | `Rs X · {payableHint}` | label, Rs X. hint | label, Rs X. hint, **Rs X · hint** (amount and hint twice) |
| `rent-kpi-pending` | count | `{pendingHint}` | label, count | label, count, hint (intended: B2 adds the context) |

**Resolution, depending on the Issue #20 closure:**
- **Path A (preferred, asked of B2 in Issue #20).** `StatTile` itself does not repeat a value that the context already starts with. It is unit-tested on these exact patterns in EN and UR number formats. The integration then needs no Rentals change, only the check below.
- **Path B (fallback, in the integration commit).** In `LeasesPage.tsx`:
  - `rent-kpi-payable`'s `accessibleValue` becomes the amount only.
  - The three contexts become the hint only.
  - The visible small line then loses the exact amount; the compact value stays. This is a visible change and needs GPT's agreement.
  - S.3's visible-text assertions (`s3.spec.ts:90–91`) still match, because they check the hint text.

**Outcome: path A landed in B2 `7ac865f`.** `StatTile` now reads a context that starts with the same figure as the tile's spoken or displayed value from after that figure. A "figure" must contain a digit and end at a space or punctuation in both strings, so contexts that merely mention another number are left alone.
- **Expected names:** `rent-kpi-rent` and `rent-kpi-due` read "label, amount, hint". `rent-kpi-payable` reads "label, amount. hint", because the rest of its context is already in its value.
- **Tests:** B2 unit-tests LeasesPage's exact five tiles in EN and UR, with the real money formatters and S.3's hints, and every B2 tile keeps its name.
- **So the integration needs no Rentals change.** The check below stays, as the proof on the merged code.

**Check in either path.** An integration test reads every `rent-kpi-*` tile's accessible name in EN and UR. It asserts:
- the exact amount appears **once**;
- the hint appears **once**;
- a count tile's number appears once.

It runs at 1440 px and at 320 px with 200 % text, with axe.

### 5.2 B1's reversal rules in Rentals

**Facts at `ae3b3a1`:**
- **Its own records only.** Rentals reads money only from its own state. From society code it imports `problem` and `stamp` (`../society/handlers`) and, read-only, `seesBankFeed` (`../society/finance/bank-scope`). It reads no society receipt, payment, credit note or reversal.
- **Nothing is ever settled.** Every "settled" figure in Rentals comes from `RentalsState.settled: SettledEvent[]`. That list has **no writer**: posting and settlement wait for a lease and payout billing subject in the reconciler (S.3 risk G1). The figures include owner statements, the management fee (`feeOn`), the landlord portal and `rent-kpi-payable`.
- **No reversal concept.** `SettledEvent` has no reversal field. There is no rent receipt or rent credit note.

**Consequence:**
- No Rentals screen can count a reversed payment as received today, so the integration needs **no Rentals code change** for B1.
- B1's rules become **binding requirements on G1**, and the integration report records them under S.3's G1:
  - **R-INT-1:** a settled rent, expense or payout event that is later reversed keeps its record. It gains a reversal with date, reason and evidence reference, as B1 gives payments. Nothing is deleted or rewritten.
  - **R-INT-2:** `settledOf` (`rentals/views.ts:423`) and every total built on it count live events only. That covers owner statements, fees, the landlord portal and the payable KPI. A reversed event is shown as "Reversed", never as received or paid, on office and landlord screens alike.
  - **R-INT-3:** credit from a reversed receipt is not credit (B1, N-1). Any rent-side credit or correction is capped like `creditableOf` (billed − live paid − credited) and refuses duplicate lines in one request (Issue #19).
  - **R-INT-4:** G1 brings a Rentals copy of B1's shared scenario (reverse a settled rent receipt, then check the statement, portal, KPI and fee) with byte-identical refusal checks.

**Check at integration.** A grep shows `settled` still has no writer and Rentals still imports nothing more from society code. A changed answer stops the integration for review.

### 5.3 Product-wide focus style (Issue #20) and accepted evidence

- **Every screen is affected.** B2's Issue #20 closure changes how keyboard focus is drawn on every screen, including Rentals.
- **Other B2 components S.3 uses:** Rentals uses `StatTile`, `ConfirmDialog` and `SelectControl` (19 uses). Under B2, `ConfirmDialog` buttons may wrap at narrow widths, and the reason box is `w-full`.
- **Accepted evidence stays as reviewed.** The screenshots under `docs/status/gate-*`, `ux-b1` and `ux-b2` were reviewed with their branches.
  1. Run the three current evidence specs: `gates3`, `uxb1` and `uxb2`.
  2. Look at every PNG they rewrite (`git status docs/status`) and record in the integration report which changed and why.
  3. Restore the accepted files with `git checkout -- docs/status/gate-s3 docs/status/ux-b1 docs/status/ux-b2`.
  4. Do not run older gates' evidence specs.
- **New captures:** a small integration evidence spec writes them to `docs/status/integration-s3-b1-b2/screenshots/`. It covers the Rentals tiles with keyboard focus (EN, UR, 320 px at 200 %), a Rentals confirm dialog at 320 px at 200 %, and the B1 reversed receipt with B2's focus ring.

### 5.4 Type and contract seams

- **Society handlers:** B1 changes `packages/fixtures/src/society/handlers.ts` (the credit-note route, plus Issue #19). Rentals imports `problem` and `stamp` from that file, so `tsc` after the B1 merge is the first check.
- **Contracts:** B1 changes four contract files: `billing`, `collections`, `finance` and `identity`. S.3 adds `rentals` and changes `access`/`permissions`. They do not overlap.

## 6. Branch, worktree and ports

- **Branch:** `integration/s3-b1-b2`, created from `ae3b3a1`. Push only this branch. Never force-push `feature/gate-s3-rentals`, `fix/ux-b1-money-truth` or `fix/ux-b2-accessibility`, and never touch `main`.
- **Worktree:** `D:\laragon2\www\propertyos-int-s3b`, with its own `npm ci`. `propertyos-int` belongs to `integration/d1-s1`.
- **Ports:** `E2E_PORT_OFFSET=1400`, i.e. 6573–6575 (Playwright uses 5173 + offset). Offsets 100, 500, 600, 800, 1000 and 1200 are taken by earlier worktrees. Serve on both 127.0.0.1 and ::1.

## 7. Procedure

1. **Preconditions** (§2). Record the final B1 and B2 SHAs, and repeat the `merge-tree` dry run with them.
2. **Merge B1:** `git merge --no-ff <B1 final>`, message "Integrate UX B1 (Issue #19 closure) into S.3".
   - Check: `tsc`, then Vitest for `packages/fixtures`.
3. **Merge B2:** `git merge --no-ff <B2 final>`.
   - Check: `tsc`, then Vitest for `packages/ui`.
   - Resolve any conflict by keeping both sides' intent. Record every conflict and its resolution.
4. **Integration commit,** the only new code on this branch:
   - §5.1 path B, if path A did not land;
   - the §5.1 and §5.2 checks, as tests;
   - the small integration evidence spec;
   - `npm run register:sync`. If `register.generated.ts` changes because of B1's notes, commit it and say so. Expected: 449 rows, 362 distinct, 139 built, 43 partial, 180 planned.
   - Nothing else: no fixes beyond integration needs. Defects found go into the report as findings.
5. **Static checks:**
   - build;
   - `tsc`;
   - `npm run lint` (ESLint, logical CSS, i18n parity);
   - full Vitest, golden vectors included. Run it twice if a timeout appears, and report both runs.
6. **Mutation re-check on the integrated tree.** The point is to prove the merges did not neuter any guard. Re-run the existing mutation sets:
   - S.3 M1–M28 (portal and office projection, issue permission);
   - B1's 36 plus its Issue #19 mutants;
   - the Issue #18 set (bank feed; bound idempotency);
   - the Issue #16 payroll replay set.
   The scripts live in each worktree's git-ignored `test-results-*/scratch/`: copy them, adjust paths only, and restore every file byte-identical. Every previously caught mutant must still be caught. Report any survivor with its reason.
7. **Complete browser regression** (holding the lock, on AC power, 3 workers, retries off):
   - **Chromium:** every gate's e2e, plus the evidence specs `gates3`, `uxb1`, `uxb2` and the integration spec, passed explicitly by path.
   - **Smoke:** the full Firefox + WebKit suite.
   - **Axe:** counts from the JSON reporter (`--reporter=list,json`).
   - **Layout:** EN/UR at 320 px with 200 % text for the integration checks.
8. **Known intermittents:** D.1 `identity.spec.ts:327` (palette attribute read once after a click) and WebKit `s2a.smoke.spec.ts` "a new guard" (already failing on `04b6fde`).
   - If either fails, rerun it alone with `--repeat-each=10`.
   - If its rate differs clearly from the source branches' figures, compare against `ae3b3a1` on the same machine and power state.
   - Never skip, retry-wrap or loosen a test.
9. **Evidence handling,** as in §5.3.
10. **Docs:** `docs/status/integration-s3-b1-b2/` gets `INTEGRATION_REPORT.md`, `test-results.md` and `MANUAL_VERIFICATION.md`.
    - The report covers the merges, conflicts, the integration commit, §5 outcomes, R-INT-1…4 and every interim failure.
    - The manual checks are the open items of all three branches, plus the Rentals tiles with a screen reader.
11. **Commit** with explicit paths. **Push** `integration/s3-b1-b2` only, verify with `git ls-remote`, release the lock, stop the previews, and **STOP** for GPT and owner review.

## 8. Expected totals (to confirm, not targets)

The totals add up the three branches' own tests on the shared base. Each closure adds its own new tests on top (marked "+ closures").

Final commits: S.3 `ae3b3a1`, B1 `682216f`, B2 `7ac865f`. Each branch's own reported totals, minus the base, give its share.

| Check | Base `04b6fde` | + S.3 | + B1 | + B2 | Expected integrated |
|---|---|---|---|---|---|
| i18n keys per locale | 10,294 | +590 | +27 | +2 | **10,913** |
| Vitest | 1,517 | +104 | +23 | +19 | **1,663** + integration |
| Chromium e2e | 400 | +17 | +9 | +56 | **482** + integration |
| Evidence tests in the run | – | 12 | 9 | 16 | **37** + integration spec |
| Firefox / WebKit smoke | 22 / 22 | +3 / +3 | +3 / +3 | +6 / +6 | **34 / 34** |
| Axe scans (approx.) | ~1,426 | +80 | +42 | +38 | **~1,586** + integration |
| Screen register (rows / distinct) | 439 / 354 | +10 / +8 | notes only | – | **449 / 362** |

**Timing.** A complete Chromium run of about 500 tests should take 45–60 minutes at 3 workers on AC power. A much longer run means load or standby: check before trusting it.

## 9. Done means

- Both merges are recorded, and no accepted branch was rewritten.
- `tsc`, lint and parity are clean.
- Vitest is all green at the expected count. Any difference from §8 is explained.
- The Chromium run is all green with retries off. Any failure has a cause, a reproducibility figure, and an A/B where needed.
- Smoke is all green, apart from the WebKit S.2a intermittent if it appears, with its numbers.
- Axe shows 0 violations.
- Every previously caught mutant is still caught.
- The Rentals tiles' names state each amount once (§5.1). The §5.2 grep is unchanged.
- The register sync passes at 449 / 362.
- Accepted evidence is untouched, and the integration evidence has been reviewed at 320 px / 200 %.
- The branch is pushed and stopped for review.

## 10. Risks and rollback

- **Global CSS:** B2's product-wide focus change is the widest change in the set. It should only affect keyboard focus, so pointer flows and screenshots without focus should not change. Any unexpected visual change in §5.3 is a finding, not something to absorb.
- **Focus rings on Rentals:** B2 `7ac865f` measured ring contrast in the default colour scheme only, on office, CRM, HQ and resident controls, not on Rentals screens or organisation palettes. The integration focus checks add Rentals controls: the lease tiles, the statement list and a Rentals drawer.
- **Contention:** more tests (about 520) means a longer run and more exposure to the two timing-sensitive intermittents.
- **Drift:** if either closure changes a §4 file again, redo §4 before merging.
- **Rollback:** the integration branch is disposable. Delete it and start again from `ae3b3a1`; the three source branches are never modified.

## 11. Out of scope

- Merging into `main`: an owner decision after review.
- Batches B3–B10.
- B2 follow-ups N-B2-2, -3, -4 (and -5 unless fixed in Issue #20).
- The S.3 settlement subject G1 and legal decisions D-33 and D-48.
- Fixing the D.1 palette test (needs its own approval).
- VPS, Bingoo, Laravel, real payments, Issue #13, SOS.

## 12. Decisions for GPT and the owner

| Ref | Question | Recommended |
|---|---|---|
| INT-1 | Rentals tile names: path A (in `StatTile`, via Issue #20) or path B (Rentals call sites, visible change)? | **A, landed in `7ac865f`**; confirm when reviewing Issue #20 |
| INT-2 | Keep accepted evidence folders as reviewed, with integration captures in their own folder? | Yes |
| INT-3 | One integration after both closures, or staged? | One, unless a closure is delayed by more than a day |
| INT-4 | Record R-INT-1…4 as binding requirements for S.3's G1 (settlement subject)? | Yes |
| INT-5 | Fix the D.1 palette test (wait for the attribute instead of reading it once) as a separate, approved change? | Yes, separately |
