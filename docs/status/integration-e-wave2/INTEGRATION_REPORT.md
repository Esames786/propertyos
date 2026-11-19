# Gate E Wave 2 combined integration: Wave 1 + E.3 + E.8

Agent 1, Wave 2 integration coordinator. Worktree `D:\laragon2\www\propertyos-int-e-wave2`, branch
`integration/e-wave2`, from the accepted Wave 1 base `integration/e-wave1@8126322` (GPT: "TECHNICAL CHECKPOINT
ACCEPTED for use as an isolated integration base").

**Status:** the final combined Wave 2 review checkpoint. It is pushed for GPT and owner review. Nothing is promoted to
BUILT, no owner policy is activated, and no new permission is granted beyond what GPT reviewed.

- Test outcomes: [test-results.md](test-results.md).
- Manual checklist: [MANUAL_VERIFICATION.md](MANUAL_VERIFICATION.md).
- Owner-policy plan (docs only): [OWNER_POLICY_PLAN.md](OWNER_POLICY_PLAN.md).

Results at a glance (code head `b9fdffa`, every run on AC, with the browser lock held, so the runs were quiet):
- Quiet full Vitest: **2,171 / 2,171**.
- Complete Chromium (every e2e spec and every evidence spec, including e3qa, e3int, gatee8 and intew2; retries off): **883 / 883**.
- Firefox and WebKit smoke: **104 / 104**. axe: **0 violations** in 2,007 scans.
- Normal build: **no test-only principal** (sourcemaps included). Register: **139 / 100 / 123**.
- Mutations: combination seams 9/9 Vitest and 5/5 browser; E.8 50/50; E.3 26/29 Vitest and 4/6 browser, every survivor the same as on E.3's own reviewed branch.
- Five defects were found and fixed during the combination (§5).

## 1. Ancestry

Both candidates come in with `git merge --no-ff`, E.3 first. There is no rebase, no squash and no force push. Each
reviewed SHA stays an ancestor: `74241b0` through `dfd52f8`, and `6ae5e9d` through `7188c74`.

```
* <docs>    Wave 2 combined: report, test results, manual QA, checkpoint, evidence
* b9fdffa   Test-only: the E.3 seam checks the site licence; the combined evidence spec
* 7bc821e   Wave 2 combination: seam regressions; W2-D2 evidence capture; the reference-break check
* 3aa0e47   W2-D4: COM-004 descriptions wrap at 320 px / 200 % (and W2-D3a there)
* 148d135   W2-D3: E.3 draft links (not-found heading; no recent-record visit)
* 88e1b2e   W2-D1: E.8 references wrap only between their segments
*   6190a39 Integrate E.8 payables candidate (integration/e8-wave1-claude @ 7188c74)   parents e7975cf 7188c74
*   e7975cf Integrate E.3 pricing candidate (integration/e3-wave1-claude @ dfd52f8)    parents e58134a dfd52f8
* e58134a   Owner-policy follow-up plan (docs only, Phase A)
* 8126322   Wave 1 accepted base
```

## 2. Seam pre-flight and canonical rules

Phase A ran dry merges with `git merge-tree`, with no checkout and no branch:
- `74241b0` onto `8126322`: 5 conflicting files.
- `6ae5e9d` onto `8126322`: 11 conflicting files.
- No collisions between E.3, E.8 and the base in contract export names, permission names, i18n namespaces, route
  addresses, API path prefixes or principal ids.

The canonical rules went to the coordinator as one message, which relayed them as binding. Both candidates followed
them, with two deviations the coordinator accepted:
- **E.3's header-project rule (coordinator ruling: unchanged).** For a draft or unit named by id, E.3 hides it when
  the header project differs. E.2's named-id rule ignores the header. This stays an **open consistency item for GPT**
  (§9). It is not an owner decision.
- **E.3's test principals.** A build-time module swap (`vite.config.ts` alias: `./prototype/build-personas` →
  `.e2e.ts` only with `PROPERTYOS_E2E_PRINCIPALS=1`) replaces the `__E2E_TEST_PRINCIPALS__` define. The checks are
  `node scripts/check-test-principals.mjs` (0 hits in a normal build, sourcemaps included) and the same with
  `--expect-present` for the test build.

## 3. The combination's conflicts

Merging E.3 (`e7975cf`) was clean.

Merging E.8 (`6190a39`) gave 9 conflicts, all of them the two candidates' delimited blocks meeting. Each keeps both
blocks, **E.3's first, then E.8's**, with nothing in either block changed.

| File | Conflict | Resolution |
|---|---|---|
| `apps/backoffice/src/prototype/routes.developer.tsx` | imports; `DEVELOPER_AREAS` entries | both; areas: crm, projects, inventory, ledger, workspace, documents, **pricing, payables** |
| `packages/contracts/src/permissions.ts` | the blocks after `end Gate E.0` | both, E.3 (`pricing.manage`) then E.8 (7) |
| `packages/contracts/src/access.ts` | `PERMISSION_MODULE` blocks | both; `pricing.manage` → inventory, E.8's 7 → payables |
| `packages/contracts/src/index.ts` | exports | `./pricing`, then `./payables` |
| `packages/fixtures/src/developer/handlers.ts` | imports; `DEVELOPER_AREA_HANDLERS` | both; `…, E13_HANDLERS, PRICING_HANDLERS, PAYABLES_HANDLERS` |
| `packages/fixtures/src/developer/registry.integration.test.ts` | the pinned registry | one assertion pins both, in that order |
| `packages/i18n/src/resources.ts` | imports, namespace list, EN, UR | both (`pricing`, `payables`; 33 namespaces) |
| `packages/i18n/locales/{en,ur}-PK/workspace.json` | permission labels | both (JSON comma added) |

`screen-register.csv` and `register.generated.ts` auto-merged, because the rows are disjoint: **139 BUILT / 100
PARTIAL / 123 PLANNED**. `npm run register:sync` changes nothing.

## 4. The canonical set after the combination

| Concern | After the combination |
|---|---|
| Permissions | Unique. E.3 `pricing.manage` (inventory); E.8 `supplier.manage`, `supplier_bill.approve`, `supplier_payment.approve`, `expense.view`, `expense.approve`, `budget.manage`, `budget.approve` (payables). EN/UR labels for all 8 |
| Grants | No role or persona holds `pricing.manage` (E.3 is draft-only; test-only principals hold it). E.8's `GATE_E8_EXTRA` gives the reviewed payables pairs to the Wave 1 accounts officer (Faiza, maker) and finance controller (Zubair, checker), exactly as GPT reviewed: **D-INT-07** |
| Roster | Base people unchanged. **New:** Rehan Saleem, `lsp_budget_holder` / `usr_lsp_0021`, role `budget_holder`, Larkspur Heights only. Principals unique (seam test). E.3's E3QA and E.8's test principals are never demo identities |
| Routes | `DEVELOPER_AREAS`: 8 areas, each once (seam test). Every E.3 (7) and E.8 (17) screen uses `DevScreen refusal="outcome"`. **E.8 is DEV only** (seam test and browser test) |
| API | `DEVELOPER_AREA_HANDLERS`: 6 entries, each once. No duplicate method + pattern in the whole mock API (registry test) |
| Idempotency | E.0's `idempotency.ts` for both. E.3 goes through the adapter `pricing/draft-replay.ts`; its stricter key checks stay. Base fix `c156134` (Agent 2): `replayOf` reads own entries only, and `remember` defines an own property |
| E.13 record registry | `PROVIDERS = DOCUMENT, CRM, INVENTORY, LEDGER, PAYABLES, CORE`. One owner per kind (seam test over 17 samples). E.8 kinds: `sup_` supplier, `sbl_` bill, `spi_` payment instruction, `exp_` expense, `bud_` budget, with tasks (bill, payment, expense and budget approval) and projected activity. **E.3 drafts are not E.13 records**: `PRICING_DRAFT_ID_PREFIXES` (`pad_ cdr_ prp_ pcd_ pt_`); no provider owns them and the shell posts no visit for them (W2-D3b) |
| Bank-data boundary | E.8 uses E.7's `seesBank` over the whole legal entity (seam test: no bank detail for Faiza without `bank.view`) |
| i18n | 33 namespaces, 2 locales, parity OK |
| Register | 139 / 100 / 123. All 7 E.3 and 17 E.8 screens are PARTIAL. Nothing is BUILT |

## 5. Defects found and fixed during the combination

| # | Finding | Fix | Test | Mutant |
|---|---|---|---|---|
| W2-D1 | **The coordinator's finding; no test caught it.** At 320 px / 200 % the E.8 payment drawer's header broke its reference mid-segment ("LSP-PV-2026-000" / "1"), EN and UR. E.8's `Ref` used `[overflow-wrap:anywhere]` | `88e1b2e`: `Ref` renders E.13's `RefSegments` (wraps only after a separator), which fixes all 30 E.8 references | `int-ew2` W2-D1, which runs the new `brokenReferences` over every E.8 drawer and record header and every E.3 drawer and editor header, at 320 px / 200 % in EN and UR; the gatee8 320 px screens too | W2-B1 |
| W2-D2 | **The coordinator's finding.** The `e8-60-drawer-balance-200pct-320-*` evidence was an element shot taller than the visible drawer, so it pulled in the drawer header and the page behind it | `7bc821e`: viewport shots of the open drawer (its header, then scrolled to the balance, then the balance's end when taller) | the gatee8 evidence spec | — |
| W2-D3a | (Agent 2) A draft link that is not found still read "Revise draft" | `148d135`, `3aa0e47`: "Draft not available" on COM-001/003/004/005 (EN/UR key) | `int-ew2` W2-D3 | W2-B3 |
| W2-D3b | (Agent 2) The shell posted `/workspace/recents` for E.3 drafts; the server refused it, and nothing was written | `148d135`: no visit is posted for `PRICING_DRAFT_ID_PREFIXES`; real records are still recorded | `int-ew2` W2-D3 (the transport watched across reloads); seam test "E.3 drafts have no owner" | W2-B2, W2-B5 |
| W2-D4 | **Found by the combination's own 320 px check.** COM-004's fee and discount descriptions scrolled sideways in a one-line field: E.3's own default "Illustrative discount" was 282 px of text in a 226 px field | `3aa0e47`: a wrapping description field (sized to its content where the browser can, else two lines; line breaks become spaces) | `int-ew2` W2-D1 (E.3) | W2-B4 |

Why the earlier checks missed W2-D1: `layoutProblems`' broken-word check ignores words wider than three quarters of
the column. The new `brokenReferences` (`tests/support/layout.ts`) checks that no run of letters or digits inside a
left-to-right reference spans two lines.

## 6. Connected seam regressions (GPT's list)

| GPT asks | Where |
|---|---|
| Principals, roles, permissions, `DEVELOPER_AREAS` and i18n namespaces unique across the base, E.3 and E.8 | `packages/fixtures/src/developer/wave2-seams.test.ts` (6 tests); `registry.integration.test.ts` |
| E.8 records in E.13 beside CRM, inventory and ledger, with cross-entity isolation, revocation and no oracle | `wave2-seams` "one owner", "one search across areas", "an E.8 record: hidden = never issued, revocation, another organisation"; E.8's own `integration.test.ts` (second legal entity) |
| E.3 pricing linked to E.2 inventory units | `wave2-seams` "E.3 lists exactly the units E.2 lets the reader see" (same units, same 404, revocation); E.3's `405129b` (links land on INV-002) |
| E.8 payments respect E.7's bank-data boundary | `wave2-seams` "Faiza sees a supplier's bank account only while she holds bank.view"; E.8's own boundary tests |
| No test-only principal in the combined normal build, sourcemaps included | `scripts/check-test-principals.mjs`: 0 hits on the normal build; `--expect-present` on the test build (test-results.md) |
| E.8 DEV only | `wave2-seams` (no other edition declared) and `int-ew2` (Riverbend gets the register's page) |

## 7. Not changed (by ruling or out of scope)

- E.3's header-project rule (coordinator ruling). It is listed in §9.
- `dev-screen.tsx`, the base's roles and the base's permissions. No grant was widened.
- Agent 2's and Agent 3's branches and worktrees.
- E.4 (GPT's), E.5, `main`, the VPS, PRs and comments.

## 8. Register

`npm run register:sync`: **449 rows, 362 distinct screens: 139 BUILT, 100 PARTIAL, 123 PLANNED**, the expected
combined numbers (base 139 / 76 / 147; E.3 +7 PARTIAL; E.8 +17 PARTIAL). No screen is promoted to BUILT.

## 9. Open (none activated)

| Item | State |
|---|---|
| **D-INT-03** (E-05) | Legacy CRM routes stay whole-project; GPT's recommendation is not approved (OWNER_POLICY_PLAN.md) |
| **D-INT-05** | Who sees a hold's holder name; not decided |
| **D-INT-06** | Lead-linked documents for records staff; the current default matches GPT's recommendation, and nothing ships under A |
| **D-INT-07** (E-06) | E.8's payables grants to Faiza and Zubair as reviewed, against dedicated payables personas |
| **E-06, E-07** | Provisional roles and conservative permission names (E.3's `pricing.manage`, E.8's seven) |
| **E-17, E-18** | E.8 posting rules (posting stays planned) and settlement evidence (nothing is settled) |
| **E-30** | E.3 pricing-policy and commercial maker-checker decisions: draft-only; no policy active |
| **Edition licensing** | E.8 is DEV only until approved |
| **E.3 header-rule consistency** (for GPT, not an owner decision) | E.3 hides a draft or unit named by id when the header project differs; E.2's named-id rule ignores the header |
| Wave 1 items still open | HOME-005 activity providers for E.1/E.2/E.7; two INV-002 quick-view components; Project 360's empty `documents` field; manual screen-reader, device and native Urdu checks; the finance policies |
