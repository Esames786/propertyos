# Gate E.7: Accounting and banking (Agent D report, Wave 1, provisional)

> The coordinator wrote this file from Agent D's hand-off, because the harness does not let subagents write report files. The content is Agent D's. See also [CHECKPOINT.md](CHECKPOINT.md) and [MANUAL_VERIFICATION.md](MANUAL_VERIFICATION.md).

The ledger and the bank import are built, tested and pushed. All 11 screens stay PARTIAL in this wave. The final regression was green:

- Chromium: 553/553
- Firefox + WebKit smoke: 76/76
- axe: 0 violations

## 1. Agent and assignment

Agent D built Gate E.7 (ACC-001…010 and BANK-005) from `373d0cf`, against the accepted base only. It merged no other agent's branch, including Agent A's. All money is fictional.

## 2. Branch and SHAs

- Branch: `feature/gate-e7-ledger-banking`, pushed as a new branch with no force push.
- Agent's final commit: `0cc974a`.
- Commits: `1d7d3ac`, `048abd4`, `581ba02`, `f8ea280`, `0fd924d`, `0cc974a`.
- The commit that adds this report sits on top of `0cc974a` and contains no code.
- The lock was taken at 22:51:38Z and released at 23:43:54Z.

## 3. Screens: 0 BUILT, 11 PARTIAL, 0 PLANNED

Agent D moved its 11 register rows from PLANNED to PARTIAL and filled in their columns. After `register:sync`, this branch's register reads 139 BUILT / 54 PARTIAL / 169 PLANNED. The `register.spec.ts` constants (449 / 362) did not change.

**Would become BUILT once E.0 is integrated**, if the defaults below are accepted:

- ACC-001 chart of accounts
- ACC-002 account workspace
- ACC-003 journal entries
- ACC-004 create journal
- ACC-005 reverse journal
- ACC-006 trial balance
- ACC-008 balance sheet
- ACC-009 accounting periods
- BANK-005 bank import

**Stay PARTIAL until the owner or an adviser decides:**

- **ACC-007 profit and loss** waits on E-15 (revenue recognition). It stays a "management view".
- **ACC-010 posting rules** waits on E-15, E-16, E-17, E-18 and E-33, and on the source slices E.6, E.8 and E.14, which do not exist yet.

The merged report rows RPT-007/008/009 are unchanged.

## 4. Features completed

### Contracts

`packages/contracts/src/ledger.ts`.

### Mock server (`packages/fixtures/src/developer/ledger/`)

- **`engine.ts`:** pure functions. It reuses the society `formatRef`, the C.2 `lineKey`/`newLines`, `fingerprint`, `toPaisa`/`fromPaisa` and the S.1 period helpers. No `society/**` file was copied or edited.
- **`state.ts`:** the versioned section `ledger-e7`.
- **`handlers.ts`:** 30 endpoints under `/ledger/*` and `/bank/imports*`, with checks in the plan §4.2 order.
- **`views.ts`:** read models filtered per reader, including what each reader may see of the bank.
- **`scope.ts`:** module-local entity scope, `seesBank` and bound idempotency, marked "replace with E.0".
- **`samples.ts`:** labelled fictional statement samples.

### Seed data

Larkspur's ledger was entered through the journal path: Saad drafted the entries and Mehreen approved and posted them. It holds:

- "Demo opening balances (fictional)", with no cash line;
- accruals, a reclassification, and a mistaken accrual with its posted reversal, linked both ways;
- one journal awaiting approval and one draft;
- July–September closed;
- chart version 2 plus one draft account;
- 5 proposed posting rules, one with a version 2 effective 1 November 2026;
- one approved earlier statement import.

Nothing comes from invoices, payments or bank lines. Manual journals cannot use cash at bank (1000, 1010) or revenue (4000).

### Pages (`apps/backoffice/src/pages/developer/ledger/`)

- **Shared layout on every screen:**
  - Section navigation, which folds into a disclosure on narrow screens.
  - An entity bar.
  - State badges that never rely on colour alone and never say "paid" or "settled".
  - The Gate B access-outcome gate for people without the permission.
  - A provisional notice.
- **Journals:**
  - A journal drawer opened by `?record=`.
  - A journal form with live totals; disabled buttons say why they are disabled.
  - A reversal preview.
- **Reports:** trial balance, profit and loss, and balance sheet, each stating in words how its totals tie. The tables become lists at 48–56 em.
- **Periods:** close checks, and reopening that needs a second person.
- **Posting rules:**
  - A preview of each rule and drafting of new versions.
  - "Apply" is disabled with the reason, and the server also refuses it (409 `decision_pending`).
- **Bank import:**
  - Load a sample or paste CSV.
  - Each row is validated.
  - Duplicates are found within the file and against earlier imports.
  - A second person approves the import.
  - Approved imports add unmatched statement lines only.

### Idempotency and translations

- `useKeyedCreate` on every step.
- `ledger.json` in EN and UR, with parity checked.

## 5. Unit and API results

- **Typecheck:** clean. It took 527–583 s on the loaded machine.
- **Lint:** clean, including logical CSS and i18n parity (28 namespaces × 11,433 keys).
- **Vectors:** 30 tests in `ledger.test.ts`, from `ledger.vectors.json`. They cover:
  - balanced journals;
  - the trial balance equals the sum of posted lines;
  - profit and loss and the balance sheet tie at three dates;
  - the post-then-reverse scenario;
  - the period lock;
  - posting-rule version chosen by date;
  - idempotent posting keys;
  - import duplicates;
  - a fixed sweep of 60 journals that keeps everything tied.
- **API negative matrix:** 24 tests in `ledger.api.test.ts`. The ledger total is 54/54.
- **Full Vitest, final run: 1,735/1,736.**
  - The one failure is a 5 s timeout in `rentals.integration.test.ts`. That test scans every source file and timed out under load; it passed alone in earlier reruns.
  - Earlier full runs under heavy load gave 1,734/1,736 and 1,732/1,736. All the failures were 5 s timeouts in community, finance, credit-note and rentals tests.
  - Each of those files passes alone (78/78 and 93/93), and none of them touches E.7 code.
- **Constant change:** `role-templates.test.ts` now expects 9 Larkspur roles instead of 6, because of the three new ledger roles. This is the only change to an existing test.

## 6. End-to-end results

**Final complete Chromium run: 553 passed, 0 failed, 43 skipped,** in 47.7 min (3 workers, retries off, on AC).

- It ran every e2e spec plus the gatee7, gatebfinal and gated1 evidence specs. The gateb1, gateb2 and stage15r specs skip by design.
- `tests/e2e/e7-ledger.spec.ts`: 17/17.
- `tests/evidence/gatee7.evidence.spec.ts`: 9/9.

**Firefox + WebKit smoke, every smoke spec: 76/76** in 4.3 min.

- `tests/smoke/e7.smoke.spec.ts`: 6/6.
- The known WebKit intermittent passed.

**Targeted run outside the lock:** `identity.spec.ts:467` failed once with a 27 px overflow under load. It checks reflow on Al-Noor's `/adm/data` page, which E.7 does not touch. Run alone with `--repeat-each=3` it passed 3/3, and it passed in the final run.

## 7. Permission and security tests

These are in `ledger.api.test.ts`. After every refusal the test checks that the stored state is byte-identical.

- **Hidden ids:** unknown and out-of-scope ids answer identically (404) for journals, accounts, entities, periods and imports, on reads and writes.
- **Project scope:** a person scoped to projects reaches no entity's ledger.
- **Other entities:** these use the test-only second entity (E-08).
  - Using another entity's account, cost centre or bank account is refused exactly like an invented id.
  - No list or total includes the other entity.
- **Maker and checker:** the person who made an item cannot also check it (403), even if they hold the approve permission. This applies to:
  - approving and posting journals;
  - chart drafts;
  - reopening a period;
  - approving an import.
- **Closed periods:** a journal or reversal in a closed period is refused (409 `period_closed`).
- **Posted journals:**
  - They cannot be edited or cancelled (409 `journal_posted`).
  - A journal can be reversed once, a reversal cannot itself be reversed, and a journal that is not posted cannot be reversed.
- **Invalid lines:** unbalanced lines, cash-at-bank lines and revenue lines are refused, with every field problem listed.
- **Idempotency:**
  - The same request replays its result.
  - Reusing a key with a different input, person or operation gets 409 `idempotency_key_reused`.
  - Approve, post, reverse and import replay instead of acting twice.
  - A replay after the person has lost scope discloses nothing.
- **Bank boundary:**
  - Saad has no bank permission and gets 403 on `/bank/imports*`.
  - No ledger read or search shows an IBAN, the last four digits, a bank name, a statement line, an import reference or any count derived from them.
  - Mehreen sees the bank account masked, plus counts of unmatched lines.
  - Revoking a permission hides the data at once.
  - Farah and Nadia can read imports, but cannot import or approve, and have no ledger access.
- **Licensing:** Al-Noor and Crescent get `module_not_licensed`; Bilal gets `permission_missing`.
- **Suspension and practice mode:** a suspended organisation can still read its history, but every change is refused. Practice mode changes nothing.
- **In the browser (E2E):** the same rules are covered for the person without bank permission on every screen, for existing roles, and for the maker being blocked.

## 8. Mutation checks

**19 of 20 caught.** Every file was restored byte-identical (SHA-256).

- **Caught:**
  - balance (2);
  - immutability (2);
  - maker and checker (4);
  - entity scope (3);
  - bank visibility (2);
  - period lock (2);
  - idempotency fingerprint and principal;
  - the trial balance counting journals that are not posted;
  - import duplicates against earlier imports.
- **Survivor:** "replay skips the scope re-check" in `replayJournal`. It is an equivalent mutant: `entityOf`/`journalOf` already authorise the replayed record's entity before the key is read, so the mutation changes no behaviour.

## 9. Accessibility

- **axe, final run:** 1,710 scans, 0 violations. Of these, 104 scans are on E.7 screens, also with 0 violations.
  - They cover EN and UR (RTL) at 1440, 768 and 390 px, plus dark mode with high contrast at 390 px in both languages.
- **320 px with 200 % text, EN and UR:** `layoutProblems` finds nothing on all 13 screen states, and the statements become lists.
- **Keyboard:**
  - `focusWalk` finds no hidden or partly hidden focus stops on journals, the journal form or the bank import.
  - Focus rings are visible and pass `ringOf` (the B2 rule).
  - Enter opens a journal and Escape closes it.
- **Horizontal scroll:** none at any tested width.

## 10. Screenshots

There are 92 PNGs in `screenshots/`, and every width matches its file name.

| Set | Contents |
|---|---|
| `a01`–`a14` | Every screen at 1440 and 390 px, in EN and UR |
| `b01`–`b10` | The reference flow, in order (listed below) |
| `c01`–`c05` | Bank import (listed below) |
| `d01`–`d05` | Who sees what |
| `e01`–`e06` | Full-page shots at 320 px with 200 % text (`…-200pct-320-{en,ur}`) |
| `f01`–`f02` | Dark mode with high contrast at 390 px, EN and UR |

The reference flow (`b01`–`b10`):

1. The form out of balance, then balanced.
2. Submitted, and the approval acknowledgement.
3. Posted, and now immutable.
4. The trial balance and balance sheet after posting.
5. The reversal form.
6. The original journal reversed, with links both ways.
7. Profit and loss restored.

The bank import set (`c01`–`c05`):

1. A preview with duplicates and an invalid row.
2. The import waiting for a second person.
3. The effect of approval.
4. The committed unmatched lines.
5. An unverified account refused.

## 11. Open dependencies

### Owner decisions

**E-06: three new fictional Larkspur people and roles.** No existing role or person changed.

| Person | Role | Permissions |
|---|---|---|
| Saad Hameed | `lk_accounts` | `gl.view`, `gl.post`; no bank permission |
| Mehreen Aslam | `lk_controller` | `gl.view`, `gl.post`, `journal.approve`, `period.close`, `bank.view`, `bank.reconcile` |
| Kashan Wasti | `lk_treasury` | `bank.view`, `bank.reconcile` |

**Other decisions:**

- **E-07:** provisional permissions `gl.view`, `gl.post` and `journal.approve`. Chart approval reuses `journal.approve`, and period close reuses `period.close`.
- **E-08:** the second entity is a test-only fixture.
- **Also waiting:** E-15, E-16, E-17, E-18, E-27, E-29, E-33, E-37.

### Unresolved accounting rules

Every assumption the build makes is listed here.

- **U1:** no revenue recognition (E-15).
- **U2:** the chart is illustrative and versioned. Accounts are added by draft and approval, and nothing is deleted once used (E-16).
- **U3:** posting rules are proposals; there is no automatic posting (E-17).
- **U4:** cash at bank is locked for manual lines, so the opening balances carry no cash (E-17, E-18).
- **U5:** statement lines settle nothing and post nothing (E-18).
- **U6:** every manual journal and reversal must be approved and posted by someone other than its maker, with no amount threshold (E-27, D-29).
- **U7:** a reversal is a new journal in an open period, dated on or after the original. Each journal can be reversed once.
- **U8:**
  - The fiscal year starts in July, and the books start in July 2026.
  - There is no year-end close, so the balance sheet's current result is cumulative.
- **U9:**
  - A month closes only after it ends and when it has no unposted journal.
  - Reopening is requested by one person and approved by someone else.
- **U10:** refused postings are not recorded; the state stays byte-identical, unlike S.1.
- **U11:** no future-dated journals.
- **U12:** cost centres are optional and seeded read-only (E-37).
- **U13:** bank imports:
  - Imports are only for verified accounts of the entity.
  - A file naming another account is refused.
  - A transaction is identified by its account, source and bank id.
  - Every import needs approval by a second person.
  - An import with no new row cannot be submitted.
- **U14:** people scoped to projects see no ledger.
- **U15:** the account pairs in the posting rules are illustrative.

### E.0 swap-ins

- `scope.ts` → E.0's `developer/scope.ts` and `idempotency.ts`.
- In `state.ts`, the legal entities, cost centres and bank accounts → E.0's developer state.
- Personas, permissions and routes → E.0's canonical set, plus nav items.
- The period record → shared with the developer cashbook (BANK-007).

### Shared-file touches

All are additive and sit in delimited "Gate E.7 (provisional)" blocks.

- `contracts/src/index.ts`, `permissions.ts`, `access.ts`, `persona.ts`
- `fixtures/src/people.ts`, `role-templates.ts`, `role-templates.test.ts` (the count constant), `handlers.ts` (handler registration)
- `i18n/src/resources.ts`
- `backoffice/src/prototype/routes.tsx` (`...LEDGER_ROUTES`)
- `docs/ui/screen-register.csv` and `register.generated.ts` (its own 11 rows only)

There is no change to nav, quick create, `common`, `status` or `nav.json`.

## 12. Integration readiness

Ready for review, and for the Wave 1 integration once E.0 is accepted. The slice merges as module-local code plus small additive shared hunks.

At hand-off the lock was released, the previews were stopped and the working tree was clean. **STOPPED for review.**
