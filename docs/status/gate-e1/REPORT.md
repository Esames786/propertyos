# Gate E.1 report: CRM pipeline and site visits (Agent B, Wave 1, provisional)

> **Source.** The coordinator wrote this file from Agent B's hand-off, because the harness does not let subagents write report files. The content is Agent B's. Test results are in section 6; see also [CHECKPOINT.md](CHECKPOINT.md) and [MANUAL_VERIFICATION.md](MANUAL_VERIFICATION.md).

## 1. Agent and assignment

Agent B built five Gate E.1 screens:

- CRM-006 lead assignment;
- CRM-007 opportunities pipeline;
- CRM-008 Opportunity 360;
- CRM-009 site visits calendar;
- CRM-011 visit workspace.

This is a provisional Wave 1 build on `373d0cf`, in worktree `D:\laragon2\www\propertyos-e1`. Agent B did not merge or cherry-pick any other agent's work.

## 2. Branch and SHAs

`feature/gate-e1-crm-pipeline`. The agent's final commit is `bc48cb4`, six commits on top of `373d0cf`, pushed without force. The commit that adds this report sits on top of `bc48cb4` and changes no code.

## 3. Screens

All five are **PARTIAL**:

- CRM-006 is a drawer over the pipeline that opens from its own register address.
- CRM-007, CRM-008, CRM-009 and CRM-011 are full screens.

They stay PARTIAL because E.0 is not yet accepted or integrated, and decisions E-05, E-06 and E-07 are not yet approved. Each will be BUILT once E.0's helpers are swapped in, those decisions are taken and the full regression is green.

The register now reads 139 BUILT, 48 PARTIAL and 175 PLANNED (it was 139 / 43 / 180). Only Agent B's five rows changed, and their columns are filled in.

## 4. Features

**Pipeline**

- **Board:** one column per stage. Columns wrap into rows on wide screens; phones show one stage at a time.
- **List view:** a table on wide screens and cards otherwise.
- **Stage figures:** each stage's count and expected value opens the list filtered to that stage, and the counts always equal those lists.
- **Moving cards:** cards can be dragged between columns, or moved with each card's "Move" menu as the keyboard alternative. After a move, focus lands on the moved card.

**Lost, reopen and won**

- Marking an opportunity lost needs a reason; "Other" also needs a note.
- Reopening needs a note and returns the opportunity to the stage it was lost from.
- Marking it won is refused until bookings exist (Gate E.5).
- Changing stage never creates a quotation, hold, reservation, booking or payment.

**Conversion**

- A qualified lead converts once, with request-bound idempotency: the key is tied to the operation, person, lead and input, and the UI uses `useKeyedCreate`.
- The lead stays Qualified, so Sales home does not count a booking.

**Lead assignment**

- Search, filters with counts, and selection of several leads at once.
- The assignee picker lists only colleagues who hold the project of every selected lead.
- A reason is required, and each lead's reassignment history is shown.
- A new owner shows at once on Lead 360, the lead list and Sales home.

**Opportunity 360:** overview, timeline, visits and units tabs, with links to Lead 360, the project page and each unit's quick view.

**Calendar**

- A month table plus an agenda list with the same visits and actions.
- Filters for status, project and host, plus search.
- A reusable component, `pages/developer/crm/calendar/AgendaCalendar.tsx`, that E.11 can use for HND-008 and PORTAL-014.

**Visit workspace**

- Confirm a visit.
- Reschedule it to a half-hour slot between 09:00 and 19:00 within the next 90 days, with a reason.
- Record the outcome: visited (with interest level, feedback and the units shown), no-show, or cancelled with a reason.
- The next follow-up shows on the lead, the opportunity and Sales home.

**Links**

- Project links go to PRJ-002's register address, which shows its planned page until Gate E.2 lands; the link text says "planned".
- Lead 360 gains "open opportunity", "convert" and "reassign" links, shown only to people who can use them.

**Throughout:** English and Urdu (RTL), empty states, loading skeletons, and toasts that appear only after the server accepts the change.

## 5. Unit and API tests

- **E.1 tests: 54/54.** These are 29 golden-vector and rule tests and 25 API tests. The vectors (`crm-pipeline.vectors.json`) cover stage moves, converting once, won and lost, and counts matching lists.
- **Typecheck and lint pass.** Lint covers ESLint, logical CSS, and i18n parity across 2 locales × 28 namespaces (11,255 keys).
- **Full Vitest: 1,733/1,736**, run at 100 % CPU while other agents were also running tests.
  - The three failures were 5 s timeouts in `community.test`, `rentals.integration.test` and `society/finance/finance.api.test`.
  - This branch does not change the code those tests cover, and each passed when rerun on its own.

## 6. End-to-end results

The final run was on HEAD `21d292c`, holding the lock, on AC power, with previews verified on both loopback addresses.

- **Chromium: 516/516 in 45.7 min** (all e2e specs plus the E.1 evidence spec, 3 workers, retries off).
- **Firefox + WebKit smoke: 74/74 in 4.5 min.** Both known intermittents passed.
- **Own specs:** `e1-crm.spec` 14, `e1.smoke.spec` 4, `gatee1.evidence` 7.
- **Checks before taking the lock:** the existing specs most likely to be affected (crm, permissions, get-started, hq-tenant360, identity, security) passed 68/68, and `register.spec` passed 16/16.

## 7. Permission and security tests

These run at both API and browser level. Every refusal is checked to leave the stored state byte-identical.

- **Two-person journey:** Samina assigns and converts; Bilal records the visit outcome and the follow-up.
- **Project scope:** Bilal (Heights only) never sees Gardens records in the board, list, calendar, search, assignment drawer, totals, history or direct addresses.
- **Unauthorized users:** Farah (no `lead.view`) gets the planned page and a 403. Bilal cannot assign, convert or move.
- **No id oracle:** a Gardens id, someone else's Heights record, another organisation's id and an invented id all get the same 404. An assignee who is invented, belongs to another organisation, lacks `lead.view` or lacks the lead's project gets the same 422.
- **Revocation** takes effect on the next request, in each of these cases: narrowed site scope, removed `lead.view` or `lead.assign`, or a reassignment away from Bilal.
- **Duplicate conversion:**
  - the same request replays the same opportunity;
  - a reused key with different input gets `409 idempotency_key_reused`;
  - converting a second time gets `409 already_converted`.
- **Also covered:** stale record versions, won requiring a booking, invalid input, refusal in practice mode, and units from another project refused.
- **Nested history is filtered** for people who may see only their own records: a reassignment shows only "reassigned" and the time, with no names or reason.

## 8. Mutation checks

**18 of 19 caught.** Every file was restored byte-identical (checked with sha256).

The mutations covered:

- scope (×3);
- assignee rules (×3);
- idempotency bound to principal, input and target;
- converting once, and only when qualified;
- won without a booking;
- record version;
- history projection (×2);
- visit visibility;
- unit project;
- the 404-versus-403 oracle;
- mutating before validating.

The one survivor, M4, cannot be caught by any test: the assignee's project is already enforced by the effective-access check.

## 9. Accessibility

- **axe:** 1,647 scans with 0 violations in the final run, 41 of them on E.1 screens. Those cover English and Urdu at 1440 and 390 px, dialogs, 320 px at 200 % text, and dark mode with high contrast.
- **Layout:** no horizontal overflow and no layout problems at 320 px / 200 % in either language.
- **Keyboard:** the keyboard alternative to dragging is tested, and focus rings were measured on stage figures, card links, the Move menu and the calendar controls.
- **Not yet checked:** screen readers and real devices still need a person, so no WCAG conformance is claimed.

## 10. Screenshots

There are 80 PNGs in `screenshots/`, and every width matches its file name. They cover:

- the board, list and salesperson views;
- Opportunity 360 and its timeline;
- the calendar month and agenda;
- the visit workspace;
- the assignment drawer (manager and salesperson views);
- four dialogs;
- the end state of the two-person journey;
- dark mode.

Agent B reviewed them, including 320 px / 200 % in both languages and the Urdu pages.

## 11. Open dependencies

**Owner decisions needed**

| Decision | What this build assumes |
|---|---|
| E-05 | Salespeople see only records assigned to them, on the new screens only. Nadia has no `lead.assign`, so she also sees only her own records there. |
| E-06 | A new fictional persona, Samina Latif (sales manager), with a Larkspur-only role. |
| E-07 | Two new permissions, `lead.assign` and `lead.manage`. No existing person or role gained a permission. |
| E-28 | Unknown ids and out-of-scope ids get the same answer. |

**E.0 swaps needed:** replace `developer/crm/{scope,idempotency,state}.ts`, the history-filtering functions in `views.ts`, and the route guard in `routes.tsx` with E.0's versions.

**Shared-file touches.** All are additive and marked "Gate E.1 provisional".

| File | Change |
|---|---|
| `permissions.ts`, `access.ts` | the two new permissions |
| `persona.ts`, `people.ts` | the new persona |
| `role-templates.ts` | the new role |
| `role-templates.test.ts` | Larkspur's role count 6 → 7, the only existing test number changed |
| `contracts/index.ts` | the new `sales` contracts |
| `fixtures/handlers.ts` | handler registration |
| `prototype/routes.tsx` | one route-module hook |
| `i18n/resources.ts` | the `sales` namespace |
| `LeadWorkspace.tsx` | one cross-link component |
| `tests/support/fixtures.ts` | the new persona id |
| `screen-register.csv`, `register.generated.ts` | Agent B's five rows only |

Not touched: `crm.ts`, `crm-handlers.ts`, `demo-store.ts`, `crm.json`, `common.json`, `nav.json`.

**WebKit test note.** In WebKit, filling the searchable picker programmatically and then clicking leaves the picker open with nothing selected; real typing followed by a click works. This is the likely cause of the known S.2a WebKit intermittent. The E.1 smoke test now types key by key.

## 12. Integration readiness

Ready for review, and for Wave 1 integration once E.0 is accepted. The branch merges onto `373d0cf`. After E.0 lands, the remaining steps are the swaps and decisions above, then the full regression.

At hand-off the lock was released, the previews were stopped and the working tree was clean. **STOPPED for review.**
