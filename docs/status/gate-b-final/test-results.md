# Gate B final: test and accessibility results

**Run dates:** 2026-10-28.

**Environment**
- Production builds of all three apps: backoffice 5173, customer 5174, Platform HQ 5175.
- Node 20.20.1, Chromium (Playwright 1.64.1), axe-core 4.13.0.
- Retries **off**.
- Leftover servers stopped before every run.

## Summary

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × 15 namespaces, **3,016 keys** each (checkpoint 2: 2,585) |
| Unit and component tests | `npm test` | **501 / 501** in 27 files (checkpoint 2: 443 in 23) |
| Access-model vectors | `packages/contracts/src/access.vectors.json` | 47 vectors (party links replace the old party scope; `site_context_missing` added), all passing |
| Register | `npm run register:sync -- --check` | 394 rows, 335 distinct: **47 built, 12 partial, 276 planned** (checkpoint 2: 38 / 13 / 280); all 321 V2.1 IDs and addresses preserved |
| End-to-end | `npm run test:e2e` | **201 / 201 on two consecutive full runs** (runs 3 and 4, see below). Checkpoint 2: 180 |
| Accessibility (inside E2E) | axe in `a11y`, `get-started`, `portal`, `hq`, `access`, `security`, `hq-commercial` | **422 axe scans per run, 11,598 rule passes, 0 violations** (checkpoint 2: 378 / 10,317 / 0). New screens also checked for horizontal overflow at 390 px |
| Manual screen reader (NVDA) | [`NVDA_CHECKLIST.md`](NVDA_CHECKLIST.md) | **not performed**: needs a person running NVDA |

### Full runs

| Run | Result | Duration | Notes |
|---|---|---|---|
| 1 | 187 / 188 | 14.6 min | Before Part 2/3 UI. One failure: the register spec still expected FIN-002 to be planned → FIN-002 marked partial |
| 2 | 194 / 201 | 17.4 min | **Product bug found:** the command palette crashed for Finance when searching invoices (the new "Invoices" destination duplicated the Finance menu item's address; React Aria in production fails on duplicate keys). Fixed by removing the duplicate and de-duplicating palette entries by address. The other six failures were tests written against the old register counts or using pages that are now built as "planned" examples; all updated |
| 3 | **201 / 201** | 12.6 min | |
| 4 | **201 / 201** | 12.8 min | Identical axe totals: 422 scans, 11,598 passes, 0 violations |

## New and changed unit tests

| File | Tests | Covers |
|---|---|---|
| `packages/fixtures/src/security.test.ts` | 26 (new) | **§1 fail-closed:** every handler declares its access (4 allow-listed visitor endpoints); signed-out → 401 and no-access → 403 on **every** tenant endpoint with spies proving no handler ran; unlicensed module and missing permission refused before the handler; refused writes create no demo partition. **§2 two sites:** unit list, unit by id, hold, Plaza lead not matched to Plaza inventory, search, record checks (`site_not_licensed`, `site_context_missing`, other tenant's ids `out_of_scope`), dashboard limited to Towers, My access without commercial terms. **§3 residents:** party-link scope; unverified / ended / not started / other account / site / entity / flat; effective-dated instalments; cross-tenant party id (with and without the portal licensed); staff financial-record consistency; online payments per site. **§4 suspended:** 72 history invoices, search and record checks still work; operational endpoints refused; D-20 settlement. **§5 switching:** session lead invisible to another tenant in list, search, detail and record check; own reference series; practice records and notifications partitioned; same transport serves each tenant only its own units |
| `packages/fixtures/src/platform/commercial.test.ts` | 14 (new) | Policy versions with maker-checker by principal, approver roles, support refused; quotes follow the version in force by contract date; server validation of thresholds and approvers; edition exceptions; rate-card versions drive templates and the builder by date; catalogue refuses cycles and removals and dependency checks follow the version in force; requests follow the signup policy and approval opens a prefilled draft; Larkspur and Shalimar contract history; amendment impact (dependencies, delta, access by role, retention); amendment needing approval → scheduled; amendment today → in force; withdraw; usage correction, evidence (codes only, no personal data), billing calculation; audit trail of configuration steps with principals and changes, and no endpoint that edits it |
| `packages/fixtures/src/role-templates.test.ts` | 4 (new) | Starter sets as decided; every workspace has six roles; Shalimar's own facility manager role; every staff identity has exactly its role's permissions; HQ preview lists the tenant's roles with real permissions and refuses a resident role |
| `packages/ui/src/data/TransportProvider.test.tsx` | 2 (new) | Switching identity and organisation never renders another identity's answer and drops it from the cache |
| `packages/ui/src/workspace/tenantWorkspace.test.ts` | 6 (+2) | Suspension class of addresses; a suspended organisation's menu; site context refuses inventory for an unlicensed site |
| `packages/contracts/src/access.test.ts` | 50 | Vectors updated: party links (verified, dated, full financial relationship), `site_context_missing` |
| `tenant-access.test.ts`, `portal.test.ts`, `fixtures.test.ts`, `workspace-handlers.test.ts`, `platform.test.ts` | updated | 401 for signed-out sessions; Shalimar's own (empty) overview instead of a refusal; scheduled residents/visitors; 7 tenants and 2 trials in HQ (MRR unchanged, Crescent Bay is on trial) |

## End-to-end by spec (201)

| Spec | Tests | Change |
|---|---|---|
| `security.spec.ts` | 8 (new) | Two sites (reads, writes, search, direct URLs, header site context, My access); suspended co-operative (banner, invoices, paused areas, API); tenant switching through sign-out/sign-in; axe + overflow for the new backoffice screens in EN/UR at 1440 and 390 |
| `hq-commercial.spec.ts` | 12 (new) | Policy draft → refused submit → submit → approval by another person → in force → audit; rate cards and catalogue read-only for non-administrators; requests and signup policy; Larkspur contract history; amendment with impact preview → scheduled; withdraw a scheduled change; preview "as on" 1 Nov 2026 (scheduled areas and "Owners & Residents"); usage correction and evidence; axe + overflow on eight HQ screens in EN/UR at 1440 and 390 |
| `access.spec.ts` | 10 | Maintenance home: planned work listed as planned (no buttons), My access for non-administrators, the lab out of the menu, "People & Contacts" / "Customers & Buyers" |
| `shell.spec.ts` | 9 (+1) | Prototype tools hidden until switched on in Preferences; More opens Finance (invoices) instead of the lab |
| `hq-tenant360.spec.ts` | 9 | Shalimar shows 4 grants (2 scheduled); default preview role is the tenant's Administrator; the what-if uses Shalimar's own facility manager role |
| `hq.spec.ts` | 24 | "Planned" sample address now `/hq/users` (the catalogue is built) |
| `permissions.spec.ts` | 4 | New labels ("Customers & Buyers", role "Finance") |
| `register.spec.ts` | 16 | 394 rows / 335 distinct; FIN-002 partial; HQ-006/007/008/010/011/014/015/019 built; HQ-026–028 and GLOBAL-014 added |
| others | unchanged | `a11y` 15, `dashboard` 13, `onboarding` 18, `portal` 11, `get-started` 10, `crm` 9, `command-palette` 7, `overlays` 6, `reflow` 6, `customer-shell` 5, `locale` 5, `forms-keyboard` 4 |

## Evidence run

`npx playwright test --project=evidence tests/evidence/gatebfinal.evidence.spec.ts` → **21 / 21** (2.7 min): **128 screenshots** (33 views in English and Urdu; 31 at both desktop 1440 and phone 390, the palette search on desktop only and the More page on phone only) and **5 videos**.
Screenshots in `screenshots/` (desktop 1440 and phone 390, English and Urdu) and videos in `video/`:
see the report, §7.
