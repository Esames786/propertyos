# Stage 1.5: Three art directions

**Status:** proposal for owner decision (2026-10-26). Branch `feature/stage-1.5-premium-design`. Nothing here is merged to `main`.

Each direction is rendered as a full board: palette with measured contrast, English and Urdu typography, backoffice dashboard, customer phone app, public-site hero, components and an Urdu RTL sample.

| | Board | Image |
|---|---|---|
| A | [`boards/direction-a-limestone.html`](boards/direction-a-limestone.html) | [`direction-a-limestone.png`](boards/direction-a-limestone.png) |
| B | [`boards/direction-b-meridian.html`](boards/direction-b-meridian.html) | [`direction-b-meridian.png`](boards/direction-b-meridian.png) |
| C | [`boards/direction-c-nocturne.html`](boards/direction-c-nocturne.html) | [`direction-c-nocturne.png`](boards/direction-c-nocturne.png) |

All imagery on the boards is generated in code (SVG architectural scenes). There are no third-party photos and no licensing exposure. Fonts are open-source (SIL OFL).

---

## A: Limestone & Evergreen ⟵ recommended

**Concept:** quiet luxury with architectural restraint. The product feels like a premium developer's brand book brought to life, not a SaaS template.

| Aspect | Decision |
|---|---|
| Palette | Limestone canvas `#F6F3EE`, white surfaces, ink `#17211E`, **evergreen** `#1E4D42` as the single action colour, bronze `#7A5221` for text accents, brass `#B58A47` for decorative detail only. Data colours: evergreen, brass, slate, sage, clay. |
| Contrast (measured) | Ink 14.9:1 · muted 5.7:1 · evergreen 8.6:1 · bronze text 6.2:1 · control edge 3.4:1 · white on evergreen 9.6:1. Brass is 2.8:1, so it is never used for text or meaning. |
| Type | **Newsreader** (variable, optical sizes) for headlines and big figures; **Geist** for the interface; **Geist Mono** for references (INV-…, LH-A-…). **Urdu: Gulzar** (Nastaliq-style, highly legible) for headings and **Noto Naskh Arabic** for interface text. |
| Composition | **Shell:** light floating sidebar (no heavy dark block) with an inset active marker, and a serif greeting. **Dashboard:** opens with a project render card. **Data:** KPIs shown as editorial numerals. Hairlines instead of boxes, 20 px card radius, soft layered shadows. |
| Imagery | Warm dusk architectural renders: slender towers with vertical fins, landscaping, golden light. |
| Motion | Calm and weighted: 180–280 ms ease-out. Spring only on drawers and selection. Count-up on key figures. |
| Phone | Floating dark pill navigation, an image-led property card, a payment ring, a large service grid. |
| Public site | Full-bleed render, large light serif headline, restrained gold call to action. |
| Dark theme later | Derived from the same hues (obsidian evergreen + limestone text). Nocturne's best ideas become the night theme. |

**Why it wins**
- **It's distinctive in this category.** Blue SaaS dashboards are everywhere; stone, evergreen and bronze read as real estate and architecture.
- **One language for all four products.** The same tokens serve backoffice, customer app, public site and SaaS HQ, scaling from dense to cinematic without changing identity.
- **Urdu looks native.** Gulzar Nastaliq headings make the Urdu side feel premium rather than translated.
- **Light-first suits long working days** while still looking expensive.

**Risks and mitigations**
- **Serif numerals in dense tables reduce scan speed.** Tables use Geist with tabular figures; the serif is limited to headline KPIs.
- **Warm canvas can look beige if overused.** The bulk of content sits on white surfaces; limestone is the frame.
- **The single evergreen action colour can feel low-energy.** Bronze accents and subtle motion carry emphasis.

---

## B: Meridian

**Concept:** precision fintech for property. Cool graphite, cobalt signal, violet depth, monospaced figures, dark navigation rail.

| Aspect | Decision |
|---|---|
| Palette | Canvas `#F6F7FA`, ink `#0E1324`, cobalt `#2E57D9` (5.6:1), violet `#6A4FD1`, teal data `#0F8A7E`, rail navy `#0B1020`. |
| Type | Geist throughout; **Geist Mono for every figure**; Urdu in Noto Naskh Arabic (bold headings). |
| Composition | Icon rail plus a secondary panel, gradient-mesh header band, KPI tiles with sparklines, dense tables, 8–12 px radii. |
| Imagery | Isometric blueprint tower (line art) rather than photography. |

- **Strengths:** the fastest to scan for finance and collections; looks like best-in-class financial software; excellent density.
- **Weaknesses:** generic in the SaaS market (cobalt + navy is widely used). It says "fintech", not "luxury property". The customer app and public site feel corporate, and Urdu headings in Naskh look plain next to A or C.

---

## C: Nocturne

**Concept:** cinematic dark prestige. Obsidian surfaces, champagne gold, Bodoni display, night renders with lit windows.

| Aspect | Decision |
|---|---|
| Palette | Obsidian `#0C0E11`, ivory text `#F1ECE2` (16.4:1), champagne `#D6B884` (10.2:1), teal `#63B7AA`. The control edge was raised to `#6E737B` (3.7:1) after the first proposal measured 2.9:1. |
| Type | Bodoni Moda (display), Manrope (interface); **Noto Nastaliq Urdu** headings. |
| Composition | Dashboard sits over a full-bleed night render with glass panels; centred cinematic site hero. |

- **Strengths:** the most dramatic; outstanding for the public website, the 3D explorer and launch moments.
- **Weaknesses:**
  - Dark-first strains long data-entry sessions.
  - Glass over imagery threatens text contrast as content changes.
  - Needs a full light companion theme for the backoffice, roughly doubling visual QA.
  - Bodoni's hairlines degrade at small sizes and at 200 % zoom on low-DPI screens.

---

## Scored comparison (5 = best)

| Criterion | A Limestone | B Meridian | C Nocturne |
|---|:-:|:-:|:-:|
| Distinctive, premium real-estate identity | **5** | 2 | 5 |
| Backoffice productivity (dense data, long sessions) | 4 | **5** | 2 |
| Customer app warmth and trust | **5** | 3 | 4 |
| Public site and 3D drama | 4 | 3 | **5** |
| Urdu typography quality | **5** | 3 | 4 |
| Accessibility headroom (contrast, zoom, motion) | **5** | 5 | 3 |
| One system across all four products | **5** | 4 | 3 |
| Implementation and QA cost | 4 | **5** | 2 |
| **Total** | **37** | 30 | 28 |

**Recommendation: Direction A, with two borrowings:**
- B's monospaced-figure discipline for finance tables and references;
- C's night palette as the basis of the future dark theme and an optional "evening" mood for the public site and 3D explorer.

You can also choose a different direction or ask for a blend. The plan below adapts either way.
