# Integration S.3 + B1 + Issue #21 + B2: manual verification still outstanding

**Status: not performed.** Nobody has run a screen reader, a real phone or a Windows contrast theme on the
integrated branch `integration/s3-b1-b2`. The automated checks in [`test-results.md`](test-results.md) (axe,
accessible-name assertions, ring pixels and contrast, `layoutProblems` at 320 px with 200 % text, Firefox and
WebKit smoke) show that the markup and the drawing are what a person needs. They are **not a screen-reader
pass and not a WCAG certification**.

This list is the open manual items of the four accepted branches, unchanged, plus two items the integration
adds (the Rentals tiles with a screen reader, and the Rentals controls' rings by eye). The source lists are
kept where they were reviewed: `docs/status/gate-s3/MANUAL_VERIFICATION.md`, `docs/status/ux-b1/B1_REPORT.md`
§7, `docs/status/ux-b2/MANUAL_VERIFICATION.md` and `docs/status/cn-idempotency/CHECKPOINT.md` §R11.

## Set-up

Production builds of this branch (`E2E_PORT_OFFSET` optional), the demo's business date Monday 26 October
2026. Riverbend Estate Managers (fictional) for Rentals: **Sadia Rauf** (portfolio manager, `rb_manager`),
**Usman Ghani** (client money accounts officer, `rb_accounts`), **Tahira Rehman** (landlord, resident app).
Al-Noor Residency for B1, Issue #21 and B2: **Ayesha** (treasurer), **Saba** (accounts), **Imran** (building
manager), **Kamran Siddiqui** (A-101, resident app). Switch the language in the header to repeat a step in Urdu.

## Added by the integration

| # | Check | Where | Expected | Status |
|---|---|---|---|---|
| INT-M1 | **Rentals KPI tiles with a screen reader** (NVDA + Firefox, NVDA + Chrome; VoiceOver macOS), English and Urdu | `/backoffice/rentals` as Sadia | Each tile is one link, read once as label, amount once, hint once: "Monthly rent under management, Rs 273,000.00, a contract figure, not money received, link"; "Rent due in October 2026, Rs 273,000.00, approved demand — not invoiced, not collected"; "Owner payable (settled money only), Rs 0.00. nothing is settled: no bank evidence exists here"; "Active leases, 4"; "Payout instructions pending, 0, prepared or approved — none is sent or paid". In Urdu the same order with the Urdu label and hint, and the Latin amount read as a number. Nothing is read twice; no description is read after the name. | Open |
| INT-M2 | The same tiles at 320 px with 200 % text (TalkBack Android, Urdu) | as INT-M1 on a phone | The same names. Known (pre-existing since S.3, F-INT-1): the owner-payable label is cut to two lines with "…" on screen, in English and in Urdu; the name is complete. | Open |
| INT-M3 | **Rentals keyboard rings by eye** (sighted keyboard user), 1440 px and a 390 px window in dark mode with high contrast, English and Urdu | leases (tiles, lease list), Lease 360 renewal drawer, owner statement (owner list, source links, Issue, its confirm dialog) as Usman, the landlord's statements and statement drawer as Tahira | One clear ring per stop; a source link that wraps onto two lines shows a ring around each line. At 320 px with 200 % text the confirm dialog's scrolling body hides part of the Cancel button's ring until scrolled (F-INT-3, the B2 N-B2-3 class). | Open |
| INT-M4 | **Urdu wording by a native reader: Issue #21's two strings** | the credit-note drawer on A-101's November bill (Ayesha), after a lost answer and after a changed retry | `billing:creditNote.keyReused` "اس فارم سے پہلے کی ایک کوشش دوسری تفصیلات کے ساتھ کریڈٹ نوٹ جاری کر چکی ہے، اس لیے یہ جاری نہیں ہوا۔ انوائس اب جیسی ہے ویسی دکھائی گئی ہے: دوسرا جاری کرنے سے پہلے اس کے کریڈٹ نوٹ دیکھ لیں۔" and `billing:creditNote.retrySame` "کوئی جواب نہیں ملا، اس لیے معلوم نہیں کہ کریڈٹ نوٹ جاری ہوا یا نہیں۔ کچھ بدلے بغیر “کریڈٹ نوٹ جاری کریں” دوبارہ دبائیں: اگر یہ جاری ہو چکا ہے تو آپ کو وہی کریڈٹ نوٹ دکھایا جائے گا، دوسرا کبھی نہیں۔" read naturally and say the same as the English. | Open |

## S.3 Rentals (from `docs/status/gate-s3/MANUAL_VERIFICATION.md`)

| # | Check | Where | Status |
|---|---|---|---|
| S3-1 | NVDA + Firefox: the leases list (filters announced with counts, KPI tiles read as one link each; now with B2's names, INT-M1) | `/backoffice/rentals` | Open |
| S3-2 | NVDA: the new-lease wizard (step progress announced, field problems read on their step) | `/backoffice/rentals/leases/new` | Open |
| S3-3 | NVDA: Lease 360 tabs and the renewal / early-end / authority drawers (focus moves in and returns) | `/backoffice/rentals/leases/lse_rb_0001` | Open |
| S3-4 | VoiceOver iOS (Safari): the landlord view and the statement drawer, Urdu | `/customer/portal/rentals` | Open |
| S3-5 | TalkBack Android: the landlord view, English | `/customer/portal/rentals` | Open |
| S3-6 | Real phone at 200 % system text: rent roll and owner statement | office app | Open |
| S3-7 | Print / save as PDF of an owner statement and of the landlord's statement drawer: readable, labelled "Sample" and "fictional" | both apps | Open |
| S3-8 | Urdu proofreading of the `rentals` namespace by a native speaker | both apps | Open |
| S3-9 | Owner wording review: "Approved demand — not invoiced", "Not settled — no evidence", "Approved instruction — not sent" | all rentals screens | Open |
| S3-10 | Issue #17 closure: NVDA + Firefox, the owner statement as a reader who may not issue it (the reason is read where the Issue control would be; nothing focusable is missing) | `/backoffice/rentals/owner-statements?owner=own_rb_tahira&period=2026-10` as Sadia | Open |
| S3-11 | Issue #17 closure: VoiceOver iOS, Urdu, the partial landlord view ("Partial statement" read with its statement; the drawer's notice read before the lines) | `/customer/portal/rentals` as Tahira with the demo site scope set to Riverbend Heights | Open |
| S3-12 | Owner wording review of the closure: "Partial statement", "Payout lines are left out", "Only the client money accounts officer issues statements to owners" | both apps | Open |

## UX B1 money truth (from `docs/status/ux-b1/B1_REPORT.md` §7)

| # | Check | Status |
|---|---|---|
| B1-1 | Screen reader (NVDA / VoiceOver): the reversed receipt, the Home receipt card, the bill's payments, the payments list row, the credit-note drawer (field error at the line), the voucher draft drawer and the policy draft notice | Open |
| B1-2 | Urdu for a native reader, B1's new or changed strings: `dues:receipt.reversed` واپس شدہ, `receipt.reversedOn`, `receipt.reasonLabel`, `receipt.reversedBody`, `receipt.amountReversed`, `receipt.noLongerSettles`, `receipt.creditGone`, `home.receiptReversed`, `home.seeProofs`, `bill.reversedPayment`, `status.credited`; `collections:payments.reversedShown_one/_other`, `problems.reversedNoCredit`, `inbox.filters.waiting`, `inbox.empty.waiting`; `billing:creditNote.rule`, `breakdown`, `nothingOpen`, `problems.overOpen`; `finance:pending.kind.voucher_draft`, `pending.describe.voucher_draft`, `problems.policy_changed`, `voucher.edit`, `voucher.saveChanges`, `voucher.draftNote`; `governance:policy.unsaved` | Open |
| B1-3 | Urdu for a native reader, Issue #19's two strings: `billing:creditNote.problems.duplicateLine` "یہ اندراج ({{unit}}) ایک سے زیادہ بار بھیجا گیا۔ ہر اندراج پر ایک ہی رقم لکھیں؛ کچھ جاری نہیں ہوا۔" and `linesMismatch` "بھیجے گئے سب اندراجات اس انوائس کے نہیں ہیں۔ کچھ جاری نہیں ہوا: انوائس دوبارہ کھولیں اور پھر کوشش کریں۔" | Open |

## Issue #21 credit-note idempotency (from `docs/status/cn-idempotency/CHECKPOINT.md` §R11)

| # | Check | Status |
|---|---|---|
| CN-1 | Screen reader (NVDA / VoiceOver): the drawer's two new alerts (`role="alert"`), the success toast after a retry, focus after the drawer closes | Open |
| CN-2 | Urdu for a native reader: the two strings (INT-M4 above) | Open |
| CN-3 | A real network drop (the tests lose the answer inside the page's transport; the prototype has no real network) | Open |

## UX B2 accessibility (from `docs/status/ux-b2/MANUAL_VERIFICATION.md`)

The steps and expected speech (M1–M8) and the ring checks (F1–F9) are in the B2 file; the table lists them.

| # | Check | Status |
|---|---|---|
| B2-1 | NVDA + Firefox and NVDA + Chrome: M1–M8 (SH-01 palette Cancel, OPS-01 refusals in drawers, dialogs and pages, SH-02 figures, SH-04 Relationship error, RES-06 re-send file stop, SH-10 tab panel ring, SH-11 calendar month buttons, SH-12 consent checkbox), English and Urdu | Open |
| B2-2 | VoiceOver macOS Safari: M1, M2, M3, M4, M6, M7 | Open |
| B2-3 | VoiceOver iOS Safari: M1, M2, M4, M5 | Open |
| B2-4 | TalkBack Android: M1, M2, M4, M5, Urdu at 200 % text | Open |
| B2-5 | Urdu for a native reader: `common:calendar.previousMonth` "پچھلا مہینہ", `common:calendar.nextMonth` "اگلا مہینہ" | Open |
| B2-6 | Windows High Contrast (a real contrast theme, not emulation): palette Cancel, refusal alert ring, tab panel ring, Issue #20 rings (F7) | Open |
| B2-7 | Issue #20 rings by eye: F1–F9 (now also on Rentals: INT-M3) | Open |
| B2-8 | Real phones at 320–390 px: palette Cancel with the soft keyboard up; a refusal inside a full-height drawer | Open |

No WCAG conformance is claimed for any of the four branches or for the integration.
