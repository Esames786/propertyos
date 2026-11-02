# Gate D.3: test, accessibility and localisation results

**Run date:** 2026-11-02. **Issue #9 final closure:** results on the closure code are in [§ Issue #9](#issue-9-final-closure-results) at the end; the sections before it are the `85f7eb7` run.

**Environment:**
- Production builds of all three apps on isolated ports: `E2E_PORT_OFFSET=300` (office 5473, resident 5474, HQ 5475; built with `VITE_OFFICE_ORIGIN` / `VITE_CUSTOMER_ORIGIN`).
- Node 20.20.1; Playwright (Chromium; Firefox and WebKit for the smoke); axe-core with WCAG 2.0/2.1/2.2 A and AA rules.
- Retries off, 3 workers.
- My own servers were restarted before each run; no other session's processes were touched. The machine is shared.

## Summary (final code)

| Check | Command | Result |
|---|---|---|
| GPT's checkpoint as received (`1a7d340`) | `npx tsc`, `npx eslint .`, `npx vitest run` | **did not build:** 19 TypeScript errors, 1 lint error, 2 failing tests (one of them a licensing test that could not have passed for the right reason). Fixed in `69dafef` → clean, 1,258 / 1,258 |
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × **24** namespaces (new: `community`), **9,171 keys** each (D.2 closure: 23 namespaces, 8,615 keys; GPT's keys under `operations` were replaced) |
| Unit and API tests | `npx vitest run` | **1,291 / 1,291** in 44 files (D.2 closure: 1,236 in 41).<br>New:<br>• `community.api.test.ts`: 23 tests through the fail-closed mock server;<br>• `community.test.ts`: 22 vectors from `chat-membership.vectors.json` (14) and `polls.vectors.json` (8);<br>• GPT's `chat-policy.test.ts` (9) kept.<br>GPT's `access`, `smart-groups` and `chat-handlers` tests were replaced: their cases are in the API test and the vectors |
| Register | `node scripts/sync-screen-register.mjs` | **437 rows, 353 distinct: 122 built, 35 partial, 196 planned** (D.2: 424 / 346; 118 / 32 / 196). All 321 V2.1 IDs and addresses preserved |
| End-to-end, full regression | `E2E_PORT_OFFSET=300 npx playwright test --project=e2e tests/e2e --workers=3 --retries=0` | **340 / 342** in one 30.8-minute run (every gate, B to D.3).<br>The 2 failures were test timing, not product behaviour (see below). After the test fixes, the two tests ran **30 / 30** with `--repeat-each=10`, on the same build |
| D.3 end-to-end | `tests/e2e/d3.spec.ts` (inside the full run) | **20 / 20** |
| Accessibility (inside E2E) | axe in every spec that scans | **1,143 axe scans, 31,538 rule passes, 0 violations** (D.2 closure: 1,037 scans); `d3.spec` had 106 of them |
| Evidence | `npx playwright test --project=evidence tests/evidence/gated3.evidence.spec.ts` | **9 / 9**: **67 screenshots** and **2 videos**; every screenshot exactly its viewport's width (checked by reading each PNG's width) |
| Firefox and WebKit smoke | `npx playwright test tests/smoke --project=firefox-smoke --project=webkit-smoke` | **28 / 28** (all 14 smoke tests of C.2, D.2, the integration and D.3, in both browsers) |
| Manual screen reader, devices, forced colours | [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md) | **not performed:** needs a person and devices |

### The two failures in the full run

1. **`d2-closure.spec.ts` › toasts after quick successive bookings (desktop):** `clock.pauseAt: Cannot fast-forward to the past`.
   - The test paused the page's clock 10 ms ahead of the time it had just read; on the loaded machine the clock passed that point first.
   - **Fix:** 1 second ahead (nothing on screen can expire within it; toasts last 8 s).
   - Then 20 / 20 (both sizes, ten times each).
2. **`society.spec.ts` › keyboard only:** the C.1 test presses Tab up to 40 times to reach the billing page's *Create* button.
   - D.3 adds five menu items for the building manager, so the button is further away.
   - **Fix:** 60, as Gate S.1 did when its items were added; the assertion (reachable by keyboard) is unchanged.
   - Then 10 / 10.

## What `d3.spec` covers

- **Reference 1, chat and moderation:**
  - Kamran's groups come from where he lives; the history starts at his join date, with the "new messages" line;
  - he sends a message; Sana sees it unread; she reports another message with a note;
  - Imran sees only reported messages (reporters not named) and removes it; everyone sees the marker; the office posts as *Office*.
- **Access in the chat:**
  - Sana opens the committee and Block B by address: "not in this group";
  - blocking a neighbour affects only her;
  - the office has only the whole community and the office team, and cannot open a block conversation;
  - the treasurer cannot open the chat.
- **Move-out while offline:** Junaid writes offline; the office records his move-out in another tab; on reconnect the message is refused and his groups are gone.
- **Reference 2, groups and policy:**
  - the committee's members and why (Rabia listed once);
  - a custom group for Block A owners (Kamran in, Sana out);
  - the policy: saving refused without the society's own legal check, then saved as a new version.
- **Reference 3, a poll:**
  - draft → open → three households answer (Rabia chooses her flat) → turnout only while open → close (totals) → publish → residents see the results;
  - the published gym poll shows results.
- **Local services:** Imran adds a provider without its number; he cannot vet it himself; Rabia vets it; Sana searches, recommends and reports; a reported provider is suspended and disappears.
- **Resources:** published to owners; a tenant never sees it; Kamran downloads the demo file; withdrawn with a reason.
- **Without the add-ons:**
  - the Community home keeps notices only; notices and notice detail work;
  - chat is "not in the plan"; the hub's API is refused;
  - the office has no community menu items and notices work.
- **Screens:**
  - 9 office and 6 resident screens in English and Urdu at 1440, 768 and 390 px: axe and no sideways scroll;
  - at 320 × 700 with 100, 150 and 200 % text in both languages: nothing clipped, spilled or broken mid-word, the chosen text size is applied, and the poll drawer is checked too;
  - keyboard walks over the Community home and a conversation at 320 px / 200 %: no focused control under the header or the bar, and the last content sits above the bar.

## Findings during verification (all fixed)

| # | Found by | Finding | Fix |
|---|---|---|---|
| F1 | `d3.spec` (move-out test) | Block and floor group ids (`block:…`) were URL-encoded in API paths, so those conversations answered 404 (GPT's page had the same pattern) | ids go into paths as they are (`[\w:-]`) |
| F2 | `d3.spec` axe | The message log was a list with `role="log"`, which removes the list semantics (axe: `listitem`) | the log is a region around the list |
| F3 | `d3.spec` 320 px layout | At 150–200 % text the group name was squeezed to a one-word column by the date beside it | the date and unread count wrap under the name |
| F4 | `d3.spec` 320 px layout | Hyphenated words broke across lines ("Al-Noor", "move-out", "A-104") | `KeepWords` keeps short hyphenated words whole (as D.2 did for flat codes) |
| F5 | `d3.spec` | The office's provider drawer closed after vetting (the provider left the filtered list) | the open record is read from all providers |
| F6 | screenshot review | Group previews were not clamped (`line-clamp` overridden by `block`) and clamped text counts as clipped | previews are shortened in text instead (60 characters) |
| F7 | screenshot review | The message actions button beside each bubble squeezed the text at 320 px | the button sits in the bubble's header |
| F8 | screenshot review | The committee preview listed Rabia twice (resident and staff sign-in) | one person, one entry, reasons merged |
| F9 | screenshot review | Office settings tabs on a phone cut "Reports" | two tabs plus *More* on phones (D.2's rule) |
| F10 | evidence review | On a phone at 200 %, an open conversation started below the fold (introduction, demo note and offline panel first) | with a conversation open on a narrow screen the conversation comes first |
| F11 | `register.spec` | The documents menu item claimed every `/backoffice/doc/…` address, so a planned Gate E page showed "not in plan" | the item matches its own address only |

GPT's checkpoint findings are in the report, §2.

## Notes

- **Evidence prefixes** (`docs/status/gate-d3/screenshots/`):
  - `a`: resident screens; `b`: office screens; both at 1440 px English and 390 px Urdu;
  - `c`: 320 × 700 at 200 % Urdu, viewport captures with the fixed bars in place (part of a page sits behind the bar, as on a phone);
  - `d`: without the add-ons; `e`: move-out while offline.
- **Full-page screenshots** of phone pages draw the fixed header and bar where the viewport was (as in D.2); the `c` captures show the real viewport.

## Issue #9 final closure: results

Run on the closure code: the two privacy corrections, their tests, the documents. Same environment: `E2E_PORT_OFFSET=300`, production builds, Node 20.20.1, retries off, 3 workers.

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × 24 namespaces, **9,178 keys** each (`community`: 554) |
| Unit and API tests | `npx vitest run` | **1,308 / 1,308** in 44 files (`85f7eb7`: 1,291) |
| Community suites | `npx vitest run packages/fixtures/src/community` | **71 / 71**:<br>• `community.api.test.ts` 33 (10 new for Issue #9);<br>• `community.test.ts` 29 vectors: membership 14, polls 15 (rewritten);<br>• `chat-policy.test.ts` 9 |
| Register | `node scripts/sync-screen-register.mjs` | unchanged: 437 rows, 353 distinct; 122 built, 35 partial, 196 planned (PORTAL-036, CHAT-001 and DOC-001 stay PARTIAL) |
| **Complete combined regression** | `E2E_PORT_OFFSET=300 npx playwright test --project=e2e --project=evidence tests/e2e tests/evidence/gated3.evidence.spec.ts --workers=3 --retries=0` | **358 / 358** in one 36.9-minute run on the closure code:<br>• **e2e 346 / 346** (every gate, B to D.3);<br>• **evidence 12 / 12**.<br>No retries, no test excluded, no assertion weakened |
| D.3 end-to-end | `tests/e2e/d3.spec.ts` (inside the run) | **24 / 24**. New:<br>• the evidence-hold journey in both apps;<br>• named-poll consent;<br>• dark mode then high contrast in English and Urdu |
| Accessibility (inside the run) | axe in every spec that scans | **1,179 scans, 32,530 rule passes, 0 violations**; `d3.spec` had 142 of them, including dark mode and high contrast |
| Firefox and WebKit smoke | `npx playwright test tests/smoke --project=firefox-smoke --project=webkit-smoke --retries=0` | **28 / 28** (all 14 smoke tests, both browsers) |
| Evidence | `tests/evidence/gated3.evidence.spec.ts` | **76 screenshots, 2 videos**; every viewport capture exactly its width |

### How the complete run was obtained (honestly)

- **The first attempt was aborted and does not count.** At test 48 every page load began to fail with `net::ERR_CONNECTION_TIMED_OUT` on `localhost:5473`.
  - Cause: a TUN VPN (`xray.exe` and `tun2socks.exe`) started on the shared machine during the run. It made IPv6 loopback (`::1`) hang; IPv4 loopback kept working (6 ms).
  - `vite preview` had bound `localhost` to `::1` only, so the servers kept listening but never answered.
  - I did not stop the VPN, which is the machine owner's. The preview servers were restarted on `127.0.0.1`; browsers fall back from `::1` to IPv4, and no test or address changed.
- **The full suite was then run again from the start.** A watchdog checked all three servers every 20 seconds and recorded no failure.
- **After the complete run, one change was made to the evidence spec only:** element captures hide the fixed header and bottom bar, as D.2's evidence does, so they are not drawn over tall cards. The D.3 evidence spec was then run again on its own (**12 / 12**) to regenerate the screenshots. No product code or other test changed after the complete run.

### What the new tests prove

**Poll privacy (P0):**
- The vectors cover 2–1, 5–1, one small option among several blocks, site − block, adjacent blocks, zero-count options (4–0–2 withheld, 4–3–0 shown), the gym poll and raised thresholds.
- Everything shown is checked to be safe: every option and complement, and site − block.
- The seeded published 5–1 poll shows residents and the office the turnout only.
- Repeated reads, another resident and unrelated query parameters return the same answer.
- A legacy stored snapshot with exact counts cannot leak (results are recomputed).
- A named poll is refused without consent. Only `polls.manage` sees who answered what; the treasurer and the guard are refused.
- In the browser: no option, percentage or list item is shown for a withheld poll.

**Retention and evidence (P1):**
- An expired message is in no resident or office conversation, preview or report action, with or without an open report.
- The moderators' queue shows it as *Kept as evidence* while the report is open; a resident or a non-moderator cannot reach the queue.
- After dismissal, or once a report decided earlier passes the period, the text is `null`; the decision and its note remain.
- A removed message keeps its marker inside the period and goes after it.
- A reporter who moves out loses the group at once; the report stays, without naming them.
- Another site's licence and another organisation are refused.
- In the browser: the same journey through both apps, and the policy page's count.

### Captures for the corrections

- `f01-poll-results-shown-320x700-200pct-{en,ur}` and `f02-poll-results-withheld-320x700-200pct-{en,ur}`;
- `b17-poll-anonymous-withheld-{1440-en,390-ur}` (the office);
- `g01-report-evidence-hold-1440-en`, `g02-policy-held-as-evidence-1440-en`, `g03-report-decided-text-gone-1440-en`.

Every other D.3 capture was regenerated from the same run, so they show the closure code.
