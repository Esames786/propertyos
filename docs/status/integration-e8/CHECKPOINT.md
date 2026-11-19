# Gate E.8 Wave 2 integration — checkpoint

Agent 3, worktree `D:\laragon2\www\propertyos-int-e8`, branch `integration/e8-wave1-claude`, test offset 3400
(ports 8573–8575), test output in `test-results-ie8/` (never committed).

## What this branch is

- Base: `integration/e-wave1@8126322` (Wave 1, accepted by GPT as the isolated integration base).
- Transplant: `git merge --no-ff 6ae5e9d` (E.8 as GPT cleared it) → merge commit `e3648fd`. Conflicts were resolved
  only as far as compiling needs (the base first, E.8's additions appended); the canonical reconciliation follows
  in labelled commits `E.8 integration 1/n …`.
- Both `8126322` and `6ae5e9d` stay ancestors. No rebase, squash or force-push. `feature/gate-e8-payables-expenses-claude`
  and `propertyos-e8` are untouched (frozen).

## Done

1. Merge (`e3648fd`).
2. Canonical seams (1/n): one delimited `Gate E.8 (integration candidate)` block per shared file; roster pins
   extended (budget_holder → lsp_budget_holder); E.8 maker-checker pairs in foundation.test.ts; PAYABLES_HANDLERS
   registered once after E13_HANDLERS; GATE_E8_EXTRA unchanged (provisional E-06, D-INT-07).
3. Bank boundary (2/n): E.7's `seesBank(ctx, entityId)` (whole legal entity) for every bank identifier in payables
   and for every payment-instruction write.
4. DevScreen (3/n): all 17 screens `refusal="outcome"`, DEV only; record screens read `?record`.
5. E.13, context, "In progress", money states (4/n): see INTEGRATION_NOTES.md.
6. Register 139 / 93 / 130 (`npm run register:sync`, no change).

7. Tests and evidence (5/n `1abbd3d`); fixes from the first targeted Chromium run (6/n `850a5e2`).
8. Full Vitest on `850a5e2`: 2,028 / 2,028. Mutations 50/50 caught (mutant 30 alone; 44 after an added test).
9. First targeted Chromium run (`1abbd3d` build): 213/224; the 11 failures were all this branch's (E.13 reference
   wrapping at 320 px, a record screen's bare address in register.spec, two spec assertions) and are fixed in 6/n.

## Status at the last update (19 Nov, 05:56Z)

- Full `npm run lint`: clean (05:11Z, on AC).
- Chromium run 2 (`850a5e2` build, on AC): 216/224, axe 415/0. The 8 failures were one defect of this branch:
  references split mid-segment at 320 px / 200 %. Fixed in 7/n `7e448c8` (RefSegments). Full Vitest on
  `7e448c8`: 2,028/2,028.
- Chromium run 3 (`7e448c8` build) was STOPPED at 05:54Z when AC dropped, and is not counted. It had passed
  every test that failed in run 2 before the stop.
- **Outstanding:** a counted Chromium run on `7e448c8` and the full Firefox + WebKit smoke, both on AC. The build
  in `apps/*/dist` is from `7e448c8` (the same code as HEAD).

## Next / how to resume

- Targeted regression: `sh test-results-ie8/scripts/build.sh`, then `sh test-results-ie8/scripts/preview.sh &`,
  then `sh test-results-ie8/scripts/chromium.sh targeted4` and `sh test-results-ie8/scripts/smoke.sh` (each takes
  `D:\laragon2\www\.e2e-busy` atomically; exit 2 = held).
- Mutations: `node test-results-ie8/scripts/mutations-int.cjs` (50 mutants: E.8's 30 + 20 new guards).
- Then test-results.md, push (no force), release the lock, stop previews (`stop-previews.ps1`), clean tree, hand-off.
