# S.1 hotfix (Issue #18): function matrix

Who receives what after the fix. "Feed" means `bank.view` or `bank.reconcile` (`seesBankFeed` in
`packages/fixtures/src/society/finance/bank-scope.ts`). Al-Noor holders:

| Person | Persona | Feed? | Relevant permissions |
|---|---|---|---|
| Imran Qureshi, building manager | `alnoor_manager` | **no** | cashbook.view, collections.view, funds_transfer.create, transfer.review, approval.view, site.view, beneficiary.manage |
| Ayesha Malik, treasurer | `alnoor_treasurer` | yes (`bank.view`) | cashbook.view, collections.view, approval.decide, payment_exception.approve, payment.receive |
| Saba Javed, accounts officer | `alnoor_accounts` | yes (`bank.view`, `bank.reconcile`) | cashbook.view, cash_voucher.prepare, funds_transfer.create, cheque.manage, finance.evidence.review, payment.receive |
| Rabia Hashmi, general secretary | `alnoor_admin` | yes (`bank.view`) | cashbook.view, collections.view, transfer.review, approval.decide |

## FIN-01: every read path, projected on the server

| Path (screen) | Without the feed (Imran) | With the feed |
|---|---|---|
| `GET /finance/accounts/:id` (BANK-002) | Account, balance, inflow/outflow, custodian, last count; `statements: []`, `lines: []`; `statement_imported` left out of history; IBAN `•••• 7890`; `unreconciled: 0`; `bankFeed: false`. UI: no Lines / Reconciliation tabs; `?tab=lines` and `?tab=reconciliation` open the overview with "Bank details are for finance". | Unchanged |
| `GET /finance/accounts` (BANK-001) | IBAN masked; `unreconciled: 0` | Unchanged |
| `GET /finance/overview` (FIN-001) | `unreconciled` = 0 / 0 / no link; "Bank settled" opens the cashbook (not the feed); accounts masked; `bankFeed: false`. UI: the tile is replaced by a sentence. | Unchanged |
| `GET /finance/cashbook` (BANK-007) | Settled cashbook kept; statement-line evidence says "Statement line" without line or bank id; `reconciliation: []`; `bankFeed: false`. UI: reason instead of the comparison. | Unchanged |
| `GET /finance/periods/:p/checklist` (BANK-008) | `unreconciled_lines`: outcome only (`count: 0`, `restricted: true`, no amount, no link). UI: "count and amount for finance staff with bank access". | Unchanged |
| `GET /finance/transfers`, `/:id` and every transfer POST response (BANK-006) | His own and others' instructions kept; `candidates: { out: [], in: [] }`; settlements and leg exceptions without `bankLineId`/`bankTxnId`; `bankFeed: false`. UI: "Settled on a statement line (date), matched by …"; the leg says why no line is shown. | Unchanged |
| `GET /cheques`, `/cheques/:id` and cheque POST responses | Cheque kept; no candidates; exception / reversal without line ids; the "cleared" event without the bank id; `bankFeed: false`. UI: reason instead of the line list. | Unchanged |
| `GET /payment-submissions` (FIN-008) | `match` signal left out (derived from the lines). UI: no match badge. | Unchanged |
| `GET /payment-submissions/:id` and its POST responses (FIN-009) | `candidates: []`; exception without line ids; payee IBAN and `paidTo.iban` masked; `bankFeed: false`. UI: "Bank statement lines are for finance staff with bank access…" instead of the candidates; exception text without the transfer id. | Unchanged |
| `GET /payments/:id` (FIN-006) | No `bankLine`; payment without `bankLineId`/`bankTxnId`/`reversal.bankLineId`; linked proof projected; `bankFeed: false`. UI: reason instead of "cash, no line". | Unchanged |
| `GET /approvals/:id` (APR-002, payment reversal) | No `bankLine` fact | Unchanged |
| `GET /society/audit` (history on flats, accounts, runs) | Entries about statements and lines (`target.kind = bank`) left out; `values.bank` removed; IBAN values and labels masked | Unchanged |
| Data export `audit` dataset (ADM export) | Same projection as `/society/audit`; `bank_lines` dataset already needed `bank.view` (unchanged) | Unchanged |
| `GET /collections/summary`, `/society/dashboard` | Already projected in C.2 (`bank` figures zero for non-feed); covered by the new scan | Unchanged |
| `GET /bank/feed`, `/bank/reconciliation`, `/finance/demo-statement` | 403 (unchanged: `bank.view`) | Unchanged |

Line-id oracle (no difference between a real line and one never issued, nothing changes):

| Write path | Without the feed | Test |
|---|---|---|
| `POST /payment-submissions/:id/verify`, `/exception` (a reviewer without the feed) | every line id → `404 not_found` | "no line-id oracle" |
| `POST /cheques/:id/reversal-request` (a cheque officer without the feed) | every line id → `409 line_unknown` | "no line-id oracle" |
| Leg match / exception, cheque clear / exception, line exclude | already need `bank.reconcile` (403 before any line lookup) | existing S.1 tests |

## FIN-02: every create that shares the finance key map

Key: the body's `idempotencyKey` (S.1 contract), else the request's own key. Bound to (operation,
principal, target, fingerprint of the normalised input). Target checked first; replay re-reads the
record through a scoped finder; any other reuse → `409 idempotency_key_reused`
(`finance:problems.idempotencyKeyReused`), nothing changed. In the UI `useCreateKey` also renews the
key after that refusal (`isKeyReused`), so the next press is a new request.

| Operation | Endpoint | Target (checked before the replay) | Normalised input | UI key |
|---|---|---|---|---|
| `voucher.create` | `POST /finance/vouchers` | legal entity + cash account (`accountOf`, 422 `account_unknown` for another entity's) | all voucher fields (amount in paisa) + submit | `CashbookPage` VoucherDrawer: `useCreateKey('cv')`, renewed on success and when the drawer closes; form reset |
| `transfer.create` | `POST /finance/transfers` | legal entity + from + to accounts (kind, same-account, cross-entity, sides checked) | kind, amount (paisa), purpose, bank reference, reversal-of | `TransfersPage` NewTransferDrawer: `useCreateKey('trf')`; form and key reset on open and on success |
| `office_cash.record` | `POST /payments/office` | legal entity + billing account + liable payer | amount (paisa), note | `PaymentsPage` (unchanged: one key per drawer opening, renewed on close) |
| `batch.create` | `POST /office-collections` | legal entity + site | `{}` | `OfficeCollectionsPage`: `useCreateKey('ocb')`, renewed on success |
| `cheque.receive` | `POST /cheques` | legal entity + billing account + liable payer (`lineOf`) | amount, drawer bank, number, date | `PaymentsPage` sends no body key (a fresh request key per press, as before) |
| `ownership.create` | `POST /ownership-transfers` | legal entity + flat (`flat_unknown`) | buyer id / name / phone, effective date, reason | `OwnershipPages` NewOwnershipDrawer: `useCreateKey('owt')`; form and key reset on open and on success |

Order kept on purpose: the office-cash method rule and the period lock (I-27, which records the
refusal on the period) still run before the replay, as before; state-dependent checks that the
first request itself changes (funds available, duplicate cheque, open transfer for the flat) run
after it, so a true retry replays instead of being refused.

Untouched: maker-checker, approval policies, period lock, settlement on independent evidence.
