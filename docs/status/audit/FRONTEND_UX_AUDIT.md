# PropertyOS frontend UX and accessibility audit

**Target:** commit `a0d4a70` (all accepted gates B to S.2a, plus S.2b payroll), branch `docs/frontend-ux-audit`.
**Date:** 2026-11-06.
**Kind of audit:** read-only. No application code was changed, and nothing here is a redesign.
**Excluded:** the payroll screens (`apps/backoffice/src/pages/society/payroll/*`, PAY-001…007). Agent 1 audits them separately.

## How this audit was done

- **Static review** of every page under these folders:
  - `apps/backoffice/src/pages/**` (except payroll)
  - `apps/customer-web/src/**`
  - `apps/platform-hq/src/**`
  - `packages/ui/src/**`
  - the route tables, the navigation model (`packages/ui/src/workspace/tenantWorkspace.ts`, `apps/backoffice/src/nav.config.ts`) and the en-PK and ur-PK dictionaries
  - where a finding depended on what the screen receives, the mock API handlers (`packages/fixtures`) and the role templates (`packages/fixtures/src/role-templates.ts`).
- **Evidence screenshots** under `docs/status/*/screenshots/` were used as visual input.
- **Known limitations.** Each gate's report and `MANUAL_VERIFICATION.md` were read first, so documented limitations are not reported as new defects. They are listed in §11.
- **No live run.** The shared machine was running a long Playwright regression, so no app was built or run. Every finding comes from code and committed evidence.
- **Cross-cutting checks** were run across the whole tree:
  - hard-coded colours
  - attribute literals that the i18n lint does not catch
  - fixed widths and `nowrap`
  - formatting with a fixed locale
  - list punctuation
  - internal gate codes in user-facing copy
  - hard-coded `/backoffice/...` paths checked against the route table and the screen register.

### Severity

| Level | Meaning |
|---|---|
| **P0** | Security or data exposure: someone sees data a documented rule says they must not. |
| **P1** | Functional or accessibility blocker, or a money statement that is wrong in a way a user will act on. |
| **P2** | Significant: a broken flow for some roles or states, misleading wording, or an accessibility failure with a workaround. |
| **P3** | Minor polish, consistency or robustness. |

### Confidence

| Label | Meaning |
|---|---|
| **verified in code** | The defect follows directly from the cited lines. |
| **seen in evidence** | Visible in a committed screenshot (the file is named). |
| **inferred** | Follows from code plus platform behaviour (bidi rules, React, browser defaults) that was not observed. The reason is given. |
| **(lead re-check)** | The audit lead independently re-read the cited code or evidence after the area review. 27 findings carry this mark, including every P0 and P1 apart from the CRM budget card and StatTile parts of SH-02. |

Line numbers refer to `a0d4a70`. Routes are under `/backoffice` (office), `/customer` (resident app) or `/hq` (Platform HQ).

## 1. Summary

### Counts by area and severity

| Area | P0 | P1 | P2 | P3 | Total |
|---|---:|---:|---:|---:|---:|
| X: Cross-cutting patterns | 0 | 0 | 4 | 5 | 9 |
| SH: Shared UI and shell | 0 | 2 | 5 | 5 | 12 |
| COL: Society setup, billing, collections (C.1/C.2) | 0 | 2 | 11 | 5 | 18 |
| FIN: Society finance, governance, admin (S.1/D.1 office) | 1 | 3 | 9 | 7 | 20 |
| OPS: Operations and community (D.2/D.3) | 0 | 1 | 1 | 4 | 6 |
| HR: Society HR (S.2a) | 0 | 0 | 2 | 3 | 5 |
| RES: Resident app | 0 | 1 | 11 | 9 | 21 |
| HQ: Platform HQ and developer pages | 0 | 0 | 4 | 2 | 6 |
| **Total** | **1** | **9** | **47** | **40** | **97** |

### Most important findings

| ID | Sev | Screen | One line |
|---|---|---|---|
| FIN-01 | P0 | BANK-002, FIN-009 | The building manager sees bank statement lines (other residents' transfers, transaction IDs, IBANs) in two places, although S.1 says he gets no bank feed (`bank.view`). |
| FIN-02 | P1 | BANK-009, BANK-006, FIN-013 | Each request key is minted once per page visit. A second voucher, transfer or office collection silently returns the first one, with a success toast. |
| RES-01 | P1 | PORTAL-010, PORTAL-001 | After a reversal, the resident's receipt still says "Paid" / "ادا شدہ", with "Amount received". |
| COL-02 | P1 | FIN-005, COL-001 | Reversed payments are listed and totalled in the office payments list as ordinary payments received. |
| COL-01 | P1 | BILL-014 | The credit-note "Open" amount ignores money already paid, so a credit can exceed what is unpaid. |
| FIN-03 | P1 | BANK-009 | A voucher saved as a draft cannot be found again from any screen. |
| FIN-04 | P1 | APR-004 | The approval-policy draft resets its effective date, and "Send for approval" drops unsaved rule edits. |
| OPS-01 | P1 | MNT-003 | Request 360 drawers show refusals behind the modal, so the drawer just stays open with no reason given. |
| SH-01 | P1 | GLOBAL-001 | On a phone the full-screen command palette has no visible way to close it. |
| SH-02 | P1 | HQ-001, CRM Lead 360 | `MetricCard` hides its value from screen readers whenever the card is not a link. |
| RES-07 | P2 | PORTAL-018/034/020 | Repair, issue and pass sheets keep the previous record's typed text, so a message can be sent to the wrong repair. |
| X-03 | P2 | many | Links and figures are shown to roles that cannot open the target, which then shows a "planned" page or a 403. This is the most widespread pattern. |

## 2. Cross-cutting patterns (X)

These are defects that repeat across many screens. Each instance list gives file:line. Fixing the shared cause fixes most of them.

### X-01 · P2 · Failed actions are silently swallowed
- **Screens:** many in all three apps.
- **Root cause:**
  - The global `MutationCache.onError` only handles sign-in errors (`packages/ui/src/data/TransportProvider.tsx:66-67`).
  - The shared `Form` awaits `onSubmit` with no catch and never maps `ApiProblem.errors` onto fields (`packages/ui/src/forms/Form.tsx:123-130`).
  - Any `await mutateAsync()` without its own try/catch therefore fails with no toast, alert or announcement. The spinner just stops.
- **Instances (verified in code):**
  - **Office:**
    - `VisitorPages.tsx:211-215` (gate check-out)
    - `IssuesBoard.tsx:40-44` (Refresh)
    - `collections/BankPages.tsx:154-157` (bank-line Restore)
    - `society/portal/PortalPeople.tsx:34-39` (Cancel invitation)
    - `more/MorePage.tsx:139-142` (Reset demo data)
  - **Shared:**
    - `packages/ui/src/crm/NewLeadDrawer.tsx:88`, `ScheduleVisitDrawer.tsx:75`
    - `packages/ui/src/identity/Profile.tsx:152-157`: only phone and email field codes are handled; offline or 5xx errors show nothing.
    - `packages/ui/src/community/Chat.tsx:649-654` (block), `:898-901` (unblock), `:924-930` (leave).
  - **Resident:**
    - `IssuesPage.tsx:81-85`, `:223-226`
    - `ResidentServices.tsx:78-82`, `:269`
    - `HouseholdPages.tsx:310`, `:364`
    - `CommunityHomePage.tsx:535` (`.catch(() => undefined)`)
  - **HQ:** `apps/platform-hq/src/pages/create/CreateTenantPage.tsx:186-198` (see HQ-03).
- **Expected vs actual:**
  - Expected: a failure says "not saved" with the reason.
  - Actual: nothing visible or announced, plus an unhandled promise rejection.
- **Fix:**
  - Add a default error toast in the mutation cache (unless a call opts out).
  - Give `Form` an error path: catch, map field codes to fields and the summary, toast the rest.
- **Confidence:** verified in code.

### X-02 · P2 · Submit buttons are disabled by minimum lengths nobody states
- **Screens:** most S.1 drawers; resident new repair, raise issue and add vehicle; D.2 completion.
- **Instances:**
  - `finance/CashbookPage.tsx:757` (≥10)
  - `TransfersPage.tsx:151` (purpose ≥5), `:333`, `:383`
  - `OfficeCollectionsPage.tsx:607`, `:651`, `:659`
  - `ApprovalPages.tsx:290` (reject ≥10, approve ≥3), `:561`
  - `OwnershipPages.tsx:134`, `:298`, `:322`
  - `CommitteePage.tsx:239`, `:297`, `:335`
  - `RemindersPage.tsx:233-236`
  - resident `RepairsPage.tsx:165`, `:183`, `:304`; `IssuesPage.tsx:154`; `ResidentServices.tsx:121`
  - The rules include title ≥5, description ≥10, photo description ≥3, plate ≥4 and colour ≥3.
  - The hints say things like "For example 'Kitchen sink leaking'" (`en-PK/operations.json:609-611`). The issue title has no hint at all (`IssuesPage.tsx:188`).
- **Expected vs actual:**
  - Expected: the rule is visible, or the button stays enabled and the problem is shown at the field (WCAG 3.3.2).
  - Actual: typing "Leak" leaves "Send to the office" dead, with no reason given to sighted or screen-reader users.
- **Fix:** use the D.1 export-form pattern (`adm/data/ExportDrawers.tsx:49-56`): keep the button enabled and validate on submit with `errorKey`, or state each minimum in the field description.
- **Confidence:** verified in code.

### X-03 · P2 · Links and figures shown to people who cannot open the target
- **Mechanism:** a contextual link is rendered with no check against its target's access rule (`AccessTarget` in `apps/backoffice/src/prototype/routes.tsx:135-141`, `:220-239`). A viewer who fails it lands on the register's "planned" page (see SH-05), a 403 error state, or a drawer that never mounts.
- **Instances (verified in code):**

| Where | Link | Who is stranded |
|---|---|---|
| `packages/fixtures/src/society/finance/overview.ts:72`, `:79-80`, `:123-124`, `:128`, `:133`, rendered at `finance/FinanceDashboard.tsx:83`, `:120-126` | "Office cash waiting for a count" and "Cheques waiting to clear" lead to `/fin/office-collections` (needs `payment.receive` or `payment.batch.confirm`). "Bank lines not reconciled" and "Settled in the bank" lead to bank pages (need `bank.view`). "Take the payment at the office" opens `?drawer=office` (mounts only with `payment.receive`, `collections/PaymentsPage.tsx:124`). | Building manager (Imran) |
| `finance/CashbookPage.tsx:175`, `:222`, `:723`; `AccountsPages.tsx:248`; `OwnershipPages.tsx:285` | Pending items, the reconciliation link, close-check links | Building manager |
| `collections/PaymentWorkspace.tsx:268` (reconciliation), `:119`, `:123` (hard-coded `/backoffice/fin/office-collections?...`) | Payment 360 source and reconciliation links | Building manager (reaches Payment 360 from the dashboard's "Latest payments") |
| `operations/RequestWorkspace.tsx:235` | Flat 360 and Person 360 from MNT-003 (Flat 360 API and `SocietyOrPlanned` need `site.view`) | Maintenance (Naveed), technician; seen in `gate-d2/screenshots/r05-request-360-new-1440-en.png` |
| `operations/VisitorPages.tsx:480`, `operations/VehiclesOffice.tsx:188` (hard-coded `/backoffice/sites/${…}/units/${…}?tab=services`) | Flat from pass detail and vehicle drawer | Guard |
| `operations/MaintenancePages.tsx:78` | "Community issues" figure goes to MNT-012 (needs `issues.view` plus the feature). The tab for the same screen is gated at `:23`. | Technician (Waqas) |
| `hr/Employee360Page.tsx:106-111`; `HrDashboardPage.tsx:49-51`, `:94`; `LeaveAdjustmentsPage.tsx:98`, `:178` | Roster and attendance (need `hr.shifts` plus `hr.view`, `attendance.record` or `shifts.manage`). `d.canSee.roster` exists but is unused. | HR without the `hr.shifts` feature, or custom roles (no demo persona today) |
| `sites/ImportPage.tsx:42`, `:74-81`; `OpeningBalancesPage.tsx:34-37`; `fixtures/src/society/dashboard.ts:83` | "Use the sample" and "Import flats" offered with no `site.manage` check (`StructurePage.tsx:69` does gate it) | Treasurer, accounts officer: the press returns a 403 alert |

- **Expected vs actual:** a link appears only when the viewer can open the target; otherwise the figure is plain text. Today the S.1 manager persona, maintenance staff and the guard all hit dead ends from normal screens.
- **Fix:**
  - Have the server omit `href` when the viewer cannot open the target, as C.2's `collections-read.ts` already does with `opts.bank`.
  - On the client, gate each link with `allows(target)`, as `ResidentsOffice.tsx:31` does.
  - Replace hard-coded paths with `SOCIETY.flat` / `FINANCE.*` helpers.
- **Confidence:** verified in code (lead re-check of the role template: `packages/fixtures/src/role-templates.ts:55-69`, where the manager has `cashbook.view` and `collections.view` but no `bank.view`, `payment.receive` or `finance.evidence.review`).

### X-04 · P3 · Failed queries leave a skeleton forever or a silently empty list
- **Instances** (`isError` is never read):
  - `sites/NewRunPage.tsx:35-36`, `ExemptionsPage.tsx:22-23`, `RulesPage.tsx:31-32` (secondary queries)
  - `finance/CashbookPage.tsx:692`, `ApprovalPages.tsx:571`, `fkit.tsx:146`, `OfficeCollectionsPage.tsx:418`, `RemindersPage.tsx:312`, `AccountsPages.tsx:167`, `TransfersPage.tsx:531`
  - `adm/data/ExportDrawers.tsx:92`
  - `operations/MaintenancePages.tsx:388-414` (MNT-008), `NoticesOffice.tsx:508-509`, `VisitorPages.tsx:550-554`, `NewRequestPage.tsx:25`, `:73` (`retry:false`, so the area select is empty)
  - `packages/ui/src/command/CommandPalette.tsx:128`, `:170-172`: a failed search reads "No results".
  - resident `auth/InvitationPage.tsx:67`: any load error shows the "invitation not found" state.
- **Fix:** render `ErrorState` with Retry on `isError` (the pattern is used correctly in `sites/ImportPage.tsx:43`).
- **Confidence:** verified in code. Reachability needs a transient failure; COL-11 is the one reproducible case.

### X-05 · P3 · Search is not kept in the URL, and empty states ignore an active search or filter
- **Search held in component state while sibling filters are in the URL:**
  - `MaintenancePages.tsx:208`, `:242`
  - `VisitorPages.tsx:421`, `:429`, `:530`, `:537`
  - `VehiclesOffice.tsx:27`, `:40`
  - `ServicesDirectoryPage.tsx:36`, `:67`
  - `ApprovalPages.tsx:56-57`
  - `billing/RunWorkspace.tsx:417`
  - `hr/EmployeesPage.tsx:23-25`, `:53` reads `?q=` but never writes it back.
- **Empty state ignores the active filter:**
  - `collections/ProofInbox.tsx:65` ("Nothing to review — proofs appear here as residents send them")
  - `PaymentsPage.tsx:92` ("No payments yet")
  - `ApprovalPages.tsx:108-110` ("Nothing waits for your decision")
  - `TransfersPage.tsx:84-85`
  - `OfficeCollectionsPage.tsx:128-129`
  - `people/OccupancyRoster.tsx:34-66` has no "no results" message at all.
- **No visible clear button:** every `SearchField` hides its cancel button (e.g. `billing/AccountsPage.tsx:42`).
- **Lost filter on return:** the FIN-009 breadcrumb and the redirect after a decision return to the inbox's default filter (`ProofReview.tsx:86`, `:449`).
- **Fix:** keep a debounced `q` in the URL. When a filter or search is active, say "Nothing matches '…'" with a Clear action. Return to the inbox with its previous `state`.
- **Confidence:** verified in code.

### X-06 · P3 · Sentences assembled in code, and Latin punctuation inside Urdu
- **Concatenated sentences:**
  - `collections/ProofInbox.tsx:107`, `PaymentWorkspace.tsx:241`, `society/kit.tsx:202` (label then date)
  - `BankPages.tsx:282-288` (`nowMatchable` called with `refs: ''` and links appended)
  - `finance/RemindersPage.tsx:340` (`` `${channel}: ${outcome}` ``)
  - `fkit.tsx:159`, `ApprovalPages.tsx:261`, `CommitteePage.tsx:121`
  - `hr/Employee360Page.tsx:174`, `RosterPage.tsx:126-130`, `LeaveAdjustmentsPage.tsx:87`
  - `community/ChatSettingsPage.tsx:400`
- **Latin "?" appended to a translated title:**
  - `packages/ui/src/identity/Sessions.tsx:181`: `` `${t('identity:sessions.signOutOthers')}?` ``
  - `adm/data/DataPrivacyPage.tsx:166`
  - Urdu uses "؟".
- **Lists joined with `", "` in display text:** 107 `.join(', ' | ' · ')` calls and no `Intl.ListFormat` anywhere. Urdu uses "، ". Examples where the items are Urdu words:
  - `customer-web/src/pages/community/CommunityHomePage.tsx:217` (translated role names)
  - `hr/Employee360Page.tsx:128`, `:131`, `:303`, `:330`
  - `hr/LeaveAdjustmentsPage.tsx:97`: an Urdu sentence ending in a Latin ".".
  - Flat-code lists inside `<bdi dir="ltr">` are fine.
- **Missing plural:** `collections.json:109` `arrearsContext` has no `_one` form, giving "1 accounts late".
- **Fix:** move the order and punctuation into the strings (`{{date}}` and `<0>` components), use `Intl.ListFormat(locale)`, and add plural keys.
- **Confidence:** verified in code. The S.2a roster date shows in `gate-s2a/screenshots/a07-roster-week-1440-en.png`.

### X-07 · P3 · Direction glyphs are not mirrored in Urdu
- **Instances:**
  - `hr/RosterPage.tsx:103`, `:107` and `AttendancePage.tsx:45`, `:47`: previous/next chevrons in `IconButton`, which does not mirror (`packages/ui/src/primitives/IconButton.tsx:32`). Seen in `gate-s2a/screenshots/a07-roster-week-390-ur.png`.
  - `sites/SiteWorkspace.tsx:74`, `:129`, `:140`: raw `ChevronRight` for the next checklist step.
  - Literal arrows that point backwards in RTL: `billing/InvoiceWorkspace.tsx:62` (issued → due, seen in `gate-c2/screenshots/invoice-a101-november-no-edit-1440-ur.png`), and `operations/VisitorPages.tsx:108`, `:350`, `:388` (seen in `gate-d2/screenshots/v10-queue-approved-390-ur.png`).
  - `ur-PK/governance.json:3-9`: `{{from}} ← {{to}}` with two Latin names resolves left to right.
  - Resident `auth/PortalSignInPage.tsx:122-134`: `ArrowLeft` on a `Button` ("Change number").
- **Fix:** route every directional icon through `DirectionalIcon` (or add `rtl:-scale-x-100` support to `IconButton`), and replace literal arrows with words or a mirrored icon.
- **Confidence:** verified in code and seen in evidence.

### X-08 · P3 · Internal gate and stage codes appear in client-facing copy
- **Instances:**
  - `en-PK/billing.json:221` `"Arrives in {{gate}}"` renders "Arrives in D" (`society/kit.tsx:121`); see also COL-10.
  - `en-PK/common.json:205-206` "Coming in Stage 2" / "Available from Stage 2", shown in every client's header Quick create menu (`packages/ui/src/shell/QuickCreateMenu.tsx:123`, `:130`).
  - `en-PK/hr.json:606`, `:644` ("…needs S.2b", "Payroll (S.2b)…"), rendered at `hr/AdvancesPages.tsx:173`, `:330`.
  - `en-PK/onboarding.json:81` "…arrive with their screens in Stage 3" (`help/PracticeSandbox.tsx:40`).
  - `en-PK/finance.json:775` mentions "(D-46)" and "C.2's receipt".
  - The Urdu equivalents carry the same codes.
- **Fix:** replace gate codes with plain client language ("Planned", "Not available yet"), and keep the codes in docs.
- **Confidence:** verified in code (lead re-check).

### X-09 · P2 · `ConfirmDialog`: the reason is lost on refusal, and the dialog's text is not tied to it
- **Where:** `packages/ui/src/overlays/ConfirmDialog.tsx:33-35`, `:39-51`, `:73-83`; `overlays/Dialog.tsx:56`.
- **Evidence:**
  - It checks only that the reason is not empty.
  - Pages catch their own errors, so `onConfirm` always resolves. The dialog then closes and clears the reason even when the server refused it.
  - The reason error is a plain `<p>`, not `FieldError`, so it has no `aria-describedby`.
  - The effect text is a `<div>` with no id, so the `alertdialog` has no description.
  - `reason` and `showError` are not reset on Cancel.
- **Instances where the server needs more than "not empty":**
  - `operations/RequestWorkspace.tsx:123-125` (10 characters, `fixtures/src/operations/requests-handlers.ts:677`, `:695`, `:812`)
  - `NoticesOffice.tsx:431` (10)
  - `hr/AdvancesPages.tsx:205-223`, `LeaveAdjustmentsPage.tsx:121-139`, `:214-232`, `RosterPage.tsx:325-342` (5)
  - The community dialogs state the minimum but still lose the text: `ChatSettingsPage.tsx:422-441`, `ServicesDirectoryPage.tsx:232-267`, `PollsPages.tsx:337-356`, `ResourcesPage.tsx:98-116`.
- **Expected vs actual:**
  - Expected: a refused reason keeps the dialog open with the error at the field, and the effect is read when the dialog opens.
  - Actual: typing "Not needed" and confirming closes the dialog; a toast or page alert then says it was too short, and the user starts again.
- **Fix:**
  - Let `onConfirm` throw to keep the dialog open.
  - Add a `minLength` prop with a hint and a client check.
  - Use `FieldError`.
  - Give the description an id.
  - Reset state when the dialog opens.
- **Confidence:** verified in code (lead re-check). That the effect goes unannounced with NVDA is inferred.

## 3. Shared UI and shell (SH)

### SH-01 · P1 · The command palette cannot be closed on a phone without choosing a result
- **Screen and route:** GLOBAL-001, Ctrl+K or header search; every page under 640 px.
- **Where:** `packages/ui/src/command/CommandPalette.tsx:147-165`.
- **Evidence:**
  - The modal is `h-dvh w-full`, so there is no overlay left to tap.
  - The only hint, `<kbd … hidden … sm:block>Esc</kbd>`, is hidden on phones.
  - There is no close button, and touch phones have no Escape key.
  - The open state lives in the shell, not the URL, so Back does not close it.
  - The essentials tour's search step sends phone users straight into it.
- **Expected vs actual:**
  - Expected: a visible Cancel or close button.
  - Actual: a sighted touch user can leave only by picking a result.
- **Fix:** add a visible Cancel button in the search row below `sm`, or keep a tappable strip of overlay.
- **Confidence:** verified in code (lead re-check). Seen in `docs/status/ui-stage-1/screenshots/palette-390-en.png` (older capture; the code is unchanged).

### SH-02 · P1 · `MetricCard` hides its value from screen readers unless the card is a link
- **Screens:** HQ-001 ARR card (`apps/platform-hq/src/pages/dashboard/HqDashboard.tsx:85-93`); CRM Lead 360 budget (`apps/backoffice/src/pages/crm/LeadWorkspace.tsx:206`).
- **Where:** `packages/ui/src/data/MetricCard.tsx:53`, `:70-75`.
- **Evidence:**
  - The value span gets `aria-hidden` whenever `accessibleValue` is set.
  - Only the link branch (`:82`) puts `accessibleValue` into an `aria-label`. The `<div>` branch renders it nowhere.
  - Related: `StatTile.tsx:59`, `:82` hides the `context` line and leaves it out of the accessible name.
- **Expected vs actual:**
  - Expected: the amount is read.
  - Actual: the label and caption are read with no figure.
- **Fix:** in the non-link branch, render `accessibleValue` as visually hidden text, and include `context` in StatTile's name.
- **Confidence:** verified in code (lead re-check of the `MetricCard` branch logic; the HQ, CRM and StatTile call sites were not re-checked).

### SH-03 · P2 · "Open help" and "Practice" from the palette or a finished tour drop the page's record
- **Where:** `packages/ui/src/command/CommandPalette.tsx:118`, `:123`; `packages/ui/src/onboarding/TourDialogs.tsx:90`. All call `navigate(\`${location.pathname}?help=open\`)` (or `?drawer=…`).
- **Expected vs actual:**
  - Expected: `help` or `drawer` is added while `record`, `tab` and filters stay.
  - Actual: on `/backoffice/crm/lead-360-workspace?record=…` the record is lost and the page underneath switches to its no-record state.
- **Fix:** use `useQueryParams` (`HelpMenu` already does).
- **Confidence:** verified in code.

### SH-04 · P2 · `SelectControl` accepts `errorKey` but never marks itself invalid, so the error never shows
- **Where:** `packages/ui/src/forms/ChoiceFields.tsx:190`, `:207`. Call sites: `apps/customer-web/src/pages/household/HouseholdPages.tsx:321`, `:324-330` (Flat, Relationship).
- **Evidence:**
  - `isInvalid={isInvalid}` is passed through unchanged.
  - The error renders through React Aria's `FieldError`, which shows nothing unless the field is invalid.
  - `PlainTextField` derives `isInvalid={!!errorKey}`; `SelectControl` does not.
- **Expected vs actual:**
  - Expected: "Choose one" under the field.
  - Actual: only the generic assertive "check the form" message.
- **Fix:** derive `isInvalid ?? !!errorKey`.
- **Confidence:** verified in code (lead re-check). Not rendered.

### SH-05 · P2 · A built screen says "Planned" when the person's role cannot open it
- **Where:** `apps/backoffice/src/prototype/routes.tsx:246-255` (and every `S1Screen`, `SocietyScreen` and `OpsScreen` fallback); `prototype/register.tsx:14-17`; `packages/ui/src/layout/PlannedScreenView.tsx:44-45`, `:68`.
- **Steps:** sign in as the Al-Noor technician and open `/backoffice/mnt/new-request`.
- **Expected vs actual:**
  - Expected: the "your role doesn't include this" outcome (`AccessOutcomeView` already has it).
  - Actual: a "Planned" badge and "planned for Gate D…", while the same page's fact list says "Status: Built".
  - "Planned" is only honest for another kind of organisation.
- **Fix:** when the register row is implemented and the miss is a permission, render `AccessOutcomeView reason="permission_missing"`.
- **Confidence:** verified in code.

### SH-06 · P2 · The design-system lab leaks into client flows
- **Where:**
  - `apps/backoffice/src/prototype/RouteError.tsx:17`: the "Go to start page" button is `<a href="/backoffice/lab">`.
  - `prototype/CommandPaletteRoute.tsx:11`: `/backoffice/global/command-palette` renders `<LabHome />`, although its comment says "over the start page".
- **Expected vs actual:** both should lead to `/backoffice/home/role-aware-dashboard`. Instead a client lands in the prototype lab, which the owner hid from client menus.
- **Fix:** use `LINKS.start` and render the start page under the palette.
- **Confidence:** verified in code (lead re-check).

### SH-07 · P2 · The Quick create page disables actions that work in the header menu
- **Screen and route:** GLOBAL-003, `/backoffice/global/quick-create`.
- **Where:** `apps/backoffice/src/pages/global/QuickCreatePage.tsx:6-12`, `:36-55`, compared with `packages/ui/src/shell/QuickCreateMenu.tsx:15-25`.
- **Evidence:**
  - `newLead` and `scheduleVisit` are listed under `PLANNED` and rendered `isDisabled` "Available from Stage 2"; the header menu opens working drawers for both.
  - "New service request" is missing.
  - For Al-Noor, "Receive payment – Available from Stage 2" is shown although the C.2 office payment drawer exists.
  - There is no empty state when nothing is permitted.
- **Fix:** build the page from the menu's `LIVE` and `PLANNED` lists and open the same drawers.
- **Confidence:** verified in code (lead re-check).

### SH-08 · P3 · Dark theme: selected text is unreadable, and the modal scrim has no dark value
- **Where:** `packages/tokens/src/theme.css:742-745`; `:23`.
- **Evidence:**
  - `::selection` is `background: #cfe2da; color: var(--color-text)`. In dark mode this is `#f1ece2` on `#cfe2da`, about 1.1:1, and the same in dark high contrast.
  - `--color-overlay` has no dark override.
- **Fix:** add dark and high-contrast selection and overlay tokens.
- **Confidence:** verified in code; contrast computed from token values.

### SH-09 · P3 · The tour spotlight ignores the D.1 "High contrast" value
- **Where:** `packages/ui/src/onboarding/TourLayer.tsx:34` checks only `contrast === 'more'`. D.1 stores `'high'`, so the extra white outline in `TourOverlay.tsx:33` is never drawn.
- **Fix:** accept both values.
- **Confidence:** verified in code.

### SH-10 · P3 · Keyboard focus on a workspace tab panel is invisible
- **Where:** `packages/ui/src/layout/Tabs.tsx:88`. `<TabPanel className="pt-5 outline-none">` overrides the global focus ring, and React Aria makes a panel with no focusable content focusable.
- **Fix:** add the `data-focus-visible:outline-*` classes that `PillTabs` uses.
- **Confidence:** verified in code.

### SH-11 · P3 · Calendar month buttons are named "Back" and "Next"
- **Where:** `packages/ui/src/forms/DateField.tsx:76`, `:80`; `apps/platform-hq/src/components/inputs.tsx:150`, `:154` (`aria-label={t('common:actions.back')}`).
- **Fix:** use "Previous month" / "Next month" keys.
- **Confidence:** verified in code.

### SH-12 · P3 · `CheckboxField` error and description are not tied to the checkbox
- **Where:** `packages/ui/src/forms/ChoiceFields.tsx:52-66`. Both are plain `<p>`, with no `aria-describedby` or `aria-invalid`. Only FormsLab uses it today; the risk is for future use.
- **Fix:** use `FieldError` and `Text slot="description"`.
- **Confidence:** verified in code.

## 4. Society setup, billing and collections, C.1/C.2 (COL)

### COL-01 · P1 · The credit-note "Open" amount ignores payments already received
- **Screen and route:** BILL-014, `/backoffice/fin/invoice-workspace?record=cin_…&drawer=credit-note`.
- **Where:** `apps/backoffice/src/pages/society/billing/InvoiceWorkspace.tsx:192`; `packages/fixtures/src/society/handlers.ts:1402-1404`.
- **Evidence:**
  - The drawer shows "Open {{amount}} of {{total}}" with `moneyMinus(l.amount, l.credited)`.
  - The server applies the same formula (`open = amount − credited`).
  - `InvoiceLine.allocated` ("settled by payments", `packages/contracts/src/billing.ts:215`) is ignored by both.
- **Steps:** open A-101's partly paid November invoice and issue a credit note.
- **Expected vs actual:**
  - Expected: Open = amount − credited − allocated.
  - Actual: money already paid is labelled "Open", and the server accepts a credit for it. Outstanding can then go negative while the badge says "Paid".
- **Fix:** subtract `allocated` in both places, and show "already paid" per line.
- **Confidence:** verified in code (lead re-check). The negative balance is inferred from the arithmetic.

### COL-02 · P1 · Reversed payments are listed and totalled as ordinary received payments
- **Screens:** FIN-005 `/backoffice/fin/payment-list`; COL-001 "Latest payments" and the payment count.
- **Where:**
  - `packages/fixtures/src/society/collections-read.ts:99-116`: `paymentRow` never sets `reversed`.
  - `collections-handlers.ts:580-589`: totals add every row.
  - `collections/PaymentsPage.tsx:95-117`
  - `CollectionsPanel.tsx:59`, `:286-306`
- **Evidence:**
  - `PaymentRow.reversed?: boolean` exists (`packages/contracts/src/collections.ts:426`), and so does the string `collections:payment.reversedBadge`, but neither the list nor the dashboard uses them.
  - The dashboard count uses `state.payments.length`.
  - Payment 360 does show a reversal alert (`PaymentWorkspace.tsx:129-130`). The resident history does too.
- **Expected vs actual:**
  - Expected: a bounced or reversed payment is badged "Reversed" and excluded from the received, allocated and credit totals and counts.
  - Actual: it looks like a verified, reconciled payment inside "N payments · Rs X · credit left Y".
- **Fix:** populate `reversed` in `paymentRow`, badge it, and exclude it from totals.
- **Confidence:** verified in code (lead re-check). Reaching a reversal needs the S.1 flow.

### COL-03 · P2 · Building cards on the collections dashboard lose their building filter
- **Screen:** COL-001 "By block" card, which opens BILL-001 `/backoffice/billing/accounts?building=…&status=owing`.
- **Where:** `apps/backoffice/src/pages/society/billing/AccountsPage.tsx:17-30` reads only `q`, `status` and `page`. The link is built at `fixtures/src/society/collections-read.ts:293`. The server supports `building` (`handlers.ts:1034-1039`).
- **Expected vs actual:**
  - Expected: that block's owing accounts, with a clearable chip.
  - Actual: all owing accounts.
- **Fix:** read `building`, pass it to the query, and show it as a chip.
- **Confidence:** verified in code (lead re-check). Seen in `gate-c2/screenshots/m04-building-opens-its-owing-accounts-1440-en.png` ("75 accounts" across both blocks).

### COL-04 · P2 · "Waiting for verification" includes proofs sent back to the resident, and its link opens a different list
- **Screens:** HOME-001 and COL-001 tile, progress bar and legend.
- **Where:** `fixtures/src/society/collections-read.ts:49`, `:242`, `:252-258`; `collections/CollectionsPanel.tsx:63-72`, `:109-114`; `ProofInbox.tsx:24`.
- **Evidence:**
  - `PENDING_STATES` includes `needs_information`.
  - "Still owed" is reduced by that share.
  - The link opens the inbox's "To review" filter, which covers submitted and under review only.
  - The resident side excludes `needs_information` (`dues-portal-handlers.ts:146`).
- **Expected vs actual:** a returned proof is not "waiting for the office" (financial wording), and the figure should open what it counts.
- **Fix:** exclude or label `needs_information` separately, and add an inbox filter for all pending states.
- **Confidence:** verified in code.

### COL-05 · P2 · The invoice workspace never shows the payments that settled it
- **Screen:** FIN-003.
- **Where:** `billing/InvoiceWorkspace.tsx:58-63`, `:73-135`. `InvoiceDetail.payments` (`contracts/src/billing.ts:299-300`) is returned but never rendered, and neither are `allocated` amounts.
- **Expected vs actual:** a paid invoice shows Outstanding 0 and "Paid", but no paid amount, payment, receipt or link to Payment 360. The contextual chain ends at the invoice.
- **Fix:** add a "Paid" metric and a Payments panel with links.
- **Confidence:** verified in code.

### COL-06 · P2 · "Change payer" can open a drawer with nobody to choose
- **Screens:** SITE-006 Flat 360 and RES-002 roster (`…/units/:id?tab=payer&drawer=change-payer`).
- **Where:** `sites/FlatWorkspace.tsx:174-178`, `:567`, `:598`, `:616-618`; `people/OccupancyRoster.tsx:55-59`.
- **Evidence:** the candidates are owners and occupants minus the current payer, which is empty for an owner-occupied, owner-paying flat (A-101). The action is still offered.
- **Actual:** an empty radio group and a disabled "Request" with no reason.
- **Fix:** hide the action, or explain that a tenant or co-owner must be recorded first.
- **Confidence:** verified in code. The affected flats are inferred from the C.2 data.

### COL-07 · P2 · Numbering patterns and the IBAN field are reordered in Urdu
- **Screen:** Site 360 → Billing controls (`/backoffice/sites/site_alnoor?tab=billing-controls`).
- **Where:** `collections/SettingsTabs.tsx:490-493` (patterns), `:147` (IBAN). None has `dir="ltr"`.
- **Evidence:** a pattern that produces `ANR-INV-…` displays as `INV-{yyyymm}-{seq:4}-{code}`.
- **Fix:** give these fields `dir="ltr"` and the `ltr-input` class.
- **Confidence:** seen in evidence (`gate-c2/screenshots/m10-numbering-and-posting-policy-1440-ur.png`), verified in code.

### COL-08 · P2 · Payment-method switches are named only "Allowed" / "Not allowed"
- **Screen:** BILL-012, Site 360 → Payment methods.
- **Where:** `collections/SettingsTabs.tsx:287`: `label={m.enabled ? t('sites:methods.allowed') : t('sites:methods.notAllowed')}`. The method name is a separate, unassociated span.
- **Actual:** a screen reader hears "Not allowed, switch, off" for every method, and the name changes when toggled.
- **Fix:** name the switch after the method ("Accept office cash") and let the switch role carry the state.
- **Confidence:** verified in code.

### COL-09 · P2 · Proof review loses keyboard focus after Verify and when moving to the next proof
- **Screen:** FIN-009.
- **Where:** `collections/ProofReview.tsx:62`, `:102-111`, `:120-121`, `:186`, `:724-728`; `packages/ui/src/a11y/useRouteFocus.ts:25`.
- **Evidence:**
  - Verify unmounts the `Decision` panel along with the focused button. The banner has `role="status"` but takes no focus.
  - Next and Previous change only `?record=`, and route focus runs only on a pathname change.
- **Expected vs actual:**
  - Expected: focus moves to the result banner, then to the new proof's heading.
  - Actual: focus drops to `<body>` in the officer's main queue.
- **Fix:** focus the banner heading after Verify, and focus and announce the H1 when `submissionId` changes.
- **Confidence:** verified in code.

### COL-10 · P2 · "Coming in later stages" lists features that are built
- **Screens:** HOME-001 "later" panel; the Site 360 checklist.
- **Where:** `packages/fixtures/src/society/dashboard.ts:186-192` (maintenance, visitors, notices and online payments as `gate: 'D'`); `handlers.ts:294`; `alnoor.ts:236`; rendered at `society/SocietyDashboard.tsx:500-516` with `kit.tsx:121` ("Arrives in {{gate}}", which becomes "Arrives in D").
- **Expected vs actual:** only unbuilt items should be listed. Today Maintenance, Visitors and Notices (all live since D.2, `routes.tsx:494-512`) are shown as not available, and Site 360 shows an "Online payments" tab beside "Online · Arrives in D".
- **Fix:** drop the shipped items and reword the badge (see X-08).
- **Confidence:** verified in code (lead re-check).

### COL-11 · P2 · The opening-balances import spins forever on a stale `?import=`
- **Screen and route:** SITE-007, `/backoffice/sites/:id/opening-balances?import=…`.
- **Where:** `sites/OpeningBalancesPage.tsx:149` (`!p ? <Loading/>`, with no `isError`), `:176`, `:183-184` (`f.text().then` with no catch). "Start again" exists only in the loaded branch.
- **Steps:** start an import, use Reset demo data (or a bookmark, or Back), then reopen the URL.
- **Expected vs actual:**
  - Expected: an error with "Start again".
  - Actual: a skeleton that never ends.
- **Fix:** handle `isError` as `ImportPage.tsx:43` does.
- **Confidence:** verified in code.

### COL-12 · P2 · The statement has duplicate row keys when a payment is reversed
- **Screens:** the statement in Flat 360, the account workspace, Person 360 and COL-004.
- **Where:** `society/parts.tsx:87`, `:110` (`key={e.refId}`); `packages/fixtures/src/society/statement.ts:115`, `:128`. The payment and its `payment_reversal` share `refId: p.id`.
- **Expected vs actual:**
  - Expected: unique keys.
  - Actual: React may drop or duplicate one of the two rows when the period switch re-renders, in a financial statement. It is a plain `<table>`, not a React Aria collection, so there is no crash.
- **Fix:** key by `${kind}-${refId}`.
- **Confidence:** key collision verified in code (lead re-check); the rendering effect is inferred.

### COL-13 · P2 · Server field errors are not shown at the field, and some don't say which line
- **Screens:** credit note (BILL-014), rules, exemptions, the change-payer drawer, allocation edit in FIN-009, the collection-account proposal.
- **Where:** `society/kit.tsx:127-151`, `:341-353`; `billing/InvoiceWorkspace.tsx:194`, `:202`; `collections/ProofReview.tsx:497`, `:505-513`; messages at `en-PK/billing.json:897-898`.
- **Evidence:**
  - `lines.<id>` and `allocations.<id>` errors are flattened into one list at the bottom of the form.
  - `AmountInput`'s `error` prop is never passed, and nothing gets `aria-invalid`.
  - "At most {{open}} on this line." does not name the line.
- **Fix:** map error keys to their inputs, or at least name the charge and flat in each message.
- **Confidence:** verified in code.

### COL-14 · P3 · Bank import drawer: an Urdu sentence is forced left-to-right, and the file picker stays in English
- **Where:** `collections/BankPages.tsx:264` (`<bdi dir="ltr">` around the whole translated sentence), `:272-276` (native `<input type="file">`).
- **Fix:** isolate only the IBAN, and use `FileTrigger` with a translated button as `ImportPage` does.
- **Confidence:** seen in evidence (`gate-c2/screenshots/f19-bank-import-account-chosen-1440-ur.png`), verified in code.

### COL-15 · P3 · Charge and payment wording are blurred
- **Where:**
  - `billing/RulesPage.tsx:240` with `billing.json:789`: en "{{flat}} pays", ur "{{flat}} کی ادائیگی" ("A-501's payment"), used for a charge total.
  - `collections/ckit.tsx:187` with `collections.json:62`: "Settles" (ur "ادا ہوگا", "will be paid") is used both for unverified previews and for issued receipts.
- **Fix:** use "Charges for A-501", and give "would settle" (preview) and "settled" (receipt) separate labels.
- **Confidence:** verified in code.

### COL-16 · P3 · Al-Noor-specific IDs and copy are hard-coded
- **Where:**
  - `people/PersonWorkspace.tsx:90` (`'site_alnoor'`)
  - `billing/RulesPage.tsx:37` (`'unt_anr_a501'`)
  - `collections/BankPages.tsx:240` (`'ben_anr_main'`, `'ben_anr_committee'`)
  - `billing.json:501`, `:506`
  - `sites.json:364`, `:462` ("ANR-A201")
  - resident `operations.json:715` ("invited to Al-Noor Residency"; the Urdu spelling also differs from `dues.json`)
- **Expected vs actual:** a second society would get broken Flat 360 links, a failing first load of "Which rule wins", and Al-Noor copy.
- **Fix:** take IDs from the data and make the copy generic.
- **Confidence:** verified in code.

### COL-17 · P3 · Opening-balances and import actions offered without `site.manage`
- **Where:** see the X-03 table, last row.
- **Fix:** show a read-only state that says who can import.
- **Confidence:** verified in code.

### COL-18 · P3 · Copy and state defects on the dashboard, roster and exemptions
- **Where:**
  - `society/SocietyDashboard.tsx:116` always says "Good morning" (`home/ManagementDashboard.tsx:85` picks the greeting by time).
  - `people/OccupancyRoster.tsx:23` uses `sites:list.emptyBody` without `{{organisation}}`, so the sentence is broken.
  - `OccupancyRoster.tsx:22`: Retry refetches only the roster even when `/sites` failed.
  - `billing/ExemptionsPage.tsx:18`, `:66`: the `?exemption=` deep link only changes a border colour (colour only; no scroll, focus or text).
- **Confidence:** verified in code.

## 5. Society finance, governance and admin, S.1/D.1 office (FIN)

### FIN-01 · P0 · The building manager sees bank statement lines, contrary to the documented `bank.view` boundary
- **Screens and routes:**
  - BANK-002 `/backoffice/bank/bank-account-360-workspace?record=ben_anr_main&tab=lines`
  - FIN-009 `/backoffice/fin/transfer-proof-review?record=psb_…` (read-only view)
- **Documented rule:**
  - `docs/status/gate-s1/GATE_S1_REPORT.md:106`: the cashbook, accounts and transfers need `cashbook.view` "so the building manager reaches them without gaining the bank feed (`bank.view`)".
  - `GATE_S1_REPORT.md:137` and C.2 §2.4: the manager "reads collections (proofs read-only, no bank feed)".
- **First door (Bank Account 360):**
  - The route target `BANKING` admits `anyOf: ['cashbook.view','bank.view']` (`apps/backoffice/src/prototype/routes.tsx:141`).
  - The handler returns all of the account's `lines` and `statements` with no `bank.view` check (`packages/fixtures/src/society/finance/handlers-books.ts:305`, `:328-330`).
  - The page adds "Statement lines" and "Reconciliation" tabs for every bank account (`finance/AccountsPages.tsx:84`, `:193-231`), showing counterparty, reference and bank transaction ID, including unmatched and unidentified lines.
- **Second door (proof review):**
  - `GET` on a submission is open to proof readers and always returns `candidates: candidatesOf(...)` (`packages/fixtures/src/society/collections-handlers.ts:134`).
  - The read-only branch renders them (`collections/ProofReview.tsx:189-191`), and so does `PaymentWorkspace.tsx:248-267`.
  - The manager sees the bank line's counterparty, transaction ID and receiving IBAN. In the B-405 case the candidates include other residents' unclaimed transfers.
- **Expected vs actual:**
  - Expected: someone without `bank.view` gets no statement lines in either place.
  - Actual: both views show them; the dashboard's "Bank lines not reconciled" also gives him their count and amount.
- **Fix:**
  - Return `lines`, `statements` and `candidates` only with `bank.view` (or `bank.reconcile`).
  - Hide the Lines and Reconciliation tabs otherwise, and show "Bank details are for finance".
  - Or record an explicit owner ruling that allows it. If `bank.view` is not meant to be a confidentiality boundary, downgrade this to P1.
- **Confidence:** verified in code (lead re-check of the handlers, role template and route target). Seen in evidence: `gate-c2/screenshots/m05-manager-reads-proof-cannot-decide-1440-en.png` (Imran, "IQ", sees "Find the money in the bank" with `DEMO-TXN-26102402` and the receiving IBAN).

### FIN-02 · P1 · A second voucher, transfer or office collection in the same visit silently returns the first
- **Screens:** BANK-009 `/backoffice/bank/cashbook?drawer=voucher`; BANK-006 `/backoffice/bank/transfers?drawer=new`; FIN-013 `/backoffice/fin/office-collections`.
- **Where:** `finance/CashbookPage.tsx:373`, `:395`; `TransfersPage.tsx:133`, `:155`; `OfficeCollectionsPage.tsx:62`, `:77`.
- **Evidence:**
  - Each idempotency key is created once per mount, e.g. `const [key] = useState(() => \`cv-${Date.now().toString(36)}\`)`.
  - The drawers and the page stay mounted between uses (`CashbookPage.tsx:232`, `TransfersPage.tsx:111`).
  - The server remembers every key and returns the earlier record for a repeat (`fixtures/src/society/finance/common.ts:46-52`; `handlers-books.ts:396-398`, `:557-559`; `handlers-collect.ts:447-449`).
  - The transfer form is also never reset (`TransfersPage.tsx:126-131`).
- **Steps:** on the cashbook, submit a voucher, then open "New voucher" again, fill in different details and submit.
- **Expected vs actual:**
  - Expected: a second record.
  - Actual: the first record comes back, and the toast says "Sent for approval" / "{{ref}} started". Data entered for the second voucher is silently discarded.
- **Fix:** mint a new key each time the drawer opens or after each success (`RemindersPage.tsx:255`, `:264` does), and reset the transfer form on close.
- **Confidence:** verified in code (lead re-check).

### FIN-03 · P1 · A voucher saved as a draft cannot be reached again
- **Screen:** BANK-009.
- **Where:** `finance/CashbookPage.tsx:394-398`; `packages/fixtures/src/society/finance/cashbook.ts:304`.
- **Evidence:**
  - `create()` calls `window.history.replaceState(… FINANCE.voucher(id))` and then `onClose()`.
  - `onClose` runs `setParams({drawer:null, voucher:null})` from the router's location, which overwrites the new URL (`packages/ui/src/navigation/RouterAdapter.tsx:70-80`).
  - The pending list includes only `approved` and `submitted` vouchers.
  - No UI calls `GET /finance/vouchers`, and a draft has no approval.
- **Expected vs actual:**
  - Expected: after "Save as draft" the user can reopen it to finish and submit.
  - Actual: the draft is unreachable. The same `replaceState` trick in the voucher and transfer "Reverse" flows (`CashbookPage.tsx:508`, `TransfersPage.tsx:232`) leaves the address bar on the new record while the drawer shows the old one.
- **Fix:** navigate with the router to `?voucher=<id>` and keep the drawer open, and list drafts under "Not settled yet" or in a voucher list.
- **Confidence:** verified in code (lead re-check).

### FIN-04 · P1 · Approval-policy draft: the effective date resets, and "Send for approval" drops unsaved edits
- **Screen and route:** APR-004, `/backoffice/apr/approval-settings?tab=draft`.
- **Where:** `finance/ApprovalPages.tsx:341`, `:470`, `:473`, `:476`.
- **Evidence:**
  - `useState('2026-11-01')`: the saved `effectiveFrom` is never loaded, and Save always sends `from`.
  - Submit posts `{}` without saving the edited `rules` first, and there is no unsaved-changes warning.
- **Expected vs actual:**
  - Reopening a draft shows 2026-11-01, and the next save overwrites the saved date.
  - Rules edited on screen and sent without saving are replaced by the stored version, so approvers approve a different policy from the one the author saw.
- **Fix:** initialise the date and note from the draft, and either save before submitting or disable Submit while edits are unsaved, with the reason shown.
- **Confidence:** verified in code (lead re-check).

### FIN-05 · P2 · The close drawer's "Count cash" link opens a count form the viewer cannot submit
- **Screen:** BANK-008 `/backoffice/bank/cashbook?drawer=close`.
- **Where:** `finance/CashbookPage.tsx:750` (unconditional link), `:235` (`CountDrawer` opens regardless of `d.actions.count`). The POST requires `cash_voucher.prepare`, `funds_transfer.create` or `period.close` (`handlers-books.ts:797`).
- **Actual:** the administrator (Rabia) fills in a full denomination count and gets "Your role does not allow this". The link also drops the `period` and `account` filters.
- **Fix:** gate the link and the drawer on `actions.count`, and keep the query parameters.
- **Confidence:** verified in code.

### FIN-06 · P2 · An ownership transfer says "Completed" while the payer change is still pending, and that step never completes
- **Screens:** OWN-003/004.
- **Where:** `finance/OwnershipPages.tsx:88`, `:211`, `:216`; `fixtures/src/society/finance/handlers-dues.ts:713-714`; `fixtures/src/society/handlers.ts:771`.
- **Evidence:**
  - Issuing the certificate snapshots `payerChange.state` (always `pending_approval`) and sets `status = 'completed'`.
  - Approving the payer change never updates the snapshot.
- **Actual:**
  - A green "Completed" / "مکمل" badge shows while the change awaits approval.
  - After approval, "Payer changed" still shows as not done.
- **Fix:** read the live payer-change state, and use "Certificate issued — payer change pending" until it is approved.
- **Confidence:** verified in code.

### FIN-07 · P2 · The clearance certificate says no dues were outstanding when they were waived
- **Screen:** OWN-006 (`…transfer-review-approval?record=…&drawer=certificate`).
- **Where:** `finance/OwnershipPages.tsx:385-386`; `en-PK/governance.json:534-535`; the same lines in ur-PK.
- **Evidence:** "the association confirms that on {{date}} no dues were outstanding against the owner…" is always printed, then "Dues of {{amount}} were waived by an approved waiver."
- **Fix:** use a separate sentence for the waived case ("dues of X were outstanding and waived under approval Y").
- **Confidence:** verified in code (lead re-check).

### FIN-08 · P2 · Vouchers awaiting approval are described as "Paid out" / "ادا کی گئی"
- **Screens:** APR-002 `/backoffice/apr/approval-360-view?record=…`; the BANK-009 voucher drawer.
- **Where:** `finance/ApprovalPages.tsx:143`; `CashbookPage.tsx:468`; `en-PK/finance.json:302-305` ("Paid out", "Received"); `ur-PK/finance.json:302-305` ("ادا کی گئی" = "has been paid", "وصول ہوئی" = "has been received").
- **Expected vs actual:** the approver reads "Money: has been paid" before anything is approved or posted.
- **Fix:** use neutral direction labels: "Payment (money out)" / "Receipt (money in)", "ادائیگی / وصولی".
- **Confidence:** verified in code (lead re-check). Seen in `gate-s1/screenshots/g05-approval-preparer-cannot-decide-390-ur.png`.

### FIN-09 · P2 · The reminder preview labels channels "Sent" before anything is sent
- **Screen:** COL-009, Reminders → "Send due reminders now".
- **Where:** `finance/RemindersPage.tsx:340`; `en-PK/governance.json:367` ("Sent"); ur "بھیجی گئی".
- **Fix:** use a preview label ("Will send" / "بھیجی جائے گی") and keep "Sent" for history.
- **Confidence:** verified in code (lead re-check). Seen in `gate-s1/screenshots/o02-reminder-preview-skips-1440-en.png`.

### FIN-10 · P2 · Bulk-collection "Cash" and "Cheque" buttons do not name the flat or payer
- **Screen:** FIN-013 batch drawer → Add flats.
- **Where:** `finance/OfficeCollectionsPage.tsx:438-443`.
- **Expected vs actual:** MANUAL_VERIFICATION F5 expects each button to name the flat. A screen reader hears a list of identical "Cash, button".
- **Fix:** name the button, e.g. "Cash for Kamran Siddiqui, A-101".
- **Confidence:** verified in code.

### FIN-11 · P2 · Ownership progress steps show done or not done only visually
- **Screen:** OWN-004.
- **Where:** `finance/OwnershipPages.tsx:217-223`. Each step is an `aria-hidden` icon plus a label.
- **Fix:** add visually hidden "done" / "not yet" text, or `aria-current` on the current step.
- **Confidence:** verified in code.

### FIN-12 · P2 · Finance dashboard account rows collapse to a one-word column on phones
- **Screen:** FIN-001.
- **Where:** `finance/FinanceDashboard.tsx:143-161`. In a `flex flex-wrap` row the text block is `min-w-0 flex-1` (basis 0).
- **Actual:** with the "9 lines not reconciled" badge present, the IBAN breaks into two or three characters per line, and the description goes one word per line.
- **Fix:** give the text block a real basis (the D.1 `basis-[min(100%,14rem)]` pattern).
- **Confidence:** seen in evidence (`gate-s1/screenshots/m01-dashboard-390-en.png`, `f01-finance-dashboard-390-ur.png`).

### FIN-13 · P2 · The export review drawer keeps the previous request's choices
- **Screen:** ADM-024 `/backoffice/adm/data`.
- **Where:** `adm/data/ExportDrawers.tsx:168-179`, `:196-199`; `DataPrivacyPage.tsx:162`. `keep` and `note` are reset only after success.
- **Actual:** narrowing request A, closing with Escape and opening request B shows A's choices. "Approve" then sends A's dataset list for B.
- **Fix:** reset whenever `request` changes or the drawer closes.
- **Confidence:** verified in code.

### FIN-14 · P3 · Urdu approval titles break around English account names
- **Where:** `ur-PK/governance.json:3-9` (`"{{purpose}} ({{account}})"`, `"{{from}} ← {{to}}"`); `finance/ApprovalPages.tsx:68`, `:161`.
- **Fix:** wrap interpolated values in FSI/PDI, as `DataPrivacyPage.tsx:215` already does.
- **Confidence:** seen in evidence (`gate-s1/screenshots/g06-my-approvals-390-ur.png`). The arrow case is inferred from the bidi rules.

### FIN-15 · P3 · Dashboard figures open lists that don't match the figure
- **Where:** `fixtures/src/society/finance/overview.ts:120`, `:131-133`; `collections/ProofInbox.tsx:24`.
- **Evidence:**
  - "Proofs waiting" counts five states but opens `to_review`.
  - "Collected" opens all payments for all periods.
  - "Settled in the bank" opens `state=matched` for all periods, debits included.
- **Fix:** pass and support period and state filters.
- **Confidence:** verified in code.

### FIN-16 · P3 · Action links land on a list instead of the action
- **Where:** `finance/FinanceDashboard.tsx:192-193` ("Prepare a deposit or transfer" goes to `FINANCE.transfers()`, although `?drawer=new` exists); `AccountsPages.tsx:103`.
- **Confidence:** verified in code.

### FIN-17 · P3 · One-tap destructive actions, and a memo field the dialog relies on is far below it
- **Where:** `society/portal/PortalPeople.tsx:34-39` (Cancel invitation, no confirmation, no `onError`); `finance/OfficeCollectionsPage.tsx:551-555` ("Hand it back" cancels a cheque in one tap with a canned reason), `:692` (the return-memo field sits after the history).
- **Fix:** use `ConfirmDialog`, and move the memo into the return dialog.
- **Confidence:** verified in code.

### FIN-18 · P3 · Why an export dataset was excluded is told only to screen readers
- **Where:** `adm/data/DataPrivacyPage.tsx:103-105`. The reason is in an `sr-only` span; sighted users see only a strikethrough.
- **Fix:** show the reason visibly.
- **Confidence:** verified in code.

### FIN-19 · P3 · ADM-003 and ADM-023 routes have no route guard
- **Where:** `apps/backoffice/src/prototype/routes.tsx:445`, `:548` (plain `lazy`). The APIs need `admin.view`.
- **Actual:** non-administrators get a raw 403 error state instead of the access outcome other gated screens show.
- **Fix:** wrap both routes in an access target, as `BrandingRoute` does.
- **Confidence:** verified in code.

### FIN-20 · P3 · Small layout and flow gaps
- **Where:**
  - `finance/CashbookPage.tsx:627`: the count drawer grid has conflicting `grid-cols-1 grid-cols-2`, so it is always two columns (320 px / 200 % risk, inferred).
  - `RemindersPage.tsx:207-240`: the "Change the rules" editor has no Cancel.
  - `CashbookPage.tsx:87`: "Close {{period}}" is offered without `period.close`. The drawer then says "ready to close" with no button and no reason.
- **Confidence:** verified in code.

## 6. Society operations and community, D.2/D.3 (OPS)

### OPS-01 · P1 · Request 360 drawer actions that fail show no error where the user is looking
- **Screen and route:** MNT-003, including the MNT-005 assign and MNT-013 merge drawers; `/backoffice/mnt/maintenance-360-workspace?record=…&drawer=…`.
- **Where:** `operations/RequestWorkspace.tsx:55-66` (`run()` stores the error on the page and returns `false`), `:88` (the only `ProblemAlert`, in page content behind the modal), drawers at `:117-122`, submits at `:435`, `:478`, `:545`, `:572`, `:602`, `:648`, `:651`.
- **Expected vs actual:**
  - Expected: a refused triage, assign, complete, hold, merge or resolve shows its reason inside the drawer.
  - Actual: the drawer stays open and nothing changes. On phones the drawer is full height, and React Aria hides the page from screen readers, so the alert is never heard.
- **Fix:** render a `ProblemAlert` inside each drawer, or toast the error.
- **Confidence:** verified in code (lead re-check).

### OPS-02 · P2 · The completion drawer calls the photo "optional" but requires one
- **Screen:** MNT-003 complete drawer.
- **Where:** `operations/RequestWorkspace.tsx:545` (`isDisabled={note.trim().length < 10 || !files.length || …}`), `:553`; `okit.tsx:207`; `en-PK/operations.json:520` ("(optional, up to {{max}})").
- **Fix:** mark the photo as required ("at least 1 photo") and say what is still missing.
- **Confidence:** verified in code. Seen in `gate-d2/screenshots/r09-completion-evidence-1440-en.png`.

### OPS-03 · P3 · The "Expected today" figure opens the wrong gate tab
- **Where:** `operations/VisitorPages.tsx:67` links to `OPS.gate('queue')`, but expected passes are on the Check-in tab (`:217-230`).
- **Confidence:** verified in code.

### OPS-04 · P3 · The issues board ignores the registered `?status=` filter
- **Where:** `operations/IssuesBoard.tsx:24`, `:61` read `issueStatus`. The register row (`docs/ui/screen-register.csv:394`) and `GATE_D2_REPORT.md:107` document `?status=` and `?area=`.
- **Actual:** `/backoffice/mnt/issues?status=resolved` shows Open.
- **Confidence:** verified in code.

### OPS-05 · P3 · The gate's "Updated" time sits in a live region and is re-announced
- **Where:** `operations/VisitorPages.tsx:147-150`: `role="status"` around a time that changes on the 15-second refetch.
- **Fix:** keep the timestamp out of the live region, and announce only queue changes.
- **Confidence:** inferred (how often it is announced depends on the screen reader).

### OPS-06 · P3 · Buttons that do nothing until another query loads (or forever if it fails)
- **Where:**
  - `community/PollsPages.tsx:46` with `:87`, and `:226-230` with `:336`
  - `community/ResourcesPage.tsx:29` with `:51`
  - `hr/RosterPage.tsx:441` with `:473`
  - `hr/Employee360Page.tsx:62-66` with `:406-408`
  - `hr/LeaveAdjustmentsPage.tsx:36-47`: shown with `canRequestLeave`, but the drawer needs the staff list, which is fetched only with `hr.view` (`:21`). A role with only `leave.manage` gets a dead button.
- **Fix:** disable with a pending state, or give the drawer its own loading and error states.
- **Confidence:** verified in code.

## 7. Society HR, S.2a (HR)

### HR-01 · P2 · Advance wording asserts facts the system cannot verify, and contradicts the server's limits
- **Screens:** HR-009/010 (`/backoffice/hr/employee-advances`, `…/employee-advance-settlement`).
- **Where:**
  - `en-PK/hr.json:628` `effect.withdraw` "…is withdrawn; nothing is paid."
  - `:601` `approvedExplain` "…nothing is recorded as paid, and nothing is owed."
  - The same at ur-PK `:601`, `:628` ("کچھ ادا نہیں ہوتا").
  - Withdrawing is allowed on approved advances (`fixtures/src/hr/views.ts:312`, `handlers.ts:950`).
  - `kindHint` ("Repaid within 6 months" / "up to 36", `:584-585`) contradicts `noPolicy` ("no adopted limits", `:617`), while the server enforces 6 and 36 (`handlers.ts:918`).
  - The S.2b code appears in user text (see X-08).
- **Expected vs actual:** under ruling O8 an approved advance's payment is "not verified", so "nothing is paid" or "nothing is owed" states the opposite of an unknown.
- **Fix:** use "nothing is recorded as paid / owed" in both languages, and align the limits text with the enforced rule.
- **Confidence:** verified in code.

### HR-02 · P2 · New employee form: no error summary, and the role and date errors are not tied to their fields
- **Screen and route:** HR-004, `/backoffice/hr/new-employee`.
- **Where:**
  - `hr/NewEmployeePage.tsx:58-61`: client hints return silently, with no summary and no focus move.
  - `:117`: a summary shows only for server errors.
  - `hr/hkit.tsx:335-336`: `SearchSelect` description and error are plain `<p>`.
  - `:386-395`: `DateInput` has no `aria-describedby` or `aria-invalid`.
  - `NewEmployeePage.tsx:92`, `:114`: server date errors render as muted description text.
- **Expected:** MANUAL_VERIFICATION H1 says "the error summary and each field's message are read and linked to their fields".
- **Fix:** add a focused, linked error summary, and use `FieldError` / `Text slot="description"`.
- **Confidence:** verified in code. Seen in `gate-s2a/screenshots/b01-new-employee-validation-1440-en.png`.

### HR-03 · P3 · Employee 360 advance rows link to the generic Advances list
- **Where:** `hr/Employee360Page.tsx:373` goes to `HR.advances()`, which defaults to "Open" and opens drawers only from local state (`AdvancesPages.tsx:28-29`). `HR.settlement`'s `advance` parameter is unused (`nav.config.ts:176`).
- **Actual:** a rejected or withdrawn advance is not visible where the link lands.
- **Fix:** support `?advance=` and open its drawer from the URL.
- **Confidence:** verified in code.

### HR-04 · P3 · Roster grid times use a different format from the rest of HR
- **Where:** `hr/RosterPage.tsx:167-170`, `:513-516` show raw 24-hour "07:00–15:00", while phone cards, On duty now and the drawers use `ShiftTime` ("7:00 AM – 3:00 PM").
- **Confidence:** seen in evidence (`gate-s2a/screenshots/a07-roster-week-1440-en.png`).

### HR-05 · P3 · HR drawers: a free-text month field, and errors only in the summary
- **Where:**
  - `hr/AdvancesPages.tsx:292`: `<input type="month">` falls back to free text with no format hint in desktop Firefox and Safari (inferred).
  - `:306`: `firstMonth`, `evidence` and `employeeId` errors appear only in the summary.
  - `hr/AttendancePage.tsx:236`: the correction reason has no `errorKey`.
- **Confidence:** verified in code; the browser fallback is inferred.

## 8. Resident app (RES)

### RES-01 · P1 · A reversed receipt is still shown to the resident as "Paid"
- **Screens and routes:** PORTAL-010 `/customer/portal/receipt?record=…`; PORTAL-001 `/customer/portal/home`.
- **Where:**
  - `apps/customer-web/src/pages/dues/DuesPages.tsx:364` (`<Badge tone="success">{t('dues:receipt.paid')}</Badge>`), followed by "Amount received" (`:377`) and the "settles" list (`:380-386`).
  - `DuesHome.tsx:213-227`: every receipt is drawn as a success card.
- **Evidence:**
  - S.1 sets `receipt.reversed = { on, reason }` (`fixtures/src/society/finance/handlers-collect.ts:307`; `contracts/src/collections.ts:408`), and the resident endpoint returns it unchanged (`dues-portal-handlers.ts:381-385`).
  - The page never reads `r.reversed`.
  - The home summary drops the flag (`dues-portal-handlers.ts:208-209`).
  - Only the history list shows "Reversed" (`DuesPages.tsx:177`).
- **Expected vs actual:**
  - Expected: "Reversed on … because …", not "Paid".
  - Actual: "Paid" / "ادا شدہ", "Amount received", and the allocations it no longer settles.
  - The bill's "Payments on this bill" list (`DuesPages.tsx:124-139`, handler `dues-portal-handlers.ts:309-311`) probably has the same gap (inferred).
- **Fix:** render a reversed state when `reversed` is set, and pass the flag through the home and bill summaries.
- **Confidence:** verified in code (lead re-check).

### RES-02 · P2 · "My properties" shows "In credit Rs 0.00" for every flat in credit
- **Screen and route:** PORTAL-002, `/customer/portal/my-properties`.
- **Where:** `household/HouseholdPages.tsx:72` formats `p.balance`. `balance` is "what this person owes" and is set to `money(open)`, so it is 0 whenever `balanceState === 'credit'` (`fixtures/src/identity/household-handlers.ts:78-79`; `contracts/src/identity.ts:375-376`).
- **Fix:** add a `credit` amount to `MyProperty` and display that.
- **Confidence:** verified in code (lead re-check). No evidence screenshot has a flat in credit.

### RES-03 · P2 · Home loses both "Pay" and "See your proof" when the proof is waiting for the bank or an exception
- **Screen:** PORTAL-001.
- **Where:** `dues/DuesHome.tsx:31` (pending = `submitted` or `under_review` only), `:160-172`.
- **Evidence:** the server counts `awaiting_bank_evidence` and `exception_pending` as pending and sets `status: 'pending_verification'` (`dues-portal-handlers.ts:146-148`). Pay is therefore hidden, and `pendingId` is undefined.
- **Actual:** only "See the bill" remains. This is the A-101 Rs 6,000 scenario from the C.2 closure.
- **Fix:** take the pending set from the server, or include every non-final state.
- **Confidence:** verified in code (lead re-check).

### RES-04 · P2 · Proof form: server field errors look like help text and are not announced
- **Screen and route:** PORTAL-008, `/customer/portal/upload-proof-mock`.
- **Where:** `dues/DuesPay.tsx:286`, `:290`, `:292`, `:308-310`.
- **Evidence:**
  - Errors are passed as `description`, not `errorKey`.
  - The date error is a bare `<span>`.
  - The InlineAlert is suppressed whenever field errors exist.
  - Server rules include amount format, a future or too-old date, and a reference shorter than 4 characters (`dues-portal-handlers.ts:230-240`).
- **Expected vs actual:** a screen-reader user who presses Send hears nothing, and fields are not marked invalid.
- **Fix:** use `errorKey`, keep a `role="alert"` summary, and focus the first invalid field.
- **Confidence:** verified in code.

### RES-05 · P2 · Re-send proof: no field errors and no file checks
- **Screen and route:** PORTAL-028, `/customer/portal/submissions/:id`.
- **Where:** `dues/DuesPages.tsx:317-325`, `:322`.
- **Evidence:**
  - Any failure shows only "Some entries need attention."
  - The file `onChange` accepts any type and size (the main form checks both, `DuesPay.tsx:243-249`).
  - The transfer date cannot be changed.
- **Fix:** reuse the main proof form's checks and field-error mapping, and add the date field.
- **Confidence:** verified in code.

### RES-06 · P2 · Hidden file inputs are an invisible Tab stop
- **Screens:** PORTAL-008, PORTAL-028.
- **Where:** `dues/DuesPay.tsx:303`, `dues/DuesPages.tsx:322` (`<input type="file" className="sr-only">` with no `tabIndex`). `operations/rkit.tsx:79` does this correctly with `tabIndex={-1}`.
- **Expected vs actual:** a keyboard user reaches a second, invisible focus stop after "Choose file" (WCAG 2.4.7).
- **Fix:** add `tabIndex={-1}`.
- **Confidence:** verified in code.

### RES-07 · P2 · Repair, issue and pass sheets keep the previous record's draft
- **Screens:** PORTAL-018 `/customer/portal/maintenance-workspace?record=`; PORTAL-034 `/customer/portal/issues?record=`; the pass sheet `…/services-home?tab=visitors&pass=`.
- **Where:** `operations/RepairsPage.tsx:237-241`, `:255` (close resets only `mode`), `:76`; `IssuesPage.tsx:204-205`, `:63`; `ServicesHub.tsx:292-293`, `:168`. Each is a single always-mounted component with no `key`.
- **Steps:** open repair A, type a message, close it, open repair B, press Send.
- **Expected vs actual:**
  - Expected: each record opens clean.
  - Actual: A's text, rating, error or "Copied" state appears on B, and Send posts A's text to B.
- **Fix:** key each sheet by record id, or reset its state when the record changes.
- **Confidence:** verified in code.

### RES-08 · P2 · Irreversible resident actions run on a single tap
- **Where:**
  - `operations/RepairsPage.tsx:332-336` (cancel a repair)
  - `ResidentServices.tsx:71-87` (remove an approved vehicle, losing its slot approval), `:268-272` (cancel a booking)
  - `ServicesHub.tsx:332-351` (cancel a pass)
  - `household/HouseholdPages.tsx:360-368` (withdraw a request)
- **Fix:** use `ConfirmDialog` stating the effect, as chat leave and block already do.
- **Confidence:** verified in code.

### RES-09 · P2 · Welcome wizard: focus is lost and step changes are not announced
- **Screen and route:** PORTAL-030, `/customer/portal/welcome`.
- **Where:** `auth/WelcomePage.tsx:24-37`, `:108-117`.
- **Evidence:**
  - The page is "bare", so the shell's route focus does not run.
  - Language → text size swaps the tree (`TextSizeWelcome`), and focus drops to `<body>`.
  - There is no `focus()` call anywhere in the flow.
- **Fix:** focus the step's `h1` (with `tabIndex={-1}`) on every step change.
- **Confidence:** verified in code.

### RES-10 · P2 · The organisation name in the phone header breaks mid-word
- **Screen:** every resident page on a phone.
- **Where:** `packages/ui/src/shell/CustomerShell.tsx:295-299` (`[overflow-wrap:anywhere]`). The same utility is used on amounts in `household/HouseholdPages.tsx:71`.
- **Actual:** "Al-Noor Residenc / y (Demo)" at 390 px, Urdu, 100 % text.
- **Fix:** break at word boundaries with a line clamp and a full-name title, or use the icon-only language toggle at this width.
- **Confidence:** seen in evidence (lead re-check: `gate-d2/screenshots/r01-resident-repairs-390-ur.png`; also `gate-d3/screenshots/a08-chat-whole-community-390-ur.png`).

### RES-11 · P2 · The visitor pass code will likely overflow its card at large text sizes
- **Screen:** PORTAL-020 pass sheet.
- **Where:** `operations/ServicesHub.tsx:300-302` (`text-4xl tracking-[0.35em]` inside an unbreakable `<bdi dir="ltr">`). `--text-4xl` and the em letter-spacing both scale with `--text-scale` (`packages/tokens/src/theme.css:176`).
- **Evidence:** about 190 px at 100 % (v03), so about 380 px at 200 %, against roughly 300 px of card width on a 390 px phone.
- **Fix:** clamp the size to the container, or let the digits wrap in groups of three.
- **Confidence:** inferred (`gate-d2/screenshots/v03-pass-with-code-390-ur.png` plus the token arithmetic). This sheet is not in the 320 / 200 % captures.

### RES-12 · P2 · A bill settled by a credit note is labelled "Paid", and Pay is offered while a proof covering it is pending
- **Screens:** PORTAL-004, PORTAL-005.
- **Where:** `dues/DuesPages.tsx:16` (`settlement === 'credited'` is mapped to the "Paid" chip), `:140-145` ("Pay Rs X" regardless of `position.status`; Home hides it, `DuesHome.tsx:160`).
- **Expected vs actual:** a credited bill was not paid, which is a financial wording error. The Pay page does warn "You have already sent proof", which partly mitigates the second issue.
- **Fix:** give the credited state its own label, and mirror Home's pending logic on the bill page.
- **Confidence:** verified in code.

### RES-13 · P3 · "Copy the invitation" says "Copied" even when copying failed
- **Where:** `operations/ServicesHub.tsx:310-323` (an empty catch, then `setCopied(true)`).
- **Fix:** show the existing `copyFailed` message. For the hard-coded society name in the same copy, see COL-16.
- **Confidence:** verified in code.

### RES-14 · P3 · Masked phone numbers are not isolated inside Urdu sentences
- **Screens:** AUTH-006 code step; AUTH-007 invitation.
- **Where:** `auth/PortalSignInPage.tsx:79` (and the announcement at `:42`); `auth/InvitationPage.tsx:173` (and `:41`). `t('identity:code.sentTo', { to: '+92 300 *** 4567' })`.
- **Evidence:** the same value is isolated in the demo box (`packages/ui/src/forms/OneTimeCode.tsx:91`).
- **Fix:** wrap the value in LRI…PDI or a `<bdi dir="ltr">` component.
- **Confidence:** verified in code; the reordering is inferred from the bidi rules.

### RES-15 · P3 · The tour points to links that are not on the Bills page
- **Where:** `en-PK/dues.json:310` and ur-PK ("Receipts and your statement are under Bills"). `DuesBillsPage` (`dues/DuesPages.tsx:19-57`) has no link to Receipts or the Statement.
- **Confidence:** verified in code.

### RES-16 · P3 · Custom radio groups have no arrow-key navigation and are labelled twice
- **Where:** `operations/RepairsPage.tsx:203-211` (category), `:283-289` (stars); `ResidentServices.tsx:337-347` (amenity slots). Each is a `<button role="radio">` in its own Tab stop, and each group has both a `<legend>` and an `aria-label`.
- **Fix:** use the shared React Aria `RadioGroup` / `ChoiceCards`.
- **Confidence:** verified in code.

### RES-17 · P3 · The repair card is a `<button>` wrapping an `<ol>`
- **Where:** `operations/RepairsPage.tsx:99-117`; `packages/ui/src/data/Stepper.tsx:30`.
- **Actual:** invalid content for a button, and a very long accessible name (all five steps plus "Open").
- **Fix:** use the `::after` title-link pattern from `HomeAttention.tsx:40-56`.
- **Confidence:** verified in code.

### RES-18 · P3 · Notification items navigate twice
- **Where:** `operations/GatePrompt.tsx:127-135`. A React Aria `Link` with `href`, plus `navigate(n.href)` in `onPress`, makes Back need two presses.
- **Confidence:** inferred from React Aria `Link` behaviour.

### RES-19 · P3 · Gate prompt: Escape dismisses it for good, and the countdown can sit at 0 with live buttons
- **Where:** `operations/GatePrompt.tsx:42`, `:46`.
- **Fix:** disable or close at 0, and say where to answer after dismissing.
- **Confidence:** verified in code.

### RES-20 · P3 · The invitation page reports any load error as "not found"
- **Where:** `auth/InvitationPage.tsx:67` (and `:43`: a send-code failure only refetches, with no message).
- **Confidence:** verified in code.

### RES-21 · P3 · Bottom-bar labels shrink to about 9 px on a 320 px phone
- **Where:** `packages/ui/src/shell/CustomerShell.tsx:168` (`min(var(--text-nav),18cqi)`). The 18cqi cap goes below the 11 px base at any text size. This is beyond the documented 112 % chrome cap (C.2 §7).
- **Confidence:** seen in evidence (`gate-d2/screenshots/c01-home-320x700-200pct-ur.png`, `gate-d3/screenshots/c05-chat-conversation-320x700-200pct-ur.png`).

## 9. Platform HQ and developer pages (HQ)

### HQ-01 · P2 · "Preview as client" lists an address that does not exist, and says it opens
- **Screen and route:** HQ-009 `/hq/tenants/:id/preview`.
- **Where:** `apps/platform-hq/src/pages/preview/PreviewPage.tsx:62`, `:311-313`; `packages/ui/src/workspace/tenantWorkspace.ts:161-173`.
- **Evidence:** `/backoffice/sal/booking-list` is not in the screen register (checked by script; the register row is `/backoffice/bkg/bookings-list`). No menu area matches it, so the check returns only a suspension rule.
- **Actual:** "Opens" for every role of every active tenant, while the backoffice shows "We couldn't find that page".
- **Fix:** correct the path, and test that every sample address resolves to a register row.
- **Confidence:** verified in code (lead re-check of the register lookup).

### HQ-02 · P2 · The preview's access rule ignores the conditions the backoffice routes apply
- **Where:** `apps/backoffice/src/prototype/routes.tsx:232`, `:246-255`, `:498` versus `tenantWorkspace.ts:161-173`.
- **Evidence:** the route requires `maintenance.manage` and `useOpsSite()` (a society). The preview uses only the menu area's `operations.view` and ignores the register row's own permission.
- **Actual:** HQ-009 says the Al-Noor technician can open MNT-004 "New request", but the backoffice shows a planned page. The same applies to any non-society tenant with the maintenance or visitors modules.
- **Fix:** share one access target per address between the route table and `workspaceRouteTarget`.
- **Confidence:** verified in code.

### HQ-03 · P2 · The Create tenant wizard fails silently, or loads forever, on errors
- **Screen and route:** HQ-003 `/hq/tenants/new`.
- **Where:** `apps/platform-hq/src/pages/create/CreateTenantPage.tsx:186-198` (`void startDraft(e)`, no catch), `:205-227` (`.then` with no `.catch`, so the step renders `<Skeleton className="h-96">` forever), `:290-291`.
- **Fix:** handle both the way `commit` already does.
- **Confidence:** verified in code.

### HQ-04 · P2 · HQ configuration problems show raw field paths and never mark the fields
- **Screens:** HQ-026 `/hq/policies`, HQ-010 `/hq/rate-cards`, HQ-006/007 `/hq/catalogue`, amendment history.
- **Where:** `apps/platform-hq/src/components/config.tsx:74` (`` `${field}: ${tr(e.code)}` ``, with keys such as `lines.<id>.floorPrice`, from `fixtures/src/platform/config.ts:191-266`). No `isInvalid` appears in `pages/config/*`.
- **Actual:** staff read developer keys, in English even in Urdu, with no link to the field.
- **Fix:** map each path to a translated row and column label, and mark the input invalid.
- **Confidence:** verified in code.

### HQ-05 · P3 · The preview's phone bar differs from the client's real bar for finance roles
- **Where:** `PreviewPage.tsx:187` takes the first three menu items. The real shell reorders them (`ShellLayout.tsx:92`, `packages/ui/src/shell/BottomNav.tsx:28-37`).
- **Confidence:** verified in code.

### HQ-06 · P3 · HQ tour completion offers "Try a practice task", which just opens the dashboard
- **Where:** `apps/platform-hq/src/nav.config.ts:55` (`practice: HQ.dashboard`); `packages/ui/src/onboarding/TourDialogs.tsx:85-89`.
- **Fix:** hide the button when the app has no practice mode.
- **Confidence:** verified in code.

## 10. Checked and found clean

- **Hard-coded colours:**
  - No `bg-white`, `text-gray-*` or similar utilities outside the QR code (`dues/DuesPay.tsx:211`, which is deliberately black on white so it can be scanned).
  - Hex and `rgb()` values occur only in image scrims, theme-preview swatches (`PersonalizationHub.tsx`), printable HTML (`RemindersPage.tsx:368-372`) and decorative gradients.
- **Attribute literals:** no hard-coded English in `aria-label`, `placeholder`, `title`, `alt` or `label` attributes anywhere in `apps/*/src` or `packages/ui/src`.
- **Fixed-locale formatting:** `en-GB` and `en-CA` appear only in internal date-key and hour calculations, never as displayed text. Display formatting goes through `packages/i18n/src/format/*` with the active locale.
- **Fixed pixel widths:** only the 3 px active-item bars in the navigation.
- **ur-PK dictionaries:** three area reviews ran key-by-key scripts. Apart from brand and technical terms (PropertyOS, IBAN, SMS, WhatsApp, PDF), no value is still English.

## 11. Known limitations (documented, not re-reported)

- **Manual testing not done:** NVDA, VoiceOver and TalkBack passes, real devices, browsers other than Chromium, forced colours and printing (every gate's `MANUAL_VERIFICATION.md`; `gate-b-final/NVDA_CHECKLIST.md`).
- **Urdu wording and typesetting:**
  - Urdu wording still needs a native reader (D.2, D.3, S.1 and S.2a manual lists).
  - React Aria's built-in strings stay English (Stage 1 §5).
  - English typed into Urdu fields shows the full stop at the start of the line (D.2 §8, D.3 §7).
  - The shared `DateTime` does not isolate Urdu times ("PM 6:13"; S.2a §8, SECURITY_FINDINGS §4, ruling O10).
- **Size caps:** navigation and chrome text are capped at 112 % (C.2 §7).
- **Simulated features:**
  - Messages, statements, one-time codes and online payment (C.2 §8, D.1 §7, S.1 §8).
  - QR scanning, live refresh and scheduled publishing (D.2 §8, D.3 §7).
  - Chat does not refresh by itself (D.3 §7).
- **Planned or partial screens:**
  - Planned-screen links: ActionCentre KPIs, the sidebar's Projects, Procurement, Reports and Administration, and Quick create's planned group (Stage 1.5 §7, 1.5R).
  - HR-008 is partial; there are no leave balances or shift-template editing (S.2a §8, §12.3).
  - CHAT-001 is partial (D.3 §3.2, §6).
  - The D.3 §10.7 poll limitations.
  - ADM-003 is sessions only (D.1 §7).
- **S.1 open items:** decisions D-35, D-42, D-46 and D-48; owner of record after a transfer; action times in UTC (S.1 §7–8).
- **C.1 scope:** one society and one site; statements limited to October and November (C.1 §6, C.2 §8).

## 12. Not audited

- **Payroll** (`apps/backoffice/src/pages/society/payroll/*`, PAY-001…007): audited by Agent 1.
- **Runtime behaviour:** nothing was run, because a shared regression was in progress. That means no live screen-reader output, no observed focus order or focus return after drawers and sheets, no real 320 px / 200 % reflow of office screens (only the committed evidence), and no measured contrast (judged from token values).
- **Laravel / API behaviour** beyond the mock handlers the screens depend on.
- **Lightly read or not read:**
  - HQ: simulator, amendment page, rate-card / policy / catalogue editor internals, Tenant 360 tabs.
  - Backoffice: `start/*` setup and demo pages, `lab/*`, `help/TourLibrary` / text guide, `home/KpiRow`, `PortfolioCards`, `ManagementDashboard`, charts.
  - Developer edition of the resident app (`customer-web/src/pages/portal/*`): read lightly; payment wording looked correct. One small gap: `PayPage.tsx:251-257` shows every server error as "service didn't respond".
  - Embedded tabs: `GatewayTab`, `FlatServicesTab`, `FlatPortalTab`, `MoveOutDrawer`.
  - Shared UI internals: `UnitPickerField`, `OrgAppearance`, `prototypeTools`, `FilterPills`, `SegmentedControl`, `UrlTabs`.
- **Screenshots:** most of the 1,920 committed screenshots were not opened; about 30 were viewed where a finding depended on them.
