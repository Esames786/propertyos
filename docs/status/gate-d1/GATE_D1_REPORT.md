# Gate D.1: Identity, Personalization & Onboarding

**Status: built. Stopped for GPT and owner review.**
- Authorised by the owner's V3.2 approval (D-21, D-23, D-24, D-43, D-49). Other financial, legal, privacy and safety decisions stay conditional.
- **Gate D.2 and S.1 not started.**
- **Branch:** `feature/stage-1.5-premium-design`. `main` is untouched. The documentation branch `docs/nizam-v3.2-scope-review` was **not** merged; only the D.1 rows of its screen-register delta were adopted (§5).
- **Not done, as instructed:**
  - no Laravel, no production database migrations;
  - no live authentication;
  - no real WhatsApp, SMS or e-mail;
  - no real payments;
  - no merge.
- **How it runs:** in the browser, against the typed mock API. Everything is fictional (+92 399 numbers, example.com addresses).
- **Not claimed:** WCAG conformance. Automated checks pass; manual screen-reader and device checks are open ([`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md)).

Further detail:
- Working vs simulated, requirement by requirement: [`FUNCTION_MATRIX.md`](FUNCTION_MATRIX.md).
- Results of every check: [`test-results.md`](test-results.md).
- Screenshots and videos: [`screenshots/`](screenshots), [`video/`](video).

## 1. How to try it

`npm run dev` starts the office app (5173), the resident app (5174) and Platform HQ (5175).

| Where | Who | What to look at |
|---|---|---|
| Office → account menu → **Preferences** (`/backoffice/global/accessibility-preferences`) | anyone | **Personalization hub (GLOBAL-010).** Text size 100–200 %, light/dark/device, contrast up to high, palettes, English and Urdu fonts, spacing, reading mode, motion, sound and vibration, language, tours, reset. The page changes as you choose. The same hub is in the resident app (PORTAL-027) and HQ (HQ-024). |
| Office → **Residents → Resident app access** | **Imran Qureshi** (manager) | **RES-007.** Who is active, inactive, invited, never signed in; vacant flats. Invite one or many (RES-009): WhatsApp, SMS, e-mail or a printed letter. Nothing is sent; the drawer shows the message and **opens the link as the resident**. |
| The invitation link (resident app) | the invited person | **AUTH-007 → PORTAL-030.** The society and flat; confirm with the code (shown on screen); then language, text size (skipped if already chosen), light or dark, and what to do next; then home. |
| `/shared/auth/customer-portal-login` | a resident | **AUTH-006.** Mobile number and code. A number without an account gets the same answer. Demo numbers are offered. |
| Office → account menu → **Profile and devices** | **Rabia Hashmi** (committee secretary, also an A-201 owner) | **GLOBAL-008.** Contact and message consents; signed-in devices (GLOBAL-016); security activity; **Switch to the resident app** (GLOBAL-015). In the resident app: Profile (PORTAL-024), devices (PORTAL-041), My data. |
| Office → **Administration → Users and sessions** | Rabia | **ADM-003 (sessions part).** The organisation's staff, their office sessions and activity; end one session or all. |
| Office → **Data and privacy** | Rabia, then **Ayesha Malik** (treasurer) | **ADM-024.** Rabia asks for an export (preview of what she may include). Ayesha approves, narrows or declines. Only Rabia downloads. Privacy requests from residents. |
| Office → Administration → **Organisation colours** (`/backoffice/adm/branding`, or Ctrl+K) | Rabia | **ADM-022.** A preset for everyone, shown at once; a custom brand colour is checked against every contrast pair. |
| Office → Residents → **Household members**; resident app → **Household**, **My properties** | Imran; Rabia | **RES-004, PORTAL-025, PORTAL-002, PORTAL-003.** |

## 2. What D.1 adds

### 2.1 Personalization (one model, three apps)

- **One record per person and organisation**: `pref:display:v1:<app>:<organisation>:<person>`, the same key C.2 used. Version 2 holds text size, theme, contrast, palette, density, fonts, motion, reading mode, sound, volume, vibration, language and when the size was chosen (`packages/ui/src/preferences/personal.ts`).
- **C.2 compatibility**: a C.2 record (text size only) is upgraded in place and keeps *chosenAt*, so **existing residents are not asked again** (owner, D.1).
- **Applied as attributes on `<html>`** (`data-theme`, `data-contrast`, `data-palette`, `data-density`, `data-reading`, `data-font-latin`, `data-font-urdu`, `data-motion`, `data-text-scale`) and `--text-scale`; the design tokens do the rest (`packages/tokens/src/theme.css`).
- **Priority**: personal accessibility first. High contrast replaces palettes and the organisation's colours; a person's own palette wins over the organisation's.
- **Every colour set is contrast-tested**: dark, more contrast, high contrast (light and dark) and each palette in light and dark (`contrast.test.ts`).

### 2.2 Identity (mock API, `packages/fixtures/src/identity/`)

- **Sessions**: each sign-in gets a session id; the first request records it with the device (kind, platform, browser only). A **session gate** in front of every endpoint refuses ended sessions (`session_ended`) and residents whose access was closed (`portal_access_revoked`). The apps sign out and say why.
- **Invitations**: bound to organisation + site + flat + verified person, re-checked when accepted; single use; 14 days; resend at most 3 times a week; only on channels the person agreed to; never without a verified link.
- **One-time codes**: 6 digits, 10 minutes, 3 tries. Shown on screen (nothing is sent).
- **App switch**: a one-time ticket (two minutes) that only the other app can redeem; each app starts its own session.
- **Exports**: what the requester could open themselves, re-checked when the file is made; personal or financial data needs approval by someone else, who can only remove datasets; 7 days to download.
- **Privacy requests**: answered within 30 days; deletion removes contacts and resident app access and keeps bills and payments without the name.
- **Public endpoints** (the token or code names the organisation) are declared as such and covered by the security test that every handler declares its access.

### 2.3 Screens (15 distinct, plus states)

| Screen | Status | Notes |
|---|---|---|
| GLOBAL-010 hub (office) | built | |
| PORTAL-027 hub (resident) | built | extends C.2 |
| HQ-024 hub (platform) | built | no organisation colours on the platform |
| GLOBAL-008 profile | built | tabs: profile, signed-in devices (GLOBAL-016), security activity; switch (GLOBAL-015) |
| PORTAL-024 profile | built | tabs: profile, devices + activity (PORTAL-041), my data; switch |
| PORTAL-030 welcome | built | language → text size (C.2 step, skipped when chosen) → theme → done |
| AUTH-006 phone sign-in | built | |
| AUTH-007 accept invitation | built | new |
| RES-007 resident app access | built | new; with RES-009 drawer and SITE-009 flat tab |
| RES-004 household members | built | |
| PORTAL-025 household | built | society edition |
| PORTAL-002 my properties | built | society edition |
| PORTAL-003 Property 360 | built | society edition |
| ADM-022 organisation colours | built | module decision, §6 |
| ADM-024 data & privacy | built | new |
| ADM-003 user workspace | partial | sessions part only; the rest stays at Gate G |

## 3. The three reference experiences

1. **One hub, three apps** (video `reference-1-personalization-en.webm`; screenshots `p*`). Text size, theme, palette, contrast, fonts, density, reading mode, motion, sound in the office app, the resident app and HQ; per person and organisation; reset.
2. **Invitation → acceptance → onboarding → home** (videos `reference-2-invitation-to-home-en/ur.webm`; screenshots `r*`). The office invites by printed letter; the resident opens the link, a wrong code counts down, the right code joins; welcome in three steps; home; the office sees the resident as active; the link cannot be used twice.
3. **Devices, mode switch, privacy and export** (video `reference-3-devices-switch-data-en.webm`; screenshots `s*`). Sign out another device; switch to the resident app and back; a correction request; an export narrowed by the treasurer and downloaded by the requester.

## 4. Owner approvals, as applied

| Decision | Applied |
|---|---|
| D-21 (27 → 31 modules; SOS restricted) | No SOS work. D.1 uses existing modules only (`core`, `resident_portal`, `residents`, `white_label`). |
| D-23 (sequence) | D.1 only; D.2 and S.1 not started. |
| D-24 (Gate D split into D.1, D.2, D.3) | This is D.1. |
| D-43 (adopt only an authorised milestone's register rows) | Only the 13 D.1 delta rows, §5. |
| D-49 (notices independent of the community hub) | Not touched in D.1 (no notices work). |

## 5. Screen register

**Adopted from the V3.2 delta (D-43), D.1 rows only:**
- **New screens (3):** RES-007, AUTH-007, ADM-024.
- **New states (5):** RES-009, SITE-009, GLOBAL-015, GLOBAL-016, PORTAL-041.
- **Modified (5):** GLOBAL-008, PORTAL-024, PORTAL-030, ADM-003, SITE-006 (adds the Resident app tab).
- Result: **404 rows, 340 distinct screens** (was 396 / 337); `npm run register:sync` reports 82 built, 27 partial, 231 planned. `register.spec` updated to the new counts.

**Status and notes updated for what D.1 built:** GLOBAL-008, GLOBAL-010, HQ-024, PORTAL-024, PORTAL-027, PORTAL-030, AUTH-006, ADM-003 (partial), ADM-022, RES-004, PORTAL-002, PORTAL-003, PORTAL-025.

**C.2 text-size notes** (owner request): PORTAL-027 and PORTAL-030 now record what C.2 implemented (first-run step, 100–200 % stops, never asked again) and how D.1 reuses it.

**C.2 documentation fix** (owner request): `docs/status/gate-c2/MANUAL_VERIFICATION.md` row D3 no longer mentions the removed *verify by hand* option; it describes *wait for the bank line* and the exception approval.

## 6. Decisions made in D.1 (please confirm or correct)

1. **ADM-022 module**: preset palettes are **core** (every organisation); a custom brand colour needs **white_label** and must pass every contrast pair in light and dark. The register row changed from `white_label` to `core` accordingly. No demo organisation licenses white label, so saving a custom colour shows the lock; checking and previewing one works.
2. **Rabia Hashmi is the dual-role person**: committee secretary (administrator role) in the office app and A-201 owner in the resident app, one principal. She demonstrates the switch.
3. **Invited residents** are the Al-Noor register's other people as resident identities, hidden from the demo sign-in list. They get in only through an accepted invitation or phone sign-in, while their access is active.
4. **Preferences are stored in this browser**, per person and organisation (as in C.2). A real deployment keeps them with the account.
5. **Compact spacing** applies only with a mouse on screens from 768 px; touch keeps full-size targets.
6. **App switch** opens the other app in the same tab. The first app stays signed in; each app has its own session and cache. The mock paths are `POST /me/app-switch` and `POST /app-switch/:token` (the delta named `POST /session/switch-app`).
7. **ADM-024 in the prototype is for society organisations**, whose data sources are wired. It is offered to whoever requests exports, approves them or answers privacy requests (a new *any of these permissions* rule for menus and pages, the same decision the server makes).
8. **Exports** need approval when they hold personal or financial data; they expire 7 days after approval; the file is generated at download for the requester as they are then.
9. **PORTAL-002, PORTAL-003 and PORTAL-025** are built for the society edition; the developer edition keeps the planned page.
10. **The office profile address** (`/backoffice/global/profile--preferences`, GLOBAL-008) now opens the profile. The account menu's *Preferences* opens the hub (GLOBAL-010).
11. **One C.1 regression assertion changed** (`society.api.test`): after submitting a run, the manager's dashboard now starts with their own D.1 work (expired invitations, a household request), which ranks above work waiting for someone else under the existing "yours first" rule. The test now finds the *approve run* task by its key and still checks that it waits for someone else; the treasurer's assertions are unchanged.
12. **Two small changes to earlier screens found in the D.1 visual review**:
    - text on photos (project showcase, resident home, construction page) uses a new `on-image` colour that stays white in every theme; in dark mode it had turned dark on a dark scrim;
    - below 360 px the resident header's language button is icon-only (its name is still spoken), so the organisation name fits at 320 px in Urdu;
    - choice cards (the hub, the welcome) are named by their label only, with the description read as a description; a Stage 1.5R test had matched a description by accident.
13. **The resident app's side navigation** gains *My properties* and *Household* for society residents (and *Profile* for them). The developer edition keeps its Stage 1.5R rail; *Profile* is in its account menu.

## 7. Limitations and what is not in D.1

- **Simulated**: message delivery (WhatsApp, SMS, e-mail), one-time codes (shown on screen), printed letters (print view only), export files (fictional rows, labelled), other devices and their approximate places (seeded), sign-in methods other than the demo's.
- **Not in D.1**: notices and the community hub (D.2/D.3), SOS, real identity provider, Laravel.
- **ADM-003** is partial: only staff sessions.
- **Manual checks** (screen readers, real devices, printing, forced colours) are listed in [`MANUAL_VERIFICATION.md`](MANUAL_VERIFICATION.md).

## 8. Evidence

- Screenshots: **123** in `screenshots/<name>-<width>-<en|ur>.png` (21 D.1 screens at 1440 and 390 in English and Urdu; the reference journeys; personalization variants: dark, high contrast, 200 %, Nastaliq, reading/compact, 320 px). Every one is exactly its viewport's width.
- Videos: `video/reference-1-personalization-en.webm`, `video/reference-2-invitation-to-home-en.webm`, `video/reference-2-invitation-to-home-ur.webm`, `video/reference-3-devices-switch-data-en.webm`.
- Tests and accessibility results: [`test-results.md`](test-results.md). In short: unit and API **1,115 / 1,115**; E2E **267 / 267** (Gates B, C.1, C.2 and D.1); **764 axe scans, 0 violations**; Firefox and WebKit smoke **18 / 18**.
