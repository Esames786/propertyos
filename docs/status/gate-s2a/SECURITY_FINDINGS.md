# Gate S.2a: security and privacy findings

This file records what was checked, what was found and what enforces each rule.

**Scope.** This is a prototype: the rules live in the typed mock server (`packages/fixtures/src/hr/`), and the backend must reproduce them at Gate H.

**Abbreviations used below:**
- "API" = `packages/fixtures/src/hr/hr.api.test.ts` (20 tests through the fail-closed mock server);
- "vectors" = `hr.test.ts` over `hr-roster.vectors.json` (52 cases);
- "E2E" = `tests/e2e/s2a.spec.ts` (23 tests on production builds);
- "smoke" = `tests/smoke/s2a.smoke.spec.ts` (Firefox and WebKit).

## 1. Findings in the foundation we continued (`311dfb5`) and how they were closed

| # | Finding | Risk | Closed by |
|---|---|---|---|
| H1 | GPT's six new permissions had no entry in `PERMISSION_MODULE` (`packages/contracts/src/access.ts`). For a screen or menu item that names only such a permission, `decideTarget` falls back to the `core` module, which every organisation holds | a menu item or page gated only by, say, `attendance.record` would have been offered **without the HR licence**. The API would still have refused it, but the UI would have promised it. Latent: nothing used the permissions yet | all eight HR permissions are mapped to `hr`. E2E: without the add-on, the office sees "not in your plan" (`module_not_licensed`) |

Nothing else in `311dfb5` was found to weaken access. Its catalogue entry (HR an optional add-on, in no preset, payroll still requiring HR) is correct and was kept.

## 2. Access rules and where they are enforced

| Rule | Enforced in | Proven by |
|---|---|---|
| **Licence.** HR only with the `hr` grant in force. The roster, attendance and the residents' tab also need the `hr.shifts` feature. No other society gains HR (no preset includes it); Al-Noor has it by an explicit, dated amendment | `requires('hr', …, feature)` on every route; `hrOf(ctx, { shifts })` | API (no add-on → refused; no feature → roster, attendance and residents' tab refused, staff records still work); E2E (not in your plan); `platform.test.ts` (presets unchanged, price unchanged) |
| **Society only.** A developer organisation with HR in its plan gets "not found" from society HR; its HR screens stay planned (Gate E) | `opsSite` | API; E2E (planned screen HR-001 for Larkspur) |
| **Tenant isolation.** Handlers read only the signed-in person's organisation; another organisation's records are never listed | transport partition; `hrState(ctx)` per tenant | API (another organisation never sees Al-Noor's staff) |
| **Legal entity and site.** A new employee's legal entity and site must be the organisation's own, and the site must belong to that entity. Duties need a site allocation in force; double booking is checked across all sites. A voucher must belong to the advance's legal entity | `hire`, `assignBlock` (`not_at_site`, `overlap`), `link` | vectors (multi-site overlap, allocation ended, back to back at another site); API |
| **Role permissions.** `hr.view` (no money), `hr.manage`, `shifts.manage`, `attendance.record`, `attendance.adjust`, `leave.manage`, `hr.documents.manage`, `hr.advances.manage` and `hr.advances.approve` are distinct. `hr.view` is not a salary permission; pay is not modelled (S.2b) | each route's `read`/`change` permission ([report §3.1](GATE_S2A_REPORT.md#31-model-and-mock-api)) | API (guard, treasurer and technician each see only their part); E2E (supervisor: roster and attendance only; finance: advances only; technician: nothing) |
| **Employee scoping.** A supervisor records attendance, and brings in cover, only for the departments he supervises, and cover only for today or last night | `recordsFor`; `assign` with `coverFor` | API (`not_your_department`; maintenance cannot check in a guard) |
| **Recording ≠ approving.** `attendance.record` cannot approve a correction (`attendance.adjust`). A correction never edits the record; it is a request until someone else decides it | separate routes and permissions | API; E2E (Shahid asks, cannot decide) |
| **Maker ≠ checker, by principal.** Nobody decides a correction, leave request or advance they raised (`maker_checker_required`), or one about themselves (`own_record`), even when holding the permission | `checker(h, requestedBy, employeeId)` | API (the manager's own leave and correction go to the administrator; nobody approves an advance for themselves); E2E (blocked rows) |
| **Personal data.** The full CNIC, phone, address and emergency contact are returned only with `hr.manage`; others get the CNIC masked. The directory carries no identity number, phone, address or money | `employee360` (`personal` only when `manage`); `employeeRow` | API (`not.toMatch(/35202-\d{7}\|\+92 300\|House \d+\|PKR\|amount/)`; `personal`, `advances` and document files undefined for `hr.view`) |
| **Documents.** Files, numbers and history only with `hr.documents.manage`. Numbers masked in lists. A CNIC document must carry the employee's own number. Files are simulated (name, type, size); nothing is stored | `documentView`, `addDocument` | API; E2E |
| **Money.** An approved request is an instruction, never "paid" and never owed; outstanding is 0 until a payment is linked. Only a **posted, unreversed** S.1 voucher of the same legal entity settles a step: the exact amount for the payment, at most what is owed for a repayment, each voucher once. S.1's own maker-checker and posting rules are untouched | `outstandingOf`, `link`, `candidates` | API (approved → no "paid" or disbursement; real vouchers prepared, approved and posted through S.1; reuse refused); E2E (UI settlement after a posted voucher) |
| **Effective dates.** Ending employment removes duties after the end date and keeps those before. An ended contract has no duty, no assignment and no residents' visibility. Rehiring starts a new period, never backdated over the old one | `changeStatus`, `assignBlock` (`not_employed`), `residentStaff` | API (Zubair ends 29 October; Javed's earlier rehire date refused); vectors |
| **Suspended organisations.** Reads continue; nothing new is recorded | `read` = `history_read`, `change` = `operational` | API (`tenant_suspended` on check-in and hire) |
| **Residents.** Resident portal + `hr` with `hr.shifts` for the resident's verified site; published weeks only.<br>Roles and posts; names only with consent and the "show name" choice.<br>Never salary, phone, CNIC, bank, advances, attendance history, address, documents or internal ids. Absent staff are not shown on duty. Independent of chat and the hub | `residentOps(ctx, { module: 'hr', feature: 'hr.shifts' })`, `residentStaff` | API (`not.toMatch(/\+92\|35202\|House\|PKR\|absent\|late\|attendance\|employeeId\|assignmentId\|Javed Akhtar/)`; a draft week shows nobody); E2E (chat and hub withdrawn, tab still works) |
| **Direct addresses and API.** Every HR route checks licence, permission and lifecycle on the server. Pages use the same targets, so a typed address shows the refusal, never data | `requires` on every route; route `targets` in `routes.tsx` | E2E (`/hr/employees-list` and `/hr/employee-advances` as the supervisor → `permission_missing`); register spec opens every address |
| **No emergency function.** No SOS, alarm, panic, dispatch or live location anywhere in HR. On duty now is an attendance view | — | code review; register notes on HR-010 and HR-011 |

## 3. Residual risks (prototype)

- **The server is a mock.** Everything is enforced in an in-browser mock server; a real backend must re-implement each rule server-side (Gate H).
- **The demo can withdraw HR.** The withdrawal (`demo-licence.ts`, sessionStorage) can only remove grants, never add them.
- **"Own record" depends on the employee–user link.** It relies on the employee record carrying the user's principal id. Every Al-Noor staff user is linked in the demo. A real system must require the link for any employee who is also a user, or the check cannot see that it is their own record.
- **Free text is shown as text.** This covers reasons, notes and posts; React escapes it, and nothing is rendered as rich text or links.
- **Identity numbers** are validated for format and uniqueness only, not against NADRA.
- **Consent for the residents' view** is recorded by the office (who and when). There is no staff-side confirmation in S.2a (no staff self-service).
- **Settlement.** The settlement screen trusts S.1's posting state. A voucher reversed after linking does not yet unlink itself; reversal after linking is not modelled (owner decision with S.2b).

## 4. Other findings (not security)

- **Times in Urdu were reordered.** The organisation's times carry Latin AM/PM in Urdu too, and the shared `DateTime` component does not isolate its text. Inside an Urdu line the bidi algorithm reordered "7:00 AM – 3:00 PM" into "AM – 3:00 PM 7:00". Found in the S.2a evidence review.
  - S.2a isolates each of its own times (`Time`, `ShiftTime`, `timeRangeText` in `hkit.tsx`; the residents' staff tab).
  - Other gates' screens that put a time inside an Urdu sentence may show the same. Isolating `DateTime` itself (`<bdi>` or `dir="auto"`) would fix them all, but it changes every gate's rendering and is left to the owner.
- **Tabs and select values at 320 px with 200 % text.** Shared tab rows scrolled their tabs out of sight, and long select values ran past the field. Both were fixed in the shared components ([report §5](GATE_S2A_REPORT.md#5-design-and-accessibility)).
