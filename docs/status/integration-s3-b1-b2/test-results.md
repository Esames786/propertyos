# Test results: integration S.3 + B1 + Issue #21 + B2

Branch `integration/s3-b1-b2`, final code `be70695` (merges `58f5f03`, `7c24a31`; integration commit `be70695`).
Worktree `D:\laragon2\www\propertyos-int-s3b`, own `npm ci`, ports 6573–6575 (`E2E_PORT_OFFSET=1400`) served on both
127.0.0.1 and ::1, production builds (`vite build` + `vite preview`), checked byte for byte before each run
(`test-results-int/scratch/serve-check.sh`). Scripts and logs: `test-results-int/` (git-ignored, not committed).

## 1. Summary

| Check | Expected (plan §8 + Issue #21) | Result |
|---|---|---|
| `tsc` | clean | **clean** (after merge 1, after merge 2, final) |
| ESLint, logical CSS | clean | **clean** |
| i18n parity | 10,913 + 2 = **10,915** keys per locale | **10,915 keys each, 2 locales × 27 namespaces, parity OK** |
| Vitest | 1,663 + 15 = ~1,678 + integration | **1,682 / 1,682** (1,678 + 4 integration), run twice, no timeout |
| Golden vectors | green | **10 vector files; their 10 test files 389 / 389** (inside the full Vitest) |
| Screen register | 449 / 362 (139 / 43 / 180) | **449 rows / 362 distinct (139 built, 43 partial, 180 planned)**; `register.spec.ts` asserts 449 and 362 |
| Chromium, complete (every gate's e2e + evidence `gates3`, `uxb1`, `uxb2`, `cnidem`, `ints3b`) | 486 + 9 integration e2e, 39 + 4 evidence = **538** (§3) | **538 / 538 passed**, 0 failed, 46.7 min, 3 workers, retries off |
| Firefox smoke | 35 | **35 / 35** |
| WebKit smoke | 35 | **34 / 35**: the known intermittent `s2a.smoke.spec.ts:52` "a new guard"; alone with `--repeat-each=20`: 5 / 20 failed (source branches 6–12 / 20) |
| axe | ~1,594 + integration | **1,606 scans, 0 violations** (the integration spec's 12 included) |
| Known D.1 intermittent `identity.spec.ts:327` | – | passed (`identity.spec.ts` 28 / 28) |
| Mutations | every previously caught mutant still caught | **all still caught**, failing-test counts identical to the source branches' final runs (§7) |

## 2. Static checks

```
HEAD be70695                         (test-results-int/scratch/static.sh, 7 Nov 21:53Z)
tsc exit 0 44s
lint exit 0 19s                      eslint . && check-logical-css && check-i18n
  logical CSS: no physical left/right utilities or properties
  i18n: 2 locales × 27 namespaces, 10915 keys each, parity OK
vitest exit 0 37s                    Test Files 62 passed (62), Tests 1682 passed (1682), 0 timeouts
vitest (second run, JSON) exit 0 34s Tests 1682 passed, 0 failed
```

The static checks and the Vitest mutation sets ran on battery (AC was lost between 21:30Z and 21:53Z on 7 November;
no standby event during them). None of them depends on wall-clock timing; both full Vitest runs had no timeout.

- Vitest per input: base `04b6fde` 1,517; S.3 +104; B1 +23; B2 +19; Issue #21 +15
  (its branch against `682216f`); integration +4 (`rentals.integration.test.ts`) = **1,682**.
- Golden vectors: `access.vectors.json`, `chat-membership`, `polls`, `hr-roster`, `privacy-differencing`, `payroll`,
  `pricing`, `rentals`, `collections`, `dues`; their test files (`access.test.ts`, `community.test.ts`, `hr.test.ts`,
  `privacy.test.ts`, `payroll.test.ts`, `pricing.test.ts`, `rentals.test.ts`, `collections.test.ts`, `society.test.ts`,
  `finance.test.ts`) 389 / 389.

## 3. Expected test counts, computed per source branch

`playwright test --list` on each commit's own `tests/` (extracted with `git archive`, listed with this worktree's
Playwright 1.64.1):

| Commit | e2e | evidence (the four current specs) | Firefox smoke | WebKit smoke |
|---|---|---|---|---|
| `04b6fde` (base) | 400 | – | 22 | 22 |
| `ae3b3a1` S.3 | 417 (+17) | gates3 12 | 25 (+3) | 25 (+3) |
| `682216f` B1 | 409 (+9) | uxb1 9 | 25 (+3) | 25 (+3) |
| `15333a7` Issue #21 (on B1) | 413 (+4 over `682216f`) | uxb1 9, cnidem 2 | 26 (+1) | 26 (+1) |
| `7ac865f` B2 | 456 (+56) | uxb2 16 | 28 (+6) | 28 (+6) |
| **merged, before the integration commit** | **486** = 400 + 17 + 9 + 4 + 56 | **39** = 12 + 9 + 16 + 2 | **35** | **35** |
| **integrated `be70695`** | **495** (+9 `int-s3b.spec.ts`) | **43** (+4 `ints3b`) | **35** | **35** |

The plan's 482 e2e and 37 evidence tests become 486 and 39 with Issue #21 (+4 e2e, +2 evidence); the directive's
"34 + 1 = 35" smoke figure is confirmed. The complete Chromium run therefore holds **538** tests.

## 4. Complete Chromium run (final build of `be70695`)

`test-results-int/scratch/final.sh`: shared lock `D:\laragon2\www\.e2e-busy` taken atomically 8 Nov 10:06:13Z and
released 10:58:13Z; on AC (80 % → 98 %, charging); previews of the final build checked byte for byte on 127.0.0.1 and
::1 before the run; a per-process keep-awake request (`SetThreadExecutionState`, no setting changed) held during the run;
**no sleep, resume or standby event between 10:06 and 11:02Z** (System log).

```
npx playwright test --project=e2e --project=evidence tests/e2e tests/evidence/gates3.evidence.spec.ts
  tests/evidence/uxb1.evidence.spec.ts tests/evidence/uxb2.evidence.spec.ts tests/evidence/cnidem.evidence.spec.ts
  tests/evidence/ints3b.evidence.spec.ts --workers=3 --retries=0 --reporter=list,json
Running 538 tests using 3 workers … 538 passed (46.7m)            10:06:17Z – 10:53:08Z, exit 0
```

| Spec (selected) | Result | | Spec (selected) | Result |
|---|---|---|---|---|
| `e2e/int-s3b.spec.ts` (integration) | **9 / 9** | | `evidence/ints3b` (integration) | **4 / 4** |
| `e2e/s3.spec.ts` | 17 / 17 | | `evidence/gates3` | 12 / 12 |
| `e2e/ux-b1.spec.ts` | 9 / 9 | | `evidence/uxb1` | 9 / 9 |
| `e2e/cn-idempotency.spec.ts` | 4 / 4 | | `evidence/uxb2` | 16 / 16 |
| `e2e/ux-b2.spec.ts`, `ux-b2-focus.spec.ts` | 32 / 32, 24 / 24 | | `evidence/cnidem` | 2 / 2 |
| `e2e/s1-hotfix.spec.ts`, `s2b.spec.ts` | 11 / 11, 15 / 15 | | `e2e/register.spec.ts` | 16 / 16 |
| `e2e/identity.spec.ts` (D.1 intermittent at :327) | 28 / 28 | | **all 42 files** | **538 / 538** |

**axe:** 1,606 scans (44,329 rule passes), **0 violations**; the integration spec's 12 scans (Rentals KPI tiles at 1440 px
and at 320 px with 200 % text, EN and UR; the leases page in the ring test at 1440; the Rentals confirm dialog in every
mode) all clean. Expected ~1,594 + integration.

**Expected against actual:** 538 listed (§3), 538 run, 538 passed.

## 5. The integration's checks in that run

**§5.1 Rentals KPI names (EN, UR; 1440 px and 320 px at 200 %):**

```
rent-kpi-active:  Active leases, 4
rent-kpi-rent:    Monthly rent under management, Rs 273,000.00, a contract figure, not money received
rent-kpi-due:     Rent due in October 2026, Rs 273,000.00, approved demand — not invoiced, not collected
rent-kpi-payable: Owner payable (settled money only), Rs 0.00. nothing is settled: no bank evidence exists here
rent-kpi-pending: Payout instructions pending, 0, prepared or approved — none is sent or paid
(UR: فعال لیز, 4 / زیرِ انتظام ماہانہ کرایہ, Rs 273,000.00, معاہدے کی رقم، وصول شدہ رقم نہیں / … the same structure)
```

Identical at both sizes; the amount once, the hint once, the count once; computed name = `aria-label`, no description.

**Rentals keyboard rings** (B2's `ringOf`, B2's thresholds; 102 measurements across 1440, 390 dark + high contrast,
320 px at 200 %, EN and UR, and ocean / indigo / warm in light and dark): every ring **solid**, 2 px (3 px for links in
high contrast), **median contrast 6.99–14.67:1**, at least 99 % of the band changed by ≥ 3:1, **one ring at a time**
everywhere. Two geometry notes, both disclosed in the test:
- a statement source link wraps onto two lines at 320 px / 200 %; Chromium draws one ring per line box, so B2's single
  rectangle finds 61 % (EN) / 53 % (UR) of its path on a ring; measured per line box: **100 % and 100 %** (F-INT-4);
- the confirm dialog's **Cancel** at 320 px / 200 % (EN) has **37 % of its ring clipped** by the dialog's scrolling body
  (the rest shows, 100 % ≥ 3:1). The test allows clipping in that mode only, as B2 does for drawers (N-B2-3) (F-INT-3).

## 6. Smoke, intermittents and evidence

**Firefox + WebKit smoke** (all `tests/smoke`, 3 workers, retries off, 10:53:12Z – 10:58:12Z): **69 / 70**. Firefox
**35 / 35**. WebKit **34 / 35**: `s2a.smoke.spec.ts:52` "a new guard: validated, refused as a duplicate, saved, given
tonight's night shift and on the roster" failed with its known signature (`getByRole('listbox')` still open after
choosing an option: `toHaveCount(0)` received 1).

**Known intermittents (not edited in this integration):**

| Test | In the complete runs | Alone | Source-branch figures | Verdict |
|---|---|---|---|---|
| WebKit `s2a.smoke.spec.ts:52` | failed once | `--repeat-each=20`, 3 workers, on the same build and power: **5 / 20 failed**, all the same listbox signature (11:00Z) | failed: base `04b6fde` 8–9 / 20; B1 6 / 20 (base 9 / 20 that day); Issue #21 8 / 20; B2 12 / 20 (base 8 / 20 that day) | Same intermittent at a rate no worse than any source branch; no A/B against `ae3b3a1` needed |
| D.1 `identity.spec.ts:327` | passed | – | – | Not seen |

**Accepted evidence rewritten by the run** (`git status docs/status`, then compared with HEAD pixel by pixel,
`test-results-int/scratch/png-diff.cjs`; every one restored with `git checkout -- docs/status/gate-s3 docs/status/ux-b1
docs/status/ux-b2 docs/status/cn-idempotency`, after which `git status docs/status` shows only this folder):

| File | Pixels that differ | Why |
|---|---|---|
| `cn-idempotency/…/n01-drawer-no-answer-1440-en/ur`, `n02-retry-shows-the-note-issued-1440-en` | 57 / 16 / 32 px, max channel difference 1 | Anti-aliasing noise; nothing visible |
| `ux-b1/…/c01-credit-drawer-over-credit-1440-en/ur` | 71 / 33 px, max difference 1 | Anti-aliasing noise |
| `ux-b1/…/c02-collections-recent-200pct-320-en/ur` | 26 / 16 px, max difference 13 | Sub-pixel edge of the bottom bar's round action; identical to the eye |
| `ux-b1/…/c01-credit-drawer-lines-200pct-320-en/ur` | 10.3 % / 11.8 % | **Issue #21** (`15333a7`) made the credit-note drawer's footer wrap at 320 px / 200 % ("the buttons wrap instead of pushing Cancel off screen"; B1's own §8 observed Cancel off screen). The accepted B1 shot predates it: Cancel is now visible above "Issue credit note", and the taller footer scrolls the body a little. Intended, reviewed with Issue #21 |
| `ux-b1/…/f04-policy-draft-saved-date-unsaved-edit-1440-en/ur` | 0.47 % / 0.45 % | **B2** (Issue #20): React Aria marks the tab panel `data-focus-visible` while the note field inside it has focus; B1's shot shows a second ring around the whole panel; B2's base-layer de-dup rule removes it (one ring at a time). Intended |
| `ux-b1/…/c12-flat360-statement-payment-and-reversal-1440-ur` | 1,906 px (0.09 %), around the selected period pill | Capture timing (the pill's hover/press transition caught at another moment; the English twin was byte-identical). **Re-run twice alone: byte-identical to the accepted file both times** |
| `ux-b2/…/r09-focus-hq-tenant-row-1440-en/ur` | 63 / 66 px | Data, not focus: Riverbend's licensed module count in Platform HQ reads 13 instead of 12, because **S.3** adds the rentals add-on to Riverbend (B2's shot was taken without S.3) |
| `gate-s3/video/s3-draft-lease-to-approved-demand-and-issued-statement-desktop-en.webm` | 5,861,114 → 5,909,306 bytes | Video encoding is never byte-reproducible; restored |

No other accepted file changed. Older gates' evidence specs were not run.

**Integration screenshots** (`docs/status/integration-s3-b1-b2/screenshots/`, from this run; every width read from the
PNG header equals the name, `png-widths.cjs`: 12 / 12; all looked at, the 320 px ones at full size):

| File | Size | Shows |
|---|---|---|
| `i01-rent-tiles-focus-1440-en.png`, `-ur.png` | 1440 × 900 | Leases; keyboard ring on "Monthly rent under management" (Urdu right to left) |
| `i02-rent-tiles-focus-dark-contrast-390-en.png`, `-ur.png` | 390 × 844 | Dark with high contrast; yellow ring on the owner-payable tile |
| `i03-rent-tiles-focus-200pct-320-en.png`, `-ur.png` | 320 × 700 | 320 px, text 200 %; ring on "Rent due in October 2026" (the payable tile's label below is cut with "…": F-INT-1) |
| `i04-rent-confirm-dialog-focus-200pct-320-en.png`, `-ur.png` | 320 × 700 | Issuing Tahira's October statement: the confirm dialog at 320 px / 200 %, its confirm button focused, both buttons whole |
| `i05-b1-reversed-receipt-focus-390-en.png`, `-ur.png` | 390 × 844 | B1's reversed receipt (Rs 6,000 struck through, credit gone), the receipt's Print button focused |
| `i06-cn-drawer-focus-1440-en.png`, `-ur.png` | 1440 × 900 | Issue #21's credit-note drawer on A-101's November bill, "Issue credit note" focused (nothing sent) |

## 7. Mutation re-check on the integrated tree

Every script was copied into `test-results-int/scratch/mut/` with **paths only** changed (worktree root, TEMP folder,
output folder; `diff` against the originals shows nothing else). No anchor needed fixing: every anchor of the current
sets matched exactly once. Each script restores every mutated file byte-identically (its own SHA-256 or text check), and
after every set the runner checked `git diff --quiet` against HEAD `be70695`: **byte-identical after every set**
(`test-results-int/mutations/summary.txt`). "Before" is the source branch's own final result file.

| Set (script) | Tests it runs | Integrated tree | Compared with the source branch |
|---|---|---|---|
| S.3 M1–M28 (`mutations-followup.cjs`) | `packages/fixtures/src/rentals` | **28 / 28 caught** | identical: same failing-test count for all 28 (S.3 final run) |
| S.3 earlier sets (`mutations.cjs` 15, `mutations-closure.cjs` 25) | the same | 14 / 15 and 24 / 25 caught; **M7 (first set) and M19 (closure set) not applied**: their anchors were replaced by S.3's own closures before `ae3b3a1` (`git show ae3b3a1:…` finds 0 matches); the current M7 and M19 are in the follow-up set and are caught | counts equal the follow-up set's (the closure-round figures predate S.3's later tests) |
| B1 36 (`mutate.cjs`, incl. K1–K5) | `ux-b1.api.test.ts` | **36 / 36 caught** | R, C, V, P identical to round 3; K1–K5 identical to B1's re-run after Issue #19 (4, 3, 3, 4, 1 failing) |
| Issue #19 10 (`mutate19.cjs`) | `ux-b1.api.test.ts` | **10 / 10 caught** | identical |
| Issue #21 37 (`mutate21.cjs`: R1–R6, B1–B2, F1–F6, T1–T2, P1, O1, A1–A3, U1–U6, and Issue #19's D1–D7, O19-1, O19-2, K2) | `credit-note-idempotency.api.test.ts`, `ux-b1.api.test.ts`; hook tests | **37 / 37 caught** | identical |
| Issue #21 drawer W1–W4 (`drawer-mutant.cjs`, a production build each) | `cn-idempotency.spec.ts` "Issue #21 en: a retry…" | **4 / 4 caught** | same failing assertion as the branch's run (W1: the retry issued `ANR-CN-0002`, a second note) |
| Issue #18 36 (`s1fix mutate.cjs`: F1–F26 bank feed, I1–I10 bound idempotency) | `finance.issue18.api.test.ts` | **35 / 36 caught**; **I5 survives**, as on `04b6fde`: an equivalent mutant (a bare legacy id has no `op`, so the next comparison refuses it anyway) | identical |
| Issue #16 (`mutate-i16.cjs`: P1–P26, I1–I9, J1–J5, R0) | the three payroll test files | **all caught except J1**, as in S.2b: J1 cannot be observed (each operation's target is a different kind of id); R0 (the reviewed `a0d4a70` sources) fails all 4 Issue #16 tests; P0 all restored: 0 of 52 fail | identical (42 of 42 lines) |
| **I-1** (integration): the unlayered `:focus-visible, [data-focus-visible] { --tw-outline-style: solid; }` removed from `packages/tokens/src/theme.css` (production build) | `ux-b2-focus.spec.ts` office 1440 en; `int-s3b.spec.ts` Rentals rings 1440 en | **caught by both**: "header search 1440 en-PK: outline style" and "rent-kpi-rent 1440 en: outline style" | – |
| **I-2** (integration): StatTile's leading-figure de-dup disabled (`const figure = value && ''`) | B2's `MetricCard.test.tsx`; `int-s3b.spec.ts` Rentals KPI names (production build) | **caught by both**: 3 B2 unit tests (EN, UR, compact value); the integration test EN and UR: "amount "Rs 273,000.00" once in "Monthly rent under management, Rs 273,000.00, Rs 273,000.00 · a contract figure, not money received"" (expected 1, received 2) | – |
| **G-1** (guard self-check): a writer `st.settled.push()` added to `rentals/views.ts` | `rentals.integration.test.ts` | **caught** ("nothing outside tests writes RentalsState.settled…") | – |
| **G-2** (guard self-check): `recordOf` also imported from `society/handlers` | `rentals.integration.test.ts` | **caught** ("from society code Rentals imports only problem and stamp…") | – |

Survivors: I5 (Issue #18) and J1 (Issue #16), both survivors on their own branches with the reasons above, both
unchanged. No test was weakened; no mutant's meaning was changed.

The S.3 sets were run with `rentals.integration.test.ts` moved aside (and restored, SHA-256 checked), so that they
prove S.3's own Rentals tests still catch every mutant, not the new guard.

The build-based mutants (W1–W4, I-1, I-2) ran 7 Nov 22:27–22:31Z under the shared lock, one production build each
(served on both loopbacks and checked), 1 worker. The laptop was on battery then; no standby event occurred during them,
and every verdict rests on the failing assertion's message (not a timeout). A clean build followed; tracked tree
byte-identical to HEAD.

## 8. Run log and every interim failure

| When (UTC) | What | Result |
|---|---|---|
| 7 Nov ~21:30 | Worktree, `npm ci` (93 s), merge 1, `tsc`, Vitest fixtures + ui | clean; 867 / 867 |
| 7 Nov ~21:35 | Merge 2, `tsc`, Vitest ui | clean; 92 / 92 |
| 7 Nov ~21:40–21:51 | Development runs of the new specs (not the regression; 1–3 workers) | (1) 2 failed: my count-token regex treated the list comma after a number as part of a figure (test bug, fixed: a comma joins a figure only between digits). (2) 2 failed: I read the root font size for 200 %, the app sets `data-text-scale="200"` (test bug, fixed). (3) 2 of 7 ring tests failed at 320 px / 200 %: the wrapped statement link (61 % / 53 % on B2's single rectangle); diagnosed with a screenshot (one ring per line box), fixed by measuring per line box, not by lowering the threshold. Then 9 / 9 and 4 / 4. Brief Modern Standby enter/exit blips 21:40–21:53Z overlapped these development runs only |
| 7 Nov 21:53 | Static checks (`static.sh`) | tsc, lint, i18n clean; Vitest 1,682 / 1,682 (on battery; see §2) |
| 7 Nov 21:58–22:27 | Vitest mutation sets | §7, all as on the source branches |
| 7 Nov 22:27–22:31 | Build-based mutants under the lock | 6 / 6 caught |
| 7 Nov 22:31 – 8 Nov 10:04 | **Waiting for AC power**: the directive forbids the long run on battery. The coordinator was told. AC returned 09:31Z; the machine sat in Modern Standby 09:41–10:01Z | – |
| 8 Nov 10:04 | Power check (AC, 79 %), fresh build of HEAD (same chunk hashes as before), previews on both loopbacks checked | OK |
| 8 Nov 10:06–10:53 | Complete Chromium run | **538 / 538** |
| 8 Nov 10:53–10:58 | Firefox + WebKit smoke | **69 / 70** (WebKit S.2a guard, known) |
| 8 Nov 10:58–11:02 | Follow-up under the lock: guard `--repeat-each=20`; `uxb1` "B1 shared scenario ur" twice (c12 check), `ux-b1` restored after each | 5 / 20 failed (same signature); c12-ur byte-identical twice |
| 8 Nov 11:02 | Lock released; previews and keep-awake stopped | – |

Vitest was run twice in full (1,682 both times); no timeout appeared in either.
