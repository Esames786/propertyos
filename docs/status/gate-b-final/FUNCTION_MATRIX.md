# Gate B final — function matrix

Owner review of Gate B checkpoint 2 (commit `8fced00`): every required item, where it is built,
how it is tested and where the evidence is. Paths are relative to the repository root.
Screenshots: `docs/status/gate-b-final/screenshots/<name>-<width>-<en|ur>.png`; videos:
`docs/status/gate-b-final/video/*.webm`.

## Part 1 — security corrections

| # | Requirement | Built in | Tests | Evidence |
|---|-------------|----------|-------|----------|
| 1.1 | Fail-closed mock transport: 401 without an identity, 403 without effective access | `packages/fixtures/src/mock-transport.ts` (`authorize`, `decideEndpoint`) | `security.test.ts` §1 (every handler, spies prove no handler ran) | — |
| 1.2 | Every tenant endpoint declares module, permission, suspension class | `handler-types.ts` (`HandlerAccess`, `requires`, `visitor`); every handler file | `security.test.ts` "every handler declares…" (allow-list of 4 visitor endpoints) | — |
| 1.3 | Refused reads and writes reach no data and change nothing | transport gate before `handle`; per-tenant `DemoPartition` | `security.test.ts` (spies; `partitionKeys()` stays empty) | — |
| 2.1 | Site-scoped module refuses a record with a missing or unlicensed site | `contracts/src/access.ts` (`SITE_SCOPED_MODULES`, `site_context_missing`); `handler-types.ts` (`authorize`, `unitPermitted`, `projectRecord`) | `access.vectors.json` (47); `security.test.ts` §2 | `bo-crescent-plaza-unit-not-licensed-*`, `bo-crescent-unassigned-record-no-site-*` |
| 2.2 | Two-site tenant fixture | `fixtures/src/tenants/crescent.ts`, `tenant-directory.ts` (Crescent Bay: Towers inventory/construction/handover, Plaza maintenance), HQ seed (trial) | `security.test.ts` §2; `security.spec.ts` | video `bo-two-sites-licensing-desktop-en` |
| 2.3 | Reads, writes, navigation, search, direct URLs | `/units`, `/units/:id`, hold/release, `/search`, `/dashboard/summary`, `GET /access/record`; `ShellLayout` record gate; `SessionProvider` site context; `ProjectSwitcher` | `security.test.ts` §2; `security.spec.ts`; `tenantWorkspace.test.ts` (site context) | `bo-crescent-home-towers-only-*`, `bo-crescent-plaza-context-inventory-refused-*`, `bo-crescent-search-plaza-no-units-*` |
| 3.1 | Residents reach only verified, effective-dated liability | `PartyLink` scope (`access.ts` `linkReaches`); `datasets.ts` party links; `effectiveAccessFor`; `portal-handlers.ts` `owner()` | `access.vectors.json`; `security.test.ts` §3 (unverified, ended, not started, other account/site/entity/flat) | — |
| 3.2 | Financial records: full unit ↔ billing account ↔ project ↔ site ↔ entity | `linkReaches` (residents); `invoiceRecord` (staff) | `security.test.ts` §3 | — |
| 3.3 | No cross-tenant, cross-site, cross-entity exposure | tenant datasets; party scope; site grants | `security.test.ts` §3 cross-tenant; online payments per site | — |
| 4 | Suspended tenant identity; history readable, operations blocked | Cedar Hills (`tenants/cedar.ts`, persona `cedar_treasurer`); FIN-002 `finance-handlers.ts` (`history_read`); `suspensionOf`; banner in `ShellLayout` | `security.test.ts` §4 (incl. D-20 settlement); `tenantWorkspace.test.ts`; `security.spec.ts` | `bo-cedar-*`; video `bo-suspended-history-phone-ur` |
| 5 | Tenant switching clears or partitions caches, search, recents, demo state | `DemoStore` partitions; per-tenant `TrainingStore`; `TransportProvider` drops other identities' queries and mutations (`queryOwner`); More page offers colleagues only | `security.test.ts` §5; `TransportProvider.test.tsx`; `security.spec.ts` | video `bo-tenant-switching-no-leakage-desktop-en` |

## Part 2 — owner's product decisions

| Decision | Built in | Tests | Evidence |
|----------|----------|-------|----------|
| Contextual Party labels (developer / society / property management / maintenance-only) | `tenantWorkspace.ts` `partyAreaLabelKey`, `contextualNav`; `ShellLayout`, More, plan home, HQ preview | `access.spec`, `permissions.spec`, `shell.spec`, `hq-commercial.spec` | `bo-larkspur-more-customers-and-buyers-*`, `bo-shalimar-admin-people-and-contacts-*`, `hq-preview-shalimar-on-1-november-*` |
| Plan page for administrators only; My access for everyone, no commercial data | `plan-handlers.ts` (`admin.view`); `my-access-handlers.ts`, `MyAccessPage.tsx` (GLOBAL-014) | `security.test.ts` (no commercial terms); `access.spec`; `security.spec` | `bo-crescent-my-access-*` |
| Tenant-defined role templates (society and developer starter sets) | `role-templates.ts`; personas take their role's permissions; HQ preview uses `rolesOf` | `role-templates.test.ts`; `hq-tenant360.spec` | `hq-preview-crescent-role-templates-*` |
| Preview uses actual effective permissions; portal roles belong to the PWA gate | `platform/handlers.ts` `preview()` (tenant roles, real suspension policy, `at`) | `role-templates.test.ts` (rejects `resident`) | — |

## Part 3 — remaining Gate B

| Item | Built in | Tests | Evidence |
|------|----------|-------|----------|
| Signup policies and workspace requests | `platform/config.ts` (signup versions), `config-handlers.ts` (requests), `RequestsPage.tsx` (HQ-027); backoffice setup shows the outcome | `commercial.test.ts`; `hq-commercial.spec` | `hq-requests-*`, `hq-signup-policy-*` |
| Module catalogue and dependency management | catalogue versions; `dependencies.ts` takes the catalogue; `CataloguePage.tsx` (HQ-006/007) | `commercial.test.ts` (cycles, removals, version in force) | `hq-catalogue-*` |
| Rate-card management | rate-card versions; templates, floors, builder by date; `RateCardsPage.tsx` (HQ-010) | `commercial.test.ts` | `hq-rate-cards-*` |
| Versioned commercial approval policy | policy versions with approver roles and exceptions; `approvals.ts` reads the version in force; `PoliciesPage.tsx` (HQ-026) | `commercial.test.ts` | video `hq-policy-configuration-workflow-desktop-en`; `hq-policy-*` |
| Contract amendments and scheduled changes | `amendments.ts`; contract history seeds (Larkspur v1→v2, Shalimar scheduled v2); `AmendContractPage.tsx` (HQ-011); history in Tenant 360 | `commercial.test.ts`; `hq-commercial.spec` | video `hq-amendment-and-history-desktop-en`; `hq-larkspur-contract-history-*`, `hq-shalimar-scheduled-change-*` |
| Module-grant amendments with impact preview | `amendmentImpact` (dependencies, price delta, access by role, retention) | `commercial.test.ts` | `hq-amend-impact-preview-*` |
| Usage metering evidence and billing calculation | `usage.ts` (snapshots, evidence, billing via `pricePeriod`); Tenant 360 usage tab, evidence drawer (HQ-014/015) | `commercial.test.ts`; `hq-commercial.spec` | `hq-riverbend-usage-and-billing-*`, `hq-meter-evidence-*` |
| Complete commercial audit trail | every commercial action audited with principal and field-by-field changes; `audit.ts`; `AuditPage.tsx` (HQ-028) | `commercial.test.ts`; `hq-commercial.spec` | `hq-audit-configuration-*` |
| Manual NVDA verification | — | — | `NVDA_CHECKLIST.md` (**not yet performed**) |
| Supreme Admin control; no permanent hard-coded thresholds; same rules everywhere | `platform.config.manage` (Supreme Admin only); seeds are version 1; builder, quote, simulator, activation, amendments and dependency checks read `configOn(store, date)` | `commercial.test.ts` | — |

## UX requirements

| Requirement | Built in | Evidence |
|-------------|----------|----------|
| Context-aware screen names | Party labels; plan vs My access | see Part 2 |
| Connected workspaces | Tenant 360 ↔ amend ↔ preview ↔ audit; requests → draft wizard | videos |
| Intelligent forms | amendment adds a priced add-on's price and offers to add required modules; server problems listed by field | `hq-amend-impact-preview-*` |
| Prototype tools out of client navigation | `PROTOTYPE_NAV` behind a Preferences switch (`prototypeTools.tsx`) | `bo-preferences-prototype-tools-off-*`; `shell.spec` |
| Honest maintenance-only home | `PlanHome.tsx`: working quick actions only; planned maintenance listed with its gate | `bo-maintenance-home-planned-honest-*` |
| English/Urdu RTL, keyboard, responsive | all new screens; axe in `security.spec` and `hq-commercial.spec` at 1440 and 390, both languages | screenshots `-ur` |
