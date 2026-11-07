# Issue #21 (credit-note idempotency): checkpoint and report

Branch `fix/credit-note-idempotency` from `682216f` (UX B1 + Issue #19 closure, accepted; parent chain
`6b1d7f9` → `04b6fde` → `474e4ae`). Worktree `D:\laragon2\www\propertyos-cn-idem`, `E2E_PORT_OFFSET=1600`
(office 6773, resident 6774, HQ 6775). Nothing merged into it. Scratch scripts and logs in `test-results-cn/`
(git-ignored): `scratch/build.sh` (stops my previews, builds), `scratch/preview.sh` (serves both loopbacks),
`scratch/serve-check.sh` (6 listeners; served chunk = dist chunk), `scratch/power.ps1`, `scratch/final21.sh`
(lock + combined e2e + smoke), `scratch/mutate21.cjs`, `scratch/drawer-mutants.sh`.

The harness refused new report files in this folder (`REPORT.md`), so the report, the test results and
the manual-verification list are sections of this file: §R1-§R13 below (§R5 results, §R11 manual
verification, §R12 every interim failure).

## Status
- [x] Issue #21, Issue #19, B1 report §11 and the S.1 hotfix report read; `npm ci` (exit 0).
- [x] Reproduced on `682216f` (§R1).
- [x] Server, drawer, strings (§R2, §R3).
- [x] Tests: API 11 (`credit-note-idempotency.api.test.ts`), hook 4 (`useKeyedCreate.test.tsx`), e2e 4
      (`tests/e2e/cn-idempotency.spec.ts`), evidence 2 / 16 screenshots (`tests/evidence/cnidem.evidence.spec.ts`),
      smoke 1 × Firefox/WebKit (`tests/smoke/cnidem.smoke.spec.ts`). One existing line changed (§R8).
- [x] Mutation checks: round 1 35/37 (2 predicted equivalents survived), white-box test (3d) added, both then
      caught; round 2 (final) 37/37; drawer mutants W1-W4 4/4 (§R6).
- [x] Static on final sources: tsc 0, lint 0 (10,323 keys, parity OK), Vitest 1,555/1,555 (57 files).
- [x] Final browser regression (lock 00:12:49Z-00:48:45Z, build 00:12Z on 6773-6775, both loopbacks): Chromium
      415/415, axe 1,476 scans 0 violations, Firefox 26/26, WebKit 25/26 (known S.2a intermittent; 8/20 on
      `--repeat-each=20`) (§R5). Lock released; previews stopped.
- [x] Committed and pushed `fix/credit-note-idempotency` (one commit on `682216f`); **STOPPED for GPT and owner
      review.** Next steps only after review.

## Resume notes
- Never run other gates' evidence specs; restore `docs/status/gate-*`, `docs/status/ux-b1`, `docs/status/s1-hotfix`
  if a run touches them (final21.sh does).
- Rebuild only through `scratch/build.sh` (a running preview locks `dist`); never build while `mutate21.cjs` runs
  (it edits sources temporarily).

## §R1 Reproduction on `682216f` (before the change)

A temporary Vitest test (deleted, not committed; `test-results-cn/repro21.log`): A-101's November bill after
3,000 office cash (maintenance 1,000.00 open). `POST /billing/invoices/:id/credit-notes`
`{reason, lines: [{maintenance, "200.00"}]}` sent twice with the request key `cn-same-key` issued
**`ANR-CN-0001` and `ANR-CN-0002`** (`crn_anr_0001`, `crn_anr_0002`), 200.00 each; the same body twice with the
key in the body issued `ANR-CN-0003` and `ANR-CN-0004`. Four notes and four `creditNoteIssued` audit entries
from two keys (open 200.00, outstanding 1,400.00). Issue #19's cap held; one intended adjustment, retried,
was booked twice.

## §R2 Design: server (`packages/fixtures/src/society/handlers.ts`, credit-note POST)

Reuses the accepted Issue #18 helpers `replayOf` / `remember` (`society/finance/common.ts`, Issue #16's
pattern) with a new operation `credit_note.create` in `FinanceIdemOp`; credit notes share the society's
finance key map with the six S.1 creates (a key used by one is refused by the others). Payroll (Issue #16)
keeps its own map, as before.

**Bound** (`{ op, principal, target, fingerprint, recordId }`): operation `credit_note.create`; the caller's
principal; `target` = `tenant | legal entity | site | billing account | invoice id` (`creditNoteTarget`); the
fingerprint (FNV-1a of the JSON, as Issue #18) of the normalised request (`creditNoteRequest`).

**Normalisation** (what the record is made of, nothing else):
- reason as stored: trimmed, words and case kept;
- each entry `[lineId, amount]`, money as the handler reads it: commas/spaces removed, a valid amount as
  integer paisa (`"600"`, `"600.0"`, `"600.00"`, `600` are one amount); `""`, `"0"`, `"0.00"` all mean "not
  credited" (exactly what the handler skips);
- entries **sorted**. Justification: a credit note is a set of per-line credits; Issue #19 allows each line
  at most once in an accepted request, and nothing stored or checked depends on order (each line's
  `creditableOf` cap, the total, the invoice's credited/outstanding, the statement, the audit's `flats` set).
  The stored note keeps the first request's order;
- a blank entry stays an entry (leaving it out is another request; a true retry is byte-identical anyway);
- a malformed entry or a non-list `lines` is kept as sent (never equals an accepted request);
- other body fields (the key, unknown fields) are not in the record and not in the fingerprint.

**Order** (each step only if the previous passed):
1. [unchanged] route gate: receivables module, `credit_note.create`, suspension class `operational`;
2. [unchanged] `siteOf` (site licensed, in scope), the invoice (else the same 404 as never issued),
   `authorize(credit_note.create)` on the invoice record;
3. **new** the key: none or never bound → go on. Bound to exactly this op, person, target, fingerprint → the
   credit note it issued, read again through this invoice (`id`, `invoiceId`, `billingAccountId` must all
   match, else 404), nothing written (no number, audit, binding or save). Bound to anything else, or a bare id
   from before Issue #18 → `409 idempotency_key_reused` (`finance:problems.idempotencyKeyReused`), one answer
   naming nothing, nothing changed;
4. [unchanged] Issue #19 body checks and the `creditableOf` cap (OD-1); any error → 422, nothing changed,
   **key not bound, no number used**;
5. id, number (`nextRef`), record, audit entry, **key binding**, one save.

**No key**: steps 1, 2, 4, 5 exactly as before (a repeat that fits is a separate numbered note; content never
merges two decisions; past the cap Issue #19 refuses).

**Replay after the open amount changed** (decision): the replay is the earlier result, not a new decision, so
the cap is not re-checked. Same key + identical request + same authorised person → the original note whether
less is open now (it took everything) or more (a payment reversed). Anybody else with the key → 409; a new
request (other key or none) → checked against what is open now.

**Revoked access never replays**: authority runs before the key on every request; the refusal equals the one
for no key, a fresh key, an invoice never issued and a stranger with the same access.

## §R3 Design: the credit-note drawer (`apps/backoffice/src/pages/society/billing/InvoiceWorkspace.tsx`)

- `useKeyedCreate(prefix)` (new, `packages/ui/src/data/useApi.ts`, exported from `packages/ui/src/index.ts`):
  one key per logical create (`useCreateKey`), sent as the request key and in the body; kept until success (a
  press after a network failure or a refusal is the same create); renewed after success and after a
  reused-key refusal; a new mount has a new key. S.1 pages untouched.
- The drawer mounts on every opening → a new adjustment always has a new key.
- No answer (non-`ApiError`, status 0 or ≥ 500): `role="alert"`, EN/UR `billing:creditNote.retrySame` ("No answer
  arrived, so it is not known whether the credit note was issued. Press “Issue credit note” again without
  changing anything: if it was issued, you will see that credit note, never a second one."). The retry with the
  same key → the original note, one success toast, drawer closes.
- Reused-key refusal: `role="alert"`, EN/UR `billing:creditNote.keyReused` ("An earlier attempt from this form
  already issued a credit note with other details, so this one was not issued. The invoice is shown as it is
  now: check its credit notes before issuing another."); the invoice is refetched (drawer figures include that
  note); the drawer stays open even if nothing is left to credit (`shown` state in `Workspace`). The generic
  finance wording ("send it again as a new request") is not shown here: for a credit note it invites a duplicate.
- 320 px / 200 %: the drawer's own footer wraps (before: "Cancel" off screen, recorded by B1 as pre-existing);
  shared `Drawer` untouched.
- Strings: 2 new keys per locale (10,321 → 10,323), parity OK.

## §R4 Requirement → test

API = `packages/fixtures/src/society/credit-note-idempotency.api.test.ts`; "unchanged" = the society store's JSON
byte-identical. Hook = `packages/ui/src/data/useKeyedCreate.test.tsx`; e2e = `tests/e2e/cn-idempotency.spec.ts`.

| Requirement | Test |
|---|---|
| same key + identical request → same id/ref/amounts; one note, no number/audit/change; written differently (`600`, `600.0`, number, spaces, reason spaces, body key, unknown field) | API (1); binding white-box in (1) |
| line order not part of the request; a dropped blank entry is another request | API (1b) |
| other amount, reason, line, extra line, no lines, other invoice (A-102), same body to A-101's earlier bill, other person (test-only grant), duplicate/malformed/non-list body, voucher route with the key (both directions, one person), pre-Issue #18 bare key → identical 409, unchanged, names nothing | API (2) |
| right withdrawn, out of scope (other legal entity), site licence withdrawn, organisation suspended, access not yet in force → no replay; refusal = no key = fresh key = never-issued invoice = stranger; unchanged; access back → same note | API (3) |
| record-level authority before the key (right withdrawn after the route gate) | API (3b), white-box |
| stored record id never trusted alone; operation bound | API (3d), white-box |
| no oracle: never-issued invoice, other organisations, resident → as without the key | API (3c) |
| fresh key → independent note while open; past cap → 422, key unused, no number; then first use | API (4) |
| Issue #19 refusals with a key = keyless refusal, unchanged, no number, key not bound; key then works as first use; then bound → 409 | API (5) |
| no key → as before (separate notes, cap, no key stored) | API (6); B1 tests unchanged except §R8 |
| replay after cap down (0 open) and up (reversal) → original note for same person only; others 409; new request checked | API (7) |
| hook: same key on a press after a lost answer → first record, then renewed; new key after success; kept after 422/503; renewed after 409; new mount new key | Hook (4 tests) |
| drawer: lost answer → message; retry → original note, one toast, one note; same key and body key; second adjustment by keyboard (Enter, Tab, Enter) with same content → new key, `ANR-CN-0002`; changed retry → 409 message (EN/UR), invoice refreshed (open 1,700.00), no note for it; Escape closes; axe | e2e EN + UR |
| drawer at 320 px / 200 % text: lines, buttons, alerts not clipped/off screen (`layoutProblems`, button bounds); axe | e2e EN + UR |
| Firefox / WebKit: retry after a lost answer → one note, one toast | smoke |

## §R6 Mutation checks

`test-results-cn/scratch/mutate21.cjs`: one rule broken, the listed tests run, every file restored and compared
by SHA-256. Drawer mutants: `scratch/drawer-mutants.sh` (mutate, production build, serve 6773-6775, the EN e2e
flow test, restore, SHA).

Round 1 (before test (3d)): 35/37 caught; **R4** and **O1** survived: predicted equivalents through the API (the
binding's target pins the invoice, and target and fingerprint always differ between operations). Test (3d)
(white-box: the stored binding altered) was added; both then caught. Drawer: W1-W4 4/4 caught. Every file
restored byte-identical.

**Round 2 (final tests, final sources; 00:04:46Z-00:08:58Z): 37/37 caught, every file restored byte-identical**
(`test-results-cn/mutations/results.txt`, `caught-by-round2.txt`). Plus the drawer mutants W1-W4 (4/4).
"21(n)" = `credit-note-idempotency.api.test.ts` test (n); "19(n)" / "COL-01" = `ux-b1.api.test.ts`; "hook" =
`useKeyedCreate.test.tsx`; "e2e" = `cn-idempotency.spec.ts` (EN flow test).

| # | Rule broken | Caught by |
|---|---|---|
| R1 | replay ignored (same key and request issue a second note) | 21(1)(1b)(2)(3)(3b)(3d)(5)(7) |
| R2 | key check skipped (no replay, no collision) | 21(1)(1b)(2)(3)(3b)(3d)(5)(7) |
| R3 | replay after the body checks (cap re-checked on replay) | 21(1)(2)(3)(3b)(3d)(5)(7) |
| R4 | replayed record looked up by id alone | 21(3d) (white-box; equivalent through the API, survived round 1) |
| R5 | a replay writes an audit entry | 21(1)(1b)(2)(3)(3d)(5)(7) |
| R6 | a replay takes a number | 21(1)(1b)(3)(3d)(7) |
| B1 | key never bound | 21(1)(1b)(2)(3)(3b)(3d)(5)(7) |
| B2 | key bound before the body checks (a refusal binds) | 21(4)(5)(7), 19(3) |
| F1 | fingerprint without the reason | 21(2) |
| F2 | fingerprint without the amounts | 21(2) |
| F3 | fingerprint without the line ids | 21(2) |
| F4 | fingerprint without any line | 21(1b)(2)(5) |
| F5 | money not normalised | 21(1)(1b) |
| F6 | order part of the request | 21(1b) |
| T1 | target without the invoice (account scope only) | 21(1)(2) |
| T2 | target = invoice id alone | 21(1) (white-box binding assertion only: within one organisation's map the invoice id determines the rest, so behaviourally equivalent) |
| P1 | person not compared | 21(2)(7) |
| O1 | operation not compared | 21(3d) (white-box; equivalent through the API, survived round 1) |
| A1 | key before the record-level `authorize` | 21(3b)(3d) |
| A2 | key before `siteOf` (scope / site licence) | 21(3)(3b)(3d) |
| A3 | key looked up before the invoice is found | 21(3c) |
| U1 | hook: not renewed after success | hook (lost answer; after a success) |
| U2 | hook: not renewed after a reused-key refusal | hook (refused request) |
| U3 | hook: renewed after every failure | hook (lost answer; refused request) |
| U4 | hook: no key sent | hook (3 tests) |
| U5 | hook: a new key on every press | hook (3 tests) |
| U6 | hook: one key per page, never renewed | hook (4 tests) |
| W1 | drawer back to a plain mutation (random key per press) | e2e: the retry issued `ANR-CN-0002` ("Expected ANR-CN-0001") |
| W2 | no refresh after the reused-key refusal | e2e: open 1800.00, expected 1700.00 |
| W3 | reused-key refusal shown as the generic problem | e2e: message text |
| W4 | lost answer shown as the generic problem | e2e: message text |
| D1-D7, O19-1, O19-2, K2 | Issue #19 / COL-01 guards (B1's mutants, same targets) with Issue #21 in place | 19(1)-(5), COL-01, 21(5) and others: all caught |

Before the change: the new API file against `682216f`'s `handlers.ts` + `common.ts` (restored, SHA checked):
7 of 10 then-existing tests failed; (3c), (4), (6) passed (behaviour that already held: no oracle without a
binding, a fresh key, no key).

## §R8 Existing tests changed

One line (and two comment lines) in `packages/fixtures/src/society/ux-b1.api.test.ts`, Issue #19 test (3): the
repeat of `small` used the same key `cn-retry-2` as the request that issued `ANR-CN-0002` and expected
`422 overOpen 100.00`. Issue #21 makes exactly that request a replay of `ANR-CN-0002`, so the line cannot stay.
The repeat now uses its own key `cn-retry-3` (a new request); every assertion is unchanged (`overOpen` 100.00,
refs `ANR-CN-0001/0002`, outstanding 700.00, two audit entries). The comment that said "this endpoint has no
request-key replay" was rewritten. The same-key case is asserted in the new file (1), (7). No other existing
test, assertion or timeout changed.

## §R9 Risks and decisions for review

1. Replay after the cap changed returns the original (decision above); it never issues money twice and is
   limited to the same authorised person.
2. Key namespace: the society finance map (S.1 creates + credit notes). Payroll and operations keep their own
   maps, so a key reused across those stores is not detected (unchanged since Issues #16/#18; keys are random).
3. Sorting entries is a business-meaning judgement (§R2); a blank entry stays part of the request.
4. A press after a lost answer **with changed amounts** gets the 409 and a new key; pressing again then issues
   a second, separate note (the message says to check the invoice's credit notes first; the drawer shows the
   refreshed figures). Not blocked: it is a new, explicit decision.
5. Bindings are kept for the life of the demo state (no expiry), as for S.1.
6. OD-1 stays the recommended default, not owner consent.
7. Shared UI: one new hook and export in `packages/ui`; `Drawer`, `InlineAlert`, `useCreateKey` unchanged.
8. Manual: no screen-reader (NVDA/VoiceOver) pass of the two alerts; no WCAG claim beyond axe and automated
   checks. Urdu strings for a native reader: `billing:creditNote.keyReused`, `billing:creditNote.retrySame`.

## §R10 Integration notes

- Files changed: `packages/fixtures/src/society/handlers.ts`, `packages/fixtures/src/society/finance/common.ts`,
  `packages/fixtures/src/society/ux-b1.api.test.ts` (§R8), `packages/ui/src/data/useApi.ts`,
  `packages/ui/src/index.ts`, `apps/backoffice/src/pages/society/billing/InvoiceWorkspace.tsx`,
  `packages/i18n/locales/{en-PK,ur-PK}/billing.json`; new: the API, hook, e2e, evidence and smoke specs, this folder.
- B1 `682216f` is the base; all these files except `common.ts`, `useApi.ts`, `index.ts` were also changed by B1
  (`6b1d7f9`/`682216f`), so B1 must land first (it is the parent).
- B2 `fix/ux-b2-accessibility` (checked at `0884f03` and again at its tip `7ac865f`) and S.3 `feature/gate-s3-rentals@ae3b3a1`: both branch from `04b6fde`; neither
  changes any of the files above (`git diff --stat <merge-base> <branch> -- <files>` empty). Expected conflicts
  with them: none from this change (their overlap with B1 is B1's own integration).

## §R7 Evidence

`docs/status/cn-idempotency/screenshots/`, 16 PNGs from `tests/evidence/cnidem.evidence.spec.ts` (EN and UR):
`n01-drawer-no-answer` (1440, 390, `200pct-320`), `n02-retry-shows-the-note-issued` (1440: one note, one toast),
`n03-drawer-key-reused` (1440, 390, `200pct-320`; behind the drawer the refreshed "Credited"), `n04-invoice-two-notes`
(1440, full page). Every width read from the PNG header equals the name (`scratch/png-widths.cjs`: 0
mismatches); all looked at, the 320 px ones at full size. At 320 px / 200 % the drawer's title and the wrapped
footer leave a few lines for the message: the shots show its start (scrolled to the top of the drawer body);
the rest is reached by scrolling, nothing is clipped (the e2e layout check agrees).

## §R11 Manual verification (not done by me; still needed)

- Screen reader (NVDA / VoiceOver): the two new alerts (`role="alert"`) in the drawer, the success toast after a
  retry, focus after the drawer closes.
- Urdu for a native reader: `billing:creditNote.keyReused` "اس فارم سے پہلے کی ایک کوشش دوسری تفصیلات کے ساتھ کریڈٹ
  نوٹ جاری کر چکی ہے، اس لیے یہ جاری نہیں ہوا۔ انوائس اب جیسی ہے ویسی دکھائی گئی ہے: دوسرا جاری کرنے سے پہلے اس کے کریڈٹ
  نوٹ دیکھ لیں۔"; `billing:creditNote.retrySame` "کوئی جواب نہیں ملا، اس لیے معلوم نہیں کہ کریڈٹ نوٹ جاری ہوا یا نہیں۔
  کچھ بدلے بغیر “کریڈٹ نوٹ جاری کریں” دوبارہ دبائیں: اگر یہ جاری ہو چکا ہے تو آپ کو وہی کریڈٹ نوٹ دکھایا جائے گا،
  دوسرا کبھی نہیں۔"
- A real network drop (the tests lose the answer inside the page's transport; there is no real network in the
  prototype).
- No WCAG conformance is claimed beyond axe and the automated layout / keyboard checks.

## §R12 Every interim failure

| # | Where | Failure | Cause | Resolution |
|---|---|---|---|---|
| 1 | Reproduction, first run | the 4th request refused (`overOpen 100.00`) | my test: 4 × 300 > 1,000 open | 200 per request; reproduction as in §R1 |
| 2 | B1 API tests after the server change | Issue #19 test (3): "expected a refusal" | that line sent the same key with the same request, now a replay (the behaviour Issue #21 asks for) | one line changed (§R8) |
| 3 | tsc, first run | TS2322 in `useKeyedCreate.test.tsx` | persona id `treasurer` is not a `PersonaId` | `finance` |
| 4 | e2e 320 px / 200 %, first run (EN, UR) | a drawer button off screen: "Cancel" at −108…17 px (EN), 320…481 px (UR) | the drawer's footer did not wrap (B1 recorded it as pre-existing) | footer wraps (this drawer only); 4/4 then |
| 5 | backoffice build | `ENOTEMPTY rmdir dist/assets` | my running preview held `dist` open (Windows) | rebuilt only via `scratch/build.sh` (stops my previews first) |
| 6 | evidence, first shoot | 320 px shots showed the middle of the message | `scrollIntoViewIfNeeded` centres it | the message's start scrolled to the top; re-shot, widths 0 mismatches |
| 7 | mutation round 1 | R4, O1 survived | predicted equivalents through the API | white-box test (3d); round 2: 37/37 |
| 8 | docs | the harness refused a new `REPORT.md` | harness rule for this agent | report in this file |

## §R5 Tests and results (final sources; production build of 00:12Z on 6773-6775, both loopbacks)

New tests: API 11 (`packages/fixtures/src/society/credit-note-idempotency.api.test.ts`), hook 4
(`packages/ui/src/data/useKeyedCreate.test.tsx`), e2e 4 (`tests/e2e/cn-idempotency.spec.ts`), evidence 2 with 16
screenshots (`tests/evidence/cnidem.evidence.spec.ts`), smoke 1 (`tests/smoke/cnidem.smoke.spec.ts`, Firefox and
WebKit). Power: on AC (PowerOnline True, 100 %) at every check; no sleep, resume or standby event in the System
log during any run. The served build was checked before the browser run (`final-serve-check.txt`: the
InvoiceWorkspace chunk served on 127.0.0.1 and ::1 equals `dist`, SHA-256).

| Check | Result | Time | Workers / CPU at start |
|---|---|---|---|
| `tsc` (typecheck) | exit 0 | 59 s | - / 0 % |
| Lint: eslint + logical CSS + i18n | exit 0; no physical left/right; 2 locales × 26 namespaces, **10,323** keys each, parity OK | 62 s | - |
| Vitest, full (all packages, golden vectors included) | **1,555 / 1,555**, 57 files (base 1,540 / 55 + 11 + 4) | 34 s | default / 1 % |
| Build (three apps, offset 1600) | built | ~40 s | - |
| **Chromium**: combined e2e (every gate, `tests/e2e`) + `tests/evidence/cnidem.evidence.spec.ts`, retries off | **415 / 415**; 0 failed, 0 flaky, 0 skipped (D.1 `identity.spec.ts:327` passed) | 32.6 min (00:12:52Z-00:45:31Z) | 3 / 12 % |
| axe in that run | **1,476 scans, 0 violations** (40,795 rule passes); Issue #21 spec 8 scans, 0 violations | | |
| **Firefox** smoke (every smoke spec) | **26 / 26** | 2.7 min (with WebKit) | 3 / 3 % |
| **WebKit** smoke (every smoke spec) | **25 / 26**: `s2a.smoke.spec.ts:52` "a new guard" failed (known intermittent) | | |
| WebKit `--repeat-each=20` of that test, this branch | 12 passed, **8 failed**, all the same assertion | 2.0 min | 3 / 9 % |
| My new tests `--repeat-each=3` (Chromium e2e 4, Firefox + WebKit smoke 1) | **18 / 18** | 1.5 min | 1 |
| Mutation round 2 (final tests) | 37 / 37 caught; drawer W1-W4 4 / 4 | 4 min (+ 3 min) | - |

WebKit: every failure (1 in the run + 8 of 20) is the S.2a `pick` helper's assertion (`getByRole('listbox')` count 1,
expected 0, 20 s: the list stays open after a choice). B1 measured the same test 9/20 failing on base `04b6fde` and
6/20 on B1; this change does not touch the staff screens or that searchable list. Not retried, skipped or
weakened; known QA debt. Lock `D:\laragon2\www\.e2e-busy`: taken 00:12:49Z, released 00:48:45Z (final run); taken
00:49:05Z, released 00:51:09Z (repeat-each). Previews stopped afterwards (0 listening on 6773-6775).

Earlier single-spec runs during development (1 worker): e2e 2 failed / 2 passed (§R12 #4), then 4/4; evidence 2/2
twice; smoke 2/2; the four drawer-mutant e2e runs failed as intended (§R6).

## §R13 Observed, not fixed (outside Issue #21)

- At 320 px / 200 % the shared `Drawer` keeps its title and subtitle sticky: in Urdu they take about 400 px of the
  700 px viewport, so with the wrapped footer roughly 90 px of the drawer body is in view (it scrolls; nothing is
  clipped; layout and axe checks pass). A shared-component change (B2 / B10); B2 does not change `Drawer.tsx`.
- B1's report §11.2 still says this endpoint has no request-key replay; it is superseded by this change (B1's
  docs are not edited here).
