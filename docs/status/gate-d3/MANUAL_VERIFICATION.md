# Manual verification still outstanding: Gate D.3 (with Gates B to D.2)

**Status: not yet performed.**

Automated checks pass (see [`test-results.md`](test-results.md)):
- axe-core on every D.3 office and resident screen, in English and Urdu, at 1440, 768 and 390 px;
- axe on the drawers in the reference journeys;
- no sideways scroll at those sizes;
- at 320 × 700 with 100, 150 and 200 % text in both languages: nothing clipped, spilled or broken mid-word;
- keyboard walks at 320 px / 200 %: no focused control is hidden under the header or the bottom bar.

These checks are **not a WCAG certification**. The checks below need a person. The earlier gates' outstanding items stay open in [`../gate-d2/MANUAL_VERIFICATION.md`](../gate-d2/MANUAL_VERIFICATION.md) and the files it links.

| Item | Scope | Status | Owner |
|------|-------|--------|-------|
| NVDA, flows F1–F8 (below) | office and resident apps | not performed | needs a person running NVDA |
| VoiceOver (iOS), F1, F2, F5 | resident app on an iPhone | not performed | needs an iPhone |
| TalkBack, F1, F2, F5 in Urdu at 200 % | resident app on Android | not performed | needs an Android phone |
| Real phones at 320–360 px | the conversation and composer with the soft keyboard; the poll drawer; the services list | not performed (automated in Chromium, Firefox and WebKit) | needs devices |
| Live-region behaviour of the message log | new messages announced once, not the whole log | not performed | needs NVDA and VoiceOver |
| Windows High Contrast (forced colours) | unread badges, the "new messages" line, poll result bars | not performed | needs a person |
| Urdu wording by a native reader | `packages/i18n/locales/ur-PK/community.json` (547 keys) | not performed | needs a person |
| Firefox and WebKit beyond the smoke | the rest of the D.3 screens | not performed (smoke: chat report and removal, a poll answer, no add-ons, 320 px / 200 % Urdu) | later stage |

## Set-up

Production builds as in earlier gates (`npm run build -w @repo/<app> && npm run preview -w @repo/<app>`), office 5173 and residents 5174 on the same host. People: **Kamran Siddiqui** (A-101), **Sana Iqbal** (A-102), **Rabia Hashmi** (A-201; also the office administrator), **Junaid Akhtar** (A-202), **Imran Qureshi** (building manager).

## D.3 flows

| # | Flow | Steps | Expected |
|---|------|-------|----------|
| F1 | Read a group | Kamran: Community → chat card → Whole community | The groups are a navigation list; each reads its name, who is in it, the last message and "n unread messages". The log is announced as "Messages in Whole community"; new messages are announced once. |
| F2 | Write and report | type, Ctrl+Enter; then a neighbour's message → actions → Report | The composer's hint is read; "Sent" follows. The report drawer is a dialog; the reasons are a radio group; the confirmation toast is read and the drawer's buttons stay reachable. |
| F3 | Block and unblock | a message's actions → Block → About this group → Unblock | The alert dialog reads the effect; the blocked message reads "Hidden: you blocked this person". |
| F4 | Moderate | Imran: Chat groups & reports → Reports → Remove message | Only the reported message is read; the note is required; the decided list reads the state. |
| F5 | Answer a poll | Sana: Community → Polls → Answer | The drawer reads the question, the informal notice and anonymity; the answers are a radio group. |
| F6 | Results | Community → Polls (Gym opening hours) | Each option reads its count and share; "Not enough responses to show results" is read where results are withheld. |
| F7 | Local services | Community → Local services: search, category, Recommend, Report a problem | The disclaimer is read first; Recommend is a toggle (pressed state); the report drawer's field reads its hint. |
| F8 | Smart groups | Imran: Chat groups & reports → Who is in it | Each member reads the reason (lives in, committee member since, office staff). |
