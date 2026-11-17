# UX B10: Issue #24 reflow and focus fix (Agent F report)

> The coordinator wrote this file from Agent F's hand-off, because the harness does not let subagents write report files. The content is Agent F's. The final state is also in [CHECKPOINT.md](CHECKPOINT.md).

Both P1 defects are fixed in the shared UI. The branch is pushed and **STOPPED for GPT and owner review**.

## 1. Agent and assignment

Agent F, B10 (Issue #24), had two defects to fix:

- **F-INT-1:** the Rentals `rent-kpi-payable` label was cut off at 320 px with 200 % text.
- **F-INT-3:** 37 % of the Cancel button's focus ring was clipped in the Rentals confirm dialog.

Setup: worktree `D:\laragon2\www\propertyos-b10`, offset 2800, ports 7973–7975.

## 2. Branch and SHAs

`fix/ux-b10-reflow-focus`, based on `373d0cf`, pushed without force.

| Commit | Contents |
|---|---|
| `9f76e99` | Code and tests |
| `f9b8635`, `f425a58` | Checkpoints and screenshots |
| `5af5d32` | Final checkpoint; the agent's last commit |

The commit that adds this report sits on top of `5af5d32` and contains no code.

## 3. Screens BUILT / PARTIAL / PLANNED

The register does not change. This is a repair to shared components, so no screen changed status.

## 4. What was wrong and what changed

### Reproduced on the base build first

**F-INT-1 affects more than Rentals.** Agent F measured every StatTile label on all 7 screens that use StatTile: management home, society home, collections, finance, HR, payroll and Rentals. Each was measured in EN and UR at 1440, 768 and 390 px, at 1440 px with 200 % text, and at 320 px with 200 % text. That gave 440 measurements.

- 33 were cut, on 17 tiles, all at 200 % text.
- The two-line clamp cut labels short, for example "Owner payable (settled mone…" and "Billed for November…".
- The clamp's `overflow: hidden` also clipped single words sideways next to the change badge on the management home ("Collected").

**F-INT-3:** tabbing from Close to Cancel scrolls the dialog overlay only until Cancel's box touches the bottom edge. The focus ring is drawn outside that box, and B2's `ringOf` measured exactly 0.37 of it clipped (EN).

### Fix 1: `packages/ui/src/data/StatTile.tsx`

- The label is no longer clamped or clipped. It wraps onto as many lines as it needs, and the tile grows.
- The header row can wrap, and the label group is `flex-1`.
  - Beside a change badge, the label gets the same width as before.
  - The badge moves to its own line only when the label's longest word cannot fit beside it.
- The label carries `data-stat-label` so tests can find it.
- Re-measured: 0 of the 440 are cut. With normal text at 1440, 768 and 390 px, every tile keeps exactly the same size and number of lines.
- An earlier version moved the badge to its own line too readily at 1440 px ("Conversion rate"). It was replaced before commit.
- Accessible names are unchanged, and each amount is still read once (B2's de-duplication).

### Fix 2: `packages/ui/src/overlays/Dialog.tsx`

- Adds `scroll-p-4` (16 px scroll padding) to the dialog overlay.
- That overlay is the only scroll container of every dialog, so the fix covers all 45 uses of `ConfirmDialog`.
- The product already uses the same method on `html` in `AppShell` and `CustomerShell`.
- Verified in Chromium, Firefox and WebKit: `ringOf` measures 0 clipped.
- The ring itself, `tests/support/focus.ts` and all thresholds are unchanged.

### Every changed file

- `packages/ui/src/data/StatTile.tsx`
- `packages/ui/src/overlays/Dialog.tsx`
- `packages/ui/src/data/StatTile.b10.test.tsx` (new)
- `tests/support/ring-edges.ts` (new)
- `tests/e2e/ux-b10.spec.ts` (new, 24 tests)
- `tests/evidence/uxb10.evidence.spec.ts` (new, 4 tests)
- `tests/smoke/uxb10.smoke.spec.ts` (new, 2 tests per browser)
- `tests/e2e/int-s3b.spec.ts` (2 lines changed)
- `docs/status/ux-b10/CHECKPOINT.md`
- `docs/status/ux-b10/screenshots/*` (14 PNGs)

The two changes in `int-s3b.spec.ts`:

- The label locator moves from `span.line-clamp-2` (the class that caused the defect) to `[data-stat-label]`.
- The confirm-dialog ring check at 320 px / 200 % no longer allows any clipping, which makes it stricter. The drawer allowance (N-B2-3) is unchanged.

No other test was changed, skipped, wrapped in retries or given a lower threshold.

## 5. Unit and API results

- `tsc` clean. ESLint, logical CSS and i18n parity clean (10,915 keys per locale).
- Vitest: 1,683 of 1,684 passed (the 1,682 existing tests plus 2 new), run with the CPU at 96 %.
  - The one failure is a 5-second timeout in `finance.api.test.ts`. This branch does not touch that package, and the file passes alone 17 / 17.

## 6. E2E results

Complete Chromium run on AC power, 16:25–18:38Z: all e2e specs plus all 17 non-historical evidence specs, 3 workers, retries off.

**712 / 717 passed in 2.2 h.** All 5 failures are timeouts:

- **Over the time budget under load** (other agents had the CPU at 100 %):
  - `dashboard.spec.ts:210`, the guided tour: the tour had reached its completion card when time ran out. Passes alone 3 / 3.
  - `s2a.spec.ts:572`, EN and UR: the trace shows every step and the final assertion finished at 314 s, against a 300 s budget. Passes alone 2 / 2.
- **Already failing, unrelated to this fix:** `gatec2.evidence.spec.ts:578` and `:621`.
  - These Gate C.2 video scripts click the "statements" link in the resident bottom bar, which Gate D.2 removed.
  - The integration never ran them. Agent F did not edit these accepted specs.

Agent F's own specs: ux-b10 24/24, int-s3b 9/9, uxb10 evidence 4/4.

Firefox and WebKit smoke: **74 / 74**. Both known intermittents passed: WebKit `s2a.smoke.spec.ts:52` and D.1 `identity.spec.ts:327`.

## 7. Permission and security tests

Not applicable: no access, API or financial rule was touched. Two related checks were added:

- **Re-open after a failure:** the network loses the issue request (the same pattern as `cn-idempotency.spec.ts`). The test asserts exactly one failed request and that the statement is still not issued.
- **Request 360 refusal:** the request stays open.

## 8. Mutation checks

Each mutant was built, run and then restored byte-identical to HEAD.

| Mutant | Unit tests failing | Browser tests failing | Caught by |
|---|---|---|---|
| M1: label clamp put back | 1 / 14 | 16 / 18 | every F-INT-1 test; the 2 §5.1 name tests still pass, as expected |
| M2: scroll padding removed | 1 / 14 | 3 / 10 | int-s3b "Rentals keyboard rings, 200pct-320, en" and ux-b10 Rentals EN, light and dark |

- M2 shows no effect in Urdu or in the Request 360 dialog. There, Cancel happens not to land on the overlay's edge, which matches the original reproduction.
- The first attempt to build each mutant failed with `ENOTEMPTY`, because the previews held `dist` open. The script now stops the previews before building.
- Extra mutants M3–M7 are scripted but were not run, to save the shared usage window:
  - M3: padding of 1 px;
  - M4: label allowed to shrink below its longest word;
  - M5: no wrap;
  - M6: wrapping too eagerly;
  - M7: label clips.

## 9. Accessibility

- **axe:** 1,616 scans with 0 violations, including 10 from ux-b10 and 12 from int-s3b.
- **Labels:** checked in EN and UR on all 7 screens at 1440, 1440 with 200 % text, and 320 with 200 % text, against the computed clamp, overflow and text bounds.
- **Focus rings:** measured on all four borders (top, bottom, start, end) of each control, at the exact point where the keyboard left it.
  - Keyboard path: Tab once round the dialog, then Shift+Tab once back.
  - Themes and languages: light, and dark with high contrast, in EN and UR.
  - Two dialogs: the Rentals statement issue, and the Request 360 close with the refusal shown inside it.
  - Both dialogs are re-opened by keyboard after a failed action.
- **Firefox note:** Firefox includes the ink of Urdu letters below the last line in `scrollHeight`. The label check therefore asserts that the label does not clip (`overflow: visible`), plus sideways bounds. That also stops Urdu descenders being cut.
- **Not done:** no screen reader, real phone or native Urdu reader was used, so no WCAG conformance is claimed.

## 10. Screenshots

There are 14 screenshots in `screenshots/`. Agent F looked at all of them, and each width matches its file name.

| Screenshot | Width |
|---|---|
| `t01-rent-payable-label-200pct-320-{en,ur}` | 320 |
| `t02-mgmt-kpis-badge-200pct-320-{en,ur}` | 320 |
| `t03-hr-kpis-200pct-1440-{en,ur}` | 1440 |
| `d01-rent-confirm-cancel-focus-200pct-320-{en,ur}` | 320 |
| `d02-rent-confirm-cancel-focus-dark-contrast-200pct-320-{en,ur}` | 320 |
| `d03-rent-confirm-reopened-after-failure-200pct-320-{en,ur}` | 320 |
| `d04-request-close-refused-cancel-focus-200pct-320-{en,ur}` | 320 |

### Accepted evidence

The run rewrote 1,195 files. All were compared with HEAD and then restored: afterwards there were 0 status lines and 0 untracked files.

- In the folders the integration had already re-run on this base, the differences repeat the integration's known causes:
  - noise;
  - Issue #21's `c01 …200pct-320`;
  - B2's `f04`;
  - S.3's `r09`;
  - the S.3 video re-encode.
- New differences caused by B10, all intended:
  - `ints3b i03`, 200pct-320 EN/UR: the Rentals labels are now whole.
  - `uxb2 m01`, 200pct-320 EN: the label reads "Billed for November 2026" instead of "November…".
  - `uxb2 o04`, 320/200 % UR: the dialog sits a few pixels lower, because focus scrolling keeps the refusal clear of the edge.
  - Tile labels at 1440, 390 and 768 px no longer lose 1–8 px of glyph ink: `gate-s3 a01`/`e01`/`g01`, `ints3b i01`/`i02`, `uxb1 c02`, `uxb2 r01`/`r02`/`r05`/`r06`, `s1-hotfix a04`.
- The older gates' folders (B-final, C1, C2, D1–D3, S1, S2a/b, integration-d1-s1) were captured on older code. They drift heavily from HEAD because of later gates, including changes in page size. They were restored, but their differences were not attributed one by one; that would need a re-capture on the base build.

## 11. Open dependencies, deferred items, shared-file touches

**Recorded but not fixed, as instructed:**

- **F-INT-2:** the Urdu organisation name breaks mid-word at 390 px.
- **F-INT-4:** `ringOf` measures a single rectangle, so it cannot handle links that wrap. `focus.ts` is untouched.
- **F-INT-5:** the WebKit S.2a intermittent. It passed in this smoke run.
- **N-B2-7:** contrast of the aging bar in dark high-contrast mode.

**New observations, each needing separate approval:**

- Drawer bodies have the same edge-scroll behaviour (N-B2-3 class); the int-s3b allowance stays.
- `MetricCard` also clamps its label (`line-clamp-2`).
- The sidebar shortens nav labels with "…" at 200 % text.
- The resident pay form's file hint is squeezed into a narrow column at 390 px / 200 % in Urdu.
- The Gate C.2 video scripts need updating for the D.2 bottom bar.
- The N-B2-2 sideways scroll is unchanged.

**Shared-file touches to reconcile:**

- `StatTile`: 3 class changes and 1 attribute.
- `Dialog`: 1 class.
- `int-s3b.spec.ts`: 2 lines.

No owner decisions are needed.

## 12. Integration readiness

Ready. The branch does not depend on any Gate E work and touches only the files listed above.

- **Conflict risk:** only if another branch edits the same StatTile header lines or the `Dialog` overlay class.
- **Evidence specs that will differ after merge:** those that capture StatTile screens at 200 % text, or a dialog taller than the screen with keyboard focus. These changes are intended and listed above.

At hand-off the lock had been released (18:51:15Z), the previews were stopped, and the working tree was clean.
