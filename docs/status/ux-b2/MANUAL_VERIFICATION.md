# Manual verification still outstanding: UX batch B2 (accessibility blockers)

**Status: not performed.** Nobody has run a screen reader on this branch.

The automated checks in [`test-results.md`](test-results.md) (axe-core, Playwright role and name
queries, `ariaSnapshot`, focus assertions, `layoutProblems` at 320 px with 200 % text, Firefox and
WebKit smoke) show that the markup is what a screen reader needs. They are **not a screen-reader pass
and not a WCAG certification**. Live-region timing, what each reader actually says, and Urdu speech
need a person.

| Item | Scope | Status | Owner |
|------|-------|--------|-------|
| NVDA + Firefox and NVDA + Chrome (Windows) | M1–M8 below, English and Urdu | not performed | needs a person running NVDA |
| VoiceOver (macOS Safari) | M1, M2, M3, M4, M6, M7 | not performed | needs a Mac |
| VoiceOver (iOS Safari) | M1, M2, M4, M5 on a phone | not performed | needs an iPhone |
| TalkBack (Android Chrome) | M1, M2, M4, M5, in Urdu at 200 % text | not performed | needs an Android phone |
| Urdu wording by a native reader | `common:calendar.previousMonth` "پچھلا مہینہ", `common:calendar.nextMonth` "اگلا مہینہ" (the only new strings) | not performed | needs a person |
| Windows High Contrast (forced colours) | the palette Cancel button, the refusal alert's focus ring, the tab panel's focus ring; Issue #20 rings (F7) | not performed | needs a person |
| Issue #20 focus rings by eye | F1–F9 below | not performed | needs a sighted keyboard user |
| Real phones at 320–390 px | palette Cancel with the soft keyboard up; a refusal inside a full-height drawer | not performed (automated in Chromium, Firefox and WebKit) | needs devices |

## Set-up

Production builds as in earlier gates. People of the Al-Noor storyline: **Imran Qureshi** (building
manager, office app, `alnoor_manager`) for M1, M2, M3, M6; **Kamran Siddiqui** (A-101, resident app)
for M4 and M5; **Sana Iqbal** (A-102) for the re-send part of M5. M3 also uses Platform HQ
(Supreme Admin) and CRM (the Larkspur manager). Switch the language in the header (or Ctrl+K →
"Switch language") to repeat each step in Urdu; the page turns right-to-left.

To create a refusal for M2 without two people: open the request's drawer, then in a second tab of
the same browser cancel the request (or put its work order on hold); go back to the first tab and
press the drawer's main button. For the dialogs, a reason shorter than 10 characters is refused.

## Steps and what a tester should hear

| # | Finding | Steps | Expected (English) | Expected (Urdu) |
|---|---------|-------|--------------------|-----------------|
| M1 | SH-01 | Phone (or a 390 px window). Office home → tap **Search** in the header. Then: swipe/Tab to the end of the search row; activate **Cancel**. Repeat and close with Escape (keyboard). | Opening: "Search, dialog" and the search box "Search records, screens and actions, search edit". Next item after the search box: **"Cancel, button"**. Activating it closes the palette; the reader is back on **"Search, button"** in the header. Escape does the same. On iOS/Android the Cancel button is visible at the end of the search row (right in English). | "تلاش" dialog; the next item after the search box is **"منسوخ کریں، بٹن"**; it sits at the left end of the row; focus returns to the header's "تلاش" button. |
| M1b | SH-01 (tour) | Larkspur sales person, first sign-in → Start the tour → Next until "Search anything" → tap Search → Cancel. | The palette closes and the tour moves on to its next step (Quick create). | Same, in Urdu. |
| M2 | OPS-01 drawers | Imran → Repairs → *Geyser not heating* → **Triage**; type a note; make the conflicting change in a second tab; press **Save triage**. Repeat with Assign (*Water seepage*), Complete and Hold (*AC drain leaking*), Merge and Resolve (*Stray dogs near the main gate*). | Immediately: "**This step is not possible now (someone may have changed it). Refresh to see where it stands.** Nothing was changed." read as an alert, and the reader's focus is on that message inside the drawer. The note, the chosen technician or the summary is still there. The drawer stays open. Merge with a target resolved meanwhile: "Some entries need attention. Choose another open issue." Closing and reopening the drawer: no old message. | "یہ قدم ابھی ممکن نہیں (شاید کسی نے بدل دیا ہو)۔ تازہ کر کے صورتحال دیکھیں۔" then "کچھ تبدیل نہیں ہوا۔"; focus inside the drawer on the message. |
| M2b | OPS-01 dialogs | *Balcony door lock broken* → **Close for the resident**; type "No reply" → confirm. Then *Geyser not heating* → **Cancel request**, and *Stray dogs* → **Hide**, each with a short reason. | "**Some entries need attention. Write at least 10 characters. Nothing was changed.**" as an alert inside the alert dialog; focus on it; the dialog stays open and the reason "No reply" is still in the box. A longer reason then closes it. | "کم از کم 10 حروف لکھیں۔" inside the dialog; same focus and kept reason. |
| M2c | OPS-01 page actions | *Socket sparks* → cancel it in a second tab → **Start work** on the first. | The refusal ("This work order is already finished or cancelled.") is read on the page, under the next-step box (no drawer is open). | Same, in Urdu. |
| M3 | SH-02 | (a) HQ dashboard: arrow through the figures to **Annual run rate**. (b) CRM → a lead's 360 → the **Budget** card. (c) Office home (Imran) → the four figures of "Money for …"; the finance dashboard's figures. | (a) "Annual run rate", then the **full amount** (e.g. "Rs 754,080.00"), then "MRR × 12, before tax". Before B2 the amount was silent. (b) "Budget", then the exact budget. (c) Each figure is one link read as label, full amount and its context line once, e.g. "**Overdue, Rs 49,100.00, 10 accounts late · Rs 392,300.00 owed in all, link**". | "سالانہ آمدنی کی شرح" then the amount then "MRR × 12، ٹیکس سے پہلے"; tiles read label, amount, context once. Check that the Latin amount inside Urdu is read as a number. |
| M4 | SH-04 | Kamran → **Household** → press **Send request** with nothing filled. | The form announces its problem; Tab to **Relationship**: "Relationship, button, … **invalid entry**, Choose an option." (the message is the field's description). | "ایک آپشن منتخب کریں۔" read with the Relationship field. |
| M5 | RES-06 | Kamran → Pay → **Upload proof** form: Tab to **Choose file**, then Tab once more. Sana (A-102), after the office asks for a clearer receipt: the submission page's **re-send** form, the same. | After "Choose file, button" the next stop is the next visible field (the note), never an unnamed or invisible "file upload" stop. Enter/Space on Choose file opens the file picker; the chosen file name is read (polite). | Same in Urdu; "فائل منتخب کریں" (or the app's wording) then the next field. |
| M6 | SH-10 | Imran → a request's 360 → **Timeline** tab → Tab once from the tab list (on a phone, past **More**). | The focused panel is read ("Timeline, tab panel") and **a visible ring** surrounds it. With the mouse no ring appears. | Same, mirrored. |
| M7 | SH-11 | CRM → a lead → **Schedule a visit** → open the calendar; Tab to the month buttons. HQ → Policies → New version → Effective from → **Open calendar**. | "**Previous month, button**", the month heading, "**Next month, button**" (before B2: "Back" and "Next"). | "**پچھلا مہینہ**، بٹن" and "**اگلا مہینہ**، بٹن" (native reader to confirm the wording). |
| M8 | SH-12 | Office → Lab → Forms → the consent checkbox → submit without ticking. | (FormsLab only, not in client flows.) The checkbox reads its description and, after submit, "invalid entry, This field is required." | Same in Urdu. |

## Issue #20: keyboard focus rings (for a sighted keyboard user; no screen reader needed)

**Status: not performed.** The automated checks measure the computed style, the pixels on the ring
and its contrast (see test-results.md, "Issue #20"). A person still has to judge whether each ring is
easy to see, in context, on a real screen.

| # | Where | Steps | Expected |
|---|-------|-------|----------|
| F1 | Office (Imran), 1440 px, English then Urdu | Click the page background, then press Tab slowly through the header (menu, organisation, Search, help, notifications, language, avatar), the sidebar, the "Money for …" figures, "Open collections". | Every stop shows **one** ring: a 2 px dark-green outline about 2 px outside the control (inside the edge for sidebar items and the drawer body). No stop is invisible; no ring is drawn twice (for example around a whole tab area and the tab). In Urdu the order runs right to left and the rings look the same. |
| F2 | The same, with the mouse | Click Search, a figure tile, a tab, a drawer choice. | **No ring** appears for a click (text boxes are the exception: like everywhere in the product, a focused text box shows its ring however it was focused). |
| F3 | Request 360 (any repair) | Tab to the tabs, use the arrow keys, Tab into the panel; open **Assign**, Tab through the drawer (scroll area, technician choices, day, time, notes, buttons); open the day list with the arrow keys. | Tabs, the panel and every drawer control show one ring. With the list open, the highlighted day is shown by its background only and nothing else draws a ring; Escape returns to the day field with its ring. The disabled Save of the completion drawer is skipped by Tab. |
| F4 | Lead 360 (Larkspur manager) → Schedule a visit → calendar | Tab to the calendar; arrow through days; Tab to "Previous month" / "Next month". | The focused day and the month buttons show a ring. |
| F5 | Dark mode and high contrast (Preferences → Theme: Dark; Contrast: High), 390 px | Repeat F1 and F3 on a phone-sized window, including the bottom bar. | Rings are bright yellow on black and clearly visible; bottom-bar items show the ring inside their edge. |
| F6 | 320 px window at 200 % text (Preferences → Text size), English and Urdu | Repeat F1 and F3. | Rings stay visible. Known: in a drawer the scrolling area is very short at this size (N-B2-3), so a tall choice shows only the sides and the bottom of its ring until scrolled. |
| F7 | **Windows High Contrast / forced colours** (Settings → Accessibility → Contrast themes → e.g. "Night sky" or "Desert"), Edge or Chrome, English and Urdu | Repeat F1 and F3. | Every focused control shows a ring in the theme's highlight colour; nothing relies on colour alone. (Emulated forced colours are tested automatically; a real Windows theme is not.) |
| F8 | Resident app (Kamran), phone | Tab through the header, the bill, the bottom bar and the round **Pay** action; open Requests and Tab to a repair card. | One ring per stop. On **Pay** the raised circle covers the top of the ring by design; the sides and bottom show. |
| F9 | Platform HQ (Supreme Admin) | Tab through the header, the figures and the tenant list (table on desktop, cards on a phone). | One ring per stop. |

## Known gaps a tester will meet (not B2)

- Keyboard focus rings were not drawn in most of the product (N-B2-1). **Issue #20 restores them**
  product-wide (F1–F9 above). Chart columns show focus with their own outline stroke, not a CSS ring.
- `ConfirmDialog` still loses a refused reason on other screens (X-09, batch B3); only the three
  Request 360 dialogs opt in to staying open.
- In dark mode with high contrast, the society dashboard's aging bar labels are black on dark green
  (1.92:1, N-B2-7, also on the base `04b6fde`).
