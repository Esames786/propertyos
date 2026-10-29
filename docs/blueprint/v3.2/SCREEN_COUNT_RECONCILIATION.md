# V3.2 proposal: screen-count reconciliation on the committed C.2 register (revision 4)

**Status:** documentation only. The delta is **proposed, not adopted**.
- The live register, the C.2 branch, `main` and all code are unchanged.
- Delta rows are adopted only when their milestone is separately authorised (D-43).
- Counts are register rows and screens. They are not built screens.

**Baseline:** `docs/ui/screen-register.csv` at commit `e2ccd89`, the Gate C.2 closure that GPT approved on 2026-10-29 (Issue #4).

## 1. Result

| Measure | Expected (owner brief) | Verified | Agrees? |
|---|---:|---:|:-:|
| Baseline register rows | 396 | **396** | yes |
| Baseline distinct canonical screens | 337 | **337** | yes |
| Delta operations: revision 3 replayed on `e2ccd89` | 108 | **108** | yes |
| Delta operations: revision 4 (final) | — | **112** | +4 (see below) |
| New canonical screens (ADD) | 28 | **28** | yes |
| New tabs, drawers and states (ADD-STATE) | 31 | **31** | yes |
| Changes to existing rows (MODIFY) | 49 | **53** | +4 (see below) |
| Register rows after the delta | 455 | **455** | yes |
| Distinct screens after the delta | 365 | **365** | yes |
| … active (planned work) | 362 | **362** | yes |
| … parked SOS pages (not authorised work) | 3 | **3** | yes |

**Why 112 operations and 53 modifications instead of 108 and 49**
- Reconciling the delta with what C.2 actually built needed **four more MODIFY rows**: BILL-012, BANK-004, BILL-016 and BILL-017 (§6, F-3).
- These rows change no counts, because MODIFY rows neither add rows nor change canonical status.
- Without them, the revision-3 delta replays cleanly on `e2ccd89` with exactly the expected 108 operations (§3).

## 2. Sources and method

**Baseline integrity**
- The register was read twice, without touching the development worktree:
  - from git (`git show e2ccd89:docs/ui/screen-register.csv`);
  - from GitHub at the full commit SHA (`raw.githubusercontent.com/…/e2ccd89750e6…/docs/ui/screen-register.csv`).
- The two copies are byte-identical: SHA-256 `a7fcd7e4df904dcffae054f9a7e136e91f0fad4914fe4fa20f3b1800211f3b67`.
- **The register file on this docs branch is not the baseline.** This branch was cut from C.1 (`079e940`), so its own `docs/ui/screen-register.csv` is still the C.1 copy (394 rows; SHA-256 `e290897d…`). It is deliberately left untouched: no C.2 application or register change is merged or cherry-picked here.
- **Counting rule:** a row is a distinct screen when `canonical_id = screen_id`. This is the rule of `tests/e2e/register.spec.ts` at `e2ccd89`, which asserts 396 rows and 337 canonical screens.

**Two independent programs**
1. **The generator** replays revisions 1 to 4 of the delta against the baseline and writes `SCREEN_REGISTER_DELTA.csv`. For every MODIFY row it rebuilds `changed_fields` from the committed `e2ccd89` values.
2. **The verifier** shares no code with the generator. It:
   - parses both CSVs with a strict RFC 4180 parser;
   - applies the delta to a copy of the baseline;
   - recounts everything;
   - checks the result against the committed contracts (`permissions.ts`, `access.ts`, `catalog.ts` at `e2ccd89`), this package's module matrix (§2, §3, §5) and the execution plan's milestone lists.

**The programs are not committed.** They are working tools, and this branch carries documentation only. Every rule they apply is listed in §7, so anyone can reproduce the counts from the two CSV files.

**The verifier itself was tested.** Eight defects were planted in copies of the delta, and it reported every one:
- a planned screen marked BUILT;
- a duplicate ID;
- PORTAL-042 put back on `core`;
- a state whose parent is a state;
- an unknown linked screen;
- a stale old value in `changed_fields`;
- a parked SOS page moved into D.3;
- an unknown permission.

## 3. The baseline: what C.2 changed

| Measure | C.1 (`079e940`) | C.2 (`d5e599d`) | C.2 closure (`e2ccd89`) |
|---|---:|---:|---:|
| Rows | 394 | 396 | **396** |
| Distinct screens | 335 | 337 | **337** |
| BUILT / PARTIAL / PLANNED (distinct) | 62 / 18 / 255 | 67 / 30 / 240 | **67 / 30 / 240** |

**C.1 → C.2: 2 new rows and 26 changed rows**
- **New:** BILL-016 (billing controls) and BILL-017 (payer changes), both BUILT, gate C.
- **PLANNED → PARTIAL (14):** COL-001, COL-004, COL-005, FIN-005, FIN-006, FIN-007, FIN-008, FIN-009, FIN-011, BANK-003, BANK-004, PORTAL-005, PORTAL-028, PORTAL-029.
- **PARTIAL → BUILT (2):** BILL-010, BILL-012.
- **PLANNED → BUILT (1):** GUIDE-009.
- **Notes or tests only (9):** FIN-002, FIN-003, PORTAL-001, PORTAL-004, PORTAL-007, PORTAL-008, PORTAL-009, PORTAL-010, SITE-001.

**`d5e599d` → `e2ccd89` (the closure):** notes only, on FIN-009, BANK-003 and BANK-004. No count changes.

**Revision 3 replayed on `e2ccd89`**
- It produces **108 operations** (28 ADD, 31 ADD-STATE, 49 MODIFY, 0 SUPERSEDE).
- The output is **byte-identical** to the same replay on C.1.
- It differs from the committed `eba5cec` CSV in one row only: PORTAL-042, whose correction had begun.
- So C.2 changed nothing the delta depends on:
  - no MODIFY row's old value changed;
  - none of the 59 new IDs collides with BILL-016 or BILL-017;
  - no target disappeared.
- The work in revision 4 is therefore reconciliation, not repair: the guard fixes (§6) and the overlaps with what C.2 built.

## 4. Delta operations (revision 4)

| Action | Count | Change from revision 3 | Counts as a screen? |
|---|---:|---|---|
| ADD (new canonical screen) | 28 | — | Yes |
| ADD-STATE (tab, drawer, overlay, detail state) | 31 | — | No (a state of its parent) |
| MODIFY (existing row) | 53 | +4: BILL-012, BANK-004, BILL-016, BILL-017 | No change |
| SUPERSEDE | 0 | — | — |
| **Total** | **112** | +4 | |

**How to read a MODIFY row**
- `changed_fields` is authoritative. It lists every field the row would change, as `field: old -> new`, against `e2ccd89`.
- A value starting with "adds" is an addition to the current value.
- `notes` holds the rationale, unless `changed_fields` names `notes`.

## 5. Counts after the delta

### 5.1 Totals
- **Rows:** 396 + 28 + 31 = **455**.
- **Distinct:** 337 + 28 = **365**, of which 362 are active and 3 are parked (SOS-001, SOS-002, SOS-003).
- **Status of distinct screens:** BUILT 67, PARTIAL 30, PLANNED 268.
  - Only change: +28 PLANNED.
  - No existing status changes. No planned screen is marked built.

### 5.2 By gate

| Gate family | `e2ccd89` | After the delta | Change |
|---|---:|---:|---|
| Built, B and C (including "built; C extends") | 91 | 91 | — The C.2 screens that S.1 extends stay here (§5.4) |
| D | 33 | **49** | +12 new; +4 brought forward (ADM-003, PARK-005 and NOT-003 from G; DOC-001 from E) |
| S (new) | 0 | **40** + 3 parked | +13 new active; +3 new parked; +27 from E |
| E | 145 | **117** | −28 (27 to S, 1 to D) |
| F | 18 | 18 | — |
| G | 50 | **47** | −3 (to D) |
| **Total** | **337** | **365** | +28 |

### 5.3 By milestone

| Milestone | New | Existing Gate D | Brought forward | Distinct |
|---|---:|---:|---:|---:|
| D.1 Identity, personalisation, onboarding | 3 | 11 | 1 | **15** |
| S.1 Society finance and governance | 4 | — | 11 | **15** |
| D.2 Resident operations and official notices | 2 | 22 | 2 | **26** |
| D.3 Community engagement | 7 | — | 1 | **8** |
| S.2 Society staff and optional payroll | 1 | — | 16 | **17** |
| S.3 Rentals | 8 | — | — | **8** |
| S.4 SOS (**parked**, not authorised) | 3 | — | — | **3** |
| **Total** | **28** | **33** | **31** | **92** |

Gate D = 15 + 26 + 8 = 49. Active S = 15 + 17 + 8 = 40.
- The 24 existing rows still labelled `D` are assigned to D.1 or D.2 by the plan. None is left without a slice. They keep the label `D` until their slice starts.

### 5.4 Built screens a milestone extends (already counted; not in the milestone totals)

| Milestone | Screens | What the milestone adds |
|---|---|---|
| D.1 | PORTAL-027 (no delta row) and C.2's first-run text-size step | The full personalisation hub, built on C.2's resident text size. PORTAL-030, which reuses the step, is a planned D.1 screen and is counted in D.1 |
| S.1 | FIN-007, FIN-011, COL-005, BANK-004, BILL-012, BILL-016, BILL-017, PORTAL-004 | Cheques and cash witnessing; advance payments; print notices and reminders; settlement matching for new subjects; new document kinds; transfer-sourced payer changes |
| S.3 | PORTAL-004 | Rent bills as a separate account |

## 6. Findings and how revision 4 resolves them

| # | Finding | Resolution | Rows |
|---|---|---|---|
| F-1 | **PORTAL-042 guard (GPT).** `core` + `portal.use` skips the `resident_portal` entitlement, because `decide()` checks only the declared module's grant | `resident_portal` + `portal.use`. Recipient link, site grant and audience are re-checked when the panel is read and when a notification opens. The notification service stays `core`. Negative tests: `resident_portal` revoked, another site's notice, moved out, withdrawn, deep link outside the audience. PORTAL-023 and PORTAL-043 carry the same guard and tests | PORTAL-042, PORTAL-043, PORTAL-023 |
| F-2 | **The same defect in 10 more resident rows.** Their entry guard named a service module (`core`, `community_chat`, `maintenance`, `rentals`, `community_hub`, `visitors`, `safety`) with `portal.use`. Every resident row in the committed register uses `resident_portal` + `portal.use` | **Rule R**, as in the committed `portal-handlers.ts`. Entry is `requires('resident_portal', 'portal.use')`; then the service module is authorised for the same site and flat. The service grant moves to `feature_grant`. PORTAL-036, already correct, records that each hub tab also needs `community_hub` for the resident's site | PORTAL-031, -032, -033 (parked), -034, -035, -037, -038, -039, -040, -041; PORTAL-036 (note) |
| F-3 | **Overlaps with what C.2 built** | Each V3.2 row now builds on the C.2 screen instead of restating it (table below) | 20 rows |
| F-4 | **D-48's "Simulated bank confirmation" contradicts the C.2 closure ruling.** The ruling allows no settlement without independent bank evidence; C.2 demonstrates evidence with fictional statements imported for a verified account | No settlement without a statement line. Demo evidence is a labelled fictional statement imported for the verified account and matched by C.2's rules. D-48 is revised and stays conditional | BANK-006, FIN-013, RNT-001/002/005/006; D-48; ERD §2.8 |
| F-5 | **Permission names** | FIN-013 used `payment.receive.office`, which is not in the contract: now `payment.receive` with the feature `receivables.office_collections`, as C.2 built it. The proposed `settlement.confirm` duplicated C.2's `bank.reconcile`: withdrawn. The scope document's `hub.manage` was never defined: removed | FIN-013, FIN-007; matrix §5 |
| F-6 | **No-op modifications** | OWN-003 and OWN-004 listed `tenant_edition: DEV+COMM -> DEV+COMM`: removed | OWN-003, OWN-004 |
| F-7 | Punctuation | A missing full stop in the notes | PORTAL-040 |

**F-3 in detail: C.2 overlaps**

| C.2 screen (status) | V3.2 rows | Reconciliation |
|---|---|---|
| FIN-007 office payment (PARTIAL) | FIN-007, FIN-013 | Single office cash is built: method rules, maximum, counter, receipt at once. S.1 adds cheques and decides through D-46 whether single cash also needs a second-person count. The batch respects the per-site maximum |
| BILL-012 payment method rules (BUILT) | **new MODIFY** | Society cheque rules move from "Gate E" to S.1. Status stays BUILT for its C.2 scope and is reassessed at adoption |
| BANK-003/004 statement import and reconciliation (PARTIAL) | **new MODIFY** BANK-004; BANK-002, BANK-006, FIN-013 | S.1 settles cheques, deposits and transfer legs with C.2's matching: account-bound lines, full match or a second-person exception, identity per (source, account, bank id) |
| BILL-010 collection destinations (BUILT) | BANK-001 | A receiving bank account is the same verified beneficiary record (maker-checker, cooling-off), never a copy |
| C.2 proof states (FIN-008/009) | COL-007, BANK-008 | Reminders are skipped for every pending state, including `awaiting_bank_evidence` and `exception_pending`. Month close lists them |
| C.2 payment verification kinds | BANK-007 | `bank_matched` and `exception_approved` count on the bank account; `counter` cash counts on the cash account until deposited |
| FIN-011 unapplied credit (PARTIAL) | FIN-011, PORTAL-004 | Credit display exists since C.2 (home total, receipt, history). S.1 adds advance payments, verified under C.2's rules |
| BILL-017 payer changes (BUILT) | **new MODIFY** BILL-017; OWN-004 | An approved transfer raises an ordinary payer change in this queue, never a second liability path |
| BILL-016 billing controls (BUILT) | **new MODIFY** BILL-016; OWN-006, BANK-009, APR-004 | New numbered documents use the issuing entity's patterns. Billing-run posting roles stay here, not in APR-004 |
| Dashboard approvals (HOME-001) | APR-001 | The S.1 inbox also lists the C.1/C.2 approval kinds (billing runs, exemptions, opening balances, payer changes, collection accounts, payment exceptions) with their own rules |
| Resident text size (first-run step and setting) | PORTAL-030 | D.1 reuses C.2's step, so a resident is never asked twice. PORTAL-030 stays PLANNED (the `/welcome` route is not built) |

## 7. Validation of the complete register after the delta

| Check | Rule applied | Result |
|---|---|---|
| CSV syntax | Strict RFC 4180; every row has the header's 32 fields (4 delta + 28 register) | Pass. 112 rows, UTF-8 without BOM |
| Duplicate IDs | Baseline 396, delta 112, merged 455 | None |
| New-ID collisions | 59 new IDs vs 396 committed | None |
| MODIFY integrity | Target exists; every changed field listed against its `e2ccd89` value; no no-op; no status or canonical change; a built gate keeps its built part first | Pass (after F-6) |
| Canonical counting | ADD: canonical, own route, page/workspace/wizard. ADD-STATE: parent exists and is canonical (no chains) | Pass. Overlays without a route are states (SOS-004, PORTAL-033, GLOBAL-015, PORTAL-040) |
| BUILT / PARTIAL / PLANNED | All 59 new rows PLANNED; no delta row sets BUILT or PARTIAL | Pass |
| Module dependencies | Every module is one of the 27 committed or the 4 proposed. Matrix §2 checked against `catalog.ts` (scope, requires, editions) | Pass. Only the intended `hr`/`payroll` edition change differs. The integrates column was corrected for `communications` and `reports` |
| Site entitlements | A new row of a site-scoped module (committed `SITE_SCOPED_MODULES` or a new site module) has a site, unit or verified-link scope | Pass |
| Feature permissions | Every feature key is committed or in matrix §3. Every permission the delta sets is committed (59) or in matrix §5 | Pass (after F-5) |
| Role visibility (rule R) | Every resident-app row the delta adds or changes is `resident_portal` + `portal.use` | Pass (after F-1, F-2). One pre-existing exception: GUIDE-005, the resident tour (`core`, signed in), unchanged |
| Navigation and relationships | Every screen ID named in a delta row exists after the delta. New canonical routes are unique | Pass. 0 unknown references. Shared routes are only the existing `?tab=` families (SITE-002/BILL-010/011/012/016; HQ wizard and Tenant 360) |
| English/Urdu, accessibility, personalisation | Each new canonical row requires EN/UR, 1440/768/390, 320 reflow, 200 % text, keyboard path and axe at its gate, plus a manual screen-reader checklist. States are covered by their parent | Pass, 28/28 |
| Milestones | The register's assignment equals the plan's lists; states follow their parent or extend a built parent | Pass. No unassigned Gate D row |
| Parked SOS | Exactly 6 parked rows (3 pages, 3 states), gate S.4 (PARKED), in no D or S milestone | Pass |

## 8. Pre-existing register observations (not changed here)

These belong to the live register, which this branch may not change. They are listed for the owner to schedule.
1. **C.2's resident text size is not recorded in the register.** PORTAL-027 and PORTAL-030 say nothing about the first-run step and the 100–200 % setting that C.2 built. A notes-only sync is proposed when D.1 is adopted, or earlier together with GPT's minor `MANUAL_VERIFICATION.md` D3 wording cleanup on the feature branch.
2. **Register permission vocabulary not yet in the contract:** `maintenance.view`, `approval.view`, `gl.view`, `communications.view`, `document.view`, `visitors.view`, `parking.view` and `ownership.view`, plus FIN-007's `payment.receive.office`.
   - The contract catalogue is illustrative.
   - Each milestone adds its permissions when it is authorised; Gate H fixes the final set.
3. **SITE-006 (Unit 360)** is listed with `unit.view`, which `PERMISSION_MODULE` assigns to `inventory`, a developer module. The register text and the society contract differ; the built screen is unaffected.
4. **Overlay counting (D-45).** GLOBAL-013 and the GUIDE tours are still counted as screens in the live register, while V3.2 counts such overlays as states. This is unchanged.

## 9. Not changed

- The live register (`docs/ui/screen-register.csv`) on the C.2 branch.
- `main` (`d9a420c`).
- The C.2 branch (`e2ccd89`).
- All code.
- Nothing is adopted, and nothing is marked built.
