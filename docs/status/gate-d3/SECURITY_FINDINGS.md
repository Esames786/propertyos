# Gate D.3: security and privacy findings

What was checked, what was found and what enforces each rule. Prototype scope: the rules live in the typed mock server (`packages/fixtures/src/community/`), which the backend must reproduce at Gate H. "API" = `community.api.test.ts`; "vectors" = `community.test.ts` over `chat-membership.vectors.json` and `polls.vectors.json`; "E2E" = `tests/e2e/d3.spec.ts`.

## 1. Findings in the checkpoint we continued (`1a7d340`) and how they were closed

| # | Finding | Risk | Closed by |
|---|---|---|---|
| S1 | The test meant to prove an unlicensed organisation is refused ran with the licence on; the refusal was never exercised | a licence bypass would not have been caught | `69dafef`; API: chat and hub without `community_chat`/`community_hub`, without `resident_portal`, staff without the module |
| S2 | A moderator could decide on a report about their own message | conflict of interest | `separation_of_duties` for own report and own message (API) |
| S3 | Whoever added a directory entry could approve it | unvetted providers listed | independent vetting (API, E2E) |
| S4 | A provider's phone number was stored and shown without a consent record | personal data without consent (D-32) | consent recorded; without consent to show it the number is not stored (API, E2E) |
| S5 | A removed message vanished without a trace | moderation not visible, audit gap | marker for everyone, decision with note and history (API, E2E) |
| S6 | Chat timestamps were all the same instant | unread and retention arithmetic wrong (retention could expire nothing or everything) | zoned wall-clock stamps |

## 2. Access rules and where they are enforced

| Rule | Enforced in | Proven by |
|---|---|---|
| Tenant isolation: handlers read only the signed-in person's organisation; another organisation's resident is refused | transport partition + `residentOps` | API (Larkspur resident refused), existing `security.test.ts` |
| Site isolation: every add-on decision is for the flat's site (site-scoped modules) | `residentOps(ctx, { module, feature })`, `authorize(ctx, module, siteRecord(site))` | API; licensing vectors in `tenant-access.test.ts` |
| Rule R: `resident_portal` + `portal.use` + verified link in force, then the add-on for the same site and flat | transport `requires('resident_portal', 'portal.use')` + `residentOps` | API (each grant withdrawn alone closes chat and hub) |
| Module and feature licensing; marketplace never granted | `requires(module, permission, class, feature)`; office handlers check the feature | API (`feature_not_licensed` closes only that tab); E2E without the add-ons |
| Role permissions: `chat.use`, `chat.groups.manage`, `chat.moderate`, `directory.manage`, `polls.manage`, `resources.publish` | transport + handler | API (treasurer and guard refused; resident app on office routes refused) |
| Current verified occupancy; move-out revocation at once (reads, posts, read marks, offline sends) | `membershipsOf` from facts on every call | vectors; API; E2E (offline message refused after move-out) |
| History from joining; rejoining hides the gap | `since` per membership, `mayReadMessage` | vectors; API |
| Unauthorised direct links (another block, the committee, the office team) reveal nothing | `groupOf` → 404 for any group the reader is not in | API; E2E |
| Suspended organisations: chat and hub are paused (operational class), as D.2 | `requires(..., 'operational')` | transport rule (Gate B) |
| Retention: closed until set; expired messages hidden unless held by an open report | `needsRetention`, `mayReadMessage` | API |
| Moderators see only reported messages; reporters never named | reports queue returns the reported message only; reporters as a count | API (`JSON` of the queue contains no party ids or names of reporters) |
| No debt, login or contact leak to residents | resident payloads carry names only (no flat codes in chat, no phone without consent, no balances) | API (`not.toMatch(/pty_anr|usr_anr|@example|A-1\d\d|balance/)`) |
| Poll privacy (D-47): no running tally; anonymous answers unlinkable; results only for groupings that qualify, with differencing | `pollResults`, tally per block/option only | vectors (8 cases); API |
| Notices independent of both add-ons (D-49) | notices handlers need `residents`/`resident_portal` only | API and E2E with both add-ons withdrawn |
| No new tenant gets an add-on automatically | catalogue: `includedIn: []`; presets unchanged | `platform.test.ts`, `tenant-access.test.ts` (Shalimar's plan lists both unlicensed) |
| The demo's licence override can only remove | `demoAccessFor` filters grants from a fixed list | code review; E2E uses it only to withdraw |

## 3. Residual risks (prototype)

- Everything is enforced in an in-browser mock server: a real backend must re-implement each rule server-side (Gate H). The sender key is a hash, not a secret; real systems need server-side opaque ids.
- Offline devices: a device that was offline keeps what it downloaded until it reconnects (D-25 (3)); remote wipe is never promised.
- Free text (messages, reports, provider descriptions) is shown as text (React escapes it); no rich text or links are rendered.
- Retention legal review (D-25 (5)) and the D-47 interpretation for poll options remain owner/specialist decisions.
