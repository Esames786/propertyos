# Manual verification still outstanding: Gate S.1 (with Gates B, C.1, C.2 and D.1)

**Status: not yet performed.**

Automated checks pass (see [`test-results.md`](test-results.md)):
- axe-core on every S.1 screen, tab and address-opened drawer in English and Urdu at 1440, 768 and 390 px, and on every open drawer inside the journeys (1440 px, English);
- no sideways scroll at 390, 768 and 1440 px, and at 320 px with 200 % text, on every S.1 screen;
- keyboard and pointer paths through every S.1 form in the E2E suite (React Aria selects, checkboxes, drawers and alert dialogs).

These checks are **not a WCAG certification**. The checks below need a person. The earlier gates' outstanding items stay open in [`../gate-d1/MANUAL_VERIFICATION.md`](../gate-d1/MANUAL_VERIFICATION.md) and [`../gate-c2/MANUAL_VERIFICATION.md`](../gate-c2/MANUAL_VERIFICATION.md).

| Item | Scope | Status | Owner |
|------|-------|--------|-------|
| NVDA, S.1 flows F1–F12 (below) | office app; resident payment history | not performed | needs a person running NVDA |
| VoiceOver (iOS), F3, F5, F12 | office app on an iPhone (the committee and the building manager use phones) | not performed | needs an iPhone |
| Real Android phone, F1, F3, F5 | Chrome on Android, EN and UR, text size 150 % and 200 % | not performed | needs a device |
| Printing: dues notices, print pack, clearance certificate | a real printer or "Save as PDF" (the browser's print is the only PDF path) | not performed | needs a person |
| Windows High Contrast (forced colours) on the cashbook and the approval workspace | Edge on Windows | not performed | needs a person |
| Urdu wording review by a native finance reader | `packages/i18n/locales/ur-PK/finance.json`, `governance.json` | not performed | needs a person |

## Set-up

- Production builds, as in Gate D.1: `npm run build -w @repo/<app> && npm run preview -w @repo/<app>` for `backoffice` (5173), `customer-web` (5174) and `platform-hq` (5175), on the same host name. Beside another checkout, set `E2E_PORT_OFFSET=100` for the tests, or build with `VITE_OFFICE_ORIGIN` / `VITE_CUSTOMER_ORIGIN` and preview on 5273–5275.
- Office: `/backoffice/get-started` → *Explore the society demo* (*Payments arriving*). People: **Saba Javed** (accounts officer), **Ayesha Malik** (treasurer), **Rabia Hashmi** (general secretary), **Imran Qureshi** (building manager), **Shahid** (guard).

## S.1 flows

| # | Flow | Steps | Expected |
|---|------|-------|----------|
| F1 | Society finance | Ayesha: Society finance | **Ladder:** four links, each read with its label, amount and why it differs. **Figures:** each reads its amount in full (not only the short form) and opens its records. |
| F2 | Cashbook | Society finance → Open the cashbook | **Filters:** the account and month selects, then the category pills (a radio group). **Lines:** a table in a labelled scroll region; each line reads its source, evidence, money in or out and balance. **Pending:** read apart, and never in the balance. |
| F3 | Cash voucher | Saba: Cashbook → New cash voucher | **Drawer:** a dialog with its title; the searchable selects announce their options; the evidence notice is read. **After saving:** the approval panel reads who may decide and why Saba may not. |
| F4 | Deposit | Imran: Deposits and transfers → Prepare | **Instruction:** "Approved instruction — not sent" is read as a status, not as success. **Legs:** each leg reads what will settle it (slip and witness, or a statement line). |
| F5 | Bulk collection | Saba: Office collections → New collection | **Candidates:** a labelled search; each result's *Cash* and *Cheque* buttons name the flat. **Batch:** problems are announced; *You collected this* is read to Saba after submitting. |
| F6 | Confirm a batch | Ayesha: open the submitted batch | **Count:** the field is labelled; a difference is announced. **After confirming:** cash lines read their receipt numbers; the cheque reads "Cheque received — not a receipt of payment". |
| F7 | Cheque | Office collections → Cheques → a cheque | **Candidates:** each statement line reads what matches and what does not; *Clear* is available only on a full match. |
| F8 | Month close | Cashbook → Close the month | **Checklist:** each check reads its outcome in words (passed, blocking, warning), its count and amount, and links to its records. **Close:** an alert dialog stating the effect. **Reopen:** the reason field and the approval panel. |
| F9 | Approvals | Ayesha: Approvals | **Inbox:** tabs; each request reads its subject, amount, requester and state. **Approval 360:** the rule and version, the eligible people and the reason you cannot decide are read before the decision button. |
| F10 | Policy and delegation | Rabia: Approval policies → Draft a new version; Ayesha: Delegation | **Draft:** each rule's selects and checkboxes are labelled. **Delegation:** subjects are checkboxes; dates are labelled with their format. |
| F11 | Committee | Rabia: Committee | **Tabs:** terms, offices and authority, meetings, decisions. **Forms:** the attendees hint (names separated by commas) is read with the field. |
| F12 | Reminders and printing | Saba: Reminders → Send due reminders now; a billing run → Print pack | **Preview:** each skipped payer reads the reason in words; quiet hours are announced. **Print pack:** the count of documents and invoices is read; the documents carry "Demo document, fictional data". |
