# Gate S.3 checkpoint (resume notes)

Branch `feature/gate-s3-rentals` in worktree `D:\laragon2\www\propertyos-s3`.

## Current work: Issue #17 closure (GPT review of `7df5f80`: PROVISIONAL / HOLD)

Review saved at `C:\Users\Dell\AppData\Local\Temp\claude\f4d6f3736e292f75\6752593f-e85c-4b16-9d5c-8157297782a1\scratchpad\issue17-gpt-review.md` (also Issue #17 comment 6684179520).

- [x] Step 1: `git merge --no-ff 04b6fde` → merge commit `0dd9723` (no textual conflict; the branches touch disjoint files). tsc clean on the merge.
- [x] Step 1b (part): full Vitest on the merge 1,603/1,603 (56 files), 67 s.
- [x] Step 1b: rentals idempotency code → `idempotency_key_reused` (3 old assertions renamed); UI `useCreateKey`/`isKeyReused` in the six rentals creates; settled-line bank ref through `seesBankFeed` (`projectStatement`).
- [x] Step 2 (P0) code: `views.ts` `ownerFootprint`, `statementSites`, `projectStatement` (one rule; office `projectBody` uses it; `ownerWhole` also needs the footprint); `portal.ts` uses it. Contracts: `LandlordView.statements[].scopeLimited`; LandlordPage partial badge; i18n `portal.partial`, `portal.limited` (+ payout lines left out).
- [x] Step 3 (P1) code: `owner_statement.issue` (contracts), route, `statementView`, accounts_officer only, UI reason `statement-issue-blocked`, i18n `statements.issuePermission`.
- [x] New tests `rentals.issue17.api.test.ts` (14); rentals 100/100; tsc + lint clean (i18n 10,884 keys).
- [x] Mutations `test-results-s3/scratch/mutations-closure.cjs` → `test-results-s3/mutations-closure.txt`: 25/25 killed (M1–M15 rerun, M16–M25 new), all restored byte-identical. P0 reproduced against the original portal.ts (`test-results-s3/p0-repro-original-portal.txt`: 4 failed).
- [x] Demo knob: `demo:site-scope` now also narrows a party scope (landlord keeps links at listed sites only; narrow-only) + unit test in `demo-licence.test.ts`.
- [x] e2e added to `tests/e2e/s3.spec.ts`: describe "S.3 closure (Issue #17)" (2 tests); SCREENS + `statements-read-only` (rb_manager); partial landlord in the axe loop and the 320/200 % test. Smoke: 1 new test in `tests/smoke/s3.smoke.spec.ts`. Evidence: h01–h06 test in `tests/evidence/gates3.evidence.spec.ts` (16 files).
- [x] Register: RNT-005 permission/tests/notes, PORTAL-037 tests/notes; `register:sync` → 449/362 (139/43/180), no status change.
- [x] tsc, lint clean; vitest demo-licence + rentals 105/105; build; S.3 e2e 17/17 (3.1 min, 1 worker, first run); S.3 evidence 12/12 (all earlier PNGs byte-identical; video re-recorded then restored with git checkout); h06 recaptured twice (scroll to the notice's end); 18 h-shots, widths checked, looked at; S.3 smoke FF+WK 6/6.
- [x] Docs so far: FUNCTION_MATRIX, SECURITY_FINDINGS (S15, S16, G3 closed, G4).
- [x] Full Vitest 1,618/1,618 (57 files, 49 s).
- [x] Complete combined run (`closure-full-run1.{txt,json}`): **428/429 in 52.0 min**, 3 workers, retries off. Failure: `identity.spec.ts:327` (D.1 branding, `expect(await html(...)).toBe('indigo')` right after a click, CPU ~90 %); rerun alone `--repeat-each=10`: 10/10 (`closure-identity-repeat10.txt`). Axe: 1,506 scans, 0 violations (S.3: 80). Video re-recorded by the run → restored with git checkout; no other gate's evidence touched.
- [x] Full FF+WK smoke run 1: 50/50 (3.2 min); run 2: 49/50 (3.4 min; WebKit s2a "a new guard" failed, listbox still open). A/B, that test alone `--repeat-each=10`, 1 worker: branch 8/10, clean `04b6fde` (temp detached worktree, own `npm ci`, served on 5773–5775, verified served build = 04b6fde) 8/10, same symptom → pre-existing. Temp worktree removed, pruned. **Lock released 2026-11-06T14:20:29Z.** Previews stopped.
- [x] Docs filled (report C1–C7, test-results closure section, security, matrix, manual verification). Final build 60 s; tsc, lint clean; Vitest 1,618/1,618 (98 s) on the final code. No previews running.
- [ ] Commit (explicit paths), push fast-forward of `7df5f80`, verify `git ls-remote`, then STOP for GPT and owner review. The closure commit's SHA is in the delivery message.
- [ ] Step 4: complete integrated regression (lock `D:\laragon2\www\.e2e-busy`, 3 workers, retries off, offset 600).
- [ ] Step 5: docs, register, commit with explicit paths, push fast-forward, STOP.

## Rules for this run
- Never force-push; push only `feature/gate-s3-rentals` (fast-forward of `7df5f80`).
- Ports 5773–5775 only (`E2E_PORT_OFFSET=600`), TEMP/TMP under `test-results-s3/tmp`, `--output=test-results-s3/...`.
- Evidence: pass `tests/evidence/gates3.evidence.spec.ts` explicitly; `git checkout -- docs/status/gate-*` for other gates if rewritten.

## Earlier (gate build, `7df5f80`)
- Built on `a0d4a70`, rebased onto `474e4ae` (clean). 404/404 combined regression, 1,587 Vitest, 15/15 mutations.
- Decisions R1–R8 (report §4); GPT/owner rulings recorded in the closure section.

## How to resume
- Build: `sh test-results-s3/scratch/build.sh`; serve: `sh test-results-s3/scratch/preview.sh` (ports 5773–5775, both loopbacks).
- Run: `E2E_PORT_OFFSET=600 npx playwright test …` with TEMP/TMP on D:. Check/create `D:\laragon2\www\.e2e-busy` before multi-worker runs.
