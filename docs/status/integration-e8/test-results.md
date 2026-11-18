# Gate E.8 Wave 2 integration — test results

Branch `integration/e8-wave1-claude`; base `8126322`, transplant of `6ae5e9d`. Machine: Windows 11, Node 20.20.1,
offset 3400 (ports 8573–8575, previews on 127.0.0.1 and ::1, both checked to serve the current build before each
browser run). Raw output in `test-results-ie8/` (never committed).

## Static checks (final code)

| Check | Result |
|---|---|
| `tsc -p tsconfig.json --noEmit` (whole repo) | clean |
| ESLint (`apps/backoffice/src/pages/developer`, `packages/fixtures/src/developer`, `packages/contracts/src`, the two E.8 specs) | clean |
| `scripts/check-logical-css.mjs` | no physical left/right utilities |
| `scripts/check-i18n.mjs` | 2 locales × 32 namespaces, 13,413 keys each, parity OK |
| `npm run register:sync` | 449 rows, 362 screens: **139 BUILT / 93 PARTIAL / 130 PLANNED** (no change on sync) |
| Production build (three apps, offset 3400) | built (`850a5e2`) |

## Vitest

| Run | Result |
|---|---|
| Full suite on the final code (`850a5e2`), 21:56Z, battery 36 % (not a browser run) | **84 files, 2,028 / 2,028 passed, 64 s**. No timeout, nothing rerun. |
| Earlier full run (before the last two integration tests), 21:20Z | 84 files, 2,027 / 2,027, 66 s |
| E.8 + integration files (`payables.api.test.ts` 42, `payables.test.ts` 8, `integration.test.ts` 17) | 67 / 67 |

New and changed unit/API tests (all in `packages/fixtures/src/developer/`):
- `payables/integration.test.ts` (new, 17): "In progress"; the four money states; the drawer's actual balance vs
  simulation and `ledgerCheck`; Supplier 360 posted/settled 0.00 and withheld from partial readers; expense → budget;
  E.13 resolve (every kind, no bank detail, no amount); unknown vs hidden identical in resolve, related, favourites
  and recents (store unchanged); search scope and no bank-detail match; related records both ways; revocation of
  favourites/recents/search; tenant and entity isolation; tasks for checkers, never the maker's own bill, claim or
  budget version; the instruction task needs E.7's bank boundary (a partial-entity checker gets none and is refused);
  projected activity.
- `payables/payables.api.test.ts`: paying account `•••• 7890` (the base's); bank.view over part of the entity shows
  no bank detail and refuses instruction writes `out_of_scope`; revoking bank.view hides payee and paying account at once.
- `role-templates.test.ts` (roster extended), `foundation.test.ts` (Rehan; E.8 pairs), `registry.integration.test.ts`
  (PAYABLES_HANDLERS once, after E.13).

## Mutation checks (50/50 caught)

`test-results-ie8/scripts/mutations-int.cjs`: break one guard, run `payables.api.test.ts` + `payables.test.ts` +
`integration.test.ts`, restore and compare SHA-256. Every file restored byte-identical.

- **E.8's 30 (re-run on the integrated code):** 1–29 caught in the batch; 13 is the bank boundary on the new
  `seesBank(p, entityId)` line. 30 ("reads never store anything") again ran out the batch's time limit before Vitest
  printed a summary (every read then stores the whole state), as in Wave 2; run alone (`mutant30-int.cjs`) it
  is **caught, 10 tests failed**.
- **20 new guards (31–50):** all caught. 44 ("the preparer never gets their own budget version as a task")
  **survived** the first batch; a test was added (`integration.test.ts`, "the same for a budget version") and the
  re-run catches it.

| # | Guard broken | Result |
|---|---|---|
| 31 | Bank boundary over the WHOLE entity (E.7), not the permission alone | caught (2) |
| 32 | An instruction write needs the bank boundary over its entity | caught (2) |
| 33 | E.13 supplier provider: legal-entity scope | caught (2) |
| 34 | E.13 bill provider: every cost centre of the bill | caught (4) |
| 35 | E.13 payment-instruction provider: its bill's scope | caught (1) |
| 36 | E.13 expense provider: its cost centre | caught (3) |
| 37 | E.13 budget provider: its cost centre | caught (2) |
| 38 | Supplier kinds offered only with supplier.view (revocation at once) | caught (1) |
| 39 | Search never matches a bank detail | caught (1) |
| 40 | Related records resolved one by one for the reader | caught (1) |
| 41 | Task: the maker never gets their own bill | caught (1) |
| 42 | Task: a claimant never gets their own claim | caught (1) |
| 43 | Task: instruction approval needs E.7's bank boundary | caught (1) |
| 44 | Task: the preparer never gets their own budget version | caught (1) after the added test (survived before) |
| 45 | Activity: an instruction's events are not repeated on its bill | caught (1) |
| 46 | Activity: a supplier lists only its own events (no copy of a hidden bill's) | caught (1) |
| 47 | Money: an instruction never lowers the actual balance | caught (1) |
| 48 | Money: no simulation for a cancelled instruction | caught (1) |
| 49 | Money: posted stays apart (0.00 until E-17) | caught (2) |
| 50 | "In progress" counts drafts and submitted bills only | caught (1) |

Two guards were left without a mutant because breaking them is equivalent: the checker-scope test in a task
(`billVisible(…, BILL_APPROVE)`) repeats the record's own scope plus the checker permission that `available`
already requires, and `relatedOf`'s "the record itself must be openable" is checked again by the registry.

## Browser runs

### Run 1 — targeted Chromium on the `1abbd3d` build (21:34–21:52Z, 17.5 min; lock held 21:34:17–21:51:55Z)

Specs (3 workers, retries off): e8-payables, e13-workspaces, int-ew1, register, e0-foundation, e7-ledger, e1-crm,
e2-projects, access, permissions, security, shell, locale, command-palette, identity, onboarding, and the gatee8
evidence spec. Power at the start: **battery, 55 %** (a targeted run under 30 min); at the end: battery, 39 %.

**213 / 224 passed, 11 failed; axe 414 scans, 0 violations.** Every failure was this branch's own:

| Failure | Cause | Fixed in |
|---|---|---|
| e8-payables 320 px / 200 % (EN, UR); e8 drawer at 320 px (EN, UR); gatee8 evidence 320 px (EN, UR) and the integration 320 px evidence (EN, UR) — 8 tests | E.13 `RecordLine` kept E.8's 17-character references whole with `NOWRAP`, so they ran off a related-records card | `850a5e2` (`REF_LINE`) |
| register.spec "addresses 126–150": SUP-002 at its bare address showed "not found" | the record screen's bare address answered like an unknown record | `850a5e2` (choose-a-record page) |
| e8 "activity" and "In progress (en)" — 2 tests | spec assertions (an activity row names the supplier; the tile reads "Bills in progress") | `850a5e2` |

Everything else passed, including identity (`identity.spec.ts:327` passed), int-ew1, e13-workspaces, register's
other chunks, e0-foundation, e7-ledger, e1-crm and e2-projects. No PNG of another gate was rewritten.

### Run 2 — NOT RUN YET

The rerun of the same targeted Chromium set on the fixed build (`850a5e2`, built at 21:55Z) and the full Firefox
+ WebKit smoke have **not** been run: from 21:52Z the laptop was on battery below 50 % (39 % → 32 % at 22:04Z,
discharging), and wave3-common allows browser runs on battery only from 50 %. The fixes are covered by Vitest and
typecheck/lint, but their browser confirmation is outstanding. To finish: on AC, `sh test-results-ie8/scripts/preview.sh &`,
`sh test-results-ie8/scripts/chromium.sh targeted2`, `sh test-results-ie8/scripts/smoke.sh`.

## Screenshots

`screenshots/` holds the evidence spec's output from run 1 (the `1abbd3d` build): every 1440 px shot (EN, UR, dark)
and the 320 px shots that ran before the reference overflow stopped those tests. The 320 px shots of Supplier 360,
the budget, the tasks and the expense from the integration set are missing until run 2. Looked at: the drawer's
balance and simulation (EN, UR), Supplier 360 header (four money states), related records, my tasks and payables
activity (UR): no clipping or overlap at 1440 px.
