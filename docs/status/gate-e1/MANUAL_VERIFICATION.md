# Gate E.1: manual verification (for the reviewer)

Provisional wave-1 build on `373d0cf` (E.0 not accepted). Demo date Monday 26 October 2026. Sign in from the demo sign-in page. People:
- **Samina Latif**, Sales manager (new fictional persona, both Larkspur projects; `lead.assign`, `lead.manage`).
- **Bilal Ahmed**, Sales (Larkspur Heights only).
- **Nadia Rahman**, Administration (both projects; no `lead.assign`, so the new screens show only her own records under the E-05 default).
- **Farah Javed**, Finance (no `lead.view`).

Nothing here is a real booking, payment, hold or message. Automated checks cover the items below; NVDA, VoiceOver, TalkBack and real phones were **not** run and stay open (no WCAG claim).

## 1. Lead assignment (CRM-006)
1. As Samina open `/backoffice/crm/lead-assignment`: the drawer opens over the opportunities page. Search "Ayesha", filter by project, owner, source and "Follow-up overdue"; counts on the pills match the list.
2. Select two Heights leads, open "Assign to": only colleagues who hold Larkspur Heights are offered (Nadia, Bilal, Samina). Leave the reason empty and press Assign: the reason is required, nothing changes.
3. Give a reason, assign to Bilal: toast "2 leads assigned to Bilal Ahmed"; each lead's History shows "Samina Latif reassigned it from … to Bilal Ahmed" and the reason; Lead 360 shows Bilal as owner and "Assigned the lead to Bilal Ahmed" in its activity.
4. Select a Gardens lead: Bilal is not offered.
5. As Bilal open the same address: read-only note, only his own Heights leads; a lead's history shows "Assigned to you" without the other person's name or the reason.

## 2. Opportunities pipeline (CRM-007)
1. As Samina: seven stage figures; each opens the list filtered to that stage with the same count. "Won" shows "Needs a booking (Gate E.5)".
2. Drag a card from Qualified to Quotation (mouse): toast, counts move by one. Drop a card on Lost: the reason dialog opens first.
3. Keyboard only: Tab to a card's "Move" button, Enter, arrow to a stage, Enter: the card moves and focus lands on its name link in the new column; the focus ring is visible.
4. "Convert a qualified lead": pick a lead, an expected close date and a note; the new Opportunity 360 opens. Press the button twice quickly: still one opportunity.
5. Phones (390 px) and 200 % text: one stage at a time with a stage picker; the list view uses cards, not a table.
6. As Bilal: only his Heights opportunities, no convert or move controls, the scope note explains why; searching "Gardens" finds nothing.

## 3. Opportunity 360 (CRM-008)
1. Move, Mark as lost (Other requires a note), Reopen (note required; returns to the stage it was lost from), Reassign (opens the drawer for this lead), Schedule a site visit (existing drawer).
2. Timeline: conversion, stage moves, lost/reopened with notes, reassignments, visit outcomes with units shown, follow-ups. As Bilal a reassignment shows only "Reassigned".
3. Links: the lead (Lead 360), the project ("project page, planned": PRJ-002 is Gate E.2's and shows its planned page until integrated), each unit's quick view on Lead 360.

## 4. Site visits calendar (CRM-009)
1. Month view is a table (weekday headers, today marked); "+n more" opens that day in the agenda. Agenda lists the same visits with the same links.
2. Status pills: each count equals the visits listed under it. Project and host filters (Samina only), search.
3. Phones and 200 % text: the agenda only. Urdu: right-to-left, Latin times.

## 5. Visit workspace (CRM-011)
1. Confirm a scheduled visit; reschedule (date within 90 days, half-hour slot 09:00–19:00, reason; a past time is refused with the reason); the visit then needs confirming again.
2. Record outcome for a visit whose time has passed: Visited with interest, feedback, units shown (only this project's units) and a follow-up date and time; a visit still to come can only be cancelled (with a reason).
3. The follow-up appears on the lead (Lead 360), the opportunity and Sales home.

## 6. Access and privacy
1. Bilal opening a Gardens opportunity or visit address gets "not found", the same as an invented id.
2. Farah opening the pipeline gets the planned page; the API answers 403.
3. Narrow Samina to Heights in the browser console: `sessionStorage.setItem('demo:site-scope', JSON.stringify({ sales_manager: ['site_lk_heights'] }))`, reload: Gardens records disappear at once.

## Still open
Screen reader passes (NVDA/VoiceOver/TalkBack), real devices, and owner decisions E-05, E-06, E-07 (see REPORT.md).
