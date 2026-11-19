# E.3 pricing integration: checkpoint

Wave 2, Agent 2. Branch `integration/e3-wave1-claude`, worktree `propertyos-int-e3`, offset 3200 (ports 8373–8375).

## Status

**Targeted regression done (on AC). Ready for the coordinator's verification; STOPPED.**

Agent 1 integrates after that verification. The numbers are in [test-results.md](test-results.md):

| Check | Result |
|---|---|
| Vitest | 2,091 / 2,092. The one 5 s load timeout passes alone: 17 / 17. |
| Chromium targeted | 220 / 221. The one test defect was fixed in `405129b`; that spec then ran 18 / 18. |
| Firefox + WebKit smoke | 98 / 98 |
| axe | 307 scans, 0 violations |
| Mutations | Vitest 26 / 29 (3 equivalent, as at `74241b0`); browser 9 / 9 |
| Normal-build scan | 0 hits in 713 files, sourcemaps included |
| Register | 139 / 83 / 140 |

`ad3fac5` was a pushed pre-regression checkpoint. It is superseded by this head.

## History

The reviewed SHAs stay ancestors (`git merge --no-ff`, no rebase, no squash):

| Commit | What |
|---|---|
| `310b30f` | Merge of `74241b0` (E.3 local validation) onto `8126322` (accepted Wave 1 base). Base wins; E.3 is appended. |
| `86ebd9e` | Shared-file blocks follow the seam notes.<br>• `pricing.manage` goes after "end Gate E.0", with workspace.json EN/UR labels.<br>• A single `PRICING_HANDLERS`.<br>• Delimiters: `// ---- Gate E.3 (integration candidate) ----`. |
| `c156134` | **Base fix** (seam notes §5). `idempotency.ts` `replayOf` uses own entries only, and `remember` defines an own property (`__proto__`). |
| `b3d5619` | Unit scope goes through E.2's `inventoryVisible` (seam notes §10). E.3's header semantics are kept. |
| `9f276b9` | Draft replay goes through E.0's `replayOf` / `remember` (adapter `pricing/draft-replay.ts`).<br>• Stale versions give 409 `stale_version`.<br>• The key maximum is now 80. |
| `94247ed` | Permission-denied outcomes: `refusal="outcome"` on all 7 routes, plus the drawer's reason words. |
| `1f1d2a6` | Contextual deep links to private drafts:<br>• `?record=`, and `&draft=` for INV-007;<br>• one not-found;<br>• Back and Forward;<br>• unit links to INV-002. |
| `ac78a6b` | Discount rows read as deductions: U+2212 inside the LTR isolate, plus "Deduction" / "کٹوتی". |
| `280843e` | Urdu spacing (`templateAdd`, `templateDelete`, `policyEmpty`). |
| `ef8f49d` | Native selects no longer clip at 320 px / 200 % (FitSelect). |
| `e624de4` | Test-only principals are absent from a normal build, sourcemaps included (module swap plus `scripts/check-test-principals.mjs`). |
| `ad3fac5` | Pre-regression checkpoint docs. |
| `2c24576`, `6eb1ae2` | Evidence goes to `docs/status/integration-e3/screenshots`; new `e3int.evidence.spec.ts`. |
| `5800bba` | Tests: the keyboard ring of a FitSelect is read on its box. |
| `52fdd4b` | Tests: the editors' write counts exclude the shell's E.13 recent-record visit (`/workspace/recents`). |
| `405129b` | Tests: the INV-002 link lands on E.2's quick view over the unit matrix. |

## Constraints held

- No grant of `pricing.manage` to any role or persona.
- No policy activation; draft-only.
- All 7 E.3 screens stay PARTIAL. The register is 139 / 83 / 140.
- `dev-screen.tsx` is untouched.
- PR #34's branch and `fix/gate-e3-local-validation-claude` are untouched.

## Deviations from the seam notes

- **§2.** The principals are no longer "behind `__E2E_TEST_PRINCIPALS__`". A build-time module swap (`vite.config.ts` alias) replaces the define, so a normal build's sourcemaps hold nothing either. The coordinator suggested this.
- **§10.** E.3 keeps its reviewed rule that the header project also hides a draft or unit named by id: E.0 `projectVisible`, and `inventoryVisible && ctx.allowsProject` for units.
  - E.2's own named-id rule ignores the header.
  - Switching E.3 to that rule would change 12 reviewed GPT and E.3 assertions, so it is left for Agent 1 / GPT to decide.

## Observations (not changed)

- **Recent records.** With `?record=<draft>`, the shell's E.13 recent-record visit posts `/workspace/recents` for a pricing draft. The server refuses it, because E.3 drafts are not E.13 records; nothing is written. Registering E.3 providers is not part of this assignment.
- **Not-found heading.** When a draft link is not found, the editor's heading still reads "Revise draft" above the not-found state. This is cosmetic.
