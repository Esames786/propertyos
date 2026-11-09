# Gate E.13: Connected workspaces and documents (Agent E report, Wave 1, provisional)

> The coordinator wrote this file from Agent E's hand-off and rerun addendum, because the harness does not let subagents write report files. The content is Agent E's. Full numbers are in [test-results.md](test-results.md); see also [CHECKPOINT.md](CHECKPOINT.md) and [MANUAL_VERIFICATION.md](MANUAL_VERIFICATION.md).

## 1. Agent and assignment

Agent E built Gate E.13, connected workspaces and documents: 11 screens on `373d0cf`. It merged neither Agent A's branch nor any other agent's.

## 2. Branch and SHAs

`feature/gate-e13-connected-workspaces`, pushed without force.

| Commit | What it is |
|---|---|
| `34864b8` | Code complete. Its code is as of `5313fe7`. |
| `a448d45` | Docs only: results of the final rerun on `34864b8` |

The commit that adds this report sits on top of `a448d45` and also contains no code.

## 3. Screens: 0 BUILT, 11 PARTIAL, 0 PLANNED

**PARTIAL (11):**

- GLOBAL-002 unified search
- GLOBAL-005 recent records
- GLOBAL-006 favourites
- HOME-002 my tasks
- HOME-004 work queue
- HOME-005 recent activity
- DOC-002 document preview
- DOC-003 upload drawer
- DOC-004 versions
- DOC-005 expiring documents
- DOC-006 templates and policies

Each row's columns are filled in, and `register:sync` has been run. On this branch the register has 449 rows and 362 distinct screens: 139 BUILT, 54 PARTIAL, 169 PLANNED.

**Why they are not BUILT:** E.0 is not yet accepted or integrated. E.0 provides the permissions, the personas, the scope, projection and idempotency helpers, and the edition-aware routes and nav. The owner decisions in section 11 are also open.

All 11 should become BUILT once E.0 is integrated, the provisional pieces are reconciled, and the integrated regression is green.

## 4. Features completed

### Record registry

Files: `packages/fixtures/src/developer/workspace/records.ts` and `registry.ts`.

- There is one provider per kind of record:
  - lead, party, unit, project, invoice;
  - society people, flats and invoices;
  - Rentals leases;
  - documents and templates.
- Every provider applies the same access rule as `GET /access/record`. An unknown id and a hidden id get the same 404.
- Rentals leases are read only through Rentals' own `/rentals/leases` endpoint, after its declared access check. This keeps the Integration §5.2 import boundary.
- CRM data is read only through existing exports.

### Universal search

- Results are grouped by kind of record and paged one kind at a time, with a filter by kind.
- Every result has a star for favourites.
- Deep links are debounced.
- Ctrl+K gains a "Search everywhere" action that shows the query as its description.

### Recent records and favourites

- The mock server keeps them per tenant partition, person, app and sign-in session (the conservative default for E-35). Each list holds at most 50 entries.
- Every read re-checks access for each entry, so revoked access hides it at once and no count reveals it.
- The shell records a visit for every `?record=`, lease or flat address. Practice mode records nothing.

### Tasks and work queue

- A provider registry covers:
  - follow-ups, site visits and unit holds;
  - document expiry, template approvals and returned drafts;
  - a society's own tasks and approvals.
- Every count opens its items.
- Filters: urgency, kind, owner, project and text.
- Each group shows 12 items and a "Show all" button.

### Recent activity

Lead history, documents and templates. Activity is filtered by the reader's access before it is sent (the Issue #16 pattern).

### Related records panel

Shows a record's related records and its documents, with a direct upload. It can be reused on other record pages.

### Documents

- A document inherits its linked record's access: the reader needs `document.view` and must be able to see the record.
- Search, with filters by kind, expiry, project and kind of record.
- Preview of any version: generated pages for seeded documents, and image, PDF or text for demo uploads.
- Versions never change once saved. Any two versions can be compared.
- Expiry warnings, and a real browser download.
- Uploads are demo-only:
  - The file stays in the browser's demo store.
  - Limits: 1 MB per file and a 4 MB total budget.
  - Type and size are checked in the browser and again by the server.
  - Upload keys are bound to the request (the Issue #16 P0-2 pattern), and each form submits once.

### Templates and policies

- A draft is approved, or returned with a reason, by a different person.
- Only one draft can be pending at a time.
- A template applies either organisation-wide or to one project.

### Interface

- Quick-navigation pills, breadcrumbs and contextual tabs.
- Actions specific to each kind of record, and a searchable record picker.
- Inline validation, loading skeletons, empty and error states, and toasts and announcements that state only what actually happened.

### Keyboard shortcuts

These are single keys. They work only on these pages, never while typing, and can be switched off.

| Key | Action |
|---|---|
| `/` | focus the search or filter field |
| `U` | upload |
| `F` | toggle the favourite |
| `N` | start a new template |

Each page lists them in a "Keyboard shortcuts" panel.

### Languages

English and Urdu text throughout.

## 5. Unit and API results

- **`npm test`, complete:** 1,720 / 1,720.
- **E.13 API tests:** 38 / 38 (`workspace.api.test.ts` 21, `documents.api.test.ts` 17).
- **Typecheck:** 0 errors.
- **Lint:** clean. This covers ESLint, logical CSS, and i18n parity on 11,375 keys.
- **Timeouts under load:** with all six agents running, some society and payroll API tests hit Vitest's 5 s timeout. An A/B run of `finance.api.test.ts` timed out the same way with the E.13 handlers unregistered, so the cause is machine load, not E.13.

## 6. End-to-end results

### Final run on HEAD `34864b8`

Setup: lock held 23:44:00–00:33:27Z, on AC with no sleep, previews on both loopbacks, 3 workers, retries off.

- **Chromium: 547 passed, 0 failed, 14 skipped,** in 44.5 min.
  - The 14 skipped tests are `stage1.evidence.spec.ts`, which skips itself by design.
  - axe: 1,642 scans, 0 violations. The E.13 spec ran 36 of them, with 0 violations.
- **Firefox + WebKit smoke: 77 / 78,** in 4.2 min. Firefox passed everything.
  - The one failure is WebKit `s2a.smoke.spec.ts:52` "a new guard", one of the two known intermittents.
  - Symptom: after "Security guard" is clicked, the option list stays open for 20 s (line 48).
  - Under the lock it failed 6 of 10 with `--repeat-each=10`, then 11 of 20 with `--repeat-each=20`.
  - A/B check: the untouched base `373d0cf`, built in this worktree and run minutes later on the same machine, ports and settings, also failed 11 of 20. All 28 failures have the same signature.
  - E.13 changes no HR, roster or combobox code, and `useRecordVisit` sends nothing on the HR page. This is a WebKit flake that predates E.13.
  - Agent B (E.1) observed that in WebKit, a programmatic fill followed by a click leaves the searchable picker open with nothing selected, while real typing then a click works. That is the likely cause.
- **Evidence:** the accepted `stage1` and `gate-b-final` evidence was restored. Two `gate-e13` upload-drawer PNGs at 1440 px were rewritten, but they look identical and differ by under 300 bytes, so they were not re-committed.

### First complete run (before `5313fe7`)

- Chromium: 546 passed, 1 failed.
- The failure was caused by E.13 and has since been fixed: in `access.spec.ts:28`, the new palette action had the same name ("Operations") as the screen. `5313fe7` fixed it, and the final run above confirms the fix.
- Firefox + WebKit smoke in that run: 78 / 78.

### E.13's own specs

- `tests/e2e/e13-workspaces.spec.ts`: 22 tests.
- `tests/smoke/e13.smoke.spec.ts`: 4 tests in each of Firefox and WebKit.
- `tests/evidence/gatee13.evidence.spec.ts`: 9 tests.

## 7. Permission and security tests

These are named in the API and E2E specs.

- **Scope:** the controller sees all Larkspur documents; the Heights clerk sees Heights only.
- **Unknown and hidden ids** get identical answers on every route: resolve, related, documents, versions, templates and upload.
- **Narrow versus full view:** serialized responses are compared across every endpoint.
  - A Heights-only reader gets no Gardens id, name, file name, version, note or count.
  - The full reader still sees the legitimate history.
- **Plaza drawing:** nobody can see it, because inventory is not licensed on Plaza.
- **Another tenant's ids** return 404.
- **Without `document.view`:** the API refuses, and the screens say "not part of your role".
- **The resident app** cannot use the workspace.
- **Revocation** (API, E2E and evidence runs):
  - Narrowing a person's sites hides their documents, favourites, recent records and queue items at once. They return when access is restored.
  - Withdrawing the Rentals add-on hides saved leases.
- **Favourites** are per person (Bilal never sees Nadia's lists), and a new sign-in session starts empty.
- **Bound idempotency:** the same request replays. Reusing a key with a different input, target or person gets 409.
- **Validation:** title, kind, type, size, a path inside the file name, expiry, kind of record, and the storage budget. After every refusal the stored state is byte-identical.
- **Templates:** the person who approves must differ from the maker, only one draft can be pending, and returning a draft needs a reason.
- **Tasks:** Bilal's tasks are his own, and the work queue follows the header's project switcher.

## 8. Mutation checks

**18 of 18 caught.** Each file was restored and SHA-checked byte-identical.

The mutants cover:

- document access inherited from the record, for single documents and lists;
- activity projection, template visibility and site scope;
- partitioning, re-checking access after revocation, and session binding;
- identical 404s for unknown and hidden ids;
- both idempotency bindings;
- maker ≠ checker, and upload authority;
- the workspace being office-app-only;
- ownership of "my tasks", and one pending draft at a time;
- the expiry window, and hidden search hits.

The expiry-window mutant (M17) survived the first pass. The expiry test was strengthened, and M17 is now caught.

## 9. Accessibility

- **axe:** 0 violations in the complete run. The E.13 scans cover 1440 px in EN and UR including the drawer, and dark mode at 390 px.
- **Urdu** is right-to-left. References, file names and sizes stay left-to-right.
- **320 px with 200 % text, EN and UR:** no layout problems and no sideways scroll. Keyboard walks find nothing hidden under the header or bottom bar.
- **Focus** is visible and follows the existing focus rule.
- **Shortcuts** can be switched off (WCAG 2.1.4).
- **Still open:** screen-reader and real-device checks (NVDA, VoiceOver). `MANUAL_VERIFICATION.md` has the checklist.

## 10. Screenshots

There are 101 PNGs in `screenshots/`, about 31 MB. They cover:

- every screen at 1440 and 390 px, in EN and UR;
- 320 px with 200 % text (`…-200pct-320-en/ur`);
- dark mode at 390 px (`…-dark-390-en/ur`);
- the upload drawer, including its error state;
- who sees what, and revocation before and after.

Every width matches its file name (checked with `png-widths.cjs`).

Agent E reviewed a representative sample, not all 101:

- search, 1440 px, EN;
- a document, 1440 px, UR;
- a template, 1440 px, EN;
- the related tab, EN;
- favourites and the drawer, 320 px with 200 % text, UR;
- the work queue, 390 px, EN.

In full-page phone shots the fixed bottom bar appears in the middle of the page. That is how full-page capture handles fixed elements.

## 11. Open dependencies

### Owner decisions

- **E-07 (permissions):** four provisional permissions, all mapped to core: `document.view` (the register's name), `document.upload`, `document_template.manage` and `document_template.approve`.
- **E-06 (who handles documents at Larkspur):** no existing person was given a new permission. Instead there are two new fictional Larkspur roles and personas:
  - Tehmina Durrani, `lsp_doc_controller`: all projects; approves templates.
  - Haroon Qadri, `lsp_records_clerk`: Heights only; uploads and drafts.
  - Because of these, the role-count constant in `role-templates.test.ts` changed: Larkspur now has 8 roles.
- **E-35:** favourites and recent records are bound to the sign-in session, and cleared when the person signs out or switches identity. The page says so.
- **Links to planned screens:** developer parties, units and invoices link to Customer 360, Unit 360 and the invoice workspace, which are still planned screens for developers.

### E.0 pieces to swap in

- The module-local helpers in `developer/workspace/common.ts` and `records.ts`: `replayOf`/`remember`, `projectAllows` and `orgWide`.
- The write rules per kind of record: CRM writes still check `lead.view` (plan F-3).
- Route and nav integration for these screens.

### Integration hooks for B, C and D

- Add a `RecordProvider` to `PROVIDERS` in `registry.ts`, and its kind to `WORKSPACE_RECORD_TYPES`:
  - E.1: opportunities and visits;
  - E.2: projects, units and storage, replacing the two core providers;
  - E.7: accounts and journals.
- Add task kinds in `tasks.ts` and activity sources in `activity.ts`.
- Put `<RelatedRecords recordId=…/>` and the favourite button on their record pages.

### Shared-file touches

Each change is additive and marked "Gate E.13 (provisional…)".

| File | Change |
|---|---|
| `contracts/src/permissions.ts` | 4 permissions |
| `contracts/src/access.ts` | module mapping |
| `contracts/src/persona.ts` | 2 persona ids |
| `contracts/src/index.ts` | 2 exports |
| `fixtures/src/role-templates.ts` | 2 Larkspur roles |
| `fixtures/src/people.ts` | 2 personas |
| `fixtures/src/role-templates.test.ts` | count constant |
| `fixtures/src/handlers.ts` | handler registration |
| `apps/backoffice/src/prototype/routes.tsx` | one hook into the new `prototype/routes.e13.tsx` |
| `ShellLayout.tsx` | hook that records visits to records |
| `packages/ui/src/command/CommandPalette.tsx` | "Search everywhere" action |
| `i18n/src/resources.ts` | new `documents` namespace |
| `workspace.json`, EN and UR | `hub` block and 4 permission labels |
| `docs/ui/screen-register.csv`, `register.generated.ts` | E.13's 11 rows |

### Machine

The laptop slept from 19:40 to 21:14 PKT on 8 Nov with an empty battery. No complete browser run was made on battery.

## 12. Integration readiness

Ready for an isolated Wave 1 integration once E.0 is accepted.

- The branch merges against `373d0cf` without touching other agents' areas, and the shared-file hunks above are additive.
- Expect overlaps with E.0's permissions, personas and route modules in `permissions.ts`, `people.ts`, `role-templates.ts` and `routes.tsx`.
- Re-run the full regression after integration before the 11 rows move to BUILT.

At hand-off the lock was released, the previews were stopped and the working tree was clean. **STOPPED for review.**
