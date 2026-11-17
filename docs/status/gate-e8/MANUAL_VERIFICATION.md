# Gate E.8 — manual verification (open)

Automated checks cover axe (EN and UR, 1440 and 390 px, dark mode at 390 px), 320 px with 200 % text in both languages, sideways scroll, keyboard reach without the header or bottom bar covering a control, and Firefox/WebKit smoke. These remain for a person, as in every gate (plan §4.10: no WCAG claim):

| # | Check | Status |
|---|---|---|
| 1 | NVDA (Windows, Chrome/Firefox): the three states of a bill (approval, posting planned, not settled) are read in order; the payment drawer's "Not settled — no evidence" notice is read when it opens | Open |
| 2 | VoiceOver (macOS/iOS Safari): the searchable pickers (supplier, cost centre, legal entity, staff member) announce their options and the chosen value | Open |
| 3 | A real Android phone at 200 % text: the new bill form's lines and the petty-cash count drawer are usable one-handed | Open |
| 4 | Urdu reading order of mixed lines (reference, amount, date) on a real device | Open |
| 5 | The compact metric amounts in workspace headers (e.g. "Rs 1.9M") read the full amount to a screen reader | Open |

All suppliers, documents, accounts and amounts are fictional demo data.
