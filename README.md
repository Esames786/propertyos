# PropertyOS (codename): UI-first prototype

Multi-tenant real-estate developer platform: backoffice, customer web/PWA and shared design system.
**Prototype only.** Every person, amount, account and document is fictional; nothing moves money,
sends messages or writes to a real backend.

- Blueprint: [`docs/blueprint/v2.1/`](docs/blueprint/v2.1/)
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
| `npm run dev` | Backoffice at http://localhost:5173/backoffice and customer portal at http://localhost:5174/customer/portal |
| `npm run dev:backoffice` / `npm run dev:customer` | Run one app |
| `npm run build` | Production build of both apps |
| `npm run preview` | Serve the production builds on the same ports |
| `npm run typecheck` | TypeScript across all packages and apps |
| `npm run lint` | ESLint (no hard-coded UI text, router seam), RTL logical-CSS guard, i18n key parity |
| `npm run test` | Unit and component tests (Vitest) |
| `npm run test:e2e` | Playwright end-to-end + axe accessibility, against production builds |
| `npm run evidence` | Regenerates the stage screenshot matrix |
| `npm run register:sync` | Regenerates the typed screen manifest from the register CSV |

First Playwright run only: `npx playwright install chromium` (~170 MB).

## Demo identities

Open the app and pick a fictional identity. Each one has different permissions, so menus, search
results and actions change.

| Identity | Role | Scope |
|---|---|---|
| Nadia Rahman | Developer manager | All projects |
| Bilal Ahmed | Sales executive | Larkspur Heights only |
| Farah Javed | Finance officer | All projects, finance permissions |
| Usman Tariq | Owner and resident | Customer portal |

The account menu (initials, top end) lets you switch identity, reset the first-login onboarding
and choose a simulated network (normal, instant, slow, server error, offline).

## Layout

```text
apps/backoffice      Staff backoffice + SaaS HQ + staff sign-in (Vite + React; Inertia client later)
apps/customer-web    Customer / owner / resident web app (PWA in Stage 4)
packages/tokens      Design tokens (Tailwind v4 theme), contrast tests
packages/i18n        en-PK / ur-PK dictionaries, locale provider, money/date/phone/CNIC/IBAN formatters
packages/contracts   Entity, API-error, permission and screen-register types
packages/fixtures    Fictional dataset, demo personas, in-memory mock transport
packages/ui          Components, shells, command palette, guided-tour engine
tests                Playwright e2e, accessibility and evidence specs
scripts              Register sync, i18n parity, logical-CSS guard
```
