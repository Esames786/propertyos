# Manual verification still outstanding: D.1 + S.1 integration (with Gates B, C.1, C.2, D.1 and S.1)

**Status: not yet performed.**

Automated checks pass on the integrated code (see [`test-results.md`](test-results.md)):
- axe-core in every spec that scans, including the new cashbook cards at 320 px (200 % text) and 390 px (100 % and 200 %) in English and Urdu;
- no sideways scroll, and no financial fact cut or pushed out of its card, at 320 and 390 px with 100 % and 200 % text;
- keyboard paths in the E2E suite (Tab from one cashbook card's record to the next; drawers and alert dialogs).

These checks are **not a WCAG certification**. The checks below need a person. The earlier gates' outstanding items stay open in [`../gate-s1/MANUAL_VERIFICATION.md`](../gate-s1/MANUAL_VERIFICATION.md), [`../gate-d1/MANUAL_VERIFICATION.md`](../gate-d1/MANUAL_VERIFICATION.md) and [`../gate-c2/MANUAL_VERIFICATION.md`](../gate-c2/MANUAL_VERIFICATION.md).

| Item | Scope | Status | Owner |
|------|-------|--------|-------|
| NVDA, flows I1–I5 (below) | office app; resident home | not performed | needs a person running NVDA |
| VoiceOver (iOS), I1 and I3 | office app on an iPhone (the cashbook cards are for phones) | not performed | needs an iPhone |
| Real Android phone, I1 and I3 | Chrome on Android, EN and UR, text size 150 % and 200 %, Nastaliq | not performed | needs a device |
| Clock near midnight on a real device | I4 with the device's own clock just before and after midnight in Pakistan | not performed | needs a person |
| Printing, forced colours | as listed for S.1 and D.1 | not performed | needs a person |

## Set-up

- Production builds as in Gate S.1 (`npm run build -w @repo/<app> && npm run preview -w @repo/<app>`), or `E2E_PORT_OFFSET=100` beside another checkout.
- Office: `/backoffice/get-started` → *Explore the society demo*. People: **Saba Javed** (accounts officer), **Ayesha Malik** (treasurer), **Rabia Hashmi** (general secretary). Resident: **Kamran Siddiqui** (A-101).

## Integration flows

| # | Flow | Steps | Expected |
|---|------|-------|----------|
| I1 | Cashbook cards | Ayesha on a phone (or text size 200 %): Society finance → Open the cashbook | **List:** an ordered list named "Cashbook lines, October 2026". **Each card:** the line's description is a link to its record; *Money in* or *Money out* is said in words before the amount; then date, reference, payer or payee, flats, account, category, evidence and balance, each with its label. Nothing is cut; the reference reads in full. |
| I2 | Cashbook table | The same at desktop width and 100 % text | The table with its column headers, in a labelled scroll region (as before). |
| I3 | Single office cash (D-46) | Saba: Payments → Record an office payment | **Before:** the rule "Counted by a second person before any receipt" is read with the form. **After:** the status "Cash recorded: waiting for a second count" is announced; the preview reads as "If confirmed now, it would settle". **Ayesha:** Approvals → *Billing and collections* tab lists "Office cash to count"; the collection drawer asks for her own count; after confirming, the receipt is announced. **Kamran (resident app):** the home says the cash was handed in and the bill is not paid until confirmed. |
| I4 | Times near midnight | Approve a request a minute before midnight in Pakistan, post a voucher a minute after | Both times read on the demo date (26 October), at 11:59 pm and 12:00 am; nothing moves to another day or month. |
| I5 | Activity log | Sites & flats → Al-Noor → *Activity*, after S.1 actions (vouchers, collections, cheques) | Every entry reads as a sentence ("Saba Javed sent office collection ANR-OCB-… for a second count"), never as a key. |
