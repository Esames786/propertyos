# S.1 hotfix (Issue #18): findings

Source: GitHub Issue #18 (owner ruling via GPT, 6 November 2026) and the read-only audit
`docs/frontend-ux-audit@1a0779e` (`docs/status/audit/FRONTEND_UX_AUDIT.md`, FIN-01 and FIN-02). The
audit branch was read, not merged. Base: `474e4ae` (feature/gate-s2b-society-payroll).

Ruling applied: **`bank.view` (or the justified `bank.reconcile`) is a confidentiality boundary.**
`cashbook.view`, `collections.view`, `funds_transfer.create` and read-only proof access do not
authorise unclaimed statement lines, bank transaction references, counterparties, full IBANs or
other people's incoming transfers.

## FIN-01 (P0): every path re-audited

The two doors the audit named were confirmed, and the re-audit found more paths carrying the same
data. All are now projected on the server by one module,
`packages/fixtures/src/society/finance/bank-scope.ts`.

| # | Path | What reached Imran before | Found by |
|---|---|---|---|
| 1 | `GET /finance/accounts/:id` (BANK-002 Lines / Reconciliation tabs) | every statement line of the account (other residents' transfers, bank ids, counterparties, counterparty accounts, receiving IBAN), statement imports (file names, line counts, importer), `statement_imported` history, full IBAN, unreconciled count | audit |
| 2 | `GET /payment-submissions/:id` (FIN-009 read-only) | `candidates` (unclaimed lines of other payers; for B-405 "IMRAN HUSSAIN"), bank ids, receiving IBAN | audit |
| 3 | `GET /finance/overview` (FIN-001) | "Bank lines not reconciled" count and amount; links to the bank feed | audit (KPI) |
| 4 | `GET /finance/accounts`, overview accounts | full IBAN; per-account unreconciled count | re-audit |
| 5 | `GET /finance/cashbook` | `reconciliation` (statement movement, unmatched line count and amount per bank account); `bankLineId`/`bankTxnId` on every bank-settled line's evidence | re-audit |
| 6 | `GET /finance/periods/:p/checklist` (close drawer) | count, amount and feed link of unreconciled lines | re-audit |
| 7 | `GET /finance/transfers/:id` (and every transfer POST response) | `candidates` for live bank legs; settlements' `bankLineId`/`bankTxnId`; leg exceptions' line ids | re-audit |
| 8 | `GET /finance/transfers` | leg exceptions' line ids | re-audit |
| 9 | `GET /cheques/:id`, `/cheques` | `candidates` (deposit or return lines); exception and reversal line ids; the "cleared" event noted with the bank id | re-audit |
| 10 | `GET /payment-submissions` (FIN-008) | the `match` signal, derived from the lines (tells whether a matching transfer has arrived) | re-audit |
| 11 | `GET /payments/:id` (FIN-006, PaymentWorkspace) | the whole matched `bankLine`; payment `bankLineId`/`bankTxnId` | audit (PaymentWorkspace.tsx:248-267) |
| 12 | `GET /approvals/:id` (payment reversal) | fact "bankLine: DEMO-… · date" | re-audit |
| 13 | `GET /society/audit` (history on flat / account / payment pages) | statement-import and line events (labels = bank ids, file names), `values.bank` (transaction id) and `values.account` (receiving IBAN) on proof, exception and cheque events; collection-account IBAN labels | re-audit (history) |
| 14 | Data export, `audit` dataset (needs `admin.view`) | the same audit entries in a downloadable file (`bank_lines` already needed `bank.view`) | re-audit (exports) |
| 15 | `POST /payment-submissions/:id/verify`, `/exception` | a reviewer without the feed could tell a real line from one never issued, and the refusal quoted its bank id and IBAN | re-audit (oracle) |
| 16 | `POST /cheques/:id/reversal-request` | a cheque officer without the feed could probe line ids | re-audit (oracle) |

Paths checked and found already closed: `/bank/feed`, `/bank/reconciliation`, `/bank/statements`,
line exclude/restore, leg match/exception, cheque clear/exception (all need `bank.view` or
`bank.reconcile` before any line lookup); `/finance/demo-statement` (`bank.view`); the C.2
collections summary and the society dashboard (C.2 already zeroed bank figures without
`bank.view`); the `bank_lines` export dataset (`bank.view`). Refusals that quote a bank id or IBAN
(`bank_line_already_matched`, `wrong_destination`) are now reachable only with the feed (#15).

### Decisions taken (for review)
- **Reconciliation status on the close checklist.** Without the feed the check keeps its outcome
  (passed / blocking) but has no count, amount or link, and says "count and amount for finance staff
  with bank access". The month-close status is operational; it is not a line, bank id, counterparty,
  IBAN or anyone's transfer.
- **"Bank settled" on the dashboard** is the cashbook's own figure (settled payments and deposits);
  kept, but it now opens the cashbook instead of the bank feed.
- **Society account IBANs** are masked (`•••• 7890`, kept on one line by `ibanWrap`) in every S.1/C.2 finance read model for readers
  without the feed (accounts, proof payee, `paidTo`, audit). **Residual, not changed:** the collection
  account setup screen (BILL-010, `/sites/:id/collection-settings`, readable with `invoice.view`,
  `site.view` or `collections.view`) and the residents' pay page, bills and dues notices still show
  the society's full payee IBAN, because residents are told to pay into it and the manager proposes
  it with `beneficiary.manage`. This is configuration and payment instructions, not the bank feed;
  an owner ruling is needed if it should be masked as well.
- **Transfers and cheques.** Cashbook readers keep the transfer and cheque records (the operational
  cashbook lists every pending instruction anyway); only the bank data inside them is removed. Imran
  keeps his own deposits, slips and settlement status ("Settled on a statement line (26 Oct 2026),
  matched by Saba Javed").
- **`bank.reconcile` alone** counts as the feed (the justified exception in the ruling); no demo
  persona holds it without `bank.view`.
- **Exception decisions.** A `payment_exception.approve` holder without the feed could still approve
  a proof exception without seeing the line (the card then shows no line). Every demo approver holds
  `bank.view`; maker-checker is unchanged by instruction, so this is left as is and noted.

## FIN-02 (P1)

`common.ts` `replay`/`remember` stored `key → id` with no binding, shared by **six** S.1 creates
(the audit named three): vouchers, funds transfers, office cash (`/payments/office`), office
collection start, office cheque (`/cheques`) and society ownership transfers. A key reused across
operations looked the id up in the wrong collection (`find(...)!` → `undefined`, a server error);
within one operation it returned the first record for different input, another target or another
person, with a success response.

Fixed as Issue #16: bound to operation, principal, target and a fingerprint of the normalised input
(64-bit FNV, `society/import.ts`); target checked first; replay re-read through a scoped finder
(`not_found` if it no longer fits); any other reuse is one `409 idempotency_key_reused`
(`finance:problems.idempotencyKeyReused`, EN and UR) with nothing changed; a key stored before #18
(a bare id) replays nothing. The key is the body's `idempotencyKey` (S.1 contract), else the
request's own key.

UI: `CashbookPage`, `TransfersPage`, `OfficeCollectionsPage` and `OwnershipPages` minted one key per
mounted page (the transfer and ownership forms were never reset). They now use `useCreateKey`
(`packages/ui/src/data/useApi.ts`): one key per logical create, sent as both the request key and the
body key, kept for that create's own retries, renewed on success, when a new drawer opens and after
a reused-key refusal (`isKeyReused`: the message says to send it again as a new request); the forms
reset. The voucher toast now names the voucher it created (`{{ref}} sent for approval` /
`{{ref}} saved as a draft`). `PaymentsPage` (office cash) already used one key per drawer opening and
is unchanged; its cheque path sends no body key, so each press gets a fresh request key (as before).

## Out of scope (tracked separately)

FIN-03 (unreachable voucher drafts), FIN-04 (approval-policy edits), RES-01, COL-01, COL-02 and the
other audit findings are separate defects in Agent C's triage backlog (provenance `1a0779e`); not
touched here. FIN-03's `replaceState` behaviour in the voucher drawer is unchanged.
