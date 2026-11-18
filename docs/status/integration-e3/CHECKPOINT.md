# E.3 pricing integration: checkpoint

Wave 2, Agent 2. Branch `integration/e3-wave1-claude`, worktree `propertyos-int-e3`, offset 3200 (ports 8373–8375).

## Status

**Pre-regression checkpoint. The targeted regression has NOT run yet. Do not integrate this SHA.**

- All code work items are committed: the merge, the seam-note reconciliation, the base fix and the five UX follow-ups. The normal-build scan is also done.
- Still to run (on AC, under the lock): full Vitest, the Chromium targeted run, Firefox and WebKit smoke, axe counts, mutations, PNG review.
- Blocked on power: the machine is on battery at 37 % (rule: targeted browser runs need at least 50 %, complete runs need AC).

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
