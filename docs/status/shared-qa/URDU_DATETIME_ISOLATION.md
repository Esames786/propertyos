# Shared DateTime bidi isolation — independent QA branch

This is an **unmerged, untested code checkpoint**, deliberately separated from Claude's active `feature/gate-s2a-society-staff` Issue #12 closure work.

- Target: `packages/ui/src/data/DateTime.tsx` only. Wrap rendered formatted calendar, absolute, and relative output in semantic `<bdi dir="auto">` within existing `<time>`; the original timestamp, calendar formatting, accessible value, title and text size remain unchanged.
- Rationale: in Urdu RTL pages, isolated embedded English-style time tokens (e.g. `7:00 AM`) should not reorder around their surrounding Urdu punctuation. Unlike using `dir=auto` on interactive **input fields**, a read-only `<bdi>` has no caret-placement issue.
- Added React DOM tests for timestamp preservation and isolation. **Tests not executed** (GitHub connector source write only, repository cannot be fetched into the local runtime).
- This does not guarantee composed multi-time ranges: independently isolated times still require directional punctuation/range layout as appropriate; explicitly test in Urdu browser screenshots before merge.
- No edits to production, shared live preview, Bingoo, HR API, financial system, payroll, main or integration branches.
