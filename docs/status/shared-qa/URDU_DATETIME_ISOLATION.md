# Parallel frontend QA — Urdu DateTime and ranges

Independent branch: `feature/qa-urdu-datetime-isolation` (branched from S.2a `95d70d0`, **not** merged). S.2a Issue #12 remains Claude's responsibility.

## Changes
- Read-only DateTime output now uses an isolated `<bdi dir="auto">` inside semantic `<time>`. This does **not** touch editable fields, so the previously documented empty-Urdu-input caret regression is avoided.
- New `DateTimeRange` takes start and end ISO instants; displays two isolated semantic times and a separately labelled separator in their intended reading order. `inline-flex flex-wrap max-w-full` permits long labels to reflow at mobile/200% scaling.
- React DOM regression vectors verify valid `datetime` attributes, isolation and reflow classes. Existing DateTime tests cover absolute, calendar and relative timestamps.

**Verification status:** committed source and test cases only. No workspace checkout, typecheck, Vitest, axe or real Urdu screenshot execution in this session. Treat as QA candidate requiring explicit manual 320px/200% EN/UR visual checks, cross-browser smoke and full regression prior to *any* merge. Do not cherry-pick into Claude's S.2a closure without separate review.

### Critical requirement
This is a renderer primitive, not an automatic whole-app correction. Existing screens containing plain concatenated date strings still require a usage audit and explicit integration. It does not alter backend or financial/staff workflows.

## No-touch
`main`, integration, live preview, VPS, Bingoo, Laravel and databases unchanged. No payroll or Rentals implementation.
