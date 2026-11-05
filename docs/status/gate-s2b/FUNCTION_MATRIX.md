# Gate S.2b function matrix

Every function of the seven payroll screens: who may use it, the server rule, and the test that proves it.
- **Vectors:** `payroll.vectors.json`, run by `payroll.test.ts`.
- **API:** `packages/fixtures/src/payroll/payroll.api.test.ts`.
- **E2E:** `tests/e2e/s2b.spec.ts`.
- **Smoke:** `tests/smoke/s2b.smoke.spec.ts` (Firefox and WebKit).
- **Evidence:** a screenshot in `screenshots/` (prefix shown).

Status: **B** = built and tested; **P** = partial by design (the reason is in the report §5).

## PAY-001 Payroll dashboard (BUILT)

| # | Function | Who | Rule | Tests | Evidence |
|---|---|---|---|---|---|
| 1.1 | Current period, its run (reference, version, state, net, staff) and the next period | `payroll.view` | Visible employers only | API reference flow; E2E reference flow | b01, c01 |
| 1.2 | Staff in the run, lines held, waiting for you | `payroll.view` | Counts over visible lines only | E2E reference flow | b01 |
| 1.3 | Approved obligations (owed), instructed (not paid), verified as paid ("Not available") | `payroll.view` | `settledVerified` is always `null` | API reference flow (each stage); E2E | b01, c01 |
| 1.4 | Needs attention: held lines, stale run, runs and instructions waiting, unverified accounts, statutory not configured | `payroll.view` | Each item links to its records | E2E (opens the held filter) | b01 |
| 1.5 | The boundary panel (owed / instructed / paid) | `payroll.view` | — | E2E | b01 |

## PAY-002 Payroll periods (BUILT)

| # | Function | Who | Rule | Tests | Evidence |
|---|---|---|---|---|---|
| 2.1 | List with filter (all, draft, open, closed) and counts | `payroll.view` | Visible employers only | API periods; E2E | b02 |
| 2.2 | New period (the next month, pay date) | `payroll.prepare` + whole employer | No duplicate month (409); in order from the licence month (422); at most two months ahead (422); pay date 5 days before to 10 after month end (422); idempotent | API periods; E2E | d04 |
| 2.3 | Open a draft | `payroll.prepare` + whole employer | One open period per employer (409 `another_open`) | API periods; E2E | b02 |
| 2.4 | Prepare the period's run | `payroll.prepare` + whole employer | Open period (409); one live run (409 `run_exists`); after a reversal, a new run (`-2`) | API periods, reversal; E2E | — |
| 2.5 | Close | `payroll.approve` + whole employer | The live run approved (409 `run_not_approved`); closed periods never reopen; reversal refused afterwards | API periods, reference flow; E2E | — |
| 2.6 | Why an action is not offered | — | `blocked`: another open, run not approved, other sites | E2E | b02 |

## PAY-003 Payroll run workspace (BUILT)

| # | Function | Who | Rule | Tests | Evidence |
|---|---|---|---|---|---|
| 3.1 | Run header: reference, state, version, period, employer | `payroll.view` | — | E2E | b03 |
| 3.2 | Totals: gross, deductions applied (always 0), net owed, in the run, excluded, held | `payroll.view` | Totals over visible lines; `scopeLimited` when partial | API reference flow, oracle test | b03 |
| 3.3 | Lines with blockers and warnings; filter (all, held, warnings, excluded); find a person | `payroll.view` | — | E2E reference flow | b03, b04 |
| 3.4 | Recalculate (new version from today's HR records) | `payroll.prepare` + whole employer | Draft and open period only (409 `run_submitted`, `run_frozen`, `period_not_open`) | API stale, frozen tests | — |
| 3.5 | Stale detection | `payroll.view` | HR facts fingerprint differs from the version's; submit refused | API stale test | d05 |
| 3.6 | Submit for approval | `payroll.prepare` + whole employer | No held line, not stale, at least one person, period open (409 with the reason) | API reference flow, starter, unpaid leave; E2E | — |
| 3.7 | Withdraw a submission (reason) | `payroll.prepare` + whole employer | Submitted only; a reason of 5 or more characters | API frozen test | — |
| 3.8 | Versions list (reason, by, net, people) | `payroll.view` | Every change is a version | API reference flow | b03 |
| 3.9 | Policies panel | `payroll.view` | Statutory, overtime, unpaid leave, absences and recovery not configured; proration a demo rule | API; E2E | b03 |
| 3.10 | Download CSV | `payroll.view` | Same filtered lines; says when limited | API oracle test | — |

## PAY-004 Employee pay breakdown (PARTIAL)

| # | Function | Who | Rule | Tests | Evidence |
|---|---|---|---|---|---|
| 4.1 | Earnings: base and allowances, prorated (demo rule) or days worked × daily rate | `payroll.view` | Calendar days, half up | Vectors (16 lines, 9 prorations); API leaver | b05 |
| 4.2 | Confirm days worked (daily wage) with a reason | `payroll.prepare` + whole employer, not own | 0 … days employed, whole numbers, not empty; daily wage only | API inputs test; E2E | b10 |
| 4.3 | Bonuses: add (label, amount, reason), remove | `payroll.prepare` + `payroll.bonuses`, not own | Above zero, at most PKR 500,000; idempotent | API inputs test; E2E | — |
| 4.4 | Deductions: applied (none), held instalments, statutory placeholders, unpaid leave and absences | `payroll.view` | **P:** instalments held (HR-008); statutory never calculated | API loan test; vectors | b06, d06 |
| 4.5 | Net pay (owed, not paid), payment method, masked account | `payroll.view` | Last four characters only | API reference flow | b07 |
| 4.6 | Exclude with a reason; include again | `payroll.prepare` + whole employer, not own | Excluded lines leave the obligation | API inputs, starter tests | — |
| 4.7 | Own pay read only | the person | 403 `own_record` on any change | API inputs test; E2E | b07 |
| 4.8 | From Employee 360: the latest line | `payroll.view` | `GET /payroll/employees/:id/latest`, scope-checked | API (read list) | — |

## PAY-005 Payroll finalisation (BUILT)

| # | Function | Who | Rule | Tests | Evidence |
|---|---|---|---|---|---|
| 5.1 | Runs, submitted first; summary, makers, warnings to read | `payroll.view` | — | E2E | d01, d03 |
| 5.2 | Approve and freeze | `payroll.approve` + whole employer | Not a maker; no own pay; not stale; acknowledgement required | API reference flow, maker-checker, stale tests; E2E | d01, d02 |
| 5.3 | Return for changes (reason) | `payroll.approve` + whole employer | Not the submitter | API maker-checker, stale tests; E2E | — |
| 5.4 | Reverse an approval (reason) | `payroll.approve` + whole employer | Not a maker; before close; no live instruction | API maker-checker, reference flow; E2E | — |
| 5.5 | Close the period | `payroll.approve` + whole employer | As 2.5 | E2E periods | — |
| 5.6 | Audit trail | `payroll.view` | Who, when, version and net on submit and approval | E2E | c03 |

## PAY-006 Disbursement status (PARTIAL)

| # | Function | Who | Rule | Tests | Evidence |
|---|---|---|---|---|---|
| 6.1 | Approved and reversed runs with their obligation and live instruction | `payroll.view` | — | API instructions test | c04 |
| 6.2 | Prepare an instruction | `payroll.prepare` + whole employer | Approved run (409); one live instruction (409); unverified accounts and zero lines held; idempotent | API reference flow, instructions; E2E | c04 |
| 6.3 | Approve an instruction | `payroll.approve` + whole employer | Not the preparer; not paid in it | API instructions test; E2E | — |
| 6.4 | Mark sent (simulated) | `payroll.prepare` + whole employer | Approved only; repeat refused | API reference flow; E2E | c04 |
| 6.5 | Cancel (reason) | `payroll.prepare` or `payroll.approve` | Prepared or approved only; sent refused (409 `instruction_sent`) | API reference flow, instructions | — |
| 6.6 | Settlement per line | — | **P:** always "Not settled — no evidence"; no route changes it | API "no route records a payment"; E2E (13 lines) | c04 |
| 6.7 | What verified settlement will need | — | Read only | E2E | c04 |

## PAY-007 Payroll accounting (PARTIAL)

| # | Function | Who | Rule | Tests | Evidence |
|---|---|---|---|---|---|
| 7.1 | Proposed entry per approved run; proposed reversal per reversed run; balanced | `payroll.view` | **P:** proposals only | API reference flow, reversal; vectors (journal) | c05 |
| 7.2 | Posted entries: none, and why | `payroll.view` | `posted` always empty | API reference flow; E2E | c05 |
| 7.3 | Obligation: approved, instructed, verified paid (not available) | `payroll.view` | — | API reference flow | c05 |

## Cross-cutting

| # | Function | Rule | Tests |
|---|---|---|---|
| X.1 | Licence | `payroll` add-on needs `hr`; Al-Noor only, from 15 October 2026; withdrawable in the demo | API licence tests; E2E |
| X.2 | Scope | Visible with one site of the employer; every change needs all of them; lines follow employees | API oracle test |
| X.3 | Suspended / revoked / not yet in force | Reads only while suspended; otherwise refused | API |
| X.4 | Training mode | Changes refused | API |
| X.5 | English and Urdu, RTL | 415 keys each, parity checked | Lint; E2E axe in both languages |
| X.6 | Phones, 200 % text, dark/high contrast, keyboard | No sideways scroll; nothing clipped; focus never hidden | E2E; smoke (Urdu 320 px / 200 %) |
