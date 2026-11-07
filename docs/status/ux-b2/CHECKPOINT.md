# UX batch B2 (accessibility blockers and one-line shared fixes): checkpoint

Branch `fix/ux-b2-accessibility`. B2 code `a0897b9`, docs `0884f03`; Issue #20 follow-up on top.
Worktree `D:\laragon2\www\propertyos-b2`. `E2E_PORT_OFFSET=1200` = ports 6373-6375.
Scripts (not committed): `test-results-b2/scratch/{build,preview,lock,unlock}.sh`, `axe-count.cjs`,
`css-layers.cjs`, `ring-audit.cjs`, `rings-summary.cjs`; interim log `test-results-b2/interim-i20.txt`.

## Status: Issue #20 complete; committed and pushed; STOPPED for GPT review
- [x] N-B2-1: unlayered `--tw-outline-style: solid` rule + base-layer container rule + ChoiceFields labels;
      verified in the built CSS of all three apps and in rendered pixels (tests/support/focus.ts).
- [x] Rentals KPI names: StatTile drops a context's repeated leading figure (unit tests with the S.3 EN/UR patterns).
- [x] N-B2-5 fixed (describedby); N-B2-2/3/4 open; N-B2-7 new, proven on base 04b6fde.
- [x] Final: tsc, lint, Vitest 1,536/1,536; combined Chromium 472/472 (38.2 min, 3 workers, retries off);
      axe 1,464 scans 0 violations; smoke Firefox 28/28, WebKit 28/28; 48 screenshots.
- [x] Lock held 23:18:14Z-00:01:22Z and released; previews stopped; temporary base worktree removed;
      exploration specs (zz-*) deleted, never committed.
- [x] B2_REPORT.md §4 "Issue #20 closure", test-results.md, MANUAL_VERIFICATION.md (F1-F9) updated.
- [x] Commit (explicit paths), push as a fast-forward of 0884f03, `git ls-remote` checked.
