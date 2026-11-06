# Gate S.3 manual verification

Automated checks (axe, layout, keyboard walk) cover only part of accessibility. These checks need a person; **none has been done yet**. No WCAG conformance is claimed.

| # | Check | Where | Status |
|---|---|---|---|
| 1 | NVDA + Firefox: the leases list (filters announced with counts, KPI tiles read as one link each) | `/backoffice/rentals` | Open |
| 2 | NVDA: the new-lease wizard (step progress announced, field problems read on their step) | `/backoffice/rentals/leases/new` | Open |
| 3 | NVDA: Lease 360 tabs and the renewal / early-end / authority drawers (focus moves in and returns) | `/backoffice/rentals/leases/lse_rb_0001` | Open |
| 4 | VoiceOver iOS (Safari): the landlord view and the statement drawer, Urdu | `/customer/portal/rentals` | Open |
| 5 | TalkBack Android: the landlord view, English | `/customer/portal/rentals` | Open |
| 6 | Real phone at 200 % system text: rent roll and owner statement | office app | Open |
| 7 | Print / save as PDF of an owner statement and of the landlord's statement drawer: readable, labelled "Sample" and "fictional" | both apps | Open |
| 8 | Urdu proofreading of the `rentals` namespace by a native speaker | both apps | Open |
| 9 | Owner wording review: "Approved demand — not invoiced", "Not settled — no evidence", "Approved instruction — not sent" | all rentals screens | Open |
| 10 | Issue #17 closure: NVDA + Firefox, the owner statement as a reader who may not issue it (the reason is read where the Issue control would be; nothing focusable is missing) | `/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10` as Sadia Rauf | Open |
| 11 | Issue #17 closure: VoiceOver iOS, Urdu, the partial landlord view ("Partial statement" read with its statement; the drawer's notice read before the lines) | `/customer/portal/rentals` as Tahira Rehman with the demo site scope set to Riverbend Heights | Open |
| 12 | Owner wording review of the closure: "Partial statement", "Payout lines are left out", "Only the client money accounts officer issues statements to owners" | both apps | Open |
