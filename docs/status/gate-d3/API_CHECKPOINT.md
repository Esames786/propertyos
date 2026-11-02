# Gate D.3 — Chat mock API checkpoint (not final gate approval)

> **Superseded.** GPT's interim note, kept as history. Its "not executed" caveats were resolved in `69dafef` (audit) and the D.3 commit; the gate's current state is in [`GATE_D3_REPORT.md`](GATE_D3_REPORT.md) and [`test-results.md`](test-results.md).

Branch: `feature/gate-d3-community-chat`. Baseline: accepted D.2 `a54f594`.

## Code delivered
- Site/block/floor smart groups from effective-dated occupant facts; new members cannot browse messages created before their current membership.
- Registered `/portal/chat/groups`, `/portal/chat/groups/:id/messages` (GET/POST), read receipts and user-initiated message reporting; `/ops/chat/groups`, `/ops/chat/policy` and moderator report/decision endpoints.
- Every resident request enters through verified resident_portal access and an active same-site community_chat grant. A group filter restricts membership further to current occupants; no private resident-to-resident DMs.
- Explicit tenant retention setup is mandatory before posting. Chat data is fictional browser demo state; sends are idempotent by client key. Moderators see reported messages only; decisions retain audit metadata.
- Tests written for unlicensed refusal, default-disabled retention, idempotent send, cross-block denial, moderation and signed-out rejection.

## Not claimed / remains
No browser UI or resident route yet, no production chat, messaging, push, background sync, attachment processing or privacy certification. These new API tests have **not** been run in the complete repository environment. The licence has not been granted to any tenant by default. Additional test execution and browser verification are mandatory.

No live VPS deployment, main branch merge, Laravel/database changes, Bingoo modification, SOS, marketplace or production backend.
