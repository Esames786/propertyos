# Asset registry

Every image, font and generated visual used in the product is listed here: its source, licence and where it is used. The typed twin is `packages/assets/src/index.ts`, and the two must stay in step: add an asset in both places or in neither.

## Rules

1. **Licence first.** An asset is accepted only with a licence that allows commercial use. We keep the licence name and the page it came from.
2. **Fictional projects stay fictional.** Larkspur Heights and Larkspur Gardens are fictional demo projects. The photographs show real buildings and rooms that are not those projects.
   - Every photograph is shown with a visible **"Illustrative image"** label.
   - Alt text describes what is in the picture, not the fictional project.
3. **Meaningful, not decorative stock.** An image must show what the screen is about: residences, interiors, construction. Generic office or handshake stock is not used.
4. **Processing.**
   - Originals are downloaded once, resized with Laragon's ffmpeg (lanczos) and encoded as WebP (`-q:v 80`) at 480 and 960 px wide.
   - Metadata is stripped (`-map_metadata -1`).
   - Images are served from the app bundle. There are no third-party image requests at runtime.
5. **Text over images** always sits on a scrim; the scrim's worst-case contrast is checked in the token tests.

## Photography (CC0 1.0, commercial use allowed, no attribution required; credited anyway)

The licence for every photograph below is CC0 1.0, found via Openverse on 2026-10-26.

| Key | Shows | Creator | Source page | Used in |
|---|---|---|---|---|
| `heights-dusk` | Curved residential balconies at sunset | The Building Envelope (StockSnap) | https://stocksnap.io/photo/modern-building-CAVRPFBKZ3 | Dashboard project showcase: Larkspur Heights |
| `gardens-residences` | Low-rise white residences with palms | Faisal Ahammad (WordPress Photo Directory) | https://wordpress.org/photos/photo/1606979817/ | Dashboard project showcase: Larkspur Gardens; villa card |
| `interior-living-bright` | Bright living room with floor-to-ceiling glass | not credited (rawpixel public domain) | https://www.rawpixel.com/image/5915137/image-light-public-domain-plants | Residences card: 1-bed |
| `interior-living-city` | Living room with city-view windows | Scott Webb (rawpixel) | https://www.rawpixel.com/image/430394/free-photo-image-living-room-interior-house | Residences card: 2-bed |
| `interior-kitchen` | Modern white kitchen | not credited (rawpixel public domain) | https://www.rawpixel.com/image/6042749/photo-image-public-domain-minimal-house | Residences card: 3-bed |
| `view-dusk-window` | City view at dusk through a window | World Travel Adventures (StockSnap) | https://stocksnap.io/photo/window-view-OY7XWKUNZG | Residences card: penthouse |
| `construction-cranes` | Tower cranes over a rising frame | 贝莉儿 NG (StockSnap) | https://stocksnap.io/photo/building-construction-QDDPZH3YSO | Dashboard construction update |

Residential plots have no photograph. A plot is land, so the plot card uses a procedural site-plan illustration drawn in code (see "Generated visuals").

The sources serve only reduced sizes to anonymous downloads (960–2048 px). The 960 px rendition is the largest we ship. A real tenant would supply its own photography through white-label settings (Stage 2+).

**Rejected during selection**
- Recognisable landmarks, which could imply a real development.
- Images with people's faces.
- Hotel rooms.
- Images where the licence on the landing page was not CC0 or CC BY.

## Fonts (SIL Open Font License 1.1, self-hosted via Fontsource)

| Font | Package | Role |
|---|---|---|
| Geist (variable) | `@fontsource-variable/geist` 5.3.0 | Interface text, financial figures |
| Geist Mono (variable) | `@fontsource-variable/geist-mono` 5.3.0 | References (INV-…, LH-A-…) |
| Newsreader (variable, optical sizes) | `@fontsource-variable/newsreader` 5.3.0 | Display headings, project names |
| Gulzar | `@fontsource/gulzar` 5.3.0 | Urdu display headings |
| Noto Naskh Arabic (variable) | `@fontsource-variable/noto-naskh-arabic` 5.3.0 | Urdu interface text |

## Generated visuals

| Visual | How it is made | Licence |
|---|---|---|
| Charts (collections, inventory, funnel, sparklines, progress) | SVG drawn in code with `d3-scale` and `d3-shape` | Ours |
| Plot site plan | SVG drawn in code (`packages/ui/src/property/PlotIllustration.tsx`) | Ours |
| Icons | `lucide-react` 1.61.0 | ISC |
