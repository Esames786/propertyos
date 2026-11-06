# S.1 / C.2 financial security hotfix (GitHub Issue #18): report

**Branch** `fix/s1-bank-feed-and-idempotency`, from `474e4ae` (Gate S.2b closure). **Status:** fixed,
tested, pushed for GPT and owner review; not merged, not deployed. Provenance of the findings: the
read-only audit `docs/frontend-ux-audit@1a0779e` (FIN-01, FIN-02), read but not merged.

## What was wrong

- **FIN-01 (P0).** The owner ruled that `bank.view` (or the justified `bank.reconcile`) is a
  confidentiality boundary. The building manager (Imran: cashbook, collections, deposits; no bank
  feed) nevertheless received the bank feed: every statement line of the association's account on
  BANK-002 (other residents' transfers, bank transaction ids, counterparties, their accounts, the
  receiving IBAN, statement imports), the candidate lines of every proof on FIN-009 (for B-405 another
  payer's transfer), and, found in the re-audit, the same data or figures derived from it in the
  finance dashboard, the cashbook (statement comparison and each line's bank id), the close
  checklist, transfers, cheques, payments, the proof inbox's match signal, approval facts, the
  society history (`/society/audit`) and its data export. Two write paths let a reader without the
  feed probe bank-line ids. Sixteen paths in all: see FINDINGS.md.
- **FIN-02 (P1).** S.1's idempotency map stored `key → record id` with no binding and was shared by
  six creates (the audit named three). A key reused for another request returned the first record
  with a success response (or, across operations, failed on the wrong collection); and the cashbook,
  transfers, office-collection and ownership screens minted one key per page visit, so a second
  voucher, deposit or collection in the same visit silently came back as the first, with a success
  toast.

## What changed

**Server (mock API, `packages/fixtures`).**
- `society/finance/bank-scope.ts` (new): `seesBankFeed` (= `bank.view` or `bank.reconcile`) and the
  projections every read model uses: masked IBAN (`•••• 7890`), no statement lines, imports, candidates,
  line or bank ids, counterparty data, line counts or amounts; the reconciliation check reduced to its
  outcome; audit entries about lines left out and bank ids removed. Applied in `handlers-books.ts`
  (overview, accounts, account 360, cashbook, transfers, close checklist), `handlers-collect.ts`
  (cheques; reversal-request line oracle), `handlers-governance.ts` (approval facts),
  `collections-handlers.ts` (proof queue, proof detail, verify / exception line oracle, payment
  detail), `society/handlers.ts` (`/society/audit`) and `identity/data-handlers.ts` (audit export).
  Each response says whether it carries the feed (`bankFeed`).
- `society/finance/common.ts`: `replayOf` / `remember` bound to operation, principal, target and a
  fingerprint of the normalised input (Issue #16 pattern); one refusal
  `409 idempotency_key_reused` (`finance:problems.idempotencyKeyReused`, EN and UR); a bare legacy id
  replays nothing. Applied to all six creates (`vouchers`, `transfers`, `payments/office`,
  `office-collections`, `cheques`, `ownership-transfers`), each checking its target first and
  re-reading the replayed record through a scoped finder. Office-cash method rule and the period lock
  (which records a refused late posting) still run before the replay, as before.
- Contracts (`packages/contracts`): `bankFeed` on the account, overview, cashbook, transfer, cheque,
  proof and payment views; `restricted` on a close check; bank ids optional where a reader without the
  feed receives none; the inbox `match` optional.

**Office app (`apps/backoffice`), `packages/ui`.**
- BANK-002 shows Lines and Reconciliation only with the feed; otherwise "Bank details are for
  finance" with the reason, and `?tab=lines` / `?tab=reconciliation` open the overview. FIN-009, the
  payment workspace, cheques, transfer legs, the cashbook comparison, the dashboard and the close
  checklist each say why bank details are not shown; texts that named a bank id have a variant without
  it. No link to the bank feed is offered without the feed. Masked account numbers never break
  mid-word (`ibanWrap`).
- `useCreateKey` (one key per logical create, sent as the request key and the body key, kept for its
  own retries, renewed on success, when a new drawer opens and after a reused-key refusal) in the
  cashbook voucher drawer, the new-transfer drawer (form now reset), office collections and the
  ownership-transfer drawer (form now reset). The voucher toast names the voucher it created.
- EN and UR strings for every new sentence (i18n parity 10,294 keys each).

Untouched on purpose: maker-checker, approval policies, the period lock, settlement on independent
evidence (nothing is settled by this fix), Laravel, live banking, the S.3 branch, `main`.

## Tests (details in test-results.md)

- **Final totals.** tsc clean; lint, logical CSS and i18n parity clean (10,294 keys each); Vitest 1,517 / 1,517; combined Playwright 406 / 406 (e2e 400, evidence 6), retries off, twice; axe 1,426 scans, 0 violations; Firefox/WebKit smoke 43 / 44 twice (one pre-existing WebKit S.2a flake).

- `packages/fixtures/src/society/finance/finance.issue18.api.test.ts` (13): Imran's every S.1/C.2 read
  scanned for any line id, bank id, statement id or file name, counterparty name or account and full
  IBAN, with his reads changing nothing; the finance roles' full flow; `bank.reconcile` alone; the
  line-id oracle; exports; grant revocation; for FIN-02 the same key with another amount, account,
  category, submit choice, target, endpoint, principal or legal entity, grant revocation, cross-owner,
  the true retry (also written differently), a second legitimate create, the stored binding itself,
  and the refusal's wording. Every refusal leaves the society's stores byte-identical.
- `packages/ui/src/data/useCreateKey.test.tsx` (3).
- `tests/e2e/s1-hotfix.spec.ts` (11), `tests/evidence/s1hotfix.evidence.spec.ts` (6, 25 screenshots),
  `tests/smoke/s1hotfix.smoke.spec.ts` (2, Firefox and WebKit).
- Mutation checks: 36 deliberate breaks of the new guards, 35 caught by the final tests; I5 is an equivalent mutant.
- No accepted test was changed.

## Residual risks and decisions for review

1. The society's **payee IBAN** stays visible where it is configuration or a payment instruction:
   collection settings (BILL-010; `collections.view`, `site.view`, `invoice.view`), the residents'
   pay page, bills and dues notices; and the **proof stand-in** on FIN-009 (the drawing of the
   resident's own slip) prints it as a real slip would. Masked everywhere else for readers without the
   feed. An owner ruling is needed if these should be masked too.
2. The month-close check "bank lines matched" keeps its **outcome** (blocking or passed) for readers
   without the feed, without count, amount or link.
3. A `payment_exception.approve` holder without the feed could still approve a proof exception (the
   card then names no line). No demo approver lacks `bank.view`; maker-checker was out of scope.
4. The prototype's demo state has one legal entity per society, so "another legal entity" is exercised
   through another entity's account (`ben_platform_saas`), refused like an account never issued.
5. Pre-existing layout defects seen while checking (not caused or fixed here, for the backlog): at
   320 px with 200 % text two FIN-001 stat tiles clip their context line (four in Urdu), BANK-007 breaks
   a voucher file name and a flat code mid-word (the treasurer's unchanged view shows the same
   at 320 px / 200 %), and in dark mode at 390 px the dashboard's intro sentence wraps "Al-Noor" at its
   hyphen (text this fix does not touch).
6. `E2E_PORT_OFFSET=800` maps to ports 5973–5975 in `playwright.config.ts` (5173 + 800), not 5873–5875;
   the runs used 5973–5975 (free on this machine).
7. **S.3 integration dependency.** S.3 Rentals reuses the bank feed, owner statements and the S.1 key
   map; it must take this hotfix (after GPT review) and route any new bank-derived read through
   `bank-scope.ts` and any new create through `replayOf` / `remember` with its own target.

No WCAG conformance is claimed: automated axe checks and keyboard walks only, no manual
screen-reader or device QA.
