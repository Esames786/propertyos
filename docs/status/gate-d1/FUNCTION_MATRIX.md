# Gate D.1: function matrix (working vs simulated)

Gate D.1 is **Identity, Personalization & Onboarding**, authorised in the owner's V3.2 approval (D-21, D-23, D-24, D-43, D-49). Everything runs in the browser against the typed mock API. **Working** means it works end to end against the mock server's state and rules, and the server enforces the rule (not only the screen). **Simulated** means the prototype stands in for something a real system does outside the browser.

**Paths:**
- Unit and API tests:
  - `identity.api.test` is `packages/fixtures/src/identity/identity.api.test.ts`;
  - `personal.test` is `packages/ui/src/preferences/personal.test.ts`;
  - `brand.test` is `packages/tokens/src/brand.test.ts`.
- E2E: `identity.spec` is `tests/e2e/identity.spec.ts`.
- Evidence: `docs/status/gate-d1/screenshots/<name>-<width>-<en|ur>.png` and `docs/status/gate-d1/video/*.webm` (from `tests/evidence/gated1.evidence.spec.ts`).

## A. Shared personalisation (GLOBAL-010, PORTAL-027, HQ-024)

| # | Function | Working | Simulated | Built in | Tests | Evidence |
|---|---|---|---|---|---|---|
| A1 | Text size 100 / 112 / 125 / 150 / 175 / 200 % | Applies at once to the whole page; kept per person and organisation | none | `PersonalizationHub.tsx`, `TextSize.tsx`, `DisplayPreferences.tsx` | `identity.spec` hub; `personal.test` | `p01-hub-office-*`, `p06-hub-200-*` |
| A2 | Light, dark, follow the device | Working | none | `ThemeChoice`; `theme.css` dark set | `identity.spec` hub; `contrast.test` (dark pairs) | `p04-hub-dark-ocean-*`, `p10-resident-home-dark-*` |
| A3 | Standard, more and high contrast | Working; high contrast pauses palettes and the organisation's colours | none | `theme.css` high-contrast sets; `resolve()` | `personal.test`; `identity.spec`; `contrast.test` | `p05-hub-high-contrast-*`, `p13-*` |
| A4 | Palettes (organisation, Evergreen, Ocean, Indigo, Warm) | Working | none | `theme.css` palette blocks | `contrast.test` (every palette, light and dark) | `p04-*` |
| A5 | English fonts (Geist, the device's, Atkinson Hyperlegible); Urdu fonts (Naskh, Nastaliq) | Working | none | `fonts.css`, `theme.css` | `identity.spec` (Nastaliq) | `p07-hub-nastaliq-*`, `p08-*` |
| A6 | Reduced motion, density, reading mode | Working (compact applies only with a mouse on screens from 768 px; touch keeps full targets) | none | `theme.css`; `data-decorative` | `personal.test`; `identity.spec` | `p08-hub-reading-compact-*` |
| A7 | Sound (quiet / normal) and vibration | Working where the device supports it | none | `sound.ts`, `Toast.tsx` | manual (see `MANUAL_VERIFICATION.md`) | `p01-*` |
| A8 | Reset to default | Working; keeps the language and the fact a size was chosen | none | `resetAll()` | `personal.test`; `identity.spec` | — |
| A9 | Kept per person **and** organisation; the essentials (text size, contrast, motion, reading mode, fonts, language) **shared across the office and resident apps** (D.1 closure); theme, palette, spacing, sound, tours per app | Working: `/me/preferences` per person and organisation, reconciled on sign-in, app switch and window focus; safe first-sync merge of older records | Kept in this browser and in the demo's shared data; a real system keeps it with the account | `DisplayPreferences.tsx`, `SharedPreferences.ts`, `personal.ts` (`reconcileShared`) | `personal.test`; `identity.api.test` (/me/preferences); `identity.spec` (Rabia switching; another person unaffected) | `x01`–`x05`, `video/closure-shared-essentials-en.webm` |
| A10 | Accessibility ahead of organisation colours | Working | none | `resolve()`; ADM-022 | `personal.test`; `identity.spec` | `b01-*` |
| A11 | C.2 residents are not asked again | Working (C.2 record migrated, choice kept) | none | `migrate()` | `personal.test`; `identity.spec`; C.2 `collections.spec` | `p02-hub-resident-*` |
| A12 | Phone header and settings navigation (D.1 closure) | Working: the site's short name, initials or icon (never cut); *All settings* menu and scroll hint; office bar steps aside while typing; focus never under the header or bar; a section address opens at its section (a full load never takes the previous page's scroll position) | none | `ProjectSwitcher.tsx`, `PersonalizationHub.tsx`, `BottomNav.tsx`, `AppShell.tsx`, each app's `RootLayout.tsx` | `identity.spec` (reachability at 320/390, 100/200 %, keyboard open; section addresses) | `v01`–`v07` |

## B. Resident invitations and login status

| # | Function | Working | Simulated | Built in | Tests | Evidence |
|---|---|---|---|---|---|---|
| B1 | Who is active, inactive, invited, never signed in; vacant flats; last sign-in date and device family | Working | Seeded sign-in history is fictional | RES-007 `PortalAccessPage.tsx`; `GET /portal-access` | `identity.api.test`; `identity.spec` | `i01-portal-access-*` |
| B2 | Send, resend, cancel; expiry after 14 days; resend limit 3 a week | Working | **Delivery**: WhatsApp, SMS and e-mail are not sent; the drawer shows the message a real system would send and the link | RES-009 `InviteDrawer.tsx`; `POST /portal-invitations` | `identity.api.test` | `r01-*`, `r02-*` |
| B3 | Consent and verification rules | Working: never without a verified link; only on channels the person agreed to; printed letters need no consent | none | server `invite()` | `identity.api.test` | `r01-*` |
| B4 | Printed letter | Working (print view) | Nothing is posted | `PrintSheet`; print CSS in `theme.css` | `identity.spec` | `r02-invite-printed-letter-*` |
| B5 | Accept: organisation + site + flat + verified person, re-checked at acceptance | Working | **One-time code**: shown on screen, not sent | AUTH-007 `InvitationPage.tsx`; public `GET/POST /invitations/:token…` | `identity.api.test` (binding, used, cancelled, other organisation, wrong code count-down and lock) | `r03-*`, `r04-*` |
| B6 | Close a resident's access | Working: their sessions end; they are told why | none | `POST /portal-access/:party/revoke` | `identity.api.test`; `identity.spec` | — |
| B7 | Flat 360 › Resident app | Working | none | SITE-009 `FlatPortalTab.tsx` | `identity.spec` | `i02-flat-portal-tab-*` |
| B8 | Phone sign-in | Working; the answer never reveals whether a number has an account | **Code** shown on screen; demo numbers offered as shortcuts | AUTH-006 `PortalSignInPage.tsx` | `identity.api.test`; `identity.spec` | `i03-phone-sign-in-*` |
| B9 | Welcome: language, text size (skipped if chosen), light or dark, what next | Working | none | PORTAL-030 `WelcomePage.tsx` | `identity.spec` | `r05-*` … `r09-*` |

## C. Devices and sessions

| # | Function | Working | Simulated | Built in | Tests | Evidence |
|---|---|---|---|---|---|---|
| C1 | See devices, this device marked, last used | Working | The other devices are seeded; places are approximate city names, made up | `DevicesPanel` (GLOBAL-016, PORTAL-041) | `identity.api.test` | `d02-*`, `d05-*` |
| C2 | Sign out another device; all other devices | Working: that device is refused on its next request | none | `POST /me/sessions/:id/revoke`, `/sign-out-others` | `identity.api.test`; `identity.spec` | `s01-*`, `s02-*` |
| C3 | Security activity | Working | Seeded history is fictional | `SecurityActivity` | `identity.api.test` | `d03-*` |
| C4 | Administrators manage staff sessions only in their organisation | Working (other organisations' people are "not found"; ending needs `sessions.manage`) | none | ADM-003 `UserWorkspacePage.tsx`; `/admin/users…` | `identity.api.test`; `identity.spec` | `d07-staff-sessions-*` |
| C5 | No cache leak between people or organisations | Working (query cache keyed by person; sign-out clears the session) | none | `TransportProvider`, `SessionProvider` | `identity.spec`; C.2 `security.spec` | — |

## D. Resident / management mode

| # | Function | Working | Simulated | Built in | Tests | Evidence |
|---|---|---|---|---|---|---|
| D1 | Active-role indicator | Working ("Management" / "Resident"; icon and words) | none | `RoleModeChip` | `identity.spec` | `s03-*`, `s04-*` |
| D2 | Switch between the separate apps | Working: one-time ticket, two minutes, only the other app can redeem it; each app starts its own session | Both apps run on one machine in the demo | GLOBAL-015 `AppSwitch.tsx`; `/me/app-switch`, `/app-switch/:token` | `identity.api.test`; `identity.spec` | `s03-*`, `s04-*` |
| D3 | No management access from resident mode | Working: the resident app has no staff routes; the server answers by the persona of each app | none | separate apps and sessions | `identity.spec` | `s04-*` |

## E. Data export and privacy

| # | Function | Working | Simulated | Built in | Tests | Evidence |
|---|---|---|---|---|---|---|
| E1 | Request with category choice and a preview of what the requester may include | Working: the server decides per dataset (licence, role, sites) and counts rows | none | ADM-024 `ExportDrawers.tsx`; `/data-exports/preview` | `identity.api.test` | `s06-new-export-*` |
| E2 | Approval by someone else; narrow only, never widen; decline with a reason | Working | none | `/data-exports/:id/decide` | `identity.api.test`; `identity.spec` | `s07-*`, `s08-*` |
| E3 | Download by the requester, generated at download time, expiry after 7 days | Working | **File** contains fictional demo rows and says so | `/data-exports/:id/download`; `saveFile` | `identity.api.test`; `identity.spec` | `s09-*` |
| E4 | Nothing beyond the requester's authorisation | Working (re-checked when the file is made) | none | server `preview()` | `identity.api.test` | — |
| E5 | Residents: my data, copy, correction / deletion requests | Working; deletion removes contacts and app access, keeps bills and payments without the name | none | PORTAL-024 `MyDataPanel.tsx`; ADM-024 privacy tab | `identity.api.test`; `identity.spec` | `d06-*`, `d09-*`, `s05-*` |

## F. Households, properties, organisation colours

| # | Function | Working | Simulated | Built in | Tests | Evidence |
|---|---|---|---|---|---|---|
| F1 | Household (names and roles only) and requests to add someone | Working | none | PORTAL-025 `HouseholdPages.tsx` | `identity.api.test`; `identity.spec` | `h02-*` |
| F2 | Office: households and requests (approve adds as verified; decline with a reason) | Working | none | RES-004 `HouseholdMembersPage.tsx` | `identity.api.test`; `identity.spec` | `h01-*` |
| F3 | My properties and Property 360 (own balance per flat, own bills) | Working (society edition) | Developer edition keeps the planned page | PORTAL-002/003 | `identity.spec` | `h03-*`, `h04-*` |
| F4 | Organisation colours: preset for everyone, instant preview | Working | none | ADM-022 `BrandingPage.tsx`; `useOrgAppearanceSync` | `identity.api.test`; `identity.spec` | `b01-*` |
| F5 | Custom brand colour with guardrails | Working check (every contrast pair, light and dark; nearest passing shade suggested) | Saving needs the White-label add-on, which no demo organisation licenses | `brand.ts` | `brand.test`; `identity.api.test` | `b01-*` |
