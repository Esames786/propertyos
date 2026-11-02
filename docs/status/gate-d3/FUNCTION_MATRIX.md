# Gate D.3: function matrix

The owner's development handoff (2 November 2026) asked to stabilise GPT's D.3 checkpoint, then finish the approved D.3 frontend scope on `feature/gate-d3-community-chat`. This matrix lists each requirement, where it is built and what checks it.

**Paths and names:**
- Paths are relative to the repository root.
- Office pages: `apps/backoffice/src/pages/society/community/`. Resident pages: `apps/customer-web/src/pages/community/`. Shared chat: `packages/ui/src/community/Chat.tsx`. Mock API: `packages/fixtures/src/community/`. Contracts: `packages/contracts/src/community.ts`.
- Screenshots: `docs/status/gate-d3/screenshots/<name>-<width>-<en|ur>.png`. Videos: `docs/status/gate-d3/video/*.webm`.
- Tests:
  - `api` is `packages/fixtures/src/community/community.api.test.ts` (33 tests through the fail-closed mock server, 10 of them for Issue #9);
  - `vectors` is `packages/fixtures/src/community/community.test.ts` (29 tests on `chat-membership.vectors.json` (14) and `polls.vectors.json` (15));
  - `policy` is `packages/fixtures/src/community/chat-policy.test.ts` (GPT's 9 policy tests, kept);
  - `d3.spec` is `tests/e2e/d3.spec.ts` (24 tests on production builds, axe inside);
  - `smoke` is `tests/smoke/d3.smoke.spec.ts` (Firefox and WebKit).

## 1. Stabilise the checkpoint

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 1.1 | Check out the D.3 branch at `1a7d340`; inspect every commit after `a54f594` | worktree `D:/laragon2/www/propertyos-d3`; report §2 | `git log` |
| 1.2 | Install from the lockfile; TypeScript, lint, i18n parity, unit/API | `npm ci`; `69dafef` | typecheck, ESLint, `check-i18n`, vitest (test-results) |
| 1.3 | Fix all errors without weakening a test | `69dafef` (an "unlicensed" test that ran licensed now refuses) | report §2 A1–A2 |
| 1.4 | D.2 workflows unaffected | — | full E2E (all gates) and the D.2 smoke (test-results) |
| 1.5 | Readonly contracts, handler registration, site/tenant isolation, effective dates, retention and deleted messages, licence enforcement, permissions, query states, translations, layouts, routes | report §2 A3–A9; `SECURITY_FINDINGS.md` | `api`, `vectors`, `d3.spec` |

## 2. Community chat

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 2.1 | Group navigation from facts (site, block, floor, committee, office team, custom) | `groups.ts`; `Chat.tsx` `GroupList` | `vectors` (14 cases); `api`; `d3.spec` ref 1; `a07` |
| 2.2 | Conversations; history from joining | `chat-handlers.ts` `readable`; `Chat.tsx` `Conversation` | `vectors`; `api`; `d3.spec`; `a08` |
| 2.3 | Send and read states; idempotent sends | `send`, `markRead`; "Sent", "New messages" | `api`; `d3.spec` |
| 2.4 | Unread indicators | `summaryOf`; group list badge; Community home card | `api`; `d3.spec` |
| 2.5 | Message reporting (CHAT-004) | `report`; `ReportDrawer` | `api`; `d3.spec`; `a09`; video |
| 2.6 | Moderation through reports only (remove, warn, dismiss) | `decideReport`; `ChatSettingsPage` Reports | `api`; `d3.spec`; `b05`; video |
| 2.7 | Removed and blocked messages as markers | `viewOf`; `MessageRow` | `api`; `d3.spec` |
| 2.8 | Accessible empty, loading and error states | `Chat.tsx` (not open, no groups, not a member, not in plan) | `d3.spec` axe; `d02` |
| 2.9 | Urdu/English direction | `bdi`, `dir="auto"` per message, `KeepWords` | `d3.spec` 320 px tests; `c04`, `c05` |
| 2.10 | Mobile composer | `Chat.tsx` composer; conversation first on phones | `d3.spec` keyboard walk; `c06` |
| 2.11 | Fictional-demo status | "Demo: messages are fictional…" on every chat page | `d3.spec` |
| 2.12 | Retention set by the society; chat closed until then; past the period a message leaves every chat (an open report keeps it only as evidence for moderators, Issue #9) | `needsRetention`, `readable`, `reportView`; Policy tab | `api`; `d3.spec` ref 2 and Issue #9; `b06`, `g01–g03` |
| 2.13 | Move-out revocation; offline writes re-checked | `membershipsOf`; `send` (`queuedAt`); offline demo | `vectors`; `api`; `d3.spec`; `e01–e03` |
| 2.14 | No direct messages (D-25) | `directMessages: false`; no DM route | `api`; policy page |
| 2.15 | Office groups: on/off, who posts, who is in it and why, custom groups | `ChatSettingsPage` | `api`; `d3.spec` ref 2; `b02–b04` |

## 3. Community hub

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 3.1 | Community overview (PORTAL-036) | `CommunityHomePage.tsx`; `GET /portal/community/home` | `api`; `d3.spec`; `a01` |
| 3.2 | Official notices integration; works without both add-ons (D-49) | notices summary → PORTAL-023/043 | `api`; `d3.spec` without add-ons; `d01–d04` |
| 3.3 | Relevant society services (local services tab) | Services tab | `d3.spec`; `a04` |
| 3.4 | Community resources | Resources tab; DOC-001 office page | `api`; `d3.spec`; `a06`, `b15–b16` |
| 3.5 | Connected navigation | resident menu "Community"; chat card; links to notices, issues; office menu items | `d3.spec` |

## 4. Local services directory (CMTY-001)

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 4.1 | Provider directory, category filter, search | `ServicesDirectoryPage`, Services tab | `api`; `d3.spec`; `a04`, `b07` |
| 4.2 | Office-created entries with consent | `POST /ops/community/services` | `api`; `d3.spec`; `b09` |
| 4.3 | Approval / rejection (independent vetting) | `vet`, `reject` | `api`; `d3.spec` |
| 4.4 | Residents see approved entries only | resident list filters `listed` | `api`; `d3.spec` |
| 4.5 | Validation and contextual navigation | field errors from the server; reports tab; drawer | `api`; `b08` |

## 5. Polls and surveys (CMTY-002, CMTY-004, PORTAL-039)

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 5.1 | Office poll creation; eligible audience | `PollsPages.tsx` editor; `readPoll`, `eligibility` | `api`; `d3.spec` ref 3; `b14` |
| 5.2 | Resident participation; one eligible vote per person or flat | `respond`; `AnswerDrawer` | `api`; `d3.spec`; `a03` |
| 5.3 | Voting deadlines | `closesOn`; `closeDue` | `api` |
| 5.4 | Results and privacy controls (no running tally, anonymous, D-47) | `pollOffice`, `pollResults` | `vectors` (8); `api`; `d3.spec`; `b11–b13` |
| 5.5 | Moderation and audit states (withdraw with reason; history) | `pollAction`; history list | `api`; `b13` |
| 5.6 | Nothing financially or legally binding (D-30) | "Informal poll…" on every poll screen | `d3.spec` |
| 5.7 | Marketplace disabled; SOS parked | feature never granted; no routes | register PLANNED; report §6 |

## 6. Security, design, register, evidence

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 6.1 | Tenant, site, legal-entity isolation; module and feature licensing; role permissions; verified occupancy; move-out; direct links; suspended organisations; retention; group history; moderators limited to reports | `SECURITY_FINDINGS.md` §2 | `api`, `vectors`, `d3.spec` |
| 6.2 | Chat and hub independent; notices without both | separate modules and gates | `api`; `d3.spec` |
| 6.3 | No add-on enabled automatically for existing tenants | presets unchanged; Al-Noor amendment only | `tenant-access.test.ts`, `platform.test.ts` |
| 6.4 | Desktop, tablet, 390 and 320 px; EN/UR; 100–200 % text; no clipping or toast overlay | shared kit; `KeepWords`; D.2 toast policy | `d3.spec` (axe at 1440/768/390, layout at 320 × 700 at 100/150/200 %, keyboard walks) |
| 6.5 | Dark mode, high contrast, reduced motion | design tokens only (no fixed colours), D.1 preferences | covered by tokens; manual check listed |
| 6.6 | Register reconciled; BUILT only when complete and tested | 13 rows adopted, 2 changed; PARTIAL where tabs or actions are missing | `register.spec` (437 / 353) |
| 6.7 | Screenshots, browser evidence, honest limitations | `screenshots/` (76), `video/` (2), `MANUAL_VERIFICATION.md` | evidence spec |

## 7. Issue #9 final closure

| # | Requirement | Where | Checked by |
|---|---|---|---|
| 7.1 | Anonymous polls never reveal one or two voters: option counts and complements, whole-breakdown suppression, no partial masking | `polls.ts` `safeBreakdown`, `pollResults` | `vectors` (15: 2–1, 5–1, zero-count) |
| 7.2 | Block results, site − block and adjacent-block differences protected | `pollResults` (every set of shown blocks) | `vectors` (several blocks, site − block, adjacent) |
| 7.3 | Published results protected too; repeated or varied reads reveal nothing more | results computed from frozen answers on every read (`resultsOf`) | `api` (legacy snapshot injected; repeated, other residents, extra filters) |
| 7.4 | Staff versus resident visibility | anonymous: office sees the same safe breakdown; named: office (`polls.manage`) sees counts and who answered; others refused | `api`; `d3.spec` |
| 7.5 | Turnout only when safe; suppression explained to users | `Results` (resident), `PollDetailPage` (office) | `d3.spec`; `f01`, `f02`, `b17` |
| 7.6 | Named polls: identifiability explained and agreed before answering | answer drawer warning and checkbox; `namedConsent` on the server | `api`; `d3.spec` |
| 7.7 | Expired messages leave resident and office conversations, even with an open report | `readable` (no holds for members) | `api`; `d3.spec` |
| 7.8 | Moderators review held evidence; nobody else can | report queue (`chat.moderate`), `evidenceHold` | `api`; `d3.spec`; `g01` |
| 7.9 | Closing a report never re-exposes an expired message; history keeps no text | `reportView` (`text: null` once decided) | `api`; `d3.spec`; `g03` |
| 7.10 | Removed messages: marker inside the period, gone after | `viewOf`, `readable` | `api` |
| 7.11 | Membership, move-out, tenant and site isolation preserved | unchanged | `api` (move-out with an open report; other site; other organisation) |
| 7.12 | Complete combined regression with retries off; dark mode and high contrast where testable | — | `test-results.md` §Issue #9; `d3.spec` dark/high-contrast tests |
