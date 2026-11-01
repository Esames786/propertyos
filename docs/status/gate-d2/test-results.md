# Gate D.2: test, accessibility and localisation results

**Run date:** 2026-11-01. **Review closure (Issue #8):** results on the closure code are in [§ Review closure](#review-closure-issue-8) at the end; the sections before it are the original `93889a3` run.

**Environment:**
- Production builds of all three apps on **isolated ports**: `E2E_PORT_OFFSET=200` (office 5373, resident 5374, HQ 5375; apps built with `VITE_OFFICE_ORIGIN` / `VITE_CUSTOMER_ORIGIN`).
- Node 20.20.1, Playwright (Chromium), axe-core with WCAG 2.0/2.1/2.2 A and AA rules.
- Retries **off**. My own development servers were stopped before every run; no other session's processes were touched. The machine was shared and loaded throughout.

## Summary (final code)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × **23** namespaces (new: `operations`), **8,605 keys** each (base `5b93544`: 22 namespaces, 7,240 keys) |
| Unit and API tests | `npx vitest run --maxWorkers=2` | **1,230 / 1,230** in 40 files (base: 1,197 in 38). New: `operations.api.test.ts` (12: the three references, Rule R, occupants only at the gate, moved-out access, D-47 counts, duplicate plates, the sandbox gateway, Shalimar) and `privacy.test.ts` (20 vectors from `privacy-differencing.vectors.json`); `Tabs.test.tsx` +1 (`phoneLimit`) |
| Register | `node scripts/sync-screen-register.mjs` | **424 rows, 346 distinct: 118 built, 32 partial, 196 planned** (base: 415 / 344; 92 / 32 / 220). All 321 V2.1 IDs and addresses preserved |
| End-to-end, full | `E2E_PORT_OFFSET=200 npx playwright test tests/e2e/ tests/evidence/gated2.evidence.spec.ts --project=e2e --project=evidence --workers=3` | **317 / 317** in one 26.8-minute run with retries off: **e2e 307 / 307** (Gates B, C.1, C.2, D.1, S.1 and D.2; integration baseline: 294) and **evidence 10 / 10** (`gated2`) |
| D.2 end-to-end | `tests/e2e/d2.spec.ts` (inside the full run) | **13 / 13** |
| Accessibility (inside E2E) | axe in every spec that scans | Full run: **1,037 axe scans, 28,575 rule passes, 0 violations** (integration baseline: 909 scans); `d2.spec` had 128 of them |
| Evidence | same run | **10 / 10**: **111 screenshots** and **3 videos**; every screenshot exactly its viewport's width (checked by reading each PNG's width) |
| Manual screen reader, devices, forced colours | [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md) | **not performed**: needs a person and devices |

## What `d2.spec` covers

- **Reference 1:** resident report with a described photo → triage → assign → start → complete with evidence → resident bell and Home → confirm with a rating → closed, clocks met, confirmation list; a technician sees only his jobs; another flat cannot open the repair.
- **Reference 2:** invitation with a plate → wrong code refused → right code lets in → check-out → used code refused; walk-in → live queue → occupant's phone prompt → approve → let in → inside now.
- **Reference 3:** compose with acknowledgement → publish → resident bell and Home → read and acknowledge → office counts; A-101 no longer listed as not acknowledged.
- **Office:** vehicle approval after the server's checks (or rejection with a reason); sandbox gateway (accepted, duplicate refused, tampered refused; the resident still owes the full bill; the building manager has no tab); booking decision and a move-out with the *still pays* warning from Flat 360; the maintenance supervisor cannot record moves or decide bookings.
- **Screens:** 10 office and 8 resident screens in English and Urdu at 1440, 768 and 390 px: axe with no violations and no sideways scroll; the 8 resident screens again at 320 px with 200 % text.

## Findings during verification (all fixed unless stated)

Found by reviewing screenshots, by the specs, by the full regression and by an independent read-only audit of the register rows against the code:

| # | Finding | Fix |
|---|---|---|
| 1 | The maintenance supervisor could not open **New request** (the form read the site's records, which the role may not) | `/ops/flats`: flats with the names of who lives in or owns each, nothing else |
| 2 | The guard could not choose a flat for a **walk-in** (same cause) | the gate's own data carries the flat codes |
| 3 | After a code check, whatever the guard typed in the walk-in flat field was **cleared** about 80 ms later | `FlatSelect` keeps the typed text itself (every page that uses it) |
| 4 | A **suspended** organisation could open the D.2 areas (Gate B: only financial history stays readable) | D.2 areas and endpoints are paused when suspended |
| 5 | Notice addresses with an unexpected id answered *not found* before the access check (security test) | route order and patterns corrected; the access check always runs first |
| 6 | **Scheduled notices never published** | the simulated scheduler publishes a due notice on the next read |
| 7 | **Adjacent-block differencing** (D-47): on a site with three or more blocks, the site count minus the shown blocks could reveal a small hidden remainder | the remainder must clear the threshold too; 20 vectors (`privacy-differencing.vectors.json`, which the code already cited but did not exist) |
| 8 | The resident still read "Bilal is coming on 27 Oct" after the repair was fixed | the visit line shows only while the visit is ahead |
| 9 | Tabs clipped on phones (Request 360, Site 360, Flat 360) | two tabs plus More there (`UrlTabs` `phoneLimit`) |
| 10 | axe (serious): the technician and merge choices were list items outside a list | plain radio group |
| 11 | Sideways scroll at 320 px with 200 % text: *This affects me too*, *Report a community issue*, *Remove (sold or not used)* | the buttons wrap |
| 12 | At 200 % text in Urdu a *Needs your attention* card was taller than the space between the header and the bottom bar, so keyboard focus hid part of it | the title is the link (the card stays clickable) |
| 13 | The *Vehicles* and *Send message* menu entries claimed every parking and notification address, so their planned screens answered "no access" | each owns only its own address |
| 14 | Shalimar's home still listed maintenance requests as *Planned · Gate D* | working quick actions; only preventive maintenance (Gate G) is planned |
| 15 | Old resident maintenance links (PORTAL-016/017) led society residents to a hub without a maintenance tab | they open Repairs |
| 16 | The resident's Visitors tab showed a waiting gate request without a way to answer it | Approve and Deny there too |
| 17 | Audit gaps: issues board without *In progress*; notices without *Show unread only*, an offline state or the withdrawal date | added |
| 18 | Hall and rooftop slots were labelled with visit slots ("Evening (4–7)") that do not match their hours | time ranges |
| 19 | The gateway tab's choices had no visible label; *Save* sat on the same line | visible captions; buttons on their own line |
| 19a | **The shared demo lost a write when requests overlapped** (found by the D.1 test *Rabia switches between Management and Resident*): a copy fetched from the office's bridge before a save arrived after it and replaced it, so the resident's 125 % never reached her account. D.2's home page runs more requests at once, which exposed it | the bridge client ignores a fetched copy that is older than a save made meanwhile (`packages/fixtures/src/shared-demo.ts`); the D.1 test passes unchanged |
| 19b | Gate reads (the resident's prompt polls them) saved the whole shared demo on every read | they save only when a request actually expired |
| 20 | Typing English into an Urdu form shows the trailing full stop at the start of the line while typing (shared fields, all gates) | **not fixed** (owner to decide): `dir="auto"` makes empty fields left-to-right in Chrome 156 (the caret on the wrong side); `unicode-bidi: plaintext` fixes text areas line by line but left-aligns Urdu in one-line fields and turns "A-101 …" left-to-right. Saved text displays correctly everywhere |
| 21 | A stack of toasts can cover a drawer's bottom buttons until they dismiss themselves (shared) | **not fixed in 93889a3**; fixed in the review closure (C4 below) |

## Notes on the runs

1. **Three complete runs.** The first (308 / 316) and the second (316 / 317) found items 1, 3, 12, 13, 14 and 19a above, which were fixed; the third, on the final code, passed 317 / 317. No test was retried and none is skipped.
2. **Older tests changed to the D.2 reality, never weakened:** `register.spec` counts (424 / 346, with the adopted rows named); `access.spec` (Shalimar's maintenance addresses now open the working screens; the plan home offers them as quick actions and still lists preventive maintenance as planned); `platform.test` (HQ's Al-Noor includes the online-payments add-on the workspace has). The D.1 test that found the shared-demo race (19a) passes unchanged.
3. **Not run in D.2:** the Firefox and WebKit smoke (`--project=firefox-smoke --project=webkit-smoke`) and the earlier gates' evidence specs (they would rewrite those gates' committed screenshots).
4. **Reduced motion** comes from the shared D.1 display preferences and was not re-tested on D.2 screens; dark and high contrast are in screenshots `t01`–`t05`.

## Review closure (Issue #8)

**Run date:** 2026-11-01, on the closure code, same environment (production builds on ports 5373–5375, retries off, my own servers only).

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | clean |
| Lint, logical CSS, i18n parity | `npm run lint` | clean; 2 locales × 23 namespaces, **8,615 keys** each (+10: visitor labels, comment sharing, residents-only booking, simulated scheduler) |
| Unit and API tests | `npx vitest run --maxWorkers=2` | **1,236 / 1,236** in 41 files (+6: `operations.api.test.ts` +3 for the owner rulings, `Toast.test.tsx` 3) |
| End-to-end, full, Chromium | `E2E_PORT_OFFSET=200 npx playwright test tests/e2e/ tests/evidence/gated2.evidence.spec.ts --project=e2e --project=evidence --workers=3` | **333 / 333** in one 28.4-minute run with retries off: **e2e 322 / 322** (Gates B, C.1, C.2, D.1, S.1, D.2 and the closure; before: 307) and **evidence 11 / 11**. Accessibility inside it: **1,037 axe scans, 28,575 rule passes, 0 violations** |
| D.2 closure spec | `tests/e2e/d2-closure.spec.ts` (inside the full run) | **15 / 15** (also 30 / 30 run twice over before the full run) |
| Firefox and WebKit smoke | `npx playwright test tests/smoke/ --project=firefox-smoke --project=webkit-smoke --workers=2 --repeat-each=2` | **40 / 40**: every smoke spec (C.2, D.1 + S.1 integration and the new **D.2 smoke, 4 tests**) in Firefox and in WebKit, each run twice |
| Evidence | `gated2.evidence.spec` (inside the full run) | **142 screenshots** (111 before, +31: `c01`–`c10`) and 3 videos; every viewport and full-page capture exactly its viewport's width; element captures 288 px (the card inside a 320 px page) |

### What `d2-closure.spec` checks (all in a real viewport, nothing from full-page captures)

- **Element-level layout** (`tests/support/layout.ts`) on Home, Notices (list and an opened notice), Visitors, Repairs and Issues at **320 × 700** with **100, 150 and 200 %** text, English and Urdu: no text-bearing element or control off screen or outside the box that clips it; no control's visible text outside the control; no word split over lines when the column could hold it; the person's text size applied exactly (body `16 px × scale`); notice titles at least half the card wide and no more lines than words; the bill total exactly `Rs 5,200.00`, inside the card, at least the chosen text size; Pay carries the amount.
- **A seven-figure amount** (Rs 1,234,567.00) in the bill card at 320 px / 200 % Urdu (a probe: the figure and Pay re-rendered in the page with the component's own sizing rule).
- **The checks catch the reported defects:** with the `93889a3` markup of the notice card and of the bill card restored in the page, they fail (broken words; clipped or spilling figure).
- **Keyboard at 320 × 700, 200 %, both languages** (Home, Notices, Visitors): Tab through every control; each is checked at 12 points with `elementFromPoint` (what is really on top, z-order included) against the sticky header and the bottom bar; scrolled to the end, the page's last content is above the bar and its raised centre button.
- **Soft keyboard:** the guest invitation at 320 × 360, 200 % Urdu: every field in view between the drawer's header and footer while focused.
- **Toasts and drawers** (phone 320 × 700 at 200 % Urdu, and desktop), with the page's clock paused and moved on only a little at each step, so no toast expires because the machine is slow: three bookings in quick succession, then a drawer opens: none of the three covers it, a slot can be chosen at once and the drawer's button is the topmost element at its centre; closed again, the three are back. Inside a drawer: two comments in quick succession show one toast on the phone (two on the desktop), the drawer's comment field and close button stay uncovered, and closing a toast leaves the drawer open.

### Findings during the closure (all fixed)

| # | Finding | Fix |
|---|---|---|
| C1 | Notice titles one character per line at 320 px / 200 % (review) | title keeps ~10 em, badge wraps below; `break-words` instead of `overflow-wrap: anywhere`; the same on repair, issue and attention cards |
| C2 | Bill total and Pay clipped (review) | fluid total (never below the chosen text size), currency wraps before digits; Pay, proof and bill buttons wrap; the wallet icon steps aside when the card is too narrow (container query in em) |
| C3 | Visitor times and references hard to follow (review) | labelled lines; date and time each isolated and whole ("11:00 AM" no longer shows as "AM 11:00" after an Urdu date) |
| C4 | Toasts over a drawer's buttons (review). Found while closing it: at 200 % on a phone even two toasts lifted above the footer covered the drawer's own choices (the booking slots) | earlier toasts wait while a drawer or dialog is open (they were about the page behind it and were announced); toasts from inside it: one on a phone, two elsewhere, above the action bar; top layer |
| C5 | The notice tabs pushed *Archive* off screen at 320 px (found by the new checks; the shared control scrolls sideways) | `SegmentedControl wrap` (opt-in) on the D.2 resident pages |
| C6 | "A-101" and the account number broke at the hyphen on Home at 200 % (found by the new checks) | kept whole |
| C7 | The live announcer and the toasts were outside a drawer's accessibility tree while it was open (React Aria hides everything outside a modal) | both in React Aria's top layer |
| C8 | Firefox smoke: a font and a route chunk the browser cancelled when the test navigated on mid-load were logged as errors | the smoke waits for the app after switching person; only Firefox's own *download failed … NS_BINDING_ABORTED* font message is ignored, every other console error still fails |
| C9 | Gate B `security.spec` (*a lead created at Larkspur …*) failed once under load in the first closure run: `Ctrl+K` was pressed before the leads page had loaded, so the palette never opened (passed alone 4 / 4) | the test now waits for the loaded list before checking absence and pressing `Ctrl+K` (stricter, not weaker) |
| C10 | On the bill card in Urdu, "10 نومبر، 2026 · 15 دن باقی" read as "… 15 · 2026 …": the two numbers either side of the dot joined into one left-to-right run (found reviewing the new captures) | each part isolated (`<bdi>`); the same on the notice cards' date line |

### Notes

1. Full-page captures (`z01`–`z04`) still draw the fixed bottom bar mid-page; that is how a full-page capture works, not the page. The viewport captures `c01`–`c03` and the keyboard tests are the evidence for obstruction. Element captures `c04`–`c08` hide the shell's header and bottom bar while capturing, so the element shows alone.
2. **Not done:** manual NVDA, VoiceOver, TalkBack and real phones (browser text size and page zoom at 200 %) — [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md). Firefox and WebKit run the smoke only.
