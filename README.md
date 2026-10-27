# PropertyOS (codename): UI-first prototype

Multi-tenant real-estate developer platform: backoffice, customer web/PWA, Platform HQ and shared design system.
**Prototype only.** Every person, amount, account and document is fictional; nothing moves money,
sends messages or writes to a real backend.

- Blueprint: [`docs/blueprint/v3.1/`](docs/blueprint/v3.1/) (V3.1, with the Gate A review in [`gate-a/`](docs/blueprint/v3.1/gate-a/)); earlier [`v2.1/`](docs/blueprint/v2.1/)
- Architecture decisions: [`docs/adr/`](docs/adr/)
- Stage reports and evidence: [`docs/status/`](docs/status/)
- Screen register with build status: [`docs/ui/screen-register.csv`](docs/ui/screen-register.csv)

## Requirements

- Node.js 20.19+ (this machine uses Laragon's Node 20.20.1)
- npm 10+

Node is not on PATH outside the Laragon terminal. In Git Bash:

```bash
export PATH="/d/laragon2/bin/nodejs/node-v20.20.1-win-x64:$PATH"
```

In PowerShell:

```powershell
$env:PATH = "D:\laragon2\bin\nodejs\node-v20.20.1-win-x64;$env:PATH"
```

## Commands

| Command | What it does |
|---|---|
| `npm install` | Install all workspaces |
| `npm run dev` | Backoffice at http://localhost:5173/backoffice (first visit: Get started; afterwards the dashboard), customer portal at http://localhost:5174/customer/portal and Platform HQ at http://localhost:5175/hq |
| `npm run dev:backoffice` / `npm run dev:customer` / `npm run dev:hq` | Run one app |
| `npm run build` | Production build of all three apps |
| `npm run preview` | Serve the production builds on the same ports |
| `npm run typecheck` | TypeScript across all packages and apps |
| `npm run lint` | ESLint (no hard-coded UI text, router seam), RTL logical-CSS guard, i18n key parity |
| `npm run test` | Unit and component tests (Vitest) |
| `npm run test:e2e` | Playwright end-to-end + axe accessibility, against production builds |
| `npm run evidence` | Regenerates the stage screenshot matrix |
| `npm run register:sync` | Regenerates the typed screen manifest from the register CSV |

First Playwright run only: `npx playwright install chromium` (~170 MB).

## First visit and demo identities

A first visit to the backoffice opens **Get started**:
- **Explore a live demo:** pick a role, the demo is prepared, then take the guided tour or explore.
- **Set up my developer workspace:** a labelled simulation; no account, email or SMS is created.

Returning visitors land on the demo sign-in at `/backoffice/sign-in`. Each identity has different permissions, so menus, search
results and actions change. Changes you make in the demo (leads, calls, visits, holds, proof uploads) last for the
browser tab; More → Reset demo data clears them.

| Identity | Role | Scope |
|---|---|---|
| Nadia Rahman | Developer manager | All projects |
| Bilal Ahmed | Sales executive | Larkspur Heights only |
| Farah Javed | Finance officer | All projects, finance permissions |
| Usman Tariq | Owner and resident | Customer portal |

The account menu (initials, top end) lets you switch identity, reset the first-login onboarding
and choose a simulated network (normal, instant, slow, server error, offline).

### Platform HQ (central platform operator)

Platform HQ is a separate app for the platform operator, not for any tenant. It shows tenant metadata
(licences, contracts, counts) and never reads a tenant's people or finance records. Its demo data lasts
for the browser tab, the same way the backoffice demo does.

| Identity | Role | Can |
|---|---|---|
| Hamza Qureshi | Supreme Admin | Everything in HQ: create tenants, price contracts, approve another person's contract |
| Ayesha Siddiqui | Commercial approver | Approve or return contracts that go beyond commercial policy |
| Iqra Rana | Platform support | See tenants and licences; cannot create tenants, change prices or read tenant records |

## Layout

```text
apps/backoffice      Staff backoffice + staff sign-in (Vite + React; Inertia client later)
apps/customer-web    Customer / owner / resident web app (PWA in Stage 4)
apps/platform-hq     Platform HQ for the central operator: tenants, tenant creation, pricing, approvals
packages/tokens      Design tokens v3 (Limestone & Evergreen, Clarity; Tailwind v4 theme), fonts, contrast tests
packages/assets      Typed registry of licensed imagery (see docs/design/ASSET_REGISTRY.md)
packages/i18n        en-PK / ur-PK dictionaries, locale provider, money/date/phone/CNIC/IBAN formatters
packages/contracts   Entity, API-error, permission, access-decision, platform-pricing and screen-register types
packages/fixtures    Fictional dataset, demo personas, mock transports with session demo stores (CRM, portal, workspace, platform pricing engine)
packages/ui          Components, shells, chart kit, command palette, guided-tour engine
tests                Playwright e2e, accessibility and evidence specs
scripts              Register sync, i18n parity, logical-CSS guard
```
