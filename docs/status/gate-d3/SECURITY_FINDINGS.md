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

## 1a. Found in the independent review of `85f7eb7` (Issue #9) and closed

| # | Finding | Risk | Closed by |
|---|---|---|---|
| S7 (P0) | Anonymous poll results checked D-47 on each grouping's total only, then published exact counts for every option (a 2–1 split; a block with one answer for an option); site − block and adjacent blocks could reconstruct small counts | a resident's anonymous answer can be worked out | whole-breakdown suppression when any option or its complement is 1 or 2; blocks only when every derivable difference is safe; results recomputed from frozen answers on every read; the office sees no more for anonymous polls (vectors: 15; API: 4 tests; `d3.spec`) |
| S8 (P1) | An open report kept an expired message visible to every member of the group | retention extended for residents by a moderation event | members see only what the retention period allows; the report queue (`chat.moderate`) alone keeps the reported text as evidence while the report is open; once decided it is not shown again (API: 6 tests; `d3.spec`) |
| S9 | Named polls showed the office who answered what, but residents were only told in small print | answers given without clear consent | a warning and an "I understand" box before answering; the server refuses a named answer without it; only `polls.manage` sees the roster (API, `d3.spec`) |

## 1b. Found in the review of the Issue #9 closure (Issue #10) and closed

| # | Finding | Risk | Closed by |
|---|---|---|---|
| S10 (P0) | The Issue #9 block rule was checked by trying every subset of shown blocks with a 32-bit mask (`mask < 1 << set.length`). From 31 candidate blocks `1 << n` wraps (`1 << 32` is 1), so nothing was checked and every safe block was shown. With 33 blocks (32 at 3–3, X at 2–1) the audience minus the 32 shown blocks is X: one household's answer. Below 31 blocks the check grew as 2^n | an anonymous answer can be worked out in a large society; a large poll could freeze the page | no subset enumeration: every shown block and the undisclosed remainder (all hidden blocks together) must be safe, which by the closure lemma makes every computable group safe; at most 2k + 2 blocks returned to the remainder, O(n log n + n·k²) ([report §10](GATE_D3_REPORT.md#10-issue-10-security-closure)). Vectors: 37 (the counterexample, 20 to 128 blocks); 5,000 random polls attacked by enumerating every set of shown blocks; 20,000 lemma pairs; societies of 100 to 10,000 blocks; API: 4 tests; `d3.spec`: 128 blocks in both apps |
| S11 | Found by our own random test of the old code: when every block was shown it skipped the remainder, so households the audience counted outside any block were never checked; a group of 4 households was shown to have given no answer | non-participation of a small group disclosed (only with an audience that does not add up, which the demo's own data never has) | the remainder is always checked, households included; an audience that is not exactly the sum of its blocks is refused |
| S12 | Stored answers were trusted as they were: a negative, fractional or non-numeric count, or an answer for an option the poll does not have, would have been shown or summed | a corrupted or crafted record changes what residents see | inputs that cannot be real fail closed: nothing is shown (`unavailable`, with a plain explanation), for residents and the office (vectors: 5; API) |

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
| Retention: closed until set; expired messages leave every conversation (members get no holds); an open report keeps the text as evidence for moderators only; decided reports past the period show no text | `needsRetention`, `readable`, `reportView` | API (6 tests for Issue #9); `d3.spec` |
| Moderators see only reported messages; reporters never named | reports queue returns the reported message only; reporters as a count | API (`JSON` of the queue contains no party ids or names of reporters) |
| No debt, login or contact leak to residents | resident payloads carry names only (no flat codes in chat, no phone without consent, no balances) | API (`not.toMatch(/pty_anr|usr_anr|@example|A-1\d\d|balance/)`) |
| Poll privacy (D-47, Issues #9 and #10): no running tally; anonymous answers unlinkable; a grouping shown only with 3 answers and 5 households; its breakdown only if every option count and complement is 0 or at least 3 (otherwise the turnout only, never a partly masked breakdown); blocks only if each shown block and the undisclosed remainder are safe (no subset enumeration, no block limit); answers that cannot be real fail closed; computed from frozen answers on every read | `safeBreakdown`, `safeRemainder`, `pollResults` (`polls.ts`), `resultsOf` | vectors (37 cases); random attack (5,000 polls) and lemma (20,000 pairs); large societies (to 10,000 blocks); API; `d3.spec` |
| Notices independent of both add-ons (D-49) | notices handlers need `residents`/`resident_portal` only | API and E2E with both add-ons withdrawn |
| No new tenant gets an add-on automatically | catalogue: `includedIn: []`; presets unchanged | `platform.test.ts`, `tenant-access.test.ts` (Shalimar's plan lists both unlicensed) |
| The demo's licence override can only remove | `demoAccessFor` filters grants from a fixed list | code review; E2E uses it only to withdraw |

## 3. Residual risks (prototype)

- Everything is enforced in an in-browser mock server: a real backend must re-implement each rule server-side (Gate H). The sender key is a hash, not a secret; real systems need server-side opaque ids.
- Offline devices: a device that was offline keeps what it downloaded until it reconnects (D-25 (3)); remote wipe is never promised.
- Free text (messages, reports, provider descriptions) is shown as text (React escapes it); no rich text or links are rendered.
- Retention legal review (D-25 (5)) remains a specialist decision; the demo's 365 days is not a recommendation. The evidence hold lasts while a report is open and has no legal-hold workflow, consent record or expiry of its own (prototype).
- Poll results: a unanimous result (every respondent chose one option, at least 3 of them) is shown; it says nothing about who answered, which residents never learn in an anonymous poll. Owner to confirm.
- The minimum counts follow D-47 (3 answers, 5 households); a society may raise them, never lower them.
- Poll blocks (Issue #10): what a reader can still learn, by design:
  - which blocks are hidden; that only says some hidden block would have been unsafe alone, never its figures, which stay inside a safe remainder;
  - ranges from what they already know (for example a hidden block's household count), never an exact small count;
  - nothing across polls is protected: two polls with overlapping audiences can still be compared (D-47 is per result; not in scope);
  - more blocks are hidden than strictly necessary in some polls: the returning step is greedy, not the fewest possible (safety does not depend on it).
