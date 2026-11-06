# PropertyOS UX backlog: triage of the frontend UX and accessibility audit

**Source:** `docs/status/audit/FRONTEND_UX_AUDIT.md` on branch `docs/frontend-ux-audit`, commit `1a0779e` (the audit of `a0d4a70`). 97 findings: P0 1, P1 9, P2 47, P3 40.
**Re-checked against:** `474e4ae` (`feature/gate-s2b-society-payroll`, the Issue #16 closure), the base of the Issue #18 hotfix.
**Rulings applied:** GPT, 6 November 2026: `bank.view` is a confidentiality boundary; building managers must not see raw bank lines, transaction references, full IBANs or unrelated residents' transfers; S.1 finance idempotency must be fixed in the server and the UI.
**Tracking:** GitHub Issue #18 asks that all 97 findings be kept in an organised triage backlog, with the critical P1 financial misstatements ranked for the next separately approved repair gate. This file is that backlog. `UX_BACKLOG.csv` has the same 97 rows.
**Kind of document:** planning only. No application code was changed, nothing was run, and no batch here is authorised by being listed.

## 1. What to fix first, and why

1. **Issue #18 is already under way** on `fix/s1-bank-feed-and-idempotency`. It covers FIN-01 (P0, bank feed visible to the building manager) and FIN-02 (P1, a second voucher, transfer or office collection silently returns the first). They are marked "in progress: Issue #18" below and are not planned again.
2. **The next repair gate should be B1, "Money truth"** (10 findings). These are the places where PropertyOS states money wrongly, or loses finance work, in a way someone will act on:
   - **RES-01:** a resident whose payment was reversed still sees "Paid" / "ادا شدہ" and "Amount received". While re-checking, a second gap turned up: the resident's total payable still subtracts the reversed payment's unapplied credit (see §3).
   - **COL-02:** the office payments list and the dashboard count reversed payments as received.
   - **COL-01:** a credit note can credit money that was already paid, which can drive the outstanding amount below zero beside a "Paid" badge.
   - **FIN-03:** a voucher saved as a draft cannot be found again.
   - **FIN-04:** an approval-policy draft loses its date, and "Send for approval" sends the stored rules rather than the ones on screen.
   - Five smaller fixes ride along because they touch the same money surfaces and the same test scenario: COL-12 (statement rows in the reversal case), COL-04, RES-02, RES-03 and RES-12.
3. **B2, "Accessibility blockers"** (8 findings) can run at the same time in its own worktree. It fixes three of the P1s: SH-01 (the palette cannot be closed on a phone), SH-02 (`MetricCard` hides its value) and OPS-01 (drawer refusals hidden behind the modal). It also carries five one-line fixes to the same shared components. B2 is small, has no finance overlap, and its only shared file with B1 (`DuesPages.tsx`) is a one-attribute change.
4. **Everything else waits for its dependencies.**
   - B3 and B4 change shared plumbing and the route table, which S.3 Rentals is also changing, so they come after S.3 merges.
   - B6 needs four owner decisions.
   - The rest are P2/P3 polish that can follow in any order.

"Rank" orders the whole open backlog by priority: recommended P1s first, then P2 and P3, each in its batch's working order. Batches are the units of authorisation, and B1 and B2 run in parallel, so B2's P1s rank among B1's. The ten highest open priorities:

1. **RES-01** (P1, B1): A reversed receipt is still shown to the resident as "Paid" / "ادا شدہ" with "Amount received"
2. **COL-02** (P1, B1): Reversed payments are listed and totalled in the office payments list and dashboard as ordinary payments received
3. **COL-01** (P1, B1): The credit-note "Open" amount ignores money already paid, so a credit can exceed what is unpaid
4. **FIN-03** (P1, B1): A voucher saved as a draft cannot be found again; Reverse leaves the address bar on a different record from the drawer
5. **FIN-04** (P1, B1): Approval-policy draft: the effective date resets to 2026-11-01, and "Send for approval" drops unsaved rule edits
6. **SH-01** (P1, B2): On a phone the full-screen command palette has no visible way to close it
7. **OPS-01** (P1, B2): Request 360 drawer actions that fail show their reason behind the modal; the drawer just stays open
8. **SH-02** (P1, B2): `MetricCard` hides its value from screen readers whenever the card is not a link; `StatTile` leaves `context` out of the name
9. **COL-12** (P1, B1): The statement has duplicate row keys when a payment is reversed (payment and reversal share `refId`)
10. **RES-02** (P1, B1): "My properties" shows "In credit Rs 0.00" for every flat in credit

## 2. How the backlog was built

- **Re-check against the current base.**
  - Between the audit target `a0d4a70` and `474e4ae`, only payroll code and its tests changed: `apps/backoffice/src/pages/society/payroll/*`, `packages/fixtures/src/payroll/*`, `packages/contracts/src/payroll.ts`, the payroll dictionaries, `tests/e2e/s2b.spec.ts`, `tests/evidence/gates2b.evidence.spec.ts` and `tests/support/society.ts`.
  - The audit excluded payroll, so no audited file changed. Every file and line cited by the audit is the same at `474e4ae`.
- **Findings re-read in the code at `474e4ae`** (26), to get exact implementation notes:
  - all 8 open P1s;
  - every B1 finding;
  - SH-04, SH-06, RES-06, RES-07, FIN-05, FIN-13, FIN-19, FIN-20, OPS-02, HR-01, HQ-01, X-08 and X-09.
  - The rest were checked against the unchanged-file list only. Their "Confidence and re-check" field says which applies.
- **Nothing was run.** No app, Vitest or Playwright run (the machine is shared). This backlog is as static as the audit.
- **Not reproducible: none.** No finding was in payroll, and none was fixed between the two commits.
- **Small corrections to the audit**, found while re-checking:
  - **SH-02:** the HQ ARR and CRM budget call sites, which the audit lead had not re-checked, are confirmed. Neither card has an `href`, so both hide their value.
  - **RES-01:** the bill page's "Payments on this bill" gap, marked "inferred" in the audit, is confirmed. `dues-portal-handlers.ts:309-311` neither leaves out nor flags reversed payments.
  - **OPS-02:** the server also requires a completion photo (`requests-handlers.ts:428`), so the defect is the word "optional", not the rule.
  - **HR-01 and HR-05:** the audit calls the advance screens HR-009/010. In the screen register they are HR-007 (`/backoffice/hr/employee-advances`) and HR-008 (`/backoffice/hr/employee-advance-settlement`). HR-009 and HR-010 are other screens.
  - **Routes:** the audit names some screens without a route. Routes added here come from `docs/ui/screen-register.csv` and the route helpers in `apps/*/src/nav.config.ts`.

### Status

| Status | Findings |
|---|---|
| open | 91 (every finding not listed below; see the index in §7) |
| in progress: Issue #18 | 2: FIN-01, FIN-02 |
| not reproducible | 0 |
| needs an owner decision | 4: FIN-06, FIN-07, HR-01, RES-21 |

## 3. New observations made while planning (not counted in the 97)

| Ref | What | Where | Folded into |
|---|---|---|---|
| N-1 | The resident's total payable subtracts the unapplied credit of reversed payments. The office side and "My properties" leave reversed payments out (`state.ts` `creditByAccount`, `household-handlers.ts:66`); the resident dues position does not, and `executeReversal` never clears `unapplied`. | `packages/fixtures/src/society/dues-portal-handlers.ts:142` | RES-01 (same scenario, same fix) |
| N-2 | `MyProperty.siteName` is hard-coded as 'Al-Noor Residency'. | `packages/fixtures/src/identity/household-handlers.ts:70` | RES-02 and COL-16 |

## 4. Priority changes

Two findings are raised. None is lowered. Three P2s (COL-04, RES-03, RES-12) keep their severity but sit in B1 because they share its files and its test scenario.

| ID | Audit | Recommended | Reason |
|---|---|---|---|
| COL-12 | P2 | P1 | The statement is a money statement, and the duplicate key appears exactly in the reversal case B1 fixes; the fix is tiny and keeps the reversal story consistent everywhere. |
| RES-02 | P2 | P1 | A wrong money figure ("In credit Rs 0.00") on every flat in credit meets the audit's own P1 definition; the resident may pay again or dispute. |

## 5. Repair batches

Each batch can be authorised on its own. A batch lists every finding it closes; anything not listed is out of scope for that batch.

| Batch | Name | Findings | P0 | P1 | P2 | P3 | Recommended P1 | Sizes (S/M/L) |
|---|---|---:|---:|---:|---:|---:|---:|---|
| B0 | Issue #18 security hotfix (in progress, not planned here) | 2 | 1 | 1 | 0 | 0 | 1 | 0 / 0 / 2 |
| B1 | Money truth: financial misstatements and lost finance work | 10 | 0 | 5 | 5 | 0 | 7 | 5 / 5 / 0 |
| B2 | Accessibility blockers and one-line shared fixes | 8 | 0 | 3 | 2 | 3 | 3 | 7 / 1 / 0 |
| B3 | Failures and rules made visible | 16 | 0 | 0 | 11 | 5 | 0 | 7 / 8 / 1 |
| B4 | Access-aware links and honest dead ends | 13 | 0 | 0 | 8 | 5 | 0 | 9 / 2 / 2 |
| B5 | Flow safety: the right record, confirmed destructive actions | 7 | 0 | 0 | 4 | 3 | 0 | 6 / 1 / 0 |
| B6 | Financial and status wording | 8 | 0 | 0 | 6 | 2 | 0 | 6 / 2 / 0 |
| B7 | Deep links, filters and the contextual chain | 11 | 0 | 0 | 2 | 9 | 0 | 7 / 3 / 1 |
| B8 | Urdu, RTL and bidi | 6 | 0 | 0 | 1 | 5 | 0 | 4 / 1 / 1 |
| B9 | Focus, names and announcements | 9 | 0 | 0 | 5 | 4 | 0 | 7 / 2 / 0 |
| B10 | Phone layout and themes | 7 | 0 | 0 | 3 | 4 | 0 | 6 / 1 / 0 |
| **Total** | | **97** | **1** | **9** | **47** | **40** | **11** | 64 / 26 / 7 |

- **B0 · Issue #18 security hotfix (in progress, not planned here)** (2): FIN-01, FIN-02
- **B1 · Money truth: financial misstatements and lost finance work** (10): RES-01, COL-02, COL-01, FIN-03, FIN-04, COL-12, RES-02, COL-04, RES-03, RES-12
- **B2 · Accessibility blockers and one-line shared fixes** (8): SH-01, OPS-01, SH-02, SH-04, RES-06, SH-10, SH-11, SH-12
- **B3 · Failures and rules made visible** (16): X-01, X-09, X-02, X-04, COL-11, COL-13, RES-04, RES-05, HR-02, HR-05, HQ-03, HQ-04, OPS-02, OPS-06, RES-13, RES-20
- **B4 · Access-aware links and honest dead ends** (13): X-03, SH-05, SH-06, SH-07, FIN-05, FIN-19, FIN-20, COL-06, COL-17, HQ-01, HQ-02, HQ-05, HQ-06
- **B5 · Flow safety: the right record, confirmed destructive actions** (7): RES-07, FIN-13, RES-08, FIN-17, RES-19, SH-03, RES-18
- **B6 · Financial and status wording** (8): FIN-08, FIN-09, FIN-06, FIN-07, HR-01, COL-10, COL-15, X-08
- **B7 · Deep links, filters and the contextual chain** (11): X-05, COL-03, COL-05, FIN-15, FIN-16, OPS-03, OPS-04, HR-03, RES-15, COL-16, COL-18
- **B8 · Urdu, RTL and bidi** (6): X-06, X-07, COL-07, COL-14, FIN-14, RES-14
- **B9 · Focus, names and announcements** (9): COL-09, COL-08, FIN-10, FIN-11, RES-09, RES-16, RES-17, OPS-05, FIN-18
- **B10 · Phone layout and themes** (7): FIN-12, RES-10, RES-11, RES-21, SH-08, SH-09, HR-04

### 5.1 What each batch is for

- **B0 · Issue #18 (in progress).**
  - Covers FIN-01 and FIN-02, on `fix/s1-bank-feed-and-idempotency`, based on `474e4ae`.
  - Stops for GPT and owner review. Nothing here changes its scope.
- **B1 · Money truth.**
  - **Findings:** RES-01, COL-02, COL-01, FIN-03 and FIN-04 (P1), plus COL-12, COL-04, RES-03, RES-02 and RES-12.
  - **One story for reviewers:** a reversed payment, a credited bill or a draft voucher must read the same way on every office and resident surface.
  - **Shared test scenario:** reverse an office-cash payment that left unapplied credit on A-101, then check the receipt, Home, the bill, My properties, the payments list, the dashboard, the statement and the credit-note drawer, in EN and UR.
- **B2 · Accessibility blockers.**
  - **P1 findings:** SH-01, SH-02, OPS-01.
  - **One-line fixes in the same shared components:** SH-04, RES-06, SH-10, SH-11, SH-12.
  - All the changes are additive.
- **B3 · Failures and rules made visible.**
  - **Shared plumbing:** X-01 (silent failures) and X-09 (`ConfirmDialog` loses the reason), plus X-02, X-04 and every "error not at the field" finding.
  - **Behaviour change:** the failure contract of `Form` and `ConfirmDialog` changes. That is why B3 waits for S.3.
- **B4 · Access-aware links.**
  - **Pattern:** X-03 (links to targets the viewer cannot open) and SH-05 ("Planned" shown for a permission miss), plus the dead ends that follow from them.
  - **Shared module:** one access-target module serves both the route table and the HQ preview (HQ-02).
- **B5 · Flow safety.**
  - Stale state carried into the wrong record: RES-07, FIN-13.
  - One-tap destructive actions: RES-08, FIN-17.
  - Navigation that drops context: SH-03, RES-18, RES-19.
- **B6 · Financial and status wording.** Words that state a money or status fact that is not true yet. Four of them need an owner decision, and all Urdu wording goes to a native reader.
- **B7 · Deep links and filters.** Figures and links that open a different list from the one they count, and search that is not kept in the URL.
- **B8 · Urdu, RTL and bidi.**
- **B9 · Focus, names and announcements.**
- **B10 · Phone layout and themes.**

### 5.2 Dependencies

```
Issue #18 (FIN-01, FIN-02) ──accepted──► B1  (hard for FIN-03: same voucher create(); soft for COL-02/COL-04: same collections files)
        │                                └─► B7 (COL-05, FIN-15 build on B1)
        ├──merged──► B3 (finance drawers), B4 (bank-target links reuse #18's gate), B5 (FIN-17),
        │            B6 (FIN-08), B7 (FIN-15/16, X-05), B8 (X-06, COL-14), B9 (COL-09, FIN-10), B10 (FIN-12)
S.3 Rentals ──merged──► B3 (ConfirmDialog, Form, hkit), B4 (routes.tsx, tenantWorkspace.ts, role-templates.ts),
        │               B6 (common.json), B7 (nav.config.ts for HR-03)
        └─ coordinate ─► B2 (StatTile and SelectControl names: whoever lands second updates selectors)
B3 (X-09) ──► B5 (RES-08, FIN-17 use the improved dialog); B2 (OPS-01) ──► B3 (OPS-02, same drawer)
Owner decisions ──► OD-1 confirms B1's COL-01 default; OD-2…OD-5 unblock B6; OD-6 unblocks RES-21 in B10
```

- **Issue #18 → B1.**
  - FIN-03 edits the same `create()` in `CashbookPage.tsx` that FIN-02 rewrites, so it must start from the accepted Issue #18 commit.
  - COL-02 and COL-04 edit `collections-handlers.ts` and `collections-read.ts`. Issue #18 edits those files for proof candidates and the dashboard's bank KPIs. Different regions, but B1 should also branch from the accepted Issue #18 commit to avoid a rebase during review.
  - The B1 findings in the resident app (RES-01/02/03/12) do not touch Issue #18's files.
- **Issue #18 → S.3.** Issue #18 says S.3 Rentals takes the accepted hotfix before it reuses bank or owner statements.
- **B1 → S.3: no code conflict.** S.3 imports only `problem` and `stamp` from the society fixtures. Its owner statements and payouts should still follow B1's rule: a reversed receipt is never money received, and never "Paid". S.3's reviewer should check that once B1 is accepted.
- **S.3 → B2, B3, B4, B6, B7.**
  - **Shared files:** S.3 modifies `routes.tsx`, `nav.config.ts` (both apps), `tenantWorkspace.ts`, `role-templates.ts` and `common.json`.
  - **Shared components:** S.3 uses `ConfirmDialog` 6 times, `SelectControl` 9 times, `StatTile` 6 times, and the HR kit's `DateInput`, `SearchSelect` and field-error helpers.
  - **B2:** additive, so it can land either side of S.3, but accessible names change.
  - **B3 and B4:** change behaviour or the route table, so they start after S.3 merges.

### 5.3 Suggested authorisation order

| Step | Batches | Starts when | Why |
|---|---|---|---|
| R1 | B1, with B2 in parallel | Issue #18 accepted by GPT and the owner | All five critical P1 money and work-loss defects, plus the three accessibility P1s |
| R2 | B3, then B5 | S.3 merged | The shared error and dialog contract, then the flows that use it |
| R3 | B4 and B7 | S.3 merged; Issue #18 merged | Access-aware links and deep links share helpers and the route table |
| R4 | B6 | OD-2 to OD-5 answered; native Urdu reader available | Wording that states money and status facts |
| R5 | B8, B9, B10 | Any time after R2 | P2/P3 polish; RES-21 waits for OD-6 |

### 5.4 Done means the same thing in every batch

- **Checks:** full build, typecheck, lint (with logical CSS and the i18n check), Vitest, and the batch's own Playwright tests.
- **Browser runs:** run Playwright one suite at a time across worktrees (the machine is shared), with retries off when reporting historical runs.
- **Coverage:** EN and UR; 320 px at 200 % text with `layoutProblems`; `scanA11y` (axe) on every changed screen. Use Firefox and WebKit where the batch touches inputs or focus.
- **Security:** every new server rule gets a negative API test showing that a refusal changes nothing, and that it gives no oracle about another person's record.
- **Honesty:** no WCAG claim without the manual screen-reader pass. Never mark a simulated bank or payment event as settled without independent matched evidence.
- **Stop:** each batch stops for GPT and owner review, with its branch SHA and honest results. No merge to `main` and no deployment.

## 6. Owner decisions this backlog needs

| Ref | Finding(s) | Question | Recommended answer | Blocks |
|---|---|---|---|---|
| OD-1 | COL-01 | May a credit note credit money that has already been paid? | **No, for now.** Cap credits at amount − paid − credited. Crediting a paid line (a refund, or credit carried to the account) is a separate feature with its own approval. | Nothing (B1 applies the recommended default unless the owner rules otherwise) |
| OD-2 | FIN-06 | When does an ownership transfer count as "Completed": at certificate issue, or once the payer change is approved? This touches the S.1 open item on the owner of record after a transfer. | Completed only when the certificate is issued **and** the payer change is approved (or recorded as not needed). Until then: "Certificate issued, payer change pending". | FIN-06 (B6) |
| OD-3 | FIN-07 | Approve the clearance-certificate wording for dues that were outstanding and waived, in English and Urdu. | "Dues of {amount} were outstanding on {date} and were waived under approval {ref}." The no-dues sentence is used only when nothing was outstanding. | FIN-07 (B6) |
| OD-4 | HR-01 | Are the 6-instalment (advance) and 36-instalment (loan) limits the society's adopted policy, or system limits pending a policy? Today the server enforces them while the screen says no limits are adopted. | State them as the system's current limits, until the society adopts its own. | HR-01 (B6) |
| OD-5 | X-08, COL-10 | How should clients see features that are not built yet? | Plain "Planned" or "Not available yet", with no gate, stage or decision codes; built features are never listed as coming later. | Nothing (recommended default applies) |
| OD-6 | RES-21 | At 320 px the resident bottom bar's labels fall to about 9 px, which conflicts with the approved 112 % chrome cap. Choose: two-line labels, fewer items plus "More", or icon-only items with the label kept as the accessible name. | Fewer items plus "More" at the narrowest width, keeping visible labels at or above the 11 px base. | RES-21 (B10) |

**Engineering choices for GPT review** (not owner decisions):

- **X-01:** a global default error toast, or per-call handling with a lint guard. Per-call handling is recommended, to avoid double messages.
- **B1's base:** the accepted Issue #18 commit (recommended), or `474e4ae` with a rebase before review.

## 7. Index of all 97 findings

Sorted by ID. "Rank" is the priority order across the open backlog (see §1); "-" means in progress under Issue #18.

| ID | Audit sev. | Rec. priority | Batch | Rank | Size | Status | Decision | Finding |
|---|---|---|---|---|---|---|---|---|
| [X-01](#x-01) | P2 | P2 | B3 | 19 | L | open | — | Failed actions are silently swallowed (no toast, alert or announcement; unhandled promise rejection) |
| [X-02](#x-02) | P2 | P2 | B3 | 21 | M | open | — | Submit buttons are disabled by minimum lengths nobody states |
| [X-03](#x-03) | P2 | P2 | B4 | 35 | L | open | — | Links and figures shown to people who cannot open the target (planned page, 403 or a drawer that never mounts) |
| [X-04](#x-04) | P3 | P3 | B3 | 22 | M | open | — | Failed queries leave a skeleton forever or a silently empty list |
| [X-05](#x-05) | P3 | P3 | B7 | 63 | L | open | — | Search is not kept in the URL, empty states ignore an active search or filter, and returning from a proof loses the filter |
| [X-06](#x-06) | P3 | P3 | B8 | 74 | L | open | — | Sentences assembled in code, Latin punctuation inside Urdu, lists joined with ", ", a missing plural |
| [X-07](#x-07) | P3 | P3 | B8 | 75 | M | open | — | Direction glyphs are not mirrored in Urdu |
| [X-08](#x-08) | P3 | P3 | B6 | 62 | M | open | OD-5 | Internal gate and stage codes appear in client-facing copy ("Arrives in D", "Coming in Stage 2", "needs S.2b", "(D-46)") |
| [X-09](#x-09) | P2 | P2 | B3 | 20 | M | open | — | `ConfirmDialog` closes and loses the typed reason when the server refuses it, and its text is not tied to the dialog |
| [SH-01](#sh-01) | P1 | P1 | B2 | 6 | S | open | — | On a phone the full-screen command palette has no visible way to close it |
| [SH-02](#sh-02) | P1 | P1 | B2 | 8 | S | open | — | `MetricCard` hides its value from screen readers whenever the card is not a link; `StatTile` leaves `context` out of the name |
| [SH-03](#sh-03) | P2 | P2 | B5 | 53 | S | open | — | "Open help" and "Practice" from the palette or a finished tour drop the page's record |
| [SH-04](#sh-04) | P2 | P2 | B2 | 14 | S | open | — | `SelectControl` accepts `errorKey` but never marks itself invalid, so the error never shows |
| [SH-05](#sh-05) | P2 | P2 | B4 | 36 | M | open | — | A built screen says "Planned" when the person's role cannot open it |
| [SH-06](#sh-06) | P2 | P2 | B4 | 37 | S | open | — | The design-system lab leaks into client flows (route error page and the command-palette route) |
| [SH-07](#sh-07) | P2 | P2 | B4 | 38 | M | open | — | The Quick create page disables actions that work in the header menu |
| [SH-08](#sh-08) | P3 | P3 | B10 | 93 | S | open | — | Dark theme: selected text is unreadable (about 1.1:1), and the modal scrim has no dark value |
| [SH-09](#sh-09) | P3 | P3 | B10 | 94 | S | open | — | The tour spotlight ignores the D.1 "High contrast" value |
| [SH-10](#sh-10) | P3 | P3 | B2 | 16 | S | open | — | Keyboard focus on a workspace tab panel is invisible |
| [SH-11](#sh-11) | P3 | P3 | B2 | 17 | S | open | — | Calendar month buttons are named "Back" and "Next" |
| [SH-12](#sh-12) | P3 | P3 | B2 | 18 | S | open | — | `CheckboxField` error and description are not tied to the checkbox |
| [COL-01](#col-01) | P1 | P1 | B1 | 3 | M | open | OD-1 | The credit-note "Open" amount ignores money already paid, so a credit can exceed what is unpaid |
| [COL-02](#col-02) | P1 | P1 | B1 | 2 | M | open | — | Reversed payments are listed and totalled in the office payments list and dashboard as ordinary payments received |
| [COL-03](#col-03) | P2 | P2 | B7 | 64 | S | open | — | Building cards on the collections dashboard lose their building filter |
| [COL-04](#col-04) | P2 | P2 | B1 | 11 | S | open | — | "Waiting for verification" counts proofs sent back to the resident, reduces "Still owed" by them, and its link opens a different list |
| [COL-05](#col-05) | P2 | P2 | B7 | 65 | M | open | — | The invoice workspace never shows the payments that settled it |
| [COL-06](#col-06) | P2 | P2 | B4 | 42 | S | open | — | "Change payer" can open a drawer with nobody to choose |
| [COL-07](#col-07) | P2 | P2 | B8 | 76 | S | open | — | Numbering patterns and the IBAN field are reordered in Urdu |
| [COL-08](#col-08) | P2 | P2 | B9 | 81 | S | open | — | Payment-method switches are named only "Allowed" / "Not allowed" |
| [COL-09](#col-09) | P2 | P2 | B9 | 80 | M | open | — | Proof review loses keyboard focus after Verify and when moving to the next proof |
| [COL-10](#col-10) | P2 | P2 | B6 | 60 | S | open | OD-5 | "Coming in later stages" lists features that are built (maintenance, visitors, notices) and says "Arrives in D" |
| [COL-11](#col-11) | P2 | P2 | B3 | 23 | S | open | — | The opening-balances import spins forever on a stale `?import=` |
| [COL-12](#col-12) | P2 | P1 | B1 | 9 | S | open | — | The statement has duplicate row keys when a payment is reversed (payment and reversal share `refId`) |
| [COL-13](#col-13) | P2 | P2 | B3 | 24 | M | open | — | Server field errors are not shown at the field, and some don't say which line |
| [COL-14](#col-14) | P3 | P3 | B8 | 77 | S | open | — | Bank import drawer: an Urdu sentence is forced left-to-right, and the file picker stays in English |
| [COL-15](#col-15) | P3 | P3 | B6 | 61 | S | open | — | Charge and payment wording are blurred ("{{flat}} pays" for a charge; "Settles" for both previews and issued receipts) |
| [COL-16](#col-16) | P3 | P3 | B7 | 72 | M | open | — | Al-Noor-specific IDs and copy are hard-coded |
| [COL-17](#col-17) | P3 | P3 | B4 | 43 | S | open | — | Opening-balances and import actions offered without `site.manage` |
| [COL-18](#col-18) | P3 | P3 | B7 | 73 | S | open | — | Copy and state defects on the society dashboard, roster and exemptions |
| [FIN-01](#fin-01) | P0 | P0 | B0 | - | L | in progress: Issue #18 | — | The building manager sees bank statement lines (other residents' transfers, transaction IDs, IBANs) contrary to the `bank.view` boundary |
| [FIN-02](#fin-02) | P1 | P1 | B0 | - | L | in progress: Issue #18 | — | A second voucher, transfer or office collection in the same visit silently returns the first (idempotency key minted once per page; server replay unbound) |
| [FIN-03](#fin-03) | P1 | P1 | B1 | 4 | M | open | — | A voucher saved as a draft cannot be found again; Reverse leaves the address bar on a different record from the drawer |
| [FIN-04](#fin-04) | P1 | P1 | B1 | 5 | M | open | — | Approval-policy draft: the effective date resets to 2026-11-01, and "Send for approval" drops unsaved rule edits |
| [FIN-05](#fin-05) | P2 | P2 | B4 | 39 | S | open | — | The close drawer's "Count cash" link opens a count form the viewer cannot submit, and drops the filters |
| [FIN-06](#fin-06) | P2 | P2 | B6 | 57 | M | needs an owner decision | OD-2 | An ownership transfer says "Completed" while the payer change is still pending, and that step never shows as done |
| [FIN-07](#fin-07) | P2 | P2 | B6 | 58 | S | needs an owner decision | OD-3 | The clearance certificate says no dues were outstanding when they were waived |
| [FIN-08](#fin-08) | P2 | P2 | B6 | 55 | S | open | — | Vouchers awaiting approval are described as "Paid out" / "ادا کی گئی" before anything is approved or posted |
| [FIN-09](#fin-09) | P2 | P2 | B6 | 56 | S | open | — | The reminder preview labels channels "Sent" before anything is sent |
| [FIN-10](#fin-10) | P2 | P2 | B9 | 82 | S | open | — | Bulk-collection "Cash" and "Cheque" buttons do not name the flat or payer |
| [FIN-11](#fin-11) | P2 | P2 | B9 | 83 | S | open | — | Ownership progress steps show done or not done only visually |
| [FIN-12](#fin-12) | P2 | P2 | B10 | 89 | S | open | — | Finance dashboard account rows collapse to a one-word column on phones |
| [FIN-13](#fin-13) | P2 | P2 | B5 | 49 | S | open | — | The export review drawer keeps the previous request's choices; "Approve" then sends A's dataset list for B |
| [FIN-14](#fin-14) | P3 | P3 | B8 | 78 | S | open | — | Urdu approval titles break around English account names |
| [FIN-15](#fin-15) | P3 | P3 | B7 | 66 | M | open | — | Finance dashboard figures open lists that don't match the figure |
| [FIN-16](#fin-16) | P3 | P3 | B7 | 67 | S | open | — | Action links land on a list instead of the action |
| [FIN-17](#fin-17) | P3 | P3 | B5 | 51 | S | open | — | One-tap destructive actions (cancel invitation; "Hand it back" for a cheque), and the return memo sits far below the dialog |
| [FIN-18](#fin-18) | P3 | P3 | B9 | 88 | S | open | — | Why an export dataset was excluded is told only to screen readers |
| [FIN-19](#fin-19) | P3 | P3 | B4 | 40 | S | open | — | ADM-003 and ADM-023 routes have no route guard (raw 403 instead of the access outcome) |
| [FIN-20](#fin-20) | P3 | P3 | B4 | 41 | S | open | — | Small layout and flow gaps: "Close {period}" without `period.close`; count grid always two columns; reminder rules editor has no Cancel |
| [OPS-01](#ops-01) | P1 | P1 | B2 | 7 | M | open | — | Request 360 drawer actions that fail show their reason behind the modal; the drawer just stays open |
| [OPS-02](#ops-02) | P2 | P2 | B3 | 31 | S | open | — | The completion drawer calls the photo "optional" but requires one |
| [OPS-03](#ops-03) | P3 | P3 | B7 | 68 | S | open | — | The "Expected today" figure opens the wrong gate tab |
| [OPS-04](#ops-04) | P3 | P3 | B7 | 69 | S | open | — | The issues board ignores the registered `?status=` filter |
| [OPS-05](#ops-05) | P3 | P3 | B9 | 87 | S | open | — | The gate's "Updated" time sits in a live region and is re-announced every 15 seconds |
| [OPS-06](#ops-06) | P3 | P3 | B3 | 32 | M | open | — | Buttons that do nothing until another query loads (or forever if it fails); a dead "Request leave" for `leave.manage`-only roles |
| [HR-01](#hr-01) | P2 | P2 | B6 | 59 | S | needs an owner decision | OD-4 | Advance wording asserts facts the system cannot verify, and the limits text contradicts the server's enforced limits |
| [HR-02](#hr-02) | P2 | P2 | B3 | 27 | M | open | — | New employee form: no error summary for client checks, and role and date errors are not tied to their fields |
| [HR-03](#hr-03) | P3 | P3 | B7 | 70 | S | open | — | Employee 360 advance rows link to the generic Advances list (a rejected or withdrawn advance is not visible there) |
| [HR-04](#hr-04) | P3 | P3 | B10 | 95 | S | open | — | Roster grid times use a different format from the rest of HR |
| [HR-05](#hr-05) | P3 | P3 | B3 | 28 | S | open | — | HR drawers: a free-text month field in some browsers, and errors only in the summary |
| [RES-01](#res-01) | P1 | P1 | B1 | 1 | M | open | — | A reversed receipt is still shown to the resident as "Paid" / "ادا شدہ" with "Amount received" |
| [RES-02](#res-02) | P2 | P1 | B1 | 10 | S | open | — | "My properties" shows "In credit Rs 0.00" for every flat in credit |
| [RES-03](#res-03) | P2 | P2 | B1 | 12 | S | open | — | Home loses both "Pay" and "See your proof" when the proof is waiting for the bank or an exception |
| [RES-04](#res-04) | P2 | P2 | B3 | 25 | S | open | — | Proof form: server field errors look like help text and are not announced |
| [RES-05](#res-05) | P2 | P2 | B3 | 26 | M | open | — | Re-send proof: no field errors and no file checks; the transfer date cannot be changed |
| [RES-06](#res-06) | P2 | P2 | B2 | 15 | S | open | — | Hidden file inputs are an invisible Tab stop |
| [RES-07](#res-07) | P2 | P2 | B5 | 48 | S | open | — | Repair, issue and pass sheets keep the previous record's typed text, so a message can be sent to the wrong repair |
| [RES-08](#res-08) | P2 | P2 | B5 | 50 | M | open | — | Irreversible resident actions run on a single tap |
| [RES-09](#res-09) | P2 | P2 | B9 | 84 | S | open | — | Welcome wizard: focus is lost and step changes are not announced |
| [RES-10](#res-10) | P2 | P2 | B10 | 90 | S | open | — | The organisation name in the phone header breaks mid-word |
| [RES-11](#res-11) | P2 | P2 | B10 | 91 | S | open | — | The visitor pass code will likely overflow its card at large text sizes |
| [RES-12](#res-12) | P2 | P2 | B1 | 13 | S | open | — | A bill settled by a credit note is labelled "Paid", and the bill page offers Pay while a proof covering it is pending |
| [RES-13](#res-13) | P3 | P3 | B3 | 33 | S | open | — | "Copy the invitation" says "Copied" even when copying failed |
| [RES-14](#res-14) | P3 | P3 | B8 | 79 | S | open | — | Masked phone numbers are not isolated inside Urdu sentences |
| [RES-15](#res-15) | P3 | P3 | B7 | 71 | S | open | — | The tour points to Receipts and Statement links that are not on the Bills page |
| [RES-16](#res-16) | P3 | P3 | B9 | 85 | M | open | — | Custom radio groups have no arrow-key navigation and are labelled twice |
| [RES-17](#res-17) | P3 | P3 | B9 | 86 | S | open | — | The repair card is a `<button>` wrapping an `<ol>` (invalid content, very long name) |
| [RES-18](#res-18) | P3 | P3 | B5 | 54 | S | open | — | Notification items navigate twice, so Back needs two presses |
| [RES-19](#res-19) | P3 | P3 | B5 | 52 | S | open | — | Gate prompt: Escape dismisses it for good, and the countdown can sit at 0 with live buttons |
| [RES-20](#res-20) | P3 | P3 | B3 | 34 | S | open | — | The invitation page reports any load error as "not found", and a failed code send only refetches |
| [RES-21](#res-21) | P3 | P3 | B10 | 92 | M | needs an owner decision | OD-6 | Bottom-bar labels shrink to about 9 px on a 320 px phone |
| [HQ-01](#hq-01) | P2 | P2 | B4 | 44 | S | open | — | "Preview as client" lists an address that does not exist (`/backoffice/sal/booking-list`) and says it opens |
| [HQ-02](#hq-02) | P2 | P2 | B4 | 45 | L | open | — | The preview's access rule ignores the conditions the backoffice routes apply |
| [HQ-03](#hq-03) | P2 | P2 | B3 | 29 | S | open | — | The Create tenant wizard fails silently, or loads forever, on errors |
| [HQ-04](#hq-04) | P2 | P2 | B3 | 30 | M | open | — | HQ configuration problems show raw field paths (in English, even in Urdu) and never mark the fields |
| [HQ-05](#hq-05) | P3 | P3 | B4 | 46 | S | open | — | The preview's phone bar differs from the client's real bar for finance roles |
| [HQ-06](#hq-06) | P3 | P3 | B4 | 47 | S | open | — | HQ tour completion offers "Try a practice task", which just opens the dashboard |

## 8. Catalogue

Grouped by batch, in rank order. File references are `path (:line)` at `474e4ae`, which equals `a0d4a70` for every audited file. Tests name the suites they belong in:

- **API:** Vitest in `packages/fixtures/src/**/*.api.test.ts`.
- **Component:** Vitest and Testing Library in `packages/ui/src/**/*.test.tsx`.
- **Browser:** Playwright in `tests/e2e/*.spec.ts`.
- **Helpers:** `scanA11y` from `tests/support/axe.ts`, and `layoutProblems` / `focusWalk` from `tests/support/layout.ts`.
- **Viewports:** `VIEWPORTS.reflow` (320 × 640) with the display text size at 200 %.

### B0 · Issue #18 security hotfix (in progress, not planned here) (2)

#### FIN-01

**In progress · P0 · The building manager sees bank statement lines (other residents' transfers, transaction IDs, IBANs) contrary to the `bank.view` boundary**

- **Priority:** P0 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** BANK-002 `/backoffice/bank/bank-account-360-workspace?record=ben_anr_main&tab=lines`; FIN-009 `/backoffice/fin/transfer-proof-review?record=psb_…` (read-only); FIN-001 bank KPIs
- **Status:** in progress: Issue #18 · **Size:** L
- **Files to change:** Owned by Issue #18: `packages/fixtures/src/society/finance/handlers-books.ts` (:305, :328-330); `packages/fixtures/src/society/collections-handlers.ts` (:134); `apps/backoffice/src/prototype/routes.tsx` (:141); `apps/backoffice/src/pages/society/finance/AccountsPages.tsx` (:84, :193-231); `apps/backoffice/src/pages/society/collections/ProofReview.tsx` (:189-191); `PaymentWorkspace.tsx` (:248-267); `packages/fixtures/src/society/finance/overview.ts` (bank KPIs)
- **Implementation note:** Not planned again here. GPT ruling (6 Nov 2026): `bank.view` is a confidentiality boundary; building managers must not see raw bank lines, transaction references, full IBANs or unrelated residents' transfers. Being fixed server-side and in the UI under Issue #18 on `fix/s1-bank-feed-and-idempotency`. After it lands, re-check the bank-target rows of X-03, FIN-15 ("Settled in the bank"), FIN-12 (the unreconciled-lines badge) and COL-14 against the new gate, and reuse its helper instead of adding a second one.
- **Acceptance criteria:** As defined in Issue #18 (no statement lines, candidates, bank transaction IDs, counterparties or full IBANs, and no bank-line counts or amounts, for roles without `bank.view` or `bank.reconcile`, on every path; refusals make no mutation).
- **Tests to add:** As defined in Issue #18 (Imran with `cashbook.view` and no `bank.view`: direct GET, proof candidates, account and statement history, dashboard and exports, EN/UR deep links; finance roles keep their flow).
- **Risk and blast radius:** High: finance read models shared by S.1, C.2 and (later) S.3 owner statements. Contained by Issue #18's own review.
- **Depends on:** Issue #18 (`fix/s1-bank-feed-and-idempotency`, base 474e4ae). S.3 Rentals must consume the accepted hotfix before it reuses bank or owner statements.
- **Confidence and re-check:** verified in code (lead re-check); seen in evidence `gate-c2/screenshots/m05-manager-reads-proof-cannot-decide-1440-en.png`. Not re-planned.

#### FIN-02

**In progress · P1 · A second voucher, transfer or office collection in the same visit silently returns the first (idempotency key minted once per page; server replay unbound)**

- **Priority:** P1 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** BANK-009 `/backoffice/bank/cashbook?drawer=voucher`; BANK-006 `/backoffice/bank/transfers?drawer=new`; FIN-013 `/backoffice/fin/office-collections`
- **Status:** in progress: Issue #18 · **Size:** L
- **Files to change:** Owned by Issue #18: `apps/backoffice/src/pages/society/finance/CashbookPage.tsx` (:373, :395); `TransfersPage.tsx` (:126-133, :155); `OfficeCollectionsPage.tsx` (:62, :77); `packages/fixtures/src/society/finance/common.ts` (:46-52); `handlers-books.ts` (:396-398, :557-559); `handlers-collect.ts` (:447-449)
- **Implementation note:** Not planned again here. Issue #18 applies the Issue #16 payroll pattern: replay bound to scope, operation, actor, target and normalised input; colliding keys refused uniformly; one fresh key per logical create in the UI, kept for its network retry and reset on success or a new drawer open. FIN-03 (voucher drafts) edits the same `create()` in the voucher drawer and must start from the accepted Issue #18 commit.
- **Acceptance criteria:** As defined in Issue #18 (a second legitimate create in the same visit makes a second record with a correct toast; a true retry returns the same record; a reused key with different input, target, endpoint, principal or legal entity is refused without leaking the cached request).
- **Tests to add:** As defined in Issue #18 (same key with different amount, target, endpoint, principal and legal entity; grant revoked; cross-owner; duplicate retry; second create in the same session; response and state invariants; exact toast).
- **Risk and blast radius:** High: every S.1 finance create path shares the key map. Contained by Issue #18's own review.
- **Depends on:** Issue #18. Blocks FIN-03 (same function).
- **Confidence and re-check:** verified in code (lead re-check). Not re-planned.

### B1 · Money truth: financial misstatements and lost finance work (10)

#### RES-01

**Rank 1 · P1 · A reversed receipt is still shown to the resident as "Paid" / "ادا شدہ" with "Amount received"**

- **Priority:** P1 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-010 `/customer/portal/receipt?record=…`; PORTAL-001 `/customer/portal/home`; PORTAL-005 bill "Payments on this bill" `/customer/portal/invoice-detail?record=…`
- **Status:** open · **Size:** M
- **Files to change:** `apps/customer-web/src/pages/dues/DuesPages.tsx` (:124-139 bill payments, :364-386 receipt); `apps/customer-web/src/pages/dues/DuesHome.tsx` (:213-227); `packages/fixtures/src/society/dues-portal-handlers.ts` (:142 credit, :208-209 home receipts, :309-311 bill payments); `packages/contracts` (DuesHome receipt summary and bill payment item types); `packages/i18n/locales/{en-PK,ur-PK}/dues.json`
- **Implementation note:** Server: carry the reversal through every resident projection. Add the reversal (date and reason, or a flag plus date) to the home receipt summaries (:208-209) and to the bill's payment items (:309-311). In `position()` (:142) leave reversed payments out of the unapplied-credit sum; the office side already does (`state.ts` `creditByAccount`, `household-handlers.ts:66`). This last gap was found while re-checking at 474e4ae and is not in the audit (see "New observations"). Receipt page: when `reversed` is set, replace the success badge with a "Reversed" badge in a non-success tone, add the sentence "Reversed on {date}: {reason}", relabel "Amount received" (for example "Amount (reversed)"), and show the allocations under "No longer settles" or drop them. The receipt is kept and never deleted (S.1 rule). Home: draw a reversed receipt as a non-success card with the word "Reversed", as history already does (`DuesPages.tsx:177`). Bill: leave reversed payments out of "Payments on this bill", or list them struck through with "Reversed". New `dues:receipt.reversed*` keys in EN and UR, sent for native review.
- **Acceptance criteria:** After an approved reversal of a resident's payment: (1) the receipt page shows no "Paid" / "ادا شدہ" and no success colour, and shows "Reversed on <date>" with the reason; (2) Home's receipt card says Reversed; (3) the bill no longer lists the payment as settling it, or labels it Reversed; (4) total payable on Home, Bill and Pay equals the office balance for the same account (no reversed credit); (5) receipts that are not reversed are unchanged; (6) another resident's receipt is still 404.
- **Tests to add:** API (new dues-portal case in `collections.api.test.ts` or `finance.api.test.ts`): reverse an office-cash payment that left unapplied credit → `GET /portal/dues/home` receipt is flagged and `position.totalPayable` equals the office balance; bill payments leave it out or flag it; another payer's receipt id → 404 with no oracle. Browser (`s1.spec.ts`): the resident sees "Reversed" on the receipt and on Home in EN and UR, and the text "Paid" is absent. EN/UR 320px@200%: reversed receipt page and Home card, `layoutProblems` clean. axe: `scanA11y` on the reversed receipt.
- **Risk and blast radius:** Resident money surfaces only. Contract types change (home receipts, bill payments): check customer-web and e2e consumers. Totals change only when a reversed payment had unapplied credit.
- **Depends on:** No file overlap with Issue #18; base B1 on the accepted Issue #18 commit so the reversal story is reviewed on the corrected finance base. DuesPages.tsx is also touched by RES-12 (B1) and RES-06 (B2).
- **Confidence and re-check:** verified in code (lead re-check). Re-read at 474e4ae: receipt badge, home cards, bill payment list (the audit's "inferred" gap is confirmed) and the reversed-credit gap.

#### COL-02

**Rank 2 · P1 · Reversed payments are listed and totalled in the office payments list and dashboard as ordinary payments received**

- **Priority:** P1 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** FIN-005 `/backoffice/fin/payment-list`; COL-001 collections dashboard "Latest payments" and payment count; HOME-001
- **Status:** open · **Size:** M
- **Files to change:** `packages/fixtures/src/society/collections-read.ts` (:99-116 `paymentRow`, :250 `collected.payments`, the recent-payments builder); `packages/fixtures/src/society/collections-handlers.ts` (:576-589 `GET /payments`: totals and `credit=1` filter); `apps/backoffice/src/pages/society/collections/PaymentsPage.tsx` (:95-117); `apps/backoffice/src/pages/society/collections/CollectionsPanel.tsx` (:59, :286-306); `packages/i18n/locales/{en-PK,ur-PK}/collections.json`
- **Implementation note:** Set `reversed` in `paymentRow` when the payment has a reversal (the contract field exists at `contracts/src/collections.ts:426`). In `GET /payments`, still list reversed rows as the audit trail, but compute amount, allocated, unapplied and count over live rows only, and leave reversed rows out of the `credit=1` filter. In the list, show the existing `collections:payment.reversedBadge` as text (not colour alone), hide the Reconciled and credit badges on reversed rows, and show the amount muted. Make the count sentence say how many reversed rows are shown but not counted. Dashboard: `collected.payments` counts live payments only (the amount at :230-233 already excludes reversals), and "Latest payments" badges reversed rows. Keep Payment 360's reversal alert as it is.
- **Acceptance criteria:** With one reversed payment: (1) the list shows it with a visible "Reversed" text badge; (2) the header amount, count and "credit left" exclude it; (3) the dashboard's collected count equals the list's counted rows; (4) HOME-001 and COL-001 agree; (5) Payment 360 is unchanged.
- **Tests to add:** API (`collections.api.test.ts`): after `executeReversal`, `GET /payments` totals exclude the payment, its row has `reversed: true`, `credit=1` omits it, and the summary's `collected.payments` equals the live count. Browser (`s1.spec.ts` or `collections.spec.ts`): treasurer reverses an office-cash payment → badge on the list and dashboard, totals drop. EN/UR 320px@200%: payments list with a reversed row. axe: payments list.
- **Risk and blast radius:** Office collection figures and dashboard KPIs seen by the committee. Existing e2e assertions on payment counts may change by design.
- **Depends on:** Issue #18 (soft): it edits `collections-handlers.ts` (proof candidates) and the dashboard bank KPIs, so start from the accepted Issue #18 commit to avoid conflicts. Shares `collections-read.ts` with COL-04 (B1).
- **Confidence and re-check:** verified in code (lead re-check). Re-read at 474e4ae (`paymentRow` has no `reversed`; totals add every row; count uses `state.payments.length`).

#### COL-01

**Rank 3 · P1 · The credit-note "Open" amount ignores money already paid, so a credit can exceed what is unpaid**

- **Priority:** P1 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** BILL-014 `/backoffice/fin/invoice-workspace?record=cin_…&drawer=credit-note`
- **Status:** open · **Size:** M · **Owner decision:** OD-1
- **Files to change:** `apps/backoffice/src/pages/society/billing/InvoiceWorkspace.tsx` (:192); `packages/fixtures/src/society/handlers.ts` (:1402-1404); the shared line-balance helper in `packages/fixtures/src/society` (for example beside `statement.ts:20`, which already sums live allocations per line); `packages/i18n/locales/{en-PK,ur-PK}/billing.json` (`creditNote.open`, `problems.overOpen`, a new "already paid" label)
- **Implementation note:** Define one creditable amount per line: amount − credited − allocated, where allocated counts only live (not reversed) payment allocations. Compute it in one fixtures helper used by both the invoice read model and the credit-note POST, so the drawer and the server cannot disagree. Drawer: show per line "Billed X · paid Y · credited Z · open W"; omit or disable lines with W = 0 and say why. Server: refuse an amount above W with `overOpen`, and name the line in the message (also COL-13). OD-1 asks the owner to confirm this conservative default; crediting money already paid (a refund or account credit) would be a separate feature.
- **Acceptance criteria:** (1) On A-101's partly paid November invoice, Open shows amount − paid − credited. (2) A credit above that is refused with 422: no credit note is created and no number is used. (3) A credit equal to it leaves outstanding 0, never negative. (4) The badge never says "Paid" next to a negative outstanding. (5) After a payment reversal, the line's open amount rises again.
- **Tests to add:** API (`society.api.test.ts`): partly paid line, credit > unpaid → 422 `lines.<id>` with the `open` parameter, no credit note, credit-note counter unchanged; credit = unpaid → 201/200 and outstanding 0; after a reversal the open amount includes the reopened money. Browser (`collections.spec.ts`): the drawer shows the paid amount; an over-credit keeps the drawer open with the message. EN/UR 320px@200%: credit-note drawer. axe: drawer.
- **Risk and blast radius:** Makes the server's credit-note rule stricter. Existing tests that credit a paid line will fail by design. Billing only.
- **Depends on:** None hard. COL-13 (B3) and COL-05 (B7) edit the same drawer and workspace afterwards.
- **Confidence and re-check:** verified in code (lead re-check). Re-read at 474e4ae (`open = amount − credited` at handlers.ts:1402, client at :192). Negative balance inferred from the arithmetic.

#### FIN-03

**Rank 4 · P1 · A voucher saved as a draft cannot be found again; Reverse leaves the address bar on a different record from the drawer**

- **Priority:** P1 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** BANK-009 `/backoffice/bank/cashbook?drawer=voucher` and `?voucher=<id>`; BANK-006 transfer reverse
- **Status:** open · **Size:** M
- **Files to change:** `apps/backoffice/src/pages/society/finance/CashbookPage.tsx` (:232-233 drawer mount, :394-398 `create`, :508 reverse); `apps/backoffice/src/pages/society/finance/TransfersPage.tsx` (:232 reverse); `packages/fixtures/src/society/finance/cashbook.ts` (:304 pending list)
- **Implementation note:** Replace `window.history.replaceState` followed by `onClose()` with one router update through `useQueryParams` that sets `voucher=<id>` and clears `drawer`, so the drawer stays open on the saved draft in edit mode. It must be one navigation: separate setters overwrite each other (`RouterAdapter.tsx:65-85`). "Send for approval" keeps today's close, but through the router. Voucher Reverse (:508) and transfer Reverse (`TransfersPage.tsx:232`) also navigate with the router, so the address and the drawer show the same record. Make drafts findable: list `draft` vouchers in the cashbook's "Not settled yet" with a "Draft" label (for people who can prepare vouchers; check what other roles should see), or add a drafts filter. A draft is not money: dashboard counters (`overview.ts`, FinanceDashboard) must not count it.
- **Acceptance criteria:** (1) Save as draft → the drawer shows the draft (ref, Edit, Submit) and the URL has `?voucher=<id>`. (2) Reload reopens it. (3) The draft appears in the pending list labelled Draft. (4) Submitting it later works. (5) After Reverse, the URL and the drawer show the same new record. (6) One Back press leaves the drawer. (7) No dashboard money figure changes because of a draft.
- **Tests to add:** API (`finance.api.test.ts`): `GET /finance/cashbook` pending includes the preparer's drafts and never another legal entity's; drafts excluded from money totals; a role without `cash_voucher.prepare` gets no drafts, if that is the rule chosen. Browser (`s1.spec.ts`): save draft → reload → submit; reverse → the URL's record equals the displayed ref. EN/UR 320px@200%: drawer in draft state. axe: drawer.
- **Risk and blast radius:** The cashbook pending list changes meaning (drafts become visible). Check every consumer of the pending list.
- **Depends on:** Issue #18 HARD: FIN-02 rewrites key handling in the same `create()`. Start only from the accepted Issue #18 commit.
- **Confidence and re-check:** verified in code (lead re-check). Re-read at 474e4ae (:394-398 `replaceState` then `onClose`; pending list approved and submitted only).

#### FIN-04

**Rank 5 · P1 · Approval-policy draft: the effective date resets to 2026-11-01, and "Send for approval" drops unsaved rule edits**

- **Priority:** P1 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** APR-004 `/backoffice/apr/approval-settings?tab=draft`
- **Status:** open · **Size:** M
- **Files to change:** `apps/backoffice/src/pages/society/finance/ApprovalPages.tsx` (:341-342 state, :470-476 fields and buttons); optionally `packages/fixtures/src/society/finance/handlers-governance.ts` (submit handler); `packages/i18n/locales/{en-PK,ur-PK}/governance.json`
- **Implementation note:** Initialise the date and the note from the loaded draft (`effectiveFrom`, `note`), and re-initialise when the draft id changes. Today `useState('2026-11-01')` ignores the saved date (the server's default is tomorrow), and `note || draft.note` means the note cannot be cleared. Track "dirty" by comparing the edited rules, date and note with the saved draft. "Send for approval" either saves then submits (and stops if saving fails), or is disabled while dirty with the visible reason "Save your changes before sending". Warn about unsaved changes when leaving the tab or page. Optional server hardening: submit carries the draft's version marker and is refused with 409 `policy_changed` if the draft changed since it was read.
- **Acceptance criteria:** (1) Reopening a draft shows its saved date and note. (2) Saving without touching the date keeps it. (3) After editing a rule, Send either saves first or is blocked with a visible reason. (4) The submitted version equals what was on screen. (5) Approvers see the same rules the author saw.
- **Tests to add:** API (`finance.api.test.ts`): PATCH `effectiveFrom` persists; if hardening is adopted, submit with a stale marker → 409 and no state change. Browser (`s1.spec.ts`): set 2026-12-01 → save → reload shows 2026-12-01; edit a rule → Send → the stored rules equal the edited ones, or the button is disabled with its reason. EN/UR 320px@200%: draft tab. axe: draft tab.
- **Risk and blast radius:** Governance screen only. Low.
- **Depends on:** None. Same file as X-02/X-05 instances (B3/B7), which come later.
- **Confidence and re-check:** verified in code (lead re-check). Re-read at 474e4ae.

#### COL-12

**Rank 9 · P2 · The statement has duplicate row keys when a payment is reversed (payment and reversal share `refId`)**

- **Priority:** audit P2 → **recommended P1**. The statement is a money statement, and the duplicate key appears exactly in the reversal case B1 fixes; the fix is tiny and keeps the reversal story consistent everywhere.
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** Statement in SITE-006 Flat 360 (`/backoffice/sites/:siteId/units/:unitId?tab=…`), the account workspace, Person 360 and COL-004 `/backoffice/col/customer-statement?account=…`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/parts.tsx` (:87, :110); `packages/fixtures/src/society/statement.ts` (:115, :128); the resident statement renderer in `apps/customer-web/src/pages/dues/*` (check for the same `refId` key)
- **Implementation note:** Give every movement a unique key: either key rows by kind plus `refId`, or have `statement.ts` emit a `movementId`. Check the resident statement page for the same pattern. The e2e fixture already collects console errors (`consoleErrors`), so the duplicate-key warning becomes a failing assertion.
- **Acceptance criteria:** A statement holding a payment and its reversal shows both rows in table and card layouts, in both periods; switching period repeatedly never drops or duplicates a row; no React key warning; the totals equal the sum of the rows.
- **Tests to add:** Unit (`society.test.ts`): statement movements have unique keys when a payment is reversed. Browser (`s1.spec.ts`): reverse a payment, open the Flat 360 statement, switch Oct↔Nov twice, assert the row count and empty `consoleErrors`. EN/UR 320px@200%: card layout. axe: not needed (no new UI).
- **Risk and blast radius:** Very low.
- **Depends on:** Lands with COL-02/RES-01 (same reversal scenario and fixtures).
- **Confidence and re-check:** key collision verified in code (lead re-check); re-read at 474e4ae. Rendering effect inferred.

#### RES-02

**Rank 10 · P2 · "My properties" shows "In credit Rs 0.00" for every flat in credit**

- **Priority:** audit P2 → **recommended P1**. A wrong money figure ("In credit Rs 0.00") on every flat in credit meets the audit's own P1 definition; the resident may pay again or dispute.
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-002 `/customer/portal/my-properties`
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/household/HouseholdPages.tsx` (:71-72); `packages/fixtures/src/identity/household-handlers.ts` (:63-80); `packages/contracts/src/identity.ts` (:375-376 `MyProperty`)
- **Implementation note:** Add a credit amount to `MyProperty`; it is already computed as `credit` at `household-handlers.ts:66`, reversals excluded. Show "In credit {credit}" from it and drop the `balance.replace('-', '')` workaround; `balance` keeps meaning "owes". While here, replace the hard-coded `siteName: 'Al-Noor Residency'` (`household-handlers.ts:70`) with the site's name from the data (COL-16 class, found while re-checking).
- **Acceptance criteria:** A flat with Rs 1,500 unapplied credit shows "In credit Rs 1,500.00" in EN and the Urdu equivalent. Owing flats are unchanged. A reversed payment's credit is not shown.
- **Tests to add:** API (`identity.api.test.ts`): my-properties returns the credit for a flat with unapplied credit, and 0 after that payment is reversed. Browser (`identity.spec.ts`): a resident in credit sees the amount. EN/UR 320px@200%: the card (the amount uses `overflow-wrap:anywhere`, see RES-10). axe: page.
- **Risk and blast radius:** Additive contract change. Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code (lead re-check); re-read at 474e4ae.

#### COL-04

**Rank 11 · P2 · "Waiting for verification" counts proofs sent back to the resident, reduces "Still owed" by them, and its link opens a different list**

- **Priority:** P2 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** HOME-001 and COL-001 tile, progress bar and legend → FIN-008 `/backoffice/fin/unverified-transfers-queue`
- **Status:** open · **Size:** S
- **Files to change:** `packages/fixtures/src/society/collections-read.ts` (:49 `PENDING_STATES`, :242, :252-258); `apps/backoffice/src/pages/society/collections/CollectionsPanel.tsx` (:63-72, :109-114); `apps/backoffice/src/pages/society/collections/ProofInbox.tsx` (:24 filter mapping); the inbox list handler in `collections-handlers.ts` (new filter); `collections.json` EN/UR
- **Implementation note:** Apply the rule the resident side already uses (`dues-portal-handlers.ts:146`): a proof in `needs_information` is not waiting for the office. Leave it out of the pending amount, out of the share subtracted from "Still owed", and out of the count. Optionally show "Sent back to residents: N" as a separate line linking to that filter. Add one inbox filter covering exactly what the tile counts (submitted, under review, awaiting bank evidence, exception pending) and point the tile at it; today `state=pending` maps to "To review". `PENDING_STATES` is also used by FIN-001's "Proofs waiting" (FIN-15): keep the two figures consistent.
- **Acceptance criteria:** With one returned proof of Rs X: (1) the dashboard's pending amount excludes X; (2) "Still owed" includes X; (3) the tile's link opens a list whose count equals the tile; (4) HOME-001, COL-001 and FIN-001 agree.
- **Tests to add:** API (`collections.api.test.ts`): summary with a `needs_information` submission; the inbox's new filter returns exactly the counted set. Browser (`collections.spec.ts`): click the tile → list count equals the tile. EN/UR 320px@200%: dashboard tile and legend. axe: dashboard.
- **Risk and blast radius:** A committee-visible KPI changes value. Low code risk.
- **Depends on:** Shares `collections-read.ts` with COL-02. FIN-15 (B7) reuses the new inbox filter.
- **Confidence and re-check:** verified in code; re-read at 474e4ae.

#### RES-03

**Rank 12 · P2 · Home loses both "Pay" and "See your proof" when the proof is waiting for the bank or an exception**

- **Priority:** P2 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-001 `/customer/portal/home`
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/dues/DuesHome.tsx` (:31, :160-172); `packages/fixtures/src/society/dues-portal-handlers.ts` (:146-148, home payload); `packages/contracts` (DuesHome type)
- **Implementation note:** Stop re-deriving "pending" on the client (it uses submitted and under review only). Have the home payload carry the id of the submission the server counts as pending (submitted, under review, awaiting bank evidence, exception pending), and show "See your proof" whenever the status is `pending_verification`. Pay stays hidden only under the server's rule. If the status is pending but no id is available, link to the submissions history instead of showing nothing.
- **Acceptance criteria:** In the A-101 scenario (proof of Rs 6,000 awaiting bank evidence), Home shows "See your proof" and it opens that submission. There is never a pending state where only "See the bill" remains.
- **Tests to add:** API: the home payload has the pending id for each of the four pending states, never for `needs_information`, verified or rejected, and never another payer's submission. Browser (`collections.spec.ts`): seed `awaiting_bank_evidence` → the button is there and opens the proof. EN/UR 320px@200%: Home. axe: Home.
- **Risk and blast radius:** Resident Home only. Low.
- **Depends on:** RES-12 reuses the same id on the bill page.
- **Confidence and re-check:** verified in code (lead re-check); re-read at 474e4ae.

#### RES-12

**Rank 13 · P2 · A bill settled by a credit note is labelled "Paid", and the bill page offers Pay while a proof covering it is pending**

- **Priority:** P2 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-004 bills `/customer/portal/payments-dashboard`; PORTAL-005 `/customer/portal/invoice-detail?record=…`
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/dues/DuesPages.tsx` (:16 `settlementStatus`, :140-145 Pay link); `packages/i18n/locales/{en-PK,ur-PK}/dues.json`
- **Implementation note:** Give `credited` its own chip label (for example "Settled by credit note"), not "Paid". On the bill page, hide Pay while `position.status` is `pending_verification`, exactly as Home does (`DuesHome.tsx:160`), and show "See your proof" using RES-03's server id. The Pay page's warning stays as a second safeguard. Urdu wording to the native reader.
- **Acceptance criteria:** A bill settled by a credit note says "Settled by credit note" (not "Paid") in the list and detail, EN and UR. While a proof is pending, the bill page offers "See your proof", not "Pay Rs X".
- **Tests to add:** Browser (`collections.spec.ts`): seed a credited bill → chip text; pending proof → no Pay link on the bill. API: none (client mapping). EN/UR 320px@200%: bills list. axe: bills list.
- **Risk and blast radius:** Resident bill wording only. Low.
- **Depends on:** RES-03 (server pending id).
- **Confidence and re-check:** verified in code; re-read at 474e4ae.

### B2 · Accessibility blockers and one-line shared fixes (8)

#### SH-01

**Rank 6 · P1 · On a phone the full-screen command palette has no visible way to close it**

- **Priority:** P1 (audit and recommended)
- **Area:** SH: Shared UI and shell (audit §3)
- **Screen and route:** GLOBAL-001 command palette (Ctrl+K or header search), all three apps, below 640 px
- **Status:** open · **Size:** S
- **Files to change:** `packages/ui/src/command/CommandPalette.tsx` (:147-165); `packages/i18n/locales/{en-PK,ur-PK}/common.json` (reuse `common:actions.cancel` or add `command.close`)
- **Implementation note:** Add a visible text button "Cancel" in the search row (at least 44 px), at least below `sm`, that closes the palette and returns focus to whatever opened it (header search or bottom bar). Optionally leave a tappable strip of overlay at the top on phones. Optional: close on browser Back by recording the open state in history; check this against SH-03.
- **Acceptance criteria:** At 390 and 320 px, EN and UR, a touch user can close the palette with one visible control; focus returns to the trigger; a screen reader hears "Cancel, button"; Escape still works on desktop; the essentials tour's search step can be left.
- **Tests to add:** Browser (`command-palette.spec.ts`): phone viewport, open from the header search → tap Cancel → palette closed and focus on the trigger. EN/UR 320px@200%: Cancel visible and not clipped (`layoutProblems`). axe: open palette at phone size. API: none.
- **Risk and blast radius:** Shared shell component in all three apps; additive.
- **Depends on:** None.
- **Confidence and re-check:** verified in code (lead re-check); re-read at 474e4ae (`h-dvh w-full`, Esc hint `hidden sm:block`, no close control).

#### OPS-01

**Rank 7 · P1 · Request 360 drawer actions that fail show their reason behind the modal; the drawer just stays open**

- **Priority:** P1 (audit and recommended)
- **Area:** OPS: Operations and community (D.2/D.3) (audit §6)
- **Screen and route:** MNT-003 `/backoffice/mnt/maintenance-360-workspace?record=…&drawer=triage|assign|complete|hold|merge|resolve` (MNT-005 assign, MNT-013 merge)
- **Status:** open · **Size:** M
- **Files to change:** `apps/backoffice/src/pages/society/operations/RequestWorkspace.tsx` (:55-66 `run`, :88 page `ProblemAlert`, drawers :117-122, submits :435, :478, :545, :572, :602, :648, :651; dialogs :123-125)
- **Implementation note:** Keep each error with the surface that caused it: `run()` records which drawer the failure came from (or returns the error), and each drawer renders a `ProblemAlert` at its top (announced, with focus moved to it) when its last attempt failed; the alert clears when the drawer reopens. The page-level alert stays for actions started from the page (NextStep, tabs). Map field codes (such as a note that is too short) to the drawer's fields where they exist (X-01, X-02). For the close, cancel and hide dialogs, keep the dialog open on refusal; that needs X-09's "onConfirm may throw" contract. Until X-09 lands, show the alert inside the dialog.
- **Acceptance criteria:** For triage, assign, complete, hold, merge and resolve, a server refusal (for example a 409 stale state or a 422 short note) shows its reason inside the drawer, is announced, keeps the drawer open with the inputs kept, and is visible on phones without closing the drawer. Success closes the drawer as today.
- **Tests to add:** API (`operations.api.test.ts`): add the negatives the browser test uses (assign to someone not allowed → 403/409; complete without a photo → 422 `evidenceNeeded`). Browser (`d2.spec.ts`): force one refusal per drawer (for example change state in a second page first) → `getByRole('dialog').getByRole('alert')` has the reason. EN/UR 320px@200%: drawer with the alert. axe: drawer with the alert.
- **Risk and blast radius:** MNT-003 only. Low.
- **Depends on:** X-09 (B3) for the three dialogs; OPS-02 (B3) edits the same complete drawer later.
- **Confidence and re-check:** verified in code (lead re-check); re-read at 474e4ae.

#### SH-02

**Rank 8 · P1 · `MetricCard` hides its value from screen readers whenever the card is not a link; `StatTile` leaves `context` out of the name**

- **Priority:** P1 (audit and recommended)
- **Area:** SH: Shared UI and shell (audit §3)
- **Screen and route:** HQ-001 `/hq` ARR card; CRM Lead 360 `/backoffice/crm/lead-360-workspace?record=…` budget card; every `StatTile` with `context` (collections dashboard; S.3 uses StatTile 6 times)
- **Status:** open · **Size:** S
- **Files to change:** `packages/ui/src/data/MetricCard.tsx` (:53, :70-75); `packages/ui/src/data/StatTile.tsx` (:59, :82); call sites that already fold `context` into `accessibleValue` (for example `collections/CollectionsPanel.tsx` kpi-collected and kpi-pending)
- **Implementation note:** Non-link branch: when `accessibleValue` is set, render it as visually hidden text beside the aria-hidden visual value, in reading order label → value → caption. StatTile: add `context` to the link's name when it is a string (or reference it with `aria-describedby`). Remove the duplication at call sites that already put the context into `accessibleValue`.
- **Acceptance criteria:** Screen readers read the label, the full amount and the caption for the HQ ARR card and the CRM budget card. StatTile links read label, value and context once each. Nothing changes visually.
- **Tests to add:** Component (new `packages/ui/src/data/MetricCard.test.tsx`): without `href`, `accessibleValue` is in the accessibility tree; StatTile's name contains `context` exactly once. Browser (`hq.spec.ts`, `crm.spec.ts`): accessible name of the cards. axe: no new violations. EN/UR 320px@200%: one capture to confirm nothing moved.
- **Risk and blast radius:** Shared component in three apps and S.3. Accessible names change, so e2e selectors such as `getByRole('link', { name })` on StatTiles may need updating (S.3 too).
- **Depends on:** Coordinate with S.3: whichever lands second updates name-based selectors.
- **Confidence and re-check:** verified in code (lead re-check of MetricCard). Re-read at 474e4ae, including the HQ, CRM and StatTile call sites the audit lead had not re-checked: both cards have no `href`, so the defect is confirmed.

#### SH-04

**Rank 14 · P2 · `SelectControl` accepts `errorKey` but never marks itself invalid, so the error never shows**

- **Priority:** P2 (audit and recommended)
- **Area:** SH: Shared UI and shell (audit §3)
- **Screen and route:** PORTAL-025 household request (Flat, Relationship) `/customer/portal/household`; every `SelectControl` with `errorKey` (S.3 uses it 9 times)
- **Status:** open · **Size:** S
- **Files to change:** `packages/ui/src/forms/ChoiceFields.tsx` (:190, :207); call site `apps/customer-web/src/pages/household/HouseholdPages.tsx` (:321-330)
- **Implementation note:** Derive invalid from the error: use `isInvalid` when given, otherwise "has an `errorKey`", as `PlainTextField` does. React Aria's `FieldError` then renders and the trigger gets `aria-invalid` and a description link. Check call sites only pass `errorKey` while the field is invalid.
- **Acceptance criteria:** Submitting the household request without a Flat shows "Choose one" under the field, marks it invalid and announces it; the same for every `SelectControl` with `errorKey`.
- **Tests to add:** Component (`packages/ui/src/forms/forms.test.tsx`): with `errorKey`, the message renders and `aria-invalid` is set. Browser (`identity.spec.ts`): empty submit → message under Flat. EN/UR 320px@200%: form. axe: form in error.
- **Risk and blast radius:** Shared; a caller that passes `errorKey` while valid would now show it (grep first). Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code (lead re-check); re-read at 474e4ae.

#### RES-06

**Rank 15 · P2 · Hidden file inputs are an invisible Tab stop**

- **Priority:** P2 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-008 `/customer/portal/upload-proof-mock`; PORTAL-028 `/customer/portal/submissions/:id`
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/dues/DuesPay.tsx` (:303); `apps/customer-web/src/pages/dues/DuesPages.tsx` (:322)
- **Implementation note:** Take the visually hidden native file inputs out of the Tab order (as `operations/rkit.tsx:79` does) so the visible "Choose file" button is the only stop and still opens the picker. Longer term, React Aria `FileTrigger` (as COL-14 and RES-05 suggest).
- **Acceptance criteria:** Each form has exactly one Tab stop for the file control, focus is always visible, and choosing a file still works by keyboard and screen reader.
- **Tests to add:** Browser (`forms-keyboard.spec.ts`): `focusWalk` shows no invisible stop after "Choose file". axe: both forms. EN/UR 320px@200%: not needed.
- **Risk and blast radius:** Trivial.
- **Depends on:** `DuesPages.tsx` is also edited by RES-01/RES-12 (B1): trivial merge.
- **Confidence and re-check:** verified in code; re-read at 474e4ae.

#### SH-10

**Rank 16 · P3 · Keyboard focus on a workspace tab panel is invisible**

- **Priority:** P3 (audit and recommended)
- **Area:** SH: Shared UI and shell (audit §3)
- **Screen and route:** Every workspace using `Tabs` (Request 360, Flat 360, Account 360, Lead 360, Employee 360…)
- **Status:** open · **Size:** S
- **Files to change:** `packages/ui/src/layout/Tabs.tsx` (:88)
- **Implementation note:** Replace the panel's `outline-none` with the focus-visible outline classes `PillTabs` uses, so a panel that React Aria makes focusable shows a ring.
- **Acceptance criteria:** Tabbing from the tab list into a panel without focusable content shows a visible focus ring with at least 3:1 contrast; mouse use is unchanged.
- **Tests to add:** Component (`packages/ui/src/layout/Tabs.test.tsx`): the panel carries focus-visible styles. Browser (`a11y.spec.ts`): keyboard into a panel → outline visible. axe: one workspace.
- **Risk and blast radius:** Shared, visual only. Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### SH-11

**Rank 17 · P3 · Calendar month buttons are named "Back" and "Next"**

- **Priority:** P3 (audit and recommended)
- **Area:** SH: Shared UI and shell (audit §3)
- **Screen and route:** Every `DateField` calendar; HQ date inputs
- **Status:** open · **Size:** S
- **Files to change:** `packages/ui/src/forms/DateField.tsx` (:76, :80); `apps/platform-hq/src/components/inputs.tsx` (:150, :154); `common.json` EN/UR (new previous/next month keys)
- **Implementation note:** Use dedicated "Previous month" / "Next month" keys in both languages (Urdu to the native reader). The chevrons also need mirroring in RTL (X-07).
- **Acceptance criteria:** The calendar buttons announce "Previous month" / "Next month" in EN and their Urdu equivalents in UR.
- **Tests to add:** Component (`forms.test.tsx`): accessible names. axe: date field open. i18n lint (`check-i18n`) passes.
- **Risk and blast radius:** Trivial.
- **Depends on:** X-07 (B8) for mirroring.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### SH-12

**Rank 18 · P3 · `CheckboxField` error and description are not tied to the checkbox**

- **Priority:** P3 (audit and recommended)
- **Area:** SH: Shared UI and shell (audit §3)
- **Screen and route:** Only FormsLab today; any future `CheckboxField`
- **Status:** open · **Size:** S
- **Files to change:** `packages/ui/src/forms/ChoiceFields.tsx` (:52-66)
- **Implementation note:** Render the description with React Aria's description slot and the error with `FieldError`, so both are linked (`aria-describedby`) and the checkbox is marked invalid.
- **Acceptance criteria:** A checkbox with a description and an error exposes both through `aria-describedby` and sets `aria-invalid` when invalid.
- **Tests to add:** Component (`forms.test.tsx`). axe: FormsLab.
- **Risk and blast radius:** None in client flows today.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

### B3 · Failures and rules made visible (16)

#### X-01

**Rank 19 · P2 · Failed actions are silently swallowed (no toast, alert or announcement; unhandled promise rejection)**

- **Priority:** P2 (audit and recommended)
- **Area:** X: Cross-cutting patterns (audit §2)
- **Screen and route:** Many in all three apps: VIS-004 gate check-out, MNT-012 Refresh, BANK-003 bank-line Restore, portal access (cancel invitation), More (reset demo data), CRM new lead and schedule visit, Profile, Chat block/unblock/leave, resident issues, services, household and community, HQ-003
- **Status:** open · **Size:** L
- **Files to change:** `packages/ui/src/data/TransportProvider.tsx` (:66-67); `packages/ui/src/forms/Form.tsx` (:123-130); instances: `operations/VisitorPages.tsx` (:211-215), `IssuesBoard.tsx` (:40-44), `collections/BankPages.tsx` (:154-157), `society/portal/PortalPeople.tsx` (:34-39), `more/MorePage.tsx` (:139-142), `packages/ui/src/crm/NewLeadDrawer.tsx` (:88), `ScheduleVisitDrawer.tsx` (:75), `packages/ui/src/identity/Profile.tsx` (:152-157), `packages/ui/src/community/Chat.tsx` (:649-654, :898-901, :924-930), resident `IssuesPage.tsx` (:81-85, :223-226), `ResidentServices.tsx` (:78-82, :269), `HouseholdPages.tsx` (:310, :364), `CommunityHomePage.tsx` (:535), HQ `CreateTenantPage.tsx` (:186-198)
- **Implementation note:** Two layers. (1) `Form`: wrap `onSubmit`; on an `ApiProblem`, map `errors` keys to the registered fields and the summary and move focus to the summary; show other failures as a `ProblemAlert` or toast; never leave an unhandled rejection. (2) Each listed call site catches its failure and shows "Not saved" with the reason. A global default toast in `MutationCache.onError` (the audit's suggestion) risks double messages on the many pages that already show a `ProblemAlert` (S.1, S.2a, S.3's `useProblemToast`). Recommended instead: opt-in mutation metadata for a default toast, the per-site fixes, and a lint or grep guard against a bare `await mutateAsync` with no handling. This is an engineering choice for GPT review, not an owner decision.
- **Acceptance criteria:** For every listed instance, an offline, 5xx, 403 or 409 failure shows a visible, announced message saying it was not saved and why; the spinner stops; the console has no unhandled rejection; pages that already show a `ProblemAlert` do not get a second message.
- **Tests to add:** Component (`TransportProvider.test.tsx`, `forms.test.tsx`): `Form` maps `ApiProblem` field errors to fields and the summary; a non-field error shows an alert. Browser: four representative instances (gate check-out, bank-line Restore, cancel invitation, resident vehicle removal) with an injected failure (route interception) → message text, and `consoleErrors` empty. EN/UR 320px@200%: one instance's message. axe: the alert state.
- **Risk and blast radius:** Highest blast radius in the backlog: shared plumbing in three apps and S.3. Main regression risk is double messages.
- **Depends on:** S.3 merged first (it uses `useProblemToast`, `ConfirmDialog`, `Form`); Issue #18 merged (finance pages).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### X-09

**Rank 20 · P2 · `ConfirmDialog` closes and loses the typed reason when the server refuses it, and its text is not tied to the dialog**

- **Priority:** P2 (audit and recommended)
- **Area:** X: Cross-cutting patterns (audit §2)
- **Screen and route:** All reason dialogs: MNT-003 close/cancel/hide, notices, HR advances, leave, roster, community chat settings, services, polls, resources; S.3 uses `ConfirmDialog` 6 times
- **Status:** open · **Size:** M
- **Files to change:** `packages/ui/src/overlays/ConfirmDialog.tsx` (:33-35, :39-51, :73-83); `packages/ui/src/overlays/Dialog.tsx` (:56); call sites `operations/RequestWorkspace.tsx` (:123-125), `NoticesOffice.tsx` (:431), `hr/AdvancesPages.tsx` (:205-223), `LeaveAdjustmentsPage.tsx` (:121-139, :214-232), `RosterPage.tsx` (:325-342), `community/ChatSettingsPage.tsx` (:422-441), `ServicesDirectoryPage.tsx` (:232-267), `PollsPages.tsx` (:337-356), `ResourcesPage.tsx` (:98-116)
- **Implementation note:** Change the contract: `onConfirm` may throw (or report failure) to keep the dialog open; the dialog then shows the refusal at the reason field with `FieldError` (linked by `aria-describedby`) and keeps the typed reason. Add a `minLength` property that shows the rule as a hint and checks it before calling the server. Give the effect text an id and use it as the alert dialog's description. Reset the reason and its error whenever the dialog opens, not only after success. Update call sites to report failure instead of swallowing it (for example, RequestWorkspace's `run()` returns false today).
- **Acceptance criteria:** (1) Typing "Not needed" where 10 characters are required shows the minimum before anything is sent. (2) A server refusal keeps the dialog open, keeps the text and shows the error at the field. (3) The effect is read when the dialog opens. (4) Cancel, then reopen, shows an empty reason.
- **Tests to add:** Component (`packages/ui/src/overlays/Dialog.test.tsx`): a rejected `onConfirm` keeps the dialog open with the error; state resets on reopen; the effect is the dialog's description. Browser (`overlays.spec.ts`, `d2.spec.ts`): a too-short reason is refused and the dialog stays. EN/UR 320px@200%: dialog with an error. axe: dialog with an error.
- **Risk and blast radius:** Behavioural contract change for about 15 call sites plus S.3.
- **Depends on:** S.3 merged first. Pairs with X-01. Unblocks the dialog part of OPS-01 and RES-08/FIN-17 (B5).
- **Confidence and re-check:** verified in code (lead re-check); re-read at 474e4ae (only "not empty" is checked; close and clear happen after any resolve).

#### X-02

**Rank 21 · P2 · Submit buttons are disabled by minimum lengths nobody states**

- **Priority:** P2 (audit and recommended)
- **Area:** X: Cross-cutting patterns (audit §2)
- **Screen and route:** Most S.1 drawers (BANK-009 voucher, BANK-006 transfer, FIN-013 office collection, APR decisions, OWN, committee, reminders); resident new repair, raise issue, add vehicle; D.2 completion
- **Status:** open · **Size:** M
- **Files to change:** `finance/CashbookPage.tsx` (:757); `TransfersPage.tsx` (:151, :333, :383); `OfficeCollectionsPage.tsx` (:607, :651, :659); `ApprovalPages.tsx` (:290, :561); `OwnershipPages.tsx` (:134, :298, :322); `CommitteePage.tsx` (:239, :297, :335); `RemindersPage.tsx` (:233-236); resident `RepairsPage.tsx` (:165, :183, :304), `IssuesPage.tsx` (:154, :188), `ResidentServices.tsx` (:121); hint keys in `en-PK/ur-PK operations.json` (:609-611) and the finance namespaces
- **Implementation note:** Use the D.1 export-form pattern (`adm/data/ExportDrawers.tsx:49-56`): keep the button enabled, validate on press, show the error at the field with the minimum ("At least 10 characters, 4 so far"), and move focus to the first invalid field. Where a disabled button stays, the field's description states the rule. Take the minimums from one shared source (contracts), so the client and server cannot drift.
- **Acceptance criteria:** In every listed form, typing "Leak" and pressing submit shows a field error stating the minimum. No submit button is disabled without a visible reason. EN and UR.
- **Tests to add:** Unit: the client minimums equal the server's (shared constants). Browser: one form per app (voucher, resident repair, add vehicle) → field error text. axe: the error state. EN/UR 320px@200%: one form. API: none (the server already enforces).
- **Risk and blast radius:** About 20 call sites; mechanical.
- **Depends on:** Issue #18 merged (CashbookPage, TransfersPage, OfficeCollectionsPage).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### X-04

**Rank 22 · P3 · Failed queries leave a skeleton forever or a silently empty list**

- **Priority:** P3 (audit and recommended)
- **Area:** X: Cross-cutting patterns (audit §2)
- **Screen and route:** SITE new run, exemptions, rules; S.1 cashbook, approvals, reminders, accounts, transfers, office collections; ADM-024; MNT-008, notices, visitors, MNT-004; command palette search; AUTH-007 invitation
- **Status:** open · **Size:** M
- **Files to change:** `sites/NewRunPage.tsx` (:35-36), `ExemptionsPage.tsx` (:22-23), `RulesPage.tsx` (:31-32); `finance/CashbookPage.tsx` (:692), `ApprovalPages.tsx` (:571), `fkit.tsx` (:146), `OfficeCollectionsPage.tsx` (:418), `RemindersPage.tsx` (:312), `AccountsPages.tsx` (:167), `TransfersPage.tsx` (:531); `adm/data/ExportDrawers.tsx` (:92); `operations/MaintenancePages.tsx` (:388-414), `NoticesOffice.tsx` (:508-509), `VisitorPages.tsx` (:550-554), `NewRequestPage.tsx` (:25, :73); `packages/ui/src/command/CommandPalette.tsx` (:128, :170-172); resident `auth/InvitationPage.tsx` (:67)
- **Implementation note:** For each secondary query, show `ErrorState` with Retry (or an inline alert with Retry) when it fails, as `sites/ImportPage.tsx:43` does. Command palette: "Search failed, Retry" instead of "No results". NewRequestPage: the area select shows an error with Retry instead of staying empty (`retry:false`). The invitation case is RES-20.
- **Acceptance criteria:** A simulated failure of each query shows an error with Retry; never an endless skeleton or a misleading empty list.
- **Tests to add:** Browser: three representative cases (MNT-008, command palette search, a finance secondary query) with route interception → error and Retry works. axe: error state.
- **Risk and blast radius:** Many files; each change is local. Low.
- **Depends on:** Issue #18 merged (finance pages).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae. Reachability needs a transient failure.

#### COL-11

**Rank 23 · P2 · The opening-balances import spins forever on a stale `?import=`**

- **Priority:** P2 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** SITE-007 `/backoffice/sites/:id/opening-balances?import=…`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/sites/OpeningBalancesPage.tsx` (:149, :176, :183-184)
- **Implementation note:** Handle the failed import query (a stale id after Reset demo data, a bookmark or Back) with an error state and "Start again" (which clears `import`); catch failures when reading the file and say so.
- **Acceptance criteria:** A stale `?import=` shows "This import is no longer available" with Start again; never an endless skeleton.
- **Tests to add:** API: GET of a stale import → 404. Browser (`society.spec.ts`): start an import → reset demo data → reopen the URL → error, and Start again works. EN/UR 320px@200%: error state. axe: error state.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### COL-13

**Rank 24 · P2 · Server field errors are not shown at the field, and some don't say which line**

- **Priority:** P2 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** BILL-014 credit note, billing rules, exemptions, change-payer drawer, FIN-009 allocation edit, collection-account proposal
- **Status:** open · **Size:** M
- **Files to change:** `society/kit.tsx` (:127-151, :341-353); `billing/InvoiceWorkspace.tsx` (:194, :202); `collections/ProofReview.tsx` (:497, :505-513); `en-PK/ur-PK billing.json` (:897-898); the credit-note and allocation handlers (message parameters)
- **Implementation note:** Map `lines.<id>` and `allocations.<id>` error keys to the matching amount input (pass its error and mark it invalid). Keep a summary that names each line ("A-101 maintenance: at most Rs X"). Add the flat and charge as parameters to `overOpen` and the allocation messages on the server.
- **Acceptance criteria:** A refused credit or allocation marks the specific input invalid with its message; the summary names the line; focus moves to the first invalid input.
- **Tests to add:** API (`society.api.test.ts`, `collections.api.test.ts`): 422 responses carry the line identity and the flat and charge parameters. Browser (`collections.spec.ts`): over-credit → error at that line. EN/UR 320px@200%: drawer with line errors. axe: drawer with errors.
- **Risk and blast radius:** Shared society kit; billing and proof review.
- **Depends on:** COL-01 (B1) first (same drawer); Issue #18 merged (ProofReview).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### RES-04

**Rank 25 · P2 · Proof form: server field errors look like help text and are not announced**

- **Priority:** P2 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-008 `/customer/portal/upload-proof-mock`
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/dues/DuesPay.tsx` (:286, :290, :292, :308-310)
- **Implementation note:** Pass server field errors as errors, not as descriptions; give the date field a proper error; keep a summary with `role="alert"` even when field errors exist; focus the first invalid field.
- **Acceptance criteria:** A server 422 for amount, date or reference marks each field invalid with its message, the summary is announced, and focus moves to the first invalid field.
- **Tests to add:** API (`collections.api.test.ts`): negatives for each rule (future date, too old, reference shorter than 4, bad amount). Browser (`collections.spec.ts`): submit invalid values → errors at the fields. EN/UR 320px@200%: form in error. axe: form in error.
- **Risk and blast radius:** Resident proof form only.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### RES-05

**Rank 26 · P2 · Re-send proof: no field errors and no file checks; the transfer date cannot be changed**

- **Priority:** P2 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-028 `/customer/portal/submissions/:id`
- **Status:** open · **Size:** M
- **Files to change:** `apps/customer-web/src/pages/dues/DuesPages.tsx` (:317-325, :322); `DuesPay.tsx` (:243-249, checks to share)
- **Implementation note:** Move the proof form's file checks (type, size) and field-error mapping into a shared piece used by both forms. Add the transfer date field if the server accepts it on resubmission; if it does not, record that as a separate server change rather than widening this batch.
- **Acceptance criteria:** Re-sending with a wrong file type or size is refused with a message before upload; server field errors appear at their fields; the date can be changed if the server allows it.
- **Tests to add:** API: resubmission validation negatives. Browser (`collections.spec.ts`): wrong file type → message; server refusal → field error. EN/UR 320px@200%: re-send form. axe: re-send form.
- **Risk and blast radius:** Resident proof flow.
- **Depends on:** RES-04 (shared validation), RES-06 (B2, same input).
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### HR-02

**Rank 27 · P2 · New employee form: no error summary for client checks, and role and date errors are not tied to their fields**

- **Priority:** P2 (audit and recommended)
- **Area:** HR: Society HR (S.2a) (audit §7)
- **Screen and route:** HR-004 `/backoffice/hr/new-employee`
- **Status:** open · **Size:** M
- **Files to change:** `apps/backoffice/src/pages/society/hr/NewEmployeePage.tsx` (:58-61, :92, :114, :117); `apps/backoffice/src/pages/society/hr/hkit.tsx` (:335-336 `SearchSelect`, :386-395 `DateInput`)
- **Implementation note:** Client checks produce the same focused, linked error summary as server errors. `SearchSelect` and `DateInput` render the description in the description slot and the error with `FieldError` (linked, `aria-invalid`). Server date errors render as errors, not muted description text. `hkit` is reused by S.3 (`DateInput`, `SearchSelect`), so S.3 gains the fix too; land after S.3 merges.
- **Acceptance criteria:** Matches MANUAL_VERIFICATION H1: an empty submit shows a focused summary whose links move to each field, and each field's message is read and linked.
- **Tests to add:** Browser (`s2a.spec.ts`): empty submit → summary focused; its links move focus. EN/UR 320px@200%: form in error. axe: form in error.
- **Risk and blast radius:** Shared HR kit used by S.3.
- **Depends on:** S.3 merged first (`hkit.tsx`).
- **Confidence and re-check:** verified in code; seen in `gate-s2a/screenshots/b01-new-employee-validation-1440-en.png`; files unchanged a0d4a70→474e4ae.

#### HR-05

**Rank 28 · P3 · HR drawers: a free-text month field in some browsers, and errors only in the summary**

- **Priority:** P3 (audit and recommended)
- **Area:** HR: Society HR (S.2a) (audit §7)
- **Screen and route:** HR-007 advances drawer `/backoffice/hr/employee-advances` (the audit calls it HR-009; the register says HR-007); HR-005 attendance correction
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/hr/AdvancesPages.tsx` (:292, :306); `apps/backoffice/src/pages/society/hr/AttendancePage.tsx` (:236)
- **Implementation note:** Replace `input type="month"` with month and year selects (or a month-only date picker) and a hint; map `firstMonth`, `evidence` and `employeeId` errors to their fields; give the correction reason an error.
- **Acceptance criteria:** Firefox and Safari users choose a month without guessing a format; errors appear at their fields.
- **Tests to add:** Browser (`s2a.spec.ts`, plus Firefox if the shared machine allows one browser run at a time): choose a month; submit invalid → field errors. EN/UR 320px@200%: drawer. axe: drawer.
- **Risk and blast radius:** HR only.
- **Depends on:** HR-02 (same kit), S.3 merged.
- **Confidence and re-check:** verified in code; browser fallback inferred; files unchanged a0d4a70→474e4ae.

#### HQ-03

**Rank 29 · P2 · The Create tenant wizard fails silently, or loads forever, on errors**

- **Priority:** P2 (audit and recommended)
- **Area:** HQ: Platform HQ and developer pages (audit §9)
- **Screen and route:** HQ-003 `/hq/tenants/new`
- **Status:** open · **Size:** S
- **Files to change:** `apps/platform-hq/src/pages/create/CreateTenantPage.tsx` (:186-198, :205-227, :290-291)
- **Implementation note:** Catch a failed draft start and show a `ProblemAlert` with Retry; when a step fails to load, show `ErrorState` with Retry instead of an endless skeleton, as `commit` already does.
- **Acceptance criteria:** An offline or 5xx failure at draft start or step load shows an error with Retry; no unhandled rejection.
- **Tests to add:** Browser (`hq.spec.ts`): route interception at each point → error and Retry. axe: error state.
- **Risk and blast radius:** HQ only.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### HQ-04

**Rank 30 · P2 · HQ configuration problems show raw field paths (in English, even in Urdu) and never mark the fields**

- **Priority:** P2 (audit and recommended)
- **Area:** HQ: Platform HQ and developer pages (audit §9)
- **Screen and route:** HQ-026 `/hq/policies`, HQ-010 `/hq/rate-cards`, HQ-006/007 `/hq/catalogue`, amendment history
- **Status:** open · **Size:** M
- **Files to change:** `apps/platform-hq/src/components/config.tsx` (:74); `apps/platform-hq/src/pages/config/*`; `packages/fixtures/src/platform/config.ts` (:191-266, error keys); `platform.json` EN/UR
- **Implementation note:** Map each error path (for example `lines.<id>.floorPrice`) to a translated "row label: column label" and mark the matching input invalid. Unknown paths fall back to a generic translated message, never the raw key.
- **Acceptance criteria:** An invalid floor price reads, in EN and UR, as the rate-card line's name and "Floor price" with the rule, and that input is marked invalid.
- **Tests to add:** API (`platform/validation.test.ts`): error keys stay stable. Browser (`hq-commercial.spec.ts`): invalid value → field invalid, message translated. EN/UR 320px@200%: an editor in error. axe: editor in error.
- **Risk and blast radius:** HQ configuration editors.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### OPS-02

**Rank 31 · P2 · The completion drawer calls the photo "optional" but requires one**

- **Priority:** P2 (audit and recommended)
- **Area:** OPS: Operations and community (D.2/D.3) (audit §6)
- **Screen and route:** MNT-003 complete drawer `/backoffice/mnt/maintenance-360-workspace?record=…&drawer=complete`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/operations/RequestWorkspace.tsx` (:545, :553); `operations/okit.tsx` (:207); `en-PK/ur-PK operations.json` (:520)
- **Implementation note:** The server also requires at least one photo (`requests-handlers.ts:428`, `evidenceNeeded`), so this is a copy fix: say "Photos (at least 1, up to 3)" and state next to the button what is still missing (note length, a photo, a photo description), following X-02.
- **Acceptance criteria:** The drawer no longer calls the photo optional; pressing Complete without a photo explains what is missing.
- **Tests to add:** Browser (`d2.spec.ts`): no photo → message; with photo → completes. EN/UR 320px@200%: drawer. axe: drawer.
- **Risk and blast radius:** Low.
- **Depends on:** OPS-01 (B2) first (same file).
- **Confidence and re-check:** verified in code; seen in `gate-d2/screenshots/r09-completion-evidence-1440-en.png`; re-read at 474e4ae, including the server rule.

#### OPS-06

**Rank 32 · P3 · Buttons that do nothing until another query loads (or forever if it fails); a dead "Request leave" for `leave.manage`-only roles**

- **Priority:** P3 (audit and recommended)
- **Area:** OPS: Operations and community (D.2/D.3) (audit §6)
- **Screen and route:** Community polls and resources; HR-010 roster; HR-003 Employee 360; HR-006 leave adjustments
- **Status:** open · **Size:** M
- **Files to change:** `community/PollsPages.tsx` (:46 with :87, :226-230 with :336); `community/ResourcesPage.tsx` (:29 with :51); `hr/RosterPage.tsx` (:441 with :473); `hr/Employee360Page.tsx` (:62-66 with :406-408); `hr/LeaveAdjustmentsPage.tsx` (:21, :36-47)
- **Implementation note:** Show a pending state while the dependent query loads and an inline error with Retry if it fails. Leave adjustments: either serve the minimal staff list to `leave.manage` within its record scope, or hide the button for roles that cannot load it and say why. Any server change must follow the S.2a scope rules (Issue #14 lesson: check authority before looking up ids).
- **Acceptance criteria:** No button silently does nothing. A `leave.manage`-only role gets either a working drawer or no button with a reason.
- **Tests to add:** API (`hr.api.test.ts`): if the staff list is opened to `leave.manage`, it stays inside the record scope and gives no id oracle. Browser (`s2a.spec.ts`, `d3.spec.ts`): slow or failed dependency → pending or error state. axe: affected drawers.
- **Risk and blast radius:** Touches S.2a scope rules if the server path is chosen.
- **Depends on:** S.3 merged (hkit).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### RES-13

**Rank 33 · P3 · "Copy the invitation" says "Copied" even when copying failed**

- **Priority:** P3 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-020 pass sheet `/customer/portal/services-home?tab=visitors&pass=…`
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/operations/ServicesHub.tsx` (:310-323)
- **Implementation note:** Set "copied" only on success; on failure show the existing `copyFailed` message and keep the text selectable. The hard-coded society name in the same copy is COL-16.
- **Acceptance criteria:** When the clipboard is denied, the resident sees that copying failed and how to copy by hand.
- **Tests to add:** Browser (`d2.spec.ts`): deny clipboard permission → failure message. axe: sheet.
- **Risk and blast radius:** Trivial.
- **Depends on:** RES-07 (B5) touches the same sheet.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### RES-20

**Rank 34 · P3 · The invitation page reports any load error as "not found", and a failed code send only refetches**

- **Priority:** P3 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** AUTH-007 accept invitation (register route `/shared/auth/invite/:token`)
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/auth/InvitationPage.tsx` (:43, :67)
- **Implementation note:** Show "not found or expired" only for 404/410; other failures show `ErrorState` with Retry. A failed code send shows and announces a message.
- **Acceptance criteria:** A network error shows "Couldn't load, Retry", not "not found"; a failed send is announced.
- **Tests to add:** Browser (`identity.spec.ts`): route interception for load and send → messages. axe: error states.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

### B4 · Access-aware links and honest dead ends (13)

#### X-03

**Rank 35 · P2 · Links and figures shown to people who cannot open the target (planned page, 403 or a drawer that never mounts)**

- **Priority:** P2 (audit and recommended)
- **Area:** X: Cross-cutting patterns (audit §2)
- **Screen and route:** FIN-001 `/backoffice/fin/finance-dashboard`; BANK-007 cashbook; Account 360; OWN pages; FIN-006 Payment 360; MNT-003; VIS pass detail and vehicle drawer; MNT-001; HR dashboard, HR-003 Employee 360, HR-006 leave adjustments; SITE-004 import, SITE-007 opening balances; HOME-001
- **Status:** open · **Size:** L
- **Files to change:** `packages/fixtures/src/society/finance/overview.ts` (:72, :79-80, :123-124, :128, :133); `finance/FinanceDashboard.tsx` (:83, :120-126); `finance/CashbookPage.tsx` (:175, :222, :723); `AccountsPages.tsx` (:248); `OwnershipPages.tsx` (:285); `collections/PaymentWorkspace.tsx` (:119, :123, :268); `operations/RequestWorkspace.tsx` (:235); `VisitorPages.tsx` (:480); `VehiclesOffice.tsx` (:188); `MaintenancePages.tsx` (:78); `hr/Employee360Page.tsx` (:106-111); `HrDashboardPage.tsx` (:49-51, :94); `LeaveAdjustmentsPage.tsx` (:98, :178); `sites/ImportPage.tsx` (:42, :74-81); `OpeningBalancesPage.tsx` (:34-37); `packages/fixtures/src/society/dashboard.ts` (:83); `apps/backoffice/src/prototype/routes.tsx` (:135-141, :220-239)
- **Implementation note:** Server: leave out `href` when the viewer fails the target's access rule (the C.2 `collections-read.ts` `opts.bank` pattern). Client: gate each contextual link with `allows(target)` (`ResidentsOffice.tsx:31`); the figure stays as plain text. Replace hard-coded `/backoffice/...` strings with the `SOCIETY`, `FINANCE` and `OPS` helpers. Export each path's access target from the route table so links and routes share one source (the same helper HQ-02 needs). Use the unused `d.canSee.roster` in HR. The bank-target rows (bank lines not reconciled, settled in the bank, reconciliation links) are being handled by Issue #18: reuse its gate, do not add a second one.
- **Acceptance criteria:** Signed in as Imran (manager), Naveed (maintenance), Waqas (technician), the guard, HR without `hr.shifts`, the treasurer and the accounts officer, no contextual link on the listed screens leads to a planned page, a 403 state or a drawer that does not open. Figures stay visible as text where the person may see them.
- **Tests to add:** Browser (`access.spec.ts` or `permissions.spec.ts`): per persona, follow every contextual link on the listed screens and assert the target renders its screen. API (`society.api.test.ts`, `finance.api.test.ts`): dashboard payloads carry no `href` for targets the persona cannot open. axe: not needed. EN/UR 320px@200%: not needed.
- **Risk and blast radius:** Many screens; touches `routes.tsx`, which S.3 also edits (merge conflicts).
- **Depends on:** Issue #18 (bank rows and gating helper); S.3 merged (`routes.tsx`, `role-templates.ts`). Re-check the bank rows after Issue #18 lands.
- **Confidence and re-check:** verified in code (lead re-check of the role template); files unchanged a0d4a70→474e4ae.

#### SH-05

**Rank 36 · P2 · A built screen says "Planned" when the person's role cannot open it**

- **Priority:** P2 (audit and recommended)
- **Area:** SH: Shared UI and shell (audit §3)
- **Screen and route:** Any built screen without permission, e.g. the technician at MNT-004 `/backoffice/mnt/new-request`
- **Status:** open · **Size:** M
- **Files to change:** `apps/backoffice/src/prototype/routes.tsx` (:246-255 and every `S1Screen`, `SocietyScreen`, `OpsScreen` fallback); `apps/backoffice/src/prototype/register.tsx` (:14-17); `packages/ui/src/layout/PlannedScreenView.tsx` (:44-45, :68)
- **Implementation note:** In the route fallback, when the register row is built and the organisation has the feature but the permission check fails, render the existing `AccessOutcomeView` with the "permission missing" reason ("Your role doesn't include this"). Keep "Planned" only for unbuilt rows or another kind of organisation.
- **Acceptance criteria:** The technician on MNT-004 sees the permission outcome, not "Planned"; a non-society organisation still sees "Planned"; the HQ preview (HQ-02) agrees.
- **Tests to add:** Browser (`access.spec.ts`): technician → MNT-004 shows the permission outcome; non-society tenant → planned page. axe: outcome view.
- **Risk and blast radius:** `routes.tsx` (S.3 conflict).
- **Depends on:** S.3 merged. Pairs with HQ-02.
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### SH-06

**Rank 37 · P2 · The design-system lab leaks into client flows (route error page and the command-palette route)**

- **Priority:** P2 (audit and recommended)
- **Area:** SH: Shared UI and shell (audit §3)
- **Screen and route:** Backoffice route error page; GLOBAL-001 `/backoffice/global/command-palette`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/prototype/RouteError.tsx` (:17); `apps/backoffice/src/prototype/CommandPaletteRoute.tsx` (:11)
- **Implementation note:** "Go to start page" goes to `LINKS.start` (the role-aware dashboard) instead of `/backoffice/lab`. The palette route renders the start page with the palette open over it, as its comment says.
- **Acceptance criteria:** "Go to start page" lands on `/backoffice/home/role-aware-dashboard`; the palette route shows the start page behind the palette; no client flow reaches the lab.
- **Tests to add:** Browser (`shell.spec.ts`): force a route error → link target; open the palette route → start page underneath. axe: error page.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code (lead re-check); re-read at 474e4ae.

#### SH-07

**Rank 38 · P2 · The Quick create page disables actions that work in the header menu**

- **Priority:** P2 (audit and recommended)
- **Area:** SH: Shared UI and shell (audit §3)
- **Screen and route:** GLOBAL-003 `/backoffice/global/quick-create`
- **Status:** open · **Size:** M
- **Files to change:** `apps/backoffice/src/pages/global/QuickCreatePage.tsx` (:6-12, :36-55); `packages/ui/src/shell/QuickCreateMenu.tsx` (:15-25)
- **Implementation note:** Build the page from the menu's live and planned lists (export them once) and open the same drawers (new lead, schedule a visit, new service request, office payment where permitted). Add an empty state when nothing is permitted. Remove "Stage 2" wording (X-08).
- **Acceptance criteria:** For each persona, every action the header menu enables is enabled on the page; nothing says "Stage 2"; a persona with no actions sees an empty state.
- **Tests to add:** Browser (`shell.spec.ts`): per persona, compare menu actions with page actions. axe: page.
- **Risk and blast radius:** Low.
- **Depends on:** X-08 (B6) for the wording keys.
- **Confidence and re-check:** verified in code (lead re-check); files unchanged a0d4a70→474e4ae.

#### FIN-05

**Rank 39 · P2 · The close drawer's "Count cash" link opens a count form the viewer cannot submit, and drops the filters**

- **Priority:** P2 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** BANK-008 `/backoffice/bank/cashbook?drawer=close` → `?drawer=count`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/finance/CashbookPage.tsx` (:750, :235); rule at `packages/fixtures/src/society/finance/handlers-books.ts` (:797)
- **Implementation note:** Show "Count cash" only when the cashbook view allows counting; open the count drawer only then (otherwise show the access reason); build the link from the current parameters so `period` and `account` stay.
- **Acceptance criteria:** Rabia (administrator) does not see the link, and a direct `?drawer=count` gives a reason instead of a form; the treasurer keeps period and account.
- **Tests to add:** API (`finance.api.test.ts`): count POST by the administrator → 403 and no state change. Browser (`s1.spec.ts`): administrator has no link; treasurer keeps filters. axe: close drawer.
- **Risk and blast radius:** Low.
- **Depends on:** Issue #18 merged (CashbookPage).
- **Confidence and re-check:** verified in code; re-read at 474e4ae.

#### FIN-19

**Rank 40 · P3 · ADM-003 and ADM-023 routes have no route guard (raw 403 instead of the access outcome)**

- **Priority:** P3 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** ADM-003 `/backoffice/adm/user-workspace`; ADM-023 `/backoffice/adm/plan`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/prototype/routes.tsx` (:445 `adm/plan`, :548 `adm/user-workspace`)
- **Implementation note:** Wrap both lazy routes in an access target requiring `admin.view`, as `BrandingRoute` does.
- **Acceptance criteria:** A non-administrator opening either address sees the access outcome, not a raw error state.
- **Tests to add:** Browser (`access.spec.ts`): manager opens both → access outcome. axe: outcome view.
- **Risk and blast radius:** `routes.tsx` (S.3 conflict). Low.
- **Depends on:** S.3 merged.
- **Confidence and re-check:** verified in code; re-read at 474e4ae.

#### FIN-20

**Rank 41 · P3 · Small layout and flow gaps: "Close {period}" without `period.close`; count grid always two columns; reminder rules editor has no Cancel**

- **Priority:** P3 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** BANK-007 cashbook `/backoffice/bank/cashbook`; BANK-008 close; COL-007 reminders `/backoffice/col/reminders`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/finance/CashbookPage.tsx` (:87, :627); `RemindersPage.tsx` (:207-240)
- **Implementation note:** (a) Show "Close {period}" only with `period.close`, or open the drawer with a clear "only … can close" reason. (b) Remove the conflicting grid class so the count form is one column at narrow widths, two at small container widths and four at medium. (c) Add a Cancel that discards the rule edits.
- **Acceptance criteria:** A role without `period.close` gets no Close button or a stated reason; the count drawer is one column at 320px@200%; rule edits can be cancelled.
- **Tests to add:** Browser (`s1.spec.ts`). EN/UR 320px@200%: count drawer (`layoutProblems`). axe: close and count drawers.
- **Risk and blast radius:** Low.
- **Depends on:** Issue #18 merged (CashbookPage).
- **Confidence and re-check:** verified in code; re-read at 474e4ae (:87, :627). The 320 px risk is inferred.

#### COL-06

**Rank 42 · P2 · "Change payer" can open a drawer with nobody to choose**

- **Priority:** P2 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** SITE-006 Flat 360 `…/units/:id?tab=payer&drawer=change-payer`; RES-002 `/backoffice/res/occupancy-list`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/sites/FlatWorkspace.tsx` (:174-178, :567, :598, :616-618); `apps/backoffice/src/pages/society/people/OccupancyRoster.tsx` (:55-59)
- **Implementation note:** Work out the candidates before offering the action. If there are none, hide it and say "To change the payer, first record a tenant or co-owner", linking to the people tab where permitted.
- **Acceptance criteria:** A-101 (owner-occupied, owner paying) shows no Change payer action and shows the explanation; flats with candidates are unchanged.
- **Tests to add:** API (`society.api.test.ts`): a change-payer request with no eligible candidate → 422, no state change. Browser (`society.spec.ts`): A-101 → explanation. axe: payer tab.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; affected flats inferred from the C.2 data; files unchanged a0d4a70→474e4ae.

#### COL-17

**Rank 43 · P3 · Opening-balances and import actions offered without `site.manage`**

- **Priority:** P3 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** SITE-004 bulk unit import; SITE-007 opening balances; HOME-001 checklist
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/sites/ImportPage.tsx` (:42, :74-81); `OpeningBalancesPage.tsx` (:34-37); `packages/fixtures/src/society/dashboard.ts` (:83)
- **Implementation note:** Gate "Use the sample" and "Import flats" on `site.manage` (as `StructurePage.tsx:69` does) and show a read-only state that says who can import. The dashboard checklist omits the link without `site.manage`. Do it together with X-03's last row.
- **Acceptance criteria:** The treasurer and the accounts officer never see import actions and never get a 403 alert from normal navigation.
- **Tests to add:** API: import POST by the treasurer → 403, no state change. Browser (`access.spec.ts`): per persona. axe: read-only state.
- **Risk and blast radius:** Low.
- **Depends on:** X-03 (same batch).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### HQ-01

**Rank 44 · P2 · "Preview as client" lists an address that does not exist (`/backoffice/sal/booking-list`) and says it opens**

- **Priority:** P2 (audit and recommended)
- **Area:** HQ: Platform HQ and developer pages (audit §9)
- **Screen and route:** HQ-009 `/hq/tenants/:id/preview`
- **Status:** open · **Size:** S
- **Files to change:** `apps/platform-hq/src/pages/preview/PreviewPage.tsx` (:62, :311-313); `packages/ui/src/workspace/tenantWorkspace.ts` (:161-173)
- **Implementation note:** Correct the path to the register's `/backoffice/bkg/bookings-list`. Add a unit test that every preview sample address resolves to a register row (`docs/ui/screen-register.csv`) and a menu area.
- **Acceptance criteria:** No sample address says "Opens" while the backoffice says the page doesn't exist.
- **Tests to add:** Unit (Vitest): register lookup for all sample addresses. Browser (`hq.spec.ts`): preview row. axe: not needed.
- **Risk and blast radius:** Low. `tenantWorkspace.ts` is edited by S.3.
- **Depends on:** S.3 merged (`tenantWorkspace.ts`).
- **Confidence and re-check:** verified in code (lead re-check of the register lookup); re-read at 474e4ae.

#### HQ-02

**Rank 45 · P2 · The preview's access rule ignores the conditions the backoffice routes apply**

- **Priority:** P2 (audit and recommended)
- **Area:** HQ: Platform HQ and developer pages (audit §9)
- **Screen and route:** HQ-009 `/hq/tenants/:id/preview?role=`
- **Status:** open · **Size:** L
- **Files to change:** `apps/backoffice/src/prototype/routes.tsx` (:232, :246-255, :498); `packages/ui/src/workspace/tenantWorkspace.ts` (:161-173)
- **Implementation note:** Move each address's access target (its permission and organisation conditions, such as `useOpsSite()` needing a society) into one shared module used by both the route table and `workspaceRouteTarget`, so the preview evaluates the same rule.
- **Acceptance criteria:** The HQ preview says the Al-Noor technician cannot open MNT-004 (permission), matching the backoffice; non-society tenants with the maintenance or visitors modules are previewed correctly.
- **Tests to add:** Unit (Vitest): table-driven parity test, route table versus preview, for every registered address and role in the seeded tenants. Browser (`hq.spec.ts`): sample rows.
- **Risk and blast radius:** Refactors the route table. Conflicts with S.3's route changes.
- **Depends on:** S.3 merged; SH-05 and X-03 (shared access-target module).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### HQ-05

**Rank 46 · P3 · The preview's phone bar differs from the client's real bar for finance roles**

- **Priority:** P3 (audit and recommended)
- **Area:** HQ: Platform HQ and developer pages (audit §9)
- **Screen and route:** HQ-009 preview phone bar
- **Status:** open · **Size:** S
- **Files to change:** `apps/platform-hq/src/pages/preview/PreviewPage.tsx` (:187); `apps/backoffice/src/prototype/ShellLayout.tsx` (:92); `packages/ui/src/shell/BottomNav.tsx` (:28-37)
- **Implementation note:** Export the shell's bottom-bar ordering and reuse it in the preview.
- **Acceptance criteria:** For every role, the preview's phone bar equals the real one.
- **Tests to add:** Unit: parity per role. Browser (`hq.spec.ts`): one finance role.
- **Risk and blast radius:** Low.
- **Depends on:** HQ-02 (same area).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### HQ-06

**Rank 47 · P3 · HQ tour completion offers "Try a practice task", which just opens the dashboard**

- **Priority:** P3 (audit and recommended)
- **Area:** HQ: Platform HQ and developer pages (audit §9)
- **Screen and route:** HQ tour completion dialog
- **Status:** open · **Size:** S
- **Files to change:** `apps/platform-hq/src/nav.config.ts` (:55); `packages/ui/src/onboarding/TourDialogs.tsx` (:85-89)
- **Implementation note:** Make the practice link optional; the dialog hides the button when an app has no practice mode; remove HQ's mapping to the dashboard.
- **Acceptance criteria:** HQ's tour completion shows no practice button; the backoffice is unchanged.
- **Tests to add:** Browser (`onboarding.spec.ts`): HQ completion dialog.
- **Risk and blast radius:** Low.
- **Depends on:** SH-03 (B5) edits `TourDialogs.tsx` too.
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

### B5 · Flow safety: the right record, confirmed destructive actions (7)

#### RES-07

**Rank 48 · P2 · Repair, issue and pass sheets keep the previous record's typed text, so a message can be sent to the wrong repair**

- **Priority:** P2 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-018 `/customer/portal/maintenance-workspace?record=…`; PORTAL-034 `/customer/portal/issues?record=…`; pass sheet `/customer/portal/services-home?tab=visitors&pass=…`
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/operations/RepairsPage.tsx` (:76, :237-241, :255); `IssuesPage.tsx` (:63, :204-205); `ServicesHub.tsx` (:168, :292-293)
- **Implementation note:** Reset each sheet's local state (mode, rating, reason, comment, error, "copied") when the record changes or the sheet closes; the simplest way is to key the sheet's content by the record id. Make sure the send action uses the id of the record currently shown.
- **Acceptance criteria:** Open repair A, type a message, close, open repair B: B's fields are empty, and Send on B never posts A's text. The same for issues and passes; "Copied" does not carry over.
- **Tests to add:** Browser (`d2.spec.ts`): follow the audit's steps and read back through the API that the comment landed on B with B's text only. EN/UR 320px@200%: sheet. axe: not needed.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; re-read at 474e4ae (close resets only `mode`).

#### FIN-13

**Rank 49 · P2 · The export review drawer keeps the previous request's choices; "Approve" then sends A's dataset list for B**

- **Priority:** P2 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** ADM-024 `/backoffice/adm/data`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/adm/data/ExportDrawers.tsx` (:168-179, :196-199); `apps/backoffice/src/pages/adm/data/DataPrivacyPage.tsx` (:162); the export-approval handler in `packages/fixtures/src/identity` (server hardening)
- **Implementation note:** Reset the kept datasets, the note and its error whenever the request changes or the drawer closes (key the content by request id). Server hardening: the approval names the request, and the dataset list must be a subset of that request's datasets, otherwise 422.
- **Acceptance criteria:** Narrow request A, press Escape, open request B: B shows its own defaults, and Approve on B sends only B's datasets.
- **Tests to add:** API (`identity.api.test.ts`): approving with a dataset outside the request → 422, nothing exported. Browser (`identity.spec.ts`): the A-then-B steps. axe: drawer.
- **Risk and blast radius:** Personal-data export approvals; low code risk.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; re-read at 474e4ae (reset only in `done`).

#### RES-08

**Rank 50 · P2 · Irreversible resident actions run on a single tap**

- **Priority:** P2 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-018 cancel a repair; resident services (remove an approved vehicle, cancel a booking); PORTAL-020 cancel a pass; PORTAL-025 withdraw a household request
- **Status:** open · **Size:** M
- **Files to change:** `apps/customer-web/src/pages/operations/RepairsPage.tsx` (:332-336); `ResidentServices.tsx` (:71-87, :268-272); `ServicesHub.tsx` (:332-351); `apps/customer-web/src/pages/household/HouseholdPages.tsx` (:360-368); effect strings in `operations.json`, `identity.json` EN/UR
- **Implementation note:** Put each action behind a `ConfirmDialog` that states the effect (for example, that removing an approved vehicle ends its parking approval), in the destructive style, and announce the result, as chat leave and block already do. Uses X-09's improved dialog.
- **Acceptance criteria:** Each action asks for confirmation with an effect sentence; Cancel changes nothing and sends nothing; confirming performs the action once.
- **Tests to add:** Browser (`d2.spec.ts`, `identity.spec.ts`): per action, Cancel → no request; confirm → done once. EN/UR 320px@200%: each dialog. axe: each dialog.
- **Risk and blast radius:** Low.
- **Depends on:** X-09 (B3) soft.
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### FIN-17

**Rank 51 · P3 · One-tap destructive actions (cancel invitation; "Hand it back" for a cheque), and the return memo sits far below the dialog**

- **Priority:** P3 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** Portal access `/backoffice/residents/portal-access`; FIN-013 `/backoffice/fin/office-collections`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/portal/PortalPeople.tsx` (:34-39); `apps/backoffice/src/pages/society/finance/OfficeCollectionsPage.tsx` (:551-555, :692)
- **Implementation note:** Cancel invitation goes through `ConfirmDialog` and handles failure (X-01). "Hand it back" goes through `ConfirmDialog` with a typed reason instead of a canned one, and the return memo moves into that dialog.
- **Acceptance criteria:** No one-tap destructive action remains; the reason recorded is the one typed; the memo is beside the decision.
- **Tests to add:** API (`finance.api.test.ts`): returning a cheque without a reason → 422, no state change. Browser (`s1.spec.ts`): dialog flows. axe: dialogs.
- **Risk and blast radius:** Low.
- **Depends on:** Issue #18 merged (OfficeCollectionsPage); X-09 (B3).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### RES-19

**Rank 52 · P3 · Gate prompt: Escape dismisses it for good, and the countdown can sit at 0 with live buttons**

- **Priority:** P3 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** Resident gate prompt (visitor at the gate), over any resident page
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/operations/GatePrompt.tsx` (:42, :46)
- **Implementation note:** At 0, disable Approve and Deny and say the guard will decide (or close the prompt). After Escape, tell the resident where they can still answer (notifications or the visitors tab).
- **Acceptance criteria:** The buttons are inactive at 0; after Escape the resident is told where to respond.
- **Tests to add:** Browser (`d2.spec.ts`) with a controlled clock. axe: prompt.
- **Risk and blast radius:** Low.
- **Depends on:** RES-18 (same file).
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### SH-03

**Rank 53 · P2 · "Open help" and "Practice" from the palette or a finished tour drop the page's record**

- **Priority:** P2 (audit and recommended)
- **Area:** SH: Shared UI and shell (audit §3)
- **Screen and route:** Any page with record parameters, e.g. `/backoffice/crm/lead-360-workspace?record=…`
- **Status:** open · **Size:** S
- **Files to change:** `packages/ui/src/command/CommandPalette.tsx` (:118, :123); `packages/ui/src/onboarding/TourDialogs.tsx` (:90)
- **Implementation note:** Add `help=open` or `drawer=…` with `useQueryParams` (as `HelpMenu` does), keeping `record`, `tab` and filters.
- **Acceptance criteria:** From Lead 360 with a record, "Open help" keeps the record and the page stays on it.
- **Tests to add:** Browser (`command-palette.spec.ts`, `onboarding.spec.ts`): URL keeps `record`. axe: not needed.
- **Risk and blast radius:** Low.
- **Depends on:** SH-01 (B2) edits the same palette.
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### RES-18

**Rank 54 · P3 · Notification items navigate twice, so Back needs two presses**

- **Priority:** P3 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** Resident notifications list
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/operations/GatePrompt.tsx` (:127-135)
- **Implementation note:** Navigate once: either the link's `href` or the `onPress` handler, not both. Confirm on the dev server first (the audit inferred it from React Aria behaviour).
- **Acceptance criteria:** Opening a notification adds one history entry; one Back returns.
- **Tests to add:** Browser (`d2.spec.ts`): open a notification → Back once → previous page.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** inferred (React Aria `Link` behaviour); file unchanged a0d4a70→474e4ae.

### B6 · Financial and status wording (8)

#### FIN-08

**Rank 55 · P2 · Vouchers awaiting approval are described as "Paid out" / "ادا کی گئی" before anything is approved or posted**

- **Priority:** P2 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** APR-002 `/backoffice/apr/approval-360-view?record=…`; BANK-009 voucher drawer
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/finance/ApprovalPages.tsx` (:143); `CashbookPage.tsx` (:468); `en-PK/ur-PK finance.json` (:302-305)
- **Implementation note:** Use neutral direction labels: "Payment (money out)" / "Receipt (money in)", and in Urdu the audit's "ادائیگی / وصولی" (native review). Keep past-tense wording only for posted vouchers, if wanted.
- **Acceptance criteria:** The approver of a submitted voucher never reads "Paid out" / "ادا کی گئی"; posted vouchers may.
- **Tests to add:** Browser (`s1.spec.ts`): EN and UR text on Approval 360 and the drawer. EN/UR 320px@200%: Approval 360. i18n lint.
- **Risk and blast radius:** Wording only.
- **Depends on:** Issue #18 merged (CashbookPage).
- **Confidence and re-check:** verified in code (lead re-check); seen in `gate-s1/screenshots/g05-approval-preparer-cannot-decide-390-ur.png`; files unchanged a0d4a70→474e4ae.

#### FIN-09

**Rank 56 · P2 · The reminder preview labels channels "Sent" before anything is sent**

- **Priority:** P2 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** COL-009 send reminder drawer, from COL-007 `/backoffice/col/reminders`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/finance/RemindersPage.tsx` (:340); `en-PK/ur-PK governance.json` (:367)
- **Implementation note:** Add a separate preview key ("Will send" / "بھیجی جائے گی") and keep "Sent" for history. Move the channel and outcome into one translated sentence instead of joining them in code (X-06).
- **Acceptance criteria:** The preview never says Sent; history still does.
- **Tests to add:** Browser (`s1.spec.ts`): preview text in EN and UR. i18n lint.
- **Risk and blast radius:** Wording only.
- **Depends on:** None.
- **Confidence and re-check:** verified in code (lead re-check); seen in `gate-s1/screenshots/o02-reminder-preview-skips-1440-en.png`; files unchanged a0d4a70→474e4ae.

#### FIN-06

**Rank 57 · P2 · An ownership transfer says "Completed" while the payer change is still pending, and that step never shows as done**

- **Priority:** P2 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** OWN-003 `/backoffice/own/transfers-list`; OWN-004 `/backoffice/own/transfer-review-approval?record=…`
- **Status:** needs an owner decision · **Size:** M · **Owner decision:** OD-2
- **Files to change:** `apps/backoffice/src/pages/society/finance/OwnershipPages.tsx` (:88, :211, :216); `packages/fixtures/src/society/finance/handlers-dues.ts` (:713-714); `packages/fixtures/src/society/handlers.ts` (:771)
- **Implementation note:** Stop copying the payer-change state into the transfer when the certificate is issued; read the live payer-change request in the view. Show "Certificate issued, payer change pending" until it is approved ("…payer change refused" if refused), then "Completed". OD-2 asks the owner what "Completed" means; it touches the documented S.1 open item on the owner of record after a transfer.
- **Acceptance criteria:** After the certificate with the payer change pending: no green "Completed" / "مکمل". After approval: "Completed" and "Payer changed" marked done. Same in Urdu.
- **Tests to add:** API (`finance.api.test.ts`): transfer view status before and after payer-change approval and refusal. Browser (`s1.spec.ts`). EN/UR 320px@200%: OWN-004. axe: OWN-004.
- **Risk and blast radius:** Transfer status semantics; S.1 data model.
- **Depends on:** OD-2. FIN-11 (B9) edits the same steps.
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### FIN-07

**Rank 58 · P2 · The clearance certificate says no dues were outstanding when they were waived**

- **Priority:** P2 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** OWN-006 `/backoffice/own/transfer-review-approval?record=…&drawer=certificate`
- **Status:** needs an owner decision · **Size:** S · **Owner decision:** OD-3
- **Files to change:** `apps/backoffice/src/pages/society/finance/OwnershipPages.tsx` (:385-386); `en-PK/ur-PK governance.json` (:534-535)
- **Implementation note:** Two variants of the sentence: "no dues were outstanding on {date}", or "dues of {amount} were outstanding on {date} and were waived under approval {ref}". The certificate is a document buyers and sellers rely on, so the owner approves both variants in English and Urdu (OD-3).
- **Acceptance criteria:** In the waived case the certificate never says that no dues were outstanding, and it cites the waiver's approval.
- **Tests to add:** Browser (`s1.spec.ts`): waived scenario, EN and UR; print preview. EN/UR 320px@200%: certificate drawer.
- **Risk and blast radius:** Legal wording.
- **Depends on:** OD-3; native Urdu reader.
- **Confidence and re-check:** verified in code (lead re-check); files unchanged a0d4a70→474e4ae.

#### HR-01

**Rank 59 · P2 · Advance wording asserts facts the system cannot verify, and the limits text contradicts the server's enforced limits**

- **Priority:** P2 (audit and recommended)
- **Area:** HR: Society HR (S.2a) (audit §7)
- **Screen and route:** HR-007 `/backoffice/hr/employee-advances`; HR-008 `/backoffice/hr/employee-advance-settlement` (the audit calls them HR-009/010; the register says HR-007/008)
- **Status:** needs an owner decision · **Size:** S · **Owner decision:** OD-4
- **Files to change:** `en-PK/ur-PK hr.json` (:584-585 `kindHint`, :601 `approvedExplain`, :606 `planNote`, :617 `noPolicy`, :628 withdraw effect, :644 `partial`); `apps/backoffice/src/pages/society/hr/AdvancesPages.tsx` (:173, :330); `packages/fixtures/src/hr/handlers.ts` (:918); `packages/fixtures/src/hr/views.ts` (:312)
- **Implementation note:** Wording (ruling O8): "nothing is recorded as paid; nothing is recorded as owed" in both languages, and the withdraw effect says no payment is recorded rather than "nothing is paid". Limits (OD-4): the server enforces 6 instalments for an advance and 36 for a loan, while `noPolicy` says there are no adopted limits. Either state them as the system's limits and drop "no adopted limits", or keep the sentence and remove the guard (not recommended). Remove the S.2b codes (X-08).
- **Acceptance criteria:** No sentence asserts that nothing is paid or owed; the limits text matches the server; no gate codes.
- **Tests to add:** API (`hr.api.test.ts`): instalments above the maximum → 422 with the `max` parameter. Browser (`s2a.spec.ts`): EN and UR text. i18n lint.
- **Risk and blast radius:** HR wording; policy statement.
- **Depends on:** OD-4; X-08.
- **Confidence and re-check:** verified in code; re-read at 474e4ae (server limits at hr/handlers.ts:918; copy at hr.json:584-585, :601, :617).

#### COL-10

**Rank 60 · P2 · "Coming in later stages" lists features that are built (maintenance, visitors, notices) and says "Arrives in D"**

- **Priority:** P2 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** HOME-001 "later" panel `/backoffice/home/role-aware-dashboard`; SITE-002 Site 360 checklist
- **Status:** open · **Size:** S · **Owner decision:** OD-5
- **Files to change:** `packages/fixtures/src/society/dashboard.ts` (:186-192); `packages/fixtures/src/society/handlers.ts` (:294); `packages/fixtures/src/society/alnoor.ts` (:236); `apps/backoffice/src/pages/society/SocietyDashboard.tsx` (:500-516); `apps/backoffice/src/pages/society/kit.tsx` (:121)
- **Implementation note:** Remove shipped items from the "later" list. Better, derive the list from the screen register (rows not built) instead of a hand-kept list. Badge the remaining items with plain wording (X-08, OD-5).
- **Acceptance criteria:** Nothing built is listed as coming later; no "Arrives in D".
- **Tests to add:** Unit (`society.test.ts`): every "later" item maps to a register row that is not built. Browser (`society.spec.ts`): panel contents. EN/UR 320px@200%: panel.
- **Risk and blast radius:** Low.
- **Depends on:** X-08 (wording).
- **Confidence and re-check:** verified in code (lead re-check); files unchanged a0d4a70→474e4ae.

#### COL-15

**Rank 61 · P3 · Charge and payment wording are blurred ("{{flat}} pays" for a charge; "Settles" for both previews and issued receipts)**

- **Priority:** P3 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** Billing rules "Which rule wins"; collections allocation previews and receipts
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/billing/RulesPage.tsx` (:240); `billing.json` (:789); `apps/backoffice/src/pages/society/collections/ckit.tsx` (:187); `collections.json` (:62); EN and UR
- **Implementation note:** "Charges for {flat}" (and the Urdu equivalent) for a charge total; separate "Would settle" (preview) and "Settled" (receipt) keys.
- **Acceptance criteria:** Charge totals are not called payments; previews are not phrased as done.
- **Tests to add:** Browser (`collections.spec.ts`): EN and UR text. i18n lint.
- **Risk and blast radius:** Wording only.
- **Depends on:** Native Urdu reader.
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### X-08

**Rank 62 · P3 · Internal gate and stage codes appear in client-facing copy ("Arrives in D", "Coming in Stage 2", "needs S.2b", "(D-46)")**

- **Priority:** P3 (audit and recommended)
- **Area:** X: Cross-cutting patterns (audit §2)
- **Screen and route:** Header Quick create menu (every client), HOME-001 later badge, HR-007/008 advances, practice sandbox, finance copy
- **Status:** open · **Size:** M · **Owner decision:** OD-5
- **Files to change:** `en-PK/ur-PK billing.json` (:221), `common.json` (:205-206), `hr.json` (:606, :644), `onboarding.json` (:81), `finance.json` (:775); `packages/ui/src/shell/QuickCreateMenu.tsx` (:123, :130); `apps/backoffice/src/pages/society/kit.tsx` (:121); `hr/AdvancesPages.tsx` (:173, :330); `help/PracticeSandbox.tsx` (:40); `scripts/check-i18n.mjs`
- **Implementation note:** Replace gate, stage and decision codes with plain client language ("Planned", "Not available yet", "Payroll"), keeping the codes in docs. Extend the i18n check to reject internal codes (Stage N, gate letters, S.2b-style codes, D-nn) in client-facing namespaces. OD-5 confirms the wording for unbuilt features.
- **Acceptance criteria:** No client-visible string in EN or UR contains an internal code, and the lint enforces it.
- **Tests to add:** Lint (`check-i18n.mjs` extension) with a failing fixture string. Browser: Quick create menu text.
- **Risk and blast radius:** Many keys; `common.json` is also edited by S.3.
- **Depends on:** S.3 merged (`common.json`).
- **Confidence and re-check:** verified in code (lead re-check); re-read at 474e4ae (common.json:205-206, onboarding.json:81, hr.json:606/:644, billing.json:221).

### B7 · Deep links, filters and the contextual chain (11)

#### X-05

**Rank 63 · P3 · Search is not kept in the URL, empty states ignore an active search or filter, and returning from a proof loses the filter**

- **Priority:** P3 (audit and recommended)
- **Area:** X: Cross-cutting patterns (audit §2)
- **Screen and route:** MNT lists, VIS lists, vehicles, services directory, approvals, billing run, HR employees, FIN-008 inbox, FIN-005 payments, BANK-006 transfers, FIN-013, RES-002 roster, BILL-001 accounts, FIN-009 breadcrumb
- **Status:** open · **Size:** L
- **Files to change:** `operations/MaintenancePages.tsx` (:208, :242); `VisitorPages.tsx` (:421, :429, :530, :537); `VehiclesOffice.tsx` (:27, :40); `community/ServicesDirectoryPage.tsx` (:36, :67); `finance/ApprovalPages.tsx` (:56-57, :108-110); `billing/RunWorkspace.tsx` (:417); `hr/EmployeesPage.tsx` (:23-25, :53); `collections/ProofInbox.tsx` (:65); `PaymentsPage.tsx` (:92); `TransfersPage.tsx` (:84-85); `OfficeCollectionsPage.tsx` (:128-129); `people/OccupancyRoster.tsx` (:34-66); `billing/AccountsPage.tsx` (:42); `collections/ProofReview.tsx` (:86, :449)
- **Implementation note:** Keep a debounced `q` in the URL with `useQueryParams` (the ProofInbox pattern). When a search or filter is active and nothing matches, say "Nothing matches '…'" with a Clear action. Show the search field's clear button. Proof review returns to the inbox with its previous state (carry it in the URL).
- **Acceptance criteria:** Search survives reload and Back; filtered empty lists say so and offer Clear; the clear button is visible; returning from a proof keeps the inbox filter.
- **Tests to add:** Browser: one list per area (MNT, VIS, FIN-008, HR) → reload keeps the search; filtered empty state text. EN/UR 320px@200%: filtered empty state. axe: one list.
- **Risk and blast radius:** Many lists; mechanical.
- **Depends on:** Issue #18 merged (TransfersPage, OfficeCollectionsPage, ProofReview).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### COL-03

**Rank 64 · P2 · Building cards on the collections dashboard lose their building filter**

- **Priority:** P2 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** COL-001 `/backoffice/col/collections-dashboard` "By block" → BILL-001 `/backoffice/billing/accounts?building=…&status=owing`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/billing/AccountsPage.tsx` (:17-30); link built at `packages/fixtures/src/society/collections-read.ts` (:293); server support at `handlers.ts` (:1034-1039)
- **Implementation note:** Read `building`, pass it to the query and show it as a clearable chip with the building's name.
- **Acceptance criteria:** A block card opens only that block's owing accounts with a chip; clearing the chip shows all.
- **Tests to add:** Browser (`collections.spec.ts`): card → count equals the block's owing accounts (evidence `m04` showed 75 across both blocks). axe: list with chip.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code (lead re-check); seen in `gate-c2/screenshots/m04-building-opens-its-owing-accounts-1440-en.png`; files unchanged a0d4a70→474e4ae.

#### COL-05

**Rank 65 · P2 · The invoice workspace never shows the payments that settled it**

- **Priority:** P2 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** FIN-003 `/backoffice/fin/invoice-workspace?record=…`
- **Status:** open · **Size:** M
- **Files to change:** `apps/backoffice/src/pages/society/billing/InvoiceWorkspace.tsx` (:58-63, :73-135); `packages/contracts/src/billing.ts` (:299-300 `InvoiceDetail.payments`)
- **Implementation note:** Add a "Paid" figure (sum of live allocations) and a Payments panel listing the payments and receipts that settled the invoice, with reversed ones marked (B1 rules) and links to Payment 360 only where permitted (X-03).
- **Acceptance criteria:** A paid invoice shows the paid amount and links to its payments and receipts; a reversed payment is marked.
- **Tests to add:** API (`society.api.test.ts`): invoice detail payments flag reversed ones. Browser (`collections.spec.ts`): panel and link. EN/UR 320px@200%: workspace. axe: workspace.
- **Risk and blast radius:** Low.
- **Depends on:** B1 (COL-01 same file; reversal rules).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### FIN-15

**Rank 66 · P3 · Finance dashboard figures open lists that don't match the figure**

- **Priority:** P3 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** FIN-001 `/backoffice/fin/finance-dashboard`
- **Status:** open · **Size:** M
- **Files to change:** `packages/fixtures/src/society/finance/overview.ts` (:120, :131-133); `apps/backoffice/src/pages/society/collections/ProofInbox.tsx` (:24); payments list period filter
- **Implementation note:** Pass and support period and state filters: "Proofs waiting" opens the pending filter added by COL-04; "Collected" opens payments for that period; "Settled in the bank" opens matched credit lines for that period (after Issue #18's gate).
- **Acceptance criteria:** Each dashboard figure opens a list whose total equals the figure.
- **Tests to add:** API: list filters return the counted sets. Browser (`s1.spec.ts`): figure versus list total.
- **Risk and blast radius:** Low.
- **Depends on:** Issue #18 (bank figure); COL-04 (B1, inbox filter).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### FIN-16

**Rank 67 · P3 · Action links land on a list instead of the action**

- **Priority:** P3 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** FIN-001 "Prepare a deposit or transfer"; Account 360 action
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/finance/FinanceDashboard.tsx` (:192-193); `AccountsPages.tsx` (:103)
- **Implementation note:** Link to the transfers page with its "new" drawer open (it exists) when the person may prepare one; otherwise do not show the action.
- **Acceptance criteria:** The action links open the action.
- **Tests to add:** Browser (`s1.spec.ts`).
- **Risk and blast radius:** Low.
- **Depends on:** Issue #18 merged (FinanceDashboard, AccountsPages).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### OPS-03

**Rank 68 · P3 · The "Expected today" figure opens the wrong gate tab**

- **Priority:** P3 (audit and recommended)
- **Area:** OPS: Operations and community (D.2/D.3) (audit §6)
- **Screen and route:** VIS-001 `/backoffice/vis/visitor-dashboard` → VIS-004 `/backoffice/vis/gate-check-in`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/operations/VisitorPages.tsx` (:67, :217-230)
- **Implementation note:** Link to the Check-in tab, where expected passes are, instead of the queue.
- **Acceptance criteria:** "Expected today" opens the list of expected passes.
- **Tests to add:** Browser (`d2.spec.ts`).
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### OPS-04

**Rank 69 · P3 · The issues board ignores the registered `?status=` filter**

- **Priority:** P3 (audit and recommended)
- **Area:** OPS: Operations and community (D.2/D.3) (audit §6)
- **Screen and route:** MNT-012 `/backoffice/mnt/issues?status=resolved`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/operations/IssuesBoard.tsx` (:24, :61)
- **Implementation note:** Accept `status` and `area` as the register (`screen-register.csv:394`) and `GATE_D2_REPORT.md:107` document; keep `issueStatus` as an alias for old links.
- **Acceptance criteria:** `?status=resolved` shows resolved issues.
- **Tests to add:** Browser (`d3.spec.ts` or `d2.spec.ts`).
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### HR-03

**Rank 70 · P3 · Employee 360 advance rows link to the generic Advances list (a rejected or withdrawn advance is not visible there)**

- **Priority:** P3 (audit and recommended)
- **Area:** HR: Society HR (S.2a) (audit §7)
- **Screen and route:** HR-003 `/backoffice/hr/employee-360-workspace?record=…` → HR-007 `/backoffice/hr/employee-advances`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/hr/Employee360Page.tsx` (:373); `AdvancesPages.tsx` (:28-29); `apps/backoffice/src/nav.config.ts` (:176)
- **Implementation note:** Support `?advance=<id>` on the advances page: open that advance's drawer from the URL with the matching status filter; Employee 360 passes it.
- **Acceptance criteria:** A rejected or withdrawn advance opens from Employee 360.
- **Tests to add:** Browser (`s2a.spec.ts`).
- **Risk and blast radius:** Low. `nav.config.ts` is edited by S.3.
- **Depends on:** S.3 merged (`nav.config.ts`).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### RES-15

**Rank 71 · P3 · The tour points to Receipts and Statement links that are not on the Bills page**

- **Priority:** P3 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-004 `/customer/portal/payments-dashboard` and its tour step
- **Status:** open · **Size:** S
- **Files to change:** `en-PK/ur-PK dues.json` (:310); `apps/customer-web/src/pages/dues/DuesPages.tsx` (:19-57)
- **Implementation note:** Add Receipts and Statement links on the Bills page (preferred), or change the tour text to where they are.
- **Acceptance criteria:** The tour step and the page agree.
- **Tests to add:** Browser (`onboarding.spec.ts`).
- **Risk and blast radius:** Low.
- **Depends on:** B1 (same file).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### COL-16

**Rank 72 · P3 · Al-Noor-specific IDs and copy are hard-coded**

- **Priority:** P3 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** Person 360, billing rules "Which rule wins", BANK-003 bank import, resident invitation copy
- **Status:** open · **Size:** M
- **Files to change:** `people/PersonWorkspace.tsx` (:90); `billing/RulesPage.tsx` (:37); `collections/BankPages.tsx` (:240); `billing.json` (:501, :506); `sites.json` (:364, :462); resident `operations.json` (:715); also `packages/fixtures/src/identity/household-handlers.ts` (:70, `siteName`, found while re-checking)
- **Implementation note:** Take ids from the data (the person's site, a flat that has rules, the accounts from the query) and make the copy generic with an organisation parameter. S.3 adds a portfolio tenant, not a second society, so this stays latent until a second society exists.
- **Acceptance criteria:** No hard-coded Al-Noor id or name remains in the listed places.
- **Tests to add:** Unit: grep guard for `site_alnoor`, `ben_anr_`, `unt_anr_` outside fixtures and tests. Browser: existing tests still pass.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### COL-18

**Rank 73 · P3 · Copy and state defects on the society dashboard, roster and exemptions**

- **Priority:** P3 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** HOME-001 society dashboard; RES-002 `/backoffice/res/occupancy-list`; billing exemptions
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/SocietyDashboard.tsx` (:116); `people/OccupancyRoster.tsx` (:22-23); `billing/ExemptionsPage.tsx` (:18, :66)
- **Implementation note:** Choose the greeting by time of day (as `home/ManagementDashboard.tsx:85` does); pass the organisation into the empty-state sentence; Retry refetches both queries; `?exemption=` scrolls to, focuses and labels the row as selected (not colour alone).
- **Acceptance criteria:** The greeting matches the time; the empty sentence is complete; Retry recovers both failures; the selected exemption is announced.
- **Tests to add:** Browser (`society.spec.ts`). axe: exemptions with selection.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

### B8 · Urdu, RTL and bidi (6)

#### X-06

**Rank 74 · P3 · Sentences assembled in code, Latin punctuation inside Urdu, lists joined with ", ", a missing plural**

- **Priority:** P3 (audit and recommended)
- **Area:** X: Cross-cutting patterns (audit §2)
- **Screen and route:** Proof inbox, Payment 360, bank import, reminders, approvals, committee, HR roster and Employee 360, chat settings, Sessions, data privacy, collections dashboard
- **Status:** open · **Size:** L
- **Files to change:** `collections/ProofInbox.tsx` (:107), `PaymentWorkspace.tsx` (:241), `society/kit.tsx` (:202), `BankPages.tsx` (:282-288), `finance/RemindersPage.tsx` (:340), `fkit.tsx` (:159), `ApprovalPages.tsx` (:261), `CommitteePage.tsx` (:121), `hr/Employee360Page.tsx` (:128, :131, :174, :303, :330), `RosterPage.tsx` (:126-130), `LeaveAdjustmentsPage.tsx` (:87, :97), `community/ChatSettingsPage.tsx` (:400), `packages/ui/src/identity/Sessions.tsx` (:181), `adm/data/DataPrivacyPage.tsx` (:166), `customer-web/.../CommunityHomePage.tsx` (:217); `collections.json` (:109); `packages/i18n/src/format/*` (new list formatter)
- **Implementation note:** Move word order and punctuation into the strings (placeholders and rich-text components); add a locale-aware list formatter in `packages/i18n/src/format` and use it where the items are translated words; Urdu question titles use "؟"; add the singular form for `arrearsContext`. Flat-code lists inside LTR isolation can stay.
- **Acceptance criteria:** No translated sentence is assembled by concatenation in the listed places; Urdu lists use "، "; "1 account late" in English.
- **Tests to add:** Unit: list formatter for en-PK and ur-PK. Browser: UR captures of the HR roster and Employee 360. i18n lint.
- **Risk and blast radius:** Many files; native Urdu reader.
- **Depends on:** Issue #18 merged (BankPages, ProofInbox, PaymentWorkspace); native Urdu reader.
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### X-07

**Rank 75 · P3 · Direction glyphs are not mirrored in Urdu**

- **Priority:** P3 (audit and recommended)
- **Area:** X: Cross-cutting patterns (audit §2)
- **Screen and route:** HR-010 roster, HR-005 attendance, SITE-002 checklist, FIN-003 invoice dates, visitor pages, Urdu approval titles, AUTH-006 "Change number"
- **Status:** open · **Size:** M
- **Files to change:** `hr/RosterPage.tsx` (:103, :107); `hr/AttendancePage.tsx` (:45, :47); `packages/ui/src/primitives/IconButton.tsx` (:32); `sites/SiteWorkspace.tsx` (:74, :129, :140); `billing/InvoiceWorkspace.tsx` (:62); `operations/VisitorPages.tsx` (:108, :350, :388); `ur-PK/governance.json` (:3-9); `customer-web/src/pages/auth/PortalSignInPage.tsx` (:122-134)
- **Implementation note:** Let `IconButton` mirror directional icons in RTL (or route them through `DirectionalIcon`); replace literal arrows with words or a mirrored icon.
- **Acceptance criteria:** In Urdu, previous/next and forward arrows point the reading direction everywhere listed.
- **Tests to add:** Browser: UR captures of the roster, invoice and visitor pages. Component: `IconButton` mirrors when asked.
- **Risk and blast radius:** Shared primitive.
- **Depends on:** SH-11 (B2) calendar chevrons.
- **Confidence and re-check:** verified in code and seen in evidence; files unchanged a0d4a70→474e4ae.

#### COL-07

**Rank 76 · P2 · Numbering patterns and the IBAN field are reordered in Urdu**

- **Priority:** P2 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** SITE-002 Site 360 billing controls `/backoffice/sites/site_alnoor?tab=billing-controls`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/collections/SettingsTabs.tsx` (:147 IBAN, :490-493 patterns)
- **Implementation note:** Give these inputs left-to-right direction and the `ltr-input` class.
- **Acceptance criteria:** In Urdu, `ANR-INV-…` patterns and IBANs display in their real order.
- **Tests to add:** Browser (`collections.spec.ts`): UR capture. EN/UR 320px@200%: tab.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** seen in evidence (`gate-c2/screenshots/m10-numbering-and-posting-policy-1440-ur.png`), verified in code; file unchanged a0d4a70→474e4ae.

#### COL-14

**Rank 77 · P3 · Bank import drawer: an Urdu sentence is forced left-to-right, and the file picker stays in English**

- **Priority:** P3 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** BANK-003 bank import drawer `/backoffice/bank/bank-transaction-feed`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/collections/BankPages.tsx` (:264, :272-276)
- **Implementation note:** Isolate only the IBAN, not the whole sentence; use React Aria `FileTrigger` with a translated button, as `ImportPage` does.
- **Acceptance criteria:** The Urdu sentence reads right-to-left with the IBAN isolated; the picker button is in Urdu.
- **Tests to add:** Browser: UR capture of the drawer. axe: drawer.
- **Risk and blast radius:** Low.
- **Depends on:** Issue #18 (bank pages may change).
- **Confidence and re-check:** seen in evidence (`gate-c2/screenshots/f19-bank-import-account-chosen-1440-ur.png`), verified in code; file unchanged a0d4a70→474e4ae.

#### FIN-14

**Rank 78 · P3 · Urdu approval titles break around English account names**

- **Priority:** P3 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** APR-001 `/backoffice/apr/my-approvals`; APR-002 Approval 360
- **Status:** open · **Size:** S
- **Files to change:** `ur-PK/governance.json` (:3-9); `apps/backoffice/src/pages/society/finance/ApprovalPages.tsx` (:68, :161)
- **Implementation note:** Isolate interpolated values (FSI…PDI or a bidi-isolating component), as `DataPrivacyPage.tsx:215` already does.
- **Acceptance criteria:** Urdu titles with English account names read in the right order.
- **Tests to add:** Browser: UR capture of My approvals at 390 px.
- **Risk and blast radius:** Low.
- **Depends on:** X-07 (the arrow case).
- **Confidence and re-check:** seen in evidence (`gate-s1/screenshots/g06-my-approvals-390-ur.png`); arrow case inferred; files unchanged a0d4a70→474e4ae.

#### RES-14

**Rank 79 · P3 · Masked phone numbers are not isolated inside Urdu sentences**

- **Priority:** P3 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** AUTH-006 code step `/shared/auth/customer-portal-login`; AUTH-007 invitation
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/auth/PortalSignInPage.tsx` (:42, :79); `apps/customer-web/src/pages/auth/InvitationPage.tsx` (:41, :173)
- **Implementation note:** Wrap the masked number in LTR isolation (as `packages/ui/src/forms/OneTimeCode.tsx:91` does), in the visible text and in the announcement.
- **Acceptance criteria:** In Urdu, "+92 300 *** 4567" reads in its real order inside the sentence.
- **Tests to add:** Browser (`identity.spec.ts`): UR capture of the code step.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; reordering inferred; files unchanged a0d4a70→474e4ae.

### B9 · Focus, names and announcements (9)

#### COL-09

**Rank 80 · P2 · Proof review loses keyboard focus after Verify and when moving to the next proof**

- **Priority:** P2 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** FIN-009 `/backoffice/fin/transfer-proof-review?record=…`
- **Status:** open · **Size:** M
- **Files to change:** `apps/backoffice/src/pages/society/collections/ProofReview.tsx` (:62, :102-111, :120-121, :186, :724-728); `packages/ui/src/a11y/useRouteFocus.ts` (:25)
- **Implementation note:** After Verify, focus the result banner's heading; when the submission changes (Next or Previous), focus and announce the H1. Route focus runs only on path changes today, so handle the record change in the page (or let the hook watch chosen parameters).
- **Acceptance criteria:** After Verify, focus is on the result; after Next, focus is on the new proof's heading and it is announced; focus never drops to the page body.
- **Tests to add:** Browser (`collections.spec.ts`): keyboard-only verify then Next → focused element is the banner, then the H1. axe: page.
- **Risk and blast radius:** The officer's main queue.
- **Depends on:** Issue #18 merged (ProofReview).
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### COL-08

**Rank 81 · P2 · Payment-method switches are named only "Allowed" / "Not allowed"**

- **Priority:** P2 (audit and recommended)
- **Area:** COL: Society setup, billing, collections (C.1/C.2) (audit §4)
- **Screen and route:** BILL-012 `/backoffice/sites/:id?tab=payment-methods`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/collections/SettingsTabs.tsx` (:287)
- **Implementation note:** Name each switch after its method ("Accept office cash") and let the switch role carry on/off.
- **Acceptance criteria:** A screen reader hears "Accept office cash, switch, on", and the name does not change when toggled.
- **Tests to add:** Browser (`collections.spec.ts`): accessible names. axe: tab.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### FIN-10

**Rank 82 · P2 · Bulk-collection "Cash" and "Cheque" buttons do not name the flat or payer**

- **Priority:** P2 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** FIN-013 batch drawer → Add flats `/backoffice/fin/office-collections`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/finance/OfficeCollectionsPage.tsx` (:438-443)
- **Implementation note:** Give each button an accessible name with the payer and flat (for example "Cash for Kamran Siddiqui, A-101"), as MANUAL_VERIFICATION F5 expects.
- **Acceptance criteria:** Each button's name includes the payer and the flat.
- **Tests to add:** Browser (`s1.spec.ts`): accessible names. axe: drawer.
- **Risk and blast radius:** Low.
- **Depends on:** Issue #18 merged (OfficeCollectionsPage).
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### FIN-11

**Rank 83 · P2 · Ownership progress steps show done or not done only visually**

- **Priority:** P2 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** OWN-004 `/backoffice/own/transfer-review-approval?record=…`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/finance/OwnershipPages.tsx` (:217-223)
- **Implementation note:** Add visually hidden "done" / "not yet" text to each step and mark the current step.
- **Acceptance criteria:** A screen reader hears each step's state.
- **Tests to add:** Browser (`s1.spec.ts`): accessible text. axe: page.
- **Risk and blast radius:** Low.
- **Depends on:** FIN-06 (B6) changes the steps' data.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### RES-09

**Rank 84 · P2 · Welcome wizard: focus is lost and step changes are not announced**

- **Priority:** P2 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-030 `/customer/portal/welcome`
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/auth/WelcomePage.tsx` (:24-37, :108-117)
- **Implementation note:** On every step change, focus the step's heading (made focusable) and announce "Step N of M".
- **Acceptance criteria:** After each step change, focus is on the new heading and the step is announced; focus never drops to the page body.
- **Tests to add:** Browser (`onboarding.spec.ts` or `identity.spec.ts`): keyboard through the wizard, check the focused element. axe: each step.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

#### RES-16

**Rank 85 · P3 · Custom radio groups have no arrow-key navigation and are labelled twice**

- **Priority:** P3 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-018 new repair (category) and rating (stars); amenity booking slots
- **Status:** open · **Size:** M
- **Files to change:** `apps/customer-web/src/pages/operations/RepairsPage.tsx` (:203-211, :283-289); `ResidentServices.tsx` (:337-347)
- **Implementation note:** Use the shared React Aria radio group or choice cards; one label per group.
- **Acceptance criteria:** Arrow keys move between options; one Tab stop per group; the group name is read once.
- **Tests to add:** Browser (`forms-keyboard.spec.ts`): arrow keys. axe: groups.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### RES-17

**Rank 86 · P3 · The repair card is a `<button>` wrapping an `<ol>` (invalid content, very long name)**

- **Priority:** P3 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-018 repairs list
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/operations/RepairsPage.tsx` (:99-117); `packages/ui/src/data/Stepper.tsx` (:30)
- **Implementation note:** Use the title-link pattern from `HomeAttention.tsx:40-56` (the title is the link, its hit area covers the card).
- **Acceptance criteria:** The card's accessible name is the repair title and state, not every step; the markup is valid.
- **Tests to add:** Browser: accessible name. axe: list.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### OPS-05

**Rank 87 · P3 · The gate's "Updated" time sits in a live region and is re-announced every 15 seconds**

- **Priority:** P3 (audit and recommended)
- **Area:** OPS: Operations and community (D.2/D.3) (audit §6)
- **Screen and route:** VIS-007 `/backoffice/vis/gate-check-in?tab=queue`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/operations/VisitorPages.tsx` (:147-150)
- **Implementation note:** Keep the timestamp out of the live region; announce only queue changes.
- **Acceptance criteria:** A screen reader does not hear the time on every refresh, but hears a new arrival.
- **Tests to add:** Browser (`d2.spec.ts`): the live region contains no timestamp.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** inferred (depends on the screen reader); file unchanged a0d4a70→474e4ae.

#### FIN-18

**Rank 88 · P3 · Why an export dataset was excluded is told only to screen readers**

- **Priority:** P3 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** ADM-024 `/backoffice/adm/data`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/adm/data/DataPrivacyPage.tsx` (:103-105)
- **Implementation note:** Show the reason visibly next to the struck-through dataset.
- **Acceptance criteria:** Sighted users see why a dataset was excluded.
- **Tests to add:** Browser (`identity.spec.ts`). EN/UR 320px@200%: list.
- **Risk and blast radius:** Low.
- **Depends on:** FIN-13 (B5) same area.
- **Confidence and re-check:** verified in code; file unchanged a0d4a70→474e4ae.

### B10 · Phone layout and themes (7)

#### FIN-12

**Rank 89 · P2 · Finance dashboard account rows collapse to a one-word column on phones**

- **Priority:** P2 (audit and recommended)
- **Area:** FIN: Society finance, governance, admin (S.1/D.1 office) (audit §5)
- **Screen and route:** FIN-001 `/backoffice/fin/finance-dashboard`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/finance/FinanceDashboard.tsx` (:143-161)
- **Implementation note:** Give the text block a real flex basis (the D.1 pattern of at most 100 % or 14rem) so the badge wraps below instead of squeezing the text.
- **Acceptance criteria:** At 390 and 320 px, EN and UR, the IBAN and description wrap at word boundaries, never two or three characters per line.
- **Tests to add:** EN/UR 320px@200% and 390 px: `layoutProblems` on the dashboard. Browser (`reflow.spec.ts`).
- **Risk and blast radius:** Low.
- **Depends on:** Issue #18 (it may hide the unreconciled badge for cashbook-only roles).
- **Confidence and re-check:** seen in evidence (`gate-s1/screenshots/m01-dashboard-390-en.png`, `f01-finance-dashboard-390-ur.png`); file unchanged a0d4a70→474e4ae.

#### RES-10

**Rank 90 · P2 · The organisation name in the phone header breaks mid-word**

- **Priority:** P2 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** Every resident page on a phone
- **Status:** open · **Size:** S
- **Files to change:** `packages/ui/src/shell/CustomerShell.tsx` (:295-299); `apps/customer-web/src/pages/household/HouseholdPages.tsx` (:71)
- **Implementation note:** Break at word boundaries with a two-line clamp and the full name available (title or accessible name), or use the icon-only language toggle at this width. Amounts should never break inside the number.
- **Acceptance criteria:** At 390 and 320 px, Urdu, 100 % and 200 % text, the name never breaks inside a word; amounts never split.
- **Tests to add:** EN/UR 320px@200% and 390 px: `layoutProblems` on Home and My properties (`customer-shell.spec.ts`).
- **Risk and blast radius:** Shared resident shell.
- **Depends on:** RES-21 (same shell).
- **Confidence and re-check:** seen in evidence (lead re-check: `gate-d2/screenshots/r01-resident-repairs-390-ur.png`, `gate-d3/screenshots/a08-chat-whole-community-390-ur.png`); file unchanged a0d4a70→474e4ae.

#### RES-11

**Rank 91 · P2 · The visitor pass code will likely overflow its card at large text sizes**

- **Priority:** P2 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** PORTAL-020 pass sheet
- **Status:** open · **Size:** S
- **Files to change:** `apps/customer-web/src/pages/operations/ServicesHub.tsx` (:300-302)
- **Implementation note:** Confirm with a 390 px / 200 % capture first (inferred). Then size the code to its container (container units) or let the digits wrap in groups of three.
- **Acceptance criteria:** At 390 px and 200 % text, the code fits its card and stays readable.
- **Tests to add:** EN/UR 320px@200% and 390 px: pass sheet `layoutProblems` (not in today's captures).
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** inferred (`gate-d2/screenshots/v03-pass-with-code-390-ur.png` plus token arithmetic); file unchanged a0d4a70→474e4ae.

#### RES-21

**Rank 92 · P3 · Bottom-bar labels shrink to about 9 px on a 320 px phone**

- **Priority:** P3 (audit and recommended)
- **Area:** RES: Resident app (audit §8)
- **Screen and route:** Resident bottom bar on every page at 320 px
- **Status:** needs an owner decision · **Size:** M · **Owner decision:** OD-6
- **Files to change:** `packages/ui/src/shell/CustomerShell.tsx` (:168)
- **Implementation note:** The container-unit cap goes below the 11 px base at any text size, beyond the documented 112 % chrome cap (C.2 §7). Fixing it means changing an owner-approved design rule: two-line labels, fewer items with a "More" sheet, or icon-only items with the label kept as the accessible name. OD-6.
- **Acceptance criteria:** Per OD-6; in every option, no visible label is below the 11 px base at 320 px.
- **Tests to add:** EN/UR 320px@200%: bottom bar `layoutProblems` and a computed font-size check (`customer-shell.spec.ts`).
- **Risk and blast radius:** Shared resident shell; design rule.
- **Depends on:** OD-6.
- **Confidence and re-check:** seen in evidence (`gate-d2/screenshots/c01-home-320x700-200pct-ur.png`, `gate-d3/screenshots/c05-chat-conversation-320x700-200pct-ur.png`); file unchanged a0d4a70→474e4ae.

#### SH-08

**Rank 93 · P3 · Dark theme: selected text is unreadable (about 1.1:1), and the modal scrim has no dark value**

- **Priority:** P3 (audit and recommended)
- **Area:** SH: Shared UI and shell (audit §3)
- **Screen and route:** All apps in dark and dark high-contrast themes
- **Status:** open · **Size:** S
- **Files to change:** `packages/tokens/src/theme.css` (:23, :742-745)
- **Implementation note:** Add dark and high-contrast values for the selection colours and the overlay.
- **Acceptance criteria:** Selected text meets 4.5:1 in dark and dark high contrast; the scrim is visible in dark.
- **Tests to add:** Browser (`a11y.spec.ts`): computed colours in dark themes. Token contrast unit check.
- **Risk and blast radius:** Shared tokens.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; contrast computed from tokens; file unchanged a0d4a70→474e4ae.

#### SH-09

**Rank 94 · P3 · The tour spotlight ignores the D.1 "High contrast" value**

- **Priority:** P3 (audit and recommended)
- **Area:** SH: Shared UI and shell (audit §3)
- **Screen and route:** Any guided tour with D.1 contrast set to high
- **Status:** open · **Size:** S
- **Files to change:** `packages/ui/src/onboarding/TourLayer.tsx` (:34); `packages/ui/src/onboarding/TourOverlay.tsx` (:33)
- **Implementation note:** Accept both stored values ("high" from D.1 and "more" from the media query).
- **Acceptance criteria:** With D.1 high contrast, the spotlight's extra outline is drawn.
- **Tests to add:** Browser (`onboarding.spec.ts`): high contrast → outline present.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** verified in code; files unchanged a0d4a70→474e4ae.

#### HR-04

**Rank 95 · P3 · Roster grid times use a different format from the rest of HR**

- **Priority:** P3 (audit and recommended)
- **Area:** HR: Society HR (S.2a) (audit §7)
- **Screen and route:** HR-010 `/backoffice/hr/roster`
- **Status:** open · **Size:** S
- **Files to change:** `apps/backoffice/src/pages/society/hr/RosterPage.tsx` (:167-170, :513-516)
- **Implementation note:** Use the shared shift-time component the phone cards and drawers use.
- **Acceptance criteria:** The grid shows "7:00 AM – 3:00 PM" style times, consistent with the rest of HR, in both languages.
- **Tests to add:** Browser (`s2a.spec.ts`): grid text. EN/UR 320px@200%: roster.
- **Risk and blast radius:** Low.
- **Depends on:** None.
- **Confidence and re-check:** seen in evidence (`gate-s2a/screenshots/a07-roster-week-1440-en.png`); file unchanged a0d4a70→474e4ae.

## 9. The CSV

`UX_BACKLOG.csv` has one row per finding (97 rows plus a header), in rank order with the Issue #18 rows first. It is UTF-8 without a byte-order mark and LF line endings, as the repository's other CSVs are. Its columns are:

- **Order and grouping:** `rank`, `id`, `batch`, `batch_name`.
- **Priority:** `audit_severity`, `recommended_priority`, `priority_change_reason`.
- **What and where:** `area`, `title`, `screen_and_route`, `files_to_change`.
- **The work:** `implementation_note`, `acceptance_criteria`, `tests_to_add`, `risk_and_blast_radius`, `size`.
- **Tracking:** `status`, `owner_decision`, `depends_on`, `confidence_and_recheck`, `provenance`.

`provenance` cites the audit file, commit `1a0779e`, the audit section and the finding id.
