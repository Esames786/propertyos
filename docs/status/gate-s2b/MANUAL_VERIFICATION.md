# Manual verification still outstanding: Gate S.2b (with Gates B to S.2a)

**Status: not yet performed.**

These automated checks pass (see [`test-results.md`](test-results.md)):
- axe-core on every payroll screen state (overview, periods, run, breakdown and its deductions tab, finalisation, disbursement, accounting), in English and Urdu, at 1440, 768 and 390 px;
- axe on the days, bonus and period drawers and on finalisation in the reference flow;
- no sideways scroll at those sizes;
- at 320 × 700 with 200 % text in both languages: nothing clipped, spilled or broken mid-word on every payroll screen and the three drawers;
- keyboard walks at 320 px / 200 % on the run, the breakdown, the periods and finalisation, in both languages: no focused control hidden under the header or the bottom bar;
- dark mode with high contrast at 390 px in both languages, with axe;
- the Firefox and WebKit smoke: the reference flow, and Urdu at 320 px / 200 %.

These checks are **not a WCAG certification**. The checks below need a person. The earlier gates' items stay open in [`../gate-s2a/MANUAL_VERIFICATION.md`](../gate-s2a/MANUAL_VERIFICATION.md) and the files it links.

| Item | Scope | Status | Owner |
|------|-------|--------|-------|
| NVDA, flows P1–P6 (below) | office app | not performed | needs a person running NVDA |
| VoiceOver (macOS) and TalkBack, P2 and P4 in Urdu at 200 % | office app on a tablet or phone | not performed | needs devices |
| Real phones at 320–360 px | the run's people list, the days drawer with the soft keyboard, the finalisation acknowledgement | not performed (automated in Chromium, Firefox and WebKit) | needs devices |
| Windows High Contrast (forced colours) | run, instruction and settlement badges; held lines (red) against warnings; the boundary panel | not performed | needs a person |
| Urdu wording by a native reader | `packages/i18n/locales/ur-PK/payroll.json`, the HR-008 sentence in `hr.json` | not performed | needs a person |
| Money wording with the finance team | "Approved obligation — not paid", "Approved instruction — not sent", "Sent (simulated) — not paid", "Not settled — no evidence", "Verified as paid: Not available", the acknowledgement sentence | not performed | needs Al-Noor's treasurer and accounts officer |
| Policy labels with an adviser | statutory placeholders, the demo proration rule, held unpaid leave and instalments | not performed | needs an adviser (no statutory claim is made) |
| Multi-site and other employers in the screens | proven at the API with the S.2a multi-site fixture; the demo has one site | not performed in the screens | later stage |
| Firefox and WebKit beyond the smoke | the rest of the payroll screens | not performed (smoke: reference flow; Urdu 320 px / 200 %) | later stage |

**Flows for a screen-reader pass**
- **P1.** The overview: the three-part boundary, the tiles (a tile's spoken value is the full amount; "Verified as paid" is spoken as not available).
- **P2.** The run workspace: held lines are announced with their reason; the filter and search; the versions and policies.
- **P3.** The breakdown: the tabs; the held instalment and the statutory placeholders; own pay read only.
- **P4.** Confirming days: the drawer, an empty answer refused, the reason field.
- **P5.** Finalisation: the warnings list, the acknowledgement checkbox, the refusal without it.
- **P6.** Disbursement: the instruction states, the held line, "Not settled — no evidence" on each line.
