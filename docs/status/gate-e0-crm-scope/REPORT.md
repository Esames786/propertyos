# Gate E.0 — Independent CRM Lead Scope Hardening (F-2)

**Status: IMPLEMENTED, NOT TESTED, NOT ACCEPTED.**
**Branch:** `feature/gate-e0-crm-scope-gpt`
**Base:** `ae3b3a1` (accepted Gate S.3), deliberately separate from `integration/s3-b1-b2` and `main`.
**Tracking:** Issue #22.

## Source change

`packages/fixtures/src/crm-handlers.ts` `findLead` used to return `forbidden` (403) for a known lead outside the current persona's authorized project or header filter, but `not_found` (404) for a non-existent lead. Now an out-of-project record returns the same `not_found` as an unknown ID. This affects GET lead 360 and the existing POST lead activity, status, follow-up, visit scheduling and hold paths that call `findLead`. The route gate's separate lack-of-permission refusal remains in place.

## Tests added (not run by GPT)

`packages/fixtures/src/crm-gate-e0-scope.test.ts` contains four tests: (1) visible in-project vs hidden/unknown GET; (2) hidden-vs-unknown POST activity/status/follow-up with no mutations; (3) scheduling and holding a visible unit against hidden/unknown leads; (4) full-project manager access and sales header filter. All use existing fictional Larkspur fixtures and compare refusal fields excluding request-specific correlation IDs.

## Verification and limitations

GitHub source diff and branch ancestry verified. **GPT has not executed TypeScript, Vitest, Playwright, browser evidence, lint, mutation checks or security fuzzing.** This is a **narrow F-2 correction only**, not Gate E.0 foundation acceptance, not an E.1 screen build, and not authorization for the remaining 117 Gate E screens. No permissions/roles/register/financial code changed.

## Required next review

1. After the accepted combined integration is finished, reproduce F-2 on its own base if desired, then transplant this branch onto the integration head in a new isolated branch/worktree. Never merge it into an unreviewed integration.
2. Run `npx tsc -p tsconfig.json --noEmit`, `npm run lint`, `npx vitest run` including `crm-gate-e0-scope.test.ts`, and CRM + historic security browser specs with retries OFF. Include API tests for revoked permissions, cross-tenant IDs, and a mutation of the `notFound` guard if missing. No weakening of existing assertions.
3. Fix any issues on this branch, push evidence, and STOP for GPT/owner review. Only then accept as an E.0 sub-slice.

No `main` merge, VPS, Bingoo, Laravel/backend, real payment rails, SOS, Issue #13, Nizam private materials or `PROJECT_HANDOFF.md` edits.
