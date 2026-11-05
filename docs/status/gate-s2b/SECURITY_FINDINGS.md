# Gate S.2b security and money controls

Each risk Issue #15 names, the control in the mock server, and where it is tested.
- **Rule tests** are in `packages/fixtures/src/payroll/payroll.test.ts` (golden vectors) and `payroll.api.test.ts`.
- **Browser tests** are in `tests/e2e/s2b.spec.ts` and the smoke.
- **Mutation.** Each `Pn` names the deliberate break of that control that the tests caught. Results are in [`test-results.md`](test-results.md#mutation-checks).

**Every refusal leaves the stored records byte-identical:** the HR and payroll stores are compared as text before and after (`refusedUnchanged`).

## 1. Money boundary: obligation, instruction, settlement

| # | Risk | Control | Tests | Mutation |
|---|---|---|---|---|
| S1 | An approved run reads as paid | The run state `approved` is an approved obligation, labelled "Approved obligation — not paid"; nothing has a paid state | API reference flow (no `"paid"`, `"settled"` or `"repaid"` value at any stage); E2E reference flow (the word "Paid" nowhere) | — |
| S2 | An instruction, its approval or "sent" moves money | The instruction has its own states (prepared, approved, sent (simulated), cancelled); none changes the obligation or settlement | API reference flow: obligation unchanged at every stage; `settledVerified` stays `null` | P15 |
| S3 | A fake "confirm paid", proof upload or simulation counts as settlement | **No such route exists.** Settle, paid, evidence, match and post calls get 404 for both roles; state is unchanged | API "no route records a payment…" | P19 |
| S4 | A cashbook voucher of the same amount, or a voucher naming a guard and "salary", settles pay | Payroll never reads vouchers; an S.1 voucher with "October salary" and Zubair's name changes nothing in payroll | API "…a free-text cashbook voucher…" | — |
| S5 | Wrong, reused, reversed or another employer's bank evidence settles pay | No evidence input exists, so all are refused alike (nothing is accepted); the same evidence body sent to every candidate path gets 404 | API "no route records…" | P19 |
| S6 | Payroll marks an advance or loan repaid | Instalments due in the month are **held**, never deducted; HR advances stay "approved, payment not verified" with every instalment "planned" after a run is approved and its instruction sent; HR-008's link stays refused | API loan test; vectors (held instalment, uneven last instalment) | P10 |
| S7 | Something is posted to a ledger or cashbook | PAY-007 shows proposed entries only; `posted` is always empty with three reasons | API reference flow; E2E | — |
| S8 | Pay to an unverified account is instructed, or silently dropped | Held in the instruction with its reason (`bank_unverified`); a zero line is held too | API reference flow (Karim held); vectors (split) | P13 |

## 2. Statutory and policy assumptions

| # | Risk | Control | Tests | Mutation |
|---|---|---|---|---|
| S9 | A tax, EOBI or social-security rate is assumed | Placeholders only, never calculated; labelled "Demo placeholder — configuration needed" | API reference flow (statutory placeholders); E2E | — |
| S10 | Unpaid leave is paid in full or deducted without a policy | Approved unpaid leave **holds** the line (blocker) until excluded; pending unpaid leave warns | API unpaid leave; vectors | P11 |
| S11 | Absences or overtime change pay without a policy | Absences reported only; overtime not calculated | vectors | — |
| S12 | Proration rounds unpredictably | Calendar days, half up to the paisa, in bigint; labelled demo rule | vectors (9 proration cases including exact half and below half) | P25 |
| S13 | Negative or malformed amounts | A bonus must be above zero, at most PKR 500,000, two decimals; days are whole numbers from 0 to the days employed; an empty answer is not zero | API inputs test; E2E (negative bonus, empty days) | P12, P26 |
| S14 | No pay terms leads to invented pay | Line held (`missing_pay`), nothing calculated, until excluded with a reason | API starter test; vectors | — |

## 3. Maker-checker, own records and freezing

| # | Risk | Control | Tests | Mutation |
|---|---|---|---|---|
| S15 | The preparer approves their own run | `makers` lists every principal who prepared, recalculated, changed or submitted; none may approve (403 `maker_checker_required`), even holding both permissions | API maker-checker test | P1 |
| S16 | An approver approves a run with their own pay in it | 403 `own_record` | API maker-checker test (Imran given `payroll.approve`) | P2 |
| S17 | Someone changes their own pay | Days, bonuses and exclusion of one's own line refused (403 `own_record`); own line read only in the UI | API inputs test; E2E | P6 |
| S18 | An out-of-date version is approved | A submitted run whose HR facts changed is stale: approve refused (409 `run_stale`), return allowed; submit refused until recalculated | API stale test | P3, P20 |
| S19 | Approval without understanding it is not a payment | `acknowledge: true` required (422 otherwise) | API reference flow; E2E | P4 |
| S20 | An approved or reversed run changes later | Every input and recalculation refused (409 `run_frozen`) whatever the employee id; HR changes after approval do not alter it | API frozen test | P5 |
| S21 | Reversal hides a payment or reopens a closed month | Only before the period closes (409 `period_closed`), with no live instruction (409 `instruction_live`), never by a maker; a reversed run never changes | API maker-checker test; API reference flow (after close) | P23 |
| S22 | An instruction approved by its preparer, or by someone it pays | 403 `maker_checker_required` / `own_record` | API instructions test | P14 |
| S23 | A sent instruction is quietly cancelled | 409 `instruction_sent` | API reference flow | P15 |
| S24 | Duplicate submissions create duplicates | Idempotency keys on creating a period, a run, an instruction and a bonus return the first result (tested for the period, the bonus and the instruction); repeated state changes get 409 `state_changed` | API periods, inputs and instructions tests | — |

## 4. Who sees pay; scope; oracles

| # | Risk | Control | Tests | Mutation |
|---|---|---|---|---|
| S25 | HR staff (`hr.view`, `hr.manage`), supervisors or residents see wages | Every payroll endpoint needs `payroll.view`, checked by the transport before the handler; Employee 360 carries no pay; the menu and deep links are refused | API (5 personas × 9 reads; a resident; Employee 360 text); E2E | P22 |
| S26 | Payroll without its licence, or without HR | Transport refuses an unlicensed `payroll` (403 `module_not_licensed`); the handler refuses when `hr` is not licensed for any site | API licence tests; E2E "not in your plan" | — |
| S27 | Another organisation gains payroll | Only Al-Noor's dated amendment; no society preset; a developer (preset payroll) has no permission, and with one the society payroll is "not found" (Gate E) | API; E2E | — |
| S28 | Suspended or revoked rights | Suspended: reads only (403 `tenant_suspended` on changes); a licence not yet in force or ended: 403 `module_not_licensed` | API | — |
| S29 | A person with some of an employer's sites sees or changes others' pay | Lines limited to their staff, totals over those only, `scopeLimited` shown, no hidden count; every change 403 `other_sites` | API oracle test | P7, P8 |
| S30 | An id oracle (a real id answers differently from an invented one) | Out-of-scope run, period, employee and another employer's records answer exactly like ids never issued; changes check the employer before the employee id, and a frozen run answers 409 for any id | API oracle test; API frozen test | P9 |
| S31 | Another employer's staff in a run, or a transferred person left in it | Lines are the run's employer's staff only; a person moved to another employer leaves at the next calculation (history says so) | API transfer test | P21 |
| S32 | Training mode changes official records | Payroll changes refused in training mode (403 `training_not_supported`) | API | P16 |
| S33 | Duplicate or overlapping periods; two open months | One per month per employer (409 `period_exists`), in order, at most two months ahead; one open at a time (409 `another_open`); close needs the approved run | API periods test; E2E | P17, P18, P24 |
| S34 | Exports leak | The CSV export uses the same filtered lines and says when it is limited | API oracle test | P8 |
| S35 | Bank details exposed | Only a bank name and the last four characters are stored or shown | API reference flow (account `0201`) | — |

## 5. Found and fixed while building

| Finding | Where | Fix |
|---|---|---|
| An empty days answer was read as 0 days (it would have paid nothing silently) | `handlers.ts` `confirmDays` | An empty or blank answer is refused; API and E2E tests; mutation P26 |
| Five layout defects at 320 px / 200 % | Dashboard tiles, references, Urdu buttons, journal table, page title | See the report §2.7; covered by the E2E layout tests |

No defect in S.2a or earlier code was found or changed.
