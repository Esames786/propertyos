# Gate B checkpoint 2: test and accessibility results

**Run date:** 2026-10-27.

**Environment**
- Production builds of all three apps: backoffice 5173, customer 5174, Platform HQ 5175.
- Node 20.20.1, Chromium (Playwright 1.64.1), axe-core 4.13.0.
- Retries **off**.
- Leftover servers were stopped before every run, so nothing ran against a stale build.

## Summary

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | clean |
| Lint (ESLint, logical-CSS RTL guard, i18n parity) | `npm run lint` | clean. 2 locales × **15 namespaces** (new: `workspace`), **2,585 keys** each |
| Unit and component tests | `npm test` | **443 / 443** in 23 files (checkpoint 1 closure: 419 in 20) |
| Register | `npm run register:sync -- --check` | 390 rows, 331 distinct: **38 built, 13 partial, 280 planned** (checkpoint 1: 34 / 13 / 284); all 321 V2.1 IDs and addresses preserved |
| End-to-end | `npm run test:e2e` | **180 / 180 on two consecutive full runs** (runs 9 and 10: 10.4 and 11.5 min, 4 workers). Checkpoint 1: 159 |
| Accessibility (inside E2E) | `a11y`, `get-started`, `portal`, `hq`, `access` specs | **378 axe scans per run, 10,317 rule passes, 0 violations**. Checkpoint 1: 342 / 9,277 / 0 |
| Evidence | `npx playwright test --project=evidence tests/evidence/gateb2.evidence.spec.ts` | 15 / 15; 86 screenshots, 4 videos |

## New unit tests (24)

| File | Tests | Covers |
|---|---|---|
| `packages/fixtures/src/tenant-access.test.ts` | 19 | HQ and the workspace read the same tenant directory. The maintenance-only client's grants. **Nine developer endpoints refused with `module_not_licensed`** (reads and writes) although the role holds the permissions. Search, people, notifications, dashboard and demo overview never return Larkspur's records to another organisation. The plan page (administrators only). Menu targets use the same layers as the server. Larkspur unchanged |
| `packages/ui/src/workspace/tenantWorkspace.test.ts` | 4 | The address rule shared by the backoffice guard and the HQ preview: module from the register, permission from the owning area; a maintenance-only plan; a grant that starts later is not yet in force |
| `packages/ui/src/layout/RelatedDrawer.test.tsx` | 1 | Related records the person may not open are listed with the reason, not linked |
| `platform.test.ts` | updated | HQ now has 6 tenants; MRR Rs 62,840.00 (+ Shalimar Court Rs 3,060.00) |

## End-to-end by spec (180)

| Spec | Tests | Change in checkpoint 2 |
|---|---|---|
| `hq.spec.ts` | 24 | +2: basic/advanced pricing and folded commercial settings; guided help (HQ-TOUR-002) spotlights the wizard's real controls. The axe sweep and the 320 px / 200 % reflow test now also cover Tenant 360 (five tabs) and the preview |
| `onboarding.spec.ts` | 18 | Unchanged |
| `register.spec.ts` | 16 | Every backoffice address whose module Larkspur does not license must show the **access outcome** (not a planned page) |
| `a11y.spec.ts` | 15 | Unchanged |
| `dashboard.spec.ts` | 13 | Unchanged |
| `portal.spec.ts` | 11 | Unchanged |
| **`access.spec.ts`** | **10** | **New.** Maintenance-only client: menus, home, quick create, search, deep links, and mock API reads and writes. Role without permission → outcome. Committee administrator reads the plan. Larkspur unchanged. Phone bar and Create. Essentials tour adapts. axe EN/UR × desktop/phone (12 scans) |
| `get-started.spec.ts` | 10 | Unchanged |
| **`hq-tenant360.spec.ts`** | **9** | **New.** Tenant 360 tabs in the address, the Rs 0 line, modules and sites, audit. Commercial tab. Platform support (no preview). Unknown tenant. Preview of a maintenance-only client. **Preview equals the client's real menu (cross-app).** What-if (not saved, not audited) and opening (audited). Developer roles. Phone, no sideways scrolling |
| `crm.spec.ts` | 9 | Unchanged |
| `shell.spec.ts` | 8 | Unchanged |
| `command-palette.spec.ts` | 7 | Unchanged |
| `overlays.spec.ts` | 6 | Unchanged (the related-drawer test still finds its three links) |
| `reflow.spec.ts` | 6 | Unchanged |
| `locale.spec.ts` | 5 | Unchanged |
| `customer-shell.spec.ts` | 5 | Unchanged |
| `permissions.spec.ts` | 4 | Unchanged |
| `forms-keyboard.spec.ts` | 4 | Unchanged |

**Regression.** Every Stage 1.5R and checkpoint 1 test passes. Only the register sweep changed, because addresses outside Larkspur's plan now answer with the access outcome, as designed.

## Problems found and fixed during checkpoint 2
- **Quick create would have shown an empty menu.** With the plan check in place, a maintenance-only role still saw a Create button with nothing in it. The button now appears only when the plan and role allow at least one entry. A planned "New maintenance request" entry was added.
- **Demo overview counted another organisation's records.** The Get started demo overview served Larkspur's counts to any signed-in identity. It is now Larkspur's people only.
- **Urdu address order.** Workspace addresses in the preview's address check read backwards in Urdu. They are now isolated as left-to-right text.
- **Urdu outcome wording.** The "not in the plan" sentence ran the module and organisation names together; it was reworded.
- **Focus box on the plan home.** A focus box showed around the plan home heading after navigation (focus moves there for screen readers). The outline is now hidden visually, as on other pages.
- **A stale server.** One test run reused a preview server built before the last edits. The runs above were repeated on fresh builds after stopping it.

## Bundle (production, minified)

| App | Chunk | Size | gzip | Checkpoint 1 |
|---|---|---|---|---|
| Backoffice | shared | 1,655 kB | 456 kB | 1,610 / 443 kB |
| Backoffice | entry | 390 kB | 121 kB | 385 / 120 kB |
| Customer | shared + entry | 1,441 + 383 kB | 394 + 119 kB | 1,402 + 373 / 384 + 116 kB |
| Platform HQ | shared + entry | 1,461 + 381 kB | 410 + 118 kB | 1,418 + 366 / 398 + 113 kB |
| Platform HQ | new pages | Tenant 360 15 kB, preview 11 kB | — | — |
| Backoffice | new pages | home (dashboard + plan home) 40 kB, plan page 3 kB | — | — |

**Remaining performance and bundle issues (honest list)**
- Every app still ships every dictionary in both languages. They grew by the `workspace` namespace and the new HQ text: 10–13 kB gzip per app this checkpoint.
- The shared navigation model and register are in all three apps.
- **Plan (unchanged since Stage 1.5R):** load dictionaries per app and per language, move fixtures behind a dynamic import, and split a vendor chunk. The first two remove most of the growth.
- No formal performance budget is measured yet (load time, interaction latency); that should come with the backend stage.

## Not automated (still required)
- **AB-14:** a manual NVDA + Chrome pass, now also of Tenant 360 and the preview.
- Browsers other than Chromium.
