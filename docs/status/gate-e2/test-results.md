# Gate E.2 — test results (projects and inventory, provisional)

Branch `feature/gate-e2-projects-inventory` (base `373d0cf`). Production builds served on 7373–7375 (127.0.0.1 and ::1), `E2E_PORT_OFFSET=2200`. Logs in `test-results-e2/` (git-ignored).

## Static checks
| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` (ESLint, logical CSS, i18n parity) | clean; i18n: 2 locales × 28 namespaces, 11,344 keys each, parity OK |
| `npm run register:sync` | 449 rows, 362 distinct (139 built, 49 partial, 174 planned); 321 V2.1 IDs and addresses preserved |
| Production build (backoffice, customer, HQ) | built |

## Unit, API and vectors (Vitest)
| Suite | Tests | Result |
|---|---:|---|
| `developer/inventory/inventory.api.test.ts` | 29 | pass |
| `developer/inventory/inventory.vectors.test.ts` (+ `inventory.vectors.json`) | 5 | pass |
| `security.test.ts` (every handler declares access; transport fails closed) incl. the 18 new E.2 endpoints | 26 | pass |
| `role-templates.test.ts` (Larkspur 6 → 8 roles; every staff identity has exactly its role's permissions) | 4 | pass |
| Full suite | see "Complete runs" | |

API tests cover: scope and header filter; Heights-only never sees Gardens (list, totals, counts, 360, matrix, units, storage); Crescent Bay Plaza "not in plan" and the unassigned import; hidden = unknown (identical 404 bodies) for projects, towers, units, storage, setup records, leads and units named in bodies; holds (live everywhere, one in force, owner-only release, other/expired/unknown/legacy alike, seeded holds never releasable); expiry with a faked clock (held at 07:59:59, available at 08:00:00, lapsed listed, history kept, re-hold allowed); legacy CRM hold without principal fail-closed; storage (no double allocation, cross-project, not-sold, out-of-service, reason validation, history); maker ≠ checker by principal (even holding both permissions); only the maker edits or submits; return with reason; locked states; validation of every field; bound idempotency (identical replay; other input, target or person → 409; one record); unauthorised and revoked mid-session (permission, view, scope) refused by the transport or as not found; byte-identical state after every refusal; nested-history projection (no lead reference for a narrow reader; the manager keeps it).

## Mutation checks (break one guard, run the E.2 suite, restore, SHA-check)
20 mutations; first pass 18 caught, 2 survived (M15 drafts visible to any projects reader; M17 any `project.manage` holder edits a draft). Two tests were added (the setup count and draft never reach a reader without a setup permission; a second, test-only preparer is refused `not_maker` on edit and submit, state unchanged); re-run: **M15 and M17 caught → 20/20**. Every file restored byte-identical (SHA-256 compared).

| # | Guard broken | Caught by |
|---|---|---|
| M01 | inventory scope always true | 4 tests |
| M02 | projects area ignores scope | 1 |
| M03 | any principal releases a hold | 3 |
| M04 | expired hold still counts | 4 |
| M05 | hold on non-available stock | 2 |
| M06 | lead of another project / hidden lead accepted | 1 |
| M07 | allocated locker allocated again | 2 |
| M08 | cross-project storage allowed | 1 |
| M09 | hidden unit treated as visible target | 1 |
| M10 | maker = checker allowed | 1 |
| M11 | idempotency not bound to the input | 2 |
| M12 | idempotency not bound to the principal | 1 |
| M13 | activity shows lead refs to every reader | 1 |
| M14 | hold view shows the lead to every reader | 1 |
| M15 | setup drafts visible to any reader | 1 (after the added test) |
| M16 | Project 360 tabs ignore the site licence | 1 |
| M17 | anyone with `project.manage` edits a draft | 1 (after the added test) |
| M18 | dimension round trip broken (occupied) | 1 |
| M19 | duplicate project code accepted | 1 |
| M20 | storage/matrix lists ignore header filter and scope | 5 |

## Browser (Chromium e2e, targeted while developing; `--workers=1`)
`tests/e2e/e2-projects.spec.ts` — 19 tests: projects (filters, sort, search, KPIs open records, 360 tabs live/planned/not-in-plan); Heights-only never sees Gardens; revoked (site scope narrowed) hides at once; finance refused; Crescent Bay; keyboard grid (arrows, Home/End, Enter, Escape) and list alternative; dashboard and register addresses; hold → expiry (clock +48 h) → available, owner-only release; double press → one hold; storage allocate/release with history and no buttons for others; setup draft → submit → different checker activates (invalid input first); axe at 1440 and 390 in EN and UR (5 screens + quick view + setup: **0 violations**); 320 px at 200 % EN and UR (matrix is a list, no sideways scroll, nothing clipped); dark + high contrast (Urdu, 390): 0 violations; keyboard walk on a phone (nothing hidden under the header or bottom bar).

## Firefox and WebKit smoke (targeted, my spec only, `--workers=1`)
`tests/smoke/e2.smoke.spec.ts` — 3 tests × 2 engines: **6/6 pass**.

## Evidence
`tests/evidence/gatee2.evidence.spec.ts` — 6 tests, **6/6 pass**; 50 PNGs in `screenshots/`, every width matching its name (`png-widths`).

## Complete runs (lock, AC)
See the hand-off: the complete Chromium run (all e2e + gatee2 evidence) and the full Firefox + WebKit smoke are recorded there with totals and duration.
