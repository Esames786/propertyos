# D.1 + S.1 integration: test, accessibility and localisation results

**Run dates:** 2026-10-31 (Pakistan time).

**Environment:**
- Branch `integration/d1-s1` (base `7ddc606` + S.1 `0348317` + the integration fixes), worktree `D:/laragon2/www/propertyos-int`.
- Production builds of all three apps on isolated ports (`E2E_PORT_OFFSET=100`: office 5273, resident 5274, HQ 5275).
- Node 20.20.1, Playwright 1.64.1 (Chromium; Firefox and WebKit for the smoke), axe-core with WCAG 2.0/2.1/2.2 A and AA rules.
- Retries **off**. All test artifacts, traces, reports and temporary files on drive **D:** (`test-results-int/`, `TEMP`/`TMP` redirected): drive C: had under 1 GB free.
- The machine was shared with other sessions' load tests; runs used 3 workers.

## Summary (final code of this branch)

| Check | Command | Result |
|---|---|---|
| Screen register | `npm run register:sync` | 415 rows, 344 distinct screens (92 built, 32 partial, 220 planned); regenerated **unchanged** |
| Types | `npm run typecheck` | clean |
| Lint | `npm run lint` | clean (ESLint, logical CSS, i18n parity: 2 locales × 22 namespaces) |
| Unit and API tests | `npx vitest run` | **1,197 / 1,197** in 38 files |
| Translations | key parity, en-PK and ur-PK | **7,240** keys each; none missing on either side |
| Complete E2E regression (Chromium) | `npx playwright test --project=e2e` | **294 / 294** in 23.3 min (3 workers, retries off), commit `5973b12` |
| axe-core (inside the regression) | WCAG 2.0/2.1/2.2 A and AA | 909 scans, 25,202 passing checks, **0 violations** |
| Firefox and WebKit smoke | `--project=firefox-smoke --project=webkit-smoke` | **12 / 12** (per engine: 3 C.2, 3 integration) |
| Evidence | `--project=evidence` | integration evidence 5 / 5; C.1 payer-change video 1 / 1 |
| Screenshot widths | each PNG against its viewport | 46 / 46 exact (no sideways overflow) |

Focused runs on the way (every failure is listed under *Findings*):

| Run | Specs | Result |
|---|---|---|
| Focused D.1 and S.1 | `identity`, `s1`, `collections`, `integration` | 71 passed, 5 failed (all in the new `integration.spec`), then `integration.spec` alone 7 / 7 |
| Complete regression on `d3950e2` | all E2E | 294 / 294 in 27.0 min; axe 909 scans, 0 violations |
| Demo bridge fix `81e86d0` | cross-app specs | 31 / 31 |
| After the evidence review | `collections`, `s1`, `integration`; D-46 evidence | 48 / 48 E2E; evidence 1 / 1 |
| Firefox and WebKit | `c2.smoke`, `integration.smoke` | 10 / 12, then 12 / 12 (see Findings) |

## New tests

- **`packages/fixtures/src/clock.test.ts` (6):** 23:59:59 and 00:00:00 in Karachi both stay on the demo date and read 11:59 pm and 12:00 am; a 03:12 action shows on the demo date (the old stamp showed the next day); offsets of Asia/Karachi, Asia/Kolkata and UTC; Al-Noor configured as Asia/Karachi; D.1's `nowStamp` uses the same clock; seeded UTC stamps and new offset stamps order by instant.
- **`finance.api.test.ts` (S.1, +1 and extended):** a voucher prepared at 23:59:59 and posted at 00:00:30 keeps its 26 October date and its October period; office cash waits for a second count before it clears transfer dues; B-403's resident app access is identical before and after the approved transfer, and nothing is created for the buyer (Issue #6 item 7).
- **`collections.api.test.ts` (C.2, rewritten for D-46):** office cash is refused until allowed and limited by the site; then it waits for a second count (the collector is refused with 403, a wrong count with `count_mismatch`); only the treasurer's confirmation creates the payment (`witnessed`) and its receipt.
- **`tests/e2e/integration.spec.ts` (7):**
  1–4. The cashbook as cards at 320 px with 200 % text (Urdu, English) and at 390 px (Urdu 100 %, English 200 %): each card's reference and payer or payee match the server's lines, nothing sticks out or is cut, no sideways scroll, Tab reaches each card's record in order, axe passes, and the drill-down opens the record.
  5. The desktop keeps its table at 100 % and reads cards at 200 % text.
  6. An approval at 23:59 and a posting at 00:00 (Karachi, browser clock fixed by Playwright) both read 26 Oct 2026; the voucher's line stays in October.
  7. D-46: recorded cash shows as waiting on the finance dashboard, the cashbook's pending list, the account and the society dashboard (task offered to the treasurer); the collector cannot confirm it.
- **`collections.spec` (C.2) office cash journey, extended for D-46:** the resident sees the cash handed in and the bill unpaid; the treasurer finds it under *Billing and collections* in Approvals, counts and confirms; then the receipt and the resident's partly paid bill.

- **`tests/smoke/integration.smoke.spec.ts` (new, Firefox and WebKit):** cashbook cards at 320 px with 200 % Urdu (no part of a card outside it, no sideways scroll); the desktop table at 100 %; D-46 from recording the cash to the treasurer's count and the receipt.

## Findings, and what was done

Retries were off throughout. No test was removed, skipped or loosened.

1. **The first complete run did not start.** The Playwright runner could not load the tenant directory, because it imported the i18n package root, which loads JSON locale files. **Fixed in code:** it now imports from `@repo/i18n/format`.
2. **5 failures, all in the new `integration.spec`, were mistakes in the test itself:**
   - a voucher's drill-down stays on the cashbook address (`?voucher=`), so the test now checks the link's address;
   - the line's source is `cash_voucher`, not `voucher`.

   After the corrections it passed 7 / 7, and then within every complete run.
3. **5 axe tests timed out in a second complete run.** Unit tests were running at the same time on an already loaded machine. The complete run repeated with nothing else running passed 294 / 294. These were not product failures; the same tests pass in every later run.
4. **The evidence screenshots showed copy that contradicted D-46.** The office payment drawer still said "A receipt is issued straight away" and "Record and issue receipt". **Fixed:** see the integration report §2.5. `collections.spec` now checks the form makes no such promise.
5. **The evidence screenshots showed confirmed lines warned "More than owed now (Rs 2200.00)".** This is an S.1 defect: the warning was compared with the balance after the line's own payment. **Fixed:** warnings apply only to lines not yet settled, and the amounts read as money. `collections.api.test` and `collections.spec` cover it.
6. **The new cashbook smoke failed at its desktop step in Firefox and WebKit.** The test rewrote the stored text size in the middle of the test, but D.1 keeps the person's display choice in its own preferences, so the page correctly stayed at 200 % and showed cards. **Fixed in the test:** the desktop table is a separate test from a clean start. Then 12 / 12. The card half had passed in both engines.
7. **The demo link failed between sibling subdomains** (found on the preview deployment, not by a test): the resident app on `portal.<domain>` could not reach the office's demo bridge on `<domain>`. **Fixed** in `81e86d0`; the cross-app specs passed 31 / 31 and the live check passed.

## Not run here

- Earlier gates' evidence suites (they record their own deliveries); only C.1's payer-change video was rerun, for item 3.
- Screen readers, real phones, printing and forced colours: [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md).
