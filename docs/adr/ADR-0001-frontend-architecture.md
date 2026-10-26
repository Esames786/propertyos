# ADR-0001 — Frontend architecture for the UI-first prototype

| | |
|---|---|
| **Status** | Accepted 2026-10-26 (Node 20 amendment, see §2.1) |
| **Date** | 2026-10-26 |
| **Blueprint** | V2.1 (`PropertyOS_UI_First_Blueprint_V2_1_Guided_Onboarding.zip`) |
| **Scope** | Frontend only. No backend, migrations, tenancy, payments or persistence of business data. |

PropertyOS is a codename. Package names, folders and code identifiers below are brand-neutral (`@repo/*`) so no rename is needed when the product name is chosen.

---

## 1. Context

**Repository (inspected 2026-10-26):** only the ten V2.1 blueprint files plus the V2.1 ZIP at the root. No source code, no `package.json`, no Laravel app. Not a git repository.

**Machine (Laragon on Windows 11 Pro):**

| Tool | Found | Note |
|---|---|---|
| Node.js | 20.20.1 (`D:\laragon2\bin\nodejs\node-v20.20.1-win-x64`), plus an older `node-v18` folder | Node 20 reached end-of-life on 2026-04-30 |
| npm | 10.8.2 | |
| PHP | 8.3.16 (also 8.2.9, 8.1.10) | Not needed until backend stage |
| Composer | present (`D:\laragon2\bin\composer`) | Not needed until backend stage |
| MySQL / Redis | 8.0.30 / 5.0.14 | Not used in UI-first stages |
| git | 2.53.0 | |

None of these are on the PATH of a plain PowerShell/Git Bash session; they are on PATH only inside the Laragon terminal.

**Tool requirements that rule out Node 20** (checked on the npm registry 2026-10-26):

| Package | Latest | Requires Node |
|---|---|---|
| react-router | 8.5.0 | ≥ 22.22.0 |
| vitest | 5.0.5 | ^22.12 or ^24 |
| @axe-core/playwright | 4.14.0 | ≥ 22.12.0 |
| vite | 8.3.5 | ^20.19 or ≥ 22.12 |

Current Node LTS lines: **24.22.1 "Krypton"** (2026-10-20) and 22.23.4 "Jod".

**Blueprint targets** (01 §14, 08): backoffice on Laravel + Inertia + React + TypeScript; customer web/PWA as a React SPA over a versioned API, one source for phone and desktop; SEO-capable public site (Next.js or equivalent); shared `ui`, `tokens`, `i18n`, `contracts`, `fixtures`; no premature monorepo tooling; no disposable demo.

---

## 2. Decision

### 2.1 Repository shape — plain npm workspaces

```text
property_handle/
  apps/
    backoffice/        Vite + React SPA now (staff backoffice + SaaS HQ + staff auth)
                       → becomes the Inertia client of the Laravel app at the backend stage
    customer-web/      Vite + React SPA (customer/owner/resident), PWA added in Stage 4
    public-site/       NOT created until Stage 5 (separate ADR: Next.js vs static Vite)
  packages/
    tokens/            CSS custom properties, Tailwind v4 theme mapping, contrast tests
    i18n/              i18next setup, en-PK / ur-PK dictionaries, Intl formatters, LocaleProvider
    ui/                React components on React Aria, app shell, overlays, onboarding engine
    contracts/         TypeScript types + zod schemas for entities, API errors, permissions, screen register
    fixtures/          Deterministic fictional data, demo personas, in-process mock transport
  tests/               Playwright e2e, accessibility scans, evidence capture, shared helpers
  scripts/             Register sync, i18n parity, logical-CSS check
  docs/
    blueprint/v2.1/    The owner's blueprint (moved from repo root)
    adr/               Architecture decisions
    ui/                Project-local screen register with status columns
    status/            Per-stage evidence: ui-stage-N/
```

- **npm workspaces only.** No Turborepo/Nx/Lerna. Packages are consumed as TypeScript source (`"exports": "./src/index.ts"`); the consuming Vite app compiles them. No package build step, no publishing.
- **Node 20.20.1 from Laragon** (owner decision 2026-10-26: use the Node already in Laragon). `.node-version` = `20.20.1`; `engines.node` = `>=20.19.0`. Library versions in §2.4 are the newest that support Node 20. Node 20 has been end-of-life since 2026-04-30, so moving to Node 24 LTS later is a version bump plus React Router 8 / Vitest 5, with no code restructuring.
- The blueprint's `packages/testing` becomes `tests/support/` at the root. A separate package adds nothing until there is a second consumer.

### 2.2 Which app serves which register routes

| Register prefix | Rows | App |
|---|---:|---|
| `/backoffice/**` (incl. `/backoffice/help/**`, `/backoffice/settings/**`) | 259 | `apps/backoffice` |
| `/saas/saas/**` | 10 | `apps/backoffice` (separate SaaS shell; may split later) |
| `/shared/auth/*` except customer portal login | 5 | `apps/backoffice` |
| `/shared/auth/customer-portal-login` | 1 | `apps/customer-web` |
| `/customer/portal/**` and `/portal/help/tours` | 28 | `apps/customer-web` |
| `/public/web/**` | 18 | `apps/public-site` (Stage 5) |

### 2.3 The reuse seam: how prototype pages survive the move to Inertia

The risk the blueprint names is a prototype that has to be rewritten to connect to Laravel. The seam that prevents it:

1. **Pages are pure components of typed props.** `LeadWorkspacePage(props: LeadWorkspacePageProps)`. Props types live in `@repo/contracts`. Pages never import fixtures or the router directly.
2. **In the prototype**, a React Router route *loader* builds those props from `@repo/fixtures` (with simulated latency, so skeletons and errors are real).
3. **At the backend stage**, a Laravel controller returns the same props via `Inertia::render('crm/LeadWorkspacePage', $props)`. The prototype router file is deleted; pages, layouts and components are unchanged. Prop shapes can then be checked against PHP DTOs by type generation.
4. **Navigation goes through an adapter.** All links and programmatic navigation use React Aria's `RouterProvider` (`navigate`, `useHref`) plus a small `UrlState` context (`useQueryParam`, `setSearch`) from `@repo/ui`. Each app supplies a React Router implementation now; the Inertia implementation replaces it later.
5. **Async UI data** (comboboxes, Ctrl+K search, notifications, drawers) goes through an `ApiTransport` interface with TanStack Query. The prototype uses an in-process `MockTransport`; later an `HttpTransport` calls the Laravel API. Inertia apps need these JSON endpoints too, so the code carries over.
6. **Layouts** are plain components that pages declare (`Page.layout = BackofficeLayout`). That matches Inertia persistent layouts and works as a nested route element in React Router.

The customer app keeps React Router permanently (it is an API-driven SPA), so for it the prototype *is* the production architecture.

### 2.4 Libraries (versions verified on npm 2026-10-26)

| Concern | Choice | Version | Why |
|---|---|---|---|
| UI runtime | React | 19.3.1 | Blueprint target |
| Bundler/dev | Vite + @vitejs/plugin-react | 8.3.5 / 6.1.2 | Laravel's default Vite integration later |
| Language | TypeScript | **6.0.3** | 7.0.2 exists, but typescript-eslint 8.72.0 supports `<6.1.0` only |
| Routing (prototype + customer) | react-router (data mode) | **7.18.4** | Loaders → skeletons; `useBlocker` for unsaved drafts; `ScrollRestoration`; lazy routes for 300+ screens. 8.x needs Node ≥ 22.22 |
| Accessible behaviour | react-aria-components | 1.22.1 | See §2.5 |
| Styling | Tailwind CSS v4 + CSS custom properties | 4.3.3 | Logical-property utilities (`ms-*`, `pe-*`, `start-*`), `rtl:` variant; Laravel ecosystem default |
| i18n | i18next + react-i18next | 26.5.11 / 17.1.9 | Namespaces per area as the blueprint lists; flat dotted keys as in its sample; missing-key handler; typed keys |
| Formatting | Native `Intl` wrappers in `@repo/i18n` | — | No dependency; behaviour pinned by tests |
| Forms | react-hook-form + zod | 7.91.0 / 4.6.7 | Field errors as translation keys; Laravel 422 mapping |
| Server state | @tanstack/react-query | 5.105.0 | Loading/error/retry/dedupe; works in Inertia too |
| Icons | lucide-react | 1.61.0 | Directional icons mirrored via a wrapper only |
| Fonts (self-hosted) | @fontsource-variable/inter, @fontsource-variable/noto-naskh-arabic | 5.3.0 | No third-party font CDN (privacy, offline PWA) |
| Unit/component tests | vitest + @testing-library/react + jsdom | **4.1.12** / 16.3.3 / **26.1.0** | Vitest 5 and jsdom 30 need Node ≥ 22 |
| E2E + a11y | @playwright/test + @axe-core/playwright | 1.64.1 / **4.13.0** | WCAG 2.0/2.1/2.2 A+AA rule tags; 4.14 needs Node ≥ 22.12 |
| Lint | eslint + typescript-eslint + eslint-plugin-jsx-a11y + eslint-plugin-i18next | **9.39.5** / 8.72.0 / 6.10.2 / 6.1.5 | ESLint 9 because jsx-a11y does not support ESLint 10 yet; `no-literal-string` in JSX enforces "no hard-coded English" |
| PWA (Stage 4 only) | vite-plugin-pwa | 2.0.0 | |

### 2.5 Why React Aria Components rather than Radix/shadcn, MUI or Headless UI

The blueprint requires WCAG 2.2 AA, true Urdu RTL, async/dependent selects, currency/date inputs and keyboard-operable tables. React Aria 1.22.1 ships all of these with WAI-ARIA behaviour built in: ComboBox, Select, Autocomplete (command palette), ListBox, TagGroup, Tabs, Table, GridList, Tree, DatePicker/DateField, NumberField with currency, Modal, Dialog, Popover (anchorable to any element via `triggerRef`), Sheet, Toast, FileTrigger, DropZone and Breadcrumbs.

Its `I18nProvider` makes keyboard navigation and overlay placement RTL-aware: arrow keys in tabs, `start`/`end` placement. Its date and number fields are built on `Intl`.

- **Radix/shadcn** has no combobox, date field, number field or data table primitives. Those would be assembled from cmdk and third-party pickers, each with its own RTL and accessibility behaviour.
- **MUI** imposes its own styling engine and makes token-level control harder.
- **Headless UI** covers too few components.

React Aria is unstyled, so every component gets the PropertyOS token system.

### 2.6 Mock data: in-process transport, not MSW

`MockTransport` resolves requests in memory against `@repo/fixtures`. Latency is deterministic and seeded (150–600 ms), and there is a dev switch for `slow`, `error` and `offline` to exercise those states. MSW was rejected because it needs a service worker at scope `/`. That collides with the customer PWA's own service worker in Stage 4, and it makes "is this request real?" harder to see.

Every mock mutation is written to an inspectable mutation log. Training-mode writes go to a separate store, and tests assert that no non-training write happens during practice tasks.

### 2.7 Styling, RTL and accessibility rules (enforced, not advisory)

- **Logical properties only.** `scripts/check-logical-css.mjs` fails the lint on physical classes and properties: `ml-`/`mr-`/`pl-`/`pr-`, `left-`/`right-`, `text-left`/`text-right`, `border-l`/`r`, `rounded-l`/`r`, and `margin-left` etc. in CSS.
- `<html lang dir>` is set **before first paint** by a small inline boot script that reads the saved locale. The language switch then updates it in place, without remounting, so form state survives.
- **Bidi isolation.** References (invoice/unit numbers, IBAN, phone, CNIC, email, URL, transaction ID) render through a `Reference` component with `dir="ltr"` + `unicode-bidi: isolate`. Free text uses `<bdi>`.
- **Money is a decimal string** (`"12500000.50"`) plus a currency code. The UI never does floating-point arithmetic on money.
- **Status** is always text plus an icon/shape; colour is never the only signal.
- **Focus** is a 2 px ring with a 2 px offset in the page background colour (see Stage 0 report, conflict C2).

### 2.8 Typography

| Use | Font | Note |
|---|---|---|
| UI Latin (both locales) | Inter Variable | Blueprint said "Geist Sans or Inter, choose one": **Inter**, for its tabular figures and broad glyph coverage |
| UI Urdu | Noto Naskh Arabic Variable | As the blueprint specifies (Naskh, not Nastaliq, for UI). Stack: `"Inter Variable", "Noto Naskh Arabic Variable", system-ui, sans-serif`. Latin falls to Inter and Urdu script to Naskh, so mixed IDs render correctly |
| Customer/public display | Instrument Serif (EN); Urdu display face TBD | Deferred to Stage 4/5 |

Urdu gets its own line-height via `:lang(ur)`, tuned on real Urdu specimens in Stage 1, not copied from Latin metrics.

---

## 3. Alternatives considered

| Option | Verdict | Reason |
|---|---|---|
| Scaffold Laravel + Inertia now and build backoffice pages there | Rejected for now | Needs a Laravel skeleton (ships default migrations), controllers serving mock props and a PHP toolchain in the loop. That blurs mock vs. backend, which UI-first stages forbid. The seam in §2.3 gets the same end state without that cost. |
| One prototype SPA hosting backoffice, customer and public routes | Rejected | The customer PWA needs its own manifest, service-worker scope and bundle budget, so it would have to be split later. That is the rewrite the blueprint warns about. |
| Next.js for all surfaces | Rejected | The backoffice target is Inertia. Server components add complexity with no gain for an authenticated ERP or the customer SPA. Next.js remains the candidate for the public site only. |
| Turborepo/Nx | Rejected | The blueprint says avoid premature tooling. npm workspaces cover 2 apps and 5 packages. |
| TypeScript 7 (native) | Deferred | typescript-eslint does not support it yet. Revisit when it does. |
| MSW for mocks | Rejected | Service-worker conflict with the PWA (§2.6). |

## 4. Consequences

- **Positive:**
  - Every component, page, translation and fixture written now is in its final location for the customer app, and one adapter swap away from Inertia for the backoffice.
  - RTL, contrast and "no hard-coded strings" are lint and test failures, not review comments.
- **Negative:**
  - Two dev servers (backoffice :5173, customer :5174).
  - The navigation and transport adapters are about 150 lines of indirection that must be respected; lint rules forbid importing `react-router` inside `packages/ui` and `apps/*/src/pages`.
  - Running on end-of-life Node 20 pins a few tools one major behind (React Router 7, Vitest 4, ESLint 9).
- **Not decided here:** the public-site framework (Stage 5 ADR), Laravel/Inertia scaffolding (backend-stage authorization) and the onboarding engine (ADR-0002).

## 5. Approval

Approved by the owner on 2026-10-26, with the change to use Laragon's existing Node 20.20.1 instead of installing Node 24.
