# Gate D.3: Community engagement (Al-Noor Residency)

**Status: built, frontend only; final closure for Issue #9 done; stopped for owner and GPT final review.**
- **Branch:** `feature/gate-d3-community-chat`, continuing GPT's checkpoint `1a7d340` (eight commits on the accepted D.2 closure `a54f594`). On top:
  - `69dafef` makes GPT's checkpoint compile, lint and pass, unchanged otherwise ([§2](#2-audit-of-gpts-checkpoint-1a7d340));
  - `85f7eb7` completes the gate (reviewed in Issue #9: functionality provisionally accepted);
  - the closure commit makes the two privacy corrections Issue #9 asked for ([§9](#9-issue-9-final-closure)).
- **Authorisation and sources:**
  - the owner's development handoff of 2 November 2026;
  - V3.2 at `0e57604` (`docs/blueprint/v3.2/*` on `docs/nizam-v3.2-scope-review`): execution plan §D.3, owner decisions D-21, D-25, D-30, D-31, D-32, D-38, D-47 and D-49, and the D.3 register delta (13 new rows, 2 changed).
- **Not done, as instructed:**
  - no Laravel, database or production changes;
  - no live chat, push, SMS or messaging provider: chat is simulated and says so;
  - no marketplace (off until the owner decides D-31) and no SOS (parked);
  - nothing deployed to the preview; Bingoo untouched; no merge into `main`.
- **How it runs:** in the browser against the typed, fail-closed mock API.
- **Data:** fictional throughout. People's names come from the fictional Al-Noor register; providers are marked `(Demo)`; phone numbers are `+92 300 00001xx`.
- **Not claimed:**
  - WCAG conformance: automated checks pass, but the manual screen-reader and device checks are open in [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md);
  - that a removed message is erased from a device that is offline (D-25 (3)).

Further detail:
- every check's result: [`test-results.md`](test-results.md);
- requirement by requirement: [`FUNCTION_MATRIX.md`](FUNCTION_MATRIX.md);
- security and privacy: [`SECURITY_FINDINGS.md`](SECURITY_FINDINGS.md).

## 1. How to try it

`npm run dev` starts the office app (5173), the resident app (5174) and Platform HQ (5175). Both apps share the society demo in one browser. In the office app: `/backoffice/get-started` → **Explore the society demo**; in the resident app, sign in as **Kamran Siddiqui (A-101)**.

| Where | Who | What to look at |
|---|---|---|
| Resident app → **Community** (menu) | Kamran (A-101, owner, committee joint secretary) | The Community home: the latest official notices (these need only the resident app), the chat card with its unread count, and the tabs *Polls*, *Local services* and *Resources*. |
| Community → chat card | Kamran; **Sana Iqbal** (A-102, tenant) | Kamran's groups come from where he lives: the whole community, Block A, floor A-1, and the committee. Sana has no committee group. Inside a group:<br>• history starts on the day you joined;<br>• new messages are marked;<br>• send; report a message;<br>• block a neighbour (for you only);<br>• *About this group*: the rules, the retention period, mute. |
| Office → **Chat groups & reports** (`/backoffice/chat/settings`) | **Imran Qureshi**, building manager | **Smart groups:** on/off, who may post, *Who is in it* (names and why).<br>**Custom groups:** for example *Block A owners*.<br>**Reports:** only the reported message; remove, warn or dismiss with a note.<br>**Policy:** retention set by the society (no period presumed); versions. |
| Office → **Community chat** (`/backoffice/chat`) | Imran | The office's own groups: the whole community and the office team. Posts show *Office*. |
| Resident app → Community → **Polls** | Sana, Kamran, **Rabia Hashmi** (A-201) | Answer an informal poll (one per flat or per person; anonymous or named). Closed polls show results only once published, and only within the privacy thresholds. |
| Office → **Polls** (`/backoffice/community/polls`) | Imran | Draft → open → close → publish, or withdraw with a reason. While a poll is open, only the turnout shows. After it closes, the totals show, and for a named poll who answered what. |
| Office → **Local services** (`/backoffice/community/services`) | Imran, then Rabia (administrator) | Add a provider with a consent record. A colleague vets it before residents see it. Reports from residents; suspend. |
| Resident app → Community → **Local services** | Sana | Search and category filter. Contact numbers appear only with consent. Recommend (a count) and report a problem. |
| Office → **Documents for residents** (`/backoffice/doc/document-center`) | Imran | Publish a PDF (fictional) to an audience; withdraw with a reason. Residents see it under **Resources**. |
| Resident app → Community → chat, then **Simulate offline** | **Junaid Akhtar** (A-202) | Write while "offline"; the office records his move-out in another tab; **Back online**: the message is refused and his groups are gone. |

## 2. Audit of GPT's checkpoint `1a7d340`

GPT's eight commits had not been built or run. What we found:

| # | Finding | Severity | Done |
|---|---|---|---|
| A1 | 18 TypeScript errors in Platform HQ (the two new modules had no names) and one in a test; one lint error | blocks the build | names added in both languages (`69dafef`) |
| A2 | The "unlicensed" chat API test ran with the licence **on**, so the refusal it checked could not happen | test gave false assurance | fixed in `69dafef`; now `community.api.test.ts` covers chat, hub, `resident_portal` and staff refusals |
| A3 | Every chat message was stamped at noon of the demo's fixed date, so ordering and unread counts were wrong | functional | messages use the organisation's wall-clock stamp, as D.2 does |
| A4 | Group ids such as `block:bld_anr_a` were URL-encoded in API paths (`%3A`), so every block and floor conversation returned 404 (same pattern in our first build; caught by `d3.spec`) | functional | ids are plain `[\w:-]` in paths |
| A5 | No tenant held a `community_chat` or `community_hub` grant, so nothing was reachable in the demo; the pages were not in the register or the menus | functional | an explicit, dated, fictional amendment for Al-Noor only; register rows adopted; menus gated by module, feature and permission |
| A6 | A moderator-removed message disappeared silently; a moderator could decide on their own message | product/security | removed messages leave a marker; no self-decision (own report or own message) |
| A7 | The services directory let whoever added a provider approve it; no consent record; residents had to be occupants to see providers | product/privacy | independent vetting; consent recorded, and the number kept only with consent to show it; any verified resident of the site may look |
| A8 | Pages showed raw dates (`2026-10-26 12:00`), untranslated categories and English-only report and moderation text; hard-coded `text-white` | i18n/a11y | rebuilt on the shared kit, both languages, design tokens |
| A9 | `access.ts` and `smart-groups.ts` were tested but never used by the handlers | dead code | replaced by `groups.ts`, which the handlers use; their cases moved into `chat-membership.vectors.json` and the API test |

Nothing in GPT's design was reversed:
- two optional add-ons, dual entitlement (rule R);
- smart groups from occupancy, history from joining;
- retention set by the society before chat opens;
- idempotent sends, moderation by report;
- no DMs, marketplace off.

The code was completed, rebuilt where needed and tested.

## 3. What D.3 adds

### 3.1 Model (`packages/contracts/src/community.ts`; mock API `packages/fixtures/src/community/`)

- **Licensing (D-21, rule R):**
  - `community_chat` and `community_hub` are optional, site-scoped add-ons; no edition preset includes them;
  - hub features: `services_directory`, `polls`, `resources`; `marketplace` is never granted;
  - a resident screen needs `resident_portal` + `portal.use` with a verified link in force, then the add-on (and feature) for the same site and flat;
  - staff need the module, the feature and their permission;
  - Al-Noor holds both add-ons by an explicit fictional amendment from 21 October 2026; no other organisation changes.
- **Groups (`groups.ts`, D-25):** membership comes only from facts, re-read on every call:
  - the whole community, a block and a floor: current occupants, never the association's own flat;
  - the committee: terms in force;
  - the office team: staff with `chat.use`;
  - custom groups: an audience the office chose (site or blocks × owners, occupants, liable payers);
  - a member sees nothing written before they joined. A move-out ends every group that day. A left custom group can be joined again, without the history in between.
- **Chat (`chat-handlers.ts`):**
  - closed until the society sets a retention period (30–3,650 days, with its own legal check confirmed; versioned);
  - messages past the period leave every conversation; a reported one is kept only as evidence for moderators while the report is open (Issue #9, §9.2);
  - sends are idempotent by client key; a message written offline carries `queuedAt` and is re-authorised on arrival;
  - mute; block a resident (for the reader only; the office cannot be blocked);
  - reports: one per message, several reporters, never named;
  - moderators see only the reported message and remove, warn or dismiss with a note; the author is told in the app;
  - direct messages are off (D-25 (1)).
- **Local services (`hub-handlers.ts`, D-32):**
  - pending → listed (by someone other than whoever added it) / rejected; listed → suspended → listed again;
  - the contact number is kept only with consent to show it;
  - recommendations are a count; residents report problems;
  - suspending acts on open reports.
- **Polls (`hub-handlers.ts`, `polls.ts`, D-30, D-47):**
  - informal and labelled; one answer per person or per flat; anonymous or named; last day within 90 days;
  - no running tally: staff see turnout while open, totals after close, and who answered what only for named polls;
  - anonymous polls keep only counts per block and option;
  - results are computed from the frozen answers on every read; residents see nothing below 3 answers or 5 households, the turnout only when any option count (or its complement) is 1 or 2, and blocks only when every difference with the shown figures is safe (Issue #9, §9.1).
- **Resources (DOC-001 "Published to residents"):** a PDF (fictional) for an audience; withdraw with a reason; re-checked against the audience on every read.
- **Community home (PORTAL-036):** the notices summary (resident app only, D-49), the chat card when chat is licensed, community issues when licensed, and only the hub tabs the plan includes.

### 3.2 Screens

| Screen | Address | Register status |
|---|---|---|
| PORTAL-036 Community home | `/customer/portal/community?tab=` | PARTIAL (Committee, Staff on duty, Society accounts and Marketplace tabs not built) |
| PORTAL-031 Resident chat | `/customer/portal/chat` (`?group=`) | BUILT |
| PORTAL-032 Conversation (phone) | `/customer/portal/chat/:groupId` | BUILT (state) |
| PORTAL-039 Answer a poll | drawer on PORTAL-036 | BUILT (state) |
| CHAT-001 Chat inbox (office) | `/backoffice/chat` | PARTIAL (no replies or mentions) |
| CHAT-002 Conversation (office, phone) | `/backoffice/chat/:groupId` | BUILT (state) |
| CHAT-004 Report a message | drawer, both apps | BUILT (state) |
| CHAT-003 Chat groups and moderation | `/backoffice/chat/settings?tab=` | BUILT |
| CMTY-001 Local services directory | `/backoffice/community/services` | BUILT |
| CMTY-002 Polls and surveys | `/backoffice/community/polls` | BUILT |
| CMTY-004 Poll detail and results | `/backoffice/community/polls/:id` | BUILT (state) |
| DOC-001 Document centre | `/backoffice/doc/document-center` | PARTIAL (only "Published to residents"; the full centre is Gate E) |
| CMTY-003 Marketplace moderation, PORTAL-038 Listing | — | PLANNED (D-31) |

**Register (D-43):** the D.3 delta's 13 rows are adopted (7 screens, 6 states), and DOC-001 and PORTAL-015 are changed.
- Now: 437 rows, 353 distinct; 122 built, 35 partial, 196 planned.
- Before: 424 / 346; 118 / 32 / 196.
- All 321 V2.1 IDs and addresses are preserved.
- As in D.2, addresses are plain; the delta's `?status=`, `?category=` and `?tab=` are optional filters, noted in the rows.

## 4. Design and accessibility

- Limestone & Evergreen tokens throughout. One chat component serves both apps (`packages/ui/src/community/Chat.tsx`).
- **Wide screens** show the group list beside the conversation. **Phones** show one at a time; with a conversation open, the conversation comes first and the introduction waits.
- **Layout and Urdu text:**
  - names and short hyphenated words are kept whole (`KeepWords`: "A-104", "Al-Noor");
  - mixed Urdu and English text is isolated (`bdi`, `dir="auto"` on each message, never globally).
- **Keyboard and screen readers:**
  - the message log is a focusable live region around a list;
  - states use words and icons, never colour alone;
  - poll results are text first, the bar only repeats them.
- **Checked by machine (in `d3.spec`):**
  - 320 × 700 at 100, 150 and 200 % text in both languages: nothing clipped, spilled or broken mid-word;
  - keyboard walks: no focused control is hidden under the header or the bottom bar, and the last content sits above the bar;
  - toasts follow the D.2 overlay policy.

## 5. Decisions made in D.3

The owner and GPT ruled on these in Issue #9 (see [§9.3](#93-owner-rulings-applied)). All were confirmed as they stand except the poll rule, which is now stricter (§9.1).

1. **The demo's licence:**
   - Al-Noor gets both add-ons by a dated, explicit amendment (21 Oct 2026), with the hub features `services_directory`, `polls` and `resources`;
   - no preset includes them, and no other organisation gains them;
   - no rate-card price was invented for them.
2. **Who is in the smart groups:** current occupants only, as GPT proposed. Owners who live elsewhere and payers are reached through custom groups (for example *Block A owners*).
3. **Staff in chat:**
   - staff with `chat.use` are in the whole community and the office team, never a block or floor;
   - committee members with a staff sign-in are in the committee group in the office app too;
   - administrator and manager templates hold the chat, directory, poll and new `resources.publish` permissions; the licence still decides.
4. **Retention in the demo:**
   - seeded as set: 365 days, by the committee secretary on 21 October, so the demo opens;
   - the closed state is proven by the API tests and shown on the policy page when unset;
   - allowed range 30–3,650 days;
   - saving requires the society to confirm its own legal check.
5. **Moderation:**
   - actions are remove (marker for everyone), warn (in-app notice to the author) and dismiss, each with a note of at least 5 characters;
   - a moderator never decides on their own report or message.
6. **Blocking:** per reader; the blocked person is not told; office messages cannot be blocked.
7. **Offline:** a labelled demo control in the resident chat simulates being offline. Messages written then wait on the device, are re-authorised on reconnect, and the group's copy is removed if refused.
8. **Directory:** independent vetting (whoever adds does not list); without consent to show it, the number is not stored; rejecting or suspending needs 10 characters.
9. **Polls:**
   - D-47 was applied to each grouping's total answers and option counts were shown inside it. **Replaced in Issue #9 (§9.1):** small option counts suppress the whole breakdown;
   - staff see turnout while a poll is open;
   - a poll past its last day closes on the next read (the demo has no background jobs);
   - withdrawing needs a reason residents see.
10. **Resources:** PDF up to 10 MB (fictional: only name and size are kept); a new permission `resources.publish` under `community_hub`.
11. **Demo seam:**
    - a remove-only licence override (`demo:withdrawn-modules` in sessionStorage) lets tests and demos show the apps without the add-ons;
    - it can never grant anything, and the screens and the mock server use the same access.
12. **Navigation:**
    - resident app: Community is in the menu's Building group, and chat opens from the Community home;
    - the phone bar keeps Pay in the centre (D-25 (6): chat takes it only if the society chooses, and there is no setting for that yet);
    - office: five new items under Operations, each shown only when licensed and permitted.

## 6. Outstanding owner decisions

Issue #9 settled most of these (§9.3). Still open:
- the D-25 legal review of retention before production;
- the UX and privacy design of mentions and replies.

The table below is kept as it was at `85f7eb7`.

| Decision | Why it matters | Current behaviour |
|---|---|---|
| D-25 retention: legal review (still conditional) | the period and its exceptions | society-set, 30–3,650 days, review confirmation required; open reports keep evidence for moderators only (Issue #9) |
| D-31 marketplace | CMTY-003, PORTAL-038 | not built; feature never granted |
| D-38 society accounts on the Community home | resident-visible finance | tab not built |
| D-47 for polls: thresholds on totals or on each option | privacy of small option counts | ruled in Issue #9: option-level protection with whole-breakdown suppression (§9.1) |
| Mentions and replies in chat | needs a member list residents may see | not built (CHAT-001 PARTIAL) |
| Direct messages | D-25 (1) says off by default; no switch built | off, no switch |
| Chat in the phone bar's centre slot (D-25 (6)) | navigation | Pay stays centre |
| Committee and Staff on duty tabs | committee data (S.1) and rosters (S.2) | not built (PORTAL-036 PARTIAL) |
| Vendors link (SUP-002) from a provider | SUP-002 not built | no link |

## 7. Known limitations

- Simulated throughout:
  - no live delivery, push or background jobs;
  - "online" means the next request;
  - a poll closes and scheduled actions run on the next read.
- A removed or retention-expired message disappears from the server at once. A device that was offline keeps what it downloaded until it next connects (D-25 (3)); the demo shows that cache only while the simulated offline control is on.
- Resident direct messages, replies, mentions, attachments in chat, provider photos and reviews are not built.
- The demo's chat does not refresh by itself while a page is open: another app's change appears on the next action or reload (as in D.2).
- Urdu wording was written by us and needs a native reader's review (new namespace `community`: 554 keys).
- English typed into Urdu forms: the full stop shows at the start of the line while typing (shared fields, known since D.2; documented, not changed).

## 8. Evidence

- **Screenshots** (`screenshots/`, 76 after the Issue #9 closure):
  - `a01–a10`: resident screens at 1440 px English and 390 px Urdu;
  - `b01–b16`: office screens, the same two sizes;
  - `c01–c08`: 320 × 700 at 200 % Urdu, viewport captures with the fixed bars in place;
  - `d01–d04`: without the add-ons;
  - `e01–e03`: a move-out while offline;
  - `f01–f02`: poll results shown and withheld at 320 × 700 / 200 %, English and Urdu (Issue #9);
  - `g01–g03`: a reported message held as evidence past retention, and decided (Issue #9).
- **Videos** (`video/`):
  - `chat-report-and-moderation-desktop-en.webm`;
  - `informal-poll-to-results-desktop-en.webm`.
- **Results:** [`test-results.md`](test-results.md).

## 9. Issue #9 final closure

Issue #9 (the independent review of `85f7eb7`) accepted the functionality provisionally and asked for two privacy corrections and a clean, complete regression run. Both corrections are made as ruled; nothing else was redesigned.

### 9.1 Anonymous poll results (P0)

**Before:** D-47 was checked only on each grouping's total. Exact counts were then shown for every option. A 2–1 split could be published, and a block line could disclose an option chosen by one person.

**Now** (`packages/fixtures/src/community/polls.ts`, rule in [`SECURITY_FINDINGS.md`](SECURITY_FINDINGS.md)):
- **Nothing is shown** below 3 answers or 5 eligible households, not even the turnout.
- **Turnout only** when any option count (or the answers outside it) is 1 or 2.
  - The whole breakdown is withheld (`options: null`), with a plain explanation. There are no option counts, no percentages, no bars and no block lines.
  - No single cell is masked: a masked cell could be worked out from the total and the others (for example 6 − 5 = 1).
- **Blocks:** a block is shown only when the whole audience's breakdown is shown and the block's own breakdown is safe.
  - Every difference that can be worked out from the shown figures must be safe too: the audience minus any set of shown blocks. This covers site − block and adjacent blocks.
  - Blocks are dropped, smallest first, until it is. A one-block poll shows no block line.
- **Results are computed on every read** from the frozen answers, never from a stored snapshot.
  - A result stored before the rule cannot leak; a test injects an old exact snapshot and gets the withheld result.
  - Repeated reads, other residents in the audience and unrelated query parameters all get the same answer.
- **Staff:**
  - **Anonymous polls:** the office sees no more than residents do. Its totals are the same breakdown, or "withheld".
  - **Named polls** keep their consent model. The answer drawer says, before answering, that the office will see the name and answer, and the resident must tick that they understand (the server refuses without it). Only the office's poll managers (`polls.manage`) see who answered what; residents see the same privacy-safe results as for anonymous polls.
- **Seeded data:**
  - a fictional published anonymous poll split 5–1 (*Evening security patrol*) shows turnout only;
  - the 31-answer gym poll still shows its breakdown and both blocks.
- **New vectors:** `polls.vectors.json`, 15 cases (2–1, 5–1, one small option among blocks, site − block, adjacent blocks, zero-count options, the gym poll, raised thresholds).
- **API tests:**
  - the published 5–1 poll for residents and staff;
  - repeated and varied reads;
  - a stored legacy snapshot;
  - named-poll consent and roster access.

### 9.2 Retention and evidence holds (P1)

**Before:** an open report kept an expired message visible to every member of the group.

**Now** (`packages/fixtures/src/community/chat-handlers.ts`):
- **What members see:** what the retention period allows, and nothing older.
  - An expired message leaves resident and office conversations, group previews and reportable messages at the cutoff, whatever its reports.
  - A removed message keeps its marker while it is within the period, then goes too.
- **Evidence for moderators:**
  - a reported message past the period stays in the report queue (`chat.moderate` only), marked *Kept as evidence*, while the report is open;
  - once the report is decided, its text is not shown again, in the queue or anywhere else;
  - the decision, its note, the reporter count and the history remain, and no history entry holds message text.
- **Policy page:** counts only expired messages held as evidence. Its wording says plainly that the demo's 365 days is not a legal recommendation and that a real legal review is needed before production.
- **Unchanged:** group membership, move-out revocation (a reporter who moves out loses the group at once, while the report stays, unnamed) and tenant and site isolation.
- **API tests:**
  - expired message without a report, and with an open report;
  - the moderator's view, and residents and non-moderators refused;
  - a report dismissed after expiry, and one decided before it;
  - a removed message inside and outside the period;
  - a move-out with an open report;
  - another site and another organisation.
- **Browser test:** the same in both apps (`d3.spec`).
- **Limitation (prototype):** the evidence hold has no separate legal-hold workflow, consent record or expiry of its own; it lasts while the report is open. A production design needs the legal review D-25 (5) asks for.

### 9.3 Owner rulings applied

| Ruling (Issue #9) | Applied |
|---|---|
| D-31 marketplace off | unchanged: not built, feature never granted |
| D-38 no society accounts or other residents' balances on the Community home | unchanged: no such tab, nothing financial in community payloads |
| Direct messages off, no toggle | unchanged |
| Mentions and replies deferred | CHAT-001 stays PARTIAL |
| Smart groups: current occupants; others only in scoped custom groups | unchanged |
| Al-Noor licences: explicit fictional grants only | unchanged; presets and other organisations unchanged |
| 365 days is a demo setting, not legal advice | policy wording and this report say so |
| Directory: independent vetting and explicit contact consent | unchanged |
| Pay stays the phone's centre action | unchanged |
| PORTAL-036 and DOC-001 stay PARTIAL | unchanged (register: 437 rows, 353 distinct; 122 built, 35 partial, 196 planned) |
| SOS parked; no S.2 | unchanged |

### 9.4 Evidence of the closure

- **`f01`, `f02`:** poll results shown (gym) and withheld (5–1), at 320 × 700 with 200 % text, in English and Urdu.
- **`b17`:** the office's view of an anonymous withheld poll.
- **`g01`–`g03`:** an expired reported message held as evidence, the policy page's count, and the decided report with its text gone.
- **Tests and the complete run:** [`test-results.md`](test-results.md) §Issue #9:
  - complete combined regression **358 / 358** with retries off;
  - unit/API **1,308 / 1,308**;
  - Firefox and WebKit **28 / 28**;
  - **1,179 axe scans, 0 violations**.
