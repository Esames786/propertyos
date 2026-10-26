# ADR-0003: Public website on Next.js

**Status:** Accepted. Owner decision on 2026-10-26 in the Stage 1.5 authorisation. Implementation starts in Stage 1.5c; nothing is built in step 1.

**Supersedes:** the Stage 1.5 plan's recommendation of a Vite `apps/public-site` (plan §4, decision 3).

## Context

The public website (WEB-*) needs:
- server-rendered, indexable pages;
- fast first paint on mobile networks;
- cinematic sections, including scroll storytelling and the 3D explorer preview.

The backoffice and customer PWA are authenticated, app-like and already built on Vite + React with React Router in a prototype-only seam (ADR-0001).

## Decision

1. **New app.** Create `apps/public-site` on Next.js (App Router), React and TypeScript.
2. **Other apps stay put.** The backoffice and customer PWA remain on the ADR-0001 architecture. There is no separate mobile frontend; the customer PWA stays the single responsive customer codebase.
3. **Shared packages.** The public site consumes the shared workspace packages unchanged:
   - `@repo/tokens`: Limestone & Evergreen, night palette, fonts;
   - `@repo/i18n`: en-PK and ur-PK, RTL, formatters;
   - `@repo/contracts` and `@repo/assets` (image registry);
   - presentational parts of `@repo/ui`.

   Router-specific code stays outside those packages, as it already does: pages use `NavigationProvider`, which a Next.js adapter will implement.
4. **Rendering.** Static and server rendering for marketing pages. Client islands for:
   - the enquiry form (mock CRM lead);
   - the payment-calculator teaser;
   - GSAP scroll scenes;
   - the React Three Fiber explorer, lazy-loaded.
5. **Locale routing.** `/en/…` and `/ur/…` paths with `<html lang dir>` set on the server, so Urdu pages render RTL without a client flip.

## Consequences

**Benefits**
- SEO and LCP budgets become achievable without hand-rolled SSR.
- The design system is reused, not forked.

**Costs**
- A second build pipeline. Turbo or npm workspaces scripts must build three apps.
- `@repo/ui` components used on the public site must stay free of browser-only globals at import time.
- Testing extends the Playwright and axe matrix to the public routes (EN/UR × desktop/phone, plus a reduced-motion static version of scroll scenes).

## Versions

To be pinned at Stage 1.5c against Node 20.20.1 (Laragon), following the rule from ADR-0001: exact versions, at least two weeks old, compatible with Node 20.19+.
