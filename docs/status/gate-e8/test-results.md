# Gate E.8 — test results (provisional, Wave 2)

Machine: shared Windows 11 laptop (12 logical CPUs, 32 GB), Node 20.20.1, Chromium/Firefox/WebKit from Playwright 1.64.1. Previews of the production build on 8573–8575 (`E2E_PORT_OFFSET=3400`), both loopbacks checked byte for byte against `dist` before each browser run.

## Static checks

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` (ESLint, logical CSS, i18n parity) | 0 problems; i18n 2 locales × 28 namespaces × 11,593 keys, parity OK |
| Production build (3 apps, offset 3400) | OK |

## Unit and API (Vitest)

| Run | Result |
|---|---|
| `payables.api.test.ts` | 40/40 |
| `payables.test.ts` (`payables.vectors.json`, `budgets.vectors.json`) | 8/8 |
| `foundation.test.ts`, `role-templates.test.ts`, `gate-e-access.test.ts` | green (role count now follows the role list) |
| Full `npx vitest run` | 1,797/1,799. The two failures were 5 s timeouts under 100 % CPU (other agents' runs) in `community.test.ts` (5,000 random polls) and `finance.api.test.ts` (bulk office collection), suites E.8 does not touch; run alone: 78/78. |

## Browser

| Run | Result |
|---|---|
| `tests/e2e/e8-payables.spec.ts` (targeted, 2 workers) | 14/14: R3 journey; double press = one bill; own claim blocked; bank boundary; Heights-only and hidden = invented; Nadia reads only; petty cash, approvals and budget vs actual; axe EN/UR at 1440 and 390 px; 320 px / 200 % EN/UR (every screen, every problem reported); dark mode EN/UR at 390 px; keyboard reach at 320 px / 200 % |
| `tests/smoke/e8.smoke.spec.ts` (Firefox + WebKit, targeted) | 6/6 |
| `tests/evidence/gatee8.evidence.spec.ts` | 6/6; 61 PNGs, every width matches its name |
| **Complete Chromium run** (lock held 19:20:59Z–20:22:45Z; every e2e spec + `gatee8` and `gatee0` evidence; 3 workers, retries off; build `736db4b` served on both loopbacks) | **528/528 passed, 0 failed, 57.0 min** |
| **Full Firefox + WebKit smoke** (every smoke spec, 3 workers, retries off) | **76/76 passed, 4.6 min** |
| axe in the complete run | **1,693 scans, 0 violations** (86 on E.8 screens) |
| Known intermittents | `identity.spec.ts:327` passed; `s2a.smoke.spec.ts:52` passed in Firefox and WebKit |
| PNGs rewritten in other gates' folders | `gate-e0` (5 files) restored from HEAD after the run; nothing of another gate committed |
| Power | AC at the start of the e2e run and of the smoke (`final-power-*.txt`); the check after the smoke (20:22Z) found the laptop on battery |

## Mutation checks (guards)

Script `test-results-e8/scripts/mutations.cjs`: break one guard, run `payables.api.test.ts` + `payables.test.ts`, restore and compare SHA-256. **30/30 caught; every file restored byte-identical.**

| # | Guard broken | Result |
|---|---|---|
| 1 | A bill is visible only when every cost centre it touches is (`every` → `some`) | caught (2) |
| 2 | Maker ≠ checker on bills | caught (1) |
| 3 | Maker ≠ checker on payment instructions | caught (1) |
| 4 | The claimant never decides their own claim | caught (1) |
| 5 | Maker ≠ checker on expenses | caught (1) |
| 6 | The counter never witnesses their own count | caught (1) |
| 7 | The requester never approves their own top-up | caught (1) |
| 8 | The preparer never approves their own budget version | caught (1) |
| 9 | A cost centre of another entity is refused (cross-entity) | caught (1) |
| 10 | A supplier of another entity is refused (cross-entity) | caught (1) |
| 11 | Writes also need the area's read permission | caught (3) |
| 12 | Bound replay on bill create | caught (1) |
| 13 | Bank details only for `bank.view` | caught (1) |
| 14 | Supplier totals for whole-entity readers only | caught (1) |
| 15 | The ledger statement is withheld from partial readers | caught (1) |
| 16 | Live instructions reduce what may still be instructed | caught (2) |
| 17 | Posting refused (409 `posting_planned`, E-17) | caught (1) |
| 18 | Practice mode changes nothing | caught (1) |
| 19 | A hidden entity in a query answers 404 | caught (1) |
| 20 | A hidden entity in a body answers 404 | caught (1) |
| 21 | Expense visibility follows its cost centre | caught (5) |
| 22 | Only the maker withdraws | caught (1) |
| 23 | A duplicate supplier invoice number is refused | caught (1) |
| 24 | Approved bills count in budget vs actual only for supplier readers | caught (1) |
| 25 | Actual = posted only | caught (2) |
| 26 | Only the approved budget version governs | caught (3) |
| 27 | A count = notes × face value | caught (2) |
| 28 | Supplier activity projected per reader | caught (1) |
| 29 | The seed holds no approved bill | caught (2) |
| 30 | Reads never store anything (the seed is computed) | caught (10). In the batch run this mutant hit the 10-minute limit before Vitest printed a summary (every read then saves the whole store); run alone (`mutant30.cjs`, 20 s test timeout) the 10 failures are recorded: "reads never store anything" and the byte-identical checks after refusals. |

Mutants 1–10 ran in a first batch that was paused under 100 % CPU; that interruption left mutant 11 in `handlers.ts` (Windows ended the process without running its restore handler). It was caught by `git diff` and restored from HEAD before any build; 11–30 then ran to the end.
